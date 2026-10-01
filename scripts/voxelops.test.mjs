import { raycastVoxels, subtractSphere } from '../src/world/voxelOps.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const N = 10;
const SIZE = N * N * N;
const idx = (x, y, z) => x + N * (y + N * z);

function filledGrid(solid = 3) {
  const voxels = new Uint8Array(SIZE);
  voxels.fill(solid);
  return voxels;
}

const SOLID = 3;
const OPEN = 5;

{
  const voxels = filledGrid(SOLID);
  const hit = raycastVoxels(voxels, N, N, N, [-5, 5.5, 5.5], [1, 0, 0], 100);
  assert(hit !== null, 'ray into solid grid hits');
  assert(hit.x === 0 && hit.y === 5 && hit.z === 5, `hit voxel (got ${hit.x},${hit.y},${hit.z})`);
  assert(Math.abs(hit.distance - 5) < 1e-3, `entry distance (got ${hit.distance})`);
  assert(hit.block === SOLID, 'hit block id');
}

{
  const voxels = filledGrid(SOLID);
  const hit = raycastVoxels(voxels, N, N, N, [-5, 5.5, 5.5], [1, 0, 0], 3);
  assert(hit === null, 'maxDist respected');
}

{
  const voxels = filledGrid(SOLID);
  const hit = raycastVoxels(voxels, N, N, N, [2.5, 2.5, 2.5], [0, 1, 0], 100);
  assert(hit !== null && hit.x === 2 && hit.y === 2 && hit.z === 2, 'origin inside solid hits immediately');
  assert(hit.distance < 1e-3, `immediate hit distance (got ${hit.distance})`);
}

{
  const voxels = filledGrid(SOLID);
  for (let x = 0; x <= 6; x++) voxels[idx(x, 5, 5)] = 0;
  const hit = raycastVoxels(voxels, N, N, N, [-5, 5.5, 5.5], [1, 0, 0], 100);
  assert(hit !== null && hit.x === 7, `tunnel traversal (got ${hit && hit.x})`);
  assert(Math.abs(hit.distance - 12) < 1e-3, `tunnel distance (got ${hit.distance})`);
  assert(Math.abs(hit.point[0] - 7) < 1e-3, `hit point on near face (got ${hit.point[0]})`);
}

{
  const voxels = filledGrid(SOLID);
  const hit = raycastVoxels(voxels, N, N, N, [5.5, 60, 5.5], [0, -1, 0], 100);
  assert(hit !== null && hit.y === 9, `ray from above hits roof (got ${hit && hit.y})`);
}

{
  const voxels = filledGrid(0);
  const hit = raycastVoxels(voxels, N, N, N, [-5, 5.5, 5.5], [1, 0, 0], 100);
  assert(hit === null, 'empty grid misses');
}

{
  const voxels = filledGrid(SOLID);
  const miss = raycastVoxels(voxels, N, N, N, [-5, 5.5, 5.5], [-1, 0, 0], 100);
  assert(miss === null, 'ray pointing away misses');
}

{
  const voxels = filledGrid(SOLID);
  const inv = 1 / Math.sqrt(3);
  const hit = raycastVoxels(voxels, N, N, N, [-1, -1, -1], [inv, inv, inv], 100);
  assert(hit !== null && hit.x === 0 && hit.y === 0 && hit.z === 0, 'diagonal entry corner voxel');
  assert(Math.abs(hit.distance - Math.sqrt(3)) < 1e-3, `diagonal distance (got ${hit.distance})`);
}

{
  const voxels = filledGrid(SOLID);
  const removed = subtractSphere(voxels, N, N, N, [5.5, 5.5, 5.5], 0.4);
  assert(removed === 1, `small sphere removes exactly 1 voxel (got ${removed})`);
  assert(voxels[idx(5, 5, 5)] === 0, 'center voxel cleared');
}

{
  const voxels = filledGrid(SOLID);
  const removed = subtractSphere(voxels, N, N, N, [5.5, 5.5, 5.5], 1.1);
  assert(removed === 7, `face-neighbour sphere removes 7 voxels (got ${removed})`);
}

{
  const voxels = filledGrid(SOLID);
  voxels[idx(4, 5, 5)] = 0;
  const removed = subtractSphere(voxels, N, N, N, [5.5, 5.5, 5.5], 1.1);
  assert(removed === 6, `air voxels not re-counted (got ${removed})`);
}

{
  const voxels = filledGrid(SOLID);
  const removed = subtractSphere(voxels, N, N, N, [5.5, 5.5, 5.5], 0);
  assert(removed === 0, 'zero radius removes nothing');
  assert(voxels.every((v) => v === SOLID), 'grid untouched by zero radius');
}

{
  const voxels = filledGrid(SOLID);
  const removed = subtractSphere(voxels, N, N, N, [5.5, 5.5, 5.5], 50);
  assert(removed === SIZE, `oversized sphere clamps to whole grid (got ${removed})`);
}

console.log('OK  raycast + sphere destruction tests passed');
