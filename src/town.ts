import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outline, glow, hex } from './toon';
import { Mesher, finish } from './props';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface HouseOpts { w?: number; d?: number; h?: number; roof?: number; wall?: number; pitch?: number; chimney?: boolean; door?: number; storeys?: number; base?: number; shutters?: number | false;
  /** `false` leaves the door wall without windows, for a shop front, a hatch or a sign. */
  frontWindows?: boolean;
  /** Houses whose windows never light can share one `darkGlass()` material, so a whole town draws in a few calls. */
  glass?: THREE.ShaderMaterial; upper?: number; balcony?: boolean; flowers?: number; eave?: number }
export interface House { root: THREE.Group; glass: THREE.ShaderMaterial; lamp: THREE.Sprite; height: number }

const DARK_GLASS = hex(0x27384d), WARM_GLASS = hex(0xffd591);

/**
 * A plastered house with a pitched roof, its door on the +x gable. `upper` clads the top in timber and `balcony`
 * with `flowers` hangs a planted balcony across the front, which together make an alpine chalet. Its windows
 * are one material so a film can light them with `lightHouse`.
 */
export function house(o: HouseOpts = {}): House {
  const w = o.w ?? 6, d = o.d ?? 5, st = o.storeys ?? 1, h = o.h ?? 2.9 * st, pitch = o.pitch ?? 0.55;
  const wall = hex(o.wall ?? 0xf3ead8), roof = hex(o.roof ?? 0xc8553d), trim = wall.clone().multiplyScalar(0.8);
  const r = rnd(Math.round(w * 97 + d * 31 + st * 7 + pitch * 1000 + (o.roof ?? 0) % 997));
  const m = new Mesher();
  m.box(0, h / 2, 0, w, h, d, wall);
  if (o.base) m.box(0, -o.base / 2, 0, w + 0.5, o.base, d + 0.5, hex(0xa39c90));
  // Stone plinth: a course of rough-cut blocks round the foot of the walls.
  const stone = hex(0xb9ad9c);
  for (const [len, along, fixed, axis] of [[w, 'x', d / 2, 'z'], [w, 'x', -d / 2, 'z'], [d, 'z', w / 2, 'x'], [d, 'z', -w / 2, 'x']] as const) {
    for (let a = -len / 2; a < len / 2 - 0.05;) {
      const bl = Math.min(len / 2 - a, 0.45 + r() * 0.4), c = a + bl / 2, col = stone.clone().multiplyScalar(0.86 + r() * 0.2);
      const out = Math.sign(fixed) * (Math.abs(fixed) + 0.035);
      if (along === 'x') m.box(c, 0.21, axis === 'z' ? out : 0, bl - 0.03, 0.42, 0.1, col);
      else m.box(out, 0.21, c, 0.1, 0.42, bl - 0.03, col);
      a += bl;
    }
  }
  // The roof is a slab whose underside clears the wall tops (cladding included) by 2 cm at any pitch or eave depth.
  const eave = o.eave ?? 0.5, th = 0.18, k = pitch * 1.6, clad = o.upper === undefined ? 0 : 0.06;
  const ex = w / 2 + eave, ez = d / 2 + eave, ridge = h + 0.02 + th + k * (d / 2 + clad), rh = ridge - h;
  const top = (z: number) => ridge - k * Math.abs(z), under = (z: number) => top(z) - th;
  const timber = o.upper === undefined ? wall : hex(o.upper), soffit = roof.clone().multiplyScalar(0.62), edge = roof.clone().multiplyScalar(0.8);
  const frame = o.upper === undefined ? hex(0xfbf3e2) : hex(0xf6ecd6), wood = hex(0x5a3a26);
  if (o.upper !== undefined) {
    const y0 = st > 1 ? 2.9 : h - 1.0;
    m.box(0, (y0 + h) / 2, 0, w + 2 * clad, h - y0, d + 2 * clad, timber);
    // Log ends (Gwettköpfe) stacked at the corners, the signature of an alpine log storey; they stop short of the eaves.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let y = y0 + 0.12; y < h - 0.3; y += 0.24) {
      const c = timber.clone().multiplyScalar(0.82 + 0.1 * Math.sin(y * 13 + sx));
      m.box(sx * (w / 2 + clad + 0.09), y, sz * (d / 2 - 0.12), 0.2, 0.2, 0.2, c);
      m.box(sx * (w / 2 - 0.12), y + 0.12, sz * (d / 2 + clad + 0.09), 0.2, 0.2, 0.2, c);
    }
  }
  // Shingled roof: staggered rows of boards, each row tilted a little under the slope so the rows catch the light.
  const rows = Math.max(6, Math.round(Math.hypot(ez, rh) / 0.42));
  for (const s of [-1, 1]) {
    m.c = V(0, h, 0);
    for (let i = 0; i < rows; i++) {
      const z0 = ez * (1 - i / rows), z1 = ez * (1 - (i + 1) / rows), cw = 0.5 + r() * 0.15, off = (i % 2) * cw * 0.5;
      for (let x = -ex - off; x < ex;) {
        const xa = Math.max(-ex, x), xb = Math.min(ex, x + cw);
        const tone = roof.clone().multiplyScalar(0.88 + r() * 0.14 + (i === rows - 1 ? -0.08 : 0));
        m.quad(V(xa, top(z0), s * z0), V(xb, top(z0), s * z0), V(xb, top(z1) - 0.035, s * z1), V(xa, top(z1) - 0.035, s * z1), tone);
        x += cw;
      }
    }
    m.quad(V(-ex, under(ez), s * ez), V(ex, under(ez), s * ez), V(ex, top(ez), s * ez), V(-ex, top(ez), s * ez), edge);
    for (const g of [-1, 1]) m.quad(V(g * ex, under(ez), s * ez), V(g * ex, under(0), 0), V(g * ex, ridge, 0), V(g * ex, top(ez), s * ez), edge);
    m.c = V(0, ridge + 20, 0);
    m.quad(V(-ex, under(ez), s * ez), V(ex, under(ez), s * ez), V(ex, under(0), 0), V(-ex, under(0), 0), soffit);
    m.c = V(0, h, 0);
    const gx = s * (w / 2 + clad), zw = d / 2 + clad;
    m.quad(V(gx, h, -zw), V(gx, h, zw), V(gx, under(zw), zw), V(gx, under(zw), -zw), timber);
    m.tri(V(gx, under(zw), -zw), V(gx, under(zw), zw), V(gx, under(0), 0), timber);
    // Carved barge boards under the verges, standing just proud of the gable.
    for (const g of [-1, 1]) {
      const bx = g * (w / 2 + clad + 0.14), zEnd = ez - 0.05, drop = 0.2;
      m.c = V(0, h, 0);
      m.quad(V(bx, under(0), 0), V(bx, under(zEnd), s * zEnd), V(bx, under(zEnd) - drop, s * zEnd), V(bx, under(0) - drop, 0), wood);
      m.c = V(g * 50, h, 0);
      m.quad(V(bx, under(0), 0), V(bx, under(zEnd), s * zEnd), V(bx, under(zEnd) - drop, s * zEnd), V(bx, under(0) - drop, 0), wood);
      m.c = V(0, h, 0);
      for (let z = 0.1; z < zEnd - 0.2; z += 0.32) {
        const y0 = under(z) - drop, y1 = under(z + 0.2) - drop;
        m.tri(V(bx, y0, s * z), V(bx, y1, s * (z + 0.2)), V(bx, (y0 + y1) / 2 - 0.09, s * (z + 0.1)), wood);
      }
    }
  }
  if (o.chimney ?? true) {
    const cx = -w * 0.22, cz = d * 0.18, ch = rh * 0.9 + 0.8, cy = h + rh * 0.75;
    m.box(cx, cy, cz, 0.7, ch, 0.7, trim);
    m.box(cx, cy + ch / 2 + 0.06, cz, 0.9, 0.12, 0.9, stone.clone().multiplyScalar(0.8));
    m.box(cx, cy + ch / 2 + 0.24, cz, 0.36, 0.24, 0.36, stone.clone().multiplyScalar(0.7));
  }
  // Front door with a painted surround, a step and a little hood.
  m.box(w / 2 + 0.03, 1.05, 0, 0.08, 2.1, 1.1, hex(o.door ?? 0x6b4a35));
  for (const z of [-0.62, 0.62]) m.box(w / 2 + 0.06, 1.1, z, 0.1, 2.2, 0.14, frame);
  m.box(w / 2 + 0.06, 2.24, 0, 0.1, 0.14, 1.38, frame);
  m.box(w / 2 + 0.3, 2.5, 0, 0.6, 0.08, 1.6, roof.clone().multiplyScalar(0.85));
  m.box(w / 2 + 0.25, 0.1, 0, 0.6, 0.2, 1.6, stone);
  // Windows: a painted frame, a cross mullion and a pair of shutters, the same on every face.
  const sh = o.shutters === false ? undefined : hex(o.shutters ?? 0x3f6f52), slat = sh?.clone().multiplyScalar(0.78);
  const win = (nx: number, nz: number, cx: number, cy: number, cz: number, ww: number) => {
    const t = (a: number, b: number) => (nx ? [a, b] : [b, a]) as [number, number];
    const out = 0.075;
    const at = (along: number, depth: number) => (nx ? [cx + nx * depth, cz + along] : [cx + along, cz + nz * depth]) as [number, number];
    const bx = (along: number, y: number, depth: number, la: number, ly: number, ld: number, col: THREE.Vector3) => {
      const [x, z] = at(along, depth), [sx, sz] = t(ld, la);
      m.box(x, y, z, sx, ly, sz, col);
    };
    bx(0, cy - 0.58, out, ww + 0.34, 0.12, 0.2, frame);
    bx(0, cy + 0.57, out, ww + 0.26, 0.1, 0.12, frame);
    for (const g of [-1, 1]) bx(g * (ww / 2 + 0.06), cy, out, 0.1, 1.1, 0.12, frame);
    bx(0, cy, out + 0.02, 0.05, 1.0, 0.04, frame);
    bx(0, cy + 0.12, out + 0.02, ww, 0.05, 0.04, frame);
    if (o.flowers !== undefined && cy < 2.2) {
      const bloom = hex(o.flowers), leaf = hex(0x4f8a3e);
      bx(0, cy - 0.72, 0.16, ww + 0.2, 0.2, 0.2, wood);
      for (let a = -ww / 2; a <= ww / 2 + 1e-3; a += ww / 3) {
        const [x, z] = at(a, 0.24);
        m.ball(x, cy - 0.58, z, 0.12, leaf.clone().multiplyScalar(0.9 + r() * 0.2), 0.8);
        m.ball(x + (r() - 0.5) * 0.08, cy - 0.5, z + (r() - 0.5) * 0.08, 0.07, bloom.clone().multiplyScalar(0.92 + r() * 0.16));
      }
    }
    if (sh && slat) for (const g of [-1, 1]) {
      const sa = g * (ww / 2 + 0.12 + ww * 0.26);
      bx(sa, cy, 0.05, ww * 0.5, 1.08, 0.05, sh);
      for (const yy of [-0.32, 0, 0.32]) bx(sa, cy + yy, 0.085, ww * 0.42, 0.06, 0.03, slat);
    }
  };
  const gm = new Mesher();
  for (let s = 0; s < st; s++) {
    const y = 1.55 + s * 2.9;
    for (const z of o.frontWindows === false ? [] : [-d * 0.3, d * 0.3]) if (s > 0 || Math.abs(z) > 0.9) { gm.box(w / 2 + 0.04, y, z, 0.06, 1.0, 0.8, hex(0xffffff)); win(1, 0, w / 2, y, z, 0.8); }
    for (const sg of [-1, 1]) for (const x of [-w * 0.25, w * 0.25]) { gm.box(x, y, sg * (d / 2 + 0.04), 0.9, 1.0, 0.06, hex(0xffffff)); win(0, sg, x, y, sg * (d / 2 + clad * (s > 0 || st === 1 ? 1 : 0)), 0.9); }
    gm.box(-w / 2 - 0.04, y, 0, 0.06, 1.0, 0.9, hex(0xffffff));
    win(-1, 0, -w / 2, y, 0, 0.9);
  }
  if (o.balcony) {
    // A carved balcony: boards with a waisted cut-out between them, a top rail, and geraniums spilling over.
    const by = st > 1 ? 2.9 : h - 0.2, bw = timber.clone().multiplyScalar(0.8), bx = w / 2 + 1.05, span = d + 0.5;
    m.box(w / 2 + 0.55, by, 0, 1.1, 0.14, span, bw);
    for (let z = -span / 2 + 0.08; z < span / 2 - 0.05; z += 0.19) {
      m.box(bx, by + 0.22, z, 0.06, 0.3, 0.15, bw);
      m.box(bx, by + 0.46, z, 0.06, 0.18, 0.08, bw);
      m.box(bx, by + 0.7, z, 0.06, 0.3, 0.15, bw);
    }
    m.box(bx, by + 0.9, 0, 0.12, 0.1, span + 0.06, bw.clone().multiplyScalar(0.9));
    m.box(bx, by + 0.09, 0, 0.1, 0.06, span, bw.clone().multiplyScalar(0.9));
    for (const z of [-span / 2, span / 2]) m.box(w / 2 + 0.55, by + 0.47, z, 1.1, 0.86, 0.08, bw);
    if (o.flowers !== undefined) {
      const bloom = hex(o.flowers), leaf = hex(0x4f8a3e);
      m.box(bx + 0.14, by + 1.0, 0, 0.22, 0.18, span - 0.2, wood);
      for (let z = -span / 2 + 0.25; z < span / 2 - 0.2; z += 0.3) {
        m.ball(bx + 0.18, by + 1.12, z, 0.15, leaf.clone().multiplyScalar(0.9 + r() * 0.2), 0.75);
        m.ball(bx + 0.26, by + 0.98, z + 0.1, 0.11, leaf, 1.1);
        for (let f = 0; f < 2; f++) m.ball(bx + 0.2 + r() * 0.1, by + 1.2 + r() * 0.08, z + (r() - 0.5) * 0.22, 0.075, bloom.clone().multiplyScalar(0.92 + r() * 0.16));
      }
    }
  }
  const root = finish(m);
  const glass = o.glass ?? darkGlass();
  const panes = new THREE.Mesh(gm.geo().crisp, glass);
  panes.userData.noShadow = true;
  root.add(panes);
  const lamp = glow(0xffb85c, Math.max(w, d) * 1.7, 0);
  lamp.visible = false;
  lamp.position.set(w * 0.3, 1.6, 0);
  root.add(lamp);
  return { root, glass, lamp, height: h + rh };
}

const rnd = (seed: number) => () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);

/** Unlit window glass; pass one to many houses through `HouseOpts.glass`. */
export const darkGlass = () => toon({ color: 0x27384d, emissive: 0xffc46b, emisAmt: 0, spec: 0.5 });

/** 0 dark, 1 lit from inside. */
export function lightHouse(hs: House, a: number) {
  (hs.glass.uniforms.uBase.value as THREE.Vector3).lerpVectors(DARK_GLASS, WARM_GLASS, a);
  hs.glass.uniforms.uEmis.value = a * 0.85;
  hs.lamp.material.opacity = a * 0.22;
  hs.lamp.visible = a > 0.001;
}

export interface PlacedHouse { house: House; x: number; y: number; z: number; yaw: number; scale?: number }

/** Bakes placed houses into one mesh per material, so a whole town draws in three calls. */
export function bakeTown(placed: PlacedHouse[]): THREE.Group {
  const parts: THREE.BufferGeometry[][] = [[], [], []], mats: THREE.Material[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const o of placed) {
    m.compose(p.set(o.x, o.y, o.z), q.setFromEuler(e.set(0, o.yaw, 0)), s.setScalar(o.scale ?? 1));
    (o.house.root.children.slice(0, 3) as THREE.Mesh[]).forEach((c, i) => { parts[i].push(c.geometry.clone().applyMatrix4(m)); mats[i] = c.material as THREE.Material; });
  }
  const g = new THREE.Group();
  parts.forEach((gs, i) => { const geo = mergeGeometries(gs); if (geo) g.add(new THREE.Mesh(geo, mats[i])); });
  return g;
}

/** A plank pier running along +x from the origin, standing on piles. */
export function pier(length: number, width = 3.2, deck = 1.2): THREE.Group {
  const m = new Mesher(), wood = hex(0xa67c52), dark = hex(0x6f5238);
  const n = Math.round(length / 0.62);
  for (let i = 0; i < n; i++) m.box((i + 0.5) * (length / n), deck, 0, length / n - 0.07, 0.14, width, wood.clone().multiplyScalar(0.9 + 0.14 * ((i * 7) % 3) / 2));
  for (let x = 1; x < length; x += 4.2) for (const s of [-1, 1]) m.cyl(x, -2.6, s * (width / 2 - 0.2), deck + 0.55, 0.19, dark, 8);
  for (const s of [-1, 1]) m.box(length / 2, deck - 0.16, s * (width / 2 - 0.2), length, 0.18, 0.2, dark);
  return finish(m);
}

export type TreeKind = 'round' | 'cypress' | 'palm' | 'fir';
export interface TreeSpot { x: number; y: number; z: number; s?: number; kind?: TreeKind }

function paint(g: THREE.BufferGeometry, c: THREE.Vector3): THREE.BufferGeometry {
  const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.x, c.y, c.z], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

const SUN = new THREE.Vector3(0.4, 0.8, 0.3).normalize();

/**
 * A painted crown: noise-warped clumps around a centre whose normals bend toward the crown's own sphere, so light
 * falls across the whole canopy in soft cel bands instead of on every facet. Vertex colours run from a cool shaded
 * underside to a warm sunlit top.
 */
function crown(parts: THREE.BufferGeometry[], c: THREE.Vector3, rx: number, ry: number, n: number, base: THREE.Vector3, r: () => number, bend = 0.5) {
  const shade = base.clone().multiply(new THREE.Vector3(0.62, 0.74, 0.86)), lit = base.clone().multiply(new THREE.Vector3(1.16, 1.12, 0.9)), p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + r() * 0.6, e = Math.asin(Math.min(0.95, Math.max(-0.6, 1 - 2 * (i + 0.5) / n + (r() - 0.5) * 0.2))), rad = rx * (0.36 + r() * 0.16);
    const off = new THREE.Vector3(Math.cos(a) * Math.cos(e) * rx * 0.62, Math.sin(e) * ry * 0.62, Math.sin(a) * Math.cos(e) * rx * 0.62);
    const g = new THREE.IcosahedronGeometry(rad, 1), pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = new Float32Array(pos.count * 3), ph = r() * 10;
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k);
      const d = p.clone().normalize(), wob = 1 + 0.13 * Math.sin(d.x * 5 + ph) * Math.sin(d.y * 4 - ph) + 0.07 * Math.sin(d.z * 9 + ph * 2);
      p.multiplyScalar(wob).multiply(new THREE.Vector3(1, 0.86, 1)).add(off).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
      q.copy(p).sub(c).multiply(new THREE.Vector3(1, rx / ry, 1)).normalize().lerp(d, 1 - bend).normalize();
      nor.setXYZ(k, q.x, q.y, q.z);
      const lightness = Math.min(1, Math.max(0, 0.55 * q.dot(SUN) + 0.5 * ((p.y - c.y) / ry) + 0.45));
      const k3 = shade.clone().lerp(lit, lightness * lightness * (3 - 2 * lightness));
      col.set([k3.x, k3.y, k3.z], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
}

/** One tier of a fir: an open cone with a jagged, drooping hem, darker underneath. */
function firTier(radius: number, height: number, y: number, base: THREE.Vector3, r: () => number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, height, 14, 2, true), pos = g.getAttribute('position'), p = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    p.fromBufferAttribute(pos, k);
    if (p.y < -height / 2 + 1e-4) { const a = Math.atan2(p.z, p.x), j = 0.18 + 0.22 * Math.abs(Math.sin(a * 7 + radius * 3)) + r() * 0.1; p.y -= j * height * 0.45; p.x *= 1.04; p.z *= 1.04; }
    pos.setXYZ(k, p.x, p.y + y, p.z);
  }
  g.computeVertexNormals();
  const out = g.toNonIndexed(), op = out.getAttribute('position'), on = out.getAttribute('normal'), col = new Float32Array(op.count * 3), q = new THREE.Vector3();
  for (let k = 0; k < op.count; k++) {
    p.fromBufferAttribute(op, k);
    q.fromBufferAttribute(on, k).lerp(new THREE.Vector3(p.x, 0.6, p.z).normalize(), 0.45).normalize();
    on.setXYZ(k, q.x, q.y, q.z);
    const t = Math.min(1, Math.max(0, (p.y - (y - height / 2)) / height)), k3 = base.clone().multiplyScalar(0.72 + 0.4 * t);
    col.set([k3.x, k3.y, k3.z], k * 3);
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.deleteAttribute('uv');
  return out;
}

function tree(kind: TreeKind, r: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [], bark = hex(0x6b4a35);
  const green = hex([0x4f9a52, 0x62ad5a, 0x3f8750, 0x7ab85c][Math.floor(r() * 4)]);
  if (kind === 'cypress') {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6).translate(0, 0.6, 0), bark));
    crown(parts, new THREE.Vector3(0, 4.4, 0), 1.0, 3.6, 6, hex(0x2f6b4a), r, 0.85);
  } else if (kind === 'fir') {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.26, 1.8, 7).translate(0, 0.9, 0), bark));
    const dark = hex([0x2f6b4a, 0x27603f, 0x35775a][Math.floor(r() * 3)]);
    for (let i = 0; i < 4; i++) parts.push(firTier(2.3 - i * 0.5, 3.0 - i * 0.2, 2.5 + i * 1.7, dark.clone().multiplyScalar(0.92 + i * 0.07), r));
  } else if (kind === 'palm') {
    const lean = (r() - 0.5) * 0.5;
    for (let i = 0; i < 5; i++) parts.push(paint(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, 1.3, 6).translate(lean * i * i * 0.12, 0.65 + i * 1.2, 0), bark.clone().multiplyScalar(1.1)));
    const tx = lean * 25 * 0.12, ty = 6.2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r();
      const leaf = new THREE.SphereGeometry(1, 6, 4).scale(1.9, 0.14, 0.5).translate(1.7, 0, 0).rotateZ(-0.42 - r() * 0.25).rotateY(a).translate(tx, ty, 0);
      parts.push(paint(leaf, green.clone().multiplyScalar(0.9 + (k % 2) * 0.16)));
    }
  } else {
    const th = 1.7 + r() * 1.1, lean = (r() - 0.5) * 0.3;
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.3, th + 1.2, 7).translate(0, (th + 1.2) / 2, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, lean * 0.2, 0, 0, 0)), bark));
    for (const s of [-1, 1]) parts.push(paint(new THREE.CylinderGeometry(0.06, 0.11, 1.3, 5).translate(0, 0.65, 0).rotateZ(s * 0.75).translate(0, th + 0.2, 0), bark));
    const rx = 2.0 + r() * 0.7;
    crown(parts, new THREE.Vector3(lean * 0.5, th + rx * 0.95, 0), rx, rx * 0.95, 10 + Math.floor(r() * 4), green, r);
  }
  return parts;
}

/** Many trees as one inked mesh. Each spot is the foot of a trunk. */
export function grove(spots: TreeSpot[], seed = 11, ink = 1.6): THREE.Group {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (const s of spots) {
    const sc = (s.s ?? 1) * (0.85 + r() * 0.35), yaw = r() * Math.PI * 2;
    for (const p of tree(s.kind ?? 'round', r)) parts.push(p.rotateY(yaw).scale(sc, sc, sc).translate(s.x, s.y, s.z));
  }
  const g = mergeGeometries(parts)!;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, toon({ vertexColors: true, spec: 0 })), new THREE.Mesh(g, outline(ink)));
  return group;
}

/** A stack of sacks or crates for a quay or a deck, centred on the origin. */
export function cargo(count = 5, kind: 'sack' | 'crate' = 'sack', seed = 5): THREE.Group {
  const r = rng(seed), m = new Mesher();
  for (let i = 0; i < count; i++) {
    const layer = i < Math.ceil(count * 0.6) ? 0 : 1, x = (r() - 0.5) * (layer ? 0.8 : 1.9), z = (r() - 0.5) * (layer ? 0.6 : 1.4);
    if (kind === 'sack') m.box(x, 0.24 + layer * 0.44, z, 0.95, 0.44, 0.6, hex(0xc9a56a).multiplyScalar(0.88 + r() * 0.2), 0.7);
    else m.box(x, 0.35 + layer * 0.7, z, 0.75, 0.7, 0.75, hex(0xb98b57).multiplyScalar(0.85 + r() * 0.25));
  }
  return finish(m);
}

/** A cone of light for a lighthouse or a searchlight, pointing along +x from the origin. Fade it with `uVis`. */
export function lightBeam(length = 400, spread = 0.07, color = 0xffe9a8): THREE.Mesh {
  const g = new THREE.CylinderGeometry(length * spread, 0.4, length, 20, 1, true).rotateZ(Math.PI / 2).translate(length / 2, 0, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: hex(color) }, uVis: { value: 1 }, uLen: { value: length } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vA; varying vec3 vN, vV; void main(){ vA = position.x; vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uVis, uLen; varying float vA; varying vec3 vN, vV; void main(){
      float along = 1.-smoothstep(0., uLen, vA);
      float body = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
      gl_FragColor = vec4(uCol, along*along*body*uVis*.2); }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

export interface Stall { root: THREE.Group; awning: THREE.Group }

/** A market stall facing +x: a counter of goods under a striped awning. Scale `awning.scale.y` to raise or drop the cloth. */
export function stall(stripe = 0xc8553d, goods = 0xf2c14a): Stall {
  const m = new Mesher(), wood = hex(0x9a6f45);
  m.box(0, 0.5, 0, 1.3, 1.0, 2.8, wood);
  m.box(0, 1.03, 0, 1.5, 0.08, 3.0, wood.clone().multiplyScalar(1.15));
  for (const z of [-1.4, 1.4]) for (const x of [-0.7, 0.7]) m.cyl(x, 0, z, 2.6, 0.06, wood.clone().multiplyScalar(0.7), 6);
  for (let i = 0; i < 6; i++) m.cyl(0.1 - (i % 2) * 0.35, 1.07, -1.05 + i * 0.42, 1.25, 0.2, hex(goods).multiplyScalar(0.9 + (i % 3) * 0.08), 10, 0.2);
  const root = finish(m), a = new Mesher();
  a.c = null;
  for (let i = 0; i < 6; i++) {
    const z0 = -1.6 + i * (3.2 / 6), z1 = z0 + 3.2 / 6, c = i % 2 ? hex(0xfff6e6) : hex(stripe);
    a.quad(new THREE.Vector3(-0.9, 0.1, z0), new THREE.Vector3(1.2, -0.5, z0), new THREE.Vector3(1.2, -0.5, z1), new THREE.Vector3(-0.9, 0.1, z1), c);
    a.quad(new THREE.Vector3(1.2, -0.5, z0), new THREE.Vector3(1.2, -0.78, z0), new THREE.Vector3(1.2, -0.78, z1), new THREE.Vector3(1.2, -0.5, z1), c);
  }
  const cloth = new THREE.Mesh(a.geo().crisp, toon({ vertexColors: true, spec: 0, side: THREE.DoubleSide }));
  const awning = new THREE.Group();
  awning.position.y = 2.6;
  awning.add(cloth);
  root.add(awning);
  return { root, awning };
}

/** A village church with an onion dome, its door on +x. About 30 m to the top of the spire. */
export function church(wall = 0xf7f1e3, roof = 0x8a4a3a, dome = 0x4f7a6a): THREE.Group {
  const m = new Mesher(), W = hex(wall), R = hex(roof);
  m.box(-7, 4, 0, 16, 8, 8, W);
  m.c = new THREE.Vector3(-7, 8, 0);
  for (const s of [-1, 1]) {
    m.quad(V(-15.4, 7.8, s * 4.5), V(1.2, 7.8, s * 4.5), V(1.2, 12.4, 0), V(-15.4, 12.4, 0), R);
    m.tri(V(s === 1 ? 1 : -15, 8, -4), V(s === 1 ? 1 : -15, 8, 4), V(s === 1 ? 1 : -15, 12.2, 0), W);
  }
  m.box(3.2, 9, 0, 5, 18, 5, W);
  m.box(5.74, 1.5, 0, 0.12, 3, 1.7, hex(0x6b4a35));
  for (const y of [8, 13]) m.box(5.74, y, 0, 0.12, 1.8, 0.9, hex(0x27384d));
  m.box(5.76, 15.6, 0, 0.1, 1.5, 1.5, hex(0xfff6e0));
  for (const s of [-1, 1]) for (const x of [-12, -8.5, -5, -1.5]) m.box(x, 4.4, s * 4.03, 1.0, 2.6, 0.1, hex(0x27384d));
  // Baroque detail: painted corner pilasters and cornice bands, arched window heads, belfry louvres on every face,
  // a clock with gilded hands, a plinth, and shingle courses on the nave roof.
  const ochre = hex(0xe8c98e), stone = hex(0xb9ad9c), gold = hex(0xe2b45a), dark = hex(0x3a2a22);
  m.box(-7, 0.3, 0, 16.3, 0.6, 8.3, stone);
  m.box(3.2, 0.35, 0, 5.3, 0.7, 5.3, stone);
  for (const y of [7.9, 12.0, 17.8]) m.box(3.2, y, 0, 5.36, 0.3, 5.36, ochre);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    m.box(3.2 + sx * 2.45, 9, sz * 2.45, 0.35, 18, 0.35, ochre);
    m.box(-7 + sx * 7.85, 4, sz * 3.85, 0.4, 8, 0.4, ochre);
  }
  for (const s of [-1, 1]) for (const x of [-12, -8.5, -5, -1.5]) {
    m.box(x, 5.95, s * 4.06, 1.3, 0.35, 0.12, ochre);
    m.box(x, 3.0, s * 4.06, 1.3, 0.16, 0.14, ochre);
  }
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const box = (along: number, y: number, out: number, la: number, ly: number, ld: number, c: THREE.Vector3) =>
      nx ? m.box(3.2 + nx * (2.5 + out), y, along, ld, ly, la, c) : m.box(3.2 + along, y, nz * (2.5 + out), la, ly, ld, c);
    box(0, 14.9, 0.02, 1.7, 3.0, 0.1, dark);
    for (let k = 0; k < 6; k++) box(0, 13.8 + k * 0.42, 0.1, 1.6, 0.12, 0.08, ochre.clone().multiplyScalar(0.85));
    box(0, 16.55, 0.06, 1.95, 0.3, 0.14, ochre);
    if (nx === 1) {
      box(0, 10.0, 0.04, 2.0, 2.0, 0.08, hex(0xfff6e0));
      box(0, 10.0, 0.08, 2.2, 0.12, 0.06, gold);
      box(0, 10.0, 0.08, 0.12, 2.2, 0.06, gold);
      box(0.28, 10.25, 0.12, 0.1, 0.7, 0.06, dark);
      box(0, 10.4, 0.14, 0.1, 0.9, 0.06, dark);
    }
  }
  const Rn = R.clone();
  for (const s of [-1, 1]) for (let i = 1; i < 9; i++) {
    const t = i / 9, y = 7.8 + 4.6 * t + 0.03, z = s * 4.5 * (1 - t);
    m.c = new THREE.Vector3(-7, 8, 0);
    m.box(-7.1, y, z, 16.6, 0.07, 0.12, Rn.clone().multiplyScalar(0.82));
  }
  const root = finish(m);
  const D = hex(dome), prof: [number, number][] = [[2.9, 18], [3.3, 19.2], [3.0, 20.6], [1.6, 22.2], [0.75, 23.4], [0.55, 24.6], [1.2, 25.6], [1.25, 26.4], [0.5, 27.6], [0.08, 30.2]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const lg = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(36), 16).translate(3.2, 0, 0);
  const n = lg.getAttribute('position').count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([D.x, D.y, D.z], i * 3);
  lg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  root.add(new THREE.Mesh(lg, toon({ vertexColors: true, spec: 0.3 })), new THREE.Mesh(lg, outline(2)));
  return root;
}

/** Small blossoms scattered over the ground as one mesh; each spot is where a stem meets the grass. */
export function flowers(spots: { x: number; y: number; z: number }[], colors = [0xffffff, 0xffd84a, 0xe8527a, 0x9a7ae0], seed = 3): THREE.Mesh {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (const s of spots) {
    const g = new THREE.ConeGeometry(0.11 + r() * 0.07, 0.1, 5).rotateX(Math.PI).translate(s.x, s.y + 0.22 + r() * 0.16, s.z);
    parts.push(paint(g, hex(colors[Math.floor(r() * colors.length)])));
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return new THREE.Mesh(g, toon({ vertexColors: true, spec: 0, emissive: 0xffffff, emisAmt: 0.06 }));
}

/** A post-and-rail fence along a line of points, following the ground. */
export function fence(line: { x: number; z: number }[], height: (x: number, z: number) => number, gap = 2.6): THREE.Group {
  const m = new Mesher(), wood = hex(0x8a6a4a);
  m.c = null;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / gap));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n, p = V(x, height(x, z), z);
      m.c = V(x, p.y + 0.5, z);
      m.box(x, p.y + 0.55, z, 0.14, 1.1, 0.14, wood);
      m.c = null;
      if (prev) for (const y of [0.45, 0.9]) {
        const u = V(0, 0.05, 0), q0 = prev.clone().setY(prev.y + y), q1 = p.clone().setY(p.y + y);
        m.quad(q0.clone().sub(u), q1.clone().sub(u), q1.clone().add(u), q0.clone().add(u), wood.clone().multiplyScalar(1.1));
      }
      prev = p;
    }
  }
  const { crisp } = m.geo();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(crisp, toon({ vertexColors: true, spec: 0, side: THREE.DoubleSide })));
  return g;
}
