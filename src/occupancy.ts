import * as THREE from 'three';
import { G, COMMON, UNIT } from './toon';

export interface Obstacle { x: number; z: number; r: number; h: number }

const N = 46;
const CELL0 = 6.4;
const RANGE0 = (N * CELL0) / 2;

const VS = /* glsl */ `
${UNIT}
attribute vec4 iCol; varying vec4 vC; varying vec3 vN; varying vec3 vW;
void main(){ vec4 p = instanceMatrix*vec4(position,1.); vec4 w = modelMatrix*p; vW = w.xyz; vN = unit(mat3(modelMatrix)*mat3(instanceMatrix)*normal); vC = iCol; gl_Position = projectionMatrix*viewMatrix*w; }`;
const FS = /* glsl */ `
${COMMON}
varying vec4 vC; varying vec3 vN; varying vec3 vW;
void main(){
  float top = smoothstep(.6,.9,vN.y);
  vec3 c = vC.rgb*(.55+.45*top);
  c += vC.rgb*.25*top;
  gl_FragColor = vec4(applyFog(c, length(cameraPosition-vW)), vC.a);
}`;

export class Occupancy {
  group = new THREE.Group();
  tiles: THREE.InstancedMesh;
  blocks: THREE.InstancedMesh;
  rings: THREE.Mesh[] = [];
  path: THREE.Mesh;
  sweep: THREE.Mesh;
  private tc: Float32Array;
  private bc: Float32Array;

  constructor() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    const mk = (transparent: boolean) => {
      const g = unit.clone();
      const m = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: { ...G }, vertexShader: VS, fragmentShader: FS, transparent, depthWrite: !transparent }), N * N);
      m.frustumCulled = false;
      return m;
    };
    this.tiles = mk(true);
    this.blocks = mk(false);
    this.tc = new Float32Array(N * N * 4);
    this.bc = new Float32Array(N * N * 4);
    this.tiles.geometry.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.tc, 4));
    this.blocks.geometry.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.bc, 4));
    this.tiles.renderOrder = 3;
    this.blocks.renderOrder = 2;
    this.group.add(this.tiles, this.blocks);

    for (const r of [50, 100, 150]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.28, r + 0.28, 128), new THREE.MeshBasicMaterial({ color: 0x8fe3c6, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 4;
      this.group.add(ring);
      this.rings.push(ring);
    }
    const sg = new THREE.RingGeometry(1, RANGE0 * 1.1, 48, 1, 0, 0.9);
    this.sweep = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec2 vP; void main(){ float a = atan(vP.y, vP.x); float k = clamp(a/.9,0.,1.); gl_FragColor = vec4(vec3(.4,1.,.85)*k*k*.55, k*k*.5); }`,
    }));
    this.sweep.rotation.x = -Math.PI / 2;
    this.sweep.renderOrder = 4;
    this.group.add(this.sweep);

    this.path = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      uniforms: { ...G, uProg: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float aU; varying float vU; void main(){ vU = aU; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime,uProg; varying float vU; void main(){ float d = step(.5, fract(vU*38. - uTime*1.5)); float vis = step(vU, uProg); gl_FragColor = vec4(vec3(1.,.93,.55)*(.45+.55*d), vis*(.55+.45*d)); }`,
    }));
    this.path.renderOrder = 5;
    this.path.frustumCulled = false;
    this.group.add(this.path);
    const ta = this.tiles.instanceMatrix.array, ba = this.blocks.instanceMatrix.array;
    for (let i = 0; i < N * N * 16; i += 16) { ta[i + 15] = ba[i + 15] = 1; ta[i + 5] = 0.06; ta[i + 13] = 1.1; ba[i + 13] = 1.15; }
    this.grow(46);
  }

  plan: THREE.Vector3[] | null = null;

  update(t: number, hx: number, hz: number, heading: number, obs: Obstacle[], reveal: number, show: number, cell = CELL0) {
    const CELL = cell, RANGE = (N * cell) / 2, k = cell / CELL0;
    this.k = k;
    this.group.visible = show > 0.001;
    if (!this.group.visible) return;
    const ox = Math.round(hx / CELL) * CELL, oz = Math.round(hz / CELL) * CELL;
    const R = reveal * RANGE * 1.08, s = CELL * 0.9, near = CELL * 0.35;
    const o = this.near(obs, hx, hz, RANGE + near, near);
    const ta4 = this.tiles.instanceMatrix.array as Float32Array, ba4 = this.blocks.instanceMatrix.array as Float32Array, tc = this.tc, bc = this.bc;
    let i = 0;
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++, i++) {
        const cx = ox + (k - N / 2 + 0.5) * CELL, cz = oz + (j - N / 2 + 0.5) * CELL;
        const dx = cx - hx, dz = cz - hz;
        const d = Math.sqrt(dx * dx + dz * dz);
        const edge = R - d;
        const rev = edge > 0 && d < RANGE;
        const m = i * 16, a4 = i * 4;
        ta4[m + 12] = ba4[m + 12] = cx; ta4[m + 14] = ba4[m + 14] = cz;
        if (!rev) {
          ta4[m] = ta4[m + 10] = ba4[m] = ba4[m + 10] = ba4[m + 5] = 0;
          tc[a4] = 0.1; tc[a4 + 1] = tc[a4 + 2] = 0.52; tc[a4 + 3] = 0;
          bc[a4] = 1; bc[a4 + 1] = 0.38; bc[a4 + 2] = 0.3; bc[a4 + 3] = 1;
          continue;
        }
        let occ = 0, shadow = false;
        for (let n = 0; n < o.length; n += 9) {
          const ex = cx - o[n], ez = cz - o[n + 1];
          if (ex * ex + ez * ez < o[n + 6]) { occ = Math.max(occ, o[n + 3]); continue; }
          const vx = o[n + 4], vz = o[n + 5], tt = (vx * dx + vz * dz) / (d * d + 1e-6);
          if (tt <= 0 || tt >= 1) continue;
          const px = hx + dx * tt - o[n], pz = hz + dz * tt - o[n + 1];
          if (px * px + pz * pz < o[n + 7] && o[n + 8] < d - o[n + 2]) shadow = true;
        }
        const pop = Math.min(1, edge / 22);
        const el = pop < 1 ? Math.sin(pop * Math.PI * 0.5) * (1 + 0.35 * Math.sin(pop * Math.PI)) : 1;
        const q = d / RANGE, fade = 1 - q * q * q * 0.7;
        const flash = edge < 10 ? 1 - edge / 10 : 0;
        let tr = 0.1, tg = 0.52, tb = 0.52, ta = 0.34 * fade;
        if (occ) { ta = 0.55; tr = 0.9; tg = 0.28; tb = 0.22; }
        else if (shadow) { tr = 0.16; tg = 0.12; tb = 0.3; ta = 0.5; }
        ta4[m] = ta4[m + 10] = s * el; 
        tc[a4] = tr + flash * 0.8; tc[a4 + 1] = tg + flash * 0.5; tc[a4 + 2] = tb + flash * 0.5; tc[a4 + 3] = Math.min(1, ta + flash * 0.4) * show;
        const bh = occ ? occ * el : 0;
        ba4[m] = ba4[m + 10] = bh ? s * 0.94 : 0; ba4[m + 5] = bh;
        bc[a4] = 1; bc[a4 + 1] = 0.38 + 0.2 * flash; bc[a4 + 2] = 0.3 + 0.3 * flash; bc[a4 + 3] = 1;
      }
    this.tiles.instanceMatrix.needsUpdate = this.blocks.instanceMatrix.needsUpdate = true;
    (this.tiles.geometry.getAttribute('iCol') as THREE.BufferAttribute).needsUpdate = true;
    (this.blocks.geometry.getAttribute('iCol') as THREE.BufferAttribute).needsUpdate = true;
    for (const rg of this.rings) {
      (rg.material as THREE.MeshBasicMaterial).opacity = 0.4 * show * Math.min(1, reveal * 2);
      rg.position.set(hx, 1.08, hz);
      rg.scale.setScalar(k);
    }
    this.sweep.position.set(hx, 1.12, hz);
    this.sweep.scale.setScalar(k);
    this.sweep.rotation.z = t * 2.6;
    (this.sweep.material as THREE.ShaderMaterial).visible = reveal < 0.995 || show > 0.2;
    this.buildPath(hx, hz);
  }

  route: (x: number) => number = () => 0;
  private k = 1;
  private obsBuf = new Float64Array(0);
  private cap = 0;
  private cx = new Float64Array(0);
  private cy = new Float64Array(0);
  private cz = new Float64Array(0);

  /** Obstacles that can touch the grid around the hero, packed as x, z, r, h, vx, vz, occR2, shadowR2, distance. */
  private near(obs: Obstacle[], hx: number, hz: number, reach: number, margin: number): Float64Array {
    if (this.obsBuf.length < obs.length * 9) this.obsBuf = new Float64Array(obs.length * 9);
    const b = this.obsBuf;
    let n = 0;
    for (const o of obs) {
      const vx = o.x - hx, vz = o.z - hz, v = Math.sqrt(vx * vx + vz * vz);
      if (v >= reach + o.r) continue;
      const r = o.r + margin;
      b[n++] = o.x; b[n++] = o.z; b[n++] = o.r; b[n++] = o.h; b[n++] = vx; b[n++] = vz; b[n++] = r * r; b[n++] = (o.r * 0.8) ** 2; b[n++] = v;
    }
    return b.subarray(0, n);
  }

  private buildPath(hx: number, hz: number) {
    const plan = this.plan, n = plan ? plan.length : 46;
    if (n > this.cap) this.grow(n);
    const { cx, cy, cz } = this;
    for (let i = 0; i < n; i++) {
      if (plan) { cx[i] = plan[i].x; cy[i] = plan[i].y; cz[i] = plan[i].z; continue; }
      const x = hx + i * 5;
      cx[i] = x; cy[i] = 1.2; cz[i] = this.route(x);
    }
    const g = this.path.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute, u = g.getAttribute('aU') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const a = Math.min(i + 1, n - 1), b = Math.max(i - 1, 0);
      const dx = cx[a] - cx[b], dz = cz[a] - cz[b], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l, w = (1.0 + (1 - i / n) * 0.4) * this.k, p = i * 6;
      pos.array[p] = cx[i] + nx * w; pos.array[p + 1] = cy[i]; pos.array[p + 2] = cz[i] + nz * w;
      pos.array[p + 3] = cx[i] - nx * w; pos.array[p + 4] = cy[i]; pos.array[p + 5] = cz[i] - nz * w;
      u.array[i * 2] = u.array[i * 2 + 1] = i / n;
    }
    pos.needsUpdate = u.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  private grow(n: number) {
    this.cap = Math.max(n, this.cap * 2);
    const g = this.path.geometry, c = this.cap, idx = new Uint32Array((c - 1) * 6);
    for (let i = 0; i < c - 1; i++) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    g.dispose();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(c * 2), 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.cx = new Float64Array(c); this.cy = new Float64Array(c); this.cz = new Float64Array(c);
  }
}
