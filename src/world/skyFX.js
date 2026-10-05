import * as THREE from 'three/webgpu';
import { PLANET } from './planet.js';

const C = PLANET.center;
const R = PLANET.radius;
const CLOUD_R0 = 100;
const CLOUD_R1 = 118;
const CLUSTERS = 44;
const SHAFTS = 9;
const SHAFT_LEN = 44;
const DEG = Math.PI / 180;

function hash32(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rand01(a, b, seed) {
  return hash32(a, b, seed) / 4294967296;
}

function worldPos(lat, lon, r, out = new THREE.Vector3()) {
  const cl = Math.cos(lat);
  return out.set(C + cl * Math.cos(lon) * r, C + Math.sin(lat) * r, C + cl * Math.sin(lon) * r);
}

function columnRadius(voxels, size, ux, uy, uz) {
  const [cx, cy, cz] = [C, C, C];
  let r = R + 26;
  while (r > R - 4) {
    r -= 0.5;
    const x = Math.floor(cx + ux * r);
    const y = Math.floor(cy + uy * r);
    const z = Math.floor(cz + uz * r);
    if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) continue;
    if (voxels[x + size * (y + size * z)] !== 0) return r + 0.75;
  }
  return R + 1;
}

function shaftGeometry() {
  const geo = new THREE.BoxGeometry(1, 1, 1, 1, 6, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5;
    const c = 0.12 + 0.88 * y * y;
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createSkyFX(scene, voxels, seed) {
  const size = PLANET.size;
  const clusters = [];
  for (let i = 0; i < CLUSTERS; i++) {
    const lat = (rand01(i * 3 + 1, i * 7 + 5, seed) * 2 - 1) * 62 * DEG;
    const lon = rand01(i * 11 + 13, i * 17 + 19, seed) * Math.PI * 2;
    const r = CLOUD_R0 + rand01(i * 23 + 2, i * 29 + 4, seed) * (CLOUD_R1 - CLOUD_R0);
    const boxes = [];
    const n = 3 + Math.floor(rand01(i + 31, i + 41, seed) * 3);
    for (let b = 0; b < n; b++) {
      boxes.push({
        dLat: (rand01(i * 100 + b + 7, i + b * 3 + 1, seed) - 0.5) * 6 * DEG,
        dLon: (rand01(i * 100 + b + 17, i + b * 5 + 2, seed) - 0.5) * 6 * DEG,
        dr: (rand01(i * 100 + b + 27, i + b * 7 + 3, seed) - 0.5) * 3,
        sx: 7 + rand01(i * 100 + b + 37, i + b * 11 + 4, seed) * 11,
        sy: 1.6 + rand01(i * 100 + b + 47, i + b * 13 + 5, seed) * 2.4,
        sz: 7 + rand01(i * 100 + b + 57, i + b * 17 + 6, seed) * 11
      });
    }
    clusters.push({ lat, lon, r, boxes, drift: 0.0016 + rand01(i + 61, i + 71, seed) * 0.0022 });
  }

  const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf2f5fa });
  let cloudCount = 0;
  for (const cluster of clusters) cloudCount += cluster.boxes.length;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  clouds.frustumCulled = false;

  const anchors = [];
  let attempts = 0;
  while (anchors.length < SHAFTS && attempts < SHAFTS * 30) {
    attempts++;
    const lat = (rand01(attempts * 3 + 101, attempts * 5 + 103, seed) * 2 - 1) * 42 * DEG;
    const lon = rand01(attempts * 7 + 107, attempts * 11 + 109, seed) * Math.PI * 2;
    const cl = Math.cos(lat);
    const ux = cl * Math.cos(lon);
    const uy = Math.sin(lat);
    const uz = cl * Math.sin(lon);
    const sr = columnRadius(voxels, size, ux, uy, uz);
    anchors.push({ lat, lon, ux, uy, uz, r: sr });
  }

  const shaftGeo = shaftGeometry();
  const shaftMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const shafts = new THREE.InstancedMesh(shaftGeo, shaftMat, anchors.length);
  shafts.frustumCulled = false;
  shafts.renderOrder = 8;

  const poolGeo = new THREE.CircleGeometry(1, 22);
  const poolMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, anchors.length);
  pools.frustumCulled = false;
  pools.renderOrder = 7;

  scene.add(clouds, shafts, pools);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const quatSun = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const unitY = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const anchorPos = new THREE.Vector3();
  let shaftOpacity = 0;
  let poolOpacity = 0;

  function update(dt, now, sunPos, dn, atmo) {
    let idx = 0;
    for (const cluster of clusters) {
      cluster.lon += cluster.drift * dt;
      for (const box of cluster.boxes) {
        const lat = cluster.lat + box.dLat;
        const lon = cluster.lon + box.dLon;
        worldPos(lat, lon, cluster.r + box.dr, pos);
        radial.set(pos.x - C, pos.y - C, pos.z - C).normalize();
        quat.setFromUnitVectors(unitY, radial);
        scl.set(box.sx, box.sy, box.sz);
        m.compose(pos, quat, scl);
        clouds.setMatrixAt(idx, m);
        idx++;
      }
    }
    clouds.instanceMatrix.needsUpdate = true;

    const dayGate = Math.max(0, 1 - dn.night);
    const cloudL = 0.32 + 0.68 * dayGate;
    cloudMat.color.setRGB(0.95 * cloudL, 0.96 * cloudL, 0.99 * cloudL);
    const shaftTarget = dayGate * atmo.shaft * 0.5;
    const poolTarget = dayGate * atmo.shaft * 0.34;
    shaftOpacity += (shaftTarget - shaftOpacity) * Math.min(1, dt * 2);
    poolOpacity += (poolTarget - poolOpacity) * Math.min(1, dt * 2);
    shaftMat.opacity = shaftOpacity;
    poolMat.opacity = poolOpacity;
    shaftMat.color.copy(dn.sunColor);

    sunDir.set(sunPos.x, sunPos.y, sunPos.z).normalize();
    quatSun.setFromUnitVectors(unitY, sunDir);

    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      worldPos(a.lat, a.lon, a.r, anchorPos);
      pos.copy(anchorPos).addScaledVector(sunDir, SHAFT_LEN / 2);
      scl.set(5.5, SHAFT_LEN, 5.5);
      m.compose(pos, quatSun, scl);
      shafts.setMatrixAt(i, m);

      radial.set(anchorPos.x - C, anchorPos.y - C, anchorPos.z - C).normalize();
      pos.copy(anchorPos).addScaledVector(radial, 0.12);
      quat.setFromUnitVectors(unitY, radial);
      scl.setScalar(4.6);
      m.compose(pos, quat, scl);
      pools.setMatrixAt(i, m);
    }
    shafts.instanceMatrix.needsUpdate = true;
    pools.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(clouds, shafts, pools);
    cloudGeo.dispose();
    cloudMat.dispose();
    shaftGeo.dispose();
    shaftMat.dispose();
    poolGeo.dispose();
    poolMat.dispose();
  }

  return { update, dispose, cloudCount, shaftCount: anchors.length };
}
