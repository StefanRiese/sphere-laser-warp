/**
 * Calibration test pattern, designed for an image width of 40 mm on the ball (1 mm = 40 px):
 * 5 mm grid, a 10 x 10 mm square and circles at the centre, 5 x 5 mm squares in the corners and diagonals.
 * After the warp every square must stay square and every circle round. Measure the centre square.
 */
export const CALIBRATION_WIDTH_MM = 40;
export const CALIBRATION_SQUARE_MM = 10;

const PX_PER_MM = 40;
const W_MM = 40;
const H_MM = 30;

export function makeCalibrationPattern(): ImageData {
  const W = W_MM * PX_PER_MM;
  const H = H_MM * PX_PER_MM;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  const mm = (v: number) => v * PX_PER_MM;

  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000';
  g.fillStyle = '#000';
  g.lineCap = 'butt';

  // 5 mm grid, thin lines
  g.lineWidth = mm(0.2);
  for (let x = 0; x <= W_MM; x += 5) {
    g.beginPath();
    g.moveTo(mm(x), 0);
    g.lineTo(mm(x), H);
    g.stroke();
  }
  for (let y = 0; y <= H_MM; y += 5) {
    g.beginPath();
    g.moveTo(0, mm(y));
    g.lineTo(W, mm(y));
    g.stroke();
  }

  // diagonals
  g.lineWidth = mm(0.2);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, H);
  g.moveTo(W, 0);
  g.lineTo(0, H);
  g.stroke();

  // centre: clear a 10 mm square, draw its outline thick, circles inside and around
  const cx = W_MM / 2;
  const cy = H_MM / 2;
  const half = CALIBRATION_SQUARE_MM / 2;
  g.fillStyle = '#fff';
  g.fillRect(mm(cx - half), mm(cy - half), mm(CALIBRATION_SQUARE_MM), mm(CALIBRATION_SQUARE_MM));
  g.lineWidth = mm(0.5);
  g.strokeRect(mm(cx - half), mm(cy - half), mm(CALIBRATION_SQUARE_MM), mm(CALIBRATION_SQUARE_MM));
  g.lineWidth = mm(0.3);
  for (const d of [10, 5]) {
    g.beginPath();
    g.arc(mm(cx), mm(cy), mm(d / 2), 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(mm(cx), mm(cy), mm(14), 0, Math.PI * 2); // 28 mm circle
  g.stroke();

  // corner squares, 5 x 5 mm, solid: they show the distortion at the far ends of the image
  g.fillStyle = '#000';
  for (const [x, y] of [[0, 0], [W_MM - 5, 0], [0, H_MM - 5], [W_MM - 5, H_MM - 5]] as const) {
    g.fillRect(mm(x), mm(y), mm(5), mm(5));
  }

  // 1 mm ruler ticks along the centre lines
  g.lineWidth = mm(0.2);
  for (let i = -15; i <= 15; i++) {
    const len = i % 5 === 0 ? 1.5 : 0.8;
    g.beginPath();
    g.moveTo(mm(cx + i), mm(cy + half));
    g.lineTo(mm(cx + i), mm(cy + half + len));
    g.stroke();
  }
  for (let i = -10; i <= 10; i++) {
    const len = i % 5 === 0 ? 1.5 : 0.8;
    g.beginPath();
    g.moveTo(mm(cx + half), mm(cy + i));
    g.lineTo(mm(cx + half + len), mm(cy + i));
    g.stroke();
  }

  g.fillStyle = '#000';
  g.font = `bold ${mm(2.2)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillRect(mm(cx - 9), mm(2.6), mm(18), mm(3));
  g.fillStyle = '#000';
  g.fillText('CALIBRATION 40 mm', mm(cx), mm(4.1));
  return g.getImageData(0, 0, W, H);
}
