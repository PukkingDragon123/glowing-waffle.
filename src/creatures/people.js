// Ordinary people, built by hand: a low-poly human on a small rigid-skinned
// skeleton (one draw call each, colours in the vertices), with breathing,
// weight shifts, glances and a plain walk. The agents who come for Alex are
// these; so are the ones waiting on the roof, who are green.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// joints in the rest pose: metres, facing +z, feet on y 0. L is +x (their left).
const J = {
  hips: [0, 0.95, 0], spine: [0, 1.07, -0.01], chest: [0, 1.25, -0.012], neck: [0, 1.465, -0.012], head: [0, 1.555, 0.004],
  shoulder: [0.182, 1.405, -0.018], elbow: [0.2, 1.128, -0.034], wrist: [0.212, 0.878, -0.004],
  hip: [0.088, 0.928, 0], knee: [0.096, 0.505, 0.014], ankle: [0.1, 0.088, -0.022],
};
const BONES = [
  ['hips', null, J.hips], ['spine', 'hips', J.spine], ['chest', 'spine', J.chest], ['neck', 'chest', J.neck], ['head', 'neck', J.head],
];
for (const [s, k] of [['L', 1], ['R', -1]]) {
  const m = (p) => [p[0] * k, p[1], p[2]];
  BONES.push(['uarm' + s, 'chest', m(J.shoulder)], ['farm' + s, 'uarm' + s, m(J.elbow)], ['hand' + s, 'farm' + s, m(J.wrist)]);
  BONES.push(['thigh' + s, 'hips', m(J.hip)], ['shin' + s, 'thigh' + s, m(J.knee)], ['foot' + s, 'shin' + s, m(J.ankle)]);
}
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ------------------------------------------------------------------ shapes
function ell(c, r, seg = 12, rings = 8) { const g = new THREE.SphereGeometry(1, seg, rings); g.scale(r[0], r[1], r[2]); g.translate(c[0], c[1], c[2]); return g; }
// a tapered limb between two joints, capped round so the joints never gap
function limb(a, b, r0, r1, seg = 10) {
  const A = V(...a), B = V(...b), d = B.clone().sub(A), L = d.length();
  const cyl = new THREE.CylinderGeometry(r1, r0, L, seg, 3, true);
  cyl.translate(0, L / 2, 0);
  cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  cyl.translate(A.x, A.y, A.z);
  return [cyl, ell(a, [r0, r0, r0], seg, 6), ell(b, [r1, r1, r1], seg, 6)];
}
function lathe(pts, sx, sz, seg = 14, dz = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg);
  g.scale(sx, 1, sz); g.translate(0, 0, dz);
  return g;
}
function cap(c, r, len = 0.55, tilt = 0.35, seg = 14) {
  // a skull cap (hair, hats): the top of a sphere, tipped back
  const g = new THREE.SphereGeometry(1, seg, 8, 0, Math.PI * 2, 0, Math.PI * len);
  g.scale(r[0], r[1], r[2]); g.rotateX(-tilt); g.translate(c[0], c[1], c[2]);
  return g;
}
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ builder
export class Person {
  // o: { skin, top, under, bottom, shoes, hair, hairStyle, build: 'm'|'f', height, sleeves: 'long'|'short',
  //      jacket: colour|null, legs: 'pants'|'skirt', hat: 'cap'|null, glasses, seed }
  constructor(o = {}) {
    this.o = o = { build: 'm', height: 1, sleeves: 'long', legs: 'pants', hairStyle: 'short', seed: Math.random() * 10, ...o };
    this.parts = [];
    this.build();
    const g = this.mergeParts();
    // bones
    this.bones = BONES.map(([n]) => { const b = new THREE.Bone(); b.name = n; return b; });
    BONES.forEach(([n, p, pos], i) => {
      const b = this.bones[i];
      if (p) { this.bones[BI[p]].add(b); const pp = BONES[BI[p]][2]; b.position.set(pos[0] - pp[0], pos[1] - pp[1], pos[2] - pp[2]); }
      else b.position.set(...pos);
    });
    this.b = Object.fromEntries(BONES.map(([n], i) => [n, this.bones[i]]));
    this.b.uarmL.rotation.order = this.b.uarmR.rotation.order = 'YXZ';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 });
    const mesh = this.mesh = new THREE.SkinnedMesh(g, mat);
    mesh.add(this.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root = new THREE.Group(); this.root.add(mesh);
    this.root.scale.setScalar(o.height);
    // live state
    this.t = o.seed; this.phase = 0; this.speed = 0; this.walkK = 0;
    this.look = null; this.lookYaw = 0; this.lookPitch = 0; this.lookW = 1;
    this.torch = 0; this.aimYaw = 0; this.aimPitch = 0.15;    // right arm forward holding a light
    this.reach = 0;                                           // right hand held out
    this.hold = 0;                                            // hands clasped in front
    this.base = Object.fromEntries(this.bones.map((b) => [b.name, b.position.clone()]));
  }

  add(geos, color, bone, o = {}) { for (const g of [].concat(geos)) this.parts.push({ g, color: new THREE.Color(color), bone, ...o }); }

  build() {
    const o = this.o, f = o.build === 'f';
    const skin = o.skin ?? 0xc8987a, top = o.top ?? 0x6a6a70, under = o.under ?? top, bot = o.bottom ?? 0x2a3448, shoes = o.shoes ?? 0x1a1a1a, hair = o.hair ?? 0x2a1c14;
    const lip = new THREE.Color(skin).multiplyScalar(0.78).lerp(new THREE.Color(0x8a4a48), 0.25);
    const coat = o.jacket ?? top;
    // ---- torso: pelvis on the hips, the ribcage split over spine and chest
    const pel = f ? [[0.001, 0.835], [0.12, 0.845], [0.162, 0.9], [0.168, 0.95], [0.15, 1.02]] : [[0.001, 0.835], [0.11, 0.845], [0.148, 0.9], [0.152, 0.96], [0.142, 1.02]];
    this.add(lathe(pel, 1.0, 0.7, 14), bot, 'hips');
    const tor = f
      ? [[0.14, 0.97], [0.128, 1.04], [0.118, 1.1], [0.124, 1.17], [0.142, 1.25], [0.148, 1.31], [0.147, 1.37], [0.132, 1.42], [0.08, 1.458], [0.046, 1.476]]
      : [[0.138, 0.97], [0.142, 1.04], [0.143, 1.1], [0.152, 1.18], [0.164, 1.27], [0.17, 1.34], [0.166, 1.39], [0.14, 1.435], [0.082, 1.468], [0.046, 1.484]];
    this.add(lathe(tor, 1.06, 0.66, 16, -0.01), o.jacket ? coat : top, 'torso', { front: o.jacket ? under : null, frontW: 0.055 });
    if (f) this.add(ell([0, 1.29, 0.05], [0.118, 0.062, 0.05], 14, 8), o.jacket ? under : top, 'chest');             // a soft bust under the shirt
    // shoulders, and a collar on shirts and jackets
    for (const s of [-1, 1]) this.add(ell([s * 0.165, 1.398, -0.016], [0.07, 0.062, 0.068], 10, 6), coat, 'chest');
    if (o.collar) this.add(new THREE.TorusGeometry(0.058, 0.014, 6, 14).rotateX(Math.PI / 2 - 0.25).translate(0, 1.47, -0.004), o.collar, 'chest');
    if (o.hood) this.add(ell([0, 1.43, -0.1], [0.11, 0.06, 0.06], 10, 6), coat, 'chest');
    if (o.belt) this.add(new THREE.TorusGeometry(0.15, 0.012, 4, 16).rotateX(Math.PI / 2).scale(1.0, 1, 0.7).translate(0, 0.985, 0), o.belt, 'hips');
    // ---- neck and head
    this.add(limb([0, 1.44, -0.012], [0, 1.57, 0.002], 0.05, 0.046, 10), skin, 'neck');
    const hc = [0, 1.635, 0.008];
    this.add(ell(hc, [0.077, 0.1, 0.092], 16, 12), skin, 'head');
    this.add(ell([0, 1.575, 0.03], [0.062, 0.058, 0.068], 14, 8), skin, 'head');             // jaw and cheeks
    this.add(ell([0, 1.552, 0.052], [0.03, 0.025, 0.034], 10, 6), skin, 'head');             // chin
    this.add(ell([0, 1.664, 0.074], [0.06, 0.014, 0.02], 12, 6), skin, 'head');              // brow ridge
    const nose = new THREE.ConeGeometry(0.016, 0.046, 4); nose.rotateY(Math.PI / 4); nose.scale(0.9, 1, 0.75); nose.rotateX(-0.2); nose.translate(0, 1.618, 0.092);
    this.add(nose, skin, 'head');
    this.add(ell([0, 1.598, 0.093], [0.012, 0.008, 0.009], 6, 4), skin, 'head');
    for (const s of [-1, 1]) {
      this.add(ell([s * 0.03, 1.638, 0.087], [0.012, 0.0085, 0.009], 8, 6), 0xe0dcd0, 'head');     // whites
      this.add(ell([s * 0.03, 1.638, 0.0955], [0.0058, 0.0058, 0.0025], 8, 6), o.eyes ?? 0x2a1e16, 'head');
      this.add(ell([s * 0.032, 1.6545, 0.093], [0.015, 0.0026, 0.004], 6, 4), new THREE.Color(hair).lerp(new THREE.Color(skin), 0.35), 'head');   // brows
      this.add(ell([s * 0.078, 1.622, 0.0], [0.013, 0.026, 0.018], 8, 6), skin, 'head');              // ears
    }
    this.add(ell([0, 1.567, 0.084], [0.021, 0.0058, 0.008], 8, 4), lip, 'head');
    if (o.glasses) for (const s of [-1, 1]) this.add(new THREE.TorusGeometry(0.019, 0.0022, 4, 12).translate(s * 0.031, 1.635, 0.094), 0x1a1612, 'head');
    // ---- hair and hats
    const hs = o.hairStyle;
    if (hs !== 'bald') {
      const thin = hs === 'receding';
      this.add(cap([0, 1.645, -0.002], [0.083, 0.108, 0.099], thin ? 0.42 : 0.5, thin ? 0.8 : 0.58), hair, 'head');
      this.add(ell([0, 1.62, -0.05], [0.078, 0.075, 0.06], 12, 8), hair, 'head');           // the back of the head
      if (hs === 'bob' || hs === 'long') {
        const sh = new THREE.CylinderGeometry(0.092, hs === 'long' ? 0.11 : 0.1, hs === 'long' ? 0.3 : 0.14, 14, 2, true, Math.PI * 0.32, Math.PI * 1.36);
        sh.scale(1, 1, 0.95); sh.translate(0, hs === 'long' ? 1.53 : 1.6, -0.012);
        this.add(sh, hair, 'head');
        if (hs === 'long') this.add(ell([0, 1.44, -0.06], [0.09, 0.09, 0.03], 10, 6), hair, 'chest');
      }
      if (hs === 'pony') this.add(limb([0, 1.64, -0.1], [0, 1.47, -0.13], 0.026, 0.016, 8), hair, 'head');
    }
    if (o.hat === 'cap') {
      this.add(cap([0, 1.655, 0.0], [0.089, 0.1, 0.1], 0.5, 0.15), o.hatColor ?? 0x14161a, 'head');
      const brim = new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.15); brim.rotateX(0.12); brim.translate(0, 1.692, 0.07);
      this.add(brim, o.hatColor ?? 0x14161a, 'head');
    }
    // ---- arms (sleeves to the elbow or the wrist), hands
    for (const [S, k] of [['L', 1], ['R', -1]]) {
      const m = (p) => [p[0] * k, p[1], p[2]];
      const sh = m(J.shoulder), el = m(J.elbow), wr = m(J.wrist);
      this.add(limb(sh, el, 0.052, 0.043), coat, 'uarm' + S);
      const fa = o.sleeves === 'short' && !o.jacket ? skin : coat;
      this.add(limb(el, [wr[0], wr[1] + 0.02, wr[2]], 0.042, 0.033), fa, 'farm' + S);
      if (o.sleeves === 'short' && !o.jacket) this.add(limb(sh, [sh[0] + k * 0.006, sh[1] - 0.13, sh[2] - 0.01], 0.06, 0.052), top, 'uarm' + S);
      if (fa !== skin) this.add(limb([wr[0], wr[1] + 0.05, wr[2]], [wr[0], wr[1] + 0.012, wr[2]], 0.037, 0.036, 10), fa, 'farm' + S);
      this.add(ell([wr[0] + k * 0.002, wr[1] - 0.045, wr[2] + 0.004], [0.021, 0.05, 0.042], 10, 6), skin, 'hand' + S);
      this.add(ell([wr[0] - k * 0.004, wr[1] - 0.1, wr[2] + 0.008], [0.019, 0.034, 0.04], 10, 6), skin, 'hand' + S);
      this.add(limb([wr[0] - k * 0.012, wr[1] - 0.02, wr[2] + 0.03], [wr[0] - k * 0.022, wr[1] - 0.068, wr[2] + 0.046], 0.011, 0.009, 6), skin, 'hand' + S);
      // legs: trousers, or a skirt over bare (or stockinged) legs
      const hp = m(J.hip), kn = m(J.knee), an = m(J.ankle);
      const legC = o.legs === 'skirt' ? (o.tights ?? skin) : bot;
      this.add(limb(hp, kn, f ? 0.088 : 0.084, 0.058), legC, 'thigh' + S);
      this.add(limb(kn, [an[0], an[1] + 0.03, an[2]], 0.056, 0.038), legC, 'shin' + S);
      this.add(ell([kn[0], kn[1] - 0.09, kn[2] - 0.035], [0.05, 0.08, 0.045], 10, 6), legC, 'shin' + S);     // calf
      if (o.legs !== 'skirt' && o.cuffs) this.add(limb([an[0], an[1] + 0.07, an[2]], [an[0], an[1] + 0.035, an[2]], 0.05, 0.05), bot, 'shin' + S);
      // shoes
      const boot = o.boots;
      this.add(ell([an[0], an[1] - 0.035, an[2] + 0.055], [0.048, 0.042, 0.125], 10, 6), shoes, 'foot' + S);
      this.add(ell([an[0], an[1] - 0.06, an[2] + 0.05], [0.05, 0.025, 0.135], 10, 4), o.sole ?? shoes, 'foot' + S);
      if (boot) this.add(limb([an[0], an[1] - 0.04, an[2]], [an[0], an[1] + 0.12, an[2]], 0.05, 0.048), shoes, 'shin' + S);
    }
    if (o.legs === 'skirt') this.add(new THREE.CylinderGeometry(0.155, 0.235, 0.42, 16, 2, true).scale(1, 1, 0.8).translate(0, 0.79, 0), bot, 'hips');
    // a zip down a windbreaker, buttons down a cardigan
    if (o.zip) this.add(new THREE.BoxGeometry(0.008, 0.46, 0.006).translate(0, 1.21, 0.112), o.zip, 'torso');
  }

  // one geometry: colour per vertex, one bone (or a spine/chest blend) per vertex
  mergeParts() {
    const out = [];
    const s = this.o.seed;
    for (const p of this.parts) {
      let g = p.g;
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const pos = g.attributes.position, n = pos.count;
      const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let c = p.color;
        if (p.front && z > 0.03 && Math.abs(x) < p.frontW && y < 1.44 && y > 0.98) c = new THREE.Color(p.front);
        const j = 0.95 + hash(x * 40 + s, y * 40, z * 40) * 0.08;
        col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
        if (p.bone === 'torso') {
          const w = clamp((y - 1.12) / 0.12, 0, 1);
          si[i * 4] = BI.spine; si[i * 4 + 1] = BI.chest; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w;
        } else { si[i * 4] = BI[p.bone]; sw[i * 4] = 1; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      out.push(g);
    }
    const g = mergeGeometries(out, false);
    this.parts = null;
    return g;
  }

  // ------------------------------------------------------------------ pose
  set visible(v) { this.root.visible = v; }
  get visible() { return this.root.visible; }
  headWorld(out = V()) { return this.b.head.localToWorld(out.set(0, 0.08, 0.06)); }
  handWorld(side = 'R', out = V()) { return this.b['hand' + side].localToWorld(out.set(0, -0.08, 0.01)); }

  update(dt) {
    const b = this.b, base = this.base, t = (this.t += dt), s = this.o.seed;
    // walk: one stride per 1.3 m
    this.walkK = damp(this.walkK, clamp(this.speed / 1.1, 0, 1), 6, dt);
    this.phase += dt * this.speed / 0.65 * Math.PI;
    const k = this.walkK, ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph), idle = 1 - k;
    const kneeL = Math.pow(Math.max(0, cw), 1.5) * 0.95 * k + 0.04, kneeR = Math.pow(Math.max(0, -cw), 1.5) * 0.95 * k + 0.04;
    b.thighL.rotation.x = -sw * 0.44 * k - 0.02; b.thighR.rotation.x = sw * 0.44 * k - 0.02;
    b.shinL.rotation.x = kneeL; b.shinR.rotation.x = kneeR;
    b.footL.rotation.x = -(b.thighL.rotation.x + kneeL) * 0.75; b.footR.rotation.x = -(b.thighR.rotation.x + kneeR) * 0.75;
    // standing: weight drifts from foot to foot, the chest rises and falls
    const shift = Math.sin(t * 0.37 + s) * idle;
    b.hips.position.set(base.hips.x + shift * 0.014, base.hips.y + (Math.abs(cw) - 0.65) * 0.035 * k, base.hips.z);
    b.hips.rotation.set(0, sw * 0.09 * k, shift * 0.025);
    b.thighL.rotation.z = -shift * 0.025; b.thighR.rotation.z = -shift * 0.025;
    const br = Math.sin(t * 1.45 + s);
    b.spine.rotation.set(0.02 + br * 0.008, -sw * 0.05 * k, -shift * 0.018);
    b.chest.rotation.set(br * 0.012 - this.hold * 0.04, -sw * 0.04 * k, -shift * 0.012);
    b.chest.scale.set(1 + br * 0.008, 1, 1 + br * 0.014);
    // arms swing with the stride, hang and breathe at rest
    for (const [S, sg] of [['L', 1], ['R', -1]]) {
      const ua = b['uarm' + S], fa = b['farm' + S], ha = b['hand' + S];
      ua.rotation.set(sg * sw * 0.36 * k + br * 0.01, 0, sg * (0.07 + br * 0.006));
      fa.rotation.set(-0.12 - 0.22 * k, 0, 0);
      ha.rotation.set(0, sg * 0.15, 0);
      if (this.hold > 0) { ua.rotation.x = lerp(ua.rotation.x, -0.42, this.hold); ua.rotation.y = lerp(0, -sg * 0.32, this.hold); fa.rotation.x = lerp(fa.rotation.x, -1.0, this.hold); ha.rotation.y = lerp(ha.rotation.y, -sg * 0.6, this.hold); }
    }
    // the right arm: a flashlight held out, or a hand offered
    const R = b.uarmR, RF = b.farmR, RH = b.handR;
    if (this.torch > 0) {
      const a = this.torch;
      R.rotation.x = lerp(R.rotation.x, -Math.PI / 2 + this.aimPitch * 0.85, a);
      R.rotation.y = lerp(0, this.aimYaw * 0.45 + 0.12, a);
      R.rotation.z = lerp(R.rotation.z, 0, a);
      RF.rotation.x = lerp(RF.rotation.x, -0.12, a); RH.rotation.set(0, 0, 0);
      b.chest.rotation.y += this.aimYaw * 0.45 * a; b.spine.rotation.y += this.aimYaw * 0.12 * a;
    }
    if (this.reach > 0) {
      const a = this.reach;
      R.rotation.x = lerp(R.rotation.x, -0.95, a); R.rotation.y = lerp(R.rotation.y, 0.28, a);
      RF.rotation.x = lerp(RF.rotation.x, -0.38, a); RH.rotation.set(0, lerp(RH.rotation.y, -1.35, a), 0);
    }
    // the head turns toward whatever it is looking at
    let yaw = Math.sin(t * 0.21 + s * 3) * 0.12, pitch = Math.sin(t * 0.17 + s) * 0.04;
    if (this.look) {
      const l = this.root.worldToLocal(_l.copy(this.look)).sub(_h.set(0, 1.62, 0));
      yaw = clamp(Math.atan2(l.x, l.z), -1.15, 1.15);
      pitch = clamp(-Math.atan2(l.y, Math.hypot(l.x, l.z)), -0.45, 0.5);
      yaw -= b.chest.rotation.y + b.spine.rotation.y;
    }
    this.lookYaw = dampAngle(this.lookYaw, yaw * this.lookW, 3.2, dt);
    this.lookPitch = damp(this.lookPitch, pitch * this.lookW, 3.2, dt);
    b.neck.rotation.set(this.lookPitch * 0.35, this.lookYaw * 0.4, 0);
    b.head.rotation.set(this.lookPitch * 0.65 - br * 0.008, this.lookYaw * 0.6, Math.sin(t * 0.29 + s) * 0.03);
  }
  // face a direction (ry: 0 faces +z) without snapping
  turnTo(ry, rate, dt) { this.root.rotation.y = dampAngle(this.root.rotation.y, ry, rate, dt); }
}
const _l = V(), _h = V();

// heading for a figure that faces +z
export const headingTo = (dx, dz) => Math.atan2(dx, dz);
export { wrapAngle };
