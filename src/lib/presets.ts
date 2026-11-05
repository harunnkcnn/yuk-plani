import type { CargoItem, ItemKind, Vehicle } from './types';

/**
 * Typical internal dimensions. Bodies vary by manufacturer, so every value is
 * editable in the UI. Container values are ISO 668 typical internal sizes.
 */
export const VEHICLE_PRESETS: readonly Vehicle[] = [
  // EU 96/53/EC caps kingpin → rear at 12.00 m, so on a 13.6 m trailer the kingpin
  // sits ~1.6 m behind the front wall. The tri-axle centre is a typical value.
  { presetId: 'tir', kind: 'semi', length: 13600, width: 2480, height: 2700, payload: 24000, kingpinX: 1600, axleX: 9300 },
  { presetId: 'tirMega', kind: 'semi', length: 13600, width: 2480, height: 3000, payload: 24000, kingpinX: 1600, axleX: 9300 },
  { presetId: 'truck', kind: 'truck', length: 8000, width: 2450, height: 2600, payload: 12000 },
  { presetId: 'van', kind: 'van', length: 3700, width: 1800, height: 1900, payload: 1400 },
  { presetId: 'c20', kind: 'container', length: 5898, width: 2352, height: 2393, payload: 28200 },
  { presetId: 'c40', kind: 'container', length: 12032, width: 2352, height: 2393, payload: 26700 },
  { presetId: 'c40hc', kind: 'container', length: 12032, width: 2352, height: 2698, payload: 26500 },
];

export function vehiclePreset(id: string): Vehicle {
  return { ...(VEHICLE_PRESETS.find((v) => v.presetId === id) ?? VEHICLE_PRESETS[0]!) };
}

/** Pallet base height (EUR/EPAL 1, ISO 6780). */
export const PALLET_BASE = 144;

export interface ItemTemplate {
  templateId: string;
  kind: ItemKind;
  length: number;
  width: number;
  height: number;
  weight: number;
  stackable: boolean;
}

export const ITEM_TEMPLATES: readonly ItemTemplate[] = [
  { templateId: 'euro', kind: 'pallet', length: 1200, width: 800, height: 1200, weight: 500, stackable: false },
  { templateId: 'industrial', kind: 'pallet', length: 1200, width: 1000, height: 1200, weight: 600, stackable: false },
  { templateId: 'box', kind: 'box', length: 600, width: 400, height: 400, weight: 15, stackable: true },
  { templateId: 'long', kind: 'long', length: 2400, width: 400, height: 300, weight: 40, stackable: true },
];

/** Colour-blind-friendly categorical palette, legible on light and dark viewers. */
export const ITEM_COLORS = ['#3b82c4', '#e0a030', '#4aa37a', '#c8553d', '#8a6cc7', '#2fa3a8', '#c46aa1', '#7d8c3a', '#b07a4a', '#5d79b8'];

export const STOP_COLORS = ['#e0a030', '#3b82c4', '#c8553d', '#4aa37a', '#8a6cc7', '#2fa3a8', '#c46aa1', '#7d8c3a'];

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}`;
}

export function itemFromTemplate(templateId: string, name: string, index: number): CargoItem {
  const t = ITEM_TEMPLATES.find((x) => x.templateId === templateId) ?? ITEM_TEMPLATES[0]!;
  return {
    id: newItemId(),
    name,
    kind: t.kind,
    length: t.length,
    width: t.width,
    height: t.height,
    weight: t.weight,
    quantity: 1,
    stackable: t.stackable,
    rotatable: true,
    stop: 1,
    color: ITEM_COLORS[index % ITEM_COLORS.length]!,
  };
}

/** A realistic mixed shipment so the 3D view is never empty on first visit. Fictional. */
export function sampleItems(lang: 'tr' | 'en'): CargoItem[] {
  const tr = lang === 'tr';
  const rows: Omit<CargoItem, 'id' | 'color'>[] = [
    { name: tr ? 'Akü paleti' : 'Battery pallet', kind: 'pallet', length: 1200, width: 800, height: 1050, weight: 720, quantity: 8, stackable: false, rotatable: true, stop: 2 },
    { name: tr ? 'Lastik paleti' : 'Tyre pallet', kind: 'pallet', length: 1200, width: 1000, height: 1800, weight: 380, quantity: 6, stackable: false, rotatable: true, stop: 2 },
    { name: tr ? 'Fren balatası kolisi' : 'Brake pad carton', kind: 'box', length: 600, width: 400, height: 400, weight: 18, quantity: 60, stackable: true, rotatable: true, stop: 1 },
    { name: tr ? 'Filtre kolisi' : 'Filter carton', kind: 'box', length: 400, width: 300, height: 300, weight: 7, quantity: 80, stackable: true, rotatable: true, stop: 1 },
    { name: tr ? 'Egzoz borusu' : 'Exhaust pipe', kind: 'long', length: 2400, width: 400, height: 300, weight: 35, quantity: 12, stackable: true, rotatable: false, stop: 3 },
    { name: tr ? 'Yağ paleti' : 'Engine oil pallet', kind: 'pallet', length: 1200, width: 800, height: 900, weight: 860, quantity: 6, stackable: false, rotatable: true, stop: 3 },
  ];
  return rows.map((r, i) => ({ ...r, id: newItemId(), color: ITEM_COLORS[i % ITEM_COLORS.length]! }));
}
