import * as THREE from 'three';
import { PALLET_BASE } from '../../lib/presets';
import type { CargoItem, Placement } from '../../lib/types';
import { palletGeometry, tiledBox } from './geometry';
import { bundle, cartonFace, cartonGrid, wood } from './textures';
import { MM } from './vehicle';

export type Look = 'real' | 'schematic';

/** Unit cube anchored at its min corner, shared by every schematic box and carton. */
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0.5, 0.5, 0.5);
export const unitEdges = new THREE.EdgesGeometry(unitBox);

const shared = new Map<string, THREE.Material | THREE.Material[]>();
function sharedMat<T extends THREE.Material | THREE.Material[]>(key: string, create: () => T): T {
  let m = shared.get(key) as T | undefined;
  if (!m) {
    m = create();
    (Array.isArray(m) ? m : [m]).forEach((x) => (x.userData.shared = true));
    shared.set(key, m);
  }
  return m;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

function cartonMaterials(color: string): THREE.Material[] {
  return sharedMat(`carton:${color}`, () => {
    const side = std({ map: cartonFace(color, 'side'), roughness: 0.85 });
    const top = std({ map: cartonFace(color, 'top'), roughness: 0.8 });
    const plain = std({ map: cartonFace(color, 'plain'), roughness: 0.9 });
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z.
    return [side, side, top, plain, side, side];
  });
}

const woodMat = () => sharedMat('wood', () => std({ map: wood(), roughness: 0.85 }));
const gridMat = (color: string) => sharedMat(`grid:${color}`, () => std({ map: cartonGrid(color), roughness: 0.8 }));
const bundleMat = (color: string) => sharedMat(`bundle:${color}`, () => std({ map: bundle(color), roughness: 0.75 }));
/** Coloured stretch film, as used in warehouses to tell loads apart at a glance. */
const filmMat = (color: string) =>
  sharedMat(`film:${color}`, () =>
    new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: 0.58,
      roughness: 0.18,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      depthWrite: false,
    }),
  );
const flatMat = (color: string) => sharedMat(`flat:${color}`, () => std({ color, roughness: 0.75 }));

export interface CargoScene {
  group: THREE.Group;
  units: { seq: number; object: THREE.Object3D }[];
  pickables: THREE.Mesh[];
}

export function buildCargo(placements: Placement[], items: CargoItem[], colorFor: (p: Placement) => string, look: Look, dark: boolean, vehicleL: number, vehicleW: number): CargoScene {
  const group = new THREE.Group();
  group.position.set((-vehicleL * MM) / 2, 0, (-vehicleW * MM) / 2);
  const byId = new Map(items.map((i) => [i.id, i]));
  const units: CargoScene['units'] = [];
  const pickables: THREE.Mesh[] = [];
  const edgeMat = sharedMat(`edge:${dark}`, () => new THREE.LineBasicMaterial({ color: dark ? 0x0c0f12 : 0x1b232b, transparent: true, opacity: 0.55 }));

  for (const p of placements) {
    const item = byId.get(p.itemId);
    const kind = item?.kind ?? 'box';
    const color = colorFor(p);
    const unit = new THREE.Group();
    const gap = look === 'real' ? 8 : 6;
    unit.position.set((p.x + gap / 2) * MM, p.z * MM, (p.y + gap / 2) * MM);
    const l = (p.l - gap) * MM;
    const w = (p.w - gap) * MM;
    const h = (p.h - (look === 'real' ? 2 : gap)) * MM;
    let pick: THREE.Mesh;

    if (look === 'real') {
      if (kind === 'pallet') {
        const baseH = Math.min(PALLET_BASE * MM, h * 0.4);
        const base = new THREE.Mesh(palletGeometry(l, w, baseH), woodMat());
        base.castShadow = true;
        base.receiveShadow = true;
        unit.add(base);
        const inset = 0.012;
        const goods = new THREE.Mesh(tiledBox(l - 2 * inset, h - baseH, w - 2 * inset, 0.4, 0.3), gridMat(color));
        goods.position.set(inset, baseH, inset);
        goods.castShadow = true;
        goods.receiveShadow = true;
        unit.add(goods);
        const film = new THREE.Mesh(tiledBox(l - inset, h - baseH + 0.006, w - inset, 1), filmMat(color));
        film.position.set(inset / 2, baseH, inset / 2);
        film.renderOrder = 1;
        unit.add(film);
        pick = goods;
      } else if (kind === 'long') {
        pick = new THREE.Mesh(tiledBox(l, h, w, 0.8, 0.8), bundleMat(color));
        pick.castShadow = true;
        pick.receiveShadow = true;
        unit.add(pick);
      } else {
        pick = new THREE.Mesh(unitBox, cartonMaterials(color));
        pick.scale.set(l, h, w);
        pick.castShadow = true;
        pick.receiveShadow = true;
        unit.add(pick);
      }
    } else {
      const baseH = kind === 'pallet' ? Math.min(PALLET_BASE * MM, h * 0.4) : 0;
      if (baseH > 0) {
        const base = new THREE.Mesh(unitBox, flatMat('#b48a5c'));
        base.scale.set(l, baseH, w);
        base.castShadow = true;
        unit.add(base);
      }
      pick = new THREE.Mesh(unitBox, flatMat(color));
      pick.position.y = baseH;
      pick.scale.set(l, h - baseH, w);
      pick.castShadow = true;
      pick.receiveShadow = true;
      unit.add(pick);
      const edges = new THREE.LineSegments(unitEdges, edgeMat);
      edges.scale.set(l, h, w);
      unit.add(edges);
    }
    pick.userData.seq = p.seq;
    pickables.push(pick);
    group.add(unit);
    units.push({ seq: p.seq, object: unit });
  }
  return { group, units, pickables };
}
