// Doorways 98 — Sunny's computer. createComputer({ root, game }) per ARCHITECTURE.md.
import { h } from './dom.js';
import { icon } from './icons.js';
import { OS } from './os.js';
import { VFS } from './fs.js';
import { defaultTree, dynamicText } from './content/files.js';
import { Hotline } from './hotline.js';
import { registerHotline } from './apps/hotline.js';
import { registerFiles } from './apps/files.js';
import { registerMail, MailStore } from './apps/mail.js';
import { registerBrowser } from './apps/browser.js';
import { registerPaint } from './apps/paint.js';
import { registerCalc } from './apps/calc.js';
import { registerDisplay } from './apps/display.js';
import { registerAbductor } from './games/abductor.js';
import { registerNoodleTower } from './games/noodletower.js';
import { drawScreen } from './screen.js';

export function createComputer({ root, game }) {
  const comp = {
    root, game,
    isOpen: false,
    known: new Set(),
    bank: [],                  // { day, clock, amount, reason, balance }
    orders: [],                // { id, qty, day, clock, total }
    scores: { abductor: 0, noodletower: 0 },
    recent: [],
    idle: 0,
    booted: false,
    get ringing() { return !!comp.hotline.ringing; },
  };
  comp.audio = (name, vol = 0.5) => { try { game.audio?.ui(name, { vol }); } catch { /* optional */ } };
  comp.learn = (k) => { if (k && !comp.known.has(k)) { comp.known.add(k); comp.hotline?.changed('learn'); } };
  comp.fs = new VFS(defaultTree());
  comp.hotline = new Hotline(comp);
  comp.mail = new MailStore(comp);
  const os = comp.os = new OS(comp);

  comp.launch = (id, args = {}) => os.launch(id, args);
  comp.fileText = (node) => (node.dyn ? dynamicText(node.dyn, game) : node.text || '');
  comp.openFile = (path) => {
    const n = comp.fs.get(path);
    if (!n) { os.dialog({ title: 'Doorways', icon: 'error', text: `Cannot find '${path}'. Make sure the path is correct.` }); return; }
    comp.recent = [path, ...comp.recent.filter((p) => p !== path)].slice(0, 8);
    if (n.type === 'dir') return os.launch('files', { path });
    if (n.type === 'img') return os.launch('imageview', { path });
    if (n.type === 'lnk') return os.launch(n.app, n.args || {});
    if (/phrasebook/i.test(n.name)) comp.learn('phrasebook');
    if (/morse/i.test(n.name)) comp.learn('morse_chart');
    return os.launch('notepad', { path });
  };
  comp.recentDocs = () => {
    if (!comp.recent.length) return [{ label: '(Empty)', disabled: true }];
    return comp.recent.map((p) => ({ label: p.split('/').pop(), icon: comp.fs.get(p)?.type === 'img' ? 'img' : 'txt', action: () => comp.openFile(p) }));
  };
  comp.newDesktopFile = async () => {
    const name = await os.dialog({ title: 'New Text Document', icon: 'txt', text: 'Name for the new document (saved in My Documents):', input: 'New Text Document.txt', buttons: ['OK', 'Cancel'] });
    if (!name) return;
    const fname = /\.\w+$/.test(name) ? name : name + '.txt';
    const p = comp.fs.write('/My Documents', { type: 'txt', name: comp.fs.uniqueName('/My Documents', fname.replace(/\.\w+$/, ''), fname.match(/\.\w+$/)[0]), text: '' });
    comp.openFile(p);
  };
  comp.newDesktopFolder = async () => {
    const name = await os.dialog({ title: 'New Folder', icon: 'folder', text: 'Folder name (created in My Documents):', input: 'New Folder', buttons: ['OK', 'Cancel'] });
    if (!name) return;
    comp.fs.mkdir('/My Documents', comp.fs.uniqueName('/My Documents', name, ''));
    os.launch('files', { path: '/My Documents' });
  };
  comp.runDialog = async () => {
    const v = await os.dialog({ title: 'Run', icon: 'run', text: 'Type the name of a program, folder, document, or Internet address, and Doorways will open it for you.', input: '', buttons: ['OK', 'Cancel'], width: 380 });
    if (!v) return;
    const q = v.trim(), ql = q.toLowerCase();
    const apps = { notepad: 'notepad', calc: 'calc', paint: 'paint', mspaint: 'paint', mail: 'mail', voyager: 'browser', browser: 'browser', abductor: 'abductor', noodle: 'noodletower', lifeline: 'hotline', hotline: 'hotline', explorer: 'files', display: 'display' };
    if (apps[ql]) return comp.launch(apps[ql]);
    if (q.startsWith('/') && comp.fs.get(q)) return comp.openFile(q);
    if (/\.|:\/\//.test(q)) return comp.launch('browser', { url: q });
    os.dialog({ title: q, icon: 'error', text: `Cannot find the file '${q}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.` });
  };
  comp.shutdownDialog = async () => {
    const r = await os.dialog({ title: 'Shut Down Doorways', icon: 'shutdown', text: '<b>What do you want the computer to do?</b><br><br>Stand up: leave the computer running and get up.<br>Restart: reboot Doorways 98.', buttons: ['Stand up', 'Restart', 'Cancel'], width: 360 });
    if (r === 'Stand up') game.events.emit('computer:exit', {});
    else if (r === 'Restart') { comp.boot(true); }
  };

  // ---- apps ----
  registerHotline(os, comp);
  registerFiles(os, comp);
  registerMail(os, comp);
  registerBrowser(os, comp);
  registerPaint(os, comp);
  registerCalc(os, comp);
  registerDisplay(os, comp);
  registerAbductor(os, comp);
  registerNoodleTower(os, comp);

  os.setIcons([
    { id: 'mycomp', label: 'My Computer', icon: 'computer', open: () => comp.launch('files', { path: '/' }) },
    { id: 'hotline', label: 'LIFELINE 24', icon: 'hotline', open: () => comp.launch('hotline') },
    { id: 'mail', label: 'Mailbox', icon: () => (comp.mail.unread() ? 'mail' : 'mail'), open: () => comp.launch('mail') },
    { id: 'browser', label: 'Voyager', icon: 'browser', open: () => comp.launch('browser') },
    { id: 'docs', label: 'My Documents', icon: 'folder', open: () => comp.launch('files', { path: '/My Documents' }) },
    { id: 'paint', label: 'Paint', icon: 'paint', open: () => comp.launch('paint') },
    { id: 'abductor', label: 'ABDUCTOR', icon: 'abductor', open: () => comp.launch('abductor') },
    { id: 'noodle', label: 'Noodle Tower', icon: 'noodle', open: () => comp.launch('noodletower') },
    { id: 'bin', label: 'Recycle Bin', corner: true, icon: () => (comp.fs.list('/Recycle Bin').length ? 'bin_full' : 'bin_empty'), open: () => comp.launch('files', { path: '/Recycle Bin' }),
      menu: [{ label: 'Empty Recycle Bin', action: async () => { const r = await os.dialog({ title: 'Confirm', icon: 'warn', text: 'Are you sure you want to delete everything in the Recycle Bin? Some of it was Gary\'s.', buttons: ['Yes', 'No'] }); if (r === 'Yes') { comp.fs.emptyBin(); os.refreshIconImages(); comp.audio('os.close'); } } }] },
  ]);

  // ---- game events ----
  game.events.on('money', ({ amount, reason, money }) => {
    comp.bank.push({ day: game.state?.day ?? 1, clock: game.state?.clock ?? 0, amount, reason, balance: money });
    if (comp.bank.length > 200) comp.bank.shift();
  });
  game.events.on('day:start', () => { comp.hotline.syncDay(); comp.mail.deliver(true); });
  game.events.on('baby:born', () => comp.mail.deliver(true));
  comp.onRing = (def) => {
    os.trayPhone.classList.add('ring');
    const w = os.find('hotline');
    if (w) w.taskBtn.classList.add('flash');
    if (comp.isOpen && !w) comp.launch('hotline');
  };

  // ---- boot splash ----
  comp.boot = (force = false) => {
    if (comp.booted && !force) return;
    comp.booted = true;
    if (force) for (const w of [...os.wins]) w.close(true);
    const splash = h('div', { class: 'd98-boot' },
      h('div', { class: 'd98-boot-logo' }, h('img', { src: icon('door') }), h('div', {}, 'Doorways', h('b', { style: { color: '#f2c12e' } }, ' 98'), h('small', {}, 'THE OPERATING SYSTEM THAT OPENS DOORS'))),
      h('div', { class: 'd98-boot-bar' }, h('i')), h('div', { style: { fontSize: '11px', color: '#777' } }, 'Starting Doorways…'));
    os.screen.appendChild(splash);
    setTimeout(() => { splash.style.opacity = '0'; comp.audio('sci.wake', 0.5); }, force ? 1600 : 1300);
    setTimeout(() => splash.remove(), force ? 2100 : 1800);
  };

  // ---- key handling (only while open) ----
  const onKey = (e) => {
    if (!comp.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (os.popups.length) { os.closePopups(); return; }
      if (os.closeModal()) return;
      game.events.emit('computer:exit', {});
      return;
    }
    const w = os.active;
    if (w?.app?.onKey && w.app.onKey(e, true)) { e.preventDefault(); return; }
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') {
      if (!e.repeat && e.key.length === 1) { const t = performance.now(); if (t - (comp._lt || 0) > 70) { comp._lt = t; comp.audio('os.type', 0.12); } }
    }
  };
  const onKeyUp = (e) => { if (comp.isOpen) os.active?.app?.onKey?.(e, false); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  root.addEventListener('pointerdown', () => { comp.idle = 0; });

  let clockAcc = 0;
  const api = {
    get isOpen() { return comp.isOpen; },
    get ringing() { return !!comp.hotline.ringing; },
    open() {
      if (comp.isOpen) return;
      comp.isOpen = true; comp.idle = 0;
      root.style.display = '';
      comp.boot();
      comp.mail.deliver(false);
      if (comp.hotline.ringing || (comp.hotline.call && !comp.hotline.call.ended)) comp.launch('hotline');
      setTimeout(() => root.focus({ preventScroll: true }), 30);
    },
    close() {
      if (!comp.isOpen) return;
      comp.isOpen = false;
      os.closePopups();
      root.style.display = 'none';
      for (const w of os.wins) w.app?.onBlur?.();
    },
    answer() { return comp.hotline.answer(); },
    update(dt) {
      dt = Math.min(0.1, dt || 0);
      comp.hotline.update(dt);
      if (!comp.hotline.ringing) { os.trayPhone.classList.remove('ring'); os.find('hotline')?.taskBtn.classList.remove('flash'); }
      os.trayPhone.title = comp.hotline.ringing ? 'Incoming call!' : comp.hotline.shift ? 'LIFELINE 24: on shift' : 'LIFELINE 24: off shift';
      const pi = comp.hotline.ringing ? 'phone_ring' : comp.hotline.shift ? 'phone_on' : 'phone_small';
      if (os.trayPhone.dataset.i !== pi) { os.trayPhone.dataset.i = pi; os.trayPhone.src = icon(pi, 16); }
      clockAcc += dt; if (clockAcc > 0.25) { clockAcc = 0; os.tick(); comp.mail.deliver(false); os.trayMail.style.display = comp.mail.unread() ? '' : 'none'; }
      if (comp.isOpen) {
        for (const w of os.wins) if (!w.min && w.app?.tick) w.app.tick(dt, w === os.active);
      } else comp.idle += dt;
    },
    drawScreen(ctx, w, hgt) { drawScreen(comp, ctx, w, hgt); },
    serialize() {
      return {
        v: 1, fs: comp.fs.serialize(), known: [...comp.known], bank: comp.bank, orders: comp.orders, scores: comp.scores, recent: comp.recent,
        wallpaper: os.wallpaper, paintData: os.wallpaper === 'paint' ? os.paintData : null, iconPos: os.iconPos,
        hotline: comp.hotline.serialize(), mail: comp.mail.serialize(), booted: comp.booted, screensaver: comp.screensaver !== false,
      };
    },
    deserialize(o) {
      if (!o) return;
      try {
        if (o.fs) comp.fs = new VFS(o.fs);
        comp.known = new Set(o.known || []);
        comp.bank = o.bank || []; comp.orders = o.orders || []; comp.scores = { ...comp.scores, ...(o.scores || {}) }; comp.recent = o.recent || []; comp.screensaver = o.screensaver !== false;
        if (o.iconPos) { os.iconPos = o.iconPos; os.layoutIcons(); }
        os.setWallpaper(o.wallpaper || 'hill', o.paintData);
        comp.hotline.deserialize(o.hotline);
        comp.mail.deserialize(o.mail);
      } catch (e) { console.warn('computer deserialize failed', e); }
    },
    // extras for the parent / debugging
    launch: (id, args) => comp.launch(id, args),
    get comp() { return comp; },
  };
  root.style.display = 'none';
  comp.hotline.syncDay();
  comp.mail.deliver(false);
  return api;
}
