import { DEFAULT_PARAMS, type WarpParams, transpose } from '../core/warp';
import type { Projection } from '../core/projection';
import { presets, type PresetParams } from './presets';
import { makeSample } from './sample';
import { loadImage } from './loadImage';
import { warpSvgToVector } from './vectorWarp';
import { canvasToPng, canvasToSvg, download } from './export';
import type { WorkerRequest } from './warp.worker';
import type { BallPreview } from './preview3d';
import { applyStatic, fmt, getLang, onLangChange, setLang, t } from './i18n';
import type { Lang } from './strings';
import { effectiveTheme, setTheme } from './theme';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('out');
const info = $('info');
const warn = $('warn');
const dlPng = $<HTMLButtonElement>('dlPng');
const dlSvg = $<HTMLButtonElement>('dlSvg');

const worker = new Worker(new URL('./warp.worker.ts', import.meta.url), { type: 'module' });
let source: ImageData | null = null;
let sourceName = 'image';
let sourceSvg: string | null = null; // text of the loaded SVG, for the vector export
let reqId = 0;
let sizeMm = { w: 0, h: 0 };
let currentDpi = DEFAULT_PARAMS.dpi;
const rawCanvas = document.createElement('canvas'); // warped result without background, for the 3D texture
const rotCanvas = document.createElement('canvas'); // srcCanvas turned by the axis angle, for the "without warp" view
const srcCanvas = document.createElement('canvas'); // the original image, for the "without warp" 3D view
let preview: BallPreview | null = null;
let previewLoading: Promise<BallPreview | null> | null = null;

function getPreview(): Promise<BallPreview | null> {
  if (preview) return Promise.resolve(preview);
  previewLoading ??= import('./preview3d')
    .then((m) => {
      preview = new m.BallPreview($('ball3d'));
      preview.setLabels(axisLabels());
      preview.setBallColor($<HTMLInputElement>('ballColor').value);
      preview.setAxisVisible($<HTMLInputElement>('showAxis').checked);
      preview.setMode($<HTMLSelectElement>('previewMode').value as 'warp' | 'naive');
      return preview;
    })
    .catch(() => {
      $('ball3d').textContent = t('webgl');
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
    dpi: num('dpi', DEFAULT_PARAMS.dpi),
    axisAngleDeg: numAny('axisAngleDeg', 0),
    offsetAxisMm: numAny('offsetAxisMm', 0),
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
  info.textContent = t('computing');
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
  const Rb = readParams().ballDiameterMm / 2;
  const maxLat = (Math.asin(Math.min(1, Math.max(Math.abs(r.xStart), Math.abs(r.xStart + r.widthMm)) / Rb)) * 180) / Math.PI;
  info.textContent =
    t('infoImage', { w: fmt(imgW), h: fmt(imgH), lat: fmt(maxLat, 0) }) + ' ' +
    t('infoFile', { pw: shown.width, ph: shown.height, mw: fmt(sizeMm.w), mh: fmt(sizeMm.h) }) + ' ' +
    t(cols ? 'unitsCircAxis' : 'unitsAxisCirc');
  updateFileHint();
  warn.hidden = !r.clipped;
  warn.textContent = r.clipped ? t('clipped') : '';
  dlPng.disabled = dlSvg.disabled = false;

  const p = readParams();
  void getPreview().then((pv) =>
    pv?.update(
      { R: p.ballDiameterMm / 2, xStart: r.xStart, widthMm: r.widthMm, theta0: r.theta0, thetaSpan: r.thetaSpan },
      rawCanvas,
      source
        ? {
            ...rotatedSource(p.axisAngleDeg, imgW, imgH),
            offsetAxisMm: p.offsetAxisMm,
          }
        : null,
    ),
  );
};

$<HTMLInputElement>('showAxis').addEventListener('input', (e) => preview?.setAxisVisible((e.target as HTMLInputElement).checked));
$<HTMLInputElement>('ballColor').addEventListener('input', (e) => preview?.setBallColor((e.target as HTMLInputElement).value));

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sourceName = f.name.replace(/\.[^.]+$/, '') || 'image';
  try {
    const p = readParams();
    // pixels needed along the longest image side at the chosen dpi (for SVG rasterisation)
    const needed = (Math.max(p.imageWidthMm, p.imageWidthMm * (source ? source.height / source.width : 1)) / 25.4) * p.dpi * 1.5;
    setSource(await loadImage(f, needed));
    sourceSvg = /\.svgz?$/i.test(f.name) || f.type === 'image/svg+xml' ? await f.text() : null;
    $<HTMLButtonElement>('dlVector').disabled = sourceSvg === null;
    run();
  } catch (err) {
    warn.hidden = false;
    warn.textContent = err instanceof Error ? t(err.message) : t('errLoad');
  }
});

document.querySelectorAll('.controls input:not(#file):not(#ballColor):not(#showAxis):not(#measAxis):not(#measAround), .controls select').forEach((el) =>
  el.addEventListener('input', () => (el.id === 'whiteBg' ? run() : schedule())),
);

dlPng.addEventListener('click', async () => {
  download(await canvasToPng(canvas, currentDpi), `${sourceName}-sphere.png`);
});
dlSvg.addEventListener('click', () => {
  download(canvasToSvg(canvas, sizeMm.w, sizeMm.h), `${sourceName}-sphere.svg`);
});

$('dlVector').addEventListener('click', () => {
  if (!sourceSvg) return;
  try {
    const r = warpSvgToVector(sourceSvg, readParams(), $<HTMLSelectElement>('orientation').value as 'rows' | 'cols');
    const notes: string[] = [];
    if (r.unsupported.length) notes.push(t('vectorUnsupported', { items: r.unsupported.join(', ') }));
    if (r.clipped) notes.push(t('clipped'));
    if (r.empty) notes.push(t('vectorNone'));
    warn.hidden = notes.length === 0;
    warn.textContent = notes.join(' ');
    if (!r.empty) download(new Blob([r.svg], { type: 'image/svg+xml' }), `${sourceName}-sphere-vector.svg`);
  } catch (err) {
    warn.hidden = false;
    warn.textContent = err instanceof Error ? t(err.message) : t('errLoad');
  }
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
  updateSizeLabel();
});

function updateSizeLabel(): void {
  $('sizeLabel').textContent = t(sizeBy.value === 'width' ? 'sizeLabelWidth' : 'sizeLabelHeight');
}

function imageWidthMmFor(prevMode: 'width' | 'height', input: HTMLInputElement): number {
  const v = parseFloat(input.value) || DEFAULT_PARAMS.imageWidthMm;
  return prevMode === 'width' || !source ? v : (v * source.width) / source.height;
}

// --- machine presets ---
const presetSel = $<HTMLSelectElement>('preset');
function buildPresetOptions(): void {
  const keep = presetSel.value;
  presetSel.length = 0;
  presetSel.add(new Option(t('custom'), ''));
  presets.forEach((p, i) => presetSel.add(new Option(getLang() === 'de' ? (p.name_de ?? p.name) : p.name, String(i))));
  presetSel.value = keep;
}
buildPresetOptions();

function setField(id: string, value: string | number | boolean | undefined): void {
  if (value === undefined) return;
  const el = $<HTMLInputElement | HTMLSelectElement>(id);
  if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = String(value);
}

function applyPreset(p: PresetParams): void {
  for (const [k, v] of Object.entries(p)) setField(k, v);
}

presetSel.addEventListener('change', () => {
  const preset = presetSel.value === '' ? null : presets[Number(presetSel.value)];
  if (!preset) return;
  applyPreset(preset.params);
  run();
});

// the first preset is the default for a fresh page
if (presets.length > 0) {
  presetSel.value = '0';
  presetSel.dispatchEvent(new Event('change'));
}

/**
 * The original image turned so that its chosen axis direction runs along the rotation axis, as it would be
 * exported without any warp. Returns the (possibly enlarged) canvas and its physical size in mm.
 */
function rotatedSource(angleDeg: number, imgW: number, imgH: number): { canvas: HTMLCanvasElement; widthMm: number; heightMm: number } {
  if (angleDeg % 360 === 0) return { canvas: srcCanvas, widthMm: imgW, heightMm: imgH };
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const wMm = imgW * c + imgH * s;
  const hMm = imgW * s + imgH * c;
  const pxPerMm = Math.min(srcCanvas.width / imgW, 4096 / Math.max(wMm, hMm));
  rotCanvas.width = Math.max(1, Math.ceil(wMm * pxPerMm));
  rotCanvas.height = Math.max(1, Math.ceil(hMm * pxPerMm));
  const g = rotCanvas.getContext('2d')!;
  g.clearRect(0, 0, rotCanvas.width, rotCanvas.height);
  g.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  g.rotate(a); // screen rotation is clockwise: the image's +angle direction (counter-clockwise) ends up horizontal
  g.drawImage(srcCanvas, (-imgW * pxPerMm) / 2, (-imgH * pxPerMm) / 2, imgW * pxPerMm, imgH * pxPerMm);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas: rotCanvas, widthMm: wMm, heightMm: hMm };
}

function clearSvg(): void {
  sourceSvg = null;
  $<HTMLButtonElement>('dlVector').disabled = true;
}

function setSource(img: ImageData): void {
  source = img;
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  srcCanvas.getContext('2d')!.putImageData(img, 0, 0);
}

$<HTMLSelectElement>('previewMode').addEventListener('change', (e) =>
  preview?.setMode((e.target as HTMLSelectElement).value as 'warp' | 'naive'),
);

$('sampleBtn').addEventListener('click', () => {
  clearSvg();
  sourceName = 'sample';
  setSource(makeSample());
  run();
});

// start with the sample so there is something to look at right away
sourceName = 'sample';
setSource(makeSample());
run();

// --- language ---
const axisLabels = () => ({ plus: t('labelAxisPlus'), minus: t('labelAxisMinus'), turns: t('labelBallTurns') });

function updateFileHint(): void {
  $('fileHint').textContent = t($<HTMLSelectElement>('orientation').value === 'cols' ? 'fileHintCols' : 'fileHintRows');
}

const langSel = $<HTMLSelectElement>('lang');
langSel.value = getLang();
langSel.addEventListener('change', () => setLang(langSel.value as Lang));
onLangChange(() => {
  buildPresetOptions();
  updateSizeLabel();
  updateFileHint();
  preview?.setLabels(axisLabels());
  run();
});
applyStatic();
updateSizeLabel();
updateFileHint();

// --- theme ---
const themeBtn = $<HTMLButtonElement>('theme');
const showTheme = () => { themeBtn.dataset.mode = effectiveTheme(); };
showTheme();
themeBtn.addEventListener('click', () => {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
  showTheme();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', showTheme);
