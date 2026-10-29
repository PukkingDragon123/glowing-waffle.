// Harborview Towers, 4th floor: the dressing. Door hardware, wiring and fire
// gear, water damage, peeling paper, stains and junk that make the corridor,
// the trash room, the stairwell and the elevator read as a real building left
// to rot since 1999. Static pieces merge through the Builders (bS for anything
// on the south wall, which can vanish); hardware on a swinging door merges per
// door. Printed text shares one atlas, the dirt another. No pictures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { patchWorld } from '../core/engine.js';
import { lathe, softBox } from '../gfx/shapes.js';
import { boxGeo, roundedBox } from '../gfx/geo.js';
import * as T from '../gfx/textures.js';
import { RNG, clamp, smoothstep, hash2 } from '../core/util.js';
import * as F from './furniture.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI, HP = Math.PI / 2;
export const PLATE_Y = 1.7;   // number plates sit above the peephole

// ------------------------------------------------------------- small helpers
// crisp texels up close, mipmapped far away
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = T.toTexture(c, { nearest: true, repeat, srgb });
  if (!repeat) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const bundle = (p, normal, ws) => ({ map: tex(p.canvas), normalMap: p.height ? tex(T.normalFromHeight(p.height, p.w, p.h, normal), { srgb: false }) : null, worldSize: ws });

function mat(name, o = {}, b = null) {
  const m = new THREE.MeshStandardMaterial({
    name: 'hd.' + name, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, envMapIntensity: 0.5,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: !o.transparent, side: o.side ?? THREE.FrontSide,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emi ?? 1,
  });
  if (b) { m.map = b.map; if (b.normalMap && o.normal !== 0) { m.normalMap = b.normalMap; m.normalScale.set(o.normal ?? 1, o.normal ?? 1); } m.userData.ws = b.worldSize || 1; }
  if (o.map) m.map = o.map;
  if (o.emissiveMap) m.emissiveMap = o.emissiveMap;
  if (o.decal) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
  if (o.emi !== undefined) m.userData.emi = o.emi;
  patchWorld(m, { snap: true, warp: true, breath: o.breath ?? true });
  m.userData.matte = true;
  return m;
}

// position/normal/uv only, non-indexed, so anything merges with anything
function clean(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}
const _e = new THREE.Euler(), _m4 = new THREE.Matrix4();
function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { g.applyMatrix4(_m4.makeRotationFromEuler(_e.set(rx, ry, rz, 'YXZ')).setPosition(x, y, z)); return g; }
function merge(list) { const g = mergeGeometries(list.map(clean), false); g.computeBoundingSphere(); return g; }
// a solid rod from a to b
function rod(a, b, r, seg = 6, r2 = r) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r2, r, L, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
// a pipe along a polyline, with bent (not mitred) corners
function pipe(pts, r, bend = 0.05, seg = 7) {
  const parts = [];
  let from = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], last = i === pts.length - 1;
    const dir = p.clone().sub(pts[i - 1]).normalize();
    const end = last ? p : p.clone().addScaledVector(dir, -bend);
    parts.push(rod(from, end, r, seg));
    if (!last) {
      const out = p.clone().addScaledVector(pts[i + 1].clone().sub(p).normalize(), bend);
      parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(end, p.clone(), out), 4, r, seg, false));
      from = out;
    }
  }
  return merge(parts);
}
// a quad mapped onto a sub-rectangle of an atlas
function card(w, h, rect) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  return g;
}
// remap a geometry's 0..1 uvs into an atlas rect
function inRect(g, rect) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + clamp(uv.getX(i)) * (rect[2] - rect[0]), rect[1] + clamp(uv.getY(i)) * (rect[3] - rect[1])); return g; }
// a lumpy little stone / dust ball / chunk
function lump(r, seed, sq = 1, rough = 0.25, det = 1) {
  const g = new THREE.IcosahedronGeometry(r, det), p = g.attributes.position, v = new THREE.Vector3(), rng = new RNG(seed);
  const a = rng.range(0, 6), b = rng.range(0, 6);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const k = 1 + rough * (Math.sin(n.x * 5 + a) * Math.sin(n.z * 4 + b) + 0.6 * Math.sin(n.y * 7 + a * b)); v.multiplyScalar(k); v.y *= sq; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
const NC = { collide: false, cast: false };
const bx = (bb, x, y, z, w, h, d, m, o = {}) => bb.box(x, y, z, w, h, d, m, { ...NC, ...o });
const gm = (bb, g, m, o = {}) => bb.geo(g, m, { cast: false, ...o });

// ------------------------------------------------------------- atlases
// shelf-packed canvas: add() draws a cell and returns its uv rect
class Atlas {
  constructor(S) { const { c, ctx } = T.makeCanvas(S, S); this.c = c; this.ctx = ctx; this.S = S; this.x = 0; this.y = 0; this.row = 0; this.r = {}; }
  add(key, w, h, draw, pad = 4) {
    if (this.x + w > this.S) { this.x = 0; this.y += this.row; this.row = 0; }
    if (this.y + h > this.S) console.warn('atlas full', key);
    const x = this.x, y = this.y, c = this.ctx;
    c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, w, h); c.clip(); draw(c, w, h, x, y); c.restore();
    this.x += w + pad; this.row = Math.max(this.row, h + pad);
    const S = this.S, e = 0.5;
    return (this.r[key] = [(x + e) / S, 1 - (y + h - e) / S, (x + w - e) / S, 1 - (y + e) / S]);
  }
  tex() { return this._t || (this._t = tex(this.c, { repeat: false })); }
}
// per-pixel fill of an atlas cell: fn(u, v, px, py, o) with o = [r, g, b, a]
function cellPix(c, ox, oy, w, h, fn) {
  const img = c.getImageData(ox, oy, w, h), d = img.data, o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    o[0] = o[1] = o[2] = o[3] = 0;
    fn((x + 0.5) / w, (y + 0.5) / h, x, y, o);
    const i = (y * w + x) * 4; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = clamp(o[3], 0, 1) * 255;
  }
  c.putImageData(img, ox, oy);
}
// yellow, foxed, handled paper
function age(c, ox, oy, w, h, amt, seed) {
  const img = c.getImageData(ox, oy, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, n = T.tf(x / w * 4, y / h * 4, 4, 4, 3, seed);
    const k = 1 - amt * smoothstep(0.4, 0.9, n) - (hash2(x + seed * 13, y) - 0.5) * amt * 0.35;
    d[i] *= k; d[i + 1] *= k * 0.97; d[i + 2] *= k * 0.9;
  }
  c.putImageData(img, ox, oy);
}
function txt(c, s, x, y, size, color, { font = 'Arial, Helvetica, sans-serif', bold = '700', align = 'center', sp = 0 } = {}) {
  c.font = `${bold} ${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color;
  if ('letterSpacing' in c) c.letterSpacing = sp + 'px';
  c.fillText(s, x, y);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
}
const lines = (c, w, h, y0, y1, gap, color, seed, margin = 6) => { const r = new RNG(seed); c.fillStyle = color; for (let y = y0; y < y1; y += gap) { const L = w - margin * 2 - (r.chance(0.2) ? r.range(10, w * 0.4) : 0); c.fillRect(margin, y, L, 1); } };

// every printed thing on the floor: plain text, no pictures
function signsAtlas() {
  const A = new Atlas(1024);
  A.add('pull', 64, 96, (c, w, h, ox, oy) => {
    c.fillStyle = '#a81812'; c.fillRect(0, 0, w, h);
    txt(c, 'FIRE', w / 2, 16, 19, '#f4efe4', { bold: '900' });
    c.fillStyle = '#7a0e0a'; c.fillRect(8, 34, w - 16, 30);
    txt(c, 'PULL', w / 2, 74, 11, '#f4efe4', { bold: '900' }); txt(c, 'DOWN', w / 2, 86, 11, '#f4efe4', { bold: '900' });
    age(c, ox, oy, w, h, 0.25, 3);
  });
  A.add('intercom', 96, 160, (c, w, h, ox, oy) => {
    c.fillStyle = '#cfc5ad'; c.fillRect(0, 0, w, h);
    txt(c, 'HOUSE PHONE', w / 2, 12, 9, '#3a3228');
    c.fillStyle = '#b8ad94'; c.fillRect(14, 22, w - 28, 50);
    txt(c, 'TALK', 22, 98, 7, '#3a3228'); txt(c, 'LISTEN', w / 2, 98, 7, '#3a3228'); txt(c, 'DOOR', w - 22, 98, 7, '#3a3228');
    txt(c, 'PRESS AND HOLD', w / 2, 128, 7, '#3a3228', { bold: '400' });
    txt(c, 'SUPT.  APT 1A', w / 2, 142, 8, '#3a3228');
    age(c, ox, oy, w, h, 0.45, 5);
  });
  A.add('plaque', 160, 112, (c, w, h, ox, oy) => {
    c.fillStyle = '#ece6d6'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#a81812'; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
    txt(c, 'IN CASE OF FIRE', w / 2, 28, 15, '#a81812', { bold: '900' });
    txt(c, 'USE STAIRS', w / 2, 54, 15, '#15120e', { bold: '900' });
    txt(c, 'DO NOT USE ELEVATOR', w / 2, 80, 11, '#15120e', { bold: '900' });
    age(c, ox, oy, w, h, 0.3, 7);
  });
  A.add('cert', 256, 352, (c, w, h, ox, oy) => {
    c.fillStyle = '#e9e1c8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#6a6250'; c.lineWidth = 2; c.strokeRect(8, 8, w - 16, h - 16); c.strokeRect(12, 12, w - 24, h - 24);
    const L = [['STATE OF NEW JERSEY', 13, 34], ['DEPARTMENT OF COMMUNITY AFFAIRS', 9, 52], ['ELEVATOR SAFETY UNIT', 9, 66], ['CERTIFICATE OF OPERATION', 15, 98]];
    for (const [s, z, y] of L) txt(c, s, w / 2, y, z, '#1c1a16', { bold: '900', font: 'Times New Roman, serif' });
    const rows = [['PREMISES', 'HARBORVIEW TOWERS'], ['ADDRESS', '412 GRAND ST, JERSEY CITY'], ['DEVICE NO.', 'E-0419   CAR 1'], ['TYPE', 'PASSENGER, HYDRAULIC'], ['CAPACITY', '1500 LBS   10 PERSONS'], ['FLOORS SERVED', '4'], ['LAST INSPECTED', '07 / 01 / 1999'], ['EXPIRES', '07 / 01 / 1999']];
    rows.forEach(([k, v], i) => { txt(c, k, 26, 134 + i * 22, 9, '#3a372e', { align: 'left' }); txt(c, v, 126, 134 + i * 22, 10, '#11100c', { align: 'left', font: 'Courier New, monospace', bold: '700' }); });
    c.fillStyle = '#3a372e'; c.fillRect(30, 318, 86, 1); c.fillRect(140, 318, 86, 1);
    txt(c, 'INSPECTOR', 73, 328, 7, '#3a372e'); txt(c, 'MUST BE POSTED IN CAR', 183, 328, 7, '#3a372e');
    c.fillStyle = '#2a2a6a'; c.font = 'italic 14px Times New Roman, serif'; c.textAlign = 'center'; c.fillText('R. Okafor', 73, 310);
    age(c, ox, oy, w, h, 0.4, 11);
  });
  A.add('capacity', 192, 40, (c, w, h) => {
    c.fillStyle = '#9a9890'; c.fillRect(0, 0, w, h); c.fillStyle = '#c4c2ba'; c.fillRect(2, 2, w - 4, 1);
    txt(c, 'CAPACITY 1500 LBS', w / 2, 14, 12, '#1e1e1c', { bold: '900' }); txt(c, '10 PERSONS  ·  NO SMOKING', w / 2, 29, 9, '#1e1e1c');
  });
  const names = { '4A': '', '4B': 'BENGRIM', '4C': 'M. ALVAREZ', '4D': 'KOWALSKI', '4E': 'OKAFOR', '4F': 'DIMARCO', '4G': 'PATEL' };
  for (const [k, n] of Object.entries(names)) A.add('name' + k, 128, 40, (c, w, h, ox, oy) => {
    c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h);
    if (n) txt(c, n, w / 2, h / 2 + 1, 15, '#1a1814', { font: 'Courier New, monospace', bold: '700' });
    else { c.fillStyle = '#b8b0a0'; c.fillRect(6, 4, 40, 10); c.fillRect(w - 50, h - 14, 44, 9); }   // tape where a name was
    age(c, ox, oy, w, h, 0.5, k.charCodeAt(1));
  });
  A.add('news', 256, 96, (c, w, h, ox, oy) => {
    c.fillStyle = '#d6d0c0'; c.fillRect(0, 0, w, h);
    txt(c, 'The Jersey Journal', w / 2, 15, 18, '#151410', { font: 'Times New Roman, serif', bold: '900' });
    c.fillStyle = '#151410'; c.fillRect(6, 27, w - 12, 1); c.fillRect(6, 38, w - 12, 1);
    txt(c, 'THURSDAY, JULY 1, 1999      50 CENTS', w / 2, 33, 7, '#151410');
    txt(c, 'BLAST ACROSS THE RIVER', w / 2, 50, 14, '#151410', { bold: '900' });
    for (let k = 0; k < 4; k++) { c.save(); c.translate(6 + k * 62, 0); lines(c, 58, h, 62, h - 4, 3, '#55524a', 40 + k, 0); c.restore(); }
    age(c, ox, oy, w, h, 0.3, 13);
  });
  A.add('menu', 128, 256, (c, w, h, ox, oy) => {
    c.fillStyle = '#efe6d0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a8140e'; c.fillRect(0, 0, w, 54);
    txt(c, 'GOLDEN WOK', w / 2, 20, 17, '#f6e6b0', { bold: '900' });
    txt(c, 'CHINESE & AMERICAN', w / 2, 40, 9, '#f6e6b0');
    txt(c, 'FREE DELIVERY', w / 2, 70, 12, '#a8140e', { bold: '900' });
    txt(c, '(201) 555-0188', w / 2, 88, 12, '#1a1814', { bold: '900' });
    txt(c, 'OPEN 7 DAYS  11AM - 11PM', w / 2, 104, 7, '#1a1814');
    for (const [y, s] of [[124, 'APPETIZERS'], [168, 'SOUPS'], [208, 'CHEF SPECIALS']]) { txt(c, s, 8, y, 8, '#a8140e', { align: 'left', bold: '900' }); lines(c, w, h, y + 8, y + 36, 5, '#5a564c', y, 8); }
    age(c, ox, oy, w, h, 0.25, 17);
  });
  A.add('chute', 192, 112, (c, w, h, ox, oy) => {
    c.fillStyle = '#e6dcc0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
    txt(c, 'TRASH CHUTE', w / 2, 24, 20, '#111', { bold: '900' });
    txt(c, 'BAGGED TRASH ONLY', w / 2, 50, 11, '#111');
    txt(c, 'NO BOXES · NO GLASS', w / 2, 68, 11, '#111');
    txt(c, 'NO LIT CIGARETTES', w / 2, 86, 11, '#a81812', { bold: '900' });
    age(c, ox, oy, w, h, 0.6, 19);
  });
  A.add('firedoor', 192, 96, (c, w, h, ox, oy) => {
    c.fillStyle = '#a81812'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2ece0'; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10);
    txt(c, 'FIRE DOOR', w / 2, 34, 22, '#f2ece0', { bold: '900' }); txt(c, 'KEEP CLOSED', w / 2, 64, 17, '#f2ece0', { bold: '900' });
    age(c, ox, oy, w, h, 0.35, 21);
  });
  A.add('extStrip', 192, 32, (c, w, h) => { c.fillStyle = '#a81812'; c.fillRect(0, 0, w, h); txt(c, 'FIRE EXTINGUISHER', w / 2, h / 2 + 1, 14, '#f2ece0', { bold: '900' }); });
  A.add('stair', 192, 160, (c, w, h, ox, oy) => {
    c.fillStyle = '#1e3a74'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8e8e0'; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10);
    txt(c, 'STAIR  A', w / 2, 26, 15, '#e8e8e0', { bold: '900' });
    txt(c, 'FLOOR', w / 2, 52, 13, '#e8e8e0'); txt(c, '4', w / 2, 88, 46, '#e8e8e0', { bold: '900' });
    txt(c, 'NO ROOF ACCESS', w / 2, 126, 12, '#e8e8e0', { bold: '900' }); txt(c, 'LOBBY IS 4 FLOORS DOWN', w / 2, 144, 8, '#e8e8e0');
    age(c, ox, oy, w, h, 0.35, 23);
  });
  A.add('roof', 160, 64, (c, w, h, ox, oy) => {
    c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a81812'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
    txt(c, 'NO ROOF ACCESS', w / 2, 22, 14, '#a81812', { bold: '900' }); txt(c, 'BY ORDER OF MGMT.', w / 2, 44, 10, '#111');
    age(c, ox, oy, w, h, 0.5, 25);
  });
  A.add('notice', 192, 256, (c, w, h, ox, oy) => {
    c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, h);
    txt(c, 'NOTICE', w / 2, 26, 26, '#111', { bold: '900' });
    c.fillStyle = '#111'; c.fillRect(16, 44, w - 32, 2);
    const t = ['THIS UNIT HAS BEEN', 'SECURED BY ORDER OF', 'THE MANAGEMENT.', '', 'DO NOT ENTER.', 'DO NOT REMOVE CHAIN.', '', 'ANY PERSON FOUND', 'INSIDE WILL BE', 'REPORTED.', '', 'HARBORVIEW MGMT.'];
    t.forEach((s, i) => txt(c, s, w / 2, 66 + i * 15, 11, '#111', { font: 'Courier New, monospace', bold: '700' }));
    c.fillStyle = 'rgba(210,200,160,0.7)'; c.fillRect(0, 0, 34, 12); c.fillRect(w - 34, 0, 34, 12);   // tape
    age(c, ox, oy, w, h, 0.45, 27);
  });
  A.add('wet', 128, 192, (c, w, h, ox, oy) => {
    c.fillStyle = '#e2b014'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#16140e'; c.fillRect(0, 0, w, 40);
    txt(c, 'CAUTION', w / 2, 21, 22, '#e2b014', { bold: '900' });
    txt(c, 'WET', w / 2, 74, 28, '#16140e', { bold: '900' }); txt(c, 'FLOOR', w / 2, 104, 28, '#16140e', { bold: '900' });
    c.fillStyle = '#16140e'; c.fillRect(14, 126, w - 28, 2);
    txt(c, 'CUIDADO', w / 2, 146, 15, '#16140e', { bold: '900' }); txt(c, 'PISO MOJADO', w / 2, 166, 15, '#16140e', { bold: '900' });
    age(c, ox, oy, w, h, 0.4, 29);
  });
  A.add('tape', 512, 24, (c, w, h) => {
    c.fillStyle = '#dcb018'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 128) txt(c, 'CAUTION  DO NOT ENTER', x + 64, h / 2 + 1, 12, '#111', { bold: '900' });
  });
  A.add('tag', 64, 96, (c, w, h, ox, oy) => {
    c.fillStyle = '#ece8e0'; c.fillRect(0, 0, w, h);
    ['UNDER PENALTY', 'OF LAW THIS', 'TAG NOT TO BE', 'REMOVED', '', 'ALL NEW', 'MATERIAL'].forEach((s, i) => txt(c, s, w / 2, 10 + i * 12, 7, '#222'));
    age(c, ox, oy, w, h, 0.6, 31);
  });
  return A;
}

// stains, rings, drips, scuffs, scratches, torn paper: alpha decals
function decalAtlas() {
  const A = new Atlas(512);
  const n2 = (u, v, f, s) => T.tf(u * f, v * f, f, f, 3, s);
  const ring = (seed, inner) => (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2 * (0.82 + 0.4 * n2(u, v, 5, seed));
    if (r > 1.08) return;
    const fill = 0.2 * smoothstep(0.15, 1, r), tide = 0.6 * Math.exp(-(((r - 0.97) / 0.035) ** 2)), t2 = inner * Math.exp(-(((r - 0.7) / 0.03) ** 2)) + inner * 0.6 * Math.exp(-(((r - 0.45) / 0.025) ** 2));
    const a = (fill + tide + t2) * (0.7 + 0.5 * n2(u, v, 16, seed + 3));
    const k = tide + t2 > fill ? 0.62 : 1;
    o[0] = 126 * k; o[1] = 88 * k; o[2] = 46 * k; o[3] = a;
  });
  A.add('ringA', 128, 128, ring(41, 0.4)); A.add('ringB', 128, 128, ring(43, 0.25));
  // a ragged patch of bare plaster where the paper came away, with a torn white lip
  const peel = (seed) => (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    const e = Math.max(Math.abs(u - 0.5) * 2.1, Math.abs(v - 0.5) * 2.1) + (n2(u, v, 4, seed) - 0.5) * 0.7 + (n2(u, v, 18, seed + 1) - 0.5) * 0.18;
    if (e > 1) return;
    const lip = smoothstep(0.86, 0.98, e), m = n2(u, v, 9, seed + 2), st = smoothstep(0.55, 0.8, n2(u, v, 3, seed + 5));
    let r = 128 + m * 26, g = 120 + m * 22, b = 102 + m * 16;
    r -= st * 60; g -= st * 72; b -= st * 80;                  // water has been through it
    if (hash2(x + seed, y) > 0.97) { r *= 0.6; g *= 0.6; b *= 0.6; }
    o[0] = r + (192 - r) * lip; o[1] = g + (184 - g) * lip; o[2] = b + (160 - b) * lip; o[3] = 1;
  });
  A.add('peelA', 128, 128, peel(51)); A.add('peelB', 96, 128, peel(53));
  // streaks running down from a leak
  const drip = (seed) => (c, w, h, ox, oy) => { const r = new RNG(seed); const st = Array.from({ length: 7 }, () => [r.range(0.15, 0.85), r.range(0.35, 1), r.range(0.015, 0.05), r.range(0.25, 0.6), r.range(0, 6)]); cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    let a = 0.5 * smoothstep(0.3, 0, v) * n2(u, v, 6, seed);
    for (const [cx, L, wd, s, ph] of st) a += s * Math.exp(-(((u - cx - 0.03 * Math.sin(v * 9 + ph)) / wd) ** 2)) * smoothstep(L, L - 0.12, v) * (1 + 0.6 * smoothstep(L - 0.06, L - 0.01, v));
    a *= 0.75 + 0.5 * n2(u, v, 12, seed + 9);
    o[0] = 92; o[1] = 64; o[2] = 36; o[3] = a;
  }); };
  A.add('dripA', 64, 192, drip(61)); A.add('dripB', 64, 192, drip(63));
  // stencilled floor number, worn, with runs under the strokes
  A.add('four', 128, 160, (c, w, h, ox, oy) => {
    const { ctx } = T.makeCanvas(w, h);
    ctx.fillStyle = '#000'; ctx.font = '900 150px Arial Black, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('4', w / 2, 84);
    ctx.clearRect(0, 100, w, 5); ctx.clearRect(58, 0, 5, 70);                                  // stencil bridges
    const src = ctx.getImageData(0, 0, w, h).data, al = (x, y) => src[(y * w + x) * 4 + 3];
    const r = new RNG(71), drips = Array.from({ length: 9 }, () => [r.int(10, w - 10), r.range(8, 36)]);
    cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
      let a = al(x, y) / 255;
      if (a < 0.5) for (const [dx, L] of drips) if (x === dx) { let yy = y; while (yy > 0 && al(dx, yy) < 128) yy--; if (yy > 0 && y - yy < L) a = 0.8 * (1 - (y - yy) / L); }
      a *= smoothstep(0.18, 0.4, n2(u, v, 10, 73)) * (0.75 + 0.25 * hash2(x, y + 7));
      o[0] = 20; o[1] = 20; o[2] = 22; o[3] = a;
    });
  });
  // claw gouges: bright cores (paint torn through) with dark lips
  const scratch = (seed, n, len) => (c, w, h, ox, oy) => { const r = new RNG(seed); const sc = Array.from({ length: n }, (_, i) => [0.2 + i * 0.6 / n + r.range(-0.03, 0.03), r.range(0.02, 0.15), r.range(len * 0.7, len), r.range(-0.12, 0.12)]); cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    let core = 0, lip = 0;
    for (const [x0, y0, L, sl] of sc) { if (v < y0 || v > y0 + L) continue; const t = (v - y0) / L, cx = x0 + sl * t + 0.02 * Math.sin(t * 5 + seed), d = Math.abs(u - cx) * w, wd = 1.6 * Math.sin(PI * Math.min(1, t * 1.1)) + 0.3; core = Math.max(core, smoothstep(wd, wd * 0.3, d)); lip = Math.max(lip, smoothstep(wd + 1.6, wd, d) * (u > cx ? 1 : 0.4)); }
    if (core > 0.1) { o[0] = 196; o[1] = 178; o[2] = 150; o[3] = core * 0.9; } else { o[0] = 18; o[1] = 14; o[2] = 10; o[3] = lip * 0.55; }
  }); };
  A.add('scratchA', 128, 128, scratch(81, 4, 0.8)); A.add('scratchB', 64, 64, scratch(83, 3, 0.75));
  A.add('smudge', 64, 64, (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => { const r = Math.hypot((u - 0.5) * 1.6, v - 0.5) * 2 + (n2(u, v, 5, 85) - 0.5) * 0.6; o[0] = 36; o[1] = 30; o[2] = 24; o[3] = 0.42 * smoothstep(1, 0.2, r) * (0.5 + n2(u, v, 14, 86)); }));
  // black rubber marks from carts, shoes and dragged bags
  const scuff = (seed) => (c, w, h, ox, oy) => { const r = new RNG(seed); const st = Array.from({ length: 9 }, () => [r.range(0.05, 0.75), r.range(0.15, 0.85), r.range(0.05, 0.3), r.range(0.04, 0.12), r.range(-0.4, 0.4), r.range(0.25, 0.7)]); cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    let a = 0;
    for (const [u0, v0, L, th, sl, s] of st) { if (u < u0 || u > u0 + L) continue; const t = (u - u0) / L; a = Math.max(a, s * Math.exp(-(((v - v0 - sl * (u - u0)) / th) ** 2)) * Math.sin(PI * t) ** 0.4); }
    o[0] = 20; o[1] = 18; o[2] = 16; o[3] = a * (0.6 + 0.6 * n2(u, v, 20, seed));
  }); };
  A.add('scuffA', 128, 32, scuff(91)); A.add('scuffB', 128, 32, scuff(93)); A.add('scuffC', 128, 32, scuff(95));
  // dark stains: old, soaked in, wider at the tide line
  const blob = (seed, col) => (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2 + (n2(u, v, 4, seed) - 0.5) * 0.9 + (n2(u, v, 15, seed + 1) - 0.5) * 0.15;
    if (r > 1) return;
    o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = (0.5 + 0.3 * smoothstep(0.7, 0.95, r)) * smoothstep(1, 0.93, r) * (0.75 + 0.4 * n2(u, v, 22, seed + 2));
  });
  A.add('blobA', 64, 64, blob(101, [34, 22, 14])); A.add('blobB', 64, 64, blob(103, [48, 12, 8]));
  A.add('puddle', 96, 64, (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => { const r = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) + (n2(u, v, 3, 105) - 0.5) * 0.7; o[0] = 14; o[1] = 12; o[2] = 10; o[3] = 0.55 * smoothstep(1, 0.8, r); }));
  // black mould blooming up from a wet baseboard
  A.add('mold', 64, 64, (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => { const d = n2(u, v, 6, 107) * smoothstep(0, 0.9, v) * smoothstep(0, 0.25, Math.min(u, 1 - u)); const sp = hash2(x * 3 + 1, y * 7) < d * 0.9 ? 1 : 0; o[0] = 24; o[1] = 28; o[2] = 20; o[3] = sp * 0.85 + d * 0.25; }));
  // contact shadow / grime along a wall foot (v=1 at the wall)
  A.add('grime', 64, 64, (c, w, h, ox, oy) => cellPix(c, ox, oy, w, h, (u, v, x, y, o) => { o[0] = 30; o[1] = 24; o[2] = 18; o[3] = Math.pow(v, 2.2) * 0.7 * (0.55 + 0.6 * n2(u, v, 7, 109)); }));
  return A;
}

// ------------------------------------------------------------- procedural textures
// 1" white hex mosaic with grey grout and a scatter of black dots
function hexTiles() {
  const S = 256, cols = 14, W = S / cols, RH = S / 16;
  const p = T.paint(S, S, (x, y, o) => {
    let d1 = 1e9, d2 = 1e9, cc = 0, rr = 0;
    const r0 = Math.floor(y / RH);
    for (let r = r0 - 1; r <= r0 + 2; r++) {
      const off = (r & 1) ? W / 2 : 0, c0 = Math.floor((x - off) / W);
      for (let cI = c0 - 1; cI <= c0 + 2; cI++) {
        const d = Math.hypot(x + 0.5 - (cI * W + off), y + 0.5 - r * RH);
        if (d < d1) { d2 = d1; d1 = d; cc = ((cI % cols) + cols) % cols; rr = ((r % 16) + 16) % 16; } else if (d < d2) d2 = d;
      }
    }
    const e = d2 - d1, n = T.tf(x / S * 4, y / S * 4, 4, 4, 3, 7), fine = T.tf(x / S * 32, y / S * 32, 32, 32, 2, 8);
    // yellowed white, the odd tile replaced or stained, black ones only here and there
    let c = [178, 172, 156];
    if (cc % 7 === 3 && rr % 8 === 1) c = [44, 44, 46];
    else if (hash2(cc + 50, rr) > 0.9) c = hash2(cc, rr + 9) > 0.5 ? [150, 138, 112] : [196, 192, 182];
    let k = (0.9 + hash2(cc * 7 + 1, rr * 13 + 3) * 0.12) * (0.84 + 0.16 * smoothstep(1.3, 3.6, e)) * (0.88 + fine * 0.16);
    if (e < 1.4) { c = [74, 66, 56]; k = 0.7 + 0.5 * fine; }
    k *= 1 - 0.3 * smoothstep(0.45, 0.85, n);
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
    o[4] = e < 1.4 ? 0.1 : 0.3 + 0.6 * smoothstep(1.2, 3.4, e);
  }, { height: true });
  return bundle(p, 2.2, 0.5);
}

// fissured mineral-fibre ceiling tile, one tile per texture
function acousticTex() {
  const S = 128;
  const p = T.paint(S, S, (x, y, o) => {
    const u = x / S, v = y / S, n = T.tf(u * 12, v * 12, 12, 12, 2, 111), m = T.tf(u * 3, v * 3, 3, 3, 3, 113);
    const fis = Math.abs(n - 0.5) < 0.014 ? 1 : 0, pit = hash2(x + 3, y * 5) > 0.985 ? 1 : 0, edge = Math.min(x, y, S - 1 - x, S - 1 - y);
    let k = (0.92 + 0.08 * hash2(x, y)) * (1 - 0.25 * fis - 0.3 * pit) * (1 - 0.18 * smoothstep(0.5, 0.9, m)) * (edge < 3 ? 0.8 : 1);
    o[0] = 208 * k; o[1] = 202 * k; o[2] = 188 * k; o[4] = 0.7 - fis * 0.4 - pit * 0.3 - (edge < 3 ? 0.3 : 0);
  }, { height: true });
  return bundle(p, 1.4, 0.6);
}

// striped mattress ticking, quilted, and stained through
function tickingTex() {
  const W = 128, H = 256, r = new RNG(121);
  const st = Array.from({ length: 6 }, () => [r.range(0.15, 0.85), r.range(0.1, 0.9), r.range(0.08, 0.22), r.chance(0.35)]);
  const p = T.paint(W, H, (x, y, o) => {
    const u = x / W, v = y / H, n = T.tf(u * 6, v * 12, 6, 12, 3, 123);
    const stripe = (x % 10) < 2 ? 1 : 0, qx = (x + y * 0.5) % 32, qy = (x - y * 0.5 + 640) % 32, seam = Math.min(qx, 32 - qx, qy, 32 - qy);
    let c = stripe ? [146, 152, 160] : [210, 204, 186];
    let k = 0.86 + 0.14 * smoothstep(0, 5, seam);
    for (const [cx, cy, rad, dark] of st) {
      const d = Math.hypot((u - cx) * 0.5, v - cy) / rad + (n - 0.5) * 0.8;
      if (d < 1) { const tide = smoothstep(0.75, 0.97, d), s = dark ? 0.55 : 0.32; c = [c[0] * (1 - s) + (dark ? 70 : 170) * s, c[1] * (1 - s) + (dark ? 40 : 126) * s, c[2] * (1 - s) + (dark ? 26 : 58) * s]; k *= 1 - tide * 0.25; }
    }
    k *= 1 - 0.2 * smoothstep(0.55, 0.9, n);
    o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[4] = 0.3 + 0.6 * smoothstep(0, 6, seam);
  }, { height: true });
  return bundle(p, 2, 1);
}

// a wraparound diffuser seen from below: two tubes, end caps, dead flies
function lensCanvas(kind, seed) {
  const W = 128, H = 32, r = new RNG(seed);
  const bugs = Array.from({ length: kind === 'dead' ? 6 : 12 }, () => [r.chance(0.6) ? r.range(2, 22) : r.range(106, 126), r.range(4, 28), r.range(0.6, 1.6)]);
  const p = T.paint(W, H, (x, y, o) => {
    const tube = (cy) => Math.exp(-(((y + 0.5 - cy) / 4.2) ** 2));
    const end = smoothstep(0, 9, Math.min(x, W - 1 - x));
    let a = 0.55 + 0.45 * tube(9), b2 = 0.55 + 0.45 * tube(23);
    if (kind === 'half') b2 = 0.22 + 0.08 * tube(23);
    let k = Math.max(a, b2) * (0.45 + 0.55 * end);
    if (kind !== 'dead') { const burn = Math.min(x, W - 1 - x) < 14 ? 0.5 + 0.5 * smoothstep(5, 14, Math.min(x, W - 1 - x)) : 1; k *= kind === 'half' ? burn : 1; }
    if (kind === 'dead') k = 0.3 + 0.08 * tube(9) - 0.12 * (1 - end);
    k *= ((x + y) & 1) ? 0.96 : 1;                                   // prism texture
    for (const [bx0, by0, rad] of bugs) if (Math.hypot(x - bx0, y - by0) < rad) k *= 0.18;
    k *= 0.9 + 0.1 * T.tf(x / W * 4, y / H * 2, 4, 2, 2, seed);
    const v = clamp(k) * 255; o[0] = v; o[1] = v * 0.99; o[2] = v * 0.96;
  });
  return tex(p.canvas, { repeat: false });
}
export function lensMat(kind = 'ok', seed = 1) {
  const t = lensCanvas(kind, seed);
  if (kind === 'dead') return mat('lensDead' + seed, { map: t, rough: 0.5, color: 0xb8b4aa });
  return mat('lens' + seed, { map: t, emissiveMap: t, color: 0xf2fff2, emissive: 0xd8ffe0, emi: 1.6, rough: 0.6, breath: false });
}
export function lensGeo() { return roundedBox(1.2, 0.05, 0.27, 0.018); }

function exitCanvas() {
  const W = 128, H = 64, { c, ctx } = T.makeCanvas(W, H), { c: e, ctx: ex } = T.makeCanvas(W, H);
  ctx.fillStyle = '#c6c0b4'; ctx.fillRect(0, 0, W, H); ex.fillStyle = '#1a0a08'; ex.fillRect(0, 0, W, H);
  for (const [g, col] of [[ctx, '#e0281c'], [ex, '#ffffff']]) {
    g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8);
    g.fillStyle = col; g.font = '900 34px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '3px';
    g.fillText('EXIT', W / 2 + 1, H / 2 + 2);
    g.beginPath(); g.moveTo(12, H / 2); g.lineTo(20, H / 2 - 7); g.lineTo(20, H / 2 + 7); g.fill();
  }
  return { map: tex(c, { repeat: false }), emi: tex(e, { repeat: false }) };
}

const plateCache = {};
// engraved brass apartment number, two screws
export function plateMat(n) {
  if (plateCache[n]) return plateCache[n];
  const W = 96, H = 48, { c } = T.makeCanvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#d2ae58'); gr.addColorStop(0.55, '#b48c3e'); gr.addColorStop(1, '#7e5e24');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ecd28c'; g.fillRect(0, 0, W, 2); g.fillRect(0, 0, 2, H);
  g.fillStyle = '#4e3812'; g.fillRect(0, H - 2, W, 2); g.fillRect(W - 2, 0, 2, H);
  for (const sx of [10, W - 10]) { g.fillStyle = '#5e461a'; g.beginPath(); g.arc(sx, H / 2, 4, 0, PI * 2); g.fill(); g.fillStyle = '#c8a860'; g.fillRect(sx - 3, H / 2 - 0.5, 6, 1); }
  g.font = '700 28px Georgia, Times New Roman, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ecd28c'; g.fillText(n, W / 2 + 1, H / 2 + 2);
  g.fillStyle = '#24170a'; g.fillText(n, W / 2, H / 2 + 1);
  T.ageCanvas(g, W, H, 0.3, n.charCodeAt(1));
  return (plateCache[n] = mat('plate' + n, { map: tex(c, { repeat: false }), rough: 0.38, metal: 0.4 }));
}

// ------------------------------------------------------------- materials
let MM = null;
export function hdMats() {
  if (MM) return MM;
  const A = signsAtlas(), D = decalAtlas(), ex = exitCanvas();
  MM = {
    A, D,
    brass: mat('brass', { rough: 0.36, metal: 0.5, normal: 0.25 }, T.metal({ seed: 61, base: [186, 144, 74] })),
    brassDark: mat('brassDark', { rough: 0.55, metal: 0.35, normal: 0.4 }, T.metal({ seed: 62, base: [128, 96, 50], rust: 0.3 })),
    steel: mat('steel', { rough: 0.42, metal: 0.55, normal: 0.3 }, T.metal({ seed: 63, base: [176, 176, 172] })),
    galv: mat('galv', { rough: 0.62, metal: 0.3, normal: 0.3 }, T.metal({ seed: 64, base: [138, 140, 134], rust: 0.12 })),
    rail: mat('rail', { rough: 0.5, metal: 0.2 }, T.enamel({ seed: 66, base: [44, 52, 46], dirt: 0.6 })),
    white: mat('white', { rough: 0.55 }, T.enamel({ seed: 67, base: [206, 200, 182], dirt: 0.6 })),
    red: mat('red', { rough: 0.42 }, T.enamel({ seed: 68, base: [156, 26, 20], dirt: 0.45 })),
    yellow: mat('yellow', { rough: 0.5 }, T.enamel({ seed: 69, base: [210, 168, 30], dirt: 0.6 })),
    ivory: mat('ivory', { rough: 0.45 }, T.beigePlastic({ seed: 70, base: [212, 202, 176] })),
    black: mat('black', { color: 0x0b0b0c, rough: 0.55 }),
    backing: mat('backing', { color: 0x7c705a, rough: 1 }),
    tile: mat('hexTile', { rough: 0.42, normal: 1 }, hexTiles()),
    acoustic: mat('acoustic', { rough: 1, normal: 0.7 }, acousticTex()),
    runBorder: mat('runBorder', { rough: 1, normal: 1 }, T.carpet({ seed: 73, base: [40, 16, 18], pattern: false, worldSize: 0.6 })),
    runAccent: mat('runAccent', { rough: 1, normal: 0.6 }, T.carpet({ seed: 74, base: [120, 86, 46], pattern: false, worldSize: 0.6 })),
    binding: mat('binding', { color: 0x1a120e, rough: 0.9 }),
    coir: mat('coir', { rough: 1, normal: 1.4 }, T.carpet({ seed: 75, base: [112, 84, 52], pattern: false, worldSize: 0.25 })),
    rubber: mat('rubber', { color: 0x141414, rough: 0.85 }),
    bag: mat('bag', { color: 0x131316, rough: 0.24 }),
    bagWhite: mat('bagWhite', { color: 0xcfccc2, rough: 0.32 }),
    terracotta: mat('terracotta', { rough: 0.92, normal: 0.8 }, T.concrete({ seed: 76, base: [146, 78, 52], worldSize: 0.6 })),
    soil: mat('soil', { color: 0x221912, rough: 1 }),
    dry: mat('dry', { color: 0x5a4832, rough: 1 }),
    dust: mat('dust', { color: 0x7c766a, rough: 1 }),
    paint: mat('stairPaint', { rough: 0.35 }, T.enamel({ seed: 78, base: [64, 78, 70], dirt: 0.7 })),
    mattress: mat('mattress', { rough: 1, normal: 0.9 }, tickingTex()),
    plastic: mat('plastic', { color: 0x98a4ae, rough: 0.22, transparent: true, opacity: 0.55, breath: false }),
    signs: mat('signs', { map: A.tex(), rough: 0.72 }),
    decal: mat('decal', { map: D.tex(), rough: 0.9, transparent: true, decal: true }),
    wet: mat('wet', { map: D.tex(), rough: 0.04, transparent: true, decal: true }),
    water: mat('water', { color: 0x1c1a16, rough: 0.04, metal: 0.1 }),
    led: mat('led', { color: 0x200000, emissive: 0xff1a10, emi: 2.5, breath: false }),
    exit: mat('exit', { map: ex.map, emissiveMap: ex.emi, emissive: 0xff2618, emi: 2.6, rough: 0.5 }),
  };
  return MM;
}
const R = (k) => hdMats().A.r[k];
const DR = (k) => hdMats().D.r[k];

// a decal quad laid on a surface. face: 'n' (+z) 's' (-z) 'e' (-x) 'w' (+x) 'up' 'down'
const FACE = { n: [0, 0, 0], s: [0, PI, 0], e: [0, -HP, 0], w: [0, HP, 0], up: [-HP, 0, 0], down: [HP, 0, 0] };
function decal(bb, key, x, y, z, w, h, face, spin = 0, m = null) {
  const [rx, ry] = FACE[face], g = card(w, h, DR(key));
  if (spin) g.rotateZ(spin);
  gm(bb, g, m || hdMats().decal, { x, y, z, rx, ry, receive: true });
}
function sign(bb, key, x, y, z, w, h, face, spin = 0) {
  const [rx, ry] = FACE[face], g = card(w, h, R(key));
  if (spin) g.rotateZ(spin);
  gm(bb, g, hdMats().signs, { x, y, z, rx, ry });
}

// ------------------------------------------------------------- hall floor
// hex tile floor, a bound carpet runner down the middle, wear and dirt
export function hallFloor(b, h) {
  const mm = hdMats();
  b.floor(h, mm.tile);
  const x0 = h.x0 + 0.16, x1 = h.x1 - 0.16, L = x1 - x0, xc = (x0 + x1) / 2, zc = (h.z0 + h.z1) / 2, W = 1.36, t = 0.008;
  const bind = 0.014, bord = 0.07, acc = 0.016, field = W - 2 * (bind + bord + acc);
  bx(b, xc, t / 2, zc, L, t, field + 0.002, M.hallCarpet, { receive: true });
  for (const s of [-1, 1]) {
    bx(b, xc, t / 2, zc + s * (field / 2 + acc / 2), L, t, acc, mm.runAccent);
    bx(b, xc, t / 2, zc + s * (field / 2 + acc + bord / 2), L, t, bord, mm.runBorder);
    const bg = new THREE.CylinderGeometry(0.0075, 0.0075, L, 6); bg.rotateZ(HP); bg.scale(1, 0.85, 1);
    gm(b, bg, mm.binding, { x: xc, y: 0.005, z: zc + s * (W / 2 - bind / 2) });
    const be = new THREE.CylinderGeometry(0.0075, 0.0075, W, 6); be.rotateX(HP); be.scale(1, 0.85, 1);
    gm(b, be, mm.binding, { x: s < 0 ? x0 : x1, y: 0.005, z: zc });
  }
  // the wear: one plane of flattened, greyed pile and old spills over the whole runner
  const wg = new THREE.PlaneGeometry(L, W - 0.03); wg.rotateX(-HP);
  const wmat = mat('wear', { map: wearTex(x0, L, zc, W - 0.03), rough: 1, transparent: true, decal: true });
  gm(b, wg, wmat, { x: xc, y: t + 0.0006, z: zc });
  // dirt packed into the tile where the mop never reaches
  for (const [z, s] of [[h.z0, 1], [h.z1, -1]]) {
    const g = card(L + 0.3, 0.2, DR('grime')); g.rotateX(-HP); if (s > 0) g.rotateY(PI);
    gm(b, g, mm.decal, { x: xc, y: 0.0012, z: z + s * 0.1 });
  }
}
function wearTex(x0, L, zc, W) {
  const w = 1024, hh = 64, { c, ctx } = T.makeCanvas(w, hh), img = ctx.createImageData(w, hh), d = img.data;
  const doors = [[-3.17, -1], [7.65, -1], [12.72, -1], [16.8, -1], [2.22, 1], [7.65, 1], [12.02, 1], [15.6, 1]];
  const stains = [[12.55, 8.55, 0.18, 0], [-4.8, 9.1, 0.26, 1], [3.1, 8.9, 0.12, 0], [9.4, 8.6, 0.1, 1], [-5.9, 8.7, 0.2, 0], [17.6, 9.0, 0.14, 1], [13.8, 8.45, 0.3, 2]];
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) / w * L, z = zc - W / 2 + (j + 0.5) / hh * W;
    const n = T.tf(i / w * 96, j / hh * 6, 96, 6, 3, 131), n2 = T.tf(i / w * 400, j / hh * 24, 400, 24, 2, 133);
    const lane = Math.exp(-(((z - zc - 0.07 * Math.sin(x * 0.5)) / 0.26) ** 2)) * (x < 8.2 ? 1 : 0.6);
    let wear = lane;
    for (const [dx, side] of doors) wear += (dx === 7.65 ? 1.1 : 0.55) * Math.exp(-(((x - dx) / 0.32) ** 2)) * smoothstep(-0.2, 0.7, side * (z - zc) + 0.1);
    let a = clamp(wear * (0.5 + 0.7 * n) - 0.18) * 0.5, col = [176, 150, 140];
    for (const [sx, sz, sr, kind] of stains) {
      const dd = Math.hypot(x - sx, (z - sz) * 1.3) / sr + (n2 - 0.5) * 0.7 + (n - 0.5) * 0.5;
      if (dd < 1) { const sa = (kind === 2 ? 0.6 : 0.42) * smoothstep(1, 0.85, dd) * (0.8 + 0.4 * smoothstep(0.7, 0.95, dd)); if (sa > a * 0.6) { col = kind === 1 ? [22, 8, 6] : [30, 22, 14]; a = Math.max(a, kind === 1 ? sa * 1.35 : sa); } }
    }
    const q = (j * w + i) * 4;
    d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = clamp(a * (0.85 + 0.3 * n2)) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------- walls
// raised-panel mouldings on the wainscot and a proper baseboard with a bead
export function wainscotDetail(bb, z, nz, segs) {
  for (const [a0, a1] of segs) {
    const len = a1 - a0; if (len < 0.3) continue;
    const xc = (a0 + a1) / 2;
    bx(bb, xc, 0.075, z + nz * 0.012, len, 0.15, 0.024, M.trimWood, { receive: true });
    const bead = new THREE.CylinderGeometry(0.008, 0.008, len, 6); bead.rotateZ(HP);
    gm(bb, bead, M.trimWood, { x: xc, y: 0.15, z: z + nz * 0.02 });
    const shoe = new THREE.CylinderGeometry(0.011, 0.011, len, 5, 1, false, 0, PI); shoe.rotateZ(HP);
    gm(bb, shoe, M.woodDark, { x: xc, y: 0.0, z: z + nz * 0.024 });
    const n = Math.max(1, Math.round(len / 0.8)), pw = len / n;
    for (let k = 0; k < n; k++) {
      const p0 = a0 + k * pw + 0.075, p1 = a0 + (k + 1) * pw - 0.075, w = p1 - p0, y0 = 0.24, y1 = 0.8, zz = z + nz * 0.022;
      if (w < 0.12) continue;
      for (const y of [y0, y1]) gm(bb, softBox(w + 0.02, 0.02, 0.012, 0.004), M.woodDark, { x: (p0 + p1) / 2, y, z: zz });
      for (const x of [p0, p1]) gm(bb, softBox(0.02, y1 - y0 - 0.02, 0.012, 0.004), M.woodDark, { x, y: (y0 + y1) / 2, z: zz });
    }
  }
}

// a fluorescent fixture's pan and end caps; kind 'open' has no lens and bare tubes
export function fluoroHousing(b, x, y, z, kind = 'lens') {
  const mm = hdMats();
  gm(b, softBox(1.3, 0.028, 0.34, 0.008), mm.white, { x, y: y - 0.014, z });
  for (const s of [-1, 1]) gm(b, softBox(0.028, 0.06, 0.3, 0.006), mm.white, { x: x + s * 0.618, y: y - 0.045, z });
  if (kind === 'dead') gm(b, lensGeo(), mm.lensDead || (mm.lensDead = lensMat('dead', 7)), { x, y: y - 0.052, z });
  if (kind === 'open') {
    // the lens fell out years ago: one tube gone grey, one hanging from a socket
    for (const s of [-1, 1]) for (const e of [-1, 1]) gm(b, softBox(0.03, 0.04, 0.03, 0.006), mm.white, { x: x + e * 0.585, y: y - 0.05, z: z + s * 0.07 });
    const t1 = new THREE.CylinderGeometry(0.013, 0.013, 1.14, 10); t1.rotateZ(HP);
    gm(b, t1, mm.white, { x, y: y - 0.062, z: z - 0.07 });
    const t2 = new THREE.CylinderGeometry(0.013, 0.013, 1.14, 10); t2.translate(0, -0.57, 0);
    gm(b, t2, mm.white, { x: x + 0.57, y: y - 0.062, z: z + 0.07, rz: -1.32 });
    for (const e of [-1, 1]) { const cap = new THREE.CylinderGeometry(0.0135, 0.0135, 0.04, 10); cap.rotateZ(HP); gm(b, cap, mm.black, { x: x + e * 0.55, y: y - 0.062, z: z - 0.07 }); }
  }
}

// ------------------------------------------------------------- doors
// brass and dark bits for one door, merged by material and hung on its panel.
// face: which side of the panel faces the hall (+1 = local +z)
export function doorKit(door, o = {}) {
  const mm = hdMats(), w = door.w, t = door.t, hh = door.h, f = o.face ?? 1, RX = f * HP;
  const parts = new Map();
  const put = (m, g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push(at(g, x, y, z, rx, ry, rz)); };
  const faceY = f > 0 ? 0 : PI;
  const kick = o.kick === 'steel' ? mm.steel : mm.brass, metal = o.metal === 'steel' ? mm.steel : mm.brass;
  if (o.plate) {
    put(mm.brassDark, softBox(0.18, 0.098, 0.009, 0.003), w / 2, PLATE_Y, f * 0.0225);
    door.panel.traverse((m) => { if (m.isMesh && m.geometry.type === 'PlaneGeometry') { m.position.set(w / 2, PLATE_Y, f * 0.0275); m.rotation.y = faceY; } });
  }
  if (o.peep) {
    put(metal, lathe([[0.016, 0], [0.016, 0.003], [0.012, 0.007], [0.0075, 0.008], [0.0065, 0.004], [0.0005, 0.004]], 14), w / 2, 1.55, f * 0.018, RX);
    put(mm.black, new THREE.CylinderGeometry(0.0064, 0.0064, 0.002, 12), w / 2, 1.55, f * 0.0215, RX);
  }
  if (o.bolt) {
    put(metal, lathe([[0.028, 0], [0.028, 0.002], [0.025, 0.005], [0.0005, 0.0055]], 18), w - 0.07, 1.15, f * t / 2, RX);
    put(metal, lathe([[0.0175, 0], [0.0175, 0.012], [0.0155, 0.015], [0.0005, 0.0155]], 16), w - 0.07, 1.15, f * (t / 2 + 0.004), RX);
    put(mm.black, new THREE.BoxGeometry(0.0028, 0.012, 0.002), w - 0.07, 1.152, f * (t / 2 + 0.0195));
  }
  if (o.inside) {
    put(metal, lathe([[0.028, 0], [0.028, 0.002], [0.025, 0.005], [0.0005, 0.0055]], 18), w - 0.07, 1.15, -f * t / 2, -RX);
    put(metal, softBox(0.01, 0.036, 0.014, 0.003), w - 0.07, 1.15, -f * (t / 2 + 0.011));
    put(metal, lathe([[0.012, 0], [0.012, 0.02], [0.014, 0.022], [0.0005, 0.024]], 12), w / 2, 1.55, -f * 0.018, -RX);
  }
  if (o.kick) put(kick, softBox(w - 0.05, 0.2, 0.0025, 0.0008), w / 2, 0.112, f * (t / 2 + 0.00125));
  if (o.wreath) {
    // an over-the-door hook with nothing hanging on it
    put(mm.brassDark, new THREE.BoxGeometry(0.022, 0.05, 0.0015), w / 2, hh - 0.025, -f * (t / 2 + 0.001));
    put(mm.brassDark, new THREE.BoxGeometry(0.022, 0.0015, t + 0.004), w / 2, hh + 0.001, 0);
    put(mm.brassDark, new THREE.BoxGeometry(0.022, 0.3, 0.0015), w / 2, hh - 0.15, f * (t / 2 + 0.001));
    const hook = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, -0.03, 0.006), V(0, -0.04, 0.026), V(0, -0.024, 0.04)].map((p) => { p.z *= f; return p; })), 8, 0.003, 5, false);
    put(mm.brassDark, hook, w / 2, hh - 0.3, f * (t / 2 + 0.001));
  }
  if (o.push) {
    // panic bar on the push side, pull handle and closer on the stair side
    const zf = f * (t / 2);
    put(mm.steel, softBox(0.17, 0.085, 0.05, 0.012), w - 0.13, 1.0, zf + f * 0.025);
    put(mm.steel, softBox(0.05, 0.07, 0.045, 0.01), 0.12, 1.0, zf + f * 0.022);
    const bar = new THREE.CylinderGeometry(0.016, 0.016, w - 0.36, 12); bar.rotateZ(HP);
    put(mm.steel, bar, 0.12 + (w - 0.36) / 2 + 0.02, 1.0, zf + f * 0.04);
    put(mm.black, softBox(0.12, 0.05, 0.004, 0.002), w - 0.13, 1.0, zf + f * 0.051);
    const zb = -f * (t / 2);
    const grip = new THREE.CylinderGeometry(0.013, 0.013, 0.26, 10); put(mm.steel, grip, w - 0.09, 1.0, zb - f * 0.05);
    for (const s of [-1, 1]) put(mm.steel, new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), w - 0.09, 1.0 + s * 0.11, zb - f * 0.025, HP);
    put(mm.rail, softBox(0.3, 0.06, 0.06, 0.01), 0.24, hh - 0.08, zb - f * 0.03);
    put(mm.steel, new THREE.BoxGeometry(0.2, 0.02, 0.012), 0.42, hh - 0.06, zb - f * 0.065, 0, 0.25 * f);
  }
  if (o.sign) { const g = card(o.sign[1], o.sign[2], R(o.sign[0])); if (f < 0) g.rotateY(PI); put(mm.signs, g, w / 2, o.sign[3], f * (t / 2 + 0.0012)); }
  for (const [key, x, y, sw, sh, spin = 0] of o.scratches || []) { const g = card(sw, sh, DR(key)); g.rotateZ(spin); if (f < 0) g.rotateY(PI); put(mm.decal, g, x, y, f * (t / 2 + 0.0015)); }
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(merge(list), m);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'doorKit';
    door.panel.add(mesh);
  }
}

// a brass bell button and a name card beside a door (wall side n or s)
export function buzzer(bb, x, zWall, nz, key) {
  const mm = hdMats();
  bb.beginFrame(x, 0, zWall, nz > 0 ? 0 : PI);
  gm(bb, lathe([[0.022, 0], [0.022, 0.002], [0.019, 0.005], [0.0005, 0.0055]], 16), mm.brass, { x: 0, y: 1.3, z: 0, rx: HP });
  gm(bb, new THREE.CylinderGeometry(0.0075, 0.0085, 0.007, 12), mm.ivory, { x: 0, y: 1.3, z: 0.008, rx: HP });
  for (const y of [-1, 1]) gm(bb, new THREE.BoxGeometry(0.106, 0.006, 0.005), mm.brass, { x: 0, y: 1.39 + y * 0.019, z: 0.0025 });
  for (const s of [-1, 1]) gm(bb, new THREE.BoxGeometry(0.006, 0.044, 0.005), mm.brass, { x: s * 0.05, y: 1.39, z: 0.0025 });
  gm(bb, card(0.094, 0.031, R('name' + key)), mm.signs, { x: 0, y: 1.39, z: 0.0015 });
  bb.endFrame();
}

// ------------------------------------------------------------- hall details
// all the corridor dressing; h = BLD.hall
export function hallDetails(bld, b, bS, h) {
  const mm = hdMats(), z0 = h.z0, z1 = h.z1, zc = (z0 + z1) / 2;
  // ---- doormats, newspapers nobody picked up, a menu under a door
  const doormat = (x, z, m, ry) => { gm(b, softBox(0.68, 0.012, 0.42, 0.005), mm.rubber, { x, y: 0.014, z, ry }); gm(b, softBox(0.6, 0.006, 0.34, 0.002), m, { x, y: 0.022, z, ry }); };
  doormat(7.65, 8.33, mm.coir, 0.02); doormat(12.72, 8.33, M.rug, -0.05); doormat(2.22, 9.21, mm.coir, 0.04); doormat(12.02, 9.21, mm.rubber, -0.02);
  for (const [x, z, ry] of [[12.42, 8.62, 0.35], [12.95, 8.72, -0.25], [12.66, 8.44, 1.45]]) {
    const paper = new THREE.CylinderGeometry(0.032, 0.032, 0.29, 14); inRect(paper, R('news')); paper.rotateZ(HP);
    const y = (z < 8.53 && z > 8.13 ? 0.026 : 0.009) + 0.032;
    gm(b, paper, mm.signs, { x, y, z, ry, cast: true });
    const sl = new THREE.CylinderGeometry(0.036, 0.036, 0.33, 12, 1, false); sl.rotateZ(HP);
    gm(b, sl, mm.plastic, { x, y, z, ry });
    const band = new THREE.TorusGeometry(0.033, 0.0028, 4, 16); band.rotateY(HP);
    gm(b, band, mm.red, { x, y, z, ry });
  }
  gm(b, new THREE.BoxGeometry(0.21, 0.0012, 0.1), mm.backing, { x: 16.86, y: 0.0012, z: 7.985, ry: 0.12 });
  { const g = card(0.1, 0.2, R('menu')); g.rotateZ(HP); gm(b, g, mm.signs, { x: 16.86, y: 0.0019, z: 7.985, rx: -HP, ry: 0.12 }); }
  // ---- buzzers and name cards on the latch side of every apartment door
  for (const [k, x] of [['4A', -2.61], ['4B', 8.24], ['4C', 13.29], ['4D', 17.39]]) buzzer(b, x, z0, 1, k);
  for (const [k, x] of [['4E', 1.66], ['4F', 11.46], ['4G', 15.06]]) buzzer(bS, x, z1, -1, k);
  // ---- 4D is chained shut from the outside, with a notice
  chain4D(b);
  // ---- conduit along the north wall under the crown, feeding the alarm and detectors
  const cz = z0 + 0.026, cy = 2.465;
  gm(b, pipe([V(19.374, 1.31, 9.45), V(19.374, cy, 9.45), V(19.374, cy, cz), V(-6.25, cy, cz)], 0.011), mm.galv);
  for (let x = 18.6; x > -6.2; x -= 1.4) gm(b, softBox(0.016, 0.034, 0.05, 0.004), mm.galv, { x, y: cy, z: z0 + 0.025 });
  for (const z of [9.0, 8.3]) gm(b, softBox(0.05, 0.034, 0.016, 0.004), mm.galv, { x: 19.375, y: cy, z });
  const jbox = (x) => { gm(b, softBox(0.1, 0.1, 0.045, 0.006), mm.galv, { x, y: cy, z: z0 + 0.0225 }); gm(b, softBox(0.106, 0.106, 0.006, 0.003), mm.galv, { x, y: cy, z: z0 + 0.047 }); };
  for (const x of [-6.2, 18.85]) jbox(x);
  gm(b, softBox(0.045, 0.1, 0.1, 0.006), mm.galv, { x: 19.375, y: cy, z: 8.78 });
  // ---- smoke detectors on short branches; the west one hangs open, dead
  for (const x of [-5.6, 2.9, 7.9, 17.2]) {
    const dz = 8.32, dead = x < -5;
    jbox(x);
    gm(b, pipe([V(x, cy, z0 + 0.05), V(x, cy, z0 + 0.1), V(x, 2.584, z0 + 0.1), V(x, 2.584, dz - 0.07)], 0.009, 0.04), mm.galv);
    gm(b, lathe([[0.0005, -0.036], [0.042, -0.035], [0.056, -0.029], [0.058, -0.022], [0.062, -0.021], [0.062, -0.013], [0.068, -0.011], [0.07, 0]], 22), mm.ivory, { x, y: h.h, z: dz });
    if (dead) gm(b, lathe([[0.0005, -0.012], [0.05, -0.011], [0.06, 0]], 18), mm.ivory, { x: x + 0.07, y: h.h - 0.075, z: dz, rz: 1.25 });
    else gm(b, new THREE.SphereGeometry(0.0045, 6, 4), mm.led, { x: x + 0.032, y: h.h - 0.03, z: dz });
  }
  // ---- fire bell over the stair end, pull station by the stair door
  gm(b, softBox(0.12, 0.12, 0.035, 0.008), mm.red, { x: 18.85, y: 2.24, z: z0 + 0.0175 });
  gm(b, lathe([[0.078, 0], [0.076, 0.008], [0.07, 0.025], [0.055, 0.04], [0.03, 0.048], [0.0005, 0.05]], 24), mm.red, { x: 18.85, y: 2.24, z: z0 + 0.035, rx: HP });
  gm(b, new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), mm.black, { x: 18.85, y: 2.15, z: z0 + 0.06 });
  gm(b, rod(V(18.85, 2.3, cz), V(18.85, cy - 0.05, cz), 0.011), mm.galv);
  b.beginFrame(19.4, 0, 9.45, -HP);
  gm(b, softBox(0.115, 0.155, 0.012, 0.003), mm.galv, { x: 0, y: 1.22, z: 0.006 });
  gm(b, softBox(0.1, 0.135, 0.045, 0.008), mm.red, { x: 0, y: 1.22, z: 0.0345 });
  gm(b, card(0.088, 0.125, R('pull')), mm.signs, { x: 0, y: 1.22, z: 0.0575 });
  gm(b, softBox(0.06, 0.016, 0.018, 0.004), mm.white, { x: 0, y: 1.236, z: 0.068 });
  gm(b, softBox(0.014, 0.03, 0.012, 0.003), mm.white, { x: 0, y: 1.222, z: 0.064 });
  b.endFrame();
  // ---- the EXIT sign: emergency power, so it stays lit when nothing else does
  b.beginFrame(19.4, 0, 8.78, -HP);
  gm(b, softBox(0.39, 0.21, 0.07, 0.01), mm.white, { x: 0, y: 2.3, z: 0.035 });
  gm(b, card(0.35, 0.17, [0, 0, 1, 1]), mm.exit, { x: 0, y: 2.3, z: 0.0712 });
  gm(b, softBox(0.12, 0.05, 0.02, 0.004), mm.white, { x: 0, y: 2.42, z: 0.012 });
  b.endFrame();
  bld.exitGlow = new THREE.PointLight(0xff2a1a, 0.6, 3.2, 2); bld.exitGlow.position.set(19.15, 2.15, 8.78); bld.root.add(bld.exitGlow);
  // ---- extinguisher cabinet (south wall), intercom, outlets
  extCabinet(bS, 10.2, z1);
  bS.beginFrame(6.55, 0, z1, PI);
  gm(bS, softBox(0.12, 0.2, 0.024, 0.006), M.beige, { x: 0, y: 1.42, z: 0.012 });
  gm(bS, card(0.112, 0.19, R('intercom')), mm.signs, { x: 0, y: 1.42, z: 0.0242 });
  for (let i = 0; i < 6; i++) gm(bS, new THREE.BoxGeometry(0.068, 0.0035, 0.004), mm.black, { x: 0, y: 1.466 + i * 0.0075 - 0.02, z: 0.0245 });
  for (const s of [-1, 0, 1]) gm(bS, softBox(0.022, 0.014, 0.01, 0.003), mm.ivory, { x: s * 0.033, y: 1.373, z: 0.028 });
  gm(bS, rod(V(0, 1.52, 0.012), V(0, 2.47, 0.012), 0.009), mm.galv);
  bS.endFrame();
  smudge(bS, 6.55, 1.38, z1 - 0.0005, 's', 0.2);
  const outlet = (bb, x, z, nz) => {
    bb.beginFrame(x, 0, z, nz > 0 ? 0 : PI);
    gm(bb, softBox(0.07, 0.114, 0.006, 0.002), mm.ivory, { x: 0, y: 0.32, z: 0.02 });
    for (const s of [-1, 1]) {
      gm(bb, softBox(0.034, 0.03, 0.006, 0.004), mm.ivory, { x: 0, y: 0.32 + s * 0.021, z: 0.024 });
      for (const sx of [-1, 1]) gm(bb, new THREE.BoxGeometry(0.0022, 0.009, 0.002), mm.black, { x: sx * 0.0065, y: 0.323 + s * 0.021, z: 0.0272 });
      gm(bb, new THREE.BoxGeometry(0.004, 0.004, 0.002), mm.black, { x: 0, y: 0.312 + s * 0.021, z: 0.0272 });
    }
    gm(bb, new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), mm.steel, { x: 0, y: 0.32, z: 0.0235, rx: HP });
    bb.endFrame();
  };
  for (const x of [-1.2, 10.9, 18.3]) outlet(b, x, z0, 1);
  for (const x of [4.7, 13.3]) outlet(bS, x, z1, -1);
  // ---- steam risers beside the radiators, painted over a dozen times
  const riser = (bb, x, z, rxz) => {
    gm(bb, rod(V(x, 0, z), V(x, h.h, z), 0.022, 10), M.radiator, { cast: true });
    for (const y of [0.003, h.h - 0.003]) gm(bb, new THREE.CylinderGeometry(0.042, 0.042, 0.006, 14), M.radiator, { x, y, z });
    gm(bb, pipe([V(rxz[0], 0.12, rxz[1]), V(x, 0.12, rxz[1]), V(x, 0.12, z)], 0.016, 0.03), M.radiator);
    const wheel = new THREE.TorusGeometry(0.024, 0.005, 5, 12); wheel.rotateX(HP);
    gm(bb, wheel, M.rustMetal, { x: (x + rxz[0]) / 2, y: 0.17, z: rxz[1] });
    gm(bb, new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), M.rustMetal, { x: (x + rxz[0]) / 2, y: 0.145, z: rxz[1] });
  };
  riser(b, 4.96, z0 + 0.075, [4.84, z0 + 0.12]);
  riser(bS, 13.84, z1 - 0.075, [13.96, z1 - 0.12]);
  decal(b, 'blobA', 4.6, 0.0013, z0 + 0.1, 0.5, 0.18, 'up', 0.1);
  // ---- the dead plant at the west end
  deadPlant(b, -5.6, z0 + 0.25);
  // ---- the leak over 4C: ceiling rings, streaks, paper coming away, a puddle and a sign
  decal(b, 'ringA', 13.7, h.h - 0.002, 8.45, 1.0, 0.9, 'down', 0.6);
  decal(b, 'ringB', 13.3, h.h - 0.0025, 8.2, 0.5, 0.42, 'down', 2.0);
  decal(b, 'dripA', 13.75, 2.0, z0 + 0.0025, 0.32, 1.0, 'n');
  decal(b, 'dripB', 14.12, 2.12, z0 + 0.003, 0.26, 0.8, 'n');
  peel(b, 13.62, 2.5, z0, 1, 0.36, 0.55, 1.6, h.x0, 'peelA');
  peel(b, 14.05, 2.48, z0, 1, 0.26, 0.34, 2.4, h.x0, 'peelB');
  decal(b, 'mold', 13.8, 0.36, z0 + 0.0172, 0.5, 0.42, 'n');
  decal(b, 'puddle', 13.72, 0.0102, 8.5, 0.9, 0.6, 'up', 0.2, mm.wet);
  decal(b, 'puddle', 13.95, 0.0014, 8.12, 0.45, 0.22, 'up', 0, mm.wet);
  wetSign(b, 14.25, 8.22, -0.5);
  bld.leak = { pos: V(13.7, h.h - 0.01, 8.5), t: 0 };
  // ---- the west end: the worst of the water, under the trash room's pipes
  decal(b, 'ringA', -5.0, h.h - 0.002, 9.15, 1.3, 1.1, 'down', 2.4);
  decal(b, 'ringB', -0.9, h.h - 0.002, 9.05, 0.8, 0.7, 'down', 1.0);
  decal(bS, 'dripA', -5.1, 1.9, z1 - 0.0025, 0.5, 1.3, 's');
  decal(bS, 'dripB', -4.55, 2.05, z1 - 0.003, 0.34, 1.0, 's');
  peel(bS, -5.3, 2.5, z1, -1, 0.42, 0.95, 1.1, h.x1, 'peelA');
  peel(bS, -4.75, 2.46, z1, -1, 0.3, 0.42, 2.2, h.x1, 'peelB');
  decal(bS, 'mold', -5.0, 0.4, z1 - 0.0172, 0.9, 0.55, 's');
  // ---- scuffs, hand grime, and scratches nobody explains
  const sk = (x) => ['scuffA', 'scuffB', 'scuffC'][Math.abs(Math.round(x * 3)) % 3];
  for (const [x, w] of [[-5.2, 0.7], [-3.9, 0.5], [-1.8, 0.6], [0.6, 0.5], [5.9, 0.6], [9.5, 0.5], [14.8, 0.6], [18.4, 0.4]]) decal(b, sk(x), x, 0.075, z0 + 0.0245, w, 0.11, 'n');
  for (const [x, w] of [[-4.2, 0.6], [0.9, 0.5], [5.2, 0.6], [9.1, 0.5], [17.2, 0.6]]) decal(bS, sk(x), x, 0.075, z1 - 0.0245, w, 0.11, 's');
  for (const [x, y, w] of [[-4.6, 0.32, 0.6], [6.4, 0.3, 0.5], [10.8, 0.36, 0.5]]) decal(b, sk(x + 1), x, y, z0 + 0.0172, w, 0.13, 'n');
  for (const [x, y, w] of [[-2.6, 0.34, 0.6], [6.2, 0.3, 0.5]]) decal(bS, sk(x + 1), x, y, z1 - 0.0172, w, 0.13, 's');
  for (const [x, y] of [[8.32, 1.1], [-2.55, 1.12], [13.36, 1.08]]) smudge(b, x, y, z0 + 0.0005, 'n', 0.22);
  smudge(b, -6.4 + 0.0005, 1.05, 9.32, 'w', 0.22);
  smudge(b, 19.4 - 0.0005, 1.0, 8.22, 'e', 0.22);
  decal(b, 'scratchA', 18.3, 0.55, z0 + 0.0172, 0.34, 0.5, 'n', 0.05);
}
function smudge(bb, x, y, z, face, s) { decal(bb, 'smudge', x, y, z, s, s * 1.2, face); }

// a strip of wallpaper peeled off the wall from its top edge, curling out,
// with bare plaster behind it. side: +1 north wall (faces +z), -1 south
function peel(bb, x, yTop, zWall, side, w, L, curl, a0, patch) {
  const mm = hdMats(), ts = M.wallHall.userData.ws || 1, seg = 12;
  decal(bb, patch, x, yTop - L * 0.55, zWall + side * 0.0018, w * 1.1, L * 1.15, side > 0 ? 'n' : 's');
  const pos = [], uv = [], idx = [];
  const R0 = L / curl;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = t * curl, y = -R0 * Math.sin(a), z = R0 * (1 - Math.cos(a)) * 0.55;
    for (let j = 0; j <= 3; j++) {
      const u = j / 3 - 0.5, wob = 0.012 * Math.sin(u * 7 + t * 5) * t, narrow = 1 - 0.18 * t * Math.abs(u * 2);
      const px = u * w * narrow, py = y + wob - 0.02 * t * t * Math.abs(u), pz = z + 0.004 + 0.02 * t * (u * u);
      pos.push(px, py, pz);
      const wx = x + side * px;
      uv.push((side > 0 ? wx - a0 : a0 - wx) / ts, (yTop - t * L) / ts);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < 3; j++) { const a = i * 4 + j, b2 = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b2, b2, c, d); }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); front.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  front.setIndex(idx); front.computeVertexNormals();
  const back = front.clone(); const bi = back.index.array; for (let k = 0; k < bi.length; k += 3) { const tmp = bi[k + 1]; bi[k + 1] = bi[k + 2]; bi[k + 2] = tmp; } back.computeVertexNormals();
  back.translate(0, 0, -0.0012);
  const ry = side > 0 ? 0 : PI;
  gm(bb, front, M.wallHall, { x, y: yTop, z: zWall, ry, cast: true });
  gm(bb, back, mm.backing, { x, y: yTop, z: zWall, ry });
}

function wetSign(bb, x, z, ry) {
  // a yellow A-frame: two boards hinged at the top, text on both faces
  const mm = hdMats(), hgt = 0.62, spread = 0.13;
  bb.beginFrame(x, 0, z, ry);
  for (const s of [-1, 1]) {
    const tilt = Math.atan2(spread, hgt);
    gm(bb, softBox(0.3, hgt, 0.012, 0.01), mm.yellow, { x: 0, y: hgt / 2, z: s * spread / 2, rx: -s * tilt, cast: true });
    const g = card(0.24, 0.36, R('wet')); if (s < 0) g.rotateY(PI);
    const th = -s * tilt, oy = 0.04, oz = s * 0.0066;   // offset in the board's own frame
    gm(bb, g, mm.signs, { x: 0, y: hgt / 2 + oy * Math.cos(th) - oz * Math.sin(th), z: s * spread / 2 + oy * Math.sin(th) + oz * Math.cos(th), rx: th });
  }
  gm(bb, softBox(0.12, 0.03, 0.03, 0.01), mm.yellow, { x: 0, y: hgt + 0.01, z: 0 });
  bb.endFrame();
}

function extCabinet(bS, x, z1) {
  const mm = hdMats();
  bS.beginFrame(x, 0, z1, PI);
  const y = 1.25, W = 0.38, H = 0.64, D = 0.12;
  gm(bS, new THREE.BoxGeometry(W, H, 0.01), mm.white, { x: 0, y, z: 0.005 });
  for (const s of [-1, 1]) gm(bS, new THREE.BoxGeometry(0.012, H, D), mm.white, { x: s * (W / 2 - 0.006), y, z: D / 2 });
  for (const s of [-1, 1]) gm(bS, new THREE.BoxGeometry(W, 0.012, D), mm.white, { x: 0, y: y + s * (H / 2 - 0.006), z: D / 2 });
  for (const s of [-1, 1]) gm(bS, softBox(0.036, H + 0.04, 0.016, 0.004), mm.white, { x: s * (W / 2 + 0.002), y, z: D + 0.002 });
  for (const s of [-1, 1]) gm(bS, softBox(W + 0.04, 0.036, 0.016, 0.004), mm.white, { x: 0, y: y + s * (H / 2 + 0.002), z: D + 0.002 });
  gm(bS, new THREE.PlaneGeometry(W - 0.03, H - 0.03), M.glassDirt, { x: 0, y, z: D - 0.004 });
  gm(bS, card(0.26, 0.044, R('extStrip')), mm.signs, { x: 0, y: y - 0.2, z: D - 0.003 });
  gm(bS, softBox(0.014, 0.06, 0.016, 0.004), mm.steel, { x: W / 2 - 0.03, y, z: D + 0.012 });
  // the extinguisher itself, standing on the cabinet floor
  const ey = y - H / 2 + 0.012;
  gm(bS, lathe([[0.0005, 0], [0.058, 0], [0.064, 0.012], [0.064, 0.33], [0.055, 0.37], [0.03, 0.39], [0.0005, 0.395]], 20), mm.red, { x: -0.04, y: ey, z: 0.068, cast: true });
  gm(bS, softBox(0.05, 0.05, 0.04, 0.008), mm.black, { x: -0.04, y: ey + 0.42, z: 0.068 });
  gm(bS, new THREE.BoxGeometry(0.11, 0.01, 0.02), mm.steel, { x: -0.02, y: ey + 0.455, z: 0.068, rz: -0.12 });
  gm(bS, new THREE.CylinderGeometry(0.016, 0.016, 0.008, 12), mm.white, { x: -0.04, y: ey + 0.42, z: 0.09, rx: HP });
  gm(bS, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.015, ey + 0.41, 0.068), V(0.04, ey + 0.38, 0.07), V(0.07, ey + 0.2, 0.072), V(0.06, ey + 0.06, 0.07)]), 10, 0.008, 6, false), mm.black);
  bS.endFrame();
  bS.collider(x, y, z1 - 0.07, 0.42, 0.66, 0.14);
}

function deadPlant(b, x, z) {
  const mm = hdMats(), rng = new RNG(141);
  gm(b, lathe([[0.0005, 0], [0.105, 0], [0.11, 0.012], [0.138, 0.27], [0.152, 0.272], [0.156, 0.3], [0.14, 0.302], [0.132, 0.285], [0.0005, 0.285]], 20), mm.terracotta, { x, y: 0.012, z, cast: true });
  gm(b, lathe([[0.0005, 0], [0.15, 0], [0.165, 0.014], [0.158, 0.016], [0.0005, 0.008]], 20), mm.terracotta, { x, y: 0, z });
  gm(b, new THREE.CylinderGeometry(0.13, 0.13, 0.01, 18), mm.soil, { x, y: 0.3, z });
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, PI * 2), r0 = rng.range(0.01, 0.07), hgt = rng.range(0.28, 0.6), droop = rng.range(0.1, 0.3);
    const p0 = V(x + Math.cos(a) * r0, 0.3, z + Math.sin(a) * r0), dir = V(Math.cos(a), 0, Math.sin(a));
    const pts = [p0, p0.clone().add(V(0, hgt * 0.5, 0)).addScaledVector(dir, 0.03), p0.clone().add(V(0, hgt * 0.85, 0)).addScaledVector(dir, droop * 0.6), p0.clone().add(V(0, hgt * 0.7, 0)).addScaledVector(dir, droop)];
    gm(b, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0035, 4, false), mm.dry, { cast: true });
    const tip = pts[3];
    const leaf = new THREE.SphereGeometry(0.03, 6, 4); leaf.scale(1, 0.12, 0.45);
    gm(b, leaf, mm.dry, { x: tip.x, y: tip.y - 0.02, z: tip.z, ry: -a, rz: -1.1 });
  }
  for (let i = 0; i < 7; i++) { const leaf = new THREE.SphereGeometry(0.028, 6, 4); leaf.scale(1, 0.1, 0.5); gm(b, leaf, mm.dry, { x: x + rng.range(-0.35, 0.4), y: 0.004, z: z + rng.range(-0.15, 0.3), ry: rng.range(0, 6), rz: rng.range(-0.2, 0.2) }); }
  b.collider(x, 0.18, z, 0.3, 0.36, 0.3);
}

// a chain from 4D's knob to an eye bolt in the casing, and a padlock
function chain4D(b) {
  const mm = hdMats(), a = V(17.17, 0.955, 8.0), c = V(16.365, 1.02, 7.962), N = 38;
  gm(b, new THREE.TorusGeometry(0.014, 0.0035, 5, 10), mm.steel, { x: c.x, y: c.y, z: c.z });
  gm(b, new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6), mm.steel, { x: c.x, y: c.y - 0.014, z: 7.952, rx: HP });
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = a.clone().lerp(c, t); p.y -= 0.11 * Math.sin(PI * t); p.z += 0.012 * Math.sin(PI * t);
    const q = a.clone().lerp(c, t + 0.01); q.y -= 0.11 * Math.sin(PI * (t + 0.01));
    const yaw = Math.atan2(q.z - p.z, q.x - p.x), pitch = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    const link = new THREE.TorusGeometry(0.0095, 0.0028, 4, 10); link.scale(1.35, 1, 1);
    if (i % 2) link.rotateX(HP);
    link.rotateZ(pitch); link.rotateY(-yaw);
    gm(b, link, mm.steel, { x: p.x, y: p.y, z: p.z, cast: true });
  }
  // a wrap around the knob neck and the lock hanging from it
  gm(b, new THREE.TorusGeometry(0.034, 0.0045, 5, 16), mm.steel, { x: 17.17, y: 0.975, z: 8.008, rx: 0.3 });
  gm(b, softBox(0.042, 0.05, 0.022, 0.006), mm.brassDark, { x: 17.15, y: 0.88, z: 8.03, cast: true });
  const sh = new THREE.TorusGeometry(0.015, 0.0035, 5, 10, PI); gm(b, sh, mm.steel, { x: 17.15, y: 0.905, z: 8.03 });
  gm(b, new THREE.BoxGeometry(0.003, 0.012, 0.002), mm.black, { x: 17.15, y: 0.875, z: 8.042 });
  // the notice, taped to the upper panel
  gm(b, card(0.2, 0.267, R('notice')), mm.signs, { x: 16.83, y: 1.5, z: 7.9698, rz: 0.02 });
  decal(b, 'scratchA', 16.62, 1.22, 7.9765, 0.22, 0.3, 'n', 0.15);
  decal(b, 'scratchB', 17.02, 0.62, 7.9765, 0.16, 0.2, 'n', -0.1);
}

// ------------------------------------------------------------- trash room
export function trashDetails(bld, b, r) {
  const mm = hdMats();
  // the hall's west wall seen from inside, with the door opening
  b.wallSide({ ...r, x1: r.x1 }, 'e', M.wallEmpty, [{ a: 8.35, b: 9.2, y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.12, collide: false });
  // drop ceiling: one tile stained and sagging, one gone, the plenum black above
  const yc = 2.46, xs = [r.x0, -7.76, -7.16, r.x1], zs = [r.z0, 8.47, 9.07, r.z1];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x0 = xs[i], x1 = xs[i + 1], za = zs[j], zb = zs[j + 1];
    if (i === 0 && j === 2) continue;
    const sag = i === 2 && j === 1;
    gm(b, new THREE.BoxGeometry(x1 - x0 - 0.02, 0.014, zb - za - 0.02), mm.acoustic, { x: (x0 + x1) / 2, y: yc + 0.007 - (sag ? 0.022 : 0), z: (za + zb) / 2, receive: true });
    if (i === 1 && j === 1) gm(b, new THREE.CylinderGeometry(0.03, 0.03, 0.004, 10), mm.ivory, { x: -7.45, y: yc - 0.002, z: 8.77 });
  }
  decal(b, 'ringA', -6.84, yc - 0.0225, 8.77, 0.55, 0.52, 'down', 1.2);
  decal(b, 'ringB', -8.05, yc - 0.002, 8.2, 0.4, 0.35, 'down', 0.4);
  for (const x of [-7.76, -7.16]) bx(b, x, yc - 0.004, (r.z0 + r.z1) / 2, 0.022, 0.012, r.z1 - r.z0, mm.white);
  for (const z of [8.47, 9.07]) bx(b, (r.x0 + r.x1) / 2, yc - 0.004, z, r.x1 - r.x0, 0.012, 0.022, mm.white);
  for (const [x, z, w, d] of [[(r.x0 + r.x1) / 2, r.z0 + 0.01, r.x1 - r.x0, 0.02], [(r.x0 + r.x1) / 2, r.z1 - 0.01, r.x1 - r.x0, 0.02], [r.x0 + 0.01, (r.z0 + r.z1) / 2, 0.02, r.z1 - r.z0], [r.x1 - 0.01, (r.z0 + r.z1) / 2, 0.02, r.z1 - r.z0]]) bx(b, x, yc - 0.004, z, w, 0.008, d, mm.white);
  gm(b, new THREE.PlaneGeometry(0.64, 0.55), mm.black, { x: -8.08, y: r.h - 0.01, z: 9.345, rx: HP });
  gm(b, rod(V(-8.4, 2.53, 9.25), V(-6.52, 2.53, 9.25), 0.04, 10), M.rustMetal);
  gm(b, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-8.2, 2.55, 9.2), V(-8.15, 2.42, 9.3), V(-8.12, 2.2, 9.28), V(-8.16, 2.02, 9.33)]), 10, 0.005, 5, false), mm.black);
  // a wire guard and porcelain socket on the bulb
  cagedBulb(b, V(-7.45, 2.3, 8.77), yc);
  // the chute hopper surround and its sign, grime run down from it
  sign(b, 'chute', r.x0 + 0.003, 1.56, 8.77, 0.34, 0.2, 'w');
  decal(b, 'dripA', r.x0 + 0.002, 0.42, 8.77, 0.5, 0.75, 'w');
  decal(b, 'blobA', -8.0, 0.0012, 8.85, 0.9, 0.7, 'up', 0.5);
  decal(b, 'blobB', -7.25, 0.0014, 9.2, 0.45, 0.35, 'up', 1.7);
  decal(b, 'scratchA', r.x0 + 0.002, 1.15, 9.3, 0.3, 0.4, 'w', 0.3);
  for (const [z, s] of [[r.z0, 1], [r.z1, -1]]) { const g = card(r.x1 - r.x0, 0.22, DR('grime')); g.rotateX(-HP); if (s > 0) g.rotateY(PI); gm(b, g, mm.decal, { x: (r.x0 + r.x1) / 2, y: 0.0012, z: z + s * 0.11 }); }
  // floor drain
  gm(b, lathe([[0.0005, 0.002], [0.07, 0.002], [0.08, 0.0], [0.0005, 0.0]].reverse(), 18), M.rustMetal, { x: -7.65, y: 0.001, z: 8.95 });
  for (let i = -3; i <= 3; i++) gm(b, new THREE.BoxGeometry(0.006, 0.003, Math.sqrt(Math.max(0, 0.062 ** 2 - (i * 0.018) ** 2)) * 2), mm.black, { x: -7.65 + i * 0.018, y: 0.0035, z: 8.95 });
  decal(b, 'puddle', -7.62, 0.0018, 8.98, 0.5, 0.35, 'up', 0.8, mm.wet);
  // the bags, a white kitchen bag with red ties, a galvanized can, flattened boxes
  const bags = [[-8.12, 9.32, 0.24, 0], [-7.72, 9.42, 0.19, 0], [-8.18, 8.64, 0.2, 0], [-7.82, 8.98, 0.17, 1], [-8.2, 8.98, 0.16, 0]];
  bags.forEach(([x, z, s, white], i) => {
    const g = bagGeo(s, 151 + i * 7);
    gm(b, g, white ? mm.bagWhite : mm.bag, { x, y: 0, z, ry: i * 1.7, cast: true });
    if (white) for (const e of [-1, 1]) { const tie = new THREE.TorusGeometry(0.026, 0.004, 4, 10); tie.scale(1, 1.4, 0.5); gm(b, tie, mm.red, { x: x + e * 0.02, y: s * 1.12, z, ry: e * 0.7 }); }
    b.collider(x, s * 0.4, z, s * 1.4, s * 0.8, s * 1.4);
  });
  trashCan(b, -6.8, 9.38);
  gm(b, softBox(0.55, 0.62, 0.012, 0.004), M.cardboard, { x: -7.88, y: 0.3, z: 9.55, rx: 0.32, cast: true });
  gm(b, softBox(0.6, 0.5, 0.012, 0.004), M.cardboard, { x: -7.82, y: 0.25, z: 9.52, rx: 0.42, ry: 0.15, cast: true });
  // the mattress, stood on end against the north wall, stained through
  mattress(b, -7.92, r.z0);
  decal(b, 'blobB', -7.95, 0.0016, 8.3, 0.6, 0.4, 'up', 0.2);
}

function cagedBulb(b, p, yTop) {
  const mm = hdMats();
  gm(b, lathe([[0.0005, 0], [0.024, 0.0], [0.026, 0.02], [0.03, 0.045], [0.03, 0.06], [0.0005, 0.06]], 14), mm.ivory, { x: p.x, y: p.y + 0.03, z: p.z });
  if (yTop - (p.y + 0.09) > 0.01) gm(b, rod(V(p.x, p.y + 0.09, p.z), V(p.x, yTop, p.z), 0.004, 4), mm.black);
  for (const y of [0.0, -0.045]) { const ring = new THREE.TorusGeometry(y ? 0.035 : 0.045, 0.0022, 4, 16); ring.rotateX(HP); gm(b, ring, mm.rail, { x: p.x, y: p.y + y, z: p.z }); }
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * PI * 2, c = Math.cos(a), s = Math.sin(a);
    gm(b, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(c * 0.026, 0.035, s * 0.026), V(c * 0.046, 0.0, s * 0.046), V(c * 0.04, -0.04, s * 0.04), V(0, -0.062, 0)]), 6, 0.0018, 3, false), mm.rail, { x: p.x, y: p.y, z: p.z });
  }
}

// a filled garbage bag: lumpy, creased, slumped, gathered to a knot
function bagGeo(r, seed) {
  const rng = new RNG(seed), g = new THREE.SphereGeometry(r, 20, 14), p = g.attributes.position, v = new THREE.Vector3();
  const ph = [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ny = v.y / r, a = Math.atan2(v.z, v.x);
    const k = 1 + 0.13 * Math.sin(a * 3 + ph[0]) * Math.sin(ny * 4 + ph[1]) + 0.07 * Math.sin(a * 5 + ny * 3 + ph[2]) + 0.03 * Math.sin(a * 19 + ph[3] + ny * 2) * (1 - Math.abs(ny));
    v.x *= k * 1.08; v.z *= k * 1.08;
    v.y = ny > 0 ? v.y * 0.85 : v.y * 0.6;
    if (ny > 0.5) { const t = smoothstep(0.5, 1, ny); v.x *= 1 - t * 0.85; v.z *= 1 - t * 0.85; v.y += t * r * 0.32; }
    if (v.y < -r * 0.5) v.y = -r * 0.5 + (v.y + r * 0.5) * 0.08;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const parts = [g];
  for (const s of [-1, 1]) { const ear = new THREE.SphereGeometry(r * 0.17, 8, 6); ear.scale(1.5, 0.55, 0.7); at(ear, s * r * 0.1, r * 1.12, 0, 0, 0, s * 0.7); parts.push(ear); }
  const out = merge(parts); out.computeBoundingBox(); out.translate(0, -out.boundingBox.min.y, 0);
  return out;
}

function trashCan(b, x, z) {
  const mm = hdMats(), P = [[0.0005, 0]];
  for (let y = 0; y <= 0.6; y += 0.02) { const rib = [0.12, 0.3, 0.48].some((ry) => Math.abs(y - ry) < 0.011) ? 0.007 : 0; P.push([0.19 + y * 0.05 + rib, y]); }
  P.push([0.232, 0.612], [0.226, 0.62], [0.22, 0.6], [0.2, 0.05], [0.0005, 0.05]);
  gm(b, lathe(P, 22), mm.galv, { x, y: 0, z, cast: true });
  for (const s of [-1, 1]) { const hnd = new THREE.TorusGeometry(0.04, 0.006, 5, 10, PI); gm(b, hnd, mm.galv, { x: x + s * 0.235, y: 0.5, z, ry: s * HP, rz: 0 }); }
  gm(b, lathe([[0.0005, 0.06], [0.08, 0.055], [0.2, 0.03], [0.24, 0.012], [0.245, 0], [0.235, 0.0]].reverse(), 22), mm.galv, { x: x + 0.03, y: 0.615, z: z - 0.02, rx: 0.12, rz: -0.08, cast: true });
  gm(b, softBox(0.12, 0.02, 0.02, 0.006), mm.galv, { x: x + 0.035, y: 0.69, z: z - 0.01, rx: 0.12 });
  b.collider(x, 0.32, z, 0.46, 0.64, 0.46);
}

function mattress(b, x, zWall) {
  const mm = hdMats(), W = 0.95, H = 1.86, D = 0.17;
  const g = new THREE.BoxGeometry(W, H, D, 6, 16, 2), p = g.attributes.position, v = new THREE.Vector3(), rr = 0.05;
  const inner = V(W / 2 - rr, H / 2 - rr, D / 2 - rr);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = V(clamp(v.x, -inner.x, inner.x), clamp(v.y, -inner.y, inner.y), clamp(v.z, -inner.z, inner.z)), d = v.clone().sub(c);
    if (d.lengthSq() > 1e-10) v.copy(c).add(d.setLength(rr));
    const t = (v.y + H / 2) / H;
    v.z += 0.07 * Math.sin(PI * t) - 0.02 * Math.sin(PI * 2 * t) * (v.x / W);   // it bows where it leans
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const lean = 0.19;
  gm(b, g, mm.mattress, { x, y: H / 2 * Math.cos(lean) + 0.005, z: zWall + 0.09 + Math.sin(lean) * H / 2 + 0.03, rx: -lean, cast: true });
  const cy = H / 2 * Math.cos(lean) + 0.005, cz = zWall + 0.09 + Math.sin(lean) * H / 2 + 0.03, yl = -H / 2 + 0.3, bow = 0.07 * Math.sin(PI * 0.161);
  const tg = card(0.07, 0.1, R('tag')); tg.rotateY(HP);
  gm(b, tg, mm.signs, { x: x + W / 2 + 0.004, y: cy + yl * Math.cos(lean) + bow * Math.sin(lean), z: cz - yl * Math.sin(lean) + bow * Math.cos(lean), rx: -lean });
  b.collider(x, 0.9, zWall + 0.2, W, 1.8, 0.3, 0);
}

// ------------------------------------------------------------- stairwell
// A real switchback stair in a shaft: our landing, a flight up and a flight
// down to half landings at the far end, and the flights beyond them climbing
// and sinking into black. Only the landing can be walked: tape below, a gate
// above. The shaft runs far past the one floor there is.
export const STAIR = { land: 21.2, half: 23.36, rise: 0.161, tread: 0.27, lo: -2.2, hi: 5.0, dn: [7.4, 8.6], up: [9.1, 10.6] };
export function stairDetails(bld, b, r) {
  const mm = hdMats(), { land, half, rise, tread, dn, up } = STAIR, zc = (r.z0 + r.z1) / 2, H2 = 9 * rise, cw = M.concrete;
  for (const s of ['n', 's', 'e']) b.wallSide({ ...r, y0: STAIR.lo, h: STAIR.hi - STAIR.lo }, s, M.wallPaint, [], { thick: 0.12 });
  b.wallSide({ ...r, h: 2.6 }, 'w', M.wallPaint, [{ a: 8.35, b: 9.2, y0: 0, y1: 2.08, kind: 'door' }], { thick: 0.12, collide: false });
  // slab edges: ours, and floor 5's overhead (its underside is our ceiling)
  b.box(land - 0.15, -0.15, zc, 0.3, 0.3, r.z1 - r.z0, cw, { collide: false, cast: false, faces: { px: 1 } });
  b.box(land - 0.005, (STAIR.lo - 0.3) / 2, zc, 0.01, -0.3 - STAIR.lo, r.z1 - r.z0, M.wallPaint, { collide: false, cast: false, faces: { px: 1 } });
  b.box(land - 0.15, 2.75, zc, 0.3, 0.3, r.z1 - r.z0, cw, { collide: false, cast: false, faces: { px: 1 } });
  // a tread: concrete, a worn yellow safety stripe and a steel angle on its nosing
  const tr = (x, top, zz, nx, coll = false) => {
    b.box(x + tread / 2, top - 0.12, (zz[0] + zz[1]) / 2, tread, 0.24, zz[1] - zz[0], cw, { collide: coll, cast: false });
    bx(b, nx, top + 0.002, (zz[0] + zz[1]) / 2, 0.05, 0.004, zz[1] - zz[0] - 0.05, mm.yellow);
    gm(b, new THREE.BoxGeometry(0.012, 0.03, zz[1] - zz[0]), mm.steel, { x: nx > x + tread / 2 ? x + tread - 0.006 : x + 0.006, y: top - 0.013, z: (zz[0] + zz[1]) / 2 });
  };
  // a flat sloped slab under a flight, hung from the line of its nosings
  const soffit = (xa, ya, xb, yb, zz) => { if (xb < xa) [xa, ya, xb, yb] = [xb, yb, xa, ya]; ya -= 0.2; yb -= 0.2; const L = Math.hypot(xb - xa, yb - ya), th = Math.atan2(yb - ya, xb - xa); gm(b, boxGeo(L, 0.2, zz[1] - zz[0], cw.userData.ws || 1), cw, { x: (xa + xb) / 2 + Math.sin(th) * 0.1, y: (ya + yb) / 2 - Math.cos(th) * 0.1, z: (zz[0] + zz[1]) / 2, rz: th }); };
  const halfLanding = (top) => b.box((half + r.x1) / 2, top - 0.1, zc, r.x1 - half, 0.2, r.z1 - r.z0, cw, { collide: false, cast: false });
  bx(b, land - 0.025, 0.002, (dn[0] + dn[1]) / 2, 0.05, 0.004, dn[1] - dn[0] - 0.05, mm.yellow);
  for (let k = 0; k < 8; k++) {
    const xu = land + k * tread, xw = half - (k + 1) * tread;
    tr(xu, -rise * (k + 1), dn, xu + tread - 0.025, k < 2);                  // down, east
    tr(xu, rise * (k + 1), up, xu + 0.025, true);                             // up, east
    tr(xw, H2 + rise * (k + 1), dn, xw + tread - 0.025);                      // on up, west
    tr(xu, 2 * H2 + rise * (k + 1), up, xu + 0.025);                          // and on again
    if (k < 4) tr(xw, -H2 - rise * (k + 1), up, xw + 0.025);                  // on down, west
  }
  halfLanding(H2); halfLanding(-H2); halfLanding(3 * H2);
  soffit(land, rise, half, H2, up); soffit(land, 0, half, -8 * rise, dn);
  soffit(half, H2 + rise, land, 2 * H2, dn); soffit(land, 2 * H2 + rise, half, 3 * H2, up);
  // rubble where the flight below caved in, and grit up near the tape
  const rng = new RNG(161);
  for (let i = 0; i < 26; i++) {
    const far = i < 18, x = far ? rng.range(22.3, 24.3) : rng.range(21.25, 21.9), s = far ? rng.range(0.05, 0.17) : rng.range(0.015, 0.04);
    const top = x > half ? -H2 : -rise * (Math.floor((x - land) / tread) + 1);
    gm(b, lump(s, 170 + i, 0.6, 0.3), M.concrete, { x, y: top + s * 0.35, z: rng.range(dn[0] + 0.1, dn[1] - 0.05), ry: rng.range(0, 6), cast: far });
  }
  for (let i = 0; i < 4; i++) gm(b, rod(V(22.9 + i * 0.25, -H2, 7.7 + i * 0.2), V(22.7 + i * 0.3, -0.9 - i * 0.1, 7.9 + i * 0.15), 0.006, 5), M.rustMetal);
  // darkness: stacked black veils below the landing and above the flights
  const veil = (ys, op, face) => {
    const gs = ys.map((y) => { const g = new THREE.PlaneGeometry(r.x1 - land, r.z1 - r.z0); g.rotateX(face > 0 ? -HP : HP); return g.translate((land + r.x1) / 2, y, zc); });
    const m = new THREE.Mesh(mergeGeometries(gs), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
    m.renderOrder = 3; bld.root.add(m);
  };
  veil([-0.5, -0.85, -1.2], 0.42, 1); veil([-1.6], 1, 1); veil([3.35, 3.8, 4.25], 0.42, -1); veil([4.7], 1, -1);
  // railings: a pipe guard with square pickets round the well, wall rails on brackets
  const railLine = (pts) => {
    gm(b, pipe(pts, 0.021, 0.07, 10), mm.rail, { cast: true });
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], c = pts[k + 1], m = Math.max(1, Math.round(a.distanceTo(c) / 0.12));
      for (let j = 1; j < m; j++) { const p = a.clone().lerp(c, j / m); gm(b, new THREE.BoxGeometry(0.016, 0.86, 0.016), mm.rail, { x: p.x, y: p.y - 0.45, z: p.z }); }
    }
  };
  const R0 = 0.92, zA = dn[1] + 0.02, zB = up[0] - 0.02;
  railLine([V(land, R0, zA), V(half, R0 - H2, zA), V(half, R0 - H2, zB)]);
  railLine([V(land, R0, zA), V(land, R0, zB), V(half, R0 + H2, zB), V(half, R0 + H2, zA), V(land, R0 + 2 * H2, zA)]);
  for (const [x, y, z] of [[land, 0, zA], [land, 0, zB], [half, -H2, zA], [half, H2, zB]]) gm(b, softBox(0.06, 0.96, 0.06, 0.008), mm.rail, { x, y: y + 0.47, z, cast: true });
  for (const [zr, zw, dir] of [[r.z0 + 0.045, r.z0, -1], [r.z1 - 0.045, r.z1, 1]]) {
    const ya = 0.86, end = V(half - 0.1, ya + dir * (half - 0.1 - land) * rise / tread, zr);
    gm(b, pipe([V(19.75, ya, zr), V(land, ya, zr), end], 0.019, 0.1, 10), mm.rail);
    gm(b, new THREE.SphereGeometry(0.024, 8, 6), mm.rail, { x: 19.75, y: ya, z: zr });
    for (const x of [19.95, 20.9, 22.1, 23.0]) {
      const y = (x < land ? ya : ya + dir * (x - land) * rise / tread) - 0.035, s = zw < zc ? 1 : -1;
      gm(b, new THREE.BoxGeometry(0.012, 0.012, 0.04), mm.rail, { x, y, z: zw + s * 0.022 });
      gm(b, new THREE.CylinderGeometry(0.024, 0.024, 0.006, 10), mm.rail, { x, y, z: zw + s * 0.003, rx: HP });
    }
  }
  // caution tape strung across the down flight, sagging
  for (const [ya, yb, sag] of [[0.95, 0.9, 0.06], [0.62, 0.66, 0.04]]) {
    const a = V(21.26, ya, r.z0 + 0.06), c = V(21.26, yb, zA), pos = [], uv = [], idx = [], N = 12, rr = R('tape');
    for (let i = 0; i <= N; i++) { const t = i / N, p = a.clone().lerp(c, t); p.y -= sag * Math.sin(PI * t); for (const s of [0, 1]) { pos.push(p.x + 0.003 * Math.sin(t * 9), p.y + (s - 0.5) * 0.05, p.z); uv.push(rr[0] + t * (rr[2] - rr[0]) * 0.6, s ? rr[3] : rr[1]); } }
    for (let i = 0; i < N; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const back = g.clone(); back.translate(0.0015, 0, 0); const bi = back.index.array; for (let k = 0; k < bi.length; k += 3) { const tmp = bi[k + 1]; bi[k + 1] = bi[k + 2]; bi[k + 2] = tmp; } back.computeVertexNormals();
    gm(b, g, mm.signs); gm(b, back, mm.signs);
  }
  // the gate on the up flight: a steel frame, bars, a chain and a lock
  const gx = 21.0, gz = (up[0] + up[1]) / 2, gw = up[1] - up[0] - 0.04;
  for (const [y, hgt] of [[0.08, 0.03], [1.18, 0.03], [0.63, 0.025]]) gm(b, softBox(0.03, hgt, gw, 0.006), mm.rail, { x: gx, y, z: gz });
  for (const z of [up[0] + 0.02, up[1] - 0.02]) gm(b, softBox(0.035, 1.18, 0.035, 0.006), mm.rail, { x: gx, y: 0.6, z, cast: true });
  for (let i = 1; i < 13; i++) gm(b, new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), mm.rail, { x: gx, y: 0.63, z: up[0] + 0.02 + i * gw / 13 });
  for (let i = 0; i < 9; i++) { const link = new THREE.TorusGeometry(0.012, 0.0035, 4, 10); link.scale(1.3, 1, 1); if (i % 2) link.rotateX(HP); gm(b, link, mm.steel, { x: gx - 0.02, y: 0.9 - Math.sin(i / 8 * PI) * 0.05, z: up[0] - 0.05 + i * 0.022, ry: HP }); }
  gm(b, softBox(0.022, 0.05, 0.042, 0.006), mm.brassDark, { x: gx - 0.03, y: 0.83, z: up[0] + 0.03 });
  sign(b, 'roof', gx - 0.022, 0.98, gz, 0.24, 0.1, 'e');
  // paint: a dado on the landing, the floor number, the stair sign by the door
  for (const [z, s] of [[r.z0, 1], [r.z1, -1]]) { bx(b, (r.x0 + land) / 2, 0.55, z + s * 0.002, land - r.x0, 1.1, 0.004, mm.paint, { receive: true }); bx(b, (r.x0 + land) / 2, 1.13, z + s * 0.003, land - r.x0, 0.06, 0.006, mm.rail); }
  decal(b, 'four', 20.45, 1.62, r.z0 + 0.0045, 0.74, 0.92, 'n');
  sign(b, 'stair', r.x0 + 0.003, 1.62, 9.66, 0.3, 0.25, 'w');
  decal(b, 'dripB', 20.9, 1.9, r.z1 - 0.0045, 0.3, 0.9, 's');
  decal(b, 'blobA', 20.3, 0.0012, 9.0, 0.7, 0.5, 'up', 0.9);
  decal(b, 'grime', 20.35, 0.0011, r.z0 + 0.1, land - r.x0, 0.2, 'up', PI);
  decal(b, 'scratchA', r.x0 + 0.003, 0.5, 8.1, 0.3, 0.42, 'w', -0.2);
  cagedBulb(b, V(20.6, 2.3, 8.9), 2.6);
  mopBucket(b, 19.98, 10.25);
}

function mopBucket(b, x, z) {
  const mm = hdMats();
  b.beginFrame(x, 0, z, 0.35);
  const P = [[0.0005, 0.04], [0.15, 0.04], [0.16, 0.05], [0.175, 0.32], [0.183, 0.33], [0.175, 0.34], [0.165, 0.31], [0.15, 0.06], [0.0005, 0.06]];
  const g = lathe(P, 20); g.scale(1.25, 1, 0.95);
  gm(b, g, mm.yellow, { cast: true });
  gm(b, new THREE.CylinderGeometry(0.168, 0.168, 0.004, 18).scale(1.25, 1, 0.95), mm.water, { y: 0.24 });
  for (const [cx, cz] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]]) gm(b, new THREE.CylinderGeometry(0.022, 0.022, 0.018, 10), mm.black, { x: cx, y: 0.022, z: cz, rz: HP });
  gm(b, softBox(0.2, 0.16, 0.18, 0.02), mm.galv, { x: 0.09, y: 0.42, z: 0 });
  gm(b, rod(V(0.18, 0.46, 0), V(0.3, 1.02, 0.02), 0.012, 6), mm.galv);
  gm(b, rod(V(-0.08, 0.28, 0.02), V(-0.42, 1.38, 0.28), 0.014, 8), M.woodLight, { cast: true });
  for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2; gm(b, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.06, 0.26, 0.02), V(-0.04 + Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.05), V(Math.cos(a) * 0.1, 0.12, Math.sin(a) * 0.08)]), 4, 0.008, 3, false), mm.ivory); }
  b.endFrame();
  b.collider(x, 0.25, z, 0.48, 0.5, 0.4, 0.35);
}

// ------------------------------------------------------------- elevator
export function elevatorDetails(bld, b, bS, c) {
  const mm = hdMats(), z1 = 9.62;
  // brushed steel jambs and header on the hall side; returns hide the wall cavity
  for (const x of [7.115, 8.185]) gm(bS, softBox(0.07, 2.16, 0.026, 0.006), mm.steel, { x, y: 1.08, z: z1 - 0.013 });
  gm(bS, softBox(1.14, 0.08, 0.026, 0.006), mm.steel, { x: 7.65, y: 2.16, z: z1 - 0.013 });
  for (const x of [7.15, 8.15]) { bx(bS, x, 1.06, (z1 + 9.715) / 2, 0.006, 2.12, 9.715 - z1, mm.steel); bx(b, x, 1.06, (9.765 + c.z0) / 2, 0.006, 2.12, c.z0 - 9.765, mm.steel); }
  bx(bS, 7.65, 2.122, (z1 + 9.715) / 2, 1.0, 0.006, 9.715 - z1, mm.steel);
  bx(b, 7.65, 2.122, (9.765 + c.z0) / 2, 1.0, 0.006, c.z0 - 9.765, mm.steel);
  // grooved aluminum sills either side of the door track
  for (const [za, zb] of [[9.59, 9.715], [9.765, 9.87]]) {
    bx(b, 7.65, 0.003, (za + zb) / 2, 1.06, 0.006, zb - za, mm.steel, { receive: true });
    for (let k = 1; k < 4; k++) bx(b, 7.65, 0.0062, za + (zb - za) * k / 4, 1.0, 0.001, 0.004, mm.black);
  }
  bx(b, 7.65, 0.001, 9.74, 1.06, 0.002, 0.05, mm.black);
  // indicator surround, the fire plaque over the call station, grime round the button
  for (const [x, y, w, hh] of [[7.65, 2.41, 0.34, 0.02], [7.65, 2.23, 0.34, 0.02], [7.49, 2.32, 0.02, 0.2], [7.81, 2.32, 0.02, 0.2]]) gm(bS, softBox(w, hh, 0.012, 0.003), mm.steel, { x, y, z: z1 - 0.008 });
  sign(bS, 'plaque', 8.45, 1.43, z1 - 0.0012, 0.15, 0.105, 's');
  decal(bS, 'smudge', 8.45, 1.12, z1 - 0.0006, 0.2, 0.26, 's');
  // in the car: the inspection certificate in an aluminium frame, a wet stain
  const cx = c.x0 + 0.004, cy = 1.5, cz = 10.62;
  gm(b, card(0.2, 0.275, R('cert')), mm.signs, { x: cx + 0.006, y: cy, z: cz, ry: HP });
  for (const [y, zz, w, hh] of [[cy + 0.148, cz, 0.24, 0.016], [cy - 0.148, cz, 0.24, 0.016], [cy, cz - 0.112, 0.016, 0.31], [cy, cz + 0.112, 0.016, 0.31]]) gm(b, softBox(0.014, hh, w, 0.003), mm.steel, { x: cx + 0.007, y, z: zz });
  gm(b, new THREE.PlaneGeometry(0.21, 0.285), M.glassDirt, { x: cx + 0.012, y: cy, z: cz, ry: HP });
  decal(b, 'ringB', 7.75, c.h - 0.002, 10.9, 0.5, 0.45, 'down', 0.5);
  decal(b, 'scratchB', c.x1 - 0.002, 0.5, 10.95, 0.25, 0.3, 'e');
}
// extra bits for the car operating panel (local frame of the panel group)
export function carPanelExtras(panel) {
  const mm = hdMats(), list = new Map();
  const put = (m, g, x, y, z) => { if (!list.has(m)) list.set(m, []); list.get(m).push(at(g, x, y, z)); };
  put(mm.steel, softBox(0.18, 0.7, 0.01, 0.004), 0, 0.0, -0.002);
  put(mm.signs, card(0.14, 0.03, R('capacity')), 0, 0.3, 0.0035);
  const alarm = new THREE.CylinderGeometry(0.024, 0.024, 0.012, 16); alarm.rotateX(HP); put(mm.red, alarm, 0, -0.27, 0.008);
  const key = new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12); key.rotateX(HP); put(mm.brass, key, 0.05, 0.24, 0.005);
  put(mm.black, new THREE.BoxGeometry(0.002, 0.012, 0.002), 0.05, 0.24, 0.009);
  for (const [m, gs] of list) { const mesh = new THREE.Mesh(merge(gs), m); mesh.receiveShadow = true; panel.add(mesh); }
}
// the hall call station: steel faceplate with a lit ring (local frame of its group, hall at -z)
export function callPlate(group) {
  const mm = hdMats();
  const plate = new THREE.Mesh(softBox(0.1, 0.22, 0.006, 0.003), mm.steel); plate.position.z = 0.014; group.add(plate);
  const ring = new THREE.Mesh(lathe([[0.034, 0], [0.034, 0.003], [0.028, 0.005], [0.0005, 0.005]], 20), mm.steel); ring.rotation.x = -HP; ring.position.z = 0.011; group.add(ring);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.012, 0.008), new THREE.Vector2(0.012, 0.008), new THREE.Vector2(0, -0.01)])), mm.black);
  arrow.position.set(0, 0.065, 0.0105); arrow.rotation.y = PI; group.add(arrow);
}

// ------------------------------------------------------------- 4A
export function room4ADetails(bld, b, r) {
  const mm = hdMats(), rng = new RNG(181);
  F.radiator(b, -3.8, 0.12, 0, 0.9);
  // nails where the pictures hung
  for (const [x, y] of [[-5.2, 1.98], [-4.4, 1.94], [-1.4, 1.82], [-2.3, 1.6]]) gm(b, new THREE.CylinderGeometry(0.003, 0.003, 0.025, 5), mm.steel, { x, y, z: r.z1 - 0.012, rx: HP + 0.25 });
  // carpet tack strips left round the edges when the carpet was torn up
  const strip = (x0, x1, z0, z1) => bx(b, (x0 + x1) / 2, 0.003, (z0 + z1) / 2, Math.max(0.025, x1 - x0), 0.006, Math.max(0.025, z1 - z0), M.woodLight, { receive: true });
  strip(r.x0 + 0.05, r.x1 - 0.05, r.z0 + 0.04, r.z0 + 0.065);
  strip(r.x0 + 0.05, -3.65, r.z1 - 0.065, r.z1 - 0.04); strip(-2.7, r.x1 - 0.05, r.z1 - 0.065, r.z1 - 0.04);
  strip(r.x0 + 0.04, r.x0 + 0.065, r.z0 + 0.1, r.z1 - 0.1); strip(r.x1 - 0.065, r.x1 - 0.04, r.z0 + 0.1, r.z1 - 0.1);
  for (let i = 0; i < 9; i++) gm(b, new THREE.BoxGeometry(rng.range(0.04, 0.12), 0.003, 0.02), M.rug, { x: rng.range(r.x0 + 0.3, r.x1 - 0.3), y: 0.0035, z: r.z1 - 0.052, ry: rng.range(-0.3, 0.3) });
  // the phone cord, cut, curled on the floor
  const cord = [V(-6.27, 0.3, 5.2), V(-6.2, 0.15, 5.22), V(-6.12, 0.01, 5.15)];
  for (let i = 0; i < 22; i++) { const t = i / 21, a = t * PI * 8; cord.push(V(-6.0 + t * 0.35 + Math.cos(a) * 0.025, 0.012 + Math.sin(a) * 0.01, 5.05 - t * 0.22 + Math.sin(a) * 0.02)); }
  gm(b, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 120, 0.0035, 4, false), mm.ivory);
  // a ceiling medallion the bulb hangs from, a switch plate by the door
  gm(b, lathe([[0.0005, -0.004], [0.06, -0.006], [0.1, -0.012], [0.13, -0.014], [0.15, -0.008], [0.17, -0.01], [0.19, 0]], 28), M.trim, { x: -3.2, y: r.h, z: 3.6 });
  b.beginFrame(-2.48, 0, r.z1, PI);
  gm(b, softBox(0.075, 0.115, 0.007, 0.002), mm.ivory, { x: 0, y: 1.22, z: 0.0035 });
  gm(b, softBox(0.012, 0.03, 0.018, 0.003), mm.ivory, { x: 0, y: 1.232, z: 0.01, rx: -0.4 });
  b.endFrame();
  // dust gathered in the corners, and drag marks where furniture went out
  for (const [x, z, s] of [[-6.15, 0.2, 0.05], [-0.3, 0.15, 0.04], [-6.1, 7.4, 0.06], [-0.35, 7.42, 0.035], [-5.9, 7.38, 0.03], [-2.9, 4.0, 0.03]]) gm(b, lump(s, 190 + x * 3, 0.45, 0.35, 1), mm.dust, { x, y: s * 0.2, z });
  for (const [x, z, ry] of [[-1.2, 5.8, 0.1], [-1.9, 6.6, 0.25]]) decal(b, 'scuffB', x, 0.0012, z, 0.9, 0.18, 'up', ry);
  decal(b, 'blobA', -4.6, 0.0013, 2.2, 0.5, 0.35, 'up', 0.7);
}

// ------------------------------------------------------------- per frame
export function updateDressing(bld, dt) {
  const mm = hdMats(), day = G.story ? G.story.day : 1;
  // detectors blink every few seconds
  mm.led.emissiveIntensity = (G.time % 3.2) < 0.08 ? 3 : 0.05;
  // the exit sign is on emergency power; late in the week it starts to go
  if (bld.exitGlow) {
    const flick = day >= 5 && Math.sin(G.time * 13.7) * Math.sin(G.time * 3.1) > 0.93 ? 0.15 : 1;
    bld.exitGlow.intensity = 0.6 * flick; mm.exit.emissiveIntensity = 2.6 * flick;
  }
  // the leak over 4C: a drop every couple of seconds
  const lk = bld.leak;
  if (lk) {
    if (!lk.mesh) { lk.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), mm.water); lk.mesh.scale.y = 1.6; bld.root.add(lk.mesh); }
    lk.t += dt;
    const fall = Math.max(0, lk.t - 1.6), y = lk.pos.y - 4.9 * fall * fall;
    lk.mesh.visible = lk.t > 0.8;
    lk.mesh.position.set(lk.pos.x, Math.max(0.012, y), lk.pos.z);
    if (y <= 0.012) { lk.t = -Math.random() * 1.5; if (G.audio && G.camera.position.distanceTo(lk.pos) < 7) G.audio.play('drip', { pos: lk.mesh.position, vol: 0.35 }); }
  }
}
