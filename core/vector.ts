import { type Placement, type Projection, planeToSurface } from './projection';

/** A point as [x, y] in mm. */
export type Pt = [number, number];

export interface VectorMapParams {
  projection: Projection;
  ballDiameterMm: number;
  axisAngleDeg: number;
  offsetAxisMm: number;
}

/**
 * Forward mapping for vector export: image coordinates in mm (origin at the image centre, y up) to the
 * canonical file layout: x = position along the rotation axis (mm), y = arc length around the ball at the
 * equator, `R * theta` (mm). It is the inverse of the lookup the raster warp performs for each pixel.
 * Returns null where the point does not fit on the visible side of the ball.
 */
export function makeMapper(p: VectorMapParams): (xi: number, yi: number) => Pt | null {
  const R = p.ballDiameterMm / 2;
  const alpha = (p.axisAngleDeg * Math.PI) / 180;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const pl: Placement = { phi: Math.asin(Math.max(-1, Math.min(1, p.offsetAxisMm / R))), theta: 0 };
  return (xi, yi) => {
    // undo the axis rotation: image direction `alpha` runs along the rotation axis
    const u = xi * ca + yi * sa;
    const v = -xi * sa + yi * ca;
    const s = planeToSurface(p.projection, R, u, v, pl);
    return s ? [s.x, R * s.theta] : null;
  };
}

export interface WarpedPolyline {
  /** Mapped pieces. A polyline that leaves the visible side of the ball is split into several runs. */
  runs: Pt[][];
  /** True if the input was closed and survived whole (a single closed run). */
  closed: boolean;
  /** True if any part could not be placed on the ball. */
  clipped: boolean;
}

/**
 * Map a polyline (image mm) onto the ball. Long segments are subdivided first, because a straight line
 * becomes a curve on the sphere.
 */
export function warpPolyline(
  points: Pt[],
  closed: boolean,
  map: (xi: number, yi: number) => Pt | null,
  maxStepMm = 0.5,
): WarpedPolyline {
  const n = points.length;
  if (n < 2) return { runs: [], closed: false, clipped: false };
  const mapped: Array<Pt | null> = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxStepMm));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      mapped.push(map(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  if (!closed) mapped.push(map(points[n - 1]![0], points[n - 1]![1]));

  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  let clipped = false;
  for (const m of mapped) {
    if (m) {
      cur.push(m);
    } else {
      clipped = true;
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return { runs, closed: closed && !clipped && runs.length === 1, clipped };
}
