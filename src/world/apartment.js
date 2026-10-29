// Apartment 4B. Coordinates in metres; north exterior wall at z=0 (windows,
// city view), front door on the south wall (z=7.6) into the building hallway.
//
//  x: 0 ......... 3.4 | 3.52 .................................. 10.2
//  z=0   BEDROOM      |  LIVING (TV, couch)  windows   KITCHEN (fridge,
//  z=3.6 ------------ |                                 counters, stove)
//  z=3.72 BATHROOM    |  DESK                      table   bowls / trash
//  z=6.32 CLOSET      |                  [front door]
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Builder } from './builder.js';
import * as F from './furniture.js';
import { Door, Switch, Button, SashWindow, Interactable } from './interactables.js';
import { Fixture, glowMat } from './lights.js';
import { L, labelMat } from './labels.js';
import { spawn } from './items.js';
import { CrtTV } from './tv.js';
import { hangPainting, settlePaintings } from './paintings.js';
import * as R from './furnish.js';
import { has, prop } from './props.js';
import { Seat, Pushable } from './seats.js';
import { dress } from './dressing.js';
import { boxGeo, cylGeo, roundedBox } from '../gfx/geo.js';
import { clamp, damp, rand } from '../core/util.js';
import * as T from '../gfx/textures.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const APT = {
  main: { x0: 3.52, z0: 0, x1: 10.2, z1: 7.6, h: 2.7 },
  bed: { x0: 0, z0: 0, x1: 3.4, z1: 3.6, h: 2.7 },
  bath: { x0: 0, z0: 3.72, x1: 3.4, z1: 6.2, h: 2.7 },
  closet: { x0: 0, z0: 6.32, x1: 3.4, z1: 7.6, h: 2.7 },
  frontDoor: { x0: 7.2, x1: 8.1, z: 7.75 },
};

export class Apartment {
  constructor() {
    this.root = new THREE.Group(); this.root.name = 'apartment';
    G.world.root.add(this.root);
    this.doors = {}; this.lights = {}; this.switches = {}; this.windows = {};
    this.items = [];
  }

  build() {
    const b = new Builder(this.root);
    this.b = b;
    M.cabinetDoor = std('cabinetDoor', T.cabinetDoor({ seed: 18, base: [172, 150, 116] }), { roughness: 0.55 });
    M.fridgeNote = labelMat(L.fridgeNote());
    this.shell(b);
    this.livingRoom(b);
    this.kitchen(b);
    this.desk(b);
    this.bedroom(b);
    this.bathroom(b);
    this.closet(b);
    this.doorsAndFrames(b);
    dress(this, b);
    this.statics = b.build('apt');
    G.world.addOccluders(this.statics);
    this.zones();
    this.spawnItems();
    this.captureInitial();
    return this;
  }

  shell(b) {
    const ext = 0.3, int = 0.12;
    // main room: two floor regions (wood + kitchen lino)
    const mr = APT.main;
    b.floor({ x0: mr.x0, z0: mr.z0, x1: 8.9, z1: mr.z1 }, M.woodFloor);
    // the kitchen strip needs its own collider: the main one stops at x 9.05,
    // and anyone stepping up to the counters used to drop through the floor
    b.floor({ x0: 8.9, z0: mr.z0, x1: mr.x1, z1: 4.85 }, M.kitchenFloor);
    b.floor({ x0: 8.9, z0: 4.85, x1: mr.x1, z1: mr.z1 }, M.woodFloor);
    b.box(8.9, 0.003, 2.42, 0.03, 0.006, 4.85, M.chrome, { collide: false });
    b.ceiling(mr, M.ceiling);
    const W = (a, bb, y0 = 0.85, y1 = 2.2) => ({ a, b: bb, y0, y1, kind: 'open' });
    const D = (a, bb, y1 = 2.08) => ({ a, b: bb, y0: 0, y1, kind: 'door' });
    b.wallSide(mr, 'n', M.wallLiving, [W(4.7, 5.9), W(7.1, 8.3)], { thick: ext, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(mr, 's', M.wallLiving, [D(7.2, 8.1, 2.1)], { thick: ext, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(mr, 'w', M.wallLiving, [D(2.55, 3.4), D(3.9, 4.7), D(6.55, 7.3)], { thick: int, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(mr, 'e', M.wallKitchen, [], { thick: int, baseMat: M.trim, crownMat: M.trim });

    const br = APT.bed;
    b.floor(br, M.woodFloorOld); b.ceiling(br, M.ceiling);
    b.wallSide(br, 'n', M.wallBedroom, [W(1.1, 2.3)], { thick: ext, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(br, 's', M.wallBedroom, [], { thick: int, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(br, 'w', M.wallBedroom, [], { thick: int, baseMat: M.trim, crownMat: M.trim });
    b.wallSide(br, 'e', M.wallBedroom, [D(2.55, 3.4)], { thick: int, baseMat: M.trim, crownMat: M.trim });

    const ba = APT.bath;
    b.floor(ba, M.bathFloor); b.ceiling(ba, M.ceiling);
    for (const s of ['n', 's', 'w']) b.wallSide(ba, s, M.bathTiles, [], { thick: int, baseMat: null });
    b.wallSide(ba, 'e', M.bathTiles, [D(3.9, 4.7)], { thick: int });

    const cl = APT.closet;
    b.floor(cl, M.concrete); b.ceiling(cl, M.ceiling);
    for (const s of ['n', 's', 'w']) b.wallSide(cl, s, M.wallEmpty, [], { thick: int, baseMat: M.trim });
    b.wallSide(cl, 'e', M.wallEmpty, [D(6.55, 7.3)], { thick: int, baseMat: M.trim });
    // window sill exteriors / glass are built in windows()
    this.windowsBuild();
  }

  windowsBuild() {
    const mk = (key, x0, x1, z, room) => {
      const w = F.window4(this.b, { x: (x0 + x1) / 2, z: z - 0.12, w: x1 - x0, y0: 0.85, y1: 2.2, ry: 0 });
      const sw = new SashWindow({
        sash: w.lower, max: 0.6,
        onChange: (open) => emit('window', { key, open }),
      });
      sw.frame = w; sw.key = key; sw.room = room;
      // invisible safety collider in the opening (4th floor)
      G.physics.addStaticBox((x0 + x1) / 2, 1.5, z - 0.2, (x1 - x0) / 2, 0.7, 0.05);
      this.windows[key] = sw;
      return sw;
    };
    mk('living1', 4.7, 5.9, 0, 'main');
    mk('menu', 7.1, 8.3, 0, 'main');
    mk('bedroom', 1.1, 2.3, 0, 'bed');
    // the menu window is the one the game opens on; keep a handle
    G.world.named.menuWindow = this.windows.menu;
  }

  doorsAndFrames(b) {
    const knob = M.chrome;
    const mkFrame = (axis, a0, a1, c, thick, h = 2.08) => {
      // jambs + head + casing on both faces
      const w = a1 - a0, cas = 0.07;
      if (axis === 'z') {
        b.box(c, h / 2, a0 - 0.012, thick + 0.02, h, 0.024, M.trim, { collide: false });
        b.box(c, h / 2, a1 + 0.012, thick + 0.02, h, 0.024, M.trim, { collide: false });
        b.box(c, h + 0.012, (a0 + a1) / 2, thick + 0.02, 0.024, w + 0.048, M.trim, { collide: false });
        for (const s of [-1, 1]) {
          const x = c + s * (thick / 2 + 0.01);
          b.box(x, h / 2 + 0.02, a0 - cas / 2, 0.02, h + 0.04, cas, M.trim, { collide: false });
          b.box(x, h / 2 + 0.02, a1 + cas / 2, 0.02, h + 0.04, cas, M.trim, { collide: false });
          b.box(x, h + cas / 2 + 0.02, (a0 + a1) / 2, 0.02, cas, w + cas * 2, M.trim, { collide: false });
        }
      } else {
        b.box(a0 - 0.012, h / 2, c, 0.024, h, thick + 0.02, M.trim, { collide: false });
        b.box(a1 + 0.012, h / 2, c, 0.024, h, thick + 0.02, M.trim, { collide: false });
        b.box((a0 + a1) / 2, h + 0.012, c, w + 0.048, 0.024, thick + 0.02, M.trim, { collide: false });
        for (const s of [-1, 1]) {
          const z = c + s * (thick / 2 + 0.01);
          b.box(a0 - cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, M.trim, { collide: false });
          b.box(a1 + cas / 2, h / 2 + 0.02, z, cas, h + 0.04, 0.02, M.trim, { collide: false });
          b.box((a0 + a1) / 2, h + cas / 2 + 0.02, z, w + cas * 2, cas, 0.02, M.trim, { collide: false });
        }
      }
    };
    mkFrame('z', 2.55, 3.4, 3.46, 0.12);
    mkFrame('z', 3.9, 4.7, 3.46, 0.12);
    mkFrame('z', 6.55, 7.3, 3.46, 0.12);
    mkFrame('x', 7.2, 8.1, 7.75, 0.3, 2.1);
    const mk = (key, o) => { const d = new Door({ mat: M.doorPaint, knobMat: knob, thick: 0.042, ...o }); this.doors[key] = d; d.key = key; return d; };
    mk('bedroom', { hinge: V(3.46, 0, 2.56), width: 0.83, height: 2.06, closedYaw: -Math.PI / 2, openDir: -1, maxAngle: 1.7, label: 'door', angle: 1.2 });
    mk('bath', { hinge: V(3.46, 0, 3.91), width: 0.78, height: 2.06, closedYaw: -Math.PI / 2, openDir: -1, maxAngle: 1.6, label: 'door', angle: 0.25 });
    mk('closet', { hinge: V(3.46, 0, 6.56), width: 0.73, height: 2.06, closedYaw: -Math.PI / 2, openDir: 1, maxAngle: 1.6, label: 'closet door' });
    this.numberMat = labelMat(L.aptNumber('4B'));
    mk('front', { hinge: V(7.21, 0, 7.75), width: 0.88, height: 2.08, closedYaw: 0, openDir: 1, maxAngle: 1.65, label: 'front door', mat: M.doorHall, thick: 0.05, number: true, numberMat: this.numberMat });
    // deadbolt + peephole on the front door (inside face)
    const fd = this.doors.front;
    const bolt = new THREE.Mesh(boxGeo(0.05, 0.07, 0.02), M.chrome); bolt.position.set(0.81, 1.15, -0.035); fd.panel.add(bolt);
    const peep = new THREE.Mesh(cylGeo(0.012, 0.02, 8), M.chrome); peep.rotation.x = Math.PI / 2; peep.position.set(0.44, 1.55, -0.03); fd.panel.add(peep);
    const chain = new THREE.Mesh(boxGeo(0.12, 0.012, 0.01), M.chrome); chain.position.set(0.76, 1.3, -0.03); fd.panel.add(chain);
    fd.tag(fd.panel);
  }

  livingRoom(b) {
    // TV stand + CRT TV on west wall
    const stand = R.tvStand();
    if (!stand) F.tvStand(b, 3.75, 1.1, Math.PI / 2);
    this.tvTop = stand ? stand.top : 0.52;
    this.tvPos = V(3.82, this.tvTop, 1.1);
    const sofa = R.sofa();
    if (!sofa) F.couch(b, 6.15, 1.2, -Math.PI / 2);
    this.couchSeat = sofa ? sofa.seat : V(6.0, 0.5, 1.2);
    this.armchair = R.armchair();
    R.ceilingFan(this);
    F.table(b, 4.95, 1.2, Math.PI / 2, 0.95, 0.5, 0.42, M.woodTable, { leg: 0.04 });
    // rug
    b.box(5.05, 0.004, 1.2, 1.9, 0.008, 2.0, M.rug, { collide: false, cast: false });
    F.radiator(b, 5.3, 0.12, 0, 0.9);
    F.radiator(b, 7.7, 0.12, 0, 0.9);
    this.shelf = R.bookshelf();
    if (!this.shelf) F.bookshelf(b, 4.6, 7.44, Math.PI, { w: 0.9, seed: 3 });
    R.commode(this);
    F.floorLamp(b, 6.75, 2.45);
    this.lights.floorLamp = F.tableLamp(V(6.75, 1.4, 2.45), { name: 'floorLamp', room: 'main', intensity: 3.5, distance: 5 });
    this.lights.floorLamp.group.scale.set(1.3, 1.3, 1.3);
    // ceiling lights
    this.lights.main = F.ceilingFixture(V(6.2, 2.7, 3.6), { name: 'main', room: 'main', shadow: true, intensity: 9, distance: 9 });
    this.switches.main = new Switch({ pos: V(7.02, 1.25, 7.592), ry: Math.PI, plateMat: M.trim, label: 'lights', onToggle: (on) => this.lights.main.set(on) });
    // wall clock
    this.clock = R.wallClock() || this.wallClock(V(6.5, 1.95, 0.02));
    // paintings: above the bookshelf, by the kitchen, over the TV
    this.paintings = [];
    const hang = (key, o) => this.paintings.push(hangPainting(this.root, key, o));
    hang('pitcher', { pos: V(4.32, 2.12, 7.6), ry: Math.PI, height: 0.34, frame: 'ebony', fw: 0.045, fd: 0.032, roll: 0.006, age: 0.9 });
    hang('madamex', { pos: V(4.9, 2.1, 7.6), ry: Math.PI, height: 0.34, frame: 'gilt', fw: 0.036, fd: 0.028, roll: -0.004, age: 0.5 });
    hang('thinker', { pos: V(9.0, 1.62, 7.6), ry: Math.PI, height: 0.46, frame: 'walnut', fw: 0.042, fd: 0.03, roll: 0.01, age: 0.4 });
    hang('aristotle', { pos: V(3.52, 1.88, 1.1), ry: Math.PI / 2, height: 0.58, frame: 'gilt', fw: 0.07, fd: 0.05, age: 1 });
    // coat hooks + jacket near the door
    b.box(6.65, 1.68, 7.585, 0.6, 0.06, 0.02, M.woodDark, { collide: false });
    for (let i = 0; i < 4; i++) b.geo(cylGeo(0.008, 0.06, 6), M.chrome, { x: 6.42 + i * 0.15, y: 1.68, z: 7.55, rx: Math.PI / 2 });
    this.coatHook = V(6.57, 1.66, 7.52);
    // door mat
    b.box(7.65, 0.006, 7.25, 0.8, 0.012, 0.5, M.cardboard.clone ? M.rug : M.rug, { collide: false, cast: false });
    // plant by the door
    this.plant = R.bigPlant();
    if (!this.plant) {
      b.geo(cylGeo(0.14, 0.3, 10, 0.18), M.cardboard, { x: 9.75, y: 0.15, z: 7.2 });
      for (let i = 0; i < 7; i++) b.geo(new THREE.ConeGeometry(0.06, 0.5, 4), std('leaf' + i, null, { color: 0x4a5a2a, roughness: 0.9, side: THREE.DoubleSide }), { x: 9.75 + Math.cos(i) * 0.06, y: 0.5, z: 7.2 + Math.sin(i) * 0.06, rx: Math.cos(i * 2) * 0.4, rz: Math.sin(i * 2) * 0.4 });
      b.collider(9.75, 0.3, 7.2, 0.3, 0.6, 0.3);
    }
    // TV itself
    this.tvGroup = new THREE.Group();
    this.tvGroup.position.set(3.82, this.tvTop, 1.1);
    this.tvGroup.rotation.y = Math.PI / 2;
    this.root.add(this.tvGroup);
    this.tv = new CrtTV(this.tvGroup);
    b.collider(3.8, this.tvTop + 0.25, 1.1, 0.5, 0.5, 0.62);
  }

  kitchen(b) {
    this.fridge = F.fridge(b, 9.84, 0.43, -Math.PI / 2);
    const run1 = F.baseCabinetRun(b, 9.9, 1.95, -Math.PI / 2, 2.2, { modules: [{ w: 0.7, type: 'door2' }, { w: 0.8, type: 'sink' }, { w: 0.7, type: 'drawers' }] });
    this.stove = F.stove(b, 9.88, 3.45, -Math.PI / 2);
    const run2 = F.baseCabinetRun(b, 9.9, 4.15, -Math.PI / 2, 0.6, { modules: [{ w: 0.6, type: 'door2', label: 'cupboard' }] });
    F.rangeHood(b, 9.98, 3.45, -Math.PI / 2);
    const up = F.upperCabinets(b, 10.03, 1.95, -Math.PI / 2, 2.2, { n: 3 });
    this.cabinets = { run1, run2, up };
    // kitchen light + switch
    this.lights.kitchen = F.ceilingFixture(V(9.2, 2.7, 2.4), { name: 'kitchen', room: 'main', intensity: 7, distance: 6, r: 0.13, color: 0xf4f0ff, shadow: false });
    this.switches.kitchen = new Switch({ pos: V(10.192, 1.25, 4.62), ry: -Math.PI / 2, plateMat: M.trim, label: 'kitchen light', onToggle: (on) => this.lights.kitchen.set(on) });
    // under-cabinet strip glow
    // dining table + chairs
    this.dining = R.dining();
    if (!this.dining) {
      F.table(b, 8.0, 5.5, 0, 1.1, 0.75, 0.75, M.woodTable);
      F.chairStatic(b, 8.0, 6.15, Math.PI);
      F.chairStatic(b, 8.0, 4.85, 0);
    }
    this.tableTop = this.dining ? this.dining.top : 0.75;
    // microwave on the short counter, the radio on the fridge
    this.microwave = R.microwave(9.98, 0.92, 4.15, -Math.PI / 2);
    this.radio = R.boombox(9.88, 1.74, 0.43, -Math.PI / 2);
    R.kettleWatch(this);
    // calendar on the east wall by the table
    this.calendarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), labelMat(L.calendar(0)));
    this.calendarMesh.position.set(10.19, 1.6, 6.2); this.calendarMesh.rotation.y = -Math.PI / 2;
    this.root.add(this.calendarMesh);
    // sink faucet (interactive)
    this.sink = this.makeSink(run1.sinkPos);
    // coffee machine
    this.coffee = this.makeCoffeeMachine(V(9.93, 0.92, 1.12));
    // cat bowls + trash can
    this.bowl = this.makeBowl(V(9.95, 0, 4.95), 'food');
    this.waterBowl = this.makeBowl(V(9.95, 0, 5.25), 'water');
    this.trash = this.makeTrashCan(V(9.88, 0, 5.85));
  }

  desk(b) {
    const d = F.desk(b, 3.88, 5.65, Math.PI / 2);
    this.deskDrawers = d.drawers;
    F.officeChair(b, 4.55, 5.65, -Math.PI / 2);
    this.deskTop = 0.74;
    this.deskChair = V(4.55, 0, 5.65);
    // corkboard + desk lamp
    b.box(3.535, 1.45, 5.65, 0.02, 0.6, 0.9, M.cardboard, { collide: false });
    this.lights.desk = F.tableLamp(V(3.75, 0.74, 6.15), { name: 'desk', room: 'main', intensity: 2.6, distance: 3.5 });
    R.deskLamp(this.lights.desk, V(3.74, 0.74, 6.18), Math.PI / 2 + 0.5);
    // sticky notes on corkboard
    const noteCol = [0xf6ec8a, 0xf0b0c8, 0xa8e0f0];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshStandardMaterial({ color: noteCol[i % 3], roughness: 1 }));
      m.position.set(3.548, 1.3 + (i % 2) * 0.22 + Math.random() * 0.04, 5.35 + Math.floor(i / 2) * 0.27 + Math.random() * 0.05);
      m.rotation.y = Math.PI / 2; m.rotation.z = (Math.random() - 0.5) * 0.3;
      this.root.add(m);
    }
    this.deskOrigin = V(3.88, 0.74, 5.65);
  }

  bedroom(b) {
    this.bedInfo = F.bed(b, 1.05, 2.25, Math.PI / 2);
    const ns = F.nightstand(b, 0.26, 1.15, Math.PI / 2);
    this.nightstand = ns;
    this.lights.bedside = F.tableLamp(V(0.24, 0.56, 1.05), { name: 'bedside', room: 'bed', intensity: 2.6, distance: 4, on: false });
    this.alarmClock = this.makeAlarmClock(V(0.28, 0.56, 1.32));
    this.wardrobe = F.wardrobe(b, 3.09, 0.75, -Math.PI / 2);
    this.lights.bed = F.ceilingFixture(V(1.7, 2.7, 1.8), { name: 'bed', room: 'bed', shadow: true, intensity: 7, distance: 7, on: false });
    this.switches.bed = new Switch({ pos: V(3.392, 1.25, 2.35), ry: -Math.PI / 2, plateMat: M.trim, label: 'lights', on: false, onToggle: (on) => this.lights.bed.set(on) });
    b.box(1.2, 0.004, 3.2, 1.6, 0.008, 0.6, M.rug, { collide: false, cast: false });
    // cat bed (cushion)
    b.geo(new THREE.TorusGeometry(0.2, 0.07, 6, 14), M.couchFabric, { x: 2.7, y: 0.07, z: 3.2, rx: Math.PI / 2 });
    b.geo(cylGeo(0.2, 0.05, 14), M.quilt, { x: 2.7, y: 0.03, z: 3.2 });
    this.catBed = V(2.7, 0.06, 3.2);
    this.paintings.push(hangPainting(this.root, 'charpentier', { pos: V(0, 1.58, 2.25), ry: Math.PI / 2, height: 0.56, frame: 'gilt', fw: 0.085, fd: 0.055, roll: -0.008, age: 0.6 }));
    this.bedPos = V(1.15, 0.5, 2.25);
  }

  bathroom(b) {
    this.tub = F.bathtub(b, 0.375, 4.57, 0);
    F.toilet(b, 1.4, 5.92, Math.PI);
    const sink = F.pedestalSink(b, 2.2, 3.97, 0);
    this.bathSink = this.makeSink(sink.basin, true);
    // mirror (reflector added by gfx/mirror.js)
    this.mirrorSpot = { pos: V(2.2, 1.55, 3.735), w: 0.52, h: 0.68, ry: 0 };
    b.box(2.2, 1.55, 3.73, 0.6, 0.76, 0.02, M.chrome, { collide: false });
    b.box(2.2, 1.17, 3.79, 0.5, 0.02, 0.1, M.porcelain, { collide: false });
    // rod for shower curtain
    b.geo(cylGeo(0.012, 1.7, 8), M.chrome, { x: 0.78, y: 2.0, z: 4.57, rx: Math.PI / 2 });
    // towel bar
    b.geo(cylGeo(0.01, 0.5, 8), M.chrome, { x: 2.75, y: 1.25, z: 6.17, rz: Math.PI / 2 });
    this.towelBar = V(2.75, 1.25, 6.15);
    this.lights.bath = F.ceilingFixture(V(1.7, 2.7, 4.95), { name: 'bath', room: 'bath', shadow: true, shadowSize: 512, intensity: 6, distance: 6, color: 0xeef2ff, on: false });
    this.lights.vanity = F.bareBulb(V(2.2, 2.03, 3.82), { name: 'vanity', room: 'bath', intensity: 2.2, distance: 3, cord: 0.02, on: false });
    this.switches.bath = new Switch({ pos: V(3.392, 1.25, 4.85), ry: -Math.PI / 2, plateMat: M.trim, label: 'lights', on: false, onToggle: (on) => { this.lights.bath.set(on); this.lights.vanity.set(on); } });
    b.box(1.6, 0.005, 4.9, 0.7, 0.01, 0.45, M.towel, { collide: false, cast: false });
  }

  closet(b) {
    // shelves on north wall
    for (const y of [0.5, 1.0, 1.5]) b.box(1.7, y, 6.52, 2.6, 0.025, 0.38, M.woodLight);
    for (const x of [0.4, 3.0]) b.box(x, 0.9, 6.52, 0.025, 1.8, 0.38, M.woodLight);
    // water heater
    b.geo(cylGeo(0.26, 1.4, 14), M.enamel, { x: 0.35, y: 0.7, z: 7.25 });
    b.collider(0.35, 0.7, 7.25, 0.52, 1.4, 0.52);
    // breaker box on south wall
    const box = new THREE.Mesh(boxGeo(0.4, 0.55, 0.1), M.radiator); box.position.set(2.4, 1.45, 7.55);
    this.root.add(box);
    this.breaker = new Button(box, { name: 'breaker', label: () => (G.world.power ? 'Flip the main breaker off' : 'Flip the main breaker on'), onUse: () => { G.world.power = !G.world.power; sfx('breaker', { pos: box.position, vol: 0.9 }); emit('power', G.world.power); } });
    this.lights.closet = F.bareBulb(V(1.7, 2.35, 6.95), { name: 'closet', room: 'closet', intensity: 3, distance: 4, on: false, cord: 0.3 });
    R.closetClutter();
    this.switches.closet = new Switch({ pos: V(3.392, 1.25, 7.42), ry: -Math.PI / 2, plateMat: M.trim, label: 'light', on: false, onToggle: (on) => this.lights.closet.set(on) });
    // bucket + mop
    b.geo(cylGeo(0.14, 0.28, 10, 0.16), M.rustMetal, { x: 2.9, y: 0.14, z: 7.3 });
    b.geo(cylGeo(0.012, 1.3, 6), M.woodLight, { x: 3.1, y: 0.7, z: 7.45, rx: 0.15 });
  }

  // ------------------------------------------------------------- helpers
  wallClock(pos) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ map: T.printed('clockface', 64, 64, (c, w, h) => {
      c.fillStyle = '#f2eee4'; c.beginPath(); c.arc(32, 32, 31, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(32 + Math.sin(a) * 26 - 1, 32 - Math.cos(a) * 26 - 2, 2, 4); }
    }), roughness: 0.4 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.015, 6, 24), M.woodDark);
    const hh = new THREE.Mesh(boxGeo(0.012, 0.09, 0.004), M.black); hh.geometry.translate(0, 0.04, 0);
    const mh = new THREE.Mesh(boxGeo(0.008, 0.13, 0.004), M.black); mh.geometry.translate(0, 0.06, 0);
    const sh = new THREE.Mesh(boxGeo(0.003, 0.14, 0.003), new THREE.MeshStandardMaterial({ color: 0xa01010 })); sh.geometry.translate(0, 0.06, 0);
    hh.position.z = 0.006; mh.position.z = 0.009; sh.position.z = 0.012;
    g.add(face, rim, hh, mh, sh);
    g.position.copy(pos);
    this.root.add(g);
    return { g, hh, mh, sh };
  }

  makeAlarmClock(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(0.18, 0.08, 0.09, 0.012), M.plasticDark);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 24;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(0, 0, 0.0455);
    g.add(body, screen);
    g.position.copy(pos).add(V(0, 0.04, 0)); g.rotation.y = Math.PI / 2 + 0.3;
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
    // invisible handle region + water stream
    const g = new THREE.Group();
    g.position.copy(pos).add(V(bath ? 0 : 0.16, bath ? 0.12 : 0.18, bath ? -0.12 : 0));
    const handle = new THREE.Mesh(boxGeo(bath ? 0.1 : 0.14, 0.06, bath ? 0.08 : 0.08), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(handle);
    if (!bath) {
      // kitchen gooseneck faucet
      const neck = new THREE.Mesh(cylGeo(0.012, 0.28, 8), M.chrome); neck.position.set(0, 0.04, 0); g.add(neck);
      const spout = new THREE.Mesh(cylGeo(0.01, 0.16, 8), M.chrome); spout.rotation.z = Math.PI / 2; spout.position.set(-0.08, 0.17, 0); g.add(spout);
      const lever = new THREE.Mesh(boxGeo(0.07, 0.012, 0.016), M.chrome); lever.position.set(0.02, 0.0, 0.05); g.add(lever);
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
      update: (dt) => { if (s.running) { stream.scale.x = 1 + Math.sin(G.time * 40) * 0.08; stream.material.opacity = 0.45 + Math.random() * 0.15; } },
    });
    s.isSink = true; s.running = false; s.stream = stream; s.bath = bath;
    // drinking straight from the tap
    const origActions = s.actions.bind(s);
    s.actions = () => { const a = origActions(); if (s.running && !G.player?.inv?.hand) a.push({ key: 'F', label: 'Drink from the tap' }); return a; };
    s.useF = () => (s.running ? { anim: 'drinkTap', dur: 2.4, sound: 'gulp', target: sp, at: [[1.6, () => G.player.hunger.drink(0.05, { tap: true })]] } : null);
    return s;
  }

  makeCoffeeMachine(pos) {
    const g = new THREE.Group();
    g.position.copy(pos); g.rotation.y = -Math.PI / 2;
    const dark = M.plasticDark;
    const base = new THREE.Mesh(boxGeo(0.2, 0.03, 0.22), dark); base.position.set(0, 0.015, 0.02);
    const tower = new THREE.Mesh(boxGeo(0.2, 0.32, 0.1), dark); tower.position.set(0, 0.16, -0.07);
    const head = new THREE.Mesh(boxGeo(0.2, 0.07, 0.2), dark); head.position.set(0, 0.29, 0.02);
    const plate = new THREE.Mesh(cylGeo(0.05, 0.006, 14), M.steel); plate.position.set(0, 0.033, 0.05);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 0 });
    const led = new THREE.Mesh(boxGeo(0.012, 0.012, 0.004), ledMat); led.position.set(0.06, 0.2, -0.019);
    const btn = new THREE.Mesh(boxGeo(0.03, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.5 })); btn.position.set(0.0, 0.2, -0.017);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshBasicMaterial({ map: T.printed('mrcoffee', 64, 16, (c) => { c.fillStyle = '#222'; c.fillRect(0, 0, 64, 16); c.fillStyle = '#d8d0c0'; c.font = 'bold 9px Arial'; c.textAlign = 'center'; c.fillText('BREW MASTER', 32, 11); }) }));
    label.position.set(0, 0.29, 0.121);
    g.add(base, tower, head, plate, led, btn, label);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.root.add(g);
    G.physics.addStaticBox(pos.x + 0.07, pos.y + 0.16, pos.z, 0.05, 0.16, 0.1);
    G.physics.addStaticBox(pos.x - 0.02, pos.y + 0.29, pos.z, 0.1, 0.035, 0.1);
    G.physics.addStaticBox(pos.x - 0.02, pos.y + 0.015, pos.z, 0.11, 0.015, 0.1);
    const spot = g.localToWorld(V(0, 0.083, 0.05));
    const cm = new Button(g, {
      name: 'coffee',
      label: () => {
        if (cm.brewing) return 'Brewing...';
        const mug = cm.mugAtSpot();
        if (G.player?.inv?.hand?.type === 'mug' && !mug) return 'Place mug';
        if (mug && mug.state.fill < 0.5) return 'Brew coffee';
        if (mug) return null;
        return 'Brew coffee (needs a mug)';
      },
      onUse: () => {
        if (cm.brewing) return;
        const hand = G.player.inv.hand;
        const mug = cm.mugAtSpot();
        if (hand && hand.type === 'mug' && !mug) { G.player.inv.placeHandAt(spot.clone(), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI * 0.9, 0))); return; }
        if (!mug) { sfx('click', { pos, vol: 0.4 }); G.hud.inner('I need a mug under it.'); return; }
        if (mug.state.fill >= 0.5) return;
        cm.brewing = true; cm.t = 0; cm.mug = mug;
        sfx('click', { pos, vol: 0.5 });
        ledMat.emissiveIntensity = 2;
        cm.loopS = G.audio && G.audio.loop('brew', { pos, vol: 0.6 });
      },
      update: (dt) => {
        if (!cm.brewing) return;
        cm.t += dt;
        const mug = cm.mug;
        if (!mug || mug.dead || mug.prop.held || mug.mesh.position.distanceTo(spot) > 0.08) {
          // mug removed mid-brew: coffee spills on the plate
          if (cm.t > 0.5) G.decals && G.decals.coffee(spot);
          cm.stop(); return;
        }
        mug.state.fill = clamp(cm.t / 9, 0, 1); mug.state.hot = true; mug.refresh();
        if (G.particles && Math.random() < dt * 8) G.particles.steam(spot.clone().add(V(0, 0.1, 0)));
        if (cm.t > 9.5) { cm.stop(); sfx('beep', { pos, vol: 0.6 }); emit('coffeeBrewed'); }
      },
    });
    cm.stop = () => { cm.brewing = false; ledMat.emissiveIntensity = 0; if (cm.loopS) { cm.loopS.stop(0.4); cm.loopS = null; } };
    cm.spot = spot;
    cm.mugAtSpot = () => G.world.items.find((i) => i.type === 'mug' && !i.prop.held && !i.dead && i.mesh.position.distanceTo(spot) < 0.08);
    return cm;
  }

  makeBowl(pos, kind) {
    const g = new THREE.Group(); g.position.copy(pos);
    const col = kind === 'food' ? 0x3a6ab0 : 0xb03a3a;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.05, 16, 1, true), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, side: THREE.DoubleSide }));
    bowl.position.y = 0.025;
    const bot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), bowl.material); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.003;
    const content = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), new THREE.MeshStandardMaterial({ color: kind === 'food' ? 0x7a4a24 : 0x8ab0c8, roughness: kind === 'food' ? 0.9 : 0.05, transparent: kind !== 'food', opacity: 0.7, envMapIntensity: 2 }));
    content.rotation.x = -Math.PI / 2; content.visible = false;
    g.add(bowl, bot, content);
    // kibble bumps
    const kib = new THREE.Group();
    if (kind === 'food') { for (let i = 0; i < 26; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), content.material); const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.06; k.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); kib.add(k); } }
    g.add(kib);
    this.root.add(g);
    G.physics.addStaticCyl(pos.x, pos.y + 0.025, pos.z, 0.085, 0.05);
    const bw = new Button(g, {
      name: 'bowl', label: () => (kind === 'food' ? (bw.level > 0.05 ? null : null) : (bw.level < 0.5 ? null : null)),
      onUse: () => {},
    });
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
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.48, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
    can.position.y = 0.24;
    const lid = new THREE.Mesh(cylGeo(0.175, 0.025, 14), can.material); lid.position.y = 0.49;
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.2 }));
    bag.position.y = 0.3;
    g.add(can, lid, bag);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.root.add(g);
    // the real can, open at the top so the bag shows
    if (R.trashCan(V(0, 0, 0), g)) { can.visible = false; lid.visible = false; }
    G.physics.addStaticCyl(pos.x, 0.25, pos.z, 0.17, 0.5);
    const t = new Button(g, {
      name: 'trash',
      label: () => {
        const h = G.player?.inv?.hand;
        if (h && h.type !== 'trashBag') return 'Throw away ' + h.label.toLowerCase();
        if (t.full && !h) return 'Take out the trash bag';
        return null;
      },
      onUse: () => {
        const h = G.player.inv.hand;
        if (h && h.type !== 'trashBag') { sfx('trashLid', { pos, vol: 0.6 }); G.player.inv.consumeHand(true); t.count++; return; }
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
    w.addZone({ name: 'main', ...APT.main, surface: 'wood', reverb: 'room', apt: true });
    w.addZone({ name: 'kitchen', x0: 8.9, z0: 0, x1: 10.2, z1: 4.85, surface: 'tile', reverb: 'room', apt: true });
    w.addZone({ name: 'bed', ...APT.bed, surface: 'wood', reverb: 'small', apt: true });
    w.addZone({ name: 'bath', ...APT.bath, surface: 'tile', reverb: 'bath', apt: true });
    w.addZone({ name: 'closet', ...APT.closet, surface: 'concrete', reverb: 'small', apt: true });
    // doorway slivers
    w.addZone({ name: 'main', x0: 3.38, z0: 0, x1: 3.54, z1: 7.6, surface: 'wood', apt: true });
  }

  spawnItems() {
    const it = (t, x, y, z, o) => { const i = spawn(t, x, y, z, o); this.items.push(i); return i; };
    const fr = this.fridge;
    // fridge contents (fridge door faces -x; interior x ~ 9.55..10.1)
    const fx = 9.82;
    it('eggs', fx, fr.shelves[1] + 0.035, 0.35, { ry: Math.PI / 2 });
    it('milk', fx + 0.08, fr.shelves[2] + 0.12, 0.62, {});
    it('juice', fx + 0.06, fr.shelves[2] + 0.11, 0.2, {});
    it('cheese', fx - 0.05, fr.shelves[0] + 0.03, 0.5, {});
    it('apple', fx - 0.04, fr.shelves[0] + 0.04, 0.25, {});
    it('apple', fx + 0.06, fr.shelves[0] + 0.04, 0.3, {});
    it('pizza', fx, fr.shelves[2] + 0.03, 0.42, { ry: 0.1 });
    it('takeout', fx + 0.02, fr.shelves[1] + 0.05, 0.62, {});
    // counter: mug, cereal, bread
    it('mug', 9.95, 0.97, 0.98, { ry: 2 });
    it('mug', 9.86, 0.97, 2.75, { ry: 0.4 });
    it('bread', 9.9, 0.98, 2.85, { ry: 0.2 });
    it('glass', 9.75, 0.98, 1.4, {});
    // pan on the stove
    this.pan = it('pan', this.stove.burners[2].center.x, this.stove.burners[2].center.y + 0.03, this.stove.burners[2].center.z, { ry: Math.PI });
    // cupboard under the counter by the stove: cat food box
    const c2 = this.cabinets.run2.interiors[0];
    this.catBox = it('catBox', c2.center.x - 0.02, 0.1 + 0.13, c2.center.z - 0.12, { ry: Math.PI / 2 });
    it('catCan', c2.center.x, 0.12, c2.center.z + 0.12, {});
    // first lower cupboard: cans, crackers
    const c1 = this.cabinets.run1.interiors[0];
    it('soup', c1.center.x - 0.05, 0.16, c1.center.z - 0.15, {});
    it('beans', c1.center.x - 0.05, 0.16, c1.center.z, {});
    it('crackers', c1.center.x + 0.02, c1.shelfY + 0.12, c1.center.z + 0.1, { ry: Math.PI / 2 });
    // upper cabinet: cereal, peanut butter, glasses
    const s0 = this.cabinets.up.shelves[0];
    it('cereal', s0.center.x - 0.02, s0.y + 0.14, s0.center.z, { ry: Math.PI / 2 });
    it('pb', s0.center.x, s0.y2 + 0.07, s0.center.z - 0.1, {});
    const s2 = this.cabinets.up.shelves[2];
    it('mug', s2.center.x, s2.y + 0.05, s2.center.z + 0.1, {});
    it('glass', s2.center.x, s2.y + 0.06, s2.center.z - 0.1, {});
    // living room: remote, toy, book
    it('remote', 4.95, 0.45, 1.0, { ry: 0.3 });
    it('catToy', 5.6, 0.03, 2.6, {});
    it('book', 4.95, 0.45, 1.45, { ry: 1.2, rz: Math.PI / 2 });
    // closet shelves: flashlight, supplies
    it('flashlight', 1.2, 1.04, 6.5, { ry: 0.3 });
    it('soup', 1.8, 0.56, 6.5, {});
    it('beans', 1.95, 0.56, 6.48, {});
    it('catCan', 2.2, 0.53, 6.5, {});
    it('crackers', 2.5, 1.12, 6.5, {});
    // the real-model clutter: all of it can be picked up, carried and thrown
    const m = (model, t, x, y, z, o = {}) => has(model) && it(t, x, y, z, o);
    const bn = this.stove.burners;
    m('kettle', 'kettle', bn[1].center.x, bn[1].center.y + 0.16, bn[1].center.z, { ry: Math.PI / 2 });
    m('pot', 'pot', bn[0].center.x, bn[0].center.y + 0.1, bn[0].center.z, { ry: 0.4 });
    const tt = this.tableTop + 0.005;
    m('jug', 'jug', 7.86, tt + 0.105, 5.38, { ry: 2.1 });
    m('bowl', 'woodBowl', 8.16, tt + 0.045, 5.62, {});
    m('bottles', 'wine', 7.98, tt + 0.155, 5.72, {});
    m('cleaner', 'cleaner', 10.02, 0.92 + 0.165, 1.66, { ry: -Math.PI / 2 });
    m('bleach', 'bleach', 2.75, 0.5 + 0.16, 6.55, {});
    if (this.shelf) m('plant', 'plantPot', 4.62, this.shelf.top + 0.14, 7.36, {});
    if (this.commode) {
      const c = this.commode.top;
      m('photoFrame', 'photo', c.x - 0.3, c.y + 0.13, c.z, { ry: Math.PI - 0.3 });
      m('alarmClock', 'twinBell', c.x + 0.28, c.y + 0.09, c.z + 0.02, { ry: Math.PI + 0.2 });
    }
    m('box', 'cardboard', 1.05, 0.18, 7.22, { ry: 0.1 });
    m('box', 'cardboard', 1.08, 0.54, 7.2, { ry: -0.15 });
    m('basket', 'basket', 1.2, 1.5 + 0.075, 6.52, {});
    m('dustpan', 'dustpan', 2.62, 0.06, 7.05, { ry: 0.6 });
  }

  // the loop: every morning the apartment is exactly as it was on July 1st.
  // (Only what is written on you, and in the cat, carries over.)
  captureInitial() {
    this.init = {
      doors: Object.fromEntries(Object.entries(this.doors).map(([k, d]) => [k, d.angle])),
      switches: Object.fromEntries(Object.entries(this.switches).map(([k, sw]) => [k, sw.on])),
      lights: Object.fromEntries(Object.entries(this.lights).map(([k, l]) => [k, l.on])),
    };
  }
  resetDay() {
    const keep = new Set(G.building ? G.building.food4C : []);
    const inv = G.player && G.player.inv;
    if (inv) { inv.hand = null; inv.slots = new Array(6).fill(null); inv.changed(); }
    for (const i of [...G.world.items]) if (!keep.has(i)) i.destroy();
    this.items = [];
    this.spawnItems();
    for (const [k, a] of Object.entries(this.init.doors)) this.doors[k].setAngle(a);
    for (const [k, v] of Object.entries(this.init.switches)) this.switches[k].set(v, true);
    for (const [k, v] of Object.entries(this.init.lights)) this.lights[k].set(v);
    for (const w of Object.values(this.windows)) { w.pos = 0; w.vel = 0; w.target = null; w.sash.position.copy(w.base); }
    for (const sk of [this.sink, this.bathSink]) if (sk.running) sk.o.onUse();
    settlePaintings(this.paintings, G.story.day);
    Seat.release(); Pushable.resetAll();
    if (this.radio) this.radio.off();
    if (this.fan) this.fan.on = false;
    if (this.coffee.stop) this.coffee.stop();
    this.coffee.mug = null;
    this.bowl.fill(0); this.waterBowl.fill(0.8);
    this.trash.setFull(true); this.trash.count = 0;
    this.stove.knobs.forEach((kb, i) => { if (this.stove.burners[[2, 0, 1, 3][i]].on) kb.o.onUse(); });
    if (this.tv && this.tv.on) this.tv.toggle();
    G.world.power = true;
  }

  setCalendar(day) {
    this.calendarMesh.material.map = L.calendar(day - 1);
    this.calendarMesh.material.needsUpdate = true;
  }

  update(dt) {
    this.tv && this.tv.update(dt);
    // wall clock reflects game time
    if (G.director) {
      const t = G.director.clockMinutes();
      const h = (t / 60) % 12, m = t % 60;
      this.clock.hh.rotation.z = -h / 12 * Math.PI * 2;
      this.clock.mh.rotation.z = -m / 60 * Math.PI * 2;
      this.clock.sh.rotation.z = -(G.time % 60) / 60 * Math.PI * 2;
      const hr = Math.floor(t / 60) % 24, mn = Math.floor(t % 60);
      const h12 = ((hr + 11) % 12) + 1;
      const glitch = G.director.alarmGlitch;
      this.alarmClock.draw(glitch ? glitch : `${String(h12).padStart(2, ' ')}:${String(mn).padStart(2, '0')}`, G.director.alarmRinging && Math.floor(G.time * 2) % 2 === 0);
    }
    // stove burners
    for (const bu of this.stove.burners) {
      bu.heat = damp(bu.heat, bu.on && G.world.power !== false ? 1 : 0, 2, dt);
      bu.flameMat.opacity = bu.on ? 0.55 + Math.random() * 0.35 : 0;
      bu.flame.scale.setScalar(bu.on ? 0.9 + Math.random() * 0.2 : 1);
    }
    // cooking: pan on a hot burner
    const pan = this.pan;
    if (pan && !pan.dead && !pan.prop.held) {
      let heat = 0;
      for (const bu of this.stove.burners) if (bu.heat > 0.3 && pan.mesh.position.distanceTo(bu.center) < 0.12) heat = bu.heat;
      if (heat > 0.3 && pan.eggs > 0 && pan.cook < 1) {
        pan.cook = Math.min(1, pan.cook + dt / 12 * heat);
        if (pan.eggMeshes) for (const w of pan.eggMeshes) { w.material.opacity = 0.55 + 0.45 * pan.cook; }
        if (!pan.sizzle) pan.sizzle = G.audio && G.audio.loop('sizzle', { pos: pan.mesh.position, vol: 0.5 });
        if (Math.random() < dt * 5 && G.particles) G.particles.steam(pan.mesh.position.clone().add(V(0, 0.05, 0)));
        if (pan.cook >= 1) { emit('eggsCooked'); G.hud && G.hud.inner('The eggs are done.'); }
      } else if (pan.sizzle && (heat < 0.3 || pan.eggs === 0)) { pan.sizzle.stop(0.5); pan.sizzle = null; }
      if (heat > 0.5 && pan.eggs > 0 && pan.cook >= 1) { pan.burnt = (pan.burnt || 0) + dt; if (pan.burnt > 25 && pan.eggMeshes) for (const w of pan.eggMeshes) w.material.color.setHex(0x3a2a1a); }
    }
  }
}
