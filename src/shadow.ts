import * as THREE from 'three';
import { G } from './toon';

/** Meshes on this layer are drawn into the shadow map. `castShadows` puts them there. */
export const SHADOW_LAYER = 2;

/**
 * Sun shadows for everything shaded with `toon`. One depth map covers a square of ground around a focus point,
 * seen from the direction of the light the mood sets. Hand it to the player through `Film.sun` and call `aim`
 * from `frame`; a shadowed surface simply drops into the cel shader's shade band.
 */
export class SunShadow {
  private target: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private at = new THREE.Vector3();

  constructor(private size = 4096) {
    this.target = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size, THREE.UnsignedIntType) });
    this.cam.layers.set(SHADOW_LAYER);
  }

  /** Centres the map on `focus` and covers `extent` metres either side of it. Snapped to whole texels so edges do not crawl. */
  aim(focus: THREE.Vector3, extent: number) {
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
    G.uShadowMat.value.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const before = scene.overrideMaterial;
    scene.overrideMaterial = this.depth;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = before;
    G.uShadowMap.value = this.target.depthTexture;
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
