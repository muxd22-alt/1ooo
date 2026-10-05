import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLANET, cityPlots, hash3i } from './planet.js';

const R = PLANET.radius;
const C = PLANET.center;
const BASE_UP = 0.35;
const SPAN_HALF = 0.28;
const FALLBACK_NEON = [0xff2fd6, 0x39f6ff, 0xffb02e];

const POOLS = {
  tower: [
    'building-skyscraper-a',
    'building-skyscraper-b',
    'building-skyscraper-c',
    'building-skyscraper-d',
    'building-skyscraper-e',
    'building-j',
    'building-n'
  ],
  twin: ['building-i', 'building-k', 'building-l', 'building-m', 'building-c', 'building-g', 'building-skyscraper-a'],
  row: [
    'building-a',
    'building-b',
    'building-d',
    'building-e',
    'building-h',
    'low-detail-building-a',
    'low-detail-building-b',
    'low-detail-building-c'
  ],
  corners: ['building-f', 'building-n', 'low-detail-building-d', 'low-detail-building-e', 'low-detail-building-f', 'low-detail-building-g'],
  market: ['low-detail-building-wide-a', 'low-detail-building-wide-b', 'building-f', 'low-detail-building-h', 'low-detail-building-i', 'low-detail-building-j']
};

const gltfCache = new Map();

function loadScene(loader, name) {
  if (!gltfCache.has(name)) {
    gltfCache.set(
      name,
      loader.loadAsync(`models/city/${name}.glb`).then((g) => {
        g.scene.updateMatrixWorld(true);
        return g.scene;
      })
    );
  }
  return gltfCache.get(name);
}

function plotScale(plot, meta) {
  return Math.min(plot.footW / meta.w, plot.footD / meta.d);
}

function basisAt(lat, lon) {
  const cosLat = Math.cos(lat);
  const up = new THREE.Vector3(cosLat * Math.cos(lon), Math.sin(lat), cosLat * Math.sin(lon));
  const east = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon));
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), -Math.sin(lat) * Math.sin(lon));
  return { up, east, north };
}

function plotMatrix(plot, meta) {
  const { up, east, north } = basisAt(plot.lat, plot.lon);
  const s = plot.s;
  const r = R + BASE_UP;
  const pos = new THREE.Vector3(C + up.x * r, C + up.y * r, C + up.z * r);
  const m = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z);
  m.multiply(new THREE.Matrix4().makeRotationAxis(up, plot.yawR));
  m.multiply(new THREE.Matrix4().makeBasis(east, up, north));
  m.scale(new THREE.Vector3(s, s, s));
  m.multiply(new THREE.Matrix4().makeTranslation(-meta.ox, -meta.oy, -meta.oz));
  return m;
}

function llh(lat, lon, h) {
  const r = R + BASE_UP + h;
  return [C + r * Math.cos(lat) * Math.cos(lon), C + r * Math.sin(lat), C + r * Math.cos(lat) * Math.sin(lon)];
}

function buildSigns(scene, plots, vibe, seed) {
  const positions = [];
  const colors = [];
  const indices = [];
  const dbg = [];
  const neon = vibe && vibe.neon ? vibe.neon : FALLBACK_NEON;
  let quads = 0;
  for (const plot of plots) {
    if (!plot.H) continue;
    const salt = plot.salt;
    if (hash3i(salt, salt + 7, seed ^ 0xbeef) / 4294967296 >= 0.55) continue;
    const face = Math.floor((hash3i(salt, salt + 11, seed ^ 0xfa5e) / 4294967296) * 4) % 4;
    const c = new THREE.Color(neon[hash3i(salt, face * 3 + 1, seed) % 3]);
    const H = plot.H;
    const h0 = Math.max(0.6, H - 5.5);
    const h1 = Math.min(H - 0.4, Math.max(h0 + 1, H - 1.4));
    if (h1 <= h0 + 0.4) continue;
    const lat = plot.lat;
    const lon = plot.lon;
    const cosLat = Math.cos(lat) || 1;
    let corners;
    if (face === 0 || face === 1) {
      const e = plot.halfE + 0.05;
      const lonF = lon + (face === 0 ? -e : e) / (R * cosLat);
      const hw = Math.min(SPAN_HALF * plot.slotHvox, 0.85 * plot.halfN);
      const latA = lat - hw / R;
      const latB = lat + hw / R;
      corners = [llh(latA, lonF, h0), llh(latB, lonF, h0), llh(latB, lonF, h1), llh(latA, lonF, h1)];
    } else {
      const n = plot.halfN + 0.05;
      const latF = lat + (face === 2 ? -n : n) / R;
      const hw = Math.min(SPAN_HALF * plot.slotWvox, 0.85 * plot.halfE);
      const lonA = lon - hw / (R * cosLat);
      const lonB = lon + hw / (R * cosLat);
      corners = [llh(latF, lonA, h0), llh(latF, lonB, h0), llh(latF, lonB, h1), llh(latF, lonA, h1)];
    }
    const o = positions.length / 3;
    for (const p of corners) {
      positions.push(p[0], p[1], p[2]);
      colors.push(c.r, c.g, c.b);
    }
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    if (dbg.length < 8) {
      const r0 = Math.hypot(corners[0][0] - C, corners[0][1] - C, corners[0][2] - C);
      const r1 = Math.hypot(corners[2][0] - C, corners[2][1] - C, corners[2][2] - C);
      dbg.push({
        face,
        model: plot.model,
        yaw: plot.yawR,
        H: +H.toFixed(2),
        h0: +h0.toFixed(2),
        h1: +h1.toFixed(2),
        r0: +r0.toFixed(3),
        r1: +r1.toFixed(3),
        halfE: +plot.halfE.toFixed(2),
        halfN: +plot.halfN.toFixed(2)
      });
    }
    quads++;
  }
  if (!quads) return { count: 0, dbg };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { count: quads, mesh, geometry, material, dbg };
}

export async function createCityBuild(scene, seed, vibe) {
  const plots = [...cityPlots(seed)];
  if (!plots.length) return { count: 0, signs: 0, models: 0, dbg: { inst: [], signs: [] }, dispose() {} };
  const res = await fetch('models/manifest.json');
  const manifest = await res.json();
  const byName = new Map((manifest.city || []).map((c) => [c.name, c]));
  const loader = new GLTFLoader();
  const groups = new Map();
  for (const plot of plots) {
    const pool = POOLS[plot.kind];
    if (!pool) continue;
    const name = pool[hash3i(plot.salt, pool.length, seed ^ 0x2c1b) % pool.length];
    const meta = byName.get(name);
    if (!meta) continue;
    const s = plotScale(plot, meta);
    const yawQ = hash3i(plot.salt, 0x77, seed ^ 0x18f1) & 1;
    plot.H = meta.h * s;
    plot.s = s;
    plot.yawR = yawQ ? Math.PI / 2 : 0;
    plot.model = name;
    plot.halfE = 0.5 * s * (yawQ ? meta.d : meta.w);
    plot.halfN = 0.5 * s * (yawQ ? meta.w : meta.d);
    if (!groups.has(name)) groups.set(name, { meta, plots: [] });
    groups.get(name).plots.push(plot);
  }
  const meshes = [];
  const instDbg = [];
  let count = 0;
  const tmp = new THREE.Matrix4();
  for (const [, group] of groups) {
    const root = await loadScene(loader, group.meta.name);
    const insts = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, group.plots.length);
      im.frustumCulled = false;
      scene.add(im);
      insts.push({ im, local: o.matrixWorld.clone() });
      meshes.push(im);
    });
    group.plots.forEach((plot, i) => {
      const m = plotMatrix(plot, group.meta);
      for (const { im, local } of insts) {
        tmp.copy(m).multiply(local);
        im.setMatrixAt(i, tmp);
      }
      if (instDbg.length < 6) {
        const e = tmp.elements;
        const r = Math.hypot(e[12] - C, e[13] - C, e[14] - C);
        instDbg.push({ model: group.meta.name, yaw: plot.yawR, r: +r.toFixed(3), s: +plot.s.toFixed(3) });
      }
      count++;
    });
    for (const { im } of insts) im.instanceMatrix.needsUpdate = true;
  }
  const signs = buildSigns(scene, plots, vibe, seed);
  return {
    count,
    signs: signs.count,
    models: groups.size,
    dbg: { inst: instDbg, signs: signs.dbg },
    dispose() {
      for (const im of meshes) {
        scene.remove(im);
        im.dispose();
      }
      if (signs.mesh) {
        scene.remove(signs.mesh);
        signs.geometry.dispose();
        signs.material.dispose();
      }
    }
  };
}
