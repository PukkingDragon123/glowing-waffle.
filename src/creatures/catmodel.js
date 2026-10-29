// Khanom: SDF-sculpted cat with a skeleton, fur shells, tabby coat, slit-pupil
// eyes with eyeshine, whiskers, and a procedural pose/gait system.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { meshPrims, sph, cap, ell } from '../gfx/sdf.js';
import { clamp, damp, lerp, smoothstep, snoise1, TAU } from '../core/util.js';
import { makeCanvas, toTexture } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the game's look is low-poly pixel art: Khanom is faceted and painted, with no fur shells
const LOW_POLY = true;
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
    add('hkn.' + S, 'hhip.' + S, [s * 0.052, 0.138, 0.068]);
    add('hhock.' + S, 'hkn.' + S, [s * 0.05, 0.078, 0.152]);
    add('hpaw.' + S, 'hhock.' + S, [s * 0.05, 0.012, 0.136]);
  }
  return T;
}

function eyeTexture() {
  // amber-green iris: radial fibres, crypts, a darker collarette and limbal ring
  const S = 128, { c, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#5a4a10'); g.addColorStop(0.18, '#c8a230'); g.addColorStop(0.42, '#d8c84a'); g.addColorStop(0.7, '#9ab83a'); g.addColorStop(0.86, '#6a8a2a'); g.addColorStop(0.94, '#2a3010'); g.addColorStop(1, '#0a0a04');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * TAU, r0 = 6 + Math.random() * 10, r1 = 30 + Math.random() * 30, l = Math.random();
    ctx.strokeStyle = l < 0.5 ? `rgba(70,60,10,${0.15 + Math.random() * 0.35})` : `rgba(255,240,150,${Math.random() * 0.25})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    const w = (Math.random() - 0.5) * 0.15; ctx.quadraticCurveTo(S / 2 + Math.cos(a + w) * (r0 + r1) / 2, S / 2 + Math.sin(a + w) * (r0 + r1) / 2, S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1); ctx.stroke();
  }
  for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, r = 18 + Math.random() * 30; ctx.fillStyle = `rgba(40,35,5,${0.2 + Math.random() * 0.3})`; ctx.beginPath(); ctx.ellipse(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1.5 + Math.random() * 2, 0.8, a, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgba(80,50,0,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S / 2, S / 2, 22, 0, TAU); ctx.stroke();
  return toTexture(c, { nearest: false, repeat: false });
}

// Hair-shaft model in rest space: where strands grow, which way they lie, how
// long they are. Shared by all shells so strands stay coherent.
const FUR_COMMON = /* glsl */`
float ch(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec3 ch3(vec3 p) { return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453); }
float cn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }
// direction the coat lies (rest space): back toward the tail and down the flanks,
// straight down the legs, out along the tail, back over the skull
vec3 combDir(vec3 p, vec3 n) {
  vec3 d = vec3(0.0, -0.45, 1.0);
  if (p.z > 0.17) d = vec3(0.0, 0.05, 1.0);
  else if (p.y < 0.15) d = vec3(0.0, -1.0, 0.15);
  if (p.z < -0.17 && p.y > 0.25) d = vec3(sign(p.x) * 0.5, 0.25, 1.0);
  if (p.z < -0.2 && p.y < 0.29) d = vec3(sign(p.x) * 1.0, -0.4, 0.4);   // cheek fur fans outward
  d = normalize(d);
  return normalize(d - n * dot(d, n));
}`;

const COAT = /* glsl */`
// brown mackerel tabby with agouti banding along each hair shaft:
// grey-buff root, warm light band, dark tip. Stripe hairs are dark to the root.
vec3 coat(vec3 p, float h, float rnd) {
  float n = cn(p * 18.0) * 0.6 + cn(p * 55.0) * 0.4;
  float band;
  if (p.z > 0.17) band = fract(p.z * 19.0 + n * 0.35);
  else if (p.y < 0.14) band = fract(p.y * 30.0 + n * 0.45);
  else band = fract(p.z * 27.0 + sin(p.y * 35.0 + p.x * 20.0) * 0.35 + n * 1.1 + cn(p * 31.0) * 0.4);
  if (p.y > 0.24 && p.z < -0.17) band = fract(abs(p.x) * 55.0 + p.z * 25.0 + n * 0.8);
  float stripes = smoothstep(0.55, 0.64, band) * (1.0 - smoothstep(0.84, 0.95, band));
  stripes *= smoothstep(0.25, 0.6, cn(p * 11.0 + 4.0) + 0.25) * (0.75 + 0.25 * cn(p * 70.0));
  float spine = smoothstep(0.035, 0.0, abs(p.x)) * step(0.215, p.y) * step(p.z, 0.17);
  float tail = step(0.43, p.z);                                   // black tail tip
  float dk = clamp(stripes * 0.78 + spine * 0.6 + tail, 0.0, 1.0);
  vec3 root = vec3(0.3, 0.25, 0.2), lite = vec3(0.72, 0.5, 0.29), tip = vec3(0.09, 0.06, 0.04);
  // per-hair variation of where the light band sits
  float b0 = 0.2 + rnd * 0.2, b1 = 0.5 + rnd * 0.25;
  vec3 agouti = h < b0 ? mix(root, lite, h / b0) : h < b1 ? lite : mix(lite, tip, smoothstep(b1, 1.0, h) * 0.9 + 0.1);
  vec3 eum = mix(vec3(0.16, 0.12, 0.09), vec3(0.05, 0.04, 0.03), h);
  vec3 col = mix(agouti, eum, dk);
  // white bib, belly, mittens and muzzle
  float wm = smoothstep(0.165, 0.12, p.y) * step(p.z, 0.02) * smoothstep(0.055, 0.02, abs(p.x))
           + smoothstep(0.035, 0.02, p.y)
           + step(p.z, -0.212) * smoothstep(0.292, 0.274, p.y) * smoothstep(0.032, 0.016, abs(p.x));
  col = mix(col, vec3(0.9, 0.88, 0.83) * mix(0.92, 1.03, rnd), clamp(wm, 0.0, 1.0));
  // belly is paler and buff
  col = mix(col, col * vec3(1.25, 1.12, 0.95), smoothstep(0.17, 0.13, p.y) * (1.0 - clamp(wm, 0.0, 1.0)) * 0.6);
  return col * (0.9 + rnd * 0.2);
}`;

function furMaterial(u, shell, N) {
  const k = shell / N;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.2 });
  m.onBeforeCompile = (sh) => {
    for (const n of ['uFurLen', 'uPuff', 'uWet', 'uBlood', 'uVel', 'uBreathe', 'uTwitch', 'uPurr', 'uDirt', 'uJaw']) sh.uniforms[n] = u[n];
    sh.uniforms.uTime = G.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aRest; attribute vec4 aZoneA; uniform float uFurLen; uniform float uPuff; uniform float uTime;
        uniform vec3 uVel; uniform float uBreathe; uniform vec4 uTwitch; uniform float uPurr; uniform float uJaw;
        varying vec3 vRest; varying float vFurMask; varying vec3 vFurT; varying float vEar;
        ${FUR_COMMON}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = aRest;
        vec3 nR = normalize(normal);
        float furScale = aZoneA.x * 1.0 + aZoneA.y * 0.45 + aZoneA.z * 0.0 + aZoneA.w * 1.4;
        // longer ruff on the chest and britches, short dense fur on face and paws
        furScale *= 1.0 + 0.35 * smoothstep(0.19, 0.12, aRest.y) * step(aRest.z, -0.04) + 0.25 * smoothstep(0.1, 0.16, aRest.z) * step(aRest.y, 0.2);
        float puff = 1.0 + uPuff * (0.6 + aZoneA.w * 1.1);
        float eyeD = min(length(aRest - vec3(-0.021, 0.303, -0.236)), length(aRest - vec3(0.021, 0.303, -0.236)));
        furScale *= smoothstep(0.0105, 0.019, eyeD);
        furScale *= mix(1.0, 0.4, smoothstep(-0.2, -0.235, aRest.z) * step(0.265, aRest.y));
        furScale *= smoothstep(0.0, 0.006, length(aRest - vec3(0.0, 0.287, -0.252)) - 0.006);
        float mouthD = length((aRest - vec3(0.0, 0.2735, -0.252)) * vec3(0.85, 2.0, 0.7));
        furScale *= 1.0 - smoothstep(0.016, 0.009, mouthD) * clamp(uJaw * 1.5, 0.0, 1.0);
        vFurMask = furScale;
        vEar = smoothstep(0.325, 0.345, aRest.y) * step(aRest.z, -0.18);
        // body under the fur: breathing ribs, purr tremor, skin twitch ripple
        float torso = smoothstep(0.075, 0.0, abs(aRest.y - 0.19)) * smoothstep(0.17, 0.0, abs(aRest.z + 0.0)) * step(0.13, aRest.y);
        transformed += nR * (uBreathe * 0.0035 * torso + uPurr * 0.0004 * sin(uTime * 160.0 + aRest.z * 40.0) * torso);
        float twd = length(aRest - uTwitch.xyz);
        transformed += nR * 0.0025 * uTwitch.w * sin(twd * 260.0 - uTime * 40.0) * exp(-twd * 30.0) * step(0.2, aRest.y);
        // hair direction: out of the skin, laid along the comb, sagging with gravity, trailing motion
        float h = ${k.toFixed(4)};
        vec3 comb = combDir(aRest, nR);
        float lay = mix(1.3, 0.2, clamp(uPuff, 0.0, 1.0));
        vec3 dir = normalize(nR * (1.0 - 0.55 * h * (1.0 - uPuff)) + comb * lay * (0.35 + h));
        vec3 off = dir * uFurLen * furScale * puff * h;
        off.y -= h * h * uFurLen * 0.3 * furScale;
        off -= uVel * h * h * 0.012 * furScale;
        transformed += off;
        #ifdef USE_SKINNING
          vFurT = normalize(normalMatrix * (skinMatrix * vec4(normalize(nR * 0.35 + comb), 0.0)).xyz);
        #else
          vFurT = normalize(normalMatrix * normalize(nR * 0.35 + comb));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; varying float vFurMask; varying vec3 vFurT; varying float vEar;
        uniform float uWet; uniform float uBlood; uniform float uDirt; uniform float uTime; uniform float uJaw;
        float gHair; float gSpec;
        ${FUR_COMMON}
        ${COAT}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        // fur lighting: wrapped diffuse (light scattering through the coat),
        // two shifted Kajiya-Kay lobes along the hair, back-lit ear translucency
        void RE_Direct_Fur(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          float nl = dot(geometryNormal, directLight.direction);
          float wrapD = clamp((nl + 0.45) / 1.45, 0.0, 1.0);
          reflectedLight.directDiffuse += wrapD * directLight.color * BRDF_Lambert(material.diffuseColor) * mix(0.55, 1.0, gHair);
          vec3 T = normalize(vFurT);
          vec3 H = normalize(directLight.direction + geometryViewDir);
          vec3 T1 = normalize(T + geometryNormal * 0.12), T2 = normalize(T - geometryNormal * 0.2);
          float t1 = dot(T1, H), t2 = dot(T2, H);
          float s1 = pow(sqrt(max(0.0, 1.0 - t1 * t1)), 90.0), s2 = pow(sqrt(max(0.0, 1.0 - t2 * t2)), 16.0);
          float vis = smoothstep(-0.2, 0.3, nl);
          reflectedLight.directSpecular += directLight.color * vis * gSpec * (s1 * 0.07 + s2 * 0.12 * material.diffuseColor * 2.0);
          float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += directLight.color * back * vEar * vec3(0.9, 0.3, 0.22) * 0.5;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Fur`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float hS = ${k.toFixed(4)};
        vec3 cellP = vRest * 600.0;
        vec3 ci = floor(cellP);
        float best = 9.0; float bRnd = 0.0;
        for (int dz = 0; dz <= 1; dz++) for (int dy = 0; dy <= 1; dy++) for (int dx = 0; dx <= 1; dx++) {
          vec3 cc = ci + vec3(float(dx), float(dy), float(dz)) - vec3(step(fract(cellP.x), 0.5), step(fract(cellP.y), 0.5), step(fract(cellP.z), 0.5));
          vec3 fp = cc + ch3(cc);
          float d = length(cellP - fp);
          if (d < best) { best = d; bRnd = ch(cc + 7.3); }
        }
        // clumping: strands gather into tufts toward their tips
        float clump = cn(vRest * 140.0);
        float len = 0.55 + 0.45 * bRnd;
        float rad = mix(0.85, 0.08, pow(hS / len, 0.75)) * mix(1.0, 0.75 + clump * 0.5, hS);
        ${shell > 0 ? 'if (vFurMask < 0.05 || hS > len || best > rad) discard;' : ''}
        gHair = clamp(hS / max(len, 0.01), 0.0, 1.0);
        gSpec = ${shell > 0 ? '1.0' : '0.25'} * (1.0 - uDirt * 0.7);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cc = coat(vRest, ${shell > 0 ? 'gHair' : '0.0'}, bRnd);
        cc *= mix(0.42, 1.0, smoothstep(0.0, 0.7, gHair));   // self-shadowing deep in the coat
        ${shell === 0 ? `
        float noseD = length((vRest - vec3(0.0, 0.287, -0.253)) * vec3(1.0, 1.25, 1.0));
        vec3 leather = vec3(0.6, 0.33, 0.31) * (0.85 + cn(vRest * 3000.0) * 0.3);
        leather = mix(leather, vec3(0.08, 0.04, 0.04), smoothstep(0.0028, 0.0015, length(vec2(abs(vRest.x) - 0.0032, vRest.y - 0.2845))));
        cc = mix(cc, leather, smoothstep(0.0085, 0.006, noseD));
        cc = mix(cc, vec3(0.22, 0.1, 0.1), smoothstep(0.0012, 0.0, abs(vRest.x)) * step(vRest.y, 0.283) * step(0.274, vRest.y) * step(vRest.z, -0.24));
        cc = mix(cc, vec3(0.55, 0.3, 0.32), step(vRest.y, 0.008) * 0.8);
        cc = mix(cc, vec3(0.86, 0.6, 0.58), vEar * smoothstep(0.003, 0.0, abs(vRest.x) - 0.022) * 0.0);` : ''}
        { float md = length((vRest - vec3(0.0, 0.2735, -0.252)) * vec3(0.85, 2.0 / max(0.3, uJaw * 1.6 + 0.3), 0.7));
          float mo = smoothstep(0.012, 0.008, md) * clamp(uJaw * 1.5, 0.0, 1.0);
          vec3 mc = mix(vec3(0.3, 0.08, 0.09), vec3(0.025, 0.006, 0.006), smoothstep(0.0095, 0.006, md));
          cc = mix(cc, mc, mo); gSpec = mix(gSpec, 1.5, mo); }
        cc = mix(cc, vec3(0.32, 0.015, 0.02), uBlood * smoothstep(0.55, 0.8, cn(vRest * 30.0)));
        cc *= 1.0 - uWet * 0.35;
        diffuseColor.rgb = cc;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${shell > N * 0.5 ? `{ float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))); totalEmissiveRadiance += diffuseColor.rgb * pow(rim, 4.0) * 0.05; }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.9, 0.45, uWet);`);
  };
  m.customProgramCacheKey = () => 'catfur2_' + shell;
  return m;
}

// A cat ear: a pointed, cupped sheet. uv.x runs across (0..1), uv.y base to tip.
function earGeometry() {
  const W = 0.052, H = 0.056, D = 0.013, nu = 12, nv = 10;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu * 2 - 1, v = j / nv;
    const taper = Math.pow(1 - v, 0.9);
    pos.push(u * W * 0.5 * taper, v * H, D * (1 - u * u) * taper - v * v * 0.004);
    uv.push(i / nu, v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const _earMats = {};
function earMaterial(shell, kind) {
  const key = kind + '_' + shell;
  if (_earMats[key]) return _earMats[key];
  const k = kind === 0 ? 0 : shell / (kind === 1 ? 4 : 3);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: kind === 0 ? THREE.DoubleSide : kind === 1 ? THREE.BackSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEarUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vEarUv = uv;
        ${kind === 1 ? `transformed -= normal * ${(k * 0.0035).toFixed(5)} * (1.0 - uv.y * 0.6);` : ''}
        ${kind === 2 ? `transformed += normal * ${(k * 0.007).toFixed(5)} * smoothstep(0.75, 0.1, uv.y); transformed.y += ${(k * 0.004).toFixed(5)};` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vEarUv;
        float eh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${kind === 1 ? `if (eh(floor(vEarUv * vec2(70.0, 60.0))) < ${(0.25 + k * 0.6).toFixed(3)}) discard;` : ''}
        ${kind === 2 ? `{ vec2 c = vEarUv * vec2(40.0, 26.0); if (eh(floor(c)) < 0.55 + ${(k * 0.3).toFixed(3)} || abs(fract(c.x) - 0.5) > 0.22 || vEarUv.y > 0.7 || abs(vEarUv.x - 0.5) > 0.38) discard; }` : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 e = vEarUv;
          float rim = smoothstep(0.38, 0.5, abs(e.x - 0.5)) + smoothstep(0.75, 0.95, e.y);
          vec3 inner = mix(vec3(0.86, 0.7, 0.64), vec3(0.42, 0.32, 0.25), rim) * (0.92 + 0.12 * eh(floor(e * 50.0)));
          // fine vessels
          inner *= 1.0 - 0.12 * smoothstep(0.02, 0.0, abs(fract(e.x * 5.0 + e.y * 2.0) - 0.5) - 0.47) * step(0.1, e.y);
          vec3 outer = mix(vec3(0.33, 0.25, 0.18), vec3(0.12, 0.09, 0.07), clamp(rim * 1.2, 0.0, 1.0));
          outer = mix(outer, vec3(0.62, 0.52, 0.4), smoothstep(0.16, 0.08, length((e - vec2(0.5, 0.42)) * vec2(1.0, 1.4))));  // wild spot
          vec3 col = gl_FrontFacing ? inner : outer;
          ${kind === 1 ? 'col = outer * (0.85 + 0.3 * ' + k.toFixed(3) + ');' : ''}
          ${kind === 2 ? 'col = vec3(0.86, 0.82, 0.76);' : ''}
          diffuseColor.rgb = col;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${kind === 0 ? 'if (gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * vec3(0.14, 0.06, 0.05);' : ''}`);
  };
  m.customProgramCacheKey = () => 'catear' + key;
  return (_earMats[key] = m);
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
    this.u = { uFurLen: { value: 0.0125 }, uPuff: { value: 0 }, uWet: { value: 0 }, uBlood: { value: 0 }, uVel: { value: new THREE.Vector3() }, uBreathe: { value: 0 }, uTwitch: { value: new THREE.Vector4(0, 0, 0, 0) }, uPurr: { value: 0 }, uDirt: { value: 0 }, uJaw: { value: 0 } };
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
    // micro-behaviour overlays
    this.flick = { L: 3 + Math.random() * 5, R: 4 + Math.random() * 5, aL: 0, aR: 0 };
    this.listen = null;           // { yaw, t } ears swivel toward a sound
    this.slow = 0; this.slowT = 0;  // slow blink
    this.yawnT = -1; this.lickT = -1; this.shakeT = -1;
    this.prevPos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.twitchW = 0;
  }

  // ---- one-shot gestures
  slowBlink() { if (this.slowT <= 0) this.slowT = 1.8; }
  yawn() { if (this.yawnT < 0) this.yawnT = 0; }
  lick() { if (this.lickT < 0) this.lickT = 0; }
  headShake() { if (this.shakeT < 0) this.shakeT = 0; }
  hear(worldPos) {
    const l = this.root.worldToLocal(worldPos.clone());
    this.listen = { yaw: Math.atan2(l.x, -l.z), t: 1.6 };
  }
  // the skin over the back ripples where it is touched
  twitch(worldPos) {
    const l = this.root.worldToLocal(worldPos.clone());
    this.u.uTwitch.value.set(l.x, Math.max(0.2, l.y), l.z, 1);
    this.twitchW = 1;
  }

  build() {
    const B = (n) => this.idx(n);
    const r = this.rest;
    const a = (v) => [v.x, v.y, v.z];
    const Z = { fur: 0, short: 1, none: 2, tail: 3 };
    const P = [];
    // torso
    P.push(ell([0, 0.193, -0.085], [0.056, 0.084, 0.086], { bone: B('chest'), zone: Z.fur, k: 0.045 }));      // ribcage, deep
    P.push(ell([0, 0.14, -0.112], [0.032, 0.03, 0.04], { bone: B('chest'), zone: Z.fur, k: 0.035 }));       // sternum / keel
    for (const sx of [-1, 1]) P.push(ell([sx * 0.03, 0.247, -0.098], [0.02, 0.026, 0.042], { bone: B('chest'), zone: Z.fur, k: 0.025 })); // shoulder blades
    P.push(ell([0, 0.2, 0.01], [0.052, 0.058, 0.096], { bone: B('spine1'), zone: Z.fur, k: 0.05 }));        // waist, tucked
    P.push(ell([0, 0.158, 0.075], [0.04, 0.03, 0.055], { bone: B('spine1'), zone: Z.fur, k: 0.04 }));       // primordial pouch
    P.push(ell([0, 0.212, -0.03], [0.05, 0.056, 0.06], { bone: B('spine2'), zone: Z.fur, k: 0.05 }));
    P.push(ell([0, 0.205, 0.108], [0.058, 0.066, 0.07], { bone: B('hips'), zone: Z.fur, k: 0.045 }));       // pelvis
    P.push(ell([0, 0.222, 0.14], [0.05, 0.04, 0.045], { bone: B('hips'), zone: Z.fur, k: 0.035 }));         // rump
    // neck + head
    P.push(cap([0, 0.235, -0.135], [0, 0.275, -0.185], 0.044, 0.039, { bone: B('neck'), zone: Z.fur, k: 0.035 }));
    P.push(ell([0, 0.304, -0.199], [0.047, 0.042, 0.048], { bone: B('head'), zone: Z.fur, k: 0.02 }));   // cranium
    P.push(ell([0, 0.313, -0.222], [0.034, 0.011, 0.016], { bone: B('head'), zone: Z.fur, k: 0.012 }));  // brow ridge
    P.push(ell([0, 0.286, -0.209], [0.06, 0.035, 0.04], { bone: B('head'), zone: Z.fur, k: 0.02 }));   // zygomatic cheeks
    P.push(cap([0, 0.304, -0.232], [0, 0.291, -0.249], 0.012, 0.007, { bone: B('head'), zone: Z.short, k: 0.008 })); // nose bridge
    for (const s of [-1, 1]) P.push(ell([s * 0.009, 0.279, -0.24], [0.012, 0.01, 0.011], { bone: B('head'), zone: Z.short, k: 0.008 })); // whisker pads
    P.push(ell([0, 0.28, -0.239], [0.019, 0.015, 0.017], { bone: B('head'), zone: Z.short, k: 0.012 })); // muzzle
    P.push(ell([0, 0.27, -0.226], [0.016, 0.01, 0.018], { bone: B('jaw'), zone: Z.short, k: 0.01 })); // chin
    P.push(sph([0, 0.287, -0.252], 0.0065, { bone: B('head'), zone: Z.none, k: 0.006 })); // nose
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      P.push(ell([s * 0.03, 0.332, -0.198], [0.017, 0.009, 0.01], { bone: B('ear.' + S), zone: Z.fur, k: 0.012 })); // ear base
      // front legs
      const sh = r['fsh.' + S], el = r['felb.' + S], wr = r['fwr.' + S], pw = r['fpaw.' + S];
      P.push(ell([sh.x, sh.y - 0.01, sh.z + 0.005], [0.024, 0.045, 0.03], { bone: B('fsh.' + S), zone: Z.fur, k: 0.025 }));
      P.push(cap(a(sh), a(el), 0.027, 0.02, { bone: B('fsh.' + S), zone: Z.fur, k: 0.015 }));
      P.push(sph([el.x, el.y, el.z + 0.012], 0.014, { bone: B('fsh.' + S), zone: Z.fur, k: 0.008 }));  // elbow
      P.push(cap(a(el), a(wr), 0.0175, 0.013, { bone: B('felb.' + S), zone: Z.fur, k: 0.01 }));
      P.push(cap(a(wr), a(pw), 0.012, 0.012, { bone: B('fwr.' + S), zone: Z.short, k: 0.008 }));
      P.push(ell([pw.x, pw.y + 0.002, pw.z - 0.006], [0.015, 0.011, 0.019], { bone: B('fpaw.' + S), zone: Z.short, k: 0.008 }));
      // hind legs
      const hh = r['hhip.' + S], kn = r['hkn.' + S], hk = r['hhock.' + S], hp = r['hpaw.' + S];
      P.push(ell([hh.x * 1.02, hh.y - 0.035, hh.z - 0.008], [0.032, 0.066, 0.054], { bone: B('hhip.' + S), zone: Z.fur, k: 0.03, rot: [0.35, 0, 0] })); // haunch
      P.push(cap(a(hh), a(kn), 0.033, 0.023, { bone: B('hhip.' + S), zone: Z.fur, k: 0.022 }));
      P.push(cap(a(kn), a(hk), 0.017, 0.011, { bone: B('hkn.' + S), zone: Z.fur, k: 0.01 }));
      P.push(sph([hk.x, hk.y, hk.z + 0.006], 0.0115, { bone: B('hkn.' + S), zone: Z.short, k: 0.006 }));      // heel (hock)
      P.push(cap(a(hk), a(hp), 0.0095, 0.0105, { bone: B('hhock.' + S), zone: Z.short, k: 0.006 }));
      P.push(ell([hp.x, hp.y + 0.002, hp.z - 0.008], [0.015, 0.011, 0.02], { bone: B('hpaw.' + S), zone: Z.short, k: 0.008 }));
    }
    // tail
    for (let i = 1; i <= 7; i++) {
      const p0 = r['tail' + i], p1 = i < 7 ? r['tail' + (i + 1)] : p0.clone().add(V(0, 0.004, 0.04));
      const rad = 0.017 - i * 0.0012;
      P.push(cap(a(p0), a(p1), rad, rad - 0.0012, { bone: B('tail' + i), zone: Z.tail, k: 0.012 }));
    }
    // low-poly: a coarse mesh with hard facets, painted, no fur shells
    let geo = meshPrims(P, { cell: LOW_POLY ? 0.0068 : 0.0045, weightK: 0.008, pad: 0.012 });
    if (LOW_POLY) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }
    this.geo = geo;
    const N = 24;
    this.shells = [];
    for (let i = 0; i <= (LOW_POLY ? 0 : N); i++) {
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
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, emissive: 0x000000 });
    eyeMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.eyeU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPupil; uniform float uShine; uniform float uLid;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 e = vMapUv - 0.5;
          float pq = pow(e.x / max(uPupil * 0.5, 0.01), 2.0) + pow(e.y / 0.47, 2.0);
          float pupil = smoothstep(1.08, 0.92, pq);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.005, 0.004), pupil);
          // sclera barely shows; a dark rim where the lid meets the eye
          float lidEdge = uLid * 0.5 + 0.02;
          float lid = smoothstep(lidEdge - 0.015, lidEdge + 0.015, abs(e.y) + (1.0 - uLid) * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.04, 0.035), lid);
          diffuseColor.rgb *= 1.0 - 0.55 * smoothstep(lidEdge - 0.12, lidEdge, abs(e.y)) * (1.0 - lid);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.55, 0.85, 0.35) * uShine * (1.0 - step(uLid * 0.5 + 0.02, abs(vMapUv.y - 0.5))) * (0.4 + 0.6 * smoothstep(1.2, 0.8, pow((vMapUv.x - 0.5) / max(uPupil * 0.5, 0.01), 2.0) + pow((vMapUv.y - 0.5) / 0.47, 2.0)));`);
    };
    eyeMat.customProgramCacheKey = () => 'cateye2';
    this.eyes = [];
    for (const s of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.0118, 20, 14);
      // the cornea bulges in front of the iris
      { const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); if (z < -0.004) pp.setZ(i, z - 0.0018 * smoothstep(0.004, 0.0118, -z)); } g.computeVertexNormals(); }
      // map uv so the iris faces forward (-z)
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / 0.0118 * 0.5, 0.5 + pos.getY(i) / 0.0118 * 0.5);
      const eye = new THREE.Mesh(g, eyeMat);
      const headPos = this.rest.head;
      eye.position.set(s * 0.021, 0.302 - headPos.y, -0.2355 - headPos.z);
      eye.rotation.y = s * 0.25;
      this.by.head.add(eye);
      this.eyes.push(eye);
    }
    // ears: thin curved cartilage cups, pink inside with pale furnishings,
    // tabby on the back with a dark rim and a pale 'wild spot'
    this.earMeshes = [];
    for (const s of [-1, 1]) {
      const S = s < 0 ? 'L' : 'R';
      const geo = earGeometry();
      const ear = new THREE.Group();
      const eb = this.rest['ear.' + S];
      ear.position.set(s * 0.002, -0.009, -0.003);
      ear.rotation.set(-0.12, -s * 0.38, -s * 0.32, 'YXZ');
      this.by['ear.' + S].add(ear);
      ear.add(new THREE.Mesh(geo, earMaterial(0, 0)));
      for (let i = 1; i <= 4; i++) { const m = new THREE.Mesh(geo, earMaterial(i, 1)); m.renderOrder = 30 + i; ear.add(m); }
      for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, earMaterial(i, 2)); m.renderOrder = 40 + i; ear.add(m); }
      ear.children[0].castShadow = true;
      this.earMeshes.push(ear);
    }
    // whiskers: four rows on each muzzle pad, plus brow and cheek whiskers.
    // Each one is a curved, tapering polyline rooted in its pad.
    this.whiskerPads = [];
    const wmat = new THREE.LineBasicMaterial({ color: 0xf0ece4, transparent: true, opacity: 0.55, depthWrite: false });
    const wmatDark = new THREE.LineBasicMaterial({ color: 0x302820, transparent: true, opacity: 0.5, depthWrite: false });
    for (const s of [-1, 1]) {
      const pad = new THREE.Group();
      pad.position.set(s * 0.011, 0.281 - this.rest.head.y, -0.243 - this.rest.head.z);
      this.by.head.add(pad); this.whiskerPads.push(pad);
      const pts = [], dark = [];
      for (let row = 0; row < 4; row++) for (let j = 0; j < 3; j++) {
        const L = 0.055 + (3 - row) * 0.006 + j * 0.008 + Math.random() * 0.006;
        const root = V(s * j * 0.0025, -row * 0.0022, j * 0.002);
        const dirv = V(s * 1, 0.25 - row * 0.2 + (Math.random() - 0.5) * 0.1, 0.35 + j * 0.15).normalize();
        let prev = root.clone();
        for (let q = 1; q <= 6; q++) {
          const t = q / 6;
          const p = root.clone().addScaledVector(dirv, L * t);
          p.y -= t * t * L * 0.22; p.z += t * t * L * 0.08;
          (row === 3 && j === 0 ? dark : pts).push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          prev = p;
        }
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      pad.add(new THREE.LineSegments(wg, wmat));
      if (dark.length) { const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dark, 3)); pad.add(new THREE.LineSegments(dg, wmatDark)); }
      // brow + cheek whiskers
      const bw = [];
      const brow = (o, d, L) => { let prev = o.clone(); for (let q = 1; q <= 4; q++) { const t = q / 4; const p = o.clone().addScaledVector(d, L * t); p.y -= t * t * L * 0.15; bw.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); prev = p; } };
      for (let i = 0; i < 3; i++) brow(V(s * (0.014 + i * 0.004), 0.318 - this.rest.head.y, -0.232 + i * 0.003 - this.rest.head.z), V(s * 0.5, 0.8, 0.3).normalize(), 0.03 + i * 0.004);
      for (let i = 0; i < 2; i++) brow(V(s * 0.04, 0.29 - i * 0.004 - this.rest.head.y, -0.205 - this.rest.head.z), V(s * 1, 0.1, 0.4).normalize(), 0.035);
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bw, 3));
      this.by.head.add(new THREE.LineSegments(bg, wmat));
    }
    // tongue: rough pink papillae, hinged in the lower jaw
    const tg = new THREE.SphereGeometry(1, 12, 8);
    tg.scale(0.0085, 0.0022, 0.016);
    tg.translate(0, 0, -0.013);
    const tMat = new THREE.MeshStandardMaterial({ color: 0xd8707a, roughness: 0.55 });
    tMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.3 * fract(sin(dot(floor(gl_FragCoord.xy * 0.7), vec2(12.9, 78.2))) * 43758.5);'); };
    this.tongue = new THREE.Mesh(tg, tMat);
    this.tongue.position.set(0, 0.272 - this.rest.jaw.y, -0.225 - this.rest.jaw.z);
    this.tongue.scale.setScalar(0.001);
    this.by.jaw.add(this.tongue);
    // a red collar with a little gold bell, from the market at Chatuchak
    {
      const collar = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: 0xc8241c, roughness: 0.6, flatShading: true });
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8b830, roughness: 0.3, metalness: 0.7, flatShading: true });
      collar.add(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0055, 5, 12), red));
      const bell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0085, 0), gold); bell.position.set(0, -0.039, 0); collar.add(bell);
      const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 5), gold); tag.position.set(0, -0.034, 0); collar.add(tag);
      collar.rotation.x = Math.PI / 4;
      collar.position.set(0, -0.006, 0.006);
      collar.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.by.neck.add(collar); this.collar = collar;
    }
    // mouth interior (dark) so an open mouth reads as a mouth
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: 0x3a1214, roughness: 0.6 }));
    mouth.scale.set(0.011, 0.006, 0.016); mouth.position.set(0, 0.276 - this.rest.head.y, -0.228 - this.rest.head.z);
    this.by.head.add(mouth);
    // teeth: fangs visible on a hiss
    const fangG = new THREE.ConeGeometry(0.0015, 0.006, 6); fangG.rotateX(Math.PI);
    const fangM = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.3 });
    for (const s of [-1, 1]) { const f = new THREE.Mesh(fangG, fangM); f.position.set(s * 0.006, 0.2765 - this.rest.head.y, -0.2505 - this.rest.head.z); this.by.head.add(f); const f2 = new THREE.Mesh(fangG, fangM); f2.rotation.x = Math.PI; f2.position.set(s * 0.0055, 0.2705 - this.rest.jaw.y, -0.248 - this.rest.jaw.z); this.by.jaw.add(f2); }
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
      sit: 0, loaf: 0, crouch: 0, stretch: 0, held: 0, eat: 0, groom: 0, lie: 0, pupil: 0.25, lid: 0.88,
      legSpread: 0, tongue: 0, knead: 0, whisk: 0, tailTip: 0, purr: 0, sniff: 0,
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
    this.breathPh = (this.breathPh || 0) + dt * (ctx.scared ? 7 : P.lid < 0.2 ? 1.5 : 2.4 + this.speed * 3);
    const breath = Math.sin(this.breathPh);
    chestY += breath * 0.0015;
    this.u.uBreathe.value = breath * (ctx.scared ? 1.4 : 1);
    this.u.uPurr.value = P.purr;
    const wp = this.root.getWorldPosition(V());
    if (dt > 0) { const v = wp.clone().sub(this.prevPos).divideScalar(dt); if (v.lengthSq() < 100) this.vel.lerp(v, 1 - Math.exp(-dt * 6)); }
    this.prevPos.copy(wp);
    const lv = this.vel.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.u.uVel.value.copy(lv);
    this.twitchW = Math.max(0, this.twitchW - dt * 2.5); this.u.uTwitch.value.w = this.twitchW;
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
    // yawn / lip lick / head shake overlays
    let yawnK = 0, lickK = 0, shake = 0;
    if (this.yawnT >= 0) { this.yawnT += dt; const y = this.yawnT; yawnK = y < 0.9 ? smoothstep(0, 0.9, y) : y < 2.0 ? 1 : 1 - smoothstep(2.0, 2.6, y); if (y > 2.7) this.yawnT = -1; }
    if (this.lickT >= 0) { this.lickT += dt; lickK = Math.sin(Math.min(1, this.lickT / 0.45) * Math.PI); if (this.lickT > 0.45) this.lickT = -1; }
    if (this.shakeT >= 0) { this.shakeT += dt; shake = Math.sin(this.shakeT * 55) * (1 - this.shakeT / 0.5) * 0.5; if (this.shakeT > 0.5) this.shakeT = -1; }
    const sniff = P.sniff > 0.05 ? Math.sin(time * 38) * Math.max(0, Math.sin(time * 5)) * 0.02 * P.sniff : 0;
    // head is stabilised against the stride bob
    const stab = gait !== 'gallop' ? -bob * moving * 3 : 0;
    rx(B.head, headPitch * 0.6 + P.groom * Math.sin(time * 9) * 0.15 - yawnK * 0.45 + sniff + stab); ry(B.head, P.headYaw * 0.55); rz(B.head, P.headTilt + shake);
    rx(B.jaw, -(P.jaw * 0.5 + yawnK * 0.75 + lickK * 0.12));
    this.u.uJaw.value = P.jaw * 0.8 + yawnK + lickK * 0.25;
    // tongue: lapping while drinking, licking while grooming, curled in a yawn
    let tongue = Math.max(P.tongue, yawnK * 0.8, lickK);
    let tz = 0;
    if (P.groom > 0.5) { tongue = Math.max(tongue, Math.max(0, Math.sin(time * 9)) * 0.9); }
    if (P.eat > 0.5 && P.tongue > 0.3) tz = Math.max(0, Math.sin(time * 22)) * 0.6;
    this.tongue.scale.set(Math.max(0.001, tongue), Math.max(0.001, tongue), Math.max(0.001, tongue * (0.7 + tz)));
    this.tongue.rotation.x = yawnK * 0.5 - lickK * 0.3;
    // whisker pads: forward when curious, swept back flat when afraid
    this.whiskerPads.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.set(-P.earFlat * 0.25, sd * (P.whisk * 0.45 - P.earFlat * 0.55 - yawnK * 0.3) + Math.sin(time * 30 + i) * 0.04 * P.sniff, 0); });
    // ears: forward / swivel / flattened back
    for (const [S, s] of [['L', -1], ['R', 1]]) {
      const e = B['ear.' + S];
      let sw = S === 'L' ? P.earL : P.earR;
      if (this.listen) sw += clamp(-s * this.listen.yaw * 0.6, -0.9, 1.2) * Math.min(1, this.listen.t);
      // random flicks: a quick twitch of one ear
      this.flick[S] -= dt / 2;
      if (this.flick[S] <= 0) { this.flick[S] = 2 + Math.random() * (P.lid < 0.2 ? 4 : 7); this.flick['a' + S] = 1; }
      const fa = this.flick['a' + S]; this.flick['a' + S] = Math.max(0, fa - dt * 7);
      const fk = Math.sin(fa * Math.PI) * 0.5;
      rz(e, s * (-0.15 - P.earFlat * 1.0 - fk * 0.6 - (yawnK || 0) * 0.3));
      rx(e, P.earFlat * 0.7 - 0.05 + fk * 0.3);
      ry(e, s * sw * 0.8);
    }
    if (this.listen) { this.listen.t -= dt; if (this.listen.t <= 0) this.listen = null; }
    // tail: up/down, curve, sway with lag down the chain, twitching tip, puff
    for (let i = 1; i <= 7; i++) {
      const b = B['tail' + i];
      const k = i / 7;
      const sway = Math.sin(time * 1.7 * P.tailSpeed - i * 0.55) * P.tailSway * (0.4 + k) + (P.tailTwitch > 0 && i > 5 ? Math.sin(time * 18) * P.tailTwitch * 0.6 : 0);
      ry(b, sway * 0.5);
      const up = i === 1 ? -P.tailUp * 1.2 + sit * 0.4 : -P.tailCurve * 0.35 * (i < 4 ? 1 : -0.6) + (i > 3 ? P.tailUp * 0.15 : 0);
      rx(b, up + (i > 1 ? Math.sin(time * 1.1 + i) * 0.03 : 0) + P.held * 0.25 + (i >= 6 ? P.tailTip * 0.9 : 0));
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
      const base = front ? V(s * (0.046 + P.legSpread * 0.03), 0.012, -0.118) : V(s * (0.05 + P.legSpread * 0.03), 0.012, 0.136);
      const paw = base.clone();
      paw.z -= off * stride; paw.y += lift * moving;
      // pose adjustments
      if (front) {
        paw.z -= P.stretch * 0.14 + loaf * 0.02; paw.y += P.groom * (S === 'R' ? 0.13 : 0);
        if (P.groom && S === 'R') paw.z -= 0.05;
        if (P.knead > 0.01) { const kp = Math.sin(time * 5.5 + (S === 'L' ? 0 : Math.PI)); paw.y += Math.max(0, kp) * 0.025 * P.knead; paw.z -= Math.max(0, kp) * 0.012 * P.knead; }
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
    let slowK = 0;
    if (this.slowT > 0) { this.slowT -= dt; const q = 1.8 - this.slowT; slowK = q < 0.6 ? smoothstep(0, 0.6, q) : q < 1.0 ? 1 : 1 - smoothstep(1.0, 1.8, q); }
    let yk = this.yawnT >= 0 ? 0.7 : 0;
    this.eyeU.uLid.value = clamp(P.lid * (1 - this.blink * (this.blink > 0.5 ? 1 : this.blink * 2)) * (1 - slowK * 0.92) * (1 - yk), 0.05, 1);
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
