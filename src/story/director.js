// The Director runs the loop: seven mornings that are all July 1st, 1999.
// It owns the clock, the daily reset, the routine tasks, the scripted events
// of each day, sleep, blackouts and death (which simply starts the day again).
import * as THREE from 'three';
import { G, emit, on } from '../core/globals.js';
import { clamp, damp, lerp, pick, smoothstep } from '../core/util.js';
import { writeSave } from '../core/save.js';
import { Button } from '../world/interactables.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const say = (t, d = 0) => (d ? setTimeout(() => G.hud.inner(t), d * 1000) : G.hud.inner(t));

const START = 7 * 60, END = 23 * 60;
const RATE = 2.0;                                   // game minutes per real second
const MUT = [null,
  { belly: 0.05, pale: 0, veins: 0, blackVeins: 0, bruise: 0, sweat: 0.1, nailDark: 0, glow: 0, split: 0, hem: 0.86 },
  { belly: 0.16, pale: 0.1, veins: 0.06, blackVeins: 0, bruise: 0.05, sweat: 0.15, nailDark: 0, glow: 0, split: 0, hem: 0.84 },
  { belly: 0.32, pale: 0.25, veins: 0.2, blackVeins: 0, bruise: 0.15, sweat: 0.3, nailDark: 0.1, glow: 0, split: 0, hem: 0.8 },
  { belly: 0.5, pale: 0.45, veins: 0.45, blackVeins: 0.1, bruise: 0.3, sweat: 0.45, nailDark: 0.35, glow: 0, split: 0, hem: 0.76 },
  { belly: 0.68, pale: 0.6, veins: 0.6, blackVeins: 0.3, bruise: 0.45, sweat: 0.5, nailDark: 0.55, glow: 0.05, split: 0, hem: 0.72 },
  { belly: 0.85, pale: 0.75, veins: 0.75, blackVeins: 0.55, bruise: 0.55, sweat: 0.6, nailDark: 0.8, glow: 0.12, split: 0, hem: 0.68 },
  { belly: 1.0, pale: 0.85, veins: 0.9, blackVeins: 0.8, bruise: 0.6, sweat: 0.7, nailDark: 1, glow: 0.3, split: 0.08, hem: 0.62 },
];
const HUNGER0 = [0, 0.35, 0.42, 0.52, 0.6, 0.66, 0.78, 0.82];
const WAKE_LINE = [null, '...just a nightmare.', 'I had the strangest dream. That I already lived today.', 'July first. Again.', 'Something is pressing up against my ribs from the inside.', 'I can hear it breathing. In me.', 'So hungry. So, so hungry.', "It's time. I don't know how I know that."];
const RADIO = [null,
  "Good morning, it's seven o'clock on Thursday, July first. Officials say the lights seen over the harbor last night were weather balloons. Expect a high of ninety one.",
  "Good morning, it's seven o'clock on Thursday, July first. Officials say the lights seen over the harbor last night were weather balloons. Expect a high of ninety one.",
  "Good morning, it's seven o'clock on Thursday, July first. Officials say the lights seen over the harbor last night were weather balloons. Expect a high of ninety one. Again.",
  "Good morning. It's seven o'clock. It's July first. It's July first. Officials say there is nothing over the harbor. Stay inside. Keep your lights off.",
  "July first. July first. The lights over the harbor are weather balloons. The lights over the harbor are looking for you.",
  "Subject zero four one nine. Good morning. Appetite critical. Please continue your routine.",
  "This is a federal emergency statement. Alex Bengrim, of apartment four B, Harborview Towers, is contaminated. A danger to the public. A disgrace. Do not approach. Report all sightings.",
];

export class Director {
  constructor() {
    this.minutes = START;
    this.day = 1;
    this.cutscene = false;
    this.alarmRinging = false; this.alarmGlitch = null;
    this.tasks = [];
    this.flags = {};
    this.once = new Set();
    this.timers = [];
    this.bendPulse = 0;
    this.running = false;
    G.director = this;
    this.listen();
    this.makeBed();
  }

  // ------------------------------------------------------------- clock
  clockMinutes() { return this.minutes; }
  get hour() { return this.minutes / 60; }
  get nightness() { return smoothstep(19.2 * 60, 21.2 * 60, this.minutes); }
  get t01() { return clamp((this.minutes - START) / (END - START), 0, 1); }

  // ------------------------------------------------------------- tasks
  setTasks(list) { this.tasks = list.map((t) => (typeof t === 'string' ? { id: t, text: t, done: false } : { done: false, ...t })); this.drawTasks(); }
  addTask(id, text) { if (!this.tasks.find((t) => t.id === id)) { this.tasks.push({ id, text, done: false }); this.drawTasks(); sfx('pageTurn', { vol: 0.25 }); } }
  done(id) { const t = this.tasks.find((x) => x.id === id); if (t && !t.done) { t.done = true; this.drawTasks(); emit('taskDone', id); } }
  isDone(id) { const t = this.tasks.find((x) => x.id === id); return !!(t && t.done); }
  drawTasks() { G.hud.objective(this.cutscene ? [] : this.tasks); }
  setText(id, text) { const t = this.tasks.find((x) => x.id === id); if (t) { t.text = text; this.drawTasks(); } }

  listen() {
    on('ateEggs', () => this.done('eat'));
    on('ate', () => { if (this.day >= 3) this.done('eat'); });
    on('catFed', () => this.done('cat'));
    on('callEnded', () => this.updateWorkTask());
    on('trashOut', () => this.done('trash'));
    on('window', (e) => { if (e.open) this.onWindowOpened(e.key); });
    on('starveBlackout', () => this.blackout('hunger'));
    on('4Aopen', () => { this.flags.opened4A = true; });
    on('hallLoop', (n) => this.onHallLoop(n));
    on('elevatorArrived', () => { this.flags.rodeElevator = true; });
    on('mailRead', (m) => { if (this.day >= 2 && !this.once.has('mailDeja' + this.day) && m && m.subject === 'Welcome back!') { this.once.add('mailDeja' + this.day); say(this.day === 2 ? 'Didn\'t I read this yesterday?' : this.day === 3 ? 'The same email. Word for word.' : 'Welcome back. Welcome back. Welcome back.', 1.5); } });
    on('callAnswered', (def) => {
      if (this.day >= 2 && def && /doris|kevin|gerald/.test(def.id) && !this.once.has('deja' + def.id)) {
        this.once.add('deja' + def.id);
        const n = def.name.split(' ')[0];
        say(this.day === 2 ? `${n}... ${n} called yesterday. Same problem.` : this.day === 3 ? `${n} again. Every morning. The same words.` : `I know exactly what ${n} is going to say.`, 4);
      }
    });
  }
  updateWorkTask() {
    const sup = G.os && G.os.apps.support;
    if (!sup) return;
    const n = sup.handledToday, tot = sup.todays.length;
    this.setText('work', `Work: take calls (${Math.min(n, tot)}/${tot})`);
    if (n >= tot) this.done('work');
  }

  makeBed() {
    const ap = G.apartment;
    const g = new THREE.Group(); g.position.copy(ap.bedInfo.center); G.world.root.add(g);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
    hit.rotation.y = Math.PI / 2; g.add(hit);
    this.bedBtn = new Button(g, {
      name: 'bed',
      label: () => (this.cutscene || this.day >= 7 ? null : this.canSleep() ? 'Go to sleep' : 'Bed'),
      onUse: () => { if (this.canSleep()) this.sleep(); else say(this.hour < 12 ? "It's morning. I just got up." : "I'm not tired yet. There's still work to do."); },
    });
  }
  canSleep() { return this.hour >= 20 || (this.hour >= 17 && this.isDone('work')); }

  // ------------------------------------------------------------- day flow
  async startDay(day, { fromDeath = false } = {}) {
    this.running = true;
    this.day = day; G.story.day = day;
    this.minutes = START;
    this.flags = {}; this.once.clear();
    for (const t of this.timers) clearTimeout(t); this.timers = [];
    this.cutscene = true; this.drawTasks();
    G.fx.fadeTo(1, 50);
    // the world goes back to July 1st
    G.apartment.resetDay();
    G.building.resetDay && G.building.resetDay(day);
    if (G.desk.seated) G.desk.stand();
    G.desk.os.powerOff();
    G.apartment.setCalendar(1);
    G.sky.apply(G.sky.preset(day, 0), true);
    G.body.setMutation({ ...MUT[day], bloodHands: day >= 4 ? 0.15 : 0, bloodMouth: 0, bloodShirt: day >= 5 ? 0.25 : 0 });
    G.player.hunger.value = HUNGER0[day];
    G.player.hunger.starveT = 0;
    G.uniforms.uWarp.value = [0, 0, 0, 0.04, 0.1, 0.18, 0.3, 0.55][day];
    G.uniforms.uBreath.value = day >= 7 ? 0.35 : day >= 6 ? 0.12 : 0;
    // sallow, sickly light from the first morning, draining further each day
    G.fx.setGrade({ saturation: [0, 0.62, 0.58, 0.54, 0.5, 0.46, 0.42, 0.38][day], contrast: 1.2 + day * 0.012, exposure: 0.84 - day * 0.01, tint: new THREE.Vector3(0.95 - day * 0.004, 0.98 - day * 0.01, 0.9 - day * 0.015) });
    G.fx.clear('day'); G.fx.clear('bend');
    // the cat
    const cat = G.cat;
    if (G.story.catFled) { cat.present = false; }
    else {
      cat.present = true; cat.scripted = null; cat.held = false;
      cat.trust = G.story.catTrust;
      cat.fear = [0, 0, 0.05, 0.15, 0.3, 0.45, 0.55, 0.4][day];
      cat.pos.set(1.9, 0, 2.25); cat.h = 0; cat.perch = null; cat.jump = null; cat.path = null;
      const bedPerch = cat.perches.find((p) => p.name === 'bed');
      if (bedPerch) { cat.perch = bedPerch; cat.pos.copy(bedPerch.pos); cat.h = bedPerch.h ?? 0.55; }
      cat.setBehavior('sleep', { spot: { perch: 'bed' } });
    }
    G.peace && G.peace.startDay(day);
    this.wakeInBed();
    writeSave({ day, story: G.story });
    await G.tasks.wait(fromDeath ? 1.6 : 0.6);
    G.fx.fadeTo(0, 0.6);
    this.alarmStart();
    this.cutscene = true;
    this.inBed = true;
    this.setTasks([{ id: 'alarm', text: 'Turn off the alarm   [E]' }]);
    this.cutsceneTasksVisible();
  }
  cutsceneTasksVisible() { const c = this.cutscene; this.cutscene = false; this.drawTasks(); this.cutscene = c; }

  wakeInBed() {
    const ap = G.apartment, pl = G.player, c = pl.ctrl;
    const pil = ap.bedInfo.pillow;
    c.teleport(1.3, 0.05, 3.25, -Math.PI / 2, 0);
    c.enabled = false; c.lookEnabled = false;
    this.lieLook = { yaw: 0, pitch: 0 };
    this.liePos = V(pil.x + 0.1, pil.y + 0.12, pil.z);
    c.override = { pos: this.liePos.clone(), quat: this.lieQuat(), speed: 50 };
    c.overrideBlend = 1; c.lastOverride = c.override;
    G.body.visible = false;
  }
  lieQuat() {
    // lying on the back, head at the pillow (west), looking at the ceiling
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.62 + this.lieLook.pitch, -Math.PI / 2 + this.lieLook.yaw, 0.12, 'YXZ'));
    return q;
  }
  alarmStart() {
    this.alarmRinging = true;
    const pos = V(0.28, 0.6, 1.32);
    const ring = () => { if (!this.alarmRinging) return; sfx('alarmBeep', { pos, vol: 0.55 }); this.alarmT = setTimeout(ring, 1100); };
    ring();
    // the clock radio: the same broadcast every morning
    this.timers.push(setTimeout(() => {
      if (!this.running) return;
      sfx('radioTune', { pos, vol: 0.4 });
      const line = RADIO[this.day];
      const h = G.audio && G.audio.speak(line, { voice: this.day === 6 ? 'machine' : 'man', phone: true, pos, vol: 0.55, distort: 3 });
      G.hud.say(line, { who: 'radio', cls: this.day >= 5 ? 'strange' : 'voice', dur: h && h.dur ? h.dur + 1 : 9 });
    }, 2500));
  }
  stopAlarm() {
    if (!this.alarmRinging) return;
    this.alarmRinging = false; clearTimeout(this.alarmT);
    sfx('click', { pos: V(0.28, 0.6, 1.32), vol: 0.6 });
    this.done('alarm');
    if (this.inBed) this.getUp();
  }
  async getUp() {
    this.inBed = false;
    const c = G.player.ctrl;
    const sitQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, -Math.PI / 2 + 0.6, 0, 'YXZ'));
    c.override = { pos: V(1.1, 1.05, 3.0), quat: sitQ, speed: 2.2 };
    await G.tasks.wait(1.6);
    sfx('breath', { vol: 0.35 });
    say(WAKE_LINE[this.day]);
    await G.tasks.wait(1.4);
    c.yaw = -Math.PI / 2 + 0.6; c.pitch = -0.15;
    c.override = null;
    G.body.visible = true;
    c.enabled = true; c.lookEnabled = true;
    this.cutscene = false;
    this.beginRoutine();
  }

  // the routine is the same every day; each day adds its own things
  beginRoutine() {
    const d = this.day;
    if (d === 1) { this.setTasks([{ id: 'window', text: 'Open a window. I need air.' }]); return; }
    const list = [];
    if (d <= 5) list.push({ id: 'coffee', text: 'Make coffee' });
    list.push({ id: 'eat', text: d >= 4 ? 'Eat. Eat something. Anything.' : 'Eat breakfast' });
    if (!G.story.catFled) list.push({ id: 'cat', text: 'Feed Mochi' });
    if (d <= 6) list.push({ id: 'work', text: 'Work: take calls (0/' + (G.os.apps.support ? G.os.apps.support.todays.length : 3) + ')' });
    if (d === 2) list.push({ id: 'trash', text: 'Take out the trash (chute, end of the hall)' });
    if (d === 7) { list.length = 0; list.push({ id: 'mirror', text: 'Look in the mirror' }); }
    this.setTasks(list);
    this.updateWorkTask();
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    if (!this.running) return;
    const pl = G.player, c = pl.ctrl;
    // lying in bed: look around a little, E stops the alarm
    if (this.inBed) {
      this.lieLook.yaw = clamp(this.lieLook.yaw - G.input.mdx * 0.002, -0.9, 0.9);
      this.lieLook.pitch = clamp(this.lieLook.pitch - G.input.mdy * 0.002, -0.5, 0.35);
      c.override.quat.copy(this.lieQuat());
      if (G.input.pressed('KeyE') || G.input.mousePressed(0)) this.stopAlarm();
    }
    // clock
    if (!this.cutscene && !this.inBed) {
      const sup = G.os && G.os.apps.support;
      const onCall = sup && sup.call && sup.call.state === 'active';
      this.minutes = Math.min(END, this.minutes + dt * RATE * (onCall ? 0.35 : 1));
      if (this.minutes >= END && !this.ending && this.day < 7) this.forceSleep();
    }
    G.sky.apply(G.sky.preset(this.day, this.t01));
    if (G.phone) G.phone.checkPersonal(this.day, this.hour);
    // coffee
    if (pl.hunger.coffeeT > 0) this.done('coffee');
    this.liminal(dt);
    this.dayScript(dt);
  }
  clockText() {
    const m = Math.floor(this.minutes), h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  // reality bends: the hallway stretches away, rooms tilt and roll
  liminal(dt) {
    const d = this.day;
    const z = G.world.zoneAt(G.player.ctrl.body.position);
    const inHall = z && (z.name === 'hall');
    const t = G.time;
    let sx = 0, cy = 0, tw = 0;
    if (inHall) {
      sx = [0, 0, 0.12, 0.4, 0.3, 0.85, 0.55, 1.1][d];
      cy = d >= 5 ? Math.sin(t * 0.21) * 0.35 : d >= 3 ? Math.sin(t * 0.17) * 0.1 : 0;
      tw = d >= 5 ? Math.sin(t * 0.13) * 0.35 : 0;
      if (d >= 7) { cy += Math.sin(t * 0.4) * 0.3; tw += 0.4; }
    } else if (d >= 3) {
      // occasional pulses indoors
      this.bendPulse -= dt;
      if (this.bendPulse <= 0 && !this.cutscene) {
        this.bendPulse = [0, 0, 0, 55, 40, 30, 22, 14][d] + Math.random() * 20;
        this.pulseT = 0;
        sfx('tinnitus', { vol: 0.25 });
      }
      if (this.pulseT !== undefined && this.pulseT < 6) {
        this.pulseT += dt;
        const k = Math.sin(Math.PI * clamp(this.pulseT / 6, 0, 1));
        sx = k * (0.15 + d * 0.04); cy = k * (d >= 5 ? 0.25 : 0.1) * Math.sin(t * 0.5); tw = k * (d >= 6 ? 0.25 : 0);
      }
      if (d >= 6) { sx += 0.05 + Math.sin(t * 0.3) * 0.04; tw += Math.sin(t * 0.11) * 0.08; }
      if (d >= 7) { sx += 0.15; cy += Math.sin(t * 0.25) * 0.15; tw += Math.sin(t * 0.19) * 0.25; }
    }
    if (G.peace && G.peace.calm) sx = cy = tw = 0;   // day 7, after the mirror: the world holds still
    const u = G.uniforms.uBend.value;
    u.x = damp(u.x, sx, 1.2, dt); u.y = damp(u.y, cy, 1.2, dt); u.z = damp(u.z, tw, 1.2, dt);
  }

  // ------------------------------------------------------------- daily scripts
  at(key, hour, fn) { if (!this.once.has(key) && this.hour >= hour && !this.cutscene) { this.once.add(key); fn(); } }
  when(key, cond, fn) { if (!this.once.has(key) && !this.cutscene && cond()) { this.once.add(key); fn(); } }
  zone() { const z = G.world.zoneAt(G.player.ctrl.body.position); return z ? z.name : 'outside'; }
  dayScript(dt) {
    const d = this.day;
    const inApt = () => { const z = G.world.zoneAt(G.player.ctrl.body.position); return z && z.apt; };
    // evening: go to bed
    this.at('bedTask', d === 7 ? 99 : 19.5, () => this.addTask('sleep', 'Go to bed'));
    // night: the neighbour's TV through the wall... until there is no neighbour
    this.at('tvWall', 21, () => { if (d <= 2) this.tvWall = G.audio && G.audio.loop('tvBabble', { pos: V(-0.4, 1.2, 4.5), vol: 0.5 }); });
    // stomach movements from day 3
    if (d >= 3) {
      this.kickT = (this.kickT ?? 20) - dt;
      if (this.kickT <= 0 && !this.cutscene) { this.kickT = [0, 0, 0, 40, 28, 20, 14, 10][d] + Math.random() * 15; G.body.stomachPulse(0.5 + d * 0.1); if (Math.random() < 0.35) say(pick(['It moved.', 'Something kicked.', 'Stop. Please stop.', "It's turning over."]), 0.8); if (d >= 5 && Math.random() < 0.3) G.body.armCrawl(Math.random() < 0.5 ? 'L' : 'R', 1); }
    }
    // coughing blood from day 4
    if (d >= 4) {
      this.coughT = (this.coughT ?? 50) - dt;
      if (this.coughT <= 0 && !this.cutscene) { this.coughT = 45 + Math.random() * 40 - d * 4; this.coughBlood(); }
    }
    if (d === 1) this.day1(dt);
    if (d === 2) this.day2(dt);
    if (d === 3) this.day3(dt);
    if (d === 4) this.day4(dt);
    if (d === 5) this.day5(dt);
    if (d === 6) this.day6(dt);
    if (d === 7) this.day7(dt);
    G.alien && G.alien.update(dt);
  }

  coughBlood() {
    G.body.cough(true);
    sfx('coughWet', { vol: 0.8 });
    emit('noise', { pos: new THREE.Vector3().copy(G.player.ctrl.body.position), loud: 0.35, kind: 'cough' });
    setTimeout(() => {
      const c = G.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      const p = c.position.clone().addScaledVector(f, 0.5); p.y = 0.002;
      G.decals && G.decals.blood && G.decals.blood(p, 0.15 + Math.random() * 0.1);
      G.body.setMutation({ bloodHands: Math.min(1, (G.body.u.uBloodHands.value || 0) + 0.25), bloodMouth: 0.6 });
      G.fx.pulse('red', 0.5, 1.2);
      if (!this.once.has('coughLine')) { this.once.add('coughLine'); say("That's blood. That's a lot of blood.", 1.2); }
    }, 700);
  }

  // DAY 1 - normal routine. The window. A distant roar.
  day1() {
    this.at('roar1', 15, () => this.distantRoar());
    this.when('day1Tasks', () => this.flags.blinded, () => {});
  }
  onWindowOpened(key) {
    if (this.day === 1 && !this.flags.blinded && !this.cutscene) { this.flags.blinded = true; this.blinded(key); }
    if (this.day >= 3 && this.nightness > 0.5) { say("I shouldn't have the window open at night.", 0.5); G.alien && G.alien.attract(0.4); }
    if (this.day === 7) this.toWindow(key);
  }
  async blinded(key) {
    this.done('window');
    const c = G.player.ctrl;
    this.cutscene = true; this.drawTasks();
    c.enabled = false; c.lookEnabled = false;
    // the light is wrong. white. it goes straight through the eyes.
    G.fx.whiteTo(1, 0.9);
    G.engine.fx.exposure = 3;
    sfx('tinnitus', { vol: 0.7 });
    await G.tasks.wait(0.9);
    sfx('scream', { vol: 0.9 });
    G.fx.pulse('shake', 1, 1.4);
    await G.tasks.wait(1.4);
    // collapse
    const w = G.apartment.windows[key].frame.group.position;
    const floorPos = V(w.x + 0.2, 0.16, w.z + 0.9);
    c.override = { pos: floorPos, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, Math.PI + 0.4, 1.35, 'YXZ')), speed: 3.5 };
    sfx('bodyFall', { vol: 0.9 });
    G.body.visible = false;
    await G.tasks.wait(0.6);
    G.fx.whiteTo(0, 3);
    G.fx.fadeTo(1, 2.5);
    await G.tasks.wait(3.5);
    this.minutes = 7 * 60 + 40;
    // wake on the floor: Mochi licking your face
    const cat = G.cat;
    if (cat.present) {
      const head = floorPos.clone();
      cat.scripted = (ct) => {
        ct.pos.set(head.x - 0.3, 0, head.z + 0.05); ct.h = 0; ct.path = null; ct.yaw = Math.atan2(-(head.x - ct.pos.x), -(head.z - ct.pos.z));
        ct.model.set({ sit: 0, crouch: 0.35, eat: 0.6, headPitch: 0.2, lid: 0.7, tailUp: 0.6, purr: 1 });
        if (Math.random() < 0.03) ct.model.lick();
      };
    }
    G.fx.fadeTo(0.35, 1.2);
    await G.tasks.wait(1.5);
    if (cat.present) { cat.meow('meow'); cat.model.lick(); }
    G.fx.fadeTo(0, 0.8);
    say('Mochi...?');
    await G.tasks.wait(2.6);
    say('What the hell was that. The light went right through me.');
    await G.tasks.wait(2.8);
    cat.scripted = null; if (cat.present) cat.setBehavior('greet');
    c.teleport(floorPos.x, 0.05, floorPos.z + 0.3, Math.PI, -0.1);
    c.override = null; G.body.visible = true;
    c.enabled = true; c.lookEnabled = true;
    this.cutscene = false;
    G.apartment.windows[key].target = 0;
    this.setTasks([
      { id: 'coffee', text: 'Make coffee' },
      { id: 'eat', text: 'Eat breakfast (eggs in the fridge)' },
      { id: 'cat', text: 'Feed Mochi (food under the counter)' },
      { id: 'work', text: 'Work: take calls (0/3)' },
    ]);
  }
  distantRoar() {
    sfx('roarFar', { vol: 0.9, occlude: false });
    G.fx.pulse('shake', 0.6, 3);
    G.player.ctrl.shake = 0.6;
    emit('noise', { pos: V(5, 1, -40), loud: 1.2, kind: 'roar' });
    for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.35 });
    say(this.day === 1 ? 'What... was that?' : this.day === 2 ? 'That sound again. At the same time as yesterday.' : 'Right on time.', 3.2);
  }

  // DAY 2 - the same day. The trash. 4A is empty.
  day2() {
    this.at('roar2', 15, () => this.distantRoar());
    const b = G.building;
    this.when('4Aajar', () => this.flags && G.story.flags.trashOut === 2, () => {
      const d4A = b.doors['4A']; d4A.locked = false; d4A.target = 0.35;
      sfx('doorCreak', { pos: d4A.worldPos(V()), vol: 0.6, rate: 0.6 });
      say("4A's door is open.", 1.0);
      this.addTask('4A', 'Check on 4A');
    });
    this.when('in4A', () => this.zone() === '4A', () => {
      sfx('stinger', { vol: 0.5 });
      say('Where is everything? I heard their TV last night.', 0.6);
      say('Just one chair.', 4.5);
      this.done('4A');
      if (this.tvWall) { this.tvWall.stop(1); this.tvWall = null; }
    });
    this.at('knock2', 22, () => { if (this.zone() !== 'hall') { const p = V(7.65, 1.2, 8.0); sfx('knocks', { pos: p, vol: 0.9 }); say('Who is knocking at this hour?', 1.5); } });
  }

  // DAY 3 - strange callers, distorted rooms, it moves, the hunger
  day3() {
    this.at('roar3', 15, () => this.distantRoar());
    // while you're not looking, every cup in the apartment lines up on the floor
    this.when('cups', () => this.hour > 11 && this.zone() !== 'main', () => this.lineUpCups());
    this.when('cupsSeen', () => this.flags.cupsLined && this.zone() === 'main', () => { sfx('stinger', { vol: 0.5 }); say('Who did this?', 1); say("I live alone. I live alone with a cat.", 4); });
  }
  lineUpCups() {
    const cups = G.world.items.filter((i) => ['mug', 'glass', 'soup', 'beans', 'cola', 'catCan', 'apple'].includes(i.type) && !i.prop.held && G.player.inv.hand !== i);
    cups.slice(0, 12).forEach((it, k) => {
      const x = 5.0 + k * 0.32, z = 3.6;
      it.body.position.set(x, 0.08, z); it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
      it.body.quaternion.set(0, 0, 0, 1); it.body.sleep && it.body.sleep();
    });
    this.flags.cupsLined = true;
  }

  // DAY 4 - mutations, blood, the reflection
  day4() {
    this.at('roar4', 15, () => this.distantRoar());
    this.when('mirror4', () => G.mirror && G.mirror.seen > 1.2, () => { sfx('stinger', { vol: 0.6 }); say('My reflection... it was late.', 0.5); });
  }

  // DAY 5 - Mochi gets out. The hallway has no ends. Every door is 4B.
  day5() {
    const b = G.building, cat = G.cat;
    this.when('catEscape', () => this.hour >= 10.5 && cat.present && !cat.held && this.zone() !== 'hall', () => this.catEscapes());
    this.when('hallMaze', () => this.flags.catOut && this.zone() === 'hall', () => {
      b.loop = true; b.setPlates(true);
      b.hallLights.forEach((f, i) => { f.flicker = i % 2 ? 0.8 : 0.3; f.dim = 0.6; });
      say('Mochi! Here, kitty...', 0.6);
      this.timers.push(setTimeout(() => cat.meow('meowPlead'), 3000));
    });
    this.when('found', () => this.flags.catOut && cat.held, () => { this.done('find'); say("I've got you. I've got you. Let's go home.", 0.5); b.loop = false; b.setPlates(false); b.figure.visible = false; b.hallLights.forEach((f) => { f.flicker = 0; f.dim = 1; }); this.addTask('home', 'Take Mochi home'); });
    this.when('home', () => this.flags.catOut && cat.held && this.zone() === 'main', () => { this.done('home'); this.flags.catOut = false; cat.scripted = null; cat.putDown(); cat.setBehavior('hide', { hide: cat.bestHide() }); cat.fear = 0.85; say("She won't stop shaking.", 1.5); });
  }
  async catEscapes() {
    const cat = G.cat, front = G.apartment.doors.front;
    front.target = 1.3; sfx('doorCreak', { pos: front.worldPos(V()), vol: 0.7, rate: 0.6 });
    this.flags.catOut = true;
    say('The front door... who opened the door?', 0.8);
    cat.leavePerch();
    cat.setBehavior('flee');
    cat.scripted = (ct, dt) => {
      // run for 4A and curl up under the chair where it sits
      if (!ct.path || ct.bt % 3 < dt) ct.goto(V(-3.2, 0, 3.2), 1.6);
      ct.model.set({ crouch: 0.8, earFlat: 1, tailUp: -0.6, puff: 0.5 });
      if (ct.pos.distanceTo(V(-3.2, 0, 3.2)) < 0.3) { ct.path = null; ct.model.set({ loaf: 0.8, crouch: 1 }); }
    };
    G.building.doors['4A'].locked = false; G.building.doors['4A'].setAngle(1.0);
    G.building.figure.visible = true;
    this.addTask('find', 'Find Mochi');
  }
  onHallLoop(n) {
    const b = G.building;
    if (n === 1) { sfx('stinger', { vol: 0.4 }); say('This is the same hallway.', 0.5); }
    if (n === 2) say('4B. 4B. 4B. Every door is mine.', 0.5);
    if (n >= 3) { b.loop = false; b.setPlates(false); say('...there. 4A. She went into 4A.', 0.8); G.cat.meow('meowPlead'); }
  }

  // DAY 6 - unbearable hunger. Mochi.
  day6() {
    const cat = G.cat, hg = G.player.hunger;
    this.at('roar6', 14, () => this.distantRoar());
    if (cat.present && !this.flags.choiceDone && !this.choosing && !this.cutscene && this.hour >= 11) {
      const d = cat.pos.distanceTo(new THREE.Vector3().copy(G.player.ctrl.body.position));
      if (hg.value > 0.7 && d < 1.7 && cat.playerLooking()) this.catChoice();
    }
    // hunger alone pushes you there
    if (!this.flags.choiceDone && this.hour >= 13) hg.value = Math.max(hg.value, 0.8);
  }
  async catChoice() {
    this.choosing = true;
    const cat = G.cat;
    G.fx.set('hunger6', { red: 0.35, tunnel: 0.4, wave: 0.2 });
    sfx('heartbeat', { vol: 0.8 }); sfx('growlBig', { vol: 0.9 });
    G.hud.say('She smells so warm.', { cls: 'inner', dur: 4 });
    G.player.ctrl.speedMul = 0.3;
    const v = await G.hud.choose([{ label: 'Resist', value: 'resist' }, { label: 'Eat', value: 'eat' }], { timeout: 9, def: 'eat' });
    G.fx.clear('hunger6');
    G.player.ctrl.speedMul = 1;
    this.flags.choiceDone = true;
    if (v === 'resist') {
      // bite your own arm instead
      G.story.resistedCat = true;
      G.player.runAction && G.player.runAction({ anim: 'eat', dur: 2.2, sound: 'chewWet', at: [[0.8, () => { sfx('pain', { vol: 0.9 }); G.fx.pulse('red', 0.9, 1.5); G.body.setMutation({ bloodHands: 0.8, bloodMouth: 0.9 }); G.body.addScratch('L', 1); G.body.addScratch('L', 1); }]] });
      G.player.hunger.value = 0.35;
      cat.trust = Math.min(1, cat.trust + 0.2); G.story.catTrust = cat.trust;
      say('No. Not her. Never her.', 2.2);
      say('...it tastes like pennies.', 6);
      this.timers.push(setTimeout(() => { if (cat.present) { cat.fear = 0.2; cat.setBehavior('greet'); } }, 20000));
    } else {
      G.story.attackedCat = true;
      await this.lunge();
    }
    this.choosing = false;
  }
  async lunge() {
    const cat = G.cat, c = G.player.ctrl, front = G.apartment.doors.front;
    this.cutscene = true; this.drawTasks();
    c.enabled = false;
    const cp = cat.headPos();
    G.body.override.R = { p: cp.clone(), F: new THREE.Vector3(0, -1, 0), N: new THREE.Vector3(0, -1, 0), pose: 'claw', w: 1 };
    G.body.override.L = { p: cp.clone().add(V(0.1, 0, 0)), F: new THREE.Vector3(0, -1, 0), N: new THREE.Vector3(0, -1, 0), pose: 'claw', w: 1 };
    c.lookAtPoint(cp, 1);
    G.fx.pulse('shake', 1, 0.8); sfx('whoosh', { vol: 0.8 });
    await G.tasks.wait(0.35);
    sfx('catScream', { pos: cp, vol: 1 });
    cat.scratchPlayer('R'); cat.scratchPlayer('L');
    G.fx.pulse('red', 1, 1.2);
    await G.tasks.wait(0.5);
    G.body.override.R = G.body.override.L = null;
    // she gets away. the door is open. she does not come back.
    front.setAngle(1.5); sfx('doorSlam', { pos: front.worldPos(V()), vol: 0.6 });
    cat.held = false; cat.leavePerch(); cat.setBehavior('flee');
    cat.scripted = (ct, dt) => {
      if (!ct.path || ct.bt % 2 < dt) ct.goto(V(18.6, 0, 8.8), 2.2);
      ct.model.set({ crouch: 0.7, earFlat: 1, tailUp: -0.4, puff: 1 });
      if (ct.pos.x > 18) { ct.present = false; ct.scripted = null; }
    };
    G.story.catFled = true; G.story.catTrust = 0;
    c.enabled = true; this.cutscene = false; this.drawTasks();
    say('What did I do. What was I going to do.', 1.5);
    say('Mochi...', 5);
    this.done('cat');
    G.building.lostPoster.visible = true;
  }

  // DAY 7 - collapse
  day7(dt) {
    const cat = G.cat;
    this.at('collapse7', 7.6, () => {
      G.building.staticsS && G.building.staticsS.forEach && G.building.staticsS.forEach((m) => (m.visible = false));
      G.building.hallLights.forEach((f, i) => { f.flicker = 0.6; f.dim = 0.5; });
      G.apartment.windows.menu.frame.group.traverse && 0;
    });
    this.at('cat7', 8, () => {
      if (cat.present && cat.trust > 0.45) { const sill = cat.perches.find((p) => p.window); if (sill) cat.gotoPerch(sill); say('Mochi is sitting at the window. Waiting.', 1); }
      else if (G.story.catFled) { const p = V(7.65, 0.3, 7.9); sfx('scratch', { pos: p, vol: 0.6 }); say('Scratching. At the front door.', 1.5); }
    });
    this.at('call7', 9, () => G.phone && G.phone.ring({ work: false, name: 'FACILITY', voice: 'machine', lines: ['Subject zero four one nine.', 'Remain calm.', 'Gestation at ninety nine percent.', 'Please proceed to the window.'] }));
    if (cat.present && cat.behavior === 'window' && Math.random() < dt * 0.1) cat.meow('meowPlead');
  }
  async toWindow(key) {
    if (this.ending) return;
    this.ending = true;
    this.done('window');
    this.cutscene = true; this.drawTasks();
    const c = G.player.ctrl; c.enabled = false; c.lookEnabled = false;
    const cat = G.cat;
    if (cat.present && cat.trust > 0.45) { cat.model.slowBlink(); cat.meow('trill'); say('Goodbye, Mochi.', 1.2); }
    sfx('droneVoid', { vol: 0.8 });
    G.fx.whiteTo(1, 0.35);
    await G.tasks.wait(3.5);
    this.running = false;
    G.ending && G.ending.start();
  }

  // ------------------------------------------------------------- sleep / blackout / death
  async sleep() {
    if (this.cutscene) return;
    this.cutscene = true; this.drawTasks();
    const c = G.player.ctrl;
    c.enabled = false;
    if (this.tvWall) { this.tvWall.stop(1); this.tvWall = null; }
    await G.fx.fadeTo(1, 0.8);
    G.story.catTrust = G.cat.trust;
    G.story.daysDone = this.day;
    // dreams: a few seconds of something else
    await G.tasks.wait(2.4);
    this.startDay(this.day + 1);
  }
  forceSleep() {
    if (this.cutscene) return;
    say("I can't... keep my eyes open...");
    setTimeout(() => this.sleep(), 2500);
  }
  async blackout(reason) {
    if (this.cutscene) return;
    this.cutscene = true; this.drawTasks();
    sfx('bodyFall', { vol: 0.8 });
    const c = G.player.ctrl;
    const p = new THREE.Vector3().copy(c.body.position);
    c.override = { pos: V(p.x, 0.18, p.z), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, c.yaw, 1.4, 'YXZ')), speed: 3 };
    await G.fx.fadeTo(1, 1.5);
    this.minutes = Math.min(END - 30, this.minutes + 90);
    G.player.hunger.value = Math.max(0.6, G.player.hunger.value - 0.2);
    await G.tasks.wait(2);
    G.fx.fadeTo(0, 0.6);
    say('I blacked out. How long was I on the floor?', 0.8);
    await G.tasks.wait(2);
    c.override = null; this.cutscene = false; this.drawTasks();
  }
  async die(reason = 'alien') {
    if (this.dead) return;
    this.dead = true;
    this.cutscene = true; this.drawTasks();
    const c = G.player.ctrl; c.enabled = false;
    G.story.deaths = (G.story.deaths || 0) + 1;
    G.fx.set('death', { glitch: 1, noiseBurst: 1, red: 0.6 });
    sfx('scream', { vol: 1 });
    await G.tasks.wait(1.2);
    G.fx.clear('death');
    await G.fx.fadeTo(1, 4);
    G.alien && G.alien.reset();
    this.dead = false;
    await G.tasks.wait(1.5);
    this.startDay(this.day, { fromDeath: true });
  }
}
