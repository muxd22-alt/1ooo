import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { BLOCK, BLOCK_PALETTE } from '../src/world/blocks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '.assets-src');
const OUT = join(ROOT, 'data', 'prefabs');
const MODELS = join(ROOT, 'public', 'models');
const COMMERCIAL = join(SRC, 'city-kit-commercial', 'Models', 'GLB format');
const NATURE = join(SRC, 'nature-kit', 'Models', 'GLTF format');

const ENTRIES = [
  { dir: COMMERCIAL, file: 'building-skyscraper-a.glb', kind: 'tower', tw: 7, td: 8, hMax: 20 },
  { dir: COMMERCIAL, file: 'building-skyscraper-b.glb', kind: 'tower', tw: 7, td: 8, hMax: 17 },
  { dir: COMMERCIAL, file: 'building-skyscraper-c.glb', kind: 'tower', tw: 7, td: 8, hMax: 20 },
  { dir: COMMERCIAL, file: 'building-skyscraper-d.glb', kind: 'tower', tw: 7, td: 8, hMax: 16 },
  { dir: COMMERCIAL, file: 'building-skyscraper-e.glb', kind: 'tower', tw: 7, td: 8, hMax: 19 },
  { dir: COMMERCIAL, file: 'building-a.glb', kind: 'mid', tw: 7, td: 8, hMax: 13 },
  { dir: COMMERCIAL, file: 'building-b.glb', kind: 'mid', tw: 7, td: 8, hMax: 11 },
  { dir: COMMERCIAL, file: 'building-c.glb', kind: 'mid', tw: 7, td: 8, hMax: 14 },
  { dir: COMMERCIAL, file: 'building-d.glb', kind: 'mid', tw: 7, td: 8, hMax: 12 },
  { dir: COMMERCIAL, file: 'building-e.glb', kind: 'mid', tw: 7, td: 8, hMax: 10 },
  { dir: COMMERCIAL, file: 'building-f.glb', kind: 'mid', tw: 7, td: 8, hMax: 13 },
  { dir: COMMERCIAL, file: 'building-g.glb', kind: 'mid', tw: 7, td: 8, hMax: 15 },
  { dir: COMMERCIAL, file: 'building-h.glb', kind: 'mid', tw: 7, td: 8, hMax: 11 },
  { dir: COMMERCIAL, file: 'building-i.glb', kind: 'mid', tw: 7, td: 8, hMax: 12 },
  { dir: COMMERCIAL, file: 'building-j.glb', kind: 'mid', tw: 7, td: 8, hMax: 14 },
  { dir: COMMERCIAL, file: 'building-k.glb', kind: 'mid', tw: 7, td: 8, hMax: 10 },
  { dir: COMMERCIAL, file: 'building-l.glb', kind: 'mid', tw: 7, td: 8, hMax: 13 },
  { dir: COMMERCIAL, file: 'building-m.glb', kind: 'mid', tw: 7, td: 8, hMax: 12 },
  { dir: COMMERCIAL, file: 'building-n.glb', kind: 'mid', tw: 7, td: 8, hMax: 11 },
  { dir: COMMERCIAL, file: 'low-detail-building-a.glb', kind: 'low', tw: 7, td: 8, hMax: 8 },
  { dir: COMMERCIAL, file: 'low-detail-building-b.glb', kind: 'low', tw: 7, td: 8, hMax: 6 },
  { dir: COMMERCIAL, file: 'low-detail-building-c.glb', kind: 'low', tw: 7, td: 8, hMax: 9 },
  { dir: COMMERCIAL, file: 'low-detail-building-d.glb', kind: 'low', tw: 7, td: 8, hMax: 7 },
  { dir: COMMERCIAL, file: 'low-detail-building-e.glb', kind: 'low', tw: 7, td: 8, hMax: 10 },
  { dir: COMMERCIAL, file: 'low-detail-building-f.glb', kind: 'low', tw: 7, td: 8, hMax: 6 },
  { dir: COMMERCIAL, file: 'low-detail-building-g.glb', kind: 'low', tw: 7, td: 8, hMax: 8 },
  { dir: COMMERCIAL, file: 'low-detail-building-h.glb', kind: 'low', tw: 7, td: 8, hMax: 7 },
  { dir: COMMERCIAL, file: 'low-detail-building-i.glb', kind: 'low', tw: 7, td: 8, hMax: 9 },
  { dir: COMMERCIAL, file: 'low-detail-building-j.glb', kind: 'low', tw: 7, td: 8, hMax: 6 },
  { dir: COMMERCIAL, file: 'low-detail-building-k.glb', kind: 'low', tw: 7, td: 8, hMax: 8 },
  { dir: COMMERCIAL, file: 'low-detail-building-l.glb', kind: 'low', tw: 7, td: 8, hMax: 7 },
  { dir: COMMERCIAL, file: 'low-detail-building-m.glb', kind: 'low', tw: 7, td: 8, hMax: 10 },
  { dir: COMMERCIAL, file: 'low-detail-building-n.glb', kind: 'low', tw: 7, td: 8, hMax: 6 },
  { dir: COMMERCIAL, file: 'low-detail-building-wide-a.glb', kind: 'shop', tw: 8, td: 8, hMax: 6 },
  { dir: COMMERCIAL, file: 'low-detail-building-wide-b.glb', kind: 'shop', tw: 8, td: 8, hMax: 5 },
  { dir: COMMERCIAL, file: 'building-a.glb', name: 'building-a-shop', kind: 'shop', tw: 8, td: 8, hMax: 7 },
  { dir: NATURE, file: 'tree_oak.glb', kind: 'tree', tw: 6, td: 6, hMax: 7 },
  { dir: NATURE, file: 'tree_default.glb', kind: 'tree', tw: 6, td: 6, hMax: 7 },
  { dir: NATURE, file: 'tree_fat.glb', kind: 'tree', tw: 6, td: 6, hMax: 7 },
  { dir: NATURE, file: 'tree_pineTallA.glb', kind: 'tree', tw: 5, td: 5, hMax: 8 },
  { dir: NATURE, file: 'tree_blocks.glb', kind: 'tree', tw: 6, td: 6, hMax: 7 },
  { dir: NATURE, file: 'tree_palm.glb', kind: 'tree', tw: 7, td: 7, hMax: 8 },
  { dir: NATURE, file: 'plant_bushLarge.glb', kind: 'tree', tw: 4, td: 4, hMax: 3 }
];

const CARS = ['sedan', 'taxi', 'police', 'suv', 'van', 'hatchback-sports', 'delivery', 'ambulance', 'race', 'truck'];
const CAR_SRC = join(SRC, 'car-kit', 'Models', 'GLB format');

function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let palette = null;
  let alpha = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') alpha = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported png depth=${bitDepth} interlace=${interlace}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : colorType === 4 ? 2 : -1;
  if (channels < 0) throw new Error(`unsupported png colorType=${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < h * (w * channels + 1)) throw new Error(`png data short: ${raw.length}`);
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(row, 0, pos, pos + stride);
    pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      row[i] = v;
    }
    prev = row;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (colorType === 6) {
      rgba[i * 4] = out[i * 4];
      rgba[i * 4 + 1] = out[i * 4 + 1];
      rgba[i * 4 + 2] = out[i * 4 + 2];
      rgba[i * 4 + 3] = out[i * 4 + 3];
    } else if (colorType === 2) {
      rgba[i * 4] = out[i * 3];
      rgba[i * 4 + 1] = out[i * 3 + 1];
      rgba[i * 4 + 2] = out[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    } else if (colorType === 3) {
      const p = out[i];
      rgba[i * 4] = palette[p * 3];
      rgba[i * 4 + 1] = palette[p * 3 + 1];
      rgba[i * 4 + 2] = palette[p * 3 + 2];
      rgba[i * 4 + 3] = alpha && p < alpha.length ? alpha[p] : 255;
    } else if (colorType === 0) {
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = out[i];
      rgba[i * 4 + 3] = 255;
    } else {
      const v = out[i * 2];
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = out[i * 2 + 1];
    }
  }
  return { w, h, data: rgba };
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Mul(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function mat4FromTRS(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0],
    (xy + wz) * s[0],
    (xz - wy) * s[0],
    0,
    (xy - wz) * s[1],
    (1 - (xx + zz)) * s[1],
    (yz + wx) * s[1],
    0,
    (xz + wy) * s[2],
    (yz - wx) * s[2],
    (1 - (xx + yy)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1
  ];
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const bufIdx = bv.buffer === undefined ? 0 : bv.buffer;
  if (json.buffers[bufIdx] && json.buffers[bufIdx].uri) throw new Error(`external buffer ${json.buffers[bufIdx].uri}`);
  if (!bin) throw new Error('missing BIN chunk');
  const buffer = bin;
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const size = sizes[acc.componentType];
  const stride = bv.byteStride || size * compCount;
  const out = new Array(acc.count * compCount);
  for (let i = 0; i < acc.count; i++) {
    const o = start + i * stride;
    for (let c = 0; c < compCount; c++) {
      const p = o + c * size;
      let v;
      if (acc.componentType === 5126) v = buffer.readFloatLE(p);
      else if (acc.componentType === 5125) v = buffer.readUInt32LE(p);
      else if (acc.componentType === 5123) v = buffer.readUInt16LE(p);
      else if (acc.componentType === 5121) v = buffer.readUInt8(p);
      else throw new Error(`componentType ${acc.componentType}`);
      out[i * compCount + c] = acc.normalized && size <= 2 ? Math.min(1, v / (v > 255 ? 65535 : 255)) : v;
    }
  }
  return out;
}

function readGlb(filePath) {
  const buf = readFileSync(filePath);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not glb: ${filePath}`);
  let json = null;
  let bin = null;
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json) throw new Error('no json chunk');
  if (bin && json.buffers && json.buffers[0] && json.buffers[0].uri) throw new Error('external buffer in glb');
  return { json, bin, dir: dirname(filePath) };
}

const texCache = new Map();
function loadImage(filePath) {
  if (!texCache.has(filePath)) {
    const buf = existsSync(filePath) ? readFileSync(filePath) : null;
    texCache.set(filePath, buf ? readPng(buf) : null);
  }
  return texCache.get(filePath);
}

function texel(tex, u, vv) {
  if (!tex.img) return null;
  const { w, h, data } = tex.img;
  let x = Math.floor((((u % 1) + 1) % 1) * w);
  let y = Math.floor((((vv % 1) + 1) % 1) * h);
  if (tex.wrapS === 33071) x = Math.max(0, Math.min(w - 1, x));
  if (tex.wrapT === 33071) y = Math.max(0, Math.min(h - 1, y));
  const i = (y * w + x) * 4;
  return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
}

function gatherTriangles(filePath) {
  const { json, bin, dir } = readGlb(filePath);
  const tris = [];
  const nodes = json.nodes || [];
  const scenes = json.scenes || [];
  const scene = scenes[json.scene || 0];
  const images = (json.images || []).map((img) => {
    if (img.uri) return loadImage(join(dir, img.uri));
    if (img.bufferView !== undefined && bin) {
      const bv = json.bufferViews[img.bufferView];
      const start = bv.byteOffset || 0;
      return readPng(bin.subarray(start, start + bv.byteLength));
    }
    return null;
  });
  const texOf = (texIdx) => {
    const tex = json.textures[texIdx];
    const sampler = json.samplers && json.samplers[tex.sampler] ? json.samplers[tex.sampler] : {};
    return { img: images[tex.source], wrapS: sampler.wrapS || 10497, wrapT: sampler.wrapT || 10497 };
  };
  const visit = (nodeIdx, parent) => {
    const node = nodes[nodeIdx];
    let m = mat4Identity();
    if (node.matrix) m = node.matrix.slice();
    else m = mat4FromTRS(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
    const world = mat4Mul(parent, m);
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        if (!prim.attributes || prim.attributes.POSITION === undefined) continue;
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
        const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : null;
        const mat = prim.material !== undefined ? json.materials[prim.material] : null;
        const pbr = mat && mat.pbrMetallicRoughness ? mat.pbrMetallicRoughness : {};
        const factor = pbr.baseColorFactor || [1, 1, 1, 1];
        const tex = pbr.baseColorTexture ? texOf(pbr.baseColorTexture.index) : null;
        const emissive = mat && mat.emissiveFactor ? mat.emissiveFactor : null;
        const count = idx ? idx.length : pos.length / 3;
        const tri = (i0, i1, i2) => {
          const pts = [];
          for (const vi of [i0, i1, i2]) {
            const x = pos[vi * 3];
            const y = pos[vi * 3 + 1];
            const z = pos[vi * 3 + 2];
            pts.push([
              world[0] * x + world[4] * y + world[8] * z + world[12],
              world[1] * x + world[5] * y + world[9] * z + world[13],
              world[2] * x + world[6] * y + world[10] * z + world[14]
            ]);
          }
          const uvs = uv ? [uv[i0 * 2], uv[i0 * 2 + 1], uv[i1 * 2], uv[i1 * 2 + 1], uv[i2 * 2], uv[i2 * 2 + 1]] : null;
          tris.push({ pts, uvs, tex, factor, emissive });
        };
        for (let i = 0; i < count; i += 3) tri(idx ? idx[i] : i, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2);
      }
    }
    for (const child of node.children || []) visit(child, world);
  };
  for (const root of scene && scene.nodes ? scene.nodes : []) visit(root, mat4Identity());
  return tris;
}

const blockColors = Object.entries(BLOCK_PALETTE).map(([id, c]) => [Number(id), c[0] * 255, c[1] * 255, c[2] * 255]);
const TREE_ALLOW = new Set([BLOCK.TRUNK, BLOCK.LEAVES]);
const colorRegistry = new Map();
const emissiveIds = new Set();
const nextId = { value: 32 };

function nearestBlock(r, g, b, allow) {
  let best = -1;
  let bestD = allow ? Infinity : 48;
  for (const [id, pr, pg, pb] of blockColors) {
    if (allow && !allow.has(id)) continue;
    const d = Math.hypot(r - pr, g - pg, b - pb);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function colorToId(r, g, b, isEmissive, allow) {
  const fixed = nearestBlock(r, g, b, allow);
  if (fixed >= 0) {
    if (isEmissive) emissiveIds.add(fixed);
    return fixed;
  }
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  let entry = colorRegistry.get(key);
  if (!entry) {
    entry = { id: nextId.value++, sum: [0, 0, 0], n: 0 };
    colorRegistry.set(key, entry);
  }
  entry.sum[0] += r;
  entry.sum[1] += g;
  entry.sum[2] += b;
  entry.n++;
  if (isEmissive) emissiveIds.add(entry.id);
  return entry.id;
}

function voxelize(entry) {
  const tris = gatherTriangles(join(entry.dir, entry.file));
  if (!tris.length) throw new Error(`no triangles: ${entry.file}`);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of t.pts) {
      for (let k = 0; k < 3; k++) {
        if (p[k] < min[k]) min[k] = p[k];
        if (p[k] > max[k]) max[k] = p[k];
      }
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size.some((v) => !(v > 0))) throw new Error(`bad bbox: ${entry.file}`);
  const scale = Math.min(entry.tw / size[0], entry.td / size[2], entry.hMax / size[1]);
  const w = Math.max(1, Math.ceil(size[0] * scale));
  const h = Math.max(1, Math.ceil(size[1] * scale));
  const d = Math.max(1, Math.ceil(size[2] * scale));
  const votes = new Map();
  for (const t of tris) {
    const pts = t.pts.map((p) => [(p[0] - min[0]) * scale, (p[1] - min[1]) * scale, (p[2] - min[2]) * scale]);
    let maxEdge = 0;
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      maxEdge = Math.max(maxEdge, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2]));
    }
    const n = Math.max(2, Math.min(48, Math.ceil(maxEdge / 0.4)));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; i + j <= n; j++) {
        const u = i / n;
        const v = j / n;
        const wgt = 1 - u - v;
        const x = Math.floor(pts[0][0] * wgt + pts[1][0] * u + pts[2][0] * v);
        const y = Math.floor(pts[0][1] * wgt + pts[1][1] * u + pts[2][1] * v);
        const z = Math.floor(pts[0][2] * wgt + pts[1][2] * u + pts[2][2] * v);
        if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) continue;
        let col = null;
        if (t.tex && t.uvs) {
          const uu = t.uvs[0] * wgt + t.uvs[2] * u + t.uvs[4] * v;
          const vv = t.uvs[1] * wgt + t.uvs[3] * u + t.uvs[5] * v;
          col = texel(t.tex, uu, vv);
        }
        if (col) col = [col[0] * t.factor[0], col[1] * t.factor[1], col[2] * t.factor[2]];
        else col = [t.factor[0], t.factor[1], t.factor[2]];
        const r = Math.round(col[0] * 255);
        const g = Math.round(col[1] * 255);
        const b = Math.round(col[2] * 255);
        const ckey = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        const cell = x + w * (y + h * z);
        let bucket = votes.get(cell);
        if (!bucket) {
          bucket = new Map();
          votes.set(cell, bucket);
        }
        const cur = bucket.get(ckey) || [0, 0, 0, 0];
        cur[0]++;
        cur[1] += r;
        cur[2] += g;
        cur[3] += b;
        bucket.set(ckey, cur);
      }
    }
  }
  const cells = new Uint8Array(w * h * d);
  const anyEmissive = tris.some((t) => t.emissive && t.emissive[0] + t.emissive[1] + t.emissive[2] > 0.1);
  for (const [cell, bucket] of votes) {
    let bestKey = -1;
    let best = null;
    const keys = [...bucket.keys()].sort((a, b) => a - b);
    for (const key of keys) {
      const cur = bucket.get(key);
      if (!best || cur[0] > best[0]) {
        best = cur;
        bestKey = key;
      }
    }
    const r = Math.round(best[1] / best[0]);
    const g = Math.round(best[2] / best[0]);
    const b = Math.round(best[3] / best[0]);
    cells[cell] = colorToId(r, g, b, anyEmissive, entry.kind === 'tree' ? TREE_ALLOW : null);
  }
  const rle = [];
  let runId = cells[0];
  let runLen = 1;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] === runId && runLen < 65535) runLen++;
    else {
      rle.push(runLen, runId);
      runId = cells[i];
      runLen = 1;
    }
  }
  rle.push(runLen, runId);
  return { name: entry.name || entry.file.replace('.glb', ''), kind: entry.kind, w, h, d, rle, cells: cells.length };
}

mkdirSync(OUT, { recursive: true });
mkdirSync(MODELS, { recursive: true });
let total = 0;
for (const entry of ENTRIES) {
  const out = voxelize(entry);
  writeFileSync(join(OUT, `${out.name}.json`), JSON.stringify(out));
  total++;
  console.log(`${out.name}: ${out.kind} ${out.w}x${out.h}x${out.d} cells=${out.cells}`);
}
const colors = {};
for (const [key, e] of colorRegistry) {
  colors[e.id] = [
    Math.round(e.sum[0] / e.n),
    Math.round(e.sum[1] / e.n),
    Math.round(e.sum[2] / e.n)
  ];
}
const ids = Object.keys(colors).map(Number).sort((a, b) => a - b);
const f = (v) => (v / 255).toFixed(4);
const colorLines = ids.map((id) => `  ${id}: [${colors[id].map(f).join(', ')}]`).join(',\n');
const emissiveIdsSorted = [...emissiveIds].filter((id) => colors[id] !== undefined || id < 32).sort((a, b) => a - b);
const emissiveLines = emissiveIdsSorted
  .map((id) => {
    const rgb = colors[id] || [Math.round(BLOCK_PALETTE[id] ? BLOCK_PALETTE[id][0] * 255 : 255), Math.round(BLOCK_PALETTE[id] ? BLOCK_PALETTE[id][1] * 255 : 255), Math.round(BLOCK_PALETTE[id] ? BLOCK_PALETTE[id][2] * 255 : 255)];
    const peak = Math.max(rgb[0], rgb[1], rgb[2], 1);
    const glowRgb = [
      (rgb[0] / peak).toFixed(4),
      (rgb[1] / peak).toFixed(4),
      (rgb[2] / peak).toFixed(4)
    ];
    return `  ${id}: [${glowRgb.join(', ')}]`;
  })
  .join(',\n');
const paletteJs = `export const PREFAB_COLORS = Object.freeze({
${colorLines}
});

export const PREFAB_EMISSIVE = Object.freeze({
${emissiveLines}
});

export const PREFAB_IDS = Object.freeze([${ids.join(', ')}]);
`;
writeFileSync(join(ROOT, 'src', 'world', 'prefabPalette.js'), paletteJs);
console.log(`prefabs: ${total}, new colors: ${ids.length} (ids ${ids[0]}..${ids[ids.length - 1]}), emissive ids: ${emissiveIdsSorted.length}`);

const carsOut = join(MODELS, 'cars');
mkdirSync(join(carsOut, 'Textures'), { recursive: true });
for (const car of CARS) {
  copyFileSync(join(CAR_SRC, `${car}.glb`), join(carsOut, `${car}.glb`));
}
copyFileSync(join(CAR_SRC, 'Textures', 'colormap.png'), join(carsOut, 'Textures', 'colormap.png'));
writeFileSync(join(MODELS, 'manifest.json'), JSON.stringify({ cars: CARS, guns: [] }, null, 2));
console.log(`cars: copied ${CARS.length} glbs`);
console.log('import-assets: done');
