import { describe, expect, it } from 'vitest';
import { type Projection, surfaceToPlane } from './projection';
import { type Pt, makeMapper, warpPolyline } from './vector';

const base = { projection: 'equidistant' as Projection, ballDiameterMm: 70, axisAngleDeg: 0, offsetAxisMm: 0 };
const R = 35;

describe('makeMapper', () => {
  it('maps the image centre to the middle of the file at theta 0', () => {
    const m = makeMapper(base)(0, 0)!;
    expect(m[0]).toBeCloseTo(0, 9);
    expect(m[1]).toBeCloseTo(0, 9);
  });

  it('is the inverse of the raster warp lookup (with axis angle and offset)', () => {
    for (const projection of ['equidistant', 'stereographic', 'equalarea'] as const) {
      const p = { projection, ballDiameterMm: 70, axisAngleDeg: 90, offsetAxisMm: 6 };
      const map = makeMapper(p);
      const alpha = Math.PI / 2;
      const phi = Math.asin(6 / R);
      for (const [x, theta] of [[8, 0.2], [3, -0.3], [10, 0.4]] as const) {
        // the raster warp: sphere point -> plane -> rotated into image coordinates
        const q = surfaceToPlane(projection, R, x, theta, { phi, theta: 0 })!;
        const ui = q.u * Math.cos(alpha) - q.v * Math.sin(alpha);
        const vi = q.u * Math.sin(alpha) + q.v * Math.cos(alpha);
        const back = map(ui, vi)!;
        expect(back[0]).toBeCloseTo(x, 6);
        expect(back[1]).toBeCloseTo(R * theta, 6);
      }
    }
  });
});

describe('warpPolyline', () => {
  const map = makeMapper(base);

  it('keeps a horizontal line on the equator and subdivides it', () => {
    const w = warpPolyline([[-10, 0], [10, 0]], false, map);
    expect(w.clipped).toBe(false);
    expect(w.runs).toHaveLength(1);
    const run = w.runs[0]!;
    expect(run.length).toBeGreaterThan(20);
    for (const [, y] of run) expect(y).toBeCloseTo(0, 9);
    for (let i = 1; i < run.length; i++) expect(run[i]![0]).toBeGreaterThan(run[i - 1]![0]);
  });

  it('bows a straight line above the centre outward toward its ends', () => {
    // 8 mm above the centre line (file y is negative upward). Circles of latitude get shorter away from the
    // equator, so the file needs more rotation per mm there and the line bows away from the axis.
    const run = warpPolyline([[-15, 8], [15, 8]], false, map).runs[0]!;
    const mid = run[Math.floor(run.length / 2)]![1];
    const end = run[0]![1];
    expect(mid).toBeCloseTo(-8, 0);
    expect(Math.abs(end)).toBeGreaterThan(Math.abs(mid));
  });

  it('closes a small polygon as one closed run', () => {
    const sq: Pt[] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const w = warpPolyline(sq, true, map);
    expect(w.closed).toBe(true);
    expect(w.runs).toHaveLength(1);
  });

  it('splits and flags a line that leaves the visible side of the ball', () => {
    const w = warpPolyline([[-150, 0], [0, 0], [150, 0]], false, map);
    expect(w.clipped).toBe(true);
    expect(w.runs).toHaveLength(1); // only the middle part survives
    expect(w.closed).toBe(false);
  });
});
