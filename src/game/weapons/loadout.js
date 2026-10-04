import parts from '../../../data/weapon-parts.json' with { type: 'json' };
import { buildWeapon } from './aggregate.js';
import { mulberry32, weaponIdentity } from './identity.js';

export { parts };

export const PRESETS = Object.freeze({
  1: Object.freeze(['part_receiver_ar01', 'part_barrel_long', 'part_grip_vertical', 'part_mag_ext40']),
  2: Object.freeze(['part_receiver_smg01', 'part_barrel_short', 'part_grip_angled', 'part_mag_std20']),
  3: Object.freeze(['part_receiver_dmr01', 'part_barrel_heavy', 'part_grip_vertical', 'part_mag_ext40'])
});

export const PRESET_NAMES = Object.freeze({ 1: 'AR', 2: 'SMG', 3: 'DMR' });

const RECEIVERS = Object.freeze({
  1: 'part_receiver_ar01',
  2: 'part_receiver_smg01',
  3: 'part_receiver_dmr01'
});

const BARREL_POOLS = Object.freeze({
  1: Object.freeze(['part_barrel_short', 'part_barrel_long', 'part_barrel_heavy']),
  2: Object.freeze(['part_barrel_short', 'part_barrel_heavy']),
  3: Object.freeze(['part_barrel_long', 'part_barrel_heavy'])
});

const GRIP_POOL = Object.freeze(['part_grip_vertical', 'part_grip_angled']);
const MAG_POOL = Object.freeze(['part_mag_std20', 'part_mag_ext40']);

export function loadPreset(index, seed = 1337) {
  const receiver = RECEIVERS[index];
  if (!receiver) return null;
  const rng = mulberry32((seed ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const barrels = BARREL_POOLS[index];
  const ids = [
    receiver,
    barrels[Math.floor(rng() * barrels.length)],
    GRIP_POOL[Math.floor(rng() * GRIP_POOL.length)],
    MAG_POOL[Math.floor(rng() * MAG_POOL.length)]
  ];
  const result = buildWeapon(parts, ids);
  if (!result.valid) {
    throw new Error(`preset ${index} invalid: ${result.issues.join('; ')}`);
  }
  return {
    index,
    name: PRESET_NAMES[index],
    displayName: weaponIdentity(seed, index),
    ...result.stats
  };
}
