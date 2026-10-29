// Hands + a six-slot hotbar. The held item is parented to a socket in front of
// the camera; the body's arms reach for it.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

export class Inventory {
  constructor(player) {
    this.p = player;
    this.hand = null;
    this.slots = new Array(6).fill(null);
  }
  get full() { return this.hand && this.slots.every(Boolean); }
  freeSlot() { return this.slots.indexOf(null); }

  holdMesh(item) {
    const h = item.def.hold || { pos: [0.17, -0.17, -0.42], rot: [0, 0, 0] };
    this.p.holdPivot.add(item.mesh);
    item.mesh.position.set(0, 0, 0);
    item.mesh.rotation.set(h.rot[0], h.rot[1], h.rot[2]);
    item.mesh.scale.copy(item.baseScale || new THREE.Vector3(1, 1, 1));
    item.mesh.visible = true;
    this.p.setHoldBase(h.pos);
    item.mesh.traverse((c) => { if (c.isMesh) { c.layers.set(0); c.castShadow = false; } });
  }

  take(item) {
    if (!item || item.dead) return false;
    if (this.hand) {
      if (this.hand.def.twoHands) { G.hud.inner("I can't carry anything else with this."); return false; }
      const fs = this.freeSlot();
      if (fs < 0) { G.hud.inner('My hands are full.'); return false; }
      if (!this.hand.small) { G.hud.inner("I need to put this down first."); return false; }
      this.storeTo(fs);
    }
    if (item.def.twoHands && (this.slots[0] && this.slots[1]) && false) return false;
    item.detach();
    this.hand = item;
    this.holdMesh(item);
    sfx('pickup', { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
    this.changed();
    emit('took', item);
    return true;
  }
  forceHand(item) {
    if (this.hand) {
      const fs = this.freeSlot();
      if (fs >= 0 && this.hand.small) this.storeTo(fs); else this.drop();
    }
    item.detach();
    this.hand = item; this.holdMesh(item); this.changed();
    emit('took', item);
  }
  storeTo(i) {
    const it = this.hand; if (!it) return;
    this.slots[i] = it; this.hand = null;
    it.mesh.visible = false;
    this.p.holdPivot.remove(it.mesh);
    G.world.root.add(it.mesh);
    it.mesh.visible = false;
    sfx('pocket', { vol: 0.4 });
    this.changed();
  }
  store() {
    if (!this.hand) return;
    if (!this.hand.small) { G.hud.inner("That won't fit in my pockets."); return; }
    const fs = this.freeSlot();
    if (fs < 0) { G.hud.inner('My pockets are full.'); return; }
    this.storeTo(fs);
  }
  retrieve(i) {
    const it = this.slots[i];
    if (!it) { this.changed(); return; }
    const h = this.hand;
    if (h && !h.small) { G.hud.inner("I need to put this down first."); return; }
    this.slots[i] = null;
    if (h) { this.slots[i] = h; this.p.holdPivot.remove(h.mesh); G.world.root.add(h.mesh); h.mesh.visible = false; }
    this.hand = it;
    this.holdMesh(it);
    sfx('pocket', { vol: 0.4 });
    this.changed();
  }
  // drop the held item in front of the player (optionally thrown)
  drop(speed = 0) {
    const it = this.hand; if (!it) return null;
    const cam = G.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const wp = it.mesh.getWorldPosition(new THREE.Vector3());
    const wq = it.mesh.getWorldQuaternion(new THREE.Quaternion());
    // keep the drop point out of walls
    const start = cam.position.clone();
    const hit = G.physics.raycast(start, wp.clone().addScaledVector(fwd, 0.15));
    if (hit) wp.copy(start).lerp(wp, 0.3);
    this.hand = null;
    const vel = fwd.multiplyScalar(speed);
    vel.y += speed * 0.15;
    const ang = speed > 0 ? new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6) : null;
    G.world.root.add(it.mesh);
    it.attach(wp, wq, vel, ang);
    it.mesh.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    this.changed();
    if (speed > 3) emit('noise', { pos: wp, loud: 0.3, kind: 'throw' });
    emit('dropped', it);
    return it;
  }
  placeHandAt(pos, quat) {
    const it = this.hand; if (!it) return;
    this.hand = null;
    G.world.root.add(it.mesh);
    it.attach(pos, quat);
    it.mesh.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    sfx('place', { pos, vol: 0.4, rate: 0.9 + Math.random() * 0.2 });
    this.changed();
    emit('placed', it);
  }
  // set the held item down gently where you're looking (a table, the floor), or just in front
  putDown() {
    const it = this.hand; if (!it) return;
    const cam = G.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = G.physics.raycast(cam.position, cam.position.clone().addScaledVector(fwd, 1.9));
    if (!hit) { this.drop(0.4); return; }
    const p = new THREE.Vector3(hit.hitPointWorld.x, hit.hitPointWorld.y, hit.hitPointWorld.z);
    const n = hit.hitNormalWorld;
    if (n.y < 0.6) { p.addScaledVector(fwd, -0.12); this.drop(0); return; }       // a wall: just let it go
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    this.placeHandAt(p.add(new THREE.Vector3(0, 0.04, 0)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }
  // remove the held item entirely (eaten / thrown away)
  consumeHand(destroy = true) {
    const it = this.hand; if (!it) return;
    this.hand = null;
    if (destroy) it.destroy();
    this.changed();
  }
  // container in hand hands you something new (egg from carton, packet from box)
  swapInFromHand(container, newItem) {
    const fs = this.freeSlot();
    if (fs >= 0 && container.small) {
      this.storeTo(fs);
    } else {
      // put the container down where it would be dropped
      this.drop(0);
    }
    newItem.detach();
    this.hand = newItem;
    this.holdMesh(newItem);
    this.changed();
  }
  removeItem(it) {
    if (this.hand === it) { this.hand = null; }
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] === it) this.slots[i] = null;
    this.changed();
  }
  has(type) { return (this.hand && this.hand.type === type) || this.slots.some((s) => s && s.type === type); }
  changed() { G.hud.showInventory(this.slots, this.hand); emit('inventory'); }
  serialize() { return { hand: this.hand?.type || null, slots: this.slots.map((s) => s?.type || null) }; }
}
