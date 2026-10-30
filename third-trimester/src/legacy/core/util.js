import * as THREE from 'three';

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a)));
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function dampAngle(a, b, k, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
}
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
export function easeOut(t) { return 1 - (1 - t) * (1 - t); }
export function easeIn(t) { return t * t; }

// deterministic RNG
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class RNG {
  constructor(seed = 1) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
}
export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

// ---- noise -------------------------------------------------------------
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
export function hash2(x, y) { return hash3(x, y, 0); }
export function hash1(x) { return hash3(x, 0, 0); }

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function vnoise2(x, y) { return vnoise3(x, y, 0.5); }
export function vnoise1(x) { return vnoise3(x, 0.5, 0.5); }
export function fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function fbm3(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
// tileable 2D value noise over period p (integer)
export function tnoise2(x, y, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const m = (a) => ((a % p) + p) % p;
  const c00 = hash2(m(xi), m(yi)), c10 = hash2(m(xi + 1), m(yi));
  const c01 = hash2(m(xi), m(yi + 1)), c11 = hash2(m(xi + 1), m(yi + 1));
  return lerp(lerp(c00, c10, u), lerp(c01, c11, u), v);
}
export function tfbm2(x, y, p, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * tnoise2(x * f, y * f, p * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
// smooth 1D noise in [-1,1] good for camera shake / trembling
export function snoise1(t, seed = 0) { return vnoise3(t, seed * 17.13, 3.7) * 2 - 1; }

// ---- three helpers -----------------------------------------------------
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4();

export function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
export function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

// simple timer/tween manager driven by the game loop (pauses with the game)
export class Tasks {
  constructor() { this.list = []; this.t = 0; }
  update(dt) {
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      if (k.dead) { this.list.splice(i, 1); continue; }
      if (k.type === 'delay') {
        if (this.t >= k.at) { this.list.splice(i, 1); k.fn(); }
      } else if (k.type === 'tween') {
        const p = clamp((this.t - k.start) / k.dur);
        k.fn(k.ease ? k.ease(p) : p);
        if (p >= 1) { this.list.splice(i, 1); k.done && k.done(); }
      } else if (k.type === 'every') {
        if (this.t >= k.at) { k.at = this.t + k.iv; if (k.fn() === false) this.list.splice(i, 1); }
      }
    }
  }
  delay(sec, fn) { const k = { type: 'delay', at: this.t + sec, fn }; this.list.push(k); return k; }
  tween(dur, fn, ease, done) { const k = { type: 'tween', start: this.t, dur: Math.max(1e-4, dur), fn, ease, done }; this.list.push(k); return k; }
  every(iv, fn) { const k = { type: 'every', at: this.t + iv, iv, fn }; this.list.push(k); return k; }
  wait(sec) { return new Promise((r) => this.delay(sec, r)); }
  clear() { this.list.length = 0; }
}
