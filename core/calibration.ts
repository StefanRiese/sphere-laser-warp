/**
 * Evaluate a test engraving. The calibration pattern contains a square of known size at the image centre
 * (on the equator, facing the beam). After engraving, measure that square along the rotation axis and
 * around the ball.
 *
 * Around the ball the file angle is derived from the diameter entered in the tool, so a measured/target ratio
 * r means the real ball diameter is `ballDiameterMm * r`. Along the axis the lengths are physical, so a ratio
 * other than 1 points at the machine (X scale, focus) and is only reported.
 */
export interface CalibrationInput {
  ballDiameterMm: number;
  /** Designed edge length of the centre square on the ball, in mm. */
  targetMm: number;
  measuredAxisMm: number;
  measuredAroundMm: number;
}

export interface CalibrationResult {
  axisRatio: number;
  aroundRatio: number;
  suggestedBallDiameterMm: number;
}

export function calibrate(i: CalibrationInput): CalibrationResult {
  const axisRatio = i.measuredAxisMm / i.targetMm;
  const aroundRatio = i.measuredAroundMm / i.targetMm;
  return { axisRatio, aroundRatio, suggestedBallDiameterMm: i.ballDiameterMm * aroundRatio };
}
