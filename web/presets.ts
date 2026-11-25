/** Machine presets: every JSON file in /presets is picked up at build time. */

export interface PresetParams {
  ballDiameterMm?: number;
  projection?: 'equidistant' | 'stereographic' | 'equalarea';
  dpi?: number;
  orientation?: 'rows' | 'cols';
  axisAngleDeg?: number;
  offsetAxisMm?: number;
}

export interface Preset {
  name: string;
  /** German display name; falls back to `name`. */
  name_de?: string;
  description: string;
  params: PresetParams;
}

const modules = import.meta.glob<Preset>('../presets/*.json', { eager: true, import: 'default' });

export const presets: Preset[] = Object.values(modules).sort((a, b) => a.name.localeCompare(b.name));
