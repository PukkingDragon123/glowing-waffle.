// Display Properties: wallpaper + screen saver.
import { h, canvas } from '../dom.js';
import { WALLPAPERS, wallpaperCanvas } from '../wallpaper.js';

export function registerDisplay(os, comp) {
  os.register('display', { title: 'Display Properties', icon: 'display', w: 340, h: 400, resizable: false, noMin: true, create: (win) => new Display(win, comp) });
}

class Display {
  constructor(win, comp) {
    this.win = win; this.comp = comp; this.os = comp.os; this.sel = this.os.wallpaper;
    const pv = canvas(160, 110);
    const list = h('div', { class: 'd98-list', style: { height: '110px', flex: 'none' } });
    const paintings = comp.fs.list('/My Documents/Paintings').filter((n) => n.data);
    const opts = [...WALLPAPERS.map((w) => ({ id: w.id, name: w.name })), ...paintings.map((p) => ({ id: 'paint', name: '🖌 ' + p.name.replace(/\.img$/, ''), data: p.data }))];
    if (this.os.wallpaper === 'paint' && !paintings.length) opts.push({ id: 'paint', name: '🖌 (current painting)', data: this.os.paintData });
    let selData = this.os.paintData;
    const draw = () => {
      const c = pv.getContext('2d');
      if (this.sel === 'paint' && selData) { const img = new Image(); img.onload = () => { c.drawImage(img, 0, 0, 160, 110); }; img.src = selData; }
      else c.drawImage(wallpaperCanvas(this.sel, 800, 572), 0, 0, 160, 110);
    };
    const fill = () => {
      list.innerHTML = '';
      opts.forEach((o) => list.appendChild(h('div', { class: 'd98-li' + (o.id === this.sel && (o.id !== 'paint' || o.data === selData) ? ' sel' : ''), onclick: () => { this.sel = o.id; selData = o.data; fill(); draw(); } }, o.name)));
    };
    fill(); draw();
    const ss = h('select', { class: 'd98-input' }, h('option', {}, 'Flying Noodles'), h('option', {}, '(None)'));
    ss.value = comp.screensaver === false ? '(None)' : 'Flying Noodles';
    const apply = () => { this.os.setWallpaper(this.sel, selData); comp.screensaver = ss.value !== '(None)'; comp.audio('os.complete', 0.4); };
    win.body.append(h('div', { class: 'd98-tabpanel', style: { margin: '4px' } },
      h('div', { class: 'disp-preview' }, h('div', { class: 'mon' }, pv), h('div', { class: 'stand' })),
      h('div', {}, 'Wallpaper:'), list,
      h('div', { class: 'd98-row', style: { marginTop: '8px' } }, 'Screen Saver:', ss)),
      h('div', { class: 'd98-dialog-btns' }, h('button', { class: 'd98-btn default', onclick: () => { apply(); win.close(); } }, 'OK'), h('button', { class: 'd98-btn', onclick: () => win.close() }, 'Cancel'), h('button', { class: 'd98-btn', onclick: apply }, 'Apply')));
  }
}
