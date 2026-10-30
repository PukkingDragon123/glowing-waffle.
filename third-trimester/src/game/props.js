// Physical inventory: every item Sunny owns is a real prop with a body. The pantry counts are derived
// from the props that exist (state.pantry is kept in sync). Clutter props exist for the Day 1 mess.
import * as THREE from 'three';
import { game } from '../core/game.js';
import { ITEMS } from './items.js';
import { rbox, lathe, bcyl, mesh, group } from '../gfx/shapes.js';
import { noodleLabel, labelTex, normalMap, T } from '../gfx/textures.js';
import { rng } from '../core/util.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, envMapIntensity: 0.6, ...o });
const matCache = new Map();
const cm = (key, fn) => { if (!matCache.has(key)) matCache.set(key, fn()); return matCache.get(key); };

// Build the visual for an item id. Returns { obj, shape } (shape for the physics body).
export function itemModel(id) {
  const it = ITEMS[id] || { model: 'box', color: 0x999999, name: id };
  const col = it.color ?? 0x999999;
  const g = new THREE.Group();
  let shape;
  switch (it.model) {
    case 'packet': {
      const lab = cm('pk' + id, () => std({ map: noodleLabel(col, it.name.split('—')[1]?.trim() || 'Chicken'), normalMap: normalMap('crumple'), roughness: 0.35, envMapIntensity: 1 }));
      const side = cm('pks' + col, () => std({ color: col, normalMap: normalMap('crumple'), roughness: 0.35 }));
      g.add(mesh(rbox(0.14, 0.035, 0.12, 0.016, 3), [side, side, lab, side, side, side]));
      // crimped ends
      for (const s of [-1, 1]) g.add(mesh(rbox(0.012, 0.012, 0.12, 0.004), side, { pos: [s * 0.072, 0, 0] }));
      shape = { box: [0.075, 0.02, 0.062] }; break;
    }
    case 'cup': {
      const lab = cm('cup', () => std({ map: noodleLabel(0xd63b26, 'CUP'), roughness: 0.5 }));
      g.add(mesh(lathe([[0, 0], [0.04, 0], [0.052, 0.1], [0.054, 0.104], [0, 0.104]], 24), lab, { pos: [0, -0.052, 0] }));
      g.add(mesh(new THREE.CircleGeometry(0.054, 24), cm('lid', () => std({ color: 0xe8e1cf, metalness: 0.5, roughness: 0.3 })), { pos: [0, 0.053, 0], rot: [-Math.PI / 2, 0, 0] }));
      shape = { cyl: [0.05, 0.104] }; break;
    }
    case 'egg': {
      const carton = cm('carton', () => std({ color: 0xc7b28c, normalMap: normalMap('crumple'), roughness: 0.95 }));
      g.add(mesh(rbox(0.16, 0.06, 0.11, 0.015), carton));
      const egg = cm('egg', () => std({ color: 0xf3e9d6, roughness: 0.45 }));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(mesh(new THREE.SphereGeometry(0.022, 12, 10), egg, { pos: [-0.045 + i * 0.045, 0.035, -0.025 + j * 0.05], scale: [1, 1.25, 1] }));
      shape = { box: [0.08, 0.04, 0.055] }; break;
    }
    case 'jar': {
      const glass = cm('jarg', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.35, envMapIntensity: 1.5 }));
      g.add(mesh(lathe([[0, 0], [0.04, 0], [0.042, 0.1], [0.032, 0.11], [0, 0.11]], 20), glass, { pos: [0, -0.06, 0] }));
      g.add(mesh(lathe([[0, 0], [0.037, 0], [0.039, 0.085], [0, 0.085]], 16), cm('jc' + col, () => std({ color: col, roughness: 0.8 })), { pos: [0, -0.058, 0] }));
      g.add(mesh(bcyl(0.035, 0.025, 0.004, 18), cm('jl', () => std({ color: 0xc8302a, roughness: 0.4, metalness: 0.4 })), { pos: [0, 0.048, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.04, 20, 1, true), cm('jlab' + id, () => std({ map: labelTex(it.name.split(' ')[0].toUpperCase(), { bg: '#f2ead8', fg: '#7a2a1a', w: 256, h: 64, font: 'bold 30px Spectral, serif' }) })), { pos: [0, -0.01, 0] }));
      shape = { cyl: [0.042, 0.13] }; break;
    }
    case 'tin': {
      g.add(mesh(bcyl(0.06, 0.15, 0.006, 24), cm('tin', () => std({ map: labelTex('GLOW', { bg: '#1c4a2a', fg: '#7dff9a', w: 256, h: 128, font: 'bold 54px "Big Shoulders Stencil", sans-serif', sub: 'infant formula (xeno)' }), emissive: 0x1a6a2a, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.3 })), { pos: [0, -0.075, 0] }));
      shape = { cyl: [0.06, 0.15] }; break;
    }
    case 'can': {
      g.add(mesh(bcyl(0.035, 0.045, 0.004, 18), cm('can', () => std({ map: labelTex('SALMON', { bg: '#3a6ab0', fg: '#fff', w: 128, h: 64, font: 'bold 22px sans-serif' }), metalness: 0.6, roughness: 0.3 })), { pos: [0, -0.022, 0] }));
      shape = { cyl: [0.035, 0.045] }; break;
    }
    case 'crystal': {
      g.add(mesh(new THREE.OctahedronGeometry(0.03, 0), cm('crys', () => std({ color: 0x7dffb0, emissive: 0x2aff80, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.2 })), { scale: [0.7, 1.3, 0.7] }));
      shape = { sphere: 0.03 }; break;
    }
    case 'rattle': {
      g.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), cm('ratt', () => std({ color: 0xff8fb3, roughness: 0.3 }))), mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.09, 10), cm('rath', () => std({ color: 0xffe066 })), { pos: [0, -0.07, 0] }));
      shape = { sphere: 0.04 }; break;
    }
    default: {
      const dims = { bar: [0.15, 0.015, 0.07], bag: [0.16, 0.06, 0.12], box: [0.12, 0.05, 0.08], battery: [0.026, 0.048, 0.017], diapers: [0.22, 0.16, 0.12], wipes: [0.17, 0.05, 0.1], stick: [0.12, 0.08, 0.06] }[it.model] || [0.1, 0.06, 0.08];
      const m = it.model === 'bag' ? cm('ice', () => new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.2, transparent: true, opacity: 0.6, normalMap: normalMap('crumple') }))
        : cm('bx' + id, () => std({ map: labelTex(it.name.split(' ')[0].toUpperCase(), { bg: '#' + new THREE.Color(col).getHexString(), fg: col > 0x888888 ? '#222' : '#fff', w: 256, h: 128, font: 'bold 36px "Big Shoulders Stencil", sans-serif' }), roughness: 0.6 }));
      g.add(mesh(rbox(dims[0], dims[1], dims[2], Math.min(...dims) * 0.25), m));
      shape = { box: dims.map((d) => d / 2) };
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { obj: g, shape };
}

// Clutter for the post-raid mess.
const CLUTTER = [
  ['book', () => mesh(rbox(0.16, 0.035, 0.22, 0.006), std({ color: 0x8a3a2a, roughness: 0.8 })), { box: [0.08, 0.018, 0.11] }],
  ['book', () => mesh(rbox(0.15, 0.03, 0.21, 0.006), std({ color: 0x2a5a8a, roughness: 0.8 })), { box: [0.075, 0.015, 0.105] }],
  ['magazine', () => mesh(rbox(0.21, 0.008, 0.28, 0.003), std({ map: labelTex('KARAOKE MONTHLY', { bg: '#f26fa0', fg: '#fff', w: 256, h: 128, font: 'bold 26px sans-serif' }), roughness: 0.4 })), { box: [0.1, 0.006, 0.14] }],
  ['mug', () => group(mesh(lathe([[0, 0], [0.04, 0], [0.042, 0.095], [0.038, 0.095], [0.036, 0.006], [0, 0.006]], 18), std({ color: 0xf2c14e, roughness: 0.3 }), { pos: [0, -0.047, 0] }), mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16), std({ color: 0xf2c14e, roughness: 0.3 }), { pos: [0.045, 0, 0] })), { cyl: [0.042, 0.095] }],
  ['remote', () => mesh(rbox(0.05, 0.022, 0.17, 0.01), std({ color: 0x1a1a1a, roughness: 0.5 })), { box: [0.025, 0.011, 0.085] }],
  ['shirt', () => mesh(rbox(0.26, 0.04, 0.3, 0.02, 3), std({ map: T.fabric('#c8b07a', 'stripes', 'shirt'), normalMap: normalMap('fabric'), roughness: 1 })), { box: [0.13, 0.02, 0.15] }],
  ['toyMouse', () => group(mesh(new THREE.SphereGeometry(0.03, 12, 10), std({ color: 0x8f8f8f, roughness: 0.9 }), { scale: [1, 0.8, 1.6] }), mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4), std({ color: 0xff8fb3 }), { pos: [0, 0, -0.08], rot: [Math.PI / 2, 0, 0] })), { sphere: 0.03 }],
  ['slipper', () => mesh(rbox(0.1, 0.03, 0.26, 0.02, 3), std({ color: 0x6e2a36, roughness: 0.9 })), { box: [0.05, 0.015, 0.13] }],
  ['shard', () => mesh(new THREE.TetrahedronGeometry(0.04, 0), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.5, envMapIntensity: 2 }), { scale: [1.4, 0.3, 1] }), { box: [0.03, 0.01, 0.03] }],
  ['cushion', () => mesh(rbox(0.34, 0.12, 0.34, 0.06, 3), std({ map: T.fabric('#c9784a', 'check', 'c'), normalMap: normalMap('fabric', [2, 2]), roughness: 0.95 })), { box: [0.17, 0.06, 0.17] }],
];

export function buildProps(apt) {
  const P = apt.physics, scene = apt.scene, r = rng(17);
  const items = [];     // inventory props: { obj, id, uses, slot }
  const clutter = [];
  const api = { items, clutter };

  function addItemProp(id, pos, { uses } = {}) {
    const { obj, shape } = itemModel(id);
    obj.position.copy(pos); obj.rotation.y = (r() - 0.5) * 0.6; scene.add(obj);
    P.addProp(obj, { ...shape, mass: 0.25 });
    const it = { obj, id, uses: uses ?? (ITEMS[id]?.uses || 1), slot: null, kind: 'item' };
    obj.userData.prop = it; obj.traverse((o) => { o.userData.prop = it; });
    items.push(it); apt.draggables.push(obj);
    return it;
  }
  function removeItemProp(it) {
    P.remove(it.obj); it.obj.removeFromParent();
    items.splice(items.indexOf(it), 1); apt.draggables.splice(apt.draggables.indexOf(it.obj), 1);
    if (it.slot) it.slot.item = null;
    api.syncPantry();
  }
  // Put a prop into a shelf slot (snaps, frozen).
  function store(it, slot) {
    if (slot.item && slot.item !== it) return false;
    if (it.slot) it.slot.item = null;
    slot.item = it; it.slot = slot;
    const h = (it.obj.userData.halfY ??= new THREE.Box3().setFromObject(it.obj).getSize(new THREE.Vector3()).y / 2);
    P.freeze(it.obj, slot.pos.clone().add(new THREE.Vector3(0, h + 0.012, 0)), new THREE.Quaternion());
    it.obj.userData.dirty = true;
    return true;
  }
  function unstore(it) { if (it.slot) { it.slot.item = null; it.slot = null; } P.unfreeze(it.obj); }
  api.addItem = addItemProp; api.remove = removeItemProp; api.store = store; api.unstore = unstore;
  api.freeSlot = () => apt.slots.find((s) => !s.item);
  api.nearestSlot = (p, maxD = 0.18) => { let best = null, bd = maxD; for (const s of apt.slots) { const d = s.pos.distanceTo(p); if (d < bd && !s.item) { bd = d; best = s; } } return best; };
  // Use up `n` of an item, removing props as their uses run out. Returns true if possible.
  api.consume = (id, n = 1) => {
    let have = items.filter((i) => i.id === id).reduce((a, b) => a + b.uses, 0);
    if (have < n) return false;
    while (n > 0) { const it = items.filter((i) => i.id === id).sort((a, b) => (a.slot ? 1 : 0) - (b.slot ? 1 : 0))[0]; const k = Math.min(n, it.uses); it.uses -= k; n -= k; if (it.uses <= 0) removeItemProp(it); }
    api.syncPantry(); return true;
  };
  api.count = (id) => items.filter((i) => i.id === id).reduce((a, b) => a + b.uses, 0);
  api.syncPantry = () => {
    if (!game.state) return;
    const p = {}; for (const it of items) p[it.id] = (p[it.id] || 0) + it.uses;
    game.state.pantry = p; game.events.emit('pantry', {});
  };
  // Spawn the starting pantry on the shelf.
  api.fromPantry = (pantry) => {
    for (const it of [...items]) removeItemProp(it);
    for (const [id, n] of Object.entries(pantry)) {
      const per = ITEMS[id]?.uses || 1; let left = n;
      while (left > 0) { const slot = api.freeSlot(); const pos = slot ? slot.pos.clone().add(new THREE.Vector3(0, 0.1, 0)) : new THREE.Vector3(1.3 + r() * 0.3, 0.3, -1.4); const it = addItemProp(id, pos, { uses: Math.min(per, left) }); if (slot) store(it, slot); left -= per; }
    }
    api.syncPantry();
  };
  api.serialize = () => items.map((i) => ({ id: i.id, uses: i.uses, slot: i.slot ? apt.slots.indexOf(i.slot) : -1, p: i.obj.position.toArray().map((v) => +v.toFixed(3)) }));
  api.deserialize = (arr) => {
    for (const it of [...items]) removeItemProp(it);
    for (const d of arr || []) { const it = addItemProp(d.id, new THREE.Vector3(...d.p), { uses: d.uses }); if (d.slot >= 0 && apt.slots[d.slot]) store(it, apt.slots[d.slot]); }
    api.syncPantry();
  };
  // Clutter for the mess.
  api.scatter = () => {
    for (const c of clutter) { P.remove(c.obj); c.obj.removeFromParent(); apt.draggables.splice(apt.draggables.indexOf(c.obj), 1); }
    clutter.length = 0;
    const spots = [[-1.2, 0.6], [-0.4, -0.6], [0.6, 0.3], [1.2, 1.4], [-1.6, -0.2], [0.2, 1.6], [1.8, 0.6], [-0.9, 1.8], [0.9, -1.0], [2.3, 1.1], [2.4, 0.9], [2.2, 1.6], [-2.1, 0.5], [0.1, -1.2]];
    spots.forEach((p, i) => {
      const [kind, fn, shape] = CLUTTER[i % CLUTTER.length];
      const obj = fn(); obj.position.set(p[0] + (r() - 0.5) * 0.3, 0.3 + r() * 0.3, p[1] + (r() - 0.5) * 0.3); obj.rotation.set(r() * 3, r() * 3, r() * 3);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); scene.add(obj);
      P.addProp(obj, { ...shape, mass: 0.3 });
      const c = { obj, kind: 'clutter', name: kind }; obj.userData.prop = c; obj.traverse((o) => { o.userData.prop = c; });
      clutter.push(c); apt.draggables.push(obj);
    });
  };
  api.tidyClutter = (c) => { P.remove(c.obj); c.obj.removeFromParent(); clutter.splice(clutter.indexOf(c), 1); apt.draggables.splice(apt.draggables.indexOf(c.obj), 1); game.events.emit('clutter', { left: clutter.length }); };
  return api;
}
