// Lightweight particles (steam, crumbs, kibble, blood drops, dust) and floor
// decals (blood, coffee, egg). Points/instanced meshes with simple physics.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { radial, bloodSplat } from './textures.js';
import { rand } from '../core/util.js';

const MAX = 600;

export class Particles {
  constructor() {
    this.items = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: radial({ size: 32 }) }, scale: { value: 400 } },
      vertexShader: `attribute float psize; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * scale / max(0.05, -mv.z); }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a * vA < 0.02) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    G.scene.add(this.points);
    // solid chunks (kibble, crumbs, blood drops) as instanced meshes
    this.chunkGeo = new THREE.IcosahedronGeometry(1, 0);
    this.chunkMat = new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false });
    this.chunks = new THREE.InstancedMesh(this.chunkGeo, this.chunkMat, 400);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunks.count = 0;
    this.chunks.frustumCulled = false;
    this.chunkList = [];
    const ic = new Float32Array(400 * 3);
    this.chunks.instanceColor = new THREE.InstancedBufferAttribute(ic, 3);
    G.scene.add(this.chunks);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  emit(p) { if (this.items.length < MAX) this.items.push(p); }
  steam(pos, n = 1) {
    for (let i = 0; i < n; i++) this.emit({ p: pos.clone().add(new THREE.Vector3(rand(-0.01, 0.01), 0, rand(-0.01, 0.01))), v: new THREE.Vector3(rand(-0.02, 0.02), rand(0.08, 0.15), rand(-0.02, 0.02)), life: rand(1.2, 2.2), age: 0, size: 0.03, grow: 0.06, col: [0.9, 0.9, 0.92], a: 0.18, drag: 0.5, g: 0 });
  }
  dust(pos, n = 6) {
    for (let i = 0; i < n; i++) this.emit({ p: pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.1, 0.2), rand(-0.3, 0.3))), v: new THREE.Vector3(rand(-0.05, 0.05), rand(-0.08, 0.02), rand(-0.05, 0.05)), life: rand(2, 4), age: 0, size: 0.012, grow: 0, col: [0.7, 0.65, 0.6], a: 0.35, drag: 0.3, g: -0.05 });
  }
  chunk(pos, vel, color, size, life = 6, floorY = null) {
    if (this.chunkList.length >= 400) this.chunkList.shift();
    this.chunkList.push({ p: pos.clone(), v: vel.clone(), color, size, life, age: 0, rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), floorY, rest: false });
  }
  crumbs(pos, n, color) { for (let i = 0; i < n; i++) this.chunk(pos, new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.6), rand(-0.4, 0.4)), color, rand(0.003, 0.006), 5); }
  kibble(from, to) {
    // a stream of kibble pieces falling into the bowl over ~1.4s
    let n = 0;
    const iv = setInterval(() => {
      if (n++ > 22) { clearInterval(iv); return; }
      const p = from.clone().add(new THREE.Vector3(rand(-0.015, 0.015), 0, rand(-0.015, 0.015)));
      this.chunk(p, new THREE.Vector3(rand(-0.08, 0.08), -0.3, rand(-0.08, 0.08)), 0x7a4a24, rand(0.007, 0.01), 1.4, to.y + 0.01);
      G.audio && n % 3 === 0 && G.audio.play('kibbleTick', { pos: to, vol: 0.4, rate: rand(0.9, 1.3) });
    }, 60);
  }
  blood(pos, dir, n = 12, spread = 0.6) {
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(rand(0.5, 1.6)).add(new THREE.Vector3(rand(-spread, spread), rand(-0.2, spread), rand(-spread, spread)));
      this.chunk(pos, v, 0x6a0606, rand(0.003, 0.008), 4, 0.004);
    }
  }
  update(dt) {
    let k = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age >= it.life) { this.items.splice(i, 1); continue; }
      it.v.multiplyScalar(Math.exp(-it.drag * dt));
      it.v.y += it.g * dt;
      it.p.addScaledVector(it.v, dt);
    }
    for (const it of this.items) {
      if (k >= MAX) break;
      const f = it.age / it.life;
      this.pos[k * 3] = it.p.x; this.pos[k * 3 + 1] = it.p.y; this.pos[k * 3 + 2] = it.p.z;
      this.col[k * 3] = it.col[0]; this.col[k * 3 + 1] = it.col[1]; this.col[k * 3 + 2] = it.col[2];
      this.size[k] = it.size + it.grow * f;
      this.alpha[k] = it.a * Math.sin(Math.PI * Math.min(1, f * 1.2 + 0.05));
      k++;
    }
    for (let i = k; i < MAX; i++) this.alpha[i] = 0;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.psize.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.setDrawRange(0, Math.max(1, k));
    this.mat.uniforms.scale.value = G.engine.lowHc * 0.9;
    // chunks
    let n = 0;
    for (let i = this.chunkList.length - 1; i >= 0; i--) {
      const c = this.chunkList[i];
      c.age += dt;
      if (c.age > c.life + 20) { this.chunkList.splice(i, 1); continue; }
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        const fy = c.floorY ?? 0.004;
        if (c.p.y < fy) {
          c.p.y = fy;
          if (Math.abs(c.v.y) > 0.8 && c.color !== 0x6a0606) { c.v.y *= -0.3; c.v.x *= 0.5; c.v.z *= 0.5; } else { c.rest = true; if (c.color === 0x6a0606 && G.decals) G.decals.drop(c.p); }
        }
      }
    }
    for (const c of this.chunkList) {
      if (c.color === 0x6a0606 && c.rest) continue;
      this._q.setFromEuler(c.rot);
      this._s.setScalar(c.size);
      this._m.compose(c.p, this._q, this._s);
      this.chunks.setMatrixAt(n, this._m);
      this._c.setHex(c.color);
      this.chunks.setColorAt(n, this._c);
      n++;
      if (n >= 400) break;
    }
    this.chunks.count = n;
    this.chunks.instanceMatrix.needsUpdate = true;
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
  }
}

// Floor/wall decals as small textured quads lying on surfaces
export class Decals {
  constructor() {
    this.list = [];
    this.mats = [1, 2, 3, 4].map((s) => new THREE.MeshStandardMaterial({ map: bloodSplat({ seed: 30 + s }), transparent: true, depthWrite: false, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 1.4 }));
    this.coffeeMat = new THREE.MeshStandardMaterial({ map: bloodSplat({ seed: 40 }), color: 0x6a4a2a, transparent: true, depthWrite: false, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.eggMat = new THREE.MeshStandardMaterial({ map: bloodSplat({ seed: 41 }), color: 0xffe080, transparent: true, depthWrite: false, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.geo = new THREE.PlaneGeometry(1, 1);
  }
  add(pos, size, mat, normal = new THREE.Vector3(0, 1, 0)) {
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(pos).addScaledVector(normal, 0.003);
    m.lookAt(m.position.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size);
    m.renderOrder = 2;
    m.receiveShadow = true;
    G.scene.add(m);
    this.list.push(m);
    if (this.list.length > 220) { const o = this.list.shift(); o.removeFromParent(); }
    return m;
  }
  blood(pos, size = 0.2, normal) { return this.add(pos, size, this.mats[Math.floor(Math.random() * 4)], normal); }
  drop(pos) { return this.add(new THREE.Vector3(pos.x, 0.002 + Math.random() * 0.001, pos.z), rand(0.02, 0.05), this.mats[Math.floor(Math.random() * 4)]); }
  coffee(pos) { return this.add(pos.clone(), 0.12, this.coffeeMat); }
  egg(pos) { return this.add(new THREE.Vector3(pos.x, Math.max(0.002, pos.y - 0.02), pos.z), 0.09, this.eggMat); }
  clear() { for (const m of this.list) m.removeFromParent(); this.list.length = 0; }
}
