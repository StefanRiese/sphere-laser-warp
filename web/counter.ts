/**
 * Usage counter: counts visits (one pageview per page load) and downloads (PNG, SVG, vector SVG,
 * each one GoatCounter event). GoatCounter is cookie-free and stores no personal data; only the
 * path or event name is sent. The numbers are read in the GoatCounter dashboard, not on the page.
 * Failures (offline, blocked, service gone) are ignored.
 */
const SITE = 'https://stefanriese.goatcounter.com';
const EVENT = 'download';

const rnd = (): string => Math.random().toString(36).slice(2);

/** Count one visit (call once on start). Only the path is sent, no referrer or other page data. */
export function countVisit(): void {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // skip dev runs
  new Image().src = `${SITE}/count?p=/&t=Sphere%20Laser%20Warp&rnd=${rnd()}`;
}

/** Count one download. */
export function countUse(): void {
  new Image().src = `${SITE}/count?p=${EVENT}&e=true&t=Download&rnd=${rnd()}`;
}
