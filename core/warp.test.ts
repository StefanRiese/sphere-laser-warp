import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type RGBAImage, warp } from './warp';

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
});
