import { describe, expect, it } from 'vitest';
import { calibrate } from './calibration';

describe('calibrate', () => {
  it('reports no correction for a perfect engraving', () => {
    const r = calibrate({ ballDiameterMm: 70, targetMm: 10, measuredAxisMm: 10, measuredAroundMm: 10 });
    expect(r.axisRatio).toBe(1);
    expect(r.suggestedBallDiameterMm).toBe(70);
  });

  it('a square that is too long around the ball means the real ball is bigger', () => {
    const r = calibrate({ ballDiameterMm: 70, targetMm: 10, measuredAxisMm: 10, measuredAroundMm: 10.5 });
    expect(r.aroundRatio).toBeCloseTo(1.05, 9);
    expect(r.suggestedBallDiameterMm).toBeCloseTo(73.5, 9);
  });
});
