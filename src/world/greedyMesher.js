import { BLOCK_EMISSIVE, BLOCK_PALETTE } from './blocks.js';

const PALETTE_FALLBACK = [1, 0, 1];
const NO_EMISSIVE = [0, 0, 0];
const AO_LEVELS = [0.45, 0.65, 0.84, 1.0];

export function greedyMesh(voxels, sx, sy, sz, opts = {}) {
  const palette = opts.palette || BLOCK_PALETTE;
  const emissive = opts.emissive || BLOCK_EMISSIVE;
  const useAO = !!opts.ao;
  const useSmooth = !!opts.smooth;
  const core = opts.core || null;
  const cellSplit = !!opts.cellSplit;
  const displace = opts.displace || null;
  const offset = opts.offset || [0, 0, 0];

  const dims = [sx, sy, sz];
  const positions = [];
  const normals = [];
  const colors = [];
  const emissives = [];
  const indices = [];

  let vertCount = 0;
  let faceCount = 0;

  const at = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : voxels[x + sx * (y + sy * z)];

  const inCore = (x, y, z) =>
    x >= core[0] && x < core[3] && y >= core[1] && y < core[4] && z >= core[2] && z < core[5];

  const cA = [0, 0, 0];
  const cB = [0, 0, 0];
  const cS = [0, 0, 0];

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
          let m = ia !== 0 && ib === 0 ? ia : ia === 0 && ib !== 0 ? -ib : 0;
          if (m !== 0 && core) {
            const s = m > 0 ? cA : cB;
            if (!inCore(s[0], s[1], s[2])) m = 0;
          }
          mask[a + row] = m;
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

  function cornerAO(airLayer, d, u, v, cu, cv, quadA, quadB) {
    const uIn = cu === quadA ? cu : cu - 1;
    const vIn = cv === quadB ? cv : cv - 1;
    const uOut = cu === quadA ? cu - 1 : cu;
    const vOut = cv === quadB ? cv - 1 : cv;
    cS[d] = airLayer;
    cS[u] = uOut;
    cS[v] = vIn;
    const s1 = at(cS[0], cS[1], cS[2]) !== 0;
    cS[u] = uIn;
    cS[v] = vOut;
    const s2 = at(cS[0], cS[1], cS[2]) !== 0;
    cS[u] = uOut;
    const sc = at(cS[0], cS[1], cS[2]) !== 0;
    return AO_LEVELS[s1 && s2 ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (sc ? 1 : 0))];
  }

  function pushV(p) {
    if (displace) {
      const q = displace(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]);
      positions.push(q[0] - offset[0], q[1] - offset[1], q[2] - offset[2]);
    } else {
      positions.push(p[0], p[1], p[2]);
    }
  }

  function emitCells(d, u, v, plane, a, b, w, h, mat, em, dir) {
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

    pushV(pA);
    pushV(pB);
    pushV(pC);
    pushV(pD);

    const n = [0, 0, 0];
    n[d] = dir;
    for (let k = 0; k < 4; k++) normals.push(n[0], n[1], n[2]);

    if (useAO) {
      const airLayer = dir > 0 ? plane : plane - 1;
      const aoA = cornerAO(airLayer, d, u, v, a, b, a, b, w, h);
      const aoB = cornerAO(airLayer, d, u, v, a + w, b, a, b, w, h);
      const aoC = cornerAO(airLayer, d, u, v, a + w, b + h, a, b, w, h);
      const aoD = cornerAO(airLayer, d, u, v, a, b + h, a, b, w, h);
      const aos = [aoA, aoB, aoC, aoD];
      for (let k = 0; k < 4; k++) {
        colors.push(mat[0] * aos[k], mat[1] * aos[k], mat[2] * aos[k]);
      }
    } else {
      for (let k = 0; k < 4; k++) colors.push(mat[0], mat[1], mat[2]);
    }
    for (let k = 0; k < 4; k++) emissives.push(em[0], em[1], em[2]);

    const o = vertCount;
    if (dir > 0) indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else indices.push(o, o + 3, o + 2, o, o + 2, o + 1);
    vertCount += 4;
  }

  function emitQuad(d, u, v, plane, a, b, w, h, m) {
    const matId = Math.abs(m);
    const mat = palette[matId] || PALETTE_FALLBACK;
    const em = emissive[matId] || NO_EMISSIVE;
    const dir = m > 0 ? 1 : -1;

    if (cellSplit && matId < 32 && (w > 1 || h > 1)) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          emitCells(d, u, v, plane, a + i, b + j, 1, 1, mat, em, dir);
        }
      }
      return;
    }
    emitCells(d, u, v, plane, a, b, w, h, mat, em, dir);
  }

  if (useSmooth && vertCount > 0) {
    const sums = new Map();
    const keyAt = (vi) =>
      (positions[vi * 3] * 8192 + positions[vi * 3 + 1]) * 8192 + positions[vi * 3 + 2];
    const original = normals.slice();
    for (let vi = 0; vi < vertCount; vi++) {
      const key = keyAt(vi);
      let s = sums.get(key);
      if (!s) {
        s = [0, 0, 0];
        sums.set(key, s);
      }
      s[0] += normals[vi * 3];
      s[1] += normals[vi * 3 + 1];
      s[2] += normals[vi * 3 + 2];
    }
    for (let vi = 0; vi < vertCount; vi++) {
      const s = sums.get(keyAt(vi));
      const len = Math.hypot(s[0], s[1], s[2]);
      if (len < 1e-6) {
        normals[vi * 3] = original[vi * 3];
        normals[vi * 3 + 1] = original[vi * 3 + 1];
        normals[vi * 3 + 2] = original[vi * 3 + 2];
        continue;
      }
      normals[vi * 3] = s[0] / len;
      normals[vi * 3 + 1] = s[1] / len;
      normals[vi * 3 + 2] = s[2] / len;
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    emissives: new Float32Array(emissives),
    indices: new Uint32Array(indices),
    quads: indices.length / 6,
    verts: vertCount,
    faces: faceCount
  };
}
