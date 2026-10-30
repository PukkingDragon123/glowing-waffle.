// Procedural animation for humanoid rigs (Sunny, soldiers, General, Gary).
// Base pose + crossfades + additive layers + walk cycle + two-bone IK + look-at + face.
import * as THREE from 'three';
import { clamp, lerp, damp, noise1 } from '../core/util.js';

const S = Math.sin, C = Math.cos;
const DOWN = 0.62; // lower the A-pose arms to the sides
const tmp = new THREE.Vector3();

// Mirror a pose map: L<->R, negate y and z rotations.
function sym(map) {
  const out = { ...map };
  for (const k of Object.keys(map)) {
    if (k.endsWith('.L')) { const v = map[k]; out[k.replace('.L', '.R')] = [v[0], -v[1], -v[2]]; }
  }
  return out;
}
const hand = (curl = 0.3, thumb = 0.2, index = curl) => sym({ 'fingers.L': [0, 0, -curl], 'index.L': [0, 0, -index], 'thumb.L': [0, -thumb * 0.5, -thumb] });
const merge = (...maps) => { const o = {}; for (const m of maps) for (const k in m) { if (!o[k]) o[k] = [0, 0, 0]; o[k] = [o[k][0] + m[k][0], o[k][1] + m[k][1], o[k][2] + m[k][2]]; } return o; };

export const POSES = {
  tpose: () => ({}),
  idle: (t) => merge(sym({ 'upperarm.L': [0.04, 0, -DOWN + 0.015 * S(t * 1.3)], 'forearm.L': [-0.2, 0.15, 0], 'hand.L': [0, -0.2, 0.08] }), hand(0.35, 0.25),
    { spine: [0.01 * S(t * 1.5), 0.02 * S(t * 0.4), 0.01 * S(t * 0.33)], chest: [0.015 * S(t * 1.5 + 0.5), 0, 0], neck: [0.05, 0, 0], head: [0.02 * S(t * 0.7), 0.04 * S(t * 0.3), 0] }),
  pregnant: (t) => merge(POSES.idle(t), { spine: [-0.07, 0, 0], chest: [-0.03, 0, 0], neck: [0.08, 0, 0], _hip: [0, 0, 0.015],
    'thigh.L': [0, -0.08, -0.04], 'thigh.R': [0, 0.08, 0.04] }),
  tired: (t) => merge(POSES.pregnant(t), { spine: [0.08, 0, 0], neck: [0.15, 0, 0], head: [0.1, 0, 0.06 * S(t * 0.5)], 'upperarm.L': [0, 0, 0.04], 'upperarm.R': [0, 0, -0.04] }),
  sit: (t) => merge(POSES.idle(t), sym({ 'thigh.L': [-1.5, -0.1, -0.05], 'shin.L': [1.45, 0, 0], 'foot.L': [0.05, 0, 0] }), { _hip: [0, -0.43, -0.02], spine: [0.04, 0, 0] }),
  sitBack: (t) => merge(POSES.sit(t), { spine: [-0.22, 0, 0], chest: [-0.08, 0, 0], neck: [0.2, 0, 0], _hip: [0, -0.02, 0.06] }, sym({ 'upperarm.L': [0.1, 0, 0.12], 'forearm.L': [-0.3, 0, 0] })),
  sitType: (t) => merge(POSES.sit(t), { spine: [0.14, 0, 0], neck: [0.05, 0, 0], head: [0.08, 0, 0] },
    sym({ 'upperarm.L': [-0.55, 0.15, -DOWN + 0.22], 'forearm.L': [-1.15, 0.6, 0], 'hand.L': [0.45, -0.25, -0.2] }), hand(0.25, 0.2, 0.15),
    { 'index.L': [0, 0, -0.35 * Math.max(0, S(t * 17))], 'fingers.R': [0, 0, 0.35 * Math.max(0, S(t * 13 + 1))], 'index.R': [0, 0, 0.3 * Math.max(0, S(t * 19 + 2))] }),
  crouch: (t) => merge(POSES.idle(t), sym({ 'thigh.L': [-1.45, -0.15, -0.12], 'shin.L': [2.1, 0, 0], 'foot.L': [-0.55, 0, 0] }), { _hip: [0, -0.5, -0.1], spine: [0.5, 0, 0], neck: [-0.3, 0, 0] }),
  kneel: (t) => merge(POSES.idle(t), { 'thigh.L': [-1.5, -0.1, -0.08], 'shin.L': [1.5, 0, 0], 'thigh.R': [0.05, 0.05, 0.05], 'shin.R': [1.6, 0, 0], 'foot.R': [-0.2, 0, 0], _hip: [0, -0.43, -0.12], spine: [0.15, 0, 0] }),
  floored: (t) => merge(sym({ 'thigh.L': [-1.2, -0.1, -0.1], 'shin.L': [2.4, 0, 0], 'foot.L': [0.6, 0, 0], 'upperarm.L': [-0.9, 0, -0.35], 'forearm.L': [-0.25, 0, 0], 'hand.L': [-0.6, 0, 0] }), hand(0.15, 0.1),
    { _hip: [0, -0.62, -0.2], spine: [0.75, 0, 0], chest: [0.25 + 0.03 * S(t * 3), 0, 0], neck: [-0.4, 0, 0], head: [-0.2, 0, 0] }),
  cower: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [-1.1, 0.3, -0.15], 'forearm.L': [-1.9, 0.4, 0], 'hand.L': [0.2, 0, 0.3], 'thigh.L': [-0.5, 0, -0.06], 'shin.L': [0.9, 0, 0], 'foot.L': [-0.4, 0, 0] }),
    { _hip: [0, -0.15, -0.05], spine: [0.35, 0.05 * S(t * 9), 0], neck: [0.3, 0, 0], head: [0.2, 0, 0] }, hand(0.6, 0.4)),
  reach: (t) => merge(POSES.idle(t), { 'upperarm.R': [-1.35, 0.1, DOWN - 0.25], 'forearm.R': [-0.15, 0, 0], 'hand.R': [0.1, 0, 0], spine: [0.22, -0.12, 0], chest: [0.1, -0.1, 0], 'upperarm.L': [-0.3, 0, 0], neck: [-0.15, 0, 0] }, hand(0.05, 0.05)),
  struggle: (t) => merge(POSES.reach(t), { spine: [0.3 + 0.08 * S(t * 7), 0.25 * S(t * 5), 0.1 * S(t * 6)], chest: [0.1, 0.2 * S(t * 5 + 1), 0], 'upperarm.L': [-1.0 + 0.3 * S(t * 8), 0, 0.3], 'forearm.L': [-0.6, 0, 0], 'thigh.L': [-0.3 + 0.2 * S(t * 7), 0, 0], 'shin.L': [0.4, 0, 0] }),
  handsBehind: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [0.6, 0, -DOWN + 0.15], 'forearm.L': [-0.9, -0.9, 0], 'hand.L': [0, 0, 0] }), { spine: [0.15, 0, 0], neck: [0.1, 0, 0] }),
  dragged: (t) => merge(POSES.handsBehind(t), sym({ 'thigh.L': [-0.25, 0, 0], 'shin.L': [0.9, 0, 0], 'foot.L': [0.6, 0, 0] }), { _hip: [0, -0.18, -0.05], spine: [0.5, 0, 0], neck: [0.45, 0, 0], head: [0.25, 0.1 * S(t), 0.1] }),
  limp: (t) => merge(POSES.dragged(t), { neck: [0.7, 0, 0], head: [0.3, 0, 0.2] }),
  handsUp: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [-0.2, 0, 0.75], 'forearm.L': [-2.0, -0.4, 0], 'hand.L': [0, 0, 0] }), hand(0.05, 0.1)),
  point: (t) => merge(POSES.idle(t), { 'upperarm.R': [-1.45, 0, DOWN - 0.35], 'forearm.R': [-0.05, 0, 0], 'hand.R': [0, 0, 0], 'fingers.R': [0, 0, 1.4], 'index.R': [0, 0, -0.05], 'thumb.R': [0, 0.3, 0.6], chest: [0, -0.15, 0] }),
  armsCrossed: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [-0.45, -0.3, -DOWN + 0.25], 'forearm.L': [-1.6, -1.0, 0], 'hand.L': [0, 0, 0.2] }), hand(0.5, 0.3), { spine: [-0.06, 0, 0], neck: [0.05, 0, 0] }),
  salute: (t) => merge(POSES.idle(t), { 'upperarm.R': [-0.3, 0, DOWN + 0.75], 'forearm.R': [-2.2, 0.5, 0], 'hand.R': [0.3, 0, 0.3] }),
  aim: (t) => merge(POSES.idle(t), { 'upperarm.R': [-1.05, 0.25, DOWN - 0.15], 'forearm.R': [-1.2, 0.6, 0], 'hand.R': [0.3, 0, 0.2], 'upperarm.L': [-1.25, -0.4, -DOWN + 0.35], 'forearm.L': [-0.6, -0.5, 0], spine: [0.08, 0.15, 0], neck: [-0.05, -0.15, 0] }, hand(0.7, 0.4)),
  strike: (t) => { const p = (t * 1.6) % 1, k = p < 0.35 ? -p / 0.35 : -((1 - (p - 0.35) / 0.65) ** 3); return merge(POSES.aim(t), { 'upperarm.R': [0.6 * k, 0, 0], 'upperarm.L': [0.7 * k, 0, 0], spine: [-0.3 * k, -0.2 * k, 0], chest: [-0.15 * k, -0.2 * k, 0] }); },
  kick: (t) => { const p = (t * 1.3) % 1, k = S(Math.PI * clamp(p * 1.6)); return merge(POSES.idle(t), { 'thigh.R': [-1.3 * k, 0, 0], 'shin.R': [0.9 * (1 - k) + 0.1, 0, 0], spine: [-0.2 * k, 0, 0], 'upperarm.L': [-0.4 * k, 0, 0.3 * k] }); },
  carry: (t) => merge(POSES.idle(t), { 'upperarm.L': [-0.1, 0, 0.1], 'forearm.L': [-0.05, 0, 0], 'fingers.L': [0, 0, -1.2], 'index.L': [0, 0, -1.1], spine: [0, 0, -0.06] }),
  holdBaby: (t) => merge(POSES.pregnant(t), { spine: [-0.04, 0.03 * S(t * 0.8), 0] }, hand(0.2, 0.15)),
  rock: (t) => merge(POSES.holdBaby(t), { spine: [0, 0.18 * S(t * 2.2), 0.04 * S(t * 2.2)], _hip: [0.03 * S(t * 2.2), 0, 0], 'thigh.L': [0, 0.1 * S(t * 2.2), 0], 'thigh.R': [0, 0.1 * S(t * 2.2), 0] }),
  levitate: (t) => merge(sym({ 'upperarm.L': [-0.1, 0, 0.35 + 0.08 * S(t * 2)], 'forearm.L': [-0.2, 0, 0], 'thigh.L': [-0.25, 0, -0.05], 'shin.L': [0.6, 0, 0], 'foot.L': [0.5, 0, 0] }), hand(0.05, 0.05),
    { spine: [-0.25, 0, 0], neck: [-0.35, 0, 0], head: [-0.2, 0, 0], _hip: [0, 0.05 * S(t * 1.5), 0] }),
  lie: (t) => merge(sym({ 'upperarm.L': [0.05, 0, -0.5], 'forearm.L': [-0.4, 0, 0], 'thigh.L': [-0.25, 0, 0], 'shin.L': [0.5, 0, 0] }), hand(0.4, 0.3), { spine: [0.008 * S(t * 1.2), 0, 0], head: [-0.1, 0, 0] }),
  cheer: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [-0.4, 0, 1.6 + 0.15 * S(t * 9)], 'forearm.L': [-0.5, 0, 0] }), hand(1.2, 0.8), { spine: [-0.15, 0, 0], _hip: [0, 0.04 * Math.abs(S(t * 9)), 0] }),
  shrug: (t) => merge(POSES.idle(t), sym({ 'upperarm.L': [-0.2, 0, -0.45], 'forearm.L': [-1.5, 0.9, 0], 'hand.L': [0, 0, 0.5], 'clav.L': [0, 0, 0.15] }), hand(0.05, 0.1), { head: [0, 0, 0.12] }),
  phone: (t) => merge(POSES.sit(t), { 'upperarm.R': [-0.6, 0, DOWN + 0.55], 'forearm.R': [-2.3, 0.3, 0], 'hand.R': [0.2, 0.3, 0.1], head: [0, 0, -0.12] }, hand(0.7, 0.5)),
};

const EXPR = {
  neutral: { lid: -0.72, brow: 0, browTilt: 0, jaw: 0 },
  happy: { lid: -0.55, brow: 0.003, browTilt: -0.06, jaw: 0.03 },
  worried: { lid: -0.85, brow: 0.004, browTilt: 0.35, jaw: 0.02 },
  fear: { lid: -1.0, brow: 0.007, browTilt: 0.42, jaw: 0.12 },
  angry: { lid: -0.45, brow: -0.004, browTilt: -0.4, jaw: 0.0 },
  pain: { lid: 0.1, brow: 0.002, browTilt: 0.5, jaw: 0.14 },
  shock: { lid: -1.05, brow: 0.009, browTilt: 0.15, jaw: 0.24 },
  sleepy: { lid: -0.15, brow: -0.002, browTilt: 0.1, jaw: 0.0 },
  closed: { lid: 0.55, brow: 0, browTilt: 0, jaw: 0 },
  scream: { lid: -0.95, brow: 0.008, browTilt: 0.4, jaw: 0.32 },
  smug: { lid: -0.4, brow: 0.004, browTilt: -0.25, jaw: 0 },
};

function resolveTarget(t, out) {
  if (!t) return null;
  if (t.isVector3) return out.copy(t);
  if (t.isObject3D) return t.getWorldPosition(out);
  if (typeof t === 'function') { const v = t(); return v ? out.copy(v) : null; }
  return null;
}

export class HumanAnimator {
  constructor(char, { pregnant = false, joints } = {}) {
    this.c = char; this.rig = char.rig; this.pregnant = pregnant;
    this.base = pregnant ? 'pregnant' : 'idle';
    this.fades = [{ name: this.base, w: 1, t0: Math.random() * 10 }];
    this.layers = new Map();
    this.walkW = 0; this.walkSpeed = 0; this.phase = 0; this.stride = 1.25;
    this.look = { target: null, w: 0, wt: 0 }; this.lookV = new THREE.Vector3();
    this.reaches = { L: { target: null, w: 0, wt: 0, pole: null }, R: { target: null, w: 0, wt: 0, pole: null } };
    this.exprName = 'neutral'; this.expr = { ...EXPR.neutral }; this.talkT = 0; this.talkAmp = 0;
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.time = Math.random() * 100; this.speedMul = 1;
    this.bellyKick = 0; this.bellyScale = 1;
    this.headRest = char.byName.head?.userData.rest;
    this.custom = null; // fn(rig, t) for one-off procedural motion
  }
  setPose(name, blend = 0.4) {
    if (this.fades.length && this.fades[this.fades.length - 1].name === name) return;
    this.fades.push({ name, w: blend <= 0 ? 1 : 0, rate: blend <= 0 ? 999 : 1 / blend, t0: 0 });
    if (blend <= 0) this.fades = [this.fades[this.fades.length - 1]];
    this.base = name;
  }
  layer(name, pose, weight = 1, blend = 0.3) {
    if (!pose) { const l = this.layers.get(name); if (l) l.target = 0; return; }
    const l = this.layers.get(name) || { w: 0, t0: 0 }; l.pose = pose; l.target = weight; l.rate = 1 / Math.max(0.01, blend); this.layers.set(name, l);
  }
  walking(speed) { this.walkSpeed = speed; }
  lookAt(target, w = 1) { this.look.target = target; this.look.wt = target ? w : 0; }
  reach(side, target, { w = 1, pole = null } = {}) { const r = this.reaches[side]; r.target = target; r.wt = target ? w : 0; r.pole = pole; }
  expression(name) { this.exprName = name; }
  talk(sec) { this.talkT = Math.max(this.talkT, sec); }
  kick() { this.bellyKick = 1; }

  update(dt, opts = {}) {
    const rig = this.rig; this.time += dt * this.speedMul; const t = this.time;
    if (opts.pose && opts.pose !== this.base && POSES[opts.pose]) this.setPose(opts.pose, 0.3);
    rig.begin();
    // base crossfade stack
    for (const f of this.fades) { f.w = Math.min(1, f.w + dt * (f.rate || 999)); f.t0 += dt; }
    while (this.fades.length > 1 && this.fades[this.fades.length - 1].w >= 1) this.fades.shift();
    let wsum = 0; const top = this.fades[this.fades.length - 1].w;
    const weights = this.fades.map((f, i) => (i === this.fades.length - 1 ? top : (1 - top) / Math.max(1, this.fades.length - 1)));
    const walkW = this.walkW = damp(this.walkW, this.walkSpeed > 0.05 ? 1 : 0, 8, dt);
    this.fades.forEach((f, i) => { const fn = POSES[f.name] || POSES.idle; rig.pose(fn(t), weights[i] * (1 - walkW * 0.85)); wsum += weights[i]; });
    // walk cycle
    if (walkW > 0.001) {
      const amp = clamp(this.walkSpeed / 1.2, 0.3, 1.25);
      this.phase += (this.walkSpeed * dt / this.stride) * Math.PI * 2;
      const p = this.phase, preg = this.pregnant ? 1 : 0;
      const wk = {
        'thigh.L': [-S(p) * 0.46 * amp, 0, -0.03 - preg * 0.05], 'thigh.R': [S(p) * 0.46 * amp, 0, 0.03 + preg * 0.05],
        'shin.L': [0.1 + 0.85 * amp * Math.pow(Math.max(0, C(p)), 1.4), 0, 0], 'shin.R': [0.1 + 0.85 * amp * Math.pow(Math.max(0, -C(p)), 1.4), 0, 0],
        'foot.L': [S(p) * 0.25 * amp - 0.1 * Math.max(0, C(p)), 0, 0], 'foot.R': [-S(p) * 0.25 * amp - 0.1 * Math.max(0, -C(p)), 0, 0],
        'upperarm.L': [S(p) * 0.38 * amp, 0, -DOWN + 0.05], 'upperarm.R': [-S(p) * 0.38 * amp, 0, DOWN - 0.05],
        'forearm.L': [-0.3 - 0.25 * amp * Math.max(0, -S(p)), 0.1, 0], 'forearm.R': [-0.3 - 0.25 * amp * Math.max(0, S(p)), -0.1, 0],
        hips: [0, 0.1 * S(p) * amp, (0.035 + preg * 0.05) * C(p)],
        spine: [0.04 * amp - preg * 0.08, -0.08 * S(p) * amp, -(0.02 + preg * 0.03) * C(p)], chest: [0, -0.1 * S(p) * amp, 0],
        neck: [0.05, 0.06 * S(p) * amp, 0], head: [0.02 * C(2 * p), 0.04 * S(p) * amp, (0.01 + preg * 0.02) * C(p)],
        _hip: [(0.012 + preg * 0.02) * S(p + Math.PI / 2), 0.025 * C(2 * p) * amp - 0.02 * amp, 0],
      };
      rig.pose(wk, walkW);
      rig.pose(hand(0.4, 0.3), walkW);
    }
    // additive layers
    for (const [name, l] of this.layers) {
      l.w = damp(l.w, l.target, l.rate * 3, dt); l.t0 += dt;
      if (l.w < 0.002 && l.target === 0) { this.layers.delete(name); continue; }
      const map = typeof l.pose === 'function' ? l.pose(t, l.t0) : typeof l.pose === 'string' ? POSES[l.pose](t) : l.pose;
      rig.pose(map, l.w);
    }
    // breathing (always), face
    rig.add('chest', 0.012 * S(t * 1.7), 0, 0);
    const E = EXPR[this.exprName] || EXPR.neutral;
    for (const k of ['lid', 'brow', 'browTilt', 'jaw']) this.expr[k] = damp(this.expr[k], E[k], 10, dt);
    this.talkT = Math.max(0, this.talkT - dt);
    const talkTarget = this.talkT > 0 ? 0.5 + 0.5 * Math.abs(noise1(t * 9, 3)) : 0;
    this.talkAmp = damp(this.talkAmp, talkTarget, 25, dt);
    rig.add('jaw', this.expr.jaw + this.talkAmp * 0.16, 0, 0);
    if (this.custom) this.custom(rig, t, dt);
    // belly: breathing + baby kicks
    if (this.c.byName.belly) {
      this.bellyKick = Math.max(0, this.bellyKick - dt * 2.5);
      const kk = Math.sin(this.bellyKick * Math.PI) * 0.06;
      rig.scale('belly', [this.bellyScale * (1 + 0.01 * S(t * 1.7)) + kk * 0.5, this.bellyScale * (1 + 0.008 * S(t * 1.7)), this.bellyScale * (1 + 0.012 * S(t * 1.7)) + kk]);
    }
    rig.apply();
    // IK reaches
    for (const side of ['L', 'R']) {
      const r = this.reaches[side];
      r.w = damp(r.w, r.wt, 6, dt);
      if (r.w > 0.002) {
        const tg = resolveTarget(r.target, tmp);
        if (tg) {
          const pole = r.pole ? resolveTarget(r.pole, new THREE.Vector3()) : rig.worldPos('upperarm.' + side).add(new THREE.Vector3(side === 'L' ? 0.4 : -0.4, -0.5, -0.4).applyQuaternion(this.c.root.quaternion));
          rig.ik('upperarm.' + side, 'forearm.' + side, 'hand.' + side, tg.clone(), pole, r.w);
        }
      }
    }
    // look-at
    this.look.w = damp(this.look.w, this.look.wt, 5, dt);
    const lt = this.look.w > 0.002 ? resolveTarget(this.look.target, this.lookV) : null;
    if (lt) rig.lookAt(lt, this.look.w);
    // eyes + lids + brows
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const ex = this.c.extras;
    const lid = lerp(this.expr.lid, 0.6, Math.sin(this.blink * Math.PI));
    for (const l of ex.lids || []) l.rotation.x = lid;
    for (const b of ex.brows || []) { b.position.y = b.userData.base.y + this.expr.brow; b.rotation.z = b.userData.side * (-0.08 + this.expr.browTilt); }
    if (ex.eyes?.length) {
      const target = lt || null;
      for (const e of ex.eyes) {
        if (target) {
          const wp = e.getWorldPosition(new THREE.Vector3());
          const m = new THREE.Matrix4().lookAt(target, wp, new THREE.Vector3(0, 1, 0));
          const q = new THREE.Quaternion().setFromRotationMatrix(m);
          const pq = e.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
          const local = pq.multiply(q);
          // clamp: blend toward forward
          e.quaternion.slerp(local, 0.35);
        } else e.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05 * noise1(t * 0.5, 1), 0.15 * noise1(t * 0.3, 2), 0)), 0.1);
      }
    }
  }
}
