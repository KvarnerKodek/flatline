import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hill, makeLand, patch, plateau, ribbon, rolling, sumHeights } from '../src/land';
import { Path, gradeFor, locomotive, placeOnPath, runTrain, wagon } from '../src/track';
import { Motes } from '../src/motes';
import { castShadows, SHADOW_LAYER } from '../src/shadow';
import { outline, toon } from '../src/toon';

const ground = sumHeights(rolling(12, 200), hill(300, 0, 120, 60));

describe('land', () => {
  it('a plateau is level inside its radius and leaves distant ground alone', () => {
    const flat = plateau(ground, 300, 0, 50, 7);
    expect(flat(300, 0)).toBeCloseTo(7, 9);
    expect(flat(330, 20)).toBeCloseTo(7, 9);
    expect(flat(900, 400)).toBeCloseTo(ground(900, 400), 9);
  });

  it('builds a rectangular patch whose vertices sit on the height function', () => {
    const mesh = makeLand(ground, { size: 400, depth: 200, res: 40 }).children[0] as THREE.Mesh;
    const p = mesh.geometry.getAttribute('position');
    expect(p.count).toBe(41 * 21);
    for (const i of [0, 17, 400, p.count - 1]) expect(p.getY(i)).toBeCloseTo(ground(p.getX(i), p.getZ(i)), 4);
  });

  it('drapes roads and fields just above the ground, facing up', () => {
    const road = ribbon([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 5 }], 3, ground, () => new THREE.Vector3(1, 1, 1), 0.1);
    const field = patch(50, 50, 40, 20, 0.4, ground, () => new THREE.Vector3(1, 1, 1), 0.1);
    for (const m of [road, field]) {
      const p = m.geometry.getAttribute('position'), n = m.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        expect(p.getY(i)).toBeCloseTo(ground(p.getX(i), p.getZ(i)) + 0.1, 4);
        expect(n.getY(i)).toBeGreaterThan(0);
      }
    }
  });
});

describe('routes', () => {
  const path = new Path([{ x: 0, z: 0 }, { x: 200, z: 30 }, { x: 420, z: -20 }, { x: 700, z: 10 }], ground);

  it('measures in metres: equal steps along the route are equal distances over the ground', () => {
    const a = path.at(100).p.clone(), b = path.at(110).p.clone(), c = path.at(400).p.clone(), d = path.at(410).p.clone();
    expect(a.distanceTo(b)).toBeCloseTo(10, 0);
    expect(c.distanceTo(d)).toBeCloseTo(10, 0);
  });

  it('finds its own points again, and nothing far from the line', () => {
    const p = path.at(333).p;
    const n = path.near(p.x, p.z)!;
    expect(n.d).toBeLessThan(path.step);
    expect(Math.abs(n.s - 333)).toBeLessThan(path.step);
    expect(path.near(300, 900)).toBeNull();
  });

  it('grading makes the ground meet the route and leaves the rest untouched', () => {
    const graded = gradeFor(ground, [path], 5, 20), p = path.at(250).p;
    expect(Math.abs(graded(p.x, p.z) - p.y)).toBeLessThan(0.3);
    expect(graded(300, 400)).toBe(ground(300, 400));
  });

  it('a train follows the curve car by car, nose first', () => {
    const cars = [locomotive(), wagon(), wagon()];
    runTrain(cars, path, 300, 0.4);
    const s = cars.map((c) => path.near(c.root.position.x, c.root.position.z)!.s);
    expect(s[0]).toBeGreaterThan(s[1]);
    expect(s[1]).toBeGreaterThan(s[2]);
    const o = new THREE.Object3D();
    placeOnPath(o, path, 300, 0.4);
    expect(o.position.y).toBeCloseTo(path.at(300).p.y + 0.4, 6);
  });
});

describe('particles and shadows', () => {
  it('motes draw exactly what the frame added, and drop what does not fit', () => {
    const m = new Motes(3), c = new THREE.Vector3(1, 1, 1);
    m.begin();
    for (let i = 0; i < 5; i++) m.add(i, 0, 0, 1, c);
    m.add(9, 0, 0, 1, c, 0);
    m.end();
    expect(m.points.geometry.drawRange.count).toBe(3);
    m.begin(); m.end();
    expect(m.points.visible).toBe(false);
  });

  it('only solid lit meshes cast shadows, never their ink outlines', () => {
    const root = new THREE.Group(), box = new THREE.BoxGeometry();
    const solid = new THREE.Mesh(box, toon()), ink = new THREE.Mesh(box, outline()), glass = new THREE.Mesh(box, toon({ alpha: 0.5 }));
    root.add(solid, ink, glass);
    castShadows(root);
    expect(solid.layers.isEnabled(SHADOW_LAYER)).toBe(true);
    expect(ink.layers.isEnabled(SHADOW_LAYER)).toBe(false);
    expect(glass.layers.isEnabled(SHADOW_LAYER)).toBe(false);
  });
});
