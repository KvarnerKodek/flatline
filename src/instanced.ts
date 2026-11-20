import * as THREE from 'three';
import { toon, hex, G, INK, HULL } from './toon';

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
  private cols?: Float32Array;
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
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    if (o.colors) { this.cols = new Float32Array(max * 3).fill(1); geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.cols, 3)); }
    this.group.add(this.mesh);
    if (o.ink !== 0) {
      this.ink = new THREE.InstancedMesh(geo, shared('oi' + (o.ink ?? 2) + (o.sway ? 's' + o.sway.join('_') : ''), () => outlineI(o.ink ?? 2, o.sway)), max);
      this.ink.instanceMatrix = this.mesh.instanceMatrix; this.ink.frustumCulled = false; this.ink.count = 0;
      this.group.add(this.ink);
    }
  }
  set(i: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    this.e.set(rx, ry, rz, 'YXZ'); this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.mesh.setMatrixAt(i, this.m);
    if (i >= this.mesh.count) { this.mesh.count = i + 1; if (this.ink) this.ink.count = i + 1; }
  }
  color(i: number, c: number) { if (!this.cols) return; const v = hex(c); this.cols[i * 3] = v.x; this.cols[i * 3 + 1] = v.y; this.cols[i * 3 + 2] = v.z; (this.geo.getAttribute('iColor') as THREE.BufferAttribute).needsUpdate = true; }
  colorRGB(i: number, c: THREE.Color) { if (!this.cols) return; this.cols[i * 3] = c.r; this.cols[i * 3 + 1] = c.g; this.cols[i * 3 + 2] = c.b; (this.geo.getAttribute('iColor') as THREE.BufferAttribute).needsUpdate = true; }
  commit() { this.mesh.instanceMatrix.needsUpdate = true; }
  hide() { this.mesh.count = 0; if (this.ink) this.ink.count = 0; }
}

