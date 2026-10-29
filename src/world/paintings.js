// Real paintings on the walls: public-domain Met Open Access images with the
// faces wiped out (see tools/paintings.py). Each hangs in a swept moulding
// frame, tipped off the wall on its wire. The canvas is matte, aged under old
// varnish, with weave and impasto in the normal map.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { std } from '../gfx/materials.js';
import * as T from '../gfx/textures.js';
import { mouldingFrame } from '../gfx/shapes.js';
import { Button } from './interactables.js';
import { lerp, smoothstep } from '../core/util.js';
import { PAINTINGS } from './paintings.data.js';

// profiles as fractions of the frame's width (out) and depth (z), with shade
const PROFILES = {
  gilt: [[0, 0, 0.45], [0, 0.16, 0.5], [0.05, 0.22, 0.85], [0.1, 0.25, 1], [0.15, 0.22, 0.8], [0.19, 0.28, 0.55], [0.19, 0.28, 0.55],
    [0.28, 0.5, 0.45], [0.4, 0.72, 0.6], [0.54, 0.88, 0.85], [0.64, 0.97, 1], [0.73, 1, 1], [0.8, 0.95, 0.9], [0.84, 0.84, 0.6], [0.84, 0.84, 0.6],
    [0.88, 0.8, 0.55], [0.93, 0.84, 0.85], [0.98, 0.76, 0.8], [1, 0.6, 0.7], [1, 0.6, 0.7], [1, 0, 0.5]],
  wood: [[0, 0, 0.5], [0, 0.32, 0.6], [0.08, 0.46, 0.85], [0.2, 0.52, 0.95], [0.24, 0.5, 0.8], [0.24, 0.5, 0.8],
    [0.34, 0.66, 0.75], [0.55, 0.9, 0.95], [0.75, 1, 1], [0.9, 0.9, 0.95], [1, 0.7, 0.85], [1, 0.7, 0.85], [1, 0, 0.6]],
};
const FRAME_MATS = {};
let backMat = null;
function frameMat(kind) {
  if (FRAME_MATS[kind]) return FRAME_MATS[kind];
  const m = kind === 'gilt'
    ? std('frameGilt', giltTex(), { metalness: 0.55, roughness: 0.5, env: 0.35, normal: 0.5 })
    : kind === 'ebony'
      ? std('frameEbony', T.woodDark({ seed: 42, base: [34, 28, 24], worldSize: 0.5 }), { roughness: 0.6, env: 0.25, useRough: false, normal: 0.5 })
      : std('frameWalnut', T.woodDark({ seed: 41, base: [84, 54, 34], worldSize: 0.5 }), { roughness: 0.62, env: 0.25, useRough: false, normal: 0.6 });
  m.vertexColors = true;
  FRAME_MATS[kind] = m;
  return m;
}

// worn gold leaf: soft mottling, red bole showing through where it's rubbed
function giltTex() {
  const p = T.paint(64, 64, (x, y, o) => {
    const m = T.tf(x / 64 * 4, y / 64 * 4, 4, 4, 4, 40), f = T.tf(x / 64 * 16, y / 64 * 16, 16, 16, 2, 41);
    const k = 0.78 + m * 0.3 + f * 0.08;
    const bole = smoothstep(0.6, 0.7, m * 0.7 + f * 0.3) * 0.55;
    o[0] = lerp(184 * k, 126, bole); o[1] = lerp(146 * k, 62, bole); o[2] = lerp(80 * k, 40, bole); o[4] = f * 0.6 - bole * 0.3;
  }, { height: true });
  const map = T.toTexture(p.canvas, { nearest: false }), normalMap = T.toTexture(T.normalFromHeight(p.height, 64, 64, 1), { srgb: false, nearest: false });
  map.repeat.set(4, 4); normalMap.repeat.set(4, 4);
  return { map, normalMap };
}

// canvas surface: the photo, aged in place once decoded, plus a normal map from
// thread weave, craquelure and the paint's own light and dark (fake impasto)
function canvasMaterial(key, age) {
  const p = PAINTINGS[key];
  const { c, ctx } = T.makeCanvas(p.w, p.h);
  ctx.fillStyle = '#4a4236'; ctx.fillRect(0, 0, p.w, p.h);
  const map = T.toTexture(c, { nearest: false, repeat: false });
  const { c: nc, ctx: nctx } = T.makeCanvas(4, 4);
  nctx.fillStyle = 'rgb(128,128,255)'; nctx.fillRect(0, 0, 4, 4);
  const normalMap = T.toTexture(nc, { srgb: false, nearest: false, repeat: false });
  const mat = std('painting_' + key, { map, normalMap }, { roughness: 0.84, env: 0.15, normal: 0.8 });
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, p.w, p.h);
    agePaint(ctx, p.w, p.h, age, key.length * 7);
    map.needsUpdate = true;
    mat.normalMap = T.toTexture(T.normalFromHeight(surfaceHeight(ctx, p.w, p.h, age, key.length * 13), p.w, p.h, 1.4), { srgb: false, nearest: false, repeat: false });
    mat.needsUpdate = true;
  };
  img.src = p.src;
  return mat;
}

function rng(seed) { let a = seed * 9301 + 49297; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; }

function agePaint(ctx, w, h, age, seed) {
  const r = rng(seed);
  // yellowed varnish, heavier toward the edges where it was never cleaned
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(255,${246 - age * 14},${222 - age * 30})`; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(1, `rgb(${200 - age * 30},${190 - age * 30},${170 - age * 30})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // grime line under the frame lip
  ctx.fillStyle = 'rgba(70,58,44,0.45)';
  ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 4, w, 4); ctx.fillRect(0, 0, 3, h); ctx.fillRect(w - 3, 0, 3, h);
  // dust settled on the paint, lighter, sparse
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < w * h * 0.0015; i++) { ctx.fillStyle = `rgba(200,190,170,${0.05 + r() * 0.08})`; ctx.fillRect(r() * w, r() * h, 1, 1); }
  ctx.globalCompositeOperation = 'source-over';
}

function surfaceHeight(ctx, w, h, age, seed) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) H[i] = (d[j] * 0.3 + d[j + 1] * 0.55 + d[j + 2] * 0.15) / 255 * 0.35;
  // plain weave, two pixels a thread
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const over = ((x >> 1) + (y >> 1)) & 1;
    H[y * w + x] += (over ? Math.sin((x & 1) * Math.PI * 0.5 + 0.8) : Math.sin((y & 1) * Math.PI * 0.5 + 0.8)) * 0.05;
  }
  // craquelure: short wandering cracks in the old varnish
  const r = rng(seed);
  const n = Math.round(w * h * 0.0004 * (0.4 + age));
  for (let k = 0; k < n; k++) {
    let x = r() * w, y = r() * h, a = r() * Math.PI * 2;
    for (let s = 0; s < 14; s++) {
      a += (r() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a);
      const xi = x | 0, yi = y | 0;
      if (xi >= 0 && yi >= 0 && xi < w && yi < h) H[yi * w + xi] -= 0.12;
    }
  }
  return H;
}

const LINES = {
  charpentier: ['Their faces are gone.', 'The dog is fine. Only them.', 'I hung this. They had faces when I hung it.'],
  pitcher: ['Her face is smeared away.', 'It looks wet. It isn\'t.'],
  madamex: ['She was turned away. Now there\'s nothing to turn.', 'I keep checking.'],
  thinker: ['He\'s looking at the floor. With what?', 'He had glasses. I remember the glasses.'],
  aristotle: ['Even the statue.', 'Both of them. Even the stone one.'],
};

// Hang a painting. pos: centre of the canvas on the wall surface; ry: wall
// facing; height: canvas height in metres; frame: 'gilt' | 'walnut' | 'ebony'.
export function hangPainting(root, key, { pos, ry, height, frame = 'gilt', fw = 0.06, fd = 0.04, tilt = 0.03, roll = 0, age = 0.5 }) {
  const p = PAINTINGS[key];
  const ch = height, cw = height * p.w / p.h;
  const outer = new THREE.Group(), inner = new THREE.Group();
  const fm = new THREE.Mesh(mouldingFrame(cw, ch, PROFILES[frame === 'gilt' ? 'gilt' : 'wood'].map(([o, z, s]) => [o * fw, z * fd, s])), frameMat(frame));
  fm.castShadow = true; fm.receiveShadow = true;
  // the canvas runs under the rabbet so the lip hides its edge
  const cv = new THREE.Mesh(new THREE.PlaneGeometry(cw + 0.012, ch + 0.012), canvasMaterial(key, age));
  cv.position.z = fd * 0.12; cv.receiveShadow = true;
  // a dark backing board so the tilt gap doesn't show the wall through the frame
  const back = new THREE.Mesh(new THREE.PlaneGeometry(cw + fw * 1.6, ch + fw * 1.6), backMat || (backMat = std('frameBack', null, { color: 0x1a1612, roughness: 1 })));
  back.position.z = 0.001;
  inner.add(back, cv, fm);
  inner.position.y = ch / 2 + fw;
  outer.add(inner);
  outer.position.set(pos.x, pos.y - ch / 2 - fw, pos.z);
  outer.rotation.set(tilt, ry, roll, 'YXZ');
  root.add(outer);
  const lines = LINES[key] || ['...'];
  const art = { key, group: outer, roll0: roll, seen: 0 };
  art.inter = new Button(outer, {
    name: 'painting', label: 'look', reach: 2.6,
    onUse: () => { G.hud.inner(lines[Math.min(art.seen, lines.length - 1)]); art.seen++; },
  });
  return art;
}

// each loop the paintings hang a little more crooked, always the same way
export function settlePaintings(list, day) {
  for (const a of list) {
    const s = a.key.length % 2 ? 1 : -1;
    a.group.rotation.z = a.roll0 + s * Math.max(0, day - 1) * 0.008;
    a.seen = 0;
  }
}

export const PAINTING_CREDITS = Object.values(PAINTINGS).map((p) => `${p.artist}, ${p.title} (${p.date}). ${p.credit}`);
