import * as THREE from 'three';
import type { Caption, Chapter, TrackSpec } from './hud';
import type { SunShadow } from './shadow';
import type { Grade } from './post';
import type { Look } from './look';

export type { Caption, Chapter, TrackSpec };

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export interface CameraShot {
  p: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
}

/** Everything the player needs to draw one instant of a film. */
export interface Frame {
  cam: CameraShot;
  /** 0 clear, 1 black. */
  fade: number;
  /** 0 day, 1 night; steers bloom and grade. */
  night: number;
  tracks: TrackSpec[];
  /** White added to the whole picture, for lightning or a burst of light. */
  flash?: number;
}

export const newFrame = (): Frame => ({ cam: { p: V(), look: V(), fov: 40 }, fade: 0, night: 0, tracks: [] });

/** Slide the camera and its target sideways so the subject sits off-centre, clear of captions. */
export function shiftCamera(c: CameraShot, metres: number) {
  if (!metres) return;
  const fwd = V().subVectors(c.look, c.p).normalize();
  const right = V().crossVectors(fwd, V(0, 1, 0)).normalize().multiplyScalar(metres);
  c.p.add(right);
  c.look.add(right);
}

/**
 * A film is a pure function of time: `frame(world, t)` places everything and returns the camera.
 * That is what makes scrubbing, seeking and frame-exact video rendering possible.
 */
export interface Film<W> {
  duration: number;
  captions: Caption[];
  chapters: Chapter[];
  /** Everything the world needs from the network or the GPU before the first frame. */
  load(base: string): Promise<W>;
  scene(world: W): THREE.Scene;
  /** Objects re-centred on the camera every frame, such as the sky dome and the sea. */
  follow?(world: W): THREE.Object3D[];
  frame(world: W, t: number): Frame;
  /** Maps playback time to film time (see `timeWarp`); the HUD and captions stay on playback time. */
  warp?(t: number): number;
  /** Sun shadows to draw before each frame; aim them from `frame`. */
  sun?(world: W): SunShadow;
  /** How the film is drawn: shading, linework, painterly texture, haze and grade. `GHIBLI` or `CEL`, or your own. */
  look?: Look;
  /** Optional final grade; overrides the look's own. */
  grade?: Grade;
  /** Crop the picture to this aspect ratio with black bars, such as 2.39 for widescreen cinema. */
  letterbox?: number;
  /** Playback time at which the film proper ends and the end card is fully shown. */
  endCard?: { html: string; at: number };
  /** Optional extra drawing straight onto the canvas after post-processing, for inset views. */
  afterPost?(world: W, t: number, ctx: AfterPost): void;
}

export interface AfterPost {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  hud: { pip: HTMLElement };
}

/** Problems a script can have that no render will reveal until someone watches the whole film. */
export function checkScript(films: Pick<Film<unknown>, 'duration' | 'captions' | 'chapters'>, minCaption = 4): string[] {
  const out: string[] = [];
  const caps = [...films.captions].sort((a, b) => a.t0 - b.t0);
  caps.forEach((c, i) => {
    if (c.t0 < 0 || c.t1 > films.duration) out.push(`caption "${c.h}" leaves the film`);
    if (c.t1 - c.t0 < minCaption) out.push(`caption "${c.h}" is shorter than ${minCaption} s`);
    if (i && c.t0 < caps[i - 1].t1) out.push(`caption "${c.h}" overlaps "${caps[i - 1].h}"`);
    if (/[—–]/.test(`${c.k}${c.h}${c.p ?? ''}`)) out.push(`caption "${c.h}" contains a dash character`);
  });
  const ch = films.chapters;
  if (!ch.length || ch[0].t !== 0) out.push('chapters must start at 0');
  ch.forEach((c, i) => { if (i && c.t <= ch[i - 1].t) out.push(`chapter "${c.name}" is out of order`); });
  if (ch.length && ch[ch.length - 1].t >= films.duration) out.push('the last chapter starts after the film ends');
  return out;
}

/** Trapezoid ease: ramps up, holds a constant rate, ramps down. Goes 0 to 1 over s in [0, 1]. */
export const trapezoid = (s: number, ramp = 0.22) => {
  const v = 1 / (1 - ramp);
  if (s <= ramp) return (v * s * s) / (2 * ramp);
  if (s >= 1 - ramp) return 1 - (v * (1 - s) * (1 - s)) / (2 * ramp);
  return (v * ramp) / 2 + v * (s - ramp);
};

/**
 * Maps playback time to film time. `segments` replace a stretch of playback with a different stretch of
 * film time (slow motion when the playback span is longer, a cut when the film span is skipped).
 */
export function timeWarp(segments: { from: number; to: number; filmFrom: number; filmTo: number }[]) {
  return (t: number) => {
    let off = 0;
    for (const s of segments) {
      if (t < s.from) break;
      if (t < s.to) return s.filmFrom + ((t - s.from) * (s.filmTo - s.filmFrom)) / (s.to - s.from);
      off = s.filmTo - s.to;
    }
    return t + off;
  };
}
