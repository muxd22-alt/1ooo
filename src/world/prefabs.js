import buildingSkyscraperA from '../../data/prefabs/building-skyscraper-a.json' with { type: 'json' };
import buildingSkyscraperB from '../../data/prefabs/building-skyscraper-b.json' with { type: 'json' };
import buildingSkyscraperC from '../../data/prefabs/building-skyscraper-c.json' with { type: 'json' };
import buildingSkyscraperD from '../../data/prefabs/building-skyscraper-d.json' with { type: 'json' };
import buildingSkyscraperE from '../../data/prefabs/building-skyscraper-e.json' with { type: 'json' };
import buildingA from '../../data/prefabs/building-a.json' with { type: 'json' };
import buildingB from '../../data/prefabs/building-b.json' with { type: 'json' };
import buildingC from '../../data/prefabs/building-c.json' with { type: 'json' };
import buildingD from '../../data/prefabs/building-d.json' with { type: 'json' };
import buildingE from '../../data/prefabs/building-e.json' with { type: 'json' };
import buildingF from '../../data/prefabs/building-f.json' with { type: 'json' };
import buildingG from '../../data/prefabs/building-g.json' with { type: 'json' };
import buildingH from '../../data/prefabs/building-h.json' with { type: 'json' };
import buildingI from '../../data/prefabs/building-i.json' with { type: 'json' };
import buildingJ from '../../data/prefabs/building-j.json' with { type: 'json' };
import buildingK from '../../data/prefabs/building-k.json' with { type: 'json' };
import buildingL from '../../data/prefabs/building-l.json' with { type: 'json' };
import buildingM from '../../data/prefabs/building-m.json' with { type: 'json' };
import buildingN from '../../data/prefabs/building-n.json' with { type: 'json' };
import lowDetailBuildingA from '../../data/prefabs/low-detail-building-a.json' with { type: 'json' };
import lowDetailBuildingB from '../../data/prefabs/low-detail-building-b.json' with { type: 'json' };
import lowDetailBuildingC from '../../data/prefabs/low-detail-building-c.json' with { type: 'json' };
import lowDetailBuildingD from '../../data/prefabs/low-detail-building-d.json' with { type: 'json' };
import lowDetailBuildingE from '../../data/prefabs/low-detail-building-e.json' with { type: 'json' };
import lowDetailBuildingF from '../../data/prefabs/low-detail-building-f.json' with { type: 'json' };
import lowDetailBuildingG from '../../data/prefabs/low-detail-building-g.json' with { type: 'json' };
import lowDetailBuildingH from '../../data/prefabs/low-detail-building-h.json' with { type: 'json' };
import lowDetailBuildingI from '../../data/prefabs/low-detail-building-i.json' with { type: 'json' };
import lowDetailBuildingJ from '../../data/prefabs/low-detail-building-j.json' with { type: 'json' };
import lowDetailBuildingK from '../../data/prefabs/low-detail-building-k.json' with { type: 'json' };
import lowDetailBuildingL from '../../data/prefabs/low-detail-building-l.json' with { type: 'json' };
import lowDetailBuildingM from '../../data/prefabs/low-detail-building-m.json' with { type: 'json' };
import lowDetailBuildingN from '../../data/prefabs/low-detail-building-n.json' with { type: 'json' };
import lowDetailBuildingWideA from '../../data/prefabs/low-detail-building-wide-a.json' with { type: 'json' };
import lowDetailBuildingWideB from '../../data/prefabs/low-detail-building-wide-b.json' with { type: 'json' };
import buildingAShop from '../../data/prefabs/building-a-shop.json' with { type: 'json' };
import treeOak from '../../data/prefabs/tree_oak.json' with { type: 'json' };
import treeDefault from '../../data/prefabs/tree_default.json' with { type: 'json' };
import treeFat from '../../data/prefabs/tree_fat.json' with { type: 'json' };
import treePineTallA from '../../data/prefabs/tree_pineTallA.json' with { type: 'json' };
import treeBlocks from '../../data/prefabs/tree_blocks.json' with { type: 'json' };
import treePalm from '../../data/prefabs/tree_palm.json' with { type: 'json' };
import plantBushLarge from '../../data/prefabs/plant_bushLarge.json' with { type: 'json' };

const RAW = [
  buildingSkyscraperA,
  buildingSkyscraperB,
  buildingSkyscraperC,
  buildingSkyscraperD,
  buildingSkyscraperE,
  buildingA,
  buildingB,
  buildingC,
  buildingD,
  buildingE,
  buildingF,
  buildingG,
  buildingH,
  buildingI,
  buildingJ,
  buildingK,
  buildingL,
  buildingM,
  buildingN,
  lowDetailBuildingA,
  lowDetailBuildingB,
  lowDetailBuildingC,
  lowDetailBuildingD,
  lowDetailBuildingE,
  lowDetailBuildingF,
  lowDetailBuildingG,
  lowDetailBuildingH,
  lowDetailBuildingI,
  lowDetailBuildingJ,
  lowDetailBuildingK,
  lowDetailBuildingL,
  lowDetailBuildingM,
  lowDetailBuildingN,
  lowDetailBuildingWideA,
  lowDetailBuildingWideB,
  buildingAShop,
  treeOak,
  treeDefault,
  treeFat,
  treePineTallA,
  treeBlocks,
  treePalm,
  plantBushLarge
];

function decode(j) {
  const cells = new Uint8Array(j.w * j.h * j.d);
  let i = 0;
  for (let k = 0; k < j.rle.length; k += 2) {
    const len = j.rle[k];
    const id = j.rle[k + 1];
    if (id !== 0) cells.fill(id, i, i + len);
    i += len;
  }
  if (i !== cells.length) throw new Error(`prefab ${j.name}: rle ${i} != ${cells.length}`);
  return Object.freeze({ name: j.name, kind: j.kind, w: j.w, h: j.h, d: j.d, cells });
}

const DECODED = Object.freeze(RAW.map(decode));

function pool(kind) {
  const list = DECODED.filter((p) => p.kind === kind);
  if (!list.length) throw new Error(`empty prefab pool: ${kind}`);
  return Object.freeze(list);
}

export const PREFAB_NAMES = Object.freeze(DECODED.map((p) => p.name));

export const PREFAB_POOLS = Object.freeze({
  tower: pool('tower'),
  mid: pool('mid'),
  low: pool('low'),
  shop: pool('shop'),
  tree: pool('tree')
});

const STRUCT_POOLS = Object.freeze({
  tower: 'tower',
  twin: 'mid',
  row: 'low',
  corners: 'low',
  market: 'shop'
});

export function structurePool(kind) {
  const key = STRUCT_POOLS[kind];
  return key ? PREFAB_POOLS[key] : null;
}

export function prefabCell(p, px, py, pz) {
  if (px < 0 || py < 0 || pz < 0 || px >= p.w || py >= p.h || pz >= p.d) return 0;
  return p.cells[px + p.w * (py + p.h * pz)];
}
