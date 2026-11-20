/**
 * A film score as data, synthesised deterministically: the same score always renders the same samples, so the
 * page and the rendered video carry identical sound. Voices are wavetables with their own envelopes; a stereo
 * reverb glues them together.
 */

export type Voice = 'piano' | 'bell' | 'pad' | 'strings' | 'bass' | 'pluck';

/** One note: start time and length in seconds, MIDI pitch, loudness 0 to 1, stereo position -1 to 1. */
export interface Note { t: number; d: number; m: number; v: number; voice: Voice; pan?: number }

/** `gain` scales the mix before a soft clipper, so loud passages saturate gently instead of clipping. Output is high-passed at 35 Hz. */
export interface Score { duration: number; notes: Note[]; gain?: number; reverb?: number }

interface Timbre { table: Float32Array; attack: number; decay: number; sustain: number; release: number; detune: number[]; vibrato: number }

const TABLE = 2048;
function table(partials: number[]): Float32Array {
  const t = new Float32Array(TABLE + 1);
  let peak = 0;
  for (let i = 0; i <= TABLE; i++) {
    let s = 0;
    partials.forEach((a, k) => { s += a * Math.sin((2 * Math.PI * (k + 1) * i) / TABLE); });
    t[i] = s;
    peak = Math.max(peak, Math.abs(s));
  }
  for (let i = 0; i <= TABLE; i++) t[i] /= peak || 1;
  return t;
}

const saw = (n: number, tilt: number) => Array.from({ length: n }, (_, k) => Math.pow(1 / (k + 1), tilt));

/** decay is the time for a sustained voice to fall from its peak to `sustain`; struck voices keep falling. */
const TIMBRES: Record<Voice, Timbre> = {
  piano: { table: table([1, 0.42, 0.18, 0.12, 0.05, 0.03]), attack: 0.004, decay: 1.6, sustain: 0, release: 0.25, detune: [0, 2], vibrato: 0 },
  bell: { table: table([1, 0, 0, 0.35, 0, 0, 0, 0, 0.18]), attack: 0.002, decay: 2.2, sustain: 0, release: 0.4, detune: [0], vibrato: 0 },
  pluck: { table: table([1, 0.6, 0.3, 0.15, 0.08]), attack: 0.003, decay: 0.45, sustain: 0, release: 0.08, detune: [0], vibrato: 0 },
  pad: { table: table(saw(10, 1.6)), attack: 1.4, decay: 2, sustain: 0.8, release: 1.8, detune: [-7, 0, 6], vibrato: 0.0015 },
  strings: { table: table(saw(14, 1.2)), attack: 0.35, decay: 1, sustain: 0.85, release: 0.7, detune: [-5, 4], vibrato: 0.0035 },
  bass: { table: table([1, 0.3, 0.08]), attack: 0.01, decay: 1.8, sustain: 0.35, release: 0.3, detune: [0], vibrato: 0 },
};

export const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Stereo = [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

/** Renders the score to stereo samples. */
export function renderScore(score: Score, rate = 44100): Stereo {
  const it = synth(score, rate);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** Renders without holding the page: works in slices of about `sliceMs`, letting frames draw in between. */
export async function renderScoreAsync(score: Score, rate = 44100, sliceMs = 12): Promise<Stereo> {
  const it = synth(score, rate);
  for (let t0 = performance.now(); ;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - t0 > sliceMs) { await new Promise((ok) => setTimeout(ok, 0)); t0 = performance.now(); }
  }
}

function* synth(score: Score, rate: number): Generator<void, Stereo> {
  const n = Math.ceil(score.duration * rate), L = new Float32Array(n), R = new Float32Array(n);
  for (const note of score.notes) {
    yield;
    const tb = TIMBRES[note.voice], tail = tb.release * 2.2 + (tb.sustain ? 0 : tb.decay * 1.5);
    const i0 = Math.max(0, Math.floor(note.t * rate)), i1 = Math.min(n, Math.ceil((note.t + note.d + tail) * rate));
    const pan = note.pan ?? 0, gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const amp = (note.v * 0.22) / Math.sqrt(tb.detune.length), len = i1 - i0;
    if (len <= 0) continue;
    const env = new Float32Array(len), vib = tb.vibrato ? new Float32Array(len) : undefined;
    const kd = Math.exp(-3 / (tb.decay * rate)), kr = Math.exp(-4 / (tb.release * rate));
    let fall = 1, rel = 1;
    for (let k = 0; k < len; k++) {
      const s = (i0 + k) / rate - note.t;
      if (s > tb.attack) fall *= kd;
      if (s > note.d) rel *= kr;
      env[k] = Math.min(1, Math.max(0, s) / tb.attack) * (tb.sustain + (1 - tb.sustain) * fall) * rel * amp;
      if (vib) vib[k] = 1 + tb.vibrato * Math.sin(2 * Math.PI * 5.2 * s);
    }
    for (const cents of tb.detune) {
      const step = (hz(note.m) * Math.pow(2, cents / 1200)) / rate, tab = tb.table;
      let ph = (((cents * 0.37) % 1) + 1) % 1;
      for (let k = 0; k < len; k++) {
        const x = ph * TABLE, j = x | 0, w = tab[j] + (tab[j + 1] - tab[j]) * (x - j), y = w * env[k];
        L[i0 + k] += y * gl;
        R[i0 + k] += y * gr;
        ph += vib ? step * vib[k] : step;
        if (ph >= 1) ph -= 1;
      }
    }
  }
  yield* reverb(L, R, rate, score.reverb ?? 0.28);
  for (const x of [L, R]) {
    const a = 1 - (2 * Math.PI * 35) / rate;
    let px = 0, py = 0;
    for (let i = 0; i < n; i++) { const y = x[i] - px + a * py; px = x[i]; x[i] = py = y; }
  }
  const g = score.gain ?? 1;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.95 ? (0.95 / peak) * g : g;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * k * 1.1) / 1.1; R[i] = Math.tanh(R[i] * k * 1.1) / 1.1; }
  return [L, R];
}

/** A small Schroeder reverb: parallel damped combs then allpasses, with different delays per side for width. */
function* reverb(L: Float32Array, R: Float32Array, rate: number, mix: number): Generator<void> {
  if (mix <= 0) return;
  function* run(x: Float32Array, spread: number): Generator<void, Float32Array> {
    const out = new Float32Array(x.length), sc = rate / 44100;
    for (const len of [1116, 1188, 1277, 1356, 1422, 1491]) {
      const buf = new Float32Array(Math.round((len + spread) * sc));
      let j = 0, lp = 0;
      for (let i = 0; i < x.length; i++) {
        const y = buf[j];
        lp = y * 0.72 + lp * 0.28;
        buf[j] = x[i] * 0.015 + lp * 0.84;
        out[i] += y;
        if (++j === buf.length) j = 0;
      }
      yield;
    }
    for (const len of [556, 441, 341]) {
      const buf = new Float32Array(Math.round((len + spread) * sc));
      let j = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[j], y = -out[i] + b;
        buf[j] = out[i] + b * 0.5;
        out[i] = y;
        if (++j === buf.length) j = 0;
      }
    }
    return out;
  }
  const wl = yield* run(L, 0), wr = yield* run(R, 23);
  for (let i = 0; i < L.length; i++) { L[i] = L[i] * (1 - mix * 0.5) + wl[i] * mix; R[i] = R[i] * (1 - mix * 0.5) + wr[i] * mix; }
}

/** Encodes stereo samples as a 16-bit PCM WAV file. */
export function wav(L: Float32Array, R: Float32Array, rate = 44100): ArrayBuffer {
  const n = L.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return buf;
}

/** Base64 of a binary buffer, for handing a WAV to the video renderer. */
export function wavBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** MIDI number of a note name such as `C4`, `F#3` or `Bb5`. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Scores grow from phrases: `line` turns a string of note names and lengths in beats into notes. */
export function line(t0: number, beat: number, text: string, voice: Voice, v = 0.7, pan = 0): Note[] {
  const out: Note[] = [];
  let t = t0;
  for (const tok of text.trim().split(/\s+/)) {
    const [names, len = '1'] = tok.split(':'), d = Number(len) * beat;
    if (names !== '-') for (const nm of names.split('+')) out.push({ t, d: d * 0.95, m: midi(nm), v, voice, pan });
    t += d;
  }
  return out;
}
