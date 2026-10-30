// Web Audio engine. Buses, CC0 UI samples, procedurally synthesized SFX and loops,
// babble voices for dialogue, and a music slot that src/audio/music.js fills with tracks.
import { game } from './game.js';
import { clamp } from './util.js';

const SR = 44100;

// ---------- tiny offline DSP toolkit (runs on Float32Arrays) ----------
const white = () => Math.random() * 2 - 1;
class OnePole {
  constructor(fc, hp = false) { this.hp = hp; this.y = 0; this.x = 0; this.set(fc); }
  set(fc) { this.a = 1 - Math.exp((-2 * Math.PI * fc) / SR); }
  run(x) { this.y += this.a * (x - this.y); return this.hp ? x - this.y : this.y; }
}
class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) { this.type = type; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f, q, gainDb); }
  set(f, q = this.q, gainDb = 0) {
    this.q = q; const w = (2 * Math.PI * clamp(f, 10, SR * 0.49)) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (this.type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else { const A = Math.pow(10, gainDb / 40); b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}
function mk(sec, fn) { const n = Math.max(1, Math.floor(sec * SR)); const d = new Float32Array(n); fn(d, n); return d; }
const expEnv = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
function normalize(d, peak = 0.9) { let m = 1e-9; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); const g = peak / m; for (let i = 0; i < d.length; i++) d[i] *= g; return d; }
function fadeEdges(d, ms = 4) { const n = Math.floor((ms / 1000) * SR); for (let i = 0; i < n && i < d.length; i++) { const g = i / n; d[i] *= g; d[d.length - 1 - i] *= g; } return d; }
// Make a buffer loop seamlessly by crossfading its tail into its head.
function loopify(d, xfSec = 0.25) {
  const n = Math.floor(xfSec * SR), out = new Float32Array(d.length - n);
  for (let i = 0; i < out.length; i++) out[i] = d[i];
  for (let i = 0; i < n; i++) { const g = i / n; out[i] = d[i] * g + d[out.length + i] * (1 - g); }
  return out;
}
function mix(...arrs) { const n = Math.max(...arrs.map((a) => a.length)); const o = new Float32Array(n); for (const a of arrs) for (let i = 0; i < a.length; i++) o[i] += a[i]; return o; }
function delayAt(d, sec) { const o = new Float32Array(d.length + Math.floor(sec * SR)); o.set(d, Math.floor(sec * SR)); return o; }

// Impacts: noise burst + resonant body.
function impact({ dur = 0.5, body = 90, bodyDecay = 0.12, noiseLP = 2500, noiseDecay = 0.05, click = 0.6, drop = 0.5 }) {
  return normalize(mk(dur, (d, n) => {
    const lp = new OnePole(noiseLP), bp = new Biquad('bp', body * 2.3, 3);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, f = body * (1 + drop * Math.exp(-t / 0.03));
      ph += (2 * Math.PI * f) / SR;
      const nz = white();
      d[i] = Math.sin(ph) * Math.exp(-t / bodyDecay) * 0.9 + lp.run(nz) * Math.exp(-t / noiseDecay) * click + bp.run(nz) * Math.exp(-t / (bodyDecay * 0.7)) * 0.4;
    }
  }));
}
function sweepNoise(dur, f0, f1, q = 1.2, shape = (t) => Math.sin(Math.PI * t)) {
  return normalize(mk(dur, (d, n) => {
    const bp = new Biquad('bp', f0, q);
    for (let i = 0; i < n; i++) { const u = i / n; if (i % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, u), q); d[i] = bp.run(white()) * shape(u); }
  }));
}
function tone(dur, f, { type = 'sine', decay = 0.3, attack = 0.005, vib = 0, glide = 0, harm = [1] } = {}) {
  return mk(dur, (d, n) => {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; const ff = f * (1 + glide * t) * (1 + vib * Math.sin(2 * Math.PI * 5.5 * t));
      ph += (2 * Math.PI * ff) / SR;
      let s = 0; harm.forEach((a, k) => { s += a * (type === 'sine' ? Math.sin(ph * (k + 1)) : Math.sign(Math.sin(ph * (k + 1))) * 0.5); });
      d[i] = s * expEnv(t, attack, decay);
    }
  });
}
// Formant "vocal" synth for creatures (cat / baby). pitch(t) -> Hz, formants(t) -> [f1,f2], amp(t)
function creature(dur, pitch, formants, amp, { breath = 0.15, rough = 0 } = {}) {
  return normalize(mk(dur, (d, n) => {
    const f1 = new Biquad('bp', 700, 6), f2 = new Biquad('bp', 1200, 8), f3 = new Biquad('bp', 2600, 8);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n, t = i / SR;
      if (i % 64 === 0) { const [a, b] = formants(u); f1.set(a, 5); f2.set(b, 7); f3.set(b * 2.1, 9); }
      const p = pitch(u) * (1 + rough * (Math.random() - 0.5) * 0.2);
      ph += p / SR; ph -= Math.floor(ph);
      const src = (2 * ph - 1) * 0.6 + white() * breath;
      d[i] = (f1.run(src) * 1.0 + f2.run(src) * 0.7 + f3.run(src) * 0.25) * amp(u, t);
    }
  }), 0.8);
}

// ---------- the SFX library (each returns a Float32Array at SR) ----------
const SFX = {
  thud: () => impact({ dur: 0.6, body: 55, bodyDecay: 0.16, noiseLP: 900, click: 0.5 }),
  punch: () => normalize(mix(impact({ dur: 0.35, body: 80, bodyDecay: 0.07, noiseLP: 4000, noiseDecay: 0.025, click: 1 }), sweepNoise(0.18, 3000, 600, 0.8, (u) => Math.exp(-u * 6)).map((v) => v * 0.4))),
  kick: () => normalize(mix(impact({ dur: 0.9, body: 70, bodyDecay: 0.2, noiseLP: 3000, click: 1, drop: 1 }), delayAt(impact({ dur: 0.4, body: 180, bodyDecay: 0.05 }), 0.04).map((v) => v * 0.4))),
  door_break: () => normalize(mix(impact({ dur: 1.2, body: 60, bodyDecay: 0.3, noiseLP: 5000, noiseDecay: 0.12, click: 1.2 }),
    ...[0.02, 0.07, 0.11, 0.2].map((t, k) => delayAt(sweepNoise(0.12, 4000 - k * 600, 1500, 2, (u) => Math.exp(-u * 8)), t)))),
  glass: () => normalize(mk(1.6, (d, n) => {
    const pings = Array.from({ length: 26 }, () => ({ f: 2500 + Math.random() * 6000, t0: Math.random() * 0.35, dec: 0.05 + Math.random() * 0.25, ph: 0 }));
    const hp = new OnePole(3000, true);
    for (let i = 0; i < n; i++) {
      const t = i / SR; let s = hp.run(white()) * Math.exp(-t / 0.08) * 0.8;
      for (const p of pings) if (t > p.t0) { p.ph += (2 * Math.PI * p.f) / SR; s += Math.sin(p.ph) * Math.exp(-(t - p.t0) / p.dec) * 0.25; }
      d[i] = s;
    }
  })),
  explosion: () => normalize(mk(4.5, (d, n) => {
    const lp = new Biquad('lp', 900, 0.9), lp2 = new OnePole(120); let crack = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, u = i / n; lp.set(900 * Math.exp(-t * 0.9) + 80, 0.9);
      if (Math.random() < 0.002 * (1 - u)) crack = 1;
      crack *= 0.995;
      d[i] = lp.run(white()) * expEnv(t, 0.01, 1.1) * 1.4 + lp2.run(white()) * expEnv(t, 0.05, 2.0) * 3 + white() * crack * 0.25 * (1 - u);
    }
  })),
  whoosh: () => sweepNoise(0.9, 300, 2400, 1.4, (u) => Math.pow(Math.sin(Math.PI * u), 2)),
  whoosh_low: () => sweepNoise(1.4, 120, 700, 1, (u) => Math.pow(Math.sin(Math.PI * u), 1.5)),
  step: () => normalize(mk(0.12, (d, n) => { const lp = new OnePole(1100); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(white()) * expEnv(t, 0.004, 0.025); } }), 0.5),
  boot: () => normalize(mix(impact({ dur: 0.25, body: 95, bodyDecay: 0.04, noiseLP: 2500, noiseDecay: 0.02, click: 0.8 }), delayAt(sweepNoise(0.08, 3000, 2000, 2, (u) => 1 - u), 0.03).map((v) => v * 0.2)), 0.7),
  cuff: () => normalize(mix(...[0, 0.06, 0.09].map((t) => delayAt(tone(0.15, 3200 + Math.random() * 900, { decay: 0.03, harm: [1, 0.5, 0.3] }), t)))),
  meow: () => creature(0.75, (u) => 520 + 260 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 150 * u, (u) => [600 + 700 * Math.sin(Math.PI * u), 1300 + 900 * u], (u) => Math.sin(Math.PI * Math.pow(u, 0.7)), { breath: 0.08 }),
  mrrp: () => creature(0.28, (u) => 380 + 220 * u, (u) => [500 + 300 * u, 1400], (u) => Math.sin(Math.PI * u), { breath: 0.1, rough: 1 }),
  yowl: () => creature(1.6, (u) => 420 + 380 * Math.sin(Math.PI * u * 1.2) + 60 * Math.sin(u * 60), (u) => [500 + 600 * Math.sin(Math.PI * u), 1200 + 500 * Math.sin(Math.PI * u * 2)], (u) => Math.pow(Math.sin(Math.PI * u), 0.6), { breath: 0.2, rough: 2 }),
  hiss: () => normalize(mk(0.9, (d, n) => { const bp = new Biquad('hp', 2500, 0.7); for (let i = 0; i < n; i++) { const u = i / n; d[i] = bp.run(white()) * Math.min(1, u * 20) * Math.exp(-u * 2.5); } }), 0.7),
  baby_coo: () => creature(0.6, (u) => 620 + 200 * Math.sin(Math.PI * u) + 40 * Math.sin(u * 70), (u) => [800 + 300 * Math.sin(Math.PI * u), 1900], (u) => Math.sin(Math.PI * u), { breath: 0.05 }),
  baby_giggle: () => normalize(mix(...[0, 0.13, 0.25, 0.36, 0.46].map((t, k) => delayAt(creature(0.12, (u) => 700 + k * 30 + 200 * u, () => [900, 2100], (u) => Math.sin(Math.PI * u), { breath: 0.2 }), t)))),
  baby_cry: () => creature(2.0, (u) => 560 + 160 * Math.sin(u * 9) + 260 * Math.sin(Math.PI * u) + 30 * Math.sin(u * 300), (u) => [900 + 200 * Math.sin(u * 12), 2200], (u) => Math.pow(Math.abs(Math.sin(u * Math.PI * 3)), 0.5), { breath: 0.12, rough: 1.5 }),
  baby_scream: () => normalize(mk(2.4, (d, n) => {
    const bp = new Biquad('bp', 1800, 3); let ph = 0, rm = 0;
    for (let i = 0; i < n; i++) { const u = i / n, t = i / SR; const f = 900 + 700 * Math.sin(u * 11) + 400 * u; ph += f / SR; rm += (2 * Math.PI * 73) / SR;
      d[i] = (bp.run(((ph % 1) * 2 - 1) + white() * 0.3) * Math.sin(rm) * 1.5 + Math.sin(2 * Math.PI * ph * 0.5) * 0.3) * Math.min(1, t * 10) * (1 - u * 0.5); }
  })),
  phone_ring: () => normalize(mk(2.2, (d, n) => {
    for (let i = 0; i < n; i++) { const t = i / SR; const on = (t % 0.06) < 0.03 ? 1 : 0.3; const burst = (t < 0.9 || (t > 1.1 && t < 2.0)) ? 1 : 0;
      d[i] = burst * on * (Math.sin(2 * Math.PI * 1150 * t) * 0.6 + Math.sin(2 * Math.PI * 1380 * t) * 0.4 + Math.sin(2 * Math.PI * 2300 * t) * 0.15); }
  }), 0.6),
  crt_on: () => normalize(mix(impact({ dur: 0.5, body: 60, bodyDecay: 0.1, noiseLP: 800, click: 0.4 }), tone(1.4, 15600, { decay: 0.9, attack: 0.05 }).map((v) => v * 0.12), delayAt(sweepNoise(0.5, 2000, 6000, 3), 0.05).map((v) => v * 0.2))),
  crt_off: () => normalize(mix(tone(0.6, 300, { decay: 0.12, glide: -0.8 }), sweepNoise(0.3, 6000, 1000, 2, (u) => 1 - u).map((v) => v * 0.3))),
  gas_click: () => normalize(mix(...[0, 0.11, 0.2].map((t) => delayAt(impact({ dur: 0.05, body: 3000, bodyDecay: 0.004, noiseLP: 8000, noiseDecay: 0.003, click: 1 }), t)))),
  gas_whoosh: () => normalize(mk(0.8, (d, n) => { const lp = new Biquad('lp', 600, 0.8); for (let i = 0; i < n; i++) { const u = i / n; d[i] = lp.run(white()) * Math.min(1, u * 25) * Math.exp(-u * 4); } })),
  tear: () => normalize(mk(0.45, (d, n) => { const bp = new Biquad('bp', 2600, 1.5); for (let i = 0; i < n; i++) { const u = i / n; const g = Math.random() < 0.3 ? 1 : 0.2; d[i] = bp.run(white() * g) * Math.sin(Math.PI * u); } })),
  shake: () => normalize(mk(0.5, (d, n) => { const bp = new Biquad('bp', 4500, 1.2); for (let i = 0; i < n; i++) { const u = i / n; const g = Math.pow(Math.abs(Math.sin(u * Math.PI * 4)), 6); d[i] = bp.run(white()) * g * (Math.random() < 0.5 ? 1 : 0); } }), 0.6),
  slurp: () => normalize(mk(0.9, (d, n) => { const bp = new Biquad('bp', 900, 4); for (let i = 0; i < n; i++) { const u = i / n; if (i % 64 === 0) bp.set(600 + 1400 * u + 200 * Math.sin(u * 40), 5); d[i] = bp.run(white()) * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(u * 90)); } })),
  clink: () => normalize(mix(tone(0.5, 2650, { decay: 0.12, harm: [1, 0, 0.4, 0, 0.2] }), tone(0.4, 4120, { decay: 0.06 }).map((v) => v * 0.5)), 0.6),
  crack: () => normalize(mix(impact({ dur: 0.18, body: 900, bodyDecay: 0.01, noiseLP: 7000, noiseDecay: 0.01, click: 1 }), delayAt(sweepNoise(0.25, 800, 300, 3, (u) => Math.exp(-u * 4)), 0.03).map((v) => v * 0.4))),
  plop: () => normalize(mix(tone(0.25, 380, { decay: 0.05, glide: 4 }), sweepNoise(0.2, 800, 2500, 2, (u) => Math.exp(-u * 8)).map((v) => v * 0.3))),
  splash: () => normalize(mk(0.8, (d, n) => { const lp = new OnePole(3500); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(white()) * expEnv(t, 0.01, 0.18) * (0.7 + 0.3 * Math.sin(t * 200)); } })),
  knock: () => normalize(mix(...[0, 0.22, 0.4].map((t) => delayAt(impact({ dur: 0.18, body: 140, bodyDecay: 0.04, noiseLP: 1800, noiseDecay: 0.01, click: 0.6 }), t)))),
  wall_knock: () => normalize(mix(...[0, 0.5, 0.85, 1.6].map((t) => delayAt(impact({ dur: 0.3, body: 70, bodyDecay: 0.08, noiseLP: 400, noiseDecay: 0.02, click: 0.3 }), t)))),
  doorbell: () => normalize(mix(tone(1.6, 660, { decay: 0.7, harm: [1, 0.3, 0.1] }), delayAt(tone(1.6, 523, { decay: 0.9, harm: [1, 0.3, 0.1] }), 0.45))),
  heartbeat: () => normalize(mix(tone(0.25, 55, { decay: 0.07, glide: -0.6 }), delayAt(tone(0.25, 50, { decay: 0.08, glide: -0.6 }), 0.22))),
  rumble: () => normalize(mk(3, (d, n) => { const lp = new OnePole(70), lp2 = new OnePole(40); for (let i = 0; i < n; i++) { const u = i / n; d[i] = lp2.run(lp.run(white())) * Math.sin(Math.PI * u); } })),
  beam: () => normalize(mk(2.5, (d, n) => { let ph = 0, ph2 = 0; for (let i = 0; i < n; i++) { const u = i / n, t = i / SR; ph += (2 * Math.PI * (220 + 30 * Math.sin(t * 7))) / SR; ph2 += (2 * Math.PI * 331) / SR; d[i] = (Math.sin(ph) * 0.5 + Math.sin(ph2) * 0.4 + Math.sin(ph * 4.01) * 0.2) * Math.sin(Math.PI * u) * (0.8 + 0.2 * Math.sin(t * 40)); } })),
  shimmer: () => normalize(mix(...Array.from({ length: 14 }, (_, k) => delayAt(tone(0.9, 1200 * Math.pow(2, (k % 7) / 6) * (k > 6 ? 2 : 1), { decay: 0.35 }), k * 0.05)))),
  twinkle: () => normalize(mix(...[0, 0.07, 0.15].map((t, k) => delayAt(tone(0.4, [2093, 2637, 3136][k], { decay: 0.12 }), t))), 0.5),
  zap: () => normalize(mk(0.45, (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const u = i / n; ph += (2 * Math.PI * (900 - 700 * u)) / SR; d[i] = (Math.sign(Math.sin(ph)) * 0.4 + white() * 0.6) * Math.exp(-u * 4) * (Math.random() < 0.7 ? 1 : 0); } })),
  pop: () => normalize(tone(0.12, 600, { decay: 0.02, glide: 3 })),
  boing: () => normalize(tone(0.7, 180, { decay: 0.3, vib: 0.08, glide: 1.8 })),
  squeak: () => normalize(tone(0.25, 1800, { decay: 0.08, vib: 0.05, glide: 0.8 }), 0.6),
  rattle: () => normalize(mk(0.6, (d, n) => { const bp = new Biquad('bp', 3200, 2); for (let i = 0; i < n; i++) { const u = i / n; d[i] = bp.run(Math.random() < 0.04 ? white() * 4 : 0) * (1 - u); } })),
  cloth: () => sweepNoise(0.45, 1800, 900, 0.6, (u) => Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.random())),
  creak: () => normalize(mk(1.2, (d, n) => { const bp = new Biquad('bp', 500, 12); let ph = 0; for (let i = 0; i < n; i++) { const u = i / n; ph += (2 * Math.PI * (40 + 25 * Math.sin(u * 5))) / SR; const pulse = Math.pow(Math.max(0, Math.sin(ph)), 30); d[i] = bp.run(pulse * 3 + white() * 0.02) * Math.sin(Math.PI * u); } })),
  switch: () => normalize(mix(impact({ dur: 0.08, body: 2200, bodyDecay: 0.005, noiseLP: 9000, noiseDecay: 0.004 }), delayAt(impact({ dur: 0.06, body: 1600, bodyDecay: 0.004 }), 0.035)), 0.6),
  paper: () => sweepNoise(0.35, 3500, 5000, 0.9, (u) => Math.sin(Math.PI * u) * (Math.random() < 0.6 ? 1 : 0.3)),
  gasp: () => normalize(mk(0.6, (d, n) => { const bp = new Biquad('bp', 1400, 1.5); for (let i = 0; i < n; i++) { const u = i / n; d[i] = bp.run(white()) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.6)), 2); } })),
  gulp: () => normalize(mix(tone(0.2, 180, { decay: 0.05, glide: 2 }), delayAt(tone(0.15, 240, { decay: 0.04, glide: 2.5 }), 0.18))),
  cash: () => normalize(mix(tone(0.6, 2093, { decay: 0.2, harm: [1, 0, 0.3] }), delayAt(tone(0.8, 2637, { decay: 0.3, harm: [1, 0, 0.3] }), 0.08), impact({ dur: 0.2, body: 400, bodyDecay: 0.03 }).map((v) => v * 0.4))),
  stomach: () => normalize(mk(1.4, (d, n) => { const bp = new Biquad('bp', 120, 6); for (let i = 0; i < n; i++) { const u = i / n; if (i % 64 === 0) bp.set(90 + 140 * Math.sin(u * 7) ** 2, 8); d[i] = bp.run(white()) * Math.sin(Math.PI * u); } })),
  sting: () => normalize(mk(2.5, (d, n) => { const v = [1, 1.059, 1.414, 1.5, 2.12]; const ph = v.map(() => 0); for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; v.forEach((r, k) => { ph[k] += (2 * Math.PI * 220 * r * (1 + 0.004 * Math.sin(t * 6 + k))) / SR; s += ((ph[k] / Math.PI) % 2 - 1) * 0.2; }); d[i] = s * expEnv(t, 0.02, 0.9); } })),
  gong: () => normalize(mix(...[1, 1.48, 2.1, 2.9, 3.7].map((r, k) => tone(4, 90 * r, { decay: 1.5 - k * 0.2, vib: 0.002 })))),
  sparkle_up: () => normalize(mix(...Array.from({ length: 8 }, (_, k) => delayAt(tone(0.5, 880 * Math.pow(2, k / 4), { decay: 0.15 }), k * 0.06)))),
  scrub: () => normalize(mk(0.4, (d, n) => { const bp = new Biquad('bp', 2000, 1); for (let i = 0; i < n; i++) { const u = i / n; d[i] = bp.run(white()) * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(u * 60)); } }), 0.5),
  pour_short: () => normalize(mk(1, (d, n) => { const bp = new Biquad('bp', 1200, 2); for (let i = 0; i < n; i++) { const u = i / n; if (i % 128 === 0) bp.set(900 + Math.random() * 900, 3); d[i] = bp.run(white()) * Math.sin(Math.PI * u); } })),
  helmet_hit: () => normalize(mix(impact({ dur: 0.4, body: 300, bodyDecay: 0.06, click: 1 }), tone(0.5, 1250, { decay: 0.15, harm: [1, 0.3, 0.6] }).map((v) => v * 0.6))),
  taser: () => normalize(mk(1.0, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.random() < 0.5 ? 1 : -1) * ((t * 60) % 1 < 0.5 ? 1 : 0.1) * 0.7 * Math.min(1, t * 30); } })),
};

// Loops: generated longer, then loopified.
const LOOPS = {
  boil: () => loopify(normalize(mk(4.3, (d, n) => {
    const bubbles = Array.from({ length: 160 }, () => ({ t: Math.random() * 4.3, f: 300 + Math.random() * 900, ph: 0 }));
    const lp = new OnePole(800);
    for (let i = 0; i < n; i++) { const t = i / SR; let s = lp.run(white()) * 0.25; for (const b of bubbles) { const dt = t - b.t; if (dt > 0 && dt < 0.05) { b.ph += (2 * Math.PI * b.f * (1 + dt * 30)) / SR; s += Math.sin(b.ph) * Math.exp(-dt / 0.012) * 0.5; } } d[i] = s; }
  }), 0.7)),
  pour: () => loopify(normalize(mk(3.3, (d, n) => { const bp = new Biquad('bp', 1000, 1.5), lp = new OnePole(5000); for (let i = 0; i < n; i++) { if (i % 256 === 0) bp.set(700 + Math.random() * 1400, 2); d[i] = bp.run(white()) * 0.7 + lp.run(white()) * 0.2; } }), 0.6)),
  flame: () => loopify(normalize(mk(3.3, (d, n) => { const lp = new Biquad('lp', 380, 0.7); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(white()) * (0.8 + 0.2 * Math.sin(t * 13)); } }), 0.5)),
  static: () => loopify(normalize(mk(2.3, (d, n) => { const hp = new OnePole(800, true); for (let i = 0; i < n; i++) d[i] = hp.run(white()) * (Math.random() < 0.002 ? 3 : 1); }), 0.3)),
  rain: () => loopify(normalize(mk(6.3, (d, n) => { const lp = new OnePole(2200), hp = new OnePole(300, true); for (let i = 0; i < n; i++) { const drop = Math.random() < 0.003 ? white() * 4 : 0; d[i] = hp.run(lp.run(white())) * 0.6 + drop * 0.3; } }), 0.5)),
  city: () => loopify(normalize(mk(8.3, (d, n) => {
    const lp = new OnePole(180), lp2 = new OnePole(900);
    const horns = Array.from({ length: 3 }, () => ({ t: Math.random() * 7, f: 330 + Math.random() * 200 }));
    for (let i = 0; i < n; i++) { const t = i / SR; let s = lp.run(white()) * 1.4 + lp2.run(white()) * 0.08;
      for (const h of horns) { const dt = t - h.t; if (dt > 0 && dt < 0.35) s += (Math.sin(2 * Math.PI * h.f * t) + Math.sin(2 * Math.PI * h.f * 1.26 * t)) * 0.015 * Math.sin(Math.PI * dt / 0.35); }
      d[i] = s; }
  }), 1.0)),
  hum: () => loopify(normalize(mk(2.3, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 100 * t) * 0.5 + Math.sin(2 * Math.PI * 200 * t) * 0.25 + Math.sin(2 * Math.PI * 300 * t) * 0.1 + white() * 0.03 * (Math.sin(t * 3) > 0.95 ? 6 : 1); } }), 0.2)),
  siren: () => loopify(normalize(mk(4.3, (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (650 + 250 * Math.sin(t * Math.PI * 0.5 * 2))) / SR; d[i] = (Math.sin(ph) + 0.3 * Math.sin(ph * 2)) * 0.5; } }), 0.3)),
  heli: () => loopify(normalize(mk(3.3, (d, n) => { const lp = new OnePole(300); for (let i = 0; i < n; i++) { const t = i / SR; const chop = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 11 * t)), 6); d[i] = lp.run(white()) * (0.3 + chop * 2.2); } }), 0.3)),
  alarm: () => loopify(normalize(mk(2.3, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const on = (t % 1.15) < 0.75; const f = 440 + 120 * ((t % 1.15) / 0.75); d[i] = on ? Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.3 + Math.sin(2 * Math.PI * f * 2 * t) * 0.2 : 0; } }), 0.05)),
  purr: () => loopify(normalize(mk(3.3, (d, n) => { const lp = new OnePole(260); for (let i = 0; i < n; i++) { const t = i / SR; const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.45 * t); const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 26 * t)), 3); d[i] = lp.run(white() * pulse * 3) * (0.4 + 0.6 * env); } }), 0.4)),
  drone: () => loopify(normalize(mk(3.3, (d, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (180 + 4 * Math.sin(t * 9))) / SR; d[i] = ((ph / Math.PI) % 2 - 1) * 0.3 + Math.sin(ph * 2) * 0.2 + white() * 0.05; } }), 0.3)),
  ship: () => loopify(normalize(mk(5.3, (d, n) => { const lp = new OnePole(90); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * (48 + 3 * Math.sin(t * 1.3))) / SR; d[i] = Math.sin(ph) * 0.5 + Math.sin(ph * 1.5) * 0.25 + lp.run(white()) * 1.6; } }), 0.6)),
  wind: () => loopify(normalize(mk(6.3, (d, n) => { const bp = new Biquad('bp', 400, 0.8); for (let i = 0; i < n; i++) { const t = i / SR; if (i % 256 === 0) bp.set(300 + 250 * Math.sin(t * 0.7) + 120 * Math.sin(t * 2.3), 1.2); d[i] = bp.run(white()); } }), 0.8)),
  scrub: () => loopify(normalize(mk(2.3, (d, n) => { const bp = new Biquad('bp', 2200, 1); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = bp.run(white()) * (0.5 + 0.5 * Math.abs(Math.sin(t * 9))); } }), 0.2)),
  heartbeat: () => { const hb = SFX.heartbeat(); const d = new Float32Array(Math.floor(SR * 0.9)); d.set(hb.subarray(0, Math.min(hb.length, d.length))); return d; },
  fairy: () => loopify(normalize(mk(6.3, (d, n) => { const notes = Array.from({ length: 22 }, () => ({ t: Math.random() * 6, f: [1568, 2093, 2349, 2637, 3136][Math.floor(Math.random() * 5)] })); for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (const no of notes) { const dt = t - no.t; if (dt > 0 && dt < 0.6) s += Math.sin(2 * Math.PI * no.f * dt) * Math.exp(-dt / 0.15) * 0.2; } d[i] = s; } }), 0.4)),
};

// UI sample map (CC0 files from the uisfx package; see README credits).
const UI = {
  'menu.hover': 'cinematic-hover', 'menu.select': 'cinematic-select', 'menu.open': 'cinematic-open', 'menu.close': 'cinematic-close',
  'menu.start': 'cinematic-start', 'menu.back': 'cinematic-back', 'menu.success': 'cinematic-success', 'menu.swipe': 'cinematic-swipe',
  'menu.warning': 'cinematic-warning', 'menu.checkpoint': 'cinematic-checkpoint', 'menu.achievement': 'cinematic-achievement',
  'os.press': 'mechanical-press', 'os.release': 'mechanical-release', 'os.open': 'mechanical-open', 'os.close': 'mechanical-close',
  'os.error': 'mechanical-error', 'os.notify': 'mechanical-notification', 'os.type': 'mechanical-typing', 'os.drag': 'mechanical-drag-start',
  'os.drop': 'mechanical-drop', 'os.snap': 'mechanical-snap', 'os.on': 'mechanical-toggle-on', 'os.off': 'mechanical-toggle-off',
  'os.dbl': 'mechanical-double-click', 'os.warning': 'mechanical-warning', 'os.complete': 'mechanical-complete', 'os.receive': 'mechanical-receive',
  'os.send': 'mechanical-send', 'os.connect': 'mechanical-connect', 'os.disconnect': 'mechanical-disconnect',
  'arcade.reward': 'arcade-reward', 'arcade.error': 'arcade-error', 'arcade.levelup': 'arcade-level-up', 'arcade.bonus': 'arcade-bonus',
  'arcade.start': 'arcade-start', 'arcade.stop': 'arcade-stop',
  'world.lift': 'organic-drag-start', 'world.drop': 'organic-drop', 'world.snap': 'organic-snap', 'world.check': 'organic-check', 'world.release': 'organic-release',
  'magic.achievement': 'dreamy-achievement', 'magic.complete': 'dreamy-complete', 'magic.unlock': 'dreamy-unlock', 'magic.levelup': 'dreamy-level-up',
  'sci.scan': 'scifi-scanning', 'sci.process': 'scifi-processing', 'sci.connect': 'scifi-connecting', 'sci.notify': 'scifi-notification',
  'sci.wake': 'scifi-wake', 'sci.sleep': 'scifi-sleep',
  'qte.press': 'zen-press', 'qte.success': 'zen-success', 'qte.error': 'zen-error', 'qte.check': 'zen-check',
};

// Babble voice presets. pitch Hz, spread semitones, syllables/sec, formant scale, extra flags.
const VOICES = {
  man: { pitch: 120, spread: 3, rate: 11, fs: 1.0, wave: 'sawtooth' },
  sunny: { pitch: 132, spread: 4, rate: 12, fs: 1.0, wave: 'sawtooth' },
  gary: { pitch: 210, spread: 7, rate: 9, fs: 1.25, wave: 'triangle', warble: 9 },
  soldier: { pitch: 95, spread: 2, rate: 13, fs: 0.9, wave: 'square', radio: true },
  general: { pitch: 78, spread: 3, rate: 9, fs: 0.85, wave: 'sawtooth' },
  agent: { pitch: 105, spread: 1.5, rate: 10, fs: 0.95, wave: 'sawtooth', radio: true },
  baby: { pitch: 420, spread: 6, rate: 8, fs: 1.6, wave: 'triangle', warble: 14 },
  cat: { pitch: 360, spread: 5, rate: 6, fs: 1.4, wave: 'triangle', glide: 1 },
  tofu: { pitch: 72, spread: 2, rate: 8, fs: 0.8, wave: 'sawtooth', reverb: 0.4 },
  ghost: { pitch: 180, spread: 2, rate: 7, fs: 1.1, wave: 'sine', reverb: 0.9, tremolo: 6, breathy: true },
  old: { pitch: 190, spread: 3, rate: 8, fs: 1.15, wave: 'sawtooth', tremolo: 7 },
  kid: { pitch: 300, spread: 5, rate: 13, fs: 1.35, wave: 'triangle' },
  woman: { pitch: 215, spread: 4, rate: 12, fs: 1.18, wave: 'sawtooth' },
  robot: { pitch: 110, spread: 0, rate: 10, fs: 1.0, wave: 'square' },
  choir: { pitch: 160, spread: 0, rate: 4, fs: 1.0, wave: 'sawtooth', chorus: [1, 1.26, 1.5, 0.5], reverb: 0.8 },
};
const VOWELS = { a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [350, 800], y: [320, 2000] };
const TTS = { man: [0.9, 1], sunny: [1, 1.05], gary: [1.6, 0.85], soldier: [0.6, 1.2], general: [0.3, 0.9], agent: [0.7, 1],
  baby: [2, 0.8], cat: [1.8, 0.8], tofu: [0.2, 0.8], ghost: [0.4, 0.7], old: [1.2, 0.8], kid: [1.8, 1.15], woman: [1.3, 1.05], robot: [0.1, 1], choir: [0.5, 0.6] };

export class AudioEngine {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC({ latencyHint: 'interactive' }) : null;
    this.buffers = new Map();
    this.samples = new Map();
    this.tracks = new Map();
    this.current = null;
    if (!this.ctx) return;
    const c = this.ctx;
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -6; this.limiter.knee.value = 6; this.limiter.ratio.value = 8;
    this.master.connect(this.limiter).connect(c.destination);
    this.bus = {};
    for (const b of ['music', 'sfx', 'ui', 'voice', 'amb']) { this.bus[b] = c.createGain(); this.bus[b].connect(this.master); }
    this.reverb = c.createConvolver(); this.reverb.buffer = this.makeIR(2.4, 2.2);
    this.reverbOut = c.createGain(); this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.send = c.createGain(); this.send.connect(this.reverb);
    // Muffle filter for "underwater"/fainting moments.
    this.applySettings();
    game.events.on('settings', () => this.applySettings());
    const unlock = () => { if (c.state !== 'running') c.resume(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
  }
  get ready() { return this.ctx && this.ctx.state === 'running'; }
  makeIR(sec, decay) {
    const c = this.ctx, n = Math.floor(sec * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); const lp = new OnePole(6000); for (let i = 0; i < n; i++) d[i] = lp.run(white()) * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1); }
    return b;
  }
  applySettings() {
    if (!this.ctx) return;
    const s = game.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.get('master'), t, 0.05);
    this.bus.music.gain.setTargetAtTime(s.get('music') * 0.8, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.get('sfx'), t, 0.05);
    this.bus.amb.gain.setTargetAtTime(s.get('sfx') * 0.8, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(s.get('sfx') * 0.9, t, 0.05);
    this.bus.voice.gain.setTargetAtTime(s.get('voice'), t, 0.05);
  }
  toBuffer(data) { const b = this.ctx.createBuffer(1, data.length, SR); b.copyToChannel(data, 0); return b; }
  buffer(name) {
    if (!this.ctx) return null;
    if (!this.buffers.has(name)) {
      const gen = SFX[name] || LOOPS[name];
      if (!gen) { console.warn('no sfx', name); return null; }
      this.buffers.set(name, this.toBuffer(fadeEdges(gen(), LOOPS[name] ? 0 : 3)));
    }
    return this.buffers.get(name);
  }
  // Pre-generate everything (called as a loader task, in slices).
  *prepareSteps() {
    for (const k of Object.keys(SFX)) { this.buffer(k); yield k; }
    for (const k of Object.keys(LOOPS)) { this.buffer(k); yield k; }
  }
  async loadSamples(baseUrl, urlFor) {
    if (!this.ctx) return;
    await Promise.all(Object.entries(UI).map(async ([k, file]) => {
      try {
        const url = urlFor ? urlFor(file) : `${baseUrl}/${file}.mp3`;
        const res = await fetch(url); const ab = await res.arrayBuffer();
        this.samples.set(k, await this.ctx.decodeAudioData(ab));
      } catch (e) { console.warn('sample failed', k, e); }
    }));
  }
  ui(name, { vol = 0.6, rate = 1 } = {}) {
    if (!this.ready) return;
    const b = this.samples.get(name); if (!b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g).connect(this.bus.ui); s.start();
  }
  sfx(name, { vol = 0.8, rate = 1, pan = 0, detune = 0.04, reverb = 0.15, delay = 0, bus = 'sfx' } = {}) {
    if (!this.ready) return null;
    const b = this.buffer(name); if (!b) return null;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = b;
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * detune) * Math.max(0.05, game.timeScale > 3 ? 1 : 1);
    const g = c.createGain(); g.gain.value = vol;
    let node = s.connect(g);
    if (pan) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node = node.connect(p); }
    node.connect(this.bus[bus]);
    if (reverb > 0) { const r = c.createGain(); r.gain.value = reverb; node.connect(r).connect(this.send); }
    s.start(c.currentTime + delay);
    return { source: s, gain: g, stop: (t = 0.05) => { g.gain.setTargetAtTime(0, c.currentTime, t); s.stop(c.currentTime + t * 5); } };
  }
  loop(name, { vol = 0.5, rate = 1, fadeIn = 0.5, bus = 'amb', lowpass = 0, reverb = 0.1 } = {}) {
    const dummy = { setVolume() {}, setRate() {}, setLowpass() {}, stop() {}, playing: false };
    if (!this.ctx) return dummy;
    const b = this.buffer(name); if (!b) return dummy;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = 0.0001;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass || 20000;
    s.connect(f).connect(g).connect(this.bus[bus]);
    if (reverb) { const r = c.createGain(); r.gain.value = reverb; g.connect(r).connect(this.send); }
    s.start(c.currentTime, Math.random() * b.duration);
    g.gain.setTargetAtTime(vol, c.currentTime, fadeIn / 3);
    let stopped = false;
    return {
      playing: true,
      setVolume: (v, t = 0.2) => { if (!stopped) g.gain.setTargetAtTime(Math.max(0.0001, v), c.currentTime, t / 3); },
      setRate: (r, t = 0.2) => { if (!stopped) s.playbackRate.setTargetAtTime(r, c.currentTime, t / 3); },
      setLowpass: (hz, t = 0.2) => { if (!stopped) f.frequency.setTargetAtTime(hz, c.currentTime, t / 3); },
      stop: (t = 0.4) => { if (stopped) return; stopped = true; g.gain.setTargetAtTime(0.0001, c.currentTime, t / 3); s.stop(c.currentTime + t * 2 + 0.05); },
    };
  }
  // Babble: one formant-filtered blip per syllable-ish chunk. Returns {done, stop}.
  babble(text, voice = 'man', { rate = 1, vol = 0.5 } = {}) {
    const spd = game.settings.get('textSpeed') || 1;
    const words = String(text).replace(/<[^>]+>/g, '');
    const estDur = Math.max(0.6, words.length / (15 * spd * rate));
    if (game.settings.get('tts') && window.speechSynthesis && !/baby|cat/.test(voice)) return this.speak(words, voice, estDur);
    if (!this.ready) { let tm; return { done: new Promise((r) => (tm = setTimeout(r, estDur * 1000))), stop: () => clearTimeout(tm) }; }
    const v = VOICES[voice] || VOICES.man, c = this.ctx;
    const out = c.createGain(); out.gain.value = vol;
    let chain = out;
    if (v.radio) {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const ws = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
      out.connect(hp).connect(ws).connect(lp); chain = lp;
    }
    chain.connect(this.bus.voice);
    if (v.reverb) { const r = c.createGain(); r.gain.value = v.reverb; chain.connect(r).connect(this.send); }
    const syll = words.toLowerCase().match(/[a-z']+|[0-9]+|[.,!?;:…-]/g) || [];
    let t = c.currentTime + 0.03; const step = 1 / (v.rate * rate * spd);
    const nodes = [];
    let seed = 0; for (const ch of words) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const w of syll) {
      if (/^[.,!?;:…-]$/.test(w)) { t += step * (w === ',' ? 1.6 : 3); continue; }
      const n = Math.max(1, Math.round(w.length / 2.6));
      for (let k = 0; k < n; k++) {
        const vowelCh = (w.match(/[aeiouy]/g) || ['a'])[k % Math.max(1, (w.match(/[aeiouy]/g) || ['a']).length)];
        const [F1, F2] = VOWELS[vowelCh] || VOWELS.a;
        const semis = (rnd() * 2 - 1) * v.spread + (k === n - 1 && /[?]/.test(words.slice(-1)) ? 3 : 0);
        const f0 = v.pitch * Math.pow(2, semis / 12);
        const dur = step * (0.75 + rnd() * 0.4);
        const voicesMul = v.chorus || [1];
        for (const mul of voicesMul) {
          const o = c.createOscillator(); o.type = v.wave; o.frequency.setValueAtTime(f0 * mul, t);
          if (v.glide) o.frequency.linearRampToValueAtTime(f0 * mul * 1.35, t + dur);
          else o.frequency.linearRampToValueAtTime(f0 * mul * (1 - 0.05 * rnd()), t + dur);
          if (v.warble) { const lfo = c.createOscillator(); lfo.frequency.value = v.warble * (0.8 + rnd() * 0.4); const lg = c.createGain(); lg.gain.value = f0 * 0.06; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05); }
          const b1 = c.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = F1 * v.fs; b1.Q.value = 5;
          const b2 = c.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = F2 * v.fs; b2.Q.value = 7;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(v.breathy ? 0.5 : 0.9, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(b1).connect(g); o.connect(b2).connect(g);
          let gOut = g;
          if (v.tremolo) { const tg = c.createGain(); const lfo = c.createOscillator(); lfo.frequency.value = v.tremolo; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(tg.gain); lfo.start(t); lfo.stop(t + dur + 0.05); g.connect(tg); gOut = tg; }
          gOut.connect(out);
          o.start(t); o.stop(t + dur + 0.05);
          nodes.push(o);
        }
        t += step;
      }
      t += step * 0.35;
    }
    const total = Math.max(0.3, t - c.currentTime);
    let tm; const done = new Promise((r) => (tm = setTimeout(r, total * 1000)));
    return { done, duration: total, stop: () => { clearTimeout(tm); nodes.forEach((o) => { try { o.stop(); } catch { /* already */ } }); out.disconnect(); } };
  }
  speak(text, voice, estDur) {
    const [pitch, rate] = TTS[voice] || [1, 1];
    const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate * (game.settings.get('textSpeed') || 1); u.volume = game.settings.get('voice') * game.settings.get('master');
    let res; const done = new Promise((r) => (res = r)); u.onend = res; u.onerror = res;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(res, estDur * 3000 + 2000);
    return { done, stop: () => { speechSynthesis.cancel(); res(); } };
  }
  registerTrack(name, factory) { this.tracks.set(name, factory); }
  // Crossfade to a registered music track. factory(ctx, outNode) -> { stop(fadeSec) }
  music(name, { fade = 2 } = {}) {
    if (!this.ctx) return;
    if (this.current?.name === name) return;
    if (this.current) { const cur = this.current; try { cur.inst.stop(fade); } catch (e) { console.warn(e); } setTimeout(() => cur.out.disconnect(), fade * 1000 + 3000); }
    this.current = null;
    if (!name) return;
    const f = this.tracks.get(name); if (!f) { console.warn('no track', name); return; }
    const out = this.ctx.createGain(); out.gain.value = 0.0001; out.connect(this.bus.music);
    const rs = this.ctx.createGain(); rs.gain.value = 0.35; out.connect(rs).connect(this.send);
    out.gain.setTargetAtTime(1, this.ctx.currentTime, fade / 3);
    const inst = f(this.ctx, out);
    this.current = { name, inst, out };
  }
  // Global muffle (e.g. underwater / fainting / time-stop moments).
  duck(amount = 0.3, sec = 0.5) {
    if (!this.ctx) return;
    this.bus.music.gain.setTargetAtTime(game.settings.get('music') * 0.8 * amount, this.ctx.currentTime, sec / 3);
  }
  unduck(sec = 1) { this.applySettings(); }
}

export const SFX_NAMES = Object.keys(SFX);
export const LOOP_NAMES = Object.keys(LOOPS);
