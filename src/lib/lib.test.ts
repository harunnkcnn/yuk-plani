import { describe, expect, it } from 'vitest';
import { computeBalance } from './balance';
import { DEFAULT_OPTIONS, plan } from './pack';
import { itemFromTemplate, sampleItems, vehiclePreset } from './presets';
import { decodeState, encodeState } from './share';
import { parseNumber, parseTable, toCsv } from './table';
import type { CargoItem, Placement, PlanResult, Vehicle } from './types';

const tir = vehiclePreset('tir');

function item(over: Partial<CargoItem>): CargoItem {
  return { ...itemFromTemplate('euro', 'x', 0), ...over };
}

/** Independent validation of every hard rule, so tests don't trust the planner's own checks. */
function assertValid(v: Vehicle, r: PlanResult, items: CargoItem[], respectStops = true) {
  const eps = 0.5;
  const byId = new Map(items.map((i) => [i.id, i]));
  const ps = r.placements;
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(-eps);
    expect(p.y).toBeGreaterThanOrEqual(-eps);
    expect(p.z).toBeGreaterThanOrEqual(-eps);
    expect(p.x + p.l).toBeLessThanOrEqual(v.length + eps);
    expect(p.y + p.w).toBeLessThanOrEqual(v.width + eps);
    expect(p.z + p.h).toBeLessThanOrEqual(v.height + eps);
    const src = byId.get(p.itemId)!;
    expect(p.h).toBe(src.height);
    if (!src.rotatable) expect(p.rotated).toBe(false);
  }
  const ov = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!;
    let support = 0;
    for (let j = 0; j < ps.length; j++) {
      if (i === j) continue;
      const b = ps[j]!;
      const ox = ov(a.x, a.x + a.l, b.x, b.x + b.l);
      const oy = ov(a.y, a.y + a.w, b.y, b.y + b.w);
      const oz = ov(a.z, a.z + a.h, b.z, b.z + b.h);
      expect(ox > eps && oy > eps && oz > eps, `units ${a.seq} and ${b.seq} overlap`).toBe(false);
      if (a.z > eps && ox > eps && oy > eps && Math.abs(b.z + b.h - a.z) <= eps) {
        expect(byId.get(b.itemId)!.stackable, `unit ${a.seq} rests on non-stackable ${b.seq}`).toBe(true);
        support += ox * oy;
      }
      if (respectStops && b.stop > a.stop && b.x >= a.x + a.l - eps && oy > eps && oz > eps) {
        throw new Error(`unit ${a.seq} (stop ${a.stop}) is blocked by ${b.seq} (stop ${b.stop})`);
      }
    }
    if (a.z > eps) expect(support).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.minSupport * a.l * a.w - eps);
  }
  expect(r.loadedWeight).toBeLessThanOrEqual(v.payload + 1e-6);
}

describe('plan', () => {
  it('fits 34 Euro pallets 2 abreast in a 13.6 m trailer (0.4 LDM each)', () => {
    const items = [item({ quantity: 35, weight: 400 })];
    const r = plan(tir, items);
    assertValid(tir, r, items);
    expect(r.placements).toHaveLength(34);
    expect(r.unplaced).toEqual([{ itemId: items[0]!.id, reason: 'noSpace', count: 1 }]);
    expect(r.placements.every((p) => p.z === 0)).toBe(true);
    expect(r.ldm).toBe(13.6);
  });

  it('fits 33 Euro pallets 3 abreast when turning is not allowed', () => {
    const items = [item({ quantity: 35, weight: 400, rotatable: false })];
    const r = plan(tir, items);
    assertValid(tir, r, items);
    expect(r.placements).toHaveLength(33);
    expect(r.ldm).toBe(13.2);
  });

  it('fits 26 industrial pallets (1200×1000) in a 13.6 m trailer', () => {
    const items = [item({ length: 1200, width: 1000, quantity: 30, weight: 300 })];
    const r = plan(tir, items);
    assertValid(tir, r, items);
    expect(r.placements).toHaveLength(26);
  });

  it('stacks stackable pallets and never stacks on non-stackable ones', () => {
    const stack = [item({ height: 1200, quantity: 70, stackable: true, weight: 300 })];
    const r1 = plan(tir, stack);
    assertValid(tir, r1, stack);
    expect(r1.placements).toHaveLength(68);

    const flat = [item({ height: 1200, quantity: 70, stackable: false, weight: 300 })];
    const r2 = plan(tir, flat);
    assertValid(tir, r2, flat);
    expect(r2.placements).toHaveLength(34);
  });

  it('respects payload and reports overweight units', () => {
    const items = [item({ quantity: 30, weight: 1000 })];
    const r = plan(tir, items);
    expect(r.placements).toHaveLength(24);
    expect(r.unplaced).toEqual([{ itemId: items[0]!.id, reason: 'overweight', count: 6 }]);
  });

  it('rejects units larger than the cargo space', () => {
    const items = [item({ length: 14000, quantity: 2 })];
    const r = plan(tir, items);
    expect(r.placements).toHaveLength(0);
    expect(r.unplaced[0]).toMatchObject({ reason: 'tooLarge', count: 2 });
  });

  it('uses 90° rotation only when allowed', () => {
    const van = vehiclePreset('van');
    const long = [item({ length: 1700, width: 3500, height: 200, quantity: 1, rotatable: false })];
    expect(plan(van, long).placements).toHaveLength(0);
    const turned = plan(van, [{ ...long[0]!, rotatable: true }]);
    expect(turned.placements).toHaveLength(1);
    expect(turned.placements[0]!.rotated).toBe(true);
  });

  it('loads later stops deeper and never blocks an earlier stop', () => {
    const items = [
      item({ name: 'A', quantity: 10, stop: 1, weight: 200 }),
      item({ name: 'B', quantity: 10, stop: 2, weight: 200 }),
      item({ name: 'C', quantity: 10, stop: 3, weight: 200 }),
    ];
    const r = plan(tir, items);
    assertValid(tir, r, items);
    expect(r.placements).toHaveLength(30);
    const maxX = (stop: number) => Math.max(...r.placements.filter((p) => p.stop === stop).map((p) => p.x + p.l));
    const minX = (stop: number) => Math.min(...r.placements.filter((p) => p.stop === stop).map((p) => p.x));
    expect(maxX(3)).toBeLessThanOrEqual(minX(1) + 1);
    expect(r.placements[0]!.stop).toBe(3);
  });

  it('packs the mixed sample shipment validly and quickly', () => {
    const items = sampleItems('tr');
    const r = plan(tir, items);
    assertValid(tir, r, items);
    expect(r.placements).toHaveLength(r.totalUnits);
    expect(r.elapsed).toBeLessThan(3000);
  });

  it('handles hundreds of cartons in a container', () => {
    const c40 = vehiclePreset('c40');
    // 600×400×400 cartons: ~550 is the practical optimum in a 40' DC (5 layers of 110).
    const items = [itemFromTemplate('box', 'koli', 0)].map((i) => ({ ...i, quantity: 700 }));
    const r = plan(c40, items);
    assertValid(c40, r, items);
    expect(r.placements.length).toBeGreaterThanOrEqual(500);
    expect(r.elapsed).toBeLessThan(15000);
  });
});

describe('balance', () => {
  it('splits a centred load between kingpin and axles', () => {
    const p: Placement = { seq: 0, itemId: 'a', unit: 0, x: 5000, y: 840, z: 0, l: 800, w: 800, h: 1000, weight: 1000, stop: 1, rotated: false };
    const b = computeBalance(tir, [p])!;
    expect(b.cogX).toBe(5400);
    expect(Math.round(b.lateralOffset)).toBe(0);
    // Beam on supports at 1600 (kingpin) and 9300 (axles): (9300-5400)/7700 of 1000 kg.
    expect(Math.round(b.kingpinLoad!)).toBe(506);
    expect(Math.round(b.axleLoad!)).toBe(494);
  });
});

describe('table import', () => {
  it('parses Turkish numbers', () => {
    expect(parseNumber('1.200')).toBe(1200);
    expect(parseNumber('1,2')).toBe(1.2);
    expect(parseNumber('1.200,5')).toBe(1200.5);
    expect(parseNumber('1,200.5')).toBe(1200.5);
    expect(parseNumber('1.200', true)).toBe(1.2);
    expect(parseNumber('abc')).toBeNull();
  });

  it('reads an Excel paste with Turkish headers in cm', () => {
    const text = 'Ad\tUzunluk\tGenişlik\tYükseklik\tAğırlık\tAdet\tİstif\tDurak\nAkü paleti\t120\t80\t105\t720\t8\tHayır\t2\nKoli\t60\t40\t40\t18\t60\tEvet\t1\nboş satır\t\t\t\n';
    const { items, skipped } = parseTable(text, 'cm');
    expect(skipped).toEqual([4]);
    expect(items.map((i) => [i.name, i.kind, i.length, i.width, i.height, i.weight, i.quantity, i.stackable, i.stop])).toEqual([
      ['Akü paleti', 'pallet', 1200, 800, 1050, 720, 8, false, 2],
      ['Koli', 'box', 600, 400, 400, 18, 60, true, 1],
    ]);
  });

  it('reads headerless rows in the template order', () => {
    const { items } = parseTable('Boru;2400;400;300;35;12;evet;hayır;3', 'mm');
    expect(items[0]).toMatchObject({ name: 'Boru', kind: 'long', quantity: 12, stackable: true, rotatable: false, stop: 3 });
  });

  it('round-trips through CSV and neutralises formulas', () => {
    const items = [{ ...itemFromTemplate('box', '=HYPERLINK("x")', 0), quantity: 3 }];
    const csv = toCsv(items, 'tr');
    expect(csv).toContain(`"'=HYPERLINK(""x"")";600;400;400;15;3;Evet;Evet;1`);
    const back = parseTable(csv.replace(/^﻿/, ''), 'mm').items[0]!;
    expect(back).toMatchObject({ length: 600, width: 400, height: 400, quantity: 3, stackable: true });
  });
});

describe('share links', () => {
  it('round-trips a plan and rejects garbage', () => {
    const state = { vehicle: tir, items: sampleItems('tr'), options: DEFAULT_OPTIONS, title: 'Ankara seferi' };
    const back = decodeState(encodeState(state))!;
    expect(back.title).toBe('Ankara seferi');
    expect(back.vehicle).toEqual(tir);
    expect(back.items.map(({ id: _id, ...rest }) => rest)).toEqual(state.items.map(({ id: _id, ...rest }) => rest));
    expect(decodeState('not-a-plan')).toBeNull();
  });
});
