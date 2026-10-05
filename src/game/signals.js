import * as THREE from 'three';
import { PLANET, ROAD_HALF } from '../world/planet.js';
import { TRAFFIC_ROUTES } from './traffic.js';

const C = PLANET.center;
const R = PLANET.radius;
const POLE_H = 3.1;
const HEAD_H = 0.72;
const BULB = 0.17;
const CYCLE_MS = 7600;
const GREEN_MS = 3200;
const AMBER_MS = 600;

const LIT = Object.freeze({
  red: [1.0, 0.1, 0.14],
  amber: [1.0, 0.6, 0.08],
  green: [0.16, 1.0, 0.42]
});

function hash32(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function worldPos(lat, lon, r) {
  const cl = Math.cos(lat);
  return new THREE.Vector3(C + cl * Math.cos(lon) * r, C + Math.sin(lat) * r, C + cl * Math.sin(lon) * r);
}

function alignY(dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return q;
}

function buildMatrix(pos, quat, sx, sy, sz) {
  return new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(sx, sy, sz));
}

export function createSignals(scene, seed) {
  const latRoads = TRAFFIC_ROUTES.filter((route) => route.kind === 'lat');
  const lonRoads = TRAFFIC_ROUTES.filter((route) => route.kind === 'lon');
  const lights = [];
  let n = 0;

  for (const latRoute of latRoads) {
    for (const lonRoute of lonRoads) {
      for (const corner of [0, 2]) {
        const h = hash32(n * 7 + 3, n * 13 + 91, seed);
        const dLatSign = corner === 0 ? 1 : -1;
        const dLonSign = corner === 0 ? 1 : -1;
        const d = ROAD_HALF + 1.6;
        const lat = latRoute.lat0 + (dLatSign * d) / R;
        const lon = lonRoute.lon0 + (dLonSign * d) / (R * Math.cos(latRoute.lat0));
        const axis = h % 2 === 0 ? 'lat' : 'lon';
        lights.push({
          lat,
          lon,
          axis,
          offset: (h % 1000) / 1000
        });
        n++;
      }
    }
  }

  const poleGeo = new THREE.BoxGeometry(0.14, POLE_H, 0.14);
  const headGeo = new THREE.BoxGeometry(0.26, HEAD_H, 0.2);
  const bulbGeo = new THREE.BoxGeometry(BULB, BULB, BULB);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1d2330, roughness: 0.75, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x141926, roughness: 0.8, metalness: 0.3 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lights.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lights.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lights.length * 3);

  const m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  lights.forEach((light, i) => {
    const base = worldPos(light.lat, light.lon, R + 1.12);
    const radial = tmp.copy(base).sub(new THREE.Vector3(C, C, C)).normalize().clone();
    const q = alignY(radial);
    light.phase = light.offset * CYCLE_MS;

    m.compose(base.clone().addScaledVector(radial, POLE_H / 2), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m);

    const headPos = base.clone().addScaledVector(radial, POLE_H + HEAD_H / 2);
    m.compose(headPos, q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m);

    const right = new THREE.Vector3().crossVectors(radial, up).normalize();
    if (right.lengthSq() < 0.5) right.set(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(right, radial).normalize();
    for (let b = 0; b < 3; b++) {
      const bulbPos = headPos
        .clone()
        .addScaledVector(radial, HEAD_H / 2 + BULB * 0.75 - b * BULB * 1.15)
        .addScaledVector(tangent, 0.12);
      m.compose(bulbPos, q, new THREE.Vector3(1, 1, 1));
      bulbs.setMatrixAt(i * 3 + b, m);
      bulbs.setColorAt(i * 3 + b, new THREE.Color(0.03, 0.02, 0.02));
    }
  });

  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  for (const mesh of [poles, heads, bulbs]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  const color = new THREE.Color();

  function signalState(light, now) {
    const t = (now + light.phase) % CYCLE_MS;
    const firstIsLat = light.axis === 'lat';
    if (t < GREEN_MS) return firstIsLat ? 'green' : 'red';
    if (t < GREEN_MS + AMBER_MS) return firstIsLat ? 'amber' : 'red';
    if (t < GREEN_MS + AMBER_MS + GREEN_MS) return firstIsLat ? 'red' : 'green';
    return firstIsLat ? 'red' : 'amber';
  }

  function update(now) {
    for (let i = 0; i < lights.length; i++) {
      const state = signalState(lights[i], now);
      const lit = LIT[state];
      for (let b = 0; b < 3; b++) {
        const role = ['red', 'amber', 'green'][b];
        const active = role === state;
        color.setRGB(
          active ? lit[0] : lit[0] * 0.08 + 0.015,
          active ? lit[1] : lit[1] * 0.08 + 0.012,
          active ? lit[2] : lit[2] * 0.08 + 0.012
        );
        bulbs.setColorAt(i * 3 + b, color);
      }
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  }

  function debug() {
    return lights.slice(0, 4).map((light) => ({
      lat: +light.lat.toFixed(4),
      lon: +light.lon.toFixed(4),
      axis: light.axis,
      pos: worldPos(light.lat, light.lon, R + 1.12)
        .toArray()
        .map((v) => +v.toFixed(1))
    }));
  }

  function dispose() {
    scene.remove(poles, heads, bulbs);
    poleGeo.dispose();
    headGeo.dispose();
    bulbGeo.dispose();
    poleMat.dispose();
    headMat.dispose();
    bulbMat.dispose();
  }

  return { update, dispose, count: lights.length, debug };
}
