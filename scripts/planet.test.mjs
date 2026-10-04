import { BLOCK, BLOCK_PALETTE } from '../src/world/blocks.js';
import {
  PLANET,
  SUB_SIZE,
  SUBS,
  DISTRICTS,
  CITY_MAX_LAT,
  classifyDirection,
  cellDistrict,
  slotAt,
  generatePlanet,
  planetSpawn
} from '../src/world/planet.js';
import { greedyMesh } from '../src/world/greedyMesher.js';
import { raycastVoxels } from '../src/world/voxelOps.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const S = PLANET.size;
const C = PLANET.center;
const R = PLANET.radius;
const DEG = Math.PI / 180;
const seed = 1337;

assert(S % SUB_SIZE === 0 && SUBS === S / SUB_SIZE, 'sub-chunk grid divides the planet evenly');
assert(S > 2 * (R + PLANET.maxStruct + 1), 'planet fits inside its voxel box');

const t0 = performance.now();
const voxels = generatePlanet(seed);
const t1 = performance.now();
assert(voxels.length === S * S * S, 'voxel buffer size');
assert(voxels.some((v) => v !== 0), 'planet is not empty');
assert(voxels.some((v) => v === 0), 'planet is not solid');

const again = generatePlanet(seed);
assert(Buffer.compare(Buffer.from(voxels), Buffer.from(again)) === 0, 'same seed regenerates identical planet');

const other = generatePlanet(90210);
assert(Buffer.compare(Buffer.from(voxels), Buffer.from(other)) !== 0, 'different seed changes the planet');
const t2 = performance.now();

const known = new Set(Object.values(BLOCK));
const histogram = new Map();
for (let i = 0; i < voxels.length; i++) {
  const id = voxels[i];
  assert(known.has(id), `unknown block id ${id} at voxel ${i}`);
  histogram.set(id, (histogram.get(id) ?? 0) + 1);
}
const count = (id) => histogram.get(id) ?? 0;

const idx = (x, y, z) => x + S * (y + S * z);
for (const corner of [
  [0, 0, 0],
  [S - 1, 0, 0],
  [0, S - 1, 0],
  [0, 0, S - 1],
  [S - 1, S - 1, 0],
  [S - 1, 0, S - 1],
  [0, S - 1, S - 1],
  [S - 1, S - 1, S - 1]
]) {
  assert(voxels[idx(...corner)] === BLOCK.AIR, `cube corner ${corner} is air`);
}

const inside = voxels[idx(C, C, C)];
assert(inside === BLOCK.STONE, `planet core is stone (got ${inside})`);

const surfaceVoxel = voxels[idx(Math.floor(C + R - 1.5), C, C)];
assert(surfaceVoxel !== BLOCK.AIR && surfaceVoxel !== BLOCK.STONE, `surface band is painted (got ${surfaceVoxel})`);

assert(count(BLOCK.ROAD) > 500, `roads exist (${count(BLOCK.ROAD)})`);
assert(count(BLOCK.ROAD_LINE) > 50, `road lines exist (${count(BLOCK.ROAD_LINE)})`);
assert(count(BLOCK.SIDEWALK) > 500, `sidewalks exist (${count(BLOCK.SIDEWALK)})`);
assert(count(BLOCK.GRASS) > 500, `grass exists (${count(BLOCK.GRASS)})`);
assert(count(BLOCK.SAND) > 0, 'polar sand exists');
assert(count(BLOCK.STONE) > 0 && count(BLOCK.DIRT) > 0, 'stone and dirt mantle exist');
assert(count(BLOCK.LAMP_POST) > 5, `street lamps exist (${count(BLOCK.LAMP_POST)})`);
const lampHeads =
  count(BLOCK.LAMP_WARM) +
  count(BLOCK.LAMP_CYAN) +
  count(BLOCK.LAMP_PINK) +
  count(BLOCK.LAMP_LIME) +
  count(BLOCK.LAMP_AMBER);
assert(lampHeads > 0, `lamp heads are emissive (${lampHeads})`);
const neon =
  count(BLOCK.NEON_PINK) + count(BLOCK.NEON_CYAN) + count(BLOCK.NEON_AMBER);
assert(neon > 0, `neon signs exist (${neon})`);
const walls = count(BLOCK.BRICK) + count(BLOCK.METAL) + count(BLOCK.WOOD);
assert(walls > 0, `building walls exist (${walls})`);
assert(count(BLOCK.GLASS) > 0, `window glass exists (${count(BLOCK.GLASS)})`);
assert(count(BLOCK.LEAVES) > 0, `trees exist (${count(BLOCK.LEAVES)})`);

assert(classifyDirection(0.001, 0.5 * DEG) === 'cross', 'equator crossing is a cross');
assert(
  classifyDirection(0.001, 0.5 * DEG) === classifyDirection(-0.001, 0.5 * DEG),
  'cross continues across the equator'
);
assert(
  classifyDirection(0.1 * DEG, 179.99 * DEG) === classifyDirection(0.1 * DEG, -179.99 * DEG),
  'road family continuous across the lon wrap'
);
assert(classifyDirection(20 * DEG, 10 * DEG) === 'block', 'mid-cell away from roads is a block');
assert(classifyDirection(-20 * DEG, 10 * DEG) === 'block', 'block continues across the equator');
assert(classifyDirection(60 * DEG, 10 * DEG) === 'natural', 'high latitude is natural terrain');
assert(classifyDirection(-60 * DEG, 10 * DEG) === 'natural', 'high southern latitude is natural terrain');
assert(CITY_MAX_LAT > 45 && CITY_MAX_LAT < 60, `city latitude band is sane (${CITY_MAX_LAT.toFixed(2)})`);
assert(classifyDirection(Math.PI / 4, 10 * DEG) === 'lineH', 'center line of a parallel is lineH');
assert(classifyDirection(Math.PI / 4 + 2 / R, 10 * DEG) === 'roadH', 'parallel road is roadH');
assert(classifyDirection(0, Math.PI / 4) === 'cross', 'meridian crossing is a cross');
assert(classifyDirection(20 * DEG, Math.PI / 4) === 'lineV', 'meridian center line at mid latitude is lineV');
assert(classifyDirection(20 * DEG, Math.PI / 4 + 0.5 / R) === 'lineV', 'meridian line band is lineV');
assert(classifyDirection(20 * DEG, Math.PI / 4 + 2 / R) === 'roadV', 'meridian road is roadV');

const kinds = new Set(DISTRICTS.flatMap((d) => Object.keys(d.weights)));
for (let ci = 0; ci < 8; ci++) {
  for (const cj of [0, 1]) {
    const d = cellDistrict(ci, cj, seed);
    assert(d >= 0 && d < DISTRICTS.length, `cell district in range (got ${d})`);
    assert(cellDistrict(ci, cj, seed) === d, 'cell district deterministic');
  }
}
const slot10 = slotAt(10 * DEG, 10 * DEG, seed);
assert(slot10 !== null, 'mid-cell latitude/longitude yields a slot');
assert(kinds.has(slot10.kind), `slot kind ${slot10.kind} is a known structure kind`);
assert(slotAt(0, 0, seed) === null, 'road cross center has no slot');

const spawn = planetSpawn();
const spawnR = Math.hypot(spawn.x - C, spawn.y - C, spawn.z - C);
assert(Math.abs(spawnR - (R + 2.5)) < 1e-9, `spawn radius is R+2.5 (got ${spawnR})`);
const drop = raycastVoxels(voxels, S, S, S, [spawn.x, spawn.y, spawn.z], [-1, 0, 0], 20);
assert(drop !== null, 'spawn column has ground below');
assert(drop.distance >= 1 && drop.distance <= 8, `spawn column clear (got ${drop.distance})`);

const roadHit = raycastVoxels(voxels, S, S, S, [C + R + 30, C, C], [-1, 0, 0], 50);
assert(roadHit !== null, 'ray toward spawn direction hits the planet');
const roadR = Math.hypot(roadHit.point[0] - C, roadHit.point[1] - C, roadHit.point[2] - C);
assert(roadR <= R + 1.5, `road surface has no structures (r=${roadR.toFixed(2)})`);
assert(roadHit.block === BLOCK.ROAD, `road center ray lands on road (got ${roadHit.block})`);

const dirs = [];
const N_DIR = 500;
for (let i = 0; i < N_DIR; i++) {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / N_DIR);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  dirs.push([Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi)]);
}
let minR = Infinity;
let maxR = -Infinity;
let misses = 0;
for (const d of dirs) {
  const origin = [C + d[0] * (R + 30), C + d[1] * (R + 30), C + d[2] * (R + 30)];
  const hit = raycastVoxels(voxels, S, S, S, origin, [-d[0], -d[1], -d[2]], 60);
  if (!hit) {
    misses++;
    continue;
  }
  const r = Math.hypot(hit.point[0] - C, hit.point[1] - C, hit.point[2] - C);
  if (r < minR) minR = r;
  if (r > maxR) maxR = r;
}
assert(misses === 0, `${misses}/${N_DIR} inward rays missed the planet`);
assert(minR >= R - 2, `planet is closed inward (min r ${minR.toFixed(2)})`);
assert(maxR <= R + PLANET.maxStruct + 1, `outward hits stay in the structure shell (max r ${maxR.toFixed(2)})`);

function extractHalo(i, j, k) {
  const HALO = SUB_SIZE + 2;
  const sub = new Uint8Array(HALO * HALO * HALO);
  const ox = i * SUB_SIZE - 1;
  const oy = j * SUB_SIZE - 1;
  const oz = k * SUB_SIZE - 1;
  for (let z = 0; z < HALO; z++) {
    const wz = oz + z;
    if (wz < 0 || wz >= S) continue;
    for (let y = 0; y < HALO; y++) {
      const wy = oy + y;
      if (wy < 0 || wy >= S) continue;
      const dst = HALO * (y + HALO * z);
      const src = S * (wy + S * wz);
      for (let x = 0; x < HALO; x++) {
        const wx = ox + x;
        if (wx >= 0 && wx < S) sub[dst + x] = voxels[src + wx];
      }
    }
  }
  return sub;
}

const HALO = SUB_SIZE + 2;
const surfSub = [
  Math.floor((Math.floor(C + R - 1.5)) / SUB_SIZE),
  Math.floor(C / SUB_SIZE),
  Math.floor(C / SUB_SIZE)
];
const haloMesh = greedyMesh(extractHalo(...surfSub), HALO, HALO, HALO, {
  palette: BLOCK_PALETTE,
  ao: true,
  smooth: true,
  core: [1, 1, 1, SUB_SIZE + 1, SUB_SIZE + 1, SUB_SIZE + 1]
});
assert(haloMesh.verts > 0, 'surface sub-chunk halo meshes to something');
assert(haloMesh.indices.length % 6 === 0, 'halo indices form complete quads');
for (let i = 0; i < haloMesh.indices.length; i++) {
  assert(haloMesh.indices[i] < haloMesh.verts, `halo index ${i} out of range`);
}
for (let i = 0; i < haloMesh.positions.length; i++) {
  assert(Number.isFinite(haloMesh.positions[i]), `halo position ${i} not finite`);
}
for (let v = 0; v < haloMesh.verts; v++) {
  const len = Math.hypot(
    haloMesh.normals[v * 3],
    haloMesh.normals[v * 3 + 1],
    haloMesh.normals[v * 3 + 2]
  );
  assert(Math.abs(len - 1) < 1e-3, `halo vertex ${v} normal is unit (len ${len.toFixed(4)})`);
}

{
  const small = new Uint8Array(6 * 6 * 6);
  const si = (x, y, z) => x + 6 * (y + 6 * z);
  small[si(0, 0, 0)] = BLOCK.STONE;
  const unmasked = greedyMesh(small, 6, 6, 6);
  assert(unmasked.quads === 6, `lone voxel emits 6 quads (got ${unmasked.quads})`);
  const masked = greedyMesh(small, 6, 6, 6, { core: [1, 1, 1, 6, 6, 6] });
  assert(masked.quads === 0, `core mask excludes out-of-core voxels (got ${masked.quads})`);
}

{
  const aoGrid = new Uint8Array(3 * 3 * 3);
  const ai = (x, y, z) => x + 3 * (y + 3 * z);
  aoGrid[ai(1, 1, 1)] = BLOCK.STONE;
  aoGrid[ai(2, 2, 1)] = BLOCK.STONE;
  const mesh = greedyMesh(aoGrid, 3, 3, 3, { ao: true });
  const mat = BLOCK_PALETTE[BLOCK.STONE];
  const eps = 1e-6;
  let sawFull = false;
  let sawOccluded = false;
  for (let v = 0; v < mesh.verts; v++) {
    for (let c = 0; c < 3; c++) {
      const value = mesh.colors[v * 3 + c];
      assert(value <= mat[c] + eps, `AO never brightens albedo (${value} > ${mat[c]})`);
      if (Math.abs(value - mat[c]) < eps) sawFull = true;
      if (Math.abs(value - mat[c] * 0.84) < eps) sawOccluded = true;
    }
  }
  assert(sawFull, 'AO keeps unoccluded corners at full brightness');
  assert(sawOccluded, 'AO darkens the occluded corner to level 0.84');
}

{
  const smoothGrid = new Uint8Array(3 * 3 * 3);
  smoothGrid[1 + 3 * (1 + 3 * 1)] = BLOCK.STONE;
  const mesh = greedyMesh(smoothGrid, 3, 3, 3, { smooth: true });
  const s = Math.SQRT1_2 / Math.sqrt(1.5);
  assert(Math.abs(s - 1 / Math.sqrt(3)) < 1e-12, 'sanity');
  assert(
    Math.abs(mesh.normals[0] - -1 / Math.sqrt(3)) < 1e-6 &&
      Math.abs(mesh.normals[1] - -1 / Math.sqrt(3)) < 1e-6 &&
      Math.abs(mesh.normals[2] - -1 / Math.sqrt(3)) < 1e-6,
    `smooth corner blends three face normals (got ${mesh.normals[0]},${mesh.normals[1]},${mesh.normals[2]})`
  );
}

console.log(`OK  planet tests passed in ${((t2 - t0) / 1000).toFixed(2)}s (gen ${(t1 - t0).toFixed(0)}ms x2)`);
console.log(
  `    ${histogram.size} materials · roads ${count(BLOCK.ROAD).toLocaleString()} · ` +
    `lamps ${count(BLOCK.LAMP_POST).toLocaleString()} · walls ${walls.toLocaleString()} · ` +
    `inward rays ${N_DIR}/${N_DIR} hit r ∈ [${minR.toFixed(1)}, ${maxR.toFixed(1)}]`
);
