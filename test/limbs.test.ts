import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { figure } from '../src/figure';

const bodies = (o: THREE.Object3D) => o.children.filter((c) => (c as THREE.Mesh).isMesh && !((c as THREE.Mesh).material as THREE.Material).side) as Array<THREE.Mesh>;
const points = (m: THREE.Mesh) => { const p = m.geometry.getAttribute('position'); return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i)); };
const radiusAt = (bone: THREE.Object3D, y: number) => Math.max(0, ...bodies(bone).flatMap(points).filter((v) => Math.abs(v.y - y) < 0.012).map((v) => Math.hypot(v.x, v.z)));

describe('limbs', () => {
  for (const o of [{}, { outfit: 'dirndl' }, { outfit: 'lederhosen' }] as const) {
    it(`${o.outfit ?? 'coat'}: arms taper from shoulder to wrist, never a uniform tube`, () => {
      const { arms } = figure(o).joints;
      for (const a of arms) {
        expect(radiusAt(a.sh, -0.04)).toBeGreaterThan(radiusAt(a.sh, -0.22) + 0.008);
        expect(radiusAt(a.el, -0.05)).toBeGreaterThan(radiusAt(a.el, -0.17) + 0.008);
      }
    });
  }

  it('hands have four separate fingers and a thumb', () => {
    const { arms } = figure({}).joints;
    for (const a of arms) {
      const zs = bodies(a.fingers).flatMap(points).filter((v) => Math.abs(v.y + 0.012) < 0.002).map((v) => v.z).sort((p, q) => p - q);
      const clusters = zs.reduce((n, z, i) => n + (i && z - zs[i - 1] > 0.0004 ? 1 : 0), 1);
      expect(clusters).toBeGreaterThanOrEqual(4);
      expect(bodies(a.thumb).length).toBe(1);
    }
  });

  for (const o of [{}, { outfit: 'dirndl' }, { outfit: 'lederhosen', build: 1.2 }] as const) {
    it(`${o.outfit ?? 'coat'}: a hanging arm clears the torso below the shoulder, at rest and in a walk`, () => {
      const f = figure(o), v = new THREE.Vector3(), { spine } = f.joints;
      const poses = [{ t: 0 }, { t: 2.2 }, { walk: 1, stride: 0.5, t: 1 }, { walk: 4, stride: 0.5, t: 1 }];
      for (const p of poses) {
        f.pose(p);
        f.root.updateMatrixWorld(true);
        const torso = bodies(spine).flatMap((m) => points(m).map((q) => q.applyMatrix4(m.matrixWorld)));
        const rows = new Map<number, number>();
        for (const q of torso) { const k = Math.round(q.y * 100); rows.set(k, Math.max(rows.get(k) ?? 0, Math.hypot(q.x, q.z))); }
        const shoulderY = new THREE.Vector3().setFromMatrixPosition(f.joints.arms[0].sh.matrixWorld).y;
        let worst = Infinity;
        for (const a of f.joints.arms) for (const bone of [a.el, a.wr]) for (const m of bodies(bone)) {
          m.updateWorldMatrix(true, false);
          for (const q of points(m)) { v.copy(q).applyMatrix4(m.matrixWorld); const r = rows.get(Math.round(v.y * 100)); if (r !== undefined && v.y < shoulderY - 0.12) worst = Math.min(worst, Math.hypot(v.x, v.z) - r); }
        }
        expect(worst).toBeGreaterThan(-0.004);
      }
    });
  }
});
