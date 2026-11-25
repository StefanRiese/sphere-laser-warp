import { decodeSettings, encodeSettings, type SettingsRecord } from '../core/settings';

const KEY = 'sphere-laser-warp-settings';
/** Controls whose value is remembered and shared in the URL hash (not the image file itself). */
export const SETTING_IDS = [
  'preset', 'ballDiameterMm', 'sizeBy', 'imageSizeMm', 'axisAngleDeg', 'offsetAxisMm', 'projection',
  'dpi', 'ballColor', 'showAxis', 'orientation', 'whiteBg', 'previewMode',
] as const;

type Control = HTMLInputElement | HTMLSelectElement;
const el = (id: string) => document.getElementById(id) as Control;
const isCheck = (c: Control): c is HTMLInputElement => c instanceof HTMLInputElement && c.type === 'checkbox';

function read(): SettingsRecord {
  const rec: SettingsRecord = {};
  for (const id of SETTING_IDS) {
    const c = el(id);
    rec[id] = isCheck(c) ? (c.checked ? '1' : '0') : c.value;
  }
  return rec;
}

function validNumber(v: string): boolean {
  return v.trim() !== '' && Number.isFinite(Number(v));
}

/** Apply one stored value if it is valid for that control; invalid values are ignored. */
function applyOne(id: string, v: string): void {
  const c = el(id);
  if (c instanceof HTMLSelectElement) {
    if (Array.from(c.options).some((o) => o.value === v)) c.value = v;
  } else if (c.type === 'checkbox') c.checked = v === '1';
  else if (c.type === 'number') {
    if (validNumber(v)) c.value = v;
  } else if (c.type === 'color') {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) c.value = v;
  }
}

/** Restore settings: localStorage first, then the URL hash on top. Returns true if anything was applied. */
export function restoreSettings(): boolean {
  let saved = '';
  try {
    saved = localStorage.getItem(KEY) ?? '';
  } catch {
    /* storage unavailable */
  }
  const merged = { ...decodeSettings(saved, SETTING_IDS), ...decodeSettings(location.hash, SETTING_IDS) };
  // the preset only fills in other fields, so it has to be set first and explicitly saved values win over it
  for (const id of SETTING_IDS) if (id in merged) applyOne(id, merged[id]!);
  return Object.keys(merged).length > 0;
}

/** Remember the current settings and mirror them in the URL hash so the address can be shared. */
export function saveSettings(): void {
  const text = encodeSettings(read());
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* ignore */
  }
  history.replaceState(null, '', `#${text}`);
}
