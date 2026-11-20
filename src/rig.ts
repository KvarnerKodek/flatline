import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './toon';

const SHARED = toon({ vertexColors: true, spec: 0 });

/**
 * Joins the rigid parts of an articulated model. Every group marked `userData.rigid` (a part that never moves
 * relative to its parent bone) has its single-colour meshes baked, as vertex colours, into one mesh per bone, and its
 * ink hulls into one hull per bone. The part groups stay behind, empty, as attach points. A character of thirty
 * parts then draws as a handful of meshes, one per bone.
 */
export function sealRig(root: THREE.Object3D) {
  const bones = new Map<THREE.Object3D, THREE.Group[]>();
  root.traverse((o) => { if (o.userData.rigid && o.parent) { const l = bones.get(o.parent) ?? []; l.push(o as THREE.Group); bones.set(o.parent, l); } });
  for (const [bone, parts] of bones) {
    const body: THREE.BufferGeometry[] = [], hull: THREE.BufferGeometry[] = [];
    let ink: THREE.Material | undefined;
    for (const p of parts) {
      p.updateMatrix();
      for (const c of [...p.children]) {
        const m = c as THREE.Mesh, mat = m.material as THREE.ShaderMaterial;
        if (!m.isMesh || m.children.length || Array.isArray(mat)) continue;
        m.updateMatrix();
        const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.matrix, m.matrix));
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const plain = g.index ? g.toNonIndexed() : g;
        if (mat.side === THREE.BackSide && mat.uniforms?.uInk) { hull.push(plain); ink = mat; }
        else if (mat.uniforms?.uBase && !mat.uniforms.uVC?.value) {
          const c3 = mat.uniforms.uBase.value as THREE.Vector3, n = plain.getAttribute('position').count, col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([c3.x, c3.y, c3.z], i * 3);
          plain.setAttribute('color', new THREE.BufferAttribute(col, 3));
          body.push(plain);
        } else continue;
        m.removeFromParent();
      }
    }
    if (body.length) bone.add(new THREE.Mesh(mergeGeometries(body)!, SHARED));
    if (hull.length && ink) bone.add(new THREE.Mesh(mergeGeometries(hull)!, ink));
  }
}
