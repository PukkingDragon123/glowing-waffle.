import * as THREE from 'three';
import { G, emit, on } from './core/globals.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Settings } from './core/settings.js';
import { Physics } from './core/physics.js';
import { initMaterials, matteAll, M } from './gfx/materials.js';
import { setMaxAnisotropy } from './gfx/textures.js';
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
import { AudioEngine } from './audio/audio.js';
import { Director } from './story/director.js';
import { Ending } from './story/ending.js';
import { Alien } from './creatures/alien.js';
import { Mirror } from './gfx/mirror.js';
import { Menu } from './ui/menu.js';
import { Pause } from './ui/pause.js';
import { FX } from './gfx/fx.js';
import { nextFrame, Tasks } from './core/util.js';

const params = new URLSearchParams(location.search);
G.debug.enabled = params.has('debug');

function progress(p, msg) {
  const f = document.getElementById('boot-fill'); if (f) f.style.width = Math.round(p * 100) + '%';
  const m = document.getElementById('boot-msg'); if (m && msg) m.textContent = msg;
}


async function boot() {
  const canvas = document.getElementById('game');
  progress(0.02, 'TRACKING...');
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
  setMaxAnisotropy(G.engine.renderer.capabilities.getMaxAnisotropy());
  await nextFrame();
  progress(0.1, 'DEVELOPING TEXTURES...');
  initMaterials();
  await nextFrame();
  progress(0.3, 'BUILDING APARTMENT 4B...');
  G.world = new World();
  G.particles = new Particles();
  G.decals = new Decals();
  G.apartment = new Apartment().build();
  G.building = new Building().build();
  hookItemEvents();
  await nextFrame();
  progress(0.6, 'WAKING UP...');
  G.player = new Player();
  G.player.body = G.body = new Body();
  G.player.ctrl.teleport(6.0, 0.05, 4.5, 0.6, -0.05);

  G.sky = new Sky();
  G.engine.background = G.sky;
  for (const w of Object.values(G.apartment.windows)) {
    const f = w.frame.group.position;
    G.sky.addWindowLight(new THREE.Vector3(f.x, 1.6, f.z + 0.25), new THREE.Vector3(0, -0.55, 1), 1);
  }
  G.sky.apply(G.sky.preset(+(params.get('day') || 1), +(params.get('t') || 0.12)), true);
  G.fx = new FX();
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
  G.cat = new Cat(G.nav);
  G.desk = new Desk(G.apartment);

  G.mirror = new Mirror(G.apartment.mirrorSpot);
  G.alien = new Alien();
  G.ending = new Ending();
  G.director = new Director();
  G.menu = new Menu();
  G.pause = new Pause();
  hookSounds();
  matteAll(G.scene);
  // compile everything once behind the boot screen
  progress(0.9, 'REWINDING...');
  G.state = 'boot';
  G.engine.renderer.compile(G.scene, G.camera);
  progress(1, '');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.addEventListener('click', () => { if (G.state === 'play') G.input.lock(); });
  on('unlock', () => {
    if (G.state !== 'play') return;
    if (G.desk.seated) { G.desk.stand(); return; }
    G.pause.show();
  });
  window.BENGRIM = makeDebugApi();
  // INSERT TAPE: audio needs a gesture
  const btn = document.getElementById('boot-start');
  const msg = document.getElementById('boot-msg');
  if (msg) msg.textContent = '';
  btn.hidden = false;
  const go = async () => {
    btn.hidden = true;
    if (msg) msg.textContent = 'PLAY ▶';
    try { await G.audio.init((p) => progress(p, 'PLAY ▶')); } catch (e) { console.warn('audio', e); }
    document.getElementById('boot').hidden = true;
    if (params.has('day')) {
      // debug: jump straight into a day
      G.state = 'play'; G.hud.crosshair(true);
      G.director.startDay(+params.get('day'));
    } else G.menu.open({ intro: !params.has('nointro') });
  };
  btn.addEventListener('click', go, { once: true });
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
    G.mirror.update(dt);
  } else if (st === 'menu') {
    G.physics.update(dt);
    G.world.update(dt);
    G.apartment.update(dt);
    G.menu.update(dt);
  } else if (st === 'ending') {
    G.ending.update(dt);
    G.body.lateUpdate(dt);
  }
  if (st !== 'play') G.engine.fx.faceSpot.w = 0;
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
