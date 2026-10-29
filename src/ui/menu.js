// Main menu. You stand back in the dark of Room 1407: the window, the blue
// curtains, Khanom on the sill, and through the glass Bangkok in 1997 at true
// scale. The ship comes down over Sukhumvit and into the ghost tower across
// the soi, and the tower comes down. The options are written with a finger in
// the condensation on the glass; you walk up and touch one.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { clamp, damp, lerp, smoothstep, RNG } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';
import { hasSave, readSave } from '../core/save.js';
import { GROUND } from '../world/city.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const GLASS_Z = -0.05, CX = 7.0, CY = 1.52, GW = 1.1, GH = 1.2;
const FAR = V(7.05, 1.18, 3.05);         // standing back in the room, low enough to see the towers whole
const LOOK = V(7.0, 1.62, -1.0);

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
      { id: 'new', label: 'เริ่มใหม่ · new game', y: 0.36 },
      { id: 'load', label: 'เล่นต่อ · continue', y: 0.5 },
      { id: 'settings', label: 'ตั้งค่า · settings', y: 0.78 },
    ];
    this.hover = -1; this.alpha = 0;
    this.ray = new THREE.Raycaster();
    this.cam = { pos: FAR.clone(), look: LOOK.clone() };
    this.fontReady = false;
    // the light that comes in through the glass when the room lamps are off
    this.spill = new THREE.SpotLight(0xc8d0e0, 0, 10, 0.78, 0.75, 1.2);
    this.spill.position.set(7.0, 2.15, -0.9); this.spill.target.position.set(6.8, 0.2, 3.4);
    this.spill.castShadow = true; this.spill.shadow.mapSize.set(1024, 1024); this.spill.shadow.bias = -0.0006; this.spill.shadow.autoUpdate = false;
    this.fireGlow = new THREE.PointLight(0xff8a40, 0, 13, 1.3); this.fireGlow.position.set(7.0, 1.0, -2.6);
    G.scene.add(this.spill, this.spill.target, this.fireGlow);
    if (document.fonts && document.fonts.load) document.fonts.load('400 64px Itim', 'กขค abc').then(() => { this.fontReady = true; this.draw(); }).catch(() => {});
    G.menu = this;
  }

  async open({ intro = true } = {}) {
    G.state = 'menu';
    if (G.director) { G.director.running = false; G.director.stopAmbience && G.director.stopAmbience(); }
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
    G.apartment.windows.window.target = 0;
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

  // Khanom on the sill, watching the sky
  setupCat() {
    const cat = G.cat;
    cat.present = true; cat.held = false; cat.jump = null; cat.path = null;
    const sill = cat.perches.find((p) => p.name === 'sill2');
    cat.perch = sill; cat.pos.copy(sill.pos); cat.pos.y = 0; cat.h = sill.pos.y; cat.yaw = 0;
    cat.fear = 0.2;
    const gh = G.sky.landmarks.ghost || { pos: V(200, GROUND, -900), h: 185 };
    cat.stareAt = gh.pos.clone().add(V(0, gh.h, 0));
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
    const font = this.fontReady ? '"Itim", "Leelawadee UI"' : '"Leelawadee UI", Tahoma, cursive';
    // the title, written bigger, a little crooked
    ctx.save(); ctx.translate(W / 2, H * 0.12); ctx.rotate(-0.03);
    ctx.font = `400 ${82}px ${font}`; ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 8;
    for (let k = 0; k < 6; k++) { ctx.fillStyle = 'rgba(236,234,226,0.2)'; ctx.fillText('ต้มยำกุ้ง ๒๕๔๐', Math.sin(k * 2.1) * 2.5, Math.cos(k * 1.7) * 2); }
    ctx.font = `400 30px ${font}`; ctx.fillStyle = 'rgba(236,234,226,0.22)'; ctx.fillText('TOM YUM 2540', 0, 56);
    ctx.restore();
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const disabled = it.id === 'load' && !hasSave();
      const hov = i === this.hover && !disabled;
      ctx.save();
      ctx.font = `400 ${hov ? 52 : 48}px ${font}`;
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
      Object.assign(G.story, { day: 1, catTrust: 0.85, catFled: false, attackedCat: false, resistedCat: false, deaths: 0, callsDone: 0, flags: {}, politics: { yaba: null, vote: null, deed: null, petition: null } });
      G.director.startDay(1);
    } else {
      const s = readSave();
      if (s && s.story) Object.assign(G.story, s.story);
      G.director.startDay(s ? s.day : 1);
    }
  }

  // ------------------------------------------------------------- the crash
  // the two unfinished towers across the soi (towers[0] is the ghost tower)
  targets() {
    const lm = G.sky.landmarks;
    return [0, 1].map((i) => lm.towers[i]).filter(Boolean);
  }
  setupShip() {
    const sky = G.sky, ship = sky.shipObj;
    ship.reset();
    ship.u.damage.value = 0.35; ship.u.power.value = 1;
    const [g] = this.targets();
    const gp = g ? g.pos : V(200, GROUND, -900), gh = g ? g.h : 185;
    // in from the far side of the city, low over the roofs, into the ghost tower's upper floors
    const dir = V(gp.x - 7, 0, gp.z).normalize();
    const p2 = gp.clone().add(V(0, gh * 0.72, 0));
    const p0 = p2.clone().addScaledVector(dir, 3600).add(V(-900, 1100, 0));
    const p1 = p2.clone().addScaledVector(dir, 1700).add(V(-300, 480, 0));
    this.flight = { p0, p1, p2, dur: 14 };
    sky.ship.position.copy(this.flight.p0);
    sky.ship.visible = true;
    this.shipVel = V();
    this.impacted = false; this.shockArrived = false;
    this.cut = this.targets().map((t) => t.h); this.collapse = this.targets().map(() => null);
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
    const sky = G.sky, T = this.targets();
    T.forEach((t, i) => { sky.setTower(i, i ? 0.05 : 0.03); sky.landmarks.setFire(i, 1, 3); });
    const gp = T[0] ? T[0].pos : V(200, GROUND, -900);
    sky.ship.position.copy(gp).add(V(40, 30, 50)); sky.ship.rotation.set(0.25, 1.9, 0.5);
    sky.shipObj.u.damage.value = 1; sky.shipObj.u.power.value = 0.15;
    for (let i = 0; i < 10; i++) sky.debris.fire(gp.clone().add(V(-80 + Math.random() * 160, Math.random() * 40, -60 + Math.random() * 120)), 80 + Math.random() * 90, 1e6);
    this.phase = 'after'; this.impacted = true; this.shockArrived = true; this.alpha = 1;
  }

  cinematic(dt) {
    const sky = G.sky, ship = sky.shipObj, deb = sky.debris, lm = sky.landmarks;
    const t = this.t, T = this.targets();
    if (this.phase === 'approach') {
      const f = this.flight;
      const k = clamp(t / f.dur, 0, 1);
      const e = k * k * (1.6 - 0.6 * k);
      const p = this.bez(e), ahead = this.bez(Math.min(1, e + 0.02));
      const prev = sky.ship.position.clone();
      sky.ship.position.copy(p);
      this.shipVel.copy(p).sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (ahead.distanceToSquared(p) > 1) {
        const m = new THREE.Matrix4().lookAt(ahead, p, V(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const roll = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.sin(t * 0.6) * 0.12 + k * 0.35 + (Math.random() - 0.5) * 0.02 * k);
        sky.ship.quaternion.copy(q.multiply(roll));
      }
      ship.vel = this.shipVel.clone();
      ship.u.power.value = 1 - k * 0.5 + (Math.random() < 0.04 ? -0.5 : 0);
      ship.u.damage.value = 0.35 + k * 0.4;
      sky.shipLight.intensity = 1.5 * ship.u.power.value;
      if (Math.random() < dt * 14) deb.puff(sky.ship.localToWorld(V((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 40, 200 + Math.random() * 60)), V(0, 4, 0), 40, 40, 22, new THREE.Color(0.1, 0.09, 0.08), 0.6);
      if (Math.random() < dt * 0.8) { const pp = sky.ship.localToWorld(V((Math.random() - 0.5) * 120, 30, (Math.random() - 0.5) * 300)); deb.burst(pp, 6, 20, 4, 0.8); deb.puff(pp, V(), 30, 50, 8, new THREE.Color(0.2, 0.17, 0.15), 0.6); sky.blast(pp, 2, 80, 30); }
      if (!this.hum) this.hum = G.audio && G.audio.loop('shipHum', { vol: 0.15 });
      if (this.hum) this.hum.set({ vol: 0.15 + k * 0.5 });
      if (k >= 1) this.impact();
    }
    if (this.impacted) {
      ship.stepParts(dt, GROUND, (p, v) => {
        const pos = p.obj.position;
        deb.burst(pos, 40, v * 0.6, 4, 0.5);
        for (let i = 0; i < 8; i++) deb.puff(pos.clone().add(V((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80)), V((Math.random() - 0.5) * 30, 8, (Math.random() - 0.5) * 30), 50, 50, 25, new THREE.Color(0.3, 0.28, 0.26), 0.6);
        sky.blast(pos, 4, 160, 80);
      });
      // the concrete pancakes: the cut line drops, accelerating, throwing out dust
      for (let i = 0; i < T.length; i++) {
        const c = this.collapse[i]; if (!c) continue;
        c.t += dt;
        if (c.t < 0) continue;
        c.v += 9.8 * 0.5 * dt;
        this.cut[i] = Math.max(0, this.cut[i] - c.v * dt);
        lm.setCut(i, this.cut[i]);
        const tp = T[i].pos, r = (T[i].r || 22);
        const y = tp.y + this.cut[i];
        if (this.cut[i] > 1 && Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          const o = V(Math.cos(a) * r, 0, Math.sin(a) * r);
          deb.chunk(tp.clone().add(o).setY(y), o.clone().normalize().multiplyScalar(10 + Math.random() * 25).setY(-c.v * 0.5), 2 + Math.random() * 5, Math.random() < 0.2 ? 1 : 0, 25);
          deb.puff(tp.clone().add(o.multiplyScalar(1.3)).setY(y), o.clone().normalize().multiplyScalar(18), 40, 35, 35, new THREE.Color(0.62, 0.6, 0.56), 0.55);
        }
        if (this.cut[i] < 120 && Math.random() < dt * 8) { const a = Math.random() * Math.PI * 2; deb.puff(tp.clone().add(V(Math.cos(a) * r * 2, 10, Math.sin(a) * r * 2)), V(Math.cos(a) * 35, 2, Math.sin(a) * 35), 70, 45, 40, new THREE.Color(0.66, 0.63, 0.58), 0.6); }
        if (!c.rumbled && this.cut[i] < T[i].h * 0.9) { c.rumbled = true; sfx('towerCollapse', { vol: 0.9 }); setTimeout(() => { sfx('roarFar', { vol: 0.8, rate: 0.5 }); this.shake = Math.max(this.shake || 0, 0.6); }, 2500); }
      }
      // the shockwave reaches 1407: the window, the curtains, the cat
      if (!this.shockArrived && sky.shock && sky.shock.r > (this.shockDist || 900)) {
        this.shockArrived = true;
        sfx('roar', { vol: 1, rate: 0.55 }); sfx('bodyFall', { vol: 0.9, rate: 0.4 });
        this.shake = 1.4; G.fx.pulse('shake', 0.8, 2);
        for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.7 });
        G.windGust = 0.35;
        this.catBolts();
      }
      const gp = T[0] ? T[0].pos : V(200, GROUND, -900);
      if (Math.random() < dt * 6) deb.puff(gp.clone().add(V((Math.random() - 0.5) * 140, Math.random() * 60, (Math.random() - 0.5) * 120)), V(0, 10 + Math.random() * 8, 0), 60, 30, 45, new THREE.Color(0.14, 0.12, 0.11), 0.5);
      if (Math.random() < dt * 0.15) sky.skyMat.uniforms.flash.value = 1;
    }
    if (t > 22 || !this.intro) this.alpha = Math.min(1, this.alpha + dt * 0.5);
  }

  impact() {
    const sky = G.sky, ship = sky.shipObj, deb = sky.debris, lm = sky.landmarks, T = this.targets();
    this.phase = 'impact'; this.impacted = true;
    const p = sky.ship.position.clone();
    sky.blast(p, 24, 320, 180);
    for (let i = 0; i < 8; i++) deb.fire(p.clone().add(V((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 150)), 160 + Math.random() * 140, 6 + Math.random() * 6);
    deb.burst(p, 260, 90, 3.5, 0.6);
    for (let i = 0; i < 40; i++) deb.puff(p.clone().add(V((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 200)), V((Math.random() - 0.5) * 40, 10 + Math.random() * 20, (Math.random() - 0.5) * 40), 80, 60, 40, new THREE.Color(0.14, 0.12, 0.11), 0.75);
    sky.skyMat.uniforms.flash.value = 1;
    G.fx.pulse('white', 0.45, 1.8);
    this.flashK = 1;
    ship.breakApart(30);
    const bow = ship.parts.find((q) => q.name === 'bow'); if (bow) bow.vel.multiplyScalar(0.08);
    for (const q of ship.parts) if (q.name !== 'bow') q.vel.multiplyScalar(0.22);
    // the ring shears off and goes cartwheeling over the roofs toward Sukhumvit
    const ring = ship.parts.find((q) => q.name === 'ring'); if (ring) { const back = V(7, 0, 0).sub(p).setY(0).normalize(); ring.vel.set(back.x * 90, 25, back.z * 90); ring.ang.set(0.1, 0.02, 0.9); }
    ship.u.power.value = 0.25; ship.u.damage.value = 1;
    for (const f of this.attachedFires) f.max = f.life + 25;
    if (this.hum) { this.hum.stop(1); this.hum = null; }
    T.forEach((tw, i) => lm.setFire(i, 1, tw.h * (i ? 0.5 : 0.7)));
    this.cut = T.map((tw) => tw.h);
    this.collapse = T.map((tw, i) => ({ t: i ? -9 : -2.5, v: 2 }));
    if (T[0]) for (let i = 0; i < 30; i++) deb.chunk(T[0].pos.clone().add(V((Math.random() - 0.5) * 40, T[0].h * 0.7 + Math.random() * T[0].h * 0.3, (Math.random() - 0.5) * 40)), V((Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 30), 6 + Math.random() * 10, 0.5, 40);
    sky.shock = { x: p.x, z: p.z, r: 0 };
    this.shockDist = Math.hypot(p.x - 7, p.z);
    this.shake = 0.15;
  }
}
