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

/** Sphere point (axis position x mm, rotation theta rad) -> image plane (u, v) in mm. Null on the far side. */
export function surfaceToPlane(
  proj: Projection,
  R: number,
  x: number,
  theta: number,
): { u: number; v: number } | null {
  const r2 = R * R - x * x;
  if (r2 < 0) return null;
  const r = Math.sqrt(r2);
  const py = -r * Math.sin(theta);
  const pz = r * Math.cos(theta);
  if (pz <= 0) return null; // far side of the ball
  const c = Math.acos(Math.min(1, pz / R));
  const az = Math.atan2(py, x);
  const rho = radial(proj, R, c);
  return { u: rho * Math.cos(az), v: rho * Math.sin(az) };
}

/** Image plane (u, v) in mm -> sphere point (axis position x, rotation theta). Null if not representable. */
export function planeToSurface(
  proj: Projection,
  R: number,
  u: number,
  v: number,
): { x: number; theta: number } | null {
  const rho = Math.hypot(u, v);
  const c = radialInverse(proj, R, rho);
  if (!Number.isFinite(c) || c >= Math.PI / 2) return null;
  const az = Math.atan2(v, u);
  const x = R * Math.sin(c) * Math.cos(az);
  const py = R * Math.sin(c) * Math.sin(az);
  const pz = R * Math.cos(c);
  return { x, theta: Math.atan2(-py, pz) };
}
