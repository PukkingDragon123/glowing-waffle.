// The thing that hunts by light. At night a searchlight from the ship sweeps
// the building's windows; a lamp left on, a glowing monitor, a figure standing
// in the glass - and it comes to the window. In the hallway, on the worst
// nights, something tall walks toward any light and any sound.
import * as THREE from 'three';
import { G, emit, on } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);

export class Alien {
  constructor() {
    this.state = 'idle'; this.t = 0; this.nextSweep = 60; this.sweeps = 0;
    this.exposure = 0; this.suspicion = 0;
    // the searchlight, far outside and above
    const sl = this.beam = new THREE.SpotLight(0xdce8ff, 0, 90, 0.06, 0.5, 0.2);
    sl.position.set(5, 40, -60);
    sl.castShadow = true; sl.shadow.mapSize.set(512, 512); sl.shadow.bias = -0.0005; sl.shadow.camera.near = 30; sl.shadow.camera.far = 100;
    sl.shadow.autoUpdate = false;
    G.scene.add(sl); G.scene.add(sl.target);
    this.beamX = 0;
    // the face at the window
    this.face = makeFace(); this.face.visible = false; G.scene.add(this.face);
    // the tall one in the hallway
    this.stalker = makeStalker(); this.stalker.visible = false; G.scene.add(this.stalker);
    this.st = { on: false, pos: V(18, 0, 8.77), alert: 0, t: 0 };
    on('noise', (e) => this.hearNoise(e));
    G.alien = this;
  }
  get near() { return this.state === 'sweep' || this.state === 'attack' || (this.st.on && this.stDist() < 6); }
  reset() {
    this.state = 'idle'; this.t = 0; this.exposure = 0; this.suspicion = 0; this.nextSweep = 70;
    this.beam.intensity = 0; this.face.visible = false; this.stalker.visible = false; this.st.on = false;
    if (this.hum) { this.hum.stop(0.5); this.hum = null; }
    if (this.nearLoop) { this.nearLoop.stop(0.3); this.nearLoop = null; }
    G.fx.clear('alien');
  }
  attract(a) { this.suspicion = Math.min(1, this.suspicion + a); if (this.state === 'idle') this.nextSweep = Math.min(this.nextSweep, 8); }
  hearNoise(e) {
    if (!e.pos || e.kind === 'roar') return;
    if (this.state === 'sweep') this.exposure += (e.loud || 0.3) * 0.5;
    if (this.st.on) { const d = e.pos.distanceTo(this.st.pos); if (d < 12) { this.st.goal = e.pos.clone(); this.st.alert = Math.min(1, this.st.alert + (e.loud || 0.3) * 0.6); } }
  }
  active() { const d = G.director; return d && d.running && !d.cutscene && G.story.day >= 3 && d.nightness > 0.55; }

  // how visible the apartment is from outside right now
  visibility() {
    let v = 0;
    const ap = G.apartment;
    for (const [k, l] of Object.entries(ap.lights)) {
      if (!l.k || l.k < 0.05) continue;
      const room = l.room;
      if (room === 'main' || room === 'bed') v += l.k * (k === 'main' ? 1 : k === 'kitchen' ? 0.6 : 0.5);
    }
    if (G.desk && G.desk.screenLit) v += 0.45;
    if (ap.lights && G.fridgeOpen) v += 0.2;
    // standing in front of the glass, lit by the beam
    const p = G.player.ctrl.body.position;
    const z = G.world.zoneAt(p);
    if (z && (z.name === 'main' || z.name === 'balcony') && p.z < 2.6 && Math.abs(p.x - this.beamX) < 1.4 && !G.player.ctrl.crouched) v += 0.9;
    return v;
  }

  update(dt) {
    const day = G.story.day;
    this.t += dt;
    this.updateStalker(dt);
    if (this.state === 'idle') {
      if (!this.active()) return;
      this.nextSweep -= dt;
      if (this.nextSweep <= 0) this.beginWarn();
      return;
    }
    if (this.state === 'warn') {
      const k = this.t / 6;
      if (this.hum) this.hum.set({ vol: 0.15 + k * 0.6 });
      G.fx.set('alien', { red: k * 0.15, noiseBurst: k * 0.2 });
      if (this.t > 6) { this.state = 'sweep'; this.t = 0; this.exposure = 0; this.beam.shadow.autoUpdate = true; sfx('alienNear', { vol: 0.5 }); }
      return;
    }
    if (this.state === 'sweep') {
      const dur = 10;
      const k = clamp(this.t / dur, 0, 1);
      this.beamX = lerp(-1, 11, k);
      this.beam.intensity = 900 * Math.sin(Math.PI * k) ** 0.5;
      this.beam.target.position.set(this.beamX, 1.2, 2.5);
      this.beam.target.updateMatrixWorld();
      const vis = this.visibility();
      if (vis > 0.35) this.exposure += dt * vis * (0.55 + day * 0.06);
      else this.exposure = Math.max(0, this.exposure - dt * 0.15);
      G.fx.set('alien', { red: 0.12 + this.exposure * 0.3, noiseBurst: 0.15 + this.exposure * 0.6, glitch: this.exposure * 0.3 });
      if (this.exposure > 1.3) { this.attack(); return; }
      if (this.t > dur) this.endSweep();
      return;
    }
    if (this.state === 'attack') this.updateAttack(dt);
  }
  beginWarn() {
    this.state = 'warn'; this.t = 0; this.sweeps++;
    this.hum = G.audio && G.audio.loop('shipHum', { vol: 0.15 });
    for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.25, rate: 0.7 });
    if (G.cat.present) { G.cat.fear = Math.min(1, G.cat.fear + 0.35); G.cat.setBehavior('hide', { hide: G.cat.bestHide() }); }
    if (this.sweeps === 1) G.hud.inner('That hum. The lights. Turn off the lights, now.');
    else if (Math.random() < 0.5) G.hud.inner('It is coming back. Lights off.');
    emit('alienSweep');
  }
  endSweep() {
    this.state = 'idle'; this.t = 0; this.beam.intensity = 0; this.beam.shadow.autoUpdate = false;
    if (this.hum) { this.hum.stop(2); this.hum = null; }
    G.fx.clear('alien');
    this.nextSweep = Math.max(35, 95 - G.story.day * 8) + Math.random() * 25;
    if (this.sweeps === 1) setTimeout(() => G.hud.inner("It's gone. For now."), 1500);
  }
  attack() {
    this.state = 'attack'; this.t = 0;
    // which window: the one nearest the player
    const p = G.player.ctrl.body.position;
    let best = null, bd = 1e9;
    for (const w of Object.values(G.apartment.windows)) { const wp = w.frame.group.position; const d = Math.hypot(wp.x - p.x, wp.z - p.z); if (d < bd) { bd = d; best = wp; } }
    this.atWin = best.clone();
    this.face.visible = true;
    this.face.position.set(best.x, 3.6, best.z - 0.9);
    sfx('roar', { pos: V(best.x, 1.5, -1), vol: 1, occlude: false });
    G.director.cutscene = true; G.director.drawTasks();
    G.player.ctrl.enabled = false;
  }
  updateAttack(dt) {
    const w = this.atWin;
    const k = smoothstep(0, 1.4, this.t);
    this.face.position.y = lerp(3.6, 1.55, k);
    this.face.position.z = lerp(w.z - 0.9, w.z - 0.35, smoothstep(1.4, 2.2, this.t));
    this.face.lookAt(G.camera.position);
    this.face.children.forEach((c) => { if (c.userData.jaw) c.rotation.x = 0.2 + Math.sin(this.t * 30) * 0.15 * k; });
    G.player.ctrl.lookAtPoint(this.face.position, 1 - Math.exp(-dt * 6));
    G.fx.set('alien', { red: 0.4 + k * 0.4, glitch: k, noiseBurst: k });
    if (this.t > 1.7 && !this.shattered) { this.shattered = true; sfx('imp_glass', { pos: w, vol: 1 }); sfx('imp_glass', { pos: w, vol: 0.8, delay: 0.1 }); G.fx.pulse('shake', 1, 1); }
    if (this.t > 2.4) { this.shattered = false; G.director.die('alien'); this.reset(); }
  }

  // ------------------------------------------------------------- hallway
  stDist() { const p = G.player.ctrl.body.position; return Math.hypot(p.x - this.st.pos.x, p.z - this.st.pos.z); }
  updateStalker(dt) {
    const d = G.director, day = G.story.day;
    const p = G.player.ctrl.body.position;
    const z = G.world.zoneAt(p);
    const inHall = z && z.name === 'hall';
    const want = d && d.running && !d.cutscene && day >= 5 && inHall && (d.nightness > 0.5 || (day === 5 && d.flags.catOut && G.building.loops >= 1));
    const st = this.st;
    if (want && !st.on) {
      st.on = true; st.alert = 0; st.t = 0;
      // appear at the far end of the hallway, away from the player
      st.pos.set(p.x > 6 ? -7.5 : 19.5, 0, 7.95);
      this.stalker.visible = true;
      this.nearLoop = G.audio && G.audio.loop('alienNear', { pos: st.pos, vol: 0.4 });
    }
    if (!want && st.on) {
      st.on = false; this.stalker.visible = false;
      if (this.nearLoop) { this.nearLoop.stop(1); this.nearLoop = null; }
      G.fx.clear('stalker');
      return;
    }
    if (!st.on) return;
    st.t += dt;
    // it is drawn by light on you and by sound; still, dark, crouched - it loses you
    const lit = G.world.lightAt(new THREE.Vector3(p.x, 1.2, p.z));
    const moving = G.player.ctrl.speed > 0.3;
    const dist = this.stDist();
    const sense = (lit > 0.25 ? 0.6 : 0.1) + (moving ? (G.player.ctrl.crouched ? 0.1 : 0.4) : 0) + (dist < 4 ? 0.3 : 0);
    st.alert = clamp(st.alert + (sense - 0.35) * dt * 0.6, 0, 1);
    const target = st.alert > 0.3 ? V(p.x, 0, p.z) : (st.goal || V(st.pos.x + Math.sin(st.t * 0.2) * 3, 0, 7.95));
    const dir = target.clone().sub(st.pos); dir.y = 0;
    const L = dir.length();
    const speed = st.alert > 0.6 ? 1.6 : 0.55;
    if (L > 0.1) st.pos.addScaledVector(dir.normalize(), Math.min(L, speed * dt));
    st.pos.z = clamp(st.pos.z, 7.35, 8.55);
    this.stalker.position.copy(st.pos);
    this.stalker.rotation.y = Math.atan2(p.x - st.pos.x, p.z - st.pos.z);
    // its walk: long, slow, wrong
    const g = this.stalker.userData;
    g.head.rotation.z = Math.sin(st.t * 0.7) * 0.25; g.head.rotation.x = 0.3 + Math.sin(st.t * 1.3) * 0.08;
    g.armL.rotation.x = Math.sin(st.t * 1.2) * 0.3; g.armR.rotation.x = -Math.sin(st.t * 1.2) * 0.3;
    if (this.nearLoop) this.nearLoop.set({ pos: st.pos.clone().add(V(0, 2, 0)), vol: 0.25 + st.alert * 0.5 });
    // lights die as it passes under them
    for (const f of G.building.hallLights) { const dx = Math.abs(f.pos.x - st.pos.x); f.dim = dx < 2.5 ? 0.05 : dx < 5 ? 0.5 : 1; }
    G.fx.set('stalker', { noiseBurst: smoothstep(8, 1.5, dist) * 0.6, glitch: smoothstep(4, 1, dist) * 0.5, red: st.alert * 0.15 });
    if (dist < 1.1 && !G.director.cutscene) { G.director.die('stalker'); }
  }
}

function makeFace() {
  // a vast pale head pressed against the glass: no nose, too many teeth
  const g = new THREE.Group();
  const skin = M.biomech || new THREE.MeshStandardMaterial({ color: 0x9a8a80, roughness: 0.6 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 16), skin); head.scale.set(1, 1.35, 0.7); g.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeM); e.position.set(s * 0.32, 0.25, 0.6); g.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x050000 })); p.position.set(s * 0.32, 0.25, 0.68); g.add(p); }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.35, 0.35); jaw.userData.jaw = true; g.add(jaw);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x120202 })); mouth.rotation.x = Math.PI / 2; mouth.scale.set(1, 1, 0.6); jaw.add(mouth);
  const toothM = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 });
  for (let i = 0; i < 18; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), toothM); const a = (i / 17 - 0.5) * 2.6; t.position.set(Math.sin(a) * 0.36, 0.02, Math.cos(a) * 0.2 + 0.1); t.rotation.x = Math.PI; jaw.add(t); }
  return g;
}

function makeStalker() {
  const g = new THREE.Group();
  const m = M.biomech || new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 0.6 });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.13, 0.9, 4, 10), m, 0, 1.55, 0);
  add(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), dark, 0, 0.95, 0);
  for (const s of [-1, 1]) { const leg = add(new THREE.CapsuleGeometry(0.05, 1.0, 3, 6), dark, s * 0.09, 0.55, 0); leg.rotation.z = s * 0.04; }
  const head = new THREE.Group(); head.position.set(0, 2.25, 0.05); g.add(head);
  const skull = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), m); skull.rotation.x = -1.1; skull.position.set(0, 0.05, -0.15); skull.castShadow = true; head.add(skull);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3010 })); glow.position.set(0, 0.0, 0.1); head.add(glow);
  const arm = (s) => { const a = new THREE.Group(); a.position.set(s * 0.2, 2.0, 0); g.add(a); const u = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 1.15, 3, 6), dark); u.position.y = -0.65; u.castShadow = true; a.add(u); const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), m); f.position.y = -1.35; f.rotation.x = Math.PI; a.add(f); return a; };
  g.userData = { head, armL: arm(-1), armR: arm(1) };
  return g;
}
