// GPU-cheap particle effects: camera-facing billboards (smoke, fire, sparks, dust, steam, magic, pow)
// plus instanced physical bits (debris, glass shards, confetti). Billboards live on layer 2 (no ink);
// debris keeps its ink outline. Everything is pooled; one draw call per pool.
//   const fx = createFX(scene); fx.burst('explosion', pos, { scale }); const e = fx.emitter('smoke', obj, { rate }); e.stop(); fx.update(dt)
import * as THREE from 'three';

let atlasTex = null;
function spriteAtlas() {
  if (atlasTex) return atlasTex;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S * 2; const g = cv.getContext('2d');
  // 0: soft disc
  let gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // 1: cartoon smoke puff — lumpy blob, light core, inked rim
  g.save(); g.translate(S, 0);
  const blobs = [[128, 140, 70], [80, 120, 48], [178, 118, 52], [118, 86, 50], [160, 170, 46], [92, 172, 42]];
  g.fillStyle = 'rgba(40,36,40,1)'; for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r + 7, 0, 7); g.fill(); }
  for (const [x, y, r] of blobs) { const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, '#a9a3a8'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(128, 128, 60, 128, 128, 128); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, S, S);
  g.restore();
  // 2: four-point sparkle / impact star
  g.save(); g.translate(0, S); g.translate(S / 2, S / 2);
  gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(0, -S / 2); g.lineTo(S * 0.06, 0); g.lineTo(0, S / 2); g.lineTo(-S * 0.06, 0); g.closePath(); g.globalAlpha = k % 2 ? 0.45 : 1; g.fill(); }
  g.globalAlpha = 1; g.beginPath(); g.arc(0, 0, S * 0.12, 0, 7); g.fill();
  g.restore();
  // 3: flame tongue
  g.save(); g.translate(S, S);
  gr = g.createRadialGradient(S / 2, S * 0.68, S * 0.05, S / 2, S * 0.6, S * 0.45);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(S / 2, S * 0.05); g.bezierCurveTo(S * 0.85, S * 0.45, S * 0.85, S * 0.95, S / 2, S * 0.95); g.bezierCurveTo(S * 0.15, S * 0.95, S * 0.15, S * 0.45, S / 2, S * 0.05); g.fill();
  g.restore();
  atlasTex = new THREE.CanvasTexture(cv); atlasTex.colorSpace = THREE.SRGBColorSpace;
  return atlasTex;
}

const VERT = /* glsl */`
attribute vec3 iPos; attribute vec4 iColor; attribute vec4 iMisc; attribute vec3 iVel;
varying vec2 vUv; varying vec4 vColor; varying float vCell;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  float s = iMisc.x;
  vec2 off;
  if (iMisc.w > 0.0) {
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz; vec2 d = vv.xy; float L = length(d);
    if (L > 1e-4) { d /= L; vec2 n = vec2(-d.y, d.x); off = d * c.y * (s + L * iMisc.w) + n * c.x * s; } else off = c * s;
  } else {
    float r = iMisc.y; off = vec2(c.x * cos(r) - c.y * sin(r), c.x * sin(r) + c.y * cos(r)) * s;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vUv = uv; vColor = iColor; vCell = iMisc.z;
}`;
const FRAG = /* glsl */`
uniform sampler2D tAtlas; uniform float uAdd;
varying vec2 vUv; varying vec4 vColor; varying float vCell;
void main() {
  vec2 cell = vec2(mod(vCell, 2.0), floor(vCell / 2.0));
  vec4 t = texture2D(tAtlas, (cell + vec2(vUv.x, 1.0 - vUv.y)) * 0.5);
  float a = t.a * vColor.a;
  if (a < 0.003) discard;
  vec3 col = t.rgb * vColor.rgb;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
}`;

class Billboards {
  constructor(parent, cap, additive) {
    this.cap = cap; this.next = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iMisc', this.aMisc); g.setAttribute('iVel', this.aVel);
    g.instanceCount = cap;
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { tAtlas: { value: spriteAtlas() }, uAdd: { value: additive ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.CustomBlending : THREE.NormalBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    if (additive) { m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.layers.set(2); this.mesh.renderOrder = additive ? 12 : 10;
    parent.add(this.mesh);
    // CPU state
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap).fill(1);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.c0 = new Float32Array(cap * 3); this.c1 = new Float32Array(cap * 3);
    this.a0 = new Float32Array(cap); this.drag = new Float32Array(cap); this.grav = new Float32Array(cap); this.rot = new Float32Array(cap); this.spin = new Float32Array(cap);
    this.cell = new Float32Array(cap); this.stretch = new Float32Array(cap); this.alive = new Uint8Array(cap); this.flick = new Float32Array(cap);
    this.count = 0;
  }
  add(o) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    if (!this.alive[i]) this.count++;
    this.alive[i] = 1; this.life[i] = 0; this.max[i] = o.life;
    this.p.set(o.p, i * 3); this.v.set(o.v, i * 3);
    this.s0[i] = o.s0; this.s1[i] = o.s1; this.c0.set(o.c0, i * 3); this.c1.set(o.c1 ?? o.c0, i * 3); this.a0[i] = o.a ?? 1;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0; this.rot[i] = o.rot ?? Math.random() * 6.28; this.spin[i] = o.spin ?? 0;
    this.cell[i] = o.cell ?? 0; this.stretch[i] = o.stretch ?? 0; this.flick[i] = o.flicker ?? 0;
  }
  update(dt) {
    const P = this.aPos.array, C = this.aCol.array, M = this.aMisc.array, V = this.aVel.array;
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) { if (M[i * 4] !== 0) { M[i * 4] = 0; C[i * 4 + 3] = 0; any = true; } continue; }
      any = true;
      const l = (this.life[i] += dt), u = l / this.max[i];
      if (u >= 1) { this.alive[i] = 0; this.count--; M[i * 4] = 0; C[i * 4 + 3] = 0; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k + this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      for (let a = 0; a < 3; a++) { this.p[i * 3 + a] += this.v[i * 3 + a] * dt; P[i * 3 + a] = this.p[i * 3 + a]; V[i * 3 + a] = this.v[i * 3 + a]; }
      this.rot[i] += this.spin[i] * dt;
      const e = u * u * (3 - 2 * u);
      for (let a = 0; a < 3; a++) C[i * 4 + a] = this.c0[i * 3 + a] + (this.c1[i * 3 + a] - this.c0[i * 3 + a]) * e;
      const fadeIn = Math.min(1, u * 8);
      let alpha = this.a0[i] * fadeIn * (1 - u) * (1 - u * 0.3);
      if (this.flick[i]) alpha *= 0.6 + 0.4 * Math.sin(l * 40 + i);
      C[i * 4 + 3] = alpha;
      M[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(u); M[i * 4 + 1] = this.rot[i]; M[i * 4 + 2] = this.cell[i]; M[i * 4 + 3] = this.stretch[i];
    }
    if (any) { this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = this.aVel.needsUpdate = true; }
  }
}

// Physical bits: debris chunks, glass shards, confetti, shell casings.
class Bits {
  constructor(parent, cap, geo, mat, { ink = true } = {}) {
    this.cap = cap; this.next = 0;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    if (!ink) this.mesh.layers.set(2);
    parent.add(this.mesh);
    this.st = Array.from({ length: cap }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 1, life: 0, max: 1, floor: -1e9, flutter: 0, rest: false }));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, zero);
  }
  add(o) {
    const i = this.next; this.next = (this.next + 1) % this.cap; const s = this.st[i];
    s.alive = true; s.rest = false; s.p.copy(o.p); s.v.copy(o.v); s.q.random(); s.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(o.spin ?? 12);
    s.s = o.size; s.life = 0; s.max = o.life ?? 6; s.floor = o.floor ?? -1e9; s.flutter = o.flutter ?? 0; s.grav = o.grav ?? -9.8; s.drag = o.drag ?? 0.1;
    this.mesh.setColorAt(i, o.color ?? new THREE.Color(1, 1, 1)); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    const m = new THREE.Matrix4(), dq = new THREE.Quaternion(), sc = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      const s = this.st[i]; if (!s.alive) continue; any = true;
      s.life += dt;
      if (s.life > s.max) { s.alive = false; this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      if (!s.rest) {
        s.v.y += s.grav * dt; s.v.multiplyScalar(Math.exp(-s.drag * dt));
        if (s.flutter) { s.v.x += Math.sin(s.life * 7 + i) * s.flutter * dt; s.v.z += Math.cos(s.life * 5 + i) * s.flutter * dt; }
        s.p.addScaledVector(s.v, dt);
        if (s.p.y < s.floor + s.s * 0.5) { s.p.y = s.floor + s.s * 0.5; if (Math.abs(s.v.y) < 1.2) { s.rest = true; s.v.set(0, 0, 0); } else { s.v.y *= -0.35; s.v.x *= 0.6; s.v.z *= 0.6; s.w.multiplyScalar(0.5); } }
        dq.setFromEuler(new THREE.Euler(s.w.x * dt, s.w.y * dt, s.w.z * dt)); s.q.multiply(dq);
      }
      const fade = Math.min(1, (s.max - s.life) / 0.6);
      sc.setScalar(s.s * fade);
      this.mesh.setMatrixAt(i, m.compose(s.p, s.q, sc));
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const sphere = (r) => { const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (v.lengthSq() > 1) v.normalize(); return v.multiplyScalar(r); };
const tmpV = new THREE.Vector3();
function at(pos) { if (!pos) return tmpV.set(0, 0, 0); if (pos.isVector3) return tmpV.copy(pos); if (pos.isObject3D) return pos.getWorldPosition(tmpV); if (typeof pos === 'function') return tmpV.copy(pos()); return tmpV.fromArray(pos); }

export function createFX(parent, { capacity = 1400 } = {}) {
  const group = new THREE.Group(); group.name = 'fx'; parent.add(group);
  const normal = new Billboards(group, capacity, false), add = new Billboards(group, capacity, true);
  const debrisGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const debris = new Bits(group, 260, debrisGeo, new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 0.9, flatShading: true }));
  const shardGeo = new THREE.BufferGeometry(); shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, -0.3, -0.4, 0, 0.35, -0.3, 0], 3)); shardGeo.computeVertexNormals();
  const glass = new Bits(group, 240, shardGeo, new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, envMapIntensity: 2 }), { ink: false });
  const confetti = new Bits(group, 400, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), { ink: false });
  const emitters = new Set();

  const P = {
    smoke(p, o = {}) { const s = o.scale ?? 1; normal.add({ p: [p.x + rnd(-0.3, 0.3) * s, p.y, p.z + rnd(-0.3, 0.3) * s], v: [rnd(-0.3, 0.3) * s + (o.wind ?? 0), rnd(0.4, 1.0) * s * (o.rise ?? 1), rnd(-0.3, 0.3) * s], life: rnd(2.5, 5) * (o.lifeMul ?? 1), s0: 0.5 * s, s1: 2.6 * s, c0: o.color ?? [0.32, 0.3, 0.32], c1: o.color1 ?? [0.55, 0.52, 0.55], a: o.alpha ?? 0.9, drag: 0.35, cell: 1, spin: rnd(-0.4, 0.4) }); },
    blacksmoke(p, o = {}) { P.smoke(p, { ...o, color: [0.08, 0.07, 0.08], color1: [0.22, 0.2, 0.22], alpha: 0.95 }); },
    fire(p, o = {}) { const s = o.scale ?? 1; add.add({ p: [p.x + rnd(-0.2, 0.2) * s, p.y, p.z + rnd(-0.2, 0.2) * s], v: [rnd(-0.3, 0.3) * s, rnd(1, 2.2) * s, rnd(-0.3, 0.3) * s], life: rnd(0.35, 0.8), s0: 0.7 * s, s1: 0.15 * s, c0: [4.0, 2.6, 0.9], c1: [2.2, 0.35, 0.05], a: 1, drag: 1, cell: 3, rot: rnd(-0.3, 0.3), flicker: 1 }); },
    ember(p, o = {}) { const s = o.scale ?? 1; add.add({ p: [p.x, p.y, p.z], v: [rnd(-1, 1) * s, rnd(1, 3) * s, rnd(-1, 1) * s], life: rnd(1, 2.5), s0: 0.06 * s, s1: 0.02 * s, c0: [5, 2.2, 0.6], c1: [3, 0.4, 0.1], a: 1, drag: 0.6, grav: 0.3, cell: 0, flicker: 1 }); },
    spark(p, o = {}) { const s = o.scale ?? 1; const v = sphere(rnd(3, 9) * s); v.y = Math.abs(v.y) * 0.8 + 1 * s; add.add({ p: [p.x, p.y, p.z], v: [v.x, v.y, v.z], life: rnd(0.4, 1.2), s0: 0.035 * s, s1: 0.015 * s, c0: [6, 4.2, 1.8], c1: [4, 1.2, 0.2], a: 1, drag: 0.5, grav: -9.8 * s, cell: 0, stretch: 0.03 }); },
    dust(p, o = {}) { const s = o.scale ?? 1; const a = rnd(0, 6.28), sp = rnd(0.8, 2.2) * s; normal.add({ p: [p.x, p.y + 0.05 * s, p.z], v: [Math.cos(a) * sp, rnd(0.1, 0.6) * s, Math.sin(a) * sp], life: rnd(0.9, 1.8), s0: 0.25 * s, s1: 0.9 * s, c0: o.color ?? [0.72, 0.66, 0.58], c1: o.color ?? [0.8, 0.76, 0.7], a: 0.75, drag: 2.2, cell: 1 }); },
    steam(p, o = {}) { const s = o.scale ?? 1; normal.add({ p: [p.x + rnd(-0.05, 0.05), p.y, p.z + rnd(-0.05, 0.05)], v: [rnd(-0.08, 0.08), rnd(0.25, 0.5) * s, rnd(-0.08, 0.08)], life: rnd(1.2, 2.2), s0: 0.06 * s, s1: 0.4 * s, c0: [1, 1, 1], c1: [0.9, 0.92, 0.95], a: 0.45, drag: 0.6, cell: 0 }); },
    magic(p, o = {}) { const s = o.scale ?? 1; const v = sphere(rnd(0.2, 1.0) * s); const c = o.color ?? (Math.random() < 0.5 ? [1.4, 3, 2] : [2.2, 1.4, 3.2]); add.add({ p: [p.x, p.y, p.z], v: [v.x, v.y + 0.3 * s, v.z], life: rnd(0.8, 1.8), s0: 0.09 * s, s1: 0.0, c0: c, c1: c, a: 1, drag: 1.2, cell: 2, spin: rnd(-3, 3), flicker: 1 }); },
    glow(p, o = {}) { const s = o.scale ?? 1; add.add({ p: [p.x, p.y, p.z], v: [0, 0, 0], life: o.life ?? 0.5, s0: 2 * s, s1: 3 * s, c0: o.color ?? [6, 4, 2], c1: [3, 1, 0.3], a: 1, cell: 0 }); },
    pow(p, o = {}) { const s = o.scale ?? 1; add.add({ p: [p.x, p.y, p.z], v: [0, 0, 0], life: 0.22, s0: 0.5 * s, s1: 1.4 * s, c0: o.color ?? [4, 4, 3.5], c1: [2, 1.6, 1], a: 1, cell: 2, rot: rnd(0, 1) }); },
  };

  function burst(kind, pos, o = {}) {
    const p = at(pos).clone(), s = o.scale ?? 1, n = o.count;
    switch (kind) {
      case 'explosion': {
        P.glow(p, { scale: 4 * s, life: 0.6 });
        for (let i = 0; i < (n ?? 26); i++) { const q = p.clone().add(sphere(1.6 * s)); add.add({ p: [q.x, q.y, q.z], v: sphere(6 * s).toArray(), life: rnd(0.6, 1.3), s0: rnd(2, 3.4) * s, s1: 0.6 * s, c0: [5, 3, 1], c1: [2.2, 0.4, 0.06], a: 1, drag: 2.4, cell: 3, rot: rnd(0, 6), flicker: 1 }); }
        for (let i = 0; i < 16; i++) { const q = p.clone().add(sphere(2 * s)); normal.add({ p: [q.x, q.y, q.z], v: sphere(3 * s).add(new THREE.Vector3(0, 2 * s, 0)).toArray(), life: rnd(3, 6), s0: 1.5 * s, s1: 6 * s, c0: [0.1, 0.09, 0.1], c1: [0.32, 0.3, 0.32], a: 0.95, drag: 0.9, cell: 1, spin: rnd(-0.3, 0.3) }); }
        for (let i = 0; i < 40; i++) P.spark(p, { scale: 2.2 * s });
        for (let i = 0; i < 24; i++) debris.add({ p: p.clone().add(sphere(s)), v: sphere(14 * s).add(new THREE.Vector3(0, 5 * s, 0)), size: rnd(0.3, 1.1) * s, life: 7, floor: o.floor ?? -1e9, color: new THREE.Color().setHSL(0.08, 0.05, rnd(0.25, 0.5)) });
        if (o.glass !== false) for (let i = 0; i < 30; i++) glass.add({ p: p.clone().add(sphere(2 * s)), v: sphere(10 * s), size: rnd(0.3, 0.8) * s, life: 5, floor: o.floor ?? -1e9, spin: 20, drag: 0.4 });
        break;
      }
      case 'impact': P.pow(p, { scale: s }); for (let i = 0; i < 6; i++) P.dust(p, { scale: 0.4 * s }); for (let i = 0; i < 8; i++) P.spark(p, { scale: 0.4 * s }); break;
      case 'debris': for (let i = 0; i < (n ?? 12); i++) debris.add({ p: p.clone().add(sphere(0.3 * s)), v: sphere(5 * s).add(new THREE.Vector3(0, 3 * s, 0)), size: rnd(0.04, 0.14) * s, life: o.life ?? 8, floor: o.floor ?? 0, color: o.color }); break;
      case 'glass': for (let i = 0; i < (n ?? 30); i++) glass.add({ p: p.clone().add(sphere(0.4 * s)), v: (o.dir ? o.dir.clone().multiplyScalar(rnd(2, 5)) : new THREE.Vector3()).add(sphere(2.5 * s)).add(new THREE.Vector3(0, 1.5, 0)), size: rnd(0.04, 0.14) * s, life: o.life ?? 8, floor: o.floor ?? 0, spin: 14, drag: 0.3 }); break;
      case 'confetti': for (let i = 0; i < (n ?? 80); i++) confetti.add({ p: p.clone().add(sphere(0.6 * s)), v: sphere(3 * s).add(new THREE.Vector3(0, 4 * s, 0)), size: 0.04 * s, life: o.life ?? 6, floor: o.floor ?? 0, color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6), flutter: 4, grav: -2.5, drag: 1.5, spin: 10 }); break;
      default: { const f = P[kind]; if (f) for (let i = 0; i < (n ?? 12); i++) f(p, o); }
    }
  }
  // Continuous emitter. pos: Vector3 | Object3D | () => Vector3. rate: particles per second.
  function emitter(kind, pos, o = {}) {
    const e = { kind, pos, o, rate: o.rate ?? 10, acc: 0, alive: true, stop() { e.alive = false; emitters.delete(e); }, setRate(r) { e.rate = r; } };
    emitters.add(e); return e;
  }
  function update(dt) {
    for (const e of emitters) {
      e.acc += dt * e.rate;
      const f = P[e.kind];
      while (e.acc >= 1) { e.acc -= 1; const p = at(e.pos).clone(); if (e.o.jitter) p.add(sphere(e.o.jitter)); if (f) f(p, e.o); else burst(e.kind, p, e.o); }
    }
    normal.update(dt); add.update(dt); debris.update(dt); glass.update(dt); confetti.update(dt);
  }
  function clear() { emitters.clear(); for (const b of [normal, add]) { b.alive.fill(0); } }
  return { group, burst, emitter, update, clear, spawn: P };
}
