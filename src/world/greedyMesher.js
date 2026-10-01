import { BLOCK_PALETTE } from './blocks.js';

const PALETTE_FALLBACK = [1, 0, 1];

/**
 * Greedy mesher over a dense voxel volume.
 * Volume layout: index(x, y, z) = x + sx * (y + sy * z)
 *
 * Mask encoding per (axis, slice, u/v cell): signed material id.
 *   > 0 -> visible face with normal +axis
 *   < 0 -> visible face with normal -axis
 *   0   -> no face
 *
 * @returns {{positions: Float32Array, normals: Float32Array,
 *            colors: Float32Array, indices: Uint32Array,
 *            quads: number, verts: number, faces: number}}
 */
export function greedyMesh(voxels, sx, sy, sz) {
  const dims = [sx, sy, sz];
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  let vertCount = 0;
  let faceCount = 0;

  const at = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : voxels[x + sx * (y + sy * z)];

  const cA = [0, 0, 0];
  const cB = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const du = dims[u];
    const dv = dims[v];
    const mask = new Int16Array(du * dv);

    for (let plane = 0; plane <= dims[d]; plane++) {
      cA[d] = plane - 1;
      cB[d] = plane;

      for (let b = 0; b < dv; b++) {
        cA[v] = b;
        cB[v] = b;
        const row = b * du;
        for (let a = 0; a < du; a++) {
          cA[u] = a;
          cB[u] = a;
          const ia = plane - 1 < 0 ? 0 : at(cA[0], cA[1], cA[2]);
          const ib = plane >= dims[d] ? 0 : at(cB[0], cB[1], cB[2]);
          mask[a + row] = ia !== 0 && ib === 0 ? ia : ia === 0 && ib !== 0 ? -ib : 0;
        }
      }

      for (let b = 0; b < dv; b++) {
        const row = b * du;
        for (let a = 0; a < du; ) {
          const m = mask[a + row];
          if (m === 0) {
            a++;
            continue;
          }

          let w = 1;
          while (a + w < du && mask[a + w + row] === m) w++;

          let h = 1;
          grow: for (; b + h < dv; h++) {
            const nextRow = (b + h) * du;
            for (let k = 0; k < w; k++) {
              if (mask[a + k + nextRow] !== m) break grow;
            }
          }

          faceCount += w * h;
          emitQuad(d, u, v, plane, a, b, w, h, m);

          for (let bh = 0; bh < h; bh++) {
            const clearRow = (b + bh) * du;
            for (let aw = 0; aw < w; aw++) mask[a + aw + clearRow] = 0;
          }

          a += w;
        }
      }
    }
  }

  function emitQuad(d, u, v, plane, a, b, w, h, m) {
    const mat = BLOCK_PALETTE[Math.abs(m)] || PALETTE_FALLBACK;
    const dir = m > 0 ? 1 : -1;

    const base = [0, 0, 0];
    base[d] = plane;
    base[u] = a;
    base[v] = b;

    const pA = base;
    const pB = [base[0], base[1], base[2]];
    pB[u] += w;
    const pC = [pB[0], pB[1], pB[2]];
    pC[v] += h;
    const pD = [base[0], base[1], base[2]];
    pD[v] += h;

    positions.push(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], pC[0], pC[1], pC[2], pD[0], pD[1], pD[2]);

    const n = [0, 0, 0];
    n[d] = dir;
    for (let k = 0; k < 4; k++) normals.push(n[0], n[1], n[2]);

    for (let k = 0; k < 4; k++) colors.push(mat[0], mat[1], mat[2]);

    const o = vertCount;
    if (dir > 0) indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else indices.push(o, o + 3, o + 2, o, o + 2, o + 1);
    vertCount += 4;
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    quads: indices.length / 6,
    verts: vertCount,
    faces: faceCount
  };
}
