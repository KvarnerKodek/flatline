import { accelOf, angleBetween, facingCos, insideObb, obbPenetration, rectOverlap, rectArea, speedOf, dist, type Obb, type ScreenRect, type V3 } from './geom';
import { grade, type Hit, type Severity } from './findings';

export interface ActorMeta {
  name: string;
  kind: string;
  group?: string;
  /** Metres per second above which a move is a defect; defaults by kind. */
  maxSpeed?: number;
  /** Must travel the way it faces (people, animals, vehicles). */
  faces: boolean;
  canReverse: boolean;
  /** Local axis the actor faces along; +z when absent. */
  forward?: V3;
}

export interface ActorSample {
  m: ActorMeta;
  vis: boolean;
  p: V3;
  fwd: V3;
  scale: number;
  opacity: number;
  obb?: Obb;
  inFrame: boolean;
  /** Fraction of the frame the actor's box covers. */
  area: number;
}
export interface LabelSample { name: string; vis: boolean; inFrame: boolean; rect?: ScreenRect; facing: number }
export interface DecalSample { name: string; vis: boolean; y: number; box: ScreenRect; offset: boolean; order: number }
export interface HudSample { name: string; rect: ScreenRect }
export interface Sample {
  t: number;
  cam: { p: V3; fwd: V3; fov: number };
  actors: ActorSample[];
  obstacles: Array<{ name: string; obb: Obb }>;
  labels: LabelSample[];
  decals: DecalSample[];
  hud: HudSample[];
  luma?: { blown: number; dark: number };
}

export type Need = 'pose' | 'obb' | 'fade' | 'labels' | 'decals' | 'hud' | 'luma';

export interface Ctx {
  step: number;
  cuts: number[];
  /** Reads a numeric option, `config['<detector>.<name>']`, falling back to the default. */
  num(name: string, def: number): number;
  /** Second pass over the same instants in reverse order, for detectors with `twice`. */
  again?: Sample[];
}

export interface Detector {
  name: string;
  kind: string;
  /** Area owning the finding when no owner rule matches. */
  area: string;
  fix: string;
  needs: Need[];
  /** Default sampling interval in seconds. */
  step: number;
  /** Medium and high severity thresholds on the hit value. */
  sev: [number, number];
  twice?: boolean;
  /** Compares consecutive frames, so `step` is a ceiling: a coarser override would read ordinary motion as a jump. */
  frames?: boolean;
  find(samples: Sample[], c: Ctx): Hit[];
}

const SPEED: Record<string, number> = { person: 8, animal: 14, vehicle: 40, bot: 25, flyer: 60 };
const nearCut = (t: number, cuts: number[], w: number) => cuts.some((c) => Math.abs(t - c) <= w);
const live = (a: ActorSample) => a.vis;

/** Calls `f` for every actor that is visible in two consecutive samples one step apart. */
function moves(samples: Sample[], step: number, f: (a0: ActorSample, a1: ActorSample, s1: Sample, dt: number) => void) {
  for (let i = 1; i < samples.length; i++) {
    const s0 = samples[i - 1], s1 = samples[i], dt = s1.t - s0.t;
    if (dt <= 0 || dt > step * 1.5) continue;
    s1.actors.forEach((a1, k) => { const a0 = s0.actors[k]; if (a0 && live(a0) && live(a1)) f(a0, a1, s1, dt); });
  }
}

const hit = (t: number, subjects: string[], value: number, note: string): Hit => ({ t, key: [...subjects].sort().join(' x '), subjects, value, note });

const obbOverlap: Detector = {
  name: 'obb', kind: 'overlap', area: 'placement', fix: 'separate-paths', needs: ['obb'], step: 0.5, sev: [0.4, 1.2],
  find(samples, c) {
    const minPen = c.num('minPen', 0.4), reach = c.num('reach', 40), out: Hit[] = [];
    for (const s of samples) {
      const solid = s.actors.filter((a) => a.vis && a.obb && a.m.kind !== 'flyer');
      solid.forEach((a, i) => {
        for (const b of solid.slice(i + 1)) {
          if ((a.m.group && a.m.group === b.m.group) || !(a.inFrame || b.inFrame) || dist(a.p, b.p) > reach) continue;
          const p = obbPenetration(a.obb!, b.obb!);
          if (p >= minPen) out.push(hit(s.t, [a.m.name, b.m.name], p, `penetrate ${p.toFixed(2)} m at t=${s.t.toFixed(2)}`));
        }
        if (!a.inFrame) return;
        for (const o of s.obstacles) {
          const p = obbPenetration(a.obb!, o.obb);
          if (p >= minPen) out.push(hit(s.t, [a.m.name, o.name], p, `penetrate ${p.toFixed(2)} m into static at t=${s.t.toFixed(2)}`));
        }
      });
    }
    return out;
  },
};

const speed: Detector = {
  name: 'speed', kind: 'speed', area: 'motion', fix: 'retime-motion', needs: ['pose'], step: 1 / 30, frames: true, sev: [1.2, 3],
  find(samples, c) {
    const out: Hit[] = [];
    moves(samples, c.step, (a0, a1, s, dt) => {
      const limit = a1.m.maxSpeed ?? SPEED[a1.m.kind] ?? c.num('limit', 50), v = speedOf(a0.p, a1.p, dt);
      if (v > limit && dist(a0.p, a1.p) < c.num('teleport', 3) * Math.max(1, dt * 30)) out.push(hit(s.t, [a1.m.name], v / limit, `${v.toFixed(1)} m/s over limit ${limit}`));
    });
    return out;
  },
};

const teleport: Detector = {
  name: 'teleport', kind: 'teleport', area: 'motion', fix: 'hide-or-blend', needs: ['pose'], step: 1 / 30, frames: true, sev: [1, 4],
  find(samples, c) {
    const out: Hit[] = [], limit = c.num('dist', 3);
    moves(samples, c.step, (a0, a1, s, dt) => {
      const j = dist(a0.p, a1.p), lim = limit * Math.max(1, dt * 30);
      if (j > lim) out.push(hit(s.t, [a1.m.name], j / lim, `jumps ${j.toFixed(1)} m in one frame`));
    });
    return out;
  },
};

const facing: Detector = {
  name: 'facing', kind: 'facing', area: 'character', fix: 'turn-actor', needs: ['pose'], step: 1 / 30, frames: true, sev: [0.7, 1.5],
  find(samples, c) {
    const out: Hit[] = [], minSpeed = c.num('minSpeed', 0.5), maxSpeed = c.num('maxSpeed', 40), maxCos = c.num('maxCos', 0.3);
    moves(samples, c.step, (a0, a1, s, dt) => {
      if (!a1.m.faces || a1.m.canReverse) return;
      const v = speedOf(a0.p, a1.p, dt), cos = facingCos(a1.fwd, [(a1.p[0] - a0.p[0]) / dt, 0, (a1.p[2] - a0.p[2]) / dt]);
      if (v >= minSpeed && v <= maxSpeed && cos <= maxCos) out.push(hit(s.t, [a1.m.name], 1 - cos, `travels backward or sideways (cos ${cos.toFixed(2)}, ${v.toFixed(1)} m/s)`));
    });
    return out;
  },
};

const camJerk: Detector = {
  name: 'camjerk', kind: 'camera-jerk', area: 'camera', fix: 'smooth-camera', needs: ['pose'], step: 1 / 30, frames: true, sev: [1, 3],
  find(samples, c) {
    const out: Hit[] = [], limit = c.num('accel', 250), skip = c.num('cutWindow', 0.15);
    for (let i = 1; i < samples.length - 1; i++) {
      const [s0, s1, s2] = [samples[i - 1], samples[i], samples[i + 1]], dt = s2.t - s1.t;
      if (dt <= 0 || dt > c.step * 1.5 || nearCut(s1.t, c.cuts, skip + dt)) continue;
      const a = accelOf(s0.cam.p, s1.cam.p, s2.cam.p, dt);
      if (a > limit) out.push(hit(s1.t, ['camera'], a / limit, `accelerates ${a.toFixed(0)} m/s2 (limit ${limit})`));
    }
    return out;
  },
};

const camCut: Detector = {
  name: 'camcut', kind: 'camera-cut', area: 'camera', fix: 'declare-cut', needs: ['pose'], step: 1 / 30, frames: true, sev: [1, 3],
  find(samples, c) {
    const out: Hit[] = [], metres = c.num('metres', 20), degrees = c.num('degrees', 30);
    for (let i = 1; i < samples.length; i++) {
      const [s0, s1] = [samples[i - 1], samples[i]];
      if (s1.t - s0.t > c.step * 1.5 || nearCut(s1.t, c.cuts, c.step * 1.5)) continue;
      const m = dist(s0.cam.p, s1.cam.p), d = (angleBetween(s0.cam.fwd, s1.cam.fwd) * 180) / Math.PI, r = Math.max(m / metres, d / degrees);
      if (r > 1) out.push(hit(s1.t, ['camera'], r, `jumps ${m.toFixed(1)} m and ${d.toFixed(0)} deg outside a declared cut`));
    }
    return out;
  },
};

const camInside: Detector = {
  name: 'camclip', kind: 'camera-inside', area: 'camera', fix: 'move-camera', needs: ['obb'], step: 0.25, sev: [1, 2],
  find(samples) {
    return samples.flatMap((s) => s.actors.filter((a) => a.vis && a.obb && insideObb(s.cam.p, a.obb)).map((a) => hit(s.t, [a.m.name, 'camera'], 1, `camera is inside the box of ${a.m.name}`)));
  },
};

const pop: Detector = {
  name: 'pop', kind: 'pop', area: 'animation', fix: 'fade-in', needs: ['pose', 'fade'], step: 1 / 30, frames: true, sev: [0.02, 0.1],
  find(samples, c) {
    const out: Hit[] = [], minArea = c.num('minArea', 0.01), solid = c.num('solid', 0.9), ratio = c.num('scaleRatio', 1.5);
    for (let i = 1; i < samples.length; i++) {
      const s0 = samples[i - 1], s1 = samples[i];
      if (s1.t - s0.t > c.step * 1.5) continue;
      s1.actors.forEach((a1, k) => {
        const a0 = s0.actors[k];
        if (!a0 || a0.vis === a1.vis) { if (a0 && a1.vis && a0.scale > 0 && Math.max(a1.scale / a0.scale, a0.scale / a1.scale) > ratio && a1.area >= minArea) out.push(hit(s1.t, [a1.m.name], a1.area, `scale jumps ${(a1.scale / a0.scale).toFixed(2)}x on screen`)); return; }
        const on = a1.vis ? a1 : a0, area = Math.max(a0.area, a1.area);
        if (area >= minArea && (a0.inFrame || a1.inFrame) && on.scale >= solid && on.opacity >= solid) out.push(hit(s1.t, [a1.m.name], area, `${a1.vis ? 'appears' : 'vanishes'} without a fade, ${(area * 100).toFixed(1)}% of frame`));
      });
    }
    return out;
  },
};

const labelOverlap: Detector = {
  name: 'labels', kind: 'label-overlap', area: 'layout', fix: 'reflow-labels', needs: ['labels'], step: 0.25, sev: [0.2, 0.5],
  find(samples, c) {
    const min = c.num('minFraction', 0.2), out: Hit[] = [];
    for (const s of samples) {
      const L = s.labels.filter((l) => l.vis && l.inFrame && l.rect && l.facing > 0);
      L.forEach((a, i) => { for (const b of L.slice(i + 1)) {
        const f = rectOverlap(a.rect!, b.rect!) / (Math.min(rectArea(a.rect!), rectArea(b.rect!)) || 1);
        if (f >= min) out.push(hit(s.t, [a.name, b.name], f, `cards overlap ${(f * 100).toFixed(0)}% on screen`));
      } });
    }
    return out;
  },
};

const labelFacing: Detector = {
  name: 'labelface', kind: 'label-facing', area: 'layout', fix: 'turn-label', needs: ['labels'], step: 0.25, sev: [0.75, 1],
  find(samples, c) {
    const grazing = c.num('grazing', 0.25);
    return samples.flatMap((s) => s.labels.filter((l) => l.vis && l.inFrame && l.facing < grazing).map((l) => hit(s.t, [l.name], 1 - l.facing, l.facing <= 0 ? 'card faces away from the camera' : `card seen edge-on (${l.facing.toFixed(2)})`)));
  },
};

const decalFight: Detector = {
  name: 'decals', kind: 'zfight', area: 'render', fix: 'raise-decal', needs: ['decals'], step: 1, sev: [1, 2],
  find(samples, c) {
    const eps = c.num('eps', 0.02), out: Hit[] = [];
    for (const s of samples) {
      const D = s.decals.filter((d) => d.vis);
      D.forEach((a, i) => {
        if (!a.offset) out.push(hit(s.t, [a.name], 1, 'decal has no polygon offset'));
        for (const b of D.slice(i + 1)) if (Math.abs(a.y - b.y) < eps && a.order === b.order && rectOverlap(a.box, b.box) > 0) out.push(hit(s.t, [a.name, b.name], 2, `coplanar decals at y=${a.y.toFixed(3)} share a render order`));
      });
    }
    return out;
  },
};

const hudOverlap: Detector = {
  name: 'hudocc', kind: 'hud-overlap', area: 'layout', fix: 'layout-hud', needs: ['hud'], step: 0.25, sev: [0.1, 0.4],
  find(samples, c) {
    const min = c.num('minFraction', 0.1), out: Hit[] = [];
    for (const s of samples) s.hud.forEach((a, i) => { for (const b of s.hud.slice(i + 1)) {
      const f = rectOverlap(a.rect, b.rect) / (Math.min(rectArea(a.rect), rectArea(b.rect)) || 1);
      if (f >= min) out.push(hit(s.t, [a.name, b.name], f, `overlay boxes overlap ${(f * 100).toFixed(0)}%`));
    } });
    return out;
  },
};

const exposure: Detector = {
  name: 'exposure', kind: 'exposure', area: 'grade', fix: 'regrade', needs: ['luma'], step: 1, sev: [0.1, 0.3],
  find(samples, c) {
    const blown = c.num('blown', 0.08), dark = c.num('dark', 0.5), out: Hit[] = [];
    for (const s of samples) {
      if (!s.luma || nearCut(s.t, c.cuts, c.num('cutWindow', 1.3))) continue;
      if (s.luma.blown >= blown) out.push(hit(s.t, ['frame-blown'], s.luma.blown, `${(s.luma.blown * 100).toFixed(0)}% of blocks blown out`));
      if (s.luma.dark >= dark) out.push(hit(s.t, ['frame-crushed'], s.luma.dark, `${(s.luma.dark * 100).toFixed(0)}% of blocks crushed black`));
    }
    return out;
  },
};

const determinism: Detector = {
  name: 'determinism', kind: 'purity', area: 'engine', fix: 'seed-purity', needs: ['pose'], step: 1, sev: [1e-4, 1e-2], twice: true,
  find(samples, c) {
    const out: Hit[] = [], tol = c.num('tol', 1e-4);
    for (const s of samples) {
      const r = c.again?.find((x) => x.t === s.t);
      if (!r) continue;
      const cam = dist(s.cam.p, r.cam.p);
      if (cam > tol) out.push(hit(s.t, ['camera'], cam, `camera differs ${cam.toExponential(1)} m between visits`));
      s.actors.forEach((a, k) => { const d = a.vis && r.actors[k]?.vis ? dist(a.p, r.actors[k].p) : 0; if (d > tol) out.push(hit(s.t, [a.m.name], d, `differs ${d.toExponential(1)} m between visits`)); });
    }
    return out;
  },
};

export const DETECTORS: Detector[] = [obbOverlap, speed, teleport, facing, camJerk, camCut, camInside, pop, labelOverlap, labelFacing, decalFight, hudOverlap, exposure, determinism];
export const severityOf = (d: Detector, peak: number): Severity => grade(peak, d.sev);
