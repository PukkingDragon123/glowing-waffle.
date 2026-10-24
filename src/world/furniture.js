// Furniture builders. Each works in a local frame whose origin is the centre of
// the footprint on the floor with the front facing local +z.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { Door, Drawer, Button } from './interactables.js';
import { boxGeo, roundedBox, cylGeo, place } from '../gfx/geo.js';
import { Fixture, glowMat } from './lights.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

function worldYaw(b, local = 0) { return (b.frame ? b.frame.ry : 0) + local; }
function wpos(b, x, y, z) { const p = b.toWorld(x, y, z); return new THREE.Vector3(p[0], p[1], p[2]); }

// hollow carcass: sides, back, bottom, top, shelves. Returns interior info.
export function carcass(b, w, h, d, y0, mat, { shelves = 1, top = true, thick = 0.018, back = true, kick = 0 } = {}) {
  const t = thick;
  b.box(-w / 2 + t / 2, y0 + h / 2, 0, t, h, d, mat);
  b.box(w / 2 - t / 2, y0 + h / 2, 0, t, h, d, mat);
  if (back) b.box(0, y0 + h / 2, -d / 2 + t / 2, w - 2 * t, h, t, mat);
  b.box(0, y0 + kick + t / 2, 0, w - 2 * t, t, d, mat);
  if (kick) b.box(0, y0 + kick / 2, d / 2 - 0.05, w, kick, 0.02, M.black, { collide: false });
  if (top) b.box(0, y0 + h - t / 2, 0, w - 2 * t, t, d, mat);
  for (let i = 1; i <= shelves; i++) {
    const sy = y0 + kick + (h - kick) * (i / (shelves + 1));
    b.box(0, sy, 0.0, w - 2 * t, t, d - 0.04, mat);
  }
  return { inner: { w: w - 2 * t, h: h - kick - 2 * t, d: d - t } };
}

// hinged door on the front of a carcass. side: 'L' hinge at -x, 'R' hinge at +x
export function frontDoor(b, x, y0, z, w, h, mat, side = 'L', o = {}) {
  const t = o.thick ?? 0.018;
  const hingeLocal = side === 'L' ? [x - w / 2, y0, z + t / 2] : [x + w / 2, y0, z + t / 2];
  const hinge = wpos(b, ...hingeLocal);
  const closedYaw = worldYaw(b, side === 'L' ? 0 : Math.PI);
  const openDir = side === 'L' ? -1 : 1;
  const door = new Door({
    hinge, width: w, height: h, thick: t, closedYaw, openDir, maxAngle: o.max ?? 1.9,
    mat, kind: o.kind || 'cabinet', label: o.label || 'cabinet', knob: false, locked: o.locked,
    soundOpen: o.soundOpen, soundClose: o.soundClose,
    buildPanel: (panel, d) => {
      const g = boxGeo(w - 0.004, h - 0.004, t, 1);
      remapFront(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(w / 2, h / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      panel.add(m);
      if (o.handle !== false) {
        const hm = new THREE.Mesh(boxGeo(0.012, o.handleLen ?? 0.1, 0.022), o.handleMat || M.chrome);
        hm.position.set(w - 0.04, o.handleY ?? (h - 0.09), t / 2 + 0.012);
        panel.add(hm);
      }
      if (o.decorate) o.decorate(panel, d);
    },
  });
  return door;
}

export function remapFront(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const n = Math.floor(i / 4), c = i % 4;
    if (n === 4 || n === 5) uv.setXY(i, c === 0 || c === 3 ? (n === 4 ? 0 : 1) : (n === 4 ? 1 : 0), c < 2 ? 0 : 1);
  }
}

// ----------------------------------------------------------------- kitchen
export function baseCabinetRun(b, x, z, ry, len, o = {}) {
  // a run of base cabinets with counter top. modules: array of {w, type:'door2'|'door'|'drawers'|'sink'|'gap'}
  b.beginFrame(x, 0, z, ry);
  const d = 0.6, h = 0.88, ctop = 0.04;
  const mods = o.modules || [{ w: len, type: 'door2' }];
  let cx = -len / 2;
  const out = { doors: [], drawers: [], sinkPos: null, interiors: [] };
  for (const m of mods) {
    const mx = cx + m.w / 2;
    if (m.type === 'gap') { cx += m.w; continue; }
    b.beginFrame(...b.toWorld(mx, 0, 0), ry);
    carcass(b, m.w, h, d, 0, M.cabinet, { shelves: m.type === 'sink' ? 0 : 1, top: m.type !== 'sink', kick: 0.08, back: true });
    if (m.type === 'drawers') {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const dh = (h - 0.1) / n;
        const y0 = 0.09 + i * dh;
        const grp = drawerBox(b, m.w - 0.04, dh - 0.02, d - 0.06, M.cabinet);
        const pw = wpos(b, 0, y0 + dh / 2, 0.03);
        grp.position.copy(pw); grp.rotation.y = worldYaw(b);
        G.world.root.add(grp);
        const dr = new Drawer({ group: grp, axis: new THREE.Vector3(Math.sin(worldYaw(b)), 0, Math.cos(worldYaw(b))), max: 0.42, size: [m.w - 0.04, dh - 0.02, d - 0.06], label: 'drawer' });
        out.drawers.push(dr);
      }
    } else {
      const doors = m.type === 'door' ? 1 : 2;
      const dw = (m.w - 0.01) / doors;
      for (let i = 0; i < doors; i++) {
        const side = doors === 2 ? (i === 0 ? 'L' : 'R') : (m.hinge || 'L');
        const dx = -m.w / 2 + dw / 2 + i * dw + 0.005;
        const door = frontDoor(b, dx, 0.09, d / 2, dw - 0.006, h - 0.1, M.cabinetDoor || M.cabinet, side, { handleY: h - 0.18, label: m.label || 'cupboard' });
        out.doors.push(door);
      }
      out.interiors.push({ center: wpos(b, 0, 0.1, 0), w: m.w, d, shelfY: 0.08 + 0.018 + (h - 0.08) / 2 });
    }
    if (m.type === 'sink') out.sinkPos = wpos(b, 0, h, -0.02);
    b.endFrame();
    b.frame = { x, y: 0, z, ry, c: Math.cos(ry), s: Math.sin(ry) };
    cx += m.w;
  }
  // counter top (with sink hole if any sink module)
  cx = -len / 2;
  for (const m of mods) {
    const mx = cx + m.w / 2;
    if (m.type === 'gap') { cx += m.w; continue; }
    if (m.type === 'sink') {
      const sw = 0.52, sd = 0.42;
      b.box(mx - (m.w / 2 + sw / 2) / 2, h + ctop / 2, 0.01, (m.w - sw) / 2, ctop, d + 0.03, M.counter);
      b.box(mx + (m.w / 2 + sw / 2) / 2, h + ctop / 2, 0.01, (m.w - sw) / 2, ctop, d + 0.03, M.counter);
      b.box(mx, h + ctop / 2, -d / 2 + (d - sd) / 4 + 0.005, sw, ctop, (d - sd) / 2 + 0.01, M.counter);
      b.box(mx, h + ctop / 2, d / 2 - (d - sd) / 4 + 0.01, sw, ctop, (d - sd) / 2 + 0.02, M.counter);
      // basin
      const by = h - 0.16;
      b.box(mx, by, 0, sw - 0.02, 0.01, sd - 0.02, M.steel);
      b.box(mx - sw / 2 + 0.01, by + 0.09, 0, 0.01, 0.18, sd - 0.02, M.steel);
      b.box(mx + sw / 2 - 0.01, by + 0.09, 0, 0.01, 0.18, sd - 0.02, M.steel);
      b.box(mx, by + 0.09, -sd / 2 + 0.01, sw - 0.02, 0.18, 0.01, M.steel);
      b.box(mx, by + 0.09, sd / 2 - 0.01, sw - 0.02, 0.18, 0.01, M.steel);
      b.geo(cylGeo(0.025, 0.004, 10), M.black, { x: mx, y: by + 0.006, z: 0 });
    } else {
      b.box(mx, h + ctop / 2, 0.01, m.w, ctop, d + 0.03, M.counter);
    }
    cx += m.w;
  }
  // backsplash
  b.box(0, h + ctop + 0.25, -d / 2 + 0.005, len, 0.5, 0.01, M.bathTiles, { collide: false });
  b.endFrame();
  return out;
}

export function drawerBox(b, w, h, d, mat) {
  const g = new THREE.Group();
  const t = 0.012;
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); };
  const fg = boxGeo(w, h, 0.02, 1); remapFront(fg);
  add(fg, mat, 0, 0, d / 2);
  add(boxGeo(w - 0.04, t, d - 0.02, 0.5), mat, 0, -h / 2 + t, 0);
  add(boxGeo(t, h * 0.7, d - 0.02, 0.5), mat, -w / 2 + 0.03, -h * 0.15, 0);
  add(boxGeo(t, h * 0.7, d - 0.02, 0.5), mat, w / 2 - 0.03, -h * 0.15, 0);
  add(boxGeo(w - 0.04, h * 0.7, t, 0.5), mat, 0, -h * 0.15, -d / 2 + 0.01);
  add(boxGeo(0.12, 0.014, 0.02), M.chrome, 0, h * 0.2, d / 2 + 0.018);
  return g;
}

export function upperCabinets(b, x, z, ry, len, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const d = 0.34, h = 0.72, y0 = o.y0 ?? 1.46;
  const n = o.n ?? Math.max(1, Math.round(len / 0.6));
  const mw = len / n;
  const doors = [];
  const shelves = [];
  for (let i = 0; i < n; i++) {
    const mx = -len / 2 + mw / 2 + i * mw;
    b.beginFrame(...b.toWorld(mx, 0, 0), ry);
    carcass(b, mw, h, d, y0, M.cabinet, { shelves: 1 });
    doors.push(frontDoor(b, 0, y0 + 0.005, d / 2, mw - 0.01, h - 0.01, M.cabinetDoor || M.cabinet, i % 2 ? 'R' : 'L', { handleY: 0.08, label: 'cupboard' }));
    shelves.push({ y: y0 + 0.018, y2: y0 + h / 2 + 0.01, center: wpos(b, 0, y0, 0), w: mw, d });
    b.endFrame();
    b.frame = { x, y: 0, z, ry, c: Math.cos(ry), s: Math.sin(ry) };
  }
  b.endFrame();
  return { doors, shelves };
}

export function fridge(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 0.74, d = 0.7, h = 1.74;
  const t = 0.04;
  // carcass (enamel), freezer on top
  b.box(-w / 2 + t / 2, h / 2, 0, t, h, d, M.enamel);
  b.box(w / 2 - t / 2, h / 2, 0, t, h, d, M.enamel);
  b.box(0, h / 2, -d / 2 + t / 2, w - 2 * t, h, t, M.enamel);
  b.box(0, 0.05, 0, w - 2 * t, 0.1, d, M.enamel);
  b.box(0, h - t / 2, 0, w - 2 * t, t, d, M.enamel);
  const split = 1.28;
  b.box(0, split, 0, w - 2 * t, 0.05, d - 0.02, M.enamel);
  // interior shelves (white plastic / wire)
  for (const sy of [0.52, 0.86]) b.box(0, sy, -0.02, w - 2 * t, 0.012, d - 0.12, M.porcelain);
  b.box(0, 0.2, 0.02, w - 2 * t - 0.02, 0.2, d - 0.16, M.porcelain, { collide: false }); // crisper
  b.box(0, 0.105, 0, w - 2 * t, 0.01, d - 0.05, M.porcelain);
  const out = { shelves: [0.105 + 0.006, 0.52 + 0.006, 0.86 + 0.006, split + 0.026], center: wpos(b, 0, 0, 0), w, d };
  // light
  const lp = wpos(b, 0, split - 0.08, -0.15);
  const bulb = glowMat(0xffffff, 0xfff2d8, 2.5);
  const bm = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), bulb);
  bm.position.copy(lp); G.world.root.add(bm);
  out.light = new Fixture({ pos: lp, intensity: 3.5, distance: 2.6, color: 0xeef4ff, on: false, bulbMats: [bulb], name: 'fridge' });
  // doors: hinge on the right (+x) side
  const mkDoor = (y0, hh, label, kind) => frontDoor(b, 0, y0, d / 2, w - 0.004, hh, M.enamel, 'R', {
    thick: 0.06, kind: 'fridge', label, max: 1.95, handleMat: M.chrome, handleLen: hh * 0.35, handleY: y0 < 1 ? hh - 0.32 : 0.18,
    decorate: (panel) => {
      // door shelves on the inside
      if (y0 < 1) {
        for (const yy of [0.28, 0.62, 0.92]) {
          const s = new THREE.Mesh(boxGeo(w - 0.12, 0.08, 0.09, 0.5), M.porcelain);
          s.position.set(w / 2, yy, -0.075);
          panel.add(s);
        }
      }
      // magnets / note on the front
      if (y0 < 1 && M.fridgeNote) {
        const note = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), M.fridgeNote);
        note.position.set(w * 0.45, 0.62, 0.031);
        note.rotation.z = 0.06;
        panel.add(note);
        out.noteMesh = note;
      }
    },
  });
  out.door = mkDoor(0.0, split - 0.01, 'fridge');
  out.freezer = mkDoor(split + 0.02, h - split - 0.03, 'freezer');
  out.door.o.onChange = (d, open) => {
    out.light.set(open);
    sfx(open ? 'fridgeOpen' : 'fridgeClose', { pos: d.worldPos(new THREE.Vector3()), vol: 0.7 });
  };
  // the compressor hum emitter
  out.humPos = wpos(b, 0, 0.2, -0.3);
  b.endFrame();
  return out;
}

export function stove(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 0.76, d = 0.64, h = 0.9;
  b.box(0, h / 2, 0, w, h, d, M.enamelYellow);
  b.box(0, h + 0.01, 0, w, 0.02, d, M.black);
  // backguard with knobs
  b.box(0, h + 0.1, -d / 2 + 0.04, w, 0.2, 0.06, M.enamelYellow);
  // oven door window
  b.box(0, 0.42, d / 2 + 0.004, w - 0.12, 0.3, 0.01, M.blackGloss, { collide: false });
  b.box(0, 0.66, d / 2 + 0.03, w - 0.2, 0.025, 0.025, M.chrome, { collide: false });
  const burners = [];
  const pos = [[-0.19, -0.13], [0.19, -0.13], [-0.19, 0.14], [0.19, 0.14]];
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = pos[i];
    b.geo(cylGeo(0.085, 0.012, 14), M.steel, { x: bx, y: h + 0.026, z: bz });
    b.geo(cylGeo(0.045, 0.02, 10), M.black, { x: bx, y: h + 0.03, z: bz });
    // grate bars
    b.box(bx, h + 0.045, bz, 0.2, 0.012, 0.014, M.black, { collide: false });
    b.box(bx, h + 0.045, bz, 0.014, 0.012, 0.2, M.black, { collide: false });
    const center = wpos(b, bx, h + 0.052, bz);
    // flame ring (emissive) - hidden until lit
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x4a7dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 18), flameMat);
    flame.rotation.x = Math.PI / 2; flame.position.copy(center).add(new THREE.Vector3(0, -0.012, 0));
    G.world.root.add(flame);
    burners.push({ center, on: false, flame, flameMat, heat: 0, i });
  }
  b.box(0, h + 0.046, 0, 0.02, 0.012, d - 0.1, M.black);
  // knobs as buttons
  const knobs = [];
  for (let i = 0; i < 4; i++) {
    const kx = -0.27 + i * 0.18;
    const kp = wpos(b, kx, h + 0.12, -d / 2 + 0.075);
    const km = new THREE.Mesh(cylGeo(0.022, 0.025, 10), M.plasticDark);
    km.rotation.x = Math.PI / 2; km.rotation.z = 0;
    const grp = new THREE.Group(); grp.position.copy(kp); grp.rotation.y = worldYaw(b);
    grp.add(km);
    const tick = new THREE.Mesh(boxGeo(0.004, 0.018, 0.004), M.paperWhite); tick.position.set(0, 0.012, 0.014); grp.add(tick);
    G.world.root.add(grp);
    const burner = burners[[2, 0, 1, 3][i]];
    const btn = new Button(grp, {
      name: 'knob', label: () => (burner.on ? 'Turn burner off' : 'Turn burner on'),
      onUse: () => {
        burner.on = !burner.on;
        km.rotation.y = burner.on ? -1.2 : 0;
        tick.position.set(burner.on ? -0.011 : 0, burner.on ? 0.006 : 0.012, 0.014);
        sfx(burner.on ? 'stoveIgnite' : 'switch', { pos: burner.center, vol: 0.6 });
      },
    });
    knobs.push(btn);
  }
  b.endFrame();
  return { burners, knobs };
}

export function rangeHood(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  b.box(0, 1.62, -0.12, 0.76, 0.16, 0.48, M.enamelYellow);
  b.box(0, 1.9, -0.2, 0.3, 0.4, 0.3, M.enamelYellow);
  b.endFrame();
}

// ------------------------------------------------------------------ living
export function couch(b, x, z, ry, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const w = o.w ?? 2.0, d = 0.9;
  const fab = o.mat || M.couchFabric;
  b.box(0, 0.22, 0.02, w - 0.3, 0.26, d - 0.1, fab);                // base
  b.geo(roundedBox(w - 0.32, 0.16, d - 0.28, 0.05), fab, { x: 0, y: 0.43, z: 0.1 }); // seat cushions
  b.geo(roundedBox(0.04, 0.14, d - 0.3, 0.02), M.black, { x: 0, y: 0.43, z: 0.1 });
  b.geo(roundedBox(w - 0.3, 0.5, 0.22, 0.06), fab, { x: 0, y: 0.62, z: -d / 2 + 0.13, rx: -0.12 });
  for (const s of [-1, 1]) b.geo(roundedBox(0.17, 0.62, d, 0.05), fab, { x: s * (w / 2 - 0.085), y: 0.31, z: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08), 0.05, 0.08, 0.05, M.woodDark, { collide: false });
  b.collider(0, 0.27, 0, w, 0.54, d);
  b.collider(0, 0.6, -d / 2 + 0.12, w, 0.6, 0.24);
  // throw pillow
  b.geo(roundedBox(0.38, 0.34, 0.12, 0.05), M.quilt, { x: -w / 2 + 0.38, y: 0.62, z: -0.16, rx: -0.3, ry: 0.25 });
  b.endFrame();
  return { seat: wpos(b, 0, 0.5, 0.1) };
}

export function table(b, x, z, ry, w, d, h, mat = M.woodTable, o = {}) {
  b.beginFrame(x, 0, z, ry);
  b.box(0, h - 0.02, 0, w, 0.04, d, mat);
  const leg = o.leg ?? 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.06), (h - 0.04) / 2, sz * (d / 2 - 0.06), leg, h - 0.04, leg, mat, { collide: true });
  if (o.apron !== false) {
    b.box(0, h - 0.09, d / 2 - 0.06, w - 0.14, 0.08, 0.02, mat, { collide: false });
    b.box(0, h - 0.09, -d / 2 + 0.06, w - 0.14, 0.08, 0.02, mat, { collide: false });
  }
  b.endFrame();
  return { top: h };
}

export function bookshelf(b, x, z, ry, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const w = o.w ?? 0.9, d = 0.3, h = o.h ?? 1.8;
  carcass(b, w, h, d, 0, M.woodDark, { shelves: 4, kick: 0.05 });
  // books
  const rng = mulberry(o.seed ?? 7);
  const cols = [0x6a2a24, 0x2f3d5c, 0x44583a, 0x8a7448, 0x5c3a52, 0x2a2a2a, 0x9a8a70, 0x704028];
  const mats = cols.map((c) => G.world.bookMats?.[c] || (G.world.bookMats = G.world.bookMats || {}, G.world.bookMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })));
  for (let s = 0; s < 4; s++) {
    const sy = 0.05 + 0.018 + (h - 0.05) * (s / 5) + 0.01;
    let bx = -w / 2 + 0.03;
    while (bx < w / 2 - 0.08) {
      const bw = 0.02 + rng() * 0.035, bh = 0.18 + rng() * 0.1;
      if (rng() < 0.12) { bx += 0.06; continue; }
      const lean = rng() < 0.1 ? 0.2 : 0;
      b.geo(boxGeo(bw, bh, 0.17 + rng() * 0.05, 1), mats[Math.floor(rng() * mats.length)], { x: bx + bw / 2, y: sy + bh / 2, z: 0, rz: lean, cast: false });
      bx += bw + 0.002;
    }
  }
  b.endFrame();
}

export function radiator(b, x, z, ry, w = 0.9) {
  b.beginFrame(x, 0, z, ry);
  const fins = Math.floor(w / 0.06);
  for (let i = 0; i < fins; i++) b.geo(roundedBox(0.045, 0.62, 0.14, 0.015), M.radiator, { x: -w / 2 + 0.03 + i * 0.06, y: 0.38, z: 0 });
  b.box(0, 0.12, 0, w, 0.03, 0.06, M.radiator, { collide: false });
  b.box(0, 0.66, 0, w, 0.03, 0.06, M.radiator, { collide: false });
  b.geo(cylGeo(0.016, 0.1, 8), M.rustMetal, { x: -w / 2 - 0.02, y: 0.05, z: 0 });
  b.collider(0, 0.38, 0, w, 0.7, 0.16);
  b.endFrame();
}

export function bed(b, x, z, ry, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const w = 1.4, L = 2.0;
  // frame on tall legs: a cat fits underneath
  b.box(0, 0.27, 0, w, 0.12, L, M.woodDark, { collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.04), 0.105, sz * (L / 2 - 0.04), 0.06, 0.21, 0.06, M.woodDark, { collide: false });
  b.box(0, 0.6, -L / 2 - 0.03, w + 0.06, 1.2, 0.05, M.woodDark);
  b.box(0, 0.38, L / 2 + 0.02, w + 0.04, 0.34, 0.04, M.woodDark);
  // mattress
  b.geo(roundedBox(w - 0.06, 0.22, L - 0.06, 0.05), M.bedsheet, { x: 0, y: 0.44, z: 0 });
  // pillows
  b.geo(roundedBox(0.58, 0.12, 0.38, 0.05), M.bedsheet, { x: -0.33, y: 0.61, z: -L / 2 + 0.28, rx: 0.15 });
  b.geo(roundedBox(0.58, 0.12, 0.38, 0.05), M.bedsheet, { x: 0.33, y: 0.61, z: -L / 2 + 0.3, rx: 0.12, ry: -0.05 });
  b.collider(0, 0.39, 0, w, 0.36, L);
  b.collider(0, 0.1, 0, w, 0.2, L * 0.8);
  b.endFrame();
  return { pillow: wpos(b, -0.2, 0.71, -L / 2 + 0.3), mattressY: 0.55, center: wpos(b, 0, 0.55, 0) };
}

export function nightstand(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 0.45, d = 0.4, h = 0.56;
  carcass(b, w, h, d, 0, M.woodLight, { shelves: 0, kick: 0.04 });
  const grp = drawerBox(b, w - 0.04, 0.16, d - 0.05, M.woodLight);
  grp.position.copy(wpos(b, 0, h - 0.11, 0.025)); grp.rotation.y = worldYaw(b);
  G.world.root.add(grp);
  const yaw = worldYaw(b);
  const dr = new Drawer({ group: grp, axis: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), max: 0.3, size: [w - 0.04, 0.16, d - 0.05], label: 'drawer' });
  b.box(0, 0.25, d / 2 - 0.01, w - 0.04, 0.3, 0.015, M.woodLight, { collide: false });
  b.endFrame();
  return { top: wpos(b, 0, h, 0), drawer: dr, drawerInside: grp };
}

export function wardrobe(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 1.2, d = 0.62, h = 1.95;
  const t = 0.02;
  b.box(-w / 2 + t / 2, h / 2, 0, t, h, d, M.woodDark);
  b.box(w / 2 - t / 2, h / 2, 0, t, h, d, M.woodDark);
  b.box(0, h / 2, -d / 2 + t / 2, w, h, t, M.woodDark);
  b.box(0, h - t / 2, 0, w, t, d, M.woodDark);
  b.box(0, 0.04, 0, w, 0.08, d, M.woodDark);
  b.box(0, h - 0.2, -0.02, w - 0.06, 0.02, d - 0.08, M.woodDark);
  b.geo(cylGeo(0.012, w - 0.06, 8), M.chrome, { x: 0, y: h - 0.32, z: 0, rz: Math.PI / 2 });
  // clothes hanging (simple slabs)
  const cc = [0x3a3a44, 0x6a4a3a, 0x2c3a2c, 0x8a8a90, 0x502828];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: cc[i], roughness: 1 });
    b.geo(roundedBox(0.05, 0.9 + (i % 2) * 0.2, 0.42, 0.02), m, { x: -0.4 + i * 0.18, y: h - 0.8 - (i % 2) * 0.1, z: 0, cast: false });
  }
  const doorH = h - 0.12;
  const dl = frontDoor(b, -w / 4, 0.08, d / 2, w / 2 - 0.006, doorH - 0.004, M.woodDark, 'L', { label: 'wardrobe', handleY: doorH * 0.5, handleLen: 0.16, max: 1.8 });
  const dr = frontDoor(b, w / 4, 0.08, d / 2, w / 2 - 0.006, doorH - 0.004, M.woodDark, 'R', { label: 'wardrobe', handleY: doorH * 0.5, handleLen: 0.16, max: 1.8 });
  b.endFrame();
  return { doors: [dl, dr], inside: wpos(b, 0, 0, 0) };
}

export function desk(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 1.3, d = 0.72, h = 0.74;
  b.box(0, h - 0.015, 0, w, 0.03, d, M.woodTable);
  b.box(-w / 2 + 0.02, (h - 0.03) / 2, 0, 0.03, h - 0.03, d - 0.02, M.woodTable);
  carcass(b, 0.42, h - 0.03, d - 0.02, 0, M.woodTable, { shelves: 0, top: false });
  b.box(-0.1, h - 0.25, -d / 2 + 0.02, w - 0.5, 0.4, 0.015, M.woodTable, { collide: false });
  const drawers = [];
  const yaw = worldYaw(b);
  for (let i = 0; i < 3; i++) {
    const dh = 0.22;
    const grp = drawerBox(b, 0.38, dh - 0.015, d - 0.06, M.woodTable);
    grp.position.copy(wpos(b, w / 2 - 0.21, 0.08 + dh / 2 + i * dh, 0.02)); grp.rotation.y = yaw;
    G.world.root.add(grp);
    drawers.push(new Drawer({ group: grp, axis: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), max: 0.45, size: [0.38, dh - 0.015, d - 0.06], label: 'drawer' }));
  }
  b.endFrame();
  return { top: h, drawers };
}

export function chairStatic(b, x, z, ry, mat = M.woodTable) {
  b.beginFrame(x, 0, z, ry);
  b.box(0, 0.45, 0, 0.44, 0.04, 0.42, mat);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.19, 0.22, sz * 0.18, 0.035, 0.44, 0.035, mat, { collide: false });
  b.box(0, 0.72, -0.19, 0.42, 0.42, 0.03, mat);
  b.collider(0, 0.24, 0, 0.44, 0.48, 0.42);
  b.endFrame();
}

export function officeChair(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.geo(boxGeo(0.3, 0.025, 0.04), M.plasticDark, { x: Math.cos(a) * 0.15, y: 0.06, z: Math.sin(a) * 0.15, ry: -a, cast: false });
    b.geo(new THREE.SphereGeometry(0.025, 6, 4), M.plasticDark, { x: Math.cos(a) * 0.3, y: 0.025, z: Math.sin(a) * 0.3 });
  }
  b.geo(cylGeo(0.025, 0.36, 8), M.chrome, { x: 0, y: 0.24, z: 0 });
  b.geo(roundedBox(0.48, 0.08, 0.46, 0.03), M.couchFabric, { x: 0, y: 0.46, z: 0 });
  b.geo(roundedBox(0.44, 0.5, 0.07, 0.03), M.couchFabric, { x: 0, y: 0.82, z: -0.24, rx: -0.12 });
  b.collider(0, 0.3, 0, 0.5, 0.6, 0.5);
  b.endFrame();
}

export function tvStand(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  carcass(b, 1.0, 0.52, 0.45, 0, M.woodDark, { shelves: 1, kick: 0.04 });
  b.endFrame();
  return { top: wpos(b, 0, 0.52, 0) };
}

export function bathtub(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 0.75, L = 1.7, h = 0.56, t = 0.07;
  b.box(0, 0.05, 0, w, 0.1, L, M.porcelain);
  b.box(-w / 2 + t / 2, h / 2, 0, t, h, L, M.porcelain);
  b.box(w / 2 - t / 2, h / 2, 0, t, h, L, M.porcelain);
  b.box(0, h / 2, -L / 2 + t / 2, w - 2 * t, h, t, M.porcelain);
  b.box(0, h / 2, L / 2 - t / 2, w - 2 * t, h, t, M.porcelain);
  b.box(0, 0.12, 0, w - 2 * t, 0.04, L - 2 * t, M.porcelain);
  b.geo(cylGeo(0.02, 0.15, 8), M.chrome, { x: 0, y: h + 0.25, z: -L / 2 + 0.06, rx: Math.PI / 2 - 0.3 });
  b.geo(cylGeo(0.035, 0.02, 10), M.chrome, { x: 0, y: h + 0.28, z: -L / 2 + 0.13, rx: -0.3 });
  b.geo(cylGeo(0.02, 0.012, 8), M.chrome, { x: -0.1, y: h + 0.12, z: -L / 2 + 0.01, rx: Math.PI / 2 });
  b.geo(cylGeo(0.02, 0.012, 8), M.chrome, { x: 0.1, y: h + 0.12, z: -L / 2 + 0.01, rx: Math.PI / 2 });
  b.endFrame();
  return { floorY: 0.14, center: wpos(b, 0, 0.14, 0) };
}

export function toilet(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  b.geo(cylGeo(0.13, 0.36, 12, 0.18), M.porcelain, { x: 0, y: 0.18, z: 0.05 });
  b.geo(new THREE.TorusGeometry(0.17, 0.035, 6, 16), M.porcelain, { x: 0, y: 0.4, z: 0.08, rx: Math.PI / 2 });
  b.box(0, 0.6, -0.18, 0.42, 0.38, 0.17, M.porcelain);
  b.box(0, 0.8, -0.18, 0.45, 0.03, 0.19, M.porcelain);
  b.collider(0, 0.4, -0.05, 0.42, 0.8, 0.6);
  const lever = new THREE.Mesh(boxGeo(0.06, 0.012, 0.012), M.chrome);
  lever.position.copy(wpos(b, -0.17, 0.72, -0.09)); lever.rotation.y = worldYaw(b);
  G.world.root.add(lever);
  new Button(lever, { name: 'flush', label: 'Flush', onUse: () => sfx('flush', { pos: lever.position, vol: 0.8 }) });
  b.endFrame();
}

export function pedestalSink(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  b.geo(cylGeo(0.07, 0.75, 10, 0.1), M.porcelain, { x: 0, y: 0.38, z: 0 });
  b.geo(roundedBox(0.56, 0.16, 0.44, 0.06), M.porcelain, { x: 0, y: 0.82, z: 0.02 });
  b.box(0, 0.905, 0.04, 0.4, 0.005, 0.28, M.steel, { collide: false });
  b.geo(cylGeo(0.015, 0.16, 8), M.chrome, { x: 0, y: 0.98, z: -0.15 });
  b.geo(cylGeo(0.012, 0.12, 8), M.chrome, { x: 0, y: 1.05, z: -0.1, rx: Math.PI / 2 });
  b.collider(0, 0.45, 0, 0.56, 0.9, 0.46);
  b.endFrame();
  return { basin: wpos(b, 0, 0.91, 0.04), tap: wpos(b, 0, 1.04, -0.04) };
}

export function floorLamp(b, x, z) {
  b.beginFrame(x, 0, z, 0);
  b.geo(cylGeo(0.14, 0.03, 12), M.plasticDark, { x: 0, y: 0.015, z: 0 });
  b.geo(cylGeo(0.012, 1.5, 6), M.chrome, { x: 0, y: 0.76, z: 0 });
  b.collider(0, 0.8, 0, 0.2, 1.6, 0.2);
  b.endFrame();
}

export function window4(b, o) {
  // window frame in a wall opening. o: {x, z, w, y0, y1, axis:'x'|'z', facing}
  // returns the sash group (lower, slides up) and glass meshes
  const t = 0.07;
  const grp = new THREE.Group();
  const frameMat = M.trim;
  const wdt = o.w, hgt = o.y1 - o.y0;
  const mk = (g, m, x, y, z) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true; grp.add(mesh); return mesh; };
  // outer frame (local: width along x, facing +z into the room)
  mk(boxGeo(wdt + 0.12, 0.08, 0.16, 0.5), frameMat, 0, -0.04, 0.02);       // sill (inside)
  mk(boxGeo(wdt + 0.16, 0.04, 0.24, 0.5), frameMat, 0, -0.005, 0.06);
  mk(boxGeo(wdt + 0.12, 0.07, 0.12, 0.5), frameMat, 0, hgt + 0.035, 0);
  mk(boxGeo(0.06, hgt, 0.12, 0.5), frameMat, -wdt / 2 - 0.03, hgt / 2, 0);
  mk(boxGeo(0.06, hgt, 0.12, 0.5), frameMat, wdt / 2 + 0.03, hgt / 2, 0);
  // upper sash (fixed, outer track)
  const sh = hgt / 2;
  const upper = new THREE.Group(); upper.position.set(0, sh, -0.03); grp.add(upper);
  const lower = new THREE.Group(); lower.position.set(0, 0, 0.01); grp.add(lower);
  for (const [sash, yb] of [[upper, 0], [lower, 0]]) {
    const add = (g, m, x, y, z) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); sash.add(mesh); return mesh; };
    add(boxGeo(wdt, 0.05, 0.04, 0.5), frameMat, 0, yb + 0.025, 0);
    add(boxGeo(wdt, 0.04, 0.04, 0.5), frameMat, 0, yb + sh - 0.02, 0);
    add(boxGeo(0.045, sh, 0.04, 0.5), frameMat, -wdt / 2 + 0.0225, yb + sh / 2, 0);
    add(boxGeo(0.045, sh, 0.04, 0.5), frameMat, wdt / 2 - 0.0225, yb + sh / 2, 0);
    add(boxGeo(0.02, sh - 0.08, 0.025, 0.5), frameMat, 0, yb + sh / 2, 0);
    const glass = add(new THREE.PlaneGeometry(wdt - 0.08, sh - 0.08), M.glass, 0, yb + sh / 2, 0);
    glass.renderOrder = 5;
    const dirt = add(new THREE.PlaneGeometry(wdt - 0.08, sh - 0.08), M.glassDirt, 0, yb + sh / 2, 0.003);
    dirt.renderOrder = 6;
    sash.userData.glass = glass;
  }
  const lock = mk(boxGeo(0.06, 0.015, 0.03), M.chrome, 0, sh + 0.01, 0.04);
  grp.position.set(o.x, o.y0, o.z);
  grp.rotation.y = o.ry ?? 0;
  G.world.root.add(grp);
  return { group: grp, lower, upper, width: wdt, height: hgt };
}

export function ceilingFixture(pos, o = {}) {
  // dome fixture with a spot light + fill
  const glow = glowMat(0xfff4e0, 0xffe2b0, o.glow ?? 1.6);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(o.r ?? 0.17, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glow);
  dome.position.copy(pos); dome.position.y -= 0.005;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(o.r ?? 0.17, 0.012, 4, 16), M.chrome);
  rim.rotation.x = Math.PI / 2; rim.position.copy(pos); rim.position.y -= 0.01;
  G.world.root.add(dome, rim);
  const f = new Fixture({
    pos: pos.clone().add(new THREE.Vector3(0, -0.12, 0)), spot: true, shadow: o.shadow ?? false, shadowSize: o.shadowSize ?? 512,
    intensity: o.intensity ?? 10, distance: o.distance ?? 8, angle: o.angle ?? 1.2, penumbra: 0.9, color: o.color ?? 0xffd7a0,
    fill: o.fill ?? 0.35, bulbMats: [glow], name: o.name, room: o.room, on: o.on ?? true,
  });
  f.meshes = [dome, rim];
  return f;
}

export function bareBulb(pos, o = {}) {
  const glow = glowMat(0xffffff, 0xffd8a0, 3);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glow);
  bulb.position.copy(pos);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, o.cord ?? 0.5, 4), M.black);
  cord.position.copy(pos).add(new THREE.Vector3(0, (o.cord ?? 0.5) / 2 + 0.03, 0));
  G.world.root.add(bulb, cord);
  const f = new Fixture({ pos: pos.clone(), intensity: o.intensity ?? 7, distance: o.distance ?? 7, color: o.color ?? 0xffcf90, bulbMats: [glow], shadow: o.shadow ?? false, name: o.name, room: o.room, on: o.on ?? true });
  f.meshes = [bulb, cord];
  return f;
}

export function tableLamp(pos, o = {}) {
  const grp = new THREE.Group();
  const base = new THREE.Mesh(cylGeo(0.06, 0.03, 10), M.chrome);
  base.position.y = 0.015;
  const stem = new THREE.Mesh(cylGeo(0.01, 0.28, 6), M.chrome); stem.position.y = 0.17;
  const glow = glowMat(0xf0e0c0, 0xffc880, o.glow ?? 1.2);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.17, 12, 1, true), glow);
  shade.material.side = THREE.DoubleSide;
  shade.position.y = 0.34;
  grp.add(base, stem, shade);
  grp.position.copy(pos);
  G.world.root.add(grp);
  const f = new Fixture({ pos: pos.clone().add(new THREE.Vector3(0, 0.33, 0)), intensity: o.intensity ?? 3.2, distance: o.distance ?? 4.5, color: 0xffc078, bulbMats: [glow], name: o.name, room: o.room, on: o.on ?? true, shadow: o.shadow ?? false });
  const btn = new Button(grp, { name: 'lamp', label: () => (f.on ? 'Turn off lamp' : 'Turn on lamp'), onUse: () => { f.toggle(); sfx('switch', { pos, vol: 0.4 }); G.events?.emit?.('lamp'); } });
  f.button = btn; f.group = grp;
  return f;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
