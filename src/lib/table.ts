/**
 * Reads cargo lists pasted from Excel / Google Sheets (tab-separated) or
 * uploaded as CSV, with Turkish or English headers, and writes them back.
 */
import { ITEM_COLORS, newItemId } from './presets';
import type { CargoItem, ItemKind } from './types';

export type LengthUnit = 'mm' | 'cm' | 'm';

type Field = 'name' | 'length' | 'width' | 'height' | 'weight' | 'quantity' | 'stackable' | 'rotatable' | 'stop' | 'kind';

const ORDER: Field[] = ['name', 'length', 'width', 'height', 'weight', 'quantity', 'stackable', 'rotatable', 'stop'];

const SYNONYMS: Record<Field, string[]> = {
  name: ['ad', 'adı', 'ürün', 'urun', 'yük', 'yuk', 'açıklama', 'name', 'item', 'description', 'product'],
  length: ['uzunluk', 'boy', 'en uzun', 'length', 'l'],
  width: ['genişlik', 'genislik', 'en', 'width', 'w'],
  height: ['yükseklik', 'yukseklik', 'height', 'h'],
  weight: ['ağırlık', 'agirlik', 'kg', 'weight', 'brüt', 'brut', 'gross'],
  quantity: ['adet', 'miktar', 'qty', 'quantity', 'count', 'pcs'],
  stackable: ['istif', 'istiflenebilir', 'üstüne konur', 'stackable', 'stack'],
  rotatable: ['döndür', 'dondur', 'döndürülebilir', 'rotatable', 'rotate'],
  stop: ['durak', 'teslimat', 'sıra', 'sira', 'stop', 'drop', 'delivery'],
  kind: ['tür', 'tur', 'tip', 'kind', 'type'],
};

const norm = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ');

function fieldFor(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  for (const field of Object.keys(SYNONYMS) as Field[]) {
    if (SYNONYMS[field].some((s) => h === s)) return field;
  }
  for (const field of Object.keys(SYNONYMS) as Field[]) {
    if (SYNONYMS[field].some((s) => s.length > 2 && h.startsWith(s))) return field;
  }
  return null;
}

/** Accepts "1200", "1.200", "1,2", "1 200", "1.200,5", "1,200.5". */
export function parseNumber(raw: string, dotIsDecimal = false): number | null {
  let s = raw.trim().replace(/\s| /g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{3}$/.test(s) && !/^0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (!dotIsDecimal && lastDot > -1 && /\.\d{3}$/.test(s) && !/^0\./.test(s)) {
    // "1.200" in Turkish Excel is twelve hundred.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = norm(raw);
  if (!v) return fallback;
  if (['evet', 'e', 'yes', 'y', 'true', '1', 'x', '✓', 'var'].includes(v)) return true;
  if (['hayır', 'hayir', 'h', 'no', 'n', 'false', '0', '-', 'yok'].includes(v)) return false;
  return fallback;
}

function inferKind(name: string, l: number, w: number, h: number, given?: string): ItemKind {
  const g = given ? norm(given) : '';
  if (g.startsWith('palet') || g.startsWith('pallet')) return 'pallet';
  if (g.startsWith('uzun') || g.startsWith('long')) return 'long';
  if (g.startsWith('koli') || g.startsWith('box') || g.startsWith('kutu')) return 'box';
  if (/palet|pallet/i.test(name)) return 'pallet';
  return Math.max(l, w) >= 3 * Math.max(Math.min(l, w), h) && Math.max(l, w) >= 1800 ? 'long' : 'box';
}

function splitRows(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const sample = lines.slice(0, 5).join('\n');
  const sep = sample.includes('\t') ? '\t' : (sample.match(/;/g) ?? []).length >= (sample.match(/,/g) ?? []).length / 2 && sample.includes(';') ? ';' : ',';
  return lines.map((line) => splitLine(line, sep));
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur === '') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface ParseResult {
  items: CargoItem[];
  skipped: number[];
}

export function parseTable(text: string, unit: LengthUnit, colorOffset = 0): ParseResult {
  const rows = splitRows(text);
  if (rows.length === 0) return { items: [], skipped: [] };

  const first = rows[0]!;
  const headerFields = first.map(fieldFor);
  const hasHeader = headerFields.filter(Boolean).length >= 2 && parseNumber(first[1] ?? '') === null;
  const columns: (Field | null)[] = hasHeader ? headerFields : ORDER.slice(0, first.length);
  const scale = unit === 'mm' ? 1 : unit === 'cm' ? 10 : 1000;

  const items: CargoItem[] = [];
  const skipped: number[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((row, i) => {
    const get = (f: Field) => {
      const idx = columns.indexOf(f);
      return idx === -1 ? undefined : row[idx];
    };
    // In metres "1.200" means 1.2 m, not twelve hundred.
    const dotIsDecimal = unit === 'm';
    const l = parseNumber(get('length') ?? '', dotIsDecimal);
    const w = parseNumber(get('width') ?? '', dotIsDecimal);
    const h = parseNumber(get('height') ?? '', dotIsDecimal);
    if (l === null || w === null || h === null || l <= 0 || w <= 0 || h <= 0) {
      skipped.push(i + (hasHeader ? 2 : 1));
      return;
    }
    const name = (get('name') ?? '').trim() || `#${items.length + 1}`;
    const length = Math.round(l * scale);
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);
    const kind = inferKind(name, length, width, height, get('kind'));
    items.push({
      id: newItemId(),
      name,
      kind,
      length,
      width,
      height,
      weight: Math.max(0, parseNumber(get('weight') ?? '') ?? 0),
      quantity: Math.max(0, Math.round(parseNumber(get('quantity') ?? '') ?? 1)),
      stackable: parseBool(get('stackable'), kind !== 'pallet'),
      rotatable: parseBool(get('rotatable'), true),
      stop: Math.max(1, Math.round(parseNumber(get('stop') ?? '') ?? 1)),
      color: ITEM_COLORS[(colorOffset + items.length) % ITEM_COLORS.length]!,
    });
  });
  return { items, skipped };
}

export function tableHeaders(lang: 'tr' | 'en'): string[] {
  return lang === 'tr'
    ? ['Ad', 'Uzunluk (mm)', 'Genişlik (mm)', 'Yükseklik (mm)', 'Ağırlık (kg)', 'Adet', 'İstiflenebilir', 'Döndürülebilir', 'Durak']
    : ['Name', 'Length (mm)', 'Width (mm)', 'Height (mm)', 'Weight (kg)', 'Qty', 'Stackable', 'Rotatable', 'Stop'];
}

/** CSV with BOM; `;` and Turkish booleans for Turkish Excel. Formula injection is neutralised. */
export function toCsv(items: CargoItem[], lang: 'tr' | 'en'): string {
  const sep = lang === 'tr' ? ';' : ',';
  const yes = lang === 'tr' ? 'Evet' : 'Yes';
  const no = lang === 'tr' ? 'Hayır' : 'No';
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((i) =>
    [i.name, i.length, i.width, i.height, i.weight, i.quantity, i.stackable ? yes : no, i.rotatable ? yes : no, i.stop].map(cell).join(sep),
  );
  return `﻿${[tableHeaders(lang).map(cell).join(sep), ...rows].join('\r\n')}\r\n`;
}
