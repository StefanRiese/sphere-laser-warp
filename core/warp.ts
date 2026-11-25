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
  /** Output resolution in pixels per inch. */
  dpi: number;
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
  /** True if part of the image could not be placed on the ball (beyond the hemisphere around the image centre). */
  clipped: boolean;
  /** Rotation angle (rad) at the top edge of the output and the signed angle covered by its full height. */
  theta0: number;
  thetaSpan: number;
  /** Axis position (mm from the ball centre) of the output's left edge. */
  xStart: number;
}

export const DEFAULT_PARAMS: WarpParams = {
  ballDiameterMm: 70,
  imageWidthMm: 40,
  projection: 'equidistant',
  dpi: 254,
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

/**
 * Extent of the image footprint along the rotation axis (mm), from its border. `clipped` is true if part of
 * the border cannot be placed on the ball (it would lie beyond the hemisphere around the image centre).
 */
function footprint(
  proj: Projection, R: number, w: number, h: number, alpha: number, pl: Placement,
): { xa: number; xb: number; clipped: boolean } | null {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const N = 128;
  let xa = Infinity;
  let xb = -Infinity;
  let clipped = false;
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
      if (!s) {
        clipped = true;
        continue;
      }
      xa = Math.min(xa, s.x);
      xb = Math.max(xb, s.x);
    }
  }
  return xa <= xb ? { xa, xb, clipped } : null;
}

/**
 * Pre-warp a flat image for engraving on a ball in a chuck-driven rotary.
 *
 * Output layout: columns = position along the rotation axis, rows = rotation angle
 * (i.e. the image height equals the circumference slice, which is how XCS / LightBurn
 * rotary mode expects it). Row 0 is the edge with the smallest theta. The output is cropped
 * to the area the image actually covers; it is never padded.
 */
export function warp(src: RGBAImage, p: WarpParams): WarpResult {
  const R = p.ballDiameterMm / 2;
  const mmPerPx = 25.4 / p.dpi;
  const fullRows = Math.max(1, Math.round((2 * Math.PI * R) / mmPerPx));

  const imgW = p.imageWidthMm;
  const imgH = (p.imageWidthMm * src.height) / src.width;
  const alpha = (p.axisAngleDeg * Math.PI) / 180;
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const pl: Placement = {
    phi: Math.asin(Math.max(-1, Math.min(1, p.offsetAxisMm / R))),
    theta: 0,
  };

  const empty: WarpResult = {
    data: new Uint8ClampedArray(4), width: 1, height: 1, mmPerPx, widthMm: mmPerPx, heightMm: mmPerPx,
    clipped: true, theta0: 0, thetaSpan: 0, xStart: 0,
  };
  const fp = footprint(p.projection, R, imgW, imgH, alpha, pl);
  if (!fp) return empty;

  // the window along the axis is exactly the image footprint, nothing more
  const xa = Math.max(-R, fp.xa);
  const xb = Math.min(R, fp.xb);
  const width = Math.max(1, Math.ceil((xb - xa) / mmPerPx));

  const rowHasData = new Uint8Array(fullRows);
  const colHasData = new Uint8Array(width);
  const full = new Uint8ClampedArray(width * fullRows * 4);

  for (let row = 0; row < fullRows; row++) {
    const theta = pl.theta + (((row + 0.5) / fullRows) * 2 * Math.PI - Math.PI);
    for (let col = 0; col < width; col++) {
      const x = xa + (col + 0.5) * mmPerPx;
      const q = surfaceToPlane(p.projection, R, x, theta, pl);
      if (!q) continue;
      // rotate so the chosen image direction runs along the axis
      const ui = q.u * ca - q.v * sa;
      const vi = q.u * sa + q.v * ca;
      const fx = (ui / imgW + 0.5) * src.width;
      const fy = (0.5 - vi / imgH) * src.height;
      if (fx < 0 || fy < 0 || fx > src.width || fy > src.height) continue;
      const o = (row * width + col) * 4;
      sampleBilinear(src, fx, fy, full, o);
      if ((full[o + 3] ?? 0) > 0) {
        rowHasData[row] = 1;
        colHasData[col] = 1;
      }
    }
  }

  const range = (flags: Uint8Array): [number, number] => {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) {
        if (lo < 0) lo = i;
        hi = i;
      }
    }
    return [lo, hi];
  };
  const [r0, r1] = range(rowHasData);
  const [c0, c1] = range(colHasData);
  if (r0 < 0 || c0 < 0) return empty;

  const outW = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  const data = new Uint8ClampedArray(outW * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((r0 + row) * width + c0) * 4;
    data.set(full.subarray(from, from + outW * 4), row * outW * 4);
  }
  const dTheta = (2 * Math.PI) / fullRows;
  const theta0 = pl.theta + ((r0 / fullRows) * 2 * Math.PI - Math.PI);
  return {
    data, width: outW, height, mmPerPx, widthMm: outW * mmPerPx, heightMm: height * mmPerPx, clipped: fp.clipped,
    theta0, thetaSpan: dTheta * height, xStart: xa + c0 * mmPerPx,
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
