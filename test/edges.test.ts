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
});
