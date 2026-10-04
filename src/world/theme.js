import { BLOCK } from './blocks.js';

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

function toHex(rgb) {
  const r = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
  return ((r << 16) | (g << 8) | b) >>> 0;
}

function glow(rgb, peak) {
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  return [(rgb[0] / m) * peak, (rgb[1] / m) * peak, (rgb[2] / m) * peak];
}

const ADJECTIVES = Object.freeze([
  'Amber',
  'Verdant',
  'Neon',
  'Dusty',
  'Cobalt',
  'Ivory',
  'Crimson',
  'Hollow',
  'Radiant',
  'Mossy',
  'Solar',
  'Frost',
  'Umber',
  'Violet',
  'Coral',
  'Onyx'
]);

const NOUNS = Object.freeze([
  'Meridian',
  'Harbor',
  'Ember',
  'Vault',
  'Basin',
  'Spire',
  'Terrace',
  'Quarry',
  'Delta',
  'Mesa',
  'Lagoon',
  'Crater',
  'Ridge',
  'Hollow',
  'Atoll',
  'Forge'
]);

export function makeTheme(seed) {
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const h1 = rand() * 360;
  const h2 = (h1 + 140 + rand() * 80) % 360;
  const h3 = rand() * 360;
  const hSky = rand() * 360;
  const satNature = 0.4 + rand() * 0.4;
  const satMuted = 0.08 + rand() * 0.22;
  const litNature = 0.3 + rand() * 0.2;

  const grass = hslToRgb(h1, satNature, litNature + 0.06);
  const leaves = hslToRgb(h1 + 10, Math.min(1, satNature * 1.1), litNature);
  const lampHues = [0, 72, 144, 216, 288].map((o) => hslToRgb(h3 + o, 0.85, 0.62));
  const neon = [hslToRgb(h3, 0.9, 0.6), hslToRgb(h3 + 120, 0.9, 0.6), hslToRgb(h3 + 240, 0.9, 0.6)];

  const palette = {
    [BLOCK.GRASS]: grass,
    [BLOCK.DIRT]: hslToRgb(h1 + 16, satNature * 0.75, litNature - 0.08),
    [BLOCK.STONE]: hslToRgb(h1, satMuted * 0.6, 0.5),
    [BLOCK.SAND]: hslToRgb(h1 + 35, satMuted + 0.25, 0.75),
    [BLOCK.ROAD]: hslToRgb(h1, satMuted * 0.5, 0.13 + rand() * 0.04),
    [BLOCK.ROAD_LINE]: hslToRgb(h2, 0.8, 0.62),
    [BLOCK.SIDEWALK]: hslToRgb(h1, satMuted, 0.62),
    [BLOCK.BRICK]: hslToRgb(h2, 0.4 + rand() * 0.2, 0.45),
    [BLOCK.CONCRETE]: hslToRgb(h2, satMuted, 0.7),
    [BLOCK.GLASS]: hslToRgb(h2, 0.45, 0.55),
    [BLOCK.METAL]: hslToRgb(h2, satMuted * 0.9, 0.5),
    [BLOCK.WOOD]: hslToRgb(h1 + 28, 0.35, 0.38),
    [BLOCK.LAMP_POST]: hslToRgb(h1, 0.12, 0.22),
    [BLOCK.LAMP_WARM]: lampHues[0],
    [BLOCK.LAMP_CYAN]: lampHues[1],
    [BLOCK.LAMP_PINK]: lampHues[2],
    [BLOCK.LAMP_LIME]: lampHues[3],
    [BLOCK.LAMP_AMBER]: lampHues[4],
    [BLOCK.FENCE]: hslToRgb(h2, 0.25, 0.3),
    [BLOCK.LEAVES]: leaves,
    [BLOCK.TRUNK]: hslToRgb(h1 + 24, satNature * 0.6, 0.26),
    [BLOCK.WATER]: hslToRgb(h2 + 40, 0.5, 0.5),
    [BLOCK.PLAZA]: hslToRgb(h1 + 8, satMuted * 1.4, 0.72),
    [BLOCK.LOT]: hslToRgb(h1, satMuted * 0.8, 0.35),
    [BLOCK.NEON_PINK]: neon[0],
    [BLOCK.NEON_CYAN]: neon[1],
    [BLOCK.NEON_AMBER]: neon[2]
  };

  const emissive = {
    [BLOCK.GLASS]: [palette[BLOCK.GLASS][0] * 0.12, palette[BLOCK.GLASS][1] * 0.12, palette[BLOCK.GLASS][2] * 0.12],
    [BLOCK.LAMP_WARM]: glow(lampHues[0], 1),
    [BLOCK.LAMP_CYAN]: glow(lampHues[1], 1),
    [BLOCK.LAMP_PINK]: glow(lampHues[2], 1),
    [BLOCK.LAMP_LIME]: glow(lampHues[3], 1),
    [BLOCK.LAMP_AMBER]: glow(lampHues[4], 1),
    [BLOCK.NEON_PINK]: glow(neon[0], 1),
    [BLOCK.NEON_CYAN]: glow(neon[1], 1),
    [BLOCK.NEON_AMBER]: glow(neon[2], 1)
  };

  const name = `${ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]} ${NOUNS[Math.floor(rand() * NOUNS.length)]}`;

  return {
    seed,
    name,
    palette,
    emissive,
    sky: toHex(hslToRgb(hSky, 0.3 + rand() * 0.3, 0.58 + rand() * 0.14)),
    skyNight: toHex(hslToRgb(hSky, 0.45, 0.05 + rand() * 0.05)),
    dusk: toHex(hslToRgb(hSky + 30, 0.7, 0.55)),
    sun: toHex(hslToRgb(hSky - 20 + rand() * 40, 0.2 + rand() * 0.3, 0.75)),
    moon: toHex(hslToRgb(hSky + 180, 0.25, 0.72)),
    hemiSky: toHex(hslToRgb(hSky, 0.35, 0.65)),
    hemiGround: toHex(hslToRgb(h1, satNature * 0.9, litNature * 0.7))
  };
}
