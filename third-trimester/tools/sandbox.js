// Dev sandbox: ?scene=chars renders the character templates. Used for headless screenshots.
import * as THREE from 'three';
import { game } from '../src/core/game.js';
import { Gfx } from '../src/core/renderer.js';
import { loadEnv } from '../src/gfx/env.js';
import { buildCharacters, spawn } from '../src/chars/index.js';

const params = new URLSearchParams(location.search);
if (params.get('q')) game.settings.values.quality = params.get('q');
if (params.has('nopaint')) game.settings.values.painterly = false;
const gfx = new Gfx(document.getElementById('game'));
game.gfx = gfx;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15121a);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
cam.position.set(0, 1.2, 4.2); cam.lookAt(0, 1.0, 0);
scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x3a2a20, 0.6));
const key = new THREE.DirectionalLight(0xffe2c0, 2.4); key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -1; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.PointLight(0x7aa0ff, 6, 10); fill.position.set(-2.5, 1.8, 1); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const actors = [];
async function main() {
  scene.environment = await loadEnv(gfx.renderer, 'apartment');
  scene.environmentIntensity = 0.5;
  const which = (params.get('who') || 'sunny,soldier,general,gary,baby,tofu,tofusuit').split(',');
  const t0 = performance.now();
  await buildCharacters((p, label) => console.log('build', label, p.toFixed(2)));
  console.log('characters ms', performance.now() - t0);
  which.forEach((w, i) => {
    const c = spawn(w); c.root.position.x = (i - (which.length - 1) / 2) * 0.75; scene.add(c.root);
    if (params.get('pose')) c.anim.setPose(params.get('pose'), 0);
    if (w === 'baby') c.root.position.y = 0.0;
    actors.push({ c, anim: c });
  });
  cam.position.set(0, 1.25, 7.5); cam.lookAt(0, 0.9, 0);
  const zoom = params.get('zoom');
  if (zoom === 'face') { cam.fov = 12; const x = actors[0].c.root.position.x; cam.position.set(x, 1.7, 1.9); cam.lookAt(x, 1.68, 0); cam.updateProjectionMatrix(); }
  if (zoom === 'body') { cam.fov = 26; cam.position.set(0, 1.15, 3.3); cam.lookAt(0, 1.0, 0); cam.updateProjectionMatrix(); }
  if (zoom === 'hand') { cam.fov = 14; cam.position.set(actors[0].c.root.position.x + 0.6, 1.0, 1.4); cam.lookAt(actors[0].c.root.position.x + 0.5, 0.95, 0); cam.updateProjectionMatrix(); }
  if (params.has('still')) { for (let i = 0; i < 3; i++) { for (const a of actors) a.c.update(0.4); } gfx.render(scene, cam, 0.016); }
  window.ready = true;
}
let last = performance.now();
function frame(now) {
  if (params.has('still')) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; game.time += dt; game.dt = dt;
  const pose = params.get('pose') || 'idle';
  for (const a of actors) a.c.update(dt);
  gfx.update(dt);
  gfx.render(scene, cam, dt);
  requestAnimationFrame(frame);
}
main().catch((e) => { console.error(e); window.error = String(e.stack || e); });
requestAnimationFrame(frame);
