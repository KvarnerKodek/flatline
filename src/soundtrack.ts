import { renderScoreAsync, wav, wavBase64, type Score } from './score';
import { renderCues, type Cue } from './cues';

type Stereo = [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

/** What a film's sound is made of: a `Score`, a recorded track's URL, cues to synthesise, or layers mixed at their own gains. */
export type SoundSource = Score | string | { cues: Cue[] } | { layers: { source: SoundSource; gain?: number }[] };

/** Decodes a recorded track (any format the browser plays) to stereo samples at `rate`; a mono file plays on both sides. */
async function decodeTrack(url: string, rate: number): Promise<Stereo> {
  const buf = await new OfflineAudioContext(2, 1, rate).decodeAudioData(await (await fetch(url)).arrayBuffer());
  return [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))] as Stereo;
}

/** Sums stereo parts, each scaled by its gain, into one as long as the longest. */
export function mixdown(parts: Stereo[], gains: number[]): Stereo {
  const n = Math.max(0, ...parts.map((p) => p[0].length)), out: Stereo = [new Float32Array(n), new Float32Array(n)];
  parts.forEach((p, i) => { for (let c = 0; c < 2; c++) for (let j = 0; j < p[c].length; j++) out[c][j] += p[c][j] * gains[i]; });
  return out;
}

/** Renders any sound source to stereo samples at `rate`; cues run until 3 s after their last one ends. */
function samples(s: SoundSource, rate: number): Promise<Stereo> {
  if (typeof s === 'string') return decodeTrack(s, rate);
  if ('cues' in s) return renderCues(s.cues, Math.max(0, ...s.cues.map((c) => c.t + (c.d ?? 0.5))) + 3, { rate }) as Promise<Stereo>;
  if ('layers' in s) return Promise.all(s.layers.map((l) => samples(l.source, rate))).then((parts) => mixdown(parts, s.layers.map((l) => l.gain ?? 1)));
  return renderScoreAsync(s, rate);
}

/** What the player needs from a film's sound: `Soundtrack` plays a `Score`, a recorded track or a mix of layers, `CuePlayer` plays WebAudio cues. */
export interface Sound {
  on: boolean;
  prepare(): void;
  enable(on: boolean, ready?: () => void): void;
  /** Keeps sound on the film's clock and returns the film time to show. */
  sync(t: number, playing: boolean): number;
  /** The whole soundtrack as a base64 WAV, for the video renderer to mux in. */
  wavBase64(): string | Promise<string>;
}

/**
 * Plays a film's sound in the page: a score, a recorded track given by URL, cues, or layers of them mixed together. The score renders in the background from `prepare`, and plays once the viewer
 * turns sound on (browsers allow sound only after a click). While it plays, the audio clock leads and film time follows it, so picture and sound never drift;
 * a seek or pause simply restarts the sound at the film's time.
 */
export class Soundtrack implements Sound {
  on = false;
  private ctx?: AudioContext;
  private buf?: AudioBuffer;
  private src?: AudioBufferSourceNode;
  private startedAt = 0;
  private from = 0;
  private samples?: Promise<Stereo>;

  constructor(private source: SoundSource, private rate = 32000) {}

  /** Starts rendering in a background worker, so sound is ready by the time the viewer asks for it and playback never stutters. */
  prepare() {
    this.samples ??= samples(this.source, this.rate);
  }

  /** Turns sound on or off; the first time, the score renders in the background and `ready` runs when it can be heard. */
  enable(on: boolean, ready?: () => void) {
    this.on = on;
    if (!on) return this.stop();
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext());
      this.prepare();
      void this.samples!.then(([l, r]) => {
        this.buf = ctx.createBuffer(2, l.length, this.rate);
        this.buf.copyToChannel(l, 0);
        this.buf.copyToChannel(r, 1);
        ready?.();
      });
    } else ready?.();
    void this.ctx.resume();
  }

  /** Keeps sound on the film's clock and returns the film time to show. */
  sync(t: number, playing: boolean): number {
    if (!this.on || !playing || !this.ctx || !this.buf) { this.stop(); return t; }
    const now = this.ctx.currentTime;
    if (this.src) {
      const heard = this.from + now - this.startedAt;
      if (Math.abs(heard - t) < 0.15) return heard;
      this.stop();
    }
    if (t >= this.buf.duration) return t;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf;
    s.connect(this.ctx.destination);
    s.start(0, t);
    this.src = s; this.startedAt = now; this.from = t;
    return t;
  }

  stop() {
    this.src?.stop();
    this.src?.disconnect();
    this.src = undefined;
  }

  /** The whole score or track as a base64 WAV, for the video renderer to mux in. */
  async wavBase64(): Promise<string> {
    const [l, r] = await samples(this.source, 48000);
    return wavBase64(wav(l, r, 48000));
  }
}

/** Plays several sounds at once, such as a recorded track under sound effects; the first leads the film's clock and the rest follow it. */
export class Mix implements Sound {
  constructor(private parts: Sound[]) {}

  get on() { return this.parts[0].on; }

  prepare() { this.parts.forEach((p) => p.prepare()); }

  enable(on: boolean, ready?: () => void) {
    let waiting = this.parts.length;
    this.parts.forEach((p) => p.enable(on, () => { if (--waiting === 0) ready?.(); }));
  }

  sync(t: number, playing: boolean): number {
    const heard = this.parts[0].sync(t, playing);
    for (const p of this.parts.slice(1)) p.sync(heard, playing);
    return heard;
  }

  async wavBase64(): Promise<string> {
    const ctx = new OfflineAudioContext(2, 1, 48000);
    const mixed = await Promise.all(this.parts.map(async (p) => {
      const bytes = Uint8Array.from(atob(await p.wavBase64()), (c) => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      return [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))];
    }));
    const n = Math.max(...mixed.map(([l]) => l.length)), L = new Float32Array(n), R = new Float32Array(n);
    for (const [l, r] of mixed) for (let i = 0; i < l.length; i++) { L[i] += l[i]; R[i] += r[i]; }
    return wavBase64(wav(L, R, 48000));
  }
}
