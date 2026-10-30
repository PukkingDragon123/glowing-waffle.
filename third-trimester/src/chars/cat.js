// Mr. Tofu: chubby orange tabby, SDF-sculpted with a quadruped rig and procedural gaits.
// 'tofusuit' is the same cat in a navy suit, red tie and tiny sunglasses (he stands up).
import * as THREE from 'three';
import { cap, sph, ell, box, quatE, mirror, rgb } from '../gfx/sdf.js';
import { buildTemplate } from './character.js';
import { eyeTexture } from './human.js';
import { clamp, damp, lerp, noise1 } from '../core/util.js';

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const S = Math.sin, C = Math.cos;

export const CAT_J = {
  hips: [0, 0.22, -0.14], spine1: [0, 0.235, -0.06], spine2: [0, 0.24, 0.02], chest: [0, 0.235, 0.09], neck: [0, 0.255, 0.15], head: [0, 0.3, 0.19], jaw: [0, 0.276, 0.22],
  'ear.L': [0.035, 0.345, 0.185], tail1: [0, 0.24, -0.2], tail2: [0, 0.255, -0.255], tail3: [0, 0.28, -0.3], tail4: [0, 0.31, -0.335], tail5: [0, 0.345, -0.36], tail6: [0, 0.385, -0.37],
  'shoulder.L': [0.05, 0.2, 0.1], 'elbow.L': [0.056, 0.12, 0.085], 'wrist.L': [0.056, 0.045, 0.1], 'fpaw.L': [0.056, 0.016, 0.118],
  'thigh.L': [0.056, 0.2, -0.15], 'knee.L': [0.062, 0.12, -0.1], 'hock.L': [0.062, 0.058, -0.17], 'bpaw.L': [0.062, 0.016, -0.145],
};
for (const k of Object.keys(CAT_J)) if (k.endsWith('.L')) CAT_J[k.replace('.L', '.R')] = [-CAT_J[k][0], CAT_J[k][1], CAT_J[k][2]];
const PARENT = { hips: null, spine1: 'hips', spine2: 'spine1', chest: 'spine2', neck: 'chest', head: 'neck', jaw: 'head', 'ear.L': 'head', 'ear.R': 'head',
  tail1: 'hips', tail2: 'tail1', tail3: 'tail2', tail4: 'tail3', tail5: 'tail4', tail6: 'tail5',
  'shoulder.L': 'chest', 'elbow.L': 'shoulder.L', 'wrist.L': 'elbow.L', 'fpaw.L': 'wrist.L', 'thigh.L': 'hips', 'knee.L': 'thigh.L', 'hock.L': 'knee.L', 'bpaw.L': 'hock.L' };
for (const k of Object.keys(PARENT)) if (k.endsWith('.L')) PARENT[k.replace('.L', '.R')] = PARENT[k].endsWith('.L') ? PARENT[k].replace('.L', '.R') : PARENT[k];
export const CAT_BONES = Object.keys(CAT_J);
const CB = Object.fromEntries(CAT_BONES.map((n, i) => [n, i]));
const MB = Object.fromEntries(CAT_BONES.filter((n) => n.endsWith('.L')).map((n) => [CB[n], CB[n.replace('.L', '.R')]]));

function catSpec({ suit = false } = {}) {
  const J = CAT_J, b = CB, P = [], fur = [0.0045, 85];
  const mats = [
    { c: rgb(0xd47a26), c2: rgb(0xe9a252), vn: 14, rough: 0.85, sss: 0.4, stripes: [72, 2, 0.75, rgb(0x9a4a14)] }, // 0 orange fur
    { c: rgb(0xf3ece0), c2: rgb(0xe3d8c6), vn: 30, rough: 0.9, sss: 0.3 },                                      // 1 white fur
    { c: rgb(0xe08a8c), rough: 0.45, sss: 1 },                                                                 // 2 pink (nose, ears)
    { c: rgb(0x231419), rough: 0.5 },                                                                          // 3 dark (mouth)
    { c: rgb(0x1c2740), c2: rgb(0x243150), vn: 30, rough: 0.6, stripes: [300, 1, 0.12, rgb(0x2f3c5e)] },      // 4 navy suit (pinstripe)
    { c: rgb(0xf2f1ec), rough: 0.5 },                                                                          // 5 shirt
    { c: rgb(0xb3161c), rough: 0.4 },                                                                          // 6 tie
  ];
  const body = [], legs = [];
  body.push(ell(add(J.hips, [0, -0.005, 0.02]), [0.088, 0.085, 0.085], { bone: b.hips, mat: 0, k: 0, noise: fur }));
  body.push(ell(add(J.spine1, [0, -0.01, 0]), [0.1, 0.09, 0.09], { bone: b.spine1, mat: 0, k: 0.06, noise: fur }));
  body.push(ell(add(J.spine2, [0, -0.06, -0.03]), [0.085, 0.06, 0.1], { bone: b.spine2, mat: 1, k: 0.06, noise: fur })); // saggy belly
  body.push(ell(add(J.chest, [0, -0.01, -0.02]), [0.082, 0.085, 0.08], { bone: b.chest, mat: 0, k: 0.06, noise: fur }));
  body.push(cap(J.chest, add(J.head, [0, -0.02, -0.01]), 0.06, 0.052, { bone: b.neck, mat: 0, k: 0.04, noise: fur }));
  // head
  const h = (dx, dy, dz) => add(J.head, [dx, dy, dz]);
  body.push(ell(h(0, 0.005, 0.01), [0.068, 0.058, 0.06], { bone: b.head, mat: 0, k: 0.03, noise: [0.003, 90] }));
  for (const s of [1, -1]) {
    body.push(ell(h(s * 0.036, -0.016, 0.035), [0.036, 0.03, 0.032], { bone: b.head, mat: 0, k: 0.025, noise: [0.003, 90] })); // cheek fluff
    body.push(sph(h(s * 0.03, 0.012, 0.055), 0.017, { bone: b.head, mat: 0, k: 0.008, op: 's', w: 0 }));                 // eye socket
    const S2 = s > 0 ? 'L' : 'R';
    body.push(cap(h(s * 0.036, 0.04, -0.002), h(s * 0.052, 0.098, -0.006), 0.024, 0.003, { bone: b['ear.' + S2], mat: 0, k: 0.012 }));
    body.push(cap(h(s * 0.037, 0.05, 0.012), h(s * 0.05, 0.092, 0.006), 0.014, 0.002, { bone: b['ear.' + S2], mat: 2, k: 0.004, op: 's', w: 0 }));
  }
  body.push(ell(h(0, -0.022, 0.06), [0.03, 0.02, 0.022], { bone: b.head, mat: 1, k: 0.02 }));  // muzzle
  body.push(ell(h(0, -0.04, 0.05), [0.02, 0.012, 0.018], { bone: b.jaw, mat: 1, k: 0.015 }));  // chin
  body.push(sph(h(0, -0.009, 0.08), 0.008, { bone: b.head, mat: 2, k: 0.006 }));                // nose
  body.push(cap(h(-0.012, -0.032, 0.077), h(0.012, -0.032, 0.077), 0.0018, 0.0018, { bone: b.jaw, mat: 3, k: 0.002, op: 's', w: 0 }));
  // legs
  const L = (n) => n + '.L';
  legs.push(cap(J[L('shoulder')], J[L('elbow')], 0.034, 0.024, { bone: b[L('shoulder')], mat: 0, k: 0.03, noise: fur }));
  legs.push(cap(J[L('elbow')], J[L('wrist')], 0.022, 0.017, { bone: b[L('elbow')], mat: 0, k: 0.012, noise: [0.003, 90] }));
  legs.push(ell(add(J[L('fpaw')], [0, -0.002, 0.004]), [0.022, 0.014, 0.028], { bone: b[L('fpaw')], mat: 1, k: 0.012, noise: [0.002, 120] }));
  legs.push(cap(J[L('wrist')], J[L('fpaw')], 0.017, 0.018, { bone: b[L('wrist')], mat: 1, k: 0.01 }));
  legs.push(ell(add(J[L('thigh')], [0, -0.03, 0.02]), [0.042, 0.065, 0.062], { bone: b[L('thigh')], mat: 0, k: 0.04, noise: fur }));
  legs.push(cap(J[L('knee')], J[L('hock')], 0.026, 0.017, { bone: b[L('knee')], mat: 0, k: 0.015, noise: [0.003, 90] }));
  legs.push(cap(J[L('hock')], J[L('bpaw')], 0.016, 0.017, { bone: b[L('hock')], mat: 1, k: 0.01 }));
  legs.push(ell(add(J[L('bpaw')], [0, -0.002, 0.012]), [0.022, 0.014, 0.032], { bone: b[L('bpaw')], mat: 1, k: 0.012, noise: [0.002, 120] }));
  if (suit) {
    legs.push(cap(add(J[L('shoulder')], [0, 0.02, 0]), add(J[L('wrist')], [0, 0.02, 0]), 0.04, 0.026, { bone: b[L('shoulder')], bone2: b[L('elbow')], mat: 4, k: 0.01 }));
    legs.push(cap(add(J[L('wrist')], [0, 0.025, 0]), add(J[L('wrist')], [0, 0.012, 0]), 0.028, 0.028, { bone: b[L('wrist')], mat: 5, k: 0.004 }));
    legs.push(cap(add(J[L('thigh')], [0, 0.0, 0.02]), add(J[L('hock')], [0, 0.0, 0]), 0.055, 0.03, { bone: b[L('thigh')], bone2: b[L('knee')], mat: 4, k: 0.02 }));
  }
  P.push(...body, ...legs, ...legs.map((p) => mirror(p, MB)));
  // tail
  const tails = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
  for (let i = 0; i < tails.length - 1; i++) {
    const r0 = 0.024 - i * 0.002, r1 = 0.022 - i * 0.002;
    P.push(cap(J[tails[i]], J[tails[i + 1]], r0, r1, { bone: b[tails[i]], bone2: b[tails[i + 1]], mat: i === tails.length - 2 ? 1 : 0, k: 0.012, noise: fur }));
  }
  P.push(cap(J.hips, J.tail1, 0.03, 0.025, { bone: b.hips, bone2: b.tail1, mat: 0, k: 0.03 }));
  if (suit) {
    P.push(ell(add(J.spine1, [0, 0.0, 0.0]), [0.112, 0.104, 0.1], { bone: b.spine1, mat: 4, k: 0.03 }));
    P.push(ell(add(J.spine2, [0, -0.015, 0.0]), [0.105, 0.1, 0.1], { bone: b.spine2, mat: 4, k: 0.04 }));
    P.push(ell(add(J.chest, [0, 0.0, -0.01]), [0.098, 0.1, 0.09], { bone: b.chest, mat: 4, k: 0.04 }));
    P.push(ell(add(J.hips, [0, 0.0, 0.02]), [0.1, 0.098, 0.09], { bone: b.hips, mat: 4, k: 0.03 }));
    P.push(cap(add(J.neck, [-0.04, -0.01, 0.0]), add(J.neck, [0.04, -0.01, 0.0]), 0.03, 0.03, { bone: b.neck, mat: 5, k: 0.02 })); // collar
  }
  const paints = [
    ell(add(J.chest, [0, -0.07, 0.05]), [0.05, 0.06, 0.07], { mat: 1, soft: 0.02 }),   // white bib
    ell(h(0, -0.025, 0.05), [0.04, 0.025, 0.04], { mat: 1, soft: 0.012 }),
  ];
  if (suit) {
    // shirt front + tie along the underside of the chest (it becomes the front when he stands up)
    paints.push(ell(add(J.chest, [0, -0.085, 0.0]), [0.045, 0.03, 0.12], { mat: 5, soft: 0.006 }));
    paints.push(cap(add(J.chest, [0, -0.1, 0.07]), add(J.spine2, [0, -0.115, 0.0]), 0.012, 0.02, { mat: 6, soft: 0.003 }));
    paints.push(sph(add(J.chest, [0, -0.096, 0.075]), 0.016, { mat: 6, soft: 0.003 }));
  }
  return { prims: P, paints, mats, bounds: { min: [-0.16, -0.01, -0.42], max: [0.16, 0.46, 0.3] }, cell: 0.0042, sigma: 0.01, smooth: 1, defaultBone: b.spine1 };
}

function addWhiskers(c) {
  const head = c.byName.head, rest = head.userData.rest;
  const pts = [];
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const o = new THREE.Vector3(s * 0.018, -0.02 - i * 0.004 + 0.002, 0.07);
    pts.push(o.clone(), o.clone().add(new THREE.Vector3(s * 0.085, 0.012 - i * 0.012, -0.02)));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => p.add(new THREE.Vector3(...CAT_J.head)).sub(rest)));
  const w = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf5f0e6, transparent: true, opacity: 0.8 }));
  head.add(w); return w;
}
function addCatEyes(c) {
  const head = c.byName.head, rest = head.userData.rest;
  const tex = eyeTexture('#c9b52a', { slit: true, irisR: 0.62, pupil: 0.1, sclera: '#b39a1e' });
  const geo = new THREE.SphereGeometry(0.0165, 32, 16); geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x2a2208, emissiveMap: tex, emissiveIntensity: 0.6 });
  return [1, -1].map((s) => {
    const e = new THREE.Mesh(geo, mat);
    e.position.set(CAT_J.head[0] + s * 0.03 - rest.x, CAT_J.head[1] + 0.013 - rest.y, CAT_J.head[2] + 0.05 - rest.z);
    e.rotation.y = s * 0.2; e.scale.set(1, 1, 0.8);
    head.add(e); return e;
  });
}
function addSuitProps(c) {
  const head = c.byName.head, rest = head.userData.rest;
  const shades = new THREE.Group();
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 });
  for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.004, 24), lensMat); l.rotation.x = Math.PI / 2; l.position.set(s * 0.031, 0, 0); shades.add(l); }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 }));
  shades.add(bridge);
  shades.position.set(CAT_J.head[0] - rest.x, CAT_J.head[1] + 0.014 - rest.y, CAT_J.head[2] + 0.072 - rest.z);
  head.add(shades);
  // briefcase (held by the right front paw when standing)
  const bc = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.085, 0.03), leather); bc.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16, Math.PI), leather); handle.position.y = 0.043; bc.add(handle);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.034), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.25 })); clasp.position.y = 0.03; bc.add(clasp);
  bc.visible = false;
  const paw = c.byName['fpaw.R']; const pr = paw.userData.rest; bc.position.set(0 - 0, -0.05, 0); paw.add(bc);
  c.extras.shades = shades; c.extras.briefcase = bc;
}

// ---------------- animation ----------------
export const CAT_POSES = {
  stand: (t) => ({ spine1: [0.01 * S(t * 1.6), 0, 0], neck: [0, 0.05 * S(t * 0.4), 0], tail1: [-0.25, 0.15 * S(t * 0.9), 0], tail2: [-0.25, 0.2 * S(t * 0.9 - 0.6), 0], tail3: [-0.15, 0.25 * S(t * 0.9 - 1.2), 0], tail4: [0.1, 0.25 * S(t * 0.9 - 1.8), 0], tail5: [0.25, 0.2 * S(t * 0.9 - 2.4), 0] }),
  sit: (t) => ({ hips: [0.75, 0, 0], _hip: [0, -0.07, 0.04], spine1: [-0.15, 0, 0], spine2: [-0.15, 0, 0], chest: [-0.2, 0, 0], neck: [-0.15, 0.06 * S(t * 0.3), 0], head: [-0.2, 0, 0],
    'thigh.L': [-1.45, 0, -0.1], 'thigh.R': [-1.45, 0, 0.1], 'knee.L': [2.0, 0, 0], 'knee.R': [2.0, 0, 0], 'hock.L': [-1.2, 0, 0], 'hock.R': [-1.2, 0, 0],
    'shoulder.L': [0.45, 0, 0], 'shoulder.R': [0.45, 0, 0], 'elbow.L': [-0.25, 0, 0], 'elbow.R': [-0.25, 0, 0], 'wrist.L': [0.55, 0, 0], 'wrist.R': [0.55, 0, 0],
    tail1: [1.0, 0.5, 0], tail2: [0.3, 0.5, 0], tail3: [0.2, 0.6 + 0.1 * S(t), 0], tail4: [0.1, 0.5, 0], tail5: [0, 0.3 * S(t * 0.7), 0] }),
  loaf: (t) => ({ _hip: [0, -0.12, 0], 'shoulder.L': [-0.9, 0, 0], 'shoulder.R': [-0.9, 0, 0], 'elbow.L': [2.4, 0, 0], 'elbow.R': [2.4, 0, 0], 'wrist.L': [-1.4, 0, 0], 'wrist.R': [-1.4, 0, 0],
    'thigh.L': [-1.1, 0, 0], 'thigh.R': [-1.1, 0, 0], 'knee.L': [2.4, 0, 0], 'knee.R': [2.4, 0, 0], 'hock.L': [-1.1, 0, 0], 'hock.R': [-1.1, 0, 0], neck: [-0.1, 0, 0], head: [0.1, 0, 0],
    tail1: [1.2, 0.8, 0], tail2: [0.2, 0.6, 0], tail3: [0, 0.6, 0], tail4: [0, 0.5, 0] }),
  hiss: (t) => ({ spine1: [-0.35, 0, 0], spine2: [-0.25, 0, 0], chest: [0.2, 0, 0], neck: [0.25, 0, 0], head: [-0.1, 0, 0], jaw: [0.45, 0, 0], 'ear.L': [0.9, 0, -0.6], 'ear.R': [0.9, 0, 0.6], _hip: [0, 0.03, 0],
    tail1: [-1.2, 0, 0], tail2: [-0.3, 0, 0], tail3: [0.1, 0, 0] }),
  // standing on hind legs (the suit). Hips pitch the whole body upright.
  biped: (t) => ({ hips: [-1.42, 0, 0], _hip: [0, 0.075, -0.02], spine1: [-0.05, 0, 0], spine2: [-0.02, 0.03 * S(t * 0.5), 0], chest: [0.02, 0, 0], neck: [1.0, 0, 0], head: [0.42, 0.05 * S(t * 0.3), 0],
    'thigh.L': [1.2, 0, -0.08], 'thigh.R': [1.2, 0, 0.08], 'knee.L': [0.45, 0, 0], 'knee.R': [0.45, 0, 0], 'hock.L': [-0.25, 0, 0], 'hock.R': [-0.25, 0, 0], 'bpaw.L': [-0.2, 0, 0], 'bpaw.R': [-0.2, 0, 0],
    'shoulder.L': [1.15, 0, -0.18], 'shoulder.R': [1.15, 0, 0.18], 'elbow.L': [-0.5, 0, 0], 'elbow.R': [-0.5, 0, 0], 'wrist.L': [0.1, 0, 0], 'wrist.R': [0.1, 0, 0],
    tail1: [0.9, 0.2 * S(t * 0.8), 0], tail2: [0.3, 0.3 * S(t * 0.8 - 0.6), 0], tail3: [0.1, 0.35 * S(t * 0.8 - 1.2), 0], tail4: [0, 0.3 * S(t * 0.8 - 1.8), 0], tail5: [-0.3, 0.2 * S(t * 0.8 - 2.4), 0] }),
  bipedPoint: (t) => ({ ...CAT_POSES.biped(t), 'shoulder.R': [-0.3, 0, 0.35], 'elbow.R': [-0.1, 0, 0] }),
  bipedSnap: (t) => ({ ...CAT_POSES.biped(t), 'shoulder.R': [0.0, 0, 0.6], 'elbow.R': [-1.4, 0, 0], 'wrist.R': [0.4, 0, 0] }),
  bipedTie: (t) => ({ ...CAT_POSES.biped(t), 'shoulder.L': [-0.1, 0, -0.5], 'elbow.L': [-1.6, 0.5, 0], 'shoulder.R': [-0.1, 0, 0.5], 'elbow.R': [-1.6, -0.5, 0], head: [0.5, 0, 0.1 * S(t * 4)] }),
  limp: (t) => ({ spine1: [0.3, 0, 0.2], spine2: [0.3, 0, 0.1], neck: [0.6, 0, 0.3], head: [0.3, 0, 0], 'shoulder.L': [0.4, 0, -0.4], 'shoulder.R': [0.4, 0, 0.4], 'thigh.L': [0.3, 0, -0.3], 'thigh.R': [0.3, 0, 0.3], tail1: [1.2, 0, 0], tail2: [0.4, 0, 0] }),
};

export class CatAnimator {
  constructor(c) {
    this.c = c; this.rig = c.rig; this.time = Math.random() * 10;
    this.base = 'stand'; this.prev = null; this.blendT = 1; this.blendDur = 0.3;
    this.gait = 0; this.gaitTarget = 0; this.phase = 0; this.mode = 'walk'; // walk | gallop | scramble
    this.fear = 0; this.fearT = 0; this.puff = 0; this.look = null; this.blink = 0; this.blinkT = 3;
    this.custom = null; this.speedMul = 1;
  }
  setPose(name, blend = 0.35) { if (name === this.base) return; this.prev = this.base; this.base = name; this.blendT = 0; this.blendDur = blend; }
  move(speed, mode = 'walk') { this.gaitTarget = speed; this.mode = mode; }
  scared(v) { this.fearT = v; }
  lookAt(t) { this.look = t; }
  update(dt) {
    const rig = this.rig; this.time += dt * this.speedMul; const t = this.time;
    rig.begin();
    this.blendT = Math.min(1, this.blendT + dt / Math.max(0.01, this.blendDur));
    this.gait = damp(this.gait, this.gaitTarget, 6, dt);
    this.fear = damp(this.fear, this.fearT, 4, dt);
    const g = clamp(this.gait > 0.02 ? 1 : this.gait * 50);
    const k = this.blendT;
    if (this.prev && k < 1) rig.pose(CAT_POSES[this.prev](t), (1 - k) * (1 - g));
    rig.pose(CAT_POSES[this.base](t), k * (1 - g));
    if (g > 0.001) {
      const mode = this.mode;
      if (mode === 'walk') {
        this.phase += dt * this.gait * 7.5; const p = this.phase;
        rig.pose({
          'shoulder.L': [-0.45 * S(p), 0, 0], 'shoulder.R': [-0.45 * S(p + Math.PI), 0, 0], 'elbow.L': [0.5 * Math.max(0, C(p)), 0, 0], 'elbow.R': [0.5 * Math.max(0, -C(p)), 0, 0],
          'wrist.L': [-0.3 * Math.max(0, C(p)), 0, 0], 'wrist.R': [-0.3 * Math.max(0, -C(p)), 0, 0],
          'thigh.L': [0.45 * S(p + Math.PI * 0.5), 0, 0], 'thigh.R': [0.45 * S(p + Math.PI * 1.5), 0, 0], 'knee.L': [-0.4 * Math.max(0, C(p + 0.5 * Math.PI)), 0, 0], 'knee.R': [-0.4 * Math.max(0, C(p + 1.5 * Math.PI)), 0, 0],
          'hock.L': [0.4 * Math.max(0, C(p + 0.5 * Math.PI)), 0, 0], 'hock.R': [0.4 * Math.max(0, C(p + 1.5 * Math.PI)), 0, 0],
          spine1: [0, 0.06 * S(p), 0.03 * S(p)], chest: [0, -0.06 * S(p), 0], neck: [0.05, 0, 0], _hip: [0, 0.006 * S(2 * p), 0],
          tail1: [-0.6, 0.15 * S(p * 0.5), 0], tail2: [-0.3, 0.15 * S(p * 0.5 - 0.7), 0], tail3: [0.2, 0.2 * S(p * 0.5 - 1.4), 0], tail4: [0.3, 0.2 * S(p * 0.5 - 2.1), 0], tail5: [0.4, 0, 0],
        }, g);
      } else if (mode === 'gallop') {
        this.phase += dt * (8 + this.gait * 7); const p = this.phase;
        const fl = (o) => S(p + o);
        rig.pose({
          spine1: [0.32 * fl(0), 0, 0], spine2: [0.28 * fl(-0.3), 0, 0], chest: [-0.18 * fl(-0.4), 0, 0], hips: [-0.22 * fl(0.2), 0, 0], neck: [0.18 * fl(-0.6) - 0.15, 0, 0], head: [-0.12 * fl(-0.6) + 0.15, 0, 0],
          'shoulder.L': [-1.0 * fl(0.0), 0, 0], 'shoulder.R': [-1.0 * fl(0.35), 0, 0], 'elbow.L': [0.9 * Math.max(0, fl(1.4)), 0, 0], 'elbow.R': [0.9 * Math.max(0, fl(1.75)), 0, 0],
          'wrist.L': [-0.7 * Math.max(0, fl(1.0)), 0, 0], 'wrist.R': [-0.7 * Math.max(0, fl(1.35)), 0, 0],
          'thigh.L': [-1.0 * fl(Math.PI + 0.2), 0, 0], 'thigh.R': [-1.0 * fl(Math.PI + 0.5), 0, 0], 'knee.L': [-0.9 * Math.max(0, fl(Math.PI + 1.6)), 0, 0], 'knee.R': [-0.9 * Math.max(0, fl(Math.PI + 1.9)), 0, 0],
          'hock.L': [1.0 * Math.max(0, fl(Math.PI + 1.4)), 0, 0], 'hock.R': [1.0 * Math.max(0, fl(Math.PI + 1.7)), 0, 0],
          _hip: [0, 0.035 * S(2 * p - 0.4) + 0.01, 0.015 * fl(0)],
          tail1: [-1.1 + 0.15 * fl(-1), 0.1 * S(p * 0.5), 0], tail2: [0.15 * fl(-1.5), 0, 0], tail3: [0.25 * fl(-2), 0, 0], tail4: [0.25 * fl(-2.5), 0, 0], tail5: [0.2 * fl(-3), 0, 0],
          'ear.L': [0.4, 0, -0.4], 'ear.R': [0.4, 0, 0.4],
        }, g);
      } else if (mode === 'scramble') { // cartoon: legs windmill, body barely moves
        this.phase += dt * 30; const p = this.phase;
        rig.pose({
          'shoulder.L': [p % (Math.PI * 2), 0, 0], 'shoulder.R': [(p + Math.PI) % (Math.PI * 2), 0, 0], 'thigh.L': [(p + 1.5) % (Math.PI * 2), 0, 0], 'thigh.R': [(p + 4.6) % (Math.PI * 2), 0, 0],
          spine1: [0.1 * S(p * 2), 0, 0], _hip: [0, 0.02 + 0.01 * S(p * 2), 0], neck: [-0.2, 0, 0], head: [0.1 + 0.05 * S(p * 3), 0, 0],
          tail1: [-1.2, 0, 0], tail2: [-0.2, 0, 0], 'ear.L': [0.7, 0, -0.7], 'ear.R': [0.7, 0, 0.7],
        }, g);
      }
    }
    // fear: ears flat, tail puffed (bone scale), body low
    if (this.fear > 0.01) {
      rig.pose({ 'ear.L': [0.8, 0.3, -0.7], 'ear.R': [0.8, -0.3, 0.7], neck: [0.1, 0, 0], _hip: [0, -0.02, 0] }, this.fear);
      const s = 1 + this.fear * 0.6; for (const n of ['tail1', 'tail2', 'tail3', 'tail4', 'tail5']) rig.scale(n, [s, s, 1]);
    }
    if (this.custom) this.custom(rig, t, dt);
    rig.apply();
    if (this.look) { const tg = this.look.isVector3 ? this.look : this.look.getWorldPosition?.(new THREE.Vector3()); if (tg) rig.lookAt(tg, 0.9, { neck: 'neck', head: 'head', maxYaw: 1.2, maxPitch: 0.7 }); }
    // blink by squashing the eyes
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 5; }
    this.blink = Math.max(0, this.blink - dt * 8);
    const sy = 1 - Math.sin(this.blink * Math.PI) * 0.92;
    for (const e of this.c.extras.eyes || []) e.scale.y = sy * (1 + this.fear * 0.25);
  }
}

export const CAT_BUILDERS = {
  tofu: () => buildTemplate('tofu', { specs: { body: catSpec() }, boneDefs: CAT_BONES.map((n) => ({ name: n, parent: PARENT[n], pos: CAT_J[n] })), material: { sssColor: 0xff7a3a, rim: 1.3 },
    extra: { build(c) { c.extras.eyes = addCatEyes(c); c.extras.whiskers = addWhiskers(c); c.extras.animator = new CatAnimator(c); } } }),
  tofusuit: () => buildTemplate('tofusuit', { specs: { body: catSpec({ suit: true }) }, boneDefs: CAT_BONES.map((n) => ({ name: n, parent: PARENT[n], pos: CAT_J[n] })), material: { sssColor: 0xff7a3a, rim: 1.3 },
    extra: { build(c) { c.extras.eyes = addCatEyes(c); c.extras.whiskers = addWhiskers(c); addSuitProps(c); c.extras.animator = new CatAnimator(c); c.extras.animator.setPose('biped', 0); } } }),
};
