import * as THREE from 'three';
import { G } from './toon';

/** Shared uniforms of the soft-particle depth: `uSoftDepth` 1 fades particles against geometry, 0 turns it (and its depth pass) off. */
export const SOFT = {
  uSoftDepth: { value: 1 },
  uSoftTex: { value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as THREE.Texture },
  uSoftProj: { value: new THREE.Vector2(-1, -1) },
  uSoftRes: { value: new THREE.Vector2(1, 1) },
};
SOFT.uSoftTex.value.needsUpdate = true;

/** GLSL for a fragment shader: `softGap()` is the metres of clear view between this fragment and the opaque geometry behind it (1000 when off), `softFade(k)` ramps it 0 to 1 over `k` metres. */
export const SOFT_GLSL = /* glsl */ `
uniform float uSoftDepth; uniform sampler2D uSoftTex; uniform vec2 uSoftProj, uSoftRes;
float softGap(){
  if (uSoftDepth < .5) return 1e3;
  float sd = uSoftProj.y/(texture2D(uSoftTex, gl_FragCoord.xy/uSoftRes).r*2. - 1. + uSoftProj.x);
  float fd = uSoftProj.y/(gl_FragCoord.z*2. - 1. + uSoftProj.x);
  return sd - fd;
}
float softFade(float k){ return smoothstep(0., max(k, 1e-3), softGap()); }`;

let target: THREE.WebGLRenderTarget | null = null;
let key = NaN;
const override = new THREE.MeshBasicMaterial({ colorWrite: false });
const hidden: THREE.Object3D[] = [];

const occludes = (o: THREE.Object3D) => {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return (o as THREE.Mesh).isMesh && !!m && !Array.isArray(m) && !m.transparent && m.depthWrite && m.side !== THREE.BackSide && !o.userData.noSoftDepth;
};

/** Renders the opaque scene's depth at half resolution once per frame and pose; called by soft particles just before they draw. */
export function updateSoftDepth(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  if (SOFT.uSoftDepth.value < 0.5) return;
  const e = camera.projectionMatrix.elements, w = camera.matrixWorld.elements;
  const k = G.uTime.value + e[5] * 19 + e[10] * 23 + w[12] * 3.1 + w[13] * 5.3 + w[14] * 7.7 + w[0] * 11 + w[2] * 13 + w[9] * 17;
  const cur = renderer.getRenderTarget();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (cur) size.set(cur.width, cur.height);
  SOFT.uSoftProj.value.set(e[10], e[14]);
  SOFT.uSoftRes.value.copy(size);
  if (k === key && target) return;
  key = k;
  const hw = Math.max(1, size.x >> 1), hh = Math.max(1, size.y >> 1);
  if (!target || target.width !== hw || target.height !== hh) {
    target?.dispose();
    target = new THREE.WebGLRenderTarget(hw, hh, { depthTexture: new THREE.DepthTexture(hw, hh, THREE.UnsignedIntType) });
    SOFT.uSoftTex.value = target.depthTexture!;
  }
  hidden.length = 0;
  scene.traverse((o) => { if (o.visible && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (o as THREE.Line).isLine) && !occludes(o)) { o.visible = false; hidden.push(o); } });
  const prevBg = scene.background, prevFog = scene.fog, prevOverride = scene.overrideMaterial, prevShadow = renderer.shadowMap.autoUpdate, prevAuto = renderer.autoClear;
  scene.background = null; scene.fog = null; scene.overrideMaterial = override; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(cur);
  renderer.autoClear = prevAuto; renderer.shadowMap.autoUpdate = prevShadow;
  scene.background = prevBg; scene.fog = prevFog; scene.overrideMaterial = prevOverride;
  for (const o of hidden) o.visible = true;
}

/** Makes `o` refresh the soft depth when it is about to draw. */
export function softParticle<T extends THREE.Object3D>(o: T): T {
  o.onBeforeRender = (renderer, scene, camera) => updateSoftDepth(renderer, scene as THREE.Scene, camera);
  return o;
}

/** Soft fade for a `SpriteMaterial` (additive glows): `k` metres of fade. */
export function softSprite(m: THREE.SpriteMaterial, k = 1.2) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SOFT, { uSoftK: { value: k } });
    s.fragmentShader = s.fragmentShader.replace('void main() {', `uniform float uSoftK;\n${SOFT_GLSL}\nvoid main() {`).replace('#include <opaque_fragment>', 'diffuseColor.a *= softFade(uSoftK);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'soft';
  return m;
}
