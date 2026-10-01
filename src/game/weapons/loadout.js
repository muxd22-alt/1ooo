import parts from '../../../data/weapon-parts.json';
import { buildWeapon } from './aggregate.js';

export { parts };

export const PRESETS = Object.freeze({
  1: Object.freeze(['part_receiver_ar01', 'part_barrel_long', 'part_grip_vertical', 'part_mag_ext40']),
  2: Object.freeze(['part_receiver_smg01', 'part_barrel_short', 'part_grip_angled', 'part_mag_std20']),
  3: Object.freeze(['part_receiver_dmr01', 'part_barrel_heavy', 'part_grip_vertical', 'part_mag_ext40'])
});

export const PRESET_NAMES = Object.freeze({ 1: 'AR', 2: 'SMG', 3: 'DMR' });

export function loadPreset(index) {
  const ids = PRESETS[index];
  if (!ids) return null;
  const result = buildWeapon(parts, ids);
  if (!result.valid) {
    throw new Error(`preset ${index} invalid: ${result.issues.join('; ')}`);
  }
  return { index, name: PRESET_NAMES[index], ...result.stats };
}
