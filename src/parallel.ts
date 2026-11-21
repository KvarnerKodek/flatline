/** Pure helpers for parallel work on one film: shard planning, frame diffs, claims, iteration logs, ports. No imports, so Node can run it directly. */

export interface Shard { index: number; start: number; end: number }

/** Contiguous, balanced frame ranges [start, end); sizes differ by at most one and empty shards are dropped. */
export const planShards = (frames: number, shards: number): Array<Shard> => {
  const n = Math.max(1, Math.min(Math.floor(shards), frames));
  const base = Math.floor(frames / n), extra = frames % n;
  return Array.from({ length: frames > 0 ? n : 0 }, (_, index) => {
    const start = index * base + Math.min(index, extra);
    return { index, start, end: start + base + (index < extra ? 1 : 0) };
  });
};

/** The one expression that turns a frame index into film time, shared by every renderer. */
export const frameTime = (o: { from: number; fps: number; i: number }): number => o.from + o.i / o.fps;

export interface FrameSig { t: number; h: string; th: string }
export interface HashManifest { fps: number; from: number; size: string; frames: Array<FrameSig> }

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Mean absolute difference of two base64 thumbnails, 0..1. */
export const thumbDiff = (a: string, b: string): number => {
  const x = bytes(a), y = bytes(b);
  return x.reduce((s, v, i) => s + Math.abs(v - (y[i] ?? 0)), 0) / (255 * Math.max(1, x.length));
};

export interface Change { t0: number; t1: number; frames: number; maxDiff: number; meanDiff: number }
export interface FilmDiff { comparable: boolean; reason?: string; changedFrames: number; changes: Array<Change> }

/** Which times differ between two versions of a film, merged into ranges and sized by thumbnail difference. */
export const diffManifests = (a: HashManifest, b: HashManifest, o: { gap?: number } = {}): FilmDiff => {
  const gap = o.gap ?? 1;
  if (a.fps !== b.fps || a.from !== b.from || a.size !== b.size || a.frames.length !== b.frames.length)
    return { comparable: false, reason: 'fps, from, size and frame count must match', changedFrames: 0, changes: [] };
  const hits = a.frames.flatMap((f, i) => (f.h === b.frames[i].h ? [] : [{ i, t: f.t, d: thumbDiff(f.th, b.frames[i].th) }]));
  const groups = hits.reduce<Array<typeof hits>>((g, h) => {
    const last = g[g.length - 1];
    return last && h.i - last[last.length - 1].i <= gap + 1 ? [...g.slice(0, -1), [...last, h]] : [...g, [h]];
  }, []);
  const changes = groups.map((g) => ({
    t0: g[0].t, t1: g[g.length - 1].t + 1 / a.fps, frames: g.length,
    maxDiff: Math.max(...g.map((h) => h.d)), meanDiff: g.reduce((s, h) => s + h.d, 0) / g.length,
  }));
  return { comparable: true, changedFrames: hits.length, changes };
};

/** True when every change lies inside [t0, t1], proving an edit touched only its own time range. */
export const touchedOnly = (d: FilmDiff, t0: number, t1: number): boolean =>
  d.comparable && d.changes.every((c) => c.t0 >= t0 - 1e-9 && c.t1 <= t1 + 1e-9);

export interface Claim { id: string; agent: string; area: string; files: Array<string>; time?: [number, number]; locks?: Array<string> }
export interface Collision { a: string; b: string; kind: 'file' | 'time' | 'lock'; detail: string }

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const strs = (v: unknown): v is Array<string> => Array.isArray(v) && v.every(isStr);

/** Problems with a claims manifest `{ version: 1, claims: Claim[] }`; empty when valid. */
export const validateClaims = (m: unknown): Array<string> => {
  const claims = (m as { version?: unknown; claims?: unknown } | null)?.claims;
  if ((m as { version?: unknown } | null)?.version !== 1) return ['version must be 1'];
  if (!Array.isArray(claims)) return ['claims must be an array'];
  const seen = new Set<string>();
  return claims.flatMap((c: Partial<Claim>, i) => {
    const at = `claims[${i}]${isStr(c?.id) ? ` ${c.id}` : ''}`;
    const e = [
      ...(isStr(c?.id) ? [] : ['id']), ...(isStr(c?.agent) ? [] : ['agent']), ...(isStr(c?.area) ? [] : ['area']),
      ...(strs(c?.files) && c.files.length ? [] : ['files']),
      ...(c?.locks === undefined || strs(c.locks) ? [] : ['locks']),
      ...(c?.time === undefined || (Array.isArray(c.time) && c.time.length === 2 && c.time.every(Number.isFinite) && c.time[0] < c.time[1] && c.time[0] >= 0) ? [] : ['time']),
      ...(strs(c?.files) ? c.files.filter((f) => /\*/.test(f.replace(/\/\*{1,2}$/, '')) || f.startsWith('/') || f.includes('..')).map((f) => `files ${f}`) : []),
    ].map((p) => `${at}: invalid ${p}`);
    const dup = isStr(c?.id) && seen.has(c.id) ? [`${at}: duplicate id`] : [];
    if (isStr(c?.id)) seen.add(c.id);
    return [...e, ...dup];
  });
};

const norm = (f: string) => ({ p: f.replace(/(\/\*{1,2})?\/?$/, '').replace(/^\.\//, ''), dir: /\/\*{0,2}$/.test(f) });
const under = (p: string, dir: string) => p === dir || p.startsWith(`${dir}/`);
const filesOverlap = (x: string, y: string): boolean => {
  const a = norm(x), b = norm(y);
  return a.dir && b.dir ? under(a.p, b.p) || under(b.p, a.p) : a.dir ? under(b.p, a.p) : b.dir ? under(a.p, b.p) : a.p === b.p;
};

/** Pairs of claims by different agents that share a file, a lock, or the same area and time range. A claim without `time` covers the whole film. */
export const findCollisions = (claims: Array<Claim>): Array<Collision> =>
  claims.flatMap((a, i) => claims.slice(i + 1).flatMap((b): Array<Collision> => {
    if (a.agent === b.agent) return [];
    const file = a.files.flatMap((x) => b.files.filter((y) => filesOverlap(x, y)).map((y) => `${x} ~ ${y}`));
    const lock = (a.locks ?? []).filter((l) => (b.locks ?? []).includes(l));
    const [a0, a1] = a.time ?? [0, Infinity], [b0, b1] = b.time ?? [0, Infinity];
    const time = a.area === b.area && a0 < b1 && b0 < a1;
    return [
      ...file.map((detail) => ({ a: a.id, b: b.id, kind: 'file' as const, detail })),
      ...lock.map((detail) => ({ a: a.id, b: b.id, kind: 'lock' as const, detail })),
      ...(time ? [{ a: a.id, b: b.id, kind: 'time' as const, detail: `${a.area} ${Math.max(a0, b0)}..${Math.min(a1, b1)}s` }] : []),
    ];
  }));

export const EVIDENCE_KINDS = ['stills', 'probe', 'benchmark', 'test'] as const;
export interface Iteration { n: number; area: string; change: string; evidence: { kind: (typeof EVIDENCE_KINDS)[number]; ref: string }; verified: boolean; files?: Array<string>; time?: [number, number] }
export interface LegacyIteration { n: number; change: string; legacy: true }
export interface IterLog { entries: Array<Iteration | LegacyIteration>; errors: Array<string> }

/** Reads a log of JSON lines (the schema) and legacy `N. text` lines; anything else is an error. */
export const parseIterLog = (text: string): IterLog => {
  const rows = text.split('\n').map((l, i) => ({ l: l.trim(), at: `line ${i + 1}` })).filter((r) => r.l && !r.l.startsWith('#'));
  const parsed = rows.map(({ l, at }) => {
    const m = l.match(/^(\d+)\.\s+(.+)/);
    if (m) return { at, entry: { n: Number(m[1]), change: m[2], legacy: true as const } as LegacyIteration | Iteration };
    try { return { at, entry: JSON.parse(l) as Iteration }; } catch { return { at, error: `${at}: not JSON or "N. text"` }; }
  });
  const checked = parsed.map((p) => {
    if (!p.entry) return p;
    const e = p.entry as Partial<Iteration & LegacyIteration>;
    const bad = e.legacy ? [] : [
      ...(Number.isInteger(e.n) && e.n! > 0 ? [] : ['n']), ...(isStr(e.area) ? [] : ['area']), ...(isStr(e.change) ? [] : ['change']),
      ...(typeof e.verified === 'boolean' ? [] : ['verified']),
      ...(EVIDENCE_KINDS.includes(e.evidence?.kind as never) && isStr(e.evidence?.ref) ? [] : ['evidence']),
      ...(e.verified && !(isStr(e.evidence?.ref)) ? ['verified needs evidence.ref'] : []),
    ];
    return bad.length ? { at: p.at, error: `${p.at}: invalid ${bad.join(', ')}` } : p;
  });
  const entries = checked.flatMap((p) => (p.entry && !('error' in p) ? [p.entry] : []));
  const dup = entries.flatMap((e, i) => ('legacy' in e ? [] : entries.slice(0, i).some((o) => !('legacy' in o) && o.n === e.n && o.area === e.area) ? [`duplicate n ${e.n} in ${e.area}`] : []));
  return { entries, errors: [...checked.flatMap((p) => ('error' in p && p.error ? [p.error] : [])), ...dup] };
};

export interface IterCount { verified: number; unverified: number; legacy: number; byArea: Record<string, number> }

/** Counts verified iterations overall and per area; legacy lines are tallied apart unless `legacyVerified`. */
export const countIterations = (entries: IterLog['entries'], o: { legacyVerified?: boolean } = {}): IterCount =>
  entries.reduce<IterCount>((c, e) => {
    if ('legacy' in e) return { ...c, legacy: c.legacy + 1, verified: c.verified + (o.legacyVerified ? 1 : 0) };
    return e.verified
      ? { ...c, verified: c.verified + 1, byArea: { ...c.byArea, [e.area]: (c.byArea[e.area] ?? 0) + 1 } }
      : { ...c, unverified: c.unverified + 1 };
  }, { verified: 0, unverified: 0, legacy: 0, byArea: {} });

/** A stable port per agent in [base, base + span), probing past ports in `taken` and `reserved`. */
export const agentPort = (o: { agent: string; base?: number; span?: number; taken?: Array<number>; reserved?: Array<number> }): number => {
  const { agent, base = 5200, span = 800, taken = [], reserved = [5173, 5180, 5190] } = o;
  const h = [...agent].reduce((s, c) => Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const skip = new Set([...taken, ...reserved]);
  const k = Array.from({ length: span }, (_, i) => base + ((h + i) % span)).find((p) => !skip.has(p));
  if (k === undefined) throw new Error('no free port in range');
  return k;
};
