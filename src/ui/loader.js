// While the world is built: black, a pool of light, Mochi running and
// running and getting nowhere (menuChase.js; the menu grows out of the same
// scene). Underneath, a thin line that fills with the real work: bytes
// downloaded, each part of the world built, each shader compiled. Small text
// says which, and a line of the day drifts past. When she sits, click.
import { G } from '../core/globals.js';
import { COARSE } from '../core/settings.js';
import { Chase } from './menuChase.js';

const $ = (id) => document.getElementById(id);
const KEY = 'bengrim_load_v1';
// stages in order: what the small text says, and seconds it took on a desktop
// (replaced by this browser's own times after the first load)
const STAGES = [
  ['fetch', 'fetching the furniture', 5.5], ['apartment', 'building apartment 4B', 3.6], ['building', 'the fourth floor', 2.6],
  ['body', 'your body', 2.5], ['sky', 'Manhattan, across the river', 1.3], ['nav', 'where Mochi can go', 0.1],
  ['cast', 'the desk, the phone, the cat', 0.2], ['shaders', 'compiling shaders', 1],
];
const later = (fn, ms) => setTimeout(fn, ms);

export class Loader {
  constructor() {
    this.chase = G.chase = new Chase();
    this.bar = $('boot-bar'); this.stageEl = $('boot-stage'); this.pctEl = $('boot-pct');
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* storage blocked */ }
    // each stage's share of the bar is how long it took last time
    this.est = {}; let sum = 0;
    for (const [k, , d] of STAGES) { this.est[k] = Math.max(0.05, (prev && prev[k]) || d); sum += this.est[k]; }
    this.span = {}; let acc = 0;
    for (const [k, label] of STAGES) { this.span[k] = { a: acc / sum, b: (acc + this.est[k]) / sum, label }; acc += this.est[k]; }
    this.times = {}; this.cur = null; this.t0 = 0; this.lastFrame = 0; this.shown = -1;
    this.touchWords();
  }

  touchWords() {
    if (!(COARSE || (G.input && G.input.touch))) return;
    const h = $('boot-hint'); if (h) h.textContent = 'tap to begin';
    const w = $('boot-warn'); if (w) w.textContent = 'headphones · body horror, blood, flashing lights · left thumb walks, right thumb looks, tap to use';
  }

  async warm() {
    // compile the cat's shaders before the first frame so it never pops in
    try { await G.engine.renderer.compileAsync(this.chase.scene, this.chase.cam); } catch (e) { /* older drivers */ }
  }

  // ---------------------------------------------------------- progress
  // the bar goes to p; over `dur` seconds it glides there on the compositor, so it
  // keeps moving even while a long build step holds the main thread
  to(p, dur = 0.35) {
    if (!this.bar) return;
    this.bar.style.transition = `transform ${dur.toFixed(2)}s ${dur > 0.6 ? 'linear' : 'ease-out'}`;
    this.bar.style.transform = `scaleX(${Math.min(1, p).toFixed(4)})`;
  }
  label(text) { if (this.stageEl && this.stageEl.textContent !== text) this.stageEl.textContent = text; }
  // a stage begins (the previous one ends); yields so a frame gets through
  begin(k) {
    const now = performance.now();
    if (this.cur) this.times[this.cur] = (now - this.t0) / 1000;
    this.cur = k; this.t0 = now;
    const s = this.span[k];
    this.label(s.label);
    // opaque steps glide toward most of their share for as long as they took last time
    if (k !== 'fetch' && k !== 'shaders') this.to(s.a + (s.b - s.a) * 0.92, this.est[k] * 0.92);
    else this.to(s.a);
    return this.yield();
  }
  // progress within the current stage (bytes, shaders), with an optional detail
  sub(f, detail) {
    const s = this.span[this.cur]; if (!s) return;
    this.to(s.a + (s.b - s.a) * Math.min(1, f));
    this.label(detail ? `${s.label} · ${detail}` : s.label);
  }
  // let a frame through when the screen has gone stale; otherwise just yield
  yield() {
    return new Promise((r) => {
      let done = false; const go = () => { if (!done) { done = true; r(); } };
      if (performance.now() - this.lastFrame > 50) { requestAnimationFrame(() => later(go, 0)); later(go, 120); } else later(go, 0);
    });
  }

  // Compile every program for the target the world is really drawn into, so
  // its first frame finds them cached instead of recompiling the lot. The
  // compiles are only issued here: the driver (Chrome's GPU process, or the
  // parallel-compile extension) works through them while you sit in the menu,
  // and the line follows it when it can say how far it has got. Textures are
  // uploaded a slice per frame rather than all at once on the first frame.
  async shaders(list) {
    const r = G.engine.renderer, prev = r.getRenderTarget(), n0 = (r.info.programs || []).length;
    r.setRenderTarget(G.engine.rtScene);
    for (const [scene, cam] of list) { try { r.compile(scene, cam); } catch (e) { console.warn('compile', e); } }
    r.setRenderTarget(prev);
    const progs = (r.info.programs || []).slice(n0), t0 = performance.now();
    for (;;) {
      const done = progs.filter((p) => !p.isReady || p.isReady()).length;
      this.sub(0.7 * done / Math.max(1, progs.length), `${done} / ${progs.length}`);
      if (done >= progs.length || performance.now() - t0 > 5000) break;
      await this.yield();
    }
    const seen = new Set(), tex = [];
    const add = (t) => { if (t && t.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture && !seen.has(t)) { seen.add(t); tex.push(t); } };
    for (const [scene] of list) scene.traverse((o) => { for (const m of [].concat(o.material || [])) { for (const k in m) add(m[k]); if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k] && m.uniforms[k].value); } });
    for (let j = 0; j < tex.length;) {
      const ts = performance.now();
      while (j < tex.length && performance.now() - ts < 20) { try { r.initTexture(tex[j]); } catch (e) { /* skip */ } j++; }
      this.sub(0.7 + 0.3 * j / tex.length, 'textures');
      await this.yield();
    }
  }

  finish() {
    if (this.cur) this.times[this.cur] = (performance.now() - this.t0) / 1000;
    try { localStorage.setItem(KEY, JSON.stringify(this.times)); } catch (e) { /* ignore */ }
    this.to(1, 0.4); this.label('');
    this.chase.ready = true;
    this.touchWords();
    document.getElementById('boot').classList.add('ready');
  }

  frame(dt) {
    this.lastFrame = performance.now();
    this.chase.update(dt);
    // the number follows the line as the compositor draws it
    if (this.bar) {
      const m = getComputedStyle(this.bar).transform, a = m && m.startsWith('matrix(') ? parseFloat(m.slice(7)) : 0;
      const pct = Math.floor(Math.min(1, a) * 100);
      if (pct !== this.shown && this.pctEl) { this.shown = pct; this.pctEl.textContent = pct + '%'; }
    }
    G.fx.update(dt);
    G.engine.fx.vignette = 1.1;
    G.engine.render(this.chase.scene, this.chase.cam, G.time);
  }

  // the scene lives on as the menu
  dispose() { G.engine.fx.faceSpot.w = 0; }
}
