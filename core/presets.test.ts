import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '..', 'presets');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const allowed = new Set([
  'ballDiameterMm', 'projection', 'latitudeLimitDeg', 'dpi', 'orientation',
  'axisAngleDeg', 'offsetAxisMm', 'offsetRotationDeg', 'mirror', 'flipRotation',
]);

describe('presets', () => {
  it('has at least one preset', () => expect(files.length).toBeGreaterThan(0));

  it.each(files)('%s is valid', (f) => {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    expect(typeof p.name).toBe('string');
    expect(typeof p.description).toBe('string');
    for (const k of Object.keys(p.params)) expect(allowed.has(k), `unknown param ${k}`).toBe(true);
    if ('projection' in p.params) expect(['equidistant', 'stereographic', 'equalarea']).toContain(p.params.projection);
    if ('orientation' in p.params) expect(['rows', 'cols']).toContain(p.params.orientation);
    if ('latitudeLimitDeg' in p.params) expect(p.params.latitudeLimitDeg).toBeGreaterThan(0);
    if ('dpi' in p.params) expect(p.params.dpi).toBeGreaterThan(0);
  });
});
