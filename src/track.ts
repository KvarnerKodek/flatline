import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, toon, outline, hex } from './toon';
import type { HeightFn } from './land';

export interface PathPoint { p: THREE.Vector3; yaw: number; pitch: number }

/**
 * A smooth route over the ground through a list of waypoints, measured in metres from its start: a railway, a
 * road, a flight line. It also answers "how far is this spot from the route", which lets terrain make way for it.
 */
export class Path {
  readonly length: number;
  readonly samples: THREE.Vector3[] = [];
  private grid = new Map<number, number[]>();
  private cell: number;

  constructor(waypoints: { x: number; z: number; y?: number }[], height: HeightFn, public step = 4, reach = 64) {
    const curve = new THREE.CatmullRomCurve3(waypoints.map((w) => new THREE.Vector3(w.x, w.y ?? height(w.x, w.z), w.z)), false, 'centripetal');
    this.length = curve.getLength();
    const n = Math.max(2, Math.round(this.length / step));
    this.step = this.length / n;
    for (let i = 0; i <= n; i++) this.samples.push(curve.getPointAt(i / n));
    this.cell = reach;
    this.samples.forEach((p, i) => {
      const k = this.key(Math.floor(p.x / reach), Math.floor(p.z / reach));
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(i);
    });
  }

  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }

  /** Position and heading `s` metres along the route. Forward is (cos yaw, sin yaw) in the x/z plane. */
  at(s: number, o: PathPoint = { p: new THREE.Vector3(), yaw: 0, pitch: 0 }): PathPoint {
    const f = Math.min(this.samples.length - 1.001, Math.max(0, s / this.step)), i = Math.floor(f);
    const a = this.samples[i], b = this.samples[i + 1];
    o.p.lerpVectors(a, b, f - i);
    o.yaw = Math.atan2(b.z - a.z, b.x - a.x);
    o.pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    return o;
  }

  /** The nearest point of the route within one `reach` of (x, z): its distance away, its height and how far along it is. */
  near(x: number, z: number): { d: number; y: number; s: number } | null {
    const ci = Math.floor(x / this.cell), cj = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (const k of this.grid.get(this.key(i, j)) ?? []) {
          const p = this.samples[k], d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < bd) { bd = d; best = k; }
        }
    return best < 0 ? null : { d: Math.sqrt(bd), y: this.samples[best].y, s: best * this.step };
  }

  /** Samples from `from` to `to` metres, for laying a ribbon along the route. */
  line(from = 0, to = this.length): THREE.Vector3[] {
    const a = Math.max(0, Math.floor(from / this.step)), b = Math.min(this.samples.length - 1, Math.ceil(to / this.step));
    return this.samples.slice(a, b + 1);
  }
}

/** Cuts a level bed for routes through `h`: within `flat` metres the ground takes the route's height, easing out to `flat + soft`. */
export function gradeFor(h: HeightFn, paths: Path[], flat = 5, soft = 22): HeightFn {
  return (x, z) => {
    let y = h(x, z), w = 0, ty = 0;
    for (const p of paths) {
      const n = p.near(x, z);
      if (!n || n.d > flat + soft) continue;
      const t = Math.min(1, Math.max(0, (flat + soft - n.d) / soft)), k = t * t * (3 - 2 * t);
      if (k > w) { w = k; ty = n.y; }
    }
    return y + (ty - y) * w;
  };
}

/** Sets an object on a route `s` metres along it, heading down the line and tilted to the grade. Its +x is forward. */
export function placeOnPath(o: THREE.Object3D, path: Path, s: number, lift = 0) {
  const q = path.at(s);
  o.position.set(q.p.x, q.p.y + lift, q.p.z);
  o.rotation.order = 'YZX';
  o.rotation.set(0, -q.yaw, q.pitch);
}

const GRAVEL = hex(0xb9ab96), TIE = hex(0x6b5340);

export interface Railway { group: THREE.Group; top: number }

/**
 * A single-track railway along a route: an embankment of ballast, sleepers and two rails. `top` is the height of the
 * rail head. The embankment runs down to 1.1 m below the route either side, so it stands clear of coarse ground.
 */
export function railway(path: Path, sleepers = true, from = 0, to = path.length): Railway {
  const pts = path.line(from, to), pos: number[] = [], col: number[] = [], idx: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, k: THREE.Vector3) => {
    const n = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(p.x, p.y, p.z); col.push(k.x, k.y, k.z); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const frame = (i: number) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const f = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    return { p: pts[i], f, r: new THREE.Vector3(-f.z, 0, f.x).normalize() };
  };
  const off = (fr: ReturnType<typeof frame>, side: number, up: number, fwd = 0) => fr.p.clone().addScaledVector(fr.r, side).addScaledVector(fr.f, fwd).setY(fr.p.y + up + fr.f.y * fwd);
  const steel = hex(0x59626c), shine = hex(0xc4ccd4), bedTop = 0.22, railTop = 0.42, toe = -1.1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = frame(i), b = frame(i + 1);
    quad(off(a, -1.25, bedTop), off(a, 1.25, bedTop), off(b, 1.25, bedTop), off(b, -1.25, bedTop), GRAVEL);
    for (const s of [-1, 1]) {
      quad(off(a, s * 1.25, bedTop), off(a, s * 3.1, toe), off(b, s * 3.1, toe), off(b, s * 1.25, bedTop), GRAVEL.clone().multiplyScalar(0.86));
      const x0 = s * 0.72 - 0.06, x1 = s * 0.72 + 0.06;
      quad(off(a, x0, railTop), off(a, x1, railTop), off(b, x1, railTop), off(b, x0, railTop), shine);
      quad(off(a, x0, bedTop), off(a, x0, railTop), off(b, x0, railTop), off(b, x0, bedTop), steel);
      quad(off(a, x1, railTop), off(a, x1, bedTop), off(b, x1, bedTop), off(b, x1, railTop), steel);
    }
    if (sleepers) for (const d of [0, path.step / 3, (path.step * 2) / 3]) {
      const y = bedTop + 0.07;
      quad(off(a, -1.05, y, d - 0.13), off(a, 1.05, y, d - 0.13), off(a, 1.05, y, d + 0.13), off(a, -1.05, y, d + 0.13), TIE);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, toon({ vertexColors: true, spec: 0.25, side: THREE.DoubleSide })));
  return { group, top: railTop };
}

/**
 * A band of light running along a route, lit between `from` and `to` metres with a bright tip at `head`. It keeps
 * a minimum width on screen, so a route still reads from a great height.
 */
export class Glowline {
  mesh: THREE.Mesh;
  private u = { uFrom: { value: 0 }, uTo: { value: 0 }, uHead: { value: 0 }, uVis: { value: 0 }, uWidth: { value: 1.6 }, uMinPx: { value: 1.6 }, uCol: { value: new THREE.Vector3(1, 0.6, 0.12) } };

  /** `solid` paints the band in its own colour, which holds its hue over bright ground; otherwise it adds light. */
  constructor(path: Path, lift = 0.5, color?: THREE.Vector3, solid = false) {
    if (color) this.u.uCol.value.copy(color);
    const pts = path.samples, pos: number[] = [], side: number[] = [], along: number[] = [], tan: number[] = [], idx: number[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      for (const s of [-1, 1]) { pos.push(p.x, p.y + lift, p.z); side.push(s); along.push(i * path.step); tan.push(b.x - a.x, b.y - a.y, b.z - a.z); }
      if (i < pts.length - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uRes: G.uRes, uSolid: { value: solid ? 1 : 0 }, ...this.u },
      transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute float aSide, aS; attribute vec3 aTan; uniform float uWidth, uMinPx; uniform vec2 uRes; varying float vS, vX;
        void main(){
          vS = aS; vX = aSide;
          vec4 c = projectionMatrix*viewMatrix*vec4(position,1.);
          vec4 t = projectionMatrix*viewMatrix*vec4(position+normalize(aTan),1.);
          vec2 d = normalize((t.xy/t.w - c.xy/c.w)*uRes + 1e-6);
          float px = max(uWidth*projectionMatrix[1][1]*uRes.y*.5/max(c.w,.01), uMinPx*uRes.y/1080.);
          c.xy += vec2(-d.y, d.x)*aSide*px/uRes*c.w;
          gl_Position = c;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFrom, uTo, uHead, uVis, uTime, uSolid; uniform vec3 uCol; varying float vS, vX;
        void main(){
          float on = step(min(uFrom,uTo), vS)*step(vS, max(uFrom,uTo));
          float core = exp(-vX*vX*5.);
          float tip = exp(-abs(vS-uHead)*.03);
          float flow = .72+.28*sin(vS*.11 - uTime*5.);
          float body = smoothstep(.0,.55,core)*on*uVis;
          vec3 light = (uCol*core*(flow + tip*2.2) + vec3(1.,.92,.74)*pow(core,5.)*.55)*on*uVis;
          gl_FragColor = mix(vec4(light, 0.), vec4(uCol*(.82+.18*flow)*body + vec3(1.,.9,.7)*tip*core*on*uVis, body), uSolid);
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** Lights the route between `from` and `to` metres; `head` is where the bright tip sits. */
  update(from: number, to: number, head: number, vis = 1, width = 1.6, minPx = 1.6) {
    const u = this.u;
    u.uFrom.value = from; u.uTo.value = to; u.uHead.value = head; u.uVis.value = vis; u.uWidth.value = width; u.uMinPx.value = minPx;
    this.mesh.visible = vis > 0.002 && from !== to;
  }
}

function paint(g: THREE.BufferGeometry, c: number): THREE.BufferGeometry {
  const k = hex(c), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([k.x, k.y, k.z], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

const CAR = toon({ vertexColors: true, spec: 0.15 }), CAR_INK = outline(1.8);
function car(parts: THREE.BufferGeometry[]): THREE.Group {
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  const o = new THREE.Group();
  o.add(new THREE.Mesh(g, CAR), new THREE.Mesh(g, CAR_INK));
  return o;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const wheel = (r: number, x: number, z: number, c = 0x2b3138) => paint(new THREE.CylinderGeometry(r, r, 0.16, 16).rotateX(Math.PI / 2).translate(x, r, z), c);

export interface RollingStock { root: THREE.Group; length: number; chimney?: THREE.Vector3 }

/** A small steam locomotive, wheels on y = 0, facing +x. `chimney` is where its smoke leaves, in its own space. */
export function locomotive(body = 0xd9532b, trim = 0x1b3a4b): RollingStock {
  const p: THREE.BufferGeometry[] = [];
  p.push(box(6.6, 0.42, 1.9, 0, 1.05, 0, trim));
  p.push(paint(new THREE.CylinderGeometry(0.98, 0.98, 3.7, 18).rotateZ(Math.PI / 2).translate(1.0, 2.2, 0), body));
  p.push(paint(new THREE.CylinderGeometry(1.03, 1.03, 0.22, 18).rotateZ(Math.PI / 2).translate(2.86, 2.2, 0), trim));
  for (const x of [0.2, 1.7]) p.push(paint(new THREE.CylinderGeometry(1.01, 1.01, 0.14, 18).rotateZ(Math.PI / 2).translate(x, 2.2, 0), 0xf2c14a));
  p.push(box(2.3, 2.5, 2.3, -2.05, 2.5, 0, body), box(2.9, 0.2, 2.7, -2.05, 3.85, 0, trim));
  for (const s of [-1, 1]) p.push(box(1.1, 0.9, 0.06, -2.05, 2.95, s * 1.16, 0x27384d));
  p.push(paint(new THREE.CylinderGeometry(0.36, 0.27, 1.25, 12).translate(2.2, 3.72, 0), trim));
  p.push(paint(new THREE.CylinderGeometry(0.46, 0.36, 0.2, 12).translate(2.2, 4.42, 0), trim));
  p.push(paint(new THREE.SphereGeometry(0.42, 12, 8).translate(0.75, 3.2, 0), 0xf2c14a));
  p.push(paint(new THREE.SphereGeometry(0.24, 10, 8).translate(3.0, 2.95, 0), 0xfff3d0));
  p.push(paint(new THREE.CylinderGeometry(0.05, 1.05, 1.1, 4, 1).rotateY(Math.PI / 4).rotateZ(-Math.PI / 2).translate(3.75, 0.72, 0), trim));
  for (const s of [-1, 1]) {
    for (const x of [-2.0, -0.35, 1.3]) p.push(wheel(0.72, x, s * 0.86), wheel(0.3, x, s * 0.9, 0xd9532b));
    p.push(wheel(0.42, 2.7, s * 0.86));
    p.push(box(3.5, 0.12, 0.08, -0.35, 0.72, s * 0.98, 0xc4ccd4));
  }
  return { root: car(p), length: 7.6, chimney: new THREE.Vector3(2.2, 4.6, 0) };
}

/** A goods wagon, wheels on y = 0. `load` is the colour of what it carries, heaped above its sides; `wheels` stacks it as rounds. */
export function wagon(body = 0x8a5a3a, load?: number, wheels = false): RollingStock {
  const p: THREE.BufferGeometry[] = [box(5.4, 0.3, 2.1, 0, 1.0, 0, 0x3a3f4a)];
  for (const s of [-1, 1]) {
    p.push(box(5.4, 1.05, 0.14, 0, 1.65, s * 0.98, body));
    p.push(box(0.14, 1.05, 2.1, s * 2.63, 1.65, 0, body));
    for (const x of [-1.6, 1.6]) p.push(wheel(0.5, x, s * 0.86));
    for (const x of [-1.8, 0, 1.8]) p.push(box(0.14, 1.15, 0.18, x, 1.65, s * 1.04, 0x5a3a26));
    // Plank seams and iron strapping, so the sides read as built from boards.
    const seam = new THREE.Color(body).multiplyScalar(0.72).getHex(), strap = 0x2b2f36;
    for (const y of [1.38, 1.65, 1.92]) p.push(box(5.38, 0.035, 0.02, 0, y, s * 1.055, seam));
    for (const x of [-2.5, 2.5]) p.push(box(0.12, 1.1, 0.04, x, 1.65, s * 1.07, strap));
    p.push(box(5.4, 0.09, 0.05, 0, 2.15, s * 1.07, strap));
  }
  if (load !== undefined) {
    p.push(box(5.0, 0.6, 1.8, 0, 1.75, 0, 0x6b4a35));
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (wheels) {
      // Cheese wheels: a darker rind round the edge, a pale cut-coloured top, bulging a little at the middle.
      const rind = new THREE.Color(load).multiplyScalar(0.78).getHex(), top = new THREE.Color(load).lerp(new THREE.Color(0xfff4d0), 0.35).getHex();
      for (let i = 0; i < 10; i++) for (let k = 0; k < 2 + (i % 2); k++) {
        const x = -2.1 + (i % 5) * 1.05, y = 2.16 + k * 0.21, z = i < 5 ? -0.46 : 0.46;
        p.push(paint(new THREE.CylinderGeometry(0.4, 0.4, 0.19, 16).scale(1, 1, 1).translate(x, y, z), rind));
        p.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16).translate(x, y, z), load));
        p.push(paint(new THREE.CylinderGeometry(0.37, 0.37, 0.012, 16).translate(x, y + 0.1, z), top));
      }
    }
    else for (let i = 0; i < 46; i++) p.push(paint(new THREE.IcosahedronGeometry(0.26, 0).translate((r() - 0.5) * 4.7, 2.12 + r() * 0.34, (r() - 0.5) * 1.6), load));
  }
  return { root: car(p), length: 6.2 };
}

/** Sets a train on a route with its front `s` metres along, each car following the curve on its own. */
export function runTrain(cars: RollingStock[], path: Path, s: number, top = 0.42) {
  let at = s;
  for (const c of cars) {
    placeOnPath(c.root, path, at - c.length / 2, top);
    at -= c.length;
  }
}
