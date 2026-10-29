// Printed artwork for packaging, posters, notes and signs (fictional brands).
import * as THREE from 'three';
import { printed, ageCanvas } from '../gfx/textures.js';

function txt(ctx, s, x, y, size, color, { font = 'Arial Black, Arial, sans-serif', align = 'center', bold = '900', stroke = null, sw = 2, italic = '' } = {}) {
  ctx.font = `${italic} ${bold} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export const L = {
  catBox: () => printed('catbox', 128, 160, (c, w, h) => {
    c.fillStyle = '#e07818'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4b030'; c.fillRect(0, 0, w, 34);
    c.fillStyle = '#7a2a10'; c.fillRect(0, 34, w, 4);
    txt(c, 'KITTY', w / 2, 14, 18, '#fff', { stroke: '#7a2a10', sw: 4 });
    txt(c, 'KRUNCH', w / 2, 30, 16, '#fff', { stroke: '#7a2a10', sw: 4 });
    // cat face
    c.fillStyle = '#f6e6cc';
    c.beginPath(); c.arc(w / 2, 92, 30, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(w / 2 - 28, 80); c.lineTo(w / 2 - 22, 50); c.lineTo(w / 2 - 8, 68); c.fill();
    c.beginPath(); c.moveTo(w / 2 + 28, 80); c.lineTo(w / 2 + 22, 50); c.lineTo(w / 2 + 8, 68); c.fill();
    c.fillStyle = '#3a8a30'; c.beginPath(); c.ellipse(w / 2 - 11, 88, 5, 6, 0, 0, Math.PI * 2); c.ellipse(w / 2 + 11, 88, 5, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.fillRect(w / 2 - 12, 84, 2, 9); c.fillRect(w / 2 + 10, 84, 2, 9);
    c.fillStyle = '#e88a8a'; c.beginPath(); c.moveTo(w / 2 - 4, 99); c.lineTo(w / 2 + 4, 99); c.lineTo(w / 2, 104); c.fill();
    c.strokeStyle = '#6a5040'; c.lineWidth = 1;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(w / 2 + s * 10, 102 + i * 2); c.lineTo(w / 2 + s * 34, 98 + i * 5); c.stroke(); }
    txt(c, 'CHICKEN FEAST', w / 2, 132, 11, '#fff', { stroke: '#7a2a10', sw: 3 });
    txt(c, '6 POUCHES · NET WT 18 OZ', w / 2, 148, 8, '#fff', { bold: '700', font: 'Arial' });
    ageCanvas(c, w, h, 0.12, 3);
  }),
  catPacket: () => printed('catpacket', 64, 96, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#9aa0a8'); g.addColorStop(0.5, '#e8ecf0'); g.addColorStop(1, '#8a9098');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e07818'; c.fillRect(0, 26, w, 40);
    txt(c, 'KITTY', w / 2, 38, 11, '#fff', { stroke: '#7a2a10', sw: 3 });
    txt(c, 'KRUNCH', w / 2, 52, 10, '#fff', { stroke: '#7a2a10', sw: 3 });
    c.fillStyle = '#555'; for (let x = 0; x < w; x += 4) c.fillRect(x, 4, 2, 4);
    txt(c, 'TEAR HERE', w / 2, 14, 6, '#333', { bold: '700', font: 'Arial' });
  }),
  eggs: () => printed('eggs', 128, 48, (c, w, h) => {
    c.fillStyle = '#b8b0a0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2efe6'; c.fillRect(14, 8, w - 28, h - 16);
    txt(c, 'GRADE A LARGE', w / 2, 18, 9, '#2a4a8a', { bold: '900', font: 'Arial' });
    txt(c, 'HUDSON VALLEY FARMS', w / 2, 31, 7, '#7a2a20', { bold: '700', font: 'Arial' });
    ageCanvas(c, w, h, 0.2, 4);
  }),
  milk: () => printed('milk', 64, 128, (c, w, h) => {
    c.fillStyle = '#fbfbf6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a5fae'; c.fillRect(0, 20, w, 50);
    txt(c, 'FARMLAND', w / 2, 34, 10, '#fff', { font: 'Arial' });
    txt(c, 'MILK', w / 2, 54, 18, '#fff');
    c.fillStyle = '#c83a2a'; c.fillRect(0, 74, w, 8);
    txt(c, 'VITAMIN D', w / 2, 92, 8, '#2a5fae', { bold: '700', font: 'Arial' });
    txt(c, 'HALF GALLON', w / 2, 104, 7, '#555', { bold: '700', font: 'Arial' });
    c.fillStyle = '#ccc'; c.fillRect(8, 110, w - 16, 14);
    txt(c, 'HAVE YOU SEEN ME?', w / 2, 117, 5, '#333', { bold: '700', font: 'Arial' });
  }),
  juice: () => printed('juice', 64, 128, (c, w, h) => {
    c.fillStyle = '#ffd040'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f07a10'; c.beginPath(); c.arc(w / 2, 70, 20, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a8a2a'; c.beginPath(); c.ellipse(w / 2 + 8, 48, 8, 4, -0.6, 0, Math.PI * 2); c.fill();
    txt(c, 'SUNNY', w / 2, 18, 12, '#d04010');
    txt(c, 'GROVE', w / 2, 32, 12, '#d04010');
    txt(c, '100% ORANGE', w / 2, 104, 7, '#7a3a10', { bold: '700', font: 'Arial' });
  }),
  cereal: () => printed('cereal', 128, 176, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a6ad8'); g.addColorStop(1, '#1a3a88');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    txt(c, 'FROSTY', w / 2, 26, 24, '#fff', { stroke: '#c02020', sw: 5 });
    txt(c, "O's", w / 2, 54, 30, '#ffe040', { stroke: '#c02020', sw: 5 });
    c.fillStyle = '#f4f0e8'; c.beginPath(); c.ellipse(w / 2, 120, 44, 22, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 14; i++) { c.fillStyle = ['#f0c040', '#e07030', '#d8a840'][i % 3]; c.beginPath(); c.arc(w / 2 - 34 + (i * 37) % 68, 110 + (i * 13) % 20, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f4f0e8'; c.beginPath(); c.arc(w / 2 - 34 + (i * 37) % 68, 110 + (i * 13) % 20, 2, 0, Math.PI * 2); c.fill(); }
    txt(c, 'PART OF A COMPLETE BREAKFAST', w / 2, 160, 7, '#fff', { bold: '700', font: 'Arial' });
    ageCanvas(c, w, h, 0.1, 5);
  }),
  crackers: () => printed('crackers', 96, 160, (c, w, h) => {
    c.fillStyle = '#d42a2a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4e4b0'; c.fillRect(10, 50, w - 20, 60);
    for (let i = 0; i < 9; i++) { c.fillStyle = '#c8a058'; c.fillRect(18 + (i % 3) * 22, 58 + Math.floor(i / 3) * 18, 3, 3); }
    txt(c, 'SALTINES', w / 2, 28, 15, '#fff');
    txt(c, 'ORIGINAL', w / 2, 128, 10, '#fff', { bold: '700', font: 'Arial' });
  }),
  soup: () => printed('soup', 128, 48, (c, w, h) => {
    c.fillStyle = '#c8201c'; c.fillRect(0, 0, w, h / 2);
    c.fillStyle = '#f4f0e8'; c.fillRect(0, h / 2, w, h / 2);
    txt(c, "Camden's", w / 2, h / 4, 14, '#fff', { font: 'Georgia, serif', italic: 'italic', bold: '700' });
    txt(c, 'TOMATO SOUP', w / 2, h * 0.72, 9, '#c8201c', { bold: '900', font: 'Arial' });
    c.fillStyle = '#d8b040'; c.beginPath(); c.arc(w * 0.85, h * 0.72, 5, 0, Math.PI * 2); c.fill();
  }),
  beans: () => printed('beans', 128, 48, (c, w, h) => {
    c.fillStyle = '#2a5a2a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a04820'; c.beginPath(); c.ellipse(w * 0.75, h / 2, 16, 12, 0, 0, Math.PI * 2); c.fill();
    txt(c, 'HEARTH', w * 0.35, h * 0.33, 12, '#f0e0a0');
    txt(c, 'BAKED BEANS', w * 0.35, h * 0.7, 8, '#fff', { bold: '700', font: 'Arial' });
  }),
  cola: () => printed('cola', 96, 48, (c, w, h) => {
    c.fillStyle = '#b81818'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, h * 0.7); c.bezierCurveTo(w * 0.3, h * 0.3, w * 0.6, h * 0.9, w, h * 0.5); c.stroke();
    txt(c, 'Cola', w / 2, h * 0.38, 16, '#fff', { font: 'Georgia, serif', italic: 'italic', bold: '700' });
  }),
  pb: () => printed('pb', 128, 48, (c, w, h) => {
    c.fillStyle = '#8a5a2a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4e8c8'; c.fillRect(0, 8, w, h - 16);
    txt(c, 'NUTTY BUDDY', w / 2, h / 2 - 4, 11, '#c02020');
    txt(c, 'CREAMY PEANUT BUTTER', w / 2, h / 2 + 9, 6, '#5a3a1a', { bold: '700', font: 'Arial' });
  }),
  pizza: () => printed('pizza', 128, 128, (c, w, h) => {
    c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b02020'; c.lineWidth = 3; c.strokeRect(8, 8, w - 16, h - 16);
    txt(c, "RAY'S", w / 2, 40, 20, '#b02020', { font: 'Georgia, serif', bold: '900' });
    txt(c, 'FAMOUS', w / 2, 62, 13, '#1a5a2a');
    txt(c, 'ORIGINAL PIZZA', w / 2, 82, 9, '#b02020', { bold: '700', font: 'Arial' });
    txt(c, 'WE DELIVER · 718-555-0142', w / 2, 104, 6, '#333', { bold: '700', font: 'Arial' });
    c.fillStyle = 'rgba(120,80,20,0.35)'; c.beginPath(); c.ellipse(90, 96, 16, 10, 0.4, 0, Math.PI * 2); c.fill();
    ageCanvas(c, w, h, 0.15, 6);
  }),
  bread: () => printed('bread', 64, 128, (c, w, h) => {
    c.fillStyle = 'rgba(250,250,250,0.95)'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { c.fillStyle = ['#e03030', '#f0c020', '#3060d0'][i % 3]; c.beginPath(); c.arc(10 + (i * 23) % 50, 20 + (i * 37) % 90, 7, 0, Math.PI * 2); c.fill(); }
    txt(c, 'CLOUD', w / 2, 58, 12, '#3060d0', { stroke: '#fff', sw: 3 });
    txt(c, 'BREAD', w / 2, 72, 12, '#e03030', { stroke: '#fff', sw: 3 });
  }),
  candy: () => printed('candy', 128, 32, (c, w, h) => {
    c.fillStyle = '#5a2a12'; c.fillRect(0, 0, w, h);
    txt(c, 'SNACKERS', w / 2, h / 2, 16, '#e8d080', { stroke: '#2a1206', sw: 3 });
  }),
  takeout: () => printed('takeout', 64, 64, (c, w, h) => {
    c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c02020'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w / 2 - 10, 26); c.lineTo(w / 2 + 10, 26); c.closePath(); c.stroke();
    txt(c, 'THANK', w / 2, 38, 9, '#c02020', { font: 'Arial' });
    txt(c, 'YOU', w / 2, 50, 9, '#c02020', { font: 'Arial' });
  }),
  meat: () => printed('meat', 96, 64, (c, w, h) => {
    c.fillStyle = '#efefef'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9a1818'; c.beginPath(); c.ellipse(w / 2, h / 2, 38, 22, 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8d0c0'; c.beginPath(); c.ellipse(w / 2 + 18, h / 2 - 4, 8, 14, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 12; i++) c.fillRect(20 + i * 5, 18 + (i % 3) * 9, 3, 1);
    c.fillStyle = '#fff'; c.fillRect(6, h - 16, 40, 12);
    txt(c, '$4.29 / LB', 26, h - 10, 6, '#222', { bold: '700', font: 'Arial' });
  }),
  fridgeNote: () => printed('fridgeNote', 64, 64, (c, w, h) => {
    c.fillStyle = '#f6ec8a'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(0, 0, w, 6);
    c.fillStyle = '#2a2a6a';
    c.font = 'bold 9px "Comic Sans MS", cursive'; c.textAlign = 'left';
    ['- coffee', '- eggs', '- feed Mochi', '- work 9am', '- trash tue'].forEach((s, i) => c.fillText(s, 5, 16 + i * 10));
  }),
  aptNumber: (n) => printed('aptnum' + n, 64, 32, (c, w, h) => {
    c.fillStyle = '#c8a040'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#6a4a10'; c.lineWidth = 2; c.strokeRect(2, 2, w - 4, h - 4);
    txt(c, n, w / 2, h / 2 + 1, 20, '#2a1a06', { font: 'Georgia, serif', bold: '700' });
  }),
  sign: (key, lines, bg = '#f0f0e8', fg = '#111') => printed('sign' + key, 128, 64, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
    lines.forEach((s, i) => txt(c, s, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 16, 13, fg, { font: 'Arial' }));
    ageCanvas(c, w, h, 0.2, key.length);
  }),
  calendar: (crossed = 0) => printed('cal' + crossed, 96, 128, (c, w, h) => {
    c.fillStyle = '#f4f0e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6a8ab0'; c.fillRect(0, 0, w, 52);
    // photo: lighthouse-ish scene
    c.fillStyle = '#9ac0e0'; c.fillRect(4, 4, w - 8, 44);
    c.fillStyle = '#3a6a9a'; c.fillRect(4, 34, w - 8, 14);
    c.fillStyle = '#fff'; c.fillRect(60, 12, 8, 24); c.fillStyle = '#c02020'; c.fillRect(60, 18, 8, 4);
    txt(c, 'JULY 1999', w / 2, 60, 10, '#222', { font: 'Arial' });
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    c.font = 'bold 6px Arial'; c.fillStyle = '#555'; c.textAlign = 'center';
    days.forEach((d, i) => c.fillText(d, 8 + i * 13, 70));
    // July 1 1999 was a Thursday
    for (let d = 1; d <= 31; d++) {
      const idx = d + 3;
      const col = idx % 7, row = Math.floor(idx / 7);
      const x = 8 + col * 13, y = 79 + row * 10;
      c.fillStyle = col === 0 ? '#b02020' : '#333';
      c.fillText(String(d), x, y);
      if (d <= crossed) { c.strokeStyle = '#c01010'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x - 5, y - 4); c.lineTo(x + 5, y + 2); c.moveTo(x + 5, y - 4); c.lineTo(x - 5, y + 2); c.stroke(); }
    }
    ageCanvas(c, w, h, 0.12, 9);
  }),
  poster: (key, draw) => printed('poster' + key, 128, 176, draw),
};

export function labelMat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: o.roughness ?? 0.6, metalness: o.metalness ?? 0, envMapIntensity: o.env ?? 0.8, transparent: o.transparent ?? false, side: o.side ?? THREE.FrontSide });
}
