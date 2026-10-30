// Standalone test for the facility loading/menu scene.
// ?still&t=6.2  simulate t seconds at 30 fps, render once (for headless screenshots)
// ?menu         jump straight to menu mode     ?q=low|medium|high
import { game } from '../src/core/game.js';
import { Gfx } from '../src/core/renderer.js';
import { AudioEngine } from '../src/core/audio.js';
import { UI } from '../src/core/ui.js';
import { buildCharacters } from '../src/chars/index.js';
import { FacilityScene } from '../src/scenes/facility.js';
import { registerMusic } from '../src/audio/music.js';

const P = new URLSearchParams(location.search);
if (P.get('q')) game.settings.values.quality = P.get('q');
const gfx = game.gfx = new Gfx(document.getElementById('game'));
game.audio = new AudioEngine();
game.ui = new UI(document.getElementById('ui'));
registerMusic(game.audio);
game.audio.loadSamples('../assets/sfx');
game.events.on('menu:new', () => console.log('EVENT menu:new'));
game.events.on('menu:continue', () => console.log('EVENT menu:continue'));

async function main() {
  await document.fonts.ready;
  await buildCharacters(() => {}, ['tofu']);
  const fac = window.fac = new FacilityScene();
  await fac.init();
  fac.enter({ mode: P.has('menu') ? 'menu' : 'loading' });
  if (P.has('still')) {
    await fac.handsReady;
    const T = parseFloat(P.get('t') || '4'), dt = 1 / 30;
    if (P.has('seed')) fac.nextGrab = parseFloat(P.get('seed'));
    let p = 0;
    const exitAt = P.has('exit') ? parseFloat(P.get('exit')) : -1;
    for (let t = 0; t < T; t += dt) {
      if (exitAt >= 0 && t >= exitAt && fac.exiting == null) fac.playExit().then(() => console.log('EXIT DONE')); game.time += dt; p = Math.min(1, t / 8); if (!P.has('menu')) fac.setProgress(p * (parseFloat(P.get('p') || '1')), 'sculpting your husband'); fac.update(dt); gfx.update(dt); }
    fac.update(dt); gfx.render(fac.scene, fac.camera, dt);
    window.ready = true;
    return;
  }
  // live: fake a loading ramp, then show the menu
  const t0 = performance.now();
  const labels = ['waking the facility', 'sculpting your husband', 'boiling water', 'painting the faces', 'counting the cats'];
  const iv = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / 9000); fac.setProgress(k, labels[Math.floor(k * 4.99)]); if (k >= 1) { clearInterval(iv); setTimeout(() => fac.showMenu(), 800); } }, 200);
  let last = performance.now();
  const frame = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; game.time += dt; game.dt = dt; fac.update(dt); gfx.update(dt); gfx.render(fac.scene, fac.camera, dt); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  window.ready = true;
}
main().catch((e) => { console.error(e); window.error = String(e.stack || e); });
