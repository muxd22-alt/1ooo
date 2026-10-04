import { TRAFFIC_ROUTES, TRAFFIC, createFleet, trafficStep, vehiclePose } from '../src/game/traffic.js';
import { PLANET, CITY_MAX_LAT } from '../src/world/planet.js';

let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const C = PLANET.center;
const R = PLANET.radius;

ok(TRAFFIC_ROUTES.length === 11, '11 routes');
ok(TRAFFIC_ROUTES.filter((r) => r.kind === 'lon').length === 8, '8 lon routes');
ok(TRAFFIC_ROUTES.filter((r) => r.kind === 'lat').length === 3, '3 lat routes');
ok(Math.abs(TRAFFIC.lmax - (CITY_MAX_LAT * Math.PI) / 180) < 1e-9, 'lmax from CITY_MAX_LAT');
ok(TRAFFIC.lmax > 0.9 && TRAFFIC.lmax < 0.95, 'lmax ~52.5 deg');
ok(TRAFFIC.lane >= 2.3 && TRAFFIC.lane <= 2.7, 'lane 2.5');
ok(TRAFFIC.roadR > R && TRAFFIC.roadR < R + 1.5, 'roadR just above radius');

const models = ['sedan', 'taxi', 'police', 'suv', 'van', 'hatchback-sports', 'delivery', 'ambulance', 'race', 'truck'];
const fleet = createFleet(1337, { models });
const fleet2 = createFleet(1337, { models });
ok(fleet.vehicles.length === 72, '72 vehicles');
ok(fleet.vehicles.filter((v) => !v.parked).length === 48, '48 moving');
ok(fleet.vehicles.filter((v) => v.parked).length === 24, '24 parked');
ok(JSON.stringify(fleet.vehicles) === JSON.stringify(fleet2.vehicles), 'deterministic fleet');
const fleet3 = createFleet(9999, { models });
ok(JSON.stringify(fleet.vehicles) !== JSON.stringify(fleet3.vehicles), 'seed changes fleet');
for (const v of fleet.vehicles) ok(models.includes(v.model), 'model from list');

const groups = new Map();
for (const v of fleet.vehicles) {
  if (v.parked) continue;
  const key = `${v.route}:${v.dir}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(v);
}
for (const g of groups.values()) {
  const route = TRAFFIC_ROUTES[Number(g[0].route)];
  const arcR = route.kind === 'lon' ? R : R * Math.cos(route.lat0);
  g.sort((a, b) => (a.dir > 0 ? a.s - b.s : b.s - a.s));
  for (let i = 1; i < g.length; i++) {
    const gapM = Math.abs(g[i].s - g[i - 1].s) * arcR;
    ok(gapM >= 13.9, `initial gap in lane (got ${gapM.toFixed(2)}m)`);
  }
}

function poseChecks(v, label) {
  const p = vehiclePose(v);
  const lane = v.parked ? TRAFFIC.parkOffset : TRAFFIC.lane;
  const lift = TRAFFIC.roadR + (v.parked ? 0.02 : 0);
  const d = Math.hypot(p.pos[0] - C, p.pos[1] - C, p.pos[2] - C);
  ok(Math.abs(d - Math.hypot(lift, lane)) < 0.05, `${label}: radius ~ lift+lane (got ${d.toFixed(3)})`);
  const lu = Math.hypot(p.up[0], p.up[1], p.up[2]);
  const lf = Math.hypot(p.fwd[0], p.fwd[1], p.fwd[2]);
  const lr = Math.hypot(p.right[0], p.right[1], p.right[2]);
  ok(Math.abs(lu - 1) < 1e-6, `${label}: up unit`);
  ok(Math.abs(lf - 1) < 1e-6, `${label}: fwd unit`);
  ok(Math.abs(lr - 1) < 1e-6, `${label}: right unit`);
  const dotUF = p.up[0] * p.fwd[0] + p.up[1] * p.fwd[1] + p.up[2] * p.fwd[2];
  ok(Math.abs(dotUF) < 1e-6, `${label}: up ⊥ fwd`);
  const dotUR = p.up[0] * p.right[0] + p.up[1] * p.right[1] + p.up[2] * p.right[2];
  ok(Math.abs(dotUR) < 1e-6, `${label}: up ⊥ right`);
  const cr = [
    p.up[1] * p.fwd[2] - p.up[2] * p.fwd[1],
    p.up[2] * p.fwd[0] - p.up[0] * p.fwd[2],
    p.up[0] * p.fwd[1] - p.up[1] * p.fwd[0]
  ];
  const dotR = cr[0] * p.right[0] + cr[1] * p.right[1] + cr[2] * p.right[2];
  ok(dotR > 0.999, `${label}: right = up × fwd`);
}

for (const v of fleet.vehicles) poseChecks(v, v.parked ? 'parked' : 'moving');

const lonMoving = fleet.vehicles.find((v) => !v.parked && TRAFFIC_ROUTES[v.route].kind === 'lon');
const latMoving = fleet.vehicles.find((v) => !v.parked && TRAFFIC_ROUTES[v.route].kind === 'lat');
const east = [-Math.sin(TRAFFIC_ROUTES[lonMoving.route].lon0), 0, Math.cos(TRAFFIC_ROUTES[lonMoving.route].lon0)];
{
  const p = vehiclePose(lonMoving);
  const latOff = (p.pos[0] - C) * east[0] + (p.pos[1] - C) * east[1] + (p.pos[2] - C) * east[2];
  ok(Math.abs(Math.abs(latOff) - TRAFFIC.lane) < 0.1, `lon lane offset ~2.5 (got ${latOff.toFixed(3)})`);
}
{
  const f = TRAFFIC_ROUTES[latMoving.route].lat0;
  const north = [-Math.sin(f) * Math.cos(latMoving.s), Math.cos(f), -Math.sin(f) * Math.sin(latMoving.s)];
  const p = vehiclePose(latMoving);
  const nOff = (p.pos[0] - C) * north[0] + (p.pos[1] - C) * north[1] + (p.pos[2] - C) * north[2];
  ok(Math.abs(Math.abs(nOff) - TRAFFIC.lane) < 0.1, `lat lane offset ~2.5 (got ${nOff.toFixed(3)})`);
}

const parkedS = fleet.vehicles.filter((v) => v.parked).map((v) => v.s);
const dt = 1 / 60;
for (let i = 0; i < 600; i++) trafficStep(fleet, dt);
fleet.vehicles.filter((v) => v.parked).forEach((v, i) => ok(v.s === parkedS[i], 'parked never moves'));
for (const v of fleet.vehicles) {
  if (v.parked) continue;
  const route = TRAFFIC_ROUTES[v.route];
  if (route.kind === 'lat') ok(v.s >= 0 && v.s < Math.PI * 2, 'lat s wrapped');
  else ok(Math.abs(v.s) <= route.maxS + 1e-9, 'lon s clamped');
}

lonMoving.s = TRAFFIC_ROUTES[lonMoving.route].maxS - 0.05;
lonMoving.dir = 1;
lonMoving.turn = null;
let maxJump = 0;
let prevPos = vehiclePose(lonMoving).pos;
let sawTurn = false;
for (let i = 0; i < 600; i++) {
  trafficStep(fleet, dt);
  if (lonMoving.turn) sawTurn = true;
  const pos = vehiclePose(lonMoving).pos;
  const step = Math.hypot(pos[0] - prevPos[0], pos[1] - prevPos[1], pos[2] - prevPos[2]);
  if (step > maxJump) maxJump = step;
  prevPos = pos;
}
ok(sawTurn, 'lon car turned around');
ok(maxJump < 0.5, `turn is continuous (max step ${maxJump.toFixed(3)}m)`);
ok(lonMoving.dir === -1, 'dir flipped after turn');

const movingCount = fleet.vehicles.filter((v) => !v.parked).length;
ok(movingCount >= 4, 'smoke threshold: at least 4 moving');

console.log(`OK  traffic tests passed (${checks} checks, ${fleet.vehicles.length} vehicles, 11 routes, max turn step ${maxJump.toFixed(3)}m)`);
