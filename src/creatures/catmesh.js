// Mochi's low-poly body. Hand-authored anatomical cross-sections lofted along the
// rig (deep keeled ribcage, tucked waist, wide pelvis, scapulae, muscled thighs,
// straight forearms, high hocks), a hand-built faceted head (flat forehead, brow
// ridge, zygomatic arches, whisker pads, nose leather, chin), cupped ears and
// digitigrade paws with split toes. Every vertex is skinned to the existing
// skeleton; the result is flat-shaded, one facet per plane.
import * as THREE from 'three';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const L = (n, s) => n + (s < 0 ? '.L' : '.R');

export const PART = { torso: 0, head: 1, fore: 2, hind: 3, tail: 4, ear: 5, jaw: 6, paw: 7, collar: 8 };
export const MAT = { coat: 0, nose: 1, ear: 2, pad: 3, mouth: 4, lid: 5, collar: 6, metal: 7 };
const FUR = 0.0052;   // coat depth at fur 1

// The head is modelled at skull size and scaled about the head bone: cheek fur,
// ruff and ears make a real cat's head read bigger than its skull.
// It is also carried a little nose-down, as a cat holds it.
export const HEAD = { pivot: [0, 0.295, -0.195], k: 1.1, tilt: -0.12 };
const tiltV = (v) => { const c = Math.cos(HEAD.tilt), s = Math.sin(HEAD.tilt); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
export const headPt = (p) => add(HEAD.pivot, tiltV(mul(sub(p, HEAD.pivot), HEAD.k)));
// right eye: centre, facing (a little outward and up), lateral and up axes
export const EYE = (() => {
  const c = headPt([0.0192, 0.302, -0.2275]), yaw = 0.2, pitch = 0.1, r = 0.0105 * HEAD.k, ez = 0.72;   // ez: the iris sits flat behind a shallow cornea
  const F0 = nrm([Math.sin(yaw), Math.sin(pitch), -Math.cos(yaw)]), L0 = nrm([-F0[2], 0, F0[0]]);
  const F = tiltV(F0), Lx = tiltV(L0), U = cross(Lx, F);
  return { c, yaw, pitch: pitch + HEAD.tilt, r, ez, F, L: Lx, U };
})();
// right ear: base centre, axis to the tip, across the opening, toward the back
export const EAR = (() => {
  const c = headPt([0.0265, 0.332, -0.1975]), H = 0.05 * HEAD.k, W = 0.0168 * HEAD.k;
  const U0 = nrm([0.19, 1, 0.07]), Fo = nrm([0.36, 0.05, -1]);
  const X0 = nrm(cross(Fo, U0)), Z0 = nrm(cross(X0, U0));
  return { c, H, W, U: tiltV(U0), X: tiltV(X0), Z: tiltV(Z0) };
})();

class Mesh {
  constructor() { this.P = []; this.W = []; this.X = []; this.F = []; this.post = []; }
  // a vertex: rest position, {bone: weight}, extras {fur, scap, lid}
  v(p, w, x = {}) { this.P.push(p); this.W.push(w); this.X.push(x); return this.P.length - 1; }
  // one facet; `ref` is a point inside the volume it bounds (see orient)
  tri(a, b, c, part, mat = 0, ref = null) {
    if (a === b || b === c || a === c) return;
    this.F.push([a, b, c, part, mat, ref]);
  }
  // Wind every connected surface consistently across its shared edges, then turn
  // the whole surface outward by an area-weighted vote of its facets' inside points.
  orient() {
    const P = this.P, F = this.F, key = (x, y) => (x < y ? x * 1e6 + y : y * 1e6 + x), EF = new Map();
    F.forEach((f, i) => { for (const [x, y] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]]) { const k = key(x, y); if (!EF.has(k)) EF.set(k, []); EF.get(k).push(i); } });
    const seen = new Uint8Array(F.length), flip = (f) => { const t = f[1]; f[1] = f[2]; f[2] = t; };
    for (let s0 = 0; s0 < F.length; s0++) {
      if (seen[s0]) continue;
      const comp = [s0]; seen[s0] = 1;
      for (let q = 0; q < comp.length; q++) {
        const f = F[comp[q]];
        for (const [x, y] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]]) {
          const nb = EF.get(key(x, y)); if (nb.length !== 2) continue;
          const g = nb[0] === comp[q] ? nb[1] : nb[0]; if (seen[g]) continue;
          const h = F[g]; if ((h[0] === x && h[1] === y) || (h[1] === x && h[2] === y) || (h[2] === x && h[0] === y)) flip(h);
          seen[g] = 1; comp.push(g);
        }
      }
      let vote = 0;
      for (const i of comp) { const f = F[i]; if (f[5]) vote += dot(cross(sub(P[f[1]], P[f[0]]), sub(P[f[2]], P[f[0]])), sub(mul(add(add(P[f[0]], P[f[1]]), P[f[2]]), 1 / 3), f[5])); }
      if (vote < 0) for (const i of comp) flip(F[i]);
    }
  }
  quad(a, b, c, d, part, mat, ref) {  // split along the shorter diagonal
    const P = this.P;
    if (len(sub(P[a], P[c])) <= len(sub(P[b], P[d]))) { this.tri(a, b, c, part, mat, ref); this.tri(a, c, d, part, mat, ref); }
    else { this.tri(a, b, d, part, mat, ref); this.tri(b, c, d, part, mat, ref); }
  }
  // zip two rows of vertices into a strip (greedy shortest diagonal)
  stitch(A, B, part, mat, ref, closed = false) {
    if (closed) { A = [...A, A[0]]; B = [...B, B[0]]; }
    const P = this.P; let i = 0, j = 0;
    while (i < A.length - 1 || j < B.length - 1) {
      if (j >= B.length - 1 || (i < A.length - 1 && len(sub(P[A[i + 1]], P[B[j]])) < len(sub(P[A[i]], P[B[j + 1]])))) { this.tri(A[i], A[i + 1], B[j], part, mat, ref); i++; }
      else { this.tri(A[i], B[j + 1], B[j], part, mat, ref); j++; }
    }
  }
  // rings of equal count, quads between neighbours
  loft(R, part, mat, refs) { for (let k = 0; k < R.length - 1; k++) { const a = R[k], b = R[k + 1], n = a.length; for (let i = 0; i < n; i++) this.quad(a[i], a[(i + 1) % n], b[(i + 1) % n], b[i], part, mat, refs[k]); } }
  fan(R, c, part, mat, ref) { for (let i = 0; i < R.length; i++) this.tri(R[i], R[(i + 1) % R.length], c, part, mat, ref); }

  normals() { const P = this.P, sn = P.map(() => [0, 0, 0]); for (const [a, b, c] of this.F) { const n = cross(sub(P[b], P[a]), sub(P[c], P[a])); for (const k of [a, b, c]) sn[k] = add(sn[k], n); } return sn; }

  build(boneIdx) {
    this.orient();
    const P = this.P;
    this.sn = this.normals();
    // the coat: the sculpt is the body under the fur; push each vertex out by its fur depth
    for (let k = 0; k < P.length; k++) { const f = this.X[k].fur ?? 1; P[k] = add(P[k], mul(nrm(this.sn[k]), FUR * Math.min(f, 1.3) + (f > 0.2 ? 0.0018 : 0))); }
    // things worn over the coat are built on the finished surface
    if (this.post.length) { for (const f of this.post) f(this); this.orient(); }
    const F = this.F, N = F.length * 3, sn = this.normals();
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), aSn = new Float32Array(N * 4), aInfo = new Float32Array(N * 4), aLid = new Float32Array(N);
    const si = new Uint16Array(N * 4), sw = new Float32Array(N * 4);
    let o = 0;
    F.forEach(([a, b, c, part, mat], f) => {
      const fn = nrm(cross(sub(P[b], P[a]), sub(P[c], P[a])));
      const rnd = (Math.sin(f * 12.9898 + part * 78.233) * 43758.5453) % 1;
      for (const k of [a, b, c]) {
        pos.set(P[k], o * 3); nor.set(fn, o * 3);
        const s = nrm(sn[k]), x = this.X[k];
        aSn.set([s[0], s[1], s[2], x.scap || 0], o * 4);
        aInfo.set([x.fur ?? 1, part, mat, Math.abs(rnd)], o * 4);
        aLid[o] = x.lid || 0;
        const ws = Object.entries(this.W[k]).filter((e) => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4), t = ws.reduce((s0, e) => s0 + e[1], 0) || 1;
        ws.forEach(([bn, w], q) => { const bi = boneIdx(bn); if (bi < 0) throw new Error('no bone ' + bn); si[o * 4 + q] = bi; sw[o * 4 + q] = w / t; });
        o++;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('aSn', new THREE.BufferAttribute(aSn, 4));
    g.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));
    g.setAttribute('aLid', new THREE.BufferAttribute(aLid, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// skin weights along a bone chain: owners[i] owns the segment pts[i]->pts[i+1],
// `after` owns everything past the last joint; weights blend across each joint
function chainW(p, pts, owners, after, h = 0.35) {
  let best = Infinity, u = 0;
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const d = sub(pts[i + 1], pts[i]), f = dot(sub(p, pts[i]), d) / dot(d, d), fc = Math.min(1, Math.max(0, f));
    const dist = len(sub(p, add(pts[i], mul(d, fc))));
    if (dist < best - 1e-9) { best = dist; u = i + (i === n - 1 ? Math.max(f, 0) : i === 0 ? Math.min(f, 1) : fc); }
  }
  const own = (k) => (k < 0 ? owners[0] : k >= n ? after : owners[k]);
  const J = Math.round(u);
  if (J <= 0) return { [owners[0]]: 1 };
  const t = ss(-h, h, u - J), w = {}, a = own(J - 1), b = own(J);
  w[a] = (w[a] || 0) + 1 - t; w[b] = (w[b] || 0) + t;
  return w;
}

const blendW = (a, b, t) => { const w = {}; for (const [k, v] of Object.entries(a)) w[k] = (w[k] || 0) + v * (1 - t); for (const [k, v] of Object.entries(b)) w[k] = (w[k] || 0) + v * t; return w; };

// ---------------------------------------------------------------- torso + neck
// Each station: top midline [y, z], bottom midline [y, z], then four lateral
// points [x, y] from the spine down to the belly. Lateral z follows the slope
// between top and bottom, so neck sections lean back like the real neck.
const STATIONS = [
  [[0.229, 0.184], [0.186, 0.184], [[0.012, 0.226], [0.020, 0.215], [0.020, 0.199], [0.011, 0.189]]],   // under the tail root
  [[0.237, 0.164], [0.174, 0.164], [[0.021, 0.234], [0.034, 0.219], [0.035, 0.195], [0.022, 0.179]]],   // croup / ischium
  [[0.246, 0.138], [0.156, 0.138], [[0.026, 0.243], [0.043, 0.226], [0.043, 0.192], [0.029, 0.163]]],   // hips: pelvis widest, tuber coxae
  [[0.252, 0.108], [0.143, 0.108], [[0.025, 0.249], [0.041, 0.229], [0.041, 0.190], [0.030, 0.153]]],   // flank fold in front of the thigh
  [[0.254, 0.076], [0.140, 0.076], [[0.023, 0.251], [0.037, 0.230], [0.037, 0.192], [0.028, 0.156]]],   // loin, primordial pouch below
  [[0.253, 0.044], [0.145, 0.044], [[0.022, 0.25], [0.035, 0.229], [0.036, 0.193], [0.027, 0.160]]],   // waist, tucked
  [[0.251, 0.012], [0.132, 0.012], [[0.023, 0.248], [0.038, 0.227], [0.041, 0.187], [0.031, 0.145]]],   // last ribs
  [[0.247, -0.020], [0.118, -0.020], [[0.024, 0.244], [0.040, 0.225], [0.045, 0.181], [0.034, 0.133]]], // ribcage
  [[0.247, -0.052], [0.109, -0.052], [[0.025, 0.245], [0.041, 0.226], [0.044, 0.177], [0.032, 0.124]]], // deepest chest, behind the elbows
  [[0.250, -0.082], [0.110, -0.082], [[0.026, 0.250], [0.038, 0.230], [0.040, 0.178], [0.028, 0.124]]], // withers: scapulae either side
  [[0.255, -0.112], [0.128, -0.112], [[0.025, 0.253], [0.038, 0.233], [0.039, 0.186], [0.028, 0.142]]], // point of the shoulder, keel
  [[0.265, -0.134], [0.152, -0.147], [[0.026, 0.261], [0.038, 0.238], [0.039, 0.200], [0.028, 0.168]]], // neck base, thick
  [[0.279, -0.146], [0.194, -0.172], [[0.022, 0.275], [0.034, 0.257], [0.035, 0.229], [0.025, 0.205]]], // mid neck
  [[0.292, -0.156], [0.238, -0.192], [[0.019, 0.288], [0.029, 0.276], [0.030, 0.259], [0.021, 0.245]]], // under the skull
];
const SCAP = [0, 0, 0, 0, 0, 0, 0, 0, 0.35, 1, 0.55, 0, 0, 0];   // how much each station's upper flank is scapula

function torso(M, R) {
  const spine = ['hips', 'spine1', 'spine2', 'chest', 'neck', 'head'].map((n) => R[n]);
  const rings = [], refs = [], ws = [];
  STATIONS.forEach(([T, B, lat], si) => {
    const zAt = (y) => T[1] + (B[1] - T[1]) * Math.min(1, Math.max(0, (T[0] - y) / (T[0] - B[0])));
    const c = [0, (T[0] + B[0]) / 2, (T[1] + B[1]) / 2];
    let w = chainW(c, spine, ['hips', 'spine1', 'spine2', 'chest', 'neck'], 'head');
    if (si === STATIONS.length - 1) w = { neck: 0.55, head: 0.45 };
    ws.push(w);
    const fur = (y) => 0.75 + 0.35 * ss(0.15, 0.24, y);
    // the throat keeps with the section below it, so it fills out under the chin instead of caving in when the head drops
    const wy = (y) => (si >= 11 ? blendW(w, ws[si - 1], 0.6 * ss(0.3, 1, (T[0] - y) / (T[0] - B[0]))) : w);
    const top = M.v([0, T[0], T[1]], w, { fur: fur(T[0]) }), bot = M.v([0, B[0], B[1]], wy(B[0]), { fur: 0.85 });
    // round the lower ribs: one more point between flank and belly, bulged outward
    const [a2, a3] = [lat[2], lat[3]], d = [a3[0] - a2[0], a3[1] - a2[1]], ob = [-d[1], d[0]];
    lat = [...lat.slice(0, 3), [(a2[0] + a3[0]) / 2 + ob[0] * 0.1, (a2[1] + a3[1]) / 2 + ob[1] * 0.1], a3];
    const R1 = [], L1 = [];
    lat.forEach(([x, y], k) => {
      const sc = k < 2 ? SCAP[si] * (k === 0 ? 0.8 : 1) : k === 2 ? SCAP[si] * 0.3 : 0;
      R1.push(M.v([x, y, zAt(y)], wy(y), { fur: fur(y), scap: sc })); L1.push(M.v([-x, y, zAt(y)], wy(y), { fur: fur(y), scap: -sc }));
    });
    rings.push([top, ...R1, bot, ...L1.reverse()]);
    refs.push(c);
  });
  // the collar's line: three sections spliced into the neck (back edge, middle, front edge
  // of the strap), each point on the neck's own facet edges; the coat dips a little under it
  const [ra, rb] = [rings[12], rings[13]], cuts = [-1, 0, 1].map((side) => ra.map((ia, i) => {
    const ib = rb[i], t = COLLAR.t + side * COLLAR.w / 2 / len(sub(M.P[ib], M.P[ia])), fa = M.X[ia].fur, fb = M.X[ib].fur;
    return M.v(mix(M.P[ia], M.P[ib], t), blendW(M.W[ia], M.W[ib], t), { fur: (fa + (fb - fa) * t) * (side ? 0.85 : 0.7) });
  }));
  const cc = mix(refs[12], refs[13], COLLAR.t);
  rings.splice(13, 0, ...cuts); refs.splice(13, 0, cc, cc, cc);
  M.neck = { cuts, ctr: cc, brisket: rings[11][6] };
  M.loft(rings, PART.torso, MAT.coat, refs.map((c, k) => mix(c, refs[k + 1] || c, 0.5)));
  // rump closes under the tail; the neck closes inside the skull
  M.fan(rings[0], M.v([0, 0.207, 0.192], { hips: 1 }, { fur: 0.6 }), PART.torso, MAT.coat, [0, 0.207, 0.17]);
  const e = rings.length - 1;
  M.fan(rings[e], M.v([0, 0.268, -0.182], { head: 0.6, neck: 0.4 }), PART.torso, MAT.coat, mix(refs[e], refs[e - 1], 0.6));
}

// ---------------------------------------------------------------- legs
// An 8-point section around a limb: front, outside, back and inside extents.
function limbRing(M, c, axis, e, s, w, x) {
  const a = nrm(axis), f = nrm(sub([0, 0, -1], mul(a, -a[2]))), o = mul(nrm(cross(a, f)), s), k = e.k ?? 0.72;
  const P = [mul(f, e.f), add(mul(f, e.f * k), mul(o, e.o * k)), mul(o, e.o), add(mul(f, -e.b * k), mul(o, e.o * k)),
    mul(f, -e.b), add(mul(f, -e.b * k), mul(o, -e.i * k)), mul(o, -e.i), add(mul(f, e.f * k), mul(o, -e.i * k))];
  return P.map((p) => M.v(add(c, p), w, x));
}

// digitigrade paw: knuckle ring with four toes, sole ring, pads underneath
function paw(M, top, at, s, hind, w, part) {
  const sx = hind ? 0.92 : 1.04, sz = hind ? 1.08 : 1, oz = hind ? -0.006 : -0.004;
  const K = [[0, 0.0182, -0.0132], [0.0034, 0.019, -0.016], [0.0064, 0.0175, -0.0105], [0.011, 0.0165, -0.0122], [0.0138, 0.0158, -0.002], [0.0108, 0.0172, 0.0072],
    [0, 0.0192, 0.0098], [-0.0108, 0.0172, 0.0072], [-0.0138, 0.0158, -0.002], [-0.011, 0.0165, -0.0122], [-0.0064, 0.0175, -0.0105], [-0.0034, 0.019, -0.016]];
  const S = [[0, 0.0062, -0.0138], [0.0036, 0.0055, -0.0184], [0.0068, 0.0062, -0.0131], [0.0122, 0.0052, -0.0144], [0.0148, 0.0042, -0.002], [0.0115, 0.0042, 0.0082],
    [0, 0.0045, 0.0112], [-0.0115, 0.0042, 0.0082], [-0.0148, 0.0042, -0.002], [-0.0122, 0.0052, -0.0144], [-0.0068, 0.0062, -0.0131], [-0.0036, 0.0055, -0.0184]];
  const put = (q) => [at[0] + q[0] * sx * s, q[1], at[2] + oz + q[2] * sz];
  const k1 = K.map((q) => M.v(put(q), w, { fur: 0.3 })), k2 = S.map((q) => M.v(put(q), w, { fur: 0.12 }));
  const ctr = [at[0], 0.01, at[2] + oz];
  M.stitch(top, k1, part, MAT.coat, ctr, true);
  M.loft([k1, k2], part, MAT.coat, [ctr]);
  M.fan(k2, M.v([at[0], 0.0004, at[2] + oz - 0.002], w, { fur: 0 }), part, MAT.pad, [at[0], 0.008, at[2] + oz]);
}

function foreleg(M, R, s) {
  const sh = R[L('fsh', s)], el = R[L('felb', s)], wr = R[L('fwr', s)], pw = R[L('fpaw', s)];
  const S = (n) => L(n, s), dx = (v) => [v[0] * s, v[1], v[2]];
  const rings = [], refs = [];
  const ring = (c, axis, e, w, x) => { rings.push(limbRing(M, c, axis, e, s, w, x)); refs.push(c); };
  const down = sub(el, sh), fore = sub(wr, el), pastern = sub(pw, wr);
  // scapula: a flat blade on the upper chest wall, riding on the chest
  ring(add(sh, dx([-0.005, 0.034, 0.016])), [0.08 * s, -1, -0.35], { f: 0.016, b: 0.022, o: 0.007, i: 0.01 }, { chest: 0.85, [S('fsh')]: 0.15 }, { fur: 1, scap: s });
  ring(add(sh, dx([-0.004, 0.002, -0.003])), down, { f: 0.019, b: 0.024, o: 0.0138, i: 0.0125 }, { [S('fsh')]: 0.82, chest: 0.18 }, { fur: 0.9, scap: 0.35 * s });
  ring(add(mix(sh, el, 0.5), dx([-0.003, 0, 0.003])), down, { f: 0.016, b: 0.025, o: 0.0145, i: 0.013 }, { [S('fsh')]: 1 }, { fur: 0.8 });   // triceps behind the humerus
  ring(add(el, dx([-0.0015, 0.006, 0.002])), sub(wr, sh), { f: 0.0145, b: 0.022, o: 0.0145, i: 0.013, k: 0.68 }, { [S('fsh')]: 0.5, [S('felb')]: 0.5 }, { fur: 0.6 });   // elbow, olecranon behind
  ring(mix(el, wr, 0.2), fore, { f: 0.0158, b: 0.0128, o: 0.0142, i: 0.0128 }, { [S('felb')]: 1 }, { fur: 0.5 });   // forearm muscles
  ring(mix(el, wr, 0.72), fore, { f: 0.0112, b: 0.0102, o: 0.0114, i: 0.0106 }, { [S('felb')]: 1 }, { fur: 0.35 });
  ring(add(wr, [0, 0.003, 0]), sub(pw, el), { f: 0.0098, b: 0.0112, o: 0.0108, i: 0.0102 }, { [S('felb')]: 0.4, [S('fwr')]: 0.6 }, { fur: 0.3 });   // carpus
  ring(mix(wr, pw, 0.55), pastern, { f: 0.0118, b: 0.0094, o: 0.0118, i: 0.011 }, { [S('fwr')]: 1 }, { fur: 0.25 });
  M.loft(rings, PART.fore, MAT.coat, refs.map((c, k) => mix(c, refs[k + 1] || c, 0.5)));
  M.fan(rings[0], M.v(add(refs[0], [0, 0.004, 0]), { chest: 1 }), PART.fore, MAT.coat, add(refs[0], [0, -0.01, 0]));
  // carpal pad: a small dark knob behind the wrist
  const r7 = rings[6], pk = M.v(add(wr, [0, -0.008, 0.0135]), { [S('fwr')]: 1 }, { fur: 0 }), pin = add(wr, [0, 0.002, 0]);
  M.tri(r7[3], r7[4], pk, PART.paw, MAT.pad, pin); M.tri(r7[4], r7[5], pk, PART.paw, MAT.pad, pin); M.tri(r7[5], r7[3], pk, PART.paw, MAT.pad, pin);
  paw(M, rings[7], pw, s, false, { [S('fpaw')]: 1 }, PART.paw);
}

function hindleg(M, R, s) {
  const hp = R[L('hhip', s)], kn = R[L('hkn', s)], hk = R[L('hhock', s)], pw = R[L('hpaw', s)];
  const S = (n) => L(n, s), dx = (v) => [v[0] * s, v[1], v[2]];
  const rings = [], refs = [];
  const ring = (c, axis, e, w, x) => { rings.push(limbRing(M, c, axis, e, s, w, x)); refs.push(c); };
  const femur = sub(kn, hp), tibia = sub(hk, kn), meta = sub(pw, hk);
  // haunch: the big flat-sided thigh hanging from the pelvis
  ring(add(hp, dx([-0.007, 0.03, 0.006])), [0.1 * s, -1, -0.1], { f: 0.03, b: 0.036, o: 0.013, i: 0.012 }, { hips: 0.75, [S('hhip')]: 0.25 }, { fur: 1 });
  ring(add(hp, dx([0.004, 0.002, 0.005])), femur, { f: 0.032, b: 0.04, o: 0.022, i: 0.017 }, { [S('hhip')]: 0.7, hips: 0.3 }, { fur: 1 });
  ring(add(mix(hp, kn, 0.5), dx([0.003, 0, 0.005])), femur, { f: 0.027, b: 0.033, o: 0.021, i: 0.0165 }, { [S('hhip')]: 1 }, { fur: 0.9 });
  ring(add(mix(hp, kn, 0.82), dx([0.001, 0, 0.003])), femur, { f: 0.018, b: 0.024, o: 0.0165, i: 0.0138 }, { [S('hhip')]: 1 }, { fur: 0.7 });
  ring(add(kn, [0, 0.002, 0.001]), sub(hk, hp), { f: 0.0135, b: 0.019, o: 0.0138, i: 0.0125, k: 0.68 }, { [S('hhip')]: 0.5, [S('hkn')]: 0.5 }, { fur: 0.55 });   // stifle
  ring(mix(kn, hk, 0.24), tibia, { f: 0.0115, b: 0.0195, o: 0.0132, i: 0.012 }, { [S('hkn')]: 1 }, { fur: 0.5 });   // gaskin, calf behind
  ring(mix(kn, hk, 0.64), tibia, { f: 0.0088, b: 0.012, o: 0.0096, i: 0.009 }, { [S('hkn')]: 1 }, { fur: 0.35 });
  ring(add(hk, [0, 0.002, 0.001]), sub(pw, kn), { f: 0.008, b: 0.0128, o: 0.0089, i: 0.0084, k: 0.66 }, { [S('hkn')]: 0.4, [S('hhock')]: 0.6 }, { fur: 0.25 });   // hock, calcaneus
  ring(mix(hk, pw, 0.5), meta, { f: 0.0089, b: 0.0078, o: 0.0093, i: 0.0088 }, { [S('hhock')]: 1 }, { fur: 0.2 });
  ring(mix(hk, pw, 0.84), meta, { f: 0.0105, b: 0.0086, o: 0.0106, i: 0.01 }, { [S('hhock')]: 1 }, { fur: 0.2 });
  M.loft(rings, PART.hind, MAT.coat, refs.map((c, k) => mix(c, refs[k + 1] || c, 0.5)));
  M.fan(rings[0], M.v(add(refs[0], [0, 0.004, 0]), { hips: 1 }), PART.hind, MAT.coat, add(refs[0], [0, -0.01, 0]));
  paw(M, rings[rings.length - 1], pw, s, true, { [S('hpaw')]: 1 }, PART.paw);
}

// ---------------------------------------------------------------- tail
function tail(M, R) {
  const ch = [[0, 0.227, 0.138], ...[1, 2, 3, 4, 5, 6, 7].map((i) => R['tail' + i])];
  const own = ['hips', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'];
  const t7 = R.tail7, tip = add(t7, [0, 0.003, 0.042]);
  const st = [[ch[0], 0.0195], [mix(ch[0], ch[1], 0.6), 0.0185]];
  for (let i = 1; i < 7; i++) { st.push([ch[i], 0.0175 - (i - 1) * 0.0014]); st.push([mix(ch[i], ch[i + 1], 0.5), 0.0168 - (i - 1) * 0.0014]); }
  st.push([t7, 0.0088], [add(t7, [0, 0.0015, 0.016]), 0.0082], [add(t7, [0, 0.0025, 0.031]), 0.0062]);
  const n = 7, rings = [], refs = [];
  st.forEach(([c, r], k) => {
    const nx = st[k + 1] ? st[k + 1][0] : tip, pv = st[k - 1] ? st[k - 1][0] : c, ax = nrm(sub(nx, pv));
    const up = nrm(sub([0, 1, 0], mul(ax, ax[1]))), sd = cross(ax, up);
    const w = chainW(c, ch, own, 'tail7', 0.5);
    rings.push(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return M.v(add(c, add(mul(up, Math.cos(a) * r), mul(sd, Math.sin(a) * r * 1.04))), w, { fur: 1.6 }); }));
    refs.push(c);
  });
  M.loft(rings, PART.tail, MAT.coat, refs.map((c, k) => mix(c, refs[k + 1] || c, 0.5)));
  M.fan(rings[rings.length - 1], M.v(tip, { tail7: 1 }, { fur: 1.2 }), PART.tail, MAT.coat, refs[refs.length - 1]);
  M.fan(rings[0], M.v(add(ch[0], [0, 0, -0.01]), { hips: 1 }), PART.tail, MAT.coat, add(ch[0], [0, 0, 0.01]));
}

// ---------------------------------------------------------------- head
// Right half + midline, mirrored. Landmarks are real feline anatomy.
const HP = {
  // midline
  nape: [0, 0.2985, -0.1565], occ: [0, 0.3275, -0.1705], crown: [0, 0.3395, -0.1925], fore: [0, 0.3375, -0.2155],
  brow: [0, 0.3245, -0.2412], stop: [0, 0.3085, -0.2472], bridge: [0, 0.297, -0.253],
  nTop: [0, 0.291, -0.2568], nTip: [0, 0.2852, -0.2612], nBot: [0, 0.2795, -0.2592], lip: [0, 0.2747, -0.256],
  pal1: [0, 0.2745, -0.2475], pal2: [0, 0.2745, -0.215], skullB: [0, 0.282, -0.172],
  // right side: cranium and ear bases
  aNape: [0.023, 0.2955, -0.1595], aOcc: [0.018, 0.3255, -0.1735], earB: [0.0148, 0.3362, -0.1875], earF: [0.0142, 0.3378, -0.207],
  skull: [0.0345, 0.3125, -0.179], earO: [0.0385, 0.3205, -0.1995], temple: [0.0345, 0.321, -0.218], aFore: [0.0168, 0.3362, -0.2205],
  // brow ridge, orbit, zygomatic arch
  browI: [0.0088, 0.3212, -0.2408], browO: [0.0245, 0.3222, -0.2368], orbit: [0.0388, 0.305, -0.2265], zyg: [0.0438, 0.293, -0.2135],
  zygB: [0.041, 0.2995, -0.193], side: [0.0335, 0.2915, -0.173],
  // nose and muzzle: leather, wings, whisker pads, lips
  nose: [0.0066, 0.2945, -0.2526], nSide: [0.0062, 0.2895, -0.2562], nWing: [0.0046, 0.2835, -0.259],
  padT: [0.0118, 0.2868, -0.2556], padF: [0.0092, 0.2772, -0.258], padS: [0.0198, 0.2802, -0.2505],
  lipF: [0.0048, 0.2732, -0.2562], lipM: [0.0138, 0.2727, -0.2505], mouth: [0.0195, 0.2752, -0.2405],
  malar: [0.0262, 0.2868, -0.2422], cheek: [0.0345, 0.2865, -0.2305], jowl: [0.0352, 0.2738, -0.2105], jawB: [0.0315, 0.2745, -0.186],
  pal1s: [0.0115, 0.2742, -0.2425], pal2s: [0.021, 0.2752, -0.215],
};
const HF = {
  skull: [['fore', 'aFore', 'earF'], ['fore', 'earF', 'crown'], ['aFore', 'temple', 'earO'], ['aFore', 'earO', 'earF'], ['crown', 'earF', 'earB'], ['crown', 'earB', 'occ'],
    ['occ', 'earB', 'aOcc'], ['earF', 'earO', 'earB'], ['earB', 'earO', 'skull'], ['earB', 'skull', 'aOcc'], ['nape', 'aOcc', 'occ'], ['nape', 'aNape', 'aOcc'],
    ['aOcc', 'skull', 'aNape'], ['skull', 'side', 'aNape'], ['temple', 'orbit', 'zyg'], ['temple', 'zyg', 'zygB'], ['temple', 'zygB', 'earO'], ['earO', 'zygB', 'skull'], ['skull', 'zygB', 'side'],
    ['brow', 'browI', 'aFore'], ['brow', 'aFore', 'fore'], ['browI', 'browO', 'aFore'], ['browO', 'temple', 'aFore'], ['browO', 'orbit', 'temple'], ['stop', 'browI', 'brow'],
    ['orbit', 'cheek', 'zyg'], ['zyg', 'cheek', 'jowl'], ['zyg', 'jowl', 'zygB'], ['zygB', 'jowl', 'jawB'], ['zygB', 'jawB', 'side'],
    ['pal2', 'jawB', 'skullB'], ['jawB', 'side', 'skullB'], ['side', 'aNape', 'skullB'], ['aNape', 'nape', 'skullB']],
  muzzle: [['stop', 'nose', 'bridge'], ['bridge', 'nose', 'nTop'], ['nose', 'nSide', 'nTop'], ['nose', 'padT', 'nSide'],
    ['nSide', 'padT', 'padF'], ['nSide', 'padF', 'nWing'], ['nWing', 'padF', 'lipF'], ['nWing', 'lipF', 'nBot'], ['nBot', 'lipF', 'lip'],
    ['padT', 'padS', 'padF'], ['padT', 'malar', 'padS'], ['malar', 'cheek', 'padS'], ['padS', 'cheek', 'mouth'], ['padF', 'padS', 'lipM'], ['padF', 'lipM', 'lipF'], ['padS', 'mouth', 'lipM'], ['cheek', 'jowl', 'mouth']],
  nose: [['nTop', 'nSide', 'nTip'], ['nSide', 'nWing', 'nTip'], ['nWing', 'nBot', 'nTip']],
  palate: [['lip', 'lipF', 'pal1'], ['lipF', 'pal1s', 'pal1'], ['lipF', 'lipM', 'pal1s'], ['lipM', 'mouth', 'pal1s'], ['mouth', 'pal2s', 'pal1s'], ['pal1s', 'pal2s', 'pal2'],
    ['pal1s', 'pal2', 'pal1'], ['mouth', 'jowl', 'pal2s'], ['jowl', 'jawB', 'pal2s'], ['pal2s', 'jawB', 'pal2']],
};
const JP = {
  jLip: [0, 0.2738, -0.2548], jChin: [0, 0.2652, -0.2492], jUnder: [0, 0.2632, -0.2285], jThroat: [0, 0.2642, -0.199], jBack: [0, 0.2728, -0.19], jFlo1: [0, 0.272, -0.244], jFlo2: [0, 0.2712, -0.215],
  jLipS: [0.0056, 0.2727, -0.2532], jLipM: [0.0125, 0.2724, -0.2488], jCorner: [0.018, 0.2746, -0.241], jAngT: [0.0262, 0.2768, -0.2065],
  jChinS: [0.0075, 0.2658, -0.2452], jSide: [0.019, 0.2672, -0.2285], jAngle: [0.0275, 0.2695, -0.2055], jThroatS: [0.0195, 0.2667, -0.199],
};
const JF = {
  out: [['jLip', 'jLipS', 'jChin'], ['jLipS', 'jChinS', 'jChin'], ['jLipS', 'jLipM', 'jChinS'], ['jLipM', 'jSide', 'jChinS'], ['jLipM', 'jCorner', 'jSide'], ['jCorner', 'jAngT', 'jSide'], ['jAngT', 'jAngle', 'jSide'],
    ['jChin', 'jChinS', 'jUnder'], ['jChinS', 'jSide', 'jUnder'], ['jSide', 'jAngle', 'jThroatS'], ['jSide', 'jThroatS', 'jUnder'], ['jUnder', 'jThroatS', 'jThroat'],
    ['jAngle', 'jAngT', 'jThroatS'], ['jThroatS', 'jAngT', 'jBack'], ['jThroat', 'jThroatS', 'jBack']],
  floor: [['jLip', 'jFlo1', 'jLipS'], ['jLipS', 'jFlo1', 'jLipM'], ['jLipM', 'jFlo1', 'jFlo2'], ['jLipM', 'jFlo2', 'jCorner'], ['jCorner', 'jFlo2', 'jAngT'], ['jAngT', 'jFlo2', 'jBack']],
};
// almond eye opening (lid rim) and the socket ring around it, in eye space [lateral, up, (forward)]
const RIM = [[0.0088, 0.0024], [0.0055, 0.0058], [0.0002, 0.0064], [-0.0052, 0.0047], [-0.0092, -0.002], [-0.0052, -0.0056], [0.0004, -0.0068], [0.0058, -0.0047]];
const ORB = [[0.012, 0.0026, 0.0026], [0.009, 0.0086, 0.0058], [0.0004, 0.0101, 0.0074], [-0.0084, 0.0078, 0.0072], [-0.0122, -0.0026, 0.0042], [-0.0086, -0.0092, 0.0036], [0.0004, -0.0108, 0.0033], [0.009, -0.008, 0.0028]];
const RIM_R = 0.0112;

function head(M) {
  const headW = { head: 1 };
  const backW = (p) => (p[2] > -0.18 && p[1] < 0.31 ? { head: 0.6, neck: 0.4 } : headW);
  const furH = (p) => (p[2] < -0.236 ? 0.12 : Math.abs(p[0]) > 0.03 && p[1] < 0.3 ? 0.7 : 0.35);
  const id = {};
  const get = (name, s) => {
    const key = HP[name][0] === 0 ? name : name + (s < 0 ? '~' : '');
    if (id[key] === undefined) { const p = HP[name], q = headPt([p[0] * (HP[name][0] === 0 ? 1 : s), p[1], p[2]]); id[key] = M.v(q, backW(p), { fur: furH(p) }); }
    return id[key];
  };
  const core = headPt([0, 0.3, -0.205]), muz = headPt([0, 0.2815, -0.2445]), pal = headPt([0, 0.296, -0.225]);
  for (const s of [1, -1]) {
    const g = (n) => get(n, s);
    for (const [a, b, c] of HF.skull) M.tri(g(a), g(b), g(c), PART.head, MAT.coat, core);
    for (const [a, b, c] of HF.muzzle) M.tri(g(a), g(b), g(c), PART.head, MAT.coat, muz);
    for (const [a, b, c] of HF.nose) M.tri(g(a), g(b), g(c), PART.head, MAT.nose, muz);
    for (const [a, b, c] of HF.palate) M.tri(g(a), g(b), g(c), PART.head, MAT.mouth, pal);
    // eye: almond rim (the lids morph it shut), the socket ring, the frame of brow, bridge, pad and cheek
    const E = EYE, k = HEAD.k, ex = (u, v, w) => { const p = add(E.c, mul(add(add(mul(E.L, u), mul(E.U, v)), mul(E.F, w)), k)); return [p[0] * s, p[1], p[2]]; };
    const rim = RIM.map(([u, v]) => M.v(ex(u, v, E.ez * Math.sqrt(RIM_R * RIM_R - u * u - v * v) + 0.0004), headW, { fur: 0, lid: 1 }));
    const orb = ORB.map(([u, v, w], k) => M.v(ex(u, v, w), headW, { fur: 0.1, lid: k >= 1 && k <= 3 ? 0.3 : k >= 5 && k <= 7 ? 0.15 : 0 }));
    const ec = [E.c[0] * s, E.c[1], E.c[2]];
    M.loft([rim, orb], PART.head, MAT.lid, [add(ec, [0, 0, 0.01])]);
    const deep = add(ec, mul([E.F[0] * s, E.F[1], E.F[2]], -0.016));   // behind the eyeball: every socket facet faces away from it
    M.stitch(orb, ['orbit', 'browO', 'browI', 'stop', 'nose', 'padT', 'malar', 'cheek'].map(g), PART.head, MAT.coat, deep, true);
  }
  // lower jaw, hinged on the jaw bone; its back blends into the head and throat
  const jid = {};
  const jget = (name, s) => {
    const key = JP[name][0] === 0 ? name : name + (s < 0 ? '~' : '');
    if (jid[key] === undefined) { const p = JP[name], q = headPt([p[0] * (p[0] === 0 ? 1 : s), p[1], p[2]]); jid[key] = M.v(q, p[2] > -0.208 ? { jaw: 0.45, head: 0.35, neck: 0.2 } : { jaw: 1 }, { fur: p[1] < 0.266 ? 0.4 : 0.15 }); }
    return jid[key];
  };
  for (const s of [1, -1]) {
    const g = (n) => jget(n, s);
    for (const [a, b, c] of JF.out) M.tri(g(a), g(b), g(c), PART.jaw, MAT.coat, headPt([0, 0.2685, -0.226]));
    for (const [a, b, c] of JF.floor) M.tri(g(a), g(b), g(c), PART.jaw, MAT.mouth, headPt([0, 0.264, -0.222]));
  }
}

// ---------------------------------------------------------------- ears
// cupped cone: fur on the back, a recessed pink cavity in front, rounded tip
function ear(M, s) {
  const E = EAR, mx = (p) => [p[0] * s, p[1], p[2]], X = mx(E.X), U = mx(E.U), Z = mx(E.Z), c0 = mx(E.c);
  const bone = L('ear', s), rings = [];
  for (const h of [-0.08, 0, 0.42, 0.76]) {
    const c = add(c0, mul(U, h * E.H)), t = Math.max(0, h);
    const hi = E.W * 0.92 * (1 - t), ho = E.W * Math.pow(1 - t, 0.78), bt = 0.0082 * (1 - t * 0.8), cd = 0.0042 * (1 - t * 0.6);
    const P = [[-hi, -0.0012], [-hi * 0.6, bt * 0.75], [0, bt], [ho * 0.6, bt * 0.75], [ho, -0.0012], [ho * 0.52, cd * 0.45], [0, cd], [-hi * 0.52, cd * 0.45]];
    const w = h < 0 ? { head: 1 } : h === 0 ? { [bone]: 0.65, head: 0.35 } : { [bone]: 1 };
    rings.push(P.map(([x, z]) => M.v(add(c, add(mul(X, x), mul(Z, z))), w, { fur: 0.12 })));
  }
  const tip = M.v(add(add(c0, mul(U, E.H)), add(mul(X, 0.0022), mul(Z, 0.0015))), { [bone]: 1 }, { fur: 0.1 });
  const mid = (k) => add(c0, mul(U, [-0.04, 0.2, 0.6, 0.9][k] * E.H));
  const matOf = (i) => (i >= 4 ? MAT.ear : MAT.coat);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < 8; i++) {
    const a = rings[k][i], b = rings[k][(i + 1) % 8], c = rings[k + 1][(i + 1) % 8], d = rings[k + 1][i];
    // back faces face away from the cavity, cavity faces face forward out of it
    M.quad(a, b, c, d, PART.ear, matOf(i), i < 4 ? add(mid(k), mul(Z, -0.004)) : add(mid(k), mul(Z, 0.012)));
  }
  const top = rings[rings.length - 1];
  for (let i = 0; i < 8; i++) M.tri(top[i], top[(i + 1) % 8], tip, PART.ear, matOf(i), i < 4 ? add(mid(3), mul(Z, -0.004)) : add(mid(3), mul(Z, 0.012)));
}

// ---------------------------------------------------------------- collar
// A worn strap round the neck just behind the skull, buckled on the left, the end
// tucked along the top, a riveted plate at the throat for the tag's ring. It is
// built on the finished coat over the three neck sections spliced in for it, with
// their exact bone weights, so it rides the neck in every pose and never sinks in.
const COLLAR = { t: 0.4, w: 0.0105 };
function collar(M) {
  const { cuts, ctr, brisket } = M.neck, P = M.P, W = M.W, n = cuts[0].length;
  // a point on the band: s around the neck (fractional section index), side -1 back edge .. 1 front edge, off above the coat
  const at = (s, side, off) => {
    const i0 = ((Math.floor(s) % n) + n) % n, i1 = (i0 + 1) % n, f = s - Math.floor(s), [ra, rb, u] = side < 0 ? [cuts[0], cuts[1], side + 1] : [cuts[1], cuts[2], side];
    const one = (i) => { const a = ra[i], b = rb[i], nn = nrm(mix(nrm(M.sn[a]), nrm(M.sn[b]), u)); return [add(mix(P[a], P[b], u), mul(nn, off)), blendW(W[a], W[b], u), nn]; };
    const [p0, w0, n0] = one(i0), [p1, w1, n1] = one(i1);
    return { p: mix(p0, p1, f), w: blendW(w0, w1, f), n: nrm(mix(n0, n1, f)) };
  };
  // the strap: its edges tuck into the fur, its face is a little crowned; lid carries the across-band coordinate
  const R = [[-1, -0.0012], [-1, 0.0014], [0, 0.0019], [1, 0.0014], [1, -0.0012]].map(([side, off]) =>
    Array.from({ length: n }, (_, i) => { const q = at(i, side, off); return M.v(q.p, q.w, { fur: 1, lid: -1.5 - side * 0.5 }); }));
  M.loft(R, PART.collar, MAT.collar, R.map(() => ctr));
  // a small flat piece in the band's frame at s: corners [along, across, up] in metres
  const frame = (s, h0) => {
    const c = at(s, 0, h0), u = nrm(sub(at(s + 0.25, 0, h0).p, at(s - 0.25, 0, h0).p)), v0 = sub(at(s, 1, h0).p, at(s, -1, h0).p), v = nrm(sub(v0, mul(u, dot(v0, u))));
    return { c, put: (q) => add(c.p, add(add(mul(u, q[0]), mul(v, q[1])), mul(c.n, q[2]))) };
  };
  const rect = (hu, hv, h) => [[-hu, -hv, h], [hu, -hv, h], [hu, hv, h], [-hu, hv, h]];
  // buckle on the left side: a brass frame standing on the strap, and its prong
  const B = frame(9.5, 0.0019), bv = (pts) => pts.map((q) => M.v(B.put(q), B.c.w, { fur: 1 })), bin = B.put([0, 0, -0.004]);
  const ob = bv(rect(0.0056, 0.0068, -0.0004)), ot = bv(rect(0.0056, 0.0068, 0.0016)), it = bv(rect(0.0034, 0.0046, 0.0016)), ib = bv(rect(0.0034, 0.0046, 0.0002));
  M.loft([ob, ot, it, ib], PART.collar, MAT.metal, [bin, bin, bin]);
  const pr = bv([[-0.0034, -0.0006, 0.0011], [0.0008, -0.0006, 0.0011], [0.0008, 0.0006, 0.0011], [-0.0034, 0.0006, 0.0011]]);
  M.quad(pr[0], pr[1], pr[2], pr[3], PART.collar, MAT.metal, bin);
  // the strap's free end lies along the band past the buckle, worn round at the tip
  const tip = [10.0, 10.45, 10.9].map((s) => [at(s, -0.8, 0.0027), at(s, 0.8, 0.0027)].map((q) => M.v(q.p, q.w, { fur: 1, lid: -1.5 })));
  const end = at(11.25, 0, 0.0027), ev = M.v(end.p, end.w, { fur: 1, lid: -1.5 });
  for (let k = 0; k < 2; k++) M.quad(tip[k][0], tip[k + 1][0], tip[k + 1][1], tip[k][1], PART.collar, MAT.collar, ctr);
  M.tri(tip[2][0], ev, tip[2][1], PART.collar, MAT.collar, ctr);
  // riveted plate at the throat; the tag's split ring hangs from it
  const D = frame(6, 0.0019), dv = (pts) => pts.map((q) => M.v(D.put(q), D.c.w, { fur: 1 })), din = D.put([0, 0, -0.004]);
  const dt = dv(rect(0.0024, 0.0019, 0.0011)), db = dv(rect(0.0024, 0.0019, -0.0003));
  M.loft([db, dt], PART.collar, MAT.metal, [din]);
  M.fan(dt, M.v(D.put([0, 0, 0.0013]), D.c.w, { fur: 1 }), PART.collar, MAT.metal, din);
  M.tag = { p: D.put([0, 0, 0.0012]), n: D.c.n, w: D.c.w, q: P[brisket], qw: W[brisket] };   // q: the front of the chest below, for the tag to rest on
}

// The tag: a little fish with a brass rim round domed enamel, an eye and a gill,
// the same both sides. Hangs from the origin: -y down the ring, x nose to tail, z the face.
export function fishGeometry(u = 0.011) {
  const body = [[0.6, -0.42], [0.35, -0.2], [0, -0.1], [-0.45, -0.12], [-0.85, -0.3], [-1.05, -0.62], [-0.85, -0.92], [-0.45, -1.1], [0, -1.14], [0.35, -1.02], [0.6, -0.8]];
  const fins = [[1.02, -1.1], [0.86, -0.62], [1.02, -0.12]];   // tail: lower lobe, notch, upper lobe
  const bc = [-0.22, -0.62], tc = [0.78, -0.62], dy = -0.32;     // body and tail centres; the ring sits above the back
  const nb = body.length, rim = [...body, ...fins], n = rim.length;
  const inner = rim.map((q, i) => { const c = i >= nb ? tc : bc, k = i >= nb ? 0.7 : 0.8; return [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k]; });
  const G = [[], [], []];   // enamel, brass, eye
  const P3 = (q, z) => [q[0] * u, (q[1] + dy) * u, z * u];
  const tri = (g, a, b, c, back) => { if (back) G[g].push(...a, ...c, ...b); else G[g].push(...a, ...b, ...c); };
  for (const zs of [1, -1]) {
    const back = zs < 0, o = (q) => P3(q, 0.06 * zs), i = (q) => P3(q, 0.09 * zs);
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; tri(1, o(rim[k]), o(rim[k1]), i(inner[k1]), back); tri(1, o(rim[k]), i(inner[k1]), i(inner[k]), back); }   // brass bezel
    for (let k = 0; k < nb - 1; k++) tri(0, P3(bc, 0.17 * zs), i(inner[k]), i(inner[k + 1]), back);
    tri(0, P3(bc, 0.17 * zs), i(inner[nb - 1]), i(inner[0]), back);
    const tl = [inner[nb - 1], ...inner.slice(nb), inner[0]];
    for (let k = 0; k < tl.length - 1; k++) tri(0, P3(tc, 0.12 * zs), i(tl[k]), i(tl[k + 1]), back);
    // eye: a little hexagon; gill: a thin brass crescent behind it
    const ec = [-0.64, -0.5], ring = (k) => [ec[0] + Math.cos(k / 6 * Math.PI * 2) * 0.1, ec[1] + Math.sin(k / 6 * Math.PI * 2) * 0.1];
    for (let k = 0; k < 6; k++) tri(2, P3(ec, 0.17 * zs), P3(ring(k), 0.155 * zs), P3(ring(k + 1), 0.155 * zs), back);
    const gl = [[-0.36, -0.34], [-0.28, -0.62], [-0.36, -0.9]], gr = gl.map((q) => [q[0] + 0.07, q[1]]);
    for (let k = 0; k < 2; k++) { tri(1, P3(gl[k], 0.165 * zs), P3(gl[k + 1], 0.165 * zs), P3(gr[k + 1], 0.165 * zs), back); tri(1, P3(gl[k], 0.165 * zs), P3(gr[k + 1], 0.165 * zs), P3(gr[k], 0.165 * zs), back); }
  }
  for (let k = 0; k < n; k++) { const k1 = (k + 1) % n, a = P3(rim[k], 0.06), b = P3(rim[k1], 0.06), c = P3(rim[k1], -0.06), d = P3(rim[k], -0.06); tri(1, a, d, c); tri(1, a, c, b); }   // the edge
  const g = new THREE.BufferGeometry(), e = G[0].length / 3, m = G[1].length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...G[0], ...G[1], ...G[2]], 3));
  g.addGroup(0, e, 0); g.addGroup(e, m, 1); g.addGroup(e + m, G[2].length / 3, 2);
  g.computeVertexNormals();
  return g;
}

export function buildCatGeometry(rest, boneIdx) {
  const R = {}; for (const [k, v] of Object.entries(rest)) R[k] = [v.x, v.y, v.z];
  const M = new Mesh();
  torso(M, R);
  head(M);
  for (const s of [-1, 1]) { foreleg(M, R, s); hindleg(M, R, s); ear(M, s); }
  tail(M, R);
  M.post.push(collar);
  const g = M.build(boneIdx);
  g.userData.tag = M.tag;
  return g;
}

