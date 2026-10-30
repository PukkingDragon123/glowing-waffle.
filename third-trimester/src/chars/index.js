// Character factory. Every spawned character exposes the same surface:
//   c.root (Object3D), c.anim (setPose, walking, lookAt, reach, expression, talk, once), c.update(dt), c.kind
// Humans + Gary are rigged GLB bodies (glbhuman.js); the cat, the suited cat and the baby are SDF sculpts.
import * as THREE from 'three';
import { loadHumanTemplate, GlbHuman } from './glbhuman.js';
import { buildTemplate, instantiate, templates } from './character.js';
import { CAT_BUILDERS } from './cat.js';
import { babySpecs } from './alien.js';
import { boneDefs } from './human.js';
import { HumanAnimator } from './animator.js';
import { makeAlienEyes } from './alien.js';
import { cap, sph, ell, box, quatE, rgb, meshSpec, toGeometry } from '../gfx/sdf.js';

const HUMANS = new Set(['sunny', 'soldier', 'general', 'gary']);
const props = {};   // rigid accessory geometries, built once

// ---- rigid SDF accessories in GLB rest model space (head bone ~ y 1.60, eyes y 1.6985 z 0.07)
function rigidSpec(prims, mats, bounds, cell = 0.004) { return { prims, paints: [], mats, bounds, cell, smooth: 1, sigma: 0.01 }; }
const ACC_SPECS = {
  helmet: () => rigidSpec([
    ell([0, 1.748, -0.012], [0.114, 0.108, 0.128], { mat: 0, clip: [{ n: [0, -1, 0], d: -1.712 }], noise: [0.0015, 60] }),
    cap([-0.115, 1.712, -0.01], [0.115, 1.712, -0.01], 0.012, 0.012, { mat: 0, k: 0.02, clip: [{ n: [0, 0, 1], d: 0.06 }] }),
    box([0, 1.775, 0.085], [0.03, 0.018, 0.02], 0.006, { mat: 1, k: 0.006 }),                     // NVG mount
    ell([0, 1.655, 0.062], [0.079, 0.072, 0.068], { mat: 0, k: 0.02, noise: [0.001, 80] }),        // mask
    cap([0, 1.618, 0.115], [0, 1.6, 0.152], 0.03, 0.033, { mat: 0, k: 0.012 }),                    // filter
    cap([0, 1.598, 0.155], [0, 1.596, 0.162], 0.035, 0.035, { mat: 1, k: 0.003 }),
    cap([0.034, 1.699, 0.098], [0.036, 1.7, 0.116], 0.024, 0.025, { mat: 1, k: 0.004 }),
    cap([-0.034, 1.699, 0.098], [-0.036, 1.7, 0.116], 0.024, 0.025, { mat: 1, k: 0.004 }),
    cap([0.08, 1.67, 0.0], [-0.08, 1.67, 0.0], 0.008, 0.008, { mat: 0, k: 0.01, clip: [{ n: [0, 0, 1], d: 0.03 }] }), // strap
  ], [{ c: rgb(0x1b1e21), c2: rgb(0x262a2e), vn: 30, rough: 0.6 }, { c: rgb(0x55585c), rough: 0.35, metal: 0.8 }], { min: [-0.16, 1.55, -0.16], max: [0.16, 1.87, 0.19] }),
  cap: () => rigidSpec([
    cap([0, 1.79, -0.012], [0, 1.835, -0.02], 0.104, 0.118, { mat: 0, k: 0.01 }),
    ell([0, 1.84, -0.02], [0.12, 0.016, 0.124], { mat: 0, k: 0.01 }),
    ell([0, 1.79, 0.095], [0.088, 0.008, 0.055], { mat: 1, k: 0.004, q: quatE(0.25, 0, 0) }),
    tor([0, 1.795, -0.012], 0.106, 0.008, { mat: 2, k: 0.002 }),
    sph([0, 1.82, 0.102], 0.016, { mat: 2, k: 0.003 }),
  ], [{ c: rgb(0x4b5437), rough: 0.7 }, { c: rgb(0x111111), rough: 0.25 }, { c: rgb(0xd8b04a), rough: 0.3, metal: 0.9 }], { min: [-0.16, 1.74, -0.16], max: [0.16, 1.88, 0.17] }),
  alienHead: () => rigidSpec([
    cap([0, 1.56, -0.02], [0, 1.66, -0.01], 0.036, 0.034, { mat: 0, k: 0.03 }),
    ell([0, 1.79, -0.035], [0.118, 0.138, 0.138], { mat: 0, k: 0 }),
    ell([0, 1.69, 0.03], [0.076, 0.098, 0.078], { mat: 0, k: 0.07 }),
    ell([0, 1.615, 0.058], [0.022, 0.022, 0.02], { mat: 0, k: 0.045 }),
    ell([0.047, 1.722, 0.088], [0.037, 0.022, 0.018], { mat: 0, k: 0.012, op: 's', q: quatE(0, 0.35, 0.42) }),
    ell([-0.047, 1.722, 0.088], [0.037, 0.022, 0.018], { mat: 0, k: 0.012, op: 's', q: quatE(0, -0.35, -0.42) }),
    sph([0.007, 1.665, 0.104], 0.0032, { mat: 1, k: 0.002, op: 's' }), sph([-0.007, 1.665, 0.104], 0.0032, { mat: 1, k: 0.002, op: 's' }),
    cap([-0.016, 1.636, 0.084], [0, 1.632, 0.087], 0.0014, 0.0014, { mat: 1, k: 0.002, op: 's' }), cap([0, 1.632, 0.087], [0.016, 1.636, 0.084], 0.0014, 0.0014, { mat: 1, k: 0.002, op: 's' }),
  ], [{ c: rgb(0x8d88a3), c2: rgb(0x7c7593), vn: 40, rough: 0.5, sss: 0.6, spots: [55, 0.74, rgb(0x6a4d8c)] }, { c: rgb(0x2a1420), rough: 0.5 }], { min: [-0.15, 1.52, -0.2], max: [0.15, 1.95, 0.16] }, 0.0042),
};
function tor(a, R, r, o = {}) { return { t: 'tor', a, s: [R, r], ...o }; }

async function buildAccessories() {
  const keys = Object.keys(ACC_SPECS);
  const res = await Promise.all(keys.map((k) => meshSpec(ACC_SPECS[k]())));
  keys.forEach((k, i) => { props[k] = toGeometry(res[i], { skinned: false }); });
}
function rigidMesh(key, { rough } = {}) {
  const m = new THREE.Mesh(props[key], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough ?? 0.6, envMapIntensity: 0.7 }));
  m.castShadow = true;
  const o = new THREE.Mesh(props[key], inkHull(0.004)); o.layers.set(2);
  const g = new THREE.Group(); g.add(m, o); return g;
}
export function inkHull(th = 0.004) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0809, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${th.toFixed(4)};`); };
  return m;
}

const built = new Set();
// Build a subset ('bodies' 'accessories' 'tofu' 'tofusuit' 'baby'); skips what is already built.
export async function buildCharacters(onProgress = () => {}, only = null) {
  const steps = [
    ['bodies', () => loadHumanTemplate()],
    ['accessories', () => buildAccessories()],
    ['tofu', () => CAT_BUILDERS.tofu()],
    ['tofusuit', () => CAT_BUILDERS.tofusuit()],
    ['baby', () => { const { J, specs } = babySpecs(); return buildTemplate('baby', { specs, boneDefs: boneDefs(J), material: { sssColor: 0x9d6bff, rim: 1.6 }, extra: { build(c) {
      const H = J.head; c.extras.eyes = [];
      c.extras.alienEyes = makeAlienEyes(c.byName.head, [[0.043, H[1] + 0.094, H[2] + 0.07], [-0.043, H[1] + 0.094, H[2] + 0.07]], [0.03, 0.022, 0.016], 0.25);
      c.extras.animator = new HumanAnimator(c, { joints: J });
    } } }); }],
  ];
  const todo = steps.filter(([n]) => (!only || only.includes(n)) && !built.has(n));
  let n = 0;
  await Promise.all(todo.map(async ([name, fn]) => { built.add(name); await fn(); onProgress(++n / todo.length, name); }));
}

// SDF characters get the same interface as GlbHuman.
class SdfChar {
  constructor(kind) {
    const c = this.c = instantiate(kind);
    this.kind = kind; this.root = c.root; this.anim = c.extras.animator; this.extras = c.extras; this.byName = c.byName;
    for (const m of Object.values(c.meshes)) { const o = new THREE.SkinnedMesh(m.geometry, skinnedHull(kind === 'baby' ? 0.0022 : 0.0028)); o.bind(c.skeleton, new THREE.Matrix4()); o.frustumCulled = false; o.layers.set(2); c.root.add(o); }
  }
  get material() { return this.c.material; }
  set glow(v) { (this.c.material.userData.glow ??= { value: 0 }).value = v; }
  bonePos(name, out = new THREE.Vector3()) { return this.c.byName[name].getWorldPosition(out); }
  attach(boneName, obj) { const b = this.c.byName[boneName]; obj.position.sub(b.userData.rest); b.add(obj); return obj; }
  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; }
  update(dt) { this.anim.update(dt); }
}
function skinnedHull(th) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0809, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${th.toFixed(4)};`); };
  return m;
}

export function spawn(kind, look = {}) {
  if (!HUMANS.has(kind)) return new SdfChar(kind);
  const h = new GlbHuman(kind, look);
  if (h.look.helmet) { h.extras.helmet = h.attach('Head', rigidMesh('helmet')); }
  if (h.look.cap) { h.extras.cap = h.attach('Head', rigidMesh('cap')); }
  if (h.look.alien) {
    const head = h.attach('Head', rigidMesh('alienHead'));
    h.extras.alienHead = head;
    // big glossy eyes, authored in rest model space then attached
    const eyeGeo = new THREE.SphereGeometry(1, 32, 16); eyeGeo.rotateX(Math.PI / 2);
    const eyes = [1, -1].map((s) => {
      const e = new THREE.Mesh(eyeGeo, alienEyeMaterial()); e.scale.set(0.035, 0.0195, 0.016);
      e.position.set(s * 0.047, 1.722, 0.084); e.rotation.set(0, s * 0.35, s * 0.42); e.updateMatrix();
      return h.attach('Head', e);
    });
    h.extras.alienEyes = eyes;
  }
  return h;
}
let _aem = null;
function alienEyeMaterial() {
  if (_aem) return _aem;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#020204'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${120 + Math.random() * 100},${80 + Math.random() * 60},255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 128, Math.random() * 28, 1, 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  _aem = new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, emissive: 0x2a1450, emissiveMap: t, emissiveIntensity: 0.4 });
  return _aem;
}
export { templates };
