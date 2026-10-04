import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, clamp, float, mix, positionWorld, uniform, vec3 } from 'three/tsl';
import { PLANET } from '../world/planet.js';

export function createChunkMaterial() {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });

  const albedo = attribute('color', 'vec3');
  const span = float(PLANET.radius * 2 + PLANET.maxStruct);
  const height = clamp(positionWorld.y.sub(float(PLANET.center - PLANET.radius)).div(span), 0.0, 1.0);
  const skyTint = mix(vec3(0.86, 0.91, 1.0), vec3(1.08, 1.03, 0.94), height);

  material.colorNode = albedo.mul(skyTint);

  const nightGlow = uniform(0.15);
  material.emissiveNode = attribute('emissive', 'vec3').mul(nightGlow);

  return { material, nightGlow };
}
