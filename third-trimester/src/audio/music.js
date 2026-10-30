// Procedural score. Every track is synthesized live with Web Audio from a tiny instrument kit
// (FM e-piano, string ensemble, pads, music box, celesta, formant choir, brass, timpani, drums)
// driven by a lookahead step sequencer. registerMusic(audio) adds the tracks to the engine.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const n = (s) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(s); return midi((+m[2] + 1) * 12 + NOTE[m[1]]); };
const ns = (str) => str.split(' ').map(n);
const VOWEL = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700] };

function engine(ctx, out, gain = 0.8) {
  const master = ctx.createGain(); master.gain.value = gain; master.connect(out);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  const bus = ctx.createGain(); bus.connect(comp).connect(master);
  const live = new Set();
  let noiseBuf = null;
  const noise = () => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };
  const track = (node, end) => { live.add(node); node.onended = () => live.delete(node); node.stop?.(end); };
  const env = (g, t, a, peak, dur, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel); };
  const E = {
    ctx, bus,
    osc(type, f, t, dur, { vol = 0.2, a = 0.01, r = 0.2, cutoff = 0, q = 0.7, detune = 0, vib = 0, to = 0, dest = bus } = {}) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5 + Math.random(); const lg = ctx.createGain(); lg.gain.value = f * vib; l.connect(lg).connect(o.frequency); l.start(t); track(l, t + dur + r + 0.1); }
      const g = ctx.createGain(); env(g, t, a, vol, dur, r);
      let node = o;
      if (cutoff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = q; node = node.connect(fl); }
      node.connect(g).connect(dest); o.start(t); track(o, t + dur + r + 0.1);
      return g;
    },
    noiseHit(t, { vol = 0.2, type = 'bandpass', f = 2000, q = 1, a = 0.002, dur = 0.05, r = 0.1, to = 0, dest = bus } = {}) {
      const s = ctx.createBufferSource(); s.buffer = noise(); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
      if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur + r);
      const g = ctx.createGain(); env(g, t, a, vol, dur, r);
      s.connect(fl).connect(g).connect(dest); s.start(t, Math.random()); track(s, t + dur + r + 0.05);
    },
    epiano(f, t, dur, vol = 0.12) {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.frequency.value = f; mod.frequency.value = f; mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.6);
      mod.connect(mg).connect(car.frequency); car.connect(g).connect(bus);
      env(g, t, 0.006, vol, dur * 0.6, dur * 0.8 + 0.6);
      const tine = ctx.createOscillator(), tg = ctx.createGain(); tine.frequency.value = f * 7.1; env(tg, t, 0.002, vol * 0.12, 0.01, 0.25); tine.connect(tg).connect(bus);
      for (const o of [car, mod, tine]) { o.start(t); track(o, t + dur * 1.4 + 0.8); }
    },
    pad(freqs, t, dur, vol = 0.05, { cutoff = 1400, a = 0.9, r = 1.4, type = 'sawtooth', vib = 0.003 } = {}) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; fl.Q.value = 0.6; fl.connect(bus);
      for (const f of freqs) for (const d of [-7, 7]) E.osc(type, f, t, dur, { vol: vol / freqs.length, a, r, detune: d, vib, dest: fl });
    },
    spic(f, t, vol = 0.12, cutoff = 1900) { E.osc('sawtooth', f, t, 0.06, { vol, a: 0.004, r: 0.16, cutoff, q: 1.2 }); E.osc('sawtooth', f, t, 0.06, { vol: vol * 0.7, a: 0.004, r: 0.16, cutoff, detune: 9 }); },
    bass(f, t, dur, vol = 0.16) { E.osc('sine', f, t, dur, { vol, a: 0.01, r: 0.15 }); E.osc('triangle', f, t, dur, { vol: vol * 0.35, a: 0.01, r: 0.12, cutoff: 600 }); },
    mbox(f, t, vol = 0.07) {
      E.osc('sine', f, t, 0.02, { vol, a: 0.002, r: 1.3 }); E.osc('sine', f * 3, t, 0.01, { vol: vol * 0.28, a: 0.002, r: 0.45 }); E.osc('sine', f * 5.4, t, 0.005, { vol: vol * 0.12, a: 0.001, r: 0.14 });
      E.noiseHit(t, { vol: vol * 0.15, type: 'highpass', f: 6000, dur: 0.004, r: 0.02 });
    },
    celesta(f, t, vol = 0.06) { E.osc('sine', f, t, 0.03, { vol, a: 0.004, r: 0.9 }); E.osc('sine', f * 4, t, 0.01, { vol: vol * 0.22, a: 0.002, r: 0.35 }); E.osc('triangle', f * 2, t, 0.02, { vol: vol * 0.12, a: 0.003, r: 0.5 }); },
    choir(freqs, t, dur, vol = 0.06, vowel = 'a') {
      const [f1, f2, f3] = VOWEL[vowel];
      const sum = ctx.createGain(); sum.gain.value = 1;
      const out2 = ctx.createGain(); out2.connect(bus);
      for (const [ff, q, g] of [[f1, 8, 1], [f2, 10, 0.6], [f3, 12, 0.25]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = ff; b.Q.value = q; const gg = ctx.createGain(); gg.gain.value = g * 3; sum.connect(b).connect(gg).connect(out2); }
      for (const f of freqs) for (const d of [-9, 0, 8]) E.osc('sawtooth', f, t, dur, { vol: vol / freqs.length, a: 0.7, r: 1.2, detune: d, vib: 0.006, dest: sum });
    },
    brass(f, t, dur, vol = 0.09) {
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(2800, t + 0.05); fl.frequency.exponentialRampToValueAtTime(1300, t + 0.3); fl.connect(bus);
      for (const d of [-6, 6]) E.osc('sawtooth', f, t, dur, { vol: vol / 2, a: 0.025, r: 0.18, detune: d, vib: 0.002, dest: fl });
    },
    timp(f, t, vol = 0.3) { E.osc('sine', f * 1.25, t, 0.05, { vol, a: 0.003, r: 1.2, to: f }); E.noiseHit(t, { vol: vol * 0.25, type: 'lowpass', f: 300, dur: 0.02, r: 0.3 }); },
    kick(t, vol = 0.35) { E.osc('sine', 120, t, 0.13, { vol, a: 0.002, r: 0.25, to: 42 }); },
    snare(t, vol = 0.12, brush = false) { brush ? E.noiseHit(t, { vol, f: 3200, q: 0.6, a: 0.03, dur: 0.05, r: 0.15 }) : (E.noiseHit(t, { vol, f: 2200, q: 0.8, dur: 0.02, r: 0.12 }), E.osc('triangle', 190, t, 0.02, { vol: vol * 0.6, r: 0.08 })); },
    hat(t, vol = 0.03, open = false) { E.noiseHit(t, { vol, type: 'highpass', f: 7500, dur: 0.005, r: open ? 0.2 : 0.035 }); },
    tick(t, vol = 0.04) { E.osc('square', 2600, t, 0.004, { vol, a: 0.0005, r: 0.012 }); },
    swell(t, dur, vol = 0.06) { E.noiseHit(t, { vol, type: 'highpass', f: 2000, a: dur, dur: 0.01, r: 0.3, to: 9000 }); },
    crackle(vol = 0.025) {
      const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.06 + (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0);
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 2500; fl.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = vol; s.connect(fl).connect(g).connect(bus); s.start(); live.add(s);
    },
    drone(f, vol = 0.05) {
      const o = ctx.createOscillator(); o.frequency.value = f; const o2 = ctx.createOscillator(); o2.frequency.value = f * 1.003; o2.type = 'triangle';
      const l = ctx.createOscillator(); l.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = vol * 0.4;
      const g = ctx.createGain(); g.gain.value = vol; l.connect(lg).connect(g.gain);
      o.connect(g); o2.connect(g); g.connect(bus); for (const x of [o, o2, l]) { x.start(); live.add(x); }
    },
    fadeOut(sec) {
      const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.05, sec));
      setTimeout(() => { for (const s of live) { try { s.stop(); } catch { /* done */ } } live.clear(); master.disconnect(); }, sec * 1000 + 400);
    },
  };
  return E;
}

// lookahead step sequencer: onStep(step, time, stepDur)
function sequencer(ctx, bpm, perBeat, onStep, swing = 0) {
  const dur = 60 / bpm / perBeat;
  let next = ctx.currentTime + 0.12, step = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    while (next < ctx.currentTime + 0.3) { const sw = step % 2 === 1 ? swing * dur : 0; try { onStep(step, next + sw, dur); } catch (e) { console.warn(e); } step++; next += dur; }
  };
  tick(); const id = setInterval(tick, 50);
  return () => { stopped = true; clearInterval(id); };
}
function makeTrack(ctx, out, { bpm, perBeat = 4, gain = 0.8, swing = 0, setup, step }) {
  const E = engine(ctx, out, gain);
  setup?.(E);
  const stop = sequencer(ctx, bpm, perBeat, (s, t, d) => step(E, s, t, d), swing);
  return { stop(fade = 1.5) { stop(); E.fadeOut(fade); } };
}

// ---------------------------------------------------------------- tracks
const TRACKS = {
  // tense comedic chase: string ostinato, ticking clock, a music-box motif that can't quite settle
  menu: (ctx, out) => {
    const chords = [['D2', 'D3 F3 A3'], ['Bb1', 'D3 F3 Bb3'], ['G1', 'D3 G3 Bb3'], ['A1', 'C#3 E3 G3'], ['D2', 'D3 F3 A3'], ['Bb1', 'D3 F3 Bb3'], ['Eb2', 'Eb3 G3 Bb3'], ['A1', 'C#3 E3 A3']];
    const motif = [
      [[0, 'A5'], [2, 'D6'], [4, 'C#6'], [6, 'D6'], [8, 'A5'], [12, 'F5']],
      [[0, 'Bb5'], [4, 'F5'], [6, 'D5'], [8, 'F5'], [12, 'Bb5']],
      [[0, 'G5'], [2, 'Bb5'], [4, 'D6'], [8, 'Bb5'], [12, 'G5']],
      [[0, 'A5'], [2, 'C#6'], [4, 'E6'], [8, 'G6'], [12, 'C#6'], [14, 'A5']],
    ];
    return makeTrack(ctx, out, { bpm: 132, gain: 0.75, step(E, s, t, d) {
      const bar = Math.floor(s / 16) % 8, cyc = Math.floor(s / 128), st = s % 16;
      const [root, chord] = chords[bar], r = n(root);
      if (st % 2 === 0) { const pat = [1, 1, 2, 1, 1, 1, 2, 1][st / 2]; E.spic(r * pat * 2, t, st === 0 ? 0.13 : 0.085); }
      if (st === 0) { E.pad(ns(chord), t, d * 16, 0.035, { cutoff: 900 }); E.timp(r * 2, t, bar % 2 === 0 ? 0.22 : 0.12); E.bass(r, t, d * 6, 0.1); }
      E.tick(t, st % 4 === 0 ? 0.03 : 0.014);
      if (st === 8 && bar % 2 === 1) E.kick(t, 0.18);
      if ((bar >= 4 || cyc % 2 === 1) && motif[bar % 4]) for (const [k, note] of motif[bar % 4]) if (k === st) E.mbox(n(note), t, 0.06);
      if (bar === 3 && st === 0 && cyc % 2 === 0) for (const f of ns('A2 E3 A3')) E.brass(f, t, d * 2, 0.06);
      if (bar === 7 && st >= 12) E.snare(t, 0.05 + (st - 12) * 0.02);
      if (bar === 7 && st === 8) E.swell(t, d * 8, 0.04);
    } });
  },
  // cozy lo-fi for daytime in the flat
  day: (ctx, out) => {
    const prog = [['F2', 'A3 C4 E4 G4'], ['E2', 'G3 B3 D4 F#4'], ['D2', 'F3 A3 C4 E4'], ['C2', 'E3 G3 B3 D4'], ['F2', 'A3 C4 E4 G4'], ['E2', 'G#3 B3 D4 F4'], ['A1', 'G3 C4 E4 B4'], ['D2', 'F#3 A3 C4 E4']];
    const mel = { 1: [[0, 'E5'], [3, 'G5'], [6, 'A5'], [10, 'G5'], [12, 'E5']], 3: [[2, 'D5'], [4, 'E5'], [8, 'G5'], [14, 'E5']], 5: [[0, 'B4'], [4, 'D5'], [6, 'E5'], [10, 'D5']], 7: [[0, 'A4'], [6, 'C5'], [8, 'B4'], [12, 'A4']] };
    return makeTrack(ctx, out, { bpm: 76, gain: 0.7, swing: 0.28, setup: (E) => E.crackle(0.03), step(E, s, t, d) {
      const bar = Math.floor(s / 16) % 8, st = s % 16, cyc = Math.floor(s / 128);
      const [root, chord] = prog[bar];
      if (st === 0) for (const f of ns(chord)) E.epiano(f, t + Math.random() * 0.012, d * 6, 0.05);
      if (st === 10) for (const f of ns(chord).slice(1)) E.epiano(f, t, d * 3, 0.035);
      if (st === 0 || st === 8) E.bass(n(root), t, d * 5, 0.13);
      if (st === 14) E.bass(n(root) * Math.pow(2, 2 / 12), t, d * 1.5, 0.08);
      if (st === 0 || st === 7 || st === 10) E.kick(t, 0.2);
      if (st === 4 || st === 12) E.snare(t, 0.07, true);
      if (st % 2 === 0) E.hat(t, st % 4 === 0 ? 0.018 : 0.011);
      if (cyc % 2 === 1 && mel[bar]) for (const [k, note] of mel[bar]) if (k === st) E.celesta(n(note), t, 0.045);
    } });
  },
  // night: dark pads, a sub drone and a far-away music box
  night: (ctx, out) => {
    const prog = ['A2 C3 E3', 'F2 A2 C3', 'D2 F2 A2', 'E2 G#2 B2'];
    const frag = [[0, 'E5'], [3, 'C5'], [6, 'B4'], [9, 'A4'], [12, 'G#4']];
    return makeTrack(ctx, out, { bpm: 56, gain: 0.8, setup: (E) => E.drone(n('A1'), 0.05), step(E, s, t, d) {
      const bar2 = Math.floor(s / 32) % 4, st = s % 32, cyc = Math.floor(s / 128);
      if (st === 0) E.pad(ns(prog[bar2]), t, d * 30, 0.06, { cutoff: 700, a: 2.5, r: 3 });
      if (cyc % 2 === 0 && bar2 === 1) for (const [k, note] of frag) if (k * 2 === st) E.mbox(n(note), t, 0.035);
      if (bar2 === 3 && st === 16 && cyc % 3 === 2) E.pad(ns('Bb3 E4 A4'), t, d * 14, 0.025, { cutoff: 2000, a: 3, r: 2, type: 'triangle' });
      if (st === 24 && Math.random() < 0.35) { E.kick(t, 0.08); E.kick(t + 0.22, 0.06); }
    } });
  },
  // raids, chases, the government at the door
  tension: (ctx, out) => {
    const prog = ['E2', 'C2', 'E2', 'B1'];
    return makeTrack(ctx, out, { bpm: 120, gain: 0.75, step(E, s, t, d) {
      const bar = Math.floor(s / 16) % 4, st = s % 16, r = n(prog[bar]);
      E.osc('sawtooth', r, t, d * 0.6, { vol: st % 4 === 0 ? 0.09 : 0.055, a: 0.004, r: 0.08, cutoff: 500 + 600 * ((s % 64) / 64), q: 4 });
      if (st % 2 === 0) E.spic(r * (st % 8 === 0 ? 4 : 2), t, 0.06);
      if (st === 0 || st === 3) E.kick(t, st === 0 ? 0.3 : 0.18);
      if (st === 8) E.snare(t, 0.06);
      if (st === 0) E.pad([r * 2, r * 2.38, r * 3], t, d * 16, 0.03, { cutoff: 1100 });
      if (bar === 3 && st === 0) { for (const f of [r * 2, r * 3, r * 4]) E.brass(f, t, d * 3, 0.06); E.swell(t, d * 12, 0.05); }
    } });
  },
  // the alien lullaby (3/4): music box melody with a whole-tone twist + celesta arpeggios
  lullaby: (ctx, out) => {
    const mel = [[['B4', 4], ['D5', 4], ['G5', 4]], [['F#5', 8], ['E5', 4]], [['D5', 4], ['E5', 4], ['D5', 4]], [['B4', 12]],
      [['C5', 4], ['E5', 4], ['A5', 4]], [['G#5', 8], ['E5', 4]], [['Bb5', 4], ['Ab5', 4], ['F#5', 4]], [['G5', 12]]];
    const chords = ['G3 B3 D4', 'D3 F#3 A3', 'E3 G3 B3', 'G3 B3 D4', 'C3 E3 G3', 'E3 G#3 B3', 'Bb3 D4 F#4', 'G3 B3 D4'];
    return makeTrack(ctx, out, { bpm: 84, gain: 0.85, step(E, s, t, d) {
      const bar = Math.floor(s / 12) % 8, st = s % 12;
      let k = 0; for (const [note, len] of mel[bar]) { if (k === st) E.mbox(n(note), t, 0.075); k += len; }
      const ch = ns(chords[bar]);
      if (st % 2 === 0) E.celesta(ch[(st / 2) % 3] * 2, t, 0.025);
      if (st === 0) { E.pad(ch, t, d * 12, 0.03, { cutoff: 900, a: 1.2, type: 'triangle' }); E.bass(ch[0] / 2, t, d * 10, 0.06); }
    } });
  },
  // the birth: cosmic choir swells over shimmering arpeggios
  birth: (ctx, out) => {
    const prog = ['C3 E3 G3 C4', 'E3 G#3 B3 E4', 'Ab2 C3 Eb3 Ab3', 'G2 B2 D3 G3'];
    return makeTrack(ctx, out, { bpm: 66, gain: 0.8, setup: (E) => E.drone(n('C2'), 0.04), step(E, s, t, d) {
      const bar2 = Math.floor(s / 32) % 4, st = s % 32;
      const ch = ns(prog[bar2]);
      if (st === 0) { E.choir(ch, t, d * 30, 0.09, bar2 % 2 ? 'o' : 'a'); E.timp(ch[0] / 2, t, 0.18); }
      E.celesta(ch[st % 4] * (st % 8 < 4 ? 2 : 4), t, 0.022);
      if (st >= 24) { if (st % 2 === 0) E.timp(ch[0] / 2, t, 0.05 + (st - 24) * 0.012); }
      if (st === 16) E.swell(t, d * 16, 0.035);
    } });
  },
  // the absurd epic finale: brass, choir, timpani, march snare
  finale: (ctx, out) => {
    const prog = [['C2', 'C4 E4 G4'], ['B1', 'B3 D4 G4'], ['A1', 'A3 C4 E4'], ['F1', 'A3 C4 F4'], ['G1', 'G3 C4 E4'], ['F1', 'A3 C4 F4'], ['G1', 'G3 B3 D4'], ['C2', 'G3 C4 E4']];
    const lead = [[[0, 'G4'], [4, 'C5'], [8, 'E5'], [12, 'G5']], [[0, 'F5'], [6, 'E5'], [8, 'D5'], [12, 'B4']], [[0, 'C5'], [4, 'E5'], [8, 'A5']], [[0, 'A5'], [4, 'G5'], [8, 'F5'], [12, 'A5']],
      [[0, 'G5'], [6, 'E5'], [8, 'C5'], [12, 'E5']], [[0, 'F5'], [4, 'A5'], [8, 'C6']], [[0, 'B5'], [4, 'A5'], [8, 'G5'], [10, 'F5'], [12, 'D5']], [[0, 'C5'], [8, 'C6']]];
    return makeTrack(ctx, out, { bpm: 138, gain: 0.75, step(E, s, t, d) {
      const bar = Math.floor(s / 16) % 8, st = s % 16, cyc = Math.floor(s / 128);
      const [root, chord] = prog[bar], ch = ns(chord), r = n(root);
      if (st === 0) { E.choir(ch, t, d * 15, 0.07, 'a'); E.timp(r * 2, t, 0.3); E.bass(r, t, d * 7, 0.14); E.bass(r * 2, t, d * 7, 0.06); }
      if (st === 0 || st === 6 || st === 10) for (const f of ch) E.brass(f, t, d * (st === 0 ? 4 : 1.5), 0.05);
      if ([0, 4, 6, 8, 12, 14].includes(st)) E.snare(t, st === 0 || st === 8 ? 0.08 : 0.045);
      if (st % 4 === 0) E.kick(t, 0.22);
      if (cyc % 2 === 1 || bar >= 4) for (const [k, note] of lead[bar]) if (k === st) E.brass(n(note), t, d * 3.5, 0.08);
      if (bar === 7 && st >= 8) E.timp(n('G2'), t, 0.08 + (st - 8) * 0.03);
      if (bar === 7 && st === 0) E.swell(t, d * 16, 0.07);
    } });
  },
  // bittersweet credits theme, reprising the lullaby
  credits: (ctx, out) => {
    const prog = [['A1', 'E3 A3 C4'], ['F1', 'F3 A3 C4'], ['C2', 'E3 G3 C4'], ['G1', 'D3 G3 B3']];
    const mel = [[[0, 'E5'], [4, 'C5'], [8, 'B4'], [12, 'A4']], [[0, 'C5'], [8, 'A4']], [[0, 'G4'], [4, 'C5'], [8, 'E5'], [12, 'G5']], [[0, 'F#5'], [8, 'D5']]];
    return makeTrack(ctx, out, { bpm: 92, gain: 0.75, setup: (E) => E.crackle(0.015), step(E, s, t, d) {
      const bar = Math.floor(s / 16) % 4, st = s % 16, cyc = Math.floor(s / 64);
      const [root, chord] = prog[bar];
      if (st === 0) { E.pad(ns(chord), t, d * 16, 0.04, { cutoff: 1200, a: 1 }); E.bass(n(root), t, d * 8, 0.12); }
      if (st % 4 === 2) for (const f of ns(chord)) E.epiano(f * 2, t, d * 2, 0.025);
      if (st === 0 || st === 10) E.kick(t, 0.12);
      if (st === 8) E.snare(t, 0.05, true);
      if (cyc % 2 === 1) for (const [k, note] of mel[bar]) if (k === st) { E.mbox(n(note), t, 0.05); E.celesta(n(note) / 2, t, 0.02); }
    } });
  },
};

export const TRACK_NAMES = Object.keys(TRACKS);
export function registerMusic(audio) {
  for (const [name, f] of Object.entries(TRACKS)) audio.registerTrack(name, f);
}
