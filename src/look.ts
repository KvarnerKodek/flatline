import { G, setInk } from './toon';
import type { Grade } from './post';
import type { EdgeOpts, HazeOpts } from './edges';

/**
 * A look bundles every knob that decides how a film is drawn: shading, linework, painterly texture and grade.
 * `CEL` is flatline's original crisp toon; `GHIBLI` is hand-painted: soft band edges, mottled washes, warm brown
 * ink, gentle highlights and a soft watercolour finish.
 */
export interface Look {
  name: string;
  /** ink colour of every outline */
  ink: number;
  /** outline thickness multiplier */
  outline: number;
  /** painterly brush-and-wash mottling, 0 to 1 */
  paint: number;
  /** softness of the cel band edges, 0 hard to 1 soft */
  soft: number;
  /** specular highlight and rim light strength multipliers */
  spec: number;
  rim: number;
  grade: Grade;
  /** screen-space ink lines from a depth and normal pass; replaces the hull outlines unless `edges.hulls` */
  edges?: EdgeOpts;
  /** depth-based aerial perspective and ground fog (needs `edges`) */
  haze?: HazeOpts;
}

export const CEL: Look = { name: 'cel', ink: 0x050a14, outline: 1, paint: 0, soft: 0, spec: 1, rim: 1, grade: {} };

export const GHIBLI: Look = {
  name: 'ghibli', ink: 0x3a2622, outline: 0.55, paint: 1, soft: 1.6, spec: 0.3, rim: 0.7,
  grade: { saturation: 1.2, contrast: 1.1, vignette: 0.3, grain: 0.015, bloom: 0.8, chroma: 0.0006, tint: [1.02, 1, 0.97], lift: 0.01, soften: 0.05, paper: 0.5, bleed: 0.15, split: 1 },
  edges: {},
  haze: { range: [450, 2600], strength: 0.5, tint: [0.66, 0.64, 0.98], tintMix: 0.8, nearSat: 0.14 },
};

/** Push a look into the shared shading uniforms. Called by `play` when the film has a `look`. */
export function applyLook(l: Look) {
  setInk(l.ink);
  G.uOutlineK.value = l.edges && !l.edges.hulls ? 0 : l.outline; G.uPaint.value = l.paint; G.uSoft.value = l.soft; G.uSpecK.value = l.spec; G.uRimK.value = l.rim;
}

/** The look a film is drawn with: its own, or `GHIBLI` when it sets none. Use `CEL` for the crisp toon. */
export const resolveLook = (l?: Look): Look => l ?? GHIBLI;
