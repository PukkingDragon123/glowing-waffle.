// Geometry helpers: boxes with world-scaled UVs (constant texel density),
// rounded shapes, lathe objects, and a batcher that merges static pieces by
// material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

// Box with per-face UVs in world units / texScale so textures tile at a fixed
// density regardless of box size. faces: which faces to emit (px,nx,py,ny,pz,nz)
export function boxGeo(w, h, d, texScale = 1, faces = null, uvOff = [0, 0]) {
  const pos = [], nor = [], uv = [], idx = [];
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const F = faces || { px: 1, nx: 1, py: 1, ny: 1, pz: 1, nz: 1 };
  const face = (o, u, v, n, uw, vh, key) => {
    if (!F[key]) return;
    const base = pos.length / 3;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      pos.push(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b);
      nor.push(n[0], n[1], n[2]);
      uv.push(((a + 1) / 2 * uw) / texScale + uvOff[0], ((b + 1) / 2 * vh) / texScale + uvOff[1]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face([hw, 0, 0], [0, 0, -hd], [0, hh, 0], [1, 0, 0], d, h, 'px');
  face([-hw, 0, 0], [0, 0, hd], [0, hh, 0], [-1, 0, 0], d, h, 'nx');
  face([0, hh, 0], [hw, 0, 0], [0, 0, -hd], [0, 1, 0], w, d, 'py');
  face([0, -hh, 0], [hw, 0, 0], [0, 0, hd], [0, -1, 0], w, d, 'ny');
  face([0, 0, hd], [hw, 0, 0], [0, hh, 0], [0, 0, 1], w, h, 'pz');
  face([0, 0, -hd], [-hw, 0, 0], [0, hh, 0], [0, 0, -1], w, h, 'nz');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Box whose UVs map 0..1 on every face (labels, doors)
export function boxGeoUnit(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  return g;
}

// Box with a separately mapped front face (+z) using group 1, others group 0
export function labeledBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry groups: 0 px,1 nx,2 py,3 ny,4 pz,5 nz -> we keep groups for multi-material
  return g;
}

export function roundedBox(w, h, d, r = 0.02, seg = 2) {
  // cheap rounded box by beveling a box geometry via vertex push
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(
      Math.max(-inner.x, Math.min(inner.x, v.x)),
      Math.max(-inner.y, Math.min(inner.y, v.y)),
      Math.max(-inner.z, Math.min(inner.z, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-10) { dlt.setLength(r); v.copy(c).add(dlt); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function cylGeo(r, h, seg = 12, r2 = null, texScale = 1, open = false) {
  const g = new THREE.CylinderGeometry(r2 ?? r, r, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = 2 * Math.PI * r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / texScale, uv.getY(i) * h / texScale);
  return g;
}

export function lathe(profile, seg = 16) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, seg);
}

// translate/rotate a geometry in place and return it
export function place(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// Batches static geometry per material, producing one mesh per material.
export class Batcher {
  constructor() { this.map = new Map(); }
  add(geo, mat, { cast = true, receive = true } = {}) {
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    if (!this.map.has(key)) this.map.set(key, { mat, geos: [], cast, receive });
    // normalize attributes so everything merges
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (geo.index === null) geo = geo.toNonIndexed ? toIndexed(geo) : geo;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.clearGroups();
    this.map.get(key).geos.push(geo);
  }
  build(parent, name = 'static') {
    const meshes = [];
    for (const { mat, geos, cast, receive } of this.map.values()) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) { console.warn('merge failed for', mat.name); continue; }
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      m.name = name + ':' + (mat.name || 'mat');
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      meshes.push(m);
    }
    this.map.clear();
    return meshes;
  }
}

function toIndexed(geo) {
  const n = geo.attributes.position.count;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  geo.setIndex(idx);
  return geo;
}
