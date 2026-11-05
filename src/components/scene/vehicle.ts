/**
 * 3D vehicles. Local frame in metres: x runs from the front wall (0) to the
 * doors (L), y is up with the cargo floor at 0, z runs across (0 = far side).
 * The near side (z = W) is left open so the cargo stays visible.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Vehicle } from '../../lib/types';
import { tiledBox } from './geometry';
import { asphalt, corrugation, deckFloor, hazard, tarp } from './textures';

export const MM = 1 / 1000;

export function deckHeight(v: Vehicle): number {
  return v.kind === 'semi' ? 1.15 : v.kind === 'truck' ? 1.1 : v.kind === 'van' ? 0.6 : 1.3;
}

type MatOpts = { metalness?: number; roughness?: number; emissive?: string; map?: THREE.Texture; bumpMap?: THREE.Texture; side?: THREE.Side };

class Parts {
  readonly group = new THREE.Group();
  private mats = new Map<string, THREE.MeshStandardMaterial>();

  mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${o.metalness ?? 0}|${o.roughness ?? 0.7}|${o.emissive ?? ''}|${o.map?.uuid ?? ''}|${o.bumpMap?.uuid ?? ''}|${o.side ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        metalness: o.metalness ?? 0,
        roughness: o.roughness ?? 0.7,
        map: o.map ?? null,
        bumpMap: o.bumpMap ?? null,
        bumpScale: o.bumpMap ? 2.5 : 1,
        side: o.side ?? THREE.FrontSide,
      });
      if (o.emissive) {
        m.emissive = new THREE.Color(o.emissive);
        m.emissiveIntensity = 0.9;
      }
      this.mats.set(key, m);
    }
    return m;
  }

  /** Box by its min corner and size. */
  box(x: number, y: number, z: number, l: number, h: number, w: number, material: THREE.Material, shadow = true): THREE.Mesh {
    const geo = new THREE.BoxGeometry(l, h, w);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x + l / 2, y + h / 2, z + w / 2);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  rounded(x: number, y: number, z: number, l: number, h: number, w: number, r: number, material: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new RoundedBoxGeometry(l, h, w, 3, r), material);
    m.position.set(x + l / 2, y + h / 2, z + w / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /** Wheel set on one axle; `dual` adds the inner tyre. */
  axle(x: number, ground: number, W: number, radius: number, dual: boolean, track = 2.04) {
    const tyre = this.mat('#1c1f22', { roughness: 0.92 });
    const rim = this.mat('#b8bec4', { metalness: 0.75, roughness: 0.32 });
    const hub = this.mat('#5d646b', { metalness: 0.6, roughness: 0.4 });
    const fender = this.mat('#202326', { roughness: 0.6, side: THREE.DoubleSide });
    const width = 0.3;
    const tyreGeo = new THREE.CylinderGeometry(radius, radius, width, 36);
    tyreGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.01, 24);
    rimGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width + 0.04, 12);
    hubGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const centres = dual ? [track / 2, track / 2 - width - 0.02] : [track / 2];
      for (const c of centres) {
        const z = W / 2 + side * (c - width / 2);
        for (const [geo, material] of [
          [tyreGeo, tyre],
          [rimGeo, rim],
          [hubGeo, hub],
        ] as const) {
          const m = new THREE.Mesh(geo, material);
          m.position.set(x, ground + radius, z);
          m.castShadow = true;
          this.group.add(m);
        }
      }
      const arch = new THREE.CylinderGeometry(radius + 0.07, radius + 0.07, dual ? 0.66 : 0.36, 24, 1, true, -Math.PI / 2, Math.PI);
      arch.rotateX(Math.PI / 2);
      const guard = new THREE.Mesh(arch, fender);
      guard.position.set(x, ground + radius, W / 2 + side * (track / 2 - (dual ? 0.33 : 0.15)));
      this.group.add(guard);
    }
  }
}

/** Tractor or rigid-truck cab facing −x, its back at `back`. */
function cab(p: Parts, back: number, ground: number, W: number, height: number, length: number, bodyTop: number) {
  const white = p.mat('#eef0f2', { roughness: 0.35, metalness: 0.15 });
  const dark = p.mat('#24292e', { roughness: 0.6 });
  const glass = p.mat('#1f3546', { roughness: 0.08, metalness: 0.4 });
  const chrome = p.mat('#c9ced3', { metalness: 0.85, roughness: 0.25 });
  const front = back - length;
  const yb = ground + 1.0;
  const yt = ground + height;
  const cw = W + 0.02;
  const z0 = (W - cw) / 2;

  p.rounded(front, yb, z0, length, yt - yb, cw, 0.14, white);
  if (bodyTop > yt + 0.15) p.rounded(back - length * 0.62, yt - 0.05, z0 + 0.06, length * 0.6, bodyTop - yt, cw - 0.12, 0.12, white);
  // Windscreen and side windows.
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.86, (yt - yb) * 0.34), glass);
  ws.rotation.y = -Math.PI / 2;
  ws.position.set(front - 0.004, yb + (yt - yb) * 0.66, W / 2);
  p.group.add(ws);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(length * 0.34, (yt - yb) * 0.28), glass);
    win.position.set(front + length * 0.24, yb + (yt - yb) * 0.66, W / 2 + s * (cw / 2 + 0.004));
    if (s < 0) win.rotation.y = Math.PI;
    p.group.add(win);
    // Mirror on an arm.
    p.box(front + 0.12, yb + (yt - yb) * 0.7, s < 0 ? z0 - 0.32 : z0 + cw, 0.04, 0.04, 0.32, dark, false);
    p.box(front + 0.06, yb + (yt - yb) * 0.5, s < 0 ? z0 - 0.4 : z0 + cw + 0.32, 0.12, 0.42, 0.08, dark);
    // Step.
    p.box(front + length * 0.35, ground + 0.55, s < 0 ? z0 - 0.03 : z0 + cw - 0.15, 0.45, 0.05, 0.18, dark);
  }
  // Grille with slats, bumper, headlights.
  p.box(front - 0.02, yb + 0.12, W / 2 - cw * 0.3, 0.03, (yt - yb) * 0.3, cw * 0.6, dark, false);
  for (let i = 0; i < 4; i++) p.box(front - 0.035, yb + 0.2 + i * 0.17, W / 2 - cw * 0.28, 0.02, 0.03, cw * 0.56, chrome, false);
  p.box(front - 0.06, ground + 0.45, z0 + 0.02, 0.3, 0.42, cw - 0.04, dark);
  for (const s of [-1, 1]) p.box(front - 0.07, ground + 0.95, W / 2 + s * (cw / 2 - 0.2) - 0.15, 0.03, 0.13, 0.3, p.mat('#fff4d0', { emissive: '#fff1c4' }), false);
  // Sun visor.
  p.box(front - 0.12, yt - 0.18, z0 + 0.08, 0.2, 0.05, cw - 0.16, dark, false);
}

function chassisRails(p: Parts, from: number, to: number, y: number, W: number) {
  const steel = p.mat('#2c3136', { roughness: 0.55, metalness: 0.3 });
  for (const s of [-1, 1]) p.box(from, y, W / 2 + s * 0.48 - 0.06, to - from, 0.28, 0.12, steel);
}

function fuelTank(p: Parts, x: number, ground: number, W: number) {
  const alu = p.mat('#c3c8cd', { metalness: 0.8, roughness: 0.28 });
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 1.1, 28);
  geo.rotateZ(Math.PI / 2);
  const m = new THREE.Mesh(geo, alu);
  m.position.set(x + 0.55, ground + 0.72, W + 0.18);
  m.castShadow = true;
  p.group.add(m);
}

/** Curtain-sider body shared by trailers and rigid trucks. */
function curtainBody(p: Parts, L: number, H: number, W: number) {
  const steel = p.mat('#7d868e', { metalness: 0.55, roughness: 0.45 });
  const alu = p.mat('#dde2e6', { metalness: 0.35, roughness: 0.4 });
  const floorTex = deckFloor();
  const floor = new THREE.Mesh(tiledBox(L, 0.05, W, 2.4, 0.62), p.mat('#ffffff', { map: floorTex, roughness: 0.85 }));
  floor.position.set(0, -0.05, 0);
  floor.receiveShadow = true;
  p.group.add(floor);
  for (const z of [-0.06, W]) p.box(0, -0.26, z, L, 0.22, 0.06, steel);
  // Front bulkhead.
  p.box(-0.06, -0.05, -0.06, 0.06, H + 0.1, W + 0.12, alu);
  // Roof rails and bows (no roof sheet, so the top view stays clear).
  for (const z of [-0.06, W - 0.01]) p.box(0, H, z, L, 0.07, 0.07, alu, false);
  for (let x = 1.2; x < L - 0.3; x += 1.2) p.box(x, H + 0.02, 0, 0.04, 0.03, W, alu, false);
  // Far curtain, closed.
  const curtain = p.mat('#ffffff', { map: tarp('#c3ccd4'), roughness: 0.9 });
  const far = new THREE.Mesh(tiledBox(L, H + 0.05, 0.025, 0.62, H + 0.05), curtain);
  far.position.set(0, -0.02, -0.085);
  far.receiveShadow = true;
  p.group.add(far);
  // Near curtain, pulled open and bunched at the front.
  for (let i = 0; i < 7; i++) {
    const fold = p.box(0.05 + i * 0.07, -0.02, W + 0.02 + (i % 2) * 0.05, 0.08, H, 0.06, curtain);
    fold.rotation.y = (i % 2 ? -1 : 1) * 0.5;
  }
  // Rear portal and open doors folded back along the sides.
  for (const z of [-0.08, W - 0.02]) p.box(L, -0.26, z, 0.1, H + 0.33, 0.1, steel);
  p.box(L, H, -0.08, 0.1, 0.12, W + 0.16, steel);
  const door = p.mat('#e3e7ea', { metalness: 0.3, roughness: 0.45 });
  const bar = p.mat('#9aa2a9', { metalness: 0.8, roughness: 0.3 });
  for (const [z, s] of [
    [-0.16, -1],
    [W + 0.1, 1],
  ] as const) {
    p.box(L + 0.04 - W / 2, -0.24, z, W / 2, H + 0.2, 0.04, door);
    for (const off of [0.3, 0.85]) p.box(L + 0.04 - off, -0.22, z + (s > 0 ? 0.04 : -0.02), 0.03, H + 0.12, 0.02, bar, false);
  }
}

function rearEnd(p: Parts, L: number, ground: number, W: number) {
  const steel = p.mat('#3a4046', { metalness: 0.4, roughness: 0.5 });
  p.box(L - 0.2, ground + 0.42, 0.15, 0.12, 0.12, W - 0.3, steel);
  for (const z of [0.12, W - 0.42]) p.box(L + 0.06, -0.42, z, 0.05, 0.12, 0.3, p.mat('#c0261b', { emissive: '#8f140b' }), false);
  p.box(L + 0.06, -0.62, W / 2 - 0.26, 0.02, 0.11, 0.52, p.mat('#f5f5f0'), false);
}

function landingGear(p: Parts, x: number, ground: number, W: number) {
  const steel = p.mat('#2c3136', { roughness: 0.55, metalness: 0.3 });
  for (const s of [-1, 1]) {
    p.box(x, ground + 0.05, W / 2 + s * 0.55 - 0.05, 0.1, -ground - 0.35, 0.1, steel);
    p.box(x - 0.08, ground, W / 2 + s * 0.55 - 0.13, 0.26, 0.05, 0.26, steel);
  }
}

function sideGuards(p: Parts, from: number, to: number, ground: number, W: number) {
  const alu = p.mat('#b9c0c6', { metalness: 0.6, roughness: 0.35 });
  for (const z of [0.02, W - 0.06]) for (const y of [0.42, 0.72]) p.box(from, ground + y, z, to - from, 0.08, 0.04, alu, false);
}

function containerBox(p: Parts, L: number, H: number, W: number) {
  const bump = corrugation();
  const colour = '#9b3b2a';
  const wall = p.mat(colour, { bumpMap: bump, roughness: 0.55, metalness: 0.25 });
  const frame = p.mat('#7e2f22', { roughness: 0.5, metalness: 0.3 });
  const casting = p.mat('#9aa1a7', { metalness: 0.5, roughness: 0.5 });
  const t = 0.06;
  const floor = new THREE.Mesh(tiledBox(L, 0.06, W, 2.4, 0.62), p.mat('#ffffff', { map: deckFloor(), roughness: 0.85 }));
  floor.position.set(0, -0.06, 0);
  floor.receiveShadow = true;
  p.group.add(floor);
  const far = new THREE.Mesh(tiledBox(L, H, t, 0.3, H), wall);
  far.position.set(0, 0, -t);
  far.castShadow = true;
  far.receiveShadow = true;
  p.group.add(far);
  const front = new THREE.Mesh(tiledBox(t, H, W + 2 * t, 1, H), wall);
  front.position.set(-t, 0, -t);
  front.castShadow = true;
  p.group.add(front);
  for (const z of [-t - 0.04, W]) {
    p.box(-t, H, z, L + t + 0.12, 0.12, 0.1, frame, false);
    p.box(-t, -0.2, z, L + t + 0.12, 0.2, 0.1, frame);
  }
  for (const x of [-t - 0.06, L])
    for (const z of [-t - 0.06, W - 0.04]) {
      p.box(x, -0.2, z, 0.16, H + 0.32, 0.16, frame);
      for (const y of [-0.24, H + 0.06]) p.box(x - 0.01, y, z - 0.01, 0.18, 0.14, 0.18, casting);
    }
  const doorMat = p.mat(colour, { bumpMap: bump, roughness: 0.55, metalness: 0.25 });
  const bar = p.mat('#a7adb3', { metalness: 0.8, roughness: 0.3 });
  for (const [z, s] of [
    [-t - 0.16, -1],
    [W + 0.1, 1],
  ] as const) {
    const d = new THREE.Mesh(tiledBox(W / 2, H + 0.2, 0.05, 0.3, H), doorMat);
    d.position.set(L + 0.16 - W / 2, -0.1, z);
    d.castShadow = true;
    p.group.add(d);
    for (const off of [0.18, 0.5, 0.75, 1.05]) p.box(L + 0.16 - off, -0.08, z + (s > 0 ? 0.05 : -0.025), 0.035, H + 0.16, 0.025, bar, false);
  }
}

function vanBody(p: Parts, L: number, H: number, W: number, ground: number) {
  const white = p.mat('#eef0f2', { roughness: 0.35, metalness: 0.15 });
  const glass = p.mat('#1f3546', { roughness: 0.08, metalness: 0.4 });
  const dark = p.mat('#24292e', { roughness: 0.6 });
  const floor = new THREE.Mesh(tiledBox(L, 0.04, W, 1.2, 0.3), p.mat('#3d4246', { roughness: 0.9 }));
  floor.position.set(0, -0.04, 0);
  p.group.add(floor);
  p.rounded(-0.04, -0.06, -0.06, L + 0.08, H + 0.12, 0.06, 0.02, white);
  for (const z of [-0.06, W - 0.01]) p.box(-0.04, H, z, L + 0.08, 0.08, 0.07, white, false);
  p.box(0, -0.18, W, L, 0.16, 0.05, white);
  // Cab: tall front with a short bonnet.
  const top = H + 0.06;
  p.rounded(-1.45, ground + 0.4, -0.06, 1.45, top - ground - 0.4, W + 0.12, 0.22, white);
  p.rounded(-2.15, ground + 0.38, -0.02, 0.85, 0.75, W + 0.04, 0.2, white);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, (top - ground) * 0.32), glass);
  ws.rotation.y = -Math.PI / 2;
  ws.rotation.z = -0.35;
  ws.position.set(-1.47, ground + (top - ground) * 0.66, W / 2);
  p.group.add(ws);
  p.box(-2.2, ground + 0.35, 0, 0.1, 0.32, W, dark);
  // Rear doors open.
  for (const z of [-0.12, W + 0.07]) p.box(L + 0.02 - W / 2, -0.05, z, W / 2, H + 0.08, 0.04, white);
}

function ground(p: Parts, L: number, W: number, deck: number) {
  const tex = asphalt();
  tex.repeat.set((L + 40) / 4, 40 / 4);
  const g = new THREE.Mesh(new THREE.PlaneGeometry(L + 40, 40), p.mat('#ffffff', { map: tex, roughness: 0.95 }));
  g.rotation.x = -Math.PI / 2;
  g.position.set(L / 2 - 2, -deck, W / 2);
  g.receiveShadow = true;
  p.group.add(g);
  const paint = p.mat('#e8c547', { roughness: 0.8 });
  for (const z of [-1.1, W + 1.0]) p.box(-5, -deck + 0.002, z, L + 9, 0.004, 0.12, paint, false);
}

export function buildRealVehicle(v: Vehicle): THREE.Group {
  const L = v.length * MM;
  const W = v.width * MM;
  const H = v.height * MM;
  const deck = deckHeight(v);
  const g = -deck;
  const p = new Parts();

  if (v.kind === 'semi') {
    const kp = (v.kingpinX ?? 1600) * MM;
    const ax = (v.axleX ?? 9300) * MM;
    curtainBody(p, L, H, W);
    chassisRails(p, 0.3, L - 0.3, -0.6, W);
    landingGear(p, 2.3, g, W);
    sideGuards(p, 2.6, ax - 1.31 - 0.65, g, W);
    for (const off of [-1.31, 0, 1.31]) p.axle(ax + off, g, W, 0.5, true);
    rearEnd(p, L, g, W);
    // Tractor unit.
    cab(p, -0.3, g, W, 3.55, 2.3, H + 0.05);
    chassisRails(p, -2.4, kp + 1.1, g + 0.72, W);
    p.box(kp - 0.45, -0.32, W / 2 - 0.45, 0.9, 0.1, 0.9, p.mat('#1b1e21', { roughness: 0.4, metalness: 0.5 }));
    fuelTank(p, -0.2, g, W);
    p.axle(-1.55, g, W, 0.5, false);
    p.axle(kp, g, W, 0.5, true);
  } else if (v.kind === 'truck') {
    curtainBody(p, L, H, W);
    cab(p, -0.15, g, W, 3.3, 2.25, H + 0.05);
    chassisRails(p, -2.3, L - 0.3, -0.62, W);
    fuelTank(p, 0.2, g, W);
    sideGuards(p, 1.2, L * 0.72 - 0.8, g, W);
    p.axle(-1.3, g, W, 0.5, false);
    p.axle(L * 0.72, g, W, 0.5, true);
    rearEnd(p, L, g, W);
  } else if (v.kind === 'van') {
    vanBody(p, L, H, W, g);
    p.axle(-1.65, g, W, 0.34, false, W - 0.1);
    p.axle(L * 0.75, g, W, 0.34, false, W - 0.1);
  } else {
    containerBox(p, L, H, W);
    // Skeletal chassis and tractor.
    chassisRails(p, -0.1, L, -0.62, W);
    landingGear(p, 2.0, g, W);
    const ax = L - (L > 8 ? 2.4 : 1.9);
    for (const off of [-1.31, 0, 1.31]) p.axle(ax + off, g, W, 0.5, true);
    rearEnd(p, L + 0.1, g, W);
    cab(p, -0.4, g, W, 3.55, 2.3, H + 0.1);
    chassisRails(p, -2.5, 2.4, g + 0.72, W);
    fuelTank(p, -0.3, g, W);
    p.axle(-1.65, g, W, 0.5, false);
    p.axle(1.3, g, W, 0.5, true);
  }
  ground(p, L, W, deck);
  p.group.position.set(-L / 2, 0, -W / 2);
  return p.group;
}

/** The original diagram-like rendering: outlines, a grid and a hazard-striped door. */
export function buildSchematicVehicle(v: Vehicle, dark: boolean): THREE.Group {
  const L = v.length * MM;
  const W = v.width * MM;
  const H = v.height * MM;
  const deck = deckHeight(v);
  const group = new THREE.Group();
  const ink = new THREE.Color(dark ? '#c9d1d9' : '#2a333c');
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, W), new THREE.MeshStandardMaterial({ color: dark ? '#3a434d' : '#59626b', roughness: 0.9 }));
  floor.position.set(L / 2, -0.04, W / 2);
  floor.receiveShadow = true;
  group.add(floor);
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: ink }));
  body.position.set(L / 2, H / 2, W / 2);
  group.add(body);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: dark ? '#7b8794' : '#9aa5b1', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  front.rotation.y = Math.PI / 2;
  front.position.set(0, H / 2, W / 2);
  group.add(front);
  const tex = hazard();
  tex.repeat.set(1, H * 4);
  const postMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  for (const z of [0.03, W - 0.03]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 0.06), postMat);
    m.position.set(L + 0.03, H / 2, z);
    group.add(m);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L * 3 + 20, W * 8 + 20), new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.18 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(L / 2, -deck, W / 2);
  shadow.receiveShadow = true;
  group.add(shadow);
  const grid = new THREE.GridHelper(Math.ceil(L + 12), Math.ceil(L + 12), dark ? 0x2b333c : 0xc3cad1, dark ? 0x222930 : 0xd3d9de);
  grid.position.set(L / 2, -deck + 0.001, W / 2);
  group.add(grid);
  group.position.set(-L / 2, 0, -W / 2);
  return group;
}
