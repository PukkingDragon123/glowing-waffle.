// Ported from bengrim (src/world/ship.js), unchanged apart from import paths.
// The ship: a 520 m hard-surface/biomechanical carrier. A lathe-turned hull in
// three sections, a counter-rotating ring on spokes, swept spines, engine
// bells, thousands of greebles, deck lights and veins that pulse. Every part
// is its own rigid body so the crash can tear it apart.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, clamp } from '../core/util.js';
import { radial } from '../gfx/textures.js';

const HULL_VS = /* glsl */`
attribute vec3 aOffset;
varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
void main(){
  vObj = position + aOffset;
  #ifdef USE_INSTANCING
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
  #endif
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HULL_FS = /* glsl */`
uniform float time; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 keyDir; uniform vec3 keyCol; uniform vec3 amb; uniform vec3 glowCol;
uniform float power; uniform float damage; uniform float tone; uniform float lightsOn;
varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y), mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
// panel plating, two scales, triplanar in object space
float panels(vec3 p, vec3 n, float sc, out float id) {
  vec3 a = abs(n);
  vec2 q = a.x > a.y && a.x > a.z ? p.yz : a.y > a.z ? p.xz : p.xy;
  q /= sc;
  vec2 c = floor(q);
  // split some cells in half for irregular plating
  float r = h3(vec3(c, 3.0));
  if (r > 0.6) { q.x *= 2.0; c = floor(q); }
  id = h3(vec3(c, 1.0));
  vec2 f = fract(q);
  vec2 fw = max(fwidth(q), vec2(1e-4));
  vec2 e = smoothstep(vec2(0.0), fw * 1.5, f) * smoothstep(vec2(0.0), fw * 1.5, 1.0 - f);
  return e.x * e.y;
}
void main(){
  vec3 n = normalize(vN);
  vec3 p = vObj;
  float id1, id2;
  float g1 = panels(p, n, 14.0, id1);
  float g2 = panels(p + 3.7, n, 4.0, id2);
  float grooves = g1 * mix(1.0, g2, 0.6);
  vec3 base = mix(vec3(0.16, 0.17, 0.19), vec3(0.3, 0.31, 0.33), id1 * 0.7 + id2 * 0.3) * tone;
  // bone-like biomech ribbing on the lower hull
  float rib = smoothstep(0.75, 1.0, sin(p.z * 0.35 + n3(p * 0.02) * 6.0)) * smoothstep(0.0, -0.6, n.y);
  base = mix(base, vec3(0.32, 0.3, 0.26), rib * 0.5);
  base *= 0.55 + 0.45 * grooves;
  // lighting: one key (fire/moon), soft ambient, metallic sheen
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = max(dot(n, keyDir), 0.0);
  vec3 hv = normalize(keyDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 40.0) * (0.4 + id1 * 0.6);
  // the burning city lights the belly from below; the sky gives a cold rim
  float under = max(-n.y, 0.0);
  vec3 c = base * (amb + keyCol * ndl + vec3(1.0, 0.45, 0.2) * under * 0.55) + keyCol * spec * 0.5;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  c += vec3(0.45, 0.55, 0.7) * fres * 0.35 + amb * fres * 0.6;
  // deck lights: rows of small windows in some panels
  float rowsMask = step(0.74, id2) * step(0.25, h3(vec3(floor(p.z / 9.0), 5.0, 2.0)));
  float win = rowsMask * (1.0 - g2 * 0.0) * step(0.35, fract(p.y * 0.25 + id1)) * step(fract(p.y * 0.25 + id1), 0.55);
  c += glowCol * win * lightsOn * power * 2.6;
  // veins: slow pulses travelling down the hull
  float vein = smoothstep(0.03, 0.0, abs(n3(p * 0.03) - 0.5)) * (0.5 + 0.5 * sin(p.z * 0.05 - time * 2.2));
  c += glowCol * vein * power * 0.9;
  // damage: scorched plating with molten cracks
  if (damage > 0.0) {
    float burnt = smoothstep(0.35, 0.75, n3(p * 0.035) + damage * 0.4);
    c = mix(c, c * 0.18, burnt * damage);
    float crack = smoothstep(0.03, 0.0, abs(n3(p * 0.09 + 11.0) - 0.5)) * burnt;
    c += vec3(1.8, 0.55, 0.12) * crack * damage * (0.6 + 0.4 * sin(time * 6.0 + p.x));
  }
  float dist = length(vWorld - cameraPosition);
  c = mix(c, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Ship {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'ship';
    scene.add(this.group);
    this.u = {
      time: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.0002 }, keyDir: { value: new THREE.Vector3(0.3, 0.6, 0.7).normalize() },
      keyCol: { value: new THREE.Color(0.9, 0.6, 0.4) }, amb: { value: new THREE.Color(0.08, 0.09, 0.1) }, glowCol: { value: new THREE.Color(0.35, 1.0, 0.75) },
      power: { value: 1 }, damage: { value: 0 }, tone: { value: 1 }, lightsOn: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: HULL_VS, fragmentShader: HULL_FS, uniforms: this.u });
    this.parts = [];
    this.build();
    this.lightMap = radial({ size: 32, inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)' });
    this.addLights();
    this.ringSpin = 0;
  }

  // a part = a group positioned in ship space that can later fly free
  part(name) {
    const g = new THREE.Group(); g.name = name;
    this.group.add(g);
    const p = { name, obj: g, vel: new THREE.Vector3(), ang: new THREE.Vector3(), free: false, mass: 1 };
    this.parts.push(p);
    return p;
  }
  mesh(geo, part, mat = this.mat) {
    if (!geo.attributes.aOffset) geo.setAttribute('aOffset', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    const m = new THREE.Mesh(geo, mat); part.obj.add(m); return m;
  }

  build() {
    const rng = new RNG(419);
    // --- hull profile (radius along the ship's length, z from -260 bow to +260 stern)
    const prof = (z) => {
      const t = (z + 260) / 520;
      return 8 + 70 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.75) * (1 - 0.35 * Math.max(0, t - 0.7) / 0.3) + 18 * Math.exp(-((t - 0.38) ** 2) / 0.004);
    };
    const section = (z0, z1, name) => {
      const pts = [];
      const N = 26;
      for (let i = 0; i <= N; i++) { const z = z0 + (z1 - z0) * (i / N); pts.push(new THREE.Vector2(prof(z), z)); }
      if (z0 <= -259) pts.unshift(new THREE.Vector2(0.01, z0));
      if (z1 >= 259) pts.push(new THREE.Vector2(0.01, z1));
      const g = new THREE.LatheGeometry(pts, 28);
      g.rotateX(Math.PI / 2);   // lathe axis y -> ship axis z
      g.scale(1, 0.62, 1);      // flattened, like a hull, not a tube
      const p = this.part(name);
      this.mesh(g, p);
      p.z0 = z0; p.z1 = z1;
      return p;
    };
    const bow = section(-260, -80, 'bow');
    const mid = section(-80, 90, 'mid');
    const stern = section(90, 260, 'stern');
    this.hull = [bow, mid, stern];
    // dorsal spine ridge and a keel
    for (const [p, z0, z1] of [[bow, -230, -80], [mid, -80, 90], [stern, 90, 230]]) {
      const ridge = new THREE.BoxGeometry(6, 14, z1 - z0); ridge.translate(0, prof((z0 + z1) / 2) * 0.62 + 4, (z0 + z1) / 2);
      this.mesh(ridge, p);
      const keel = new THREE.BoxGeometry(10, 10, (z1 - z0) * 0.8); keel.translate(0, -prof((z0 + z1) / 2) * 0.62 - 3, (z0 + z1) / 2);
      this.mesh(keel, p);
    }
    // --- engine bells at the stern
    for (const [x, y] of [[0, 0], [-34, -6], [34, -6]]) {
      const bell = new THREE.CylinderGeometry(9, 15, 24, 14, 1, true); bell.rotateX(Math.PI / 2); bell.translate(x, y, 266);
      this.mesh(bell, stern);
    }
    this.engines = [[0, 0, 280], [-34, -6, 280], [34, -6, 280]].map((e) => new THREE.Vector3(...e));
    // --- spines: six curved, tapering blades swept back from the bow
    const spines = this.part('spines');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const r = prof(-150) * 0.9 + t * 70 + Math.sin(t * Math.PI) * 25;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.7, -150 + t * 190));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 1, 6, false);
      // taper the radius along the tube
      const pa = tube.attributes.position, cen = new THREE.Vector3(), pt = new THREE.Vector3();
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let k = 0; k < pa.count; k++) {
        const seg = Math.floor(k / 7) / 24;
        curve.getPoint(Math.min(1, seg), cen);
        pt.fromBufferAttribute(pa, k).sub(cen).multiplyScalar(5.5 * (1 - seg * 0.85)).add(cen);
        pa.setXYZ(k, pt.x, pt.y, pt.z);
      }
      tube.computeVertexNormals();
      this.mesh(tube, spines);
    }
    // --- the ring: a broad band on four spokes, counter-rotating
    const ring = this.part('ring');
    const band = new THREE.CylinderGeometry(150, 150, 26, 64, 1, true); band.rotateX(Math.PI / 2); band.translate(0, 0, 0);
    const inner = new THREE.CylinderGeometry(140, 140, 22, 64, 1, true); inner.rotateX(Math.PI / 2);
    const rimA = new THREE.TorusGeometry(150, 4, 6, 64); rimA.translate(0, 0, 13);
    const rimB = new THREE.TorusGeometry(150, 4, 6, 64); rimB.translate(0, 0, -13);
    const parts = [band, inner, rimA, rimB];
    for (let i = 0; i < 4; i++) { const s = new THREE.BoxGeometry(6, 70, 10); s.translate(0, 105, 0); s.rotateZ((i / 4) * Math.PI * 2 + Math.PI / 4); parts.push(s); }
    const ringGeo = mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g), false);
    this.ringMesh = this.mesh(ringGeo, ring);
    ring.obj.position.set(0, 0, 20);
    ring.obj.scale.set(1, 0.72, 1);
    this.ring = ring;
    // ring band lights
    this.ringGlow = new THREE.Mesh(new THREE.TorusGeometry(150.5, 1.4, 4, 96), new THREE.MeshBasicMaterial({ color: 0x60ffc0, toneMapped: false }));
    this.ringGlow.position.z = 0; ring.obj.add(this.ringGlow);
    // --- greebles: boxes and pipes scattered on the hull sections
    const gb = new THREE.BoxGeometry(1, 1, 1);
    for (const sec of this.hull) {
      const n = 520;
      const im = new THREE.InstancedMesh(gb, this.mat, n);
      gb.setAttribute('aOffset', new THREE.Float32BufferAttribute(new Float32Array(gb.attributes.position.count * 3), 3));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const z = sec.z0 + rng.next() * (sec.z1 - sec.z0);
        const a = rng.range(0, Math.PI * 2);
        const r = prof(z);
        pos.set(Math.cos(a) * r, Math.sin(a) * r * 0.62, z);
        const nrm = new THREE.Vector3(Math.cos(a) * 0.62, Math.sin(a), 0).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
        const big = rng.next() < 0.15;
        s.set(rng.range(2, big ? 18 : 7), rng.range(1, big ? 8 : 4), rng.range(2, big ? 30 : 9));
        m.compose(pos, q, s);
        im.setMatrixAt(i, m);
      }
      sec.obj.add(im);
    }
  }

  addLights() {
    // running lights along the hull + engine glows + the belly light
    this.sprites = [];
    const add = (part, pos, col, size, blink = 0) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lightMap, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.layers.set(2); s.position.copy(pos); s.scale.setScalar(size); part.obj.add(s);
      this.sprites.push({ s, blink, size, ph: Math.random() * 6, base: col });
      return s;
    };
    const prof = (z) => 8 + 70 * Math.pow(Math.sin(Math.PI * Math.min(1, ((z + 260) / 520) * 1.15)), 0.75);
    for (let i = 0; i < 26; i++) {
      const z = -240 + i * 19;
      const sec = this.hull.find((h) => z >= h.z0 && z < h.z1) || this.hull[1];
      for (const s of [-1, 1]) add(sec, new THREE.Vector3(s * prof(z) * 1.02, 0, z), i % 4 === 0 ? 0xff3020 : 0x80ffd0, i % 4 === 0 ? 10 : 6, i % 4 === 0 ? 1.1 : 0);
    }
    this.engineGlows = this.engines.map((e) => add(this.hull[2], e, 0x70e0ff, 60));
    this.belly = add(this.hull[1], new THREE.Vector3(0, -48, 0), 0x60ffc0, 90);
  }

  // per frame visuals (time, fog, lighting, ring spin, blinking)
  update(dt, t, sh) {
    const u = this.u;
    u.time.value = t; u.fogCol.value.copy(sh.fogCol); u.fogDensity.value = sh.fogDensity * 0.7;
    u.amb.value.copy(sh.skyCol).multiplyScalar(0.25).add(new THREE.Color(0.03, 0.035, 0.04));
    u.keyCol.value.setRGB(0.55 + sh.burn * 0.5, 0.42 + sh.burn * 0.1, 0.36).multiplyScalar(0.6 + (1 - sh.night) * 0.6);
    const pw = u.power.value;
    if (!this.ring.free) { this.ringSpin += dt * 0.12 * pw; this.ring.obj.rotation.z = this.ringSpin; }
    for (const s of this.sprites) {
      const on = s.blink ? (Math.sin((t + s.ph) * Math.PI * s.blink) > 0.3 ? 1 : 0) : 1;
      s.s.material.opacity = on * pw * u.lightsOn.value * (s === this.belly ? 0.5 + 0.2 * Math.sin(t * 1.7) : 1);
    }
    for (const g of this.engineGlows) g.scale.setScalar(60 * (0.85 + 0.15 * Math.sin(t * 23 + g.position.x)) * Math.max(0.15, pw));
    this.ringGlow.material.color.setRGB(0.38 * pw, 1.0 * pw, 0.75 * pw);
  }

  // ------------------------------------------------------------- physics
  // break the ship apart: each part leaves with the ship's velocity plus a kick
  breakApart(kick = 30) {
    const rng = new RNG(7);
    const wq = this.group.getWorldQuaternion(new THREE.Quaternion());
    for (const p of this.parts) {
      // reparent to the scene keeping the world transform
      this.scene.attach(p.obj);
      p.free = true;
      p.vel.copy(this.vel || new THREE.Vector3());
      const out = p.obj.position.clone().sub(this.group.position).normalize();
      p.vel.addScaledVector(out, kick * rng.range(0.4, 1.2));
      p.vel.y += rng.range(-5, 15);
      p.ang.set(rng.range(-0.3, 0.3), rng.range(-0.25, 0.25), rng.range(-0.35, 0.35));
      if (p.name === 'ring') { p.vel.multiplyScalar(0.7); p.ang.set(rng.range(-0.15, 0.15), 0.05, rng.range(0.4, 0.7)); }
    }
    this.broken = true;
  }
  // integrate free parts: gravity, air drag, ground and water contact
  stepParts(dt, ground = -14, onHit) {
    const g = -9.8;
    for (const p of this.parts) {
      if (!p.free || p.rest) continue;
      p.vel.y += g * dt;
      p.vel.multiplyScalar(Math.exp(-0.04 * dt));
      p.obj.position.addScaledVector(p.vel, dt);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.ang.x * dt, p.ang.y * dt, p.ang.z * dt));
      p.obj.quaternion.premultiply(q);
      const lowest = p.obj.position.y - (p.name === 'ring' ? 100 : 40);
      if (lowest < ground) {
        const hitV = -p.vel.y;
        p.obj.position.y += ground - lowest;
        if (hitV > 2) { onHit && onHit(p, hitV); }
        p.vel.y = Math.abs(p.vel.y) * 0.12;
        p.vel.x *= 0.6; p.vel.z *= 0.6; p.ang.multiplyScalar(0.5);
        if (Math.abs(p.vel.y) < 1.5 && p.vel.length() < 3) { p.rest = true; }
      }
    }
  }
  reset() {
    for (const p of this.parts) {
      if (p.free) { this.group.attach(p.obj); }
      p.free = false; p.rest = false; p.vel.set(0, 0, 0); p.ang.set(0, 0, 0);
      p.obj.position.set(0, 0, p.name === 'ring' ? 20 : 0); p.obj.quaternion.identity();
    }
    this.ring.obj.scale.set(1, 0.72, 1);
    this.broken = false;
    this.u.damage.value = 0; this.u.power.value = 1; this.u.lightsOn.value = 1;
  }
}
