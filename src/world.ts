import * as THREE from 'three';

interface Stamp { v: Float64Array; parent: THREE.Object3D | null }
const STAMP = Symbol('flatline.stamp');
type Stamped = THREE.Object3D & { [STAMP]?: Stamp };
const BASE = THREE.Object3D.prototype.updateMatrixWorld;

/** True when position, rotation, scale or parent differ from the last call, and records them. */
function moved(o: Stamped): boolean {
  const { position: p, quaternion: q, scale: s } = o;
  const m = o[STAMP];
  if (m && m.parent === o.parent) {
    const w = m.v;
    if (w[0] === p.x && w[1] === p.y && w[2] === p.z && w[3] === q.x && w[4] === q.y && w[5] === q.z && w[6] === q.w && w[7] === s.x && w[8] === s.y && w[9] === s.z) return false;
  }
  const next = m ?? (o[STAMP] = { v: new Float64Array(10), parent: o.parent });
  next.parent = o.parent;
  const v = next.v;
  v[0] = p.x; v[1] = p.y; v[2] = p.z; v[3] = q.x; v[4] = q.y; v[5] = q.z; v[6] = q.w; v[7] = s.x; v[8] = s.y; v[9] = s.z;
  return true;
}

/**
 * Same result as `Object3D.updateMatrixWorld`, but an object whose transform did not change is not recomposed,
 * so a mostly static scene costs a comparison per object instead of a matrix build and multiply.
 */
export function updateWorld(o: THREE.Object3D, force = false) {
  if (o.updateMatrixWorld !== BASE) return o.updateMatrixWorld(force);
  if (o.matrixAutoUpdate && moved(o)) o.updateMatrix();
  if (o.matrixWorldNeedsUpdate || force) {
    if (o.matrixWorldAutoUpdate) {
      if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      else o.matrixWorld.copy(o.matrix);
    }
    o.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const c = o.children;
  for (let i = 0; i < c.length; i++) updateWorld(c[i], force);
}
