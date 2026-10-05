const STEP = 0.5;
const TAP = 1.0;
const RAW_SKIP = 3;
const TAP_CLAMP = 1;
const STRENGTH = 0.7;
const MAX_DELTA = 0.35;

export function createDisplace(voxels, size, center, radius, memo = new Map()) {
  const [cx, cy, cz] = center;
  const rMin = radius - 8;
  const rMax = radius + 40;
  const scratch = [0, 0, 0];

  const get = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size ? 0 : voxels[x + size * (y + size * z)];

  function dirKey(ux, uy, uz) {
    const kx = Math.min(1023, Math.max(0, Math.round(ux * 511.5) + 511));
    const ky = Math.min(1023, Math.max(0, Math.round(uy * 511.5) + 511));
    const kz = Math.min(1023, Math.max(0, Math.round(uz * 511.5) + 511));
    return (kx << 20) | (ky << 10) | kz;
  }

  function columnRadius(ux, uy, uz, key) {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let r = rMax + 1;
    let result = NaN;
    while (r > rMin) {
      r -= STEP;
      if (get(Math.floor(cx + ux * r), Math.floor(cy + uy * r), Math.floor(cz + uz * r)) !== 0) {
        result = r + STEP * 0.5;
        break;
      }
    }
    memo.set(key, result);
    return result;
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

  return function displace(wx, wy, wz) {
    const dx = wx - cx;
    const dy = wy - cy;
    const dz = wz - cz;
    const r = Math.hypot(dx, dy, dz);
    if (!(r > 1e-6) || r < rMin || r > rMax + 2) {
      scratch[0] = wx;
      scratch[1] = wy;
      scratch[2] = wz;
      return scratch;
    }
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

    let raw = 0;
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
      if (Number.isNaN(sr)) continue;
      raw += sr;
      rawN++;
    }
    if (rawN < 3 || Math.abs(raw / rawN - r) > RAW_SKIP) {
      scratch[0] = wx;
      scratch[1] = wy;
      scratch[2] = wz;
      return scratch;
    }

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
    if (!n) {
      scratch[0] = wx;
      scratch[1] = wy;
      scratch[2] = wz;
      return scratch;
    }
    let delta = (sum / n - r) * STRENGTH;
    if (delta > MAX_DELTA) delta = MAX_DELTA;
    else if (delta < -MAX_DELTA) delta = -MAX_DELTA;
    if (Math.abs(delta) < 1e-4) {
      scratch[0] = wx;
      scratch[1] = wy;
      scratch[2] = wz;
      return scratch;
    }
    const k = (r + delta) / r;
    scratch[0] = cx + dx * k;
    scratch[1] = cy + dy * k;
    scratch[2] = cz + dz * k;
    return scratch;
  };
}
