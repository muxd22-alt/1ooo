import { BLOCK } from './blocks.js';
import { PREFAB_POOLS, structurePool, prefabCell } from './prefabs.js';

export const PLANET = Object.freeze({ size: 192, center: 96, radius: 64, maxStruct: 22 });
export const SUB_SIZE = 48;
export const SUBS = PLANET.size / SUB_SIZE;

const R = PLANET.radius;
const DEG = Math.PI / 180;
const ROAD_HALF = 5.5;
const WALK_HALF = 8.5;
const LINE_HALF = 0.75;
const LAMP_NEAR = ROAD_HALF + 0.4;
const LAMP_FAR = ROAD_HALF + 1.8;
export const CITY_MAX_LAT = 45 + WALK_HALF / R / DEG;

const SURF_HI = 0.6;
const STRUCT_LO = -2.4;
const FX0 = 0.21;
const FX1 = 0.79;
const FY0 = 0.18;
const FY1 = 0.82;
const SLOT_W = (FX1 - FX0) / 3;
const SLOT_H = (FY1 - FY0) / 3;
const WALL_V = 1.35 / (SLOT_H * 45 * DEG * R);
const FENCE_V = 1.3 / (SLOT_H * 45 * DEG * R);

const LAMP_IDS = Object.freeze([
  BLOCK.LAMP_WARM,
  BLOCK.LAMP_CYAN,
  BLOCK.LAMP_PINK,
  BLOCK.LAMP_LIME,
  BLOCK.LAMP_AMBER
]);

const NEON_IDS = Object.freeze([BLOCK.NEON_PINK, BLOCK.NEON_CYAN, BLOCK.NEON_AMBER]);

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

export function planetIndex(x, y, z) {
  return x + PLANET.size * (y + PLANET.size * z);
}

export function hash3i(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rand01(seed, a, b) {
  return hash3i(a, b, seed) / 4294967296;
}

export function classifyDirection(lat, lon) {
  const P = Math.PI / 4;
  let dLat = Math.abs(lat);
  const dp = Math.abs(lat - P);
  if (dp < dLat) dLat = dp;
  const dn = Math.abs(lat + P);
  if (dn < dLat) dLat = dn;
  const dLatArc = dLat * R;
  const m = Math.round(lon / P) * P;
  const dLonArc = Math.abs(lon - m) * Math.cos(lat) * R;
  if (Math.abs(lat) > CITY_MAX_LAT * DEG) return 'natural';
  if (dLatArc <= ROAD_HALF && dLonArc <= ROAD_HALF) return 'cross';
  if (dLatArc <= ROAD_HALF) return dLatArc < LINE_HALF ? 'lineH' : 'roadH';
  if (dLonArc <= ROAD_HALF) return dLonArc < LINE_HALF ? 'lineV' : 'roadV';
  if (dLatArc <= WALK_HALF || dLonArc <= WALK_HALF) return 'walk';
  return 'block';
}

export function cellDistrict(cellI, cellJ, seed) {
  return hash3i(cellI + 977, cellJ + 613, seed ^ 0x51ed270b) % DISTRICTS.length;
}

function pickKind(seed, cellI, cellJ, sI, sJ) {
  const district = DISTRICTS[cellDistrict(cellI, cellJ, seed)];
  const entries = Object.entries(district.weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  const a = (cellI << 8) | (cellJ << 7) | (sI << 4) | (sJ << 1);
  let r = rand01(seed ^ 0x9e3779b9, a, a + sI * 13 + sJ * 7 + 1) * total;
  for (const [kind, w] of entries) {
    r -= w;
    if (r < 0) return kind;
  }
  return entries[0][0];
}

const slot = {
  cellI: 0,
  cellJ: 0,
  sI: 0,
  sJ: 0,
  lu: 0,
  lv: 0,
  kind: '',
  slotWvox: 9.6,
  slotHvox: 10.7,
  wallU: 0.14,
  wallV: WALL_V,
  fenceU: 0.14,
  fenceV: FENCE_V
};

function fillSlot(lat, lon, seed) {
  const latDeg = lat / DEG;
  const lonDeg = lon / DEG;
  const cellI = Math.floor((lonDeg + 180) / 45) & 7;
  const cellJ = lat >= 0 ? 1 : 0;
  const fx = (lonDeg + 180 - cellI * 45) / 45;
  const fy = (latDeg + (cellJ === 0 ? 45 : 0)) / 45;
  if (fx < FX0 || fx >= FX1 || fy < FY0 || fy >= FY1) return null;
  const sI = Math.min(2, Math.floor((fx - FX0) / SLOT_W));
  const sJ = Math.min(2, Math.floor((fy - FY0) / SLOT_H));
  slot.lu = (fx - FX0 - sI * SLOT_W) / SLOT_W;
  slot.lv = (fy - FY0 - sJ * SLOT_H) / SLOT_H;
  slot.cellI = cellI;
  slot.cellJ = cellJ;
  slot.sI = sI;
  slot.sJ = sJ;
  slot.kind = pickKind(seed, cellI, cellJ, sI, sJ);
  const cosLat = Math.max(0.55, Math.cos(lat));
  slot.slotWvox = SLOT_W * 45 * DEG * R * cosLat;
  slot.slotHvox = SLOT_H * 45 * DEG * R;
  slot.wallU = 1.35 / slot.slotWvox;
  slot.fenceU = 1.3 / slot.slotWvox;
  return slot;
}

export function slotAt(lat, lon, seed) {
  const s = fillSlot(lat, lon, seed);
  return s ? { ...s } : null;
}

function surfaceClass(cls, lat) {
  switch (cls) {
    case 'cross':
    case 'roadH':
    case 'roadV':
      return BLOCK.ROAD;
    case 'lineH':
    case 'lineV':
      return BLOCK.ROAD_LINE;
    case 'walk':
      return BLOCK.SIDEWALK;
    case 'natural':
      return Math.abs(lat) / DEG > 70 ? BLOCK.SAND : BLOCK.GRASS;
    default:
      return 0;
  }
}

function lampMaterial(lat, lon, h, seed) {
  if (h < -1.3 || h > 4.7) return 0;
  const P = Math.PI / 4;
  let dLat = Math.abs(lat);
  const dp = Math.abs(lat - P);
  if (dp < dLat) dLat = dp;
  const dn = Math.abs(lat + P);
  if (dn < dLat) dLat = dn;
  const dLatArc = dLat * R;
  const m = Math.round(lon / P) * P;
  const dLonArc = Math.abs(lon - m) * Math.cos(lat) * R;
  const step = 12 * DEG;
  let street = 0;
  if (dLatArc > WALK_HALF + 0.5 && dLonArc >= LAMP_NEAR && dLonArc <= LAMP_FAR) {
    if (Math.abs(lat - Math.round(lat / step) * step) * R < 1.25) street = Math.round(lon / P) + 5;
  }
  if (street === 0 && dLonArc > WALK_HALF + 0.5 && dLatArc >= LAMP_NEAR && dLatArc <= LAMP_FAR) {
    if (Math.abs(lon - Math.round(lon / step) * step) * Math.cos(lat) * R < 1.25) {
      street = -(Math.round(lat / P) + 3);
    }
  }
  if (street === 0) return 0;
  if (h <= 3.3) return BLOCK.LAMP_POST;
  if (h <= 4.6) return LAMP_IDS[hash3i(street, 0x5eed, seed ^ 0x10ff5eed) % LAMP_IDS.length];
  return 0;
}

function slotSalt(s, rectIdx) {
  return ((s.cellI * 2 + s.cellJ) * 9 + s.sI * 3 + s.sJ) * 4 + rectIdx;
}

function inRect(s, r) {
  return s.lu >= r[0] && s.lu <= r[1] && s.lv >= r[2] && s.lv <= r[3];
}

function neonMaterial(s, h, rect, height, seed, salt) {
  if (rand01(seed ^ 0xbeef, salt, salt + 7) >= 0.55) return 0;
  if (h < height - 5.5 || h > height - 1.4) return 0;
  const face = Math.floor(rand01(seed ^ 0xfa5e, salt, salt + 11) * 4);
  const id = NEON_IDS[hash3i(salt, face * 3 + 1, seed) % NEON_IDS.length];
  const u0 = rect[0];
  const u1 = rect[1];
  const v0 = rect[2];
  const v1 = rect[3];
  const wl = s.wallU * 1.3;
  const wv = s.wallV * 1.3;
  if (face === 0 && s.lu - u0 < wl) return s.lv > 0.22 && s.lv < 0.78 ? id : 0;
  if (face === 1 && u1 - s.lu < wl) return s.lv > 0.22 && s.lv < 0.78 ? id : 0;
  if (face === 2 && s.lv - v0 < wv) return s.lu > 0.22 && s.lu < 0.78 ? id : 0;
  if (face === 3 && v1 - s.lv < wv) return s.lu > 0.22 && s.lu < 0.78 ? id : 0;
  return 0;
}

const BUILDING_RECT = Object.freeze([0.14, 0.86, 0.14, 0.86]);

function buildingMaterial(s, h, seed) {
  const pool = structurePool(s.kind);
  if (!pool) return 0;
  if (!inRect(s, BUILDING_RECT)) return 0;
  const salt = slotSalt(s, 0);
  const pick = Math.floor(rand01(seed ^ 0x3d3d, salt, salt + 5) * pool.length);
  const p = pool[Math.min(pool.length - 1, pick)];
  const fu = (s.lu - BUILDING_RECT[0]) / (BUILDING_RECT[1] - BUILDING_RECT[0]);
  const fv = (s.lv - BUILDING_RECT[2]) / (BUILDING_RECT[3] - BUILDING_RECT[2]);
  const px = Math.min(p.w - 1, Math.floor(fu * p.w));
  const pz = Math.min(p.d - 1, Math.floor(fv * p.d));
  const m = prefabCell(p, px, Math.floor(h - STRUCT_LO), pz);
  if (!m) return 0;
  const top = STRUCT_LO + p.h - 1;
  return neonMaterial(s, h, BUILDING_RECT, top, seed, salt) || m;
}

function treeMaterial(s, h, seed, salt, count) {
  if (h < -1.5 || h > 12) return 0;
  const pool = PREFAB_POOLS.tree;
  for (let i = 0; i < count; i++) {
    const tx = 0.28 + rand01(seed ^ (0x1100 + i), salt, salt + i) * 0.44;
    const tz = 0.28 + rand01(seed ^ (0x2200 + i), salt + i, salt) * 0.44;
    const p = pool[hash3i(i * 5 + 2, salt, seed ^ 0x7e3d) % pool.length];
    const px = Math.floor((s.lu - tx) * s.slotWvox + p.w / 2);
    const pz = Math.floor((s.lv - tz) * s.slotHvox + p.d / 2);
    if (px < 0 || pz < 0 || px >= p.w || pz >= p.d) continue;
    const m = prefabCell(p, px, Math.floor(h + 1.5), pz);
    if (m) return m;
  }
  return 0;
}

function parkMaterial(s, h, seed) {
  const salt = slotSalt(s, 0);
  const count = 3 + (hash3i(s.cellI, s.cellJ * 9 + s.sI, seed ^ 0x77) % 4);
  return treeMaterial(s, h, seed, salt, count);
}

function gardenMaterial(s, h, seed) {
  const salt = slotSalt(s, 0);
  const count = 1 + (hash3i(s.sI, s.sJ * 5 + s.cellI, seed ^ 0x99) % 3);
  return treeMaterial(s, h, seed, salt, count);
}

function fountainMaterial(s, h) {
  const dxn = (s.lu - 0.5) * 2;
  const dzn = (s.lv - 0.5) * 2;
  const dn = Math.sqrt(dxn * dxn + dzn * dzn);
  if (dn < 0.13) {
    if (h > -1.4 && h <= 3.4) return BLOCK.METAL;
    if (h > 3.4 && h <= 4.3) return BLOCK.LAMP_WARM;
    return 0;
  }
  if (dn >= 0.6 && dn < 0.78 && h > -1.4 && h <= 1.5) return BLOCK.CONCRETE;
  if (dn < 0.6 && h > -1.4 && h <= SURF_HI) return BLOCK.WATER;
  return 0;
}

function onFenceEdge(s) {
  return s.lu < s.fenceU || s.lu > 1 - s.fenceU || s.lv < s.fenceV || s.lv > 1 - s.fenceV;
}

function parkingMaterial(s, h, seed) {
  const cornerA = s.lu < 0.17 && s.lv < 0.17;
  const cornerB = s.lu > 0.83 && s.lv > 0.83;
  if (cornerA || cornerB) {
    if (h > -1.4 && h <= 2.4) return BLOCK.LAMP_POST;
    if (h > 2.4 && h <= 3.7) {
      const salt = slotSalt(s, cornerA ? 1 : 2);
      return LAMP_IDS[hash3i(salt, s.cellJ * 4 + s.sI, seed ^ 0x10ff5eed) % LAMP_IDS.length];
    }
  }
  if (h > -1.4 && h <= 1.5 && onFenceEdge(s)) return BLOCK.FENCE;
  return 0;
}

function lotMaterial(s, h) {
  if (s.lu >= 0.3 && s.lu <= 0.7 && s.lv >= 0.3 && s.lv <= 0.7 && h > -1.5 && h <= 3.2) {
    if (h > 2.5) return BLOCK.CONCRETE;
    const boundary =
      s.lu < 0.3 + s.wallU || s.lu > 0.7 - s.wallU || s.lv < 0.3 + s.wallV || s.lv > 0.7 - s.wallV;
    if (boundary && s.lv < 0.3 + s.wallV * 1.5 && h > -0.6 && h < 1.7) return BLOCK.GLASS;
    return BLOCK.CONCRETE;
  }
  if (h > -1.4 && h <= 1.5 && onFenceEdge(s)) return BLOCK.FENCE;
  return 0;
}

function slotStructure(s, h, seed) {
  if (h < STRUCT_LO || h > PLANET.maxStruct) return 0;
  switch (s.kind) {
    case 'tower':
    case 'twin':
    case 'row':
    case 'corners':
    case 'market':
      return buildingMaterial(s, h, seed);
    case 'park':
      return parkMaterial(s, h, seed);
    case 'garden':
      return gardenMaterial(s, h, seed);
    case 'plaza':
      return fountainMaterial(s, h);
    case 'parking':
      return parkingMaterial(s, h, seed);
    case 'lot':
      return lotMaterial(s, h);
    default:
      return 0;
  }
}

function parkingStripe(s) {
  if (s.lv < 0.16 || s.lv > 0.84) return false;
  const t = s.lu * 4;
  const k = Math.round(t);
  if (k < 1 || k > 3) return false;
  const tol = Math.min(0.49, 3 / s.slotWvox);
  return Math.abs(t - k) < tol;
}

function slotSurface(s, h) {
  switch (s.kind) {
    case 'park':
    case 'garden':
    case 'lot':
      return BLOCK.GRASS;
    case 'plaza':
      return BLOCK.PLAZA;
    case 'parking':
      return parkingStripe(s) ? BLOCK.ROAD_LINE : BLOCK.LOT;
    default:
      return BLOCK.SIDEWALK;
  }
}

export function generatePlanet(seed) {
  const S = PLANET.size;
  const C = PLANET.center;
  const voxels = new Uint8Array(S * S * S);
  const hiR2 = (R + PLANET.maxStruct + 1) * (R + PLANET.maxStruct + 1);
  const dirtR2 = (R - 3) * (R - 3);
  const stoneR2 = (R - 7) * (R - 7);

  for (let z = 0; z < S; z++) {
    const dz = z + 0.5 - C;
    const dz2 = dz * dz;
    for (let y = 0; y < S; y++) {
      const dy = y + 0.5 - C;
      const dyz = dy * dy + dz2;
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - C;
        const r2 = dx * dx + dyz;
        if (r2 > hiR2) continue;
        const idx = x + S * (y + S * z);
        if (r2 < dirtR2) {
          voxels[idx] = r2 < stoneR2 ? BLOCK.STONE : BLOCK.DIRT;
          continue;
        }
        const d = Math.sqrt(r2);
        const h = d - R;
        const lat = Math.asin(dy / d);
        const lon = Math.atan2(dz, dx);
        const cls = classifyDirection(lat, lon);
        let mat = 0;
        if (cls === 'block') {
          const s = fillSlot(lat, lon, seed);
          if (s) {
            mat = slotStructure(s, h, seed);
            if (!mat && h <= SURF_HI) mat = slotSurface(s, h);
          } else if (h <= SURF_HI) {
            mat = BLOCK.SIDEWALK;
          }
        } else {
          if (h <= SURF_HI) mat = surfaceClass(cls, lat);
          if (cls === 'walk') {
            const lamp = lampMaterial(lat, lon, h, seed);
            if (lamp) mat = lamp;
          }
        }
        if (mat !== 0) voxels[idx] = mat;
      }
    }
  }
  return voxels;
}

export function planetSpawn() {
  const C = PLANET.center;
  return { x: C + PLANET.radius + 2.5, y: C, z: C };
}
