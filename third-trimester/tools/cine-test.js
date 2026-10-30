// Cinematics test bench.
//   ?mode=city   exterior skyline still (&hour=22&damage=2&cam=x,y,z,lx,ly,lz,fov)
//   ?mode=crash  exterior crash sequence
//   ?mode=intro | finale  the full scripts in the apartment (real Apartment if it exists, else a stand-in)
//   &t=SEC      fast-forward SEC seconds of game time with a fixed step, then render one still (window.ready)
//   &autoqte    QTEs resolve instantly   &q=low|medium|high
import * as THREE from 'three';
import { game } from '../src/core/game.js';
import { Gfx } from '../src/core/renderer.js';
import { UI } from '../src/core/ui.js';
import { QTE } from '../src/core/qte.js';
import { AudioEngine } from '../src/core/audio.js';
import { loadEnv } from '../src/gfx/env.js';
import { newState } from '../src/game/state.js';
import { createCityScene, createCityBackdrop } from '../src/scenes/city.js';
import { createCutscene, setAutoTick, tickCutscenes } from '../src/game/cutscene.js';
import { CAMS, SPOTS, FURNITURE, ROOM } from '../src/scenes/layout.js';

const P = new URLSearchParams(location.search);
if (P.get('q')) game.settings.values.quality = P.get('q');
game.gfx = new Gfx(document.getElementById('game'));
game.ui = new UI(document.getElementById('ui'));
game.qte = new QTE(document.getElementById('qte'));
game.audio = new AudioEngine();
game.state = newState();
if (P.has('autoqte') || P.has('t')) for (const m of ['timing', 'ring', 'mash', 'hold', 'circle', 'shake', 'swipe', 'rhythm', 'keys']) game.qte[m] = async () => ({ result: 'good', score: 0.8 });
window.TTRI = game;

let view = null;           // { scene, camera, update(dt) }
const T = P.has('t') ? parseFloat(P.get('t')) : null;
if (T != null) setAutoTick(false);

function frame(dt) {
  game.time += dt; game.dt = dt;
  const sdt = dt * (game.timeScale || 1);
  view?.update(sdt);
  game.qte.update(dt); game.gfx.update(dt);
}
async function fastForward(sec) {
  const dt = 1 / 30; let t = 0;
  while (t < sec) { tickCutscenes(dt); frame(dt); t += dt * (game.timeScale || 1); await new Promise((r) => setTimeout(r, 0)); }
}
function startLoop() {
  let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); if (view) game.gfx.render(view.scene, view.camera, dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
async function still() {
  await fastForward(T);
  game.gfx.render(view.scene, view.camera, 1 / 30);
  window.ready = true;
}

// ---------------------------------------------------------------- stand-in apartment (until the real one lands)
async function makeStandIn() {
  const { Actor } = await import('../src/game/mover.js');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 5000);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  const rb = (w, h, d, r = 0.03) => new THREE.BoxGeometry(w, h, d); // stand-in only
  add(new THREE.BoxGeometry(6.4, 0.1, 4.6), mat(0x8a6a4a), 0, -0.05, 0);
  const wall = mat(0xc9bfa8);
  add(rb(1.8, 2.65, 0.12), wall, -2.3, 1.325, -2.36); add(rb(2.4, 2.65, 0.12), wall, 2.0, 1.325, -2.36);
  add(rb(2.2, 0.85, 0.12), wall, -0.3, 0.425, -2.36); add(rb(2.2, 0.3, 0.12), wall, -0.3, 2.5, -2.36);
  add(rb(0.12, 2.65, 4.6), wall, -3.26, 1.325, 0);
  add(rb(0.12, 2.65, 3.15), wall, 3.26, 1.325, -0.73); add(rb(0.12, 0.55, 0.9), wall, 3.26, 2.375, 1.3); add(rb(0.12, 2.65, 0.55), wall, 3.26, 1.325, 2.03);
  add(rb(6.4, 0.12, 4.6), wall, 0, 2.71, 0).visible = !P.has('noceil');
  const sofa = add(rb(0.9, 0.45, 1.9), mat(0x6b3f3a), FURNITURE.sofa.x, 0.225, FURNITURE.sofa.z); add(rb(0.25, 0.85, 1.9), mat(0x6b3f3a), -3.05, 0.42, 1.25);
  add(rb(0.55, 0.42, 1.0), mat(0x6a4a30), FURNITURE.coffeeTable.x, 0.21, FURNITURE.coffeeTable.z);
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x223344 });
  add(rb(0.5, 0.5, 0.9), mat(0x2a2a2a), FURNITURE.tv.x, 0.5, FURNITURE.tv.z); const screen = add(new THREE.PlaneGeometry(0.75, 0.42), tvMat, FURNITURE.tv.x - 0.26, 0.55, FURNITURE.tv.z, -Math.PI / 2);
  add(rb(0.6, 0.9, 1.6), mat(0x8b8f93), FURNITURE.counter.x, 0.45, FURNITURE.counter.z);
  add(rb(0.65, 0.74, 1.4), mat(0x6a5a48), FURNITURE.desk.x, 0.37, FURNITURE.desk.z);
  const crib = add(rb(1.0, 0.95, 0.56), mat(0xe8dcc8), FURNITURE.crib.x, 0.475, FURNITURE.crib.z);
  const pivot = new THREE.Group(); pivot.position.set(3.22, 0, 1.75); scene.add(pivot);
  const door = new THREE.Mesh(rb(0.06, 2.1, 0.9), mat(0x7a5232)); door.position.set(0, 1.05, -0.45); pivot.add(door);
  scene.add(new THREE.HemisphereLight(0x8090c0, 0x3a2a20, 0.5));
  const lamp = new THREE.PointLight(0xffb070, 6, 8, 2); lamp.position.set(-2.8, 1.6, 2.0); scene.add(lamp);
  const tvl = new THREE.PointLight(0x6aa0ff, 2, 4, 2); tvl.position.set(-0.9, 0.7, 1.25); scene.add(tvl);
  const moon = new THREE.DirectionalLight(0x9fb3ff, 1.0); moon.position.set(-3, 6, -10); scene.add(moon);
  scene.environment = await loadEnv(game.gfx.renderer, 'apartment'); scene.environmentIntensity = 0.4;
  const city = createCityBackdrop({}); scene.add(city.group);
  const actors = [];
  const apt = {
    scene, camera, cityView: city, actors, cinematic: false,
    spawnActor(kind, pos, yaw = 0) { const a = new Actor(kind); a.place(pos, yaw); scene.add(a.root); actors.push(a); return a; },
    removeActor(a) { a.root.removeFromParent(); actors.splice(actors.indexOf(a), 1); },
    camTo(preset, sec = 0) { const s = typeof preset === 'string' ? CAMS[preset] : preset; camera.position.set(...s.pos); camera.lookAt(...s.look); camera.fov = s.fov ?? camera.fov; camera.updateProjectionMatrix(); return Promise.resolve(); },
    door: { isOpen: false, async open({ kick } = {}) { pivot.rotation.y = kick ? -1.9 : -1.4; this.isOpen = true; }, async close() { pivot.rotation.y = 0; this.isOpen = false; } },
    setLight(mood) { lamp.intensity = mood === 'blackout' ? 0 : mood === 'raid' ? 3 : 6; tvl.intensity = mood === 'blackout' ? 0 : 2; },
    messUp() { sofa.rotation.y = 0.2; crib.rotation.z = 0.4; }, tidy() { sofa.rotation.y = 0; crib.rotation.z = 0; },
    prop(name) { return { tv: screen, crib, sofa, door }[name]; },
    tv: { show(kind) { tvMat.color.set(kind === 'news' ? 0xc8ddff : kind === 'static' ? 0x999999 : kind === 'wanted' ? 0xff4422 : 0x050505); } },
    update(dt) { for (const a of actors) a.update(dt); city.update(dt, game.time); },
  };
  apt.sunny = apt.spawnActor('sunny', SPOTS.center.pos, 0);
  return apt;
}

async function main() {
  const mode = P.get('mode') || 'city';
  if (mode === 'city' || mode === 'crash') {
    const cs = createCityScene({});
    cs.scene.environment = await loadEnv(game.gfx.renderer, 'night');
    view = { scene: cs.scene, camera: cs.camera, update: (dt) => cs.city.update(dt, game.time) };
    cs.city.setTimeOfDay(parseFloat(P.get('hour') ?? '22'));
    cs.city.setDamage(parseInt(P.get('damage') ?? '0', 10));
    const c = (P.get('cam') || '0,1.6,-2.6,-60,40,-330,50').split(',').map(Number);
    cs.camera.position.set(c[0], c[1], c[2]); cs.camera.lookAt(c[3], c[4], c[5]); cs.camera.fov = c[6]; cs.camera.updateProjectionMatrix();
    game.gfx.grade.inkFar = 900;
    if (mode === 'crash') {
      cs.city.showShips(true);
      const cut = createCutscene({ scene: cs.scene, camera: cs.camera });
      (async () => { await cut.wait(1); cs.city.crash(cs.city.ships[0], 0, { duration: 4, onImpact: () => { cut.flash([1, 0.8, 0.6], 0.5); cut.shake(1); } }); await cut.wait(3); cs.city.crash(cs.city.ships[1], 2, { duration: 4 }); })();
    }
  } else {
    const { buildCharacters } = await import('../src/chars/index.js');
    await buildCharacters();
    let apt = null;
    try { const m = await import('../src/scenes/apartment.js'); if (m.Apartment) { apt = new m.Apartment(); await apt.init?.(() => {}); apt.enter?.({ day: mode === 'finale' ? 5 : 0, cinematic: true }); } } catch (e) { console.warn('real apartment unavailable, using stand-in:', e.message); }
    if (!apt) apt = await makeStandIn();
    view = { scene: apt.scene, camera: apt.camera, update: (dt) => apt.update(dt) };
    window.apt = apt;
    const run = mode === 'intro' ? (await import('../src/scenes/intro.js')).playIntro : (await import('../src/scenes/finale.js')).playFinale;
    if (mode === 'finale') { game.state.day = 5; game.state.baby.born = true; game.state.flags.traced = P.has('traced'); }
    run({ apt, game }).then(() => { console.log('cinematic done'); window.done = true; }).catch((e) => { console.error(e); window.error = String(e.stack || e); });
  }
  if (T != null) await still(); else { startLoop(); window.ready = true; }
}
main().catch((e) => { console.error(e); window.error = String(e.stack || e); });
