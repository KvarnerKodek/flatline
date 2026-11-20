import { describe, expect, it } from 'vitest';
import { Cue, CueSpec, arcAt, avoidClashes, generateCues, mtof, pentatonic } from '../src/cues';

const spec: CueSpec = {
  seed: 3,
  layers: [
    { type: 'pad', from: 0, to: 12, every: 4, chords: [{ root: 48 }, { root: 45, minor: true }] },
    { type: 'arp', from: 0, to: 12, every: 4, step: 0.5, chords: [{ root: 48 }, { root: 45, minor: true }] },
    { type: 'melody', from: 4, to: 10, root: 60, degrees: [0, 2, 4, 3, 2, 1, 4, 5], step: 1 },
    { type: 'pulse', from: 8, to: 12, every: 0.5 },
    { type: 'bed', from: 0, to: 12 },
  ],
  arc: [[0, 0.5], [10, 1]],
  cues: [{ t: 6, k: 'honk', f: 220 }],
};

describe('cues', () => {
  it('pitch helpers', () => {
    expect(mtof(69)).toBe(440);
    expect(mtof(81)).toBeCloseTo(880, 9);
    expect([0, 1, 2, 3, 4, 5, -1].map((d) => pentatonic(60, d))).toEqual([60, 62, 64, 67, 69, 72, 57]);
  });

  it('the arc interpolates between keys and holds beyond them', () => {
    const arc: Array<[number, number]> = [[0, 0.5], [10, 1.5]];
    expect(arcAt(arc, -3)).toBe(0.5);
    expect(arcAt(arc, 5)).toBe(1);
    expect(arcAt(arc, 99)).toBe(1.5);
    expect(arcAt([], 4)).toBe(1);
  });

  it('the same spec writes the same cues, in time order, with every layer present', () => {
    const a = generateCues(spec), b = generateCues(spec);
    expect(a).toEqual(b);
    expect(a.every((c, i) => !i || c.t >= a[i - 1].t)).toBe(true);
    for (const k of ['pad', 'pluck', 'flute', 'kick', 'noise', 'chirp', 'honk'] as const) expect(a.some((c) => c.k === k)).toBe(true);
    expect(a.filter((c) => c.k === 'pad').every((c) => c.t < 12 && c.d! > 0)).toBe(true);
    expect(generateCues({ ...spec, seed: 4 })).not.toEqual(a);
  });

  it('a pad follows the progression: the first bar is major, the second minor', () => {
    const pads = generateCues({ layers: [spec.layers[0]] }), first = pads.filter((c) => c.t < 4), second = pads.filter((c) => c.t >= 4 && c.t < 8);
    expect(first.map((c) => Math.round(69 + 12 * Math.log2(c.f! / 440))).sort()).toContain(52);
    expect(second.map((c) => Math.round(69 + 12 * Math.log2(c.f! / 440))).sort()).toContain(48);
  });

  it('tonal cues follow the loudness arc while effects keep their own level', () => {
    const cues = generateCues({ layers: [{ type: 'melody', from: 0, to: 10, root: 60, degrees: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], step: 1 }, { type: 'pulse', from: 0, to: 10, every: 5 }], arc: [[0, 0.2], [9, 1]] });
    const flutes = cues.filter((c) => c.k === 'flute');
    expect(flutes[0].v!).toBeLessThan(flutes[9].v!);
    expect(cues.filter((c) => c.k === 'kick').map((c) => c.v)).toEqual([0.25, 0.25]);
  });

  it('melody notes are moved off a semitone against a sounding pad', () => {
    const pad: Cue = { t: 0, d: 4, k: 'pad', f: mtof(60) }, note: Cue = { t: 1, k: 'flute', f: mtof(61) };
    const [, moved] = avoidClashes([pad, note]);
    expect(moved.f).not.toBe(note.f);
    const clear: Cue = { t: 5, k: 'flute', f: mtof(61) };
    expect(avoidClashes([pad, clear])[1].f).toBe(clear.f);
  });

  it('honks and squawks alternate sides', () => {
    const cues = generateCues({ layers: [], cues: [{ t: 0, k: 'honk' }, { t: 1, k: 'honk' }, { t: 2, k: 'squawk' }] });
    expect(cues.map((c) => Math.sign(c.p!))).toEqual([-1, 1, -1]);
  });
});
