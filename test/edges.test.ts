import { describe, expect, it } from 'vitest';
import { DEFAULT_EDGES, depthSource, distanceFade, edgePx, edgeWeight, resolveEdges } from '../src/edges';
import { applyLook, CEL, GHIBLI } from '../src/look';
import { G } from '../src/toon';

describe('edges', () => {
  it('scales line width with the render height', () => {
    expect(edgePx(1.2, 720)).toBeCloseTo(1.2);
    expect(edgePx(1.2, 1080)).toBeCloseTo(1.8);
  });
  it('edge weight is 0 below the threshold, 1 at twice it, and monotonic', () => {
    expect(edgeWeight(0.02, 0.04)).toBe(0);
    expect(edgeWeight(0.08, 0.04)).toBe(1);
    expect(edgeWeight(0.06, 0.04)).toBeGreaterThan(edgeWeight(0.05, 0.04));
  });
  it('lines fade out with distance', () => {
    const f: [number, number] = [200, 1000];
    expect(distanceFade(100, f)).toBe(1);
    expect(distanceFade(1200, f)).toBe(0);
    expect(distanceFade(600, f)).toBeCloseTo(0.5);
  });
  it('options merge over defaults', () => {
    expect(resolveEdges({ strength: 0.3 })).toEqual({ ...DEFAULT_EDGES, strength: 0.3 });
  });
  it('GHIBLI turns the hull outlines off for screen-space edges, CEL keeps them', () => {
    applyLook(GHIBLI); expect(G.uOutlineK.value).toBe(0);
    applyLook({ ...GHIBLI, edges: { hulls: true } }); expect(G.uOutlineK.value).toBe(GHIBLI.outline);
    applyLook(CEL); expect(G.uOutlineK.value).toBe(1);
  });
});

describe('depth pass membership', () => {
  it('draws opaque meshes, including ones with several materials, and leaves see-through ones out', async () => {
    const THREE = await import('three');
    const a = new THREE.MeshBasicMaterial(), b = new THREE.MeshBasicMaterial(), glass = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
    expect(depthSource(a)).toBe(a);
    expect(depthSource([a, b])).toBe(a);
    expect(depthSource([a, glass])).toBeUndefined();
    expect(depthSource(new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }))).toBeUndefined();
    expect(depthSource(undefined)).toBeUndefined();
  });

  it('keeps puffs out of the depth pass but lets them veil the ink and haze behind them', async () => {
    const THREE = await import('three');
    const { EdgePass } = await import('../src/edges');
    const { Puffs } = await import('../src/motes');
    const scene = new THREE.Scene(), p = new Puffs(4), wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    p.begin(); p.add(0, 0, 0, 1); p.end();
    scene.add(p.group, wall);
    const e = new EdgePass(scene, new THREE.PerspectiveCamera());
    e.scan();
    const seen = e as unknown as { swaps: { o: unknown }[]; veils: unknown[] };
    expect(seen.swaps.map((s) => s.o)).toEqual([wall]);
    expect(seen.veils).toEqual([p.group.children[0]]);
  });
});

describe('line taper', () => {
  it('is uniform at 0, thickest near, thinnest far, and monotonic in between', async () => {
    const { edgeTaper } = await import('../src/edges');
    expect(edgeTaper(10, 0)).toBe(1); expect(edgeTaper(900, 0)).toBe(1);
    expect(edgeTaper(10, 1)).toBeCloseTo(1.6); expect(edgeTaper(900, 1)).toBeCloseTo(0.5);
    const w = [10, 50, 100, 200, 300, 450].map((z) => edgeTaper(z, 0.7));
    w.slice(1).forEach((x, i) => expect(x).toBeLessThanOrEqual(w[i]));
  });
});
