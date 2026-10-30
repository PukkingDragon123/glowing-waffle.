// Pixel icons for Doorways 98, painted once on 32×32 canvases and cached as data URLs.
import { canvas } from './dom.js';

const cache = new Map();
const K = '#000', D = '#404040', G = '#808080', L = '#c0c0c0', Wt = '#ffffff';

function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
function box(c, x, y, w, h, fill, line = K) { R(c, x, y, w, h, line); R(c, x + 1, y + 1, w - 2, h - 2, fill); }
function bevel(c, x, y, w, h, fill = L) { R(c, x, y, w, h, D); R(c, x, y, w - 1, h - 1, Wt); R(c, x + 1, y + 1, w - 2, h - 2, G); R(c, x + 1, y + 1, w - 3, h - 3, fill); }
function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function poly(c, pts, col, stroke) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); if (col) { c.fillStyle = col; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } }

const DRAW = {
  computer(c) {
    bevel(c, 4, 2, 24, 19, '#d8d0b8'); R(c, 7, 5, 18, 12, K); R(c, 8, 6, 16, 10, '#0a3f8f');
    R(c, 9, 7, 6, 1, '#7fd7ff'); R(c, 9, 9, 9, 1, '#7fd7ff'); R(c, 9, 11, 4, 1, '#7fd7ff');
    R(c, 12, 21, 8, 3, '#a8a088'); bevel(c, 3, 24, 26, 6, '#d8d0b8');
    for (let i = 0; i < 6; i++) R(c, 6 + i * 3, 26, 2, 1, G);
  },
  folder(c) {
    poly(c, [2, 8, 12, 8, 14, 6, 2, 6], '#c9a227');
    box(c, 2, 8, 28, 20, '#f6d35b', '#7a5c00'); R(c, 3, 9, 26, 2, '#fff0a8');
    R(c, 2, 6, 11, 3, '#7a5c00'); R(c, 3, 7, 9, 2, '#f6d35b');
  },
  folder_open(c) {
    box(c, 2, 6, 24, 20, '#c9a227', '#7a5c00'); R(c, 4, 8, 18, 14, Wt);
    poly(c, [2, 27, 8, 13, 31, 13, 26, 27], '#f6d35b', '#7a5c00');
  },
  txt(c) {
    poly(c, [6, 2, 20, 2, 26, 8, 26, 30, 6, 30], Wt, K); poly(c, [20, 2, 20, 8, 26, 8], L, K);
    for (let i = 0; i < 8; i++) R(c, 9, 11 + i * 2.2, i % 3 === 2 ? 9 : 14, 1, '#3054a8');
  },
  img(c) {
    poly(c, [6, 2, 20, 2, 26, 8, 26, 30, 6, 30], Wt, K); poly(c, [20, 2, 20, 8, 26, 8], L, K);
    R(c, 8, 11, 16, 16, '#7fc7ff'); poly(c, [8, 27, 8, 21, 14, 17, 24, 23, 24, 27], '#3c9a3c'); circ(c, 20, 15, 2, '#ffe14d');
  },
  bin_empty(c) {
    poly(c, [7, 8, 25, 8, 23, 29, 9, 29], '#e0e0e0', K);
    for (let i = 0; i < 5; i++) R(c, 10 + i * 3, 10, 1, 18, G);
    box(c, 5, 5, 22, 4, L);
  },
  bin_full(c) {
    DRAW.bin_empty(c);
    poly(c, [8, 6, 14, 1, 20, 4, 25, 2, 24, 7], Wt, K); R(c, 12, 3, 6, 1, '#3054a8');
  },
  mail(c) {
    box(c, 2, 8, 28, 18, '#fffef0'); poly(c, [3, 9, 16, 19, 29, 9], null, K);
    c.strokeStyle = K; c.beginPath(); c.moveTo(3, 25); c.lineTo(13, 17); c.moveTo(29, 25); c.lineTo(19, 17); c.stroke();
    box(c, 22, 10, 6, 6, '#d6342c', '#7a1010'); R(c, 4, 22, 3, 2, '#2f5bd3'); R(c, 8, 22, 3, 2, '#d6342c');
  },
  browser(c) {
    circ(c, 16, 16, 12, '#1a5fb4'); circ(c, 16, 16, 11, '#3d8be8');
    poly(c, [10, 8, 15, 6, 18, 10, 14, 14, 9, 12], '#3c9a3c'); poly(c, [17, 15, 23, 14, 25, 20, 20, 25, 17, 21], '#3c9a3c');
    c.strokeStyle = '#ffb000'; c.lineWidth = 2; c.beginPath(); c.ellipse(16, 16, 15, 5, -0.4, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1;
  },
  hotline(c) {
    poly(c, [4, 20, 8, 12, 24, 12, 28, 20, 28, 28, 4, 28], '#d6342c', '#5a0a0a');
    box(c, 12, 16, 8, 8, '#f0f0f0', '#5a0a0a'); circ(c, 16, 20, 2, '#5a0a0a');
    poly(c, [3, 9, 9, 5, 23, 5, 29, 9, 26, 12, 22, 9, 10, 9, 6, 12], '#b02020', '#5a0a0a');
    box(c, 20, 1, 12, 8, '#ffe14d', '#7a5c00'); c.fillStyle = K; c.font = 'bold 7px monospace'; c.fillText('24', 22, 8);
  },
  paint(c) {
    poly(c, [16, 3, 28, 8, 30, 18, 24, 28, 12, 29, 4, 22, 3, 12, 8, 5], '#e8d2a0', '#6a4a10');
    circ(c, 10, 11, 2.5, '#d6342c'); circ(c, 16, 8, 2.5, '#ffe14d'); circ(c, 23, 11, 2.5, '#3c9a3c'); circ(c, 25, 18, 2.5, '#2f5bd3'); circ(c, 14, 22, 3, '#fffef0');
    c.strokeStyle = '#6a4a10'; c.lineWidth = 3; c.beginPath(); c.moveTo(30, 2); c.lineTo(18, 16); c.stroke(); c.lineWidth = 1; circ(c, 18, 16, 2, K);
  },
  calc(c) {
    bevel(c, 6, 2, 20, 28, '#bdb8a8'); R(c, 9, 5, 14, 6, '#9fb88a'); R(c, 9, 5, 14, 1, K);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) box(c, 9 + x * 5, 13 + y * 4, 4, 3, y === 3 && x === 2 ? '#d6342c' : Wt);
  },
  abductor(c) {
    R(c, 0, 0, 32, 32, '#0b0b2a'); R(c, 4, 4, 1, 1, Wt); R(c, 26, 6, 1, 1, Wt); R(c, 18, 2, 1, 1, Wt);
    poly(c, [12, 12, 20, 12, 27, 30, 5, 30], 'rgba(120,255,120,0.55)');
    c.fillStyle = '#9aa0b0'; c.beginPath(); c.ellipse(16, 11, 12, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7fd7ff'; c.beginPath(); c.ellipse(16, 8, 5, 4, 0, Math.PI, 0); c.fill();
    box(c, 11, 22, 10, 5, Wt); R(c, 13, 23, 3, 2, K); R(c, 11, 27, 1, 2, K); R(c, 19, 27, 1, 2, K);
  },
  noodle(c) {
    for (let i = 0; i < 4; i++) { const cols = ['#f2b134', '#d6342c', '#3c8fd1', '#f2b134']; box(c, 6 + (i % 2) * 3, 23 - i * 6, 18, 6, cols[i]); R(c, 9 + (i % 2) * 3, 25 - i * 6, 12, 1, Wt); }
    c.strokeStyle = '#6a4a10'; c.beginPath(); c.moveTo(16, 0); c.lineTo(16, 5); c.stroke();
  },
  display(c) {
    bevel(c, 3, 3, 26, 20, L); const cols = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f'];
    cols.forEach((col, i) => R(c, 6 + i * 3, 6, 3, 14, col)); R(c, 12, 23, 8, 3, G); R(c, 8, 26, 16, 3, L);
  },
  notepad(c) {
    box(c, 6, 4, 20, 26, '#fffef0'); for (let i = 0; i < 5; i++) { R(c, 8 + i * 4, 2, 2, 5, G); }
    for (let i = 0; i < 7; i++) R(c, 9, 10 + i * 3, 14, 1, '#9db4e6'); R(c, 11, 4, 1, 26, '#e88');
  },
  help(c) { box(c, 6, 3, 20, 26, '#1a5fb4'); R(c, 8, 5, 16, 22, '#3d8be8'); c.fillStyle = '#ffe14d'; c.font = 'bold 18px serif'; c.fillText('?', 11, 23); },
  run(c) { bevel(c, 4, 8, 22, 18, L); R(c, 6, 10, 18, 4, '#0a246a'); poly(c, [14, 18, 24, 18, 24, 15, 30, 21, 24, 27, 24, 24, 14, 24], '#3c9a3c', K); },
  find(c) { circ(c, 13, 13, 9, K); circ(c, 13, 13, 7, '#bfe3ff'); c.strokeStyle = '#6a4a10'; c.lineWidth = 4; c.beginPath(); c.moveTo(19, 19); c.lineTo(28, 28); c.stroke(); c.lineWidth = 1; },
  programs(c) { DRAW.folder(c); R(c, 12, 14, 12, 9, '#0a246a'); R(c, 13, 15, 10, 2, '#3d8be8'); },
  documents(c) { box(c, 10, 2, 16, 20, Wt); box(c, 7, 6, 16, 20, Wt); box(c, 4, 10, 16, 20, Wt); for (let i = 0; i < 5; i++) R(c, 7, 15 + i * 3, 10, 1, '#3054a8'); },
  settings(c) { circ(c, 16, 16, 11, D); for (let a = 0; a < 8; a++) { const x = 16 + Math.cos(a * Math.PI / 4) * 12, y = 16 + Math.sin(a * Math.PI / 4) * 12; circ(c, x, y, 3, D); } circ(c, 16, 16, 9, L); circ(c, 16, 16, 4, D); },
  shutdown(c) {
    // Doorways: a door left ajar, light spilling out.
    poly(c, [8, 3, 24, 3, 24, 30, 8, 30], '#3a2a1a'); poly(c, [9, 4, 23, 4, 23, 29, 9, 29], '#ffeaa0');
    poly(c, [9, 4, 18, 7, 18, 31, 9, 29], '#8b5a2b', K); circ(c, 16, 18, 1, '#ffe14d');
  },
  door(c) {
    poly(c, [6, 2, 26, 2, 26, 30, 6, 30], K);
    R(c, 7, 3, 9, 13, '#e2412f'); R(c, 17, 3, 8, 13, '#38a34a'); R(c, 7, 17, 9, 12, '#2f6fd8'); R(c, 17, 17, 8, 12, '#f2c12e');
    circ(c, 22, 17, 1.5, Wt);
  },
  exe(c) { bevel(c, 3, 5, 26, 22, L); R(c, 5, 7, 22, 4, '#0a246a'); R(c, 23, 8, 3, 2, L); },
  info(c) { circ(c, 16, 16, 13, K); circ(c, 16, 16, 12, Wt); c.fillStyle = '#1a3fbf'; c.font = 'bold 20px serif'; c.fillText('i', 13, 24); },
  warn(c) { poly(c, [16, 2, 30, 28, 2, 28], '#ffe14d', K); c.fillStyle = K; c.font = 'bold 18px sans-serif'; c.fillText('!', 13, 26); },
  error(c) { circ(c, 16, 16, 13, '#7a0000'); circ(c, 16, 16, 12, '#e01e1e'); c.strokeStyle = Wt; c.lineWidth = 3; c.beginPath(); c.moveTo(10, 10); c.lineTo(22, 22); c.moveTo(22, 10); c.lineTo(10, 22); c.stroke(); c.lineWidth = 1; },
  question(c) { circ(c, 16, 16, 13, K); circ(c, 16, 16, 12, Wt); c.fillStyle = '#1a3fbf'; c.font = 'bold 20px serif'; c.fillText('?', 10, 24); },
  phone_small(c) { poly(c, [4, 20, 8, 12, 24, 12, 28, 20, 28, 28, 4, 28], '#555', K); poly(c, [3, 9, 9, 5, 23, 5, 29, 9, 26, 12, 22, 9, 10, 9, 6, 12], '#333', K); },
  phone_on(c) { DRAW.phone_small(c); circ(c, 26, 6, 5, '#2ecc40'); },
  phone_ring(c) { DRAW.phone_small(c); circ(c, 26, 6, 5, '#ff2a2a'); c.strokeStyle = '#ff2a2a'; c.beginPath(); c.arc(16, 18, 15, -2.6, -0.5); c.stroke(); },
  volume(c) { poly(c, [4, 12, 10, 12, 18, 5, 18, 27, 10, 20, 4, 20], L, K); c.strokeStyle = K; c.beginPath(); c.arc(18, 16, 6, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(18, 16, 10, -0.9, 0.9); c.stroke(); },
  kb(c) { box(c, 5, 3, 22, 27, '#7a1f1f'); R(c, 8, 6, 16, 4, '#ffe14d'); R(c, 8, 12, 16, 1, '#e0c080'); R(c, 8, 15, 12, 1, '#e0c080'); R(c, 25, 3, 2, 27, '#4a0f0f'); },
  network(c) { DRAW.computer(c); R(c, 0, 28, 32, 2, '#3c9a3c'); },
  floppy(c) { box(c, 4, 4, 24, 24, '#1f2f5f'); R(c, 9, 5, 14, 8, '#c0c0c0'); R(c, 18, 6, 3, 6, '#1f2f5f'); R(c, 8, 17, 16, 10, Wt); },
  drive(c) { bevel(c, 3, 10, 26, 12, L); R(c, 6, 15, 12, 2, D); circ(c, 24, 16, 1.5, '#2ecc40'); },
  cassette(c) { box(c, 3, 7, 26, 18, '#333'); R(c, 6, 10, 20, 8, '#e8e0c0'); circ(c, 11, 14, 3, '#333'); circ(c, 21, 14, 3, '#333'); },
};

export function icon(name, size = 32) {
  const key = name + '@' + size;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(32, 32), ctx = c.getContext('2d');
  (DRAW[name] || DRAW.exe)(ctx);
  let url = c.toDataURL();
  if (size !== 32) { const s = canvas(size, size), sc = s.getContext('2d'); sc.imageSmoothingEnabled = size > 32; sc.drawImage(c, 0, 0, size, size); url = s.toDataURL(); }
  cache.set(key, url);
  return url;
}
export function iconCanvas(name) { const c = canvas(32, 32); (DRAW[name] || DRAW.exe)(c.getContext('2d')); return c; }
export const ICON_NAMES = Object.keys(DRAW);
