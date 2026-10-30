// Self-contained SDF sculpting + Surface Nets mesher. MESHER is stringified into a Web Worker,
// so it must not reference anything outside its own body.
//
// spec = {
//   prims: [{ t:'cap'|'ell'|'box'|'sph'|'tor', a, b, r:[ra,rb], s:[x,y,z], q:[x,y,z,w], round, k, op:'u'|'s'|'i',
//            bone, bone2, w, mat, noise:[amp,freq], clip }],
//   paints: [{ ...shape, mat, soft, mix }],   // recolour volumes (no geometry)
//   mats: [{ c:[r,g,b], c2:[r,g,b], vn, rough, metal, sss }],
//   bounds: { min:[x,y,z], max:[x,y,z] }, cell, clip:[{ n:[x,y,z], d }], sigma, smooth
// }
export function MESHER() {
  // ---------- noise ----------
  function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi; xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const c000 = hash(xi, yi, zi), c100 = hash(xi + 1, yi, zi), c010 = hash(xi, yi + 1, zi), c110 = hash(xi + 1, yi + 1, zi);
    const c001 = hash(xi, yi, zi + 1), c101 = hash(xi + 1, yi, zi + 1), c011 = hash(xi, yi + 1, zi + 1), c111 = hash(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf, x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
    const y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
    return y0 + (y1 - y0) * zf;
  }
  function fbm(x, y, z) { return noise(x, y, z) * 0.6 + noise(x * 2.03, y * 2.03, z * 2.03) * 0.3 + noise(x * 4.1, y * 4.1, z * 4.1) * 0.1; }

  // ---------- primitives ----------
  function prep(p) {
    const P = { ...p };
    if (P.q) { // inverse rotation (conjugate) as 3x3
      const [x, y, z, w] = P.q; const ix = -x, iy = -y, iz = -z;
      P.m = [1 - 2 * (iy * iy + iz * iz), 2 * (ix * iy - iz * w), 2 * (ix * iz + iy * w),
        2 * (ix * iy + iz * w), 1 - 2 * (ix * ix + iz * iz), 2 * (iy * iz - ix * w),
        2 * (ix * iz - iy * w), 2 * (iy * iz + ix * w), 1 - 2 * (ix * ix + iy * iy)];
    }
    if (P.t === 'cap') {
      const [ax, ay, az] = P.a, [bx, by, bz] = P.b; P.ba = [bx - ax, by - ay, bz - az]; P.bb = P.ba[0] ** 2 + P.ba[1] ** 2 + P.ba[2] ** 2 || 1e-9;
      const r = Math.max(P.r[0], P.r[1]); P.lo = [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.min(az, bz) - r]; P.hi = [Math.max(ax, bx) + r, Math.max(ay, by) + r, Math.max(az, bz) + r];
    } else {
      const c = P.a; let e;
      if (P.t === 'sph') e = [P.r[0], P.r[0], P.r[0]];
      else if (P.t === 'tor') { const R = P.s[0] + P.s[1]; e = [R, R, R]; }
      else { const m = Math.max(...P.s) + (P.round || 0); e = P.q ? [m, m, m] : [P.s[0] + (P.round || 0), P.s[1] + (P.round || 0), P.s[2] + (P.round || 0)]; }
      P.lo = [c[0] - e[0], c[1] - e[1], c[2] - e[2]]; P.hi = [c[0] + e[0], c[1] + e[1], c[2] + e[2]];
    }
    const pad = (P.k || 0) + (P.noise ? P.noise[0] * 1.5 : 0);
    P.lo = P.lo.map((v) => v - pad); P.hi = P.hi.map((v) => v + pad);
    P.k = P.k || 0; P.op = P.op || 'u';
    return P;
  }
  // returns distance, and sets T[0] = capsule parameter t
  const T = [0];
  function dist(P, x, y, z) {
    let px = x - P.a[0], py = y - P.a[1], pz = z - P.a[2], d;
    switch (P.t) {
      case 'cap': {
        const ba = P.ba; let t = (px * ba[0] + py * ba[1] + pz * ba[2]) / P.bb; t = t < 0 ? 0 : t > 1 ? 1 : t; T[0] = t;
        const qx = px - ba[0] * t, qy = py - ba[1] * t, qz = pz - ba[2] * t;
        d = Math.sqrt(qx * qx + qy * qy + qz * qz) - (P.r[0] + (P.r[1] - P.r[0]) * t);
        break;
      }
      case 'sph': d = Math.sqrt(px * px + py * py + pz * pz) - P.r[0]; break;
      default: {
        if (P.m) { const m = P.m; const lx = m[0] * px + m[1] * py + m[2] * pz, ly = m[3] * px + m[4] * py + m[5] * pz, lz = m[6] * px + m[7] * py + m[8] * pz; px = lx; py = ly; pz = lz; }
        if (P.t === 'ell') {
          const sx = P.s[0], sy = P.s[1], sz = P.s[2];
          const k0 = Math.sqrt((px / sx) ** 2 + (py / sy) ** 2 + (pz / sz) ** 2);
          const k1 = Math.sqrt((px / (sx * sx)) ** 2 + (py / (sy * sy)) ** 2 + (pz / (sz * sz)) ** 2) || 1e-9;
          d = (k0 * (k0 - 1)) / k1;
        } else if (P.t === 'box') {
          const rr = P.round || 0;
          const qx = Math.abs(px) - P.s[0] + rr, qy = Math.abs(py) - P.s[1] + rr, qz = Math.abs(pz) - P.s[2] + rr;
          d = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - rr;
        } else if (P.t === 'tor') {
          const qx = Math.sqrt(px * px + pz * pz) - P.s[0]; d = Math.sqrt(qx * qx + py * py) - P.s[1];
        } else d = 1e9;
      }
    }
    if (P.noise) d += (fbm(x * P.noise[1], y * P.noise[1], z * P.noise[1]) - 0.5) * 2 * P.noise[0];
    if (P.clip) for (const c of P.clip) { const cd = c.n[0] * x + c.n[1] * y + c.n[2] * z - c.d; if (cd > d) d = cd; }
    return d;
  }
  const inBox = (P, x, y, z) => x >= P.lo[0] && x <= P.hi[0] && y >= P.lo[1] && y <= P.hi[1] && z >= P.lo[2] && z <= P.hi[2];
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  function makeField(spec) {
    const prims = spec.prims.map(prep);
    const clips = spec.clip || [];
    const FAR = 0.25;
    function sdf(x, y, z) {
      let d = FAR;
      for (let i = 0; i < prims.length; i++) {
        const P = prims[i];
        if (P.op === 'u') { if (!inBox(P, x, y, z)) continue; d = smin(d, dist(P, x, y, z), P.k); }
        else if (P.op === 's') { if (!inBox(P, x, y, z)) continue; d = smax(d, -dist(P, x, y, z), P.k); }
        else if (P.op === 'i') { d = smax(d, inBox(P, x, y, z) ? dist(P, x, y, z) : FAR, P.k); }
      }
      for (const c of clips) { const cd = c.n[0] * x + c.n[1] * y + c.n[2] * z - c.d; if (cd > d) d = cd; }
      return d;
    }
    return { prims, sdf };
  }

  function buildMesh(spec) {
    const t0 = Date.now();
    const { prims, sdf } = makeField(spec);
    const cell = spec.cell, mn = spec.bounds.min, mx = spec.bounds.max;
    const nx = Math.ceil((mx[0] - mn[0]) / cell) + 1, ny = Math.ceil((mx[1] - mn[1]) / cell) + 1, nz = Math.ceil((mx[2] - mn[2]) / cell) + 1;
    const N = nx * ny * nz, idx = (i, j, k) => i + nx * (j + ny * k);
    const vals = new Float32Array(N), done = new Uint8Array(N);
    // coarse pass
    const S = 4, cx = Math.ceil((nx - 1) / S) + 1, cy = Math.ceil((ny - 1) / S) + 1, cz = Math.ceil((nz - 1) / S) + 1;
    const cv = new Float32Array(cx * cy * cz), cidx = (i, j, k) => i + cx * (j + cy * k);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
      cv[cidx(i, j, k)] = sdf(mn[0] + Math.min(i * S, nx - 1) * cell, mn[1] + Math.min(j * S, ny - 1) * cell, mn[2] + Math.min(k * S, nz - 1) * cell);
    const diag = S * cell * 1.8 + (spec.noiseMargin || 0.004);
    for (let k = 0; k < cz - 1; k++) for (let j = 0; j < cy - 1; j++) for (let i = 0; i < cx - 1; i++) {
      const c = [cv[cidx(i, j, k)], cv[cidx(i + 1, j, k)], cv[cidx(i, j + 1, k)], cv[cidx(i + 1, j + 1, k)], cv[cidx(i, j, k + 1)], cv[cidx(i + 1, j, k + 1)], cv[cidx(i, j + 1, k + 1)], cv[cidx(i + 1, j + 1, k + 1)]];
      let minAbs = 1e9; for (const v of c) minAbs = Math.min(minAbs, Math.abs(v));
      const active = minAbs < diag;
      const i0 = i * S, j0 = j * S, k0 = k * S, i1 = Math.min(i0 + S, nx - 1), j1 = Math.min(j0 + S, ny - 1), k1 = Math.min(k0 + S, nz - 1);
      for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const id = idx(ii, jj, kk);
        if (done[id] === 2) continue;
        if (active) { vals[id] = sdf(mn[0] + ii * cell, mn[1] + jj * cell, mn[2] + kk * cell); done[id] = 2; }
        else if (!done[id]) {
          const u = (ii - i0) / S, v = (jj - j0) / S, w = (kk - k0) / S;
          const a = c[0] + (c[1] - c[0]) * u, b = c[2] + (c[3] - c[2]) * u, e = c[4] + (c[5] - c[4]) * u, f = c[6] + (c[7] - c[6]) * u;
          const g = a + (b - a) * v, h = e + (f - e) * v; vals[id] = g + (h - g) * w; done[id] = 1;
        }
      }
    }
    // surface nets vertices
    const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
    const pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const cvals = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = vals[idx(i + CO[c][0], j + CO[c][1], k + CO[c][2])]; cvals[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        const va = cvals[a], vb = cvals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += CO[a][0] + (CO[b][0] - CO[a][0]) * t; sy += CO[a][1] + (CO[b][1] - CO[a][1]) * t; sz += CO[a][2] + (CO[b][2] - CO[a][2]) * t; n++;
      }
      cellVert[cid(i, j, k)] = pos.length / 3;
      pos.push(mn[0] + (i + sx / n) * cell, mn[1] + (j + sy / n) * cell, mn[2] + (k + sz / n) * cell);
    }
    // faces
    const quads = [];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const v0 = vals[idx(i, j, k)] < 0;
      if (i < nx - 1 && (vals[idx(i + 1, j, k)] < 0) !== v0) {
        const a = cellVert[cid(i, j - 1, k - 1)], b = cellVert[cid(i, j, k - 1)], c = cellVert[cid(i, j, k)], d = cellVert[cid(i, j - 1, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quads.push(v0 ? [a, b, c, d] : [a, d, c, b]);
      }
      if (j < ny - 1 && (vals[idx(i, j + 1, k)] < 0) !== v0) {
        const a = cellVert[cid(i - 1, j, k - 1)], b = cellVert[cid(i, j, k - 1)], c = cellVert[cid(i, j, k)], d = cellVert[cid(i - 1, j, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quads.push(v0 ? [a, d, c, b] : [a, b, c, d]);
      }
      if (k < nz - 1 && (vals[idx(i, j, k + 1)] < 0) !== v0) {
        const a = cellVert[cid(i - 1, j - 1, k)], b = cellVert[cid(i, j - 1, k)], c = cellVert[cid(i, j, k)], d = cellVert[cid(i - 1, j, k)];
        if (a >= 0 && b >= 0 && c >= 0 && d >= 0) quads.push(v0 ? [a, b, c, d] : [a, d, c, b]);
      }
    }
    const nv = pos.length / 3;
    let P = new Float32Array(pos);
    // relax + reproject (removes the voxel staircase)
    const iters = spec.smooth ?? 1;
    if (iters > 0) {
      const nb = new Array(nv); for (let i = 0; i < nv; i++) nb[i] = [];
      for (const q of quads) for (let e = 0; e < 4; e++) { const a = q[e], b = q[(e + 1) % 4]; nb[a].push(b); nb[b].push(a); }
      for (let it = 0; it < iters; it++) {
        const Q = new Float32Array(P.length);
        for (let i = 0; i < nv; i++) {
          const l = nb[i]; if (!l.length) { Q[i * 3] = P[i * 3]; Q[i * 3 + 1] = P[i * 3 + 1]; Q[i * 3 + 2] = P[i * 3 + 2]; continue; }
          let x = 0, y = 0, z = 0; for (const b of l) { x += P[b * 3]; y += P[b * 3 + 1]; z += P[b * 3 + 2]; }
          x = P[i * 3] * 0.4 + (x / l.length) * 0.6; y = P[i * 3 + 1] * 0.4 + (y / l.length) * 0.6; z = P[i * 3 + 2] * 0.4 + (z / l.length) * 0.6;
          // project back along gradient
          const e = cell * 0.25, d = sdf(x, y, z);
          let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
          const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
          Q[i * 3] = x - gx * d; Q[i * 3 + 1] = y - gy * d; Q[i * 3 + 2] = z - gz * d;
        }
        P = Q;
      }
    }
    // normals from the field
    const Nrm = new Float32Array(nv * 3);
    const e = cell * 0.5;
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1; Nrm[i * 3] = gx / l; Nrm[i * 3 + 1] = gy / l; Nrm[i * 3 + 2] = gz / l;
    }
    // triangles (split quads along the shorter diagonal)
    const index = new Uint32Array(quads.length * 6); let ii = 0;
    const d2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
    for (const [a, b, c, d] of quads) {
      if (d2(a, c) < d2(b, d)) { index[ii++] = a; index[ii++] = b; index[ii++] = c; index[ii++] = a; index[ii++] = c; index[ii++] = d; }
      else { index[ii++] = a; index[ii++] = b; index[ii++] = d; index[ii++] = b; index[ii++] = c; index[ii++] = d; }
    }
    // colour, surface params, skin weights
    const mats = spec.mats, paints = (spec.paints || []).map(prep);
    const col = new Float32Array(nv * 3), surf = new Float32Array(nv * 3);
    const skI = new Uint16Array(nv * 4), skW = new Float32Array(nv * 4);
    const sigma = spec.sigma || 0.012;
    const acc = new Map();
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let best = 1e9, bestMat = 0;
      const ds = new Float32Array(prims.length), ts = new Float32Array(prims.length);
      let dmin = 1e9;
      for (let p = 0; p < prims.length; p++) {
        const Pp = prims[p];
        if (!inBox(Pp, x, y, z)) { ds[p] = 1e9; continue; }
        const dd = dist(Pp, x, y, z); ds[p] = dd; ts[p] = T[0];
        const ad = Math.abs(dd);
        if (Pp.mat != null && Pp.mat >= 0 && ad < best - (Pp.op === 's' ? 0.0015 : 0)) { best = ad; bestMat = Pp.mat; }
        if (Pp.op === 'u' && Pp.w !== 0 && Pp.bone != null && dd < dmin) dmin = dd;
      }
      // colour
      const m = mats[bestMat] || mats[0];
      let r = m.c[0], g = m.c[1], b = m.c[2];
      let rough = m.rough ?? 0.6, metal = m.metal ?? 0, sss = m.sss ?? 0;
      if (m.c2) { const nn = fbm(x * (m.vn || 20), y * (m.vn || 20), z * (m.vn || 20)); const tt = Math.max(0, Math.min(1, (nn - 0.3) * 2.5)); r += (m.c2[0] - r) * tt; g += (m.c2[1] - g) * tt; b += (m.c2[2] - b) * tt; }
      if (m.spots) { const nn = noise(x * m.spots[0], y * m.spots[0], z * m.spots[0]); if (nn > m.spots[1]) { const tt = Math.min(1, (nn - m.spots[1]) * 12); r += (m.spots[2][0] - r) * tt; g += (m.spots[2][1] - g) * tt; b += (m.spots[2][2] - b) * tt; } }
      if (m.stripes) { const [freq, axis, amt, sc] = m.stripes; const coord = axis === 0 ? x : axis === 1 ? y : z; const nn = Math.sin(coord * freq + fbm(x * 8, y * 8, z * 8) * 6); if (nn > 0.35) { const tt = Math.min(1, (nn - 0.35) * 3) * amt; r += (sc[0] - r) * tt; g += (sc[1] - g) * tt; b += (sc[2] - b) * tt; } }
      for (const Pp of paints) {
        if (!inBox(Pp, x, y, z) && !(Pp.soft > 0.02)) continue;
        const dd = dist(Pp, x, y, z); const soft = Pp.soft || 0.004;
        let f = Math.max(0, Math.min(1, 0.5 - dd / (2 * soft))) * (Pp.mix ?? 1);
        if (f <= 0) continue;
        const pm = mats[Pp.mat];
        r += (pm.c[0] - r) * f; g += (pm.c[1] - g) * f; b += (pm.c[2] - b) * f;
        rough += ((pm.rough ?? rough) - rough) * f; metal += ((pm.metal ?? metal) - metal) * f; sss += ((pm.sss ?? sss) - sss) * f;
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      surf[i * 3] = rough; surf[i * 3 + 1] = metal; surf[i * 3 + 2] = sss;
      // skin weights
      acc.clear();
      for (let p = 0; p < prims.length; p++) {
        const Pp = prims[p]; if (Pp.op !== 'u' || Pp.w === 0 || Pp.bone == null || ds[p] > 1e8) continue;
        const wgt = Math.exp(-(ds[p] - dmin) / sigma) * (Pp.w ?? 1);
        if (wgt < 1e-4) continue;
        if (Pp.bone2 != null && Pp.t === 'cap') {
          const tt = ts[p], sm = tt * tt * (3 - 2 * tt);
          acc.set(Pp.bone, (acc.get(Pp.bone) || 0) + wgt * (1 - sm));
          acc.set(Pp.bone2, (acc.get(Pp.bone2) || 0) + wgt * sm);
        } else acc.set(Pp.bone, (acc.get(Pp.bone) || 0) + wgt);
      }
      const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = 0; for (const a of arr) tot += a[1];
      if (!arr.length) { skI[i * 4] = spec.defaultBone || 0; skW[i * 4] = 1; continue; }
      for (let k = 0; k < arr.length; k++) { skI[i * 4 + k] = arr[k][0]; skW[i * 4 + k] = arr[k][1] / tot; }
    }
    return { position: P, normal: Nrm, color: col, surf, skinIndex: skI, skinWeight: skW, index, stats: { nv, tris: index.length / 3, ms: Date.now() - t0, grid: [nx, ny, nz] } };
  }
  return { buildMesh, makeField };
}
