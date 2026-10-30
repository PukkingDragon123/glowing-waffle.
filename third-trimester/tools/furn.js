// Dev: lay out the old CC0 furniture with a +Z arrow to check scale/orientation.
import * as THREE from 'three';
import { game } from '../src/core/game.js';
import { Gfx } from '../src/core/renderer.js';
import { loadFurniture, furniture, FURN } from '../src/gfx/furniture.js';
const gfx = new Gfx(document.getElementById('game')); game.gfx = gfx;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30343c);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 80);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 6, 5); scene.add(d);
const names = (new URLSearchParams(location.search).get('n') || 'sofa,armchair,desk,chair,stove,kettle,pot,tv,tvStand,shelves,fan,trashCan').split(',');
await loadFurniture();
const out = {};
names.forEach((n, i) => { const f = furniture(n, { pos: [(i % 6) * 1.6 - 4, 0, Math.floor(i / 6) * -2] }); if (!f) return; scene.add(f); out[n] = f.userData.size.toArray().map((v) => +v.toFixed(2));
  const ar = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.position.x, 0.02, f.position.z), 0.8, 0xff2020); scene.add(ar); });
console.log(JSON.stringify(out));
cam.position.set(0, 4.5, 6.5); cam.lookAt(0, 0.4, -1);
gfx.render(scene, cam, 0.016); window.ready = true;
