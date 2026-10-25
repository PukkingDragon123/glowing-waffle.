// Real furniture for apartment 4B from the CC0 model set: placement, colliders
// and the moving parts (drawers, clock hands, fan blades, lids), plus the
// little machines (radio, microwave, kettle). Each function returns null when
// its model is missing so the caller can fall back to procedural furniture.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { prop, pivot, detach, at, has } from './props.js';
import { Button, Drawer } from './interactables.js';
import { Seat, Pushable } from './seats.js';
import { softBox } from '../gfx/shapes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const loop = (n, o) => (G.audio ? G.audio.loop(n, o) : { stop() {}, set() {} });

// a static box in a prop's own frame (x across, y up, z front)
function block(p, x, y, z, w, h, d) {
  const c = at(p, x, y, z);
  return G.physics.addStaticBox(c.x, c.y, c.z, w / 2, h / 2, d / 2, p.group.rotation.y);
}
const yawOf = (p) => p.group.rotation.y;

// ---------------------------------------------------------------- living room
export function sofa() {
  if (!has('sofa')) return null;
  const p = prop('sofa', { x: 6.3, z: 1.2, ry: -Math.PI / 2, scale: 0.8, collide: false });
  const W = p.size.x, D = p.size.z;
  block(p, 0, 0.21, 0.04, W - 0.3, 0.42, D - 0.1);           // seat
  block(p, 0, 0.45, -D / 2 + 0.12, W, 0.9, 0.24);             // back
  for (const s of [-1, 1]) block(p, s * (W / 2 - 0.11), 0.33, 0, 0.22, 0.66, D); // arms
  // the two throw pillows, one against each arm
  for (const [nm, x, r] of [['throw_pillows_01_pillow01', -W / 2 + 0.42, 0.35], ['throw_pillows_01_pillow02', W / 2 - 0.42, -0.4]]) {
    prop('pillows', { only: [nm], parent: p.group, x, y: 0.42, z: -0.12, ry: r, scale: 0.8, collide: false });
  }
  new Seat(p.group, { name: 'sofa', label: 'Sit on the sofa', spots: () => [-0.62, 0, 0.62].map((x) => ({ pos: at(p, x * W / 2.2, 0.42, 0.06), yaw: yawOf(p), eye: 0.72 })) });
  return { p, seat: at(p, 0, 0.45, 0.08) };
}

export function armchair() {
  if (!has('armchair')) return null;
  const p = prop('armchair', { x: 4.5, z: 2.95, ry: -2.62, scale: 0.95 });
  new Seat(p.group, { name: 'armchair', label: 'Sit in the armchair', spots: () => [{ pos: at(p, 0, 0.47, 0.04), yaw: yawOf(p), eye: 0.7 }] });
  return p;
}

export function tvStand() {
  if (!has('tvStand')) return null;
  // the TV faces +x from the west wall
  const p = prop('tvStand', { x: 3.82, z: 1.1, ry: Math.PI / 2, scale: [1.32, 0.9, 1.25] });
  return { p, top: p.size.y };
}

// procedural books standing on a model's shelves
function books(parent, shelves, w, depth, seed = 7) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cols = [0x6a2a24, 0x2f3d5c, 0x44583a, 0x8a7448, 0x5c3a52, 0x2a2a2a, 0x9a8a70, 0x704028, 0xa84a30, 0x34505a];
  const mats = cols.map((c) => G.world.bookMats?.[c] || (G.world.bookMats = G.world.bookMats || {}, G.world.bookMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 1 })));
  for (const [y, gap] of shelves) {
    let x = -w / 2 + 0.02;
    while (x < w / 2 - 0.05) {
      if (rnd() < 0.1) { x += 0.05 + rnd() * 0.08; continue; }
      const bw = 0.02 + rnd() * 0.035, bh = Math.min(gap - 0.03, 0.17 + rnd() * 0.12), bd = Math.min(depth, 0.15 + rnd() * 0.06);
      const lean = rnd() < 0.08 ? 0.18 : 0;
      const m = new THREE.Mesh(softBox(bw, bh, bd, 0.003), mats[Math.floor(rnd() * mats.length)]);
      m.position.set(x + bw / 2, y + bh / 2 + (lean ? 0.01 : 0), depth / 2 - bd / 2 - 0.01); m.rotation.z = lean;
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      x += bw + 0.002;
    }
  }
}

export function bookshelf() {
  if (!has('bookshelf')) return null;
  const s = 1.8 / 2.06;
  const p = prop('bookshelf', { x: 4.6, z: 7.6 - 0.26, ry: Math.PI, fitH: 1.8 });
  const ys = [0.10, 0.40, 0.68, 0.96, 1.28, 1.66].map((y) => y * s);
  const tops = [0.40, 0.68, 0.96, 1.28, 1.66, 2.04].map((y) => y * s);
  books(p.group, ys.map((y, i) => [y, tops[i] - y - 0.02]), p.size.x - 0.12, p.size.z - 0.12, 3);
  return { p, top: p.size.y };
}

export function ceilingFan(apt) {
  if (!has('fan')) return null;
  const p = prop('fan', { x: 5.9, y: 2.7 - 0.52 * 1.0, z: 1.55, collide: false });
  const blades = pivot(p, 'ceiling_fan_blades');
  const fan = { p, blades, on: false, speed: 0, hum: null };
  const center = at(p, 0, 0.1, 0);
  new Button(p.group, {
    name: 'fan', reach: 2.6, label: () => (fan.on ? 'Turn the fan off' : 'Turn the fan on'),
    onUse: () => { fan.on = !fan.on; sfx('switch', { pos: center, vol: 0.5 }); },
  });
  G.world.updaters.push((dt) => {
    const want = fan.on && G.world.power !== false ? 7.5 : 0;
    fan.speed += (want - fan.speed) * Math.min(1, dt * (want > fan.speed ? 0.6 : 0.35));
    if (blades) blades.rotation.y += fan.speed * dt;
    if (fan.speed > 0.3 && !fan.hum) fan.hum = loop('fanHum', { pos: center, vol: 0 });
    if (fan.hum) { fan.hum.set({ vol: Math.min(0.5, fan.speed / 12), rate: 0.6 + fan.speed / 15 }); if (fan.speed < 0.2) { fan.hum.stop(0.5); fan.hum = null; } }
    // a draught for the curtains
    if (fan.speed > 1) G.windGust = Math.max(G.windGust || 0, fan.speed / 7.5 * 0.35);
  });
  apt.fan = fan;
  return fan;
}

export function wallClock() {
  if (!has('wallClock')) return null;
  const p = prop('wallClock', { x: 6.5, y: 1.95 - 0.16, z: 0.0, collide: false });
  const hand = (n) => pivot(p, n, [0, 0, 0]);
  return { g: p.group, hh: hand('wall_clock_hours_hand'), mh: hand('wall_clock_minute_hand'), sh: hand('wall_clock_second_hand') };
}

export function bigPlant() {
  if (!has('plantBig')) return null;
  return prop('plantBig', { x: 9.72, z: 7.18, fitH: 0.95, ry: 2.4, collide: [0.4, 0.6, 0.4] });
}

// AM radio. On by the fridge, a station that never changes its song.
export function boombox(x, y, z, ry) {
  if (!has('boombox')) return null;
  const p = prop('boombox', { x, y, z, ry, scale: 0.8, collide: false });
  const r = { p, on: false, h: null };
  const pos = at(p, 0, 0.2, 0);
  new Button(p.group, {
    name: 'radio', label: () => (r.on ? 'Turn the radio off' : 'Turn the radio on'),
    onUse: () => {
      r.on = !r.on;
      sfx('click', { pos, vol: 0.5 });
      if (r.on) { sfx('radioTune', { pos, vol: 0.35 }); r.h = loop('radioMusic', { pos, vol: 0.32, fade: 1.2 }); } else if (r.h) { r.h.stop(0.2); r.h = null; }
    },
  });
  r.off = () => { r.on = false; if (r.h) { r.h.stop(0.2); r.h = null; } };
  return r;
}

export function commode(apt) {
  if (!has('commode')) return null;
  const p = prop('commode', { x: 5.82, z: 7.6 - 0.27, ry: Math.PI, scale: 0.92, collide: false });
  block(p, 0, p.size.y / 2, -0.04, p.size.x, p.size.y, p.size.z - 0.08);
  const yaw = yawOf(p);
  const axis = V(Math.sin(yaw), 0, Math.cos(yaw));
  const drawers = [];
  for (const n of ['GothicCommode_01_door01', 'GothicCommode_01_door02', 'GothicCommode_01_door03']) {
    const g = detach(p, n);
    if (!g) continue;
    const s = g.userData.size;
    drawers.push(new Drawer({ group: g, axis, max: 0.3, size: [s.x * 0.9, s.y * 0.9, s.z * 0.85], label: 'drawer' }));
  }
  apt.commode = { p, drawers, top: at(p, 0, p.size.y, 0) };
  return apt.commode;
}

// ---------------------------------------------------------------- kitchen
export function dining() {
  if (!has('table')) return null;
  const p = prop('table', { x: 8.0, z: 5.5, scale: [0.72, 0.76, 0.72], collide: false });
  block(p, 0, p.size.y - 0.03, 0, p.size.x * 0.9, 0.06, p.size.z * 0.9);
  block(p, 0, 0.35, 0, 0.26, 0.7, 0.26);
  const chairs = [];
  if (has('chair')) {
    for (const [x, z, ry] of [[8.0, 6.18, Math.PI], [8.02, 4.83, 0.08]]) {
      const c = prop('chair', { x, z, ry, collide: false });
      const ps = new Pushable(c.group, { name: 'chair', size: [c.size.x * 0.95, c.size.y, c.size.z * 0.9], mass: 4.5, label: 'Push the chair' });
      ps.seat = new Seat(new THREE.Group(), { name: 'chair', label: 'Sit down', spots: () => {
        const h = ps.holder; const e = new THREE.Euler().setFromQuaternion(h.quaternion, 'YXZ');
        return [{ pos: h.localToWorld(V(0, c.size.y * 0.46 - c.size.y / 2, 0.02)), yaw: e.y, eye: 0.68 }];
      } });
      chairs.push(ps);
    }
  }
  return { p, top: p.size.y, chairs };
}

export function microwave(x, y, z, ry) {
  if (!has('microwave')) return null;
  const p = prop('microwave', { x, y, z, ry, fitW: 0.56 });
  const pos = at(p, 0, 0.14, 0.1);
  const light = new THREE.PointLight(0xffd890, 0, 0.8, 2); light.position.copy(at(p, -0.05, 0.14, 0.12)); G.world.root.add(light);
  const mw = { p, running: 0, h: null };
  new Button(p.group, {
    name: 'microwave', label: () => (mw.running > 0 ? null : G.player?.inv?.hand?.type === 'mug' ? 'Heat the mug' : 'Run the microwave'),
    onUse: () => {
      if (mw.running > 0 || G.world.power === false) return;
      mw.running = 8; mw.mug = G.player.inv.hand?.type === 'mug' ? G.player.inv.hand : null;
      sfx('beep', { pos, vol: 0.4 }); mw.h = loop('microwaveHum', { pos, vol: 0.4 });
    },
  });
  G.world.updaters.push((dt) => {
    if (mw.running <= 0) return;
    mw.running -= dt;
    light.intensity = 0.8 + Math.sin(G.time * 40) * 0.05;
    if (mw.running <= 0 || G.world.power === false) {
      mw.running = 0; light.intensity = 0;
      if (mw.h) { mw.h.stop(0.1); mw.h = null; }
      if (G.world.power !== false) { sfx('ding', { pos, vol: 0.6 }); sfx('ding', { pos, vol: 0.4, delay: 0.5 }); }
      if (mw.mug && mw.mug.state.fill > 0) mw.mug.state.hot = true;
      mw.mug = null;
    }
  });
  return mw;
}

// a kettle sat on a lit burner heats up and starts to scream
export function kettleWatch(apt) {
  let whistle = null, heat = 0;
  G.world.updaters.push((dt) => {
    const k = G.world.items?.find?.((i) => i.type === 'kettle' && !i.dead);
    let on = false;
    if (k && apt.stove && !k.prop?.held) {
      const kp = k.mesh.position;
      on = apt.stove.burners.some((b) => b.on && Math.hypot(kp.x - b.center.x, kp.z - b.center.z) < 0.13 && Math.abs(kp.y - b.center.y) < 0.25);
    }
    heat = Math.max(0, Math.min(30, heat + (on ? dt : -dt * 0.5)));
    if (heat > 14 && !whistle && k) { whistle = loop('kettleWhistle', { pos: k.mesh.position, vol: 0, fade: 2 }); emit('noise', { pos: k.mesh.position.clone(), loud: 0.5, kind: 'kettle' }); }
    if (whistle) {
      whistle.set({ vol: Math.min(0.5, (heat - 12) / 10), pos: k ? k.mesh.position : undefined, rate: 0.95 + heat / 200 });
      if (heat < 12) { whistle.stop(0.6); whistle = null; }
    }
    if (G.particles && on && heat > 8 && Math.random() < dt * 8 && k) G.particles.steam?.(k.mesh.position.clone().add(V(0.1, 0.18, 0)));
  });
}

export function trashCan(pos, parent) {
  if (!has('trashCan')) return null;
  // the open can, so the bag shows inside; the model's lid only leans against it
  return prop('trashCan', { only: ['metal_trash_can', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right'], parent, x: pos.x, z: pos.z, ry: -Math.PI / 2, scale: 0.58, collide: false });
}

// ---------------------------------------------------------------- desk + bedroom
export function deskLamp(f, pos, ry) {
  if (!has('deskLamp')) return null;
  const p = prop('deskLamp', { x: pos.x, y: pos.y, z: pos.z, ry, scale: 0.7, collide: false });
  f.group.visible = false;
  const head = at(p, 0, 0.5, 0.2);
  if (f.light) f.light.position.copy(head);
  if (f.pos) f.pos.copy(head);
  new Button(p.group, { name: 'lamp', label: () => (f.on ? 'Turn off lamp' : 'Turn on lamp'), onUse: () => { f.toggle(); sfx('switch', { pos: head, vol: 0.4 }); } });
  return p;
}

// ---------------------------------------------------------------- closet clutter
export function closetClutter() {
  const out = [];
  if (has('suitcase')) out.push(prop('suitcase', { only: ['vintage_suitcase_01_bottom', 'vintage_suitcase_01_clasp', 'vintage_suitcase_01_handle', 'vintage_suitcase_01_top'], x: 1.6, z: 7.46, ry: Math.PI, scale: 0.9 }));
  return out;
}
