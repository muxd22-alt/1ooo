export const TELEMETRY_INTERVAL_MS = 100;
export const WINDOW_TICKS = 50;
export const COMBAT_WINDOW_MS = 3000;

export function createTelemetryState() {
  return {
    aimSamples: [],
    actionCount: 0,
    positions: [],
    timeMiningMs: 0,
    timeCombatMs: 0,
    combatUntil: 0
  };
}

export function stdDeviation(samples) {
  if (samples.length === 0) return 0;
  const mean = samples.reduce((sum, n) => sum + n, 0) / samples.length;
  return Math.sqrt(samples.reduce((sq, n) => sq + (n - mean) ** 2, 0) / samples.length);
}

export function meanTravelDistance(positions) {
  if (positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1];
    const b = positions[i];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total / positions.length;
}

export function pushAimSample(state, dx, dy) {
  state.aimSamples.push(Math.hypot(dx, dy));
  if (state.aimSamples.length > WINDOW_TICKS) state.aimSamples.shift();
}

export function pushPosition(state, position) {
  state.positions.push({ x: position.x, y: position.y, z: position.z });
  if (state.positions.length > WINDOW_TICKS + 1) state.positions.shift();
}

export function noteAction(state) {
  state.actionCount++;
}

export function noteShot(state, now) {
  state.actionCount++;
  state.combatUntil = now + COMBAT_WINDOW_MS;
}

export function accrueCombatTime(state, now, dtMs) {
  if (now < state.combatUntil) state.timeCombatMs += dtMs;
}

export function buildFeatureVector(state, elevation) {
  const sigmaAim = stdDeviation(state.aimSamples);
  const apm = state.actionCount * 12;
  const varV = meanTravelDistance(state.positions);
  const mineRatio = state.timeMiningMs / Math.max(1, state.timeCombatMs);
  const elevBias = Math.min(1, Math.max(0, elevation));
  return new Float32Array([sigmaAim, apm, varV, mineRatio, elevBias, 0]);
}

export function resetWindow(state) {
  state.actionCount = 0;
  state.aimSamples = [];
}
