// Procedural desktop wallpapers (all original): a rolling hill under a summer sky,
// classic teal, a starfield, a sunset grid, and whatever the player paints.
import { canvas, seeded } from './dom.js';

export const WALLPAPERS = [
  { id: 'hill', name: 'Serene Hill' },
  { id: 'teal', name: '(None) Teal' },
  { id: 'stars', name: 'Deep Field' },
  { id: 'dusk', name: 'Golden Lotus Dusk' },
  { id: 'clouds', name: 'Cumulus' },
];

function cloud(c, x, y, s, r) {
  c.save();
  const g = c.createRadialGradient(x, y, 0, x, y, s * 1.6);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  for (let i = 0; i < 9; i++) {
    const ox = (r() - 0.5) * s * 2.6, oy = (r() - 0.5) * s * 0.5, rr = s * (0.45 + r() * 0.5);
    const gg = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
    gg.addColorStop(0, 'rgba(255,255,255,0.9)'); gg.addColorStop(0.6, 'rgba(250,252,255,0.55)'); gg.addColorStop(1, 'rgba(240,246,255,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(x + ox, y + oy, rr, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

function paintHill(c, w, h) {
  const r = seeded(1407);
  const sky = c.createLinearGradient(0, 0, 0, h * 0.75);
  sky.addColorStop(0, '#2e6fd6'); sky.addColorStop(0.55, '#6aa9f0'); sky.addColorStop(1, '#c7e2fb');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) cloud(c, r() * w, h * (0.08 + r() * 0.32), 30 + r() * 40, r);
  // far hill
  c.fillStyle = '#5f9d3a';
  c.beginPath(); c.moveTo(0, h * 0.7);
  for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.66 + Math.sin(x / 140 + 1.3) * 18 + Math.sin(x / 47) * 3);
  c.lineTo(w, h); c.lineTo(0, h); c.fill();
  // main hill
  const g = c.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, '#7cc23a'); g.addColorStop(0.5, '#4f9a22'); g.addColorStop(1, '#2f6b12');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) { const t = x / w; c.lineTo(x, h * (0.62 + 0.28 * Math.pow(t - 0.38, 2) * 2.3) + Math.sin(x / 33) * 1.5); }
  c.lineTo(w, h); c.fill();
  // grass texture strokes
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = h * 0.62 + r() * h * 0.4;
    c.strokeStyle = r() < 0.5 ? 'rgba(170,230,90,0.18)' : 'rgba(30,80,10,0.15)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); c.stroke();
  }
  // light on the crest
  const sh = c.createRadialGradient(w * 0.38, h * 0.6, 10, w * 0.38, h * 0.6, w * 0.5);
  sh.addColorStop(0, 'rgba(255,255,200,0.25)'); sh.addColorStop(1, 'rgba(255,255,200,0)');
  c.fillStyle = sh; c.fillRect(0, 0, w, h);
}

function paintStars(c, w, h) {
  const r = seeded(98);
  const g = c.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.5, h * 0.5, w * 0.8);
  g.addColorStop(0, '#1d1446'); g.addColorStop(1, '#03030c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const b = r(); c.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},255,${0.3 + b * 0.7})`;
    c.fillRect(r() * w, r() * h, b > 0.97 ? 2 : 1, b > 0.97 ? 2 : 1);
  }
  // a faint nebula and one suspicious saucer
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${120 + r() * 80},60,${150 + r() * 80},0.03)`; c.beginPath(); c.arc(w * 0.62 + (r() - 0.5) * 260, h * 0.36 + (r() - 0.5) * 160, 30 + r() * 70, 0, 7); c.fill(); }
  c.fillStyle = '#9aa0b0'; c.beginPath(); c.ellipse(w * 0.82, h * 0.18, 14, 4, -0.2, 0, 7); c.fill();
  c.fillStyle = '#7fd7ff'; c.beginPath(); c.ellipse(w * 0.82, h * 0.175, 5, 4, -0.2, Math.PI, 0); c.fill();
}

function paintDusk(c, w, h) {
  const r = seeded(7);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a1a4a'); sky.addColorStop(0.45, '#c2507a'); sky.addColorStop(0.7, '#f6a35c'); sky.addColorStop(1, '#3a1830');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffd38a'; c.beginPath(); c.arc(w * 0.5, h * 0.66, 70, Math.PI, 0); c.fill();
  for (let i = 0; i < 6; i++) { c.fillStyle = sky; c.fillRect(0, h * 0.6 + i * 9, w, 3 + i); }
  // towers
  for (let i = 0; i < 26; i++) {
    const bw = 20 + r() * 40, bh = 60 + r() * 220, x = r() * w;
    c.fillStyle = `rgb(${30 + r() * 20},${16 + r() * 12},${40 + r() * 20})`; c.fillRect(x, h * 0.72 - bh, bw, bh + h);
    for (let y = h * 0.72 - bh + 6; y < h * 0.72; y += 8) for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (r() < 0.35) { c.fillStyle = 'rgba(255,210,120,0.8)'; c.fillRect(xx, y, 2, 3); }
  }
  c.fillStyle = '#1a0f22'; c.fillRect(0, h * 0.72, w, h);
  c.strokeStyle = 'rgba(255,90,180,0.45)';
  for (let i = 0; i < 12; i++) { const y = h * 0.72 + Math.pow(i / 12, 2) * h * 0.28; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(w / 2 + i * 12, h * 0.72); c.lineTo(w / 2 + i * 90, h); c.stroke(); }
}

function paintClouds(c, w, h) {
  const r = seeded(33);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#3b7fd9'); sky.addColorStop(1, '#a9d1fb');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) cloud(c, r() * w, r() * h, 25 + r() * 55, r);
}

const cacheMap = new Map();
// Returns a canvas of the given size with the wallpaper painted. paintData = dataURL image for 'paint'.
export function wallpaperCanvas(id, w = 800, h = 572, paintImg = null) {
  const key = id + w + 'x' + h + (paintImg ? paintImg.src.length : '');
  if (cacheMap.has(key)) return cacheMap.get(key);
  const cv = canvas(w, h), c = cv.getContext('2d');
  if (id === 'hill') paintHill(c, w, h);
  else if (id === 'stars') paintStars(c, w, h);
  else if (id === 'dusk') paintDusk(c, w, h);
  else if (id === 'clouds') paintClouds(c, w, h);
  else if (id === 'paint' && paintImg) {
    c.fillStyle = '#008080'; c.fillRect(0, 0, w, h);
    c.imageSmoothingEnabled = false;
    // stretch to fill, like a proud parent would
    c.drawImage(paintImg, 0, 0, w, h);
  } else { c.fillStyle = '#008080'; c.fillRect(0, 0, w, h); }
  cacheMap.set(key, cv);
  return cv;
}
