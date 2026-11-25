import { describe, expect, it } from 'vitest';
import { decodeSettings, encodeSettings } from './settings';

const KEYS = ['ballDiameterMm', 'ballColor', 'whiteBg'];

describe('settings', () => {
  it('round-trips values including special characters', () => {
    const rec = { ballDiameterMm: '70.5', ballColor: '#9b1c1c', whiteBg: '1' };
    expect(decodeSettings(encodeSettings(rec), KEYS)).toEqual(rec);
  });
  it('ignores a leading # and unknown keys', () => {
    expect(decodeSettings('#ballDiameterMm=60&evil=1', KEYS)).toEqual({ ballDiameterMm: '60' });
  });
  it('returns an empty record for an empty string', () => {
    expect(decodeSettings('', KEYS)).toEqual({});
  });
});
