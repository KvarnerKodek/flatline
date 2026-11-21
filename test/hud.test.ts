import { describe, expect, it } from 'vitest';
import { clearTag } from '../src/hud';

describe('tag stacking', () => {
  const placed = [{ x: 100, y: 200, w: 80 }];
  it('leaves a tag alone when it is clear in either direction', () => {
    expect(clearTag(placed, 100, 300, 80)).toBe(300);
    expect(clearTag(placed, 400, 200, 80)).toBe(200);
  });
  it('pushes an overlapping tag one step away on the side it leans to', () => {
    expect(clearTag(placed, 110, 210, 80)).toBe(250);
    expect(clearTag(placed, 110, 190, 80)).toBe(150);
  });
  it('uses the given step', () => {
    expect(clearTag(placed, 110, 210, 80, 30)).toBe(230);
  });
  it('steps past every tag in a column', () => {
    const column = [{ x: 100, y: 200, w: 80 }, { x: 100, y: 250, w: 80 }];
    expect(clearTag(column, 100, 220, 80)).toBe(300);
  });
});

import { avoidRects, captionPose, leaderSegment } from '../src/hud';

describe('caption pose', () => {
  const c = { t0: 10, t1: 20, k: '', h: '' };
  it('is hidden outside and fully shown inside the caption window', () => {
    expect(captionPose(c, 9)).toEqual({ a: 0, dy: 12 });
    expect(captionPose(c, 15)).toEqual({ a: 1, dy: 0 });
    expect(captionPose(c, 21).a).toBe(0);
  });
  it('eases with zero slope at both ends and mirrors on the way out', () => {
    expect(captionPose(c, 10.045).a).toBeLessThan(0.01);
    expect(captionPose(c, 10.45).a).toBeCloseTo(0.5, 9);
    expect(captionPose(c, 19.55).a).toBeCloseTo(0.5, 9);
    expect(captionPose(c, 10.3).dy).toBeCloseTo(12 * (1 - captionPose(c, 10.3).a), 9);
  });
  it('is a pure function of time', () => {
    expect(captionPose(c, 10.3)).toEqual(captionPose(c, 10.3));
  });
});

describe('leader line', () => {
  const box = { x: 100, y: 100, w: 80, h: 30 };
  it('starts on the tag edge nearest the target and stops a gap short of it', () => {
    const l = leaderSegment(box, { x: 300, y: 115 }, 10);
    expect(l.x).toBe(180);
    expect(l.y).toBe(115);
    expect(l.len).toBeCloseTo(110, 9);
    expect(l.angle).toBeCloseTo(0, 9);
  });
  it('attaches below, above and at corners', () => {
    expect(leaderSegment(box, { x: 140, y: 300 }, 0)).toMatchObject({ x: 140, y: 130 });
    expect(leaderSegment(box, { x: 140, y: 0 }, 0)).toMatchObject({ x: 140, y: 100 });
    expect(leaderSegment(box, { x: 0, y: 0 }, 0)).toMatchObject({ x: 100, y: 100 });
  });
  it('vanishes when the target is inside the gap or the tag', () => {
    expect(leaderSegment(box, { x: 185, y: 115 }, 10).len).toBe(0);
    expect(leaderSegment(box, { x: 140, y: 115 }, 10).len).toBe(0);
  });
});

describe('avoid regions', () => {
  const keep = [{ x: 200, y: 100, w: 60, h: 60 }];
  it('leaves a clear tag alone', () => {
    expect(avoidRects(keep, 0, 100, 80, 30)).toBe(100);
  });
  it('moves an overlapping tag to the nearer side of the region, with a margin', () => {
    expect(avoidRects(keep, 190, 90, 80, 30)).toBe(100 - 30 - 6);
    expect(avoidRects(keep, 190, 140, 80, 30)).toBe(160 + 6);
  });
});

import { clampTag } from '../src/hud';

describe('tag clamping', () => {
  it('keeps a stacked tag inside the viewport', () => {
    expect(clampTag(990, 40, 1000)).toBe(952);
    expect(clampTag(-20, 40, 1000, 116)).toBe(116);
    expect(clampTag(500, 40, 1000)).toBe(500);
  });
});
