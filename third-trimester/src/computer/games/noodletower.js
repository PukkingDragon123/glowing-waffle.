// Noodle Tower — drop swinging noodle packets onto a wobbling tower. How high can a man go?
import { GameShell } from './shell.js';

export function registerNoodleTower(os, comp) {
  os.register('noodletower', { title: 'Noodle Tower', icon: 'noodle', w: 380, h: 470, minW: 260, minH: 320, create: (win) => new NoodleTower(win, comp) });
}

const FLAVOURS = [['#f2b134', 'CHICKEN'], ['#d63b26', 'INFERNO'], ['#3c8fd1', 'SHRIMP'], ['#6c8f2a', 'PICKLE?'], ['#9a5ac8', 'MYSTERY'], ['#e8e1cf', 'CUP']];
const BW = 56, BH = 16, FLOOR = 220;

class NoodleTower extends GameShell {
  constructor(win, comp) {
    super(win, comp, { id: 'noodletower', W: 240, H: 300 });
    this.state = 'title';
    this.onPress = () => this.act();
    this.onKeyDown = (k) => { if (k === ' ' || k === 'Enter' || k === 'ArrowDown') this.act(); };
  }
  act() { if (this.state === 'play') this.drop(); else this.start(); }
  start() {
    this.state = 'play'; this.stack = [{ x: 120, w: 80, col: '#6a4a2a', label: '' }]; this.lives = 3; this.score = 0; this.combo = 0;
    this.sway = 0; this.swayV = 0; this.camY = 0; this.falling = null; this.dead = []; this.popups = [];
    this.newBrick(); this.sfx('arcade.start', 0.5);
  }
  newBrick() {
    const f = FLAVOURS[Math.floor(Math.random() * FLAVOURS.length)];
    this.hold = { t: Math.random() * 6, col: f[0], label: f[1], w: BW };
  }
  get topY() { return FLOOR - this.stack.length * BH; }
  get craneY() { return this.topY - 90; }
  drop() {
    if (!this.hold || this.falling) return;
    const x = 120 + Math.sin(this.hold.t * this.speed) * 80;
    this.falling = { x, y: this.craneY + 14, vy: 0, col: this.hold.col, label: this.hold.label, w: this.hold.w };
    this.hold = null; this.sfx('os.release', 0.3);
  }
  get speed() { return 1.4 + Math.min(2.2, this.stack.length * 0.06); }
  step(dt) {
    if (this.state !== 'play') { for (const d of this.dead || []) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.r += d.vr * dt; } return; }
    if (this.hold) this.hold.t += dt;
    // tower physics-lite: a damped spring around 0, kicked by off-centre landings
    const k = 9 + this.stack.length * 0.05, damp = 1.1;
    this.swayV += (-k * this.sway - damp * this.swayV) * dt; this.sway += this.swayV * dt;
    this.sway += Math.sin(this.t * 1.7) * 0.004 * this.stack.length * dt;
    if (Math.abs(this.sway) > 1) this.collapse();
    const f = this.falling;
    if (f) {
      f.vy += 520 * dt; f.y += f.vy * dt;
      const top = this.stack[this.stack.length - 1];
      const landY = this.topY - BH;
      if (f.y >= landY) {
        const topX = top.x + this.swayOffset(this.stack.length - 1);
        const off = f.x - topX;
        if (Math.abs(off) > (top.w + f.w) / 2 - 4 || Math.abs(off) > top.w / 2 + 2) {
          // centre of mass outside the support: it tips off
          this.dead.push({ x: f.x, y: landY, vx: Math.sign(off || 1) * 60, vy: -40, r: 0, vr: Math.sign(off || 1) * 5, col: f.col, label: f.label, w: f.w });
          this.lives--; this.combo = 0; this.sfx('arcade.error', 0.5);
          this.popups.push({ x: f.x, y: landY - 10, s: 'SPLAT', c: '#f66', t: 1 });
          if (this.lives <= 0) this.over();
        } else {
          const perfect = Math.abs(off) < 3;
          this.stack.push({ x: perfect ? topX - this.swayOffset(this.stack.length) : f.x - this.swayOffset(this.stack.length), w: f.w, col: f.col, label: f.label });
          this.swayV += (off / top.w) * 2.6;
          if (perfect) { this.combo++; this.swayV *= 0.4; this.sway *= 0.6; this.score += 2 + this.combo; this.popups.push({ x: f.x, y: landY - 10, s: this.combo > 1 ? `PERFECT ×${this.combo}` : 'PERFECT!', c: '#ffd040', t: 1 }); this.sfx('arcade.bonus', 0.4); }
          else { this.combo = 0; this.score += 1; this.sfx('os.drop', 0.5); }
          if (this.stack.length % 10 === 0) { this.popups.push({ x: 120, y: this.topY - 30, s: `${this.stack.length * 12} cm!`, c: '#8ff', t: 1.6 }); this.sfx('arcade.levelup', 0.4); }
        }
        this.falling = null;
        if (this.state === 'play') this.newBrick();
      }
    }
    for (const d of this.dead) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.r += d.vr * dt; }
    this.dead = this.dead.filter((d) => d.y < this.camY + 400);
    for (const p of this.popups) { p.t -= dt; p.y -= 16 * dt; }
    this.popups = this.popups.filter((p) => p.t > 0);
    const want = Math.min(0, this.topY - 150);
    this.camY += (want - this.camY) * Math.min(1, dt * 3);
  }
  swayOffset(i) { return this.sway * Math.pow(i / Math.max(8, this.stack.length), 1.6) * 40; }
  collapse() {
    this.stack.forEach((b, i) => { if (i > 0) this.dead.push({ x: b.x + this.swayOffset(i), y: FLOOR - (i + 1) * BH, vx: this.sway * 60 * (0.5 + Math.random()), vy: -Math.random() * 60, r: 0, vr: (Math.random() - 0.5) * 6, col: b.col, label: b.label, w: b.w }); });
    this.stack.length = 1; this.over(true);
  }
  over(collapsed = false) {
    this.state = 'over'; this.collapsed = collapsed; this.falling = null; this.hold = null;
    if (this.score > this.hi) { this.hi = this.score; this.newHi = true; } else this.newHi = false;
    this.sfx('arcade.stop', 0.6);
  }
  brick(c, x, y, w, col, label, r = 0) {
    c.save(); c.translate(x, y + BH / 2); c.rotate(r);
    c.fillStyle = col; c.fillRect(-w / 2, -BH / 2, w, BH);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-w / 2, -BH / 2, w, 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-w / 2, BH / 2 - 2, w, 2);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(-w / 2 + 4, -4, w - 8, 8);
    c.fillStyle = '#222'; c.font = '6px Pixelify Sans, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label ? 'LUCKY ' + label : '', 0, 0);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.strokeRect(-w / 2 + 0.5, -BH / 2 + 0.5, w - 1, BH - 1);
    c.restore(); c.textAlign = 'left';
  }
  draw(c) {
    const W = 240, H = 300;
    const hgt = this.stack ? this.stack.length : 0;
    const t = Math.min(1, hgt / 60);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t > 0.7 ? '#05051a' : t > 0.35 ? '#2a4a9a' : '#8ac6ef'); g.addColorStop(1, t > 0.7 ? '#1a1440' : '#e8f4ff');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (t > 0.6) for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect((i * 53) % W, (i * 97) % H, 1, 1); }
    if (hgt > 80) { c.fillStyle = '#e8e4c8'; c.beginPath(); c.arc(190, 50, 22, 0, 7); c.fill(); }
    c.save(); c.translate(0, -this.camY || 0);
    // kitchen counter + wall tiles at the bottom
    c.fillStyle = '#d8d0b8'; c.fillRect(0, FLOOR - 220, W, 220);
    c.strokeStyle = 'rgba(0,0,0,0.08)'; for (let y = FLOOR - 220; y < FLOOR; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.fillStyle = '#5a3a20'; c.fillRect(0, FLOOR, W, 200); c.fillStyle = '#7a5a30'; c.fillRect(0, FLOOR, W, 4);
    if (this.stack) {
      this.stack.forEach((b, i) => this.brick(c, b.x + this.swayOffset(i), FLOOR - (i + 1) * BH, b.w, b.col, b.label, this.sway * 0.04 * (i / Math.max(8, hgt))));
      const cy = this.craneY;
      c.fillStyle = '#444'; c.fillRect(0, cy - 30, W, 4);
      if (this.hold) {
        const x = 120 + Math.sin(this.hold.t * this.speed) * 80;
        c.strokeStyle = '#333'; c.beginPath(); c.moveTo(x, cy - 26); c.lineTo(x, cy + 14); c.stroke();
        c.fillStyle = '#ffcc00'; c.fillRect(x - 6, cy - 30, 12, 6);
        this.brick(c, x, cy + 14, this.hold.w, this.hold.col, this.hold.label);
      }
      if (this.falling) this.brick(c, this.falling.x, this.falling.y, this.falling.w, this.falling.col, this.falling.label);
    }
    for (const d of this.dead || []) this.brick(c, d.x, d.y, d.w, d.col, d.label, d.r);
    for (const p of this.popups || []) this.text(p.s, p.x, p.y, 9, p.c, 'center');
    c.restore();
    if (this.state === 'title') {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, 0, W, H);
      this.text('NOODLE', 120, 70, 26, '#f2b134', 'center'); this.text('TOWER', 120, 98, 26, '#d63b26', 'center');
      this.text('Drop the packet with SPACE or a click.', 120, 140, 7, '#fff', 'center');
      this.text('Off-centre drops make the tower sway.', 120, 152, 7, '#ddd', 'center');
      this.text('Perfect drops steady it. 3 splats and you\'re done.', 120, 164, 7, '#ddd', 'center');
      if (Math.floor(this.t * 2) % 2) this.text('CLICK TO START', 120, 196, 10, '#fff', 'center');
      this.text(`BEST ${this.hi}`, 120, 220, 8, '#ffd040', 'center');
      return;
    }
    this.text(`HEIGHT ${(hgt - 1) * 12} cm`, 4, 8, 8, '#fff'); this.text(`SCORE ${this.score}`, 4, 20, 8, '#ffd040');
    this.text('🍜'.repeat(Math.max(0, this.lives)), 236, 8, 8, '#fff', 'right');
    if (this.state === 'over') {
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
      this.text(this.collapsed ? 'TIMBER!' : 'OUT OF NOODLES', 120, 110, 16, '#ff6060', 'center');
      this.text(`SCORE ${this.score}${this.newHi ? '  NEW BEST!' : ''}`, 120, 136, 9, this.newHi ? '#ffd040' : '#fff', 'center');
      this.text('click to stack again', 120, 166, 8, '#8f8', 'center');
    }
  }
}
