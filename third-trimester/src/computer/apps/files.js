// My Computer (explorer), Notepad and Image Viewer.
import { h, canvas, localPoint } from '../dom.js';
import { icon } from '../icons.js';
import { fileIcon } from '../fs.js';
import { drawGenImage } from '../content/files.js';

export function registerFiles(os, comp) {
  os.register('files', { title: 'My Computer', icon: 'computer', w: 470, h: 330, single: false, create: (win, args) => new Explorer(win, comp, args.path || '/') });
  os.register('notepad', { title: 'Untitled - Notepad', icon: 'notepad', w: 440, h: 340, single: false, create: (win, args) => new Notepad(win, comp, args.path) });
  os.register('imageview', { title: 'Image Viewer', icon: 'img', w: 420, h: 360, single: false, create: (win, args) => new ImageView(win, comp, args.path) });
}

class Explorer {
  constructor(win, comp, path) {
    this.win = win; this.comp = comp; this.fs = comp.fs; this.path = path; this.sel = null; this.history = [];
    win.setMenus([
      { label: 'File', items: () => [
        { label: 'Open', action: () => this.sel && this.open(this.sel), disabled: !this.sel },
        { label: 'New Text Document', icon: 'txt', action: () => this.newFile(), disabled: this.readonlyDir },
        { label: 'New Folder', icon: 'folder', action: () => this.newFolder(), disabled: this.readonlyDir },
        { sep: true },
        { label: 'Rename', action: () => this.rename(), disabled: !this.sel },
        { label: 'Delete', action: () => this.del(), disabled: !this.sel },
        ...(this.path === '/Recycle Bin' ? [{ label: 'Restore', action: () => this.restore(), disabled: !this.sel }, { label: 'Empty Recycle Bin', action: () => { this.fs.emptyBin(); this.comp.os.refreshIconImages(); this.render(); } }] : []),
        { sep: true }, { label: 'Close', action: () => win.close() },
      ] },
      { label: 'View', items: [{ label: 'Refresh', action: () => this.render() }] },
      { label: 'Help', items: [{ label: 'Doorways Help', icon: 'help', action: () => comp.openFile('/Hotline Training/doorways_help.txt') }] },
    ]);
    this.back = h('button', { class: 'd98-tool', title: 'Up', onclick: () => this.up() }, '⬑ Up');
    this.addr = h('input', { class: 'd98-input', value: path });
    this.addr.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.go(this.addr.value); });
    this.grid = h('div', { class: 'd98-list d98-grid' });
    this.status = h('div', { class: 'd98-status' }, h('div'), h('div'));
    win.body.append(h('div', { class: 'd98-addr' }, this.back, 'Address', this.addr), this.grid, this.status);
    this.grid.addEventListener('pointerdown', (e) => { if (e.target === this.grid) { this.sel = null; this.render(); } });
    this.grid.addEventListener('contextmenu', (e) => {
      e.preventDefault(); const p = localPoint(comp.os.screen, e);
      comp.os.popup([
        { label: 'New Text Document', icon: 'txt', action: () => this.newFile(), disabled: this.readonlyDir },
        { label: 'New Folder', icon: 'folder', action: () => this.newFolder(), disabled: this.readonlyDir },
        { label: 'Refresh', action: () => this.render() },
      ], p.x, p.y);
    });
    this.render();
  }
  get readonlyDir() { return this.path === '/' || this.path === '/Recycle Bin'; }
  go(path) {
    const n = this.fs.get(path);
    if (!n) { this.comp.os.dialog({ title: 'Address', icon: 'error', text: `Doorways cannot find '${path}'.` }); return; }
    if (n.type !== 'dir') { this.comp.openFile(path); return; }
    this.path = path === '' ? '/' : path; this.sel = null; this.render();
  }
  up() { if (this.path !== '/') this.go(this.fs.parentPath(this.path)); }
  open(name) {
    const p = this.fs.join(this.path, name);
    const n = this.fs.get(p);
    if (this.path === '/Recycle Bin') { this.comp.os.dialog({ title: 'Recycle Bin', icon: 'info', text: 'Restore this item before opening it.' }); return; }
    if (n?.type === 'dir') this.go(p); else this.comp.openFile(p);
  }
  render() {
    const kids = this.fs.list(this.path);
    const title = this.path === '/' ? 'My Computer' : this.path.split('/').pop();
    this.win.setTitle(title);
    this.addr.value = this.path === '/' ? 'My Computer' : 'C:' + this.path.replace(/\//g, '\\');
    this.grid.innerHTML = '';
    for (const n of kids) {
      const el = h('div', { class: 'd98-gi' + (this.sel === n.name ? ' sel' : '') }, h('img', { src: icon(fileIcon(n)), draggable: 'false' }), h('span', {}, n.name.replace(/\.img$/, '.bmp')));
      el.addEventListener('pointerdown', () => { this.sel = n.name; for (const x of this.grid.children) x.classList.remove('sel'); el.classList.add('sel'); this.updateStatus(); });
      el.addEventListener('dblclick', () => this.open(n.name));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation(); this.sel = n.name; const p = localPoint(this.comp.os.screen, e);
        const inBin = this.path === '/Recycle Bin';
        this.comp.os.popup(inBin ? [{ label: 'Restore', action: () => this.restore() }, { label: 'Delete forever', action: () => this.del() }]
          : [{ label: '<b>Open</b>', action: () => this.open(n.name) }, { sep: true }, { label: 'Rename', action: () => this.rename(), disabled: n.system }, { label: 'Delete', action: () => this.del(), disabled: n.system }], p.x, p.y);
      });
      this.grid.appendChild(el);
    }
    if (!kids.length) this.grid.appendChild(h('div', { style: { padding: '8px', color: '#666' } }, this.path === '/Recycle Bin' ? 'The Recycle Bin is empty.' : 'This folder is empty.'));
    this.updateStatus();
  }
  updateStatus() {
    const kids = this.fs.list(this.path);
    this.status.children[0].textContent = `${kids.length} object(s)`;
    const n = this.sel && this.fs.get(this.fs.join(this.path, this.sel));
    this.status.children[1].textContent = n ? (n.type === 'dir' ? 'File Folder' : n.type === 'img' ? 'Bitmap Image' : `Text Document, ${(this.comp.fileText(n).length / 1024).toFixed(1)} KB`) : '';
  }
  async newFile() {
    if (this.readonlyDir) return;
    const name = this.fs.uniqueName(this.path, 'New Text Document', '.txt');
    this.fs.write(this.path, { type: 'txt', name, text: '' }); this.sel = name; this.render(); this.rename();
  }
  async newFolder() {
    if (this.readonlyDir) return;
    const name = this.fs.uniqueName(this.path, 'New Folder', '');
    this.fs.mkdir(this.path, name); this.sel = name; this.render(); this.rename();
  }
  async rename() {
    if (!this.sel) return;
    const p = this.fs.join(this.path, this.sel); const n = this.fs.get(p);
    if (n?.system) { this.comp.os.dialog({ title: 'Rename', icon: 'error', text: 'This is a system folder. Doorways would rather you didn\'t.' }); return; }
    const v = await this.comp.os.dialog({ title: 'Rename', icon: fileIcon(n), text: 'New name:', input: this.sel, buttons: ['OK', 'Cancel'] });
    if (v && v !== this.sel) { if (this.fs.rename(p, v.trim())) this.sel = v.trim(); else this.comp.os.dialog({ title: 'Rename', icon: 'error', text: 'A file with that name already exists.' }); }
    this.render();
  }
  async del() {
    if (!this.sel) return;
    const p = this.fs.join(this.path, this.sel); const n = this.fs.get(p);
    if (n?.system) { this.comp.os.dialog({ title: 'Delete', icon: 'error', text: `Cannot delete ${this.sel}: it is a system folder.` }); return; }
    const inBin = this.path === '/Recycle Bin';
    const r = await this.comp.os.dialog({ title: 'Confirm File Delete', icon: 'warn', text: inBin ? `Permanently delete '${this.sel}'?` : `Are you sure you want to send '${this.sel}' to the Recycle Bin?`, buttons: ['Yes', 'No'] });
    if (r !== 'Yes') return;
    if (inBin) { const bin = this.fs.get('/Recycle Bin'); bin.kids = bin.kids.filter((k) => k.name !== this.sel); }
    else this.fs.remove(p);
    this.comp.audio('os.close', 0.4); this.sel = null; this.render(); this.comp.os.refreshIconImages();
  }
  restore() { if (this.sel && this.fs.restore(this.sel)) { this.sel = null; this.render(); this.comp.os.refreshIconImages(); this.comp.audio('os.complete', 0.4); } }
}

class Notepad {
  constructor(win, comp, path) {
    this.win = win; this.comp = comp; this.path = path; this.dirty = false;
    const n = path ? comp.fs.get(path) : null;
    this.node = n;
    this.ta = h('textarea', { class: 'd98-input d98-notepad', spellcheck: 'false' });
    this.ta.value = n ? comp.fileText(n) : '';
    if (n?.dyn) this.ta.readOnly = true;
    this.ta.addEventListener('input', () => { this.dirty = true; this.title(); });
    this.ta.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.save(); } });
    win.setMenus([
      { label: 'File', items: [
        { label: 'New', action: () => { this.path = null; this.node = null; this.ta.value = ''; this.ta.readOnly = false; this.dirty = false; this.title(); } },
        { label: 'Save', action: () => this.save() },
        { label: 'Save As...', action: () => this.save(true) },
        { sep: true }, { label: 'Exit', action: () => win.close() },
      ] },
      { label: 'Edit', items: [
        { label: 'Select All', action: () => this.ta.select() },
        { label: 'Time/Date', action: () => { const g = comp.game.state; this.ta.setRangeText(`Day ${g?.day ?? 1}, ${String(Math.floor((g?.clock ?? 0) / 60)).padStart(2, '0')}:${String((g?.clock ?? 0) % 60).padStart(2, '0')}`, this.ta.selectionStart, this.ta.selectionEnd, 'end'); this.dirty = true; } },
      ] },
    ]);
    win.body.appendChild(this.ta);
    this.title();
    setTimeout(() => { this.ta.setSelectionRange(0, 0); this.ta.focus({ preventScroll: true }); this.ta.scrollTop = 0; }, 50);
  }
  title() { this.win.setTitle(`${this.dirty ? '*' : ''}${this.path ? this.path.split('/').pop() : 'Untitled'} - Notepad`); }
  async save(as = false) {
    const fs = this.comp.fs;
    if (this.node?.dyn && !as) { this.comp.os.dialog({ title: 'Notepad', icon: 'warn', text: 'This file is read-only.<br><br>(It changes on its own. You did not write it.)' }); return; }
    if (!this.path || as) {
      const name = await this.comp.os.dialog({ title: 'Save As', icon: 'floppy', text: 'File name (saved in My Documents):', input: this.path ? this.path.split('/').pop() : 'note.txt', buttons: ['Save', 'Cancel'] });
      if (!name) return;
      const fname = /\.\w+$/.test(name) ? name : name + '.txt';
      this.path = fs.join('/My Documents', fname);
    }
    const dir = fs.parentPath(this.path), name = this.path.split('/').pop();
    fs.write(dir, { type: 'txt', name, text: this.ta.value });
    this.node = fs.get(this.path); this.ta.readOnly = false;
    this.dirty = false; this.title(); this.comp.audio('os.complete', 0.4);
  }
  beforeClose() {
    if (!this.dirty) return true;
    this.comp.os.dialog({ title: 'Notepad', icon: 'warn', text: `The text in ${this.path ? this.path.split('/').pop() : 'Untitled'} has changed.<br><br>Do you want to save the changes?`, buttons: ['Yes', 'No', 'Cancel'] }).then(async (r) => {
      if (r === 'Yes') { await this.save(); if (!this.dirty) this.win.close(); }
      else if (r === 'No') { this.dirty = false; this.win.close(); }
    });
    return false;
  }
}

class ImageView {
  constructor(win, comp, path) {
    this.win = win; this.comp = comp;
    const n = comp.fs.get(path);
    win.setTitle(`${path.split('/').pop().replace(/\.img$/, '.bmp')} - Image Viewer`);
    const view = h('div', { class: 'd98-imgview' });
    if (n?.data) { const img = h('img', { src: n.data }); view.appendChild(img); }
    else { const cv = canvas(240, 180); drawGenImage(n?.gen, cv.getContext('2d'), 240, 180); cv.style.width = '360px'; view.appendChild(cv); }
    win.setMenus([{ label: 'File', items: [
      { label: 'Set as Wallpaper', action: () => { const data = n?.data || view.querySelector('canvas')?.toDataURL(); comp.os.setWallpaper('paint', data); comp.audio('os.complete', 0.4); } },
      { label: 'Close', action: () => win.close() },
    ] }]);
    win.body.appendChild(view);
  }
}
