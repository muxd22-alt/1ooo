import * as THREE from 'three/webgpu';
import { PLANET } from '../world/planet.js';

const C = PLANET.center;

export function createNeonGlow(scene, spots, vibe) {
  if (!spots || !spots.length) {
    return { update() {}, dispose() {}, count: 0 };
  }
  const neon = vibe && vibe.neon ? vibe.neon : [0xff2fb9, 0x7df9ff, 0xffb347];
  const geo = new THREE.CircleGeometry(2.6, 18);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const unitY = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();

  spots.forEach((s, i) => {
    pos.set(s[0], s[1], s[2]);
    radial.set(s[0] - C, s[1] - C, s[2] - C).normalize();
    pos.addScaledVector(radial, 0.35);
    quat.setFromUnitVectors(unitY, radial);
    const scale = 0.8 + ((i * 37) % 10) / 10 * 0.7;
    scl.setScalar(scale);
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color().setHex(neon[s[3] % neon.length]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  let opacity = 0;

  function update(dt, night, atmo) {
    const target = 0.5 * (0.3 + 0.7 * night) * atmo.neon;
    opacity += (target - opacity) * Math.min(1, dt * 2);
    mat.opacity = opacity;
  }

  function dispose() {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  }

  return { update, dispose, count: spots.length };
}
