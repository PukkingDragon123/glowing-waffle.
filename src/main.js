import * as THREE from 'three';
import { G } from './core/globals.js';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Settings } from './core/settings.js';
import { Physics } from './core/physics.js';
import { initMaterials, M } from './gfx/materials.js';
import { setMaxAnisotropy } from './gfx/textures.js';
import { Builder } from './world/builder.js';
import { nextFrame } from './core/util.js';

const params = new URLSearchParams(location.search);

async function boot() {
  const canvas = document.getElementById('game');
  G.settings = new Settings();
  G.engine = new Engine(canvas);
  G.scene = G.engine.scene;
  G.camera = G.engine.camera;
  G.input = new Input(canvas);
  G.physics = new Physics();
  setMaxAnisotropy(G.engine.renderer.capabilities.getMaxAnisotropy());
  initMaterials();
  await nextFrame();

  // --- temporary test room ---
  const b = new Builder(G.scene);
  const r = { x0: 0, z0: 0, x1: 6, z1: 5, h: 2.7 };
  b.room(r, { wall: M.wallLiving, floor: M.woodFloor, ceil: M.ceiling, base: M.trim, crown: M.trim, open: { n: [{ a: 2, b: 3.2, y0: 0.85, y1: 2.2, kind: 'open' }], e: [{ a: 1, b: 1.9, y0: 0, y1: 2.1, kind: 'open' }] } });
  b.box(3, 0.4, 2.5, 1.2, 0.8, 0.6, M.woodTable);
  b.build('test');
  const light = new THREE.PointLight(0xffd8a0, 6, 12, 1.6);
  light.position.set(3, 2.4, 2.5);
  light.castShadow = true;
  G.scene.add(light);
  G.scene.add(new THREE.HemisphereLight(0x8090a0, 0x302820, 0.4));
  G.camera.position.set(1, 1.6, 4.4);
  G.camera.lookAt(4, 1.2, 1);
  document.getElementById('boot').hidden = true;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    G.time += dt;
    G.uniforms.uTime.value = G.time;
    G.engine.render(G.scene, G.camera, G.time);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.BENGRIM = { G, THREE };
}

boot().catch((e) => { console.error(e); document.getElementById('boot-msg').textContent = 'ERROR: ' + e.message; });
