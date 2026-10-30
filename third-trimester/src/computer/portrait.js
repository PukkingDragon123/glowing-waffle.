// Procedural 32×32 caller-ID portraits.
import { canvas, seeded } from './dom.js';

const cache = new Map();

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f)), g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f)), b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function portrait(cfg, key) {
  if (key && cache.has(key)) return cache.get(key);
  const cv = canvas(32, 32), c = cv.getContext('2d');
  const P = (x, y, w = 1, h = 1, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const r = seeded(key || JSON.stringify(cfg));
  const sp = cfg.special;
  if (sp === 'cat') {
    P(0, 0, 32, 32, '#101418');
    for (let i = 0; i < 140; i++) P(r() * 32 | 0, r() * 32 | 0, 1, 1, `rgba(200,220,255,${r() * 0.35})`);
    const o = '#e8892c', d = '#a85a14', w = '#f4efe6';
    P(7, 4, 4, 6, o); P(21, 4, 4, 6, o); P(8, 6, 2, 3, '#f0a0a0'); P(22, 6, 2, 3, '#f0a0a0');
    P(6, 9, 20, 15, o); P(8, 22, 16, 4, o); P(5, 12, 22, 9, o);
    for (let i = 0; i < 4; i++) P(10 + i * 3, 9, 2, 3, d);
    P(11, 18, 10, 7, w); P(9, 14, 5, 3, '#8fdc5a'); P(18, 14, 5, 3, '#8fdc5a'); P(11, 14, 1, 3, '#000'); P(20, 14, 1, 3, '#000');
    P(15, 19, 2, 1, '#e86a8a'); P(14, 21, 1, 1, '#555'); P(17, 21, 1, 1, '#555');
    c.fillStyle = 'rgba(255,255,255,0.5)'; for (const y of [19, 21]) { c.fillRect(2, y, 8, 1); c.fillRect(22, y, 8, 1); }
    for (let y = 0; y < 32; y += 2) P(0, y, 32, 1, 'rgba(0,0,0,0.25)');
  } else if (sp === 'baby') {
    P(0, 0, 32, 32, '#1a1030');
    c.fillStyle = '#b8bcc8'; c.beginPath(); c.ellipse(16, 14, 11, 12, 0, 0, 7); c.fill(); P(10, 22, 12, 6, '#b8bcc8');
    P(4, 26, 24, 6, '#c8ccd8'); P(6, 27, 20, 1, '#fff');
    c.fillStyle = '#000'; c.beginPath(); c.ellipse(11.5, 14, 4, 5.5, 0.45, 0, 7); c.ellipse(20.5, 14, 4, 5.5, -0.45, 0, 7); c.fill();
    P(10, 11, 1, 1, '#fff'); P(19, 11, 1, 1, '#fff');
    P(14, 22, 4, 1, '#6a5070'); P(8, 6, 2, 2, '#9a7fc0'); P(22, 8, 2, 2, '#9a7fc0'); P(18, 4, 1, 1, '#9a7fc0');
    c.fillStyle = 'rgba(120,255,160,0.18)'; c.fillRect(0, 0, 32, 32);
  } else if (sp === 'choir') {
    P(0, 0, 32, 32, '#05030a');
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const cx = 4 + x * 8, cy = 6 + y * 10;
      c.fillStyle = `rgba(${180 + r() * 60},${180 + r() * 60},255,0.85)`; c.beginPath(); c.ellipse(cx, cy, 3, 4, 0, 0, 7); c.fill();
      P(cx - 2, cy - 1, 1, 2, '#000'); P(cx + 1, cy - 1, 1, 2, '#000'); P(cx - 1, cy + 2, 2, 1, '#000');
    }
    c.fillStyle = 'rgba(255,255,200,0.12)'; c.beginPath(); c.arc(16, 16, 15, 0, 7); c.fill();
  } else if (sp === 'unknown') {
    P(0, 0, 32, 32, '#000');
    c.fillStyle = '#151515'; c.beginPath(); c.ellipse(16, 13, 7, 8, 0, 0, 7); c.fill(); P(6, 22, 20, 10, '#151515');
    c.fillStyle = '#7a0000'; c.font = 'bold 14px monospace'; c.fillText('?', 12, 18);
  } else if (sp === 'wall') {
    P(0, 0, 32, 32, '#b8a088');
    for (let y = 0; y < 32; y += 6) for (let x = (y / 6) % 2 ? -4 : 0; x < 32; x += 10) { P(x, y, 9, 5, '#c9b49a'); P(x, y + 5, 10, 1, '#8a7560'); }
    P(10, 12, 13, 6, '#000'); P(12, 14, 3, 2, '#fff'); P(18, 14, 3, 2, '#fff'); P(13, 14, 1, 2, '#000'); P(19, 15, 1, 1, '#000');
    P(15, 18, 1, 9, '#2a1a10'); P(16, 22, 3, 1, '#2a1a10');
  } else {
    // human
    const skin = cfg.skin || '#d8a070', hair = cfg.hair || '#222', sk2 = shade(skin, 0.82);
    const bg = cfg.bg || '#203040';
    P(0, 0, 32, 32, bg); P(0, 0, 32, 10, shade(bg, 1.25));
    const kid = cfg.kid ? 2 : 0;
    // shoulders / shirt
    P(5, 25 + kid, 22, 7, cfg.shirt || '#555'); P(4, 27 + kid, 24, 5, cfg.shirt || '#555'); P(13, 23 + kid, 6, 3, sk2);
    if (cfg.tie) { P(14, 25, 4, 1, '#fff'); P(15, 26, 2, 6, cfg.tie); }
    if (cfg.medals) { P(7, 27, 2, 2, '#ffd040'); P(10, 27, 2, 2, '#d04040'); P(7, 29, 5, 1, '#40a0d0'); }
    if (cfg.pearls) for (let x = 11; x < 21; x += 2) P(x, 25, 1, 1, '#fff');
    // head
    const hx = 9, hy = 6 + kid, hw = 14, hh = 17 - kid;
    P(hx + 1, hy, hw - 2, hh, skin); P(hx, hy + 2, hw, hh - 5, skin);
    P(hx - 1, hy + 7, 1, 4, sk2); P(hx + hw, hy + 7, 1, 4, sk2); // ears
    P(hx + 1, hy + hh - 2, hw - 2, 2, sk2);
    // hair
    const st = cfg.style;
    if (st === 'bun') { P(hx, hy - 1, hw, 4, hair); P(hx + 4, hy - 4, 6, 4, hair); P(hx - 1, hy + 1, 2, 6, hair); P(hx + hw - 1, hy + 1, 2, 6, hair); }
    else if (st === 'long') { P(hx - 1, hy - 1, hw + 2, 5, hair); P(hx - 2, hy + 2, 3, 16, hair); P(hx + hw - 1, hy + 2, 3, 16, hair); }
    else if (st === 'short_f') { P(hx - 1, hy - 1, hw + 2, 5, hair); P(hx - 1, hy + 2, 2, 8, hair); P(hx + hw - 1, hy + 2, 2, 8, hair); }
    else if (st === 'messy') { P(hx - 1, hy - 1, hw + 2, 4, hair); for (let i = 0; i < 6; i++) P(hx + i * 3, hy - 3 + (i % 2), 2, 3, hair); }
    else if (st === 'slick') { P(hx, hy - 1, hw, 3, hair); P(hx, hy + 2, 2, 3, hair); P(hx + 3, hy - 1, hw - 3, 1, shade(hair, 1.6)); }
    else if (st === 'cap') { P(hx - 1, hy - 1, hw + 2, 4, cfg.cap || '#c33'); P(hx - 1, hy + 2, hw + 6, 2, shade(cfg.cap || '#c33', 0.7)); }
    else if (st === 'general') { P(hx - 2, hy - 2, hw + 4, 4, '#3a4a2a'); P(hx - 3, hy + 2, hw + 6, 2, '#222'); P(hx + 5, hy - 1, 4, 2, '#ffd040'); }
    else if (st === 'short') { P(hx, hy - 1, hw, 3, hair); P(hx - 1, hy + 1, 2, 4, hair); P(hx + hw - 1, hy + 1, 2, 4, hair); }
    // face
    const ey = hy + 7;
    if (cfg.shades) { P(hx + 1, ey - 1, 12, 3, '#000'); P(hx + 2, ey - 1, 2, 1, '#456'); }
    else { P(hx + 3, ey, 2, 2, '#fff'); P(hx + 9, ey, 2, 2, '#fff'); P(hx + 4, ey, 1, 2, '#000'); P(hx + 10, ey, 1, 2, '#000'); P(hx + 3, ey - 2, 3, 1, shade(hair, 0.9)); P(hx + 8, ey - 2, 3, 1, shade(hair, 0.9)); }
    if (cfg.glasses) { c.strokeStyle = '#222'; c.lineWidth = 1; c.strokeRect(hx + 2.5, ey - 1.5, 4, 4); c.strokeRect(hx + 7.5, ey - 1.5, 4, 4); P(hx + 6, ey, 2, 1, '#222'); }
    if (cfg.age) { P(hx + 2, ey + 3, 2, 1, sk2); P(hx + 10, ey + 3, 2, 1, sk2); P(hx + 4, ey + 9, 6, 1, sk2); }
    P(hx + 6, ey + 2, 2, 3, sk2); // nose
    if (cfg.mustache) P(hx + 3, ey + 6, 8, 2, cfg.mustache);
    if (cfg.beard) { P(hx + 1, ey + 6, 12, 4, cfg.beard); P(hx + 3, ey + 9, 8, 2, cfg.beard); }
    if (cfg.stubble) for (let i = 0; i < 18; i++) P(hx + 2 + (r() * 10 | 0), ey + 5 + (r() * 5 | 0), 1, 1, 'rgba(30,20,10,0.45)');
    P(hx + 4, ey + 7, 6, 1, cfg.grin ? '#fff' : '#7a3a2a'); if (cfg.grin) P(hx + 3, ey + 6, 8, 1, '#7a3a2a');
    if (cfg.bruise) { P(hx + 9, ey + 2, 3, 2, 'rgba(110,60,120,0.6)'); P(hx + 2, hy + 1, 3, 1, 'rgba(160,30,30,0.6)'); }
    if (cfg.headset) { P(hx - 2, ey - 1, 2, 5, '#222'); P(hx - 1, hy - 1, hw + 1, 1, '#222'); P(hx - 1, ey + 4, 6, 1, '#222'); }
    if (sp === 'ghost') {
      const img = c.getImageData(0, 0, 32, 32);
      for (let i = 0; i < img.data.length; i += 4) { const l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; img.data[i] = l * 0.7; img.data[i + 1] = l * 0.85; img.data[i + 2] = l * 1.05 + 20; img.data[i + 3] = 150 + (r() * 100 | 0); }
      c.putImageData(img, 0, 0);
      for (let y = 0; y < 32; y += 3) P(0, y, 32, 1, 'rgba(0,10,20,0.4)');
    }
  }
  if (key) cache.set(key, cv);
  return cv;
}
