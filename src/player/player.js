// The player: movement, hands/inventory, hunger, interaction and the action
// animations (eating, drinking, ripping, pouring...) that move the held item.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { Controller } from './controller.js';
import { Inventory } from './inventory.js';
import { Hunger } from './hunger.js';
import { Interaction } from './interact.js';
import { clamp, damp, lerp, smooth, snoise1, easeInOut } from '../core/util.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const _v = new THREE.Vector3();

// procedural hold offsets per animation: returns {x,y,z, rx,ry,rz} at progress p (0..1)
function animPose(name, p, t, spec, out) {
  out.x = 0; out.y = 0; out.z = 0; out.rx = 0; out.ry = 0; out.rz = 0; out.lean = 0;
  const env = (a, b) => smooth(clamp((p - a) / (b - a)));
  switch (name) {
    case 'eat': case 'eatFrantic': {
      const fr = name === 'eatFrantic';
      const toMouth = env(0, 0.28) * (1 - env(0.78, 1));
      const chew = toMouth * Math.sin(t * (fr ? 26 : 14)) * (fr ? 0.012 : 0.006);
      out.x = -0.15 * toMouth; out.y = 0.1 * toMouth + chew; out.z = 0.26 * toMouth;
      out.rx = 0.5 * toMouth; out.ry = -0.4 * toMouth;
      out.lean = toMouth * (fr ? 0.12 : 0.06);
      if (fr) { out.x += (Math.random() - 0.5) * 0.01; out.y += (Math.random() - 0.5) * 0.01; }
      break;
    }
    case 'holdLow': {
      // the plate or box drops a little and tilts toward you while the other hand works
      const k = env(0, 0.2) * (1 - env(0.85, 1));
      out.y = -0.05 * k; out.z = 0.06 * k; out.rx = 0.35 * k; out.lean = 0.05 * k;
      break;
    }
    case 'drink': {
      const k = env(0, 0.3) * (1 - env(0.75, 1));
      out.x = -0.14 * k; out.y = 0.13 * k; out.z = 0.27 * k; out.rx = 1.15 * k; out.ry = 0.1 * k;
      out.lean = -0.18 * k;
      break;
    }
    case 'drinkTap': {
      const k = env(0, 0.25) * (1 - env(0.8, 1));
      out.lean = 0.5 * k; out.dip = 0.35 * k;
      break;
    }
    case 'fill': case 'pour': case 'crack': {
      const k = env(0, 0.25) * (1 - env(0.82, 1));
      if (spec.targetLocal) { out.x = spec.targetLocal.x * k; out.y = spec.targetLocal.y * k; out.z = spec.targetLocal.z * k; }
      if (name === 'pour') out.rz = 1.7 * env(0.2, 0.4) * (1 - env(0.8, 0.95));
      if (name === 'crack') { out.y += Math.max(0, Math.sin(p * 30)) * 0.015 * (p < 0.6 ? 1 : 0); out.rx = 0.6 * env(0.55, 0.7); }
      if (name === 'fill') out.rz = 0.3 * k;
      break;
    }
    case 'rip': {
      const k = env(0, 0.3) * (1 - env(0.85, 1));
      out.x = -0.12 * k; out.y = 0.04 * k; out.z = 0.12 * k;
      out.rz = Math.sin(t * 30) * 0.06 * env(0.3, 0.6) * (1 - env(0.6, 0.65));
      out.rx = 0.3 * env(0.58, 0.66) * (1 - env(0.85, 1));
      break;
    }
    case 'open': case 'takeFrom': case 'inspect': {
      const k = env(0, 0.3) * (1 - env(0.75, 1));
      out.x = -0.1 * k; out.y = 0.06 * k; out.z = 0.12 * k; out.rx = 0.25 * k;
      if (name === 'inspect') out.ry = Math.sin(p * Math.PI * 2) * 0.8;
      if (name === 'takeFrom') out.y -= Math.sin(env(0.3, 0.7) * Math.PI) * 0.05;
      break;
    }
    case 'eatFork': {
      // hand travels between the pan and the mouth three times
      const cyc = (p * 3) % 1;
      const toMouth = Math.sin(cyc * Math.PI);
      out.lean = 0.1 + 0.08 * toMouth; out.dip = 0.04;
      break;
    }
    default: break;
  }
  return out;
}

export class Player {
  constructor() {
    this.ctrl = new Controller();
    this.inv = new Inventory(this);
    this.hunger = new Hunger();
    this.interact = new Interaction(this);
    G.interact = this.interact;
    // camera-attached socket for held items
    this.viewSocket = new THREE.Group();
    G.camera.add(this.viewSocket);
    if (!G.camera.parent) G.scene.add(G.camera);
    this.holdPivot = new THREE.Group();
    this.viewSocket.add(this.holdPivot);
    this.holdBase = new THREE.Vector3(0.17, -0.17, -0.42);
    this.holdCur = this.holdBase.clone();
    this.action = null;
    this.pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, lean: 0, dip: 0 };
    this.reachEvt = null;
    this.trembleAmount = 0;
    this.cough = 0;
    this.busy = false;
    this.body = null; // filled by body.js
    this.lean = 0; this.dip = 0;
    this.sickness = 0; // 0..1 overall body deterioration (day based)
  }
  setHoldBase(pos) { this.holdBase.set(pos[0], pos[1], pos[2]); }

  reach(point, kind) { this.reachEvt = { point: point.clone ? point.clone() : new THREE.Vector3().copy(point), kind, t: 0 }; }

  runAction(spec) {
    if (!spec) return;
    if (spec.target) {
      // express target in camera space relative to the hold base
      const tl = G.camera.worldToLocal(spec.target.clone()).sub(this.holdBase);
      tl.clampLength(0, 0.45);
      spec.targetLocal = tl;
    }
    this.action = { spec, t: 0, fired: new Set(), lock: !!spec.lock };
    if (spec.sound) {
      const loopish = ['eat', 'eatFrantic', 'eatFork'].includes(spec.anim);
      if (loopish) {
        const n = spec.anim === 'eatFork' ? 3 : 1;
        for (let i = 0; i < n; i++) sfx(spec.sound, { vol: 0.75, delay: spec.dur * (0.3 + i * 0.28), rate: 0.9 + Math.random() * 0.2 });
      } else sfx(spec.sound, { vol: 0.7, delay: spec.anim === 'drink' ? spec.dur * 0.35 : 0.15 });
    }
    emit('action', spec);
  }

  update(dt) {
    const c = this.ctrl;
    // sickness drives tremble/sway; hunger adds to both
    const day = G.story.day;
    const sick = this.sickness;
    this.trembleAmount = clamp(this.hunger.tremble + (day >= 4 ? 0.25 + (day - 4) * 0.12 : 0) + this.cough * 0.5, 0, 1);
    c.sway = this.hunger.sway + (day >= 6 ? 0.25 : 0);
    c.tremble = this.trembleAmount * 0.35;
    // belly slows you down
    const belly = this.body ? this.body.belly : 0;
    c.speedMul = clamp(1 - belly * 0.18 - this.hunger.dizzy * 0.2, 0.55, 1);
    c.runAllowed = !(this.action && this.action.spec.anim !== 'none');
    c.update(dt);
    this.hunger.update(dt);
    this.interact.update(dt);

    // ---- action progress
    const a = this.action;
    if (a) {
      a.t += dt;
      const p = clamp(a.t / a.spec.dur);
      for (const [i, ev] of (a.spec.at || []).entries()) {
        if (!a.fired.has(i) && a.t >= ev[0]) { a.fired.add(i); try { ev[1](); } catch (e) { console.error(e); } }
      }
      animPose(a.spec.anim, p, G.time, a.spec, this.pose);
      if (a.spec.tick) a.spec.tick(p);
      if (p >= 1) {
        for (const [i, ev] of (a.spec.at || []).entries()) if (!a.fired.has(i)) { a.fired.add(i); try { ev[1](); } catch (e) { console.error(e); } }
        if (a.spec.done) a.spec.done();
        this.action = null;
      }
    } else {
      animPose('none', 0, 0, {}, this.pose);
    }
    // ---- held item pose (camera space)
    const P = this.pose;
    const t = G.time;
    const walk = c.bobAmt;
    const trem = this.trembleAmount;
    const tx = this.holdBase.x + P.x + Math.cos(c.stepPhase) * 0.008 * walk + snoise1(t * 9, 11) * 0.006 * trem;
    const ty = this.holdBase.y + P.y - Math.abs(Math.sin(c.stepPhase)) * 0.01 * walk + snoise1(t * 9.5, 12) * 0.006 * trem;
    const tz = this.holdBase.z + P.z;
    this.holdCur.set(damp(this.holdCur.x, tx, 14, dt), damp(this.holdCur.y, ty, 14, dt), damp(this.holdCur.z, tz, 14, dt));
    this.holdPivot.position.copy(this.holdCur);
    this.holdPivot.rotation.set(P.rx + snoise1(t * 7, 13) * 0.02 * trem, P.ry, P.rz + snoise1(t * 6, 14) * 0.03 * trem);
    // leaning toward food / dipping to the tap
    this.lean = damp(this.lean, P.lean || 0, 8, dt);
    this.dip = damp(this.dip, P.dip || 0, 6, dt);
    if (this.reachEvt) { this.reachEvt.t += dt; if (this.reachEvt.t > 0.6) this.reachEvt = null; }
    if (this.body) this.body.update(dt);
  }

  lateUpdate(dt) {
    const c = this.ctrl;
    c.updateCamera(G.camera, dt);
    // apply lean (pitch toward the item) and dip
    if (this.lean || this.dip) {
      G.camera.rotateX(-this.lean * 0.5);
      G.camera.position.y -= this.dip;
      if (this.dip > 0.01) G.camera.rotateX(-this.dip * 0.8);
    }
    G.camera.updateMatrixWorld(true);
    if (this.body) this.body.lateUpdate(dt);
  }

  serialize() { return { hunger: this.hunger.serialize(), inv: this.inv.serialize() }; }
}
