import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import { STOP_COLORS } from '../lib/presets';
import type { CargoItem, Placement, Vehicle } from '../lib/types';
import { buildCargo, unitBox, unitEdges, type Look } from './scene/cargo';
import { isCached } from './scene/geometry';
import { buildRealVehicle, buildSchematicVehicle, deckHeight, MM } from './scene/vehicle';

export type ViewName = 'iso' | 'top' | 'side' | 'rear';
export type ColorBy = 'item' | 'stop';
export type { Look };

interface Props {
  vehicle: Vehicle;
  placements: Placement[];
  items: CargoItem[];
  colorBy: ColorBy;
  look: Look;
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

interface Ctx {
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
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
    if (o.geometry !== unitBox && o.geometry !== unitEdges && !isCached(o.geometry)) o.geometry.dispose();
    const m = o.material as THREE.Material | THREE.Material[];
    // Textures are shared and cached; only per-build materials are released.
    (Array.isArray(m) ? m : [m]).forEach((x) => {
      if (!x.userData.shared) x.dispose();
    });
  });
}

export function Viewer3D({ vehicle, placements, items, colorBy, look, step, view, theme, t, lang }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<Ctx | null>(null);
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2;
    controls.maxDistance = 120;

    scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x5b5f63, 0.9));
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.2);
    sun.position.set(6, 22, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 70 });
    scene.add(sun);

    let raf = 0;
    const render = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
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
      cancelAnimationFrame(raf);
      disposeGroup(scene);
      scene.environment?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Vehicle body and surroundings.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    if (ctx.vehicleGroup) {
      ctx.scene.remove(ctx.vehicleGroup);
      disposeGroup(ctx.vehicleGroup);
    }
    ctx.vehicleGroup = look === 'real' ? buildRealVehicle(vehicle) : buildSchematicVehicle(vehicle, theme === 'dark');
    ctx.scene.add(ctx.vehicleGroup);
    const bg = getComputedStyle(host.current!).getPropertyValue('--viewer').trim() || (theme === 'dark' ? '#0d1115' : '#d3d8dd');
    ctx.scene.fog = look === 'real' ? new THREE.Fog(bg, 30, 80) : null;
    ctx.render();
  }, [vehicle, theme, look]);

  // Cargo.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    if (ctx.cargoGroup) {
      ctx.scene.remove(ctx.cargoGroup);
      disposeGroup(ctx.cargoGroup);
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    const colorFor = (p: Placement) => (colorBy === 'stop' ? STOP_COLORS[(p.stop - 1) % STOP_COLORS.length]! : (byId.get(p.itemId)?.color ?? '#888888'));
    const built = buildCargo(placements, items, colorFor, look, theme === 'dark', vehicle.length, vehicle.width);
    ctx.cargoGroup = built.group;
    ctx.units = built.units;
    ctx.pickables = built.pickables;
    ctx.scene.add(built.group);
    ctx.render();
  }, [placements, items, colorBy, vehicle, theme, look]);

  // Loading step only toggles visibility.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    for (const u of ctx.units) u.object.visible = u.seq < step;
    ctx.render();
  }, [step, placements, items, colorBy, vehicle, theme, look]);

  // Camera presets, fitted to the vehicle and the viewport shape.
  useEffect(() => {
    const ctx = three.current;
    if (!ctx) return;
    const frame = () => {
      const L = vehicle.length * MM;
      const W = vehicle.width * MM;
      const H = vehicle.height * MM;
      const cab = vehicle.kind === 'van' ? 2.2 : 2.7;
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
    const hit = ray.intersectObjects(
      ctx.pickables.filter((m) => m.parent?.visible),
      false,
    )[0];
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
