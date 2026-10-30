// LIFELINE 24 Agent Console window (view over comp.hotline).
import { h, money, fmtClock } from '../dom.js';
import { KB, searchKB } from '../content/kb.js';
import { portrait } from '../portrait.js';

const DEPTS = ['BILLING', 'TECH', 'PARANORMAL', 'LEGAL', 'PIZZA PRONTO', 'THE VOID'];

export function registerHotline(os, comp) {
  os.register('hotline', {
    title: 'LIFELINE 24 — Agent Console', icon: 'hotline', w: 640, h: 470, minW: 560, minH: 400,
    create(win) { return new HotlineView(win, comp); },
  });
}

class HotlineView {
  constructor(win, comp) {
    this.win = win; this.comp = comp; this.svc = comp.hotline; this.tab = 'call';
    this.kbQuery = ''; this.kbArticle = 'welcome'; this.lookupRec = null; this.resetMsg = '';
    win.setMenus([
      { label: 'Shift', items: () => [
        { label: 'Clock In', action: () => this.svc.clockIn(), disabled: this.svc.shift },
        { label: 'Clock Out', action: () => this.svc.clockOut(), disabled: !this.svc.shift || (this.svc.call && !this.svc.call.ended) },
      ] },
      { label: 'Tools', items: [
        { label: 'Knowledge Base', icon: 'kb', action: () => this.setTab('kb') },
        { label: 'Switchboard', action: () => this.setTab('sb') },
        { label: 'Account Tool', action: () => this.setTab('acct') },
      ] },
      { label: 'Help', items: [{ label: 'About LIFELINE 24', action: () => comp.os.dialog({ title: 'About', icon: 'hotline', text: '<b>LIFELINE 24 Agent Console</b> v4.2<br>"We Answer Everything."<br><br>Licensed to: SUNNY (remote agent #1407)<br>Supervisor: D. Pratt' }) }] },
    ]);
    this.build();
    this.off = this.svc.on((what) => this.onChange(what));
    this.render();
  }
  build() {
    const b = this.win.body;
    this.lamp = h('div', { class: 'hl-lamp' });
    this.stateEl = h('div', { class: 'hl-state' });
    this.clockBtn = h('button', { class: 'd98-btn', onclick: () => (this.svc.shift ? this.svc.clockOut() : this.svc.clockIn()) });
    this.statsEl = h('div', { class: 'hl-stats' });
    const top = h('div', { class: 'hl-top d98-raised' }, this.lamp, this.stateEl, this.clockBtn, this.statsEl);
    // left
    this.portraitHolder = h('div');
    this.cardInfo = h('div');
    this.card = h('div', { class: 'hl-card' }, this.portraitHolder, this.cardInfo);
    this.wave = h('canvas', { class: 'hl-wave', width: 170, height: 34 });
    this.answerBtn = h('button', { class: 'd98-btn hl-answer', onclick: () => this.svc.answer() }, 'Answer');
    this.hangBtn = h('button', { class: 'd98-btn hl-hang', onclick: () => this.svc.hangup() }, 'Hang up');
    this.traceEl = h('div', { class: 'hl-trace', style: { display: 'none' } }, h('i'), h('span'));
    this.timerEl = h('div', { style: { fontFamily: 'VT323, monospace', fontSize: '16px', textAlign: 'center' } });
    const left = h('div', { class: 'hl-left' }, this.card, this.wave, h('div', { class: 'hl-btns' }, this.answerBtn, this.hangBtn), this.traceEl, this.timerEl);
    // right
    this.tabsEl = h('div', { class: 'd98-tabs' });
    this.panel = h('div', { class: 'd98-tabpanel' });
    this.note = h('div', { class: 'hl-note', style: { display: 'none' } });
    const right = h('div', { class: 'hl-right' }, this.tabsEl, this.panel, this.note);
    b.append(h('div', { class: 'hl' }, top, h('div', { class: 'hl-main' }, left, right)));
    this.buildTabs();
  }
  buildTabs() {
    this.tabsEl.innerHTML = '';
    for (const [id, label] of [['call', 'Call'], ['kb', 'Knowledge Base'], ['sb', 'Switchboard'], ['acct', 'Account Tool']]) {
      this.tabsEl.appendChild(h('button', { class: 'd98-tab' + (this.tab === id ? ' on' : ''), onclick: () => this.setTab(id) }, label));
    }
  }
  setTab(id) { this.tab = id; this.comp.audio('os.press', 0.25); this.buildTabs(); this.renderPanel(); }
  onChange(what) {
    if (what === 'ring' && this.tab !== 'call') { this.tab = 'call'; this.buildTabs(); }
    if (what === 'line' || what === 'node' || what === 'options' || what === 'choice' || what === 'input' || what === 'tool' || what === 'end' || what === 'call' || what === 'clear' || what === 'state' || what === 'ring' || what === 'missed') this.render();
  }
  onArgs() {}
  onClose() { this.off?.(); }
  onKey(e) {
    if (this.tab !== 'call' || e.target.tagName === 'INPUT') return false;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) {
      const opts = this.svc.options;
      const ch = opts?.choices[n - 1]; if (ch) { this.svc.choose(ch.i); return true; }
    }
    if (e.key === ' ' || e.key === 'Enter') { if (this.svc.ringing) { this.svc.answer(); return true; } this.svc.skipLine(); return true; }
    return false;
  }

  render() {
    const s = this.svc, c = s.call, g = this.comp.game;
    // status
    let state = 'OFF SHIFT', lamp = '';
    if (s.ringing) { state = 'RINGING'; lamp = 'ring'; }
    else if (c && !c.ended) { state = 'ON CALL'; lamp = 'call'; }
    else if (s.shift) { state = s.hoursOpen ? 'AVAILABLE' : 'LINES CLOSED'; lamp = 'on'; }
    else if (s.complete) state = 'SHIFT COMPLETE';
    this.lamp.className = 'hl-lamp ' + lamp; this.stateEl.textContent = state;
    this.clockBtn.textContent = s.shift ? 'Clock Out' : 'Clock In';
    this.clockBtn.disabled = (s.shift && c && !c.ended) || (!s.shift && s.complete);
    const total = s.dayCalls.length;
    this.statsEl.innerHTML = '';
    this.statsEl.append(
      h('span', {}, 'Day ', h('b', {}, String(g.state?.day ?? 1))),
      h('span', {}, 'Calls ', h('b', {}, `${s.doneCount}/${total}`)),
      h('span', {}, 'Rating ', h('b', {}, s.avgRating ? s.avgRating.toFixed(1) + '★' : '—')),
      h('span', {}, 'Today ', h('b', {}, money(s.earned[s.day] || 0))));
    // card
    const def = s.ringing || c?.def;
    this.portraitHolder.innerHTML = '';
    if (def) {
      const pc = h('canvas', { width: 32, height: 32 }); pc.getContext('2d').drawImage(portrait(def.portrait, def.id), 0, 0);
      this.portraitHolder.appendChild(pc);
      this.cardInfo.innerHTML = '';
      this.cardInfo.append(h('div', { class: 'nm' }, def.name), h('div', {}, def.number), h('div', { class: 'dim' }, def.location), h('div', { class: def.number === '555-1407' ? 'warn' : '' }, 'RE: ' + def.topic));
    } else {
      const pc = h('canvas', { width: 32, height: 32 }); const x = pc.getContext('2d'); x.fillStyle = '#001a00'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#2a5'; x.font = '8px monospace'; x.fillText('L24', 9, 19);
      this.portraitHolder.appendChild(pc);
      this.cardInfo.innerHTML = '';
      this.cardInfo.append(h('div', { class: 'nm' }, 'NO CALLER'), h('div', { class: 'dim' }, s.shift ? (s.hoursOpen ? 'waiting for the next call…' : 'lines open 09:00–23:00') : 'clock in to take calls'), h('div', { class: 'dim' }, fmtClock(g.state?.clock)));
    }
    this.answerBtn.disabled = !s.ringing; this.answerBtn.classList.toggle('ring', !!s.ringing);
    this.hangBtn.disabled = !c; this.hangBtn.textContent = c?.ended ? 'Clear' : 'Hang up';
    this.traceEl.style.display = c?.def.trace ? '' : 'none';
    // note
    const hint = c?.hint || (!c && !s.shift && (g.state?.day ?? 1) === 1 && !s.doneCount ? 'Morning! Clock in when you\'re ready. Lines open at 9. Don\'t keep callers waiting — I can see the logs. — D.' : null);
    if (hint && !this.dismissed?.has(hint)) {
      this.note.style.display = ''; this.note.innerHTML = '';
      this.note.append(h('span', { html: hint }), h('span', { class: 'x', onclick: () => { (this.dismissed ||= new Set()).add(hint); if (c) c.hint = null; this.render(); } }, '×'));
    } else this.note.style.display = 'none';
    // Tool tabs keep their inputs; only the call tab follows the conversation live.
    if (this.tab === 'call' || !this.panel.firstChild) this.renderPanel();
  }

  renderPanel() {
    const p = this.panel; p.innerHTML = ''; this.lineEls = null;
    if (this.tab === 'call') this.renderCall(p);
    else if (this.tab === 'kb') this.renderKB(p);
    else if (this.tab === 'sb') this.renderSB(p);
    else this.renderAcct(p);
  }
  renderCall(p) {
    const s = this.svc, c = s.call;
    if (!c) {
      let big = 'Off shift', small = 'Press Clock In to start taking calls.';
      if (s.ringing) { big = '☎ INCOMING CALL'; small = `${s.ringing.name} — ${s.ringing.number}. Press Answer (or Space).`; }
      else if (s.complete) { big = 'Shift complete'; small = `All of today's calls are done. Earned ${money(s.earned[s.day] || 0)}. Go eat something. In a bowl.`; }
      else if (s.shift && !s.hoursOpen) { big = 'Lines closed'; small = 'LIFELINE 24 lines are open 09:00–23:00.'; }
      else if (s.shift) { big = 'Waiting for calls…'; small = 'Calls will ring through here. You can use other programs while you wait.'; }
      if (s.lastMissed && !s.ringing && s.shift) small += ` (Missed: ${s.lastMissed.name}.)`;
      p.appendChild(h('div', { class: 'hl-idle' }, h('div', {}, h('big', {}, big), small)));
      return;
    }
    const tr = h('div', { class: 'hl-transcript', onclick: () => s.skipLine() });
    this.lineEls = [];
    for (const e of c.transcript) {
      const el = this.lineEl(e); tr.appendChild(el.el); this.lineEls.push(el);
    }
    p.appendChild(tr); this.tr = tr;
    requestAnimationFrame(() => (tr.scrollTop = tr.scrollHeight));
    if (c.ended && c.result && !c.steps.length && !c.speaking) {
      const r = c.result;
      p.appendChild(h('div', { class: 'hl-await' },
        r.rating ? h('span', { class: 'hl-stars' }, '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)) : 'Call ended.', ' ',
        r.rating ? `Rated ${r.rating}/5 — ${money(r.pay)}${c.tip ? ` (incl. ${money(c.tip)} tip)` : ''}` : '(not rated)',
        h('button', { class: 'd98-btn', style: { float: 'right', marginTop: '-3px' }, onclick: () => s.hangup() }, 'Clear')));
      return;
    }
    const opts = s.options; if (!opts) return;
    if (opts.await) p.appendChild(h('div', { class: 'hl-await' }, opts.await.tool === 'reset' ? '⏳ Caller is waiting for a reset code → Account Tool → Device Reset.' : '⏳ Waiting for you…'));
    if (opts.input) {
      const inp = h('input', { class: 'd98-input', placeholder: opts.input.prompt });
      const send = () => { if (inp.value.trim()) s.submitInput(inp.value); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
      p.appendChild(h('div', { class: 'hl-inputrow' }, inp, h('button', { class: 'd98-btn', onclick: send }, 'Send')));
      setTimeout(() => inp.focus(), 30);
    }
    const box = h('div', { class: 'hl-choices' });
    opts.choices.forEach((o, k) => {
      const b = h('button', { class: 'd98-btn hl-choice' + (o.ok ? '' : ' locked'), disabled: !o.ok, onclick: () => s.choose(o.i) },
        h('span', { class: 'k' }, `${k + 1}.`), o.ok ? o.text : `${o.text}  ${o.needText || ''}`);
      box.appendChild(b);
    });
    p.appendChild(box);
  }
  lineEl(e) {
    const cls = { caller: 'caller', you: 'you', sys: 'sys', sfx: 'sfx', morse: 'morse' }[e.who] || 'sys';
    const who = e.who === 'caller' ? (this.svc.call?.def.name.split(' ')[0] || 'Caller') + ':' : e.who === 'you' ? 'You:' : '';
    const txt = h('span');
    const el = h('div', { class: 'hl-line ' + cls }, who ? h('span', { class: 'who' }, who) : null, txt);
    txt.textContent = e.full.slice(0, e.shown);
    return { el, txt, e, last: e.shown };
  }
  tick(dt) {
    // typewriter
    if (this.lineEls && this.tab === 'call') {
      const c = this.svc.call;
      if (c && this.lineEls.length < c.transcript.length) { this.render(); return; }
      for (const l of this.lineEls) if (l.e.shown !== l.last) { l.txt.textContent = l.e.full.slice(0, l.e.shown); l.last = l.e.shown; if (this.tr) this.tr.scrollTop = this.tr.scrollHeight; }
    }
    // trace
    const c = this.svc.call;
    if (c?.def.trace) {
      const t = Math.min(100, c.trace);
      this.traceEl.firstChild.style.width = `calc(${t}% - 4px)`;
      this.traceEl.lastChild.textContent = t > 8 ? `LINE TRACE DETECTED ${Math.floor(t)}%` : 'line check...';
    }
    if (c) { const sec = Math.floor(c.t); this.timerEl.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
    else this.timerEl.textContent = this.svc.ringing ? `ringing ${Math.floor(this.svc.ringT)}s` : '';
    this.drawWave(dt);
  }
  drawWave() {
    const cv = this.wave, x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.fillStyle = '#001a00'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#0a3a0a'; for (let i = 0; i < W; i += 10) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, H); x.stroke(); }
    const c = this.svc.call, sp = c?.speaking, t = performance.now() / 1000;
    let amp = 0.04, style = 'voice';
    if (this.svc.ringing) amp = 0.5 * (Math.sin(t * 20) > 0 ? 1 : 0.2);
    if (sp && !sp.sfx) amp = sp.who === 'you' ? 0.35 : 0.8;
    if (sp?.sfx) { amp = 0.6; style = 'sfx'; }
    const voice = c?.def.voice;
    x.strokeStyle = sp?.who === 'you' ? '#7fd7ff' : '#4f4'; x.lineWidth = 1; x.beginPath();
    for (let i = 0; i < W; i++) {
      let v;
      if (style === 'sfx') v = Math.sign(Math.sin(i * 0.9 + t * 30)) * (Math.sin(t * 8 + i * 0.05) > 0 ? 0.6 : 0.05);
      else if (voice === 'ghost') v = Math.sin(i * 0.15 + t * 5) * Math.sin(i * 0.02 + t) * 0.8;
      else if (voice === 'choir') v = (Math.sin(i * 0.2 + t * 7) + Math.sin(i * 0.25 + t * 9) + Math.sin(i * 0.3 + t * 11)) / 3;
      else v = Math.sin(i * 0.5 + t * 25) * Math.sin(i * 0.07 + t * 3) * (0.5 + Math.random() * 0.5);
      const y = H / 2 + v * amp * (H / 2 - 2);
      if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
    }
    x.stroke();
  }

  renderKB(p) {
    const inp = h('input', { class: 'd98-input', placeholder: 'Search the Knowledge Base…', value: this.kbQuery });
    const list = h('div', { class: 'd98-list' });
    const fill = () => {
      list.innerHTML = '';
      for (const a of searchKB(this.kbQuery)) {
        list.appendChild(h('div', { class: 'd98-li' + (a.id === this.kbArticle ? ' sel' : ''), onclick: () => { this.kbArticle = a.id; this.comp.audio('os.press', 0.2); this.renderPanel(); } }, h('span', {}, a.title)));
      }
      if (!list.children.length) list.appendChild(h('div', { class: 'd98-li' }, h('i', {}, 'No articles found.')));
    };
    inp.addEventListener('input', () => { this.kbQuery = inp.value; fill(); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    fill();
    const art = KB.find((a) => a.id === this.kbArticle) || KB[0];
    if (art.learn) this.comp.learn(art.learn);
    p.appendChild(h('div', { class: 'hl-kb' }, h('div', { class: 'hl-kb-left' }, inp, list), h('div', { class: 'hl-article', html: art.html })));
    if (this.kbFocus) setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
    this.kbFocus = true;
  }

  renderSB(p) {
    const s = this.svc;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 420 300');
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    // wood panel + brass plates
    const defs = el('defs', {});
    const grad = el('linearGradient', { id: 'sbw', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#5a3a20' }, grad); el('stop', { offset: 1, 'stop-color': '#2b1a0e' }, grad);
    el('rect', { x: 0, y: 0, width: 420, height: 300, fill: 'url(#sbw)' });
    for (let i = 0; i < 14; i++) el('path', { d: `M0 ${i * 22 + 5} Q 210 ${i * 22 + (i % 2 ? 12 : -2)} 420 ${i * 22 + 7}`, stroke: 'rgba(0,0,0,0.18)', fill: 'none' });
    el('rect', { x: 18, y: 18, width: 384, height: 264, fill: 'none', stroke: '#c9a227', 'stroke-width': 2, rx: 6 });
    const t = el('text', { x: 210, y: 42, 'text-anchor': 'middle', fill: '#e8c860', 'font-family': 'Special Elite, monospace', 'font-size': 16 }); t.textContent = 'LIFELINE 24 · SWITCHBOARD';
    const caller = { x: 80, y: 160 };
    el('rect', { x: 40, y: 190, width: 80, height: 22, fill: '#c9a227', rx: 3 });
    const lt = el('text', { x: 80, y: 205, 'text-anchor': 'middle', 'font-family': 'Pixelify Sans, sans-serif', 'font-size': 11, fill: '#2b1a0e' }); lt.textContent = 'LINE 1';
    el('circle', { cx: caller.x, cy: caller.y, r: 13, fill: '#111', stroke: '#c9a227', 'stroke-width': 3 });
    const live = s.call && !s.call.ended;
    el('circle', { cx: caller.x, cy: caller.y - 26, r: 5, fill: live ? '#ff3030' : '#3a0a0a' });
    const jacks = DEPTS.map((d, i) => ({ d, x: 230 + (i % 2) * 110, y: 90 + Math.floor(i / 2) * 70 }));
    for (const j of jacks) {
      el('rect', { x: j.x - 46, y: j.y + 16, width: 92, height: 18, fill: '#c9a227', rx: 3 });
      const tx = el('text', { x: j.x, y: j.y + 29, 'text-anchor': 'middle', 'font-family': 'Pixelify Sans, sans-serif', 'font-size': 10, fill: '#2b1a0e' }); tx.textContent = j.d;
      j.c = el('circle', { cx: j.x, cy: j.y, r: 11, fill: '#111', stroke: '#c9a227', 'stroke-width': 3 });
    }
    const cable = el('path', { d: '', stroke: '#b01818', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
    const plug = el('rect', { x: caller.x - 6, y: caller.y - 6, width: 12, height: 12, fill: '#ddd', stroke: '#333', rx: 2, style: 'cursor:grab' });
    const msg = h('div', { style: { padding: '4px 2px 0', minHeight: '20px' } }, live ? 'Drag the red plug from LINE 1 into a department jack.' : 'No caller on LINE 1.');
    const setCable = (x, y) => {
      const mx = (caller.x + x) / 2, my = Math.max(caller.y, y) + 40 + Math.abs(x - caller.x) * 0.1;
      cable.setAttribute('d', `M${caller.x} ${caller.y} Q ${mx} ${my} ${x} ${y}`);
      plug.setAttribute('x', x - 6); plug.setAttribute('y', y - 6);
    };
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 420, y: ((e.clientY - r.top) / r.height) * 300 }; };
    plug.addEventListener('pointerdown', (e) => {
      if (!live) { this.comp.audio('os.error', 0.3); return; }
      plug.setPointerCapture(e.pointerId); this.comp.audio('os.drag', 0.4);
      const mv = (ev) => { const q = toSvg(ev); setCable(q.x, q.y); const near = jacks.find((j) => Math.hypot(j.x - q.x, j.y - q.y) < 22); jacks.forEach((j) => j.c.setAttribute('fill', j === near ? '#3a3a0a' : '#111')); };
      const up = (ev) => {
        plug.removeEventListener('pointermove', mv); plug.removeEventListener('pointerup', up);
        const q = toSvg(ev); const near = jacks.find((j) => Math.hypot(j.x - q.x, j.y - q.y) < 22);
        if (near) {
          setCable(near.x, near.y); this.comp.audio('os.snap', 0.6);
          const res = s.transfer(near.d); msg.textContent = res.msg;
          setTimeout(() => { setCable(caller.x, caller.y); cable.setAttribute('d', ''); }, 1600);
        } else { setCable(caller.x, caller.y); cable.setAttribute('d', ''); this.comp.audio('os.drop', 0.3); }
      };
      plug.addEventListener('pointermove', mv); plug.addEventListener('pointerup', up);
    });
    p.appendChild(h('div', { class: 'hl-sb' }, svg)); p.appendChild(msg);
  }

  renderAcct(p) {
    const s = this.svc;
    const num = h('input', { class: 'd98-input', placeholder: '555-0000', value: this.lastNum || (s.call?.def.number?.match(/^\d{3}-\d{4}$/) ? '' : '') , style: { width: '120px' } });
    const rec = h('div', { class: 'hl-record' });
    const show = () => {
      const r = this.lookupRec;
      rec.textContent = r === undefined ? 'Enter a phone number and press Lookup.' : !r ? `NO RECORD FOUND FOR ${this.lastNum}` :
        `ACCOUNT ${r.num}\nNAME ..... ${r.name}\nADDRESS .. ${r.addr}\nPLAN ..... ${r.plan}\nSTATUS ... ${r.status}\n\n${r.notes}`;
      if (r && /DECEASED|GOVERNMENT|CLASSIFIED/.test(r.status)) rec.style.color = '#ff8080'; else rec.style.color = '';
    };
    const go = () => { this.lastNum = num.value; this.lookupRec = s.lookup(num.value); show(); };
    num.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    if (this.lookupRec === null && this.lastNum === undefined) this.lookupRec = undefined;
    show();
    const dev = h('input', { class: 'd98-input', placeholder: 'e.g. FR-4471-Q', style: { width: '120px' } });
    const code = h('input', { class: 'd98-input', placeholder: 'reset code', style: { width: '120px', textTransform: 'uppercase' } });
    const out = h('div', { style: { minHeight: '16px' } }, this.resetMsg);
    for (const i of [dev, code]) i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') push(); });
    const push = () => { const r = s.pushCode(code.value); this.resetMsg = r.msg; out.textContent = r.msg; out.style.color = r.ok ? '#060' : '#900'; };
    p.appendChild(h('div', { class: 'hl-acct' },
      h('div', { class: 'd98-group' }, h('span', { class: 'lg' }, 'Customer Lookup'),
        h('div', { class: 'd98-row' }, 'Phone:', num, h('button', { class: 'd98-btn', onclick: go }, 'Lookup')), h('div', { style: { height: '6px' } }), rec),
      h('div', { class: 'd98-group' }, h('span', { class: 'lg' }, 'Device Reset'),
        h('div', { class: 'd98-row' }, 'Device:', dev, 'Code:', code), h('div', { style: { height: '6px' } }),
        h('div', { class: 'd98-row' }, h('button', { class: 'd98-btn', onclick: push }, 'Push Code'), out))));
  }
}
