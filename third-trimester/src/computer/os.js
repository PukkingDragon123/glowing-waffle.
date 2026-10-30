// Doorways 98 shell: desktop, icons, window manager, taskbar, Begin menu, popups, dialogs.
import { h, W, H, TASKBAR, DESK_H, localPoint, dragger, fmtClock, clamp } from './dom.js';
import { icon } from './icons.js';
import { wallpaperCanvas } from './wallpaper.js';

let winSeq = 0;

class Win {
  constructor(os, appId, def, opts) {
    this.os = os; this.appId = appId; this.def = def; this.id = 'w' + ++winSeq;
    this.w = opts.w ?? def.w ?? 420; this.h = opts.h ?? def.h ?? 320;
    const n = os.wins.length;
    this.x = opts.x ?? def.x ?? clamp(60 + (n % 6) * 26 + (W - 560 - this.w) * 0.0, 0, W - this.w);
    this.y = opts.y ?? def.y ?? clamp(30 + (n % 6) * 22, 0, DESK_H - this.h);
    this.min = false; this.max = false; this.resizable = def.resizable !== false;
    this.title = opts.title ?? def.title; this.iconName = opts.icon ?? def.icon ?? 'exe';
    this.minW = def.minW ?? 220; this.minH = def.minH ?? 140;
    this.build();
  }
  build() {
    const os = this.os;
    this.titleText = h('span', { class: 'd98-title-text' }, this.title);
    this.btnMin = h('button', { class: 'd98-tb d98-tb-min', title: 'Minimize', onclick: (e) => { e.stopPropagation(); this.minimize(); } });
    this.btnMax = h('button', { class: 'd98-tb d98-tb-max', title: 'Maximize', onclick: (e) => { e.stopPropagation(); this.toggleMax(); } });
    this.btnClose = h('button', { class: 'd98-tb d98-tb-close', title: 'Close', onclick: (e) => { e.stopPropagation(); this.close(); } });
    if (!this.resizable) this.btnMax.disabled = true;
    this.titleBar = h('div', { class: 'd98-titlebar' },
      h('img', { class: 'd98-title-icon', src: icon(this.iconName, 16), draggable: 'false' }), this.titleText,
      h('div', { class: 'd98-tbtns' }, this.def.noMin ? null : this.btnMin, this.def.noMin ? null : this.btnMax, this.btnClose));
    this.menuBar = h('div', { class: 'd98-menubar', style: { display: 'none' } });
    this.body = h('div', { class: 'd98-winbody' });
    this.grip = h('div', { class: 'd98-grip' });
    this.el = h('div', { class: 'd98-win', dataset: { app: this.appId } }, this.titleBar, this.menuBar, this.body, this.resizable ? this.grip : null);
    this.el.addEventListener('pointerdown', () => this.focus(), true);
    let sx, sy, sw, sh;
    dragger(os.screen, this.titleBar, {
      onStart: (e) => { if (e.target.closest('.d98-tb')) return false; sx = this.x; sy = this.y; if (this.max) return false; this.el.classList.add('d98-dragging'); },
      onMove: (dx, dy) => { this.x = clamp(sx + dx, -this.w + 60, W - 60); this.y = clamp(sy + dy, 0, DESK_H - 20); this.place(); },
      onEnd: (moved) => { this.el.classList.remove('d98-dragging'); if (moved) os.audio('os.drop', 0.25); },
    });
    this.titleBar.addEventListener('dblclick', (e) => { if (!e.target.closest('.d98-tb') && this.resizable) this.toggleMax(); });
    if (this.resizable) dragger(os.screen, this.grip, {
      onStart: () => { sw = this.w; sh = this.h; },
      onMove: (dx, dy) => { this.w = clamp(sw + dx, this.minW, W - this.x); this.h = clamp(sh + dy, this.minH, DESK_H - this.y); this.place(); this.app?.onResize?.(); },
    });
    this.taskBtn = h('button', { class: 'd98-task', onclick: () => {
      if (this.min) { this.restore(); } else if (this.os.active === this) { this.minimize(); } else { this.focus(); }
    } }, h('img', { src: icon(this.iconName, 16), draggable: 'false' }), h('span', {}, this.title));
    this.place();
  }
  place() {
    const s = this.el.style;
    if (this.max) { s.left = '0px'; s.top = '0px'; s.width = W + 'px'; s.height = DESK_H + 'px'; }
    else { s.left = this.x + 'px'; s.top = this.y + 'px'; s.width = this.w + 'px'; s.height = this.h + 'px'; }
    this.el.style.display = this.min ? 'none' : '';
  }
  get rect() { return this.max ? { x: 0, y: 0, w: W, h: DESK_H } : { x: this.x, y: this.y, w: this.w, h: this.h }; }
  setTitle(t) { this.title = t; this.titleText.textContent = t; this.taskBtn.querySelector('span').textContent = t; }
  setMenus(menus) {
    this.menuBar.innerHTML = ''; this.menuBar.style.display = menus?.length ? '' : 'none';
    for (const m of menus || []) {
      const b = h('button', { class: 'd98-menubtn' }, m.label);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const r = b.getBoundingClientRect(), sr = this.os.screen.getBoundingClientRect();
        const sx = W / sr.width, sy = H / sr.height;
        b.classList.add('on');
        this.os.popup(typeof m.items === 'function' ? m.items() : m.items, (r.left - sr.left) * sx, (r.bottom - sr.top) * sy, { onClose: () => b.classList.remove('on') });
      });
      this.menuBar.appendChild(b);
    }
  }
  focus() {
    const os = this.os;
    if (os.active === this && !this.min) return;
    if (os.active && os.active !== this) { os.active.el.classList.add('d98-inactive'); os.active.taskBtn.classList.remove('on'); os.active.app?.onBlur?.(); }
    os.active = this; this.min = false; this.place();
    this.el.style.zIndex = ++os.zTop;
    this.el.classList.remove('d98-inactive'); this.taskBtn.classList.add('on');
    this.app?.onFocus?.();
  }
  minimize() {
    this.min = true; this.place(); this.taskBtn.classList.remove('on'); this.os.audio('os.off', 0.25);
    if (this.os.active === this) { this.os.active = null; this.app?.onBlur?.(); this.os.focusTop(); }
  }
  restore() { this.min = false; this.place(); this.focus(); this.os.audio('os.on', 0.25); }
  toggleMax() { this.max = !this.max; this.place(); this.app?.onResize?.(); this.os.audio('os.snap', 0.3); }
  close(silent = false) {
    if (this.closed) return;
    if (this.app?.beforeClose && this.app.beforeClose() === false) return;
    this.closed = true;
    this.app?.onClose?.();
    this.el.remove(); this.taskBtn.remove();
    const os = this.os; os.wins = os.wins.filter((w) => w !== this);
    if (os.active === this) { os.active = null; os.focusTop(); }
    if (!silent) os.audio('os.close', 0.35);
  }
}

export class OS {
  constructor(comp) {
    this.comp = comp; this.game = comp.game; this.root = comp.root;
    this.apps = new Map(); this.wins = []; this.zTop = 10; this.active = null;
    this.iconPos = {}; this.selectedIcon = null; this.popups = [];
    this.wallpaper = 'hill'; this.paintImg = null;
    this.build();
  }
  audio(name, vol = 0.5) { try { this.game.audio?.ui(name, { vol }); } catch { /* audio optional */ } }

  build() {
    this.root.classList.add('d98');
    this.root.tabIndex = 0;
    this.screen = h('div', { class: 'd98-screen' });
    this.wallCanvas = h('canvas', { class: 'd98-wall', width: W, height: DESK_H });
    this.iconLayer = h('div', { class: 'd98-icons' });
    this.winLayer = h('div', { class: 'd98-wins' });
    this.clock = h('div', { class: 'd98-clock' }, '08:00');
    this.trayPhone = h('img', { class: 'd98-tray-ico', src: icon('phone_small', 16), title: 'LIFELINE 24: off shift', onclick: () => this.comp.launch('hotline') });
    this.trayMail = h('img', { class: 'd98-tray-ico', src: icon('mail', 16), title: 'You have new mail', style: { display: 'none' }, onclick: () => this.comp.launch('mail') });
    this.trayVol = h('img', { class: 'd98-tray-ico', src: icon('volume', 16), title: 'Volume', onclick: (e) => this.volumePopup(e) });
    this.tasks = h('div', { class: 'd98-tasks' });
    this.beginBtn = h('button', { class: 'd98-begin', onpointerdown: (e) => { e.stopPropagation(); this.toggleBegin(); } },
      h('img', { src: icon('door', 16), draggable: 'false' }), h('b', {}, 'Begin'));
    this.quick = h('div', { class: 'd98-quick' },
      ...[['hotline', 'LIFELINE 24 Agent Console'], ['browser', 'Voyager'], ['mail', 'Mailbox']].map(([id, t]) =>
        h('button', { class: 'd98-qbtn', title: t, onclick: () => this.comp.launch(id) }, h('img', { src: icon(id === 'browser' ? 'browser' : id, 16), draggable: 'false' }))));
    this.taskbar = h('div', { class: 'd98-taskbar' }, this.beginBtn, h('div', { class: 'd98-sep' }), this.quick, h('div', { class: 'd98-sep' }), this.tasks,
      h('div', { class: 'd98-tray' }, this.trayMail, this.trayPhone, this.trayVol, this.clock));
    this.balloon = h('div', { class: 'd98-balloon', style: { display: 'none' } });
    this.modalLayer = h('div', { class: 'd98-modal-layer' });
    this.screen.append(this.wallCanvas, this.iconLayer, this.winLayer, this.taskbar, this.balloon, this.modalLayer);
    this.root.appendChild(this.screen);

    this.screen.addEventListener('pointerdown', (e) => {
      if (this.popups.length && !e.target.closest('.d98-menu')) this.closePopups();
    }, true);
    this.iconLayer.addEventListener('pointerdown', (e) => { if (e.target === this.iconLayer) this.selectIcon(null); });
    this.iconLayer.addEventListener('contextmenu', (e) => {
      e.preventDefault(); if (e.target !== this.iconLayer) return;
      const p = localPoint(this.screen, e);
      this.popup([
        { label: 'Arrange Icons', action: () => { this.iconPos = {}; this.layoutIcons(); } },
        { label: 'Refresh', action: () => { this.paintWallpaper(); this.layoutIcons(); } },
        { sep: true },
        { label: 'New', sub: [
          { label: 'Text Document', icon: 'txt', action: () => this.comp.newDesktopFile() },
          { label: 'Folder', icon: 'folder', action: () => this.comp.newDesktopFolder() },
        ] },
        { sep: true },
        { label: 'Properties', action: () => this.comp.launch('display') },
      ], p.x, p.y);
    });
    this.screen.addEventListener('contextmenu', (e) => e.preventDefault());
    this.paintWallpaper();
  }

  // ---- wallpaper ----
  setWallpaper(id, paintDataUrl = null) {
    this.wallpaper = id;
    if (id === 'paint' && paintDataUrl) {
      const img = new Image(); img.onload = () => { this.paintImg = img; this.paintWallpaper(); }; img.src = paintDataUrl; this.paintData = paintDataUrl;
    } else this.paintWallpaper();
  }
  paintWallpaper() {
    const src = wallpaperCanvas(this.wallpaper, W, DESK_H, this.wallpaper === 'paint' ? this.paintImg : null);
    this.wallSrc = src;
    this.wallCanvas.getContext('2d').drawImage(src, 0, 0);
  }

  // ---- apps & windows ----
  register(id, def) { this.apps.set(id, def); }
  launch(id, args = {}, opts = {}) {
    const def = this.apps.get(id); if (!def) return null;
    if (def.single !== false) {
      const ex = this.wins.find((w) => w.appId === id);
      if (ex) { ex.focus(); ex.app?.onArgs?.(args); return ex; }
    }
    const win = new Win(this, id, def, opts);
    this.wins.push(win);
    this.winLayer.appendChild(win.el);
    this.tasks.appendChild(win.taskBtn);
    try { win.app = def.create(win, args, this) || {}; } catch (e) { console.error(e); win.app = {}; }
    win.focus();
    this.audio('os.open', 0.35);
    return win;
  }
  focusTop() {
    const vis = this.wins.filter((w) => !w.min).sort((a, b) => (+b.el.style.zIndex) - (+a.el.style.zIndex));
    if (vis[0]) vis[0].focus();
  }
  find(id) { return this.wins.find((w) => w.appId === id); }

  // ---- desktop icons ----
  setIcons(list) {
    this.iconDefs = list;
    for (const d of list) if (d.corner && !this.iconPos[d.id]) this.iconPos[d.id] = { x: W - 84, y: DESK_H - 80 };
    this.layoutIcons();
  }
  layoutIcons() {
    this.iconLayer.innerHTML = '';
    let col = 0, row = 0;
    const taken = new Set(Object.values(this.iconPos).map((p) => p.x + ',' + p.y));
    for (const d of this.iconDefs || []) {
      let pos = this.iconPos[d.id];
      if (!pos) {
        while (taken.has(`${8 + col * 76},${8 + row * 70}`)) { row++; if (8 + row * 70 + 66 > DESK_H) { row = 0; col++; } }
        pos = { x: 8 + col * 76, y: 8 + row * 70 }; this.iconPos[d.id] = pos; taken.add(pos.x + ',' + pos.y);
      }
      const el = h('div', { class: 'd98-icon', style: { left: pos.x + 'px', top: pos.y + 'px' }, dataset: { id: d.id } },
        h('img', { src: icon(typeof d.icon === 'function' ? d.icon() : d.icon), draggable: 'false' }), h('span', {}, d.label));
      el.addEventListener('pointerdown', () => this.selectIcon(d.id));
      el.addEventListener('dblclick', () => { this.audio('os.dbl', 0.3); d.open(); });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation(); this.selectIcon(d.id);
        const p = localPoint(this.screen, e);
        this.popup([{ label: '<b>Open</b>', action: d.open }, ...(d.menu ? [{ sep: true }, ...d.menu] : [])], p.x, p.y);
      });
      let sx, sy;
      dragger(this.screen, el, {
        threshold: 4,
        onStart: () => { sx = pos.x; sy = pos.y; },
        onMove: (dx, dy) => { el.style.left = clamp(sx + dx, 0, W - 72) + 'px'; el.style.top = clamp(sy + dy, 0, DESK_H - 64) + 'px'; el.classList.add('d98-dragging'); },
        onEnd: (moved) => {
          el.classList.remove('d98-dragging'); if (!moved) return;
          const nx = Math.round((parseFloat(el.style.left) - 8) / 76) * 76 + 8, ny = Math.round((parseFloat(el.style.top) - 8) / 70) * 70 + 8;
          const clash = Object.entries(this.iconPos).some(([k, p]) => k !== d.id && p.x === nx && p.y === ny);
          if (!clash) { pos.x = clamp(nx, 8, W - 76); pos.y = clamp(ny, 8, DESK_H - 70); }
          el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px'; this.audio('os.drop', 0.25);
        },
      });
      this.iconLayer.appendChild(el);
      if (d.id === this.selectedIcon) el.classList.add('sel');
    }
  }
  selectIcon(id) {
    this.selectedIcon = id;
    for (const el of this.iconLayer.children) el.classList.toggle('sel', el.dataset.id === id);
  }
  refreshIconImages() {
    for (const el of this.iconLayer.children) {
      const d = this.iconDefs.find((x) => x.id === el.dataset.id);
      if (d) el.querySelector('img').src = icon(typeof d.icon === 'function' ? d.icon() : d.icon);
    }
  }

  // ---- popups / menus ----
  popup(items, x, y, { onClose, parent } = {}) {
    if (!parent) this.closePopups();
    const menu = h('div', { class: 'd98-menu' });
    menu._onClose = onClose;
    for (const it of items) {
      if (it.sep) { menu.appendChild(h('div', { class: 'd98-menu-sep' })); continue; }
      const row = h('div', { class: 'd98-menu-item' + (it.disabled ? ' dis' : '') + (it.sub ? ' sub' : '') },
        h('span', { class: 'd98-mi-ico' }, it.icon ? h('img', { src: icon(it.icon, 16), draggable: 'false' }) : it.checked ? '✓' : ''),
        h('span', { class: 'd98-mi-label', html: it.label }), it.sub ? h('span', { class: 'd98-mi-arrow' }, '▸') : null);
      row.addEventListener('pointerenter', () => {
        // close deeper menus
        const idx = this.popups.indexOf(menu);
        while (this.popups.length > idx + 1) { const m = this.popups.pop(); m.remove(); }
        menu.querySelectorAll('.d98-menu-item.open').forEach((r) => r.classList.remove('open'));
        if (it.sub && !it.disabled) {
          row.classList.add('open');
          const r = row.getBoundingClientRect(), sr = this.screen.getBoundingClientRect();
          const sx = W / sr.width, sy = H / sr.height;
          this.popup(typeof it.sub === 'function' ? it.sub() : it.sub, (r.right - sr.left) * sx - 3, (r.top - sr.top) * sy - 3, { parent: menu });
        }
      });
      row.addEventListener('pointerup', (e) => {
        if (it.disabled || it.sub) return;
        e.stopPropagation(); this.closePopups(); this.audio('os.press', 0.3); it.action?.();
      });
      menu.appendChild(row);
    }
    this.screen.appendChild(menu);
    const mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 100;
    menu.style.left = clamp(x, 0, W - mw) + 'px'; menu.style.top = clamp(y, 0, H - mh) + 'px';
    this.popups.push(menu);
    return menu;
  }
  closePopups() {
    while (this.popups.length) { const m = this.popups.pop(); m._onClose?.(); m.remove(); }
    this.beginBtn.classList.remove('on');
  }
  toggleBegin() {
    if (this.beginBtn.classList.contains('on')) { this.closePopups(); return; }
    this.closePopups(); this.audio('os.press', 0.35);
    const c = this.comp;
    const items = [
      { label: 'Programs', icon: 'programs', sub: () => [
        { label: 'Accessories', icon: 'folder', sub: [
          { label: 'Calculator', icon: 'calc', action: () => c.launch('calc') },
          { label: 'Notepad', icon: 'notepad', action: () => c.launch('notepad') },
          { label: 'Paint', icon: 'paint', action: () => c.launch('paint') },
        ] },
        { label: 'Games', icon: 'folder', sub: [
          { label: 'ABDUCTOR', icon: 'abductor', action: () => c.launch('abductor') },
          { label: 'Noodle Tower', icon: 'noodle', action: () => c.launch('noodletower') },
        ] },
        { label: 'LIFELINE 24 Agent Console', icon: 'hotline', action: () => c.launch('hotline') },
        { label: 'Mailbox', icon: 'mail', action: () => c.launch('mail') },
        { label: 'Voyager Web Browser', icon: 'browser', action: () => c.launch('browser') },
        { label: 'My Computer', icon: 'computer', action: () => c.launch('files', { path: '/' }) },
      ] },
      { label: 'Documents', icon: 'documents', sub: () => c.recentDocs() },
      { label: 'Settings', icon: 'settings', sub: [
        { label: 'Display Properties', icon: 'display', action: () => c.launch('display') },
      ] },
      { label: 'Find', icon: 'find', action: () => c.launch('browser', { url: 'askew.search' }) },
      { label: 'Help', icon: 'help', action: () => c.openFile('/Hotline Training/doorways_help.txt') },
      { label: 'Run...', icon: 'run', action: () => c.runDialog() },
      { sep: true },
      { label: 'Shut Down...', icon: 'shutdown', action: () => c.shutdownDialog() },
    ];
    const m = this.popup(items, 0, 0);
    m.classList.add('d98-beginmenu');
    m.prepend(h('div', { class: 'd98-begin-banner' }, h('span', {}, h('b', {}, 'Doorways'), '98')));
    m.style.left = '2px'; m.style.top = (H - TASKBAR - m.offsetHeight) + 'px';
    this.beginBtn.classList.add('on');
  }
  volumePopup() {
    this.closePopups();
    const g = this.game;
    const slider = h('input', { type: 'range', min: 0, max: 100, value: Math.round((g.settings?.get('master') ?? 0.9) * 100), class: 'd98-vslider' });
    slider.addEventListener('input', () => { g.settings?.set('master', slider.value / 100); });
    slider.addEventListener('change', () => this.audio('os.press', 0.5));
    const m = h('div', { class: 'd98-menu d98-volpop' }, h('div', { class: 'd98-vol-title' }, 'Volume'), slider, h('label', {}, h('input', { type: 'checkbox', onchange: (e) => g.settings?.set('master', e.target.checked ? 0 : 0.9) }), ' Mute'));
    this.screen.appendChild(m); m.style.left = (W - 90) + 'px'; m.style.top = (H - TASKBAR - 170) + 'px';
    this.popups.push(m);
  }

  // ---- dialogs ----
  dialog({ title = 'Doorways', text = '', icon: ic = 'info', buttons = ['OK'], input = null, width = 340 }) {
    return new Promise((resolve) => {
      const shade = h('div', { class: 'd98-modal' });
      let inp = null;
      if (input != null) inp = h('input', { class: 'd98-input', type: 'text', value: input, style: { width: '100%' } });
      const done = (v) => { shade.remove(); resolve(inp ? (v === buttons[0] ? inp.value : null) : v); };
      const box = h('div', { class: 'd98-win d98-dialog', style: { width: width + 'px' } },
        h('div', { class: 'd98-titlebar' }, h('span', { class: 'd98-title-text' }, title), h('div', { class: 'd98-tbtns' }, h('button', { class: 'd98-tb d98-tb-close', onclick: () => done(null) }))),
        h('div', { class: 'd98-dialog-body' }, h('img', { src: icon(ic), draggable: 'false' }), h('div', { class: 'd98-dialog-text' }, h('div', { html: text }), inp)),
        h('div', { class: 'd98-dialog-btns' }, ...buttons.map((b, i) => h('button', { class: 'd98-btn' + (i === 0 ? ' default' : ''), onclick: () => { this.audio('os.press', 0.3); done(b); } }, b))));
      shade.appendChild(box); this.modalLayer.appendChild(shade);
      box.style.left = (W - width) / 2 + 'px'; box.style.top = Math.max(40, (DESK_H - box.offsetHeight) / 2) + 'px';
      if (inp) { inp.focus(); inp.select(); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(buttons[0]); }); }
      this.audio(ic === 'error' ? 'os.error' : ic === 'warn' ? 'os.warning' : 'os.notify', 0.45);
    });
  }
  get modalOpen() { return this.modalLayer.children.length > 0; }
  closeModal() { const m = this.modalLayer.lastChild; if (m) { m.remove(); return true; } return false; }

  notify(title, text, onClick) {
    const b = this.balloon;
    b.innerHTML = '';
    b.append(h('div', { class: 'd98-balloon-title' }, title), h('div', {}, text), h('button', { class: 'd98-balloon-x', onclick: (e) => { e.stopPropagation(); b.style.display = 'none'; } }, '×'));
    b.onclick = () => { b.style.display = 'none'; onClick?.(); };
    b.style.display = '';
    clearTimeout(this._bt); this._bt = setTimeout(() => (b.style.display = 'none'), 7000);
  }

  tick() {
    const clock = this.game.state?.clock ?? 480;
    const t = fmtClock(clock);
    if (this.clock.textContent !== t) this.clock.textContent = t;
  }
}
