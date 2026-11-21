import type { Sound } from './soundtrack';
import { wav, wavBase64 } from './score';

/**
 * Sound effects and generative music made of cues on the film clock, synthesised with WebAudio. The same `voice`
 * runs on a live context and on an `OfflineAudioContext`, so the page and the exported video sound alike.
 * `generateCues` writes a score from a few lines of data; `CuePlayer` plays it in sync and `renderCues` renders it.
 */

export type CueKind = 'chirp' | 'pad' | 'pluck' | 'bell' | 'noise' | 'glide' | 'honk' | 'pop' | 'squawk' | 'thud' | 'boing' | 'kick' | 'glass' | 'flute';

/**
 * One cue: start `t` in seconds, pitch `f` in Hz (`f2` the end pitch or filter sweep), length `d`, loudness `v` and stereo
 * position `p` from -1 to 1. Unused fields fall back to the kind's own defaults.
 */
export interface Cue { t: number; k: CueKind; f?: number; f2?: number; d?: number; v?: number; p?: number }

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const midiOf = (f: number) => Math.round(69 + 12 * Math.log2(f / 440));
const PENTATONIC = [0, 2, 4, 7, 9];
/** MIDI note of scale degree `deg` of the major pentatonic on `root`; negative degrees run below it. */
export const pentatonic = (root: number, deg: number) => root + PENTATONIC[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5);

const QUARTER = Float32Array.from({ length: 32 }, (_, i) => Math.sin((i / 31) * Math.PI / 2));
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext) {
  let b = noiseBuffers.get(ctx);
  if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
  const d = b.getChannelData(0);
  let x = 1;
  for (let i = 0; i < d.length; i++) d[i] = (x = (x * 16807) % 2147483647) / 1073741823.5 - 1;
  noiseBuffers.set(ctx, b);
  return b;
}

/** Plays one cue on any context, live or offline, starting at context time `at`. */
export function voice(ctx: BaseAudioContext, dest: AudioNode, c: Cue, at: number) {
  const v = c.v ?? 0.15, d = c.d ?? 0.5, f = c.f ?? 440;
  let out = dest;
  if (c.p) { const pan = ctx.createStereoPanner(); pan.pan.value = c.p; pan.connect(dest); out = pan; }
  const g = ctx.createGain();
  g.connect(out);
  const osc = (type: OscillatorType, hz: number, to = at + d + 0.1) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(hz, at); o.start(at); o.stop(to); return o; };
  const lowpass = (hz: number) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = hz; return n; };
  const env = (attack: number, release: number, peak = v) => { g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release); };
  const partials = (list: ReadonlyArray<readonly [number, number]>, decay: (m: number) => number, attack = 0, detune: number[] = [0]) => {
    for (const [m, a] of list)
      for (const cents of f * m > 9000 ? [] : detune) {
        const o = osc('sine', f * m), gg = ctx.createGain();
        o.detune.value = cents;
        gg.gain.setValueAtTime(attack ? 0.0001 : v * a, at);
        if (attack) gg.gain.linearRampToValueAtTime(v * a / detune.length, at + attack);
        gg.gain.exponentialRampToValueAtTime(0.0001, at + decay(m));
        o.connect(gg); gg.connect(out);
      }
  };
  switch (c.k) {
    case 'pad': {
      const lp = lowpass(1400); lp.connect(g);
      for (const [type, cents] of [['triangle', 0], ['sine', 6]] as const) { const o = osc(type, f); o.detune.value = cents; o.connect(lp); }
      const a = Math.min(1, d * 0.25), r = Math.min(1.5, d * 0.35), up = QUARTER.map((x) => x * v * 0.3);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.setValueCurveAtTime(up, at, a);
      g.gain.setValueCurveAtTime(up.slice().reverse(), at + d - r, r);
      break;
    }
    case 'pluck': {
      const lp = lowpass(2600); lp.connect(g);
      osc('triangle', f).connect(lp);
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      osc('sine', f * 2, at + d).connect(g2); g2.connect(lp);
      env(0.008, d);
      break;
    }
    case 'bell': partials([[1, 1], [2.76, 0.4], [5.4, 0.2]], (m) => d / m ** 0.3); break;
    case 'glass': partials([[1, 1], [2, 0.55], [3, 0.3], [4.2, 0.15], [5.8, 0.07]], (m) => d / m ** 0.5, 0.004, [-4, 4]); break;
    case 'flute': {
      const o = osc('sine', f), o2 = osc('sine', f * 2), g2 = ctx.createGain(), lfo = osc('sine', 5.2), lg = ctx.createGain();
      g2.gain.value = 0.18;
      lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(f * 0.006, at + d);
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + 0.09); g.gain.setValueAtTime(v * 0.85, at + d * 0.7); g.gain.linearRampToValueAtTime(0.0001, at + d);
      break;
    }
    case 'noise': {
      const s = ctx.createBufferSource(), band = ctx.createBiquadFilter();
      s.buffer = noiseBuffer(ctx); s.loop = true;
      band.type = 'bandpass'; band.Q.value = 0.9;
      band.frequency.setValueAtTime(c.f ?? 800, at); band.frequency.exponentialRampToValueAtTime(c.f2 ?? c.f ?? 800, at + d);
      s.connect(band); band.connect(g); s.start(at, (c.t * 3.7) % 6); s.stop(at + d + 0.1);
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + d * 0.7); g.gain.linearRampToValueAtTime(0.0001, at + d);
      break;
    }
    case 'glide': {
      const o = osc('sawtooth', c.f ?? 300, at + d + 0.05), lp = lowpass(1200);
      o.frequency.exponentialRampToValueAtTime(c.f2 ?? 100, at + d);
      o.connect(lp); lp.connect(g); env(0.02, d);
      break;
    }
    case 'honk': {
      const lp = lowpass(1500); lp.connect(g);
      for (const m of [1, 1.26]) osc('square', f * m, at + 0.34).connect(lp);
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(v, at + 0.02); g.gain.setValueAtTime(v, at + 0.26); g.gain.linearRampToValueAtTime(0.0001, at + 0.34);
      break;
    }
    case 'chirp': { const o = osc('sine', c.f ?? 2600, at + 0.12); o.frequency.exponentialRampToValueAtTime(c.f2 ?? 3200, at + 0.09); o.connect(g); env(0.006, 0.1); break; }
    case 'pop': { const o = osc('sine', f, at + 0.12); o.frequency.exponentialRampToValueAtTime(1000, at + 0.07); o.connect(g); env(0.004, 0.09); break; }
    case 'squawk': {
      const o = osc('sawtooth', 700, at + 0.55), band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 1500; band.Q.value = 2.4;
      o.frequency.linearRampToValueAtTime(1200, at + 0.12); o.frequency.linearRampToValueAtTime(600, at + 0.5);
      o.connect(band); band.connect(g); env(0.02, 0.5);
      break;
    }
    case 'thud': case 'kick': { const o = osc('sine', c.f ?? 120, at + 0.4); o.frequency.exponentialRampToValueAtTime(40, at + 0.25); o.connect(g); env(0.004, c.k === 'kick' ? 0.5 : 0.3); break; }
    case 'boing': {
      const o = osc('sine', 220, at + 0.55), lfo = osc('sine', 22, at + 0.55), lg = ctx.createGain();
      o.frequency.exponentialRampToValueAtTime(700, at + 0.12); o.frequency.exponentialRampToValueAtTime(260, at + 0.5);
      lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); env(0.01, 0.5);
      break;
    }
  }
}

/** Master gain, gentle EQ, a compressor and a soft ceiling below full scale; connect voices to the returned node. */
export function bus(ctx: BaseAudioContext, gain = 0.9) {
  const master = ctx.createGain(), comp = ctx.createDynamicsCompressor(), clip = ctx.createWaveShaper();
  const shelf = (type: BiquadFilterType, f: number, db: number) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.gain.value = db; return n; };
  const lo = shelf('lowshelf', 200, -2.5), hi = shelf('highshelf', 3500, 3.5);
  master.gain.value = gain;
  comp.threshold.value = -18; comp.ratio.value = 3.5; comp.knee.value = 20; comp.attack.value = 0.012; comp.release.value = 0.35;
  clip.curve = new Float32Array(1024).map((_, i) => 0.85 * Math.tanh((i / 511.5 - 1) / 0.85));
  master.connect(lo); lo.connect(hi); hi.connect(comp); comp.connect(clip); clip.connect(ctx.destination);
  return master;
}

/** A warm hall: a seeded noise impulse response that darkens as it decays, mixed in at `wet`. Feed the returned node. */
export function room(ctx: BaseAudioContext, dest: AudioNode, wet = 0.5, seconds = 2.6) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), ir = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let x = 11 + c * 7, y = 0;
    for (let i = 0; i < n; i++) {
      x = (x * 16807) % 2147483647;
      y += (x / 1073741823.5 - 1 - y) * (0.6 - (0.5 * i) / n);
      d[i] = y * Math.exp((-3.4 * i) / n) * Math.min(1, i / (sr * 0.02));
    }
  }
  const input = ctx.createGain(), conv = ctx.createConvolver(), mix = ctx.createGain();
  conv.buffer = ir; mix.gain.value = wet;
  input.connect(dest); input.connect(conv); conv.connect(mix); mix.connect(dest);
  return input;
}

export type Stereo = [Float32Array, Float32Array];

/** Renders the cues offline to stereo samples. `fadeOut` seconds of the end are faded so the music does not stop dead. */
export async function renderCues(cues: Cue[], seconds: number, o: { rate?: number; fadeOut?: number } = {}): Promise<Stereo> {
  const { rate = 44100, fadeOut = 0 } = o, ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate), dest = room(ctx, bus(ctx));
  for (const c of cues) voice(ctx, dest, c, c.t);
  const buf = await ctx.startRendering(), l = buf.getChannelData(0).slice(), r = buf.getChannelData(1).slice(), n = l.length;
  for (let i = Math.max(0, n - Math.floor(fadeOut * rate)); i < n; i++) {
    const k = Math.sin((Math.min(1, (n - i) / (fadeOut * rate)) * Math.PI) / 2) ** 2;
    l[i] *= k; r[i] *= k;
  }
  return [l, r];
}

/**
 * Plays cues live in step with film time, and renders them for the video. Hand one to a film as `sound()`.
 * Cues fire as the clock passes them; after a seek, only cues from that moment on sound, so a held pad that began earlier stays silent.
 */
export class CuePlayer implements Sound {
  on = false;
  private ctx?: AudioContext;
  private dest?: AudioNode;
  private master?: GainNode;
  private next = 0;
  private last = 0;
  private sorted: Cue[];

  constructor(cues: Cue[], private duration: number, private fadeOut = 2.6) { this.sorted = cues.slice().sort((a, b) => a.t - b.t); }

  prepare() {}

  enable(on: boolean, ready?: () => void) {
    this.on = on;
    if (!on) { this.master?.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.05); return; }
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = bus(this.ctx); this.dest = room(this.ctx, this.master); }
    this.master!.gain.cancelScheduledValues(0);
    this.master!.gain.value = 0.9;
    void this.ctx.resume();
    ready?.();
  }

  /** Call every frame; plays the cues the clock has passed and returns the film time unchanged. */
  sync(t: number, playing: boolean): number {
    if (!this.on || !playing || !this.ctx || !this.dest) { this.last = -1; return t; }
    if (this.last < 0 || t < this.last || t - this.last > 0.5) {
      this.next = this.sorted.findIndex((c) => c.t >= t);
      if (this.next < 0) this.next = this.sorted.length;
    }
    while (this.next < this.sorted.length && this.sorted[this.next].t <= t) voice(this.ctx, this.dest, this.sorted[this.next++], this.ctx.currentTime + 0.02);
    this.last = t;
    return t;
  }

  async wavBase64(): Promise<string> {
    const [l, r] = await renderCues(this.sorted, this.duration, { fadeOut: this.fadeOut });
    return wavBase64(wav(l, r, 44100));
  }
}

export interface Chord { root: number; minor?: boolean }

interface LayerBase { from: number; to: number; gain?: number }
export type Layer =
  | (LayerBase & { type: 'pad'; chords: Chord[]; every: number })
  | (LayerBase & { type: 'arp'; chords: Chord[]; every: number; step: number; up?: boolean })
  | (LayerBase & { type: 'melody'; voice?: 'flute' | 'pluck' | 'bell'; root: number; degrees: number[]; step: number })
  | (LayerBase & { type: 'pulse'; kind?: 'kick' | 'thud'; every: number; f?: number })
  | (LayerBase & { type: 'bed'; birds?: boolean });

/** A score as data: layers over a seed, an optional loudness arc and any hand-placed cues. */
export interface CueSpec {
  seed?: number;
  layers: Layer[];
  /** Loudness of tonal cues over time as `[t, gain]` keys, interpolated; 1 when empty. */
  arc?: Array<[t: number, gain: number]>;
  /** Extra cues merged in as they are. */
  cues?: Cue[];
}

const TONAL: CueKind[] = ['pad', 'pluck', 'bell', 'glass', 'flute'];
const triad = (c: Chord) => [0, c.minor ? 3 : 4, 7];
const stereo: Partial<Record<CueKind, number>> = { pluck: 0.4, chirp: 0.85, pop: 0.7, flute: 0.25, noise: 0.3 };

/** Loudness at `t` on a piecewise-linear arc; holds the first and last key outside them. */
export function arcAt(arc: Array<[number, number]>, t: number): number {
  if (!arc.length) return 1;
  const i = arc.findIndex(([k]) => k > t);
  if (i < 0) return arc[arc.length - 1][1];
  if (i === 0) return arc[0][1];
  const [t0, g0] = arc[i - 1], [t1, g1] = arc[i];
  return g0 + ((g1 - g0) * (t - t0)) / (t1 - t0);
}

/** Moves melodic notes by a step or two off semitone and major-seventh clashes with any pad sounding at that moment. */
export function avoidClashes(cues: Cue[]): Cue[] {
  const pads = cues.filter((c) => c.k === 'pad');
  const clashes = (m: number, t: number) => pads.some((p) => p.t <= t && t < p.t + (p.d ?? 0) && [1, 11].includes((((m - midiOf(p.f!)) % 12) + 12) % 12));
  return cues.map((c) => {
    if ((c.k !== 'pluck' && c.k !== 'flute') || c.f === undefined) return c;
    const m = midiOf(c.f), n = [0, -2, 2, -3, 3].map((d) => m + d).find((x) => !clashes(x, c.t));
    return n === undefined ? c : { ...c, f: mtof(n) };
  });
}

/** Writes the cues of a score described by `spec`. The same spec gives the same cues, sorted by time. */
export function generateCues(spec: CueSpec): Cue[] {
  let seed = spec.seed ?? 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, out: Cue[] = [];
  for (const L of spec.layers) {
    const g = L.gain ?? 1;
    if (L.type === 'bed') {
      for (let t = L.from; t < L.to; t += 3.4) out.push({ t, k: 'noise', f: 380 + rnd() * 300, f2: 700 + rnd() * 500, d: 3.8, v: 0.03 * g });
      for (let t = L.from + 1.5; L.birds !== false && t < L.to; t += 2.3 + rnd() * 2.6) {
        const n = 2 + Math.floor(rnd() * 3), f0 = 2300 + rnd() * 1200;
        for (let i = 0; i < n; i++) out.push({ t: t + i * 0.13, k: 'chirp', f: f0 * (1 + i * 0.08), f2: f0 * (1.25 + i * 0.05), v: 0.035 * g });
      }
    } else if (L.type === 'pulse') {
      for (let t = L.from; t < L.to; t += L.every) out.push({ t, k: L.kind ?? 'kick', f: L.f, v: 0.25 * g });
    } else if (L.type === 'melody') {
      L.degrees.forEach((deg, i) => { const t = L.from + i * L.step; if (t < L.to) out.push({ t, k: L.voice ?? 'flute', f: mtof(pentatonic(L.root, deg)), d: L.step * 0.95, v: 0.07 * g }); });
    } else {
      const bars = Math.ceil((L.to - L.from) / L.every);
      for (let b = 0; b < bars; b++) {
        const chord = L.chords[b % L.chords.length], t0 = L.from + b * L.every, t1 = Math.min(L.to, t0 + L.every);
        if (L.type === 'pad') [-12, 0, ...triad(chord).slice(1), 12 + triad(chord)[1]].forEach((i, k) => out.push({ t: t0 + k * 0.04, k: 'pad', f: mtof(chord.root + i), d: t1 - t0 + 0.4, v: 0.16 * g * (k ? 0.8 : 1) }));
        else for (let t = t0, i = 0; t < t1; t += L.step, i++) {
          const tones = [...triad(chord), 12, ...triad(chord).map((x) => x + 12)], m = tones[(L.up === false ? tones.length - 1 - (i % tones.length) : i % tones.length)];
          out.push({ t, k: 'pluck', f: mtof(chord.root + m + 12), d: 0.9, v: 0.1 * g });
        }
      }
    }
  }
  const sorted = avoidClashes([...out, ...(spec.cues ?? [])]).sort((a, b) => a.t - b.t);
  let side = 1;
  return sorted.map((c) => {
    const v = TONAL.includes(c.k) ? (c.v ?? 0.15) * arcAt(spec.arc ?? [], c.t) : c.v;
    if (c.k === 'honk' || c.k === 'squawk') return { ...c, v, p: c.p ?? (side *= -1) * 0.65 };
    return { ...c, v, p: c.p ?? (stereo[c.k] ? stereo[c.k]! * Math.sin(c.t * 12.9898 + c.k.length) : undefined) };
  });
}
