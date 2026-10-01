function inBounds(x, y, z, sx, sy, sz) {
  return x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz;
}

function getVoxel(voxels, sx, sy, sz, x, y, z) {
  return inBounds(x, y, z, sx, sy, sz) ? voxels[x + sx * (y + sy * z)] : 0;
}

/**
 * Amanatides & Woo grid traversal. `dir` must be normalized.
 * Returns the first solid voxel along the ray or null.
 */
export function raycastVoxels(voxels, sx, sy, sz, origin, dir, maxDist) {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;

  let tmin = 0;
  let tmax = maxDist;

  const bounds = [
    [ox, dx, sx],
    [oy, dy, sy],
    [oz, dz, sz]
  ];
  for (const [o, d, size] of bounds) {
    if (Math.abs(d) < 1e-9) {
      if (o < 0 || o > size) return null;
      continue;
    }
    let t1 = (0 - o) / d;
    let t2 = (size - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  const start = tmin + 1e-4;
  let px = ox + dx * start;
  let py = oy + dy * start;
  let pz = oz + dz * start;

  let ix = Math.floor(px);
  let iy = Math.floor(py);
  let iz = Math.floor(pz);

  if (!inBounds(ix, iy, iz, sx, sy, sz)) {
    ix = Math.min(sx - 1, Math.max(0, ix));
    iy = Math.min(sy - 1, Math.max(0, iy));
    iz = Math.min(sz - 1, Math.max(0, iz));
    if (!inBounds(ix, iy, iz, sx, sy, sz)) return null;
  }

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx !== 0 ? ((dx > 0 ? ix + 1 : ix) - px) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? iy + 1 : iy) - py) / dy : Infinity;
  let tMaxZ = dz !== 0 ? ((dz > 0 ? iz + 1 : iz) - pz) / dz : Infinity;

  let t = start;

  for (;;) {
    const block = getVoxel(voxels, sx, sy, sz, ix, iy, iz);
    if (block !== 0) {
      return { x: ix, y: iy, z: iz, block, distance: t, point: [ox + dx * t, oy + dy * t, oz + dz * t] };
    }

    let next;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      next = tMaxX;
      ix += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      next = tMaxY;
      iy += stepY;
      tMaxY += tDeltaY;
    } else {
      next = tMaxZ;
      iz += stepZ;
      tMaxZ += tDeltaZ;
    }

    const total = start + next;
    if (total > maxDist) return null;
    if (!inBounds(ix, iy, iz, sx, sy, sz)) return null;
    t = total;
  }
}

export function subtractSphere(voxels, sx, sy, sz, center, radius) {
  const [cx, cy, cz] = center;
  const r2 = radius * radius;
  if (r2 <= 0) return 0;

  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(sx - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(sy - 1, Math.ceil(cy + radius));
  const z0 = Math.max(0, Math.floor(cz - radius));
  const z1 = Math.min(sz - 1, Math.ceil(cz + radius));

  let removed = 0;
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dz = z + 0.5 - cz;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        const idx = x + sx * (y + sy * z);
        if (voxels[idx] !== 0) {
          voxels[idx] = 0;
          removed++;
        }
      }
    }
  }
  return removed;
}
