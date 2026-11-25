export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'sphere-laser-warp-theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage can be unavailable; follow the system */
  }
  return 'auto';
}

/** Light or dark forces that look; auto follows the system setting. */
export function setTheme(theme: Theme): void {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}
