// Harborview Towers, 4th floor: the hallway outside 4B, the empty 4A, 4C
// (someone still lives there... lived there), the trash room with its chute,
// the stairwell, and an elevator that only knows one floor.
//
//   x: -8.4 trash | -6.4 ........ hallway (z 7.92..9.62) ........ 19.4 | stairwell
//        4A (-3.2)       4B (7.65)      4C (12.7)    4D (16.8)    north side
//        4E (2.2)        [elevator 7.65] 4F (12.0)   4G (15.6)    south side
//   The stairwell is a shaft (landing to 21.2, flights east to 24.5, up and
//   down into the dark). Dressing, hardware and dirt live in hallDressing.js.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Builder } from './builder.js';
import * as F from './furniture.js';
import { Door, Button } from './interactables.js';
import { Fixture } from './lights.js';
import { L, labelMat } from './labels.js';
import { spawn } from './items.js';
import { boxGeo, cylGeo, roundedBox } from '../gfx/geo.js';
import { clamp, damp, pick, smoothstep } from '../core/util.js';
import * as T from '../gfx/textures.js';
import { makeCanvas } from '../gfx/textures.js';
import { softBox, barPull } from '../gfx/shapes.js';
import * as HD from './hallDressing.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BLD = {
  hall: { x0: -6.4, z0: 7.92, x1: 19.4, z1: 9.62, h: 2.6 },
  a4A: { x0: -6.3, z0: 0, x1: -0.14, z1: 7.6, h: 2.7 },
  a4C: { x0: 10.34, z0: 0, x1: 16.2, z1: 7.6, h: 2.7 },
  trash: { x0: -8.4, z0: 7.92, x1: -6.52, z1: 9.62, h: 2.6 },
  stair: { x0: 19.52, z0: 7.3, x1: 24.5, z1: 10.6, h: 2.6 },   // a shaft: flights run east to half landings
  car: { x0: 7.0, z0: 9.84, x1: 8.3, z1: 11.24, h: 2.4 },
};
const NDOORS = { '4A': [-3.6, -2.75], '4C': [12.3, 13.15], '4D': [16.4, 17.25] };
const SDOORS = { '4E': [1.8, 2.65], '4F': [11.6, 12.45], '4G': [15.2, 16.05] };
// wall runs between door casings
const gaps = (a0, a1, holes) => { const out = []; let c = a0; for (const [x0, x1] of [...holes].sort((p, q) => p[0] - q[0])) { if (x0 - 0.07 > c) out.push([c, x0 - 0.07]); c = Math.max(c, x1 + 0.07); } if (c < a1) out.push([c, a1]); return out; };

export class Building {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'building';
    G.world.root.add(this.root);
    this.doors = {}; this.plates = {}; this.lights = {};
    this.loop = false;           // day 5: the hallway has no ends
    this.allFourB = false;       // every number plate reads 4B
    this.visits = 0;
  }

  build() {
    M.wallHall2 = M.wallHall;
    const b = new Builder(this.root);
    const bS = this.bS = new Builder(this.root);   // south wall: can vanish into the void
    const D = (a, bb, y1 = 2.08) => ({ a, b: bb, y0: 0, y1, kind: 'door' });
    const W = (a, bb) => ({ a, b: bb, y0: 0.85, y1: 2.2, kind: 'open' });
    const h = BLD.hall;
    HD.hallFloor(b, h); b.ceiling(h, M.ceilingHall);
    b.wallSide(h, 'n', M.wallHall, [D(...NDOORS['4A']), D(7.2, 8.1, 2.1), D(...NDOORS['4C'])], { thick: 0.02, baseMat: M.trimWood, crownMat: M.trimWood });
    bS.wallSide(h, 's', M.wallHall, [D(7.15, 8.15, 2.12)], { thick: 0.2, baseMat: M.trimWood, crownMat: M.trimWood });
    b.wallSide(h, 'w', M.wallHall, [D(8.35, 9.2)], { thick: 0.12, baseMat: M.trimWood, crownMat: M.trimWood });
    b.wallSide(h, 'e', M.wallHall, [D(8.35, 9.2)], { thick: 0.12, baseMat: M.trimWood, crownMat: M.trimWood });
    // wainscot: dark panel below a chair rail on both long walls
    const wains = (bb, z, nz, segs) => { for (const [a0, a1] of segs) { const w = a1 - a0; bb.box((a0 + a1) / 2, 0.47, z + nz * 0.008, w, 0.86, 0.016, M.woodDark, { collide: false, cast: false }); bb.box((a0 + a1) / 2, 0.92, z + nz * 0.018, w, 0.05, 0.036, M.trimWood, { collide: false, cast: false }); } };
    const segN = gaps(h.x0, h.x1, [NDOORS['4A'], [7.2, 8.1], NDOORS['4C'], NDOORS['4D']]), segS = gaps(h.x0, h.x1, [SDOORS['4E'], [7.15, 8.15], SDOORS['4F'], SDOORS['4G']]);
    wains(b, h.z0, 1, segN); wains(bS, h.z1, -1, segS);
    HD.wainscotDetail(b, h.z0, 1, segN); HD.wainscotDetail(bS, h.z1, -1, segS);
    this.doorFrames(b);
    this.hallDressing(b, bS);
    this.room4A(b);
    this.room4C(b);
    this.trashRoom(b);
    this.stairwell(b);
    this.elevator(b, bS);
    this.statics = b.build('building');
    this.staticsS = bS.build('buildingS');
    G.world.addOccluders(this.statics); G.world.addOccluders(this.staticsS);
    this.makeDoors();
    this.zones();
    G.building = this;
    return this;
  }

  // ------------------------------------------------------------- shell pieces
  frame(b, axis, a0, a1, c, thick, h = 2.08) {
    const w = a1 - a0, cas = 0.07;
    if (axis === 'x') {
      b.box(a0 - 0.012, h / 2, c, 0.024, h, thick + 0.02, M.trimWood, { collide: false });
      b.box(a1 + 0.012, h / 2, c, 0.024, h, thick + 0.02, M.trimWood, { collide: false });
      b.box((a0 + a1) / 2, h + 0.012, c, w + 0.048, 0.024, thick + 0.02, M.trimWood, { collide: false });
      for (const s of [-1, 1]) {
        const z = c + s * (thick / 2 + 0.01);
        b.box(a0 - cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, M.trimWood, { collide: false });
        b.box(a1 + cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, M.trimWood, { collide: false });
        b.box((a0 + a1) / 2, h + cas / 2 + 0.02, z, w + cas * 2, cas, 0.02, M.trimWood, { collide: false });
      }
    } else {
      b.box(c, h / 2, a0 - 0.012, thick + 0.02, h, 0.024, M.trimWood, { collide: false });
      b.box(c, h / 2, a1 + 0.012, thick + 0.02, h, 0.024, M.trimWood, { collide: false });
      b.box(c, h + 0.012, (a0 + a1) / 2, thick + 0.02, 0.024, w + 0.048, M.trimWood, { collide: false });
      for (const s of [-1, 1]) {
        const x = c + s * (thick / 2 + 0.01);
        b.box(x, h / 2 + 0.02, a0 - cas / 2, 0.02, h + 0.04, cas, M.trimWood, { collide: false });
        b.box(x, h / 2 + 0.02, a1 + cas / 2, 0.02, h + 0.04, cas, M.trimWood, { collide: false });
        b.box(x, h + cas / 2 + 0.02, (a0 + a1) / 2, 0.02, cas, w + cas * 2, M.trimWood, { collide: false });
      }
    }
  }
  doorFrames(b) {
    this.frame(b, 'x', ...NDOORS['4A'], 7.76, 0.32);
    this.frame(b, 'x', ...NDOORS['4C'], 7.76, 0.32);
    // fake doors sit on the wall surface: casings only
    const casing = (x0, x1, z, nz) => {
      const cas = 0.07, hh = 2.08, w = x1 - x0;
      b.box(x0 - cas / 2, hh / 2 + 0.02, z + nz * 0.012, cas, hh + 0.04, 0.024, M.trimWood, { collide: false });
      b.box(x1 + cas / 2, hh / 2 + 0.02, z + nz * 0.012, cas, hh + 0.04, 0.024, M.trimWood, { collide: false });
      b.box((x0 + x1) / 2, hh + cas / 2 + 0.02, z + nz * 0.012, w + cas * 2, cas, 0.024, M.trimWood, { collide: false });
    };
    casing(...NDOORS['4D'], BLD.hall.z0, 1);
    for (const k of Object.keys(SDOORS)) casing(...SDOORS[k], BLD.hall.z1, -1);
    this.frame(b, 'z', 8.35, 9.2, -6.46, 0.12);
    this.frame(b, 'z', 8.35, 9.2, 19.46, 0.12);
  }

  hallDressing(b, bS) {
    const h = BLD.hall, zc = (h.z0 + h.z1) / 2;
    F.radiator(b, 4.4, h.z0 + 0.12, 0, 0.9);
    F.radiator(bS, 14.4, h.z1 - 0.12, Math.PI, 0.9);
    // doormats, wiring, fire gear, the leak, the chained door: see hallDressing.js
    HD.hallDetails(this, b, bS, h);
    // notice board between 4A and 4B
    const board = new THREE.Group(); board.position.set(1.6, 1.45, h.z0 + 0.012); this.root.add(board);
    const cork = new THREE.Mesh(boxGeo(1.0, 0.7, 0.02), M.cardboard); board.add(cork);
    const frameM = new THREE.Mesh(boxGeo(1.06, 0.76, 0.012), M.woodDark); frameM.position.z = -0.006; board.add(frameM);
    for (const [x, y, w, hh] of [[0, 0.37, 1.1, 0.04], [0, -0.37, 1.1, 0.04], [0.53, 0, 0.04, 0.7], [-0.53, 0, 0.04, 0.7]]) { const m = new THREE.Mesh(softBox(w, hh, 0.026, 0.006), M.trimWood); m.position.set(x, y, 0.004); board.add(m); }
    this.boardPapers = [];
    const papers = [
      ['trash', ['TRASH PICKUP', 'TUESDAY', 'NO BAGS IN HALL']],
      ['elev', ['ELEVATOR', 'OUT OF ORDER', '-MGMT']],
      ['quiet', ['QUIET HOURS', '10PM - 7AM']],
      ['lost', ['LOST CAT', '"MOCHI" TABBY', 'CALL 555-0142']],
    ];
    const pinGeo = new THREE.SphereGeometry(0.008, 8, 6), pinMat = HD.hdMats().red;
    const pin = (m, y) => { const p = new THREE.Mesh(pinGeo, pinMat); p.position.set(0, y, 0.006); m.add(p); };
    papers.forEach(([k, lines], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), labelMat(L.sign('hb' + k, lines)));
      m.position.set(-0.32 + (i % 3) * 0.32 + (Math.random() - 0.5) * 0.04, 0.16 - Math.floor(i / 3) * 0.3, 0.012);
      m.rotation.z = (Math.random() - 0.5) * 0.12;
      board.add(m); this.boardPapers.push(m); pin(m, 0.065);
      m.userData.key = k;
    });
    this.lostPoster = this.boardPapers[3];
    this.lostPoster.visible = false;
    // "have you seen this man" - added on day 5
    this.seenPoster = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), labelMat(L.poster('seen', (c, w, hh) => {
      c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, hh);
      c.fillStyle = '#111'; c.font = 'bold 15px Arial'; c.textAlign = 'center'; c.fillText('HAVE YOU', w / 2, 20); c.fillText('SEEN THIS', w / 2, 37); c.fillText('PERSON?', w / 2, 54);
      c.fillStyle = '#777'; c.fillRect(24, 62, w - 48, 74);
      c.fillStyle = '#ddd'; c.beginPath(); c.arc(w / 2, 92, 16, 0, Math.PI * 2); c.fill(); c.fillRect(w / 2 - 26, 108, 52, 28);
      c.fillStyle = '#111'; c.font = '10px Arial'; c.fillText('ALEX BENGRIM, APT 4B', w / 2, 150); c.fillText('MISSING SINCE JULY 1', w / 2, 164);
    })));
    this.seenPoster.position.set(0.36, -0.12, 0.013); this.seenPoster.rotation.z = 0.05; board.add(this.seenPoster); this.seenPoster.visible = false; pin(this.seenPoster, 0.135);
    // fluorescent ceiling fixtures: five live (two with a dead tube), two dead, one with its lens gone
    this.hallLights = [];
    const lens = ['half', 'ok', 'ok', 'ok', 'half'];
    [-4.6, 0.4, 5.4, 10.4, 15.4].forEach((x, i) => {
      HD.fluoroHousing(b, x, h.h, zc);
      const lm = HD.lensMat(lens[i], 11 + i);
      const panel = new THREE.Mesh(HD.lensGeo(), lm); panel.position.set(x, h.h - 0.053, zc); this.root.add(panel);
      const f = new Fixture({ pos: V(x, h.h - 0.1, zc), spot: true, angle: 1.35, penumbra: 1, intensity: 6, distance: 6.5, decay: 1.6, color: 0xe4f8e8, fill: 0, shadow: i === 2, shadowSize: 512, bulbMats: [lm], name: 'hall' + i, room: 'hall' });
      f.flicker = i === 0 ? 0.35 : i === 4 ? 0.2 : 0;
      this.hallLights.push(f);
    });
    HD.fluoroHousing(b, -2.1, h.h, zc, 'dead'); HD.fluoroHousing(b, 12.9, h.h, zc, 'dead'); HD.fluoroHousing(b, 17.9, h.h, zc, 'open');
  }

  room4A(b) {
    const r = BLD.a4A;
    const W = (a, bb) => ({ a, b: bb, y0: 0.85, y1: 2.2, kind: 'open' });
    b.floor(r, M.woodFloorOld); b.ceiling(r, M.ceiling);
    b.wallSide(r, 'n', M.wallEmpty, [W(-4.4, -3.2)], { thick: 0.3, baseMat: M.trim });
    b.wallSide(r, 's', M.wallEmpty, [{ a: NDOORS['4A'][0], b: NDOORS['4A'][1], y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.3, baseMat: M.trim });
    b.wallSide(r, 'w', M.wallEmpty, [], { thick: 0.12, baseMat: M.trim });
    b.wallSide(r, 'e', M.wallEmpty, [], { thick: 0.02, baseMat: M.trim });
    F.window4(b, { x: -3.8, z: -0.12, w: 1.2, y0: 0.85, y1: 2.2, ry: 0 });
    G.physics.addStaticBox(-3.8, 1.5, -0.2, 0.6, 0.7, 0.05);
    // pale rectangles where pictures and a couch used to be
    const ghost = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false });
    for (const [x, y, w, hh] of [[-5.2, 1.6, 0.5, 0.65], [-4.4, 1.7, 0.35, 0.4], [-1.4, 1.5, 0.8, 0.55]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), ghost); m.position.set(x, y, r.z1 - 0.005); m.rotation.y = Math.PI; this.root.add(m); }
    const dust = new THREE.MeshStandardMaterial({ color: 0x8a7a64, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false });
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.9), dust); sq.rotation.x = -Math.PI / 2; sq.position.set(-1.6, 0.003, 6.6); this.root.add(sq);
    // the chair
    this.chairPos = V(-3.2, 0, 3.6);
    F.chairStatic(b, this.chairPos.x, this.chairPos.z, Math.PI, M.woodTable);
    // the phone jack with a torn cord, a calendar stuck on June
    b.box(-6.28, 0.3, 5.2, 0.02, 0.08, 0.05, M.beige, { collide: false });
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), labelMat(L.calendar(0)));
    cal.position.set(-6.29, 1.5, 2.6); cal.rotation.y = Math.PI / 2; this.root.add(cal);
    // bare bulb that sways a little, and the figure that sits in the chair later
    this.bulb4A = F.bareBulb(V(-3.2, 2.2, 3.6), { intensity: 6, distance: 7, shadow: true, name: '4A', room: '4A', on: true, cord: 0.45 });
    this.figure = makeFigure();
    this.figure.position.set(this.chairPos.x, 0, this.chairPos.z); this.figure.rotation.y = Math.PI;
    this.figure.visible = false; this.root.add(this.figure);
    HD.room4ADetails(this, b, r);
  }

  room4C(b) {
    const r = BLD.a4C;
    const W = (a, bb) => ({ a, b: bb, y0: 0.85, y1: 2.2, kind: 'open' });
    b.floor(r, M.woodFloor); b.ceiling(r, M.ceiling);
    b.wallSide(r, 'n', M.wallBedroom, [W(12.6, 13.8)], { thick: 0.3, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(r, 's', M.wallBedroom, [{ a: NDOORS['4C'][0], b: NDOORS['4C'][1], y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.3, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(r, 'w', M.wallBedroom, [], { thick: 0.02, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(r, 'e', M.wallBedroom, [], { thick: 0.12, baseMat: M.trim, crownMat: M.trim });
    F.window4(b, { x: 13.2, z: -0.12, w: 1.2, y0: 0.85, y1: 2.2, ry: 0 });
    G.physics.addStaticBox(13.2, 1.5, -0.2, 0.6, 0.7, 0.05);
    // someone's dinner, left mid-meal
    F.table(b, 12.4, 4.2, 0, 0.9, 1.1, 0.75, M.woodTable);
    F.chairStatic(b, 12.4, 5.0, 0); F.chairStatic(b, 12.4, 3.4, Math.PI);
    F.couch(b, 14.9, 2.2, -Math.PI / 2);
    F.tvStand(b, 11.0, 2.2, Math.PI / 2);
    this.fridge4C = F.fridge(b, 15.75, 6.6, -Math.PI / 2);
    b.box(15.85, 0.45, 5.3, 0.6, 0.9, 1.2, M.counter);
    // TV static glow
    const tv = new THREE.Mesh(roundedBox(0.5, 0.42, 0.45, 0.03), M.plasticDark); tv.position.set(11.05, 0.86, 2.2); this.root.add(tv);
    const cv = makeCanvas(64, 48); this.tvCv = cv;
    this.tvTex = new THREE.CanvasTexture(cv.c); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    scr.position.set(11.29, 0.88, 2.2); scr.rotation.y = Math.PI / 2; this.root.add(scr);
    this.tvLight = new THREE.PointLight(0xa0b8ff, 1.2, 3.5, 2); this.tvLight.position.set(11.6, 0.9, 2.2); this.root.add(this.tvLight);
    this.light4C = F.ceilingFixture(V(13.2, 2.68, 3.8), { name: '4C', room: '4C', intensity: 5, fill: 0, on: false });
    this.food4C = [];
    this.spawnFood4C();
  }
  spawnFood4C() {
    // plates of food on the table + food in the fridge
    for (const it of this.food4C) if (!it.dead) it.destroy();
    this.food4C = [];
    const sp = (t, x, y, z) => { const it = spawn(t, x, y, z); if (it) this.food4C.push(it); return it; };
    sp('plate', 12.4, 0.78, 4.55); sp('plate', 12.4, 0.78, 3.85);
    sp('pizza', 12.5, 0.8, 4.2);
    const sh = this.fridge4C.shelves;
    if (sh) { sp('meat', 15.75, sh[1] + 0.03, 6.6); sp('takeout', 15.75, sh[2] + 0.06, 6.55); sp('cola', 15.6, sh[0] + 0.08, 6.75); sp('cheese', 15.85, sh[2] + 0.04, 6.75); }
  }

  trashRoom(b) {
    const r = BLD.trash, mm = HD.hdMats();
    b.floor(r, M.concrete); b.ceiling(r, M.ceilingHall);
    for (const s of ['n', 's', 'w']) b.wallSide(r, s, M.wallEmpty, [], { thick: 0.12, baseMat: null });
    // chute hopper on the west wall: a steel surround, a black throat, a door hinged at its foot
    const hatch = new THREE.Group(); hatch.position.set(r.x0 + 0.02, 1.0, 8.77); this.root.add(hatch);
    hatch.add(new THREE.Mesh(softBox(0.04, 0.62, 0.72, 0.012), mm.galv));
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.38), new THREE.MeshBasicMaterial({ color: 0x000000 })); throat.position.x = 0.021; throat.rotation.y = Math.PI / 2; hatch.add(throat);
    const door = new THREE.Group(); door.position.set(0.035, -0.21, 0); hatch.add(door);
    const leaf = new THREE.Mesh(softBox(0.025, 0.42, 0.5, 0.008), mm.galv); leaf.position.y = 0.21; door.add(leaf);
    const pull = new THREE.Mesh(barPull(0.22, 0.007), M.chrome); pull.rotation.y = Math.PI / 2; pull.position.set(0.0125, 0.36, 0); door.add(pull);
    this.chuteDoor = door;
    this.chuteBtn = new Button(hatch, {
      name: 'chute',
      label: () => { const hnd = G.player.inv.hand; return hnd && hnd.type === 'trashBag' ? 'Drop the trash bag down the chute' : 'Open the trash chute'; },
      onUse: () => this.useChute(),
    });
    b.collider(r.x0 + 0.02, 1.0, 8.77, 0.04, 0.6, 0.7);
    this.trashBulb = F.bareBulb(V(-7.45, 2.3, 8.77), { intensity: 4, distance: 5, name: 'trash', room: 'trash', cord: 0.25 });
    this.trashBulb.flicker = 0.25;
    // bags round the hopper, a stained mattress, a dropped ceiling with a hole in it
    HD.trashDetails(this, b, r);
  }
  useChute() {
    const inv = G.player.inv;
    const hnd = inv.hand;
    this.chuteOpen = 1.2;
    sfx('cabinetOpen', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.6, rate: 0.7 });
    if (!hnd || hnd.type !== 'trashBag') {
      sfx('wind', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.25 });
      G.hud.inner(G.story.day >= 3 ? 'Warm air is coming up the chute. It smells like breath.' : 'It smells awful down there.');
      return;
    }
    inv.consumeHand(true);
    sfx('bagRustle', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.7 });
    const day = G.story.day;
    // the bag falls... and falls
    setTimeout(() => sfx('imp_bag', { pos: V(-8.4, -3, 8.77), vol: 0.35, occlude: false }), 900);
    setTimeout(() => sfx('imp_bag', { pos: V(-8.4, -8, 8.77), vol: 0.2, occlude: false }), 2100);
    if (day >= 2) setTimeout(() => { sfx(day >= 4 ? 'roarFar' : 'growl', { pos: V(-8.4, -12, 8.77), vol: day >= 4 ? 0.6 : 0.4, rate: 0.6 }); G.hud.inner(day >= 4 ? 'Something down there caught it.' : '...it never hit the bottom.'); }, 4200);
    emit('trashOut');
    G.story.flags.trashOut = day;
  }

  stairwell(b) {
    const r = BLD.stair, land = HD.STAIR.land;
    b.floor({ x0: r.x0, z0: r.z0, x1: land, z1: r.z1 }, M.concrete); b.ceiling({ ...r, x1: land }, M.ceilingHall);
    // flights up and down a shaft into the dark: see hallDressing.js
    HD.stairDetails(this, b, r);
    // the only ways on are shut: tape below, a locked gate above, a guard round the well
    b.collider(21.35, 0.6, 8.0, 0.05, 1.2, 1.3);
    b.collider(21.0, 0.6, 9.85, 0.05, 1.2, 1.55);
    b.collider(land, 0.5, 8.85, 0.06, 1.0, 0.5);
    this.stairBulb = F.bareBulb(V(20.6, 2.3, 8.9), { intensity: 3, distance: 6, name: 'stair', room: 'stair', cord: 0.2 });
    this.stairBulb.dim = 0.7;
  }

  // ------------------------------------------------------------- elevator
  elevator(b, bS) {
    const c = BLD.car;
    b.floor(c, M.rubber); b.ceiling(c, M.ceilingHall);
    for (const s of ['s', 'e', 'w']) b.wallSide(c, s, M.woodDark, [], { thick: 0.06, baseMat: M.steel });
    b.wallSide(c, 'n', M.woodDark, [{ a: 7.15, b: 8.15, y0: 0, y1: 2.12, kind: 'door' }], { thick: 0.02 });
    // handrail + mirror strip
    b.box(7.65, 0.95, c.z1 - 0.04, 1.1, 0.04, 0.04, M.chrome, { collide: false });
    b.box(7.65, 1.7, c.z1 - 0.012, 1.0, 0.9, 0.01, M.mirror || M.chrome, { collide: false, cast: false });
    // door panels (two halves) slide into the wall
    const pm = M.steel;
    this.elDoors = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(boxGeo(0.5, 2.1, 0.04), pm); p.castShadow = true; p.receiveShadow = true;
      p.position.set(7.65 + s * 0.25, 1.05, 9.74); this.root.add(p);
      this.elDoors.push({ mesh: p, s, mover: G.physics.addMover({ type: 'box', size: [0.5, 2.1, 0.05] }, 8) });
    }
    // indicator boxes outside and inside
    this.indCv = makeCanvas(48, 24);
    this.indTex = new THREE.CanvasTexture(this.indCv.c); this.indTex.colorSpace = THREE.SRGBColorSpace; this.indTex.magFilter = THREE.NearestFilter;
    const indMat = new THREE.MeshBasicMaterial({ map: this.indTex, toneMapped: false });
    const ind1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), indMat); ind1.position.set(7.65, 2.32, 9.6); ind1.rotation.y = Math.PI; this.root.add(ind1);
    const ind2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), indMat); ind2.position.set(7.65, 2.2, 9.88); this.root.add(ind2);
    bS.box(7.65, 2.32, 9.615, 0.3, 0.16, 0.01, M.black, { collide: false });
    // call button outside
    const cb = new THREE.Group(); cb.position.set(8.45, 1.15, 9.6); this.root.add(cb);
    HD.callPlate(cb);
    this.callLed = new THREE.MeshStandardMaterial({ color: 0x301000, emissive: 0xffa040, emissiveIntensity: 0 });
    const cbb = new THREE.Mesh(cylGeo(0.022, 0.012, 12), this.callLed); cbb.rotation.x = Math.PI / 2; cbb.position.z = -0.012; cb.add(cbb);
    const oos = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), labelMat(L.sign('oos', ['OUT OF', 'ORDER'], '#f4f0d8', '#a01010')));
    oos.position.set(0.06, 0.4, -0.0215); oos.rotation.y = Math.PI; oos.rotation.z = 0.06; this.oosSign = oos; this.elDoors[0].mesh.add(oos);   // taped to the left leaf
    this.callBtn = new Button(cb, { name: 'elevator', label: () => (this.el.state === 'idle' ? 'Call the elevator' : null), onUse: () => this.callElevator() });
    // inside panel: L 1 2 3 4
    const panel = new THREE.Group(); panel.position.set(c.x1 - 0.012, 1.2, 10.15); panel.rotation.y = -Math.PI / 2; this.root.add(panel);
    HD.carPanelExtras(panel);
    this.floorBtns = [];
    ['4', '3', '2', '1', 'L'].forEach((f, i) => {
      const g = new THREE.Group(); g.position.set(0, 0.18 - i * 0.09, 0.008); panel.add(g);
      const led = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc060, emissiveIntensity: 0, map: L.sign('fb' + f, [f], '#d8d0b8', '#222') });
      const bm = new THREE.Mesh(cylGeo(0.026, 0.012, 14), led); bm.rotation.x = Math.PI / 2; g.add(bm);
      this.floorBtns.push({ f, led });
      new Button(g, { name: 'floor' + f, label: () => (this.el.state === 'open' && this.playerInCar() ? (f === 'L' ? 'Lobby' : 'Floor ' + f) : null), onUse: () => this.selectFloor(f) });
    });
    this.carLight = F.ceilingFixture(V(7.65, c.h - 0.01, 10.55), { name: 'car', room: 'car', intensity: 3, distance: 3.5, fill: 0, r: 0.12, color: 0xfff0d0 });
    this.el = { state: 'idle', t: 0, open: 0, floor: 4, target: 4, shown: '4' };
    this.drawIndicator('4');
    HD.elevatorDetails(this, b, bS, c);
  }
  drawIndicator(txt) {
    const { c, ctx } = this.indCv;
    ctx.fillStyle = '#100604'; ctx.fillRect(0, 0, 48, 24);
    ctx.fillStyle = '#ff5020'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 24, 13);
    this.indTex.needsUpdate = true; this.el && (this.el.shown = txt);
  }
  playerInCar() { const p = G.player.ctrl.body.position; const c = BLD.car; return p.x > c.x0 && p.x < c.x1 && p.z > 9.78 && p.z < c.z1; }
  callElevator() {
    if (this.el.state !== 'idle') return;
    sfx('click', { pos: V(8.45, 1.15, 9.6), vol: 0.5 });
    this.callLed.emissiveIntensity = 2;
    this.el.state = 'arriving'; this.el.t = 0;
    emit('elevatorCalled');
  }
  selectFloor(f) {
    if (this.el.state !== 'open') return;
    const b = this.floorBtns.find((x) => x.f === f); if (b) b.led.emissiveIntensity = 1.5;
    sfx('click', { pos: G.camera.position, vol: 0.5 });
    this.el.state = 'closing'; this.el.t = 0; this.el.target = f; this.el.travelling = true;
    emit('elevatorRide', f);
  }
  updateElevator(dt) {
    const e = this.el;
    e.t += dt;
    const day = G.story.day;
    if (e.state === 'arriving' && e.t > 4) { sfx('elevatorDing', { pos: V(7.65, 2.3, 9.6), vol: 0.6 }); e.state = 'opening'; e.t = 0; this.callLed.emissiveIntensity = 0; }
    if (e.state === 'opening') { e.open = Math.min(1, e.open + dt * 0.8); if (e.open >= 1) { e.state = 'open'; e.t = 0; } }
    if (e.state === 'open' && e.t > 9 && !this.playerInDoorway()) { e.state = 'closing'; e.t = 0; e.target = null; }
    if (e.state === 'closing') {
      if (this.playerInDoorway()) { e.state = 'opening'; }
      else { e.open = Math.max(0, e.open - dt * 0.7); if (e.open <= 0) { e.t = 0; if (e.travelling && this.playerInCar()) { e.state = 'travel'; this.rumble = G.audio && G.audio.loop('droneLow', { vol: 0.5, rate: 1.6 }); } else { e.state = 'idle'; e.travelling = false; } } }
    }
    if (e.state === 'travel') {
      // the car hums and shudders downward... and the numbers do not agree
      const dur = 10;
      const k = e.t / dur;
      G.player.ctrl.shake = Math.max(G.player.ctrl.shake || 0, 0.04 + (Math.sin(e.t * 13) > 0.97 ? 0.3 : 0));
      const seq = day >= 6 ? ['4', '4', '4', '4', '4'] : day >= 4 ? ['3', '2', '1', '4', '4'] : ['3', '2', '1', 'L', '4'];
      const shown = seq[Math.min(seq.length - 1, Math.floor(k * seq.length))];
      if (shown !== e.shown) { this.drawIndicator(shown); sfx('click', { pos: G.camera.position, vol: 0.2, rate: 0.6 }); }
      if (day >= 5 && Math.abs(e.t - 5) < dt) { this.carLight.flicker = 1; G.hud.say('hello again', { who: '', cls: 'strange', dur: 2 }); G.audio && G.audio.speak('hello again', { voice: 'whisper', pos: G.camera.position.clone().add(V(0.3, 0, 0)), vol: 0.5 }); }
      if (e.t > dur) {
        if (this.rumble) { this.rumble.stop(0.5); this.rumble = null; }
        this.carLight.flicker = 0;
        this.drawIndicator('4');
        sfx('elevatorDing', { pos: V(7.65, 2.3, 10), vol: 0.6 });
        e.state = 'opening'; e.t = 0; e.travelling = false;
        this.floorBtns.forEach((b) => (b.led.emissiveIntensity = 0));
        this.rides = (this.rides || 0) + 1;
        const lines = [
          '...Four. I pressed the lobby.',
          'There is no other floor. There was never another floor.',
          'It always brings me back here.',
          'Four. Four. Four.',
        ];
        setTimeout(() => G.hud.inner(lines[Math.min(lines.length - 1, this.rides - 1 + (day >= 5 ? 1 : 0))]), 2200);
        emit('elevatorArrived', { rides: this.rides });
      }
    }
    // door panels + colliders
    for (const d of this.elDoors) {
      const x = 7.65 + d.s * (0.25 + e.open * 0.5);
      d.mesh.position.x = x;
      G.physics.setMoverTarget(d.mover, V(x, 1.05, 9.74), new THREE.Quaternion(), false);
    }
    this.carLight.dim = e.state === 'idle' && !this.playerInCar() ? 0 : 1;
  }
  playerInDoorway() { const p = G.player.ctrl.body.position; return p.x > 7.15 && p.x < 8.15 && p.z > 9.45 && p.z < 10.1; }

  // ------------------------------------------------------------- doors
  makeDoors() {
    const knob = M.chrome;
    const plate = (n) => HD.plateMat(n);
    const mk = (key, o) => { const d = new Door({ mat: M.doorHall, knobMat: knob, thick: 0.05, height: 2.08, number: !!o.num, numberMat: o.num ? (this.plates[key] = plate(o.num)) : null, label: 'door', ...o }); this.doors[key] = d; d.key = key; return d; };
    const N = NDOORS, S = SDOORS;
    mk('4A', { hinge: V(N['4A'][0] + 0.01, 0, 7.76), width: 0.83, closedYaw: 0, openDir: 1, maxAngle: 1.6, num: '4A', angle: 0, locked: true, onLocked: () => this.knock('4A') });
    mk('4C', { hinge: V(N['4C'][0] + 0.01, 0, 7.76), width: 0.83, closedYaw: 0, openDir: 1, maxAngle: 1.6, num: '4C', locked: true, onLocked: () => this.knock('4C') });
    mk('4D', { hinge: V(N['4D'][0] + 0.01, 0, BLD.hall.z0 + 0.03), width: 0.83, closedYaw: 0, openDir: 1, num: '4D', locked: true, onLocked: () => this.knock('4D') });
    for (const k of Object.keys(S)) mk(k, { hinge: V(S[k][1] - 0.01, 0, BLD.hall.z1 - 0.03), width: 0.83, closedYaw: Math.PI, openDir: -1, num: k, locked: true, onLocked: () => this.knock(k) });
    mk('trash', { hinge: V(-6.46, 0, 8.36), width: 0.83, closedYaw: -Math.PI / 2, openDir: -1, maxAngle: 1.6, mat: M.doorPaint, label: 'trash room door' });
    mk('stair', { hinge: V(19.46, 0, 8.36), width: 0.83, closedYaw: -Math.PI / 2, openDir: 1, maxAngle: 1.6, mat: M.steel, label: 'stairwell door', knob: false });
    // brass plates, peepholes, deadbolts and kick plates; a fire door's push bar
    for (const k of ['4A', '4C', '4D', '4E', '4F', '4G']) HD.doorKit(this.doors[k], { plate: true, peep: true, bolt: true, kick: true, inside: k === '4A' || k === '4C', wreath: k === '4E' });
    HD.doorKit(this.doors.trash, { face: -1, kick: 'steel', metal: 'steel', scratches: [['scuffA', 0.42, 0.1, 0.5, 0.12]] });
    HD.doorKit(this.doors.stair, { kick: 'steel', push: true, sign: ['firedoor', 0.26, 0.13, 1.55], scratches: [['scratchA', 0.3, 0.42, 0.26, 0.36, 0.1], ['scuffB', 0.4, 0.1, 0.5, 0.12]] });
    // 4B's own door from the hall side: the same hardware, and low scratches on it
    const fd = G.apartment && G.apartment.doors && G.apartment.doors.front;
    if (fd) {
      HD.doorKit(fd, { plate: true, peep: true, bolt: true, kick: true, scratches: [['scratchB', 0.3, 0.33, 0.14, 0.18, 0.12], ['scratchB', 0.5, 0.3, 0.12, 0.16, -0.18]] });
      fd.panel.traverse((m) => { if (m.isMesh && m.geometry.type === 'PlaneGeometry') m.material = HD.plateMat('4B'); });
    }
  }
  // knocking on neighbours' doors
  knock(key) {
    const d = this.doors[key];
    const p = d.worldPos(V());
    sfx('knocks', { pos: p, vol: 0.8 });
    emit('noise', { pos: p, loud: 0.4, kind: 'knock' });
    const day = G.story.day;
    this.knocked = this.knocked || {};
    const n = (this.knocked[key] = (this.knocked[key] || 0) + 1);
    const answer = (t, fn) => setTimeout(fn, t * 1000);
    if (key === '4A') {
      if (day === 1) answer(1.5, () => G.hud.inner('Nobody. Their TV was on all night though.'));
      else answer(1.5, () => G.hud.inner("It's not locked... it's just stuck."));
      if (day >= 2) answer(2.2, () => { d.locked = false; d.target = 0.6; sfx('doorCreak', { pos: p, vol: 0.5, rate: 0.7 }); emit('4Aopen'); });
      return;
    }
    if (key === '4C' && day >= 4) { answer(1.2, () => { d.locked = false; d.target = 0.3; sfx('doorCreak', { pos: p, vol: 0.5 }); G.hud.inner('...Mrs. Alvarez?'); }); return; }
    if (day >= 3 && n >= 1) answer(2.0 + Math.random(), () => { sfx('knocks', { pos: p.clone().add(V(0, 0, key in SDOORS ? 0.3 : -0.3)), vol: 0.7, rate: 0.9 }); if (day >= 5) answer(1.5, () => { const l = pick(["it's warm in here", 'you live here now', 'go back to bed', 'feed it']); G.audio && G.audio.speak(l, { voice: 'whisper', pos: p, vol: 0.4 }); G.hud.say(l, { who: key, cls: 'strange', dur: 2.5 }); }); });
    else if (day <= 2) answer(1.6, () => G.hud.inner(pick(['No answer.', 'Nobody home.', 'I can hear a TV... no one answers.'])));
  }
  setPlates(all4B) {
    if (this.allFourB === all4B) return;
    this.allFourB = all4B;
    for (const [k, d] of Object.entries(this.doors)) {
      if (!this.plates[k]) continue;
      const m = all4B ? HD.plateMat('4B') : this.plates[k];
      d.panel.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') o.material = m; });
    }
  }

  // every morning the floor is as it was
  resetDay(day) {
    this.loop = false; this.loops = 0; this.setPlates(false);
    for (const k of ['4A', '4C', '4D', '4E', '4F', '4G']) { const d = this.doors[k]; d.locked = true; d.setAngle(0); }
    this.doors.trash.setAngle(0); this.doors.stair.setAngle(0);
    this.figure.visible = false;
    this.hallLights.forEach((f, i) => { f.flicker = i === 0 ? 0.35 : i === 4 ? 0.2 : 0; f.dim = 1; f.on = true; });
    for (const m of this.staticsS) m.visible = true;
    this.lostPoster.visible = !!G.story.catFled;
    this.seenPoster.visible = day >= 5;
    this.el.state = 'idle'; this.el.open = 0; this.el.travelling = false; this.drawIndicator('4');
    if (this.rumble) { this.rumble.stop(0.2); this.rumble = null; }
    this.knocked = {};
    this.spawnFood4C();
  }

  zones() {
    const w = G.world;
    w.addZone({ name: 'hall', ...BLD.hall, surface: 'carpet', reverb: 'hall', building: true });
    w.addZone({ name: '4A', ...BLD.a4A, surface: 'wood', reverb: 'hall', building: true });
    w.addZone({ name: '4C', ...BLD.a4C, surface: 'wood', reverb: 'room', building: true });
    w.addZone({ name: 'trash', ...BLD.trash, x1: -6.4, surface: 'concrete', reverb: 'small', building: true });
    w.addZone({ name: 'stair', ...BLD.stair, x0: 19.4, y0: -3, surface: 'concrete', reverb: 'stair', building: true });
    w.addZone({ name: 'car', ...BLD.car, z0: 9.62, surface: 'metal', reverb: 'small', building: true });
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    this.updateElevator(dt);
    HD.updateDressing(this, dt);
    // 4A's bulb sways on its cord
    const sw = Math.sin(G.time * 0.9) * 0.05 + Math.sin(G.time * 0.37) * 0.03;
    const bp = V(-3.2 + sw, 2.2, 3.6 + Math.cos(G.time * 0.7) * 0.03);
    this.bulb4A.light.position.copy(bp); this.bulb4A.meshes[0].position.copy(bp);
    this.bulb4A.meshes[1].position.set(bp.x * 0.5 - 3.2 * 0.5, 2.2 + 0.255, bp.z * 0.5 + 3.6 * 0.5);
    this.bulb4A.meshes[1].rotation.z = -sw * 2;
    // TV static in 4C
    if (G.frame % 3 === 0) {
      const { ctx } = this.tvCv; const id = ctx.createImageData(64, 48);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 200; id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v * 1.1; id.data[i + 3] = 255; }
      ctx.putImageData(id, 0, 0); this.tvTex.needsUpdate = true;
      this.tvLight.intensity = 0.8 + Math.random() * 0.8;
    }
    // chute flap
    this.chuteOpen = Math.max(0, (this.chuteOpen || 0) - dt);
    this.chuteDoor.rotation.z = -smoothstep(0, 0.3, Math.min(this.chuteOpen, 1.2 - this.chuteOpen + 0.3)) * 0.9;
    // hallway hum
    const z = G.world.zoneAt(G.player.ctrl.body.position);
    const inHall = z && z.building;
    if (inHall && !this.hum) this.hum = G.audio && G.audio.loop('fluoro', { vol: 0.2 });
    if (!inHall && this.hum) { this.hum.stop(0.5); this.hum = null; }
    // the endless hallway (day 5): walking off either end brings you back in at the other
    if (this.loop) {
      const p = G.player.ctrl.body.position;
      const span = 22.2;
      if (p.x > 18.3 && p.z > 7.95 && p.z < 9.6) { G.player.ctrl.body.position.x -= span; this.loops = (this.loops || 0) + 1; emit('hallLoop', this.loops); }
      else if (p.x < -3.9 - 0.0 && p.x > -5.6 && p.z > 7.95 && p.z < 9.6 && G.player.ctrl.body.velocity.x < -0.05 && this.loopWestArmed) { G.player.ctrl.body.position.x += span; this.loops = (this.loops || 0) + 1; emit('hallLoop', this.loops); }
      this.loopWestArmed = p.x > -2;
    }
  }
}

// A seated silhouette, head bowed: the neighbour who is not there.
function makeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 1 });
  const add = (geo, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.17, 0.38, 4, 8), 0, 0.82, -0.02, 0.08);
  add(new THREE.SphereGeometry(0.11, 10, 8), 0, 1.25, 0.04);
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.065, 0.36, 3, 6), s * 0.11, 0.5, 0.2, Math.PI / 2);
    add(new THREE.CapsuleGeometry(0.055, 0.38, 3, 6), s * 0.11, 0.24, 0.4);
    add(new THREE.CapsuleGeometry(0.045, 0.5, 3, 6), s * 0.21, 0.78, 0.12, -0.5);
  }
  return g;
}
