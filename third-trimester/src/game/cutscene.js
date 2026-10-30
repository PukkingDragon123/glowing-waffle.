// A small async director for cinematics.
//   const cut = createCutscene({ scene, camera });
//   await cut.cam({ pos, look, fov }, 2.5, 'inOutCubic');  await cut.wait(1);  cut.shake(0.6);  await cut.say('Gary', '…', 'gary');
//   cut.end();
// Time runs on its own clock = real dt × game.timeScale (0 while paused). Holding SPACE ~0.8 s skips:
// the clock fast-forwards (×24, audio ducked, screen black), lines and QTEs resolve with defaults, so every
// script reaches its final state deterministically. Drive manually with setAutoTick(false) + tickCutscenes(dt).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { ease as E, clamp, lerp } from '../core/util.js';
import { CAMS } from '../scenes/layout.js';

const active = new Set();
let auto = true, last = performance.now(), rafOn = false;
export function setAutoTick(on) { auto = on; if (on) startRaf(); }
function startRaf() {
  if (rafOn) return; rafOn = true;
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (auto) tickCutscenes(dt);
    if (active.size || auto) requestAnimationFrame(loop); else rafOn = false;
  };
  last = performance.now(); requestAnimationFrame(loop);
}
export function tickCutscenes(realDt) { for (const c of [...active]) c._tick(realDt); }

const SKIP_SCALE = 24;
const toVec = (v) => (v?.isVector3 ? v.clone() : Array.isArray(v) ? new THREE.Vector3(...v) : v ? new THREE.Vector3(v.x, v.y, v.z) : null);
const easeFn = (e) => (typeof e === 'function' ? e : E[e] || E.inOutCubic);

export function createCutscene({ scene, camera, onUpdate } = {}) {
  const c = {
    scene, camera, clock: 0, skipping: false, ended: false, timers: [], tweens: [], updaters: new Set(), holdT: 0, slowScale: 1,
    look: new THREE.Vector3(0, 1, 0), result: {},
  };
  if (onUpdate) c.updaters.add(onUpdate);
  // current look target derived from the camera
  { const d = new THREE.Vector3(); camera.getWorldDirection(d); c.look.copy(camera.position).addScaledVector(d, 4); }

  const keyDown = (e) => { if (e.code === 'Space') c.spaceDown = true; };
  const keyUp = (e) => { if (e.code === 'Space') c.spaceDown = false; };
  addEventListener('keydown', keyDown); addEventListener('keyup', keyUp);

  c.scale = () => (c.skipping ? SKIP_SCALE : c.slowScale) * (game.paused ? 0 : 1);
  c._tick = (realDt) => {
    if (c.ended) return;
    // skip handling (hold space)
    if (!c.skipping && c.skippable !== false) {
      if (c.spaceDown && !game.qte?.busy) { c.holdT += realDt; game.ui?.skipHint(true, clamp(c.holdT / 0.8)); if (c.holdT >= 0.8) c.skip(); }
      else { if (c.holdT > 0) { c.holdT = Math.max(0, c.holdT - realDt * 2); game.ui?.skipHint(c.holdT > 0 || c.showHint, clamp(c.holdT / 0.8)); } }
    }
    game.timeScale = c.scale() || 0.0001;
    const dt = realDt * c.scale();
    c.clock += dt;
    for (const tw of [...c.tweens]) { tw.t += dt; const k = clamp(tw.t / tw.dur); tw.fn(tw.ease(k), k); if (k >= 1) { c.tweens.splice(c.tweens.indexOf(tw), 1); tw.resolve(); } }
    for (const t of [...c.timers]) if (c.clock >= t.at) { c.timers.splice(c.timers.indexOf(t), 1); t.resolve(); }
    for (const u of c.updaters) u(dt, c.clock);
    // flash decay
    if (game.gfx && c.flashT > 0) { c.flashT = Math.max(0, c.flashT - dt); game.gfx.grade.flash = c.flashA * (c.flashT / c.flashDur) ** 1.5; }
  };
  c.wait = (sec) => new Promise((resolve) => { if (sec <= 0) return resolve(); c.timers.push({ at: c.clock + sec, resolve }); });
  c.tween = (dur, fn, ease = 'inOutCubic') => new Promise((resolve) => { if (dur <= 0) { fn(1, 1); return resolve(); } c.tweens.push({ t: 0, dur, fn, ease: easeFn(ease), resolve }); });
  c.every = (fn) => { c.updaters.add(fn); return () => c.updaters.delete(fn); };

  // ---- camera
  c.setCam = (shot) => {
    const s = typeof shot === 'string' ? CAMS[shot] : shot;
    camera.position.copy(toVec(s.pos)); c.look.copy(toVec(s.look));
    if (s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    if (s.roll != null) camera.up.set(Math.sin(s.roll), Math.cos(s.roll), 0); else camera.up.set(0, 1, 0);
    camera.lookAt(c.look);
  };
  c.cam = (shot, sec = 0, ease = 'inOutCubic') => {
    const s = typeof shot === 'string' ? CAMS[shot] : shot;
    const p0 = camera.position.clone(), l0 = c.look.clone(), f0 = camera.fov, r0 = c.roll ?? 0;
    const p1 = toVec(s.pos) ?? p0, l1 = toVec(s.look) ?? l0, f1 = s.fov ?? f0, r1 = s.roll ?? 0;
    if (sec <= 0 || c.skipping) { c.roll = r1; c.setCam({ pos: p1, look: l1, fov: f1, roll: r1 }); return Promise.resolve(); }
    return c.tween(sec, (k) => { c.roll = lerp(r0, r1, k); c.setCam({ pos: p0.clone().lerp(p1, k), look: l0.clone().lerp(l1, k), fov: lerp(f0, f1, k), roll: c.roll }); }, ease);
  };
  // Catmull-Rom dolly: points [{pos, look, fov?}, …]
  c.track = (points, sec, ease = 'inOutSine') => {
    const pc = new THREE.CatmullRomCurve3(points.map((p) => toVec(p.pos)), false, 'centripetal');
    const lc = new THREE.CatmullRomCurve3(points.map((p) => toVec(p.look ?? points[0].look)), false, 'centripetal');
    const fovs = points.map((p) => p.fov ?? camera.fov);
    return c.tween(sec, (k) => { const f = fovs.length > 1 ? lerp(fovs[Math.min(fovs.length - 2, Math.floor(k * (fovs.length - 1)))], fovs[Math.min(fovs.length - 1, Math.floor(k * (fovs.length - 1)) + 1)], (k * (fovs.length - 1)) % 1) : fovs[0]; c.setCam({ pos: pc.getPoint(k), look: lc.getPoint(k), fov: f }); }, ease);
  };
  // keep the camera looking at a moving target until the returned fn is called
  c.follow = (getLook, getPos = null, lerpK = 6) => c.every((dt) => { const l = getLook(); if (l) c.look.lerp(l, 1 - Math.exp(-lerpK * dt)); if (getPos) { const p = getPos(); if (p) camera.position.lerp(p, 1 - Math.exp(-lerpK * dt)); } camera.lookAt(c.look); });

  // ---- screen effects
  c.shake = (a = 0.5) => game.gfx?.addShake(a);
  c.flash = (color = [1, 1, 1], sec = 0.35, amount = 1) => { if (!game.gfx) return; game.gfx.grade.flashColor = Array.isArray(color) ? color : new THREE.Color(color).toArray(); c.flashA = amount * (game.settings.get('flashes') ? 1 : 0.35); c.flashT = c.flashDur = sec; game.gfx.grade.flash = c.flashA; };
  c.slowmo = async (scale, sec) => { c.slowScale = scale; await new Promise((r) => { const t0 = performance.now(); const tick = () => (performance.now() - t0 > sec * 1000 || c.skipping || c.ended ? r() : requestAnimationFrame(tick)); tick(); }); c.slowScale = 1; };
  c.letterbox = (on) => game.ui?.letterbox(on);
  c.grade = (key, to, sec = 0) => (sec <= 0 || c.skipping ? (game.gfx.grade[key] = to, Promise.resolve()) : (() => { const from = game.gfx.grade[key]; return c.tween(sec, (k) => { game.gfx.grade[key] = lerp(from, to, k); }); })());
  c.fade = (to, sec = 1, color = '#000') => {
    const el = game.ui?.fadeEl; if (!el) return Promise.resolve();
    el.style.background = color; el.style.transition = 'none';
    const from = parseFloat(el.style.opacity || 0);
    return c.tween(c.skipping ? 0 : sec, (k) => { el.style.opacity = lerp(from, to, k); }, 'inOutSine');
  };
  c.caption = async (big, small = '', sec = 3.2) => {
    if (c.skipping) return;
    const card = game.ui?.card; if (!card) return;
    card.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`; card.classList.add('on');
    game.audio?.ui('menu.checkpoint', { vol: 0.45 });
    await c.wait(sec); card.classList.remove('on'); await c.wait(0.9);
  };
  // Subtitle + babble on the cutscene clock. Optional actor talks (mouth) while the line plays.
  c.say = async (speaker, text, voice = null, { actor = null, hold = 1.0, wait = true } = {}) => {
    if (c.skipping) return;
    const dur = Math.max(1.4, text.length * 0.055 / (game.settings.get('textSpeed') || 1)) + hold;
    actor?.anim?.talk?.(dur - hold);
    game.ui?.say(speaker, text, { voice, wait: false });
    if (!wait) return;
    let advanced = false; const adv = () => { advanced = true; };
    const t0 = c.clock; let min = Math.min(0.6, dur);
    if (game.ui) game.ui.advance = adv;
    await new Promise((r) => { const off = c.every(() => { if ((advanced && c.clock - t0 > min) || c.clock - t0 > dur || c.skipping) { off(); r(); } }); });
    if (game.ui?.advance === adv) game.ui.advance = null;
    game.ui?.subs && game.ui.subs.querySelector('.line')?.classList.remove('on');
  };
  // Choice: defaults to the first option when skipping.
  c.choose = async (options, opts) => (c.skipping ? options[opts?.default ?? 0].value : game.ui.choose(options, opts));
  // Run a QTE (fn receives game.qte); resolves with a default result while skipping.
  c.qte = async (fn, def = { result: 'good', score: 0.7 }) => {
    if (c.skipping || !game.qte) return def;
    const r = await fn(game.qte); return r;
  };
  c.parallel = (...ps) => Promise.all(ps);
  c.music = (name, fade = 2) => { const a = game.audio; if (!a) return; if (!name) return a.music(null, { fade }); if (a.tracks?.has(name)) a.music(name, { fade }); };
  c.sfx = (name, o) => { if (c.skipping) return null; return game.audio?.sfx(name, o); };
  c.loops = new Map();
  c.loop = (name, o = {}) => { if (c.loops.has(name)) { c.loops.get(name).setVolume(o.vol ?? 0.5); return c.loops.get(name); } const l = game.audio?.loop(name, o); if (l) c.loops.set(name, l); return l; };
  c.stopLoop = (name, t = 1) => { c.loops.get(name)?.stop(t); c.loops.delete(name); };

  c.skip = () => {
    if (c.skipping || c.skippable === false) return;
    c.skipping = true; game.ui?.skipHint(false); game.ui?.clearSubs?.();
    const el = game.ui?.fadeEl; if (el) { el.style.transition = 'opacity 0.25s'; el.style.background = '#000'; el.style.opacity = 1; }
    if (game.audio?.master) { c._vol = game.settings.get('master'); game.audio.master.gain.setTargetAtTime(0.0001, game.audio.ctx.currentTime, 0.05); }
    if (game.qte?.active) game.qte.active.finish({ result: 'good', score: 0.7 });
  };
  c.end = async ({ fadeIn = true } = {}) => {
    if (c.ended) return;
    const wasSkipping = c.skipping;
    c.ended = true; active.delete(c); game.timeScale = 1; c.slowScale = 1;
    removeEventListener('keydown', keyDown); removeEventListener('keyup', keyUp);
    game.ui?.skipHint(false);
    if (game.audio?.master && wasSkipping) game.audio.applySettings();
    if (game.gfx) { game.gfx.grade.flash = 0; }
    for (const l of c.loops.values()) l.stop(1.5);
    if (wasSkipping && fadeIn) { const el = game.ui?.fadeEl; if (el) { el.style.transition = 'opacity 0.8s'; el.style.opacity = 0; } }
  };
  active.add(c); startRaf();
  return c;
}
