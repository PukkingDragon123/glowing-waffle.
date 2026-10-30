// LIFELINE 24 call engine. Lives for the whole session (open or closed computer):
// shift state, ringing, the active call's dialogue graph, scoring, tools, pay.
import { CALLS, DAY_PLAN } from './content/calls.js';
import { ACCOUNTS } from './content/kb.js';
import { addMoney } from '../game/state.js';

const OPEN = 9 * 60, CLOSE = 23 * 60, RING_TIMEOUT = 45;
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const normCode = (s) => String(s || '').toUpperCase().replace(/[\s_]+/g, '').replace(/[–—]/g, '-');
const MORSE = { A: '·–', B: '–···', C: '–·–·', D: '–··', E: '·', F: '··–·', G: '––·', H: '····', I: '··', J: '·–––', K: '–·–', L: '·–··', M: '––', N: '–·', O: '–––', P: '·––·', Q: '––·–', R: '·–·', S: '···', T: '–', U: '··–', V: '···–', W: '·––', X: '–··–', Y: '–·––', Z: '––··', 0: '–––––', 1: '·––––', 2: '··–––', 3: '···––', 4: '····–', 5: '·····', 6: '–····', 7: '––···', 8: '–––··', 9: '––––·' };

export class Hotline {
  constructor(comp) {
    this.comp = comp; this.game = comp.game;
    this.shift = false; this.day = null;
    this.done = {};            // day -> { callId: rating (0 = missed) }
    this.requeued = [];
    this.queue = [];
    this.ringing = null; this.ringT = 0; this.nextIn = 8;
    this.call = null;
    this.complete = false;
    this.earned = {};          // day -> $
    this.listeners = new Set();
    this.hintsSeen = {};
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(what = 'state') { for (const fn of this.listeners) fn(what); }
  emit(name, data) { this.game.events?.emit(name, data); }
  get clock() { return this.game.state?.clock ?? 600; }
  get hoursOpen() { return this.clock >= OPEN && this.clock < CLOSE; }
  tok(s) {
    const g = this.game.state || {};
    return String(s ?? '').replaceAll('{baby}', g.baby?.name || 'Bean').replaceAll('{day}', g.day ?? 1);
  }
  known(k) { return this.comp.known.has(k) || !!this.game.state?.flags?.[k]; }
  ctx() {
    const c = this.call;
    return { game: this.game, vars: c?.vars || {}, flags: this.game.state?.flags || {}, known: (k) => this.known(k), trace: c?.trace || 0 };
  }

  // ---------- day & shift ----------
  syncDay() {
    const d = this.game.state?.day ?? 1;
    if (d === this.day) return;
    this.day = d;
    this.done[d] = this.done[d] || {};
    this.requeued = [];
    this.complete = false;
    if (this.ringing) { this.ringing = null; this.emit('phone:stop', {}); }
    if (this.call && !this.call.ended) this.dropCall();
    this.call = null;
    this.shift = false;
    this.buildQueue();
    this.changed();
  }
  buildQueue() {
    const d = this.day, done = this.done[d] || {};
    this.queue = (DAY_PLAN[d] || []).filter((id) => !(id in done));
  }
  clockIn() {
    if (this.shift) return;
    this.syncDay();
    if (!this.queue.length) { this.complete = true; this.changed(); return false; }
    this.shift = true; this.complete = false;
    this.nextIn = 4 + Math.random() * 5;
    this.emit('shift:in', { day: this.day });
    this.comp.audio('os.on', 0.5);
    this.changed();
    return true;
  }
  clockOut() {
    if (!this.shift || (this.call && !this.call.ended)) return false;
    this.shift = false;
    if (this.ringing) { this.ringing = null; this.emit('phone:stop', {}); }
    this.emit('shift:out', { day: this.day, complete: this.complete });
    this.comp.audio('os.off', 0.5);
    this.changed();
    return true;
  }
  get dayCalls() { return (DAY_PLAN[this.day] || []).filter((id) => { const c = CALLS[id]; return !c.cond || c.cond(this.game) || id in (this.done[this.day] || {}); }); }
  get doneCount() { return Object.keys(this.done[this.day] || {}).length; }
  get avgRating() {
    const all = Object.values(this.done).flatMap((d) => Object.entries(d).filter(([id]) => !CALLS[id]?.noRating).map(([, r]) => r));
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  }

  // ---------- ringing ----------
  startRinging(id) {
    const def = CALLS[id];
    if (def.cond && !def.cond(this.game)) { this.queue.shift(); this.done[this.day][id] = 0; this.nextIn = 3; return; }
    this.ringing = def; this.ringT = 0;
    this.emit('phone:ring', { id, name: def.name, number: def.number });
    this.comp.onRing?.(def);
    this.changed('ring');
  }
  answer() {
    if (!this.ringing) return false;
    const def = this.ringing; this.ringing = null;
    this.queue = this.queue.filter((x) => x !== def.id);
    this.emit('phone:stop', { answered: true });
    this.call = { def, node: null, vars: {}, score: 0, trace: 0, steps: [], transcript: [], speaking: null, ended: false, result: null, tries: null, t: 0 };
    this.emit('call:start', { id: def.id });
    this.comp.audio('os.connect', 0.5);
    this.say('sys', `Connected — ${def.name} (${def.number})`);
    this.enter(def.start);
    this.changed('call');
    return true;
  }
  missed() {
    const def = this.ringing; this.ringing = null; this.ringT = 0;
    this.emit('phone:stop', { missed: true });
    this.queue = this.queue.filter((x) => x !== def.id);
    if (def.kind === 'main' && !this.requeued.includes(def.id)) { this.requeued.push(def.id); this.queue.push(def.id); }
    else { this.done[this.day][def.id] = 0; }
    const st = this.game.state?.stats; if (st) st.missed = (st.missed || 0) + 1;
    this.lastMissed = def;
    this.nextIn = 14 + Math.random() * 10;
    this.comp.os?.notify('Missed call', `${def.name} (${def.number}) hung up after ${RING_TIMEOUT} rings. Doreen has been notified.`, () => this.comp.launch('hotline'));
    this.changed('missed');
  }
  dropCall() {
    const c = this.call; if (!c) return;
    c.steps = []; c.speaking?.handle?.stop?.();
    if (!c.ended && !(c.def.id in (this.done[this.day] || {}))) this.queue.unshift(c.def.id);
    this.call = null;
  }

  // ---------- dialogue ----------
  say(who, text, voice) { this.call?.steps.push({ type: 'line', who, text: this.tok(text), voice }); }
  enter(id) {
    const c = this.call; if (!c || c.ended) return;
    const node = c.def.nodes[id];
    if (!node) { console.warn('missing node', id); return; }
    if (node.route) { this.enter(node.route(this.ctx())); return; }
    c.node = id; c.tries = node.input ? node.input.tries ?? 3 : null;
    if (node.set) Object.assign(c.vars, node.set);
    if (node.flags) Object.assign(this.game.state.flags, node.flags);
    if (node.score) c.score += node.score;
    if (node.trace) c.trace += node.trace;
    if (node.hint && !this.hintsSeen[c.def.id + id] && !(node.hintOnce && this.hintsSeen[node.hint])) { this.hintsSeen[c.def.id + id] = true; c.hint = node.hint; }
    if (node.sfx) c.steps.push({ type: 'sfx', sfx: node.sfx });
    if (node.sys) c.steps.push({ type: 'line', who: 'sys', text: this.tok(node.sys) });
    let lines = typeof node.say === 'function' ? node.say(this.ctx()) : node.say;
    if (typeof lines === 'string') lines = [lines];
    for (const l of lines || []) if (l) c.steps.push({ type: 'line', who: 'caller', text: this.tok(l), voice: c.def.voice });
    c.steps.push({ type: 'after', node: id });
    this.changed('node');
  }
  // What the view shows as choices for the current node (empty while speaking).
  get options() {
    const c = this.call;
    if (!c || c.ended || c.steps.length || c.speaking) return null;
    const node = c.def.nodes[c.node];
    if (!node) return null;
    const ctx = this.ctx();
    const list = (node.choices || []).map((ch, i) => {
      let ok = true;
      if (ch.need) ok = typeof ch.need === 'function' ? !!ch.need(ctx) : this.known(ch.need);
      return { i, text: this.tok(ch.text), ok, needText: ch.needText, hide: !ok && ch.hideLocked };
    }).filter((o) => !o.hide);
    return { choices: list, input: node.input ? { prompt: node.input.prompt, tries: c.tries } : null, await: node.await || null };
  }
  choose(i) {
    const c = this.call; const opts = this.options; if (!opts) return;
    const node = c.def.nodes[c.node]; const ch = node.choices?.[i]; if (!ch) return;
    const o = opts.choices.find((x) => x.i === i); if (!o || !o.ok) { this.comp.audio('os.error', 0.4); return; }
    this.comp.audio('os.press', 0.35);
    if (ch.hangup) { this.say('you', ch.text.replace(/^\[|\]$/g, ''), 'sunny'); this.call.steps.push({ type: 'fn', fn: () => this.hangup() }); this.changed(); return; }
    c.score += ch.score || 0; c.tipBonus = (c.tipBonus || 0) + (ch.tip || 0);
    if (ch.set) Object.assign(c.vars, ch.set);
    if (ch.flags) Object.assign(this.game.state.flags, ch.flags);
    if (ch.trace) c.trace += ch.trace;
    this.say('you', ch.text, 'sunny');
    c.steps.push({ type: 'goto', to: ch.to });
    this.changed('choice');
  }
  submitInput(text) {
    const c = this.call; const node = c?.def.nodes[c.node]; if (!node?.input || c.steps.length) return;
    this.say('you', `"${String(text).toUpperCase()}"`, 'sunny');
    const ans = norm(text);
    if (node.input.answers.some((a) => norm(a) === ans)) { this.comp.audio('os.complete', 0.5); c.steps.push({ type: 'goto', to: node.input.ok }); }
    else {
      c.tries -= 1;
      this.comp.audio('os.error', 0.4);
      if (c.tries <= 0) c.steps.push({ type: 'goto', to: node.input.fail });
      else c.steps.push({ type: 'line', who: 'sys', text: `That doesn't decode to anything sensible. (${c.tries} ${c.tries === 1 ? 'try' : 'tries'} left)` }, { type: 'after', node: c.node });
    }
    this.changed('input');
  }
  // Account Tool → Device Reset
  pushCode(code) {
    const c = this.call; const node = c && !c.ended ? c.def.nodes[c.node] : null;
    if (!c || c.ended) return { ok: false, msg: 'No customer device is connected to LINE 1.' };
    if (!node?.await || node.await.tool !== 'reset' || c.steps.length) return { ok: false, msg: 'The caller\'s device is not ready for a code.' };
    const ok = normCode(code) === normCode(node.await.value);
    this.say('sys', `Reset code ${String(code).toUpperCase()} pushed to device.`);
    c.steps.push({ type: 'goto', to: ok ? node.await.ok : node.await.wrong });
    this.changed('tool');
    return { ok, msg: ok ? 'Device accepted the code.' : 'Device rejected the code.' };
  }
  // Switchboard
  transfer(dept) {
    const c = this.call;
    if (!c || c.ended) return { ok: false, msg: 'There is no caller on LINE 1.' };
    if (c.steps.length) return { ok: false, msg: 'Wait until the caller stops talking.' };
    const node = c.def.nodes[c.node];
    const to = node?.transfer?.[dept] ?? node?.transfer?.['*'] ?? c.def.transfer?.[dept] ?? c.def.transfer?.['*'];
    this.say('sys', `Transferring LINE 1 → ${dept}...`);
    if (to) c.steps.push({ type: 'goto', to });
    else c.steps.push({ type: 'fn', fn: () => this.finish({ rating: 1, text: `${c.def.name} did not want to be transferred to ${dept}. Logged as an incorrect transfer.` }) });
    this.changed('tool');
    return { ok: true, msg: `Transferred to ${dept}.` };
  }
  lookup(num) {
    const key = String(num || '').replace(/[^0-9]/g, '');
    const fmt = key.length === 7 ? key.slice(0, 3) + '-' + key.slice(3) : String(num).trim();
    const rec = ACCOUNTS[fmt];
    if (rec?.learn) this.comp.learn(rec.learn);
    this.comp.audio(rec ? 'os.complete' : 'os.error', 0.4);
    return rec ? { num: fmt, ...rec } : null;
  }
  hangup() {
    const c = this.call;
    if (!c) return;
    if (c.ended) { this.call = null; this.changed('clear'); return; }
    c.steps = []; c.speaking?.handle?.stop?.(); c.speaking = null;
    const res = c.def.onHangup ? c.def.onHangup(this.ctx()) : null;
    this.comp.audio('os.disconnect', 0.5);
    this.say('sys', 'You hung up.');
    if (res) this.finish(res);
    else if (c.def.noRating) this.finish({ noPay: true });
    else this.finish({ rating: 1, text: 'Hanging up on a caller is logged as a 1-star call.' });
  }
  finish(end) {
    const c = this.call; if (!c || c.ended) return;
    const def = c.def, st = this.game.state;
    c.ended = true; c.steps = c.steps.filter((s) => s.type === 'line');
    let rating = null, pay = 0;
    if (!end.noPay && !def.noRating) {
      rating = end.rating ?? Math.max(1, Math.min(5, 3 + c.score));
      const tip = rating >= 3 ? (end.tip || 0) + (c.tipBonus || 0) : 0;
      pay = Math.round((def.pay * rating / 5 + tip) * 100) / 100;
      c.tip = tip;
    }
    if (end.flags) Object.assign(st.flags, end.flags);
    if (pay > 0) { addMoney(pay, `LIFELINE 24 — call: ${def.name}`); this.earned[this.day] = (this.earned[this.day] || 0) + pay; }
    if (st?.stats) { st.stats.calls += 1; if (rating >= 4) st.stats.goodCalls += 1; }
    this.done[this.day][def.id] = rating ?? 5;
    c.result = { rating, pay, text: end.text ? this.tok(end.text) : null };
    if (end.text) c.steps.push({ type: 'line', who: 'sys', text: this.tok(end.text) });
    this.emit('call:end', { id: def.id, rating });
    this.nextIn = 10 + Math.random() * 14;
    if (end.emit) {
      const ev = end.emit;
      this.shift = false; this.queue = [];
      setTimeout(() => { this.emit('shift:out', { day: this.day, complete: true }); this.emit(ev, { from: def.id }); }, 2500);
    }
    this.changed('end');
  }
  playSfx(sfx) {
    const a = this.game.audio; const c = this.call;
    const [kind, arg] = sfx.split(/:(.*)/s);
    if (kind === 'knock') {
      const n = +arg || 1;
      this.emit('wall:knock', { count: n });
      return 0.6 + n * 0.45;
    }
    if (kind === 'breath') { for (let i = 0; i < 3; i++) setTimeout(() => a?.sfx?.('gasp', { vol: 0.25, rate: 0.6 }), i * 1100); return 3.2; }
    if (kind === 'static') { const l = a?.loop?.('static', { vol: 0.18, bus: 'voice' }); setTimeout(() => l?.stop?.(0.3), 1600); return 1.7; }
    if (kind === 'purr') { const l = a?.loop?.('purr', { vol: 0.5, bus: 'voice' }); setTimeout(() => l?.stop?.(0.5), 2200); return 2.3; }
    if (kind === 'giggle') { a?.sfx?.('baby_giggle', { vol: 0.6, bus: 'voice' }); return 1; }
    if (kind === 'hum') { a?.babble?.('mmm mmm mmm', 'choir'); return 2; }
    if (kind === 'morse') {
      const text = arg.toUpperCase(); const code = text.split(' ').map((w) => (w === '/' ? '/' : [...w].map((ch) => MORSE[ch] || '').join(' '))).join('   ');
      c.transcript.push({ who: 'morse', text: code, shown: 0, full: code });
      return this.playMorse(text);
    }
    return 0.2;
  }
  playMorse(text) {
    const a = this.game.audio; const ctx = a?.ctx; const unit = 0.075;
    let t = 0; const beeps = [];
    for (const w of text.split(' ')) {
      if (w === '/') { t += unit * 4; continue; }
      for (const ch of w) { for (const s of MORSE[ch] || '') { const d = s === '·' ? unit : unit * 3; beeps.push([t, d]); t += d + unit; } t += unit * 2; }
      t += unit * 4;
    }
    if (ctx && a.ready) {
      const now = ctx.currentTime + 0.05, out = ctx.createGain(); out.gain.value = 0.18; out.connect(a.bus.voice);
      for (const [st, d] of beeps) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 760;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, now + st); g.gain.linearRampToValueAtTime(1, now + st + 0.005); g.gain.setValueAtTime(1, now + st + d - 0.005); g.gain.linearRampToValueAtTime(0, now + st + d);
        o.connect(g).connect(out); o.start(now + st); o.stop(now + st + d + 0.02);
      }
      const l = a.loop('purr', { vol: 0.25, bus: 'voice' }); setTimeout(() => l.stop(0.6), t * 1000 + 300);
    }
    return t + 0.4;
  }

  // ---------- per-frame ----------
  update(dt) {
    this.syncDay();
    if (this.shift && !this.ringing && (!this.call || this.call.ended)) {
      if (!this.queue.length) {
        if (!this.call || this.call.ended) {
          this.complete = true; this.shift = false;
          this.emit('shift:out', { day: this.day, complete: true });
          this.comp.os?.notify('Shift complete', `All calls handled for today. Earned ${'$' + (this.earned[this.day] || 0).toFixed(2)}.`, () => this.comp.launch('hotline'));
          this.changed();
        }
      } else if (this.hoursOpen) {
        this.nextIn -= dt;
        if (this.nextIn <= 0) this.startRinging(this.queue[0]);
      }
    }
    if (this.ringing) { this.ringT += dt; if (this.ringT > RING_TIMEOUT) this.missed(); }
    const c = this.call;
    if (c) {
      c.t += dt;
      if (c.def.trace && !c.ended && c.trace < 100) {
        c.trace += c.def.trace.rate * dt;
        if (c.trace >= 100) { c.trace = 100; c.steps = []; c.speaking?.handle?.stop?.(); c.speaking = null; this.enter('traced'); }
      }
      this.stepDialogue(dt);
    }
  }
  stepDialogue(dt) {
    const c = this.call;
    if (c.speaking) {
      const sp = c.speaking; sp.t += dt;
      const entry = sp.entry;
      if (entry) entry.shown = Math.min(entry.full.length, Math.floor((sp.t / Math.max(0.3, sp.dur * 0.92)) * entry.full.length));
      if (sp.t >= sp.dur) { if (entry) entry.shown = entry.full.length; c.speaking = null; this.changed('line'); }
      return;
    }
    while (c.steps.length && !c.speaking) {
      const s = c.steps.shift();
      if (s.type === 'line') {
        const entry = { who: s.who, text: s.text, full: s.text, shown: 0 };
        c.transcript.push(entry);
        if (s.who === 'sys' || s.who === 'sfx') { entry.shown = entry.full.length; c.speaking = { t: 0, dur: 0.5, entry }; }
        else {
          const voice = s.who === 'you' ? 'sunny' : (c.def.muffled ? 'man' : s.voice || 'man');
          let handle = null, dur = Math.max(0.6, s.text.length / 26);
          try { handle = this.game.audio?.babble?.(s.text, voice, { rate: s.who === 'you' ? 1.35 : c.def.muffled ? 0.8 : 1, vol: s.who === 'you' ? 0.22 : c.def.muffled ? 0.25 : 0.5 }); if (handle?.duration) dur = handle.duration; } catch { /* no audio */ }
          c.speaking = { t: 0, dur: dur + 0.15, entry, handle, who: s.who };
        }
        this.changed('line');
      } else if (s.type === 'sfx') {
        const d = this.playSfx(s.sfx);
        c.speaking = { t: 0, dur: d, entry: c.transcript[c.transcript.length - 1]?.who === 'morse' ? c.transcript[c.transcript.length - 1] : null, sfx: true };
        this.changed('line');
      } else if (s.type === 'goto') { this.enter(s.to); }
      else if (s.type === 'fn') { s.fn(); }
      else if (s.type === 'after') {
        const node = c.def.nodes[s.node];
        if (node.end) this.finish(node.end);
        else if (node.next) this.enter(node.next);
        else this.changed('options');
      }
      if (!this.call) return;
    }
  }
  skipLine() {
    const c = this.call; if (!c?.speaking || c.speaking.sfx) return;
    c.speaking.handle?.stop?.();
    if (c.speaking.entry) c.speaking.entry.shown = c.speaking.entry.full.length;
    c.speaking = null; this.changed('line');
  }

  serialize() { return { done: this.done, shift: this.shift, day: this.day, earned: this.earned, requeued: this.requeued, hintsSeen: this.hintsSeen }; }
  deserialize(o) {
    if (!o) return;
    this.done = o.done || {}; this.earned = o.earned || {}; this.hintsSeen = o.hintsSeen || {};
    this.day = null; this.syncDay();
    this.requeued = o.requeued || [];
    this.shift = !!o.shift && o.day === this.day && this.queue.length > 0;
    this.changed();
  }
}
