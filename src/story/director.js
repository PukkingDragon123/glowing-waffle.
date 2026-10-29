// The Director runs the loop: seven mornings that are all Wednesday 2 July
// 1997, the day the baht was floated. It owns the clock, the daily reset, the
// routine, each day's events (the people at the door, the radio, the TV,
// the thing growing in you that answers when you work), sleep, blackouts and
// death (which simply starts the day again).
import * as THREE from 'three';
import { G, emit, on } from '../core/globals.js';
import { clamp, damp, lerp, pick, smoothstep } from '../core/util.js';
import { writeSave } from '../core/save.js';
import { Button } from '../world/interactables.js';
import { politics } from './visitors.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const say = (t, d = 0) => (d ? setTimeout(() => G.hud.inner(t), d * 1000) : G.hud.inner(t));

const START = 7 * 60, END = 23 * 60;
const RATE = 2.0;                                   // game minutes per real second
const MUT = [null,
  { belly: 0.05, pale: 0, veins: 0, blackVeins: 0, bruise: 0, sweat: 0.2, nailDark: 0, glow: 0, split: 0, hem: 0.86 },
  { belly: 0.16, pale: 0.1, veins: 0.06, blackVeins: 0, bruise: 0.05, sweat: 0.25, nailDark: 0, glow: 0, split: 0, hem: 0.84 },
  { belly: 0.32, pale: 0.25, veins: 0.2, blackVeins: 0, bruise: 0.15, sweat: 0.35, nailDark: 0.1, glow: 0, split: 0, hem: 0.8 },
  { belly: 0.5, pale: 0.45, veins: 0.45, blackVeins: 0.1, bruise: 0.3, sweat: 0.45, nailDark: 0.35, glow: 0, split: 0, hem: 0.76 },
  { belly: 0.68, pale: 0.6, veins: 0.6, blackVeins: 0.3, bruise: 0.45, sweat: 0.5, nailDark: 0.55, glow: 0.05, split: 0, hem: 0.72 },
  { belly: 0.85, pale: 0.75, veins: 0.75, blackVeins: 0.55, bruise: 0.55, sweat: 0.6, nailDark: 0.8, glow: 0.12, split: 0, hem: 0.68 },
  { belly: 1.0, pale: 0.85, veins: 0.9, blackVeins: 0.8, bruise: 0.6, sweat: 0.7, nailDark: 1, glow: 0.3, split: 0.08, hem: 0.62 },
];
const HUNGER0 = [0, 0.35, 0.42, 0.52, 0.6, 0.66, 0.78, 0.82];
// US dollar in baht through the day (the managed float began this morning; it
// was about 25 at the peg and fell some 15 percent on the day; by January it
// passed 55). Each loop the fall goes further.
const FX0 = [0, 24.5, 24.5, 26, 29, 34, 41, 52];
const FX1 = [0, 28.8, 29.4, 33, 38, 46, 53, 56.7];
const WAKE_LINE = [null, '...just a dream. A white dream.', 'I had the strangest dream. That I already lived today.', 'Wednesday the second. Again.', 'Something is pressing up against my ribs from the inside.', 'I can hear it breathing. In me.', 'So hungry. So, so hungry.', "It's time. I don't know how I know that."];
const RADIO = [null,
  "Sawasdee krap. Seven o'clock, Wednesday the second of July, two five four zero. The Bank of Thailand announced this morning that the baht will float. The Finance Minister asks the public not to panic. Light rain, thirty four degrees.",
  "Sawasdee krap. Seven o'clock, Wednesday the second of July, two five four zero. The Bank of Thailand announced this morning that the baht will float. The Finance Minister asks the public not to panic. Light rain, thirty four degrees.",
  "Seven o'clock, Wednesday the second of July. The baht will float. Do not panic. Lights reported over Sukhumvit last night were Loy Krathong lanterns, police say. In July.",
  "Seven o'clock. The second of July. The second of July. Do not panic. Meridian Pacific Capital will buy everything. Stay indoors after dark. Turn off your lights.",
  "Second of July. The baht will float. The lights over Sukhumvit are lanterns. The lanterns over Sukhumvit are looking for you.",
  "Subject one four zero seven. Sawasdee krap. Appetite critical. Please continue your routine.",
  "Gestation complete in fourteen hours. Good morning, subject. Do not panic.",
];
// what the radio adds after the news, once you have chosen something
function radioCoda() {
  const p = politics(), d = G.story.day, o = [];
  if (d >= 3 && p.yaba === 'police') o.push('Police at Thong Lor station report the arrest of a fish ball vendor carrying two pills. The investigation is closed.');
  if (d >= 4 && p.vote) o.push('In the by-election, Prosperity Party candidate number nine is expected to win by a landslide.');
  if (d >= 5 && p.deed === 'signed') o.push('Meridian Pacific Capital thanks the residents of Sukhumvit Paradise for their cooperation.');
  if (d >= 6 && p.petition === true) o.push('The drafting assembly has received another fifty thousand signatures for the new constitution.');
  return o.join(' ');
}

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
    this.seedT = 12;
    G.director = this;
    this.listen();
    this.makeBed();
  }

  // ------------------------------------------------------------- clock
  clockMinutes() { return this.minutes; }
  get hour() { return this.minutes / 60; }
  get nightness() { return smoothstep(18.8 * 60, 20.4 * 60, this.minutes); }
  get t01() { return clamp((this.minutes - START) / (END - START), 0, 1); }
  // US$1 in baht right now
  get fx() { const d = this.day, k = smoothstep(8 * 60, 17 * 60, this.minutes); return lerp(FX0[d], FX1[d], k) + Math.sin(G.time * 0.7) * 0.03 * k; }

  // ------------------------------------------------------------- tasks
  setTasks(list) { this.tasks = list.map((t) => (typeof t === 'string' ? { id: t, text: t, done: false } : { done: false, ...t })); this.drawTasks(); }
  addTask(id, text) { if (!this.tasks.find((t) => t.id === id && !t.done)) { this.tasks = this.tasks.filter((t) => t.id !== id); this.tasks.push({ id, text, done: false }); this.drawTasks(); sfx('pageTurn', { vol: 0.25 }); } }
  done(id) { const t = this.tasks.find((x) => x.id === id); if (t && !t.done) { t.done = true; this.drawTasks(); emit('taskDone', id); } }
  isDone(id) { const t = this.tasks.find((x) => x.id === id); return !!(t && t.done); }
  drawTasks() { G.hud.objective(this.cutscene ? [] : this.tasks); }
  setText(id, text) { const t = this.tasks.find((x) => x.id === id); if (t) { t.text = text; this.drawTasks(); } }

  listen() {
    on('ateEggs', () => this.done('eat'));
    on('ateRice', () => this.done('eat'));
    on('ate', () => { if (this.day >= 3) this.done('eat'); });
    on('catFed', () => this.done('cat'));
    on('callEnded', () => this.updateWorkTask());
    on('trashOut', () => this.done('trash'));
    on('window', (e) => { if (e.open) this.onWindowOpened(e.key); });
    on('starveBlackout', () => this.blackout('hunger'));
    on('1406open', () => { this.flags.opened1406 = true; });
    on('hallLoop', (n) => this.onHallLoop(n));
    on('elevatorArrived', () => { this.flags.rodeElevator = true; });
    on('politics', (k) => this.onPolitics(k));
    on('mailRead', (m) => { if (this.day >= 2 && !this.once.has('mailDeja' + this.day) && m && /welcome back/i.test(m.subject || '')) { this.once.add('mailDeja' + this.day); say(this.day === 2 ? "Didn't I read this yesterday?" : this.day === 3 ? 'The same email. Word for word.' : 'Welcome back. Welcome back. Welcome back.', 1.5); } });
    on('callAnswered', (def) => {
      if (this.day >= 2 && def && /boonmee|somchai|lek/.test(def.id) && !this.once.has('deja' + def.id)) {
        this.once.add('deja' + def.id);
        const n = def.name.split(' ').slice(-1)[0];
        say(this.day === 2 ? `${n}... ${n} called yesterday. Same words.` : this.day === 3 ? `${n} again. Every morning. The same panic.` : `I know exactly what ${n} is going to say.`, 4);
      }
    });
  }
  updateWorkTask() {
    const sup = G.os && G.os.apps.support;
    if (!sup) return;
    const n = sup.handledToday, tot = sup.todays.length;
    this.setText('work', `Work: answer the hotline (${Math.min(n, tot)}/${tot})`);
    if (n >= tot) this.done('work');
  }

  makeBed() {
    const ap = G.apartment;
    const g = new THREE.Group(); g.position.copy(ap.bedInfo.center); G.world.root.add(g);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(hit);
    this.bedBtn = new Button(g, {
      name: 'bed',
      label: () => (this.cutscene || this.day >= 7 ? null : this.canSleep() ? 'Go to sleep' : 'Bed'),
      onUse: () => { if (this.canSleep()) this.sleep(); else say(this.hour < 12 ? "It's morning. I just got up." : "Not yet. The hotline's still open."); },
    });
  }
  canSleep() { return this.hour >= 20 || (this.hour >= 17 && this.isDone('work')); }

  // ------------------------------------------------------------- day flow
  async startDay(day, { fromDeath = false } = {}) {
    this.running = true;
    this.stopAmbience();
    this.day = day; G.story.day = day;
    politics();
    this.minutes = START;
    this.flags = {}; this.once.clear();
    for (const t of this.timers) clearTimeout(t); this.timers = [];
    this.cutscene = true; this.drawTasks();
    G.fx.fadeTo(1, 50);
    G.visitors && G.visitors.reset();
    // the world goes back to the morning of 2 July
    G.apartment.resetDay();
    G.building.resetDay && G.building.resetDay(day);
    if (G.desk.seated) G.desk.stand();
    G.desk.os.powerOff();
    G.apartment.setCalendar(day);
    G.sky.apply(G.sky.preset(day, 0), true);
    const yaba = G.story.flags.yabaTaken ? 0.08 : 0;
    G.body.setMutation({ ...MUT[day], belly: MUT[day].belly + yaba, bloodHands: day >= 4 ? 0.15 : 0, bloodMouth: 0, bloodShirt: day >= 5 ? 0.25 : 0 });
    G.player.hunger.value = HUNGER0[day];
    G.player.hunger.starveT = 0;
    G.uniforms.uWarp.value = [0, 0, 0, 0.04, 0.1, 0.18, 0.3, 0.55][day];
    G.uniforms.uBreath.value = day >= 7 ? 0.35 : day >= 6 ? 0.12 : 0;
    // Bangkok colour: warm and saturated at first, sicker and redder as the week goes
    G.fx.setGrade({ saturation: [0, 1.12, 1.08, 1.02, 0.95, 0.88, 0.8, 0.72][day], contrast: 1.05 + day * 0.012, tint: new THREE.Vector3(1.02, 1.0 - day * 0.01, 0.96 - day * 0.018) });
    G.fx.clear('day'); G.fx.clear('bend'); G.fx.clear('yaba');
    G.player.ctrl.speedMul = 1;
    // the deed: once signed, the door is not quite yours
    if (G.building.setOwner) G.building.setOwner(politics().deed === 'signed' && day >= 5);
    const cat = G.cat;
    if (G.story.catFled) { cat.present = false; }
    else {
      cat.present = true; cat.scripted = null; cat.held = false;
      cat.trust = G.story.catTrust;
      cat.fear = [0, 0, 0.05, 0.15, 0.3, 0.45, 0.55, 0.4][day];
      cat.pos.set(5.0, 0, 4.35); cat.h = 0; cat.perch = null; cat.jump = null; cat.path = null;
      const bedPerch = cat.perches.find((p) => p.name === 'bed');
      if (bedPerch) { cat.perch = bedPerch; cat.pos.copy(bedPerch.pos); cat.pos.y = 0; cat.h = bedPerch.pos.y; }
      cat.setBehavior('sleep', { spot: { perch: 'bed' } });
    }
    this.wakeInBed();
    writeSave({ day, story: G.story });
    await G.tasks.wait(fromDeath ? 2.5 : 1.6);
    G.fx.fadeTo(0, 0.6);
    this.alarmStart();
    this.cutscene = true;
    this.inBed = true;
    this.setTasks([{ id: 'alarm', text: 'Turn off the alarm   [E]' }]);
    this.cutsceneTasksVisible();
    if (day === 1 && !fromDeath) G.hud.titleCard('พุธ ๒ กรกฎาคม ๒๕๔๐', 'Wednesday, 2 July 1997 · Bangkok · Room 1407', 4.5);
  }
  cutsceneTasksVisible() { const c = this.cutscene; this.cutscene = false; this.drawTasks(); this.cutscene = c; }

  wakeInBed() {
    const ap = G.apartment, pl = G.player, c = pl.ctrl;
    const pil = ap.bedInfo.pillow;
    c.teleport(5.0, 0.05, 3.35, 0, 0);
    c.enabled = false; c.lookEnabled = false;
    this.lieLook = { yaw: 0, pitch: 0 };
    this.liePos = V(pil.x + 0.08, pil.y + 0.1, pil.z + 0.15);
    c.override = { pos: this.liePos.clone(), quat: this.lieQuat(), speed: 50 };
    c.overrideBlend = 1; c.lastOverride = c.override;
    G.body.visible = false;
  }
  lieQuat() {
    // on the back, head at the west wall under the air-con, looking at the tube
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.62 + this.lieLook.pitch, -Math.PI / 2 + this.lieLook.yaw, -0.1, 'YXZ'));
  }
  alarmStart() {
    this.alarmRinging = true;
    const pos = V(3.72, 0.66, 0.97);
    const ring = () => { if (!this.alarmRinging) return; sfx('alarmBeep', { pos, vol: 0.55 }); this.alarmT = setTimeout(ring, 1100); };
    ring();
    // the pink radio comes on by itself: the same news every morning
    this.timers.push(setTimeout(() => {
      if (!this.running) return;
      const r = G.apartment.radio, rp = r.pos;
      sfx('radioTune', { pos: rp, vol: 0.4 });
      const line = (RADIO[this.day] + ' ' + radioCoda()).trim();
      const h = G.audio && G.audio.speak(line, { voice: this.day >= 6 ? 'machine' : 'man', phone: true, pos: rp, vol: 0.55, distort: 3 });
      G.hud.say(line, { who: 'วิทยุ · radio', cls: this.day >= 5 ? 'strange' : 'voice', force: true, dur: h && h.dur ? h.dur + 1 : 12 });
      // then the luk thung station, unless you turn it off
      this.timers.push(setTimeout(() => { if (this.running && !this.cutscene) r.play(); }, ((h && h.dur) || 12) * 1000 + 800));
    }, 2500));
  }
  stopAlarm() {
    if (!this.alarmRinging) return;
    this.alarmRinging = false; clearTimeout(this.alarmT);
    sfx('click', { pos: V(3.72, 0.66, 0.97), vol: 0.6 });
    this.done('alarm');
    if (this.inBed) this.getUp();
  }
  async getUp() {
    this.inBed = false;
    const c = G.player.ctrl;
    const sitQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, Math.PI - 0.2, 0, 'YXZ'));
    c.override = { pos: V(4.5, 1.0, 3.25), quat: sitQ, speed: 2.2 };
    await G.tasks.wait(1.6);
    sfx('breath', { vol: 0.35 });
    say(WAKE_LINE[this.day]);
    await G.tasks.wait(1.4);
    c.yaw = Math.PI - 0.2; c.pitch = -0.15;
    c.override = null;
    G.body.visible = true;
    c.enabled = true; c.lookEnabled = true;
    this.cutscene = false;
    this.beginRoutine();
  }

  // the routine is the same every day; each day adds its own things
  beginRoutine() {
    const d = this.day;
    if (d === 1) { this.setTasks([{ id: 'window', text: 'Open the balcony door. I need air.' }]); return; }
    const list = [];
    if (d <= 5) list.push({ id: 'coffee', text: 'Make coffee (3-in-1, the hot water pot)' });
    list.push({ id: 'eat', text: d >= 4 ? 'Eat. Eat something. Anything.' : 'Breakfast: rice and a fried egg' });
    if (!G.story.catFled) list.push({ id: 'cat', text: 'Feed Khanom' });
    if (d <= 6) list.push({ id: 'work', text: 'Work: answer the hotline (0/' + (G.os.apps.support ? G.os.apps.support.todays.length : 3) + ')' });
    if (d === 2) list.push({ id: 'trash', text: 'Take out the rubbish (chute, end of the corridor)' });
    if (d === 7) { list.length = 0; list.push({ id: 'window', text: 'Go out on the balcony' }); }
    this.setTasks(list);
    this.updateWorkTask();
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    if (!this.running) return;
    const pl = G.player, c = pl.ctrl;
    if (this.inBed) {
      this.lieLook.yaw = clamp(this.lieLook.yaw - G.input.mdx * 0.002, -0.9, 0.9);
      this.lieLook.pitch = clamp(this.lieLook.pitch - G.input.mdy * 0.002, -0.5, 0.35);
      c.override.quat.copy(this.lieQuat());
      if (G.input.pressed('KeyE') || G.input.mousePressed(0)) this.stopAlarm();
    }
    if (!this.cutscene && !this.inBed) {
      const sup = G.os && G.os.apps.support;
      const onCall = sup && sup.call && sup.call.state === 'active';
      const talking = G.visitors && G.visitors.active && G.visitors.active.state === 'talking';
      this.minutes = Math.min(END, this.minutes + dt * RATE * (onCall || talking ? 0.35 : 1));
      if (this.minutes >= END && !this.ending && this.day < 7) this.forceSleep();
    }
    G.sky.apply(G.sky.preset(this.day, this.t01));
    if (G.phone) G.phone.checkPersonal(this.day, this.hour);
    if (pl.hunger.coffeeT > 0) this.done('coffee');
    G.hud.ticker && G.hud.ticker(this);
    this.liminal(dt);
    this.ambience(dt);
    this.seed(dt);
    G.visitors && G.visitors.update(dt);
    this.dayScript(dt);
  }
  clockText() {
    const m = Math.floor(this.minutes), h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // reality bends: the corridor stretches away, the room tilts and rolls
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
    const u = G.uniforms.uBend.value;
    u.x = damp(u.x, sx, 1.2, dt); u.y = damp(u.y, cy, 1.2, dt); u.z = damp(u.z, tw, 1.2, dt);
  }

  // Bangkok fourteen floors down: the traffic bed, louder with the glass open
  // and loudest on the balcony; bikes, tuk-tuks, soi dogs, the bread man's horn;
  // the temple bell morning and evening; cicadas after dark
  ambience(dt) {
    const A = G.audio; if (!A || !A.ready) return;
    const z = this.zone(), w = G.apartment.windows;
    const open = Math.max(w.balcony.pos / w.balcony.max, w.window.pos / w.window.max);
    const out = z === 'balcony' ? 1 : z === 'main' || z === 'bath' ? 0.22 + open * 0.55 : 0.12;
    const night = this.nightness;
    if (!this.street) this.street = A.loop('bangkokStreet', { pos: V(5, -6, -30), vol: 0 });
    this.streetVol = damp(this.streetVol || 0, out * (1.1 - night * 0.4) * (this.day >= 6 ? 0.6 : 1), 2, dt);
    this.street.set({ vol: this.streetVol });
    if (night > 0.4 && !this.cicadas) this.cicadas = A.loop('cicadas', { pos: V(5, -10, -24), vol: 0 });
    if (this.cicadas) this.cicadas.set({ vol: out * night * 1.2 });
    this.ambT = (this.ambT ?? 6) - dt;
    if (this.ambT <= 0) {
      this.ambT = 5 + Math.random() * 12;
      const k = pick(night > 0.5 ? ['soiDog', 'motorbike', 'soiDog', 'horn'] : ['motorbike', 'tukTuk', 'horn', 'vendorHorn', 'soiDog', 'motorbike', 'vendorBell']);
      if (out > 0.15) sfx(k, { pos: V(-10 + Math.random() * 30, -12, -18 - Math.random() * 20), vol: 0.35 + out * 0.6, variant: Math.floor(Math.random() * 3) });
    }
    this.at('bellAM', 7.3, () => sfx('templeBell', { pos: V(-40, 5, -90), vol: 0.5 * (0.3 + out) }));
    this.at('bellPM', 18.1, () => sfx('templeBell', { pos: V(-40, 5, -90), vol: 0.5 * (0.3 + out), variant: 1 }));
  }
  stopAmbience() { for (const k of ['street', 'cicadas']) if (this[k]) { this[k].stop(1); this[k] = null; } this.streetVol = 0; }

  // The seed. It wakes when you work: at the desk, on a call, typing, it
  // gurgles and clicks and chitters, and the people on the line can hear it.
  seed(dt) {
    const d = this.day;
    if (d === 1 && !this.flags.blinded) return;
    const desk = G.desk, working = desk && desk.seated;
    const sup = G.os && G.os.apps.support;
    const onCall = sup && sup.call && sup.call.state === 'active';
    this.seedT -= dt * (working ? (onCall ? 2.2 : 1.4) : 0.25);
    if (this.seedT > 0 || this.cutscene) return;
    this.seedT = [0, 26, 20, 15, 11, 8, 6, 5][d] + Math.random() * 10;
    const kinds = d <= 2 ? ['seedGurgle', 'seedClick'] : d <= 4 ? ['seedGurgle', 'seedClick', 'seedChitter', 'seedKick'] : ['seedChitter', 'seedKick', 'seedClick', 'seedGurgle'];
    const k = pick(kinds);
    const belly = G.camera.position.clone().add(V(0, -0.55, 0));
    sfx(k, { pos: belly, vol: 0.45 + d * 0.06, occlude: false });
    if (k === 'seedKick') { G.body.stomachPulse && G.body.stomachPulse(0.4 + d * 0.08); G.fx.pulse('shake', 0.25, 0.4); }
    if (working) {
      // the monitor shivers with it
      desk.u.warp.value = 0.6 + d * 0.15; setTimeout(() => (desk.u.warp.value = 0), 900);
      if (d >= 3) G.fx.pulse('wave', 0.3 + d * 0.05, 1.4);
    }
    const caption = { seedGurgle: ['*something gurgles under my shirt*', '*a wet sound, from inside*'], seedClick: ['*click. click-click.*', '*it is clicking in there*'], seedChitter: ['*it chitters, like it is laughing*', '*it is trying to talk*'], seedKick: ['*it kicked*', '*it turned over*'] }[k];
    if (Math.random() < 0.6) G.hud.say(pick(caption), { cls: 'strange', force: true, dur: 2.2 });
    // the caller hears it too
    if (onCall && d >= 2 && Math.random() < 0.55 && !sup.call.def.strange) {
      const v = sup.call.def.voice || 'man';
      const line = pick(d >= 5 ? ['There it is again. It knows my name.', 'Your stomach is answering me, khun.', 'Who else is in the room with you?'] : ['Hello? What is that noise?', 'Sorry, is there a cat? Something is clicking.', 'Khun, your line is making a sound like water.']);
      setTimeout(() => { G.audio && G.audio.speak(line, { voice: v, phone: true, pos: G.phone ? G.phone.earPos() : belly, vol: 0.55 }); G.hud.say(line, { who: sup.call.def.name, cls: 'voice', force: true, dur: 3.2 }); }, 1400);
    }
    if (!this.once.has('seedFirst')) { this.once.add('seedFirst'); say(working ? 'That came from me. When I sat down to work, it... moved.' : 'That was my stomach. Was that my stomach?', 2.4); }
  }

  // ------------------------------------------------------------- daily scripts
  at(key, hour, fn) { if (!this.once.has(key) && this.hour >= hour && !this.cutscene) { this.once.add(key); fn(); } }
  when(key, cond, fn) { if (!this.once.has(key) && !this.cutscene && cond()) { this.once.add(key); fn(); } }
  zone() { const z = G.world.zoneAt(G.player.ctrl.body.position); return z ? z.name : 'outside'; }
  dayScript(dt) {
    const d = this.day;
    this.at('bedTask', d === 7 ? 99 : 19.5, () => this.addTask('sleep', 'Go to bed'));
    // evenings: Auntie Wan's lakorn through the wall... until there is no Auntie Wan
    this.at('tvWall', 20, () => { if (d <= 2) this.tvWall = G.audio && G.audio.loop('tvLakorn', { pos: V(8.3, 1.2, 3.0), vol: 0.45 }); });
    // geckos after dark, every night, the only thing that doesn't change
    if (this.nightness > 0.5) { this.geckoT = (this.geckoT ?? 30) - dt; if (this.geckoT <= 0) { this.geckoT = 50 + Math.random() * 70; sfx('gecko', { pos: V(3.6 + Math.random() * 2, 2.4, -0.8), vol: 0.5 }); } }
    // afternoon storms on later days
    this.at('storm', d >= 3 ? 15.5 : 99, () => { sfx('thunder', { vol: 0.8 }); this.rain = G.audio && G.audio.loop('rain', { pos: V(4.7, 1.4, -1.0), vol: 0.5 }); });
    this.at('stormEnd', d >= 3 ? 18.5 : 99, () => { if (this.rain) { this.rain.stop(4); this.rain = null; } });
    if (d >= 3) {
      this.kickT = (this.kickT ?? 20) - dt;
      if (this.kickT <= 0 && !this.cutscene) { this.kickT = [0, 0, 0, 40, 28, 20, 14, 10][d] + Math.random() * 15; G.body.stomachPulse(0.5 + d * 0.1); if (Math.random() < 0.35) say(pick(['It moved.', 'Something kicked.', 'Stop. Please stop.', "It's turning over."]), 0.8); if (d >= 5 && Math.random() < 0.3) G.body.armCrawl(Math.random() < 0.5 ? 'L' : 'R', 1); }
    }
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

  // the visitor of the day: knocks at a fixed time, once
  visitor(kind, hour) { this.at('visit_' + kind, hour, () => G.visitors && G.visitors.arrive(kind)); }

  // DAY 1 - the float. The balcony. The light. A crane falls across the soi.
  day1() {
    this.at('crane1', 15, () => this.craneFalls());
    this.at('pager1', 12.5, () => this.pager('MAE: BAHT LOY TUA LAEW!! DOLLAR LOAN?? CALL MAE'));
  }
  onWindowOpened(key) {
    if (this.day === 1 && key === 'balcony' && !this.flags.blinded && !this.cutscene) { this.flags.blinded = true; this.blinded(key); }
    if (this.day >= 3 && this.nightness > 0.5) { say("I shouldn't open it at night.", 0.5); G.alien && G.alien.attract(0.4); }
    if (this.day === 7 && key === 'balcony') this.toWindow(key);
  }
  // white light out of a clear sky: it goes in through the eyes and stays
  async blinded(key) {
    this.done('window');
    const c = G.player.ctrl;
    this.cutscene = true; this.drawTasks();
    c.enabled = false; c.lookEnabled = false;
    G.apartment.radio.off();
    G.fx.whiteTo(1, 0.9);
    G.engine.fx.exposure = 3;
    sfx('tinnitus', { vol: 0.7 }); sfx('seedHum', { vol: 0.5 });
    await G.tasks.wait(0.9);
    sfx('scream', { vol: 0.9 });
    G.fx.pulse('shake', 1, 1.4);
    await G.tasks.wait(1.4);
    const w = G.apartment.windows[key].frame.group.position;
    const floorPos = V(w.x - 0.2, 0.16, w.z + 1.0);
    c.override = { pos: floorPos, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, Math.PI + 0.4, 1.35, 'YXZ')), speed: 3.5 };
    sfx('bodyFall', { vol: 0.9 });
    G.body.visible = false;
    await G.tasks.wait(0.6);
    G.fx.whiteTo(0, 3);
    G.fx.fadeTo(1, 2.5);
    await G.tasks.wait(3.5);
    this.minutes = 7 * 60 + 40;
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
    say('Khanom...?');
    await G.tasks.wait(2.6);
    say('What was that. The sky was white. It went straight into me.');
    await G.tasks.wait(2.8);
    cat.scripted = null; if (cat.present) cat.setBehavior('greet');
    c.teleport(floorPos.x, 0.05, floorPos.z + 0.3, Math.PI, -0.1);
    c.override = null; G.body.visible = true;
    c.enabled = true; c.lookEnabled = true;
    this.cutscene = false;
    G.apartment.windows[key].target = 0;
    this.setTasks([
      { id: 'coffee', text: 'Make coffee (3-in-1, the hot water pot)' },
      { id: 'eat', text: 'Breakfast: rice in the cooker, eggs in the fridge' },
      { id: 'cat', text: 'Feed Khanom (food under the sink)' },
      { id: 'work', text: 'Work: answer the hotline (0/3)' },
    ]);
    this.updateWorkTask();
  }
  craneFalls() {
    sfx('craneFall', { vol: 0.9, occlude: false });
    setTimeout(() => sfx('roarFar', { vol: 0.7, occlude: false }), 1800);
    G.fx.pulse('shake', 0.5, 2.5);
    G.player.ctrl.shake = 0.5;
    emit('noise', { pos: V(5, 1, -40), loud: 1.2, kind: 'roar' });
    for (const w of Object.values(G.apartment.windows)) sfx('windowThud', { pos: w.frame.group.position, vol: 0.35 });
    emit('craneFall');
    say(this.day === 1 ? 'Across the soi... the crane on the ghost tower just... went.' : this.day === 2 ? 'The crane again. Same time as yesterday.' : 'Right on time. Three o\'clock. The crane.', 3.2);
  }
  pager(text) {
    sfx('pager', { pos: V(3.95, 0.8, 5.5), vol: 0.7 });
    G.hud.say('PAGER: ' + text, { who: '📟', cls: 'voice', force: true, dur: 6 });
  }
  policeCall() {
    this.timers.push(setTimeout(() => G.phone && G.phone.ring({ work: false, name: 'POLICE', voice: 'man', lines: ['Royal Thai Police, Thong Lor. Sawasdee krap.', 'Thank you for your report about the motorbike taxi, Khun Nok.', 'We know Win. Win is family.', 'We will send someone to room fourteen-oh-seven. Tonight. Do not lock the grille.'] }), 50000));
  }
  onPolitics(k) {
    const p = politics();
    if (k === 'deed' && p.deed === 'signed') this.timers.push(setTimeout(() => { sfx('stinger', { vol: 0.4 }); say('Did the light in the corridor just change colour?', 0); }, 4000));
  }

  // DAY 2 - the same day. The rubbish. 1406 is open. Win from the motosai stand.
  day2() {
    this.at('crane2', 15, () => this.craneFalls());
    this.at('pager2', 12.5, () => this.pager('MAE: BAHT LOY TUA LAEW!! DOLLAR LOAN?? CALL MAE'));
    const b = G.building;
    this.when('1406ajar', () => G.story.flags.trashOut === 2, () => {
      b.setGrille1406(true);
      const d = b.doors['1406']; d.locked = false; d.target = 0.35;
      sfx('doorGrille', { pos: d.worldPos(V()), vol: 0.6 }); sfx('doorCreak', { pos: d.worldPos(V()), vol: 0.6, rate: 0.6 });
      say("1406's grille is open. Somebody cut the padlock.", 1.0);
      this.addTask('1406', 'Look inside 1406');
    });
    this.when('in1406', () => this.zone() === '1406', () => {
      sfx('stinger', { vol: 0.5 });
      say('Nobody has lived here since the developer ran off. I heard a TV in here last night.', 0.6);
      say('Just one plastic chair.', 4.5);
      this.done('1406');
      if (this.tvWall) { this.tvWall.stop(1); this.tvWall = null; }
    });
    this.visitor('dealer', 20.5);
  }

  // DAY 3 - strange callers, the rooms bend, it moves. Pa Jit and the envelope.
  day3() {
    this.at('crane3', 15, () => this.craneFalls());
    this.when('cups', () => this.hour > 11 && this.zone() !== 'main', () => this.lineUpCups());
    this.when('cupsSeen', () => this.flags.cupsLined && this.zone() === 'main', () => { sfx('stinger', { vol: 0.5 }); say('Who did this?', 1); say('I live alone. I live alone with a cat.', 4); });
    this.visitor('canvasser', 18.5);
  }
  lineUpCups() {
    const cups = G.world.items.filter((i) => ['mug', 'glass', 'soup', 'beans', 'cola', 'catCan', 'apple'].includes(i.type) && !i.prop.held && G.player.inv.hand !== i);
    cups.slice(0, 12).forEach((it, k) => {
      const x = 4.9 + k * 0.3, z = 3.55;
      it.body.position.set(x, 0.08, z); it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
      it.body.quaternion.set(0, 0, 0, 1); it.body.sleep && it.body.sleep();
    });
    this.flags.cupsLined = true;
  }

  // DAY 4 - blood, the late reflection, the Deputy Minister on TV, the man from Meridian
  day4() {
    this.at('crane4', 15, () => this.craneFalls());
    this.when('mirror4', () => G.mirror && G.mirror.seen > 1.2, () => { sfx('stinger', { vol: 0.6 }); say('My reflection... it was late.', 0.5); });
    this.at('tv4', 12, () => { if (!G.apartment.tv.on) { G.apartment.tv.toggle(); say('The TV turned itself on.', 1); } });
    this.visitor('meridian', 17);
  }

  // DAY 5 - Khanom gets out. The corridor has no ends. Every door is 1407. Ploy.
  day5() {
    const b = G.building, cat = G.cat;
    this.when('catEscape', () => this.hour >= 10.5 && cat.present && !cat.held && this.zone() !== 'hall', () => this.catEscapes());
    this.when('hallMaze', () => this.flags.catOut && this.zone() === 'hall', () => {
      b.loop = true; b.setPlates(true);
      b.hallLights.forEach((f, i) => { f.flicker = i % 2 ? 0.8 : 0.3; f.dim = 0.6; });
      say('Khanom! Mew mew mew, here, kitty...', 0.6);
      this.timers.push(setTimeout(() => cat.meow('meowPlead'), 3000));
    });
    this.when('found', () => this.flags.catOut && cat.held, () => { this.done('find'); say("I've got you. I've got you. Let's go home.", 0.5); b.loop = false; b.setPlates(false); b.figure.visible = false; b.hallLights.forEach((f) => { f.flicker = 0; f.dim = 1; }); this.addTask('home', 'Take Khanom home'); });
    this.when('home', () => this.flags.catOut && cat.held && this.zone() === 'main', () => { this.done('home'); this.flags.catOut = false; cat.scripted = null; cat.putDown(); cat.setBehavior('hide', { hide: cat.bestHide() }); cat.fear = 0.85; say("She won't stop shaking.", 1.5); });
    this.at('protest5', 14, () => { this.crowd = G.audio && G.audio.loop('crowdProtest', { pos: V(4.7, -30, -80), vol: 0.35 }); say('A crowd, down on Sukhumvit. Megaphones.', 2); });
    this.at('protest5end', 18, () => { if (this.crowd) { this.crowd.stop(3); this.crowd = null; } });
    this.visitor('student', 16);
  }
  async catEscapes() {
    const cat = G.cat, front = G.apartment.doors.front;
    front.target = 1.3; sfx('doorCreak', { pos: front.worldPos(V()), vol: 0.7, rate: 0.6 });
    this.flags.catOut = true;
    say('The front door... who opened the door?', 0.8);
    G.building.setGrille1406(true);
    cat.leavePerch();
    cat.setBehavior('flee');
    const den = V(1.0, 0, 3.6);
    cat.scripted = (ct, dt) => {
      // run for 1406 and curl up under the chair where it sits
      if (!ct.path || ct.bt % 3 < dt) ct.goto(den, 1.6);
      ct.model.set({ crouch: 0.8, earFlat: 1, tailUp: -0.6, puff: 0.5 });
      if (ct.pos.distanceTo(den) < 0.3) { ct.path = null; ct.model.set({ loaf: 0.8, crouch: 1 }); }
    };
    G.building.doors['1406'].locked = false; G.building.doors['1406'].setAngle(1.0);
    G.building.figure.visible = true;
    this.addTask('find', 'Find Khanom');
  }
  onHallLoop(n) {
    const b = G.building;
    if (n === 1) { sfx('stinger', { vol: 0.4 }); say('This is the same corridor.', 0.5); }
    if (n === 2) say('1407. 1407. 1407. Every door is mine.', 0.5);
    if (n >= 3) { b.loop = false; b.setPlates(false); say('...there. 1406. She went into 1406.', 0.8); G.cat.meow('meowPlead'); }
  }

  // DAY 6 - unbearable hunger. Khanom.
  day6() {
    const cat = G.cat, hg = G.player.hunger;
    this.at('crane6', 14, () => this.craneFalls());
    this.at('tv6', 19, () => { if (!G.apartment.tv.on) G.apartment.tv.toggle(); });
    if (cat.present && !this.flags.choiceDone && !this.choosing && !this.cutscene && this.hour >= 11) {
      const d = cat.pos.distanceTo(new THREE.Vector3().copy(G.player.ctrl.body.position));
      if (hg.value > 0.7 && d < 1.7 && cat.playerLooking()) this.catChoice();
    }
    if (!this.flags.choiceDone && this.hour >= 13) hg.value = Math.max(hg.value, 0.8);
  }
  async catChoice() {
    this.choosing = true;
    const cat = G.cat;
    G.fx.set('hunger6', { red: 0.35, tunnel: 0.4, wave: 0.2 });
    sfx('heartbeat', { vol: 0.8 }); sfx('growlBig', { vol: 0.9 }); sfx('seedChitter', { vol: 0.8 });
    G.hud.say('She smells so warm.', { cls: 'inner', dur: 4 });
    G.player.ctrl.speedMul = 0.3;
    const v = await G.hud.choose([{ label: 'Resist', value: 'resist' }, { label: 'Eat', value: 'eat' }], { timeout: 9, def: 'eat' });
    G.fx.clear('hunger6');
    G.player.ctrl.speedMul = 1;
    this.flags.choiceDone = true;
    if (v === 'resist') {
      G.story.resistedCat = true;
      G.player.runAction && G.player.runAction({ anim: 'eat', dur: 2.2, sound: 'chewWet', at: [[0.8, () => { sfx('pain', { vol: 0.9 }); G.fx.pulse('red', 0.9, 1.5); G.body.setMutation({ bloodHands: 0.8, bloodMouth: 0.9 }); G.body.addScratch('L', 1); G.body.addScratch('L', 1); }]] });
      G.player.hunger.value = 0.35;
      cat.trust = Math.min(1, cat.trust + 0.2); G.story.catTrust = cat.trust;
      say('No. Not her. Never her.', 2.2);
      say('...it tastes like satang coins.', 6);
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
    // she gets away down the fire stairs and does not come back
    front.setAngle(1.5); sfx('doorSlam', { pos: front.worldPos(V()), vol: 0.6 });
    G.building.doors.stair.setAngle(1.2);
    cat.held = false; cat.leavePerch(); cat.setBehavior('flee');
    cat.scripted = (ct, dt) => {
      if (!ct.path || ct.bt % 2 < dt) ct.goto(V(22.4, 0, 7.9), 2.2);
      ct.model.set({ crouch: 0.7, earFlat: 1, tailUp: -0.4, puff: 1 });
      if (ct.pos.x > 21.8) { ct.present = false; ct.scripted = null; }
    };
    G.story.catFled = true; G.story.catTrust = 0;
    c.enabled = true; this.cutscene = false; this.drawTasks();
    say('What did I do. What was I going to do.', 1.5);
    say('Khanom...', 5);
    this.done('cat');
    G.building.lostPoster.visible = true;
  }

  // DAY 7 - collapse
  day7(dt) {
    const cat = G.cat;
    this.at('collapse7', 7.6, () => {
      G.building.staticsS && G.building.staticsS.forEach && G.building.staticsS.forEach((m) => (m.visible = false));
      G.building.hallLights.forEach((f) => { f.flicker = 0.6; f.dim = 0.5; });
    });
    this.at('cat7', 8, () => {
      if (cat.present && cat.trust > 0.45) { const sill = cat.perches.find((p) => p.window); if (sill) cat.gotoPerch(sill); say('Khanom is sitting at the window. Waiting.', 1); }
      else if (G.story.catFled) { const p = V(5.68, 0.3, 6.95); sfx('scratch', { pos: p, vol: 0.6 }); say('Scratching. At the front door.', 1.5); }
    });
    this.at('call7', 9, () => G.phone && G.phone.ring({ work: false, name: 'THE BOARD', voice: 'machine', lines: ['Subject one four zero seven.', 'Remain calm. Do not panic.', 'Gestation at ninety nine percent. The baht is at fifty six.', 'Please proceed to the balcony.'] }));
    if (cat.present && cat.behavior === 'window' && Math.random() < dt * 0.1) cat.meow('meowPlead');
  }
  async toWindow(key) {
    if (this.ending) return;
    this.ending = true;
    this.done('window');
    this.cutscene = true; this.drawTasks();
    const c = G.player.ctrl; c.enabled = false; c.lookEnabled = false;
    const cat = G.cat;
    if (cat.present && cat.trust > 0.45) { cat.model.slowBlink(); cat.meow('trill'); say('Goodbye, Khanom.', 1.2); }
    sfx('droneVoid', { vol: 0.8 }); sfx('towerCollapse', { vol: 0.9, occlude: false });
    G.sky.landmarks && G.sky.landmarks.setFire && G.sky.landmarks.setFire(0, 1, 120);
    G.fx.whiteTo(1, 0.35);
    await G.tasks.wait(3.5);
    this.running = false;
    this.stopAmbience();
    G.ending && G.ending.start();
  }

  // ------------------------------------------------------------- sleep / blackout / death
  async sleep() {
    if (this.cutscene) return;
    this.cutscene = true; this.drawTasks();
    const c = G.player.ctrl;
    c.enabled = false;
    if (this.tvWall) { this.tvWall.stop(1); this.tvWall = null; }
    if (this.rain) { this.rain.stop(1); this.rain = null; }
    if (this.crowd) { this.crowd.stop(1); this.crowd = null; }
    await G.fx.fadeTo(1, 0.8);
    G.story.catTrust = G.cat.trust;
    G.story.daysDone = this.day;
    await G.tasks.wait(2.4);
    this.startDay(this.day + 1);
  }
  forceSleep() {
    if (this.cutscene) return;
    say("I can't... keep my eyes open...");
    setTimeout(() => this.sleep(), 2500);
  }
  async blackout() {
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
  async die() {
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
