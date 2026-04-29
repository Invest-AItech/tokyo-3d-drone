import { describe, it, expect } from 'vitest';
import { getMarkerColor } from '../app/static/viewer/marker-colors.js';

describe('marker-colors', () => {
  it('first point is Magenta', () => {
    expect(getMarkerColor(0, 5)).toBe('#e879f9');
  });
  it('last point is Cyan', () => {
    expect(getMarkerColor(4, 5)).toBe('#22d3ee');
  });
  it('intermediate points are Amber', () => {
    expect(getMarkerColor(1, 5)).toBe('#fbbf24');
    expect(getMarkerColor(2, 5)).toBe('#fbbf24');
    expect(getMarkerColor(3, 5)).toBe('#fbbf24');
  });
  it('single point case (only start)', () => {
    expect(getMarkerColor(0, 1)).toBe('#e879f9');
  });
  it('two-point case (start + end, no intermediate)', () => {
    expect(getMarkerColor(0, 2)).toBe('#e879f9');
    expect(getMarkerColor(1, 2)).toBe('#22d3ee');
  });
});
