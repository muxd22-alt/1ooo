export const CHUNK = Object.freeze({ x: 100, y: 64, z: 100 });

export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4
});

export const BLOCK_PALETTE = Object.freeze({
  [BLOCK.GRASS]: Object.freeze([0.36, 0.61, 0.27]),
  [BLOCK.DIRT]: Object.freeze([0.47, 0.35, 0.24]),
  [BLOCK.STONE]: Object.freeze([0.53, 0.54, 0.57]),
  [BLOCK.SAND]: Object.freeze([0.85, 0.78, 0.55])
});

export function voxelIndex(x, y, z) {
  return x + CHUNK.x * (y + CHUNK.y * z);
}
