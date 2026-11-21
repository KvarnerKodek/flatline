#!/usr/bin/env node
// Finds defects in a flatline film the way a QA pass would, over time, and reports them as JSON plus a table.
//   flatline-qa --url http://127.0.0.1:5180/ [--out qa-report.json] [--only obb,speed] [--skip pop] [--from 0] [--to 60]
//               [--setup register.js] [--step 0.5] [--shard 2/8] [--owners owners.json] [--config '{"obb.minPen":0.2}'] [--fail-on high] [--json] [--list]
//   flatline-qa --merge a.json b.json ... [--out merged.json]   combine shard reports
// register.js is the body of `(qa) => { qa.use({ actors: () => [...] }) }` evaluated in the page for films that do not tag their objects.
// The page side is `window.__flatline.qa` (see src/qa/registry.ts); owners.json is [{ "match": "regex", "area": "...", "files": [], "agent": "..." }].
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string' }, out: { type: 'string', default: 'qa-report.json' }, only: { type: 'string' }, skip: { type: 'string' },
    from: { type: 'string' }, setup: { type: 'string' }, to: { type: 'string' }, step: { type: 'string' }, shard: { type: 'string' }, owners: { type: 'string' },
    config: { type: 'string' }, 'fail-on': { type: 'string', default: 'high' }, size: { type: 'string', default: '1280x720' }, json: { type: 'boolean' },
    list: { type: 'boolean' }, merge: { type: 'boolean' }, chrome: { type: 'string', default: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  },
});
const RANK = { low: 0, medium: 1, high: 2 };
const csv = (s) => (s ? s.split(',').filter(Boolean) : undefined);
const finish = (report, table) => {
  writeFileSync(a.out, JSON.stringify(report, null, 2));
  if (a.json) console.log(JSON.stringify(report));
  else console.log(`${table}\n\n${report.summary.total} findings (${report.summary.bySeverity.high} high, ${report.summary.bySeverity.medium} medium, ${report.summary.bySeverity.low} low) -> ${a.out}${report.notes.map((n) => `\nnote: ${n}`).join('')}`);
  process.exit(report.findings.some((f) => RANK[f.severity] >= RANK[a['fail-on']]) ? 1 : 0);
};

if (a.merge) {
  const rs = positionals.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const key = (f) => `${f.detector}|${[...f.subjects].sort().join(',')}`, out = [];
  for (const f of rs.flatMap((r) => r.findings).sort((x, y) => x.t0 - y.t0)) {
    const m = out.find((o) => key(o) === key(f) && f.t0 - o.t1 <= 0.25);
    if (!m) { out.push({ ...f }); continue; }
    Object.assign(m, { t1: Math.max(m.t1, f.t1), count: m.count + f.count, severity: RANK[f.severity] > RANK[m.severity] ? f.severity : m.severity, ...(f.peak > m.peak ? { peak: f.peak, peakT: f.peakT, message: f.message } : {}) });
  }
  out.sort((x, y) => RANK[y.severity] - RANK[x.severity] || x.t0 - y.t0);
  const by = (k) => out.reduce((m, f) => ({ ...m, [f[k]]: (m[f[k]] ?? 0) + 1 }), {});
  const s = by('severity');
  finish({ ...rs[0], range: [Math.min(...rs.map((r) => r.range[0])), Math.max(...rs.map((r) => r.range[1]))], notes: [...new Set(rs.flatMap((r) => r.notes))], detectors: rs.flatMap((r) => r.detectors), summary: { total: out.length, bySeverity: { low: s.low ?? 0, medium: s.medium ?? 0, high: s.high ?? 0 }, byArea: by('area'), byKind: by('kind') }, findings: out },
    out.map((f) => `${f.severity.padEnd(6)} ${f.detector.padEnd(12)} ${f.t0.toFixed(1)}-${f.t1.toFixed(1)} ${f.area} ${f.message}`).join('\n') || 'no findings');
}

if (!a.url) { console.error('usage: flatline-qa --url <page> [--only a,b] [--from s] [--to s] [--shard i/n] [--out file] [--owners file] [--list]'); process.exit(2); }
const [w, h] = a.size.split('x').map(Number);
const browser = await puppeteer.launch({ executablePath: a.chrome, headless: 'new', protocolTimeout: 0, args: ['--use-angle=metal', '--ignore-gpu-blocklist'], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(`${a.url}${a.url.includes('?') ? '&' : '?'}still&render&t=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.title === 'ready' && window.__flatline?.qa, { timeout: 120000 });
if (a.list) { console.log((await page.evaluate(() => window.__flatline.qa.detectors)).map((d) => `${d.name.padEnd(12)} ${d.kind.padEnd(16)} step ${d.step.toFixed(3)} needs ${d.needs.join(',')}  fix ${d.fix}`).join('\n')); await browser.close(); process.exit(0); }
if (a.setup) await page.evaluate((code) => new Function('qa', code)(window.__flatline.qa), readFileSync(a.setup, 'utf8'));
const dur = await page.evaluate(() => window.__flatline.duration);
let from = a.from ? Number(a.from) : 0, to = a.to ? Number(a.to) : dur;
if (a.shard) { const [i, n] = a.shard.split('/').map(Number), len = (to - from) / n; [from, to] = [from + (i - 1) * len, from + i * len - 1e-3]; }
const opts = { only: csv(a.only), skip: csv(a.skip), from, to, step: a.step ? Number(a.step) : undefined, config: a.config ? JSON.parse(a.config) : undefined, owners: a.owners ? JSON.parse(readFileSync(a.owners, 'utf8')) : undefined };
const { report, table } = await page.evaluate((o) => window.__flatline.qa.run(o), opts);
await browser.close();
finish(report, table);
