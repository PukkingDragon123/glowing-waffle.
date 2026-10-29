// The outside, rendered as a separate background pass with its own far plane:
// a smog-heavy sky (sun, bruised clouds, stars, the city's sodium dome), two
// moons, West Broadway below the window with its traffic and what the week
// does to it, government helicopters, the Manhattan skyline with the Twin
// Towers at the end of the street, the Hudson off to the side with its boats,
// fires/smoke, alien lights, searchlights and the biomechanical ship. Also
// drives sun/ambient lighting for the interior. -z looks south down West
// Broadway; +x is west.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { clamp, lerp, smoothstep, RNG } from '../core/util.js';
import { makeCanvas, toTexture, radial } from '../gfx/textures.js';
import { Landmarks } from './city.js';
import { Skyline, isWater } from './skyline.js';
import { Street } from './street.js';
import { Havoc } from './havoc.js';
import { Helicopters } from './helicopters.js';
import { Harbor, MAX_WAKES } from './harbor.js';
import { OUT, OUT_GLSL, Glows } from './outdoor.js';
import { Ship } from './ship.js';
import { Debris } from './debris.js';

import { Neighbours } from './neighbours.js';
export const LIFT = 120;
const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 groundCol; uniform vec3 sunCol;
uniform float time; uniform float cloudCover; uniform vec3 cloudLit; uniform vec3 cloudDark; uniform float stars; uniform float sunVis; uniform float smoke; uniform vec3 smokeCol;
uniform float lights; uniform float burnGlow; uniform float flash; uniform vec3 smogCol; uniform float smog; uniform vec3 glowCol; uniform vec3 beltCol;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ s += a * noise(p); p = p * 2.07 + 5.3; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y, hh = max(h, 0.0);
  vec3 col = mix(horizon, zenith, pow(smoothstep(0.0, 1.0, hh), 0.4));
  // the smog layer lies on the horizon like a stain
  col = mix(col, smogCol, smog * exp(-hh * 9.0));
  // twilight: a bruised belt opposite the sun, the earth's shadow under it
  vec2 sd = normalize(sunDir.xz + vec2(1e-4));
  float anti = clamp(-dot(normalize(d.xz + vec2(1e-4)), sd), 0.0, 1.0);
  col += beltCol * smoothstep(0.0, 0.06, h) * smoothstep(0.34, 0.07, h) * (0.3 + 0.7 * anti);
  col *= 1.0 - min(1.0, length(beltCol) * 1.6) * 0.5 * smoothstep(0.07, 0.0, h) * anti;
  // sun: disc, halo, and the broad glare a dirty sky makes of it
  vec3 sdir = normalize(sunDir);
  float s = max(dot(d, sdir), 0.0);
  col += sunCol * sunVis * (smoothstep(0.99955, 0.99975, s) * 30.0 + pow(s, 900.0) * 4.0 + pow(s, 60.0) * 0.4 + pow(s, 10.0) * 0.07);
  // the city's sodium dome on the horizon, the fires under it
  float east = smoothstep(0.3, -0.8, d.z);
  col += glowCol * exp(-hh * 6.0) * (0.45 + 0.55 * east);
  col += vec3(0.22, 0.08, 0.025) * burnGlow * east * exp(-hh * 8.0);
  if (h > 0.0) {
    // clouds: a warped layer, self-shadowed away from the sun, thinning to streaks at the horizon
    vec2 p = d.xz / (h + 0.07) * 0.7 + vec2(time * 0.006, time * 0.0022);
    vec2 w = vec2(fbm3(p * 0.8 + 4.0), fbm3(p * 0.8 + 9.0)) - 0.5;
    float n = fbm(p * 1.3 + w * 1.4);
    float c0 = 1.0 - cloudCover * 0.92;
    float cov = smoothstep(c0, c0 + 0.13, n);
    float n2 = fbm((p + sd * 0.14) * 1.3 + w * 1.4);
    float lit = clamp(0.5 + (n - n2) * 5.0, 0.0, 1.0);
    vec3 cc = mix(cloudDark, cloudLit, lit * (0.75 + 0.25 * fbm3(p * 5.0)));
    cc += sunCol * sunVis * pow(s, 8.0) * (1.0 - cov * 0.8) * 1.4;
    // the burning city lights the bellies of the clouds from below, strongest over Manhattan
    cc += vec3(0.5, 0.16, 0.04) * burnGlow * east * (0.3 + 0.7 * (1.0 - lit)) * smoothstep(0.6, 0.02, h);
    // energy discharges inside the cloud deck
    cc += vec3(0.7, 0.9, 1.0) * flash * smoothstep(0.4, 0.8, fbm3(p * 0.9 + 21.0)) * 2.5;
    col = mix(col, cc, cov * smoothstep(0.0, 0.1, h) * 0.97);
    // alien aurora: tall curtains of green light, folding slowly
    if (lights > 0.0) {
      float ax = d.x / (h + 0.25);
      float fold = fbm3(vec2(ax * 1.4 + time * 0.03, time * 0.02));
      float curtain = smoothstep(0.55, 0.0, abs(fract(ax * 0.9 + fold * 1.6) - 0.5)) * smoothstep(0.08, 0.3, h) * smoothstep(0.85, 0.4, h);
      float rays = 0.6 + 0.4 * fbm3(vec2(ax * 18.0, h * 2.0 - time * 0.2));
      col += vec3(0.15, 0.85, 0.5) * curtain * rays * lights * 0.35 * (1.0 - cov * 0.7);
    }
    // smoke from the burning city, thick and low
    float sm = fbm3(vec2(d.x * 6.0 + time * 0.01, h * 18.0 - time * 0.02));
    col = mix(col, smokeCol * (0.6 + sm * 0.6), smoke * smoothstep(0.45, 0.0, h) * (0.4 + sm * 0.6));
    // a few stars get through the light pollution
    vec2 sp = d.xz / (h + 0.3) * 220.0;
    float st = step(0.9982, hash(floor(sp))) * stars * smoothstep(0.08, 0.4, h) * (1.0 - cov);
    col += st * (0.5 + 0.4 * sin(time * 3.0 + hash(floor(sp)) * 40.0));
  }
  col = mix(col, groundCol, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
}`;

// the Hudson: murky body, chop, the sky and the skyline mirrored in it, wakes
const WATER_FS = /* glsl */`
${OUT_GLSL}
uniform vec3 deep; uniform float fire; uniform vec4 shock; uniform vec4 wakeA[${MAX_WAKES}]; uniform vec4 wakeB[${MAX_WAKES}];
uniform vec3 moonDir; uniform float moonK; uniform vec3 cityRefl;
varying vec3 vWorld;
float wh(vec2 p){
  return vn2(p * 0.09 + vec2(oTime * 0.05, oTime * 0.02)) * 0.6 + vn2(p * 0.31 - vec2(oTime * 0.1, -oTime * 0.04)) * 0.3 + vn2(p * 1.1 + vec2(oTime * 0.22, oTime * 0.13)) * 0.14;
}
void main(){
  vec3 p = vWorld;
  vec3 tc = cameraPosition - p; float dist = length(tc); vec3 v = -tc / dist;
  // chop, calmer with distance so it doesn't shimmer
  float e = 0.3 + dist * 0.002;
  float h0 = wh(p.xz), hx = wh(p.xz + vec2(e, 0.0)), hz = wh(p.xz + vec2(0.0, e));
  float amp = 1.2 / (1.0 + dist * 0.003);
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
  // wakes: Kelvin arms, a churned centre trail and the bow wave
  float foam = 0.0; vec2 wn = vec2(0.0);
  for (int i = 0; i < ${MAX_WAKES}; i++) {
    vec4 a = wakeA[i], b = wakeB[i];
    if (b.x < 0.3) continue;
    vec2 d = p.xz - a.xy;
    float along = -dot(d, a.zw) - b.y * 0.5;
    if (along < -b.y - 6.0 || along > 900.0) continue;
    float side = dot(d, vec2(-a.w, a.z));
    float al = max(along, 0.0), sp = clamp(b.x / 10.0, 0.0, 1.5);
    float arm = abs(abs(side) - (b.z * 0.5 + al * 0.34));
    float aw = 1.2 + al * 0.05;
    float k1 = exp(-arm * arm / (aw * aw)) * exp(-al / (240.0 * sp + 30.0)) * sp;
    float trail = exp(-side * side / (b.z * b.z * 0.2 + al * 1.4)) * exp(-al / (130.0 * sp + 15.0)) * sp;
    float hull = exp(-pow(max(abs(side) - b.z * 0.5, 0.0), 2.0) * 0.4) * smoothstep(-b.y - 6.0, -b.y + 3.0, along) * step(along, 0.0) * sp;
    wn += vec2(-a.w, a.z) * sign(side) * k1 * sin(arm * 2.0 - al * 0.35) * 0.3;
    foam += k1 * 0.3 * (0.6 + 0.4 * vn2(p.xz * 0.9 + oTime)) + trail * (0.45 + 0.55 * vn2(p.xz * 0.6 + a.zw * oTime * 3.0)) * 0.9 + hull * 0.8;
  }
  n = normalize(n + vec3(wn.x, 0.0, wn.y));
  vec3 r = reflect(v, n); r.y = abs(r.y);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  vec3 refl = skyRefl(r);
  vec3 body = deep * (oAmbSky * 1.6 + oSunCol * max(oSun.y, 0.0) * 0.5 + oAmbGnd);
  vec3 col = mix(body, refl, fres);
  // sun glitter, and the moon's glade at night
  float sr = max(dot(r, oSun), 0.0);
  col += oGlare * (pow(sr, 400.0) * 12.0 + pow(sr, 40.0) * 0.35) * (0.6 + 0.8 * h0);
  float mr = max(dot(r, moonDir), 0.0);
  col += vec3(0.5, 0.55, 0.65) * moonK * (pow(mr, 700.0) * 5.0 + pow(mr, 90.0) * 0.08) * (0.4 + h0);
  // city lights streak across the water toward us at night
  float streak = step(0.72, vn2(vec2(p.x * 0.07, p.z * 0.5 + oTime * 0.6))) * oNight * smoothstep(3000.0, 600.0, dist);
  col += streak * vec3(1.0, 0.68, 0.35) * 0.3 * (0.4 + h0) * oLit * 2.0;
  // foam
  vec3 fc = vec3(0.7, 0.71, 0.68) * (oSunCol * max(oSun.y, 0.1) * 0.7 + oAmbSky * 2.0 + oAmbGnd) + vec3(0.02, 0.012, 0.005) * oNight;
  col = mix(col, fc, clamp(foam, 0.0, 0.9));
  col += fire * vec3(0.9, 0.3, 0.05) * (0.12 + h0 * 0.25) * 0.6;
  // the blast's shock ring racing across the river
  if (shock.w > 0.0) { float sd = abs(length(p.xz - shock.xy) - shock.z); col += vec3(0.9, 0.85, 0.8) * smoothstep(40.0, 0.0, sd) * shock.w * 0.8; }
  gl_FragColor = vec4(outFog(col, p), 1.0);
}`;

// camera-facing quads in one draw: fire glows (additive) or smoke columns (blended, fogged)
const BB_VS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol;
varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec3 vR; varying vec3 vU; varying vec3 vF;
void main(){
  vUv = position.xy * 2.0; vCol = iCol; vW = iPos;
  vR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); vU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); vF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iSize; gl_Position = projectionMatrix * mv;
}`;
const BB_FS = /* glsl */`
${OUT_GLSL}
uniform float smoky;
varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec3 vR; varying vec3 vU; varying vec3 vF;
void main(){
  float r = length(vUv);
  if (smoky > 0.5) {
    // a ball of smoke: billowing edge, sunlit on one side, dark in its core, lit from below by the fire at night
    float n = vn2(vUv * 2.2 + vW.xz * 0.01 + vec2(oTime * 0.04, -oTime * 0.03)) * 0.65 + vn2(vUv * 5.0 + vW.y * 0.02) * 0.35;
    float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7) * vCol.a;
    if (a < 0.004) discard;
    vec3 nrm = normalize(vR * vUv.x + vU * vUv.y + vF * sqrt(max(0.0, 1.0 - r * r)));
    float sunK = max(dot(nrm, oSun), 0.0);
    vec3 c = vCol.rgb * (0.45 + 0.7 * n) * (oAmbSky * 2.2 + oAmbGnd + oSunCol * sunK * 0.9);
    c += vec3(0.9, 0.32, 0.06) * oBurn * oNight * smoothstep(0.4, -1.0, vUv.y) * 0.25;
    gl_FragColor = vec4(outFog(c, vW), a);
  } else {
    float a = pow(max(1.0 - r, 0.0), 1.6) * vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
  }
}`;
class Billboards {
  constructor(scene, n, smoky) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const at = (k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.p = at(3); this.s = at(2); this.c = at(4);
    g.setAttribute('iPos', this.p); g.setAttribute('iSize', this.s); g.setAttribute('iCol', this.c);
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ vertexShader: BB_VS, fragmentShader: BB_FS, uniforms: { ...OUT, smoky: { value: smoky ? 1 : 0 } }, transparent: true, depthWrite: false, blending: smoky ? THREE.NormalBlending : THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = smoky ? 3 : 2;
    scene.add(this.mesh);
  }
  set(i, x, y, z, sx, sy, r, g, b, a) { this.p.setXYZ(i, x, y, z); this.s.setXY(i, sx, sy); this.c.setXYZW(i, r, g, b, a); }
  flush(any) { this.mesh.visible = any; if (any) this.p.needsUpdate = this.s.needsUpdate = this.c.needsUpdate = true; }
}

function moonTexture(red) {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, red ? '#f0c8b0' : '#f0eee4'); g.addColorStop(0.85, red ? '#c88a70' : '#d4d2c8'); g.addColorStop(1, red ? '#8a4a3a' : '#a4a298');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  const rng = new RNG(red ? 7 : 3);
  // maria first, then craters
  for (let i = 0; i < 7; i++) { ctx.fillStyle = `rgba(${red ? '110,50,40' : '128,126,118'},0.35)`; ctx.beginPath(); ctx.ellipse(30 + rng.range(0, 60), 30 + rng.range(0, 60), rng.range(8, 20), rng.range(6, 16), rng.range(0, 3), 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * 52, r = rng.range(2, i < 6 ? 12 : 5);
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    ctx.fillStyle = `rgba(${red ? '90,40,30' : '120,118,110'},${rng.range(0.2, 0.5)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (red) { // a dark "iris" — the second moon looks like an eye
    ctx.fillStyle = 'rgba(60,10,10,0.55)'; ctx.beginPath(); ctx.ellipse(64, 64, 9, 22, 0, 0, Math.PI * 2); ctx.fill();
  }
  return toTexture(c, { nearest: false, repeat: false });
}

const C = (r, g, b) => new THREE.Color(r, g, b);
// the outdoor palette (linear). Day is hot, hazy and smog-stained; night is sodium and soot.
const PAL = {
  dayZen: C(0.042, 0.078, 0.19), dayHor: C(0.27, 0.25, 0.21), daySmog: C(0.25, 0.18, 0.1),
  goldZen: C(0.08, 0.07, 0.11), goldHor: C(0.5, 0.3, 0.16),
  twiZen: C(0.018, 0.018, 0.04), twiHor: C(0.12, 0.07, 0.07),
  nightZen: C(0.003, 0.004, 0.009), nightHor: C(0.03, 0.021, 0.014), nightSmog: C(0.05, 0.028, 0.012),
  redZen: C(0.16, 0.04, 0.03), redHor: C(0.5, 0.17, 0.07),
  belt: C(0.2, 0.09, 0.12), sodium: C(0.075, 0.04, 0.014),
};

export class Sky {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(72, 1, 1, 12000);
    this.p = { // live parameters (blended toward targets)
      dayT: 0.1, night: 0, cloud: 0.35, smoke: 0, burn: 0, red: 0, moon2: 0, lights: 0, ship: 0, litFrac: 0.4, blackout: 0, sunBoost: 1,
    };
    this.time = 0;
    const sky = this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 0.2, -1) }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, groundCol: { value: new THREE.Color(0x222428) },
        sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, time: { value: 0 }, cloudCover: { value: 0.4 }, cloudLit: { value: new THREE.Color(1, 1, 1) }, cloudDark: { value: new THREE.Color(0.3, 0.3, 0.3) }, stars: { value: 0 }, sunVis: { value: 1 },
        smoke: { value: 0 }, smokeCol: { value: new THREE.Color(0.2, 0.15, 0.12) }, lights: { value: 0 }, burnGlow: { value: 0 }, flash: { value: 0 },
        smogCol: { value: new THREE.Color() }, smog: { value: 0.4 }, glowCol: { value: new THREE.Color() }, beltCol: { value: new THREE.Color() },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(10000, 32, 16), sky);
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);
    this.glows = new Glows(this.scene, 700);
    this.buildCity();
    this.buildWater();
    this.buildMoons();
    this.buildFX();
    this.buildShip();
    // interior lighting driven by the sky
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.035;
    G.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8090a8, 0x30281f, 0.3);
    G.scene.add(this.hemi);
    this.windowLights = [];
    this.sunVis = 1;
  }

  addWindowLight(pos, dir, w = 1.2) {
    const l = new THREE.SpotLight(0xb8c8e0, 0, 7, 1.25, 1, 1.6);
    l.position.copy(pos); l.target.position.copy(pos).add(dir);
    G.scene.add(l, l.target);
    this.windowLights.push({ l, w });
    return l;
  }

  buildCity() {
    this.landmarks = new Landmarks(this.scene, this.glows);
    this.skyline = new Skyline(this.scene, this.landmarks, this.glows);
    this.city = this.skyline.mesh; this.bldMat = this.skyline.mat; this.tanks = this.skyline.roofMesh;
    this.buildings = this.skyline.buildings;
    this.roofs = this.skyline.roofs;
    this.street = new Street(this.scene, this.glows);
    this.ground = this.street.static;
    this.lamps = this.street.lamps;
    this.havoc = new Havoc(this.scene, this.glows, this.street);
    this.helis = new Helicopters(this.scene, this.glows);
    this.harbor = new Harbor(this.scene, this.glows);
  }

  buildWater() {
    const wa = this.harbor.wakeA, wb = this.harbor.wakeB;
    const mat = this.waterMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: WATER_FS,
      uniforms: { ...OUT, deep: { value: new THREE.Color(0.05, 0.075, 0.06) }, fire: { value: 0 }, shock: { value: new THREE.Vector4(0, 0, 0, 0) }, wakeA: { value: wa }, wakeB: { value: wb }, moonDir: { value: new THREE.Vector3(-0.35, 0.32, -1).normalize() }, moonK: { value: 0 }, cityRefl: { value: new THREE.Color(0.1, 0.1, 0.1) } },
    });
    // the Hudson and the Upper Bay, out to the haze
    const w = new THREE.Mesh(new THREE.PlaneGeometry(24000, 16000), mat);
    w.rotation.x = -Math.PI / 2; w.position.set(0, -15, -4000);
    w.frustumCulled = false;
    this.scene.add(w); this.water = w;
  }

  buildMoons() {
    const mk = (red, size) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(red), transparent: true, depthWrite: false, fog: false }));
      s.scale.set(size, size, 1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial({ size: 64, inner: red ? 'rgba(255,120,90,0.35)' : 'rgba(220,230,255,0.3)', outer: 'rgba(0,0,0,0)' }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      halo.scale.set(size * 3.5, size * 3.5, 1);
      this.scene.add(halo, s);
      return { s, halo };
    };
    this.moon1 = mk(false, 160);
    this.moon2 = mk(true, 260);
  }

  buildFX() {
    // fire glows + smoke columns over burning buildings, one instanced draw each
    this.fires = []; this.smokes = [];
    const burning = [...this.street.buildings.filter((b) => b.burn > 0.5).slice(0, 10), ...this.buildings.filter((b) => b.burn > 0.5 && b.z < -400 && b.z > -1800 && Math.abs(b.x) < 900 && b.h > 25).slice(0, 50)];
    for (const b of burning) {
      // the fire glows on the face toward us
      const d = new THREE.Vector2(-b.x, -b.z).normalize().multiplyScalar(Math.max(b.w, b.d) * 0.5 + 3);
      this.fires.push({ b, ph: Math.random() * 10, ox: d.x, oz: d.y });
      for (let k = 0; k < 5; k++) this.smokes.push({ b, k, ph: Math.random() * 10 });
    }
    this.fireBB = new Billboards(this.scene, this.fires.length, false);
    this.smokeBB = new Billboards(this.scene, this.smokes.length, true);
    // alien lights: little bright motes drifting in formations
    const moteMap = radial({ size: 32, inner: 'rgba(190,255,230,1)', outer: 'rgba(80,255,180,0)' });
    this.motes = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moteMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.scale.set(26, 26, 1);
      this.scene.add(s);
      this.motes.push({ s, a: Math.random() * 6.28, r: 300 + Math.random() * 1500, y: 300 + Math.random() * 600, sp: 0.02 + Math.random() * 0.05, z: -1400 + (Math.random() - 0.5) * 1600 });
    }
    // searchlight beams from the sky
    const beamGeo = new THREE.CylinderGeometry(4, 90, 1, 16, 1, true); beamGeo.translate(0, -0.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(0.7, 1, 0.9) }, op: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; uniform float op; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(col * op * e * (0.4 + 0.6 * (1.0 + vY)), 1.0); }',
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.beamMat = beamMat;
    this.beams = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.scale.set(1, 900, 1);
      this.scene.add(b);
      this.beams.push({ m: b, ph: i * 1.7, x: -600 + i * 420 });
    }
  }

  buildShip() {
    this.shipObj = new Ship(this.scene);
    const g = this.ship = this.shipObj.group;
    g.visible = false;
    this.shipLight = new THREE.PointLight(0x80ffc0, 0, 3000, 1);
    g.add(this.shipLight);
    this.debris = new Debris(this.scene);
    // explosion / crash effects
    const fireMap = radial({ size: 64, inner: 'rgba(255,220,140,1)', outer: 'rgba(255,80,0,0)' });
    this.blasts = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      s.visible = false;
      this.scene.add(s); this.blasts.push({ s, t: -1, v: new THREE.Vector3(), life: 1 });
    }
    const hemi = new THREE.HemisphereLight(0x606870, 0x101010, 1.2);
    this.scene.add(hemi); this.bgHemi = hemi;
    const bgSun = new THREE.DirectionalLight(0xffffff, 1); bgSun.position.set(0, 1, 1); this.scene.add(bgSun); this.bgSun = bgSun;
  }

  // ---------------------------------------------------------- presets
  // the sun over Lower Manhattan on July 1st (lat 40.7, declination +23.1, EDT),
  // in the view's frame: -z looks down West Broadway (bearing 214.5), +x is west-north-west
  static sunAt(hours) {
    const H = ((hours - 13) * 15) * Math.PI / 180, dec = 23.1 * Math.PI / 180, lat = 40.72 * Math.PI / 180;
    const E = -Math.cos(dec) * Math.sin(H), N = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H), U = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
    const sb = Math.sin(214.5 * Math.PI / 180), cb = Math.cos(214.5 * Math.PI / 180);
    return new THREE.Vector3(E * cb - N * sb, U, -(E * sb + N * cb)).normalize();
  }
  // day: 1..7, t: 0..1 through the waking day (07:00 .. 23:00)
  preset(day, t, menu = false) {
    const P = {};
    const hours = 7 + t * 16;
    P.hours = hours;
    P.sunDir = Sky.sunAt(hours);
    P.night = 1 - smoothstep(-0.1, 0.12, P.sunDir.y);
    P.cloud = [0, 0.35, 0.45, 0.6, 0.7, 0.8, 0.9, 0.95][day] ?? 0.5;
    P.smoke = [0, 0, 0.05, 0.25, 0.45, 0.75, 0.9, 1][day] ?? 0;
    P.burn = [0, 0, 0, 0.2, 0.5, 0.85, 1, 1][day] ?? 0;
    P.red = [0, 0, 0, 0.12, 0.35, 0.55, 0.75, 1][day] ?? 0;
    P.moon2 = day >= 2 ? (day === 2 ? 0.45 : 1) : 0;
    P.lights = [0, 0, 0, 0.4, 0.6, 0.9, 1, 1][day] ?? 0;
    P.ship = day >= 5 ? (day - 4) / 3 : 0;
    P.litFrac = [0.5, 0.55, 0.5, 0.35, 0.25, 0.15, 0.08, 0][day] ?? 0.4;
    P.blackout = day >= 4 ? 0.6 : 0;
    P.day = menu ? 7 : day;
    if (menu) Object.assign(P, { night: 1, smoke: 0.85, burn: 0.95, red: 0.6, moon2: 1, lights: 1, ship: 1, litFrac: 0.12, blackout: 0.7, cloud: 0.75, sunDir: new THREE.Vector3(0.3, -0.4, 0.8).normalize() });
    return P;
  }
  apply(P, snap = false) {
    const p = this.p;
    const k = snap ? 1 : 0.02;
    for (const key of ['night', 'cloud', 'smoke', 'burn', 'red', 'moon2', 'lights', 'ship', 'litFrac', 'blackout']) if (P[key] !== undefined) p[key] = lerp(p[key], P[key], k);
    if (P.sunDir) { if (!p.sunDir) p.sunDir = P.sunDir.clone(); else p.sunDir.lerp(P.sunDir, snap ? 1 : 0.05).normalize(); }
    if (P.day !== undefined) p.day = P.day;
  }
  // for the menu's falling wreckage: river or street?
  isWater(x, z) { return isWater(x, z); }

  update(dt, cam) {
    this.time += dt;
    const p = this.p;
    if (!this.neighbours) this.neighbours = new Neighbours(this.scene);
    this.neighbours.update(dt, p.night);
    const t = this.time;
    const night = p.night, red = p.red;
    const e = p.sunDir.y;
    // ---- the outdoor palette for this moment
    const dayK = smoothstep(-0.12, 0.22, e);
    const gold = smoothstep(0.3, 0.06, e) * smoothstep(-0.05, 0.03, e);
    const twi = smoothstep(0.04, -0.03, e) * smoothstep(-0.22, -0.07, e);
    const zen = PAL.nightZen.clone().lerp(PAL.dayZen, dayK).lerp(PAL.goldZen, gold * 0.5).lerp(PAL.twiZen, twi * 0.6);
    const hor = PAL.nightHor.clone().lerp(PAL.dayHor, dayK).lerp(PAL.goldHor, gold * 0.6).lerp(PAL.twiHor, twi * 0.7);
    zen.lerp(PAL.redZen.clone().multiplyScalar(1 - night * 0.7), red * 0.6);
    hor.lerp(PAL.redHor.clone().multiplyScalar(1 - night * 0.6), red * 0.55);
    if (p.burn > 0.3) hor.lerp(C(0.16, 0.055, 0.022), p.burn * night * 0.6);
    const smoky = 1 - p.smoke * 0.55;
    const sunUp = smoothstep(-0.03, 0.05, e);
    const sunCol = C(1.35, 1.18, 0.92).lerp(C(1.5, 0.62, 0.24), smoothstep(0.32, 0.02, e)).lerp(C(1.3, 0.55, 0.32), red * 0.5)
      .multiplyScalar(sunUp * smoky * (1 - p.cloud * 0.3) * p.sunBoost * this.sunVis);
    const u = this.skyMat.uniforms;
    u.zenith.value.copy(zen); u.horizon.value.copy(hor); u.sunDir.value.copy(p.sunDir);
    u.sunCol.value.copy(sunCol).multiplyScalar(1.2);
    u.time.value = t; u.cloudCover.value = p.cloud; u.stars.value = night * (1 - p.smoke * 0.8) * 0.7;
    u.sunVis.value = sunUp * smoky;
    u.smog.value = 0.38 + p.smoke * 0.4;
    u.smogCol.value.copy(PAL.nightSmog).lerp(PAL.daySmog, dayK).lerp(PAL.goldHor.clone().multiplyScalar(0.6), gold * 0.5);
    const glow = PAL.sodium.clone().multiplyScalar(night * (1 - p.blackout * 0.55));
    u.glowCol.value.copy(glow);
    u.beltCol.value.copy(PAL.belt).multiplyScalar(smoothstep(0.12, 0.0, e) * smoothstep(-0.14, -0.02, e) * (1 - p.cloud * 0.5));
    // bruised clouds: sickly lit tops, purple-grey bellies; at night lit orange from the streets
    u.cloudLit.value.copy(hor).multiplyScalar(0.95).add(sunCol.clone().multiplyScalar(0.26)).lerp(C(0.07, 0.04, 0.02).add(glow), night);
    u.cloudDark.value.copy(zen).multiplyScalar(0.6).add(hor.clone().multiplyScalar(0.25)).lerp(C(0.11, 0.085, 0.12).multiplyScalar(dayK + 0.05), 0.5).lerp(C(0.012, 0.009, 0.008).add(glow.clone().multiplyScalar(0.35)), night);
    u.smoke.value = p.smoke; u.smokeCol.value.setRGB(0.16 + red * 0.2, 0.12, 0.1).multiplyScalar(1 - night * 0.55);
    u.lights.value = p.lights * night; u.burnGlow.value = p.burn * night; u.flash.value = Math.max(0, (u.flash.value || 0) - dt * 2.5);
    u.groundCol.value.copy(hor).multiplyScalar(0.4);
    // ---- shared lighting for everything outdoors
    const O = OUT;
    O.oSun.value.copy(p.sunDir); O.oSunCol.value.copy(sunCol);
    O.oAmbSky.value.copy(zen).multiplyScalar(0.75).add(hor.clone().multiplyScalar(0.16)).add(C(0.004, 0.005, 0.009));
    O.oAmbGnd.value.copy(hor).multiplyScalar(0.2).multiply(C(1, 0.85, 0.7)).add(glow.clone().multiplyScalar(0.25));
    O.oFogCol.value.copy(hor).multiplyScalar(0.88).lerp(u.smogCol.value, 0.45).add(glow.clone().multiplyScalar(0.6));
    O.oFogDen.value = 0.00019 + p.smoke * 0.0003 + p.cloud * 0.00004;
    O.oGlare.value.copy(sunCol).multiplyScalar(0.55 * (1 - p.cloud * 0.4));
    O.oZen.value.copy(zen); O.oHor.value.copy(hor);
    O.oNight.value = night; O.oTime.value = t; O.oLit.value = p.litFrac; O.oBlackout.value = p.blackout; O.oBurn.value = p.burn;
    O.oLamp.value = smoothstep(0.2, 0.6, night) * (1 - p.blackout * 0.55);
    O.oPx.value = 2 * Math.tan((cam.fov || 72) * Math.PI / 360) / Math.max(200, (G.engine && G.engine.lowHc) || 720);
    // ---- water
    const wu = this.waterMat.uniforms;
    wu.fire.value = p.burn * night;
    wu.moonK.value = night * (1 - p.cloud * 0.6) * (1 - p.smoke * 0.7);
    wu.cityRefl.value.copy(hor).multiplyScalar(0.35).add(sunCol.clone().multiplyScalar(0.06 * smoothstep(0.0, 0.5, p.sunDir.z))).multiplyScalar(1 - night * 0.85);
    wu.deep.value.setRGB(0.05, 0.075, 0.06).lerp(C(0.08, 0.04, 0.03), red * 0.5);
    // shared outdoor state for the landmarks, the ship and the debris
    const sh = this.shared || (this.shared = { fogCol: new THREE.Color(), skyCol: new THREE.Color(), sunDir: new THREE.Vector3(), dayCol: new THREE.Color() });
    sh.night = night; sh.litFrac = p.litFrac; sh.fogCol.copy(O.oFogCol.value); sh.fogDensity = O.oFogDen.value; sh.sunDir.copy(p.sunDir);
    sh.dayCol.setRGB(1, 0.95, 0.9).lerp(C(1, 0.6, 0.4), red * 0.5); sh.skyCol.copy(zen).lerp(hor, 0.55); sh.blackout = p.blackout; sh.burn = p.burn;
    this.landmarks.update(t, sh);
    this.shipObj.update(dt, t, sh);
    this.debris.update(dt, sh);
    const day = p.day ?? 1;
    this.street.update(dt, t, this.havoc.calm(day));
    this.havoc.update(dt, t, p, day);
    this.helis.update(dt, t, p, day, cam, this.debris);
    this.harbor.update(dt, t);
    // the stacks across the river breathe steam and smoke all day (the menu keeps the puffs for its own fires)
    if (!this.cinematic) for (const s of this.skyline.stacks) {
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = 2.4 + Math.random() * 1.6;
      const c = s.steam ? C(0.6, 0.58, 0.56) : C(0.2, 0.18, 0.17);
      this.debris.puff(s.p.clone().add(new THREE.Vector3(0, s.r, 0)), new THREE.Vector3(-1 - Math.random(), 4 + Math.random() * 2, -0.5), s.r * 3, s.r * 1.4 + 2, 45, c, s.steam ? 0.42 : 0.36);
    }
    if (this.shock) { this.shock.r += dt * 340; wu.shock.value.set(this.shock.x, this.shock.z, this.shock.r, Math.max(0, 1 - this.shock.r / 2500)); } else wu.shock.value.w = 0;
    OUT.oShock.value.copy(wu.shock.value);
    // moons (high over the harbour)
    const md1 = new THREE.Vector3(-0.35, 0.32, -1).normalize(), md2 = new THREE.Vector3(0.45, 0.2, -1).normalize();
    this.moon1.s.position.copy(cam.position).addScaledVector(md1, 5000);
    this.moon1.halo.position.copy(this.moon1.s.position);
    this.moon1.s.material.opacity = clamp(0.25 + night, 0, 1) * (1 - p.smoke * 0.5); this.moon1.halo.material.opacity = night * (1 - p.smoke * 0.5);
    this.moon2.s.position.copy(cam.position).addScaledVector(md2, 5000);
    this.moon2.halo.position.copy(this.moon2.s.position);
    this.moon2.s.material.opacity = p.moon2 * clamp(0.3 + night, 0, 1); this.moon2.halo.material.opacity = p.moon2 * night;
    this.moon2.s.material.rotation = Math.sin(t * 0.05) * 0.1;
    this.moon2.s.visible = this.moon2.halo.visible = p.moon2 > 0.01;
    // fires & smoke (hidden outright when out, so they cost no draws)
    this.fires.forEach((f, i) => {
      const b = f.b, o = p.burn * b.burn * (0.6 + 0.4 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph)) * (0.4 + night * 0.6);
      this.fireBB.set(i, b.x + f.ox, b.y + b.h * 0.6, b.z + f.oz, Math.max(b.w, b.d) * 1.6, b.h * 0.9, 1.0, 0.4, 0.05, o);
    });
    this.fireBB.flush(p.burn > 0.01);
    // dark oily plumes boiling up off the roofs and leaning north-east on the wind, toward us
    const sc = C(0.05, 0.045, 0.04);
    this.smokes.forEach((s, i) => {
      const b = s.b, u = ((t * 0.035 + s.ph * 0.1 + s.k / 5) % 1), rise = u * 260, sz = 30 + Math.sqrt(b.w * b.d) * 0.6 + rise * 0.7;
      this.smokeBB.set(i, b.x + Math.sin(t * 0.1 + s.ph) * 8 - rise * 0.45, b.y + b.h + 10 + rise, b.z + rise * 0.6, sz, sz, sc.r, sc.g, sc.b, p.smoke * b.burn * 0.6 * Math.min(1, u * 8, (1 - u) * 3));
    });
    this.smokeBB.flush(p.smoke > 0.01);
    for (const m of this.motes) {
      m.a += m.sp * dt;
      m.s.position.set(Math.cos(m.a) * m.r * 0.6, m.y + Math.sin(t * 0.7 + m.r) * 20, m.z + Math.sin(m.a) * 300);
      m.s.material.opacity = p.lights * (0.5 + 0.5 * Math.sin(t * 2 + m.r)) * (0.3 + night * 0.7);
      m.s.visible = p.lights > 0.01;
    }
    this.beamMat.uniforms.op.value = p.lights * night * 0.12;
    for (const b of this.beams) {
      b.m.visible = p.lights * night > 0.01;
      b.m.position.set(b.x + Math.sin(t * 0.13 + b.ph) * 300, 900, -1500 + Math.cos(t * 0.1 + b.ph) * 200);
      b.m.rotation.set(Math.sin(t * 0.2 + b.ph) * 0.35, 0, Math.cos(t * 0.17 + b.ph) * 0.35);
    }
    // ship hovering high over Manhattan on late days (the menu drives it directly)
    if (!this.cinematic) {
      this.ship.visible = p.ship > 0.01;
      if (this.ship.visible) {
        this.ship.position.set(-120, 1150 - p.ship * 380 + Math.sin(t * 0.05) * 20, -2600);
        this.ship.rotation.set(0.06, -0.4 + Math.sin(t * 0.02) * 0.05, -0.04);
        this.shipLight.intensity = 0;
      }
    }
    this.updateBlasts(dt);
    this.bgHemi.intensity = 0.25 + (1 - night) * 1.2;
    this.bgHemi.color.copy(zen).lerp(hor, 0.5);
    this.bgSun.position.copy(p.sunDir); this.bgSun.intensity = (1 - night) * 1.5;
    this.interior(p);
  }

  // the light that comes in through the windows: kept on the original
  // palette so the apartment reads the same whatever the sky outside does
  interior(p) {
    const night = p.night, red = p.red;
    const lowSun = clamp(1 - Math.abs(p.sunDir.y) * 4, 0, 1) * (1 - night * 0.6);
    const zen = C(0.22, 0.42, 0.78).lerp(C(0.01, 0.012, 0.025), night).lerp(C(0.25, 0.06, 0.04).multiplyScalar(1 - night * 0.6), red * 0.7);
    const hor = C(0.68, 0.76, 0.86).lerp(C(0.95, 0.55, 0.3), lowSun * 0.7).lerp(C(0.05, 0.05, 0.07), night).lerp(C(0.7, 0.25, 0.1).multiplyScalar(1 - night * 0.5), red * 0.6);
    if (p.burn > 0.3) hor.lerp(C(0.35, 0.12, 0.05), p.burn * night * 0.6);
    const sunCol = C(1, 0.85 - lowSun * 0.3, 0.65 - lowSun * 0.4).multiplyScalar(p.sunBoost);
    const sv = (1 - night) * (1 - p.smoke * 0.6) * this.sunVis;
    this.sun.color.copy(sunCol).lerp(C(1, 0.5, 0.3), red * 0.4);
    this.sun.intensity = sv * 2.4 * clamp(p.sunDir.y * 3, 0, 1) * p.sunBoost;
    const anchor = new THREE.Vector3(5, 0, 3.5);
    this.sun.target.position.copy(anchor);
    this.sun.position.copy(anchor).addScaledVector(p.sunDir, 30);
    this.sun.shadow.autoUpdate = this.sun.intensity > 0.02;
    this.hemi.color.copy(zen).lerp(C(1, 1, 1), 0.3);
    this.hemi.groundColor.setRGB(0.18, 0.14, 0.1);
    this.hemi.intensity = (0.06 + (1 - night) * 0.32 + p.burn * night * 0.05) * (this.hemiBoost ?? 1);
    const winCol = hor.clone().lerp(zen, 0.3);
    if (p.burn > 0.3) winCol.lerp(C(0.9, 0.35, 0.12), p.burn * night * 0.5);
    for (const w of this.windowLights) {
      w.l.color.copy(winCol);
      w.l.intensity = (0.25 + (1 - night) * 2.2 + p.burn * night * 0.6 + p.lights * night * 0.25) * w.w * (this.windowBoost ?? 1);
    }
  }

  // ---------------------------------------------------------- crash cinematic helpers
  // collapse a tower: k = remaining height fraction
  setTower(i, k, burn = 1) { const t = this.landmarks.towers[i]; this.landmarks.setCut(i, t.h * k + (k >= 1 ? 1e5 : 0)); }
  resetTowers() { this.landmarks.reset(); if (this.shipObj) this.shipObj.reset(); if (this.debris) this.debris.clear(); this.shock = null; }
  blast(pos, n = 8, size = 120, spread = 60) {
    for (let i = 0; i < n; i++) {
      const b = this.blasts.find((x) => x.t < 0) || this.blasts[i % this.blasts.length];
      b.t = 0; b.life = 1.5 + Math.random() * 2.5;
      b.s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      b.v.set((Math.random() - 0.5) * 40, 20 + Math.random() * 40, (Math.random() - 0.5) * 40);
      b.size = size * (0.6 + Math.random() * 0.8);
      b.s.visible = true;
    }
  }
  updateBlasts(dt) {
    for (const b of this.blasts) {
      if (b.t < 0) continue;
      b.t += dt;
      const f = b.t / b.life;
      if (f >= 1) { b.t = -1; b.s.material.opacity = 0; b.s.visible = false; continue; }
      b.s.position.addScaledVector(b.v, dt);
      b.s.scale.setScalar(b.size * (0.5 + f * 1.6));
      b.s.material.opacity = (1 - f) * 0.9;
      b.s.material.color.setRGB(1, 0.8 - f * 0.5, 0.6 - f * 0.5);
    }
  }

  // render as the background pass
  render(renderer, mainCam) {
    // the apartment is ~40 floors up: the outside is seen from LIFT metres higher
    this.cam.position.copy(mainCam.position); this.cam.position.y += LIFT;
    this.cam.quaternion.copy(mainCam.quaternion);
    this.cam.fov = mainCam.fov; this.cam.aspect = mainCam.aspect;
    this.cam.updateProjectionMatrix();
    this.dome.position.copy(this.cam.position);
    renderer.render(this.scene, this.cam);
  }
}
