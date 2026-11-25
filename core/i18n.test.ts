import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strings } from '../web/strings';

const en = Object.keys(strings.en).sort();
const de = Object.keys(strings.de).sort();
const html = readFileSync(join(__dirname, '..', 'web', 'index.html'), 'utf8');

describe('i18n', () => {
  it('has the same keys in both languages', () => expect(de).toEqual(en));

  it('has no empty strings', () => {
    for (const lang of ['en', 'de'] as const) {
      for (const [k, v] of Object.entries(strings[lang])) expect(v.trim(), `${lang}.${k}`).not.toBe('');
    }
  });

  it('uses the same {placeholders} in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of en) {
      expect(ph(strings.de[k as keyof typeof strings.de]), k).toBe(ph(strings.en[k as keyof typeof strings.en]));
    }
  });

  it('every data-i18n key in the HTML exists', () => {
    const keys = [...html.matchAll(/data-i18n="(\w+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) expect(en, k).toContain(k);
  });
});
