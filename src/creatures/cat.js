// Khanom's behaviour: needs (hunger, energy, affection), emotions (fear, trust,
// annoyance), perception of the player (distance, speed, how wrong they look),
// utility-based behaviour selection, pathfinding, perching, hiding, petting,
// being carried, struggling and scratching.
import * as THREE from 'three';
import { G, emit, on } from '../core/globals.js';
import { GROUP } from '../core/physics.js';
import { CatModel } from './catmodel.js';
import { Interactable } from '../world/interactables.js';
import { clamp, damp, lerp, rand, pick, chance, wrapAngle, dampAngle, smoothstep, snoise1 } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
// how wrong the player looks/smells to a cat, per day
const WRONG = [0, 0, 0.12, 0.28, 0.45, 0.8, 0.95, 1];

class CatInter extends Interactable {
  constructor(cat) { super(cat.model.proxy, { name: 'cat', reach: 1.6 }); this.cat = cat; this.isCat = true; }
  actions() {
    const c = this.cat;
    if (c.held || !c.present) return [];
    return [{ key: 'E', label: 'Pet Khanom (hold)' }, { key: 'LMB', label: 'Pick up Khanom' }];
  }
  use() { /* petting handled continuously while E is held */ }
  canGrab() { return !this.cat.held; }
  grabStart() { this.cat.tryPickUp(); G.interact.idrag = null; G.player.ctrl.lookEnabled = true; }
  worldPos(out = new THREE.Vector3()) { return out.copy(this.cat.pos).add(V(0, 0.2, 0)); }
}

export class Cat {
  constructor(nav) {
    this.model = new CatModel();
    this.nav = nav;
    this.pos = V(5.0, 0, 4.35);
    this.yaw = 0.8;
    this.h = 0;                  // height above floor (perches)
    this.vel = V();
    this.speed = 0;
    this.trust = G.story.catTrust ?? 0.85;
    this.fear = 0; this.fearT = 0; this.startle = 0;
    this.hunger = 0.65; this.energy = 0.6; this.social = 0.4; this.annoy = 0;
    this.behavior = 'idle'; this.bt = 0; this.decideT = 0; this.bdata = {};
    this.path = null; this.pi = 0; this.goal = null; this.moveSpeed = 0.35;
    this.present = true;
    this.held = false; this.heldT = 0; this.tolerance = 8; this.struggle = 0;
    this.petT = 0; this.petting = false;
    this.lastGreet = -100; this.lastMeow = 0; this.lastHiss = -10; this.lastScratch = -10;
    this.perch = null; this.jump = null;
    this.inter = new CatInter(this);
    this.mover = G.physics.addMover({ type: 'sphere', r: 0.11 }, GROUP.CAT);
    this.purr = null; this.eatLoop = null;
    this.scripted = null;        // director-controlled override
    this.stareAt = null;
    on('noise', (e) => this.hear(e));
    on('catFed', () => { this.hunger = Math.max(0, this.hunger - 0.05); if (this.fear < 0.5 && this.trust < 0.95) this.trust = Math.min(1, this.trust + 0.03); });
    this.spots();
  }

  spots() {
    this.perches = [
      { name: 'bed', pos: V(4.8, 0.55, 2.7), from: V(4.8, 0, 3.3) },
      { name: 'sill', pos: V(6.85, 0.92, 0.04), from: V(6.85, 0, 0.6), window: 'window' },
      { name: 'sill2', pos: V(7.25, 0.92, 0.04), from: V(7.25, 0, 0.6), window: 'window' },
      { name: 'table', pos: V(6.3, 0.74, 2.3), from: V(5.72, 0, 2.3) },
      { name: 'stool', pos: V(5.6, 0.44, 3.95), from: V(5.6, 0, 3.45) },
    ];
    this.hides = [
      { name: 'underBed', pos: V(4.6, 0, 2.25), entry: V(4.6, 0, 3.25) },
      { name: 'underDesk', pos: V(3.75, 0, 5.45), entry: V(4.3, 0, 5.2) },
      { name: 'underTable', pos: V(6.3, 0, 2.3), entry: V(5.72, 0, 2.3) },
      { name: 'bathCorner', pos: V(7.3, 0, 5.5), entry: V(6.95, 0, 6.3) },
      { name: 'behindBoxes', pos: V(4.32, 0, 4.86), entry: V(4.6, 0, 4.9) },
    ];
    this.sleepSpots = [{ name: 'catBed', pos: V(5.0, 0.04, 4.35) }, { perch: 'stool' }, { perch: 'bed' }];
  }

  get playerPos() { return G.player.ctrl.body.position; }
  distPlayer() { const p = this.playerPos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  hear(e) {
    if (!this.present || !e.pos) return;
    const d = e.pos.distanceTo(this.pos);
    const loud = e.loud / (1 + d * 0.5);
    if (loud > 0.18 && e.kind !== 'growl') { this.startle = Math.max(this.startle, loud * 2); this.lookAt = e.pos.clone(); }
    if (e.kind === 'growl' && d < 3) this.startle = Math.max(this.startle, 0.25);
    if (e.kind !== 'meow' && e.kind !== 'hiss' && loud > 0.03) this.model.hear(e.pos);
  }

  // ------------------------------------------------------------- emotions
  updateEmotion(dt) {
    const day = G.story.day;
    const d = this.distPlayer();
    const c = G.player.ctrl;
    const wrong = WRONG[day] * (1.25 - this.trust * 0.45) + (G.player.body ? G.player.body.u.uBloodHands.value * 0.2 : 0);
    const prox = clamp(1 - d / 3.6);
    // approaching fast is threatening
    const toCat = V(this.pos.x - c.body.position.x, 0, this.pos.z - c.body.position.z).normalize();
    const approach = clamp((c.body.velocity.x * toCat.x + c.body.velocity.z * toCat.z) / 3, 0, 1);
    let target = prox * wrong * 1.25 + approach * prox * (0.35 + wrong);
    // being stared at by something wrong
    const f = c.flatForward(V());
    if (d < 2.5 && f.dot(toCat) > 0.9) target += wrong * 0.2;
    target += this.startle;
    if (G.alien && G.alien.near) target += 0.8;
    target = clamp(target, 0, 1);
    this.fear = damp(this.fear, target, target > this.fear ? 4 : 0.35, dt);
    this.startle = Math.max(0, this.startle - dt * 0.8);
    // needs
    this.hunger = clamp(this.hunger + dt / 600, 0, 1);
    this.energy = clamp(this.energy - dt / 900, 0, 1);
    this.social = clamp(this.social + dt / 300, 0, 1);
    this.annoy = Math.max(0, this.annoy - dt * 0.05);
  }

  // ------------------------------------------------------------- decision
  decide() {
    if (this.scripted || this.held || this.jump) return;
    const d = this.distPlayer();
    const fear = this.fear;
    const bowl = G.apartment.bowl;
    const U = {};
    U.flee = fear > 0.55 && d < 3.5 ? fear * 1.4 : 0;
    U.hide = this.behavior === 'hide' && fear > 0.25 ? 1.0 : fear > 0.7 ? 0.9 : 0;
    U.defend = fear > 0.6 && d < 1.0 ? 1.5 : 0;
    U.eat = bowl.level > 0.05 && this.hunger > 0.25 ? this.hunger * (d > 1.6 || fear < 0.3 ? 1.1 : 0.15) : 0;
    U.drink = this.hunger > 0.4 && chance(0.15) ? 0.35 : 0;
    U.beg = this.hunger > 0.5 && bowl.level < 0.05 && this.trust > 0.45 && fear < 0.3 && d < 6 ? this.hunger * 0.9 : 0;
    U.greet = this.trust > 0.5 && fear < 0.25 && d < 4.5 && G.time - this.lastGreet > 50 ? this.social * this.trust * 0.9 : 0;
    U.follow = this.trust > 0.65 && fear < 0.2 && d > 3 && d < 9 ? 0.3 : 0;
    U.sleep = (1 - this.energy) * 0.85 * (fear < 0.3 ? 1 : 0.2);
    U.window = 0.18 + (G.story.day >= 3 ? 0.15 : 0);
    U.wander = 0.22 + Math.random() * 0.15;
    U.idle = 0.3 + Math.random() * 0.1;
    U.groom = fear < 0.2 ? 0.15 + Math.random() * 0.1 : 0;
    U.play = this.toy && fear < 0.4 ? 0.9 : 0;
    // hysteresis: keep doing what we do
    if (U[this.behavior] !== undefined) U[this.behavior] += this.behavior === 'sleep' ? 0.4 : 0.15;
    let best = 'idle', bv = -1;
    for (const [k, v] of Object.entries(U)) if (v > bv) { bv = v; best = k; }
    if (best !== this.behavior) this.setBehavior(best);
  }

  setBehavior(b, data = {}) {
    const prev = this.behavior;
    this.behavior = b; this.bt = 0; this.bdata = data;
    // waking up: a yawn and a long stretch
    if (prev === 'sleep' && b !== 'flee') { this.model.yawn(); this.stretchT = 2.4; }
    if (prev === 'eat' && b !== 'flee') setTimeout(() => this.model.lick(), 600);
    if (prev === 'drink' && chance(0.5)) setTimeout(() => this.model.headShake(), 300);
    if (this.purr && b !== 'petted' && b !== 'greet') { this.purr.stop(0.5); this.purr = null; }
    if (this.eatLoop && b !== 'eat' && b !== 'drink') { this.eatLoop.stop(0.3); this.eatLoop = null; }
    this.path = null;
    const go = (p, speed = 0.35) => this.goto(p, speed);
    switch (b) {
      case 'flee': {
        this.leavePerch();
        const h = this.bestHide();
        this.bdata.hide = h;
        go(h.entry, 2.4);
        if (G.time - this.lastHiss > 3 && this.fear > 0.7) { this.hiss(); }
        break;
      }
      case 'hide': if (!this.bdata.hide) this.bdata.hide = this.bestHide(); break;
      case 'eat': this.leavePerch(); go(G.apartment.bowl.pos.clone().add(V(-0.25, 0, 0)), 0.45); break;
      case 'drink': this.leavePerch(); go(G.apartment.waterBowl.pos.clone().add(V(-0.25, 0, 0)), 0.4); break;
      case 'beg': this.leavePerch(); break;
      case 'greet': this.leavePerch(); this.lastGreet = G.time; break;
      case 'follow': this.leavePerch(); break;
      case 'sleep': {
        const s = pick(this.sleepSpots);
        this.bdata.spot = s;
        if (s.perch) this.gotoPerch(this.perches.find((p) => p.name === s.perch));
        else { this.leavePerch(); go(s.pos, 0.3); }
        break;
      }
      case 'window': this.gotoPerch(pick(this.perches.filter((p) => p.window))); break;
      case 'wander': { this.leavePerch(); const p = this.nav.randomFreeNear(this.pos, 3); if (p) go(p, 0.3 + Math.random() * 0.15); break; }
      case 'play': if (this.toy) go(this.toy.mesh.position.clone(), 1.6); break;
      default: break;
    }
    emit('catBehavior', { b, prev });
  }

  bestHide() {
    // farthest-from-player reachable hide spot
    const p = this.playerPos;
    let best = this.hides[0], bv = -1;
    for (const h of this.hides) {
      if (h.name === 'bathCorner' && G.apartment.doors.bath.angle < 0.6) continue;
      const v = Math.hypot(h.pos.x - p.x, h.pos.z - p.z) + (h.name === 'underBed' ? 1.5 : 0) + Math.random() * 0.5;
      if (v > bv) { bv = v; best = h; }
    }
    return best;
  }

  goto(p, speed) {
    this.goal = p.clone(); this.moveSpeed = speed;
    this.path = this.nav.path(this.pos, p, { avoid: this.playerPos, avoidR: this.fear > 0.4 ? 1.6 : 0.6 });
    this.pi = 0;
    if (!this.path) { this.path = [this.pos.clone(), p.clone()]; }
  }

  gotoPerch(perch) {
    if (!perch) return;
    if (this.perch === perch) return;
    this.leavePerch();
    this.goto(perch.from, 0.4);
    this.bdata.perchTarget = perch;
  }
  leavePerch() {
    if (!this.perch || this.jump) return;
    const pr = this.perch;
    this.startJump(pr.pos.clone(), pr.from.clone(), 0, null);
    this.perch = null;
  }
  startJump(from, to, toH, perch) {
    this.jump = { from: from.clone(), to: to.clone(), fromH: this.h, toH, t: -0.3, perch };
    this.path = null;
  }

  // ------------------------------------------------------------- vocal
  meow(kind = 'meow') {
    if (G.time - this.lastMeow < 1.2) return;
    this.lastMeow = G.time;
    sfx(kind, { pos: this.headPos(), vol: kind === 'yowl' ? 0.9 : 0.6, rate: 0.95 + Math.random() * 0.12, ref: 0.6 });
    this.model.set({ jaw: 0.8 });
    setTimeout(() => this.model.set({ jaw: 0 }), 380);
    emit('noise', { pos: this.pos.clone(), loud: 0.25, kind: 'meow' });
  }
  hiss() {
    this.lastHiss = G.time;
    sfx('hiss', { pos: this.headPos(), vol: 0.85, ref: 0.6 });
    this.model.set({ jaw: 1 });
    setTimeout(() => this.model.set({ jaw: 0.2 }), 900);
    emit('noise', { pos: this.pos.clone(), loud: 0.35, kind: 'hiss' });
    emit('catHiss');
  }
  headPos() { return this.model.by.head.getWorldPosition(V()); }
  playerLooking() {
    const to = this.headPos().sub(G.camera.position);
    const f = G.camera.getWorldDirection(V());
    return to.normalize().dot(f) > 0.94;
  }

  // ------------------------------------------------------------- player interactions
  tryPickUp() {
    if (this.held || !this.present) return;
    if (this.fear > 0.45 || this.behavior === 'hide' && this.fear > 0.3) {
      if (this.distPlayer() < 1.1 && chance(0.7)) this.scratchPlayer('R'); else this.setBehavior('flee');
      return;
    }
    this.leavePerch();
    this.jump = null;
    this.held = true; this.heldT = 0; this.struggle = 0;
    this.tolerance = 3 + this.trust * 12 - WRONG[G.story.day] * 8 + Math.random() * 3;
    G.player.carrying = this;
    this.setBehavior('held');
    if (this.trust > 0.6 && this.fear < 0.2) { sfx('trill', { pos: this.headPos(), vol: 0.5 }); }
    else sfx('meowShort', { pos: this.headPos(), vol: 0.5 });
    emit('catPicked');
  }
  putDown(escaped = false) {
    if (!this.held) return;
    this.held = false; G.player.carrying = null;
    // land on the floor in front of the player
    const c = G.player.ctrl;
    const f = c.flatForward(V());
    let p = c.body.position.clone().addScaledVector(f, 0.55);
    const fr = this.nav.nearestFree(p.x, p.z);
    if (fr) p = V(this.nav.cx(fr[0]), 0, this.nav.cz(fr[1]));
    this.startJump(this.pos.clone(), V(p.x, 0, p.z), 0, null);
    this.jump.fromH = this.h; this.h = 0;
    this.yaw = c.yaw + (escaped ? Math.PI * 0.6 : 0);
    sfx('catLand', { pos: p, vol: 0.5, delay: 0.35 });
    this.setBehavior(escaped ? 'flee' : (this.trust > 0.6 ? 'idle' : 'wander'));
  }
  scratchPlayer(side = 'R') {
    if (G.time - this.lastScratch < 1.2) return;
    this.lastScratch = G.time;
    this.hiss();
    sfx('scratch', { pos: G.camera.position, vol: 0.9, delay: 0.08 });
    sfx('pain', { vol: 0.7, delay: 0.15 });
    const body = G.player.body;
    body.addScratch(side, 0.9); body.addScratch(side, 0.7);
    body.u.uBloodHands.value = Math.min(0.55, body.u.uBloodHands.value + 0.18);
    const hand = body.byName['hand.' + side].getWorldPosition(V());
    G.particles.blood(hand, V(0, -0.5, 0), 10, 0.3);
    setTimeout(() => G.particles && G.particles.blood(hand.clone().add(V(0, -0.05, 0)), V(0, -1, 0), 6, 0.1), 400);
    G.fx && G.fx.pulse('red', 0.55, 0.6);
    G.player.ctrl.shake = 1.2;
    this.trust = Math.max(0, this.trust - 0.04);
    G.hud.inner(pick(['Ow! She scratched me...', "Khanom! That's blood...", 'She got me. It stings.', "Why is she so scared of me?"]));
    emit('catScratch', { side });
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    const M = this.model;
    if (!this.present) { M.setVisible(false); this.mover.active = false; G.physics.setMoverTarget(this.mover, V(0, -50, 0), new THREE.Quaternion(), true); return; }
    M.setVisible(true);
    this.updateEmotion(dt);
    this.bt += dt;
    this.decideT -= dt;
    if (this.decideT <= 0) { this.decideT = 0.5 + Math.random() * 0.4; this.decide(); }
    // petting (hold E while looking at the cat)
    const looking = G.interact.hovered === this.inter;
    const wantPet = (looking || this.held) && G.input.isDown('KeyE') && !G.player.inv.hand;
    if (wantPet && !this.petting) this.startPet();
    if (!wantPet && this.petting) this.endPet();
    if (this.scripted) this.scripted(this, dt);
    else if (this.held) this.updateHeld(dt);
    else if (this.jump) this.updateJump(dt);
    else this.updateBehavior(dt);
    if (!this.held && !this.jump) this.locomote(dt);
    // pose targets common to all
    const fear = this.fear;
    const dark = G.world.lightAt(this.pos.clone().add(V(0, 0.3, 0))) < 0.2;
    M.set({ pupil: clamp(0.2 + fear * 0.6 + (dark ? 0.45 : 0), 0.15, 0.95) });
    M.eyeU.uShine.value = dark ? 0.6 : 0;
    // head tracking: look at the player / sounds
    this.trackHead(dt);
    // transforms
    M.root.position.set(this.pos.x, this.pos.y + this.h, this.pos.z);
    M.root.rotation.set(0, this.yaw, 0);
    if (this.held) this.placeHeld();
    M.update(dt, { speed: this.held || this.jump ? 0 : this.speed, scared: fear > 0.5, struggle: this.struggle > 0.3, fast: !!this.jump });
    G.physics.setMoverTarget(this.mover, V(this.pos.x, this.pos.y + this.h + 0.15, this.pos.z), new THREE.Quaternion(), false);
    this.mover.body.collisionFilterMask = this.held ? 0 : GROUP.PROP | GROUP.PLAYER;
    this.faceSmear(dt);
    // purr loop follows the cat
    if (this.purr) this.purr.set({ pos: this.headPos() });
    if (this.eatLoop) this.eatLoop.set({ pos: this.headPos() });
  }

  // Khanom's face won't resolve. Since the light, the picture smears and wraps
  // around itself wherever her face should be.
  faceSmear(dt) {
    const fx = G.engine.fx.faceSpot;
    const day = G.story.day;
    const on = this.present && (G.state === 'menu' || (G.state === 'play' && (day >= 2 || (G.director && G.director.flags.blinded))));
    if (!on) { fx.w = 0; return; }
    const cam = G.camera;
    const head = this.model.by.head.localToWorld(V(0, -0.012, -0.03));
    const toH = head.clone().sub(cam.position);
    const dist = toH.length();
    const fwd = V(0, 0, -1).applyQuaternion(cam.quaternion);
    let w = 0;
    if (toH.dot(fwd) > 0.05 && dist < 14) {
      const ndc = head.clone().project(cam);
      const hit = G.physics.raycast(cam.position, head, GROUP.STATIC);
      const blocked = hit && hit.distance < dist - 0.15;
      if (!blocked && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3) {
        w = [0, 0.82, 0.88, 0.92, 0.96, 1, 1, 1][day] ?? 1;
        const R = (0.085 / (2 * dist * Math.tan((cam.fov * Math.PI) / 360))) * 1.45;
        // staring makes it worse
        const center = Math.hypot(ndc.x, ndc.y) < 0.35;
        this.stareT = center ? (this.stareT || 0) + dt : Math.max(0, (this.stareT || 0) - dt);
        const grow = 1 + Math.min(0.6, this.stareT * 0.08);
        fx.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5, Math.min(0.6, R * grow), w);
        if (center && dist < 3.2) this.noticeFace(day);
        return;
      }
    }
    fx.w = 0;
  }
  noticeFace(day) {
    const k = 'face' + day;
    if (this.noticed === k || G.director?.cutscene) return;
    this.noticed = k;
    const L = [null, ['Khanom...? Why can\'t I see your face?', "It's my eyes. It's just the light. It'll pass."],
      ['Her face is still... smeared. Like a chewed-up tape.'], ["I keep blinking. Her face won't come back."],
      ["I don't remember what she looks like. I've had her six years."], ['Is that even Khanom under there?'],
      ["Good. I don't want to see her face. I don't want to see her look at me."], ['...']][day] || [];
    L.forEach((t, i) => setTimeout(() => G.hud.inner(t), 600 + i * 3800));
    G.audio && G.audio.play('tinnitus', { vol: 0.2 });
  }

  trackHead(dt) {
    const M = this.model;
    let tgt = null;
    if (this.stareAt) tgt = this.stareAt;
    else if (this.lookAt && this.startle > 0.05) tgt = this.lookAt;
    else if (this.distPlayer() < 4 && this.behavior !== 'sleep' && this.behavior !== 'eat') tgt = G.camera.position;
    if (tgt && !this.held) {
      const hp = this.pos.clone().add(V(0, 0.3 + this.h, 0));
      const dx = tgt.x - hp.x, dz = tgt.z - hp.z, dy = tgt.y - hp.y;
      const want = Math.atan2(-dx, -dz);
      let yawRel = wrapAngle(want - this.yaw);
      yawRel = clamp(yawRel, -1.3, 1.3);
      const pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.9, 0.6);
      M.set({ headYaw: yawRel, headPitch: pitch * 0.8 });
    } else M.set({ headYaw: Math.sin(G.time * 0.3) * 0.3, headPitch: 0 });
  }

  updateBehavior(dt) {
    const M = this.model;
    const d = this.distPlayer();
    const fear = this.fear;
    const relaxed = { sit: 0, loaf: 0, crouch: 0, arch: 0, puff: 0, stretch: 0, held: 0, eat: 0, groom: 0, earFlat: 0, tailTwitch: 0, lid: 0.88, legSpread: 0, tongue: 0, knead: 0, whisk: 0, tailTip: 0, purr: 0, sniff: 0 };
    // ear swivel noise + fear posture
    const earNoise = snoise1(G.time * 0.7, 3) * 0.4;
    const base = { ...relaxed, whisk: this.behavior === 'wander' || this.behavior === 'beg' ? 0.3 : 0, earL: earNoise, earR: -earNoise, earFlat: smoothstep(0.35, 0.8, fear), crouch: smoothstep(0.4, 0.9, fear) * 0.6, tailUp: lerp(0.35, -0.5, fear), tailSway: lerp(0.15, 0.05, fear), tailTwitch: fear > 0.3 ? fear * 0.6 : 0 };
    switch (this.behavior) {
      case 'idle':
        if (this.bt > 3 && !this.path) M.set({ ...base, sit: fear < 0.3 ? 1 : 0, tailUp: 0.1 });
        else M.set(base);
        if (this.bt > 2 && chance(dt * 0.05)) this.meow(fear > 0.4 ? 'meowShort' : 'meow');
        // trust: answers the player's gaze with a slow blink
        if (this.trust > 0.55 && fear < 0.2 && d < 3.5 && this.playerLooking() && chance(dt * 0.25)) this.model.slowBlink();
        if (this.bt > 6 && fear < 0.2 && chance(dt * 0.015)) this.model.yawn();
        if (chance(dt * 0.006)) this.model.headShake();
        break;
      case 'wander': M.set(base); if (!this.path) this.decideT = Math.min(this.decideT, 0.2); break;
      case 'groom':
        M.set({ ...base, sit: 1, groom: this.bt > 1 ? 1 : 0, lid: 0.6 });
        if (this.bt > 8) this.setBehavior('idle');
        break;
      case 'sleep': {
        const s = this.bdata.spot;
        const arrived = s && (s.perch ? this.perch && this.perch.name === s.perch : !this.path);
        if (arrived) {
          M.set({ ...relaxed, loaf: 1, headPitch: 0.5, lid: 0.05, tailUp: -0.2, tailSway: 0.02, tailCurve: 0.8, earL: 0, earR: 0 });
          this.energy = Math.min(1, this.energy + dt / 120);
          // dreaming: paws and whiskers twitch
          if (chance(dt * 0.12)) this.model.flick[chance(0.5) ? 'aL' : 'aR'] = 1;
          if (this.energy > 0.98) this.setBehavior('idle');
        } else M.set(base);
        break;
      }
      case 'window': {
        if (this.perch && this.perch.window) {
          M.set({ ...base, sit: 1, tailUp: 0.0, crouch: 0 });
          this.stareAt = V(this.perch.pos.x + Math.sin(G.time * 0.1) * 3, 4, -20);
          // late days: hisses at the sky
          if (G.story.day >= 3 && this.bt > 4 && chance(dt * 0.15) && G.director && G.director.nightness > 0.5) { this.hiss(); M.set({ arch: 0.6, puff: 0.6, earFlat: 1 }); }
          if (this.bt > 25) { this.stareAt = null; this.setBehavior('idle'); }
        } else M.set(base);
        break;
      }
      case 'eat': {
        const bowl = G.apartment.bowl;
        if (!this.path) {
          this.faceTo(bowl.pos, dt);
          M.set({ ...base, crouch: 0.3, eat: 1, headYaw: 0, sniff: this.bt < 1.4 ? 1 : 0, whisk: 0.5 });
          if (this.bt < 1.4) break;
          if (!this.eatLoop) this.eatLoop = G.audio && G.audio.loop('catEat', { pos: this.headPos(), vol: 0.45 });
          bowl.fill(bowl.level - dt * 0.025);
          this.hunger = Math.max(0, this.hunger - dt * 0.03);
          if (bowl.level <= 0.02 || this.hunger < 0.05) { this.setBehavior('groom'); emit('catAte'); }
          if (fear > 0.55) this.setBehavior('flee');
        } else M.set(base);
        break;
      }
      case 'drink': {
        const wb = G.apartment.waterBowl;
        if (!this.path) {
          this.faceTo(wb.pos, dt);
          M.set({ ...base, crouch: 0.35, eat: 1, tongue: this.bt > 0.8 ? 0.8 : 0, sniff: this.bt < 0.8 ? 1 : 0 });
          if (!this.eatLoop) this.eatLoop = G.audio && G.audio.loop('catLap', { pos: this.headPos(), vol: 0.35 });
          if (this.bt > 6) this.setBehavior('idle');
        } else M.set(base);
        break;
      }
      case 'beg': {
        // follow the player, meowing, and lead them to the bowl
        const bowl = G.apartment.bowl.pos;
        const nearBowl = this.pos.distanceTo(bowl) < 0.6;
        if (d > 1.4 && !this.path && this.bt % 6 < 3) this.goto(this.playerPos.clone(), 0.55);
        else if (!this.path && !nearBowl && this.bt % 6 >= 3) this.goto(bowl.clone().add(V(-0.3, 0, 0)), 0.5);
        M.set({ ...base, sit: this.path ? 0 : 1, tailUp: 0.6 });
        if (chance(dt * 0.4)) this.meow(chance(0.5) ? 'meowPlead' : 'meow');
        break;
      }
      case 'greet': {
        // walk to the player's legs and weave around them, purring
        const p = this.playerPos;
        if (d > 0.55 && (!this.path || this.bt % 2 < dt)) this.goto(V(p.x, 0, p.z), 0.45);
        if (d < 0.7) {
          const a = G.time * 1.3;
          this.bdata.circle = this.bdata.circle ?? 0;
          this.bdata.circle += dt;
          const tgt = V(p.x + Math.cos(a) * 0.35, 0, p.z + Math.sin(a) * 0.35);
          this.path = [this.pos.clone(), tgt]; this.pi = 1; this.moveSpeed = 0.3;
          if (!this.purr) { this.purr = G.audio && G.audio.loop('purr', { pos: this.headPos(), vol: 0.55 }); sfx('trill', { pos: this.headPos(), vol: 0.5 }); }
          M.set({ ...base, tailUp: 0.9, tailSway: 0.08, tailTip: 1, purr: 1, whisk: 0.4, lid: 0.7, headTilt: Math.sin(G.time * 2) * 0.2 });
          if (this.bdata.circle > 6) { this.social = 0; this.setBehavior('idle'); }
        } else M.set({ ...base, tailUp: 0.8, tailTip: 0.8, whisk: 0.4 });
        break;
      }
      case 'follow': if (d > 2 && (!this.path || this.bt % 2 < dt)) this.goto(this.playerPos.clone(), 0.5); M.set(base); if (d < 2) this.setBehavior('idle'); break;
      case 'play': {
        if (!this.toy || this.toy.dead) { this.toy = null; this.setBehavior('idle'); break; }
        const tp = this.toy.mesh.position;
        if (this.bt % 1 < dt) this.goto(V(tp.x, 0, tp.z), 1.4);
        M.set({ ...base, crouch: 0.5, tailTwitch: 0.8, earFlat: 0, whisk: 0.8, pupil: 0.8 });
        if (this.pos.distanceTo(V(tp.x, 0, tp.z)) < 0.25) {
          // pounce: bat the toy
          const b = this.toy.body;
          b.wakeUp(); b.velocity.set((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2);
          sfx('catLand', { pos: this.pos, vol: 0.3 });
          if (chance(0.3)) { this.toy = null; this.setBehavior('groom'); }
        }
        if (this.bt > 20) { this.toy = null; this.setBehavior('idle'); }
        break;
      }
      case 'flee': {
        M.set({ ...base, crouch: 0.7, earFlat: 1, tailUp: -0.6, puff: 0.4 });
        if (!this.path) this.setBehavior('hide', { hide: this.bdata.hide });
        break;
      }
      case 'hide': {
        const h = this.bdata.hide;
        if (!this.path && this.pos.distanceTo(h.pos) > 0.15) { this.path = [this.pos.clone(), h.pos.clone()]; this.pi = 1; this.moveSpeed = 0.25; }
        M.set({ ...base, crouch: 1, loaf: this.path ? 0 : 0.6, earFlat: smoothstep(0.2, 0.6, fear), tailUp: -0.5, lid: 0.9 });
        if (d < 1.2 && fear > 0.45 && G.time - this.lastHiss > 2.5) { this.hiss(); M.set({ arch: 0.3, puff: 0.7 }); }
        else if (d < 2 && fear > 0.35 && chance(dt * 0.3)) sfx('catGrowl', { pos: this.headPos(), vol: 0.5 });
        if (fear < 0.15 && this.bt > 10) this.setBehavior('idle');
        break;
      }
      case 'defend': {
        // halloween-cat: arched back, puffed fur, sideways, hiss; swat if the hand comes closer
        this.path = null;
        M.set({ ...base, arch: 1, puff: 1, earFlat: 1, crouch: 0, tailUp: 0.5, tailCurve: -0.4, legSpread: 0.6, sideBend: 0.4 });
        if (this.bt < dt * 2 || G.time - this.lastHiss > 2) this.hiss();
        if (d < 0.75 && G.time - this.lastScratch > 2) this.scratchPlayer(chance(0.5) ? 'R' : 'L');
        if (this.bt > 2.5) this.setBehavior('flee');
        break;
      }
      case 'petted': {
        const calm = this.fear < 0.35 && this.trust > 0.3;
        this.petT += dt;
        this.path = null;
        if (calm) {
          M.set({ ...base, sit: this.petT > 1.5 ? 1 : 0, lid: 0.35, tailUp: 0.8, tailTip: 0.5, purr: 1, knead: this.petT > 3 && this.trust > 0.6 ? 1 : 0, headTilt: Math.sin(G.time * 1.5) * 0.25, neckUp: 0.4, earFlat: 0 });
          if (chance(dt * 0.6)) this.model.twitch(M.by.spine2.getWorldPosition(V()).add(V(0, 0.07, 0)));
          if (this.trust > 0.5 && chance(dt * 0.15)) this.model.slowBlink();
          if (!this.purr) this.purr = G.audio && G.audio.loop('purr', { pos: this.headPos(), vol: 0.6 });
          this.annoy += dt * (0.05 + WRONG[G.story.day] * 0.3);
          this.trust = Math.min(1, this.trust + dt * 0.004);
          this.social = Math.max(0, this.social - dt * 0.1);
          if (this.annoy > 1) { this.endPet(); this.setBehavior('wander'); }
        } else {
          M.set({ ...base, earFlat: 1, tailTwitch: 1, crouch: 0.4 });
          if (chance(dt * 2)) this.model.twitch(M.by.spine1.getWorldPosition(V()).add(V(0, 0.08, 0)));
          if (this.petT > 0.8 && G.time - this.lastHiss > 2) { this.hiss(); }
          if (this.petT > 1.4 && this.fear > 0.5) { this.scratchPlayer('R'); this.endPet(); this.setBehavior('flee'); }
          else if (this.petT > 2.2) { this.endPet(); this.setBehavior('flee'); }
        }
        break;
      }
      default: M.set(base);
    }
    if (this.stretchT > 0) { this.stretchT -= dt; if (!this.path) M.set({ stretch: this.stretchT > 0.6 ? 1 : 0, sit: 0, loaf: 0, tailUp: 0.6 }); }
    // startle: jump back
    if (this.startle > 0.6 && this.behavior !== 'flee' && this.behavior !== 'hide' && this.behavior !== 'defend') { this.startle = 0.3; this.fear = Math.min(1, this.fear + 0.3); M.set({ puff: 0.8, earFlat: 1 }); this.setBehavior(this.fear > 0.55 ? 'flee' : 'idle'); }
    // defend when cornered
    if (fear > 0.65 && d < 0.85 && this.behavior !== 'defend' && this.behavior !== 'flee' && !this.path) this.setBehavior('defend');
    // a thrown toy rolling nearby triggers play
    if (!this.toy && this.fear < 0.4 && this.behavior !== 'sleep' && this.behavior !== 'eat') {
      const toy = G.world.items.find((i) => i.def.toy && !i.prop.held && i.body.velocity.length() > 0.6 && i.mesh.position.distanceTo(this.pos) < 4);
      if (toy) { this.toy = toy; this.decideT = 0; }
    }
  }

  startPet() {
    if (this.held) { this.petting = true; this.petT = 0; return; }
    if (this.distPlayer() > 1.5) return;
    this.petting = true; this.petT = 0;
    if (this.behavior === 'hide' && this.fear > 0.3) { this.hiss(); if (this.fear > 0.5) this.scratchPlayer('R'); return; }
    this.setBehavior('petted');
  }
  endPet() {
    this.petting = false;
    if (this.behavior === 'petted') this.setBehavior(this.fear > 0.4 ? 'wander' : 'idle');
  }

  faceTo(p, dt) { const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z)); this.yaw = dampAngle(this.yaw, want, 6, dt); }

  locomote(dt) {
    const M = this.model;
    let moving = false;
    if (this.path && this.pi < this.path.length) {
      const tgt = this.path[this.pi];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) { this.pi++; if (this.pi >= this.path.length) { this.arrive(); } }
      else {
        const want = Math.atan2(-dx, -dz);
        const turn = wrapAngle(want - this.yaw);
        const rate = this.moveSpeed > 1 ? 9 : 5;
        const before = this.yaw;
        this.yaw = dampAngle(this.yaw, want, rate, dt);
        M.set({ sideBend: clamp(wrapAngle(this.yaw - before) / dt * 0.15, -0.5, 0.5) });
        // slow down for sharp turns, ease in/out
        const sp = this.moveSpeed * clamp(1 - Math.abs(turn) / 2.2, 0.15, 1) * clamp(dist / 0.3 + 0.3, 0.3, 1);
        this.speed = damp(this.speed, sp, 5, dt);
        const nx = this.pos.x - Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z - Math.cos(this.yaw) * this.speed * dt;
        // don't walk into the player
        const pp = this.playerPos;
        if (Math.hypot(nx - pp.x, nz - pp.z) > 0.32 || this.behavior === 'greet') { this.pos.x = nx; this.pos.z = nz; }
        moving = true;
      }
    }
    if (!moving) { this.speed = damp(this.speed, 0, 8, dt); M.set({ sideBend: 0 }); if (!this.path) this.path = null; }
    // footsteps (soft)
    if (moving) {
      this.stepAcc = (this.stepAcc || 0) + this.speed * dt;
      if (this.stepAcc > 0.12) { this.stepAcc = 0; if (this.speed > 1.5) sfx('catStep', { pos: this.pos, vol: 0.35 }); }
    }
  }

  arrive() {
    this.path = null;
    const pt = this.bdata.perchTarget;
    if (pt && this.pos.distanceTo(pt.from) < 0.25) {
      this.bdata.perchTarget = null;
      this.startJump(this.pos.clone(), pt.pos.clone(), pt.pos.y, pt);
    }
    if (this.behavior === 'flee') this.setBehavior('hide', { hide: this.bdata.hide });
  }

  updateJump(dt) {
    const j = this.jump;
    const M = this.model;
    j.t += dt;
    if (j.t < 0) { // anticipation: crouch, butt wiggle, look at the target
      this.faceTo(j.to, dt * 2);
      M.set({ crouch: 0.9, sit: 0, loaf: 0, tailTwitch: 0.5, earFlat: 0, hipsY: 0.215 + Math.sin(G.time * 30) * 0.004 });
      return;
    }
    const dur = 0.42;
    const p = clamp(j.t / dur);
    const flat = j.from.clone().lerp(j.to, p);
    this.pos.set(flat.x, 0, flat.z);
    const peak = Math.max(j.fromH, j.toH) + 0.25;
    this.h = lerp(j.fromH, j.toH, p) + Math.sin(Math.PI * p) * (peak - Math.max(j.fromH, j.toH) + 0.05);
    M.set({ crouch: 0, stretch: p < 0.5 ? 0.6 : 0, hipsY: 0.215, bodyPitch: (j.toH > j.fromH ? -0.4 : 0.35) * Math.sin(Math.PI * p) });
    if (p >= 1) {
      this.h = j.toH;
      this.jump = null;
      M.set({ bodyPitch: 0, stretch: 0 });
      sfx('catLand', { pos: this.pos.clone().add(V(0, this.h, 0)), vol: 0.45 });
      if (j.perch) { this.perch = j.perch; }
    }
  }

  // ------------------------------------------------------------- held
  updateHeld(dt) {
    const M = this.model;
    this.heldT += dt;
    if (this.petting) this.tolerance += dt * 0.6;
    const calm = this.heldT < this.tolerance;
    if (calm) {
      this.struggle = Math.max(0, this.struggle - dt);
      M.set({ held: 1, sit: 0, loaf: 0, crouch: 0, lid: this.petting ? 0.4 : 0.85, tailUp: -0.4, tailSway: 0.1, earFlat: this.fear * 0.8, puff: 0, purr: this.petting && this.fear < 0.3 ? 1 : 0, knead: this.petting && this.trust > 0.7 ? 0.7 : 0 });
      if (this.petting && !this.purr && this.fear < 0.3) this.purr = G.audio && G.audio.loop('purr', { pos: this.headPos(), vol: 0.6 });
      if (!this.petting && this.purr) { this.purr.stop(0.4); this.purr = null; }
    } else {
      // wriggles, then scratches its way out
      this.struggle += dt;
      M.set({ held: 1, earFlat: 1, tailTwitch: 1, puff: 0.3 });
      if (this.purr) { this.purr.stop(0.2); this.purr = null; }
      G.player.ctrl.shake = Math.max(G.player.ctrl.shake, 0.25);
      if (this.struggle > 0.2 && chance(dt * 2)) this.meow('meowShort');
      if (this.struggle > 1.8) { this.scratchPlayer(chance(0.5) ? 'L' : 'R'); this.putDown(true); }
    }
    this.fear = Math.min(this.fear, 0.9);
    // let go with LMB / RMB / G
    if (this.heldT > 0.35 && (G.input.mousePressed(0) || G.input.mousePressed(2) || G.input.pressed('KeyG'))) this.putDown(false);
  }
  placeHeld() {
    const cam = G.camera;
    const wig = this.struggle > 0.2 ? Math.sin(G.time * 22) * 0.04 : 0;
    const p = V(0.02 + wig, -0.36, -0.46).applyMatrix4(cam.matrixWorld);
    const c = G.player.ctrl;
    this.pos.set(p.x, p.y - 0.2, p.z);
    this.h = 0;
    this.yaw = c.yaw + 1.35 + wig * 2;
    this.model.root.position.set(p.x, p.y - 0.2, p.z);
    this.model.root.rotation.set(wig, this.yaw, 0.1);
  }

  // where the player's hands go when holding/petting the cat
  handTargets() {
    const M = this.model;
    if (this.held) {
      const chest = M.by.chest.getWorldPosition(V()), hips = M.by.hips.getWorldPosition(V());
      const down = V(0, -1, 0);
      return {
        R: { p: hips.clone().add(V(0, -0.06, 0)), F: G.player.ctrl.flatForward(V()).add(V(0, 0.3, 0)).normalize(), N: V(0, 1, 0), pose: 'gripLarge', w: 1 },
        L: { p: chest.clone().add(V(0, -0.07, 0)), F: G.player.ctrl.flatForward(V()).add(V(0, 0.3, 0)).normalize(), N: V(0, 1, 0), pose: this.petting ? 'pet' : 'gripLarge', w: 1 },
      };
    }
    if (this.petting && this.behavior === 'petted') {
      const s1 = M.by.spine2.getWorldPosition(V()), h = M.by.head.getWorldPosition(V());
      const k = 0.5 + 0.5 * Math.sin(G.time * 3.2);
      const p = h.clone().lerp(s1, k).add(V(0, 0.07, 0));
      const dir = s1.clone().sub(h).normalize();
      return { R: { p: p.addScaledVector(dir, -0.05), F: dir, N: V(0, -1, 0), pose: 'pet', w: 1 } };
    }
    return null;
  }

  serialize() { return { trust: this.trust, present: this.present }; }
}
