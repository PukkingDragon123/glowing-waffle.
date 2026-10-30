// ABDUCTOR — pilot a saucer, beam up cows and confused farmers, dodge DTP jets.
import { GameShell } from './shell.js';
import { seeded } from '../dom.js';

export function registerAbductor(os, comp) {
  os.register('abductor', { title: 'ABDUCTOR', icon: 'abductor', w: 500, h: 420, minW: 340, minH: 300, create: (win) => new Abductor(win, comp) });
}

const WORLD = 960, GROUND = 214;

class Abductor extends GameShell {
  constructor(win, comp) {
    super(win, comp, { id: 'abductor' });
    const r = seeded(77);
    this.stars = Array.from({ length: 90 }, () => [r() * WORLD, r() * 150, r()]);
    this.hills = Array.from({ length: 24 }, (_, i) => [i * 60 + r() * 30, 30 + r() * 40]);
    this.barns = Array.from({ length: 4 }, () => [80 + r() * (WORLD - 160)]);
    this.state = 'title';
    this.onPress = () => { if (this.state !== 'play') this.start(); };
    this.onKeyDown = (k) => { if ((k === ' ' || k === 'Enter') && this.state !== 'play') this.start(); };
  }
  onClose() { this.beamLoop?.stop(0.1); }
  start() {
    this.state = 'play'; this.score = 0; this.lives = 3; this.wave = 1; this.quota = 5; this.got = 0;
    this.ship = { x: WORLD / 2, y: 60, vx: 0, vy: 0, inv: 0 };
    this.energy = 100; this.beam = false;
    this.ents = []; this.jets = []; this.bullets = []; this.parts = []; this.popups = [];
    this.jetT = 6; this.cam = this.ship.x - 160;
    for (let i = 0; i < 7; i++) this.spawn('cow');
    for (let i = 0; i < 2; i++) this.spawn('farmer');
    this.sfx('arcade.start', 0.6);
  }
  spawn(type, x) {
    const gold = type === 'cow' && Math.random() < 0.06;
    this.ents.push({ type, gold, x: x ?? 20 + Math.random() * (WORLD - 40), y: GROUND, vx: (Math.random() - 0.5) * 12, vy: 0, lift: false, dir: 1, t: Math.random() * 10, fear: 0, shoot: 2 + Math.random() * 3 });
  }
  step(dt) {
    if (this.state !== 'play') return;
    const s = this.ship;
    const ax = (this.key('arrowright', 'ArrowRight', 'd') ? 1 : 0) - (this.key('arrowleft', 'ArrowLeft', 'a') ? 1 : 0);
    const ay = (this.key('ArrowDown', 's') ? 1 : 0) - (this.key('ArrowUp', 'w') ? 1 : 0);
    let tx = ax;
    if (!ax && this.pointer.down) { const wx = this.pointer.x + this.cam; tx = Math.abs(wx - s.x) > 6 ? Math.sign(wx - s.x) : 0; }
    s.vx += tx * 420 * dt; s.vy += ay * 300 * dt;
    s.vx *= Math.pow(0.08, dt); s.vy *= Math.pow(0.05, dt);
    s.x = Math.max(20, Math.min(WORLD - 20, s.x + s.vx * dt)); s.y = Math.max(28, Math.min(110, s.y + s.vy * dt));
    s.inv = Math.max(0, s.inv - dt);
    this.cam += (s.x - 160 - this.cam) * Math.min(1, dt * 4); this.cam = Math.max(0, Math.min(WORLD - 320, this.cam));
    const want = this.key(' ') || (this.pointer.down && this.pointer.y > s.y + 10 - 0);
    this.beam = want && this.energy > 0;
    this.energy = Math.max(0, Math.min(100, this.energy + (this.beam ? -28 : 16) * dt));
    if (this.beam && !this.beamLoop) this.beamLoop = this.comp.game.audio?.loop?.('drone', { vol: 0.12, rate: 1.6, bus: 'ui' });
    if (!this.beam && this.beamLoop) { this.beamLoop.stop(0.1); this.beamLoop = null; }
    const halfW = (y) => 6 + (y - s.y) * 0.32;
    for (const e of this.ents) {
      e.t += dt;
      const inBeam = this.beam && Math.abs(e.x - s.x) < halfW(e.y) && e.y > s.y;
      if (inBeam) {
        e.lift = true; e.vy = -38 - (e.type === 'farmer' ? 0 : 6); e.x += (s.x - e.x) * dt * 2;
        if (e.type === 'farmer' && Math.random() < dt * 2) this.popups.push({ x: e.x, y: e.y - 10, t: 0.8, s: '?!' });
      } else if (e.y < GROUND || e.vy < 0) { e.lift = false; e.vy += 260 * dt; }
      e.y += e.vy * dt;
      if (e.y >= GROUND) { if (e.vy > 120) { e.vy = -e.vy * 0.35; this.parts.push(...this.dust(e.x, GROUND)); this.popups.push({ x: e.x, y: e.y - 12, t: 0.8, s: e.type === 'cow' ? 'moo?' : 'oof' }); } else { e.vy = 0; e.y = GROUND; } }
      if (e.y >= GROUND - 0.5) {
        e.fear = Math.max(0, e.fear - dt);
        const d = e.x - s.x;
        if (e.type === 'farmer' && Math.abs(d) < 60) { e.vx = Math.sign(d || 1) * 34; e.fear = 1; }
        else if (Math.random() < dt * 0.4) e.vx = (Math.random() - 0.5) * (e.type === 'cow' ? 14 : 24);
        e.x = Math.max(8, Math.min(WORLD - 8, e.x + e.vx * dt)); if (e.vx) e.dir = Math.sign(e.vx);
      }
      if (e.type === 'soldier' && e.y >= GROUND - 0.5) {
        e.shoot -= dt;
        if (e.shoot <= 0 && Math.abs(e.x - s.x) < 140) { e.shoot = 2.2 + Math.random() * 2; const dx = s.x - e.x, dy = s.y - e.y, l = Math.hypot(dx, dy); this.bullets.push({ x: e.x, y: e.y - 6, vx: dx / l * 90, vy: dy / l * 90 }); }
      }
      if (e.y < s.y + 8 && e.lift) {
        e.gone = true;
        const pts = e.type === 'cow' ? (e.gold ? 100 : 10) : e.type === 'farmer' ? 25 : 40;
        this.score += pts; this.popups.push({ x: s.x, y: s.y - 14, t: 1, s: '+' + pts, c: e.gold ? '#ffd040' : '#8f8' });
        this.sfx(e.gold ? 'arcade.bonus' : 'arcade.reward', 0.45);
        if (e.type === 'cow') this.got++;
        setTimeout(() => this.state === 'play' && this.spawn(e.type === 'soldier' ? 'soldier' : Math.random() < 0.75 ? 'cow' : 'farmer', s.x > WORLD / 2 ? 30 : WORLD - 30), 1500);
      }
    }
    this.ents = this.ents.filter((e) => !e.gone);
    if (this.got >= this.quota) {
      this.wave++; this.got = 0; this.quota = 5 + this.wave * 2; this.score += 50 * this.wave;
      this.popups.push({ x: this.cam + 160, y: 100, t: 2, s: `WAVE ${this.wave}!`, c: '#ff0', big: true }); this.sfx('arcade.levelup', 0.6);
      for (let i = 0; i < Math.min(4, this.wave - 1); i++) this.spawn('soldier');
    }
    // jets
    this.jetT -= dt;
    if (this.jetT <= 0) { this.jetT = Math.max(2.5, 9 - this.wave * 0.9) + Math.random() * 3; const dir = Math.random() < 0.5 ? 1 : -1; this.jets.push({ dir, y: Math.max(26, Math.min(112, s.y + (Math.random() - 0.5) * 30)), x: dir > 0 ? this.cam - 160 : this.cam + 480, warn: 1.3 }); }
    for (const j of this.jets) {
      if (j.warn > 0) { j.warn -= dt; continue; }
      j.x += j.dir * (230 + this.wave * 12) * dt;
      if (s.inv <= 0 && Math.abs(j.x - s.x) < 18 && Math.abs(j.y - s.y) < 9) this.hit();
    }
    this.jets = this.jets.filter((j) => j.warn > 0 || (j.x > this.cam - 300 && j.x < this.cam + 620));
    for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (s.inv <= 0 && Math.abs(b.x - s.x) < 13 && Math.abs(b.y - s.y) < 6) { b.dead = true; this.hit(); } }
    this.bullets = this.bullets.filter((b) => !b.dead && b.y > 0 && b.y < 240);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 80 * dt; p.t -= dt; }
    this.parts = this.parts.filter((p) => p.t > 0);
    for (const p of this.popups) { p.t -= dt; p.y -= 14 * dt; }
    this.popups = this.popups.filter((p) => p.t > 0);
  }
  dust(x, y) { return Array.from({ length: 6 }, () => ({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40, t: 0.5, c: '#8a7a5a' })); }
  hit() {
    const s = this.ship; this.lives--; s.inv = 2; this.sfx('arcade.error', 0.6);
    this.parts.push(...Array.from({ length: 16 }, () => ({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, t: 0.7, c: Math.random() < 0.5 ? '#ff8030' : '#ffe060' })));
    if (this.lives <= 0) { this.state = 'over'; this.beamLoop?.stop(0.1); this.beamLoop = null; if (this.score > this.hi) { this.hi = this.score; this.newHi = true; } else this.newHi = false; this.sfx('arcade.stop', 0.6); }
  }
  draw(c) {
    const W = 320, H = 240, cam = this.state === 'title' ? (this.t * 20) % (WORLD - 320) : this.cam;
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05051a'); g.addColorStop(0.7, '#1a1440'); g.addColorStop(1, '#2a1a3a');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const [x, y, b] of this.stars) { const sx = ((x - cam * 0.2) % WORLD + WORLD) % WORLD; if (sx < W) { c.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7 * (0.7 + 0.3 * Math.sin(this.t * 3 + x))})`; c.fillRect(sx | 0, y | 0, 1, 1); } }
    c.fillStyle = '#e8e4c8'; c.beginPath(); c.arc(260 - cam * 0.05, 40, 14, 0, 7); c.fill(); c.fillStyle = '#05051a'; c.beginPath(); c.arc(254 - cam * 0.05, 36, 13, 0, 7); c.fill();
    c.fillStyle = '#1a2a1a';
    for (const [x, hh] of this.hills) { const sx = x - cam * 0.5; c.beginPath(); c.ellipse(sx, GROUND, 60, hh, 0, Math.PI, 0); c.fill(); }
    c.fillStyle = '#2a3a1a'; c.fillRect(0, GROUND + 4, W, H);
    c.fillStyle = '#3a4a20'; c.fillRect(0, GROUND + 4, W, 3);
    for (const [bx] of this.barns) { const sx = bx - cam; if (sx > -40 && sx < W + 40) { c.fillStyle = '#5a1a14'; c.fillRect(sx - 16, GROUND - 22, 32, 26); c.beginPath(); c.moveTo(sx - 19, GROUND - 22); c.lineTo(sx, GROUND - 36); c.lineTo(sx + 19, GROUND - 22); c.fill(); c.fillStyle = '#ffd890'; c.fillRect(sx - 4, GROUND - 12, 8, 16); } }
    if (this.state === 'title' || !this.ship) return this.titleScreen(c);
    const s = this.ship;
    if (this.beam) {
      const sx = s.x - cam;
      const gr = c.createLinearGradient(0, s.y, 0, GROUND + 4); gr.addColorStop(0, 'rgba(140,255,150,0.7)'); gr.addColorStop(1, 'rgba(140,255,150,0.12)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(sx - 6, s.y + 4); c.lineTo(sx + 6, s.y + 4); c.lineTo(sx + 6 + (GROUND - s.y) * 0.32, GROUND + 4); c.lineTo(sx - 6 - (GROUND - s.y) * 0.32, GROUND + 4); c.fill();
      for (let i = 0; i < 5; i++) { const yy = s.y + ((this.t * 60 + i * 30) % (GROUND - s.y)); c.fillStyle = 'rgba(200,255,200,0.3)'; c.fillRect(sx - 6 - (yy - s.y) * 0.32, yy | 0, 12 + (yy - s.y) * 0.64, 1); }
    }
    for (const e of this.ents) this.drawEnt(c, e, e.x - cam, e.y);
    for (const b of this.bullets) { c.fillStyle = '#ff6'; c.fillRect(b.x - cam - 1, b.y - 1, 2, 2); }
    if (!(s.inv > 0 && Math.floor(this.t * 12) % 2)) this.drawShip(c, s.x - cam, s.y);
    for (const j of this.jets) {
      if (j.warn > 0) { if (Math.floor(this.t * 8) % 2) this.text('!', j.dir > 0 ? 6 : W - 10, j.y, 14, '#ff3030'); continue; }
      const jx = j.x - cam; c.save(); c.translate(jx, j.y); c.scale(j.dir, 1);
      c.fillStyle = '#7a8a9a'; c.beginPath(); c.moveTo(14, 0); c.lineTo(-10, -3); c.lineTo(-14, -8); c.lineTo(-12, 0); c.lineTo(-14, 3); c.lineTo(-10, 3); c.fill();
      c.fillStyle = '#2a3a4a'; c.fillRect(-4, -1, 8, 2); c.fillStyle = `rgba(255,160,40,${0.6 + Math.random() * 0.4})`; c.fillRect(-18, -1, 4, 2);
      c.restore();
    }
    for (const p of this.parts) { c.fillStyle = p.c; c.fillRect(p.x - cam, p.y, 2, 2); }
    for (const p of this.popups) this.text(p.s, p.x - cam, p.y, p.big ? 14 : 8, p.c || '#fff', 'center');
    // HUD
    this.text(`SCORE ${this.score}`, 4, 8, 8, '#8f8'); this.text(`HI ${Math.max(this.hi, this.score)}`, 120, 8, 8, '#aaa');
    this.text('♥'.repeat(Math.max(0, this.lives)), 316, 8, 9, '#f55', 'right');
    this.text(`WAVE ${this.wave}  COWS ${this.got}/${this.quota}`, 4, 20, 7, '#ccc');
    c.fillStyle = '#123'; c.fillRect(220, 17, 60, 5); c.fillStyle = this.energy > 25 ? '#6f6' : '#f84'; c.fillRect(220, 17, 60 * this.energy / 100, 5); this.text('BEAM', 284, 20, 7, '#ccc');
    if (this.state === 'over') {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
      this.text('GAME OVER', 160, 96, 20, '#ff5050', 'center');
      this.text('The DTP thanks you for your cooperation.', 160, 120, 8, '#ddd', 'center');
      this.text(`SCORE ${this.score}${this.newHi ? '  NEW HIGH SCORE!' : ''}`, 160, 140, 9, this.newHi ? '#ffd040' : '#fff', 'center');
      this.text('SPACE / click to fly again', 160, 168, 8, '#8f8', 'center');
    }
  }
  titleScreen(c) {
    this.drawShip(c, 160 + Math.sin(this.t) * 50, 70 + Math.sin(this.t * 2) * 5);
    this.text('ABDUCTOR', 160, 30, 26, '#8fff8f', 'center');
    this.text('← → move   ↑ ↓ altitude   SPACE / hold mouse: tractor beam', 160, 118, 7, '#ddd', 'center');
    this.text('Beam up cows. Farmers are worth more. Gold cows are worth a lot.', 160, 132, 7, '#bbb', 'center');
    this.text('Dodge the DTP jets. Watch your beam energy.', 160, 144, 7, '#bbb', 'center');
    if (Math.floor(this.t * 2) % 2) this.text('PRESS SPACE OR CLICK TO START', 160, 172, 9, '#fff', 'center');
    this.text(`HIGH SCORE ${this.hi}`, 160, 192, 8, '#ffd040', 'center');
  }
  drawShip(c, x, y) {
    c.fillStyle = 'rgba(120,255,140,0.2)'; c.beginPath(); c.ellipse(x, y + 5, 20, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#7fd7ff'; c.beginPath(); c.ellipse(x, y - 2, 7, 6, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#c0c4d0'; c.beginPath(); c.ellipse(x, y, 18, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#8a8ea0'; c.fillRect(x - 18, y, 36, 2);
    for (let i = 0; i < 5; i++) { c.fillStyle = Math.floor(this.t * 6 + i) % 5 === 0 ? '#ff0' : '#f80'; c.fillRect(x - 12 + i * 6, y + 1, 2, 2); }
  }
  drawEnt(c, e, x, y) {
    c.save(); c.translate(x | 0, y | 0); c.scale(e.dir || 1, 1);
    const wob = e.lift ? Math.sin(this.t * 14) * 0.3 : 0; c.rotate(wob);
    if (e.type === 'cow') {
      c.fillStyle = e.gold ? '#ffd040' : '#f4f0e8'; c.fillRect(-7, -9, 14, 7); c.fillRect(5, -11, 5, 5);
      c.fillStyle = e.gold ? '#c09010' : '#222'; c.fillRect(-4, -8, 3, 3); c.fillRect(1, -6, 3, 2); c.fillRect(8, -10, 1, 1);
      c.fillStyle = '#e8a0a0'; c.fillRect(9, -7, 2, 2);
      const step = e.lift ? 0 : Math.sin(e.t * 10) > 0 ? 1 : 0;
      c.fillStyle = '#333'; c.fillRect(-6, -2, 2, 2 + step); c.fillRect(3, -2, 2, 3 - step); c.fillRect(-2, -2, 2, 2 + step);
    } else if (e.type === 'farmer') {
      c.fillStyle = '#3a5aa0'; c.fillRect(-3, -9, 6, 7); c.fillStyle = '#e8b890'; c.fillRect(-2, -13, 4, 4);
      c.fillStyle = '#c8a040'; c.fillRect(-4, -14, 8, 2); c.fillStyle = '#5a3a1a'; c.fillRect(-3, -2, 2, 2); c.fillRect(1, -2, 2, 2);
      c.fillStyle = '#888'; c.fillRect(4, -16, 1, 12); c.fillRect(3, -17, 3, 1);
    } else {
      c.fillStyle = '#1a1a1a'; c.fillRect(-3, -9, 6, 7); c.fillStyle = '#333'; c.fillRect(-3, -13, 6, 4); c.fillStyle = '#4af'; c.fillRect(-1, -12, 3, 1);
      c.fillStyle = '#555'; c.fillRect(2, -11, 6, 1);
    }
    c.restore();
  }
}
