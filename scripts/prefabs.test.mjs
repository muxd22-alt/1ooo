import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFAB_NAMES, PREFAB_POOLS, structurePool, prefabCell } from '../src/world/prefabs.js';
import { PREFAB_COLORS, PREFAB_EMISSIVE, PREFAB_IDS } from '../src/world/prefabPalette.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(ROOT, 'data', 'prefabs'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));
const imported = new Set(PREFAB_NAMES);
assert(files.length === imported.size, `file/import count ${files.length} vs ${imported.size}`);
for (const name of files) assert(imported.has(name), `data/prefabs/${name}.json not imported by prefabs.js`);

const pools = ['tower', 'mid', 'low', 'shop', 'tree'];
for (const kind of pools) {
  const p = PREFAB_POOLS[kind];
  assert(p.length > 0, `pool ${kind} is not empty`);
  for (const prefab of p) {
    assert(prefab.kind === kind, `pool ${kind} contains kind ${prefab.kind}`);
    assert(prefab.w > 0 && prefab.h > 0 && prefab.d > 0, `${prefab.name} has positive dims`);
    assert(prefab.cells.length === prefab.w * prefab.h * prefab.d, `${prefab.name} cell count matches dims`);
    let filled = 0;
    for (const c of prefab.cells) if (c) filled++;
    assert(filled > 0, `${prefab.name} has voxels`);
    assert(prefabCell(prefab, -1, 0, 0) === 0, `${prefab.name} out of bounds x is air`);
    assert(prefabCell(prefab, 0, prefab.h, 0) === 0, `${prefab.name} out of bounds y is air`);
    assert(prefabCell(prefab, 0, 0, prefab.d) === 0, `${prefab.name} out of bounds z is air`);
    assert(prefabCell(prefab, 0, 0, 0) === prefab.cells[0], `${prefab.name} in bounds matches cells`);
  }
}
assert(structurePool('tower') === PREFAB_POOLS.tower, 'structurePool maps tower');
assert(structurePool('twin') === PREFAB_POOLS.mid, 'structurePool maps twin to mid');
assert(structurePool('row') === PREFAB_POOLS.low, 'structurePool maps row to low');
assert(structurePool('corners') === PREFAB_POOLS.low, 'structurePool maps corners to low');
assert(structurePool('market') === PREFAB_POOLS.shop, 'structurePool maps market to shop');
assert(structurePool('park') === null, 'structurePool has no buildings for parks');

assert(PREFAB_IDS.length > 0, 'palette has prefab ids');
assert(PREFAB_IDS.every((id) => id >= 32), 'prefab ids start above the block range');
assert(PREFAB_IDS.every((id, i) => i === 0 || id > PREFAB_IDS[i - 1]), 'prefab ids are sorted unique');
for (const id of PREFAB_IDS) {
  const rgb = PREFAB_COLORS[id];
  assert(Array.isArray(rgb) && rgb.length === 3, `PREFAB_COLORS[${id}] is rgb triple`);
  for (const ch of rgb) {
    assert(Number.isFinite(ch) && ch >= 0 && ch <= 1, `PREFAB_COLORS[${id}] channel in range`);
  }
}
for (const [id, rgb] of Object.entries(PREFAB_EMISSIVE)) {
  assert(PREFAB_IDS.includes(Number(id)) || Number(id) < 32, `emissive prefab id ${id} known`);
  for (const ch of rgb) assert(Number.isFinite(ch) && ch >= 0 && ch <= 1.0001, `emissive[${id}] in range`);
}

console.log(`OK  prefab tests passed (${PREFAB_NAMES.length} prefabs, ${PREFAB_IDS.length} colors)`);
