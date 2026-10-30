// Apartment 1407 — the home. Room shell, furniture with all their small parts, lighting moods,
// the city outside, physics for loose props, actors, and the cinematic contract (ARCHITECTURE.md).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { ROOM, OPENINGS, FURNITURE as F, SPOTS, CAMS } from './layout.js';
import { rbox, lathe, bcyl, tube, mesh, group, plane } from '../gfx/shapes.js';
import { T, normalMap, flamePainting, weddingPhoto, poster, labelTex, canvas, tex } from '../gfx/textures.js';
import { Physics } from '../game/physics.js';
import { Actor } from '../game/mover.js';
import { NavGrid } from '../game/nav.js';
import { buildProps } from '../game/props.js';
import { clamp, lerp, ease, damp, rng, fmtClock } from '../core/util.js';
import { inkHull } from '../chars/index.js';
import { loadFurniture, furniture as oldModel, surface, FURN } from '../gfx/furniture.js';

const { x0, x1, z0, z1, h: H, wall: WT } = ROOM;
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, envMapIntensity: 0.5, ...o });

export class Apartment {
  constructor() {
    this.name = 'apartment';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07060a);
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 900);
    this.actors = []; this.propsMap = new Map(); this.hotspots = []; this.draggables = [];
    this.camTween = null; this.camLook = new THREE.Vector3(); this.cinematic = false;
    this.mess = []; this.lightsOn = { ceiling: true, floor: true, desk: true, fairy: true };
    this.time = 0; this.tvMode = 'off'; this.radioOn = false;
    game.events.on('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
  }
  prop(name) { return this.propsMap.get(name); }
  reg(name, obj) { obj.name = name; this.propsMap.set(name, obj); return obj; }
  // Register a clickable furniture hotspot.
  hot(obj, name, label, spot, extra = {}) { obj.traverse((o) => { o.userData.hot = { name, label, spot, ...extra }; }); this.hotspots.push(obj); return obj; }

  async init(onProgress = () => {}) {
    const s = this.scene;
    await loadFurniture((p) => onProgress(p * 0.1, 'furniture'));
    this.old = FURN.ok;
    this.M = {
      floor: std({ map: T.floorTiles(), normalMap: normalMap('tile', [3.2, 2.3]), roughness: 0.42, envMapIntensity: 0.8 }),
      wall: std({ map: T.plaster('#cdd6bf'), normalMap: normalMap('plaster', [2, 1]), roughness: 0.92 }),
      wallBack: std({ map: T.plaster('#d6cdb4'), normalMap: normalMap('plaster', [2, 1]), roughness: 0.92 }),
      cut: std({ color: 0x1b1714, roughness: 1 }),
      ceiling: std({ color: 0xd9d4c8, roughness: 1 }),
      trim: std({ color: 0xe8e1cf, roughness: 0.5 }),
      wood: std({ map: T.wood('#8a5a35', '#5a361c'), normalMap: normalMap('wood'), roughness: 0.6 }),
      woodDark: std({ map: T.wood('#5b3a22', '#2e1a0c', 'd'), normalMap: normalMap('wood'), roughness: 0.55 }),
      woodLight: std({ map: T.wood('#c9a77a', '#94704a', 'l'), normalMap: normalMap('wood'), roughness: 0.6 }),
      cabinet: std({ color: 0xe9e4d6, roughness: 0.55 }),
      laminate: std({ map: T.laminate('#ded6c0'), roughness: 0.4, envMapIntensity: 0.9 }),
      steel: std({ map: T.metal('#b8bcc0'), roughness: 0.32, metalness: 0.85, envMapIntensity: 1.2 }),
      darkSteel: std({ color: 0x2a2c2f, roughness: 0.45, metalness: 0.7 }),
      chrome: std({ color: 0xdddddd, roughness: 0.12, metalness: 1, envMapIntensity: 1.5 }),
      black: std({ color: 0x151414, roughness: 0.5 }),
      beige: std({ color: 0xd9cfb4, roughness: 0.55 }),
      plastic: std({ color: 0xece7da, roughness: 0.45 }),
      sofa: std({ map: T.fabric('#4f6e6a', 'weave'), normalMap: normalMap('fabric', [3, 3]), roughness: 0.95 }),
      cushion: std({ map: T.fabric('#c9784a', 'check', 'c'), normalMap: normalMap('fabric', [2, 2]), roughness: 0.95 }),
      throw: std({ map: T.fabric('#d8c08a', 'stripes', 't'), normalMap: normalMap('knit', [2, 2]), roughness: 1, side: THREE.DoubleSide }),
      curtain: std({ map: T.fabric('#2f4f86', 'weave', 'cur'), normalMap: normalMap('fabric', [4, 4]), roughness: 0.95, side: THREE.DoubleSide }),
      rug: std({ map: T.rug(), normalMap: normalMap('fabric', [6, 6]), roughness: 1 }),
      gold: std({ color: 0xc9a14a, roughness: 0.32, metalness: 1, envMapIntensity: 1.4 }),
      pink: std({ color: 0xe86fa0, roughness: 0.42 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.12, envMapIntensity: 1.5 }),
      cardboard: std({ color: 0xb8915e, normalMap: normalMap('crumple'), roughness: 0.9 }),
      white: std({ color: 0xf2efe6, roughness: 0.6 }),
      rubber: std({ color: 0x222222, roughness: 0.9 }),
      bulb: new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc06a, emissiveIntensity: 3 }),
    };
    // the old game's painted surfaces
    if (this.old) {
      const W = x1 - x0, D = z1 - z0;
      this.M.floor = surface('woodFloor', { w: W, h: D, normal: 0.8 }) || this.M.floor;
      this.M.wall = surface('plasterBeige', { tint: 0xfff0d8, normal: 0.15, w: D, h: H }) || this.M.wall;
      this.M.wallBack = surface('plaster', { tint: 0xeee6d8, normal: 0.15, w: W, h: H }) || this.M.wallBack;
      this.M.ceiling = surface('plaster', { tint: 0xfffaf0, normal: 0, w: W, h: D }) || this.M.ceiling;
      this.M.cabinet = surface('cabinetWood', { tint: 0xe8d0b0, normal: 0.6, tile: 0.6 }) || this.M.cabinet;
      this.M.subway = surface('subway', { normal: 0.8, w: 0.85, h: 0.55, tile: 0.5 });
      this.M.curtain = surface('linen', { tint: 0x4a6aa8, normal: 0.6, tile: 0.5, w: 1, h: 2 }) || this.M.curtain; if (this.M.curtain) this.M.curtain.side = THREE.DoubleSide;
      this.M.rugMat = surface('carpet', { tint: 0xc07060, normal: 0.6, w: 2, h: 2.2 });
    }
    this.buildShell(); onProgress(0.15, 'walls');
    this.buildKitchen(); this.buildLiving(); onProgress(0.35, 'furniture');
    this.buildDesk(); this.buildShelf(); this.buildCrib(); this.buildDecor(); onProgress(0.55, 'details');
    if (this.old) this.useOldFurniture();
    this.buildLights(); onProgress(0.6, 'lights');
    await this.buildCity(); onProgress(0.8, 'city');
    this.physics = new Physics(); this.buildColliders();
    this.loose = buildProps(this); onProgress(0.9, 'props');
    this.nav = new NavGrid(this);
    this.sunny = this.spawnActor('sunny', SPOTS.center.pos, 0);
    this.camera.position.set(...CAMS.overview.pos); this.camLook.set(...CAMS.overview.look); this.camera.fov = CAMS.overview.fov; this.camera.updateProjectionMatrix();
    this.setLight('evening');
    onProgress(1, 'ready');
  }

  // ------------------------------------------------------------------ shell
  buildShell() {
    const s = this.scene, M = this.M;
    const floor = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.floor, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, 0], shadow: false }); s.add(floor);
    this.floor = floor;
    // the floor slab edge (dollhouse cut)
    s.add(mesh(rbox(x1 - x0 + WT * 2, 0.25, z1 - z0 + WT * 2, 0.01), M.cut, { pos: [0, -0.126, 0], shadow: false }));
    const wallBox = (cx, cy, cz, w, h, d, mat) => {
      const mats = [mat, mat, M.cut, mat, mat, mat];
      const m = mesh(new THREE.BoxGeometry(w, h, d), mats, { pos: [cx, cy, cz] }); s.add(m); return m;
    };
    // back wall with window + bathroom door holes
    const bz = z0 - WT / 2, W = OPENINGS.window, B = OPENINGS.bathroom;
    const back = [];
    back.push(wallBox((x0 - WT + B.x0) / 2, H / 2, bz, B.x0 - x0 + WT, H, WT, M.wallBack));
    back.push(wallBox((B.x0 + B.x1) / 2, (B.h + H) / 2, bz, B.x1 - B.x0, H - B.h, WT, M.wallBack));
    back.push(wallBox((B.x1 + W.x0) / 2, H / 2, bz, W.x0 - B.x1, H, WT, M.wallBack));
    back.push(wallBox((W.x0 + W.x1) / 2, W.y0 / 2, bz, W.x1 - W.x0, W.y0, WT, M.wallBack));
    back.push(wallBox((W.x0 + W.x1) / 2, (W.y1 + H) / 2, bz, W.x1 - W.x0, H - W.y1, WT, M.wallBack));
    back.push(wallBox((W.x1 + x1 + WT) / 2, H / 2, bz, x1 + WT - W.x1, H, WT, M.wallBack));
    // west wall (solid)
    wallBox(x0 - WT / 2, H / 2, 0, WT, H, z1 - z0, M.wall);
    // east wall with entrance door hole
    const D = OPENINGS.door;
    wallBox(x1 + WT / 2, H / 2, (z0 + D.z0) / 2, WT, H, D.z0 - z0, M.wall);
    wallBox(x1 + WT / 2, (D.h + H) / 2, (D.z0 + D.z1) / 2, WT, H - D.h, D.z1 - D.z0, M.wall);
    wallBox(x1 + WT / 2, H / 2, (D.z1 + z1) / 2, WT, H, z1 - D.z1, M.wall);
    // front wall + ceiling (only in cinematic interior shots)
    this.front = wallBox(0, H / 2, z1 + WT / 2, x1 - x0 + WT * 2, H, WT, M.wall); this.front.visible = false;
    this.ceiling = mesh(new THREE.BoxGeometry(x1 - x0 + WT * 2, 0.08, z1 - z0 + WT * 2), M.ceiling, { pos: [0, H + 0.04, 0] }); this.ceiling.visible = false; s.add(this.ceiling);
    // baseboards
    const bb = (cx, cz, w, d) => s.add(mesh(rbox(w, 0.09, d, 0.006), M.trim, { pos: [cx, 0.045, cz] }));
    bb((x0 + B.x0) / 2, z0 + 0.012, B.x0 - x0, 0.024); bb((B.x1 + x1) / 2, z0 + 0.012, x1 - B.x1, 0.024);
    bb(x0 + 0.012, 0, 0.024, z1 - z0); bb(x1 - 0.012, (z0 + D.z0) / 2, 0.024, D.z0 - z0); bb(x1 - 0.012, (D.z1 + z1) / 2, 0.024, z1 - D.z1);
    // window: frame, sill, sliding panes, grille, curtains
    const win = new THREE.Group(); s.add(win);
    const fw = 0.06, cx = (W.x0 + W.x1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0, cy = (W.y0 + W.y1) / 2;
    win.add(mesh(rbox(ww + 0.12, fw, WT + 0.04, 0.01), M.white, { pos: [cx, W.y1 + fw / 2 - 0.02, z0 - WT / 2] }));
    win.add(mesh(rbox(ww + 0.22, 0.045, 0.28, 0.012), M.white, { pos: [cx, W.y0 - 0.01, z0 + 0.04] })); // sill
    for (const xx of [W.x0, W.x1]) win.add(mesh(rbox(fw, wh, WT + 0.04, 0.01), M.white, { pos: [xx + (xx === W.x0 ? fw / 2 - 0.02 : -fw / 2 + 0.02), cy, z0 - WT / 2] }));
    for (let i = 0; i < 2; i++) {
      const pane = new THREE.Group(); const pw = ww / 2 + 0.03;
      pane.add(mesh(rbox(pw, 0.035, 0.035, 0.006), M.chrome, { pos: [0, wh / 2 - 0.02, 0] }), mesh(rbox(pw, 0.035, 0.035, 0.006), M.chrome, { pos: [0, -wh / 2 + 0.02, 0] }));
      pane.add(mesh(rbox(0.035, wh, 0.035, 0.006), M.chrome, { pos: [-pw / 2, 0, 0] }), mesh(rbox(0.035, wh, 0.035, 0.006), M.chrome, { pos: [pw / 2, 0, 0] }));
      const glass = mesh(new THREE.PlaneGeometry(pw, wh), this.M.glass, { shadow: false }); glass.layers.set(2); pane.add(glass);
      pane.position.set(cx + (i ? 0.45 : -ww / 4), cy, z0 - WT / 2 + (i ? 0.03 : -0.03)); win.add(pane);
      if (i) this.reg('windowPane', pane);
    }
    // security grille outside (very Bangkok)
    for (let i = 0; i <= 10; i++) win.add(mesh(rbox(0.014, wh + 0.1, 0.014, 0.004), M.darkSteel, { pos: [W.x0 + (i / 10) * ww, cy, z0 - WT - 0.06], shadow: true }));
    for (const yy of [W.y0 + 0.3, cy + 0.2, W.y1 - 0.15]) win.add(mesh(rbox(ww + 0.06, 0.016, 0.016, 0.004), M.darkSteel, { pos: [cx, yy, z0 - WT - 0.06] }));
    // a little exterior ledge with an AC compressor + potted plant
    win.add(mesh(rbox(ww + 0.8, 0.08, 0.6, 0.01), std({ color: 0x8b8578, roughness: 0.9 }), { pos: [cx, W.y0 - 0.12, z0 - WT - 0.3] }));
    const ac = group(mesh(rbox(0.8, 0.55, 0.32, 0.02), M.plastic, { pos: [0, 0.27, 0] }), mesh(new THREE.CircleGeometry(0.2, 24), M.darkSteel, { pos: [0.12, 0.27, 0.165] }));
    ac.position.set(W.x1 - 0.2, W.y0 - 0.08, z0 - WT - 0.35); win.add(ac);
    // curtains (blue, like the reference): rod + two gathered panels with folds
    win.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, ww + 0.9, 10), M.chrome, { pos: [cx, W.y1 + 0.12, z0 + 0.09], rot: [0, 0, Math.PI / 2] }));
    const curtain = (xa, xb, folds) => {
      const g = new THREE.PlaneGeometry(xb - xa, W.y1 + 0.1 - 0.12, 48, 12), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + (xb - xa) / 2) / (xb - xa), v = p.getY(i); p.setZ(i, Math.sin(u * Math.PI * folds) * 0.035 + Math.sin(u * 23) * 0.006 + (v < -0.9 ? Math.sin(u * 40) * 0.01 : 0)); }
      g.computeVertexNormals();
      const m = mesh(g, M.curtain, { pos: [(xa + xb) / 2, (W.y1 + 0.1 + 0.12) / 2 - 0.02, z0 + 0.1] }); win.add(m); return m;
    };
    this.curtainL = curtain(W.x0 - 0.45, W.x0 + 0.05, 9); this.curtainR = curtain(W.x1 - 0.25, W.x1 + 0.55, 12);
    this.hot(this.curtainR, 'window', 'The window', 'window');
    // bathroom door (closed; something lives in there)
    const bd = group(mesh(rbox(B.x1 - B.x0 - 0.04, B.h - 0.03, 0.045, 0.008), M.woodLight, { pos: [0, (B.h - 0.03) / 2, 0] }),
      mesh(rbox(0.5, 0.7, 0.012, 0.004), M.woodLight, { pos: [0, 1.45, 0.025] }), mesh(rbox(0.5, 0.7, 0.012, 0.004), M.woodLight, { pos: [0, 0.6, 0.025] }),
      mesh(new THREE.SphereGeometry(0.03, 16, 12), M.gold, { pos: [0.26, 1.0, 0.05] }));
    bd.position.set((B.x0 + B.x1) / 2, 0, z0 + 0.03); s.add(bd); this.reg('bathroomDoor', bd);
    this.hot(bd, 'bathroom', 'Bathroom door', 'center', { far: true });
    this.addFrame((B.x0 + B.x1) / 2, z0 + 0.02, B.x1 - B.x0, B.h, 0);
    // entrance door (hinged at z1 edge)
    this.buildDoor();
  }
  addFrame(cx, cz, w, h, yaw) {
    const g = group(mesh(rbox(0.07, h + 0.05, 0.05, 0.01), this.M.trim, { pos: [-w / 2 - 0.03, (h + 0.05) / 2, 0] }), mesh(rbox(0.07, h + 0.05, 0.05, 0.01), this.M.trim, { pos: [w / 2 + 0.03, (h + 0.05) / 2, 0] }),
      mesh(rbox(w + 0.13, 0.07, 0.05, 0.01), this.M.trim, { pos: [0, h + 0.03, 0] }));
    g.position.set(cx, 0, cz); g.rotation.y = yaw; this.scene.add(g); return g;
  }
  buildDoor() {
    const D = OPENINGS.door, M = this.M, w = D.z1 - D.z0 - 0.02;
    this.addFrame(x1 - 0.01, (D.z0 + D.z1) / 2, D.z1 - D.z0, D.h, -Math.PI / 2);
    const pivot = new THREE.Group(); pivot.position.set(x1 - 0.03, 0, D.z1 - 0.01); this.scene.add(pivot);
    const leaf = group(
      mesh(rbox(0.05, D.h - 0.02, w, 0.008), std({ map: T.wood('#6d4528', '#3c2412', 'door'), normalMap: normalMap('wood'), roughness: 0.5 }), { pos: [0, (D.h - 0.02) / 2, -w / 2] }),
      mesh(rbox(0.012, 0.6, w - 0.22, 0.004), M.woodDark, { pos: [-0.028, 1.45, -w / 2] }), mesh(rbox(0.012, 0.75, w - 0.22, 0.004), M.woodDark, { pos: [-0.028, 0.62, -w / 2] }),
      mesh(bcyl(0.02, 0.06, 0.004, 16), M.gold, { pos: [-0.03, 1.0, -w + 0.08], rot: [0, 0, Math.PI / 2] }),
      mesh(new THREE.SphereGeometry(0.03, 16, 12), M.gold, { pos: [-0.09, 1.0, -w + 0.08] }),
      mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 10), M.chrome, { pos: [-0.03, 1.55, -w / 2], rot: [0, 0, Math.PI / 2] }), // peephole
      mesh(tube([[-0.035, 1.2, -w + 0.04], [-0.05, 1.12, -w + 0.12], [-0.035, 1.15, -w + 0.22]], 0.004, 12, 6), M.chrome), // chain
      mesh(rbox(0.004, 0.16, 0.12, 0.002), std({ color: 0xf0e6c0, roughness: 0.9 }), { pos: [-0.03, 1.7, -w / 2] }), // "no flyers" sticker
    );
    pivot.add(leaf);
    this.doorPivot = pivot; this.doorAngle = 0; this.doorTarget = 0;
    this.hot(leaf, 'door', 'Front door', 'door');
    this.door = {
      isOpen: false,
      open: ({ kick = false } = {}) => new Promise((res) => {
        this.door.isOpen = true;
        if (kick) { game.audio?.sfx('door_break', { vol: 1 }); game.gfx?.addShake(0.8); this.doorKick = 1; this.fx?.burst?.('dust', new THREE.Vector3(x1 - 0.1, 1, 1.3)); }
        else game.audio?.sfx('creak', { vol: 0.6 });
        this.doorTarget = kick ? -1.9 : -1.45; this.doorSpeed = kick ? 14 : 3;
        setTimeout(res, kick ? 300 : 900);
      }),
      close: () => new Promise((res) => { this.door.isOpen = false; this.doorTarget = 0; this.doorSpeed = 4; setTimeout(() => { game.audio?.sfx('thud', { vol: 0.7 }); res(); }, 600); }),
    };
  }

  // ------------------------------------------------------------------ kitchen (no fridge)
  buildKitchen() {
    const s = this.scene, M = this.M, c = F.counter, g = new THREE.Group();
    g.position.set(c.x, 0, c.z); s.add(g);
    g.add(mesh(rbox(c.w - 0.04, 0.8, c.d, 0.01), M.cabinet, { pos: [0.02, 0.48, 0] }));      // carcass
    g.add(mesh(rbox(c.w - 0.06, 0.08, c.d - 0.02, 0.006), M.black, { pos: [0.04, 0.04, 0] }));  // kick plate
    g.add(mesh(rbox(c.w + 0.03, 0.04, c.d + 0.04, 0.012), M.laminate, { pos: [0.0, 0.9, 0] })); // worktop
    // doors + drawers with bar pulls
    const front = c.w / 2 + 0.005;
    const nd = 4, dw = c.d / nd;
    for (let i = 0; i < nd; i++) {
      const zz = -c.d / 2 + dw * (i + 0.5);
      g.add(mesh(rbox(0.02, 0.52, dw - 0.015, 0.006), M.cabinet, { pos: [front, 0.36, zz] }));
      g.add(mesh(rbox(0.02, 0.17, dw - 0.015, 0.006), M.cabinet, { pos: [front, 0.75, zz] }));
      g.add(mesh(rbox(0.018, 0.012, 0.12, 0.004), M.chrome, { pos: [front + 0.02, 0.75, zz] }));
      g.add(mesh(rbox(0.018, 0.12, 0.012, 0.004), M.chrome, { pos: [front + 0.02, 0.5, zz + (i % 2 ? -1 : 1) * (dw / 2 - 0.05)] }));
    }
    // backsplash tiles
    const bs = canvas(512, 256), bg = bs.getContext('2d'); bg.fillStyle = '#e8eef0'; bg.fillRect(0, 0, 512, 256); bg.fillStyle = '#9fb0b8'; for (let i = 0; i <= 16; i++) { bg.fillRect(i * 32, 0, 2, 256); } for (let j = 0; j <= 8; j++) bg.fillRect(0, j * 32, 512, 2);
    for (let i = 0; i < 40; i++) { bg.fillStyle = `rgba(150,110,60,${Math.random() * 0.12})`; bg.beginPath(); bg.arc(Math.random() * 512, Math.random() * 256, 4 + Math.random() * 20, 0, 7); bg.fill(); }
    g.add(plane(c.d + 0.8, 0.55, this.M.subway || std({ map: tex(bs, { wrap: false }), roughness: 0.25, envMapIntensity: 1 }), { pos: [-c.w / 2 + 0.005, 1.2, -0.4], rot: [0, Math.PI / 2, 0] }));
    // open shelf above with jars + bowls
    g.add(mesh(rbox(0.26, 0.03, c.d - 0.1, 0.006), M.woodLight, { pos: [-c.w / 2 + 0.14, 1.65, 0] }));
    for (const zz of [-0.6, 0.6]) g.add(mesh(rbox(0.2, 0.12, 0.02, 0.004), M.darkSteel, { pos: [-c.w / 2 + 0.11, 1.58, zz] }));
    // stove: the old electric range when the CC0 models are present, else a tabletop gas stove
    const st = new THREE.Group(); g.add(st);
    if (this.old) st.position.set(F.stove.x - c.x + 0.12, F.stove.h - 0.1, F.stove.z - c.z); else st.position.set(0.02, 0.92, -0.35);
    if (!this.old) { st.add(mesh(rbox(0.42, 0.09, 0.62, 0.015), M.steel, { pos: [0, 0.045, 0] })); st.add(mesh(rbox(0.36, 0.006, 0.56, 0.003), M.black, { pos: [0, 0.093, 0] })); }
    this.burners = [];
    for (const zz of [-0.12, 0.12]) {
      const b = new THREE.Group(); b.position.set(-0.02, 0.1, zz); st.add(b);
      if (!this.old) {
        b.add(mesh(bcyl(0.045, 0.02, 0.004, 20), M.darkSteel), mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 24), M.black, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] }));
        for (let k = 0; k < 4; k++) b.add(mesh(rbox(0.16, 0.008, 0.012, 0.003), M.black, { pos: [0, 0.035, 0], rot: [0, k * Math.PI / 4, 0] }));
      }
      const flame = new THREE.Mesh(this.old ? new THREE.TorusGeometry(0.055, 0.008, 6, 28) : new THREE.TorusGeometry(0.04, 0.012, 6, 20),
        new THREE.MeshBasicMaterial({ color: this.old ? 0xff4a1a : 0x4f8cff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.rotation.x = Math.PI / 2; flame.position.y = 0.025; flame.visible = false; flame.layers.set(2); b.add(flame);
      b.userData.flame = flame; this.burners.push(b);
      const knob = mesh(bcyl(0.022, 0.03, 0.006, 16), M.black, { pos: [0.215, 0.045, zz], rot: [0, 0, -Math.PI / 2] }); if (!this.old) st.add(knob); b.userData.knob = knob;
    }
    this.reg('stove', st); this.hot(st, 'stove', 'Gas stove', 'stove');
    // sink + faucet
    const sk = new THREE.Group(); sk.position.set(0.0, 0.92, -1.05 - c.z); g.add(sk);
    sk.add(mesh(rbox(0.46, 0.02, 0.5, 0.01), M.steel, { pos: [0, 0.0, 0] }));
    sk.add(mesh(rbox(0.36, 0.005, 0.4, 0.002), std({ color: 0x3a3d40, roughness: 0.3, metalness: 0.8 }), { pos: [0, 0.012, 0] }));
    const faucet = group(mesh(bcyl(0.02, 0.05, 0.004, 14), M.chrome), mesh(tube([[0, 0.05, 0], [0, 0.26, 0], [0.04, 0.32, 0], [0.14, 0.3, 0], [0.16, 0.24, 0]], 0.012, 24, 8), M.chrome),
      mesh(rbox(0.06, 0.012, 0.016, 0.004), M.chrome, { pos: [0, 0.12, 0.03] }));
    faucet.position.set(-0.2, 0.01, 0); sk.add(faucet);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, roughness: 0.05 }));
    water.position.set(-0.04, 0.13, 0); water.visible = false; water.layers.set(2); sk.add(water); this.sinkWater = water;
    this.reg('sink', sk); this.hot(sk, 'sink', 'Sink', 'sink');
    // dish rack + kettle + pot
    const rack = group(mesh(rbox(0.28, 0.12, 0.18, 0.01), M.darkSteel, { pos: [0, 0.06, 0] })); rack.position.set(0.05, 0.92, -0.3); g.add(rack);
    for (let i = 0; i < 4; i++) rack.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20), M.white, { pos: [-0.08 + i * 0.05, 0.12, 0], rot: [0, 0, Math.PI / 2] }));
    // fridge ghost: clean rectangle in the grime, dangling plug, DTP seizure tape
    const gh = canvas(256, 256), gg = gh.getContext('2d'); gg.fillStyle = 'rgba(70,55,35,0.55)'; gg.fillRect(0, 0, 256, 256); gg.clearRect(18, 18, 220, 220);
    gg.strokeStyle = 'rgba(40,30,20,0.6)'; gg.lineWidth = 8; gg.strokeRect(18, 18, 220, 220);
    const ghostMat = new THREE.MeshBasicMaterial({ map: tex(gh, { wrap: false }), transparent: true, depthWrite: false });
    const ghost = mesh(new THREE.PlaneGeometry(F.fridgeGhost.w + 0.08, F.fridgeGhost.d + 0.08), ghostMat, { pos: [F.fridgeGhost.x, 0.002, F.fridgeGhost.z], rot: [-Math.PI / 2, 0, 0], shadow: false }); ghost.layers.set(2); s.add(ghost);
    s.add(mesh(rbox(0.012, 0.11, 0.075, 0.003), M.white, { pos: [x0 + 0.006, 0.38, F.fridgeGhost.z] }));
    s.add(mesh(tube([[x0 + 0.02, 0.38, F.fridgeGhost.z], [x0 + 0.08, 0.2, F.fridgeGhost.z + 0.05], [x0 + 0.12, 0.01, F.fridgeGhost.z - 0.1]], 0.006, 16, 6), M.black));
    const tape = labelTex('SEIZED BY DTP — DO NOT REMOVE', { bg: '#f2c400', fg: '#111', w: 512, h: 64, font: 'bold 28px "Special Elite", monospace' });
    s.add(plane(0.8, 0.1, std({ map: tape, roughness: 0.6 }), { pos: [x0 + 0.004, 1.1, F.fridgeGhost.z], rot: [0, Math.PI / 2, -0.12] }));
    s.add(plane(0.75, 0.1, std({ map: tape, roughness: 0.6 }), { pos: [x0 + 0.005, 1.0, F.fridgeGhost.z], rot: [0, Math.PI / 2, 0.15] }));
    this.hot(ghost, 'fridge', 'Where the fridge was', 'catBowl');
  }

  // ------------------------------------------------------------------ living room
  buildLiving() {
    const s = this.scene, M = this.M;
    // rug
    const rug = mesh(new THREE.PlaneGeometry(F.rug.w, F.rug.d), M.rug, { pos: [F.rug.x, 0.004, F.rug.z], rot: [-Math.PI / 2, 0, 0], shadow: false }); s.add(rug);
    // sofa (faces +x)
    const so = new THREE.Group(); so.position.set(F.sofa.x, 0, F.sofa.z); s.add(so);
    const L = F.sofa.d;
    so.add(mesh(rbox(0.82, 0.24, L, 0.03), M.sofa, { pos: [0.02, 0.22, 0] }));
    for (const zz of [-L / 2 + 0.08, L / 2 - 0.08]) so.add(mesh(rbox(0.84, 0.36, 0.16, 0.06), M.sofa, { pos: [0.02, 0.45, zz] }));
    so.add(mesh(rbox(0.2, 0.5, L - 0.12, 0.06), M.sofa, { pos: [-0.31, 0.6, 0] }));
    this.sofaCushions = [];
    for (const k of [-1, 1]) {
      const sc = mesh(rbox(0.58, 0.13, L / 2 - 0.12, 0.05, 3), M.sofa, { pos: [0.08, 0.41, k * (L / 4 - 0.04)] }); so.add(sc);
      const bc = mesh(rbox(0.16, 0.42, L / 2 - 0.14, 0.06, 3), M.sofa, { pos: [-0.17, 0.68, k * (L / 4 - 0.04)], rot: [0, 0, -0.18] }); so.add(bc);
      this.sofaCushions.push(sc, bc);
    }
    for (const [xx, zz] of [[0.36, -L / 2 + 0.06], [0.36, L / 2 - 0.06], [-0.32, -L / 2 + 0.06], [-0.32, L / 2 - 0.06]]) so.add(mesh(lathe([[0, 0], [0.025, 0], [0.018, 0.1], [0, 0.1]], 10), M.woodDark, { pos: [xx, 0, zz] }));
    // throw blanket draped over the back + a pillow
    const tg = new THREE.PlaneGeometry(0.7, 0.9, 10, 10), tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) { const u = tp.getX(i), v = tp.getY(i); tp.setZ(i, Math.sin(v * 9) * 0.01 + (u > 0 ? -Math.pow(u * 2.4, 2) * 0.25 : 0)); }
    tg.computeVertexNormals();
    so.add(mesh(tg, M.throw, { pos: [-0.12, 0.82, 0.45], rot: [-Math.PI / 2, 0, Math.PI / 2 + 0.06] }));
    const pillow = mesh(rbox(0.12, 0.34, 0.34, 0.06, 3), M.cushion, { pos: [0.1, 0.64, -0.62], rot: [0, 0, -0.3] }); so.add(pillow);
    this.reg('sofa', so); this.hot(so, 'sofa', 'Sofa', 'sofa');
    // the painting (gold frame, flame painting) above the sofa
    const pw = 0.72, ph = 0.9, pt = new THREE.Group();
    pt.add(mesh(new THREE.PlaneGeometry(pw, ph), std({ map: flamePainting(), roughness: 0.55, normalMap: normalMap('fabric', [2, 2]), normalScale: new THREE.Vector2(0.4, 0.4) }), { pos: [0, 0, 0.012] }));
    for (const [w, h, x, y] of [[pw + 0.12, 0.07, 0, ph / 2 + 0.03], [pw + 0.12, 0.07, 0, -ph / 2 - 0.03], [0.07, ph + 0.12, -pw / 2 - 0.03, 0], [0.07, ph + 0.12, pw / 2 + 0.03, 0]]) pt.add(mesh(rbox(w, h, 0.045, 0.012), M.gold, { pos: [x, y, 0.02] }));
    pt.position.set(x0 + 0.03, 1.66, F.sofa.z); pt.rotation.y = Math.PI / 2; s.add(pt);
    this.reg('painting', pt); this.paintingHome = { pos: pt.position.clone(), rot: pt.rotation.clone() };
    this.hot(pt, 'painting', 'The painting', 'sofa');
    s.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), M.chrome, { pos: [x0 + 0.015, 2.13, F.sofa.z], rot: [0, 0, Math.PI / 2] })); // hook
    // side table + pink radio (from the reference photo)
    const sd = new THREE.Group(); sd.position.set(F.sideTable.x, 0, F.sideTable.z); s.add(sd);
    sd.add(mesh(rbox(0.42, 0.04, 0.42, 0.01), M.woodDark, { pos: [0, 0.53, 0] }), mesh(rbox(0.38, 0.03, 0.38, 0.008), M.woodDark, { pos: [0, 0.18, 0] }));
    for (const [xx, zz] of [[0.18, 0.18], [-0.18, 0.18], [0.18, -0.18], [-0.18, -0.18]]) sd.add(mesh(rbox(0.03, 0.52, 0.03, 0.006), M.woodDark, { pos: [xx, 0.26, zz] }));
    const radio = new THREE.Group(); radio.position.set(0.02, 0.55, 0); radio.rotation.y = Math.PI / 2; sd.add(radio);
    radio.add(mesh(rbox(0.32, 0.17, 0.11, 0.025, 3), M.pink, { pos: [0, 0.085, 0] }));
    const grille = canvas(128, 128), gr = grille.getContext('2d'); gr.fillStyle = '#d05a8a'; gr.fillRect(0, 0, 128, 128); gr.fillStyle = '#5a1c34'; for (let y = 6; y < 128; y += 9) for (let x = 6; x < 128; x += 9) { gr.beginPath(); gr.arc(x, y, 2.4, 0, 7); gr.fill(); }
    radio.add(mesh(new THREE.CircleGeometry(0.06, 24), std({ map: tex(grille, { wrap: false }), roughness: 0.5 }), { pos: [-0.075, 0.085, 0.056] }));
    radio.add(mesh(rbox(0.11, 0.04, 0.01, 0.004), std({ color: 0xf2e7c4, emissive: 0x6a4a10, emissiveIntensity: 0.4 }), { pos: [0.075, 0.11, 0.056] }));
    radio.add(mesh(bcyl(0.014, 0.015, 0.003, 14), M.chrome, { pos: [0.05, 0.055, 0.056], rot: [Math.PI / 2, 0, 0] }), mesh(bcyl(0.014, 0.015, 0.003, 14), M.chrome, { pos: [0.1, 0.055, 0.056], rot: [Math.PI / 2, 0, 0] }));
    radio.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.34, 6), M.chrome, { pos: [0.12, 0.33, -0.02], rot: [0, 0, -0.35] }));
    radio.add(mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 20, Math.PI), M.chrome, { pos: [0, 0.17, 0] }));
    this.reg('radio', radio); this.hot(radio, 'radio', 'Pink radio', 'radio');
    // coffee table
    const ct = new THREE.Group(); ct.position.set(F.coffeeTable.x, 0, F.coffeeTable.z); s.add(ct);
    ct.add(mesh(rbox(F.coffeeTable.w, 0.045, F.coffeeTable.d, 0.012), M.wood, { pos: [0, 0.4, 0] }), mesh(rbox(F.coffeeTable.w - 0.08, 0.025, F.coffeeTable.d - 0.08, 0.006), M.wood, { pos: [0, 0.12, 0] }));
    for (const [xx, zz] of [[0.23, 0.45], [-0.23, 0.45], [0.23, -0.45], [-0.23, -0.45]]) ct.add(mesh(lathe([[0.022, 0], [0.026, 0.04], [0.018, 0.2], [0.024, 0.378], [0, 0.38]], 10), M.wood, { pos: [xx, 0, zz] }));
    this.reg('coffeeTable', ct); this.hot(ct, 'coffeeTable', 'Coffee table', 'sofa');
    // TV on a low cabinet facing the sofa (screen canvas)
    const tv = new THREE.Group(); tv.position.set(F.tv.x, 0, F.tv.z); tv.rotation.y = F.tv.yaw; s.add(tv);
    tv.add(mesh(rbox(0.9, 0.45, 0.42, 0.015), M.woodDark, { pos: [0, 0.225, 0] }));
    for (const xx of [-0.22, 0.22]) tv.add(mesh(rbox(0.4, 0.35, 0.012, 0.005), M.woodDark, { pos: [xx, 0.23, 0.21] }), mesh(new THREE.SphereGeometry(0.012, 10, 8), M.gold, { pos: [xx + (xx < 0 ? 0.15 : -0.15), 0.25, 0.225] }));
    const tvBody = group(mesh(rbox(0.5, 0.4, 0.36, 0.035, 3), std({ color: 0x2b2a28, roughness: 0.45 }), { pos: [0, 0.2, -0.03] }), mesh(rbox(0.36, 0.3, 0.2, 0.06), std({ color: 0x2b2a28, roughness: 0.45 }), { pos: [0, 0.2, -0.24] }));
    tvBody.position.y = 0.45; tv.add(tvBody); this.tvBody = tvBody;
    this.tvCanvas = canvas(320, 240); this.tvTex = tex(this.tvCanvas, { wrap: false });
    const screenGeo = new THREE.PlaneGeometry(0.4, 0.3, 8, 6); { const p = screenGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -(p.getX(i) ** 2 + p.getY(i) ** 2) * 0.25); }
    this.tvMat = new THREE.MeshStandardMaterial({ map: this.tvTex, emissive: 0xffffff, emissiveMap: this.tvTex, emissiveIntensity: 0, roughness: 0.15, color: 0x111111 });
    const scr = mesh(screenGeo, this.tvMat, { pos: [0, 0.2, 0.155], shadow: false }); tvBody.add(scr);
    tvBody.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 6), M.chrome, { pos: [-0.1, 0.55, -0.1], rot: [0.2, 0, 0.5] }), mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 6), M.chrome, { pos: [0.1, 0.55, -0.1], rot: [0.2, 0, -0.5] }));
    this.reg('tv', tv); this.hot(tv, 'tv', 'Television', 'tv');
    this.tv = { show: (mode) => { this.tvMode = mode; this.tvMat.emissiveIntensity = mode === 'off' ? 0 : 1.25; this.tvMat.color.set(mode === 'off' ? 0x111111 : 0x000000); } };
    // floor lamp
    const lp = new THREE.Group(); lp.position.set(F.lamp.x, 0, F.lamp.z); s.add(lp);
    lp.add(mesh(lathe([[0, 0], [0.16, 0], [0.16, 0.02], [0.03, 0.05], [0, 0.05]], 24), M.darkSteel), mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.45, 8), M.darkSteel, { pos: [0, 0.75, 0] }));
    const shade = mesh(lathe([[0.1, 0], [0.21, -0.3], [0.2, -0.31]], 28), std({ color: 0xf0dfb8, emissive: 0xffb860, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.9 }), { pos: [0, 1.72, 0] }); lp.add(shade);
    this.lampShade = shade; this.reg('floorLamp', lp); this.hot(lp, 'floorLamp', 'Floor lamp', 'sofa');
  }

  // ------------------------------------------------------------------ computer desk
  buildDesk() {
    const s = this.scene, M = this.M, d = F.desk, g = new THREE.Group();
    g.position.set(d.x, 0, d.z); s.add(g);
    g.add(mesh(rbox(d.w, 0.035, d.d, 0.008), M.woodLight, { pos: [0, d.h, 0] }));
    g.add(mesh(rbox(d.w - 0.06, 0.68, 0.42, 0.01), M.woodLight, { pos: [0, 0.36, -d.d / 2 + 0.22] }));
    for (let i = 0; i < 3; i++) { g.add(mesh(rbox(0.02, 0.2, 0.38, 0.005), M.woodLight, { pos: [-d.w / 2 + 0.02, 0.15 + i * 0.22, -d.d / 2 + 0.22] })); g.add(mesh(rbox(0.015, 0.012, 0.1, 0.004), M.chrome, { pos: [-d.w / 2 + 0.003, 0.2 + i * 0.22, -d.d / 2 + 0.22] })); }
    for (const zz of [d.d / 2 - 0.04]) for (const xx of [-d.w / 2 + 0.04, d.w / 2 - 0.04]) g.add(mesh(rbox(0.04, d.h, 0.04, 0.008), M.woodLight, { pos: [xx, d.h / 2, zz] }));
    // CRT monitor (faces -x)
    const mon = new THREE.Group(); mon.position.set(0.05, d.h + 0.02, 0.05); mon.rotation.y = -Math.PI / 2; g.add(mon);
    mon.add(mesh(rbox(0.22, 0.03, 0.2, 0.008), M.beige, { pos: [0, 0.015, -0.05] }), mesh(rbox(0.08, 0.06, 0.08, 0.01), M.beige, { pos: [0, 0.05, -0.05] }));
    const shellTop = new THREE.Group(); shellTop.position.y = 0.08; mon.add(shellTop);
    shellTop.add(mesh(rbox(0.44, 0.38, 0.06, 0.02), M.beige, { pos: [0, 0.19, 0.03] }));
    shellTop.add(mesh(rbox(0.38, 0.32, 0.3, 0.05), M.beige, { pos: [0, 0.18, -0.15] }));
    shellTop.add(mesh(rbox(0.26, 0.22, 0.12, 0.04), M.beige, { pos: [0, 0.17, -0.34] }));
    for (let i = 0; i < 6; i++) shellTop.add(mesh(rbox(0.2, 0.006, 0.004, 0.001), M.black, { pos: [0, 0.3 + i * 0.008 - 0.02, -0.33 + 0.07] }));
    shellTop.add(mesh(rbox(0.02, 0.012, 0.004, 0.002), std({ color: 0x40ff60, emissive: 0x30ff50, emissiveIntensity: 2 }), { pos: [0.17, 0.03, 0.062] }));
    shellTop.add(mesh(rbox(0.06, 0.012, 0.004, 0.002), labelTexMat('PANORAMA', '#d9cfb4', '#444'), { pos: [-0.13, 0.03, 0.062] }));
    this.monCanvas = canvas(400, 300); this.monTex = tex(this.monCanvas, { wrap: false }); this.monTex.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.PlaneGeometry(0.36, 0.27, 10, 8); { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -(p.getX(i) ** 2 + p.getY(i) ** 2) * 0.3); }
    this.monMat = new THREE.MeshStandardMaterial({ map: this.monTex, emissive: 0xffffff, emissiveMap: this.monTex, emissiveIntensity: 1.1, roughness: 0.12, color: 0x000000, envMapIntensity: 0.6 });
    const scr = mesh(sg, this.monMat, { pos: [0, 0.2, 0.062], shadow: false }); shellTop.add(scr);
    this.monitorScreen = scr; this.reg('monitor', mon); this.hot(mon, 'computer', 'Computer', 'desk');
    // PC tower under the desk (right side), keyboard, mouse, phone, lamp, LED clock, speaker
    const pc = group(mesh(rbox(0.2, 0.42, 0.45, 0.012), M.beige, { pos: [0, 0.21, 0] }), mesh(rbox(0.004, 0.02, 0.14, 0.002), M.black, { pos: [-0.101, 0.34, 0.05] }),
      mesh(new THREE.CircleGeometry(0.012, 12), std({ color: 0x40ff60, emissive: 0x30ff50, emissiveIntensity: 2 }), { pos: [-0.101, 0.1, 0.12], rot: [0, -Math.PI / 2, 0] }));
    pc.position.set(0.1, 0, d.d / 2 - 0.3); g.add(pc);
    const kb = new THREE.Group(); kb.position.set(-0.17, d.h + 0.02, 0.05); kb.rotation.y = -Math.PI / 2; g.add(kb);
    const keys = canvas(256, 96), kg = keys.getContext('2d'); kg.fillStyle = '#cfc6ad'; kg.fillRect(0, 0, 256, 96); kg.fillStyle = '#e8e1cc'; for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) kg.fillRect(4 + c * 16.6, 4 + r * 18, 14, 15);
    kb.add(mesh(rbox(0.44, 0.025, 0.16, 0.008), M.beige), mesh(new THREE.PlaneGeometry(0.42, 0.14), std({ map: tex(keys, { wrap: false }), roughness: 0.6 }), { pos: [0, 0.0135, 0], rot: [-Math.PI / 2, 0, 0] }));
    this.reg('keyboard', kb);
    g.add(mesh(rbox(0.06, 0.03, 0.1, 0.02, 3), M.beige, { pos: [-0.15, d.h + 0.03, -0.27] }));
    // landline phone (rings during the shift)
    const ph = new THREE.Group(); ph.position.set(-0.05, d.h + 0.02, 0.5); ph.rotation.y = -Math.PI / 2; g.add(ph);
    ph.add(mesh(rbox(0.2, 0.06, 0.16, 0.02, 3), std({ color: 0xb3261e, roughness: 0.35 }), { pos: [0, 0.03, 0] }));
    const handset = group(mesh(rbox(0.2, 0.035, 0.05, 0.016, 3), std({ color: 0xb3261e, roughness: 0.35 })), mesh(bcyl(0.028, 0.03, 0.006, 14), std({ color: 0xb3261e, roughness: 0.35 }), { pos: [-0.085, -0.02, 0], rot: [0, 0, 0] }), mesh(bcyl(0.028, 0.03, 0.006, 14), std({ color: 0xb3261e, roughness: 0.35 }), { pos: [0.085, -0.02, 0] }));
    handset.position.set(0, 0.085, 0); ph.add(handset); this.handset = handset;
    const dial = canvas(64), dg = dial.getContext('2d'); dg.fillStyle = '#eee'; dg.fillRect(0, 0, 64, 64); dg.fillStyle = '#222'; for (let i = 0; i < 12; i++) dg.fillRect(8 + (i % 3) * 18, 8 + Math.floor(i / 3) * 13, 12, 9);
    ph.add(mesh(new THREE.PlaneGeometry(0.08, 0.07), std({ map: tex(dial, { wrap: false }) }), { pos: [0, 0.061, 0.04], rot: [-Math.PI / 2 + 0.3, 0, 0] }));
    this.phoneLed = mesh(new THREE.SphereGeometry(0.008, 8, 6), std({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0 }), { pos: [0.08, 0.065, 0.06] }); ph.add(this.phoneLed);
    this.reg('phone', ph); this.hot(ph, 'phone', 'Hotline phone', 'desk');
    // desk lamp
    const dl = new THREE.Group(); dl.position.set(0.15, d.h + 0.02, -0.5); g.add(dl);
    dl.add(mesh(lathe([[0, 0], [0.08, 0], [0.08, 0.015], [0, 0.02]], 20), M.darkSteel), mesh(tube([[0, 0.02, 0], [0, 0.3, 0.02], [-0.18, 0.42, 0.05]], 0.008, 16, 6), M.darkSteel));
    const dlShade = mesh(lathe([[0.02, 0], [0.07, -0.09], [0.068, -0.095]], 20), std({ color: 0x2a5a3a, roughness: 0.4, side: THREE.DoubleSide }), { pos: [-0.18, 0.43, 0.05], rot: [0, 0, 0.5] }); dl.add(dlShade);
    this.reg('deskLamp', dl);
    // red LED clock (like the reference "20:06")
    const clk = new THREE.Group(); clk.position.set(0.22, d.h + 0.02, 0.3); clk.rotation.y = -Math.PI / 2; g.add(clk);
    clk.add(mesh(rbox(0.18, 0.07, 0.06, 0.012), M.black, { pos: [0, 0.035, 0] }));
    this.clockCanvas = canvas(128, 48); this.clockTex = tex(this.clockCanvas, { wrap: false });
    clk.add(mesh(new THREE.PlaneGeometry(0.16, 0.055), new THREE.MeshStandardMaterial({ map: this.clockTex, emissive: 0xffffff, emissiveMap: this.clockTex, emissiveIntensity: 1.5, color: 0x000000 }), { pos: [0, 0.036, 0.031] }));
    this.reg('clock', clk);
    // mug, sticky notes, cat photo
    g.add(mesh(lathe([[0, 0], [0.038, 0], [0.04, 0.09], [0.036, 0.09], [0.034, 0.005], [0, 0.005]], 18), std({ color: 0xf2efe6, roughness: 0.3 }), { pos: [-0.2, d.h + 0.02, -0.4] }));
    for (let i = 0; i < 3; i++) g.add(plane(0.07, 0.07, std({ color: [0xf9ec9a, 0xf7b3c6, 0xa8e0c8][i], roughness: 0.9 }), { pos: [-d.w / 2 + 0.35, 1.0 + i * 0.03, -0.05 + i * 0.09], rot: [0, -Math.PI / 2, (i - 1) * 0.1] }));
    // office chair
    const ch = new THREE.Group(); ch.position.set(F.chair.x, 0, F.chair.z); ch.rotation.y = Math.PI / 2; s.add(ch);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ch.add(mesh(rbox(0.3, 0.03, 0.04, 0.01), M.black, { pos: [Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14], rot: [0, -a, 0] }), mesh(new THREE.SphereGeometry(0.025, 10, 8), M.black, { pos: [Math.cos(a) * 0.28, 0.025, Math.sin(a) * 0.28] })); }
    ch.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 10), M.chrome, { pos: [0, 0.25, 0] }));
    ch.add(mesh(rbox(0.48, 0.08, 0.46, 0.035, 3), std({ map: T.fabric('#3a3f4a', 'weave', 'ch'), roughness: 0.9 }), { pos: [0, 0.46, 0] }));
    ch.add(mesh(rbox(0.44, 0.48, 0.07, 0.035, 3), std({ map: T.fabric('#3a3f4a', 'weave', 'ch'), roughness: 0.9 }), { pos: [0, 0.78, -0.24], rot: [-0.12, 0, 0] }));
    this.reg('chair', ch);
    // wall: LIFELINE poster + calendar
    s.add(plane(0.36, 0.5, std({ map: poster('lifeline'), roughness: 0.8 }), { pos: [x1 - 0.004, 1.65, -1.15], rot: [0, -Math.PI / 2, 0] }));
    const cal = canvas(256, 320), cg = cal.getContext('2d'); cg.fillStyle = '#fbf7ee'; cg.fillRect(0, 0, 256, 320); cg.fillStyle = '#c8302a'; cg.fillRect(0, 0, 256, 60); cg.fillStyle = '#fff'; cg.font = 'bold 34px Spectral'; cg.textAlign = 'center'; cg.fillText('OCTOBER', 128, 42);
    cg.fillStyle = '#333'; cg.font = '16px Spectral'; for (let i = 0; i < 31; i++) cg.fillText(String(i + 1), 26 + (i % 7) * 34, 90 + Math.floor(i / 7) * 44);
    cg.strokeStyle = '#c8302a'; cg.lineWidth = 4; cg.beginPath(); cg.arc(26 + 2 * 34, 85 + 4 * 44, 16, 0, 7); cg.stroke(); cg.font = 'bold 18px Caveat'; cg.fillStyle = '#c8302a'; cg.fillText('DUE?!', 26 + 2 * 34, 115 + 4 * 44);
    s.add(plane(0.3, 0.38, std({ map: tex(cal, { wrap: false }), roughness: 0.85 }), { pos: [x1 - 0.004, 1.55, 0.15], rot: [0, -Math.PI / 2, 0] }));
  }

  // ------------------------------------------------------------------ the noodle shelf (metal rack)
  buildShelf() {
    const s = this.scene, M = this.M, f = F.shelf, g = new THREE.Group();
    g.position.set(f.x, 0, f.z); s.add(g);
    for (const xx of [-f.w / 2 + 0.015, f.w / 2 - 0.015]) for (const zz of [-f.d / 2 + 0.015, f.d / 2 - 0.015]) g.add(mesh(rbox(0.028, f.h, 0.028, 0.006), M.steel, { pos: [xx, f.h / 2, zz] }));
    this.shelfLevels = [0.12, 0.55, 0.98, 1.41, 1.82];
    for (const y of this.shelfLevels) {
      g.add(mesh(rbox(f.w, 0.018, f.d, 0.004), M.steel, { pos: [0, y, 0] }));
      g.add(mesh(rbox(f.w, 0.03, 0.01, 0.003), M.steel, { pos: [0, y + 0.015, f.d / 2] }));
    }
    // slots: 3 front positions × 4 levels (upper four)
    this.slots = [];
    for (let li = 0; li < 4; li++) for (let k = 0; k < 4; k++) {
      const p = new THREE.Vector3(f.x - f.w / 2 + 0.13 + k * 0.22, this.shelfLevels[li + 1] + 0.01, f.z + 0.02);
      this.slots.push({ pos: p, item: null, level: li });
    }
    this.reg('shelf', g); this.hot(g, 'shelf', 'Noodle shelf', 'shelf');
    // wedding photo + toy alien on top
    const wp = group(mesh(rbox(0.2, 0.25, 0.02, 0.006), M.gold, { pos: [0, 0.125, 0] }), mesh(new THREE.PlaneGeometry(0.17, 0.215), std({ map: weddingPhoto(), roughness: 0.4 }), { pos: [0, 0.125, 0.011] }));
    wp.position.set(f.x - 0.25, 1.83, f.z + 0.05); wp.rotation.set(-0.12, 0.2, 0); s.add(wp); this.reg('weddingPhoto', wp);
    this.hot(wp, 'weddingPhoto', 'Wedding photo', 'shelf');
  }

  // ------------------------------------------------------------------ crib (and its flat-pack box)
  buildCrib() {
    const s = this.scene, M = this.M, c = F.crib;
    const crib = new THREE.Group(); crib.position.set(c.x, 0, c.z); s.add(crib);
    const wood = std({ map: T.wood('#e9d9bd', '#c5ab84', 'crib'), roughness: 0.5 });
    for (const xx of [-c.w / 2, c.w / 2]) for (const zz of [-c.d / 2, c.d / 2]) crib.add(mesh(rbox(0.05, 0.95, 0.05, 0.012), wood, { pos: [xx, 0.475, zz] }));
    for (const yy of [0.25, 0.9]) { for (const zz of [-c.d / 2, c.d / 2]) crib.add(mesh(rbox(c.w, 0.04, 0.035, 0.01), wood, { pos: [0, yy, zz] })); for (const xx of [-c.w / 2, c.w / 2]) crib.add(mesh(rbox(0.035, 0.04, c.d, 0.01), wood, { pos: [xx, yy, 0] })); }
    for (let i = 1; i < 14; i++) for (const zz of [-c.d / 2, c.d / 2]) crib.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.64, 8), wood, { pos: [-c.w / 2 + i * c.w / 14, 0.575, zz] }));
    for (let i = 1; i < 7; i++) for (const xx of [-c.w / 2, c.w / 2]) crib.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.64, 8), wood, { pos: [xx, 0.575, -c.d / 2 + i * c.d / 7] }));
    crib.add(mesh(rbox(c.w - 0.06, 0.1, c.d - 0.06, 0.04, 3), std({ map: T.fabric('#bfe3ff', 'check', 'mat'), roughness: 0.9 }), { pos: [0, 0.32, 0] }));
    // space mobile: planets + a tiny saucer
    const mob = new THREE.Group(); mob.position.set(0, 1.55, 0); crib.add(mob);
    mob.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), M.chrome, { pos: [0.25, -0.05, 0], rot: [0, 0, 0.6] }));
    const arms = new THREE.Group(); arms.position.set(0, -0.2, 0); mob.add(arms);
    const cols = [0xf2c14e, 0x7ad6ff, 0xff8fb3, 0x8dffb4];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; arms.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.2, 4), M.chrome, { pos: [Math.cos(a) * 0.13, -0.1, Math.sin(a) * 0.13] })); arms.add(mesh(i === 3 ? new THREE.SphereGeometry(0.04, 16, 8) : new THREE.SphereGeometry(0.03, 16, 12), std({ color: cols[i], roughness: 0.4, emissive: cols[i], emissiveIntensity: 0.15 }), { pos: [Math.cos(a) * 0.13, -0.22, Math.sin(a) * 0.13], scale: i === 3 ? [1, 0.35, 1] : 1 })); }
    arms.add(mesh(rbox(0.3, 0.008, 0.008, 0.002), M.chrome), mesh(rbox(0.008, 0.008, 0.3, 0.002), M.chrome));
    this.mobile = arms;
    this.reg('crib', crib); this.hot(crib, 'crib', 'Crib', 'crib');
    crib.visible = false;
    // flat-pack box
    const box = group(mesh(rbox(1.1, 0.16, 0.6, 0.01), M.cardboard, { pos: [0, 0.08, 0] }), plane(0.6, 0.12, std({ map: labelTex('CRIB DELUXE', { bg: '#b8915e', fg: '#2a1a08', w: 512, h: 96, font: 'bold 50px "Big Shoulders Stencil", sans-serif', sub: 'some assembly required (all of it)' }), roughness: 0.9 }), { pos: [0, 0.161, 0], rot: [-Math.PI / 2, 0, 0] }));
    box.position.set(c.x - 0.05, 0, c.z + 0.2); box.rotation.y = 0.15; s.add(box);
    this.reg('cribBox', box); this.hot(box, 'cribBox', 'Flat-pack crib', 'crib');
  }

  // ------------------------------------------------------------------ decor, fairy lights, small things
  buildDecor() {
    const s = this.scene, M = this.M, W = OPENINGS.window;
    // fairy lights along the window top + down the curtain side (reference: warm fairy lights)
    const pts = [];
    for (let i = 0; i <= 36; i++) { const u = i / 36; pts.push(new THREE.Vector3(lerp(W.x0 - 0.5, W.x1 + 0.5, u), W.y1 + 0.2 - Math.sin(u * Math.PI * 4) ** 2 * 0.07, z0 + 0.06)); }
    for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector3(W.x1 + 0.5 - Math.sin(i) * 0.02, W.y1 + 0.2 - i * 0.12, z0 + 0.06 + Math.sin(i * 1.7) * 0.02));
    const curve = new THREE.CatmullRomCurve3(pts);
    s.add(mesh(new THREE.TubeGeometry(curve, 120, 0.0025, 5), M.black, { shadow: false }));
    const n = 70, inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc06a, emissiveIntensity: 4 }), n);
    const m4 = new THREE.Matrix4(); for (let i = 0; i < n; i++) { const p = curve.getPoint(i / (n - 1)); m4.makeTranslation(p.x, p.y - 0.012, p.z); inst.setMatrixAt(i, m4); }
    inst.layers.set(2); s.add(inst); this.fairy = inst; this.fairyCurve = curve;
    this.hot(inst, 'fairy', 'Fairy lights', 'window');
    // ceiling pendant (cord + shade + bulb), visible from the dollhouse view
    const pend = group(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.55, 6), M.black, { pos: [0, -0.275, 0], shadow: false }),
      mesh(lathe([[0.03, 0], [0.04, -0.03], [0.18, -0.14], [0.175, -0.145]], 28), std({ color: 0xd9a441, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }), { pos: [0, -0.55, 0], shadow: false }),
      mesh(new THREE.SphereGeometry(0.04, 12, 10), this.M.bulb, { pos: [0, -0.63, 0], shadow: false }));
    pend.position.set(0, H, 0.2); s.add(pend); this.pendant = pend;
    // plant by the window
    const pl = new THREE.Group(); pl.position.set(F.plant.x, 0, F.plant.z); s.add(pl);
    pl.add(mesh(lathe([[0.1, 0], [0.13, 0.25], [0.14, 0.26], [0.12, 0.26], [0, 0.24]], 18), std({ color: 0xb4532a, roughness: 0.8 })));
    const leafMat = std({ color: 0x3f7a3a, roughness: 0.6, side: THREE.DoubleSide }); const r = rng(5);
    for (let i = 0; i < 14; i++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI), leafMat); lf.scale.set(0.35, 1, 0.08); const a = r() * Math.PI * 2; lf.position.set(Math.cos(a) * 0.05, 0.4 + r() * 0.3, Math.sin(a) * 0.05); lf.rotation.set(r() - 0.5, a, (r() - 0.5) * 1.2); lf.castShadow = true; pl.add(lf); }
    // movie poster on the back wall near the bathroom door
    s.add(plane(0.4, 0.57, std({ map: poster('movie'), roughness: 0.75 }), { pos: [-1.0 - 0.95, 1.45, z0 + 0.004] }));
    // cat bowl + empty cat bed
    const bowl = group(mesh(lathe([[0, 0], [0.07, 0], [0.09, 0.05], [0.08, 0.05], [0.06, 0.015], [0, 0.015]], 20), std({ color: 0x3a8fd6, roughness: 0.3 })));
    bowl.position.set(-2.4, 0, -0.25); s.add(bowl); this.reg('catBowl', bowl);
    const bed = group(mesh(new THREE.TorusGeometry(0.2, 0.07, 10, 24), std({ map: T.fabric('#c98a6a', 'weave', 'bed'), roughness: 1 }), { rot: [Math.PI / 2, 0, 0], pos: [0, 0.06, 0] }), mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), std({ color: 0xead5bf, roughness: 1 }), { pos: [0, 0.02, 0] }));
    bed.position.set(0.9, 0, -1.7); s.add(bed); this.reg('catBed', bed); this.hot(bed, 'catBed', "Mr. Tofu's bed", 'window');
    // shoe mat + slippers by the door, trash bin
    s.add(mesh(rbox(0.5, 0.012, 0.8, 0.004), std({ color: 0x6a5a3a, normalMap: normalMap('fabric', [4, 4]), roughness: 1 }), { pos: [2.85, 0.006, 1.3] }));
    const bin = group(mesh(lathe([[0, 0], [0.13, 0], [0.15, 0.36], [0.155, 0.36], [0.15, 0.355], [0, 0.35]], 20), std({ color: 0x2f6f8f, roughness: 0.4, side: THREE.DoubleSide })));
    bin.position.set(-2.95, 0, -0.85); s.add(bin); this.reg('bin', bin); this.hot(bin, 'bin', 'Trash bin', 'sink');
    // light switch + outlets
    s.add(mesh(rbox(0.012, 0.11, 0.075, 0.004), M.white, { pos: [x1 - 0.006, 1.25, 0.7] }));
  }

  // ------------------------------------------------------------------ the old game's CC0 furniture
  // Swaps procedural pieces for the Poly Haven models (faces +Z by default) and dresses the room.
  useOldFurniture() {
    const s = this.scene;
    const put = (name, opts, parent = s, hot = null) => { const m = oldModel(name, opts); if (!m) return null; parent.add(m); if (hot) m.traverse((o) => { o.userData.hot = hot; }); return m; };
    const swap = (group, name, opts) => { if (!group) return null; const hot = group.children[0]?.userData.hot; for (const c of group.children) c.visible = false; const m = oldModel(name, opts); if (!m) { for (const c of group.children) c.visible = true; return null; } if (hot) m.traverse((o) => { o.userData.hot = hot; }); group.add(m); return m; };
    // sofa + throw pillows
    const sofa = this.prop('sofa'); swap(sofa, 'sofa', { fit: 1.95, yaw: Math.PI / 2, pos: [0.08, 0, 0] });
    this.sofaCushions = [put('pillows', { fit: 0.9, yaw: Math.PI / 2, pos: [0.05, 0.42, 0.1] }, sofa, sofa.children[0]?.userData.hot)].filter(Boolean);
    // electric stove (oven door toward the room)
    put('stove', { pos: [F.stove.x + 0.04, 0, F.stove.z], yaw: Math.PI / 2, scale: [1.0, 1.0, 0.9] }, s, { name: 'stove', label: 'Stove', spot: 'stove' });
    put('kettle', { fit: 0.24, pos: [F.stove.x + 0.08, F.stove.h, F.stove.z + 0.13], yaw: Math.PI / 2 });
    put('microwave', { fit: 0.48, pos: [-2.98, 0.92, -0.85], yaw: Math.PI / 2 });
    put('jug', { fit: 0.14, pos: [-2.75, 0.92, -1.4] });
    put('bottles', { fit: 0.22, pos: [-3.02, 1.67, -1.2] });
    put('cleaner', { height: 0.26, pos: [-2.72, 0.92, -0.78], yaw: 0.6 });
    put('fluoro', { fit: 0.9, pos: [x0 + 0.08, 1.95, -1.4], yaw: Math.PI / 2 });
    // TV on the carved stand, armchair facing the TV, coffee table stays
    const tv = this.prop('tv'); if (tv) { const body = this.tvBody; for (const c of tv.children) if (c !== body) c.visible = false; const st = put('tvStand', { fit: 0.62, yaw: 0, pos: [0, 0, 0] }, tv, body.children[0]?.userData.hot); if (st) body.position.y = st.userData.size.y; }
    put('armchair', { fit: 0.85, pos: [-1.85, 0, 2.1], yaw: Math.PI });
    put('basket', { fit: 0.42, pos: [-2.85, 0, 2.15] }, s, { name: 'basket', label: 'Laundry basket', spot: 'sofa' });
    // desk: metal office desk, painted chair, arm desk lamp
    const desk = this.prop('monitor')?.parent;
    if (desk) {
      for (const c of desk.children) if (!['monitor', 'keyboard', 'phone', 'deskLamp', 'clock'].includes(c.name) && c.isMesh) c.visible = false;
      put('desk', { scale: [0.7, 0.94, 0.7], yaw: -Math.PI / 2, pos: [0.0, 0, 0] }, desk);
      const dl = this.prop('deskLamp'); if (dl) { dl.visible = false; put('deskLamp', { height: 0.5, pos: [0.15, F.desk.h, -0.5], yaw: -Math.PI / 2 - 0.4 }, desk); }
    }
    const ch = this.prop('chair'); if (ch) swap(ch, 'chair', { fit: 0.52, yaw: Math.PI });
    // ceiling fan instead of the pendant (it spins), wall clock, plants, bin, commode, Gary's suitcase
    this.fan = put('fan', { fit: 1.1, pos: [0, H - 0.45, 0.2] }); if (this.fan) { this.fan.position.y = H - this.fan.userData.size.y; this.pendant.visible = false; }
    this.wallClock = put('wallClock', { fit: 0.32, pos: [x1 - 0.03, 1.95, -0.55], yaw: -Math.PI / 2 });
    const pl = this.prop('plant'); put('plantBig', { height: 1.1, pos: [F.plant.x, 0, F.plant.z] });
    put('plant', { height: 0.35, pos: [F.desk.x - 0.15, F.desk.h, F.desk.z + 0.62] });
    const bin = this.prop('bin'); swap(bin, 'trashCan', { height: 0.5, scale: undefined });
    put('commode', { fit: 0.9, pos: [x1 - 0.3, 0, 2.05], yaw: -Math.PI / 2 });
    put('suitcase', { fit: 0.6, pos: [2.3, 0, 2.1], yaw: 0.3 }, s, { name: 'suitcase', label: "Gary's suitcase", spot: 'door' });
    put('alarmClock', { fit: 0.12, pos: [F.sideTable.x + 0.12, 0.55, F.sideTable.z - 0.12], yaw: Math.PI / 2 });
    put('wallLamp', { fit: 0.3, pos: [x1 - 0.05, 1.9, 0.55], yaw: -Math.PI / 2 });
    put('dustpan', { fit: 0.3, pos: [-2.7, 0, -0.62], yaw: 1.2 });
    // the DTP security camera appears later in the week
    this.dtpCamera = put('camera', { fit: 0.3, pos: [x1 - 0.15, H - 0.2, z0 + 0.15], yaw: -Math.PI * 0.75 }); if (this.dtpCamera) this.dtpCamera.visible = false;
    // carpet rug
    if (this.M.rugMat) { const rug = this.scene.children.find((o) => o.geometry?.parameters?.width === F.rug.w); if (rug) rug.material = this.M.rugMat; }
  }

  // ------------------------------------------------------------------ lights
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x9fb0d8, 0x40302a, 0.5); s.add(this.hemi);
    const ceil = this.ceilLight = new THREE.SpotLight(0xffc98a, 30, 9, 1.25, 0.85, 1.6);
    ceil.position.set(0, H - 0.6, 0.2); ceil.target.position.set(0, 0, 0.2); ceil.castShadow = true; ceil.shadow.mapSize.set(2048, 2048); ceil.shadow.bias = -0.0004; ceil.shadow.normalBias = 0.03; ceil.shadow.camera.near = 0.2; ceil.shadow.camera.far = 6;
    s.add(ceil, ceil.target);
    this.ceilFill = new THREE.PointLight(0xffc98a, 3, 6, 1.5); this.ceilFill.position.set(0, H - 0.7, 0.2); s.add(this.ceilFill);
    this.floorLight = new THREE.PointLight(0xffb060, 4, 4, 1.6); this.floorLight.position.set(F.lamp.x, 1.55, F.lamp.z); s.add(this.floorLight);
    this.deskLight = new THREE.SpotLight(0xffe0b0, 6, 2.5, 0.8, 0.6, 1.5); this.deskLight.position.set(F.desk.x - 0.05, 1.18, F.desk.z - 0.45); this.deskLight.target.position.set(F.desk.x - 0.1, 0.7, F.desk.z - 0.1); s.add(this.deskLight, this.deskLight.target);
    this.tvLight = new THREE.PointLight(0x7aa8ff, 0, 3.5, 1.8); this.tvLight.position.set(F.tv.x - 0.4, 0.75, F.tv.z); s.add(this.tvLight);
    this.monLight = new THREE.PointLight(0x9fc8ff, 1.2, 2.2, 1.8); this.monLight.position.set(F.desk.x - 0.35, 1.05, F.desk.z + 0.05); s.add(this.monLight);
    this.fairyLight = new THREE.PointLight(0xffb870, 2.2, 3.5, 1.6); this.fairyLight.position.set(-0.3, 2.3, z0 + 0.3); s.add(this.fairyLight);
    // window light: moon/city at night, sun by day
    const win = this.winLight = new THREE.DirectionalLight(0x8fb0ff, 0.8); win.position.set(-1.5, 6, -9); win.target.position.set(0.5, 0, 0.5);
    win.castShadow = true; win.shadow.mapSize.set(1024, 1024); win.shadow.camera.left = -4; win.shadow.camera.right = 4; win.shadow.camera.top = 4; win.shadow.camera.bottom = -4; win.shadow.camera.near = 1; win.shadow.camera.far = 20; win.shadow.bias = -0.0005; win.shadow.normalBias = 0.04;
    s.add(win, win.target);
    this.flashLight = new THREE.PointLight(0xff3040, 0, 8, 1.4); this.flashLight.position.set(-0.3, 1.6, z0 - 0.6); s.add(this.flashLight); // police/alien strobes through the window
  }
  // Lighting moods. Each sets lights + grade.
  setLight(mood) {
    this.mood = mood;
    const g = game.gfx, L = this;
    const set = (o) => { for (const [k, v] of Object.entries(o)) { if (L[k]) L[k].intensity = v; } };
    if (mood === 'day') {
      set({ hemi: 1.1, ceilLight: 0, ceilFill: 0, floorLight: 0, deskLight: 2, fairyLight: 0.6, winLight: 3.2 });
      this.winLight.color.set(0xffe6c0); this.winLight.position.set(-2.5, 7, -8); this.hemi.color.set(0xcfe0ff);
      g?.setGrade({ exposure: 1.05, temperature: 0.15, saturation: 1.08, bloom: 0.35, vignette: 0.28 });
      this.scene.background.set(0x8fb4d8); this.lamps(false);
    } else if (mood === 'evening' || mood === 'night') {
      set({ hemi: mood === 'night' ? 0.35 : 0.55, ceilLight: this.lightsOn.ceiling ? 30 : 0, ceilFill: this.lightsOn.ceiling ? 3 : 0, floorLight: this.lightsOn.floor ? 4 : 0, deskLight: 6, fairyLight: this.lightsOn.fairy ? 2.2 : 0, winLight: mood === 'night' ? 0.5 : 0.9 });
      this.winLight.color.set(mood === 'night' ? 0x6f8fff : 0xff9f70); this.winLight.position.set(-1.5, 6, -9); this.hemi.color.set(0x9fb0d8);
      g?.setGrade({ exposure: 1.0, temperature: mood === 'night' ? -0.1 : 0.12, saturation: 1.05, bloom: 0.55, vignette: 0.34 });
      this.scene.background.set(0x07060a); this.lamps(true);
    } else if (mood === 'raid') {
      set({ hemi: 0.25, ceilLight: 0, ceilFill: 0, floorLight: 1.5, deskLight: 1, fairyLight: 0.8, winLight: 0.4 });
      g?.setGrade({ exposure: 1.0, temperature: -0.2, saturation: 0.95, bloom: 0.8, vignette: 0.5 });
    } else if (mood === 'blackout') {
      set({ hemi: 0.12, ceilLight: 0, ceilFill: 0, floorLight: 0, deskLight: 0, fairyLight: 0, winLight: 0.35, tvLight: 0, monLight: 0 });
      g?.setGrade({ exposure: 1.1, temperature: -0.3, saturation: 0.8, bloom: 0.6, vignette: 0.6 }); this.lamps(false);
    } else if (mood === 'finale') {
      set({ hemi: 0.2, ceilLight: 0, ceilFill: 0, floorLight: 0, deskLight: 0, fairyLight: 1.2, winLight: 0.3 });
      g?.setGrade({ exposure: 1.05, temperature: 0.05, saturation: 1.1, bloom: 0.9, vignette: 0.55 });
    }
    if (this.cityView?.setTimeOfDay) this.cityView.setTimeOfDay(mood === 'day' ? 13 : mood === 'evening' ? 19.5 : 23);
  }
  lamps(on) { this.M.bulb.emissiveIntensity = on && this.lightsOn.ceiling ? 3 : 0.1; this.lampShade.material.emissiveIntensity = on && this.lightsOn.floor ? 0.6 : 0; }

  // ------------------------------------------------------------------ city outside
  async buildCity() {
    try {
      const mod = await import('./city.js');
      this.cityView = mod.createCityBackdrop({ quality: game.settings.get('quality') });
      this.scene.add(this.cityView.group);
    } catch (e) {
      console.warn('city backdrop unavailable, using fallback', e);
      const g = new THREE.Group(); const r = rng(11);
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0x0b1030 })); sky.position.set(0, 10, -60); sky.layers.set(2); g.add(sky);
      const bm = new THREE.MeshStandardMaterial({ color: 0x1a1e2c, emissive: 0x332a18, emissiveIntensity: 0.6 });
      for (let i = 0; i < 60; i++) { const w = 2 + r() * 5, h = 10 + r() * 50; const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bm); b.position.set((r() - 0.5) * 100, h / 2 - 44, -20 - r() * 40); g.add(b); }
      this.cityView = { group: g, update() {}, setTimeOfDay() {}, setDamage() {} };
      this.scene.add(g);
    }
  }

  // ------------------------------------------------------------------ physics colliders
  buildColliders() {
    const P = this.physics;
    P.addStaticBox([0, -0.05, 0], [(x1 - x0) / 2 + 0.5, 0.05, (z1 - z0) / 2 + 0.5], 0, 'floor');
    P.addStaticBox([x0 - 0.06, H / 2, 0], [0.06, H, z1 - z0], 0, 'wall'); P.addStaticBox([x1 + 0.06, H / 2, 0], [0.06, H, z1 - z0], 0, 'wall');
    P.addStaticBox([0, H / 2, z0 - 0.06], [x1 - x0, H, 0.06], 0, 'wall'); P.addStaticBox([0, H / 2, z1 + 0.2], [x1 - x0, H, 0.06], 0, 'wall');
    const c = F.counter; P.addStaticBox([c.x, 0.46, c.z], [c.w / 2, 0.46, c.d / 2], 0, 'counter');
    const sv = F.stove; P.addStaticBox([sv.x, sv.h / 2, sv.z], [sv.w / 2, sv.h / 2, sv.d / 2], 0, 'stove');
    const so = F.sofa; P.addStaticBox([so.x, 0.24, so.z], [so.w / 2, 0.24, so.d / 2]); P.addStaticBox([so.x - 0.3, 0.6, so.z], [0.12, 0.3, so.d / 2]);
    P.addStaticBox([F.coffeeTable.x, 0.21, F.coffeeTable.z], [F.coffeeTable.w / 2, 0.21, F.coffeeTable.d / 2], 0, 'coffeeTable');
    P.addStaticBox([F.desk.x, F.desk.h / 2, F.desk.z], [F.desk.w / 2, F.desk.h / 2, F.desk.d / 2], 0, 'desk');
    P.addStaticBox([F.sideTable.x, 0.27, F.sideTable.z], [0.21, 0.28, 0.21]);
    P.addStaticBox([F.tv.x, 0.45, F.tv.z], [0.21, 0.45, 0.45]);
    // shelf plates
    const f = F.shelf; for (const y of this.shelfLevels) P.addStaticBox([f.x, y, f.z], [f.w / 2, 0.012, f.d / 2], 0, 'shelf');
    P.addStaticBox([f.x, f.h / 2, f.z - f.d / 2 - 0.02], [f.w / 2, f.h / 2, 0.02]);
    this.cribCollider = null;
  }

  // ------------------------------------------------------------------ actors
  spawnActor(kind, pos = [0, 0, 0], yaw = 0, look) {
    const a = new Actor(kind, look); a.place(pos.length === 2 ? [pos[0], 0, pos[1]] : pos, yaw);
    this.scene.add(a.root); this.actors.push(a); return a;
  }
  removeActor(a) { a.root.removeFromParent(); this.actors = this.actors.filter((x) => x !== a); }

  // ------------------------------------------------------------------ camera
  camTo(shot, sec = 0, easeFn = ease.inOutCubic) {
    const s = typeof shot === 'string' ? CAMS[shot] : shot;
    const from = { pos: this.camera.position.clone(), look: this.camLook.clone(), fov: this.camera.fov };
    const to = { pos: new THREE.Vector3(...(s.pos.isVector3 ? s.pos.toArray() : s.pos)), look: new THREE.Vector3(...(s.look.isVector3 ? s.look.toArray() : s.look)), fov: s.fov ?? from.fov };
    this.camShot = typeof shot === 'string' ? shot : null;
    return new Promise((res) => {
      if (sec <= 0) { this.camera.position.copy(to.pos); this.camLook.copy(to.look); this.camera.fov = to.fov; this.camera.updateProjectionMatrix(); this.camTween = null; res(); return; }
      this.camTween = { from, to, t: 0, sec, ease: easeFn, res };
    });
  }
  setCinematic(on) { this.cinematic = on; this.front.visible = on && this.showFront !== false; this.ceiling.visible = on; }

  // ------------------------------------------------------------------ mess / tidy
  messUp() {
    // knocked-over furniture + the painting on the floor + crib box tossed + scattered props
    const set = (name, pos, rot) => { const o = this.prop(name); if (!o) return; o.userData.home ??= { pos: o.position.clone(), rot: o.rotation.clone() }; if (pos) o.position.set(...pos); if (rot) o.rotation.set(...rot); };
    set('coffeeTable', [F.coffeeTable.x + 0.3, 0.45, F.coffeeTable.z + 0.2], [Math.PI, 0.4, 0]);
    set('chair', [1.6, 0.25, 0.2], [0, 1.3, Math.PI / 2]);
    set('floorLamp', [F.lamp.x + 0.6, 0.1, F.lamp.z - 0.5], [0, 0.5, -Math.PI / 2 + 0.1]);
    set('painting', [-2.2, 0.03, 0.4], [-Math.PI / 2, 0, 0.6]);
    set('cribBox', [0.8, 0.3, -0.9], [0.3, 0.9, 1.2]);
    this.sofaCushions.forEach((c, i) => { c.userData.home ??= { pos: c.position.clone(), rot: c.rotation.clone() }; if (i % 2 === 0) { c.position.x += 0.6 + i * 0.05; c.position.y = -0.1; c.rotation.set(0.2, i, 0.3); } });
    this.messy = true; this.lightsOn.floor = false; this.lightsOn.fairy = false; this.lamps(true);
    this.loose?.scatter?.();
    game.events.emit('apt:mess');
  }
  restore(name, sec = 0.8) {
    const o = this.prop(name) ?? name; const h = o?.userData.home; if (!h) return Promise.resolve();
    const fp = o.position.clone(), fr = new THREE.Quaternion().setFromEuler(o.rotation), tr = new THREE.Quaternion().setFromEuler(h.rot);
    return new Promise((res) => { this.tweens.push({ t: 0, sec, fn: (k) => { const e = ease.outBack(k); o.position.lerpVectors(fp, h.pos, e); o.quaternion.slerpQuaternions(fr, tr, Math.min(1, e)); }, res }); });
  }
  tidy() {
    for (const n of ['coffeeTable', 'chair', 'floorLamp', 'painting', 'cribBox']) { const o = this.prop(n); const h = o?.userData.home; if (h) { o.position.copy(h.pos); o.rotation.copy(h.rot); } }
    this.sofaCushions.forEach((c) => { const h = c.userData.home; if (h) { c.position.copy(h.pos); c.rotation.copy(h.rot); } });
    this.messy = false; this.lightsOn.floor = true; this.lightsOn.fairy = true;
  }
  tweens = [];

  // ------------------------------------------------------------------ frame
  enter() { game.audio?.loop && (this.ambience ??= game.audio.loop('city', { vol: 0.18 })); }
  exit() { this.ambience?.stop(1); this.ambience = null; }
  update(dt) {
    this.time += dt;
    this.physics?.step(dt);
    for (const a of this.actors) a.update(dt);
    for (const t of [...this.tweens]) { t.t += dt; const k = clamp(t.t / t.sec); t.fn(k); if (k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res?.(); } }
    // camera
    if (this.camTween) {
      const c = this.camTween; c.t += dt; const k = c.ease(clamp(c.t / c.sec));
      this.camera.position.lerpVectors(c.from.pos, c.to.pos, k); this.camLook.lerpVectors(c.from.look, c.to.look, k); this.camera.fov = lerp(c.from.fov, c.to.fov, k); this.camera.updateProjectionMatrix();
      if (c.t >= c.sec) { this.camTween = null; c.res(); }
    }
    if (this.camOffset) this.camera.lookAt(this.camLook.clone().add(this.camOffset)); else this.camera.lookAt(this.camLook);
    // door swing
    if (this.doorPivot) { this.doorAngle = damp(this.doorAngle, this.doorTarget, this.doorSpeed || 4, dt); if (this.doorKick) { this.doorKick = Math.max(0, this.doorKick - dt * 2); } this.doorPivot.rotation.y = this.doorAngle + Math.sin(this.time * 30) * 0.03 * (this.doorKick || 0); }
    // mobile spin, fairy twinkle, burners
    if (this.mobile) this.mobile.rotation.y += dt * 0.4;
    if (this.fan) this.fan.rotation.y += dt * (this.fanOn === false ? 0 : 4.5);
    if (this.fairy) this.fairy.material.emissiveIntensity = this.lightsOn.fairy ? 3.2 + Math.sin(this.time * 3) * 0.6 : 0.05;
    if (this.fairyLight && this.mood !== 'day') this.fairyLight.intensity = this.lightsOn.fairy ? 2 + Math.sin(this.time * 2.3) * 0.3 : 0;
    for (const b of this.burners) if (b.userData.flame.visible) { b.userData.flame.scale.setScalar(1 + Math.sin(this.time * 40 + b.id) * 0.06); }
    // screens
    this.drawTV(dt); this.drawClock();
    if (game.computer && (this.time % 0.1 < dt || !this._monInit)) { this._monInit = true; const g = this.monCanvas.getContext('2d'); game.computer.drawScreen(g, this.monCanvas.width, this.monCanvas.height); this.monTex.needsUpdate = true; }
    if (game.computer) { const ring = game.computer.ringing; this.phoneLed.material.emissiveIntensity = ring ? (Math.sin(this.time * 18) > 0 ? 3 : 0) : 0; this.handset.position.y = 0.085 + (ring ? Math.abs(Math.sin(this.time * 30)) * 0.006 : 0); }
    this.cityView?.update?.(dt, this.time);
    if (this.flashLight.userData.on) { const p = Math.sin(this.time * 8); this.flashLight.intensity = 6 * Math.max(0, p); this.flashLight.color.set(p > 0 ? 0xff3040 : 0x3060ff); this.flashLight.intensity = 5 * Math.abs(p); }
  }
  drawClock() {
    if (this.time - (this._clk || -9) < 0.5) return; this._clk = this.time;
    const g = this.clockCanvas.getContext('2d'); g.fillStyle = '#100404'; g.fillRect(0, 0, 128, 48);
    g.fillStyle = '#ff2a1a'; g.font = '40px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const c = game.state ? fmtClock(game.state.clock) : '20:06'; g.fillText(Math.floor(this.time * 2) % 2 ? c : c.replace(':', ' '), 64, 26);
    this.clockTex.needsUpdate = true;
  }
  drawTV(dt) {
    if (this.tvMode === 'off') { this.tvLight.intensity = 0; return; }
    this._tvT = (this._tvT || 0) + dt; if (this._tvT < 1 / 15) return; this._tvT = 0;
    const g = this.tvCanvas.getContext('2d'), W = 320, Hh = 240, t = this.time;
    if (this.tvMode === 'static') { const img = g.createImageData(W, Hh); for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }
    else {
      const bg = g.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#1b2a4a'); bg.addColorStop(1, '#0a1020'); g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
      if (this.tvMode === 'news') {
        // anchor silhouette + sky footage
        g.fillStyle = '#0f1830'; g.fillRect(170, 40, 140, 120);
        g.fillStyle = '#ffd9a0'; for (let i = 0; i < 3; i++) { const x = 190 + ((t * 20 + i * 40) % 110), y = 70 + Math.sin(t + i) * 12; g.beginPath(); g.ellipse(x, y, 10, 3, 0, 0, 7); g.fill(); }
        g.fillStyle = '#2a3348'; g.beginPath(); g.ellipse(80, 120, 38, 46, 0, 0, 7); g.fill(); g.fillRect(40, 150, 80, 90);
        g.fillStyle = '#c8302a'; g.fillRect(0, 180, W, 30); g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText('BREAKING', 8, 202);
        g.fillStyle = '#f2f2f2'; g.fillRect(0, 210, W, 30); g.fillStyle = '#111'; g.font = '16px sans-serif';
        const ticker = (this.tvTicker || 'LIGHTS OVER THE CITY — DTP URGES CALM — REPORT ALL ALIEN SYMPATHIZERS — LUCKY NOODLE PRICES STEADY — ');
        g.fillText(ticker + ticker, -((t * 60) % (ticker.length * 8)), 231);
      } else if (this.tvMode === 'wanted') {
        g.fillStyle = '#e9e0c8'; g.fillRect(90, 20, 140, 170); g.fillStyle = '#a87452'; g.beginPath(); g.ellipse(160, 90, 40, 50, 0, 0, 7); g.fill(); g.fillStyle = '#151110'; g.fillRect(122, 40, 76, 25);
        g.fillStyle = '#b3261e'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('WANTED', 160, 175); g.textAlign = 'left';
        g.fillStyle = '#c8302a'; g.fillRect(0, 200, W, 40); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.fillText('MAN SOUGHT FOR "ALIEN PREGNANCY"', 8, 226);
      } else if (this.tvMode === 'cartoon') {
        g.fillStyle = '#7ad6ff'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#5cbf4a'; g.fillRect(0, 170, W, 70);
        const x = 160 + Math.sin(t * 2) * 80; g.fillStyle = '#ff8f3a'; g.beginPath(); g.ellipse(x, 150, 30, 20, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x + 28, 132, 14, 0, 7); g.fill();
      }
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < Hh; y += 3) g.fillRect(0, y, W, 1);
    this.tvTex.needsUpdate = true;
    this.tvLight.intensity = 1.6 + Math.random() * 0.8;
  }
  // Screen rect of the monitor (CSS px) for positioning the DOM computer over it.
  monitorRect() {
    const scr = this.monitorScreen; scr.updateMatrixWorld(true);
    const pts = [[-0.18, 0.135], [0.18, 0.135], [-0.18, -0.135], [0.18, -0.135]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(scr.matrixWorld).project(this.camera));
    const xs = pts.map((p) => (p.x + 1) / 2 * innerWidth), ys = pts.map((p) => (1 - p.y) / 2 * innerHeight);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
}
function labelTexMat(text, bg, fg) { return std({ map: labelTex(text, { bg, fg, w: 128, h: 32, font: 'bold 20px sans-serif' }) }); }
