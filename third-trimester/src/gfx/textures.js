// Procedural canvas textures + CC0 normal maps (Poly Haven via @pmndrs/assets).
import * as THREE from 'three';
import { assetUrl } from '../core/assets.js';
import { rng, fbm2, clamp } from '../core/util.js';

const cache = new Map();
export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function tex(cv, { repeat = [1, 1], srgb = true, aniso = 8, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso; return t;
}
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ---- CC0 normal maps
const NORMALS = { tile: 'n0025', plaster: 'n0010', wood: 'n0016', fabric: 'n0021', crumple: 'n0014', leather: 'n0015', concrete: 'n0003', peel: 'n0006', plate: 'n0008', knit: 'n0018', speckle: 'n0020', cracked: 'n0024', dimple: 'n0027' };
const loader = new THREE.TextureLoader();
export function normalMap(kind, repeat = [1, 1]) {
  const base = memo('n:' + kind, () => { const t = loader.load(assetUrl(`normals/${NORMALS[kind]}.webp`)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; });
  const t = base.clone(); t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; return t;
}
export function preloadNormals() {
  return Promise.all(Object.keys(NORMALS).map((k) => new Promise((res) => { const t = normalMap(k); const img = t.image; if (img?.complete) res(); else if (t.source?.data) res(); else setTimeout(res, 50); })));
}

function grain(g, w, h, amt = 0.08, seed = 1, size = 1) {
  const r = rng(seed); const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 255 * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, color, n, rmin, rmax, alpha, seed) {
  const r = rng(seed); g.save();
  for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = alpha * (0.4 + r() * 0.6); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  g.restore();
}

// ---- surfaces
export const T = {
  floorTiles: () => memo('floor', () => {
    const S = 1024, cv = canvas(S), g = cv.getContext('2d'), n = 4, ts = S / n, r = rng(3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 0.92 + r() * 0.1; g.fillStyle = `rgb(${215 * v | 0},${200 * v | 0},${172 * v | 0})`; g.fillRect(x * ts, y * ts, ts, ts);
      blotches(g, S, S, 'rgba(150,120,80,1)', 0, 1, 1, 0, 1);
      const gr = g.createLinearGradient(x * ts, y * ts, x * ts + ts, y * ts + ts); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)'); g.fillStyle = gr; g.fillRect(x * ts, y * ts, ts, ts);
    }
    blotches(g, S, S, 'rgba(120,95,60,1)', 26, 20, 90, 0.12, 4);
    grain(g, S, S, 0.06, 5);
    g.fillStyle = '#6d6252'; for (let i = 0; i <= n; i++) { g.fillRect(i * ts - 3, 0, 6, S); g.fillRect(0, i * ts - 3, S, 6); }
    return tex(cv, { repeat: [3.2, 2.3] });
  }),
  plaster: (tint = '#cfd8c4') => memo('plaster' + tint, () => {
    const S = 1024, cv = canvas(S), g = cv.getContext('2d'); g.fillStyle = tint; g.fillRect(0, 0, S, S);
    blotches(g, S, S, 'rgba(255,255,255,1)', 60, 40, 160, 0.08, 7); blotches(g, S, S, 'rgba(90,80,60,1)', 40, 30, 140, 0.07, 8);
    // water stain streaks + scuffs near the floor (bottom of the texture)
    const r = rng(9); g.save(); for (let i = 0; i < 9; i++) { const x = r() * S; const gr = g.createLinearGradient(x, 0, x, S * (0.3 + r() * 0.4)); gr.addColorStop(0, 'rgba(120,100,60,0.18)'); gr.addColorStop(1, 'rgba(120,100,60,0)'); g.fillStyle = gr; g.fillRect(x - 6 - r() * 10, 0, 12 + r() * 20, S); } g.restore();
    g.save(); g.globalAlpha = 0.25; g.strokeStyle = '#3a3226'; for (let i = 0; i < 40; i++) { const x = r() * S, y = S - r() * 90; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + r() * 40, y + (r() - 0.5) * 6); g.stroke(); } g.restore();
    grain(g, S, S, 0.05, 10);
    return tex(cv, { repeat: [2, 1] });
  }),
  wood: (base = '#8a5a35', dark = '#5a361c', key = 'a') => memo('wood' + base + key, () => {
    const W = 512, H = 1024, cv = canvas(W, H), g = cv.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, W, H);
    const r = rng(base.length + key.charCodeAt(0));
    for (let x = 0; x < W; x += 1) { const n = fbm2(x * 0.02, 0.5, 3, 7); g.fillStyle = dark; g.globalAlpha = clamp((n - 0.4) * 1.4) * 0.5; g.fillRect(x, 0, 1, H); }
    g.globalAlpha = 0.35; g.strokeStyle = dark;
    for (let i = 0; i < 26; i++) { const x0 = r() * W; g.lineWidth = 1 + r() * 2; g.beginPath(); for (let y = 0; y <= H; y += 16) { const x = x0 + Math.sin(y * 0.01 + i) * 6 + fbm2(i, y * 0.01, 2) * 20; y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    // knots
    for (let i = 0; i < 3; i++) { const x = r() * W, y = r() * H; g.globalAlpha = 0.5; g.fillStyle = dark; g.beginPath(); g.ellipse(x, y, 8, 18, 0, 0, 7); g.fill(); g.globalAlpha = 0.3; g.strokeStyle = dark; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(x, y, 8 + k * 6, 18 + k * 12, 0, 0, 7); g.stroke(); } }
    g.globalAlpha = 1; grain(g, W, H, 0.05, 2);
    return tex(cv);
  }),
  fabric: (color = '#3e6d8f', pattern = 'weave', key = '') => memo('fab' + color + pattern + key, () => {
    const S = 512, cv = canvas(S), g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, S, S);
    if (pattern === 'weave') { g.globalAlpha = 0.12; for (let i = 0; i < S; i += 3) { g.fillStyle = i % 6 ? '#000' : '#fff'; g.fillRect(i, 0, 1, S); g.fillRect(0, i, S, 1); } }
    if (pattern === 'stripes') { g.globalAlpha = 0.25; g.fillStyle = '#fff'; for (let i = 0; i < S; i += 32) g.fillRect(i, 0, 6, S); }
    if (pattern === 'check') { g.globalAlpha = 0.22; g.fillStyle = '#fff'; for (let i = 0; i < S; i += 64) { g.fillRect(i, 0, 22, S); g.fillRect(0, i, S, 22); } }
    if (pattern === 'floral') { const r = rng(4); for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S; g.globalAlpha = 0.5; g.fillStyle = ['#f2c14e', '#e86a5c', '#f6e7cf'][i % 3]; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 8, y + Math.sin(k * 1.26) * 8, 6, 0, 7); g.fill(); } } }
    g.globalAlpha = 1; blotches(g, S, S, 'rgba(0,0,0,1)', 12, 30, 100, 0.06, 3); grain(g, S, S, 0.06, 6);
    return tex(cv);
  }),
  rug: () => memo('rug', () => {
    const W = 1024, H = 1024, cv = canvas(W, H), g = cv.getContext('2d');
    g.fillStyle = '#8b2f2a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8c779'; g.lineWidth = 14; g.strokeRect(40, 40, W - 80, H - 80); g.lineWidth = 6; g.strokeRect(80, 80, W - 160, H - 160);
    g.fillStyle = '#1f3d5c'; g.fillRect(110, 110, W - 220, H - 220);
    const cx = W / 2, cy = H / 2;
    for (let k = 0; k < 6; k++) { g.save(); g.translate(cx, cy); g.rotate(k * Math.PI / 3); g.fillStyle = k % 2 ? '#e8c779' : '#c4553f'; g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 160); g.lineTo(0, 280); g.lineTo(-60, 160); g.closePath(); g.fill(); g.restore(); }
    g.fillStyle = '#f2e3c2'; g.beginPath(); g.arc(cx, cy, 50, 0, 7); g.fill();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillStyle = '#c4553f'; g.beginPath(); g.arc(cx + Math.cos(a) * 360, cy + Math.sin(a) * 360, 28, 0, 7); g.fill(); }
    blotches(g, W, H, 'rgba(0,0,0,1)', 30, 40, 160, 0.1, 5); grain(g, W, H, 0.12, 9);
    return tex(cv, { wrap: false });
  }),
  metal: (color = '#9aa0a6', key = '') => memo('metal' + color + key, () => {
    const S = 256, cv = canvas(S), g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.15; for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; g.fillRect(0, Math.random() * S, S, 1); }
    g.globalAlpha = 1; blotches(g, S, S, 'rgba(110,70,30,1)', 6, 6, 30, 0.25, 4); grain(g, S, S, 0.05, 2);
    return tex(cv);
  }),
  laminate: (color = '#e9e2cf') => memo('lam' + color, () => {
    const S = 512, cv = canvas(S), g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, S, S);
    const r = rng(2); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() * 80 | 0},${r() * 60 | 0},${r() * 40 | 0},${r() * 0.3})`; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
    blotches(g, S, S, 'rgba(120,90,50,1)', 10, 20, 60, 0.12, 3);
    return tex(cv);
  }),
};

// ---- art
// Abstract flame painting (like the one above the sofa in the reference photo): reds, oranges, a little green.
export function flamePainting() {
  return memo('painting', () => {
    const W = 512, H = 640, cv = canvas(W, H), g = cv.getContext('2d'), r = rng(42);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d0b14'); bg.addColorStop(1, '#1a1210'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cols = ['#ff5a1f', '#ffb21f', '#e8361c', '#ffd95a', '#ff7a2f', '#3fa35a', '#7ad66b', '#c21f3a'];
    for (let i = 0; i < 70; i++) {
      const x = 40 + r() * (W - 80), base = H * (0.75 + r() * 0.2), top = H * (0.15 + r() * 0.4), w = 8 + r() * 26;
      g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.55 + r() * 0.4;
      g.beginPath(); g.moveTo(x - w, base); g.bezierCurveTo(x - w * 0.6, base - (base - top) * 0.5, x + w * (r() - 0.5) * 2, top + 60, x + (r() - 0.5) * 30, top); g.bezierCurveTo(x + w * 0.5, top + 80, x + w * 0.8, base - (base - top) * 0.4, x + w, base); g.closePath(); g.fill();
    }
    g.globalAlpha = 0.35; for (let i = 0; i < 400; i++) { g.fillStyle = cols[i % 5]; g.fillRect(r() * W, H * 0.3 + r() * H * 0.6, 3, 1 + r() * 8); }
    g.globalAlpha = 1; grain(g, W, H, 0.08, 4);
    return tex(cv, { wrap: false });
  });
}
// Our wedding photo: Sunny + Gary at the karaoke bar, drawn like a snapshot.
export function weddingPhoto() {
  return memo('wedding', () => {
    const W = 320, H = 400, cv = canvas(W, H), g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#3a1a4a'); bg.addColorStop(1, '#ff6fa8'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) { g.fillStyle = `hsla(${i * 37},90%,70%,0.5)`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H * 0.5, 4 + Math.random() * 8, 0, 7); g.fill(); }
    // Gary (tall grey, big black eyes)
    g.fillStyle = '#c4ad82'; g.fillRect(170, 200, 80, 200); g.fillStyle = '#8d88a3'; g.beginPath(); g.ellipse(210, 150, 46, 62, 0, 0, 7); g.fill();
    g.fillStyle = '#050508'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(210 + s * 20, 150, 16, 9, s * 0.4, 0, 7); g.fill(); }
    // Sunny (tan, grey tee, holding a mic)
    g.fillStyle = '#5d6268'; g.fillRect(70, 230, 90, 170); g.fillStyle = '#a87452'; g.beginPath(); g.ellipse(115, 190, 34, 42, 0, 0, 7); g.fill();
    g.fillStyle = '#151110'; g.beginPath(); g.ellipse(115, 162, 34, 18, 0, Math.PI, 0); g.fill();
    g.strokeStyle = '#1a1110'; g.lineWidth = 3; g.beginPath(); g.arc(115, 200, 12, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#222'; g.fillRect(150, 230, 10, 50); g.beginPath(); g.arc(155, 228, 9, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 22px Caveat, cursive'; g.fillText('just married!! ♥', 20, 40); g.font = '16px Caveat, cursive'; g.fillText('karaoke night, 3 a.m.', 22, 380);
    grain(g, W, H, 0.1, 3);
    return tex(cv, { wrap: false });
  });
}
export function poster(kind) {
  return memo('poster' + kind, () => {
    const W = 360, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
    if (kind === 'lifeline') {
      g.fillStyle = '#f3e9d2'; g.fillRect(0, 0, W, H); g.fillStyle = '#c8302a'; g.fillRect(0, 0, W, 120);
      g.fillStyle = '#fff'; g.font = 'bold 54px "Big Shoulders Stencil", sans-serif'; g.textAlign = 'center'; g.fillText('LIFELINE 24', W / 2, 80);
      g.fillStyle = '#2a2a2a'; g.font = 'italic 26px Spectral, serif'; g.fillText('We Answer Everything.', W / 2, 170);
      g.font = 'bold 30px Spectral, serif'; g.fillText('EMPLOYEE', W / 2, 300); g.fillText('OF THE MONTH', W / 2, 340);
      g.fillStyle = '#c8302a'; g.font = 'bold 40px Caveat, cursive'; g.fillText('Sunny!!', W / 2, 410); g.fillStyle = '#555'; g.font = '18px Spectral, serif'; g.fillText('(the only employee)', W / 2, 450);
      g.strokeStyle = '#c8302a'; g.lineWidth = 6; g.beginPath(); g.arc(W / 2, 236, 34, 0, 7); g.stroke();
    } else if (kind === 'movie') {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#081028'); bg.addColorStop(1, '#3a0a2a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#7dffb0'; g.beginPath(); g.moveTo(W / 2 - 60, 260); g.lineTo(W / 2 + 60, 260); g.lineTo(W / 2 + 140, 460); g.lineTo(W / 2 - 140, 460); g.closePath(); g.globalAlpha = 0.3; g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#bfc6d6'; g.beginPath(); g.ellipse(W / 2, 240, 110, 26, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(W / 2, 222, 48, 26, 0, Math.PI, 0); g.fill();
      for (let i = 0; i < 7; i++) { g.fillStyle = '#ffde59'; g.beginPath(); g.arc(W / 2 - 84 + i * 28, 246, 5, 0, 7); g.fill(); }
      g.fillStyle = '#ffde59'; g.font = 'bold 48px "Big Shoulders Stencil", sans-serif'; g.textAlign = 'center'; g.fillText('THEY CAME', W / 2, 80); g.fillText('FOR LOVE', W / 2, 130);
      g.fillStyle = '#fff'; g.font = 'italic 18px Spectral, serif'; g.fillText('a romance from beyond the 7th Drift', W / 2, 495);
    } else if (kind === 'wanted') {
      g.fillStyle = '#e9e0c8'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.font = 'bold 64px "Big Shoulders Stencil", sans-serif'; g.textAlign = 'center'; g.fillText('REPORT', W / 2, 80);
      g.font = 'bold 30px "Special Elite", monospace'; g.fillText('ALIEN SYMPATHIZERS', W / 2, 130);
      g.fillStyle = '#8d88a3'; g.beginPath(); g.ellipse(W / 2, 270, 70, 90, 0, 0, 7); g.fill(); g.fillStyle = '#000'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + s * 28, 270, 22, 12, s * 0.4, 0, 7); g.fill(); }
      g.strokeStyle = '#b3261e'; g.lineWidth = 10; g.beginPath(); g.arc(W / 2, 270, 110, 0, 7); g.moveTo(W / 2 - 78, 192); g.lineTo(W / 2 + 78, 348); g.stroke();
      g.fillStyle = '#111'; g.font = '20px "Special Elite", monospace'; g.fillText('Dept. of Terrestrial Purity', W / 2, 430); g.fillText('HOTLINE 1-800-PURE', W / 2, 460);
    }
    grain(g, W, H, 0.08, kind.length);
    return tex(cv, { wrap: false });
  });
}
// Lucky Noodle packet / cup label
export function noodleLabel(color, flavor) {
  return memo('nl' + color + flavor, () => {
    const W = 256, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
    const c = '#' + new THREE.Color(color).getHexString();
    g.fillStyle = c; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(W / 2, H * 0.62, 90, 52, 0, 0, 7); g.fill();
    g.strokeStyle = '#e0b04a'; g.lineWidth = 5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(70 + i * 22, H * 0.55); g.bezierCurveTo(80 + i * 22, H * 0.5, 60 + i * 22, H * 0.7, 75 + i * 22, H * 0.72); g.stroke(); }
    g.fillStyle = '#fff'; g.font = 'bold 40px "Big Shoulders Stencil", sans-serif'; g.textAlign = 'center'; g.fillText('LUCKY', W / 2, 52); g.fillText('NOODLE', W / 2, 92);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 20px Spectral, serif'; g.fillText(flavor, W / 2, H - 22);
    g.fillStyle = '#ffde59'; g.beginPath(); g.arc(W - 36, 36, 24, 0, 7); g.fill(); g.fillStyle = '#c8302a'; g.font = 'bold 15px sans-serif'; g.fillText('NEW', W - 36, 41);
    return tex(cv, { wrap: false });
  });
}
export function labelTex(text, { bg = '#f2ead8', fg = '#222', w = 256, h = 128, font = 'bold 34px Spectral, serif', sub = '' } = {}) {
  return memo('lab' + text + bg + fg + sub, () => {
    const cv = canvas(w, h), g = cv.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
    if (sub) { g.font = '18px Spectral, serif'; g.fillText(sub, w / 2, h * 0.75); }
    return tex(cv, { wrap: false });
  });
}
