/**
 * Projections between the flat image plane (mm) and the sphere.
 *
 * Conventions (see CLAUDE.md):
 *  - Ball radius R, rotation axis = X axis, viewer looks along -Z.
 *  - The image centre sits at the view pole P0 = (0, 0, R).
 *  - A sphere point is addressed by axis position x and rotation angle theta:
 *      P = (x, -r*sin(theta), r*cos(theta)),  r = sqrt(R^2 - x^2)
 *    so theta = 0 faces the viewer and positive theta moves the surface DOWN
 *    in the image.
 *  - Image plane: u to the right, v up, both in mm on the ball surface scale.
 */

export type Projection = 'equidistant' | 'stereographic' | 'equalarea';

/** Radial distance (mm) in the image plane for angular distance c (rad) from the view pole. */
export function radial(proj: Projection, R: number, c: number): number {
  switch (proj) {
    case 'equidistant':
      return R * c;
    case 'stereographic':
      return 2 * R * Math.tan(c / 2);
    case 'equalarea':
      return 2 * R * Math.sin(c / 2);
  }
}

/** Inverse of {@link radial}: angular distance c for a plane radius rho. May return NaN if out of range. */
export function radialInverse(proj: Projection, R: number, rho: number): number {
  switch (proj) {
    case 'equidistant':
      return rho / R;
    case 'stereographic':
      return 2 * Math.atan(rho / (2 * R));
    case 'equalarea':
      return 2 * Math.asin(rho / (2 * R));
  }
}

/**
 * Where the image centre sits on the ball: latitude phi (rad, along the rotation axis, x = R*sin(phi))
 * and rotation angle theta (rad). Omitted = equator, facing the viewer.
 */
export interface Placement {
  phi: number;
  theta: number;
}

type Vec = [number, number, number];

const rx = ([x, y, z]: Vec, a: number): Vec => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = ([x, y, z]: Vec, b: number): Vec => [x * Math.cos(b) + z * Math.sin(b), y, -x * Math.sin(b) + z * Math.cos(b)];

/** World (ball) frame -> frame in which the image centre is at the view pole. */
const toLocal = (p: Vec, pl: Placement): Vec => ry(rx(p, -pl.theta), -pl.phi);
/** Inverse of {@link toLocal}. */
const toWorld = (p: Vec, pl: Placement): Vec => rx(ry(p, pl.phi), pl.theta);

/** Sphere point (axis position x mm, rotation theta rad) -> image plane (u, v) in mm. Null on the far side. */
export function surfaceToPlane(
  proj: Projection,
  R: number,
  x: number,
  theta: number,
  placement?: Placement,
): { u: number; v: number } | null {
  const r2 = R * R - x * x;
  if (r2 < 0) return null;
  const r = Math.sqrt(r2);
  let p: Vec = [x, -r * Math.sin(theta), r * Math.cos(theta)];
  if (placement) p = toLocal(p, placement);
  const [px, py, pz] = p;
  if (pz <= 0) return null; // far side of the image centre
  const c = Math.acos(Math.min(1, pz / R));
  const az = Math.atan2(py, px);
  const rho = radial(proj, R, c);
  return { u: rho * Math.cos(az), v: rho * Math.sin(az) };
}

/** Image plane (u, v) in mm -> sphere point (axis position x, rotation theta). Null if not representable. */
export function planeToSurface(
  proj: Projection,
  R: number,
  u: number,
  v: number,
  placement?: Placement,
): { x: number; theta: number } | null {
  const rho = Math.hypot(u, v);
  const c = radialInverse(proj, R, rho);
  if (!Number.isFinite(c) || c >= Math.PI / 2) return null;
  const az = Math.atan2(v, u);
  let p: Vec = [R * Math.sin(c) * Math.cos(az), R * Math.sin(c) * Math.sin(az), R * Math.cos(c)];
  if (placement) p = toWorld(p, placement);
  return { x: p[0], theta: Math.atan2(-p[1], p[2]) };
}
