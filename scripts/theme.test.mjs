import { BLOCK } from '../src/world/blocks.js';
import { makeTheme } from '../src/world/theme.js';
import { PREFAB_IDS } from '../src/world/prefabPalette.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const ids = Object.values(BLOCK).filter((id) => id !== BLOCK.AIR);

const a = makeTheme(1337);
const b = makeTheme(1337);
const c = makeTheme(90210);

assert(JSON.stringify(a) === JSON.stringify(b), 'same seed yields identical theme');
assert(JSON.stringify(a) !== JSON.stringify(c), 'different seeds yield different themes');

for (const id of ids) {
  const rgb = a.palette[id];
  assert(Array.isArray(rgb) && rgb.length === 3, `palette entry for block ${id} is rgb triple`);
  for (const ch of rgb) {
    assert(Number.isFinite(ch), `palette[${id}] non-finite channel`);
    assert(ch >= 0 && ch <= 1, `palette[${id}] channel out of range: ${ch}`);
  }
}

for (const [id, rgb] of Object.entries(a.emissive)) {
  assert(ids.includes(Number(id)) || PREFAB_IDS.includes(Number(id)), `emissive key ${id} is a known block id`);
  assert(rgb.length === 3, `emissive[${id}] is rgb triple`);
  for (const ch of rgb) {
    assert(Number.isFinite(ch), `emissive[${id}] non-finite channel`);
    assert(ch >= 0 && ch <= 1.0001, `emissive[${id}] channel out of range: ${ch}`);
  }
}

const lampIds = [
  BLOCK.LAMP_WARM,
  BLOCK.LAMP_CYAN,
  BLOCK.LAMP_PINK,
  BLOCK.LAMP_LIME,
  BLOCK.LAMP_AMBER,
  BLOCK.NEON_PINK,
  BLOCK.NEON_CYAN,
  BLOCK.NEON_AMBER,
  BLOCK.GLASS
];
for (const id of lampIds) {
  assert(a.emissive[id], `emissive block ${id} missing from theme emissive map`);
}

for (const key of ['sky', 'skyNight', 'dusk', 'sun', 'moon', 'hemiSky', 'hemiGround']) {
  const value = a[key];
  assert(Number.isInteger(value), `${key} is an integer color`);
  assert(value >= 0 && value <= 0xffffff, `${key} outside 24-bit color range: ${value}`);
}

assert(typeof a.name === 'string' && a.name.length >= 3, 'theme has a readable name');
assert(a.name.includes(' '), `theme name has adjective + noun (got "${a.name}")`);
assert(a.seed === 1337, 'theme keeps its seed');

const nature = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.LEAVES, BLOCK.WOOD]);
for (const id of nature) {
  const [r, g, bl] = a.palette[id];
  assert(r + g + bl > 0.02, `block ${id} is not near-black`);
}

console.log(`OK  theme tests passed (${a.name} vs ${c.name})`);
