import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { makeBirds } from '../src/birds';
import { Butterflies } from '../src/butterflies';
import { cat, figure, walkAlong, walkSpeed } from '../src/figure';
import { poseAlong } from '../src/bob';
import { travelYaw } from '../src/motion';

const fwd = (o: THREE.Object3D) => new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);

describe('heading', () => {
  it('gulls fly nose first along their circle, in both directions', () => {
    const b = makeBirds(12, 5), c = new THREE.Vector3(3, 0, -2), at = (t: number) => { b.update(t, c, 1); return b.group.children.map((g) => g.position.clone()); };
    const t = 4.2, p0 = at(t - 0.01), p1 = at(t + 0.01);
    b.update(t, c, 1);
    b.group.children.forEach((g, i) => {
      const v = p1[i].clone().sub(p0[i]).setY(0).normalize(), f = fwd(g).setY(0).normalize();
      expect(f.dot(v)).toBeGreaterThan(0.97);
    });
  });

  it('butterflies flutter in the direction they drift', () => {
    const bf = new Butterflies(() => 0, { count: 6 }), f = new THREE.Vector3();
    const inst = (bf as unknown as { flock: { set: (...a: number[]) => void } }).flock, seen: Array<number[]> = [];
    inst.set = (...a: number[]) => { seen.push(a); };
    bf.update(5, f); const a = seen.splice(0);
    bf.update(5.05, f); const b = seen.splice(0);
    a.forEach((p, i) => {
      const d = Math.atan2(b[i][3] - p[3], b[i][1] - p[1]);
      expect(Math.cos(p[4] + d)).toBeGreaterThan(0.5);
    });
  });

  it('a walker along a curve always faces where it goes, with planted feet', () => {
    const f = figure({}), path = (t: number) => new THREE.Vector3(Math.cos(t * 0.4) * 5, 0, Math.sin(t * 0.4) * 5);
    for (let t = 1; t < 15; t += 0.9) {
      walkAlong(f, { at: path, t });
      f.root.updateMatrixWorld(true);
      const v = path(t + 0.01).sub(path(t - 0.01)).normalize();
      expect(fwd(f.root).dot(v)).toBeGreaterThan(0.99);
    }
  });

  it('turns to face the way it walks even when the path runs along -x, and stands still facing its last heading', () => {
    const f = figure({}), path = (t: number) => new THREE.Vector3(-Math.min(t, 3) * 1.4, 0, 0);
    walkAlong(f, { at: path, t: 2 });
    expect(fwd(f.root).x).toBeLessThan(-0.99);
    walkAlong(f, { at: path, t: 8 });
    expect(fwd(f.root).x).toBeLessThan(-0.99);
  });

  it('the gait phase follows distance walked, so feet do not slide, and it stops stepping when it stops', () => {
    const f = figure({}), path = (t: number) => new THREE.Vector3(Math.min(t, 4) * 1.2, 0, 0);
    walkAlong(f, { at: path, t: 3, stride: 0.5 });
    const walking = f.joints.legs[0].hip.rotation.z;
    walkAlong(f, { at: path, t: 3, stride: 0.5, dist: 0.5 });
    expect(f.joints.legs[0].hip.rotation.z).not.toBeCloseTo(walking, 2);
    walkAlong(f, { at: path, t: 9, stride: 0.5 });
    const a = f.joints.legs[0].hip.rotation.z;
    walkAlong(f, { at: path, t: 9.5, stride: 0.5 });
    expect(f.joints.legs[0].hip.rotation.z).toBeCloseTo(a, 2);
    expect(walkSpeed(0.5)).toBeGreaterThan(0);
    void travelYaw; void cat;
  });

  it('poseAlong gives a heading along the path and its speed', () => {
    const p = poseAlong((t) => new THREE.Vector3(3 * t, 0, -4 * t), 2);
    expect(p.speed).toBeCloseTo(5, 6);
    expect(Math.cos(p.yaw)).toBeCloseTo(0.6, 6);
    expect(Math.sin(p.yaw)).toBeCloseTo(-0.8, 6);
    expect([p.x, p.z]).toEqual([6, -8]);
  });
});
