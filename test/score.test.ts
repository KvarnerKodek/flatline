import { describe, expect, it } from 'vitest';
import { line, midi, renderScore, wav, type Score } from '../src/score';

const score: Score = { duration: 3, notes: [...line(0, 0.5, 'C4 E4 G4 C5+E5:2', 'piano'), ...line(0.2, 1, 'C3:2', 'pad', 0.5, -0.5), { t: 1, d: 0.3, m: midi('A5'), v: 1, voice: 'bell' }] };

describe('score', () => {
  it('names notes the way musicians write them', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C4')).toBe(60);
    expect(midi('F#3')).toBe(54);
    expect(midi('Bb5')).toBe(82);
  });

  it('turns a phrase into notes in time, with chords and rests', () => {
    const n = line(1, 0.5, 'C4 - E4+G4:2', 'piano');
    expect(n.map((x) => [x.t, x.m])).toEqual([[1, 60], [2, 64], [2, 67]]);
  });

  it('renders the same samples every time, in range, and silent before the first note', () => {
    const [a] = renderScore(score, 8000), [b] = renderScore(score, 8000);
    expect(a).toEqual(b);
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.05);
    const silent = renderScore({ duration: 1, notes: [{ t: 0.5, d: 0.2, m: 60, v: 1, voice: 'pluck' }] }, 8000)[0];
    expect(Math.max(...silent.slice(0, 3900).map(Math.abs))).toBe(0);
  });

  it('writes a playable 16-bit stereo WAV', () => {
    const [l, r] = renderScore(score, 8000), v = new DataView(wav(l, r, 8000));
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint32(40, true)).toBe(l.length * 4);
  });
});
