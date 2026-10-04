import { Vector3 } from 'three/webgpu';
import { raycastVoxels } from '../world/voxelOps.js';

const EYE = 1.6;
const GRAVITY = 28;
const JUMP = 8.5;
const WALK = 5.5;
const SPRINT = 8.5;
const FLY_SPEED = 18;
const SENSITIVITY = 0.0022;
const MIN_PITCH = -1.55;
const MAX_PITCH = 1.55;
const STEP_UP = 1.15;
const STEP_DOWN = 1.05;
const SKIN = 0.05;
const AIR_CONTROL = 12;
export const BODY_HEIGHTS = Object.freeze([0.1, 0.85, 1.5]);

export class PlanetControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = { getVoxels: () => null, size: 192, center: new Vector3(96, 96, 96), radius: 64 };
    this.keys = new Set();
    this.locked = false;
    this.onAim = null;
    this.fly = false;

    this.feet = new Vector3(96, 162, 96);
    this.velH = new Vector3();
    this.vUp = 0;
    this.grounded = false;
    this.forwardH = new Vector3(0, 1, 0);
    this.pitch = -0.55;
    this._up = new Vector3(1, 0, 0);
    this._right = new Vector3();
    this._dir = new Vector3();
    this._wish = new Vector3();
    this._tmp = new Vector3();
    this._tmp2 = new Vector3();
    this._move = new Vector3();
    this._cand = new Vector3();
    this._body = new Vector3();
    this._jumpQueued = false;
    this._origin = [0, 0, 0];
    this._dirArr = [0, 0, 0];

    this._onMouseMove = (event) => {
      if (!this.locked) return;
      this.rotateView(event.movementX, event.movementY);
    };

    this._onKeyDown = (event) => {
      if (event.code === 'Space') event.preventDefault();
      if (event.code === 'Space' && !event.repeat) this._jumpQueued = true;
      if (event.code === 'KeyF' && !event.repeat) this.fly = !this.fly;
      this.keys.add(event.code);
    };

    this._onKeyUp = (event) => {
      if (event.code === 'Space') this._jumpQueued = false;
      this.keys.delete(event.code);
    };

    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (!this.locked) this.keys.clear();
    };

    domElement.addEventListener('click', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onLockChange);

    this.applyToCamera();
  }

  setWorld(world) {
    this.world = world;
  }

  respawn(spawn) {
    this.feet.set(spawn.x, spawn.y, spawn.z);
    this.velH.set(0, 0, 0);
    this.vUp = 0;
    this.grounded = false;
    this._jumpQueued = false;
    this.pitch = -0.55;
    this._up.copy(this.feet).sub(this.world.center).normalize();
    this.forwardH.set(0, 1, 0);
    this.forwardH.addScaledVector(this._up, -this.forwardH.dot(this._up));
    if (this.forwardH.lengthSq() < 1e-8) {
      this.forwardH.set(0, 0, 1).addScaledVector(this._up, -this._up.z);
    }
    this.forwardH.normalize();
    this.applyToCamera();
  }

  rotateView(dx, dy) {
    this.forwardH.applyAxisAngle(this._up, -dx * SENSITIVITY);
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch - dy * SENSITIVITY));
    if (this.onAim) this.onAim(dx, dy);
    this.applyToCamera();
  }

  applyToCamera() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this._dir.copy(this.forwardH).multiplyScalar(cp).addScaledVector(this._up, sp);
    this.camera.up.copy(this._up);
    this.camera.position.copy(this.feet).addScaledVector(this._up, EYE);
    this.camera.lookAt(this._tmp.copy(this.camera.position).add(this._dir));
  }

  addRecoil(vertical, horizontal) {
    this.pitch = Math.min(MAX_PITCH, this.pitch + vertical);
    this.forwardH.applyAxisAngle(this._up, (Math.random() - 0.5) * horizontal);
    this.applyToCamera();
  }

  keys() {
    return [...this.keys];
  }

  solidAt(p) {
    const { size, getVoxels } = this.world;
    const voxels = getVoxels();
    if (!voxels) return false;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);
    if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return false;
    return voxels[x + size * (y + size * z)] !== 0;
  }

  canStand(p) {
    const up = this._up;
    for (const h of BODY_HEIGHTS) {
      this._body.copy(p).addScaledVector(up, h);
      if (this.solidAt(this._body)) return false;
    }
    return true;
  }

  probe(origin, dir, len) {
    const voxels = this.world.getVoxels();
    if (!voxels) return null;
    const size = this.world.size;
    this._origin[0] = origin.x;
    this._origin[1] = origin.y;
    this._origin[2] = origin.z;
    this._dirArr[0] = dir.x;
    this._dirArr[1] = dir.y;
    this._dirArr[2] = dir.z;
    return raycastVoxels(voxels, size, size, size, this._origin, this._dirArr, len);
  }

  update(dt) {
    const voxels = this.world.getVoxels();
    if (!voxels || dt <= 0) return;

    const center = this.world.center;
    const R = this.world.radius;

    const up = this._up.copy(this.feet).sub(center);
    let r = up.length();
    if (r < 1e-6) {
      up.set(1, 0, 0);
      r = 1;
    }
    up.multiplyScalar(1 / r);

    if (r < R - 10) {
      this.feet.copy(center).addScaledVector(up, R + 1.5);
      r = R + 1.5;
    } else if (r > R + 70) {
      this.feet.copy(center).addScaledVector(up, R + 70);
      r = R + 70;
    }

    this.forwardH.addScaledVector(up, -this.forwardH.dot(up));
    if (this.forwardH.lengthSq() < 1e-8) {
      this.forwardH.set(0, 0, 1).addScaledVector(up, -up.z);
      if (this.forwardH.lengthSq() < 1e-8) this.forwardH.set(0, 1, 0);
    }
    this.forwardH.normalize();
    const right = this._right.crossVectors(this.forwardH, up).normalize();

    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);

    if (this.fly) {
      const cp = Math.cos(this.pitch);
      const sp = Math.sin(this.pitch);
      this._dir.copy(this.forwardH).multiplyScalar(cp).addScaledVector(up, sp);
      this._wish.copy(this._dir).multiplyScalar(f).addScaledVector(right, s);
      if (k.has('Space')) this._wish.addScaledVector(up, 1);
      if (k.has('ShiftLeft') || k.has('ShiftRight')) this._wish.addScaledVector(up, -1);
      const len = this._wish.length();
      if (len > 1e-6) this.feet.addScaledVector(this._wish, (FLY_SPEED * dt) / len);
      this.velH.set(0, 0, 0);
      this.vUp = 0;
      this.grounded = false;
      this.applyToCamera();
      return;
    }

    const sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && f > 0;
    const speed = sprinting ? SPRINT : WALK;

    this._wish.copy(this.forwardH).multiplyScalar(f).addScaledVector(right, s);
    const wl = this._wish.length();
    if (wl > 1e-6) this._wish.multiplyScalar(speed / wl);

    if (this.grounded) {
      this.velH.copy(this._wish);
    } else if (wl > 1e-6) {
      this.velH.lerp(this._wish, 1 - Math.exp(-AIR_CONTROL * dt));
    }

    if (this.grounded && this._jumpQueued) {
      this.vUp = JUMP;
      this.grounded = false;
      this._jumpQueued = false;
    }

    if (this.vUp > 0 || !this.grounded) this.vUp -= GRAVITY * dt;

    const move = this._move.copy(this.velH).multiplyScalar(dt);
    if (move.lengthSq() > 1e-12 && !this.canStand(this._cand.copy(this.feet).add(move))) {
      const df = move.dot(this.forwardH);
      const dr = move.dot(right);
      const stepped = this._cand.copy(this.feet)
        .add(move)
        .addScaledVector(up, STEP_UP);
      let resolved = this.canStand(stepped);
      if (resolved) this.feet.copy(stepped);
      if (!resolved && df !== 0) {
        const fwdOnly = this._cand.copy(this.feet).addScaledVector(this.forwardH, df);
        if (this.canStand(fwdOnly)) {
          this.feet.copy(fwdOnly);
          resolved = true;
        }
      }
      if (!resolved && dr !== 0) {
        const rightOnly = this._cand.copy(this.feet).addScaledVector(right, dr);
        if (this.canStand(rightOnly)) this.feet.copy(rightOnly);
      }
      this.velH.set(0, 0, 0);
    } else {
      this.feet.add(move);
    }

    if (this.vUp > 0) {
      this._tmp.copy(this.feet).addScaledVector(up, EYE - 0.1);
      const ceiling = this.probe(this._tmp, up, this.vUp * dt + 0.15);
      if (ceiling) this.vUp = 0;
      else this.feet.addScaledVector(up, this.vUp * dt);
      this.grounded = false;
    } else {
      const probeLen = SKIN + (this.grounded ? STEP_DOWN : Math.max(0, -this.vUp) * dt + 0.02);
      const hit = this.probe(this.feet, this._tmp.copy(up).negate(), probeLen);
      if (hit) {
        this.feet.addScaledVector(up, -hit.distance);
        this.vUp = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
        this.feet.addScaledVector(up, this.vUp * dt);
      }
    }

    this.applyToCamera();
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
