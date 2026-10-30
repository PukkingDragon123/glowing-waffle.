// Procedural humans (Sunny, DTP soldiers, General Brass) sculpted from SDF primitives.
// Body is meshed coarse; head and hands are meshed fine and skinned to the same skeleton.
import * as THREE from 'three';
import { cap, sph, ell, box, quatE, mirror, rgb, meshSpec, toGeometry } from '../gfx/sdf.js';

const D2R = Math.PI / 180;
const ARM = 40 * D2R;                        // A-pose arm angle from vertical
const AD = [Math.sin(ARM), -Math.cos(ARM), 0]; // left arm direction (+X side)
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const L = (p) => p, R = (p) => [-p[0], p[1], p[2]];

export const HUMAN_BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'belly',
  'clav.L', 'upperarm.L', 'forearm.L', 'hand.L', 'thumb.L', 'index.L', 'fingers.L',
  'clav.R', 'upperarm.R', 'forearm.R', 'hand.R', 'thumb.R', 'index.R', 'fingers.R',
  'thigh.L', 'shin.L', 'foot.L', 'toe.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.R'];
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', belly: 'spine',
  'clav.L': 'chest', 'upperarm.L': 'clav.L', 'forearm.L': 'upperarm.L', 'hand.L': 'forearm.L', 'thumb.L': 'hand.L', 'index.L': 'hand.L', 'fingers.L': 'hand.L',
  'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L', 'toe.L': 'foot.L' };
for (const k of Object.keys(PARENT)) if (k.endsWith('.L')) PARENT[k.replace('.L', '.R')] = PARENT[k] ? PARENT[k].replace('.L', '.R') : null;
export const BI = Object.fromEntries(HUMAN_BONES.map((n, i) => [n, i]));
export const MIRROR_BONES = Object.fromEntries(HUMAN_BONES.filter((n) => n.endsWith('.L')).map((n) => [BI[n], BI[n.replace('.L', '.R')]]));

// Joint layout for a given body scale. h = height scale, w = width scale.
export function humanJoints({ h = 1, w = 1, armLen = 1, legLen = 1, neckLen = 1 } = {}) {
  const J = {};
  const y = (v) => v * h;
  J.hips = [0, y(0.95) * legLen / 1 + 0, 0];
  const hipY = 0.95 * h * legLen;
  J.hips = [0, hipY, 0];
  const torsoY = (v) => hipY + (v - 0.95) * h;
  J.spine = [0, torsoY(1.08), -0.005];
  J.belly = [0, torsoY(1.05), 0.06];
  J.chest = [0, torsoY(1.27), -0.01];
  J.neck = [0, torsoY(1.46), -0.02];
  J.head = [0, torsoY(1.46) + 0.1 * h * neckLen, 0.0];
  J.jaw = [0, J.head[1] + 0.025 * h, 0.035];
  J['clav.L'] = [0.03 * w, torsoY(1.43), 0];
  const sh = [0.18 * w, torsoY(1.41), -0.02];
  J['upperarm.L'] = sh;
  const el = add(sh, AD, 0.29 * h * armLen); J['forearm.L'] = el;
  const wr = add(el, AD, 0.26 * h * armLen); J['hand.L'] = wr;
  J['thumb.L'] = add(add(wr, AD, 0.028), [0, 0, 0.028]);
  J['index.L'] = add(add(wr, AD, 0.092), [0, 0, 0.022]);
  J['fingers.L'] = add(add(wr, AD, 0.092), [0, 0, -0.012]);
  J['thigh.L'] = [0.095 * w, hipY - 0.03, 0];
  J['shin.L'] = [0.1 * w, hipY - 0.03 - 0.42 * h * legLen, 0.012];
  J['foot.L'] = [0.105 * w, 0.085 * h, -0.01];
  J['toe.L'] = [0.108 * w, 0.02, 0.125 * h];
  for (const k of Object.keys(J)) if (k.endsWith('.L')) J[k.replace('.L', '.R')] = R(J[k]);
  return J;
}

export function boneDefs(J) { return HUMAN_BONES.map((n) => ({ name: n, parent: PARENT[n], pos: J[n] })); }

// ---------------- materials ----------------
export const SKIN_TONES = { tan: 0x9a6648, pale: 0xe5bfa3, olive: 0xc49a74, ruddy: 0xd79a80 };

export function baseMats(o) {
  return [
    { c: rgb(o.skin), c2: rgb(o.skin2 ?? new THREE.Color(o.skin).offsetHSL(0.01, 0.05, -0.06).getHex()), vn: 30, rough: 0.55, sss: 1 },  // 0 skin
    { c: rgb(o.shirt), c2: rgb(o.shirt2 ?? o.shirt), vn: 14, rough: 0.92 },                                                            // 1 shirt/top
    { c: rgb(o.pants), c2: rgb(o.pants2 ?? o.pants), vn: 12, rough: 0.9, stripes: o.plaid ? [70, 0, 0.35, rgb(o.plaid)] : undefined }, // 2 pants
    { c: rgb(o.shoes), rough: 0.55 },                                                                                                  // 3 shoes
    { c: rgb(o.hair), c2: rgb(new THREE.Color(o.hair).offsetHSL(0, 0, 0.05).getHex()), vn: 80, rough: 0.7 },                           // 4 hair
    { c: rgb(0x3a1414), rough: 0.5 },                                                                                                   // 5 mouth inner
    { c: rgb(o.lip ?? 0x7e4a3e), rough: 0.45, sss: 1 },                                                                                 // 6 lips
    { c: rgb(o.gear ?? 0x1b1d20), c2: rgb(o.gear2 ?? 0x24272b), vn: 20, rough: 0.8 },                                                  // 7 gear/vest
    { c: rgb(o.metal ?? 0x8c8f93), rough: 0.35, metal: 0.8 },                                                                          // 8 metal/badges
    { c: rgb(o.stubble ?? 0x2a2420), rough: 0.7 },                                                                                      // 9 stubble tint
    { c: rgb(o.accent ?? 0xb3261e), rough: 0.6 },                                                                                       // 10 accent (medals, tie)
    { c: rgb(o.glove ?? 0x151515), rough: 0.7 },                                                                                         // 11 gloves
  ];
}

// ---------------- body ----------------
export function bodySpec(J, o) {
  const P = [], b = BI;
  const w = o.w, fat = o.fat ?? 0;
  const top = o.top === 'gear' ? 7 : 1;
  // torso
  P.push(ell(add(J.hips, [0, -0.02, 0]), [0.16 * w + fat * 0.02, 0.11, 0.11 + fat * 0.02], { bone: b.hips, mat: 2, k: 0 }));
  P.push(ell(add(J.hips, [0.075 * w, -0.04, -0.06]), [0.085, 0.1, 0.08], { bone: b.hips, mat: 2, k: 0.05 }));
  P.push(ell(add(J.hips, [-0.075 * w, -0.04, -0.06]), [0.085, 0.1, 0.08], { bone: b.hips, mat: 2, k: 0.05 }));
  P.push(ell(add(J.spine, [0, 0.0, 0.005]), [0.145 * w + fat * 0.03, 0.13, 0.1 + fat * 0.04], { bone: b.spine, mat: top, k: 0.07, noise: [0.003, 40] }));
  P.push(ell(add(J.chest, [0, 0.0, 0.0]), [0.175 * w + fat * 0.02, 0.15, 0.11 + fat * 0.02], { bone: b.chest, mat: top, k: 0.08, noise: [0.003, 35] }));
  P.push(cap(add(J['upperarm.R'], [0.04, -0.01, 0]), add(J['upperarm.L'], [-0.04, -0.01, 0]), 0.06, 0.06, { bone: b.chest, mat: top, k: 0.06 }));
  P.push(cap(J.neck, add(J['upperarm.L'], [-0.05, 0.02, 0]), 0.045, 0.04, { bone: b.chest, mat: top, k: 0.05 }));
  P.push(cap(J.neck, add(J['upperarm.R'], [0.05, 0.02, 0]), 0.045, 0.04, { bone: b.chest, mat: top, k: 0.05 }));
  // neck (thinner than the head-mesh neck so the seam hides inside it)
  P.push(cap(add(J.neck, [0, -0.04, 0]), add(J.head, [0, 0.0, 0.0]), o.neckR ?? 0.05, (o.neckR ?? 0.05) * 0.95, { bone: b.neck, bone2: b.head, mat: 0, k: 0.04 }));
  // collar ring of the shirt
  if (o.collar !== false) P.push(cap(add(J.neck, [-0.05, -0.02, 0.02]), add(J.neck, [0.05, -0.02, 0.02]), 0.03, 0.03, { bone: b.chest, mat: top, k: 0.03 }));
  // pregnant belly
  if (o.belly > 0) {
    const s = o.belly;
    P.push(ell(add(J.belly, [0, -0.02, 0.06 * s]), [0.155 * s + 0.02, 0.17 * s + 0.02, 0.16 * s], { bone: b.belly, mat: top, k: 0.09, noise: [0.002, 30] }));
    if (o.belly > 0.6 && o.top !== 'gear') P.push(ell(add(J.belly, [0, -0.13 * s, 0.13 * s]), [0.13, 0.03, 0.05], { bone: b.belly, mat: 0, k: 0.03 })); // the shirt rides up
  }
  // arms
  for (const side of ['L']) {
    const S = side, sh = J['upperarm.' + S], el = J['forearm.' + S], wr = J['hand.' + S];
    const arm = [];
    arm.push(ell(add(sh, [0.01, -0.02, 0]), [0.06 + fat * 0.01, 0.075, 0.06], { bone: b['upperarm.' + S], mat: top, k: 0.035, q: quatE(0, 0, ARM) }));
    arm.push(cap(sh, el, 0.05 + fat * 0.01, 0.038, { bone: b['upperarm.' + S], mat: 0, k: 0.03 }));
    arm.push(cap(el, wr, 0.04, 0.028, { bone: b['forearm.' + S], mat: o.sleeves === 'long' ? top : 0, k: 0.02 }));
    // sleeve
    const sleeveEnd = o.sleeves === 'long' ? el : add(sh, AD, 0.15);
    arm.push(cap(add(sh, AD, -0.01), sleeveEnd, 0.06 + fat * 0.01, 0.052, { bone: b['upperarm.' + S], mat: top, k: 0.02, noise: [0.002, 50] }));
    if (o.sleeves === 'long') arm.push(cap(el, add(wr, AD, -0.03), 0.047, 0.037, { bone: b['forearm.' + S], mat: top, k: 0.015, noise: [0.002, 50] }));
    // wrist stub (hidden inside the fine hand mesh)
    arm.push(cap(add(wr, AD, -0.02), add(wr, AD, 0.02), 0.026, 0.026, { bone: b['hand.' + S], mat: o.gloves ? 11 : 0, k: 0.01 }));
    // legs
    const hp = J['thigh.' + S], kn = J['shin.' + S], an = J['foot.' + S], to = J['toe.' + S];
    arm.push(cap(hp, kn, 0.085 + fat * 0.012, 0.055, { bone: b['thigh.' + S], mat: 0, k: 0.05 }));
    arm.push(cap(kn, an, 0.052, 0.034, { bone: b['shin.' + S], mat: 0, k: 0.02 }));
    arm.push(ell(add(kn, [0, -0.1, -0.03]), [0.045, 0.08, 0.045], { bone: b['shin.' + S], mat: 0, k: 0.03 }));
    // pants / shorts
    const pantsEnd = o.pants === 'long' ? add(an, [0, 0.06, 0]) : add(kn, [0, 0.07, 0]);
    arm.push(cap(add(hp, [0, 0.03, 0]), o.pants === 'long' ? kn : pantsEnd, 0.1 + fat * 0.012, 0.072, { bone: b['thigh.' + S], mat: 2, k: 0.03, noise: [0.003, 30] }));
    if (o.pants === 'long') arm.push(cap(kn, pantsEnd, 0.068, 0.058, { bone: b['shin.' + S], mat: 2, k: 0.02, noise: [0.003, 30] }));
    if (o.kneepads) arm.push(ell(add(kn, [0, 0, 0.055]), [0.055, 0.06, 0.03], { bone: b['shin.' + S], mat: 7, k: 0.01 }));
    // feet
    if (o.shoes === 'boots') {
      arm.push(cap(add(an, [0, 0.07, -0.01]), add(an, [0, -0.03, -0.01]), 0.05, 0.055, { bone: b['foot.' + S], mat: 3, k: 0.02 }));
      arm.push(box(add(an, [0, -0.045, 0.06]), [0.05, 0.04, 0.12], 0.035, { bone: b['foot.' + S], mat: 3, k: 0.03 }));
    } else {
      arm.push(cap(an, add(to, [0, 0.01, 0]), 0.038, 0.034, { bone: b['foot.' + S], bone2: b['toe.' + S], mat: 0, k: 0.025 }));
      arm.push(box(add(an, [0, -0.07, 0.05]), [0.048, 0.012, 0.115], 0.01, { bone: b['foot.' + S], mat: 3, k: 0.005 })); // slipper sole
      arm.push(cap(add(to, [-0.03, 0.0, -0.04]), add(to, [0.03, 0.0, -0.04]), 0.028, 0.028, { bone: b['toe.' + S], mat: 3, k: 0.01 })); // strap
    }
    P.push(...arm, ...arm.map((p) => mirror(p, MIRROR_BONES)));
  }
  // vest + pouches for soldiers
  if (o.vest) {
    P.push(box(add(J.chest, [0, -0.05, 0.02]), [0.165, 0.17, 0.125], 0.04, { bone: b.chest, mat: 7, k: 0.02, noise: [0.002, 40] }));
    for (const x of [-0.09, -0.03, 0.03, 0.09]) P.push(box(add(J.spine, [x, -0.01, 0.13]), [0.026, 0.04, 0.025], 0.008, { bone: b.spine, mat: 7, k: 0.006 }));
    P.push(box(add(J.hips, [0, 0.02, 0]), [0.17, 0.03, 0.13], 0.02, { bone: b.hips, mat: 7, k: 0.01 })); // belt
    P.push(box(add(J.hips, [0.15, -0.05, 0.02]), [0.03, 0.06, 0.05], 0.01, { bone: b['thigh.L'], mat: 7, k: 0.005 })); // holster
  }
  if (o.jacket) { // general's coat skirt + buttons
    P.push(cap(add(J.hips, [0, 0.05, 0]), add(J.hips, [0, -0.17, 0]), 0.17 + fat * 0.02, 0.19 + fat * 0.02, { bone: b.hips, mat: 1, k: 0.04, clip: [{ n: [0, 0, -1], d: 0.04 }] }));
  }
  const paints = [];
  if (o.medals) {
    paints.push(box(add(J.chest, [0.075, 0.03, 0.12]), [0.04, 0.025, 0.05], 0.004, { mat: 10, soft: 0.003 }));
    paints.push(box(add(J.chest, [0.075, 0.0, 0.12]), [0.04, 0.008, 0.05], 0.002, { mat: 8, soft: 0.002 }));
    for (const yy of [0.06, -0.02, -0.1, -0.18]) paints.push(sph(add(J.chest, [0, yy, 0.115]), 0.012, { mat: 8, soft: 0.002 }));
  }
  if (o.printShirt) paints.push(ell(add(J.chest, [0.0, -0.02, 0.12]), [0.08, 0.05, 0.05], { mat: 9, soft: 0.01, mix: 0.25 }));
  const bounds = { min: [-0.62 * o.w, -0.01, -0.3], max: [0.62 * o.w, J.head[1] + 0.02, 0.32 + (o.belly || 0) * 0.15] };
  return { prims: P, paints, mats: [], bounds, cell: o.cell ?? 0.011, sigma: 0.014, smooth: 1, clip: [{ n: [0, 1, 0], d: J.head[1] + 0.005 }], defaultBone: b.spine };
}

// ---------------- head ----------------
function headSpec(J, o) {
  const P = [], b = BI;
  const H = J.head, hx = o.headW ?? 1;
  const c = (dx, dy, dz) => [H[0] + dx * hx, H[1] + dy, H[2] + dz];
  // neck (slightly thicker than the body neck)
  P.push(cap(add(J.neck, [0, -0.02, 0]), c(0, 0.05, -0.005), (o.neckR ?? 0.05) + 0.004, (o.neckR ?? 0.05) * 0.95 + 0.004, { bone: b.neck, bone2: b.head, mat: 0, k: 0.03 }));
  // skull + face
  P.push(ell(c(0, 0.13, -0.015), [0.082 * hx, 0.1, 0.098], { bone: b.head, mat: 0, k: 0 }));
  P.push(ell(c(0, 0.08, 0.02), [0.064 * hx, 0.078, 0.08], { bone: b.head, mat: 0, k: 0.04 }));
  P.push(cap(c(-0.04, 0.042, 0.02), c(0.04, 0.042, 0.02), 0.028 + (o.jowl ?? 0), 0.028 + (o.jowl ?? 0), { bone: b.jaw, mat: 0, k: 0.045 }));
  P.push(ell(c(0, 0.022, 0.07), [0.026 * hx, 0.022, 0.024], { bone: b.jaw, mat: 0, k: 0.03 })); // chin
  for (const s of [1, -1]) {
    P.push(ell(c(s * 0.045, 0.1, 0.064), [0.026, 0.017, 0.022], { bone: b.head, mat: 0, k: 0.025 })); // cheekbone
    P.push(ell(c(s * 0.031, 0.104, 0.088), [0.015, 0.006, 0.008], { bone: b.head, mat: 0, k: 0.01 })); // under-eye bag
    P.push(cap(c(s * 0.02, 0.083, 0.1), c(s * 0.03, 0.055, 0.092), 0.003, 0.002, { bone: b.head, mat: 0, k: 0.006, op: 's', w: 0 })); // nasolabial fold
    P.push(ell(c(s * 0.084 * hx, 0.098, -0.003), [0.012, 0.03, 0.02], { bone: b.head, mat: 0, k: 0.012, q: quatE(0, s * 0.3, s * -0.1) })); // ear
    P.push(ell(c(s * 0.033, 0.121, 0.086), [0.017, 0.0125, 0.012], { bone: b.head, mat: 0, k: 0.01, op: 's' })); // eye socket
  }
  P.push(cap(c(-0.046, 0.146, 0.083), c(0.046, 0.146, 0.083), 0.015, 0.015, { bone: b.head, mat: 0, k: 0.024 })); // brow ridge
  // nose
  const nl = o.nose ?? 1;
  P.push(cap(c(0, 0.132, 0.096), c(0, 0.084, 0.114 + 0.006 * nl), 0.008, 0.015 * nl, { bone: b.head, mat: 0, k: 0.014 }));
  for (const s of [1, -1]) P.push(sph(c(s * 0.013, 0.083, 0.104), 0.011 * nl, { bone: b.head, mat: 0, k: 0.009 }));
  for (const s of [1, -1]) P.push(sph(c(s * 0.009, 0.078, 0.112), 0.0038, { bone: b.head, mat: 5, k: 0.003, op: 's' }));
  // mouth
  P.push(ell(c(0, 0.059, 0.094), [0.021, 0.0055, 0.009], { bone: b.head, mat: 6, k: 0.006 }));
  P.push(ell(c(0, 0.049, 0.092), [0.019, 0.006, 0.009], { bone: b.jaw, mat: 6, k: 0.006 }));
  P.push(box(c(0, 0.054, 0.1), [0.022, 0.0012, 0.014], 0.001, { bone: b.jaw, mat: 5, k: 0.002, op: 's', w: 0 }));
  P.push(ell(c(0, 0.05, 0.075), [0.022, 0.012, 0.02], { bone: b.jaw, mat: 5, k: 0.003, op: 's', w: 0 }));
  // hair
  const paints = [];
  if (o.hairStyle === 'short') {
    const n = [0, -0.857, 0.514], d = -(c(0, 0.175, 0.09)[1]) * 0.857 + c(0, 0.175, 0.09)[2] * 0.514;
    P.push(ell(c(0, 0.142, -0.016), [0.088 * hx, 0.104, 0.104], { bone: b.head, mat: 4, k: 0.006, noise: [0.0045, 70], clip: [{ n, d }] }));
  } else if (o.hairStyle === 'bald') {
    P.push(ell(c(0, 0.12, -0.03), [0.087 * hx, 0.06, 0.095], { bone: b.head, mat: 4, k: 0.004, noise: [0.002, 120], clip: [{ n: [0, -1, 0], d: -c(0, 0.11, 0)[1] }, { n: [0, 0, 1], d: c(0, 0, 0.0)[2] }] }));
  }
  if (o.stubble) { paints.push(ell(c(0, 0.04, 0.045), [0.07 * hx, 0.05, 0.075], { mat: 9, soft: 0.014, mix: 0.5 })); paints.push(ell(c(0, 0.068, 0.1), [0.026, 0.008, 0.02], { mat: 9, soft: 0.006, mix: 0.45 })); }
  if (o.mustache) P.push(cap(c(-0.03, 0.068, 0.106), c(0.03, 0.068, 0.106), 0.009, 0.009, { bone: b.head, mat: 4, k: 0.004, noise: [0.003, 120] }));
  // helmet + gas mask (soldier)
  if (o.helmet) {
    P.push(ell(c(0, 0.16, -0.01), [0.108, 0.11, 0.123], { bone: b.head, mat: 7, k: 0, clip: [{ n: [0, -1, 0], d: -c(0, 0.11, 0)[1] }] }));
    P.push(ell(c(0, 0.085, 0.065), [0.075, 0.07, 0.07], { bone: b.head, mat: 7, k: 0.02 }));                      // mask body
    P.push(cap(c(0, 0.04, 0.12), c(0, 0.03, 0.15), 0.028, 0.03, { bone: b.head, mat: 7, k: 0.012 }));              // filter
    P.push(cap(c(0, 0.03, 0.155), c(0, 0.028, 0.162), 0.031, 0.031, { bone: b.head, mat: 8, k: 0.002 }));
    for (const s of [1, -1]) P.push(cap(c(s * 0.03, 0.12, 0.1), c(s * 0.033, 0.122, 0.115), 0.023, 0.024, { bone: b.head, mat: 8, k: 0.004 })); // lens rims
  }
  if (o.cap) { // peaked officer cap
    P.push(cap(c(0, 0.19, -0.01), c(0, 0.235, -0.01), 0.1, 0.112, { bone: b.head, mat: 1, k: 0.004 }));
    P.push(ell(c(0, 0.19, 0.09), [0.085, 0.008, 0.05], { bone: b.head, mat: 3, k: 0.004, q: quatE(0.2, 0, 0) }));
    paints.push(sph(c(0, 0.215, 0.105), 0.015, { mat: 8, soft: 0.002 }));
    paints.push(cap(c(-0.09, 0.2, 0.05), c(0.09, 0.2, 0.05), 0.012, 0.012, { mat: 10, soft: 0.002 }));
  }
  const top = H[1] + 0.27;
  return { prims: P, paints, mats: [], bounds: { min: [-0.14, J.neck[1] - 0.06, -0.15], max: [0.14, top, 0.19] }, cell: o.headCell ?? 0.0042, sigma: 0.006, smooth: 1,
    clip: [{ n: [0, -1, 0], d: -(J.neck[1] - 0.045) }], defaultBone: b.head };
}

// ---------------- hands ----------------
export function handSpec(J, o, side) {
  const s = side === 'L' ? 1 : -1, b = BI, S = side;
  const wr = J['hand.' + S];
  const dir = [AD[0] * s, AD[1], 0];
  const nrm = [-Math.cos(ARM) * s, -Math.sin(ARM), 0]; // palm normal (toward body / down)
  const at = (along, across, out = 0) => add(add(add(wr, dir, along), [0, 0, across]), nrm, out);
  const q = quatE(0, 0, s * ARM);
  const fat = o.handFat ?? 1, mat = o.gloves ? 11 : 0;
  const P = [];
  P.push(cap(at(-0.035, 0), at(0.01, 0), 0.028, 0.026, { bone: b['forearm.' + S], bone2: b['hand.' + S], mat: o.sleeves === 'long' && o.gloves ? 11 : 0, k: 0.01 }));
  P.push(box(at(0.05, 0.004, -0.003), [0.013 * fat, 0.046, 0.039 * fat], 0.012, { bone: b['hand.' + S], mat, k: 0.012, q }));
  const fingers = [['index', 0.024, 0.074, 0.0095], ['fingers', 0.0075, 0.082, 0.0098], ['fingers', -0.0095, 0.077, 0.0094], ['fingers', -0.025, 0.063, 0.0085]];
  for (const [bone, z, len, r] of fingers) {
    P.push(cap(at(0.088, z), at(0.088 + len * 0.55, z, 0.004), r * fat, r * 0.95 * fat, { bone: b[bone + '.' + S], mat, k: 0.004 }));
    P.push(cap(at(0.088 + len * 0.55, z, 0.004), at(0.088 + len, z, 0.012), r * 0.95 * fat, r * 0.8 * fat, { bone: b[bone + '.' + S], mat, k: 0.004 }));
  }
  P.push(cap(at(0.02, 0.022, -0.004), at(0.05, 0.045, 0.012), 0.016 * fat, 0.012 * fat, { bone: b['thumb.' + S], mat, k: 0.008 }));
  P.push(cap(at(0.05, 0.045, 0.012), at(0.075, 0.058, 0.022), 0.012 * fat, 0.01 * fat, { bone: b['thumb.' + S], mat, k: 0.004 }));
  const mn = [Math.min(wr[0], wr[0] + dir[0] * 0.2) - 0.07, wr[1] - 0.2, wr[2] - 0.07], mx = [Math.max(wr[0], wr[0] + dir[0] * 0.2) + 0.07, wr[1] + 0.06, wr[2] + 0.09];
  return { prims: P, paints: [], mats: [], bounds: { min: mn, max: mx }, cell: o.handCell ?? 0.0032, sigma: 0.006, smooth: 1, defaultBone: b['hand.' + S],
    clip: [{ n: dir.map((v) => -v), d: -(wr[0] * dir[0] + wr[1] * dir[1]) + 0.04 }] };
}

// ---------------- eyes / brows (rigid, parented to the head bone) ----------------
let eyeTexCache = new Map();
export function eyeTexture(iris = '#4a2f1b', { pupil = 0.13, irisR = 0.36, sclera = '#d8ccc0', slit = false } = {}) {
  const key = iris + pupil + irisR + sclera + slit;
  if (eyeTexCache.has(key)) return eyeTexCache.get(key);
  const W = 256, Hh = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
  g.fillStyle = sclera; g.fillRect(0, 0, W, Hh);
  // rows from the +Y pole (row 0) downwards; after rotation the pole looks forward
  const grad = g.createLinearGradient(0, 0, 0, Hh * irisR);
  const ic = new THREE.Color(iris);
  grad.addColorStop(0, '#000'); grad.addColorStop(pupil / irisR, '#050302');
  grad.addColorStop(pupil / irisR + 0.02, '#' + ic.clone().multiplyScalar(0.6).getHexString());
  grad.addColorStop(0.75, '#' + ic.getHexString()); grad.addColorStop(0.97, '#' + ic.clone().multiplyScalar(0.4).getHexString()); grad.addColorStop(1, sclera);
  g.fillStyle = grad; g.fillRect(0, 0, W, Hh * irisR);
  if (slit) { g.fillStyle = '#000'; for (let x = 0; x < W; x++) { const a = (x / W) * Math.PI * 2; const w = Math.abs(Math.cos(a)) > 0.92 ? Hh * irisR * 0.95 : Hh * 0.02; g.fillRect(x, 0, 1, w); } }
  // iris fibres
  g.globalAlpha = 0.25; g.strokeStyle = '#000';
  for (let i = 0; i < 90; i++) { const x = Math.random() * W; g.beginPath(); g.moveTo(x, Hh * pupil); g.lineTo(x + (Math.random() - 0.5) * 6, Hh * irisR); g.stroke(); }
  g.globalAlpha = 0.18; g.strokeStyle = '#a33';
  for (let i = 0; i < 18; i++) { const x = Math.random() * W; g.beginPath(); g.moveTo(x, Hh); g.quadraticCurveTo(x + 10, Hh * 0.6, x + (Math.random() - 0.5) * 20, Hh * (irisR + 0.05)); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  eyeTexCache.set(key, t);
  return t;
}

export function makeEyes(headBone, centers, radius, { iris, skin, lidColor, slit = false, irisR, pupil, lids = true } = {}) {
  const tex = eyeTexture(iris, { slit, irisR, pupil });
  const eyeGeo = new THREE.SphereGeometry(radius, 32, 16); eyeGeo.rotateX(Math.PI / 2);
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  const lidGeo = new THREE.SphereGeometry(radius * 1.12, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const lidMat = lidColor ? new THREE.MeshStandardMaterial({ color: lidColor, roughness: 0.6 }) : null;
  const eyes = [], lidsArr = [];
  const rest = headBone.userData.rest;
  for (const c of centers) {
    const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(c[0] - rest.x, c[1] - rest.y, c[2] - rest.z); headBone.add(e); eyes.push(e);
    if (lids && lidMat) { const l = new THREE.Mesh(lidGeo, lidMat); l.position.copy(e.position); l.rotation.x = -0.75; headBone.add(l); lidsArr.push(l); }
  }
  return { eyes, lids: lidsArr };
}

export function makeBrows(headBone, J, color, { w = 0.032, thick = 0.0045, y = 0.148, z = 0.097, x = 0.034 } = {}) {
  const geo = new THREE.CapsuleGeometry(thick, w, 4, 8); geo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const rest = headBone.userData.rest;
  return [1, -1].map((s) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(J.head[0] + s * x - rest.x, J.head[1] + y - rest.y, J.head[2] + z - rest.z);
    m.rotation.z = s * -0.08; m.rotation.y = s * 0.25;
    m.userData.base = m.position.clone(); m.userData.side = s;
    headBone.add(m); return m;
  });
}

// ---------------- presets ----------------
export const PRESETS = {
  sunny: { h: 1, w: 1.02, fat: 0.4, belly: 1, skin: SKIN_TONES.tan, shirt: 0x6f7377, shirt2: 0x62666a, pants: 0x3a4660, pants2: 0x323c54, plaid: 0x6a3a34, shoes: 0x23315a,
    hair: 0x14110f, stubble: 0x3b2b22, sleeves: 'short', pants_: 'short', hairStyle: 'short', stubble_: true, iris: '#3a2312', printShirt: true },
  soldier: { h: 1.04, w: 1.12, fat: 0.3, belly: 0, skin: SKIN_TONES.pale, shirt: 0x202326, shirt2: 0x2a2d31, pants: 0x1e2124, pants2: 0x26292d, shoes: 0x111111, top: 'gear',
    gear: 0x1a1c1f, gear2: 0x232629, hair: 0x2a2018, sleeves: 'long', pants_: 'long', helmet: true, vest: true, kneepads: true, gloves: true, shoes_: 'boots', collar: false, iris: '#355', hairStyle: 'none' },
  general: { h: 1.0, w: 1.15, fat: 1, belly: 0.25, skin: SKIN_TONES.ruddy, shirt: 0x4a5236, shirt2: 0x434a31, pants: 0x3f4630, shoes: 0x16110d, hair: 0x9a9690, sleeves: 'long', pants_: 'long',
    hairStyle: 'bald', mustache: true, cap: true, medals: true, jacket: true, accent: 0xa32020, metal: 0xd8b04a, iris: '#4b6170', jowl: 0.006, nose: 1.25, shoes_: 'boots' },
};

// Build the SDF specs for a preset. Returns { joints, specs: {body, head, handL, handR}, opts }
export function humanSpecs(name, overrides = {}) {
  const p = { ...PRESETS[name], ...overrides };
  const o = { ...p, pants: p.pants_ === 'long' ? 'long' : 'short', shoes: p.shoes_ === 'boots' ? 'boots' : 'slippers', stubble: !!p.stubble_ || !!p.stubble };
  // keep colour ints separate from the style flags
  const colors = { skin: p.skin, shirt: p.shirt, shirt2: p.shirt2, pants: p.pants, pants2: p.pants2, plaid: p.plaid, shoes: p.shoes, hair: p.hair, stubble: p.stubble, gear: p.gear, gear2: p.gear2, accent: p.accent, metal: p.metal };
  const J = humanJoints({ h: p.h, w: p.w });
  const ob = { ...o, ...colors, w: p.w };
  ob.pants = o.pants; ob.shoes = o.shoes; // style flags win for body
  const bodyO = { ...ob, pants: o.pants, shoes: o.shoes };
  const matO = { ...colors, plaid: p.plaid, glove: 0x151515, lip: p.lip };
  const fix = (spec) => { spec.mats = baseMats({ ...matO, pants: p.pants, shoes: p.shoes, gear: p.gear, gear2: p.gear2 }); return spec; };
  return {
    joints: J, opts: p,
    specs: { body: fix(bodySpec(J, bodyO)), head: fix(headSpec(J, { ...bodyO, stubble: !!p.stubble_ })), handL: fix(handSpec(J, bodyO, 'L')), handR: fix(handSpec(J, bodyO, 'R')) },
  };
}
