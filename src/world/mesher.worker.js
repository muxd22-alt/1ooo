import { CHUNK, GRID, WORLD, worldIndex } from './blocks.js';
import { generateCityChunk, citySpawn } from './city.js';
import { greedyMesh } from './greedyMesher.js';
import { raycastVoxels, subtractSphere } from './voxelOps.js';

const store = { voxels: null, seed: null, spawn: null };

function extractChunk(cx, cz) {
  const sub = new Uint8Array(CHUNK.x * CHUNK.y * CHUNK.z);
  const x0 = cx * CHUNK.x;
  const z0 = cz * CHUNK.z;
  for (let y = 0; y < CHUNK.y; y++) {
    for (let z = 0; z < CHUNK.z; z++) {
      const src = worldIndex(x0, y, z0 + z);
      sub.set(store.voxels.subarray(src, src + CHUNK.x), CHUNK.x * (y + CHUNK.y * z));
    }
  }
  return sub;
}

function meshChunk(cx, cz) {
  const t = performance.now();
  const mesh = greedyMesh(extractChunk(cx, cz), CHUNK.x, CHUNK.y, CHUNK.z);
  return {
    cx,
    cz,
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

function allChunkCoords() {
  const out = [];
  for (let cz = 0; cz < GRID.z; cz++) {
    for (let cx = 0; cx < GRID.x; cx++) out.push([cx, cz]);
  }
  return out;
}

function chunksAround(point, radius) {
  const cx0 = Math.max(0, Math.floor((point[0] - radius) / CHUNK.x));
  const cx1 = Math.min(GRID.x - 1, Math.floor((point[0] + radius) / CHUNK.x));
  const cz0 = Math.max(0, Math.floor((point[2] - radius) / CHUNK.z));
  const cz1 = Math.min(GRID.z - 1, Math.floor((point[2] + radius) / CHUNK.z));
  const out = [];
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) out.push([cx, cz]);
  }
  return out;
}

function postBuilt(payload) {
  const transfer = [];
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

self.onmessage = (event) => {
  const msg = event.data;

  if (msg.type === 'build') {
    const t0 = performance.now();
    store.voxels = new Uint8Array(WORLD.x * WORLD.y * WORLD.z);
    store.seed = msg.seed;
    store.spawn = citySpawn();

    for (let cz = 0; cz < GRID.z; cz++) {
      for (let cx = 0; cx < GRID.x; cx++) {
        const generated = generateCityChunk(cx, cz, msg.seed);
        const x0 = cx * CHUNK.x;
        const z0 = cz * CHUNK.z;
        for (let y = 0; y < CHUNK.y; y++) {
          for (let z = 0; z < CHUNK.z; z++) {
            const dst = worldIndex(x0, y, z0 + z);
            store.voxels.set(
              generated.voxels.subarray(CHUNK.x * (y + CHUNK.y * z), CHUNK.x * (y + CHUNK.y * z) + CHUNK.x),
              dst
            );
          }
        }
      }
    }
    const t1 = performance.now();

    const chunks = allChunkCoords().map(([cx, cz]) => meshChunk(cx, cz));
    const t2 = performance.now();

    let quads = 0;
    let faces = 0;
    let verts = 0;
    for (const chunk of chunks) {
      quads += chunk.quads;
      faces += chunk.faces;
      verts += chunk.verts;
    }

    postBuilt({
      type: 'built',
      reason: 'build',
      id: msg.id,
      seed: store.seed,
      spawn: store.spawn,
      chunks,
      stats: { genMs: t1 - t0, meshMs: t2 - t1, quads, faces, verts }
    });
    return;
  }

  if (msg.type === 'shoot') {
    if (!store.voxels) return;

    const hit = raycastVoxels(
      store.voxels,
      WORLD.x,
      WORLD.y,
      WORLD.z,
      msg.origin,
      msg.dir,
      msg.maxDist
    );

    let removed = 0;
    let affected = [];
    if (hit) {
      removed = subtractSphere(store.voxels, WORLD.x, WORLD.y, WORLD.z, hit.point, msg.radius);
      affected = chunksAround(hit.point, msg.radius + 1);
    }

    const t = performance.now();
    const chunks = affected.map(([cx, cz]) => meshChunk(cx, cz));

    postBuilt({
      type: 'built',
      reason: 'shoot',
      id: msg.id,
      seed: store.seed,
      spawn: store.spawn,
      chunks,
      hit: hit ? { ...hit, point: hit.point } : null,
      removed,
      stats: { meshMs: performance.now() - t, quads: chunks.reduce((s, c) => s + c.quads, 0) }
    });
  }
};
