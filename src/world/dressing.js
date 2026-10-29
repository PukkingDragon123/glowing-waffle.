// Set dressing for 4B: the squalor of one person on night shifts. Shoes kicked
// off by the door, unopened final notices, overflowing ashtrays, dirty dishes,
// stained mugs, fly strips, cables under the desk, laundry nobody folds, a
// dead plant, a mirror under a sheet, and the grime that collects on all of it.
// Everything is static and goes through the Builder, merged per material: one
// canvas atlas (flat palette swatches + plain printed text) skins most pieces.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { std } from '../gfx/materials.js';
import { roundedBox, cylGeo, place } from '../gfx/geo.js';
import { lathe } from '../gfx/shapes.js';
import { has, prop } from './props.js';
import { mulberry32 } from '../core/util.js';

const PI = Math.PI, H = PI / 2;
let b, P, rnd;
const R = (a, c) => a + (c - a) * rnd();
const pickR = (a) => a[Math.floor(rnd() * a.length)];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// crisp texels up close, mipmapped at a distance
function canvasTex(c, rep = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
  if (rep !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
  return t;
}

// ---------------------------------------------------------------- atlas
const AW = 1024, SW = 16, PAL_ROWS = 6;
let ctx, tex, nSw, pk;
const swc = new Map();
const hex6 = (c) => '#' + c.toString(16).padStart(6, '0');
function atlas() {
  const cv = document.createElement('canvas'); cv.width = cv.height = AW;
  ctx = cv.getContext('2d'); ctx.fillStyle = '#7a766e'; ctx.fillRect(0, 0, AW, AW);
  tex = canvasTex(cv); nSw = 0; swc.clear(); pk = { x: 0, y: PAL_ROWS * SW, h: 0 };
}
// uv of a flat colour swatch
function sw(c) {
  let uv = swc.get(c);
  if (!uv) {
    const i = nSw++, x = (i % 64) * SW, y = Math.floor(i / 64) * SW;
    ctx.fillStyle = hex6(c); ctx.fillRect(x, y, SW, SW);
    uv = [(x + SW / 2) / AW, 1 - (y + SW / 2) / AW]; swc.set(c, uv);
  }
  return uv;
}
// plain printed matter packed into the atlas; returns its uv rect [u0, v0, u1, v1]
function label(w, h, bg, draw, age = 1) {
  if (pk.x + w + 6 > AW) { pk.x = 0; pk.y += pk.h + 6; pk.h = 0; }
  const x = pk.x + 3, y = pk.y + 3;
  pk.x += w + 6; pk.h = Math.max(pk.h, h);
  ctx.fillStyle = bg; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  draw(ctx, w, h);
  // handled: thumb grime, foxing, a crease
  for (let i = 0; i < 3 * age; i++) {
    const gx = R(0, w), gy = R(0, h), gr = R(0.2, 0.6) * Math.max(w, h), g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g2.addColorStop(0, `rgba(70,52,30,${0.1 * age})`); g2.addColorStop(1, 'rgba(70,52,30,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = `rgba(40,30,20,${0.14 * age})`;
  for (let i = 0; i < w * h * 0.005 * age; i++) ctx.fillRect(Math.floor(R(0, w)), Math.floor(R(0, h)), 1, 1);
  if (age > 0.5 && w > 40) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, Math.floor(h * R(0.3, 0.7)), w, 1); }
  ctx.restore();
  return [x / AW, 1 - (y + h) / AW, (x + w) / AW, 1 - y / AW];
}
const SANS = 'Arial, Helvetica, sans-serif', SERIF = 'Georgia, "Times New Roman", serif', HAND = '"Comic Sans MS", "Segoe Print", cursive', MONO = '"Courier New", monospace';
function txt(c, s, x, y, size, col, { font = SANS, weight = 'bold', align = 'center', style = '', rot = 0 } = {}) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.font = `${style} ${weight} ${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, 0, 0);
  c.restore();
}
// grey bars that read as small print
function lines(c, x0, y0, w, n, gap, col = 'rgba(40,40,40,0.55)', hgt = 1) {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) c.fillRect(x0, y0 + i * gap, Math.round(w * (i % 6 === 5 ? R(0.3, 0.6) : R(0.85, 1))), hgt);
}
function stamp(c, s, x, y, size, rot = -0.2, col = 'rgba(180,30,24,0.85)') {
  c.save(); c.translate(x, y); c.rotate(rot); c.font = `bold ${size}px ${SANS}`;
  const w = c.measureText(s).width + size * 0.6;
  c.strokeStyle = col; c.lineWidth = Math.max(1, size / 7); c.strokeRect(-w / 2, -size * 0.7, w, size * 1.4);
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 1); c.restore();
}

// uv helpers: a flat swatch, a rect remap of 0..1 uvs, planar skins per face
function flat(g, c) { const uv = g.attributes.uv, [u, v] = sw(c); for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); return g; }
function fit(g, r) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); return g; }
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// f: { px, nx, py, ny, pz, nz, all } each a hex colour or a uv rect
function skin(g, w, h, d, f) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let k, s, t;
    if (ax >= ay && ax >= az) { k = nx > 0 ? 'px' : 'nx'; s = (nx > 0 ? -z : z) / d + 0.5; t = y / h + 0.5; }
    else if (ay >= az) { k = ny > 0 ? 'py' : 'ny'; s = x / w + 0.5; t = (ny > 0 ? -z : z) / d + 0.5; }
    else { k = nz > 0 ? 'pz' : 'nz'; s = (nz > 0 ? x : -x) / w + 0.5; t = y / h + 0.5; }
    const sk = f[k] ?? f.all;
    if (typeof sk === 'number') { const [u, v] = sw(sk); uv.setXY(i, u, v); } else uv.setXY(i, sk[0] + cl01(s) * (sk[2] - sk[0]), sk[1] + cl01(t) * (sk[3] - sk[1]));
  }
  return g;
}
const sbox = (w, h, d, f, r = 0) => skin(r > 0 ? roundedBox(w, h, d, Math.min(r, w / 2.1, h / 2.1, d / 2.1), 1) : new THREE.BoxGeometry(w, h, d), w, h, d, typeof f === 'number' ? { all: f } : f);
const fbox = (w, h, d, c, r = 0) => flat(r > 0 ? roundedBox(w, h, d, Math.min(r, w / 2.1, h / 2.1, d / 2.1), 1) : new THREE.BoxGeometry(w, h, d), c);
const fcyl = (r, h, c, seg = 10, r2 = null) => flat(cylGeo(r, h, seg, r2), c);
const flath = (pairs, c, seg = 12) => flat(lathe(pairs, seg), c);
const ftor = (r, t, c, arc = PI * 2, rs = 5, ts = 12) => flat(new THREE.TorusGeometry(r, t, rs, ts, arc), c);
const fsph = (r, c, ws = 8, hs = 6) => flat(new THREE.SphereGeometry(r, ws, hs), c);
function tube(pts, r, c, seg = 24, rs = 5) { return flat(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), seg, r, rs, false), c); }
// a lumpy blob: cloth heaps, ash, food crusts, dust (flat bottom on the surface)
function lump(rx, ry, rz, seed = 1, c = null) {
  const g = new THREE.SphereGeometry(1, 10, 7), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.cos(z * 3.7 + seed * 1.7) + 0.12 * Math.sin(y * 5 + seed * 2.3);
    p.setXYZ(i, x * rx * n, (Math.max(y, -0.25) + 0.25) * ry * n / 1.25, z * rz * n);
  }
  g.computeVertexNormals();
  return c === null ? g : flat(g, c);
}
// a double-sided ribbon through pts; hw(i) half width, side(i) unit side vector
function ribbon(pts, hw, side) {
  const n = pts.length, pos = [], uv = [], idx = [];
  for (const back of [0, 1]) for (let i = 0; i < n; i++) {
    const p = pts[i], s = side(i), w = hw(i), t = i / (n - 1);
    pos.push(p[0] - s[0] * w, p[1] - s[1] * w, p[2] - s[2] * w, p[0] + s[0] * w, p[1] + s[1] * w, p[2] + s[2] * w);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2, o = n * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, o + a, o + a + 2, o + a + 1, o + a + 1, o + a + 2, o + a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// cloth folded over a rod along z: drops [front (-x), back (+x)], r = half the rod's depth
function fold(width, front, back, r, seed = 1, sag = 1) {
  const path = [];
  for (let i = 0; i <= 8; i++) path.push([r + 0.004, -back + back * i / 8]);
  for (let i = 1; i < 8; i++) { const a = (i / 8) * PI; path.push([(r + 0.004) * Math.cos(a), (r + 0.004) * Math.sin(a) * 0.8]); }
  for (let i = 0; i <= 10; i++) path.push([-(r + 0.004), -front * i / 10]);
  const nu = 12, pos = [], uv = [], idx = [], np = path.length;
  for (const back2 of [0, 1]) for (let j = 0; j < np; j++) for (let i = 0; i <= nu; i++) {
    const [x, y] = path[j], z = (i / nu - 0.5) * width, hang = Math.max(0, -y);
    const wob = (Math.sin(z * 40 + seed) * 0.008 + Math.sin(z * 17 + seed * 3) * 0.006) * hang * 3 * sag;
    pos.push(x + Math.sign(x) * wob, y - Math.abs(Math.sin(z * 9 + seed)) * hang * 0.05, z * (1 - hang * 0.08));
    uv.push(i / nu * width * 2, j / np * (front + back) * 2);
  }
  const o = np * (nu + 1);
  for (let j = 0; j < np - 1; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b2 = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b2, b2, c, d, o + a, o + b2, o + c, o + b2, o + d, o + c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a sheet thrown over a w x h x d slab leaning back by `lean` (front +z): folds
// deepen toward the floor, the corners droop, the hem pools on the boards
function sheetOver(w, h, d, seed = 1, lean = 0.1) {
  const over = d / 2 + 0.07, pool = 0.16, nu = 22, nv = 60, L = 2 * h + d, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (i / nu - 0.5) * (w + 2 * over), v = -pool + (j / nv) * (L + 2 * pool);
    let x = u, y, z, side = 1;
    if (v < 0) { y = 0; z = d / 2 + 0.012 - v * 0.85; }
    else if (v < h) { y = v; z = d / 2 + 0.012; }
    else if (v < h + d) { y = h + 0.012 + Math.sin(PI * (v - h) / d) * 0.012; z = d / 2 - (v - h); }
    else if (v < L) { y = L - v; z = -d / 2 - 0.012; side = -1; }
    else { y = 0; z = -d / 2 - 0.012 - (v - L) * 0.85; side = -1; }
    const k = Math.max(0, Math.abs(u) - w / 2), edge = Math.max(0, Math.abs(u) - w / 2 + 0.07);
    if (y > h - 0.05) y -= edge * 0.45;
    if (k > 0) { x = Math.sign(u) * (w / 2 + 0.014 + k * 0.12); z *= 1 - Math.min(1, k / over) * 0.9; y = Math.max(0, y - k * 0.7); }
    // the sides flare and ripple toward the floor
    if (Math.abs(u) > w / 2 - 0.05) { const hg = 1 - Math.min(1, y / h); x += Math.sign(u) * (0.04 * hg * hg + Math.sin(y * 9 + seed + v) * 0.014 * hg); }
    const hang = 1 - Math.min(1, y / h), amp = 0.02 + 0.06 * hang ** 1.5, top = Math.max(0, 1 - hang * 3);
    z += side * (Math.sin(u * 21 + seed) * 0.6 + Math.sin(u * 8.5 + v * 1.7 + seed * 2) * 0.4 + Math.sin(u * 47 + seed * 3) * 0.25) * amp;
    // diagonal folds pulled from the top corners
    z += side * Math.sin((Math.abs(u) * 2 - (h - y)) * 26 + seed) * 0.012 * top * Math.min(1, Math.abs(u) / (w / 2));
    x += Math.sin(v * 6 + u * 3 + seed) * 0.01 * hang;
    if (y < 0.004) y = 0.003 + Math.abs(Math.sin(u * 27 + v * 11 + seed)) * 0.012;
    else z -= y * Math.tan(lean);
    pos.push(x, y, z); uv.push(u * 1.5, v * 1.5);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b2 = a + 1, c = a + nu + 1, e = c + 1; idx.push(a, b2, c, b2, e, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// a bundle of parts in a local frame (origin on the surface it stands on, front +z)
class Kit {
  constructor() { this.p = []; }
  add(g, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { this.p.push([place(g, x, y, z, ry, rx, rz), m]); return this; }
  kit(k, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { for (const [g, m] of k.p) this.add(g.clone(), m, x, y, z, ry, rx, rz); return this; }
  put(x, y, z, ry = 0, { rx = 0, rz = 0, cast = true } = {}) { for (const [g, m] of this.p) b.geo(g.clone(), m, { x, y, z, ry, rx, rz, cast }); return this; }
  // merged meshes for a moving parent (a door panel)
  meshes() {
    const by = new Map();
    for (const [g, m] of this.p) { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); if (!by.has(m)) by.set(m, []); by.get(m).push(n); }
    return [...by].map(([m, gs]) => { const me = new THREE.Mesh(mergeGeometries(gs, false), m); me.receiveShadow = true; return me; });
  }
}
const col = (x, y, z, w, h, d, ry = 0) => b.collider(x, y, z, w, h, d, ry);

// woven cloth: a small tiling canvas, plain / plaid / stripes / terry / wicker
function cloth(name, base, alt = base, { plaid = 0, stripe = 0, terry = false, rep = 3, rough = 1 } = {}) {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const x2 = c.getContext('2d'), img = x2.createImageData(s, s), d = img.data, r2 = mulberry32(name.length * 977 + base);
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255], A = rgb(base), Bc = rgb(alt);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let cc = A;
    if (plaid) { const bx = x % plaid < plaid / 4, by = y % plaid < plaid / 4; if (bx || by) cc = Bc; if (bx && by) cc = Bc.map((v) => v * 0.75); }
    if (stripe && y % stripe < stripe / 3) cc = Bc;
    // wear: faded blotches and a little lint
    const fade = 0.9 + 0.1 * Math.sin(x * 0.2 + y * 0.13) * Math.cos(y * 0.17);
    const wv = (terry ? 0.78 + r2() * 0.36 : ((x + y) % 2 ? 1 : 0.88) * (0.9 + r2() * 0.14)) * fade;
    const i = (y * s + x) * 4; d[i] = cc[0] * wv; d[i + 1] = cc[1] * wv; d[i + 2] = cc[2] * wv; d[i + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  return std(name, { map: canvasTex(c, rep), worldSize: 1 }, { roughness: rough });
}

// ---------------------------------------------------------------- materials
function mats() {
  atlas();
  const A = (name, o) => std(name, { map: tex, worldSize: 1 }, o);
  P = { m: A('dsMatte', { roughness: 0.92 }), s: A('dsSatin', { roughness: 0.5, env: 0.8 }), g: A('dsGloss', { roughness: 0.2, env: 1.1 }), k: A('dsMetal', { roughness: 0.3, metalness: 0.85, env: 1.3 }) };
  // ceramics, bottles and chrome keep a little sheen under the dust
  P.g.roughness = 0.34; P.k.roughness = 0.38;
  P.glass = std('dsGlass', null, { color: 0xd8e0d8, transparent: true, opacity: 0.34, depthWrite: false, env: 1.5 }); P.glass.roughness = 0.14;
  P.led = std('dsLed', null, { color: 0x400808, emissive: 0xff2010, emissiveIntensity: 2.2 });
  P.denim = cloth('dsDenim', 0x44587a, 0x34445e, { rep: 5 });
  P.flannel = cloth('dsFlannel', 0x7a2c26, 0x2a2224, { plaid: 16, rep: 3 });
  P.khaki = cloth('dsKhaki', 0x545040, 0x464234, { rep: 5 });
  P.grey = cloth('dsHeather', 0x86868a, 0x76767a, { rep: 5 });
  P.white = cloth('dsCotton', 0xc8c2b2, 0xb8b2a2, { rep: 5 });
  P.navy = cloth('dsNavy', 0x2e3448, 0x262c3c, { rep: 5 });
  P.blanket = cloth('dsAfghan', 0x4e5e44, 0x9a8c64, { plaid: 32, rep: 2 });
  P.terry = cloth('dsTerry', 0x7e8c94, 0x7e8c94, { terry: true, rep: 4 });
  P.check = cloth('dsCheck', 0xd6ccba, 0x9a4436, { plaid: 8, rep: 3 });
  P.runner = cloth('dsRunner', 0x3a4658, 0x8e826a, { stripe: 12, rep: 2 });
  P.wicker = cloth('dsWicker', 0x907650, 0x6a5434, { plaid: 4, rep: 6 });
  P.sheet = cloth('dsSheet', 0xbab4a6, 0xaaa496, { rep: 3 });
  P.grime = std('dsGrime', { map: grimeTex(), worldSize: 1 }, { transparent: true, depthWrite: false, roughness: 1 });
  P.grime.polygonOffset = true; P.grime.polygonOffsetFactor = -2; P.grime.polygonOffsetUnits = -2;
}

// ---------------------------------------------------------------- grime
// 4x3 cells: dirt, dust, scuffs, coffee ring, water stain, drips, smudges,
// cobweb, glass crack, scratches, dried spill, mould
function grimeTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 384;
  const g = c.getContext('2d');
  const blob = (x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128, Math.floor(i / 4) * 128); g.beginPath(); g.rect(2, 2, 124, 124); g.clip(); fn(); g.restore(); };
  const ring = (r, w, a, rgb) => { g.strokeStyle = `rgba(${rgb},${a})`; g.lineWidth = w; g.beginPath(); for (let k = 0; k <= 48; k++) { const t = k / 48 * PI * 2, rr = r * (1 + 0.05 * Math.sin(t * 3 + r) + R(-0.015, 0.015)); g.lineTo(64 + Math.cos(t) * rr, 64 + Math.sin(t) * rr); } g.stroke(); };
  const speck = (n, rgb, a, x0 = 8, x1 = 120) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${R(a * 0.4, a)})`; g.fillRect(Math.floor(R(x0, x1)), Math.floor(R(x0, x1)), 1 + (rnd() < 0.2), 1); } };
  cell(0, () => { for (let i = 0; i < 50; i++) { const a = R(0, 6.28), d = R(0, 1) ** 0.7 * 42; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, R(8, 24), '46,36,24', R(0.06, 0.15)); } speck(260, '30,24,16', 0.5, 20, 108); });
  cell(1, () => { for (let i = 0; i < 40; i++) blob(R(20, 108), R(20, 108), R(10, 26), '176,170,158', R(0.06, 0.14)); speck(400, '196,190,178', 0.5, 12, 116); speck(60, '40,34,28', 0.4, 12, 116); });
  cell(2, () => { g.lineCap = 'round'; for (let i = 0; i < 24; i++) { g.strokeStyle = `rgba(24,20,16,${R(0.14, 0.45)})`; g.lineWidth = R(1, 3.4); const x = R(10, 110), y = R(26, 112), l = R(6, 32), a = R(-0.3, 0.3); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + R(-3, 3), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } });
  cell(3, () => { blob(64, 64, 44, '84,48,20', 0.12); ring(44, 3, 0.55, '70,38,14'); ring(41, 1.5, 0.3, '70,38,14'); });
  cell(4, () => { blob(64, 64, 60, '140,104,48', 0.2); for (const r of [54, 45, 34, 22]) ring(r, R(1.5, 2.5), R(0.2, 0.36), '108,72,30'); speck(120, '80,60,30', 0.3, 20, 108); });
  cell(5, () => { for (let i = 0; i < 18; i++) { const x = R(8, 116), l = R(40, 124), gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(46,34,20,${R(0.14, 0.34)})`); gr.addColorStop(1, 'rgba(46,34,20,0)'); g.fillStyle = gr; g.fillRect(Math.floor(x), 0, Math.floor(R(2, 7)), l); } });
  cell(6, () => { for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(36,28,20,${R(0.06, 0.17)})`; g.beginPath(); g.ellipse(64 + R(-36, 36), 64 + R(-36, 36), R(4, 8), R(6, 11), R(0, 3), 0, PI * 2); g.fill(); } });
  cell(7, () => {
    g.strokeStyle = 'rgba(220,218,210,0.55)'; g.lineWidth = 1;
    const sp = []; for (let i = 0; i <= 7; i++) { const a = (i / 7) * H; sp.push(a); g.beginPath(); g.moveTo(2, 2); g.lineTo(2 + Math.cos(a) * 170, 2 + Math.sin(a) * 170); g.stroke(); }
    for (let r = 12; r < 132; r += R(8, 14)) { g.beginPath(); for (let i = 0; i <= 7; i++) { const a = sp[i], rr = r * R(0.9, 1.0); g.lineTo(2 + Math.cos(a) * rr, 2 + Math.sin(a) * rr); } g.stroke(); }
    speck(30, '40,36,30', 0.6, 4, 70);
  });
  cell(8, () => {
    // a star break from the top-right corner: bright edges, dark seams
    const cx = 120, cy = 8;
    for (let i = 0; i < 9; i++) {
      let x = cx, y = cy; const a0 = H + R(0, H) + R(-0.1, 0.1);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 7; s++) { const a = a0 + R(-0.35, 0.35), l = R(8, 22); x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
      g.strokeStyle = 'rgba(235,240,240,0.75)'; g.lineWidth = 1.3; g.stroke(); g.strokeStyle = 'rgba(10,10,10,0.5)'; g.lineWidth = 0.6; g.stroke();
    }
    for (const r of [10, 22]) { g.beginPath(); g.arc(cx, cy, r, H * 0.95, PI * 1.05); g.strokeStyle = 'rgba(235,240,240,0.55)'; g.lineWidth = 1; g.stroke(); }
  });
  cell(9, () => {
    // four parallel gouges, dragged downward, plaster showing pale in the cuts
    for (let i = 0; i < 4; i++) {
      const x0 = 34 + i * 16 + R(-2, 2);
      g.beginPath(); g.moveTo(x0, 14); g.bezierCurveTo(x0 + 3, 50, x0 - 4, 80, x0 + R(-6, 6), R(100, 118));
      g.strokeStyle = 'rgba(20,16,12,0.55)'; g.lineWidth = 3.2; g.stroke(); g.strokeStyle = 'rgba(230,222,206,0.45)'; g.lineWidth = 1.1; g.stroke();
    }
  });
  cell(10, () => { for (let i = 0; i < 26; i++) { const a = R(0, 6.28), d = R(0, 30); blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, R(10, 30), '44,22,14', R(0.2, 0.4)); } ring(40, 2, 0.35, '30,14,8'); for (let i = 0; i < 9; i++) blob(64 + R(-56, 56), 64 + R(-56, 56), R(2, 6), '40,18,10', 0.5); });
  cell(11, () => { for (let i = 0; i < 70; i++) { const a = R(0, 6.28), d = R(0, 1) ** 0.6 * 54; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, R(2, 9), pickR(['26,30,20', '40,44,26', '18,18,14']), R(0.25, 0.6)); } });
  return canvasTex(c);
}
const GC = { dirt: 0, dust: 1, scuff: 2, ring: 3, stain: 4, drip: 5, smudge: 6, web: 7, crack: 8, scratch: 9, spill: 10, mould: 11 };
const cellUv = (i) => { const x = (i % 4) * 128, y = Math.floor(i / 4) * 128; return [(x + 3) / 512, 1 - (y + 125) / 384, (x + 125) / 512, 1 - (y + 3) / 384]; };
// a decal on a surface; n: which way the surface faces ('y' floor, '-y' ceiling, 'x' | '-x' | 'z' | '-z' walls)
function decal(kind, x, y, z, w, h, n = 'y', rot = R(0, PI * 2)) {
  const g = fit(new THREE.PlaneGeometry(w, h), cellUv(GC[kind])); g.rotateZ(rot);
  const o = 0.0025, f = { y: [0, o, 0, -H, 0], '-y': [0, -o, 0, H, 0], z: [0, 0, o, 0, 0], '-z': [0, 0, -o, 0, PI], x: [o, 0, 0, 0, H], '-x': [-o, 0, 0, 0, -H] }[n];
  g.rotateX(f[3]); g.rotateY(f[4]);
  b.geo(g, P.grime, { x: x + f[0], y: y + f[1], z: z + f[2], cast: false });
}
// a cobweb strung across a ceiling corner; sx / sz point from the corner into the room
function web(x, y, z, sx, sz, s = 0.45) {
  const g = new THREE.BufferGeometry(), [u0, v0, u1, v1] = cellUv(GC.web);
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sx * s, 0, 0, sx * s * 0.25, -s * 0.7, sz * s * 0.25, 0, 0, sz * s], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0 + (u1 - u0) * 0.6, v1 - (v1 - v0) * 0.6, u0, v0], 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
  b.geo(g, P.grime, { x: x + sx * 0.004, y: y - 0.004, z: z + sz * 0.004, cast: false });
}

// ---------------------------------------------------------------- printed matter
// bills, notices, covers and packaging: plain text and flat colour only
const L = {};
function labels() {
  const PAPER = '#e4ddcb';
  // envelopes (top face): a window with the address, a return line, the stamp that matters
  const env = (key, head, mark, bg = PAPER, markCol) => (L[key] = label(96, 42, bg, (c, w, h) => {
    txt(c, head, 4, 6, 5, '#333', { align: 'left' }); lines(c, 4, 10, 30, 2, 3, 'rgba(50,50,50,0.5)');
    c.fillStyle = 'rgba(200,196,182,0.9)'; c.fillRect(30, 20, 44, 15); lines(c, 33, 23, 34, 3, 3.5, 'rgba(30,30,30,0.6)');
    c.fillStyle = 'rgba(150,40,40,0.4)'; c.fillRect(82, 3, 10, 8);
    if (mark) stamp(c, mark, 62, 12, 7, R(-0.25, -0.05), markCol);
  }));
  env('final', 'HUDSON ELECTRIC & GAS', 'FINAL NOTICE');
  env('due', 'BELL ATLANTIC', 'PAST DUE');
  env('shut', 'HUDSON ELECTRIC & GAS', 'SHUT-OFF NOTICE');
  env('second', 'FIRST JERSEY SAVINGS', 'SECOND REQUEST', '#e8c8c4');
  env('bank', 'FIRST JERSEY SAVINGS', null);
  env('junk', 'OR CURRENT RESIDENT', 'PRE-APPROVED!', '#e6e2c4', 'rgba(30,60,150,0.8)');
  env('rent', 'GRAND ST. MANAGEMENT', 'URGENT', '#ddd6c0');
  // a notice opened once and left on the fridge
  L.notice = label(64, 82, '#ece6d6', (c, w, h) => {
    txt(c, 'HUDSON ELECTRIC & GAS', w / 2, 6, 5, '#223'); c.fillStyle = '#aa2a22'; c.fillRect(4, 11, w - 8, 9);
    txt(c, 'FINAL NOTICE', w / 2, 15.5, 7, '#fff'); lines(c, 5, 25, w - 10, 9, 4);
    txt(c, 'AMOUNT DUE $412.67', w / 2, 66, 5, '#111'); txt(c, 'SERVICE ENDS 7/2/99', w / 2, 74, 5, '#aa2a22');
  });
  L.paper = label(64, 82, '#e8e4d8', (c, w, h) => { txt(c, 'CALL LOG  6/30', 5, 6, 5, '#222', { align: 'left' }); for (let y = 12; y < h; y += 6) { c.fillStyle = 'rgba(60,80,140,0.35)'; c.fillRect(2, y, w - 4, 1); } for (let i = 0; i < 9; i++) txt(c, pickR(['dial-up err 680', 'pw reset', 'mdm init', 'no carrier', 'busy sig', 'call back']), 5, 15 + i * 6.5, 5, 'rgba(30,40,110,0.8)', { align: 'left', font: HAND, weight: 'normal' }); });
  L.memo = label(64, 82, '#e2dfd4', (c, w, h) => { txt(c, 'BLUEBERRY PIE ONLINE', w / 2, 6, 5, '#3a3a8a'); txt(c, 'Night Support Memo', w / 2, 13, 5, '#222'); lines(c, 5, 20, w - 10, 12, 4.5); });
  L.paper2 = label(64, 82, '#e0dbc8', (c, w, h) => { lines(c, 5, 6, w - 10, 16, 4.6, 'rgba(30,30,30,0.5)'); stamp(c, 'PAST DUE', 40, 60, 8, -0.3); });
  L.schedule = label(54, 70, '#e8e6dc', (c, w, h) => { txt(c, 'BPO NIGHT SUPPORT', w / 2, 5, 4, '#3a3a8a'); txt(c, 'JULY 1999', w / 2, 11, 5, '#222'); c.strokeStyle = 'rgba(40,40,40,0.5)'; c.lineWidth = 1; for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(3, 16 + i * 9); c.lineTo(w - 3, 16 + i * 9); c.stroke(); } for (let i = 0; i <= 7; i++) { c.beginPath(); c.moveTo(3 + i * 6.85, 16); c.lineTo(3 + i * 6.85, 61); c.stroke(); } c.fillStyle = 'rgba(200,40,30,0.7)'; c.beginPath(); c.arc(16, 20, 3.5, 0, 7); c.stroke(); txt(c, '9P-5A', w / 2, 66, 5, '#a22', { font: HAND }); });
  L.menu = label(44, 84, '#d8302a', (c, w, h) => { c.fillStyle = '#f2e6c8'; c.fillRect(3, 18, w - 6, h - 21); txt(c, 'GOLDEN', w / 2, 6, 7, '#f2d24a'); txt(c, 'DRAGON', w / 2, 13, 7, '#f2d24a'); lines(c, 6, 22, w - 12, 13, 4.3); txt(c, '201-555-0188', w / 2, 79, 5, '#a22'); });
  L.vet = label(54, 34, '#f0eee6', (c, w, h) => { txt(c, 'HUDSON VET CLINIC', w / 2, 5, 5, '#2a5a3a'); txt(c, 'MOCHI', w / 2, 14, 7, '#222', { font: HAND }); txt(c, 'rabies booster', w / 2, 21, 5, '#333', { font: HAND, weight: 'normal' }); txt(c, 'due 7/15/99', w / 2, 28, 6, '#a22', { font: HAND }); });
  L.y2k = label(48, 56, '#f4f0c4', (c, w, h) => { txt(c, 'Y2K', w / 2, 7, 8, '#222', { font: HAND }); for (const [i, s] of ['water', 'batteries', 'cash', 'cat food', 'candles'].entries()) txt(c, '□ ' + s, 4, 17 + i * 8, 5, '#223', { align: 'left', font: HAND, weight: 'normal' }); });
  // newspaper, magazines
  L.news = label(96, 124, '#d8d2c0', (c, w, h) => {
    txt(c, 'Hudson County Ledger', w / 2, 9, 10, '#151515', { font: SERIF }); c.fillStyle = '#222'; c.fillRect(3, 16, w - 6, 1); c.fillRect(3, 24, w - 6, 1);
    txt(c, 'THURSDAY, JULY 1, 1999   50¢', w / 2, 20, 4, '#222'); txt(c, 'Y2K: 183 DAYS', w / 2, 32, 10, '#111', { font: SERIF });
    txt(c, 'Shift work and sleep', 25, 42, 4, '#222', { align: 'center' });
    for (let col = 0; col < 3; col++) lines(c, 4 + col * 31, col ? 41 : 47, 28, col ? 20 : 18, 4, 'rgba(30,30,30,0.5)');
  }, 0.6);
  L.tvweek = label(70, 92, '#c83a2a', (c, w, h) => { txt(c, 'TV', 14, 13, 18, '#fff', { font: SERIF }); txt(c, 'WEEK', 46, 13, 11, '#fff'); c.fillStyle = '#f2e6c4'; c.fillRect(0, 26, w, h - 26); txt(c, 'JUNE 26 - JULY 2', w / 2, 32, 5, '#222'); for (let i = 0; i < 4; i++) txt(c, pickR(['FRIENDS FINALE', 'ER: WHO LIVES?', 'WORLD CUP', 'X-FILES', 'TONIGHT']), w / 2, 45 + i * 11, 6, '#a22'); });
  L.pcmag = label(70, 92, '#1e3a6a', (c, w, h) => { txt(c, 'PC', 15, 14, 18, '#f2d24a'); txt(c, 'MONTHLY', 46, 14, 8, '#fff'); c.fillStyle = '#e6e0d0'; c.fillRect(6, 30, w - 12, 30); txt(c, '56K MODEMS', w / 2, 38, 7, '#1e3a6a'); txt(c, 'TESTED', w / 2, 48, 9, '#c22'); txt(c, 'IS YOUR PC Y2K SAFE?', w / 2, 70, 5, '#fff'); txt(c, 'JULY 1999', w / 2, 84, 5, '#f2d24a'); });
  // takeout and packaging
  L.pizzaTop = label(96, 96, '#c8b08a', (c, w, h) => { c.strokeStyle = '#a82a22'; c.lineWidth = 2; c.strokeRect(6, 6, w - 12, h - 12); txt(c, 'HOT & FRESH', w / 2, 26, 9, '#a82a22'); txt(c, 'PIZZA', w / 2, 46, 18, '#a82a22', { font: SERIF }); txt(c, "TONY'S PIZZERIA", w / 2, 64, 7, '#a82a22'); txt(c, 'WE DELIVER  201-555-0143', w / 2, 76, 5, '#a82a22'); }, 1.4);
  L.pizzaIn = label(64, 64, '#c8b48e', (c, w, h) => { for (let i = 0; i < 9; i++) { const x = R(8, 56), y = R(8, 56), r = R(5, 14), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(120,70,20,0.5)'); g.addColorStop(1, 'rgba(120,70,20,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); } c.fillStyle = 'rgba(150,40,20,0.5)'; for (let i = 0; i < 20; i++) c.fillRect(Math.floor(R(10, 54)), Math.floor(R(10, 54)), 2, 1); }, 1.2);
  L.cereal = label(48, 72, '#e8b830', (c, w, h) => { c.fillStyle = '#c84a1a'; c.fillRect(0, 0, w, 22); txt(c, "SUNNY", w / 2, 7, 9, '#fff'); txt(c, "O'S", w / 2, 17, 10, '#fff'); txt(c, 'HONEY OAT', w / 2, 30, 6, '#7a2a10'); txt(c, 'WHOLE GRAIN', w / 2, 42, 5, '#7a2a10'); txt(c, '8 ESSENTIAL', w / 2, 50, 4, '#7a2a10'); txt(c, 'VITAMINS', w / 2, 56, 4, '#7a2a10'); txt(c, 'NET WT 15 OZ', w / 2, 66, 4, '#7a2a10'); });
  L.bran = label(48, 72, '#6a4a2a', (c, w, h) => { c.fillStyle = '#2a4a8a'; c.fillRect(0, 0, w, 20); txt(c, 'BRAN', w / 2, 10, 10, '#fff'); txt(c, 'FLAKES', w / 2, 28, 8, '#f2d27a'); lines(c, 8, 40, w - 16, 5, 4, 'rgba(240,220,170,0.5)'); txt(c, 'HIGH FIBER', w / 2, 64, 5, '#f2d27a'); });
  L.beer = label(48, 24, '#d8ccaa', (c, w, h) => { c.fillStyle = '#8a1a14'; c.fillRect(0, 3, w, 4); c.fillRect(0, h - 7, w, 4); txt(c, 'HUDSON', w / 2, 11, 6, '#222', { font: SERIF }); txt(c, 'LAGER', w / 2, 17, 5, '#8a1a14'); });
  L.cola = label(64, 32, '#b8221c', (c, w, h) => { txt(c, 'VOLT', 18, 14, 11, '#f4f0e0'); txt(c, 'COLA', 46, 14, 8, '#f2d24a'); txt(c, '12 FL OZ', w / 2, 26, 4, '#f4f0e0'); });
  L.cig = label(28, 44, '#e6e0d4', (c, w, h) => { c.fillStyle = '#a8241e'; c.fillRect(0, 0, w, 16); txt(c, 'NORTH', w / 2, 5, 5, '#fff'); txt(c, 'STAR', w / 2, 11, 5, '#fff'); txt(c, 'FILTER KINGS', w / 2, 22, 3.5, '#222'); c.fillStyle = '#fff'; c.fillRect(2, 29, w - 4, 12); c.strokeStyle = '#222'; c.strokeRect(2.5, 29.5, w - 5, 11); lines(c, 4, 31, w - 8, 3, 3, 'rgba(0,0,0,0.6)'); });
  L.can = (s, bg, fg) => label(48, 24, bg, (c, w, h) => { txt(c, s, w / 2, 9, 7, fg); lines(c, 8, 16, w - 16, 2, 3, fg); });
  L.flour = L.can('FLOUR', '#d8ccb0', '#5a3a2a'); L.sugar = L.can('SUGAR', '#d8ccb0', '#5a3a2a'); L.coffee = L.can('COFFEE', '#d8ccb0', '#5a3a2a');
  L.paint = L.can('LATEX FLAT', '#d8d4c8', '#2a4a7a'); L.soup = L.can('TOMATO', '#b02a1c', '#f0e8d0');
  // tapes, discs, manuals, notes
  const hand = (s, bg = '#e8e4d8', col = '#1a1a3a') => label(90, 12, '#151515', (c, w, h) => { c.fillStyle = bg; c.fillRect(10, 1, w - 20, h - 2); txt(c, s, w / 2, h / 2 + 0.5, 7, col, { font: HAND, weight: 'normal' }); }, 0.6);
  L.vhs = ['X-FILES S5 #2', 'SEINFELD 98', 'DO NOT TAPE OVER', "MOM'S 60th", 'WWF RAW 5/99'].map((s) => hand(s));
  L.rental = label(90, 14, '#1e4a8a', (c, w, h) => { txt(c, 'MOVIE PALACE', 28, 7, 6, '#f2d24a'); txt(c, 'BE KIND REWIND', 68, 7, 5, '#fff'); });
  L.spines = []; for (let i = 0; i < 10; i++) { const a = pickR(['#1a1a1a', '#e6e0d0', '#2a3a6a', '#8a1a1a', '#3a5a3a', '#c8a030', '#5a2a5a', '#d06a2a', '#606a74']), t = pickR(['#ffffff', '#111111', '#f2d24a']); L.spines.push(label(64, 6, a, (c, w, h) => { c.fillStyle = t; c.fillRect(Math.floor(R(4, 14)), 2, Math.floor(R(14, 26)), 2); c.fillRect(Math.floor(R(40, 50)), 2, Math.floor(R(6, 12)), 2); }, 0.3)); }
  L.floppy = [['#1a1a1c', 'BACKUP 3/99'], ['#2a3a7a', 'DRIVERS'], ['#7a2222', 'TAXES 98'], ['#3a3a3a', 'DOOM II #2'], ['#d8d4c8', 'WORK']].map(([bg, s]) => label(36, 38, bg, (c, w, h) => { c.fillStyle = '#9aa0a6'; c.fillRect(9, 0, 19, 13); c.fillStyle = '#2a2a2a'; c.fillRect(19, 2, 4, 9); c.fillStyle = '#ece8dc'; c.fillRect(4, 17, w - 8, h - 19); txt(c, s, w / 2, 26, 4.5, '#1a1a6a', { font: HAND, weight: 'normal' }); }, 0.5));
  L.trial = label(64, 64, '#2a2a6a', (c, w, h) => { c.fillStyle = '#c8ccd4'; c.fillRect(0, 0, w, h); const g = c.createRadialGradient(32, 32, 6, 32, 32, 32); g.addColorStop(0, '#4a3a9a'); g.addColorStop(1, '#2a1a6a'); c.fillStyle = g; c.beginPath(); c.arc(32, 32, 31, 0, 7); c.fill(); c.fillStyle = '#c8ccd4'; c.beginPath(); c.arc(32, 32, 7, 0, 7); c.fill(); txt(c, 'BLUEBERRY PIE', 32, 15, 5.5, '#fff'); txt(c, 'ONLINE', 32, 21, 5.5, '#c8b8ff'); txt(c, '500 HOURS', 32, 45, 6, '#f2d24a'); txt(c, 'FREE!', 32, 52, 6, '#f2d24a'); }, 0.3);
  L.manual = [['#2a5a8a', 'GLASS 98', 'Getting Started'], ['#3a3a8a', 'BLUEBERRY PIE', 'Support Handbook'], ['#d8d0b8', '56K MODEM', 'Quick Start'], ['#8a2a22', 'DIAL-UP', 'Networking Guide']].map(([bg, a, s]) => label(56, 76, bg, (c, w, h) => { txt(c, a, w / 2, 20, 7, bg === '#d8d0b8' ? '#222' : '#fff'); txt(c, s, w / 2, 30, 5, bg === '#d8d0b8' ? '#444' : '#ddd'); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, h - 14, w, 6); }));
  L.sticky = ['ext 4410', 'reset mdm 30s', 'call back Mrs K', 'DONT pick up'].map((s, i) => label(30, 30, pickR(['#ece27a', '#f0d26a', '#e8e88a']), (c, w, h) => { txt(c, s.split(' ')[0], w / 2, 10, 6, '#1a1a4a', { font: HAND, weight: 'normal', rot: R(-0.1, 0.1) }); txt(c, s.split(' ').slice(1).join(' '), w / 2, 19, 5, '#1a1a4a', { font: HAND, weight: 'normal' }); }, 0.6));
  L.box = ['XMAS', 'TAXES 95-98', 'KITCHEN', 'BOOKS', "DAD'S"].map((s) => label(64, 40, '#a8845a', (c, w, h) => { txt(c, s, w / 2, h / 2, s.length > 6 ? 9 : 13, '#1a1a1a', { font: HAND, rot: R(-0.12, 0.12) }); c.fillStyle = 'rgba(200,170,110,0.7)'; c.fillRect(0, 0, w, 4); }, 1.2));
  L.pill = label(40, 16, '#f2f0e8', (c, w, h) => { txt(c, 'ZOLPIDEM 10MG', w / 2, 5, 4, '#222'); txt(c, 'take 1 at bedtime', w / 2, 11, 3.5, '#444'); });
  L.shampoo = ['HERBAL', 'DANDRUFF', 'COCONUT'].map((s) => label(24, 36, '#e8e4d8', (c, w, h) => { txt(c, s, w / 2, 12, 4, '#222'); lines(c, 4, 20, w - 8, 3, 4, 'rgba(40,40,40,0.4)'); }, 0.8));
  L.thanks = label(40, 36, '#e2ddd0', (c, w, h) => { txt(c, 'THANK YOU', w / 2, 9, 5, '#b8241c'); txt(c, 'THANK YOU', w / 2, 17, 5, '#b8241c'); txt(c, 'ENJOY', w / 2, 27, 6, '#b8241c', { font: SERIF }); }, 0.8);
  L.dish = label(24, 36, '#e2d86a', (c, w, h) => { txt(c, 'LEMON', w / 2, 11, 5, '#2a5a1a'); txt(c, 'DISH', w / 2, 19, 5, '#2a5a1a'); lines(c, 4, 25, w - 8, 2, 4, 'rgba(40,60,20,0.5)'); }, 0.8);
}

// ---------------------------------------------------------------- small things
// each returns a Kit in its own frame: origin on the surface, front toward +z
function mug(c = 0xd8d2c0, fill = 0.3, mould = false) {
  const k = new Kit();
  k.add(flath([[0.001, 0], [0.039, 0], [0.041, 0.004], [0.043, 0.095], [0.039, 0.095], [0.037, 0.008], [0.001, 0.008]], c, 14), P.g);
  k.add(ftor(0.026, 0.007, c, PI * 1.25, 5, 10), P.g, 0.043, 0.05, 0, 0, 0, -PI * 0.62);
  // the last inch, dried: a tide line and a crust (or a skin of mould)
  const y = 0.008 + fill * 0.08;
  k.add(fcyl(0.0372, 0.002, mould ? 0x6a7458 : 0x24140a, 14), P.m, 0, y, 0);
  if (fill > 0.1) k.add(flat(new THREE.CylinderGeometry(0.0378, 0.0378, 0.012, 14, 1, true), 0x5a3a1e), P.m, 0, y + 0.006, 0);
  return k;
}
function butt(k, x, y, z, ry, rx, len = R(0.022, 0.045)) {
  const bk = new Kit();
  bk.add(fcyl(0.0042, 0.02, pickR([0xc89a5a, 0xd8b07a, 0xe6e0d4]), 6), P.m, 0, 0.01, 0);
  bk.add(fcyl(0.004, len - 0.02, 0xe2ded4, 6), P.m, 0, 0.02 + (len - 0.02) / 2, 0);
  bk.add(fcyl(0.0041, 0.004, 0x34302c, 6), P.m, 0, len, 0);
  k.kit(bk, x, y, z, ry, rx, 0);
}
function ashtray(n = 16) {
  const k = new Kit();
  k.add(flath([[0.001, 0], [0.055, 0], [0.06, 0.006], [0.058, 0.026], [0.05, 0.028], [0.045, 0.012], [0.001, 0.012]], 0x4e5e58, 16), P.g);
  k.add(lump(0.042, 0.016, 0.04, 3, 0x7a7670), P.m, 0, 0.012, 0);
  for (let i = 0; i < n; i++) { const a = R(0, 6.28), r = R(0.004, 0.05); butt(k, Math.cos(a) * r, 0.016 + R(0, 0.016), Math.sin(a) * r, R(0, 6.28), R(1.15, 1.5)); }
  // spilled: two butts and ash on the surface
  for (let i = 0; i < 2; i++) butt(k, R(0.07, 0.11) * (i ? 1 : -1), 0.004, R(-0.05, 0.05), R(0, 6.28), H);
  for (let i = 0; i < 5; i++) k.add(lump(R(0.004, 0.01), 0.002, R(0.004, 0.009), i, 0x8a8680), P.m, R(-0.09, 0.09), 0, R(-0.09, 0.09));
  return k;
}
function beer(lab = L.beer, c = 0x3a200c, fallen = false) {
  const k = new Kit();
  k.add(flath([[0.001, 0], [0.03, 0], [0.032, 0.006], [0.032, 0.14], [0.03, 0.16], [0.013, 0.2], [0.012, 0.222], [0.014, 0.228], [0.001, 0.23]], c, 14), P.g);
  k.add(fit(new THREE.CylinderGeometry(0.0326, 0.0326, 0.07, 14, 1, true, -1.2, 2.4), lab), P.m, 0, 0.075, 0);
  if (!fallen) return k;
  const f = new Kit(); f.kit(k, 0, 0.032, -0.115, 0, H, 0); return f;
}
function sodaCan(lab = L.cola, crushed = false) {
  const g = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 14, 4, true), p = g.attributes.position;
  if (crushed) for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), s = 1 - 0.35 * Math.abs(Math.sin(a * 2 + y * 30)) * (1 - Math.abs(y) / 0.061); p.setXYZ(i, p.getX(i) * s, y * 0.7, p.getZ(i) * (s * 0.8)); }
  g.computeVertexNormals();
  const k = new Kit().add(fit(g, lab), P.s, 0, 0.061 * (crushed ? 0.7 : 1), 0);
  for (const s of [-1, 1]) k.add(fcyl(0.031, 0.004, 0xb0b4b8, 14), P.k, 0, 0.061 * (crushed ? 0.7 : 1) * (1 + s) + (s > 0 ? -0.002 : 0.002), 0);
  return k;
}
function plate(r = 0.12, c = 0xe0dccf, mess = 0) {
  const k = new Kit();
  k.add(flath([[0.001, 0], [r * 0.6, 0], [r * 0.62, 0.004], [r * 0.95, 0.014], [r, 0.018], [r * 0.96, 0.02], [r * 0.6, 0.009], [0.001, 0.009]], c, 20), P.g);
  for (let i = 0; i < mess; i++) k.add(lump(R(0.01, 0.028), R(0.002, 0.006), R(0.008, 0.022), i * 3.1, pickR([0x6a2e14, 0x8a5a24, 0x4a2a14, 0x9a7a3a])), P.m, R(-r * 0.45, r * 0.45), 0.009, R(-r * 0.45, r * 0.45), R(0, 6));
  return k;
}
function crust(len = 0.12) { const pts = []; for (let i = 0; i <= 6; i++) { const a = (i / 6 - 0.5) * len * 5; pts.push([Math.sin(a) * len * 0.8, 0.008, Math.cos(a) * len * 0.8 - len * 0.8]); } return tube(pts, 0.011, 0xa86a2a, 10, 6); }
function fork(c = 0xa8a8a8) {
  const k = new Kit().add(fbox(0.012, 0.003, 0.11, c, 0.0012), P.k, 0, 0.002, -0.04);
  for (let i = 0; i < 4; i++) k.add(fbox(0.0022, 0.002, 0.04, c), P.k, -0.0066 + i * 0.0044, 0.002, 0.04);
  k.add(fbox(0.018, 0.003, 0.014, c, 0.001), P.k, 0, 0.002, 0.018);
  return k;
}
function cigPack(crushed = false) {
  const g = sbox(0.055, 0.088, 0.022, { pz: L.cig, nz: L.cig, all: 0xd8d2c4 });
  if (crushed) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 + 0.2 * Math.sin(y * 60))); p.setZ(i, p.getZ(i) * (0.5 + 0.4 * Math.cos(y * 40))); p.setY(i, y * 0.85); } g.computeVertexNormals(); }
  return new Kit().add(g, P.m, 0, 0.011, 0, 0, -H, 0);
}
function lighter(c = 0xb8322a) { return new Kit().add(fbox(0.025, 0.012, 0.075, c, 0.004), P.g, 0, 0.006, 0).add(fbox(0.022, 0.011, 0.014, 0xa8a8a8, 0.002), P.k, 0, 0.006, 0.043); }
function envelope(lab) { return sbox(0.24, 0.0022, 0.105, { py: lab, all: 0xd8d2c0 }); }
function mailPile(n, keys = ['final', 'due', 'shut', 'second', 'bank', 'junk', 'rent'], spread = 0.03) {
  const k = new Kit();
  for (let i = 0; i < n; i++) k.add(envelope(L[keys[i % keys.length]]), P.m, R(-spread, spread), 0.0011 + i * 0.0024, R(-spread, spread), R(-0.35, 0.35));
  return k;
}
function sheet(lab, w = 0.215, d = 0.28) { return sbox(w, 0.0012, d, { py: lab, all: 0xd8d4c4 }); }
function keyGeo() {
  const s = new THREE.Shape();
  s.moveTo(0.009, 0.003); s.lineTo(0.05, 0.003); s.lineTo(0.053, 0); s.lineTo(0.05, -0.004);
  for (const [x, y] of [[0.046, -0.004], [0.044, -0.007], [0.041, -0.004], [0.037, -0.007], [0.034, -0.004], [0.031, -0.006], [0.027, -0.004]]) s.lineTo(x, y);
  s.lineTo(0.0102, -0.004); s.absarc(0, 0, 0.011, -0.37, 0.28, true);
  const hole = new THREE.Path(); hole.absarc(-0.004, 0, 0.003, 0, PI * 2, true); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-H);
  return g;
}
function keys() {
  const k = new Kit().add(ftor(0.014, 0.0012, 0x9a9a9a, PI * 2, 4, 14), P.k, 0, 0.002, 0, 0, H, 0);
  [[0xb8a058, 0.3], [0xa8a8a8, -0.5], [0xb8a058, 1.4]].forEach(([c, a]) => k.add(flat(keyGeo(), c), P.k, Math.cos(a) * 0.02, 0.001, -Math.sin(a) * 0.02, a));
  return k.add(fbox(0.03, 0.006, 0.045, 0x2a4a7a, 0.004), P.s, -0.03, 0.003, 0.02, 0.6);
}
// ---- shoes: an extruded sole with a rounded toe and a domed upper; toe toward +z
function shoe(len, up, { sole = 0xc8c2b4, kind = 'sneaker', side = 1 } = {}) {
  const k = new Kit(), hw = len * 0.14, bw = len * 0.19, st = { boot: 0.03, slipper: 0.016 }[kind] ?? 0.022, c = side * len * 0.03;
  const s = new THREE.Shape();
  s.moveTo(0, len / 2);
  s.bezierCurveTo(hw * 1.1, len / 2, hw * 1.05, len * 0.3, hw * 1.05, len * 0.15);
  s.bezierCurveTo(bw, -len * 0.05, bw * 1.05, -len * 0.3, c + bw * 0.5, -len * 0.46);
  s.bezierCurveTo(c + bw * 0.1, -len * 0.52, c - bw * 0.6, -len * 0.5, -bw * 0.85, -len * 0.3);
  s.bezierCurveTo(-bw * 0.95, -len * 0.1, -hw * 1.1, len * 0.1, -hw * 1.05, len * 0.3);
  s.bezierCurveTo(-hw * 1.05, len / 2, -hw * 0.5, len / 2, 0, len / 2);
  const sg = new THREE.ExtrudeGeometry(s, { depth: st, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 5 });
  sg.rotateX(-H);
  k.add(flat(sg, sole), P.m, 0, 0.003, 0);
  const uh = { loafer: 0.055, boot: 0.085, slipper: 0.045 }[kind] ?? 0.072, ur = len * 0.47;
  const ug = new THREE.SphereGeometry(1, 16, 8, 0, PI * 2, 0, H), p = ug.attributes.position;
  const hgt = (t) => uh * (t > 0 ? 1 - 0.55 * t ** 1.4 : 1) * (kind === 'slipper' && t < -0.15 ? 0.15 : 1);
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i), wz = t > 0 ? bw * 0.95 : hw * 1.08 + (bw * 0.95 - hw * 1.08) * (1 + t);
    p.setXYZ(i, p.getX(i) * wz + c * Math.max(0, t) * 0.4, p.getY(i) * hgt(t), t * ur);
  }
  ug.computeVertexNormals();
  k.add(flat(ug, up), P.s, 0, st + 0.004, -len * 0.01);
  if (kind !== 'slipper') {
    const op = flat(cylGeo(1, 0.004, 14), 0x161412); op.scale(hw * 0.85, 1, len * 0.15);
    k.add(op, P.m, 0, st + uh * 0.92, -len * 0.22, 0, 0.12);
  }
  if (kind === 'sneaker') {
    for (let i = 0; i < 4; i++) { const z = -len * 0.06 + i * len * 0.055, t = z / ur; k.add(fbox(bw * 0.9, 0.004, 0.007, 0xc8c4b8, 0.002), P.m, 0, st + 0.004 + hgt(t) * Math.sqrt(Math.max(0, 1 - t * t)) + 0.001, z, 0, -t * 0.6); }
    k.add(fbox(hw * 1.2, 0.045, 0.012, up, 0.005), P.s, 0, st + uh * 0.95, -len * 0.08, 0, -0.5);
    k.add(fbox(0.006, 0.014, len * 0.5, 0xc8c4b8), P.m, bw * 0.92, st + 0.012, len * 0.05);
  }
  if (kind === 'boot') k.add(fcyl(hw * 1.18, 0.13, up, 14, hw * 1.08), P.s, 0, st + uh * 0.55 + 0.065, -len * 0.2);
  return k;
}
function jacket(m) {
  // hangs from its collar at the origin, back flat against +z
  const k = new Kit(), g = new THREE.CylinderGeometry(1, 1, 1, 18, 10, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getX(i), p.getZ(i)), t = p.getY(i) + 0.5;
    const wide = 0.2 - 0.03 * t - 0.15 * Math.max(0, t - 0.78) / 0.22;
    let x = Math.sin(a) * wide, z = Math.cos(a);
    z = z > 0 ? z * 0.03 : z * (0.13 - 0.08 * Math.max(0, t - 0.7) / 0.3);
    // drape: deep folds below the shoulders, the hem flaring and hanging open
    x += Math.sin(a * 5 + t * 6) * 0.018 * (1 - t) + Math.sign(x) * 0.02 * (1 - t) ** 2;
    z -= Math.abs(Math.sin(a * 3 + t * 4)) * 0.022 * (1 - t) + (z < 0 ? Math.abs(Math.sin(a * 7)) * 0.012 * (1 - t) : 0);
    p.setXYZ(i, x, -0.04 - 0.7 * (1 - t), z - 0.035);
  }
  g.computeVertexNormals();
  k.add(g, m);
  for (const s of [-1, 1]) {
    const sl = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(s * 0.15, -0.16, -0.06), V3(s * 0.19, -0.35, -0.1), V3(s * 0.17, -0.55, -0.12), V3(s * 0.16, -0.66, -0.11)]), 8, 0.042, 8, false);
    k.add(sl, m);
    k.add(fcyl(0.036, 0.04, 0x4e4632, 8), P.m, s * 0.16, -0.67, -0.11);
    k.add(roundedBox(0.09, 0.05, 0.012, 0.005, 1), m, s * 0.09, -0.5, -0.15 + Math.abs(s) * 0.0, 0, 0.05);
  }
  k.add(new THREE.TorusGeometry(0.05, 0.016, 5, 10, PI), m, 0, -0.06, -0.035, 0, -H, 0);
  k.add(fbox(0.006, 0.6, 0.004, 0x2a2824), P.m, 0, -0.42, -0.145, 0, -0.08);
  return k;
}
function cap(c = 0x2a3448) {
  const k = new Kit().add(flath([[0.085, 0], [0.083, 0.03], [0.07, 0.065], [0.04, 0.085], [0.001, 0.09]], c, 14), P.s);
  const br = fbox(0.15, 0.006, 0.08, c, 0.003), p = br.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - (p.getX(i) / 0.075) ** 2 * 0.012);
  br.computeVertexNormals();
  return k.add(br, P.s, 0, 0.004, -0.11, 0, -0.1).add(fcyl(0.008, 0.006, c), P.s, 0, 0.09, 0);
}
function umbrella(c = 0x1e2228) {
  const k = new Kit(), g = lathe([[0.002, 0], [0.006, 0.03], [0.03, 0.18], [0.042, 0.32], [0.038, 0.45], [0.022, 0.58], [0.012, 0.62], [0.006, 0.63]], 16), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), f = 0.8 + 0.32 * Math.abs(Math.cos(Math.atan2(z, x) * 4)); p.setX(i, x * f); p.setZ(i, z * f); }
  g.computeVertexNormals();
  k.add(flat(g, c), P.m, 0, 0.05, 0);
  k.add(fcyl(0.004, 0.05, 0x8a8a8a, 6), P.k, 0, 0.025, 0);
  k.add(fcyl(0.006, 0.22, 0x8a8a90, 6), P.k, 0, 0.79, 0);
  k.add(ftor(0.042, 0.0045, c, PI * 2, 4, 12), P.m, 0, 0.36, 0, 0, H, 0);
  k.add(fcyl(0.012, 0.08, 0x4a3020, 8), P.g, 0, 0.94, 0);
  k.add(ftor(0.04, 0.012, 0x4a3020, PI, 6, 10), P.g, 0.04, 0.98, 0);
  return k.add(fcyl(0.012, 0.04, 0x4a3020, 8), P.g, 0.08, 0.965, 0);
}
// ---- clothes: lumps of cloth, heaps, a sleeve hanging over an edge
function heap(k, n, x, y, z, sx, sz, hgt, mats, seed = 1) {
  for (let i = 0; i < n; i++) k.add(lump(R(0.08, 0.17), R(0.035, 0.07), R(0.07, 0.14), seed + i * 1.7), pickR(mats), x + R(-sx, sx), y + R(0, hgt), z + R(-sz, sz), R(0, 6.28), R(-0.2, 0.2), R(-0.2, 0.2));
}
function sleeve(pts, m, r = 0.034) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), 10, r, 7, false); }
function laundryBasket(c = 0xb8c0c4) {
  const k = new Kit(), w = 0.52, d = 0.36, h = 0.27;
  k.add(fbox(w, 0.012, d, c, 0.004), P.s, 0, 0.006, 0);
  for (const y of [0.02, 0.135]) for (const s of [-1, 1]) { k.add(fbox(w, 0.02, 0.01, c), P.s, 0, y, s * d / 2); k.add(fbox(0.01, 0.02, d, c), P.s, s * w / 2, y, 0); }
  for (const s of [-1, 1]) { k.add(fbox(w + 0.02, 0.024, 0.02, c, 0.006), P.s, 0, h, s * (d / 2 + 0.004)); k.add(fbox(0.02, 0.024, d + 0.02, c, 0.006), P.s, s * (w / 2 + 0.004), h, 0); }
  for (let i = 0; i <= 13; i++) for (const s of [-1, 1]) k.add(fbox(0.014, h, 0.008, c), P.s, -w / 2 + i * w / 13, h / 2, s * d / 2);
  for (let i = 1; i < 9; i++) for (const s of [-1, 1]) k.add(fbox(0.008, h, 0.014, c), P.s, s * w / 2, h / 2, -d / 2 + i * d / 9);
  heap(k, 9, 0, 0.12, 0, 0.16, 0.08, 0.16, [P.white, P.grey, P.navy, P.denim, P.terry], 4);
  k.add(sleeve([[0.12, 0.3, 0.12], [0.16, 0.29, 0.2], [0.18, 0.2, 0.22], [0.2, 0.08, 0.215]], P.grey), P.grey);
  return k;
}
function hamper() {
  const k = new Kit();
  k.add(lathe([[0.001, 0], [0.17, 0], [0.19, 0.58], [0.2, 0.6], [0.185, 0.6], [0.165, 0.012], [0.001, 0.012]], 18), P.wicker);
  heap(k, 7, 0, 0.45, 0, 0.09, 0.09, 0.1, [P.white, P.grey, P.denim, P.terry, P.flannel], 7);
  k.add(sleeve([[0.08, 0.6, 0.12], [0.14, 0.62, 0.18], [0.22, 0.5, 0.2], [0.24, 0.32, 0.18]], P.denim, 0.04), P.denim);
  // the lid, knocked askew on top of the pile
  return k.add(lathe([[0.205, 0], [0.2, 0.01], [0.12, 0.028], [0.001, 0.03]], 18), P.wicker, 0.02, 0.6, -0.03, 0, -0.35, 0.15);
}
function pizzaBox(open = true) {
  const k = new Kit(), s = 0.4, t = 0.004, hh = 0.042, br = 0xa8845a, li = 0xc8b48e;
  k.add(sbox(s, t, s, { py: L.pizzaIn, all: br }), P.m, 0, t / 2, 0);
  for (const sg of [-1, 1]) { k.add(sbox(s, hh, t, { all: br }), P.m, 0, hh / 2, sg * (s / 2 - t / 2)); k.add(sbox(t, hh, s, { all: br }), P.m, sg * (s / 2 - t / 2), hh / 2, 0); }
  const lid = sbox(s, t, s, { py: L.pizzaTop, ny: L.pizzaIn, all: br }); lid.translate(0, 0, s / 2);
  if (open) {
    k.add(lid, P.m, 0, hh, -s / 2, 0, -1.95, 0);
    for (let i = 0; i < 3; i++) k.add(crust(R(0.08, 0.13)), P.m, R(-0.1, 0.1), t, R(-0.08, 0.12), R(0, 6.28));
    k.add(fbox(0.07, 0.006, 0.06, li), P.m, 0.12, t + 0.003, -0.1, 0.4); // a paper pepper sachet
  } else k.add(lid, P.m, 0, hh, -s / 2);
  return k;
}
function recycleBin() {
  const k = new Kit(), c = 0x2c5486, w = 0.44, d = 0.32, h = 0.3;
  k.add(fbox(w, 0.015, d, c, 0.005), P.s, 0, 0.0075, 0);
  for (const s of [-1, 1]) { k.add(fbox(w, h, 0.012, c, 0.004), P.s, 0, h / 2, s * (d / 2 - 0.006)); k.add(fbox(0.012, h, d, c, 0.004), P.s, s * (w / 2 - 0.006), h / 2, 0); }
  for (const s of [-1, 1]) { k.add(fbox(w + 0.02, 0.02, 0.022, c, 0.006), P.s, 0, h, s * d / 2); k.add(fbox(0.022, 0.02, d + 0.02, c, 0.006), P.s, s * w / 2, h, 0); }
  for (let i = 0; i < 9; i++) k.kit(beer(L.beer, pickR([0x3a200c, 0x2a4a22, 0x3a200c]), true), R(-0.1, 0.1), 0.02 + R(0, 0.2), R(-0.06, 0.06), R(0, 6.28), R(-0.3, 0.3), R(-0.3, 0.3));
  for (let i = 0; i < 6; i++) k.kit(sodaCan(L.cola, true), R(-0.16, 0.16), 0.1 + R(0, 0.14), R(-0.1, 0.1), R(0, 6.28), R(0, 3), 0);
  k.kit(beer(), 0.14, 0.14, 0.07, 0, -0.2, 0.25);
  return k.add(sheet(L.news, 0.3, 0.39), P.m, -0.04, 0.27, 0, 0.3, 0.15, -0.1);
}
// ---- living room: music, tapes, a console, the home phone, a plant left to die
function cdTower() {
  const k = new Kit(), wood = 0x2a2420, hg = 0.92;
  k.add(fbox(0.2, 0.025, 0.18, wood, 0.006), P.s, 0, 0.0125, 0);
  for (const s of [-1, 1]) k.add(fbox(0.014, hg, 0.15, wood, 0.004), P.s, s * 0.08, hg / 2 + 0.02, 0);
  k.add(fbox(0.15, hg, 0.008, wood), P.s, 0, hg / 2 + 0.02, -0.071);
  k.add(fbox(0.18, 0.02, 0.16, wood, 0.006), P.s, 0, hg + 0.03, 0);
  for (let i = 0; i < 68; i++) {
    if (rnd() < 0.14) continue;
    const spine = rnd() < 0.75 ? pickR(L.spines) : pickR([0x1a1a1a, 0xd8d4c8, 0x8a1a1a, 0x2a3a6a]);
    k.add(sbox(0.142, 0.0104, 0.124, { pz: spine, py: 0x9aa4a8, all: 0x1c1c1e }), P.s, R(-0.002, 0.002), 0.04 + i * 0.0128, 0.006 + (rnd() < 0.08 ? R(0.02, 0.05) : R(0, 0.006)), R(-0.03, 0.03));
  }
  return k;
}
const vhs = (lab, rental = false) => (rental ? sbox(0.2, 0.032, 0.112, { pz: L.rental, all: 0x1e4a8a }) : sbox(0.187, 0.025, 0.103, { pz: lab, py: 0x1c1c1c, all: 0x121212 }));
function gameConsole() {
  const k = new Kit(), g = 0xaeaeb2;
  k.add(fbox(0.27, 0.05, 0.19, g, 0.012), P.s, 0, 0.025, 0);
  k.add(fbox(0.272, 0.003, 0.192, 0x6a6a70), P.s, 0, 0.03, 0);
  k.add(fcyl(0.066, 0.004, 0xa2a2a6, 24), P.s, -0.04, 0.051, -0.01);
  k.add(fcyl(0.058, 0.003, 0x98989e, 24), P.s, -0.04, 0.053, -0.01);
  for (const [x, z] of [[0.075, 0.03], [0.105, 0.03], [0.09, 0.065]]) k.add(fcyl(0.011, 0.006, 0x8a8a90, 12), P.s, x, 0.052, z);
  k.add(fbox(0.006, 0.004, 0.004, 0x3a6a3a), P.g, 0.112, 0.052, 0.075);
  for (const s of [-1, 1]) k.add(fbox(0.032, 0.012, 0.004, 0x161616), P.m, s * 0.05, 0.022, 0.096);
  return k;
}
function controller(c = 0xa4a4a8) {
  const k = new Kit().add(fbox(0.11, 0.022, 0.05, c, 0.01), P.s, 0, 0.016, 0);
  for (const s of [-1, 1]) k.add(flat(new THREE.CapsuleGeometry(0.017, 0.05, 3, 8), c), P.s, s * 0.045, 0.016, 0.035, s * 0.35, H, 0);
  k.add(fbox(0.03, 0.006, 0.01, 0x2a2a2a), P.s, -0.035, 0.029, 0).add(fbox(0.01, 0.006, 0.03, 0x2a2a2a), P.s, -0.035, 0.029, 0);
  for (const [x, z] of [[0.035, -0.011], [0.035, 0.011], [0.024, 0], [0.046, 0]]) k.add(fcyl(0.0045, 0.006, 0x3a3a3e, 8), P.s, x, 0.029, z);
  for (const s of [-1, 1]) k.add(fbox(0.022, 0.008, 0.008, 0x8a8a8e, 0.003), P.s, s * 0.038, 0.022, -0.028);
  return k;
}
function answeringMachine() {
  const k = new Kit(), c = 0x2c2a28;
  k.add(fbox(0.2, 0.045, 0.15, c, 0.01), P.s, -0.04, 0.0225, 0);
  k.add(fbox(0.075, 0.003, 0.05, 0x0c0c0c, 0.002), P.g, -0.08, 0.046, -0.02);
  k.add(fbox(0.05, 0.002, 0.03, 0x4a3a2a), P.m, -0.08, 0.0475, -0.02);
  for (let i = 0; i < 5; i++) k.add(fbox(0.022, 0.006, 0.014, i === 2 ? 0x7a2a22 : 0x5a5a58, 0.002), P.s, -0.12 + i * 0.03, 0.047, 0.05);
  for (let i = 0; i < 5; i++) k.add(fbox(0.045, 0.001, 0.002, 0x111111), P.m, 0.02, 0.0455, -0.05 + i * 0.008);
  k.add(fbox(0.02, 0.004, 0.012, 0), P.led, 0.025, 0.047, 0.02);
  // the cordless: its cradle and the handset left lying in it
  k.add(fbox(0.08, 0.03, 0.15, c, 0.012), P.s, 0.11, 0.015, 0);
  const hs = new Kit().add(fbox(0.05, 0.026, 0.18, 0x3a3836, 0.012), P.s, 0, 0.013, 0);
  for (let i = 0; i < 12; i++) hs.add(fbox(0.009, 0.004, 0.007, 0x8a8a86, 0.002), P.s, -0.012 + (i % 3) * 0.012, 0.027, 0.0 + Math.floor(i / 3) * 0.012);
  hs.add(fbox(0.024, 0.003, 0.016, 0x1a2a1a), P.g, 0, 0.027, -0.04).add(fcyl(0.005, 0.07, 0x1a1a1a, 6), P.s, 0.016, 0.03, -0.1, 0, 0, 0);
  return k.kit(hs, 0.11, 0.028, 0.005, 0, -0.08, 0);
}
function deadPlant() {
  const k = new Kit();
  k.add(flath([[0.001, 0.008], [0.1, 0.008], [0.105, 0.016], [0.125, 0.22], [0.138, 0.226], [0.138, 0.248], [0.126, 0.248], [0.116, 0.225], [0.001, 0.205]], 0x8a5236, 18), P.m);
  k.add(flath([[0.001, 0], [0.14, 0], [0.15, 0.022], [0.14, 0.024], [0.13, 0.008], [0.001, 0.008]], 0x6a4430, 18), P.m);
  k.add(fcyl(0.114, 0.006, 0x3a2c22, 18), P.m, 0, 0.208, 0);
  for (let i = 0; i < 5; i++) k.add(lump(R(0.01, 0.025), 0.006, R(0.01, 0.02), i, 0x4a3828), P.m, R(-0.06, 0.06), 0.21, R(-0.06, 0.06));
  // snake-plant leaves: most collapsed over the rim, brown and papery
  const leaf = (bx, bz, a, len, lean, flop, c, y0 = 0.21, tw = R(-1, 1)) => {
    const n = 11, pts = []; let x = bx, y = y0, z = bz;
    for (let j = 0; j < n; j++) { pts.push([x, y, z]); const th = lean + flop * (j / (n - 1)) ** (flop > 1 ? 0.75 : 2), st = len / (n - 1); x += Math.sin(th) * Math.sin(a) * st; z += Math.sin(th) * Math.cos(a) * st; y = Math.max(0.006, y + Math.cos(th) * st); }
    k.add(flat(ribbon(pts, (j) => 0.021 * (1 - (j / (n - 1)) ** 1.4) * (c === 0x5a6232 ? 1 : 0.75) + 0.0015, (j) => { const t = tw * j / n; return [Math.cos(a) * Math.cos(t), Math.sin(t) * 0.5, -Math.sin(a) * Math.cos(t)]; }), c), P.m);
  };
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4 + R(-0.2, 0.2), r = R(0.01, 0.07), dead = i > 1;
    leaf(Math.sin(a) * r, Math.cos(a) * r, a, R(0.3, 0.62), R(0.1, 0.45), dead ? R(1.5, 3.2) : R(0, 0.3), dead ? pickR([0xc0a878, 0xa89060, 0xb8a070, 0x8a7448, 0xc8b488]) : 0x5a6232);
  }
  for (let i = 0; i < 7; i++) { const a = R(0, 6.28), r = R(0.18, 0.4); leaf(Math.sin(a) * r, Math.cos(a) * r, a + R(-1, 1), R(0.15, 0.3), H, 0.05, pickR([0xc0a878, 0xa89060, 0xb8a070]), 0.004); }
  return k;
}
// ---- kitchen
function saucepan(c = 0x9a9a9c) {
  return new Kit().add(flath([[0.001, 0], [0.08, 0], [0.085, 0.01], [0.085, 0.09], [0.088, 0.094], [0.08, 0.094], [0.078, 0.008], [0.001, 0.008]], c, 18), P.k)
    .add(fbox(0.16, 0.012, 0.025, 0x1a1a1a, 0.005), P.s, 0.16, 0.085, 0).add(lump(0.06, 0.012, 0.06, 5, 0x5a3a1a), P.m, 0, 0.008, 0);
}
function dishRack() {
  const k = new Kit(), wire = 0xc4c4c0, w = 0.36, d = 0.26;
  k.add(fbox(w + 0.03, 0.012, d + 0.03, 0xd0ccc0, 0.006), P.s, 0, 0.006, 0);
  for (const y of [0.03, 0.11]) for (const s of [-1, 1]) { k.add(fcyl(0.0025, d, wire, 5), P.k, s * w / 2, y, 0, 0, H); k.add(fcyl(0.0025, w, wire, 5), P.k, 0, y, s * d / 2, 0, 0, H); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(fcyl(0.0025, 0.1, wire, 5), P.k, sx * w / 2, 0.065, sz * d / 2);
  for (let i = 0; i < 9; i++) for (const x of [-0.12, -0.02]) k.add(fcyl(0.002, 0.07, wire, 4), P.k, x, 0.065, -d / 2 + 0.02 + i * 0.027);
  for (let i = 0; i < 3; i++) k.kit(plate(0.105, pickR([0xe0dccf, 0xd6d0c2]), i === 2 ? 2 : 0), -0.07, 0.12, -0.08 + i * 0.054, 0, H - 0.12, 0);
  k.kit(mug(0xc8c0b0, 0), 0.1, 0.105, 0.06, 0, PI, 0);
  k.add(fcyl(0.028, 0.09, wire, 8), P.k, 0.12, 0.057, -0.08);
  for (let i = 0; i < 3; i++) k.add(fbox(0.01, 0.15, 0.004, i ? 0x9a9a9a : 0x3a2a1a, 0.002), P.k, 0.12 + R(-0.01, 0.01), 0.1, -0.08 + R(-0.01, 0.01), R(0, 3), R(-0.2, 0.2), R(-0.2, 0.2));
  return k;
}
function toaster(c = 0xb4b2ac) {
  const k = new Kit().add(fbox(0.27, 0.17, 0.15, c, 0.035), P.k, 0, 0.1, 0).add(fbox(0.29, 0.02, 0.17, 0x2a2826, 0.008), P.s, 0, 0.01, 0);
  for (const z of [-0.03, 0.03]) k.add(fbox(0.2, 0.004, 0.022, 0x0e0c0a), P.m, 0, 0.184, z);
  k.add(fbox(0.03, 0.02, 0.025, 0x1a1a1a, 0.005), P.s, 0.15, 0.13, 0).add(fcyl(0.012, 0.012, 0x1a1a1a), P.s, 0.142, 0.06, 0, 0, 0, H);
  for (let i = 0; i < 12; i++) k.add(lump(R(0.002, 0.004), 0.002, R(0.002, 0.004), i, pickR([0x8a5a2a, 0x5a3a1a])), P.m, R(-0.2, 0.2), 0, R(-0.12, 0.12));
  return k;
}
function spiceRack() {
  const k = new Kit(), w = 0.3, wood = 0x6a4a2c;
  k.add(fbox(w, 0.2, 0.012, wood, 0.003), P.s, 0, 0.1, 0.006).add(fbox(w, 0.012, 0.07, wood, 0.003), P.s, 0, 0.006, 0.035);
  for (const s of [-1, 1]) k.add(fbox(0.012, 0.12, 0.07, wood, 0.003), P.s, s * w / 2, 0.06, 0.035);
  k.add(fcyl(0.004, w, 0xb0a890, 6), P.k, 0, 0.06, 0.068, 0, 0, H);
  [[0x8a2a14, 0xc8c0b0], [0x4a5a2a, 0xa82a22], [0x1a1612, 0xd8d4c8], [0xd8d0c0, 0x1a1a1a], [0x9a6a2a, 0xc8c0b0]].forEach(([fill, lid], i) => {
    if (i === 3) return;
    k.add(fcyl(0.019, 0.07, fill, 10), P.g, -0.11 + i * 0.054, 0.047, 0.036).add(fcyl(0.02, 0.016, lid, 10), P.s, -0.11 + i * 0.054, 0.09, 0.036);
  });
  return k;
}
function paperTowel() {
  const k = new Kit();
  for (const s of [-1, 1]) k.add(fbox(0.02, 0.09, 0.012, 0xd8d4c8, 0.004), P.s, 0, -0.045, s * 0.15);
  k.add(fcyl(0.05, 0.27, 0xe2ded2, 14), P.m, 0, -0.075, 0, 0, H).add(fcyl(0.02, 0.272, 0x8a6a4a, 10), P.m, 0, -0.075, 0, 0, H);
  const pts = []; for (let i = 0; i <= 6; i++) pts.push([-0.05 - i * 0.004, -0.075 - i * 0.03, 0]);
  return k.add(flat(ribbon(pts, () => 0.13, () => [0, 0, 1]), 0xdcd8cc), P.m);
}
function canister(lab, r, h) {
  return new Kit().add(flath([[0.001, 0], [r, 0], [r, h], [r * 0.92, h + 0.004], [0.001, h + 0.004]], 0xd2c6aa, 16), P.g)
    .add(fit(new THREE.CylinderGeometry(r + 0.001, r + 0.001, h * 0.4, 10, 1, true, -0.65, 1.3), lab), P.m, 0, h * 0.5, 0)
    .add(fsph(r * 0.22, 0x5a3a2a), P.g, 0, h + 0.008, 0);
}
const cereal = (lab, side) => sbox(0.19, 0.28, 0.07, { pz: lab, all: side });
function utensilRail() {
  const k = new Kit(), st = 0xa4a4a4;
  k.add(fcyl(0.005, 0.46, st, 6), P.k, 0, 0, 0.03, 0, 0, H);
  for (const s of [-1, 1]) k.add(fcyl(0.006, 0.03, st, 6), P.k, s * 0.21, 0, 0.015, 0, H);
  const hook = (x) => k.add(ftor(0.008, 0.0015, st, PI * 2, 4, 8), P.k, x, -0.008, 0.03);
  hook(-0.16); k.add(fbox(0.014, 0.17, 0.008, 0x1a1a1a, 0.003), P.s, -0.16, -0.1, 0.03).add(fbox(0.065, 0.075, 0.003, 0x2a2a2a, 0.006), P.s, -0.16, -0.22, 0.03);
  hook(-0.05); k.add(fcyl(0.004, 0.25, st, 6), P.k, -0.05, -0.13, 0.03).add(flath([[0.001, 0], [0.024, 0.004], [0.034, 0.018], [0.036, 0.03], [0.03, 0.03], [0.028, 0.02], [0.001, 0.008]], st, 12), P.k, -0.05, -0.29, 0.03, 0, H * 0.9);
  hook(0.06); k.add(fcyl(0.008, 0.1, 0x1a1a1a, 8), P.s, 0.06, -0.06, 0.03).add(flath([[0.006, 0], [0.022, 0.03], [0.028, 0.08], [0.02, 0.12], [0.004, 0.135]], st, 8), P.k, 0.06, -0.245, 0.03);
  hook(0.16); return k.add(lump(0.07, 0.025, 0.11, 2), P.check, 0.16, -0.13, 0.03, 0, -H, 0);
}
function flyStrip(len = 0.5) {
  const k = new Kit(), n = 24, pts = [], tw = (i) => i / (n - 1) * PI * 3.2;
  for (let i = 0; i < n; i++) pts.push([Math.sin(i * 0.3) * 0.004, -0.02 - len * i / (n - 1), 0]);
  k.add(flat(ribbon(pts, () => 0.024, (i) => [Math.cos(tw(i)), 0, Math.sin(tw(i))]), 0xa08428), P.g);
  k.add(fcyl(0.015, 0.022, 0xb0964a, 10), P.g, 0, -0.011, 0);
  for (let i = 0; i < 30; i++) {
    const t = R(0.04, 0.99), a = tw(t * (n - 1)), s = R(-0.019, 0.019), sd = rnd() < 0.5 ? 1 : -1;
    k.add(lump(0.0042, 0.0028, 0.0026, i, 0x121010), P.m, Math.cos(a) * s - Math.sin(a) * 0.0015 * sd, -0.02 - len * t, Math.sin(a) * s + Math.cos(a) * 0.0015 * sd, R(0, 6), R(-1, 1), R(-1, 1));
  }
  return k;
}
function smokeDetector() {
  const k = new Kit().add(flath([[0.068, 0], [0.068, 0.02], [0.058, 0.034], [0.001, 0.038]], 0xcfc8b4, 18), P.s).add(fcyl(0.012, 0.006, 0xbfb8a4, 10), P.s, 0, 0.039, 0);
  // two strips of duct tape over the vents
  for (const a of [0.6, -0.7]) {
    const pts = []; for (let i = 0; i <= 12; i++) { const x = -0.11 + i * 0.22 / 12, t = Math.abs(x) / 0.068; pts.push([x, t < 1 ? 0.0405 - t * t * 0.022 : Math.max(0.001, 0.02 * (1 - (Math.abs(x) - 0.068) / 0.025)), 0]); }
    k.add(flat(ribbon(pts, () => 0.024, () => [0, 0, 1]), 0x86847e), P.g, 0, 0.001, 0, a);
  }
  return k;
}
// a Chinese takeout pail: folded white board, wire handle, chopsticks across the top
function takeout() {
  const k = new Kit(), g = new THREE.CylinderGeometry(0.075, 0.055, 0.1, 4, 1, true); g.rotateY(PI / 4);
  k.add(flat(g, 0xe2ddd0), P.m, 0, 0.05, 0).add(fbox(0.078, 0.002, 0.078, 0xe2ddd0), P.m, 0, 0.001, 0).add(fbox(0.1, 0.002, 0.1, 0xd8d2c4), P.m, 0, 0.098, 0);
  for (let i = 0; i < 4; i++) { const a = i * H, f = new Kit().add(fbox(0.106, 0.002, 0.05, 0xe2ddd0), P.m, 0, 0, -0.024); k.kit(f, Math.sin(a) * 0.053, 0.1, Math.cos(a) * 0.053, a, -0.9 - (i % 2) * 0.3, 0); }
  k.add(fit(new THREE.PlaneGeometry(0.08, 0.07), L.thanks), P.m, 0, 0.05, 0.0475, 0, -0.139, 0);
  k.add(ftor(0.052, 0.0012, 0x9a9a9a, PI, 3, 12), P.k, 0, 0.1, 0, 0.3);
  for (const s of [-1, 1]) k.add(fbox(0.006, 0.006, 0.22, 0xc8a878, 0.002), P.s, s * 0.01, 0.13, 0.02, 0.15 * s, 0.1, 0);
  return k;
}
// ---- desk
function headset() {
  const k = new Kit(), c = 0x222222;
  k.add(ftor(0.07, 0.0035, c, PI * 1.1, 4, 14), P.s, 0, 0.004, 0, 0, -H, 0);
  k.add(fcyl(0.03, 0.016, c, 14), P.s, 0.07, 0.008, 0).add(lump(0.026, 0.01, 0.026, 2, 0x161616), P.m, 0.07, 0.016, 0);
  k.add(tube([[0.07, 0.012, 0.02], [0.06, 0.012, 0.08], [0.03, 0.01, 0.13]], 0.0025, c, 10, 4), P.s).add(fsph(0.009, 0x111111), P.m, 0.03, 0.01, 0.135);
  return k.add(tube([[0.08, 0.006, -0.02], [0.12, 0.003, -0.05], [0.1, 0.003, -0.15], [0.02, 0.003, -0.2], [-0.03, 0.003, -0.24]], 0.002, c, 16, 4), P.s);
}
function spindle() {
  const k = new Kit().add(fcyl(0.065, 0.008, 0x1a1a1a, 20), P.s, 0, 0.004, 0).add(fcyl(0.006, 0.12, 0x2a2a2a, 8), P.s, 0, 0.06, 0);
  k.add(fcyl(0.06, 0.045, 0xb4bac4, 24), P.k, 0, 0.031, 0).add(fit(cylGeo(0.06, 0.001, 24), L.trial), P.m, 0, 0.054, 0);
  return k.add(flath([[0.068, 0.008], [0.068, 0.12], [0.05, 0.135], [0.001, 0.138]], 0, 18), P.glass);
}
const floppy = (lab) => sbox(0.09, 0.0033, 0.094, { py: lab, all: 0x1a1a1c });
const disc = () => fit(cylGeo(0.06, 0.0012, 24), L.trial);
function powerStrip() {
  const k = new Kit().add(fbox(0.32, 0.035, 0.055, 0xd4ccb8, 0.01), P.s, 0, 0.0175, 0).add(fbox(0.02, 0.008, 0.016, 0), P.led, -0.13, 0.036, 0);
  for (let i = 0; i < 6; i++) k.add(fbox(0.022, 0.002, 0.016, 0x8a8478), P.m, -0.09 + i * 0.042, 0.035, 0);
  for (const i of [0, 1, 3]) k.add(fbox(0.03, 0.03, 0.026, 0x161616, 0.004), P.s, -0.09 + i * 0.042, 0.05, 0);
  return k;
}
function outlet(plug = false) {
  const k = new Kit().add(fbox(0.07, 0.115, 0.006, 0xd2cab6, 0.003), P.s, 0, 0, 0.003);
  for (const s of [-1, 1]) { k.add(fbox(0.036, 0.03, 0.006, 0xc8c0aa, 0.008), P.s, 0, s * 0.024, 0.006); for (const x of [-0.006, 0.006]) k.add(fbox(0.002, 0.008, 0.002, 0x1a1a1a), P.m, x, s * 0.024 + 0.002, 0.009); }
  k.add(fcyl(0.003, 0.002, 0x9a9a9a, 6), P.k, 0, 0, 0.0065, 0, H);
  if (plug) k.add(fbox(0.03, 0.028, 0.024, 0x161616, 0.005), P.s, 0, 0.024, 0.02);
  return k;
}
function wastebasket() {
  const k = new Kit().add(flath([[0.001, 0], [0.1, 0], [0.12, 0.28], [0.125, 0.285], [0.115, 0.285], [0.096, 0.008], [0.001, 0.008]], 0x2a2a2c, 16), P.s);
  const ball = (r, c) => { const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.28 * Math.sin(x * 140 + y * 90) * Math.cos(z * 120 - y * 50); p.setXYZ(i, x * n, y * n, z * n); } g.computeVertexNormals(); return flat(g, c); };
  for (let i = 0; i < 9; i++) k.add(ball(R(0.025, 0.04), pickR([0xe2ded2, 0xd8d0b8, 0xe8e4d8])), P.m, R(-0.06, 0.06), 0.2 + R(0, 0.12), R(-0.06, 0.06), R(0, 6));
  for (let i = 0; i < 3; i++) k.add(ball(R(0.025, 0.035), 0xe2ded2), P.m, R(0.15, 0.3) * (i % 2 ? 1 : -1), 0.03, R(-0.2, 0.2) + 0.1, R(0, 6));
  return k;
}
// ---- bedroom
function floorFan(c = 0xcac4b4) {
  const k = new Kit().add(flath([[0.16, 0], [0.16, 0.014], [0.12, 0.03], [0.03, 0.045], [0.02, 0.06], [0.001, 0.06]], c, 18), P.s).add(fcyl(0.012, 0.72, 0xb0b0b0, 8), P.k, 0, 0.42, 0);
  const hd = new Kit().add(flath([[0.07, -0.13], [0.075, -0.06], [0.06, 0.0], [0.03, 0.02], [0.001, 0.025]], c, 14), P.s, 0, 0, 0, 0, H, 0);
  for (const z of [0.03, 0.1]) hd.add(ftor(0.2, 0.003, 0xd8d4c8, PI * 2, 4, 28), P.k, 0, 0, z);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; hd.add(fcyl(0.0015, 0.2, 0xd8d4c8, 3), P.k, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.1, 0, 0, a - H); }
  for (let i = 0; i < 18; i++) { const a = (i / 18) * PI * 2; hd.add(fcyl(0.0015, 0.08, 0xd8d4c8, 3), P.k, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.065, 0, H, 0); }
  hd.add(fcyl(0.03, 0.006, 0x5a6a7a, 14), P.s, 0, 0, 0.102, 0, H);
  for (let i = 0; i < 3; i++) { const g = lump(0.085, 0.004, 0.045, i, 0x8a9aa4); g.translate(0.095, 0, 0); g.rotateX(H); hd.add(g, P.s, 0, 0, 0.065, 0, 0, (i / 3) * PI * 2 + 0.4); }
  return k.kit(hd, 0, 0.84, 0, 0, 0.12, 0);
}
function book(w, t, d, c) { return sbox(w, t, d, { nx: c, py: c, ny: c, all: 0xd6ceb4 }); }
function pillBottle(lab = L.pill) {
  return new Kit().add(flath([[0.001, 0], [0.017, 0], [0.018, 0.06], [0.001, 0.06]], 0xc8722a, 12), P.g)
    .add(fit(new THREE.CylinderGeometry(0.0185, 0.0185, 0.035, 12, 1, true, -1.3, 2.6), lab), P.m, 0, 0.03, 0).add(fcyl(0.02, 0.016, 0xe8e6de, 12), P.s, 0, 0.068, 0);
}
function glassWater(level = 0.5) {
  return new Kit().add(lathe([[0.001, 0], [0.03, 0], [0.034, 0.11], [0.031, 0.11], [0.028, 0.006], [0.001, 0.006]], 14), P.glass).add(fcyl(0.029, 0.1 * level, 0, 12, 0.03), P.glass, 0, 0.006 + 0.05 * level, 0);
}
// ---- bathroom
function toothCup() {
  const k = new Kit().add(flath([[0.001, 0], [0.032, 0], [0.036, 0.1], [0.033, 0.1], [0.029, 0.006], [0.001, 0.006]], 0x9aa89a, 14), P.s);
  [[0x3a6aa0, 0.25], [0xb84a3a, -0.3]].forEach(([c, a]) => { const t = new Kit().add(fbox(0.011, 0.17, 0.007, c, 0.003), P.s, 0, 0.085, 0).add(fbox(0.012, 0.026, 0.012, 0xcac6b8, 0.002), P.m, 0, 0.165, 0.008); k.kit(t, 0.01 * Math.sign(a), 0.01, 0, a, 0, a); });
  return k;
}
function toothpaste() {
  const g = new THREE.CylinderGeometry(0.017, 0.017, 0.15, 12, 6, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.15 + 0.5, sq = t > 0.55 ? (t - 0.55) / 0.45 : 0; p.setZ(i, p.getZ(i) * (1 - sq * 0.88) * (0.75 + 0.25 * Math.sin(t * 9))); p.setX(i, p.getX(i) * (1 + sq * 0.35)); }
  g.computeVertexNormals();
  return new Kit().add(flat(g, 0xd8d4cc), P.s, 0, 0.017, 0, 0, 0, H).add(fcyl(0.009, 0.016, 0x2a5a9a, 10), P.s, -0.083, 0.017, 0, 0, 0, H);
}
function bottle(lab, c, hgt = 0.2) {
  return new Kit().add(flath([[0.001, 0], [0.03, 0], [0.032, 0.01], [0.032, hgt * 0.78], [0.024, hgt * 0.92], [0.012, hgt], [0.001, hgt]], c, 12), P.g)
    .add(fit(new THREE.CylinderGeometry(0.0326, 0.0326, hgt * 0.4, 12, 1, true, -0.9, 1.8), lab), P.m, 0, hgt * 0.4, 0).add(fcyl(0.014, 0.03, 0xe0dcd0, 10), P.s, 0, hgt + 0.012, 0);
}
function tpRoll(r = 0.058, h = 0.1) { return new Kit().add(fcyl(r, h, 0xe6e2d8, 16), P.m, 0, h / 2, 0).add(fcyl(0.021, h + 0.002, 0x7a5a3a, 10), P.m, 0, h / 2, 0); }
function tpHolder() {
  const k = new Kit(); // on a wall facing +z
  for (const s of [-1, 1]) k.add(fbox(0.016, 0.05, 0.06, 0xb8b8b4, 0.006), P.k, s * 0.075, 0, 0.03);
  k.add(fcyl(0.007, 0.15, 0xb8b8b4, 8), P.k, 0, -0.005, 0.05, 0, 0, H).add(fcyl(0.024, 0.1, 0xe6e2d8, 14), P.m, 0, -0.005, 0.05, 0, 0, H);
  return k.add(flat(ribbon([[0, -0.03, 0.05], [0, -0.08, 0.058], [0, -0.13, 0.062]], () => 0.05, () => [1, 0, 0]), 0xe6e2d8), P.m);
}
function plunger() { return new Kit().add(flath([[0.065, 0], [0.065, 0.02], [0.055, 0.05], [0.025, 0.07], [0.012, 0.075]], 0x6a2218, 14), P.g).add(fcyl(0.011, 0.42, 0x8a6a44, 8), P.s, 0, 0.28, 0); }
function bathBin() {
  const k = new Kit().add(flath([[0.001, 0], [0.09, 0], [0.105, 0.24], [0.1, 0.24], [0.085, 0.008], [0.001, 0.008]], 0xcac6ba, 14), P.s);
  for (let i = 0; i < 6; i++) k.add(lump(R(0.03, 0.05), R(0.015, 0.03), R(0.03, 0.05), i, 0xe6e2da), P.m, R(-0.04, 0.04), 0.17 + R(0, 0.06), R(-0.04, 0.04));
  return k;
}
function hair(k, x, y, z, n = 6, spread = 0.05) {
  for (let i = 0; i < n; i++) { const pts = []; let px = x + R(-spread, spread), pz = z + R(-spread, spread), a = R(0, 6.28); for (let j = 0; j < 6; j++) { pts.push([px, y, pz]); a += R(-1.2, 1.2); px += Math.cos(a) * 0.012; pz += Math.sin(a) * 0.012; } k.add(tube(pts, 0.0007, 0x1a1410, 12, 3), P.m); }
}
// ---- closet
function vacuum() {
  const k = new Kit(), body = 0x84888c, dk = 0x262628;
  k.add(fbox(0.32, 0.075, 0.26, body, 0.025), P.s, 0, 0.05, 0.03).add(fbox(0.33, 0.03, 0.03, dk, 0.01), P.s, 0, 0.03, 0.16);
  for (const s of [-1, 1]) k.add(fcyl(0.035, 0.025, dk, 12), P.s, s * 0.165, 0.035, -0.08, 0, 0, H);
  const up = new Kit().add(fbox(0.16, 0.16, 0.14, body, 0.03), P.s, 0, 0.08, 0);
  up.add(lathe([[0.04, 0], [0.1, 0.03], [0.115, 0.15], [0.11, 0.45], [0.08, 0.55], [0.03, 0.58], [0.001, 0.58]], 12), P.grey, 0, 0.12, -0.02);
  up.add(fcyl(0.012, 0.36, body, 8), P.s, 0, 0.86, -0.03).add(ftor(0.045, 0.011, dk, PI, 5, 10), P.s, 0, 1.04, -0.03, H);
  for (let i = 0; i < 6; i++) up.add(ftor(0.05, 0.005, 0x1a1a1a, PI * 2, 4, 12), P.s, 0, 0.42 + i * 0.012, -0.14, R(-0.1, 0.1), 0, H + R(-0.05, 0.05));
  return k.kit(up, 0, 0.06, -0.06, 0, -0.18, 0);
}
function cardBox(w, h, d, lab) {
  return new Kit().add(sbox(w, h, d, { pz: lab ?? 0xa8845a, all: 0xa8845a }, 0.008), P.m, 0, h / 2, 0).add(fbox(0.05, 0.002, d + 0.004, 0xc0a06a), P.g, 0, h + 0.001, 0);
}
function linens(n = 4, w = 0.32, d = 0.25) {
  const k = new Kit(), m = [P.white, P.terry, P.sheet, P.grey, P.blanket];
  for (let i = 0; i < n; i++) k.add(roundedBox(w + R(-0.02, 0.02), 0.05, d + R(-0.02, 0.02), 0.022, 1), pickR(m), R(-0.01, 0.01), 0.025 + i * 0.048, R(-0.01, 0.01), R(-0.06, 0.06));
  return k;
}
function toolbox() {
  return new Kit().add(fbox(0.42, 0.16, 0.2, 0x7a2620, 0.01), P.k, 0, 0.08, 0).add(fbox(0.43, 0.012, 0.21, 0x6a201a, 0.004), P.k, 0, 0.12, 0)
    .add(ftor(0.07, 0.008, 0x1a1a1a, PI, 5, 10), P.s, 0, 0.16, 0).add(fbox(0.03, 0.03, 0.006, 0x9a9a9a), P.k, -0.12, 0.13, 0.102).add(fbox(0.03, 0.03, 0.006, 0x9a9a9a), P.k, 0.12, 0.13, 0.102);
}
function paintCan(lab = L.paint, drip = 0xd8d0c0) {
  return new Kit().add(flath([[0.001, 0], [0.085, 0], [0.085, 0.19], [0.08, 0.195], [0.001, 0.195]], 0xa0a0a0, 16), P.k)
    .add(fit(new THREE.CylinderGeometry(0.0862, 0.0862, 0.11, 16, 1, true, -1.2, 2.4), lab), P.m, 0, 0.09, 0).add(fbox(0.012, 0.08, 0.004, drip, 0.002), P.g, 0.03, 0.15, 0.084);
}

// ---------------------------------------------------------------- placement
// World coordinates throughout (see the layout in apartment.js). Clutter on the
// floor has no collider; only the furniture-sized pieces get one.
const one = (g, m, x, y, z, ry = 0, rx = 0, rz = 0, cast = true) => b.geo(g, m, { x, y, z, ry, rx, rz, cast });
const cord = (pts, r = 0.003, c = 0x161616) => one(tube(pts, r, c, Math.max(12, pts.length * 6), 4), P.s, 0, 0, 0, 0, 0, 0, false);
function bunny(x, z, s = 1, y = 0) {
  const k = new Kit();
  for (let i = 0; i < 4; i++) k.add(lump(R(0.015, 0.03) * s, R(0.008, 0.014) * s, R(0.015, 0.03) * s, i * 2.1, pickR([0x8a857c, 0x9a958a, 0x6e6a62])), P.m, R(-0.03, 0.03) * s, 0, R(-0.03, 0.03) * s);
  k.put(x, y, z, 0, { cast: false });
}

function entry() {
  // shoes kicked off under the hooks, one on its side
  shoe(0.29, 0x5e6268, { side: 1 }).put(6.48, 0, 7.42, 0.25);
  shoe(0.29, 0x5e6268, { side: -1 }).put(6.66, 0.052, 7.3, -0.7, { rz: 1.45 });
  shoe(0.3, 0x2e2018, { kind: 'loafer', sole: 0x1a1612, side: 1 }).put(6.83, 0, 7.45, 0.1);
  shoe(0.3, 0x2e2018, { kind: 'loafer', sole: 0x1a1612, side: -1 }).put(6.96, 0, 7.36, -0.25);
  umbrella().put(8.3, 0, 7.45, 0.4, { rx: 0.11 });
  jacket(P.khaki).put(6.87, 1.66, 7.57);
  cap().put(6.42, 1.62, 7.565, 0, { rx: -H });
  // the hall table: keys, a stack of envelopes nobody opens, the overflow on the floor
  let top = 0.72;
  const st = has('sideTable') && prop('sideTable', { x: 8.66, z: 7.34, ry: PI, fitH: 0.72 });
  if (st) top = st.size.y;
  else {
    one(fbox(0.45, 0.025, 0.34, 0x4a3220, 0.006), P.s, 8.66, 0.7075, 7.34);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) one(fcyl(0.016, 0.7, 0x4a3220, 8), P.s, 8.66 + sx * 0.19, 0.35, 7.34 + sz * 0.13);
    col(8.66, 0.36, 7.34, 0.45, 0.72, 0.34);
  }
  mailPile(9).put(8.6, top, 7.34, 0.25);
  one(sheet(L.notice), P.m, 8.7, top + 0.024, 7.36, 2.6, 0, 0, false);
  keys().put(8.8, top, 7.24, 0.8);
  mailPile(3, ['junk', 'bank', 'final'], 0.15).put(8.5, 0, 7.06, 0.5, { cast: false });
  // someone taped over the smoke detector
  smokeDetector().put(7.9, 2.7, 6.0, 0.3, { rx: PI });
}

function living() {
  // the TV corner: a dead plant, the CD tower, tapes, the console on the floor
  deadPlant().put(3.86, 0, 0.36, 0.6); col(3.86, 0.13, 0.36, 0.28, 0.26, 0.28);
  cdTower().put(3.66, 0, 1.66, H); col(3.66, 0.48, 1.66, 0.2, 0.96, 0.2);
  for (let i = 0; i < 5; i++) one(vhs(L.vhs[i]), P.m, 3.72 + R(-0.012, 0.012), 0.0125 + i * 0.0252, 1.99, H + R(-0.18, 0.18));
  one(vhs(null, true), P.m, 3.88, 1.146, 1.31, H + 0.3);
  gameConsole().put(4.32, 0.008, 1.36, H + 0.12);
  controller().put(4.55, 0.008, 1.78, 2.3);
  cord([[4.42, 0.03, 1.31], [4.47, 0.011, 1.34], [4.5, 0.011, 1.5], [4.46, 0.011, 1.64], [4.53, 0.014, 1.74]], 0.0022, 0x8a8a8e);
  for (const [c, o] of [[0xc8a830, 0], [0xd8d4cc, 0.007]]) cord([[4.23, 0.03, 1.42 + o], [4.15, 0.011, 1.44 + o], [4.1, 0.015, 1.4 + o], [4.095, 0.2, 1.36 + o], [4.07, 0.42, 1.28 + o], [4.0, 0.45, 1.24 + o]], 0.0025, c);
  outlet(true).put(3.522, 0.3, 0.55, H);
  cord([[3.56, 0.62, 0.86], [3.56, 0.4, 0.72], [3.55, 0.03, 0.62], [3.545, 0.15, 0.56], [3.545, 0.3, 0.55]]);
  // the coffee table: an ashtray, empties, a plate from last night
  const ct = 0.42;
  ashtray().put(5.08, ct, 0.82, 0.3);
  beer().put(4.78, ct, 0.8, 1); beer().put(5.14, ct, 1.6, 2);
  plate(0.1, 0xe0dccf, 6).put(4.92, ct, 1.22);
  one(crust(0.1), P.m, 4.95, ct + 0.009, 1.27, 2.2);
  fork().put(4.9, ct + 0.009, 1.2, 0.9);
  mug(0xb8b0a0, 0.25).put(5.13, ct, 1.17, 2);
  cigPack(true).put(4.77, ct, 1.62, 0.4);
  lighter().put(4.75, ct, 1.46, 1.3);
  // the floor round the sofa
  pizzaBox(true).put(5.5, 0.008, 1.9, 0.35);
  beer(L.beer, 0x3a200c, true).put(5.72, 0.008, 0.66, 1.1);
  beer().put(5.8, 0, 2.36);
  sodaCan(L.cola, true).put(4.45, 0.008, 0.55, 0.3);
  one(sheet(L.news, 0.3, 0.39), P.m, 5.25, 0.0015, 2.38, 0.4, 0, 0, false);
  one(sheet(L.news, 0.3, 0.39), P.m, 5.42, 0.003, 2.5, -0.3, 0, 0, false);
  one(sbox(0.21, 0.004, 0.275, { py: L.tvweek, all: 0xd8d4c4 }), P.m, 5.62, 0.01, 0.95, 0.4, 0, 0, false);
  one(sbox(0.21, 0.004, 0.275, { py: L.pcmag, all: 0xd8d4c4 }), P.m, 5.58, 0.014, 1.02, -0.2, 0, 0, false);
  laundryBasket().put(6.3, 0, 2.44, 0.1); col(6.3, 0.15, 2.44, 0.54, 0.3, 0.38, 0.1);
  // a blanket thrown over the arm, a towel drying on the radiator
  one(fold(0.7, 0.25, 0.35, 0.1, 6, 0.6), P.blanket, 6.3, 0.62, 0.31, H);
  one(fold(0.5, 0.3, 0.24, 0.085, 2), P.terry, 5.3, 0.69, 0.12, H);
  outlet(true).put(6.9, 0.3, 0.002, 0);
  cord([[6.75, 0.01, 2.45], [6.79, 0.004, 2.32], [6.82, 0.004, 1.6], [6.85, 0.004, 0.6], [6.89, 0.004, 0.12], [6.9, 0.1, 0.03], [6.9, 0.3, 0.025]]);
  // the home phone, one message waiting
  answeringMachine().put(5.82, 1.115, 7.36, PI);
  // on the bookshelf, under the dust
  one(sbox(0.32, 0.11, 0.19, { all: 0x3a3a40, py: 0x4a4a52 }, 0.004), P.s, 4.32, 1.855, 7.38, PI + 0.08);
  for (let i = 0; i < 4; i++) one(sbox(0.21, 0.005, 0.275, { py: pickR([L.tvweek, L.pcmag]), all: 0xd0ccbc }), P.m, 4.88, 1.8025 + i * 0.005, 7.36, R(-0.2, 0.2));
  bunny(6.25, 0.5); bunny(6.4, 1.9, 0.8); bunny(5.6, 0.07, 0.7); bunny(7.45, 0.1, 0.8); bunny(3.62, 0.6); bunny(9.2, 7.47, 0.8);
  web(3.52, 2.7, 0, 1, 1); web(10.2, 2.7, 7.6, -1, -1, 0.35);
}

function kitchen(apt) {
  // a day of dishes under the tap
  plate(0.11, 0xe0dccf, 4).put(9.88, 0.725, 2.09, 0, { rx: 0.1 });
  plate(0.11, 0xd6d0c2, 3).put(9.89, 0.747, 2.1, 1, { rx: 0.14 });
  plate(0.1, 0xc8c4b8, 2).put(9.87, 0.768, 2.08, 2, { rx: 0.08 });
  saucepan().put(9.82, 0.725, 1.8, 2.4, { rz: 0.2 });
  mug(0xa84a3a, 0.2).put(10.02, 0.73, 1.83, 1, { rz: 0.35 });
  fork().put(9.98, 0.728, 2.12, 0.4);
  // the counter: rack, soap, sponge, toaster, spices, towels, board
  dishRack().put(9.93, 0.92, 2.51);
  bottle(L.dish, 0x4a7a2a, 0.22).put(10.12, 0.92, 2.28, -H);
  one(fbox(0.09, 0.025, 0.06, 0xb8a040, 0.006), P.m, 9.74, 0.9325, 2.28, 0.2); one(fbox(0.09, 0.008, 0.06, 0x2e4a24, 0.003), P.m, 9.74, 0.949, 2.28, 0.2);
  toaster().put(10.03, 0.92, 1.38, PI);
  spiceRack().put(10.19, 1.17, 1.43, -H);
  paperTowel().put(9.98, 1.46, 2.72);
  one(fbox(0.3, 0.42, 0.018, 0x8e6844, 0.01), P.s, 10.155, 1.13, 2.87, -H, -0.12);
  // up on the cabinets and the fridge
  const ut = 2.18;
  one(cereal(L.cereal, 0xd8a83a), P.m, 10.05, ut + 0.14, 1.0, -H);
  one(cereal(L.bran, 0x5a3e22), P.m, 10.07, ut + 0.14, 1.23, -H + 0.12);
  canister(L.flour, 0.065, 0.2).put(10.03, ut, 2.22, -H);
  canister(L.sugar, 0.058, 0.17).put(10.03, ut, 2.38, -H + 0.2);
  canister(L.coffee, 0.05, 0.14).put(10.04, ut, 2.52, -H - 0.1);
  new Kit().add(flath([[0.001, 0], [0.12, 0], [0.125, 0.01], [0.125, 0.2], [0.12, 0.2], [0.118, 0.008], [0.001, 0.008]], 0x8a8a8c, 18), P.k).put(10.03, ut, 1.62);
  new Kit().add(lathe([[0.001, 0], [0.12, 0], [0.14, 0.12], [0.145, 0.13], [0.135, 0.13], [0.115, 0.01], [0.001, 0.01]], 16), P.wicker).put(10.04, ut, 2.85);
  one(cereal(L.cereal, 0xd8a83a), P.m, 9.62, 1.883, 0.085);
  // stove: a dish towel on the oven door; the utensil rail; fly strips
  one(fold(0.22, 0.27, 0.2, 0.014, 3), P.check, 9.536, 0.6, 3.45);
  utensilRail().put(10.19, 1.55, 4.15, -H);
  flyStrip(0.5).put(9.45, 2.7, 2.0, 0.5); flyStrip(0.42).put(9.5, 2.7, 5.6, 1.4);
  one(roundedBox(0.55, 0.008, 0.95, 0.003, 1), P.runner, 9.27, 0.004, 1.95, 0, 0, 0, false);
  // recycling nobody takes down, two pizza boxes against the wall
  recycleBin().put(9.98, 0, 6.32, H); col(9.98, 0.15, 6.32, 0.34, 0.3, 0.46);
  pizzaBox(false).put(10.16, 0.2, 6.75, 0, { rz: 1.4 });
  pizzaBox(false).put(10.1, 0.2, 6.73, 0.05, { rz: 1.3 });
  // kibble scattered round the bowl
  for (let i = 0; i < 16; i++) { const a = R(0, 6.28), r = R(0.1, 0.3), x = 9.95 + Math.cos(a) * r; if (x < 10.15) one(lump(0.006, 0.005, 0.005, i, 0x6a3e1c), P.m, x, 0, 4.95 + Math.sin(a) * r, R(0, 6), 0, 0, false); }
  // the table: the important mail, an ashtray
  mailPile(6, ['final', 'shut', 'due', 'rent', 'second', 'junk']).put(8.25, 0.764, 5.27, 0.5);
  ashtray(12).put(7.66, 0.764, 5.68);
  takeout().put(9.98, 1.19, 4.18, 0.4);
  fridgeDoor(apt);
}

// papers and magnets on the fridge doors (children of the moving panels)
function fridgeDoor(apt) {
  const fr = apt.fridge;
  const stick = (door, fill) => {
    const pn = door && door.panel; if (!pn) return;
    // the door slab is the panel's largest mesh; stick to whichever face looks into the room
    let slab = null, best = 0;
    for (const c of pn.children) { if (!c.isMesh) continue; c.geometry.computeBoundingBox(); const s = c.geometry.boundingBox.getSize(V3()); if (s.x * s.y > best) { best = s.x * s.y; slab = c; } }
    if (!slab) return;
    pn.updateMatrixWorld(true);
    const bb = slab.geometry.boundingBox, n = V3(0, 0, 1).transformDirection(pn.matrixWorld), out = n.x < 0 ? 1 : -1;
    const z0 = slab.position.z + (out > 0 ? bb.max.z : bb.min.z), k = new Kit();
    const at = (g, x, y, d, rot = 0) => k.add(g, P.m, x, y, z0 + out * d, out > 0 ? 0 : PI, 0, rot);
    const paper = (lab, w, h, x, y, rot, d) => { const g = fit(new THREE.PlaneGeometry(w, h, 1, 4), lab), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.max(0, 0.5 - p.getY(i) / h) ** 2 * 0.012); g.computeVertexNormals(); at(g, x, y, d, rot); };
    const magnet = (x, y, c, d) => { const g = fcyl(0.011, 0.007, c, 12); g.rotateX(H); at(g, x, y, d + 0.0035); };
    fill(paper, magnet);
    for (const m of k.meshes()) pn.add(m);
  };
  stick(fr && fr.door, (paper, magnet) => {
    paper(L.schedule, 0.15, 0.195, 0.17, 1.0, 0.04, 0.001); magnet(0.17, 1.08, 0xb02a22, 0.001);
    paper(L.menu, 0.11, 0.21, 0.42, 0.98, -0.05, 0.0015); magnet(0.42, 1.07, 0x2a5aa0, 0.0015);
    paper(L.vet, 0.1, 0.063, 0.2, 0.75, -0.09, 0.002); magnet(0.17, 0.77, 0xd8b02a, 0.002);
    paper(L.notice, 0.15, 0.19, 0.48, 0.42, 0.06, 0.0015); magnet(0.48, 0.5, 0x3a8a3a, 0.0015);
    magnet(0.12, 0.5, 0xd8d4c8, 0); magnet(0.55, 0.7, 0xb02a22, 0);
  });
  stick(fr && fr.freezer, (paper, magnet) => { paper(L.y2k, 0.09, 0.105, 0.22, 0.2, 0.05, 0.001); magnet(0.22, 0.24, 0xd8b02a, 0.001); });
}

function deskArea() {
  const t = 0.74;
  mug(0xd8d2c0, 0.35).put(4.02, t, 6.23, 2.5);
  ashtray(18).put(4.16, t, 6.19, 0.4);
  headset().put(4.1, t, 5.95, 0.3);
  mug(0x3a5a7a, 0.15, true).put(3.6, t, 5.05, 1);
  spindle().put(4.17, t, 5.08);
  one(sheet(L.paper), P.m, 3.95, t + 0.0006, 5.14, 0.15, 0, 0, false);
  one(sheet(L.memo), P.m, 3.9, t + 0.0018, 5.13, -0.12, 0, 0, false);
  L.floppy.slice(0, 3).forEach((f, i) => one(floppy(f), P.m, 3.86 + i * 0.02, t + 0.004 + i * 0.0034, 5.07, R(-0.5, 0.5)));
  one(disc(), P.m, 4.0, t + 0.0035, 5.13, 0.4);
  // notes on the monitor bezel
  const note = (lab, y, z, rot) => { const g = fit(new THREE.PlaneGeometry(0.07, 0.07), lab); g.rotateZ(rot); g.rotateY(H); one(g, P.m, 3.924, y, z, 0, 0, 0, false); };
  note(L.sticky[0], 1.15, 5.83, 0.1); note(L.sticky[1], 0.86, 5.48, -0.06); note(L.sticky[3], 0.865, 5.76, 0.08);
  // under the desk: power strip, cables, the bin
  powerStrip().put(3.6, 0, 5.82, H);
  outlet(true).put(3.522, 0.3, 5.62, H);
  cord([[3.6, 0.02, 5.66], [3.565, 0.01, 5.62], [3.545, 0.15, 5.6], [3.545, 0.3, 5.62]]);
  cord([[3.6, 0.06, 5.73], [3.58, 0.2, 5.62], [3.55, 0.5, 5.52], [3.54, 0.745, 5.48]]);
  cord([[3.6, 0.06, 5.78], [3.62, 0.02, 5.95], [3.57, 0.12, 6.0], [3.53, 0.25, 6.05]]);
  cord([[3.6, 0.06, 5.86], [3.56, 0.3, 5.9], [3.545, 0.745, 6.0]], 0.0025, 0xc8c0aa);
  wastebasket().put(4.06, 0, 6.12);
  sodaCan(L.cola, true).put(4.38, 0, 6.38, 0.5);
  // manuals nobody reads, stacked by the wall
  let y = 0;
  L.manual.forEach((m, i) => { const th = 0.026 + i * 0.008; one(sbox(0.19, th, 0.24, { py: m, nx: 0xd0c8b4, all: 0xc8c0a8 }), P.m, 3.7 + R(-0.015, 0.015), y + th / 2, 4.88, H + R(-0.25, 0.25)); y += th; });
}

function bedroom() {
  // a chair that only holds clothes
  const ch = has('chair') && prop('chair', { x: 3.1, z: 1.78, ry: -H });
  if (ch) {
    const seat = ch.size.y * 0.46;
    one(fold(0.42, 0.36, 0.42, 0.022, 4), P.flannel, 3.34, ch.size.y - 0.01, 1.78);
    one(roundedBox(0.3, 0.05, 0.3, 0.02, 1), P.denim, 3.08, seat + 0.025, 1.78, 0.1);
    for (const z of [1.7, 1.86]) one(sleeve([[2.96, seat + 0.03, z], [2.88, seat + 0.01, z - 0.01], [2.85, seat - 0.15, z - 0.02], [2.87, 0.1, z - 0.04], [2.92, 0.03, z - 0.1]], P.denim, 0.05), P.denim, 0, 0, 0);
  }
  floorFan().put(0.62, 0, 0.52, 0.25); col(0.62, 0.1, 0.52, 0.32, 0.2, 0.32);
  outlet(true).put(0.002, 0.3, 0.7, H);
  cord([[0.62, 0.01, 0.52], [0.3, 0.004, 0.6], [0.04, 0.004, 0.68], [0.025, 0.15, 0.7], [0.025, 0.3, 0.7]]);
  // laundry: a pile in the corner, more on the floor, slippers by the bed
  const pile = new Kit(); heap(pile, 13, 0, 0, 0, 0.2, 0.15, 0.13, [P.white, P.grey, P.navy, P.denim, P.flannel, P.terry], 11);
  pile.add(sleeve([[0.15, 0.1, 0.05], [0.3, 0.04, 0.0], [0.42, 0.015, -0.1]], P.grey, 0.035), P.grey); pile.put(0.36, 0, 3.3);
  one(lump(0.2, 0.05, 0.14, 3), P.denim, 2.35, 0, 3.02, 0.6);
  one(lump(0.17, 0.04, 0.13, 8), P.grey, 1.98, 0.008, 3.27, 2);
  one(sleeve([[1.55, 0.024, 2.98], [1.6, 0.024, 3.03], [1.66, 0.026, 3.02], [1.72, 0.024, 3.07]], P.white, 0.016), P.white, 0, 0, 0);
  shoe(0.27, 0x4e4034, { kind: 'slipper', sole: 0x2a2420, side: 1 }).put(1.72, 0.008, 3.14, 0.15);
  shoe(0.27, 0x4e4034, { kind: 'slipper', sole: 0x2a2420, side: -1 }).put(1.88, 0.008, 3.2, -0.1);
  // the nightstand: stale water, the sleeping pills, books on the shelf below
  glassWater(0.4).put(0.38, 0.56, 1.18);
  pillBottle().put(0.41, 0.56, 1.29, 2.2);
  for (let i = 0; i < 4; i++) one(fcyl(0.0045, 0.003, 0xe8e6e0, 8), P.s, 0.36 + R(-0.03, 0.03), 0.5615, 1.24 + R(-0.03, 0.03));
  [[0.15, 0.028, 0.22, 0x3a2a4a], [0.14, 0.022, 0.2, 0x6a2a22], [0.13, 0.03, 0.19, 0x2a4a3a]].reduce((y, [w, th, d, c]) => { one(book(w, th, d, c), P.m, 0.27, y + th / 2, 1.15, H + R(-0.2, 0.2)); return y + th; }, 0.147);
  [0x8a2a22, 0x2a3a5a, 0xc8b070, 0x3a3a3a].reduce((y, c) => { one(book(0.11, 0.022, 0.175, c), P.m, 0.28, y + 0.011, 0.62, R(-0.4, 0.4)); return y + 0.022; }, 0);
  // the long mirror, turned to the wall under a sheet
  new Kit().add(sheetOver(0.5, 1.48, 0.05, 3, 0.1), P.sheet).add(fbox(0.06, 0.04, 0.05, 0x3a2a1c, 0.005), P.s, 0.21, 0.02, 0).add(fbox(0.12, 0.03, 0.004, 0x9aa4a8), P.g, 0.14, 0.035, 0.0262)
    .put(2.25, 0, 3.41, PI);
  // on the wardrobe
  cardBox(0.45, 0.3, 0.4, L.box[4]).put(3.06, 1.995, 0.55, -H + 0.1);
  one(lump(0.3, 0.12, 0.15, 2), P.navy, 3.08, 1.995, 1.08, 0.2);
  bunny(0.6, 2.0); bunny(1.5, 1.75); bunny(1.9, 2.75, 0.8); bunny(0.15, 3.5, 0.6);
  web(0, 2.7, 3.6, 1, -1);
}

function bathroom() {
  const sh = 1.18; // the shelf under the mirror
  toothCup().put(2.02, sh, 3.795);
  toothpaste().put(2.27, sh, 3.8, 0.15);
  pillBottle().put(2.4, sh, 3.79, 0.6); pillBottle().put(2.14, sh, 3.78, 2.0);
  one(fbox(0.012, 0.008, 0.11, 0x2a4a8a, 0.003), P.s, 2.33, sh + 0.004, 3.81, 1.4);
  decal('crack', 2.38, 1.81, 3.744, 0.16, 0.16, 'z', 0);
  one(fbox(0.075, 0.022, 0.048, 0xcabc98, 0.01), P.s, 2.0, 0.923, 3.86, 0.4);
  const hk = new Kit(); hair(hk, 2.22, 0.9135, 4.04, 7, 0.06); hair(hk, 0.4, 0.603, 5.39, 3, 0.1); hk.put(0, 0, 0, 0, { cast: false });
  bottle(L.shampoo[0], 0x4a6a4a).put(0.16, 0.6, 5.39, PI);
  bottle(L.shampoo[1], 0xd0ccc0, 0.18).put(0.27, 0.6, 5.385, PI + 0.5);
  bottle(L.shampoo[2], 0xb07a84, 0.17).put(0.62, 0.6, 5.39, PI - 0.3);
  tpHolder().put(1.85, 0.64, 6.2, PI);
  tpRoll().put(1.29, 0.8175, 6.12); tpRoll().put(1.31, 0.9175, 6.13, 0.3);
  plunger().put(1.8, 0, 5.98);
  hamper().put(3.1, 0, 5.93, 0.3); col(3.1, 0.3, 5.93, 0.38, 0.6, 0.38);
  one(fold(0.45, 0.45, 0.4, 0.012, 5), P.terry, 2.75, 1.25, 6.17, -H);
  bathBin().put(1.72, 0, 3.92);
  one(sbox(0.21, 0.004, 0.275, { py: L.pcmag, all: 0xd8d4c4 }), P.m, 1.85, 0.002, 5.6, 0.5, 0, 0, false);
  web(3.4, 2.7, 3.72, -1, 1, 0.35);
}

function closet() {
  vacuum().put(2.12, 0, 7.38, PI); col(2.12, 0.3, 7.4, 0.32, 0.6, 0.28);
  cardBox(0.42, 0.28, 0.32, L.box[0]).put(1.75, 1.5125, 6.53, 0.05);
  cardBox(0.38, 0.22, 0.3, L.box[1]).put(2.32, 1.5125, 6.52, -0.06);
  cardBox(0.25, 0.18, 0.28, L.box[3]).put(2.8, 1.5125, 6.52, 0.1);
  linens(4).put(1.65, 1.0125, 6.52); linens(3, 0.3, 0.24).put(2.12, 1.0125, 6.52, 0.1);
  for (let i = 0; i < 2; i++) one(sbox(0.06, 0.11, 0.06, { all: 0xd8c84a, pz: 0xe8e0c0 }), P.m, 2.78 + i * 0.07, 1.0675, 6.5, R(-0.2, 0.2));
  toolbox().put(0.82, 0.5125, 6.52);
  paintCan().put(1.22, 0.5125, 6.5); paintCan(L.paint, 0x8aa0b8).put(1.4, 0.5125, 6.56, 1);
  one(ftor(0.045, 0.02, 0x86847e, PI * 2, 6, 16), P.g, 1.58, 0.5325, 6.5, 0, H);
  shoe(0.3, 0x3a2a1c, { kind: 'boot', sole: 0x1a1612, side: 1 }).put(0.6, 0, 6.52, 0.1);
  shoe(0.3, 0x3a2a1c, { kind: 'boot', sole: 0x1a1612, side: -1 }).put(0.8, 0.06, 6.5, -0.4, { rz: 1.4 });
  one(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 14), P.navy, 2.0, 0.12, 6.52, 0, 0, H);
  for (const x of [1.88, 2.12]) one(ftor(0.122, 0.006, 0x1a1a1a, PI * 2, 4, 16), P.s, x, 0.12, 6.52, H);
  web(0, 2.7, 7.6, 1, -1); web(3.4, 2.7, 6.32, -1, 1, 0.3);
}

function grime() {
  // floors: the path worn in from the door, spills, stains
  decal('dirt', 7.65, 0, 6.95, 1.2, 0.9); decal('scuff', 7.45, 0, 7.2, 0.6, 0.45); decal('dirt', 6.0, 0, 4.6, 1.4, 1.1); decal('scuff', 6.9, 0, 3.6, 0.7, 0.6);
  decal('spill', 5.55, 0.008, 1.45, 0.32, 0.28); decal('ring', 5.12, 0.42, 1.4, 0.08, 0.08); decal('ring', 4.86, 0.42, 0.86, 0.075, 0.075);
  decal('dirt', 9.3, 0, 3.4, 0.7, 0.6); decal('spill', 9.2, 0, 0.95, 0.32, 0.26); decal('dirt', 9.7, 0, 5.85, 0.7, 0.7); decal('stain', 9.75, 0, 5.15, 0.4, 0.5); decal('ring', 9.72, 0.92, 1.12, 0.085, 0.085);
  decal('scuff', 4.6, 0, 5.65, 0.9, 0.9); decal('ring', 4.17, 0.74, 5.7, 0.085, 0.085); decal('ring', 4.13, 0.74, 5.92, 0.08, 0.08);
  decal('spill', 2.4, 0, 2.95, 0.32, 0.26); decal('dirt', 2.9, 0, 3.0, 0.8, 0.7);
  decal('stain', 1.4, 0, 5.78, 0.55, 0.45); decal('dirt', 2.2, 0, 4.5, 0.7, 0.6); decal('mould', 0.82, 0, 5.3, 0.25, 0.4); decal('dirt', 1.7, 0, 7.0, 1.3, 0.6); decal('dust', 0.7, 0, 6.6, 0.5, 0.4);
  // dust on the tops nobody wipes
  decal('dust', 9.84, 1.743, 0.43, 0.6, 0.66, 'y', 0); decal('dust', 3.82, 1.13, 1.1, 0.38, 0.56, 'y', 0); decal('dust', 3.09, 1.995, 0.75, 0.6, 1.2, 'y', 0);
  decal('dust', 10.03, 2.18, 1.95, 0.32, 2.15, 'y', 0); decal('dust', 4.6, 1.8, 7.36, 0.85, 0.34, 'y', 0); decal('dust', 5.82, 1.115, 7.33, 1.0, 0.45, 'y', 0);
  // walls: hands round the switches, kicks by the door, grease, damp; scratches low down
  decal('smudge', 7.02, 1.25, 7.6, 0.2, 0.22, '-z'); decal('smudge', 10.2, 1.25, 4.62, 0.2, 0.22, '-x'); decal('smudge', 3.4, 1.25, 2.35, 0.2, 0.22, '-x'); decal('smudge', 3.4, 1.25, 4.85, 0.2, 0.22, '-x'); decal('smudge', 3.4, 1.25, 7.42, 0.2, 0.22, '-x');
  decal('scuff', 6.75, 0.2, 7.6, 0.8, 0.3, '-z', 0); decal('scratch', 8.33, 0.18, 7.6, 0.16, 0.24, '-z', 0); decal('scratch', 3.2, 0.16, 3.6, 0.14, 0.22, '-z', 0.1); decal('scratch', 3.52, 0.15, 6.4, 0.12, 0.2, 'x', -0.05);
  decal('drip', 10.2, 1.25, 3.45, 0.75, 0.6, '-x', 0); decal('dirt', 10.2, 1.0, 3.45, 0.8, 0.25, '-x', 0);
  decal('dirt', 3.52, 1.25, 1.1, 0.8, 0.35, 'x', 0); decal('dirt', 0, 0.92, 2.25, 0.9, 0.3, 'x', 0); decal('smudge', 3.52, 0.95, 5.2, 0.3, 0.25, 'x');
  for (const x of [5.3, 7.7, 1.7]) decal('drip', x, 0.78, 0, 1.15, 0.14, 'z', 0);
  // the bathroom: mould along the tub, a leak from upstairs
  decal('mould', 0, 0.67, 4.57, 1.6, 0.16, 'x', 0); decal('mould', 0.375, 0.68, 3.72, 0.7, 0.16, 'z', 0); decal('smudge', 2.2, 1.02, 3.72, 0.4, 0.15, 'z', 0);
  decal('stain', 0.5, 2.7, 4.7, 0.9, 0.8, '-y'); decal('mould', 0.22, 2.7, 3.95, 0.45, 0.45, '-y'); decal('mould', 0, 2.45, 3.9, 0.3, 0.4, 'x');
  // ceilings: smoke over the sofa, a leak over the table, the closet
  decal('dirt', 9.88, 0.9026, 3.45, 0.55, 0.66, 'y', 0); decal('dust', 5.75, 0.008, 1.0, 0.25, 0.2);
  for (const [x, z] of [[5.62, 1.05], [5.7, 1.7], [5.4, 0.7]]) decal('spill', x, 0.008, z, 0.028, 0.028);
  decal('dirt', 6.0, 2.7, 1.4, 1.6, 1.3, '-y'); decal('stain', 8.4, 2.7, 6.5, 1.0, 0.85, '-y'); decal('stain', 2.6, 2.7, 6.9, 0.6, 0.55, '-y');
}

// ---------------------------------------------------------------- entry point
// Called from Apartment.build() with its Builder, before the statics are merged.
export function dress(apt, builder) {
  b = builder; rnd = mulberry32(19990701);
  mats(); labels();
  entry(); living(); kitchen(apt); deskArea(); bedroom(); bathroom(); closet(); grime();
  tex.needsUpdate = true;
}
