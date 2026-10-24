import * as THREE from 'three';
import { G, emit, on } from './core/globals.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Settings } from './core/settings.js';
import { Physics } from './core/physics.js';
import { initMaterials, M } from './gfx/materials.js';
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
import { FX } from './gfx/fx.js';
import { nextFrame, Tasks } from './core/util.js';

const params = new URLSearchParams(location.search);
G.debug.enabled = params.has('debug');

function progress(p, msg) {
  const f = document.getElementById('boot-fill'); if (f) f.style.width = Math.round(p * 100) + '%';
  const m = document.getElementById('boot-msg'); if (m && msg) m.textContent = msg;
}

const audioStub = { play() {}, loop() { return { stop() {}, set() {} }; }, setListener() {}, update() {} };

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
  G.audio = audioStub;
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
  G.cat = new Cat(G.nav);
  G.desk = new Desk(G.apartment);
  if (!G.director) G.director = { hour: 9, minutes: 540, clockMinutes() { return this.minutes; }, nightness: 0, update(dt) { this.minutes += dt * 2; this.hour = this.minutes / 60; } };

  progress(1, 'PLAY ▶');
  document.getElementById('boot').hidden = true;
  G.state = 'play';

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.addEventListener('click', () => { if (G.state === 'play') G.input.lock(); });
  window.BENGRIM = makeDebugApi();
}

function tick(dt) {
  G.dt = dt; G.time += dt; G.frame++;
  G.uniforms.uTime.value = G.time;
  G.tasks.update(dt);
  if (G.state === 'play') {
    G.player.update(dt);
    G.physics.update(dt);
    G.world.update(dt);
    G.apartment.update(dt);
    G.player.lateUpdate(dt);
    G.cat.update(dt);
    G.desk.update(dt);
    G.director.update && G.director.update(dt);
  }
  G.sky.update(dt, G.camera);
  G.fx.update(dt);
  G.particles.update(dt);
  G.hud.update(dt);
  G.audio.update(dt);
  G.engine.render(G.scene, G.camera, G.time);
  G.input.endFrame();
}

function makeDebugApi() {
  return {
    G, THREE,
    tp(x, z, yaw = 0, pitch = 0) { G.player.ctrl.teleport(x, 0.05, z, yaw, pitch); },
    look(yaw, pitch) { G.player.ctrl.yaw = yaw; G.player.ctrl.pitch = pitch; },
    async step(n = 10, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); },
    sit() { G.desk.sit(); },
    key(code, frames = 1) { G.input.pressedSet.add(code); G.input.down.add(code); tick(1 / 30); G.input.down.delete(code); },
  };
}

boot().catch((e) => { console.error(e); const m = document.getElementById('boot-msg'); if (m) m.textContent = 'ERROR: ' + e.message; });
