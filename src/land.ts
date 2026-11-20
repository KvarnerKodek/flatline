import * as THREE from 'three';
import { toon, outline, hex } from './toon';

export type HeightFn = (x: number, z: number) => number;
export type LandPaint = (x: number, y: number, z: number, steep: number) => THREE.Vector3;

const fract = (x: number) => x - Math.floor(x);
/** Cheap value noise in the plane, the same on every machine. */
export function noise2(x: number, z: number): number {
  const h = (i: number, j: number) => fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const i = Math.floor(x), j = Math.floor(z);
  let u = x - i, v = z - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/** A round hill: `h` metres high at (cx, cz), falling off over `r` metres. */
export const hill = (cx: number, cz: number, r: number, h: number): HeightFn => (x, z) =>
  h * Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r));

export const sumHeights = (...f: HeightFn[]): HeightFn => (x, z) => f.reduce((s, g) => s + g(x, z), 0);

/** Sand at the shore, grass above it, rock where it is steep. Colours are quantised so land reads as painted. */
export function shorePaint(sand = 0xe9d8a6, grass = 0x7fb466, high = 0x5f9a5a, rock = 0x9a948c): LandPaint {
  const S = hex(sand), Gc = hex(grass), H = hex(high), R = hex(rock);
  return (x, y, z, steep) => {
    const n = noise2(x * 0.05, z * 0.05);
    if (steep > 0.62 + n * 0.12) return R.clone().multiplyScalar(0.9 + 0.14 * Math.round(n * 2) / 2);
    if (y < 1.1 + n * 0.9) return S.clone().multiplyScalar(0.94 + 0.08 * n);
    const c = Gc.clone().lerp(H, Math.min(1, Math.round(Math.max(0, (y - 4) / 26 + (n - 0.5) * 0.5) * 3) / 3));
    return c.multiplyScalar(0.93 + 0.12 * Math.round(noise2(x * 0.21, z * 0.21) * 2) / 2);
  };
}

/** Meadow on the valley floor, dark forest on the slopes, rock where it is steep and snow above `snow` metres. */
export function alpinePaint(snow = 340, forest = 55): LandPaint {
  const M = hex(0x86c05a), M2 = hex(0x9ccf62), F = hex(0x3f7a52), A = hex(0x8fa35a), R = hex(0x8f8a86), R2 = hex(0x6f6a6e), S = hex(0xf4f8ff), SS = hex(0xc9d4ec);
  return (x, y, z, steep) => {
    const n = noise2(x * 0.012, z * 0.012), f = noise2(x * 0.06 + 9, z * 0.06), g = noise2(x * 0.03 + 4, z * 0.03 + 1);
    const line = snow + (n - 0.5) * 150 + (g - 0.5) * 60 - steep * 25;
    if (y > line && steep < 1.25 + f * 0.3) {
      // Snow: cool white on gentle ground, lavender where it turns steep, in two painted steps.
      return S.clone().lerp(SS, Math.round(Math.min(1, steep * 0.9 + (f - 0.5) * 0.4) * 2) / 2);
    }
    if (y > forest + n * 50 + 40 && (steep > 0.75 + f * 0.25 || y > line - 70)) {
      // Rock: warm and cool greys in strata that follow the height, so faces read as layered stone.
      const band = Math.round(((y / 23 + f * 0.8) % 1 + 1) % 1 * 2) / 2;
      return R.clone().lerp(R2, band * 0.7 + (steep > 1.4 ? 0.3 : 0)).multiplyScalar(0.92 + 0.12 * Math.round(g * 2) / 2);
    }
    if (y > forest + n * 50 && y < line - 90) return F.clone().multiplyScalar(0.86 + 0.24 * Math.round(f * 3) / 3);
    if (y > forest + n * 50) return A.clone().multiplyScalar(0.92 + 0.12 * Math.round(f * 2) / 2);
    return M.clone().lerp(M2, Math.round(noise2(x * 0.02 + 3, z * 0.02) * 3) / 3).multiplyScalar(0.94 + 0.1 * Math.round(f * 2) / 2);
  };
}

export const rolling = (amp: number, scale: number, ox = 0, oz = 0): HeightFn => (x, z) => amp * noise2(x / scale + ox, z / scale + oz);

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Levels the ground to `level` within `r` metres of a point and blends back to `h` over `soft` more. */
export const plateau = (h: HeightFn, cx: number, cz: number, r: number, level: number, soft = r * 0.7): HeightFn => (x, z) => {
  const k = 1 - smooth(r, r + soft, Math.hypot(x - cx, z - cz)), y = h(x, z);
  return y + (level - y) * k;
};

/** `sink` lowers the mesh by that many metres at a point, so finer detail laid over coarse land (a track bed, a pavement) is never covered by it. */
export interface LandOpts { cx?: number; cz?: number; size: number; depth?: number; res?: number; paint?: LandPaint; floor?: number; ink?: number; sink?: HeightFn }

/** Land from a height function: a patch `size` by `depth` metres centred on (cx, cz), skipped where it stays under `floor`. */
export function makeLand(height: HeightFn, o: LandOpts): THREE.Group {
  const res = o.res ?? 160, cx = o.cx ?? 0, cz = o.cz ?? 0, paint = o.paint ?? shorePaint(), floor = o.floor ?? -Infinity;
  const depth = o.depth ?? o.size, step = o.size / res, nx = res + 1, nz = Math.round(depth / step) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), ys = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ys[j * nx + i] = height(cx - o.size / 2 + i * step, cz - depth / 2 + j * step);
  const at = (i: number, j: number) => ys[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = cx - o.size / 2 + i * step, z = cz - depth / 2 + j * step, k = j * nx + i;
      const c = paint(x, ys[k], z, Math.hypot(at(i + 1, j) - at(i - 1, j), at(i, j + 1) - at(i, j - 1)) / (2 * step));
      pos.set([x, ys[k] - (o.sink?.(x, z) ?? 0), z], k * 3);
      col.set([c.x, c.y, c.z], k * 3);
    }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < res; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (Math.max(ys[a], ys[b], ys[c], ys[d]) < floor) continue;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const group = new THREE.Group();
  const surface = new THREE.Mesh(g, toon({ vertexColors: true, spec: 0, grain: 1 }));
  surface.userData.noShadow = true;
  group.add(surface);
  if (o.ink) group.add(new THREE.Mesh(g, outline(o.ink)));
  return group;
}

/** Flat ground out to the horizon for a film with no sea. Hand it to `follow` so it stays under the camera. */
export function makeGround(color = 0x7fb466, y = 0, radius = 16000): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), toon({ color, spec: 0 }));
  m.userData.followY = y;
  m.userData.noShadow = true;
  m.frustumCulled = false;
  return m;
}

export type DrapePaint = (across: number, along: number) => THREE.Vector3;

function draped(pos: number[], col: number[], idx: number[], lift: number): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = toon({ vertexColors: true, spec: 0 });
  mat.polygonOffset = true; mat.polygonOffsetFactor = 0; mat.polygonOffsetUnits = -4;
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}

/**
 * A strip laid over the ground along a line of points: a road, a path, a stream bed. `paint` gets the position
 * across it (0 to 1) and the distance along it in metres.
 */
export function ribbon(line: { x: number; z: number }[], width: number, height: HeightFn, paint: DrapePaint, lift = 0.12, cross = 2): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  let along = 0;
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    if (i) along += Math.hypot(p.x - a.x, p.z - a.z);
    for (let k = 0; k <= cross; k++) {
      const u = k / cross, x = p.x + nx * (u - 0.5) * width, z = p.z + nz * (u - 0.5) * width, c = paint(u, along);
      pos.push(x, height(x, z) + lift, z);
      col.push(c.x, c.y, c.z);
    }
    if (i < line.length - 1) for (let k = 0; k < cross; k++) { const q = i * (cross + 1) + k; idx.push(q, q + 1, q + cross + 1, q + 1, q + cross + 2, q + cross + 1); }
  });
  return draped(pos, col, idx, lift);
}

/** A rectangle laid over the ground and turned by `yaw`: a field, a yard, a square. `paint` gets 0 to 1 both ways. */
export function patch(cx: number, cz: number, w: number, d: number, yaw: number, height: HeightFn, paint: DrapePaint, lift = 0.1, cell = 4): THREE.Mesh {
  const nu = Math.max(1, Math.round(w / cell)), nv = Math.max(1, Math.round(d / cell)), c = Math.cos(yaw), s = Math.sin(yaw);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, lx = (u - 0.5) * w, lz = (v - 0.5) * d, x = cx + c * lx - s * lz, z = cz + s * lx + c * lz, k = paint(u, v);
      pos.push(x, height(x, z) + lift, z);
      col.push(k.x, k.y, k.z);
      if (i < nu && j < nv) { const q = j * (nu + 1) + i; idx.push(q, q + nu + 1, q + 1, q + 1, q + nu + 1, q + nu + 2); }
    }
  return draped(pos, col, idx, lift);
}

/** Walk outward from (x, z) along `yaw` until the ground drops to `level`; returns the distance. */
export function shoreDistance(height: HeightFn, x: number, z: number, yaw: number, level = 0, max = 2000): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (let d = 0; d < max; d += 0.5) if (height(x + c * d, z + s * d) <= level) return d;
  return max;
}
