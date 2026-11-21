import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';

describe('shader pow safety', () => {
  it('never raises 1-x to a power unclamped (NaN when x rounds above 1, smeared by bloom into black blocks)', () => {
    const bad = readdirSync('src').filter((f) => f.endsWith('.ts')).filter((f) => /pow\(1\.-(?!max\()/.test(readFileSync(`src/${f}`, 'utf8')) || /pow\(1\.-max\(/.test(readFileSync(`src/${f}`, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('caps the bloom input: the string post.ts rewrites still exists in three\'s high-pass shader', () => {
    expect(LuminosityHighPassShader.fragmentShader).toContain('texture2D( tDiffuse, vUv )');
    expect(readFileSync('src/post.ts', 'utf8')).toContain("'min(texture2D( tDiffuse, vUv ), 64.)'");
  });
});
