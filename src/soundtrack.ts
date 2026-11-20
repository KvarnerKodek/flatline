import { renderScore, renderScoreAsync, wav, wavBase64, type Score } from './score';

/** What the player needs from a film's sound: `Soundtrack` plays a `Score`, `CuePlayer` plays WebAudio cues. */
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
 * Plays a film's score in the page. The score renders in the background from `prepare`, and plays once the viewer
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
  private samples?: Promise<[Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>]>;

  constructor(private score: Score, private rate = 32000) {}

  /** Starts rendering in a background worker, so sound is ready by the time the viewer asks for it and playback never stutters. */
  prepare() {
    this.samples ??= renderScoreAsync(this.score, this.rate);
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

  /** The whole score as a base64 WAV, for the video renderer to mux in. */
  wavBase64(): string {
    const [l, r] = renderScore(this.score, 48000);
    return wavBase64(wav(l, r, 48000));
  }
}
