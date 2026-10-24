// Hidden hunger. There is no bar: it shows through stomach growls, cravings,
// dizziness, trembling, vision effects and the internal voice.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { clamp, damp, rand, pick, smoothstep } from '../core/util.js';

// hunger gain per real minute, per day
const RATE = [0, 0.075, 0.085, 0.11, 0.14, 0.17, 0.22, 0.25];

const LINES = {
  mild: ["I'm hungry.", "My stomach won't shut up.", "I should eat something.", "Is it lunch already?"],
  strong: ["I need to eat. Now.", "So hungry... my hands are shaking.", "There has to be more food somewhere.", "I can smell the fridge from here.", "It's all I can think about."],
  severe: ["Eat. Eat. Eat.", "I'm so empty. Something inside is so empty.", "Anything. I'll eat anything.", "It's eating me from the inside.", "Feed it."],
  full: ["That's better.", "...okay. Okay.", "Still hungry, but better."],
  notEnough: ["It's not enough.", "Why is it never enough?", "More. It wants more.", "I just ate and I'm starving."],
  raw: ["It's cold and it tastes like pennies... I don't care.", "I shouldn't be doing this.", "Raw. I ate it raw."],
  cat: ["...I'm eating cat food. I'm eating cat food.", "It's not that bad. That's the worst part."],
};

export class Hunger {
  constructor() {
    this.value = 0.3;     // 0 sated .. 1 starving
    this.thirst = 0.2;
    this.lineCd = 25;
    this.growlCd = 12;
    this.starveT = 0;
    this.dizzy = 0;       // smoothed effect intensity
    this.satedT = 0;      // brief relief after eating
    this.ateToday = 0;
    this.frozen = false;
    this.craving = null;
  }
  get level() { return this.value; }
  eat(n, meta = {}) {
    const day = G.story.day;
    // the thing inside takes its share; later days food does less
    const eff = n * (day >= 6 ? 0.55 : day >= 4 ? 0.75 : 1);
    this.value = clamp(this.value - eff * 1.35, 0, 1);
    this.satedT = 6;
    this.ateToday += n;
    emit('ate', { n, ...meta });
    G.audio && G.audio.play('swallow', { vol: 0.5, delay: 0.3 });
    if (meta.raw && Math.random() < 0.6) this.say(pick(LINES.raw), 1.2);
    else if (meta.catfood) this.say(pick(LINES.cat), 1.2);
    else if (day >= 4 && this.value > 0.25 && Math.random() < 0.5) this.say(pick(LINES.notEnough), 1.4);
    else if (this.value < 0.15 && Math.random() < 0.4) this.say(pick(LINES.full), 1.2);
  }
  drink(n, meta = {}) {
    this.thirst = clamp(this.thirst - n * 4, 0, 1);
    this.value = clamp(this.value - n * 0.25, 0, 1);
    this.dizzy *= 0.7;
    if (meta.coffee) this.coffeeT = 90;
  }
  say(t, delay = 0) {
    if (delay) setTimeout(() => G.hud.inner(t), delay * 1000); else G.hud.inner(t);
    this.lineCd = 18 + Math.random() * 14;
  }
  update(dt) {
    const day = G.story.day;
    if (!this.frozen && G.state === 'play') {
      this.value = clamp(this.value + (RATE[day] ?? 0.2) / 60 * dt, 0, 1);
      this.thirst = clamp(this.thirst + 0.04 / 60 * dt, 0, 1);
    }
    this.satedT = Math.max(0, this.satedT - dt);
    if (this.coffeeT) this.coffeeT = Math.max(0, this.coffeeT - dt);
    const v = this.value;
    const inPlay = G.state === 'play' && !G.director?.cutscene;
    // ---- growls
    this.growlCd -= dt * (0.4 + v * 1.6);
    if (inPlay && v > 0.32 && this.growlCd <= 0) {
      const loud = clamp((v - 0.3) * 1.6, 0.2, 1);
      G.audio && G.audio.play(v > 0.75 ? 'growlBig' : 'growl', { vol: loud, rate: 0.85 + Math.random() * 0.3 });
      if (G.player && G.player.body) G.player.body.stomachPulse(loud);
      if (v > 0.75) emit('noise', { pos: G.player.ctrl.body.position.clone ? new THREE.Vector3().copy(G.player.ctrl.body.position) : null, loud: 0.25 * loud, kind: 'growl' });
      this.growlCd = rand(16, 30);
    }
    // ---- internal voice
    this.lineCd -= dt;
    if (inPlay && this.lineCd <= 0 && this.satedT <= 0) {
      if (v > 0.85) this.say(pick(LINES.severe));
      else if (v > 0.62) this.say(pick(LINES.strong));
      else if (v > 0.45) this.say(pick(LINES.mild));
      else this.lineCd = 10;
    }
    // ---- physical effects
    const target = smoothstep(0.55, 1.0, v) * (this.satedT > 0 ? 0.4 : 1) + this.thirst * 0.15;
    this.dizzy = damp(this.dizzy, target, 0.6, dt);
    // starving: blackout risk
    if (v >= 0.995 && inPlay) { this.starveT += dt; if (this.starveT > 35) { this.starveT = 0; emit('starveBlackout'); } }
    else this.starveT = Math.max(0, this.starveT - dt);
  }
  // values consumed by camera / post fx / body
  get sway() { return this.dizzy * 1.2; }
  get tremble() { return smoothstep(0.6, 1, this.value) * 0.6; }
  serialize() { return { value: this.value, thirst: this.thirst }; }
}
