// The giant government hands from the menu: long-fingered, knuckly, clawed, in charcoal suit
// sleeves with starched cuffs and gold cufflinks. SDF-sculpted at real scale, skinned to a
// finger rig (wrist, palm, 3 bones per digit) and scaled up ~7x by the scene.
// Canonical frame: wrist at the origin, fingers point +X, palm faces -Y, thumb toward +Z.
import * as THREE from 'three';
import { cap, sph, ell, box, quatE, rgb, meshSpec, toGeometry } from '../gfx/sdf.js';
import { buildSkeleton } from '../chars/rig.js';
import { clamp, damp, noise1 } from '../core/util.js';

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// name, base, direction, phalanx lengths, radius
const DIGITS = [
  ['index', [0.098, 0.004, 0.03], [1, 0, 0.12], [0.064, 0.042, 0.031], 0.0112],
  ['middle', [0.104, 0.005, 0.009], [1, 0, 0.03], [0.072, 0.047, 0.034], 0.0118],
  ['ring', [0.1, 0.004, -0.012], [1, 0, -0.07], [0.067, 0.043, 0.031], 0.011],
  ['pinky', [0.089, 0.002, -0.031], [1, 0, -0.17], [0.052, 0.034, 0.027], 0.0096],
  ['thumb', [0.03, -0.012, 0.036], [0.62, -0.2, 0.76], [0.052, 0.041, 0.033], 0.0132],
].map(([name, base, dir, lens, r]) => ({ name, base, dir: norm(dir), lens, r }));

function handDefs() {
  const defs = [{ name: 'wrist', parent: null, pos: [0, 0, 0] }, { name: 'palm', parent: 'wrist', pos: [0.02, 0, 0] }];
  for (const d of DIGITS) {
    let p = d.base;
    for (let k = 0; k < 3; k++) { defs.push({ name: `${d.name}${k}`, parent: k === 0 ? 'palm' : `${d.name}${k - 1}`, pos: p }); p = add(p, d.dir, d.lens[k]); }
  }
  return defs;
}

function handSpec(defs) {
  const B = Object.fromEntries(defs.map((d, i) => [d.name, i]));
  const P = [];
  const skin = { noise: [0.0012, 140] };
  P.push(cap([-0.17, 0, 0], [0.0, 0, 0], 0.034, 0.03, { bone: B.wrist, mat: 0, k: 0, ...skin }));
  P.push(sph([0.004, 0.012, -0.024], 0.011, { bone: B.wrist, mat: 0, k: 0.012 }));
  P.push(box([0.056, 0.0, 0.0], [0.05, 0.015, 0.042], 0.013, { bone: B.palm, mat: 0, k: 0.022, ...skin }));
  P.push(ell([0.04, -0.012, 0.026], [0.032, 0.016, 0.019], { bone: B.palm, mat: 0, k: 0.016 }));
  P.push(ell([0.07, -0.011, -0.022], [0.035, 0.012, 0.016], { bone: B.palm, mat: 0, k: 0.016 }));
  for (const d of DIGITS) {
    const j = [d.base]; for (let k = 0; k < 3; k++) j.push(add(j[k], d.dir, d.lens[k]));
    const r = d.r, yaw = Math.atan2(-d.dir[2], d.dir[0]), pitch = Math.asin(d.dir[1]);
    P.push(sph(j[0], r * 1.18, { bone: B[d.name + '0'], mat: 0, k: 0.01 }));               // knuckle
    P.push(cap(j[0], j[1], r, r * 0.9, { bone: B[d.name + '0'], mat: 0, k: 0.006, ...skin }));
    P.push(sph(j[1], r * 1.02, { bone: B[d.name + '1'], mat: 0, k: 0.006 }));
    P.push(cap(j[1], j[2], r * 0.9, r * 0.8, { bone: B[d.name + '1'], mat: 0, k: 0.005, ...skin }));
    P.push(sph(j[2], r * 0.88, { bone: B[d.name + '2'], mat: 0, k: 0.005 }));
    P.push(cap(j[2], j[3], r * 0.8, r * 0.58, { bone: B[d.name + '2'], mat: 0, k: 0.004 }));
    // long yellowed nail curling into a claw
    const up = [0, 1, 0];
    P.push(ell(add(add(j[3], d.dir, -0.006), up, r * 0.42), [0.016, 0.0032, r * 0.72], { bone: B[d.name + '2'], mat: 1, k: 0.002, q: quatE(0, yaw, pitch) }));
    P.push(cap(add(add(j[3], d.dir, 0.002), up, r * 0.35), add(add(j[3], d.dir, 0.02), up, -r * 0.6), 0.0042, 0.0008, { bone: B[d.name + '2'], mat: 1, k: 0.002 }));
  }
  // veins on the back of the hand
  P.push(cap([-0.06, 0.03, -0.005], [0.01, 0.021, -0.006], 0.0026, 0.0024, { bone: B.wrist, mat: 2, k: 0.005, w: 0 }));
  P.push(cap([0.01, 0.019, -0.006], [0.08, 0.016, 0.022], 0.0024, 0.0018, { bone: B.palm, mat: 2, k: 0.004, w: 0 }));
  P.push(cap([0.01, 0.019, -0.006], [0.084, 0.015, -0.018], 0.0022, 0.0017, { bone: B.palm, mat: 2, k: 0.004, w: 0 }));
  P.push(cap([0.035, 0.018, 0.004], [0.088, 0.017, 0.004], 0.0018, 0.0015, { bone: B.palm, mat: 2, k: 0.003, w: 0 }));
  const mats = [
    { c: rgb(0x3a3036), c2: rgb(0x231b21), vn: 45, rough: 0.55, sss: 0.7 },
    { c: rgb(0x8c8068), c2: rgb(0x5d543f), vn: 120, rough: 0.3 },
    { c: rgb(0x4a2236), rough: 0.5, sss: 1 },
  ];
  return { prims: P, paints: [], mats, bounds: { min: [-0.18, -0.08, -0.08], max: [0.28, 0.05, 0.13] }, cell: 0.0027, sigma: 0.007, smooth: 1, defaultBone: B.palm };
}

function sleeveSpec() {
  const P = [
    cap([-1.6, 0.002, 0], [-0.04, 0.002, 0], 0.058, 0.049, { mat: 0, noise: [0.0025, 30] }),
    cap([-0.06, 0.002, 0], [-0.04, 0.002, 0], 0.052, 0.051, { mat: 0, k: 0.006 }),               // sleeve hem
    cap([-0.05, 0, 0], [-0.008, 0, 0], 0.041, 0.04, { mat: 1, k: 0.004 }),                         // starched cuff
    cap([-0.03, 0.0, 0.04], [-0.03, 0.0, 0.05], 0.0085, 0.0085, { mat: 2, k: 0.002 }),            // cufflink
    box([-0.03, 0.0, 0.051], [0.006, 0.006, 0.002], 0.002, { mat: 3, k: 0.001 }),
    ...[0, 1, 2].map((i) => sph([-0.085 - i * 0.018, 0.012, 0.05], 0.0055, { mat: 4, k: 0.002 })),
  ];
  const mats = [
    { c: rgb(0x16171c), c2: rgb(0x1f2027), vn: 25, rough: 0.7, stripes: [380, 2, 0.12, rgb(0x2c2e38)] },
    { c: rgb(0xe9e6dd), c2: rgb(0xd8d3c6), vn: 30, rough: 0.5 },
    { c: rgb(0xd9b24a), rough: 0.25, metal: 1 },
    { c: rgb(0x8f1b1b), rough: 0.3 },
    { c: rgb(0x0b0b0b), rough: 0.4 },
  ];
  return { prims: P, paints: [], mats, bounds: { min: [-1.62, -0.07, -0.07], max: [0.0, 0.07, 0.07] }, cell: 0.0042, sigma: 0.01, smooth: 1 };
}

let TEMPLATE = null;
export async function buildHandTemplate() {
  if (TEMPLATE) return TEMPLATE;
  const defs = handDefs();
  const [h, s] = await Promise.all([meshSpec(handSpec(defs)), meshSpec(sleeveSpec())]);
  TEMPLATE = { defs, hand: toGeometry(h), sleeve: toGeometry(s, { skinned: false }) };
  return TEMPLATE;
}

function shadowMat(rimHex) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, envMapIntensity: 0.4 });
  m.userData.u = { uRim: { value: new THREE.Color(rimHex) }, uRimK: { value: 1 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 surf; varying vec3 vSurf;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf; uniform vec3 uRim; uniform float uRimK;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.6);
          totalEmissiveRadiance += uRim * rim * uRimK * (0.22 + vSurf.z * 0.25); }`);
  };
  return m;
}
function hull(th, skinned) {
  const m = new THREE.MeshBasicMaterial({ color: 0x050304, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${th.toFixed(4)};`); };
  return m;
}

const DOWN = new THREE.Vector3(0, -1, 0);
export class GiantHand {
  constructor({ scale = 7, mirror = false, rim = 0xff2a1a } = {}) {
    const T = TEMPLATE; if (!T) throw new Error('buildHandTemplate() first');
    this.root = new THREE.Group(); this.root.name = 'giantHand';
    this.inner = new THREE.Group(); this.root.add(this.inner);
    const { bones, byName } = buildSkeleton(T.defs);
    this.bones = bones; this.b = byName;
    this.inner.add(byName.wrist);
    this.root.updateMatrixWorld(true);               // bind at identity, scale afterwards
    this.skeleton = new THREE.Skeleton(bones);
    this.inner.scale.set(scale, scale, mirror ? -scale : scale);
    this.mat = shadowMat(rim);
    this.mesh = new THREE.SkinnedMesh(T.hand, this.mat); this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    const hm = new THREE.SkinnedMesh(T.hand, hull(0.0016, true)); hm.bind(this.skeleton, new THREE.Matrix4()); hm.frustumCulled = false; hm.layers.set(2);
    this.sleeve = new THREE.Mesh(T.sleeve, shadowMat(rim)); this.sleeve.castShadow = true;
    this.sleeve.material.userData.u.uRimK.value = 0.6;
    const sh = new THREE.Mesh(T.sleeve, hull(0.002)); sh.layers.set(2);
    byName.wrist.add(this.sleeve, sh);
    this.inner.add(this.mesh, hm);
    // per-digit curl axes in the rest frame
    this.axes = DIGITS.map((d) => new THREE.Vector3(...d.dir).cross(DOWN).normalize());
    this.curl = 0.25; this.curlT = 0.25; this.spread = 0.1; this.spreadT = 0.1; this.wiggle = 1; this.time = Math.random() * 10;
    this.tap = -1; // finger-drum animation timer
  }
  // Point the fingers along `dir` (world) with the palm facing down-ish.
  orient(dir, roll = 0) {
    const x = dir.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    let y = up.clone().sub(x.clone().multiplyScalar(x.dot(up)));
    if (y.lengthSq() < 1e-4) y.set(0, 0, 1);
    y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    this.root.quaternion.setFromRotationMatrix(m);
    if (roll) this.root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
  }
  setGrip(curl, spread = this.spreadT) { this.curlT = curl; this.spreadT = spread; }
  drum() { this.tap = 0; }
  update(dt) {
    this.time += dt;
    this.curl = damp(this.curl, this.curlT, this.curlT > this.curl ? 14 : 5, dt);
    this.spread = damp(this.spread, this.spreadT, 6, dt);
    if (this.tap >= 0) this.tap += dt;
    if (this.tap > 1.6) this.tap = -1;
    const q = new THREE.Quaternion(), qs = new THREE.Quaternion();
    DIGITS.forEach((d, i) => {
      const thumb = d.name === 'thumb';
      const wig = this.wiggle * (0.12 * noise1(this.time * 1.7 + i * 3.1, i) + 0.05 * Math.sin(this.time * 6 + i));
      let c = this.curl + wig;
      if (this.tap >= 0 && !thumb) { const k = this.tap * 7 - (3 - i); c += Math.max(0, Math.sin(clamp(k, 0, 1) * Math.PI)) * 0.5 - 0.2; }
      const spreadA = thumb ? -this.spread * 0.6 : (i - 1.5) * this.spread * 0.35;
      for (let k = 0; k < 3; k++) {
        const bone = this.b[`${d.name}${k}`];
        const amt = c * (thumb ? [0.5, 0.6, 0.5][k] : [0.95, 1.15, 0.85][k]);
        q.setFromAxisAngle(this.axes[i], amt);
        if (k === 0) { qs.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spreadA); q.premultiply(qs); }
        bone.quaternion.copy(q);
      }
    });
    this.b.palm.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.curl * 0.12);
    this.b.wrist.quaternion.setFromEuler(new THREE.Euler(0.05 * Math.sin(this.time * 0.9), 0.04 * Math.sin(this.time * 0.6), -0.1 * this.curl + 0.04 * Math.sin(this.time * 1.3)));
  }
}
