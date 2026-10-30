// What the 3D CRT shows when the player isn't sitting at the computer:
// a low-res redraw of the desktop (wallpaper, icons, windows, taskbar), a flashing
// INCOMING CALL banner while the phone rings, and a flying-noodle screensaver when idle.
import { W, H, DESK_H, fmtClock } from './dom.js';
import { iconCanvas } from './icons.js';

const SAVER_AFTER = 60;
let noodles = null;
const iconCache = new Map();
const ic = (n) => { if (!iconCache.has(n)) iconCache.set(n, iconCanvas(n)); return iconCache.get(n); };

export function drawScreen(comp, ctx, w, h) {
  const os = comp.os, t = performance.now() / 1000;
  const sx = w / W, sy = h / H;
  const ringing = !!comp.hotline.ringing;
  if (!comp.isOpen && comp.idle > SAVER_AFTER && comp.screensaver !== false && !ringing) { saver(ctx, w, h, t); return; }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (os.wallSrc) ctx.drawImage(os.wallSrc, 0, 0, w, DESK_H * sy); else { ctx.fillStyle = '#008080'; ctx.fillRect(0, 0, w, h); }
  // icons
  for (const d of os.iconDefs || []) {
    const p = os.iconPos[d.id]; if (!p) continue;
    const name = typeof d.icon === 'function' ? d.icon() : d.icon;
    ctx.drawImage(ic(name), (p.x + 20) * sx, (p.y + 2) * sy, 32 * sx, 32 * sy);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect((p.x + 14) * sx, (p.y + 40) * sy, 44 * sx, Math.max(1, 3 * sy));
  }
  // windows in z-order
  const wins = [...os.wins].filter((x) => !x.min).sort((a, b) => (+a.el.style.zIndex) - (+b.el.style.zIndex));
  for (const win of wins) {
    const r = win.rect, x = r.x * sx, y = r.y * sy, ww = r.w * sx, hh = r.h * sy;
    ctx.fillStyle = '#000'; ctx.fillRect(x + 2 * sx, y + 2 * sy, ww, hh);
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, ww, Math.max(1, sy));
    const g = ctx.createLinearGradient(x, 0, x + ww, 0);
    const active = win === os.active;
    g.addColorStop(0, active ? '#0a246a' : '#808080'); g.addColorStop(1, active ? '#a6caf0' : '#c0c0c0');
    ctx.fillStyle = g; ctx.fillRect(x + 3 * sx, y + 3 * sy, ww - 6 * sx, 18 * sy);
    ctx.fillStyle = '#fff'; ctx.font = `${Math.max(6, 12 * sy)}px "Pixelify Sans", sans-serif`; ctx.textBaseline = 'middle';
    ctx.fillText(win.title, x + 8 * sx, y + 12 * sy, ww - 30 * sx);
    // body: either a real snapshot of a canvas inside the window, or a sketch of content
    const cv = win.body.querySelector('canvas');
    const bx = x + 4 * sx, by = y + 24 * sy, bw = ww - 8 * sx, bh = hh - 28 * sy;
    if (cv && cv.width > 64 && (win.appId === 'abductor' || win.appId === 'noodletower' || win.appId === 'paint')) {
      try { ctx.drawImage(cv, bx, by, bw, bh); } catch { /* tainted */ }
    } else sketch(ctx, win, comp, bx, by, bw, bh, sx, sy);
  }
  // taskbar
  ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, DESK_H * sy, w, h - DESK_H * sy);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, DESK_H * sy, w, Math.max(1, sy));
  ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(6, 12 * sy)}px "Pixelify Sans", sans-serif`; ctx.fillText('Begin', 26 * sx, (DESK_H + 14) * sy);
  ctx.drawImage(ic('door'), 4 * sx, (DESK_H + 5) * sy, 18 * sx, 18 * sy);
  ctx.font = `${Math.max(6, 12 * sy)}px "Pixelify Sans", sans-serif`; ctx.textAlign = 'right';
  ctx.fillText(fmtClock(comp.game.state?.clock ?? 0), w - 6 * sx, (DESK_H + 14) * sy); ctx.textAlign = 'left';
  // incoming call banner
  if (ringing) {
    const on = Math.floor(t * 3) % 2 === 0;
    const bw = 420 * sx, bh = 110 * sy, bx = (w - bw) / 2, by = (DESK_H * sy - bh) / 2;
    ctx.fillStyle = on ? '#b01010' : '#600000'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, 3 * sx); ctx.strokeRect(bx + 4 * sx, by + 4 * sy, bw - 8 * sx, bh - 8 * sy);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(8, 34 * sy)}px "Pixelify Sans", sans-serif`; ctx.fillText('☎ INCOMING CALL', w / 2, by + 42 * sy);
    ctx.font = `${Math.max(6, 18 * sy)}px "Pixelify Sans", sans-serif`; ctx.fillText(`${comp.hotline.ringing.name}  ${comp.hotline.ringing.number}`, w / 2, by + 80 * sy);
    ctx.textAlign = 'left';
  } else if (comp.hotline.call && !comp.hotline.call.ended && !comp.isOpen) {
    ctx.fillStyle = 'rgba(255,176,0,0.9)'; ctx.fillRect(w - 170 * sx, 8 * sy, 162 * sx, 26 * sy);
    ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(6, 13 * sy)}px "Pixelify Sans", sans-serif`; ctx.fillText('CALLER ON HOLD', w - 160 * sx, 22 * sy);
  }
  ctx.restore();
}

// A recognisable doodle of each app's contents.
function sketch(ctx, win, comp, x, y, w, h, sx, sy) {
  const lines = (lx, ly, lw, lh, col = 'rgba(0,0,0,0.28)', step = 10) => {
    ctx.fillStyle = col;
    for (let yy = ly + 4 * sy; yy < ly + lh - 3 * sy; yy += step * sy) ctx.fillRect(lx + 4 * sx, yy, (lw - 8 * sx) * (0.45 + 0.55 * Math.abs(Math.sin(yy * 7.1 + lx))), Math.max(1, 2 * sy));
  };
  const id = win.appId;
  if (id === 'hotline') {
    const lw = 176 * sx;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, lw, h * 0.55);
    const call = comp.hotline.call || comp.hotline.ringing;
    ctx.fillStyle = call ? '#2a5' : '#0a3a0a'; ctx.fillRect(x + lw * 0.25, y + 8 * sy, lw * 0.5, lw * 0.5);
    ctx.fillStyle = '#001a00'; ctx.fillRect(x, y + h * 0.58, lw, 30 * sy);
    ctx.strokeStyle = '#4f4'; ctx.lineWidth = Math.max(1, sy); ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const xx = x + (i / 20) * lw, yy = y + h * 0.58 + 15 * sy + (call?.speaking ? Math.sin(i * 1.7 + performance.now() / 60) * 10 * sy : 0); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(x + lw + 6 * sx, y + 20 * sy, w - lw - 6 * sx, h - 20 * sy);
    lines(x + lw + 6 * sx, y + 20 * sy, w - lw - 6 * sx, h * 0.7, 'rgba(120,20,20,0.45)', 14);
  } else if (id === 'browser') {
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y + 60 * sy, w, h - 60 * sy);
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x + 50 * sx, y + 36 * sy, w - 60 * sx, 14 * sy);
    ctx.fillStyle = '#1aa85a'; ctx.fillRect(x, y + 60 * sy, w, 40 * sy);
    lines(x, y + 104 * sy, w, h - 104 * sy, 'rgba(0,0,200,0.35)', 12);
  } else if (id === 'mail') {
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y + 26 * sy, 116 * sx, h - 26 * sy); ctx.fillRect(x + 120 * sx, y + 26 * sy, w - 120 * sx, h - 26 * sy);
    lines(x + 120 * sx, y + 26 * sy, w - 120 * sx, 150 * sy, 'rgba(0,0,0,0.5)', 12);
    lines(x + 120 * sx, y + 180 * sy, w - 120 * sx, h - 180 * sy, 'rgba(0,0,0,0.22)', 10);
  } else if (id === 'files') {
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y + 26 * sy, w, h - 26 * sy);
    for (let i = 0; i < 6; i++) { ctx.drawImage(ic(i % 2 ? 'txt' : 'folder'), x + (12 + (i % 5) * 80) * sx, y + (34 + Math.floor(i / 5) * 60) * sy, 32 * sx, 32 * sy); }
  } else {
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    lines(x, y, w, h);
  }
}

function saver(ctx, w, h, t) {
  if (!noodles) noodles = Array.from({ length: 70 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), hue: [38, 8, 205, 85][Math.floor(Math.random() * 4)], spin: Math.random() * 6 }));
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, w, h);
  const dt = 0.016;
  for (const n of noodles) {
    n.z -= dt * 0.25; n.spin += dt * 2;
    if (n.z <= 0.02) { n.z = 1; n.x = (Math.random() - 0.5) * 2; n.y = (Math.random() - 0.5) * 2; }
    const px = w / 2 + (n.x / n.z) * w * 0.3, py = h / 2 + (n.y / n.z) * h * 0.3, s = (1 - n.z) * 26 * (w / 320);
    if (px < -40 || px > w + 40 || py < -40 || py > h + 40) continue;
    ctx.save(); ctx.translate(px, py); ctx.rotate(n.spin);
    ctx.strokeStyle = `hsl(${n.hue},80%,${55 + (1 - n.z) * 20}%)`; ctx.lineWidth = Math.max(1, s * 0.12); ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const a = i / 12; const xx = (a - 0.5) * s * 1.6, yy = Math.sin(a * 12 + t * 4) * s * 0.18; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
    ctx.stroke(); ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${Math.max(6, 11 * (h / 240))}px "Pixelify Sans", sans-serif`;
  ctx.fillText('Doorways 98', 8 * (w / 320), h - 8 * (h / 240));
}
