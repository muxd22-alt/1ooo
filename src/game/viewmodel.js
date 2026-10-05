import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SLOTS = ['', 'ar', 'smg', 'dmr'];
const MODEL_YAW = Math.PI;
const TARGET_LEN = 0.55;
const BASE_POS = new THREE.Vector3(0.26, -0.27, -0.5);
const BASE_ROT = new THREE.Euler(-0.04, -0.1, 0.015);
const FLASH_HOLD = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('flashhold')) || 0 : 0;
const FLASH_MS = FLASH_HOLD > 0 ? FLASH_HOLD : 90;
const SPARK_COUNT = 10;
const SPARK_MS = 0.18;
const CANARY = typeof location !== 'undefined' && location.search.includes('canary');

function makeFlashGeometry() {
  const spikes = 8;
  const n = spikes * 2;
  const verts = [0, 0, 0];
  const normals = [0, 0, 1];
  const uvs = [0.5, 0.5];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.5 : 0.18;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    verts.push(x, y, 0);
    normals.push(0, 0, 1);
    uvs.push(x + 0.5, y + 0.5);
  }
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  return geo;
}

function tintMaterials(root, accent) {
  const target = new THREE.Color(accent);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone();
      mat.color.copy(mat.userData.baseColor).lerp(target, 0.38);
      if (mat.emissive) {
        mat.emissive.copy(target);
        mat.emissiveIntensity = 0.16;
      }
    }
  });
}

export async function createViewmodel(camera, vibe) {
  const res = await fetch('models/manifest.json');
  const manifest = await res.json();
  const names = Array.isArray(manifest.guns) ? manifest.guns : [];
  if (!names.length) throw new Error('manifest has no guns');

  const texLoader = new THREE.TextureLoader();
  const sparkTex = await texLoader.loadAsync('tex/spark.png');
  sparkTex.colorSpace = THREE.SRGBColorSpace;

  const rig = new THREE.Group();
  rig.position.copy(BASE_POS);
  rig.rotation.copy(BASE_ROT);
  camera.add(rig);

  const loader = new GLTFLoader();
  const holders = new Map();

  for (const name of names) {
    const gltf = await loader.loadAsync(`models/guns/${name}.glb`);
    const root = gltf.scene;
    root.rotation.y = MODEL_YAW;
    root.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = TARGET_LEN / Math.max(size.z, 0.01);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());

    const holder = new THREE.Group();
    holder.add(root);

    const flashMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    if (CANARY) {
      flashMat.color.setRGB(0, 1, 0);
    }
    const flash = new THREE.Mesh(makeFlashGeometry(), flashMat);
    flash.frustumCulled = false;
    flash.scale.setScalar(0.22);
    flash.renderOrder = 50;
    flash.position.set(center.x, center.y, box.min.z - 0.05);
    holder.add(flash);

    const light = new THREE.PointLight(0xffffff, 0, 3.5, 2);
    light.position.copy(flash.position);
    holder.add(light);

    const sparkMat = new THREE.MeshBasicMaterial({
      map: sparkTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const sparks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sparkMat, SPARK_COUNT);
    sparks.frustumCulled = false;
    sparks.renderOrder = 51;
    sparks.position.copy(flash.position);
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    holder.add(sparks);

    holder.visible = false;
    rig.add(holder);
    holders.set(name, { holder, flashMat, flash, light, sparks, sparkMat, boxCenter: center.toArray(), boxSize: size.toArray() });
  }

  const sparkState = Array.from({ length: SPARK_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0
  }));

  let slot = 1;
  let kick = 0;
  let flashT = 0;
  let holdLight = false;
  let bobPhase = 0;
  let speedSmooth = 0;
  const lastPos = new THREE.Vector3().copy(camera.position);
  const sparkMatrix = new THREE.Matrix4();
  const sparkQuat = new THREE.Quaternion();
  const sparkScale = new THREE.Vector3();
  const sparkPos = new THREE.Vector3();

  function active() {
    return holders.get(SLOTS[slot]);
  }

  function setWeapon(index) {
    if (index < 1 || index >= SLOTS.length) return;
    for (const [name, entry] of holders) entry.holder.visible = name === SLOTS[index];
    slot = index;
    kick = Math.max(kick, 0.55);
  }

  function setVibe(next) {
    for (const [name, entry] of holders) {
      const i = Math.max(1, SLOTS.indexOf(name)) - 1;
      const accent = next.neon[i % next.neon.length];
      if (CANARY) {
        entry.flashMat.color.setRGB(0, 1, 0);
        entry.sparks.visible = false;
      } else {
        entry.flashMat.color.setHex(next.flash).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.5);
        entry.sparkMat.color.setHex(next.flash).multiplyScalar(1.6);
      }
      entry.light.color.setHex(next.flash);
      const holder = entry.holder;
      holder.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o === entry.flash) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if (!mat.userData.baseColor) continue;
          mat.color.copy(mat.userData.baseColor).lerp(new THREE.Color(accent), 0.38);
          if (mat.emissive) {
            mat.emissive.setHex(accent);
            mat.emissiveIntensity = 0.16;
          }
        }
      });
    }
  }

  function fire() {
    kick = Math.min(1, kick + 0.9);
    flashT = FLASH_MS;
    const entry = active();
    if (entry) {
      for (const s of sparkState) {
        s.x = 0;
        s.y = 0;
        s.z = 0;
        s.vx = (Math.random() - 0.5) * 1.6;
        s.vy = (Math.random() - 0.5) * 1.6;
        s.vz = -(2.2 + Math.random() * 2.4);
        s.life = SPARK_MS * (0.6 + Math.random() * 0.6);
      }
    }
  }

  function update(dt) {
    const pos = new THREE.Vector3().copy(camera.position);
    const dist = pos.distanceTo(lastPos);
    lastPos.copy(pos);
    const speed = dt > 0 ? dist / dt : 0;
    speedSmooth += (speed - speedSmooth) * Math.min(1, dt * 8);

    const move = Math.min(1, speedSmooth / 4.5);
    bobPhase += dt * (2.5 + speedSmooth * 1.4);
    const bobY = Math.sin(bobPhase * 2) * 0.011 * move;
    const bobX = Math.cos(bobPhase) * 0.009 * move;

    kick = Math.max(0, kick - dt * 8.5);
    const kickE = kick * kick;
    rig.position.set(BASE_POS.x + bobX, BASE_POS.y + bobY, BASE_POS.z + kickE * 0.055);
    rig.rotation.set(BASE_ROT.x + kickE * 0.15, BASE_ROT.y - bobX * 0.5, BASE_ROT.z + bobX * 0.3);

    const entry = active();
    if (!entry) return;

    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt * 1000);
      const r = Math.min(1, flashT / FLASH_MS);
      entry.flashMat.opacity = CANARY ? 1 : Math.min(1, r * 1.3);
      entry.flash.scale.setScalar(0.16 + (1 - r) * 0.1);
      entry.flash.rotation.z = Math.random() * Math.PI;
      entry.light.intensity = holdLight ? 0 : 2.2 * r * r;
    } else if (entry.light.intensity !== 0) {
      entry.flashMat.opacity = 0;
      entry.light.intensity = 0;
    }

    let anyAlive = false;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = sparkState[i];
      if (s.life > 0) {
        anyAlive = true;
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vy -= 5 * dt;
        const k = Math.max(0, s.life / SPARK_MS);
        sparkPos.set(s.x, s.y, s.z);
        sparkScale.setScalar(0.02 * k + 0.004);
        sparkMatrix.compose(sparkPos, sparkQuat, sparkScale);
      } else {
        sparkScale.setScalar(0);
        sparkMatrix.compose(sparkPos.set(0, 0, -9), sparkQuat, sparkScale);
      }
      entry.sparks.setMatrixAt(i, sparkMatrix);
    }
    if (anyAlive || entry.sparks.count) entry.sparks.instanceMatrix.needsUpdate = true;
  }

  setWeapon(1);
  if (vibe) setVibe(vibe);

  function poke(state) {
    const e = active();
    if (!e) return false;
    if (state.force) {
      flashT = 1e9;
      holdLight = true;
      e.flashMat.color.set(state.force);
      e.flashMat.opacity = 1;
      e.flash.scale.setScalar(0.4);
    }
    if (state.plane) {
      const g = new THREE.PlaneGeometry(1, 1);
      e.flash.geometry.dispose();
      e.flash.geometry = g;
    }
    if (state.inst) {
      const m = new THREE.InstancedMesh(e.flash.geometry, e.flashMat, 1);
      m.position.copy(e.flash.position);
      m.renderOrder = 50;
      m.frustumCulled = false;
      m.setMatrixAt(0, new THREE.Matrix4());
      m.instanceMatrix.needsUpdate = true;
      e.holder.add(m);
      e.flash.visible = false;
    }
    if (state.plain) {
      e.flash.material = new THREE.MeshBasicMaterial({
        color: state.plain,
        transparent: true,
        opacity: 1,
        depthTest: false,
        side: THREE.DoubleSide
      });
    }
    return true;
  }

  function debug() {
    const e = active();
    if (!e) return null;
    const f = camera.worldToLocal(e.flash.getWorldPosition(new THREE.Vector3()));
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    return {
      opacity: e.flashMat.opacity,
      flashT,
      holderVisible: e.holder.visible,
      scale: e.flash.scale.x,
      flashCam: [+f.x.toFixed(2), +f.y.toFixed(2), +f.z.toFixed(2)],
      camFwd: [+fwd.x.toFixed(2), +fwd.y.toFixed(2), +fwd.z.toFixed(2)],
      light: e.light.intensity,
      fcol: e.flashMat.color.getHexString(),
      fvis: e.flash.visible,
      sparksVis: e.sparks.visible
    };
  }

  return { setWeapon, setVibe, fire, update, debug, poke, count: holders.size, get slot() { return slot; } };
}
