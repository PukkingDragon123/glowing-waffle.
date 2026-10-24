// cannon-es wrapper: static world boxes, dynamic props, kinematic movers
// (doors, drawers, the cat), impact sounds and noise events.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { G, emit } from './globals.js';
import { clamp } from './util.js';

export const GROUP = { STATIC: 1, PROP: 2, PLAYER: 4, MOVER: 8, CAT: 16, HELD: 32, TRIGGER: 64 };

const _q = new CANNON.Quaternion();
const _tq = new THREE.Quaternion();

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World();
    w.gravity.set(0, -9.82, 0);
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 12;
    w.solver.tolerance = 0.0005;
    this.matDefault = new CANNON.Material('default');
    this.matPlayer = new CANNON.Material('player');
    this.matProp = new CANNON.Material('prop');
    w.defaultContactMaterial.friction = 0.45;
    w.defaultContactMaterial.restitution = 0.08;
    w.addContactMaterial(new CANNON.ContactMaterial(this.matPlayer, this.matDefault, { friction: 0, restitution: 0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matPlayer, this.matProp, { friction: 0.1, restitution: 0 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matProp, this.matDefault, { friction: 0.55, restitution: 0.12 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matProp, this.matProp, { friction: 0.5, restitution: 0.1 }));
    this.props = [];
    this.movers = [];
    this.statics = [];
    this.fixed = 1 / 60;
    this.lastImpact = 0;
  }

  addStaticBox(cx, cy, cz, hx, hy, hz, ry = 0, tag = 'world') {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.matDefault, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: -1 });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(cx, cy, cz);
    if (ry) b.quaternion.setFromEuler(0, ry, 0);
    b.userData = { tag };
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }

  addStaticCyl(cx, cy, cz, r, h, tag = 'world') {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.matDefault, collisionFilterGroup: GROUP.STATIC });
    b.addShape(new CANNON.Cylinder(r, r, h, 10));
    b.position.set(cx, cy, cz);
    b.userData = { tag };
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }

  remove(body) {
    if (!body) return;
    this.world.removeBody(body);
    let i = this.statics.indexOf(body); if (i >= 0) this.statics.splice(i, 1);
    i = this.movers.findIndex((m) => m.body === body); if (i >= 0) this.movers.splice(i, 1);
  }

  // A dynamic prop. shape: {type:'box', size:[x,y,z]} | {type:'cyl', r, h} | {type:'sphere', r}
  addProp(mesh, shape, { mass = 0.5, sound = 'plastic', sleeping = true, damping = 0.08 } = {}) {
    const b = new CANNON.Body({
      mass, material: this.matProp, linearDamping: damping, angularDamping: 0.12,
      collisionFilterGroup: GROUP.PROP, collisionFilterMask: GROUP.STATIC | GROUP.PROP | GROUP.PLAYER | GROUP.MOVER | GROUP.CAT,
      allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.6,
    });
    b.addShape(makeShape(shape));
    b.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    b.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    b.userData = { mesh, sound };
    b.addEventListener('collide', (e) => this.onCollide(b, e));
    this.world.addBody(b);
    if (sleeping) b.sleep();
    const p = { body: b, mesh };
    this.props.push(p);
    mesh.userData.body = b;
    return b;
  }

  removeProp(body) {
    const i = this.props.findIndex((p) => p.body === body);
    if (i >= 0) this.props.splice(i, 1);
    this.world.removeBody(body);
  }

  // kinematic body driven toward a target pose every step (doors, drawers, cat)
  addMover(shapeDesc, group = GROUP.MOVER, offset = null) {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.matDefault, collisionFilterGroup: group, collisionFilterMask: GROUP.PROP | GROUP.PLAYER });
    if (Array.isArray(shapeDesc)) {
      for (const s of shapeDesc) b.addShape(makeShape(s), s.offset ? new CANNON.Vec3(...s.offset) : undefined);
    } else b.addShape(makeShape(shapeDesc), offset ? new CANNON.Vec3(...offset) : undefined);
    b.userData = {};
    this.world.addBody(b);
    const m = { body: b, tp: new CANNON.Vec3(), tq: new CANNON.Quaternion(), active: true };
    this.movers.push(m);
    return m;
  }
  setMoverTarget(m, pos, quat, snap = false) {
    m.tp.set(pos.x, pos.y, pos.z);
    m.tq.set(quat.x, quat.y, quat.z, quat.w);
    if (snap) { m.body.position.copy(m.tp); m.body.quaternion.copy(m.tq); m.body.velocity.setZero(); m.body.angularVelocity.setZero(); }
  }

  onCollide(body, e) {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 0.9) return;
    const now = performance.now();
    if (now - (body.userData.lastHit || 0) < 90) return;
    body.userData.lastHit = now;
    const vol = clamp((v - 0.8) / 5, 0.05, 1);
    const p = body.position;
    emit('impact', { body, sound: body.userData.sound, vol, pos: new THREE.Vector3(p.x, p.y, p.z) });
    if (vol > 0.25) emit('noise', { pos: new THREE.Vector3(p.x, p.y, p.z), loud: vol * 0.8, kind: 'impact' });
  }

  update(dt) {
    // drive kinematic movers toward targets
    const h = this.fixed;
    for (const m of this.movers) {
      if (!m.active) continue;
      const b = m.body;
      b.velocity.set((m.tp.x - b.position.x) / h, (m.tp.y - b.position.y) / h, (m.tp.z - b.position.z) / h);
      // angular velocity from quaternion delta
      b.quaternion.conjugate(_q);
      const dq = m.tq.mult(_q);
      if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
      const s = Math.sqrt(dq.x * dq.x + dq.y * dq.y + dq.z * dq.z);
      if (s > 1e-6) {
        const ang = 2 * Math.atan2(s, dq.w);
        b.angularVelocity.set(dq.x / s * ang / h, dq.y / s * ang / h, dq.z / s * ang / h);
      } else b.angularVelocity.setZero();
    }
    this.world.step(h, Math.min(dt, 0.1), 4);
    for (const p of this.props) {
      if (p.held) continue;
      const b = p.body;
      p.mesh.position.set(b.interpolatedPosition.x, b.interpolatedPosition.y, b.interpolatedPosition.z);
      p.mesh.quaternion.set(b.interpolatedQuaternion.x, b.interpolatedQuaternion.y, b.interpolatedQuaternion.z, b.interpolatedQuaternion.w);
      // fell out of the world: put it back on the floor
      if (b.position.y < -20) { b.position.set(b.position.x, 1, b.position.z); b.velocity.setZero(); }
    }
  }

  raycast(from, to, mask = GROUP.STATIC | GROUP.MOVER) {
    const res = new CANNON.RaycastResult();
    this.world.raycastClosest(new CANNON.Vec3(from.x, from.y, from.z), new CANNON.Vec3(to.x, to.y, to.z), { collisionFilterMask: mask, skipBackfaces: true }, res);
    return res.hasHit ? res : null;
  }

  // is the straight line between two points free of static geometry?
  lineClear(a, b, mask = GROUP.STATIC | GROUP.MOVER) { return !this.raycast(a, b, mask); }
}

export function makeShape(s) {
  if (s.type === 'box') return new CANNON.Box(new CANNON.Vec3(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2));
  if (s.type === 'sphere') return new CANNON.Sphere(s.r);
  if (s.type === 'cyl') {
    // cannon cylinders are aligned with Y in cannon-es
    return new CANNON.Cylinder(s.r, s.r2 ?? s.r, s.h, s.seg ?? 10);
  }
  throw new Error('bad shape ' + s.type);
}

export { CANNON };
