import { CHUNK } from './blocks.js';
import { generateChunk } from './terrain.js';
import { greedyMesh } from './greedyMesher.js';
import { raycastVoxels, subtractSphere } from './voxelOps.js';

const store = { voxels: null, seed: null, spawn: null };

function replyBuilt(extra, reason) {
  const mesh = greedyMesh(store.voxels, CHUNK.x, CHUNK.y, CHUNK.z);
  const t2 = performance.now();

  self.postMessage(
    {
      type: 'built',
      reason,
      id: extra.id,
      seed: store.seed,
      spawn: store.spawn,
      positions: mesh.positions,
      normals: mesh.normals,
      colors: mesh.colors,
      indices: mesh.indices,
      stats: {
        ...(extra.stats ?? {}),
        meshMs: t2 - extra.meshStart,
        quads: mesh.quads,
        verts: mesh.verts,
        faces: mesh.faces
      },
      ...(extra.hit !== undefined ? { hit: extra.hit, removed: extra.removed } : {})
    },
    [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer]
  );
}

self.onmessage = (event) => {
  const msg = event.data;

  if (msg.type === 'build') {
    const t0 = performance.now();
    const generated = generateChunk(msg.seed);
    const t1 = performance.now();

    store.voxels = generated.voxels;
    store.seed = generated.seed;
    store.spawn = generated.spawn;

    replyBuilt({ id: msg.id, meshStart: t1, stats: { genMs: t1 - t0 } }, 'build');
    return;
  }

  if (msg.type === 'shoot') {
    if (!store.voxels) return;

    const hit = raycastVoxels(
      store.voxels,
      CHUNK.x,
      CHUNK.y,
      CHUNK.z,
      msg.origin,
      msg.dir,
      msg.maxDist
    );

    let removed = 0;
    if (hit) removed = subtractSphere(store.voxels, CHUNK.x, CHUNK.y, CHUNK.z, hit.point, msg.radius);

    replyBuilt(
      { id: msg.id, meshStart: performance.now(), hit: hit ? { ...hit, point: hit.point } : null, removed },
      'shoot'
    );
  }
};
