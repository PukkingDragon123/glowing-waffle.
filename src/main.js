import * as THREE from 'three';
import { G, emit, on } from './core/globals.js';
import { Engine } from './core/engine.js';
import './gfx/toon.js';
import { Input } from './core/input.js';
import { Settings } from './core/settings.js';
import { Physics } from './core/physics.js';
import { initMaterials, matteAll, M } from './gfx/materials.js';
import { setMaxAnisotropy } from './gfx/textures.js';
import { loadAssets, applySurfaces } from './gfx/assets.js';
import { Particles, Decals } from './gfx/particles.js';
import { World } from './world/world.js';
import { Apartment } from './world/apartment.js';
import { hookItemEvents } from './world/items.js';
import { Player } from './player/player.js';
import { Body } from './player/body.js';
import { HUD } from './ui/hud.js';
import { Sky } from './world/sky.js';
import { NavGrid } from './world/nav.js';
import { Cat } from './creatures/cat.js';
import { Desk } from './world/desk.js';
import { Building } from './world/building.js';
import { hangCloth } from './world/cloth.js';
import { AudioEngine } from './audio/audio.js';
import { Director } from './story/director.js';
import { Ending } from './story/ending.js';
import { Visitors } from './story/visitors.js';
import { Alien } from './creatures/alien.js';
import { Mirror } from './gfx/mirror.js';
import { Menu } from './ui/menu.js';
import { Pause } from './ui/pause.js';
import { Loader } from './ui/loader.js';
import { FX } from './gfx/fx.js';
import { nextFrame, Tasks } from './core/util.js';

const params = new URLSearchParams(location.search);
G.debug.enabled = params.has('debug');

async function boot() {
  const canvas = document.getElementById('game');
  G.settings = new Settings();
  G.engine = new Engine(canvas);
  G.engine.setLowHeight(G.settings.v.resolution);
  G.scene = G.engine.scene;
  G.camera = G.engine.camera;
  G.scene.add(G.camera);
  G.input = new Input(canvas);
  G.physics = new Physics();
  G.tasks = new Tasks();
  G.audio = new AudioEngine();
  G.hud = new HUD();
  G.fx = new FX();
  setMaxAnisotropy(G.engine.renderer.capabilities.getMaxAnisotropy());
  // the loader runs on the real renderer while everything else is built
  G.state = 'loading';
  const loader = new Loader();
  await loader.warm();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === 'loading') { G.time += dt; G.uniforms.uTime.value = G.time; loader.frame(dt); G.input.endFrame(); }
    else tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const step = () => new Promise((r) => setTimeout(r, 16));
  // the Thai faces must be in before a single sign or label is painted
  await loadFonts();
  // the CC0 models and painted textures download while the cat runs
  const assets = loadAssets();
  await step();
  initMaterials();
  await assets;
  applySurfaces();
  await step();
  G.world = new World();
  G.particles = new Particles();
  G.decals = new Decals();
  G.apartment = new Apartment().build();
  await step();
  G.building = new Building().build();
  hookItemEvents();
  await step();
  G.player = new Player();
  G.player.body = G.body = new Body();
  G.player.ctrl.teleport(5.7, 0.05, 3.6, 0.6, -0.05);
  await step();
  G.sky = new Sky();
  for (const w of Object.values(G.apartment.windows)) {
    const f = w.frame.group.position;
    G.sky.addWindowLight(new THREE.Vector3(f.x, 1.6, f.z + 0.25), new THREE.Vector3(0, -0.55, 1), 1);
  }
  G.sky.apply(G.sky.preset(+(params.get('day') || 1), +(params.get('t') || 0.12)), true);
  await step();
  G.nav = new NavGrid(-11.6, -1.6, 24.5, 10.5, 0.1);
  G.nav.bake(G.physics.statics);
  const V3 = (x, z) => new THREE.Vector3(x, 0, z);
  const D = G.apartment.doors;
  G.nav.addDoor(D.bath, V3(6.56, 5.95), V3(6.56, 6.65));
  G.nav.addDoor(D.front, V3(5.25, 7.0), V3(6.1, 7.0));
  G.nav.addDoor(G.apartment.balconyDoorProxy, V3(3.95, -0.12), V3(4.8, -0.12));
  const BD = G.building.doors;
  G.nav.addDoor(BD['1406'], V3(0.9, 7.0), V3(1.75, 7.0));
  G.nav.addDoor(BD['1408'], V3(9.6, 7.0), V3(10.45, 7.0));
  G.nav.addDoor(BD.trash, V3(-9.56, 7.5), V3(-9.56, 8.35));
  G.nav.addDoor(BD.stair, V3(21.06, 7.5), V3(21.06, 8.35));
  await step();
  G.cat = new Cat(G.nav);
  G.desk = new Desk(G.apartment);
  G.cloth = hangCloth();
  G.mirror = new Mirror(G.apartment.mirrorSpot);
  G.alien = new Alien();
  G.ending = new Ending();
  G.visitors = new Visitors();
  G.director = new Director();
  G.menu = new Menu();
  G.pause = new Pause();
  hookSounds();
  matteAll(G.scene);
  await step();
  // compile the world's shaders without blocking the loader
  try { await G.engine.renderer.compileAsync(G.scene, G.camera); } catch (e) { G.engine.renderer.compile(G.scene, G.camera); }
  loader.finish();

  canvas.addEventListener('click', () => { if (G.state === 'play') G.input.lock(); });
  on('unlock', () => {
    if (G.state !== 'play') return;
    if (G.desk.seated) { G.desk.stand(); return; }
    G.pause.show();
  });
  window.BENGRIM = window.TOMYUM = makeDebugApi();
  // one click: sound needs a gesture
  const boot = document.getElementById('boot');
  const go = async () => {
    window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go);
    try { await G.audio.init(); } catch (e) { console.warn('audio', e); }
    G.audio.play && G.audio.play('tapeHiss', { vol: 0.15 });
    await G.fx.fadeTo(1, 2.5);
    boot.classList.add('out');
    loader.dispose();
    G.engine.background = G.sky;
    G.state = 'boot';
    if (params.has('day')) {
      // debug: jump straight into a day
      G.state = 'play'; G.hud.crosshair(true);
      G.director.startDay(+params.get('day'));
    } else G.menu.open({ intro: !params.has('nointro') });
    setTimeout(() => (boot.hidden = true), 1300);
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  if (params.has('autostart')) go();
}

// Kanit for signs and the HUD, Sarabun for small print, Itim for handwriting.
// Google serves Thai as its own unicode-range subset, so ask with Thai text.
async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['300 32px Kanit', '400 32px Kanit', '600 32px Kanit', '800 32px Kanit', '400 32px Sarabun', '700 32px Sarabun', '400 32px Itim', '700 32px "Chakra Petch"'];
  const all = Promise.all(faces.map((f) => document.fonts.load(f, 'กขฃคต ๑๒๓ Abc').catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 4500))]);
}

// footsteps by floor surface, impacts by material
function hookSounds() {
  on('footstep', (e) => {
    const z = G.world.zoneAt(e.pos);
    const surf = z ? z.surface : 'concrete';
    G.audio.play('step_' + surf, { pos: e.pos, vol: (e.land ? 0.8 : 0.35) * (e.crouch ? 0.4 : e.run ? 1.3 : 1), occlude: false, rate: 0.95 + Math.random() * 0.1 });
  });
  on('impact', (e) => { if (e.sound) G.audio.play('imp_' + e.sound, { pos: e.pos, vol: Math.min(1, e.vol) }); });
}

function tick(dt) {
  G.dt = dt; G.time += dt; G.frame++;
  G.uniforms.uTime.value = G.time;
  G.tasks.update(dt);
  const st = G.state;
  if (st === 'play') {
    if (G.input.pressed('Escape') && !G.desk.seated) G.pause.show();
    G.player.update(dt);
    G.physics.update(dt);
    G.world.update(dt);
    G.apartment.update(dt);
    G.building.update(dt);
    G.player.lateUpdate(dt);
    G.cat.update(dt);
    G.desk.update(dt);
    G.director.update(dt);
    G.mirror.update(dt);
    for (const c of G.cloth) c.step(dt);
  } else if (st === 'menu') {
    for (const c of G.cloth) c.step(dt);
    G.physics.update(dt);
    G.world.update(dt);
    G.apartment.update(dt);
    G.menu.update(dt);
    G.windGust = Math.max(0, (G.windGust || 0) - dt * 0.12);
  } else if (st === 'ending') {
    G.ending.update(dt);
    G.body.lateUpdate(dt);
  }
  if (st !== 'play' && st !== 'menu') G.engine.fx.faceSpot.w = 0;
  if (st !== 'paused') {
    G.sky.update(dt, G.camera);
    G.fx.update(dt);
    G.particles.update(dt);
  }
  G.hud.update(dt);
  G.audio.update(dt);
  if (!G.noRender) G.engine.render(G.scene, G.camera, G.time);
  G.input.endFrame();
}

function makeDebugApi() {
  return {
    G, THREE,
    tp(x, z, yaw = 0, pitch = 0) { G.player.ctrl.teleport(x, 0.05, z, yaw, pitch); },
    look(yaw, pitch) { G.player.ctrl.yaw = yaw; G.player.ctrl.pitch = pitch; },
    async step(n = 10, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); },
    // advance without rendering, then render one frame
    async fast(n = 10, dt = 1 / 30) { G.noRender = true; for (let i = 0; i < n; i++) tick(dt); G.noRender = false; tick(dt); },
    sit() { G.desk.sit(); },
    day(n) { G.state = 'play'; G.menu.close(); G.director.startDay(n); },
    hour(h) { G.director.minutes = h * 60; },
    key(code, frames = 1) { G.input.pressedSet.add(code); G.input.down.add(code); tick(1 / 30); G.input.down.delete(code); },
  };
}

boot().catch((e) => { console.error(e); const m = document.getElementById('boot-msg'); if (m) m.textContent = 'ERROR: ' + e.message; });
