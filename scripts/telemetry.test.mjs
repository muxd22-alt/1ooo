import {
  TELEMETRY_INTERVAL_MS,
  WINDOW_TICKS,
  COMBAT_WINDOW_MS,
  createTelemetryState,
  stdDeviation,
  meanTravelDistance,
  pushAimSample,
  pushPosition,
  noteAction,
  noteShot,
  accrueCombatTime,
  buildFeatureVector,
  resetWindow
} from '../src/ai/telemetry.js';
import { INTENTS, intentFromLogits, directorState } from '../src/ai/director.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function approx(actual, expected, message) {
  assert(Math.abs(actual - expected) <= 1e-5, `${message}: got ${actual}, expected ${expected}`);
}

assert(TELEMETRY_INTERVAL_MS === 100, '10 Hz sampling interval');
assert(WINDOW_TICKS === 50, '5 second rolling window at 10 Hz');
assert(COMBAT_WINDOW_MS === 3000, 'combat window');

assert(stdDeviation([]) === 0, 'stdDev empty');
approx(stdDeviation([1, 2, 3]), Math.sqrt(2 / 3), 'stdDev [1,2,3]');
approx(stdDeviation([5, 5, 5]), 0, 'stdDev constant');

assert(meanTravelDistance([]) === 0, 'travel empty');
assert(meanTravelDistance([{ x: 0, y: 0, z: 0 }]) === 0, 'travel single');
approx(meanTravelDistance([{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }]), 2.5, 'travel 5 over 2 samples');

const state = createTelemetryState();
for (let i = 0; i < WINDOW_TICKS + 20; i++) pushAimSample(state, 3, 4);
assert(state.aimSamples.length === WINDOW_TICKS, `aim window capped (got ${state.aimSamples.length})`);
approx(state.aimSamples[0], 5, 'aim sample magnitude');

for (let i = 0; i < WINDOW_TICKS + 20; i++) pushPosition(state, { x: i, y: 0, z: 0 });
assert(state.positions.length === WINDOW_TICKS + 1, `position window capped (got ${state.positions.length})`);

noteAction(state);
assert(state.actionCount === 1, 'noteAction increments');
noteShot(state, 1000);
assert(state.actionCount === 2, 'noteShot increments');
assert(state.combatUntil === 1000 + COMBAT_WINDOW_MS, 'combat window set');

state.timeCombatMs = 0;
accrueCombatTime(state, 1500, 100);
assert(state.timeCombatMs === 100, 'combat time accrues inside window');
accrueCombatTime(state, 9999, 100);
assert(state.timeCombatMs === 100, 'no combat time outside window');

const featureState = createTelemetryState();
featureState.aimSamples = [3, 4];
featureState.actionCount = 10;
featureState.positions = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }];
featureState.timeMiningMs = 250;
featureState.timeCombatMs = 500;

const features = buildFeatureVector(featureState, 0.75);
assert(features instanceof Float32Array && features.length === 6, 'feature vector shape');
approx(features[0], 0.5, 'sigma_aim');
approx(features[1], 120, 'apm');
approx(features[2], 2.5, 'var_v');
approx(features[3], 0.5, 'tau_mine_ratio');
approx(features[4], 0.75, 'elev_bias');
approx(features[5], 0, 'crouch_freq');

const clamped = buildFeatureVector(featureState, 1.7);
approx(clamped[4], 1, 'elev_bias clamped high');
const clampedLow = buildFeatureVector(featureState, -0.4);
approx(clampedLow[4], 0, 'elev_bias clamped low');

resetWindow(featureState);
assert(featureState.actionCount === 0, 'reset clears actions');
assert(featureState.aimSamples.length === 0, 'reset clears aim samples');
assert(featureState.positions.length === 2, 'reset keeps position history');
assert(featureState.timeCombatMs === 500, 'reset keeps combat time');

assert(INTENTS.length === 3, 'three intents');
assert(intentFromLogits([]) === null, 'empty logits rejected');
assert(intentFromLogits(null) === null, 'null logits rejected');

const aggressive = intentFromLogits([0.9, 0.1, 0.2]);
assert(aggressive.name === 'AGGRESSIVE' && aggressive.index === 0, 'aggressive argmax');
assert(Math.abs(aggressive.margin - 0.8) < 1e-6, 'margin computed');

const harvester = intentFromLogits([-5, 1, -2]);
assert(harvester.name === 'HARVESTER' && harvester.index === 1, 'harvester argmax');

const camper = intentFromLogits([-1, -2, 0.5]);
assert(camper.name === 'CAMPER' && camper.index === 2, 'camper argmax');

const aggressiveState = directorState('AGGRESSIVE');
const harvesterState = directorState('HARVESTER');
const camperState = directorState('CAMPER');
assert(camperState.fog > harvesterState.fog && harvesterState.fog > aggressiveState.fog, 'fog escalates camper > harvester > aggressive');
assert(camperState.sun < harvesterState.sun && harvesterState.sun < aggressiveState.sun, 'sun dims camper < harvester < aggressive');
assert(directorState('UNKNOWN_INTENT') === harvesterState, 'unknown intent falls back');
assert(typeof aggressiveState.npc === 'string' && aggressiveState.npc.length > 0, 'npc directive present');

console.log('OK  telemetry + tactical director tests passed');
console.log(`    6-feature vector · ${INTENTS.length} intents · 3 atmosphere directives`);
