import type { Interval } from './geom';

export type Severity = 'low' | 'medium' | 'high';
const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
export const worse = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
export const grade = (v: number, [medium, high]: [number, number]): Severity => (v >= high ? 'high' : v >= medium ? 'medium' : 'low');

/** One detector observation at one sampled instant; `value` grows with badness. */
export interface Hit { t: number; key: string; subjects: string[]; value: number; note: string }

export interface Finding extends Interval {
  detector: string;
  kind: string;
  subjects: string[];
  severity: Severity;
  area: string;
  files: string[];
  agent?: string;
  fix: string;
  message: string;
  peak: number;
  peakT: number;
  count: number;
  repro: string;
}

/** Routes a finding to the area (and files, agent) owning the first subject that matches a rule. */
export interface OwnerRule { match: string; area: string; files?: string[]; agent?: string }

export interface IgnoreRule { detector?: string; subject?: string; t0?: number; t1?: number }

export const isIgnored = (h: Hit, detector: string, rules: IgnoreRule[] = []) =>
  rules.some((r) => (!r.detector || r.detector === detector) && (r.t0 === undefined || h.t >= r.t0) && (r.t1 === undefined || h.t <= r.t1) && (!r.subject || h.subjects.some((s) => new RegExp(r.subject!).test(s))));

export function routeOwner(subjects: string[], rules: OwnerRule[], area: string): Pick<Finding, 'area' | 'files' | 'agent'> {
  for (const r of rules) {
    const re = new RegExp(r.match);
    if (subjects.some((s) => re.test(s))) return { area: r.area, files: r.files ?? [], agent: r.agent };
  }
  return { area, files: [] };
}

/** Joins hits of one key into runs, splitting where consecutive samples are more than `gap` apart. */
export function groupHits(hits: Hit[], gap: number) {
  const runs: Array<Interval & { hits: Hit[] }> = [], open = new Map<string, Interval & { hits: Hit[] }>();
  for (const h of [...hits].sort((a, b) => a.t - b.t)) {
    const r = open.get(h.key);
    if (r && h.t - r.t1 <= gap) { r.t1 = h.t; r.hits.push(h); continue; }
    const n = { t0: h.t, t1: h.t, hits: [h] };
    open.set(h.key, n);
    runs.push(n);
  }
  return runs.map((r) => {
    const top = r.hits.reduce((a, b) => (b.value > a.value ? b : a));
    return { t0: r.t0, t1: r.t1, subjects: top.subjects, peak: top.value, peakT: top.t, note: top.note, count: r.hits.length };
  });
}

const sameKey = (f: Finding) => `${f.detector}|${[...f.subjects].sort().join(',')}`;

/** Merges findings of the same detector and subjects whose intervals touch within `gap`, keeping the worst peak. */
export function dedup(findings: Finding[], gap = 0.25): Finding[] {
  const out: Finding[] = [];
  for (const f of [...findings].sort((a, b) => a.t0 - b.t0)) {
    const m = out.find((o) => sameKey(o) === sameKey(f) && f.t0 - o.t1 <= gap && f.t1 >= o.t0 - gap);
    if (!m) { out.push({ ...f }); continue; }
    const top = f.peak > m.peak ? f : m;
    Object.assign(m, { t0: Math.min(m.t0, f.t0), t1: Math.max(m.t1, f.t1), severity: worse(m.severity, f.severity), peak: top.peak, peakT: top.peakT, message: top.message, count: m.count + f.count });
  }
  return out;
}

export interface Report {
  version: 1;
  url: string;
  duration: number;
  range: [number, number];
  coverage: Record<string, number>;
  notes: string[];
  detectors: Array<{ name: string; samples: number; ms: number; findings: number }>;
  summary: { total: number; bySeverity: Record<Severity, number>; byArea: Record<string, number>; byKind: Record<string, number> };
  findings: Finding[];
}

const tally = <T>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [key(x)]: (m[key(x)] ?? 0) + 1 }), {});

export function summarise(findings: Finding[]): Report['summary'] {
  const s = tally(findings, (f) => f.severity);
  return { total: findings.length, bySeverity: { low: s.low ?? 0, medium: s.medium ?? 0, high: s.high ?? 0 }, byArea: tally(findings, (f) => f.area), byKind: tally(findings, (f) => f.kind) };
}

export const sortFindings = (fs: Finding[]) => [...fs].sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.t0 - b.t0);

/** Combines reports of time shards (or repeated runs) into one with duplicate findings merged. */
export function mergeReports(reports: Report[], gap = 0.25): Report {
  const [first] = reports, findings = sortFindings(dedup(reports.flatMap((r) => r.findings), gap));
  return {
    ...first,
    range: [Math.min(...reports.map((r) => r.range[0])), Math.max(...reports.map((r) => r.range[1]))],
    notes: [...new Set(reports.flatMap((r) => r.notes))],
    detectors: reports.flatMap((r) => r.detectors),
    summary: summarise(findings),
    findings,
  };
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

export function formatTable(findings: Finding[]): string {
  if (!findings.length) return 'no findings';
  const head = `${pad('sev', 6)} ${pad('detector', 12)} ${pad('t0-t1', 13)} ${pad('area', 10)} ${pad('fix', 16)} message`;
  const rows = findings.map((f) => `${pad(f.severity, 6)} ${pad(f.detector, 12)} ${pad(`${f.t0.toFixed(1)}-${f.t1.toFixed(1)}`, 13)} ${pad(f.area + (f.agent ? '@' + f.agent : ''), 10)} ${pad(f.fix, 16)} ${f.message}`);
  return [head, ...rows].join('\n');
}

export const reproFor = (url: string, detector: string, t0: number, t1: number) =>
  `flatline-qa --url ${url} --only ${detector} --from ${Math.max(0, t0 - 0.5).toFixed(2)} --to ${(t1 + 0.5).toFixed(2)}`;
