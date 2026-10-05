import { PLANET, ROAD_HALF, WALK_HALF, CITY_MAX_LAT } from './planet.js';
import { BLOCK } from './blocks.js';

const STEP = 0.5;
const TAP = 5.5;
const TAP_CLAMP = 1;
const STRENGTH = 0.82;
const MAX_DELTA = 0.45;
const SIDE_RISE = 0.16;
const WALK_FADE = 0.7;
const DEG = Math.PI / 180;
const GRID = Math.PI / 4;
const R = PLANET.radius;
const PREFAB_MIN = 32;

function structural(v) {
  return (v >= BLOCK.NEON_PINK && v <= BLOCK.NEON_AMBER) || v >= PREFAB_MIN;
}

export function createDisplace(voxels, size, center, radius, memo = new Map()) {
  const [cx, cy, cz] = center;
  const rMin = radius - 8;
  const rMax = radius + 40;
  const scratch = [0, 0, 0];
  const kMemo = new Map();

  const get = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size ? 0 : voxels[x + size * (y + size * z)];

  function dirKey(ux, uy, uz) {
    const kx = Math.min(511, Math.max(0, Math.round(ux * 255.5) + 255));
    const ky = Math.min(511, Math.max(0, Math.round(uy * 255.5) + 255));
    const kz = Math.min(511, Math.max(0, Math.round(uz * 255.5) + 255));
    return (kx << 18) | (ky << 9) | kz;
  }

  function posKey(wx, wy, wz) {
    const qx = Math.round(wx * 4) + 16;
    const qy = Math.round(wy * 4) + 16;
    const qz = Math.round(wz * 4) + 16;
    if (qx < 0 || qy < 0 || qz < 0 || qx > 1023 || qy > 1023 || qz > 1023) return -1;
    return (qx << 20) | (qy << 10) | qz;
  }

  function columnRadius(ux, uy, uz, key) {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r = radius + 27;
    let result = NaN;
    let skipped = false;
    while (r > rMin) {
      r -= STEP;
      const v = get(Math.floor(cx + ux * r), Math.floor(cy + uy * r), Math.floor(cz + uz * r));
      if (v === 0) continue;
      if (structural(v)) {
        skipped = true;
        continue;
      }
      result = skipped ? NaN : r + STEP * 0.5;
      break;
    }
    memo.set(key, result);
    return result;
  }

  function surfaceOffset(lat, lon) {
    if (Math.abs(lat) > CITY_MAX_LAT * DEG) return 0;
    let dLat = Math.abs(lat);
    const dp = Math.abs(lat - GRID);
    if (dp < dLat) dLat = dp;
    const dn = Math.abs(lat + GRID);
    if (dn < dLat) dLat = dn;
    const dLatArc = dLat * R;
    const m = Math.round(lon / GRID) * GRID;
    const dLonArc = Math.abs(lon - m) * Math.cos(lat) * R;
    const d = Math.min(dLatArc, dLonArc);
    if (d <= ROAD_HALF) return 0;
    if (d >= WALK_HALF + WALK_FADE) return 0;
    if (d <= WALK_HALF) {
      const u = (d - ROAD_HALF) / (WALK_HALF - ROAD_HALF);
      return SIDE_RISE * u * u * (3 - 2 * u);
    }
    return SIDE_RISE * (1 - (d - WALK_HALF) / WALK_FADE);
  }

  const taps = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const radii = new Float64Array(5);
  const srs = new Float64Array(5);

  function computeK(wx, wy, wz) {
    const dx = wx - cx;
    const dy = wy - cy;
    const dz = wz - cz;
    const r = Math.hypot(dx, dy, dz);
    if (!(r > 1e-6) || r < rMin || r > rMax + 2) return 1;
    const ux = dx / r;
    const uy = dy / r;
    const uz = dz / r;

    let ax = 0;
    let ay = 1;
    let az = 0;
    if (Math.abs(uy) > 0.95) ax = 1;
    let t1x = ay * uz - az * uy;
    let t1y = az * ux - ax * uz;
    let t1z = ax * uy - ay * ux;
    const t1len = Math.hypot(t1x, t1y, t1z) || 1;
    t1x /= t1len;
    t1y /= t1len;
    t1z /= t1len;
    const t2x = uy * t1z - uz * t1y;
    const t2y = uz * t1x - ux * t1z;
    const t2z = ux * t1y - uy * t1x;

    taps[0][0] = wx;
    taps[0][1] = wy;
    taps[0][2] = wz;
    taps[1][0] = wx + t1x * TAP;
    taps[1][1] = wy + t1y * TAP;
    taps[1][2] = wz + t1z * TAP;
    taps[2][0] = wx - t1x * TAP;
    taps[2][1] = wy - t1y * TAP;
    taps[2][2] = wz - t1z * TAP;
    taps[3][0] = wx + t2x * TAP;
    taps[3][1] = wy + t2y * TAP;
    taps[3][2] = wz + t2z * TAP;
    taps[4][0] = wx - t2x * TAP;
    taps[4][1] = wy - t2y * TAP;
    taps[4][2] = wz - t2z * TAP;

    let rawN = 0;
    for (let i = 0; i < 5; i++) {
      const ddx = taps[i][0] - cx;
      const ddy = taps[i][1] - cy;
      const ddz = taps[i][2] - cz;
      const dr = Math.hypot(ddx, ddy, ddz);
      radii[i] = dr;
      srs[i] = NaN;
      if (!(dr > 1e-6)) continue;
      const sux = ddx / dr;
      const suy = ddy / dr;
      const suz = ddz / dr;
      const sr = columnRadius(sux, suy, suz, dirKey(sux, suy, suz));
      srs[i] = sr;
      if (!Number.isNaN(sr)) rawN++;
    }
    if (rawN < 3) return 1;

    let sum = 0;
    let n = 0;
    for (let i = 0; i < 5; i++) {
      if (Number.isNaN(srs[i])) continue;
      let sr = srs[i];
      const tr = radii[i];
      if (sr > tr + TAP_CLAMP) sr = tr + TAP_CLAMP;
      else if (sr < tr - TAP_CLAMP) sr = tr - TAP_CLAMP;
      sum += sr;
      n++;
    }
    if (!n) return 1;

    let delta = (sum / n - r) * STRENGTH;
    if (delta > MAX_DELTA) delta = MAX_DELTA;
    else if (delta < -MAX_DELTA) delta = -MAX_DELTA;
    const lat = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    delta += surfaceOffset(lat, Math.atan2(dz, dx));
    if (delta > MAX_DELTA + SIDE_RISE) delta = MAX_DELTA + SIDE_RISE;
    if (Math.abs(delta) < 1e-4) return 1;
    return (r + delta) / r;
  }

  return function displace(wx, wy, wz) {
    const pk = posKey(wx, wy, wz);
    let k = pk < 0 ? undefined : kMemo.get(pk);
    if (k === undefined) {
      k = computeK(wx, wy, wz);
      if (pk >= 0) kMemo.set(pk, k);
    }
    if (k === 1) {
      scratch[0] = wx;
      scratch[1] = wy;
      scratch[2] = wz;
      return scratch;
    }
    scratch[0] = cx + (wx - cx) * k;
    scratch[1] = cy + (wy - cy) * k;
    scratch[2] = cz + (wz - cz) * k;
    return scratch;
  };
}
