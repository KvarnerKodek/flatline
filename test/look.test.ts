import { describe, expect, it } from 'vitest';
import { applyLook, CEL, GHIBLI } from '../src/look';
import { G, INK } from '../src/toon';

describe('looks', () => {
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
