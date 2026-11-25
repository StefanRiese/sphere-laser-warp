/**
 * Usage counter: counts downloads (PNG, SVG, vector SVG) as one GoatCounter event.
 * GoatCounter is cookie-free and stores no personal data; only the event name is sent.
 * The displayed number comes from its public counter endpoint (setting "Allow using the
 * visitor counter" must be on). Failures (offline, blocked, service gone) are ignored;
 * the counter just stays hidden.
 */
const SITE = 'https://stefanriese.goatcounter.com';
const EVENT = 'download';

function show(text: string | null): void {
  const el = document.getElementById('useCount');
  if (!el || text === null) return;
  el.hidden = false;
  el.querySelector('b')!.textContent = text;
}

async function read(): Promise<string | null> {
  try {
    const res = await fetch(`${SITE}/counter/${EVENT}.json`, { cache: 'no-store' });
    if (res.status === 404) return '0'; // nothing counted yet
    if (!res.ok) return null;
    const c = (await res.json()).count;
    return typeof c === 'string' || typeof c === 'number' ? String(c) : null;
  } catch {
    return null;
  }
}

/** Show the current count (call once on start). */
export async function loadCount(): Promise<void> {
  show(await read());
}

/** Count one use, then refresh the displayed number. */
export async function countUse(): Promise<void> {
  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = `${SITE}/count?p=${EVENT}&e=true&t=Download&rnd=${Math.random().toString(36).slice(2)}`;
    setTimeout(resolve, 5000);
  });
  show(await read());
}
