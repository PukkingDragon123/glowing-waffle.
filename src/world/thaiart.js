// Pictures on the walls of 1407, painted on canvases at load: the flame
// painting bought off a footpath on Silom, a rice-paddy sunset print like the
// one in every Thai living room, and the family studio portrait from Korat.
// Nobody in them has a face any more.
import { PAINTINGS } from './paintings.data.js';
import { RNG } from '../core/util.js';
import { IMAGE_OVERRIDES } from '../gfx/textures.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// thick oily strokes: a lot of short semi-opaque dabs along a path
function dab(ctx, x, y, r, col, a = 0.8) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }

function flame() {
  const W = 300, H = 400, [c, x] = canvas(W, H), r = new RNG(14);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060404'); g.addColorStop(1, '#140806');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // tongues of colour licking up from the bottom, like the one on Silom
  const cols = [['#1a6a3a', '#3aa85a', '#e8c040'], ['#a01810', '#e84a1a', '#f8c040'], ['#d84a1a', '#f8a020', '#fff0a0'], ['#2a4aa8', '#5a8ad8', '#e8e0c0'], ['#8a1a6a', '#d84a8a', '#f8c8a0']];
  for (let i = 0; i < 26; i++) {
    const [a, b2, top] = cols[i % cols.length];
    let px = r.range(20, W - 20), py = H - r.range(0, 30);
    const h = r.range(H * 0.35, H * 0.85), lean = r.range(-0.6, 0.6);
    for (let s = 0; s < 70; s++) {
      const t = s / 70;
      const col = t < 0.4 ? a : t < 0.8 ? b2 : top;
      px += lean * 1.4 + Math.sin(t * 9 + i) * 2.2; py -= h / 70;
      dab(x, px, py, (1 - t) * 13 + 2, col, 0.55);
    }
  }
  // dark gaps between the flames and a few white sparks
  for (let i = 0; i < 40; i++) dab(x, r.range(0, W), r.range(0, H * 0.5), r.range(4, 14), '#060404', 0.5);
  for (let i = 0; i < 30; i++) dab(x, r.range(0, W), r.range(H * 0.1, H * 0.7), r.range(1, 2.5), '#fff8e0', 0.9);
  return c.toDataURL('image/jpeg', 0.85);
}

function paddy() {
  const W = 480, H = 300, [c, x] = canvas(W, H), r = new RNG(7);
  const sky = x.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#3a2a6a'); sky.addColorStop(0.45, '#e86a4a'); sky.addColorStop(1, '#f8c870');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff2b0'; x.beginPath(); x.arc(W * 0.62, H * 0.4, 26, 0, Math.PI * 2); x.fill();
  // mountains, three layers
  for (const [y0, col, amp] of [[0.42, '#6a3a6a', 28], [0.47, '#4a2a5a', 22], [0.52, '#2a2a3a', 14]]) {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) x.lineTo(px, H * y0 - Math.abs(Math.sin(px * 0.013 + y0 * 9)) * amp - Math.sin(px * 0.05) * 4);
    x.lineTo(W, H); x.fill();
  }
  // paddies: terraced green strips with the sky in the water
  for (let i = 0; i < 9; i++) {
    const y = H * 0.55 + i * i * 2.4 + i * 6;
    x.fillStyle = i % 2 ? '#5aa83a' : '#7ac84a'; x.fillRect(0, y, W, 14 + i * 2);
    x.fillStyle = 'rgba(248,170,100,0.45)'; x.fillRect(r.range(0, W * 0.5), y + 3, r.range(60, 200), 4);
  }
  // sugar palms, black against the sunset
  for (const [px, ph] of [[60, 120], [95, 100], [400, 130], [430, 90], [300, 70]]) {
    x.strokeStyle = '#1a1410'; x.lineWidth = 4; x.beginPath(); x.moveTo(px, H * 0.6); x.lineTo(px + 4, H * 0.6 - ph); x.stroke();
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; dab(x, px + 4 + Math.cos(a) * 14, H * 0.6 - ph + Math.sin(a) * 7, 10, '#1a1410', 0.9); }
  }
  // the buffalo and the farmer in a hat; his face is a smear
  x.fillStyle = '#2a2420'; x.beginPath(); x.ellipse(190, 232, 34, 16, 0, 0, Math.PI * 2); x.fill();
  x.fillRect(166, 236, 6, 22); x.fillRect(206, 236, 6, 22); x.beginPath(); x.ellipse(160, 224, 12, 9, -0.3, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2a2420'; x.lineWidth = 3; x.beginPath(); x.arc(156, 214, 10, Math.PI, Math.PI * 1.8); x.stroke();
  x.fillStyle = '#3a4a8a'; x.fillRect(244, 210, 12, 34); x.fillStyle = '#d8b878'; x.beginPath(); x.moveTo(236, 204); x.lineTo(264, 204); x.lineTo(250, 192); x.fill();
  for (let i = 0; i < 18; i++) dab(x, 250 + r.range(-4, 4), 205 + r.range(-2, 4), r.range(2, 4), i % 2 ? '#c89a7a' : '#a87a5a', 0.6);
  return c.toDataURL('image/jpeg', 0.85);
}

function family() {
  const W = 300, H = 380, [c, x] = canvas(W, H), r = new RNG(3);
  const bg = x.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.45, 260); bg.addColorStop(0, '#9ab0a8'); bg.addColorStop(1, '#3a4a48');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(20,30,30,${0.08 + (i % 3) * 0.04})`; x.fillRect(i * 26, 0, 10, H * 0.7); }
  // the floor and a carved chair
  x.fillStyle = '#5a4430'; x.fillRect(0, H * 0.78, W, H * 0.22);
  const person = (cx, cy, s, shirt, skirt, hair = '#1a1410') => {
    x.fillStyle = shirt; x.beginPath(); x.moveTo(cx - 30 * s, cy + 100 * s); x.lineTo(cx - 24 * s, cy + 18 * s); x.quadraticCurveTo(cx, cy + 8 * s, cx + 24 * s, cy + 18 * s); x.lineTo(cx + 30 * s, cy + 100 * s); x.fill();
    x.fillStyle = skirt; x.fillRect(cx - 26 * s, cy + 96 * s, 52 * s, 60 * s);
    x.fillStyle = hair; x.beginPath(); x.ellipse(cx, cy - 6 * s, 19 * s, 21 * s, 0, 0, Math.PI * 2); x.fill();
    // the face: rubbed out, the paint dragged sideways
    for (let i = 0; i < 26; i++) dab(x, cx + r.range(-10, 14) * s, cy + r.range(-6, 14) * s, r.range(4, 9) * s, i % 3 ? '#c8a080' : '#e0c0a0', 0.55);
    x.fillStyle = 'rgba(200,160,128,0.5)'; x.fillRect(cx - 4 * s, cy + 2 * s, 34 * s, 7 * s);
  };
  person(96, 96, 1.15, '#e8e4d8', '#2a2a3a');                 // father standing
  person(196, 140, 1.0, '#c84a6a', '#6a3a5a');                // mother seated
  person(70, 200, 0.7, '#e8c040', '#3a5a8a');                 // the son
  person(236, 222, 0.62, '#f0f0e8', '#d84a4a');               // the daughter (Nok)
  // hand-tinted, faded, a studio stamp
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; d[i] = l + (d[i] - l) * 0.55 + 18; d[i + 1] = l + (d[i + 1] - l) * 0.55 + 8; d[i + 2] = l + (d[i + 2] - l) * 0.55 - 6; }
  x.putImageData(img, 0, 0);
  x.fillStyle = 'rgba(255,248,230,0.75)'; x.font = '700 12px "Kanit", Tahoma, sans-serif'; x.fillText('ห้องภาพศรีโคราช ๒๕๓๑', 14, H - 12);
  return c.toDataURL('image/jpeg', 0.85);
}

let done = false;
export function registerThaiArt() {
  if (done) return; done = true;
  // a real photograph or painting on file (assets/images, key painting_<name>) wins
  const add = (key, title, w, h, make) => {
    const real = IMAGE_OVERRIDES['painting_' + key];
    if (real) { PAINTINGS[key] = { key, title: real.title || title, artist: real.author || '', date: '', credit: real.credit || '', w: real.img.width, h: real.img.height, src: real.img.src }; return; }
    PAINTINGS[key] = { key, title, artist: 'procedural', date: '1997', credit: 'generated in game', w, h, src: make() };
  };
  add('flame', 'Flames (street painting, Silom)', 300, 400, flame);
  add('paddy', 'Rice field at sunset (print)', 480, 300, paddy);
  add('family', 'Family portrait, Korat 1988', 300, 380, family);
}
