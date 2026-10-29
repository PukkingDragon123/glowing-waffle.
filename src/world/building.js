// Sukhumvit Paradise Condotel, 14th floor: the corridor outside 1407 with its
// terrazzo and fluorescent tubes, shoes on racks by every door and steel
// grille gates; 1406, empty since the developer went bust; 1408, where Auntie
// Wan lives... lived; the rubbish room with its chute, the fire stairs, and a
// lift that only knows one floor.
//
//   x: -11.3 trash | -9.5 ........ corridor (z 7.1..8.8) ........ 21 | fire stairs
//        1405 (-6.2)   1406 (1.3)   1407 (5.68)   1408 (10.0)   1409 (15.9)   north
//        1414 (-6.6)   1413 (-2.0)  1412 (2.0)  [lift 5.65]  1411 (11.6)  1410 (16)   south
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Builder } from './builder.js';
import * as F from './furniture.js';
import * as TH from './thai.js';
import { Door, Button } from './interactables.js';
import { Fixture, glowMat } from './lights.js';
import { L, labelMat } from './labels.js';
import { spawn } from './items.js';
import { boxGeo, cylGeo, roundedBox } from '../gfx/geo.js';
import { clamp, damp, pick, smoothstep, RNG } from '../core/util.js';
import * as T from '../gfx/textures.js';
import { makeCanvas, toTexture } from '../gfx/textures.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BLD = {
  hall: { x0: -9.5, z0: 7.1, x1: 21, z1: 8.8, h: 2.5 },
  u1406: { x0: -1.3, z0: 0, x1: 3.4, z1: 6.9, h: 2.6 },
  u1408: { x0: 8.44, z0: 0, x1: 13.2, z1: 6.9, h: 2.6 },
  trash: { x0: -11.3, z0: 7.1, x1: -9.62, z1: 8.8, h: 2.5 },
  stair: { x0: 21.12, z0: 6.5, x1: 24.4, z1: 9.8, h: 2.5 },
  car: { x0: 5.0, z0: 8.92, x1: 6.3, z1: 10.3, h: 2.4 },
};
const NDOORS = { '1405': [-6.6, -5.75], '1406': [0.9, 1.75], '1408': [9.6, 10.45], '1409': [15.5, 16.35] };
const SDOORS = { '1414': [-7.0, -6.15], '1413': [-2.4, -1.55], '1412': [1.6, 2.45], '1411': [11.2, 12.05], '1410': [15.6, 16.45] };
const LIFT = [5.15, 6.15];
const ENDS = [7.5, 8.35];

// speckled terrazzo, the floor of every 90s Bangkok condo corridor
function terrazzo() {
  if (M.terrazzo) return M.terrazzo;
  const S = 256, { c, ctx } = makeCanvas(S, S), r = new RNG(1997);
  ctx.fillStyle = '#9aa29a'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = pick(['#c8ccc4', '#6a706a', '#e8e4d8', '#4a504c', '#a87a5a', '#2a2e2c']); const s = r.range(0.6, 3.2); ctx.fillRect(r.range(0, S), r.range(0, S), s, s * r.range(0.6, 1.4)); }
  ctx.fillStyle = '#5a5e58'; ctx.fillRect(0, 0, S, 2); ctx.fillRect(0, 0, 2, S);
  T.ageCanvas(ctx, S, S, 0.12, 4);
  return std('terrazzo', { map: toTexture(c), worldSize: 0.6 }, { roughness: 0.28, env: 1.2 });
}

export class Building {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'building';
    G.world.root.add(this.root);
    this.doors = {}; this.plates = {}; this.lights = {};
    this.loop = false;           // day 5: the corridor has no ends
    this.allSame = false;        // every number plate reads 1407
    this.visits = 0;
    this.visitorSpot = V(5.68, 0, 7.75);
  }

  build() {
    const b = new Builder(this.root);
    const bS = this.bS = new Builder(this.root);   // south side: can vanish into the void
    std('wallHall14', T.plaster({ seed: 141, base: [222, 214, 190], dirt: 0.5, worldSize: 1.6 }), { roughness: 0.9, normal: 0.3 });
    std('dadoHall14', T.plaster({ seed: 142, base: [146, 176, 160], dirt: 0.6, worldSize: 1.2 }), { roughness: 0.6, normal: 0.3 });
    const D = (a, bb, y1 = 2.08) => ({ a, b: bb, y0: 0, y1, kind: 'door' });
    const h = BLD.hall;
    b.floor(h, terrazzo()); b.ceiling(h, M.ceilingHall);
    b.wallSide(h, 'n', M.wallHall14, [D(...NDOORS['1406']), D(5.25, 6.1, 2.1), D(...NDOORS['1408'])], { thick: 0.02 });
    bS.wallSide(h, 's', M.wallHall14, [D(...LIFT, 2.12)], { thick: 0.2 });
    b.wallSide(h, 'w', M.wallHall14, [D(...ENDS)], { thick: 0.12 });
    b.wallSide(h, 'e', M.wallHall14, [D(...ENDS)], { thick: 0.12 });
    // a pale green dado to shoulder height with a dark stripe, scuffed by motorbike helmets
    const dado = (bb, z, nz, segs) => { for (const [a0, a1] of segs) { const w = a1 - a0; bb.box((a0 + a1) / 2, 0.6, z + nz * 0.006, w, 1.2, 0.012, M.dadoHall14, { collide: false, cast: false }); bb.box((a0 + a1) / 2, 1.21, z + nz * 0.012, w, 0.04, 0.024, TH.pm('dadoStripe', 0x2a5a4a, { r: 0.5 }), { collide: false, cast: false }); } };
    dado(b, h.z0, 1, [[h.x0, 0.83], [1.82, 5.18], [6.17, 9.53], [10.52, h.x1]]);
    dado(bS, h.z1, -1, [[h.x0, 5.08], [6.22, h.x1]]);
    this.doorFrames(b);
    this.hallDressing(b, bS);
    this.room1406(b);
    this.room1408(b);
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
  frame(b, axis, a0, a1, c, thick, h = 2.08, mat = M.trimWood) {
    const w = a1 - a0, cas = 0.06;
    if (axis === 'x') {
      b.box(a0 - 0.012, h / 2, c, 0.024, h, thick + 0.02, mat, { collide: false });
      b.box(a1 + 0.012, h / 2, c, 0.024, h, thick + 0.02, mat, { collide: false });
      b.box((a0 + a1) / 2, h + 0.012, c, w + 0.048, 0.024, thick + 0.02, mat, { collide: false });
      for (const s of [-1, 1]) {
        const z = c + s * (thick / 2 + 0.01);
        b.box(a0 - cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, mat, { collide: false });
        b.box(a1 + cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, mat, { collide: false });
        b.box((a0 + a1) / 2, h + cas / 2 + 0.02, z, w + cas * 2, cas, 0.02, mat, { collide: false });
      }
    } else {
      b.box(c, h / 2, a0 - 0.012, thick + 0.02, h, 0.024, mat, { collide: false });
      b.box(c, h / 2, a1 + 0.012, thick + 0.02, h, 0.024, mat, { collide: false });
      b.box(c, h + 0.012, (a0 + a1) / 2, thick + 0.02, 0.024, w + 0.048, mat, { collide: false });
      for (const s of [-1, 1]) {
        const x = c + s * (thick / 2 + 0.01);
        b.box(x, h / 2 + 0.02, a0 - cas / 2, 0.02, h + 0.04, cas, mat, { collide: false });
        b.box(x, h / 2 + 0.02, a1 + cas / 2, 0.02, h + 0.04, cas, mat, { collide: false });
        b.box(x, h + cas / 2 + 0.02, (a0 + a1) / 2, 0.02, cas, w + cas * 2, mat, { collide: false });
      }
    }
  }
  doorFrames(b) {
    this.frame(b, 'x', ...NDOORS['1406'], 7.0, 0.22, 2.08, M.teakDoor || M.trimWood);
    this.frame(b, 'x', ...NDOORS['1408'], 7.0, 0.22, 2.08, M.teakDoor || M.trimWood);
    // the doors nobody opens are only their faces on the wall, each with its plate
    const fake = (x0, x1, z, nz, num) => {
      const cas = 0.06, hh = 2.08, w = x1 - x0;
      b.box(x0 - cas / 2, hh / 2 + 0.02, z + nz * 0.012, cas, hh + 0.04, 0.024, M.trimWood, { collide: false });
      b.box(x1 + cas / 2, hh / 2 + 0.02, z + nz * 0.012, cas, hh + 0.04, 0.024, M.trimWood, { collide: false });
      b.box((x0 + x1) / 2, hh + cas / 2 + 0.02, z + nz * 0.012, w + cas * 2, cas, 0.024, M.trimWood, { collide: false });
    };
    for (const k of ['1405', '1409']) fake(...NDOORS[k], BLD.hall.z0, 1, k);
    for (const k of Object.keys(SDOORS)) fake(...SDOORS[k], BLD.hall.z1, -1, k);
    this.frame(b, 'z', ...ENDS, -9.56, 0.12);
    this.frame(b, 'z', ...ENDS, 21.06, 0.12, 2.08, TH.pm('exitGreen', 0x2a7a4a, { r: 0.5 }));
  }

  // a steel grille gate: the collapsible kind, folded to the side or pulled shut
  grille(b, x0, x1, z, open, nz = 1) {
    const steel = TH.pm('grilleSteel', 0x3a3e40, { r: 0.45, m: 0.6 });
    const w = x1 - x0, H = 2.05;
    if (open) {
      // concertinaed against the wall at the latch side
      for (let i = 0; i < 9; i++) b.box(x1 + 0.08 + i * 0.012, H / 2, z + nz * 0.06, 0.008, H, 0.06, steel, { collide: false });
      b.box(x1 + 0.13, H / 2, z + nz * 0.06, 0.12, H, 0.02, steel, { collide: false });
    } else {
      b.box((x0 + x1) / 2, H - 0.02, z + nz * 0.06, w + 0.1, 0.04, 0.05, steel, { collide: false });
      b.box((x0 + x1) / 2, 0.02, z + nz * 0.06, w + 0.1, 0.04, 0.05, steel, { collide: false });
      for (let i = 0; i <= 8; i++) {
        const x = x0 + (i / 8) * w;
        b.box(x, H / 2, z + nz * 0.06, 0.012, H, 0.012, steel, { collide: false });
        if (i < 8) for (let k = 0; k < 6; k++) { const y = 0.2 + k * 0.32; b.geo(boxGeo(0.01, 0.012, Math.hypot(w / 8, 0.32)), steel, { x: x + w / 16, y: y + 0.16, z: z + nz * 0.06, rx: 0, ry: Math.PI / 2, rz: (k + i) % 2 ? 0.75 : -0.75, cast: false }); }
      }
      // a padlock on a chain
      b.geo(roundedBox(0.05, 0.06, 0.025, 0.01), TH.pm('padlock', 0xc8a030, { r: 0.35, m: 0.6 }), { x: x1 - 0.05, y: 1.0, z: z + nz * 0.1 });
    }
  }
  // a shoe rack and the shoes that don't fit on it
  shoes(b, x, z, nz, seed) {
    const r = new RNG(seed);
    const rack = TH.pm('shoeRack', 0x8a5a2a, { r: 0.6 });
    b.box(x, 0.2, z + nz * 0.15, 0.7, 0.4, 0.28, rack, { collide: true });
    for (const y of [0.17, 0.4]) for (let i = 0; i < 3; i++) b.geo(roundedBox(0.1, 0.07, 0.24, 0.03), TH.pm('shoe' + ((seed + i) % 4), [0x2a2a2a, 0xf0f0f0, 0x8a4a2a, 0x2a4a8a][(seed + i) % 4], { r: 0.5 }), { x: x - 0.22 + i * 0.22 + r.range(-0.03, 0.03), y: y + 0.035, z: z + nz * 0.15, ry: r.range(-0.2, 0.2) });
    TH.flipflops(b, x + 0.55, z + nz * 0.25, r.range(-0.6, 0.6), pick([0x2a6ac8, 0xd84a3a, 0x3a8a4a, 0xe8c040]));
  }

  hallDressing(b, bS) {
    const h = BLD.hall;
    // our gate stands folded open; 1406's is pulled shut and padlocked
    this.grille(b, 5.25, 6.1, h.z0, true, 1);
    this.grilleB = new Builder(this.root);
    this.grille(this.grilleB, ...NDOORS['1406'], h.z0, false, 1);
    this.grille1406 = this.grilleB.build('grille1406');
    this.grille(b, ...NDOORS['1408'], h.z0, true, 1);
    this.shoes(b, 4.55, h.z0, 1, 2);
    this.shoes(b, 9.0, h.z0, 1, 5);
    this.shoes(b, -7.2, h.z0, 1, 7);
    this.shoes(bS, 12.6, h.z1, -1, 3);
    // fire hose cabinet, extinguisher, a dead plant, a stack of chairs by the lift
    const red = TH.pm('fireRed', 0xc02a22, { r: 0.4 });
    b.box(13.6, 1.1, h.z0 + 0.09, 0.7, 0.9, 0.16, red);
    const hose = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), labelMat(L.sign('hose', ['สายดับเพลิง', 'FIRE HOSE'], '#c02a22', '#fff'))); hose.position.set(13.6, 1.62, h.z0 + 0.012); this.root.add(hose);
    b.geo(lathe2(), red, { x: 14.1, y: 0, z: h.z0 + 0.15 });
    TH.voxelPlant(b, -4.4, h.z0 + 0.3, 0, 1.6);
    TH.voxelPlant(b, 19.6, h.z1 - 0.3, 1, 1.4);
    TH.chairStack(bS, 7.2, h.z1 - 0.32, Math.PI, 'white', 4);
    // the guard's stool and his thermos by the lift; a bowl for the soi cats
    TH.stool(bS, 4.3, h.z1 - 0.3, 0xc23a2c, 0.42);
    b.geo(cylGeo(0.05, 0.004, 12), TH.pm('strayBowl', 0xd84a3a, { r: 0.5 }), { x: -8.6, y: 0.004, z: h.z0 + 0.3 });
    // the notice board between 1406 and 1407
    const board = new THREE.Group(); board.position.set(3.45, 1.5, h.z0 + 0.012); this.root.add(board);
    const cork = new THREE.Mesh(boxGeo(1.2, 0.78, 0.02), M.cardboard); board.add(cork);
    const frameM = new THREE.Mesh(boxGeo(1.26, 0.84, 0.012), TH.pm('boardFrame', 0x2a5a8a, { r: 0.5 })); frameM.position.z = -0.006; board.add(frameM);
    this.boardPapers = [];
    const papers = [
      ['water', ['ประกาศ: น้ำไม่ไหล', 'WATER OFF 10-14h', 'นิติบุคคล']],
      ['trash', ['ห้ามทิ้งขยะ', 'หน้าห้อง', 'NO BAGS IN HALL']],
      ['vote', ['พรรคมั่งคั่ง', 'เบอร์ ๙', 'PROSPERITY 9']],
      ['buy', ['รับซื้อห้องชุด', 'เงินสดทันที', 'MERIDIAN PACIFIC']],
      ['lost', ['แมวหาย!', 'ขนม ลายสลิด', 'ห้อง 1407']],
    ];
    papers.forEach(([k, lines], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), labelMat(L.sign('hb' + k, lines, k === 'vote' ? '#1a5ab0' : k === 'buy' ? '#202428' : k === 'lost' ? '#fff6c8' : '#f0f0e8', k === 'vote' ? '#ffd040' : k === 'buy' ? '#e8c060' : '#111')));
      m.position.set(-0.38 + (i % 3) * 0.38 + (Math.random() - 0.5) * 0.04, 0.17 - Math.floor(i / 3) * 0.34, 0.012);
      m.rotation.z = (Math.random() - 0.5) * 0.12;
      board.add(m); this.boardPapers.push(m); m.userData.key = k;
    });
    this.lostPoster = this.boardPapers[4];
    this.lostPoster.visible = false;
    // MISSING: Nok Saengthong, Room 1407. Added on day 5.
    this.seenPoster = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32), labelMat(L.poster('seen', (c, w, hh) => {
      c.fillStyle = '#f0ecdc'; c.fillRect(0, 0, w, hh);
      c.fillStyle = '#b01818'; c.font = `800 22px ${TH.TH}`; c.textAlign = 'center'; c.fillText('คนหาย', w / 2, 24);
      c.fillStyle = '#111'; c.font = '900 11px Arial'; c.fillText('MISSING SINCE 2 JULY', w / 2, 40);
      c.fillStyle = '#777'; c.fillRect(24, 48, w - 48, 80);
      c.fillStyle = '#c8b090'; c.beginPath(); c.arc(w / 2, 80, 17, 0, Math.PI * 2); c.fill(); c.fillRect(w / 2 - 26, 98, 52, 30);
      c.fillStyle = 'rgba(200,170,140,0.9)'; c.fillRect(w / 2 - 20, 74, 44, 10);
      c.fillStyle = '#111'; c.font = `600 12px ${TH.TH}`; c.fillText('นก แสงทอง  ห้อง ๑๔๐๗', w / 2, 146);
      c.font = '700 9px Arial'; c.fillText('NOK SAENGTHONG, ROOM 1407', w / 2, 160);
    })));
    this.seenPoster.position.set(0.44, -0.14, 0.013); this.seenPoster.rotation.z = 0.05; board.add(this.seenPoster); this.seenPoster.visible = false;
    // floor sign at the lift: ชั้น ๑๔
    const floorSign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), labelMat(L.sign('floor14', ['ชั้น ๑๔', 'FLOOR 14'], '#1a3a6a', '#ffffff')));
    floorSign.position.set(6.95, 1.7, h.z1 - 0.012); floorSign.rotation.y = Math.PI; this.root.add(floorSign);
    // fluorescent tubes on bare battens down the ceiling
    this.hallLights = [];
    [-7.5, -2.5, 2.5, 7.5, 12.5, 17.5].forEach((x, i) => {
      const tubeM = glowMat(0xffffff, 0xe0fff0, 2.0);
      const bat = new THREE.Mesh(roundedBox(1.25, 0.04, 0.09, 0.01), M.enamel); bat.position.set(x, h.h - 0.02, (h.z0 + h.z1) / 2); this.root.add(bat);
      const tube = new THREE.Mesh(cylGeo(0.015, 1.2, 8), tubeM); tube.rotation.z = Math.PI / 2; tube.position.set(x, h.h - 0.07, (h.z0 + h.z1) / 2); this.root.add(tube);
      tubeM.userData.emi = 2.0;
      const f = new Fixture({ pos: V(x, h.h - 0.12, (h.z0 + h.z1) / 2), spot: true, angle: 1.35, penumbra: 1, intensity: 6, distance: 6.5, decay: 1.6, color: 0xe4fff0, fill: 0, shadow: i === 3, shadowSize: 512, bulbMats: [tubeM], name: 'hall' + i, room: 'hall' });
      f.flicker = i === 0 ? 0.35 : i === 5 ? 0.2 : 0;
      this.hallLights.push(f);
    });
    // green running-man exit sign over the fire stairs, a sign over the rubbish room
    const ex = new THREE.Mesh(boxGeo(0.04, 0.18, 0.4), glowMat(0x30d060, 0x20c050, 2.2)); ex.position.set(20.97, 2.28, 7.93); this.root.add(ex);
    const exT = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.15), new THREE.MeshBasicMaterial({ map: L.sign('exit', ['ทางหนีไฟ', 'EXIT'], '#20a050', '#ffffff'), toneMapped: false }));
    exT.position.set(20.945, 2.28, 7.93); exT.rotation.y = -Math.PI / 2; this.root.add(exT);
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), labelMat(L.sign('trashSign', ['ห้องขยะ', 'RUBBISH'])));
    tr.position.set(-9.49, 2.25, 7.93); tr.rotation.y = Math.PI / 2; this.root.add(tr);
  }

  // ------------------------------------------------------------- 1406
  room1406(b) {
    const r = BLD.u1406;
    b.floor(r, M.floorTile || M.woodFloorOld); b.ceiling(r, M.ceiling);
    b.wallSide(r, 'n', M.wallEmpty, [{ a: 0.4, b: 1.6, y0: 0.9, y1: 2.15, kind: 'open' }], { thick: 0.3, baseMat: M.trim });
    b.wallSide(r, 's', M.wallEmpty, [{ a: NDOORS['1406'][0], b: NDOORS['1406'][1], y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.2, baseMat: M.trim });
    b.wallSide(r, 'w', M.wallEmpty, [], { thick: 0.12, baseMat: M.trim });
    b.wallSide(r, 'e', M.wallEmpty, [], { thick: 0.12, baseMat: M.trim });
    this.staticSlider(b, 0.4, 1.6, 0.9, 2.15);
    G.physics.addStaticBox(1.0, 1.5, -0.2, 0.6, 0.7, 0.05);
    // pale rectangles where a bed and pictures used to be, a calendar stuck on June
    const ghost = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false });
    for (const [x, y, w, hh] of [[-0.6, 1.6, 0.5, 0.65], [2.4, 1.7, 0.35, 0.4], [1.2, 1.5, 0.8, 0.55]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), ghost); m.position.set(x, y, r.z1 - 0.005); m.rotation.y = Math.PI; this.root.add(m); }
    const dust = new THREE.MeshStandardMaterial({ color: 0x8a7a64, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false });
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.0), dust); sq.rotation.x = -Math.PI / 2; sq.position.set(0.0, 0.003, 2.0); this.root.add(sq);
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), labelMat(L.calendar(0)));
    cal.position.set(-1.29, 1.5, 4.6); cal.rotation.y = Math.PI / 2; this.root.add(cal);
    // the one plastic chair, under a bulb on a flex
    this.chairPos = V(1.0, 0, 3.4);
    TH.monobloc(this.chairPos.x, this.chairPos.z, Math.PI, 'white', { static: true });
    b.collider(this.chairPos.x, 0.45, this.chairPos.z, 0.5, 0.9, 0.5);
    this.bulb1406 = F.bareBulb(V(1.0, 2.15, 3.4), { intensity: 6, distance: 7, shadow: true, name: '1406', room: '1406', on: true, cord: 0.45 });
    this.figure = makeFigure();
    this.figure.position.set(this.chairPos.x, 0, this.chairPos.z); this.figure.rotation.y = Math.PI;
    this.figure.visible = false; this.root.add(this.figure);
  }
  // a closed aluminium slider, nobody's
  staticSlider(b, x0, x1, y0, y1) {
    const w = x1 - x0, hh = y1 - y0, cx = (x0 + x1) / 2, z = -0.12;
    const alu = M.aluBronze || M.trim;
    b.box(cx, y0 + 0.02, z, w + 0.06, 0.04, 0.12, alu, { collide: false });
    b.box(cx, y1 - 0.025, z, w + 0.06, 0.05, 0.12, alu, { collide: false });
    b.box(x0 - 0.01, y0 + hh / 2, z, 0.04, hh, 0.12, alu, { collide: false });
    b.box(x1 + 0.01, y0 + hh / 2, z, 0.04, hh, 0.12, alu, { collide: false });
    b.box(cx, y0 + hh / 2, z, 0.05, hh, 0.06, alu, { collide: false });
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 0.06, hh - 0.12), M.glassTint || M.glass); g.position.set(cx + s * w / 4, y0 + hh / 2, z + s * 0.02); g.renderOrder = 5; this.root.add(g);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(w / 2 - 0.06, hh - 0.12), M.glassDirt); d.position.set(cx + s * w / 4, y0 + hh / 2, z + s * 0.02 + 0.003); d.renderOrder = 6; this.root.add(d);
    }
    b.box(cx, y0 - 0.01, 0.02, w + 0.12, 0.03, 0.2, M.trim, { collide: false });
  }

  // ------------------------------------------------------------- 1408
  room1408(b) {
    const r = BLD.u1408;
    b.floor(r, M.floorTile || M.woodFloor); b.ceiling(r, M.ceiling);
    b.wallSide(r, 'n', M.wallBedroom, [{ a: 10.2, b: 11.4, y0: 0.9, y1: 2.15, kind: 'open' }], { thick: 0.3, baseMat: M.trim });
    b.wallSide(r, 's', M.wallBedroom, [{ a: NDOORS['1408'][0], b: NDOORS['1408'][1], y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.2, baseMat: M.trim });
    b.wallSide(r, 'w', M.wallBedroom, [], { thick: 0.02, baseMat: M.trim });
    b.wallSide(r, 'e', M.wallBedroom, [], { thick: 0.12, baseMat: M.trim });
    this.staticSlider(b, 10.2, 11.4, 0.9, 2.15);
    G.physics.addStaticBox(10.8, 1.5, -0.2, 0.6, 0.7, 0.05);
    // Auntie Wan's dinner, left half eaten on a low table on a reed mat
    b.box(10.6, 0.004, 3.6, 1.8, 0.008, 1.4, TH.pm('reedMat', 0xc8a868, { r: 1 }), { collide: false, cast: false });
    F.table(b, 10.6, 3.6, 0, 0.9, 0.6, 0.32, M.woodTable);
    this.tableTop1408 = 0.32;
    TH.monobloc(12.2, 2.2, -1.2, 'green', { static: true }); b.collider(12.2, 0.45, 2.2, 0.5, 0.9, 0.5);
    TH.hingPhra(b, 13.2, 2.05, 4.2, -Math.PI / 2);
    F.tvStand(b, 8.9, 2.4, Math.PI / 2);
    this.fridge1408 = F.fridge(b, 12.82, 6.2, -Math.PI / 2);
    b.box(12.9, 0.45, 5.1, 0.6, 0.9, 1.2, M.counter);
    // TV static glow
    const tv = new THREE.Mesh(roundedBox(0.5, 0.42, 0.45, 0.03), M.plasticDark); tv.position.set(8.95, 0.73, 2.4); this.root.add(tv);
    const cv = makeCanvas(64, 48); this.tvCv = cv;
    this.tvTex = new THREE.CanvasTexture(cv.c); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    scr.position.set(9.19, 0.75, 2.4); scr.rotation.y = Math.PI / 2; this.root.add(scr);
    this.tvLight = new THREE.PointLight(0xa0b8ff, 1.2, 3.5, 2); this.tvLight.position.set(9.5, 0.8, 2.4); this.root.add(this.tvLight);
    this.light1408 = F.ceilingFixture(V(10.8, 2.58, 3.4), { name: '1408', room: '1408', intensity: 5, fill: 0, on: false });
    this.food1408 = [];
    this.spawnFood1408();
  }
  spawnFood1408() {
    for (const it of this.food1408) if (!it.dead) it.destroy();
    this.food1408 = [];
    const sp = (t, x, y, z) => { const it = spawn(t, x, y, z); if (it) this.food1408.push(it); return it; };
    const tt = this.tableTop1408 + 0.03;
    sp('plate', 10.4, tt, 3.55); sp('plate', 10.8, tt, 3.65);
    sp('pizza', 10.6, tt + 0.02, 3.4);
    const sh = this.fridge1408.shelves;
    if (sh) { sp('meat', 12.8, sh[1] + 0.03, 6.2); sp('takeout', 12.8, sh[2] + 0.06, 6.15); sp('cola', 12.65, sh[0] + 0.08, 6.35); sp('cheese', 12.9, sh[2] + 0.04, 6.35); }
  }

  // ------------------------------------------------------------- rubbish room
  trashRoom(b) {
    const r = BLD.trash;
    b.floor(r, M.concrete); b.ceiling(r, M.ceilingHall);
    for (const s of ['n', 's', 'w']) b.wallSide(r, s, M.wallEmpty, [], { thick: 0.12, baseMat: null });
    const hatch = new THREE.Group(); hatch.position.set(r.x0 + 0.02, 1.0, 7.95); this.root.add(hatch);
    const plate = new THREE.Mesh(boxGeo(0.04, 0.6, 0.7), M.steel); hatch.add(plate);
    const door = new THREE.Mesh(boxGeo(0.03, 0.42, 0.5), M.rustMetal); door.position.x = 0.03; hatch.add(door);
    const handle = new THREE.Mesh(boxGeo(0.04, 0.03, 0.22), M.chrome); handle.position.set(0.06, 0.15, 0); hatch.add(handle);
    this.chuteDoor = door;
    this.chuteBtn = new Button(hatch, {
      name: 'chute',
      label: () => { const hnd = G.player.inv.hand; return hnd && hnd.type === 'trashBag' ? 'Drop the rubbish down the chute' : 'Open the rubbish chute'; },
      onUse: () => this.useChute(),
    });
    b.box(r.x0 + 0.02, 1.0, 7.95, 0.04, 0.6, 0.7, M.steel, { collide: true });
    for (const [x, z, s, col] of [[-11.0, 8.5, 1, 0x101010], [-10.6, 8.55, 0.8, 0xe86a9a], [-11.05, 7.4, 0.9, 0x2a2a2a]]) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 8, 6), TH.pm('rubbish' + col.toString(16), col, { r: 0.25 })); bag.scale.y = 0.8; bag.position.set(x, 0.15 * s, z); bag.castShadow = true; this.root.add(bag);
      G.physics.addStaticBox(x, 0.15 * s, z, 0.16 * s, 0.15 * s, 0.16 * s);
    }
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), labelMat(L.sign('chute', ['ช่องทิ้งขยะ', 'BAGS ONLY'])));
    sg.position.set(r.x0 + 0.005, 1.55, 7.95); sg.rotation.y = Math.PI / 2; this.root.add(sg);
    this.trashBulb = F.bareBulb(V(-10.45, 2.3, 7.95), { intensity: 4, distance: 5, name: 'trash', room: 'trash', cord: 0.25 });
    this.trashBulb.flicker = 0.25;
  }
  useChute() {
    const inv = G.player.inv;
    const hnd = inv.hand;
    this.chuteOpen = 1.2;
    sfx('cabinetOpen', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.6, rate: 0.7 });
    if (!hnd || hnd.type !== 'trashBag') {
      sfx('wind', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.25 });
      G.hud.inner(G.story.day >= 3 ? 'Warm air is coming up the chute. It smells like breath.' : 'Fourteen floors of fish bones and durian.');
      return;
    }
    inv.consumeHand(true);
    sfx('bagRustle', { pos: this.chuteDoor.getWorldPosition(V()), vol: 0.7 });
    const day = G.story.day;
    setTimeout(() => sfx('imp_bag', { pos: V(-11.3, -3, 7.95), vol: 0.35, occlude: false }), 900);
    setTimeout(() => sfx('imp_bag', { pos: V(-11.3, -8, 7.95), vol: 0.2, occlude: false }), 2100);
    if (day >= 2) setTimeout(() => { sfx(day >= 4 ? 'roarFar' : 'growl', { pos: V(-11.3, -12, 7.95), vol: day >= 4 ? 0.6 : 0.4, rate: 0.6 }); G.hud.inner(day >= 4 ? 'Something down there caught it.' : '...it never hit the bottom.'); }, 4200);
    emit('trashOut');
    G.story.flags.trashOut = day;
  }

  // ------------------------------------------------------------- fire stairs
  stairwell(b) {
    const r = BLD.stair;
    b.floor({ x0: r.x0, z0: r.z0, x1: 22.8, z1: r.z1 }, M.concrete); b.ceiling(r, M.ceilingHall);
    for (const s of ['n', 's', 'e']) b.wallSide(r, s, M.wallPaint, [], { thick: 0.12 });
    b.wallSide({ ...r, x1: r.x0 + 0.01 }, 'w', M.wallPaint, [{ a: ENDS[0], b: ENDS[1], y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.02 });
    for (let i = 0; i < 9; i++) { const y = -0.17 * (i + 1), x = 22.8 + i * 0.27; b.box(x + 0.135, y - 0.1, 7.2, 0.27, 0.2 + 0.17, 1.2, M.concrete); }
    b.box(24.1, -1.6, 7.2, 0.6, 1.5, 1.3, M.concrete, { collide: true });
    for (let i = 0; i < 6; i++) b.box(22.935 + i * 0.27, 0.085 + i * 0.17, 9.0, 0.27, 0.17 + i * 0.34, 1.0, M.concrete, { collide: true });
    for (let i = 0; i < 9; i++) b.box(22.6, 0.6, 8.55 + i * 0.12, 0.02, 1.2, 0.02, M.steel, { collide: false });
    b.collider(22.6, 0.6, 9.0, 0.05, 1.2, 1.1);
    b.box(22.8, 0.95, 6.58, 3.2, 0.04, 0.04, M.steel, { collide: false });
    b.collider(22.8, 0.5, 6.6, 0.05, 1.0, 0.05);
    const tape = new THREE.Mesh(boxGeo(0.01, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 }));
    tape.position.set(22.9, 0.9, 7.2); tape.rotation.x = 0.15; this.root.add(tape);
    b.collider(22.95, 0.6, 7.2, 0.05, 1.2, 0.65);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), labelMat(L.sign('stair', ['ชั้น ๑๔', '14'], '#2a6a4a', '#fff'))); sg.position.set(r.x1 - 0.005, 1.6, 8.1); sg.rotation.y = -Math.PI / 2; this.root.add(sg);
    this.stairBulb = F.bareBulb(V(22.2, 2.3, 8.1), { intensity: 3, distance: 6, name: 'stair', room: 'stair', cord: 0.2 });
    this.stairBulb.dim = 0.7;
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pit.rotation.x = -Math.PI / 2; pit.position.set(23.8, -1.4, 7.2); this.root.add(pit);
  }

  // ------------------------------------------------------------- lift
  elevator(b, bS) {
    const c = BLD.car;
    b.floor(c, M.rubber); b.ceiling(c, M.ceilingHall);
    const panelM = TH.pm('liftSteel', 0x9a8a6a, { r: 0.35, m: 0.7 });
    for (const s of ['s', 'e', 'w']) b.wallSide(c, s, panelM, [], { thick: 0.06, baseMat: M.steel });
    b.wallSide(c, 'n', panelM, [{ a: LIFT[0], b: LIFT[1], y0: 0, y1: 2.12, kind: 'door' }], { thick: 0.02 });
    b.box(5.65, 0.95, c.z1 - 0.04, 1.1, 0.04, 0.04, M.chrome, { collide: false });
    b.box(5.65, 1.7, c.z1 - 0.012, 1.0, 0.9, 0.01, M.mirror || M.chrome, { collide: false, cast: false });
    // an inspection certificate, years out of date, and a sticker for a loan shark
    const cert = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), labelMat(L.sign('liftcert', ['ตรวจสภาพ', '๒๕๓๖', 'INSPECTED 1993'])));
    cert.position.set(c.x0 + 0.04, 1.5, 9.6); cert.rotation.y = Math.PI / 2; this.root.add(cert);
    this.elDoors = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(boxGeo(0.5, 2.1, 0.04), panelM); p.castShadow = true; p.receiveShadow = true;
      p.position.set(5.65 + s * 0.25, 1.05, 8.86); this.root.add(p);
      this.elDoors.push({ mesh: p, s, mover: G.physics.addMover({ type: 'box', size: [0.5, 2.1, 0.05] }, 8) });
    }
    this.indCv = makeCanvas(48, 24);
    this.indTex = new THREE.CanvasTexture(this.indCv.c); this.indTex.colorSpace = THREE.SRGBColorSpace; this.indTex.magFilter = THREE.NearestFilter;
    const indMat = new THREE.MeshBasicMaterial({ map: this.indTex, toneMapped: false });
    const ind1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), indMat); ind1.position.set(5.65, 2.32, 8.79); ind1.rotation.y = Math.PI; this.root.add(ind1);
    const ind2 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), indMat); ind2.position.set(5.65, 2.2, 9.0); this.root.add(ind2);
    bS.box(5.65, 2.32, 8.805, 0.3, 0.16, 0.01, M.black, { collide: false });
    const cb = new THREE.Group(); cb.position.set(6.42, 1.15, 8.79); this.root.add(cb);
    const cbp = new THREE.Mesh(boxGeo(0.1, 0.18, 0.015), M.chrome); cb.add(cbp);
    this.callLed = new THREE.MeshStandardMaterial({ color: 0x301000, emissive: 0xffa040, emissiveIntensity: 0 });
    const cbb = new THREE.Mesh(cylGeo(0.022, 0.012, 12), this.callLed); cbb.rotation.x = Math.PI / 2; cbb.position.z = -0.012; cb.add(cbb);
    const oos = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), labelMat(L.sign('oos', ['ลิฟต์เสีย', 'OUT OF ORDER'], '#f4f0d8', '#a01010')));
    oos.position.set(5.65, 1.45, 8.84); oos.rotation.y = Math.PI; oos.rotation.z = 0.06; this.oosSign = oos; this.root.add(oos);
    this.callBtn = new Button(cb, { name: 'elevator', label: () => (this.el.state === 'idle' ? 'Call the lift' : null), onUse: () => this.callElevator() });
    const panel = new THREE.Group(); panel.position.set(c.x1 - 0.035, 1.2, 9.6); panel.rotation.y = -Math.PI / 2; this.root.add(panel);
    panel.add(new THREE.Mesh(boxGeo(0.16, 0.5, 0.012), M.chrome));
    this.floorBtns = [];
    ['14', '10', '5', '1', 'G'].forEach((f, i) => {
      const g = new THREE.Group(); g.position.set(0, 0.18 - i * 0.09, -0.01); panel.add(g);
      const led = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc060, emissiveIntensity: 0, map: L.sign('fb' + f, [f], '#d8d0b8', '#222') });
      const bm = new THREE.Mesh(cylGeo(0.026, 0.012, 14), led); bm.rotation.x = Math.PI / 2; g.add(bm);
      this.floorBtns.push({ f, led });
      new Button(g, { name: 'floor' + f, label: () => (this.el.state === 'open' && this.playerInCar() ? (f === 'G' ? 'Ground floor' : 'Floor ' + f) : null), onUse: () => this.selectFloor(f) });
    });
    this.carLight = F.ceilingFixture(V(5.65, c.h - 0.01, 9.75), { name: 'car', room: 'car', intensity: 3, distance: 3.5, fill: 0, r: 0.12, color: 0xfff0d0 });
    this.el = { state: 'idle', t: 0, open: 0, floor: 14, target: 14, shown: '14' };
    this.drawIndicator('14');
  }
  drawIndicator(txt) {
    const { ctx } = this.indCv;
    ctx.fillStyle = '#100604'; ctx.fillRect(0, 0, 48, 24);
    ctx.fillStyle = '#ff5020'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 24, 13);
    this.indTex.needsUpdate = true; this.el && (this.el.shown = txt);
  }
  playerInCar() { const p = G.player.ctrl.body.position; const c = BLD.car; return p.x > c.x0 && p.x < c.x1 && p.z > 8.96 && p.z < c.z1; }
  callElevator() {
    if (this.el.state !== 'idle') return;
    sfx('click', { pos: V(6.42, 1.15, 8.79), vol: 0.5 });
    this.callLed.emissiveIntensity = 2;
    this.el.state = 'arriving'; this.el.t = 0;
    emit('elevatorCalled');
  }
  selectFloor(f) {
    if (this.el.state !== 'open') return;
    const bt = this.floorBtns.find((x) => x.f === f); if (bt) bt.led.emissiveIntensity = 1.5;
    sfx('click', { pos: G.camera.position, vol: 0.5 });
    this.el.state = 'closing'; this.el.t = 0; this.el.target = f; this.el.travelling = true;
    emit('elevatorRide', f);
  }
  updateElevator(dt) {
    const e = this.el;
    e.t += dt;
    const day = G.story.day;
    if (e.state === 'arriving' && e.t > 4) { sfx('elevatorDing', { pos: V(5.65, 2.3, 8.79), vol: 0.6 }); e.state = 'opening'; e.t = 0; this.callLed.emissiveIntensity = 0; }
    if (e.state === 'opening') { e.open = Math.min(1, e.open + dt * 0.8); if (e.open >= 1) { e.state = 'open'; e.t = 0; } }
    if (e.state === 'open' && e.t > 9 && !this.playerInDoorway()) { e.state = 'closing'; e.t = 0; e.target = null; }
    if (e.state === 'closing') {
      if (this.playerInDoorway()) { e.state = 'opening'; }
      else { e.open = Math.max(0, e.open - dt * 0.7); if (e.open <= 0) { e.t = 0; if (e.travelling && this.playerInCar()) { e.state = 'travel'; this.rumble = G.audio && G.audio.loop('droneLow', { vol: 0.5, rate: 1.6 }); } else { e.state = 'idle'; e.travelling = false; } } }
    }
    if (e.state === 'travel') {
      const dur = 10, k = e.t / dur;
      G.player.ctrl.shake = Math.max(G.player.ctrl.shake || 0, 0.04 + (Math.sin(e.t * 13) > 0.97 ? 0.3 : 0));
      const seq = day >= 6 ? ['14', '14', '14', '14', '14'] : day >= 4 ? ['12', '9', '5', '14', '14'] : ['11', '7', '3', 'G', '14'];
      const shown = seq[Math.min(seq.length - 1, Math.floor(k * seq.length))];
      if (shown !== e.shown) { this.drawIndicator(shown); sfx('click', { pos: G.camera.position, vol: 0.2, rate: 0.6 }); }
      if (day >= 5 && Math.abs(e.t - 5) < dt) { this.carLight.flicker = 1; G.hud.say('sawasdee kha. welcome back.', { who: '', cls: 'strange', dur: 2.4 }); G.audio && G.audio.speak('welcome back', { voice: 'whisper', pos: G.camera.position.clone().add(V(0.3, 0, 0)), vol: 0.5 }); }
      if (e.t > dur) {
        if (this.rumble) { this.rumble.stop(0.5); this.rumble = null; }
        this.carLight.flicker = 0;
        this.drawIndicator('14');
        sfx('elevatorDing', { pos: V(5.65, 2.3, 9.2), vol: 0.6 });
        e.state = 'opening'; e.t = 0; e.travelling = false;
        this.floorBtns.forEach((bt) => (bt.led.emissiveIntensity = 0));
        this.rides = (this.rides || 0) + 1;
        const lines = [
          '...Fourteen. I pressed G.',
          'There is no other floor. There was never another floor.',
          'It always brings me back here.',
          'Sip-si. Sip-si. Sip-si.',
        ];
        setTimeout(() => G.hud.inner(lines[Math.min(lines.length - 1, this.rides - 1 + (day >= 5 ? 1 : 0))]), 2200);
        emit('elevatorArrived', { rides: this.rides });
      }
    }
    for (const d of this.elDoors) {
      const x = 5.65 + d.s * (0.25 + e.open * 0.5);
      d.mesh.position.x = x;
      G.physics.setMoverTarget(d.mover, V(x, 1.05, 8.86), new THREE.Quaternion(), false);
    }
    this.carLight.dim = e.state === 'idle' && !this.playerInCar() ? 0 : 1;
  }
  playerInDoorway() { const p = G.player.ctrl.body.position; return p.x > LIFT[0] && p.x < LIFT[1] && p.z > 8.6 && p.z < 9.2; }

  // ------------------------------------------------------------- doors
  makeDoors() {
    const plate = (n) => labelMat(L.aptNumber(n));
    const mk = (key, o) => { const d = new Door({ mat: M.teakDoor || M.doorHall, knobMat: M.chrome, thick: 0.05, height: 2.08, style: 'six', number: !!o.num, numberMat: o.num ? (this.plates[key] = plate(o.num)) : null, label: 'door', ...o }); this.doors[key] = d; d.key = key; return d; };
    const N = NDOORS, S = SDOORS;
    mk('1406', { hinge: V(N['1406'][0] + 0.01, 0, 7.0), width: 0.83, closedYaw: 0, openDir: 1, maxAngle: 1.6, num: '1406', angle: 0, locked: true, onLocked: () => this.knock('1406') });
    mk('1408', { hinge: V(N['1408'][0] + 0.01, 0, 7.0), width: 0.83, closedYaw: 0, openDir: 1, maxAngle: 1.6, num: '1408', locked: true, onLocked: () => this.knock('1408') });
    for (const k of ['1405', '1409']) mk(k, { hinge: V(N[k][0] + 0.01, 0, BLD.hall.z0 + 0.03), width: 0.83, closedYaw: 0, openDir: 1, num: k, locked: true, onLocked: () => this.knock(k) });
    for (const k of Object.keys(S)) mk(k, { hinge: V(S[k][1] - 0.01, 0, BLD.hall.z1 - 0.03), width: 0.83, closedYaw: Math.PI, openDir: -1, num: k, locked: true, onLocked: () => this.knock(k) });
    mk('trash', { hinge: V(-9.56, 0, ENDS[0] + 0.01), width: 0.83, closedYaw: -Math.PI / 2, openDir: -1, maxAngle: 1.6, mat: M.doorPaint, style: 'flush', label: 'rubbish room door' });
    mk('stair', { hinge: V(21.06, 0, ENDS[0] + 0.01), width: 0.83, closedYaw: -Math.PI / 2, openDir: 1, maxAngle: 1.6, mat: M.steel, label: 'fire door' });
  }
  // knocking on the neighbours
  knock(key) {
    const d = this.doors[key];
    const p = d.worldPos(V());
    sfx('knocks', { pos: p, vol: 0.8 });
    emit('noise', { pos: p, loud: 0.4, kind: 'knock' });
    const day = G.story.day;
    this.knocked = this.knocked || {};
    const n = (this.knocked[key] = (this.knocked[key] || 0) + 1);
    const answer = (t, fn) => setTimeout(fn, t * 1000);
    if (key === '1406') {
      if (day === 1 || !this.grille1406Open) answer(1.5, () => G.hud.inner(day === 1 ? 'Padlocked. Nobody has lived in 1406 since the developer ran off.' : 'The grille is locked.'));
      else answer(1.5, () => G.hud.inner("It's not locked... it's just stuck."));
      if (day >= 2 && this.grille1406Open) answer(2.2, () => { d.locked = false; d.target = 0.6; sfx('doorCreak', { pos: p, vol: 0.5, rate: 0.7 }); emit('1406open'); });
      return;
    }
    if (key === '1408' && day >= 4) { answer(1.2, () => { d.locked = false; d.target = 0.3; sfx('doorCreak', { pos: p, vol: 0.5 }); G.hud.inner('...Auntie Wan? Pa Wan?'); }); return; }
    if (key === '1408' && day <= 2) { answer(1.6, () => { G.hud.say('Mai yu! Not home! ...I mean, I\'m busy, dear. Eat yet?', { who: '1408', cls: 'voice', dur: 3.5 }); G.audio && G.audio.speak('not home. eat yet?', { voice: 'oldwoman', pos: p, vol: 0.4 }); }); return; }
    if (day >= 3 && n >= 1) answer(2.0 + Math.random(), () => { sfx('knocks', { pos: p.clone().add(V(0, 0, key in SDOORS ? 0.3 : -0.3)), vol: 0.7, rate: 0.9 }); if (day >= 5) answer(1.5, () => { const l = pick(["it's warm in here", 'you live here now', 'go back to bed', 'feed it', 'sign it, nok']); G.audio && G.audio.speak(l, { voice: 'whisper', pos: p, vol: 0.4 }); G.hud.say(l, { who: key, cls: 'strange', dur: 2.5 }); }); });
    else if (day <= 2) answer(1.6, () => G.hud.inner(pick(['No answer.', 'Nobody home.', 'I can hear a lakorn on their TV... nobody answers.'])));
  }
  setPlates(allSame) {
    if (this.allSame === allSame) return;
    this.allSame = allSame;
    for (const [k, d] of Object.entries(this.doors)) {
      if (!this.plates[k]) continue;
      const m = allSame ? (this._p1407 || (this._p1407 = labelMat(L.aptNumber('1407')))) : this.plates[k];
      d.panel.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') o.material = m; });
    }
  }
  // once Meridian owns 1407, the plate on its door says so
  setOwner(meridian) {
    const d = G.apartment.doors.front;
    const mat = meridian ? (this._mpc || (this._mpc = labelMat(L.sign('mpc1407', ['MERIDIAN', '1407'], '#202428', '#e8c060')))) : G.apartment.numberMat;
    d.panel.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.position.z > 0) o.material = mat; });
  }
  setGrille1406(open) {
    this.grille1406Open = open;
    for (const m of this.grille1406) m.visible = !open;
  }

  // every morning the floor is as it was
  resetDay(day) {
    this.loop = false; this.loops = 0; this.setPlates(false);
    for (const k of ['1405', '1406', '1408', '1409', ...Object.keys(SDOORS)]) { const d = this.doors[k]; d.locked = true; d.setAngle(0); }
    this.doors.trash.setAngle(0); this.doors.stair.setAngle(0);
    this.setGrille1406(false);
    this.figure.visible = false;
    this.hallLights.forEach((f, i) => { f.flicker = i === 0 ? 0.35 : i === 5 ? 0.2 : 0; f.dim = 1; f.on = true; });
    for (const m of this.staticsS) m.visible = true;
    this.lostPoster.visible = !!G.story.catFled;
    this.seenPoster.visible = day >= 5;
    this.el.state = 'idle'; this.el.open = 0; this.el.travelling = false; this.drawIndicator('14');
    if (this.rumble) { this.rumble.stop(0.2); this.rumble = null; }
    this.knocked = {};
    this.spawnFood1408();
  }

  zones() {
    const w = G.world;
    w.addZone({ name: 'hall', ...BLD.hall, surface: 'tile', reverb: 'hall', building: true });
    w.addZone({ name: '1406', ...BLD.u1406, surface: 'tile', reverb: 'hall', building: true });
    w.addZone({ name: '1408', ...BLD.u1408, surface: 'tile', reverb: 'room', building: true });
    w.addZone({ name: 'trash', ...BLD.trash, x1: -9.5, surface: 'concrete', reverb: 'small', building: true });
    w.addZone({ name: 'stair', ...BLD.stair, x0: 21, y0: -3, surface: 'concrete', reverb: 'stair', building: true });
    w.addZone({ name: 'car', ...BLD.car, z0: 8.8, surface: 'metal', reverb: 'small', building: true });
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    this.updateElevator(dt);
    const sw = Math.sin(G.time * 0.9) * 0.05 + Math.sin(G.time * 0.37) * 0.03;
    const bp = V(1.0 + sw, 2.15, 3.4 + Math.cos(G.time * 0.7) * 0.03);
    this.bulb1406.light.position.copy(bp); this.bulb1406.meshes[0].position.copy(bp);
    this.bulb1406.meshes[1].position.set(bp.x * 0.5 + 1.0 * 0.5, 2.15 + 0.255, bp.z * 0.5 + 3.4 * 0.5);
    this.bulb1406.meshes[1].rotation.z = -sw * 2;
    if (G.frame % 3 === 0) {
      const { ctx } = this.tvCv; const id = ctx.createImageData(64, 48);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 200; id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v * 1.1; id.data[i + 3] = 255; }
      ctx.putImageData(id, 0, 0); this.tvTex.needsUpdate = true;
      this.tvLight.intensity = 0.8 + Math.random() * 0.8;
    }
    this.chuteOpen = Math.max(0, (this.chuteOpen || 0) - dt);
    this.chuteDoor.rotation.z = -smoothstep(0, 0.3, Math.min(this.chuteOpen, 1.2 - this.chuteOpen + 0.3)) * 0.9;
    const z = G.world.zoneAt(G.player.ctrl.body.position);
    const inHall = z && z.building;
    if (inHall && !this.hum) this.hum = G.audio && G.audio.loop('fluoro', { vol: 0.2 });
    if (!inHall && this.hum) { this.hum.stop(0.5); this.hum = null; }
    // the endless corridor (day 5): walk off either end and come back in at the other
    if (this.loop) {
      const p = G.player.ctrl.body.position;
      const span = 24.0;
      if (p.x > 19.5 && p.z > 7.15 && p.z < 8.75) { G.player.ctrl.body.position.x -= span; this.loops = (this.loops || 0) + 1; emit('hallLoop', this.loops); }
      else if (p.x < -6.0 && p.x > -8.0 && p.z > 7.15 && p.z < 8.75 && G.player.ctrl.body.velocity.x < -0.05 && this.loopWestArmed) { G.player.ctrl.body.position.x += span; this.loops = (this.loops || 0) + 1; emit('hallLoop', this.loops); }
      this.loopWestArmed = p.x > -3;
    }
  }
}

function lathe2() {
  // a fire extinguisher: body, shoulder, valve
  const g = new THREE.LatheGeometry([[0.001, 0], [0.08, 0], [0.085, 0.02], [0.085, 0.42], [0.06, 0.48], [0.02, 0.5], [0.001, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  return g;
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
