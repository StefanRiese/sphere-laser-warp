/** Load a raster or SVG file into ImageData. SVGs are rasterised at a resolution suited to the output. */

const MAX_SIDE = 4096;
const MIN_SIDE = 1024;

function parseLen(v: string | null): number | null {
  if (!v || v.trim().endsWith('%')) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Work out the SVG's intrinsic aspect from viewBox, falling back to width/height; make both explicit. */
function prepareSvg(text: string, targetSide: number): string {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('errInvalidSvg');

  let w = 0;
  let h = 0;
  const vb = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) {
    [w, h] = [vb[2]!, vb[3]!];
  } else {
    w = parseLen(svg.getAttribute('width')) ?? 0;
    h = parseLen(svg.getAttribute('height')) ?? 0;
  }
  if (!w || !h) throw new Error('errSvgSize');
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const scale = targetSide / Math.max(w, h);
  svg.setAttribute('width', String(Math.round(w * scale)));
  svg.setAttribute('height', String(Math.round(h * scale)));
  return new XMLSerializer().serializeToString(svg);
}

function decode(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('errDecode'));
    img.src = url;
  });
}

function toImageData(src: CanvasImageSource, w: number, h: number): ImageData {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** @param neededSide longest side (px) the output needs; used to pick the SVG raster size. */
export async function loadImage(file: File, neededSide: number): Promise<ImageData> {
  const isSvg = file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name);
  if (!isSvg) {
    const bmp = await createImageBitmap(file);
    return toImageData(bmp, bmp.width, bmp.height);
  }
  const side = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.ceil(neededSide)));
  const svgText = prepareSvg(await file.text(), side);
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = await decode(url);
    return toImageData(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
