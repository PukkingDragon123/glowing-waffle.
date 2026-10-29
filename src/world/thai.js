// Things that make Room 1407 a Bangkok room in 1997: monobloc chairs and
// street stools, a stand fan, a rice cooker and a flowered airpot, a two-ring
// gas stove on an LPG bottle, the spirit house and the shelf for the Buddha,
// a steel shelf of rice whisky and soda, a pink radio, a turntable, the split
// air conditioner, mosquito coils, a low wooden bed with a bolster pillow and
// a mosquito net. Everything is built here from primitives; static pieces go
// through a Builder, things you can use or push come back as groups.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M, std } from '../gfx/materials.js';
import { Batcher, boxGeo, roundedBox, cylGeo } from '../gfx/geo.js';
import { lathe, softBox, drapeGeo } from '../gfx/shapes.js';
import { makeCanvas, toTexture, printed, ageCanvas } from '../gfx/textures.js';
import { Button } from './interactables.js';
import { Seat, Pushable } from './seats.js';
import { Fixture, glowMat } from './lights.js';
import { clamp, damp, RNG } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const loop = (n, o) => (G.audio ? G.audio.loop(n, o) : { stop() {}, set() {} });

export const TH = '"Kanit", "Leelawadee UI", Tahoma, "Thonburi", sans-serif';
export const TH_BODY = '"Sarabun", "Leelawadee UI", Tahoma, sans-serif';
export const TH_HAND = '"Itim", "Leelawadee UI", "Comic Sans MS", cursive';

// ---------------------------------------------------------------- materials
// plain painted colours, cached by name
export function pm(name, color, o = {}) {
  return M[name] || std(name, null, { color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, env: o.env ?? 0.5, side: o.side, transparent: o.transparent, opacity: o.opacity, emissive: o.emissive, emissiveIntensity: o.ei, depthWrite: o.depthWrite });
}
export function tm(name, tex, o = {}) {
  return M[name] || std(name, { map: tex, worldSize: o.ws ?? 1 }, { color: o.color ?? 0xffffff, roughness: o.r ?? 0.85, side: o.side, transparent: o.transparent, alphaTest: o.alphaTest });
}

// tileable flowered cotton: the sheets, the airpot, the rice cooker, curtains
export function floral(key, bg, cols, { size = 128, n = 9, seed = 1, leaf = '#5a8a4a', stripe = null } = {}) {
  const k = 'floral:' + key;
  if (M[k]) return M[k];
  const { c, ctx } = makeCanvas(size, size);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  if (stripe) { ctx.fillStyle = stripe; for (let x = 0; x < size; x += size / 8) ctx.fillRect(x, 0, size / 32, size); }
  const r = new RNG(seed);
  const blossom = (x, y, s, col) => {
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.fillStyle = leaf;
      for (let i = 0; i < 2; i++) { const a = r.range(0, 6.28); ctx.beginPath(); ctx.ellipse(x + ox + Math.cos(a) * s * 1.3, y + oy + Math.sin(a) * s * 1.3, s * 0.9, s * 0.4, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = col;
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + ox + Math.cos(a) * s * 0.6, y + oy + Math.sin(a) * s * 0.6, s * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f6e27a'; ctx.beginPath(); ctx.arc(x + ox, y + oy, s * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  };
  for (let i = 0; i < n; i++) blossom(r.range(0, size), r.range(0, size), r.range(size * 0.04, size * 0.08), cols[i % cols.length]);
  ageCanvas(ctx, size, size, 0.1, seed);
  const t = toTexture(c, { repeat: true });
  return tm(k, t, { ws: 0.45 });
}

// the red-white-blue check of a pha khao ma, the cloth that does everything
export function plaid(key, a, b, c2, seed = 3) {
  const k = 'plaid:' + key;
  if (M[k]) return M[k];
  const S = 64;
  const { c, ctx } = makeCanvas(S, S);
  ctx.fillStyle = a; ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = b; for (let i = 0; i < S; i += 16) { ctx.fillRect(i, 0, 8, S); ctx.fillRect(0, i, S, 8); }
  ctx.fillStyle = c2; for (let i = 4; i < S; i += 16) { ctx.fillRect(i, 0, 2, S); ctx.fillRect(0, i, S, 2); }
  ctx.globalAlpha = 1;
  ageCanvas(ctx, S, S, 0.12, seed);
  return tm(k, toTexture(c, { repeat: true }), { ws: 0.25 });
}

// a cylinder between two points
export function rod(a, b, r0, r1 = r0, seg = 8) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z)); return g; };

// merge a list of [geo, mat] into a group (one mesh per material)
export function assemble(parts, parent = G.world.root) {
  const bt = new Batcher();
  for (const [g, m, o] of parts) bt.add(g, m, o || {});
  const grp = new THREE.Group();
  bt.build(grp, 'prop');
  grp.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = true; } });
  parent.add(grp);
  return grp;
}
// place assembled geometry statically through a builder
function stamp(b, parts, x, y, z, ry) {
  b.beginFrame(x, y, z, ry);
  for (const [g, m, o] of parts) b.geo(g, m, { cast: o?.cast ?? true });
  b.endFrame();
}

// ---------------------------------------------------------------- monobloc chair
const CHAIR_COLS = { white: 0xe8e4d6, red: 0xc23a2c, blue: 0x2f5fa8, green: 0x3f8a52 };
function chairParts(color) {
  const mat = pm('monobloc_' + color, CHAIR_COLS[color] ?? color, { r: 0.55 });
  const P = [];
  const seat = roundedBox(0.45, 0.035, 0.42, 0.016, 2);
  { const p = seat.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0) p.setY(i, y - 0.018 * (1 - (p.getX(i) / 0.225) ** 2) * (1 - (p.getZ(i) / 0.21) ** 2)); } seat.computeVertexNormals(); }
  P.push([at(seat, 0, 0.44, 0.01), mat]);
  // a seat apron all round, the way they are moulded
  P.push([at(roundedBox(0.44, 0.05, 0.02, 0.008), 0, 0.41, 0.215), mat]);
  for (const s of [-1, 1]) P.push([at(roundedBox(0.02, 0.05, 0.4, 0.008), s * 0.215, 0.41, 0.01), mat]);
  // splayed legs, wide L-sections approximated with flat boxes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = V(sx * 0.2, 0.43, sz * 0.18), bot = V(sx * 0.245, 0, sz * 0.235);
    P.push([rod(bot, top, 0.026, 0.03, 4), mat]);
  }
  // back: two uprights and four curved slats
  for (const sx of [-1, 1]) P.push([rod(V(sx * 0.2, 0.43, -0.185), V(sx * 0.215, 0.88, -0.27), 0.028, 0.024, 4), mat]);
  for (let i = 0; i < 4; i++) {
    const y = 0.56 + i * 0.1, z = -0.21 - i * 0.017;
    const sl = new THREE.BoxGeometry(0.42, i === 3 ? 0.07 : 0.045, 0.02, 10, 1, 1);
    const p = sl.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k); p.setZ(k, p.getZ(k) + 0.06 * (x / 0.21) ** 2); }
    sl.computeVertexNormals();
    P.push([at(sl, 0, y, z, -0.18, 0, 0), mat]);
  }
  // arms
  for (const sx of [-1, 1]) {
    P.push([rod(V(sx * 0.215, 0.64, -0.24), V(sx * 0.23, 0.63, 0.13), 0.022, 0.022, 5), mat]);
    P.push([rod(V(sx * 0.21, 0.44, 0.17), V(sx * 0.23, 0.63, 0.13), 0.022, 0.022, 4), mat]);
  }
  return { P, mat };
}
// a pushable, sittable monobloc chair
export function monobloc(x, z, ry, color = 'white', o = {}) {
  const { P } = chairParts(color);
  const g = assemble(P);
  g.position.set(x, o.y ?? 0, z); g.rotation.y = ry;
  if (o.static) return { group: g };
  const ps = new Pushable(g, { name: 'chair', size: [0.5, 0.88, 0.5], mass: 2.2, sound: 'plastic', label: 'Push the chair' });
  ps.seat = new Seat(new THREE.Group(), { name: 'chair', label: 'Sit down', sound: 'imp_plastic', spots: () => {
    const h = ps.holder; const e = new THREE.Euler().setFromQuaternion(h.quaternion, 'YXZ');
    return [{ pos: h.localToWorld(V(0, 0.44 - 0.44, 0.03)), yaw: e.y, eye: 0.68 }];
  } });
  return ps;
}
// four chairs stacked in a corner
export function chairStack(b, x, z, ry, color = 'white', n = 4) {
  const { P } = chairParts(color);
  for (let i = 0; i < n; i++) stamp(b, P.map(([g, m]) => [g.clone(), m]), x, i * 0.055, z - i * 0.02, ry);
  b.collider(x, 0.5, z, 0.55, 1.0, 0.55, ry);
}

// ---------------------------------------------------------------- street stool
export function stool(b, x, z, color = 0xc23a2c, h = 0.42) {
  const mat = pm('stool_' + color.toString(16), color, { r: 0.55 });
  const P = [];
  P.push([lathe([[0.001, h], [0.15, h], [0.155, h - 0.012], [0.145, h - 0.03], [0.001, h - 0.03]], 20), mat]);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.BoxGeometry(0.1, h - 0.02, 0.018, 1, 4, 1);
    const p = leg.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, p.getZ(k) + (0.5 - (y / (h - 0.02) + 0.5)) * 0.06); }
    leg.computeVertexNormals();
    leg.translate(0, (h - 0.02) / 2, 0);
    at(leg, Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, 0, -a + Math.PI / 2, 0);
    P.push([leg, mat]);
  }
  P.push([at(new THREE.TorusGeometry(0.15, 0.01, 4, 20), 0, 0.1, 0, Math.PI / 2), mat]);
  stamp(b, P, x, 0, z, 0);
  b.collider(x, h / 2, z, 0.3, h, 0.3);
  return V(x, h, z);
}

// ---------------------------------------------------------------- stand fan
// piano-key speed buttons, an oscillating head and a cage you could lose a
// finger in. It moves the curtains.
export function standFan(x, z, ry, o = {}) {
  const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = ry; G.world.root.add(root);
  const body = pm('fanBody', o.color ?? 0x9fc8d8, { r: 0.5 }), dark = pm('fanDark', 0x2a3036, { r: 0.6 });
  const blueBlade = pm('fanBlade', 0x6aa8d8, { r: 0.3, transparent: true, opacity: 0.85 });
  const cage = M.chrome;
  const base = assemble([
    [lathe([[0.001, 0], [0.17, 0], [0.175, 0.02], [0.14, 0.06], [0.05, 0.075], [0.001, 0.075]], 22), body],
    [at(cylGeo(0.018, 0.95, 8), 0, 0.53, 0), M.chrome],
    [at(cylGeo(0.026, 0.2, 8), 0, 0.15, 0), body],
  ], root);
  const keyCols = [0xd84a3a, 0x3a8ad8, 0x3aa84a, 0xe8c040];
  const keys = [];
  keyCols.forEach((c, i) => { const k = new THREE.Mesh(roundedBox(0.03, 0.018, 0.04, 0.005), pm('fanKey' + i, c, { r: 0.4 })); k.position.set(-0.05 + i * 0.034, 0.07, 0.11); k.rotation.x = -0.35; base.add(k); keys.push(k); });
  const head = new THREE.Group(); head.position.set(0, 1.02, 0); root.add(head);
  assemble([
    [at(new THREE.CapsuleGeometry(0.06, 0.1, 4, 10), 0, 0, -0.06, Math.PI / 2), body],
    [at(cylGeo(0.02, 0.06, 8), 0, -0.05, -0.02), body],
    [at(new THREE.SphereGeometry(0.03, 8, 6), 0, 0, -0.16), body],
  ], head);
  const cageG = [];
  for (const z0 of [0.03, 0.11]) cageG.push([at(new THREE.TorusGeometry(0.21, 0.004, 4, 32), 0, 0, z0), cage, { cast: false }]);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    cageG.push([rod(V(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.11), V(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.15), 0.0022, 0.0022, 3), cage, { cast: false }]);
    cageG.push([rod(V(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.03), V(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.0), 0.0022, 0.0022, 3), cage, { cast: false }]);
    cageG.push([rod(V(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.03), V(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.11), 0.0022, 0.0022, 3), cage, { cast: false }]);
  }
  cageG.push([at(cylGeo(0.04, 0.012, 14), 0, 0, 0.155, Math.PI / 2), pm('fanBadge', 0xd84a3a, { r: 0.4 })]);
  assemble(cageG, head);
  const blades = new THREE.Group(); blades.position.set(0, 0, 0.07); head.add(blades);
  const bp = [[at(cylGeo(0.035, 0.03, 12), 0, 0, 0, Math.PI / 2), blueBlade]];
  for (let i = 0; i < 3; i++) { const g = new THREE.SphereGeometry(0.1, 12, 6); g.scale(0.62, 1, 0.12); g.translate(0, 0.11, 0); g.rotateY(0.25); g.rotateZ(i / 3 * Math.PI * 2); bp.push([g, blueBlade]); }
  assemble(bp, blades);
  G.physics.addStaticBox(x, 0.6, z, 0.2, 0.6, 0.2);
  const fan = { root, head, blades, speed: 0, level: 0, osc: true, t: Math.random() * 10, hum: null };
  const pos = root.localToWorld(V(0, 1.0, 0));
  new Button(base, {
    name: 'fan', label: () => ['Turn on the fan (speed 1)', 'Speed 2', 'Speed 3', 'Turn off the fan'][fan.level],
    onUse: () => { fan.level = (fan.level + 1) % 4; keys.forEach((k, i) => (k.position.y = i === fan.level ? 0.062 : 0.07)); sfx('fanClick', { pos, vol: 0.6 }); sfx('switch', { pos, vol: 0.3 }); },
  });
  new Button(head, { name: 'fanHead', label: () => (fan.osc ? 'Stop it turning' : 'Let it turn'), onUse: () => { fan.osc = !fan.osc; sfx('click', { pos, vol: 0.5 }); } });
  G.world.updaters.push((dt) => {
    const want = G.world.power !== false ? [0, 9, 13, 17][fan.level] : 0;
    fan.speed += (want - fan.speed) * Math.min(1, dt * (want > fan.speed ? 0.8 : 0.4));
    blades.rotation.z -= fan.speed * dt;
    if (fan.osc && fan.speed > 1) { fan.t += dt * 0.35; head.rotation.y = Math.sin(fan.t) * 0.7; }
    if (fan.speed > 0.5 && !fan.hum) fan.hum = loop('fanStand', { pos, vol: 0 });
    if (fan.hum) { fan.hum.set({ vol: Math.min(0.45, fan.speed / 30), rate: 0.7 + fan.speed / 40 }); if (fan.speed < 0.3) { fan.hum.stop(0.4); fan.hum = null; } }
    if (fan.speed > 2) G.windGust = Math.max(G.windGust || 0, fan.speed / 17 * 0.3);
  });
  fan.off = () => { fan.level = 0; keys.forEach((k) => (k.position.y = 0.07)); };
  return fan;
}

// ---------------------------------------------------------------- rice cooker
// white with pink flowers. Cook: ~25 seconds, then the clack to warm.
export function riceCooker(x, y, z, ry) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = ry; G.world.root.add(root);
  const flower = floral('cooker', '#f4f0e6', ['#e8709a', '#f0a0b8', '#d85080'], { seed: 11, size: 96, n: 7 });
  const white = pm('cookerWhite', 0xf0ece2, { r: 0.4 });
  assemble([
    [lathe([[0.001, 0], [0.12, 0], [0.135, 0.02], [0.14, 0.17], [0.13, 0.19], [0.001, 0.19]], 24), flower],
    [lathe([[0.001, 0.19], [0.132, 0.19], [0.12, 0.23], [0.06, 0.255], [0.001, 0.26]], 24), white],
    [at(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), 0, 0.26, 0), white],
    [at(roundedBox(0.09, 0.08, 0.04, 0.01), 0, 0.09, 0.135), white],
    [at(rod(V(0, 0.03, -0.13), V(-0.05, 0.0, -0.4), 0.004), 0, 0, 0), M.black],
  ], root);
  const lever = new THREE.Mesh(roundedBox(0.03, 0.03, 0.03, 0.008), pm('cookerLever', 0x3a3a3a, { r: 0.5 }));
  lever.position.set(0, 0.1, 0.16); root.add(lever);
  const ledCook = new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff3010, emissiveIntensity: 0 });
  const ledWarm = new THREE.MeshStandardMaterial({ color: 0x403008, emissive: 0xffb020, emissiveIntensity: 0 });
  for (const [m, lx] of [[ledCook, -0.025], [ledWarm, 0.025]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), m); l.position.set(lx, 0.12, 0.156); root.add(l); }
  G.physics.addStaticCyl(x, y + 0.13, z, 0.14, 0.26);
  const rc = { state: 'off', t: 0, portions: 0, root };
  const pos = root.localToWorld(V(0, 0.15, 0));
  rc.btn = new Button(root, {
    name: 'rice',
    label: () => (rc.state === 'off' ? 'Cook rice' : rc.state === 'cooking' ? 'Cooking...' : rc.portions > 0 ? 'Eat a plate of rice' : 'Empty'),
    onUse: () => {
      if (rc.state === 'off') { if (G.world.power === false) return; rc.state = 'cooking'; rc.t = 0; lever.position.y = 0.085; sfx('click', { pos, vol: 0.6 }); return; }
      if (rc.state === 'warm' && rc.portions > 0) {
        G.player.runAction({ anim: 'eat', dur: 2.6, sound: 'chewSoft', at: [[1.6, () => { rc.portions--; G.player.hunger.eat(0.28); emit('ate', { what: 'rice' }); emit('ateRice'); }]] });
      }
    },
    update: (dt) => {
      ledCook.emissiveIntensity = rc.state === 'cooking' ? 2 : 0;
      ledWarm.emissiveIntensity = rc.state === 'warm' ? 1.6 : 0;
      if (rc.state === 'cooking') {
        rc.t += dt;
        if (G.particles && Math.random() < dt * 3) G.particles.steam(root.localToWorld(V(0.03, 0.27, 0)));
        if (rc.t > 26) { rc.state = 'warm'; rc.portions = 3; lever.position.y = 0.1; sfx('riceCooker', { pos, vol: 0.8 }); sfx('click', { pos, vol: 0.7 }); G.hud && G.hud.inner('The rice is done.'); emit('riceDone'); }
      }
    },
  });
  rc.reset = () => { rc.state = 'off'; rc.t = 0; rc.portions = 0; lever.position.y = 0.1; };
  return rc;
}

// ---------------------------------------------------------------- airpot
// the electric thermos with a pump: a mug under the spout, press, 3-in-1 coffee
export function airpot(x, y, z, ry) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = ry; G.world.root.add(root);
  const flower = floral('airpot', '#e8eef0', ['#4a7ac8', '#7aa0e0', '#e86a8a'], { seed: 23, size: 96, n: 8 });
  const cap = pm('airpotCap', 0xd8d4c8, { r: 0.4 });
  assemble([
    [lathe([[0.001, 0], [0.105, 0], [0.11, 0.015], [0.11, 0.27], [0.1, 0.3], [0.001, 0.3]], 22), flower],
    [lathe([[0.001, 0.3], [0.1, 0.3], [0.095, 0.33], [0.06, 0.36], [0.001, 0.365]], 22), cap],
    [at(roundedBox(0.05, 0.03, 0.06, 0.01), 0, 0.35, 0.03), cap],
    [rod(V(0, 0.32, 0.08), V(0, 0.29, 0.15), 0.012, 0.009, 8), cap],
    [at(new THREE.TorusGeometry(0.08, 0.01, 6, 14, Math.PI), 0, 0.29, -0.03, 0, Math.PI / 2, Math.PI / 2), cap],
  ], root);
  G.physics.addStaticCyl(x, y + 0.18, z, 0.11, 0.36);
  const spot = root.localToWorld(V(0, 0.055, 0.17));
  const ap = { brewing: false, t: 0, mug: null, spot, root };
  ap.mugAtSpot = () => G.world.items.find((i) => i.type === 'mug' && !i.prop.held && !i.dead && Math.hypot(i.mesh.position.x - spot.x, i.mesh.position.z - spot.z) < 0.1 && Math.abs(i.mesh.position.y - spot.y) < 0.1);
  ap.stop = () => { ap.brewing = false; if (ap.loopS) { ap.loopS.stop(0.3); ap.loopS = null; } };
  new Button(root, {
    name: 'coffee',
    label: () => {
      if (ap.brewing) return 'Pumping...';
      const mug = ap.mugAtSpot();
      if (G.player?.inv?.hand?.type === 'mug' && !mug) return 'Put the mug under the spout';
      if (mug && mug.state.fill < 0.5) return 'Make 3-in-1 coffee';
      if (mug) return null;
      return 'Hot water (needs a mug)';
    },
    onUse: () => {
      if (ap.brewing) return;
      const hand = G.player.inv.hand, mug = ap.mugAtSpot();
      if (hand && hand.type === 'mug' && !mug) { G.player.inv.placeHandAt(spot.clone(), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry + Math.PI, 0))); return; }
      if (!mug) { G.hud.inner('I need a mug under it.'); return; }
      if (mug.state.fill >= 0.5) return;
      ap.brewing = true; ap.t = 0; ap.mug = mug;
      sfx('click', { pos: spot, vol: 0.5 }); sfx('packetRustle', { pos: spot, vol: 0.4 });
      ap.loopS = loop('brew', { pos: spot, vol: 0.45, rate: 1.4 });
    },
    update: (dt) => {
      if (!ap.brewing) return;
      ap.t += dt;
      const mug = ap.mug;
      if (!mug || mug.dead || mug.prop.held) { ap.stop(); return; }
      mug.state.fill = clamp(ap.t / 4, 0, 1); mug.state.hot = true; mug.refresh();
      if (G.particles && Math.random() < dt * 6) G.particles.steam(spot.clone().add(V(0, 0.08, 0)));
      if (ap.t > 4.3) { ap.stop(); sfx('ding', { pos: spot, vol: 0.2, rate: 1.6 }); emit('coffeeBrewed'); }
    },
  });
  return ap;
}

// ---------------------------------------------------------------- gas stove
// a two-ring table-top stove on the counter, hosed to a red LPG bottle
export function gasStove(b, x, y, z, ry) {
  b.beginFrame(x, y, z, ry);
  const steel = M.steel, iron = pm('castIron', 0x1c1a18, { r: 0.7 });
  const w = 0.68, d = 0.38;
  b.geo(roundedBox(w, 0.09, d, 0.012), steel, { x: 0, y: 0.045, z: 0 });
  b.box(0, 0.092, 0, w - 0.04, 0.004, d - 0.04, pm('stoveTop', 0x2a2a2c, { r: 0.6 }), { collide: false });
  b.collider(0, 0.05, 0, w, 0.1, d);
  const burners = [];
  for (const bx of [-0.17, 0.17]) {
    b.geo(lathe([[0.001, 0], [0.075, 0], [0.08, 0.02], [0.06, 0.025], [0.001, 0.025]], 16), iron, { x: bx, y: 0.094, z: -0.01 });
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; b.geo(roundedBox(0.08, 0.012, 0.014, 0.004), iron, { x: bx + Math.cos(a) * 0.075, y: 0.13, z: -0.01 + Math.sin(a) * 0.075, ry: -a, cast: false }); }
    b.geo(new THREE.TorusGeometry(0.11, 0.008, 4, 16), iron, { x: bx, y: 0.124, z: -0.01, rx: Math.PI / 2, cast: false });
    const [cx, cy, cz] = b.toWorld(bx, 0.135, -0.01);
    const center = V(cx, cy, cz);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x4a7dff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 18), flameMat);
    flame.rotation.x = Math.PI / 2; flame.position.copy(center).add(V(0, -0.012, 0)); G.world.root.add(flame);
    burners.push({ center, on: false, flame, flameMat, heat: 0 });
  }
  const knobs = [];
  burners.forEach((bu, i) => {
    const [kx, ky, kz] = b.toWorld(i ? 0.17 : -0.17, 0.045, d / 2 + 0.012);
    const grp = new THREE.Group(); grp.position.set(kx, ky, kz); grp.rotation.y = ry; G.world.root.add(grp);
    const km = new THREE.Mesh(cylGeo(0.022, 0.025, 12), pm('stoveKnob', 0x1a1a1a, { r: 0.5 })); km.rotation.x = Math.PI / 2; grp.add(km);
    const tick = new THREE.Mesh(boxGeo(0.004, 0.018, 0.004), M.paperWhite); tick.position.set(0, 0.008, 0.014); grp.add(tick);
    knobs.push(new Button(grp, {
      name: 'knob', label: () => (bu.on ? 'Turn the gas off' : 'Light the gas'),
      onUse: () => { bu.on = !bu.on; grp.rotation.z = bu.on ? -1.3 : 0; sfx(bu.on ? 'gasIgnite' : 'switch', { pos: bu.center, vol: 0.6 }); if (bu.on) sfx('stoveIgnite', { pos: bu.center, vol: 0.4 }); },
    }));
  });
  b.endFrame();
  return { burners, knobs };
}
export function lpgTank(b, x, z, hoseTo = null) {
  const red = pm('lpgRed', 0xb02a22, { r: 0.45, m: 0.3 });
  b.geo(lathe([[0.001, 0], [0.13, 0], [0.15, 0.04], [0.15, 0.42], [0.12, 0.5], [0.04, 0.53], [0.001, 0.53]], 20), red, { x, y: 0, z });
  b.geo(new THREE.TorusGeometry(0.07, 0.012, 6, 16), red, { x, y: 0.6, z, rx: Math.PI / 2 });
  for (const s of [-1, 1]) b.geo(cylGeo(0.01, 0.08, 6), red, { x: x + s * 0.06, y: 0.56, z });
  b.geo(cylGeo(0.025, 0.05, 10), M.steel, { x, y: 0.56, z });
  b.collider(x, 0.27, z, 0.3, 0.54, 0.3);
  if (hoseTo) {
    const pts = [V(x, 0.58, z), V(x + (hoseTo.x - x) * 0.3, 0.75, z + (hoseTo.z - z) * 0.3), V(hoseTo.x, hoseTo.y - 0.05, hoseTo.z + 0.0), hoseTo];
    b.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.008, 5), pm('hoseOrange', 0xd86a20, { r: 0.6 }), { cast: false });
  }
}

// ---------------------------------------------------------------- spirit house
// san phra phum: a little house for the guardian of the land, on a post, with
// red soda, garlands of jasmine and marigold, and smoke
export function spiritHouse(b, x, y, z, ry, o = {}) {
  const s = o.scale ?? 1;
  b.beginFrame(x, y, z, ry);
  const gold = pm('spiritGold', 0xd8a838, { r: 0.35, m: 0.6, env: 1 });
  const red = pm('spiritRed', 0xa82a24, { r: 0.6 }), green = pm('spiritGreen', 0x2a7a4a, { r: 0.6 });
  const white = pm('spiritWhite', 0xf0ece0, { r: 0.6 });
  const post = o.post ?? 0;
  if (post > 0) {
    b.geo(lathe([[0.1, 0], [0.09, 0.05], [0.06, 0.1], [0.06, post - 0.06], [0.1, post]], 4), white, { x: 0, y: 0, z: 0, ry: Math.PI / 4 });
    b.collider(0, post / 2, 0, 0.16, post, 0.16);
  }
  const y0 = post;
  b.geo(roundedBox(0.5 * s, 0.04 * s, 0.42 * s, 0.01), white, { x: 0, y: y0 + 0.02 * s, z: 0 });
  // balustrade
  for (let i = 0; i < 9; i++) for (const zz of [-0.19, 0.19]) b.geo(cylGeo(0.006 * s, 0.05 * s, 6), gold, { x: (-0.22 + i * 0.055) * s, y: y0 + 0.065 * s, z: zz * s, cast: false });
  b.box(0, y0 + 0.095 * s, 0.19 * s, 0.48 * s, 0.01 * s, 0.01 * s, gold, { collide: false });
  b.box(0, y0 + 0.095 * s, -0.19 * s, 0.48 * s, 0.01 * s, 0.01 * s, gold, { collide: false });
  // the house
  b.geo(roundedBox(0.24 * s, 0.2 * s, 0.2 * s, 0.006), white, { x: 0, y: y0 + 0.14 * s, z: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(cylGeo(0.012 * s, 0.24 * s, 8), gold, { x: sx * 0.13 * s, y: y0 + 0.16 * s, z: sz * 0.11 * s });
  b.box(0, y0 + 0.13 * s, 0.101 * s, 0.07 * s, 0.12 * s, 0.004, red, { collide: false });
  // tiered roofs: steep gables, red tiles with a green border, gold finials
  const roof = (yy, w, d, h, mat) => {
    const g = new THREE.BufferGeometry();
    const hw = w / 2, hd = d / 2;
    const p = [-hw, 0, -hd, hw, 0, -hd, 0, h, -hd * 0.9, -hw, 0, hd, hw, 0, hd, 0, h, hd * 0.9];
    const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals();
    b.geo(g.toNonIndexed(), mat, { x: 0, y: yy, z: 0, ry: Math.PI / 2 });
  };
  roof(y0 + 0.28 * s, 0.34 * s, 0.32 * s, 0.14 * s, red);
  roof(y0 + 0.25 * s, 0.38 * s, 0.36 * s, 0.07 * s, green);
  roof(y0 + 0.35 * s, 0.22 * s, 0.2 * s, 0.13 * s, red);
  for (const zz of [-0.16, 0.16, -0.1, 0.1]) {
    const yy = y0 + (Math.abs(zz) > 0.12 ? 0.42 : 0.48) * s;
    b.geo(new THREE.ConeGeometry(0.008 * s, 0.07 * s, 5), gold, { x: 0, y: yy, z: zz * s, rx: zz > 0 ? 0.5 : -0.5 });
  }
  b.geo(new THREE.ConeGeometry(0.012 * s, 0.12 * s, 6), gold, { x: 0, y: y0 + 0.53 * s, z: 0 });
  // offerings on the platform: red soda with straws, garlands, an incense pot,
  // two tiny elephants and a dancer
  const sodaRed = pm('redSoda', 0xd01818, { r: 0.2, transparent: true, opacity: 0.9 });
  for (const [ox, oz] of [[-0.17, 0.12], [-0.13, 0.15], [0.16, 0.13]]) {
    b.geo(cylGeo(0.012 * s, 0.07 * s, 8), sodaRed, { x: ox * s, y: y0 + 0.075 * s, z: oz * s });
    b.geo(cylGeo(0.0018 * s, 0.06 * s, 4), white, { x: ox * s + 0.004, y: y0 + 0.13 * s, z: oz * s, rz: 0.3, cast: false });
  }
  const jas = pm('jasmine', 0xf8f6ee, { r: 0.7 }), mari = pm('marigold', 0xf0901a, { r: 0.7 });
  b.geo(new THREE.TorusGeometry(0.035 * s, 0.009 * s, 5, 12), jas, { x: 0.06 * s, y: y0 + 0.05 * s, z: 0.14 * s, rx: Math.PI / 2 });
  b.geo(new THREE.TorusGeometry(0.03 * s, 0.009 * s, 5, 12), mari, { x: -0.05 * s, y: y0 + 0.05 * s, z: 0.15 * s, rx: Math.PI / 2 });
  b.geo(cylGeo(0.025 * s, 0.03 * s, 10), pm('incensePot', 0x8a6a3a, { r: 0.8 }), { x: 0, y: y0 + 0.055 * s, z: 0.15 * s });
  for (let i = 0; i < 5; i++) b.geo(cylGeo(0.0015 * s, 0.1 * s, 3), red, { x: (i - 2) * 0.006 * s, y: y0 + 0.11 * s, z: 0.15 * s, rx: (i - 2) * 0.05, cast: false });
  const grey = pm('figGrey', 0x6a6a70, { r: 0.6 });
  for (const sx of [-1, 1]) { b.geo(new THREE.SphereGeometry(0.02 * s, 8, 6), grey, { x: sx * 0.19 * s, y: y0 + 0.065 * s, z: -0.05 * s }); b.geo(new THREE.SphereGeometry(0.012 * s, 6, 5), grey, { x: sx * 0.19 * s, y: y0 + 0.08 * s, z: -0.02 * s }); }
  b.endFrame();
  return b.toWorld ? V(...b.toWorld(0, 0, 0)) : V(x, y, z);
}

// ---------------------------------------------------------------- the Buddha shelf
// hing phra: up high, out of reach of feet; a small gilded image, flowers,
// candles and an amulet in a frame
export function hingPhra(b, x, y, z, ry) {
  b.beginFrame(x, y, z, ry);
  const wood = pm('hingWood', 0x6a3a1e, { r: 0.55 }), gold = M.spiritGold || pm('spiritGold', 0xd8a838, { r: 0.35, m: 0.6, env: 1 });
  b.geo(roundedBox(0.62, 0.03, 0.26, 0.008), wood, { x: 0, y: 0, z: 0.13 });
  b.geo(roundedBox(0.66, 0.05, 0.03, 0.008), wood, { x: 0, y: 0.03, z: 0.27 });
  for (const sx of [-1, 1]) {
    const br = new THREE.BufferGeometry();
    const p = [0, 0, 0, 0, -0.18, 0, 0, 0, 0.22];
    br.setAttribute('position', new THREE.Float32BufferAttribute([...p, 0.015, 0, 0, 0.015, -0.18, 0, 0.015, 0, 0.22], 3));
    br.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2]); br.computeVertexNormals();
    b.geo(br.toNonIndexed(), wood, { x: sx * 0.25 - 0.0075, y: -0.015, z: 0 });
  }
  // the image: a stepped base and a seated, gilded form, kept simple
  b.geo(lathe([[0.001, 0], [0.06, 0], [0.06, 0.02], [0.045, 0.03], [0.05, 0.045], [0.001, 0.045]], 6), gold, { x: 0, y: 0.015, z: 0.11 });
  const body = lathe([[0.001, 0], [0.055, 0], [0.05, 0.03], [0.035, 0.06], [0.03, 0.1], [0.018, 0.11], [0.001, 0.11]], 14); body.scale(1, 1, 0.7);
  b.geo(body, gold, { x: 0, y: 0.06, z: 0.11 });
  b.geo(new THREE.SphereGeometry(0.02, 12, 10), gold, { x: 0, y: 0.185, z: 0.11 });
  b.geo(new THREE.ConeGeometry(0.008, 0.035, 8), gold, { x: 0, y: 0.215, z: 0.11 });
  b.geo(new THREE.TorusGeometry(0.03, 0.004, 4, 16, Math.PI), gold, { x: 0, y: 0.17, z: 0.1 });
  // flowers, candles, an amulet frame
  const vase = pm('vaseWhite', 0xe8e4d8, { r: 0.4 }), mari = M.marigold || pm('marigold', 0xf0901a, { r: 0.7 }), jas = M.jasmine || pm('jasmine', 0xf8f6ee, { r: 0.7 });
  for (const sx of [-1, 1]) {
    b.geo(lathe([[0.001, 0], [0.02, 0], [0.025, 0.04], [0.015, 0.07], [0.02, 0.08], [0.001, 0.08]], 10), vase, { x: sx * 0.15, y: 0.015, z: 0.12 });
    for (let i = 0; i < 4; i++) b.geo(new THREE.SphereGeometry(0.014, 6, 5), i % 2 ? mari : jas, { x: sx * 0.15 + Math.cos(i * 1.7) * 0.015, y: 0.11 + (i % 2) * 0.01, z: 0.12 + Math.sin(i * 1.7) * 0.015 });
    b.geo(cylGeo(0.007, 0.07, 8), pm('candleYellow', 0xf0d880, { r: 0.6 }), { x: sx * 0.24, y: 0.05, z: 0.13 });
  }
  b.geo(new THREE.TorusGeometry(0.05, 0.008, 5, 14), jas, { x: 0, y: 0.03, z: 0.2, rx: Math.PI / 2 });
  b.endFrame();
  // candle flames: tiny glows
  const flames = [];
  for (const sx of [-1, 1]) {
    const [fx, fy, fz] = (b.beginFrame(x, y, z, ry), b.toWorld(sx * 0.24, 0.095, 0.13)); b.endFrame();
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), glowMat(0xffd080, 0xffa030, 2)); f.scale.y = 1.8; f.position.set(fx, fy, fz); G.world.root.add(f); flames.push(f);
  }
  G.world.updaters.push(() => { for (const f of flames) f.scale.y = 1.6 + Math.sin(G.time * 13 + f.position.x * 40) * 0.25; });
  return flames;
}

// ---------------------------------------------------------------- bottles
const LABELS = [
  ['ช้างบิน', 'FLYING ELEPHANT', 'WHISKY', '#c89a2a', '#7a1a12'],
  ['นกยูงทอง', 'GOLDEN PEACOCK', 'THAI RUM', '#e8c860', '#1a3a6a'],
  ['เสือดาว', 'LEOPARD', 'LAGER', '#e8d8a0', '#a01a1a'],
  ['ม้าลาย', 'ZEBRA', 'SODA', '#f0f0f0', '#1a6a3a'],
  ['ควายเหล็ก', 'IRON BUFFALO', 'ENERGY', '#f0c020', '#d02020'],
  ['สุราขาว', 'WHITE SPIRIT', '40°', '#f4f0e0', '#2a2a8a'],
];
function labelTex(i) {
  const [th, en, kind, bg, fg] = LABELS[i];
  return printed('bottleLabel' + i, 128, 64, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 22px ${TH}`; c.fillText(th, w / 2, 22);
    c.font = '900 10px "Arial Black", Arial'; c.fillText(en, w / 2, 41);
    c.font = '700 8px Arial'; c.fillText(kind, w / 2, 53);
    ageCanvas(c, w, h, 0.2, i + 3);
  });
}
// kinds: 0 whisky (squat amber), 1 rum (tall amber), 2 beer (brown), 3 soda (green),
// 4 energy (small brown), 5 white spirit (clear)
const BOTTLE = [
  { prof: [[0.001, 0], [0.042, 0], [0.044, 0.15], [0.03, 0.19], [0.014, 0.21], [0.014, 0.25], [0.001, 0.25]], col: 0x8a4a12, op: 0.85, cap: 0xc8a030, lab: [0.04, 0.09] },
  { prof: [[0.001, 0], [0.036, 0], [0.037, 0.19], [0.02, 0.24], [0.012, 0.25], [0.012, 0.3], [0.001, 0.3]], col: 0x7a3a0e, op: 0.85, cap: 0xd0d0d0, lab: [0.05, 0.1] },
  { prof: [[0.001, 0], [0.034, 0], [0.035, 0.15], [0.016, 0.22], [0.012, 0.26], [0.001, 0.26]], col: 0x4a2a0a, op: 0.9, cap: 0xd0b030, lab: [0.04, 0.08] },
  { prof: [[0.001, 0], [0.03, 0], [0.031, 0.12], [0.014, 0.18], [0.011, 0.21], [0.001, 0.21]], col: 0x2a7a3a, op: 0.75, cap: 0xd0d0d0, lab: [0.03, 0.07] },
  { prof: [[0.001, 0], [0.025, 0], [0.026, 0.08], [0.012, 0.11], [0.01, 0.13], [0.001, 0.13]], col: 0x5a2a08, op: 0.9, cap: 0xd8d020, lab: [0.02, 0.05] },
  { prof: [[0.001, 0], [0.032, 0], [0.033, 0.16], [0.014, 0.21], [0.012, 0.24], [0.001, 0.24]], col: 0xd8e8e8, op: 0.45, cap: 0x2a2a8a, lab: [0.04, 0.09] },
];
export function bottleParts(kind, x, y, z, ry = 0, fill = 0.7) {
  const bk = BOTTLE[kind];
  const glass = pm('bottleGlass' + kind, bk.col, { r: 0.15, transparent: true, opacity: bk.op });
  const P = [];
  P.push([at(lathe(bk.prof, 14), x, y, z, 0, ry, 0), glass]);
  const top = bk.prof[bk.prof.length - 2];
  P.push([at(cylGeo(top[0] * 1.15, 0.02, 10), x, y + top[1] + 0.008, z), pm('bottleCap' + kind, bk.cap, { r: 0.4, m: 0.5 })]);
  const lr = bk.prof[2][0] + 0.0015, [l0, l1] = bk.lab;
  const lab = new THREE.CylinderGeometry(lr, lr, l1 - l0, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9);
  P.push([at(lab, x, y + (l0 + l1) / 2, z, 0, ry, 0), tm('bottleLabel' + kind, labelTex(kind))]);
  return P;
}

// ---------------------------------------------------------------- the steel shelf
// painted blue, three shelves of bottles, glasses, a cooler, a cassette deck
export function liquorShelf(b, x, z, ry, o = {}) {
  const blue = pm('shelfBlue', 0x3a6aa8, { r: 0.5, m: 0.2 });
  const w = o.w ?? 0.78, d = o.d ?? 0.38, h = o.h ?? 1.25;
  b.beginFrame(x, 0, z, ry);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(boxGeo(0.03, h, 0.03), blue, { x: sx * (w / 2 - 0.015), y: h / 2, z: sz * (d / 2 - 0.015) });
  const ys = [0.12, 0.52, 0.9, h - 0.01];
  for (const y of ys) { b.geo(roundedBox(w, 0.02, d, 0.004), blue, { x: 0, y, z: 0 }); b.collider(0, y, 0, w, 0.02, d); }
  b.collider(0, h / 2, -d / 2, w, h, 0.02);
  // bottles
  const r = new RNG(o.seed ?? 7);
  const kinds = [[0, 0, 1, 5, 1, 0], [2, 2, 3, 3, 4, 4, 4], [1, 5, 0, 1]];
  [0.53, 0.91, h].forEach((y, row) => {
    const ks = kinds[row];
    ks.forEach((k, i) => {
      const bx = -w / 2 + 0.06 + i * ((w - 0.12) / Math.max(1, ks.length - 1)) + r.range(-0.01, 0.01);
      const bz = r.range(-0.08, 0.08);
      for (const [g, m] of bottleParts(k, bx, y + 0.01, bz, r.range(-0.6, 0.6))) b.geo(g, m, { cast: true });
    });
  });
  // bottom: a styrofoam cooler and a crate of soda
  b.geo(roundedBox(0.36, 0.28, 0.28, 0.02), pm('styro', 0xf2f0ea, { r: 0.9 }), { x: -0.18, y: 0.27, z: 0.02 });
  b.geo(roundedBox(0.37, 0.03, 0.29, 0.01), pm('styroLid', 0xe6e2d8, { r: 0.9 }), { x: -0.18, y: 0.42, z: 0.02 });
  b.geo(boxGeo(0.3, 0.2, 0.26), pm('crateYellow', 0xe0b020, { r: 0.6 }), { x: 0.2, y: 0.23, z: 0.02 });
  for (let i = 0; i < 4; i++) for (const [g, m] of bottleParts(3, 0.12 + (i % 2) * 0.12, 0.17, -0.05 + Math.floor(i / 2) * 0.1)) b.geo(g, m);
  const top = V(...b.toWorld(0, h, 0));
  b.endFrame();
  return { top };
}

// ---------------------------------------------------------------- pink radio
// two-band radio with a carry handle; the morning news, the luk thung station
export function pinkRadio(x, y, z, ry) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = ry; G.world.root.add(root);
  const pink = pm('radioPink', 0xe87aa0, { r: 0.45 }), dark = pm('radioGrille', 0x2a2226, { r: 0.7 });
  const grille = printed('radioGrille', 64, 64, (c, w, h) => { c.fillStyle = '#3a3036'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1416'; for (let yy = 3; yy < h; yy += 6) for (let xx = 3 + (yy % 12 ? 3 : 0); xx < w; xx += 6) { c.beginPath(); c.arc(xx, yy, 1.6, 0, 6.3); c.fill(); } });
  const dial = printed('radioDial', 128, 32, (c, w, h) => {
    c.fillStyle = '#f0e8c8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a2a1a'; c.font = '700 8px Arial'; c.textAlign = 'center';
    ['AM', '53', '60', '70', '90', '120', '160'].forEach((s, i) => c.fillText(s, 10 + i * 18, 11));
    ['FM', '88', '92', '96', '100', '104', '108'].forEach((s, i) => c.fillText(s, 10 + i * 18, 26));
    c.fillStyle = '#c02020'; c.fillRect(70, 2, 2, 28);
  });
  assemble([
    [roundedBox(0.3, 0.17, 0.09, 0.025), pink],
    [at(new THREE.PlaneGeometry(0.13, 0.12), -0.06, -0.005, 0.0455), tm('radioGrilleM', grille)],
    [at(new THREE.PlaneGeometry(0.12, 0.03), 0.075, 0.04, 0.0455), tm('radioDialM', dial)],
    [at(cylGeo(0.016, 0.02, 12), 0.05, -0.04, 0.05, Math.PI / 2), dark],
    [at(cylGeo(0.016, 0.02, 12), 0.105, -0.04, 0.05, Math.PI / 2), dark],
    [at(new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), 0, 0.085, 0), pink],
    [rod(V(0.12, 0.08, -0.02), V(0.2, 0.42, -0.08), 0.004, 0.0025, 5), M.chrome],
  ], root);
  G.physics.addStaticBox(x, y + 0.09, z, 0.15, 0.09, 0.05, ry);
  const r = { root, on: false, h: null, pos: root.localToWorld(V(0, 0.05, 0.05)) };
  new Button(root, {
    name: 'radio', label: () => (r.on ? 'Turn the radio off' : 'Turn on the radio'),
    onUse: () => { r.on ? r.off() : r.play(); },
  });
  r.play = () => { if (r.on) return; r.on = true; sfx('click', { pos: r.pos, vol: 0.5 }); sfx('radioTune', { pos: r.pos, vol: 0.35 }); r.h = loop('radioLukThung', { pos: r.pos, vol: 0.34, fade: 1.2 }); emit('radio', true); };
  r.off = () => { if (!r.on) return; r.on = false; sfx('click', { pos: r.pos, vol: 0.5 }); if (r.h) { r.h.stop(0.2); r.h = null; } emit('radio', false); };
  return r;
}

// ---------------------------------------------------------------- turntable
export function turntable(b, x, y, z, ry) {
  b.beginFrame(x, y, z, ry);
  const wood = pm('ttWood', 0x6a4226, { r: 0.5 }), alu = M.steel;
  b.geo(roundedBox(0.44, 0.1, 0.34, 0.01), wood, { x: 0, y: 0.05, z: 0 });
  b.geo(roundedBox(0.43, 0.012, 0.33, 0.004), pm('ttTop', 0x2a2a2a, { r: 0.4 }), { x: 0, y: 0.104, z: 0 });
  b.geo(cylGeo(0.15, 0.015, 32), alu, { x: -0.05, y: 0.115, z: 0 });
  b.geo(cylGeo(0.148, 0.003, 32), pm('vinyl', 0x0c0c0e, { r: 0.25 }), { x: -0.05, y: 0.124, z: 0 });
  b.geo(cylGeo(0.045, 0.0035, 16), pm('vinylLabel', 0xd8301c, { r: 0.6 }), { x: -0.05, y: 0.1245, z: 0 });
  b.geo(cylGeo(0.018, 0.04, 10), alu, { x: 0.16, y: 0.125, z: -0.11 });
  b.geo(rod(V(0.16, 0.14, -0.11), V(0.05, 0.135, 0.07), 0.004), alu, {});
  b.geo(roundedBox(0.03, 0.012, 0.02, 0.003), M.black, { x: 0.045, y: 0.132, z: 0.075 });
  // smoked dust cover, propped open
  b.geo(boxGeo(0.44, 0.08, 0.34), pm('dustCover', 0x5a4a40, { r: 0.1, transparent: true, opacity: 0.35, depthWrite: false }), { x: 0, y: 0.22, z: -0.2, rx: -1.25, cast: false });
  b.collider(0, 0.06, 0, 0.44, 0.12, 0.34);
  b.endFrame();
}
// record sleeves leaning in a row
export function records(b, x, z, ry, n = 9) {
  const cols = ['#d84a2a', '#2a5aa8', '#e8c040', '#3a8a4a', '#8a2a8a', '#e87aa0', '#1a1a1a', '#f0f0e8', '#a87a3a'];
  b.beginFrame(x, 0, z, ry);
  for (let i = 0; i < n; i++) {
    const tex = printed('sleeve' + i, 64, 64, (c, w, h) => {
      c.fillStyle = cols[i % cols.length]; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(w / 2, h * 0.45, 14 + (i % 3) * 3, 0, 6.3); c.fill();
      c.fillStyle = cols[(i + 3) % cols.length]; c.font = `700 10px ${TH}`; c.textAlign = 'center';
      c.fillText(['ลูกทุ่ง', 'สุนทราภรณ์', 'เพลงฮิต ๔๐', 'หมอลำ', 'ร็อค', 'สตริง', 'ลูกกรุง', 'แจ๊ส', 'คาราบาว?'][i], w / 2, h - 10);
      ageCanvas(c, w, h, 0.25, i + 9);
    });
    b.geo(boxGeo(0.31, 0.31, 0.004), tm('sleeveM' + i, tex), { x: 0, y: 0.155, z: i * 0.012, rx: -0.18 + i * 0.012, cast: true });
  }
  b.endFrame();
}

// ---------------------------------------------------------------- split AC
export function airCon(x, y, z, ry) {
  const root = new THREE.Group(); root.position.set(x, y, z); root.rotation.y = ry; G.world.root.add(root);
  const white = pm('acWhite', 0xf0eee6, { r: 0.4 });
  const brand = printed('acBrand', 64, 16, (c, w, h) => { c.fillStyle = '#f0eee6'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a4a8a'; c.font = '900 10px Arial'; c.textAlign = 'center'; c.fillText('SAIKOOL', w / 2, 11); });
  assemble([
    [roundedBox(0.82, 0.27, 0.2, 0.03), white],
    [at(new THREE.PlaneGeometry(0.1, 0.025), 0.3, 0.06, 0.101), tm('acBrandM', brand)],
    [at(boxGeo(0.68, 0.035, 0.02), 0, -0.1, 0.09), pm('acSlot', 0x3a3a3c, { r: 0.6 })],
    [rod(V(0.38, -0.1, -0.08), V(0.4, -0.6, -0.09), 0.012), white],
  ], root);
  const flap = new THREE.Mesh(boxGeo(0.68, 0.05, 0.008), white); flap.position.set(0, -0.12, 0.105); root.add(flap);
  const led = new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x40ff60, emissiveIntensity: 0 });
  const l = new THREE.Mesh(boxGeo(0.01, 0.005, 0.004), led); l.position.set(0.33, -0.06, 0.101); root.add(l);
  const ac = { on: false, hum: null, root, pos: root.localToWorld(V(0, 0, 0.1)) };
  new Button(root, {
    name: 'ac', reach: 2.8, label: () => (ac.on ? 'Turn the air-con off' : 'Turn on the air-con'),
    onUse: () => { ac.on ? ac.off() : ac.start(); },
  });
  ac.start = () => { if (G.world.power === false) return; ac.on = true; sfx('beep', { pos: ac.pos, vol: 0.4, rate: 1.3 }); ac.hum = loop('fridgeHum', { pos: ac.pos, vol: 0.3, rate: 1.4 }); emit('aircon', true); };
  ac.off = () => { if (!ac.on) return; ac.on = false; sfx('beep', { pos: ac.pos, vol: 0.4, rate: 1.1 }); if (ac.hum) { ac.hum.stop(0.5); ac.hum = null; } };
  G.world.updaters.push((dt) => {
    flap.rotation.x = damp(flap.rotation.x, ac.on ? 0.9 : 0, 2, dt);
    led.emissiveIntensity = ac.on ? 1.5 : 0;
    if (ac.on && G.world.power === false) ac.off();
  });
  return ac;
}
// the outdoor unit on the balcony, fan going round behind its grille
export function acCompressor(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const grey = pm('compGrey', 0xd8d6cc, { r: 0.55 });
  b.geo(roundedBox(0.75, 0.55, 0.28, 0.02), grey, { x: 0, y: 0.32, z: 0 });
  b.geo(cylGeo(0.2, 0.02, 24), pm('compGrille', 0x2a2a2a, { r: 0.6 }), { x: -0.12, y: 0.32, z: 0.14, rx: Math.PI / 2 });
  for (const sx of [-1, 1]) b.geo(boxGeo(0.06, 0.05, 0.3), M.rustMetal, { x: sx * 0.3, y: 0.025, z: 0 });
  b.collider(0, 0.3, 0, 0.75, 0.6, 0.3);
  b.endFrame();
}

// ---------------------------------------------------------------- mosquito coil
export function mosquitoCoil(x, z) {
  const pts = [];
  for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * Math.PI * 2 * 3.2, r = 0.012 + t * 0.05; pts.push(V(Math.cos(a) * r, 0.03, Math.sin(a) * r)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.0035, 4);
  const root = new THREE.Group(); root.position.set(x, 0, z); G.world.root.add(root);
  assemble([[g, pm('coilGreen', 0x2a5a2a, { r: 0.9 })], [cylGeo(0.07, 0.03, 18), pm('coilTin', 0x9a9a92, { r: 0.4, m: 0.6 })], [at(cylGeo(0.0015, 0.04, 3), 0, 0.03, 0), M.steel]], root);
  const tipP = root.localToWorld(pts[pts.length - 1].clone());
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 5), glowMat(0xff6020, 0xff4010, 3)); tip.position.copy(tipP); G.world.root.add(tip);
  let t = 0;
  G.world.updaters.push((dt) => { t += dt; if (G.particles && t > 0.5) { t = 0; G.particles.steam(tipP.clone().add(V(0, 0.01, 0))); } });
  return root;
}

// ---------------------------------------------------------------- bed
// a low teak platform, a thick mattress in flowered cotton, two pillows, the
// long bolster you hold at night, a folded blanket and the mosquito net knotted
// up out of the way
export function thaiBed(b, x, z, ry, o = {}) {
  const w = o.w ?? 1.5, L = o.L ?? 2.0;
  b.beginFrame(x, 0, z, ry);
  const teak = pm('teak', 0x7a4a26, { r: 0.55 });
  const sheet = floral('sheet', '#f2e4ea', ['#e86a90', '#f0b0c4', '#7aa0d8'], { seed: 5, size: 128, n: 10 });
  const pillowM = floral('pillow', '#e8f0f4', ['#4a7ac8', '#e86a8a'], { seed: 6, size: 96, n: 6, stripe: '#d8e4ee' });
  // frame: rails on short legs; a cat fits under
  for (const sx of [-1, 1]) b.geo(roundedBox(0.06, 0.14, L, 0.012), teak, { x: sx * (w / 2 - 0.03), y: 0.27, z: 0 });
  for (const sz of [-1, 1]) b.geo(roundedBox(w, 0.14, 0.06, 0.012), teak, { x: 0, y: 0.27, z: sz * (L / 2 - 0.03) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.geo(boxGeo(0.07, 0.21, 0.07), teak, { x: sx * (w / 2 - 0.035), y: 0.105, z: sz * (L / 2 - 0.035) });
  b.box(0, 0.325, 0, w - 0.1, 0.02, L - 0.1, teak, { collide: false });
  // headboard
  b.geo(roundedBox(w + 0.04, 0.7, 0.05, 0.02), teak, { x: 0, y: 0.48, z: -L / 2 - 0.02 });
  b.geo(roundedBox(w - 0.2, 0.36, 0.02, 0.01), pm('teakPanel', 0x5a3418, { r: 0.6 }), { x: 0, y: 0.52, z: -L / 2 + 0.01, cast: false });
  b.collider(0, 0.42, -L / 2 - 0.02, w + 0.04, 0.84, 0.06);
  // mattress and covers
  const mat = roundedBox(w - 0.06, 0.2, L - 0.08, 0.07, 2);
  b.geo(mat, sheet, { x: 0, y: 0.435, z: 0 });
  b.geo(drapeGeo(w - 0.02, L * 0.42, 0.16, { seed: 4 }), plaid('blanket', '#3a6a9a', '#d8c070', '#e8e0d0', 4), { x: 0, y: 0.54, z: L / 2 - L * 0.25 });
  for (const [px, rz] of [[-0.34, 0.05], [0.32, -0.06]]) {
    const pg = roundedBox(0.55, 0.12, 0.34, 0.055, 2);
    const pp = pg.attributes.position; for (let k = 0; k < pp.count; k++) { const yy = pp.getY(k); if (yy > 0.02) pp.setY(k, yy - 0.03 * Math.exp(-((pp.getX(k)) ** 2 + (pp.getZ(k)) ** 2) / 0.02)); }
    pg.computeVertexNormals();
    b.geo(pg, pillowM, { x: px, y: 0.6, z: -L / 2 + 0.26, rz });
  }
  // the bolster (mon khang), lying where it was kicked
  const bol = new THREE.CapsuleGeometry(0.1, 0.75, 4, 12); bol.rotateZ(Math.PI / 2);
  b.geo(bol, pillowM, { x: 0.15, y: 0.63, z: 0.05, ry: 0.5 });
  // a triangle pillow (mon khwan) against the headboard
  const tri = new THREE.CylinderGeometry(0.2, 0.2, 0.42, 3, 1); tri.rotateZ(Math.PI / 2); tri.scale(1, 0.75, 0.55);
  b.geo(tri, pm('monKhwan', 0xc8342a, { r: 0.8 }), { x: -0.05, y: 0.69, z: -L / 2 + 0.12, rx: 0.4 });
  b.collider(0, 0.38, 0, w, 0.34, L);
  b.endFrame();
  // mosquito net: knotted up from a ceiling hook in a long soft cone
  const net = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 16, 4, true), pm('net', 0xf0f2f4, { r: 1, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
  const [nx, , nz] = (b.beginFrame(x, 0, z, ry), b.toWorld(0.3, 0, -0.1)); b.endFrame();
  net.position.set(nx, 2.12, nz); net.rotation.x = Math.PI; net.scale.set(1, 1, 0.7);
  G.world.root.add(net);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), net.material); knot.position.set(nx, 1.7, nz); knot.scale.set(1, 0.6, 1); G.world.root.add(knot);
  const W = (lx, ly, lz) => { b.beginFrame(x, 0, z, ry); const p = b.toWorld(lx, ly, lz); b.endFrame(); return V(...p); };
  return { pillow: W(-0.25, 0.66, -L / 2 + 0.28), mattressY: 0.54, center: W(0, 0.54, 0), head: W(0, 0.66, -L / 2 + 0.3), w, L, net };
}

// ---------------------------------------------------------------- small things
// a plastic three-drawer tower (translucent, pastel)
export function drawerTower(b, x, z, ry, col = 0x9ad0e0) {
  const m = pm('drawerPlastic' + col.toString(16), col, { r: 0.35, transparent: true, opacity: 0.85 });
  b.beginFrame(x, 0, z, ry);
  b.geo(roundedBox(0.36, 0.62, 0.42, 0.015), m, { x: 0, y: 0.31, z: 0 });
  for (let i = 0; i < 3; i++) b.geo(roundedBox(0.3, 0.012, 0.02, 0.004), pm('drawerLip', 0xf0f0f0, { r: 0.4 }), { x: 0, y: 0.1 + i * 0.2 + 0.15, z: 0.215, cast: false });
  b.collider(0, 0.31, 0, 0.36, 0.62, 0.42);
  b.endFrame();
  return V(x, 0.62, z);
}
// newspapers in a tied stack
export function paperStack(b, x, z, ry, n = 12) {
  const tex = newspaperTex();
  b.beginFrame(x, 0, z, ry);
  for (let i = 0; i < n; i++) b.geo(boxGeo(0.4, 0.012, 0.29), i === n - 1 ? tm('newsTop', tex) : pm('newsEdge', 0xd8d2c0, { r: 1 }), { x: Math.sin(i * 2.1) * 0.01, y: 0.006 + i * 0.012, z: Math.cos(i * 1.7) * 0.01, ry: Math.sin(i) * 0.04 });
  b.geo(boxGeo(0.005, n * 0.012 + 0.004, 0.3), pm('twine', 0xc8a060, { r: 1 }), { x: 0.1, y: n * 0.006, z: 0, cast: false });
  b.collider(0, n * 0.006, 0, 0.4, n * 0.012, 0.29);
  b.endFrame();
}
export function newspaperTex() {
  return printed('newspaper', 256, 184, (c, w, h) => {
    c.fillStyle = '#ece6d4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b01818'; c.fillRect(0, 0, w, 26);
    c.fillStyle = '#fff'; c.font = `800 20px ${TH}`; c.textAlign = 'left'; c.fillText('ไทยรายวัน', 8, 20);
    c.font = '700 8px Arial'; c.textAlign = 'right'; c.fillText('THAI DAILY  ๒ ก.ค. ๒๕๔๐  ราคา ๗ บาท', w - 6, 16);
    c.fillStyle = '#111'; c.textAlign = 'left'; c.font = `800 30px ${TH}`; c.fillText('ลอยตัวค่าเงินบาท!', 8, 58);
    c.font = '900 11px Arial'; c.fillText('BAHT FLOATED - BANK OF THAILAND ENDS THE PEG', 8, 74);
    c.fillStyle = '#888'; c.fillRect(8, 82, 110, 70);
    c.fillStyle = '#555'; c.fillRect(20, 96, 30, 56); c.fillRect(60, 90, 26, 62); c.fillRect(92, 104, 20, 48);
    c.fillStyle = '#333'; for (let i = 0; i < 12; i++) c.fillRect(126, 84 + i * 6, 120 - (i % 4) * 8, 2);
    c.font = `700 11px ${TH}`; c.fillStyle = '#111'; c.fillText('ตึกร้างซอยข้างร้าว?', 8, 166);
    c.font = '700 7px Arial'; c.fillText('THE GHOST TOWER: CRACKS ON 31ST FLOOR', 8, 178);
    ageCanvas(c, w, h, 0.18, 4);
  });
}
// a plastic bag of something, tied at the top, hung on a nail or left on the floor
export function plasticBag(b, x, y, z, col = 0xf0f0f0, s = 1) {
  const m = pm('bag' + col.toString(16), col, { r: 0.3, transparent: true, opacity: 0.8 });
  const g = new THREE.SphereGeometry(0.11 * s, 10, 8); g.scale(1, 1.15, 0.85);
  const p = g.attributes.position; const r = new RNG(Math.floor(x * 100 + z * 10));
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + r.range(-0.08, 0.08)), p.getY(i), p.getZ(i) * (1 + r.range(-0.08, 0.08)));
  g.computeVertexNormals();
  b.geo(g, m, { x, y: y + 0.12 * s, z });
  b.geo(new THREE.ConeGeometry(0.03 * s, 0.08 * s, 6), m, { x, y: y + 0.27 * s, z });
  for (const sx of [-1, 1]) b.geo(new THREE.TorusGeometry(0.02 * s, 0.005 * s, 4, 8), m, { x: x + sx * 0.025 * s, y: y + 0.32 * s, z, ry: 0.3 });
}
// flip-flops: a pair, a little apart
export function flipflops(b, x, z, ry, col = 0x2a6ac8) {
  const sole = pm('ffSole' + col.toString(16), col, { r: 0.7 }), strap = pm('ffStrap', 0xf0f0f0, { r: 0.6 });
  b.beginFrame(x, 0, z, ry);
  for (const [sx, a] of [[-0.06, 0.1], [0.07, -0.15]]) {
    const g = new THREE.CylinderGeometry(0.045, 0.045, 0.015, 12); g.scale(1, 1, 2.6);
    b.geo(g, sole, { x: sx, y: 0.008, z: 0, ry: a, cast: false });
    b.geo(new THREE.TorusGeometry(0.035, 0.004, 4, 10, Math.PI), strap, { x: sx, y: 0.016, z: -0.02, ry: a + Math.PI / 2, rx: -Math.PI / 2, cast: false });
  }
  b.endFrame();
}
// a big glazed water jar with dragons on it (Ratchaburi), a plant in it
export function dragonJar(b, x, z, s = 1) {
  const glaze = (() => {
    const k = 'dragonGlaze';
    if (M[k]) return M[k];
    const tex = printed('dragonJar', 128, 64, (c, w, h) => {
      c.fillStyle = '#6a3a1a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e8c870'; c.lineWidth = 3;
      for (let i = 0; i < 2; i++) { c.beginPath(); for (let xx = 0; xx <= 64; xx += 2) { const yy = h / 2 + Math.sin(xx / 8) * 10; xx ? c.lineTo(i * 64 + xx, yy) : c.moveTo(i * 64, yy); } c.stroke(); c.fillStyle = '#e8c870'; c.beginPath(); c.arc(i * 64 + 8, h / 2 - 6, 5, 0, 6.3); c.fill(); }
      c.fillStyle = '#4a2a10'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
      ageCanvas(c, w, h, 0.2, 8);
    });
    tex.wrapS = THREE.RepeatWrapping;
    return std(k, { map: tex }, { roughness: 0.3, env: 1 });
  })();
  b.geo(lathe([[0.001, 0], [0.16 * s, 0], [0.24 * s, 0.12 * s], [0.27 * s, 0.3 * s], [0.22 * s, 0.5 * s], [0.15 * s, 0.56 * s], [0.16 * s, 0.6 * s], [0.001, 0.6 * s]], 20), glaze, { x, y: 0, z });
  b.geo(cylGeo(0.14 * s, 0.01, 16), pm('jarWater', 0x2a4a3a, { r: 0.1 }), { x, y: 0.585 * s, z });
  for (let i = 0; i < 5; i++) { const a = i * 1.3; b.geo(new THREE.SphereGeometry(0.05 * s, 6, 4).scale(1, 0.2, 1), pm('lotusLeaf', 0x4a8a3a, { r: 0.6 }), { x: x + Math.cos(a) * 0.07 * s, y: 0.6 * s, z: z + Math.sin(a) * 0.07 * s }); }
  b.collider(x, 0.3 * s, z, 0.5 * s, 0.6 * s, 0.5 * s);
}
// a potted plant on the balcony: bougainvillea, basil, chilli
export function pottedPlant(b, x, z, kind = 0, s = 1) {
  const pot = pm('terracotta', 0xa85a34, { r: 0.85 });
  b.geo(lathe([[0.001, 0], [0.09 * s, 0], [0.13 * s, 0.22 * s], [0.14 * s, 0.24 * s], [0.001, 0.24 * s]], 14), pot, { x, y: 0, z });
  const leafM = pm('leaf' + kind, [0x3a7a3a, 0x4a8a2a, 0x2a6a32][kind], { r: 0.7 });
  const flowerM = pm('flower' + kind, [0xd83a8a, 0xf0f0f0, 0xd82a1a][kind], { r: 0.6 });
  const r = new RNG(Math.floor(x * 97 + z * 31 + kind));
  for (let i = 0; i < 14; i++) {
    const a = r.range(0, 6.28), rr = r.range(0.02, 0.14) * s, h = r.range(0.28, 0.6) * s;
    b.geo(new THREE.SphereGeometry(r.range(0.05, 0.09) * s, 6, 5).scale(1, 0.7, 1), leafM, { x: x + Math.cos(a) * rr, y: h, z: z + Math.sin(a) * rr });
    if (i % 3 === 0) b.geo(new THREE.SphereGeometry(0.025 * s, 5, 4), flowerM, { x: x + Math.cos(a) * rr * 1.2, y: h + 0.04 * s, z: z + Math.sin(a) * rr * 1.2 });
  }
  b.collider(x, 0.2 * s, z, 0.26 * s, 0.4 * s, 0.26 * s);
}
// a stand of shirts and a pha khao ma on a steel drying rack
export function dryingRack(b, x, z, ry, w = 1.2) {
  const steel = M.steel;
  b.beginFrame(x, 0, z, ry);
  for (const sx of [-1, 1]) { b.geo(rod(V(sx * w / 2, 0, -0.25), V(sx * w / 2, 1.3, 0), 0.01), steel, {}); b.geo(rod(V(sx * w / 2, 0, 0.25), V(sx * w / 2, 1.3, 0), 0.01), steel, {}); }
  b.geo(rod(V(-w / 2, 1.3, 0), V(w / 2, 1.3, 0), 0.01), steel, {});
  b.geo(rod(V(-w / 2, 1.0, 0), V(w / 2, 1.0, 0), 0.008), steel, {});
  const shirts = [0xd84a3a, 0xf0f0e8, 0x2a5aa8, 0xe8c040, 0x3a8a4a];
  for (let i = 0; i < 5; i++) {
    const m = pm('shirt' + i, shirts[i], { r: 0.95, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(0.34, 0.55, 3, 4);
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 18 + i) * 0.012);
    g.computeVertexNormals();
    b.geo(g, m, { x: -w / 2 + 0.16 + i * ((w - 0.3) / 4), y: 1.3 - 0.29, z: (i % 2) * 0.03 - 0.015, cast: true });
  }
  const pk = new THREE.PlaneGeometry(0.9, 0.5, 4, 4);
  b.geo(pk, plaid('phakhaoma', '#c82a2a', '#2a3a8a', '#f0f0f0', 6), { x: 0, y: 0.75, z: 0.02 });
  b.collider(0, 0.65, 0, w, 1.3, 0.5);
  b.endFrame();
}
// a motorbike helmet on the floor
export function helmet(b, x, y, z, col = 0xd8d2c0) {
  const m = pm('helmet' + col.toString(16), col, { r: 0.3 });
  b.geo(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), m, { x, y: y + 0.0, z });
  b.geo(boxGeo(0.2, 0.06, 0.01), pm('visor', 0x2a2a30, { r: 0.1, transparent: true, opacity: 0.7 }), { x, y: y + 0.06, z: z + 0.135, rx: -0.3 });
}
// the cardboard box Khanom sleeps in, with an old towel
export function catBox(b, x, z, ry) {
  b.beginFrame(x, 0, z, ry);
  const cb = M.cardboard;
  b.box(0, 0.005, 0, 0.42, 0.01, 0.34, cb, { collide: false });
  for (const sx of [-1, 1]) b.box(sx * 0.205, 0.08, 0, 0.01, 0.16, 0.34, cb, { collide: false });
  b.box(0, 0.08, -0.165, 0.42, 0.16, 0.01, cb, { collide: false });
  b.box(0, 0.05, 0.165, 0.42, 0.1, 0.01, cb, { collide: false });
  b.geo(drapeGeo(0.36, 0.3, 0.05, { seed: 9 }), M.towel, { x: 0, y: 0.03, z: 0 });
  b.endFrame();
}

// ---------------------------------------------------------------- voxels
// Chunky voxel clutter: fn(i, j, k) returns a palette key (or null) for each
// cell of an nx*ny*nz grid; only faces against empty cells are built, one
// mesh per colour, baked through the builder.
export function voxels(b, dims, fn, palette, x, y, z, ry = 0, vs = 0.02, o = {}) {
  const [nx, ny, nz] = dims;
  const grid = new Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid[id(i, j, k)] = fn(i, j, k) || null;
  const at = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? null : grid[id(i, j, k)]);
  // each face: normal n and in-plane axes u, v with u x v = n, so the corners
  // (-1,-1) (1,-1) (1,1) (-1,1) wind counter-clockwise seen from outside
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  const per = {};
  const ox = -nx * vs / 2, oz = -nz * vs / 2, h = vs / 2;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = grid[id(i, j, k)]; if (!c) continue;
    const P = per[c] || (per[c] = { p: [], n: [], idx: [] });
    const cx = ox + (i + 0.5) * vs, cy = (j + 0.5) * vs, cz = oz + (k + 0.5) * vs;
    for (const [n, u, v] of faces) {
      if (at(i + n[0], j + n[1], k + n[2])) continue;
      const base = P.p.length / 3;
      for (const [a, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.p.push(cx + (n[0] + u[0] * a + v[0] * t) * h, cy + (n[1] + u[1] * a + v[1] * t) * h, cz + (n[2] + u[2] * a + v[2] * t) * h);
      for (let q = 0; q < 4; q++) P.n.push(n[0], n[1], n[2]);
      P.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  b.beginFrame(x, y, z, ry);
  for (const [c, P] of Object.entries(per)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.p.length / 3 * 2), 2));
    g.setIndex(P.idx);
    b.geo(g, pm('vox_' + c, palette[c], { r: 0.75 }), { cast: o.cast ?? true });
  }
  if (o.collide !== false) b.collider(0, ny * vs / 2, 0, nx * vs, ny * vs, nz * vs);
  b.endFrame();
}

// a voxel pot plant: terracotta pot, stems, leaf clusters and flowers
export function voxelPlant(b, x, z, kind = 0, s = 1) {
  const r = new RNG(Math.floor(x * 131 + z * 71 + kind * 13));
  const n = 13, h = 22;
  const leaves = [];
  for (let i = 0; i < 9; i++) leaves.push([r.range(2, n - 2), r.range(9, h - 2), r.range(2, n - 2), r.range(2.2, 3.6)]);
  const flower = ['F', 'W', 'R'][kind];
  voxels(b, [n, h, n], (i, j, k) => {
    const cx = i - n / 2 + 0.5, cz = k - n / 2 + 0.5, rr = Math.hypot(cx, cz);
    if (j < 7) return rr < 3.6 + j * 0.25 && (j < 6 || rr > 2.4) ? (j === 6 ? 'T' : 'P') : null;
    if (j === 6 || (j === 7 && rr < 3)) return 'S';
    if (rr < 0.8 && j < 12) return 'B';
    for (const [lx, ly, lz, lr] of leaves) {
      const d = Math.hypot(i - lx, (j - ly) * 1.3, k - lz);
      if (d < lr) return d > lr - 1 && ((i * 7 + j * 3 + k * 5) % 5 === 0) ? flower : ((i + j + k) % 3 ? 'L' : 'D');
    }
    return null;
  }, { P: 0xb0603a, T: 0x8a4428, S: 0x3a2a1a, B: 0x5a3a1e, L: [0x3a8a3a, 0x5a9a2a, 0x2a7a3a][kind], D: [0x2a6a2a, 0x3a7a1a, 0x1a5a2a][kind], F: 0xe03a9a, W: 0xf4f4f0, R: 0xe02a1a }, x, 0, z, r.range(0, 6.28), 0.02 * s);
}

// fruit for the table: a durian, a hand of small bananas, two mangoes
export function voxelFruit(b, x, y, z, ry = 0) {
  voxels(b, [9, 9, 10], (i, j, k) => {
    const d = Math.hypot((i - 4) / 4.2, (j - 4) / 4.2, (k - 4.5) / 4.8);
    if (d > 1) return null;
    return (i + j + k) % 2 ? 'G' : (d > 0.85 ? 'g' : 'G');
  }, { G: 0x7a8a2a, g: 0x4a5a1a }, x, y, z, ry, 0.022, { collide: false });
  voxels(b, [8, 4, 4], (i, j, k) => (j <= 1 + Math.abs(i - 3.5) * 0.35 && j >= Math.abs(i - 3.5) * 0.35 - 0.5 ? (i === 0 || i === 7 ? 'K' : 'Y') : null), { Y: 0xf0d040, K: 0x3a2a10 }, x + 0.18, y, z + 0.06, ry + 0.5, 0.02, { collide: false });
  for (const [dx, dz] of [[-0.16, 0.08], [-0.13, -0.08]]) voxels(b, [4, 3, 6], (i, j, k) => (Math.hypot((i - 1.5) / 2, (j - 1) / 1.5, (k - 2.5) / 3) < 1 ? (k > 3 ? 'O' : 'M') : null), { M: 0xf0b030, O: 0xd8701a }, x + dx, y, z + dz, ry + dx * 8, 0.02, { collide: false });
}

// a pinto (tiffin carrier): four stacked enamel pots in a steel frame
export function voxelPinto(b, x, y, z, ry = 0) {
  voxels(b, [7, 16, 7], (i, j, k) => {
    const rr = Math.hypot(i - 3, k - 3);
    if (j >= 13) return (i === 3 && k > 0 && k < 6 && j === 15) || ((k === 1 || k === 5) && i === 3 && j < 15) ? 'H' : null;
    if (rr > 3.1) return null;
    return j % 3 === 2 ? 'R' : 'E';
  }, { E: 0xf0ece0, R: 0xc0302a, H: 0xb8b8b8 }, x, y, z, ry, 0.016, { collide: false });
}
