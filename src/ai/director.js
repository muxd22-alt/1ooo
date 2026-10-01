export const INTENTS = Object.freeze(['AGGRESSIVE', 'HARVESTER', 'CAMPER']);

export const INTENT_DIRECTIVES = Object.freeze({
  AGGRESSIVE: Object.freeze({
    npc: 'cover-seeking bots, suppressive voxel barriers, crossfire vectors, bounty events',
    fog: 0.0035,
    sky: 0x9ec4e8,
    sun: 3.6,
    hemi: 1.55
  }),
  HARVESTER: Object.freeze({
    npc: 'stealth flanks from occluded angles, subterranean assault events',
    fog: 0.005,
    sky: 0x8fb8de,
    sun: 3.0,
    hemi: 1.4
  }),
  CAMPER: Object.freeze({
    npc: 'smoke cover deployment, subterranean tunneling, volumetric fog and night shifts',
    fog: 0.016,
    sky: 0x2f3b52,
    sun: 0.9,
    hemi: 0.6
  })
});

export function intentFromLogits(logits) {
  if (!Array.isArray(logits) || logits.length === 0) return null;
  let best = 0;
  for (let i = 1; i < logits.length; i++) {
    if (logits[i] > logits[best]) best = i;
  }
  let min = logits[0];
  let max = logits[0];
  for (const value of logits) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { index: best, name: INTENTS[best] ?? `INTENT_${best}`, margin: max - min };
}

export function directorState(intent) {
  return INTENT_DIRECTIVES[intent] ?? INTENT_DIRECTIVES.HARVESTER;
}
