// Gary (grey alien husband, beige cardigan) and the baby (big glossy eyes, silver onesie).
import * as THREE from 'three';
import { cap, sph, ell, box, quatE, mirror, rgb } from '../gfx/sdf.js';
import { humanJoints, boneDefs, bodySpec, handSpec, baseMats, BI, MIRROR_BONES, HUMAN_BONES } from './human.js';
import { buildTemplate } from './character.js';
import { HumanAnimator } from './animator.js';

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// Big black almond eyes: glossy, with a faint galaxy shimmer deep inside.
let alienEyeMat = null;
function eyeMat() {
  if (alienEyeMat) return alienEyeMat;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#020204'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${120 + Math.random() * 100},${80 + Math.random() * 60},255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 128, Math.random() * 28, 1, 1); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  alienEyeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: t, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.0, emissive: 0x2a1450, emissiveMap: t, emissiveIntensity: 0.35 });
  return alienEyeMat;
}
export function makeAlienEyes(headBone, centers, scale, tilt) {
  const geo = new THREE.SphereGeometry(1, 32, 16); geo.rotateX(Math.PI / 2);
  const rest = headBone.userData.rest;
  return centers.map((c, i) => {
    const s = i === 0 ? 1 : -1;
    const m = new THREE.Mesh(geo, eyeMat());
    m.scale.set(scale[0], scale[1], scale[2]);
    m.position.set(c[0] - rest.x, c[1] - rest.y, c[2] - rest.z);
    m.rotation.set(0, s * 0.35, s * tilt);
    m.userData.baseRot = m.rotation.clone();
    headBone.add(m); return m;
  });
}

// ---------------- Gary ----------------
export function garySpecs() {
  const J = humanJoints({ h: 1.18, w: 0.8, armLen: 1.14, neckLen: 1.6 });
  const o = { w: 0.8, fat: 0, belly: 0, sleeves: 'long', pants: 'long', shoes: 'slippers', collar: true, neckR: 0.034 };
  const mats = baseMats({ skin: 0x8f8aa3, skin2: 0x7f7894, shirt: 0xc2ab80, shirt2: 0xa99168, pants: 0x4e3d2f, pants2: 0x46362a, shoes: 0x6e2a36, hair: 0x000000, lip: 0x6a5d78 });
  mats[0].spots = [55, 0.74, rgb(0x6e4f8f)];
  mats[0].sss = 0.6;
  mats[1].stripes = [260, 1, 0.25, rgb(0x8f7a55)]; // knit ribs
  const body = bodySpec(J, o); body.mats = mats;
  // cardigan buttons + pocket
  body.paints.push(...[0.06, 0.0, -0.06, -0.12].map((yy) => sph(add(J.chest, [0, yy, 0.115]), 0.008, { mat: 5, soft: 0.002 })));
  body.paints.push(box(add(J.spine, [0.08, -0.04, 0.1]), [0.04, 0.035, 0.05], 0.004, { mat: 10, soft: 0.004, mix: 0.25 }));
  mats[10] = { c: rgb(0x8a7550), rough: 0.9 };
  // head
  const H = J.head, c = (dx, dy, dz) => [H[0] + dx, H[1] + dy, H[2] + dz], P = [];
  P.push(cap(add(J.neck, [0, -0.02, 0]), c(0, 0.06, -0.01), 0.038, 0.034, { bone: BI.neck, bone2: BI.head, mat: 0, k: 0.03 }));
  P.push(ell(c(0, 0.2, -0.03), [0.112, 0.13, 0.13], { bone: BI.head, mat: 0, k: 0 }));
  P.push(ell(c(0, 0.105, 0.035), [0.072, 0.095, 0.075], { bone: BI.head, mat: 0, k: 0.07 }));
  P.push(ell(c(0, 0.035, 0.06), [0.022, 0.022, 0.02], { bone: BI.jaw, mat: 0, k: 0.045 }));
  for (const s of [1, -1]) {
    P.push(ell(c(s * 0.046, 0.132, 0.092), [0.036, 0.022, 0.018], { bone: BI.head, mat: 0, k: 0.012, op: 's', q: quatE(0, s * 0.35, s * 0.42) }));
    P.push(sph(c(s * 0.007, 0.078, 0.108), 0.0032, { bone: BI.head, mat: 5, k: 0.002, op: 's', w: 0 }));
    P.push(ell(c(s * 0.1, 0.16, -0.02), [0.008, 0.02, 0.012], { bone: BI.head, mat: 0, k: 0.02 })); // vestigial ear nubs
  }
  P.push(cap(c(-0.016, 0.054, 0.087), c(0, 0.05, 0.09), 0.0013, 0.0013, { bone: BI.jaw, mat: 5, k: 0.002, op: 's', w: 0 }));
  P.push(cap(c(0, 0.05, 0.09), c(0.016, 0.054, 0.087), 0.0013, 0.0013, { bone: BI.jaw, mat: 5, k: 0.002, op: 's', w: 0 }));
  const head = { prims: P, paints: [], mats, bounds: { min: [-0.15, J.neck[1] - 0.05, -0.2], max: [0.15, H[1] + 0.36, 0.18] }, cell: 0.0045, sigma: 0.008, smooth: 1,
    clip: [{ n: [0, -1, 0], d: -(J.neck[1] - 0.04) }], defaultBone: BI.head };
  // three long fingers + thumb: stretch the human hand
  const hands = ['L', 'R'].map((sd) => { const h = handSpec(J, { gloves: false, handFat: 0.85 }, sd); h.mats = mats; return h; });
  return { J, specs: { body, head, handL: hands[0], handR: hands[1] } };
}

// ---------------- the baby ----------------
export function babyJoints() {
  const J = {};
  J.hips = [0, 0.16, 0]; J.spine = [0, 0.2, 0]; J.belly = [0, 0.2, 0.03]; J.chest = [0, 0.255, 0]; J.neck = [0, 0.3, -0.005]; J.head = [0, 0.32, 0]; J.jaw = [0, 0.35, 0.04];
  const AD = [Math.sin(0.75), -Math.cos(0.75), 0];
  J['clav.L'] = [0.02, 0.29, 0]; J['upperarm.L'] = [0.065, 0.285, 0];
  J['forearm.L'] = add(J['upperarm.L'], AD, 0.075); J['hand.L'] = add(J['forearm.L'], AD, 0.065);
  J['thumb.L'] = add(J['hand.L'], [0.005, -0.01, 0.015]); J['index.L'] = add(J['hand.L'], AD, 0.025); J['fingers.L'] = add(add(J['hand.L'], AD, 0.025), [0, 0, -0.01]);
  J['thigh.L'] = [0.045, 0.15, 0]; J['shin.L'] = [0.05, 0.085, 0.01]; J['foot.L'] = [0.052, 0.03, 0]; J['toe.L'] = [0.052, 0.012, 0.045];
  for (const k of Object.keys(J)) if (k.endsWith('.L')) J[k.replace('.L', '.R')] = [-J[k][0], J[k][1], J[k][2]];
  return J;
}
export function babySpecs() {
  const J = babyJoints(), P = [];
  const mats = [
    { c: rgb(0x9c98ad), c2: rgb(0x8a84a0), vn: 40, rough: 0.5, sss: 0.9, spots: [70, 0.72, rgb(0x8a63b5)] }, // 0 skin
    { c: rgb(0xd7dbe3), c2: rgb(0xaab0bd), vn: 18, rough: 0.28, metal: 0.85 },                              // 1 silver onesie
    { c: rgb(0x2a1420), rough: 0.5 },                                                                         // 2 mouth
    { c: rgb(0x7ad6ff), rough: 0.3, metal: 0.4 },                                                            // 3 onesie trim
  ];
  const b = BI;
  P.push(ell(add(J.hips, [0, 0.0, 0]), [0.07, 0.06, 0.06], { bone: b.hips, mat: 1, k: 0 }));
  P.push(ell(add(J.spine, [0, 0.0, 0.01]), [0.075, 0.06, 0.065], { bone: b.spine, mat: 1, k: 0.04, noise: [0.002, 60] }));
  P.push(ell(add(J.chest, [0, 0, 0]), [0.07, 0.05, 0.055], { bone: b.chest, mat: 1, k: 0.04, noise: [0.002, 60] }));
  P.push(cap(J.neck, add(J.head, [0, 0.03, 0]), 0.03, 0.032, { bone: b.neck, bone2: b.head, mat: 0, k: 0.02 }));
  P.push(tor(add(J.chest, [0, 0.04, 0]), 0.034, 0.007, { bone: b.chest, mat: 3, k: 0.008 }));
  // head: big round cranium, small face
  const c = (dx, dy, dz) => add(J.head, [dx, dy, dz]);
  P.push(ell(c(0, 0.115, -0.01), [0.105, 0.105, 0.1], { bone: b.head, mat: 0, k: 0 }));
  P.push(ell(c(0, 0.07, 0.03), [0.07, 0.06, 0.075], { bone: b.head, mat: 0, k: 0.05 }));
  P.push(ell(c(0, 0.04, 0.06), [0.03, 0.022, 0.03], { bone: b.jaw, mat: 0, k: 0.03 }));
  for (const s of [1, -1]) {
    P.push(ell(c(s * 0.043, 0.093, 0.078), [0.032, 0.024, 0.018], { bone: b.head, mat: 0, k: 0.01, op: 's', q: quatE(0, s * 0.3, s * 0.25) }));
    P.push(ell(c(s * 0.05, 0.06, 0.07), [0.022, 0.018, 0.015], { bone: b.head, mat: 0, k: 0.02 })); // chubby cheeks
    // limbs (stubby, in the onesie)
    const S = s > 0 ? 'L' : 'R';
    P.push(cap(J['upperarm.' + S], J['forearm.' + S], 0.026, 0.022, { bone: b['upperarm.' + S], mat: 1, k: 0.025 }));
    P.push(cap(J['forearm.' + S], J['hand.' + S], 0.022, 0.019, { bone: b['forearm.' + S], mat: 1, k: 0.012 }));
    P.push(sph(add(J['hand.' + S], [0, -0.012, 0]), 0.018, { bone: b['hand.' + S], mat: 0, k: 0.01 }));
    P.push(cap(add(J['hand.' + S], [0, -0.02, 0.01]), add(J['hand.' + S], [s * 0.004, -0.04, 0.016]), 0.0055, 0.005, { bone: b['index.' + S], mat: 0, k: 0.004 }));
    P.push(cap(add(J['hand.' + S], [0, -0.02, -0.006]), add(J['hand.' + S], [s * 0.004, -0.04, -0.008]), 0.0055, 0.005, { bone: b['fingers.' + S], mat: 0, k: 0.004 }));
    P.push(cap(J['thigh.' + S], J['shin.' + S], 0.034, 0.026, { bone: b['thigh.' + S], mat: 1, k: 0.03 }));
    P.push(cap(J['shin.' + S], J['foot.' + S], 0.026, 0.022, { bone: b['shin.' + S], mat: 1, k: 0.015 }));
    P.push(ell(add(J['foot.' + S], [0, -0.008, 0.018]), [0.022, 0.017, 0.032], { bone: b['foot.' + S], mat: 1, k: 0.012 }));
    P.push(tor(add(J['forearm.' + S], add([0, 0, 0], [Math.sin(0.75) * s, -Math.cos(0.75), 0], 0.05)), 0.019, 0.004, { bone: b['forearm.' + S], mat: 3, k: 0.004, q: quatE(0, 0, s * 0.75) }));
  }
  P.push(cap(c(-0.012, 0.035, 0.088), c(0, 0.03, 0.09), 0.0018, 0.0018, { bone: b.jaw, mat: 2, k: 0.002, op: 's', w: 0 }));
  P.push(cap(c(0, 0.03, 0.09), c(0.012, 0.035, 0.088), 0.0018, 0.0018, { bone: b.jaw, mat: 2, k: 0.002, op: 's', w: 0 }));
  const body = { prims: P, paints: [], mats, bounds: { min: [-0.2, -0.01, -0.13], max: [0.2, 0.56, 0.16] }, cell: 0.0042, sigma: 0.008, smooth: 1, defaultBone: b.spine };
  return { J, specs: { body } };
}
function tor(a, R, r, o = {}) { return { t: 'tor', a, s: [R, r], ...o }; }

export const ALIEN_BUILDERS = {
  gary: async () => {
    const { J, specs } = garySpecs();
    return buildTemplate('gary', { specs, boneDefs: boneDefs(J), material: { sssColor: 0x8a5ad8, rim: 1.4 }, extra: { build(c) {
      const H = J.head;
      c.extras.eyes = []; c.extras.alienEyes = makeAlienEyes(c.byName.head, [[0.046, H[1] + 0.132, H[2] + 0.084], [-0.046, H[1] + 0.132, H[2] + 0.084]], [0.034, 0.019, 0.016], 0.42);
      c.extras.animator = new HumanAnimator(c, { joints: J });
      c.extras.animator.stride = 1.5;
    } } });
  },
  baby: async () => {
    const { J, specs } = babySpecs();
    return buildTemplate('baby', { specs, boneDefs: boneDefs(J), material: { sssColor: 0x9d6bff, rim: 1.6 }, extra: { build(c) {
      const H = J.head;
      c.extras.alienEyes = makeAlienEyes(c.byName.head, [[0.043, H[1] + 0.094, H[2] + 0.07], [-0.043, H[1] + 0.094, H[2] + 0.07]], [0.03, 0.022, 0.016], 0.25);
      c.extras.eyes = [];
      c.extras.animator = new HumanAnimator(c, { joints: J });
    } } });
  },
};
