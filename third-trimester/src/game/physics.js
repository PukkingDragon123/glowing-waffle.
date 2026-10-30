// cannon-es wrapper: static colliders, dynamic props linked to meshes, spring dragging.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export class Physics {
  constructor() {
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w); w.allowSleep = true;
    w.defaultContactMaterial.friction = 0.45; w.defaultContactMaterial.restitution = 0.15;
    w.solver.iterations = 12;
    this.links = []; this.acc = 0;
    this.mouse = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC }); this.mouse.collisionResponse = false; w.addBody(this.mouse);
    this.joint = null; this.dragging = null;
  }
  addStaticBox(center, half, yaw = 0, tag = '') {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(...half)) });
    b.position.set(...center); b.quaternion.setFromEuler(0, yaw, 0); b.tag = tag;
    this.world.addBody(b); return b;
  }
  // Link a dynamic body to an Object3D. shape: {box:[hx,hy,hz]} | {sphere:r} | {cyl:[r,h]}; offset = shape centre in object space
  addProp(obj, { box, sphere, cyl, mass = 0.3, offset = [0, 0, 0], damping = 0.15 } = {}) {
    let shape;
    if (box) shape = new CANNON.Box(new CANNON.Vec3(...box));
    else if (sphere) shape = new CANNON.Sphere(sphere);
    else if (cyl) shape = new CANNON.Cylinder(cyl[0], cyl[0], cyl[1], 12);
    const b = new CANNON.Body({ mass, shape: undefined, linearDamping: damping, angularDamping: 0.35, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.6 });
    b.addShape(shape, new CANNON.Vec3(...offset));
    obj.updateMatrixWorld(true);
    const p = obj.getWorldPosition(new THREE.Vector3()), q = obj.getWorldQuaternion(new THREE.Quaternion());
    b.position.set(p.x, p.y, p.z); b.quaternion.set(q.x, q.y, q.z, q.w);
    this.world.addBody(b);
    const link = { obj, body: b, offset: new THREE.Vector3(...offset), enabled: true };
    this.links.push(link); obj.userData.body = b; obj.userData.link = link;
    return b;
  }
  remove(obj) {
    const l = obj.userData.link; if (!l) return;
    this.world.removeBody(l.body); this.links = this.links.filter((x) => x !== l); obj.userData.body = obj.userData.link = null;
  }
  // Pin a prop in place (stored on a shelf): becomes static/kinematic until picked up again.
  freeze(obj, pos, quat) {
    const b = obj.userData.body; if (!b) return;
    b.type = CANNON.Body.KINEMATIC; b.velocity.setZero(); b.angularVelocity.setZero();
    if (pos) b.position.set(pos.x, pos.y, pos.z); if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    b.updateMassProperties?.();
  }
  unfreeze(obj) { const b = obj.userData.body; if (!b) return; b.type = CANNON.Body.DYNAMIC; b.mass = b.mass || 0.3; b.updateMassProperties(); b.wakeUp(); }
  teleport(obj, pos, quat) {
    const b = obj.userData.body; if (!b) { obj.position.copy(pos); if (quat) obj.quaternion.copy(quat); return; }
    b.position.set(pos.x, pos.y, pos.z); if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    b.velocity.setZero(); b.angularVelocity.setZero(); b.wakeUp();
  }
  startDrag(obj, point) {
    const b = obj.userData.body; if (!b) return;
    if (b.type !== CANNON.Body.DYNAMIC) this.unfreeze(obj);
    this.mouse.position.set(point.x, point.y, point.z);
    const local = b.quaternion.inverse().vmult(new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z));
    this.joint = new CANNON.PointToPointConstraint(b, local, this.mouse, new CANNON.Vec3(0, 0, 0), 30);
    this.world.addConstraint(this.joint); this.dragging = obj; b.wakeUp();
    b.angularDamping = 0.85; b.linearDamping = 0.6;
  }
  moveDrag(point) { if (this.joint) this.mouse.position.set(point.x, point.y, point.z); }
  endDrag(throwVel) {
    if (!this.joint) return null;
    this.world.removeConstraint(this.joint); this.joint = null;
    const o = this.dragging; this.dragging = null;
    const b = o.userData.body; b.angularDamping = 0.35; b.linearDamping = 0.15;
    if (throwVel) b.velocity.set(throwVel.x, throwVel.y, throwVel.z);
    return o;
  }
  step(dt) {
    this.acc += Math.min(dt, 0.1);
    const h = 1 / 90;
    while (this.acc >= h) { this.world.step(h); this.acc -= h; }
    for (const l of this.links) {
      if (!l.enabled) continue;
      const b = l.body;
      if (b.sleepState === CANNON.Body.SLEEPING && !l.obj.userData.dirty) continue;
      const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const p = new THREE.Vector3(b.position.x, b.position.y, b.position.z);
      // object origin = body position (shape offsets live in the body)
      const parent = l.obj.parent;
      if (parent && parent.type !== 'Scene') { parent.updateMatrixWorld(true); const inv = parent.matrixWorld.clone().invert(); p.applyMatrix4(inv); q.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert()); }
      l.obj.position.copy(p); l.obj.quaternion.copy(q);
      // fell out of the world: put it back on the floor
      if (b.position.y < -2) { b.position.set(0, 1, 0.5); b.velocity.setZero(); }
    }
  }
}
