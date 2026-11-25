import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type RGBAImage, transpose, warp } from './warp';

function solid(w: number, h: number, rgba: [number, number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { data, width: w, height: h };
}

describe('warp', () => {
  const base = { ...DEFAULT_PARAMS, dpi: 100 };

  it('produces an output sized from the latitude limit and the image footprint', () => {
    const r = warp(solid(40, 40, [255, 0, 0, 255]), { ...base, imageWidthMm: 20, latitudeLimitDeg: 30 });
    const R = base.ballDiameterMm / 2;
    expect(r.widthMm).toBeCloseTo(2 * R * Math.sin(Math.PI / 6), 0);
    // a 20 mm square image spans roughly 20 mm around the circumference
    expect(r.heightMm).toBeGreaterThan(19);
    expect(r.heightMm).toBeLessThan(25);
    expect(r.clipped).toBe(false);
  });

  it('stretches the image around the ball less than along it near the poles of the axis', () => {
    // At the latitude limit, columns are compressed (1/cos) in the source relative to the output:
    // the image occupies fewer output rows at the edge columns than ... centre rows are widest.
    const r = warp(solid(40, 40, [0, 255, 0, 255]), { ...base, imageWidthMm: 30 });
    const colHeight = (col: number) => {
      let n = 0;
      for (let row = 0; row < r.height; row++) if ((r.data[(row * r.width + col) * 4 + 3] ?? 0) > 0) n++;
      return n;
    };
    const mid = colHeight(Math.floor(r.width / 2));
    const edge = colHeight(Math.floor(r.width * 0.12));
    expect(edge).toBeGreaterThan(mid); // more rotation needed per mm of image width at higher latitude
  });

  it('flags clipping when the image exceeds the latitude limit', () => {
    const r = warp(solid(10, 10, [0, 0, 255, 255]), { ...base, imageWidthMm: 60, latitudeLimitDeg: 20 });
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
    const a = centroid(warp(img, { ...base, imageWidthMm: 10 }));
    const b = warp(img, { ...base, imageWidthMm: 10, offsetAxisMm: 8 });
    expect((centroid(b).x - a.x) * b.mmPerPx).toBeGreaterThan(7);
    expect((centroid(b).x - a.x) * b.mmPerPx).toBeLessThan(9);
  });

  it('offsetRotationDeg moves the image around the ball, even to the back', () => {
    const img = solid(20, 20, [255, 0, 0, 255]);
    const r = warp(img, { ...base, imageWidthMm: 10, offsetRotationDeg: 180 });
    expect(r.height).toBeLessThan(base.ballDiameterMm * Math.PI * 0.4 / r.mmPerPx); // not split at the wrap
    expect(Math.abs(r.theta0 + r.thetaSpan / 2 - Math.PI)).toBeLessThan(0.1);
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
