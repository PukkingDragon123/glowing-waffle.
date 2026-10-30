// Modelling helpers: bevelled boxes, lathed parts, tubes, and a mesh() shorthand with shadows.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const geoCache = new Map();
export function rbox(w, h, d, r = 0.008, seg = 2) {
  const k = `rb${w.toFixed(4)},${h.toFixed(4)},${d.toFixed(4)},${r},${seg}`;
  if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
  return geoCache.get(k);
}
// Lathe a profile [[r, y], ...] around Y.
export function lathe(profile, seg = 24) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
// Cylinder with rounded rims (bevel b), axis Y, base at y=0.
export function bcyl(r, h, b = 0.004, seg = 24, rTop = r) {
  const p = [[0, 0], [r - b, 0], [r, b], [rTop, h - b], [rTop - b, h], [0, h]];
  return lathe(p, seg);
}
export function tube(points, r = 0.01, seg = 32, rs = 8, closed = false) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed);
  return new THREE.TubeGeometry(c, seg, r, rs, closed);
}
export function mesh(geo, mat, { pos, rot, scale, shadow = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = shadow; m.receiveShadow = receive; if (name) m.name = name;
  return m;
}
export function group(...children) { const g = new THREE.Group(); for (const c of children) if (c) g.add(c); return g; }
// Thin label/plane with a texture (posters, screens, stickers).
export function plane(w, h, mat, { pos, rot } = {}) { return mesh(new THREE.PlaneGeometry(w, h), mat, { pos, rot, shadow: false }); }
