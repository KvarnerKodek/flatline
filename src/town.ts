import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outline, glow, hex } from './toon';
import { Mesher, finish } from './props';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface HouseOpts { w?: number; d?: number; h?: number; roof?: number; wall?: number; pitch?: number; chimney?: boolean; door?: number; storeys?: number; base?: number; upper?: number; balcony?: boolean; flowers?: number; eave?: number }
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
  const m = new Mesher();
  m.box(0, h / 2, 0, w, h, d, wall);
  m.box(0, 0.18, 0, w + 0.16, 0.36, d + 0.16, trim);
  if (o.base) m.box(0, -o.base / 2, 0, w + 0.5, o.base, d + 0.5, hex(0xa39c90));
  const eave = o.eave ?? 0.5, rh = (d / 2) * pitch * 1.6, ex = w / 2 + eave, ez = d / 2 + eave, ey = h - 0.12 - (eave - 0.5) * pitch * 1.6;
  const timber = o.upper === undefined ? wall : hex(o.upper);
  if (o.upper !== undefined) m.box(0, st > 1 ? (2.9 + h) / 2 : h - 0.5, 0, w + 0.12, st > 1 ? h - 2.9 : 1.0, d + 0.12, timber);
  m.c = V(0, h, 0);
  for (const s of [-1, 1]) {
    m.quad(V(-ex, ey, s * ez), V(ex, ey, s * ez), V(ex, h + rh, 0), V(-ex, h + rh, 0), roof);
    m.quad(V(-ex, ey - 0.16, s * ez), V(ex, ey - 0.16, s * ez), V(ex, ey, s * ez), V(-ex, ey, s * ez), roof.clone().multiplyScalar(0.8));
    m.tri(V(s * (w / 2 + 0.06), h, -d / 2), V(s * (w / 2 + 0.06), h, d / 2), V(s * (w / 2 + 0.06), h + rh * 0.92, 0), timber);
  }
  m.c = V(0, h - 1, 0);
  m.quad(V(-ex, ey - 0.16, -ez), V(ex, ey - 0.16, -ez), V(ex, ey - 0.16, ez), V(-ex, ey - 0.16, ez), roof.clone().multiplyScalar(0.7));
  if (o.chimney ?? true) m.box(-w * 0.22, h + rh * 0.75, d * 0.18, 0.7, rh * 0.9 + 0.8, 0.7, trim);
  m.box(w / 2 + 0.03, 1.05, 0, 0.08, 2.1, 1.1, hex(o.door ?? 0x6b4a35));
  m.box(w / 2 + 0.25, 0.1, 0, 0.6, 0.2, 1.6, trim);
  if (o.balcony) {
    const by = st > 1 ? 2.9 : h - 0.2, wood = timber.clone().multiplyScalar(0.8);
    m.box(w / 2 + 0.55, by, 0, 1.1, 0.14, d + 0.5, wood);
    m.box(w / 2 + 1.05, by + 0.5, 0, 0.1, 0.9, d + 0.5, wood);
    for (const z of [-d / 2 - 0.2, d / 2 + 0.2]) m.box(w / 2 + 0.55, by + 0.5, z, 1.1, 0.9, 0.1, wood);
    if (o.flowers !== undefined) for (let z = -d / 2; z < d / 2 - 0.1; z += 0.5) m.box(w / 2 + 1.16, by + 1.02 + 0.07 * Math.sin(z * 9), z + 0.25, 0.3, 0.3, 0.44, z * 4 % 3 < 1 ? hex(0x5fa04e) : hex(o.flowers));
  }
  const root = finish(m);

  const gm = new Mesher();
  for (let s = 0; s < st; s++) {
    const y = 1.55 + s * 2.9;
    for (const z of [-d * 0.3, d * 0.3]) if (s > 0 || Math.abs(z) > 0.9) gm.box(w / 2 + 0.04, y, z, 0.06, 1.0, 0.8, hex(0xffffff));
    for (const sg of [-1, 1]) for (const x of [-w * 0.25, w * 0.25]) gm.box(x, y, sg * (d / 2 + 0.04), 0.9, 1.0, 0.06, hex(0xffffff));
    gm.box(-w / 2 - 0.04, y, 0, 0.06, 1.0, 0.9, hex(0xffffff));
  }
  const glass = toon({ color: 0x27384d, emissive: 0xffc46b, emisAmt: 0, spec: 0.5 });
  root.add(new THREE.Mesh(gm.geo().crisp, glass));
  const fm = new Mesher();
  for (let s = 0; s < st; s++) for (const sg of [-1, 1]) for (const x of [-w * 0.25, w * 0.25]) fm.box(x, 0.98 + s * 2.9, sg * (d / 2 + 0.08), 1.1, 0.1, 0.16, trim);
  root.add(finish(fm));
  const lamp = glow(0xffb85c, Math.max(w, d) * 1.7, 0);
  lamp.position.set(w * 0.3, 1.6, 0);
  root.add(lamp);
  return { root, glass, lamp, height: h + rh };
}

/** 0 dark, 1 lit from inside. */
export function lightHouse(hs: House, a: number) {
  (hs.glass.uniforms.uBase.value as THREE.Vector3).lerpVectors(DARK_GLASS, WARM_GLASS, a);
  hs.glass.uniforms.uEmis.value = a * 0.85;
  hs.lamp.material.opacity = a * 0.22;
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

function tree(kind: TreeKind, r: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [], bark = hex(0x6b4a35);
  const green = hex([0x4f9a52, 0x62ad5a, 0x3f8750, 0x7ab85c][Math.floor(r() * 4)]);
  if (kind === 'cypress') {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 6).translate(0, 0.6, 0), bark));
    const c = new THREE.ConeGeometry(1.0, 7.5, 9).translate(0, 4.6, 0);
    parts.push(paint(c, hex(0x2f6b4a)));
  } else if (kind === 'fir') {
    parts.push(paint(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6).translate(0, 0.8, 0), bark));
    const dark = hex([0x2f6b4a, 0x27603f, 0x35775a][Math.floor(r() * 3)]);
    for (let i = 0; i < 4; i++) parts.push(paint(new THREE.ConeGeometry(2.3 - i * 0.48, 3.0, 8).translate(0, 2.4 + i * 1.75, 0), dark.clone().multiplyScalar(0.9 + i * 0.07)));
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
    const th = 1.6 + r() * 1.2;
    parts.push(paint(new THREE.CylinderGeometry(0.2, 0.3, th, 6).translate(0, th / 2, 0), bark));
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const rad = 1.3 + r() * 0.9;
      const b = new THREE.IcosahedronGeometry(rad, 1).scale(1, 0.82, 1).translate((r() - 0.5) * 1.9, th + 0.7 + r() * 1.5, (r() - 0.5) * 1.9);
      parts.push(paint(b, green.clone().multiplyScalar(0.88 + 0.22 * (i / n))));
    }
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
  g.computeVertexNormals();
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
