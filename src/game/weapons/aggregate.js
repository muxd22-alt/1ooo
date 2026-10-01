export const SLOT_TYPES = Object.freeze(['receiver', 'barrel', 'grip', 'magazine']);

export const WEAPON_LIMITS = Object.freeze({
  fireRateRPM: Object.freeze([60.0, 1800.0]),
  weight: Object.freeze([1.0, 35.0]),
  voxelDestructionRadius: Object.freeze([0.0, 8.5])
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function validateAssembly(parts) {
  const issues = [];

  if (!Array.isArray(parts)) {
    return { valid: false, sharedTags: [], issues: ['assembly must be an array of parts'] };
  }
  if (parts.length !== SLOT_TYPES.length) {
    issues.push(`assembly must contain exactly ${SLOT_TYPES.length} parts (got ${parts.length})`);
  }

  const bySlot = new Map();
  for (const part of parts) {
    if (bySlot.has(part.slotType)) issues.push(`duplicate slot "${part.slotType}"`);
    bySlot.set(part.slotType, part);
  }
  for (const slot of SLOT_TYPES) {
    if (!bySlot.has(slot)) issues.push(`missing slot "${slot}"`);
  }
  if (issues.length > 0) return { valid: false, sharedTags: [], issues };

  const tagSets = parts.map((part) => new Set(part.compatibilityTags ?? []));
  const sharedTags = [...tagSets[0]].filter((tag) => tagSets.every((set) => set.has(tag)));
  if (sharedTags.length === 0) issues.push('no shared compatibility tag across parts');

  return { valid: issues.length === 0, sharedTags, issues };
}

export function aggregateWeapon(parts) {
  let damageFlat = 0;
  let damageScalar = 1;
  let fireRateRPM = 0;
  let recoilVertical = 0;
  let recoilHorizontal = 0;
  let weight = 0;
  let destructionRadius = 0;

  for (const part of parts) {
    const mod = part.statModifiers;
    damageFlat += mod.damageFlat;
    damageScalar *= mod.damageScalar ?? 1;
    fireRateRPM += mod.fireRateRPM;
    recoilVertical += mod.recoilImpulseVertical;
    recoilHorizontal += mod.recoilImpulseHorizontal;
    weight += part.weightClass ?? 0;
    destructionRadius += mod.voxelDestructionRadius;
  }

  const clampedRPM = clamp(fireRateRPM, WEAPON_LIMITS.fireRateRPM[0], WEAPON_LIMITS.fireRateRPM[1]);
  const clampedWeight = clamp(weight, WEAPON_LIMITS.weight[0], WEAPON_LIMITS.weight[1]);
  const clampedRadius = clamp(
    destructionRadius,
    WEAPON_LIMITS.voxelDestructionRadius[0],
    WEAPON_LIMITS.voxelDestructionRadius[1]
  );
  const massFactor = 1.0 / (1.0 + clampedWeight * 0.15);
  const fireRateHz = Math.max(1.0, clampedRPM / 60.0);

  return {
    partIds: parts.map((part) => part.partId),
    damage: damageFlat * damageScalar,
    fireRateRPM: clampedRPM,
    fireRateHz,
    fireIntervalMs: 60000.0 / clampedRPM,
    recoil: {
      vertical: Math.max(0.1, recoilVertical) * massFactor,
      horizontal: Math.max(0.1, recoilHorizontal) * massFactor
    },
    weight: clampedWeight,
    voxelDestructionRadius: clampedRadius
  };
}

export function buildWeapon(parts, partIds) {
  const byId = new Map(parts.map((part) => [part.partId, part]));
  const selected = partIds.map((id) => byId.get(id));
  const missing = partIds.filter((id, i) => !selected[i]);
  if (missing.length > 0) {
    return { valid: false, sharedTags: [], issues: missing.map((id) => `unknown part "${id}"`) };
  }

  const validation = validateAssembly(selected);
  if (!validation.valid) return validation;

  return { ...validation, stats: aggregateWeapon(selected) };
}
