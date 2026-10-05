import * as THREE from 'three/webgpu';

const POOL = 10;
const TRACER_HOLD = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('tracerhold')) || 0 : 0;
const LIFE_MS = TRACER_HOLD > 0 ? TRACER_HOLD : 320;
const MAX_VIS_DIST = 150;
const START_AHEAD = 0.9;

function hash32(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function tracerGeometry() {
  const geo = new THREE.CylinderGeometry(0.07, 0.018, 1, 6, 1, true);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5;
    const c = 0.7 + 1.1 * y * y;
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createTracers(scene, vibe, seed) {
  const geo = tracerGeometry();

  const neon = vibe && vibe.neon ? vibe.neon : [0x7df9ff, 0xff2fb9, 0xffe066];
  const family = hash32(seed, seed ^ 0x51ed270b, seed) % neon.length;
  const baseColors = neon.map((hex) => new THREE.Color().setHex(hex));

  const state = Array.from({ length: POOL }, () => ({
    alive: false,
    t: 0,
    start: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    len: 0,
    color: new THREE.Color(),
    seq: 0
  }));

  const meshes = [];
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  let cursor = 0;
  let seq = 0;
  const right = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const unitY = new THREE.Vector3(0, 1, 0);

  function fire(origin, dir, hit) {
    const slot = state[cursor];
    cursor = (cursor + 1) % POOL;
    seq++;
    slot.alive = true;
    slot.t = performance.now();
    slot.seq = seq;
    slot.dir.copy(dir).normalize();
    slot.start.copy(origin).addScaledVector(slot.dir, START_AHEAD);
    right.crossVectors(slot.dir, Math.abs(slot.dir.y) > 0.99 ? axisZ : axisY).normalize();
    slot.start.addScaledVector(right, 0.14);
    const endDist = hit ? Math.hypot(hit[0] - origin.x, hit[1] - origin.y, hit[2] - origin.z) - START_AHEAD : 300;
    slot.len = Math.max(6, Math.min(MAX_VIS_DIST, endDist));
    const c = baseColors[(family + seq) % baseColors.length];
    const jitter = 0.9 + ((hash32(seq, family, seed) % 100) / 100) * 0.2;
    slot.color.setRGB(c.r * jitter, c.g * jitter, c.b * jitter);
  }

  function update(now, cameraPos, atmo) {
    for (let i = 0; i < POOL; i++) {
      const slot = state[i];
      const mesh = meshes[i];
      if (!slot.alive) {
        mesh.visible = false;
        continue;
      }
      const age = now - slot.t;
      if (age >= LIFE_MS) {
        slot.alive = false;
        mesh.visible = false;
        continue;
      }
      const k = age / LIFE_MS;
      const life = Math.pow(1 - k, 1.6);
      const dCam = cameraPos.distanceTo(slot.start);
      const lod = dCam < 70 ? 1 : Math.max(0, 1 - (dCam - 70) / 110);
      const total = (0.4 + 0.6 * life) * lod * atmo.tracer;
      const thin = 0.05 + 0.95 * life;
      mesh.visible = true;
      mesh.position.copy(slot.start).addScaledVector(slot.dir, slot.len / 2);
      mesh.quaternion.setFromUnitVectors(unitY, slot.dir);
      mesh.scale.set(thin, slot.len, thin);
      mesh.material.color.copy(slot.color).multiplyScalar(total);
    }
  }

  function dispose() {
    for (const mesh of meshes) {
      scene.remove(mesh);
      mesh.material.dispose();
    }
    geo.dispose();
  }

  function debug() {
    let alive = 0;
    let first = null;
    for (let i = 0; i < POOL; i++) {
      const s = state[i];
      if (!s.alive) continue;
      alive++;
      if (!first) {
        const m = meshes[i];
        first = {
          i,
          start: s.start.toArray().map((v) => Math.round(v * 100) / 100),
          dir: s.dir.toArray().map((v) => Math.round(v * 100) / 100),
          len: Math.round(s.len * 100) / 100,
          age: Math.round(performance.now() - s.t),
          m: m.position.toArray().map((v) => Math.round(v * 100) / 100),
          slotCol: s.color.toArray().map((v) => Math.round(v * 1000) / 1000),
          matCol: m.material.color.toArray().map((v) => Math.round(v * 1000) / 1000),
          vis: m.visible
        };
      }
    }
    return { alive, seq, lifeMs: LIFE_MS, first };
  }

  return { fire, update, dispose, debug, count: POOL };
}
