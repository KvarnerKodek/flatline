import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Site, fbm2, flattenSites, gridAxis, onSite, paintedTerrain, standHeight, valleyHeight } from '../src/terrain';

const sites: Site[] = [{ x: 100, z: -50, rx: 40, rz: 25, y: 12, soft: 30 }];

describe('terrain', () => {
  it('fbm and the valley height are deterministic and bounded', () => {
    const h = valleyHeight({ axis: (z) => 30 * Math.sin(z * 0.004) });
    expect(h(123.4, -560.7)).toBe(h(123.4, -560.7));
    for (const [x, z] of [[0, 0], [500, 200], [-900, -1200]]) {
      expect(fbm2(x, z)).toBeGreaterThanOrEqual(0);
      expect(fbm2(x, z)).toBeLessThanOrEqual(1);
    }
  });

  it('the walls are higher than the floor', () => {
    const h = valleyHeight({ inner: 100, outer: 600, rise: 150, relief: [] });
    expect(h(0, 0)).toBe(0);
    expect(h(900, 0)).toBeCloseTo(150, 9);
    expect(h(-900, 0)).toBeCloseTo(150, 9);
  });

  it('follows a bent axis', () => {
    const h = valleyHeight({ axis: (z) => z, inner: 50, outer: 300, rise: 100, relief: [] });
    expect(h(400, 400)).toBe(0);
    expect(h(0, 400)).toBeGreaterThan(50);
  });

  it('levels ground under a site and leaves distant ground alone', () => {
    const base = (x: number, z: number) => 0.01 * x + 0.02 * z;
    const flat = flattenSites(base, sites);
    expect(flat(100, -50)).toBeCloseTo(12, 9);
    expect(flat(120, -40)).toBeCloseTo(12, 9);
    expect(flat(900, 700)).toBeCloseTo(base(900, 700), 9);
    expect(flat(160, -50)).toBeGreaterThan(Math.min(12, base(160, -50)) - 1e-9);
  });

  it('knows which points are on a site and where to stand', () => {
    const base = () => 3;
    expect(onSite(sites, 110, -50)).toBe(true);
    expect(onSite(sites, 400, 0)).toBe(false);
    expect(standHeight(base, sites, 100, -50)).toBeCloseTo(12.4, 9);
    expect(standHeight(base, sites, 400, 0)).toBe(3);
  });

  it('joins bands into one increasing axis with no repeats', () => {
    const a = gridAxis([[-100, -20, 20], [-20, 20, 10], [20, 100, 20]]);
    expect(a).toEqual([-100, -80, -60, -40, -20, -10, 0, 10, 20, 40, 60, 80, 100]);
    expect(a.every((v, i) => !i || v > a[i - 1])).toBe(true);
  });

  it('builds a mesh whose vertices sit on the height function and whose normals face up', () => {
    const t = paintedTerrain({ height: valleyHeight(), x: [[-200, 200, 20]], z: [[-100, 100, 20]], sites, paths: [[{ x: -100, z: 0 }, { x: 100, z: 0 }]] });
    const g = t.mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal');
    expect(p.count).toBe(21 * 11);
    for (const i of [0, 40, 100, p.count - 1]) {
      expect(p.getY(i)).toBeCloseTo(t.height(p.getX(i), p.getZ(i)), 4);
      expect(n.getY(i)).toBeGreaterThan(0);
    }
    expect(t.mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(t.stand(100, -50)).toBeCloseTo(12.4, 9);
  });
});
