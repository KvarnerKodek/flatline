import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Inst } from '../src/instanced';
import { hex } from '../src/toon';

const make = () => new Inst(new THREE.BoxGeometry(1, 1, 1), 4, { colors: true });
const reference = (x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, rx: number, rz: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

describe('Inst', () => {
  it('writes the same matrix as compose for yaw-only and tilted instances', () => {
    const inst = make();
    const cases: Array<[number, number, number, number, number, number, number, number, number]> = [[1, 2, 3, 0.7, 2, 3, 4, 0, 0], [-5, 0.5, 9, -2.4, 1, 1, 1, 0, 0], [0, 0, 0, 0, 1, 1, 1, 0, 0], [4, 1, -2, 1.1, 1, 2, 3, 0.3, -0.5]];
    cases.forEach((c, i) => {
      inst.set(i, ...c);
      const got = new THREE.Matrix4(); inst.mesh.getMatrixAt(i, got);
      reference(...c).toArray().forEach((v, k) => expect(got.elements[k]).toBeCloseTo(v, 5));
    });
  });

  it('grows the drawn count with the highest index set and hides to zero', () => {
    const inst = make();
    inst.set(2, 0, 0, 0);
    expect(inst.mesh.count).toBe(3);
    expect((inst.group.children[1] as THREE.InstancedMesh).count).toBe(3);
    inst.hide();
    expect(inst.mesh.count).toBe(0);
  });

  it('stores per-instance colour', () => {
    const inst = make();
    inst.color(1, 0xff8040);
    const c = hex(0xff8040), a = inst.geo.getAttribute('iColor');
    [c.x, c.y, c.z].forEach((v, k) => expect(a.getComponent(1, k)).toBeCloseTo(v, 6));
    expect(a.getX(0)).toBe(1);
  });

  it('uploads only the instances in use', () => {
    const inst = make();
    inst.set(1, 0, 0, 0); inst.color(1, 0xffffff); inst.commit();
    expect(inst.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 2 * 16 }]);
    expect((inst.geo.getAttribute('iColor') as THREE.BufferAttribute).updateRanges).toEqual([{ start: 0, count: 2 * 3 }]);
    inst.set(3, 0, 0, 0); inst.commit();
    expect(inst.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 4 * 16 }]);
  });

  it('bounds the committed instances so an off-screen group is culled', () => {
    const inst = new Inst(new THREE.BoxGeometry(2, 2, 2), 8, { sway: [1.5, 4] });
    expect(inst.mesh.frustumCulled).toBe(false);
    inst.set(0, 100, 0, 0); inst.set(1, 120, 0, 40, 0.3, 3); inst.set(2, 90, 7, 30);
    inst.commit();
    const b = inst.mesh.boundingSphere!, r = Math.sqrt(3);
    expect(inst.mesh.frustumCulled).toBe(true);
    for (const [x, y, z, k] of [[100, 0, 0, 1], [120, 0, 40, 3], [90, 7, 30, 1]]) expect(b.center.distanceTo(new THREE.Vector3(x, y, z)) + r * k + 1.5).toBeLessThanOrEqual(b.radius + 1e-6);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    cam.position.set(-50, 0, 0); cam.lookAt(-100, 0, 0); cam.updateMatrixWorld();
    const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    expect(f.intersectsObject(inst.mesh)).toBe(false);
    cam.lookAt(100, 0, 0); cam.updateMatrixWorld();
    f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    expect(f.intersectsObject(inst.mesh)).toBe(true);
  });

  it('keeps an empty or hidden group out of the frustum maths', () => {
    const inst = make();
    inst.commit();
    expect(inst.mesh.count).toBe(0);
  });
});
