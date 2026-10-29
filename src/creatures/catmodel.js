// Mochi: a faceted low-poly cat with true feline anatomy (catmesh.js), skinned
// to a skeleton, painted as a brown mackerel tabby facet by facet, with glossy
// slit-pupil eyes, eyelids that roll shut, eyeshine, whiskers, tongue and fangs,
// a worn collar with a little fish tag that swings, and a procedural pose/gait system.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { buildCatGeometry, fishGeometry, EYE, EAR, HEAD, headPt } from './catmesh.js';
import { clamp, damp, lerp, smoothstep, snoise1, TAU } from '../core/util.js';
import { makeCanvas, toTexture } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _ca = new THREE.Vector3(), _cn = new THREE.Vector3(), _cv = new THREE.Vector3(), _cu = new THREE.Vector3(), _cf = new THREE.Vector3(), _cs = new THREE.Vector3(), _cr = new THREE.Vector3(), _cw = new THREE.Vector3(), _cl = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cm = new THREE.Matrix4();
const glv = (a) => `vec3(${a.map((x) => x.toFixed(5)).join(', ')})`;

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

const NOISE = /* glsl */`
float ch(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

// Brown mackerel tabby painted in rest space: every facet keeps its own tone,
// stripes are crisp antialiased bars across the facets.
const COAT = /* glsl */`
float bar(float x, float w) { float d = abs(fract(x) - 0.5), aa = fwidth(x) * 1.1 + 0.02; return 1.0 - smoothstep(w - aa, w + aa, d); }
float line(float d, float w) { float aa = fwidth(d) * 0.75 + 1e-5; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
vec3 coat(vec3 p, float part, float mat, float rnd, float lid) {
  vec3 ground = vec3(0.4, 0.28, 0.165), dark = vec3(0.085, 0.06, 0.042), cream = vec3(0.78, 0.69, 0.55);
  float n1 = cn(p * 55.0), n2 = cn(p * 21.0 + 7.0), ax = abs(p.x);
  float dk = 0.0, pale = 0.0;
  if (abs(part - 1.0) < 0.5 || abs(part - 6.0) < 0.5) { p = (p - HPIV) / HK; p.yz = vec2(p.y * HC + p.z * HS, -p.y * HS + p.z * HC); p += HPIV; ax = abs(p.x); }   // head patterns in skull space
  if (mat > 0.5) {
    if (mat < 1.5) {                       // nose leather: brick pink, dark nostrils
      vec3 c = vec3(0.6, 0.31, 0.28) * (0.9 + 0.2 * rnd);
      return mix(c, vec3(0.06, 0.03, 0.03), smoothstep(0.0024, 0.0012, length(vec2(ax - 0.0036, p.y - 0.2838))));
    }
    if (mat < 2.5) {                       // inner ear: thin pink skin, pale furnishings at the base and edges
      vec3 q = vec3(ax, p.y, p.z) - EAR_C;
      float h = dot(q, EAR_U) / EAR_H, w = dot(q, EAR_X) / (EAR_W * max(0.05, 1.0 - h));
      vec3 skin = mix(vec3(0.74, 0.53, 0.48), vec3(0.42, 0.29, 0.25), smoothstep(0.35, 0.0, h)) * (0.92 + 0.12 * rnd);
      // pale furnishings: long hairs streaming up from the base along the inner edge
      float tuft = bar(w * 2.2 + h * 0.6, 0.18) * smoothstep(0.55, 0.15, h) * smoothstep(-0.1, -0.5, w);
      return mix(skin, cream, max(tuft, smoothstep(0.75, 0.95, abs(w))) * 0.85);
    }
    if (mat < 3.5) return vec3(0.1, 0.06, 0.06) * (0.85 + 0.3 * rnd);   // pads
    if (mat < 4.5) return mix(vec3(0.3, 0.09, 0.1), vec3(0.06, 0.015, 0.02), smoothstep(-0.245, -0.225, p.z));   // mouth
    if (mat > 6.5) return vec3(0.62, 0.46, 0.2) * (0.75 + 0.35 * rnd);   // brass buckle and plate
    if (mat > 5.5) {                       // collar: a sun-faded red strap, rubbed pale in patches, fraying at the edges, stitched
      float e = abs(-lid * 2.0 - 3.0);     // 0 along the middle of the band, 1 at either edge
      vec3 c = vec3(0.4, 0.045, 0.05) * (0.85 + 0.3 * cn(p * 500.0));
      c = mix(c, vec3(0.55, 0.3, 0.27), smoothstep(0.55, 0.85, cn(p * 150.0 + 3.0)) * 0.45);
      c = mix(c, vec3(0.6, 0.42, 0.36), smoothstep(0.82, 1.0, e) * 0.55);
      return mix(c, vec3(0.72, 0.58, 0.5), line(e - 0.68, 0.07) * step(0.45, fract(dot(p, vec3(260.0, 170.0, 230.0)))) * 0.7);
    }
    // eyelids: pale rim of fur, dark lid margin against the eye
    return mix(mix(cream, ground, 0.55) * (0.95 + 0.1 * rnd), vec3(0.05, 0.035, 0.03), smoothstep(0.8, 0.9, lid));
  }
  if (part < 0.5) {                        // torso: mackerel stripes fall from the spine, broken toward the belly
    float x = p.z * 44.0 + sin(p.y * 52.0 + p.z * 16.0) * 0.35 + (n1 - 0.5) * 0.7;
    dk = bar(x, 0.15) * smoothstep(0.135, 0.175, p.y) * smoothstep(0.3, 0.55, n2 + 0.15) * (0.75 + 0.25 * n1);
    dk = max(dk, smoothstep(0.0125, 0.007, ax) * smoothstep(0.234, 0.244, p.y) * step(p.z, 0.175));   // dorsal line
    if (p.z < -0.105) dk = max(dk, bar((p.y + p.z * 0.75) * 40.0 + 0.3, 0.14) * smoothstep(0.235, 0.2, p.y) * smoothstep(0.01, 0.022, ax));   // necklaces
    pale = smoothstep(0.158, 0.128, p.y) * 0.85 + smoothstep(-0.1, -0.13, p.z) * smoothstep(0.22, 0.175, p.y) * smoothstep(0.03, 0.016, ax) * 0.8;
  } else if (part < 1.5) {                 // head: the M, lines back from the eyes, pale muzzle
    if (p.y > 0.312 && p.z < -0.17) {
      float fr = smoothstep(-0.215, -0.235, p.z);             // front of the forehead: strokes splay into the M
      dk = max(line(ax - 0.0032 - fr * (0.323 - p.y) * 0.25, 0.0014), line(ax - 0.0108 - fr * (0.333 - p.y) * 0.55, 0.0015));
      dk = max(dk, line(ax - 0.0182 + fr * 0.002, 0.0013) * smoothstep(-0.2, -0.215, p.z));
      dk *= smoothstep(0.318, 0.323, p.y);   // the M stops above the brow
    }
    if (ax > 0.029 && p.z < -0.19) {
      dk = max(dk, line(p.y - 0.3045 - (p.z + 0.226) * 0.28, 0.0014) * smoothstep(-0.228, -0.222, p.z));
      dk = max(dk, line(p.y - 0.2905 - (p.z + 0.226) * 0.55, 0.0013) * smoothstep(-0.236, -0.226, p.z));
    }
    if (p.z > -0.19) dk = max(dk, bar(ax * 95.0, 0.16) * smoothstep(0.3, 0.315, p.y));   // stripes run back over the crown
    pale = smoothstep(-0.244, -0.25, p.z) * smoothstep(0.2905, 0.2865, p.y);                                    // muzzle, whisker pads
    pale += smoothstep(0.283, 0.279, p.y) * smoothstep(-0.222, -0.236, p.z) * 0.45;                              // lower cheeks
    pale += smoothstep(0.0045, 0.0025, length(vec2(ax - 0.0262, p.y - 0.2885))) * 0.5;                           // under the eye
    if (p.y < 0.2744 - ax * 0.1 && p.z < -0.246 && ax < 0.0085) return vec3(0.12, 0.08, 0.07);   // upper lip margin
  } else if (part < 2.5 || part > 6.5) {   // forelegs: bars outside, paler inside, cream mittens
    dk = bar(p.y * 40.0 + n1 * 0.45, 0.15) * smoothstep(0.035, 0.07, p.y) * smoothstep(0.19, 0.13, p.y) * smoothstep(0.036, 0.05, ax) * 0.85;
    pale = smoothstep(0.042, 0.032, ax) * 0.5 + smoothstep(0.034, 0.02, p.y);
  } else if (part < 3.5) {                 // hind legs: broken stripes on the thigh, bars below, dark heel
    dk = bar(p.y * 38.0 + p.z * 10.0 + n1 * 0.5, 0.15) * smoothstep(0.04, 0.07, p.y) * smoothstep(0.042, 0.056, ax) * smoothstep(0.22, 0.17, p.y) * 0.85;
    float heel = mix(0.146, 0.162, clamp((p.y - 0.012) / 0.066, 0.0, 1.0));   // the dark line down the back of the hock
    dk = max(dk, smoothstep(heel - 0.002, heel + 0.002, p.z) * step(p.y, 0.083) * step(0.012, p.y));
    pale = smoothstep(0.044, 0.034, ax) * 0.45 + smoothstep(0.03, 0.018, p.y);
  } else if (part < 4.5) {                 // tail: rings, black tip
    dk = max(bar(p.z * 30.0 + n1 * 0.25, 0.2) * smoothstep(0.17, 0.2, p.z), step(0.425, p.z));
    pale = smoothstep(0.214, 0.206, p.y) * 0.4 * step(p.z, 0.3);
  } else if (part < 5.5) {                 // ear backs: dark, a pale thumbprint
    vec3 q = vec3(ax, p.y, p.z) - EAR_C;
    float h = dot(q, EAR_U) / EAR_H;
    dk = 0.45 + 0.5 * smoothstep(0.55, 0.85, h);
    pale = smoothstep(0.14, 0.06, length(vec2(dot(q, EAR_X) / EAR_W, h - 0.38))) * 0.35;
  } else {                                 // lower jaw: white chin, dark lip line
    pale = smoothstep(-0.236, -0.246, p.z) + smoothstep(0.012, 0.004, ax) * smoothstep(0.2665, 0.2645, p.y) * 0.8;   // white chin and throat
    if (p.y > 0.2716 + (p.z + 0.2548) * 0.08 && ax < 0.011) return vec3(0.1, 0.07, 0.06);
  }
  vec3 col = mix(ground * (0.85 + 0.3 * n2), dark, clamp(dk, 0.0, 1.0));
  col = mix(col, cream, clamp(pale, 0.0, 1.0) * (1.0 - 0.6 * clamp(dk, 0.0, 1.0)));
  col *= 0.92 + 0.16 * rnd;                // each facet its own tone
  col *= 0.9 + 0.2 * cn(p * 260.0);        // agouti ticking
  return col;
}`;

function coatMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true, envMapIntensity: 0.3 });
  const E = EYE, A = EAR;
  m.onBeforeCompile = (sh) => {
    for (const n of ['uPuff', 'uWet', 'uBlood', 'uBreathe', 'uTwitch', 'uPurr', 'uDirt', 'uLid', 'uScap']) sh.uniforms[n] = u[n];
    sh.uniforms.uTime = G.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSn; attribute vec4 aInfo; attribute float aLid;
        uniform float uPuff, uTime, uBreathe, uPurr, uLid; uniform vec4 uTwitch; uniform vec2 uScap;
        varying vec3 vRest; varying vec4 vInfo; varying float vLid;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vInfo = aInfo; vLid = aLid;
        // eyelids: the almond rim rolls over the eyeball toward a closing line just below centre
        if (aLid > 0.0) {
          const vec3 EC = ${glv(E.c)}, EF = ${glv(E.F)}, EU = ${glv(E.U)}, EL = ${glv(E.L)};
          const float EZ = ${E.ez.toFixed(3)};
          float sx = position.x < 0.0 ? -1.0 : 1.0;
          vec3 q = vec3(abs(position.x), position.y, position.z) - EC;
          q += EF * dot(q, EF) * (1.0 / EZ - 1.0);                    // roll on the flattened eyeball
          float c = clamp(1.0 - uLid / 0.88, -0.3, 1.0) * aLid;
          float b = atan(dot(q, EU), dot(q, EF)), a = mix(b, -0.12, c) - b;
          q = q * cos(a) + cross(EL, q) * sin(a) + EL * dot(EL, q) * (1.0 - cos(a));
          q += EF * (dot(q, EF) * (EZ - 1.0) + 0.0012 * max(c, 0.0));
          transformed = (q + EC) * vec3(sx, 1.0, 1.0);
        }
        vec3 nS = aSn.xyz;
        // breathing ribs and the purr tremor under the coat; a skin twitch ripples where touched
        float ribs = step(aInfo.y, 0.5) * smoothstep(0.235, 0.15, position.y) * smoothstep(0.11, 0.0, abs(position.z + 0.02));
        transformed += nS * (uBreathe * 0.0022 + uPurr * 0.0003 * sin(uTime * 160.0 + position.z * 40.0)) * ribs;
        float twd = length(position - uTwitch.xyz);
        transformed += nS * 0.0022 * uTwitch.w * sin(twd * 260.0 - uTime * 40.0) * exp(-twd * 30.0) * step(0.2, position.y);
        // hackles: the coat stands on end, ragged, longest on the back and tail
        float hr = fract(sin(dot(floor(position * 3000.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        transformed += nS * uPuff * 0.0085 * (aInfo.y > 7.5 ? 1.55 : aInfo.x * (0.55 + 0.9 * hr));   // the collar rides on top of it
        // shoulder blades ride up over the spine
        transformed.y += abs(aSn.w) * (aSn.w > 0.0 ? uScap.y : uScap.x) * 0.009;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest; varying vec4 vInfo; varying float vLid;
        uniform float uWet; uniform float uBlood; uniform float uDirt;
        const vec3 EAR_C = ${glv(A.c)}, EAR_U = ${glv(A.U)}, EAR_X = ${glv(A.X)};
        const float EAR_H = ${A.H.toFixed(4)}, EAR_W = ${A.W.toFixed(4)};
        const vec3 HPIV = ${glv(HEAD.pivot)}; const float HK = ${HEAD.k.toFixed(4)}, HC = ${Math.cos(HEAD.tilt).toFixed(5)}, HS = ${Math.sin(HEAD.tilt).toFixed(5)};
        float gSheen; float gGloss; float gEar;
        ${NOISE}
        ${COAT}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        // a little wrap (light scatters into the coat past the terminator), a grazing
        // sheen facet by facet, gloss on the wet nose, ears glowing when back-lit
        void RE_Direct_Coat(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          float nl = dot(geometryNormal, directLight.direction);
          reflectedLight.directDiffuse += clamp((nl + 0.18) / 1.18, 0.0, 1.0) * directLight.color * BRDF_Lambert(material.diffuseColor);
          float nv = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
          reflectedLight.directSpecular += directLight.color * pow(1.0 - nv, 4.0) * clamp(nl + 0.35, 0.0, 1.0) * material.diffuseColor * 0.6 * gSheen;
          vec3 H = normalize(directLight.direction + geometryViewDir);
          reflectedLight.directSpecular += directLight.color * pow(max(dot(geometryNormal, H), 0.0), 40.0) * max(nl, 0.0) * gGloss;
          float back = pow(clamp(dot(geometryViewDir, -directLight.direction), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += directLight.color * back * gEar * vec3(0.9, 0.3, 0.22) * 0.45;
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Coat`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float part = floor(vInfo.y + 0.5), mat = floor(vInfo.z + 0.5);
        vec3 cc = coat(vRest, part, mat, vInfo.w, vLid);
        gSheen = mat < 0.5 ? 1.0 - uWet * 0.6 : mat == 6.0 ? 0.35 : 0.15;
        gGloss = mat == 1.0 ? 0.45 : mat == 4.0 ? 0.3 : mat == 7.0 ? 1.4 : 0.015 + uWet * 0.25;
        gEar = mat == 2.0 ? 1.0 : part == 5.0 ? 0.4 : 0.0;
        cc = mix(cc, vec3(0.32, 0.015, 0.02), uBlood * smoothstep(0.55, 0.8, cn(vRest * 30.0)));
        cc *= (1.0 - uWet * 0.35) * (1.0 - uDirt * 0.25 * cn(vRest * 80.0));
        diffuseColor.rgb = cc;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mat == 1.0 ? 0.4 : mat == 4.0 ? 0.45 : mat == 7.0 ? 0.3 : mat == 6.0 ? 0.7 : 0.85, 0.45, uWet);`);
  };
  m.customProgramCacheKey = () => 'catcoat_lp1';
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
    this.eyeU = { uPupil: { value: 0.25 }, uShine: { value: 0 }, uLid: { value: 1 } };
    this.u = { uPuff: { value: 0 }, uWet: { value: 0 }, uBlood: { value: 0 }, uVel: { value: new THREE.Vector3() }, uBreathe: { value: 0 }, uTwitch: { value: new THREE.Vector4(0, 0, 0, 0) }, uPurr: { value: 0 }, uDirt: { value: 0 }, uJaw: { value: 0 }, uLid: this.eyeU.uLid, uScap: { value: new THREE.Vector2() } };
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
    const hd = this.rest.head, jw = this.rest.jaw;
    // a point on the (scaled) head, relative to the head or jaw bone
    const local = (b, x, y, z) => { const p = headPt([x, y, z]); return V(p[0] - b.x, p[1] - b.y, p[2] - b.z); };
    // one faceted, skinned shell
    const geo = this.geo = buildCatGeometry(this.rest, (n) => this.idx(n));
    const body = this.body = new THREE.SkinnedMesh(geo, coatMaterial(this.u));
    body.bind(this.skeleton);
    body.frustumCulled = false; body.castShadow = true; body.receiveShadow = true;
    this.root.add(body);
    // eyes: glossy corneas over a fibrous iris; the slit pupil dilates, the eye shines in the dark
    const eyeTex = eyeTexture();
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, emissive: 0x000000 });
    eyeMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.eyeU);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPupil; uniform float uShine; uniform float uLid;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 e = vMapUv - 0.5;
          float pq = pow(e.x / max(uPupil * 0.5, 0.01), 2.0) + pow(e.y / 0.47, 2.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006, 0.005, 0.004), smoothstep(1.08, 0.92, pq));
          // the upper lid shades the top of the eye
          diffuseColor.rgb *= mix(1.0, 0.5, smoothstep(0.08, 0.4, e.y + (1.0 - uLid) * 0.3));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.55, 0.85, 0.35) * uShine * smoothstep(0.1, 0.35, uLid) * (0.4 + 0.6 * smoothstep(1.2, 0.8, pow((vMapUv.x - 0.5) / max(uPupil * 0.5, 0.01), 2.0) + pow((vMapUv.y - 0.5) / 0.47, 2.0)));`);
    };
    eyeMat.customProgramCacheKey = () => 'cateye_lp1';
    this.eyes = [];
    for (const s of [-1, 1]) {
      const r = EYE.r, g = new THREE.SphereGeometry(r, 20, 14);
      // the cornea bulges in front of the iris
      { const pp = g.attributes.position; for (let i = 0; i < pp.count; i++) { const z = pp.getZ(i); if (z < -0.004) pp.setZ(i, z - 0.0018 * smoothstep(0.004, r, -z)); } g.scale(1, 1, EYE.ez); g.computeVertexNormals(); }
      // map uv so the iris faces forward (-z)
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / r * 0.5, 0.5 + pos.getY(i) / r * 0.5);
      const eye = new THREE.Mesh(g, eyeMat);
      eye.position.set(s * EYE.c[0] - hd.x, EYE.c[1] - hd.y, EYE.c[2] - hd.z);
      eye.rotation.set(EYE.pitch, -s * EYE.yaw, 0, 'YXZ');
      eye.userData.base = eye.position.clone();
      eye.userData.back = V(-s * EYE.F[0], -EYE.F[1], -EYE.F[2]);
      this.by.head.add(eye);
      this.eyes.push(eye);
    }
    // whiskers: four rows on each muzzle pad, plus brow and cheek whiskers.
    // Each one is a curved, tapering polyline rooted in its pad.
    this.whiskerPads = [];
    const wmat = new THREE.LineBasicMaterial({ color: 0xf0ece4, transparent: true, opacity: 0.55, depthWrite: false });
    const wmatDark = new THREE.LineBasicMaterial({ color: 0x302820, transparent: true, opacity: 0.5, depthWrite: false });
    for (const s of [-1, 1]) {
      const pad = new THREE.Group();
      pad.position.copy(local(hd, s * 0.0165, 0.2808, -0.2515));
      this.by.head.add(pad); this.whiskerPads.push(pad);
      const pts = [], dark = [];
      for (let row = 0; row < 4; row++) for (let j = 0; j < 3; j++) {
        const L = 0.055 + (3 - row) * 0.006 + j * 0.008 + Math.random() * 0.006;
        const root = V(s * j * 0.0025, -row * 0.0019, j * 0.002);
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
      for (let i = 0; i < 3; i++) brow(local(hd, s * (0.013 + i * 0.0045), 0.3218, -0.2402 + i * 0.0025), V(s * 0.5, 0.8, 0.3).normalize(), 0.03 + i * 0.004);
      for (let i = 0; i < 2; i++) brow(local(hd, s * 0.0385, 0.2895 - i * 0.004, -0.222), V(s * 1, 0.1, 0.4).normalize(), 0.035);
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bw, 3));
      this.by.head.add(new THREE.LineSegments(bg, wmat));
    }
    // tongue: rough pink papillae, hinged in the lower jaw
    const tg = new THREE.SphereGeometry(1, 8, 6);
    tg.scale(0.0082 * HEAD.k, 0.0022 * HEAD.k, 0.016 * HEAD.k);
    tg.translate(0, 0, -0.013);
    const tMat = new THREE.MeshStandardMaterial({ color: 0xd8707a, roughness: 0.55, flatShading: true });
    tMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.3 * fract(sin(dot(floor(gl_FragCoord.xy * 0.7), vec2(12.9, 78.2))) * 43758.5);'); };
    this.tongue = new THREE.Mesh(tg, tMat);
    this.tongue.position.copy(local(jw, 0, 0.2716, -0.229));
    this.tongue.scale.setScalar(0.001);
    this.by.jaw.add(this.tongue);
    // mouth interior (dark) so an open mouth reads as a mouth
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: 0x3a1214, roughness: 0.6 }));
    mouth.scale.set(0.0115, 0.0045, 0.017).multiplyScalar(HEAD.k); mouth.position.copy(local(hd, 0, 0.2735, -0.232));
    this.by.head.add(mouth);
    // teeth: fangs visible on a hiss
    const fangG = new THREE.ConeGeometry(0.0015, 0.006, 6); fangG.rotateX(Math.PI);
    const fangM = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.3 });
    for (const s of [-1, 1]) { const f = new THREE.Mesh(fangG, fangM); f.position.copy(local(hd, s * 0.0066, 0.2786, -0.2505)); this.by.head.add(f); const f2 = new THREE.Mesh(fangG, fangM); f2.rotation.x = Math.PI; f2.scale.y = 0.85; f2.position.copy(local(jw, s * 0.0056, 0.2742, -0.2488)); this.by.jaw.add(f2); }
    // invisible raycast proxy
    this.proxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.rotation.x = Math.PI / 2;
    this.root.add(this.proxy);
    this.proxy.position.set(0, 0.2, 0);
    // the tag: a split ring and a little enamel fish, hung from the plate at the throat
    const tag = geo.userData.tag;
    const bw = (o) => Object.entries(o).map(([b, w]) => [this.idx(b), w]);
    this.charm = { p: V(...tag.p), n: V(...tag.n), w: bw(tag.w), q: V(...tag.q), qw: bw(tag.qw), s: V(), sv: V(), av: V(), ap: V(), live: false, clink: -1 };
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.7, roughness: 0.3, flatShading: true });
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0x2aa9b0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true });
    const ink = new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.3, flatShading: true });
    brass.userData.keepGloss = ink.userData.keepGloss = true;
    this.tag = new THREE.Group();
    this.tag.add(new THREE.Mesh(new THREE.TorusGeometry(0.0026, 0.0006, 4, 8).rotateY(Math.PI / 2).translate(0, -0.0024, 0), brass));
    const fish = new THREE.Mesh(fishGeometry(), [enamel, brass, ink]); fish.castShadow = true;
    this.tag.add(fish);
    this.root.add(this.tag);
  }

  // The tag hangs from the collar plate (skinned like the strap under it) where
  // gravity puts it without entering the throat or the chest ruff below, and swings
  // about that as a small damped pendulum driven by how the plate accelerates.
  // A swing into the fur is stopped dead, and a hard one clinks against the plate.
  updateCharm(dt) {
    const C = this.charm, bs = this.bones, inv = this.skeleton.boneInverses, a = _ca.set(0, 0, 0), n = _cn.set(0, 0, 0), q = _cf.set(0, 0, 0);
    for (const [i, w] of C.w) { _cm.multiplyMatrices(bs[i].matrixWorld, inv[i]); a.addScaledVector(_cv.copy(C.p).applyMatrix4(_cm), w); n.addScaledVector(_cv.copy(C.n).transformDirection(_cm), w); }
    for (const [i, w] of C.qw) q.addScaledVector(_cv.copy(C.q).applyMatrix4(_cm.multiplyMatrices(bs[i].matrixWorld, inv[i])), w);
    n.normalize();
    // the slope from the plate down to the front of the chest: it may lie along that, not below it
    const m = _cs.subVectors(q, a).cross(_cu.set(1, 0, 0).transformDirection(this.root.matrixWorld)).normalize();
    if (m.dot(n) < 0) m.negate();
    const keep = (u) => { for (let k = 0; k < 3; k++) { const d = u.dot(n); if (d < 0.12) u.addScaledVector(n, 0.12 - d).normalize(); const e = u.dot(m); if (e < 0.15) u.addScaledVector(m, 0.15 - e).normalize(); } return u; };
    const r = keep(_cr.set(0, -1, 0)), L = 0.011, s = C.s, sv = C.sv;
    if (!C.live || dt <= 0 || dt > 0.25 || a.distanceTo(C.ap) > 0.05) { C.live = true; s.set(0, 0, 0); sv.set(0, 0, 0); C.av.set(0, 0, 0); }
    else {
      const v = _cv.subVectors(a, C.ap).divideScalar(dt), acc = _cw.subVectors(v, C.av).divideScalar(dt).clampLength(0, 60);
      C.av.copy(v);
      // the shoulders roll a little under it with every stride
      acc.addScaledVector(_cl.set(1, 0, 0).transformDirection(this.root.matrixWorld), Math.sin(this.gaitPhase) * 0.8 * clamp(this.speed / 0.12, 0, 1));
      const steps = Math.min(12, Math.ceil(dt * 240)), h = dt / steps;
      for (let k = 0; k < steps; k++) {   // s'' = -(g/L) s - c s' - a/L, across the hanging direction
        sv.addScaledVector(s, -890 * h).addScaledVector(sv, -9 * h).addScaledVector(acc, -h / L).addScaledVector(r, -sv.dot(r));
        s.addScaledVector(sv, h).addScaledVector(r, -s.dot(r)).clampLength(0, 1.4);
      }
    }
    C.ap.copy(a);
    const u = _cu.copy(r).add(s).normalize();
    let knock = 0;
    if (u.dot(n) < 0.1 || u.dot(m) < 0.13) {   // swung into the fur: stop it there, the inward swing spent
      knock = Math.max(0, -sv.dot(n), -sv.dot(m)) * L;
      keep(u); s.copy(u).sub(r);
      sv.addScaledVector(n, -Math.min(0, sv.dot(n))).addScaledVector(m, -Math.min(0, sv.dot(m)));
    }
    // hang it: up the ring toward the plate, the fish's face turned out from the throat
    const up = u.negate(), face = _cf.copy(n).addScaledVector(up, -n.dot(up)).normalize(), side = _cs.crossVectors(up, face);
    _cm.makeBasis(side, up, face);
    this.root.getWorldQuaternion(_cq).invert();
    this.tag.quaternion.setFromRotationMatrix(_cm).premultiply(_cq);
    this.tag.position.copy(this.root.worldToLocal(_cv.copy(a)));
    const au = G.audio;
    if (knock > 0.12 && G.time - C.clink > 0.3 && au && au.ctx && au.ctx.state === 'running' && this.root.visible) {
      C.clink = G.time;
      au.play('coin', { pos: a.clone(), vol: Math.min(0.1, 0.02 + knock * 0.15), rate: 1.7 + Math.random() * 0.3, ref: 0.3 });
    }
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
    // neck/head. A positive rotation about x lifts the nose; headPitch and eat
    // are "nose down" (eating, sleeping, looking down at something), so they enter negated.
    const headPitch = -P.headPitch - pitch - sit * 0.6 - P.eat * 0.8 + crouch * 0.2 - P.neckUp * 0.4;
    rx(B.neck, headPitch * 0.4 - P.eat * 0.3 + P.neckUp * 0.3); ry(B.neck, P.headYaw * 0.45);
    // yawn / lip lick / head shake overlays
    let yawnK = 0, lickK = 0, shake = 0;
    if (this.yawnT >= 0) { this.yawnT += dt; const y = this.yawnT; yawnK = y < 0.9 ? smoothstep(0, 0.9, y) : y < 2.0 ? 1 : 1 - smoothstep(2.0, 2.6, y); if (y > 2.7) this.yawnT = -1; }
    if (this.lickT >= 0) { this.lickT += dt; lickK = Math.sin(Math.min(1, this.lickT / 0.45) * Math.PI); if (this.lickT > 0.45) this.lickT = -1; }
    if (this.shakeT >= 0) { this.shakeT += dt; shake = Math.sin(this.shakeT * 55) * (1 - this.shakeT / 0.5) * 0.5; if (this.shakeT > 0.5) this.shakeT = -1; }
    const sniff = P.sniff > 0.05 ? Math.sin(time * 38) * Math.max(0, Math.sin(time * 5)) * 0.02 * P.sniff : 0;
    // head is stabilised against the stride bob
    const stab = gait !== 'gallop' ? -bob * moving * 3 : 0;
    rx(B.head, headPitch * 0.6 + P.groom * Math.sin(time * 9) * 0.15 + yawnK * 0.45 + sniff + stab); ry(B.head, P.headYaw * 0.55); rz(B.head, P.headTilt + shake);
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
    // shoulder blades stand above the spine when stalking, stretching, loafing, and on each supporting foreleg
    const scap = { L: crouch * 0.8 + P.stretch * 0.6 + loaf * 0.35, R: crouch * 0.8 + P.stretch * 0.6 + loaf * 0.35 };
    for (const [S, s, fh] of legs) {
      const key = fh + S;
      const pp = ((ph / TAU + phaseOff[key]) % 1 + 1) % 1;
      let off = 0, lift = 0;
      if (pp < duty) { off = lerp(0.5, -0.5, pp / duty); if (fh === 'f') scap[S] += Math.sin(Math.PI * pp / duty) * 0.7 * moving; }
      else { const q = (pp - duty) / (1 - duty); off = lerp(-0.5, 0.5, smoothstep(0, 1, q)); lift = Math.sin(Math.PI * q) * (gait === 'gallop' ? 0.05 : 0.03); }
      const front = fh === 'f';
      const base = front ? V(s * (0.046 + P.legSpread * 0.03), 0.012, -0.118) : V(s * (0.05 + P.legSpread * 0.03), 0.012, 0.136);
      const paw = base.clone();
      paw.z -= off * stride; paw.y += lift * moving;
      // pose adjustments
      if (front) {
        paw.z -= P.stretch * 0.14 + loaf * 0.02 - sit * 0.06; paw.y += P.groom * (S === 'R' ? 0.13 : 0);   // sitting: forelegs straight under the chest
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
    this.u.uScap.value.set(clamp(scap.L * (1 - P.held), 0, 1), clamp(scap.R * (1 - P.held), 0, 1));
    // eyes
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 5; }
    this.blink = Math.max(0, this.blink - dt * 7);
    let slowK = 0;
    if (this.slowT > 0) { this.slowT -= dt; const q = 1.8 - this.slowT; slowK = q < 0.6 ? smoothstep(0, 0.6, q) : q < 1.0 ? 1 : 1 - smoothstep(1.0, 1.8, q); }
    let yk = this.yawnT >= 0 ? 0.7 : 0;
    this.eyeU.uLid.value = clamp(P.lid * (1 - this.blink * (this.blink > 0.5 ? 1 : this.blink * 2)) * (1 - slowK * 0.92) * (1 - yk), 0.05, 1);
    this.eyeU.uPupil.value = P.pupil;
    // as the lids close the eyeball settles back so it never shows through them
    const shut = clamp(1 - this.eyeU.uLid.value / 0.88, 0, 1);
    for (const e of this.eyes) e.position.copy(e.userData.base).addScaledVector(e.userData.back, shut * 0.003);
    this.proxy.position.set(0, 0.19 - loaf * 0.08 - sit * 0.03, 0.02);
    this.updateCharm(dt);
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
    // standing, the pastern/metatarsus is near vertical; sitting and loafing it lies along the floor
    const flat = front ? clamp(P.loaf * 0.8 - P.held, 0, 1) : clamp(Math.max(P.sit * 0.95, P.loaf * 0.85, P.crouch * 0.35) - P.held, 0, 1);
    const lowDir = (front ? V(0, -0.95, -0.3) : V(0, -0.96, -0.25)).normalize().lerp(V(0, -0.22, -1).normalize(), flat).normalize().applyQuaternion(rootQ);
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
    // digitigrade: the toes stay flat on the ground whatever the leg above does
    const pw = B[(front ? 'fpaw.' : 'hpaw.') + S];
    pw.quaternion.copy(low.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rootQ));
    pw.updateMatrixWorld(true);
  }

  setVisible(v) { this.root.visible = v; }
}

function aim(bone, restPrim, restSec, prim, sec) {
  const qT = basis(prim, sec), qR = basis(restPrim, restSec);
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  // bone rest world rotation = (parents' rest) which, with identity locals, equals the cat root rotation
  let p = bone; while (p.parent && p.parent.isBone) p = p.parent;
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
