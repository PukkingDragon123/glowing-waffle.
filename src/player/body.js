// The player's visible body: SDF-sculpted, skinned, procedurally animated
// (legs with gait IK, spine following the view, two-bone IK arms, finger
// poses) with a skin shader that carries the mutation: pallor, veins, black
// veins, belly growth, lumps moving under the skin, blood, scratches,
// splitting skin and a faint glow from inside.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { meshPrims, sph, cap, ell, rbox } from '../gfx/sdf.js';
import { clamp, damp, lerp, smoothstep, snoise1, wrapAngle, dampAngle } from '../core/util.js';
import { makeCanvas, toTexture } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

// ------------------------------------------------------------------ rig
const FINGERS = [
  // name, z offset at knuckle, segment lengths, radius
  ['index', -0.027, [0.04, 0.024, 0.019], 0.0088],
  ['middle', -0.009, [0.044, 0.027, 0.02], 0.009],
  ['ring', 0.009, [0.041, 0.025, 0.019], 0.0085],
  ['pinky', 0.025, [0.032, 0.019, 0.017], 0.0075],
];
function buildBoneTable() {
  const T = [];
  const add = (name, parent, pos) => { T.push({ name, parent, pos: V(...pos) }); };
  add('hips', null, [0, 0.95, 0]);
  add('spine1', 'hips', [0, 1.07, 0.005]);
  add('spine2', 'spine1', [0, 1.2, 0.01]);
  add('chest', 'spine2', [0, 1.33, 0.005]);
  add('neck', 'chest', [0, 1.47, 0.0]);
  add('head', 'neck', [0, 1.56, -0.005]);
  for (const [S, s] of [['L', -1], ['R', 1]]) {
    add('clav.' + S, 'chest', [s * 0.03, 1.42, -0.005]);
    add('uarm.' + S, 'clav.' + S, [s * 0.175, 1.415, 0.01]);
    add('farm.' + S, 'uarm.' + S, [s * 0.215, 1.14, 0.02]);
    const W = [s * 0.245, 0.885, 0.0];
    add('hand.' + S, 'farm.' + S, W);
    // thumb
    add('thumb1.' + S, 'hand.' + S, [W[0] - s * 0.012, W[1] - 0.025, W[2] - 0.022]);
    add('thumb2.' + S, 'thumb1.' + S, [W[0] - s * 0.02, W[1] - 0.057, W[2] - 0.041]);
    add('thumb3.' + S, 'thumb2.' + S, [W[0] - s * 0.024, W[1] - 0.084, W[2] - 0.05]);
    for (const [fn, fz, len] of FINGERS) {
      let y = W[1] - 0.092 + (fn === 'middle' ? -0.003 : fn === 'pinky' ? 0.008 : 0);
      const x = W[0] + s * 0.002;
      add(fn + '1.' + S, 'hand.' + S, [x, y, fz]);
      y -= len[0]; add(fn + '2.' + S, fn + '1.' + S, [x, y, fz]);
      y -= len[1]; add(fn + '3.' + S, fn + '2.' + S, [x, y, fz]);
    }
  }
  for (const [S, s] of [['L', -1], ['R', 1]]) {
    add('thigh.' + S, 'hips', [s * 0.095, 0.93, 0]);
    add('shin.' + S, 'thigh.' + S, [s * 0.105, 0.5, 0.005]);
    add('foot.' + S, 'shin.' + S, [s * 0.11, 0.085, 0.025]);
    add('toe.' + S, 'foot.' + S, [s * 0.11, 0.025, -0.105]);
  }
  return T;
}

// ------------------------------------------------------------------ face texture
function faceTexture() {
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  // skin base with soft shading
  const g = ctx.createRadialGradient(S / 2, S * 0.45, S * 0.1, S / 2, S * 0.5, S * 0.6);
  g.addColorStop(0, '#e6c0a8'); g.addColorStop(0.7, '#d0a48c'); g.addColorStop(1, '#a87a64');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  const blob = (x, y, rx, ry, col, a) => { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  // eye sockets / shadows
  for (const sx of [-1, 1]) {
    const ex = S / 2 + sx * 40, ey = S * 0.44;
    blob(ex, ey, 30, 18, '#6a4436', 0.35);
    blob(ex, ey + 2, 20, 9, '#f2ece6', 1);              // eye white
    blob(ex + sx * -1, ey + 2, 8.5, 8.5, '#4a2e1e', 1); // iris
    blob(ex + sx * -1, ey + 2, 4, 4, '#0a0606', 1);     // pupil
    blob(ex + sx * -3, ey - 1, 2, 2, '#ffffff', 0.9);   // catchlight
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(ex, ey + 2, 20, 9, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); // upper lid
    ctx.strokeStyle = 'rgba(90,50,40,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(ex, ey + 3, 19, 8, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    blob(ex, ey + 16, 18, 6, '#7a4a40', 0.25);          // tired bags
    ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.ellipse(ex, ey - 22, 24, 4.5, sx * -0.12, 0, Math.PI * 2); ctx.fill(); // brows
  }
  // nose
  blob(S / 2, S * 0.6, 14, 22, '#b88870', 0.45);
  blob(S / 2 - 9, S * 0.67, 5, 3.5, '#5a3428', 0.8); blob(S / 2 + 9, S * 0.67, 5, 3.5, '#5a3428', 0.8);
  blob(S / 2, S * 0.56, 5, 18, '#f0d0bc', 0.35);
  // cheeks
  blob(S / 2 - 60, S * 0.6, 26, 18, '#c87a70', 0.2); blob(S / 2 + 60, S * 0.6, 26, 18, '#c87a70', 0.2);
  // mouth
  ctx.fillStyle = '#a05454'; ctx.beginPath(); ctx.ellipse(S / 2, S * 0.78, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a1e1e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(S / 2 - 25, S * 0.78); ctx.quadraticCurveTo(S / 2, S * 0.785, S / 2 + 25, S * 0.78); ctx.stroke();
  blob(S / 2, S * 0.84, 18, 6, '#7a4a40', 0.25);
  // noise / pores
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, { nearest: false, repeat: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------ shader
const NOISE_GLSL = /* glsl */`
float bh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float bn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh3(i), bh3(i + vec3(1,0,0)), f.x), mix(bh3(i + vec3(0,1,0)), bh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bh3(i + vec3(0,0,1)), bh3(i + vec3(1,0,1)), f.x), mix(bh3(i + vec3(0,1,1)), bh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float bf3(vec3 p) { return bn3(p) * 0.5 + bn3(p * 2.03 + 7.1) * 0.25 + bn3(p * 4.1 + 3.3) * 0.125; }
float veinField(vec3 p) { float v = abs(bf3(p) - 0.5); return 1.0 - smoothstep(0.0, 0.035, v); }
float segDist(vec3 p, vec3 a, vec3 b) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
`;

export function skinMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aZoneA; attribute vec4 aZoneB; attribute vec3 aRest; attribute float aBelly;
        uniform float uBelly; uniform vec4 uBumps[4]; uniform vec4 uArmBump; uniform float uTime; uniform float uBreathe;
        varying vec4 vZA; varying vec4 vZB; varying vec3 vRest; varying float vBellyW;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 bcN = vec3(0.0, 1.0, 0.08);
        objectNormal = normalize(mix(objectNormal, normalize(position - bcN), clamp(uBelly * pow(aBelly, 1.3) * 1.6, 0.0, 0.65)));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vZA = aZoneA; vZB = aZoneB; vRest = aRest; vBellyW = aBelly;
        vec3 bc = vec3(0.0, 1.0, 0.08);
        float bw = pow(aBelly, 1.3);
        transformed += normalize(transformed - bc) * (uBelly * 0.25 + uBreathe * 0.004) * bw;
        transformed.y -= uBelly * 0.035 * bw;
        for (int i = 0; i < 4; i++) { vec4 b = uBumps[i]; vec3 dd = aRest - b.xyz; transformed += objectNormal * b.w * exp(-dot(dd, dd) / 0.0018) * (0.3 + bw); }
        vec3 da = aRest - uArmBump.xyz; transformed += objectNormal * uArmBump.w * exp(-dot(da, da) / 0.00035);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vZA; varying vec4 vZB; varying vec3 vRest; varying float vBellyW;
        uniform vec3 uSkin; uniform vec3 uSkinPale; uniform float uPale; uniform float uVeins; uniform float uBlackVeins; uniform float uBelly; uniform float uHideHead;
        uniform float uBloodHands; uniform float uBloodMouth; uniform float uBloodShirt; uniform float uSplit; uniform float uGlow; uniform float uNailDark; uniform float uBruise; uniform float uSweat;
        uniform vec4 uScA[8]; uniform vec4 uScB[8]; uniform sampler2D uFace; uniform float uTime; uniform float uDirt; uniform float uHem; uniform float uDebug;
        ${NOISE_GLSL}
        float gSkinW; float gBloodW; float gSplitW;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uHideHead > 0.5 && vRest.y > 1.465 && abs(vRest.x) < 0.15) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vRest;
          float wSkin = vZA.x, wShirt = vZA.y, wPants = vZA.z, wHair = vZA.w, wNail = vZB.x;
          // the shirt rides up over the growing belly
          float hem = uHem + uBelly * 0.24;
          float bare = smoothstep(0.35, 0.6, vBellyW) * (1.0 - smoothstep(hem - 0.015, hem + 0.015, p.y)) * step(p.y, 1.25);
          wSkin += wShirt * bare; wShirt *= 1.0 - bare;
          // skin
          vec3 skin = mix(uSkin, uSkinPale, uPale);
          float mott = bf3(p * 42.0);
          skin *= 0.9 + mott * 0.18;
          skin = mix(skin, skin * vec3(1.05, 0.88, 0.86), smoothstep(0.55, 0.75, bf3(p * 9.0)) * 0.4); // redness blotches
          // face (front of head)
          if (p.y > 1.52) {
            vec2 fuv = vec2((p.x + 0.075) / 0.15, (p.y - 1.57) / 0.17);
            float front = smoothstep(0.03, -0.06, p.z) * step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
            vec3 fc = texture2D(uFace, vec2(fuv.x, fuv.y)).rgb;
            fc = mix(fc, fc * mix(vec3(1.0), uSkinPale / uSkin, 0.8), uPale);
            skin = mix(skin, fc, front);
          }
          // veins: blue under thin skin, black and spreading on late days
          float region = smoothstep(0.85, 1.3, p.y) * smoothstep(0.2, 0.7, vBellyW) + step(abs(p.x), 0.4) * smoothstep(0.85, 1.12, abs(p.x) * 4.0) * smoothstep(1.25, 0.8, p.y) + smoothstep(1.43, 1.5, p.y) * step(p.y, 1.56);
          region = clamp(region + uBlackVeins * 0.6, 0.0, 1.0);
          float vf = veinField(p * vec3(14.0, 7.0, 14.0)) * 0.8 + veinField(p * 31.0) * 0.5;
          vec3 veinCol = mix(vec3(0.32, 0.3, 0.52), vec3(0.03, 0.02, 0.04), uBlackVeins);
          skin = mix(skin, veinCol, clamp(vf * region * (uVeins * 0.7 + uBlackVeins), 0.0, 0.85));
          // bruising around the belly
          skin = mix(skin, mix(vec3(0.42, 0.26, 0.45), vec3(0.6, 0.55, 0.25), bf3(p * 6.0)), uBruise * smoothstep(0.3, 0.9, vBellyW) * smoothstep(0.35, 0.7, bf3(p * 5.0 + 3.0)) * 0.7);
          // splitting skin: raw red flesh with dark crusted edges
          float sp = bf3(p * 11.0 + 2.0);
          float splitM = smoothstep(0.62 - uSplit * 0.12, 0.66 - uSplit * 0.1, sp) * uSplit;
          gSplitW = splitM;
          skin = mix(skin, vec3(0.2, 0.03, 0.03), smoothstep(0.0, 0.3, splitM) * 0.8);
          skin = mix(skin, vec3(0.55, 0.06, 0.07), smoothstep(0.3, 0.8, splitM));
          // scratches
          float scr = 0.0;
          for (int i = 0; i < 8; i++) {
            vec4 A = uScA[i]; vec4 Bv = uScB[i];
            float wd = max(Bv.w, 0.0005);
            float d = segDist(p, A.xyz, Bv.xyz);
            float s1 = clamp((d - wd * 0.4) / (wd * 0.6), 0.0, 1.0);
            scr = max(scr, step(0.001, A.w) * A.w * (1.0 - s1 * s1 * (3.0 - 2.0 * s1)));
          }
          skin = mix(skin, vec3(0.45, 0.02, 0.02), scr);
          // blood
          float handBlood = uBloodHands * smoothstep(0.98, 0.8, p.y) * step(0.12, abs(p.x)) * smoothstep(0.45, 0.6, bf3(p * 26.0) + uBloodHands * 0.2);
          float mouthBlood = uBloodMouth * smoothstep(1.57, 1.53, p.y) * step(1.38, p.y) * smoothstep(0.06, -0.02, p.z) * smoothstep(0.3, 0.55, bf3(p * 20.0) + 0.2 - abs(p.x) * 4.0);
          float blood = clamp(handBlood + mouthBlood + scr * 0.5, 0.0, 1.0);
          gBloodW = blood;
          skin = mix(skin, vec3(0.32, 0.01, 0.015), blood);
          // shirt: worn grey cotton, food & blood stains
          vec3 shirt = vec3(0.3, 0.32, 0.36) * (0.9 + bn3(p * 300.0) * 0.12);
          shirt *= 1.0 - smoothstep(0.55, 0.8, bf3(p * 7.0)) * 0.12 * uDirt;
          float sb = uBloodShirt * smoothstep(0.5, 0.7, bf3(p * 13.0) + 0.25 - abs(p.x) * 2.5) * step(p.z, 0.02) * smoothstep(1.0, 1.4, p.y);
          shirt = mix(shirt, vec3(0.3, 0.02, 0.02), sb);
          // pants: plaid flannel
          float sx = step(0.5, fract(p.x * 18.0 + p.z * 18.0)), sy = step(0.5, fract(p.y * 18.0));
          vec3 pants = mix(vec3(0.22, 0.25, 0.36), vec3(0.38, 0.14, 0.14), sx * 0.6 + sy * 0.4);
          pants = mix(pants, vec3(0.75, 0.7, 0.55), step(0.94, fract(p.x * 18.0 + p.z * 18.0)) * 0.5 + step(0.94, fract(p.y * 18.0)) * 0.5);
          pants *= 0.85 + bn3(p * 260.0) * 0.2;
          vec3 hair = vec3(0.1, 0.075, 0.06) * (0.7 + bn3(p * vec3(60.0, 400.0, 60.0)) * 0.6);
          vec3 nail = mix(vec3(0.85, 0.66, 0.62), vec3(0.08, 0.05, 0.06), uNailDark);
          vec3 col = skin * wSkin + shirt * wShirt + pants * wPants + hair * wHair + nail * wNail;
          col /= max(wSkin + wShirt + wPants + wHair + wNail, 0.001);
          gSkinW = wSkin;
          diffuseColor.rgb = col;
          if (uDebug > 0.5 && uDebug < 1.5) diffuseColor.rgb = vec3(wShirt, wPants, wSkin);
          if (uDebug > 1.5 && uDebug < 2.5) diffuseColor.rgb = vec3(handBlood, mouthBlood, scr);
          if (uDebug > 2.5 && uDebug < 3.5) diffuseColor.rgb = vec3(splitM, vBellyW, bare);
          if (uDebug > 3.5) diffuseColor.rgb = vec3(fract(p.y * 4.0), fract(p.x * 4.0), 0.0);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.92, mix(0.55, 0.28, uSweat), gSkinW);
        roughnessFactor = mix(roughnessFactor, 0.18, max(gBloodW, gSplitW));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float hgt = gSkinW * (bn3(vRest * 260.0) * 0.6 + bn3(vRest * 90.0) * 0.4) + (1.0 - gSkinW) * bn3(vRest * vec3(500.0, 500.0, 500.0)) * 0.5 + gSplitW * 2.0;
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          float dhx = dFdx(hgt), dhy = dFdy(hgt);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          vec3 nn = abs(det) * normal - grad * 0.0016;
          if (dot(nn, nn) > 1e-20 && abs(det) > 1e-12) normal = normalize(nn);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float gl = uGlow * smoothstep(0.4, 0.9, vBellyW) * smoothstep(0.6, 0.75, bf3(vRest * 16.0 + vec3(0.0, uTime * 0.05, 0.0)));
          totalEmissiveRadiance += vec3(0.25, 0.9, 0.55) * gl * (0.6 + 0.4 * sin(uTime * 2.0 + vRest.x * 40.0));
          totalEmissiveRadiance += vec3(0.25, 0.02, 0.02) * gSplitW * 0.15;
        }`);
  };
  m.customProgramCacheKey = () => 'bengrim-skin';
  return m;
}

// ------------------------------------------------------------------ body
export class Body {
  constructor() {
    this.table = buildBoneTable();
    this.bones = []; this.byName = {};
    for (const e of this.table) {
      const b = new THREE.Bone(); b.name = e.name;
      this.bones.push(b); this.byName[e.name] = b; e.bone = b;
    }
    for (const e of this.table) {
      const b = e.bone;
      if (e.parent) { const pe = this.table.find((x) => x.name === e.parent); pe.bone.add(b); b.position.copy(e.pos).sub(pe.pos); }
      else b.position.copy(e.pos);
    }
    this.restWorld = {};
    for (const e of this.table) this.restWorld[e.name] = e.pos.clone();
    this.idx = (n) => this.table.findIndex((e) => e.name === n);
    this.root = new THREE.Group();
    this.root.name = 'playerBody';
    this.root.add(this.bones[0]);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.u = {
      uSkin: { value: new THREE.Color(0.86, 0.64, 0.53) }, uSkinPale: { value: new THREE.Color(0.8, 0.79, 0.74) }, uPale: { value: 0 }, uVeins: { value: 0 }, uBlackVeins: { value: 0 },
      uBelly: { value: 0 }, uHideHead: { value: 1 }, uBloodHands: { value: 0 }, uBloodMouth: { value: 0 }, uBloodShirt: { value: 0 }, uSplit: { value: 0 }, uGlow: { value: 0 },
      uNailDark: { value: 0 }, uBruise: { value: 0 }, uSweat: { value: 0 }, uDirt: { value: 0.3 }, uHem: { value: 0.86 },
      uBumps: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uArmBump: { value: new THREE.Vector4(0, 0, 0, 0) },
      uScA: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uScB: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uFace: { value: faceTexture() }, uTime: G.uniforms.uTime, uBreathe: { value: 0 }, uDebug: { value: 0 },
    };
    this.mat = skinMaterial(this.u);
    this.buildMeshes();
    G.scene.add(this.root);
    // state
    this.belly = 0; this.yaw = 0; this.gait = 0;
    this.scratches = [];
    this.bumps = [{ t: -1 }, { t: -1 }, { t: -1 }, { t: -1 }];
    this.armBump = { t: -1 };
    this.fing = { L: this.pose('relaxed'), R: this.pose('relaxed') };
    this.handState = { L: { p: V(), F: V(0, -1, 0), N: V(1, 0, 0), w: 0 }, R: { p: V(), F: V(0, -1, 0), N: V(-1, 0, 0), w: 0 } };
    this.mode = 'stand';      // stand | sit | lie | collapsed | custom
    this.override = { L: null, R: null }; // scripted hand targets {p, F, N, pose, w}
    this.crouchK = 0;
    this.visible = true;
    this.hipsDrop = 0;
    this.leanFwd = 0;
    this.coughT = -1;
    this.clutchT = 0;
  }

  buildMeshes() {
    const B = (n) => this.idx(n);
    const P = [];
    const r = this.restWorld;
    const Z = { skin: 0, shirt: 1, pants: 2, hair: 3, nail: 4 };
    const arr = (v) => [v.x, v.y, v.z];
    // torso
    P.push(ell([0, 0.94, 0.0], [0.165, 0.11, 0.115], { bone: B('hips'), zone: Z.pants, k: 0.04 }));
    P.push(ell([0, 1.06, 0.0], [0.14, 0.11, 0.1], { bone: B('spine1'), zone: Z.shirt, k: 0.05 }));
    P.push(ell([0, 1.04, -0.035], [0.125, 0.1, 0.085], { bone: B('spine1'), zone: Z.shirt, k: 0.05 }));
    P.push(ell([0, 1.21, 0.005], [0.155, 0.12, 0.105], { bone: B('spine2'), zone: Z.shirt, k: 0.05 }));
    P.push(ell([0, 1.33, 0.0], [0.17, 0.11, 0.11], { bone: B('chest'), zone: Z.shirt, k: 0.05 }));
    P.push(cap([-0.155, 1.41, 0.005], [0.155, 1.41, 0.005], 0.06, 0.06, { bone: B('chest'), zone: Z.shirt, k: 0.05 }));
    // neck + head
    P.push(cap([0, 1.42, 0.005], [0, 1.56, 0.0], 0.05, 0.047, { bone: B('neck'), zone: Z.skin, k: 0.03 }));
    P.push(ell([0, 1.65, 0.012], [0.082, 0.105, 0.098], { bone: B('head'), zone: Z.skin, k: 0.02 }));
    P.push(ell([0, 1.585, -0.035], [0.062, 0.052, 0.06], { bone: B('head'), zone: Z.skin, k: 0.03 })); // jaw
    P.push(cap([0, 1.66, -0.085], [0, 1.615, -0.103], 0.011, 0.016, { bone: B('head'), zone: Z.skin, k: 0.015 })); // nose
    P.push(ell([0, 1.705, 0.03], [0.09, 0.075, 0.1], { bone: B('head'), zone: Z.hair, k: 0.015 })); // hair cap
    P.push(ell([0, 1.62, 0.07], [0.085, 0.09, 0.05], { bone: B('head'), zone: Z.hair, k: 0.02 }));  // back hair
    for (const s of [-1, 1]) P.push(sph([s * 0.083, 1.63, 0.01], 0.016, { bone: B('head'), zone: Z.skin, k: 0.01 })); // ears
    // sleeves (upper arms) in body mesh
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const sh = r['uarm.' + S], el = r['farm.' + S];
      const mid = sh.clone().lerp(el, 0.58);
      P.push(cap(arr(sh), arr(mid), 0.058, 0.053, { bone: B('uarm.' + S), zone: Z.shirt, k: 0.04 }));
      // legs
      const hp = r['thigh.' + S], kn = r['shin.' + S], an = r['foot.' + S], to = r['toe.' + S];
      P.push(cap(arr(hp), arr(kn), 0.078, 0.056, { bone: B('thigh.' + S), zone: Z.pants, k: 0.04 }));
      P.push(cap(arr(kn), [an.x, an.y + 0.05, an.z], 0.054, 0.044, { bone: B('shin.' + S), zone: Z.pants, k: 0.03 }));
      P.push(cap([an.x, an.y + 0.06, an.z], [an.x, an.y + 0.01, an.z + 0.01], 0.038, 0.036, { bone: B('foot.' + S), zone: Z.skin, k: 0.02 }));
      P.push(cap([an.x, an.y - 0.035, an.z + 0.035], [to.x, to.y, to.z + 0.02], 0.039, 0.033, { bone: B('foot.' + S), zone: Z.skin, k: 0.025 }));
      for (let t = 0; t < 5; t++) {
        const tz = to.z - 0.02 - (t === 0 ? 0.012 : 0), tx = to.x - s * 0.028 + s * t * 0.014;
        P.push(cap([tx, 0.02, to.z + 0.01], [tx, 0.014, tz - 0.012], t === 0 ? 0.0115 : 0.008, t === 0 ? 0.01 : 0.0065, { bone: B('toe.' + S), zone: Z.skin, k: 0.008 }));
      }
    }
    const bodyGeo = meshPrims(P, { cell: 0.011, weightK: 0.018 });
    // belly weights
    const pos = bodyGeo.attributes.position, n = pos.count;
    const bw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const e = (x / 0.16) ** 2 + ((y - 1.03) / 0.16) ** 2 + ((z + 0.05) / 0.16) ** 2;
      const front = smoothstep(0.05, -0.06, z);
      bw[i] = clamp(1 - e, 0, 1) ** 0.7 * front;
    }
    bodyGeo.setAttribute('aBelly', new THREE.BufferAttribute(bw, 1));
    this.bodyMesh = new THREE.SkinnedMesh(bodyGeo, this.mat);

    // arms (forearm + hand) at high resolution
    const A = [];
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const sh = r['uarm.' + S], el = r['farm.' + S], w = r['hand.' + S];
      const inSleeve = sh.clone().lerp(el, 0.35);
      A.push(cap(arr(inSleeve), arr(el), 0.044, 0.04, { bone: B('uarm.' + S), zone: Z.skin, k: 0.02 }));
      A.push(cap(arr(el), [w.x, w.y + 0.012, w.z], 0.038, 0.026, { bone: B('farm.' + S), zone: Z.skin, k: 0.02 }));
      A.push(ell([el.x + s * 0.004, el.y - 0.07, el.z - 0.006], [0.036, 0.075, 0.034], { bone: B('farm.' + S), zone: Z.skin, k: 0.02 }));
      // wrist + palm
      A.push(ell([w.x, w.y - 0.006, w.z], [0.017, 0.022, 0.028], { bone: B('hand.' + S), zone: Z.skin, k: 0.012 }));
      A.push(rbox([w.x + s * 0.001, w.y - 0.052, w.z - 0.001], [0.0115, 0.041, 0.036], 0.01, { bone: B('hand.' + S), zone: Z.skin, k: 0.01 }));
      A.push(ell([w.x - s * 0.006, w.y - 0.045, w.z - 0.022], [0.012, 0.028, 0.016], { bone: B('thumb1.' + S), zone: Z.skin, k: 0.012 })); // thenar
      // thumb
      const t1 = r['thumb1.' + S], t2 = r['thumb2.' + S], t3 = r['thumb3.' + S];
      const tip = t3.clone().add(V(-s * 0.002, -0.022, -0.004));
      A.push(cap(arr(t1), arr(t2), 0.013, 0.0115, { bone: B('thumb1.' + S), zone: Z.skin, k: 0.01 }));
      A.push(cap(arr(t2), arr(t3), 0.0105, 0.0098, { bone: B('thumb2.' + S), zone: Z.skin, k: 0.006 }));
      A.push(cap(arr(t3), arr(tip), 0.0096, 0.0088, { bone: B('thumb3.' + S), zone: Z.skin, k: 0.005 }));
      A.push(ell([tip.x + s * 0.004, tip.y + 0.008, tip.z - 0.006], [0.004, 0.007, 0.006], { bone: B('thumb3.' + S), zone: Z.nail, k: 0.002, rot: [0, 0, 0] }));
      for (const [fn, fz, len, rad] of FINGERS) {
        const j1 = r[fn + '1.' + S], j2 = r[fn + '2.' + S], j3 = r[fn + '3.' + S];
        const tip2 = j3.clone().add(V(0, -len[2], 0));
        A.push(cap(arr(j1), arr(j2), rad, rad * 0.92, { bone: B(fn + '1.' + S), zone: Z.skin, k: 0.006 }));
        A.push(cap(arr(j2), arr(j3), rad * 0.9, rad * 0.84, { bone: B(fn + '2.' + S), zone: Z.skin, k: 0.004 }));
        A.push(cap(arr(j3), arr(tip2), rad * 0.82, rad * 0.72, { bone: B(fn + '3.' + S), zone: Z.skin, k: 0.004 }));
        // knuckle bump + nail on the back of the hand (+s*x)
        A.push(sph([j1.x + s * 0.006, j1.y + 0.004, j1.z], rad * 0.95, { bone: B('hand.' + S), zone: Z.skin, k: 0.008 }));
        A.push(ell([tip2.x + s * rad * 0.62, tip2.y + 0.007, tip2.z], [0.0022, 0.0075, rad * 0.62], { bone: B(fn + '3.' + S), zone: Z.nail, k: 0.0015 }));
      }
    }
    const armGeo = meshPrims(A, { cell: 0.0042, weightK: 0.0065, pad: 0.015 });
    const an = armGeo.attributes.position.count;
    armGeo.setAttribute('aBelly', new THREE.BufferAttribute(new Float32Array(an), 1));
    this.armMesh = new THREE.SkinnedMesh(armGeo, this.mat);
    for (const m of [this.bodyMesh, this.armMesh]) {
      m.bind(this.skeleton);
      m.castShadow = true; m.receiveShadow = true;
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.restDirs = {};
  }

  // finger pose presets: curls per finger [thumb, index, middle, ring, pinky] (0..1), spread
  pose(name) {
    const P = {
      relaxed: { c: [0.25, 0.28, 0.33, 0.38, 0.42], s: 0.1, t: 0.2 },
      open: { c: [0.05, 0.05, 0.06, 0.07, 0.08], s: 0.25, t: 0.05 },
      grip: { c: [0.55, 0.62, 0.66, 0.7, 0.74], s: 0.05, t: 0.6 },
      gripLarge: { c: [0.3, 0.36, 0.4, 0.44, 0.48], s: 0.15, t: 0.45 },
      pinch: { c: [0.55, 0.5, 0.75, 0.85, 0.9], s: 0.0, t: 0.7 },
      fist: { c: [0.8, 0.95, 1, 1, 1], s: 0, t: 0.8 },
      point: { c: [0.6, 0.0, 0.95, 1, 1], s: 0, t: 0.6 },
      claw: { c: [0.4, 0.55, 0.6, 0.62, 0.65], s: 0.35, t: 0.3, claw: true },
      spread: { c: [0.02, 0.02, 0.02, 0.03, 0.04], s: 0.55, t: 0.0 },
      mouse: { c: [0.35, 0.22, 0.25, 0.45, 0.55], s: 0.05, t: 0.4 },
      type: { c: [0.3, 0.35, 0.4, 0.42, 0.45], s: 0.12, t: 0.3 },
      pet: { c: [0.15, 0.12, 0.12, 0.14, 0.16], s: 0.12, t: 0.15 },
    }[name] || { c: [0.25, 0.3, 0.33, 0.38, 0.42], s: 0.1, t: 0.2 };
    return { c: P.c.slice(), s: P.s, t: P.t, claw: !!P.claw };
  }

  // ---------------------------------------------------------- mutation & events
  setMutation(o) {
    for (const [k, v] of Object.entries(o)) {
      const key = 'u' + k[0].toUpperCase() + k.slice(1);
      if (key === 'uBelly') this.belly = v;
      else if (this.u[key]) this.u[key].value = v;
    }
  }
  // a lump crawls across the belly ("strange movements under your skin")
  stomachPulse(strength = 1) {
    const b = this.bumps.find((x) => x.t < 0) || this.bumps[0];
    const a = Math.random() * Math.PI * 2;
    b.t = 0; b.dur = 1.2 + Math.random() * 1.8; b.str = 0.006 + strength * 0.012 + this.belly * 0.02;
    b.from = V(Math.cos(a) * 0.07, 1.03 + Math.sin(a) * 0.05, -0.1); b.to = V(-Math.cos(a) * 0.06, 1.03 - Math.sin(a) * 0.06, -0.1);
  }
  armCrawl(side = 'L', strength = 1) {
    const s = side === 'L' ? -1 : 1;
    const el = this.restWorld['farm.' + (side)], w = this.restWorld['hand.' + side];
    Object.assign(this.armBump, { t: 0, dur: 2.5, str: 0.006 * strength, from: el.clone().lerp(w, 0.85).add(V(0, 0, -0.025)), to: el.clone().lerp(w, 0.15).add(V(0, 0, -0.03)), s });
  }
  addScratch(side = 'R', intensity = 1) {
    // a scratch on the back of the forearm / hand, in rest space
    const s = side === 'L' ? -1 : 1;
    const el = this.restWorld['farm.' + side], w = this.restWorld['hand.' + side];
    const t0 = 0.2 + Math.random() * 0.7;
    const a = el.clone().lerp(w, t0).add(V(s * 0.03, 0, (Math.random() - 0.5) * 0.04));
    const b = a.clone().add(V(s * 0.005, -0.03 - Math.random() * 0.05, (Math.random() - 0.5) * 0.05));
    const k = this.scratches.length % 8;
    this.scratches[k] = { a, b, w: 0.0016 + Math.random() * 0.0012, i: intensity };
    const A = this.u.uScA.value, Bv = this.u.uScB.value;
    A[k].set(a.x, a.y, a.z, intensity); Bv[k].set(b.x, b.y, b.z, this.scratches[k].w);
  }
  cough(blood = false) { this.coughT = 0; this.coughBlood = blood; }

  // ---------------------------------------------------------- per-frame
  update(dt) {
    // animate lumps
    const ub = this.u.uBumps.value;
    this.bumps.forEach((b, i) => {
      if (b.t < 0) { ub[i].w = 0; return; }
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) { b.t = -1; ub[i].w = 0; return; }
      const c = b.from.clone().lerp(b.to, smoothstep(0, 1, p));
      ub[i].set(c.x, c.y, c.z, b.str * Math.sin(Math.PI * p));
    });
    const ab = this.armBump;
    if (ab.t >= 0) {
      ab.t += dt; const p = ab.t / ab.dur;
      if (p >= 1) { ab.t = -1; this.u.uArmBump.value.w = 0; }
      else { const c = ab.from.clone().lerp(ab.to, p); this.u.uArmBump.value.set(c.x, c.y, c.z, ab.str * Math.sin(Math.PI * p)); }
    }
    // smooth belly and breathing
    this.u.uBelly.value = damp(this.u.uBelly.value, this.belly, 1.5, dt);
    this.u.uBreathe.value = Math.sin(G.time * 1.6);
    if (this.coughT >= 0) { this.coughT += dt; if (this.coughT > 1.5) this.coughT = -1; }
  }

  // world-space hand targets for the frame
  handTargets() {
    const pl = G.player;
    const cam = G.camera;
    const out = { L: null, R: null };
    const camPt = (x, y, z) => V(x, y, z).applyMatrix4(cam.matrixWorld);
    const camDir = (x, y, z) => V(x, y, z).applyQuaternion(cam.quaternion).normalize();
    const camOff = (x, y, z) => V(x, y, z).applyQuaternion(cam.quaternion);
    const inv = pl.inv;
    const it = pl.interact;
    const t = G.time;
    // right hand
    const catT = G.cat && (pl.carrying === G.cat || G.cat.petting) ? G.cat.handTargets() : null;
    if (this.override.R) out.R = this.override.R;
    else if (catT && catT.R) { out.R = catT.R; if (catT.L) out.L = catT.L; }
    else if (inv.hand) {
      const hp = pl.holdPivot.getWorldPosition(V());
      const item = inv.hand;
      const two = item.def.twoHands || ['catBox', 'pizza', 'cereal', 'eggs', 'pan', 'plate'].includes(item.type);
      const a = pl.action && pl.action.spec.anim;
      if (two) {
        out.R = { p: hp.clone().add(camOff(0.11, -0.02, 0.04)), F: camDir(-0.2, 0.3, -1), N: camDir(-1, 0.1, 0.1), pose: 'gripLarge', w: 1 };
        out.L = { p: hp.clone().add(camOff(-0.11, -0.02, 0.04)), F: camDir(0.2, 0.3, -1), N: camDir(1, 0.1, 0.1), pose: 'gripLarge', w: 1 };
        if (item.def.twoHands) { out.R.p = hp.clone().add(camOff(0.17, 0.14, 0.02)); out.L.p = hp.clone().add(camOff(-0.17, 0.14, 0.02)); out.R.pose = out.L.pose = 'fist'; }
      } else {
        const g = gripFor(item);
        const F = camDir(...g.F), N = camDir(...g.N);
        const wrist = hp.clone().addScaledVector(F, -0.055).addScaledVector(N, -(g.r + 0.012));
        out.R = { p: wrist, F, N, pose: g.pose, w: 1, grip: g, item };
        if (a === 'rip' || a === 'open' || a === 'takeFrom' || a === 'crack') {
          out.L = { p: hp.clone().add(camOff(-0.07, -0.01, 0.03)), F: camDir(0.35, 0.3, -1), N: camDir(1, 0.1, 0.2), pose: a === 'rip' ? 'pinch' : 'gripLarge', w: 1 };
          if (a === 'rip' && pl.action) { const pr = pl.action.t / pl.action.spec.dur; if (pr > 0.58) out.L.p.add(camOff(-0.05 * smoothstep(0.58, 0.7, pr), 0.02, 0)); }
        }
      }
    } else if (it.drag) {
      const ip = it.drag.item.mesh.position.clone().add(it.drag.offset);
      out.R = { p: ip.clone().add(camOff(0.0, -0.02, 0.06)), F: camDir(-0.1, -0.2, -1), N: camDir(-0.6, -0.6, 0), pose: 'grip', w: 1 };
      if (it.drag.item.body.mass > 1.5) out.L = { p: ip.clone().add(camOff(-0.12, -0.02, 0.06)), F: camDir(0.1, -0.2, -1), N: camDir(0.6, -0.6, 0), pose: 'grip', w: 1 };
    } else if (it.idrag && pl.reachPoint) {
      out.R = { p: pl.reachPoint.clone().add(camOff(0.02, -0.03, 0.05)), F: camDir(0, -0.3, -1), N: camDir(-0.7, -0.4, 0), pose: 'grip', w: 1 };
      if (it.idrag.carryTwoHands) out.L = { p: pl.reachPoint.clone().add(camOff(-0.1, -0.03, 0.05)), F: camDir(0, -0.3, -1), N: camDir(0.7, -0.4, 0), pose: 'grip', w: 1 };
    } else if (pl.reachEvt) {
      const k = Math.sin(Math.PI * clamp(pl.reachEvt.t / 0.55));
      const p = pl.reachEvt.point;
      if (p.distanceTo(cam.position) < 1.3) out.R = { p: p.clone().add(camOff(0, -0.02, 0.06)), F: camDir(0, 0, -1), N: camDir(-0.5, -0.8, 0), pose: pl.reachEvt.kind === 'press' ? 'point' : 'grip', w: k };
    }
    if (this.override.L) out.L = this.override.L;
    else if (catT && catT.L) out.L = catT.L;
    // coughing: left hand to the mouth
    if (this.coughT >= 0 && !out.L) {
      const k = Math.sin(Math.PI * clamp(this.coughT / 1.4));
      out.L = { p: camPt(-0.01, -0.07, -0.1), F: camDir(0.8, 0.5, -0.2), N: camDir(0, 0, 1), pose: 'relaxed', w: k };
    }
    // when looking down at the belly, a hand drifts to it
    if (!out.L && pl.ctrl.pitch < -0.75 && this.belly > 0.15 && G.state === 'play') {
      const bp = this.root.localToWorld(V(-0.04, 1.03, -0.12 - this.belly * 0.2));
      out.L = { p: bp, F: V(0.3, -0.3, 0).applyQuaternion(this.root.quaternion).normalize(), N: V(0, 0, 1).applyQuaternion(this.root.quaternion), pose: 'open', w: smoothstep(-0.75, -1.05, pl.ctrl.pitch) };
    }
    return out;
  }

  lateUpdate(dt) {
    const pl = G.player;
    const c = pl.ctrl;
    const cam = G.camera;
    const vis = this.visible && (G.state !== 'menu' || this.showInMenu);
    this.root.visible = vis;
    if (!vis) return;
    // ---- root placement
    const ip = c.body.interpolatedPosition;
    const moving = c.speed > 0.2;
    const diff = wrapAngle(c.yaw - this.yaw);
    if (moving || Math.abs(diff) > 0.9 || this.mode !== 'stand') this.yaw = dampAngle(this.yaw, c.yaw, moving ? 8 : 5, dt);
    this.crouchK = damp(this.crouchK, c.crouched ? 1 : 0, 8, dt);
    if (this.mode === 'stand') {
      this.root.position.set(ip.x, ip.y, ip.z);
      this.root.rotation.set(0, this.yaw, 0);
    }
    this.root.updateMatrixWorld(true);
    const B = this.byName;
    // reset local rotations
    for (const b of this.bones) b.quaternion.identity();
    B.hips.position.copy(this.table[0].pos);
    if (this.mode === 'stand') {
      // ---- spine follows the view
      const pitch = c.pitch;
      const look = clamp(-pitch, -0.6, 1.4);
      const twist = clamp(diff, -1.2, 1.2);
      const cough = this.coughT >= 0 ? Math.sin(Math.PI * clamp(this.coughT / 1.4)) * (0.25 + 0.1 * Math.sin(this.coughT * 25)) : 0;
      const fwd = look * 0.22 + this.crouchK * 0.25 + cough + pl.lean * 0.8;
      const rotX = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), -a));
      const rotY = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(0, 1, 0), a));
      rotX(B.spine1, fwd * 0.3); rotX(B.spine2, fwd * 0.35); rotX(B.chest, fwd * 0.35 - this.belly * 0.08);
      rotY(B.spine2, twist * 0.25); rotY(B.chest, twist * 0.3); rotY(B.neck, twist * 0.2); rotY(B.head, twist * 0.25);
      rotX(B.neck, look * 0.3); rotX(B.head, look * 0.35);
      // breathing in the chest
      B.chest.quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), Math.sin(G.time * 1.6) * 0.01));
      // ---- legs: gait + crouch with 2-bone IK to keep the feet planted
      const hipsDrop = this.crouchK * 0.48 + this.belly * 0.02;
      B.hips.position.y = this.table[0].pos.y - hipsDrop;
      B.hips.position.z = this.crouchK * 0.08;
      B.hips.quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), -this.crouchK * 0.15));
      this.root.updateMatrixWorld(true);
      const ph = c.stepPhase;
      const speed = clamp(c.speed / 3, 0, 1);
      const localVel = V(c.body.velocity.x, 0, c.body.velocity.z).applyQuaternion(_q2.setFromAxisAngle(V(0, 1, 0), -this.yaw));
      for (const [S, s, off] of [['L', -1, 0], ['R', 1, Math.PI]]) {
        const p = ph + off;
        const stride = 0.16 + speed * 0.22;
        const sw = Math.sin(p);
        const lift = Math.max(0, Math.cos(p)) * (0.06 + speed * 0.05) * (c.speed > 0.2 ? 1 : 0);
        const dir = localVel.lengthSq() > 0.01 ? localVel.clone().normalize() : V(0, 0, -1);
        const fl = V(s * (0.11 + this.crouchK * 0.05), 0.085 + lift, 0.02).addScaledVector(dir, sw * stride * (c.speed > 0.2 ? 1 : 0));
        if (this.crouchK > 0.01) fl.z -= this.crouchK * 0.15;
        const footW = this.root.localToWorld(fl.clone());
        const knPole = this.root.localToWorld(V(s * 0.12, 0.5, -0.5)).sub(this.root.getWorldPosition(V()));
        this.ik2(B['thigh.' + S], B['shin.' + S], B['foot.' + S], footW, knPole.normalize(), V(0, 0, 1), 'leg');
        // keep the foot flat
        const want = this.root.getWorldQuaternion(new THREE.Quaternion());
        const parentQ = B['shin.' + S].getWorldQuaternion(new THREE.Quaternion());
        B['foot.' + S].quaternion.copy(parentQ.invert().multiply(want));
        if (lift > 0.02) B['foot.' + S].quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), lift * 3));
      }
    } else if (this.mode === 'sit') {
      // seated: thighs forward, shins down
      const rx = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), a));
      B.hips.position.y = this.table[0].pos.y - 0.47; B.hips.position.z = 0.0;
      for (const S of ['L', 'R']) { rx(B['thigh.' + S], 1.45); rx(B['shin.' + S], -1.45); }
      const look = clamp(-c.pitch, -0.6, 1.2);
      rx(B.spine2, -0.05 - look * 0.1); rx(B.neck, -look * 0.3); rx(B.head, -look * 0.35);
    } else if (this.mode === 'custom' && this.customPose) {
      this.customPose(this, dt);
    }
    this.root.updateMatrixWorld(true);
    // ---- align the head under the camera (stand/sit)
    if (this.mode === 'stand' || this.mode === 'sit') {
      const eye = B.head.localToWorld(V(0, 0.07, -0.085));
      const target = cam.position.clone().add(V(0, 0, 0.0).applyQuaternion(cam.quaternion));
      const off = target.sub(eye);
      this.root.position.x += off.x; this.root.position.z += off.z;
      if (this.mode === 'sit') this.root.position.y += off.y;
      this.root.updateMatrixWorld(true);
    }
    // ---- arms
    const T = this.mode === 'stand' || this.mode === 'sit' ? this.handTargets() : { L: this.override.L, R: this.override.R };
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const tgt = T[S];
      const st = this.handState[S];
      const rest = this.restArm(S, s);
      const w = tgt ? clamp(tgt.w ?? 1, 0, 1) : 0;
      st.w = damp(st.w, w, 10, dt);
      const goal = tgt || rest;
      // blend target with rest by weight
      const P = rest.p.clone().lerp(goal.p, st.w);
      const F = rest.F.clone().lerp(goal.F, st.w).normalize();
      const N = rest.N.clone().lerp(goal.N, st.w).normalize();
      if (!st.init) { st.p.copy(P); st.F.copy(F); st.N.copy(N); st.init = true; }
      st.p.lerp(P, 1 - Math.exp(-22 * dt)); st.F.lerp(F, 1 - Math.exp(-18 * dt)).normalize(); st.N.lerp(N, 1 - Math.exp(-18 * dt)).normalize();
      // tremble
      const tr = (pl.trembleAmount || 0) * 0.006;
      const tp = st.p.clone().add(V(snoise1(G.time * 11, s * 3) * tr, snoise1(G.time * 12, s * 5) * tr, snoise1(G.time * 10, s * 7) * tr));
      const sh = B['uarm.' + S].getWorldPosition(V());
      const pole = this.root.localToWorld(V(s * 0.5, -0.4, 0.45)).sub(this.root.getWorldPosition(V())).normalize();
      this.ik2(B['uarm.' + S], B['farm.' + S], B['hand.' + S], tp, pole, V(0, 0, -1), 'arm', st.N);
      this.orientHand(S, s, st.F, st.N);
      // fingers
      const pose = this.pose((tgt && tgt.pose) || (G.player.trembleAmount > 0.6 ? 'claw' : 'relaxed'));
      const f = this.fing[S];
      for (let i = 0; i < 5; i++) f.c[i] = damp(f.c[i], pose.c[i], 12, dt);
      f.s = damp(f.s, pose.s, 10, dt); f.t = damp(f.t, pose.t, 10, dt);
      this.applyFingers(S, s, f, pose.claw);
      if (S === 'R' && tgt && tgt.grip && tgt.item && !tgt.item.dead && G.player.inv.hand === tgt.item) this.gluePalm(tgt);
    }
    this.root.updateMatrixWorld(true);
  }

  // keep a single-handed item in the palm whatever the IK achieved
  gluePalm(tgt) {
    const hand = this.byName['hand.R'];
    hand.updateMatrixWorld(true);
    const e = hand.matrixWorld.elements;
    const fy = V(-e[4], -e[5], -e[6]).normalize();   // local -y: fingers
    const nx = V(-e[0], -e[1], -e[2]).normalize();   // local -x: palm normal (right hand)
    const palm = hand.getWorldPosition(V()).addScaledVector(fy, 0.055).addScaledVector(nx, tgt.grip.r + 0.012);
    const pivot = G.player.holdPivot;
    pivot.updateMatrixWorld(true);
    const local = pivot.worldToLocal(palm);
    const m = tgt.item.mesh;
    m.position.lerp(local, 0.85);
  }

  restArm(S, s) {
    // hands hang by the sides, slightly forward; hanging lower when tired
    const p = this.root.localToWorld(V(s * 0.26, 0.86 - this.crouchK * 0.42, -0.04 - this.belly * 0.06));
    const F = V(0, -1, -0.1).applyQuaternion(this.root.quaternion).normalize();
    const N = V(-s, 0, 0).applyQuaternion(this.root.quaternion).normalize();
    return { p, F, N };
  }

  // two-bone IK. up/low/end bones; target world pos; pole world dir; restBend: rest bend dir
  ik2(up, low, end, target, pole, restBend, kind, palmN = null) {
    const S = up.getWorldPosition(_a);
    const restS = this.restWorld[up.name], restE = this.restWorld[low.name], restW = this.restWorld[end.name];
    const a = restS.distanceTo(restE), b = restE.distanceTo(restW);
    const toT = _b.copy(target).sub(S);
    let d = toT.length();
    const dir = toT.clone().normalize();
    d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const alpha = Math.acos(cosA);
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    perp.normalize();
    const E = S.clone().addScaledVector(dir, Math.cos(alpha) * a).addScaledVector(perp, Math.sin(alpha) * a);
    const W = S.clone().addScaledVector(dir, d);
    // rest frame vectors (world == bone rest frame since rest rotations are identity, rotated by root)
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const rUp = restE.clone().sub(restS).normalize().applyQuaternion(rootQ);
    const rLow = restW.clone().sub(restE).normalize().applyQuaternion(rootQ);
    const rBend = restBend.clone().applyQuaternion(rootQ);
    const bend = perp.clone().negate();
    // upper
    this.aimBone(up, rUp, rBend, E.clone().sub(S).normalize(), bend);
    up.updateMatrixWorld(true);
    // lower: secondary from palm normal (forearm twist) or bend
    let sec = bend, rSec = rBend;
    if (palmN && kind === 'arm') {
      const s = up.name.endsWith('.L') ? -1 : 1;
      rSec = V(-s, 0, 0).applyQuaternion(rootQ);
      sec = palmN;
    }
    this.aimBone(low, rLow, rSec, W.clone().sub(E).normalize(), sec);
    low.updateMatrixWorld(true);
  }

  aimBone(bone, restPrim, restSec, prim, sec) {
    const qT = basisQ(prim, sec, new THREE.Quaternion());
    const qR = basisQ(restPrim, restSec, new THREE.Quaternion());
    // world rest quaternion of this bone is root rotation (identity locals); target world = qT * qR^-1 * rootQ
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const worldQ = qT.multiply(qR.invert()).multiply(rootQ);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
  }

  orientHand(S, s, F, N) {
    const hand = this.byName['hand.' + S];
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const rF = V(0, -1, 0).applyQuaternion(rootQ), rN = V(-s, 0, 0).applyQuaternion(rootQ);
    this.aimBone(hand, rF, rN, F, N);
    // limit wrist bend relative to forearm by slerping toward the forearm's frame
    const parentQ = hand.parent.getWorldQuaternion(new THREE.Quaternion());
    const local = hand.quaternion.clone();
    const ang = 2 * Math.acos(clamp(Math.abs(local.w), 0, 1));
    if (ang > 1.2) hand.quaternion.slerp(new THREE.Quaternion(), 1 - 1.2 / ang);
    hand.updateMatrixWorld(true);
  }

  applyFingers(S, s, f, claw) {
    const B = this.byName;
    const curlAxis = V(0, 0, 1);
    const names = ['index', 'middle', 'ring', 'pinky'];
    names.forEach((fn, i) => {
      const c = f.c[i + 1];
      const spread = (i - 1.5) * f.s * 0.18;
      const k = -s; // right hand curls with negative z rotation
      const q1 = new THREE.Quaternion().setFromAxisAngle(curlAxis, k * c * 1.45).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), spread * s));
      B[fn + '1.' + S].quaternion.copy(q1);
      B[fn + '2.' + S].quaternion.setFromAxisAngle(curlAxis, k * c * (claw ? 0.6 : 1.55));
      B[fn + '3.' + S].quaternion.setFromAxisAngle(curlAxis, k * c * (claw ? 1.6 : 1.0));
    });
    const t = f.c[0], opp = f.t;
    const tAxis = V(0.3 * s, 0.2, 1).normalize();
    B['thumb1.' + S].quaternion.setFromAxisAngle(V(0, 1, 0), -s * opp * 0.6).multiply(new THREE.Quaternion().setFromAxisAngle(tAxis, -s * t * 0.4));
    B['thumb2.' + S].quaternion.setFromAxisAngle(tAxis, -s * t * 0.7);
    B['thumb3.' + S].quaternion.setFromAxisAngle(tAxis, -s * t * 0.9);
  }

  // eye point (for camera overrides in cutscenes)
  eyeWorld(out = new THREE.Vector3()) { return this.byName.head.localToWorld(out.set(0, 0.07, -0.085)); }
  headQuat(out = new THREE.Quaternion()) { return this.byName.head.getWorldQuaternion(out); }
}

// how a single-hand item sits in the palm: radius from palm, finger pose, finger dir F and palm normal N in camera space
function gripFor(item) {
  if (item.def.grip) return item.def.grip;
  const sh = item.def.shape;
  let r = 0.03;
  if (sh.type === 'cyl') r = sh.r; else if (sh.type === 'sphere') r = sh.r; else if (sh.type === 'box') r = Math.min(sh.size[0], sh.size[2]) / 2;
  const small = r < 0.03;
  return { r, pose: small ? 'pinch' : r > 0.05 ? 'gripLarge' : 'grip', F: [-0.45, 0.05, -1], N: [-1, 0.15, 0.25] };
}

function basisQ(prim, sec, out) {
  const y = prim.clone().normalize();
  const z = sec.clone().sub(y.clone().multiplyScalar(sec.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}
