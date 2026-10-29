// Room 1407, Sukhumvit Paradise Condotel, 14th floor. One room, a bathroom
// and a balcony, the way a 1990s studio in Bangkok is: cream glazed floor
// tiles, a fluorescent tube, an air-con over the bed, a kitchenette with a
// gas ring on an LPG bottle. Coordinates in metres; the outside (north) wall
// is z = 0, the balcony sticks out past it, the front door is in the south
// wall (z = 6.9) onto the corridor.
//
//  x: 3.52 ..................................................... 8.32
//  z=-1.45  [ balcony 3.6..5.9 ]
//  z=0      [balcony door 3.95..5.55]  clock   [window 6.4..7.6]  shelf
//           AC / bed (head west)     fan      table + chairs      fridge
//           wardrobe                                              counter
//  z=4.7    boxes                     TV stand | BATHROOM 6.5..8.32
//           desk + PC   [front door 5.25..6.1] |  (door on its west wall)
//  z=6.9
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Builder } from './builder.js';
import * as F from './furniture.js';
import { Door, Switch, Button, SashWindow } from './interactables.js';
import { Fixture, glowMat } from './lights.js';
import { L, labelMat } from './labels.js';
import { spawn } from './items.js';
import { CrtTV } from './tv.js';
import { hangPainting, settlePaintings } from './paintings.js';
import { registerThaiArt } from './thaiart.js';
import * as R from './furnish.js';
import * as TH from './thai.js';
import { has, prop } from './props.js';
import { Seat, Pushable } from './seats.js';
import { boxGeo, cylGeo, roundedBox } from '../gfx/geo.js';
import { clamp, damp, RNG } from '../core/util.js';
import * as T from '../gfx/textures.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const APT = {
  main: { x0: 3.52, z0: 0, x1: 8.32, z1: 6.9, h: 2.6 },
  bath: { x0: 6.62, z0: 4.82, x1: 8.32, z1: 6.9, h: 2.6 },
  balcony: { x0: 3.6, z0: -1.45, x1: 5.9, z1: -0.3, h: 2.6 },
  frontDoor: { x0: 5.25, x1: 6.1, z: 7.0 },
  bathDoor: { z0: 5.95, z1: 6.65, x: 6.56 },
};

export class Apartment {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'apartment';
    G.world.root.add(this.root);
    this.doors = {}; this.lights = {}; this.switches = {}; this.windows = {};
    this.items = [];
    this.paintings = [];
  }

  build() {
    registerThaiArt();
    const b = new Builder(this.root);
    this.b = b;
    this.materials();
    M.fridgeNote = labelMat(L.fridgeNote());
    this.shell(b);
    this.balcony(b);
    this.windowsBuild();
    this.sleeping(b);
    this.kitchen(b);
    this.living(b);
    this.desk(b);
    this.bathroom(b);
    this.doorsAndFrames(b);
    this.clutter(b);
    this.statics = b.build('apt');
    G.world.addOccluders(this.statics);
    this.zones();
    this.spawnItems();
    this.captureInitial();
    return this;
  }

  // the room's own surfaces: glazed cream tiles, tired mint paint, the bathroom
  // in turquoise, a terracotta balcony
  materials() {
    std('floorTile', T.tiles({ seed: 61, base: [214, 200, 170], grout: [140, 126, 104], n: 4, worldSize: 1.2, crack: true }), { roughness: 0.35, env: 1.1 });
    std('wall1407', T.plaster({ seed: 62, base: [196, 214, 196], dirt: 0.45, worldSize: 1.8 }), { roughness: 0.92, normal: 0.35 });
    std('wallBath1407', T.tiles({ seed: 63, base: [96, 176, 178], grout: [214, 222, 214], n: 10, worldSize: 1, crack: true }), { roughness: 0.25, env: 1.2 });
    std('floorBath1407', T.tiles({ seed: 64, base: [70, 120, 150], grout: [190, 196, 190], n: 12, worldSize: 0.8, crack: false }), { roughness: 0.4, env: 1 });
    std('balconyTile', T.tiles({ seed: 65, base: [172, 92, 64], grout: [120, 104, 90], n: 5, worldSize: 1.2, crack: true }), { roughness: 0.7 });
    std('extConcrete', T.plaster({ seed: 66, base: [214, 208, 192], dirt: 0.7, worldSize: 2.2 }), { roughness: 0.95, normal: 0.4 });
    std('ceiling1407', T.ceiling({ seed: 67 }), { roughness: 0.95, normal: 0.25, color: 0xf4f0e4 });
    TH.pm('aluBronze', 0x5e4c3a, { r: 0.35, m: 0.55 });
    TH.pm('teakDoor', 0x6a3c1e, { r: 0.55 });
    TH.pm('pvcDoor', 0x9ab8c8, { r: 0.45 });
    TH.pm('formicaBlue', 0x3a74b0, { r: 0.35 });
    if (!M.glassTint) {
      M.glassTint = M.glass.clone(); M.glassTint.name = 'glass';
      M.glassTint.color.set(0xa08a6a); M.glassTint.opacity = 0.16;
    }
    // the blue curtains
    if (M.curtain) { M.curtain.color.set(0x4a76b8); M.curtain.needsUpdate = true; }
  }

  shell(b) {
    const mr = APT.main;
    const D = (a, bb, y1 = 2.08) => ({ a, b: bb, y0: 0, y1, kind: 'door' });
    const W = (a, bb, y0 = 0.9, y1 = 2.15) => ({ a, b: bb, y0, y1, kind: 'open' });
    // floors: room tiles everywhere but the bathroom
    b.floor({ x0: mr.x0, z0: 0, x1: 6.5, z1: mr.z1 }, M.floorTile);
    b.floor({ x0: 6.5, z0: 0, x1: mr.x1, z1: 4.7 }, M.floorTile, { collide: false });
    b.ceiling(mr, M.ceiling1407);
    const o = { baseMat: M.trim, crownMat: null };
    b.wallSide(mr, 'n', M.wall1407, [{ a: 3.95, b: 5.55, y0: 0, y1: 2.15, kind: 'open' }, W(6.4, 7.6)], { thick: 0.3, ...o });
    b.wallSide(mr, 'w', M.wall1407, [], { thick: 0.12, ...o });
    b.wallSide({ ...mr, z1: 4.7 }, 'e', M.wall1407, [], { thick: 0.2, ...o });
    b.wallSide({ ...mr, x1: 6.5 }, 's', M.wall1407, [D(5.25, 6.1, 2.1)], { thick: 0.2, ...o });
    // the bathroom box seen from the room
    b.wallSide({ x0: 6.5, x1: mr.x1, z0: 0, z1: 4.7 }, 's', M.wall1407, [], { thick: 0.12, ...o });
    b.wallSide({ x0: mr.x0, x1: 6.5, z0: 4.7, z1: mr.z1 }, 'e', M.wall1407, [D(5.95, 6.65)], { thick: 0.12, ...o });
    // bathroom inside
    const ba = APT.bath;
    b.floor(ba, M.floorBath1407, { y: 0.0 });
    for (const s of ['n', 'e', 's']) b.wallSide(ba, s, M.wallBath1407, [], { thick: 0.04 });
    b.wallSide(ba, 'w', M.wallBath1407, [D(5.95, 6.65)], { thick: 0.04 });
    // a raised sill at the bathroom door, the wet-room step
    b.box(6.56, 0.015, 6.3, 0.14, 0.03, 0.7, M.porcelain, { collide: false });
  }

  // ------------------------------------------------------------- balcony
  balcony(b) {
    const bc = APT.balcony;
    b.floor(bc, M.balconyTile, { y: -0.04 });
    // slab edge, the soffit of the balcony above, two concrete side fins
    b.box((bc.x0 + bc.x1) / 2, -0.11, (bc.z0 + bc.z1) / 2 - 0.02, bc.x1 - bc.x0 + 0.24, 0.14, bc.z1 - bc.z0 + 0.1, M.extConcrete, { collide: false });
    b.box((bc.x0 + bc.x1) / 2, 2.67, (bc.z0 + bc.z1) / 2 - 0.02, bc.x1 - bc.x0 + 0.24, 0.14, bc.z1 - bc.z0 + 0.1, M.extConcrete, { collide: true });
    b.box(bc.x0 - 0.06, 1.3, (bc.z0 + bc.z1) / 2 - 0.02, 0.12, 2.75, bc.z1 - bc.z0 + 0.1, M.extConcrete);
    b.box(bc.x1 + 0.06, 1.3, (bc.z0 + bc.z1) / 2 - 0.02, 0.12, 2.75, bc.z1 - bc.z0 + 0.1, M.extConcrete);
    // parapet with a steel rail; you can lean over it and look down 14 floors
    b.box((bc.x0 + bc.x1) / 2, 0.36, bc.z0 + 0.05, bc.x1 - bc.x0, 0.8, 0.1, M.extConcrete);
    b.geo(roundedBox(bc.x1 - bc.x0, 0.05, 0.14, 0.012), M.extConcrete, { x: (bc.x0 + bc.x1) / 2, y: 0.78, z: bc.z0 + 0.05 });
    const rail = TH.pm('railSteel', 0x6a6e70, { r: 0.4, m: 0.6 });
    b.geo(TH.rod(V(bc.x0, 1.08, bc.z0 + 0.06), V(bc.x1, 1.08, bc.z0 + 0.06), 0.022), rail, {});
    for (let x = bc.x0 + 0.1; x < bc.x1; x += 0.46) b.geo(TH.rod(V(x, 0.8, bc.z0 + 0.06), V(x, 1.08, bc.z0 + 0.06), 0.012), rail, {});
    b.collider((bc.x0 + bc.x1) / 2, 1.2, bc.z0 + 0.05, bc.x1 - bc.x0, 2.4, 0.12);   // nobody goes over
    // the laundry rod under the soffit with shirts on hangers
    b.geo(TH.rod(V(bc.x0, 2.42, bc.z0 + 0.32), V(bc.x1, 2.42, bc.z0 + 0.32), 0.012), rail, {});
    const shirts = [0xd84a3a, 0xf0f0e8, 0x2a5aa8, 0xe8c040];
    shirts.forEach((col, i) => {
      const x = bc.x0 + 0.35 + i * 0.5;
      const m = TH.pm('shirtB' + i, col, { r: 0.95, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(0.4, 0.6, 3, 4); const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 14 + i) * 0.015); g.computeVertexNormals();
      b.geo(g, m, { x, y: 2.05, z: bc.z0 + 0.32, ry: 0.2 * (i % 2 ? 1 : -1) });
      b.geo(new THREE.TorusGeometry(0.17, 0.005, 3, 12, Math.PI), TH.pm('hanger', 0x2a8ad8, { r: 0.5 }), { x, y: 2.36, z: bc.z0 + 0.32 });
    });
    // the round sock hanger, all its pegs full
    b.geo(new THREE.TorusGeometry(0.16, 0.008, 4, 18), TH.pm('sockHanger', 0xe87aa0, { r: 0.5 }), { x: bc.x1 - 0.35, y: 2.2, z: bc.z0 + 0.65, rx: Math.PI / 2 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.geo(boxGeo(0.06, 0.16, 0.01), TH.pm('sock' + (i % 3), [0xf0f0f0, 0x2a2a2a, 0x8a8a8a][i % 3], { r: 1 }), { x: bc.x1 - 0.35 + Math.cos(a) * 0.16, y: 2.1, z: bc.z0 + 0.65 + Math.sin(a) * 0.16, ry: -a }); }
    // a spirit shelf in the corner, a dragon jar with lotus, pots, the air-con compressor
    TH.spiritHouse(b, bc.x0 + 0.24, 0, bc.z0 + 0.28, 0.35, { post: 0.95, scale: 0.85 });
    TH.dragonJar(b, bc.x0 + 0.75, bc.z0 + 0.3, 0.75);
    TH.voxelPlant(b, bc.x0 + 1.5, bc.z0 + 0.22, 0, 1.15);
    TH.voxelPlant(b, bc.x0 + 1.8, bc.z0 + 0.22, 1, 0.85);
    TH.voxelPlant(b, bc.x0 + 2.05, bc.z0 + 0.24, 2, 0.85);
    TH.acCompressor(b, bc.x1 - 0.42, bc.z1 - 0.28, Math.PI);
    TH.stool(b, bc.x0 + 0.24, bc.z1 - 0.3, 0x2f5fa8, 0.32);
    // a broom and a bucket against the fin, the cat's litter tray
    b.geo(TH.rod(V(bc.x1 - 0.06, 0.02, bc.z1 - 0.1), V(bc.x1 - 0.1, 1.3, bc.z1 - 0.15), 0.012), TH.pm('broomStick', 0xc8a060, { r: 0.7 }), {});
    b.geo(new THREE.ConeGeometry(0.12, 0.35, 8, 1, true), TH.pm('broomHead', 0xb89a5a, { r: 1, side: THREE.DoubleSide }), { x: bc.x1 - 0.06, y: 0.18, z: bc.z1 - 0.1 });
    b.geo(new THREE.CylinderGeometry(0.15, 0.12, 0.28, 12, 1, true), TH.pm('bucketBlue', 0x2a6ac8, { r: 0.5, side: THREE.DoubleSide }), { x: bc.x0 + 1.15, y: 0.1, z: bc.z0 + 0.24 });
    b.geo(roundedBox(0.42, 0.1, 0.32, 0.03), TH.pm('litterTray', 0x9ad0b0, { r: 0.5 }), { x: bc.x0 + 1.25, y: 0.01, z: bc.z1 - 0.3 });
    b.box(bc.x0 + 1.25, 0.07, bc.z1 - 0.3, 0.38, 0.02, 0.28, TH.pm('litter', 0xd8d0b8, { r: 1 }), { collide: false });
    // a bare bulb under the soffit
    this.lights.balcony = F.bareBulb(V(4.75, 2.45, -0.9), { name: 'balcony', room: 'balcony', intensity: 4, distance: 5, cord: 0.1, on: false });
    this.switches.balcony = new Switch({ pos: V(3.75, 1.25, 0.005), ry: 0, plateMat: M.trim, label: 'balcony light', on: false, onToggle: (on) => this.lights.balcony.set(on) });
  }

  // aluminium sliders: an inner pane runs in front of the fixed one
  slider(key, o) {
    const w = o.x1 - o.x0, h = o.y1 - o.y0, cx = (o.x0 + o.x1) / 2;
    const alu = M.aluBronze;
    const grp = new THREE.Group(); grp.position.set(cx, o.y0, -0.12); G.world.root.add(grp);
    const mk = (g, m, x, y, z, parent = grp) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    mk(boxGeo(w + 0.06, 0.04, 0.12), alu, 0, 0.02, 0);
    mk(boxGeo(w + 0.06, 0.05, 0.12), alu, 0, h - 0.025, 0);
    mk(boxGeo(0.04, h, 0.12), alu, -w / 2 - 0.01, h / 2, 0);
    mk(boxGeo(0.04, h, 0.12), alu, w / 2 + 0.01, h / 2, 0);
    if (!o.door) mk(boxGeo(w + 0.12, 0.03, 0.2), M.trim, 0, -0.01, 0.1);   // the inside sill a cat sits on
    const pane = (x, z) => {
      const s = new THREE.Group(); s.position.set(x, 0, z); grp.add(s);
      const pw = w / 2 + 0.03;
      mk(boxGeo(pw, 0.05, 0.035), alu, 0, 0.06, 0, s); mk(boxGeo(pw, 0.05, 0.035), alu, 0, h - 0.07, 0, s);
      mk(boxGeo(0.045, h - 0.09, 0.035), alu, -pw / 2 + 0.022, h / 2, 0, s); mk(boxGeo(0.05, h - 0.09, 0.04), alu, pw / 2 - 0.022, h / 2, 0, s);
      if (o.door) mk(boxGeo(pw, 0.03, 0.03), alu, 0, 0.95, 0, s);
      const glass = mk(new THREE.PlaneGeometry(pw - 0.08, h - 0.16), M.glassTint, 0, h / 2, 0, s); glass.renderOrder = 5;
      const dirt = mk(new THREE.PlaneGeometry(pw - 0.08, h - 0.16), M.glassDirt, 0, h / 2, 0.003, s); dirt.renderOrder = 6;
      s.userData.glass = glass;
      return s;
    };
    const fixed = pane(w / 4, -0.025), moving = pane(-w / 4, 0.025);
    const lock = mk(boxGeo(0.02, 0.07, 0.025), M.chrome, -0.01, h / 2, 0.05, moving);
    lock.position.x = w / 4 + 0.01;
    const sw = new SashWindow({ sash: moving, max: w / 2 - 0.06, axis: 'x', dir: 1, noun: o.door ? 'balcony door' : 'window', onChange: (open) => emit('window', { key, open }), onMove: o.onMove });
    sw.frame = { group: grp, lower: moving, upper: fixed, width: w, height: h }; sw.key = key; sw.room = o.room || 'main';
    this.windows[key] = sw;
    return sw;
  }
  windowsBuild() {
    // the balcony door: the sliding pane is solid to the player and the cat
    const bd = this.slider('balcony', { x0: 3.95, x1: 5.55, y0: 0, y1: 2.15, door: true });
    const pw = 0.83, mover = G.physics.addMover({ type: 'box', size: [pw, 2.1, 0.05] });
    const q = new THREE.Quaternion();
    const sync = (snap) => { const p = bd.frame.lower.getWorldPosition(V()); p.y = 1.05; G.physics.setMoverTarget(mover, p, q, snap); };
    bd.o.onMove = () => sync(false);
    bd.frame.group.updateMatrixWorld(true); sync(true);
    G.physics.addStaticBox(5.15, 1.05, -0.12, 0.42, 1.05, 0.04);          // the fixed pane
    this.balconyDoorProxy = { get angle() { return bd.pos > 0.45 ? 1 : 0; }, locked: false };
    // the window over the soi: 14 floors down, so there is always a guard in it
    this.slider('window', { x0: 6.4, x1: 7.6, y0: 0.9, y1: 2.15 });
    G.physics.addStaticBox(7.0, 1.5, -0.2, 0.62, 0.7, 0.05);
    G.world.named.menuWindow = this.windows.window;
  }

  doorsAndFrames(b) {
    const frame = (axis, a0, a1, c, thick, h = 2.08, mat = M.trim) => {
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
    };
    frame('x', 5.25, 6.1, 7.0, 0.2, 2.1, M.teakDoor);
    frame('z', 5.95, 6.65, 6.56, 0.12);
    const mk = (key, o) => { const d = new Door({ knobMat: M.chrome, thick: 0.042, ...o }); this.doors[key] = d; d.key = key; return d; };
    mk('bath', { hinge: V(6.56, 0, 5.96), width: 0.68, height: 2.06, closedYaw: -Math.PI / 2, openDir: 1, maxAngle: 1.5, label: 'bathroom door', angle: 0.3, mat: M.pvcDoor, style: 'flush' });
    this.numberMat = labelMat(L.aptNumber('1407'));
    mk('front', { hinge: V(5.26, 0, 7.0), width: 0.83, height: 2.08, closedYaw: 0, openDir: 1, maxAngle: 1.65, label: 'front door', mat: M.teakDoor, style: 'six', thick: 0.05, number: true, numberMat: this.numberMat });
    // deadbolt, peephole and chain on the inside face
    const fd = this.doors.front;
    const bolt = new THREE.Mesh(boxGeo(0.05, 0.07, 0.02), M.chrome); bolt.position.set(0.76, 1.15, -0.035); fd.panel.add(bolt);
    const peep = new THREE.Mesh(cylGeo(0.012, 0.02, 8), M.chrome); peep.rotation.x = Math.PI / 2; peep.position.set(0.42, 1.55, -0.03); fd.panel.add(peep);
    const chain = new THREE.Mesh(boxGeo(0.12, 0.012, 0.01), M.chrome); chain.position.set(0.71, 1.3, -0.03); fd.panel.add(chain);
    // a sticker of a temple charm over the peephole, and a little yant cloth
    const yant = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), labelMat(L.poster('yant', (c, w, h) => {
      c.fillStyle = '#f4ecd0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8a1a12'; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#8a1a12'; c.font = `700 22px ${TH.TH}`; c.textAlign = 'center'; c.fillText('ยันต์', w / 2, 40);
      c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(w / 2, 100, 14 + i * 9, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      c.font = `500 12px ${TH.TH}`; c.fillText('อิติปิโส', w / 2, 150);
    })));
    yant.position.set(0.42, 1.78, -0.032); yant.rotation.y = Math.PI; fd.panel.add(yant);
    fd.tag(fd.panel);
  }

  // ------------------------------------------------------------- the bed corner
  sleeping(b) {
    // the bed, head to the west wall; the air-con above it; the painting
    this.bedInfo = TH.thaiBed(b, 4.55, 2.25, Math.PI / 2);
    this.drawerTop = TH.drawerTower(b, 3.72, 1.12, Math.PI / 2, 0xf0a8c0);
    this.alarmClock = this.makeAlarmClock(V(3.72, 0.62, 0.97));
    this.radio = TH.pinkRadio(3.74, 0.62, 1.2, Math.PI / 2);
    this.aircon = TH.airCon(3.64, 2.3, 2.25, Math.PI / 2);
    this.paintings.push(hangPainting(this.root, 'flame', { pos: V(3.52, 1.45, 2.25), ry: Math.PI / 2, height: 0.62, frame: 'gilt', fw: 0.07, fd: 0.05, roll: -0.01, age: 0.4,
      lines: ['Bought it off a man on the Silom footpath. Three hundred baht.', 'The flames moved. No they didn\'t.', 'It\'s warmer near it. Warmer than the air-con.'] }));
    this.wardrobe = F.wardrobe(b, 3.83, 3.75, Math.PI / 2);
    this.fan = TH.standFan(5.75, 0.55, -0.61);
    TH.mosquitoCoil(5.75, 3.2);
    this.catBedPos = V(5.0, 0.04, 4.35);
    TH.catBox(b, 5.0, 4.35, 0.3);
    this.catBed = this.catBedPos;
    this.bedPos = V(4.55, 0.48, 2.25);
  }

  // ------------------------------------------------------------- kitchenette
  kitchen(b) {
    // the fridge (pastel, a magnet from a gold shop), the steel shelf of bottles
    this.fridge = F.fridge(b, 7.97, 1.52, -Math.PI / 2);
    this.shelf = TH.liquorShelf(b, 8.12, 0.66, -Math.PI / 2);
    // counter: open under the gas end for the bottle, cupboards under the sink
    const run1 = F.baseCabinetRun(b, 8.02, 3.05, -Math.PI / 2, 2.2, { modules: [{ w: 0.7, type: 'gap' }, { w: 0.8, type: 'sink' }, { w: 0.7, type: 'drawers' }] });
    b.geo(roundedBox(0.63, 0.04, 0.7, 0.012), M.counter, { x: 8.01, y: 0.9, z: 2.3 });
    b.collider(8.01, 0.9, 2.3, 0.63, 0.04, 0.7);
    b.box(8.02, 0.45, 1.96, 0.6, 0.88, 0.02, M.cabinet);
    this.stove = TH.gasStove(b, 8.0, 0.92, 2.3, -Math.PI / 2);
    TH.lpgTank(b, 8.0, 2.3, V(8.1, 0.93, 2.3));
    const up = F.upperCabinets(b, 8.15, 3.4, -Math.PI / 2, 1.5, { n: 2 });
    this.cabinets = { run1, up };
    const tube = new THREE.Mesh(cylGeo(0.013, 0.9, 8), glowMat(0xffffff, 0xe8f4ff, 1.8)); tube.rotation.x = Math.PI / 2; tube.position.set(8.1, 1.43, 3.35); this.root.add(tube);
    this.lights.kitchen = new Fixture({ pos: V(7.95, 1.4, 3.3), intensity: 2.8, distance: 3.2, color: 0xeaf6ff, name: 'kitchen', room: 'main', bulbMats: [tube.material] });
    this.switches.kitchen = new Switch({ pos: V(8.31, 1.25, 4.38), ry: -Math.PI / 2, plateMat: M.trim, label: 'kitchen light', onToggle: (on) => this.lights.kitchen.set(on) });
    this.riceCooker = TH.riceCooker(8.02, 0.92, 3.62, -Math.PI / 2);
    this.coffee = TH.airpot(8.05, 0.92, 3.98, -Math.PI / 2);
    // the dish drainer on the wall over the sink, fish sauce, chilli vinegar, sugar
    b.geo(boxGeo(0.14, 0.26, 0.42), TH.pm('dishRack', 0xd8e0e8, { r: 0.4 }), { x: 8.24, y: 1.22, z: 3.05 });
    for (let i = 0; i < 5; i++) b.geo(cylGeo(0.1, 0.01, 14), TH.pm('melamine' + (i % 2), i % 2 ? 0xe8e0c8 : 0x8ac0a0, { r: 0.4 }), { x: 8.2, y: 1.27, z: 2.9 + i * 0.07, rx: Math.PI / 2 });
    for (const [x, z, col, h] of [[8.2, 4.08 + 0.03, 0x7a4a1a, 0.2], [8.25, 3.4, 0xd8a020, 0.16], [8.26, 3.47, 0x8a2a14, 0.15]]) b.geo(TH.rod(V(x, 0.92, z), V(x, 0.92 + h, z), 0.03, 0.025, 10), TH.pm('condiment' + col, col, { r: 0.2, transparent: true, opacity: 0.85 }), {});
    // cat bowls in the gap by the TV stand, the bin by the bathroom
    this.bowl = this.makeBowl(V(8.12, 0, 4.48), 'food');
    this.waterBowl = this.makeBowl(V(8.12, 0, 4.24), 'water');
    this.trash = this.makeTrashCan(V(6.3, 0, 5.15));
    // the calendar from the gold shop, by the fridge
    this.calendarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), labelMat(L.calendar(0)));
    this.calendarMesh.position.set(3.53, 1.5, 6.6); this.calendarMesh.rotation.y = Math.PI / 2;
    this.root.add(this.calendarMesh);
    this.sink = this.makeSink(run1.sinkPos);
  }

  // ------------------------------------------------------------- table, TV, ceiling
  living(b) {
    F.table(b, 6.3, 2.3, 0, 0.75, 0.75, 0.72, M.formicaBlue, { leg: 0.03 });
    this.tableTop = 0.72;
    // lunch from the market on the table: a durian, bananas, mangoes, Mae's pinto
    TH.voxelFruit(b, 6.42, 0.72, 2.18, 0.4);
    TH.voxelPinto(b, 6.12, 0.72, 2.45, 0.2);
    this.chairs = [TH.monobloc(6.32, 1.66, 0.12, 'white'), TH.monobloc(6.28, 2.96, Math.PI - 0.2, 'red')];
    TH.stool(b, 5.6, 3.95, 0x3f8a52, 0.42);
    // TV on a low cabinet against the bathroom wall, the turntable beside it
    F.tvStand(b, 7.15, 4.45, Math.PI);
    this.tvTop = 0.52;
    this.tvGroup = new THREE.Group(); this.tvGroup.position.set(6.92, this.tvTop, 4.42); this.tvGroup.rotation.y = Math.PI; this.tvGroup.scale.setScalar(0.85);
    this.root.add(this.tvGroup);
    this.tv = new CrtTV(this.tvGroup);
    G.world.named.tv = this.tv;
    b.collider(6.92, this.tvTop + 0.4, 4.42, 0.56, 0.5, 0.42);
    TH.turntable(b, 7.45, this.tvTop, 4.45, Math.PI);
    TH.records(b, 7.0, 0.2, 0, 6);
    // the tube in the middle of the ceiling: everything in Bangkok is lit like this
    const batten = new THREE.Mesh(roundedBox(1.25, 0.05, 0.1, 0.01), M.enamel); batten.position.set(5.6, 2.57, 2.6); this.root.add(batten);
    const tubeM = glowMat(0xffffff, 0xeaf4ff, 2.2);
    const tube = new THREE.Mesh(cylGeo(0.016, 1.2, 10), tubeM); tube.rotation.z = Math.PI / 2; tube.position.set(5.6, 2.52, 2.6); this.root.add(tube);
    this.lights.main = new Fixture({ pos: V(5.6, 2.45, 2.6), spot: true, angle: 1.35, penumbra: 1, intensity: 9, distance: 9, decay: 1.4, color: 0xeef6ff, fill: 0.4, bulbMats: [tubeM], shadow: true, shadowSize: 1024, name: 'main', room: 'main' });
    this.lights.main.hum = true;
    this.switches.main = new Switch({ pos: V(6.33, 1.25, 6.89), ry: Math.PI, plateMat: M.trim, label: 'lights', onToggle: (on) => this.lights.main.set(on) });
    // wall clock between the balcony door and the window
    this.clock = this.wallClock(V(5.97, 1.98, 0.02));
    // the family on the wall over the table; the paddy print by the door
    this.paintings.push(hangPainting(this.root, 'family', { pos: V(8.32, 1.84, 0.66), ry: -Math.PI / 2, height: 0.42, frame: 'walnut', fw: 0.04, fd: 0.03, roll: 0.01, age: 0.7,
      lines: ['Korat, 1988. Mae, Phor, Nong Ton, me.', 'Their faces. Somebody rubbed their faces off.', 'It was fine yesterday. It is always yesterday.'] }));
    this.paintings.push(hangPainting(this.root, 'paddy', { pos: V(6.5, 1.62, 5.2), ry: -Math.PI / 2, height: 0.36, frame: 'gilt', fw: 0.035, fd: 0.025, roll: -0.006, age: 0.6,
      lines: ['The farmer in the picture has no face either.', 'The buffalo is looking at me.'] }));
  }

  // ------------------------------------------------------------- work
  desk(b) {
    const d = F.desk(b, 3.88, 5.65, Math.PI / 2);
    this.deskDrawers = d.drawers;
    this.deskChair = V(4.55, 0, 5.65);
    this.chairs.push(TH.monobloc(4.6, 5.65, -Math.PI / 2, 'blue'));
    this.deskTop = 0.74;
    // corkboard with pager numbers and a lottery ticket; the Buddha shelf above
    b.box(3.535, 1.42, 5.65, 0.02, 0.5, 0.8, M.cardboard, { collide: false });
    TH.hingPhra(b, 3.52, 2.05, 5.65, Math.PI / 2);
    this.lights.desk = F.tableLamp(V(3.75, 0.74, 6.15), { name: 'desk', room: 'main', intensity: 2.6, distance: 3.5 });
    R.deskLamp(this.lights.desk, V(3.74, 0.74, 6.18), Math.PI / 2 + 0.5);
    const noteCol = [0xf6ec8a, 0xf0b0c8, 0xa8e0f0];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshStandardMaterial({ color: noteCol[i % 3], roughness: 1 }));
      m.position.set(3.548, 1.3 + (i % 2) * 0.2 + Math.random() * 0.04, 5.38 + Math.floor(i / 2) * 0.25 + Math.random() * 0.05);
      m.rotation.y = Math.PI / 2; m.rotation.z = (Math.random() - 0.5) * 0.3;
      this.root.add(m);
    }
    const lotto = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), labelMat(L.poster('lotto', (c, w, h) => {
      c.fillStyle = '#e8f0f8'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a3a8a'; c.font = `700 18px ${TH.TH}`; c.textAlign = 'center';
      c.fillText('สลากกินแบ่งรัฐบาล', w / 2, 30); c.font = '900 34px Arial'; c.fillStyle = '#a01818'; c.fillText('140702', w / 2, 80);
      c.font = `500 14px ${TH.TH}`; c.fillStyle = '#1a3a8a'; c.fillText('งวดวันที่ ๑ กรกฎาคม ๒๕๔๐  ราคา ๔๐ บาท', w / 2, 120);
    })));
    lotto.position.set(3.548, 1.52, 5.9); lotto.rotation.y = Math.PI / 2; lotto.rotation.z = 0.05; this.root.add(lotto);
    this.deskOrigin = V(3.88, 0.74, 5.65);
  }

  // ------------------------------------------------------------- bathroom
  bathroom(b) {
    F.toilet(b, 8.02, 5.3, -Math.PI / 2);
    // the bum gun on its hook
    b.geo(TH.rod(V(8.31, 0.6, 5.65), V(8.25, 0.62, 5.65), 0.015), M.chrome, {});
    b.geo(roundedBox(0.05, 0.12, 0.04, 0.012), TH.pm('bumGun', 0xf0f0f0, { r: 0.4 }), { x: 8.24, y: 0.62, z: 5.68 });
    const sink = F.pedestalSink(b, 7.05, 5.06, 0);
    this.bathSink = this.makeSink(sink.basin, true);
    this.mirrorSpot = { pos: V(7.05, 1.52, 4.83), w: 0.44, h: 0.58, ry: 0 };
    b.box(7.05, 1.52, 4.828, 0.52, 0.66, 0.012, TH.pm('mirrorFramePink', 0xe8a0b8, { r: 0.5 }), { collide: false });
    b.box(7.05, 1.17, 4.89, 0.46, 0.02, 0.12, M.porcelain, { collide: false });
    // the shower corner: a tank of water, a scoop floating in it, a shower head
    b.geo(new THREE.CylinderGeometry(0.28, 0.25, 0.6, 18, 1, true), TH.pm('tankBlue', 0x2a7ab8, { r: 0.45, side: THREE.DoubleSide }), { x: 7.95, y: 0.3, z: 6.55 });
    b.geo(cylGeo(0.26, 0.01, 18), TH.pm('tankWater', 0x5aa0c8, { r: 0.05, transparent: true, opacity: 0.7 }), { x: 7.95, y: 0.52, z: 6.55 });
    b.geo(cylGeo(0.25, 0.02, 18), TH.pm('tankBlue', 0x2a7ab8), { x: 7.95, y: 0.01, z: 6.55 });
    b.collider(7.95, 0.3, 6.55, 0.56, 0.6, 0.56);
    b.geo(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), TH.pm('khan', 0xd8a020, { r: 0.4, side: THREE.DoubleSide }), { x: 7.9, y: 0.6, z: 6.5 });
    b.geo(TH.rod(V(8.3, 1.95, 6.25), V(8.18, 1.98, 6.25), 0.012), M.chrome, {});
    b.geo(cylGeo(0.05, 0.03, 12), M.chrome, { x: 8.16, y: 1.95, z: 6.25, rz: 0.6 });
    b.geo(TH.rod(V(7.32, 1.98, 5.95), V(8.32, 1.98, 5.95), 0.01), M.chrome, {});
    TH.stool(b, 7.6, 6.6, 0x3a8ad8, 0.22);
    b.geo(cylGeo(0.05, 0.005, 12), M.steel, { x: 7.55, y: 0.003, z: 6.2 });
    // shampoo, a plastic basin, a towel on a hook
    for (const [x, col] of [[8.25, 0xd84a8a], [8.25, 0x2aa8d8]]) b.geo(roundedBox(0.06, 0.18, 0.04, 0.015), TH.pm('shampoo' + col, col, { r: 0.4 }), { x, y: 1.25, z: x === 8.25 && col === 0xd84a8a ? 6.0 : 6.08 });
    b.box(8.27, 1.15, 6.04, 0.08, 0.02, 0.2, M.porcelain, { collide: false });
    b.geo(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 16, 1, true), TH.pm('kalamang', 0xe8c040, { r: 0.5, side: THREE.DoubleSide }), { x: 7.15, y: 0.06, z: 6.6 });
    b.geo(roundedBox(0.05, 0.6, 0.35, 0.02), M.towel, { x: 6.67, y: 1.3, z: 5.45 });
    this.lights.bath = F.bareBulb(V(7.47, 2.45, 5.85), { name: 'bath', room: 'bath', intensity: 4.5, distance: 4.5, cord: 0.1, on: false, shadow: false });
    this.switches.bath = new Switch({ pos: V(6.49, 1.25, 5.75), ry: -Math.PI / 2, plateMat: M.trim, label: 'bathroom light', on: false, onToggle: (on) => this.lights.bath.set(on) });
    // the breaker box by the door
    const box = new THREE.Mesh(boxGeo(0.32, 0.42, 0.09), M.radiator); box.position.set(4.75, 1.75, 6.85); this.root.add(box);
    this.breaker = new Button(box, { name: 'breaker', label: () => (G.world.power ? 'Flip the main breaker off' : 'Flip the main breaker on'), onUse: () => { G.world.power = !G.world.power; sfx('breaker', { pos: box.position, vol: 0.9 }); emit('power', G.world.power); } });
  }

  // ------------------------------------------------------------- the rest of a life
  clutter(b) {
    // boxes between the wardrobe and the desk, the drinking water, a helmet
    b.geo(boxGeo(0.45, 0.32, 0.4), M.cardboard, { x: 3.8, y: 0.16, z: 4.7, ry: 0.05 });
    b.geo(boxGeo(0.4, 0.28, 0.36), M.cardboard, { x: 3.8, y: 0.46, z: 4.68, ry: -0.08 });
    b.collider(3.8, 0.3, 4.7, 0.45, 0.6, 0.4);
    for (let i = 0; i < 6; i++) b.geo(TH.rod(V(4.18 + (i % 3) * 0.09, 0, 4.55 + Math.floor(i / 3) * 0.09), V(4.18 + (i % 3) * 0.09, 0.32, 4.55 + Math.floor(i / 3) * 0.09), 0.042, 0.04, 10), TH.pm('pet', 0xc8e0f0, { r: 0.1, transparent: true, opacity: 0.6 }), {});
    b.geo(boxGeo(0.29, 0.02, 0.2), TH.pm('shrink', 0xe0f0f8, { r: 0.2, transparent: true, opacity: 0.5 }), { x: 4.27, y: 0.33, z: 4.6 });
    b.collider(4.27, 0.16, 4.6, 0.3, 0.33, 0.2);
    TH.helmet(b, 5.0, 0.12, 6.7, 0xd84a3a);
    TH.flipflops(b, 4.75, 6.4, 0.2, 0x2a6ac8);
    TH.flipflops(b, 6.35, 6.0, -1.2, 0xd84a8a);
    TH.paperStack(b, 5.62, 3.4, 0.4, 10);
    TH.plasticBag(b, 6.4, 0, 5.55, 0xf0f0f0, 0.9);
    TH.plasticBag(b, 8.25, 1.15, 4.42 - 0.1, 0xe87aa0, 0.6);
  }

  // ------------------------------------------------------------- helpers
  wallClock(pos) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshStandardMaterial({ map: T.printed('clockfaceTH', 96, 96, (c, w, h) => {
      c.fillStyle = '#f6f0dc'; c.beginPath(); c.arc(48, 48, 47, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a2a2a'; c.font = `700 11px ${TH.TH}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const n = ['๑๒', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙', '๑๐', '๑๑'];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillText(n[i], 48 + Math.sin(a) * 36, 48 - Math.cos(a) * 36); }
      c.fillStyle = '#b01818'; c.font = `600 8px ${TH.TH}`; c.fillText('ห้างทองเยาวราช', 48, 66);
    }), roughness: 0.4 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.016, 6, 24), TH.pm('clockRim', 0xd84a8a, { r: 0.45 }));
    const hh = new THREE.Mesh(boxGeo(0.012, 0.085, 0.004), M.black); hh.geometry.translate(0, 0.04, 0);
    const mh = new THREE.Mesh(boxGeo(0.008, 0.12, 0.004), M.black); mh.geometry.translate(0, 0.055, 0);
    const sh = new THREE.Mesh(boxGeo(0.003, 0.13, 0.003), new THREE.MeshStandardMaterial({ color: 0xa01010 })); sh.geometry.translate(0, 0.055, 0);
    hh.position.z = 0.006; mh.position.z = 0.009; sh.position.z = 0.012;
    g.add(face, rim, hh, mh, sh);
    g.position.copy(pos);
    this.root.add(g);
    return { g, hh, mh, sh };
  }

  makeAlarmClock(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(0.16, 0.075, 0.085, 0.012), TH.pm('alarmBody', 0x2a2a30, { r: 0.4 }));
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 24;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.04), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(0, 0, 0.0435);
    g.add(body, screen);
    g.position.copy(pos).add(V(0, 0.038, 0)); g.rotation.y = Math.PI / 2 + 0.25;
    this.root.add(g);
    const clock = { g, cv, tex, last: '', glow: new THREE.PointLight(0xff2010, 0.15, 0.8, 2) };
    clock.glow.position.copy(pos).add(V(0.12, 0.08, 0.02));
    this.root.add(clock.glow);
    clock.draw = (str, blink) => {
      if (str === clock.last) return; clock.last = str;
      const c = cv.getContext('2d'); c.fillStyle = '#100404'; c.fillRect(0, 0, 64, 24);
      c.fillStyle = blink ? '#5a0a06' : '#ff2a14'; c.font = 'bold 20px "Courier New", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(str, 32, 13); tex.needsUpdate = true;
    };
    new Button(g, { name: 'alarm', label: () => (G.director && G.director.alarmRinging ? 'Stop alarm' : null), onUse: () => G.director && G.director.stopAlarm() });
    return clock;
  }

  makeSink(pos, bath = false) {
    const g = new THREE.Group();
    g.position.copy(pos).add(V(bath ? 0 : 0.16, bath ? 0.12 : 0.18, bath ? -0.12 : 0));
    const handle = new THREE.Mesh(boxGeo(bath ? 0.1 : 0.14, 0.06, bath ? 0.08 : 0.08), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(handle);
    if (!bath) {
      const neck = new THREE.Mesh(cylGeo(0.012, 0.28, 8), M.chrome); neck.position.set(0, 0.04, 0); g.add(neck);
      const spout = new THREE.Mesh(cylGeo(0.01, 0.16, 8), M.chrome); spout.rotation.x = Math.PI / 2; spout.position.set(0, 0.17, -0.08); g.add(spout);
      const lever = new THREE.Mesh(boxGeo(0.016, 0.012, 0.07), M.chrome); lever.position.set(0.05, 0.0, 0.02); g.add(lever);
      g.position.copy(pos).add(V(0.2, 0.0, 0));
    }
    this.root.add(g);
    const streamMat = new THREE.MeshStandardMaterial({ color: 0xbcd8e8, transparent: true, opacity: 0.55, roughness: 0.05, envMapIntensity: 2, emissive: 0x223344 });
    streamMat.userData.keepGloss = true;
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, bath ? 0.12 : 0.22, 6, 4, true), streamMat);
    const sp = bath ? pos.clone().add(V(0, 0.07, -0.08)) : pos.clone().add(V(0, 0.08, 0));
    stream.position.copy(sp); stream.visible = false;
    this.root.add(stream);
    const s = new Button(g, {
      name: 'sink',
      label: () => (s.running ? 'Turn off tap' : 'Turn on tap'),
      onUse: () => { s.running = !s.running; stream.visible = s.running; sfx('tapSqueak', { pos, vol: 0.5 }); if (s.running) s.loop = G.audio && G.audio.loop('water', { pos, vol: 0.5 }); else if (s.loop) { s.loop.stop(0.3); s.loop = null; } },
      update: () => { if (s.running) { stream.scale.x = 1 + Math.sin(G.time * 40) * 0.08; stream.material.opacity = 0.45 + Math.random() * 0.15; } },
    });
    s.isSink = true; s.running = false; s.stream = stream; s.bath = bath;
    const origActions = s.actions.bind(s);
    s.actions = () => { const a = origActions(); if (s.running && !G.player?.inv?.hand) a.push({ key: 'F', label: 'Drink from the tap' }); return a; };
    s.useF = () => (s.running ? { anim: 'drinkTap', dur: 2.4, sound: 'gulp', target: sp, at: [[1.6, () => G.player.hunger.drink(0.05, { tap: true })]] } : null);
    return s;
  }

  makeBowl(pos, kind) {
    const g = new THREE.Group(); g.position.copy(pos);
    const col = kind === 'food' ? 0xe86a8a : 0x3a8ad8;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.05, 16, 1, true), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, side: THREE.DoubleSide }));
    bowl.position.y = 0.025;
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), bowl.material); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.003;
    const content = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), new THREE.MeshStandardMaterial({ color: kind === 'food' ? 0x7a4a24 : 0x8ab0c8, roughness: kind === 'food' ? 0.9 : 0.05, transparent: kind !== 'food', opacity: 0.7, envMapIntensity: 2 }));
    content.rotation.x = -Math.PI / 2; content.visible = false;
    g.add(bowl, bot, content);
    const kib = new THREE.Group();
    if (kind === 'food') { for (let i = 0; i < 26; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), content.material); const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.06; k.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); kib.add(k); } }
    g.add(kib);
    this.root.add(g);
    G.physics.addStaticCyl(pos.x, pos.y + 0.025, pos.z, 0.085, 0.05);
    const bw = new Button(g, { name: 'bowl', label: () => null, onUse: () => {} });
    bw.isBowl = kind === 'food'; bw.isWaterBowl = kind === 'water';
    bw.level = kind === 'water' ? 0.8 : 0; bw.kind = kind;
    bw.pos = pos;
    bw.pourPoint = () => pos.clone().add(V(0, 0.3, 0));
    bw.startPour = () => { if (G.particles) G.particles.kibble(pos.clone().add(V(0, 0.32, 0)), pos.clone().add(V(0, 0.03, 0))); };
    bw.fill = (v) => { bw.level = clamp(v, 0, 1); bw.refresh(); };
    bw.refresh = () => { content.visible = bw.level > 0.02; content.position.y = 0.006 + 0.03 * bw.level; kib.visible = kind === 'food' && bw.level > 0.02; kib.position.y = content.position.y + 0.004; kib.scale.setScalar(0.6 + 0.4 * bw.level); };
    bw.refresh();
    return bw;
  }

  makeTrashCan(pos) {
    const g = new THREE.Group(); g.position.copy(pos);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.46, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.45, side: THREE.DoubleSide }));
    can.position.y = 0.23;
    const lid = new THREE.Mesh(cylGeo(0.165, 0.025, 14), can.material); lid.position.y = 0.47; lid.rotation.z = 0.6; lid.position.x = -0.1;
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xe86a9a, roughness: 0.25 }));
    bag.position.y = 0.3;
    g.add(can, lid, bag);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.root.add(g);
    G.physics.addStaticCyl(pos.x, 0.25, pos.z, 0.16, 0.5);
    const t = new Button(g, {
      name: 'trash',
      label: () => {
        const h = G.player?.inv?.hand;
        if (h && h.type !== 'trashBag') return 'Throw away ' + h.label.toLowerCase();
        if (t.full && !h) return 'Take out the rubbish bag';
        return null;
      },
      onUse: () => {
        const h = G.player.inv.hand;
        if (h && h.type !== 'trashBag') { sfx('trashLid', { pos, vol: 0.6 }); emit('thrownAway', h); G.player.inv.consumeHand(true); t.count++; return; }
        if (t.full && !h) {
          t.full = false; bag.visible = false; sfx('bagRustle', { pos, vol: 0.8 });
          const tb = spawn('trashBag', pos.x, 0.6, pos.z, { sleeping: false });
          G.player.inv.forceHand(tb);
          emit('trashTaken');
        }
      },
    });
    t.full = true; t.count = 0; t.bag = bag; t.pos = pos;
    t.setFull = (v) => { t.full = v; bag.visible = v; };
    return t;
  }

  zones() {
    const w = G.world;
    w.addZone({ name: 'main', ...APT.main, surface: 'tile', reverb: 'room', apt: true });
    w.addZone({ name: 'bath', ...APT.bath, x0: 6.5, surface: 'tile', reverb: 'bath', apt: true });
    w.addZone({ name: 'balcony', ...APT.balcony, z1: -0.12, y0: -1, surface: 'tile', reverb: 'outside', apt: true, outside: true });
  }

  spawnItems() {
    const it = (t, x, y, z, o) => { const i = spawn(t, x, y, z, o); this.items.push(i); return i; };
    const fr = this.fridge;
    // fridge (door faces -x; interior x ~ 7.65..8.25)
    const fx = 7.95;
    it('eggs', fx, fr.shelves[1] + 0.035, 1.32, { ry: Math.PI / 2 });
    it('milk', fx + 0.08, fr.shelves[2] + 0.12, 1.65, {});
    it('juice', fx + 0.06, fr.shelves[2] + 0.11, 1.3, {});
    it('cheese', fx - 0.05, fr.shelves[0] + 0.03, 1.55, {});
    it('apple', fx - 0.04, fr.shelves[0] + 0.04, 1.3, {});
    it('apple', fx + 0.06, fr.shelves[0] + 0.04, 1.36, {});
    it('pizza', fx, fr.shelves[2] + 0.03, 1.48, { ry: 0.1 });
    it('takeout', fx + 0.02, fr.shelves[1] + 0.05, 1.68, {});
    it('cola', fx - 0.06, fr.shelves[1] + 0.07, 1.5, {});
    // the counter: mugs by the airpot, bread, a glass
    it('mug', 7.85, 0.97, 3.82, { ry: 2 });
    it('mug', 6.5, this.tableTop + 0.05, 2.62, { ry: 0.4 });
    it('bread', 7.95, 1.82, 1.62, { ry: 0.2 });
    it('glass', 6.05, this.tableTop + 0.06, 2.12, {});
    // the pan on the front gas ring, a kettle on the other
    const bn = this.stove.burners;
    this.pan = it('pan', bn[0].center.x, bn[0].center.y + 0.03, bn[0].center.z, { ry: Math.PI });
    if (has('kettle')) it('kettle', bn[1].center.x, bn[1].center.y + 0.16, bn[1].center.z, { ry: Math.PI / 2 });
    // under the sink: cat food; drawers: crackers
    const c1 = this.cabinets.run1.interiors[0];
    if (c1) {
      this.catBox = it('catBox', c1.center.x - 0.02, 0.1 + 0.13, c1.center.z - 0.12, { ry: Math.PI / 2 });
      it('catCan', c1.center.x, 0.12, c1.center.z + 0.15, {});
      it('soup', c1.center.x, c1.shelfY + 0.08, c1.center.z - 0.15, {});
      it('beans', c1.center.x, c1.shelfY + 0.08, c1.center.z, {});
    }
    const s0 = this.cabinets.up.shelves[0];
    if (s0) {
      it('cereal', s0.center.x - 0.02, s0.y + 0.14, s0.center.z, { ry: Math.PI / 2 });
      it('pb', s0.center.x, s0.y2 + 0.07, s0.center.z - 0.1, {});
    }
    const s1 = this.cabinets.up.shelves[1];
    if (s1) { it('mug', s1.center.x, s1.y + 0.05, s1.center.z + 0.1, {}); it('glass', s1.center.x, s1.y + 0.06, s1.center.z - 0.1, {}); it('crackers', s1.center.x, s1.y2 + 0.11, s1.center.z, { ry: Math.PI / 2 }); }
    // the bed, the table, the floor
    it('remote', 5.1, 0.62, 2.0, { ry: 0.3 });
    it('book', 4.0, 0.6, 2.65, { ry: 1.2, rz: Math.PI / 2 });
    it('catToy', 5.4, 0.03, 3.6, {});
    it('flashlight', 7.92, 1.79, 1.32, { ry: 0.3 });
    it('candy', 6.55, this.tableTop + 0.02, 2.4, { ry: 0.6 });
    const m = (model, t, x, y, z, o = {}) => has(model) && it(t, x, y, z, o);
    const tt = this.tableTop + 0.005;
    m('bottles', 'wine', 6.42, tt + 0.155, 2.5, {});
    m('cleaner', 'cleaner', 8.2, 0.165, 4.95, { ry: -Math.PI / 2 });
    m('bleach', 'bleach', 6.75, 0.16, 6.75, {});
    m('photoFrame', 'photo', 7.98, 1.76 + 0.13, 1.88, { ry: -Math.PI / 2 + 0.3 });
    m('box', 'cardboard', 5.05, 0.18, 6.55 - 0.1, { ry: 0.1 });
    m('basket', 'basket', 3.85, 1.95 + 0.13, 3.75, {});
    m('dustpan', 'dustpan', 6.3, 0.06, 6.62, { ry: 0.6 });
    m('plant', 'plantPot', 5.75, 0.0 + 0.14, -1.25, {});
  }

  // the loop: every morning the room is exactly as it was on 2 July.
  // (Only what is written on you, and in the cat, carries over.)
  captureInitial() {
    this.init = {
      doors: Object.fromEntries(Object.entries(this.doors).map(([k, d]) => [k, d.angle])),
      switches: Object.fromEntries(Object.entries(this.switches).map(([k, sw]) => [k, sw.on])),
      lights: Object.fromEntries(Object.entries(this.lights).map(([k, l]) => [k, l.on])),
    };
  }
  resetDay() {
    const keep = new Set(G.building ? G.building.food1408 || [] : []);
    const inv = G.player && G.player.inv;
    if (inv) { inv.hand = null; inv.slots = [null, null]; G.hud.showInventory && G.hud.showInventory(inv); }
    for (const i of [...G.world.items]) if (!keep.has(i)) i.destroy();
    this.items = [];
    this.spawnItems();
    for (const [k, a] of Object.entries(this.init.doors)) this.doors[k].setAngle(a);
    for (const [k, v] of Object.entries(this.init.switches)) this.switches[k].set(v, true);
    for (const [k, v] of Object.entries(this.init.lights)) this.lights[k].set(v);
    for (const w of Object.values(this.windows)) { w.pos = 0; w.vel = 0; w.target = null; w.sash.position.copy(w.base); w.o.onMove && w.o.onMove(0, w); }
    for (const sk of [this.sink, this.bathSink]) if (sk.running) sk.o.onUse();
    settlePaintings(this.paintings, G.story.day);
    Seat.release(); Pushable.resetAll();
    if (this.radio) this.radio.off();
    if (this.fan) this.fan.off();
    if (this.aircon) this.aircon.off();
    if (this.coffee.stop) this.coffee.stop();
    this.coffee.mug = null;
    this.riceCooker.reset();
    this.bowl.fill(0); this.waterBowl.fill(0.8);
    this.trash.setFull(true); this.trash.count = 0;
    this.stove.knobs.forEach((kb, i) => { if (this.stove.burners[i].on) kb.o.onUse(); });
    if (this.tv && this.tv.on) this.tv.toggle();
    G.world.power = true;
  }

  setCalendar(day) {
    this.calendarMesh.material.map = L.calendar(day - 1);
    this.calendarMesh.material.needsUpdate = true;
  }

  update(dt) {
    this.tv && this.tv.update(dt);
    if (G.director) {
      const t = G.director.clockMinutes();
      const h = (t / 60) % 12, mm = t % 60;
      this.clock.hh.rotation.z = -h / 12 * Math.PI * 2;
      this.clock.mh.rotation.z = -mm / 60 * Math.PI * 2;
      this.clock.sh.rotation.z = -(G.time % 60) / 60 * Math.PI * 2;
      const hr = Math.floor(t / 60) % 24, mn = Math.floor(t % 60);
      const glitch = G.director.alarmGlitch;
      // Thai clocks run on 24 hours
      this.alarmClock.draw(glitch ? glitch : `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`, G.director.alarmRinging && Math.floor(G.time * 2) % 2 === 0);
    }
    for (const bu of this.stove.burners) {
      bu.heat = damp(bu.heat, bu.on && G.world.power !== false ? 1 : 0, 2, dt);
      bu.flameMat.opacity = bu.on ? 0.55 + Math.random() * 0.35 : 0;
      bu.flame.scale.setScalar(bu.on ? 0.9 + Math.random() * 0.2 : 1);
    }
    const pan = this.pan;
    if (pan && !pan.dead && !pan.prop.held) {
      let heat = 0;
      for (const bu of this.stove.burners) if (bu.heat > 0.3 && pan.mesh.position.distanceTo(bu.center) < 0.12) heat = bu.heat;
      if (heat > 0.3 && pan.eggs > 0 && pan.cook < 1) {
        pan.cook = Math.min(1, pan.cook + dt / 12 * heat);
        if (pan.eggMeshes) for (const w of pan.eggMeshes) { w.material.opacity = 0.55 + 0.45 * pan.cook; }
        if (!pan.sizzle) pan.sizzle = G.audio && G.audio.loop('sizzle', { pos: pan.mesh.position, vol: 0.5 });
        if (Math.random() < dt * 5 && G.particles) G.particles.steam(pan.mesh.position.clone().add(V(0, 0.05, 0)));
        if (pan.cook >= 1) { emit('eggsCooked'); G.hud && G.hud.inner('Kai dao. The edges went crispy, the way Mae makes it.'); }
      } else if (pan.sizzle && (heat < 0.3 || pan.eggs === 0)) { pan.sizzle.stop(0.5); pan.sizzle = null; }
      if (heat > 0.5 && pan.eggs > 0 && pan.cook >= 1) { pan.burnt = (pan.burnt || 0) + dt; if (pan.burnt > 25 && pan.eggMeshes) for (const w of pan.eggMeshes) w.material.color.setHex(0x3a2a1a); }
    }
  }
}
