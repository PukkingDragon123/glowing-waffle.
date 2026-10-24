// Interactive world objects: hinged doors (also cabinet/fridge doors), drawers,
// sash windows, switches and buttons. Doors and drawers can be dragged with
// the mouse (hold LMB) or toggled with E. Each has a kinematic physics body
// so props and the player collide with them.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { GROUP } from '../core/physics.js';
import { clamp, damp, lerp } from '../core/util.js';
import { boxGeo } from '../gfx/geo.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const sfx = (name, o) => G.audio && G.audio.play(name, o);

export class Interactable {
  constructor(root, opts = {}) {
    this.root = root;
    this.name = opts.name || 'thing';
    this.enabled = true;
    this.reach = opts.reach ?? 2.1;
    this.tag(root);
    G.world.addInteractable(this);
  }
  tag(obj) { obj.traverse((o) => { if (o.isMesh) o.userData.inter = this; }); }
  actions() { return []; }
  use() {}
  canGrab() { return false; }
  grabStart() {}
  grabMove() {}
  grabEnd() {}
  update() {}
  worldPos(out = new THREE.Vector3()) { return this.root.getWorldPosition(out); }
}

// ---------------------------------------------------------------------------
export class Door extends Interactable {
  // hinge: world position of the hinge line bottom. closedYaw: yaw so that the
  // panel's local +x points from hinge to latch. openDir: +1/-1 swing sense.
  constructor(o) {
    const pivot = new THREE.Group();
    pivot.position.copy(o.hinge);
    super(pivot, { name: o.name || 'door', reach: o.reach });
    this.o = o;
    this.w = o.width; this.h = o.height; this.t = o.thick ?? 0.045;
    this.closedYaw = o.closedYaw; this.openDir = o.openDir ?? 1;
    this.max = o.maxAngle ?? 1.75;
    this.angle = o.angle ?? 0; this.target = null; this.av = 0;
    this.locked = !!o.locked;
    this.kind = o.kind || 'door';
    this.label = o.label || (this.kind === 'door' ? 'door' : this.kind);
    this.mass = o.mass ?? (this.kind === 'door' ? 1 : 0.4);
    this.friction = o.friction ?? (this.kind === 'door' ? 2.2 : 3.5);
    this.dragging = false;
    this.lastSound = 0;
    this.blocked = false;
    this.onChange = o.onChange || null;
    this.wasOpen = this.angle > 0.05;

    const panel = this.panel = new THREE.Group();
    pivot.add(panel);
    if (o.buildPanel) o.buildPanel(panel, this);
    else {
      const g = boxGeo(this.w - 0.004, this.h - 0.004, this.t, 1);
      // map whole door texture on front/back faces
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const n = Math.floor(i / 4);
        if (n === 4 || n === 5) uv.setXY(i, i % 4 === 0 || i % 4 === 3 ? (n === 4 ? 0 : 1) : (n === 4 ? 1 : 0), i % 4 < 2 ? 0 : 1);
      }
      const m = new THREE.Mesh(g, o.mat);
      m.position.set(this.w / 2, this.h / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      panel.add(m);
      if (o.knob !== false) {
        const km = o.knobMat;
        for (const s of [1, -1]) {
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), km);
          knob.position.set(this.w - 0.07, 0.98, s * (this.t / 2 + 0.035));
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.035, 6), km);
          neck.rotation.x = Math.PI / 2; neck.position.set(this.w - 0.07, 0.98, s * (this.t / 2 + 0.017));
          const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 10), km);
          rose.rotation.x = Math.PI / 2; rose.position.set(this.w - 0.07, 0.98, s * (this.t / 2 + 0.003));
          panel.add(knob, neck, rose);
        }
      }
      if (o.number) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), o.numberMat);
        plate.position.set(this.w / 2, 1.62, this.t / 2 + 0.002);
        panel.add(plate);
      }
    }
    this.tag(panel);
    (o.parent || G.scene).add(pivot);
    this.mover = G.physics.addMover({ type: 'box', size: [this.w, this.h, this.t + 0.01] }, GROUP.MOVER);
    this.applyPose(true);
  }
  get open() { return this.angle > 0.08; }
  actions() {
    if (this.locked) return [{ key: 'E', label: 'Try ' + this.label }];
    return [{ key: 'E', label: (this.open ? 'Close ' : 'Open ') + this.label }, { key: 'LMB', label: 'Drag' }];
  }
  use() {
    if (this.locked) {
      sfx(this.kind === 'door' ? 'doorRattle' : 'cabinetRattle', { pos: this.worldPos(_v), vol: 0.8 });
      emit('locked', this);
      if (this.o.onLocked) this.o.onLocked(this);
      return;
    }
    this.target = this.open ? 0 : this.max * (this.o.openTo ?? 0.92);
    if (!this.open) this.unlatch();
  }
  unlatch() { const now = G.time; if (now - this.lastSound > 0.3) { sfx(this.o.soundOpen || (this.kind === 'door' ? 'doorOpen' : this.kind === 'fridge' ? 'fridgeOpen' : 'cabinetOpen'), { pos: this.worldPos(_v), vol: 0.7 }); this.lastSound = now; } }
  canGrab() { return !this.locked; }
  grabStart(hit) {
    this.dragging = true; this.target = null;
    // which side of the panel is the player on? (normal = panel local +z)
    const n = _v.set(0, 0, 1).applyQuaternion(this.panel.getWorldQuaternion(_q));
    const toP = _v2.copy(G.camera.position).sub(this.worldPos(new THREE.Vector3()));
    this.side = Math.sign(n.dot(toP)) || 1;
    if (!this.open) this.unlatch();
  }
  grabMove(dx, dy) {
    // pushing the mouse forward (dy<0) pushes the door away from the player
    const push = -dy * 0.0045 - dx * 0.0012 * this.side;
    this.av += push * -this.side * this.openDir * (this.kind === 'door' ? 1 : 1.6) * 60;
  }
  grabEnd() { this.dragging = false; }
  setAngle(a) { this.angle = clamp(a, 0, this.max); this.av = 0; this.target = null; this.applyPose(true); }
  update(dt) {
    const prev = this.angle;
    if (this.target !== null) {
      const a = damp(this.angle, this.target, this.kind === 'door' ? 4.5 : 7, dt);
      this.av = (a - this.angle) / Math.max(dt, 1e-4);
      this.angle = a;
      if (Math.abs(this.angle - this.target) < 0.004) { this.angle = this.target; this.target = null; this.av = 0; }
    } else {
      this.av *= Math.exp(-this.friction * dt);
      this.av = clamp(this.av, -6, 6);
      this.angle += this.av * dt;
    }
    // collision with the player: stop the swing instead of shoving through
    if (this.kind === 'door' && Math.abs(this.angle - prev) > 1e-5 && this.hitsPlayer()) {
      this.angle = prev; this.av = -this.av * 0.2; this.target = null;
    }
    if (this.angle <= 0) {
      if (prev > 0.02 && this.av < -1.6) { sfx(this.kind === 'door' ? 'doorSlam' : 'cabinetSlam', { pos: this.worldPos(_v), vol: clamp(-this.av / 5, 0.3, 1) }); emit('noise', { pos: this.worldPos(new THREE.Vector3()), loud: clamp(-this.av / 4, 0.3, 1), kind: 'slam' }); }
      else if (prev > 0.02) sfx(this.o.soundClose || (this.kind === 'door' ? 'doorClose' : this.kind === 'fridge' ? 'fridgeClose' : 'cabinetClose'), { pos: this.worldPos(_v), vol: 0.6 });
      this.angle = 0; if (this.av < 0) this.av = 0;
    }
    if (this.angle >= this.max) { this.angle = this.max; if (this.av > 0) this.av = -this.av * 0.25; }
    // creak while moving
    const spd = Math.abs(this.angle - prev) / Math.max(dt, 1e-4);
    if (spd > 0.4 && this.kind === 'door' && G.time - this.lastSound > 0.9 && this.angle > 0.1) { sfx('doorCreak', { pos: this.worldPos(_v), vol: clamp(spd / 3, 0.15, 0.6), rate: 0.8 + Math.random() * 0.4 }); this.lastSound = G.time; }
    const isOpen = this.angle > 0.05;
    if (isOpen !== this.wasOpen) { this.wasOpen = isOpen; this.onChange && this.onChange(this, isOpen); emit('doorChange', this); }
    this.applyPose(false);
  }
  hitsPlayer() {
    const pl = G.player && G.player.ctrl; if (!pl) return false;
    const p = pl.body.position;
    const yaw = this.closedYaw + this.angle * this.openDir;
    const hx = this.root.position.x, hz = this.root.position.z;
    const ex = hx + Math.cos(yaw) * this.w, ez = hz - Math.sin(yaw) * this.w;
    // distance from player to panel segment
    const vx = ex - hx, vz = ez - hz;
    const t = clamp(((p.x - hx) * vx + (p.z - hz) * vz) / (vx * vx + vz * vz));
    const cx = hx + vx * t, cz = hz + vz * t;
    const d = Math.hypot(p.x - cx, p.z - cz);
    return d < pl.radius + this.t * 0.5 + 0.02 && p.y < this.root.position.y + this.h && p.y + 1.7 > this.root.position.y;
  }
  applyPose(snap) {
    this.root.rotation.y = this.closedYaw + this.angle * this.openDir;
    this.root.updateMatrixWorld(true);
    // mover box center = panel center in world
    _v.set(this.w / 2, this.h / 2, 0).applyMatrix4(this.root.matrixWorld);
    this.root.getWorldQuaternion(_q);
    G.physics.setMoverTarget(this.mover, _v, _q, snap);
  }
}

// ---------------------------------------------------------------------------
export class Drawer extends Interactable {
  // group: the moving part (already built, positioned at closed pose in parent)
  // axis: world direction it slides out. size: [w,h,d] of the drawer box (for body)
  constructor(o) {
    super(o.group, { name: o.name || 'drawer' });
    this.o = o; this.group = o.group;
    this.closedPos = o.group.position.clone();
    this.axis = o.axis.clone().normalize();
    this.max = o.max ?? 0.4; this.pos = 0; this.vel = 0; this.target = null;
    this.locked = !!o.locked;
    this.label = o.label || 'drawer';
    const s = o.size;
    // tray body: floor + front + back + sides so contents stay inside
    const th = 0.012;
    const shapes = [
      { type: 'box', size: [s[0], th, s[2]], offset: [0, -s[1] / 2 + th / 2, 0] },
    ];
    this.mover = G.physics.addMover(shapes, GROUP.MOVER);
    this.mover2 = G.physics.addMover({ type: 'box', size: [s[0], s[1], 0.02] }, GROUP.MOVER);
    this.size = s;
    this.applyPose(true);
  }
  get open() { return this.pos > 0.03; }
  actions() { return this.locked ? [{ key: 'E', label: 'Try ' + this.label }] : [{ key: 'E', label: (this.open ? 'Close ' : 'Open ') + this.label }, { key: 'LMB', label: 'Drag' }]; }
  use() {
    if (this.locked) { sfx('cabinetRattle', { pos: this.worldPos(_v) }); return; }
    this.target = this.open ? 0 : this.max * 0.9;
    sfx('drawer', { pos: this.worldPos(_v), vol: 0.6, rate: 0.9 + Math.random() * 0.2 });
  }
  canGrab() { return !this.locked; }
  grabStart() { this.target = null; this.dragging = true; sfx('drawer', { pos: this.worldPos(_v), vol: 0.4 }); }
  grabMove(dx, dy) { this.vel += dy * 0.004 * 60 * 0.5; }
  grabEnd() { this.dragging = false; }
  update(dt) {
    const prev = this.pos;
    if (this.target !== null) {
      this.pos = damp(this.pos, this.target, 8, dt);
      if (Math.abs(this.pos - this.target) < 0.002) { this.pos = this.target; this.target = null; }
      this.vel = 0;
    } else {
      this.vel *= Math.exp(-6 * dt);
      this.pos += this.vel * dt;
    }
    if (this.pos < 0) { if (prev > 0.01 && this.vel < -0.4) sfx('drawerShut', { pos: this.worldPos(_v), vol: 0.7 }); this.pos = 0; this.vel = 0; }
    if (this.pos > this.max) { this.pos = this.max; this.vel = 0; }
    this.applyPose(false);
  }
  applyPose(snap) {
    const parent = this.group.parent;
    // axis is in world space; convert offset into parent space
    _v.copy(this.axis).multiplyScalar(this.pos);
    if (parent) { parent.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(); _v.transformDirection(inv).multiplyScalar(this.pos); }
    this.group.position.copy(this.closedPos).add(_v);
    this.group.updateMatrixWorld(true);
    const wp = this.group.getWorldPosition(new THREE.Vector3());
    const wq = this.group.getWorldQuaternion(new THREE.Quaternion());
    G.physics.setMoverTarget(this.mover, wp, wq, snap);
    // front panel collider
    const front = new THREE.Vector3(0, 0, this.size[2] / 2).applyQuaternion(wq).add(wp);
    G.physics.setMoverTarget(this.mover2, front, wq, snap);
  }
}

// ---------------------------------------------------------------------------
export class SashWindow extends Interactable {
  constructor(o) {
    super(o.sash, { name: 'window' });
    this.o = o; this.sash = o.sash; this.base = o.sash.position.clone();
    this.max = o.max ?? 0.55; this.pos = 0; this.vel = 0; this.target = null;
    this.locked = !!o.locked;
    this.onChange = o.onChange; this.wasOpen = false;
  }
  get open() { return this.pos > 0.05; }
  actions() { return this.locked ? [{ key: 'E', label: 'Try window' }] : [{ key: 'E', label: this.open ? 'Close window' : 'Open window' }, { key: 'LMB', label: 'Drag' }]; }
  use() {
    if (this.locked) { sfx('windowStuck', { pos: this.worldPos(_v) }); if (this.o.onLocked) this.o.onLocked(); return; }
    this.target = this.open ? 0 : this.max;
    sfx('windowSlide', { pos: this.worldPos(_v), vol: 0.7 });
  }
  canGrab() { return !this.locked; }
  grabStart() { this.target = null; sfx('windowSlide', { pos: this.worldPos(_v), vol: 0.4 }); }
  grabMove(dx, dy) { this.vel += -dy * 0.0025 * 60 * 0.5; }
  update(dt) {
    if (this.target !== null) {
      this.pos = damp(this.pos, this.target, 4, dt);
      if (Math.abs(this.pos - this.target) < 0.002) { this.pos = this.target; this.target = null; }
    } else { this.vel *= Math.exp(-8 * dt); this.pos += this.vel * dt; }
    if (this.pos < 0) { if (this.vel < -0.3) sfx('windowThud', { pos: this.worldPos(_v), vol: 0.6 }); this.pos = 0; this.vel = 0; }
    if (this.pos > this.max) { this.pos = this.max; this.vel = 0; }
    this.sash.position.copy(this.base); this.sash.position.y += this.pos;
    const isOpen = this.pos > 0.05;
    if (isOpen !== this.wasOpen) { this.wasOpen = isOpen; this.onChange && this.onChange(isOpen, this); }
  }
}

// ---------------------------------------------------------------------------
export class Switch extends Interactable {
  constructor(o) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(boxGeo(0.075, 0.115, 0.008), o.plateMat);
    const tog = new THREE.Mesh(boxGeo(0.014, 0.03, 0.016), o.toggleMat || o.plateMat);
    tog.position.z = 0.008;
    g.add(plate, tog);
    g.position.copy(o.pos);
    g.rotation.y = o.ry || 0;
    (o.parent || G.scene).add(g);
    super(g, { name: o.name || 'switch' });
    this.tog = tog; this.on = o.on ?? true; this.o = o; this.label = o.label || 'light';
    this.broken = false;
    this.visual();
  }
  actions() { return [{ key: 'E', label: (this.on ? 'Turn off ' : 'Turn on ') + this.label }]; }
  use() { this.set(!this.on); sfx('switch', { pos: this.worldPos(_v), vol: 0.5 }); }
  set(v, silent = false) {
    this.on = v; this.visual();
    if (this.o.onToggle) this.o.onToggle(this.broken ? false : v, this);
    if (!silent) emit('lightSwitch', this);
  }
  visual() { this.tog.rotation.x = this.on ? -0.45 : 0.45; }
}

// generic clickable (buttons, knobs, power switches)
export class Button extends Interactable {
  constructor(root, o) {
    super(root, { name: o.name || 'button', reach: o.reach });
    this.o = o;
  }
  actions() { const l = typeof this.o.label === 'function' ? this.o.label() : this.o.label; return l ? [{ key: 'E', label: l }] : []; }
  use(ctx) { this.o.onUse && this.o.onUse(this, ctx); }
  update(dt) { this.o.update && this.o.update(dt, this); }
}
