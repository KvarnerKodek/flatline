import { describe, expect, it } from 'vitest';
import { mixdown } from '../src/soundtrack';

const st = (l: number[], r: number[]) => [Float32Array.from(l), Float32Array.from(r)] as [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

describe('mixdown', () => {
  it('sums every layer at its gain and runs as long as the longest, so a short effects layer never cuts the score', () => {
    const [l, r] = mixdown([st([1, 1, 1, 1], [2, 2, 2, 2]), st([1, -1], [0.5, 0.5])], [0.5, 2]);
    expect([...l]).toEqual([2.5, -1.5, 0.5, 0.5]);
    expect([...r]).toEqual([2, 2, 1, 1]);
  });
});
