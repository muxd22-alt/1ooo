import * as THREE from 'three/webgpu';
import { BLOCK } from './blocks.js';
import { PLANET } from './planet.js';

const SAMPLE_STRIDE = 4;
const MAX_INSTANCES = 4000;
const SHELL_PAD = 3;

function hash32(x, y, z, seed) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (z | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return h >>> 0;
}

export function sampleGrass(voxels, size, center, radius, seed, limit = MAX_INSTANCES) {
  const [cx, cy, cz] = center;
  const rIn = radius - SHELL_PAD;
  const rOut = radius + PLANET.maxStruct + SHELL_PAD;
  const rIn2 = rIn * rIn;
  const rOut2 = rOut * rOut;
  const at = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size ? 0 : voxels[x + size * (y + size * z)];
  const out = [];
  for (let z = 0; z < size && out.length < limit; z++) {
    const dz = z + 0.5 - cz;
    const dz2 = dz * dz;
    for (let y = 0; y < size && out.length < limit; y++) {
      const dy = y + 0.5 - cy;
      const dzy = dz2 + dy * dy;
      if (dzy > rOut2) continue;
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const r2 = dzy + dx * dx;
        if (r2 < rIn2 || r2 > rOut2) continue;
        if (voxels[x + size * (y + size * z)] !== BLOCK.GRASS) continue;
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const az = Math.abs(dz);
        let nx = x;
        let ny = y;
        let nz = z;
        if (ax >= ay && ax >= az) nx += Math.sign(dx) || 1;
        else if (ay >= az) ny += Math.sign(dy) || 1;
        else nz += Math.sign(dz) || 1;
        if (at(nx, ny, nz) !== 0) continue;
        const h = hash32(x, y, z, seed);
        if (h % SAMPLE_STRIDE !== 0) continue;
        const r = Math.sqrt(r2);
        out.push({
          x: x + 0.5,
          y: y + 0.5,
          z: z + 0.5,
          ux: dx / r,
          uy: dy / r,
          uz: dz / r,
          scale: 0.6 + ((h >>> 8) % 1000) / 1000 * 0.55,
          yaw: ((h >>> 16) % 1024) / 1024 * Math.PI * 2
        });
      }
    }
  }
  return out;
}

function bladeGeometry() {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const HALF = 0.21;
  for (let q = 0; q < 3; q++) {
    const a = (q / 3) * Math.PI;
    const ox = Math.cos(a) * HALF;
    const oz = Math.sin(a) * HALF;
    const base = q * 4;
    positions.push(-ox, 0, -oz, ox, 0, oz, ox, 0.42, oz, -ox, 0.42, -oz);
    for (let k = 0; k < 4; k++) normals.push(0, 1, 0);
    colors.push(0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 1, 1, 1, 1, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

const sharedGeo = { value: null };

export function createGrassField(scene, voxels, colorHex, seed) {
  if (!voxels) return null;
  const samples = sampleGrass(voxels, PLANET.size, [PLANET.center, PLANET.center, PLANET.center], PLANET.radius, seed);
  if (!samples.length) return null;
  if (!sharedGeo.value) sharedGeo.value = bladeGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.InstancedMesh(sharedGeo.value, material, samples.length);
  mesh.frustumCulled = false;
  const up = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const qAlign = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const unitY = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    up.set(s.ux, s.uy, s.uz);
    pos.set(s.x + s.ux * 0.47, s.y + s.uy * 0.47, s.z + s.uz * 0.47);
    qYaw.setFromAxisAngle(unitY, s.yaw);
    qAlign.setFromUnitVectors(unitY, up);
    quat.multiplyQuaternions(qAlign, qYaw);
    scl.setScalar(s.scale);
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'grass';
  scene.add(mesh);
  return {
    count: samples.length,
    mesh,
    dispose() {
      scene.remove(mesh);
      mesh.material.dispose();
    }
  };
}
