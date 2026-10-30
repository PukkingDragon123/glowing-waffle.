// Dev: build the apartment + characters and render a still from a camera preset (?cam=overview).
import * as THREE from 'three';
import { game } from '../src/core/game.js';
import { Gfx } from '../src/core/renderer.js';
import { AudioEngine } from '../src/core/audio.js';
import { UI } from '../src/core/ui.js';
import { loadEnv } from '../src/gfx/env.js';
import { buildCharacters } from '../src/chars/index.js';
import { Apartment } from '../src/scenes/apartment.js';
import { newState } from '../src/game/state.js';
import { CAMS } from '../src/scenes/layout.js';
const q = new URLSearchParams(location.search);
if (q.get('q')) game.settings.values.quality = q.get('q');
const gfx = game.gfx = new Gfx(document.getElementById('game'));
game.ui = new UI(document.getElementById('ui'));
game.state = newState();
const apt = window.apt = new Apartment();
await buildCharacters(() => {});
await apt.init((p, l) => console.log('apt', p.toFixed(2), l));
apt.scene.environment = await loadEnv(gfx.renderer, 'apartment'); apt.scene.environmentIntensity = 0.4;
apt.setLight(q.get('light') || 'evening');
if (q.has('mess')) apt.messUp();
apt.loose.fromPantry(game.state.pantry);
if (q.get('who')) for (const [i, w] of q.get('who').split(',').entries()) apt.spawnActor(w, [0.3 + i * 0.7, 0, 0.9], 0.3);
apt.tv.show('news');
await apt.camTo(q.get('cam') || 'overview', 0);
for (let i = 0; i < 40; i++) { game.time += 0.05; apt.update(0.05); }
gfx.render(apt.scene, apt.camera, 0.016);
window.ready = true;
