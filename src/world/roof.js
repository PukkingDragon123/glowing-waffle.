// The roof of Harborview Towers, over the fourth floor: tar and gravel, a
// brick parapet with stone coping, the elevator penthouse with its door
// propped open, the stair bulkhead, a wooden water tank on a steel stand,
// vents, a TV mast, a sheet on a line. Across the river Manhattan burns (the
// sky scene, unchanged: we are just higher up). Built the first time anyone
// comes up. Four people are waiting.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Builder } from './builder.js';
import { Button } from './interactables.js';
import { L } from './labels.js';
import { cylGeo, roundedBox } from '../gfx/geo.js';
import * as T from '../gfx/textures.js';
import { Person } from '../creatures/people.js';
import { clamp, damp, lerp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ROOF_Y = 3.3;
const R = { x0: -8.8, x1: 24.8, z0: -0.35, z1: 11.8 };
// the car's operating panel (building.js), for the extra button
const PANEL = { pos: V(8.288, 1.2, 10.15), ry: -Math.PI / 2 };

// ordinary 1999 clothes; green skin
export const GREEN = [
  { name: 'june', build: 'f', skin: 0x7ea374, jacket: 0x58789c, top: 0x58789c, under: 0xe8e4da, bottom: 0x1e1f24, shoes: 0xe6e2da, sole: 0xf0ece4, hair: 0x22160f, hairStyle: 'bob', height: 0.96, collar: 0x5a7aa0, eyes: 0x3a2a18, cuffs: true },
  { name: 'walt', build: 'm', hold: 0.85, skin: 0x6f9468, jacket: 0x8f8268, top: 0x8f8268, under: 0xa8bcd0, bottom: 0x4c4234, shoes: 0x3a2618, hair: 0x9c9a92, hairStyle: 'receding', glasses: true, height: 0.98, collar: 0xa8bcd0, belt: 0x2a1c12 },
  { name: 'dee', build: 'm', hold: 0.55, skin: 0x87aa78, top: 0x5c2129, bottom: 0x34405a, shoes: 0xb8b8b4, sole: 0xe0e0dc, hair: 0x14100c, hairStyle: 'short', height: 1.03, hood: true, cuffs: true },
  { name: 'lou', build: 'f', skin: 0x76a17e, jacket: 0x7a5c2c, top: 0x7a5c2c, under: 0x1a1a1e, bottom: 0x2c2836, legs: 'skirt', tights: 0x141418, shoes: 0x101010, boots: true, hair: 0x4a2c18, hairStyle: 'long', height: 0.94 },
];

export class Roof {
  constructor() { this.built = false; this.on = false; G.roof = this; }

  // the elevator's new button: R, above the others, lit faint green
  makeButton(onUse) {
    if (this.btn) return;
    const g = new THREE.Group(); g.position.copy(PANEL.pos); g.rotation.y = PANEL.ry; G.world.root.add(g);
    const led = this.btnLed = new THREE.MeshStandardMaterial({ color: 0x203020, emissive: 0x70ffa8, emissiveIntensity: 0, map: L.sign('fbR', ['R'], '#d8d0b8', '#222') });
    const b = this.btnMesh = new THREE.Mesh(cylGeo(0.026, 0.012, 14), led); b.rotation.x = Math.PI / 2; b.position.set(-0.045, 0.245, 0.008); g.add(b);
    b.visible = false;
    this.btn = new Button(b, { name: 'floorR', label: () => (b.visible && G.building.el.state === 'open' && G.building.playerInCar() ? 'Roof' : null), onUse });
  }
  showButton(v) { if (this.btnMesh) { this.btnMesh.visible = v; this.btnLed.emissiveIntensity = v ? 0.9 : 0; } }

  build() {
    if (this.built) return;
    this.built = true;
    const root = this.root = new THREE.Group(); root.name = 'roof'; root.visible = false;
    root.position.y = ROOF_Y; G.world.root.add(root);
    const b = new Builder(root);
    const tar = M.roofTar || std('roofTar', T.concrete({ seed: 61, base: [50, 48, 46], worldSize: 1.6 }), { roughness: 0.92, normal: 1.4 });
    const stone = M.coping || std('coping', T.concrete({ seed: 62, base: [138, 132, 120], worldSize: 1.2 }), { roughness: 0.9 });
    const brick = M.brick, steel = M.rustMetal, wood = M.roofWood || std('roofWood', T.woodDark({ seed: 63, base: [96, 82, 66], worldSize: 1.4 }), { roughness: 0.95 });
    const at = (o) => { o.y = (o.y || 0) + ROOF_Y; return o; };
    // colliders go in world space; the builder adds them where its boxes are, so keep geometry in roof-local space and lift colliders
    const box = (x, y, z, w, h, d, mat, o = {}) => { b.box(x, y, z, w, h, d, mat, { ...o, collide: false }); if (o.collide !== false) G.physics.addStaticBox(x, y + ROOF_Y, z, w / 2, h / 2, d / 2, o.ry || 0); };
    // ---- the deck: tar over the whole block, seams of flashing, a few puddles
    const w = R.x1 - R.x0, d = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    b.floor({ x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1 }, tar, { collide: false });
    G.physics.addStaticBox(cx, ROOF_Y - 0.1, cz, w / 2, 0.1, d / 2);
    const seam = M.roofSeam || std('roofSeam', null, { color: 0x1c1b1a, roughness: 0.6 });
    for (let x = R.x0 + 1.1; x < R.x1; x += 1.0) box(x, 0.004, cz, 0.06, 0.008, d - 0.7, seam, { collide: false, cast: false });
    const wet = new THREE.MeshStandardMaterial({ color: 0x090a0b, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.4 }); wet.userData.keepGloss = true;
    for (const [x, z, sx, sz] of [[4.6, 6.2, 1.6, 0.9], [11.2, 7.8, 1.1, 0.7], [1.4, 2.4, 0.9, 1.3], [17.5, 3.2, 1.8, 1.0]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1, 20), wet); p.rotation.x = -Math.PI / 2; p.scale.set(sx, sz, 1); p.position.set(x, 0.012, z); root.add(p);
    }
    // ---- parapet and coping all the way round
    const ph = 0.98, pt = 0.3;
    box(cx, ph / 2, R.z0 + pt / 2, w, ph, pt, brick); box(cx, ph / 2, R.z1 - pt / 2, w, ph, pt, brick);
    box(R.x0 + pt / 2, ph / 2, cz, pt, ph, d - pt * 2, brick); box(R.x1 - pt / 2, ph / 2, cz, pt, ph, d - pt * 2, brick);
    box(cx, ph + 0.035, R.z0 + pt / 2, w + 0.12, 0.07, pt + 0.12, stone, { collide: false }); box(cx, ph + 0.035, R.z1 - pt / 2, w + 0.12, 0.07, pt + 0.12, stone, { collide: false });
    box(R.x0 + pt / 2, ph + 0.035, cz, pt + 0.12, 0.07, d, stone, { collide: false }); box(R.x1 - pt / 2, ph + 0.035, cz, pt + 0.12, 0.07, d, stone, { collide: false });
    // ---- the elevator penthouse: brick, a steel door propped open, a caged bulb
    const ex0 = 6.7, ex1 = 8.6, ez0 = 9.55, ez1 = 11.5, eh = 2.75;
    box((ex0 + ex1) / 2, eh / 2, ez1 - 0.12, ex1 - ex0, eh, 0.24, brick);
    box(ex0 + 0.12, eh / 2, (ez0 + ez1) / 2, 0.24, eh, ez1 - ez0, brick); box(ex1 - 0.12, eh / 2, (ez0 + ez1) / 2, 0.24, eh, ez1 - ez0, brick);
    box((ex0 + 7.25) / 2, eh / 2, ez0 + 0.12, 7.25 - ex0, eh, 0.24, brick); box((8.05 + ex1) / 2, eh / 2, ez0 + 0.12, ex1 - 8.05, eh, 0.24, brick);
    box(7.65, (2.12 + eh) / 2, ez0 + 0.12, 0.8, eh - 2.12, 0.24, brick, { collide: false });
    box((ex0 + ex1) / 2, eh + 0.06, (ez0 + ez1) / 2, ex1 - ex0 + 0.16, 0.12, ez1 - ez0 + 0.16, stone);
    box((ex0 + ex1) / 2, 1.0, (ez0 + ez1) / 2 + 0.1, ex1 - ex0 - 0.5, 2.0, ez1 - ez0 - 0.6, M.black, { collide: false, cast: false });
    for (const x of [7.22, 8.08]) box(x, 1.06, ez0 + 0.02, 0.05, 2.12, 0.06, steel, { collide: false });
    box(7.65, 2.14, ez0 + 0.02, 0.9, 0.05, 0.06, steel, { collide: false });
    const door = new THREE.Group(); door.position.set(8.05, 0, ez0 - 0.02); door.rotation.y = -1.85; root.add(door);
    const leaf = new THREE.Mesh(roundedBox(0.8, 2.08, 0.045, 0.01), M.steel); leaf.position.set(-0.4, 1.04, 0); leaf.castShadow = true; door.add(leaf);
    const bar = new THREE.Mesh(roundedBox(0.5, 0.04, 0.05, 0.01), M.chrome); bar.position.set(-0.42, 1.0, -0.04); door.add(bar);
    const brickBlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.1), brick); brickBlock.position.set(8.3, 0.03, ez0 - 0.85); brickBlock.rotation.y = 0.4; root.add(brickBlock);
    G.physics.addStaticBox(8.05 - Math.cos(1.85) * 0.4, ROOF_Y + 1.04, ez0 - 0.02 - Math.sin(1.85) * 0.4, 0.4, 1.04, 0.03, -1.85);
    G.physics.addStaticBox(7.65, ROOF_Y + 1.05, ez0 + 0.3, 0.42, 1.05, 0.05);                      // the car is not up here
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.1, 0.04), M.steel); p.position.set(7.65 + s * 0.25, 1.05, ez0 + 0.42); root.add(p); }
    // the cage light over the door
    const glow = this.doorGlow = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 2.4 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow); bulb.position.set(7.65, 2.34, ez0 - 0.1); root.add(bulb);
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 4, 10, Math.PI), M.steel); r.position.copy(bulb.position); r.rotation.set(0, i * Math.PI / 4, 0); root.add(r); }
    box(7.65, 2.4, ez0 - 0.05, 0.12, 0.03, 0.12, M.steel, { collide: false });
    // a bucket of sand for the smokers
    b.geo(cylGeo(0.13, 0.26, 12, 0.15), M.rustMetal, { x: 8.9, y: 0.13, z: 9.2 });
    b.geo(cylGeo(0.12, 0.01, 12), M.cardboard, { x: 8.9, y: 0.255, z: 9.2 });
    for (let i = 0; i < 6; i++) b.geo(cylGeo(0.004, 0.03, 4), M.paperWhite, { x: 8.86 + Math.sin(i * 2.4) * 0.06, y: 0.27, z: 9.2 + Math.cos(i * 2.4) * 0.06, rx: 0.5 + i * 0.3, rz: i });
    // ---- the stair bulkhead at the east end, its door shut
    box(22.0, 1.3, 9.0, 4.8, 2.6, 3.4, brick);
    box(22.0, 2.66, 9.0, 4.96, 0.12, 3.56, stone, { collide: false });
    box(19.58, 1.04, 8.9, 0.05, 2.08, 0.84, M.steel, { collide: false });
    // ---- the water tank on its stand
    const tx = 14.0, tz = 5.2, ty = 2.3, tr = 1.25, th = 2.5;
    for (const [lx, lz] of [[-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0.95, 0.95]]) box(tx + lx, ty / 2, tz + lz, 0.14, ty, 0.14, steel);
    for (const s of [-1, 1]) { box(tx, ty - 0.08, tz + s * 0.95, 2.1, 0.16, 0.12, steel, { collide: false }); box(tx + s * 0.95, ty - 0.08, tz, 0.12, 0.16, 2.1, steel, { collide: false }); }
    for (const s of [-1, 1]) for (const q of [-1, 1]) b.geo(new THREE.BoxGeometry(0.05, 2.5, 0.05), steel, { x: tx + s * 0.95, y: ty / 2, z: tz, rx: q * 0.72 });
    b.geo(cylGeo(tr, th, 28, null, 1), wood, { x: tx, y: ty + th / 2, z: tz });
    b.geo(new THREE.CircleGeometry(tr, 28).rotateX(Math.PI / 2), wood, { x: tx, y: ty + 0.002, z: tz });
    b.geo(new THREE.ConeGeometry(tr + 0.1, 0.75, 28, 1, true), wood, { x: tx, y: ty + th + 0.37, z: tz });
    b.geo(new THREE.SphereGeometry(0.07, 8, 6), steel, { x: tx, y: ty + th + 0.78, z: tz });
    for (let i = 0; i < 5; i++) b.geo(new THREE.TorusGeometry(tr + 0.012, 0.014, 4, 32).rotateX(Math.PI / 2), M.rustMetal, { x: tx, y: ty + 0.2 + i * 0.52, z: tz });
    for (const s of [-1, 1]) b.geo(cylGeo(0.012, ty + th, 6), steel, { x: tx - 0.18 * s, y: (ty + th) / 2, z: tz + tr + 0.05 });
    for (let y = 0.3; y < ty + th; y += 0.3) b.geo(cylGeo(0.009, 0.36, 5), steel, { x: tx, y, z: tz + tr + 0.05, rz: Math.PI / 2 });
    b.geo(cylGeo(0.07, ty, 8), steel, { x: tx + 0.3, y: ty / 2, z: tz + 0.3 });
    // ---- vents, a chimney, the condenser, a skylight
    for (const [x, z, r, h] of [[2.2, 8.4, 0.06, 0.7], [3.0, 8.6, 0.09, 1.0], [10.4, 9.0, 0.05, 0.55], [-2.5, 9.2, 0.08, 0.9], [17.4, 9.4, 0.07, 0.8]]) {
      b.geo(cylGeo(r, h, 10), M.steel, { x, y: h / 2, z });
      b.geo(new THREE.ConeGeometry(r * 2.2, r * 1.6, 10), M.steel, { x, y: h + r * 1.2, z });
    }
    box(-3.2, 0.8, 4.0, 0.9, 1.6, 0.9, brick); box(-3.2, 1.64, 4.0, 1.0, 0.08, 1.0, stone, { collide: false });
    box(2.1, 0.45, 10.4, 1.3, 0.9, 0.9, M.radiator); b.geo(new THREE.CircleGeometry(0.34, 16), M.black, { x: 2.1, y: 0.91, z: 10.4, rx: -Math.PI / 2 });
    for (let i = 0; i < 6; i++) box(2.1 + (i - 2.5) * 0.11, 0.92, 10.4, 0.012, 0.012, 0.7, M.steel, { collide: false, cast: false });
    box(12.0, 0.25, 8.7, 2.2, 0.5, 1.2, M.radiator);
    const sky = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 1.0), M.glassDirt); sky.position.set(12.0, 0.52, 8.7); root.add(sky);
    // ---- the TV mast with its red lamp, and a dish
    const mx = -6.8, mz = 1.4;
    b.geo(cylGeo(0.03, 4.2, 6), M.steel, { x: mx, y: 2.1, z: mz });
    for (let i = 0; i < 5; i++) b.geo(cylGeo(0.008, 1.3 - i * 0.18, 4), M.steel, { x: mx, y: 3.2 + i * 0.2, z: mz, rz: Math.PI / 2, ry: 0.6 });
    for (const [a, l] of [[0.6, 2.2], [2.7, 2.2], [4.6, 2.0]]) { const g = cylGeo(0.004, l, 3); b.geo(g, M.steel, { x: mx + Math.sin(a) * 0.8, y: 1.9, z: mz + Math.cos(a) * 0.8, rx: Math.cos(a) * 0.38, rz: -Math.sin(a) * 0.38 }); }
    this.mastLamp = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 0 });
    const ml = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.mastLamp); ml.position.set(mx, 4.25, mz); root.add(ml);
    b.geo(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), M.beige, { x: 19.0, y: 1.25, z: 0.0, rx: -1.2 });
    b.geo(cylGeo(0.015, 0.4, 5), M.steel, { x: 19.0, y: 1.1, z: 0.05 });
    // ---- a lawn chair someone left facing the river
    const al = M.chrome, web = M.roofWeb || std('roofWeb', null, { color: 0x3a6a4a, roughness: 0.8, side: THREE.DoubleSide });
    b.beginFrame(10.9, 0, 1.4, 0.3);
    for (const s of [-1, 1]) { b.geo(cylGeo(0.012, 0.6, 6), al, { x: s * 0.27, y: 0.22, z: 0.0, rx: 1.1 }); b.geo(cylGeo(0.012, 0.6, 6), al, { x: s * 0.27, y: 0.22, z: 0.0, rx: -1.1 }); b.geo(cylGeo(0.011, 0.6, 6), al, { x: s * 0.27, y: 0.62, z: 0.22, rx: -0.35 }); }
    for (let i = 0; i < 5; i++) { b.geo(new THREE.BoxGeometry(0.54, 0.008, 0.07), web, { x: 0, y: 0.4, z: -0.18 + i * 0.09 }); b.geo(new THREE.BoxGeometry(0.54, 0.07, 0.008), web, { x: 0, y: 0.46 + i * 0.075, z: 0.19 + i * 0.026, rx: -0.35 }); }
    b.endFrame();
    G.physics.addStaticBox(10.9, ROOF_Y + 0.3, 1.4, 0.3, 0.3, 0.3, 0.3);
    // ---- a sheet on a line between two posts
    for (const x of [-1.2, 2.6]) { b.geo(cylGeo(0.025, 1.9, 6), M.steel, { x, y: 0.95, z: 6.4 }); b.geo(cylGeo(0.02, 0.6, 6), M.steel, { x, y: 1.9, z: 6.4, rx: Math.PI / 2 }); }
    b.geo(cylGeo(0.003, 3.8, 3), M.black, { x: 0.7, y: 1.88, z: 6.4, rz: Math.PI / 2 });
    const sg = this.sheetGeo = new THREE.PlaneGeometry(1.5, 1.15, 10, 8);
    this.sheetBase = sg.attributes.position.array.slice();
    const linen = M.roofSheet || std('roofSheet', T.fabric({ seed: 64, base: [208, 204, 194], alt: [196, 194, 188], plaid: false, worldSize: 0.8 }), { roughness: 1, side: THREE.DoubleSide });
    const sheet = this.sheet = new THREE.Mesh(sg, linen); sheet.position.set(0.9, 1.3, 6.4); sheet.castShadow = true; root.add(sheet);
    this.statics = b.build('roof');
    // ---- the light: soft green from nowhere over the four of them, warm at the door
    this.groundGlow = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0x1e4a32, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, map: T.radial({ size: 64, inner: 'rgba(255,255,255,1)', outer: 'rgba(0,0,0,0)' }) }));
    this.groundGlow.rotation.x = -Math.PI / 2; this.groundGlow.position.set(7.6, 0.02, 3.4); root.add(this.groundGlow);
    // ---- the people
    this.people = GREEN.map((o, i) => { const p = new Person({ seed: 3 + i * 1.7, ...o }); p.name = o.name; p.hold = o.hold || 0; root.add(p.root); return p; });
    const spots = [[7.4, 3.9, 0.12], [6.0, 3.1, 0.55], [8.9, 2.6, Math.PI - 0.4], [9.6, 4.0, -0.5]];
    this.people.forEach((p, i) => { const [x, z, ry] = spots[i]; p.root.position.set(x, 0, z); p.root.rotation.y = ry; p.home = V(x, 0, z); p.homeRy = ry; });
    this.t = 0;
  }

  enter(lights) {
    this.build();
    this.root.visible = true; this.on = true;
    this.lights = lights;
    const [g, w] = lights;
    // green: from high above, wide and soft
    g.color.set(0xbff5d4); g.distance = 16; g.decay = 1.1; g.angle = 0.5; g.penumbra = 1;
    g.position.set(7.5, ROOF_Y + 6.5, 5.6); g.target.position.set(7.6, ROOF_Y, 3.0); g.target.updateMatrixWorld(); g.intensity = 30;
    // the caged bulb at the penthouse door
    w.color.set(0xffc27a); w.distance = 7; w.decay = 1.5; w.angle = 1.15; w.penumbra = 0.7;
    w.position.set(7.65, ROOF_Y + 2.28, 9.42); w.target.position.set(7.65, ROOF_Y, 7.8); w.target.updateMatrixWorld(); w.intensity = 5;
    this.wind = G.audio && G.audio.loop('wind', { vol: 0.32, fade: 2 });
    this.rumble = G.audio && G.audio.loop('droneLow', { vol: 0.12, rate: 0.7, fade: 3 });
    this.sirenT = 6;
  }
  leave() {
    if (!this.built) return;
    this.root.visible = false; this.on = false;
    if (this.wind) { this.wind.stop(1); this.wind = null; }
    if (this.rumble) { this.rumble.stop(1); this.rumble = null; }
  }

  update(dt) {
    if (!this.on) return;
    const t = (this.t += dt);
    this.mastLamp.emissiveIntensity = Math.sin(t * 2.2) > 0.6 ? 3 : 0;
    // the sheet lifts and drops on the wind
    const pa = this.sheetGeo.attributes.position, base = this.sheetBase;
    for (let i = 0; i < pa.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], k = (0.575 - y) / 1.15;
      pa.setZ(i, k * (0.18 + Math.sin(t * 1.3 + x * 2.0) * 0.12 + Math.sin(t * 3.1 + x * 5 + y * 3) * 0.04 * k));
      pa.setY(i, y + k * k * 0.06 * Math.sin(t * 1.3 + x));
    }
    pa.needsUpdate = true; this.sheetGeo.computeVertexNormals();
    this.groundGlow.material.opacity = 0.55 + Math.sin(t * 0.7) * 0.08;
    this.sirenT -= dt;
    if (this.sirenT <= 0) { this.sirenT = 22 + Math.random() * 20; G.audio && G.audio.play('siren', { vol: 0.12, pos: V(40 + Math.random() * 80, -10, -60), occlude: false }); }
    for (const p of this.people) p.update(dt);
  }
}
