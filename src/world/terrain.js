import { BLOCK, CHUNK, voxelIndex } from './blocks.js';

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x, z, seed, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, z * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function generateChunk(seed) {
  const sx = CHUNK.x;
  const sy = CHUNK.y;
  const sz = CHUNK.z;
  const voxels = new Uint8Array(sx * sy * sz);
  const heights = new Int16Array(sx * sz);

  let peak = 0;
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const base = fbm2(x * 0.035, z * 0.035, seed, 4);
      const detail = fbm2(x * 0.09 + 31.7, z * 0.09 - 12.3, seed ^ 0x9e3779b9, 3);
      let h = Math.floor(6 + base * 34 + detail * 8);
      h = Math.max(1, Math.min(sy - 2, h));
      heights[x + z * sx] = h;
      if (h > peak) peak = h;

      const sandy = h <= 12;
      for (let y = 0; y <= h; y++) {
        let block;
        if (y === h) block = sandy ? BLOCK.SAND : BLOCK.GRASS;
        else if (y >= h - 3) block = sandy ? BLOCK.SAND : BLOCK.DIRT;
        else block = BLOCK.STONE;
        voxels[voxelIndex(x, y, z)] = block;
      }
    }
  }

  const cx = sx >> 1;
  const cz = sz >> 1;
  const spawn = { x: cx + 0.5, y: heights[cx + cz * sx] + 4, z: cz + 0.5 };

  return { voxels, heights, spawn, peak, seed };
}
