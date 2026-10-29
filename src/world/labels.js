// Printed artwork for packaging, posters, notes and signs: Bangkok, Wednesday
// 2 July 1997 (B.E. 2540). Every brand here is a fictional parody. Thai text is
// set in Kanit / Mitr / Sarabun / Itim (Google Fonts, with system Thai faces as
// the fallback); anything drawn before those web fonts finish loading is
// redrawn once they arrive, so no label is stuck in a fallback face.
//
// Every texture goes through printed(key, ...) with a stable key, so a real
// image can replace a whole label by key. Parts of a label that would carry a
// photograph on the real package (the cat, the cows, the bowl of noodles, the
// calendar temple...) are "photo windows": flat placeholders until a photo is
// handed in with setLabelPhoto(slot, image). PHOTO_SLOTS lists each window's
// label key, its rectangle in label pixels and what the photo should show.
import * as THREE from 'three';
import { printed, ageCanvas, IMAGE_OVERRIDES } from '../gfx/textures.js';

const FK = '"Kanit", "Leelawadee UI", Tahoma, "Thonburi", sans-serif';
const FM = '"Mitr", "Kanit", "Leelawadee UI", Tahoma, "Thonburi", sans-serif';
const FS = '"Sarabun", "Leelawadee UI", Tahoma, "Thonburi", sans-serif';
const FH = '"Itim", "Leelawadee UI", "Thonburi", cursive';
const INK = '#1d130c';
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- redraw (fonts, photos)
const drawn = [];
function P(key, w, h, draw) {
  const t = printed(key, w, h, draw);
  if (!t.userData.relabel) {
    const canvas = t.image;
    t.userData.relabel = () => {
      // leave alone a texture whose drawing has been swapped for a real image
      if (t.image !== canvas || !canvas || !canvas.getContext || t.userData.photo) return;
      const c = canvas.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, w, h); draw(c, w, h); t.needsUpdate = true;
    };
    drawn.push(t);
  }
  return t;
}
const relabelAll = () => { for (const t of drawn) t.userData.relabel(); };
if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
  const faces = ['800 24px Kanit', '600 24px Kanit', '600 24px Mitr', '400 24px Sarabun', '700 24px Sarabun', '400 24px Itim'];
  Promise.all(faces.map((f) => document.fonts.load(f, 'กขคไทย ABC 123').catch(() => null)))
    .then((r) => { if (r.some((x) => x && x.length)) relabelAll(); })
    .catch(() => {});
}

// photo windows
const photos = {};
export const PHOTO_SLOTS = {};
export function setLabelPhoto(slot, img) { photos[slot] = img; relabelAll(); }
function photo(c, slot, label, x, y, w, h, base, about, { round = false } = {}) {
  const m = c.getTransform();
  const rect = [Math.round(x * m.a + m.e), Math.round(y * m.d + m.f), Math.round(w * m.a), Math.round(h * m.d)];
  const s = PHOTO_SLOTS[slot] || (PHOTO_SLOTS[slot] = { label, rects: [], about });
  if (!s.rects.some((r) => r.join() === rect.join())) s.rects.push(rect);
  c.save(); c.beginPath();
  if (round) c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); else c.rect(x, y, w, h);
  c.clip();
  const img = photos[slot] || (IMAGE_OVERRIDES[slot] && IMAGE_OVERRIDES[slot].img);
  if (img && (img.naturalWidth || img.width)) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const k = Math.max(w / iw, h / ih);
    c.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
  } else { c.fillStyle = base; c.fillRect(x, y, w, h); }
  c.restore();
}

// ---------------------------------------------------------------- helpers
const thai = (s) => String(s).replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[d]);
const isThai = (s) => /[฀-๿]/.test(s);
function rng(seed) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

function txt(c, s, x, y, size, color, { font = FK, align = 'center', bold = '800', stroke = null, sw = 2, outer = null, ow = 0, italic = '', maxW = 0, rot = 0, alpha = 1, base = 'middle' } = {}) {
  c.save();
  c.font = `${italic} ${bold} ${size}px ${font}`;
  c.textAlign = align; c.textBaseline = base; c.lineJoin = 'round'; c.miterLimit = 2;
  c.globalAlpha *= alpha;
  c.translate(x, y); if (rot) c.rotate(rot);
  if (maxW) { const m = c.measureText(s).width + (outer ? ow : stroke ? sw : 0); if (m > maxW) c.scale(maxW / m, 1); }
  if (outer) { c.lineWidth = ow; c.strokeStyle = outer; c.strokeText(s, 0, 0); }
  if (stroke) { c.lineWidth = sw; c.strokeStyle = stroke; c.strokeText(s, 0, 0); }
  c.fillStyle = color; c.fillText(s, 0, 0);
  c.restore();
}
function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
function fillInk(c, fill, lw = 2, ink = INK) {
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
function burst(c, x, y, r1, r2, n, rot = 0) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
function hgrad(c, x0, x1, stops) { const g = c.createLinearGradient(x0, 0, x1, 0); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
// draw in a virtual w x h space so the art is not stretched on the mesh face
function virt(c, w, h, vw, vh) { c.setTransform(w / vw, 0, 0, h / vh, 0, 0); }
// label-gun price sticker
function price(c, s, x, y, size = 14, rot = -0.1) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.font = `800 ${size}px ${FK}`;
  const tw = c.measureText(s).width + size * 0.9, th = size * 1.35;
  rr(c, -tw / 2, -th / 2, tw, th, size * 0.2); fillInk(c, '#fbf8ee', Math.max(1, size * 0.09), '#c8161c');
  txt(c, s, 0, size * 0.06, size, '#c8161c');
  c.restore();
}
// plastic sheen: soft diagonal white streaks
function sheen(c, w, h, seed, n = 3, a = 0.22) {
  const R = rng(seed);
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < n; i++) {
    const x = R() * w, sw = (0.04 + R() * 0.08) * w;
    const g = c.createLinearGradient(x - sw, 0, x + sw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a * (0.5 + R())})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.save(); c.translate(x, h / 2); c.rotate(0.25 + R() * 0.2); c.fillRect(-sw, -h, sw * 2, h * 2); c.restore();
  }
  c.restore();
}
// greasy fingerprints, rub marks
function smudge(c, w, h, seed, n = 4, col = '60,40,20', a = 0.1) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = (0.05 + R() * 0.12) * Math.min(w, h);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${a * (0.5 + R())})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
// worn ink: knock small specks out of the print
function wear(c, w, h, seed, n = 40, s = 2) {
  const R = rng(seed);
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { c.fillStyle = `rgba(0,0,0,${0.3 + R() * 0.5})`; ell(c, R() * w, R() * h, s * (0.4 + R()), s * (0.2 + R() * 0.5), R() * 3); c.fill(); }
  c.restore();
}
// text along the top of a circle (centre cx, cy; radius r)
function arcText(c, s, cx, cy, r, size, color, font = FK, bold = '800') {
  c.save(); c.font = `${bold} ${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
  const ws = [...s].map((ch) => c.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0);
  let a = -Math.PI / 2 - tot / r / 2;
  [...s].forEach((ch, i) => {
    const m = a + ws[i] / r / 2;
    c.save(); c.translate(cx + Math.cos(m) * r, cy + Math.sin(m) * r); c.rotate(m + Math.PI / 2); c.fillText(ch, 0, 0); c.restore();
    a += ws[i] / r;
  });
  c.restore();
}
function crimp(c, x0, y0, x1, y1, step = 3, col = 'rgba(0,0,0,0.25)') {
  c.strokeStyle = col; c.lineWidth = 1;
  for (let x = x0; x < x1; x += step) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
}

// ---------------------------------------------------------------- cartoon bits
function leaf(c, x, y, s, rot = 0, col = '#3d9a3a') {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * 0.6, s, 0); c.quadraticCurveTo(0, s * 0.6, -s, 0); fillInk(c, col, Math.max(0.8, s * 0.1));
  c.beginPath(); c.moveTo(-s * 0.8, 0); c.lineTo(s * 0.8, 0); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = Math.max(0.6, s * 0.06); c.stroke();
  c.restore();
}
function flower(c, x, y, s, col = '#e0405a', mid = '#f6d03a', n = 5, rot = 0) {
  for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; ell(c, x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, s * 0.32, a); fillInk(c, col, Math.max(0.6, s * 0.08)); }
  circ(c, x, y, s * 0.28); fillInk(c, mid, Math.max(0.6, s * 0.08));
}
function hen(c, x, y, s) {
  const lw = Math.max(1, s * 0.08);
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  for (const [a, b] of [[-0.95, -0.85], [-0.75, -1.0], [-1.1, -0.6]]) { c.beginPath(); c.moveTo(-s * 0.6, -s * 0.2); c.quadraticCurveTo(a * s, b * s * 0.6, a * s, b * s); c.lineWidth = s * 0.16; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); }
  c.beginPath(); c.moveTo(-s * 0.9, -s * 0.1); c.quadraticCurveTo(-s * 0.9, s * 0.75, 0, s * 0.7); c.quadraticCurveTo(s * 0.8, s * 0.65, s * 0.7, -s * 0.05);
  c.quadraticCurveTo(s * 0.85, -s * 0.85, s * 0.42, -s * 0.78); c.quadraticCurveTo(s * 0.12, -s * 0.7, s * 0.15, -s * 0.2); c.quadraticCurveTo(-s * 0.3, -s * 0.15, -s * 0.9, -s * 0.1);
  fillInk(c, '#fffaf0', lw);
  c.beginPath(); c.arc(-s * 0.15, s * 0.2, s * 0.35, 0.2, Math.PI - 0.4); c.lineWidth = lw * 0.8; c.stroke();
  for (let i = 0; i < 3; i++) { circ(c, s * (0.3 + i * 0.13), -s * (0.85 + (i === 1 ? 0.08 : 0)), s * 0.11); fillInk(c, '#e02020', lw * 0.6); }
  c.beginPath(); c.moveTo(s * 0.72, -s * 0.55); c.lineTo(s * 0.98, -s * 0.48); c.lineTo(s * 0.72, -s * 0.4); c.closePath(); fillInk(c, '#f4b020', lw * 0.6);
  ell(c, s * 0.7, -s * 0.28, s * 0.07, s * 0.12); fillInk(c, '#e02020', lw * 0.5);
  circ(c, s * 0.52, -s * 0.55, s * 0.05); c.fillStyle = INK; c.fill();
  c.restore();
}
function sailboat(c, x, y, s) {
  const lw = Math.max(1, s * 0.09);
  c.beginPath(); c.moveTo(x - s * 0.9, y + s * 0.35); c.lineTo(x + s * 0.9, y + s * 0.35); c.lineTo(x + s * 0.6, y + s * 0.7); c.lineTo(x - s * 0.6, y + s * 0.7); c.closePath(); fillInk(c, '#c8161c', lw);
  c.beginPath(); c.moveTo(x - s * 0.05, y - s * 0.9); c.lineTo(x - s * 0.05, y + s * 0.25); c.lineTo(x - s * 0.75, y + s * 0.25); c.closePath(); fillInk(c, '#fff', lw);
  c.beginPath(); c.moveTo(x + s * 0.05, y - s * 0.75); c.lineTo(x + s * 0.65, y + s * 0.25); c.lineTo(x + s * 0.05, y + s * 0.25); c.closePath(); fillInk(c, '#ffd23a', lw);
}
function dove(c, x, y, s) {
  const lw = Math.max(1, s * 0.09);
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-s * 0.55, s * 0.05); c.lineTo(-s * 1.05, -s * 0.1); c.lineTo(-s * 1.0, s * 0.3); c.closePath(); fillInk(c, '#cfcac0', lw);
  ell(c, 0, s * 0.12, s * 0.62, s * 0.36, -0.1); fillInk(c, '#f4f0e6', lw);
  circ(c, s * 0.58, -s * 0.22, s * 0.24); fillInk(c, '#f4f0e6', lw);
  c.beginPath(); c.moveTo(s * 0.8, -s * 0.26); c.lineTo(s * 1.02, -s * 0.18); c.lineTo(s * 0.8, -s * 0.12); c.closePath(); fillInk(c, '#f0a020', lw * 0.6);
  c.beginPath(); c.moveTo(-s * 0.3, s * 0.05); c.quadraticCurveTo(-s * 0.1, -s * 0.85, s * 0.35, -s * 0.7); c.quadraticCurveTo(s * 0.2, -s * 0.2, s * 0.25, s * 0.1); c.closePath(); fillInk(c, '#ddd8ce', lw);
  circ(c, s * 0.64, -s * 0.26, s * 0.05); c.fillStyle = INK; c.fill();
  c.restore();
}
function hornbill(c, x, y, s) {
  const lw = Math.max(1, s * 0.08);
  c.save(); c.translate(x, y);
  ell(c, -s * 0.15, s * 0.1, s * 0.5, s * 0.55); fillInk(c, '#1e1e22', lw);
  c.beginPath(); c.moveTo(s * 0.15, -s * 0.15); c.quadraticCurveTo(s * 0.9, -s * 0.1, s * 1.05, s * 0.45); c.quadraticCurveTo(s * 0.6, s * 0.15, s * 0.15, s * 0.15); c.closePath(); fillInk(c, '#f4c430', lw);
  c.beginPath(); c.moveTo(s * 0.12, -s * 0.18); c.quadraticCurveTo(s * 0.55, -s * 0.55, s * 0.8, -s * 0.15); c.quadraticCurveTo(s * 0.5, -s * 0.2, s * 0.12, -s * 0.18); fillInk(c, '#e8601c', lw);
  circ(c, -s * 0.02, -s * 0.05, s * 0.09); fillInk(c, '#fff', lw * 0.6); circ(c, -s * 0.02, -s * 0.05, s * 0.04); c.fillStyle = INK; c.fill();
  c.fillStyle = '#f4f0e6'; c.beginPath(); c.moveTo(-s * 0.55, s * 0.35); c.quadraticCurveTo(-s * 0.2, s * 0.75, s * 0.1, s * 0.5); c.quadraticCurveTo(-s * 0.2, s * 0.5, -s * 0.55, s * 0.35); c.fill();
  c.restore();
}
function wheat(c, x, y, s, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.strokeStyle = '#8a5a14'; c.lineWidth = Math.max(1, s * 0.06); c.beginPath(); c.moveTo(0, s); c.lineTo(0, -s * 0.9); c.stroke();
  for (let i = 0; i < 5; i++) for (const k of [-1, 1]) { ell(c, k * s * 0.13, -s * 0.75 + i * s * 0.28, s * 0.09, s * 0.17, k * 0.5); fillInk(c, '#e8b23a', Math.max(0.6, s * 0.04), '#8a5a14'); }
  c.restore();
}
// ---------------------------------------------------------------- the labels
export const L = {
  // "Meow Dee" cat food: box of 6 tuna pouches (front 0.19 x 0.25)
  catBox: () => P('catfood-box', 256, 320, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#ffd84a', '#f7a21e', '#ee8a14']); c.fillRect(0, 0, w, h);
    photo(c, 'photo-catfood-box', 'catfood-box', 0, 74, w, 164, '#e3a45c', 'a ginger tabby cat licking its lips beside a bowl of wet tuna cat food; bright 90s studio packshot on a warm yellow-orange backdrop');
    c.fillStyle = '#1d4fa8'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, 74);
    for (let x = w; x >= 0; x -= 16) c.quadraticCurveTo(x - 8, 86, x - 16, 74);
    c.closePath(); c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    txt(c, 'เหมียวดี', w / 2, 34, 50, '#fff', { font: FM, bold: '600', stroke: INK, sw: 8, maxW: 230 });
    txt(c, 'MEOW DEE', w / 2, 66, 15, '#ffd84a', { stroke: INK, sw: 3 });
    burst(c, 214, 108, 30, 21, 12, 0.1); fillInk(c, '#e8201c', 2.5);
    txt(c, 'ใหม่!', 214, 103, 17, '#fff', { rot: 0.15 }); txt(c, 'NEW', 214, 120, 10, '#ffd84a', { rot: 0.15 });
    c.fillStyle = '#d8281c'; c.beginPath(); c.moveTo(6, 238); c.lineTo(w - 6, 238); c.lineTo(w - 18, 254); c.lineTo(w - 6, 270); c.lineTo(6, 270); c.lineTo(18, 254); c.closePath(); fillInk(c, '#d8281c', 3);
    txt(c, 'รสปลาทูน่า · TUNA', w / 2, 254, 22, '#fff', { stroke: INK, sw: 4, maxW: 210 });
    c.fillStyle = '#1d4fa8'; c.fillRect(0, 280, w, 40);
    txt(c, 'อาหารแมวชนิดเปียก · บรรจุ ๖ ซอง', w / 2, 292, 13, '#fff', { font: FS, bold: '700', maxW: 236 });
    txt(c, '6 × 85 g · ผลิตในประเทศไทย', w / 2, 309, 11, '#ffd84a', { font: FS, bold: '700', maxW: 236 });
    price(c, '59.-', 40, 110, 15, -0.15);
    smudge(c, w, h, 3, 5); ageCanvas(c, w, h, 0.14, 3);
  }),
  // single foil pouch (front 0.085 x 0.13)
  catPacket: () => P('catfood-pouch', 128, 192, (c, w, h) => {
    c.fillStyle = hgrad(c, 0, w, ['#8e959e', '#eef1f4', '#b8bec6', '#f4f6f8', '#868c94']); c.fillRect(0, 0, w, h);
    c.setLineDash([4, 3]); c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 18); c.lineTo(w - 4, 18); c.stroke(); c.setLineDash([]);
    txt(c, '✂ ฉีกตรงนี้ TEAR', w / 2, 9, 9, '#333', { font: FS, bold: '700' });
    rr(c, 6, 24, w - 12, 140, 10); fillInk(c, '#1d4fa8', 2.5);
    txt(c, 'เหมียวดี', w / 2, 44, 28, '#fff', { font: FM, bold: '600', stroke: INK, sw: 5, maxW: 112 });
    photo(c, 'photo-catfood-pouch', 'catfood-pouch', 14, 62, w - 28, 62, '#d39a5c', 'close-up of a tabby cat face looking into the camera, licking its nose');
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(14, 62, w - 28, 62);
    rr(c, 14, 128, w - 28, 22, 11); fillInk(c, '#e8201c', 2);
    txt(c, 'ปลาทูน่า', w / 2, 139, 15, '#fff', { maxW: 92 });
    txt(c, 'ในเยลลี่ · TUNA IN JELLY', w / 2, 158, 8, '#ffd84a', { font: FS, bold: '700', maxW: 108 });
    txt(c, 'อาหารแมว 85 g', w / 2, 176, 11, '#1d2a4a', { font: FS, bold: '700' });
    crimp(c, 0, h - 10, w, h, 3);
    sheen(c, w, h, 5, 2, 0.25);
  }),
  // tin of tuna cat food: wraps right round a 0.04 x 0.045 can
  catCan: () => P('catfood-can', 256, 64, (c, w, h) => {
    virt(c, w, h, 360, 64);
    c.fillStyle = '#ffd23a'; c.fillRect(0, 0, 360, 64);
    c.fillStyle = '#1d4fa8'; c.fillRect(0, 0, 360, 9); c.fillRect(0, 55, 360, 9);
    for (const x0 of [0, 180]) {
      photo(c, 'photo-catfood-can', 'catfood-can', x0 + 8, 13, 46, 38, '#d39a5c', 'a tabby cat eating tuna from a dish (small square crop)');
      txt(c, 'เหมียวดี', x0 + 112, 25, 22, '#1d4fa8', { font: FM, bold: '600', stroke: '#fff', sw: 4, maxW: 104 });
      txt(c, 'ปลาทูน่า · 185 g', x0 + 112, 45, 11, '#c8161c', { font: FS, bold: '700', maxW: 104 });
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    ageCanvas(c, w, h, 0.12, 8);
  }),
  // paper strip on a pulp tray of six eggs (front 0.3 x 0.06)
  eggs: () => P('eggs-tray', 256, 96, (c, w, h) => {
    virt(c, w, h, 480, 96);
    c.fillStyle = '#c4baa6'; c.fillRect(0, 0, 480, 96);
    const R = rng(4); c.fillStyle = 'rgba(90,80,60,0.25)'; for (let i = 0; i < 400; i++) c.fillRect(R() * 480, R() * 96, 1.5, 1.5);
    rr(c, 40, 8, 400, 80, 6); fillInk(c, '#fbf6e2', 2.5, '#c8161c');
    hen(c, 84, 50, 28);
    txt(c, 'ไข่ไก่สด', 210, 34, 34, '#c8161c', { stroke: '#fff', sw: 4, maxW: 150 });
    txt(c, 'FRESH EGGS · ๖ ฟอง', 210, 64, 13, '#2a4a8a', { font: FS, bold: '700' });
    txt(c, 'ฟาร์มป้าสมใจ · ฉะเชิงเทรา', 210, 80, 11, '#555', { font: FS, bold: '700' });
    circ(c, 335, 46, 28); fillInk(c, '#2a8a3a', 2.5);
    txt(c, 'เบอร์', 335, 36, 13, '#fff', { bold: '600' }); txt(c, '๒', 335, 58, 26, '#fff');
    txt(c, 'บรรจุ 30 มิ.ย. 40', 400, 26, 10, 'rgba(110,40,140,0.85)', { font: FS, bold: '700', rot: -0.12, maxW: 70 });
    price(c, '12.-', 402, 62, 16, 0.08);
    c.setTransform(1, 0, 0, 1, 0, 0);
    ageCanvas(c, w, h, 0.22, 4);
  }),
  // 1 litre pasteurised milk carton (faces 0.095 x 0.19)
  milk: () => P('milk-carton', 128, 256, (c, w, h) => {
    c.fillStyle = '#fbfaf3'; c.fillRect(0, 0, w, h);
    photo(c, 'photo-milk-cows', 'milk-carton', 0, 0, w, 150, '#a6cf8a', 'black-and-white Holstein dairy cows grazing a green hillside pasture under a blue sky (Muak Lek, Saraburi)');
    txt(c, 'โชคดี', w / 2, 30, 32, '#d8261c', { font: FM, bold: '600', stroke: '#fff', sw: 6, outer: INK, ow: 9 });
    txt(c, 'CHOKDEE DAIRY', w / 2, 54, 10, '#1f56b0', { stroke: '#fff', sw: 3 });
    c.fillStyle = '#1f56b0'; c.fillRect(0, 150, w, 46); c.fillStyle = '#d8261c'; c.fillRect(0, 196, w, 5);
    txt(c, 'นมโคสด 100%', w / 2, 166, 20, '#fff', { maxW: 120 });
    txt(c, 'PASTEURIZED MILK', w / 2, 186, 9, '#cfe4ff', { maxW: 118 });
    txt(c, 'รสจืด · PLAIN', w / 2, 211, 13, '#2a8a2a', { maxW: 118 });
    txt(c, '1 ลิตร', w / 2, 225, 10, '#333', { font: FS, bold: '700' });
    c.fillStyle = '#e8e6dc'; c.fillRect(8, 232, w - 16, 20);
    txt(c, 'ควรบริโภคก่อน 03.07.40', w / 2, 238, 8, '#333', { font: FS, bold: '700', maxW: 108 });
    txt(c, 'เก็บในตู้เย็น 2-8°C · ชิงโชคทองคำ!', w / 2, 247, 7, '#c8161c', { font: FS, bold: '700', maxW: 108 });
    ageCanvas(c, w, h, 0.12, 2);
  }),
  // Sai Nam Phueng orange juice (faces 0.09 x 0.2)
  juice: () => P('orange-juice', 128, 256, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#ffd23a', '#ff9a1a', '#f27a10']); c.fillRect(0, 0, w, h);
    photo(c, 'photo-juice-oranges', 'orange-juice', 0, 68, w, 96, '#f29a3c', 'fresh Sai Nam Phueng tangerines with leaves, one cut in half, juicy close-up');
    txt(c, 'สวนส้ม', w / 2, 32, 32, '#2a7a22', { font: FM, bold: '600', stroke: '#fff', sw: 6, outer: INK, ow: 9 });
    txt(c, 'SUAN SOM', w / 2, 56, 11, '#fff', { stroke: INK, sw: 3 });
    c.fillStyle = '#fbf6e8'; c.fillRect(0, 164, w, 52);
    txt(c, 'น้ำส้มสายน้ำผึ้ง', w / 2, 180, 17, '#e0601a', { maxW: 120 });
    txt(c, '100%', w / 2, 204, 22, '#2a7a22');
    txt(c, 'ORANGE JUICE · 1 ลิตร', w / 2, 226, 9, '#fff', { stroke: '#a84a10', sw: 2.5, maxW: 120 });
    rr(c, 14, 236, w - 28, 15, 7); fillInk(c, '#2a7a22', 0);
    txt(c, 'ไม่เติมน้ำตาล · จากเชียงใหม่', w / 2, 244, 8, '#fff', { font: FS, bold: '700', maxW: 96 });
    ageCanvas(c, w, h, 0.12, 6);
  }),
  // ten-pack box of 5-baht tom yum instant noodles (front 0.19 x 0.27)
  cereal: () => P('noodles-tomyum-box', 256, 352, (c, w, h) => {
    c.fillStyle = '#ffd21e'; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, 190, 10, w / 2, 190, 200); g.addColorStop(0, 'rgba(255,255,220,0.7)'); g.addColorStop(1, 'rgba(255,200,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8201a'; c.fillRect(0, 0, w, 12); c.fillRect(0, h - 12, w, 12);
    photo(c, 'photo-noodles-tomyum', 'noodles-tomyum-box', 0, 146, w, 120, '#e4823a', 'a steaming bowl of tom yum goong instant noodles with shrimp, straw mushrooms, chilli, coriander and lime in a rooster bowl; 3/4 view packshot');
    txt(c, 'ป๊ะป๊า', w / 2, 62, 76, '#e0201a', { font: FM, bold: '600', stroke: '#fff', sw: 10, outer: INK, ow: 15, maxW: 240 });
    txt(c, 'PAPA', 214, 108, 20, '#e0201a', { stroke: '#fff', sw: 4, rot: -0.12 });
    txt(c, 'บะหมี่กึ่งสำเร็จรูป', w / 2, 132, 25, '#7a1208', { maxW: 236 });
    c.fillStyle = '#e0201a'; c.beginPath(); c.moveTo(0, 270); c.lineTo(w, 262); c.lineTo(w, 312); c.lineTo(0, 318); c.closePath(); fillInk(c, '#e0201a', 3);
    txt(c, 'รสต้มยำกุ้ง', w / 2, 286, 38, '#fff', { stroke: INK, sw: 6, maxW: 236, rot: -0.03 });
    txt(c, 'TOM YUM SHRIMP FLAVOUR', w / 2, 308, 12, '#ffe060', { rot: -0.03 });
    txt(c, 'บรรจุ ๑๐ ซอง · 10 × 55 g', w / 2, 330, 13, '#7a1208', { font: FS, bold: '700' });
    burst(c, 40, 184, 33, 24, 14, 0.2); fillInk(c, '#fff', 2.5);
    txt(c, 'ซองละ', 40, 175, 11, '#d8201a', { bold: '600' }); txt(c, '๕ บาท', 40, 192, 16, '#d8201a');
    txt(c, 'อย. 10-1-03539-1-0012', 8, 346, 7, '#ffe8a0', { font: FS, bold: '700', align: 'left' });
    smudge(c, w, h, 9, 6); ageCanvas(c, w, h, 0.12, 5);
  }),
  // Hornbill cream crackers (front 0.12 x 0.2)
  crackers: () => P('cream-crackers', 192, 320, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#2a6cc4', '#1a4a98']); c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += 14) c.fillRect(0, y, w, 6);
    circ(c, 48, 46, 34); fillInk(c, '#f4c430', 3);
    hornbill(c, 42, 46, 24);
    txt(c, 'นกเงือก', 128, 36, 32, '#ffd84a', { font: FM, bold: '600', stroke: INK, sw: 6, maxW: 110 });
    txt(c, 'HORNBILL', 128, 64, 13, '#fff', { stroke: INK, sw: 3 });
    txt(c, 'ครีมแครกเกอร์', w / 2, 108, 26, '#fff', { stroke: INK, sw: 5, maxW: 180 });
    txt(c, 'CREAM CRACKERS', w / 2, 132, 13, '#ffd84a', { maxW: 176 });
    photo(c, 'photo-cream-crackers', 'cream-crackers', 0, 146, w, 118, '#d9b878', 'a loose stack of square cream crackers with docking holes, warm close-up');
    c.fillStyle = '#d8201a'; c.fillRect(0, 266, w, 26);
    txt(c, 'กรอบ อร่อย ทุกแผ่น', w / 2, 279, 16, '#fff', { maxW: 180 });
    txt(c, 'น้ำหนักสุทธิ ๒๐๐ กรัม', w / 2, 306, 12, '#fff', { font: FS, bold: '700' });
    price(c, '18.-', 160, 238, 15, 0.12);
    smudge(c, w, h, 11, 5); ageCanvas(c, w, h, 0.13, 7);
  }),
  // canned sardines in tomato sauce: wraps a 0.038 x 0.105 can
  soup: () => P('sardines-can', 256, 96, (c, w, h) => {
    virt(c, w, h, 218, 96);
    c.fillStyle = '#d4261c'; c.fillRect(0, 0, 218, 48);
    c.fillStyle = '#ffd23a'; c.fillRect(0, 48, 218, 48);
    c.fillStyle = '#fff'; c.fillRect(0, 46, 218, 4);
    photo(c, 'photo-sardines', 'sardines-can', 130, 50, 88, 46, '#c8452e', 'sardines in red tomato sauce on a plate with a tomato and a chilli');
    sailboat(c, 16, 18, 12);
    txt(c, 'ตราเรือใบ', 70, 16, 15, '#fff', { font: FM, bold: '600', stroke: INK, sw: 3 });
    txt(c, 'ปลาซาร์ดีน', 74, 36, 19, '#ffd23a', { stroke: INK, sw: 4, maxW: 108 });
    txt(c, 'ในซอสมะเขือเทศ', 64, 61, 14, '#c8161c', { maxW: 118 });
    txt(c, 'SARDINES IN TOMATO SAUCE', 64, 77, 7, '#7a1208', { maxW: 120 });
    txt(c, 'น้ำหนักสุทธิ 155 g · อย. 11-1-03336-1-0040', 64, 89, 5.5, '#7a1208', { font: FS, bold: '700', maxW: 120 });
    price(c, '12.-', 188, 20, 12, 0.1);
    c.setTransform(1, 0, 0, 1, 0, 0);
    ageCanvas(c, w, h, 0.14, 10);
  }),
  // pickled mustard greens: wraps a 0.038 x 0.105 can
  beans: () => P('pickled-mustard-can', 256, 96, (c, w, h) => {
    virt(c, w, h, 218, 96);
    c.fillStyle = vgrad(c, 0, 96, ['#2a8a44', '#17602c']); c.fillRect(0, 0, 218, 96);
    c.fillStyle = '#e8c430'; c.fillRect(0, 6, 218, 3); c.fillRect(0, 87, 218, 3);
    photo(c, 'photo-pickled-mustard', 'pickled-mustard-can', 158, 26, 56, 50, '#b0b84e', 'a small dish of sweet-and-sour pickled mustard greens (phak kat dong) chunks');
    ell(c, 84, 44, 70, 32); fillInk(c, '#fbf4dc', 2);
    dove(c, 38, 36, 14);
    txt(c, 'ตรานกเขา', 94, 22, 11, '#2a6a3a', { font: FM, bold: '600' });
    txt(c, 'ผักกาดดอง', 96, 42, 21, '#17602c', { maxW: 96 });
    txt(c, 'เปรี้ยวหวาน', 84, 62, 13, '#c8161c');
    txt(c, 'PICKLED MUSTARD GREENS · 140 g', 109, 82, 6.5, '#fff', { maxW: 206 });
    price(c, '9.-', 186, 18, 11, -0.1);
    c.setTransform(1, 0, 0, 1, 0, 0);
    ageCanvas(c, w, h, 0.14, 12);
  }),
  // red soda (nam daeng): wraps a 0.032 x 0.12 can
  cola: () => P('red-soda-can', 192, 96, (c, w, h) => {
    virt(c, w, h, 161, 96);
    c.fillStyle = vgrad(c, 0, 96, ['#f0283a', '#c40c1e', '#8a0614']); c.fillRect(0, 0, 161, 96);
    const R = rng(13); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
    for (let i = 0; i < 26; i++) { circ(c, R() * 161, R() * 96, 1 + R() * 3); c.stroke(); }
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, 60); c.bezierCurveTo(50, 44, 100, 80, 161, 56); c.lineTo(161, 68); c.bezierCurveTo(100, 92, 50, 56, 0, 72); c.fill();
    txt(c, 'ซ่าซ่า', 72, 32, 30, '#fff', { font: FM, bold: '600', italic: 'italic', stroke: INK, sw: 5, rot: -0.08 });
    txt(c, 'ZAA ZAA!', 124, 16, 9, '#ffe060', { rot: -0.08 });
    txt(c, 'น้ำแดง · RED SODA', 80, 84, 11, '#ffe060', { stroke: '#5a0410', sw: 2.5, maxW: 150 });
    txt(c, '325 มล.', 140, 46, 7, '#fff', { font: FS, bold: '700' });
    c.setTransform(1, 0, 0, 1, 0, 0);
    ageCanvas(c, w, h, 0.08, 14);
  }),
  // nam prik pao chilli paste jar (wraps a 0.045 x 0.1 jar)
  pb: () => P('namprikpao-jar', 256, 96, (c, w, h) => {
    virt(c, w, h, 272, 96);
    c.fillStyle = '#ecb82e'; c.fillRect(0, 0, 272, 96);
    c.fillStyle = '#b5161a'; c.fillRect(0, 0, 272, 13); c.fillRect(0, 83, 272, 13);
    c.strokeStyle = '#7a4a0a'; c.lineWidth = 1; c.strokeRect(3, 16, 266, 64);
    circ(c, 44, 48, 31); fillInk(c, '#b5161a', 2);
    photo(c, 'photo-namprikpao-founder', 'namprikpao-jar', 18, 22, 52, 52, '#c9a27a', 'old sepia studio portrait of a smiling Thai auntie with her hair in a bun (the founder on the label), head and shoulders', { round: true });
    circ(c, 44, 48, 26); c.lineWidth = 1.5; c.strokeStyle = '#e8b830'; c.stroke();
    txt(c, 'แม่ทองใบ', 165, 28, 20, '#b5161a', { font: FM, bold: '600', stroke: '#fff', sw: 4 });
    txt(c, 'น้ำพริกเผา', 165, 54, 28, '#6a0c08', { maxW: 180 });
    txt(c, 'CHILLI PASTE IN SOYBEAN OIL', 165, 74, 8, '#6a0c08', { maxW: 180 });
    txt(c, 'สูตรต้นตำรับ ตั้งแต่ พ.ศ. ๒๕๐๕ · 228 g', 136, 89, 7.5, '#ffe8a0', { font: FS, bold: '700', maxW: 260 });
    txt(c, 'สูตรต้นตำรับ ตั้งแต่ พ.ศ. ๒๕๐๕', 136, 7, 7.5, '#ffe8a0', { font: FS, bold: '700' });
    price(c, '25.-', 248, 30, 11, 0.1);
    c.setTransform(1, 0, 0, 1, 0, 0);
    smudge(c, w, h, 15, 4, '120,40,10', 0.18); ageCanvas(c, w, h, 0.15, 16);
  }),
  // lid of a styrofoam box of khao man gai, marker scrawl and shop stamp (0.34 x 0.34)
  pizza: () => P('khaomangai-foambox', 256, 256, (c, w, h) => {
    c.fillStyle = '#f3f2ec'; c.fillRect(0, 0, w, h);
    const R = rng(6);
    for (let i = 0; i < 1400; i++) { const v = 228 + R() * 24; c.fillStyle = `rgb(${v},${v},${v - 4})`; circ(c, R() * w, R() * h, 1 + R() * 2.2); c.fill(); }
    c.strokeStyle = 'rgba(150,150,140,0.45)'; c.lineWidth = 3; rr(c, 14, 14, w - 28, h - 28, 14); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5; rr(c, 17, 17, w - 34, h - 34, 12); c.stroke();
    for (const [x, y, rx, ry] of [[184, 192, 34, 22], [70, 206, 20, 12], [200, 70, 14, 10]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, rx); g.addColorStop(0, 'rgba(220,170,60,0.35)'); g.addColorStop(0.8, 'rgba(220,170,60,0.22)'); g.addColorStop(1, 'rgba(200,150,40,0)');
      c.fillStyle = g; ell(c, x, y, rx, ry, 0.3); c.fill();
    }
    txt(c, 'ข้าวมันไก่', 110, 72, 40, '#141414', { font: FH, bold: '400', rot: -0.07 });
    txt(c, '× 3', 214, 66, 30, '#141414', { font: FH, bold: '400', rot: -0.07 });
    txt(c, 'พิเศษ 1', 92, 118, 24, '#141414', { font: FH, bold: '400', rot: -0.04 });
    txt(c, 'ไม่เอาหนัง!!', 104, 152, 24, '#141414', { font: FH, bold: '400', rot: -0.02 });
    c.strokeStyle = '#141414'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(42, 168); c.quadraticCurveTo(110, 162, 168, 170); c.stroke();
    c.save(); c.translate(198, 176); c.rotate(0.3); c.globalAlpha = 0.72;
    c.strokeStyle = '#c8161c'; c.lineWidth = 2.5; circ(c, 0, 0, 34); c.stroke(); c.lineWidth = 1.2; circ(c, 0, 0, 29); c.stroke();
    txt(c, 'เฮียเส็ง', 0, -8, 15, '#c8161c', { bold: '600' }); txt(c, 'ข้าวมันไก่ ซ.39', 0, 10, 9, '#c8161c', { font: FS, bold: '700', maxW: 54 });
    c.restore(); wear(c, w, h, 31, 30, 2.5);
    c.fillStyle = '#f3f2ec';
    c.save(); c.translate(52, 210); c.rotate(-0.5);
    c.beginPath(); c.moveTo(-6, -24); c.lineTo(6, -24); c.lineTo(4, -14); c.quadraticCurveTo(26, -8, 22, 12); c.quadraticCurveTo(14, 26, 0, 26); c.quadraticCurveTo(-14, 26, -22, 12); c.quadraticCurveTo(-26, -8, -4, -14); c.closePath();
    fillInk(c, 'rgba(120,60,20,0.85)', 1.5, 'rgba(60,40,20,0.7)');
    c.fillStyle = '#e83a1a'; for (let i = 0; i < 6; i++) { circ(c, -10 + (i * 7) % 20, 2 + (i * 5) % 16, 1.6); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.5)'; ell(c, -10, -2, 3, 9, 0.3); c.fill();
    rr(c, -7, -21, 14, 5, 2); fillInk(c, '#e86a9a', 1, '#8a2a4a');
    c.restore();
    smudge(c, w, h, 21, 6, '120,90,40', 0.08); ageCanvas(c, w, h, 0.08, 6);
  }),
  // what you see through a tied plastic bag of kuay tiew: noodles, broth, greens
  takeout: () => P('noodle-soup-bag', 128, 128, (c, w, h) => {
    c.fillStyle = 'rgba(232,236,234,0.32)'; c.fillRect(0, 0, w, h);
    c.fillStyle = vgrad(c, 44, h, ['rgba(214,150,70,0.82)', 'rgba(170,90,32,0.94)', 'rgba(130,64,20,0.98)']); c.fillRect(0, 44, w, h - 44);
    c.fillStyle = 'rgba(255,220,150,0.6)'; c.fillRect(0, 44, w, 3);
    const R = rng(17);
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = R() < 0.5 ? 'rgba(250,240,214,0.95)' : 'rgba(236,220,180,0.9)'; c.lineWidth = 2 + R() * 1.5;
      const y0 = 54 + R() * 66, x0 = R() * w; c.beginPath();
      for (let t = 0; t <= 1; t += 0.1) c.lineTo(x0 - 30 + t * 60, y0 + Math.sin(t * 9 + i) * 6);
      c.stroke();
    }
    for (let i = 0; i < 14; i++) { c.strokeStyle = '#f8f6ea'; c.lineWidth = 1.6; const x = R() * w, y = 56 + R() * 64; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 * (R() - 0.5), y + 7); c.stroke(); }
    for (let i = 0; i < 6; i++) { circ(c, R() * w, 62 + R() * 54, 5 + R() * 2); fillInk(c, '#b88a5a', 1.2, 'rgba(60,30,10,0.7)'); }
    for (let i = 0; i < 4; i++) { c.save(); c.translate(R() * w, 60 + R() * 50); c.rotate(R() * 3); rr(c, -8, -4, 16, 8, 3); fillInk(c, '#e8a0a0', 1, 'rgba(90,30,30,0.6)'); c.restore(); }
    c.fillStyle = '#4aa83a'; for (let i = 0; i < 22; i++) { circ(c, R() * w, 50 + R() * 70, 1.5 + R() * 1.5); c.fill(); }
    c.fillStyle = '#d8281a'; for (let i = 0; i < 26; i++) c.fillRect(R() * w, 50 + R() * 70, 1.6, 1.6);
    c.fillStyle = '#e8b860'; for (let i = 0; i < 18; i++) c.fillRect(R() * w, 48 + R() * 20, 2, 2);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const x = R() * w; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 10 * (R() - 0.5), h / 2, x + 6 * (R() - 0.5), h); c.stroke(); }
    sheen(c, w, h, 19, 3, 0.3);
  }),
  // sandwich-loaf bag, long side (0.26 x 0.11)
  bread: () => P('bread-bag-side', 256, 112, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#b8742e', '#d89a50', '#f0d6a0', '#f4e0b4']); c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2156b8'; c.fillRect(0, 72, w, 40); c.fillStyle = '#d42020'; c.fillRect(0, 68, w, 5);
    wheat(c, 24, 38, 24, -0.2); wheat(c, 36, 40, 22, 0.15);
    txt(c, 'ไร่ทอง', 96, 34, 34, '#d42020', { font: FM, bold: '600', stroke: '#fff', sw: 6, outer: INK, ow: 9 });
    txt(c, 'RAI THONG BAKERY', 96, 60, 9, '#2156b8', { stroke: '#fff', sw: 2.5 });
    txt(c, 'ขนมปังแซนด์วิช', 112, 87, 20, '#fff', { maxW: 200 });
    txt(c, 'SANDWICH BREAD · 500 g', 112, 104, 9, '#ffe060', { maxW: 200 });
    burst(c, 214, 34, 26, 20, 12); fillInk(c, '#ffd23a', 2);
    txt(c, 'สด ใหม่', 214, 27, 12, '#d42020'); txt(c, 'ทุกวัน', 214, 42, 12, '#d42020');
    sheen(c, w, h, 22, 4, 0.28);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; const R = rng(23);
    for (let i = 0; i < 10; i++) { const x = R() * w; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + 8, h / 2, x - 4, h); c.stroke(); }
    ageCanvas(c, w, h, 0.1, 22);
  }),
  breadTop: () => P('bread-bag-top', 64, 128, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#a8642a', '#c07c38', '#a8642a']); c.fillRect(0, 0, w, h);
    c.fillStyle = hgrad(c, 0, w, ['rgba(255,240,200,0.25)', 'rgba(255,255,255,0)', 'rgba(255,240,200,0.25)']); c.fillRect(0, 0, w, h);
    for (let y = 18; y < h; y += 46) txt(c, 'ไร่ทอง', w / 2, y, 14, '#d42020', { font: FM, bold: '600', stroke: '#fff', sw: 3 });
    sheen(c, w, h, 24, 2, 0.3); ageCanvas(c, w, h, 0.1, 24);
  }),
  breadEnd: () => P('bread-bag-end', 96, 96, (c, w, h) => {
    c.fillStyle = '#e8dcc4'; c.fillRect(0, 0, w, h);
    c.beginPath(); c.moveTo(8, h - 6); c.lineTo(8, 34); c.quadraticCurveTo(8, 6, w / 2, 6); c.quadraticCurveTo(w - 8, 6, w - 8, 34); c.lineTo(w - 8, h - 6); c.closePath(); fillInk(c, '#b06a28', 0);
    c.beginPath(); c.moveTo(14, h - 11); c.lineTo(14, 36); c.quadraticCurveTo(14, 13, w / 2, 13); c.quadraticCurveTo(w - 14, 13, w - 14, 36); c.lineTo(w - 14, h - 11); c.closePath(); fillInk(c, '#f8eed8', 0);
    const R = rng(25); c.fillStyle = 'rgba(200,170,120,0.45)'; for (let i = 0; i < 90; i++) { circ(c, 16 + R() * (w - 32), 18 + R() * (h - 32), 0.6 + R() * 1.2); c.fill(); }
    c.save(); c.translate(w / 2, 4); rr(c, -9, -4, 18, 9, 2); fillInk(c, '#e8201c', 1.2); c.restore();
    sheen(c, w, h, 26, 2, 0.3);
  }),
  // moo yong pork floss pack, top with shop sticker (0.09 x 0.065)
  cheese: (sticker = true) => P(sticker ? 'moo-yong-pack' : 'moo-yong-floss', 192, 128, (c, w, h) => {
    c.fillStyle = '#c88a40'; c.fillRect(0, 0, w, h);
    const R = rng(27); c.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      c.strokeStyle = ['#a8642a', '#e2aa5c', '#8a4a1c', '#d8984a', '#f0c278'][i % 5]; c.lineWidth = 1 + R() * 1.4;
      const x = R() * w, y = R() * h, a = R() * TAU, l = 6 + R() * 12;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    if (sticker) {
      c.save(); c.translate(w / 2, h / 2); c.rotate(-0.05);
      rr(c, -64, -36, 128, 72, 8); fillInk(c, '#fff6dc', 3, '#c8161c');
      txt(c, 'หมูหยอง', 0, -12, 28, '#c8161c');
      txt(c, 'สูตรโบราณ · ร้านเจ๊ง้อ', 0, 14, 11, '#5a3a1a', { font: FS, bold: '700', maxW: 116 });
      txt(c, '100 g · 35.-', 0, 28, 10, '#c8161c', { font: FS, bold: '700' });
      c.restore();
    }
    sheen(c, w, h, 28, 3, 0.3); ageCanvas(c, w, h, 0.08, 28);
  }),
  // chocolate wafer bar, top of the wrapper (0.12 x 0.035)
  candy: () => P('wafer-bar', 256, 64, (c, w, h) => {
    virt(c, w, h, 220, 64);
    c.fillStyle = vgrad(c, 0, 64, ['#8a3ab8', '#5a1e88', '#3e1060']); c.fillRect(0, 0, 220, 64);
    c.fillStyle = hgrad(c, 0, 12, ['#9aa0a8', '#e8ecf0']); c.fillRect(0, 0, 12, 64);
    c.fillStyle = hgrad(c, 208, 220, ['#e8ecf0', '#9aa0a8']); c.fillRect(208, 0, 12, 64);
    crimp(c, 1, 0, 12, 64, 2); crimp(c, 209, 0, 220, 64, 2);
    txt(c, 'WAFFY', 56, 30, 28, '#ffd23a', { italic: 'italic', stroke: INK, sw: 5, maxW: 90 });
    txt(c, 'เวเฟอร์ช็อกโกแลต', 154, 19, 13, '#fff', { bold: '600', maxW: 92 });
    txt(c, 'CHOCOLATE WAFER', 154, 33, 7, '#e8c8ff', { maxW: 90 });
    photo(c, 'photo-wafer', 'wafer-bar', 112, 41, 60, 19, '#b07a40', 'a chocolate-coated wafer bar broken in half showing its cream layers');
    circ(c, 194, 44, 11); fillInk(c, '#ffd23a', 1.5); txt(c, '5.-', 194, 45, 10, '#c8161c');
    txt(c, 'ใหม่! กรอบ ๓ ชั้น', 58, 54, 8, '#fff', { font: FS, bold: '700' });
    c.setTransform(1, 0, 0, 1, 0, 0);
    sheen(c, w, h, 30, 2, 0.25); ageCanvas(c, w, h, 0.1, 30);
  }),
  // raw pork belly strips on a foam tray, supermarket weigh label (0.16 x 0.1)
  meat: () => P('pork-belly-tray', 192, 120, (c, w, h) => {
    c.fillStyle = '#f2f1ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(200,60,70,0.25)'; ell(c, 100, 70, 90, 50); c.fill();
    const R = rng(33);
    // three-layer pork: rind, fat and lean in wavy bands, cut side up
    for (let i = 0; i < 4; i++) {
      c.save(); c.translate(w / 2 + (R() - 0.5) * 10, 17 + i * 27); c.rotate((R() - 0.5) * 0.1);
      const L = 84 + R() * 4, H = 13;
      rr(c, -L, -H, L * 2, H * 2, 7); c.save(); c.clip();
      c.fillStyle = '#f3e7dc'; c.fillRect(-L, -H, L * 2, H * 2);
      const band = (y0, y1, col, ph) => {
        c.fillStyle = col; c.beginPath();
        for (let x = -L; x <= L; x += 6) c.lineTo(x, y0 + Math.sin(x * 0.07 + ph) * 1.6);
        for (let x = L; x >= -L; x -= 6) c.lineTo(x, y1 + Math.sin(x * 0.05 + ph * 2) * 1.8);
        c.closePath(); c.fill();
      };
      const ph = R() * 6;
      band(-H, -H + 3, '#dcb48c', ph);
      band(-H + 7, -1, '#c9716e', ph + 1);
      band(3, H - 3, '#bb5c60', ph + 2);
      c.fillStyle = 'rgba(255,240,235,0.35)'; for (let k = 0; k < 14; k++) { ell(c, -L + R() * L * 2, -H + 8 + R() * 14, 3 + R() * 5, 0.8); c.fill(); }
      c.fillStyle = 'rgba(120,20,30,0.18)'; for (let k = 0; k < 6; k++) { ell(c, -L + R() * L * 2, R() * H, 6, 2); c.fill(); }
      c.restore();
      rr(c, -L, -H, L * 2, H * 2, 7); c.lineWidth = 1.5; c.strokeStyle = 'rgba(110,30,30,0.75)'; c.stroke();
      c.restore();
    }
    c.save(); c.translate(146, 90); c.rotate(-0.06);
    rr(c, -44, -27, 88, 54, 2); fillInk(c, '#fffef8', 1, '#999');
    c.fillStyle = '#1f56b0'; c.fillRect(-44, -27, 88, 10);
    txt(c, 'ฟู้ดมาร์ท สุขุมวิท 39', 0, -22, 7, '#fff', { font: FS, bold: '700', maxW: 82 });
    txt(c, 'หมูสามชั้น', -40, -9, 11, '#111', { align: 'left', bold: '600' });
    txt(c, 'ราคา/กก. 78.00', -40, 2, 6.5, '#222', { align: 'left', font: FS, bold: '700', maxW: 44 });
    txt(c, 'น้ำหนัก 0.485', -40, 10, 6.5, '#222', { align: 'left', font: FS, bold: '700', maxW: 44 });
    txt(c, '37.83', 41, 3, 13, '#c8161c', { align: 'right' });
    txt(c, 'บาท', 41, 13, 7, '#c8161c', { align: 'right', font: FS, bold: '700' });
    c.fillStyle = '#111'; for (let i = 0; i < 34; i++) c.fillRect(-40 + i * 2.4, 17, i % 3 ? 1 : 1.7, 7);
    c.restore();
    sheen(c, w, h, 34, 3, 0.25); ageCanvas(c, w, h, 0.1, 33);
  }),
  // Nok's to-do post-it on the fridge
  fridgeNote: () => P('fridge-note', 128, 128, (c, w, h) => {
    c.fillStyle = '#f7e97a'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(0, 0, w, 13);
    const g = c.createLinearGradient(w, h, w - 30, h - 30); g.addColorStop(0, 'rgba(120,90,0,0.25)'); g.addColorStop(1, 'rgba(120,90,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(120,70,20,0.18)'; ell(c, 118, 20, 4, 3); c.fill(); ell(c, 112, 24, 1.6, 1.4); c.fill();
    const ink = '#22307a';
    const lines = ['กาแฟ coffee', 'ซื้อข้าวสาร rice', 'feed ขนม !!', 'งาน 8:30 ห้ามสาย', 'ขยะ วันอังคาร'];
    const R = rng(37);
    lines.forEach((s, i) => {
      const y = 24 + i * 21;
      c.save(); c.translate(10, y); c.rotate((R() - 0.5) * 0.15); c.strokeStyle = ink; c.lineWidth = 1.3; c.strokeRect(-4, -5, 9, 9); c.restore();
      txt(c, s, 20, y + 1, 15, ink, { font: FH, bold: '400', align: 'left', maxW: i === 4 ? 86 : 104, rot: (R() - 0.5) * 0.04 });
    });
    c.strokeStyle = '#c8161c'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(48, 96); c.quadraticCurveTo(70, 93, 92, 97); c.stroke();
    c.save(); c.translate(116, 112); c.rotate(0.15);
    c.strokeStyle = ink; c.lineWidth = 1.2; circ(c, 0, 2, 6.5); c.stroke();
    c.beginPath(); c.moveTo(-6, -1); c.lineTo(-5, -8); c.lineTo(-2, -4); c.moveTo(6, -1); c.lineTo(5, -8); c.lineTo(2, -4); c.stroke();
    c.fillStyle = ink; circ(c, -2.5, 1, 1); c.fill(); circ(c, 2.5, 1, 1); c.fill();
    c.restore();
    ageCanvas(c, w, h, 0.1, 37);
  }),
  // condo unit plate: chipped blue enamel, white numerals
  aptNumber: (n) => P('aptnum' + n, 128, 64, (c, w, h) => {
    const s = String(n);
    c.fillStyle = '#163a78'; c.fillRect(0, 0, w, h);
    rr(c, 2, 2, w - 4, h - 4, 9); c.fillStyle = vgrad(c, 0, h, ['#3468bc', '#1f4c9a', '#183f86']); c.fill();
    rr(c, 7, 7, w - 14, h - 14, 6); c.lineWidth = 2.5; c.strokeStyle = '#f4f1e6'; c.stroke();
    for (const x of [15, w - 15]) { circ(c, x, h / 2, 3); fillInk(c, '#c8c4b8', 1, '#555'); c.strokeStyle = '#555'; c.beginPath(); c.moveTo(x - 2, h / 2 - 1); c.lineTo(x + 2, h / 2 + 1); c.stroke(); }
    txt(c, 'ห้อง', w / 2, 17, 8, '#dfe8f8', { font: FS, bold: '700' });
    txt(c, s, w / 2, h / 2 + 8, 30, '#fbf8ee', { maxW: w - 44 });
    const R = rng(hashStr(s));
    for (let i = 0; i < 3; i++) {
      const side = Math.floor(R() * 4), t = 0.1 + R() * 0.8;
      const x = side < 2 ? 10 + t * (w - 20) : side === 2 ? 4 : w - 4, y = side === 0 ? 4 : side === 1 ? h - 4 : 8 + t * (h - 16);
      c.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, r = 1.4 + R() * 2.2; c.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r); } c.closePath();
      fillInk(c, '#3a3430', 0.8, '#b0b0b8');
    }
    c.fillStyle = 'rgba(120,70,20,0.35)'; c.fillRect(14, h / 2 + 3, 2, 14);
    ageCanvas(c, w, h, 0.16, 7);
  }),
  // generic building sign; lines may mix Thai and English, auto-fit to width
  sign: (key, lines, bg = '#f0f0e8', fg = '#111') => P('sign' + key, 256, 128, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = vgrad(c, 0, h, ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.12)']); c.fillRect(0, 0, w, h);
    rr(c, 8, 8, w - 16, h - 16, 8); c.lineWidth = 5; c.strokeStyle = fg; c.stroke();
    const n = Math.max(1, lines.length), top = 16, H = h - 32, lh = H / n;
    lines.forEach((s, i) => {
      s = String(s);
      const th = isThai(s);
      let size = Math.min(lh * (th ? 0.7 : 0.78), 72);
      c.font = `600 ${size}px ${FK}`;
      const maxW = w - 36, mw = c.measureText(s).width;
      if (mw * 0.72 > maxW) size *= maxW / (mw * 0.72);
      txt(c, s, w / 2, top + lh * (i + 0.5) + size * (th ? 0.08 : 0.05), size, fg, { bold: '600', maxW });
    });
    const R = rng(hashStr(key));
    c.fillStyle = 'rgba(110,70,30,0.18)';
    for (let i = 0; i < 3; i++) { const x = 12 + R() * (w - 24); c.fillRect(x, h - 10 - R() * 20, 1.5 + R() * 2, 30); }
    ageCanvas(c, w, h, 0.2, key.length);
  }),
  // wall calendar: July 1997 / กรกฎาคม ๒๕๔๐. The 2nd is circled; each loop crosses it out again.
  calendar: (crossed = 0) => P('cal' + crossed, 192, 256, (c, w, h) => {
    c.fillStyle = '#f6f1e2'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b8161a'; c.fillRect(0, 0, w, 7);
    circ(c, w / 2, 3.5, 2.5); c.fillStyle = '#3a2a20'; c.fill();
    const px = 8, py = 11, pw = w - 16, ph = 88;
    photo(c, 'photo-calendar-1997-07', 'cal0 … cal6', px, py, pw, ph, '#d98a5c', 'saturated 90s wall-calendar photo: a golden chedi and temple hall at sunset over a lotus pond (or a jungle waterfall), wide landscape');
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.strokeRect(px, py, pw, ph);
    txt(c, 'กรกฎาคม ' + thai(2540), w / 2, 112, 22, '#b8161a', { maxW: 176 });
    txt(c, 'JULY 1997', w / 2, 130, 10, '#444', { bold: '600' });
    c.fillStyle = '#e6dcc4'; c.fillRect(8, 138, w - 16, 13);
    const cw = (w - 16) / 7, gx = (col) => 8 + cw * (col + 0.5), gy = (row) => 162 + row * 17;
    ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].forEach((d, i) => txt(c, d, gx(i), 145, 9, i === 0 ? '#c01818' : '#333', { bold: '600' }));
    const wanPhra = [4, 12, 19, 27];
    txt(c, '29', gx(0), gy(0), 12, '#c8bca8', { bold: '600' }); txt(c, '30', gx(1), gy(0), 12, '#c8bca8', { bold: '600' });
    const pos = {};
    for (let d = 1; d <= 31; d++) {
      const idx = d + 1, col = idx % 7, row = Math.floor(idx / 7), x = gx(col), y = gy(row);
      pos[d] = [x, y];
      txt(c, String(d), x, y, 13, col === 0 ? '#c01818' : '#2a2a2a', { bold: '600' });
      if (wanPhra.includes(d)) { circ(c, x + 9, y - 6, 1.8); c.fillStyle = '#d89a10'; c.fill(); }
    }
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.7;
    for (let r = 0; r <= 5; r++) { c.beginPath(); c.moveTo(8, 153 + r * 17); c.lineTo(w - 8, 153 + r * 17); c.stroke(); }
    txt(c, 'ด้วยความปรารถนาดีจาก บงล. รุ่งเรือง ฟายแนนซ์', w / 2, 248, 8, '#1a2f7a', { font: FS, bold: '700', maxW: 180 });
    ageCanvas(c, w, h, 0.12, 9);
    // red marker, drawn after the ageing so it looks fresh
    const red = '#d0101a', R = rng(77 + crossed * 13);
    const stroke = (lw, f) => { c.strokeStyle = red; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); f(); c.stroke(); };
    const X = (x, y, s, j = 0) => stroke(1.6 + j * 0.25, () => { const a = () => (R() - 0.5) * j * 2; c.moveTo(x - s + a(), y - s + a()); c.lineTo(x + s + a(), y + s * 0.8 + a()); c.moveTo(x + s + a(), y - s + a()); c.lineTo(x - s + a(), y + s * 0.8 + a()); });
    const [x1, y1] = pos[1], [x2, y2] = pos[2];
    X(x1, y1, 6);
    stroke(1.8, () => { c.ellipse(x2, y2, 12, 9, -0.2, 0.3, 0.3 + TAU * 1.08); });
    for (let i = 0; i < crossed; i++) X(x2 + (R() - 0.5) * 3, y2 + (R() - 0.5) * 3, 7 + Math.min(i, 5), Math.min(i, 4));
    if (crossed >= 2) {
      const n = (crossed - 1) * 7;
      stroke(1 + crossed * 0.15, () => { c.moveTo(x2 - 10, y2); for (let i = 0; i < n; i++) c.lineTo(x2 + (R() - 0.5) * (20 + crossed * 2), y2 + (R() - 0.5) * (14 + crossed)); });
    }
    if (crossed >= 3) {
      const [x31, y31] = pos[31];
      txt(c, crossed >= 5 ? 'อีกแล้ว อีกแล้ว' : 'อีกแล้ว', x31 + 34, y31 + 1, 13, red, { font: FH, bold: '400', rot: -0.12, maxW: 60 });
      stroke(1.4, () => { for (let i = 0; i < crossed + 1; i++) { const tx = 140 + i * 5 + (i % 5 === 4 ? 4 : 0); if (i % 5 === 4) { c.moveTo(tx - 22, 128); c.lineTo(tx + 2, 122); } else { c.moveTo(tx, 120); c.lineTo(tx - 1, 132); } } });
    }
    if (crossed >= 5) {
      for (let d = 3; d <= 8; d++) { const [x, y] = pos[d]; stroke(1.2, () => { c.moveTo(x - 8, y + (R() - 0.5) * 4); c.lineTo(x + 8, y + (R() - 0.5) * 4); }); }
      txt(c, '๒ ๒ ๒ ๒', 44, 90, 15, red, { font: FH, bold: '400', rot: 0.06 });
      c.globalAlpha = 0.85; ell(c, x2 + 2, y2 + 2, 4, 3); c.fillStyle = red; c.fill(); c.globalAlpha = 1;
    }
  }),
  poster: (key, draw, w = 128, h = 176) => P('poster' + key, w, h, draw),

  // ------------------------------------------------ extra prints used by items.js
  // finance-company promo mug print (wraps ~110° of the mug)
  mug: () => P('mug-finance-print', 192, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const navy = '#1a2f7a';
    circ(c, w / 2, 36, 27); fillInk(c, navy, 0);
    c.save(); circ(c, w / 2, 36, 22); c.clip();
    c.fillStyle = '#e8b830'; circ(c, w / 2, 44, 13); c.fill();
    c.strokeStyle = '#e8b830'; c.lineWidth = 2.5; for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 7; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * 16, 44 + Math.sin(a) * 16); c.lineTo(w / 2 + Math.cos(a) * 22, 44 + Math.sin(a) * 22); c.stroke(); }
    c.fillStyle = navy; c.fillRect(w / 2 - 25, 44, 50, 20);
    c.strokeStyle = '#fff'; c.lineWidth = 2; for (let i = 0; i < 2; i++) { c.beginPath(); for (let x = -22; x <= 22; x += 2) c.lineTo(w / 2 + x, 49 + i * 6 + Math.sin(x * 0.5) * 1.5); c.stroke(); }
    c.restore();
    circ(c, w / 2, 36, 27); c.lineWidth = 2; c.strokeStyle = '#e8b830'; c.stroke();
    txt(c, 'เงินทุนรุ่งเรือง', w / 2, 82, 24, navy, { maxW: 184 });
    txt(c, 'RUNGRUANG FINANCE', w / 2, 102, 13, '#c41a1a', { maxW: 180 });
    txt(c, 'มั่นคง · ปลอดภัย · ดอกเบี้ยสูง', w / 2, 118, 11, navy, { font: FS, bold: '700', maxW: 184 });
    wear(c, w, h, 41, 70, 2.2);
  }),
  // flowered enamel plate, top face (circle inscribed in the canvas)
  plate: () => P('enamel-plate', 256, 256, (c, w, h) => {
    const cx = w / 2, cy = h / 2;
    c.fillStyle = '#1d3c8a'; c.fillRect(0, 0, w, h);
    circ(c, cx, cy, 120); c.fillStyle = '#f4f1e8'; c.fill();
    const g = c.createRadialGradient(cx, cy, 20, cx, cy, 120); g.addColorStop(0, 'rgba(0,0,0,0.04)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(0.9, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
    c.fillStyle = g; c.fill();
    circ(c, cx, cy, 108); c.lineWidth = 1.5; c.strokeStyle = '#1d3c8a'; c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, x = cx + Math.cos(a) * 92, y = cy + Math.sin(a) * 92;
      leaf(c, cx + Math.cos(a + 0.2) * 92, cy + Math.sin(a + 0.2) * 92, 9, a + 0.2 + Math.PI / 2, '#3a9a4a');
      leaf(c, cx + Math.cos(a - 0.2) * 92, cy + Math.sin(a - 0.2) * 92, 8, a - 0.2 + Math.PI / 2, '#3a9a4a');
      flower(c, x, y, 11, i % 2 ? '#e0405a' : '#f08a2a', '#f6d03a', 5, a);
    }
    leaf(c, cx - 14, cy + 8, 12, 0.6); leaf(c, cx + 14, cy + 10, 11, -0.7);
    flower(c, cx, cy - 4, 16, '#e0405a', '#f6d03a', 6);
    c.fillStyle = 'rgba(190,140,40,0.13)'; ell(c, cx + 30, cy + 26, 34, 18, 0.5); c.fill();
    const R = rng(43);
    c.strokeStyle = 'rgba(120,120,120,0.25)'; c.lineWidth = 0.8;
    for (let i = 0; i < 18; i++) { const a = R() * TAU, r = R() * 80; c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * r + (R() - 0.5) * 30, cy + Math.sin(a) * r + (R() - 0.5) * 30); c.stroke(); }
    for (let i = 0; i < 6; i++) {
      const a = R() * TAU, r = 112 + R() * 9, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      c.beginPath(); for (let k = 0; k < 7; k++) { const b = k / 7 * TAU, q = 2 + R() * 4; c.lineTo(x + Math.cos(b) * q, y + Math.sin(b) * q); } c.closePath();
      fillInk(c, '#1a1a1c', 1, '#7a7a80');
    }
    ageCanvas(c, w, h, 0.08, 43);
  }),
  // Mae Ping rice whisky bottle label
  whisky: () => P('rice-whisky-label', 128, 176, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#f6e2a0', '#ecd080', '#e2bc62']); c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a5a12'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8); c.lineWidth = 1; c.strokeRect(9, 9, w - 18, h - 18);
    for (const [x, y] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]]) { circ(c, x, y, 5); fillInk(c, '#b5161a', 1, '#8a5a12'); }
    c.save(); c.beginPath(); c.rect(12, 12, w - 24, 60); c.clip();
    c.beginPath(); c.arc(w / 2, 118, 104, 0, TAU); c.arc(w / 2, 118, 90, 0, TAU, true); c.fillStyle = '#b5161a'; c.fill('evenodd');
    c.restore();
    arcText(c, 'THAI SPIRIT', w / 2, 118, 97, 10, '#f6e2a0');
    txt(c, 'แม่ปิง', w / 2, 66, 40, '#b5161a', { font: FM, bold: '600', stroke: '#fff4c8', sw: 4, outer: '#5a3a0a', ow: 7 });
    circ(c, w / 2, 106, 18); fillInk(c, '#e2a830', 2, '#8a5a12');
    c.fillStyle = '#2a6a4a'; c.beginPath(); c.moveTo(w / 2 - 15, 112); c.lineTo(w / 2 - 6, 96); c.lineTo(w / 2, 104); c.lineTo(w / 2 + 8, 92); c.lineTo(w / 2 + 15, 112); c.closePath(); c.fill();
    c.strokeStyle = '#3a6aa8'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2 - 14, 116); c.quadraticCurveTo(w / 2, 110, w / 2 + 14, 116); c.stroke();
    txt(c, 'สุราปรุงพิเศษ', w / 2, 136, 15, '#5a3a0a', { bold: '600' });
    txt(c, 'MAE PING', w / 2, 152, 13, '#b5161a');
    txt(c, '40 ดีกรี · 750 ซีซี', w / 2, 163, 9.5, '#5a3a0a', { font: FS, bold: '700' });
    smudge(c, w, h, 45, 4, '90,50,10', 0.14); ageCanvas(c, w, h, 0.15, 45);
  }),
  // 90s TV remote, top face
  remote: () => P('tv-remote', 96, 320, (c, w, h) => {
    c.fillStyle = vgrad(c, 0, h, ['#38383c', '#26262a', '#1e1e22']); c.fillRect(0, 0, w, h);
    rr(c, 30, 6, 36, 12, 4); fillInk(c, '#3a0a0e', 1, '#000');
    txt(c, 'DYNASTAR', w / 2, 30, 11, '#c8c8cc', { maxW: 80 });
    const btn = (x, y, bw, bh, col, label, lc = '#111', ls = 9, cap = null) => {
      rr(c, x - bw / 2, y - bh / 2, bw, bh, 4); fillInk(c, col, 1, '#0a0a0a');
      c.fillStyle = 'rgba(255,255,255,0.22)'; rr(c, x - bw / 2 + 2, y - bh / 2 + 1.5, bw - 4, bh * 0.35, 3); c.fill();
      if (label) txt(c, label, x, y + 0.5, ls, lc, { maxW: bw - 3 });
      if (cap) txt(c, cap, x, y + bh / 2 + 6, 7, '#b8b8bc', { font: FS, bold: '700', maxW: bw + 8 });
    };
    btn(72, 52, 20, 16, '#d8261c', '', '#fff', 9, 'เปิด/ปิด');
    btn(24, 52, 22, 13, '#8a8a90', 'TV/AV', '#111', 7);
    btn(48, 52, 18, 13, '#8a8a90', 'MUTE', '#111', 6);
    const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-/--', '0', 'C'];
    nums.forEach((s, i) => btn(22 + (i % 3) * 26, 84 + Math.floor(i / 3) * 24, 22, 17, ['3', '5', '7', '9'].includes(s) ? '#a6a6ac' : '#8a8a90', s, '#111', s.length > 1 ? 7 : 11));
    rr(c, 14, 182, 30, 76, 14); fillInk(c, '#4a4a50', 1.2, '#0a0a0a'); rr(c, 52, 182, 30, 76, 14); fillInk(c, '#4a4a50', 1.2, '#0a0a0a');
    txt(c, '▲', 29, 198, 12, '#e8e8ec'); txt(c, '▼', 29, 242, 12, '#e8e8ec'); txt(c, '+', 67, 198, 16, '#e8e8ec'); txt(c, '−', 67, 242, 16, '#e8e8ec');
    txt(c, 'CH', 29, 220, 9, '#c8c8cc'); txt(c, 'VOL', 67, 220, 9, '#c8c8cc');
    txt(c, 'ช่อง', 29, 268, 9, '#b8b8bc', { font: FS, bold: '700' }); txt(c, 'เสียง', 67, 268, 9, '#b8b8bc', { font: FS, bold: '700' });
    btn(26, 290, 26, 12, '#6a6a70', 'SLEEP', '#ddd', 6); btn(70, 290, 26, 12, '#6a6a70', 'TIMER', '#ddd', 6);
    txt(c, 'REMOTE CONTROL', w / 2, 310, 7, '#8a8a90');
    c.fillStyle = 'rgba(230,230,230,0.25)'; for (const [x, y] of [[72, 52], [29, 198], [67, 198], [67, 242], [48, 84]]) { ell(c, x, y, 5, 3); c.fill(); }
    smudge(c, w, h, 47, 6, '200,190,170', 0.1); ageCanvas(c, w, h, 0.12, 47);
  }),
  // paperback covers: 0 ghost comic, 1 dream-number book, 2 pocket romance
  book: (i = 0) => P(['book-ghost-comic', 'book-dream-numbers', 'book-pocket-novel'][i] || 'book-ghost-comic', 256, 352, (c, w, h) => {
    if (i === 0) {
      c.fillStyle = vgrad(c, 0, h, ['#1a0a2a', '#3a1a4a', '#1a4a2a']); c.fillRect(0, 0, w, h);
      circ(c, 190, 120, 40); c.fillStyle = '#f6eeb0'; c.fill();
      c.fillStyle = '#0a0a10';
      for (const [x, ht] of [[20, 120], [236, 150]]) { c.fillRect(x - 3, h - ht, 6, ht); for (let k = 0; k < 8; k++) { c.beginPath(); c.ellipse(x, h - ht, 30, 6, k * 0.4, 0, TAU); c.fill(); } }
      // a krasue: a floating head trailing its glowing insides
      const glow = c.createRadialGradient(128, 230, 10, 128, 230, 110); glow.addColorStop(0, 'rgba(140,255,150,0.45)'); glow.addColorStop(1, 'rgba(140,255,150,0)');
      c.fillStyle = glow; c.fillRect(0, 110, w, 240);
      c.fillStyle = '#100810'; c.beginPath(); c.moveTo(80, 196); c.quadraticCurveTo(66, 236, 76, 262); c.lineTo(180, 262); c.quadraticCurveTo(190, 236, 176, 196); c.closePath(); c.fill();
      c.lineCap = 'round';
      for (const [x, cx, ex, col] of [[112, 92, 100, '#e86a8a'], [126, 140, 118, '#d84a6a'], [140, 166, 150, '#e86a8a'], [120, 110, 132, '#c83a5a']]) {
        c.beginPath(); c.moveTo(x, 252); c.bezierCurveTo(cx, 280, ex + 20, 300, ex, 336);
        c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5; c.strokeStyle = col; c.stroke();
      }
      c.beginPath(); c.moveTo(128, 262); c.bezierCurveTo(108, 252, 104, 278, 128, 296); c.bezierCurveTo(152, 278, 148, 252, 128, 262); fillInk(c, '#c8101a', 2.5);
      ell(c, 128, 204, 44, 52); fillInk(c, '#b8dcb0', 3);
      c.fillStyle = '#100810'; c.beginPath(); c.moveTo(80, 214); c.quadraticCurveTo(82, 140, 128, 148); c.quadraticCurveTo(174, 140, 176, 214); c.quadraticCurveTo(160, 166, 128, 164); c.quadraticCurveTo(96, 166, 80, 214); c.fill();
      for (const k of [-1, 1]) { ell(c, 128 + k * 18, 200, 10, 6.5); fillInk(c, '#fff', 2); circ(c, 128 + k * 18, 200, 3.5); c.fillStyle = '#d01010'; c.fill(); }
      c.beginPath(); c.moveTo(110, 228); c.quadraticCurveTo(128, 240, 146, 228); c.quadraticCurveTo(128, 234, 110, 228); fillInk(c, '#c01010', 2);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(118, 231); c.lineTo(121, 238); c.lineTo(124, 232.5); c.moveTo(132, 232.5); c.lineTo(135, 238); c.lineTo(138, 231); c.fill();
      c.fillStyle = '#fff'; rr(c, 10, 10, 150, 26, 4); c.fill();
      txt(c, 'การ์ตูนผีหรรษา', 85, 24, 17, '#1a1a1a', { maxW: 140 });
      burst(c, 220, 32, 28, 21, 12); fillInk(c, '#ffd23a', 2.5);
      txt(c, 'ราคา', 220, 24, 10, '#c01010', { bold: '600' }); txt(c, '๑๐ บาท', 220, 39, 12, '#c01010');
      txt(c, 'กระสือ', 122, 88, 56, '#e8201c', { stroke: '#ffd23a', sw: 5, outer: INK, ow: 11, rot: -0.05, maxW: 210 });
      txt(c, 'ล่าคืนเพ็ญ', 128, 130, 28, '#ffd23a', { stroke: INK, sw: 6, rot: -0.05 });
      txt(c, 'เล่มที่ ๑๓๙', 214, 338, 11, '#d8d8d8', { font: FS, bold: '700' });
    } else if (i === 1) {
      c.fillStyle = vgrad(c, 0, h, ['#c8161a', '#8a0a10']); c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e8b830'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
      txt(c, 'ตำราทำนายฝัน', w / 2, 46, 34, '#ffd23a', { stroke: INK, sw: 6, maxW: 228 });
      txt(c, 'ฉบับสมบูรณ์', w / 2, 82, 18, '#fff', { bold: '600' });
      const cx = w / 2, cy = 186;
      circ(c, cx, cy, 72); fillInk(c, '#e8b830', 3, '#5a3a0a'); circ(c, cx, cy, 56); fillInk(c, '#8a0a10', 2, '#5a3a0a'); circ(c, cx, cy, 22); fillInk(c, '#e8b830', 2, '#5a3a0a');
      c.strokeStyle = '#5a3a0a'; c.lineWidth = 1.5;
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12; c.beginPath(); c.moveTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); c.lineTo(cx + Math.cos(a) * 72, cy + Math.sin(a) * 72); c.stroke(); }
      ['ชวด', 'ฉลู', 'ขาล', 'เถาะ', 'มะโรง', 'มะเส็ง', 'มะเมีย', 'มะแม', 'วอก', 'ระกา', 'จอ', 'กุน'].forEach((s, k) => {
        const a = (k + 0.5) * TAU / 12 - Math.PI / 2; txt(c, s, cx + Math.cos(a) * 64, cy + Math.sin(a) * 64, 8, '#5a0a0a', { font: FS, bold: '700', rot: a + Math.PI / 2 });
      });
      c.fillStyle = '#ffd23a'; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; burst(c, cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 5, 2, 4); c.fill(); }
      c.strokeStyle = '#8a0a10'; c.lineWidth = 2; circ(c, cx, cy, 13); c.stroke(); circ(c, cx, cy, 3.5); c.fillStyle = '#8a0a10'; c.fill();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); c.stroke(); }
      c.save(); c.translate(w / 2, 296); c.rotate(-0.04);
      rr(c, -110, -26, 220, 52, 8); fillInk(c, '#ffd23a', 3);
      txt(c, 'เลขเด็ดงวด ๑ ก.ค.', 0, -10, 16, '#c8161a', { maxW: 200 });
      txt(c, '14 · 07', 0, 12, 22, '#1a1a1a');
      c.restore();
      txt(c, 'ราคา ๒๕ บาท', w - 20, 338, 10, '#ffd23a', { font: FS, bold: '700', align: 'right' });
    } else {
      photo(c, 'photo-novel-cover', 'book-pocket-novel', 0, 0, w, h, '#c87a5c', 'romantic 90s Thai novel cover photo: sunset over green rice paddies with sugar palms and a teak house on stilts');
      c.fillStyle = vgrad(c, 0, 150, ['rgba(40,10,30,0.35)', 'rgba(40,10,30,0)']); c.fillRect(0, 0, w, 150);
      txt(c, 'นวนิยาย', w / 2, 30, 16, '#fff', { bold: '600', alpha: 0.9 });
      txt(c, 'รักนี้ที่ปลายฟ้า', w / 2, 78, 36, '#fff', { font: FM, bold: '600', outer: 'rgba(60,20,40,0.85)', ow: 7, maxW: 232 });
      txt(c, 'ศรีสุดา', w / 2, 118, 20, '#ffe6a0', { font: FH, bold: '400' });
      txt(c, 'สำนักพิมพ์ดาวทอง · ราคา ๔๕ บาท', w / 2, 338, 10, '#fff', { font: FS, bold: '700' });
    }
    smudge(c, w, h, 50 + i, 5, '30,20,10', 0.12); ageCanvas(c, w, h, 0.16, 50 + i);
  }),
  // cheap plastic torch: print runs along the body (u = around, v = along)
  torch: () => P('torch-body', 128, 192, (c, w, h) => {
    c.fillStyle = hgrad(c, 0, w, ['#a01a14', '#e8382a', '#c8261e', '#8a120e']); c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 140; y < h - 8; y += 6) c.fillRect(0, y, w, 2.5);
    c.fillStyle = '#fbf4e0'; c.fillRect(34, 10, 60, 124);
    c.save(); c.translate(64, 72); c.rotate(-Math.PI / 2);
    txt(c, 'ไฟฉาย', -24, -12, 24, '#c8261e', { maxW: 70 });
    txt(c, 'SUPER LIGHT', 34, -12, 11, '#1a2f7a', { maxW: 50 });
    txt(c, 'ตราม้าบิน · ใช้ถ่าน D 2 ก้อน', 0, 14, 10, '#1a1a1a', { font: FS, bold: '700', maxW: 116 });
    c.restore();
    wear(c, w, h, 53, 50, 2); ageCanvas(c, w, h, 0.12, 53);
  }),
};

export function labelMat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, envMapIntensity: o.env ?? 0.8, transparent: o.transparent ?? false, side: o.side ?? THREE.FrontSide });
}
