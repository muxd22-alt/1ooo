import { BLOCK, CHUNK, GRID, WORLD, voxelIndex } from './blocks.js';

export const GROUND = 24;
export const SURF = GROUND + 1;
export const BASE = GROUND + 2;

const SPACING = 50;
const ROAD_HALF = 4;
const WALK_HALF = 7;

export function hash3i(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rand01(seed, a, b) {
  return hash3i(a, b, seed) / 4294967296;
}

function dist50(v) {
  const m = ((v % SPACING) + SPACING) % SPACING;
  return Math.min(m, SPACING - m);
}

export function classifyColumn(x, z) {
  const dx = dist50(x);
  const dz = dist50(z);
  if (dx <= ROAD_HALF && dz <= ROAD_HALF) return 'cross';
  if (dx <= ROAD_HALF) return dx === 0 ? 'lineV' : 'roadV';
  if (dz <= ROAD_HALF) return dz === 0 ? 'lineH' : 'roadH';
  if (dx <= WALK_HALF || dz <= WALK_HALF) return 'walk';
  return 'block';
}

export const DISTRICTS = Object.freeze([
  Object.freeze({ name: 'DOWNTOWN', weights: Object.freeze({ tower: 5, twin: 2, market: 1 }) }),
  Object.freeze({ name: 'MIDRISE', weights: Object.freeze({ twin: 4, tower: 2, market: 1, garden: 1 }) }),
  Object.freeze({ name: 'SUBURB', weights: Object.freeze({ corners: 4, row: 2, garden: 2 }) }),
  Object.freeze({ name: 'ROWHOUSES', weights: Object.freeze({ row: 6, garden: 1, market: 1 }) }),
  Object.freeze({ name: 'PARK', weights: Object.freeze({ park: 6, garden: 2, plaza: 1 }) }),
  Object.freeze({ name: 'GREEN', weights: Object.freeze({ garden: 5, park: 3, lot: 1 }) }),
  Object.freeze({ name: 'PLAZA', weights: Object.freeze({ plaza: 5, market: 2, tower: 1 }) }),
  Object.freeze({ name: 'PARKING', weights: Object.freeze({ parking: 6, lot: 2 }) }),
  Object.freeze({ name: 'LOTS', weights: Object.freeze({ lot: 5, parking: 2, market: 1 }) }),
  Object.freeze({ name: 'MARKET', weights: Object.freeze({ market: 5, plaza: 2, corners: 1 }) }),
  Object.freeze({ name: 'TOWERS', weights: Object.freeze({ tower: 6, twin: 2 }) }),
  Object.freeze({ name: 'HOOD', weights: Object.freeze({ corners: 3, row: 3, garden: 2, park: 1 }) })
]);

export function chunkDistrict(seed, cx, cz) {
  return hash3i(cx + 977, cz + 613, seed ^ 0x51ed270b) % DISTRICTS.length;
}

function pickKind(seed, bx, bz) {
  const district = DISTRICTS[chunkDistrict(seed, bx >> 1, bz >> 1)];
  const entries = Object.entries(district.weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rand01(seed ^ 0x9e3779b9, bx, bz) * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r < 0) return kind;
  }
  return entries[0][0];
}

const LAMP_IDS = Object.freeze([
  BLOCK.LAMP_WARM,
  BLOCK.LAMP_CYAN,
  BLOCK.LAMP_PINK,
  BLOCK.LAMP_LIME,
  BLOCK.LAMP_AMBER
]);

const NEON_IDS = Object.freeze([BLOCK.NEON_PINK, BLOCK.NEON_CYAN, BLOCK.NEON_AMBER]);

function isSolidVoxel(voxels, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= CHUNK.x || y >= CHUNK.y || z >= CHUNK.z) return true;
  return voxels[voxelIndex(x, y, z)] !== 0;
}

function makeWriter(voxels, cx, cz) {
  const ox = cx * CHUNK.x;
  const oz = cz * CHUNK.z;
  return function set(wx, wy, wz, id) {
    const x = wx - ox;
    const y = wy;
    const z = wz - oz;
    if (x < 0 || y < 0 || z < 0 || x >= CHUNK.x || y >= CHUNK.y || z >= CHUNK.z) return;
    voxels[voxelIndex(x, y, z)] = id;
  };
}

function fillRect(voxels, set, x0, z0, x1, z1, y0, y1, wallMat, windowed) {
  for (let y = y0; y <= y1; y++) {
    const roof = y === y1;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const boundary = x === x0 || x === x1 || z === z0 || z === z1;
        let cell;
        if (roof) cell = BLOCK.CONCRETE;
        else if (!boundary) cell = wallMat;
        else if (windowed && y > y0 && y < y1) {
          const along = x === x0 || x === x1 ? z : x;
          cell = (y - y0) % 3 === 1 && along % 4 !== 0 ? BLOCK.GLASS : wallMat;
        } else cell = wallMat;
        set(x, y, z, cell);
      }
    }
  }
}

function neonStrip(voxels, set, face, rect, y0, y1, neonId) {
  const [x0, z0, x1, z1] = rect;
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < 6; i++) {
      if (face === 0) set(x0, y, z0 + 3 + i, neonId);
      else if (face === 1) set(x1, y, z0 + 3 + i, neonId);
      else if (face === 2) set(x0 + 3 + i, y, z0, neonId);
      else set(x0 + 3 + i, y, z1, neonId);
    }
  }
}

function tree(voxels, set, wx, wy, wz, h) {
  const trunkH = 3 + (h % 3);
  for (let i = 0; i < trunkH; i++) set(wx, wy + i, wz, BLOCK.TRUNK);
  const cy = wy + trunkH;
  for (let dy = -2; dy <= 3; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dy * dy * 1.2 + dz * dz > 6.5) continue;
        const lx = wx + dx - Math.floor(wx / CHUNK.x) * CHUNK.x;
        const ly = cy + dy;
        const lz = wz + dz - Math.floor(wz / CHUNK.z) * CHUNK.z;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= CHUNK.x || ly >= CHUNK.y || lz >= CHUNK.z) continue;
        if (isSolidVoxel(voxels, lx, ly, lz)) continue;
        voxels[voxelIndex(lx, ly, lz)] = BLOCK.LEAVES;
      }
    }
  }
}

function fencePerimeter(set, x0, z0, x1, z1) {
  const place = (x, z, t) => {
    if (t % 4 === 0) {
      set(x, BASE, z, BLOCK.FENCE);
      set(x, BASE + 1, z, BLOCK.FENCE);
    } else {
      set(x, BASE + 1, z, BLOCK.FENCE);
    }
  };
  for (let t = 0; t <= x1 - x0; t++) place(x0 + t, z0, t);
  for (let t = 0; t <= x1 - x0; t++) place(x0 + t, z1, t);
  for (let t = 1; t < z1 - z0; t++) place(x0, z0 + t, t);
  for (let t = 1; t < z1 - z0; t++) place(x1, z0 + t, t);
}

function lampAt(set, seed, wx, wz) {
  const cls = classifyColumn(wx, wz);
  if (cls !== 'walk' && cls !== 'block') return;
  const id = LAMP_IDS[hash3i(wx, wz, seed ^ 0x10ff5eED) % LAMP_IDS.length];
  for (let i = 0; i < 4; i++) set(wx, BASE + i, wz, BLOCK.LAMP_POST);
  set(wx, BASE + 4, wz, id);
}

function paintPark(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.GRASS);
  }
  for (let rx = 23; rx <= 26; rx++) for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.PLAZA);
  for (let rz = 23; rz <= 26; rz++) for (let rx = 8; rx <= 42; rx++) set(ox + rx, SURF, oz + rz, BLOCK.PLAZA);
  const trees = 7 + (hash3i(ox, oz, seed) % 4);
  for (let i = 0; i < trees; i++) {
    const rx = 9 + Math.floor(rand01(seed ^ 0x77 ^ i, ox, oz + i) * 34);
    const rz = 9 + Math.floor(rand01(seed ^ 0x99 ^ i, ox + i, oz) * 34);
    if (rx >= 22 && rx <= 27) continue;
    if (rz >= 22 && rz <= 27) continue;
    tree(voxels, set, ox + rx, BASE, oz + rz, hash3i(rx + i, rz - i, seed));
  }
}

function paintGarden(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.GRASS);
  }
  for (let rx = 23; rx <= 27; rx++) for (let rz = 23; rz <= 27; rz++) set(ox + rx, SURF, oz + rz, BLOCK.PLAZA);
  const trees = 4 + (hash3i(ox + 5, oz + 5, seed) % 4);
  for (let i = 0; i < trees; i++) {
    const rx = 9 + Math.floor(rand01(seed ^ 0x1100 ^ i, ox + i * 3, oz) * 34);
    const rz = 9 + Math.floor(rand01(seed ^ 0x2200 ^ i, ox, oz + i * 3) * 34);
    if (rx >= 22 && rx <= 28 && rz >= 22 && rz <= 28) continue;
    tree(voxels, set, ox + rx, BASE, oz + rz, hash3i(rx, rz + i, seed));
  }
}

function paintPlaza(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.PLAZA);
  }
  for (let rx = 18; rx <= 32; rx++) {
    for (let rz = 18; rz <= 32; rz++) {
      const dx = rx - 25;
      const dz = rz - 25;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 6) set(ox + rx, SURF, oz + rz, BLOCK.WATER);
      else if (d < 7) {
        set(ox + rx, SURF, oz + rz, BLOCK.CONCRETE);
        set(ox + rx, BASE, oz + rz, BLOCK.CONCRETE);
      }
    }
  }
  for (let y = BASE; y <= BASE + 4; y++) {
    set(ox + 24, y, oz + 24, BLOCK.METAL);
    set(ox + 25, y, oz + 24, BLOCK.METAL);
    set(ox + 24, y, oz + 25, BLOCK.METAL);
    set(ox + 25, y, oz + 25, BLOCK.METAL);
  }
  set(ox + 24, BASE + 5, oz + 24, BLOCK.LAMP_WARM);
  set(ox + 25, BASE + 5, oz + 24, BLOCK.LAMP_WARM);
  set(ox + 24, BASE + 5, oz + 25, BLOCK.LAMP_WARM);
  set(ox + 25, BASE + 5, oz + 25, BLOCK.LAMP_WARM);
  for (const [rx, rz] of [
    [11, 11],
    [39, 11],
    [11, 39],
    [39, 39]
  ]) {
    if (hash3i(rx, rz, seed) % 2 === 0) tree(voxels, set, ox + rx, BASE, oz + rz, hash3i(rx, rz, seed));
  }
}

function paintParking(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.LOT);
  }
  for (let rx = 10; rx <= 40; rx += 7) {
    for (let rz = 11; rz <= 40; rz++) set(ox + rx, SURF, oz + rz, BLOCK.ROAD_LINE);
  }
  fencePerimeter(set, ox + 8, oz + 8, ox + 42, oz + 42);
  lampAt(set, seed, ox + 11, oz + 11);
  lampAt(set, seed, ox + 39, oz + 39);
}

function paintLot(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.GRASS);
  }
  fencePerimeter(set, ox + 8, oz + 8, ox + 42, oz + 42);
  for (let x = ox + 12; x <= ox + 19; x++) {
    for (let z = oz + 12; z <= oz + 17; z++) {
      const boundary = x === ox + 12 || x === ox + 19 || z === oz + 12 || z === oz + 17;
      for (let y = BASE; y <= BASE + 4; y++) {
        if (!boundary && y < BASE + 4) continue;
        set(x, y, z, boundary && y === BASE && z === oz + 17 ? BLOCK.GLASS : BLOCK.CONCRETE);
      }
      set(x, BASE + 5, z, BLOCK.CONCRETE);
    }
  }
}

function paintRow(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.SIDEWALK);
  }
  const mats = [BLOCK.BRICK, BLOCK.WOOD, BLOCK.CONCRETE];
  for (let i = 0; i < 4; i++) {
    const x0 = ox + 8 + i * 9;
    const x1 = x0 + 7;
    const z0 = oz + 10;
    const z1 = oz + 40;
    const h = 6 + Math.floor(rand01(seed ^ (0x3000 + i), ox + i, oz) * 8);
    const wall = mats[Math.floor(rand01(seed ^ (0x4000 + i), ox, oz + i) * mats.length)];
    fillRect(voxels, set, x0, z0, x1, z1, BASE, BASE + h, wall, true);
  }
}

function paintCorners(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.SIDEWALK);
  }
  const rects = [
    [10, 10],
    [28, 10],
    [10, 28],
    [28, 28]
  ];
  const mats = [BLOCK.BRICK, BLOCK.CONCRETE, BLOCK.BRICK, BLOCK.METAL];
  for (let i = 0; i < 4; i++) {
    const [rx0, rz0] = rects[i];
    const x0 = ox + rx0;
    const z0 = oz + rz0;
    const x1 = x0 + 12;
    const z1 = z0 + 12;
    const h = 5 + Math.floor(rand01(seed ^ (0x5000 + i), ox + i * 7, oz + i * 3) * 11);
    fillRect(voxels, set, x0, z0, x1, z1, BASE, BASE + h, mats[i], true);
    if (i === 0 && hash3i(ox, oz, seed) % 5 !== 0) {
      const neon = NEON_IDS[hash3i(ox + 1, oz, seed) % NEON_IDS.length];
      neonStrip(voxels, set, 0, [x0, z0, x1, z1], BASE + h - 5, BASE + h - 1, neon);
    }
  }
}

function paintTwin(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.SIDEWALK);
  }
  const a = [ox + 9, oz + 9, ox + 23, oz + 23];
  const b = [ox + 27, oz + 27, ox + 41, oz + 41];
  const hA = 20 + Math.floor(rand01(seed ^ 0x6101, ox, oz) * 14);
  const hB = 16 + Math.floor(rand01(seed ^ 0x6202, ox, oz) * 12);
  fillRect(voxels, set, a[0], a[1], a[2], a[3], BASE, BASE + hA, BLOCK.CONCRETE, true);
  for (let y = BASE; y <= BASE + hB; y++) {
    for (let x = b[0]; x <= b[2]; x++) {
      for (let z = b[1]; z <= b[3]; z++) {
        const boundary = x === b[0] || x === b[2] || z === b[1] || z === b[3];
        let cell = BLOCK.METAL;
        if (y === BASE + hB) cell = BLOCK.CONCRETE;
        else if (boundary && (y - BASE) % 2 === 1 && (x + z) % 3 !== 0) cell = BLOCK.GLASS;
        set(x, y, z, cell);
      }
    }
  }
  neonStrip(voxels, set, 0, a, BASE + hA - 8, BASE + hA - 1, BLOCK.NEON_CYAN);
  neonStrip(voxels, set, 3, b, BASE + hB - 6, BASE + hB - 1, BLOCK.NEON_PINK);
}

function paintMarket(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.SIDEWALK);
  }
  const stalls = [
    [10, 10],
    [28, 10],
    [10, 28],
    [28, 28]
  ];
  for (let i = 0; i < 4; i++) {
    const x0 = ox + stalls[i][0];
    const z0 = oz + stalls[i][1];
    const x1 = x0 + 11;
    const z1 = z0 + 11;
    for (let y = BASE; y <= BASE + 3; y++) {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) set(x, y, z, BLOCK.WOOD);
    }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) set(x, BASE + 4, z, BLOCK.CONCRETE);
    const neon = NEON_IDS[(hash3i(ox + i, oz, seed) >>> 3) % NEON_IDS.length];
    for (let x = x0; x <= x1; x += 2) set(x, BASE + 3, z0 - 1, neon);
    set(x0 - 1, BASE + 3, z0 + 5, NEON_IDS[(hash3i(ox, oz + i, seed) >>> 5) % NEON_IDS.length]);
  }
}

function paintTower(voxels, set, seed, ox, oz) {
  for (let rx = 8; rx <= 42; rx++) {
    for (let rz = 8; rz <= 42; rz++) set(ox + rx, SURF, oz + rz, BLOCK.SIDEWALK);
  }
  const s = 20 + Math.floor(rand01(seed ^ 0xa5a5, ox, oz) * 11);
  const x0 = ox + 8 + Math.floor(rand01(seed ^ 0x3c3c, ox + 3, oz) * (36 - s));
  const z0 = oz + 8 + Math.floor(rand01(seed ^ 0x7e7e, ox, oz + 3) * (36 - s));
  const x1 = x0 + s - 1;
  const z1 = z0 + s - 1;
  const h = 12 + Math.floor(rand01(seed ^ 0x9b9b, ox + 9, oz + 9) * 22);
  const top = BASE + h;
  const setback = h >= 22 ? 3 : 0;
  const setbackY = setback ? BASE + Math.floor(h * 0.55) : top + 1;
  const walls = [BLOCK.CONCRETE, BLOCK.BRICK, BLOCK.CONCRETE, BLOCK.METAL];
  const wall = walls[Math.floor(rand01(seed ^ 0x5d5d, ox + 1, oz + 1) * walls.length)];

  for (let y = BASE; y <= top; y++) {
    const inset = y >= setbackY ? setback : 0;
    const xa = x0 + inset;
    const xb = x1 - inset;
    const za = z0 + inset;
    const zb = z1 - inset;
    const roof = y === top;
    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) {
        let cell;
        if (roof) cell = BLOCK.CONCRETE;
        else if (x === xa || x === xb || z === za || z === zb) {
          const along = x === xa || x === xb ? z : x;
          cell = y > BASE && (y - BASE) % 3 === 1 && along % 4 !== 0 ? BLOCK.GLASS : wall;
        } else cell = wall;
        set(x, y, z, cell);
      }
    }
  }

  if (rand01(seed ^ 0xbeef, ox + 2, oz + 2) < 0.55 && top - 7 > BASE) {
    const inset = top >= setbackY ? setback : 0;
    const rect = [x0 + inset, z0 + inset, x1 - inset, z1 - inset];
    const face = Math.floor(rand01(seed ^ 0xfa5e, ox, oz) * 4);
    const neon = NEON_IDS[hash3i(ox + 7, oz + 7, seed) % NEON_IDS.length];
    neonStrip(voxels, set, face, rect, top - 7, top - 1, neon);
  }
}

const PAINTERS = Object.freeze({
  park: paintPark,
  garden: paintGarden,
  plaza: paintPlaza,
  parking: paintParking,
  lot: paintLot,
  row: paintRow,
  corners: paintCorners,
  twin: paintTwin,
  market: paintMarket,
  tower: paintTower
});

export function generateCityChunk(cx, cz, seed) {
  const voxels = new Uint8Array(CHUNK.x * CHUNK.y * CHUNK.z);
  const set = makeWriter(voxels, cx, cz);
  const ox = cx * CHUNK.x;
  const oz = cz * CHUNK.z;

  for (let lz = 0; lz < CHUNK.z; lz++) {
    for (let lx = 0; lx < CHUNK.x; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      const cls = classifyColumn(wx, wz);
      for (let y = 0; y < GROUND; y++) {
        voxels[voxelIndex(lx, y, lz)] = y >= GROUND - 4 ? BLOCK.DIRT : BLOCK.STONE;
      }
      if (cls === 'cross' || cls === 'roadV' || cls === 'roadH') {
        voxels[voxelIndex(lx, GROUND, lz)] = BLOCK.ROAD;
      } else if (cls === 'lineV' || cls === 'lineH') {
        voxels[voxelIndex(lx, GROUND, lz)] = BLOCK.ROAD_LINE;
      } else if (cls === 'walk') {
        voxels[voxelIndex(lx, GROUND, lz)] = BLOCK.STONE;
        voxels[voxelIndex(lx, SURF, lz)] = BLOCK.SIDEWALK;
      } else {
        voxels[voxelIndex(lx, GROUND, lz)] = BLOCK.DIRT;
      }
    }
  }

  const lo = WALK_HALF + 1;
  const hi = SPACING - WALK_HALF - 1;
  for (let bx = 0; bx * SPACING < WORLD.x; bx++) {
    for (let bz = 0; bz * SPACING < WORLD.z; bz++) {
      const wx0 = bx * SPACING + lo;
      const wx1 = bx * SPACING + hi;
      const wz0 = bz * SPACING + lo;
      const wz1 = bz * SPACING + hi;
      if (wx0 < ox || wx1 >= ox + CHUNK.x) continue;
      if (wz0 < oz || wz1 >= oz + CHUNK.z) continue;
      const kind = pickKind(seed, bx, bz);
      PAINTERS[kind](voxels, set, seed, bx * SPACING, bz * SPACING);
    }
  }

  for (let c = 0; c * SPACING < WORLD.x; c++) {
    for (const side of [-6, 6]) {
      const wx = c * SPACING + side;
      if (wx < 0 || wx >= WORLD.x) continue;
      for (let b = 0; b * SPACING < WORLD.z; b++) {
        for (const k of [10, 20, 30, 40]) {
          const wz = b * SPACING + k;
          if (wz < WORLD.z) lampAt(set, seed, wx, wz);
        }
      }
    }
  }
  for (let c = 0; c * SPACING < WORLD.z; c++) {
    for (const side of [-6, 6]) {
      const wz = c * SPACING + side;
      if (wz < 0 || wz >= WORLD.z) continue;
      for (let b = 0; b * SPACING < WORLD.x; b++) {
        for (const k of [10, 20, 30, 40]) {
          const wx = b * SPACING + k;
          if (wx < WORLD.x) lampAt(set, seed, wx, wz);
        }
      }
    }
  }

  return { voxels, cx, cz, seed };
}

export function citySpawn() {
  const cx = GRID.x * CHUNK.x / 2;
  const cz = GRID.z * CHUNK.z / 2;
  return { x: cx + 0.5, y: GROUND + 6, z: cz + 0.5 };
}
