// Verlet cloth for garments: particles pinned to bones, constrained (stretch/shear/bend), colliding
// with spheres that ride the skeleton. Simulated in world space so walking, kicks and spins give real
// secondary motion; rendered in the character's local space.
import * as THREE from 'three';
import { game } from '../core/game.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Cloth {
  // def: { rows, cols, rest(i,j)->Vector3 (model space, already build-adjusted), pin(i,j)->boneName|null,
  //        material, stiffness, bend, damping, colliders:[{bone, offset:Vector3(model), r}], closed (wrap cols), mass }
  constructor(h, def) {
    this.h = h; this.def = def; const { rows, cols } = def;
    this.rows = rows; this.cols = cols; this.closed = !!def.closed;
    const n = rows * cols;
    this.pos = new Float32Array(n * 3); this.prev = new Float32Array(n * 3);
    this.pinBone = new Array(n).fill(null); this.pinLocal = new Array(n).fill(null);
    this.restModel = [];
    h.root.updateMatrixWorld(true);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const k = i * cols + j, p = def.rest(i, j); this.restModel.push(p.clone());
      const bn = def.pin(i, j);
      if (bn) { const b = h.byName[bn]; this.pinBone[k] = b; this.pinLocal[k] = h.restLocal(bn, p); }
      const wpos = p.clone().applyMatrix4(h.root.matrixWorld);
      this.pos.set([wpos.x, wpos.y, wpos.z], k * 3); this.prev.set([wpos.x, wpos.y, wpos.z], k * 3);
    }
    // constraints [a, b, rest, stiffness]
    this.cons = [];
    const C = (a, b, s) => { const ra = this.restModel[a], rb = this.restModel[b]; this.cons.push([a, b, ra.distanceTo(rb), s]); };
    const st = def.stiffness ?? 1, bend = def.bend ?? 0.25;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const k = i * cols + j, jr = this.closed ? (j + 1) % cols : j + 1, jr2 = this.closed ? (j + 2) % cols : j + 2;
      if (jr < cols) C(k, i * cols + jr, st);
      if (i + 1 < rows) C(k, (i + 1) * cols + j, st);
      if (i + 1 < rows && jr < cols) { C(k, (i + 1) * cols + jr, st * 0.5); C(i * cols + jr, (i + 1) * cols + j, st * 0.5); }
      if (jr2 < cols && (this.closed || j + 2 < cols)) C(k, i * cols + jr2, bend);
      if (i + 2 < rows) C(k, (i + 2) * cols + j, bend);
    }
    // colliders
    this.colliders = (def.colliders || []).map((c) => ({ bone: h.byName[c.bone], local: h.restLocal(c.bone, c.offset), r: c.r, world: new THREE.Vector3() }));
    // mesh
    const g = new THREE.BufferGeometry();
    const uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { uv[(i * cols + j) * 2] = (def.uvScale?.[0] ?? 1) * j / (cols - 1); uv[(i * cols + j) * 2 + 1] = (def.uvScale?.[1] ?? 1) * i / (rows - 1); }
    const jmax = this.closed ? cols : cols - 1;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < jmax; j++) {
      const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = (i + 1) * cols + j, d = (i + 1) * cols + ((j + 1) % cols);
      idx.push(a, c, b, b, c, d);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, def.material); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    h.root.add(this.mesh);
    this.inv = new THREE.Matrix4(); this.t = Math.random() * 10;
    this.syncMesh();
  }
  pinWorld(k, out) { const b = this.pinBone[k]; return out.copy(this.pinLocal[k]).applyMatrix4(b.matrixWorld); }
  // Teleports (cutscene cuts): reset the cloth to the pinned pose.
  reset() {
    const h = this.h; h.root.updateMatrixWorld(true);
    for (let k = 0; k < this.rows * this.cols; k++) {
      const w = this.pinBone[k] ? this.pinWorld(k, _v) : _v.copy(this.restModel[k]).applyMatrix4(h.root.matrixWorld);
      this.pos.set([w.x, w.y, w.z], k * 3); this.prev.set([w.x, w.y, w.z], k * 3);
    }
  }
  update(dt) {
    if (!this.h.root.visible) return;
    dt = Math.min(dt, 1 / 30); if (dt <= 0) return;
    this.t += dt;
    const n = this.rows * this.cols, P = this.pos, Q = this.prev, damp = this.def.damping ?? 0.985, g = (this.def.gravity ?? -9.8) * dt * dt;
    // detect teleports (big root jumps)
    const rp = this.h.root.getWorldPosition(_w);
    if (this._lastRoot && this._lastRoot.distanceToSquared(rp) > 1) this.reset();
    (this._lastRoot ??= new THREE.Vector3()).copy(rp);
    const wind = this.def.wind ?? 0.3, wx = Math.sin(this.t * 1.3) * wind * dt * dt, wz = Math.cos(this.t * 0.7) * wind * dt * dt;
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      if (this.pinBone[k]) { this.pinWorld(k, _v); Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2]; P[o] = _v.x; P[o + 1] = _v.y; P[o + 2] = _v.z; continue; }
      const x = P[o], y = P[o + 1], z = P[o + 2];
      P[o] += (x - Q[o]) * damp + wx; P[o + 1] += (y - Q[o + 1]) * damp + g; P[o + 2] += (z - Q[o + 2]) * damp + wz;
      Q[o] = x; Q[o + 1] = y; Q[o + 2] = z;
    }
    for (const c of this.colliders) c.world.copy(c.local).applyMatrix4(c.bone.matrixWorld);
    const scale = this.h.root.scale.x || 1, floorY = this.h.root.getWorldPosition(_w).y + 0.01;
    const iters = this.def.iterations ?? 4;
    for (let it = 0; it < iters; it++) {
      for (const [a, b, rest, s] of this.cons) {
        const ao = a * 3, bo = b * 3;
        const dx = P[bo] - P[ao], dy = P[bo + 1] - P[ao + 1], dz = P[bo + 2] - P[ao + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, diff = ((d - rest * scale) / d) * 0.5 * s;
        const pa = !this.pinBone[a], pb = !this.pinBone[b];
        if (pa && pb) { P[ao] += dx * diff; P[ao + 1] += dy * diff; P[ao + 2] += dz * diff; P[bo] -= dx * diff; P[bo + 1] -= dy * diff; P[bo + 2] -= dz * diff; }
        else if (pa) { P[ao] += dx * diff * 2; P[ao + 1] += dy * diff * 2; P[ao + 2] += dz * diff * 2; }
        else if (pb) { P[bo] -= dx * diff * 2; P[bo + 1] -= dy * diff * 2; P[bo + 2] -= dz * diff * 2; }
      }
      for (const c of this.colliders) {
        const r = (c.r + (this.def.thickness ?? 0.008)) * scale;
        for (let k = 0; k < n; k++) {
          if (this.pinBone[k]) continue; const o = k * 3;
          const dx = P[o] - c.world.x, dy = P[o + 1] - c.world.y, dz = P[o + 2] - c.world.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-6, f = r / d; P[o] = c.world.x + dx * f; P[o + 1] = c.world.y + dy * f; P[o + 2] = c.world.z + dz * f; }
        }
      }
    }
    for (let k = 0; k < n; k++) if (P[k * 3 + 1] < floorY) P[k * 3 + 1] = floorY;
    this.syncMesh();
  }
  syncMesh() {
    this.h.root.updateMatrixWorld(); this.inv.copy(this.h.root.matrixWorld).invert();
    const a = this.geo.attributes.position, n = this.rows * this.cols;
    for (let k = 0; k < n; k++) { _v.fromArray(this.pos, k * 3).applyMatrix4(this.inv); a.setXYZ(k, _v.x, _v.y, _v.z); }
    a.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------- fabric textures
function fabricTex(kind, a, b) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, S, S);
  if (kind === 'phakhaoma') { // ผ้าขาวม้า: woven checks
    const cols = [a, b, '#f4efe2', b];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = cols[(i + j * 3) % 4]; g.globalAlpha = 0.85; g.fillRect(i * 32, j * 32, 32, 32); }
    g.globalAlpha = 0.5; g.fillStyle = '#f4efe2'; for (let i = 0; i < 8; i++) { g.fillRect(i * 32 + 14, 0, 3, S); g.fillRect(0, i * 32 + 14, S, 3); }
  } else if (kind === 'knit') {
    g.globalAlpha = 0.22; g.fillStyle = '#000'; for (let x = 0; x < S; x += 6) for (let y = 0; y < S; y += 8) { g.beginPath(); g.ellipse(x + 3, y + 4, 2.4, 3.8, 0.4 * ((x / 6) % 2 ? 1 : -1), 0, 7); g.fill(); }
    g.globalAlpha = 0.5; g.fillStyle = b; for (let y = 0; y < S; y += 64) g.fillRect(0, y + 40, S, 12);
  } else if (kind === 'wool') {
    g.globalAlpha = 0.1; for (let i = 0; i < 3000; i++) { g.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * S, Math.random() * S, 2, 1); }
    g.globalAlpha = 1; g.fillStyle = b; g.fillRect(0, S - 18, S, 10); // hem band
  } else if (kind === 'nylon') {
    g.globalAlpha = 0.25; g.fillStyle = '#000'; for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 1);
  } else if (kind === 'gold') {
    g.fillStyle = b; for (let x = 0; x < S; x += 8) { g.fillRect(x, 0, 3, S); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const mat = (kind, a, b, o = {}) => new THREE.MeshStandardMaterial({ map: fabricTex(kind, a, b), side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.4, ...o });

// ---------------------------------------------------------------- garment library
// T = torso measurements from the body (model space): T.at(y) -> {rx, zf, zb, cz}
export function buildGarments(h) {
  const L = h.look, T = h.torso, out = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bodyCols = (extra = {}) => [
    { bone: 'pelvis', offset: V(0, 0.92, -0.02), r: T.at(0.92).rx * 0.95 }, { bone: 'spine_01', offset: V(0, 1.06, 0), r: T.at(1.06).rx * 0.95 },
    { bone: 'spine_03', offset: V(0, 1.28, 0.0), r: T.at(1.28).rx * 0.92 },
    { bone: 'thigh_l', offset: V(0.1, 0.75, 0), r: 0.09 }, { bone: 'thigh_r', offset: V(-0.1, 0.75, 0), r: 0.09 },
    { bone: 'thigh_l', offset: V(0.1, 0.6, 0.01), r: 0.075 }, { bone: 'thigh_r', offset: V(-0.1, 0.6, 0.01), r: 0.075 },
    { bone: 'calf_l', offset: V(0.11, 0.4, 0.0), r: 0.06 }, { bone: 'calf_r', offset: V(-0.11, 0.4, 0.0), r: 0.06 },
    ...(L.belly > 0.3 ? [{ bone: 'spine_01', offset: V(0, 1.03, 0.1), r: 0.2 * L.belly }] : []),
  ];
  // open-front coat / cardigan skirt: ring from the waist down
  const skirt = ({ y0, y1, gap, rows = 9, cols = 22, flare = 0.08, material, top = 0.02 }) => {
    const a0 = gap, a1 = Math.PI * 2 - gap;
    return new Cloth(h, {
      rows, cols, material, stiffness: 1, bend: 0.3, damping: 0.982, thickness: 0.012, wind: 0.25, uvScale: [3, 1],
      rest: (i, j) => { const u = i / (rows - 1), a = a0 + (a1 - a0) * (j / (cols - 1)), y = y0 + (y1 - y0) * u; const m = T.at(Math.max(0.82, y)); const rx = m.rx + top + flare * u, rz = (m.zf - m.zb) / 2 + top + flare * u, cz = (m.zf + m.zb) / 2; return V(Math.sin(a) * rx, y, cz + Math.cos(a) * rz); },
      pin: (i) => (i === 0 ? 'pelvis' : null), colliders: bodyCols(),
    });
  };
  if (L.coat) out.push(skirt({ y0: 0.96, y1: 0.42, gap: 0.22, rows: 11, cols: 26, flare: 0.1, material: mat('wool', L.shirt, '#2e3322'), top: 0.03 }));
  if (L.cardiganTails) out.push(skirt({ y0: 0.98, y1: 0.66, gap: 0.42, rows: 7, cols: 22, flare: 0.05, material: mat('knit', L.shirt, '#a48c62'), top: 0.025 }));
  // draped strip over the shoulders (ผ้าขาวม้า / scarf): path around the neck, middle pinned
  const drape = ({ path, width, rows, pinFrom, pinTo, material, pinBone = 'spine_03' }) => {
    const curve = new THREE.CatmullRomCurve3(path.map((p) => V(...p)));
    return new Cloth(h, {
      rows, cols: 4, material, stiffness: 1, bend: 0.6, damping: 0.975, thickness: 0.01, wind: 0.5, uvScale: [1, 4],
      rest: (i, j) => { const u = i / (rows - 1), p = curve.getPoint(u), t = curve.getTangent(u); const side = V(-t.z, 0, t.x).normalize(); const up = new THREE.Vector3().crossVectors(t, side).normalize(); const w = (j / 3 - 0.5) * width; return p.clone().add(up.multiplyScalar(w)); },
      pin: (i) => (i >= pinFrom && i <= pinTo ? pinBone : null), colliders: [...bodyCols(), { bone: 'spine_03', offset: V(0.12, 1.42, -0.02), r: 0.07 }, { bone: 'spine_03', offset: V(-0.12, 1.42, -0.02), r: 0.07 }, { bone: 'neck_01', offset: V(0, 1.54, -0.03), r: 0.055 }],
    });
  };
  const nz = (y) => T.at(Math.min(1.42, y));
  if (L.phakhaoma) {
    const c = nz(1.3);
    out.push(drape({ rows: 30, width: 0.2, pinFrom: 11, pinTo: 18, material: mat('phakhaoma', '#2b5fa8', '#c8302a'), path: [
      [0.13, 1.08, c.zf + 0.06], [0.14, 1.28, c.zf + 0.04], [0.13, 1.46, 0.06], [0.08, 1.53, -0.06], [0, 1.54, -0.1], [-0.08, 1.53, -0.06], [-0.13, 1.46, 0.06], [-0.14, 1.28, c.zf + 0.04], [-0.13, 1.08, c.zf + 0.06]] }));
  }
  if (L.scarf) {
    out.push(drape({ rows: 28, width: 0.15, pinFrom: 9, pinTo: 18, material: mat('knit', '#8a2a3a', '#d8b06a'), path: [
      [0.07, 1.05, 0.16], [0.08, 1.3, 0.15], [0.09, 1.5, 0.08], [0.06, 1.56, -0.07], [-0.02, 1.57, -0.09], [-0.08, 1.55, -0.02], [-0.06, 1.52, 0.1], [0.02, 1.5, 0.12], [0.1, 1.35, 0.15], [0.12, 1.1, 0.17]] }));
  }
  // ropes: sling (soldier), aiguillette (general)
  const rope = ({ a, ab, b, bb, sag = 0.08, width = 0.03, material, rows = 18 }) => new Cloth(h, {
    rows, cols: 2, material, stiffness: 1, bend: 0.4, damping: 0.97, thickness: 0.012, wind: 0.2,
    rest: (i, j) => { const u = i / (rows - 1); const p = V(...a).lerp(V(...b), u); p.y -= Math.sin(u * Math.PI) * sag; p.z += Math.sin(u * Math.PI) * 0.04; p.x += (j - 0.5) * width; return p; },
    pin: (i) => (i === 0 ? ab : i === rows - 1 ? bb : null), colliders: bodyCols(),
  });
  if (L.sling) { const c = nz(1.3); out.push(rope({ a: [0.14, 1.42, c.zf + 0.02], ab: 'spine_03', b: [-0.16, 0.95, 0.1], bb: 'pelvis', sag: 0.12, width: 0.035, material: mat('nylon', '#1a1c1e', '#000') })); }
  if (L.aiguillette) { const c = nz(1.3); out.push(rope({ a: [-0.19, 1.43, 0.02], ab: 'spine_03', b: [-0.03, 1.3, c.zf + 0.03], bb: 'spine_03', sag: 0.1, width: 0.014, rows: 12, material: mat('gold', '#d8b04a', '#a8822a', { metalness: 0.8, roughness: 0.35 }) })); }
  return out;
}
