import * as THREE from 'three';
import { G, COMMON } from './toon';

export interface Obstacle { x: number; z: number; r: number; h: number }

const N = 46;
const CELL = 6.4;
const RANGE = (N * CELL) / 2;

const VS = /* glsl */ `
attribute vec4 iCol; varying vec4 vC; varying vec3 vN; varying vec3 vW;
void main(){ vec4 p = instanceMatrix*vec4(position,1.); vec4 w = modelMatrix*p; vW = w.xyz; vN = normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal); vC = iCol; gl_Position = projectionMatrix*viewMatrix*w; }`;
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
  private m = new THREE.Matrix4();
  private pathPts: THREE.Vector3[] = [];

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
    const sg = new THREE.RingGeometry(1, RANGE * 1.1, 48, 1, 0, 0.9);
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
  }

  update(t: number, hx: number, hz: number, heading: number, obs: Obstacle[], reveal: number, show: number) {
    this.group.visible = show > 0.001;
    if (!this.group.visible) return;
    const ox = Math.round(hx / CELL) * CELL, oz = Math.round(hz / CELL) * CELL;
    const R = reveal * RANGE * 1.08;
    const m = this.m;
    let i = 0;
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++, i++) {
        const cx = ox + (k - N / 2 + 0.5) * CELL, cz = oz + (j - N / 2 + 0.5) * CELL;
        const dx = cx - hx, dz = cz - hz;
        const d = Math.hypot(dx, dz);
        let occ = 0, shadow = false;
        for (const o of obs) {
          const od = Math.hypot(cx - o.x, cz - o.z);
          if (od < o.r + CELL * 0.35) { occ = Math.max(occ, o.h); continue; }
          const vx = o.x - hx, vz = o.z - hz, L2 = dx * dx + dz * dz;
          const tt = (vx * dx + vz * dz) / (L2 + 1e-6);
          if (tt > 0 && tt < 1) {
            const px = hx + dx * tt - o.x, pz = hz + dz * tt - o.z;
            if (px * px + pz * pz < (o.r * 0.8) ** 2 && Math.hypot(vx, vz) < d - o.r) shadow = true;
          }
        }
        const inRange = d < RANGE;
        const edge = R - d;
        const rev = edge > 0 && inRange ? 1 : 0;
        const pop = rev ? Math.min(1, edge / 22) : 0;
        const el = pop < 1 ? Math.sin(pop * Math.PI * 0.5) * (1 + 0.35 * Math.sin(pop * Math.PI)) : 1;
        const fade = 1 - Math.pow(d / RANGE, 3) * 0.7;
        const tOff = 1.1;
        const flash = rev && edge < 10 ? 1 - edge / 10 : 0;
        let ty = 0.06, tr = 0.1, tg = 0.52, tb = 0.52, ta = 0.34 * fade;
        if (!rev) { ta = 0; }
        else if (occ) { ta = 0.55; tr = 0.9; tg = 0.28; tb = 0.22; }
        else if (shadow) { tr = 0.16; tg = 0.12; tb = 0.3; ta = 0.5; }
        const s = CELL * 0.9;
        m.makeScale(s * (rev ? el : 0), ty, s * (rev ? el : 0)).setPosition(cx, tOff, cz);
        this.tiles.setMatrixAt(i, m);
        const a4 = i * 4;
        this.tc[a4] = tr + flash * 0.8; this.tc[a4 + 1] = tg + flash * 0.5; this.tc[a4 + 2] = tb + flash * 0.5; this.tc[a4 + 3] = Math.min(1, ta + flash * 0.4) * show;
        const bh = occ && rev ? occ * el : 0;
        m.makeScale(bh ? s * 0.94 : 0, bh, bh ? s * 0.94 : 0).setPosition(cx, tOff + 0.05, cz);
        this.blocks.setMatrixAt(i, m);
        this.bc[a4] = 1.0; this.bc[a4 + 1] = 0.38 + 0.2 * flash; this.bc[a4 + 2] = 0.3 + 0.3 * flash; this.bc[a4 + 3] = 1;
      }
    this.tiles.instanceMatrix.needsUpdate = this.blocks.instanceMatrix.needsUpdate = true;
    (this.tiles.geometry.getAttribute('iCol') as THREE.BufferAttribute).needsUpdate = true;
    (this.blocks.geometry.getAttribute('iCol') as THREE.BufferAttribute).needsUpdate = true;
    this.group.children.forEach((c) => { if (this.rings.includes(c as THREE.Mesh)) c.position.set(hx, tOffY, hz); });
    for (const rg of this.rings) { (rg.material as THREE.MeshBasicMaterial).opacity = 0.4 * show * Math.min(1, reveal * 2); rg.position.set(hx, 1.08, hz); }
    this.sweep.position.set(hx, 1.12, hz);
    this.sweep.rotation.z = t * 2.6;
    (this.sweep.material as THREE.ShaderMaterial).visible = reveal < 0.995 || show > 0.2;
    this.buildPath(hx, hz, heading, obs, t);
  }

  private buildPath(hx: number, hz: number, heading: number, obs: Obstacle[], t: number) {
    const pts: THREE.Vector3[] = [];
    let x = hx, z = hz, a = heading;
    let lat = 0;
    for (let s = 0; s < 46; s++) {
      let steer = 0;
      for (const o of obs) {
        const ox = o.x - x, oz = o.z - z;
        const d = Math.hypot(ox, oz);
        if (d < o.r + 34 && d > 1) {
          const f = Math.cos(a) * oz - Math.sin(a) * ox;
          const ahead = ox * Math.cos(a) + oz * Math.sin(a);
          if (ahead > -o.r) steer += (f > 0 ? -1 : 1) * (1 - d / (o.r + 34)) * 0.5;
        }
      }
      lat = lat * 0.8 + steer * 0.6;
      a += lat * 0.35 + (heading - a) * 0.02;
      x += Math.cos(a) * 5; z += Math.sin(a) * 5;
      pts.push(new THREE.Vector3(x, 1.2, z));
    }
    const pos: number[] = [], u: number[] = [], idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
      const dx = q.x - r.x, dz = q.z - r.z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l, w = 1.0 + (1 - i / pts.length) * 0.4;
      pos.push(p.x + nx * w, p.y, p.z + nz * w, p.x - nx * w, p.y, p.z - nz * w);
      u.push(i / pts.length, i / pts.length);
      if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = this.path.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
    g.setIndex(idx);
    this.pathPts = pts;
  }
}
const tOffY = 1;
