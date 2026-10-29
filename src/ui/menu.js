// Main menu. You stand back in the dark living room of 4B: the wall, the
// window, the curtains, Mochi on the sill, and through the glass Lower
// Manhattan at true scale. The ship comes down over the harbour and into the
// North Tower. The options are written in the grime on the glass; you walk up
// and touch one.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { clamp, damp, lerp, smoothstep, RNG } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';
import { hasSave, readSave } from '../core/save.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const GLASS_Z = -0.07, CX = 7.7, CY = 1.52, GW = 1.08, GH = 1.22;
const FAR = V(7.62, 1.16, 2.95);         // standing back in the room, low enough to see the towers whole
const LOOK = V(7.7, 1.62, -1.0);

export class Menu {
  constructor() {
    this.cv = makeCanvas(512, 576);
    this.tex = new THREE.CanvasTexture(this.cv.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), mat);
    this.plane.position.set(CX, CY, GLASS_Z); this.plane.renderOrder = 8;
    G.world.root.add(this.plane);
    this.plane.visible = false;
    this.items = [
      { id: 'new', label: 'new game', y: 0.2 },
      { id: 'load', label: 'load game', y: 0.34 },
      { id: 'settings', label: 'settings', y: 0.72 },
    ];
    this.hover = -1; this.alpha = 0;
    this.ray = new THREE.Raycaster();
    this.cam = { pos: FAR.clone(), look: LOOK.clone() };
    this.fontReady = false;
    // the light that comes in through the glass when the room lamps are off
    this.spill = new THREE.SpotLight(0xc8d0e0, 0, 10, 0.78, 0.75, 1.2);
    this.spill.position.set(7.7, 2.15, -0.9); this.spill.target.position.set(7.4, 0.2, 3.4);
    this.spill.castShadow = true; this.spill.shadow.mapSize.set(1024, 1024); this.spill.shadow.bias = -0.0006; this.spill.shadow.autoUpdate = false;
    this.fireGlow = new THREE.PointLight(0xff8a40, 0, 13, 1.3); this.fireGlow.position.set(7.4, 1.0, -2.6);
    G.scene.add(this.spill, this.spill.target, this.fireGlow);
    if (document.fonts && document.fonts.load) document.fonts.load('64px Alagard').then(() => { this.fontReady = true; this.draw(); }).catch(() => {});
    // the backdrop is Mochi running from the hands (menuChase.js); ?window brings back the glass
    this.useChase = !!G.chase && !new URLSearchParams(location.search).has('window');
    this.ui = this.buildUI();
    G.menu = this;
  }

  async open({ intro = true } = {}) {
    if (this.useChase) return this.openChase({ intro });
    G.state = 'menu';
    if (G.director) G.director.running = false;
    G.hud.objective([]); G.hud.crosshair(false);
    document.getElementById('pause').hidden = true;
    G.alien && G.alien.reset();
    G.engine.background = G.sky;
    const c = G.player.ctrl;
    c.teleport(FAR.x, 0.05, FAR.z, 0, 0);
    c.override = null; c.enabled = false; c.lookEnabled = false;
    G.body.visible = true; G.body.showInMenu = true; G.body.mode = 'stand';
    // the apartment at night, lights off, the city doing the lighting
    for (const l of Object.values(G.apartment.lights)) l.set(false);
    G.apartment.windows.menu.target = 0;
    G.sky.apply(G.sky.preset(7, 0.9, true), true);
    G.sky.resetTowers();
    G.sky.cinematic = true;
    G.sky.ship.visible = true;
    this.intro = intro; this.t = intro ? 0 : 40; this.phase = intro ? 'approach' : 'after';
    this.alpha = intro ? 0 : 1; this.busy = false; this.dolly = null;
    this.look = { x: 0, y: 0 };
    this.cam.pos.copy(FAR); this.cam.look.copy(LOOK);
    this.rng = new RNG(7);
    this.setupShip();
    if (!intro) this.skipToAfter();
    this.setupCat();
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    G.fx.fadeTo(0, 0.35);
    this.amb = G.audio && G.audio.loop('wind', { vol: 0.25 });
    this.siren = G.audio && G.audio.loop('siren', { vol: 0.06 });
    this.plane.visible = true;
    this.spill.shadow.autoUpdate = true;
    this.draw();
  }
  close() {
    this.closeChase();
    this.plane.visible = false;
    this.spill.intensity = 0; this.fireGlow.intensity = 0; this.spill.shadow.autoUpdate = false; G.sky.windowBoost = 1; G.sky.hemiBoost = 1;
    G.body.showInMenu = false;
    G.body.override.R = G.body.override.L = null;
    G.engine.renderer.domElement.style.cursor = '';
    G.sky.cinematic = false;
    G.cat.scripted = null; G.cat.stareAt = null;
    if (this.amb) { this.amb.stop(1); this.amb = null; }
    if (this.siren) { this.siren.stop(1); this.siren = null; }
    if (this.hum) { this.hum.stop(1); this.hum = null; }
  }

  // ------------------------------------------------------------- the chase
  // the options are plain HTML words over the scene: clicks, taps, Tab/arrows and Enter
  buildUI() {
    const ui = document.createElement('div'); ui.id = 'menu-ui';
    for (const [id, label] of [['new', 'new game'], ['load', 'load game'], ['settings', 'settings']]) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.textContent = label; ui.appendChild(b);
    }
    ui.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.pick(b.dataset.id); });
    ui.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b && e.pointerType === 'mouse' && !b.classList.contains('off')) sfx('click', { vol: 0.06, rate: 2 }); });
    document.body.appendChild(ui);
    return ui;
  }
  openChase({ intro }) {
    G.state = 'menu';
    if (G.director) G.director.running = false;
    G.hud.objective([]); G.hud.crosshair(false); G.hud.setPrompt(null);
    document.getElementById('pause').hidden = true;
    G.alien && G.alien.reset();
    const c = G.player.ctrl;
    c.override = null; c.enabled = false; c.lookEnabled = false;
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    // the chase takes the screen; the world and the sky wait behind it
    const ch = this.chase = G.chase;
    ch.start(intro);
    G.view = ch; G.engine.background = null;
    G.engine.renderer.domElement.style.cursor = 'default';
    this.busy = false; this.uiT = intro ? 2.4 : 0.4;
    for (const b of this.ui.children) b.classList.toggle('off', b.dataset.id === 'load' && !hasSave());
    G.fx.fadeTo(0, 0.6);
    this.amb = G.audio && G.audio.loop('wind', { vol: 0.2 });
  }
  updateChase(dt) {
    this.chase.update(dt);
    if (this.uiT > 0 && (this.uiT -= dt) <= 0) this.ui.classList.add('on');
    // up and down through the words with the keys too
    const inp = G.input, bs = [...this.ui.children];
    if (this.ui.classList.contains('on') && !this.busy && !G.pause.open) {
      const i = bs.indexOf(document.activeElement);
      if (inp.anyPressed('ArrowDown', 'KeyS')) bs[(i + 1) % bs.length].focus();
      if (inp.anyPressed('ArrowUp', 'KeyW')) bs[(i + bs.length - 1 + (i < 0 ? 1 : 0)) % bs.length].focus();
    }
  }
  pick(id) {
    if (this.busy || G.state !== 'menu' || G.pause.open) return;
    if (id === 'load' && !hasSave()) { sfx('error', { vol: 0.25 }); return; }
    sfx('click', { vol: 0.25, bus: 'ui' });
    if (id === 'settings') { G.pause.openSettings(true); return; }
    // every hand at once, then black
    this.busy = true; this.ui.classList.remove('on');
    this.chase.burst();
    this.choose(id);
  }
  closeChase() {
    if (!this.chase) return;
    if (G.view === this.chase) G.view = null;
    G.engine.background = G.sky;
    this.chase.stop();
    this.ui.classList.remove('on'); this.uiT = 0;
    if (this.ui.contains(document.activeElement)) document.activeElement.blur();
  }

  // Mochi on the sill, watching the sky
  setupCat() {
    const cat = G.cat;
    cat.present = true; cat.held = false; cat.jump = null; cat.path = null;
    const sill = cat.perches.find((p) => p.name === 'sill2');
    cat.perch = sill; cat.pos.copy(sill.pos); cat.pos.y = 0; cat.h = sill.pos.y; cat.yaw = 0;
    cat.fear = 0.2;
    cat.stareAt = V(21, 300, -802);
    cat.scripted = (ct) => { ct.path = null; ct.yaw = 0.05; ct.model.set({ sit: 1, tailUp: 0.0, tailCurve: 0.6, tailSway: 0.04, earL: 0.1, earR: -0.1 }); };
  }
  catBolts() {
    const cat = G.cat;
    cat.scripted = null; cat.stareAt = null;
    cat.fear = 0.9; cat.startle = 1;
    cat.model.set({ puff: 1, earFlat: 1 });
    sfx('hiss', { pos: cat.headPos(), vol: 0.7 });
    cat.setBehavior('flee');
  }

  // ------------------------------------------------------------- glass text
  draw() {
    const { ctx } = this.cv, W = 512, H = 576;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const font = this.fontReady ? '"Alagard"' : '"Courier New", monospace';
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const disabled = it.id === 'load' && !hasSave();
      const hov = i === this.hover && !disabled;
      ctx.save();
      ctx.font = `${hov ? 80 : 64}px ${font}`;
      ctx.translate(W / 2 + Math.sin(i * 3.1) * 10, it.y * H); ctx.rotate(Math.sin(i * 1.7) * 0.05 - 0.02);
      // wiped through the grime by a fingertip: soft overlapping passes
      const a = disabled ? 0.08 : hov ? 0.3 : 0.17;
      ctx.shadowColor = 'rgba(255,255,255,0.55)'; ctx.shadowBlur = hov ? 18 : 6;
      for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(236,234,226,${a})`; ctx.fillText(it.label, Math.sin(k * 2.1 + i) * 2.5, Math.cos(k * 1.7) * 2); }
      // condensation runs down from the strokes
      ctx.shadowBlur = 0; ctx.fillStyle = disabled ? 'rgba(220,220,210,0.08)' : 'rgba(225,222,212,0.22)';
      for (let k = 0; k < 4; k++) { const x = -120 + ((i * 7 + k * 61) % 240); const L = 18 + ((i * 13 + k * 29) % 42); ctx.fillRect(x, 24, 2, L); ctx.beginPath(); ctx.arc(x + 1, 24 + L, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    if (this.useChase) return this.updateChase(dt);
    this.t += dt;
    const cam = G.camera, inp = G.input;
    const nx = (inp.mx / window.innerWidth - 0.5) * 2, ny = (inp.my / window.innerHeight - 0.5) * 2;
    this.look.x = damp(this.look.x, nx, 2.5, dt); this.look.y = damp(this.look.y, ny, 2.5, dt);
    // walk up to the glass to touch a word, then come back
    const pos = FAR.clone(), look = LOOK.clone();
    if (this.dolly) {
      const d = this.dolly; d.t += dt;
      const k = smoothstep(0, d.dur, d.back ? d.dur - d.t : d.t);
      pos.lerp(d.to, k); look.lerp(d.lookTo, k);
      if (!d.back && d.t > d.dur && !d.touched) { d.touched = true; d.onArrive(); }
      if (d.back && d.t > d.dur) this.dolly = null;
    }
    this.cam.pos.copy(pos).add(V(this.look.x * 0.06, Math.sin(G.time * 1.3) * 0.007 - this.look.y * 0.03, 0));
    this.cam.look.copy(look).add(V(this.look.x * 0.5, -this.look.y * 0.3, 0));
    // the shockwave reaches the building
    const sh = this.shake || 0;
    cam.position.copy(this.cam.pos).add(V((Math.random() - 0.5) * sh * 0.04, (Math.random() - 0.5) * sh * 0.04, 0));
    cam.lookAt(this.cam.look);
    this.shake = Math.max(0, sh - dt * 0.9);
    const fov = this.dolly && !this.dolly.back ? 58 : 48;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 3, dt); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.cinematic(dt);
    this.plane.material.opacity = this.alpha;
    // the room breathes with the fires outside
    const flick = 0.75 + 0.25 * Math.sin(G.time * 7.3) * Math.sin(G.time * 3.1 + 1.7);
    G.sky.windowBoost = 2.5 + (this.flashK || 0) * 8;
    G.sky.hemiBoost = 3.5;
    this.spill.intensity = 9 + (this.flashK || 0) * 40;
    this.fireGlow.intensity = (5 + (this.impacted ? 3 : 0)) * flick + (this.flashK || 0) * 40;
    this.flashK = Math.max(0, (this.flashK || 0) - dt * 0.8);
    // cat and cloth live on
    G.cat.update(dt);
    // hover: where does the mouse land on the glass?
    this.ray.setFromCamera(new THREE.Vector2(nx, -ny), cam);
    const hit = this.ray.intersectObject(this.plane, false)[0];
    let hov = -1;
    if (hit && this.alpha > 0.7 && !this.busy) {
      const v = 1 - hit.uv.y;
      this.items.forEach((it, i) => { if (Math.abs(v - it.y) < 0.07 && Math.abs(hit.uv.x - 0.5) < 0.36) hov = i; });
    }
    if (hov !== this.hover) { this.hover = hov; this.draw(); if (hov >= 0) sfx('click', { vol: 0.06, rate: 2 }); }
    G.engine.renderer.domElement.style.cursor = hov >= 0 ? 'pointer' : 'default';
    // the hand lifts toward the word under the cursor; on touch it presses the glass
    if (this.dolly && !this.dolly.back) {
      const d = this.dolly;
      const press = d.touched ? Math.min(1, (d.t - d.dur) * 4) : 0;
      G.body.override.R = { p: d.point.clone().add(V(0, -0.012, 0.07 - press * 0.06)), F: V(0, 0.2, -1).normalize(), N: V(0, 0, -1), pose: 'point', w: 1 };
    } else if (hov >= 0 && hit) {
      G.body.override.R = { p: hit.point.clone().add(V(0, -0.02, 0.1)), F: V(0, 0.2, -1).normalize(), N: V(0, 0, -1), pose: 'point', w: 0.6 };
    } else G.body.override.R = null;
    G.body.override.L = null;
    G.body.lateUpdate(dt);
    if (inp.mousePressed(0) && hit && this.alpha > 0.7 && !this.busy && hov >= 0) this.press(hit, hov);
    // after settings: back off the glass
    if (this.dolly && this.dolly.waitPause && !G.pause.open) { this.dolly.waitPause = false; this.dolly.back = true; this.dolly.t = 0; this.busy = false; }
  }

  press(hit, i) {
    const it = this.items[i];
    if (it.id === 'load' && !hasSave()) { sfx('error', { vol: 0.25 }); return; }
    this.busy = true;
    sfx('step_wood', { vol: 0.3 });
    const point = hit.point.clone();
    this.dolly = {
      t: 0, dur: 1.15, point, to: V(point.x - 0.06, point.y + 0.02, 0.5), lookTo: V(point.x, point.y - 0.02, -2),
      onArrive: () => { sfx('tapSqueak', { vol: 0.35, rate: 1.6 }); setTimeout(() => this.choose(it.id), 420); },
    };
  }
  async choose(id) {
    if (id === 'settings') { G.pause && G.pause.openSettings(true); this.dolly.waitPause = true; return; }
    sfx('stinger', { vol: 0.45 });
    await G.fx.fadeTo(1, 0.9);
    this.close();
    G.state = 'play';
    G.body.override.R = null;
    G.hud.crosshair(true);
    G.input.lock();
    G.sky.resetTowers();
    if (id === 'new') {
      Object.assign(G.story, { day: 1, catTrust: 0.85, catFled: false, attackedCat: false, resistedCat: false, deaths: 0, callsDone: 0, flags: {} });
      G.director.startDay(1);
    } else {
      const s = readSave();
      if (s && s.story) Object.assign(G.story, s.story);
      G.director.startDay(s ? s.day : 1);
    }
  }

  // ------------------------------------------------------------- the crash
  setupShip() {
    const sky = G.sky, ship = sky.shipObj;
    ship.reset();
    ship.u.damage.value = 0.35; ship.u.power.value = 1;
    // out of the east, straight at us, low over Manhattan into the North Tower
    this.flight = { p0: V(400, 1250, -4400), p1: V(180, 740, -2200), p2: V(24, 290, -805), dur: 14 };
    sky.ship.position.copy(this.flight.p0);
    sky.ship.visible = true;
    this.shipVel = V();
    this.impacted = false; this.shockArrived = false;
    this.cut = [417, 415]; this.collapse = [null, null];
    // the ship burns before it ever reaches the towers
    this.attachedFires = [];
    for (let i = 0; i < 6; i++) {
      const h = ship.hull[i % 3];
      sky.debris.fire(V(), 60 + Math.random() * 60, 1e6, h.obj);
      const f = sky.debris.fires[(sky.debris.fi + sky.debris.fires.length - 1) % sky.debris.fires.length];
      f.off.set((Math.random() - 0.5) * 80, (Math.random() - 0.3) * 40, h.z0 + Math.random() * (h.z1 - h.z0));
      this.attachedFires.push(f);
    }
  }
  bez(t) {
    const { p0, p1, p2 } = this.flight;
    const a = p0.clone().lerp(p1, t), b = p1.clone().lerp(p2, t);
    return a.lerp(b, t);
  }
  skipToAfter() {
    // the menu revisited: everything has already fallen
    const sky = G.sky;
    sky.setTower(0, 0.02); sky.setTower(1, 0.03);
    sky.landmarks.setFire(0, 1, 2); sky.landmarks.setFire(1, 1, 4);
    sky.ship.position.set(55, -14 + 30, -745); sky.ship.rotation.set(0.25, -1.9, -0.5);
    sky.shipObj.u.damage.value = 1; sky.shipObj.u.power.value = 0.15;
    for (let i = 0; i < 10; i++) sky.debris.fire(V(-90 + Math.random() * 180, -14 + Math.random() * 40, -920 + Math.random() * 160), 80 + Math.random() * 90, 1e6);
    this.phase = 'after'; this.impacted = true; this.shockArrived = true; this.alpha = 1;
  }

  cinematic(dt) {
    const sky = G.sky, ship = sky.shipObj, deb = sky.debris, lm = sky.landmarks;
    const t = this.t;
    if (this.phase === 'approach') {
      const f = this.flight;
      const k = clamp(t / f.dur, 0, 1);
      const e = k * k * (1.6 - 0.6 * k);            // an accelerating dive
      const p = this.bez(e), ahead = this.bez(Math.min(1, e + 0.02));
      const prev = sky.ship.position.clone();
      sky.ship.position.copy(p);
      this.shipVel.copy(p).sub(prev).divideScalar(Math.max(dt, 1e-3));
      // nose along the path, rolling into the dive, shuddering as it fails
      if (ahead.distanceToSquared(p) > 1) {
        const m = new THREE.Matrix4().lookAt(ahead, p, V(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const roll = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -(Math.sin(t * 0.6) * 0.12 + k * 0.35) + (Math.random() - 0.5) * 0.02 * k);
        sky.ship.quaternion.copy(q.multiply(roll));
      }
      ship.vel = this.shipVel.clone();
      ship.u.power.value = 1 - k * 0.5 + (Math.random() < 0.04 ? -0.5 : 0);
      ship.u.damage.value = 0.35 + k * 0.4;
      sky.shipLight.intensity = 1.5 * ship.u.power.value;
      // a smoke trail and the odd piece shearing off
      if (Math.random() < dt * 14) deb.puff(sky.ship.localToWorld(V((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 40, 200 + Math.random() * 60)), V(0, 4, 0), 40, 40, 22, new THREE.Color(0.1, 0.09, 0.08), 0.6);
      if (Math.random() < dt * 0.8) { const pp = sky.ship.localToWorld(V((Math.random() - 0.5) * 120, 30, (Math.random() - 0.5) * 300)); deb.burst(pp, 6, 20, 4, 0.8); deb.puff(pp, V(), 30, 50, 8, new THREE.Color(0.2, 0.17, 0.15), 0.6); sky.blast(pp, 2, 80, 30); }
      if (!this.hum) this.hum = G.audio && G.audio.loop('shipHum', { vol: 0.15 });
      if (this.hum) this.hum.set({ vol: 0.15 + k * 0.5 });
      if (k >= 1) this.impact();
    }
    if (this.impacted) {
      // free parts tumble, hit the ground or the river
      ship.stepParts(dt, -14, (p, v) => {
        const pos = p.obj.position;
        const river = sky.isWater ? sky.isWater(pos.x, pos.z) : false;
        if (river) { for (let i = 0; i < 12; i++) deb.puff(pos.clone().add(V((Math.random() - 0.5) * 120, -10, (Math.random() - 0.5) * 120)), V((Math.random() - 0.5) * 20, 30 + Math.random() * 30, (Math.random() - 0.5) * 20), 40, 60, 10, new THREE.Color(0.75, 0.78, 0.8), 0.6); }
        else { deb.burst(pos, 40, v * 0.6, 4, 0.5); for (let i = 0; i < 8; i++) deb.puff(pos.clone().add(V((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80)), V((Math.random() - 0.5) * 30, 8, (Math.random() - 0.5) * 30), 50, 50, 25, new THREE.Color(0.3, 0.28, 0.26), 0.7); sky.blast(pos, 4, 160, 80); }
      });
      // collapses: the cut line drops, accelerating, throwing out debris and dust
      for (let i = 0; i < 2; i++) {
        const c = this.collapse[i]; if (!c) continue;
        c.t += dt;
        if (c.t < 0) continue;
        c.v += 9.8 * 0.55 * dt;                      // pancaking, slower than free fall
        this.cut[i] = Math.max(0, this.cut[i] - c.v * dt);
        lm.setCut(i, this.cut[i]);
        const tp = lm.towers[i].pos;
        const y = tp.y + this.cut[i];
        if (this.cut[i] > 1 && Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          const o = V(Math.cos(a) * 34, 0, Math.sin(a) * 34);
          deb.chunk(tp.clone().add(o).setY(y), o.clone().normalize().multiplyScalar(10 + Math.random() * 25).setY(-c.v * 0.5), 2 + Math.random() * 5, Math.random() < 0.2 ? 1 : 0, 25);
          deb.puff(tp.clone().add(o.multiplyScalar(1.3)).setY(y), o.clone().normalize().multiplyScalar(18), 40, 35, 35, new THREE.Color(0.55, 0.53, 0.5), 0.55);
        }
        // the ground surge of dust as it comes down
        if (this.cut[i] < 200 && Math.random() < dt * 8) { const a = Math.random() * Math.PI * 2; deb.puff(tp.clone().add(V(Math.cos(a) * 60, 10, Math.sin(a) * 60)), V(Math.cos(a) * 35, 2, Math.sin(a) * 35), 70, 45, 40, new THREE.Color(0.6, 0.58, 0.55), 0.6); }
        if (!c.rumbled && this.cut[i] < lm.towers[i].h * 0.9) { c.rumbled = true; setTimeout(() => { sfx('roarFar', { vol: 0.8, rate: 0.5 }); this.shake = Math.max(this.shake || 0, 0.6); }, 4000); }
      }
      // the shockwave comes up the street: the window, the curtains, the cat
      if (!this.shockArrived && sky.shock && sky.shock.r > Math.hypot(sky.shock.x - 7.7, sky.shock.z)) {
        this.shockArrived = true;
        sfx('roar', { vol: 1, rate: 0.55 }); sfx('bodyFall', { vol: 0.9, rate: 0.4 });
        this.shake = 1.4; G.fx.pulse('shake', 0.8, 2);
        for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.7 });
        G.windGust = 0.35;
        this.catBolts();
      }
      // smouldering columns from the site
      if (Math.random() < dt * 6) deb.puff(V(-15 + (Math.random() - 0.5) * 180, -14 + Math.random() * 60, -840 + (Math.random() - 0.5) * 140), V(0, 10 + Math.random() * 8, 0), 60, 30, 45, new THREE.Color(0.14, 0.12, 0.11), 0.5);
      if (Math.random() < dt * 0.15) sky.skyMat.uniforms.flash.value = 1;
    }
    if (t > 22 || !this.intro) this.alpha = Math.min(1, this.alpha + dt * 0.5);
  }

  impact() {
    const sky = G.sky, ship = sky.shipObj, deb = sky.debris, lm = sky.landmarks;
    this.phase = 'impact'; this.impacted = true;
    const p = sky.ship.position.clone();
    // the fireball, the flash, steel and glass everywhere
    sky.blast(p, 24, 320, 180);
    for (let i = 0; i < 8; i++) deb.fire(p.clone().add(V((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150)), 160 + Math.random() * 140, 6 + Math.random() * 6);
    deb.burst(p, 260, 90, 3.5, 0.6);
    for (let i = 0; i < 40; i++) deb.puff(p.clone().add(V((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 200)), V((Math.random() - 0.5) * 40, 10 + Math.random() * 20, (Math.random() - 0.5) * 40), 80, 60, 40, new THREE.Color(0.14, 0.12, 0.11), 0.75);
    sky.skyMat.uniforms.flash.value = 1;
    G.fx.pulse('white', 0.45, 1.8);
    this.flashK = 1;
    // the ship tears apart; the bow buries itself in the tower
    ship.breakApart(30);
    const bow = ship.parts.find((q) => q.name === 'bow'); if (bow) bow.vel.multiplyScalar(0.08);
    for (const q of ship.parts) if (q.name !== 'bow') q.vel.multiplyScalar(0.22);
    // the ring shears off and comes tumbling up the street toward us
    const ring = ship.parts.find((q) => q.name === 'ring'); if (ring) { ring.vel.set(15, 25, 95); ring.ang.set(0.1, 0.02, 0.9); }
    ship.u.power.value = 0.25; ship.u.damage.value = 1;
    for (const f of this.attachedFires) f.max = f.life + 25;
    if (this.hum) { this.hum.stop(1); this.hum = null; }
    // the towers burn where they were struck, then fall
    lm.setFire(0, 1, 286); lm.setFire(1, 1, 230);
    this.cut = [lm.towers[0].h, lm.towers[1].h];
    this.collapse = [{ t: -2.5, v: 2 }, { t: -11, v: 2 }];
    // the top of the North Tower goes first
    for (let i = 0; i < 30; i++) deb.chunk(lm.towers[0].pos.clone().add(V((Math.random() - 0.5) * 60, 300 + Math.random() * 110, (Math.random() - 0.5) * 60)), V((Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30), 6 + Math.random() * 10, 0.5, 40);
    // the shock ring starts at the towers
    sky.shock = { x: p.x, z: p.z, r: 0 };
    this.shake = 0.15;
  }
}
