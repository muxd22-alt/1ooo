import { PLANET, CITY_MAX_LAT, ROAD_HALF } from '../world/planet.js';

const R = PLANET.radius;
const C = PLANET.center;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export const TRAFFIC = Object.freeze({
  roadR: R + 1.05,
  lane: 2.5,
  parkOffset: ROAD_HALF - 1,
  lmax: CITY_MAX_LAT * DEG
});

const LON_ROADS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4));
const LAT_ROADS = Object.freeze([-Math.PI / 4, 0, Math.PI / 4]);

export const TRAFFIC_ROUTES = Object.freeze([
  ...LON_ROADS.map((lon0) => Object.freeze({ kind: 'lon', lon0, maxS: TRAFFIC.lmax })),
  ...LAT_ROADS.map((lat0) => Object.freeze({ kind: 'lat', lat0 }))
]);

function hash32(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rand01(a, b, seed) {
  return hash32(a, b, seed) / 4294967296;
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function createFleet(seed, opts = {}) {
  const models = opts.models && opts.models.length ? opts.models : ['sedan'];
  const moving = opts.moving ?? 48;
  const parked = opts.parked ?? 24;
  const vehicles = [];

  for (let i = 0; i < moving + parked; i++) {
    const isParked = i >= moving;
    const r = rand01(i * 7 + 3, i * 13 + 91, seed);
    const routeIdx = Math.floor(r * TRAFFIC_ROUTES.length) % TRAFFIC_ROUTES.length;
    const route = TRAFFIC_ROUTES[routeIdx];
    const dir = rand01(i + 17, i * 3 + 5, seed) < 0.5 ? -1 : 1;
    const model = models[Math.floor(rand01(i + 41, i * 5 + 7, seed) * models.length) % models.length];
    let s;
    if (route.kind === 'lat') s = rand01(i + 59, i * 11 + 23, seed) * TAU;
    else s = (rand01(i + 59, i * 11 + 23, seed) * 2 - 1) * route.maxS * 0.94;
    vehicles.push({
      route: routeIdx,
      s,
      dir,
      parked: isParked,
      side: rand01(i + 71, i * 7 + 31, seed) < 0.5 ? -1 : 1,
      speed: 7 + rand01(i + 97, i * 17 + 3, seed) * 6,
      model
    });
  }

  enforceSpacing(vehicles);
  return { seed, routes: TRAFFIC_ROUTES, vehicles };
}

function laneKey(v) {
  return `${v.route}:${v.dir}`;
}

function routeArcRadius(route) {
  return route.kind === 'lon' ? R : R * Math.cos(route.lat0);
}

function enforceSpacing(vehicles) {
  const groups = new Map();
  for (const v of vehicles) {
    if (v.parked) continue;
    const key = laneKey(v);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(v);
  }
  for (const g of groups.values()) {
    const route = TRAFFIC_ROUTES[Number(g[0].route)];
    const gap = 14 / routeArcRadius(route);
    const circular = route.kind === 'lat';
    for (const v of g) {
      const p = v.dir * v.s;
      v._p = circular ? ((p % TAU) + TAU) % TAU : p;
    }
    g.sort((a, b) => a._p - b._p);
    if (circular) {
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 1; i < g.length; i++) {
          if (g[i]._p - g[i - 1]._p < gap) g[i]._p = g[i - 1]._p + gap;
        }
        const seam = g[0]._p + TAU - g[g.length - 1]._p;
        if (g.length > 1 && seam < gap) {
          const shift = gap - seam;
          for (const v of g) v._p = (v._p + shift) % TAU;
        }
      }
      for (const v of g) v.s = v.dir > 0 ? v._p : ((-v._p % TAU) + TAU) % TAU;
    } else {
      for (let i = 1; i < g.length; i++) {
        if (g[i]._p - g[i - 1]._p < gap) g[i]._p = g[i - 1]._p + gap;
      }
      for (const v of g) v.s = v.dir * v._p;
    }
    for (const v of g) delete v._p;
  }
}

const TURN_TIME = 1.4;

export function trafficStep(fleet, dt) {
  for (const v of fleet.vehicles) {
    if (v.parked) continue;
    const route = fleet.routes[v.route];
    if (v.turn) {
      v.turn.t += dt / TURN_TIME;
      if (v.turn.t >= 1) {
        v.dir = -v.turn.dir;
        v.turn = null;
      }
      continue;
    }
    v.s += (v.dir * v.speed * dt) / routeArcRadius(route);
    if (route.kind === 'lat') {
      if (v.s >= TAU) v.s -= TAU;
      else if (v.s < 0) v.s += TAU;
    } else if (v.s > route.maxS) {
      v.s = route.maxS;
      v.turn = { t: 0, dir: v.dir };
    } else if (v.s < -route.maxS) {
      v.s = -route.maxS;
      v.turn = { t: 0, dir: v.dir };
    }
  }
}

export function vehiclePose(v, routes = TRAFFIC_ROUTES) {
  const route = routes[v.route];
  let radial;
  let tangent;
  if (route.kind === 'lon') {
    const a = Math.max(-route.maxS, Math.min(route.maxS, v.s));
    const cl = Math.cos(a);
    const sl = Math.sin(a);
    const co = Math.cos(route.lon0);
    const so = Math.sin(route.lon0);
    radial = [cl * co, sl, cl * so];
    tangent = [-sl * co, cl, -sl * so];
  } else {
    const f = route.lat0;
    const cf = Math.cos(f);
    const sf = Math.sin(f);
    const cs = Math.cos(v.s);
    const ss = Math.sin(v.s);
    radial = [cf * cs, sf, cf * ss];
    tangent = [-ss, 0, cs];
  }
  const up = radial;
  let fwd = [tangent[0] * v.dir, tangent[1] * v.dir, tangent[2] * v.dir];
  let off;
  if (v.parked) {
    const right = cross(up, fwd);
    off = right.map((x) => x * (v.side * TRAFFIC.parkOffset));
  } else if (v.turn) {
    const dir0 = v.turn.dir;
    const th = Math.PI * Math.min(1, v.turn.t);
    const f0 = [tangent[0] * dir0, tangent[1] * dir0, tangent[2] * dir0];
    const kxv = cross(up, f0);
    const c = Math.cos(th);
    const sn = Math.sin(th);
    fwd = f0.map((x, i) => x * c + kxv[i] * sn);
    const axisRight = cross(up, tangent);
    const lane = TRAFFIC.lane * Math.cos(th);
    off = axisRight.map((x) => x * dir0 * lane);
  } else {
    const right = cross(up, fwd);
    off = right.map((x) => x * TRAFFIC.lane);
  }
  const lift = TRAFFIC.roadR + (v.parked ? 0.02 : 0);
  const pos = [C + up[0] * lift + off[0], C + up[1] * lift + off[1], C + up[2] * lift + off[2]];
  return { pos, up, fwd, right: cross(up, fwd) };
}
