import { describe, expect, it } from 'vitest';
import { checkFilm, checkScript, checkShots, newFrame } from '../src';
import { starter } from '../examples/starter/film';

describe('starter example', () => {
  it('is a complete film with a clean script', () => {
    expect(checkFilm(starter)).toEqual([]);
    expect(checkScript(starter)).toEqual([]);
  });
  it('builds a world and answers every instant with a finite camera', async () => {
    const w = await starter.load('./');
    starter.scene(w);
    for (const t of [0, 7, 14, 22, 30, 39.9, 40]) {
      const f = starter.frame(w, t);
      expect([...f.cam.p.toArray(), ...f.cam.look.toArray(), f.fade]).toSatisfy((a: number[]) => a.every(Number.isFinite));
    }
    expect(starter.frame(w, 0).fade).toBe(1);
    expect(newFrame().fade).toBe(0);
  });
});
