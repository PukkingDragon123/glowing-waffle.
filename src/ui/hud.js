// HTML overlay: subtitles (Chilla's Art style), interaction prompts, the two
// inventory slots, dialogue choices, readable notes and the VHS OSD.
import { G } from '../core/globals.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.subs = $('subs'); this.prompt = $('prompt'); this.cross = $('crosshair');
    this.inv = $('inv'); this.osd = $('osd'); this.choicesEl = $('choices'); this.noteEl = $('note'); this.card = $('title-card');
    this.lines = [];
    this.promptKey = '';
    this.invTimer = 0;
    this.choice = null;
    this.osdText = '';
    this.hidden = false;
    this.queue = [];
  }

  // internal monologue (italic)
  inner(text, o = {}) { return this.say(text, { ...o, cls: 'inner' }); }
  // a spoken line with speaker name
  say(text, o = {}) {
    // only your own voice gets written down; everyone else is just heard
    if (o.cls !== 'inner' && !o.force) return null;
    if (!G.settings.v.subtitles && !o.force) return null;
    const el = document.createElement('div');
    el.className = 'line ' + (o.cls || '');
    if (o.who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = o.who; el.appendChild(w); }
    el.appendChild(document.createTextNode(text));
    this.subs.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    const dur = o.dur ?? Math.max(2.4, 1.2 + text.length * 0.055);
    const entry = { el, t: dur, key: o.key };
    this.lines.push(entry);
    while (this.lines.length > 3) this.kill(this.lines[0]);
    return entry;
  }
  kill(entry) {
    const i = this.lines.indexOf(entry); if (i >= 0) this.lines.splice(i, 1);
    entry.el.classList.remove('on');
    setTimeout(() => entry.el.remove(), 300);
  }
  clearSubs() { for (const l of [...this.lines]) this.kill(l); }

  setPrompt(actions) {
    const key = actions ? actions.map((a) => a.key + a.label).join('|') : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    if (!actions || !actions.length) { this.prompt.classList.remove('on'); this.cross.classList.remove('hot'); return; }
    this.prompt.innerHTML = '';
    // a key pill and a few words for each thing you can do
    const seen = new Set();
    for (const a of actions) {
      if (!a.key || seen.has(a.key)) continue; seen.add(a.key);
      const row = document.createElement('span'); row.className = 'act';
      const k = document.createElement('span'); k.className = 'key'; k.textContent = a.key === 'LMB' ? '◐' : a.key === 'RMB' ? '◑' : a.key;
      row.appendChild(k);
      if (a.label && a.key !== 'LMB' && a.key !== 'RMB') { const l = document.createElement('span'); l.className = 'lbl'; l.textContent = a.label; row.appendChild(l); }
      this.prompt.appendChild(row);
    }
    this.prompt.classList.add('on');
    this.cross.classList.add('hot');
  }

  showInventory(slots, hand) {
    const els = this.inv.querySelectorAll('.slot');
    els.forEach((el, i) => {
      const it = slots[i];
      el.classList.toggle('full', !!it);
      el.querySelector('.n').textContent = '';
    });
    this.inv.classList.add('on');
    this.invTimer = 3.5;
  }

  // choices: [{label, value}] ; returns a promise resolved with value
  choose(options, { timeout = 0, def = null } = {}) {
    if (this.choice) this.choice.resolve(null);
    this.choicesEl.innerHTML = '';
    const els = options.map((o, i) => { const d = document.createElement('div'); d.className = 'c' + (i === 0 ? ' sel' : ''); d.textContent = `${i + 1}. ${o.label}`; this.choicesEl.appendChild(d); return d; });
    return new Promise((resolve) => {
      this.choice = { options, els, sel: 0, resolve: (v) => { this.choicesEl.innerHTML = ''; this.choice = null; resolve(v); }, timeout, def, t: 0 };
    });
  }

  showNote(text) { this.noteEl.innerHTML = ''; this.noteEl.appendChild(document.createTextNode(text)); const h = document.createElement('span'); h.className = 'hint'; h.textContent = 'E / Esc to put it down'; this.noteEl.appendChild(h); this.noteEl.classList.add('on'); this.noteOpen = true; }
  hideNote() { this.noteEl.classList.remove('on'); this.noteOpen = false; }

  titleCard(big, small, dur = 4) {
    this.card.innerHTML = `<div class="big"></div><div class="small"></div>`;
    this.card.querySelector('.big').textContent = big;
    this.card.querySelector('.small').textContent = small || '';
    this.card.classList.add('on');
    return new Promise((r) => setTimeout(() => { this.card.classList.remove('on'); setTimeout(r, 1200); }, dur * 1000));
  }

  setOSD(left, right) {
    return;
    const s = left + '|' + right;
    if (s === this.osdText) return;
    this.osdText = s;
    this.osd.innerHTML = '';
    const l = document.createElement('div'); l.textContent = left;
    const r = document.createElement('div'); r.className = 'r'; r.innerHTML = '';
    right.split('\n').forEach((t, i) => { if (i) r.appendChild(document.createElement('br')); r.appendChild(document.createTextNode(t)); });
    this.osd.append(l, r);
  }
  // Chilla's Art-style task list, top left. items: [{text, done}]
  objective(items) {
    const el = document.getElementById('obj'); if (!el) return;
    el.innerHTML = '';
    for (const it of items || []) { const d = document.createElement('span'); d.className = 'o' + (it.done ? ' done' : ''); d.textContent = it.text; el.appendChild(d); }
    el.classList.toggle('on', !!(items && items.length));
  }
  // top right: the date that never changes, the clock, and the baht falling
  ticker(d) {
    const el = this.tk || (this.tk = { root: document.getElementById('ticker') });
    if (!el.root) return;
    if (!el.date) { el.date = el.root.querySelector('.date'); el.rate = el.root.querySelector('.rate'); el.arrow = el.root.querySelector('.arrow'); }
    const show = G.state === 'play' && !d.cutscene;
    el.root.classList.toggle('on', show);
    if (!show) return;
    const thai = (n) => String(n).replace(/[0-9]/g, (c) => '๐๑๒๓๔๕๖๗๘๙'[c]);
    const date = `พุธ ${thai(2)} ก.ค. ${thai(2540)} · ${d.clockText()}`;
    if (date !== el.lastDate) { el.lastDate = date; el.date.textContent = date; }
    const fx = d.fx, base = 24.5;
    const r = fx.toFixed(2);
    if (r !== el.lastRate) { el.lastRate = r; el.rate.textContent = r; el.arrow.textContent = fx > base + 0.05 ? '▲ ' + (((fx - base) / base) * 100).toFixed(1) + '%' : ''; }
    el.root.classList.toggle('crash', d.day >= 5);
  }
  setVisible(v) { document.getElementById('hud').style.display = v ? '' : 'none'; this.hidden = !v; }
  crosshair(v) { this.cross.classList.toggle('hidden', !v); }

  update(dt) {
    for (const l of [...this.lines]) { l.t -= dt; if (l.t <= 0) this.kill(l); }
    if (this.invTimer > 0) { this.invTimer -= dt; if (this.invTimer <= 0) this.inv.classList.remove('on'); }
    const c = this.choice;
    if (c) {
      const inp = G.input;
      let sel = c.sel;
      if (inp.pressed('ArrowUp') || inp.pressed('KeyW')) sel = (sel + c.options.length - 1) % c.options.length;
      if (inp.pressed('ArrowDown') || inp.pressed('KeyS')) sel = (sel + 1) % c.options.length;
      if (inp.wheel) sel = (sel + (inp.wheel > 0 ? 1 : c.options.length - 1)) % c.options.length;
      for (let i = 0; i < c.options.length; i++) if (inp.pressed('Digit' + (i + 1))) { c.els.forEach((e, j) => e.classList.toggle('sel', j === i)); c.resolve(c.options[i].value); return; }
      if (sel !== c.sel) { c.sel = sel; c.els.forEach((e, j) => e.classList.toggle('sel', j === sel)); }
      if (inp.pressed('Enter') || inp.pressed('KeyE') || inp.mousePressed(0)) { c.resolve(c.options[c.sel].value); return; }
      if (c.timeout) { c.t += dt; if (c.t >= c.timeout) c.resolve(c.def); }
    }
  }
}
