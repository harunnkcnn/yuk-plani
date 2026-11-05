/**
 * Procedural textures drawn on canvases, so the realistic view ships no image
 * assets and nothing is fetched. Every texture is cached and deterministic.
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void, repeat = false): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  let seed = 0;
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  draw(g, size, prng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  cache.set(key, tex);
  return tex;
}

function speckle(g: CanvasRenderingContext2D, s: number, rnd: () => number, count: number, colors: string[], maxSize: number) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
    g.globalAlpha = 0.25 + rnd() * 0.4;
    const r = 0.5 + rnd() * maxSize;
    g.fillRect(rnd() * s, rnd() * s, r, r * (0.5 + rnd()));
  }
  g.globalAlpha = 1;
}

function kraftBase(g: CanvasRenderingContext2D, s: number, rnd: () => number) {
  g.fillStyle = '#b8895a';
  g.fillRect(0, 0, s, s);
  speckle(g, s, rnd, s * 6, ['#a77a4d', '#c79a6a', '#9c7046', '#d1a777'], 2.2);
  // Corrugation shows faintly through the liner.
  g.globalAlpha = 0.06;
  g.fillStyle = '#5e4128';
  for (let x = 0; x < s; x += 6) g.fillRect(x, 0, 2, s);
  g.globalAlpha = 1;
}

function shipLabel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, rnd: () => number) {
  g.fillStyle = '#f4f2ec';
  g.fillRect(x, y, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h * 0.38);
  g.fillStyle = '#2a2a2a';
  for (let i = 0; i < 3; i++) g.fillRect(x + w * 0.08, y + h * (0.4 + i * 0.13), w * (0.45 + rnd() * 0.35), Math.max(1, h * 0.05));
  let bx = x + w * 0.08;
  while (bx < x + w * 0.92) {
    const bw = 1 + Math.floor(rnd() * 3);
    g.fillRect(bx, y + h * 0.8, bw, h * 0.14);
    bx += bw + 1 + Math.floor(rnd() * 2);
  }
}

/** A single carton face: `side` carries a shipping label, `top` the closing tape. */
export function cartonFace(color: string, face: 'side' | 'top' | 'plain'): THREE.CanvasTexture {
  return make(`carton:${face}:${color}`, 256, (g, s, rnd) => {
    kraftBase(g, s, rnd);
    g.strokeStyle = 'rgba(70,45,25,0.45)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, s - 3, s - 3);
    if (face === 'side') {
      // Printed colour band, as on branded shipping cartons, plus a label.
      g.fillStyle = color;
      g.globalAlpha = 0.85;
      g.fillRect(0, s * 0.08, s, s * 0.16);
      g.globalAlpha = 1;
      shipLabel(g, s * 0.5, s * 0.46, s * 0.42, s * 0.36, color, rnd);
    }
    if (face === 'top') {
      g.fillStyle = color;
      g.globalAlpha = 0.92;
      g.fillRect(0, s * 0.4, s, s * 0.2);
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(60,40,20,0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, s * 0.5);
      g.lineTo(s, s * 0.5);
      g.stroke();
    }
  });
}

/** One carton per repeat, with seams and a small label: for cartons stacked on a pallet. */
export function cartonGrid(color: string): THREE.CanvasTexture {
  return make(
    `grid:${color}`,
    256,
    (g, s, rnd) => {
      kraftBase(g, s, rnd);
      g.fillStyle = 'rgba(55,35,18,0.75)';
      g.fillRect(0, 0, s, 4);
      g.fillRect(0, 0, 4, s);
      g.fillStyle = 'rgba(255,240,220,0.18)';
      g.fillRect(4, 4, s - 4, 3);
      shipLabel(g, s * 0.5, s * 0.5, s * 0.4, s * 0.32, color, rnd);
    },
    true,
  );
}

/** Kraft-wrapped bundle with two straps: long items such as pipes or profiles. */
export function bundle(color: string): THREE.CanvasTexture {
  return make(
    `bundle:${color}`,
    256,
    (g, s, rnd) => {
      kraftBase(g, s, rnd);
      g.fillStyle = color;
      g.fillRect(s * 0.44, 0, s * 0.12, s);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(s * 0.44, 0, 2, s);
      g.fillRect(s * 0.56 - 2, 0, 2, s);
    },
    true,
  );
}

export function wood(): THREE.CanvasTexture {
  return make(
    'wood',
    256,
    (g, s, rnd) => {
      g.fillStyle = '#c29a66';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) {
        g.fillStyle = `rgba(${110 + rnd() * 40},${75 + rnd() * 30},${40 + rnd() * 20},${0.12 + rnd() * 0.18})`;
        g.fillRect(0, y, s, 1 + rnd() * 2);
      }
      for (let i = 0; i < 4; i++) {
        g.fillStyle = 'rgba(90,60,30,0.35)';
        g.beginPath();
        g.ellipse(rnd() * s, rnd() * s, 3 + rnd() * 5, 1.5 + rnd() * 2, 0, 0, Math.PI * 2);
        g.fill();
      }
    },
    true,
  );
}

/** Oiled plywood trailer floor, planks running along the vehicle. */
export function deckFloor(): THREE.CanvasTexture {
  return make(
    'deck',
    256,
    (g, s, rnd) => {
      g.fillStyle = '#5b4632';
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, 1600, ['#4a3828', '#6b5440', '#3f3022'], 3);
      g.fillStyle = 'rgba(20,14,8,0.6)';
      for (let y = 0; y < s; y += s / 4) g.fillRect(0, y, s, 2);
    },
    true,
  );
}

/** Curtain-sider tarpaulin with tension straps every repeat. */
export function tarp(base: string): THREE.CanvasTexture {
  return make(
    `tarp:${base}`,
    128,
    (g, s, rnd) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, 500, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.25)'], 1.5);
      const grad = g.createLinearGradient(0, 0, s, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.10)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      grad.addColorStop(1, 'rgba(0,0,0,0.10)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#2b2f33';
      g.fillRect(s * 0.46, 0, s * 0.08, s);
      g.fillStyle = '#9aa3ab';
      g.fillRect(s * 0.455, s * 0.86, s * 0.09, s * 0.07);
    },
    true,
  );
}

export function asphalt(): THREE.CanvasTexture {
  return make(
    'asphalt',
    512,
    (g, s, rnd) => {
      g.fillStyle = '#4a4d50';
      g.fillRect(0, 0, s, s);
      speckle(g, s, rnd, s * 40, ['#3b3e41', '#575b5e', '#2f3234', '#63676a'], 2.4);
    },
    true,
  );
}

/** Vertical ridges for container walls, used as a bump map. */
export function corrugation(): THREE.CanvasTexture {
  const tex = make(
    'corrugation',
    128,
    (g, s) => {
      for (let x = 0; x < s; x++) {
        const v = Math.round(128 + 110 * Math.sin((x / s) * Math.PI * 2));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, 0, 1, s);
      }
    },
    true,
  );
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function hazard(): THREE.CanvasTexture {
  return make(
    'hazard',
    64,
    (g) => {
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
    },
    true,
  );
}
