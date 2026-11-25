/**
 * Usage counter: counts downloads (PNG, SVG, vector SVG) with the keyless hit-counter
 * API of Abacus. Only a number is incremented; nothing about the visitor or the image is sent.
 * Failures (offline, blocked, service gone) are ignored; the counter just stays hidden.
 */
const BASE = 'https://abacus.jasoncameron.dev';
const KEY = 'sphere-laser-warp/downloads';

async function call(action: 'info' | 'hit'): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/${action}/${KEY}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v = (await res.json()).value;
    // /info reports -1 for a counter that has not been hit yet
    return typeof v === 'number' ? Math.max(0, v) : null;
  } catch {
    return null;
  }
}

function show(n: number | null): void {
  const el = document.getElementById('useCount');
  if (!el || n === null) return;
  el.dataset.n = String(n);
  el.hidden = false;
  el.querySelector('b')!.textContent = n.toLocaleString();
}

/** Show the current count (call once on start). */
export async function loadCount(): Promise<void> {
  show(await call('info'));
}

/** Count one use and update the displayed number. */
export async function countUse(): Promise<void> {
  show(await call('hit'));
}
