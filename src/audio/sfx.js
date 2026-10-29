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
function microwaveHum() { const lp = new Biquad('lp', 900, 1); return normalize(makeLoop(render(3, (i, t) => Math.sin(TAU * 120 * t) * 0.35 + Math.sin(TAU * 60 * t) * 0.2 + lp.p(white()) * 0.12), 0.2), 0.35); }
function kettleWhistle() { let ph = 0; const bp = new Biquad('bp', 2200, 4); return normalize(makeLoop(render(3, (i, t) => { ph += TAU * (2150 + 60 * Math.sin(TAU * 5 * t) + 30 * white()) / SR; return Math.sin(ph) * 0.6 + bp.p(white()) * 0.4; }), 0.2), 0.4); }
function fireBell() { return normalize(makeLoop(render(2, (i, t) => { const tr = (t * 18) % 1; return (Math.sin(TAU * 1650 * t) * 0.6 + Math.sin(TAU * 3300 * t) * 0.25) * Math.exp(-tr * 6); }), 0.05), 0.5); }

// ================================================================ ต้มยำกุ้ง ๒๕๔๐
// Bangkok, Wednesday 2 July 1997, the day the baht floated. Room 1407, fourteen
// floors over a soi off Sukhumvit, in the monsoon. The loops below repeat
// exactly: their noise is hn(i), a hash of the sample index, so it comes round
// with the loop; LFOs and steady tones make whole cycles per loop; events wrap
// past the end (mixWrap); and loopRender() first runs the loop's own tail
// through every filter, so the last sample flows into the first with no
// crossfade dip.
const hn = (i, s = 0) => {
  let x = Math.imul(i ^ Math.imul(s, 0x27d4eb2f), 0x9e3779b1);
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 8) / 0x800000 - 1;
};
const seed = () => (Math.random() * 0x7fffffff) | 0;
const lfo = (t, L, k, ph = 0) => Math.sin(TAU * k * t / L + ph); // k whole cycles per loop of L s
const whole = (f, L) => Math.max(1, Math.round(f * L)) / L; // nearest pitch with whole cycles per loop
function loopRender(n, fn, pre = 0.5) {
  for (let i = Math.max(0, n - Math.floor(pre * SR)); i < n; i++) fn(i, i / SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i, i / SR);
  return out;
}
function mixWrap(dst, src, at, gain = 1) {
  const n = dst.length;
  let o = ((Math.floor(at * SR) % n) + n) % n;
  for (let i = 0; i < src.length; i++) { dst[o] += src[i] * gain; if (++o === n) o = 0; }
  return dst;
}
// bank of two-pole resonators rung by an excitation signal: modal() for a
// whole stream of strikes at once. modes: [freq, decay s, gain]
function resonate(exc, modes, pre = 0) {
  const n = exc.length, out = new Float32Array(n);
  for (const [f, d, g] of modes) {
    const w = TAU * f / SR, r = Math.exp(-1 / (d * SR)), c = 2 * r * Math.cos(w), r2 = r * r, k = g * Math.sin(w);
    let y1 = 0, y2 = 0;
    for (let i = Math.max(0, n - Math.floor(pre * SR)); i < n; i++) { const y = c * y1 - r2 * y2 + exc[i] * k; y2 = y1; y1 = y; }
    for (let i = 0; i < n; i++) { const y = c * y1 - r2 * y2 + exc[i] * k; y2 = y1; y1 = y; out[i] += y; }
  }
  return out;
}
// feedback delay that darkens on every pass: the slap back off the towers
class Echo {
  constructor(sec, fb = 0.3, lp = 1500) { this.d = new Float32Array(Math.max(1, Math.floor(sec * SR))); this.w = 0; this.fb = fb; this.lp = new OnePole(lp); }
  p(x) { const e = this.d[this.w]; this.d[this.w] = x + this.lp.p(e) * this.fb; if (++this.w === this.d.length) this.w = 0; return e; }
}
function echo(buf, sec = 0.22, fb = 0.3, mix = 0.35, lp = 1500, tail = 1) {
  const e = new Echo(sec, fb, lp), out = new Float32Array(buf.length + Math.floor(tail * SR));
  for (let i = 0; i < out.length; i++) { const x = i < buf.length ? buf[i] : 0; out[i] = x + e.p(x) * mix; }
  return out;
}
// one-period wavetables (band-limited by construction) read by phase in cycles
const TBL = 2048;
function table(amps) {
  const t = new Float32Array(TBL + 1);
  for (let i = 0; i <= TBL; i++) { let s = 0; for (let h = 0; h < amps.length; h++) s += amps[h] * Math.sin(TAU * (h + 1) * i / TBL); t[i] = s; }
  return normalize(t, 1);
}
const wt = (tab, ph) => { const x = (ph - Math.floor(ph)) * TBL, k = x | 0; return tab[k] + (tab[k + 1] - tab[k]) * (x - k); };
const TABS = {};
const tab = (name, amps) => TABS[name] || (TABS[name] = table(amps()));
const sawTab = () => tab('saw', () => Array.from({ length: 28 }, (_, h) => 1 / (h + 1)));
const sinTab = () => tab('sin', () => [1]);
// Padé tanh, cheap enough to run on every sample of a long loop
const ftanh = (x) => (x <= -3 ? -1 : x >= 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x));
const fsat = (x, k = 1.5) => ftanh(x * k) / ftanh(k);

// Karplus-Strong string read through a gliding fractional delay. bend starts
// the note flat and slides it up (a phin player pushing into the fret), bright
// keeps the highs ringing (steel strings, a pickup), drive is the cheap amp
const KS = new Float32Array(4096);
function pluck(dur, f, { decay = 0.996, bright = 0.3, tone = 0.6, bend = 1, bendT = 0.04, drive = 0 } = {}) {
  const n = Math.floor(dur * SR), out = new Float32Array(n), M = 4096, line = KS.fill(0);
  const P = SR / f, burst = Math.ceil(P), lp = new OnePole(600 + 12000 * tone * tone), k0 = drive ? ftanh(drive) : 1;
  const glide = bend === 1 ? 0 : Math.min(n, Math.floor(bendT * 8 * SR)), kb = Math.exp(-1 / (bendT * SR));
  let w = 0, prev = 0, bd = 1 - bend, D = P - bright;
  for (let i = 0; i < n; i++) {
    if (i < glide) { D = P / (1 - bd) - bright; bd *= kb; }
    let rp = w - D; if (rp < 0) rp += M;
    const k = rp | 0, fr = rp - k, a = line[k], b = line[(k + 1) & (M - 1)];
    const y = a + (b - a) * fr;
    const s = decay * ((1 - bright) * y + bright * prev); prev = y;
    const x = s + (i < burst ? lp.p(white()) : 0);
    line[w] = x; w = (w + 1) & (M - 1);
    out[i] = drive ? ftanh(x * drive) / k0 : x;
  }
  const rl = Math.min(n, Math.floor(0.025 * SR)); // short release, so the next note can stop it
  for (let i = 0; i < rl; i++) out[n - 1 - i] *= i / rl;
  return out;
}

// unintelligible tonal speech: phrases of syllables, each on one of the five
// Thai tone contours (mid, low, falling, high, rising), with an onset burst,
// two moving vowel formants and some "dead" syllables cut off short. No words;
// it only sounds like talk.
const VOWELS = [[800, 1250], [300, 2250], [330, 800], [450, 2000], [650, 1750], [460, 850], [600, 950], [350, 1400], [520, 1400]];
const TONE = [
  (p) => 1 - 0.03 * p,
  (p) => 0.87 - 0.06 * p,
  (p) => (p < 0.3 ? 1.06 + 0.3 * p : 1.15 - 0.47 * (p - 0.3)),
  (p) => 1.07 + 0.12 * p * p,
  (p) => (p < 0.4 ? 0.9 - 0.12 * p : 0.852 + 0.36 * ((p - 0.4) / 0.6) ** 2),
];
function syllables(dur, { rate = 5, phrase = [3, 8], pause = [0.2, 0.5] } = {}) {
  const out = [];
  let t = rnd(0, 0.08);
  while (t < dur - 0.12) {
    const n = phrase[0] + Math.floor(Math.random() * (phrase[1] - phrase[0] + 1));
    for (let k = 0; k < n && t < dur - 0.12; k++) {
      const len = Math.min(dur - t, rnd(0.6, 1.35) / rate * (k === n - 1 ? 1.6 : 1));
      const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
      out.push({ t0: t, len, tone: TONE[Math.floor(Math.random() * 5)], F1: v[0], F2: v[1], cons: Math.random() < 0.7 ? rnd(0.01, 0.045) : 0, dead: Math.random() < 0.3, decl: 1 - 0.1 * k / n, amp: rnd(0.75, 1) * (k ? 1 : 1.1) });
      t += len;
    }
    t += rnd(pause[0], pause[1]);
  }
  return out;
}
function babble(dur, { f0 = 180, range = 1, breath = 0.1, shout = 0, vib = 0, form = 1, sched = null, ...o } = {}) {
  const syl = sched || syllables(dur, o), n = Math.floor(dur * SR), out = new Float32Array(n);
  const F1 = new Biquad('bp', 500, 5), F2 = new Biquad('bp', 1500, 7), F3 = new Biquad('bp', 2700 * form, 6), C = new Biquad('bp', 2800 * form, 1.2);
  const duty = 0.42 - 0.17 * shout, g3 = 0.25 + 0.35 * shout, dr = 1 + 3 * shout, dn = ftanh(1.5);
  let ph = 0, f1 = 500 * form, f2 = 1500 * form, inc = 0;
  for (const S of syl) { // only the voiced spans are rendered
    const i0 = Math.max(0, Math.ceil(S.t0 * SR)), i1 = Math.min(n, Math.floor((S.t0 + S.len) * SR)), rel = S.dead ? 0.005 : 0.04;
    for (let i = i0; i < i1; i++) {
      const ta = i / SR - S.t0;
      if (((i - i0) & 31) === 0) { // pitch contour and formants glide: update them per 32 samples
        inc = f0 * (1 + (S.tone(ta / S.len) - 1) * range) * S.decl * (vib ? 1 + vib * Math.sin(TAU * 5.5 * i / SR) : 1) / SR;
        f1 += (S.F1 * form - f1) * 0.08; f2 += (S.F2 * form - f2) * 0.08; F1.set('bp', f1, 5); F2.set('bp', f2, 7);
      }
      ph += inc; if (ph >= 1) ph -= 1;
      let g = 0;
      if (ph < duty) { const u = ph / duty; g = 4 * u * (1 - u); } // ~ one sine arch
      const src = (g * g - duty * 0.5) * 2 + white() * breath;
      let y = F1.p(src) + F2.p(src) * 0.6 + F3.p(src) * g3;
      if (ta < S.cons) y += C.p(white()) * 1.2 * (1 - ta / S.cons);
      const tr = S.len - ta, env = (ta < 0.015 ? ta / 0.015 : 1) * (tr < rel ? tr / rel : 1);
      out[i] += (shout ? ftanh(y * dr * 1.5) / dn : y) * env * S.amp;
    }
  }
  // every talker at the same speaking level (-12 dB RMS while voiced), shouters a little over
  let e = 0, c = 0;
  for (let i = 0; i < n; i++) if (out[i] !== 0) { e += out[i] * out[i]; c++; }
  const k = c ? 0.25 * (1 + 0.4 * shout) / Math.sqrt(e / c) : 1;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

// ---------------------------------------------------------------- radio: luk thung
// The pink AM radio's station: a luk thung / mor lam instrumental in lai yai
// (A C D E G). A twangy electric phin carries the tune, a khaen drones on A
// and E with breathy chord pulses, ching-chap cymbals tick the off-beats, the
// bass bounces root to fifth under a plain kit; then it is all squeezed into
// the AM band, driven a little hot and dusted with static. 16 bars at 136 bpm.
function radioLukThung() {
  const B = Math.round(SR * 60 / 136), E = B / 2, BAR = B * 4, N = BAR * 16, L = N / SR, s = seed();
  const at = (k) => (k * E) / SR; // eighth-note index -> seconds
  const mix = new Float32Array(N);
  const NOTE = { e: 329.63, g: 392, a: 440, c: 523.25, d: 587.33, E: 659.26, G: 783.99, A: 880 };
  const tune = ['a.cdE.dc', 'd.cac.a.', 'G.EdE.GA', 'Edcda...', 'a.cdE.dc', 'd.cac.ag', 'e.gac.dE', 'dcaga...',
    'G.G.AGE.', 'd.EGE.dc', 'E.E.GEd.', 'c.dca.g.', 'a.cdE.dc', 'd.cac.a.', 'G.EdE.dc', 'dcaca.a.'].join('');
  const roots = 'AAGAAACAGCCGAAGA';
  // phin: a note rings until the next; a held one gets the player's second pick,
  // and a note after a rest slides up into pitch
  const ph = { decay: 0.9975, bright: 0.12, tone: 0.9, drive: 2.2 };
  for (let k = 0; k < tune.length; k++) {
    const c = tune[k];
    if (c === '.') continue;
    let len = 1;
    while (len < 6 && tune[(k + len) % tune.length] === '.') len++;
    const bend = tune[(k + tune.length - 1) % tune.length] === '.' || Math.random() < 0.12 ? 0.944 : 1, g = k % 2 ? 0.5 : 0.62;
    if (len > 1) {
      mixWrap(mix, pluck(E / 2 / SR + 0.03, NOTE[c], { ...ph, bend }), at(k), g);
      mixWrap(mix, pluck((len - 0.5) * E / SR + 0.03, NOTE[c], ph), at(k + 0.5), g * 0.7);
    } else mixWrap(mix, pluck(E / SR + 0.03, NOTE[c], { ...ph, bend }), at(k), g);
  }
  // bass: root, fifth below, root, fifth; a step into the next bar's chord
  const ROOT = { A: [110, 82.41], G: [98, 73.42], C: [130.81, 98] };
  const bo = { decay: 0.995, bright: 0.5, tone: 0.35, drive: 1.5 };
  for (let b = 0; b < 16; b++) {
    const [r, f5] = ROOT[roots[b]], nx = ROOT[roots[(b + 1) % 16]][0];
    [r, f5, r, f5].forEach((f, q) => mixWrap(mix, pluck(q === 3 && nx !== r ? 0.2 : 0.38, f, bo), at(b * 8 + q * 2), 0.6));
    if (nx !== r) mixWrap(mix, pluck(0.2, nx * (nx > r ? 0.891 : 1.122), bo), at(b * 8 + 7), 0.5);
  }
  // kit, and the ching (open, ringing) and chap (pressed shut) cymbals
  const kick = thump(0.3, 150, 52, 0.08);
  mixInto(kick, noiseBurst(0.03, { type: 'lp', f: 3500, d: 0.003 }), 0, 0.5);
  const snare = noiseBurst(0.2, { f: 1900, q: 0.7, d: 0.06 });
  mixInto(snare, thump(0.12, 240, 185, 0.035), 0, 0.6);
  const CM = [[2093, 1], [2795, 1.3], [3520, 1.1], [4410, 0.8], [5870, 0.5]];
  const ching = V(3, () => modal(0.7, CM.map(([f, g]) => [f * rnd(0.99, 1.01), 0.42 * rnd(0.8, 1.1) * 2093 / f, g * 0.3]), 0.001));
  const chap = V(2, () => { const o = modal(0.12, CM.map(([f, g]) => [f, 0.035, g * 0.25]), 0.001); mixInto(o, noiseBurst(0.12, { f: 3000, q: 0.8, d: 0.02 }), 0, 0.5); return o; });
  for (let b = 0; b < 16; b++) {
    for (let e = 0; e < 8; e++) {
      const t = at(b * 8 + e);
      if (e === 0 || e === 4 || (e === 7 && b % 2)) mixWrap(mix, kick, t, 0.7);
      if (e === 2 || e === 6) { mixWrap(mix, snare, t, 0.35); mixWrap(mix, chap[(b + e) % 2], t, 0.55); }
      if (e % 2) mixWrap(mix, ching[(b + e) % 3], t, 0.26);
    }
  }
  // khaen: free reeds droning A and E, chord pipes pulsed with the breath on every eighth
  const reed = table([1, 0.75, 0.6, 0.38, 0.3, 0.2, 0.14, 0.09, 0.06, 0.04]);
  const DR = [220, 329.63].map((f) => whole(f, L)), KP = [392, 440, 523.25, 587.33, 659.26, 783.99].map((f) => whole(f, L));
  const CH = { A: [1, 2, 4], G: [0, 3, 5], C: [2, 4, 5] };
  const masks = [...roots].map((r) => KP.map((_, j) => (CH[r].includes(j) ? 1 : 0)));
  const amp = new Float32Array(6), body = new Biquad('bp', 1300, 0.6), pulse = render(E / SR, (i, t) => 0.35 + 0.65 * Math.exp(-t / 0.06));
  const band = normalize(loopRender(N, (i, t) => {
    const m = masks[Math.floor(i / BAR)], pu = pulse[i % E];
    let ch = 0;
    if ((i & 15) === 0) for (let j = 0; j < 6; j++) amp[j] += (m[j] - amp[j]) * 0.047;
    for (let j = 0; j < 6; j++) if (amp[j] > 0.001) ch += amp[j] * wt(reed, KP[j] * t);
    let kh = (wt(reed, DR[0] * t) * 0.7 + wt(reed, DR[1] * t) * 0.45) * (0.75 + 0.25 * pu) + ch * 0.4 * pu + hn(i, s) * 0.04 * pu;
    kh = kh * 0.5 + body.p(kh) * 0.9;
    return mix[i] + kh * 0.11;
  }), 0.7);
  // the radio: a small speaker's band, a hot cheap output stage, AM fading and static
  const hp = new Biquad('hp', 200, 0.7), lp1 = new Biquad('lp', 4200, 0.6), lp2 = new Biquad('lp', 4800, 0.8), cone = new Biquad('peak', 1600, 0.8, 5);
  const hiss = new Biquad('bp', 2600, 0.6), tick = new Biquad('bp', 1800, 1.2), dn = ftanh(1.8);
  let ck = 0, fade = 1;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 63) === 0) fade = 1.6 * 1.8 * (0.9 + 0.1 * lfo(t, L, 3, 1.3));
    const x = ftanh(cone.p(lp2.p(lp1.p(hp.p(band[i])))) * fade) / dn;
    if (hn(i, s + 3) > 0.99965) ck = hn(i, s + 4);
    ck *= 0.993;
    return x + hiss.p(hn(i, s + 5)) * 0.045 + tick.p(ck * hn(i, s + 6)) * 0.5;
  }, 0.3), 0.85);
}
// radioMusic is the old name of the radio's loop: both names share one synthesis
let lukBuf = null, lukUses = 0;
const lukThung = () => { const b = lukBuf || (lukBuf = radioLukThung()); if (++lukUses === 2) lukBuf = null; return b; };

// ---------------------------------------------------------------- tv: lakorn through the wall
// next door's set, eight o'clock lakorn: she accuses, he answers low, a slap and
// a gasp, the strings stab; she sobs, he shouts, the strings swell and she
// laments, over a sad pad that never stops. All of it through concrete
function slap() { const o = noiseBurst(0.15, { f: 2200, q: 0.8, a: 0.0005, d: 0.01 }); mixInto(o, noiseBurst(0.15, { type: 'lp', f: 700, d: 0.025 }), 0, 1.4); return o; }
function gasp(dur = 0.45) {
  const F1 = new Biquad('bp', 700, 3), F2 = new Biquad('bp', 1700, 4);
  let ph = 0;
  return render(dur, (i, t) => {
    const p = t / dur;
    if ((i & 31) === 0) { F1.set('bp', 600 + 450 * p, 3); F2.set('bp', 1500 + 900 * p, 4); }
    ph += (420 + 200 * p) / SR; if (ph >= 1) ph -= 1;
    const x = white() * 0.9 + (p > 0.5 ? (ph < 0.3 ? 1 : -0.43) * 0.5 * (p - 0.5) / 0.5 : 0); // the voice catches at the top
    return (F1.p(x) + F2.p(x) * 0.7) * ad(t, dur * 0.55, dur * 0.2);
  });
}
// melodrama strings: a diminished cluster hit hard over a timpani, or (swell)
// bowed tremolo climbing toward it
function melodrama(dur, swell = 0) {
  const fs = [130.81, 155.56, 185, 261.63, 311.13, 369.99], saw = sawTab(), ph = fs.map(() => Math.random());
  const out = render(dur, (i, t) => {
    let x = 0;
    for (let k = 0; k < fs.length; k++) x += wt(saw, fs[k] * (1 + 0.003 * ((k % 3) - 1)) * t + ph[k]);
    const env = swell ? Math.min(1, t / swell) ** 2 * (0.6 + 0.4 * Math.sin(TAU * 11 * t)) * Math.min(1, (dur - t) / 0.05) : ad(t, 0.012, dur * 0.4);
    return x * env / fs.length;
  });
  if (!swell) mixInto(out, thump(0.8, 90, 55, 0.3), 0, 0.8);
  return out;
}
function tvLakorn() {
  const L = 20, N = L * SR, s = seed(), fx = new Float32Array(N);
  const her = { f0: rnd(250, 280), rate: 6.2, range: 1.4, breath: 0.12, phrase: [4, 9], pause: [0.15, 0.35] };
  const him = { f0: rnd(110, 125), rate: 4.4, range: 1, breath: 0.08, phrase: [3, 6], pause: [0.25, 0.5] };
  mixWrap(fx, babble(4.3, { ...her, shout: 0.35 }), 0.3, 0.9);
  mixWrap(fx, babble(2.1, him), 4.8, 1);
  mixWrap(fx, slap(), 7.15, 2.5);
  mixWrap(fx, gasp(0.5), 7.22, 2);
  mixWrap(fx, melodrama(1.8), 7.3, 0.7);
  mixWrap(fx, babble(3.3, { ...her, f0: her.f0 * 1.08, rate: 4.6, vib: 0.07, breath: 0.3 }), 9.0, 0.75);
  mixWrap(fx, gasp(0.3), 10.6, 1.1);
  mixWrap(fx, gasp(0.3), 11.75, 1);
  mixWrap(fx, babble(2.0, { ...him, f0: him.f0 * 1.3, rate: 5.6, shout: 1 }), 12.7, 1.05);
  mixWrap(fx, melodrama(1.2, 1.1), 14.0, 1.2);
  mixWrap(fx, melodrama(2.0), 15.2, 0.7);
  mixWrap(fx, babble(3.4, { ...her, f0: her.f0 * 0.95, rate: 3.6, vib: 0.09, breath: 0.35 }), 16.3, 0.65);
  // the pad under everything: Am, F, Dm, E, five seconds each
  const PF = [146.83, 164.81, 174.61, 207.65, 220, 246.94, 261.63, 329.63];
  const F = PF.map((f) => whole(f, L)), saw = sawTab();
  const masks = [[4, 6, 7], [2, 4, 6], [0, 2, 4], [1, 3, 5]].map((c) => PF.map((_, j) => (c.includes(j) ? 1 : 0)));
  const amp = new Float32Array(8), padLp = new Biquad('lp', 1400, 0.7);
  // the TV's small speaker, then the wall: lows through, highs gone, a panel boom
  const spk = new Biquad('hp', 220, 0.7), wall1 = new Biquad('lp', 950, 0.6), wall2 = new Biquad('lp', 1100, 0.7), boom = new Biquad('peak', 150, 1.2, 4);
  let pg = 0;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 31) === 0) {
      const m = masks[Math.floor(t / 5) % 4];
      for (let j = 0; j < 8; j++) amp[j] += (m[j] - amp[j]) * 0.0026;
      pg = (0.8 + 0.2 * lfo(t, L, 4, 0.5)) * 0.06;
    }
    let pad = 0;
    for (let j = 0; j < 8; j++) if (amp[j] > 0.002) pad += amp[j] * wt(saw, F[j] * t);
    const x = fx[i] + padLp.p(pad) * pg;
    return boom.p(wall2.p(wall1.p(spk.p(x)))) + hn(i, s) * 0.002;
  }, 1), 0.7);
}

// ---------------------------------------------------------------- tokay gecko
// ตุ๊กแก in the wall cavity: a croaking chuckle winds it up, then the loud
// two-note "to-KAE" four to seven times, each slower, weaker and lower
function geckoNote(dur, fA, fB, F1v, F2v, rough, hard) {
  const F1 = new Biquad('bp', F1v, 4), F2 = new Biquad('bp', F2v, 5), F3 = new Biquad('bp', 2600, 3);
  let ph = 0, odd = false;
  return render(dur, (i, t) => {
    const p = t / dur;
    ph += (fA + (fB - fA) * p) / SR;
    if (ph >= 1) { ph -= 1; odd = !odd; }
    const src = sat((ph < 0.3 ? 1 : -0.35) * (odd ? 1 - rough : 1) + white() * 0.25, 2); // period-doubled rasp
    return (F1.p(src) + F2.p(src) * 0.8 + F3.p(src) * 0.3) * Math.min(1, t / hard) * Math.pow(1 - p, 0.7);
  });
}
function gecko() {
  return V(3, (v) => {
    const calls = [5, 7, 4][v], f = rnd(0.92, 1.08), out = silence(2 + calls * 1.5);
    let at = 0.05, gap = 0.06;
    for (let k = 0; k < 14; k++) { mixInto(out, geckoNote(0.035, 180 * f, 150 * f, 450, 1100, 0.5, 0.002), at, 0.25 + 0.04 * k); at += gap; gap *= 0.93; }
    mixInto(out, geckoNote(0.09, 260 * f, 200 * f, 500, 1200, 0.3, 0.003), at + 0.05, 0.9); // "kuk!"
    at += 0.5;
    let iv = rnd(0.95, 1.1), g = 1, ff = f, end = 0;
    for (let k = 0; k < calls; k++) {
      mixInto(out, geckoNote(0.075, 330 * ff, 430 * ff, 550, 1050, 0.15, 0.003), at, g * 0.9); // "to": short, rising, rounded
      mixInto(out, noiseBurst(0.02, { f: 2200, q: 1.5, d: 0.006 }), at + 0.135, g * 0.5); // the "k"
      mixInto(out, geckoNote(rnd(0.24, 0.3) * (k === calls - 1 ? 0.8 : 1), 400 * ff, 270 * ff, 780, 1750, 0.35, 0.006), at + 0.14, g); // "KAE": long, falling, harsh
      end = at + 0.6;
      at += iv; iv *= rnd(1.05, 1.12); g *= rnd(0.8, 0.88); ff *= 0.985;
    }
    const lp = new OnePole(5000);
    return normalize(fadeEdges(out.slice(0, Math.min(out.length, Math.floor(end * SR))).map((x) => lp.p(x)), 0.002, 0.1), 0.9);
  });
}

// ---------------------------------------------------------------- engines
// a small petrol engine: a firing pulse train (fire(t) in Hz) knocking the
// exhaust resonances, rasp noise on every stroke, a twin's uneven cylinders and
// a rattling body; then the pass-by: Doppler, 1/distance and air absorption
function engine(dur, { fire, res = [[150, 2, 0.8], [650, 1.5, 1], [2300, 2, 0.6]], sharp = 14, rasp = 0.5, twin = 0, jit = 0.04, tc = dur / 2, v = 12, r = 6, air = 1, rattle = 0, drive = 2.5 }) {
  const n = Math.floor(dur * SR), out = new Float32Array(n), rx = new Float32Array(rattle ? n : 0);
  const B = res.map(([f, q]) => new Biquad('bp', f, q)), G = Float64Array.from(res, (q) => q[2]), nb = B.length, lp = new Biquad('lp', 5000, 0.6), hp = new Biquad('hp', 45, 0.7), dn = ftanh(1.4);
  const revs = new Float64Array((n >> 6) + 1); // speed, distance and revs move slowly: per 64-sample block
  for (let b = 0; b < revs.length; b++) revs[b] = fire(b * 64 / SR);
  let ph = 0, cj = 1, cyl = 0, g = 1, inc = 0, pulse = 0, fall = 1;
  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) {
      const t = i / SR, x = v * (t - tc), d = Math.hypot(x, r);
      g = r / d; inc = revs[i >> 6] / (1 + v * x / d / 343) / SR;
      fall = Math.exp(-sharp * inc * cj);
      lp.set('lp', (900 + 7000 * g * g) * air, 0.6);
    }
    ph += inc * cj;
    if (ph >= 1) { // a firing
      ph -= 1; cyl ^= 1; cj = 1 + rnd(-jit, jit); pulse = (cyl ? 1 - twin : 1) * rnd(0.85, 1.1); fall = Math.exp(-sharp * inc * cj);
      if (rattle && Math.random() < rattle) rx[i] = rnd(-1, 1) * g;
    }
    const x = pulse * (1 + white() * rasp);
    pulse *= fall;
    let y = 0;
    for (let k = 0; k < nb; k++) y += B[k].p(x) * G[k];
    out[i] = lp.p(ftanh(hp.p(y) * drive * 1.4) / dn) * g;
  }
  if (rattle) mixInto(out, resonate(rx, [[rnd(900, 1000), 0.04, 0.3], [rnd(1800, 1950), 0.03, 0.3], [rnd(2900, 3200), 0.02, 0.2], [rnd(4400, 4800), 0.015, 0.15]]), 0, 0.6);
  return out;
}
// revs through the gears: [[from Hz, to Hz, seconds], ...], holding the last
function gears(segs) {
  return (t) => {
    for (let k = 0; k < segs.length; k++) { const g = segs[k]; if (t < g[2]) { const p = 1 - t / g[2]; return g[0] + (g[1] - g[0]) * (1 - p * p); } t -= g[2]; }
    return segs[segs.length - 1][1];
  };
}
// [0] pulls away through the gears, [1] idles along, blips, and goes
function tukTuk() {
  return V(2, (v) => {
    const dur = 6.5;
    const fire = v ? (t) => 44 + 8 * Math.sin(TAU * 0.7 * t) + 55 * (t > 2.4 && t < 3.2 ? Math.sin(Math.PI * (t - 2.4) / 0.8) : 0) + 50 * clamp((t - 4.2) / 0.8, 0, 1) : gears([[45, 95, 1.6], [70, 115, 2.2], [90, 110, 9]]);
    const o = { fire, res: [[120, 2.5, 0.7], [520, 2, 1], [1800, 2.5, 0.6]], sharp: 14, rasp: 0.9, twin: 0.35, jit: 0.07, rattle: 0.6, tc: dur * 0.48, v: v ? 7 : 9, r: v ? 5 : 6 };
    return normalize(fadeEdges(engine(dur, o), 0.4, 0.8), 0.85);
  });
}
// [0] a two-stroke step-through wrung out ("ring-ding-ding"), [1] a four-stroke
// Honda Dream's even putter, [2] a two-stroke rider blipping past a stall
function motorbike() {
  return V(3, (v) => {
    const dur = 4.6;
    const o = [
      { fire: gears([[70, 135, 0.9], [100, 150, 1.2], [118, 158, 1.5], [150, 150, 9]]), res: [[180, 2, 0.5], [900, 1.4, 1], [2600, 2, 0.7]], sharp: 18, rasp: 0.8, v: 15, r: 5 },
      { fire: gears([[32, 55, 1.2], [42, 62, 1.6], [50, 64, 9]]), res: [[110, 2.5, 1], [420, 2, 0.8], [1500, 2, 0.4]], sharp: 16, rasp: 0.25, v: 12, r: 5, drive: 1.8 },
      { fire: (t) => 95 + 45 * Math.max(0, Math.sin(TAU * 0.9 * t)) ** 2 + 10 * Math.sin(TAU * 3.1 * t), res: [[200, 2, 0.5], [1100, 1.6, 1], [2800, 2, 0.6]], sharp: 18, rasp: 0.85, v: 11, r: 6 },
    ][v];
    return normalize(fadeEdges(engine(dur, { tc: dur * rnd(0.42, 0.5), ...o }), 0.3, 0.6), 0.85);
  });
}
// horns: [0] a car's twin disc horns, tap and lean; [1] a Honda Dream's thin
// "meep meep"; [2] a BMTA bus leaning on it
function hornRaw(kind) {
  const H = [
    { f: [415, 520], beeps: [[0, 0.14], [0.22, 0.42]], bp: [2400, 1.3], drive: 3 },
    { f: [470], beeps: [[0, 0.12], [0.19, 0.12]], bp: [1300, 2.5], drive: 2, sag: 0.1 },
    { f: [196, 248, 294], beeps: [[0, 1.0]], bp: [850, 0.8], drive: 4, sag: -0.05 },
  ][kind];
  const buzz = tab('horn', () => Array.from({ length: 36 }, (_, h) => (h % 2 ? 0.55 : 1) / (h + 1)));
  const fs = H.f.map((f) => f * rnd(0.97, 1.03)), last = H.beeps[H.beeps.length - 1], out = silence(last[0] + last[1] + 0.1);
  const bp = new Biquad('bp', H.bp[0], H.bp[1]);
  for (const [at, d] of H.beeps) {
    const ph = fs.map(() => Math.random());
    mixInto(out, render(d, (i, t) => {
      const bend = 1 - (H.sag || 0) * Math.exp(-t / 0.04);
      let x = 0;
      for (let k = 0; k < fs.length; k++) { ph[k] += fs[k] * bend / SR; x += wt(buzz, ph[k]); }
      x /= fs.length;
      return sat(x * 0.5 + bp.p(x) * 1.5, H.drive) * Math.min(1, t / 0.01, (d - t) / 0.02);
    }), at);
  }
  return out;
}
const horn = () => V(3, (k) => normalize(fadeEdges(echo(hornRaw(k), 0.26, 0.25, 0.22, 1600, 0.6), 0.002, 0.2), 0.8));

// ---------------------------------------------------------------- the street, fourteen floors down
// Sukhumvit's roar coming up the soi: dense traffic, bikes winding up and down
// through the gears, a tuk-tuk, a bus pulling off with an air-brake sigh,
// horns, and very faintly the ice-cream cart's bell. Sits under everything.
function bangkokStreet() {
  const L = 20, N = L * SR, s = seed(), ev = new Float32Array(N);
  for (let k = 0; k < 6; k++) {
    const two = k % 3 !== 2, d = rnd(3.5, 4.8), f = two ? rnd(60, 78) : rnd(28, 36);
    const b = engine(d, {
      fire: gears([[f, f * 1.9, rnd(0.8, 1.2)], [f * 1.35, f * 2.1, rnd(1, 1.5)], [f * 1.6, f * 2.2, 9]]),
      res: two ? [[190, 2, 0.5], [950, 1.4, 1]] : [[110, 2.5, 1], [450, 2, 0.8]], sharp: two ? 18 : 16, rasp: two ? 0.8 : 0.25, v: rnd(9, 15), r: rnd(45, 70), air: 0.45, tc: d * rnd(0.3, 0.7),
    });
    mixWrap(ev, fadeEdges(b, 0.6, 0.9), k * L / 6 + rnd(0, 2), two ? rnd(0.5, 0.9) : 0.6);
  }
  mixWrap(ev, fadeEdges(engine(5, { fire: gears([[45, 80, 1.5], [60, 95, 2], [75, 90, 9]]), res: [[120, 2.5, 0.6], [520, 2, 1]], sharp: 14, rasp: 0.9, twin: 0.35, jit: 0.07, v: 8, r: 50, air: 0.45 }), 0.8, 1), rnd(0, L), 0.9);
  mixWrap(ev, fadeEdges(engine(5, { fire: gears([[18, 30, 2.5], [22, 32, 9]]), res: [[90, 2, 0.8], [260, 2, 1]], sharp: 8, rasp: 0.4, v: 5, r: 55, air: 0.35, drive: 3 }), 0.8, 1.2), rnd(0, L), 0.8);
  const brake = noiseBurst(1.3, { type: 'hp', f: 2200, q: 0.7, a: 0.015, d: 0.4 });
  mixInto(brake, noiseBurst(0.3, { type: 'hp', f: 3000, d: 0.08 }), 0.9, 0.6);
  mixWrap(ev, brake, rnd(0, L), 0.12);
  for (let k = 0; k < 3; k++) mixWrap(ev, hornRaw(k), k * L / 3 + rnd(0, 5), [0.18, 0.12, 0.2][k] * rnd(0.6, 1)); // Bangkok drivers rarely honk
  mixWrap(ev, handBell([[0, 6]], 1.2), rnd(0, L), 0.05);
  const r1 = new Biquad('bp', 380, 0.5), r2 = new Biquad('bp', 1000, 0.6), ty = new Biquad('bp', 2400, 0.5), air = new Biquad('lp', 2400, 0.6), lo = new Biquad('hp', 55, 0.7), ec = new Echo(0.27, 0.3, 1300);
  let sw = 1;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 63) === 0) sw = 0.8 + 0.12 * lfo(t, L, 1, 0.9) + 0.08 * lfo(t, L, 3, 2.2);
    const a = hn(i, s), b = hn(i, s + 1), e = air.p(ev[i]);
    return lo.p((r1.p(a) * 0.9 + r2.p(b) * 0.3 + ty.p(b) * 0.06) * sw + e + ec.p(e) * 0.35);
  }, 1.5), 0.55);
}

// ---------------------------------------------------------------- soi dogs
function bark(f0, dur, { harsh = 0.45, F = [700, 1500, 2600] } = {}) {
  const F1 = new Biquad('bp', F[0], 3), F2 = new Biquad('bp', F[1], 4), F3 = new Biquad('bp', F[2], 4);
  let ph = 0;
  return render(dur, (i, t) => {
    const p = t / dur;
    ph += f0 * (p < 0.15 ? 0.75 + 0.25 * p / 0.15 : 1 - 0.35 * (p - 0.15) / 0.85) / SR;
    if (ph >= 1) ph -= 1;
    const src = sat((ph < 0.35 ? 1 : -0.5) + white() * harsh, 2);
    return (F1.p(src) + F2.p(src) * 0.7 + F3.p(src) * 0.3) * Math.min(1, t / 0.008) * Math.pow(1 - p, 1.4);
  });
}
function howl(f0, dur) {
  const F1 = new Biquad('bp', 450, 4), F2 = new Biquad('bp', 900, 5);
  let ph = 0;
  return render(dur, (i, t) => {
    const p = t / dur;
    ph += f0 * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, p * 1.3)) - 0.25 * p) * (1 + 0.012 * Math.sin(TAU * 5 * t)) / SR;
    if (ph >= 1) ph -= 1;
    const src = (ph < 0.45 ? Math.sin(Math.PI * ph / 0.45) : 0) - 0.29 + white() * 0.06;
    return (F1.p(src) + F2.p(src) * 0.5) * Math.sin(Math.PI * p) ** 0.6;
  });
}
// [0] one dog, [1] two, the second further up the soi, [2] a yapper and a howler
function soiDog() {
  return V(3, (v) => {
    const out = silence(3.2);
    if (v === 0) {
      const f = rnd(380, 460);
      for (const at of [0.05, 0.36, 0.64, 1.45, 1.74]) mixInto(out, bark(f * rnd(0.95, 1.05), rnd(0.15, 0.21)), at, rnd(0.8, 1));
    } else if (v === 1) {
      const fa = rnd(330, 380), fb = rnd(480, 540);
      for (const at of [0.05, 0.4]) mixInto(out, bark(fa, 0.2), at, 1);
      for (const at of [0.95, 1.18, 1.41, 1.66]) mixInto(out, bark(fb, 0.14, { F: [800, 1700, 2800] }), at, 0.45);
      mixInto(out, bark(fa, 0.22), 2.3, 0.9);
    } else {
      const f = rnd(600, 700);
      for (let k = 0; k < 6; k++) mixInto(out, bark(f, 0.1, { harsh: 0.3, F: [900, 1900, 3000] }), 0.05 + k * 0.17 + rnd(0, 0.03), 0.6);
      mixInto(out, howl(rnd(480, 540), 1.5), 1.25, 0.8);
    }
    const lp = new Biquad('lp', 1700, 0.6);
    for (let i = 0; i < out.length; i++) out[i] = lp.p(out[i]);
    return normalize(fadeEdges(echo(out, 0.24, 0.3, 0.35, 1200, 0.6), 0.002, 0.3), 0.8);
  });
}

// ---------------------------------------------------------------- vendors
// the rubber squeeze-bulb horn on a bread or ice-cream cart: "poo-poo"
function squeeze(f, dur) {
  const reed = tab('bulb', () => [1, 0.9, 0.75, 0.6, 0.5, 0.42, 0.33, 0.26, 0.2, 0.15, 0.11, 0.08]);
  const b1 = new Biquad('bp', 1150, 2), b2 = new Biquad('bp', 2500, 3);
  let ph = 0;
  return render(dur, (i, t) => {
    const p = t / dur;
    ph += f * (0.88 + 0.12 * Math.min(1, t / 0.05)) * (1 - 0.06 * Math.max(0, (p - 0.7) / 0.3)) / SR; // pressure builds, then sags
    const x = wt(reed, ph) + white() * 0.12;
    return sat(x * 0.6 + b1.p(x) * 1.2 + b2.p(x) * 0.8, 1.8) * Math.min(1, t / 0.025, (dur - t) / 0.04);
  });
}
// [0] two long squeezes, [1] three quick ones
function vendorHorn() {
  return V(2, (v) => {
    const out = silence(1.2), f = rnd(330, 400);
    for (const a of v ? [0, 0.22, 0.44] : [0, 0.32]) mixInto(out, squeeze(f * rnd(0.98, 1.02), v ? 0.16 : 0.24), 0.02 + a);
    return normalize(fadeEdges(echo(out, 0.21, 0.25, 0.25, 1500, 0.5), 0.002, 0.2), 0.8);
  });
}
// the ice-cream cart's brass hand bell: shakes of [start s, strikes], clapper at 11 Hz
function handBell(shakes, dur) {
  const exc = new Float32Array(Math.floor(dur * SR)), f = rnd(1950, 2250);
  for (const [t0, k] of shakes) {
    for (let j = 0; j < k; j++) { const i = Math.floor((t0 + 0.02 + j / 11 + rnd(-0.006, 0.006)) * SR); if (i < exc.length) exc[i] += (j % 2 ? 0.7 : 1) * rnd(0.7, 1); }
  }
  const out = resonate(exc, [[f, 0.7, 0.5], [f * 1.004, 0.7, 0.3], [f * 2.44, 0.45, 0.35], [f * 4.11, 0.25, 0.22], [f * 5.92, 0.14, 0.12]]);
  const hp = new Biquad('hp', 3000, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += hp.p(exc[i]) * 0.2; // the clapper's tick
  return out;
}
const vendorBell = () => normalize(fadeEdges(handBell([[0, 9], [1.05, 6]], 2.6), 0.001, 0.4), 0.75);

// ---------------------------------------------------------------- the wat
// from the temple down the soi: [0] the big bronze rakhang struck with a
// wooden beam, hum and prime slowly beating; [1] a bossed gong whose upper
// partials bloom after the strike
function templeBell() {
  return V(2, (v) => {
    const dur = 12, n = dur * SR, exc = new Float32Array(n), m = Math.floor((v ? 0.002 : 0.0012) * SR);
    for (let i = 0; i < m; i++) exc[i] = Math.sin(Math.PI * i / m) * 0.05 + white() * 0.01; // the wooden beam's knock
    const f = v ? rnd(98, 112) : rnd(150, 172);
    const modes = v
      ? [[1, 9, 1], [1.004, 9, 0.6], [2.06, 4, 0.3], [2.94, 3, 0.25], [4.1, 1.8, 0.15], [5.4, 1.2, 0.1]]
      : [[0.5, 13, 0.7], [0.5025, 13, 0.5], [1, 8, 0.8], [1.0035, 8, 0.5], [1.19, 6, 0.45], [1.51, 4.5, 0.3], [2, 3.8, 0.4], [2.012, 3.8, 0.3], [2.63, 2.4, 0.2], [3.24, 1.7, 0.15], [4.22, 1.1, 0.12], [5.37, 0.7, 0.1], [6.81, 0.45, 0.08], [8.3, 0.3, 0.06]];
    const out = normalize(resonate(exc, modes.map(([r, d, g]) => [f * r, d, g])), 1);
    if (v) { // upper partials swelling in after the strike: a resonator fed by a slow bump
      const bump = new Float32Array(n), m2 = Math.floor(0.5 * SR);
      for (let i = 0; i < m2; i++) bump[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / m2) * 0.004;
      const up = resonate(bump, [[3.6, 2.5, 0.12], [4.85, 2.2, 0.08], [6.3, 1.8, 0.05]].map(([r, d, g]) => [f * r * rnd(0.99, 1.01), d, g]));
      normalize(up, 0.45);
      for (let i = 0; i < n; i++) out[i] += up[i];
    }
    const lp = new Biquad('lp', 2400, 0.6);
    for (let i = 0; i < n; i++) out[i] = lp.p(out[i]);
    return normalize(fadeEdges(echo(out, 0.37, 0.25, 0.25, 900, 0), 0.002, 2), 0.85);
  });
}

// ---------------------------------------------------------------- monsoon
// a tropical downpour: the roar of it on the concrete, big drops splatting on
// the balcony ledge, pinging off the steel railing and tapping the window,
// drips off the rail into a puddle, a gutter overflowing; gusts come and go
function rain() {
  const L = 16, N = L * SR, s = seed();
  const rail = new Float32Array(N), pane = new Float32Array(N), splat = new Float32Array(N), drips = new Float32Array(N);
  for (let k = 0; k < L * 22; k++) rail[(Math.random() * N) | 0] += Math.random() ** 2 * (Math.random() < 0.5 ? -1 : 1);
  for (let k = 0; k < L * 60; k++) pane[(Math.random() * N) | 0] += Math.random() ** 2 * 0.6;
  for (let k = 0; k < L * 140; k++) {
    const at = (Math.random() * N) | 0, d = rnd(40, 160), kd = Math.exp(-1 / d);
    let a = rnd(0.2, 1) ** 2;
    for (let j = 0; j < d * 3; j++) { splat[(at + j) % N] += white() * a; a *= kd; }
  }
  for (let k = 0; k < L * 2.5; k++) { const f = rnd(700, 1300); mixWrap(drips, sweep(0.05, f, f * 1.8, (t) => Math.exp(-t * 60)), rnd(0, L), rnd(0.2, 0.6)); }
  const railR = resonate(rail, [[rnd(1250, 1400), 0.09, 0.4], [rnd(2900, 3150), 0.07, 0.35], [rnd(4700, 5000), 0.05, 0.25], [rnd(2100, 2300), 0.05, 0.3], [rnd(3600, 3900), 0.04, 0.25], [rnd(6600, 7200), 0.03, 0.15]], 0.5);
  const paneR = resonate(pane, [[380, 0.015, 0.8], [1150, 0.012, 0.25], [2650, 0.04, 0.12]], 0.2);
  const roar = new Biquad('bp', 2200, 0.45), body = new Biquad('lp', 350, 0.6), hiss = new Biquad('hp', 5500, 0.7), spl = new Biquad('bp', 3200, 0.9), gut = new Biquad('bp', 600, 4);
  let g = 1, gb = 1;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 63) === 0) { g = 0.82 + 0.13 * lfo(t, L, 1, 0.4) + 0.05 * lfo(t, L, 4, 2.1); gb = (0.5 + 0.5 * lfo(t, L, 23) * lfo(t, L, 7, 1)) * 0.15; }
    const a = hn(i, s), b = hn(i, s + 1);
    return (roar.p(a) * 0.55 + body.p(b) * 0.9 + hiss.p(a) * 0.12 + spl.p(splat[i]) * 0.5) * g + railR[i] * 0.2 + paneR[i] * 0.35 + drips[i] * 0.2 + gut.p(b) * gb;
  }, 0.8), 0.7);
}
// [0] close: a ripping crack, then the boom rolling away; [1] across town; [2] far, only rumble
function thunder() {
  return V(3, (dist) => {
    const dur = [9, 8.5, 7.5][dist], n = Math.floor(dur * SR), env = new Float32Array(n);
    const roll = (at, a, att, dec) => { // a linear swell, then an exponential fall
      const i0 = Math.floor(at * SR), ia = Math.max(1, Math.floor(att * SR)), i1 = Math.min(n, i0 + ia + Math.floor(dec * 6 * SR)), kd = Math.exp(-1 / (dec * SR));
      let e = a;
      for (let i = Math.max(0, i0); i < i1; i++) { const j = i - i0; if (j < ia) env[i] += a * j / ia; else { env[i] += e; e *= kd; } }
    };
    roll(0.02 + dist * 0.25, 1, 0.01 + dist * 0.3, 1.1 + dist * 0.5);
    for (let j = 7 + Math.floor(Math.random() * 6); j > 0; j--) { // echoes off the whole length of the bolt
      const at = 0.2 + dist * 0.3 + Math.random() ** 1.5 * dur * 0.55;
      roll(at, rnd(0.25, 0.85) * Math.exp(-at / (dur * 0.4)), rnd(0.08, 0.35) + dist * 0.15, rnd(0.35, 1.5));
    }
    const cut = [650, 320, 170][dist], l1 = new Biquad('lp', cut, 0.7), l2 = new Biquad('lp', cut * 1.3, 0.6), sub = new Biquad('lp', 45, 0.8), pk = new Pink();
    const out = render(dur, (i) => (l2.p(l1.p(pk.n())) * 3 + sub.p(white()) * 2) * env[i]);
    if (dist === 0) {
      mixInto(out, crackle(0.4, 3000, { f: 2400, q: 0.5, decay: 0.0015, env: (t) => Math.exp(-t / 0.09) }), 0, 1.5);
      mixInto(out, noiseBurst(0.6, { type: 'hp', f: 1200, q: 0.7, a: 0.001, d: 0.07 }), 0.005, 1.2);
    } else if (dist === 1) mixInto(out, crackle(0.6, 900, { f: 1100, q: 0.6, decay: 0.004, env: (t) => Math.exp(-t / 0.18) }), 0.12, 0.5);
    mixInto(out, thump(1.6, 60, 30, 0.5), 0.02 + dist * 0.25, 0.6 - dist * 0.15);
    return normalize(fadeEdges(out, 0.003, 1.5), [0.9, 0.85, 0.75][dist]);
  });
}
// dusk in the rain trees: two cicada species buzzing in swells, crickets in the planters
function cicadas() {
  const L = 12, N = L * SR, s = seed(), cr = new Float32Array(N);
  for (let c = 0; c < 3; c++) {
    const f = rnd(4100, 4900), per = L / Math.round(L / rnd(0.4, 0.65)), np = 3 + (c % 2), g = [0.5, 0.32, 0.2][c], off = rnd(0, per);
    const chirp = render(np * 0.034, (i, t) => { const u = t % 0.034; return u < 0.02 ? Math.sin(TAU * f * t) * Math.sin(Math.PI * u / 0.02) : 0; });
    for (let k = 0; k < Math.round(L / per); k++) mixWrap(cr, chirp, off + k * per + rnd(-0.008, 0.008), g * rnd(0.85, 1));
  }
  const fA = rnd(5200, 6000), a1 = new Biquad('bp', fA, 5), a2 = new Biquad('bp', fA, 5), b1 = new Biquad('bp', rnd(3600, 4100), 6), bed = new Biquad('hp', 6000, 0.7);
  const ra = whole(rnd(120, 160), L), rb = whole(rnd(80, 100), L), pa = rnd(0, 6), pb = rnd(0, 6);
  const sn = sinTab();
  let sa = 1, sb = 1;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 63) === 0) { sa = 3 * (0.25 + 0.75 * (0.5 + 0.5 * lfo(t, L, 1, pa)) ** 2); sb = 1.5 * (0.3 + 0.7 * (0.5 + 0.5 * lfo(t, L, 2, pb)) ** 3); }
    let ma = 0.5 + 0.5 * wt(sn, ra * t), mb = 0.5 + 0.5 * wt(sn, rb * t); // tymbal pulses
    ma *= ma; ma *= ma; mb *= mb;
    return a2.p(a1.p(hn(i, s))) * ma * sa + b1.p(hn(i, s + 1)) * mb * sb + bed.p(hn(i, s + 2)) * 0.02 + cr[i] * 0.3;
  }, 0.3), 0.6);
}
// one female circling the ear: a buzzy wingbeat whine that rises and swells as
// she closes in and sags as she peels away. Whole wingbeats per loop
function mosquito() {
  const L = 6, N = L * SR, f0 = rnd(520, 600), p = V(4, () => rnd(0, TAU));
  const near = (t) => 0.5 + 0.28 * lfo(t, L, 1, p[0]) + 0.15 * lfo(t, L, 3, p[1]) + 0.07 * lfo(t, L, 7, p[2]);
  const closing = (t) => 0.28 * Math.cos(TAU * t / L + p[0]) + 0.45 * Math.cos(TAU * 3 * t / L + p[1]) + 0.49 * Math.cos(TAU * 7 * t / L + p[2]);
  const inc = new Float64Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) { const t = i / SR; inc[i] = f0 * (1 + 0.035 * closing(t) + 0.012 * lfo(t, L, 23, p[3])) / SR; sum += inc[i]; }
  const k = Math.round(sum) / sum, wing = table([1, 0.8, 0.55, 0.45, 0.3, 0.25, 0.15, 0.12, 0.08, 0.06]), hp = new Biquad('hp', 350, 0.7);
  let ph = 0;
  return normalize(loopRender(N, (i, t) => { ph += inc[i] * k; const a = near(t); return hp.p(wt(wing, ph)) * (0.15 + 0.85 * a * a); }, 0.1), 0.6);
}

// ---------------------------------------------------------------- the condo
// a 1997 numeric pager on the desk: [0] "bi-bi-bip bi-bi-bip", [1] two-tone
function pager() {
  return V(2, (v) => {
    const out = silence(1.3), bp = new Biquad('bp', 3300, 2);
    const pat = v ? [[2730, 0, 0.055], [3410, 0.07, 0.055], [2730, 0.14, 0.055], [3410, 0.21, 0.09]] : [[3410, 0, 0.06], [3410, 0.1, 0.06], [3410, 0.2, 0.11]];
    for (const rep of [0, 0.55]) {
      for (const [f, at, d] of pat) mixInto(out, render(d, (i, t) => (Math.sin(TAU * f * t) + Math.sin(TAU * 3 * f * t) / 3 + Math.sin(TAU * 5 * f * t) / 5) * Math.min(1, t / 0.002, (d - t) / 0.002)), 0.02 + rep + at, 0.7);
    }
    for (let i = 0; i < out.length; i++) out[i] = out[i] * 0.4 + bp.p(out[i]) * 0.9; // tinny piezo in a plastic case
    return normalize(out, 0.7);
  });
}
// a 90s Thai home phone's electronic ringer warbling between two tones. One
// ring burst: the line rings 1 s on, 4 s off, so play it every 5 s
function thaiPhoneRing() {
  const on = 1.0, out = silence(1.2), sq = table([1, 0, 1 / 3, 0, 1 / 5, 0, 1 / 7, 0, 1 / 9, 0, 1 / 11, 0, 1 / 13]);
  const pz = new Biquad('peak', 2600, 2, 8), body = new Biquad('peak', 750, 1.5, 4), hp = new Biquad('hp', 400, 0.7);
  let ph = 0;
  mixInto(out, render(on, (i, t) => {
    ph += (Math.floor(t * 32) % 2 ? 1380 : 1040) / SR;
    return sat(body.p(pz.p(hp.p(wt(sq, ph)))) * 0.5, 1.5) * Math.min(1, t / 0.008, (on - t) / 0.012);
  }), 0.01);
  return normalize(out, 0.8);
}
// the rice cooker's thermostat letting go: the lever snaps up into "warm"
function riceCooker() {
  const out = silence(0.8);
  mixInto(out, click(rnd(2400, 2800)), 0, 0.4); // the magnet lets go
  mixInto(out, knock(rnd(2.2, 2.6), 1), 0.011, 0.9); // the lever slaps its stop
  mixInto(out, modal(0.3, [[rnd(780, 860), 0.05, 0.4], [rnd(1900, 2100), 0.035, 0.3], [rnd(3300, 3600), 0.02, 0.18]]), 0.011, 0.6); // pressed-steel shell
  mixInto(out, thump(0.1, 180, 110, 0.02), 0.011, 0.4);
  const bp = new Biquad('bp', 3500, 0.8);
  mixInto(out, render(0.6, (i, t) => bp.p(white()) * ad(t, 0.08, 0.2)), 0.12, 0.06); // a sigh of steam from the vent
  return normalize(fadeEdges(out, 0.001, 0.08), 0.8);
}
// the LPG single-ring burner: the piezo knob tick-tick-ticks over hissing gas,
// then the ring catches with a soft "whoomp" and settles to a roar
function gasIgnite() {
  const dur = 2.6, out = silence(dur);
  let at = 0.05;
  for (let k = 3 + (Math.random() < 0.4 ? 1 : 0); k > 0; k--) {
    mixInto(out, click(rnd(2400, 3000)), at, 0.45); // the knob's cam
    mixInto(out, noiseBurst(0.01, { type: 'hp', f: 5000, a: 0.0002, d: 0.0008 }), at + 0.003, 1.2); // the spark
    mixInto(out, modal(0.05, [[rnd(6000, 7500), 0.006, 0.3]]), at + 0.003, 0.4);
    at += rnd(0.16, 0.22);
  }
  const hp = new Biquad('hp', 2800, 0.7);
  mixInto(out, render(at - 0.05, (i, t) => hp.p(white()) * Math.min(1, t / 0.1) * 0.06), 0.05); // gas from the first tick
  const tI = at - 0.15, lw = new Biquad('lp', 250, 0.8);
  mixInto(out, thump(0.5, 95, 42, 0.12), tI, 0.8);
  mixInto(out, render(0.6, (i, t) => { if ((i & 31) === 0) lw.set('lp', 250 + 1100 * Math.min(1, t / 0.08), 0.8); return lw.p(white()) * ad(t, 0.025, 0.18); }), tI, 1);
  const fr = new Biquad('lp', 700, 0.6), fb = new Biquad('bp', 1600, 0.7), rd = dur - tI - 0.05;
  mixInto(out, render(rd, (i, t) => (fr.p(white()) * 0.5 + fb.p(white()) * 0.12) * Math.min(1, t / 0.15, (rd - t) / 0.7) * (0.85 + 0.15 * Math.sin(TAU * 7 * t + Math.sin(TAU * 2.3 * t) * 3))), tI + 0.05, 0.4);
  return normalize(fadeEdges(out, 0.002, 0.1), 0.8);
}
// a cheap stand fan on speed 2: motor hum at twice the 50 Hz mains, three
// blades chopping the air, a loose clip in the plastic cage buzzing now and then
function fanStand() {
  const L = 6, N = L * SR, s = seed(), blade = whole(rnd(52, 58), L);
  const air = new Biquad('bp', 900, 0.5), low = new Biquad('lp', 400, 0.7), rattle = new Biquad('bp', rnd(1600, 1900), 6);
  return normalize(loopRender(N, (i, t) => {
    const hum = Math.sin(TAU * 100 * t) * 0.25 + Math.sin(TAU * 50 * t) * 0.12 + Math.sin(TAU * 200 * t) * 0.06 + Math.sin(TAU * 300 * t) * 0.03;
    const chop = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * blade * t)) ** 2;
    const wind = (air.p(hn(i, s)) * 0.7 + low.p(hn(i, s + 1)) * 0.6) * chop * (0.9 + 0.1 * lfo(t, L, 1, 0.2));
    const gate = Math.max(0, lfo(t, L, 2, 0.5) * 0.6 + lfo(t, L, 5, 1.7) * 0.5 - 0.35);
    const buzz = rattle.p(Math.max(0, Math.sin(TAU * 100 * t)) ** 12 + hn(i, s + 2) * 0.05) * gate;
    return hum * 0.5 + wind + buzz * 1.5;
  }, 0.3), 0.6);
}
// the fan's piano-key speed buttons: the old key springs up, the new one clunks down
function fanClick() {
  const out = silence(0.35);
  mixInto(out, knock(2.8, 0.5), 0, 0.5);
  mixInto(out, click(2200), 0, 0.4);
  mixInto(out, knock(rnd(1.5, 1.7), 1), 0.045);
  mixInto(out, thump(0.12, 160, 90, 0.025), 0.045, 0.5);
  mixInto(out, modal(0.2, [[rnd(2400, 2700), 0.06, 0.12]]), 0.05, 0.4); // the return spring
  return normalize(fadeEdges(out, 0.001, 0.05), 0.8);
}

// ---------------------------------------------------------------- the seed
// The thing growing in the belly, heard from inside: close, wet, low. It is
// not only digestion. Its bubbles land on a little falling tune, its clicks
// come in counted groups, its chitter has the rise and fall of talk.
function bubble(f, dur = 0.07) { let ph = 0; return render(dur, (i, t) => { ph += TAU * f * (1 + 0.7 * t / dur) / SR; return Math.sin(ph) * Math.exp(-t / (dur * 0.3)) * Math.min(1, t / 0.002); }); }
const PENTA = [1, 1.189, 1.335, 1.498, 1.782, 2];
function seedGurgle() {
  return V(3, (v) => {
    const dur = rnd(1.5, 2.2), out = silence(dur), bq = new Biquad('lp', 200, 5);
    mixInto(out, render(dur, (i, t) => { // the gut squeezing round it
      const p = t / dur;
      if ((i & 31) === 0) bq.set('lp', 110 + 420 * Math.sin(Math.PI * p) ** 2 * (0.7 + 0.3 * Math.sin(TAU * 2.3 * t + v)), 6);
      return bq.p(white()) * Math.sin(Math.PI * p) ** 0.7;
    }), 0, 0.8);
    const base = rnd(260, 330);
    let at = rnd(0.15, 0.3);
    for (const k of [[5, 4, 3, 1, 0], [3, 4, 3, 1, 2, 0], [0, 2, 1, 4, 3, 0]][v]) { mixInto(out, bubble(base * PENTA[k], rnd(0.05, 0.09)), at, rnd(0.25, 0.4)); at += rnd(0.1, 0.2); }
    let ph = 0; // a low moan under it, like something trying out a voice
    mixInto(out, render(dur, (i, t) => { ph += TAU * (62 - 14 * t / dur + 4 * Math.sin(TAU * 5 * t)) / SR; return Math.tanh(Math.sin(ph) * 2) * Math.sin(Math.PI * t / dur) ** 2; }), 0, 0.3);
    mixInto(out, crackle(dur, 35, { f: 520, q: 6, decay: 0.01, env: (t) => Math.sin(Math.PI * t / dur) }), 0, 0.45);
    const lp = new Biquad('lp', 1500, 0.7); // through the belly wall
    for (let i = 0; i < out.length; i++) out[i] = lp.p(out[i]);
    return normalize(fadeEdges(out, 0.02, 0.15), 0.85);
  });
}
// a carapace clicking in counted groups: [3 1 2], [2 2 3 1], [5 1 1]
function seedClick() {
  return V(3, (v) => {
    const dur = 1.4, rate = rnd(24, 34), exc = new Float32Array(Math.floor(dur * SR)), wet = silence(dur);
    let at = 0.02;
    for (const g of [[3, 1, 2], [2, 2, 3, 1], [5, 1, 1]][v]) {
      for (let k = 0; k < g; k++) {
        const j = Math.floor(at * SR);
        exc[j] += rnd(0.7, 1) * (k === g - 1 ? 1.25 : 1); exc[j + 3] -= 0.6;
        if (Math.random() < 0.35) mixInto(wet, bubble(rnd(500, 800), 0.03), at + 0.004, 0.15);
        at += rnd(0.9, 1.1) / rate;
      }
      at += rnd(0.13, 0.22);
    }
    const shell = resonate(exc, [[rnd(2100, 2600), 0.005, 0.8], [rnd(3800, 4400), 0.004, 0.6], [rnd(1000, 1200), 0.008, 0.5], [rnd(6000, 6800), 0.003, 0.35]]);
    const lp = new OnePole(5500), out = silence(Math.min(dur, at + 0.1));
    for (let i = 0; i < out.length; i++) out[i] = lp.p(shell[i] + exc[i] * 0.3) + wet[i];
    return normalize(fadeEdges(out, 0.002, 0.03), 0.8);
  });
}
// a few syllables of something's speech: creaky click-trains through moving
// formants and a squeaking whistle, falling, the last one rising like a question
function seedChitter() {
  return V(3, (v) => {
    const n = 4 + v + Math.floor(Math.random() * 2), syl = [];
    let t0 = 0.02;
    for (let k = 0; k < n; k++) { const len = rnd(0.06, 0.13) * (k === n - 1 ? 1.8 : 1); syl.push([t0, len, rnd(0.8, 1.25)]); t0 += len + rnd(0.012, 0.05); }
    const dur = t0 + 0.08, F1 = new Biquad('bp', 1800, 7), F2 = new Biquad('bp', 3600, 9), r0 = rnd(80, 140), w0 = rnd(2300, 3200);
    let si = 0, ph = 0, wp = 0;
    const out = render(dur, (i, t) => {
      while (si < n - 1 && t >= syl[si + 1][0]) si++;
      const sy = syl[si], pk = sy[2], p = (t - sy[0]) / sy[1], on = p >= 0 && p <= 1;
      const c = (si === n - 1 ? 0.85 + 0.5 * p : 1.15 - 0.3 * p) * pk;
      if ((i & 31) === 0) { F1.set('bp', (1500 + 900 * Math.sin(Math.PI * clamp(p, 0, 1))) * pk, 7); F2.set('bp', (3000 + 1200 * clamp(p, 0, 1)) * pk, 9); }
      ph += r0 * c / SR;
      let imp = 0;
      if (ph >= 1) { ph -= 1; imp = on ? rnd(0.6, 1) : 0; }
      wp += TAU * w0 * c / SR;
      const env = on ? Math.sin(Math.PI * p) ** 0.5 : 0;
      return (F1.p(imp) + F2.p(imp) * 0.7) * 14 + Math.sin(wp) * 0.1 * env * env;
    });
    mixInto(out, bubble(rnd(400, 600), 0.05), rnd(0, dur - 0.1), 0.2);
    mixInto(out, wetSquelch(dur, 0.15), 0, 0.5);
    const lp = new OnePole(6000);
    return normalize(fadeEdges(out.map((x) => lp.p(x)), 0.002, 0.03), 0.8);
  });
}
// it sings to itself: a sub-bass throb six times a loop, a wet finger on glass
// beating slowly against itself, a grain of friction, now and then a bubble
function seedHum() {
  const L = 8, N = L * SR, s = seed(), sub = whole(rnd(38, 44), L), g1 = whole(rnd(640, 760), L), g2 = g1 + 6 / L;
  const g3 = whole(g1 * 2.74, L), g4 = whole(g1 * 5.2, L), fr = new Biquad('bp', g1, 25), lp = new Biquad('lp', 120, 0.7), wet = new Float32Array(N);
  for (let k = 0; k < 3; k++) mixWrap(wet, bubble(rnd(300, 500), rnd(0.05, 0.09)), rnd(0, L), rnd(0.08, 0.15));
  const sn = sinTab();
  let throb = 0, pm = 0, sw = 0, gr = 0;
  return normalize(loopRender(N, (i, t) => {
    if ((i & 31) === 0) {
      const x = (t * 6 / L) % 1; // swell in over a tenth of the beat, then die away
      throb = 0.3 + 0.7 * (x < 0.1 ? Math.sin(Math.PI / 2 * x / 0.1) ** 2 : Math.exp(-(x - 0.1) / 0.18));
      pm = 0.05 * lfo(t, L, 3); sw = 0.12 * (0.65 + 0.35 * lfo(t, L, 1, 0.8)); gr = 2 * (0.5 + 0.5 * lfo(t, L, 16, 0.2));
    }
    const lo = fsat(wt(sn, sub * t) * 1.6, 1.4) * throb;
    const glass = (wt(sn, g1 * t + pm) + wt(sn, g2 * t) * 0.8 + wt(sn, g3 * t) * 0.12 + wt(sn, g4 * t) * 0.04) * sw;
    return lo * 0.6 + glass + fr.p(hn(i, s)) * gr + lp.p(hn(i, s + 1)) * 0.3 + wet[i];
  }, 0.5), 0.7);
}
// a kick from inside, felt more than heard: [0] one, [1] two
function seedKick() {
  return V(2, (v) => {
    const out = silence(1.2), sq = silence(1.2), hits = v ? [[0.02, 1], [0.34, 0.7]] : [[0.02, 1]];
    for (const [at, g] of hits) {
      mixInto(out, thump(0.4, 80, 34, 0.1), at, g);
      mixInto(out, noiseBurst(0.2, { type: 'lp', f: 300, q: 1, a: 0.01, d: 0.05 }), at, g * 0.6);
      mixInto(sq, wetSquelch(0.28, 1), at + 0.04, g * 0.5);
    }
    mixInto(sq, bubble(rnd(180, 240), 0.1), hits[hits.length - 1][0] + 0.3, 0.3);
    const lp = new Biquad('lp', 260, 0.8), lp2 = new Biquad('lp', 1100, 0.7);
    for (let i = 0; i < out.length; i++) out[i] = lp.p(out[i]) * 1.4 + lp2.p(sq[i]);
    return normalize(fadeEdges(out, 0.002, 0.1), 0.9);
  });
}

// ---------------------------------------------------------------- collapse
// an unfinished tower across the city goes down (half the skyline stopped
// building in 1997): cracks, floors pancaking ever faster into one roar,
// rebar squealing, then rubble raining for a long time
function squeal(dur, f) {
  const b1 = new Biquad('bp', f, 30), b2 = new Biquad('bp', f * 2.1, 30);
  let ph = 0;
  return render(dur, (i, t) => {
    const p = t / dur, ff = f * (1 - 0.18 * p + 0.03 * Math.sin(TAU * 7 * t));
    if ((i & 31) === 0) { b1.set('bp', ff, 30); b2.set('bp', ff * 2.1, 30); }
    ph += TAU * ff / SR;
    const n = white(), stick = 0.5 + 0.5 * Math.sin(TAU * 31 * t + 3 * Math.sin(TAU * 4 * t)); // stick-slip judder
    return (b1.p(n) * 4 + b2.p(n) * 2 + Math.sin(ph) * 0.25) * stick * Math.sin(Math.PI * p);
  });
}
function towerCollapse() {
  const dur = 10, out = silence(dur);
  for (let k = 0; k < 6; k++) { // columns letting go, flat and far
    const c = noiseBurst(0.25, { type: 'lp', f: 2600, d: 0.015 });
    mixInto(c, thump(0.3, 120, 55, 0.05), 0, 0.8);
    mixInto(out, c, rnd(0, 1.1), rnd(0.35, 0.8));
  }
  const floor = V(3, () => { const o = thump(0.6, rnd(70, 80), 34, 0.16); mixInto(o, noiseBurst(0.4, { type: 'lp', f: 900, d: 0.07 }), 0, 0.6); return o; });
  let at = 1.2, gap = 0.55, g = 0.5, k = 0; // floors pancaking, each thud sooner than the last
  while (at < 5.2) { mixInto(out, floor[k++ % 3], at, g); at += gap; gap = Math.max(0.06, gap * 0.8); g = Math.min(1, g * 1.08); }
  const lp = new Biquad('lp', 180, 0.8), lp2 = new Biquad('lp', 600, 0.7), sub = new Biquad('lp', 55, 0.9), pk = new Pink();
  let e = 0;
  mixInto(out, render(dur - 1, (i, t) => {
    if ((i & 63) === 0) e = t < 3.3 ? (t / 3.3) ** 2 : Math.exp(-(t - 3.3) / 2.2);
    return (lp.p(pk.n()) * 2.2 + lp2.p(white()) * 0.25 + sub.p(white()) * 2.5) * e;
  }), 1.0);
  for (let k = 0; k < 3; k++) mixInto(out, normalize(squeal(rnd(0.7, 1.4), rnd(1300, 2300)), 1), rnd(2.0, 5.5), rnd(0.12, 0.22));
  mixInto(out, crackle(6, 1500, { f: 1300, q: 0.6, decay: 0.004, env: (t) => (t < 1.2 ? t / 1.2 : Math.exp(-(t - 1.2) / 1.8)) }), 3.4, 0.35); // rubble rain
  for (let k = 0; k < 10; k++) mixInto(out, modal(0.3, [[rnd(2600, 4200), 0.05, 0.3], [rnd(4500, 6000), 0.04, 0.2]]), rnd(3.5, 7), rnd(0.02, 0.06)); // a little glass
  const d = new Biquad('lp', 2200, 0.6);
  for (let i = 0; i < out.length; i++) out[i] = d.p(out[i]);
  return normalize(fadeEdges(echo(out, 0.31, 0.35, 0.35, 900, 0), 0.01, 1.2), 0.9);
}
// a tower crane on another dead site: the jib groans, a cable snaps and zings, the crash
function craneFall() {
  const dur = 4.5, out = silence(dur), lp = new Biquad('lp', 120, 1.5);
  mixInto(out, creakRaw(1.3, 26, 0.5, [160, 380, 820]), 0, 0.9);
  mixInto(out, render(1.4, (i, t) => lp.p(white()) * Math.sin(Math.PI * t / 1.4) * 2), 0, 0.5);
  mixInto(out, noiseBurst(0.08, { type: 'hp', f: 1800, a: 0.0003, d: 0.008 }), 1.35, 1);
  let ph = 0;
  mixInto(out, render(0.7, (i, t) => { ph += TAU * (600 + 2600 * Math.exp(-t / 0.12)) / SR; return Math.sin(ph + 0.8 * Math.sin(TAU * 37 * t)) * Math.exp(-t / 0.18); }), 1.36, 0.35);
  mixInto(out, modal(2.0, [[rnd(90, 105), 0.9, 0.6], [rnd(225, 245), 0.7, 0.5], [rnd(395, 420), 0.5, 0.45], [rnd(680, 720), 0.4, 0.35], [rnd(1000, 1060), 0.3, 0.3], [rnd(1500, 1580), 0.2, 0.2], [rnd(2300, 2450), 0.12, 0.15]], 0.004), 2.45, 0.8);
  mixInto(out, thump(0.8, 70, 35, 0.2), 2.45, 1);
  mixInto(out, noiseBurst(0.8, { type: 'lp', f: 1400, d: 0.15 }), 2.45, 0.6);
  mixInto(out, crackle(1.6, 500, { f: 1800, q: 0.7, decay: 0.006, env: (t) => Math.exp(-t / 0.5) }), 2.5, 0.4);
  mixInto(out, modal(1.2, [[rnd(140, 160), 0.5, 0.5], [rnd(520, 560), 0.3, 0.3], [rnd(1210, 1260), 0.2, 0.2]]), 2.85, 0.4); // a second section lands
  const d = new Biquad('lp', 2600, 0.6);
  for (let i = 0; i < out.length; i++) out[i] = d.p(out[i]);
  return normalize(fadeEdges(echo(out, 0.29, 0.3, 0.3, 1000, 0), 0.005, 0.6), 0.9);
}

// ---------------------------------------------------------------- protest
// a rally a few streets away: the big drum all the way round, a megaphone
// calling for two bars, the crowd chanting back for one with claps, a murmur
// of everyone else; echoing between the towers
function claps(n = 14) { const o = silence(0.25); for (let k = 0; k < n; k++) mixInto(o, noiseBurst(0.04, { f: rnd(1000, 2400), q: 1.2, a: 0.0005, d: 0.007 }), rnd(0, 0.06), rnd(0.4, 1)); return o; }
function megaphone(x) { const hp = new Biquad('hp', 550, 0.8), pk = new Biquad('peak', 1700, 1.5, 9), lp = new Biquad('lp', 3600, 0.8); return x.map((v) => lp.p(fsat(pk.p(hp.p(v)) * 4, 2.5))); }
function crowdProtest() {
  const L = 15, N = L * SR, s = seed(), beat = L / 24, bar = beat * 4, ev = new Float32Array(N);
  const drum = () => { const o = thump(0.6, 95, 52, 0.18); mixInto(o, noiseBurst(0.1, { type: 'lp', f: 1200, d: 0.015 }), 0, 0.5); return o; };
  const D = [drum(), drum()];
  for (let b = 0; b < 6; b++) for (const e of [0, 2, 4, 5, 6]) mixWrap(ev, D[e % 2], b * bar + e * beat / 2 + rnd(-0.01, 0.01), e ? 0.75 : 1);
  const chant = [[0, 0.32, 2, 6], [1, 0.3, 0, 0], [2, 0.2, 1, 6], [2.5, 0.45, 0, 0]].map(([b, len, tn, vw]) => ({ t0: b * beat + 0.05, len, tone: TONE[tn], F1: VOWELS[vw][0], F2: VOWELS[vw][1], cons: 0.03, dead: false, decl: 1, amp: 1 }));
  for (const b0 of [0, 3]) {
    mixWrap(ev, megaphone(babble(bar * 2 - 0.3, { f0: rnd(150, 175), rate: 5.8, range: 1.2, shout: 1, breath: 0.15, phrase: [4, 9], pause: [0.12, 0.3] })), b0 * bar + 0.1, 0.45);
    for (let k = 0; k < 5; k++) mixWrap(ev, babble(bar, { f0: rnd(105, 260), shout: 0.8, breath: 0.3, sched: chant.map((S) => ({ ...S, t0: S.t0 + rnd(-0.03, 0.04), len: S.len * rnd(0.9, 1.1) })) }), (b0 + 2) * bar, 0.6);
    for (let k = 0; k < 4; k++) mixWrap(ev, claps(), (b0 + 2) * bar + k * beat, 0.6);
  }
  for (let k = 0; k < 3; k++) mixWrap(ev, babble(3, { f0: rnd(110, 250), rate: rnd(4, 6) }), k * L / 3 + rnd(0, 2), 0.14);
  // everyone else: noise through vowel bands, each band's loudness wandering like many mouths
  const RATE = 9, M = RATE * L, v1 = new Biquad('bp', 550, 2), v2 = new Biquad('bp', 1400, 2.5), v3 = new Biquad('bp', 2500, 3), dist = new Biquad('lp', 2300, 0.6), ec = new Echo(0.23, 0.32, 1300);
  const mod = (i, k) => { const x = i * RATE / SR, j = Math.floor(x), f = x - j, a = hn(j % M, s + k), b = hn((j + 1) % M, s + k); return 0.5 + 0.5 * (a + (b - a) * f); };
  let m1 = 0, m2 = 0, m3 = 0;
  return normalize(loopRender(N, (i) => {
    if ((i & 31) === 0) { m1 = mod(i, 1) * 0.5; m2 = mod(i, 2) * 0.35; m3 = mod(i, 3) * 0.15; }
    const n = hn(i, s + 9), x = dist.p(ev[i] + v1.p(n) * m1 + v2.p(n) * m2 + v3.p(n) * m3);
    return x + ec.p(x) * 0.4;
  }, 1.5), 0.75);
}

// ---------------------------------------------------------------- the grille
// the collapsible steel lattice across 1407's door: scissor joints chattering,
// wheels grinding in the floor track, a clank on the frame, the padlock.
// [0] unlock and drag it open, [1] drag it shut, clank, lock it
function grilleSlide(dur) {
  const n = Math.floor(dur * SR), exc = new Float32Array(n), sp = (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.6;
  for (let i = 0; i < n; i++) if (Math.random() < sp(i / SR) * 320 / SR) exc[i] = rnd(-1, 1);
  const out = resonate(exc, [[rnd(820, 900), 0.05, 0.35], [rnd(1650, 1760), 0.04, 0.35], [rnd(2700, 2900), 0.03, 0.3], [rnd(4100, 4400), 0.02, 0.25], [rnd(5900, 6300), 0.015, 0.15], [rnd(380, 420), 0.06, 0.2]]);
  const sc = new Biquad('bp', 950, 1.1), rb = new Biquad('lp', 180, 0.8), sq = new Biquad('bp', rnd(1900, 2300), 18);
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = sp(t), w = white();
    out[i] += sc.p(w) * v * 0.35 + rb.p(w) * v * 0.8 + sq.p(w) * Math.max(0, v - 0.6) * 4 * (0.6 + 0.4 * Math.sin(TAU * 9 * t));
  }
  return out;
}
function padlock(shut) {
  const o = silence(0.25);
  mixInto(o, click(rnd(3000, 3600)), 0, 0.6);
  mixInto(o, modal(0.2, [[rnd(1850, 2000), 0.04, 0.35], [rnd(3100, 3300), 0.03, 0.3], [rnd(5000, 5300), 0.02, 0.2]]), shut ? 0.035 : 0.02, 0.7);
  if (shut) mixInto(o, knock(3.5, 0.4), 0.035);
  return o;
}
function clank() {
  const o = modal(0.9, [[rnd(300, 350), 0.3, 0.5], [rnd(720, 790), 0.2, 0.45], [rnd(1240, 1330), 0.14, 0.35], [rnd(2050, 2200), 0.1, 0.25], [rnd(3300, 3550), 0.07, 0.2]], 0.003);
  mixInto(o, thump(0.3, 120, 60, 0.05), 0, 0.7);
  mixInto(o, grilleSlide(0.25), 0.01, 0.4); // the lattice shivering after
  return o;
}
function doorGrille() {
  return V(2, (v) => {
    const out = silence(2.8);
    if (v === 0) {
      mixInto(out, padlock(false), 0.02, 0.8);
      mixInto(out, grilleSlide(1.5), 0.35, 0.9);
      mixInto(out, clank(), 1.8, 0.8);
    } else {
      mixInto(out, grilleSlide(1.3), 0.02, 0.9);
      mixInto(out, clank(), 1.3, 1);
      mixInto(out, latch(), 1.55, 0.6);
      mixInto(out, padlock(true), 2.05, 0.8);
    }
    return normalize(fadeEdges(out, 0.002, 0.2), 0.85);
  });
}

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
  fanHum: () => [fanHum()], radioMusic: () => [lukThung()], microwaveHum: () => [microwaveHum()], kettleWhistle: () => [kettleWhistle()], fireBell: () => [fireBell()],
  // Bangkok 2540
  radioLukThung: () => [lukThung()], tvLakorn: () => [tvLakorn()], gecko, bangkokStreet: () => [bangkokStreet()], tukTuk, motorbike, horn, soiDog, vendorHorn,
  vendorBell: () => [vendorBell()], templeBell, rain: () => [rain()], thunder, cicadas: () => [cicadas()], mosquito: () => [mosquito()],
  pager, thaiPhoneRing: () => [thaiPhoneRing()], riceCooker: () => [riceCooker()], gasIgnite: () => [gasIgnite()], fanStand: () => [fanStand()], fanClick: () => [fanClick()],
  seedGurgle, seedClick, seedChitter, seedHum: () => [seedHum()], seedKick,
  towerCollapse: () => [towerCollapse()], craneFall: () => [craneFall()], crowdProtest: () => [crowdProtest()], doorGrille,
};
// sounds that loop when started with loop()
export const LOOPS = new Set(['water', 'sizzle', 'brew', 'fridgeHum', 'dialTone', 'crtWhine', 'pcHum', 'lineStatic', 'purr', 'catEat', 'catLap', 'droneLow', 'droneVoid', 'droneLab', 'wind', 'cityDay', 'static', 'hum60', 'fluoro', 'tvBabble', 'alienNear', 'shipHum', 'tapeHiss', 'vending', 'breath', 'breathHeavy', 'fanHum', 'radioMusic', 'microwaveHum', 'kettleWhistle', 'fireBell',
  'radioLukThung', 'tvLakorn', 'bangkokStreet', 'rain', 'cicadas', 'mosquito', 'fanStand', 'seedHum', 'crowdProtest']);
