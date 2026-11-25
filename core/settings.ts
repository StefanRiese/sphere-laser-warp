/** Serialise UI settings as a flat key/value record in URL query syntax (used for the URL hash and localStorage). */
export type SettingsRecord = Record<string, string>;

export function encodeSettings(rec: SettingsRecord): string {
  return new URLSearchParams(rec).toString();
}

/** Parse a settings string (a leading '#' or '?' is ignored). Only keys in `allowed` are returned. */
export function decodeSettings(text: string, allowed: readonly string[]): SettingsRecord {
  const out: SettingsRecord = {};
  const params = new URLSearchParams(text.replace(/^[#?]/, ''));
  for (const key of allowed) {
    const v = params.get(key);
    if (v !== null) out[key] = v;
  }
  return out;
}
