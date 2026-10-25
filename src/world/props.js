// Placing the CC0 models: real-world-scale clones, recentred so the origin is
// the middle of the footprint on the floor, front facing local +z, with a box
// collider. Parts (drawers, hands, blades, lids) can be split off to animate.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { ASSETS } from '../gfx/assets.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export const has = (name) => !!ASSETS.models[name];

// opts: x, y, z, ry, scale (number or [x,y,z]), fitW / fitH / fitD (metres),
// only / skip (node names), collide (true | false | [w,h,d] override), parent
export function prop(name, o = {}) {
  const src = ASSETS.models[name];
  if (!src) return null;
  const model = src.clone(true);
  if (o.only || o.skip) {
    const drop = [];
    model.traverse((n) => { if (n.isMesh && ((o.only && !o.only.includes(n.name)) || (o.skip && o.skip.includes(n.name)))) drop.push(n); });
    for (const n of drop) n.parent.remove(n);
  }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let s = o.scale ?? (o.fitH ? o.fitH / size.y : o.fitW ? o.fitW / size.x : o.fitD ? o.fitD / size.z : 1);
  const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  const inner = new THREE.Group();
  inner.add(model);
  model.position.set(-c.x, -box.min.y, -c.z);
  inner.scale.copy(sv);
  const group = new THREE.Group();
  group.add(inner);
  group.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  group.rotation.y = o.ry ?? 0;
  (o.parent || G.world.root).add(group);
  group.updateMatrixWorld(true);
  const dim = size.clone().multiply(sv);
  const p = { name, group, inner, model, size: dim, scale: sv, offset: new THREE.Vector3(-c.x, -box.min.y, -c.z) };
  if (o.collide !== false) {
    const [w, h, d] = Array.isArray(o.collide) ? o.collide : [dim.x, dim.y, dim.z];
    p.body = G.physics.addStaticBox(group.position.x, group.position.y + h / 2, group.position.z, w / 2, h / 2, d / 2, group.rotation.y);
  }
  return p;
}

export function node(p, name) {
  let f = null;
  p.model.traverse((n) => { if (!f && n.name === name) f = n; });
  return f;
}

// Re-parent a named node under a pivot group so it can be turned or slid.
// pivot is in the model's own (unscaled, uncentred) coordinates; the pivot
// group keeps the node exactly where it was.
export function pivot(p, name, at = null) {
  const n = node(p, name);
  if (!n) return null;
  const pv = new THREE.Group();
  p.group.updateMatrixWorld(true);
  const local = at ? new THREE.Vector3(...at) : new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(n.parent.matrixWorld).invert());
  pv.position.copy(local);
  n.parent.add(pv);
  pv.add(n);
  n.position.sub(local);
  p.model.updateMatrixWorld(true);
  return pv;
}

// Detach a part into the world root, keeping its world transform; returns the
// wrapping group (used for drawers, which slide in world space)
export function detach(p, name) {
  const n = node(p, name);
  if (!n) return null;
  p.group.updateMatrixWorld(true);
  const wrap = new THREE.Group();
  n.getWorldPosition(_v); n.getWorldQuaternion(_q); n.getWorldScale(_s);
  const bb = new THREE.Box3().setFromObject(n);
  const centre = bb.getCenter(new THREE.Vector3());
  wrap.position.copy(centre);
  wrap.quaternion.copy(p.group.quaternion);
  G.world.root.add(wrap);
  wrap.updateMatrixWorld(true);
  n.parent.remove(n);
  wrap.add(n);
  // put the node back where it was, now relative to the wrap
  const inv = new THREE.Matrix4().copy(wrap.matrixWorld).invert();
  const m = new THREE.Matrix4().compose(_v, _q, _s).premultiply(inv);
  m.decompose(n.position, n.quaternion, n.scale);
  // its box in the wrap's frame (for drawer bodies)
  const lb = new THREE.Box3().setFromObject(n).applyMatrix4(inv);
  wrap.userData.size = lb.getSize(new THREE.Vector3());
  return wrap;
}

// a point in the placed frame (metres, origin on the floor at the footprint
// centre, +z the front) -> world, for lights and things standing on it
export function at(p, x, y, z) {
  p.group.updateMatrixWorld(true);
  return new THREE.Vector3(x, y, z).applyMatrix4(p.group.matrixWorld);
}

// a clone centred on its bounding box (for physics items, whose body sits at
// the mesh origin)
export function centered(name, only = null, scale = 1) {
  const src = ASSETS.models[name];
  const g = new THREE.Group();
  if (!src) return g;
  const m = src.clone(true);
  if (only) { const drop = []; m.traverse((n) => { if (n.isMesh && !only.includes(n.name)) drop.push(n); }); for (const n of drop) n.parent.remove(n); }
  m.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
  m.position.sub(c);
  m.scale.setScalar(scale); m.position.multiplyScalar(scale);
  g.add(m);
  return g;
}
