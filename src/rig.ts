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

/**
 * A limb segment hanging down from the origin: radius `r0` at the top tapering to `r1` at `len`, swelling by `swell` (a fraction of the
 * radius) like a muscle a third of the way down, rounded at both ends and flattened to `flat` in z, so joints meet in soft balls.
 */
export function taperedLimb(r0: number, r1: number, len: number, swell = 0, flat = 1): THREE.BufferGeometry {
  const arc = (r: number, y: number, k: number) => new THREE.Vector2(r * Math.sin(k * Math.PI / 2), y - r * Math.cos(k * Math.PI / 2));
  const bottom = [0, 1, 2, 3, 4].map((k) => arc(r1, -len, k / 4));
  const top = [0, 1, 2, 3, 4].map((k) => new THREE.Vector2(r0 * Math.cos(k * Math.PI / 8), r0 * Math.sin(k * Math.PI / 8)));
  const body = Array.from({ length: 8 }, (_, i) => { const f = 1 - (i + 1) / 9, e = f * f * (3 - 2 * f); return new THREE.Vector2(r1 + (r0 - r1) * e + swell * r0 * Math.sin(Math.PI * Math.min(1, (1 - f) * 1.5)) * (1 - f), -len * (1 - f)); });
  return new THREE.LatheGeometry([...bottom, ...body.reverse(), ...top], 12).scale(1, 1, flat);
}
