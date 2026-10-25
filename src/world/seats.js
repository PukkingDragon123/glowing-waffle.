// Sitting on things, and furniture you can push around.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { Interactable } from './interactables.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const _f = new THREE.Vector3(), _t = new THREE.Vector3();
const STAND_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown'];

// spots(): [{ pos (seat surface, world), yaw (world yaw of the seat's front), eye }]
export class Seat extends Interactable {
  static current = null;
  constructor(root, o) {
    super(root, { name: o.name || 'seat', reach: o.reach ?? 2.2 });
    this.o = o;
    if (!Seat.hooked) { Seat.hooked = true; G.world.updaters.push((dt) => Seat.tick(dt)); }
  }
  actions() { return Seat.current === this ? [{ key: 'W', label: 'Stand up' }] : Seat.current ? [] : [{ key: 'E', label: this.o.label || 'Sit down' }]; }
  use() { if (!Seat.current) this.sit(); }
  sit() {
    const pl = G.player;
    if (G.desk && G.desk.seated) return;
    if (pl.inv.hand && !pl.inv.hand.small) { G.hud.inner('I should put this down first.'); return; }
    if (pl.inv.hand) pl.inv.store();
    const pp = pl.ctrl.position;
    let best = null, bd = 1e9;
    for (const s of this.o.spots()) { const d = Math.hypot(s.pos.x - pp.x, s.pos.z - pp.z); if (d < bd) { bd = d; best = s; } }
    if (!best) return;
    Seat.current = this; this.spot = best;
    const yaw = best.yaw + Math.PI; // camera yaw looking out of the seat
    _f.set(Math.sin(best.yaw), 0, Math.cos(best.yaw));
    const eye = best.pos.clone().add(V(0, best.eye ?? 0.7, 0)).addScaledVector(_f, -0.06);
    pl.ctrl.enabled = false;
    pl.ctrl.yaw = yaw; pl.ctrl.pitch = -0.06;
    pl.ctrl.lookLimit = { yaw, pitch: -0.1, range: 1.75, prange: 0.95 };
    pl.ctrl.override = { pos: eye, quat: new THREE.Quaternion(), speed: 4, followLook: true };
    G.body.mode = 'sit'; G.body.yaw = yaw; G.body.root.rotation.set(0, yaw, 0);
    sfx(this.o.sound || 'grab', { pos: best.pos, vol: 0.5, rate: 0.6 });
    this.o.onSit && this.o.onSit(this);
  }
  stand() {
    const pl = G.player;
    Seat.current = null;
    pl.ctrl.enabled = true; pl.ctrl.lookLimit = null; pl.ctrl.override = null;
    G.body.mode = 'stand';
    this.o.onStand && this.o.onStand(this);
  }
  static tick() {
    const s = Seat.current;
    if (!s) return;
    if (G.state !== 'play') return;
    if (STAND_KEYS.some((k) => G.input.pressed(k))) s.stand();
  }
  static release() { if (Seat.current) Seat.current.stand(); }
}

// A heavy prop on its own physics body: walk into it, or hold LMB to push and
// steer it while you walk.
export class Pushable extends Interactable {
  static all = [];
  constructor(group, o) {
    const [w, h, d] = o.size;
    const holder = new THREE.Group();
    holder.position.copy(group.position).add(V(0, h / 2, 0));
    holder.quaternion.copy(group.quaternion);
    group.parent.add(holder);
    holder.add(group);
    group.position.set(0, -h / 2, 0); group.quaternion.identity();
    super(holder, { name: o.name || 'chair', reach: 2.0 });
    this.o = o; this.holder = holder;
    this.body = G.physics.addProp(holder, { type: 'box', size: [w, h, d] }, { mass: o.mass ?? 5, sound: o.sound || 'wood', sleeping: true, damping: 0.35 });
    this.body.angularDamping = 0.6;
    this.home = { p: holder.position.clone(), q: holder.quaternion.clone() };
    this.allowLookWhileDragging = true;
    Pushable.all.push(this);
  }
  actions() { return [...(this.seat ? this.seat.actions() : []), { key: 'LMB', label: this.o.label || 'Push' }]; }
  use() { if (this.seat) this.seat.use(); }
  canGrab() { return !Seat.current; }
  dragPrompt() { return [{ key: 'LMB', label: 'Push / pull' }]; }
  grabStart(hit) {
    const cam = G.camera.position;
    const hp = hit ? hit.point : this.holder.position;
    this.grab = { dist: THREE.MathUtils.clamp(Math.hypot(hp.x - cam.x, hp.z - cam.z), 0.7, 1.5), off: V(hp.x - this.holder.position.x, 0, hp.z - this.holder.position.z) };
    this.body.wakeUp();
    sfx('grab', { pos: hp, vol: 0.3, rate: 0.7 });
  }
  grabMove() {
    if (!this.grab) return;
    const b = this.body;
    _f.set(0, 0, -1).applyQuaternion(G.camera.quaternion); _f.y = 0; _f.normalize();
    _t.copy(G.camera.position).addScaledVector(_f, this.grab.dist).sub(this.grab.off);
    let vx = (_t.x - b.position.x) * 6, vz = (_t.z - b.position.z) * 6;
    const sp = Math.hypot(vx, vz);
    if (sp > 1.8) { vx *= 1.8 / sp; vz *= 1.8 / sp; }
    b.velocity.x = vx; b.velocity.z = vz;
    b.wakeUp();
    // scraping
    if (sp > 0.4 && (!this.scrapeT || G.time - this.scrapeT > 0.35)) { this.scrapeT = G.time; sfx('drawer', { pos: this.holder.position, vol: 0.25, rate: 0.55 + Math.random() * 0.2 }); }
  }
  grabEnd() { this.grab = null; }
  static resetAll() {
    for (const p of Pushable.all) {
      const b = p.body;
      b.position.set(p.home.p.x, p.home.p.y, p.home.p.z);
      b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position);
      b.quaternion.set(p.home.q.x, p.home.q.y, p.home.q.z, p.home.q.w);
      b.velocity.setZero(); b.angularVelocity.setZero(); b.sleep();
      p.holder.position.copy(p.home.p); p.holder.quaternion.copy(p.home.q);
    }
  }
}
