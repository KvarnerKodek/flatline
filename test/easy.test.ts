import { describe, expect, it } from 'vitest';
import { ambientCues, moods, GHIBLI, V, checkFilm, checkScript, cueBeats, easeBy, filmOf, hold, keyframes, orbitShot, push, script, shotList, theme, tween, checkShots, cutTrack, newFrame } from '../src';

describe('easing helpers', () => {
  it('resolves names and functions, and rejects typos with the valid names', () => {
    expect(easeBy('linear')(0.3)).toBeCloseTo(0.3);
    expect(easeBy((x) => x * x)(0.5)).toBe(0.25);
    expect(easeBy()(0.5)).toBeCloseTo(0.5);
    expect(() => easeBy('smoothr' as never)).toThrow(/smoother/);
  });
  it('tween clamps outside its span and eases inside', () => {
    expect(tween(0, 2, 4, 10, 20)).toBe(10);
    expect(tween(9, 2, 4, 10, 20)).toBe(20);
    expect(tween(3, 2, 4, 10, 20, 'linear')).toBe(15);
  });
  it('keyframes hold ends and ease between keys', () => {
    const k = keyframes([[0, 1], [10, 3, 'linear'], [20, 3]]);
    expect([k(-5), k(5), k(15), k(99)]).toEqual([1, 2, 3, 3]);
  });
  it('keyframes reject unsorted or empty keys', () => {
    expect(() => keyframes([])).toThrow(/at least one/);
    expect(() => keyframes([[5, 0], [1, 1]])).toThrow(/ascend/);
  });
});

describe('script', () => {
  const s = script([{ at: 0, name: 'Dawn', say: 'The sea wakes.' }, { at: 10, name: 'Noon', say: ['Light.', 'More light.'] }, { at: 20, name: 'Dusk' }], { duration: 30 });
  it('writes numbered captions that never overlap and chapters for every scene', () => {
    expect(s.chapters.map((c) => c.t)).toEqual([0, 10, 20]);
    expect(s.captions).toHaveLength(3);
    expect(s.captions[0]).toMatchObject({ t0: 0.4, k: '01 · Dawn', h: 'The sea wakes.' });
    expect(s.captions[2].k).toBe('02 · Noon');
  });
  it('passes the script check', () => {
    expect(checkScript({ duration: 30, ...s })).toEqual([]);
  });
});

describe('shot constructors', () => {
  const list = shotList([hold(0, [0, 1, 2], [0, 0, 0], { name: 'a' }), push(5, [0, 0, 10], [0, 0, 4], [0, 0, 0], [0, 1, 0], { ease: 'linear', fov: 30 }), orbitShot(10, [0, 0, 0], { radius: 5, height: 2 })]);
  it('are valid shots, sorted, and a pure function of time', () => {
    expect(checkShots(list, 15)).toEqual([]);
    const cut = cutTrack(list, 15), a = newFrame().cam, b = newFrame().cam;
    cut(7.5, a); cut(1, b); cut(12, b); cut(7.5, b);
    expect(b.p.toArray()).toEqual(a.p.toArray());
    expect(a.p.z).toBeCloseTo(7);
    expect(a.fov).toBe(30);
  });
  it('shotList sorts by start', () => {
    expect(shotList([hold(4, [0, 0, 0], [0, 0, 1]), hold(0, [0, 0, 0], [0, 0, 1])]).map((s) => s.t0)).toEqual([0, 4]);
  });
  it('orbit holds its radius', () => {
    const c = newFrame().cam;
    orbitShot(0, [1, 0, 1], { radius: 4, height: 1, turns: 0.25 }).cam(c, 0.6, 3, 3);
    expect(Math.hypot(c.p.x - 1, c.p.z - 1)).toBeCloseTo(4);
  });
});

describe('cue authoring', () => {
  it('repeats a cue kind on a grid inside its span', () => {
    const c = cueBeats('pop', 2, 5, 1, { v: 0.2 });
    expect(c.map((x) => x.t)).toEqual([2, 3, 4]);
    expect(c[0]).toMatchObject({ k: 'pop', v: 0.2 });
  });
  it('rejects a non-advancing step', () => {
    expect(() => cueBeats('pop', 0, 5, 0)).toThrow(/step/);
  });
});

describe('theme and film factory', () => {
  it('theme derives accent variables from one colour', () => {
    expect(theme('#505ff1')).toMatchObject({ vars: { '--accent': '#505ff1' } });
  });
  const base = { duration: 10, scene: () => { throw new Error('no'); }, frame: () => newFrame() };
  it('fills ghibli look, captions and a chapter', () => {
    const f = filmOf({ ...base, load: async () => ({}) });
    expect(f.look).toBe(GHIBLI);
    expect(f.captions).toEqual([]);
    expect(f.chapters).toEqual([{ t: 0, name: 'Film' }]);
  });
  it('lets the author override anything', () => {
    expect(filmOf({ ...base, load: async () => ({}), look: undefined, chapters: [{ t: 0, name: 'x' }] }).chapters[0].name).toBe('x');
  });
  it('checkFilm names every missing piece', () => {
    const bad = { duration: 0 } as never;
    const msgs = checkFilm(bad).join('|');
    expect(msgs).toMatch(/duration/);
    expect(msgs).toMatch(/load/);
    expect(msgs).toMatch(/scene/);
    expect(msgs).toMatch(/frame/);
  });
  it('checkFilm is clean for a complete film', () => {
    expect(checkFilm(filmOf({ ...base, load: async () => ({}) }))).toEqual([]);
  });
  it('V is exported', () => { expect(V(1, 2, 3).y).toBe(2); });
});

describe('moods and ambient score', () => {
  it('moods blend between pairs', async () => {
    const { NIGHT, DAY } = await import('../src');
    const m = moods([[0, NIGHT], [40, DAY]], 10);
    expect(m(0).night).toBe(NIGHT.night);
    expect(m(46).night).toBe(DAY.night);
  });
  it('ambientCues is deterministic, sorted and inside the film', () => {
    const a = ambientCues(60), b = ambientCues(60);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(a.every((c, i) => c.t >= 0 && c.t < 60 && (!i || c.t >= a[i - 1].t))).toBe(true);
  });
  it('different feels play different notes', () => {
    expect(ambientCues(30, { feel: 'calm' })).not.toEqual(ambientCues(30, { feel: 'bright' }));
  });
});

describe('helpful errors', () => {
  it('cutTrack explains an empty shot list', () => {
    expect(() => cutTrack([], 10)).toThrow(/at least one shot/);
  });
  it('script names the scene that is out of order', () => {
    expect(() => script([{ at: 5, name: 'B' }, { at: 2, name: 'A' }], { duration: 10 })).toThrow(/"A" must start after "B"/);
  });
});
