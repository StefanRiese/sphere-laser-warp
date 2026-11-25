import { type Placement, type Projection, planeToSurface, surfaceToPlane } from './projection';

export interface RGBAImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface WarpParams {
  /** Ball diameter in mm (equator). */
  ballDiameterMm: number;
  /** Width of the image as it should appear on the ball surface, in mm. Height follows the aspect ratio. */
  imageWidthMm: number;
  projection: Projection;
  /** Maximum latitude (deg) from the equator along the rotation axis; columns beyond it are not produced. */
  latitudeLimitDeg: number;
  /** Output resolution in pixels per inch. */
  dpi: number;
  /** Mirror the image (e.g. engraving the inside of a bauble). */
  mirror: boolean;
  /** Reverse the rotation direction. */
  flipRotation: boolean;
  /** Which image direction runs along the rotation axis, in degrees counter-clockwise from horizontal. */
  axisAngleDeg: number;
  /** Shift of the image centre along the rotation axis in mm (from the ball's centre plane). */
  offsetAxisMm: number;
}

export interface WarpResult extends RGBAImage {
  mmPerPx: number;
  /** Physical size of the output in mm: width along the rotation axis, height around the circumference. */
  widthMm: number;
  heightMm: number;
  /** True if the image extends beyond the latitude limit or the visible hemisphere and was cut off. */
  clipped: boolean;
  /** Rotation angle (rad) at the top edge of the output and the signed angle covered by its full height. */
  theta0: number;
  thetaSpan: number;
}

export const DEFAULT_PARAMS: WarpParams = {
  ballDiameterMm: 70,
  imageWidthMm: 40,
  projection: 'equidistant',
  latitudeLimitDeg: 30,
  dpi: 254,
  mirror: false,
  flipRotation: false,
  axisAngleDeg: 0,
  offsetAxisMm: 0,
};

function sampleBilinear(src: RGBAImage, fx: number, fy: number, out: Uint8ClampedArray, o: number): void {
  const { width: w, height: h, data } = src;
  const x0 = Math.floor(fx - 0.5);
  const y0 = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - x0;
  const ty = fy - 0.5 - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const xi = Math.min(w - 1, Math.max(0, x0 + i));
      const yi = Math.min(h - 1, Math.max(0, y0 + j));
      const wgt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
      const p = (yi * w + xi) * 4;
      const al = (data[p + 3] ?? 0) / 255;
      // premultiplied accumulation avoids dark fringes at transparent edges
      r += (data[p] ?? 0) * al * wgt;
      g += (data[p + 1] ?? 0) * al * wgt;
      b += (data[p + 2] ?? 0) * al * wgt;
      a += al * wgt;
    }
  }
  if (a > 0) {
    out[o] = r / a;
    out[o + 1] = g / a;
    out[o + 2] = b / a;
    out[o + 3] = a * 255;
  }
}

/** True if the image border leaves the visible hemisphere or the latitude limit (|x| > xMax). */
function footprintClipped(
  proj: Projection, R: number, w: number, h: number, xMax: number, alpha: number, pl: Placement,
): boolean {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pts: Array<[number, number]> = [
      [(t - 0.5) * w, -h / 2],
      [(t - 0.5) * w, h / 2],
      [-w / 2, (t - 0.5) * h],
      [w / 2, (t - 0.5) * h],
    ];
    for (const [ui, vi] of pts) {
      // image coordinates -> sphere plane (inverse of the axis rotation)
      const s = planeToSurface(proj, R, ui * ca + vi * sa, -ui * sa + vi * ca, pl);
      if (!s || Math.abs(s.x) > xMax) return true;
    }
  }
  return false;
}

/**
 * Pre-warp a flat image for engraving on a ball in a chuck-driven rotary.
 *
 * Output layout: columns = position along the rotation axis, rows = rotation angle
 * (i.e. the image height equals the circumference slice, which is how XCS / LightBurn
 * rotary mode expects it). Row 0 is the edge with the smallest theta.
 */
export function warp(src: RGBAImage, p: WarpParams): WarpResult {
  const R = p.ballDiameterMm / 2;
  const mmPerPx = 25.4 / p.dpi;
  const xMax = R * Math.sin((p.latitudeLimitDeg * Math.PI) / 180);
  const width = Math.max(1, Math.round((2 * xMax) / mmPerPx));
  const fullRows = Math.max(1, Math.round((2 * Math.PI * R) / mmPerPx));

  const imgW = p.imageWidthMm;
  const imgH = (p.imageWidthMm * src.height) / src.width;
  const sgn = p.flipRotation ? -1 : 1;
  const alpha = (p.axisAngleDeg * Math.PI) / 180;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const pl: Placement = {
    phi: Math.asin(Math.max(-1, Math.min(1, p.offsetAxisMm / R))),
    theta: 0,
  };

  // Pass 1: find which rows (rotation angles) contain any part of the image, so we only emit those.
  const rowHasData = new Uint8Array(fullRows);
  const full = new Uint8ClampedArray(width * fullRows * 4);

  for (let row = 0; row < fullRows; row++) {
    const theta = pl.theta + sgn * (((row + 0.5) / fullRows) * 2 * Math.PI - Math.PI);
    for (let col = 0; col < width; col++) {
      const x = ((col + 0.5) / width) * 2 * xMax - xMax;
      const q = surfaceToPlane(p.projection, R, x, theta, pl);
      if (!q) continue;
      // rotate so the chosen image direction runs along the axis, then optionally mirror
      const ui = q.u * ca - q.v * sa;
      const vi = q.u * sa + q.v * ca;
      const u = p.mirror ? -ui : ui;
      const fx = (u / imgW + 0.5) * src.width;
      const fy = (0.5 - vi / imgH) * src.height;
      if (fx < 0 || fy < 0 || fx > src.width || fy > src.height) continue;
      const o = (row * width + col) * 4;
      sampleBilinear(src, fx, fy, full, o);
      if ((full[o + 3] ?? 0) > 0) rowHasData[row] = 1;
    }
  }

  let first = -1;
  let last = -1;
  for (let row = 0; row < fullRows; row++) {
    if (rowHasData[row]) {
      if (first < 0) first = row;
      last = row;
    }
  }
  if (first < 0) {
    return { data: new Uint8ClampedArray(4), width: 1, height: 1, mmPerPx, widthMm: mmPerPx, heightMm: mmPerPx, clipped: true, theta0: 0, thetaSpan: 0 };
  }

  const clipped = footprintClipped(p.projection, R, imgW, imgH, xMax, alpha, pl);

  const height = last - first + 1;
  const data = full.slice(first * width * 4, (last + 1) * width * 4);
  const dTheta = sgn * ((2 * Math.PI) / fullRows);
  const theta0 = pl.theta + sgn * ((first / fullRows) * 2 * Math.PI - Math.PI);
  return {
    data, width, height, mmPerPx, widthMm: width * mmPerPx, heightMm: height * mmPerPx, clipped,
    theta0, thetaSpan: dTheta * height,
  };
}

/** Swap rows and columns (used for the export orientation where the rotation runs along the image width). */
export function transpose(img: RGBAImage): RGBAImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (x * h + y) * 4;
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      out[d + 3] = data[s + 3]!;
    }
  }
  return { data: out, width: h, height: w };
}
