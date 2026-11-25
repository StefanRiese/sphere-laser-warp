import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type RGBAImage, transpose, warp } from './warp';

function solid(w: number, h: number, rgba: [number, number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { data, width: w, height: h };
}

describe('warp', () => {
  const base = { ...DEFAULT_PARAMS, dpi: 100 };

  it('crops the output to the image footprint, no padding', () => {
    const r = warp(solid(40, 40, [255, 0, 0, 255]), { ...base, imageWidthMm: 20 });
    // a 20 mm wide image spans about 20 mm along the axis (slightly less: x = R sin(c))
    expect(r.widthMm).toBeGreaterThan(19);
    expect(r.widthMm).toBeLessThan(21);
    // every output row and column contains image data
    const alphaAt = (x: number, y: number) => r.data[(y * r.width + x) * 4 + 3] ?? 0;
    const anyIn = (xs: number[], ys: number[]) => xs.some((x) => ys.some((y) => alphaAt(x, y) > 0));
    const allY = Array.from({ length: r.height }, (_, i) => i);
    const allX = Array.from({ length: r.width }, (_, i) => i);
    expect(anyIn([0], allY)).toBe(true);
    expect(anyIn([r.width - 1], allY)).toBe(true);
    expect(anyIn(allX, [0])).toBe(true);
    expect(anyIn(allX, [r.height - 1])).toBe(true);
    // a 20 mm square image spans roughly 20 mm around the circumference
    expect(r.heightMm).toBeGreaterThan(19);
    expect(r.heightMm).toBeLessThan(25);
    expect(r.clipped).toBe(false);
  });

  it('stretches the image around the ball less than along it near the poles of the axis', () => {
    // Away from the centre of the axis the circles of latitude are shorter, so more rotation is needed.
    const r = warp(solid(40, 40, [0, 255, 0, 255]), { ...base, imageWidthMm: 30 });
    const colHeight = (col: number) => {
      let n = 0;
      for (let row = 0; row < r.height; row++) if ((r.data[(row * r.width + col) * 4 + 3] ?? 0) > 0) n++;
      return n;
    };
    const mid = colHeight(Math.floor(r.width / 2));
    const edge = colHeight(Math.floor(r.width * 0.08));
    expect(edge).toBeGreaterThan(mid); // more rotation needed per mm of image width at higher latitude
  });

  it('flags clipping when the image does not fit on the visible side of the ball', () => {
    const r = warp(solid(10, 10, [0, 0, 255, 255]), { ...base, imageWidthMm: 200 });
    expect(r.clipped).toBe(true);
  });

  it('mirror flips the image around the axis', () => {
    const img = solid(2, 1, [0, 0, 0, 255]);
    img.data.set([255, 0, 0, 255], 0); // left red, right black
    const a = warp(img, { ...base, imageWidthMm: 20, mirror: false });
    const b = warp(img, { ...base, imageWidthMm: 20, mirror: true });
    const px = (r: typeof a, col: number) => r.data[(Math.floor(r.height / 2) * r.width + col) * 4]!;
    const left = Math.floor(a.width / 2) - 3, right = Math.floor(a.width / 2) + 3;
    expect(px(a, left)).toBeGreaterThan(px(a, right));
    expect(px(b, left)).toBeLessThan(px(b, right));
  });

  it('reports the rotation range covered by the output rows', () => {
    const r = warp(solid(40, 40, [255, 0, 0, 255]), { ...base, imageWidthMm: 20 });
    expect(r.theta0 + r.thetaSpan / 2).toBeCloseTo(0, 1); // centred on the view direction
    const r2 = warp(solid(40, 40, [255, 0, 0, 255]), { ...base, imageWidthMm: 20, flipRotation: true });
    expect(Math.sign(r2.thetaSpan)).toBe(-Math.sign(r.thetaSpan));
  });

  const centroid = (r: ReturnType<typeof warp>) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        if ((r.data[(y * r.width + x) * 4 + 3] ?? 0) > 0) { sx += x; sy += y; n++; }
      }
    }
    return { x: sx / n, y: sy / n, n };
  };

  it('offsetAxisMm moves the image along the rotation axis', () => {
    const img = solid(20, 20, [255, 0, 0, 255]);
    const ra = warp(img, { ...base, imageWidthMm: 10 });
    const rb = warp(img, { ...base, imageWidthMm: 10, offsetAxisMm: 8 });
    // output is cropped, so compare absolute axis positions: xStart + centroid
    const posA = ra.xStart + centroid(ra).x * ra.mmPerPx;
    const posB = rb.xStart + centroid(rb).x * rb.mmPerPx;
    expect(posA).toBeCloseTo(0, 0);
    expect(posB - posA).toBeGreaterThan(7);
    expect(posB - posA).toBeLessThan(9);
  });

  it('axisAngleDeg 90 makes the image height run along the axis', () => {
    const img = solid(40, 10, [0, 0, 255, 255]); // wide image
    const flat = warp(img, { ...base, imageWidthMm: 30 });
    const rot = warp(img, { ...base, imageWidthMm: 30, axisAngleDeg: 90 });
    // wide along the axis at 0 deg, wide around the ball at 90 deg
    expect(centroid(flat).n).toBeGreaterThan(0);
    expect(flat.width / flat.height).toBeGreaterThan(rot.width / rot.height);
  });

  it('transpose swaps width and height and keeps pixels', () => {
    const img = solid(3, 2, [1, 2, 3, 255]);
    img.data.set([9, 9, 9, 255], 0);
    const t = transpose(img);
    expect([t.width, t.height]).toEqual([2, 3]);
    expect(t.data[0]).toBe(9);
    expect(t.data[(1 * 2 + 0) * 4]).toBe(1);
  });
});
