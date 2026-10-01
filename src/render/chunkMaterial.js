import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, clamp, float, mix, positionWorld, vec3 } from 'three/tsl';
import { CHUNK } from '../world/blocks.js';

export function createChunkMaterial() {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });

  const albedo = attribute('color', 'vec3');
  const height = clamp(positionWorld.y.div(float(CHUNK.y)), 0.0, 1.0);
  const skyTint = mix(vec3(0.86, 0.91, 1.0), vec3(1.08, 1.03, 0.94), height);

  material.colorNode = albedo.mul(skyTint);

  return material;
}
