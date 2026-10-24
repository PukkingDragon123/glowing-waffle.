// First-person movement: a capsule-ish cannon body driven by velocity, mouse
// look, crouch, head bob, footsteps (sound + noise for the alien), and a
// camera override used by cutscenes and seated/lying poses.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { CANNON, GROUP } from '../core/physics.js';
import { clamp, damp, lerp, DEG, snoise1, wrapAngle } from '../core/util.js';

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();

export class Controller {
  constructor() {
    const r = this.radius = 0.26;
    const b = this.body = new CANNON.Body({
      mass: 70, fixedRotation: true, linearDamping: 0, material: G.physics.matPlayer,
      collisionFilterGroup: GROUP.PLAYER, collisionFilterMask: GROUP.STATIC | GROUP.PROP | GROUP.MOVER | GROUP.CAT,
      allowSleep: false,
    });
    this.sLow = new CANNON.Sphere(r); this.sMid = new CANNON.Sphere(r); this.sHigh = new CANNON.Sphere(r);
    b.addShape(this.sLow, new CANNON.Vec3(0, r, 0));
    b.addShape(this.sMid, new CANNON.Vec3(0, r + 0.5, 0));
    b.addShape(this.sHigh, new CANNON.Vec3(0, r + 1.05, 0));
    b.position.set(0, 0.05, 0);
    G.physics.world.addBody(b);
    b.updateMassProperties();

    this.yaw = 0; this.pitch = 0;
    this.eye = 1.6; this.eyeTarget = 1.6;
    this.crouched = false;
    this.enabled = true;       // movement
    this.lookEnabled = true;
    this.grounded = false;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.stepPhase = 0; this.stepDist = 0;
    this.bob = 0; this.bobAmt = 0;
    this.landDip = 0; this.fallVel = 0;
    this.override = null;      // { pos: Vector3, quat: Quaternion } camera override
    this.overrideBlend = 0;
    this.shake = 0;            // transient camera shake
    this.sway = 0;             // dizziness sway (hunger)
    this.tremble = 0;          // micro tremble (sickness)
    this.speedMul = 1;
    this.runAllowed = true;
    this.lookLimit = null;     // {yaw, pitch, range} for seated modes
    this.headPos = new THREE.Vector3();
    this.moveInput = new THREE.Vector2();
    this.noiseTimer = 0;
    this.lean = 0;
    this._camPos = new THREE.Vector3();
    this._camQuat = new THREE.Quaternion();
    this.roll = 0;
    this.zoom = 0;
  }

  get position() { return this.body.position; }
  teleport(x, y, z, yaw = null, pitch = null) {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.body.previousPosition.set(x, y, z);
    this.body.interpolatedPosition.set(x, y, z);
    if (yaw !== null) this.yaw = yaw;
    if (pitch !== null) this.pitch = pitch;
  }

  setCrouch(c) {
    if (c === this.crouched) return;
    if (!c) {
      // need head room to stand up
      const p = this.body.position;
      const hit = G.physics.raycast({ x: p.x, y: p.y + 0.9, z: p.z }, { x: p.x, y: p.y + 1.75, z: p.z }, GROUP.STATIC | GROUP.MOVER);
      if (hit) return;
    }
    this.crouched = c;
    if (c) this.body.removeShape(this.sHigh);
    else this.body.addShape(this.sHigh, new CANNON.Vec3(0, this.radius + 1.05, 0));
    this.body.updateMassProperties();
  }

  update(dt) {
    const inp = G.input;
    const set = G.settings.v;
    // ---- look
    if (this.lookEnabled && !G.interact?.rotating) {
      const sens = 0.0009 + set.sensitivity * 0.00028;
      this.yaw -= inp.mdx * sens;
      this.pitch -= inp.mdy * sens * (set.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -88 * DEG, 85 * DEG);
      if (this.lookLimit) {
        const L = this.lookLimit;
        this.yaw = L.yaw + clamp(wrapAngle(this.yaw - L.yaw), -L.range, L.range);
        this.pitch = clamp(this.pitch, L.pitch - L.prange, L.pitch + L.prange);
      }
    }

    // ---- move
    const b = this.body;
    let mx = 0, mz = 0;
    if (this.enabled) {
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) mz += 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) mz -= 1;
      if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) mx -= 1;
      if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) mx += 1;
      if (inp.pressed('KeyC') || inp.pressed('ControlRight')) this.setCrouch(!this.crouched);
    }
    this.moveInput.set(mx, mz);
    const running = this.enabled && this.runAllowed && (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight')) && mz > 0 && !this.crouched;
    if (running && this.crouched) this.setCrouch(false);
    let maxSpeed = this.crouched ? 0.95 : running ? 3.1 : 1.65;
    maxSpeed *= this.speedMul;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _wish.set(0, 0, 0).addScaledVector(_fwd, mz).addScaledVector(_right, mx);
    if (_wish.lengthSq() > 1) _wish.normalize();
    _wish.multiplyScalar(maxSpeed);
    const accel = this.grounded ? 10 : 2;
    this.vel.x = damp(this.vel.x, _wish.x, accel, dt);
    this.vel.z = damp(this.vel.z, _wish.z, accel, dt);
    b.velocity.x = this.vel.x;
    b.velocity.z = this.vel.z;

    // ground check
    const p = b.position;
    const hit = G.physics.raycast({ x: p.x, y: p.y + 0.3, z: p.z }, { x: p.x, y: p.y - 0.12, z: p.z }, GROUP.STATIC | GROUP.MOVER | GROUP.PROP);
    const wasGrounded = this.grounded;
    this.grounded = !!hit;
    if (this.grounded) {
      // stick to ground / glide up small steps
      const gy = hit.hitPointWorld.y;
      if (p.y < gy + 0.02) { p.y = damp(p.y, gy, 20, dt); if (b.velocity.y < 0) b.velocity.y = 0; }
      if (!wasGrounded && this.fallVel < -2.5) { this.landDip = clamp(-this.fallVel * 0.025, 0, 0.12); emit('footstep', { pos: new THREE.Vector3(p.x, p.y, p.z), loud: 0.9, land: true }); }
    }
    this.fallVel = b.velocity.y;
    this.speed = Math.hypot(b.velocity.x, b.velocity.z);

    // ---- footsteps / bob
    if (this.grounded && this.speed > 0.15) {
      const stride = this.crouched ? 0.55 : running ? 0.95 : 0.72;
      this.stepDist += this.speed * dt;
      this.stepPhase += (this.speed * dt) / stride * Math.PI;
      if (this.stepDist >= stride) {
        this.stepDist -= stride;
        const loud = this.crouched ? 0.12 : running ? 0.85 : 0.35;
        emit('footstep', { pos: new THREE.Vector3(p.x, p.y, p.z), loud, run: running, crouch: this.crouched });
        emit('noise', { pos: new THREE.Vector3(p.x, p.y, p.z), loud: loud * (running ? 1 : 0.6), kind: 'step' });
      }
    } else {
      this.stepDist = Math.max(0, this.stepDist - dt * 0.5);
    }
    const bobTarget = set.headBob ? clamp(this.speed / 3, 0, 1) : 0;
    this.bobAmt = damp(this.bobAmt, bobTarget, 6, dt);

    // eye height
    this.eyeTarget = this.crouched ? 1.02 : 1.6;
    this.eye = damp(this.eye, this.eyeTarget, 9, dt);
    this.landDip = damp(this.landDip, 0, 6, dt);
    this.shake = damp(this.shake, 0, 3, dt);
  }

  // compute final camera transform
  updateCamera(cam, dt) {
    const b = this.body;
    const ip = b.interpolatedPosition;
    const t = G.time;
    const bob = Math.sin(this.stepPhase) * 0.035 * this.bobAmt;
    const bobX = Math.cos(this.stepPhase * 0.5) * 0.025 * this.bobAmt;
    const swayX = snoise1(t * 0.35, 1) * this.sway * 0.06;
    const swayY = snoise1(t * 0.28, 2) * this.sway * 0.04;
    // breathing
    const breath = Math.sin(t * 1.6) * 0.004;
    this.headPos.set(ip.x, ip.y + this.eye + Math.abs(bob) - this.landDip + breath, ip.z);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.headPos.addScaledVector(_right, bobX + swayX);
    this.headPos.y += swayY;

    const shake = this.shake + this.tremble * 0.25;
    const sx = snoise1(t * 23, 3) * shake * 0.02, sy = snoise1(t * 21, 4) * shake * 0.02;
    const rollTarget = Math.sin(this.stepPhase * 0.5) * 0.006 * this.bobAmt + snoise1(t * 0.3, 5) * this.sway * 0.07 + this.roll;
    const e = new THREE.Euler(this.pitch + sy + swayY * 0.5, this.yaw + sx + swayX * 0.4, rollTarget, 'YXZ');
    this._camQuat.setFromEuler(e);
    this._camPos.copy(this.headPos);

    if (this.override) {
      this.overrideBlend = damp(this.overrideBlend, 1, this.override.speed ?? 6, dt);
    } else {
      this.overrideBlend = damp(this.overrideBlend, 0, 8, dt);
      if (this.overrideBlend < 0.002) this.overrideBlend = 0;
    }
    if (this.overrideBlend > 0 && this.lastOverride) {
      const o = this.override || this.lastOverride;
      this._camPos.lerp(o.pos, this.overrideBlend);
      this._camQuat.slerp(o.quat, this.overrideBlend);
      if (this.override) this.lastOverride = this.override;
    } else if (this.override) this.lastOverride = this.override;
    cam.position.copy(this._camPos);
    cam.quaternion.copy(this._camQuat);
    const fov = G.settings.v.fov - this.zoom;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = damp(cam.fov, fov, 8, dt); cam.updateProjectionMatrix(); }
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  flatForward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  lookAtPoint(target, blend = 1) {
    const dx = target.x - this.headPos.x, dy = target.y - this.headPos.y, dz = target.z - this.headPos.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.yaw = this.yaw + wrapAngle(yaw - this.yaw) * blend;
    this.pitch = lerp(this.pitch, pitch, blend);
  }
}
