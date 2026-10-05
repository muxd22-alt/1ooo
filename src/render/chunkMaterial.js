import { MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import {
  abs,
  asin,
  attribute,
  atan,
  clamp,
  cos,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  mod,
  mx_noise_float,
  positionWorld,
  round,
  smoothstep,
  uniform,
  vec3
} from 'three/tsl';
import { PLANET, ROAD_HALF, WALK_HALF, CITY_MAX_LAT } from '../world/planet.js';

function roadPaint(albedo, env, uRoad, uLine) {
  const C = float(PLANET.center);
  const Rf = float(PLANET.radius);
  const HALF = float(ROAD_HALF);
  const WALK = float(WALK_HALF);
  const P = float(Math.PI / 4);
  const CITY = float(CITY_MAX_LAT * (Math.PI / 180));

  const rel = positionWorld.sub(vec3(C));
  const rad = length(rel);
  const lat = asin(clamp(rel.y.div(rad), -1.0, 1.0));
  const lon = atan(rel.z, rel.x);
  const cosLat = cos(lat);
  const dLat = min(min(abs(lat), abs(lat.sub(P))), abs(lat.add(P))).mul(Rf);
  const mLon = round(lon.div(P)).mul(P);
  const dLon = abs(lon.sub(mLon)).mul(cosLat).mul(Rf);
  const sLon = lon.mul(cosLat).mul(Rf);
  const sLat = lat.mul(Rf);

  const aaLat = max(fwidth(dLat), 0.02);
  const aaLon = max(fwidth(dLon), 0.02);
  const aaS = max(max(fwidth(sLon), fwidth(sLat)), 0.05);

  const one = float(1);
  const F = (v) => (typeof v === 'number' ? float(v) : v);
  const inside = (x, w, aa) => {
    const t = F(w);
    return one.sub(smoothstep(t.sub(aa), t.add(aa), x));
  };
  const between = (x, a0, b0, aa) => {
    const a = F(a0);
    const b = F(b0);
    return smoothstep(a.sub(aa), a.add(aa), x).mul(one.sub(smoothstep(b.sub(aa), b.add(aa), x)));
  };

  const city = one.sub(smoothstep(CITY.sub(0.5), CITY.add(0.5), abs(lat)));
  const zoneLat = inside(dLat, HALF, aaLat);
  const zoneLon = inside(dLon, HALF, aaLon);
  const ground = one.sub(smoothstep(64.85, 65.05, rad));
  const onRoad = city.mul(max(zoneLat, zoneLon)).mul(ground);

  const beyondLat = smoothstep(HALF.add(0.25), HALF.add(0.55), dLon);
  const beyondLon = smoothstep(HALF.add(0.25), HALF.add(0.55), dLat);

  const dashLat = between(mod(sLon, 10.0), 0.0, 4.2, aaS)
    .mul(inside(dLat, 0.14, aaLat))
    .mul(beyondLat);
  const edgeLat = inside(abs(dLat.sub(HALF.sub(0.55))), 0.09, aaLat).mul(beyondLat);
  const barLat = between(dLon, HALF.add(0.45), HALF.add(0.8), aaLon)
    .mul(inside(dLat, HALF.sub(0.4), aaLat));

  const dashLon = between(mod(sLat, 10.0), 0.0, 4.2, aaS)
    .mul(inside(dLon, 0.14, aaLon))
    .mul(beyondLon);
  const edgeLon = inside(abs(dLon.sub(HALF.sub(0.55))), 0.09, aaLon).mul(beyondLon);
  const barLon = between(dLat, HALF.add(0.45), HALF.add(0.8), aaLat)
    .mul(inside(dLon, HALF.sub(0.4), aaLon));

  const line = min(
    one,
    max(max(max(dashLat, edgeLat), max(barLat, dashLon)), max(edgeLon, barLon))
  ).mul(ground);

  const seamLat = inside(abs(dLat.sub(HALF)), 0.05, aaLat);
  const seamLon = inside(abs(dLon.sub(HALF)), 0.05, aaLon);
  const nearWalk = inside(min(dLat, dLon), WALK.add(0.4), float(0.5));
  const seam = max(seamLat, seamLon).mul(city).mul(nearWalk).mul(one.sub(line)).mul(ground);

  const base = mix(albedo, uRoad, onRoad);
  return mix(base, uLine, line).mul(env).mul(one.sub(seam.mul(0.3)));
}

export function createChunkMaterial() {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });

  const albedo = attribute('color', 'vec3');
  const span = float(PLANET.radius * 2 + PLANET.maxStruct);
  const height = clamp(positionWorld.y.sub(float(PLANET.center - PLANET.radius)).div(span), 0.0, 1.0);
  const skyTint = mix(vec3(0.86, 0.91, 1.0), vec3(1.08, 1.03, 0.94), height);

  const mottle = mx_noise_float(positionWorld.mul(0.55)).mul(0.055);
  const grain = mx_noise_float(positionWorld.mul(7.0)).mul(0.02);
  const detail = float(1.0).add(mottle).add(grain);
  const env = skyTint.mul(detail);

  const uRoad = uniform(new Vector3(0.15, 0.15, 0.16));
  const uLine = uniform(new Vector3(0.92, 0.86, 0.42));

  material.colorNode = roadPaint(albedo, env, uRoad, uLine);

  const nightGlow = uniform(0.15);
  material.emissiveNode = attribute('emissive', 'vec3').mul(nightGlow);

  const setPaint = (roadCol, lineCol) => {
    uRoad.value.set(roadCol[0], roadCol[1], roadCol[2]);
    uLine.value.set(lineCol[0], lineCol[1], lineCol[2]);
  };

  return { material, nightGlow, setPaint };
}
