import * as THREE from 'three';

export interface PinnedOptions {
  width: number;
  /** Defaults to half the width. */
  height?: number;
  /** Pixels at or below this alpha are discarded, so the card needs no blending. */
  alphaTest?: number;
}

/**
 * A card for a surface: one textured plane facing +z, drawn on one side with alpha test and depth write, so ink lines and
 * geometry behind it are hidden and no sprite sorting is involved. Place it with `pinTo`.
 */
export function pinned(map: THREE.Texture, { width, height = width / 2, alphaTest = 0.5 }: PinnedOptions): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, alphaTest, fog: false }));
  mesh.userData.noEdge = true;
  return mesh;
}

/** Hangs `label` on a surface at `point` facing the unit `normal`, held `clearance` metres off it so it never cuts into what it labels. */
export function pinTo(label: THREE.Object3D, point: THREE.Vector3, normal: THREE.Vector3, clearance = 0.05) {
  label.position.copy(point).addScaledVector(normal, clearance);
  label.lookAt(point.x + normal.x * (clearance + 1), point.y + normal.y * (clearance + 1), point.z + normal.z * (clearance + 1));
  return label;
}
