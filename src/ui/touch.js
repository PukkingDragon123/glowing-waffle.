// Touch controls for phones and tablets. Nothing here plays the game: it
// writes virtual keys, mouse buttons, a move axis and look deltas into
// G.input, so the controller, interaction, desk, menus and choices all run
// unchanged. Left thumb: a floating stick (run at the rim). Right side: drag
// to look, tap to use what is under the dot. Buttons appear only when the
// prompt offers something, and fade when you leave them alone.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { COARSE } from '../core/settings.js';
import { W as SW, H as SH } from '../computer/os.js';
import { clamp } from '../core/util.js';

const R = 56;                  // stick radius, CSS px
const TAP_MS = 300, TAP_PX = 12;
const LOOK = 1.6;              // a thumb travels less than a mouse
const HOLD_MS = 380;           // desk: press and hold to drag
// prompt key -> how its button behaves: tap (one press), hold (held while pressed),
// swipe (held, and dragging the button itself looks / moves / rotates)
const KEYS = {
  E: ['KeyE', 'hold', 'a'], F: ['KeyF', 'tap', 'a'], LMB: [0, 'swipe', 'a'], W: ['KeyW', 'tap', 'a'],
  RMB: [2, 'click', 'b'], R: ['KeyR', 'swipe', 'b'], G: ['KeyG', 'tap', 'b'], Q: ['KeyQ', 'tap', 'b'],
};
const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; if (parent) parent.appendChild(e); return e; };

export class Touch {
  constructor(canvas) {
    this.canvas = canvas; this.on = false;
    this.ptrs = new Map(); this.stick = null; this.cursor = null; this.click = false;
    this.ray = new THREE.Raycaster(); this.v2 = new THREE.Vector2();
    this.idleT = 0; this.sig = ''; this.walked = false;
    this.build();
    canvas.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e, false));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    // the first touch turns this on; a real mouse click on a fine-pointer device turns it off
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.enable(true); else if (e.pointerType === 'mouse' && this.on && !COARSE) this.enable(false); }, true);
    // no pinch zoom, no double-tap zoom, no long-press menu
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => { if (this.on) e.preventDefault(); }, { passive: false });
    G.input.hooks.push(() => this.frame());
    if (COARSE) this.enable(true);
  }

  enable(v) {
    if (v === this.on) return;
    this.on = v; G.input.touch = v;
    document.body.classList.toggle('touch', v);
    if (v) {
      // ask for the notch area so the safe-area insets mean something
      const m = document.querySelector('meta[name=viewport]');
      if (m && !/viewport-fit/.test(m.content)) m.content += ', viewport-fit=cover';
      if (G.input.locked) G.input.unlock();
    } else this.release();
  }
  // go fullscreen from a tap where the browser lets us (not in a sandboxed frame, not on iPhone)
  fullscreen() {
    const d = document.documentElement;
    if (!this.on || document.fullscreenElement || !d.requestFullscreen) return;
    try { const p = d.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refused */ }
  }

  // ---------------------------------------------------------- DOM
  build() {
    const root = this.root = el('div', '', document.body); root.id = 'touch';
    const st = this.stickEl = el('div', 'stick', root); this.knob = el('i', '', st);
    const pad = el('div', 'pad', root);
    this.cols = { b: el('div', 'col b', pad), a: el('div', 'col a', pad) };
    this.btns = {};
    for (const [k, [code, kind, col]] of Object.entries(KEYS)) this.btns[k] = this.button(this.cols[col], k, code, kind);
    const top = el('div', 'top', root);
    this.slots = [0, 1].map((i) => this.button(top, 'slot' + i, 'Digit' + (i + 1), 'tap'));
    this.crouch = this.button(top, 'crouch', 'KeyC', 'tap', 'crouch');
    this.pause = this.button(top, 'pause', 'Escape', 'tap', 'II');
    // at the desk: summon the phone's keyboard, stand up
    this.kbdBtn = this.button(this.cols.a, 'kbd', null, 'tap', 'keyboard');
    this.standBtn = this.button(this.cols.a, 'stand', 'Escape', 'tap', 'stand up');
    // a hidden field: the native keyboard types into it and its edits become key presses for Glass 98
    const k = this.kbd = el('input', '', document.body); k.id = 'touch-kbd';
    Object.assign(k, { type: 'text', autocomplete: 'off', spellcheck: false, enterKeyHint: 'enter' });
    k.setAttribute('autocorrect', 'off'); k.setAttribute('autocapitalize', 'off'); k.setAttribute('aria-label', 'keyboard');
    const SENT = '  ';
    k.value = SENT; let prev = SENT;
    k.addEventListener('input', (e) => {
      const v = k.value, inp = G.input; let i = 0;
      while (i < v.length && i < prev.length && v[i] === prev[i]) i++;
      if (inp.captureText) { for (let n = prev.length - i; n > 0; n--) inp.text.push('#Backspace'); for (const ch of v.slice(i)) inp.text.push(ch === '\n' ? '#Enter' : ch); }
      prev = v;
      if (!e.isComposing && (v.length < 2 || v.length > 40)) { k.value = prev = SENT; }
    });
    k.addEventListener('blur', () => { k.value = prev = SENT; this.kbdBtn.classList.remove('lit'); });
  }

  button(parent, id, code, kind, text) {
    const b = el('button', 'tb', parent); b.dataset.id = id; b.type = 'button';
    b.innerHTML = '<span></span>'; if (text) b.firstChild.textContent = text;
    b.hidden = true;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); this.wake();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
      const inp = G.input;
      b.classList.add('down');
      this.ptrs.set(e.pointerId, { role: 'btn', b, id, code, kind, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 });
      if (kind === 'hold') inp.vkey(code, true);
      else if (kind === 'swipe') { if (typeof code === 'number') inp.vbutton(code, true); else inp.vkey(code, true); }
      else if (kind === 'click') inp.vclick(code);
      else if (code) inp.vtap(code);
    });
    // the keyboard needs a real click to be allowed to open
    if (id === 'kbd') b.addEventListener('click', () => { const k = this.kbd; if (document.activeElement === k) k.blur(); else { k.focus({ preventScroll: true }); b.classList.add('lit'); } });
    return b;
  }

  // ---------------------------------------------------------- pointers
  down(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); this.enable(true); this.wake();
    const x = e.clientX, y = e.clientY;
    const p = { id: e.pointerId, x0: x, y0: y, x, y, t0: performance.now(), moved: 0, role: 'look' };
    const st = G.state, inp = G.input;
    if (st === 'menu') { p.role = 'menu'; inp.mx = x; inp.my = y; }
    else if (st === 'play' && G.desk && G.desk.seated) { p.role = 'desk'; this.deskDown(p); }
    else if (st === 'play' && x < innerWidth * 0.45 && !this.stick) { p.role = 'stick'; this.stick = p; this.stickEl.classList.add('on'); this.place(p); }
    this.ptrs.set(e.pointerId, p);
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
  }
  move(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    if (e.cancelable) e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y, inp = G.input;
    p.x = e.clientX; p.y = e.clientY;
    p.moved = Math.max(p.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
    if (p.role === 'look' || (p.role === 'btn' && p.kind === 'swipe')) { inp.mdx += dx * LOOK; inp.mdy += dy * LOOK; }
    else if (p.role === 'menu') { inp.mx = p.x; inp.my = p.y; }
    else if (p.role === 'desk') this.deskMove(p, dx, dy);
    else if (p.role === 'stick') this.place(p);
  }
  up(e, cancel) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    this.ptrs.delete(e.pointerId);
    const inp = G.input, tap = !cancel && p.moved < TAP_PX && performance.now() - p.t0 < TAP_MS;
    if (p.role === 'btn') {
      p.b.classList.remove('down');
      if (p.kind === 'hold') inp.vkey(p.code, false);
      else if (p.kind === 'swipe') { if (typeof p.code === 'number') inp.vbutton(p.code, false); else inp.vkey(p.code, false); }
      return;
    }
    if (p.role === 'stick') { this.stick = null; this.stickEl.classList.remove('on'); this.stickEl.style.transform = ''; inp.axis.x = inp.axis.y = 0; inp.vkey('ShiftLeft', false); }
    if (p.role === 'menu' && !cancel && p.moved < 24) inp.bPressed[0] = true;
    if (p.role === 'desk') this.deskUp(p, tap, cancel);
    // tap the world: use whatever is under the dot (a choice on screen wants its own tap)
    if ((p.role === 'look' || p.role === 'stick') && tap && G.state === 'play' && !(G.hud && G.hud.choice)) inp.vtap('KeyE');
  }
  release() {
    const inp = G.input;
    for (const p of this.ptrs.values()) if (p.b) p.b.classList.remove('down');
    this.ptrs.clear(); this.stick = null; this.stickEl.classList.remove('on'); this.stickEl.style.transform = '';
    inp.axis.x = inp.axis.y = 0; inp.vdown.clear(); for (let b = 0; b < 3; b++) inp.vbutton(b, false);
  }

  // the floating stick: the base sits where the thumb landed and follows it if it wanders off
  place(p) {
    let dx = p.x - p.x0, dy = p.y - p.y0, d = Math.hypot(dx, dy);
    if (d > R * 1.4) { const k = (d - R * 1.4) / d; p.x0 += dx * k; p.y0 += dy * k; dx = p.x - p.x0; dy = p.y - p.y0; d = R * 1.4; }
    const m = Math.min(1, d / R), live = m > 0.14 ? (m - 0.14) / 0.86 : 0;
    const inp = G.input;
    inp.axis.x = d > 0 ? (dx / d) * live : 0; inp.axis.y = d > 0 ? (-dy / d) * live : 0;
    // pushed to the rim, forward: run
    inp.vkey('ShiftLeft', d >= R * 0.97 && inp.axis.y > 0.55);
    // a firm push also reads as W/A/S/D once: stands you up from a seat, moves through choices
    const dir = m > 0.6 ? (Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'KeyW' : 'KeyS') : (dx > 0 ? 'KeyD' : 'KeyA')) : null;
    if (dir !== p.dir) { if (dir) inp.vtap(dir); p.dir = dir; }
    if (live > 0) this.walked = true;
    this.stickEl.style.transform = `translate(${p.x0 - R}px, ${p.y0 - R}px)`;
    const kx = d > R ? (dx / d) * R : dx, ky = d > R ? (dy / d) * R : dy;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  // ---------------------------------------------------------- the desk
  // where a screen point lands on the Glass 98 canvas, through the CRT's curve
  screenPoint(x, y) {
    const d = G.desk; if (!d || !d.screen) return null;
    this.v2.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.v2, G.camera);
    const h = this.ray.intersectObject(d.screen, false)[0];
    if (!h || !h.uv) return null;
    let u = h.uv.x * 2 - 1, v = h.uv.y * 2 - 1;
    const ox = Math.abs(v) / 5.5, oy = Math.abs(u) / 4.5;
    u = (u + u * ox * ox) * 0.5 + 0.5; v = (v + v * oy * oy) * 0.5 + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { x: u * SW, y: (1 - v) * SH };
  }
  // on the screen the cursor jumps under the finger; off it, the finger is a trackpad
  deskDown(p) {
    const hit = this.screenPoint(p.x, p.y);
    p.abs = !!hit; if (hit) this.cursor = hit;
    p.two = [...this.ptrs.values()].some((q) => q.role === 'desk');
    if (p.two) for (const q of this.ptrs.values()) if (q.role === 'desk') { q.two = true; clearTimeout(q.holdT); }
    // press and hold: the button goes down and stays down while you drag
    else p.holdT = setTimeout(() => { if (this.ptrs.get(p.id) === p && p.moved < TAP_PX) { p.drag = true; G.input.vbutton(0, true); if (navigator.vibrate) navigator.vibrate(8); } }, HOLD_MS);
  }
  deskMove(p, dx, dy) {
    if (p.two) {
      // two fingers scroll
      p.acc = (p.acc || 0) + dy;
      while (Math.abs(p.acc) > 22) { G.input.wheel -= Math.sign(p.acc); p.acc -= Math.sign(p.acc) * 22; }
      return;
    }
    if (p.abs) { const hit = this.screenPoint(p.x, p.y); if (hit) this.cursor = hit; }
    else { const os = G.os, c = this.cursor || { x: os.mx, y: os.my }; this.cursor = { x: clamp(c.x + dx * 1.3, 0, SW - 1), y: clamp(c.y + dy * 1.3, 0, SH - 1) }; }
  }
  deskUp(p, tap, cancel) {
    clearTimeout(p.holdT);
    if (p.drag) G.input.vbutton(0, false);
    else if (tap && !p.two && !cancel) this.click = true;
  }

  // ---------------------------------------------------------- per frame
  wake() { this.idleT = 0; this.root.classList.remove('idle'); }
  frame() {
    if (!this.on) return;
    const inp = G.input, dt = G.dt || 1 / 60;
    // steer the Glass 98 cursor to the finger, then click there
    if (G.desk && G.desk.seated && G.os) {
      const os = G.os, sens = 0.5 + G.settings.v.sensitivity * 0.1;
      if (this.cursor) { inp.mdx += (this.cursor.x - os.mx) / sens; inp.mdy += (this.cursor.y - os.my) / sens; this.cursor = null; }
      if (this.click) { this.click = false; inp.vclick(0); }
    } else { this.cursor = null; this.click = false; if (document.activeElement === this.kbd) this.kbd.blur(); }
    // which buttons: whatever the prompt offers right now
    const st = G.state, play = st === 'play' && !(G.pause && G.pause.open), seated = play && G.desk && G.desk.seated;
    const acts = play && !seated && G.hud ? G.hud.actions || [] : [];
    const lab = {};
    for (const a of acts) if (a.key && a.label && KEYS[a.key] && !(a.key in lab)) lab[a.key] = a.label;
    const pl = G.player, inv = pl && pl.inv;
    if (play && !seated && inv && inv.hand && !lab.RMB) lab.RMB = 'Throw';
    let sig = st + (seated ? 's' : '');
    for (const [k, b] of Object.entries(this.btns)) {
      const held = b.classList.contains('down'), text = lab[k] || (held ? b.firstChild.textContent : '');
      sig += k + text;
      this.show(b, !!text);
      if (text && b.firstChild.textContent !== text) b.firstChild.textContent = text;
    }
    const walk = play && !seated && pl && pl.ctrl && pl.ctrl.enabled;
    this.show(this.crouch, walk); if (walk) this.crouch.classList.toggle('lit', !!pl.ctrl.crouched);
    this.slots.forEach((b, i) => { const it = walk && inv && inv.slots[i]; this.show(b, !!it); if (it) { const t = (it.label || '').toLowerCase(); if (b.firstChild.textContent !== t) b.firstChild.textContent = t; } });
    this.show(this.pause, play && !seated);
    this.show(this.kbdBtn, seated); this.show(this.standBtn, seated);
    this.root.classList.toggle('hint', walk && !this.walked && !this.stick);
    // something new on offer wakes them; left alone they fade
    if (sig !== this.sig) { this.sig = sig; this.wake(); }
    if ((this.idleT += dt) > 4 && !this.ptrs.size) this.root.classList.add('idle');
  }
  show(b, v) { if (b.hidden === !v) return; b.hidden = !v; if (!v) b.classList.remove('down'); }
}
