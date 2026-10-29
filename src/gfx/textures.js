// Procedural pixel-art textures. Everything is generated on canvases at load
// time: low resolution, nearest-filtered up close, with derived normal maps so
// the realistic lighting still reads surface detail.
import * as THREE from 'three';
import { RNG, clamp, lerp, hash2, smoothstep } from '../core/util.js';

export const texCache = new Map();
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = Math.min(8, a || 4); }

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return { c, ctx };
}

// Pixel-art texels: redraw a photographic texture at a fixed size, area-averaged
// so it keeps its colours, then magnified nearest so each texel is a crisp
// square up close (mipmapped far away). Keeps wrap, flip, uv channel, colour space.
export function downsample(tex, size) {
  const img = tex && tex.image;
  if (!img || !img.width) return tex;
  if (img.width <= size) { tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; return tex; }
  const h = Math.max(4, Math.round(size * img.height / img.width));
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, h);
  const t = new THREE.CanvasTexture(c);
  for (const k of ['wrapS', 'wrapT', 'flipY', 'colorSpace', 'channel']) t[k] = tex[k];
  t.repeat.copy(tex.repeat); t.offset.copy(tex.offset); t.rotation = tex.rotation; t.center.copy(tex.center);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function toTexture(canvas, { srgb = true, nearest = false, repeat = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : (nearest ? THREE.NearestFilter : THREE.LinearFilter);
  t.generateMipmaps = mips;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// tileable value noise with independent periods on x and y
function h2(x, y) { return hash2(x, y); }
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function tn(x, y, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const mx = (a) => ((a % px) + px) % px, my = (a) => ((a % py) + py) % py;
  const a = h2(mx(xi), my(yi)), b = h2(mx(xi + 1), my(yi));
  const c = h2(mx(xi), my(yi + 1)), d = h2(mx(xi + 1), my(yi + 1));
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function tf(x, y, px, py, oct = 4, seed = 0) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * tn(x * f + seed * 31.7, y * f + seed * 17.3, px * f, py * f);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

// Fill an RGBA image from a per-pixel function. fn(x, y) -> [r,g,b,(a)], height
export function paint(w, h, fn, { height = false } = {}) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const H = height ? new Float32Array(w * h) : null;
  const out = [0, 0, 0, 255, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255; out[4] = 0.5;
      fn(x, y, out);
      const i = (y * w + x) * 4;
      d[i] = clamp(out[0], 0, 255); d[i + 1] = clamp(out[1], 0, 255); d[i + 2] = clamp(out[2], 0, 255); d[i + 3] = clamp(out[3], 0, 255);
      if (H) H[y * w + x] = out[4];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, ctx, height: H, w, h };
}

export function normalFromHeight(H, w, h, strength = 2) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayToCanvas(arr, w, h, map = (v) => v) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = clamp(map(arr[i]) * 255, 0, 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Bundle -> { map, normalMap, roughnessMap, worldSize }
function bundle(p, { normal = 2, rough = null, worldSize = 1, nearest = false } = {}) {
  const out = { map: toTexture(p.canvas, { nearest }), worldSize };
  if (p.height && normal) out.normalMap = toTexture(normalFromHeight(p.height, p.w, p.h, normal), { srgb: false, nearest });
  if (p.height && rough) out.roughnessMap = toTexture(grayToCanvas(p.height, p.w, p.h, rough), { srgb: false, nearest });
  return out;
}

function cached(key, fn) {
  if (texCache.has(key)) return texCache.get(key);
  const v = fn();
  texCache.set(key, v);
  return v;
}

// grime: darkens with low-frequency blotches, more near the bottom (v=1 is bottom)
function grime(x, y, w, h, seed, amt) {
  const n = tf(x / w * 4, y / h * 4, 4, 4, 4, seed);
  return 1 - amt * smoothstep(0.45, 0.85, n);
}

// ---------------------------------------------------------------------------
export function woodFloor({ seed = 3, base = [118, 76, 46], size = 256, worldSize = 2 } = {}) {
  return cached('wood' + seed + base, () => {
    const rng = new RNG(seed);
    const plankH = 14;
    const rows = Math.ceil(size / plankH);
    const cuts = [];
    for (let r = 0; r < rows; r++) {
      const n = rng.int(2, 3);
      const off = rng.range(0, size);
      const arr = [];
      for (let i = 0; i < n; i++) arr.push((off + (size / n) * i + rng.range(-20, 20) + size) % size);
      arr.sort((a, b) => a - b);
      cuts.push(arr);
    }
    const p = paint(size, size, (x, y, o) => {
      const row = Math.floor(y / plankH) % rows;
      const ly = y % plankH;
      const cs = cuts[row];
      let idx = 0;
      for (let i = 0; i < cs.length; i++) if (x >= cs[i]) idx = i + 1;
      if (idx === cs.length) idx = 0;
      const tone = hash2(row * 7 + 1, idx * 13 + seed) * 0.35 + 0.8;
      const grain = tf(x / size * 3, y / size * 48 + row * 0.37, 3, 48, 3, row + idx);
      const fine = tf(x / size * 32, y / size * 128, 32, 128, 2, 5);
      let k = tone * (0.78 + grain * 0.35 + fine * 0.1);
      // knots
      const kn = tf(x / size * 6, y / size * 6, 6, 6, 2, idx + row * 3);
      if (kn > 0.82) k *= 0.75;
      // edges
      let hgt = 0.8;
      let nearCut = false;
      for (const c of cs) if (Math.abs(x - c) < 1 || Math.abs(x - c) > size - 1) nearCut = true;
      if (ly === 0 || nearCut) { k *= 0.45; hgt = 0.15; } else if (ly === 1 || ly === plankH - 1) { hgt = 0.6; k *= 0.92; }
      const g = grime(x, y, size, size, seed, 0.25);
      o[0] = base[0] * k * g; o[1] = base[1] * k * g; o[2] = base[2] * k * g;
      o[4] = hgt + fine * 0.15;
    }, { height: true });
    return bundle(p, { normal: 3, rough: (v) => 0.55 + (1 - v) * 0.3, worldSize });
  });
}

export function wallpaper({ seed = 1, base = [176, 162, 128], accent = [150, 132, 98], size = 128, worldSize = 1, stripes = true } = {}) {
  return cached('wallp' + seed + base + stripes, () => {
    const p = paint(size, size, (x, y, o) => {
      let k = 1;
      const u = x / size, v = y / size;
      let c = base;
      if (stripes) {
        const s = (x % 32);
        if (s < 3 || (s > 14 && s < 17)) c = accent;
      }
      // small motif (diamond) every 32 px
      const mx = ((x + 16) % 32) - 16, my = ((y + (Math.floor(x / 32) % 2) * 16) % 32) - 16;
      const dm = Math.abs(mx) + Math.abs(my);
      if (dm === 5 || dm === 2) c = accent;
      const n = tf(u * 16, v * 16, 16, 16, 3, seed);
      k *= 0.9 + n * 0.14;
      k *= grime(x, y, size, size, seed + 2, 0.18);
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k;
      o[4] = 0.5 + n * 0.2 + (c === accent ? 0.06 : 0);
    }, { height: true });
    return bundle(p, { normal: 1.2, rough: () => 0.85, worldSize });
  });
}

export function plaster({ seed = 2, base = [196, 190, 176], size = 128, worldSize = 1.5, dirt = 0.25 } = {}) {
  return cached('plaster' + seed + base + dirt, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const n = tf(u * 24, v * 24, 24, 24, 3, seed);
      const m = tf(u * 3, v * 3, 3, 3, 4, seed + 9);
      let k = 0.88 + n * 0.16;
      k *= 1 - dirt * smoothstep(0.5, 0.9, m);
      o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
      o[4] = n;
    }, { height: true });
    return bundle(p, { normal: 0.25, rough: () => 0.9, worldSize });
  });
}

export function ceiling({ seed = 4, size = 128, worldSize = 2 } = {}) {
  return cached('ceil' + seed, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const n = tf(u * 32, v * 32, 32, 32, 2, seed);
      const st = tf(u * 2, v * 2, 2, 2, 5, seed + 3);
      let k = 0.92 + n * 0.08;
      let r = 222 * k, g = 218 * k, b = 208 * k;
      if (st > 0.62) { const s = smoothstep(0.62, 0.75, st); r -= 40 * s; g -= 50 * s; b -= 70 * s; }
      if (Math.abs(st - 0.62) < 0.006) { r -= 50; g -= 55; b -= 60; }
      o[0] = r; o[1] = g; o[2] = b; o[4] = n;
    }, { height: true });
    return bundle(p, { normal: 0.35, rough: () => 0.95, worldSize });
  });
}

export function tiles({ seed = 5, base = [200, 204, 196], grout = [92, 90, 84], n = 8, size = 128, worldSize = 1, crack = true } = {}) {
  return cached('tiles' + seed + base + n, () => {
    const t = size / n;
    const p = paint(size, size, (x, y, o) => {
      const tx = Math.floor(x / t), ty = Math.floor(y / t);
      const lx = x % t, ly = y % t;
      const tone = 0.9 + hash2(tx + seed, ty) * 0.12;
      const nz = tf(x / size * 16, y / size * 16, 16, 16, 2, seed);
      let r = base[0] * tone, g = base[1] * tone, b = base[2] * tone, hh = 0.85;
      // glossy highlight band inside tile
      if (lx === 1 || ly === 1) { r *= 1.06; g *= 1.06; b *= 1.06; }
      if (lx === 0 || ly === 0) { const gd = 0.8 + nz * 0.3; r = lerp(r, grout[0], 0.75) * gd; g = lerp(g, grout[1], 0.75) * gd; b = lerp(b, grout[2], 0.75) * gd; hh = 0.3; }
      if (crack && hash2(tx * 3 + 1, ty * 5 + seed) > 0.975) {
        const cx = Math.abs((lx - ly) + Math.floor((hash2(tx, ty) - 0.5) * 6));
        if (cx < 1 && lx > 1 && ly > 1) { r *= 0.55; g *= 0.55; b *= 0.55; hh = 0.4; }
      }
      const gm = grime(x, y, size, size, seed, 0.2);
      o[0] = r * gm; o[1] = g * gm; o[2] = b * gm; o[4] = hh;
    }, { height: true });
    return bundle(p, { normal: 2.5, rough: (v) => (v > 0.5 ? 0.25 : 0.9), worldSize });
  });
}

export function checker({ seed = 6, a = [196, 188, 168], b = [58, 54, 50], n = 8, size = 128, worldSize = 2.4 } = {}) {
  return cached('check' + seed + a + b, () => {
    const t = size / n;
    const p = paint(size, size, (x, y, o) => {
      const tx = Math.floor(x / t), ty = Math.floor(y / t);
      const c = (tx + ty) % 2 ? a : b;
      const nz = tf(x / size * 32, y / size * 32, 32, 32, 2, seed);
      const wear = tf(x / size * 4, y / size * 4, 4, 4, 4, seed + 1);
      let k = 0.92 + nz * 0.1;
      k *= 1 - 0.18 * smoothstep(0.55, 0.85, wear);
      const edge = (x % t === 0 || y % t === 0) ? 0.85 : 1;
      o[0] = c[0] * k * edge; o[1] = c[1] * k * edge; o[2] = c[2] * k * edge; o[4] = edge < 1 ? 0.3 : 0.7;
    }, { height: true });
    return bundle(p, { normal: 1, rough: () => 0.55, worldSize });
  });
}

export function carpet({ seed = 7, base = [92, 40, 40], pattern = true, size = 128, worldSize = 1.2 } = {}) {
  return cached('carpet' + seed + base + pattern, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const n = tf(u * 64, v * 64, 64, 64, 2, seed);
      const m = tf(u * 6, v * 6, 6, 6, 3, seed + 2);
      let k = 0.75 + n * 0.4;
      let c = base;
      if (pattern) {
        const px = (x % 32) - 16, py = (y % 32) - 16;
        const r = Math.abs(px) + Math.abs(py);
        if (r > 10 && r < 13) c = [c[0] * 0.55, c[1] * 0.55 + 20, c[2] * 0.55 + 10];
        if (r < 3) c = [c[0] * 1.3 + 30, c[1] * 1.1 + 20, c[2]];
      }
      k *= 1 - 0.25 * smoothstep(0.5, 0.85, m);
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[4] = n;
    }, { height: true });
    return bundle(p, { normal: 1.2, rough: () => 1, worldSize });
  });
}

export function fabric({ seed = 8, base = [104, 92, 60], alt = [80, 70, 44], plaid = true, size = 64, worldSize = 0.5 } = {}) {
  return cached('fab' + seed + base + alt + plaid, () => {
    const p = paint(size, size, (x, y, o) => {
      const weave = ((x + y) % 2) ? 1.0 : 0.9;
      let c = base;
      if (plaid) {
        const bx = (x % 16) < 4, by = (y % 16) < 4;
        if (bx || by) c = alt;
        if (bx && by) c = [alt[0] * 0.8, alt[1] * 0.8, alt[2] * 0.8];
        if ((x % 16) === 9 || (y % 16) === 9) c = [c[0] + 30, c[1] + 24, c[2] + 10];
      }
      const n = tf(x / size * 8, y / size * 8, 8, 8, 2, seed);
      const k = weave * (0.85 + n * 0.25);
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[4] = weave * 0.5;
    }, { height: true });
    return bundle(p, { normal: 1.5, rough: () => 1, worldSize });
  });
}

export function patchwork({ seed = 9, size = 256, worldSize = 1 } = {}) {
  return cached('patch' + seed + size, () => {
    const rng = new RNG(seed);
    // faded calico, gingham and solids; a cream sashing and running stitches
    const pal = [[164, 62, 52], [70, 86, 128], [184, 160, 100], [84, 116, 82], [196, 184, 160], [122, 70, 92], [104, 92, 70], [196, 120, 84]];
    // washed a hundred times: every colour pulled toward a dingy grey
    for (const c of pal) { const g = (c[0] + c[1] + c[2]) / 3; for (let k = 0; k < 3; k++) c[k] = c[k] * 0.62 + g * 0.3; }
    const cells = [];
    for (let i = 0; i < 64; i++) cells.push({ c: rng.pick(pal), d: rng.pick(pal), pat: rng.int(0, 4) });
    const C = size / 8;
    const p = paint(size, size, (x, y, o) => {
      const cx = Math.floor(x / C), cy = Math.floor(y / C);
      const cell = cells[(cy * 8 + cx) % 64];
      const lx = (x % C) / C, ly = (y % C) / C;
      let c = cell.c, k = 1, h = 0.6;
      if (cell.pat === 1 && (Math.floor(lx * 8) + Math.floor(ly * 8)) % 2) c = cell.d;                          // gingham
      if (cell.pat === 2 && ((lx * 6 + (Math.floor(ly * 6) % 2) * 0.5) % 1 - 0.5) ** 2 + ((ly * 6) % 1 - 0.5) ** 2 < 0.06) c = [236, 226, 200]; // calico dots
      if (cell.pat === 3 && (lx > 0.25 && lx < 0.75) !== (ly > 0.25 && ly < 0.75)) c = cell.d;                  // four-patch
      if (cell.pat === 4 && Math.abs(lx - ly) < 0.12) c = cell.d;                                                  // diagonal strip
      const edge = Math.min(lx, ly, 1 - lx, 1 - ly);
      if (edge < 0.06) { c = [214, 202, 178]; h = 0.75; }                                                          // sashing
      if (Math.abs(edge - 0.1) < 0.012 && (Math.floor((lx + ly) * C * 0.5) % 3)) { k = 0.72; h = 0.3; }        // stitches
      const n = tf(x / size * 32, y / size * 32, 32, 32, 2, seed);
      k *= 0.86 + n * 0.22 + ((x + y) % 2 ? 0.03 : 0);
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[4] = h;
    }, { height: true });
    return bundle(p, { normal: 2, rough: () => 1, worldSize });
  });
}

export function woodDark({ seed = 10, base = [92, 58, 36], size = 128, worldSize = 1 } = {}) {
  return cached('wd' + seed + base, () => {
    const p = paint(size, size, (x, y, o) => {
      const g = tf(x / size * 2, y / size * 40, 2, 40, 4, seed);
      const f = tf(x / size * 32, y / size * 96, 32, 96, 2, seed + 4);
      const ring = Math.abs(Math.sin((g * 9 + x / size) * Math.PI * 2));
      const k = 0.7 + ring * 0.2 + f * 0.15;
      o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k; o[4] = 0.5 + f * 0.2;
    }, { height: true });
    return bundle(p, { normal: 1, rough: () => 0.5, worldSize });
  });
}

export function laminate({ seed = 11, base = [200, 192, 170], size = 128, worldSize = 1 } = {}) {
  return cached('lam' + seed + base, () => {
    const p = paint(size, size, (x, y, o) => {
      const h = hash2(x * 3 + seed, y * 7);
      let c = base;
      let k = 0.95 + tf(x / size * 8, y / size * 8, 8, 8, 2, seed) * 0.08;
      if (h > 0.93) k *= 0.6; else if (h > 0.88) k *= 1.1;
      o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; o[4] = 0.5;
    }, { height: true });
    return bundle(p, { normal: 0.3, rough: () => 0.35, worldSize });
  });
}

export function enamel({ seed = 12, base = [226, 222, 206], size = 128, worldSize = 1, dirt = 0.3 } = {}) {
  return cached('enam' + seed + base + dirt, () => {
    const p = paint(size, size, (x, y, o) => {
      const n = tf(x / size * 10, y / size * 10, 10, 10, 4, seed);
      const k = 1 - dirt * 0.4 * smoothstep(0.62, 0.95, n) - (y > size * 0.88 ? 0.06 * dirt : 0);
      o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k; o[4] = n;
    }, { height: true });
    return bundle(p, { normal: 0.2, rough: (v) => 0.25 + v * 0.3, worldSize });
  });
}

export function beigePlastic({ seed = 13, base = [204, 196, 172], size = 64, worldSize = 0.5 } = {}) {
  return cached('beige' + seed + base, () => {
    const p = paint(size, size, (x, y, o) => {
      const s = hash2(x + seed * 9, y * 3) > 0.96 ? 0.9 : 1;
      const n = tf(x / size * 4, y / size * 4, 4, 4, 3, seed);
      const k = s * (0.94 + n * 0.08);
      o[0] = base[0] * k; o[1] = base[1] * k * 0.99; o[2] = base[2] * k * 0.95; o[4] = s;
    }, { height: true });
    return bundle(p, { normal: 0.4, rough: () => 0.55, worldSize });
  });
}

export function metal({ seed = 14, base = [150, 150, 150], size = 64, worldSize = 0.5, rust = 0 } = {}) {
  return cached('metal' + seed + base + rust, () => {
    const p = paint(size, size, (x, y, o) => {
      const b = tf(x / size * 64, y / size * 2, 64, 2, 2, seed);
      const r = tf(x / size * 4, y / size * 4, 4, 4, 4, seed + 1);
      let c = [base[0] * (0.9 + b * 0.15), base[1] * (0.9 + b * 0.15), base[2] * (0.9 + b * 0.15)];
      if (rust > 0) { const t = smoothstep(0.6 - rust * 0.3, 0.85, r); c = [lerp(c[0], 120, t), lerp(c[1], 62, t), lerp(c[2], 30, t)]; }
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[4] = b;
    }, { height: true });
    return bundle(p, { normal: 0.3, rough: (v) => 0.3 + v * 0.25, worldSize });
  });
}

export function concrete({ seed = 15, base = [128, 126, 120], size = 128, worldSize = 2 } = {}) {
  return cached('conc' + seed + base, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const n = tf(u * 32, v * 32, 32, 32, 3, seed);
      const m = tf(u * 4, v * 4, 4, 4, 4, seed + 2);
      const pit = hash2(x + seed, y) > 0.97 ? 0.7 : 1;
      const k = (0.8 + n * 0.3) * (1 - 0.2 * smoothstep(0.5, 0.9, m)) * pit;
      o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k; o[4] = n * pit;
    }, { height: true });
    return bundle(p, { normal: 1.8, rough: () => 0.95, worldSize });
  });
}

export function brick({ seed = 16, base = [130, 64, 48], size = 128, worldSize = 1.6 } = {}) {
  return cached('brick' + seed + base, () => {
    const bh = 8, bw = 24;
    const p = paint(size, size, (x, y, o) => {
      const row = Math.floor(y / bh);
      const off = (row % 2) * (bw / 2);
      const bx = Math.floor((x + off) / bw);
      const lx = (x + off) % bw, ly = y % bh;
      const tone = 0.75 + hash2(bx + row * 31, row + seed) * 0.4;
      const n = tf(x / size * 32, y / size * 32, 32, 32, 2, seed);
      let r = base[0] * tone, g = base[1] * tone, b = base[2] * tone, hh = 0.8 + n * 0.2;
      if (lx === 0 || ly === 0) { r = g = b = 100 + n * 30; hh = 0.2; }
      o[0] = r * (0.9 + n * 0.2); o[1] = g * (0.9 + n * 0.2); o[2] = b * (0.9 + n * 0.2); o[4] = hh;
    }, { height: true });
    return bundle(p, { normal: 2, rough: () => 0.95, worldSize });
  });
}

// door with raised panels; returns non-tiling texture for a 0.9 x 2.05 door
export function doorPanel({ seed = 17, base = [126, 88, 56], painted = false, size = 64 } = {}) {
  return cached('door' + seed + base + painted, () => {
    const W = size, Hh = size * 2;
    const p = paint(W, Hh, (x, y, o) => {
      const u = x / W, v = y / Hh;
      let hgt = 0.6;
      const inPanel = (u0, v0, u1, v1) => u > u0 && u < u1 && v > v0 && v < v1;
      const bevel = (u0, v0, u1, v1) => {
        const d = Math.min(u - u0, u1 - u, (v - v0) * 2, (v1 - v) * 2);
        return d;
      };
      const panels = [[0.15, 0.07, 0.85, 0.45], [0.15, 0.53, 0.85, 0.93]];
      for (const pn of panels) {
        if (inPanel(...pn)) { const d = bevel(...pn); hgt = d < 0.04 ? 0.35 + d * 6 : 0.8; }
      }
      const g = painted ? tf(u * 8, v * 8, 8, 8, 2, seed) : tf(u * 2, v * 30, 2, 30, 3, seed);
      const k = painted ? 0.92 + g * 0.1 : 0.75 + g * 0.35;
      const dirt = v > 0.9 ? 0.85 : 1;
      o[0] = base[0] * k * (0.8 + hgt * 0.25) * dirt; o[1] = base[1] * k * (0.8 + hgt * 0.25) * dirt; o[2] = base[2] * k * (0.8 + hgt * 0.25) * dirt;
      o[4] = hgt;
    }, { height: true });
    const b = bundle(p, { normal: 3, rough: () => (painted ? 0.45 : 0.6), worldSize: 1 });
    b.map.wrapS = b.map.wrapT = THREE.ClampToEdgeWrapping;
    if (b.normalMap) b.normalMap.wrapS = b.normalMap.wrapT = THREE.ClampToEdgeWrapping;
    return b;
  });
}

// kitchen cabinet door (non tiling)
export function cabinetDoor({ seed = 18, base = [170, 150, 118], size = 64 } = {}) {
  return cached('cab' + seed + base, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const m = Math.min(u, 1 - u, v, 1 - v);
      let hgt = 0.7;
      if (m < 0.1) hgt = 0.9; else if (m < 0.14) hgt = 0.4;
      const g = tf(u * 2, v * 16, 2, 16, 3, seed);
      const k = 0.82 + g * 0.25;
      o[0] = base[0] * k * (0.85 + hgt * 0.2); o[1] = base[1] * k * (0.85 + hgt * 0.2); o[2] = base[2] * k * (0.85 + hgt * 0.2); o[4] = hgt;
    }, { height: true });
    const b = bundle(p, { normal: 2, rough: () => 0.6 });
    b.map.wrapS = b.map.wrapT = THREE.ClampToEdgeWrapping;
    return b;
  });
}

export function cardboard({ seed = 19, size = 64, worldSize = 0.5 } = {}) {
  return cached('card' + seed, () => {
    const p = paint(size, size, (x, y, o) => {
      const n = tf(x / size * 8, y / size * 8, 8, 8, 3, seed);
      const f = (y % 3 === 0) ? 0.95 : 1;
      const k = (0.85 + n * 0.25) * f;
      o[0] = 170 * k; o[1] = 128 * k; o[2] = 84 * k; o[4] = f;
    }, { height: true });
    return bundle(p, { normal: 0.6, rough: () => 1, worldSize });
  });
}

// RGBA grime for window glass: smudges, dust, streaks, fingerprints
export function glassDirt({ seed = 20, size = 256, density = 1 } = {}) {
  return cached('glass' + seed + density, () => {
    const rng = new RNG(seed);
    const { c, ctx } = makeCanvas(size, size);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const dust = tf(u * 12, v * 12, 12, 12, 4, seed);
        const big = tf(u * 2, v * 2, 2, 2, 4, seed + 1);
        const streak = tf(u * 40, v * 2, 40, 2, 2, seed + 2);
        let a = smoothstep(0.55, 0.95, dust) * 0.22 + smoothstep(0.6, 0.95, big) * 0.14;
        a += smoothstep(0.7, 0.98, streak) * 0.12 * v;
        a += v > 0.86 ? (v - 0.86) * 1.1 : 0; // dirt collects at the bottom
        a *= density;
        const i = (y * size + x) * 4;
        d[i] = 120 + dust * 40; d[i + 1] = 112 + dust * 36; d[i + 2] = 96 + dust * 30; d[i + 3] = clamp(a, 0, 0.92) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // smears
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(8, 30);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(130,120,100,0.12)'); g.addColorStop(1, 'rgba(130,120,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const t = toTexture(c, { nearest: false });
    return t;
  });
}

// soft radial blob (light pools, glow sprites)
export function radial({ size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)' } = {}) {
  return cached('rad' + size + inner + outer, () => {
    const { c, ctx } = makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return toTexture(c, { nearest: false, repeat: false });
  });
}

export function bloodSplat({ seed = 21, size = 64 } = {}) {
  return cached('blood' + seed, () => {
    const rng = new RNG(seed);
    const { c, ctx } = makeCanvas(size, size);
    ctx.fillStyle = 'rgba(120,6,6,1)';
    const cx = size / 2, cy = size / 2;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(size * 0.1, size * 0.45), r = rng.range(1, size * 0.07);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2); ctx.fill();
    }
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] > 0) {
        const n = hash2(i, seed);
        img.data[i] = 90 + n * 60; img.data[i + 1] = 2 + n * 8; img.data[i + 2] = 4 + n * 6;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  });
}

export function fleshTex({ seed = 22, size = 128, worldSize = 1.2 } = {}) {
  return cached('flesh' + seed, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const n = tf(u * 8, v * 8, 8, 8, 4, seed);
      const vein = Math.abs(tf(u * 6, v * 6, 6, 6, 3, seed + 3) - 0.5);
      const fine = tf(u * 32, v * 32, 32, 32, 2, seed + 5);
      let r = 120 + n * 60, g = 40 + n * 20, b = 44 + n * 20;
      if (vein < 0.03) { r *= 0.5; g *= 0.4; b *= 0.8; }
      r *= 0.85 + fine * 0.3; g *= 0.85 + fine * 0.3; b *= 0.85 + fine * 0.3;
      o[0] = r; o[1] = g; o[2] = b; o[4] = n * 0.7 + (vein < 0.03 ? 0.4 : 0) + fine * 0.2;
    }, { height: true });
    return bundle(p, { normal: 3, rough: (v) => 0.25 + v * 0.3, worldSize });
  });
}

// Giger-ish ribbed biomechanical surface (lab ending)
export function biomech({ seed = 23, size = 128, worldSize = 1.5 } = {}) {
  return cached('bio' + seed, () => {
    const p = paint(size, size, (x, y, o) => {
      const u = x / size, v = y / size;
      const rib = Math.pow(Math.abs(Math.sin(v * Math.PI * 12 + tf(u * 2, v * 2, 2, 2, 2, seed) * 3)), 0.6);
      const tube = Math.pow(Math.abs(Math.sin(u * Math.PI * 6)), 3);
      const n = tf(u * 16, v * 16, 16, 16, 3, seed + 1);
      const hgt = clamp(rib * 0.6 + tube * 0.4 + n * 0.2, 0, 1);
      const k = 0.25 + hgt * 0.55;
      o[0] = 70 * k + n * 18; o[1] = 72 * k + n * 14; o[2] = 76 * k + n * 10; o[4] = hgt;
    }, { height: true });
    return bundle(p, { normal: 4, rough: (v) => 0.2 + (1 - v) * 0.4, worldSize });
  });
}

// generic label/print texture helper: draws with a callback on a canvas
export function printed(key, w, h, draw, { nearest = false } = {}) {
  return cached('print:' + key, () => {
    const { c, ctx } = makeCanvas(w, h);
    ctx.imageSmoothingEnabled = false;
    draw(ctx, w, h);
    const t = toTexture(c, { nearest, repeat: false });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// add some age/noise to an already drawn canvas
export function ageCanvas(ctx, w, h, amt = 0.15, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const n = tf(x / w * 4, y / h * 4, 4, 4, 3, seed);
    const g = hash2(x + seed * 13, y);
    const k = 1 - amt * smoothstep(0.4, 0.9, n) - (g - 0.5) * amt * 0.3;
    d[i] *= k; d[i + 1] *= k * 0.98; d[i + 2] *= k * 0.92;
  }
  ctx.putImageData(img, 0, 0);
}
