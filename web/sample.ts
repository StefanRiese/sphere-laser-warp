/** A built-in test image (grid, circles, face) so the effect of the warp is visible without uploading anything. */
export function makeSample(): ImageData {
  const W = 1000;
  const H = 700;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);

  g.strokeStyle = '#1b1b1f';
  g.lineWidth = 3;
  for (let x = 0; x <= W; x += 100) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = 0; y <= H; y += 100) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }

  g.lineWidth = 6;
  for (const r of [80, 160, 240]) {
    g.beginPath();
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    g.stroke();
  }

  // face in the centre: a circle must stay a circle on the ball
  g.fillStyle = '#e0a800';
  g.beginPath();
  g.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1b1f';
  g.beginPath();
  g.arc(W / 2 - 25, H / 2 - 18, 9, 0, Math.PI * 2);
  g.arc(W / 2 + 25, H / 2 - 18, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W / 2, H / 2 + 5, 35, 0.2, Math.PI - 0.2);
  g.stroke();

  g.font = 'bold 56px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#c0392b';
  g.fillText('SAMPLE', W / 2, 90);
  g.fillText('SAMPLE', W / 2, H - 50);

  g.lineWidth = 10;
  g.strokeStyle = '#2f80ed';
  g.strokeRect(5, 5, W - 10, H - 10);
  return g.getImageData(0, 0, W, H);
}
