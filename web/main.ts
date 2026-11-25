import { DEFAULT_PARAMS, type WarpParams, transpose } from '../core/warp';
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

/** Like num() but accepts zero and negative values. */
function numAny(id: string, fallback: number): number {
  const v = parseFloat($<HTMLInputElement>(id).value);
  return Number.isFinite(v) ? v : fallback;
}

/** Image width on the ball in mm, derived from the width or height the user entered. */
function imageWidthMm(): number {
  const v = num('imageSizeMm', DEFAULT_PARAMS.imageWidthMm);
  if ($<HTMLSelectElement>('sizeBy').value === 'width' || !source) return v;
  return (v * source.width) / source.height;
}

function readParams(): WarpParams {
  return {
    ballDiameterMm: num('ballDiameterMm', DEFAULT_PARAMS.ballDiameterMm),
    imageWidthMm: imageWidthMm(),
    projection: $<HTMLSelectElement>('projection').value as Projection,
    latitudeLimitDeg: Math.min(80, num('latitudeLimitDeg', DEFAULT_PARAMS.latitudeLimitDeg)),
    dpi: num('dpi', DEFAULT_PARAMS.dpi),
    mirror: $<HTMLInputElement>('mirror').checked,
    flipRotation: $<HTMLInputElement>('flipRotation').checked,
    axisAngleDeg: numAny('axisAngleDeg', 0),
    offsetAxisMm: numAny('offsetAxisMm', 0),
    offsetRotationDeg: numAny('offsetRotationDeg', 0),
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
  // rawCanvas keeps the canonical layout (columns = axis, rows = rotation); the 3D preview needs that
  rawCanvas.width = r.width;
  rawCanvas.height = r.height;
  const raw = new ImageData(new Uint8ClampedArray(r.buffer), r.width, r.height);
  rawCanvas.getContext('2d')!.putImageData(raw, 0, 0);

  // the exported/displayed file may have the rotation along the image width instead
  const cols = $<HTMLSelectElement>('orientation').value === 'cols';
  const shown = cols ? transpose(raw) : raw;
  canvas.width = shown.width;
  canvas.height = shown.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, shown.width, shown.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(shown.data), shown.width, shown.height), 0, 0);
  if ($<HTMLInputElement>('whiteBg').checked) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, shown.width, shown.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  sizeMm = cols ? { w: r.heightMm, h: r.widthMm } : { w: r.widthMm, h: r.heightMm };
  const imgW = readParams().imageWidthMm;
  const imgH = source ? (imgW * source.height) / source.width : imgW;
  info.textContent =
    `Image on ball: ${imgW.toFixed(1)} x ${imgH.toFixed(1)} mm. ` +
    `File: ${shown.width} x ${shown.height} px = ${sizeMm.w.toFixed(1)} x ${sizeMm.h.toFixed(1)} mm ` +
    (cols ? '(circumference x axis)' : '(axis x circumference)');
  warn.hidden = !r.clipped;
  warn.textContent = r.clipped
    ? 'The image extends beyond the latitude limit or the visible side of the ball and was cut off. Reduce the image size, move it, or raise the limit.'
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
    const needed = (Math.max(p.imageWidthMm, p.imageWidthMm * (source ? source.height / source.width : 1)) / 25.4) * p.dpi * 1.5;
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

const sizeBy = $<HTMLSelectElement>('sizeBy');
sizeBy.addEventListener('change', () => {
  const input = $<HTMLInputElement>('imageSizeMm');
  // keep the image the same physical size when switching what is being defined
  if (source) {
    const w = imageWidthMmFor(sizeBy.value === 'height' ? 'width' : 'height', input);
    const h = (w * source.height) / source.width;
    input.value = String(Math.round((sizeBy.value === 'width' ? w : h) * 100) / 100);
  }
  $('sizeLabel').textContent = sizeBy.value === 'width' ? 'Image width on ball (mm)' : 'Image height on ball (mm)';
});

function imageWidthMmFor(prevMode: 'width' | 'height', input: HTMLInputElement): number {
  const v = parseFloat(input.value) || DEFAULT_PARAMS.imageWidthMm;
  return prevMode === 'width' || !source ? v : (v * source.width) / source.height;
}
