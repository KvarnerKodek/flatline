import { smoother, cutEase, ease, ss, clamp, mix, outBack, V, type Caption, type Chapter, type Film, type CameraShot } from './timeline';
import type { Shot } from './shots';
import { drift, orbit } from './shots';
import { GHIBLI } from './look';
import type { Theme } from './player';
import { generateCues, type Cue, type CueKind, type CueSpec } from './cues';
import { moodTrack, type Mood } from './mood';

export const EASE = { linear: (x: number) => clamp(x), smooth: (x: number) => ss(0, 1, x), smoother, ease, cut: cutEase, back: outBack, in: (x: number) => clamp(x) ** 2, out: (x: number) => 1 - (1 - clamp(x)) ** 2 } as const;
export type EaseName = keyof typeof EASE;
export type Easing = EaseName | ((x: number) => number);

/** An easing by name or function; no argument gives the gentle default. */
export function easeBy(e: Easing = 'smoother'): (x: number) => number {
  if (typeof e === 'function') return e;
  if (!(e in EASE)) throw new Error(`unknown easing "${e}"; use one of ${Object.keys(EASE).join(', ')}`);
  return EASE[e];
}

/** `a` to `b` across `[t0, t1]`, eased, held outside. */
export const tween = (t: number, t0: number, t1: number, a: number, b: number, e?: Easing) => mix(a, b, easeBy(e)((t - t0) / (t1 - t0)));

/** A number over time from `[t, value, easing?]` keys; each easing shapes the move into its key. Holds both ends. */
export function keyframes(keys: Array<[t: number, v: number, e?: Easing]>) {
  if (!keys.length) throw new Error('keyframes needs at least one key');
  keys.forEach((k, i) => { if (i && k[0] <= keys[i - 1][0]) throw new Error(`keyframe times must ascend; ${k[0]} follows ${keys[i - 1][0]}`); });
  return (t: number) => {
    const i = keys.findIndex((k) => k[0] > t);
    if (i < 0) return keys[keys.length - 1][1];
    if (i === 0) return keys[0][1];
    const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
    return tween(t, t0, t1, v0, v1, e);
  };
}

export interface Scene { at: number; name: string; say?: string | string[]; kicker?: string }

/**
 * Chapters and captions from scenes: one chapter per scene, and its `say` lines split evenly across it with a
 * margin so no two captions touch.
 */
export function script(scenes: Scene[], o: { duration: number; margin?: number; numbered?: boolean }): { captions: Caption[]; chapters: Chapter[] } {
  const { duration, margin = 0.4, numbered = true } = o;
  scenes.forEach((s, i) => { if (i && s.at <= scenes[i - 1].at) throw new Error(`scene "${s.name}" must start after "${scenes[i - 1].name}"`); });
  const chapters = scenes.map((s) => ({ t: s.at, name: s.name }));
  const captions = scenes.flatMap((s, i) => {
    const lines = s.say === undefined ? [] : [s.say].flat(), end = scenes[i + 1]?.at ?? duration, span = (end - s.at) / (lines.length || 1);
    const k = s.kicker ?? (numbered ? `${String(i + 1).padStart(2, '0')} · ${s.name}` : s.name);
    return lines.map((h, j) => ({ t0: s.at + j * span + margin, t1: s.at + (j + 1) * span - margin, k, h }));
  });
  return { captions, chapters };
}

type P = [number, number, number];
export interface ShotOpts { name?: string; fov?: number; fadeIn?: number; fadeOut?: number; drift?: number }

const ctor = (t0: number, move: (c: CameraShot, u: number, s: number) => void, o: ShotOpts): Shot => ({
  t0, name: o.name, fadeIn: o.fadeIn, fadeOut: o.fadeOut,
  cam(c, u, s, t) {
    c.fov = o.fov ?? c.fov;
    move(c, u, s);
    if (o.drift) drift(c, t, o.drift);
  },
});

/** A locked-off shot; give `drift` for a hand-held breath. */
export const hold = (t0: number, p: P, look: P, o: ShotOpts = {}): Shot => ctor(t0, (c) => { c.p.set(...p); c.look.set(...look); }, o);

/** A straight move from one position and target to another, eased. */
export const push = (t0: number, p0: P, p1: P, look0: P, look1: P, o: ShotOpts & { ease?: Easing } = {}): Shot => {
  const e = easeBy(o.ease ?? 'cut'), a = V(...p0), b = V(...p1), la = V(...look0), lb = V(...look1);
  return ctor(t0, (c, u) => { c.p.lerpVectors(a, b, e(u)); c.look.lerpVectors(la, lb, e(u)); }, o);
};

/** Circle a point, `turns` revolutions over the shot starting at angle `from` (radians). */
export const orbitShot = (t0: number, centre: P, o: ShotOpts & { radius: number; height?: number; from?: number; turns?: number; ease?: Easing }): Shot => {
  const e = easeBy(o.ease ?? 'smooth'), ctr = V(...centre);
  return ctor(t0, (c, u) => orbit(c, ctr, (o.from ?? 0) + e(u) * (o.turns ?? 0.25) * Math.PI * 2, o.radius, o.height ?? 2), o);
};

/** Shots in any order, sorted by start. */
export const shotList = (shots: Shot[]): Shot[] => [...shots].sort((a, b) => a.t0 - b.t0);

/** One cue kind repeated every `step` seconds in `[from, to)`. */
export function cueBeats(k: CueKind, from: number, to: number, step: number, o: Omit<Cue, 't' | 'k'> = {}): Cue[] {
  if (!(step > 0)) throw new Error(`cueBeats step must be above 0, got ${step}`);
  return Array.from({ length: Math.max(0, Math.ceil((to - from) / step)) }, (_, i) => ({ t: from + i * step, k, ...o }));
}

/** A mood timeline from `[t, mood]` pairs, blending over `blend` seconds. */
export const moods = (keys: Array<[t: number, mood: Mood]>, blend?: number) => moodTrack(keys.map(([t, mood]) => ({ t, mood })), blend);

const PROGRESSIONS = { warm: [48, 53, 55, 45], calm: [45, 41, 48, 43], bright: [48, 55, 57, 53] };
/** A ready score for `duration` seconds: pads, a pentatonic melody, a bird bed and a swelling arc. Same inputs, same cues. */
export function ambientCues(duration: number, o: { feel?: keyof typeof PROGRESSIONS; seed?: number } = {}): Cue[] {
  const roots = PROGRESSIONS[o.feel ?? 'warm'], spec: CueSpec = {
    seed: o.seed,
    layers: [
      { type: 'pad', from: 0, to: duration, every: 8, chords: roots.map((root, i) => ({ root, minor: o.feel === 'calm' ? i % 2 === 0 : i === 3 })) },
      { type: 'melody', from: Math.min(8, duration / 4), to: duration * 0.95, root: roots[0] + 24, degrees: [0, 2, 4, 3, 2, 1, 2, 0], step: 0.8 },
      { type: 'bed', from: 0, to: duration },
    ],
    arc: [[0, 0.6], [duration * 0.5, 1], [duration, 0.7]],
  };
  return generateCues(spec);
}

/** Page chrome themed from one accent colour. */
export const theme = (accent: string, className = 'fl-theme'): Theme => ({ className, vars: { '--accent': accent } });

type FilmSpec<W> = Pick<Film<W>, 'duration' | 'load' | 'scene' | 'frame'> & Partial<Film<W>>;

/** A complete film from the four required parts; look defaults to `GHIBLI`, captions to none, chapters to one. */
export const filmOf = <W>(spec: FilmSpec<W>): Film<W> => ({ look: GHIBLI, captions: [], chapters: [{ t: 0, name: 'Film' }], ...spec });

/** Plain-language problems that would otherwise surface as a blank page or a stack trace. */
export function checkFilm(film: Partial<Film<unknown>>): string[] {
  const out: string[] = [];
  if (!(film.duration && film.duration > 0)) out.push('film.duration must be a positive number of seconds');
  if (typeof film.load !== 'function') out.push('film.load must be an async function returning the world');
  if (typeof film.scene !== 'function') out.push('film.scene must return the THREE.Scene to draw');
  if (typeof film.frame !== 'function') out.push('film.frame(world, t) must return a Frame (start from newFrame())');
  if (!Array.isArray(film.captions)) out.push('film.captions must be an array (use [] for none)');
  if (!Array.isArray(film.chapters)) out.push('film.chapters must be an array starting at t 0');
  return out;
}

