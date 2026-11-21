import { describe, expect, it } from 'vitest';
import { Mix, type Sound } from '../src/soundtrack';

const fake = (lead = 0): Sound & { seen: number[]; enabled: number } => {
  const s = { on: false, seen: [] as number[], enabled: 0, prepare() {}, enable(on: boolean, ready?: () => void) { s.on = on; s.enabled++; ready?.(); }, sync(t: number) { s.seen.push(t); return t + lead; }, wavBase64: () => '' };
  return s;
};

describe('Mix', () => {
  it('lets the first sound lead the clock and hands that time to the rest', () => {
    const a = fake(0.1), b = fake();
    expect(new Mix([a, b]).sync(5, true)).toBeCloseTo(5.1);
    expect(b.seen[0]).toBeCloseTo(5.1);
  });

  it('enables every part and reports ready once', () => {
    const a = fake(), b = fake();
    let ready = 0;
    const m = new Mix([a, b]);
    m.enable(true, () => ready++);
    expect([a.enabled, b.enabled, ready, m.on]).toEqual([1, 1, 1, true]);
  });
});
