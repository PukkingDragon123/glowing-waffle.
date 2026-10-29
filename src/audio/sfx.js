// Procedural sound library. Every generator returns a Float32Array (mono,
// 44.1kHz) or an array of variants. Nothing is sampled: all synthesis.
import { SR, Biquad, OnePole, Pink, render, ad, normalize, fadeEdges, mixInto, concat, silence, sat, makeLoop, modal, noiseBurst, white, rnd, clamp } from './dsp.js';

const TAU = Math.PI * 2;
const V = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

function thump(dur, f0, f1, decay, gain = 1) {
  let ph = 0;
  return render(dur, (i, t) => { const f = f1 + (f0 - f1) * Math.exp(-t / (decay * 0.5)); ph += TAU * f / SR; return Math.sin(ph) * Math.exp(-t / decay) * gain; });
}
function crackle(dur, density, { f = 3000, q = 1, decay = 0.003, env = (t) => 1 } = {}) {
  const out = new Float32Array(Math.floor(dur * SR));
  const bq = new Biquad('bp', f, q);
  let imp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (Math.random() < density / SR * env(t)) imp = rnd(0.4, 1) * (Math.random() < 0.5 ? -1 : 1);
    imp *= Math.exp(-1 / (decay * SR));
    out[i] = bq.p(imp * white() * 2 + imp);
  }
  return out;
}
function sweep(dur, f0, f1, envFn, type = 'sin') {
  let ph = 0;
  return render(dur, (i, t) => {
    const f = f0 + (f1 - f0) * (t / dur); ph += TAU * f / SR;
    const s = type === 'saw' ? ((ph / TAU) % 1) * 2 - 1 : Math.sin(ph);
    return s * envFn(t);
  });
}
function tone(dur, freqs, envFn) {
  return render(dur, (i, t) => { let s = 0; for (const f of freqs) s += Math.sin(TAU * f * t); return s / freqs.length * envFn(t); });
}

// ---------------------------------------------------------------- footsteps
function step(surface) {
  const dur = surface === 'metal' ? 0.35 : 0.22;
  const heel = thump(dur, 110, 55, 0.045, 0.8);
  const lp = new Biquad('lp', surface === 'carpet' ? 500 : 1400, 0.7);
  const body = render(dur, (i, t) => lp.p(white()) * ad(t, 0.002, 0.03) * 0.6);
  let out = heel.map((v, i) => v + body[i]);
  if (surface === 'wood') {
    const m = modal(dur, [[rnd(140, 180), 0.05, 0.4], [rnd(300, 360), 0.035, 0.25], [rnd(520, 600), 0.02, 0.15]]);
    out = out.map((v, i) => v + m[i]);
    if (Math.random() < 0.25) mixInto(out, creakRaw(0.18, rnd(50, 90), rnd(0.15, 0.3)), 0.02, 0.25);
  } else if (surface === 'tile') {
    const c = noiseBurst(dur, { f: rnd(2800, 4200), q: 2, d: 0.008 });
    out = out.map((v, i) => v * 0.6 + c[i] * 0.7);
  } else if (surface === 'concrete') {
    const c = noiseBurst(dur, { f: 1600, q: 0.8, d: 0.015 });
    const g = crackle(dur, 900, { f: 2500, decay: 0.002, env: (t) => Math.exp(-t / 0.03) });
    out = out.map((v, i) => v * 0.8 + c[i] * 0.5 + g[i] * 0.3);
  } else if (surface === 'carpet') {
    out = out.map((v) => v * 0.55);
  } else if (surface === 'metal') {
    const m = modal(dur, [[rnd(420, 480), 0.15, 0.3], [rnd(1100, 1200), 0.1, 0.2], [rnd(2100, 2300), 0.07, 0.12]]);
    out = out.map((v, i) => v * 0.7 + m[i]);
  } else if (surface === 'flesh') {
    out = wetSquelch(0.3, 0.8);
  }
  return normalize(fadeEdges(out), surface === 'carpet' ? 0.5 : 0.8);
}

// ---------------------------------------------------------------- wood / doors
function creakRaw(dur, baseHz, depth, res = [520, 1150, 2350]) {
  const out = new Float32Array(Math.floor(dur * SR));
  const bqs = res.map((f) => new Biquad('bp', f * rnd(0.9, 1.1), 9));
  let ph = 0;
  const wob = rnd(1, 4), wobPh = rnd(0, 6);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = baseHz * (1 + depth * Math.sin(TAU * wob * t + wobPh) + 0.3 * Math.sin(TAU * 0.7 * t)) * (1 + rnd(-0.08, 0.08));
    ph += f / SR;
    let x = 0;
    if (ph >= 1) { ph -= 1; x = rnd(0.6, 1); }
    let s = 0; for (const b of bqs) s += b.p(x);
    out[i] = s * Math.sin(Math.PI * Math.min(1, t / dur));
  }
  return out;
}
const creak = () => V(4, () => normalize(fadeEdges(creakRaw(rnd(0.6, 1.3), rnd(35, 70), rnd(0.25, 0.5))), 0.7));
function knock(f = 1, gain = 1) {
  const m = modal(0.25, [[180 * f, 0.06, 0.6], [410 * f, 0.04, 0.4], [760 * f, 0.025, 0.25], [1500 * f, 0.012, 0.15]]);
  const n = noiseBurst(0.25, { type: 'lp', f: 2500, d: 0.006 });
  return m.map((v, i) => (v + n[i] * 0.5) * gain);
}
function latch() {
  const a = noiseBurst(0.08, { f: 3500, q: 3, d: 0.004 });
  const b = modal(0.08, [[2200, 0.01, 0.4], [3400, 0.008, 0.3]]);
  const out = new Float32Array(Math.floor(0.12 * SR));
  mixInto(out, a.map((v, i) => v + b[i]), 0, 0.8);
  mixInto(out, noiseBurst(0.05, { f: 2800, q: 3, d: 0.003 }), 0.045, 0.6);
  return out;
}
function doorOpen() { const out = silence(0.9); mixInto(out, latch(), 0); mixInto(out, creakRaw(0.7, 45, 0.3), 0.1, 0.25); return normalize(fadeEdges(out), 0.7); }
function doorClose() { const out = silence(0.5); mixInto(out, knock(0.7, 1), 0); mixInto(out, latch(), 0.02, 0.8); mixInto(out, thump(0.3, 90, 50, 0.08), 0, 0.6); return normalize(fadeEdges(out), 0.75); }
function doorSlam() {
  const out = silence(1.2);
  mixInto(out, thump(0.6, 80, 38, 0.18), 0, 1);
  mixInto(out, knock(0.6, 1.2), 0, 1);
  const r = crackle(0.5, 120, { f: 1800, q: 2, decay: 0.006, env: (t) => Math.exp(-t / 0.15) });
  mixInto(out, r, 0.03, 0.4);
  mixInto(out, latch(), 0.01, 0.7);
  return normalize(fadeEdges(out), 0.95);
}
function doorRattle() {
  const out = silence(0.7);
  for (let k = 0; k < 5; k++) { mixInto(out, latch(), k * 0.11 + rnd(0, 0.02), 0.7); mixInto(out, knock(1.1, 0.4), k * 0.11, 0.5); }
  return normalize(fadeEdges(out), 0.7);
}
function cabinetOpen() { const out = silence(0.4); mixInto(out, knock(1.6, 0.4), 0); mixInto(out, creakRaw(0.25, 80, 0.3, [900, 1800, 3200]), 0.03, 0.15); return normalize(fadeEdges(out), 0.5); }
function cabinetClose() { const out = silence(0.3); mixInto(out, knock(1.4, 0.9), 0); return normalize(fadeEdges(out), 0.6); }
function cabinetSlam() { const out = silence(0.5); mixInto(out, knock(1.2, 1), 0); mixInto(out, knock(1.25, 0.5), 0.05); return normalize(fadeEdges(out), 0.85); }
function drawer() {
  const dur = 0.5;
  const bq = new Biquad('bp', 700, 1.2);
  const g = rnd(30, 60);
  const out = render(dur, (i, t) => bq.p(white()) * (0.5 + 0.5 * Math.sin(TAU * g * t)) * Math.sin(Math.PI * t / dur));
  mixInto(out, knock(1.5, 0.5), dur - 0.1);
  return normalize(fadeEdges(out), 0.5);
}
function drawerShut() { const out = silence(0.3); mixInto(out, knock(1.3, 1), 0); mixInto(out, crackle(0.2, 300, { f: 3000, env: (t) => Math.exp(-t / 0.05) }), 0.005, 0.3); return normalize(out, 0.7); }
function windowSlide() {
  const dur = 1.0;
  const bq = new Biquad('bp', 450, 0.8);
  const out = render(dur, (i, t) => bq.p(white()) * Math.sin(Math.PI * t / dur) * (0.6 + 0.4 * Math.sin(TAU * 13 * t)));
  mixInto(out, creakRaw(0.8, 30, 0.4, [300, 700, 1500]), 0.1, 0.3);
  return normalize(fadeEdges(out), 0.6);
}
function windowThud() { const out = knock(0.8, 1); mixInto(out, modal(0.4, [[1800, 0.08, 0.1], [2600, 0.06, 0.08]]), 0); return normalize(out, 0.7); }

// ---------------------------------------------------------------- small UI-ish
function click(f = 3000) { const out = noiseBurst(0.04, { f, q: 2.5, d: 0.0025 }); mixInto(out, modal(0.04, [[f * 0.7, 0.004, 0.3]]), 0); return normalize(out, 0.6); }
function switchClick() { const out = silence(0.08); mixInto(out, click(2600), 0); mixInto(out, knock(3, 0.3), 0); return normalize(out, 0.6); }
function rustle(dur = 0.3, f = 3000) {
  const bq = new Biquad('bp', f, 0.6);
  return normalize(fadeEdges(render(dur, (i, t) => bq.p(white()) * (Math.random() < 0.3 ? 1 : 0.35) * Math.sin(Math.PI * t / dur))), 0.4);
}
function whoosh() { const bq = new Biquad('bp', 400, 0.8); return normalize(render(0.35, (i, t) => { bq.set('bp', 300 + 1200 * Math.sin(Math.PI * t / 0.35), 0.8); return bq.p(white()) * Math.sin(Math.PI * t / 0.35); }), 0.4); }
function beep() { const out = silence(0.5); mixInto(out, tone(0.12, [2000], (t) => (t < 0.11 ? 1 : 0)), 0, 0.4); mixInto(out, tone(0.12, [2000], (t) => (t < 0.11 ? 1 : 0)), 0.22, 0.4); return out; }

// ---------------------------------------------------------------- impacts by material
function impact(kind) {
  switch (kind) {
    case 'ceramic': return V(3, () => normalize(fadeEdges(modal(0.5, [[rnd(1800, 2200), 0.12, 0.5], [rnd(3400, 3900), 0.08, 0.4], [rnd(5200, 5800), 0.05, 0.2], [rnd(700, 800), 0.06, 0.3]])), 0.6));
    case 'glass': return V(3, () => normalize(fadeEdges(modal(0.7, [[rnd(2400, 2800), 0.2, 0.5], [rnd(4100, 4600), 0.15, 0.35], [rnd(6200, 6800), 0.1, 0.2]])), 0.55));
    case 'metal': return V(3, () => normalize(fadeEdges(modal(0.9, [[rnd(500, 700), 0.3, 0.5], [rnd(1300, 1500), 0.22, 0.4], [rnd(2600, 2900), 0.15, 0.3], [rnd(4100, 4400), 0.1, 0.2]])), 0.6));
    case 'can': return V(3, () => normalize(fadeEdges(modal(0.4, [[rnd(900, 1100), 0.08, 0.4], [rnd(2300, 2600), 0.06, 0.3], [rnd(3900, 4300), 0.04, 0.2]])), 0.55));
    case 'plastic': return V(3, () => normalize(fadeEdges(knock(rnd(2.2, 2.8), 1)), 0.5));
    case 'wood': return V(3, () => normalize(fadeEdges(knock(rnd(1.4, 1.9), 1)), 0.6));
    case 'cardboard': return V(3, () => { const o = thump(0.15, 200, 90, 0.03); mixInto(o, noiseBurst(0.15, { type: 'lp', f: 1200, d: 0.02 }), 0, 0.6); return normalize(fadeEdges(o), 0.5); });
    case 'paper': return V(3, () => rustle(0.12, 4000));
    case 'food': case 'soft': case 'meat': return V(3, () => { const o = thump(0.12, 150, 70, 0.025); mixInto(o, noiseBurst(0.12, { type: 'lp', f: 800, d: 0.02 }), 0, 0.5); return normalize(fadeEdges(o), 0.4); });
    case 'egg': return [eggCrack()];
    case 'bag': return V(2, () => { const o = thump(0.3, 120, 50, 0.06); mixInto(o, rustle(0.3, 2500), 0, 0.6); return normalize(o, 0.6); });
    case 'book': return V(2, () => { const o = thump(0.2, 160, 70, 0.04); mixInto(o, knock(1.2, 0.5), 0); return normalize(o, 0.6); });
    default: return V(2, () => normalize(knock(2, 1), 0.5));
  }
}
function eggCrack() {
  const out = silence(0.4);
  mixInto(out, crackle(0.08, 4000, { f: 3500, q: 1.5, decay: 0.0015, env: (t) => Math.exp(-t / 0.02) }), 0, 0.8);
  mixInto(out, wetSquelch(0.25, 0.3), 0.06, 0.5);
  return normalize(out, 0.6);
}

// ---------------------------------------------------------------- wet / body
function wetSquelch(dur, amt = 1) {
  const bq = new Biquad('lp', 900, 2);
  const out = new Float32Array(Math.floor(dur * SR));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 120 + 400 * Math.abs(Math.sin(TAU * 7 * t + Math.sin(TAU * 3 * t)));
    bq.set('lp', f + 200, 3);
    ph += TAU * (60 + 80 * Math.sin(TAU * 5 * t)) / SR;
    out[i] = (bq.p(white()) * 0.8 + Math.sin(ph) * 0.2) * Math.sin(Math.PI * t / dur) * amt;
  }
  const bubbles = crackle(dur, 40, { f: 600, q: 6, decay: 0.01 });
  return out.map((v, i) => v + bubbles[i] * 0.4 * amt);
}
function chew(kind) {
  const n = kind === 'crunch' ? 5 : 4;
  return V(3, () => {
    const out = silence(1.6);
    for (let k = 0; k < n; k++) {
      const at = k * 0.32 + rnd(0, 0.05);
      if (kind === 'crunch') mixInto(out, crackle(0.12, 2500, { f: rnd(1800, 3200), q: 0.8, decay: 0.002, env: (t) => Math.exp(-t / 0.04) }), at, 0.8);
      mixInto(out, wetSquelch(0.18, kind === 'wet' ? 1.2 : 0.6), at + 0.02, kind === 'wet' ? 0.9 : 0.5);
      mixInto(out, thump(0.1, 90, 60, 0.03), at, 0.3);
    }
    return normalize(fadeEdges(out), 0.6);
  });
}
function swallow() {
  const out = silence(0.5);
  mixInto(out, sweep(0.25, 260, 90, (t) => Math.sin(Math.PI * t / 0.25) * 0.5), 0.02);
  mixInto(out, wetSquelch(0.2, 0.6), 0.1, 0.5);
  mixInto(out, click(1500), 0.05, 0.3);
  return normalize(out, 0.5);
}
function gulp() {
  const out = silence(1.6);
  for (let k = 0; k < 3; k++) { mixInto(out, swallow(), 0.1 + k * 0.42, 0.9); mixInto(out, wetSquelch(0.15, 0.5), k * 0.42, 0.4); }
  return normalize(out, 0.6);
}
function sip() { const out = silence(1.2); const bq = new Biquad('bp', 2500, 1.5); mixInto(out, render(0.4, (i, t) => bq.p(white()) * Math.sin(Math.PI * t / 0.4) * (0.5 + 0.5 * Math.sin(TAU * 30 * t))), 0, 0.5); mixInto(out, swallow(), 0.6); return normalize(out, 0.5); }
function slurp() { const bq = new Biquad('bp', 1500, 2); const o = render(0.6, (i, t) => { bq.set('bp', 900 + 2000 * (t / 0.6), 2); return bq.p(white()) * Math.sin(Math.PI * t / 0.6) * (0.6 + 0.4 * Math.sin(TAU * 25 * t)); }); mixInto(o, wetSquelch(0.4, 0.8), 0.15, 0.6); return normalize(o, 0.6); }
function growl(big) {
  return V(3, () => {
    const dur = big ? rnd(2.4, 3.4) : rnd(1.3, 2.1);
    const out = new Float32Array(Math.floor(dur * SR));
    let ph = 0;
    const bq = new Biquad('lp', 300, 4);
    const f0 = rnd(55, 85);
    for (let i = 0; i < out.length; i++) {
      const t = i / SR;
      const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.7;
      const f = f0 * (1 + 0.5 * Math.sin(TAU * 1.3 * t) + 0.3 * Math.sin(TAU * 4.7 * t + Math.sin(TAU * 0.9 * t) * 2)) * (big ? 0.8 : 1);
      ph += TAU * f / SR;
      bq.set('lp', 180 + 400 * Math.abs(Math.sin(TAU * 2.1 * t)), 5);
      const s = Math.sin(ph) + 0.4 * Math.sin(ph * 2.03) + 0.3 * white();
      out[i] = bq.p(s) * env;
    }
    const gurgle = crackle(dur, big ? 25 : 14, { f: 280, q: 8, decay: 0.03 });
    for (let i = 0; i < out.length; i++) out[i] += gurgle[i] * 0.5;
    if (big) { // something answers from inside
      const low = thump(dur, 45, 30, dur * 0.5, 0.5);
      for (let i = 0; i < out.length; i++) out[i] += low[i] * Math.sin(Math.PI * i / out.length);
    }
    return normalize(fadeEdges(out, 0.05, 0.1), big ? 0.95 : 0.75);
  });
}
function heartbeat() {
  const out = silence(1.0);
  mixInto(out, thump(0.15, 70, 40, 0.05), 0, 1);
  mixInto(out, thump(0.15, 60, 35, 0.06), 0.22, 0.7);
  return normalize(out, 0.9);
}
function breath(heavy) {
  return V(2, () => {
    const dur = heavy ? 2.2 : 3.2;
    const bq = new Biquad('bp', 900, 0.7);
    const bq2 = new Biquad('bp', 2200, 1.2);
    return normalize(fadeEdges(render(dur, (i, t) => {
      const ph = t / dur;
      const inh = ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) : 0;
      const exh = ph >= 0.45 && ph < 0.95 ? Math.sin(Math.PI * (ph - 0.45) / 0.5) : 0;
      const n = white();
      return (bq.p(n) * (inh * 0.6 + exh) + bq2.p(n) * inh * 0.4) * (heavy ? 1 : 0.5);
    })), heavy ? 0.5 : 0.25);
  });
}
function cough(wet) {
  return V(3, () => {
    const out = silence(1.4);
    const n = wet ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const at = k * rnd(0.28, 0.36);
      const f1 = new Biquad('bp', rnd(450, 600), 3), f2 = new Biquad('bp', rnd(1300, 1700), 4);
      const c = render(0.25, (i, t) => { const x = white() * ad(t, 0.005, 0.06); return f1.p(x) * 1.2 + f2.p(x) * 0.8 + x * 0.15; });
      mixInto(out, c, at, 1);
      mixInto(out, thump(0.15, 140, 80, 0.04), at, 0.4);
      if (wet) mixInto(out, wetSquelch(0.2, 0.9), at + 0.05, 0.6);
    }
    return normalize(fadeEdges(out), 0.85);
  });
}

// ---------------------------------------------------------------- kitchen
function water() {
  const bq = new Biquad('bp', 1800, 0.5), bq2 = new Biquad('lp', 600, 1);
  const g = crackle(2.0, 300, { f: 900, q: 5, decay: 0.006 });
  const out = render(2.0, (i, t) => bq.p(white()) * 0.5 + bq2.p(white()) * 0.3 + g[i] * 0.5);
  return normalize(makeLoop(out, 0.2), 0.5);
}
function sizzle() {
  const hp = new Biquad('hp', 2500, 0.7);
  const c = crackle(3, 900, { f: 4500, q: 0.6, decay: 0.0015 });
  const out = render(3, (i, t) => hp.p(white()) * 0.25 + c[i] * 0.7);
  return normalize(makeLoop(out, 0.3), 0.45);
}
function brew() {
  const out = new Float32Array(3 * SR);
  for (let k = 0; k < 40; k++) {
    const at = Math.random() * 2.8, f = rnd(150, 500), d = rnd(0.03, 0.09);
    mixInto(out, sweep(d, f, f * rnd(1.5, 3), (t) => Math.sin(Math.PI * t / d)), at, rnd(0.2, 0.6));
  }
  const hp = new Biquad('bp', 3000, 0.5);
  for (let i = 0; i < out.length; i++) out[i] += hp.p(white()) * 0.08;
  return normalize(makeLoop(out, 0.25), 0.5);
}
function stoveIgnite() {
  const out = silence(1.3);
  for (let k = 0; k < 4; k++) mixInto(out, click(4200), k * 0.12, 0.7);
  const lp = new Biquad('lp', 600, 0.7);
  mixInto(out, render(0.8, (i, t) => lp.p(white()) * ad(t, 0.02, 0.3) * 1.2), 0.42, 0.8);
  return normalize(out, 0.6);
}
function fridgeHum() {
  const out = render(3, (i, t) => Math.sin(TAU * 60 * t) * 0.5 + Math.sin(TAU * 120 * t) * 0.3 + Math.sin(TAU * 180 * t) * 0.12 + Math.sin(TAU * 240 * t) * 0.05);
  const lp = new Biquad('lp', 300, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += lp.p(white()) * 0.08;
  return normalize(makeLoop(out, 0.3), 0.4);
}
function fridgeOpen() { const out = silence(0.6); mixInto(out, thump(0.2, 70, 40, 0.05), 0, 0.6); const lp = new Biquad('bp', 1200, 0.6); mixInto(out, render(0.4, (i, t) => lp.p(white()) * ad(t, 0.01, 0.1)), 0.02, 0.4); mixInto(out, modal(0.4, [[2900, 0.05, 0.1], [4100, 0.04, 0.08]]), 0.1, 0.5); return normalize(out, 0.6); }
function fridgeClose() { const out = silence(0.7); mixInto(out, thump(0.3, 80, 45, 0.08), 0, 1); mixInto(out, knock(0.9, 0.6), 0); for (let k = 0; k < 4; k++) mixInto(out, modal(0.2, [[rnd(2000, 4000), 0.06, 0.1]]), 0.05 + k * 0.03, 0.5); return normalize(out, 0.7); }
function flush() {
  const dur = 4;
  const bq = new Biquad('bp', 500, 0.6);
  const out = render(dur, (i, t) => { bq.set('bp', 300 + 700 * Math.exp(-t), 0.6); return bq.p(white()) * ad(t, 0.3, 1.4); });
  mixInto(out, crackle(dur, 60, { f: 300, q: 7, decay: 0.03, env: (t) => Math.exp(-t / 2) }), 0, 0.5);
  mixInto(out, click(1800), 0, 0.5);
  return normalize(fadeEdges(out), 0.7);
}
function tapSqueak() { return normalize(sweep(0.25, 900, 1300, (t) => Math.sin(Math.PI * t / 0.25) * (0.5 + 0.5 * Math.sin(TAU * 40 * t))), 0.3); }
function kibble() { const out = crackle(1.4, 400, { f: 2200, q: 1.2, decay: 0.003, env: (t) => Math.sin(Math.PI * t / 1.4) }); return normalize(out, 0.55); }
function kibbleTick() { return normalize(modal(0.05, [[rnd(2500, 3500), 0.01, 0.4]]), 0.3); }
function rip() {
  const out = silence(0.6);
  const bq = new Biquad('bp', 2000, 0.7);
  mixInto(out, render(0.35, (i, t) => { bq.set('bp', 1200 + 3000 * (t / 0.35), 0.7); return bq.p(white()) * (Math.random() < 0.6 ? 1 : 0.2) * Math.sin(Math.PI * t / 0.35); }), 0.05, 1);
  mixInto(out, crackle(0.3, 800, { f: 3500, decay: 0.002 }), 0.05, 0.6);
  return normalize(out, 0.7);
}
function boxOpen() { const out = silence(0.6); mixInto(out, rustle(0.3, 1500), 0); mixInto(out, thump(0.2, 180, 100, 0.03), 0.25, 0.5); mixInto(out, crackle(0.25, 300, { f: 1800, decay: 0.004 }), 0.05, 0.4); return normalize(out, 0.6); }
function canOpen() { const out = silence(0.7); mixInto(out, click(2500), 0, 0.8); const hp = new Biquad('hp', 3000, 0.7); mixInto(out, render(0.5, (i, t) => hp.p(white()) * ad(t, 0.002, 0.15)), 0.02, 0.6); return normalize(out, 0.6); }
function canTab() { const out = silence(0.5); mixInto(out, click(2000), 0, 0.8); mixInto(out, modal(0.3, [[1800, 0.05, 0.2]]), 0.15); mixInto(out, wetSquelch(0.2, 0.3), 0.2, 0.4); return normalize(out, 0.6); }
function trashLid() { const out = silence(0.4); mixInto(out, impact('metal')[0], 0, 0.7); mixInto(out, rustle(0.2, 2000), 0.05, 0.5); return normalize(out, 0.6); }

// ---------------------------------------------------------------- phone / modem / computer
function bell() {
  // US electromechanical ringer: clapper at 20 Hz between two bells for 2s
  const dur = 2.0;
  const out = new Float32Array(Math.floor(dur * SR));
  const strike = modal(0.12, [[1160, 0.25, 0.5], [2330, 0.18, 0.3], [3510, 0.1, 0.2], [930, 0.2, 0.3]]);
  for (let k = 0; k < 40; k++) mixInto(out, strike, k / 20, 0.6 + (k % 2) * 0.2);
  const tail = modal(1.0, [[1160, 0.25, 0.4], [930, 0.2, 0.3]]);
  mixInto(out, tail, 1.9, 0.3);
  return normalize(fadeEdges(out, 0.001, 0.1), 0.8);
}
function dialTone() { return normalize(makeLoop(tone(2.1, [350, 440], () => 1), 0.1), 0.25); }
function busy() { return normalize(tone(1.0, [480, 620], (t) => (t % 1 < 0.5 ? 1 : 0)), 0.25); }
const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] };
function dtmf(d) { return tone(0.09, DTMF[d] || DTMF[0], () => 1); }
function modem() {
  // ~13s: dial tone, dialing, ringback, answer tone with phase reversals, V.8/V.34 training screech, data hiss
  const parts = [];
  const t0 = silence(13.5);
  let at = 0;
  mixInto(t0, tone(0.9, [350, 440], () => 1), at, 0.3); at += 1.0;
  for (const d of '5550199') { mixInto(t0, dtmf(+d), at, 0.35); at += 0.13; }
  at += 0.5;
  mixInto(t0, tone(1.6, [440, 480], (t) => (t < 1.5 ? 1 : 0)), at, 0.25); at += 2.0;
  // ANSam 2100Hz with 15Hz AM and phase reversals every 450ms
  let ph = 0;
  mixInto(t0, render(2.6, (i, t) => { ph += TAU * 2100 / SR; const rev = Math.floor(t / 0.45) % 2 ? Math.PI : 0; return Math.sin(ph + rev) * (0.8 + 0.2 * Math.sin(TAU * 15 * t)); }), at, 0.25); at += 2.6;
  // V.8 bursts / "bong bong"
  for (let k = 0; k < 3; k++) { mixInto(t0, tone(0.18, [1375, 2002], () => 1), at, 0.2); mixInto(t0, tone(0.12, [980], () => 1), at + 0.2, 0.2); at += 0.36; }
  // training screech: fast alternating carriers + scrambled noise
  const bp = new Biquad('bp', 1800, 0.6);
  mixInto(t0, render(2.6, (i, t) => {
    const seg = Math.floor(t * 9);
    const f = [1800, 3000, 600, 2400, 1200, 3200, 1650, 2900][seg % 8] + Math.sin(t * 900) * 40;
    const carrier = Math.sin(TAU * f * t) * (seg % 3 === 0 ? 1 : 0.6);
    const n = bp.p(white()) * (seg % 2 ? 1.4 : 0.6);
    return (carrier * 0.6 + n) * 0.6;
  }), at, 0.35); at += 2.6;
  // data: bandlimited hiss fading
  const bp2 = new Biquad('bp', 1800, 0.4);
  mixInto(t0, render(1.6, (i, t) => bp2.p(white()) * (1 - t / 1.6)), at, 0.3);
  return fadeEdges(t0, 0.01, 0.2);
}
function crtOn() {
  const out = silence(2.5);
  mixInto(out, thump(0.3, 60, 40, 0.1), 0, 0.8);
  mixInto(out, render(1.6, (i, t) => (Math.sin(TAU * 60 * t) * 0.6 + Math.sin(TAU * 120 * t) * 0.3) * ad(t, 0.05, 0.4) * (1 + 0.5 * Math.sin(TAU * 7 * t))), 0.05, 0.6);
  mixInto(out, render(2.4, (i, t) => Math.sin(TAU * 12000 * t) * Math.min(1, t * 3) * 0.04), 0.1);
  mixInto(out, crackle(1, 300, { f: 3000, decay: 0.002, env: (t) => Math.exp(-t * 3) }), 0.05, 0.3);
  return normalize(out, 0.6);
}
function crtWhine() { return makeLoop(render(2, (i, t) => Math.sin(TAU * 12000 * t) * 0.03 + Math.sin(TAU * 60 * t) * 0.02), 0.1); }
function pcHum() {
  const lp = new Biquad('lp', 400, 0.7), bp = new Biquad('bp', 180, 4);
  const out = render(3, (i, t) => lp.p(white()) * 0.4 + bp.p(white()) * 0.6 + Math.sin(TAU * 120 * t) * 0.05);
  return normalize(makeLoop(out, 0.3), 0.3);
}
function hdd() { const out = silence(0.8); for (let k = 0; k < 8; k++) mixInto(out, click(rnd(1200, 2400)), Math.random() * 0.7, rnd(0.2, 0.5)); return normalize(out, 0.35); }
function key() { return V(4, () => { const o = silence(0.07); mixInto(o, click(rnd(1800, 2600)), 0, 0.6); mixInto(o, knock(rnd(3, 4), 0.3), 0); return normalize(o, 0.4); }); }
function mouseClick() { return normalize(click(3800), 0.35); }
function chime() {
  // original startup chime: warm FM bells arpeggiating into a soft chord
  const dur = 4.5;
  const out = silence(dur);
  const notes = [[523.25, 0], [659.25, 0.25], [783.99, 0.5], [1046.5, 0.8], [392, 1.2], [659.25, 1.2], [987.77, 1.25]];
  for (const [f, at] of notes) {
    mixInto(out, render(dur - at, (i, t) => {
      const mod = Math.sin(TAU * f * 2 * t) * 2.5 * Math.exp(-t * 2);
      return Math.sin(TAU * f * t + mod) * Math.exp(-t * 1.1) * Math.min(1, t * 200);
    }), at, 0.25);
  }
  // reverse-y swell pad
  mixInto(out, render(dur, (i, t) => (Math.sin(TAU * 261.6 * t) + Math.sin(TAU * 392 * t) * 0.6) * Math.sin(Math.PI * t / dur) * 0.15), 0);
  return normalize(out, 0.7);
}
function ding() { return normalize(render(0.8, (i, t) => (Math.sin(TAU * 1320 * t + Math.sin(TAU * 2640 * t) * Math.exp(-t * 6)) * Math.exp(-t * 4))), 0.5); }
function notify() { const o = silence(1); mixInto(o, ding(), 0, 0.7); mixInto(o, render(0.8, (i, t) => Math.sin(TAU * 990 * t) * Math.exp(-t * 4)), 0.18, 0.5); return normalize(o, 0.5); }
function errorSnd() { const o = silence(0.6); mixInto(o, render(0.5, (i, t) => (Math.sin(TAU * 440 * t) * 0.6 + Math.sin(TAU * 660 * t) * 0.4) * Math.exp(-t * 5)), 0); return normalize(o, 0.5); }
function offhook() { const o = silence(0.3); mixInto(o, click(1200), 0, 0.8); mixInto(o, knock(1.8, 0.6), 0); return normalize(o, 0.6); }
function lineStatic() { const bp = new Biquad('bp', 1500, 0.5); const c = crackle(3, 30, { f: 2000, decay: 0.003 }); return normalize(makeLoop(render(3, (i, t) => bp.p(white()) * 0.15 + c[i] * 0.4), 0.2), 0.2); }

// ---------------------------------------------------------------- cat
function catMeow(kind = 'meow') {
  // formant-ish synthesis: glottal-like pulse train through moving formants (i -> a -> u)
  return V(4, () => {
    const dur = kind === 'short' ? rnd(0.25, 0.4) : kind === 'yowl' ? rnd(1.2, 1.8) : kind === 'plead' ? rnd(0.8, 1.1) : rnd(0.5, 0.8);
    const f0a = rnd(480, 620) * (kind === 'yowl' ? 0.8 : 1), f0b = f0a * rnd(1.2, 1.45);
    const F1 = new Biquad('bp', 800, 6), F2 = new Biquad('bp', 1600, 8), F3 = new Biquad('bp', 3200, 8);
    let ph = 0;
    return normalize(fadeEdges(render(dur, (i, t) => {
      const p = t / dur;
      const f0 = (p < 0.4 ? f0a + (f0b - f0a) * (p / 0.4) : f0b - (f0b - f0a * 0.8) * ((p - 0.4) / 0.6)) * (1 + (kind === 'yowl' ? 0.05 * Math.sin(TAU * 6 * t) : 0.01 * Math.sin(TAU * 9 * t)));
      ph += f0 / SR; if (ph > 1) ph -= 1;
      const src = (ph < 0.35 ? Math.sin(Math.PI * ph / 0.35) : 0) * 2 - 0.3 + white() * 0.08;
      // formants: "mi" -> "a" -> "u"
      const f1 = p < 0.3 ? 400 + 900 * (p / 0.3) : 1300 - 700 * ((p - 0.3) / 0.7);
      const f2 = p < 0.3 ? 2400 - 600 * (p / 0.3) : 1800 - 900 * ((p - 0.3) / 0.7);
      F1.set('bp', f1, 5); F2.set('bp', f2, 7); F3.set('bp', 3400, 8);
      const env = Math.min(1, t / 0.04) * Math.min(1, (dur - t) / 0.12);
      return (F1.p(src) * 1.0 + F2.p(src) * 0.6 + F3.p(src) * 0.25) * env;
    })), 0.7);
  });
}
function catTrill() {
  return V(2, () => {
    const dur = rnd(0.3, 0.45);
    const F1 = new Biquad('bp', 700, 4), F2 = new Biquad('bp', 1800, 6);
    let ph = 0;
    return normalize(fadeEdges(render(dur, (i, t) => {
      const f0 = 420 + 220 * (t / dur);
      ph += f0 / SR; if (ph > 1) ph -= 1;
      const src = (ph < 0.3 ? 1 : -0.3) * (0.6 + 0.4 * Math.sin(TAU * 28 * t)) + white() * 0.1;
      return (F1.p(src) + F2.p(src) * 0.5) * Math.sin(Math.PI * t / dur);
    })), 0.5);
  });
}
function purr() {
  const dur = 4;
  const lp = new Biquad('lp', 260, 1.5), bp = new Biquad('bp', 120, 2);
  const out = render(dur, (i, t) => {
    const breath = 0.6 + 0.4 * Math.sin(TAU * t / 2); // in/out cycles
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(TAU * 26 * t), 3);
    const n = white();
    return (lp.p(n) * 1.2 + bp.p(n) * 0.8) * pulse * breath;
  });
  return normalize(makeLoop(out, 0.3), 0.5);
}
function hiss() {
  return V(2, () => {
    const dur = rnd(0.7, 1.1);
    const hp = new Biquad('hp', 2200, 0.7), bp = new Biquad('bp', 5000, 1);
    return normalize(fadeEdges(render(dur, (i, t) => { const n = white(); return (hp.p(n) * 0.7 + bp.p(n) * 0.5) * (t < 0.04 ? t / 0.04 * 1.5 : Math.exp(-(t - 0.04) * 1.5)) * (1 + (t < 0.1 ? 0.6 : 0)); })), 0.75);
  });
}
function catGrowl() {
  const dur = 1.6;
  const lp = new Biquad('lp', 500, 3);
  let ph = 0;
  return normalize(fadeEdges(render(dur, (i, t) => { ph += TAU * (110 + 20 * Math.sin(TAU * 3 * t)) / SR; const s = Math.sin(ph) * (0.6 + 0.4 * Math.sin(TAU * 32 * t)) + white() * 0.3; return lp.p(s) * Math.sin(Math.PI * t / dur); }), 0.05, 0.2), 0.6);
}
function catScream() {
  const dur = 1.1;
  const F1 = new Biquad('bp', 1200, 3), F2 = new Biquad('bp', 2600, 4);
  let ph = 0;
  return normalize(fadeEdges(render(dur, (i, t) => {
    const f0 = 750 + 300 * Math.sin(Math.PI * t / dur) + 40 * Math.sin(TAU * 13 * t);
    ph += f0 / SR; if (ph > 1) ph -= 1;
    const src = sat((ph * 2 - 1) * 2 + white() * 0.5, 2);
    return (F1.p(src) + F2.p(src) * 0.8 + white() * 0.15) * Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.2);
  })), 0.9);
}
function catStep() { return V(3, () => normalize(thump(0.06, 200, 120, 0.012), 0.15)); }
function catLand() { const o = thump(0.15, 140, 70, 0.03); mixInto(o, noiseBurst(0.1, { type: 'lp', f: 900, d: 0.015 }), 0, 0.5); return normalize(o, 0.4); }
function catEat() { const out = silence(2.0); for (let k = 0; k < 12; k++) mixInto(out, crackle(0.06, 3000, { f: rnd(2000, 3500), decay: 0.0015, env: (t) => Math.exp(-t / 0.02) }), k * 0.16 + rnd(0, 0.05), 0.6); return normalize(makeLoop(out, 0.1), 0.35); }
function catLap() { const out = silence(1.5); for (let k = 0; k < 8; k++) mixInto(out, wetSquelch(0.05, 0.5), k * 0.18, 0.6); return normalize(makeLoop(out, 0.1), 0.3); }
function scratch() { const out = silence(0.5); for (let k = 0; k < 3; k++) mixInto(out, noiseBurst(0.1, { f: 3500, q: 1.5, d: 0.03, f2: 5000 }), k * 0.06, 0.8); return normalize(out, 0.7); }

// ---------------------------------------------------------------- horror / ambience
function roar(dist) {
  const dur = rnd(3.5, 5);
  const out = new Float32Array(Math.floor(dur * SR));
  const F1 = new Biquad('bp', 300, 3), F2 = new Biquad('bp', 900, 4), lp = new Biquad('lp', dist ? 700 : 2500, 0.7);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, p = t / dur;
    const f0 = 48 + 30 * Math.sin(Math.PI * p) + 8 * Math.sin(TAU * 5.5 * t);
    ph += f0 / SR; if (ph > 1) ph -= 1;
    const src = sat((ph * 2 - 1) + white() * 0.6, 3);
    F1.set('bp', 200 + 500 * Math.sin(Math.PI * p), 3); F2.set('bp', 700 + 900 * p, 4);
    out[i] = lp.p(F1.p(src) * 1.4 + F2.p(src) * 0.8 + white() * 0.1) * Math.pow(Math.sin(Math.PI * Math.min(1, p * 1.1)), 0.5);
  }
  mixInto(out, thump(dur, 40, 25, dur * 0.4, 0.6), 0);
  return normalize(fadeEdges(out, 0.2, 0.6), dist ? 0.8 : 1);
}
function drone(baseHz, dur = 8, rough = 0.3) {
  const out = render(dur, (i, t) => {
    let s = 0;
    const fs = [baseHz, baseHz * 1.498, baseHz * 2.01, baseHz * 1.06];
    for (let k = 0; k < fs.length; k++) s += Math.sin(TAU * fs[k] * t + Math.sin(TAU * 0.1 * (k + 1) * t) * 2) * (1 / (k + 1));
    return s;
  });
  const lp = new Biquad('lp', baseHz * 6, 0.7);
  for (let i = 0; i < out.length; i++) out[i] = out[i] * 0.6 + lp.p(white()) * rough;
  return normalize(makeLoop(out, 1), 0.5);
}
function wind() { const lp = new Biquad('bp', 400, 0.5); const out = render(6, (i, t) => { lp.set('bp', 300 + 250 * Math.sin(TAU * 0.13 * t) + 120 * Math.sin(TAU * 0.37 * t), 0.6); return lp.p(white()) * (0.6 + 0.4 * Math.sin(TAU * 0.2 * t)); }); return normalize(makeLoop(out, 1), 0.5); }
function cityDay() {
  const lp = new Biquad('lp', 500, 0.7), bp = new Biquad('bp', 1200, 0.5);
  const out = render(8, (i, t) => lp.p(white()) * 0.8 + bp.p(white()) * 0.12);
  // distant honks
  for (let k = 0; k < 2; k++) mixInto(out, tone(0.4, [rnd(380, 450), rnd(470, 520)], (t) => Math.sin(Math.PI * t / 0.4) * 0.08), rnd(0.5, 7), 1);
  return normalize(makeLoop(out, 1), 0.4);
}
function siren() {
  const dur = 6;
  let ph = 0;
  const lp = new Biquad('lp', 1500, 0.7);
  return normalize(fadeEdges(render(dur, (i, t) => { const f = 700 + 450 * Math.sin(TAU * 0.25 * t); ph += TAU * f / SR; return lp.p(Math.sin(ph) + 0.3 * Math.sin(ph * 2)) * Math.sin(Math.PI * t / dur); }), 0.5, 1), 0.3);
}
function staticNoise() { const bp = new Biquad('bp', 3000, 0.4); return normalize(makeLoop(render(2, () => bp.p(white()) * 0.7 + white() * 0.3), 0.1), 0.35); }
function eas() { return normalize(tone(4, [853, 960], (t) => Math.min(1, t * 20) * Math.min(1, (4 - t) * 20)), 0.35); }
function tinnitus() { return normalize(render(6, (i, t) => Math.sin(TAU * 5200 * t) * Math.exp(-t / 2.5) * Math.min(1, t * 10)), 0.25); }
function stinger() {
  const dur = 3.5;
  const out = render(dur, (i, t) => {
    let s = 0; for (const f of [110, 116.5, 155.6, 233, 246.9]) s += Math.sin(TAU * f * t + Math.sin(TAU * 6 * t) * 0.3);
    return s * 0.2 * Math.exp(-t / 1.4) * Math.min(1, t * 30);
  });
  const hp = new Biquad('hp', 2000, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += hp.p(white()) * 0.3 * Math.exp(-i / SR / 0.3);
  return normalize(out, 0.8);
}
function knocks(n = 3) { const out = silence(n * 0.4 + 0.5); for (let k = 0; k < n; k++) { mixInto(out, knock(0.55, 1.2), k * 0.38, 1); mixInto(out, thump(0.2, 90, 50, 0.05), k * 0.38, 0.8); } return normalize(out, 0.9); }
function bodyFall() { const out = silence(1.2); mixInto(out, thump(0.5, 70, 35, 0.12), 0, 1); mixInto(out, knock(0.7, 0.8), 0.02); mixInto(out, rustle(0.5, 1500), 0.05, 0.6); mixInto(out, thump(0.3, 90, 50, 0.06), 0.28, 0.6); return normalize(out, 0.95); }
function tear() {
  const dur = 1.6;
  const out = crackle(dur, 2500, { f: 1500, q: 0.7, decay: 0.002, env: (t) => 0.4 + 0.6 * Math.sin(Math.PI * t / dur) });
  mixInto(out, wetSquelch(dur, 1.5), 0, 1);
  mixInto(out, crackle(0.2, 6000, { f: 2500, decay: 0.001 }), dur * 0.6, 0.8); // snap
  return normalize(out, 0.95);
}
function drip() { return V(3, () => { const o = sweep(0.06, rnd(900, 1300), rnd(1800, 2600), (t) => Math.exp(-t * 50)); return normalize(o, 0.3); }); }
function breaker() { const o = silence(1.2); mixInto(o, thump(0.3, 90, 50, 0.06), 0, 1); mixInto(o, click(1600), 0, 0.8); mixInto(o, render(0.8, (i, t) => Math.sin(TAU * 120 * t) * Math.exp(-t * 3) * 0.4), 0.05); return normalize(o, 0.8); }
function powerDown() { let ph = 0; return normalize(fadeEdges(render(2.2, (i, t) => { ph += TAU * (120 * Math.exp(-t * 1.5) + 20) / SR; return Math.sin(ph) * Math.exp(-t * 1.2); })), 0.5); }
function hum60() { return normalize(makeLoop(render(2, (i, t) => Math.sin(TAU * 60 * t) * 0.5 + Math.sin(TAU * 120 * t) * 0.35 + Math.sin(TAU * 180 * t) * 0.2 + (Math.random() - 0.5) * 0.04), 0.1), 0.3); }
function fluoro() { return normalize(makeLoop(render(2, (i, t) => Math.sin(TAU * 120 * t) * 0.4 + Math.sin(TAU * 240 * t) * 0.2 + Math.sin(TAU * 4000 * t) * 0.02 * (1 + Math.sin(TAU * 2 * t))), 0.1), 0.25); }
function scream() {
  // a hoarse human scream: rising "ah" with noise and saturation
  const dur = 1.8;
  const F = [new Biquad('bp', 850, 5), new Biquad('bp', 1250, 6), new Biquad('bp', 2700, 7)];
  let ph = 0;
  return normalize(fadeEdges(render(dur, (i, t) => {
    const p = t / dur;
    const f0 = 260 + 220 * Math.sin(Math.PI * Math.min(1, p * 1.4)) + 12 * Math.sin(TAU * 7 * t) + rnd(-6, 6);
    ph += f0 / SR; if (ph > 1) ph -= 1;
    const src = sat(((ph < 0.5 ? ph * 2 : 2 - ph * 2) * 2 - 1) * 1.5 + white() * 0.35, 2.5);
    const s = F[0].p(src) * 1.0 + F[1].p(src) * 0.8 + F[2].p(src) * 0.45;
    return sat(s * 2, 2) * Math.min(1, t / 0.05) * Math.pow(1 - p, 0.6);
  }), 0.01, 0.3), 0.95);
}
function pain() {
  // a short pained gasp/grunt: low voiced "uh" with breath noise
  return V(3, () => {
    const dur = rnd(0.35, 0.6);
    const F = [new Biquad('bp', rnd(500, 650), 5), new Biquad('bp', rnd(1000, 1250), 6)];
    let ph = 0;
    return normalize(fadeEdges(render(dur, (i, t) => {
      const p = t / dur;
      const f0 = 150 + 60 * Math.sin(Math.PI * p) + rnd(-4, 4);
      ph += f0 / SR; if (ph > 1) ph -= 1;
      const src = sat((ph < 0.4 ? 1 : -0.6) + white() * 0.5, 2);
      return (F[0].p(src) + F[1].p(src) * 0.6) * Math.min(1, t / 0.02) * Math.pow(1 - p, 1.2);
    }), 0.005, 0.08), 0.8);
  });
}
function tvBabble() {
  // muffled murmuring voices + music bed, as heard through a wall / old TV
  const dur = 6;
  const out = new Float32Array(Math.floor(dur * SR));
  const F1 = new Biquad('bp', 600, 3), F2 = new Biquad('bp', 1400, 4), lp = new Biquad('lp', 2200, 0.7);
  let ph = 0, syl = 0, f1t = 600, f2t = 1400;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (t > syl) { syl = t + rnd(0.08, 0.2); f1t = rnd(350, 800); f2t = rnd(900, 2200); }
    const on = Math.sin(TAU * 1.1 * t) > -0.6 ? 1 : 0.1;
    ph += (130 + 30 * Math.sin(TAU * 0.7 * t)) / SR; if (ph > 1) ph -= 1;
    F1.set('bp', f1t, 3); F2.set('bp', f2t, 4);
    const src = (ph < 0.3 ? 1 : -0.4) + white() * 0.1;
    out[i] = lp.p(F1.p(src) + F2.p(src) * 0.5) * on * 0.8 + Math.sin(TAU * 220 * t) * 0.03 + Math.sin(TAU * 277 * t) * 0.02;
  }
  return normalize(makeLoop(out, 0.5), 0.4);
}
function alienNear() {
  const dur = 3;
  const out = crackle(dur, 9, { f: 1600, q: 3, decay: 0.012 });
  const lp = new Biquad('lp', 300, 2);
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = out[i] * 1.5 + lp.p(white()) * (0.4 + 0.4 * Math.sin(TAU * 0.6 * t)); }
  return normalize(makeLoop(out, 0.3), 0.6);
}
function shipHum() { return drone(31, 10, 0.15); }
function tapeHiss() { const hp = new Biquad('hp', 4000, 0.7); return normalize(makeLoop(render(3, () => hp.p(white())), 0.2), 0.1); }
function elevatorDing() { return normalize(render(1.5, (i, t) => (Math.sin(TAU * 1046 * t) + 0.5 * Math.sin(TAU * 2093 * t)) * Math.exp(-t * 2.5)), 0.5); }
function vending() { return normalize(makeLoop(render(3, (i, t) => Math.sin(TAU * 100 * t) * 0.3 + Math.sin(TAU * 200 * t) * 0.1 + (Math.random() - 0.5) * 0.05), 0.2), 0.3); }
function canDrop() { const o = silence(1.2); mixInto(o, impact('can')[0], 0, 0.8); mixInto(o, impact('can')[0], 0.35, 0.5); mixInto(o, thump(0.3, 90, 50, 0.08), 0.1, 0.7); return normalize(o, 0.7); }
function coin() { return normalize(modal(0.6, [[4200, 0.15, 0.4], [5600, 0.1, 0.3], [2900, 0.12, 0.2]]), 0.4); }
function pickup() { return V(3, () => { const o = rustle(0.15, rnd(1800, 3000)); return normalize(o, 0.25); }); }
function place() { return V(3, () => normalize(knock(rnd(1.8, 2.6), 0.6), 0.3)); }
function pageTurn() { return rustle(0.25, 3500); }
function radioTune() { const bp = new Biquad('bp', 2000, 0.5); let ph = 0; return normalize(render(2, (i, t) => { ph += TAU * (800 + 600 * Math.sin(TAU * 0.8 * t)) / SR; return bp.p(white()) * 0.6 + Math.sin(ph) * 0.15 * (Math.sin(TAU * 3 * t) > 0.5 ? 1 : 0); }), 0.35); }
function alarmBeep() { const out = silence(1.0); for (let k = 0; k < 4; k++) mixInto(out, tone(0.08, [2900], () => 1), k * 0.12, 0.5); return out; }

// ceiling fan: motor hum and the soft chop of four blades
function fanHum() {
  const lp = new Biquad('lp', 500, 0.7);
  return normalize(makeLoop(render(4, (i, t) => Math.sin(TAU * 58 * t) * 0.25 + Math.sin(TAU * 116 * t) * 0.1 + lp.p(white()) * (0.55 + 0.45 * Math.sin(TAU * 4.2 * t)) * 0.6), 0.3), 0.3);
}
// an AM station playing something soft: electric piano chords, bass, brushed
// drums and a little tune, all squeezed through a narrow radio band
function radioMusic() {
  const beat = 60 / 92, chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 311.1]];
  const tune = [659.3, 587.3, 523.3, 587.3, 659.3, 784, 659.3, 587.3, 523.3, 493.9, 440, 493.9, 523.3, 587.3, 523.3, 493.9];
  const bp = new Biquad('bp', 1300, 0.55), hp = new Biquad('hp', 260, 0.7);
  let mph = 0;
  return normalize(makeLoop(render(beat * 16, (i, t) => {
    const ch = chords[Math.floor(t / (beat * 4)) % 4], bt = t % beat, k = Math.floor(t / beat);
    let x = 0;
    for (const f of ch) x += Math.sin(TAU * f * t + 0.6 * Math.sin(TAU * f * 2 * t) * Math.exp(-bt * 2)) * 0.11 * (0.6 + 0.4 * Math.exp(-bt * 1.5));
    x += Math.sin(TAU * ch[0] / 2 * t) * 0.22 * Math.exp(-(t % (beat * 2)) * 1.8);
    x += k % 2 === 0 ? Math.sin(TAU * (55 + 60 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 14) * 0.55 : white() * Math.exp(-bt * 22) * 0.3;
    x += white() * Math.exp(-((t * 2) % beat) * 55) * 0.07;
    mph += TAU * tune[k % 16] / SR;
    x += Math.sin(mph) * 0.08 * Math.exp(-bt * 2.5);
    return sat(hp.p(bp.p(x)) * 2.4 + white() * 0.015, 1.4);
  }), 0.25), 0.42);
}
function microwaveHum() { const lp = new Biquad('lp', 900, 1); return normalize(makeLoop(render(3, (i, t) => Math.sin(TAU * 120 * t) * 0.35 + Math.sin(TAU * 60 * t) * 0.2 + lp.p(white()) * 0.12), 0.2), 0.35); }
function kettleWhistle() { let ph = 0; const bp = new Biquad('bp', 2200, 4); return normalize(makeLoop(render(3, (i, t) => { ph += TAU * (2150 + 60 * Math.sin(TAU * 5 * t) + 30 * white()) / SR; return Math.sin(ph) * 0.6 + bp.p(white()) * 0.4; }), 0.2), 0.4); }
// ---------------------------------------------------------------- day 7
// a handheld radio: key-up chirp, a burst of squelch, the roger beep
function radioChirp() {
  const out = silence(0.75), bp = new Biquad('bp', 1900, 0.9);
  mixInto(out, tone(0.06, [1450], () => 1), 0, 0.25);
  mixInto(out, render(0.45, (i, t) => bp.p(white()) * (0.6 + 0.4 * Math.sin(TAU * 31 * t)) * Math.min(1, t * 60, (0.45 - t) * 30)), 0.06, 0.7);
  mixInto(out, tone(0.09, [2100, 2400], () => 1), 0.55, 0.2);
  return normalize(fadeEdges(out), 0.6);
}
// a ram through a door: the hit, the frame splitting, the door hitting the wall
function doorBreak() {
  const out = silence(1.6);
  mixInto(out, thump(0.5, 70, 32, 0.14, 1.2), 0, 1);
  mixInto(out, knock(0.5, 1.6), 0, 0.9);
  mixInto(out, crackle(0.35, 3000, { f: 1400, q: 0.8, decay: 0.004, env: (t) => Math.exp(-t / 0.08) }), 0.01, 0.9);
  mixInto(out, latch(), 0.02, 0.8);
  mixInto(out, thump(0.4, 90, 45, 0.08), 0.42, 0.6);
  mixInto(out, knock(0.9, 0.8), 0.42, 0.5);
  return normalize(fadeEdges(out), 1);
}
// a helicopter somewhere over the river
function heliFar() {
  const lp = new Biquad('lp', 260, 0.8), bp = new Biquad('bp', 900, 0.6);
  return normalize(makeLoop(render(4, (i, t) => { const blade = Math.pow(0.5 + 0.5 * Math.sin(TAU * 11.5 * t), 3); return lp.p(white()) * (0.4 + blade * 1.4) + bp.p(white()) * 0.05 * blade; }), 0.2), 0.45);
}
// the only major chord in the game
function warmChord() {
  const dur = 7, fs = [[196, 1], [246.94, 0.7], [293.66, 0.6], [392, 0.35], [493.88, 0.18]];
  return normalize(render(dur, (i, t) => { let s = 0; for (const [f, a] of fs) s += Math.sin(TAU * f * t + Math.sin(TAU * 0.3 * t) * 0.4) * a; return s * Math.min(1, t / 2.5, (dur - t) / 2.5) * 0.25; }), 0.5);
}
function fireBell() { return normalize(makeLoop(render(2, (i, t) => { const tr = (t * 18) % 1; return (Math.sin(TAU * 1650 * t) * 0.6 + Math.sin(TAU * 3300 * t) * 0.25) * Math.exp(-tr * 6); }), 0.05), 0.5); }

export const GEN = {
  step_wood: () => V(6, () => step('wood')), step_tile: () => V(5, () => step('tile')), step_carpet: () => V(5, () => step('carpet')),
  step_concrete: () => V(5, () => step('concrete')), step_metal: () => V(4, () => step('metal')), step_flesh: () => V(4, () => step('flesh')),
  doorCreak: creak, doorOpen: () => V(2, doorOpen), doorClose: () => V(2, doorClose), doorSlam: () => V(2, doorSlam), doorRattle: () => [doorRattle()],
  cabinetOpen: () => V(3, cabinetOpen), cabinetClose: () => V(3, cabinetClose), cabinetSlam: () => [cabinetSlam()], cabinetRattle: () => [doorRattle()],
  drawer: () => V(3, drawer), drawerShut: () => V(2, drawerShut), windowSlide: () => V(2, windowSlide), windowThud: () => [windowThud()], windowStuck: () => [doorRattle()],
  switch: () => V(2, switchClick), click: () => V(2, () => click(rnd(2500, 3500))), beep: () => [beep()], whoosh: () => [whoosh()], grab: () => V(2, () => rustle(0.12, 2500)),
  imp_ceramic: () => impact('ceramic'), imp_glass: () => impact('glass'), imp_metal: () => impact('metal'), imp_can: () => impact('can'), imp_plastic: () => impact('plastic'),
  imp_wood: () => impact('wood'), imp_cardboard: () => impact('cardboard'), imp_paper: () => impact('paper'), imp_food: () => impact('food'), imp_soft: () => impact('soft'),
  imp_meat: () => impact('meat'), imp_egg: () => impact('egg'), imp_bag: () => impact('bag'), imp_book: () => impact('book'),
  eggCrack: () => [eggCrack()], chewCrunch: () => chew('crunch'), chewSoft: () => chew('soft'), chewWet: () => chew('wet'), swallow: () => V(2, swallow), gulp: () => [gulp()], sip: () => [sip()], slurp: () => [slurp()],
  growl: () => growl(false), growlBig: () => growl(true), heartbeat: () => [heartbeat()], breath: () => breath(false), breathHeavy: () => breath(true), cough: () => cough(false), coughWet: () => cough(true),
  water: () => [water()], sizzle: () => [sizzle()], brew: () => [brew()], stoveIgnite: () => [stoveIgnite()], fridgeHum: () => [fridgeHum()], fridgeOpen: () => [fridgeOpen()], fridgeClose: () => [fridgeClose()],
  flush: () => [flush()], tapSqueak: () => [tapSqueak()], kibble: () => [kibble()], kibbleTick: () => V(3, kibbleTick), rip: () => [rip()], boxOpen: () => [boxOpen()], packetRustle: () => [rustle(0.4, 3500)],
  canOpen: () => [canOpen()], canTab: () => [canTab()], trashLid: () => [trashLid()], bagRustle: () => [rustle(0.6, 2200)],
  bell: () => [bell()], dialTone: () => [dialTone()], busy: () => [busy()], modem: () => [modem()], crtOn: () => [crtOn()], crtWhine: () => [crtWhine()], pcHum: () => [pcHum()], hdd: () => V(2, hdd),
  key: key, mouseClick: () => [mouseClick()], chime: () => [chime()], ding: () => [ding()], notify: () => [notify()], error: () => [errorSnd()], offhook: () => [offhook()], hangup: () => [offhook()], lineStatic: () => [lineStatic()],
  dtmf: () => Object.keys(DTMF).map((d) => dtmf(+d)),
  meow: () => catMeow('meow'), meowShort: () => catMeow('short'), meowPlead: () => catMeow('plead'), yowl: () => catMeow('yowl'), trill: catTrill, purr: () => [purr()], hiss, catGrowl: () => [catGrowl()],
  catScream: () => [catScream()], catStep, catLand: () => [catLand()], catEat: () => [catEat()], catLap: () => [catLap()], scratch: () => [scratch()],
  roarFar: () => V(2, () => roar(true)), roar: () => [roar(false)], droneLow: () => [drone(43, 8, 0.25)], droneVoid: () => [drone(36, 10, 0.4)], droneLab: () => [drone(55, 8, 0.35)],
  wind: () => [wind()], cityDay: () => [cityDay()], siren: () => [siren()], static: () => [staticNoise()], eas: () => [eas()], tinnitus: () => [tinnitus()], stinger: () => [stinger()],
  knocks: () => [knocks(3)], knock1: () => [knocks(1)], bodyFall: () => [bodyFall()], tear: () => [tear()], drip: drip, breaker: () => [breaker()], powerDown: () => [powerDown()],
  hum60: () => [hum60()], fluoro: () => [fluoro()], scream: () => [scream()], tvBabble: () => [tvBabble()], alienNear: () => [alienNear()], shipHum: () => [shipHum()], tapeHiss: () => [tapeHiss()],
  elevatorDing: () => [elevatorDing()], vending: () => [vending()], canDrop: () => [canDrop()], coin: () => [coin()], pickup, place, pocket: () => [rustle(0.2, 1600)], pageTurn: () => [pageTurn()],
  pain, radioTune: () => [radioTune()], alarmBeep: () => [alarmBeep()], sting2: () => [stinger()],
  fanHum: () => [fanHum()], radioMusic: () => [radioMusic()], microwaveHum: () => [microwaveHum()], kettleWhistle: () => [kettleWhistle()], fireBell: () => [fireBell()],
  radioChirp: () => [radioChirp()], doorBreak: () => [doorBreak()], heliFar: () => [heliFar()], warmChord: () => [warmChord()],
};
// sounds that loop when started with loop()
export const LOOPS = new Set(['water', 'sizzle', 'brew', 'fridgeHum', 'dialTone', 'crtWhine', 'pcHum', 'lineStatic', 'purr', 'catEat', 'catLap', 'droneLow', 'droneVoid', 'droneLab', 'wind', 'cityDay', 'static', 'hum60', 'fluoro', 'tvBabble', 'alienNear', 'shipHum', 'tapeHiss', 'vending', 'breath', 'breathHeavy', 'fanHum', 'radioMusic', 'microwaveHum', 'kettleWhistle', 'fireBell', 'heliFar']);
