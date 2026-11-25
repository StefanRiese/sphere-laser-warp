/**
 * Usage counter: counts downloads (PNG, SVG, vector SVG) as one GoatCounter event.
 * GoatCounter is cookie-free and stores no personal data; only the event name is sent.
 * The displayed number comes from its public counter endpoint (setting "Allow using the
 * visitor counter" must be on). Failures (offline, blocked, service gone) are ignored;
 * the counter just stays hidden.
 */
const SITE = 'https://stefanriese.goatcounter.com';
const EVENT = 'download';

// GoatCounter caches the public counter for up to four hours, so a fresh read right after a
// download is stale. Keep the last known number and add this visit's downloads to it locally.
let shown: number | null = null;

function show(n: number | null): void {
  const el = document.getElementById('useCount');
  if (!el || n === null) return;
  shown = n;
  el.hidden = false;
  el.querySelector('b')!.textContent = n.toLocaleString();
}

async function read(): Promise<number | null> {
  try {
    const res = await fetch(`${SITE}/counter/${EVENT}.json`, { cache: 'no-store' });
    if (res.status === 404) return 0; // nothing counted yet
    if (!res.ok) return null;
    const c = (await res.json()).count;
    // formatted string with thousands separators, e.g. "1,234"
    const n = typeof c === 'string' ? Number(c.replace(/\D/g, '')) : c;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Show the current count (call once on start). */
export async function loadCount(): Promise<void> {
  show(await read());
}

/** Count one use and bump the displayed number. */
export function countUse(): void {
  new Image().src = `${SITE}/count?p=${EVENT}&e=true&t=Download&rnd=${Math.random().toString(36).slice(2)}`;
  show((shown ?? 0) + 1);
}
