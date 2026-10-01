import { Vector3 } from 'three/webgpu';

const SPEED = 18;
const SENSITIVITY = 0.0022;
const MIN_PITCH = -Math.PI / 2 + 0.01;
const MAX_PITCH = Math.PI / 2 - 0.01;

export class FlyControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.25;
    this.locked = false;
    this.onAim = null;

    this._forward = new Vector3();
    this._right = new Vector3();
    this._move = new Vector3();
    this._worldUp = new Vector3(0, 1, 0);

    this._onMouseMove = (event) => {
      if (!this.locked) return;
      this.yaw -= event.movementX * SENSITIVITY;
      this.pitch -= event.movementY * SENSITIVITY;
      this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
      if (this.onAim) this.onAim(event.movementX, event.movementY);
    };

    this._onKeyDown = (event) => {
      if (event.code === 'Space') event.preventDefault();
      this.keys.add(event.code);
    };

    this._onKeyUp = (event) => this.keys.delete(event.code);

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

  applyToCamera() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  addRecoil(vertical, horizontal) {
    this.pitch = Math.min(MAX_PITCH, this.pitch + vertical);
    this.yaw += (Math.random() - 0.5) * horizontal;
    this.applyToCamera();
  }

  update(dt) {
    const k = this.keys;
    const camera = this.camera;

    camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this._worldUp).normalize();

    const move = this._move.set(0, 0, 0);
    if (k.has('KeyW')) move.add(this._forward);
    if (k.has('KeyS')) move.sub(this._forward);
    if (k.has('KeyD')) move.add(this._right);
    if (k.has('KeyA')) move.sub(this._right);
    if (k.has('Space')) move.y += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(SPEED * dt);
      camera.position.add(move);
    }
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
