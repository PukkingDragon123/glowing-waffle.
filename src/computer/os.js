// "Glass 98": a late-90s desktop OS simulated on a 640x480 canvas that is
// shown on the CRT. Boot (POST + splash), desktop icons, window manager,
// taskbar + start menu, dialogs, dial-up networking, screensaver, shutdown,
// and progressive corruption over the week.
import { G, emit } from '../core/globals.js';
import { UI, C, setTypeSound } from './ui.js';
import { drawText, textWidth, wrap, drawTextScaled, LINE_H } from './font.js';
import { icon, cursorImage } from './icons.js';
import { clamp, rand, pick, chance } from '../core/util.js';

export const W = 640, H = 480;
const TASK_H = 28;
const sfx = (n, o) => G.audio && G.audio.play(n, { bus: 'ui', ...o });

export class OS {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.ui = new UI(this.ctx);
    this.state = 'off'; this.t = 0; this.bootT = 0;
    this.windows = []; this.apps = {}; this.appDefs = {};
    this.mx = W / 2; this.my = H / 2;
    this.focused = false;
    this.connected = false; this.dial = null;
    this.startOpen = false;
    this.selIcon = -1;
    this.dialogs = [];
    this.idle = 0; this.saver = false;
    this.corruption = 0;
    this.dirty = true;
    this.zTop = 1;
    this.flash = null;
    this.drift = null;
    this.monitorOn = true;
    this.iconsDef = [
      { id: 'computer', label: 'My Computer', alt: 'My Body', icon: 'computer' },
      { id: 'support', label: 'Blueberry Support', alt: 'Subject Support', icon: 'support' },
      { id: 'browser', label: 'Internet Voyager', alt: 'Out There', icon: 'browser' },
      { id: 'mail', label: 'Inbox', alt: 'Insides', icon: 'inbox' },
    ];
    setTypeSound(() => sfx('key', { vol: 0.3 }));
  }

  register(id, def) { this.appDefs[id] = def; }

  // ---------------------------------------------------------- power
  powerOn() {
    if (this.state !== 'off' && this.state !== 'safeOff') return;
    this.state = 'post'; this.bootT = 0; this.windows = []; this.dialogs = []; this.startOpen = false; this.connected = false; this.dial = null;
    sfx('click', { vol: 0.6 });
    this.hum = G.audio && G.audio.loop('pcHum', { pos: G.desk ? G.desk.towerPos : null, vol: 0.35 });
    this.dirty = true;
    emit('pcPower', true);
  }
  powerOff(hard = true) {
    if (this.state === 'off') return;
    this.state = 'off';
    if (this.hum) { this.hum.stop(0.8); this.hum = null; }
    this.connected = false; this.dial && this.dial.snd && this.dial.snd.stop(0.1); this.dial = null;
    for (const a of Object.values(this.apps)) a.onPowerOff && a.onPowerOff();
    this.dirty = true;
    emit('pcPower', false);
  }
  get on() { return this.state !== 'off'; }
  get usable() { return this.state === 'desktop'; }

  // ---------------------------------------------------------- windows
  open(id, opts = {}) {
    if (!this.usable) return null;
    let win = this.windows.find((w) => w.app === id);
    if (win) { win.min = false; this.focusWin(win); return win; }
    const def = this.appDefs[id];
    if (!def) return null;
    if (!this.apps[id]) this.apps[id] = def.create(this);
    const app = this.apps[id];
    if (app.needsNet && !this.connected) {
      this.openDialup(() => this.open(id, opts));
      return null;
    }
    const n = this.windows.length;
    win = { app: id, x: 20 + n * 22, y: 16 + n * 18, w: def.w || 520, h: def.h || 380, max: def.max ?? false, min: false, z: ++this.zTop };
    this.windows.push(win);
    this.focusWin(win);
    sfx('click', { vol: 0.2 });
    app.onOpen && app.onOpen(win, opts);
    emit('appOpen', id);
    return win;
  }
  close(win) {
    const i = this.windows.indexOf(win); if (i < 0) return;
    this.windows.splice(i, 1);
    const app = this.apps[win.app];
    app && app.onClose && app.onClose(win);
    const top = this.topWin(); if (top) this.focusWin(top);
  }
  focusWin(win) { win.z = ++this.zTop; this.active = win; }
  topWin() { return [...this.windows].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0] || null; }
  winRect(w) { return w.max ? { x: 0, y: 0, w: W, h: H - TASK_H } : { x: w.x, y: w.y, w: w.w, h: w.h }; }

  // modal message box: {title, text, icon, buttons:[...], onClose(index)}
  msg(o) { this.dialogs.push({ ...o, x: 0, y: 0 }); sfx(o.sound || (o.icon === 'error' ? 'error' : 'ding'), { vol: 0.5 }); this.dirty = true; }

  // ---------------------------------------------------------- dial-up
  openDialup(after) {
    if (this.dial) return;
    this.dial = { stage: 'prompt', after, t: 0, user: { value: 'abengrim' }, pass: { value: 'blueberry' } };
  }
  startDial() {
    const d = this.dial; d.stage = 'dialing'; d.t = 0;
    d.snd = G.audio && G.audio.play('modem', { pos: G.desk ? G.desk.modemPos : null, vol: 0.75, ref: 0.8, occlude: false });
    emit('modem');
  }
  updateDial(dt) {
    const d = this.dial; if (!d || d.stage === 'prompt') return;
    d.t += dt;
    if (d.stage === 'dialing' && d.t > 12.5) {
      d.stage = 'done'; this.connected = true;
      this.dial = null;
      this.balloon = { text: 'Connected at 49,333 bps', t: 5 };
      emit('connected');
      if (d.after) d.after();
    }
  }
  dialStatus() {
    const t = this.dial.t;
    if (t < 4.2) return 'Dialing 555-0199...';
    if (t < 6.5) return 'Dialing... waiting for answer';
    if (t < 10.5) return 'Verifying user name and password...';
    return 'Logging on to network...';
  }
  disconnect(reason) {
    if (!this.connected) return;
    this.connected = false;
    for (const a of Object.values(this.apps)) a.onDisconnect && a.onDisconnect();
    if (reason) this.msg({ title: 'Dial-Up Networking', text: reason, icon: 'warn', buttons: ['OK'] });
  }

  // ---------------------------------------------------------- update
  update(dt, input) {
    this.t += dt;
    const ui = this.ui;
    if (this.state === 'off' || this.state === 'safeOff') { if (this.dirty) this.draw(); return; }
    if (this.state === 'post' || this.state === 'boot') {
      this.bootT += dt;
      const postLen = G.story.day >= 6 ? 6.5 : 4.2;
      if (this.state === 'post' && this.bootT > postLen) { this.state = 'boot'; this.bootT = 0; }
      if (this.state === 'boot' && this.bootT > 4.5) { this.state = 'desktop'; this.bootT = 0; sfx('chime', { vol: 0.7, pos: G.desk ? G.desk.speakerPos : null }); emit('pcBooted'); this.busyT = 1.8; }
      this.draw(); return;
    }
    // ----- input
    if (input && this.focused) {
      this.mx = clamp(this.mx + input.dx, 0, W - 1);
      this.my = clamp(this.my + input.dy, 0, H - 1);
      if (input.dx || input.dy || input.pressed || input.keys.length) { this.idle = 0; if (this.saver) { this.saver = false; this.drawn = false; } }
    }
    // the cursor drifts on its own on bad days
    if (this.drift) {
      this.drift.t += dt;
      const k = Math.min(1, this.drift.t / this.drift.dur);
      this.mx += (this.drift.x - this.mx) * Math.min(1, dt * 3); this.my += (this.drift.y - this.my) * Math.min(1, dt * 3);
      if (k >= 1) { if (this.drift.click) this.fakeClick = true; this.drift = null; }
    }
    this.idle += dt;
    if (this.idle > 75 && !this.saver && this.dialogs.length === 0 && !this.dial) { this.saver = true; this.saverT = 0; }
    ui.time = this.t;
    const fi = this.focused && input ? input : { pressed: false, released: false, down: false, keys: [], wheel: 0, dbl: false };
    ui.frame({ mx: Math.round(this.mx), my: Math.round(this.my), down: fi.down || false, pressed: fi.pressed || !!this.fakeClick, released: fi.released || !!this.fakeClick, keys: fi.keys || [], wheel: fi.wheel || 0 });
    this.fakeClick = false;
    this.updateDial(dt);
    for (const a of Object.values(this.apps)) a.update && a.update(dt);
    if (this.balloon) { this.balloon.t -= dt; if (this.balloon.t <= 0) this.balloon = null; }
    if (this.busyT) this.busyT = Math.max(0, this.busyT - dt);
    this.draw();
    ui.endFrame();
  }

  // ---------------------------------------------------------- drawing
  draw() {
    const ctx = this.ctx, ui = this.ui;
    this.dirty = false;
    if (this.state === 'off') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    if (this.state === 'safeOff') { this.drawSafeOff(); return; }
    if (this.state === 'post') { this.drawPOST(); return; }
    if (this.state === 'boot') { this.drawSplash(); return; }
    if (this.state === 'bsod') { this.drawBSOD(); return; }
    if (this.saver) { this.drawSaver(); this.drawCursor(); return; }
    // which window/area is under the mouse (for input routing)
    const modal = this.dial || this.dialogs.length;
    ui.hotOwner = this.hitOwner();
    if (modal) ui.hotOwner = this.dialogs.length ? 'dialog' : 'dial';
    this.drawDesktop();
    const wins = [...this.windows].sort((a, b) => a.z - b.z);
    for (const w of wins) if (!w.min) this.drawWindow(w);
    this.drawTaskbar();
    if (this.startOpen) this.drawStart();
    if (this.dial) this.drawDial();
    if (this.dialogs.length) this.drawDialog(this.dialogs[0]);
    if (this.balloon) this.drawBalloon();
    if (this.flash) this.drawFlash();
    // global clicks outside start menu close it
    if (ui.pressed && this.startOpen && !(ui.mx < 180 && ui.my > H - TASK_H - 290)) { if (!(ui.mx < 60 && ui.my > H - TASK_H)) this.startOpen = false; }
    this.drawCursor();
  }

  hitOwner() {
    const mx = this.mx, my = this.my;
    if (this.startOpen && mx < 180 && my > H - TASK_H - 290 && my < H - TASK_H) return 'start';
    if (my >= H - TASK_H) return 'taskbar';
    const wins = [...this.windows].filter((w) => !w.min).sort((a, b) => b.z - a.z);
    for (const w of wins) { const r = this.winRect(w); if (mx >= r.x && my >= r.y && mx < r.x + r.w && my < r.y + r.h) return w; }
    return 'desktop';
  }

  drawDesktop() {
    const ui = this.ui, ctx = this.ctx;
    ui.owner = 'desktop';
    const wp = this.wallpaper;
    if (wp) ctx.drawImage(wp, 0, 0, W, H - TASK_H); else ui.fill(0, 0, W, H - TASK_H, C.desk);
    // icons
    const day = G.story.day;
    this.iconsDef.forEach((ic, i) => {
      const x = 12, y = 10 + i * 72;
      const st = ui.clickable('dicon' + i, x, y, 64, 62);
      if (st.clicked) this.selIcon = i;
      if (st.dbl) { this.selIcon = -1; this.open(ic.id); }
      const label = day >= 6 ? ic.alt : ic.label;
      const img = icon(ic.icon, 32);
      ctx.drawImage(img, x + 16, y + 2);
      if (this.selIcon === i) { ctx.globalAlpha = 0.5; ui.fill(x + 16, y + 2, 32, 32, C.sel); ctx.globalAlpha = 1; }
      const lines = wrap(label, 60);
      lines.forEach((l, k) => {
        const tw = textWidth(l);
        const lx = x + 32 - Math.floor(tw / 2);
        if (this.selIcon === i) ui.fill(lx - 2, y + 38 + k * 12, tw + 4, 12, C.sel);
        ui.text(l, lx, y + 38 + k * 12, '#fff');
      });
    });
    if (ui.pressed && ui.hotOwner === 'desktop' && !this.iconsDef.some((ic, i) => ui.hit(12, 10 + i * 72, 64, 62))) this.selIcon = -1;
  }

  drawWindow(win) {
    const ui = this.ui, ctx = this.ctx;
    const app = this.apps[win.app], def = this.appDefs[win.app];
    const r = this.winRect(win);
    ui.owner = win;
    const active = this.active === win && !this.dialogs.length;
    ui.bevel(r.x, r.y, r.w, r.h, 'window');
    // title bar
    const tx = r.x + 3, ty = r.y + 3, tw = r.w - 6;
    const g = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    g.addColorStop(0, active ? C.t1 : C.it1); g.addColorStop(1, active ? C.t2 : C.it2);
    ctx.fillStyle = g; ctx.fillRect(tx, ty, tw, 18);
    ctx.drawImage(icon(def.icon || 'program', 16), tx + 2, ty + 1);
    const title = (app.title ? app.title() : def.title);
    ui.text(title, tx + 21, ty + 3, active ? '#fff' : C.light, { bold: true, maxW: tw - 80 });
    // caption buttons
    const bx = tx + tw - 18;
    const cap = (id, x, glyph) => {
      const st = ui.clickable(id, x, ty + 2, 16, 14);
      ui.bevel(x, ty + 2, 16, 14, st.held ? 'pressed' : 'raised');
      const o = st.held ? 1 : 0;
      ctx.fillStyle = '#000';
      if (glyph === 'x') for (let i = 0; i < 6; i++) { ctx.fillRect(x + 4 + i + o, ty + 5 + i + o, 2, 1); ctx.fillRect(x + 9 - i + o, ty + 5 + i + o, 2, 1); }
      if (glyph === '_') ctx.fillRect(x + 4 + o, ty + 11 + o, 6, 2);
      if (glyph === 'm') { ctx.fillRect(x + 3 + o, ty + 4 + o, 9, 2); ctx.fillRect(x + 3 + o, ty + 4 + o, 1, 8); ctx.fillRect(x + 11 + o, ty + 4 + o, 1, 8); ctx.fillRect(x + 3 + o, ty + 11 + o, 9, 1); }
      return st.clicked;
    };
    if (cap('cx' + win.app, bx, 'x')) { this.close(win); return; }
    if (cap('cm' + win.app, bx - 18, 'm')) win.max = !win.max;
    if (cap('cn' + win.app, bx - 34, '_')) { win.min = true; return; }
    // focus on click anywhere in window
    if (ui.pressed && ui.hit(r.x, r.y, r.w, r.h)) this.focusWin(win);
    // drag by title
    const tbar = ui.clickable('title' + win.app, tx, ty, tw - 54, 18);
    if (tbar.dbl) win.max = !win.max;
    if (ui.active === 'title' + win.app && ui.down && !win.max) {
      if (!win.drag) win.drag = { ox: ui.mx - win.x, oy: ui.my - win.y };
      win.x = clamp(ui.mx - win.drag.ox, -win.w + 60, W - 40); win.y = clamp(ui.my - win.drag.oy, 0, H - TASK_H - 20);
    } else win.drag = null;
    // menu bar
    let cy = ty + 20;
    const menus = app.menu ? app.menu() : null;
    if (menus) {
      let mxp = tx + 2;
      for (const m of menus) {
        const w = textWidth(m.label) + 12;
        const st = ui.clickable('menu' + win.app + m.label, mxp, cy, w, 17);
        if (st.clicked) this.openMenu = this.openMenu === m ? null : { m, x: mxp, y: cy + 17, win };
        if (this.openMenu && this.openMenu.m.label === m.label && this.openMenu.win === win) ui.bevel(mxp, cy, w, 17, 'thin', null);
        else if (st.over) ui.bevel(mxp, cy, w, 17, 'thinUp', null);
        ui.text(m.label, mxp + 6, cy + 3);
        ctx.fillStyle = '#000'; ctx.fillRect(mxp + 6, cy + 13, textWidth(m.label[0]), 1);
        mxp += w;
      }
      cy += 19;
      ui.bevel(tx, cy - 1, tw, 2, 'groove', null);
    }
    const area = { x: tx + 1, y: cy + 1, w: tw - 2, h: r.y + r.h - 4 - cy - 1 };
    ui.clip(area.x - 1, area.y - 1, area.w + 2, area.h + 2);
    try { app.draw(ui, area.x, area.y, area.w, area.h, win); } catch (e) { console.error(e); }
    ui.unclip();
    if (this.openMenu && this.openMenu.win === win) this.drawMenu(this.openMenu);
  }

  drawMenu(om) {
    const ui = this.ui;
    const items = om.m.items;
    const w = Math.max(140, ...items.map((i) => textWidth(i.label || '') + 40));
    const h = items.reduce((s, i) => s + (i.sep ? 8 : 18), 4);
    const prev = ui.owner; ui.owner = ui.hotOwner;
    ui.bevel(om.x, om.y, w, h, 'raised');
    let y = om.y + 2;
    for (const it of items) {
      if (it.sep) { ui.bevel(om.x + 2, y + 3, w - 4, 2, 'groove', null); y += 8; continue; }
      const st = ui.clickable('mi' + it.label, om.x + 2, y, w - 4, 18);
      if (st.over && !it.disabled) ui.fill(om.x + 2, y, w - 4, 18, C.sel);
      ui.text(it.label, om.x + 20, y + 3, it.disabled ? C.disabled : st.over ? '#fff' : '#000');
      if (st.clicked && !it.disabled) { this.openMenu = null; it.action && it.action(); }
      y += 18;
    }
    ui.owner = prev;
    if (ui.pressed && !ui.hit(om.x, om.y, w, h)) setTimeout(() => { if (this.openMenu === om) this.openMenu = null; }, 0);
  }

  drawTaskbar() {
    const ui = this.ui, ctx = this.ctx;
    ui.owner = 'taskbar';
    const y = H - TASK_H;
    ui.fill(0, y, W, TASK_H, C.face); ui.hline(0, y, W, C.light); ui.hline(0, y + 1, W, C.hi);
    // start button
    const st = ui.clickable('start', 2, y + 4, 54, 22);
    if (st.clicked) this.startOpen = !this.startOpen;
    ui.bevel(2, y + 4, 54, 22, this.startOpen ? 'pressed' : 'raised');
    const o = this.startOpen ? 1 : 0;
    ctx.drawImage(icon('logo', 16), 6 + o, y + 7 + o);
    ui.text('Start', 24 + o, y + 9 + o, '#000', { bold: true });
    // quick separator
    ui.vline(60, y + 4, 22, C.shadow); ui.vline(61, y + 4, 22, C.hi);
    // window buttons
    let x = 66;
    const wins = this.windows;
    const bw = Math.min(150, Math.floor((W - 66 - 110) / Math.max(1, wins.length)) - 3);
    for (const w of wins) {
      const def = this.appDefs[w.app], app = this.apps[w.app];
      const isAct = this.active === w && !w.min;
      const b = ui.clickable('tb' + w.app, x, y + 4, bw, 22);
      if (b.clicked) { if (isAct) w.min = true; else { w.min = false; this.focusWin(w); } }
      ui.bevel(x, y + 4, bw, 22, isAct ? 'pressed' : 'raised', isAct ? '#e0e0e0' : C.face);
      if (isAct) { ctx.fillStyle = C.hi; for (let yy = y + 6; yy < y + 24; yy++) for (let xx = x + 2 + (yy % 2); xx < x + bw - 2; xx += 2) ctx.fillRect(xx, yy, 1, 1); }
      ctx.drawImage(icon(def.icon || 'program', 16), x + 4 + (isAct ? 1 : 0), y + 7 + (isAct ? 1 : 0));
      ui.text(app.title ? app.title() : def.title, x + 23 + (isAct ? 1 : 0), y + 9 + (isAct ? 1 : 0), '#000', { bold: isAct, maxW: bw - 28 });
      x += bw + 3;
    }
    // tray
    const tw = 96;
    ui.bevel(W - tw - 2, y + 4, tw, 22, 'thin');
    ctx.drawImage(icon('speaker', 16), W - tw + 2, y + 7);
    if (this.connected || this.dial) {
      const blink = Math.floor(this.t * 6) % 2;
      ctx.drawImage(icon('dialup', 16), W - tw + 20, y + 7);
      if (blink) ui.fill(W - tw + 22, y + 9, 3, 3, '#00ff00');
    }
    ui.text(this.clockString(), W - 58, y + 9);
  }
  clockString() {
    const m = G.director ? G.director.clockMinutes() : 540;
    if (G.story.day >= 7) return '??:?? ??';
    const hr = Math.floor(m / 60) % 24, mn = Math.floor(m % 60);
    return `${((hr + 11) % 12) + 1}:${String(mn).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
  }

  drawStart() {
    const ui = this.ui, ctx = this.ctx;
    ui.owner = 'start';
    const items = [
      { label: 'Blueberry Support', icon: 'support', act: () => this.open('support') },
      { label: 'Internet Voyager', icon: 'browser', act: () => this.open('browser') },
      { label: 'Inbox', icon: 'inbox', act: () => this.open('mail') },
      { label: 'My Computer', icon: 'computer', act: () => this.open('computer') },
      { sep: true },
      { label: 'Connect to Internet', icon: 'dialup', act: () => (this.connected ? this.disconnect() : this.openDialup(null)), dyn: () => (this.connected ? 'Disconnect' : 'Connect to Internet') },
      { label: 'Help', icon: 'question', act: () => this.msg({ title: 'Help', text: G.story.day >= 5 ? 'No one is coming to help you.' : 'Glass 98 Help is not installed. Please insert your Glass 98 CD-ROM.', icon: 'info', buttons: ['OK'] }) },
      { sep: true },
      { label: 'Shut Down...', icon: 'computer', act: () => this.shutdownDialog() },
    ];
    const h = items.reduce((s, i) => s + (i.sep ? 8 : 32), 6);
    const x = 2, y = H - TASK_H - h;
    ui.bevel(x, y, 176, h, 'raised');
    // vertical banner
    const g = ctx.createLinearGradient(0, y + h, 0, y);
    g.addColorStop(0, '#000080'); g.addColorStop(1, '#1084d0');
    ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, 21, h - 6);
    ctx.save(); ctx.translate(x + 20, y + h - 8); ctx.rotate(-Math.PI / 2);
    drawText(ctx, 'Glass', 0, -14, '#ffffff', { bold: true }); drawText(ctx, '98', 34, -14, '#c0c0c0', { bold: true });
    ctx.restore();
    let yy = y + 3;
    for (const it of items) {
      if (it.sep) { ui.bevel(x + 27, yy + 3, 145, 2, 'groove', null); yy += 8; continue; }
      const st = ui.clickable('si' + it.label, x + 25, yy, 149, 32);
      if (st.over) ui.fill(x + 25, yy, 149, 32, C.sel);
      ctx.drawImage(icon(it.icon, 32), x + 28, yy);
      ui.text(it.dyn ? it.dyn() : it.label, x + 66, yy + 10, st.over ? '#fff' : '#000');
      if (st.clicked) { this.startOpen = false; it.act(); }
      yy += 32;
    }
  }

  shutdownDialog() {
    this.msg({
      title: 'Shut Down Glass', text: 'What do you want the computer to do?\n\n  Shut down the computer.', icon: 'computer', buttons: ['OK', 'Cancel'],
      onClose: (i) => { if (i === 0) this.shutdown(); },
    });
  }
  shutdown() {
    this.state = 'safeOff';
    this.connected = false;
    if (this.hum) { this.hum.stop(1); this.hum = null; }
    emit('pcPower', false);
  }

  drawDialog(d) {
    const ui = this.ui, ctx = this.ctx;
    ui.owner = 'dialog';
    const lines = wrap(d.text, 300);
    const w = Math.max(260, Math.min(420, Math.max(...lines.map((l) => textWidth(l))) + (d.icon ? 80 : 40)));
    const h = 70 + lines.length * LINE_H + 10;
    const x = Math.floor((W - w) / 2), y = Math.floor((H - TASK_H - h) / 2);
    ui.bevel(x, y, w, h, 'window');
    const g = ctx.createLinearGradient(x + 3, 0, x + w - 3, 0); g.addColorStop(0, C.t1); g.addColorStop(1, C.t2);
    ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, w - 6, 18);
    ui.text(d.title, x + 6, y + 6, '#fff', { bold: true });
    if (d.icon) ctx.drawImage(icon(d.icon, 32), x + 14, y + 32);
    lines.forEach((l, i) => ui.text(l, x + (d.icon ? 60 : 16), y + 34 + i * LINE_H));
    const bw = 75, n = d.buttons.length;
    let bx = x + Math.floor((w - (n * bw + (n - 1) * 6)) / 2);
    d.buttons.forEach((b, i) => {
      if (ui.button('dlg' + i + b, bx, y + h - 32, bw, 23, b, { def: i === 0, focus: i === 0 })) { this.dialogs.shift(); d.onClose && d.onClose(i); }
      bx += bw + 6;
    });
    if (ui.keys.includes('#Enter')) { this.dialogs.shift(); d.onClose && d.onClose(0); }
  }

  drawDial() {
    const ui = this.ui, ctx = this.ctx, d = this.dial;
    ui.owner = 'dial';
    const w = 330, h = d.stage === 'prompt' ? 228 : 130;
    const x = Math.floor((W - w) / 2), y = Math.floor((H - TASK_H - h) / 2);
    ui.bevel(x, y, w, h, 'window');
    const g = ctx.createLinearGradient(x + 3, 0, x + w - 3, 0); g.addColorStop(0, C.t1); g.addColorStop(1, C.t2);
    ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, w - 6, 18);
    ctx.drawImage(icon('dialup', 16), x + 5, y + 4);
    ui.text(d.stage === 'prompt' ? 'Connect To' : 'Connecting to Blueberry Pie Online', x + 24, y + 6, '#fff', { bold: true });
    if (d.stage === 'prompt') {
      ctx.drawImage(icon('dialup', 32), x + 14, y + 30);
      ui.text('Blueberry Pie Online', x + 56, y + 40, '#000', { bold: true });
      ui.bevel(x + 10, y + 70, w - 20, 2, 'groove', null);
      ui.text('User name:', x + 16, y + 86); ui.field('du', x + 110, y + 82, 200, 20, d.user);
      ui.text('Password:', x + 16, y + 112); ui.field('dp', x + 110, y + 108, 200, 20, d.pass, { password: true });
      ui.check('dsave', x + 110, y + 134, 'Save password', true);
      ui.text('Phone number:', x + 16, y + 160); ui.field('dn', x + 110, y + 156, 200, 20, { value: '555-0199' }, { readOnly: true });
      if (ui.button('dconn', x + w - 170, y + h - 32, 75, 23, 'Connect', { def: true })) this.startDial();
      if (ui.button('dcan', x + w - 88, y + h - 32, 75, 23, 'Cancel')) this.dial = null;
    } else {
      ctx.drawImage(icon('dialup', 32), x + 14, y + 34);
      ui.text('Status:', x + 60, y + 38); ui.text(this.dialStatus(), x + 104, y + 38);
      // little animated phone line
      for (let i = 0; i < 12; i++) if ((Math.floor(this.t * 8) + i) % 12 < 4) ui.fill(x + 104 + i * 12, y + 60, 8, 3, '#000080');
      if (ui.button('dcan2', x + w - 88, y + h - 32, 75, 23, 'Cancel')) { d.snd && d.snd.stop(0.1); this.dial = null; }
    }
  }

  drawBalloon() {
    const ui = this.ui;
    const t = this.balloon.text;
    const w = textWidth(t) + 20, x = W - w - 10, y = H - TASK_H - 40;
    ui.fill(x, y, w, 30, C.tip); ui.bevel(x, y, w, 30, 'thin', null);
    ui.text(t, x + 10, y + 9);
  }

  drawCursor() {
    const ctx = this.ctx;
    const name = this.busyT > 0 ? 'appwait' : this.ui.cursor === 'hand' ? 'hand' : this.ui.cursor === 'ibeam' ? 'ibeam' : this.ui.cursor === 'wait' ? 'wait' : 'arrow';
    const c = cursorImage(name);
    ctx.drawImage(c.cv, Math.round(this.mx - c.hx), Math.round(this.my - c.hy));
  }

  // ---------------------------------------------------------- special screens
  drawPOST() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const t = this.bootT, day = G.story.day;
    const lines = [
      [0.0, 'Award Modular BIOS v4.51PG, An Energy Star Ally'],
      [0.0, 'Copyright (C) 1984-98, Award Software, Inc.'],
      [0.4, ''],
      [0.4, 'PENTIUM-II CPU at 350MHz'],
      [0.6, 'MEM'],
      [2.0, ''],
      [2.0, 'Award Plug and Play BIOS Extension  v1.0A'],
      [2.2, 'Copyright (C) 1998, Award Software, Inc.'],
      [2.6, '  Detecting IDE Primary Master   ... QUANTUM FIREBALL 6.4GB'],
      [3.0, '  Detecting IDE Primary Slave    ... None'],
      [3.3, '  Detecting IDE Secondary Master ... CD-ROM 32X'],
      [3.6, '  Detecting IDE Secondary Slave  ... ' + (day >= 6 ? 'SUBJECT 0419' : 'None')],
    ];
    if (day >= 6) { lines.push([4.4, ''], [4.4, 'WARNING: 2 HEARTBEATS DETECTED ON THIS SYSTEM'], [5.2, 'Press DEL to remove one.']); }
    let y = 20;
    for (const [at, s] of lines) {
      if (t < at) break;
      let str = s;
      if (s === 'MEM') { const k = Math.min(1, (t - 0.6) / 1.3); str = `Memory Test :  ${Math.floor(65536 * k)}K ${k >= 1 ? 'OK' : ''}${k >= 1 && day >= 6 ? ' + 1 (LIVING)' : ''}`; }
      drawText(ctx, str, 16, y, '#c0c0c0');
      y += 15;
    }
    // energy star logo-ish block
    ctx.fillStyle = '#1060c0'; ctx.fillRect(W - 140, 18, 120, 56);
    drawText(ctx, 'ENERGY', W - 108, 30, '#ffff00', { bold: true }); drawText(ctx, 'STAR', W - 100, 48, '#ffff00', { bold: true });
    drawText(ctx, 'Press DEL to enter SETUP', 16, H - 40, '#c0c0c0');
    drawText(ctx, '07/01/99-i440BX-W977-2A69KQ1BC-00', 16, H - 22, '#c0c0c0');
  }
  drawSplash() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a6ad0'); g.addColorStop(1, '#a8c8f0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // clouds
    for (let i = 0; i < 26; i++) {
      const x = (i * 97 + this.bootT * 8) % (W + 200) - 100, y = 40 + (i * 53) % 300;
      const r = 30 + (i * 17) % 40;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      cg.addColorStop(0, 'rgba(255,255,255,0.7)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, y, r * 2, r, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.drawImage(icon('logo', 32), W / 2 - 110, 160, 64, 64);
    drawTextScaled(ctx, 'Glass', W / 2 - 36, 168, '#ffffff', 3, true);
    drawTextScaled(ctx, '98', W / 2 + 80, 168, '#203070', 3, true);
    // moving bar at the bottom
    const bx = (this.bootT * 220) % (W + 200) - 200;
    const bg = ctx.createLinearGradient(bx, 0, bx + 200, 0);
    bg.addColorStop(0, 'rgba(40,60,160,0)'); bg.addColorStop(0.5, 'rgba(40,60,200,0.9)'); bg.addColorStop(1, 'rgba(40,60,160,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, H - 24, W, 10);
    if (G.story.day >= 5 && Math.floor(this.bootT * 3) % 7 === 3) drawTextScaled(ctx, 'IT IS AWAKE', W / 2 - 100, 300, '#000000', 2, true);
  }
  drawSafeOff() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    drawTextScaled(ctx, "It's now safe to turn off", W / 2 - 150, H / 2 - 30, '#f08000', 2, true);
    drawTextScaled(ctx, 'your computer.', W / 2 - 90, H / 2, '#f08000', 2, true);
  }
  drawBSOD() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0000a8'; ctx.fillRect(0, 0, W, H);
    const t = ' Glass ';
    const tw = textWidth(t, true) + 8;
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(W / 2 - tw / 2, 120, tw, 14);
    drawText(ctx, t, W / 2 - tw / 2 + 4, 121, '#0000a8', { bold: true });
    const lines = (this.bsodText || 'A fatal exception 0E has occurred at 0028:C0011E36 in VXD VMM(01) + 00010E36. The current application will be terminated.\n\n*  Press any key to terminate the current application.\n*  Press CTRL+ALT+DEL again to restart your computer. You will lose any unsaved information in all applications.').split('\n');
    let y = 150;
    for (const l of lines) for (const w of wrap(l, 520)) { drawText(ctx, w, 60, y, '#ffffff'); y += 14; }
    drawText(ctx, 'Press any key to continue _', W / 2 - 80, y + 20, '#ffffff');
  }
  drawSaver() {
    const ctx = this.ctx;
    this.saverT = (this.saverT || 0) + 1 / 30;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    if (!this.stars) this.stars = Array.from({ length: 140 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.1, 1) }));
    const day = G.story.day;
    for (const s of this.stars) {
      s.z -= 0.006; if (s.z < 0.02) { s.x = rand(-1, 1); s.y = rand(-1, 1); s.z = 1; }
      let sx = W / 2 + (s.x / s.z) * 160, sy = H / 2 + (s.y / s.z) * 160;
      if (day >= 4) { // the stars gather into an eye
        const a = Math.atan2(s.y, s.x), k = Math.min(1, this.saverT / 20) * (day >= 5 ? 1 : 0.4);
        const ex = W / 2 + Math.cos(a) * 180, ey = H / 2 + Math.sin(a) * 70;
        sx += (ex - sx) * k; sy += (ey - sy) * k;
      }
      const b = Math.floor((1 - s.z) * 255);
      ctx.fillStyle = `rgb(${b},${b},${b})`; ctx.fillRect(sx, sy, s.z < 0.3 ? 2 : 1, s.z < 0.3 ? 2 : 1);
    }
    if (day >= 5) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(W / 2, H / 2, 30, 30, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  drawFlash() {
    // a subliminal frame of text / image
    const f = this.flash;
    f.t -= 1 / 30;
    if (f.t <= 0) { this.flash = null; return; }
    const ctx = this.ctx;
    ctx.fillStyle = f.bg || '#000'; ctx.fillRect(0, 0, W, H);
    drawTextScaled(ctx, f.text, W / 2 - textWidth(f.text, true) * 2, H / 2 - 12, f.color || '#fff', 4, true);
  }
  subliminal(text, dur = 0.08, color = '#fff', bg = '#000') { this.flash = { text, t: dur, color, bg }; }
}
