export const CHUNK = Object.freeze({ x: 100, y: 64, z: 100 });

export const BLOCK = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  ROAD: 5,
  ROAD_LINE: 6,
  SIDEWALK: 7,
  BRICK: 8,
  CONCRETE: 9,
  GLASS: 10,
  METAL: 11,
  WOOD: 12,
  LAMP_POST: 13,
  LAMP_WARM: 14,
  LAMP_CYAN: 15,
  LAMP_PINK: 16,
  LAMP_LIME: 17,
  LAMP_AMBER: 18,
  FENCE: 19,
  LEAVES: 20,
  TRUNK: 21,
  WATER: 22,
  PLAZA: 23,
  LOT: 24,
  NEON_PINK: 25,
  NEON_CYAN: 26,
  NEON_AMBER: 27
});

export const BLOCK_PALETTE = Object.freeze({
  [BLOCK.GRASS]: Object.freeze([0.36, 0.61, 0.27]),
  [BLOCK.DIRT]: Object.freeze([0.47, 0.35, 0.24]),
  [BLOCK.STONE]: Object.freeze([0.53, 0.54, 0.57]),
  [BLOCK.SAND]: Object.freeze([0.85, 0.78, 0.55]),
  [BLOCK.ROAD]: Object.freeze([0.15, 0.15, 0.16]),
  [BLOCK.ROAD_LINE]: Object.freeze([0.92, 0.86, 0.42]),
  [BLOCK.SIDEWALK]: Object.freeze([0.66, 0.66, 0.63]),
  [BLOCK.BRICK]: Object.freeze([0.62, 0.33, 0.27]),
  [BLOCK.CONCRETE]: Object.freeze([0.74, 0.74, 0.76]),
  [BLOCK.GLASS]: Object.freeze([0.45, 0.62, 0.72]),
  [BLOCK.METAL]: Object.freeze([0.58, 0.61, 0.66]),
  [BLOCK.WOOD]: Object.freeze([0.55, 0.41, 0.27]),
  [BLOCK.LAMP_POST]: Object.freeze([0.32, 0.33, 0.36]),
  [BLOCK.LAMP_WARM]: Object.freeze([1.0, 0.94, 0.78]),
  [BLOCK.LAMP_CYAN]: Object.freeze([0.55, 0.95, 1.0]),
  [BLOCK.LAMP_PINK]: Object.freeze([1.0, 0.6, 0.8]),
  [BLOCK.LAMP_LIME]: Object.freeze([0.7, 1.0, 0.6]),
  [BLOCK.LAMP_AMBER]: Object.freeze([1.0, 0.8, 0.4]),
  [BLOCK.FENCE]: Object.freeze([0.3, 0.32, 0.36]),
  [BLOCK.LEAVES]: Object.freeze([0.24, 0.5, 0.22]),
  [BLOCK.TRUNK]: Object.freeze([0.42, 0.31, 0.2]),
  [BLOCK.WATER]: Object.freeze([0.2, 0.48, 0.85]),
  [BLOCK.PLAZA]: Object.freeze([0.76, 0.73, 0.68]),
  [BLOCK.LOT]: Object.freeze([0.4, 0.4, 0.44]),
  [BLOCK.NEON_PINK]: Object.freeze([1.0, 0.25, 0.55]),
  [BLOCK.NEON_CYAN]: Object.freeze([0.3, 0.95, 1.0]),
  [BLOCK.NEON_AMBER]: Object.freeze([1.0, 0.65, 0.2])
});

export const BLOCK_EMISSIVE = Object.freeze({
  [BLOCK.GLASS]: Object.freeze([0.05, 0.05, 0.06]),
  [BLOCK.LAMP_WARM]: Object.freeze([1.0, 0.9, 0.65]),
  [BLOCK.LAMP_CYAN]: Object.freeze([0.4, 0.9, 1.0]),
  [BLOCK.LAMP_PINK]: Object.freeze([1.0, 0.45, 0.7]),
  [BLOCK.LAMP_LIME]: Object.freeze([0.6, 1.0, 0.45]),
  [BLOCK.LAMP_AMBER]: Object.freeze([1.0, 0.7, 0.3]),
  [BLOCK.NEON_PINK]: Object.freeze([1.0, 0.2, 0.5]),
  [BLOCK.NEON_CYAN]: Object.freeze([0.2, 0.9, 1.0]),
  [BLOCK.NEON_AMBER]: Object.freeze([1.0, 0.6, 0.15])
});

export const BLOCK_NAMES = Object.freeze({
  [BLOCK.AIR]: 'Air',
  [BLOCK.GRASS]: 'Grass',
  [BLOCK.DIRT]: 'Dirt',
  [BLOCK.STONE]: 'Stone',
  [BLOCK.SAND]: 'Sand',
  [BLOCK.ROAD]: 'Road',
  [BLOCK.ROAD_LINE]: 'Road Line',
  [BLOCK.SIDEWALK]: 'Sidewalk',
  [BLOCK.BRICK]: 'Brick',
  [BLOCK.CONCRETE]: 'Concrete',
  [BLOCK.GLASS]: 'Glass',
  [BLOCK.METAL]: 'Metal',
  [BLOCK.WOOD]: 'Wood',
  [BLOCK.LAMP_POST]: 'Lamp Post',
  [BLOCK.LAMP_WARM]: 'Warm Lamp',
  [BLOCK.LAMP_CYAN]: 'Cyan Lamp',
  [BLOCK.LAMP_PINK]: 'Pink Lamp',
  [BLOCK.LAMP_LIME]: 'Lime Lamp',
  [BLOCK.LAMP_AMBER]: 'Amber Lamp',
  [BLOCK.FENCE]: 'Fence',
  [BLOCK.LEAVES]: 'Leaves',
  [BLOCK.TRUNK]: 'Trunk',
  [BLOCK.WATER]: 'Water',
  [BLOCK.PLAZA]: 'Plaza',
  [BLOCK.LOT]: 'Parking Lot',
  [BLOCK.NEON_PINK]: 'Neon Pink',
  [BLOCK.NEON_CYAN]: 'Neon Cyan',
  [BLOCK.NEON_AMBER]: 'Neon Amber'
});

export function voxelIndex(x, y, z) {
  return x + CHUNK.x * (y + CHUNK.y * z);
}
