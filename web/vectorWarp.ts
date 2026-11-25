import { type Pt, makeMapper, warpPolyline } from '../core/vector';
import type { WarpParams } from '../core/warp';
import { parseSvg, svgViewBox } from './loadImage';

const NS = 'http://www.w3.org/2000/svg';
const SHAPES = 'path,line,polyline,polygon,rect,circle,ellipse';
const UNSUPPORTED = 'text,image,use,foreignObject';
const NOT_DRAWN = 'defs,clipPath,mask,symbol,pattern,marker,linearGradient,radialGradient';
/** Sampling distance along source paths, in mm on the ball. */
const SAMPLE_MM = 0.3;
const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?';
/** The leading moveto of a subpath: command letter and its first coordinate pair. */
const MOVETO = new RegExp(`^([Mm])\\s*(${NUM})[\\s,]*(${NUM})`);

export interface VectorResult {
  svg: string;
  widthMm: number;
  heightMm: number;
  /** Part of the artwork did not fit on the visible side of the ball. */
  clipped: boolean;
  /** Kinds of content that cannot be warped as vectors and were left out. */
  unsupported: string[];
  /** Nothing exportable was found. */
  empty: boolean;
}

interface Piece {
  pts: Pt[]; // root user units
  closed: boolean;
}

/** Sample an SVG shape into polylines (one per subpath) using the browser's own geometry. */
function samplePieces(el: SVGGeometryElement, scratch: SVGPathElement, mmPerUnit: number): Piece[] {
  const sample = (g: SVGGeometryElement, from: number, to: number, closed: boolean): Piece | null => {
    const len = to - from;
    if (!(len > 0)) return null;
    const n = Math.max(2, Math.min(4000, Math.ceil((len * mmPerUnit) / SAMPLE_MM)));
    const count = closed ? n : n + 1; // a closed shape's last point equals its first
    const wrap = (t: number) => (((t - from) % len) + len) % len + from;
    const at = (t: number): Pt => {
      const q = g.getPointAtLength(closed ? wrap(t) : Math.min(to, Math.max(from, t)));
      return [q.x, q.y];
    };

    const ts: number[] = [];
    const pts: Pt[] = [];
    for (let i = 0; i < count; i++) {
      ts.push(from + (len * i) / n);
      pts.push(at(ts[i]!));
    }

    // Even sampling would cut sharp corners. Where the direction changes noticeably, sample the stretch
    // around that point more finely so the corner stays within a few hundredths of a mm.
    const turn = (a: Pt, b: Pt, c: Pt) => {
      const d = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]));
      return d > Math.PI ? 2 * Math.PI - d : d;
    };
    const extra: number[] = [];
    for (let i = 0; i < count; i++) {
      const prev = i > 0 ? i - 1 : closed ? count - 1 : -1;
      const next = i < count - 1 ? i + 1 : closed ? 0 : -1;
      if (prev < 0 || next < 0 || turn(pts[prev]!, pts[i]!, pts[next]!) < 0.17) continue;
      const t0 = i > 0 ? ts[i - 1]! : ts[count - 1]! - len;
      const t1 = i < count - 1 ? ts[i + 1]! : ts[0]! + len;
      for (let j = 1; j < 16; j++) if (j !== 8) extra.push(t0 + ((t1 - t0) * j) / 16);
    }
    let all = ts.map((t, i) => ({ t, p: pts[i]! }));
    if (extra.length) {
      all = all.concat(extra.map((t) => ({ t: closed ? wrap(t) : t, p: at(t) })));
      all.sort((x, y) => x.t - y.t);
      all = all.filter((e, i) => i === 0 || e.t - all[i - 1]!.t > 1e-9);
    }
    return { pts: all.map((e) => e.p), closed };
  };

  if (el.localName !== 'path') {
    const closed = ['polygon', 'rect', 'circle', 'ellipse'].includes(el.localName);
    const piece = sample(el, 0, el.getTotalLength(), closed);
    return piece ? [piece] : [];
  }

  // A path can hold several subpaths, and browsers disagree on whether the length includes the jump between
  // them. So every subpath is rewritten as a standalone path with an absolute start point and measured alone.
  const parts = (el.getAttribute('d') ?? '').split(/(?=[Mm])/).filter((s) => s.trim() !== '');
  const out: Piece[] = [];
  let cur: Pt = [0, 0]; // current point before the next subpath
  parts.forEach((part, k) => {
    const m = MOVETO.exec(part.trim());
    if (!m) return;
    const rel = m[1] === 'm' && k > 0; // a leading relative moveto counts as absolute
    const sx = parseFloat(m[2]!) + (rel ? cur[0] : 0);
    const sy = parseFloat(m[3]!) + (rel ? cur[1] : 0);
    let rest = part.trim().slice(m[0].length);
    // coordinate pairs right after a moveto are implicit linetos, relative if the moveto was
    if (/^[\s,]*[-+.\d]/.test(rest)) rest = (m[1] === 'm' ? 'l' : 'L') + rest;
    scratch.setAttribute('d', `M${sx} ${sy}${rest}`);
    const total = scratch.getTotalLength();
    const end = scratch.getPointAtLength(total);
    cur = [end.x, end.y];
    const piece = sample(scratch, 0, total, /[zZ]\s*$/.test(part));
    if (piece) out.push(piece);
  });
  return out;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Warp the vector artwork of an SVG onto the ball. The result is an SVG in mm with the warped outlines as
 * polylines; fills, strokes and fill rules are kept, stroke widths stay constant in mm (like a laser line).
 */
export function warpSvgToVector(svgText: string, p: WarpParams, orientation: 'rows' | 'cols'): VectorResult {
  const root = parseSvg(svgText);
  const [vbX, vbY, vbW, vbH] = svgViewBox(root);
  const mmPerUnit = p.imageWidthMm / vbW;
  const map = makeMapper(p);

  // The browser needs the SVG in the document to measure it; keep it invisible.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden';
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    // getCTM may or may not include the root's viewBox scaling depending on the browser: measure it on a
    // transform-free child and divide it out, so matrices are relative to the root's user space.
    const probe = document.createElementNS(NS, 'rect');
    svg.appendChild(probe);
    const r0 = probe.getCTM() ?? new DOMMatrix();
    probe.remove();
    const rootInv = r0.inverse();
    const scratch = document.createElementNS(NS, 'path');
    svg.appendChild(scratch);

    const unsupported = new Set<string>();
    svg.querySelectorAll(UNSUPPORTED).forEach((e) => {
      if (!e.closest(NOT_DRAWN)) unsupported.add(e.localName === 'foreignObject' ? 'foreignObject' : e.localName);
    });

    // one entry per source element: all its subpaths go into a single <path> so holes (even-odd) survive
    type Out = { runs: Array<{ pts: Pt[]; closed: boolean }>; style: string; strokeMm: number };
    const outs: Out[] = [];
    let clipped = false;

    svg.querySelectorAll<SVGGeometryElement>(SHAPES).forEach((el) => {
      if (el === (scratch as Element) || el.closest(NOT_DRAWN)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      if (el.hasAttribute('clip-path') || el.hasAttribute('mask')) unsupported.add('clip-path / mask');

      const m = rootInv.multiply(el.getCTM() ?? new DOMMatrix());
      const ctmScale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;

      let fill = cs.fill;
      let stroke = cs.stroke;
      if (fill.startsWith('url(')) {
        unsupported.add('gradient / pattern');
        fill = '#000';
      }
      if (stroke.startsWith('url(')) {
        unsupported.add('gradient / pattern');
        stroke = '#000';
      }
      const strokeMm = stroke === 'none' ? 0 : (parseFloat(cs.strokeWidth) || 1) * ctmScale * mmPerUnit;
      const style =
        `fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeMm)}" fill-rule="${cs.fillRule}" ` +
        `stroke-linecap="${cs.strokeLinecap}" stroke-linejoin="${cs.strokeLinejoin}"`;

      const out: Out = { runs: [], style, strokeMm };
      for (const piece of samplePieces(el, scratch, mmPerUnit * ctmScale)) {
        // element units -> root user units -> image mm (centred, y up)
        const pts: Pt[] = piece.pts.map(([x, y]) => {
          const rx = m.a * x + m.c * y + m.e;
          const ry = m.b * x + m.d * y + m.f;
          return [(rx - vbX - vbW / 2) * mmPerUnit, -(ry - vbY - vbH / 2) * mmPerUnit];
        });
        const w = warpPolyline(pts, piece.closed, map);
        if (w.clipped) clipped = true;
        if (w.runs.length === 0) continue;
        for (const run of w.runs) {
          const pts = orientation === 'cols' ? run.map(([x, y]): Pt => [y, x]) : run;
          out.runs.push({ pts, closed: w.closed });
        }
      }
      if (out.runs.length) outs.push(out);
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pad = 0;
    for (const o of outs) {
      pad = Math.max(pad, o.strokeMm / 2);
      for (const run of o.runs) {
        for (const [x, y] of run.pts) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (!Number.isFinite(minX)) {
      return { svg: '', widthMm: 0, heightMm: 0, clipped, unsupported: [...unsupported], empty: true };
    }

    const W = maxX - minX + 2 * pad;
    const H = maxY - minY + 2 * pad;
    const paths = outs.map((o) => {
      const d = o.runs
        .map((run) => 'M' + run.pts.map(([x, y]) => `${fmt(x - minX + pad)} ${fmt(y - minY + pad)}`).join('L') + (run.closed ? 'Z' : ''))
        .join('');
      return `  <path d="${d}" ${o.style}/>`;
    });
    const out =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="${NS}" width="${fmt(W)}mm" height="${fmt(H)}mm" viewBox="0 0 ${fmt(W)} ${fmt(H)}">\n` +
      paths.join('\n') +
      `\n</svg>\n`;
    return { svg: out, widthMm: W, heightMm: H, clipped, unsupported: [...unsupported], empty: false };
  } finally {
    host.remove();
  }
}
