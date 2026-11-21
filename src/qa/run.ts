import { DETECTORS, severityOf, type Ctx, type Detector, type Need, type Sample } from './detectors';
import { dedup, formatTable, groupHits, isIgnored, reproFor, routeOwner, sortFindings, summarise, type Finding, type IgnoreRule, type OwnerRule, type Report } from './findings';

export interface QaOptions {
  /** Detector names to run; all when empty. */
  only?: string[];
  skip?: string[];
  from?: number;
  to?: number;
  /** Overrides every detector's sampling interval; detectors that compare consecutive frames only accept a finer one. */
  step?: number;
  /** Detector tuning as `{ 'obb.minPen': 0.2 }`. */
  config?: Record<string, number>;
  owners?: OwnerRule[];
  ignore?: IgnoreRule[];
  /** Instants where the film cuts on purpose. */
  cuts?: number[];
}

export interface Sampler {
  sample(t: number, needs: Set<Need>): Sample;
  duration: number;
  url: string;
  coverage: Record<string, number>;
}

/** Instants `from, from+step, ...` up to and including `to`, without accumulating float error. */
export const times = (from: number, to: number, step: number) => Array.from({ length: Math.max(0, Math.floor((to - from) / step + 1e-9) + 1) }, (_, k) => +(from + k * step).toFixed(6));

/** The sampling interval a detector runs at under an override. */
export const stepFor = (d: Detector, override?: number) => (override === undefined ? d.step : d.frames ? Math.min(override, d.step) : override);

export const select = (o: Pick<QaOptions, 'only' | 'skip'>) => DETECTORS.filter((d) => (!o.only?.length || o.only.includes(d.name)) && !o.skip?.includes(d.name));

const MISSING: Partial<Record<Need, string>> = { obb: 'actors', pose: 'actors', fade: 'actors', labels: 'labels', decals: 'decals' };

export function runQa(s: Sampler, o: QaOptions = {}): { report: Report; table: string } {
  const from = Math.max(0, o.from ?? 0), to = Math.min(o.to ?? Infinity, s.duration - 0.05), config = o.config ?? {}, cuts = o.cuts ?? [];
  const dets = select(o), notes: string[] = [], infos: Report['detectors'] = [], found: Finding[] = [];
  const groups = new Map<number, Detector[]>();
  for (const d of dets) { const k = stepFor(d, o.step); groups.set(k, [...(groups.get(k) ?? []), d]); }

  for (const [step, ds] of groups) {
    const needs = new Set(ds.flatMap((d) => d.needs)), ts = times(from, to, step);
    const t0 = performance.now(), samples = ts.map((t) => s.sample(t, needs));
    const again = ds.some((d) => d.twice) ? [...ts].reverse().map((t) => s.sample(t, needs)) : undefined, ms = performance.now() - t0;
    for (const d of ds) {
      const ctx: Ctx = { step, cuts, again, num: (n, def) => config[`${d.name}.${n}`] ?? def };
      const hits = d.find(samples, ctx).filter((h) => !isIgnored(h, d.name, o.ignore));
      const fs = groupHits(hits, step * 1.5 + 1e-6).map((g): Finding => ({
        detector: d.name, kind: d.kind, subjects: g.subjects, severity: severityOf(d, g.peak), ...routeOwner(g.subjects, o.owners ?? [], d.area),
        fix: d.fix, message: `${g.subjects.join(' x ')}: ${g.note}`, t0: g.t0, t1: g.t1, peak: +g.peak.toFixed(4), peakT: g.peakT, count: g.count, repro: '',
      }));
      found.push(...fs);
      infos.push({ name: d.name, samples: samples.length, ms: Math.round(ms / ds.length), findings: fs.length });
      const gap = d.needs.map((n) => MISSING[n]).find((k) => k && !s.coverage[k]);
      if (gap) notes.push(`${d.name}: no ${gap} discovered, nothing was checked (tag objects with tagQa or return them from film.qa)`);
    }
  }
  const findings = sortFindings(dedup(found, 0.25)).map((f) => ({ ...f, repro: reproFor(s.url, f.detector, f.t0, f.t1) }));
  return { report: { version: 1, url: s.url, duration: s.duration, range: [from, to], coverage: s.coverage, notes: [...new Set(notes)], detectors: infos, summary: summarise(findings), findings }, table: formatTable(findings) };
}
