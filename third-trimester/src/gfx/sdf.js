// Main-thread side of the SDF mesher: a small worker pool + helpers to author specs.
import * as THREE from 'three';
import { MESHER } from './sdfcore.js';

let pool = null, rr = 0, jobId = 0;
const pending = new Map();
let local = null;

function makePool() {
  const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
  const src = `const MESHER = ${MESHER.toString()};\nconst M = MESHER();\nonmessage = (e) => { const { id, spec } = e.data; try { const r = M.buildMesh(spec); postMessage({ id, r }, [r.position.buffer, r.normal.buffer, r.color.buffer, r.surf.buffer, r.skinIndex.buffer, r.skinWeight.buffer, r.index.buffer]); } catch (err) { postMessage({ id, error: String(err && err.stack || err) }); } };`;
  try {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    pool = Array.from({ length: n }, () => {
      const w = new Worker(url);
      w.onmessage = (e) => { const p = pending.get(e.data.id); pending.delete(e.data.id); if (!p) return; e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.r); };
      return w;
    });
  } catch (e) { console.warn('SDF workers unavailable, meshing on main thread', e); pool = []; }
}

export function meshSpec(spec) {
  if (!pool) makePool();
  if (!pool.length) { local ??= MESHER(); return Promise.resolve(local.buildMesh(spec)); }
  const id = ++jobId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); pool[rr++ % pool.length].postMessage({ id, spec }); });
}

export function toGeometry(r, { skinned = true } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(r.color, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(r.surf, 3));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(r.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(r.skinWeight, 4));
  }
  g.setIndex(new THREE.BufferAttribute(r.index, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ---- authoring helpers ----
export const V = (x, y, z) => [x, y, z];
export const cap = (a, b, ra, rb = ra, o = {}) => ({ t: 'cap', a, b, r: [ra, rb], ...o });
export const sph = (a, r, o = {}) => ({ t: 'sph', a, r: [r, r], ...o });
export const ell = (a, s, o = {}) => ({ t: 'ell', a, s, ...o });
export const box = (a, s, round = 0, o = {}) => ({ t: 'box', a, s, round, ...o });
export const tor = (a, R, r, o = {}) => ({ t: 'tor', a, s: [R, r], ...o });
export const quatE = (x, y, z) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); return [q.x, q.y, q.z, q.w]; };
// mirror a primitive across x=0, remapping bones/materials through the given maps
export function mirror(p, boneMap = {}) {
  const m = structuredClone(p);
  if (m.a) m.a = [-m.a[0], m.a[1], m.a[2]];
  if (m.b) m.b = [-m.b[0], m.b[1], m.b[2]];
  if (m.q) m.q = [m.q[0], -m.q[1], -m.q[2], m.q[3]];
  if (m.bone != null && boneMap[m.bone] != null) m.bone = boneMap[m.bone];
  if (m.bone2 != null && boneMap[m.bone2] != null) m.bone2 = boneMap[m.bone2];
  if (m.clip) m.clip = m.clip.map((c) => ({ n: [-c.n[0], c.n[1], c.n[2]], d: c.d }));
  return m;
}
export const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
