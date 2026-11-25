/** Export helpers: PNG with physical DPI metadata, and SVG with an exact physical size in mm. */

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk (pixels per metre) right after IHDR so importers size the image correctly. */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

export async function canvasToPng(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'),
  );
  const bytes = pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes as BlobPart], { type: 'image/png' });
}

/** SVG whose width/height are in mm and which embeds the raster, so it imports at the right physical size. */
export function canvasToSvg(canvas: HTMLCanvasElement, widthMm: number, heightMm: number): Blob {
  const href = canvas.toDataURL('image/png');
  const w = widthMm.toFixed(3);
  const h = heightMm.toFixed(3);
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n` +
    `  <image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" href="${href}" xlink:href="${href}"/>\n` +
    `</svg>\n`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
