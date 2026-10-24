// Web Audio engine: buses, generated reverbs per zone, HRTF positional sounds
// with occlusion, loops, ambience beds and speech (phone line filtering).
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { GEN, LOOPS } from './sfx.js';
import { SR } from './dsp.js';
import { synth, VOICES } from './tts.js';
import { clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();

const REVERBS = { room: [0.55, 2600, 0.22], small: [0.35, 3000, 0.16], bath: [1.1, 5000, 0.4], hall: [1.7, 3200, 0.38], stair: [2.4, 2600, 0.45], void: [6, 1600, 0.6], lab: [3.2, 2200, 0.5], outside: [1.2, 2000, 0.2] };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.loops = new Set();
    this.ready = false;
    this.zone = 'room';
    this.muted = false;
  }

  // must be called from a user gesture
  async init(onProgress) {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
    const master = this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    // gentle "tape" tone: tame harsh highs
    const tape = ctx.createBiquadFilter(); tape.type = 'lowpass'; tape.frequency.value = 11000; tape.Q.value = 0.5;
    master.connect(tape); tape.connect(comp); comp.connect(ctx.destination);
    this.bus = {};
    for (const b of ['sfx', 'amb', 'voice', 'ui', 'music']) { const g = ctx.createGain(); g.connect(master); this.bus[b] = g; }
    this.bus.amb.gain.value = 0.8;
    // reverb send with two convolvers for crossfades
    this.revA = ctx.createConvolver(); this.revB = ctx.createConvolver();
    this.revGA = ctx.createGain(); this.revGB = ctx.createGain();
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1;
    this.revSend.connect(this.revA); this.revSend.connect(this.revB);
    this.revA.connect(this.revGA); this.revB.connect(this.revGB);
    this.revGA.connect(master); this.revGB.connect(master);
    this.revGA.gain.value = 0.35; this.revGB.gain.value = 0;
    this.irs = {};
    for (const [k, [dur, lp, wet]] of Object.entries(REVERBS)) this.irs[k] = { buf: this.makeIR(dur, lp), wet };
    this.revA.buffer = this.irs.room.buf; this.activeRev = 'A';
    this.applyVolume();
    G.settings.onChange((k) => { if (k === 'volume') this.applyVolume(); });
    // pre-generate the core library in chunks, the rest during idle time
    const core = ['step_wood', 'step_tile', 'step_carpet', 'step_concrete', 'doorCreak', 'doorOpen', 'doorClose', 'doorSlam', 'cabinetOpen', 'cabinetClose', 'drawer', 'switch', 'click',
      'pickup', 'place', 'pocket', 'grab', 'whoosh', 'imp_ceramic', 'imp_wood', 'imp_plastic', 'imp_cardboard', 'imp_food', 'growl', 'heartbeat', 'meow', 'meowShort', 'trill', 'purr', 'hiss',
      'catStep', 'chewSoft', 'chewCrunch', 'swallow', 'gulp', 'tapeHiss', 'fridgeHum', 'cityDay', 'wind', 'bodyFall', 'scream', 'tinnitus', 'mouseClick', 'key', 'stinger'];
    for (let i = 0; i < core.length; i++) {
      this.get(core[i]);
      if (i % 4 === 0) { onProgress && onProgress(i / core.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    this.ready = true;
    onProgress && onProgress(1);
    const rest = Object.keys(GEN).filter((n) => !this.buffers.has(n));
    const idle = () => { const n = rest.shift(); if (!n) return; this.get(n); setTimeout(idle, 30); };
    setTimeout(idle, 500);
  }

  applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : Math.pow(G.settings.v.volume / 10, 1.6) * 0.9; }

  makeIR(dur, lp) {
    const ctx = this.ctx;
    const n = Math.floor(dur * ctx.sampleRate);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      const a = Math.exp(-2 * Math.PI * lp / ctx.sampleRate);
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const x = (Math.random() * 2 - 1) * Math.pow(1 - t / dur, 2.2) * (t < 0.008 ? t / 0.008 : 1);
        y = x + a * (y - x);
        d[i] = y;
      }
    }
    return buf;
  }

  setZone(name) {
    if (!this.ctx || name === this.zone || !this.irs[name]) return;
    this.zone = name;
    const t = this.ctx.currentTime;
    const ir = this.irs[name];
    const [inc, out, gin, gout] = this.activeRev === 'A' ? [this.revB, this.revA, this.revGB, this.revGA] : [this.revA, this.revB, this.revGA, this.revGB];
    inc.buffer = ir.buf;
    gin.gain.cancelScheduledValues(t); gout.gain.cancelScheduledValues(t);
    gin.gain.setValueAtTime(gin.gain.value, t); gin.gain.linearRampToValueAtTime(ir.wet, t + 0.6);
    gout.gain.setValueAtTime(gout.gain.value, t); gout.gain.linearRampToValueAtTime(0, t + 0.6);
    this.activeRev = this.activeRev === 'A' ? 'B' : 'A';
  }

  get(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    const gen = GEN[name];
    if (!gen || !this.ctx) return null;
    let data = gen();
    if (!Array.isArray(data)) data = [data];
    const bufs = data.map((d) => { const b = this.ctx.createBuffer(1, d.length, SR); b.copyToChannel(d, 0); return b; });
    this.buffers.set(name, bufs);
    return bufs;
  }

  // create the per-voice chain: [filter] -> gain -> [panner] -> bus (+ reverb send)
  chain(o) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = o.vol ?? 1;
    let head = gain, panner = null, filter = null;
    if (o.filter || o.pos) {
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = o.filter ?? 20000; filter.Q.value = 0.5;
      filter.connect(gain); head = filter;
    }
    let out = gain;
    if (o.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
      panner.refDistance = o.ref ?? 1.0; panner.rolloffFactor = o.rolloff ?? 1.4; panner.maxDistance = 60;
      panner.positionX.value = o.pos.x; panner.positionY.value = o.pos.y; panner.positionZ.value = o.pos.z;
      gain.connect(panner); out = panner;
    }
    const bus = this.bus[o.bus || 'sfx'];
    out.connect(bus);
    const send = ctx.createGain(); send.gain.value = o.reverb ?? (o.pos ? 0.6 : 0.25);
    out.connect(send); send.connect(this.revSend);
    return { head, gain, panner, filter, send };
  }

  occlusion(pos) {
    // muffle sounds without line of sight to the listener
    if (!G.physics || !G.camera) return 20000;
    const blocked = G.physics.raycast(G.camera.position, pos);
    if (!blocked) return 20000;
    const d = G.camera.position.distanceTo(pos);
    return clamp(1800 - d * 90, 350, 1800);
  }

  play(name, o = {}) {
    if (!this.ctx || this.muted) return null;
    let bufs = this.get(name);
    if (!bufs && name.startsWith('imp_')) bufs = this.get(name.slice(4));
    if (!bufs && GEN['imp_' + name]) bufs = this.get('imp_' + name);
    if (!bufs) return null;
    const buf = o.variant !== undefined ? bufs[o.variant % bufs.length] : bufs[Math.floor(Math.random() * bufs.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (o.jitter === false ? 1 : 1 + (Math.random() - 0.5) * 0.06);
    const ch = this.chain({ ...o, filter: o.pos && o.occlude !== false ? this.occlusion(o.pos) : o.filter });
    src.connect(ch.head);
    const when = this.ctx.currentTime + (o.delay ?? 0);
    src.start(when, o.offset ?? 0);
    const h = { src, ...ch, stop: (fade = 0.05) => { try { const t = this.ctx.currentTime; ch.gain.gain.setTargetAtTime(0, t, fade / 3); src.stop(t + fade + 0.05); } catch (e) { /* ignore */ } }, dur: buf.duration / src.playbackRate.value };
    src.onended = () => { try { ch.gain.disconnect(); ch.panner && ch.panner.disconnect(); ch.send.disconnect(); } catch (e) { /* ignore */ } };
    return h;
  }

  // looping source; returns a handle with set({vol, rate, pos}) and stop(fade)
  loop(name, o = {}) {
    if (!this.ctx) return { stop() {}, set() {} };
    const bufs = this.get(name);
    if (!bufs) return { stop() {}, set() {} };
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[0]; src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    const ch = this.chain({ ...o, vol: 0 });
    src.connect(ch.head);
    src.start(this.ctx.currentTime, Math.random() * bufs[0].duration);
    const t = this.ctx.currentTime;
    ch.gain.gain.setValueAtTime(0, t);
    ch.gain.gain.linearRampToValueAtTime(o.vol ?? 1, t + (o.fade ?? 0.3));
    const h = {
      src, ...ch, vol: o.vol ?? 1, pos: o.pos ? o.pos.clone() : null, follow: o.follow || null, occT: 0, dead: false, occlude: o.occlude !== false,
      set: (p) => {
        const now = this.ctx.currentTime;
        if (p.vol !== undefined) { h.vol = p.vol; ch.gain.gain.setTargetAtTime(p.vol, now, 0.08); }
        if (p.rate !== undefined) src.playbackRate.setTargetAtTime(p.rate, now, 0.08);
        if (p.pos && ch.panner) { h.pos = p.pos.clone ? p.pos.clone() : p.pos; ch.panner.positionX.setTargetAtTime(p.pos.x, now, 0.03); ch.panner.positionY.setTargetAtTime(p.pos.y, now, 0.03); ch.panner.positionZ.setTargetAtTime(p.pos.z, now, 0.03); }
        if (p.filter !== undefined && ch.filter) ch.filter.frequency.setTargetAtTime(p.filter, now, 0.1);
      },
      stop: (fade = 0.3) => {
        if (h.dead) return; h.dead = true; this.loops.delete(h);
        const now = this.ctx.currentTime;
        ch.gain.gain.cancelScheduledValues(now); ch.gain.gain.setValueAtTime(ch.gain.gain.value, now); ch.gain.gain.linearRampToValueAtTime(0, now + fade);
        try { src.stop(now + fade + 0.05); } catch (e) { /* ignore */ }
      },
    };
    this.loops.add(h);
    return h;
  }

  // speech: returns {handle, dur}. o.phone routes through a telephone band filter.
  speak(text, o = {}) {
    if (!this.ctx) return { dur: Math.max(1.5, text.length * 0.06), stop() {} };
    const voice = typeof o.voice === 'string' ? VOICES[o.voice] : (o.voice || VOICES.man);
    const s = synth(text, voice);
    let data = s.data;
    if (o.reverse) data = data.slice().reverse();
    const buf = this.ctx.createBuffer(1, data.length, s.sr);
    buf.copyToChannel(data, 0);
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const ch = this.chain({ bus: 'voice', vol: o.vol ?? 0.9, pos: o.pos, reverb: o.reverb ?? (o.phone ? 0.05 : 0.3), ref: 0.5 });
    let head = ch.head;
    if (o.phone) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 6; pk.Q.value = 1;
      const sh = ctx.createWaveShaper(); sh.curve = this.distCurve(o.distort ?? 6);
      src.connect(hp); hp.connect(pk); pk.connect(sh); sh.connect(lp); lp.connect(head);
    } else if (o.mech) {
      // ring-modulated, metallic facility voice
      const osc = ctx.createOscillator(); osc.frequency.value = 55; const rm = ctx.createGain(); rm.gain.value = 0;
      osc.connect(rm.gain); src.connect(rm); rm.connect(head); src.connect(head);
      osc.start(); osc.stop(ctx.currentTime + buf.duration + 0.5);
    } else src.connect(head);
    src.start(ctx.currentTime + (o.delay ?? 0));
    return { src, ...ch, dur: buf.duration / (o.rate ?? 1), stop: (f = 0.1) => { try { ch.gain.gain.setTargetAtTime(0, ctx.currentTime, f / 3); src.stop(ctx.currentTime + f + 0.05); } catch (e) { /* ignore */ } } };
  }
  distCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }

  update(dt) {
    if (!this.ctx) return;
    const cam = G.camera;
    const L = this.ctx.listener;
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    // loops: follow objects + occlusion refresh
    for (const h of this.loops) {
      if (h.follow) { const p = h.follow.getWorldPosition ? h.follow.getWorldPosition(_v) : h.follow; h.set({ pos: p }); }
      if (h.pos && h.filter && h.occlude) {
        h.occT -= dt;
        if (h.occT <= 0) { h.occT = 0.25; h.filter.frequency.setTargetAtTime(this.occlusion(h.pos), t, 0.15); }
      }
    }
    // reverb by zone
    if (G.world && G.player) {
      const z = G.world.zoneAt(G.player.ctrl.body.position);
      this.setZone(z ? z.reverb || 'room' : 'outside');
    }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
