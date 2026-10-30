// Shared bits for the canvas minigames: fixed 320×240 framebuffer, keys, pause when unfocused.
import { h, canvasPoint } from '../dom.js';

export class GameShell {
  constructor(win, comp, { id, W = 320, H = 240 }) {
    this.win = win; this.comp = comp; this.id = id; this.W = W; this.H = H;
    this.cv = h('canvas', { width: W, height: H, tabindex: 0 });
    this.c = this.cv.getContext('2d');
    this.keys = new Set(); this.pointer = { x: W / 2, y: H / 2, down: false };
    this.focused = true; this.t = 0;
    this.box = h('div', { class: 'game' }, this.cv);
    win.body.appendChild(this.box);
    this.cv.addEventListener('pointerdown', (e) => { this.cv.setPointerCapture(e.pointerId); Object.assign(this.pointer, canvasPoint(this.cv, e)); this.pointer.down = true; this.onPress?.(); });
    this.cv.addEventListener('pointermove', (e) => Object.assign(this.pointer, canvasPoint(this.cv, e)));
    this.cv.addEventListener('pointerup', () => { this.pointer.down = false; this.onRelease?.(); });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  get hi() { return this.comp.scores[this.id] || 0; }
  set hi(v) { this.comp.scores[this.id] = v; }
  key(...names) { return names.some((n) => this.keys.has(n)); }
  onKey(e, down) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) { if (!this.keys.has(k)) { this.keys.add(k); this.onKeyDown?.(k); } } else this.keys.delete(k);
    return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's', 'Enter', 'p'].includes(k);
  }
  onBlur() { this.focused = false; this.keys.clear(); this.pointer.down = false; }
  onFocus() { this.focused = true; }
  fit() {
    const bw = this.box.clientWidth, bh = this.box.clientHeight; if (!bw || !bh) return;
    if (bw === this._bw && bh === this._bh) return; this._bw = bw; this._bh = bh;
    const s = Math.min(bw / this.W, bh / this.H);
    this.cv.style.width = Math.floor(this.W * s) + 'px'; this.cv.style.height = Math.floor(this.H * s) + 'px';
  }
  tick(dt, active) {
    this.fit();
    const paused = !active || !this.comp.isOpen;
    if (!paused) { this.t += dt; this.step?.(Math.min(dt, 0.05)); }
    this.draw?.(this.c);
    if (paused) {
      const c = this.c; c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, this.W, this.H);
      this.text('PAUSED', this.W / 2, this.H / 2 - 6, 16, '#fff', 'center'); this.text('click to resume', this.W / 2, this.H / 2 + 12, 8, '#aaa', 'center');
    }
  }
  text(s, x, y, size = 8, col = '#fff', align = 'left', font = 'Pixelify Sans, monospace') {
    const c = this.c; c.font = `${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(s, x + 1, y + 1); c.fillStyle = col; c.fillText(s, x, y); c.textAlign = 'left';
  }
  sfx(name, vol = 0.5) { this.comp.audio(name, vol); }
}
