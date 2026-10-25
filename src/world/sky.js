// The outside, rendered as a separate background pass with its own far plane:
// sky shader (sun, clouds, stars), two moons, Jersey City waterfront, the
// Hudson, the Manhattan skyline with the Twin Towers, fires/smoke, alien
// lights, searchlights and the biomechanical ship. Also drives sun/ambient
// lighting for the interior. -z is east (toward Manhattan).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { G } from '../core/globals.js';
import { clamp, lerp, smoothstep, RNG, damp } from '../core/util.js';
import { makeCanvas, toTexture, radial } from '../gfx/textures.js';
import { Landmarks } from './city.js';
import { Ship } from './ship.js';
import { Debris } from './debris.js';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 groundCol; uniform vec3 sunCol;
uniform float time; uniform float cloudCover; uniform vec3 cloudCol; uniform float stars; uniform float sunVis; uniform float smoke; uniform vec3 smokeCol;
uniform float lights; uniform float burnGlow; uniform float flash;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, groundCol, smoothstep(0.0, -0.08, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunCol * (pow(s, 900.0) * 40.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.25) * sunVis;
  if (h > 0.005) {
    vec2 p = d.xz / (h + 0.08) * 0.9 + vec2(time * 0.004, time * 0.0015);
    float c = fbm(p * 1.6);
    float cov = smoothstep(1.0 - cloudCover, 1.05 - cloudCover * 0.4, c);
    vec3 cc = cloudCol * (0.75 + 0.35 * fbm(p * 4.0 + 3.0)) + sunCol * pow(s, 8.0) * 0.5 * sunVis;
    // the burning city lights the bellies of the clouds from below, strongest over Manhattan
    float east = smoothstep(0.2, -0.9, d.z);
    cc += vec3(0.9, 0.32, 0.1) * burnGlow * east * (0.35 + 0.65 * (1.0 - fbm(p * 2.2 + 9.0))) * smoothstep(0.6, 0.02, h);
    // energy discharges inside the cloud deck
    cc += vec3(0.7, 0.9, 1.0) * flash * smoothstep(0.4, 0.8, fbm(p * 0.9 + 21.0)) * 2.5;
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, h) * 0.95);
    // light dome over the city at night
    col += vec3(0.32, 0.18, 0.09) * burnGlow * east * exp(-h * 9.0) * 0.6;
    // alien aurora: tall curtains of green light, folding slowly
    if (lights > 0.0) {
      float ax = d.x / (h + 0.25);
      float fold = fbm(vec2(ax * 1.4 + time * 0.03, time * 0.02));
      float curtain = smoothstep(0.55, 0.0, abs(fract(ax * 0.9 + fold * 1.6) - 0.5)) * smoothstep(0.08, 0.3, h) * smoothstep(0.85, 0.4, h);
      float rays = 0.6 + 0.4 * fbm(vec2(ax * 18.0, h * 2.0 - time * 0.2));
      col += vec3(0.15, 0.85, 0.5) * curtain * rays * lights * 0.35 * (1.0 - cov * 0.7);
    }
    // smoke haze from the burning city, thick low on the horizon
    float sm = fbm(vec2(d.x * 6.0 + time * 0.01, h * 18.0 - time * 0.02));
    col = mix(col, smokeCol * (0.6 + sm * 0.6), smoke * smoothstep(0.45, 0.0, h) * (0.4 + sm * 0.6));
    // stars
    vec2 sp = d.xz / (h + 0.3) * 220.0;
    float st = step(0.9975, hash(floor(sp))) * stars * smoothstep(0.05, 0.3, h);
    col += st * (0.6 + 0.4 * sin(time * 3.0 + hash(floor(sp)) * 40.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Buildings: procedural windows computed from local position + instance size
const BLD_VS = /* glsl */`
attribute vec4 iData; // x: seed, y: lit fraction mod, z: burn, w: tint
attribute vec3 iSize;
varying vec3 vLocal; varying vec3 vSize; varying vec4 vData; varying vec3 vN; varying vec3 vWorld;
void main(){
  vLocal = position * iSize; vSize = iSize; vData = iData; vN = normal;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BLD_FS = /* glsl */`
uniform float night; uniform float litFrac; uniform float time; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 dayCol; uniform float burnAmt; uniform float blackout;
varying vec3 vLocal; varying vec3 vSize; varying vec4 vData; varying vec3 vN; varying vec3 vWorld;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN);
  // facade coords
  vec2 f = abs(n.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : abs(n.z) > 0.5 ? vec2(vLocal.x, vLocal.y) : vec2(vLocal.x, vLocal.z);
  vec2 cell = vec2(3.2, 3.6) * (0.85 + vData.w * 0.3);
  vec2 g = f / cell;
  vec2 gi = floor(g), gf = fract(g);
  float win = step(0.22, gf.x) * step(gf.x, 0.78) * step(0.25, gf.y) * step(gf.y, 0.8);
  if (abs(n.y) > 0.5) win = 0.0;
  float rnd = hash(vec3(gi, vData.x + n.x * 3.0 + n.z * 7.0));
  float lit = step(rnd, litFrac * vData.y * (1.0 - blackout * step(0.5, fract(vData.x * 7.3))));
  vec3 base = mix(vec3(0.42, 0.40, 0.38), vec3(0.55, 0.5, 0.44), vData.w);
  float light = clamp(dot(n, normalize(sunDir)) * 0.6 + 0.5, 0.15, 1.0);
  vec3 col = base * dayCol * light;
  vec3 glass = mix(vec3(0.18, 0.22, 0.28), dayCol * 0.8, 0.4 + 0.3 * rnd);
  col = mix(col, glass * light, win * (1.0 - night * 0.6));
  // night: dark facades, warm windows
  vec3 wcol = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.85, 1.0), step(0.8, rnd)) * (0.8 + 0.4 * rnd);
  col = mix(col, col * 0.12, night);
  col += win * lit * wcol * night * 1.6;
  // burning: charred with glowing orange windows that flicker
  float burn = vData.z * burnAmt;
  if (burn > 0.0) {
    float fl = 0.6 + 0.4 * sin(time * 9.0 + rnd * 40.0) * sin(time * 5.3 + rnd * 12.0);
    float fireWin = win * step(rnd, 0.55 * burn) * step(f.y, vSize.y * (0.4 + 0.6 * rnd));
    col = mix(col, col * 0.25, burn * 0.8);
    col += fireWin * vec3(1.8, 0.6, 0.12) * fl * 2.0;
  }
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-dist * fogDensity);
  col = mix(col, fogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_FS = /* glsl */`
uniform vec3 skyCol; uniform vec3 deep; uniform float time; uniform float night; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 sunCol; uniform float fire; uniform vec4 shock;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 v = normalize(vWorld - cameraPosition);
  float w = noise(vWorld.xz * 0.05 + vec2(time * 0.2, time * 0.05)) * 0.5 + noise(vWorld.xz * 0.2 - time * 0.3) * 0.5;
  float fres = pow(1.0 - max(-v.y, 0.0), 4.0);
  vec3 col = mix(deep, skyCol, 0.25 + fres * 0.6);
  // sun glint / city light streaks
  vec3 r = reflect(v, vec3(0.0, 1.0, 0.0));
  float sg = pow(max(dot(r, normalize(sunDir)), 0.0), 200.0) * (0.5 + w);
  col += sunCol * sg * 3.0 * (1.0 - night);
  float streak = step(0.75, noise(vec2(vWorld.x * 0.08, vWorld.z * 0.6 + time))) * night * smoothstep(-1600.0, -1100.0, vWorld.z);
  col += streak * vec3(1.0, 0.75, 0.4) * 0.35 * (0.5 + w);
  col *= 1.0 - night * 0.45;
  col += fire * vec3(0.9, 0.3, 0.05) * smoothstep(-1500.0, -1150.0, vWorld.z) * (0.12 + w * 0.25);
  // the blast's shock ring racing across the river
  if (shock.w > 0.0) { float sd = abs(length(vWorld.xz - shock.xy) - shock.z); col += vec3(0.9, 0.85, 0.8) * smoothstep(40.0, 0.0, sd) * shock.w * 0.8; }
  float dist = length(vWorld - cameraPosition);
  col = mix(col, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

function moonTexture(red) {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, red ? '#f0c8b0' : '#f4f2e8'); g.addColorStop(0.85, red ? '#c88a70' : '#d8d6cc'); g.addColorStop(1, red ? '#8a4a3a' : '#a8a69c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  const rng = new RNG(red ? 7 : 3);
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * 52, r = rng.range(2, i < 6 ? 16 : 6);
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    ctx.fillStyle = `rgba(${red ? '90,40,30' : '120,118,110'},${rng.range(0.2, 0.5)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (red) { // a dark "iris" — the second moon looks like an eye
    ctx.fillStyle = 'rgba(60,10,10,0.55)'; ctx.beginPath(); ctx.ellipse(64, 64, 9, 22, 0, 0, Math.PI * 2); ctx.fill();
  }
  const t = toTexture(c, { nearest: false, repeat: false });
  return t;
}

function mergeTankGeo(parts) { return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false); }

export class Sky {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(72, 1, 1, 9000);
    this.p = { // live parameters (blended toward targets)
      dayT: 0.1, night: 0, cloud: 0.35, smoke: 0, burn: 0, red: 0, moon2: 0, lights: 0, ship: 0, litFrac: 0.4, blackout: 0, sunBoost: 1,
    };
    this.time = 0;
    const sky = this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 0.2, -1) }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, groundCol: { value: new THREE.Color(0x222428) },
        sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, time: { value: 0 }, cloudCover: { value: 0.4 }, cloudCol: { value: new THREE.Color(1, 1, 1) }, stars: { value: 0 }, sunVis: { value: 1 },
        smoke: { value: 0 }, smokeCol: { value: new THREE.Color(0.2, 0.15, 0.12) }, lights: { value: 0 }, burnGlow: { value: 0 }, flash: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), sky);
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);
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
    const rng = new RNG(1999);
    const list = [];
    const add = (x, z, w, d, h, o = {}) => list.push({ x, z, w, d, h, seed: rng.range(0, 100), lit: o.lit ?? rng.range(0.6, 1.3), burn: o.burn ?? 0, tint: rng.next(), y: o.y ?? -14, name: o.name });
    // landmarks are modelled separately; keep the filler clear of them
    const keep = [[-42, -1380, 80], [-118, -1450, 80], [-24, -1312, 45], [-95, -1395, 30], [-60, -1490, 55], [-175, -1500, 35], [-190, -1560, 45],
      [-210, -1210, 40], [-130, -1180, 40], [-40, -1185, 40], [40, -1215, 40], [420, -1820, 50], [-520, -1980, 35], [-610, -2050, 30], [3800, -2950, 90], [4650, -3500, 50]];
    const clear = (x, z, w) => keep.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) > r + w * 0.6);
    this.roofs = [];
    const tower = (x, z, w, d, h, o) => {
      if (!clear(x, z, Math.max(w, d))) return;
      add(x, z, w, d, h, o);
      // older towers step back near the top; mid-rise roofs carry water tanks
      if (h > 110 && rng.next() < 0.45) add(x, z, w * 0.7, d * 0.7, h * rng.range(0.15, 0.3), { y: -14 + h, burn: o.burn });
      if (h > 40 && h < 140 && rng.next() < 0.35) this.roofs.push(new THREE.Vector3(x + rng.range(-w, w) * 0.3, -14 + h, z + rng.range(-d, d) * 0.3));
    };
    // Lower Manhattan: shoreline at z ~ -1150, densest around the Financial District
    for (let i = 0; i < 620; i++) {
      const x = rng.range(-1100, 2600), z = rng.range(-1250, -2900);
      if (x < -900 && z > -1600) continue;            // the Battery is a park
      const core = Math.exp(-((x + 250) ** 2) / (2 * 420 ** 2)) * Math.exp(-((z + 1800) ** 2) / (2 * 500 ** 2));
      const h = 18 + rng.next() ** 2 * 150 * (0.35 + core * 1.6);
      tower(x, z, rng.range(22, 55), rng.range(22, 55), h, { burn: rng.next() < 0.5 ? rng.range(0.4, 1) : 0 });
    }
    // Midtown, far off to the north-east
    for (let i = 0; i < 260; i++) {
      const x = rng.range(2900, 5600), z = rng.range(-2500, -3900);
      const h = 40 + rng.next() ** 1.6 * 230;
      tower(x, z, rng.range(25, 60), rng.range(25, 60), h, { burn: rng.next() < 0.3 ? rng.range(0.3, 0.8) : 0 });
    }
    // Jersey City waterfront (near): low/mid rise around our building, both sides
    for (let i = 0; i < 160; i++) {
      const x = rng.range(-700, 700);
      const z = rng.range(-30, 300);
      if (Math.abs(x) < 45 && z < 120) continue; // our block / street
      const h = 8 + rng.next() ** 1.5 * 50;
      add(x, z, rng.range(14, 40), rng.range(14, 40), h, { burn: rng.next() < 0.35 ? rng.range(0.3, 1) : 0 });
    }
    // a couple of near neighbours framing the view
    add(-40, -10, 28, 30, 32); add(42, -6, 26, 26, 26);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const n = list.length;
    const mat = this.bldMat = new THREE.ShaderMaterial({
      vertexShader: BLD_VS, fragmentShader: BLD_FS,
      uniforms: { night: { value: 0 }, litFrac: { value: 0.4 }, time: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3() }, dayCol: { value: new THREE.Color(1, 1, 1) }, burnAmt: { value: 0 }, blackout: { value: 0 } },
    });
    const mesh = this.city = new THREE.InstancedMesh(geo, mat, n);
    const data = new Float32Array(n * 4), size = new Float32Array(n * 3);
    const m = new THREE.Matrix4();
    list.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      data.set([b.seed, b.lit, b.burn, b.tint], i * 4);
      size.set([b.w, b.h, b.d], i * 3);
      b.index = i;
    });
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 3));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.buildings = list;
    // rooftop water tanks: a barrel on stilts with a cone hat
    {
      const parts = [new THREE.CylinderGeometry(3.2, 3.4, 6, 8).translate(0, 7, 0), new THREE.ConeGeometry(3.6, 2.4, 8).translate(0, 11.2, 0)];
      for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) parts.push(new THREE.CylinderGeometry(0.25, 0.25, 4, 3).translate(dx, 2, dz));
      const tg = mergeTankGeo(parts);
      const tm = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x3a3028, fog: false }), this.roofs.length);
      const mm = new THREE.Matrix4();
      this.roofs.forEach((p, i) => { mm.makeTranslation(p.x, p.y, p.z); tm.setMatrixAt(i, mm); });
      this.scene.add(tm); this.tanks = tm;
    }
    this.landmarks = new Landmarks(this.scene);
    // street + promenade below our window
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 440), new THREE.MeshBasicMaterial({ color: 0x1d1d1f }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -13.9, 186);
    // promenade railing edge
    const edge = new THREE.Mesh(new THREE.BoxGeometry(3000, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x0c0c0d }));
    edge.position.set(0, -13.3, -34); this.scene.add(edge);
    this.scene.add(ground); this.ground = ground;
    // streetlights (sprites)
    const lampMat = new THREE.SpriteMaterial({ map: radial({ size: 64, inner: 'rgba(255,210,140,1)', outer: 'rgba(255,170,90,0)' }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.lamps = [];
    for (let i = -12; i <= 12; i++) {
      const s = new THREE.Sprite(lampMat); s.position.set(i * 24, -6, -38); s.scale.set(5, 5, 1); this.scene.add(s); this.lamps.push(s);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 4), new THREE.MeshBasicMaterial({ color: 0x101012 })); pole.position.set(i * 24, -10, -38); this.scene.add(pole);
    }
    this.lampMat = lampMat;
    // parked cars
    const carMat = new THREE.MeshBasicMaterial({ color: 0x18181c });
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.5, 1.9), carMat); c.position.set(-160 + i * 23 + rng.range(-4, 4), -13.1, -30 + (i % 2) * 2); this.scene.add(c); }
  }

  buildWater() {
    const mat = this.waterMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: WATER_FS,
      uniforms: { skyCol: { value: new THREE.Color() }, deep: { value: new THREE.Color(0x0e1a20) }, time: { value: 0 }, night: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, fire: { value: 0 }, shock: { value: new THREE.Vector4(0, 0, 0, 0) } },
    });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(6000, 1250), mat);
    w.rotation.x = -Math.PI / 2; w.position.set(0, -15, -660);
    this.scene.add(w);
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
    // fire glows + smoke columns (sprites) over burning buildings
    const fireMap = radial({ size: 64, inner: 'rgba(255,170,60,1)', outer: 'rgba(255,60,0,0)' });
    const smokeMap = radial({ size: 64, inner: 'rgba(40,34,30,0.9)', outer: 'rgba(40,34,30,0)' });
    this.fires = []; this.smokes = [];
    const burning = this.buildings.filter((b) => b.burn > 0.5 && b.z < -1000).slice(0, 60);
    for (const b of burning) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      f.position.set(b.x, b.y + b.h * 0.6, b.z + b.d / 2 + 5); f.scale.set(b.w * 2.2, b.h * 0.9, 1);
      this.scene.add(f); this.fires.push({ s: f, b, ph: Math.random() * 10 });
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, depthWrite: false, transparent: true, opacity: 0 }));
        s.position.set(b.x, b.y + b.h + 40 + k * 90, b.z); s.scale.set(140 + k * 60, 140 + k * 60, 1);
        this.scene.add(s); this.smokes.push({ s, b, k, ph: Math.random() * 10 });
      }
    }
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
      this.scene.add(s); this.blasts.push({ s, t: -1, v: new THREE.Vector3(), life: 1 });
    }
    const hemi = new THREE.HemisphereLight(0x606870, 0x101010, 1.2);
    this.scene.add(hemi); this.bgHemi = hemi;
    const bgSun = new THREE.DirectionalLight(0xffffff, 1); bgSun.position.set(0, 1, 1); this.scene.add(bgSun); this.bgSun = bgSun;
  }

  // ---------------------------------------------------------- presets
  // day: 1..7, t: 0..1 through the waking day (07:00 .. 23:00)
  preset(day, t, menu = false) {
    const P = {};
    // sun path: rises in the east (-z), climbs, sets west behind us (+z)
    const hours = 7 + t * 16;
    P.hours = hours;
    const sunA = ((hours - 6) / 14) * Math.PI; // 6:00 -> 0, 20:00 -> PI
    P.sunDir = new THREE.Vector3(0.25, Math.sin(sunA) * 0.85, -Math.cos(sunA)).normalize();
    const dayAmt = clamp(smoothstep(-0.06, 0.18, P.sunDir.y), 0, 1);
    P.night = 1 - dayAmt;
    P.cloud = [0, 0.35, 0.45, 0.6, 0.7, 0.8, 0.9, 0.95][day] ?? 0.5;
    P.smoke = [0, 0, 0.05, 0.25, 0.45, 0.75, 0.9, 1][day] ?? 0;
    P.burn = [0, 0, 0, 0.2, 0.5, 0.85, 1, 1][day] ?? 0;
    P.red = [0, 0, 0, 0.12, 0.35, 0.55, 0.75, 1][day] ?? 0;
    P.moon2 = day >= 2 ? (day === 2 ? 0.45 : 1) : 0;
    P.lights = [0, 0, 0, 0.4, 0.6, 0.9, 1, 1][day] ?? 0;
    P.ship = day >= 5 ? (day - 4) / 3 : 0;
    P.litFrac = [0.5, 0.55, 0.5, 0.35, 0.25, 0.15, 0.08, 0][day] ?? 0.4;
    P.blackout = day >= 4 ? 0.6 : 0;
    if (menu) Object.assign(P, { night: 1, smoke: 0.85, burn: 0.95, red: 0.6, moon2: 1, lights: 1, ship: 1, litFrac: 0.12, blackout: 0.7, cloud: 0.75, sunDir: new THREE.Vector3(0.3, -0.4, 0.8).normalize() });
    return P;
  }
  apply(P, snap = false) {
    const p = this.p;
    const k = snap ? 1 : 0.02;
    for (const key of ['night', 'cloud', 'smoke', 'burn', 'red', 'moon2', 'lights', 'ship', 'litFrac', 'blackout']) if (P[key] !== undefined) p[key] = lerp(p[key], P[key], k);
    if (P.sunDir) { if (!p.sunDir) p.sunDir = P.sunDir.clone(); else p.sunDir.lerp(P.sunDir, snap ? 1 : 0.05).normalize(); }
  }

  update(dt, cam) {
    this.time += dt;
    const p = this.p;
    const t = this.time;
    const night = p.night, red = p.red;
    // colours
    const dayZen = new THREE.Color(0.22, 0.42, 0.78), dayHor = new THREE.Color(0.68, 0.76, 0.86);
    const sunsetHor = new THREE.Color(0.95, 0.55, 0.3);
    const nightZen = new THREE.Color(0.01, 0.012, 0.025), nightHor = new THREE.Color(0.05, 0.05, 0.07);
    const redZen = new THREE.Color(0.25, 0.06, 0.04), redHor = new THREE.Color(0.7, 0.25, 0.1);
    const lowSun = clamp(1 - Math.abs(p.sunDir.y) * 4, 0, 1) * (1 - night * 0.6);
    const zen = dayZen.clone().lerp(nightZen, night).lerp(redZen.clone().multiplyScalar(1 - night * 0.6), red * 0.7);
    const hor = dayHor.clone().lerp(sunsetHor, lowSun * 0.7).lerp(nightHor, night).lerp(redHor.clone().multiplyScalar(1 - night * 0.5), red * 0.6);
    if (p.burn > 0.3) hor.lerp(new THREE.Color(0.35, 0.12, 0.05), p.burn * night * 0.6);
    const u = this.skyMat.uniforms;
    u.zenith.value.copy(zen); u.horizon.value.copy(hor); u.sunDir.value.copy(p.sunDir);
    u.sunCol.value.setRGB(1, 0.85 - lowSun * 0.3, 0.65 - lowSun * 0.4).multiplyScalar(p.sunBoost);
    u.time.value = t; u.cloudCover.value = p.cloud; u.stars.value = night * (1 - p.smoke * 0.7);
    u.cloudCol.value.copy(hor).lerp(new THREE.Color(1, 1, 1), (1 - night) * 0.6).multiplyScalar(1 - night * 0.7);
    u.sunVis.value = (1 - night) * (1 - p.smoke * 0.5);
    u.smoke.value = p.smoke; u.smokeCol.value.setRGB(0.16 + red * 0.2, 0.12, 0.1).multiplyScalar(1 - night * 0.4);
    // buildings
    const bu = this.bldMat.uniforms;
    bu.night.value = night; bu.litFrac.value = p.litFrac; bu.time.value = t; bu.fogCol.value.copy(hor); bu.sunDir.value.copy(p.sunDir);
    bu.dayCol.value.setRGB(1, 0.95, 0.9).lerp(new THREE.Color(1, 0.6, 0.4), red * 0.5); bu.burnAmt.value = p.burn; bu.blackout.value = p.blackout;
    bu.fogDensity.value = 0.00011 + p.smoke * 0.00026;
    const wu = this.waterMat.uniforms;
    wu.skyCol.value.copy(hor); wu.time.value = t; wu.night.value = night; wu.fogCol.value.copy(hor); wu.sunDir.value.copy(p.sunDir); wu.sunCol.value.copy(u.sunCol.value); wu.fire.value = p.burn * night;
    wu.fogDensity.value = bu.fogDensity.value;
    // shared outdoor state for the landmarks, the ship and the debris
    const sh = this.shared || (this.shared = { fogCol: new THREE.Color(), skyCol: new THREE.Color(), sunDir: new THREE.Vector3(), dayCol: new THREE.Color() });
    sh.night = night; sh.litFrac = p.litFrac; sh.fogCol.copy(hor); sh.fogDensity = bu.fogDensity.value; sh.sunDir.copy(p.sunDir);
    sh.dayCol.copy(bu.dayCol.value); sh.skyCol.copy(zen).lerp(hor, 0.55); sh.blackout = p.blackout; sh.burn = p.burn;
    this.landmarks.update(t, sh);
    this.shipObj.update(dt, t, sh);
    this.debris.update(dt, sh);
    u.lights.value = p.lights * night; u.burnGlow.value = p.burn * night; u.flash.value = Math.max(0, (u.flash.value || 0) - dt * 2.5);
    if (wu.shock) { if (this.shock) { this.shock.r += dt * 340; wu.shock.value.set(this.shock.x, this.shock.z, this.shock.r, Math.max(0, 1 - this.shock.r / 2500)); } else wu.shock.value.w = 0; }
    // moons (east-ish, high)
    const md1 = new THREE.Vector3(-0.35, 0.32, -1).normalize(), md2 = new THREE.Vector3(0.45, 0.2, -1).normalize();
    this.moon1.s.position.copy(cam.position).addScaledVector(md1, 5000);
    this.moon1.halo.position.copy(this.moon1.s.position);
    this.moon1.s.material.opacity = clamp(0.25 + night, 0, 1); this.moon1.halo.material.opacity = night;
    this.moon2.s.position.copy(cam.position).addScaledVector(md2, 5000);
    this.moon2.halo.position.copy(this.moon2.s.position);
    this.moon2.s.material.opacity = p.moon2 * clamp(0.3 + night, 0, 1); this.moon2.halo.material.opacity = p.moon2 * night;
    this.moon2.s.material.rotation = Math.sin(t * 0.05) * 0.1;
    // fires & smoke
    for (const f of this.fires) {
      const on = p.burn * f.b.burn;
      f.s.material.opacity = on * (0.6 + 0.4 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph)) * (0.4 + night * 0.6);
    }
    for (const s of this.smokes) {
      const on = p.smoke * s.b.burn;
      s.s.material.opacity = on * 0.55;
      s.s.position.y = s.b.y + s.b.h + 40 + s.k * 90 + ((t * 6 + s.ph * 20) % 90);
      s.s.position.x = s.b.x + Math.sin(t * 0.1 + s.ph) * 30 + s.k * 25;
      s.s.material.color.setRGB(0.5 + 0.5 * (1 - night), 0.45 + 0.4 * (1 - night), 0.4 + 0.4 * (1 - night));
    }
    for (const m of this.motes) {
      m.a += m.sp * dt;
      m.s.position.set(Math.cos(m.a) * m.r * 0.6, m.y + Math.sin(t * 0.7 + m.r) * 20, m.z + Math.sin(m.a) * 300);
      m.s.material.opacity = p.lights * (0.5 + 0.5 * Math.sin(t * 2 + m.r)) * (0.3 + night * 0.7);
    }
    this.beamMat.uniforms.op.value = p.lights * night * 0.12;
    for (const b of this.beams) {
      b.m.position.set(b.x + Math.sin(t * 0.13 + b.ph) * 300, 900, -1500 + Math.cos(t * 0.1 + b.ph) * 200);
      b.m.rotation.set(Math.sin(t * 0.2 + b.ph) * 0.35, 0, Math.cos(t * 0.17 + b.ph) * 0.35);
    }
    // ship hovering high over Manhattan on late days (the menu drives it directly)
    if (!this.cinematic) {
      this.ship.visible = p.ship > 0.01;
      if (this.ship.visible) {
        this.ship.position.set(-260, 1150 - p.ship * 380 + Math.sin(t * 0.05) * 20, -2400);
        this.ship.rotation.set(0.06, 1.25 + Math.sin(t * 0.02) * 0.05, 0.04);
        this.shipLight.intensity = 0;
      }
    }
    this.updateBlasts(dt);
    this.lampMat.opacity = clamp(night * 1.4 - 0.2, 0, 1) * (1 - p.blackout * 0.7);
    this.bgHemi.intensity = 0.25 + (1 - night) * 1.2;
    this.bgHemi.color.copy(zen).lerp(hor, 0.5);
    this.bgSun.position.copy(p.sunDir); this.bgSun.intensity = (1 - night) * 1.5;

    // ---- interior lighting
    const sv = (1 - night) * (1 - p.smoke * 0.6) * this.sunVis;
    this.sun.color.copy(u.sunCol.value).lerp(new THREE.Color(1, 0.5, 0.3), red * 0.4);
    this.sun.intensity = sv * 2.4 * clamp(p.sunDir.y * 3, 0, 1) * p.sunBoost;
    const c = G.player ? G.player.ctrl.body.position : { x: 6, y: 0, z: 3 };
    const anchor = new THREE.Vector3(5, 0, 3.5);
    this.sun.target.position.copy(anchor);
    this.sun.position.copy(anchor).addScaledVector(p.sunDir, 30);
    this.sun.shadow.autoUpdate = this.sun.intensity > 0.02;
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.3);
    this.hemi.groundColor.setRGB(0.18, 0.14, 0.1);
    this.hemi.intensity = (0.06 + (1 - night) * 0.32 + p.burn * night * 0.05) * (this.hemiBoost ?? 1);
    const winCol = hor.clone().lerp(zen, 0.3);
    if (p.burn > 0.3) winCol.lerp(new THREE.Color(0.9, 0.35, 0.12), p.burn * night * 0.5);
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
    }
  }
  updateBlasts(dt) {
    for (const b of this.blasts) {
      if (b.t < 0) continue;
      b.t += dt;
      const f = b.t / b.life;
      if (f >= 1) { b.t = -1; b.s.material.opacity = 0; continue; }
      b.s.position.addScaledVector(b.v, dt);
      b.s.scale.setScalar(b.size * (0.5 + f * 1.6));
      b.s.material.opacity = (1 - f) * 0.9;
      b.s.material.color.setRGB(1, 0.8 - f * 0.5, 0.6 - f * 0.5);
    }
  }

  // render as the background pass
  render(renderer, mainCam) {
    this.cam.position.copy(mainCam.position);
    this.cam.quaternion.copy(mainCam.quaternion);
    this.cam.fov = mainCam.fov; this.cam.aspect = mainCam.aspect;
    this.cam.updateProjectionMatrix();
    this.dome.position.copy(mainCam.position);
    renderer.render(this.scene, this.cam);
  }
}
