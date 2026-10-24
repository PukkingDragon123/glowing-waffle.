// Main menu: you stand at the dirty window of 4B looking at a burning New York,
// two moons, lights in the sky, the ship. The options are written in the grime
// on the glass; you choose by reaching out and touching them.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';
import { hasSave, readSave } from '../core/save.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const GLASS_Z = -0.07, CX = 7.7, CY = 1.52, GW = 1.08, GH = 1.22;

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
      { id: 'new', label: 'NEW GAME', y: 0.2 },
      { id: 'load', label: 'LOAD GAME', y: 0.36 },
      { id: 'settings', label: 'SETTINGS', y: 0.7 },
    ];
    this.hover = -1; this.touch = 0; this.alpha = 0; this.wiped = [0, 0, 0];
    this.ray = new THREE.Raycaster();
    this.smudges = [];
    this.camPos = V(CX, 1.52, 0.62);
    G.menu = this;
  }

  async open({ intro = true } = {}) {
    G.state = 'menu';
    if (G.director) G.director.running = false;
    G.hud.objective([]); G.hud.setOSD('PLAY ▶', ''); G.hud.crosshair(false);
    document.getElementById('pause').hidden = true;
    G.alien && G.alien.reset();
    G.engine.background = G.sky;
    const c = G.player.ctrl;
    c.teleport(CX, 0.05, 0.95, 0, 0);
    c.override = null; c.enabled = false; c.lookEnabled = false;
    G.body.visible = true; G.body.showInMenu = true; G.body.mode = 'stand';
    G.cat.present = false;
    G.apartment.windows.menu.target = 0;
    G.sky.apply(G.sky.preset(7, 0.9, true), true);
    G.sky.cinematic = intro;
    G.sky.resetTowers();
    this.plane.visible = true;
    this.t = 0; this.intro = intro; this.alpha = intro ? 0 : 1; this.busy = false;
    this.look = { x: 0, y: 0 };
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    G.fx.fadeTo(0, 0.4);
    this.amb = G.audio && G.audio.loop('wind', { vol: 0.25 });
    this.siren = G.audio && G.audio.loop('siren', { vol: 0.08 });
    this.draw();
  }
  close() {
    this.plane.visible = false;
    G.body.showInMenu = false;
    G.sky.cinematic = false;
    if (this.amb) { this.amb.stop(1); this.amb = null; }
    if (this.siren) { this.siren.stop(1); this.siren = null; }
    if (this.shipHum) { this.shipHum.stop(1); this.shipHum = null; }
  }

  // ------------------------------------------------------------- glass text
  draw() {
    const { ctx } = this.cv, W = 512, H = 576;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const y = it.y * H;
      const disabled = it.id === 'load' && !hasSave();
      const hov = i === this.hover && !disabled;
      // finger-written in the grime: soft, wobbly strokes
      ctx.save();
      ctx.font = '900 50px "Noto Sans", "Arial Black", Arial, sans-serif';
      ctx.translate(W / 2 + Math.sin(i * 3.1) * 8, y); ctx.rotate(Math.sin(i * 1.7) * 0.035);
      // wiped by a fingertip: several soft passes, slightly offset, so the edges smear
      const a = disabled ? 0.07 : hov ? 0.26 : 0.16;
      ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = hov ? 14 : 5;
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = `rgba(232,230,220,${a})`;
        ctx.fillText(it.label, Math.sin(k * 2.1 + i) * 2.5, Math.cos(k * 1.7) * 2);
      }
      // drips running from the letters
      ctx.fillStyle = disabled ? 'rgba(210,210,200,0.12)' : 'rgba(225,222,212,0.3)';
      for (let k = 0; k < 4; k++) { const x = -110 + ((i * 7 + k * 61) % 220); const L = 14 + ((i * 13 + k * 29) % 30); ctx.fillRect(x, 20, 2, L); }
      ctx.restore();
    }
    ctx.font = '22px "VT323", monospace'; ctx.fillStyle = 'rgba(200,200,190,0.35)';
    ctx.fillText('touch the glass', W / 2, H - 30);
    this.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    const cam = G.camera;
    // camera: standing at the glass, breathing, a little parallax with the mouse
    const inp = G.input;
    const nx = (inp.mx / window.innerWidth - 0.5) * 2, ny = (inp.my / window.innerHeight - 0.5) * 2;
    this.look.x = damp(this.look.x, nx, 3, dt); this.look.y = damp(this.look.y, ny, 3, dt);
    cam.position.copy(this.camPos).add(V(this.look.x * 0.04, Math.sin(G.time * 1.3) * 0.006 - this.look.y * 0.02, 0));
    cam.rotation.set(-0.02 - this.look.y * 0.04, -this.look.x * 0.06, 0, 'YXZ');
    if (Math.abs(cam.fov - 62) > 0.01) { cam.fov = 62; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    if (this.intro) this.cinematic(dt);
    else this.alpha = Math.min(1, this.alpha + dt * 0.6);
    this.plane.material.opacity = this.alpha;
    // hover: where is the mouse on the glass?
    this.ray.setFromCamera(new THREE.Vector2(nx, -ny), cam);
    const hit = this.ray.intersectObject(this.plane, false)[0];
    let hov = -1;
    if (hit && this.alpha > 0.7 && !this.busy) {
      const v = 1 - hit.uv.y;
      this.items.forEach((it, i) => { if (Math.abs(v - it.y) < 0.075 && Math.abs(hit.uv.x - 0.5) < 0.36) hov = i; });
    }
    if (hov !== this.hover) { this.hover = hov; this.draw(); if (hov >= 0) sfx('click', { vol: 0.08, rate: 2 }); }
    document.body.style.cursor = hov >= 0 ? 'pointer' : 'default';
    // the hand follows the mouse across the glass and touches on click
    this.touch = damp(this.touch, this.pressT > 0 ? 1 : 0, 14, dt);
    this.pressT = Math.max(0, (this.pressT || 0) - dt);
    if (hit && this.alpha > 0.3) {
      const reach = 0.06 + (1 - this.touch) * 0.09;
      const p = hit.point.clone().add(V(0, -0.01, reach));
      G.body.override.R = { p, F: V(0, 0.2, -1).normalize(), N: V(0, 0, -1), pose: 'point', w: 1 };
    } else G.body.override.R = null;
    G.body.override.L = null;
    G.body.lateUpdate(dt);
    if (inp.mousePressed(0) && hit && this.alpha > 0.7 && !this.busy) this.press(hit);
  }

  press(hit) {
    this.pressT = 0.35;
    sfx('tapSqueak', { vol: 0.35, rate: 1.6 });
    const it = this.items[this.hover];
    if (!it) return;
    if (it.id === 'load' && !hasSave()) { sfx('error', { vol: 0.3 }); return; }
    this.busy = true;
    setTimeout(() => this.choose(it.id), 380);
  }
  async choose(id) {
    if (id === 'settings') { this.busy = false; G.pause && G.pause.openSettings(true); return; }
    sfx('stinger', { vol: 0.5 });
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
  cinematic(dt) {
    const t = this.t, sky = G.sky, ship = sky.ship;
    ship.visible = true;
    const W = sky.wtc[0], W2 = sky.wtc[1];
    const tgt = V((W.x + W2.x) / 2, 330, (W.z + W2.z) / 2);
    if (!this.shipHum) this.shipHum = G.audio && G.audio.loop('shipHum', { vol: 0.2 });
    if (t < 9) {
      // descending, then the dive
      const k = smoothstep(0, 9, t);
      const start = V(600, 1500, -3200);
      const p = start.clone().lerp(tgt, k * k);
      p.y += Math.sin(k * Math.PI) * 120;
      ship.position.copy(p);
      ship.rotation.set(0.25 + k * 0.5, 0.6 - k * 0.5, 0.1 + Math.sin(t * 0.7) * 0.05 + k * 0.4);
      sky.shipLight.intensity = 1.5 + Math.sin(t * 6) * 0.5;
      if (this.shipHum) this.shipHum.set({ vol: 0.2 + k * 0.4 });
      if (k > 0.5 && Math.random() < dt * 6) sky.blast(p.clone().add(V(0, 40, 80)), 1, 50, 40);
    } else if (!this.impact) {
      this.impact = true;
      sky.blast(tgt, 24, 300, 160);
      sky.shipLight.intensity = 0;
      G.fx.pulse('white', 0.55, 1.6);
      if (this.shipHum) { this.shipHum.stop(1.5); this.shipHum = null; }
      // the sound arrives late across the river
      setTimeout(() => { sfx('roar', { vol: 1, rate: 0.55 }); sfx('bodyFall', { vol: 0.8, rate: 0.4 }); G.fx.pulse('shake', 1, 2.5); for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.6 }); }, 2400);
    }
    if (t >= 9) {
      // the towers fold down into their own smoke
      const c = smoothstep(10, 17, t);
      sky.setTower(0, 1 - c * 0.86, 1); sky.setTower(1, 1 - smoothstep(11.5, 18, t) * 0.9, 1);
      ship.position.y = lerp(330, 120, smoothstep(9, 16, t)); ship.rotation.x = 0.9;
      if (Math.random() < dt * 10 && t < 19) sky.blast(V(tgt.x + (Math.random() - 0.5) * 80, lerp(380, 60, c), tgt.z), 1, 160, 80);
    }
    if (t > 15) this.alpha = Math.min(1, this.alpha + dt * 0.4);
    if (t > 20) this.intro = false;   // the wreck stays where it fell
  }
}
