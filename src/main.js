import * as THREE from 'three/webgpu';
import './style.css';
import { CHUNK } from './world/blocks.js';
import { createChunkMaterial } from './render/chunkMaterial.js';
import { FlyControls } from './player/flyControls.js';
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

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0x8fb8de);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(skyColor, 0.005);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';

const sun = new THREE.DirectionalLight(0xfff2df, 3.0);
sun.position.set(80, 120, 40);
scene.add(sun);
const hemiLight = new THREE.HemisphereLight(0xcfe2ff, 0x6a5a44, 1.4);
scene.add(hemiLight);

const chunkMaterial = createChunkMaterial();

let chunkMesh = null;
let opId = 0;
let lastBuild = null;
let weapon = loadPreset(1);
let lastShotAt = -Infinity;
let shots = 0;
let hits = 0;
let voxelsRemoved = 0;
const RECOIL_CAMERA_SCALE = 0.12;
const SHOT_MAX_DIST = 300;

const worker = new Worker(new URL('./world/mesher.worker.js', import.meta.url), { type: 'module' });

function requestBuild(nextSeed) {
  seed = nextSeed;
  worker.postMessage({ type: 'build', id: ++opId, seed });
}

worker.onmessage = (event) => {
  const msg = event.data;
  if (msg.type !== 'built') return;

  if (msg.reason === 'shoot') {
    if (msg.hit) hits++;
    voxelsRemoved += msg.removed;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(msg.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(msg.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(msg.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  geometry.computeBoundingSphere();

  if (chunkMesh) {
    scene.remove(chunkMesh);
    chunkMesh.geometry.dispose();
  }
  chunkMesh = new THREE.Mesh(geometry, chunkMaterial);
  scene.add(chunkMesh);

  if (msg.reason === 'build') camera.position.set(msg.spawn.x, msg.spawn.y, msg.spawn.z);

  lastBuild = { seed: msg.seed, genMs: lastBuild?.genMs ?? 0, ...msg.stats };
};

worker.onerror = (err) => {
  hudStats.textContent = `worker error: ${err.message}`;
  console.error(err);
};

const controls = new FlyControls(camera, canvas);

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
  const features = buildFeatureVector(telemetry, camera.position.y / CHUNK.y);
  layaWorker.postMessage(
    { type: 'INFER_TELEMETRY', payload: { telemetryBuffer: features.buffer } },
    [features.buffer]
  );
  resetWindow(telemetry);
}, TELEMETRY_INTERVAL_MS);

controls.onAim = (dx, dy) => pushAimSample(telemetry, dx, dy);

function shoot(now) {
  if (!chunkMesh || now - lastShotAt < weapon.fireIntervalMs) return;
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
  stats: () => ({ shots, hits, voxelsRemoved, quads: lastBuild?.quads ?? 0 }),
  weapon: () => weapon,
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
    noteAction(telemetry);
    requestBuild((Math.random() * 0xffffffff) >>> 0);
    return;
  }
  const presetIndex = Number(event.key);
  if (presetIndex >= 1 && presetIndex <= 3) {
    weapon = loadPreset(presetIndex);
    lastShotAt = -Infinity;
    noteAction(telemetry);
  }
});

let fps = 60;
let lastFrame = performance.now();
let lastHud = 0;
const atmoColor = new THREE.Color();

function applyAtmosphere(dt) {
  const t = 1 - Math.exp(-1.6 * dt);
  const target = laya.target;
  scene.fog.density += (target.fog - scene.fog.density) * t;
  scene.fog.color.lerp(atmoColor.setHex(target.sky), t);
  skyColor.lerp(atmoColor.setHex(target.sky), t);
  sun.intensity += (target.sun - sun.intensity) * t;
  hemiLight.intensity += (target.hemi - hemiLight.intensity) * t;
}

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.08;

  controls.update(dt);
  applyAtmosphere(dt);
  renderer.render(scene, camera);

  if (now - lastHud > 200) {
    lastHud = now;
    const build = lastBuild
      ? `seed ${lastBuild.seed} · gen ${lastBuild.genMs.toFixed(1)}ms · mesh ${lastBuild.meshMs.toFixed(1)}ms · ` +
        `${lastBuild.quads.toLocaleString()} quads · ${lastBuild.faces.toLocaleString()} faces`
      : 'building chunk…';
    const gun =
      `${weapon.name} [${weapon.partIds.map((id) => id.replace('part_', '')).join(' + ')}] · ` +
      `dmg ${weapon.damage.toFixed(1)} · ${weapon.fireRateRPM.toFixed(0)} rpm · ` +
      `recoil V${weapon.recoil.vertical.toFixed(2)}/H${weapon.recoil.horizontal.toFixed(2)} · ` +
      `weight ${weapon.weight.toFixed(1)}kg · r ${weapon.voxelDestructionRadius.toFixed(2)}m\n` +
      `shots ${shots}/${hits} · voxels removed ${voxelsRemoved.toLocaleString()}`;
    const ai = laya.error
      ? `laya ERROR: ${laya.error}`
      : `laya ${laya.ready ? 'ready' : 'loading…'} · intent ${laya.intent} · margin ${laya.margin.toFixed(2)} · ` +
        `${laya.latencyMs.toFixed(1)}ms · ${laya.inferCount} inferences`;
    hudStats.textContent =
      `${backendName} · ${fps.toFixed(0)} fps · chunk ${CHUNK.x}x${CHUNK.y}x${CHUNK.z}\n` +
      `${build}\n${gun}\n${ai}`;
  }
});

requestBuild(seed);
