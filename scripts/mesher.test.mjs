import { CHUNK, BLOCK, BLOCK_PALETTE, voxelIndex } from '../src/world/blocks.js';
import { generateChunk } from '../src/world/terrain.js';
import { greedyMesh } from '../src/world/greedyMesher.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function bruteForceFaces(voxels) {
  const sx = CHUNK.x;
  const sy = CHUNK.y;
  const sz = CHUNK.z;
  const counts = new Map();
  const at = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : voxels[voxelIndex(x, y, z)];

  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const m = at(x, y, z);
        if (m === 0) continue;
        const neighbours = [
          [x + 1, y, z, 0, 1],
          [x - 1, y, z, 0, -1],
          [x, y + 1, z, 1, 1],
          [x, y - 1, z, 1, -1],
          [x, y, z + 1, 2, 1],
          [x, y, z - 1, 2, -1]
        ];
        for (const [nx, ny, nz, axis, dir] of neighbours) {
          if (at(nx, ny, nz) !== 0) continue;
          const key = `${axis}:${dir}:${m}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

function meshQuadAreas(mesh) {
  const counts = new Map();
  const { positions, normals, colors, indices } = mesh;

  const paletteLookup = new Map();
  for (const [id, rgb] of Object.entries(BLOCK_PALETTE)) {
    paletteLookup.set(rgb.map((c) => Math.round(c * 255)).join(','), Number(id));
  }

  for (let i = 0; i < indices.length; i += 6) {
    const unique = [...new Set([indices[i], indices[i + 1], indices[i + 2], indices[i + 3], indices[i + 4], indices[i + 5]])];
    assert(unique.length === 4, `quad ${i / 6} does not have 4 corners`);

    const extent = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const vi of unique) {
        const p = positions[vi * 3 + axis];
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
      extent[axis] = hi - lo;
    }
    const nonzero = extent.filter((e) => e > 1e-9);
    assert(nonzero.length === 2, `quad ${i / 6} is not axis-aligned planar`);
    const area = nonzero[0] * nonzero[1];

    const n = [normals[unique[0] * 3], normals[unique[0] * 3 + 1], normals[unique[0] * 3 + 2]];
    const axis = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
    const dir = n[axis] > 0 ? 1 : -1;
    const rgb = [
      Math.round(colors[unique[0] * 3] * 255),
      Math.round(colors[unique[0] * 3 + 1] * 255),
      Math.round(colors[unique[0] * 3 + 2] * 255)
    ].join(',');
    const mat = paletteLookup.get(rgb);
    assert(mat !== undefined, `unknown palette color ${rgb}`);

    const key = `${axis}:${dir}:${mat}`;
    counts.set(key, (counts.get(key) ?? 0) + area);
  }
  return counts;
}

const seed = 1337;
const t0 = performance.now();
const { voxels } = generateChunk(seed);
const t1 = performance.now();
const mesh = greedyMesh(voxels, CHUNK.x, CHUNK.y, CHUNK.z);
const t2 = performance.now();

assert(voxels.length === CHUNK.x * CHUNK.y * CHUNK.z, 'voxel buffer size');

for (let i = 0; i < mesh.indices.length; i++) {
  assert(mesh.indices[i] < mesh.verts, `index ${i} out of range`);
}
for (let i = 0; i < mesh.positions.length; i++) {
  assert(Number.isFinite(mesh.positions[i]), `non-finite position at ${i}`);
}
assert(mesh.positions.length === mesh.verts * 3, 'position count matches verts');
assert(mesh.normals.length === mesh.verts * 3, 'normal count matches verts');
assert(mesh.colors.length === mesh.verts * 3, 'color count matches verts');
assert(mesh.indices.length % 6 === 0, 'indices form complete quads');

for (let i = 0; i < mesh.indices.length; i += 6) {
  const a = mesh.indices[i];
  const b = mesh.indices[i + 1];
  const c = mesh.indices[i + 2];
  const ab = [mesh.positions[b * 3] - mesh.positions[a * 3], mesh.positions[b * 3 + 1] - mesh.positions[a * 3 + 1], mesh.positions[b * 3 + 2] - mesh.positions[a * 3 + 2]];
  const ac = [mesh.positions[c * 3] - mesh.positions[a * 3], mesh.positions[c * 3 + 1] - mesh.positions[a * 3 + 1], mesh.positions[c * 3 + 2] - mesh.positions[a * 3 + 2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const axis =
    Math.abs(cross[0]) >= Math.abs(cross[1]) && Math.abs(cross[0]) >= Math.abs(cross[2])
      ? 0
      : Math.abs(cross[1]) >= Math.abs(cross[2])
        ? 1
        : 2;
  const expectedDir = mesh.normals[a * 3 + axis] > 0 ? 1 : -1;
  const handedness = cross[axis] > 0 ? 1 : -1;
  assert(
    handedness === expectedDir,
    `quad ${i / 6} winding disagrees with normal`
  );
}

const expected = bruteForceFaces(voxels);
const actual = meshQuadAreas(mesh);

let expectedFaces = 0;
for (const count of expected.values()) expectedFaces += count;
assert(expectedFaces === mesh.faces, `face total ${expectedFaces} vs ${mesh.faces}`);

for (const [key, count] of expected) {
  const got = actual.get(key) ?? 0;
  assert(Math.abs(got - count) < 1e-6, `area mismatch for ${key}: ${got} vs ${count}`);
}
for (const key of actual.keys()) {
  assert(expected.has(key), `unexpected key ${key}`);
}

console.log(`OK  gen ${(t1 - t0).toFixed(1)}ms  mesh ${(t2 - t1).toFixed(1)}ms`);
console.log(`    ${mesh.faces.toLocaleString()} exposed faces -> ${mesh.quads.toLocaleString()} greedy quads (${mesh.verts.toLocaleString()} verts)`);
console.log(`    compression ${(mesh.faces / mesh.quads).toFixed(2)}x`);
