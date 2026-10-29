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
import { Peace } from './story/peace.js';
import { Alien } from './creatures/alien.js';
import { Mirror } from './gfx/mirror.js';
import { Menu } from './ui/menu.js';
import { Pause } from './ui/pause.js';
import { Loader } from './ui/loader.js';
import { Touch } from './ui/touch.js';
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
  G.touch = new Touch(canvas);
  G.physics = new Physics();
  G.tasks = new Tasks();
  G.audio = new AudioEngine();
  G.hud = new HUD();
  G.fx = new FX();
  setMaxAnisotropy(G.engine.renderer.capabilities.getMaxAnisotropy());
  // the loader runs on the real renderer while everything else is built
  G.state = 'loading';
  const loader = new Loader();
  // the CC0 models and painted textures start downloading at once, in parallel
  loader.begin('fetch');
  const assets = loadAssets((f, detail) => loader.sub(f, detail));
  await loader.warm();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === 'loading') { G.time += dt; G.uniforms.uTime.value = G.time; loader.frame(dt); G.input.endFrame(); }
    else tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // each stage yields so the line moves and she keeps running
  const step = (k) => loader.begin(k);
  await loader.yield();
  initMaterials();
  await assets;
  await step('apartment');
  applySurfaces();
  G.world = new World();
  G.particles = new Particles();
  G.decals = new Decals();
  G.apartment = new Apartment().build();
  await step('building');
  G.building = new Building().build();
  hookItemEvents();
  await step('body');
  G.player = new Player();
  G.player.body = G.body = new Body();
  G.player.ctrl.teleport(6.0, 0.05, 4.5, 0.6, -0.05);
  await step('sky');
  G.sky = new Sky();
  for (const w of Object.values(G.apartment.windows)) {
    const f = w.frame.group.position;
    G.sky.addWindowLight(new THREE.Vector3(f.x, 1.6, f.z + 0.25), new THREE.Vector3(0, -0.55, 1), 1);
  }
  G.sky.apply(G.sky.preset(+(params.get('day') || 1), +(params.get('t') || 0.12)), true);
  await step('nav');
  G.nav = new NavGrid(-8.6, -0.4, 20.6, 10.0, 0.1);
  G.nav.bake(G.physics.statics);
  const D = G.apartment.doors;
  G.nav.addDoor(D.bedroom, new THREE.Vector3(3.46, 0, 2.6), new THREE.Vector3(3.46, 0, 3.35));
  G.nav.addDoor(D.bath, new THREE.Vector3(3.46, 0, 3.95), new THREE.Vector3(3.46, 0, 4.65));
  G.nav.addDoor(D.closet, new THREE.Vector3(3.46, 0, 6.6), new THREE.Vector3(3.46, 0, 7.25));
  G.nav.addDoor(D.front, new THREE.Vector3(7.25, 0, 7.75), new THREE.Vector3(8.05, 0, 7.75));
  const BD = G.building.doors;
  G.nav.addDoor(BD['4A'], new THREE.Vector3(-3.55, 0, 7.76), new THREE.Vector3(-2.8, 0, 7.76));
  G.nav.addDoor(BD['4C'], new THREE.Vector3(12.35, 0, 7.76), new THREE.Vector3(13.1, 0, 7.76));
  G.nav.addDoor(BD.trash, new THREE.Vector3(-6.46, 0, 8.4), new THREE.Vector3(-6.46, 0, 9.15));
  await step('cast');
  G.cat = new Cat(G.nav);
  G.desk = new Desk(G.apartment);
  G.cloth = hangCloth();
  G.mirror = new Mirror(G.apartment.mirrorSpot);
  G.alien = new Alien();
  G.ending = new Ending();
  G.director = new Director();
  G.peace = new Peace();
  G.menu = new Menu();
  G.pause = new Pause();
  hookSounds();
  matteAll(G.scene);
  // shaders for the world and the sky, compiled for the target they really
  // draw into; textures uploaded a slice per frame
  await step('shaders');
  await loader.shaders([[G.scene, G.camera], [G.sky.scene, G.sky.cam]]);
  loader.finish();
  // the sounds are synthesised now, while she waits, so the click starts at once
  const audioReady = G.audio.init().catch((e) => console.warn('audio', e));

  canvas.addEventListener('click', () => { if (G.state === 'play') G.input.lock(); });
  on('unlock', () => {
    if (G.state !== 'play') return;
    if (G.desk.seated) { G.desk.stand(); return; }
    G.pause.show();
  });
  window.BENGRIM = makeDebugApi();
  // one click, key or tap: sound needs a gesture (a touch only counts once it lifts)
  const boot = document.getElementById('boot');
  const go = async (e) => {
    if (e && e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
    for (const t of ['pointerdown', 'pointerup', 'keydown']) window.removeEventListener(t, go);
    G.audio.resume(); G.touch.fullscreen();
    await audioReady;
    G.audio.play && G.audio.play('tapeHiss', { vol: 0.15 });
    // the menu grows straight out of the loading scene; a debug day fades through black
    if (!G.menu.useChase || params.has('day')) await G.fx.fadeTo(1, 2.5);
    boot.classList.add('out');
    loader.dispose();
    G.engine.background = G.sky;
    G.state = 'boot';
    if (params.has('day')) {
      // debug: jump straight into a day
      G.state = 'play'; G.hud.crosshair(true);
      G.director.startDay(+params.get('day'));
      if (params.has('peace')) G.peace.debug(params.get('peace'));   // day 7's ending: morning|mirror|hide|search|call|elevator|roof|meet
    } else G.menu.open({ intro: !params.has('nointro') });
    setTimeout(() => (boot.hidden = true), 1300);
  };
  for (const t of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(t, go);
  if (params.has('autostart')) go();
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
    G.peace.update(dt);
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
  if (!G.noRender) G.engine.render(G.view ? G.view.scene : G.scene, G.view ? G.view.cam : G.camera, G.time);   // G.view: the menu's own scene
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
    peace(ph) { return G.peace.debug(ph); },
    key(code, frames = 1) { G.input.pressedSet.add(code); G.input.down.add(code); tick(1 / 30); G.input.down.delete(code); },
  };
}

boot().catch((e) => { console.error(e); const m = document.getElementById('boot-msg'); if (m) m.textContent = 'ERROR: ' + e.message; });
