import * as THREE from 'three/webgpu';
import './style.css';
import { PLANET, SUB_SIZE, planetIndex } from './world/planet.js';
import { makeTheme } from './world/theme.js';
import { BLOCK_NAMES } from './world/blocks.js';
import { raycastVoxels } from './world/voxelOps.js';
import { createChunkMaterial } from './render/chunkMaterial.js';
import { PlanetControls, BODY_HEIGHTS } from './player/planetControls.js';
import { loadPreset } from './game/weapons/loadout.js';
import {
  TELEMETRY_INTERVAL_MS,
  createTelemetryState,
  pushAimSample,
  pushPosition,
  noteAction,
  noteShot,
  accrueCombatTime,
  buildFeatureVector,
  resetWindow
} from './ai/telemetry.js';
import { intentFromLogits, directorState } from './ai/director.js';

const canvas = document.getElementById('view');
const hudStats = document.getElementById('hud-stats');
hudStats.textContent = 'initializing renderer…';

const params = new URLSearchParams(location.search);
let seed = Number.parseInt(params.get('seed') ?? '1337', 10);
if (!Number.isFinite(seed)) seed = 1337;

const DAY_LENGTH_MS = 180000;
const phaseOffset = Number.parseFloat(params.get('phase') ?? '0') || 0;
const dayStart = performance.now() - phaseOffset * DAY_LENGTH_MS;

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createRenderer() {
  let useWebGPU = false;
  if (navigator.gpu) {
    try {
      const adapter = await withTimeout(navigator.gpu.requestAdapter(), 3000, 'requestAdapter');
      useWebGPU = adapter !== null;
    } catch (err) {
      console.warn('WebGPU adapter probe failed:', err.message);
    }
  }

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: !useWebGPU });
  await withTimeout(renderer.init(), 15000, 'renderer.init');
  return renderer;
}

let renderer;
try {
  renderer = await createRenderer();
} catch (err) {
  hudStats.textContent = `renderer init failed: ${err.message}`;
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const backendName = renderer.backend?.isWebGPUBackend
  ? 'WebGPU'
  : renderer.backend?.isWebGLBackend
    ? 'WebGL2'
    : 'unknown';

const planetCenter = new THREE.Vector3(PLANET.center, PLANET.center, PLANET.center);

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x8fb8de);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(skyColor, 0.0045);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';

const sun = new THREE.DirectionalLight(0xfff2df, 3.0);
sun.position.set(80, 120, 40);
scene.add(sun);
const hemiLight = new THREE.HemisphereLight(0xcfe2ff, 0x6a5a44, 1.4);
scene.add(hemiLight);

const chunkMaterial = createChunkMaterial();

const chunkMeshes = new Map();
const chunkStats = new Map();
let opId = 0;
let lastBuild = null;
let theme = makeTheme(seed);
let voxelsMirror = null;
let weapon = loadPreset(1, seed);
let lastShotAt = -Infinity;
let shots = 0;
let hits = 0;
let voxelsRemoved = 0;
const RECOIL_CAMERA_SCALE = 0.12;
const SHOT_MAX_DIST = 300;
const TOOL_REACH = 9;
const CARRY_LIMIT = 10;
const HARVEST_COOLDOWN_MS = 130;
const PLACE_COOLDOWN_MS = 110;

const carry = { items: new Map(), total: 0, selected: 0 };
const pendingEdits = new Map();
const toolDir = new THREE.Vector3();
let toolBusy = false;
let nextHarvestAt = 0;
let nextPlaceAt = 0;

const worker = new Worker(new URL('./world/mesher.worker.js', import.meta.url), { type: 'module' });

function requestBuild(nextSeed) {
  seed = nextSeed;
  worker.postMessage({ type: 'build', id: ++opId, seed });
}

function chunkKey(i, j, k) {
  return `${i},${j},${k}`;
}

function upsertChunkMesh(chunk) {
  const key = chunkKey(chunk.i, chunk.j, chunk.k);
  const old = chunkMeshes.get(key);
  if (chunk.positions.length === 0) {
    if (old) {
      scene.remove(old);
      old.geometry.dispose();
      chunkMeshes.delete(key);
      chunkStats.delete(key);
    }
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(chunk.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(chunk.colors, 3));
  geometry.setAttribute('emissive', new THREE.BufferAttribute(chunk.emissives, 3));
  geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
  geometry.computeBoundingSphere();

  if (old) {
    scene.remove(old);
    old.geometry.dispose();
  }
  const mesh = new THREE.Mesh(geometry, chunkMaterial.material);
  mesh.position.set(chunk.i * SUB_SIZE - 1, chunk.j * SUB_SIZE - 1, chunk.k * SUB_SIZE - 1);
  scene.add(mesh);
  chunkMeshes.set(key, mesh);
  chunkStats.set(key, { quads: chunk.quads, faces: chunk.faces, verts: chunk.verts });
}

function worldTotals() {
  let quads = 0;
  let faces = 0;
  let verts = 0;
  for (const s of chunkStats.values()) {
    quads += s.quads;
    faces += s.faces;
    verts += s.verts;
  }
  return { quads, faces, verts };
}

const SKY_DAY = new THREE.Color(0x8fb8de);
const SKY_NIGHT = new THREE.Color(0x0a0f1e);
const SKY_DUSK = new THREE.Color(0xd98a5a);
const SUN_DAY = new THREE.Color(0xfff2df);
const MOON_COLOR = new THREE.Color(0x9fb6e8);

function applyTheme(next) {
  theme = next;
  SKY_DAY.setHex(theme.sky);
  SKY_NIGHT.setHex(theme.skyNight);
  SKY_DUSK.setHex(theme.dusk);
  SUN_DAY.setHex(theme.sun);
  MOON_COLOR.setHex(theme.moon);
  hemiLight.color.setHex(theme.hemiSky);
  hemiLight.groundColor.setHex(theme.hemiGround);
}

applyTheme(theme);

worker.onmessage = (event) => {
  const msg = event.data;

  if (msg.type === 'edit') {
    const resolve = pendingEdits.get(msg.op);
    pendingEdits.delete(msg.op);
    if (msg.ok && voxelsMirror) {
      if (msg.cleared) for (let n = 0; n < msg.cleared.length; n++) voxelsMirror[msg.cleared[n]] = 0;
      if (msg.set !== undefined) voxelsMirror[msg.set] = msg.material;
    }
    for (const chunk of msg.chunks) upsertChunkMesh(chunk);
    if (lastBuild) {
      const totals = worldTotals();
      lastBuild.quads = totals.quads;
      lastBuild.faces = totals.faces;
      lastBuild.verts = totals.verts;
      lastBuild.meshMs = msg.stats?.meshMs ?? lastBuild.meshMs;
    }
    resolve?.(msg);
    return;
  }

  if (msg.type !== 'built') return;

  if (msg.reason === 'shoot') {
    if (msg.hit) hits++;
    voxelsRemoved += msg.removed;
    if (voxelsMirror && msg.cleared) {
      for (let n = 0; n < msg.cleared.length; n++) voxelsMirror[msg.cleared[n]] = 0;
    }
  } else {
    for (const mesh of chunkMeshes.values()) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    chunkMeshes.clear();
    chunkStats.clear();
    voxelsMirror = msg.voxels;
    applyTheme(makeTheme(msg.seed));
    controls.respawn(msg.spawn);
  }

  for (const chunk of msg.chunks) upsertChunkMesh(chunk);

  const totals = worldTotals();
  lastBuild = {
    seed: msg.seed,
    themeName: theme.name,
    genMs: msg.stats.genMs ?? lastBuild?.genMs ?? 0,
    meshMs: msg.stats.meshMs ?? 0,
    quads: totals.quads,
    faces: totals.faces,
    verts: totals.verts
  };
};

worker.onerror = (err) => {
  hudStats.textContent = `worker error: ${err.message}`;
  console.error(err);
};

const controls = new PlanetControls(camera, canvas);
controls.setWorld({
  getVoxels: () => voxelsMirror,
  size: PLANET.size,
  center: planetCenter,
  radius: PLANET.radius
});

const telemetry = createTelemetryState();
const laya = {
  ready: false,
  error: null,
  logits: [0, 0, 0],
  intent: 'HARVESTER',
  margin: 0,
  latencyMs: 0,
  inferCount: 0,
  target: directorState('HARVESTER')
};
let samplingPaused = false;

const layaWorker = new Worker(new URL('./ai/laya-worker.js', import.meta.url), { type: 'module' });
layaWorker.postMessage({
  type: 'INIT',
  payload: { modelUrl: new URL('models/laya_tactical_int8.onnx', document.baseURI).href }
});

layaWorker.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'READY') {
    laya.ready = true;
  } else if (msg.type === 'ERROR') {
    laya.error = msg.error;
    console.warn('laya:', msg.error);
  } else if (msg.type === 'INTENT_RESULT') {
    laya.inferCount++;
    laya.logits = msg.logits;
    laya.latencyMs = msg.latencyMs;
    const intent = intentFromLogits(msg.logits);
    if (intent) {
      laya.intent = intent.name;
      laya.margin = intent.margin;
      laya.target = directorState(intent.name);
    }
  }
};

let lastTelemetryAt = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = now - lastTelemetryAt;
  lastTelemetryAt = now;
  if (samplingPaused) return;
  accrueCombatTime(telemetry, now, dt);
  pushPosition(telemetry, camera.position);
  const elevation = (camera.position.distanceTo(planetCenter) - PLANET.radius) / 24;
  const features = buildFeatureVector(telemetry, elevation);
  layaWorker.postMessage(
    { type: 'INFER_TELEMETRY', payload: { telemetryBuffer: features.buffer } },
    [features.buffer]
  );
  resetWindow(telemetry);
}, TELEMETRY_INTERVAL_MS);

controls.onAim = (dx, dy) => pushAimSample(telemetry, dx, dy);

function carryAdd(id) {
  if (id <= 0 || carry.total >= CARRY_LIMIT) return false;
  carry.items.set(id, (carry.items.get(id) ?? 0) + 1);
  carry.total++;
  if (!carry.selected) carry.selected = id;
  return true;
}

function carryTake(id) {
  const n = carry.items.get(id);
  if (!n) return false;
  if (n <= 1) carry.items.delete(id);
  else carry.items.set(id, n - 1);
  carry.total--;
  if (carry.selected === id && !carry.items.has(id)) {
    carry.selected = [...carry.items.keys()].sort((a, b) => a - b)[0] ?? 0;
  }
  return true;
}

function cycleCarry() {
  const ids = [...carry.items.keys()].sort((a, b) => a - b);
  if (ids.length === 0) {
    carry.selected = 0;
    return;
  }
  carry.selected = ids[(ids.indexOf(carry.selected) + 1) % ids.length];
}

function resetCarry() {
  carry.items.clear();
  carry.total = 0;
  carry.selected = 0;
}

function playerCells() {
  const up = camera.up;
  const cells = new Set();
  for (const h of [...BODY_HEIGHTS, 1.6]) {
    const x = Math.floor(controls.feet.x + up.x * h);
    const y = Math.floor(controls.feet.y + up.y * h);
    const z = Math.floor(controls.feet.z + up.z * h);
    cells.add(planetIndex(x, y, z));
  }
  return cells;
}

function toolRay() {
  const origin = camera.position;
  const dir = camera.getWorldDirection(toolDir);
  return raycastVoxels(
    voxelsMirror,
    PLANET.size,
    PLANET.size,
    PLANET.size,
    [origin.x, origin.y, origin.z],
    [dir.x, dir.y, dir.z],
    TOOL_REACH
  );
}

function requestEdit(type, payload) {
  const id = ++opId;
  return new Promise((resolve) => {
    pendingEdits.set(id, resolve);
    worker.postMessage({ type, id, ...payload });
  });
}

async function harvestNow() {
  if (toolBusy || !voxelsMirror || carry.total >= CARRY_LIMIT) return null;
  const hit = toolRay();
  if (!hit) return null;
  const idx = planetIndex(hit.x, hit.y, hit.z);
  if (voxelsMirror[idx] === 0) return null;
  toolBusy = true;
  try {
    const res = await requestEdit('harvest', { idx });
    if (res?.ok && carryAdd(res.material)) {
      noteAction(telemetry);
      return res;
    }
    return null;
  } finally {
    toolBusy = false;
  }
}

async function placeNow() {
  if (toolBusy || !voxelsMirror || carry.total <= 0 || !carry.selected) return null;
  const hit = toolRay();
  if (!hit) return null;
  const nx = hit.point[0] - (hit.x + 0.5);
  const ny = hit.point[1] - (hit.y + 0.5);
  const nz = hit.point[2] - (hit.z + 0.5);
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  let tx = hit.x;
  let ty = hit.y;
  let tz = hit.z;
  if (ax >= ay && ax >= az) tx += Math.sign(nx) || 1;
  else if (ay >= az) ty += Math.sign(ny) || 1;
  else tz += Math.sign(nz) || 1;
  if (tx < 0 || ty < 0 || tz < 0 || tx >= PLANET.size || ty >= PLANET.size || tz >= PLANET.size) {
    return null;
  }
  const idx = planetIndex(tx, ty, tz);
  if (voxelsMirror[idx] !== 0) return null;
  if (playerCells().has(idx)) return null;
  const material = carry.selected;
  toolBusy = true;
  try {
    const res = await requestEdit('place', { idx, material });
    if (res?.ok && carryTake(material)) {
      noteAction(telemetry);
      return res;
    }
    return null;
  } finally {
    toolBusy = false;
  }
}

async function toolTest() {
  const h = await harvestNow();
  const carried = carry.total;
  const p = h ? await placeNow() : null;
  return { h: !!h, p: !!p, carried, carry: carry.total };
}

function pollTools(now) {
  if (controls.keys.has('KeyE') && now >= nextHarvestAt) {
    nextHarvestAt = now + HARVEST_COOLDOWN_MS;
    harvestNow();
  }
  if (controls.keys.has('KeyQ') && now >= nextPlaceAt) {
    nextPlaceAt = now + PLACE_COOLDOWN_MS;
    placeNow();
  }
}

function shoot(now) {
  if (chunkMeshes.size === 0 || now - lastShotAt < weapon.fireIntervalMs) return;
  lastShotAt = now;
  shots++;
  noteShot(telemetry, now);

  const origin = camera.position;
  const dir = camera.getWorldDirection(new THREE.Vector3());

  worker.postMessage({
    type: 'shoot',
    id: ++opId,
    origin: [origin.x, origin.y, origin.z],
    dir: [dir.x, dir.y, dir.z],
    maxDist: SHOT_MAX_DIST,
    radius: weapon.voxelDestructionRadius
  });

  controls.addRecoil(
    weapon.recoil.vertical * RECOIL_CAMERA_SCALE,
    weapon.recoil.horizontal * RECOIL_CAMERA_SCALE * 2
  );
}

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !controls.locked) return;
  shoot(performance.now());
});

window.__engine = {
  shoot: () => shoot(performance.now()),
  pos: () => [camera.position.x, camera.position.y, camera.position.z],
  keys: () => [...controls.keys],
  stats: () => ({ shots, hits, voxelsRemoved, quads: lastBuild?.quads ?? 0 }),
  weapon: () => weapon,
  carry: () => ({
    total: carry.total,
    limit: CARRY_LIMIT,
    selected: carry.selected,
    items: [...carry.items.entries()]
  }),
  toolTest: () => toolTest(),
  planet: () => ({
    size: PLANET.size,
    radius: PLANET.radius,
    center: [PLANET.center, PLANET.center, PLANET.center],
    mode: 'gravity'
  }),
  dayPhase: () => dayNight(performance.now()).phase,
  laya: () => ({
    ready: laya.ready,
    error: laya.error,
    intent: laya.intent,
    logits: laya.logits,
    latencyMs: laya.latencyMs,
    inferCount: laya.inferCount
  }),
  inferSample: async (features) => {
    samplingPaused = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const buffer = new Float32Array(features).buffer;
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('inferSample timeout')), 10000);
        const handler = (event) => {
          if (event.data.type !== 'INTENT_RESULT') return;
          clearTimeout(timer);
          layaWorker.removeEventListener('message', handler);
          resolve(event.data);
        };
        layaWorker.addEventListener('message', handler);
        layaWorker.postMessage({ type: 'INFER_TELEMETRY', payload: { telemetryBuffer: buffer } }, [buffer]);
      });
      return { logits: result.logits, latencyMs: result.latencyMs };
    } finally {
      samplingPaused = false;
    }
  }
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyR') {
    shots = 0;
    hits = 0;
    voxelsRemoved = 0;
    resetCarry();
    noteAction(telemetry);
    requestBuild((Math.random() * 0xffffffff) >>> 0);
    weapon = loadPreset(weapon.index, seed);
    lastShotAt = -Infinity;
    return;
  }
  if (event.code === 'KeyX' && !event.repeat) {
    cycleCarry();
    return;
  }
  const presetIndex = Number(event.key);
  if (presetIndex >= 1 && presetIndex <= 3) {
    weapon = loadPreset(presetIndex, seed);
    lastShotAt = -Infinity;
    noteAction(telemetry);
  }
});

let fps = 60;
let lastFrame = performance.now();
let lastHud = 0;

const skyBlend = new THREE.Color();
const sunBlend = new THREE.Color();
const layaSkyColor = new THREE.Color();
const sunPosTarget = new THREE.Vector3();

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function dayNight(now) {
  const phase = ((((now - dayStart) / DAY_LENGTH_MS) % 1) + 1) % 1;
  const a = phase * Math.PI * 2;
  const sunEl = Math.sin(a);
  const night = clamp01((0.15 - sunEl) / 0.5);
  const dusk = Math.exp(-((sunEl - 0.02) * (sunEl - 0.02)) / 0.01);
  const dayFactor = Math.max(0, sunEl);

  skyBlend.copy(SKY_NIGHT).lerp(SKY_DAY, 1 - night);
  skyBlend.lerp(SKY_DUSK, dusk * 0.55 * (1 - night * 0.7));

  sunPosTarget.set(Math.cos(a) * 120, sunEl * 140, 60);
  if (sunEl < 0) sunPosTarget.multiplyScalar(-1);

  return {
    phase,
    night,
    sunPos: sunPosTarget,
    sunColor: sunBlend.copy(MOON_COLOR).lerp(SUN_DAY, dayFactor),
    sunIntensity: 3.0 * dayFactor + 0.4 * night,
    hemi: 1.4 * dayFactor + 0.35 * night + 0.12,
    sky: skyBlend
  };
}

function applyAtmosphere(dt, now) {
  const dn = dayNight(now);
  const t = 1 - Math.exp(-1.6 * dt);
  const target = laya.target;

  layaSkyColor.setHex(target.sky);
  const sky = skyBlend.lerp(layaSkyColor, 0.35);

  scene.fog.density += (target.fog * (1 + 0.5 * dn.night) - scene.fog.density) * t;
  scene.fog.color.lerp(sky, t);
  skyColor.lerp(sky, t);
  sun.intensity += (dn.sunIntensity * (target.sun / 3.0) - sun.intensity) * t;
  sun.color.lerp(dn.sunColor, t);
  sun.position.lerp(dn.sunPos, t);
  hemiLight.intensity += (dn.hemi * (target.hemi / 1.4) - hemiLight.intensity) * t;
  chunkMaterial.nightGlow.value += (0.15 + 0.85 * dn.night - chunkMaterial.nightGlow.value) * t;

  return dn;
}

function clockFromPhase(phase) {
  const total = (phase * 24 + 6) % 24;
  const hh = Math.floor(total);
  const mm = Math.floor((total - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.08;

  controls.update(dt);
  pollTools(now);
  const dn = applyAtmosphere(dt, now);
  renderer.render(scene, camera);

  if (now - lastHud > 200) {
    lastHud = now;
    const clock = clockFromPhase(dn.phase) + (dn.night > 0.5 ? ' night' : dn.night > 0.1 ? ' dusk' : '');
    const build = lastBuild
      ? `seed ${lastBuild.seed} · ${lastBuild.themeName} · ${clock} · gen ${lastBuild.genMs.toFixed(1)}ms · ` +
        `mesh ${lastBuild.meshMs.toFixed(1)}ms · ${lastBuild.faces.toLocaleString()} faces`
      : `building planet… seed ${seed}`;
    const carryLabel = carry.total > 0 && carry.selected ? BLOCK_NAMES[carry.selected] ?? 'block' : 'empty';
    const gun =
      `${weapon.displayName} · ${weapon.name} · dmg ${weapon.damage.toFixed(1)} · ` +
      `${weapon.fireRateRPM.toFixed(0)} rpm · ` +
      `recoil V${weapon.recoil.vertical.toFixed(2)}/H${weapon.recoil.horizontal.toFixed(2)} · ` +
      `weight ${weapon.weight.toFixed(1)}kg · r ${weapon.voxelDestructionRadius.toFixed(2)}m\n` +
      `shots ${shots}/${hits} · voxels removed ${voxelsRemoved.toLocaleString()} · ` +
      `carry ${carry.total}/${CARRY_LIMIT} ${carryLabel}`;
    const ai = laya.error
      ? `laya ERROR: ${laya.error}`
      : `laya ${laya.ready ? 'ready' : 'loading…'} · intent ${laya.intent} · margin ${laya.margin.toFixed(2)} · ` +
        `${laya.latencyMs.toFixed(1)}ms · ${laya.inferCount} inferences`;
    hudStats.textContent =
      `${backendName} · ${fps.toFixed(0)} fps · planet r${PLANET.radius} · ` +
      (lastBuild
        ? `${lastBuild.quads.toLocaleString()} quads · ${chunkMeshes.size} sub-chunks\n${build}\n`
        : `building planet… seed ${seed}\n`) +
      `${gun}\n${ai}`;
  }
});

requestBuild(seed);
