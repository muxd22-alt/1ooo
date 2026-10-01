import {
  CHUNK,
  GRID,
  WORLD,
  BLOCK,
  BLOCK_PALETTE,
  BLOCK_EMISSIVE,
  voxelIndex,
  worldIndex
} from '../src/world/blocks.js';
import {
  generateCityChunk,
  classifyColumn,
  chunkDistrict,
  DISTRICTS,
  GROUND,
  SURF,
  BASE,
  citySpawn
} from '../src/world/city.js';
import { greedyMesh } from '../src/world/greedyMesher.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const ROAD_FAMILY = new Set(['cross', 'roadV', 'roadH', 'lineV', 'lineH']);
const LAMP_HEADS = [BLOCK.LAMP_WARM, BLOCK.LAMP_CYAN, BLOCK.LAMP_PINK, BLOCK.LAMP_LIME, BLOCK.LAMP_AMBER];
const NEONS = [BLOCK.NEON_PINK, BLOCK.NEON_CYAN, BLOCK.NEON_AMBER];

function assembleWorld(seed) {
  const world = new Uint8Array(WORLD.x * WORLD.y * WORLD.z);
  for (let cz = 0; cz < GRID.z; cz++) {
    for (let cx = 0; cx < GRID.x; cx++) {
      const { voxels } = generateCityChunk(cx, cz, seed);
      const x0 = cx * CHUNK.x;
      const z0 = cz * CHUNK.z;
      for (let y = 0; y < CHUNK.y; y++) {
        for (let z = 0; z < CHUNK.z; z++) {
          const src = CHUNK.x * (y + CHUNK.y * z);
          world.set(voxels.subarray(src, src + CHUNK.x), worldIndex(x0, y, z0 + z));
        }
      }
    }
  }
  return world;
}

const t0 = performance.now();
const world = assembleWorld(1337);
const t1 = performance.now();
const worldAgain = assembleWorld(1337);
const worldOther = assembleWorld(4242);
const t2 = performance.now();

let diff = 0;
for (let i = 0; i < world.length; i++) if (world[i] !== worldAgain[i]) diff++;
assert(diff === 0, `same seed must be deterministic (${diff} differing voxels)`);

let diffOther = 0;
for (let i = 0; i < world.length; i++) if (world[i] !== worldOther[i]) diffOther++;
assert(diffOther > 1000, `different seeds must differ meaningfully (${diffOther} voxels)`);

const at = (x, y, z) => world[worldIndex(x, y, z)];

let unknown = 0;
let solidAboveSurf = 0;
let roadCells = 0;
let lampHeads = 0;
let neonCells = 0;
let maxY = 0;
for (let z = 0; z < WORLD.z; z++) {
  for (let x = 0; x < WORLD.x; x++) {
    for (let y = 0; y < WORLD.y; y++) {
      const id = at(x, y, z);
      if (id === 0) continue;
      if (BLOCK_PALETTE[id] === undefined) unknown++;
      if (y > SURF) {
        solidAboveSurf++;
        if (y > maxY) maxY = y;
      }
      if (y === GROUND && (id === BLOCK.ROAD || id === BLOCK.ROAD_LINE)) roadCells++;
      if (LAMP_HEADS.includes(id)) lampHeads++;
      if (NEONS.includes(id)) neonCells++;
    }
  }
}
assert(unknown === 0, `${unknown} voxels reference ids missing from BLOCK_PALETTE`);
assert(maxY < CHUNK.y, `buildings must fit chunk height (max y ${maxY})`);
assert(solidAboveSurf > 20000, `world must contain structures (${solidAboveSurf} voxels above sidewalk level)`);
assert(roadCells > 30000, `world must contain road grid (${roadCells} road cells)`);
assert(lampHeads >= 100, `street lamps must exist (${lampHeads} lamp heads)`);
assert(neonCells > 0, `at least some neon signs expected (${neonCells})`);

for (const id of [...LAMP_HEADS, ...NEONS, BLOCK.GLASS]) {
  assert(BLOCK_EMISSIVE[id] !== undefined, `emissive map missing block ${id}`);
  assert(BLOCK_PALETTE[id] !== undefined, `palette missing block ${id}`);
}

const rowZ = Math.floor(WORLD.z / 2);
for (let x = 0; x < WORLD.x; x++) {
  assert(
    ROAD_FAMILY.has(classifyColumn(x, rowZ)),
    `horizontal main road must be continuous at z=${rowZ}, x=${x}`
  );
  assert(
    at(x, GROUND, rowZ) === BLOCK.ROAD || at(x, GROUND, rowZ) === BLOCK.ROAD_LINE,
    `road surface missing at (${x}, ${rowZ})`
  );
  for (let y = GROUND + 1; y < WORLD.y; y++) {
    assert(at(x, y, rowZ) === 0, `road corridor must stay clear at (${x}, ${y}, ${rowZ})`);
  }
}

const colX = Math.floor(WORLD.x / 2);
for (let z = 0; z < WORLD.z; z++) {
  assert(
    ROAD_FAMILY.has(classifyColumn(colX, z)),
    `vertical main road must be continuous at x=${colX}, z=${z}`
  );
  assert(
    at(colX, GROUND, z) === BLOCK.ROAD || at(colX, GROUND, z) === BLOCK.ROAD_LINE,
    `road surface missing at (${colX}, ${z})`
  );
}

for (const ex of [CHUNK.x, CHUNK.x * 2, CHUNK.x * 3]) {
  for (let z = 0; z < WORLD.z; z++) {
    assert(
      ROAD_FAMILY.has(classifyColumn(ex - 1, z)) && ROAD_FAMILY.has(classifyColumn(ex, z)),
      `chunk seam x=${ex} must connect road-family columns at z=${z}`
    );
    assert(
      at(ex - 1, GROUND, z) !== 0 && at(ex, GROUND, z) !== 0,
      `chunk seam x=${ex} must have surface at z=${z}`
    );
  }
}
for (const ez of [CHUNK.z, CHUNK.z * 2]) {
  for (let x = 0; x < WORLD.x; x++) {
    assert(
      ROAD_FAMILY.has(classifyColumn(x, ez - 1)) && ROAD_FAMILY.has(classifyColumn(x, ez)),
      `chunk seam z=${ez} must connect road-family columns at x=${x}`
    );
    assert(
      at(x, GROUND, ez - 1) !== 0 && at(x, GROUND, ez) !== 0,
      `chunk seam z=${ez} must have surface at x=${x}`
    );
  }
}

const spawn = citySpawn();
const sx = Math.floor(spawn.x);
const sz = Math.floor(spawn.z);
assert(spawn.y > GROUND && spawn.y < WORLD.y, `spawn height in bounds (${spawn.y})`);
assert(ROAD_FAMILY.has(classifyColumn(sx, sz)), 'spawn must stand on the road grid');
for (let y = GROUND + 1; y < spawn.y; y++) {
  assert(at(sx, y, sz) === 0, `spawn column must be clear at y=${y}`);
}

const districtsA = [];
const districtsB = [];
for (let cz = 0; cz < GRID.z; cz++) {
  for (let cx = 0; cx < GRID.x; cx++) {
    const a = chunkDistrict(1337, cx, cz);
    const b = chunkDistrict(4242, cx, cz);
    assert(a >= 0 && a < DISTRICTS.length, `district index in range (${a})`);
    assert(b >= 0 && b < DISTRICTS.length, `district index in range (${b})`);
    districtsA.push(a);
    districtsB.push(b);
  }
}
assert(districtsA.length === GRID.x * GRID.z, '12 chunk district slots');
assert(
  districtsA.some((v, i) => v !== districtsB[i]),
  'district mix must vary with seed'
);

let emissiveVerts = 0;
let meshQuads = 0;
for (let cz = 0; cz < GRID.z; cz++) {
  for (let cx = 0; cx < GRID.x; cx++) {
    const { voxels } = generateCityChunk(cx, cz, 1337);
    const mesh = greedyMesh(voxels, CHUNK.x, CHUNK.y, CHUNK.z);
    assert(mesh.emissives.length === mesh.verts * 3, `emissive count matches verts for chunk ${cx},${cz}`);
    for (let i = 0; i < mesh.indices.length; i++) {
      assert(mesh.indices[i] < mesh.verts, `index out of range in chunk ${cx},${cz}`);
    }
    for (const v of mesh.emissives) assert(Number.isFinite(v), `non-finite emissive in chunk ${cx},${cz}`);
    for (const v of mesh.positions) assert(Number.isFinite(v), `non-finite position in chunk ${cx},${cz}`);
    for (let i = 0; i < mesh.emissives.length; i += 3) {
      if (mesh.emissives[i] !== 0 || mesh.emissives[i + 1] !== 0 || mesh.emissives[i + 2] !== 0) emissiveVerts++;
    }
    meshQuads += mesh.quads;
  }
}
assert(emissiveVerts > 0, 'at least one emissive vertex in the world (lamps/neon/glass)');

console.log(
  `OK  gen ${(t1 - t0).toFixed(1)}ms (repeat ${((t2 - t1) / 2).toFixed(1)}ms)  ` +
    `${GRID.x * GRID.z} chunks · ${roadCells.toLocaleString()} road cells · ` +
    `${lampHeads} lamp heads · ${neonCells} neon · ${solidAboveSurf.toLocaleString()} structure voxels`
);
console.log(
  `    districts: ${districtsA.map((d) => DISTRICTS[d].name).join('/')} · ` +
    `mesh ${meshQuads.toLocaleString()} quads · ${emissiveVerts.toLocaleString()} emissive verts`
);
console.log(`    spawn (${spawn.x}, ${spawn.y}, ${spawn.z}) on ${classifyColumn(sx, sz)} · seed 1337 vs 4242 diff ${diffOther.toLocaleString()} voxels`);
