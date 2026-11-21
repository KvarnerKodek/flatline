import * as THREE from 'three';
import { toon, G, INK, HULL } from './toon';

const cache = new Map<string, THREE.ShaderMaterial>();
const shared = (key: string, make: () => THREE.ShaderMaterial) => { let m = cache.get(key); if (!m) { m = make(); cache.set(key, m); } return m; };

/** Ink outline that also works on instanced meshes. */
/** Wind: top of each instance leans with a travelling gust. `amp` metres, over `height` of the geometry above `base`. */
export type Sway = [amp: number, height: number, base?: number];
const FADE_GLSL = `
  #ifdef FADE
  { vec3 ic = instanceMatrix[3].xyz; float fk = 1. - smoothstep(uFadeA, uFadeB, length(cameraPosition - (modelMatrix*vec4(ic,1.)).xyz)); p.xyz = ic + (p.xyz - ic)*fk; }
  #endif
`;
const SWAY_GLSL = `
  #ifdef SWAY
  { float sw = smoothstep(0., 1., (position.y + uSwayB)/uSwayH); w.x += sin(uTime*1.25 + w.x*.045 + w.z*.03)*uSwayAmp*sw; w.z += cos(uTime*1.05 + w.z*.04 + w.x*.02)*uSwayAmp*.6*sw; }
  #endif`;
export function outlineI(px = 2.2, sway?: Sway): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...G, uPx: { value: px }, uInk: { value: INK }, uSwayAmp: { value: sway?.[0] ?? 0 }, uSwayH: { value: sway?.[1] ?? 1 }, uSwayB: { value: sway?.[2] ?? 0 } },
    vertexShader: /* glsl */ `
      uniform vec2 uRes; uniform float uPx, uOutlineK, uTime, uSwayAmp, uSwayH, uSwayB; varying vec3 vW;
      void main(){
        vec4 p = vec4(position,1.); vec3 n = normal;
        #ifdef USE_INSTANCING
        p = instanceMatrix*p; n = mat3(instanceMatrix)*n;
        #endif
        vec4 w = modelMatrix*p; ${SWAY_GLSL}
        vW = w.xyz;
        vec4 clip = projectionMatrix*viewMatrix*w;
        vec3 nv = mat3(viewMatrix)*(mat3(modelMatrix)*n);
        vec2 dir = normalize(nv.xy + 1e-5);
        float px = uPx*uOutlineK*clamp(7./clip.w, .3, 1.);
        clip.xy += dir*(2.*px)/uRes*clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight, uFogD; uniform vec3 uFog, uInk; varying vec3 vW;
      void main(){ vec3 ink = mix(uInk*vec3(1.5,1.2,1.)+vec3(.05,.03,.02), uInk*vec3(.9,1.1,1.8), uNight); float d = length(cameraPosition-vW); float f = 1.-exp(-pow(d*uFogD,1.35)); gl_FragColor = vec4(mix(ink, uFog, clamp(f,0.,1.)), 1.); }`,
    side: THREE.BackSide,
  });
  if (sway) m.defines = { SWAY: '' };
  m.userData[HULL] = true;
  return m;
}


/** Many copies of one geometry in a single draw call, with per-instance colour and an ink outline. */
export interface InstOpts { /** Shrink each instance to nothing between these two camera distances, so far-off detail never shimmers. */ fade?: [near: number, far: number]; sway?: Sway; color?: number; colors?: boolean; ink?: number; spec?: number; emissive?: number; emisAmt?: number; emisNight?: number; vertexColors?: boolean; side?: THREE.Side }
export class Inst {
  group = new THREE.Group();
  mesh: THREE.InstancedMesh;
  private ink?: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private lo = new THREE.Vector3(); private hi = new THREE.Vector3();
  private pad = 1;
  private cols?: Float32Array;
  private colAttr?: THREE.InstancedBufferAttribute;
  constructor(public geo: THREE.BufferGeometry, public max: number, o: InstOpts = {}) {
    const mat = toon({ color: o.color ?? 0xffffff, instanceColors: o.colors, vertexColors: o.vertexColors, spec: o.spec ?? 0.05, emissive: o.emissive, emisAmt: o.emisAmt, emisNight: o.emisNight, side: o.side });
    if (o.fade) {
      mat.defines = { ...mat.defines, FADE: '' };
      Object.assign(mat.uniforms, { uFadeA: { value: o.fade[0] }, uFadeB: { value: o.fade[1] } });
      mat.vertexShader = mat.vertexShader.replace('varying vec3 vN;', 'uniform float uFadeA, uFadeB; varying vec3 vN;').replace('vec4 w = modelMatrix*p;', FADE_GLSL + 'vec4 w = modelMatrix*p;');
    }
    if (o.sway) {
      mat.defines = { ...mat.defines, SWAY: '' };
      Object.assign(mat.uniforms, { uSwayAmp: { value: o.sway[0] }, uSwayH: { value: o.sway[1] }, uSwayB: { value: o.sway[2] ?? 0 } });
      mat.vertexShader = mat.vertexShader.replace('varying vec3 vN;', 'uniform float uTime, uSwayAmp, uSwayH, uSwayB; varying vec3 vN;').replace('vec4 w = modelMatrix*p;', 'vec4 w = modelMatrix*p;' + SWAY_GLSL + '\n');
    }
    this.pad = 1 + (o.sway?.[0] ?? 0);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    if (o.colors) { this.cols = new Float32Array(max * 3).fill(1); geo.setAttribute('iColor', this.colAttr = new THREE.InstancedBufferAttribute(this.cols, 3)); }
    this.group.add(this.mesh);
    if (o.ink !== 0) {
      this.ink = new THREE.InstancedMesh(geo, shared('oi' + (o.ink ?? 2) + (o.sway ? 's' + o.sway.join('_') : ''), () => outlineI(o.ink ?? 2, o.sway)), max);
      this.ink.instanceMatrix = this.mesh.instanceMatrix; this.ink.frustumCulled = false; this.ink.count = 0;
      this.group.add(this.ink);
    }
  }
  set(i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    if (rx || rz) {
      this.e.set(rx, ry, rz, 'YXZ'); this.q.setFromEuler(this.e);
      this.mesh.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)));
    } else {
      const a = this.mesh.instanceMatrix.array, o = i * 16, c = Math.cos(ry), s = Math.sin(ry);
      a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
      a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    }
    if (i >= this.mesh.count) { this.mesh.count = i + 1; if (this.ink) this.ink.count = i + 1; }
  }
  color(i: number, c: number) { this.colorRGB3(i, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255); }
  colorRGB(i: number, c: THREE.Color) { this.colorRGB3(i, c.r, c.g, c.b); }
  private colorRGB3(i: number, r: number, g: number, b: number) {
    const a = this.cols;
    if (!a) return;
    a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b;
    this.colAttr!.needsUpdate = true;
  }
  commit() {
    const n = this.mesh.count, m = this.mesh.instanceMatrix;
    m.clearUpdateRanges(); m.addUpdateRange(0, n * 16); m.needsUpdate = true;
    this.bound(n);
    if (!this.colAttr) return;
    this.colAttr.clearUpdateRanges(); this.colAttr.addUpdateRange(0, n * 3); this.colAttr.needsUpdate = true;
  }
  /** Culls the whole group while it is off screen: a sphere around every instance, padded for scale, wind and ink. */
  private bound(n: number) {
    if (!n) return;
    const a = this.mesh.instanceMatrix.array, lo = this.lo.set(Infinity, Infinity, Infinity), hi = this.hi.set(-Infinity, -Infinity, -Infinity);
    let k = 0;
    for (let i = 0, o = 12; i < n; i++, o += 16) {
      const x = a[o], y = a[o + 1], z = a[o + 2];
      lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y); lo.z = Math.min(lo.z, z); hi.x = Math.max(hi.x, x); hi.y = Math.max(hi.y, y); hi.z = Math.max(hi.z, z);
      const c = o - 12;
      k = Math.max(k, Math.abs(a[c]) + Math.abs(a[c + 1]) + Math.abs(a[c + 2]), Math.abs(a[c + 4]) + Math.abs(a[c + 5]) + Math.abs(a[c + 6]), Math.abs(a[c + 8]) + Math.abs(a[c + 9]) + Math.abs(a[c + 10]));
    }
    const g = this.geo.boundingSphere ?? (this.geo.computeBoundingSphere(), this.geo.boundingSphere!);
    const s = this.mesh.boundingSphere ?? (this.mesh.boundingSphere = new THREE.Sphere());
    s.center.addVectors(lo, hi).multiplyScalar(0.5);
    s.radius = lo.distanceTo(hi) / 2 + (g.radius + g.center.length()) * k + this.pad;
    this.mesh.frustumCulled = true;
    if (this.ink) { this.ink.boundingSphere = s; this.ink.frustumCulled = true; }
  }
  hide() { this.mesh.count = 0; if (this.ink) this.ink.count = 0; }
}

