import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeWater } from '../src/water';
import { SOFT, SOFT_GLSL, softParticle, softSprite } from '../src/softdepth';

describe('soft depth', () => {
  it('is on by default and exposes softFade to shaders', () => {
    expect(SOFT.uSoftDepth.value).toBe(1);
    expect(SOFT_GLSL).toContain('float softFade(float k)');
  });

  it('does nothing when switched off', () => {
    SOFT.uSoftDepth.value = 0;
    const calls: number[] = [];
    const fake = { getRenderTarget: () => { calls.push(1); return null; } } as unknown as THREE.WebGLRenderer;
    const o = softParticle(new THREE.Object3D());
    o.onBeforeRender(fake, new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.BufferGeometry(), new THREE.Material(), null as never);
    expect(calls).toHaveLength(0);
    SOFT.uSoftDepth.value = 1;
  });

  it('patches sprite shaders with a distinct program key', () => {
    const m = softSprite(new THREE.SpriteMaterial());
    expect(m.customProgramCacheKey()).toBe('soft');
    const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    m.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('diffuseColor.a *= softFade');
    expect(shader.uniforms).toHaveProperty('uSoftTex');
  });

  it('lets water read the depth behind it without writing into it', () => {
    const w = makeWater();
    expect(w.userData.noSoftDepth).toBe(true);
    expect((w.material as THREE.ShaderMaterial).fragmentShader).toContain('softGap()');
    expect((w.material as THREE.ShaderMaterial).uniforms.uSoftDepth).toBe(SOFT.uSoftDepth);
  });
});
