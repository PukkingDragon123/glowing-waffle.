// Procedural "web images": banners, logos, news photos, GIF-era decorations,
// and the live webcam frame.
import { G } from '../../core/globals.js';
import { drawText, drawTextScaled } from '../font.js';

const cache = new Map();
function make(key, w, h, draw) {
  const k = key + w + 'x' + h;
  if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  cache.set(k, cv);
  return cv;
}
function noise(ctx, w, h, amt) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * amt; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
function pie(ctx, x, y, r) {
  ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.25, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8a050'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 9; i++) { ctx.fillStyle = '#2a2a80'; ctx.beginPath(); ctx.arc(x - r * 0.6 + (i % 3) * r * 0.6, y - r * 0.2 + Math.floor(i / 3) * r * 0.2, r * 0.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#f0d090'; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.3 - r * 0.2, y - r * 0.35); ctx.lineTo(x + i * r * 0.3 + r * 0.2, y + r * 0.35); ctx.stroke(); }
}

export const IMAGES = {
  bpBanner: (w, h) => make('bp', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#1a2a7a'); g.addColorStop(1, '#5a7ad8');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    pie(c, 40, h / 2, 26);
    drawTextScaled(c, 'Blueberry Pie', 80, 10, '#ffffff', 3, true);
    drawText(c, 'ONLINE  -  The sweetest connection in New Jersey', 84, 50, '#c0d0ff', { bold: true });
    const day = G.story.day;
    if (day >= 5) { c.fillStyle = 'rgba(120,0,0,0.5)'; c.fillRect(0, 0, w, h); drawText(c, 'STAY INSIDE', w - 110, 8, '#ffffff', { bold: true }); }
  }),
  altaLogo: (w, h) => make('alta', w, h, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    drawTextScaled(c, 'AltaVisor', 10, 6, '#ffcc00', 4, true);
    drawTextScaled(c, 'AltaVisor', 8, 4, '#0033aa', 4, true);
  }),
  cnmBanner: (w, h) => make('cnm', w, h, (c) => {
    c.fillStyle = '#b00000'; c.fillRect(0, 0, w, h);
    drawTextScaled(c, 'CNM', 10, 4, '#ffffff', 3, true);
    drawText(c, 'INTERACTIVE', 90, 24, '#ffffff', { bold: true });
    drawText(c, 'Thursday, July ' + G.story.day + ', 1999', w - 170, 30, '#ffd0d0');
  }),
  newsHarbor: (w, h) => make('harbor', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05060c'); g.addColorStop(1, '#1a1e2a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = '#1a1a22'; const bw = 8 + Math.random() * 20, bh = 20 + Math.random() * 70; c.fillRect(i * 9, h * 0.7 - bh, bw, bh); }
    c.fillStyle = '#20242e'; c.fillRect(0, h * 0.7, w, h * 0.3);
    for (let i = 0; i < 14; i++) { const x = 60 + i * 15 + Math.sin(i) * 10, y = 40 + Math.cos(i * 1.3) * 15; const rg = c.createRadialGradient(x, y, 0, x, y, 10); rg.addColorStop(0, 'rgba(200,255,230,1)'); rg.addColorStop(1, 'rgba(80,255,180,0)'); c.fillStyle = rg; c.fillRect(x - 10, y - 10, 20, 20); }
    noise(c, w, h, 30);
  }),
  newsFire: (w, h) => make('fire', w, h, (c) => {
    c.fillStyle = '#1a0a05'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a1a14'; c.fillRect(w * 0.42, h * 0.1, 22, h * 0.8); c.fillRect(w * 0.52, h * 0.14, 22, h * 0.76);
    for (let i = 0; i < 30; i++) { const x = w * 0.45 + (Math.random() - 0.5) * 60, y = h * 0.3 + Math.random() * 40; const rg = c.createRadialGradient(x, y, 0, x, y, 30); rg.addColorStop(0, 'rgba(255,160,40,0.8)'); rg.addColorStop(1, 'rgba(255,40,0,0)'); c.fillStyle = rg; c.fillRect(x - 30, y - 30, 60, 60); }
    for (let i = 0; i < 20; i++) { c.fillStyle = `rgba(40,30,28,${0.3 + Math.random() * 0.4})`; c.beginPath(); c.arc(w * 0.5 + Math.random() * 80, h * 0.25 - Math.random() * 40, 20 + Math.random() * 30, 0, Math.PI * 2); c.fill(); }
    noise(c, w, h, 40);
  }),
  wxSun: (w, h) => make('wxsun', w, h, (c) => { c.fillStyle = '#fff8e0'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffcc00'; c.beginPath(); c.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2); c.fill(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.fillRect(w / 2 + Math.cos(a) * h * 0.42 - 2, h / 2 + Math.sin(a) * h * 0.42 - 2, 4, 4); } }),
  wxBad: (w, h) => make('wxbad', w, h, (c) => { c.fillStyle = '#300000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff4020'; c.beginPath(); c.arc(w / 2 - 6, h / 2, h * 0.28, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c02010'; c.beginPath(); c.arc(w / 2 + 8, h / 2 - 3, h * 0.2, 0, Math.PI * 2); c.fill(); }),
  construction: (w, h) => make('constr', w, h, (c) => {
    for (let x = -h; x < w; x += 12) { c.fillStyle = '#ffcc00'; c.beginPath(); c.moveTo(x, h); c.lineTo(x + 6, h); c.lineTo(x + 6 + h, 0); c.lineTo(x + h, 0); c.fill(); }
    c.fillStyle = '#000'; c.fillRect(0, h / 2 - 7, w, 14); drawText(c, 'UNDER CONSTRUCTION', 6, h / 2 - 6, '#ffcc00', { bold: true });
  }),
  ufoPhoto: (w, h) => make('ufo', w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0a14'); g.addColorStop(1, '#242430'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#101014'; for (let i = 0; i < 12; i++) c.fillRect(i * 20, h - 30 - (i % 3) * 10, 18, 40);
    const rg = c.createRadialGradient(w * 0.6, h * 0.35, 0, w * 0.6, h * 0.35, 40); rg.addColorStop(0, 'rgba(220,255,240,1)'); rg.addColorStop(0.2, 'rgba(120,255,200,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffff00'; drawText(c, '6/29/99 11:42PM', 6, h - 14, '#ffaa00', { bold: true });
    noise(c, w, h, 50);
  }),
  petsBanner: (w, h) => make('pets', w, h, (c) => { c.fillStyle = '#f8c870'; c.fillRect(0, 0, w, h); drawTextScaled(c, 'PurrfectPets', 12, 8, '#7a3a00', 3, true); drawText(c, 'Happy pets, happy homes since 1996', 14, 40, '#7a3a00'); c.fillStyle = '#7a3a00'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w - 60 + (i % 2) * 14, 14 + Math.floor(i / 2) * 6, 4, 0, Math.PI * 2); c.fill(); } c.beginPath(); c.ellipse(w - 53, 34, 10, 8, 0, 0, Math.PI * 2); c.fill(); }),
  babyBanner: (w, h) => make('baby', w, h, (c) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#ffc0d8'); g.addColorStop(1, '#c0e0ff'); c.fillStyle = g; c.fillRect(0, 0, w, h); drawTextScaled(c, 'BabyBoards', 12, 6, '#a02060', 3, true); drawText(c, 'for moms, by moms', 14, 36, '#a02060'); }),
  stars: () => make('stars', 64, 64, (c) => { c.fillStyle = '#000010'; c.fillRect(0, 0, 64, 64); for (let i = 0; i < 18; i++) { c.fillStyle = Math.random() < 0.3 ? '#ffff80' : '#ffffff'; c.fillRect(Math.random() * 64 | 0, Math.random() * 64 | 0, 1, 1); } }),
  webcam: (w, h) => {
    // live frame from the hidden camera in the corner of the apartment
    const src = G.desk && G.desk.webcamFrame();
    const k = 'webcam' + w + 'x' + h;
    let cv = cache.get(k);
    if (!cv) { cv = document.createElement('canvas'); cv.width = w; cv.height = h; cache.set(k, cv); }
    const c = cv.getContext('2d');
    if (src) { c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0, w, h); } else { c.fillStyle = '#111'; c.fillRect(0, 0, w, h); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
    drawText(c, 'APT4B  CAM1  ' + (G.os ? G.os.clockString() : ''), 6, 6, '#ffffff', { bold: true });
    c.fillStyle = Math.floor(performance.now() / 500) % 2 ? '#ff0000' : '#400000'; c.beginPath(); c.arc(w - 12, 12, 4, 0, Math.PI * 2); c.fill();
    return cv;
  },
  photoBed: (w, h) => {
    const src = G.desk && G.desk.photoBed;
    const k = 'photobed' + w;
    if (cache.has(k) && src && cache.get(k).src === src) return cache.get(k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    if (src) c.drawImage(src, 0, 0, w, h); else { c.fillStyle = '#222'; c.fillRect(0, 0, w, h); }
    drawText(c, '07/0' + Math.min(7, G.story.day) + '/99 03:12', w - 110, h - 16, '#ff9020', { bold: true });
    cv.src = src;
    cache.set(k, cv);
    return cv;
  },
  ultrasound: (w, h) => make('us' + G.story.day, w, h, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#202020'; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w - 6, h - 6); c.lineTo(6, h - 6); c.fill();
    const day = G.story.day;
    c.fillStyle = '#909090'; c.beginPath(); c.ellipse(w / 2, h * 0.6, w * 0.25, h * 0.22, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#101010'; c.beginPath(); c.ellipse(w / 2, h * 0.6, w * 0.2, h * 0.17, 0, 0, Math.PI * 2); c.fill();
    // the thing inside: not a baby
    c.strokeStyle = '#d0d0d0'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(w / 2 - 6, h * 0.55, 14, 22, 0.6, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 5 + day; i++) { c.beginPath(); const a = i * 0.9; c.moveTo(w / 2, h * 0.62); c.quadraticCurveTo(w / 2 + Math.cos(a) * 30, h * 0.62 + Math.sin(a) * 25, w / 2 + Math.cos(a + 0.5) * 40, h * 0.62 + Math.sin(a + 0.5) * 30); c.stroke(); }
    drawText(c, 'BENGRIM A.  GA: ' + (day * 13) + 'w', 8, 8, '#ffffff');
    noise(c, w, h, 60);
  }),
};
