import { PLANET, SUB_SIZE, SUBS, generatePlanet, planetSpawn } from './planet.js';
import { BLOCK } from './blocks.js';
import { makeTheme } from './theme.js';
import { greedyMesh } from './greedyMesher.js';
import { createDisplace } from './rounding.js';
import { raycastVoxels, subtractSphereIndexed } from './voxelOps.js';

const S = PLANET.size;
const SUB = SUB_SIZE;
const HALO = SUB + 2;
const CORE = [1, 1, 1, SUB + 1, SUB + 1, SUB + 1];
const HI_R = PLANET.radius + PLANET.maxStruct + 1;

const store = { voxels: null, seed: null, spawn: null, theme: null };

function extractSub(i, j, k) {
  const sub = new Uint8Array(HALO * HALO * HALO);
  const ox = i * SUB - 1;
  const oy = j * SUB - 1;
  const oz = k * SUB - 1;
  const fullRow = ox >= 0 && ox + HALO <= S;
  for (let z = 0; z < HALO; z++) {
    const wz = oz + z;
    if (wz < 0 || wz >= S) continue;
    for (let y = 0; y < HALO; y++) {
      const wy = oy + y;
      if (wy < 0 || wy >= S) continue;
      const dst = HALO * (y + HALO * z);
      const src = S * (wy + S * wz);
      if (fullRow) {
        sub.set(store.voxels.subarray(src + ox, src + ox + HALO), dst);
        continue;
      }
      for (let x = 0; x < HALO; x++) {
        const wx = ox + x;
        if (wx >= 0 && wx < S) sub[dst + x] = store.voxels[src + wx];
      }
    }
  }
  return sub;
}

function subHasVolume(i, j, k) {
  const x0 = i * SUB;
  const y0 = j * SUB;
  const z0 = k * SUB;
  const hiR2 = HI_R * HI_R;
  for (let z = z0; z <= z0 + SUB; z++) {
    const dz = z + 0.5 - PLANET.center;
    for (let y = y0; y <= y0 + SUB; y++) {
      const dy = y + 0.5 - PLANET.center;
      const dyz = dy * dy + dz * dz;
      for (let x = x0; x <= x0 + SUB; x++) {
        const dx = x + 0.5 - PLANET.center;
        if (dx * dx + dyz <= hiR2) return true;
      }
    }
  }
  return false;
}

function meshSub(i, j, k) {
  const t = performance.now();
  const displace = createDisplace(
    store.voxels,
    S,
    [PLANET.center, PLANET.center, PLANET.center],
    PLANET.radius
  );
  const mesh = greedyMesh(extractSub(i, j, k), HALO, HALO, HALO, {
    palette: store.theme.palette,
    emissive: store.theme.emissive,
    ao: true,
    smooth: true,
    core: CORE,
    cellSplit: true,
    offset: [i * SUB - 1, j * SUB - 1, k * SUB - 1],
    displace
  });
  return {
    i,
    j,
    k,
    positions: mesh.positions,
    normals: mesh.normals,
    colors: mesh.colors,
    emissives: mesh.emissives,
    indices: mesh.indices,
    meshMs: performance.now() - t,
    quads: mesh.quads,
    verts: mesh.verts,
    faces: mesh.faces
  };
}

function subsAround(point, radius) {
  const lo = (v) => Math.max(0, Math.floor((v - radius) / SUB));
  const hi = (v) => Math.min(SUBS - 1, Math.floor((v + radius) / SUB));
  const out = [];
  const z0 = lo(point[2]);
  const z1 = hi(point[2]);
  const y0 = lo(point[1]);
  const y1 = hi(point[1]);
  const x0 = lo(point[0]);
  const x1 = hi(point[0]);
  for (let k = z0; k <= z1; k++) {
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) out.push([i, j, k]);
    }
  }
  return out;
}

function postBuilt(payload, extraTransfer = []) {
  const transfer = [...extraTransfer];
  for (const chunk of payload.chunks) {
    transfer.push(
      chunk.positions.buffer,
      chunk.normals.buffer,
      chunk.colors.buffer,
      chunk.emissives.buffer,
      chunk.indices.buffer
    );
  }
  self.postMessage(payload, transfer);
}

function collectNeonSpots(voxels) {
  const bins = new Map();
  for (let z = 0; z < S; z++) {
    for (let y = 0; y < S; y++) {
      const row = S * (y + S * z);
      for (let x = 0; x < S; x++) {
        const v = voxels[x + row];
        if (v < BLOCK.NEON_PINK || v > BLOCK.NEON_AMBER) continue;
        const key = ((x >> 4) << 8) | ((y >> 4) << 4) | (z >> 4);
        let bin = bins.get(key);
        if (!bin) {
          bin = { n: 0, sx: 0, sy: 0, sz: 0, c: [0, 0, 0] };
          bins.set(key, bin);
        }
        bin.n++;
        bin.sx += x + 0.5;
        bin.sy += y + 0.5;
        bin.sz += z + 0.5;
        bin.c[v - BLOCK.NEON_PINK]++;
      }
    }
  }
  const out = [];
  for (const bin of bins.values()) {
    if (bin.n < 3) continue;
    let ci = 0;
    if (bin.c[1] > bin.c[ci]) ci = 1;
    if (bin.c[2] > bin.c[ci]) ci = 2;
    out.push({ n: bin.n, x: bin.sx / bin.n, y: bin.sy / bin.n, z: bin.sz / bin.n, c: ci });
  }
  out.sort((a, b) => b.n - a.n);
  return out.slice(0, 8).map((s) => [s.x, s.y, s.z, s.c]);
}

self.onmessage = (event) => {
  const msg = event.data;

  if (msg.type === 'build') {
    const t0 = performance.now();
    store.seed = msg.seed;
    store.voxels = generatePlanet(store.seed);
    store.theme = makeTheme(store.seed);
    store.spawn = planetSpawn();
    const t1 = performance.now();
    const neonSpots = collectNeonSpots(store.voxels);

    const chunks = [];
    let quads = 0;
    let faces = 0;
    let verts = 0;
    for (let k = 0; k < SUBS; k++) {
      for (let j = 0; j < SUBS; j++) {
        for (let i = 0; i < SUBS; i++) {
          if (!subHasVolume(i, j, k)) continue;
          const chunk = meshSub(i, j, k);
          if (chunk.indices.length === 0) continue;
          chunks.push(chunk);
          quads += chunk.quads;
          faces += chunk.faces;
          verts += chunk.verts;
        }
      }
    }
    const t2 = performance.now();

    postBuilt(
      {
        type: 'built',
        reason: 'build',
        id: msg.id,
        seed: store.seed,
        spawn: store.spawn,
        theme: store.theme,
        voxels: store.voxels,
        neonSpots,
        chunks,
        stats: { genMs: t1 - t0, meshMs: t2 - t1, quads, faces, verts }
      },
      []
    );
    return;
  }

  if (msg.type === 'shoot') {
    if (!store.voxels) return;

    const hit = raycastVoxels(store.voxels, S, S, S, msg.origin, msg.dir, msg.maxDist);

    let cleared = new Uint32Array(0);
    let removed = 0;
    let affected = [];
    if (hit) {
      cleared = subtractSphereIndexed(store.voxels, S, S, S, hit.point, msg.radius);
      removed = cleared.length;
      affected = subsAround(hit.point, msg.radius + 2);
    }

    const t = performance.now();
    const chunks = affected.map(([i, j, k]) => meshSub(i, j, k));

    postBuilt(
      {
        type: 'built',
        reason: 'shoot',
        id: msg.id,
        seed: store.seed,
        spawn: store.spawn,
        chunks,
        cleared,
        hit: hit ? { ...hit } : null,
        removed,
        stats: { meshMs: performance.now() - t, quads: chunks.reduce((s, c) => s + c.quads, 0) }
      },
      [cleared.buffer]
    );
    return;
  }

  if (msg.type === 'harvest' || msg.type === 'place') {
    const fail = (reason) => postBuilt({ type: 'edit', op: msg.id, ok: false, reason, chunks: [] });
    if (!store.voxels) return fail('no world');
    const idx = msg.idx;
    if (!(idx >= 0 && idx < store.voxels.length)) return fail('out of bounds');

    let material;
    if (msg.type === 'harvest') {
      if (store.voxels[idx] === 0) return fail('no voxel');
      material = store.voxels[idx];
      store.voxels[idx] = 0;
    } else {
      material = msg.material;
      if (store.voxels[idx] !== 0) return fail('cell occupied');
      if (!(Number.isInteger(material) && material > 0 && material <= 255)) return fail('bad material');
      store.voxels[idx] = material;
    }

    const x = idx % S;
    const y = Math.floor(idx / S) % S;
    const z = Math.floor(idx / (S * S));
    const t = performance.now();
    const chunks = subsAround([x + 0.5, y + 0.5, z + 0.5], 1).map(([i, j, k]) => meshSub(i, j, k));
    const cleared = msg.type === 'harvest' ? new Uint32Array([idx]) : new Uint32Array(0);
    const payload = {
      type: 'edit',
      op: msg.id,
      ok: true,
      reason: msg.type,
      material,
      chunks,
      stats: { meshMs: performance.now() - t }
    };
    if (msg.type === 'harvest') payload.cleared = cleared;
    else payload.set = idx;
    postBuilt(payload, cleared.length ? [cleared.buffer] : []);
  }
};
