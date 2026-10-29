// Furniture builders. Each works in a local frame whose origin is the centre of
// the footprint on the floor with the front facing local +z.
import * as THREE from 'three';
import { turnedLeg, bentRail, shakerGeo, barPull, knobGeo, castorGeo, drapeGeo, lathe, softBox } from '../gfx/shapes.js';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { Door, Drawer, Button } from './interactables.js';
import { boxGeo, roundedBox, cylGeo, place } from '../gfx/geo.js';
import { Fixture, glowMat } from './lights.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

function worldYaw(b, local = 0) { return (b.frame ? b.frame.ry : 0) + local; }
function wpos(b, x, y, z) { const p = b.toWorld(x, y, z); return new THREE.Vector3(p[0], p[1], p[2]); }

// hollow carcass: sides, back, bottom, top, shelves. Returns interior info.
export function carcass(b, w, h, d, y0, mat, { shelves = 1, top = true, thick = 0.018, back = true, kick = 0, crown = false } = {}) {
  const t = thick, ts = mat.userData.ws || 1;
  // eased edges on every board, so the front reads as joinery, not a cube
  const board = (x, y, z, bw, bh, bd, o = {}) => { b.geo(softBox(bw, bh, bd, o.r ?? 0.004, ts), o.mat || mat, { x, y, z, cast: o.cast ?? true }); if (o.collide !== false) b.collider(x, y, z, bw, bh, bd); };
  board(-w / 2 + t / 2, y0 + h / 2, 0, t, h, d);
  board(w / 2 - t / 2, y0 + h / 2, 0, t, h, d);
  if (back) b.box(0, y0 + h / 2, -d / 2 + t / 2, w - 2 * t, h, t, mat);
  board(0, y0 + kick + t / 2, 0, w - 2 * t, t, d);
  if (kick) b.box(0, y0 + kick / 2, d / 2 - 0.05, w, kick, 0.02, M.black, { collide: false });
  if (top) board(0, y0 + h - t / 2, 0, w - 2 * t, t, d);
  for (let i = 1; i <= shelves; i++) {
    const sy = y0 + kick + (h - kick) * (i / (shelves + 1));
    board(0, sy, 0.0, w - 2 * t, t, d - 0.04, { r: 0.003 });
    // a lipped front edge on each shelf
    board(0, sy - 0.004, d / 2 - 0.03, w - 2 * t, t + 0.012, 0.016, { r: 0.004, collide: false, cast: false });
  }
  if (crown) {
    // stepped cornice: frieze, bead, cap overhanging front and sides
    const yt = y0 + h;
    board(0, yt + 0.02, 0.004, w + 0.01, 0.04, d + 0.008, { r: 0.004, collide: false });
    b.geo(cylGeo(0.009, w + 0.03, 8, null, ts), mat, { x: 0, y: yt + 0.044, z: d / 2 + 0.012, rz: Math.PI / 2 });
    board(0, yt + 0.06, 0.01, w + 0.05, 0.022, d + 0.03, { r: 0.006, collide: false });
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
  // an 'R' panel is turned half round, so its outer face is local -z
  const fz = side === 'L' ? 1 : -1;
  const door = new Door({
    hinge, width: w, height: h, thick: t, closedYaw, openDir, maxAngle: o.max ?? 1.9,
    mat, kind: o.kind || 'cabinet', label: o.label || 'cabinet', knob: false, locked: o.locked,
    soundOpen: o.soundOpen, soundClose: o.soundClose,
    buildPanel: (panel, d) => {
      // fridge doors are rounded enamel slabs; everything else is a Shaker door
      const fridgeDoor = (o.kind || '') === 'fridge';
      const g = fridgeDoor ? roundedBox(w - 0.004, h - 0.004, t, 0.03) : shakerGeo(w - 0.004, h - 0.004, t, Math.min(0.07, w * 0.16));
      const m = new THREE.Mesh(g, fridgeDoor ? mat : (mat === M.cabinetDoor ? M.cabinet : mat));
      m.position.set(w / 2, h / 2, 0);
      m.castShadow = true; m.receiveShadow = true;
      panel.add(m);
      if (o.handle !== false) {
        const len = o.handleLen ?? 0.1;
        const hm = new THREE.Mesh(barPull(fridgeDoor ? len : Math.max(0.08, len), fridgeDoor ? 0.009 : 0.005), o.handleMat || M.chrome);
        hm.rotation.set(fz > 0 ? 0 : Math.PI, 0, Math.PI / 2);
        hm.position.set(w - (fridgeDoor ? 0.05 : 0.035), o.handleY ?? (h - 0.09), fz * t / 2);
        panel.add(hm);
      }
      if (o.decorate) o.decorate(panel, d, fz);
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
      b.geo(roundedBox(m.w, ctop, d + 0.03, 0.012), M.counter, { x: mx, y: h + ctop / 2, z: 0.01 });
      b.collider(mx, h + ctop / 2, 0.01, m.w, ctop, d + 0.03);
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
  add(shakerGeo(w, h, 0.02, Math.min(0.05, h * 0.22)), mat === M.cabinetDoor ? M.cabinet : mat, 0, 0, d / 2);
  add(boxGeo(w - 0.04, t, d - 0.02, 0.5), mat, 0, -h / 2 + t, 0);
  add(boxGeo(t, h * 0.7, d - 0.02, 0.5), mat, -w / 2 + 0.03, -h * 0.15, 0);
  add(boxGeo(t, h * 0.7, d - 0.02, 0.5), mat, w / 2 - 0.03, -h * 0.15, 0);
  add(boxGeo(w - 0.04, h * 0.7, t, 0.5), mat, 0, -h * 0.15, -d / 2 + 0.01);
  add(barPull(Math.min(0.14, w * 0.4), 0.005), M.chrome, 0, h * 0.15, d / 2 + 0.01);
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
  // the rounded '90s cabinet: soft corners, a kick grille, a top cap
  for (const sx of [-1, 1]) b.geo(roundedBox(0.05, h, d, 0.022), M.enamel, { x: sx * (w / 2 - 0.022), y: h / 2, z: 0, cast: true });
  b.geo(roundedBox(w, 0.05, d, 0.022), M.enamel, { x: 0, y: h - 0.022, z: 0 });
  b.box(0, 0.05, d / 2 - 0.01, w - 0.08, 0.07, 0.012, M.plasticDark, { collide: false });
  for (let i = 0; i < 9; i++) b.box(-w / 2 + 0.08 + i * 0.07, 0.05, d / 2 - 0.004, 0.035, 0.05, 0.004, M.black, { collide: false });
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
    decorate: (panel, d, fz) => {
      // door shelves on the inside
      if (y0 < 1) {
        for (const yy of [0.28, 0.62, 0.92]) {
          const s = new THREE.Mesh(boxGeo(w - 0.12, 0.08, 0.09, 0.5), M.porcelain);
          s.position.set(w / 2, yy, -fz * 0.075);
          panel.add(s);
        }
      }
      // magnets / note on the front
      if (y0 < 1 && M.fridgeNote) {
        const note = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), M.fridgeNote);
        note.position.set(w * 0.45, 0.62, fz * 0.031);
        note.rotation.set(0, fz > 0 ? 0 : Math.PI, 0.06);
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
  // enamel body with softened edges, a recessed cooktop, an oven door with a window
  b.geo(roundedBox(w, h - 0.04, d, 0.02), M.enamelYellow, { x: 0, y: (h - 0.04) / 2, z: 0 });
  b.collider(0, h / 2, 0, w, h, d);
  b.geo(roundedBox(w - 0.02, 0.025, d - 0.02, 0.008), M.black, { x: 0, y: h - 0.01, z: 0 });
  b.box(0, 0.05, d / 2 + 0.002, w - 0.06, 0.08, 0.01, M.black, { collide: false });             // drawer kick
  b.geo(roundedBox(w - 0.06, 0.5, 0.03, 0.012), M.enamelYellow, { x: 0, y: 0.38, z: d / 2 + 0.012 }); // oven door
  b.geo(roundedBox(w - 0.22, 0.24, 0.012, 0.01), M.blackGloss, { x: 0, y: 0.4, z: d / 2 + 0.03 });     // window
  b.geo(barPull(w - 0.24, 0.01), M.chrome, { x: 0, y: 0.6, z: d / 2 + 0.024 });
  // backguard with a clock panel
  b.geo(roundedBox(w, 0.2, 0.07, 0.015), M.enamelYellow, { x: 0, y: h + 0.1, z: -d / 2 + 0.04 });
  b.box(0, h + 0.13, -d / 2 + 0.077, 0.14, 0.07, 0.006, M.blackGloss, { collide: false });
  const burners = [];
  const pos = [[-0.19, -0.13], [0.19, -0.13], [-0.19, 0.14], [0.19, 0.14]];
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = pos[i];
    // drip pan, burner cap, and a cast-iron grate with four fingers
    b.geo(lathe([[0.001, 0], [0.09, 0], [0.095, 0.012], [0.07, 0.004], [0.001, 0.004]], 18), M.steel, { x: bx, y: h + 0.003, z: bz });
    b.geo(lathe([[0.001, 0], [0.045, 0], [0.048, 0.012], [0.035, 0.022], [0.001, 0.024]], 14), M.black, { x: bx, y: h + 0.006, z: bz });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      b.geo(roundedBox(0.11, 0.012, 0.014, 0.004), M.black, { x: bx + Math.cos(a) * 0.06, y: h + 0.045, z: bz + Math.sin(a) * 0.06, ry: -a, cast: false });
    }
    b.geo(new THREE.TorusGeometry(0.1, 0.007, 4, 16), M.black, { x: bx, y: h + 0.04, z: bz, rx: Math.PI / 2, cast: false });
    const center = wpos(b, bx, h + 0.052, bz);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x4a7dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 18), flameMat);
    flame.rotation.x = Math.PI / 2; flame.position.copy(center).add(new THREE.Vector3(0, -0.012, 0));
    G.world.root.add(flame);
    burners.push({ center, on: false, flame, flameMat, heat: 0, i });
  }
  // knobs as buttons
  const knobs = [];
  for (let i = 0; i < 4; i++) {
    const kx = -0.27 + i * 0.18;
    const kp = wpos(b, kx, h + 0.08, -d / 2 + 0.075);
    const km = new THREE.Mesh(knobGeo(0.02), M.plasticDark);
    const grp = new THREE.Group(); grp.position.copy(kp); grp.rotation.y = worldYaw(b);
    grp.add(km);
    const tick = new THREE.Mesh(boxGeo(0.004, 0.016, 0.004), M.paperWhite); tick.position.set(0, 0.01, 0.038); grp.add(tick);
    G.world.root.add(grp);
    const burner = burners[[2, 0, 1, 3][i]];
    const btn = new Button(grp, {
      name: 'knob', label: () => (burner.on ? 'Turn burner off' : 'Turn burner on'),
      onUse: () => {
        burner.on = !burner.on;
        km.rotation.z = burner.on ? -1.2 : 0;
        tick.position.set(burner.on ? -0.009 : 0, burner.on ? 0.005 : 0.01, 0.038);
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
  // a tapered canopy and its flue
  const g = new THREE.CylinderGeometry(0.28, 0.54, 0.22, 4, 1); g.rotateY(Math.PI / 4); g.scale(1, 1, 0.62);
  b.geo(g, M.enamelYellow, { x: 0, y: 1.66, z: -0.12 });
  b.geo(roundedBox(0.78, 0.04, 0.5, 0.01), M.enamelYellow, { x: 0, y: 1.54, z: -0.12 });
  b.box(0, 1.52, -0.08, 0.6, 0.006, 0.34, M.steel, { collide: false });
  b.geo(roundedBox(0.3, 0.34, 0.26, 0.02), M.enamelYellow, { x: 0, y: 1.94, z: -0.2 });
  b.endFrame();
}

export function couch(b, x, z, ry, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const w = o.w ?? 2.0, d = 0.9;
  const fab = o.mat || M.couchFabric;
  const inner = w - 0.36;
  // frame and skirt
  b.geo(roundedBox(w - 0.3, 0.24, d - 0.12, 0.04), fab, { x: 0, y: 0.21, z: 0.03 });
  // three seat cushions with gaps between them, slightly crowned
  const cw = inner / 3;
  for (let i = 0; i < 3; i++) {
    const cx = -inner / 2 + cw * (i + 0.5);
    b.geo(roundedBox(cw - 0.012, 0.15, d - 0.3, 0.06), fab, { x: cx, y: 0.405, z: 0.1, rz: (i - 1) * 0.01 });
  }
  // three back cushions leaning back, plumper at the top
  for (let i = 0; i < 3; i++) {
    const cx = -inner / 2 + cw * (i + 0.5);
    b.geo(roundedBox(cw - 0.014, 0.44, 0.2, 0.08), fab, { x: cx, y: 0.66, z: -d / 2 + 0.2, rx: -0.16, ry: (i - 1) * -0.02 });
  }
  b.geo(roundedBox(w - 0.3, 0.42, 0.12, 0.04), fab, { x: 0, y: 0.6, z: -d / 2 + 0.07 });
  // rolled arms: a panel topped with a cylinder roll
  for (const sx of [-1, 1]) {
    b.geo(roundedBox(0.15, 0.48, d - 0.04, 0.05), fab, { x: sx * (w / 2 - 0.09), y: 0.3, z: 0 });
    b.geo(cylGeo(0.095, d - 0.02, 14), fab, { x: sx * (w / 2 - 0.1), y: 0.55, z: 0, rx: Math.PI / 2 });
  }
  // short turned legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(turnedLeg(0.1, 0.022), M.woodDark, { x: sx * (w / 2 - 0.1), y: 0, z: sz * (d / 2 - 0.1) });
  b.collider(0, 0.27, 0, w, 0.54, d);
  b.collider(0, 0.6, -d / 2 + 0.12, w, 0.6, 0.24);
  // throw pillow
  b.geo(roundedBox(0.38, 0.34, 0.12, 0.06), M.quilt, { x: -w / 2 + 0.38, y: 0.62, z: -0.16, rx: -0.3, ry: 0.25 });
  b.endFrame();
  return { seat: wpos(b, 0, 0.5, 0.1) };
}

export function table(b, x, z, ry, w, d, h, mat = M.woodTable, o = {}) {
  b.beginFrame(x, 0, z, ry);
  // top with a softened edge and a slight overhang lip
  b.geo(roundedBox(w, 0.032, d, 0.012), mat, { x: 0, y: h - 0.016, z: 0 });
  b.geo(roundedBox(w - 0.03, 0.012, d - 0.03, 0.004), mat, { x: 0, y: h - 0.036, z: 0 });
  b.collider(0, h - 0.02, 0, w, 0.04, d);
  const leg = o.leg ?? 0.05;
  const lh = h - 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * (w / 2 - 0.06), lz = sz * (d / 2 - 0.06);
    // square block under the apron, turned below it
    b.box(lx, lh - 0.06, lz, leg * 0.9, 0.12, leg * 0.9, mat, { collide: false });
    b.geo(turnedLeg(lh - 0.12, leg * 0.42), mat, { x: lx, y: 0, z: lz });
    b.collider(lx, lh / 2, lz, leg, lh, leg);
  }
  if (o.apron !== false) {
    b.geo(roundedBox(w - 0.14, 0.075, 0.02, 0.006), mat, { x: 0, y: h - 0.085, z: d / 2 - 0.06 });
    b.geo(roundedBox(w - 0.14, 0.075, 0.02, 0.006), mat, { x: 0, y: h - 0.085, z: -d / 2 + 0.06 });
    b.geo(roundedBox(0.02, 0.075, d - 0.14, 0.006), mat, { x: w / 2 - 0.06, y: h - 0.085, z: 0 });
    b.geo(roundedBox(0.02, 0.075, d - 0.14, 0.006), mat, { x: -w / 2 + 0.06, y: h - 0.085, z: 0 });
  }
  b.endFrame();
  return { top: h };
}

export function bookshelf(b, x, z, ry, o = {}) {
  b.beginFrame(x, 0, z, ry);
  const w = o.w ?? 0.9, d = 0.3, h = o.h ?? 1.8;
  carcass(b, w, h, d, 0, M.woodDark, { shelves: 4, kick: 0.05, crown: true });
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
      b.geo(softBox(bw, bh, 0.17 + rng() * 0.05, 0.003), mats[Math.floor(rng() * mats.length)], { x: bx + bw / 2, y: sy + bh / 2, z: 0, rz: lean, cast: false });
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
  const wood = M.woodDark;
  // side rails and slats on tall legs: a cat fits underneath
  for (const sx of [-1, 1]) b.geo(roundedBox(0.05, 0.14, L, 0.012), wood, { x: sx * (w / 2 - 0.025), y: 0.28, z: 0, cast: true });
  b.box(0, 0.32, 0, w - 0.1, 0.02, L - 0.06, wood, { collide: false });
  // posts: turned, taller at the head
  for (const sx of [-1, 1]) {
    b.geo(turnedLeg(1.12, 0.03), wood, { x: sx * (w / 2), y: 0, z: -L / 2 - 0.02 });
    b.geo(turnedLeg(0.62, 0.028), wood, { x: sx * (w / 2), y: 0, z: L / 2 + 0.02 });
    b.geo(new THREE.SphereGeometry(0.04, 10, 8), wood, { x: sx * (w / 2), y: 1.14, z: -L / 2 - 0.02 });
    b.geo(new THREE.SphereGeometry(0.036, 10, 8), wood, { x: sx * (w / 2), y: 0.64, z: L / 2 + 0.02 });
  }
  // headboard: top rail, bottom rail, spindles between
  b.geo(roundedBox(w - 0.04, 0.09, 0.05, 0.02), wood, { x: 0, y: 1.0, z: -L / 2 - 0.02 });
  b.geo(roundedBox(w - 0.04, 0.07, 0.04, 0.015), wood, { x: 0, y: 0.6, z: -L / 2 - 0.02 });
  for (let i = 0; i < 9; i++) b.geo(cylGeo(0.012, 0.33, 6), wood, { x: -w / 2 + 0.14 + i * ((w - 0.28) / 8), y: 0.79, z: -L / 2 - 0.02 });
  // footboard panel
  b.geo(roundedBox(w - 0.04, 0.07, 0.04, 0.015), wood, { x: 0, y: 0.56, z: L / 2 + 0.02 });
  b.geo(roundedBox(w - 0.06, 0.2, 0.025, 0.008), wood, { x: 0, y: 0.42, z: L / 2 + 0.02 });
  b.collider(0, 0.6, -L / 2 - 0.02, w + 0.06, 1.2, 0.06);
  b.collider(0, 0.33, L / 2 + 0.02, w + 0.04, 0.66, 0.05);
  // mattress, a quilt that hangs over the edges, pillows with dents
  b.geo(roundedBox(w - 0.06, 0.22, L - 0.06, 0.06), M.bedsheet, { x: 0, y: 0.44, z: 0 });
  b.geo(drapeGeo(w - 0.04, L - 0.5, 0.2, { seed: 5 }), M.quilt, { x: 0, y: 0.55, z: 0.22 });
  for (const [px, pz, rx, ryy] of [[-0.33, -L / 2 + 0.28, 0.15, 0.04], [0.33, -L / 2 + 0.3, 0.12, -0.06]]) {
    const pg = roundedBox(0.58, 0.13, 0.38, 0.06);
    const pp = pg.attributes.position;
    for (let k = 0; k < pp.count; k++) { const yy = pp.getY(k); if (yy > 0.03) pp.setY(k, yy - 0.035 * Math.exp(-((pp.getX(k)) ** 2 + (pp.getZ(k)) ** 2) / 0.02)); }
    pg.computeVertexNormals();
    b.geo(pg, M.bedsheet, { x: px, y: 0.61, z: pz, rx, ry: ryy });
  }
  b.collider(0, 0.39, 0, w, 0.36, L);
  b.collider(0, 0.1, 0, w, 0.2, L * 0.8);
  b.endFrame();
  return { pillow: wpos(b, -0.2, 0.71, -L / 2 + 0.3), mattressY: 0.55, center: wpos(b, 0, 0.55, 0) };
}

export function nightstand(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 0.45, d = 0.4, h = 0.56;
  const wood = M.woodLight;
  // a top with an overhang, a box on tapered legs, an open shelf, one drawer
  b.geo(roundedBox(w + 0.03, 0.025, d + 0.02, 0.01), wood, { x: 0, y: h - 0.012, z: 0 });
  for (const sx of [-1, 1]) b.geo(roundedBox(0.018, 0.3, d - 0.02, 0.005), wood, { x: sx * (w / 2 - 0.009), y: h - 0.17, z: 0 });
  b.box(0, h - 0.32, 0, w - 0.03, 0.016, d - 0.03, wood);
  b.box(0, h - 0.17, -d / 2 + 0.01, w - 0.03, 0.3, 0.01, wood, { collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(lathe([[0.016, 0], [0.012, 0.02], [0.018, 0.24], [0.02, 0.26]], 8), wood, { x: sx * (w / 2 - 0.03), y: 0, z: sz * (d / 2 - 0.03) });
  b.box(0, 0.14, 0, w - 0.06, 0.014, d - 0.06, wood);
  b.collider(0, h / 2, 0, w, h, d);
  const grp = drawerBox(b, w - 0.04, 0.14, d - 0.05, wood);
  grp.position.copy(wpos(b, 0, h - 0.1, 0.025)); grp.rotation.y = worldYaw(b);
  G.world.root.add(grp);
  const yaw = worldYaw(b);
  const dr = new Drawer({ group: grp, axis: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), max: 0.3, size: [w - 0.04, 0.14, d - 0.05], label: 'drawer' });
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
  b.geo(roundedBox(w + 0.06, 0.05, d + 0.04, 0.012), M.woodDark, { x: 0, y: h + 0.02, z: 0.01 });
  b.geo(roundedBox(w + 0.03, 0.03, d + 0.02, 0.008), M.woodDark, { x: 0, y: h - 0.01, z: 0.005 });
  b.geo(roundedBox(w + 0.02, 0.09, d + 0.02, 0.01), M.woodDark, { x: 0, y: 0.045, z: 0.005 });
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
  b.geo(roundedBox(w, 0.032, d, 0.012), M.woodTable, { x: 0, y: h - 0.016, z: 0 });
  b.collider(0, h - 0.016, 0, w, 0.032, d);
  for (const sz of [-1, 1]) { b.geo(turnedLeg(h - 0.03, 0.022), M.woodTable, { x: -w / 2 + 0.05, y: 0, z: sz * (d / 2 - 0.05) }); b.collider(-w / 2 + 0.05, (h - 0.03) / 2, sz * (d / 2 - 0.05), 0.05, h - 0.03, 0.05); }
  b.geo(roundedBox(0.03, 0.07, d - 0.12, 0.008), M.woodTable, { x: -w / 2 + 0.05, y: h - 0.07, z: 0 });
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
  // a turned-leg kitchen chair with a bent top rail and spindles
  b.beginFrame(x, 0, z, ry);
  b.geo(roundedBox(0.44, 0.035, 0.41, 0.014), mat, { x: 0, y: 0.448, z: 0.01 });
  b.geo(roundedBox(0.4, 0.012, 0.36, 0.005), mat, { x: 0, y: 0.47, z: 0.02 });     // saddle
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.geo(turnedLeg(0.43, 0.019), mat, { x: sx * 0.185, y: 0, z: sz * 0.165, rz: sx * 0.05, rx: -sz * 0.04 });
  }
  // stretchers
  for (const sx of [-1, 1]) b.geo(cylGeo(0.009, 0.33, 6), mat, { x: sx * 0.19, y: 0.15, z: 0, rx: Math.PI / 2 });
  b.geo(cylGeo(0.009, 0.38, 6), mat, { x: 0, y: 0.17, z: 0, rz: Math.PI / 2 });
  // back: two posts, a bent top rail, four spindles
  for (const sx of [-1, 1]) b.geo(turnedLeg(0.46, 0.016), mat, { x: sx * 0.185, y: 0.46, z: -0.175, rx: -0.12 });
  b.geo(bentRail(0.42, 0.04, 0.03, 0.016, 0.055), mat, { x: 0, y: 0.9, z: -0.23 });
  for (let i = 0; i < 4; i++) b.geo(cylGeo(0.0075, 0.4, 6), mat, { x: -0.1 + i * 0.067, y: 0.67, z: -0.2, rx: -0.12 });
  b.collider(0, 0.24, 0, 0.44, 0.48, 0.42);
  b.endFrame();
}

export function officeChair(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.CylinderGeometry(0.012, 0.022, 0.3, 4, 1); leg.rotateZ(Math.PI / 2); leg.scale(1, 1.4, 1.8);
    b.geo(leg, M.plasticDark, { x: Math.cos(a) * 0.15, y: 0.07, z: Math.sin(a) * 0.15, ry: -a, cast: false });
    b.geo(castorGeo(), M.plasticDark, { x: Math.cos(a) * 0.29, y: 0, z: Math.sin(a) * 0.29, ry: -a + 0.6, cast: false });
  }
  b.geo(lathe([[0.04, 0.06], [0.05, 0.1], [0.028, 0.12], [0.028, 0.3], [0.032, 0.36], [0.03, 0.4]], 10), M.chrome, { x: 0, y: 0, z: 0 });
  b.geo(roundedBox(0.2, 0.04, 0.2, 0.01), M.plasticDark, { x: 0, y: 0.4, z: 0 });
  // contoured seat cushion and a curved, padded back
  const seat = roundedBox(0.5, 0.08, 0.48, 0.035); { const p = seat.attributes.position; for (let k = 0; k < p.count; k++) { const yy = p.getY(k); if (yy > 0.02) p.setY(k, yy - 0.015 * (1 - (p.getX(k) / 0.25) ** 2) * (1 - (p.getZ(k) / 0.24) ** 2)); } seat.computeVertexNormals(); }
  b.geo(seat, M.couchFabric, { x: 0, y: 0.46, z: 0 });
  const back = roundedBox(0.44, 0.52, 0.07, 0.03); { const p = back.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) + 0.05 * (p.getX(k) / 0.22) ** 2); back.computeVertexNormals(); }
  b.geo(back, M.couchFabric, { x: 0, y: 0.86, z: -0.25, rx: -0.12 });
  b.geo(roundedBox(0.06, 0.34, 0.03, 0.01), M.plasticDark, { x: 0, y: 0.6, z: -0.27, rx: -0.1 });
  for (const sx of [-1, 1]) {
    b.geo(roundedBox(0.03, 0.2, 0.03, 0.008), M.plasticDark, { x: sx * 0.24, y: 0.58, z: -0.02 });
    b.geo(roundedBox(0.06, 0.03, 0.26, 0.012), M.plasticDark, { x: sx * 0.24, y: 0.69, z: 0.0 });
  }
  b.collider(0, 0.3, 0, 0.5, 0.6, 0.5);
  b.endFrame();
}

export function tvStand(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const w = 1.0, h = 0.52, d = 0.45;
  carcass(b, w, h - 0.03, d, 0.06, M.woodDark, { shelves: 1, top: false });
  b.geo(roundedBox(w + 0.03, 0.03, d + 0.02, 0.01), M.woodDark, { x: 0, y: h - 0.015, z: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(lathe([[0.02, 0], [0.016, 0.03], [0.024, 0.06]], 8), M.woodDark, { x: sx * (w / 2 - 0.04), y: 0, z: sz * (d / 2 - 0.04) });
  b.collider(0, h / 2, 0, w, h, d);
  b.endFrame();
  return { top: wpos(b, 0, h, 0) };
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
  // a rolled rim and a rounded apron
  for (const sx of [-1, 1]) b.geo(cylGeo(0.04, L, 10), M.porcelain, { x: sx * (w / 2 - 0.03), y: h, z: 0, rx: Math.PI / 2, cast: false });
  for (const sz of [-1, 1]) b.geo(cylGeo(0.04, w - 0.06, 10), M.porcelain, { x: 0, y: h, z: sz * (L / 2 - 0.03), rz: Math.PI / 2, cast: false });
  b.geo(roundedBox(0.02, h - 0.06, L - 0.08, 0.01), M.porcelain, { x: w / 2 + 0.002, y: h / 2, z: 0, cast: false });
  b.geo(cylGeo(0.02, 0.15, 8), M.chrome, { x: 0, y: h + 0.25, z: -L / 2 + 0.06, rx: Math.PI / 2 - 0.3 });
  b.geo(cylGeo(0.035, 0.02, 10), M.chrome, { x: 0, y: h + 0.28, z: -L / 2 + 0.13, rx: -0.3 });
  b.geo(cylGeo(0.02, 0.012, 8), M.chrome, { x: -0.1, y: h + 0.12, z: -L / 2 + 0.01, rx: Math.PI / 2 });
  b.geo(cylGeo(0.02, 0.012, 8), M.chrome, { x: 0.1, y: h + 0.12, z: -L / 2 + 0.01, rx: Math.PI / 2 });
  b.endFrame();
  return { floorY: 0.14, center: wpos(b, 0, 0.14, 0) };
}

export function toilet(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  // a turned pedestal flaring into the bowl, a rolled seat and lid, the tank
  b.geo(lathe([[0.12, 0], [0.13, 0.02], [0.1, 0.12], [0.11, 0.24], [0.17, 0.34], [0.19, 0.38], [0.001, 0.38]], 20), M.porcelain, { x: 0, y: 0, z: 0.06 });
  const seat = new THREE.TorusGeometry(0.16, 0.028, 8, 24); seat.rotateX(Math.PI / 2); seat.scale(1, 0.55, 1.18);
  b.geo(seat, M.porcelain, { x: 0, y: 0.4, z: 0.08 });
  b.geo(roundedBox(0.36, 0.025, 0.42, 0.012), M.porcelain, { x: 0, y: 0.43, z: -0.06, rx: -1.35 });
  b.geo(roundedBox(0.42, 0.36, 0.18, 0.03), M.porcelain, { x: 0, y: 0.6, z: -0.18 });
  b.geo(roundedBox(0.45, 0.035, 0.2, 0.012), M.porcelain, { x: 0, y: 0.8, z: -0.18 });
  b.collider(0, 0.4, -0.05, 0.42, 0.8, 0.6);
  const lever = new THREE.Mesh(barPull(0.07, 0.005), M.chrome);
  lever.position.copy(wpos(b, -0.17, 0.72, -0.09)); lever.rotation.y = worldYaw(b);
  G.world.root.add(lever);
  new Button(lever, { name: 'flush', label: 'Flush', onUse: () => sfx('flush', { pos: lever.position, vol: 0.8 }) });
  b.endFrame();
}

export function pedestalSink(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  b.geo(lathe([[0.13, 0], [0.12, 0.03], [0.07, 0.12], [0.06, 0.4], [0.08, 0.66], [0.14, 0.76]], 16), M.porcelain, { x: 0, y: 0, z: -0.02 });
  b.geo(roundedBox(0.56, 0.16, 0.44, 0.07), M.porcelain, { x: 0, y: 0.82, z: 0.02 });
  b.geo(lathe([[0.001, 0], [0.19, 0], [0.2, 0.012], [0.001, 0.012]], 20), M.steel, { x: 0, y: 0.9, z: 0.04, cast: false });
  // a gooseneck spout and two cross taps
  const spout = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.9, -0.15), new THREE.Vector3(0, 1.03, -0.14), new THREE.Vector3(0, 1.05, -0.08), new THREE.Vector3(0, 1.0, -0.04)]), 12, 0.011, 6);
  b.geo(spout, M.chrome, {});
  for (const sx of [-1, 1]) { b.geo(cylGeo(0.012, 0.05, 8), M.chrome, { x: sx * 0.11, y: 0.93, z: -0.15 }); b.geo(roundedBox(0.06, 0.01, 0.012, 0.004), M.chrome, { x: sx * 0.11, y: 0.96, z: -0.15 }); b.geo(roundedBox(0.012, 0.01, 0.06, 0.004), M.chrome, { x: sx * 0.11, y: 0.96, z: -0.15 }); }
  b.collider(0, 0.45, 0, 0.56, 0.9, 0.46);
  b.endFrame();
  return { basin: wpos(b, 0, 0.91, 0.04), tap: wpos(b, 0, 1.04, -0.04) };
}

export function floorLamp(b, x, z) {
  b.beginFrame(x, 0, z, 0);
  b.geo(lathe([[0.15, 0], [0.15, 0.012], [0.11, 0.03], [0.03, 0.05], [0.018, 0.09]], 18), M.plasticDark, { x: 0, y: 0, z: 0 });
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
