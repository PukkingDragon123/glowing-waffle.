// Big-scale effects for the sky scene: tumbling debris with gravity and ground
// bounce, smoke and dust that billows, grows and drifts, fire, and sparks.
import * as THREE from 'three';
import { RNG, clamp } from '../core/util.js';
import { radial } from '../gfx/textures.js';

const SMOKE_VS = /* glsl */`
attribute vec4 aPuff;   // xyz centre, w size
attribute vec4 aCol;    // rgb, a opacity
attribute float aSeed;
varying vec2 vUv; varying vec4 vCol; varying float vSeed; varying vec3 vWorld;
void main(){
  vUv = uv; vCol = aCol; vSeed = aSeed;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = aPuff.xyz + (camR * position.x + camU * position.y) * aPuff.w;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const SMOKE_FS = /* glsl */`
uniform float time; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 fireCol;
varying vec2 vUv; varying vec4 vCol; varying float vSeed; varying vec3 vWorld;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float d = fbm(p * 3.0 + vec2(vSeed * 17.0, vSeed * 9.0 - time * 0.05));
  float a = smoothstep(1.0, 0.25, r + (d - 0.5) * 0.9) * vCol.a;
  if (a < 0.003) discard;
  // lit from below by the fires
  vec3 c = vCol.rgb * (0.7 + 0.5 * d) + fireCol * smoothstep(0.2, -0.5, p.y) * 0.35;
  float dist = length(vWorld - cameraPosition);
  c = mix(c, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0) * 0.8);
  gl_FragColor = vec4(c, a);
}`;

export class Debris {
  constructor(scene, { chunks = 700, puffs = 420, fires = 90 } = {}) {
    this.scene = scene;
    this.rng = new RNG(1999);
    // ---- chunks
    const cg = new THREE.DodecahedronGeometry(1, 0);
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 0.9, metalness: 0.2, emissive: 0x000000, fog: false });
    this.chunkMesh = new THREE.InstancedMesh(cg, this.chunkMat, chunks);
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.setColorAt(0, new THREE.Color());
    scene.add(this.chunkMesh);
    this.chunks = Array.from({ length: chunks }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 1, life: 0, hot: 0 }));
    this.ci = 0;
    // ---- smoke/dust puffs (one draw call)
    const N = puffs;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.aPuff.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(N); for (let i = 0; i < N; i++) seeds[i] = Math.random();
    geo.setAttribute('aPuff', this.aPuff); geo.setAttribute('aCol', this.aCol); geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = N;
    this.smokeU = { time: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.0003 }, fireCol: { value: new THREE.Color(1.0, 0.45, 0.15) } };
    this.smokeMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, uniforms: this.smokeU, transparent: true, depthWrite: false }));
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 3;
    scene.add(this.smokeMesh);
    this.puffs = Array.from({ length: N }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, grow: 0, life: 0, max: 1, c: new THREE.Color(), a: 0 }));
    this.pi = 0;
    // ---- fire sprites
    this.fireMap = radial({ size: 64, inner: 'rgba(255,220,140,1)', outer: 'rgba(255,70,0,0)' });
    this.fires = [];
    for (let i = 0; i < fires; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      s.visible = false; scene.add(s);
      this.fires.push({ s, alive: false, p: new THREE.Vector3(), size: 1, life: 0, max: 1, ph: Math.random() * 10, follow: null, off: new THREE.Vector3() });
    }
    this.fi = 0;
    this.t = 0;
    this._m = new THREE.Matrix4();
  }

  chunk(p, v, size, hot = 0, life = 30) {
    const idx = this.ci;
    const c = this.chunks[idx]; this.ci = (this.ci + 1) % this.chunks.length;
    c.alive = true; c.p.copy(p); c.v.copy(v); c.s = size; c.hot = hot; c.life = life;
    c.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    c.w.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    this.chunkMesh.setColorAt(idx, hot ? new THREE.Color(0.5, 0.25, 0.12) : new THREE.Color().setHSL(0.08, 0.05, 0.3 + Math.random() * 0.35));
  }
  burst(p, n, speed, size, hot = 0.6) {
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize();
      this.chunk(p.clone().addScaledVector(d, size * 2), d.multiplyScalar(speed * (0.3 + Math.random())), size * (0.3 + Math.random() * 1.2), Math.random() < hot ? 1 : 0);
    }
  }
  puff(p, v, size, grow, life, col, alpha = 0.7) {
    const q = this.puffs[this.pi]; this.pi = (this.pi + 1) % this.puffs.length;
    q.alive = true; q.p.copy(p); q.v.copy(v); q.s = size; q.grow = grow; q.life = 0; q.max = life; q.c.copy(col); q.a = alpha;
  }
  fire(p, size, life, follow = null) {
    const f = this.fires[this.fi]; this.fi = (this.fi + 1) % this.fires.length;
    f.alive = true; f.p.copy(p); f.size = size; f.life = 0; f.max = life; f.follow = follow;
    if (follow) { f.off.copy(p); follow.worldToLocal(f.off); }
    f.s.visible = true;
  }

  update(dt, sh) {
    this.t += dt;
    const g = -9.8, ground = -14;
    // chunks
    const m = this._m, sc = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.alive) { m.makeScale(0, 0, 0); this.chunkMesh.setMatrixAt(i, m); continue; }
      any = true;
      c.life -= dt;
      if (c.p.y > ground + c.s * 0.5) {
        c.v.y += g * dt; c.v.multiplyScalar(Math.exp(-0.15 * dt));
        c.p.addScaledVector(c.v, dt);
        c.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(c.w.x * dt, c.w.y * dt, c.w.z * dt)));
        // hot chunks trail smoke
        if (c.hot && Math.random() < dt * 6) this.puff(c.p, new THREE.Vector3(0, 2, 0), c.s * 3, c.s * 4, 4, new THREE.Color(0.12, 0.1, 0.09), 0.45);
      } else {
        c.p.y = ground + c.s * 0.5;
        if (c.v.y < -6) { c.v.y *= -0.25; c.v.x *= 0.5; c.v.z *= 0.5; if (c.s > 2 && Math.random() < 0.5) this.puff(c.p, new THREE.Vector3(0, 3, 0), c.s * 4, c.s * 5, 6, new THREE.Color(0.32, 0.3, 0.28), 0.5); }
        else { c.v.set(0, 0, 0); c.w.multiplyScalar(0.9); }
      }
      if (c.life <= 0) c.alive = false;
      sc.setScalar(c.s);
      m.compose(c.p, c.q, sc);
      this.chunkMesh.setMatrixAt(i, m);
    }
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
    this.chunkMat.emissive.setRGB(0.05 + sh.burn * 0.05, 0.02, 0.0);
    // smoke
    const ap = this.aPuff.array, ac = this.aCol.array;
    for (let i = 0; i < this.puffs.length; i++) {
      const q = this.puffs[i];
      if (!q.alive) { ac[i * 4 + 3] = 0; continue; }
      q.life += dt;
      const k = q.life / q.max;
      if (k >= 1) { q.alive = false; ac[i * 4 + 3] = 0; continue; }
      q.p.addScaledVector(q.v, dt);
      q.v.multiplyScalar(Math.exp(-0.3 * dt));
      q.v.y += dt * 0.8;                 // buoyant
      q.v.x -= dt * 1.5;                 // the wind blows north (-x) up the river
      q.s += q.grow * dt * (1 - k * 0.5);
      ap[i * 4] = q.p.x; ap[i * 4 + 1] = q.p.y; ap[i * 4 + 2] = q.p.z; ap[i * 4 + 3] = q.s;
      const night = sh.night;
      const lit = 0.45 + (1 - night) * 0.55;
      ac[i * 4] = q.c.r * lit; ac[i * 4 + 1] = q.c.g * lit; ac[i * 4 + 2] = q.c.b * lit;
      ac[i * 4 + 3] = q.a * Math.min(1, k * 8) * (1 - k);
    }
    this.aPuff.needsUpdate = true; this.aCol.needsUpdate = true;
    this.smokeU.time.value = this.t; this.smokeU.fogCol.value.copy(sh.fogCol); this.smokeU.fogDensity.value = sh.fogDensity;
    // fires
    for (const f of this.fires) {
      if (!f.alive) continue;
      f.life += dt;
      const k = f.life / f.max;
      if (k >= 1) { f.alive = false; f.s.visible = false; continue; }
      if (f.follow) { f.p.copy(f.off); f.follow.localToWorld(f.p); }
      const fl = 0.7 + 0.3 * Math.sin(this.t * 11 + f.ph) * Math.sin(this.t * 6.3 + f.ph * 2);
      f.s.position.copy(f.p); f.s.scale.setScalar(f.size * fl * (k < 0.05 ? k * 20 : 1));
      f.s.material.opacity = fl * Math.min(1, (1 - k) * 4);
      if (Math.random() < dt * 3) this.puff(f.p.clone().add(new THREE.Vector3(0, f.size * 0.4, 0)), new THREE.Vector3(0, 6, 0), f.size * 0.8, f.size * 0.7, 10, new THREE.Color(0.1, 0.085, 0.08), 0.55);
    }
  }
  clear() {
    for (const c of this.chunks) c.alive = false;
    for (const q of this.puffs) q.alive = false;
    for (const f of this.fires) { f.alive = false; f.s.visible = false; }
  }
}
