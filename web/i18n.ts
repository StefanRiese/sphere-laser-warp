import { type Key, type Lang, strings } from './strings';

const STORAGE_KEY = 'sphere-laser-warp-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'de') return saved;
  } catch {
    /* storage can be unavailable (private mode); fall through */
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initialLang();
const listeners: Array<() => void> = [];

export const getLang = (): Lang => lang;

/** Translate a key, filling {placeholders}. An unknown key is returned as is. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = (strings[lang] as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Locale-aware fixed-decimal number. */
export function fmt(n: number, digits = 1): string {
  return n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Fill every element carrying data-i18n and update the page language. */
export function applyStatic(): void {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as Key);
  });
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyStatic();
  listeners.forEach((l) => l());
}

export function onLangChange(cb: () => void): void {
  listeners.push(cb);
}
