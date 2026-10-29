// Day 7, the true ending. The radio and the TV call Alex a disgrace; the
// neighbours agree. The mirror shows the truth: green coming up under the
// skin. It is not killing Alex, it is changing them. At night the government
// comes with flashlights: hide in the dark or wake up in their lab. Then the
// phone: a kind voice, the people the world was told were monsters. They want
// peace. Take the elevator up. They are just like you, only green.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { clamp, damp, easeInOut, lerp, smoothstep } from '../core/util.js';
import { clearSave } from '../core/save.js';
import { Button } from '../world/interactables.js';
import { L, labelMat } from '../world/labels.js';
import { printed } from '../gfx/textures.js';
import { Raid, VOICE } from '../creatures/agents.js';
import { Roof, ROOF_Y } from '../world/roof.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const STOP = Symbol('stop');
// the voice on the phone, and on the roof; and the older man beside her
const KIND = { pitch: 178, formant: 1.1, speed: 0.84, breathy: 0.18, jitter: 0.01 };
const WALT = { pitch: 100, formant: 0.96, speed: 0.84, breathy: 0.14, jitter: 0.03 };
const DOOR = V(7.65, 1.0, 7.75);

export class Peace {
  constructor() {
    G.peace = this;
    this.seq = 0; this.gen = 0;
    this.phase = 'off'; this.calm = false; this.inTub = false;
    // the only two new lights: flashlights in the raid, then the roof's green and its door bulb
    this.lights = [0, 1].map(() => { const l = new THREE.SpotLight(0xfff2dc, 0, 8, 0.3, 0.5, 1.5); l.castShadow = false; return l; });
    this.raid = new Raid(this.lights);
    this.roof = new Roof();
    this.done = new Set();
  }

  // ------------------------------------------------------------- sequencing
  // one story sequence at a time; starting another (or a new day) cancels it
  run(fn) {
    const id = ++this.seq;
    const w = async (s) => { await G.tasks.wait(s); if (this.seq !== id) throw STOP; };
    w.ok = () => this.seq === id;
    fn(w).catch((e) => { if (e !== STOP) console.error(e); });
  }
  say(t, d = 0) { const g = this.gen; G.tasks.delay(d, () => { if (g === this.gen) G.hud.inner(t); }); }
  speak(line, voice, o = {}) { return (G.audio && G.audio.speak(line, { voice, vol: 0.85, ...o })) || { dur: Math.max(1.5, line.length * 0.07) }; }
  once(k) { if (this.done.has(k)) return false; this.done.add(k); return true; }
  setGreen(v) { this.green = v; G.body && G.body.setMutation({ green: v }); }

  // ------------------------------------------------------------- days
  startDay(day) {
    this.reset();
    if (day !== 7) return;
    this.phase = 'morning';
    if (!this.lit) { this.lit = true; for (const l of this.lights) G.scene.add(l, l.target); }   // hidden in the dawn fade
    this.dress();
    this.notice.visible = this.scrawl.visible = this.note.visible = true;
    this.setGreen(0.07);
  }
  reset() {
    this.seq++; this.gen++;
    this.phase = 'off'; this.calm = false; this.done.clear(); this.underDoor = false; this.steer = null; this.T = 0; this.walkTo = null; this.woke = false;
    if (this.inTub) this.leaveTub(true);
    this.raid.hideAll();
    for (const l of this.lights) l.intensity = 0;
    this.roof.leave(); this.roof.showButton(false);
    if (this.notice) this.notice.visible = this.scrawl.visible = this.note.visible = false;
    if (this.tubBtn) this.tubBtn.enabled = false;
    if (this.handBtn) this.handBtn.enabled = false;
    if (this.heli) { this.heli.stop(0.5); this.heli = null; }
    if (G.hud.choice) G.hud.choice.resolve(null);
    if (G.alien) G.alien.quiet = false;
    if (G.mirror) G.mirror.truth = false;
    if (G.player) { G.player.hunger.frozen = false; G.player.ctrl.zoom = 0; }
    if (G.interact) G.interact.enabled = true;
    if (G.sky) G.sky.hemiBoost = G.sky.windowBoost = 1;
    G.engine.fx.whiteColor.set(1, 1, 1);
    G.fx.clear('raid');
    this.setGreen(0);
  }

  // the morning's evidence: an official notice and a scrawl on the board, a note under the door
  dress() {
    if (this.notice) return;
    const board = G.building.seenPoster.parent;
    const fed = printed('fedNotice', 128, 176, (c, w, h) => {
      c.fillStyle = '#efece2'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.textAlign = 'center';
      c.font = 'bold 12px Arial'; c.fillText('FEDERAL NOTICE', w / 2, 18); c.fillRect(10, 25, w - 20, 2);
      c.font = 'bold 15px Arial'; c.fillText('ALEX BENGRIM', w / 2, 48);
      c.font = '9px Arial'; c.fillText('APT 4B, HARBORVIEW TOWERS', w / 2, 63);
      c.fillStyle = '#8e1010'; c.font = 'bold 12px Arial'; c.fillText('CONTAMINATED', w / 2, 90); c.fillText('DO NOT APPROACH', w / 2, 106);
      c.fillStyle = '#111'; c.font = '9px Arial';
      ['A DANGER TO THE PUBLIC.', 'REPORT ALL SIGHTINGS', '1-800-555-0137'].forEach((s, i) => c.fillText(s, w / 2, 130 + i * 14));
    });
    const pin = (m, y) => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.4 })); p.position.set(0, y, 0.006); m.add(p); };
    this.notice = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), labelMat(fed)); this.notice.position.set(0.0, -0.1, 0.015); this.notice.rotation.z = -0.035; board.add(this.notice); pin(this.notice, 0.135);
    // someone has written over the missing poster, in marker
    const scr = printed('disgrace', 128, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.save(); c.translate(w / 2, h / 2); c.rotate(-0.28);
      c.fillStyle = 'rgba(150,10,14,0.92)'; c.font = 'italic bold 25px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DISGRACE', 0, 2); c.restore();
    });
    this.scrawl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), labelMat(scr, { transparent: true })); this.scrawl.material.depthWrite = false;
    this.scrawl.position.set(0.36, -0.1, 0.016); board.add(this.scrawl);
    // folded paper pushed under 4B's door, ballpoint, capitals
    const nt = printed('doorNote', 96, 128, (c, w, h) => {
      c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(0, h / 2 - 1, w, 2);
      c.fillStyle = '#1c2a6a'; c.font = 'bold 10px "Comic Sans MS", cursive'; c.textAlign = 'left';
      ['WE SAW THE NEWS.', '', 'WE KNOW WHAT', 'YOU ARE.', '', 'GET OUT OF OUR', 'BUILDING.'].forEach((s, i) => c.fillText(s, 8, 18 + i * 14));
    });
    const note = this.note = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), labelMat(nt));
    note.rotation.set(-Math.PI / 2, 0, 0.4); note.position.set(7.62, 0.006, 7.47); G.world.root.add(note);
    new Button(note, { name: 'note', label: () => (note.visible ? 'Read the note' : null), onUse: () => this.react('note') });
    // the tub: somewhere to lie still behind the curtain
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    tub.position.set(0.38, 0.4, 4.57); G.world.root.add(tub);
    this.tubBtn = new Button(tub, { name: 'tub', label: () => (this.inTub ? null : 'Get in the tub'), onUse: () => this.enterTub() });
    this.tubBtn.enabled = false;
    // a slit of light under the front door when they are outside it
    const add = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 };
    this.slit = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.014), new THREE.MeshBasicMaterial({ color: 0xfff2dc, ...add }));
    this.slit.position.set(7.65, 0.008, 7.722); this.slit.rotation.y = Math.PI; G.world.root.add(this.slit);
    this.spill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0x9a8e78, map: printed('spill', 64, 64, (cx, w, h) => { const gr = cx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, w, h); const sg = cx.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(0.2, 'rgba(0,0,0,0)'); sg.addColorStop(0.8, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)'); cx.globalCompositeOperation = 'destination-out'; cx.fillStyle = sg; cx.fillRect(0, 0, w, h); }), ...add }));
    this.spill.rotation.set(-Math.PI / 2, 0, Math.PI); this.spill.position.set(7.65, 0.01, 7.27);   // bright edge at the door G.world.root.add(this.spill);
    this.roof.makeButton(() => G.building.selectFloor('R'));
  }

  // what Alex makes of it
  react(k) {
    if (!this.once('r' + k)) { if (k === 'note') this.say('Get out of our building.'); return; }
    if (k === 'radio') { this.say('That was my name. On the radio.', 1.8); this.say('Contaminated. A danger. I answer phones for a living.', 5.6); this.say("My skin feels wrong. Tight. I need to see.", 11); }
    if (k === 'tv') { this.say('Every channel. My name on every channel.', 2.5); this.say("They're lying. I haven't hurt anyone.", 6.5); }
    if (k === 'note') { this.say("'We saw the news. We know what you are. Get out of our building.'", 0.4); this.say("They hate me. They don't even know me.", 5.5); }
    if (k === 'notice') { this.say("Do not approach. Like I'm an animal.", 0.5); this.say('And someone wrote it across my picture. Disgrace.', 4.5); this.say('They hate me. All of them. And all of it is a lie.', 9); }
  }

  // ------------------------------------------------------------- per frame (after the director)
  update(dt) {
    if (this.phase === 'off') return;
    const d = G.director, c = G.player.ctrl;
    if (this.phase === 'morning') this.morning(dt);
    if (this.underDoor) this.beamsUnderDoor();
    if (this.slit) { const k = damp(this.slit.material.opacity, this.underDoor ? 0.75 + Math.sin(G.time * 7) * 0.1 : 0, 4, dt); this.slit.material.opacity = k; this.spill.material.opacity = k * (0.55 + Math.sin(G.time * 1.3) * Math.sin(G.time * 0.7) * 0.35); }
    if (this.raid.agents.some((a) => a.on)) {
      const ex = this.raid.update(dt);
      if (this.phase === 'search' && ex > 1) this.caught(this.raid.spotter);
    }
    // they are at the door: open it and that is that
    if (this.phase === 'raid' && G.apartment.doors.front.angle > 0.35 && !this.raid.active) this.caught(null, true);
    if (this.phase === 'raid' || this.phase === 'search') { d.coughT = Math.max(d.coughT ?? 0, 20); G.alien.nextSweep = 999; }
    if (this.inTub) this.tub(dt);
    // the call: it keeps ringing until it is answered
    if (this.phase === 'call' && G.phone.state === 'idle' && !this.answered) { this.reringT = (this.reringT ?? 2) - dt; if (this.reringT <= 0) { this.reringT = 3; this.ring(); } }
    if (this.phase === 'elevator') {
      const b = G.building;
      if (b.playerInCar() && this.once('newButton')) this.say("There's a button I've never seen before.", 0.6);
      if (b.el.state === 'travel' && b.el.target === 'R') this.run((w) => this.ride(w));
    }
    if (this.roof.on) { this.roof.update(dt); this.onRoof(dt); }
    if (this.steer) c.lookAtPoint(this.steer, 1 - Math.exp(-dt * 2.2));
    // up here Mochi's face holds still
    if (this.roof.on) G.engine.fx.faceSpot.w = 0;
  }

  morning(dt) {
    const d = G.director, c = G.player.ctrl;
    this.T = (this.T || 0) + dt;
    if (d.cutscene || d.inBed) return;
    // after the broadcast has finished
    if (this.T > 17 && this.once('wake')) this.react('radio');
    // the board in the hallway
    const z = G.world.zoneAt(c.body.position);
    if (z && z.name === 'hall' && !this.done.has('rnotice')) {
      const to = V(1.6, 1.45, 7.93).sub(G.camera.position), dist = to.length();
      if (dist < 2.6 && to.normalize().dot(c.forward()) > 0.86) this.react('notice');
    }
    if (G.mirror && G.mirror.seen > 1.0 && z && z.name === 'bath') { this.phase = 'mirror'; this.run((w) => this.mirrorBeat(w)); }
  }

  // ------------------------------------------------------------- the mirror
  async mirrorBeat(w) {
    const d = G.director, c = G.player.ctrl, ap = G.apartment;
    d.done('mirror'); d.cutscene = true; d.drawTasks();
    c.enabled = false; c.lookEnabled = false;
    if (G.player.inv.hand) G.player.inv.store();
    // the bulb over the glass
    if (!ap.lights.vanity.on) { ap.lights.vanity.set(true); sfx('switch', { pos: V(3.39, 1.25, 4.85), vol: 0.4 }); }
    ap.lights.vanity.dim = 0.3;
    const from = V().copy(c.body.position), to = V(2.2, from.y, 4.5), y0 = c.yaw, p0 = c.pitch;
    G.tasks.tween(1.3, (k) => { const p = from.clone().lerp(to, k); c.teleport(p.x, p.y, p.z); c.yaw = lerp(y0, 0, k); c.pitch = lerp(p0, -0.06, k); }, easeInOut);
    // the room stops bending: the glass shows only what is there
    G.mirror.truth = true; this.calm = true;
    G.uniforms.uBend.value.set(0, 0, 0, 0); G.uniforms.uWarp.value = 0.1; G.uniforms.uBreath.value = 0;
    G.fx.setGrade({ saturation: 0.56, tint: V(0.95, 0.97, 0.92) });
    c.zoom = 14;
    await w(1.4);
    sfx('heartbeat', { vol: 0.5 });
    const g0 = this.green;
    G.tasks.tween(10, (k) => this.setGreen(lerp(g0, 0.62, k)), easeInOut);
    G.tasks.tween(10, (k) => G.body.setMutation({ blackVeins: lerp(0.8, 0.4, k), glow: lerp(0.3, 0.45, k) }));
    this.say('...is that me?', 0.8);
    await w(3.4);
    this.say('Green. Under the skin. Like light through a leaf.');
    G.body.stomachPulse(0.6);
    await w(4.6);
    this.say("It isn't killing me.");
    G.fx.setGrade({ saturation: 0.62 });
    await w(3.4);
    this.say("It's changing me.");
    await w(3.6);
    await G.fx.fadeTo(1, 0.9);
    this.toNight();
    c.zoom = 0; ap.lights.vanity.dim = 1;
    this.say('I sat on the edge of the tub until it got dark.', 0.3);
    await w(3.2);
    // on the rim of the tub, looking at the bathroom door
    c.teleport(1.2, 0.05, 4.62, -Math.PI / 2, -0.1);
    c.override = { pos: V(0.98, 0.98, 4.66), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, -Math.PI / 2 + 0.25, 0, 'YXZ')), speed: 50 };
    c.overrideBlend = 1; c.lastOverride = c.override;
    G.body.visible = false;
    G.fx.fadeTo(0, 0.6);
    await w(2.6);
    c.override = null; G.body.visible = true; c.enabled = c.lookEnabled = true; d.cutscene = false;
    d.setTasks([]);
    this.phase = 'night';
    this.run((w2) => this.raidSeq(w2));
  }

  // night falls, and the world steadies: no more bending, no more hunger
  toNight() {
    const d = G.director;
    d.minutes = Math.max(d.minutes, 21 * 60 + 25);
    for (const k of ['collapse7', 'cat7', 'call7', 'bedTask']) d.once.add(k);
    G.sky.apply(G.sky.preset(7, d.t01), true);
    this.calm = true;
    G.uniforms.uWarp.value = 0.1; G.uniforms.uBreath.value = 0; G.uniforms.uBend.value.set(0, 0, 0, 0);
    G.building.staticsS.forEach((m) => (m.visible = true));
    G.building.hallLights.forEach((f, i) => { f.flicker = i === 0 ? 0.35 : 0; f.dim = 1; });
    G.alien.reset(); G.alien.quiet = true;
    G.sky.hemiBoost = 2.4; G.sky.windowBoost = 2.2;              // the city burning outside lights the rooms a little
    const h = G.player.hunger; h.value = 0.3; h.frozen = true;
    G.body.setMutation({ blackVeins: 0.4, glow: 0.45 });
    if (this.green < 0.62) this.setGreen(0.62);
    G.mirror.truth = true;
    if (G.phone.state === 'ringing') G.phone.stopRing();
    const front = G.apartment.doors.front; front.setAngle(0); front.locked = false;
    G.director.done('mirror');
  }

  // ------------------------------------------------------------- they come
  async raidSeq(w, fast = false) {
    const d = G.director, cat = G.cat;
    if (!fast) {
      await w(3.5);
      sfx('siren', { vol: 0.3, pos: V(30, -10, -25), occlude: false });
      this.heli = G.audio && G.audio.loop('heliFar', { vol: 0.22, fade: 4 });
      await w(4);
      for (let i = 0; i < 9; i++) sfx('step_carpet', { pos: V(13 - i * 0.6, 0.1, 8.8), vol: 0.55, delay: i * 0.32 });
      await w(3.4);
    }
    this.phase = 'raid';
    sfx('doorSlam', { pos: DOOR, vol: 0.5, rate: 1.3 }); sfx('knocks', { pos: DOOR, vol: 1, rate: 0.85, delay: 0.25 });
    this.underDoor = true;
    await w(1.6);
    sfx('radioChirp', { pos: V(7.65, 1.3, 8.6), vol: 0.5 });
    this.hallSpeak('Federal agents! Alex Bengrim, open the door!', VOICE.a);
    d.setTasks([{ id: 'hide', text: 'Hide' }]);
    this.tubBtn.enabled = true;
    this.say("They're here. For me.", 3.2);
    this.say("Hide. Somewhere dark. Somewhere they won't look.", 6.5);
    if (cat.present && !cat.held) { cat.fear = 1; cat.setBehavior('hide', { hide: cat.bestHide() }); }
    await w(9);
    sfx('knocks', { pos: DOOR, vol: 1, rate: 0.8 });
    await w(0.8);
    this.hallSpeak('Bengrim! We know you are in there!', VOICE.b);
    await w(6);
    sfx('radioChirp', { pos: V(7.65, 1.3, 8.6), vol: 0.5 });
    this.hallSpeak('Power is down. You are clear.', VOICE.radio, true);
    await w(2.2);
    G.world.power = false; sfx('powerDown', { vol: 0.6 });
    if (G.tv && G.tv.on) G.tv.toggle();
    this.say('They cut the power.', 0.8);
    await w(4.5);
    this.hallSpeak('On three.', VOICE.a);
    await w(1.6);
    await this.searchSeq(w);
  }
  // through the door, round the rooms, and out again if nothing finds Alex
  async searchSeq(w) {
    const d = G.director;
    this.breach();
    await w(36);
    sfx('radioChirp', { pos: this.raid.A.pos.clone().setY(1.3), vol: 0.6 });
    this.speak('All units. Subject is not on site. Pull out.', VOICE.radio, { phone: true, pos: this.raid.A.pos.clone().setY(1.3), vol: 0.6 });
    await w(3.4);
    this.raid.A.say('Clear.');
    await w(1.3);
    const h = this.raid.B.say("He'll come back. When he does,");
    await w((h && h.dur) || 2.2);
    sfx('radioChirp', { pos: this.raid.B.pos.clone().setY(1.3), vol: 0.5 });
    // out the way they came, and down the hall
    const out = (a, delay) => a.go([{ x: 7.65, z: 7.0, wait: delay, look: 0, sweep: 0.3 }, { x: 7.65, z: 8.75, wait: 0 }, { x: 15.5, z: 8.75, wait: 0 }, { x: 19, z: 8.75, wait: 99 }]);
    out(this.raid.C, 0); out(this.raid.A, 0.8); out(this.raid.B, 1.6);
    await w(5.5);
    this.raid.active = false;
    G.fx.clear('raid');
    await w(4);
    this.raid.hideAll();
    if (this.heli) { this.heli.stop(4); this.heli = null; }
    this.tubBtn.enabled = false;
    d.done('hide');
    this.phase = 'gone';
    this.say("They're gone.", 0.5);
    this.say('They broke the door.', 3.6);
    await w(8);
    this.phase = 'call';
    this.answered = false;
    this.ring();
    d.setTasks([{ id: 'phone', text: 'Answer the phone' }]);
  }
  hallSpeak(line, voice, radio = false) { return this.speak(line, voice, { pos: V(7.65, 1.5, 8.5), phone: radio, vol: radio ? 0.55 : 1 }); }

  beamsUnderDoor() {
    const t = G.time;
    this.lights.forEach((l, i) => {
      l.color.set(0xfff2dc); l.angle = 0.42; l.penumbra = 0.6; l.decay = 1.5; l.distance = 5;
      l.position.set(7.3 + i * 0.7 + Math.sin(t * 0.6 + i) * 0.2, 0.55, 8.6);
      l.target.position.set(7.65 + Math.sin(t * (0.8 + i * 0.37) + i * 2) * 0.6, 0, 7.25 - Math.abs(Math.sin(t * 0.45 + i)) * 0.6);
      l.target.updateMatrixWorld();
      l.intensity = 16 * (0.85 + Math.random() * 0.15);
    });
  }

  breach() {
    const front = G.apartment.doors.front, A = this.raid.A, B = this.raid.B, C = this.raid.C, D = G.apartment.doors;
    this.underDoor = false;
    front.locked = false; front.setAngle(0.8); front.target = 1.55;
    sfx('doorBreak', { pos: DOOR, vol: 1 });
    G.fx.pulse('shake', 0.7, 0.7); G.player.ctrl.shake = 0.5;
    this.phase = 'search';
    this.raid.active = true; this.raid.exposure = 0;
    A.show(7.6, 8.75, Math.PI); B.show(7.95, 9.1, Math.PI); C.show(8.3, 9.35, Math.PI);
    const N = Math.PI, NW = -2.36, NE = 2.36, W = -Math.PI / 2, S = 0;
    A.go([
      { x: 7.65, z: 6.9, look: N, sweep: 0.75, wait: 2.2, say: 'Federal agents!' },
      { x: 6.4, z: 4.6, look: NW, sweep: 0.7, wait: 2.6 },
      { x: 5.7, z: 2.9, look: -2.7, sweep: 0.9, wait: 3, say: 'Living room.' },
      { x: 8.3, z: 2.8, look: NE, sweep: 0.8, wait: 2.6, say: 'Kitchen. Clear.' },
      { x: 5.2, z: 3.75, wait: 0 },
      { x: 4.0, z: 3.0, wait: 0.2, look: W, open: D.bedroom },
      { x: 2.5, z: 2.6, look: W, sweep: 1.25, rate: 0.7, wait: 5, say: 'Bedroom.', pitch: 0.42 },
      { x: 4.0, z: 3.1, wait: 0 },
      { x: 6.6, z: 5.4, look: W, sweep: 1.1, rate: 0.5, wait: 99 },
    ]);
    B.go([
      { x: 7.3, z: 6.5, look: -2.0, sweep: 0.5, wait: 1.0 },
      { x: 4.65, z: 5.3, look: W, sweep: 0.7, wait: 2.4, say: "Computer's still warm." },
      { x: 4.05, z: 4.3, wait: 0.2, look: W, open: D.bath },
      { x: 2.45, z: 4.75, look: W, sweep: 0.45, wait: 2.6, say: 'Bathroom.', pitch: 0.5 },
      { x: 2.45, z: 4.75, look: N, sweep: 0.5, wait: 1.5, pitch: 0.4 },
      { x: 2.45, z: 4.75, look: S, sweep: 0.5, wait: 1.5, pitch: 0.45 },
      { x: 4.05, z: 4.3, wait: 0 },
      { x: 4.15, z: 6.95, look: W, sweep: 0.2, wait: 3.6, fn: (a) => this.closetCheck(a) },
      { x: 4.5, z: 6.4, look: N, sweep: 0.9, rate: 0.6, wait: 99 },
    ]);
    C.go([{ x: 8.0, z: 7.25, look: N, sweep: 0.9, rate: 0.45, wait: 99, say: 'Clear left.' }]);
    // the third one walks in a little behind the others
    C.pos.z += 0.6; B.pos.z += 0.3;
  }
  closetCheck(a) {
    const door = G.apartment.doors.closet;
    if (door.angle > 0.5) { a.route.splice(a.ri + 1, 0, { x: 2.4, z: 6.95, look: W, sweep: 0.8, wait: 3, say: 'Closet.' }, { x: 4.15, z: 6.95, wait: 0 }); return; }
    G.tasks.delay(1.4, () => { if (this.phase === 'search') { sfx('click', { pos: door.worldPos(V()).setY(1), vol: 0.7, rate: 0.7 }); sfx('doorRattle', { pos: door.worldPos(V()).setY(1), vol: 0.25, rate: 1.2 }); } });
  }

  // ------------------------------------------------------------- hiding in the tub
  enterTub() {
    if (this.inTub || !(this.phase === 'raid' || this.phase === 'search')) return;
    const c = G.player.ctrl;
    this.inTub = true; this.tubT = 0; this.tubLook = { yaw: -Math.PI / 2 + 0.35, pitch: 0.12 };
    c.enabled = false; c.lookEnabled = false; c.setCrouch(true);
    c.teleport(0.38, 0.16, 4.8, c.yaw, 0);
    c.override = { pos: V(0.36, 0.44, 5.12), quat: this.tubQuat(), speed: 6 };
    G.body.visible = false;
    sfx('packetRustle', { pos: V(0.78, 1.2, 4.6), vol: 0.5, rate: 0.6 }); sfx('step_tile', { pos: V(0.4, 0.2, 4.7), vol: 0.3 });
    if (this.once('tubLine')) this.say("Behind the curtain. Don't breathe.", 1.2);
  }
  tubQuat() { return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.tubLook.pitch, this.tubLook.yaw, 0, 'YXZ')); }
  tub(dt) {
    const inp = G.input, c = G.player.ctrl;
    this.tubT += dt;
    this.tubLook.yaw = clamp(this.tubLook.yaw - inp.mdx * 0.002, -Math.PI / 2 - 0.9, -Math.PI / 2 + 1.3);
    this.tubLook.pitch = clamp(this.tubLook.pitch - inp.mdy * 0.002, -0.4, 0.9);
    if (c.override) c.override.quat.copy(this.tubQuat());
    if (this.tubT > 0.8 && ['KeyE', 'KeyW', 'Space', 'KeyC'].some((k) => inp.pressed(k)) && this.phase !== 'caught') this.leaveTub();
  }
  leaveTub(silent = false) {
    const c = G.player.ctrl;
    this.inTub = false;
    c.override = null; c.teleport(1.25, 0.05, 4.6, -Math.PI / 2, -0.05);
    c.enabled = c.lookEnabled = true; G.body.visible = true;
    if (!silent) sfx('packetRustle', { pos: V(0.78, 1.2, 4.6), vol: 0.4, rate: 0.7 });
  }

  // ------------------------------------------------------------- caught
  caught(by, atDoor = false) {
    if (this.phase === 'caught') return;
    this.phase = 'caught';
    this.run((w) => this.taken(w, by, atDoor));
  }
  async taken(w, by, atDoor) {
    const d = G.director, c = G.player.ctrl, R = this.raid;
    if (this.inTub) this.leaveTub(true);
    d.cutscene = true; d.drawTasks();
    c.enabled = false; c.lookEnabled = false;
    G.interact.enabled = true;
    this.underDoor = false;
    if (atDoor) { R.A.show(7.65, 8.55, Math.PI); R.B.show(7.2, 9.0, Math.PI); this.raid.active = true; }
    R.active = false;
    const bp = V().copy(c.body.position);
    const a = by || R.agents.filter((x) => x.on).sort((p, q) => p.pos.distanceTo(bp) - q.pos.distanceTo(bp))[0] || R.A;
    a.say(['There! Do not move!', "There he is! Don't move!"][Math.floor(Math.random() * 2)]);
    sfx('stinger', { vol: 0.7 }); G.fx.pulse('white', 0.5, 0.5);
    for (const x of R.agents) if (x.on) { const dir = x.pos.clone().sub(bp).setY(0).normalize().multiplyScalar(0.7); x.go([{ x: bp.x + dir.x, z: bp.z + dir.z, run: true, wait: 99, look: Math.atan2(-dir.x, -dir.z), sweep: 0.02, pitch: 0.25 }]); x.hearT = 0; }
    this.steer = a.from;
    await w(1.3);
    R.agents[1].on ? R.agents[1].say('Got him!') : a.say('Got him!');
    sfx('grab', { vol: 1 }); sfx('bodyFall', { vol: 0.9, delay: 0.25 }); sfx('pain', { vol: 0.8 });
    G.fx.pulse('shake', 1, 1.2); G.fx.pulse('red', 0.8, 1.4);
    this.steer = null;
    c.override = { pos: V(bp.x, 0.2, bp.z), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, c.yaw, 1.35, 'YXZ')), speed: 5 };
    G.body.visible = false;
    await w(1.2);
    sfx('radioChirp', { pos: a.pos.clone().setY(1.3), vol: 0.6 });
    this.speak('Subject secured. Bring him in.', VOICE.radio, { phone: true, pos: a.pos.clone().setY(1.3), vol: 0.6 });
    G.fx.fadeTo(1, 1.2);
    await w(3.6);
    this.raid.hideAll(); for (const l of this.lights) l.intensity = 0;
    if (this.heli) { this.heli.stop(1); this.heli = null; }
    c.override = null; this.phase = 'off';
    d.running = false;
    G.ending.start();   // their lab
  }

  // ------------------------------------------------------------- the call
  ring() { G.phone.ring({ work: false, name: '', voice: KIND, lines: [], script: (ph) => this.run((w) => this.call(w, ph)) }); }
  async call(w, phone) {
    const d = G.director, c = G.player.ctrl;
    this.answered = true;
    d.done('phone');
    c.enabled = false; G.interact.enabled = false;
    const line = async (s, after = 0.7) => { const h = this.speak(s, KIND, { phone: true, pos: phone.earPos(), vol: 0.75, distort: 2 }); await w(h.dur + after); };
    await w(0.8);
    await line('Alex? Please. Do not hang up.', 0.5);
    this.say('Who is this?'); await w(2.2);
    await line("A friend. We've been trying to reach you for a long time.");
    await line("That ship over the river isn't ours.", 0.4);
    this.say("Not theirs..."); await w(1.8);
    await line('The light that hunted you at night was never us. Ask the men who broke your door.', 0.4);
    this.say('The light was them. It was always them.'); await w(3);
    await line("What is growing in you isn't a weapon, Alex. It is a gift.", 0.4);
    this.say('A gift.'); await w(2.0);
    await line('They told the world we were monsters. Now they are telling it you are one.');
    await line('We only want peace. Will you meet us?', 0.3);
    await line('Take the elevator. Go up.', 0.2);
    const v = await G.hud.choose([{ label: 'Meet them', value: 'meet' }, { label: 'Hang up', value: 'hang' }]);
    if (!w.ok()) return;
    G.interact.enabled = true;
    if (v === 'meet') {
      await line("Thank you. We'll be waiting, Alex.", 0.4);
      phone.endPersonal();
      c.enabled = true;
      this.say('...up.', 0.6);
      await w(2.2);
      G.world.power = true; sfx('breaker', { pos: V(2.4, 1.45, 7.55), vol: 0.4 });
      G.building.hallLights.forEach((f) => (f.flicker = 0.5)); G.tasks.delay(1.6, () => G.building.hallLights.forEach((f, i) => (f.flicker = i === 0 ? 0.35 : 0)));
      this.say('The lights. Someone turned the lights back on.', 1.2);
      this.roof.showButton(true);
      this.phase = 'elevator';
      d.setTasks([{ id: 'roof', text: 'Take the elevator up' }]);
    } else {
      phone.endPersonal();
      c.enabled = true;
      this.say('No. No more voices.', 0.5);
      this.phase = 'refused';
      await w(6);
      this.comeBack(w);
    }
  }
  // hanging up: they were never far
  async comeBack(w) {
    const R = this.raid, c = G.player.ctrl;
    sfx('radioChirp', { pos: V(9, 1.3, 8.8), vol: 0.6 });
    for (let i = 0; i < 6; i++) sfx('step_carpet', { pos: V(11 - i * 0.5, 0.1, 8.8), vol: 0.7, delay: i * 0.22 });
    await w(1.2);
    this.hallSpeak('He came back!', VOICE.b);
    R.A.show(7.65, 9.0, Math.PI); R.B.show(8.2, 9.3, Math.PI);
    const bp = V().copy(c.body.position);
    for (const a of [R.A, R.B]) a.go([{ x: 7.65, z: 7.0, run: true, wait: 0 }, { x: bp.x, z: bp.z, run: true, wait: 99 }]);
    await w(2.4);
    this.caught(R.A);
  }

  // ------------------------------------------------------------- up
  async ride(w) {
    const b = G.building, e = b.el, d = G.director, c = G.player.ctrl;
    e.state = 'roofRide'; e.t = 0;
    this.phase = 'ride';
    this.roof.btnLed.emissiveIntensity = 2.2;
    d.done('roof');
    await w(2.6);
    b.drawIndicator('R'); sfx('click', { pos: G.camera.position, vol: 0.2, rate: 0.6 });
    G.player.ctrl.shake = 0.15;
    await w(3.2);
    if (b.rumble) { b.rumble.stop(0.5); b.rumble = null; }
    sfx('elevatorDing', { pos: V(7.65, 2.3, 10), vol: 0.6 });
    d.cutscene = true; d.drawTasks(); c.enabled = false;
    await G.fx.fadeTo(1, 1.4);
    this.arrive();
    await w(1.2);
    G.fx.fadeTo(0, 0.45);
    this.say('The roof.', 1.6);
  }

  // the roof, at night; the director's day stops here
  arrive() {
    const d = G.director, c = G.player.ctrl, b = G.building, cat = G.cat;
    d.running = false; d.cutscene = false;
    G.hud.objective([]);
    this.calm = true; this.phase = 'roof'; this.T = 0;
    G.uniforms.uBend.value.set(0, 0, 0, 0); G.uniforms.uWarp.value = 0.04; G.uniforms.uBreath.value = 0;
    G.world.power = false;                                 // nothing below may glow up through the slab
    b.el.state = 'idle'; b.el.open = 0; b.el.travelling = false; b.drawIndicator('4');
    this.roof.showButton(false);
    this.raid.hideAll();
    this.roof.enter(this.lights);
    G.sky.hemiBoost = 7.5; G.sky.windowBoost = 1;
    G.fx.setGrade({ saturation: 0.62, contrast: 1.12, exposure: 1.05, tint: V(0.97, 1.0, 0.95) });
    c.override = null; c.setCrouch(false);
    c.teleport(7.65, ROOF_Y + 0.05, 8.7, 0, 0.0);
    c.enabled = c.lookEnabled = true; G.body.visible = true;
    if (G.desk.seated) G.desk.stand();
    if (this.green < 0.75) G.tasks.tween(30, (k) => this.setGreen(lerp(0.64, 0.76, k)));
    // Mochi came up too
    if (!G.story.catFled && cat.present) {
      if (cat.held) cat.putDown();
      cat.leavePerch(); cat.jump = null; cat.fear = 0; cat.trust = Math.max(cat.trust, 0.6);
      cat.pos.set(8.25, ROOF_Y, 9.05); cat.h = 0; cat.yaw = 0.3; cat.path = null; cat.speed = 0;
      this.catGoal = null;
      cat.scripted = (ct, dt) => this.catOnRoof(ct, dt);
    }
  }
  catOnRoof(ct, dt) {
    ct.pos.y = ROOF_Y; ct.h = 0;
    if (this.catGoal && !ct.path && ct.pos.distanceTo(this.catGoal) > 0.2) { ct.path = [ct.pos.clone(), this.catGoal.clone()]; ct.pi = 1; ct.moveSpeed = 0.55; }
    if (!ct.path) ct.model.set({ sit: 1, crouch: 0, tailUp: 0.7, lid: 0.35, earFlat: 0, puff: 0, loaf: 0 });
    else ct.model.set({ sit: 0, tailUp: 0.9 });
  }

  onRoof(dt) {
    const c = G.player.ctrl, p = c.body.position, R = this.roof, [june, walt, dee, lou] = R.people;
    this.T += dt;
    const me = V(p.x, ROOF_Y + 1.55, p.z);
    const dist = Math.hypot(p.x - (june.root.position.x), p.z - june.root.position.z);
    // before Alex comes close they look at the city, at each other, at the door
    const city = V(4, ROOF_Y + 6, -400);
    if (this.phase === 'roof') {
      june.look = dist < 9 ? me : null; june.lookW = 1;
      walt.look = this.T % 14 < 7 ? city : (dist < 7 ? me : june.headWorld());
      dee.look = dist < 5.5 ? me : city;
      lou.look = this.T % 10 < 4 ? dee.headWorld() : me;
      if (dist < 5.5) for (const q of [walt, dee]) q.turnTo(Math.atan2(p.x - q.root.position.x, p.z - q.root.position.z) * 0.6 + q.homeRy * 0.4, 1.2, dt);
      if (dist < 3.5 || this.T > 45) { this.phase = 'meet'; this.run((w) => this.meet(w)); }
    }
    if (this.walkTo) {
      const q = this.walkTo.who, tgt = this.walkTo.to, rp = q.root.position, dx = tgt.x - rp.x, dz = tgt.z - rp.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const sp = Math.min(0.8, d * 2); rp.x += dx / d * sp * dt; rp.z += dz / d * sp * dt; q.speed = sp; q.turnTo(Math.atan2(dx, dz), 5, dt); } else { q.speed = 0; this.walkTo = null; }
    }
    if (this.phase === 'meet' || this.phase === 'hand') for (const q of R.people) { if (q !== this.walkTo?.who) q.turnTo(Math.atan2(p.x - q.root.position.x, p.z - q.root.position.z), 1.6, dt); }
  }

  async meet(w) {
    const c = G.player.ctrl, R = this.roof, [june, walt, dee, lou] = R.people, cat = G.cat;
    c.enabled = false; c.lookEnabled = false;
    const p = V().copy(c.body.position), me = V(p.x, ROOF_Y + 1.5, p.z);
    for (const q of R.people) { q.look = me; q.lookW = 1; }
    // she comes forward a step
    const jp = june.root.position, dir = V(p.x - jp.x, 0, p.z - jp.z), dd = dir.length();
    this.walkTo = { who: june, to: jp.clone().addScaledVector(dir.normalize(), Math.max(0, Math.min(1.2, dd - 1.9))) };
    this.steer = june.headWorld();
    await w(2.2);
    this.steer = june.headWorld();
    const talk = async (who, s, voice, after = 0.8) => { const h = this.speak(s, voice, { pos: who.headWorld(), vol: 0.95 }); await w(h.dur + after); };
    await talk(june, 'Hello, Alex.', KIND, 0.6);
    this.say("It's her. The voice on the phone."); await w(2.6);
    await talk(june, "Don't be afraid. We're just like you.", KIND, 0.3);
    this.say('Just like me?'); await w(1.6);
    june.hold = 0; G.tasks.tween(0.8, (k) => (june.reach = k * 0.35));
    await talk(june, 'Only... a different color.', KIND, 0.6);
    G.tasks.tween(0.8, (k) => (june.reach = 0.35 * (1 - k)));
    this.say('A different colour.'); await w(1.4);
    // Alex's own hands
    this.steer = null;
    const y0 = c.pitch;
    G.tasks.tween(1.4, (k) => (c.pitch = lerp(y0, -0.95, k)), easeInOut);
    const body = G.body, hands = (k) => {
      const q = body.root.quaternion, F = V(0, 0, -1).applyQuaternion(q);
      body.override.R = { p: body.root.localToWorld(V(0.12, 1.08, -0.34)), F: F.clone().add(V(0, 0.15, 0)).normalize(), N: V(0, 1, 0), pose: 'open', w: k };
      body.override.L = { p: body.root.localToWorld(V(-0.12, 1.08, -0.34)), F: F.clone().add(V(0, 0.15, 0)).normalize(), N: V(0, 1, 0), pose: 'open', w: k };
    };
    G.tasks.tween(1.4, hands);
    await w(1.6);
    this.say('Like mine.'); await w(2.6);
    G.tasks.tween(1.0, (k) => hands(1 - k), null, () => { body.override.R = body.override.L = null; });
    G.tasks.tween(1.2, (k) => (c.pitch = lerp(-0.95, -0.05, k)), easeInOut);
    await w(1.2);
    this.steer = walt.headWorld();
    await talk(walt, 'They told the whole world we were monsters.', WALT, 0.3);
    await talk(walt, "And now they'll tell it you were one too.", WALT, 0.6);
    this.steer = june.headWorld();
    await talk(june, 'You were never a disgrace, Alex. And you are not alone.', KIND, 0.8);
    if (cat.present && cat.scripted) {
      this.catGoal = jp.clone().add(V(0.35, ROOF_Y, 0.4)).setY(ROOF_Y);
      cat.meow('trill');
      await w(3.2);
      june.look = cat.pos.clone().setY(ROOF_Y + 0.2); this.steer = cat.pos.clone().setY(ROOF_Y + 0.25);
      cat.model.slowBlink();
      this.say('Mochi likes her.'); await w(2.6);
      june.look = me; this.steer = june.headWorld();
      await talk(june, 'Come with us. Both of you.', KIND, 0.4);
    } else await talk(june, 'Come with us.', KIND, 0.4);
    // she holds out her hand
    G.tasks.tween(1.2, (k) => (june.reach = k), easeInOut);
    await w(1.2);
    this.steer = june.handWorld('R').add(V(0, 0.15, 0));
    await w(1.0);
    this.steer = null;
    c.lookEnabled = true;
    this.phase = 'hand';
    if (!this.handBtn) {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 1.05, 0.45); june.root.add(hit);
      this.handBtn = new Button(hit, { name: 'hand', reach: 3, label: () => (this.phase === 'hand' ? 'Take her hand' : null), onUse: () => { if (this.phase === 'hand') { this.phase = 'end'; this.run((w2) => this.end(w2)); } } });
    }
    this.handBtn.enabled = true;
    G.hud.objective([{ text: 'Take her hand   [E]' }]);
  }

  async end(w) {
    const c = G.player.ctrl, june = this.roof.people[0];
    G.hud.objective([]);
    c.lookEnabled = false;
    this.handBtn.enabled = false;
    G.body.override.R = { p: june.handWorld('R'), F: V(0, 0, -1).applyQuaternion(G.body.root.quaternion), N: V(0, -1, 0), pose: 'grip', w: 1 };
    this.steer = june.headWorld();
    sfx('warmChord', { vol: 0.8 });
    this.say('Okay.', 0.8);
    await w(2.4);
    G.engine.fx.whiteColor.set(0.82, 1.0, 0.86);
    G.fx.whiteTo(1, 0.22);
    await w(5.5);
    await G.fx.fadeTo(1, 1.2);
    G.body.override.R = null; this.steer = null;
    this.roof.leave();
    G.fx.whiteTo(0, 3);
    G.state = 'ending';
    clearSave();
    await G.hud.titleCard('July 2nd', 'It was a Friday.', 5.5);
    await G.hud.titleCard('bengrim', '', 4.5);
    location.reload();
  }

  // ------------------------------------------------------------- debug: ?day=7&peace=morning|mirror|hide|search|call|elevator|roof|meet
  async debug(ph) {
    const d = G.director;
    if (G.story.day !== 7 || !d.running) { G.state = 'play'; G.menu && G.menu.close && G.menu.close(); d.startDay(7); }
    if (!this.woke) while (!d.alarmRinging) await G.tasks.wait(0.2);   // let the dawn reach the alarm first
    this.woke = true;
    this.seq++; this.raid.hideAll(); this.underDoor = false; if (this.inTub) this.leaveTub(true);
    const c = G.player.ctrl;
    d.alarmRinging = false; clearTimeout(d.alarmT); d.inBed = false; d.cutscene = false;
    c.override = null; c.overrideBlend = 0; G.body.visible = true; c.enabled = c.lookEnabled = true;
    G.hud.crosshair(true);
    d.beginRoutine();
    this.done.add('wake');
    if (ph === 'morning') return;
    if (ph === 'mirror') { c.teleport(2.2, 0.05, 4.75, 0, -0.05); return; }
    this.toNight();
    if (ph === 'hide' || ph === 'search') {
      c.teleport(2.6, 0.05, 5.0, -Math.PI / 2, 0); d.setTasks([]); this.phase = 'night';
      if (ph === 'hide') this.run((w) => this.raidSeq(w, true));
      else { this.phase = 'raid'; G.world.power = false; this.tubBtn.enabled = true; d.setTasks([{ id: 'hide', text: 'Hide' }]); this.run((w) => this.searchSeq(w)); }
      return;
    }
    const front = G.apartment.doors.front; front.locked = false; front.setAngle(1.55);
    if (ph === 'call') { c.teleport(4.6, 0.05, 5.6, Math.PI / 2, -0.1); d.done('hide'); this.phase = 'call'; this.answered = false; G.world.power = false; this.ring(); d.setTasks([{ id: 'phone', text: 'Answer the phone' }]); return; }
    if (ph === 'elevator') { c.teleport(7.65, 0.05, 9.2, 0, 0); this.roof.showButton(true); this.phase = 'elevator'; d.setTasks([{ id: 'roof', text: 'Take the elevator up' }]); G.building.callElevator(); return; }
    this.arrive();
    if (ph === 'meet') c.teleport(7.5, ROOF_Y + 0.05, 6.9, 0, 0);
  }
}
