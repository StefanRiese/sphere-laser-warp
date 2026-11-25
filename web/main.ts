import { DEFAULT_PARAMS, type WarpParams } from '../core/warp';
import type { Projection } from '../core/projection';
import { loadImage } from './loadImage';
import { canvasToPng, canvasToSvg, download } from './export';
import type { WorkerRequest } from './warp.worker';
import type { BallPreview } from './preview3d';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('out');
const info = $('info');
const warn = $('warn');
const dlPng = $<HTMLButtonElement>('dlPng');
const dlSvg = $<HTMLButtonElement>('dlSvg');

const worker = new Worker(new URL('./warp.worker.ts', import.meta.url), { type: 'module' });
let source: ImageData | null = null;
let sourceName = 'image';
let reqId = 0;
let sizeMm = { w: 0, h: 0 };
let currentDpi = DEFAULT_PARAMS.dpi;
const rawCanvas = document.createElement('canvas'); // warped result without background, for the 3D texture
let preview: BallPreview | null = null;
let previewLoading: Promise<BallPreview | null> | null = null;

function getPreview(): Promise<BallPreview | null> {
  if (preview) return Promise.resolve(preview);
  previewLoading ??= import('./preview3d')
    .then((m) => {
      preview = new m.BallPreview($('ball3d'));
      preview.setBallColor($<HTMLInputElement>('ballColor').value);
      preview.setLimitVisible($<HTMLInputElement>('showLimit').checked);
      return preview;
    })
    .catch(() => {
      $('ball3d').textContent = '3D preview needs WebGL, which is not available in this browser.';
      return null;
    });
  return previewLoading;
}

function num(id: string, fallback: number): number {
  const v = parseFloat($<HTMLInputElement>(id).value);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function readParams(): WarpParams {
  return {
    ballDiameterMm: num('ballDiameterMm', DEFAULT_PARAMS.ballDiameterMm),
    imageWidthMm: num('imageWidthMm', DEFAULT_PARAMS.imageWidthMm),
    projection: $<HTMLSelectElement>('projection').value as Projection,
    latitudeLimitDeg: Math.min(80, num('latitudeLimitDeg', DEFAULT_PARAMS.latitudeLimitDeg)),
    dpi: num('dpi', DEFAULT_PARAMS.dpi),
    mirror: $<HTMLInputElement>('mirror').checked,
    flipRotation: $<HTMLInputElement>('flipRotation').checked,
  };
}

let timer = 0;
function schedule(): void {
  clearTimeout(timer);
  timer = window.setTimeout(run, 150);
}

function run(): void {
  if (!source) return;
  const params = readParams();
  currentDpi = params.dpi;
  const id = ++reqId;
  const copy = source.data.slice().buffer;
  const msg: WorkerRequest = { id, width: source.width, height: source.height, buffer: copy, params };
  info.textContent = 'Computing...';
  worker.postMessage(msg, [copy]);
}

worker.onmessage = (e: MessageEvent) => {
  const r = e.data;
  if (r.id !== reqId) return; // stale result
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext('2d')!;
  rawCanvas.width = r.width;
  rawCanvas.height = r.height;
  rawCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.buffer), r.width, r.height), 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.drawImage(rawCanvas, 0, 0);
  if ($<HTMLInputElement>('whiteBg').checked) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  sizeMm = { w: r.widthMm, h: r.heightMm };
  info.textContent = `${r.width} x ${r.height} px = ${r.widthMm.toFixed(1)} x ${r.heightMm.toFixed(1)} mm (axis x circumference)`;
  warn.hidden = !r.clipped;
  warn.textContent = r.clipped
    ? 'The image extends beyond the latitude limit or the visible side of the ball and was cut off. Reduce the image width or raise the limit.'
    : '';
  dlPng.disabled = dlSvg.disabled = false;

  const p = readParams();
  void getPreview().then((pv) =>
    pv?.update(
      { R: p.ballDiameterMm / 2, xMax: r.widthMm / 2, theta0: r.theta0, thetaSpan: r.thetaSpan, latitudeLimitDeg: p.latitudeLimitDeg },
      rawCanvas,
    ),
  );
};

$<HTMLInputElement>('showLimit').addEventListener('input', (e) => preview?.setLimitVisible((e.target as HTMLInputElement).checked));
$<HTMLInputElement>('ballColor').addEventListener('input', (e) => preview?.setBallColor((e.target as HTMLInputElement).value));

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sourceName = f.name.replace(/\.[^.]+$/, '') || 'image';
  try {
    const p = readParams();
    // pixels needed along the longest image side at the chosen dpi (for SVG rasterisation)
    const needed = (p.imageWidthMm / 25.4) * p.dpi * 1.5;
    source = await loadImage(f, needed);
    run();
  } catch (err) {
    warn.hidden = false;
    warn.textContent = err instanceof Error ? err.message : 'Could not load the file';
  }
});

document.querySelectorAll('.controls input:not(#file):not(#ballColor):not(#showLimit), .controls select').forEach((el) =>
  el.addEventListener('input', () => (el.id === 'whiteBg' ? run() : schedule())),
);

dlPng.addEventListener('click', async () => {
  download(await canvasToPng(canvas, currentDpi), `${sourceName}-sphere.png`);
});
dlSvg.addEventListener('click', () => {
  download(canvasToSvg(canvas, sizeMm.w, sizeMm.h), `${sourceName}-sphere.svg`);
});
