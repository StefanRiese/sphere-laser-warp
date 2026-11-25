import { describe, expect, it } from 'vitest';
import { type Projection, planeToSurface, surfaceToPlane } from './projection';

const R = 35;
const projections: Projection[] = ['equidistant', 'stereographic', 'equalarea'];

describe('projection', () => {
  it.each(projections)('%s maps the view pole to the origin', (proj) => {
    const p = surfaceToPlane(proj, R, 0, 0)!;
    expect(p.u).toBeCloseTo(0, 9);
    expect(p.v).toBeCloseTo(0, 9);
  });

  it.each(projections)('%s round-trips surface -> plane -> surface', (proj) => {
    for (const x of [-20, -5, 0, 7, 18]) {
      for (const theta of [-1.0, -0.3, 0, 0.4, 1.1]) {
        const pl = surfaceToPlane(proj, R, x, theta)!;
        const back = planeToSurface(proj, R, pl.u, pl.v)!;
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.theta).toBeCloseTo(theta, 6);
      }
    }
  });

  it('equidistant: along the central meridian u equals true arc length', () => {
    const phi = 0.4;
    const p = surfaceToPlane('equidistant', R, R * Math.sin(phi), 0)!;
    expect(p.u).toBeCloseTo(R * phi, 9);
    expect(p.v).toBeCloseTo(0, 9);
  });

  it('returns null on the far side of the ball', () => {
    expect(surfaceToPlane('equidistant', R, 0, Math.PI)).toBeNull();
    expect(planeToSurface('equidistant', R, R * 2, 0)).toBeNull();
  });
});

/**
 * Local distortion: Jacobian of (output mm: x, s = R*theta) -> plane (u, v), scaled by the sphere's
 * metric (surface length = dx / cos(phi) along the axis, cos(phi) * ds around it).
 */
function anisotropy(proj: Projection, x: number, theta: number) {
  const h = 1e-4;
  const f = (xx: number, ss: number) => surfaceToPlane(proj, R, xx, ss / R)!;
  const a = f(x + h, R * theta), b = f(x - h, R * theta);
  const c = f(x, R * theta + h), d = f(x, R * theta - h);
  const phi = Math.asin(x / R);
  const cos = Math.cos(phi);
  // columns: plane displacement per unit *surface* length along the axis / around the circle
  const m11 = (a.u - b.u) / (2 * h) * cos, m21 = (a.v - b.v) / (2 * h) * cos;
  const m12 = (c.u - d.u) / (2 * h) / cos, m22 = (c.v - d.v) / (2 * h) / cos;
  const det = m11 * m22 - m12 * m21;
  const fro = m11 * m11 + m12 * m12 + m21 * m21 + m22 * m22;
  const disc = Math.sqrt(Math.max(0, fro * fro - 4 * det * det));
  const s1 = Math.sqrt((fro + disc) / 2), s2 = Math.sqrt((fro - disc) / 2);
  return { ratio: s1 / s2, scale: Math.sqrt(Math.abs(det)) };
}

describe('local distortion', () => {
  const pts: Array<[number, number]> = [[0, 0], [8, 0.2], [-12, -0.3], [15, 0.5]];

  it('stereographic is conformal (no shape stretching)', () => {
    for (const [x, t] of pts) expect(anisotropy('stereographic', x, t).ratio).toBeCloseTo(1, 3);
  });

  it('equalarea preserves area', () => {
    for (const [x, t] of pts) expect(anisotropy('equalarea', x, t).scale).toBeCloseTo(1, 3);
  });

  it('equidistant is exact at the centre and near-isotropic within +-30 deg', () => {
    expect(anisotropy('equidistant', 0, 0).ratio).toBeCloseTo(1, 4);
    expect(anisotropy('equidistant', R * Math.sin(0.5), 0).ratio).toBeLessThan(1.1);
  });
});
