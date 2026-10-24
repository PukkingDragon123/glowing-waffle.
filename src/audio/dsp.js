// Offline DSP helpers for procedural sound synthesis.
export const SR = 44100;

export class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0, sr = SR) { this.sr = sr; this.set(type, f, q, gainDb); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = 2 * Math.PI * Math.min(f, this.sr * 0.49) / this.sr;
    const c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    const A = Math.pow(10, gainDb / 40);
    switch (type) {
      case 'lp': b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; break;
      case 'hp': b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; break;
      case 'bp': b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; break;
      case 'peak': b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; break;
      default: throw new Error('biquad ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// simple one-pole lowpass
export class OnePole { constructor(f, sr = SR) { this.set(f, sr); this.y = 0; } set(f, sr = SR) { this.a = Math.exp(-2 * Math.PI * f / sr); return this; } p(x) { this.y = x + this.a * (this.y - x); return this.y; } }

// pink-ish noise generator (Paul Kellet economy)
export class Pink {
  constructor() { this.b0 = this.b1 = this.b2 = 0; }
  n() { const w = Math.random() * 2 - 1; this.b0 = 0.99765 * this.b0 + w * 0.099046; this.b1 = 0.963 * this.b1 + w * 0.2965164; this.b2 = 0.57 * this.b2 + w * 1.0526913; return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25; }
}

export const rnd = (a = -1, b = 1) => a + (b - a) * Math.random();
export const white = () => Math.random() * 2 - 1;

// Make a buffer of `dur` seconds, filling via fn(i, t) -> sample (mono)
export function render(dur, fn, sr = SR) {
  const n = Math.max(1, Math.floor(dur * sr));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i, i / sr);
  return out;
}
// attack-decay envelope
export const ad = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function normalize(buf, peak = 0.9) {
  let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= k; }
  return buf;
}
export function fadeEdges(buf, fin = 0.002, fout = 0.01, sr = SR) {
  const a = Math.floor(fin * sr), b = Math.floor(fout * sr);
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}
// mix src into dst at offset (seconds)
export function mixInto(dst, src, at = 0, gain = 1, sr = SR) {
  const o = Math.floor(at * sr);
  for (let i = 0; i < src.length && o + i < dst.length; i++) if (o + i >= 0) dst[o + i] += src[i] * gain;
  return dst;
}
export function concat(...bufs) {
  const n = bufs.reduce((s, b) => s + b.length, 0);
  const out = new Float32Array(n); let o = 0;
  for (const b of bufs) { out.set(b, o); o += b.length; }
  return out;
}
export function silence(dur, sr = SR) { return new Float32Array(Math.floor(dur * sr)); }
// soft clip
export const sat = (x, k = 1.5) => Math.tanh(x * k) / Math.tanh(k);
// make a buffer loop seamlessly by crossfading its tail into its head
export function makeLoop(buf, xf = 0.15, sr = SR) {
  const n = Math.floor(xf * sr);
  const out = buf.slice(0, buf.length - n);
  for (let i = 0; i < n; i++) { const k = i / n; out[i] = out[i] * k + buf[buf.length - n + i] * (1 - k); }
  return out;
}
// struck resonator bank: freqs, decays (s), gains
export function modal(dur, modes, exciteDur = 0.002, sr = SR) {
  const out = new Float32Array(Math.floor(dur * sr));
  for (const [f, d, g] of modes) {
    const w = 2 * Math.PI * f / sr;
    const ph = Math.random() * 6.28;
    for (let i = 0; i < out.length; i++) { const t = i / sr; out[i] += Math.sin(w * i + ph) * Math.exp(-t / d) * g * Math.min(1, t / 0.0005); }
  }
  // excitation click
  const ex = Math.floor(exciteDur * sr);
  for (let i = 0; i < ex && i < out.length; i++) out[i] += white() * (1 - i / ex) * 0.5;
  return out;
}
// filtered noise burst
export function noiseBurst(dur, { type = 'bp', f = 1000, q = 1, a = 0.002, d = 0.05, f2 = null, pink = false } = {}, sr = SR) {
  const bq = new Biquad(type, f, q, 0, sr);
  const pk = new Pink();
  return render(dur, (i, t) => {
    if (f2) bq.set(type, f + (f2 - f) * (t / dur), q);
    return bq.p(pink ? pk.n() * 3 : white()) * ad(t, a, d);
  }, sr);
}
