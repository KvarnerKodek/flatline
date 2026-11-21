import { describe, expect, it } from 'vitest';
import { needsDraw } from '../src/player';

const base = { playing: false, hidden: false, dirty: false, t: 4, drawnT: 4, now: 1000, drawnAt: 900 };

describe('needsDraw', () => {
  it('skips an unchanged paused frame', () => expect(needsDraw(base)).toBe(false));
  it('draws while playing, after a seek, a resize, and on the idle refresh', () => {
    expect(needsDraw({ ...base, playing: true })).toBe(true);
    expect(needsDraw({ ...base, t: 5 })).toBe(true);
    expect(needsDraw({ ...base, dirty: true })).toBe(true);
    expect(needsDraw({ ...base, now: 1200 })).toBe(true);
  });
  it('never draws in a hidden tab', () => expect(needsDraw({ ...base, hidden: true, playing: true, dirty: true })).toBe(false));
});
