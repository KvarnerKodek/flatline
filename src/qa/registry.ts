import type * as THREE from 'three';
import { DETECTORS, type Need, type Sample } from './detectors';
import type { IgnoreRule, OwnerRule, Report } from './findings';
import { runQa, type QaOptions } from './run';
import { discover, sampleAt, type Env, type SourceHooks } from './sample';

/**
 * What a film tells `flatline-qa`, from `film.qa(world)`. Everything is optional: objects carrying `userData.qa`
 * (see `tagQa`; `pinned` labels and `decal`s tag themselves) are found without it.
 */
export interface QaSource extends SourceHooks {
  /** CSS selectors of HUD boxes that must not overlap; defaults to `.cap` and `.tag`. */
  hud?: string[];
  /** Instants where the film cuts on purpose. */
  cuts?: number[];
  /** Findings to drop, by detector, subject regex and time window. */
  ignore?: IgnoreRule[];
  /** Routes findings to the area (and files, agent) owning a subject. */
  owners?: OwnerRule[];
}

/** `window.__flatline.qa`: the page side of the contract, filled in by the player. */
export interface Qa {
  detectors: Array<{ name: string; kind: string; needs: Need[]; step: number; fix: string }>;
  /** Seeks to `t` and returns what the given needs (default all) observe. */
  sample(t: number, needs?: Need[]): Sample;
  run(o?: QaOptions): { report: Report; table: string };
  /** Adds more to the source after load, for a host that registers actors from outside the film (`flatline-qa --setup`). */
  use(more: QaSource): void;
}

const ALL: Need[] = ['pose', 'obb', 'fade', 'labels', 'decals', 'hud', 'luma'];

const join = <T>(a?: () => T[], b?: () => T[]) => (a || b ? () => [...(a?.() ?? []), ...(b?.() ?? [])] : undefined);

export function createQa(env: Env, duration: number, first: QaSource = {}): Qa {
  let source = first;
  const find = () => discover(env.scene, source, source.hud);
  return {
    use: (m) => { source = { actors: join(source.actors, m.actors), labels: join(source.labels, m.labels), decals: join(source.decals, m.decals), obstacles: join(source.obstacles, m.obstacles), hud: m.hud ?? source.hud, cuts: [...(source.cuts ?? []), ...(m.cuts ?? [])], ignore: [...(source.ignore ?? []), ...(m.ignore ?? [])], owners: [...(source.owners ?? []), ...(m.owners ?? [])] }; },
    detectors: DETECTORS.map(({ name, kind, needs, step, fix }) => ({ name, kind, needs, step, fix })),
    sample: (t, needs = ALL) => sampleAt(env, find(), t, new Set(needs)),
    run(o = {}) {
      const d = find();
      return runQa({
        duration, url: typeof location === 'undefined' ? '' : location.origin + location.pathname,
        coverage: { actors: d.actors.length, labels: d.labels.length, decals: d.decals.length, obstacles: d.obstacles.length },
        sample: (t, needs) => sampleAt(env, d, t, needs),
      }, { ...o, cuts: [...(source.cuts ?? []), ...(o.cuts ?? [])], owners: [...(o.owners ?? []), ...(source.owners ?? [])], ignore: [...(o.ignore ?? []), ...(source.ignore ?? [])] });
    },
  };
}

export function installQa(player: { qa?: Qa }, scene: THREE.Object3D, camera: THREE.PerspectiveCamera, seek: (t: number) => void, duration: number, canvas: HTMLCanvasElement, source?: QaSource) {
  player.qa = createQa({ scene, camera, seek, canvas, hudRoot: document }, duration, source);
}
