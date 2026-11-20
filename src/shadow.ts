import * as THREE from 'three';
import { G } from './toon';

/** Meshes on this layer are drawn into the shadow map. `castShadows` puts them there. */
export const SHADOW_LAYER = 2;

/** Receiver for custom shaders: `sunShadow(wp, n, nl)` is 0 lit to 1 shadowed, `sunShadowCover(wp)` is 1 inside the shadow maps. Same maps and taps as `toon()`. */
export const SHADOW_GLSL = /* glsl */ `
uniform sampler2D uShadowMap, uShadowMapN; uniform mat4 uShadowMat, uShadowMatN; uniform float uShadowOn, uShadowTexel;
float shadowLookup(sampler2D map, vec4 at, float nl, float scale){
  vec3 p = at.xyz/at.w*.5+.5;
  float bias = (.00004 + .00022*(1.-clamp(abs(nl), 0., 1.)))*scale, s = 0.;
  for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) s += step(texture2D(map, p.xy + vec2(float(i), float(j))*uShadowTexel*1.25).r + bias, p.z);
  return smoothstep(.2, .8, s/9.);
}
float shadowEdge(vec4 at){ vec3 f = at.xyz/at.w*.5+.5; return smoothstep(0., .05, min(min(f.x, 1.-f.x), min(f.y, 1.-f.y))); }
float sunShadowCover(vec3 wp){ return uShadowOn < .5 ? 0. : shadowEdge(uShadowMat*vec4(wp,1.)); }
float sunShadow(vec3 wp, vec3 nrm, float nl){
  if (uShadowOn < .5) return 0.;
  vec4 vS = uShadowMat*vec4(wp + nrm*.16, 1.), vSN = uShadowMatN*vec4(wp + nrm*.05, 1.);
  vec3 n = vSN.xyz/vSN.w*.5+.5, f = vS.xyz/vS.w*.5+.5;
  float inNear = smoothstep(0., .06, min(min(n.x, 1.-n.x), min(n.y, 1.-n.y)));
  float far = f.z > 1. ? 0. : shadowLookup(uShadowMap, vS, nl, 1.)*shadowEdge(vS);
  return inNear > 0. ? mix(far, shadowLookup(uShadowMapN, vSN, nl, .25), inNear) : far;
}
`;

/** One shadow map: an orthographic view along the light covering a square of the world. */
class Cascade {
  target: THREE.WebGLRenderTarget;
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private at = new THREE.Vector3();

  constructor(private size: number) {
    this.target = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size, THREE.UnsignedIntType) });
    this.cam.layers.set(SHADOW_LAYER);
  }

  /** Centres the map on `focus`, `extent` metres either side, snapped to whole texels so edges do not crawl. */
  aim(focus: THREE.Vector3, extent: number, into: THREE.Matrix4) {
    const l = G.uLightDir.value, texel = (2 * extent) / this.size;
    this.right.set(l.z, 0, -l.x).normalize();
    this.up.crossVectors(l, this.right).normalize();
    const r = Math.round(focus.dot(this.right) / texel) * texel, u = Math.round(focus.dot(this.up) / texel) * texel;
    this.at.copy(l).multiplyScalar(focus.dot(l)).addScaledVector(this.right, r).addScaledVector(this.up, u);
    this.cam.left = -extent; this.cam.right = extent; this.cam.top = extent; this.cam.bottom = -extent;
    this.cam.position.copy(this.at).addScaledVector(l, 2000);
    this.cam.up.copy(this.up);
    this.cam.lookAt(this.at);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    into.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.cam);
  }
}

/**
 * Sun shadows for everything shaded with `toon`, in two cascades: a sharp near map around what the camera looks at
 * and a wide one beyond it, both seen along the light the mood sets. Hand it to the player through `Film.sun` and
 * call `aim` from `frame`; a shadowed surface simply drops into the cel shader's shade band.
 */
export class SunShadow {
  private near: Cascade;
  private far: Cascade;
  private depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private focus = new THREE.Vector3();

  constructor(size = 4096) {
    this.near = new Cascade(size);
    this.far = new Cascade(size);
    G.uShadowTexel.value = 1 / size;
  }

  /** Covers `extent` metres around the view from `eye` toward `look`, and a quarter of that, four times sharper, near the subject. */
  aim(eye: THREE.Vector3, look: THREE.Vector3, extent: number) {
    const reach = eye.distanceTo(look), nearExtent = Math.max(6, extent / 4);
    this.focus.subVectors(look, eye).setLength(Math.min(reach, extent * 0.75)).add(eye);
    this.far.aim(this.focus, extent, G.uShadowMat.value);
    this.focus.subVectors(look, eye).setLength(Math.min(reach, nearExtent * 0.8)).add(eye);
    this.near.aim(this.focus, nearExtent, G.uShadowMatN.value);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const before = scene.overrideMaterial;
    scene.overrideMaterial = this.depth;
    this.far.render(renderer, scene);
    this.near.render(renderer, scene);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = before;
    G.uShadowMap.value = this.far.target.depthTexture;
    G.uShadowMapN.value = this.near.target.depthTexture;
    G.uShadowOn.value = 1;
  }
}

/** Marks every solid, lit mesh under `root` as a shadow caster. Skips outlines, glows, anything see-through and `userData.noShadow`. */
export function castShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!(o as THREE.Mesh).isMesh || !m || Array.isArray(m) || o.userData.noShadow) return;
    if (!(m as THREE.ShaderMaterial).isShaderMaterial || m.transparent || m.side === THREE.BackSide || !('uBase' in (m as THREE.ShaderMaterial).uniforms)) return;
    o.layers.enable(SHADOW_LAYER);
  });
}
