import { DEFAULT_PARAMS, type WarpParams } from '../core/warp';
import type { Projection } from '../core/projection';
import { canvasToPng, canvasToSvg, download } from './export';
import type { WorkerRequest } from './warp.worker';

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
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.buffer), r.width, r.height), 0, 0);
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
};

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sourceName = f.name.replace(/\.[^.]+$/, '') || 'image';
  const bmp = await createImageBitmap(f);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  source = ctx.getImageData(0, 0, bmp.width, bmp.height);
  run();
});

document.querySelectorAll('.controls input:not(#file), .controls select').forEach((el) =>
  el.addEventListener('input', () => (el.id === 'whiteBg' ? run() : schedule())),
);

dlPng.addEventListener('click', async () => {
  download(await canvasToPng(canvas, currentDpi), `${sourceName}-sphere.png`);
});
dlSvg.addEventListener('click', () => {
  download(canvasToSvg(canvas, sizeMm.w, sizeMm.h), `${sourceName}-sphere.svg`);
});
