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
