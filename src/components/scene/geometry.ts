import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Box anchored at its min corner whose UVs are in real-world units, so a
 * repeating texture shows one tile per `tile` metres on every face.
 */
export function tiledBox(l: number, h: number, w: number, tileX: number, tileY = tileX): THREE.BufferGeometry {
  const key = `tb:${l.toFixed(3)}:${h.toFixed(3)}:${w.toFixed(3)}:${tileX}:${tileY}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const geo = new THREE.BoxGeometry(l, h, w);
  geo.translate(l / 2, h / 2, w / 2);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const faces: [number, number][] = [
    [w, h],
    [w, h],
    [l, w],
    [l, w],
    [l, h],
    [l, h],
  ];
  faces.forEach(([fw, fh], f) => {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (fw / tileX), uv.getY(i) * (fh / tileY));
    }
  });
  uv.needsUpdate = true;
  geoCache.set(key, geo);
  return geo;
}

function board(x: number, y: number, z: number, l: number, h: number, w: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(l, h, w);
  g.translate(x + l / 2, y + h / 2, z + w / 2);
  return g;
}

/**
 * EPAL-style pallet: bottom runners, nine blocks, stringer boards and top
 * deck boards running along the longer side. Metres; anchored at min corner.
 */
export function palletGeometry(l: number, w: number, height: number): THREE.BufferGeometry {
  const key = `pal:${l.toFixed(3)}:${w.toFixed(3)}:${height.toFixed(3)}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const alongX = l >= w;
  const long = alongX ? l : w;
  const short = alongX ? w : l;
  const t = height * (22 / 144);
  const block = height - 3 * t;
  const parts: THREE.BufferGeometry[] = [];
  const put = (a: number, y: number, b: number, la: number, h: number, lb: number) =>
    parts.push(alongX ? board(a, y, b, la, h, lb) : board(b, y, a, lb, h, la));

  const bw = Math.min(0.145, short / 6);
  const rows = [0, (short - bw) / 2, short - bw];
  for (const b of rows) put(0, 0, b, long, t, bw);
  const cols = [0, (long - bw) / 2, long - bw];
  for (const a of cols) for (const b of rows) put(a, t, b, bw, block, bw);
  for (const a of cols) put(a, t + block, 0, bw, t, short);
  const deck = Math.max(3, Math.round(short / 0.17));
  const dw = Math.min(0.145, (short / deck) * 0.78);
  for (let i = 0; i < deck; i++) put(0, 2 * t + block, (i * (short - dw)) / (deck - 1), long, t, dw);

  const merged = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geoCache.set(key, merged);
  return merged;
}

export function box(l: number, h: number, w: number): THREE.BufferGeometry {
  const key = `b:${l}:${h}:${w}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = new THREE.BoxGeometry(l, h, w);
  geoCache.set(key, g);
  return g;
}

export function isCached(geo: THREE.BufferGeometry): boolean {
  for (const g of geoCache.values()) if (g === geo) return true;
  return false;
}
