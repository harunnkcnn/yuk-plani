import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import { PALLET_BASE, STOP_COLORS } from '../lib/presets';
import type { CargoItem, Placement, Vehicle } from '../lib/types';

export type ViewName = 'iso' | 'top' | 'side' | 'rear';
export type ColorBy = 'item' | 'stop';

interface Props {
  vehicle: Vehicle;
  placements: Placement[];
  items: CargoItem[];
  colorBy: ColorBy;
  step: number;
  view: ViewName;
  theme: 'light' | 'dark';
  t: Dict;
  lang: Lang;
}

interface Hover {
  seq: number;
  x: number;
  y: number;
}

const WOOD = '#b48a5c';
const MM = 1 / 1000;

/** Deck height above ground and a simple chassis for context. Purely illustrative. */
function deckHeight(v: Vehicle): number {
  return v.kind === 'semi' ? 1.15 : v.kind === 'truck' ? 1.05 : v.kind === 'van' ? 0.55 : 1.2;
}

function hazardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2b10c';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#161c22';
  for (let i = -64; i < 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 - 64, 64);
    g.lineTo(i - 64, 64);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildVehicle(v: Vehicle, dark: boolean): THREE.Group {
  const L = v.length * MM;
  const W = v.width * MM;
  const H = v.height * MM;
  const deck = deckHeight(v);
  const group = new THREE.Group();
  const ink = new THREE.Color(dark ? '#c9d1d9' : '#2a333c');
  const edgeMat = new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.85 });

  // Cargo floor.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, W), new THREE.MeshStandardMaterial({ color: dark ? '#3a434d' : '#59626b', roughness: 0.9 }));
  floor.position.set(L / 2, -0.04, W / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // Body outline and translucent walls (front wall a little more solid).
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), edgeMat);
  body.position.set(L / 2, H / 2, W / 2);
  group.add(body);
  const wallMat = new THREE.MeshStandardMaterial({ color: v.kind === 'container' ? '#8a4b36' : dark ? '#7b8794' : '#9aa5b1', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat.clone());
  (front.material as THREE.MeshStandardMaterial).opacity = 0.22;
  front.rotation.y = Math.PI / 2;
  front.position.set(0, H / 2, W / 2);
  group.add(front);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat);
  side.position.set(L / 2, H / 2, 0);
  group.add(side);

  // Door frame with hazard stripes: the side cargo is loaded from.
  const tex = hazardTexture();
  const postMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const post = 0.06;
  for (const z of [post / 2, W - post / 2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(post, H, post), postMat);
    tex.repeat.set(1, H * 4);
    m.position.set(L + post / 2, H / 2, z);
    group.add(m);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(post, post, W), postMat);
  sill.position.set(L + post / 2, post / 2 - 0.08, W / 2);
  group.add(sill);

  // Chassis, wheels and cab for context.
  const dark1 = new THREE.MeshStandardMaterial({ color: dark ? '#2a3038' : '#3d454e', roughness: 0.8 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.18, W * 0.6), dark1);
  chassis.position.set(L / 2, -0.17, W / 2);
  group.add(chassis);
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 28);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.95 });
  const axles: number[] = [];
  if (v.kind === 'semi') {
    const centre = (v.axleX ?? v.length * 0.68) * MM;
    axles.push(centre - 1.31, centre, centre + 1.31, -1.9, (v.kingpinX ?? 1600) * MM);
  } else if (v.kind === 'truck') axles.push(L * 0.72, -1.4);
  else if (v.kind === 'van') axles.push(L * 0.78, -1.0);
  else axles.push(L * 0.82, L * 0.82 + 1.31, 0.9);
  const radius = Math.min(0.5, deck - 0.05);
  for (const x of axles) {
    for (const z of [0.35, W - 0.35]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.scale.set(radius / 0.5, radius / 0.5, 1);
      wheel.position.set(x, radius - deck, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  if (v.kind !== 'container') {
    const cabL = v.kind === 'van' ? 1.6 : 2.3;
    const cabH = v.kind === 'van' ? H + deck - 0.1 : 2.9;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(cabL, cabH, W),
      new THREE.MeshStandardMaterial({ color: dark ? '#4e5864' : '#d7dde3', roughness: 0.5 }),
    );
    const gap = v.kind === 'semi' ? 0.35 : 0.15;
    cab.position.set(-gap - cabL / 2, cabH / 2 - deck + 0.25, W / 2);
    cab.castShadow = true;
    group.add(cab);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, cabH * 0.32), new THREE.MeshStandardMaterial({ color: '#2f4a5f', roughness: 0.2 }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(-gap - cabL - 0.001, cabH * 0.72 - deck + 0.25, W / 2);
    group.add(glass);
  }

  // Ground.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L * 3 + 20, W * 8 + 20), new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(L / 2, -deck, W / 2);
  ground.receiveShadow = true;
  group.add(ground);
  const grid = new THREE.GridHelper(Math.ceil(L + 12), Math.ceil(L + 12), dark ? 0x2b333c : 0xc3cad1, dark ? 0x222930 : 0xd3d9de);
  grid.position.set(L / 2, -deck + 0.001, W / 2);
  group.add(grid);

  group.position.set(-L / 2, 0, -W / 2);
  return group;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0.5, 0.5, 0.5);
const unitEdges = new THREE.EdgesGeometry(unitBox);

export function Viewer3D({ vehicle, placements, items, colorBy, step, view, theme, t, lang }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    vehicleGroup: THREE.Group | null;
    cargoGroup: THREE.Group | null;
    units: { seq: number; object: THREE.Object3D }[];
    pickables: THREE.Mesh[];
    render: () => void;
    /** Re-frames the camera for the current preset unless the user has moved it. */
    frame: (() => void) | null;
    userMoved: boolean;
  } | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const fmt = formatters(lang);

  // Renderer, camera, lights: once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2;
    controls.maxDistance = 120;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 24, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    scene.add(sun);

    let frame = 0;
    const render = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderer.render(scene, camera);
      });
    };
    controls.addEventListener('change', render);
    controls.addEventListener('start', () => {
      if (three.current) three.current.userMoved = true;
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (three.current && !three.current.userMoved) three.current.frame?.();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    three.current = { renderer, scene, camera, controls, vehicleGroup: null, cargoGroup: null, units: [], pickables: [], render, frame: null, userMoved: false };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      cancelAnimationFrame(frame);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          if (o.geometry !== unitBox && o.geometry !== unitEdges) o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Vehicle body: when the vehicle or theme changes.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    if (ctx.vehicleGroup) {
      ctx.scene.remove(ctx.vehicleGroup);
      disposeGroup(ctx.vehicleGroup);
    }
    ctx.vehicleGroup = buildVehicle(vehicle, theme === 'dark');
    ctx.scene.add(ctx.vehicleGroup);
    ctx.render();
  }, [vehicle, theme]);

  // Cargo: when the plan or colours change.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    if (ctx.cargoGroup) {
      ctx.scene.remove(ctx.cargoGroup);
      disposeGroup(ctx.cargoGroup);
    }
    const group = new THREE.Group();
    group.position.set((-vehicle.length * MM) / 2, 0, (-vehicle.width * MM) / 2);
    const byId = new Map(items.map((i) => [i.id, i]));
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const material = (color: string) => {
      let m = materials.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
        materials.set(color, m);
      }
      return m;
    };
    const edgeMat = new THREE.LineBasicMaterial({ color: theme === 'dark' ? 0x0c0f12 : 0x1b232b, transparent: true, opacity: 0.55 });
    const units: { seq: number; object: THREE.Object3D }[] = [];
    const pickables: THREE.Mesh[] = [];

    for (const p of placements) {
      const item = byId.get(p.itemId);
      const color = colorBy === 'stop' ? STOP_COLORS[(p.stop - 1) % STOP_COLORS.length]! : (item?.color ?? '#888888');
      const unit = new THREE.Group();
      // Placement x → scene X, y (width) → scene Z, z (height) → scene Y. Small gap keeps edges readable.
      const gap = 6;
      unit.position.set((p.x + gap / 2) * MM, (p.z + gap / 2) * MM, (p.y + gap / 2) * MM);
      const l = (p.l - gap) * MM;
      const w = (p.w - gap) * MM;
      const h = (p.h - gap) * MM;
      const baseH = item?.kind === 'pallet' ? Math.min(PALLET_BASE * MM, h * 0.4) : 0;
      if (baseH > 0) {
        const base = new THREE.Mesh(unitBox, material(WOOD));
        base.scale.set(l, baseH, w);
        base.castShadow = true;
        unit.add(base);
      }
      const body = new THREE.Mesh(unitBox, material(color));
      body.position.y = baseH;
      body.scale.set(l, h - baseH, w);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.seq = p.seq;
      unit.add(body);
      pickables.push(body);
      const edges = new THREE.LineSegments(unitEdges, edgeMat);
      edges.scale.set(l, h, w);
      unit.add(edges);
      group.add(unit);
      units.push({ seq: p.seq, object: unit });
    }
    ctx.cargoGroup = group;
    ctx.units = units;
    ctx.pickables = pickables;
    ctx.scene.add(group);
    ctx.render();
  }, [placements, items, colorBy, vehicle, theme]);

  // Loading step: only toggles visibility.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    for (const u of ctx.units) u.object.visible = u.seq < step;
    ctx.render();
  }, [step, placements, items, colorBy, vehicle, theme]);

  // Camera presets, fitted to the vehicle and the viewport shape.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    const frame = () => {
      const L = vehicle.length * MM;
      const W = vehicle.width * MM;
      const H = vehicle.height * MM;
      const cab = vehicle.kind === 'container' ? 0 : 2.6;
      const target = new THREE.Vector3(-cab / 2, H / 2 - 0.3, 0);
      const radius = 0.5 * Math.hypot(L + cab, W, H + deckHeight(vehicle));
      const vFov = THREE.MathUtils.degToRad(ctx.camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * ctx.camera.aspect);
      const d = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.92;
      const dir =
        view === 'top'
          ? new THREE.Vector3(0, 1, 0.0001)
          : view === 'side'
            ? new THREE.Vector3(0, 0.08, 1)
            : view === 'rear'
              ? new THREE.Vector3(1, 0.3, 0.3)
              : new THREE.Vector3(0.62, 0.55, 0.9);
      // Rear view looks into the open doors, so it frames the door opening, not the whole vehicle.
      const focus = view === 'rear' ? new THREE.Vector3(L / 2 - 1.5, H / 2 - 0.2, 0) : target;
      const dist = view === 'rear' ? Math.max(W, H) * 3.6 : view === 'top' || view === 'side' ? d * 0.78 : d * 0.8;
      ctx.camera.position.copy(focus.clone().add(dir.normalize().multiplyScalar(dist)));
      ctx.controls.target.copy(focus);
      ctx.controls.update();
      ctx.render();
    };
    ctx.frame = frame;
    ctx.userMoved = false;
    frame();
  }, [view, vehicle]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ctx = three.current;
    if (!ctx || e.buttons) return;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, ctx.camera);
    const hit = ray.intersectObjects(ctx.pickables.filter((m) => m.parent?.visible), false)[0];
    setHover(hit ? { seq: hit.object.userData.seq as number, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
  };

  const hovered = hover ? placements.find((p) => p.seq === hover.seq) : undefined;
  const hoveredItem = hovered ? items.find((i) => i.id === hovered.itemId) : undefined;

  return (
    <div className="viewer" ref={host} onPointerMove={onPointerMove} onPointerLeave={() => setHover(null)}>
      {hover && hovered && hoveredItem && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }} role="status">
          <strong>{t.hover(hoveredItem.name, hovered.stop)}</strong>
          <span>
            {fmt.int(hovered.l)} × {fmt.int(hovered.w)} × {fmt.int(hovered.h)} mm · {fmt.int(hovered.weight)} kg
          </span>
          <span>{t.position(fmt.m1(hovered.x), fmt.m1(hovered.y), fmt.m1(hovered.z))}</span>
        </div>
      )}
    </div>
  );
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      if (o.geometry !== unitBox && o.geometry !== unitEdges) o.geometry.dispose();
      const m = o.material as THREE.Material | THREE.Material[];
      (Array.isArray(m) ? m : [m]).forEach((x) => {
        const map = (x as THREE.MeshStandardMaterial).map;
        map?.dispose();
        x.dispose();
      });
    }
  });
}
