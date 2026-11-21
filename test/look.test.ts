import { describe, expect, it } from 'vitest';
import { applyLook, CEL, GHIBLI, resolveLook } from '../src/look';
import { G, INK } from '../src/toon';

describe('looks', () => {
  it('a film with no look gets the painted studio look, an explicit look is kept', () => {
    expect(resolveLook()).toBe(GHIBLI); expect(resolveLook(CEL)).toBe(CEL);
  });
  it('CEL is the original crisp look', () => {
    applyLook(CEL);
    expect(G.uPaint.value).toBe(0); expect(G.uSoft.value).toBe(0); expect(G.uOutlineK.value).toBe(1);
  });
  it('GHIBLI softens the bands, paints the surfaces and thins and warms the ink', () => {
    applyLook(GHIBLI);
    expect(G.uPaint.value).toBe(1); expect(G.uSoft.value).toBeGreaterThan(1); expect(G.uOutlineK.value).toBeLessThan(1);
    expect(INK.x).toBeGreaterThan(INK.z);
    applyLook(CEL);
  });
});

describe('highlight shoulder', () => {
  it('is the identity below the knee, monotonic, smooth and never exceeds 1', async () => {
    const { shoulder } = await import('../src/post');
    expect(shoulder(0.5)).toBe(0.5); expect(shoulder(0.88)).toBe(0.88);
    const xs = Array.from({ length: 41 }, (_, i) => i * 0.1), ys = xs.map((x) => shoulder(x));
    ys.slice(1).forEach((y, i) => expect(y).toBeGreaterThan(ys[i])); expect(Math.max(...ys)).toBeLessThanOrEqual(1);
    expect(shoulder(0.8801) - shoulder(0.88)).toBeCloseTo(0.0001, 5);
  });
});

describe('shadow receivers', () => {
  it('toon and custom shaders filter the sun shadow with the same plane-biased kernel', async () => {
    const { SHADOW_FILTER_GLSL, toon } = await import('../src/toon');
    const { SHADOW_GLSL } = await import('../src/shadow');
    expect(SHADOW_GLSL).toContain(SHADOW_FILTER_GLSL);
    expect(toon().fragmentShader).toContain(SHADOW_FILTER_GLSL);
    expect(SHADOW_FILTER_GLSL).toContain('dFdx');
  });
});
