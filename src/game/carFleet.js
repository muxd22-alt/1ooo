import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFleet, trafficStep, vehiclePose } from './traffic.js';

const MODEL_YAW = 0;

export async function createCarFleet(scene, seed) {
  const res = await fetch('models/manifest.json');
  const manifest = await res.json();
  const names = Array.isArray(manifest.cars) ? manifest.cars : [];
  if (!names.length) return null;

  const fleet = createFleet(seed, { models: names });
  const byModel = new Map();
  fleet.vehicles.forEach((v, i) => {
    v._idx = 0;
    if (!byModel.has(v.model)) byModel.set(v.model, []);
    byModel.get(v.model).push(v);
  });

  const loader = new GLTFLoader();
  const groups = [];
  for (const [name, list] of byModel) {
    const gltf = await loader.loadAsync(`models/cars/${name}.glb`);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const locals = [];
    const insts = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(im);
      locals.push(o.matrixWorld.clone());
      insts.push(im);
    });
    list.forEach((v, i) => {
      v._idx = i;
    });
    groups.push({ vehicles: list, locals, insts });
  }

  const basis = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const fix = new THREE.Matrix4().makeRotationY(MODEL_YAW);
  const mv = new THREE.Matrix4();
  const vr = new THREE.Vector3();
  const vu = new THREE.Vector3();
  const vf = new THREE.Vector3();
  const vp = new THREE.Vector3();

  function writeVehicle(group, v) {
    const pose = vehiclePose(v);
    vr.set(pose.right[0], pose.right[1], pose.right[2]);
    vu.set(pose.up[0], pose.up[1], pose.up[2]);
    vf.set(pose.fwd[0], pose.fwd[1], pose.fwd[2]);
    vp.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    basis.makeBasis(vr, vu, vf).multiply(fix);
    mv.makeTranslation(vp.x, vp.y, vp.z).multiply(basis);
    for (let i = 0; i < group.insts.length; i++) {
      tmp.copy(mv).multiply(group.locals[i]);
      group.insts[i].setMatrixAt(v._idx, tmp);
    }
  }

  function flush() {
    for (const group of groups) {
      for (const im of group.insts) im.instanceMatrix.needsUpdate = true;
    }
  }

  for (const group of groups) {
    for (const v of group.vehicles) writeVehicle(group, v);
  }
  flush();

  const moving = fleet.vehicles.filter((v) => !v.parked).length;
  return {
    count: fleet.vehicles.length,
    moving,
    parked: fleet.vehicles.length - moving,
    diagnostics() {
      const out = [];
      for (const group of groups) {
        const im = group.insts[0];
        const m = new THREE.Matrix4().fromArray(im.instanceMatrix.array, 0);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const mLast = new THREE.Matrix4().fromArray(im.instanceMatrix.array, (group.vehicles.length - 1) * 16);
        const pLast = new THREE.Vector3().setFromMatrixPosition(mLast);
        out.push({
          parts: group.insts.length,
          instances: im.count,
          first: [p.x, p.y, p.z].map((v) => +v.toFixed(2)),
          last: [pLast.x, pLast.y, pLast.z].map((v) => +v.toFixed(2)),
          visible: im.visible
        });
      }
      return out;
    },
    update(dt) {
      trafficStep(fleet, dt);
      for (const group of groups) {
        for (const v of group.vehicles) {
          if (!v.parked) writeVehicle(group, v);
        }
      }
      flush();
    }
  };
}
