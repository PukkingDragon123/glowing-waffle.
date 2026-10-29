// Pause / settings / controls overlay (HTML). Opens on Esc during play, or as
// settings from the main menu.
import { G } from '../core/globals.js';
import { DEFAULTS, OPTIONS } from '../core/settings.js';

const $ = (id) => document.getElementById(id);

const ROWS = [
  ['sensitivity', 'MOUSE SENSITIVITY', 1, 10, 1],
  ['invertY', 'INVERT Y', 'bool'],
  ['fov', 'FIELD OF VIEW', 60, 90, 2],
  ['volume', 'VOLUME', 0, 10, 1],
  ['resolution', 'RESOLUTION', 'list'],
  ['ink', 'INK LINES', 0, 10, 1],
  ['paint', 'PAINTERLY', 0, 10, 1],
  ['vhs', 'VHS EFFECT', 0, 10, 1],
  ['grain', 'FILM GRAIN', 0, 10, 1],
  ['wobble', 'VERTEX WOBBLE', 'bool'],
  ['brightness', 'BRIGHTNESS', 0, 10, 1],
  ['headBob', 'HEAD BOB', 'bool'],
  ['subtitles', 'SUBTITLES', 'bool'],
];
const CONTROLS = [
  ['WASD', 'move'], ['MOUSE', 'look'], ['SHIFT', 'run'], ['C', 'crouch'], ['E', 'take / use / hold to pet'], ['F', 'eat / drink / special'],
  ['LEFT MOUSE', 'drag doors, drawers, objects'], ['R / WHEEL', 'rotate / distance while dragging'], ['RIGHT MOUSE', 'throw'], ['Q', 'put in pocket'], ['1 / 2', 'take from pocket'],
  ['G', 'drop'], ['ESC', 'pause / stand up from the desk'],
];

export class Pause {
  constructor() {
    this.el = $('pause'); this.panel = $('pause-panel');
    this.open = false; this.fromMenu = false;
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const act = b.dataset.act;
      G.audio && G.audio.play('click', { vol: 0.25, bus: 'ui' });
      if (act === 'resume') this.close();
      if (act === 'settings') this.showSettings();
      if (act === 'controls') this.showControls();
      if (act === 'menu') { this.close(true); G.menu.open({ intro: false }); }
      if (b.dataset.k) this.adjust(b.dataset.k, +b.dataset.d);
    });
    G.pause = this;
  }
  toggle() { if (this.open) this.close(); else this.show(); }
  show() {
    if (G.state !== 'play') return;
    this.open = true; this.fromMenu = false;
    this.el.hidden = false; this.panel.innerHTML = '';
    for (const id of ['p-resume', 'p-controls', 'p-menu']) $(id).hidden = false;
    G.state = 'paused';
    G.audio && G.audio.suspend && G.audio.suspend();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  openSettings(fromMenu) {
    this.open = true; this.fromMenu = fromMenu;
    this.el.hidden = false;
    $('p-menu').hidden = true; $('p-controls').hidden = false;
    this.showSettings();
  }
  close(silent) {
    this.open = false; this.el.hidden = true; this.panel.innerHTML = '';
    if (this.fromMenu) { this.fromMenu = false; return; }
    if (G.state === 'paused') G.state = 'play';
    G.audio && G.audio.resume && G.audio.resume();
    if (!silent) G.input.lock();
  }
  showSettings() {
    const v = G.settings.v;
    this.panel.innerHTML = '';
    for (const [k, label, a, b] of ROWS) {
      const row = document.createElement('div'); row.className = 'row';
      const l = document.createElement('div'); l.textContent = label;
      const val = document.createElement('div'); val.className = 'val';
      const minus = document.createElement('button'); minus.textContent = '<'; minus.dataset.k = k; minus.dataset.d = -1;
      const plus = document.createElement('button'); plus.textContent = '>'; plus.dataset.k = k; plus.dataset.d = 1;
      const span = document.createElement('span');
      span.textContent = a === 'bool' ? (v[k] ? 'ON' : 'OFF') : a === 'list' ? v[k] + 'p' : String(v[k]);
      val.append(minus, span, plus);
      row.append(l, val);
      this.panel.appendChild(row);
    }
  }
  showControls() {
    this.panel.innerHTML = '';
    const g = document.createElement('div'); g.className = 'ctl';
    for (const [k, d] of CONTROLS) { const a = document.createElement('div'); a.textContent = k; const b = document.createElement('div'); b.textContent = d; g.append(a, b); }
    this.panel.appendChild(g);
  }
  adjust(k, d) {
    const row = ROWS.find((r) => r[0] === k);
    const v = G.settings.v;
    let nv;
    if (row[2] === 'bool') nv = !v[k];
    else if (row[2] === 'list') { const o = OPTIONS[k]; nv = o[(o.indexOf(v[k]) + d + o.length) % o.length]; }
    else nv = Math.max(row[2], Math.min(row[3], v[k] + d * row[4]));
    G.settings.set(k, nv);
    if (k === 'resolution') G.engine.setLowHeight(nv);
    this.showSettings();
  }
}
