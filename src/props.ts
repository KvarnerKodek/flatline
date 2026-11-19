import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outline, glow, hex } from './toon';

const MAT = toon({ vertexColors: true, spec: 0.1 });
const INK = outline(2.2);
const MAT_SAIL = toon({ vertexColors: true, spec: 0, side: THREE.DoubleSide });

export class Mesher {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  c: THREE.Vector3 | null = new THREE.Vector3();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: THREE.Vector3) {
    const n = this.pos.length / 3;
    if (this.c) {
      const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const cen = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3).sub(this.c);
      if (nrm.dot(cen) < 0) [b, c] = [c, b];
    }
    for (const p of [a, b, c]) { this.pos.push(p.x, p.y, p.z); this.col.push(col.x, col.y, col.z); }
    this.idx.push(n, n + 1, n + 2);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, col: THREE.Vector3) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: THREE.Vector3, taper = 1) {
    this.c = new THREE.Vector3(cx, cy, cz);
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const tz = (sz / 2) * (1 - taper);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const A = v(x0, y0, z0), B = v(x1, y0, z0), C = v(x1, y0, z1), D = v(x0, y0, z1);
    const E = v(x0, y1, z0 + tz), F = v(x1, y1, z0 + tz), Gv = v(x1, y1, z1 - tz), H = v(x0, y1, z1 - tz);
    this.quad(E, H, Gv, F, col);
    this.quad(A, E, F, B, col);
    this.quad(D, C, Gv, H, col);
    this.quad(A, D, H, E, col);
    this.quad(B, F, Gv, C, col);
    this.quad(A, B, C, D, col);
  }
  cyl(x: number, y0: number, z: number, y1: number, r: number, col: THREE.Vector3, seg = 8, r1 = r) {
    this.c = new THREE.Vector3(x, (y0 + y1) / 2, z);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p = (a: number, y: number, rr: number) => new THREE.Vector3(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr);
      this.quad(p(a0, y0, r), p(a1, y0, r), p(a1, y1, r1), p(a0, y1, r1), col);
      this.tri(p(a0, y1, r1), p(a1, y1, r1), new THREE.Vector3(x, y1, z), col);
    }
  }
  geo(): { smooth: THREE.BufferGeometry; crisp: THREE.BufferGeometry } {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return { smooth: g, crisp: toCreasedNormals(g.clone(), Math.PI / 3.5) };
  }
}

export interface Station { t: number; w: number; d: number; y: number }

export function hullLoft(m: Mesher, L: number, beam: number, depth: number, deckY: number, st: Station[], hullC: THREE.Vector3, deckC: THREE.Vector3, stripeC: THREE.Vector3) {
  const N = 7;
  m.c = new THREE.Vector3(0, 0, 0);
  const rings: THREE.Vector3[][] = st.map((s) => {
    const hw = (beam / 2) * s.w, dp = depth * s.d, top = deckY + s.y, x = (s.t - 0.5) * L;
    const r: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI;
      const ex = Math.pow(Math.abs(Math.cos(a)), 0.8) * Math.sign(Math.cos(a));
      r.push(new THREE.Vector3(x, i === 0 || i === N ? top : top - (Math.sin(a) * (top + dp)) , ex * hw));
    }
    return r;
  });
  for (let s = 0; s < rings.length - 1; s++)
    for (let i = 0; i < N; i++) {
      const a = rings[s][i], b = rings[s][i + 1], c = rings[s + 1][i + 1], d = rings[s + 1][i];
      const yy = (a.y + b.y + c.y + d.y) / 4;
      const col = yy > -0.18 && yy < 0.2 ? stripeC : hullC;
      m.quad(a, d, c, b, yy > -0.18 && yy < 0.2 ? stripeC : col);
    }
  for (let s = 0; s < rings.length - 1; s++) {
    const a = rings[s][0], b = rings[s][N], c = rings[s + 1][N], d = rings[s + 1][0];
    m.quad(a, b, c, d, deckC);
  }
  const f = rings[0], l = rings[rings.length - 1];
  for (let i = 0; i < N; i++) {
    m.tri(f[i], f[i + 1], new THREE.Vector3(f[0].x, f[0].y - 0.2, 0), hullC);
    m.tri(l[i + 1], l[i], new THREE.Vector3(l[0].x, l[0].y - 0.2, 0), hullC);
  }
}

export function finish(m: Mesher, mat: THREE.ShaderMaterial = MAT): THREE.Group {
  const { smooth, crisp } = m.geo();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(crisp, mat), new THREE.Mesh(smooth, INK));
  return g;
}

export interface Craft { root: THREE.Group; lamps: THREE.Sprite[]; length: number }

const FISH_ST: Station[] = [
  { t: 0, w: 0.08, d: 0.45, y: 0.55 }, { t: 0.15, w: 0.62, d: 0.8, y: 0.38 }, { t: 0.4, w: 0.98, d: 1, y: 0.18 },
  { t: 0.7, w: 1, d: 1, y: 0.1 }, { t: 1, w: 0.8, d: 0.85, y: 0.12 },
];
const SAIL_ST: Station[] = [
  { t: 0, w: 0.05, d: 0.5, y: 0.28 }, { t: 0.12, w: 0.55, d: 0.7, y: 0.14 }, { t: 0.4, w: 0.95, d: 0.95, y: 0.05 },
  { t: 0.7, w: 1, d: 0.85, y: 0.04 }, { t: 1, w: 0.7, d: 0.6, y: 0.1 },
];
const MOTOR_ST: Station[] = [
  { t: 0, w: 0.05, d: 0.5, y: 0.3 }, { t: 0.2, w: 0.7, d: 0.8, y: 0.12 }, { t: 0.5, w: 1, d: 1, y: 0.05 },
  { t: 1, w: 0.9, d: 0.9, y: 0.05 },
];

export function fishingBoat(hullColor = 0x2b3b52, cabin = 0xd8dde4): Craft {
  const m = new Mesher();
  const L = 9.5;
  hullLoft(m, L, 3.1, 1.2, 0.75, FISH_ST, hex(hullColor), hex(0x7b8794), hex(0xb8332b));
  m.box(1.1, 1.65, 0, 2.6, 1.6, 2.1, hex(cabin), 0.85);
  m.box(1.1, 2.55, 0, 2.9, 0.18, 2.4, hex(0x394553));
  m.box(1.1, 1.8, 1.07, 1.8, 0.5, 0.05, hex(0x24384d));
  m.cyl(-0.4, 1.3, 0, 5.4, 0.07, hex(0x394553));
  m.cyl(-1.8, 1.0, 0, 2.5, 0.05, hex(0x394553));
  for (let i = 0; i < 4; i++) m.box(-3.1 + i * 0.5, 1.15, 0.0, 0.34, 0.3, 0.3, hex(0xd9742c));
  const root = finish(m);
  root.position.y = 0;
  return { root: wrap(root), lamps: [], length: L };
}

export function sailboat(sail = 0xf5f1e4, hullC = 0xf0efe9, lights = true, sailC2 = 0xe8e2d0): Craft {
  const m = new Mesher();
  const L = 11;
  hullLoft(m, L, 3.4, 1.7, 0.7, SAIL_ST, hex(hullC), hex(0xc9b08a), hex(0x2c4a7c));
  m.box(0.4, 1.0, 0, 3, 0.55, 1.9, hex(0xe6e4dc), 0.8);
  m.cyl(0.6, 0.7, 0, 14.5, 0.09, hex(0xcfd6dc));
  m.cyl(0.1, 1.5, 0, 1.6, 0.05, hex(0xcfd6dc));
  const root = finish(m);
  const sm = new Mesher();
  sm.c = null;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  sm.tri(V(0.45, 1.7, 0.05), V(0.45, 14.2, 0.05), V(-4.4, 1.7, 0.4), hex(sail));
  sm.tri(V(0.7, 2.0, -0.04), V(0.7, 13.0, -0.04), V(5.3, 1.8, -0.5), hex(sailC2));
  const sails = finish(sm, MAT_SAIL);
  const w = new THREE.Group();
  w.add(root, sails);
  const lamps: THREE.Sprite[] = [];
  if (lights) {
    const mk = (c: number, x: number, y: number, z: number, s = 1.3) => { const l = glow(c, s, 0.95); l.position.set(x, y, z); w.add(l); lamps.push(l); };
    mk(0xff3b30, 4.2, 1.1, -1.4); mk(0x30e07a, 4.2, 1.1, 1.4); mk(0xfff3d0, 0.6, 14.6, 0, 1.6);
    mk(0xfff3d0, -5.2, 1.4, 0, 1.0);
  }
  return { root: wrap(w), lamps, length: L };
}

export function motorBoat(hullC = 0xf4f4f0, accent = 0x1d6fa8, lights = false): Craft {
  const m = new Mesher();
  const L = 8;
  hullLoft(m, L, 2.8, 0.9, 0.7, MOTOR_ST, hex(hullC), hex(0xd0c4a8), hex(accent));
  m.box(-0.3, 1.45, 0, 3.4, 1.2, 2.2, hex(0xf2f4f6), 0.78);
  m.box(-0.3, 2.1, 0, 3.6, 0.14, 2.4, hex(0x37424d));
  m.box(1.1, 1.65, 0, 0.1, 0.55, 1.9, hex(0x1d2d3d));
  m.cyl(-1.4, 2.1, 0, 3.6, 0.04, hex(0x37424d));
  const root = finish(m);
  const lamps: THREE.Sprite[] = [];
  if (lights) {
    const mk = (c: number, x: number, y: number, z: number, s = 1.1) => { const l = glow(c, s, 0.95); l.position.set(x, y, z); root.add(l); lamps.push(l); };
    mk(0xff3b30, 2.6, 1.2, -1.1); mk(0x30e07a, 2.6, 1.2, 1.1); mk(0xfff3d0, -1.4, 3.7, 0, 1.3);
  }
  return { root: wrap(root), lamps, length: L };
}

export function ferry(): Craft {
  const m = new Mesher();
  const L = 70;
  hullLoft(m, L, 15, 4, 3.2, FISH_ST, hex(0x1d2f46), hex(0x8c97a3), hex(0xc7372f));
  m.box(0, 6.0, 0, 52, 4.2, 12.5, hex(0xe9edf2), 0.9);
  m.box(-3, 9.6, 0, 40, 3.2, 10.5, hex(0xe9edf2), 0.85);
  m.box(8, 12.6, 0, 14, 3.0, 8, hex(0xdfe5ea), 0.8);
  m.cyl(-12, 11, 0, 18, 1.8, hex(0xc7372f), 10);
  const root = finish(m);
  const lamps: THREE.Sprite[] = [];
  const W = toon({ color: 0xffd9a0, emissive: 0xffd9a0, emisAmt: 0.95 });
  const wm = new Mesher();
  for (let i = 0; i < 24; i++) {
    wm.box(-23 + i * 2, 6.2, 6.3, 1.0, 0.9, 0.05, hex(0xffe2b0));
    wm.box(-23 + i * 2, 6.2, -6.3, 1.0, 0.9, 0.05, hex(0xffe2b0));
  }
  for (let i = 0; i < 18; i++) {
    wm.box(-18 + i * 2, 9.8, 5.35, 1.0, 0.9, 0.05, hex(0xffe2b0));
    wm.box(-18 + i * 2, 9.8, -5.35, 1.0, 0.9, 0.05, hex(0xffe2b0));
  }
  const win = new THREE.Mesh(wm.geo().crisp, toon({ vertexColors: true, emissive: 0xffe2b0, emisAmt: 0.0 }));
  void W;
  const winMat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC*1.05,1.); }`,
    vertexColors: true,
  });
  win.material = winMat;
  root.add(win);
  const mk = (c: number, x: number, y: number, z: number, s: number) => { const l = glow(c, s, 0.9); l.position.set(x, y, z); root.add(l); lamps.push(l); };
  mk(0xff3b30, 30, 5, -7, 6); mk(0x30e07a, 30, 5, 7, 6); mk(0xfff3d0, 10, 17, 0, 9);
  return { root: wrap(root), lamps, length: L };
}

function wrap(o: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.add(o);
  return g;
}

export function buoy(color = 0xd8392b, lamp = 0xff4a3a): Craft {
  const m = new Mesher();
  m.cyl(0, -0.3, 0, 0.9, 0.55, hex(color), 10, 0.55);
  m.cyl(0, 0.9, 0, 2.4, 0.2, hex(0x2b3138), 8, 0.12);
  const root = finish(m);
  const l = glow(lamp, 2.6, 1);
  l.position.y = 2.6;
  root.add(l);
  return { root: wrap(root), lamps: [l], length: 1 };
}

export function lighthouse(): THREE.Group {
  const m = new Mesher();
  m.cyl(0, 0, 0, 22, 4, hex(0xe9ecee), 12, 2.6);
  m.cyl(0, 6, 0, 8, 3.4, hex(0xc7372f), 12, 3.2);
  m.cyl(0, 13, 0, 15, 3.1, hex(0xc7372f), 12, 2.9);
  m.cyl(0, 22, 0, 24.5, 3.1, hex(0x2b3138), 12, 3.1);
  m.cyl(0, 24.5, 0, 27, 2.0, hex(0xc7372f), 12, 0.1);
  const g = finish(m);
  const l = glow(0xffe9a8, 14, 1);
  l.position.y = 23.3;
  g.add(l);
  g.userData.lamp = l;
  return g;
}
