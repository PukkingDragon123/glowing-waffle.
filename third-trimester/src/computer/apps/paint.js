// Paint: pencil, brush, spray, eraser, flood fill, line, rectangle, ellipse, colour picker.
import { h, canvasPoint } from '../dom.js';

const PALETTE = ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'];
const TOOLS = [['pencil', '✏', 'Pencil'], ['brush', '🖌', 'Brush'], ['spray', '💨', 'Airbrush'], ['eraser', '▭', 'Eraser'], ['fill', '🪣', 'Fill'], ['pick', '💧', 'Pick colour'], ['line', '╱', 'Line'], ['rect', '▢', 'Rectangle'], ['ellipse', '◯', 'Ellipse'], ['text', 'A', 'Stamp: noodle']];

export function registerPaint(os, comp) {
  os.register('paint', { title: 'untitled - Paint', icon: 'paint', w: 560, h: 440, minW: 400, minH: 320, single: false, create: (win, args) => new Paint(win, comp, args.path) });
}

class Paint {
  constructor(win, comp, path) {
    this.win = win; this.comp = comp; this.tool = 'brush'; this.fg = '#000000'; this.bg = '#ffffff'; this.size = 4; this.undo = []; this.path = path || null;
    this.cv = h('canvas', { width: 400, height: 300 });
    this.ctx = this.cv.getContext('2d', { willReadFrequently: true });
    this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, 400, 300);
    this.overlay = null;
    win.setMenus([
      { label: 'File', items: [
        { label: 'New', action: () => { this.push(); this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, 400, 300); this.path = null; this.title(); } },
        { label: 'Save', action: () => this.save() },
        { label: 'Set As Wallpaper', action: () => { comp.os.setWallpaper('paint', this.cv.toDataURL()); comp.audio('os.complete', 0.5); comp.os.notify('Wallpaper changed', 'Your masterpiece is now your desktop. Gary would be proud.'); } },
        { sep: true }, { label: 'Exit', action: () => win.close() },
      ] },
      { label: 'Edit', items: [{ label: 'Undo', action: () => this.doUndo() }, { label: 'Clear Image', action: () => { this.push(); this.ctx.fillStyle = this.bg; this.ctx.fillRect(0, 0, 400, 300); } }] },
      { label: 'Image', items: [{ label: 'Flip Horizontal', action: () => this.flip() }, { label: 'Invert Colours', action: () => this.invert() }] },
    ]);
    const tools = h('div', { class: 'pt-tools d98-raised' });
    this.toolBtns = TOOLS.map(([id, ic, t]) => { const b = h('button', { class: 'd98-tool' + (id === this.tool ? ' on' : ''), title: t, onclick: () => { this.tool = id; this.toolBtns.forEach((x) => x.classList.toggle('on', x === b)); } }, ic); tools.appendChild(b); return b; });
    const sizes = h('div', { class: 'pt-sizes d98-sunken' });
    for (const s of [1, 3, 5, 9]) { const i = h('i', { style: { width: Math.max(2, s) + 'px', height: Math.max(2, s) + 'px' }, class: s === 5 ? 'on' : '', onclick: () => { this.size = s === 5 ? 4 : s; sizes.querySelectorAll('i').forEach((x) => x.classList.toggle('on', x === i)); } }); sizes.appendChild(i); }
    tools.appendChild(sizes);
    const wrap = h('div', { class: 'pt-canvaswrap' }, this.cv);
    this.cur = h('div', { class: 'pt-cur' }, h('i', { style: { background: this.bg, left: '12px', top: '12px' } }), h('i', { style: { background: this.fg } }));
    const sw = h('div', { class: 'pt-swatches' }, ...PALETTE.map((c) => h('i', { style: { background: c }, onpointerdown: (e) => { e.preventDefault(); if (e.button === 2) this.bg = c; else this.fg = c; this.updCur(); }, oncontextmenu: (e) => e.preventDefault() })));
    this.statusL = h('div', {}, 'For Help, ask Gary. Gary is unavailable.');
    win.body.append(h('div', { class: 'pt' }, tools, wrap), h('div', { class: 'pt-palette' }, this.cur, sw), h('div', { class: 'd98-status' }, this.statusL));
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => { const p = canvasPoint(this.cv, e); this.statusL.textContent = `${p.x | 0}, ${p.y | 0}`; });
    if (path) { const n = comp.fs.get(path); if (n?.data) { const img = new Image(); img.onload = () => this.ctx.drawImage(img, 0, 0); img.src = n.data; } }
    this.title();
  }
  title() { this.win.setTitle(`${this.path ? this.path.split('/').pop().replace(/\.img$/, '') : 'untitled'} - Paint`); }
  updCur() { this.cur.children[0].style.background = this.bg; this.cur.children[1].style.background = this.fg; }
  push() { this.undo.push(this.ctx.getImageData(0, 0, 400, 300)); if (this.undo.length > 20) this.undo.shift(); }
  doUndo() { const d = this.undo.pop(); if (d) this.ctx.putImageData(d, 0, 0); }
  down(e) {
    const right = e.button === 2; const col = right ? this.bg : this.fg;
    const p0 = canvasPoint(this.cv, e);
    const c = this.ctx;
    if (this.tool === 'pick') { const d = c.getImageData(p0.x | 0, p0.y | 0, 1, 1).data; const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); if (right) this.bg = hex; else this.fg = hex; this.updCur(); return; }
    this.push();
    if (this.tool === 'fill') { this.flood(p0.x | 0, p0.y | 0, col); this.comp.audio('os.drop', 0.3); return; }
    if (this.tool === 'text') { this.stamp(p0.x, p0.y, col); return; }
    this.cv.setPointerCapture(e.pointerId);
    const snap = c.getImageData(0, 0, 400, 300);
    let last = p0;
    const stroke = (a, b) => {
      c.strokeStyle = this.tool === 'eraser' ? this.bg : col; c.lineCap = 'round'; c.lineJoin = 'round';
      if (this.tool === 'pencil') { c.lineWidth = 1; c.beginPath(); c.moveTo((a.x | 0) + 0.5, (a.y | 0) + 0.5); c.lineTo((b.x | 0) + 0.5, (b.y | 0) + 0.5); c.stroke(); }
      else if (this.tool === 'spray') { c.fillStyle = col; for (let i = 0; i < 18; i++) { const r = Math.random() * this.size * 2.5, t = Math.random() * 6.28; c.fillRect(b.x + Math.cos(t) * r, b.y + Math.sin(t) * r, 1, 1); } }
      else { c.lineWidth = this.tool === 'eraser' ? this.size * 3 : this.size; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    };
    const shape = (b) => {
      c.putImageData(snap, 0, 0); c.strokeStyle = col; c.lineWidth = Math.max(1, this.size / 2);
      c.beginPath();
      if (this.tool === 'line') { c.moveTo(p0.x, p0.y); c.lineTo(b.x, b.y); }
      else if (this.tool === 'rect') c.rect(p0.x, p0.y, b.x - p0.x, b.y - p0.y);
      else c.ellipse((p0.x + b.x) / 2, (p0.y + b.y) / 2, Math.abs(b.x - p0.x) / 2, Math.abs(b.y - p0.y) / 2, 0, 0, 7);
      c.stroke();
    };
    const isShape = ['line', 'rect', 'ellipse'].includes(this.tool);
    if (!isShape) stroke(p0, p0);
    const mv = (ev) => { const p = canvasPoint(this.cv, ev); if (isShape) shape(p); else stroke(last, p); last = p; };
    const up = () => { this.cv.removeEventListener('pointermove', mv); this.cv.removeEventListener('pointerup', up); };
    this.cv.addEventListener('pointermove', mv); this.cv.addEventListener('pointerup', up);
  }
  stamp(x, y, col) {
    // a little bowl of noodles, because what else
    const c = this.ctx; c.save(); c.translate(x, y);
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI); c.fill();
    c.strokeStyle = '#e8c060'; c.lineWidth = 2; for (let i = -10; i <= 10; i += 4) { c.beginPath(); c.moveTo(i, 0); c.bezierCurveTo(i + 3, -8, i - 3, -12, i + 1, -18); c.stroke(); }
    c.strokeStyle = '#8a5a2a'; c.beginPath(); c.moveTo(4, -2); c.lineTo(16, -22); c.moveTo(8, -2); c.lineTo(20, -20); c.stroke();
    c.restore(); this.comp.audio('os.drop', 0.3);
  }
  flood(x, y, hex) {
    const img = this.ctx.getImageData(0, 0, 400, 300), d = img.data;
    const i0 = (y * 400 + x) * 4, tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
    const nr = parseInt(hex.slice(1, 3), 16), ng = parseInt(hex.slice(3, 5), 16), nb = parseInt(hex.slice(5, 7), 16);
    if (tr === nr && tg === ng && tb === nb) return;
    const match = (i) => Math.abs(d[i] - tr) < 24 && Math.abs(d[i + 1] - tg) < 24 && Math.abs(d[i + 2] - tb) < 24;
    const st = [[x, y]];
    while (st.length) {
      const [px, py] = st.pop(); let i = (py * 400 + px) * 4;
      if (px < 0 || py < 0 || px >= 400 || py >= 300 || !match(i)) continue;
      d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = 255;
      st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    this.ctx.putImageData(img, 0, 0);
  }
  flip() { this.push(); const t = document.createElement('canvas'); t.width = 400; t.height = 300; t.getContext('2d').drawImage(this.cv, 0, 0); this.ctx.save(); this.ctx.scale(-1, 1); this.ctx.drawImage(t, -400, 0); this.ctx.restore(); }
  invert() { this.push(); const img = this.ctx.getImageData(0, 0, 400, 300); for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; } this.ctx.putImageData(img, 0, 0); }
  async save() {
    const fs = this.comp.fs;
    let name = this.path ? this.path.split('/').pop() : null;
    if (!name) {
      const v = await this.comp.os.dialog({ title: 'Save As', icon: 'floppy', text: 'Save painting as (in My Documents\\Paintings):', input: 'my painting', buttons: ['Save', 'Cancel'] });
      if (!v) return; name = v.replace(/\.(img|bmp)$/i, '') + '.img';
    }
    fs.write('/My Documents/Paintings', { type: 'img', name, data: this.cv.toDataURL('image/png') });
    this.path = '/My Documents/Paintings/' + name; this.title(); this.comp.audio('os.complete', 0.5);
    this.comp.os.notify('Saved', `${name.replace(/\.img$/, '.bmp')} saved to My Documents\\Paintings.`);
  }
}
