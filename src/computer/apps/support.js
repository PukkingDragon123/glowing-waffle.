// Blueberry Support — the agent console. Takes timed calls (spoken by the
// formant synth through the phone line), lets you search the support manual
// and run account tools, scores the call, and slowly stops making sense.
import { G, emit } from '../../core/globals.js';
import { C } from '../ui.js';
import { icon } from '../icons.js';
import { textWidth, wrap } from '../font.js';
import { CALLS, TOOLS, toolResult } from '../content/calls.js';
import { KB, searchKB } from '../content/kb.js';
import { pick, rand } from '../../core/util.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

export class SupportApp {
  constructor(os) {
    this.os = os;
    this.needsNet = true;
    this.status = 'Not Ready';
    this.tab = { tab: 0 };
    this.call = null;
    this.q = { value: '' }; this.results = KB.slice(0, 6); this.resSel = { sel: -1 }; this.article = null; this.artScroll = {};
    this.log = []; this.logState = {}; this.toolLog = []; this.toolState = {};
    this.tool = null;
    this.nextCallT = 12;
    this.handledToday = 0; this.scoreToday = 0; this.csat = [4, 4, 5];
    this.dayIndex = 0; this.day = G.story.day;
  }
  title() { return G.story.day >= 6 ? 'Subject Support - Agent Console' : 'Blueberry Support - Agent Console'; }
  menu() {
    return [
      { label: 'File', items: [{ label: 'Log Off Agent', action: () => this.setStatus('Not Ready') }, { sep: true }, { label: 'Exit', action: () => this.os.close(this.os.windows.find((w) => w.app === 'support')) }] },
      { label: 'Call', items: [{ label: 'Answer', action: () => this.answer() }, { label: 'Hang Up', action: () => this.hangup() }] },
      { label: 'Tools', items: TOOLS.map((t) => ({ label: t.label, action: () => this.runTool(t.id) })) },
      { label: 'Help', items: [{ label: 'About Blueberry Support...', action: () => this.os.msg({ title: 'About', text: 'Blueberry Support Agent Console 3.2\nBlueberry Pie Online, Inc.\nJersey City, NJ', icon: 'support', buttons: ['OK'] }) }] },
    ];
  }
  newDay(day) { this.day = day; this.dayIndex = 0; this.handledToday = 0; this.scoreToday = 0; this.nextCallT = rand(10, 18); this.call = null; this.log = []; this.toolLog = []; }
  get todays() { return CALLS[G.story.day] || []; }
  get remaining() { return this.todays.length - this.dayIndex; }
  setStatus(s) { this.status = s; if (s === 'Available') { this.nextCallT = Math.min(this.nextCallT, rand(6, 14)); emit('agentAvailable'); } }
  onDisconnect() { if (this.call && !this.call.def.strange) this.endCall('dropped'); this.status = 'Not Ready'; }
  onPowerOff() { this.onDisconnect(); }

  // ---------------------------------------------------------- call engine
  update(dt) {
    const d = G.director;
    if (this.day !== G.story.day) this.newDay(G.story.day);
    const workHours = !d || (d.hour >= 8.75 && d.hour < 18.5) || G.story.day >= 6;
    if (!this.call && this.status === 'Available' && this.os.connected && this.remaining > 0 && workHours && !(G.phone && G.phone.busy)) {
      this.nextCallT -= dt;
      if (this.nextCallT <= 0) this.incoming(this.todays[this.dayIndex]);
    }
    const c = this.call;
    if (!c) return;
    if (c.state === 'ringing') {
      c.ringT += dt;
      if (c.ringT > 40) { this.log.push({ text: '*** Missed call from ' + c.def.name + ' ***', color: '#800000' }); this.call = null; this.dayIndex++; this.nextCallT = 25; G.phone && G.phone.stopRing(); emit('callMissed'); }
      return;
    }
    if (c.state !== 'active') return;
    c.t += dt;
    // speak queued lines
    if (c.speaking) { c.speakT -= dt; if (c.speakT <= 0) { c.speaking = false; c.gap = 0.35; } }
    else if (c.gap > 0) c.gap -= dt;
    else if (c.lines.length) this.speakNext();
    else if (c.endPending) this.endCall(c.endPending);
    // impatience
    const def = c.def;
    if (!def.noTimer && !c.endPending) {
      if (c.t > def.target && !c.warned) { c.warned = true; c.lines.push({ t: pick(['Hello? Are you still there?', 'Is anybody there?', 'I have been on hold for a long time.']) }); }
      if (c.t > def.target * 2) { c.lines.push({ t: 'Forget it. I am calling another company.' }); c.endPending = 'bad'; }
    }
    // tool progress
    if (this.tool) {
      this.tool.t += dt;
      if (this.tool.t >= this.tool.dur) {
        const tr = toolResult(def, this.tool.id);
        this.toolLog.push({ text: '> ' + tr.result, color: '#000080' });
        this.log.push({ text: '[' + TOOLS.find((x) => x.id === this.tool.id).label + '] ' + tr.result, color: '#000080' });
        sfx('ding', { vol: 0.3, bus: 'ui' });
        if (tr.go && c.node && c.node.wait === this.tool.id) this.goNode(tr.go);
        else if (tr.go && c.def.nodes[tr.go]) this.goNode(tr.go);
        this.tool = null;
      }
    }
  }

  incoming(def) {
    if (!def) return;
    this.call = { def, state: 'ringing', ringT: 0, t: 0, lines: [], node: null, score: 0, speaking: false, gap: 0 };
    G.phone && G.phone.ring({ work: true, name: def.name, onAnswer: () => this.answer() });
    this.os.balloon = { text: 'Incoming call: ' + (def.number || 'Unknown'), t: 6 };
    emit('callIncoming', def);
  }
  answer() {
    const c = this.call;
    if (!c || c.state !== 'ringing') return;
    c.state = 'active';
    this.tab.tab = 0;
    G.phone && G.phone.pickUp(true);
    this.log = [{ text: '--- Call connected: ' + c.def.name + ' ' + c.def.number + ' ---', color: '#808080' }];
    this.toolLog = [];
    this.goNode('start');
    emit('callAnswered', c.def);
  }
  goNode(id) {
    const c = this.call; if (!c) return;
    const n = c.def.nodes[id];
    if (!n) return;
    c.node = n; c.nodeId = id;
    for (const l of n.say || []) c.lines.push({ t: l });
    if (n.end) { c.endPending = n.end; if (n.event) emit(n.event); }
    if (n.wait) c.waitHint = n.hint;
  }
  speakNext() {
    const c = this.call;
    const l = c.lines.shift();
    const strange = c.def.strange || (c.node && c.node.end === 'strange' && c.def.nodes[c.nodeId].strangeLine !== undefined && c.def.nodes[c.nodeId].say.indexOf(l.t) >= c.def.nodes[c.nodeId].strangeLine);
    const voice = l.voice || c.def.voice;
    const h = G.audio ? G.audio.speak(l.t, { voice, phone: true, vol: 0.95, pos: G.phone ? G.phone.earPos() : null, reverse: l.reverse }) : { dur: l.t.length * 0.06 };
    c.speaking = true; c.speakT = Math.max(0.6, h.dur);
    c.handle = h;
    this.log.push({ text: c.def.name.split(' ')[0] + ': ' + l.t, color: strange ? '#800000' : '#000' });
    G.hud.say(l.t, { who: c.def.name, cls: strange ? 'strange' : 'voice', dur: Math.max(2.2, h.dur + 0.6) });
  }
  choose(opt) {
    const c = this.call; if (!c || c.speaking || c.lines.length) return;
    this.log.push({ text: 'You: ' + opt.t, color: '#004000' });
    c.score += opt.score || 0;
    sfx('click', { vol: 0.2, bus: 'ui' });
    this.goNode(opt.go);
  }
  hangup() {
    const c = this.call; if (!c || c.state !== 'active') return;
    if (c.def.hangupLock && c.t < c.def.hangupLock) { this.log.push({ text: '[Hang Up] ERROR: line in use.', color: '#800000' }); sfx('error', { vol: 0.4, bus: 'ui' }); return; }
    this.endCall(c.endPending || (c.def.strange ? 'strange' : 'hungup'));
  }
  endCall(result) {
    const c = this.call; if (!c) return;
    if (c.handle && result === 'hungup') c.handle.stop(0.05);
    this.call = null;
    this.dayIndex++;
    this.handledToday++;
    G.story.callsDone = (G.story.callsDone || 0) + 1;
    const good = result === 'good' ? Math.max(3, Math.min(5, 3 + c.score)) : result === 'strange' ? 3 : 1;
    this.csat.push(good);
    this.log.push({ text: '--- Call ended (' + (result === 'good' ? 'resolved' : result === 'strange' ? 'disposition: ???' : 'unresolved') + ') ---', color: '#808080' });
    G.phone && G.phone.hangUp(c.def.after);
    this.nextCallT = rand(18, 34);
    emit('callEnded', { def: c.def, result });
  }
  runTool(id) {
    if (this.tool) return;
    const t = TOOLS.find((x) => x.id === id);
    if (!this.call || this.call.state !== 'active') { this.toolLog.push({ text: '> No active call. Tool requires a customer account.', color: '#800000' }); return; }
    this.tool = { id, t: 0, dur: t.time };
    this.toolLog.push({ text: '> Running ' + t.label + ' on ' + (this.call.def.account || 'UNKNOWN') + '...' });
    sfx('hdd', { vol: 0.35, pos: G.desk && G.desk.towerPos });
  }
  doSearch() {
    this.results = searchKB(this.q.value, G.story.day);
    this.resSel.sel = -1;
    if (!this.results.length) this.results = [{ id: '----', title: 'No articles match your search.', body: [] }];
  }

  // ---------------------------------------------------------- UI
  draw(ui, x, y, w, h) {
    const ctx = ui.ctx;
    const c = this.call;
    const day = G.story.day;
    ui.fill(x, y, w, h, C.face);
    // toolbar
    const ringing = c && c.state === 'ringing';
    const active = c && c.state === 'active';
    if (ui.toolButton('sp_ans', x + 4, y + 2, 52, 38, 'Answer', icon('answer', 16), { disabled: !ringing })) this.answer();
    if (ringing && Math.floor(ui.time * 4) % 2) ui.bevel(x + 4, y + 2, 52, 38, 'thinUp', null);
    if (ui.toolButton('sp_hang', x + 58, y + 2, 52, 38, 'Hang Up', icon('hangup', 16), { disabled: !active })) this.hangup();
    ui.vline(x + 114, y + 4, 34, C.shadow); ui.vline(x + 115, y + 4, 34, C.hi);
    ui.text('Status:', x + 122, y + 8);
    const avail = this.status === 'Available';
    if (ui.button('sp_status', x + 122, y + 20, 92, 20, avail ? 'Available' : 'Not Ready', { toggled: avail })) this.setStatus(avail ? 'Not Ready' : 'Available');
    ui.fill(x + 126, y + 26, 7, 7, avail ? '#00a000' : '#c00000');
    // call timer
    ui.bevel(x + 224, y + 6, 120, 32, 'sunken', '#000');
    const t = c && active ? c.t : 0;
    const tt = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const over = c && active && !c.def.noTimer && t > c.def.target;
    ui.text(active ? tt : '--:--', x + 232, y + 10, over ? '#ff4040' : '#00ff40', { bold: true });
    ui.text(active && !c.def.noTimer ? 'target ' + Math.floor(c.def.target / 60) + ':' + String(c.def.target % 60).padStart(2, '0') : active ? 'target --:--' : 'idle', x + 232, y + 23, '#00a020');
    ui.text('Agent: A. Bengrim #0419', x + w - 150, y + 8, C.text, { bold: true });
    ui.text(day >= 5 ? 'Floor: 4B (remote)' : 'Floor: Remote / NJ-04', x + w - 150, y + 22, '#404040');
    // caller panel
    const py = y + 44;
    ui.bevel(x + 2, py, w - 4, 58, 'sunken', '#ffffe8');
    const d = c ? c.def : null;
    const rows = d ? [['Caller', d.name], ['Number', d.number || 'Unknown'], ['Account', d.account || '—']] : [['Caller', ringing ? '' : '(no call)'], ['Number', ''], ['Account', '']];
    const rows2 = d ? [['Plan', d.plan || '—'], ['Modem', d.modem || '—'], ['OS', d.os || '—']] : [['Plan', ''], ['Modem', ''], ['OS', '']];
    rows.forEach(([k, v], i) => { ui.text(k + ':', x + 10, py + 6 + i * 16, '#606060'); ui.text(v, x + 72, py + 6 + i * 16, d && d.strange ? '#800000' : '#000', { bold: i === 0, maxW: 220 }); });
    rows2.forEach(([k, v], i) => { ui.text(k + ':', x + 310, py + 6 + i * 16, '#606060'); ui.text(v, x + 360, py + 6 + i * 16, '#000', { maxW: w - 370 }); });
    if (ringing) { ui.text('INCOMING CALL...', x + 72, py + 6, Math.floor(ui.time * 3) % 2 ? '#c00000' : '#000', { bold: true }); }
    // tabs
    const ty = py + 64;
    ui.tabs('sp_tabs', x + 2, ty, w - 4, ['Call', 'Knowledge Base', 'Account Tools'], this.tab);
    const ay = ty + 24, ah = h - (ay - y) - 22;
    if (this.tab.tab === 0) this.drawCallTab(ui, x + 6, ay, w - 12, ah);
    else if (this.tab.tab === 1) this.drawKB(ui, x + 6, ay, w - 12, ah);
    else this.drawTools(ui, x + 6, ay, w - 12, ah);
    // status bar
    const sy = y + h - 19;
    ui.bevel(x + 2, sy, 200, 18, 'thin');
    ui.text(`Calls today: ${this.handledToday}/${this.todays.length}`, x + 6, sy + 3);
    ui.bevel(x + 204, sy, 160, 18, 'thin');
    const avg = this.csat.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, this.csat.length);
    let stars = ''; for (let i = 0; i < 5; i++) stars += i < Math.round(avg) ? '★' : '☆';
    ui.text('CSAT ' + stars, x + 208, sy + 3);
    ui.bevel(x + 366, sy, w - 368, 18, 'thin');
    ui.text(day >= 5 ? 'Queue: 1 waiting (inside)' : `Queue: ${Math.max(0, this.remaining - (c ? 1 : 0))} waiting`, x + 370, sy + 3, day >= 5 ? '#800000' : '#000');
  }

  drawCallTab(ui, x, y, w, h) {
    const c = this.call;
    const optsH = 3 * 24 + 4;
    ui.textBox('sp_log', x, y, w, h - optsH - 4, this.log.length ? this.log : [{ text: this.status === 'Available' ? 'Waiting for the next call...' : 'Set your status to Available to receive calls.', color: '#808080' }], this.logState, { stick: true });
    const oy = y + h - optsH;
    if (c && c.state === 'active' && c.node && !c.speaking && !c.lines.length && !c.endPending) {
      const opts = c.node.opts || [];
      if (c.node.wait) ui.text('Waiting: ' + (c.waitHint || 'use an account tool'), x + 4, oy + 4, '#000080', { bold: true });
      opts.forEach((o, i) => { if (ui.button('sp_opt' + i + c.nodeId, x, oy + i * 24 + (c.node.wait ? 18 : 0), w, 22, o.t)) this.choose(o); });
      if (c.node.kb && !opts.length) ui.text('Tip: search the Knowledge Base for "' + c.node.kb + '"', x + 4, oy + 4, '#404040');
    } else if (c && c.state === 'active') {
      ui.text(c.speaking ? (c.def.name.split(' ')[0] + ' is talking...') : '...', x + 4, oy + 6, '#808080');
    }
  }

  drawKB(ui, x, y, w, h) {
    ui.text('Search the Support Manual:', x, y + 2);
    if (ui.field('sp_q', x, y + 16, w - 90, 21, this.q)) this.doSearch();
    if (ui.button('sp_search', x + w - 84, y + 16, 84, 21, 'Search', { icon: icon('search', 16) })) this.doSearch();
    const res = ui.list('sp_res', x, y + 42, w, 96, this.results, this.resSel, { draw: (r, rx, ry, rw, rh, sel) => { ui.text(r.id, rx + 4, ry + 2, sel ? '#fff' : '#000080', { bold: true }); ui.text(r.title, rx + 62, ry + 2, sel ? '#fff' : '#000', { maxW: rw - 66 }); } });
    if (res) { this.article = this.results[res.index]; this.artScroll = {}; sfx('pageTurn', { vol: 0.2, bus: 'ui' }); }
    const a = this.article;
    const lines = a ? [{ text: a.id + '  ' + a.title, bold: true }, { text: '' }, ...a.body.map((b) => ({ text: b })), { text: '' }] : [{ text: 'Select an article.', color: '#808080' }];
    ui.textBox('sp_art', x, y + 142, w, h - 142, lines, this.artScroll);
  }

  drawTools(ui, x, y, w, h) {
    const bw = Math.floor((w - 6) / 2);
    TOOLS.forEach((t, i) => {
      const bx = x + (i % 2) * (bw + 6), by = y + Math.floor(i / 2) * 26;
      if (ui.button('sp_tool' + t.id, bx, by, bw, 23, t.label, { icon: icon('tool', 16), disabled: !!this.tool })) this.runTool(t.id);
    });
    const ly = y + 4 * 26 + 6;
    if (this.tool) { ui.text('Working...', x, ly); ui.progress(x + 70, ly - 2, w - 70, 16, this.tool.t / this.tool.dur); }
    ui.textBox('sp_toollog', x, ly + 20, w, h - (ly + 20 - y), this.toolLog.length ? this.toolLog : [{ text: 'Tool output will appear here.', color: '#808080' }], this.toolState, { stick: true });
  }
}
