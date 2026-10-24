// Signed-distance modelling + surface-nets meshing with automatic skinning.
// Shapes are built from primitives (spheres, tapered capsules, ellipsoids,
// rounded boxes) combined with smooth unions. Each primitive carries a bone
// index and a material zone; skin weights come from primitive proximity.
import * as THREE from 'three';

const sq = (x) => x * x;

export class Prim {
  constructor(o) { Object.assign(this, { k: 0.02, bone: 0, zone: 0, sub: false, w: 1 }, o); this.prep(); }
  prep() {
    if (this.type === 'cap') {
      const a = this.a, b = this.b;
      this.ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      this.bb = this.ba[0] * this.ba[0] + this.ba[1] * this.ba[1] + this.ba[2] * this.ba[2] || 1e-9;
      const r = Math.max(this.ra, this.rb ?? this.ra);
      this.min = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r];
      this.max = [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r];
    } else if (this.type === 'sph') {
      const c = this.c, r = this.r;
      this.min = [c[0] - r, c[1] - r, c[2] - r]; this.max = [c[0] + r, c[1] + r, c[2] + r];
    } else if (this.type === 'ell' || this.type === 'box') {
      const c = this.c, s = this.type === 'ell' ? this.s : this.h;
      const m = Math.max(s[0], s[1], s[2]) + (this.r || 0);
      this.min = [c[0] - m, c[1] - m, c[2] - m]; this.max = [c[0] + m, c[1] + m, c[2] + m];
      if (this.rot) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...this.rot)); this.inv = q.clone().invert(); }
    }
  }
  local(x, y, z) {
    let px = x - this.c[0], py = y - this.c[1], pz = z - this.c[2];
    if (this.inv) { const v = new THREE.Vector3(px, py, pz).applyQuaternion(this.inv); px = v.x; py = v.y; pz = v.z; }
    return [px, py, pz];
  }
  d(x, y, z) {
    switch (this.type) {
      case 'sph': return Math.sqrt(sq(x - this.c[0]) + sq(y - this.c[1]) + sq(z - this.c[2])) - this.r;
      case 'cap': {
        const a = this.a, ba = this.ba;
        const pa0 = x - a[0], pa1 = y - a[1], pa2 = z - a[2];
        let h = (pa0 * ba[0] + pa1 * ba[1] + pa2 * ba[2]) / this.bb;
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        const r = this.ra + ((this.rb ?? this.ra) - this.ra) * h;
        return Math.sqrt(sq(pa0 - ba[0] * h) + sq(pa1 - ba[1] * h) + sq(pa2 - ba[2] * h)) - r;
      }
      case 'ell': {
        const [px, py, pz] = this.local(x, y, z);
        const s = this.s;
        const k0 = Math.sqrt(sq(px / s[0]) + sq(py / s[1]) + sq(pz / s[2]));
        const k1 = Math.sqrt(sq(px / (s[0] * s[0])) + sq(py / (s[1] * s[1])) + sq(pz / (s[2] * s[2])));
        return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(s[0], s[1], s[2]);
      }
      case 'box': {
        const [px, py, pz] = this.local(x, y, z);
        const r = this.r || 0, h = this.h;
        const qx = Math.abs(px) - h[0] + r, qy = Math.abs(py) - h[1] + r, qz = Math.abs(pz) - h[2] + r;
        return Math.sqrt(sq(Math.max(qx, 0)) + sq(Math.max(qy, 0)) + sq(Math.max(qz, 0))) + Math.min(Math.max(qx, qy, qz), 0) - r;
      }
    }
    return 1e9;
  }
}

export const sph = (c, r, o = {}) => new Prim({ type: 'sph', c, r, ...o });
export const cap = (a, b, ra, rb, o = {}) => new Prim({ type: 'cap', a, b, ra, rb: rb ?? ra, ...o });
export const ell = (c, s, o = {}) => new Prim({ type: 'ell', c, s, ...o });
export const rbox = (c, h, r, o = {}) => new Prim({ type: 'box', c, h, r, ...o });

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// Build a mesh from primitives. opts: {cell, pad, bones: n, zones: n, weightK}
export function meshPrims(prims, { cell = 0.01, pad = 0.03, weightK = 0.012, maxInf = 4, deform = null, zoneK = null } = {}) {
  zoneK = zoneK ?? cell * 0.35;
  // bounds
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { if (p.sub) continue; for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.min[i]); max[i] = Math.max(max[i], p.max[i]); } }
  for (let i = 0; i < 3; i++) { min[i] -= pad; max[i] += pad; }
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const N = nx * ny * nz;
  const field = new Float32Array(N).fill(1e3);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const gx = (i) => min[0] + i * cell, gy = (j) => min[1] + j * cell, gz = (k) => min[2] + k * cell;
  const range = (p, ax, n) => {
    const lo = Math.max(0, Math.floor((p.min[ax] - p.k - min[ax]) / cell) - 1);
    const hi = Math.min(n - 1, Math.ceil((p.max[ax] + p.k - min[ax]) / cell) + 1);
    return [lo, hi];
  };
  // additive primitives
  for (const p of prims) {
    if (p.sub) continue;
    const [i0, i1] = range(p, 0, nx), [j0, j1] = range(p, 1, ny), [k0, k1] = range(p, 2, nz);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const id = idx(i, j, k);
      field[id] = smin(field[id], p.d(gx(i), gy(j), gz(k)), p.k);
    }
  }
  // subtractive
  for (const p of prims) {
    if (!p.sub) continue;
    const [i0, i1] = range(p, 0, nx), [j0, j1] = range(p, 1, ny), [k0, k1] = range(p, 2, nz);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const id = idx(i, j, k);
      field[id] = smax(field[id], -p.d(gx(i), gy(j), gz(k)), p.k);
    }
  }
  if (deform) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const id = idx(i, j, k); field[id] += deform(gx(i), gy(j), gz(k)); }

  // surface nets: one vertex per sign-changing cell
  const vmap = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      cnt++;
    }
    vmap[cidx(i, j, k)] = pos.length / 3;
    pos.push(gx(i) + sx / cnt * cell, gy(j) + sy / cnt * cell, gz(k) + sz / cnt * cell);
  }
  // faces
  const ind = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[idx(i, j, k)] < 0;
    // x edge
    if (i < nx - 1) {
      const v1 = field[idx(i + 1, j, k)] < 0;
      if (v0 !== v1) {
        const a = vmap[cidx(i, j - 1, k - 1)], b = vmap[cidx(i, j, k - 1)], c = vmap[cidx(i, j, k)], d = vmap[cidx(i, j - 1, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c); }
      }
    }
    if (j < ny - 1) {
      const v1 = field[idx(i, j + 1, k)] < 0;
      if (v0 !== v1) {
        const a = vmap[cidx(i - 1, j, k - 1)], b = vmap[cidx(i, j, k - 1)], c = vmap[cidx(i, j, k)], d = vmap[cidx(i - 1, j, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d); }
      }
    }
    if (k < nz - 1) {
      const v1 = field[idx(i, j, k + 1)] < 0;
      if (v0 !== v1) {
        const a = vmap[cidx(i - 1, j - 1, k)], b = vmap[cidx(i, j - 1, k)], c = vmap[cidx(i, j, k)], d = vmap[cidx(i - 1, j, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { if (v0) ind.push(a, b, c, a, c, d); else ind.push(a, c, b, a, d, c); }
      }
    }
  }
  // normals from field gradient (trilinear sample)
  const sample = (x, y, z) => {
    const fx = (x - min[0]) / cell, fy = (y - min[1]) / cell, fz = (z - min[2]) / cell;
    const i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(ny - 2, Math.floor(fy))), k = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const u = fx - i, v = fy - j, w = fz - k;
    const f = (a, b, c) => field[idx(i + a, j + b, k + c)];
    const x00 = f(0, 0, 0) * (1 - u) + f(1, 0, 0) * u, x10 = f(0, 1, 0) * (1 - u) + f(1, 1, 0) * u;
    const x01 = f(0, 0, 1) * (1 - u) + f(1, 0, 1) * u, x11 = f(0, 1, 1) * (1 - u) + f(1, 1, 1) * u;
    return (x00 * (1 - v) + x10 * v) * (1 - w) + (x01 * (1 - v) + x11 * v) * w;
  };
  const nv = pos.length / 3;
  const nor = new Float32Array(nv * 3);
  const e = cell * 0.7;
  for (let i = 0; i < nv; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let gxv = sample(x + e, y, z) - sample(x - e, y, z), gyv = sample(x, y + e, z) - sample(x, y - e, z), gzv = sample(x, y, z + e) - sample(x, y, z - e);
    const l = Math.hypot(gxv, gyv, gzv) || 1;
    nor[i * 3] = gxv / l; nor[i * 3 + 1] = gyv / l; nor[i * 3 + 2] = gzv / l;
  }
  // skin weights + zones from primitive proximity
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), zone = new Float32Array(nv), zoneW = new Float32Array(nv * 8);
  const ds = new Float32Array(prims.length);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let best = Infinity, bi = 0;
    for (let p = 0; p < prims.length; p++) {
      const pr = prims[p];
      if (pr.sub) { ds[p] = 1e9; continue; }
      if (x < pr.min[0] - 0.05 || x > pr.max[0] + 0.05 || y < pr.min[1] - 0.05 || y > pr.max[1] + 0.05 || z < pr.min[2] - 0.05 || z > pr.max[2] + 0.05) { ds[p] = 1e9; continue; }
      ds[p] = pr.d(x, y, z);
      if (ds[p] < best) { best = ds[p]; bi = p; }
    }
    // accumulate per-bone weights
    const acc = new Map();
    let zsum = 0, zacc = 0;
    for (let p = 0; p < prims.length; p++) {
      if (ds[p] > 1e8) continue;
      const w = Math.exp(-(ds[p] - best) / weightK) * prims[p].w;
      if (w < 1e-3) continue;
      const b = prims[p].bone;
      acc.set(b, (acc.get(b) || 0) + w);
    }
    zone[v] = prims[bi].zone;
    // soft one-hot zone weights (8 zones in two vec4s) for crisp-but-smooth material edges
    let zt = 0;
    const zw = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let p = 0; p < prims.length; p++) {
      if (ds[p] > 1e8) continue;
      const w = Math.exp(-(ds[p] - best) / zoneK);
      if (w < 1e-3) continue;
      zw[prims[p].zone] += w; zt += w;
    }
    for (let q = 0; q < 8; q++) zoneW[v * 8 + q] = zw[q] / (zt || 1);
    const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxInf);
    const tot = arr.reduce((s, a) => s + a[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = arr[k] ? arr[k][0] : 0;
      skinWeight[v * 4 + k] = arr[k] ? arr[k][1] / tot : 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setAttribute('aZone', new THREE.BufferAttribute(zone, 1));
  const zA = new Float32Array(nv * 4), zB = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) for (let q = 0; q < 4; q++) { zA[v * 4 + q] = zoneW[v * 8 + q]; zB[v * 4 + q] = zoneW[v * 8 + 4 + q]; }
  g.setAttribute('aZoneA', new THREE.BufferAttribute(zA, 4));
  g.setAttribute('aZoneB', new THREE.BufferAttribute(zB, 4));
  g.setAttribute('aRest', new THREE.Float32BufferAttribute(pos.slice(), 3));
  g.setIndex(ind);
  g.computeBoundingSphere();
  return g;
}
