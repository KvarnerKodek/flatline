export type V3 = [number, number, number];
export interface ScreenRect { x0: number; y0: number; x1: number; y1: number }
export interface Interval { t0: number; t1: number }
/** Oriented box: centre, three unit axes, half extents along them. */
export interface Obb { c: V3; ax: [V3, V3, V3]; h: V3 }

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => len(sub(a, b));

/** Merges intervals closer than `gap` apart, returning them sorted. */
export function mergeIntervals<T extends Interval>(xs: T[], gap = 0): Interval[] {
  const out: Interval[] = [];
  for (const x of [...xs].sort((a, b) => a.t0 - b.t0)) {
    const last = out[out.length - 1];
    if (last && x.t0 - last.t1 <= gap) last.t1 = Math.max(last.t1, x.t1);
    else out.push({ t0: x.t0, t1: x.t1 });
  }
  return out;
}

/** Smallest overlap depth of two oriented boxes along any separating axis, or 0 when they do not touch. */
export function obbPenetration(a: Obb, b: Obb): number {
  const d = sub(b.c, a.c), axes: V3[] = [...a.ax, ...b.ax];
  for (const x of a.ax) for (const y of b.ax) {
    const c = cross(x, y), l = len(c);
    if (l > 1e-3) axes.push([c[0] / l, c[1] / l, c[2] / l]);
  }
  const reach = (o: Obb, L: V3) => o.h.reduce((s, h, i) => s + h * Math.abs(dot(o.ax[i], L)), 0);
  let best = Infinity;
  for (const L of axes) {
    const o = reach(a, L) + reach(b, L) - Math.abs(dot(d, L));
    if (o <= 0) return 0;
    if (o < best) best = o;
  }
  return best;
}

export const insideObb = (p: V3, o: Obb) => { const d = sub(p, o.c); return o.ax.every((a, i) => Math.abs(dot(d, a)) < o.h[i]); };

/** Metres per second between two positions `dt` apart. */
export const speedOf = (p0: V3, p1: V3, dt: number) => dist(p0, p1) / dt;

/** Cosine between the horizontal heading `fwd` and the horizontal velocity; 1 walks forward, -1 backward. NaN when either is vertical or still. */
export function facingCos(fwd: V3, vel: V3): number {
  const f = Math.hypot(fwd[0], fwd[2]), v = Math.hypot(vel[0], vel[2]);
  return f < 1e-6 || v < 1e-9 ? NaN : (fwd[0] * vel[0] + fwd[2] * vel[2]) / (f * v);
}

/** Second difference of a position over `dt`: the acceleration magnitude at `p1`. */
export const accelOf = (p0: V3, p1: V3, p2: V3, dt: number) => Math.hypot(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1], p2[2] - 2 * p1[2] + p0[2]) / (dt * dt);

export const angleBetween = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b) || 1))));

export const rectArea = (r: ScreenRect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
export const rectOverlap = (a: ScreenRect, b: ScreenRect) => rectArea({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
