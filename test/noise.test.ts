import { describe, expect, it } from 'vitest';
import { noise2 } from '../src/land';
import { fbm2 } from '../src/terrain';
import { bench, budget } from './bench';

const fract = (x: number) => x - Math.floor(x);
const refNoise = (x: number, z: number): number => {
  const h = (i: number, j: number) => fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const i = Math.floor(x), j = Math.floor(z);
  let u = x - i, v = z - j;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
};
const refFbm = (x: number, z: number): number => {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) { s += a * refNoise(x, z); [x, z] = [x * 2.03 + 17.1, z * 2.03 + 9.2]; a *= 0.5; }
  return s;
};
const pts = Array.from({ length: 2000 }, (_, k) => [Math.sin(k * 12.9) * 400, Math.cos(k * 78.2) * 400] as const);

describe('noise', () => {
  it('noise2 and fbm2 are bit-identical to the reference formula', () => {
    for (const [x, z] of pts) { expect(noise2(x, z)).toBe(refNoise(x, z)); expect(fbm2(x, z)).toBe(refFbm(x, z)); }
  });

  it('is fast enough to sample a terrain', () => {
    const ms = bench('fbm2 x2000', 10, () => { for (const [x, z] of pts) fbm2(x, z); });
    expect(ms).toBeLessThan(budget(3));
  });
});
