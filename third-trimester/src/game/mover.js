// Actor = a spawned character + simple ground movement (walk paths, turning) for gameplay and cinematics.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { spawn } from '../chars/index.js';
import { damp, clamp } from '../core/util.js';

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Actor {
  constructor(kind, look) {
    this.c = spawn(kind, look);
    this.kind = kind; this.root = this.c.root; this.anim = this.c.anim;
    this.path = []; this.speed = 1.2; this.yaw = 0; this.targetYaw = null; this.turnRate = 8;
    this._resolve = null; this.paused = false; this.follow = null;
    this.isCat = kind === 'tofu' || kind === 'tofusuit';
  }
  get pos() { return this.root.position; }
  place(p, yaw = this.yaw) { this.root.position.set(p[0], p[1] ?? 0, p[2] ?? p[1]); if (p.length === 2) this.root.position.set(p[0], 0, p[1]); this.setYaw(yaw); return this; }
  setYaw(y) { this.yaw = y; this.targetYaw = null; this.root.rotation.y = y; }
  // Face a yaw angle or a point ([x,z] or Vector3). Resolves when turned.
  face(t, sec = 0.4) {
    let y = t;
    if (Array.isArray(t)) y = Math.atan2(t[0] - this.pos.x, t[t.length - 1] - this.pos.z);
    else if (t?.isVector3) y = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
    this.targetYaw = y; this.turnRate = 3 / Math.max(0.05, sec);
    return new Promise((r) => { this._turnResolve = r; if (sec <= 0) { this.setYaw(y); r(); } });
  }
  // Walk along waypoints [[x,z], ...] (or a single point). Resolves on arrival.
  walkTo(points, { speed = this.isCat ? 0.9 : 1.15, run = false } = {}) {
    if (!Array.isArray(points[0])) points = [points];
    this.path = points.map((p) => new THREE.Vector3(p[0], this.pos.y, p[p.length - 1]));
    this.speed = run ? speed * 2.4 : speed;
    this._resolve?.();
    return new Promise((r) => { this._resolve = r; });
  }
  stop() { this.path = []; this.anim.walking?.(0); this.anim.move?.(0); this._resolve?.(); this._resolve = null; }
  say(text, voice, opts) { this.anim.talk?.(Math.max(1, text.length / 14)); return game.ui.say(opts?.speaker ?? '', text, { voice, ...opts }); }
  update(dt) {
    if (this.path.length) {
      const tgt = this.path[0]; const d = tgt.clone().sub(this.pos); d.y = 0; const L = d.length();
      if (L < 0.05) { this.path.shift(); if (!this.path.length) { this.anim.walking?.(0); this.anim.move?.(0); this._resolve?.(); this._resolve = null; } }
      else {
        const want = Math.atan2(d.x, d.z);
        this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 10);
        const step = Math.min(L, this.speed * dt * clamp(1 - Math.abs(angDiff(this.yaw, want)) / 2.5, 0.25, 1));
        this.pos.addScaledVector(d.normalize(), step);
        this.root.rotation.y = this.yaw;
        if (this.isCat) this.anim.move(this.speed, this.speed > 2 ? 'gallop' : 'walk'); else this.anim.walking(this.speed);
      }
    } else if (this.targetYaw != null) {
      const dd = angDiff(this.yaw, this.targetYaw);
      this.yaw += dd * Math.min(1, dt * this.turnRate);
      this.root.rotation.y = this.yaw;
      if (Math.abs(dd) < 0.02) { this.setYaw(this.targetYaw); this._turnResolve?.(); this._turnResolve = null; }
    }
    if (this.follow) { const p = this.follow(); if (p) this.pos.copy(p); }
    this.c.update(dt);
  }
}
