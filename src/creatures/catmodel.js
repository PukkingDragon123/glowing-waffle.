// Mochi: SDF-sculpted cat with a skeleton, fur shells, tabby coat, slit-pupil
// eyes with eyeshine, whiskers, and a procedural pose/gait system.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { meshPrims, sph, cap, ell } from '../gfx/sdf.js';
import { clamp, damp, lerp, smoothstep, snoise1, TAU } from '../core/util.js';
import { makeCanvas, toTexture } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

function boneTable() {
  const T = [];
  const add = (name, parent, p) => T.push({ name, parent, pos: V(...p) });
  add('hips', null, [0, 0.215, 0.115]);
  add('spine1', 'hips', [0, 0.225, 0.04]);
  add('spine2', 'spine1', [0, 0.228, -0.035]);
  add('chest', 'spine2', [0, 0.222, -0.1]);
  add('neck', 'chest', [0, 0.25, -0.15]);
  add('head', 'neck', [0, 0.295, -0.195]);
  add('jaw', 'head', [0, 0.282, -0.215]);
  add('ear.L', 'head', [-0.028, 0.335, -0.2]); add('ear.R', 'head', [0.028, 0.335, -0.2]);
  let tp = [0, 0.225, 0.165];
  add('tail1', 'hips', tp);
  for (let i = 2; i <= 7; i++) { tp = [0, tp[1] - 0.004 * (i < 4 ? 1 : -0.5), tp[2] + 0.043]; add('tail' + i, 'tail' + (i - 1), tp); }
  for (const [S, s] of [['L', -1], ['R', 1]]) {
    add('fsh.' + S, 'chest', [s * 0.042, 0.2, -0.105]);
    add('felb.' + S, 'fsh.' + S, [s * 0.046, 0.125, -0.095]);
    add('fwr.' + S, 'felb.' + S, [s * 0.046, 0.04, -0.105]);
    add('fpaw.' + S, 'fwr.' + S, [s * 0.046, 0.012, -0.118]);
    add('hhip.' + S, 'hips', [s * 0.047, 0.2, 0.115]);
    add('hkn.' + S, 'hhip.' + S, [s * 0.052, 0.13, 0.075]);
    add('hhock.' + S, 'hkn.' + S, [s * 0.052, 0.058, 0.14]);
    add('hpaw.' + S, 'hhock.' + S, [s * 0.052, 0.012, 0.125]);
  }
  return T;
}

function eyeTexture() {
  const { c, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, '#d8e050'); g.addColorStop(0.55, '#a8c040'); g.addColorStop(0.85, '#7a8a2a'); g.addColorStop(1, '#3a3a18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 40; i++) { const a = Math.random() * TAU; ctx.strokeStyle = `rgba(90,110,30,${Math.random() * 0.5})`; ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); ctx.stroke(); }
  const t = toTexture(c, { nearest: false, repeat: false });
  return t;
}

const FUR_NOISE = /* glsl */`
float ch(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 coat(vec3 p, float shellK) {
  // brown mackerel tabby: agouti-ticked base, soft broken stripes, white bib/paws/muzzle
  vec3 base = vec3(0.47, 0.38, 0.29);
  vec3 dark = vec3(0.13, 0.1, 0.075);
  vec3 white = vec3(0.88, 0.86, 0.82);
  float n = cn(p * 18.0) * 0.6 + cn(p * 55.0) * 0.4;
  float tick = cn(p * 900.0);
  float band;
  if (p.z > 0.17) band = fract(p.z * 19.0 + n * 0.35);                       // tail rings
  else if (p.y < 0.14) band = fract(p.y * 30.0 + n * 0.45);                  // leg bars
  else band = fract(p.z * 23.0 + sin(p.y * 35.0 + p.x * 20.0) * 0.3 + n * 0.7); // mackerel
  if (p.y > 0.24 && p.z < -0.17) band = fract(abs(p.x) * 55.0 + p.z * 25.0 + n * 0.8); // head lines
  float stripes = smoothstep(0.55, 0.7, band) * (1.0 - smoothstep(0.86, 0.98, band));
  stripes *= smoothstep(0.25, 0.55, cn(p * 9.0 + 4.0) + 0.3);                // broken stripes
  float spine = smoothstep(0.035, 0.0, abs(p.x)) * step(0.215, p.y) * step(p.z, 0.17);
  vec3 col = mix(base, dark, clamp(stripes * 0.75 + spine * 0.55, 0.0, 1.0));
  // agouti ticking: each strand banded light/dark
  col *= mix(0.78, 1.18, tick) * (0.9 + n * 0.2);
  float wm = smoothstep(0.165, 0.12, p.y) * step(p.z, 0.02) * smoothstep(0.055, 0.02, abs(p.x))
           + smoothstep(0.035, 0.02, p.y)
           + step(p.z, -0.212) * smoothstep(0.292, 0.274, p.y) * smoothstep(0.032, 0.016, abs(p.x));
  col = mix(col, white * mix(0.85, 1.05, tick), clamp(wm, 0.0, 1.0));
  col *= mix(0.5, 1.1, shellK);
  return col;
}`;

function furMaterial(u, shell, N) {
  const k = shell / N;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFurLen = u.uFurLen; sh.uniforms.uPuff = u.uPuff; sh.uniforms.uTime = G.uniforms.uTime; sh.uniforms.uWet = u.uWet; sh.uniforms.uBlood = u.uBlood;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aRest; attribute vec4 aZoneA; uniform float uFurLen; uniform float uPuff; uniform float uTime;
        varying vec3 vRest; varying float vFurMask;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = aRest;
        float furScale = aZoneA.x * 1.0 + aZoneA.y * 0.5 + aZoneA.z * 0.0 + aZoneA.w * 1.35;
        float puff = 1.0 + uPuff * (0.6 + aZoneA.w * 0.9);
        // clear the eyes and nose bridge, keep the face fur short
        float eyeD = min(length(aRest - vec3(-0.021, 0.303, -0.236)), length(aRest - vec3(0.021, 0.303, -0.236)));
        furScale *= smoothstep(0.011, 0.024, eyeD);
        furScale *= mix(1.0, 0.45, smoothstep(-0.2, -0.235, aRest.z) * step(0.265, aRest.y));
        vFurMask = furScale;
        transformed += objectNormal * uFurLen * furScale * puff * ${k.toFixed(4)};
        transformed.y -= ${(k * k).toFixed(4)} * uFurLen * 0.35;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; varying float vFurMask; uniform float uWet; uniform float uBlood;
        ${FUR_NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${shell > 0 ? `
        float strand = cn(vRest * 380.0) * 0.6 + cn(vRest * 950.0) * 0.4;
        if (vFurMask < 0.05 || strand < ${k.toFixed(4)} * 0.95 + 0.04) discard;` : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cc = coat(vRest, ${Math.min(1, k + 0.15).toFixed(4)});
        // pink nose / inner ears / pads on the base shell
        ${shell === 0 ? `
        cc = mix(cc, vec3(0.82, 0.5, 0.5), smoothstep(0.012, 0.005, length(vRest - vec3(0.0, 0.285, -0.253))));
        cc = mix(cc, vec3(0.75, 0.48, 0.48), step(vRest.y, 0.008) * 0.7);` : ''}
        cc = mix(cc, vec3(0.35, 0.02, 0.02), uBlood * smoothstep(0.6, 0.8, cn(vRest * 30.0)));
        diffuseColor.rgb = cc;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${shell > 4 ? `{ float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))); totalEmissiveRadiance += diffuseColor.rgb * pow(rim, 3.0) * 0.12; }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.5, uWet);`);
  };
  m.customProgramCacheKey = () => 'catfur' + shell;
  return m;
}

export class CatModel {
  constructor() {
    this.T = boneTable();
    this.bones = []; this.by = {};
    for (const e of this.T) { const b = new THREE.Bone(); b.name = e.name; this.bones.push(b); this.by[e.name] = b; e.bone = b; }
    for (const e of this.T) { if (e.parent) { const pe = this.T.find((x) => x.name === e.parent); pe.bone.add(e.bone); e.bone.position.copy(e.pos).sub(pe.pos); } else e.bone.position.copy(e.pos); e.local = e.bone.position.clone(); }
    this.rest = {}; for (const e of this.T) this.rest[e.name] = e.pos.clone();
    this.idx = (n) => this.T.findIndex((e) => e.name === n);
    this.root = new THREE.Group(); this.root.name = 'cat';
    this.root.add(this.bones[0]);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.u = { uFurLen: { value: 0.016 }, uPuff: { value: 0 }, uWet: { value: 0 }, uBlood: { value: 0 } };
    this.build();
    G.scene.add(this.root);
    // pose state (smoothed)
    this.p = this.defaultPose();
    this.t = this.defaultPose();
    this.gaitPhase = 0;
    this.speed = 0;
    this.blink = 0; this.blinkT = 2;
    this.lookTarget = null; this.headW = 0;
    this.paws = null;
  }

  build() {
    const B = (n) => this.idx(n);
    const r = this.rest;
    const a = (v) => [v.x, v.y, v.z];
    const Z = { fur: 0, short: 1, none: 2, tail: 3 };
    const P = [];
    // torso
    P.push(ell([0, 0.2, -0.085], [0.06, 0.077, 0.088], { bone: B('chest'), zone: Z.fur, k: 0.045 }));
    P.push(ell([0, 0.19, 0.015], [0.058, 0.07, 0.098], { bone: B('spine1'), zone: Z.fur, k: 0.05 }));
    P.push(ell([0, 0.155, 0.05], [0.042, 0.03, 0.06], { bone: B('spine1'), zone: Z.fur, k: 0.04 })); // belly pouch
    P.push(ell([0, 0.21, -0.03], [0.054, 0.06, 0.06], { bone: B('spine2'), zone: Z.fur, k: 0.05 }));
    P.push(ell([0, 0.2, 0.105], [0.062, 0.072, 0.074], { bone: B('hips'), zone: Z.fur, k: 0.045 }));
    // neck + head
    P.push(cap([0, 0.235, -0.135], [0, 0.275, -0.185], 0.038, 0.034, { bone: B('neck'), zone: Z.fur, k: 0.03 }));
    P.push(sph([0, 0.3, -0.2], 0.046, { bone: B('head'), zone: Z.fur, k: 0.02 }));
    P.push(ell([0, 0.288, -0.207], [0.058, 0.039, 0.042], { bone: B('head'), zone: Z.fur, k: 0.022 })); // cheeks
    P.push(ell([0, 0.281, -0.238], [0.021, 0.017, 0.019], { bone: B('head'), zone: Z.short, k: 0.012 })); // muzzle
    P.push(ell([0, 0.27, -0.226], [0.016, 0.01, 0.018], { bone: B('jaw'), zone: Z.short, k: 0.01 })); // chin
    P.push(sph([0, 0.287, -0.252], 0.0065, { bone: B('head'), zone: Z.none, k: 0.006 })); // nose
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      P.push(ell([s * 0.03, 0.343, -0.197], [0.021, 0.031, 0.006], { bone: B('ear.' + S), zone: Z.short, k: 0.008, rot: [0.15, 0, -s * 0.38] }));
      P.push(cap([s * 0.026, 0.33, -0.196], [s * 0.036, 0.368, -0.194], 0.012, 0.002, { bone: B('ear.' + S), zone: Z.short, k: 0.01 }));
      // front legs
      const sh = r['fsh.' + S], el = r['felb.' + S], wr = r['fwr.' + S], pw = r['fpaw.' + S];
      P.push(ell([sh.x, sh.y - 0.01, sh.z + 0.005], [0.024, 0.045, 0.03], { bone: B('fsh.' + S), zone: Z.fur, k: 0.025 }));
      P.push(cap(a(sh), a(el), 0.025, 0.019, { bone: B('fsh.' + S), zone: Z.fur, k: 0.015 }));
      P.push(cap(a(el), a(wr), 0.018, 0.014, { bone: B('felb.' + S), zone: Z.fur, k: 0.01 }));
      P.push(cap(a(wr), a(pw), 0.012, 0.012, { bone: B('fwr.' + S), zone: Z.short, k: 0.008 }));
      P.push(ell([pw.x, pw.y + 0.002, pw.z - 0.006], [0.015, 0.011, 0.019], { bone: B('fpaw.' + S), zone: Z.short, k: 0.008 }));
      // hind legs
      const hh = r['hhip.' + S], kn = r['hkn.' + S], hk = r['hhock.' + S], hp = r['hpaw.' + S];
      P.push(ell([hh.x, hh.y - 0.03, hh.z - 0.005], [0.03, 0.06, 0.04], { bone: B('hhip.' + S), zone: Z.fur, k: 0.03 }));
      P.push(cap(a(hh), a(kn), 0.03, 0.02, { bone: B('hhip.' + S), zone: Z.fur, k: 0.02 }));
      P.push(cap(a(kn), a(hk), 0.019, 0.013, { bone: B('hkn.' + S), zone: Z.fur, k: 0.01 }));
      P.push(cap(a(hk), a(hp), 0.011, 0.011, { bone: B('hhock.' + S), zone: Z.short, k: 0.006 }));
      P.push(ell([hp.x, hp.y + 0.002, hp.z - 0.008], [0.015, 0.011, 0.02], { bone: B('hpaw.' + S), zone: Z.short, k: 0.008 }));
    }
    // tail
    for (let i = 1; i <= 7; i++) {
      const p0 = r['tail' + i], p1 = i < 7 ? r['tail' + (i + 1)] : p0.clone().add(V(0, 0.004, 0.04));
      const rad = 0.017 - i * 0.0012;
      P.push(cap(a(p0), a(p1), rad, rad - 0.0012, { bone: B('tail' + i), zone: Z.tail, k: 0.012 }));
    }
    const geo = meshPrims(P, { cell: 0.0045, weightK: 0.008, pad: 0.012 });
    this.geo = geo;
    const N = 16;
    this.shells = [];
    for (let i = 0; i <= N; i++) {
      const mesh = new THREE.SkinnedMesh(geo, furMaterial(this.u, i, N));
      mesh.bind(this.skeleton);
      mesh.frustumCulled = false;
      mesh.castShadow = i === 0; mesh.receiveShadow = true;
      mesh.renderOrder = i;
      this.root.add(mesh);
      this.shells.push(mesh);
    }
    // eyes
    const eyeTex = eyeTexture();
    this.eyeU = { uPupil: { value: 0.25 }, uShine: { value: 0 }, uLid: { value: 1 } };
    const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.05, metalness: 0, envMapIntensity: 2, emissive: 0x000000 });
    eyeMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.eyeU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPupil; uniform float uShine; uniform float uLid;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 e = vMapUv - 0.5;
          float pupil = step(pow(e.x / max(uPupil * 0.5, 0.01), 2.0) + pow(e.y / 0.48, 2.0), 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.01), pupil);
          float lid = step(uLid * 0.5 + 0.02, abs(e.y) + (1.0 - uLid) * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.06, 0.05), lid);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.55, 0.85, 0.35) * uShine * (1.0 - step(uLid * 0.5 + 0.02, abs(vMapUv.y - 0.5)));`);
    };
    eyeMat.customProgramCacheKey = () => 'cateye';
    this.eyes = [];
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.0118, 14, 10);
      // map uv so the iris faces forward (-z)
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / 0.0118 * 0.5, 0.5 + pos.getY(i) / 0.0118 * 0.5);
      const eye = new THREE.Mesh(g, eyeMat);
      const headPos = this.rest.head;
      eye.position.set(s * 0.021, 0.303 - headPos.y, -0.239 - headPos.z);
      eye.rotation.y = s * 0.25;
      this.by.head.add(eye);
      this.eyes.push(eye);
    }
    // whiskers
    const wp = [];
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      wp.push(s * 0.012, 0.282 - 0.002 * i, -0.243, s * (0.075 + i * 0.006), 0.287 - 0.012 * i, -0.225 + i * 0.008);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.translate(0, -this.rest.head.y, -this.rest.head.z);
    const wh = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.7 }));
    this.by.head.add(wh);
    // invisible raycast proxy
    this.proxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.rotation.x = Math.PI / 2;
    this.root.add(this.proxy);
    this.proxy.position.set(0, 0.2, 0);
  }

  defaultPose() {
    return {
      hipsY: 0.215, chestY: 0.222, bodyPitch: 0, arch: 0, roll: 0, sideBend: 0,
      headPitch: 0, headYaw: 0, headTilt: 0, neckUp: 0,
      earL: 0, earR: 0, earFlat: 0, jaw: 0,
      tailUp: 0.25, tailCurve: 0.2, tailSway: 0.15, tailSpeed: 1, tailTwitch: 0, puff: 0,
      sit: 0, loaf: 0, crouch: 0, stretch: 0, held: 0, eat: 0, groom: 0, lie: 0, pupil: 0.25, lid: 1,
      legSpread: 0,
    };
  }

  // set target pose params (blended every frame)
  set(o) { Object.assign(this.t, o); }

  update(dt, ctx) {
    const P = this.p, T = this.t;
    const kf = 1 - Math.exp(-dt * (ctx.fast ? 14 : 7));
    for (const k of Object.keys(T)) if (typeof T[k] === 'number') P[k] += (T[k] - P[k]) * kf;
    const B = this.by;
    const time = G.time;
    for (const b of this.bones) b.quaternion.identity();
    for (const e of this.T) e.bone.position.copy(e.local);
    const speed = ctx.speed || 0;
    this.speed = damp(this.speed, speed, 6, dt);
    // gait
    const gait = this.speed > 1.6 ? 'gallop' : this.speed > 0.55 ? 'trot' : 'walk';
    const freq = gait === 'gallop' ? 3.4 : gait === 'trot' ? 2.6 : 1.4 + this.speed * 1.2;
    if (this.speed > 0.03) this.gaitPhase += dt * freq * TAU * clamp(this.speed / 0.25, 0.3, 1);
    const moving = clamp(this.speed / 0.12, 0, 1);
    const ph = this.gaitPhase;
    // body heights
    const sit = P.sit, loaf = P.loaf, crouch = P.crouch;
    let hipsY = P.hipsY - sit * 0.15 - loaf * 0.12 - crouch * 0.07 + P.stretch * 0.03;
    let chestY = P.chestY - loaf * 0.115 - crouch * 0.09 - P.stretch * 0.1 + sit * 0.01;
    const bob = gait === 'gallop' ? Math.sin(ph) * 0.025 : Math.abs(Math.sin(ph)) * 0.008;
    hipsY += bob * moving; chestY += (gait === 'gallop' ? -Math.sin(ph) * 0.02 : bob) * moving;
    // breathing
    const breath = Math.sin(time * (ctx.scared ? 6 : 2.2)) * 0.003;
    chestY += breath;
    // root hips placement and spine pitch from heights
    B.hips.position.y = hipsY;
    const pitch = Math.atan2(chestY - hipsY, 0.215) + P.bodyPitch;
    const rx = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(1, 0, 0), a));
    const ry = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(0, 1, 0), a));
    const rz = (b, a) => b.quaternion.multiply(_q.setFromAxisAngle(V(0, 0, 1), a));
    rx(B.hips, pitch * 0.6 + sit * 0.35);
    // arch (hiss) / flexion (gallop)
    const flex = gait === 'gallop' ? Math.sin(ph + 1.2) * 0.25 * moving : 0;
    rx(B.spine1, pitch * 0.15 + P.arch * 0.35 + flex * 0.5); rx(B.spine2, pitch * 0.15 + P.arch * 0.25 - P.arch * 0.05); rx(B.chest, pitch * 0.1 - P.arch * 0.55 - flex * 0.5 + sit * 0.25);
    // side bend while turning
    ry(B.spine1, P.sideBend * 0.4); ry(B.spine2, P.sideBend * 0.4); ry(B.chest, P.sideBend * 0.3);
    rz(B.hips, P.roll);
    // neck/head
    const headPitch = P.headPitch - pitch - sit * 0.6 + P.eat * 0.8 + crouch * 0.2 - P.neckUp * 0.4;
    rx(B.neck, headPitch * 0.4 - P.eat * 0.3 + P.neckUp * 0.3); ry(B.neck, P.headYaw * 0.45);
    rx(B.head, headPitch * 0.6 + P.groom * Math.sin(time * 9) * 0.15); ry(B.head, P.headYaw * 0.55); rz(B.head, P.headTilt);
    rx(B.jaw, -P.jaw * 0.5);
    // ears: forward / swivel / flattened back
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const e = B['ear.' + S];
      const sw = S === 'L' ? P.earL : P.earR;
      rz(e, s * (-0.15 - P.earFlat * 1.0));
      rx(e, P.earFlat * 0.7 - 0.05);
      ry(e, s * sw * 0.8);
    }
    // tail: up/down, curve, sway with lag down the chain, twitching tip, puff
    for (let i = 1; i <= 7; i++) {
      const b = B['tail' + i];
      const k = i / 7;
      const sway = Math.sin(time * 1.7 * P.tailSpeed - i * 0.55) * P.tailSway * (0.4 + k) + (P.tailTwitch > 0 && i > 5 ? Math.sin(time * 18) * P.tailTwitch * 0.6 : 0);
      ry(b, sway * 0.5);
      const up = i === 1 ? -P.tailUp * 1.2 + sit * 0.4 : -P.tailCurve * 0.35 * (i < 4 ? 1 : -0.6) + (i > 3 ? P.tailUp * 0.15 : 0);
      rx(b, up + (i > 1 ? Math.sin(time * 1.1 + i) * 0.03 : 0) + P.held * 0.25);
      if (sit > 0.5 && i > 1) ry(b, 0.35 * sit);
    }
    this.u.uPuff.value = P.puff;
    this.root.updateMatrixWorld(true);
    // legs: compute paw targets in cat-local space
    const legs = [['L', -1, 'f', 0.25], ['R', 1, 'f', 0.75], ['L', -1, 'h', 0], ['R', 1, 'h', 0.5]];
    const phaseOff = gait === 'trot' ? { fL: 0, hR: 0, fR: 0.5, hL: 0.5 } : gait === 'gallop' ? { hL: 0, hR: 0.08, fL: 0.5, fR: 0.58 } : { hL: 0, fL: 0.25, hR: 0.5, fR: 0.75 };
    const duty = gait === 'gallop' ? 0.4 : gait === 'trot' ? 0.5 : 0.62;
    const stride = (gait === 'gallop' ? 0.16 : gait === 'trot' ? 0.1 : 0.07) * moving;
    for (const [S, s, fh] of legs) {
      const key = fh + S;
      const pp = ((ph / TAU + phaseOff[key]) % 1 + 1) % 1;
      let off = 0, lift = 0;
      if (pp < duty) off = lerp(0.5, -0.5, pp / duty);
      else { const q = (pp - duty) / (1 - duty); off = lerp(-0.5, 0.5, smoothstep(0, 1, q)); lift = Math.sin(Math.PI * q) * (gait === 'gallop' ? 0.05 : 0.03); }
      const front = fh === 'f';
      const base = front ? V(s * (0.046 + P.legSpread * 0.03), 0.012, -0.118) : V(s * (0.052 + P.legSpread * 0.03), 0.012, 0.125);
      const paw = base.clone();
      paw.z -= off * stride; paw.y += lift * moving;
      // pose adjustments
      if (front) {
        paw.z -= P.stretch * 0.14 + loaf * 0.02; paw.y += P.groom * (S === 'R' ? 0.13 : 0);
        if (P.groom && S === 'R') paw.z -= 0.05;
        if (P.held > 0) { paw.y += P.held * 0.05; paw.z += P.held * 0.02 + Math.sin(time * (ctx.struggle ? 14 : 2) + s) * (ctx.struggle ? 0.03 : 0.005); }
      } else {
        paw.z -= sit * 0.09 + loaf * 0.04; paw.x += s * sit * 0.015;
        if (P.held > 0) { paw.y += P.held * 0.07; paw.z += Math.sin(time * (ctx.struggle ? 16 : 2) + s * 2) * (ctx.struggle ? 0.04 : 0.004); }
      }
      if (loaf > 0.4) paw.y = Math.max(paw.y, 0.012);
      this.legIK(S, s, front, paw, P);
    }
    // eyes
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 5; }
    this.blink = Math.max(0, this.blink - dt * 7);
    this.eyeU.uLid.value = clamp(P.lid * (1 - this.blink * (this.blink > 0.5 ? 1 : this.blink * 2)), 0.05, 1);
    this.eyeU.uPupil.value = P.pupil;
    this.proxy.position.set(0, 0.19 - loaf * 0.08 - sit * 0.03, 0.02);
  }

  legIK(S, s, front, pawLocal, P) {
    const B = this.by;
    const up = B[(front ? 'fsh.' : 'hhip.') + S], mid = B[(front ? 'felb.' : 'hkn.') + S], low = B[(front ? 'fwr.' : 'hhock.') + S];
    const n = (b) => b.name;
    const r = this.rest;
    // the lowest segment keeps a fixed angle: solve 2-bone IK for the wrist/hock point above the paw
    const lowLen = r[n(low)].distanceTo(r[(front ? 'fpaw.' : 'hpaw.') + S]);
    const pawW = this.root.localToWorld(pawLocal.clone());
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const lowDir = (front ? V(0, -0.95, -0.3) : V(0, -0.96, -0.25)).normalize().applyQuaternion(rootQ);
    const target = pawW.clone().addScaledVector(lowDir, -lowLen);
    const S0 = up.getWorldPosition(V());
    const a = r[n(up)].distanceTo(r[n(mid)]), b = r[n(mid)].distanceTo(r[n(low)]);
    const toT = target.clone().sub(S0);
    let d = clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = toT.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const alpha = Math.acos(cosA);
    // front elbows point back, hind knees point forward
    const pole = (front ? V(0, 0, 1) : V(0, 0, -1)).applyQuaternion(rootQ);
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const E = S0.clone().addScaledVector(dir, Math.cos(alpha) * a).addScaledVector(perp, Math.sin(alpha) * a);
    const W = S0.clone().addScaledVector(dir, d);
    const restUp = r[n(mid)].clone().sub(r[n(up)]).normalize().applyQuaternion(rootQ);
    const restMid = r[n(low)].clone().sub(r[n(mid)]).normalize().applyQuaternion(rootQ);
    const side = V(1, 0, 0).applyQuaternion(rootQ);
    aim(up, restUp, side, E.clone().sub(S0).normalize(), side);
    up.updateMatrixWorld(true);
    aim(mid, restMid, side, W.clone().sub(E).normalize(), side);
    mid.updateMatrixWorld(true);
    const restLow = r[(front ? 'fpaw.' : 'hpaw.') + S].clone().sub(r[n(low)]).normalize().applyQuaternion(rootQ);
    aim(low, restLow, side, pawW.clone().sub(W).normalize(), side);
    low.updateMatrixWorld(true);
  }

  setVisible(v) { this.root.visible = v; }
}

function aim(bone, restPrim, restSec, prim, sec) {
  const qT = basis(prim, sec), qR = basis(restPrim, restSec);
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  // bone rest world rotation = (parents' rest) which, with identity locals, equals the cat root rotation
  const root = bone; let p = bone; while (p.parent && p.parent.isBone) p = p.parent;
  const rootQ = p.parent ? p.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const worldQ = qT.multiply(qR.invert()).multiply(rootQ);
  bone.quaternion.copy(parentQ.invert().multiply(worldQ));
}
function basis(prim, sec) {
  const y = prim.clone().normalize();
  const z = sec.clone().sub(y.clone().multiplyScalar(sec.dot(y)));
  if (z.lengthSq() < 1e-8) z.set(1, 0, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  _m.makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}
