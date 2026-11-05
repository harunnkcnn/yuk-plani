/**
 * Heuristic 3D load planner (extreme-point method with wall building).
 *
 * Units are placed one by one at the "extreme point" that is furthest towards
 * the front wall, then lowest, then leftmost. Hard rules:
 *   - inside the cargo space, no overlap
 *   - upright only: units may turn 90° on the floor, never tip over
 *   - a unit above the floor needs `minSupport` of its base resting on cargo
 *     whose top is exactly at its bottom, and every supporting unit must be stackable
 *   - total weight ≤ payload
 *   - with `respectStops`: later stops are loaded first (deepest) and no unit is
 *     ever placed so that a unit for a later stop sits between it and the door
 *
 * The result is good, not provably optimal: 3D packing is NP-hard.
 */
import type { CargoItem, Placement, PlanOptions, PlanResult, Unplaced, UnplacedReason, Vehicle } from './types';
import { computeBalance } from './balance';

export const MAX_UNITS = 2500;
const EPS = 0.5;

export const DEFAULT_OPTIONS: PlanOptions = { respectStops: true, minSupport: 0.75 };

interface Unit {
  itemId: string;
  unit: number;
  order: number;
  l: number;
  w: number;
  h: number;
  weight: number;
  stop: number;
  stackable: boolean;
  rotatable: boolean;
}

interface Box extends Placement {
  stackable: boolean;
}

interface Point {
  x: number;
  y: number;
  z: number;
  /** Oriented dimensions known to fail here permanently; anything at least as large fails too. */
  failed: [number, number, number][];
}

export function isValidItem(item: CargoItem): boolean {
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  return positive(item.length) && positive(item.width) && positive(item.height) && Number.isFinite(item.weight) && item.weight >= 0 && Number.isInteger(item.quantity) && item.quantity >= 0;
}

function orientations(u: Pick<Unit, 'l' | 'w' | 'h' | 'rotatable'>): [number, number, number][] {
  const list: [number, number, number][] = [[u.l, u.w, u.h]];
  if (u.rotatable && Math.abs(u.l - u.w) > EPS) list.push([u.w, u.l, u.h]);
  return list;
}

/**
 * Which way round a unit is tried first. Ties between orientations at the same
 * point keep the first, so this decides e.g. whether Euro pallets go 3 abreast
 * (33 per 13.6 m) or 2 abreast (34).
 */
type Strategy = 'asGiven' | 'turned' | 'bestWidth';
const STRATEGIES: Strategy[] = ['bestWidth', 'turned', 'asGiven'];

function orderedOrientations(u: Unit, strategy: Strategy, width: number): [number, number, number][] {
  const list = orientations(u);
  if (list.length < 2 || strategy === 'asGiven') return list;
  if (strategy === 'turned') return [list[1]!, list[0]!];
  // Prefer the orientation that wastes the least width across the vehicle, then the shorter depth.
  const waste = ([, w]: [number, number, number]) => width - Math.floor((width + EPS) / w) * w;
  return [...list].sort((a, b) => waste(a) - waste(b) || a[0] - b[0]);
}

function fitsEmpty(v: Vehicle, u: Pick<Unit, 'l' | 'w' | 'h' | 'rotatable'>): boolean {
  return orientations(u).some(([l, w, h]) => l <= v.length + EPS && w <= v.width + EPS && h <= v.height + EPS);
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Runs each orientation strategy and keeps the plan that loads the most, then the shortest. */
export function plan(vehicle: Vehicle, items: CargoItem[], options: PlanOptions = DEFAULT_OPTIONS): PlanResult {
  const started = performance.now();
  let best: PlanResult | null = null;
  for (const strategy of STRATEGIES) {
    const r = planOnce(vehicle, items, options, strategy);
    if (
      !best ||
      r.placements.length > best.placements.length ||
      (r.placements.length === best.placements.length &&
        (r.loadedVolume > best.loadedVolume + 1 || (Math.abs(r.loadedVolume - best.loadedVolume) <= 1 && r.usedLength < best.usedLength - EPS)))
    ) {
      best = r;
    }
  }
  return { ...best!, elapsed: Math.round(performance.now() - started) };
}

function planOnce(vehicle: Vehicle, items: CargoItem[], options: PlanOptions, strategy: Strategy): PlanResult {
  const started = performance.now();
  const L = vehicle.length;
  const W = vehicle.width;
  const H = vehicle.height;
  const unplacedMap = new Map<string, Unplaced>();
  const miss = (itemId: string, reason: UnplacedReason, count = 1) => {
    const key = `${itemId}:${reason}`;
    const entry = unplacedMap.get(key) ?? { itemId, reason, count: 0 };
    entry.count += count;
    unplacedMap.set(key, entry);
  };

  // 1. Expand items into units, rejecting the impossible up front.
  const units: Unit[] = [];
  let totalUnits = 0;
  items.forEach((item, order) => {
    if (!isValidItem(item)) {
      miss(item.id, 'invalid', Math.max(1, Math.floor(item.quantity) || 1));
      return;
    }
    totalUnits += item.quantity;
    const proto = { l: item.length, w: item.width, h: item.height, rotatable: item.rotatable };
    if (!fitsEmpty(vehicle, proto)) {
      miss(item.id, 'tooLarge', item.quantity);
      return;
    }
    for (let n = 0; n < item.quantity; n++) {
      if (units.length >= MAX_UNITS) {
        miss(item.id, 'invalid', item.quantity - n);
        return;
      }
      units.push({
        itemId: item.id,
        unit: n,
        order,
        ...proto,
        weight: item.weight,
        stop: Math.max(1, Math.round(item.stop) || 1),
        stackable: item.stackable,
      });
    }
  });

  // 2. Later stops first (deepest); within a stop, big footprints and tall units first.
  units.sort(
    (a, b) =>
      (options.respectStops ? b.stop - a.stop : 0) ||
      b.l * b.w - a.l * a.w ||
      b.h - a.h ||
      b.weight - a.weight ||
      a.order - b.order ||
      a.unit - b.unit,
  );

  const boxes: Box[] = [];
  let points: Point[] = [{ x: 0, y: 0, z: 0, failed: [] }];
  let loadedWeight = 0;

  const insidePlaced = (x: number, y: number, z: number) =>
    boxes.some((b) => x >= b.x - EPS && x < b.x + b.l - EPS && y >= b.y - EPS && y < b.y + b.w - EPS && z >= b.z - EPS && z < b.z + b.h - EPS);

  /** 'ok' | 'retry' (may fit later, e.g. once more support exists) | 'never' (fails for anything at least this large). */
  const test = (p: Point, l: number, w: number, h: number, u: Unit): 'ok' | 'retry' | 'never' => {
    if (p.x + l > L + EPS || p.y + w > W + EPS || p.z + h > H + EPS) return 'never';
    let supported = 0;
    for (const b of boxes) {
      const ox = overlap1(p.x, p.x + l, b.x, b.x + b.l);
      const oy = overlap1(p.y, p.y + w, b.y, b.y + b.w);
      if (ox <= EPS || oy <= EPS) continue;
      const oz = overlap1(p.z, p.z + h, b.z, b.z + b.h);
      if (oz > EPS) return 'never';
      if (p.z > EPS && Math.abs(b.z + b.h - p.z) <= EPS) {
        if (!b.stackable) return 'never';
        supported += ox * oy;
      }
    }
    if (p.z > EPS && supported < options.minSupport * l * w - EPS) return 'retry';
    if (options.respectStops) {
      // LIFO: nothing for a later stop may sit between this unit and the door.
      for (const b of boxes) {
        if (b.stop <= u.stop || b.x < p.x + l - EPS) continue;
        if (overlap1(p.y, p.y + w, b.y, b.y + b.w) > EPS && overlap1(p.z, p.z + h, b.z, b.z + b.h) > EPS) return 'never';
      }
    }
    return 'ok';
  };

  const better = (a: Point, b: Point) => a.x < b.x - EPS || (Math.abs(a.x - b.x) <= EPS && (a.z < b.z - EPS || (Math.abs(a.z - b.z) <= EPS && a.y < b.y - EPS)));

  const project = (x: number, y: number, z: number, axis: 'x' | 'y' | 'z'): number => {
    let edge = 0;
    for (const b of boxes) {
      if (axis === 'x') {
        if (y >= b.y - EPS && y < b.y + b.w - EPS && z >= b.z - EPS && z < b.z + b.h - EPS && b.x + b.l <= x + EPS) edge = Math.max(edge, b.x + b.l);
      } else if (axis === 'y') {
        if (x >= b.x - EPS && x < b.x + b.l - EPS && z >= b.z - EPS && z < b.z + b.h - EPS && b.y + b.w <= y + EPS) edge = Math.max(edge, b.y + b.w);
      } else if (x >= b.x - EPS && x < b.x + b.l - EPS && y >= b.y - EPS && y < b.y + b.w - EPS && b.z + b.h <= z + EPS) {
        edge = Math.max(edge, b.z + b.h);
      }
    }
    return edge;
  };

  const addPoint = (x: number, y: number, z: number, into: Map<string, Point>) => {
    if (x >= L - EPS || y >= W - EPS || z >= H - EPS) return;
    const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
    if (into.has(key) || insidePlaced(x, y, z)) return;
    into.set(key, { x, y, z, failed: [] });
  };

  for (const u of units) {
    if (loadedWeight + u.weight > vehicle.payload + 1e-6) {
      miss(u.itemId, 'overweight');
      continue;
    }
    let best: { p: Point; l: number; w: number; h: number } | null = null;
    for (const [l, w, h] of orderedOrientations(u, strategy, W)) {
      for (const p of points) {
        if (best && !better(p, best.p)) break;
        if (p.failed.some(([fl, fw, fh]) => l >= fl - EPS && w >= fw - EPS && h >= fh - EPS)) continue;
        const result = test(p, l, w, h, u);
        if (result === 'ok') {
          best = { p, l, w, h };
          break;
        }
        if (result === 'never' && p.failed.length < 8) p.failed.push([l, w, h]);
      }
    }
    if (!best) {
      miss(u.itemId, 'noSpace');
      continue;
    }

    const { p, l, w, h } = best;
    const box: Box = {
      seq: boxes.length,
      itemId: u.itemId,
      unit: u.unit,
      x: p.x,
      y: p.y,
      z: p.z,
      l,
      w,
      h,
      weight: u.weight,
      stop: u.stop,
      rotated: Math.abs(l - u.l) > EPS,
      stackable: u.stackable,
    };
    boxes.push(box);
    loadedWeight += u.weight;

    // Keep points that are not swallowed by the new box, then add its extreme points.
    const next = new Map<string, Point>();
    for (const q of points) {
      const inside =
        q.x >= box.x - EPS && q.x < box.x + l - EPS && q.y >= box.y - EPS && q.y < box.y + w - EPS && q.z >= box.z - EPS && q.z < box.z + h - EPS;
      if (!inside) next.set(`${Math.round(q.x)}|${Math.round(q.y)}|${Math.round(q.z)}`, q);
    }
    const corners: [number, number, number][] = [
      [box.x + l, box.y, box.z],
      [box.x, box.y + w, box.z],
      [box.x, box.y, box.z + h],
    ];
    for (const [cx, cy, cz] of corners) {
      addPoint(cx, cy, cz, next);
      addPoint(project(cx, cy, cz, 'x'), cy, cz, next);
      addPoint(cx, project(cx, cy, cz, 'y'), cz, next);
      if (cz > EPS) addPoint(cx, cy, project(cx, cy, cz, 'z'), next);
    }
    points = [...next.values()].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  }

  const placements: Placement[] = boxes.map(({ stackable: _s, ...rest }) => rest);
  const usedLength = placements.reduce((m, b) => Math.max(m, b.x + b.l), 0);
  return {
    placements,
    unplaced: [...unplacedMap.values()],
    totalUnits,
    loadedWeight,
    loadedVolume: placements.reduce((s, b) => s + b.l * b.w * b.h, 0),
    ldm: Math.round((usedLength / 1000) * Math.min(1, vehicle.width / 2400) * 100) / 100,
    usedLength,
    balance: computeBalance(vehicle, placements),
    elapsed: Math.round(performance.now() - started),
  };
}
