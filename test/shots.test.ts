import { describe, expect, it } from 'vitest';
import { checkShots, cutTrack, shotAt, shotFade, type Shot } from '../src/shots';
import { newFrame } from '../src/timeline';

const shots: Shot[] = [
  { t0: 0, name: 'a', fadeIn: 2, cam: (c, u) => { c.p.set(u, 0, 0); } },
  { t0: 10, name: 'b', cam: (c, _u, s) => { c.p.set(100 + s, 0, 0); } },
  { t0: 16, name: 'c', fadeOut: 1, cam: (c) => { c.p.set(-1, 0, 0); } },
];

describe('shots', () => {
  it('every instant belongs to exactly one shot, and a cut lands on the frame it names', () => {
    expect(shotAt(shots, 20, 9.999).shot.name).toBe('a');
    expect(shotAt(shots, 20, 10).shot.name).toBe('b');
    expect(shotAt(shots, 20, 10).s).toBe(0);
    expect(shotAt(shots, 20, 25).u).toBe(1);
  });

  it('the camera depends on the time alone, whatever was asked before', () => {
    const cut = cutTrack(shots, 20), a = newFrame().cam, b = newFrame().cam;
    cut(12.5, a);
    cut(3, b); cut(18, b); cut(12.5, b);
    expect(b.p.toArray()).toEqual(a.p.toArray());
  });

  it('fades only where a shot asks for one', () => {
    expect(shotFade(shotAt(shots, 20, 0))).toBe(1);
    expect(shotFade(shotAt(shots, 20, 5))).toBe(0);
    expect(shotFade(shotAt(shots, 20, 12))).toBe(0);
    expect(shotFade(shotAt(shots, 20, 20))).toBe(1);
  });

  it('reports a list that would leave the screen frozen or empty', () => {
    expect(checkShots(shots, 20)).toEqual([]);
    expect(checkShots([{ ...shots[1] }], 20)).toContain('shots must start at 0');
    expect(checkShots([shots[0], { ...shots[1], t0: 0.5 }], 20).join()).toMatch(/shorter/);
    expect(checkShots([shots[0], shots[2], shots[1]], 20).join()).toMatch(/out of order/);
  });
});
