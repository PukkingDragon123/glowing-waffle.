// Cinematic quick-time events, drawn as loose brush strokes on a full-screen 2D canvas.
// Every QTE returns a Promise<{ result: 'perfect'|'good'|'miss', score: 0..1 }>.
// Widgets can be anchored to a 3D point (anchor: () => {x, y} in CSS px).
import { game } from './game.js';
import { clamp, lerp, TAU } from './util.js';

const INK = '#f3e7cf', WARM = '#f0c27a', GOOD = '#9fe08a', BAD = '#e0705a';

function brushArc(ctx, x, y, r, a0, a1, width, color, seed = 1, passes = 3) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
  for (let p = 0; p < passes; p++) {
    ctx.globalAlpha = (p === 0 ? 0.9 : 0.35) * (ctx.__alpha ?? 1);
    ctx.lineWidth = width * (p === 0 ? 1 : 0.55 + 0.25 * Math.sin(seed * 3.1 + p));
    ctx.beginPath();
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 6));
    for (let i = 0; i <= steps; i++) {
      const a = lerp(a0, a1, i / steps);
      const rr = r + Math.sin(a * 5 + seed + p * 2) * 1.6 + (p - 1) * 1.4;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
function label(ctx, text, x, y, size = 22, color = INK, align = 'center') {
  ctx.save(); ctx.font = `italic ${size}px Spectral, Georgia, serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10; ctx.fillStyle = color; ctx.globalAlpha = ctx.__alpha ?? 1; ctx.fillText(text, x, y); ctx.restore();
}
function keycap(ctx, text, x, y, pulse = 0) {
  ctx.save(); ctx.globalAlpha = ctx.__alpha ?? 1; ctx.font = '600 15px Spectral, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.max(34, ctx.measureText(text).width + 18);
  ctx.fillStyle = `rgba(20,14,18,${0.75})`; ctx.strokeStyle = WARM; ctx.lineWidth = 1.5 + pulse * 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 15, w, 30, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = WARM; ctx.fillText(text, x, y + 1); ctx.restore();
}

export class QTE {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.active = null; this.fx = [];
    const rs = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; this.dpr = dpr; };
    rs(); window.addEventListener('resize', rs);
    this.pointer = { x: innerWidth / 2, y: innerHeight / 2, down: false, pressed: false, released: false };
    window.addEventListener('pointermove', (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; });
    window.addEventListener('pointerdown', (e) => { if (!this.active) return; if (e.target.closest?.('.d98,.choices,.menu,.panel')) return; this.pointer.down = true; this.pointer.pressed = true; });
    window.addEventListener('pointerup', () => { if (this.pointer.down) this.pointer.released = true; this.pointer.down = false; });
    this.keys = new Set(); this.keysPressed = new Set();
    window.addEventListener('keydown', (e) => { if (!this.active) return; if (!this.keys.has(e.code)) this.keysPressed.add(e.code); this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }
  get busy() { return !!this.active; }
  difficulty() { const d = game.settings.get('qte'); return d === 'relaxed' ? 1.6 : d === 'hard' ? 0.75 : 1; }
  hit() { return this.keysPressed.has('Space') || this.keysPressed.has('Enter') || this.pointer.pressed; }

  start(kind, opts, update) {
    if (this.active) this.active.finish({ result: 'miss', score: 0 });
    return new Promise((resolve) => {
      const q = { kind, opts, t: 0, alpha: 0, done: false, state: {}, update, anchor: opts.anchor };
      q.finish = (res) => {
        if (q.done) return; q.done = true; q.result = res; q.outT = 0;
        const s = res.result === 'perfect' ? 'qte.success' : res.result === 'good' ? 'qte.check' : 'qte.error';
        game.audio?.ui(s, { vol: 0.7 });
        this.burst(res.result, q.pos || { x: innerWidth / 2, y: innerHeight * 0.62 });
        setTimeout(() => { if (this.active === q) this.active = null; resolve(res); }, 380);
      };
      this.active = q;
      this.pointer.pressed = false; this.keysPressed.clear();
      if (opts.slowmo) game.timeScale = opts.slowmo;
    }).finally(() => { if (opts.slowmo) game.timeScale = 1; });
  }
  burst(result, pos) {
    const col = result === 'perfect' ? WARM : result === 'good' ? GOOD : BAD;
    const word = result === 'perfect' ? 'perfect' : result === 'good' ? 'good' : 'miss';
    this.fx.push({ t: 0, x: pos.x, y: pos.y, col, word });
  }
  center(q) { const a = q.anchor?.(); return a ? { x: a.x, y: a.y } : { x: innerWidth / 2, y: innerHeight * 0.62 }; }

  // ---- widgets ----
  // Needle sweeps a semicircle; press in the zone. zone = [a,b] in 0..1
  timing({ prompt = 'press', key = 'SPACE', zone = [0.62, 0.78], perfect = 0.04, speed = 0.55, loops = 3, anchor, slowmo } = {}) {
    const d = this.difficulty();
    const mid = (zone[0] + zone[1]) / 2, half = ((zone[1] - zone[0]) / 2) * d;
    return this.start('timing', { prompt, key, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.p = (s.p ?? 0) + dt * speed; const u = 1 - Math.abs(((s.p % 2) + 2) % 2 - 1);
      const { x, y } = q.pos = this.center(q); const R = 70;
      brushArc(ctx, x, y, R, Math.PI, TAU, 4, 'rgba(243,231,207,0.5)', 2);
      brushArc(ctx, x, y, R, Math.PI + (mid - half) * Math.PI, Math.PI + (mid + half) * Math.PI, 9, GOOD, 5);
      brushArc(ctx, x, y, R, Math.PI + (mid - perfect * d) * Math.PI, Math.PI + (mid + perfect * d) * Math.PI, 12, WARM, 7);
      const a = Math.PI + u * Math.PI;
      ctx.save(); ctx.globalAlpha = ctx.__alpha; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (R + 12), y + Math.sin(a) * (R + 12)); ctx.stroke(); ctx.restore();
      label(ctx, prompt, x, y - R - 34); keycap(ctx, key, x, y + 22);
      if (!q.done && this.hit()) {
        const dd = Math.abs(u - mid);
        q.finish(dd <= perfect * d ? { result: 'perfect', score: 1 } : dd <= half ? { result: 'good', score: 0.7 } : { result: 'miss', score: 0.15 });
      }
      if (!q.done && s.p > loops * 2) q.finish({ result: 'miss', score: 0 });
    });
  }
  // Shrinking ring closes onto a target circle.
  ring({ prompt = '', key = 'SPACE', dur = 1.6, anchor, slowmo } = {}) {
    const d = this.difficulty();
    return this.start('ring', { prompt, key, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt; const u = s.t / dur;
      const { x, y } = q.pos = this.center(q); const R = 34, r = lerp(150, 20, u);
      brushArc(ctx, x, y, R, 0, TAU, 6, WARM, 3);
      brushArc(ctx, x, y, r, 0, TAU, 3, INK, 9, 2);
      label(ctx, prompt, x, y - 90); keycap(ctx, key, x, y);
      if (!q.done && this.hit()) { const e = Math.abs(r - R) / (14 * d); q.finish(e < 0.35 ? { result: 'perfect', score: 1 } : e < 1 ? { result: 'good', score: 0.7 } : { result: 'miss', score: 0.1 }); }
      if (!q.done && r < 10) q.finish({ result: 'miss', score: 0 });
    });
  }
  // Mash to fill before time runs out.
  mash({ prompt = 'mash', key = 'SPACE', count = 14, dur = 4, anchor, slowmo, decay = 1.2 } = {}) {
    const d = this.difficulty();
    return this.start('mash', { prompt, key, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt; s.v = Math.max(0, (s.v ?? 0) - dt * decay / count * 4);
      if (this.hit()) { s.v += 1 / (count / d); s.kick = 1; game.audio?.ui('qte.press', { vol: 0.35, rate: 0.9 + s.v * 0.5 }); }
      s.kick = Math.max(0, (s.kick ?? 0) - dt * 6);
      const { x, y } = q.pos = this.center(q);
      brushArc(ctx, x, y, 56 + s.kick * 6, 0, TAU, 3, 'rgba(243,231,207,0.4)', 4);
      brushArc(ctx, x, y, 56 + s.kick * 6, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(s.v), 10, WARM, 6);
      label(ctx, prompt, x, y - 92); keycap(ctx, key, x, y, s.kick);
      ctx.save(); ctx.globalAlpha = 0.6 * ctx.__alpha; ctx.fillStyle = INK; ctx.fillRect(x - 40, y + 76, 80 * (1 - s.t / dur), 2); ctx.restore();
      if (!q.done && s.v >= 1) q.finish({ result: s.t < dur * 0.6 ? 'perfect' : 'good', score: 1 });
      if (!q.done && s.t > dur) q.finish({ result: s.v > 0.65 ? 'good' : 'miss', score: s.v });
    });
  }
  // Hold to fill a gauge; release inside the band. onLevel(v) lets the world mirror it (water level...).
  hold({ prompt = 'hold', key = 'SPACE', band = [0.72, 0.86], rate = 0.35, anchor, onLevel, slowmo, vertical = true } = {}) {
    const d = this.difficulty();
    const mid = (band[0] + band[1]) / 2, half = ((band[1] - band[0]) / 2) * d;
    return this.start('hold', { prompt, key, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; const held = this.keys.has('Space') || this.pointer.down;
      if (held) { s.started = true; s.v = Math.min(1.08, (s.v ?? 0) + dt * rate * (0.8 + (s.v ?? 0) * 0.6)); }
      onLevel?.(s.v ?? 0, held);
      const { x, y } = q.pos = this.center(q); const H = 170, W = 16;
      ctx.save(); ctx.globalAlpha = ctx.__alpha;
      ctx.strokeStyle = 'rgba(243,231,207,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x + 90, y - H / 2, W, H);
      ctx.fillStyle = 'rgba(159,224,138,0.5)'; ctx.fillRect(x + 90, y + H / 2 - (mid + half) * H, W, half * 2 * H);
      ctx.fillStyle = WARM; ctx.fillRect(x + 90 + 3, y + H / 2 - clamp(s.v ?? 0) * H, W - 6, clamp(s.v ?? 0) * H);
      ctx.restore();
      label(ctx, prompt, x, y - H / 2 - 26); keycap(ctx, held ? 'release!' : 'hold ' + key, x, y + H / 2 + 26, held ? 1 : 0);
      if (!q.done && s.started && !held) {
        const dd = Math.abs((s.v ?? 0) - mid);
        q.finish(dd < half * 0.35 ? { result: 'perfect', score: 1 } : dd < half ? { result: 'good', score: 0.7 } : { result: 'miss', score: 0.2, over: (s.v ?? 0) > mid });
      }
      if (!q.done && (s.v ?? 0) >= 1.08) q.finish({ result: 'miss', score: 0.1, over: true });
    });
  }
  // Drag in circles around a center (stirring, rocking, petting).
  circle({ prompt = 'stir', turns = 3, dur = 7, anchor, radius = 90, onTurn, slowmo } = {}) {
    const d = this.difficulty();
    return this.start('circle', { prompt, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt;
      const { x, y } = q.pos = this.center(q);
      const a = Math.atan2(this.pointer.y - y, this.pointer.x - x);
      const dist = Math.hypot(this.pointer.x - x, this.pointer.y - y);
      if (s.prev != null && this.pointer.down && dist > radius * 0.35 && dist < radius * 2.4) {
        let da = a - s.prev; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
        s.acc = (s.acc ?? 0) + Math.abs(da); onTurn?.(da, dt);
      }
      s.prev = a;
      const prog = clamp((s.acc ?? 0) / (TAU * turns / d));
      brushArc(ctx, x, y, radius, 0, TAU, 2, 'rgba(243,231,207,0.35)', 2, 2);
      brushArc(ctx, x, y, radius, s.t * 2, s.t * 2 + TAU * prog, 8, WARM, 4);
      const ga = s.t * 3; ctx.save(); ctx.globalAlpha = 0.8 * ctx.__alpha; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + Math.cos(ga) * radius, y + Math.sin(ga) * radius, 6, 0, TAU); ctx.fill(); ctx.restore();
      label(ctx, prompt, x, y - radius - 34); label(ctx, 'drag in circles', x, y + radius + 30, 15, 'rgba(243,231,207,0.7)');
      if (!q.done && prog >= 1) q.finish({ result: s.t < dur * 0.6 ? 'perfect' : 'good', score: 1 });
      if (!q.done && s.t > dur) q.finish({ result: prog > 0.6 ? 'good' : 'miss', score: prog });
    });
  }
  // Shake the pointer left/right quickly.
  shake({ prompt = 'shake', amount = 2600, dur = 4, anchor, onShake, slowmo } = {}) {
    const d = this.difficulty();
    return this.start('shake', { prompt, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt;
      const dx = s.px != null ? this.pointer.x - s.px : 0; s.px = this.pointer.x;
      if (s.pdx != null && Math.sign(dx) !== Math.sign(s.pdx) && Math.abs(dx) > 1) { s.flips = (s.flips ?? 0) + 1; onShake?.(); }
      if (Math.abs(dx) > 0.5) s.pdx = dx;
      s.acc = (s.acc ?? 0) + Math.abs(dx);
      const prog = clamp((s.acc ?? 0) / (amount / d) * 0.5 + (s.flips ?? 0) / (24 / d) * 0.5);
      const { x, y } = q.pos = this.center(q);
      const wob = Math.sin(s.t * 30) * 10 * Math.min(1, Math.abs(dx) / 8);
      label(ctx, prompt, x + wob, y - 80); label(ctx, '←  shake the mouse  →', x, y + 40, 16, 'rgba(243,231,207,0.75)');
      brushArc(ctx, x, y - 20, 34, -Math.PI / 2, -Math.PI / 2 + TAU * prog, 8, WARM, 4);
      if (!q.done && prog >= 1) q.finish({ result: s.t < dur * 0.6 ? 'perfect' : 'good', score: 1 });
      if (!q.done && s.t > dur) q.finish({ result: prog > 0.55 ? 'good' : 'miss', score: prog });
    });
  }
  // Drag from A to B (tearing, swiping). from/to in CSS px or functions returning points.
  swipe({ prompt = 'swipe', from, to, dur = 5, anchor, slowmo } = {}) {
    return this.start('swipe', { prompt, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt;
      const A = typeof from === 'function' ? from() : from, B = typeof to === 'function' ? to() : to;
      q.pos = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
      ctx.save(); ctx.globalAlpha = 0.5 * ctx.__alpha; ctx.setLineDash([8, 10]); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore();
      if (this.pointer.pressed && Math.hypot(this.pointer.x - A.x, this.pointer.y - A.y) < 60) s.go = true;
      if (s.go && this.pointer.down) {
        const ax = B.x - A.x, ay = B.y - A.y, L = Math.hypot(ax, ay);
        const t = clamp(((this.pointer.x - A.x) * ax + (this.pointer.y - A.y) * ay) / (L * L));
        const off = Math.abs((this.pointer.x - A.x) * ay - (this.pointer.y - A.y) * ax) / L;
        s.p = Math.max(s.p ?? 0, off < 90 ? t : s.p ?? 0);
      } else if (!this.pointer.down && s.go && (s.p ?? 0) < 0.95) { s.go = false; }
      const p = s.p ?? 0;
      ctx.save(); ctx.globalAlpha = ctx.__alpha; ctx.strokeStyle = WARM; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(lerp(A.x, B.x, p), lerp(A.y, B.y, p)); ctx.stroke(); ctx.restore();
      brushArc(ctx, A.x, A.y, 16 + Math.sin(s.t * 6) * 3, 0, TAU, 3, WARM, 2, 2);
      label(ctx, prompt, q.pos.x, Math.min(A.y, B.y) - 50);
      if (!q.done && p >= 0.95) q.finish({ result: s.t < dur * 0.5 ? 'perfect' : 'good', score: 1 });
      if (!q.done && s.t > dur) q.finish({ result: p > 0.6 ? 'good' : 'miss', score: p });
    });
  }
  // Press on the beat. beats: number of hits, bpm.
  rhythm({ prompt = 'on the beat', key = 'SPACE', beats = 6, bpm = 70, anchor, onBeat, onHit, slowmo, lead = 1.2 } = {}) {
    const d = this.difficulty(); const period = 60 / bpm;
    return this.start('rhythm', { prompt, key, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? -lead) + dt; s.hits = s.hits ?? []; s.score = s.score ?? 0; s.judged = s.judged ?? 0;
      const { x, y } = q.pos = this.center(q);
      const beatIdx = Math.round(s.t / period), nearest = beatIdx * period, err = Math.abs(s.t - nearest);
      if (s.lastBeat !== beatIdx && s.t >= nearest && beatIdx >= 0 && beatIdx < beats) { s.lastBeat = beatIdx; onBeat?.(beatIdx); }
      const phase = ((s.t / period) % 1 + 1) % 1;
      const pulse = Math.exp(-phase * 6);
      brushArc(ctx, x, y, 40 + pulse * 10, 0, TAU, 5, WARM, 3);
      for (let i = 0; i < beats; i++) {
        const bx = x - (beats - 1) * 14 + i * 28;
        ctx.save(); ctx.globalAlpha = ctx.__alpha; ctx.fillStyle = s.hits[i] === 'p' ? WARM : s.hits[i] === 'g' ? GOOD : s.hits[i] === 'm' ? BAD : 'rgba(243,231,207,0.3)';
        ctx.beginPath(); ctx.arc(bx, y + 78, 6, 0, TAU); ctx.fill(); ctx.restore();
      }
      label(ctx, prompt, x, y - 82); keycap(ctx, key, x, y, pulse);
      if (!q.done && this.hit() && beatIdx >= 0 && beatIdx < beats && s.hits[beatIdx] == null) {
        const tol = 0.16 * d;
        const r = err < tol * 0.4 ? 'p' : err < tol ? 'g' : 'm'; s.hits[beatIdx] = r;
        s.score += r === 'p' ? 1 : r === 'g' ? 0.7 : 0; onHit?.(r);
        game.audio?.ui(r === 'm' ? 'qte.error' : 'qte.press', { vol: 0.4 });
      }
      for (let i = 0; i < beats; i++) if (s.hits[i] == null && s.t > i * period + 0.3 * d) { s.hits[i] = 'm'; onHit?.('m'); }
      if (!q.done && s.t > (beats - 1) * period + 0.45) {
        const sc = s.score / beats;
        q.finish({ result: sc > 0.85 ? 'perfect' : sc > 0.5 ? 'good' : 'miss', score: sc });
      }
    });
  }
  // Press keys in order.
  keys({ prompt = 'quick!', seq = ['KeyA', 'KeyD'], dur = 4, anchor, slowmo } = {}) {
    const d = this.difficulty(); const names = seq.map((k) => k.replace('Key', '').replace('Arrow', '').replace('Digit', ''));
    return this.start('keys', { prompt, anchor, slowmo }, (q, dt, ctx) => {
      const s = q.state; s.t = (s.t ?? 0) + dt; s.i = s.i ?? 0;
      const { x, y } = q.pos = this.center(q);
      label(ctx, prompt, x, y - 60);
      names.forEach((n, i) => keycap(ctx, n, x - (names.length - 1) * 26 + i * 52, y, i === s.i ? 1 : 0));
      for (const k of this.keysPressed) { if (k === seq[s.i]) { s.i++; game.audio?.ui('qte.press', { vol: 0.4 }); } else { s.err = (s.err ?? 0) + 1; game.audio?.ui('qte.error', { vol: 0.3 }); } }
      ctx.save(); ctx.globalAlpha = 0.6 * ctx.__alpha; ctx.fillStyle = INK; ctx.fillRect(x - 60, y + 34, 120 * (1 - s.t / (dur * d)), 2); ctx.restore();
      if (!q.done && s.i >= seq.length) q.finish({ result: (s.err ?? 0) === 0 ? 'perfect' : 'good', score: 1 });
      if (!q.done && s.t > dur * d) q.finish({ result: 'miss', score: s.i / seq.length });
    });
  }

  update(dt) {
    const ctx = this.ctx, q = this.active;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (q) {
      if (!q.done) q.alpha = Math.min(1, q.alpha + dt * 5); else { q.outT += dt; q.alpha = Math.max(0, 1 - q.outT * 3); }
      ctx.__alpha = q.alpha;
      const realDt = dt; // QTEs run on real time regardless of slowmo
      if (!q.done) q.update(q, realDt, ctx); else if (q.alpha > 0) q.update({ ...q, done: true, state: q.state }, 0, ctx);
    }
    for (const f of this.fx) {
      f.t += dt; const a = Math.max(0, 1 - f.t / 0.9); ctx.__alpha = a;
      brushArc(ctx, f.x, f.y, 40 + f.t * 160, 0, TAU, 6 * a + 1, f.col, 11, 2);
      label(ctx, f.word, f.x, f.y - 40 - f.t * 40, 30, f.col);
    }
    this.fx = this.fx.filter((f) => f.t < 0.9);
    ctx.__alpha = 1;
    this.pointer.pressed = false; this.pointer.released = false; this.keysPressed.clear();
  }
}
