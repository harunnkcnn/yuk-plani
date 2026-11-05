/**
 * Plans are shared as a compressed URL fragment (#p=…). The fragment is never
 * sent to a server, so a shared link carries the plan without any backend.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { ITEM_COLORS, newItemId, vehiclePreset } from './presets';
import type { CargoItem, ItemKind, PlanOptions, Vehicle, VehicleKind } from './types';

export interface SharedState {
  vehicle: Vehicle;
  items: CargoItem[];
  options: PlanOptions;
  title: string;
}

type ItemRow = [string, ItemKind, number, number, number, number, number, 0 | 1, 0 | 1, number, string];

interface Payload {
  v: 1;
  t: string;
  veh: [string, VehicleKind, number, number, number, number, number?, number?];
  it: ItemRow[];
  o: [0 | 1, number];
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function encodeState(state: SharedState): string {
  const v = state.vehicle;
  const payload: Payload = {
    v: 1,
    t: state.title,
    veh: [v.presetId, v.kind, v.length, v.width, v.height, v.payload, v.kingpinX, v.axleX],
    it: state.items.map((i) => [i.name, i.kind, i.length, i.width, i.height, i.weight, i.quantity, i.stackable ? 1 : 0, i.rotatable ? 1 : 0, i.stop, i.color]),
    o: [state.options.respectStops ? 1 : 0, state.options.minSupport],
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }));
}

const num = (n: unknown, min: number, max: number, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
const KINDS: ItemKind[] = ['pallet', 'box', 'long'];
const VKINDS: VehicleKind[] = ['semi', 'truck', 'van', 'container'];

/** Returns null for anything malformed; values are clamped to sane ranges. */
export function decodeState(text: string): SharedState | null {
  try {
    const data = JSON.parse(strFromU8(inflateSync(fromBase64Url(text)))) as Payload;
    if (data.v !== 1 || !Array.isArray(data.it) || !Array.isArray(data.veh)) return null;
    const [presetId, kind, length, width, height, payload, kingpinX, axleX] = data.veh;
    const base = vehiclePreset(String(presetId));
    const vehicle: Vehicle = {
      presetId: base.presetId === presetId ? presetId : 'custom',
      kind: VKINDS.includes(kind) ? kind : base.kind,
      length: num(length, 100, 30000, base.length),
      width: num(width, 100, 5000, base.width),
      height: num(height, 100, 5000, base.height),
      payload: num(payload, 1, 100000, base.payload),
    };
    if (vehicle.kind === 'semi') {
      vehicle.kingpinX = num(kingpinX, 0, vehicle.length, base.kingpinX ?? 1600);
      vehicle.axleX = num(axleX, 0, vehicle.length, base.axleX ?? 9300);
    }
    const items: CargoItem[] = data.it.slice(0, 200).map((r, i) => ({
      id: newItemId(),
      name: String(r[0] ?? '').slice(0, 80),
      kind: KINDS.includes(r[1]) ? r[1] : 'box',
      length: num(r[2], 1, 30000, 1000),
      width: num(r[3], 1, 5000, 1000),
      height: num(r[4], 1, 5000, 1000),
      weight: num(r[5], 0, 100000, 0),
      quantity: Math.round(num(r[6], 0, 2500, 1)),
      stackable: r[7] === 1,
      rotatable: r[8] === 1,
      stop: Math.round(num(r[9], 1, 99, 1)),
      color: /^#[0-9a-f]{6}$/i.test(String(r[10])) ? String(r[10]) : ITEM_COLORS[i % ITEM_COLORS.length]!,
    }));
    return {
      vehicle,
      items,
      options: { respectStops: data.o?.[0] !== 0, minSupport: num(data.o?.[1], 0.5, 1, 0.75) },
      title: String(data.t ?? '').slice(0, 120),
    };
  } catch {
    return null;
  }
}
