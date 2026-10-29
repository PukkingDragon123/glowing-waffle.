// Post-processing contributions from many systems (hunger, pain, alien,
// reality breaking, cutscenes) are layered here each frame on top of the
// player's settings, then written to engine.fx.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { clamp, damp } from '../core/util.js';

const KEYS = ['wave', 'doubleV', 'red', 'white', 'black', 'glitch', 'noiseBurst', 'tunnel', 'ghost', 'flesh', 'shake', 'blur'];

export class FX {
  constructor() {
    this.layers = new Map();   // source -> {key: value}
    this.pulses = [];          // {key, amt, t, dur}
    this.cur = {}; for (const k of KEYS) this.cur[k] = 0;
    this.grade = { saturation: 0.86, contrast: 1.06, exposure: 1, tint: new THREE.Vector3(1, 0.98, 0.95) };
    this.gradeTarget = { ...this.grade, tint: this.grade.tint.clone() };
    this.fade = 0;             // fade to black 0..1 (scripted)
    this.fadeTarget = 0; this.fadeSpeed = 1.5;
    this.white = 0; this.whiteTarget = 0; this.whiteSpeed = 2;
  }
  set(src, vals) { this.layers.set(src, vals); }
  clear(src) { this.layers.delete(src); }
  pulse(key, amt = 1, dur = 0.5) { this.pulses.push({ key, amt, t: 0, dur }); }
  fadeTo(v, speed = 1.5) { this.fadeTarget = v; this.fadeSpeed = speed; return new Promise((r) => { const chk = () => (Math.abs(this.fade - v) < 0.02 ? r() : setTimeout(chk, 30)); chk(); }); }
  whiteTo(v, speed = 2) { this.whiteTarget = v; this.whiteSpeed = speed; }
  setGrade(g) { Object.assign(this.gradeTarget, g); if (g.tint) this.gradeTarget.tint = g.tint.clone(); }
  update(dt) {
    const s = G.settings.v;
    const tgt = {}; for (const k of KEYS) tgt[k] = 0;
    for (const vals of this.layers.values()) for (const [k, v] of Object.entries(vals)) if (k in tgt) tgt[k] = Math.max(tgt[k], v);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]; p.t += dt;
      const k = 1 - p.t / p.dur;
      if (k <= 0) { this.pulses.splice(i, 1); continue; }
      tgt[p.key] = Math.max(tgt[p.key], p.amt * k);
    }
    for (const k of KEYS) this.cur[k] = damp(this.cur[k], tgt[k], 10, dt);
    this.fade = damp(this.fade, this.fadeTarget, this.fadeSpeed * 3, dt);
    if (Math.abs(this.fade - this.fadeTarget) < 0.003) this.fade = this.fadeTarget;
    this.white = damp(this.white, this.whiteTarget, this.whiteSpeed * 3, dt);
    for (const k of ['saturation', 'contrast', 'exposure']) this.grade[k] = damp(this.grade[k], this.gradeTarget[k], 1.5, dt);
    this.grade.tint.lerp(this.gradeTarget.tint, 1 - Math.exp(-1.5 * dt));
    const fx = G.engine.fx;
    const vhs = s.vhs / 10, grain = s.grain / 10;
    fx.vhs = vhs * (1 + this.cur.glitch);
    fx.chroma = 0.08 + vhs * 0.6;
    fx.tracking = 0.02 + vhs * 0.25 + this.cur.glitch * 0.8;
    fx.scan = 0.04 + vhs * 0.5;
    fx.grain = grain * 0.8 + this.cur.noiseBurst * 0.5;
    fx.wave = this.cur.wave; fx.doubleV = this.cur.doubleV; fx.red = this.cur.red;
    fx.white = Math.max(this.cur.white, this.white);
    fx.black = Math.max(this.cur.black, this.fade);
    fx.glitch = this.cur.glitch; fx.noiseBurst = this.cur.noiseBurst; fx.tunnel = this.cur.tunnel;
    fx.ghost = this.cur.ghost; fx.flesh = this.cur.flesh; fx.shake = this.cur.shake; fx.blur = this.cur.blur;
    fx.saturation = this.grade.saturation; fx.contrast = this.grade.contrast; fx.exposure = this.grade.exposure * (0.8 + s.brightness * 0.04);
    fx.tint.copy(this.grade.tint);
    fx.ink = s.ink / 10; fx.paint = s.paint / 10;
    fx.brightness = (s.brightness - 5) * 0.006;
    G.uniforms.uSnapOn.value = s.wobble ? 1 : 0;
  }
}
