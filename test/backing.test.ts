import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Backings, backingMatrix } from '../src/backing';

const camera = () => {
  const c = new THREE.PerspectiveCamera();
  c.position.set(0, 0, 100);
  c.updateMatrixWorld();
  return c;
};

describe('backing planes', () => {
  it('sits behind the card along the view direction, faces the camera and fits the card', () => {
    const m = backingMatrix(new THREE.Matrix4(), new THREE.Vector3(0, 0, 0), new THREE.Vector2(10, 4), camera(), { fx: 0.9, fy: 0.8, dy: 0 });
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    expect(p.z).toBeCloseTo(-1.2, 6);
    expect(q.angleTo(camera().quaternion)).toBeCloseTo(0, 6);
    expect([s.x, s.y]).toEqual([9, 3.2]);
  });

  it('keeps a minimum gap for near cards and lifts by a share of the height', () => {
    const c = camera();
    c.position.set(0, 0, 1);
    const m = backingMatrix(new THREE.Matrix4(), new THREE.Vector3(), new THREE.Vector2(2, 2), c, { dy: 0.5 });
    const p = new THREE.Vector3();
    p.setFromMatrixPosition(m);
    expect(p.z).toBeCloseTo(-0.4, 6);
    expect(p.y).toBeCloseTo(1, 6);
  });

  it('follows its sprite into the scene and hides when the sprite does', () => {
    const scene = new THREE.Scene(), sprite = new THREE.Sprite(), b = new Backings();
    sprite.scale.set(5, 3, 1);
    scene.add(b.add(sprite));
    b.sync();
    const plane = scene.children[1] as THREE.Mesh;
    expect(plane.visible).toBe(true);
    sprite.visible = false;
    b.sync();
    expect(plane.visible).toBe(false);
    sprite.visible = true; sprite.scale.set(0.01, 0.01, 1);
    b.sync();
    expect(plane.visible).toBe(false);
  });
});
