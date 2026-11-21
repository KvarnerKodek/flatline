import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeMeadow } from '../src/meadow';

describe('meadow', () => {
  it('faces up so the ground is not culled from above', () => {
    const g = makeMeadow().geometry, p = g.getAttribute('position'), idx = g.index!, [a, b, c, n] = [0, 1, 2, 3].map(() => new THREE.Vector3());
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(p, idx.getX(i)); b.fromBufferAttribute(p, idx.getX(i + 1)); c.fromBufferAttribute(p, idx.getX(i + 2));
      n.subVectors(c, b).cross(a.clone().sub(b));
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
  });
});
