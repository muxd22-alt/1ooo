import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOT_TYPES, WEAPON_LIMITS, validateAssembly, aggregateWeapon, buildWeapon } from '../src/game/weapons/aggregate.js';
import { loadPreset, PRESET_NAMES } from '../src/game/weapons/loadout.js';
import { weaponIdentity } from '../src/game/weapons/identity.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const parts = JSON.parse(readFileSync(path.join(ROOT, 'data', 'weapon-parts.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function approx(actual, expected, message) {
  assert(Math.abs(actual - expected) <= Math.abs(expected) * 1e-9 + 1e-9, `${message}: got ${actual}, expected ${expected}`);
}

const PART_ID_PATTERN = /^part_[a-z0-9_]+$/;

for (const part of parts) {
  assert(PART_ID_PATTERN.test(part.partId), `${part.partId}: partId pattern`);
  assert(SLOT_TYPES.includes(part.slotType), `${part.partId}: slotType enum`);
  assert(typeof part.weightClass === 'number' && part.weightClass >= 0.1 && part.weightClass <= 20.0, `${part.partId}: weightClass range`);
  assert(Array.isArray(part.compatibilityTags) && part.compatibilityTags.length > 0, `${part.partId}: compatibilityTags`);
  assert(new Set(part.compatibilityTags).size === part.compatibilityTags.length, `${part.partId}: compatibilityTags unique`);
  assert(typeof part.baseAttributes.thermalMass === 'number' && part.baseAttributes.thermalMass >= 0, `${part.partId}: thermalMass`);
  assert(typeof part.baseAttributes.durability === 'number' && part.baseAttributes.durability >= 0 && part.baseAttributes.durability <= 100, `${part.partId}: durability`);
  for (const key of ['damageFlat', 'damageScalar', 'fireRateRPM', 'recoilImpulseVertical', 'recoilImpulseHorizontal', 'voxelDestructionRadius']) {
    assert(typeof part.statModifiers[key] === 'number', `${part.partId}: statModifiers.${key}`);
  }
  assert(part.statModifiers.voxelDestructionRadius >= 0, `${part.partId}: voxelDestructionRadius >= 0`);
  assert(part.statModifiers.damageScalar > 0, `${part.partId}: damageScalar > 0`);
}

assert(parts.length === 10, `expected 10 parts, got ${parts.length}`);
const bySlot = Object.fromEntries(SLOT_TYPES.map((s) => [s, parts.filter((p) => p.slotType === s)]));
assert(bySlot.receiver.length === 3, '3 receivers');
assert(bySlot.barrel.length === 3, '3 barrels');
assert(bySlot.grip.length === 2, '2 grips');
assert(bySlot.magazine.length === 2, '2 magazines');

let validAssemblies = 0;
for (const r of bySlot.receiver) {
  for (const b of bySlot.barrel) {
    for (const g of bySlot.grip) {
      for (const m of bySlot.magazine) {
        if (validateAssembly([r, b, g, m]).valid) validAssemblies++;
      }
    }
  }
}
assert(validAssemblies === 28, `expected 28 valid assemblies of 36, got ${validAssemblies}`);

const ar = buildWeapon(parts, ['part_receiver_ar01', 'part_barrel_long', 'part_grip_vertical', 'part_mag_ext40']);
assert(ar.valid, `AR preset invalid: ${ar.issues}`);
approx(ar.stats.damage, 15 * 1.173, 'AR damage');
approx(ar.stats.fireRateRPM, 705, 'AR rpm');
approx(ar.stats.fireRateHz, 11.75, 'AR hz');
approx(ar.stats.fireIntervalMs, 60000 / 705, 'AR interval');
approx(ar.stats.weight, 6.1, 'AR weight');
const arMass = 1 / (1 + 6.1 * 0.15);
approx(ar.stats.recoil.vertical, 0.5 * arMass, 'AR recoil V');
approx(ar.stats.recoil.horizontal, 0.25 * arMass, 'AR recoil H');
approx(ar.stats.voxelDestructionRadius, 1.2, 'AR radius');

const smg = buildWeapon(parts, ['part_receiver_smg01', 'part_barrel_short', 'part_grip_angled', 'part_mag_std20']);
assert(smg.valid, `SMG preset invalid: ${smg.issues}`);
approx(smg.stats.damage, 7.35, 'SMG damage');
approx(smg.stats.fireRateRPM, 1025, 'SMG rpm');
approx(smg.stats.voxelDestructionRadius, 0.7, 'SMG radius');

const dmr = buildWeapon(parts, ['part_receiver_dmr01', 'part_barrel_heavy', 'part_grip_vertical', 'part_mag_ext40']);
assert(dmr.valid, `DMR preset invalid: ${dmr.issues}`);
approx(dmr.stats.damage, 27 * 1.275, 'DMR damage');
approx(dmr.stats.fireRateRPM, 215, 'DMR rpm');
approx(dmr.stats.recoil.vertical, 1.6 / (1 + 8.1 * 0.15), 'DMR recoil V');

const mismatch = buildWeapon(parts, ['part_receiver_dmr01', 'part_barrel_short', 'part_grip_vertical', 'part_mag_std20']);
assert(!mismatch.valid, 'dmr+short barrel must be rejected');
assert(mismatch.issues.some((i) => i.includes('compatibility')), 'compatibility issue reported');

const missingSlot = validateAssembly([bySlot.receiver[0], bySlot.barrel[0], bySlot.grip[0]]);
assert(!missingSlot.valid && missingSlot.issues.some((i) => i.includes('magazine')), 'missing magazine detected');

const duplicateSlot = validateAssembly([bySlot.receiver[0], bySlot.receiver[1], bySlot.grip[0], bySlot.magazine[0]]);
assert(!duplicateSlot.valid && duplicateSlot.issues.some((i) => i.includes('duplicate')), 'duplicate slot detected');

const unknown = buildWeapon(parts, ['part_does_not_exist', 'part_barrel_long', 'part_grip_vertical', 'part_mag_std20']);
assert(!unknown.valid && unknown.issues.some((i) => i.includes('unknown part')), 'unknown part detected');

function makePart(overrides = {}) {
  const { weightClass, ...stats } = overrides;
  return {
    partId: 'part_test',
    slotType: 'receiver',
    weightClass: weightClass ?? 1,
    compatibilityTags: ['platform_ar'],
    baseAttributes: { thermalMass: 1, durability: 1 },
    statModifiers: {
      damageFlat: 0,
      damageScalar: 1,
      fireRateRPM: 0,
      recoilImpulseVertical: 0,
      recoilImpulseHorizontal: 0,
      voxelDestructionRadius: 0,
      ...stats
    }
  };
}

const rpmHigh = aggregateWeapon([
  makePart({ fireRateRPM: 5000 }),
  makePart({ slotType: 'barrel', fireRateRPM: 0 }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(rpmHigh.fireRateRPM, WEAPON_LIMITS.fireRateRPM[1], 'rpm upper clamp');

const rpmLow = aggregateWeapon([
  makePart({ fireRateRPM: -500 }),
  makePart({ slotType: 'barrel' }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(rpmLow.fireRateRPM, WEAPON_LIMITS.fireRateRPM[0], 'rpm lower clamp');
approx(rpmLow.fireRateHz, 1.0, 'hz floor');

const heavy = aggregateWeapon([
  makePart({ weightClass: 99 }),
  makePart({ slotType: 'barrel', weightClass: 99 }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(heavy.weight, WEAPON_LIMITS.weight[1], 'weight upper clamp');

const light = aggregateWeapon([
  makePart({ weightClass: 0.1 }),
  makePart({ slotType: 'barrel', weightClass: 0.1 }),
  makePart({ slotType: 'grip', weightClass: 0.1 }),
  makePart({ slotType: 'magazine', weightClass: 0.1 })
]);
approx(light.weight, WEAPON_LIMITS.weight[0], 'weight lower clamp');

const explosive = aggregateWeapon([
  makePart({ voxelDestructionRadius: 20 }),
  makePart({ slotType: 'barrel', voxelDestructionRadius: 10 }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(explosive.voxelDestructionRadius, WEAPON_LIMITS.voxelDestructionRadius[1], 'radius upper clamp');

const floor = aggregateWeapon([
  makePart({ recoilImpulseVertical: -5, recoilImpulseHorizontal: -5 }),
  makePart({ slotType: 'barrel' }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(floor.recoil.vertical, 0.1 / (1 + 4 * 0.15), 'recoil floor V');
approx(floor.recoil.horizontal, 0.1 / (1 + 4 * 0.15), 'recoil floor H');

const scaled = aggregateWeapon([
  makePart({ damageFlat: 10, damageScalar: 1.5, weightClass: 2 }),
  makePart({ slotType: 'barrel', damageFlat: 6, damageScalar: 0.5, weightClass: 2 }),
  makePart({ slotType: 'grip' }),
  makePart({ slotType: 'magazine' })
]);
approx(scaled.damage, 16 * 0.75, 'flat sum x scalar product');

const seenNames = new Set();
const seenAssemblies = new Set();
for (const s of [1337, 42, 90210, 7, 99, 2024, 555, 31337]) {
  for (const idx of [1, 2, 3]) {
    const preset = loadPreset(idx, s);
    assert(preset !== null, `loadPreset(${idx}, ${s}) returns a weapon`);
    assert(preset.name === PRESET_NAMES[idx], `preset ${idx} class name`);
    assert(/^[A-Z]{2}-\d{2} [A-Z][a-z]+$/.test(preset.displayName), `${preset.displayName}: display name pattern`);
    assert(preset.fireRateRPM >= WEAPON_LIMITS.fireRateRPM[0] && preset.fireRateRPM <= WEAPON_LIMITS.fireRateRPM[1], `preset ${idx} rpm in limits`);
    assert(preset.voxelDestructionRadius > 0, `preset ${idx} has destruction radius`);
    const again = loadPreset(idx, s);
    assert(again.displayName === preset.displayName, `preset ${idx} name deterministic for seed ${s}`);
    assert(again.partIds.join(',') === preset.partIds.join(','), `preset ${idx} assembly deterministic for seed ${s}`);
    seenNames.add(preset.displayName);
    seenAssemblies.add(preset.partIds.join(','));
  }
}
assert(seenNames.size >= 12, `seeded identities vary across seeds (${seenNames.size} distinct)`);
assert(seenAssemblies.size > 6, `seeded assemblies vary across seeds (${seenAssemblies.size} distinct)`);
assert(loadPreset(1).displayName === weaponIdentity(1337, 1), 'default loadPreset seed is 1337');
assert(loadPreset(9) === null, 'unknown preset index returns null');
assert(weaponIdentity(1, 1) !== weaponIdentity(2, 1), 'identity changes with seed');

console.log('OK  weapon schema + aggregation tests passed');
console.log(`    ${parts.length} parts · ${validAssemblies}/36 valid assemblies · AR dmg ${ar.stats.damage.toFixed(2)} @ ${ar.stats.fireRateRPM} rpm`);
console.log(`    ${seenNames.size} seeded identities · ${seenAssemblies.size} distinct assemblies · e.g. "${loadPreset(1, 1337).displayName}"`);
