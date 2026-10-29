// The filler city around the landmarks, seen from a fourth floor in Tribeca
// looking south down West Broadway: the Financial District and Civic Center,
// Battery Park City, Tribeca, SoHo and the Village behind us, Midtown far to
// the north, Brooklyn across the East River and Jersey City across the
// Hudson, plus the land they stand on. Pre-war towers step back to copper
// pyramids, spires and lanterns; post-war slabs carry penthouses, masts and
// beacons; low brick blocks get bulkheads and wooden water tanks. One
// instanced draw for every box, one merged draw for every roof object.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { OUT, OUT_GLSL, FACADE_GLSL, Kit, solidMaterial } from './outdoor.js';

const G0 = -14;
// ------------------------------------------------------------------ the frame
// Real geography, turned so the window looks straight at the North Tower:
// origin at West Broadway and Leonard St, -z down West Broadway (bearing 214.5),
// +x to the right (west, toward the Hudson), +z north.
const LAT0 = 40.7185, LON0 = -74.0068, SB = Math.sin(214.5 * Math.PI / 180), CB = Math.cos(214.5 * Math.PI / 180);
export function geo(lat, lon) {
  const E = (lon - LON0) * 84380, N = (lat - LAT0) * 111000;
  return [E * CB - N * SB, -(E * SB + N * CB)];
}
const poly = (pts) => pts.map(([la, lo]) => geo(la, lo));
// shorelines
export const MANHATTAN = poly([[40.775, -73.996], [40.760, -74.0035], [40.750, -74.0085], [40.740, -74.0105], [40.730, -74.0110], [40.725, -74.0118], [40.720, -74.0132], [40.716, -74.0146],
  [40.713, -74.0168], [40.708, -74.0185], [40.704, -74.0185], [40.7015, -74.0168], [40.7005, -74.0145], [40.7012, -74.0118], [40.7025, -74.0095], [40.7055, -74.0045], [40.7085, -74.0005],
  [40.7115, -73.9970], [40.7105, -73.9900], [40.7125, -73.9775], [40.7210, -73.9725], [40.7300, -73.9715], [40.7400, -73.9735], [40.7500, -73.9675], [40.7600, -73.9580], [40.775, -73.946]]);
export const BROOKLYN = poly([[40.770, -73.940], [40.750, -73.957], [40.735, -73.9605], [40.720, -73.9625], [40.710, -73.9700], [40.702, -73.9770], [40.704, -73.9900], [40.699, -73.9970],
  [40.688, -74.0010], [40.678, -74.0150], [40.640, -74.0350], [40.600, -74.0350], [40.600, -73.800], [40.770, -73.800]]);
export const JERSEY = poly([[40.790, -74.0100], [40.760, -74.0230], [40.745, -74.0250], [40.730, -74.0300], [40.720, -74.0335], [40.714, -74.0330], [40.708, -74.0350], [40.700, -74.0400],
  [40.690, -74.0450], [40.660, -74.0700], [40.640, -74.1000], [40.640, -74.2500], [40.790, -74.2500]]);
const GOV = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return geo(40.6895 + Math.sin(a) * 0.0035, -74.0168 + Math.cos(a) * 0.0052); });

export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export const isWater = (x, z) => !inside(MANHATTAN, x, z) && !inside(BROOKLYN, x, z) && !inside(JERSEY, x, z) && !inside(GOV, x, z);
// ground kept for the street canyon built by street.js: [x0, x1, z0, z1]
export const RESERVED = [[-58, 72, -628, 60], [-260, 260, -22, 3]];

const BLD_VS = /* glsl */`
attribute vec3 iSize; attribute vec4 iA; attribute vec3 iB;
varying vec3 vL; varying vec3 vS; varying vec4 vA; varying vec3 vB; varying vec3 vNo; varying vec3 vN; varying vec3 vW;
void main(){
  vS = iSize; vA = iA; vB = iB; vNo = normal;
  vL = position * iSize;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
// iA: seed, lit modifier, burn, style (8 plain). iB: wall colour (linear)
const BLD_FS = /* glsl */`
${OUT_GLSL}
${FACADE_GLSL}
varying vec3 vL; varying vec3 vS; varying vec4 vA; varying vec3 vB; varying vec3 vNo; varying vec3 vN; varying vec3 vW;
// crisp masonry texels up close: running-bond brick or ashlar stone, 16 texels a metre
vec3 masonry(vec3 base, vec2 f, float stone, float seed){
  vec2 q = floor(f * 16.0);
  vec2 unit = stone > 0.5 ? vec2(10.0, 6.0) : vec2(4.0, 2.0);
  float row = floor(q.y / unit.y);
  float qx = q.x + mod(row, 2.0) * unit.x * 0.5;
  float mortar = max(step(mod(q.y, unit.y), 0.0), step(mod(qx, unit.x), 0.0));
  vec3 c = base * (0.84 + 0.3 * h31(vec3(floor(qx / unit.x), row, seed)));
  return mix(c, base * 0.6 + vec3(0.015), mortar * 0.75);
}
void main(){
  vec3 no = vNo, n = normalize(vN);
  float seed = vA.x, style = vA.w;
  vec3 base = vB, c;
  float yg = vW.y + 14.0;
  bool sx = abs(no.x) > 0.5;
  float across = (sx ? vL.z : vL.x) + (sx ? vS.z : vS.x) * 0.5;
  if (no.y > 0.5) {
    // roof: tar and gravel inside a parapet rim
    vec2 e = vS.xz * 0.5 - abs(vL.xz);
    float rim = 1.0 - smoothstep(0.35, 0.8, min(e.x, e.y));
    vec3 alb = mix(vec3(0.055, 0.052, 0.05) * (0.7 + 0.6 * vn2(vL.xz * 0.25 + seed)), base * 0.75, rim);
    c = outLight(alb, n);
  } else {
    // soot runs down from sills and the roofline; pollution darkens the lower floors
    float streak = vn2(vec2(across * 1.1 + seed * 7.0, yg * 0.018));
    float grime = (0.8 + 0.28 * vn2(vec2(across * 0.12, yg * 0.04) + seed)) * (1.0 - 0.2 * smoothstep(0.55, 0.9, streak)) * mix(0.82, 1.0, smoothstep(0.0, 40.0, yg));
    float tx = max(fwidth(across), fwidth(yg)) * 16.0;
    if (tx < 1.2 && (style < 1.5 || style > 5.5) && style < 7.5) base = mix(masonry(base, vec2(across, yg), step(0.5, style) * step(style, 1.5), seed), base, smoothstep(0.6, 1.2, tx));
    vec3 wall = outLight(base * grime, n);
    float wm;
    if (style > 7.5) c = wall;
    else c = facade(vec2(across, yg), style, seed, vA.y, wall, n, vW, vec3(0.011, 0.01, 0.009), wm);
    // masonry: a cornice lip catching the light, and its shadow below
    if ((style < 1.5 || style > 5.5) && style < 7.5 && vS.y > 4.0) {
      float top = vS.y - vL.y;
      c = mix(c, wall * 1.3, step(top, 0.8));
      c *= 1.0 - 0.5 * step(0.8, top) * step(top, 1.4);
    }
    // street level: shopfronts and lobbies, some still lit at night
    if (yg < 4.6 && style < 7.5) {
      float bayS = floor(across / 6.0);
      float shop = step(0.18, fract(across / 6.0)) * step(0.4, yg) * step(yg, 3.9);
      c = mix(c, vec3(0.015, 0.015, 0.017) + skyRefl(reflect(normalize(vW - cameraPosition), n)) * 0.12, shop * 0.85);
      c += shop * vec3(1.0, 0.72, 0.4) * oNight * 0.7 * step(0.45, h21(vec2(bayS, seed))) * (1.0 - oBlackout);
    }
    // sodium light from the streets climbing the lower floors
    c += base * vec3(1.0, 0.5, 0.18) * 0.07 * oNight * exp(-yg / 22.0) * (1.0 - oBlackout * 0.6);
    c += base * lampPools(vW, n) * 0.6;
  }
  // burning: a seat of fire that spreads with the days, shattered windows, soot climbing the face
  float burn = vA.z * oBurn;
  if (burn > 0.0 && no.y < 0.5) {
    vec2 g = vec2(across, yg) / vec2(3.0, 3.6);
    vec2 gi = floor(g), gf = abs(fract(g) - 0.5);
    float rnd = h31(vec3(gi, seed));
    float win = step(gf.x, 0.3) * step(gf.y, 0.28);
    vec2 seat = vec2(h21(vec2(seed, 3.0)) * (sx ? vS.z : vS.x), (vW.y - vL.y + 14.0) + vS.y * (0.2 + 0.55 * h21(vec2(seed, 1.0))));
    vec2 dd = (vec2(across, yg) - seat) / vec2(6.0 + 26.0 * burn, 5.0 + 18.0 * burn);
    float zone = smoothstep(1.0, 0.35, length(dd) + (vn2(g * 0.7 + seed) - 0.5) * 0.6);
    float broken = win * step(rnd, burn * 0.45 + zone * 0.6);
    float soot = max(zone, smoothstep(0.0, 1.5, dd.y) * smoothstep(3.0, 0.5, dd.y) * smoothstep(1.4, 0.3, abs(dd.x))) * (0.6 + 0.4 * vn2(vec2(across * 0.5, yg * 0.05)));
    c = mix(c, vec3(0.006, 0.005, 0.005), broken * 0.85);
    c *= 1.0 - 0.85 * soot * min(1.0, burn * 1.5);
    float fl = 0.55 + 0.45 * sin(oTime * 9.0 + rnd * 40.0) * sin(oTime * 5.3 + rnd * 12.0);
    c += win * step(rnd, 0.92) * zone * vec3(2.2, 0.7, 0.14) * fl * (0.7 + oNight);
    c += vec3(0.8, 0.26, 0.05) * zone * (1.0 - win) * 0.2 * fl * (0.3 + oNight);
  }
  gl_FragColor = vec4(outFog(c, vW), 1.0);
}`;
let bldMat = null;
// one InstancedMesh of facade boxes; list entries: {x, y, z, w, h, d, ry, seed, lit, burn, style, col}
export function boxMesh(scene, list) {
  const n = list.length;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  bldMat = bldMat || new THREE.ShaderMaterial({ vertexShader: BLD_VS, fragmentShader: BLD_FS, uniforms: { ...OUT } });
  const mesh = new THREE.InstancedMesh(geo, bldMat, n);
  const A = new Float32Array(n * 4), B = new Float32Array(n * 3), S = new Float32Array(n * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.ry || 0), new THREE.Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    A.set([b.seed, b.lit ?? 1, b.burn ?? 0, b.style], i * 4); B.set([b.col.r, b.col.g, b.col.b], i * 3); S.set([b.w, b.h, b.d], i * 3);
    b.index = i;
  });
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
  geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
  geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(S, 3));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// palettes (sRGB hex, converted to linear by THREE.Color)
export const PAL = {
  brick: [0x7a3a2a, 0x6a3426, 0x84452e, 0x5a3024, 0x8a5038, 0x6e4632],
  buff: [0xa88a68, 0x9c8264, 0xb09a78, 0x8e7a62],
  stone: [0xb0a490, 0xa49c8c, 0xbcb09a, 0x9a948a, 0x8c8a86],
  white: [0xb8b4aa, 0xc4c0b4, 0xa8a69e],
  alu: [0x9a9ea4, 0x8a9096, 0xa4a8ac],
  dark: [0x262a2e, 0x1c2024, 0x2c2a26, 0x1e2a28, 0x22262e],
  black: [0x141416, 0x18181c],
};
const COPPER = [0x3e6e5a, 0x4a7a64, 0x2e3a36, 0x6a5a48, 0x3a3e42];
const gauss = (x, z, [cx, cz], s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
const C_FIDI = geo(40.7065, -74.0095), C_WTC = geo(40.7117, -74.0133), C_CIVIC = geo(40.7135, -74.0035), C_MID = geo(40.7545, -73.9830),
  C_EXCH = geo(40.7160, -74.0335), C_NEWPORT = geo(40.7275, -74.0330), C_BKLYN = geo(40.6930, -73.9900), C_CHELSEA = geo(40.7420, -73.9950);

export class Skyline {
  constructor(scene, landmarks, glows) {
    this.scene = scene;
    const rng = this.rng = new RNG(1999);
    this.boxes = [];
    this.buildings = [];           // main shafts: {x, y, z, w, h, d, burn} for the fire FX
    this.roofs = [];               // water tank spots
    this.kit = new Kit();          // pyramids, spires, masts, tanks
    this.glows = glows;
    const keep = landmarks.keep;
    this.clear = (x, z, r) => keep.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr + r) && RESERVED.every(([x0, x1, z0, z1]) => x + r < x0 || x - r > x1 || z + r < z0 || z - r > z1);
    this.districts();
    this.mesh = boxMesh(scene, this.boxes);
    this.mat = this.mesh.material;
    this.buildLand();
    const roofMesh = this.kit.mesh(solidMaterial());
    roofMesh.frustumCulled = false;
    scene.add(roofMesh); this.roofMesh = roofMesh;
  }

  // ------------------------------------------------------------ placement
  districts() {
    const rng = this.rng;
    const fits = (P, x, z, r) => inside(P, x - r, z - r) && inside(P, x + r, z + r) && inside(P, x - r, z + r) && inside(P, x + r, z - r);
    // walk a jittered grid over a region, one lot per cell
    const region = (x0, x1, z0, z1, step, P, fn) => {
      for (let gx = x0; gx < x1; gx += step) for (let gz = z0; gz < z1; gz += step) {
        const x = gx + rng.range(-0.2, 0.2) * step, z = gz + rng.range(-0.2, 0.2) * step;
        const w = rng.range(0.45, 0.82) * step, d = rng.range(0.45, 0.82) * step, r = Math.max(w, d) * 0.6;
        if (!fits(P, x, z, r) || !this.clear(x, z, r)) continue;
        fn(x, z, w, d);
      }
    };
    // Lower Manhattan: Tribeca low around us, rising to the Financial District and the Civic Center
    region(-1300, 1000, -2300, 400, 52, MANHATTAN, (x, z, w, d) => {
      if (rng.next() < 0.12) return;
      const fidi = gauss(x, z, C_FIDI, 380), wtc = gauss(x, z, C_WTC, 260), civic = gauss(x, z, C_CIVIC, 240);
      const k = Math.max(fidi, wtc * 0.75, civic * 0.6);
      const h = 14 + rng.next() ** 1.7 * (26 + 235 * k);
      const bpc = gauss(x, z, geo(40.7095, -74.0165), 260) > 0.35;
      if (bpc && rng.next() < 0.6) { this.tower(x, z, w, d, 50 + rng.next() * 90, 'res', 0.1 + rng.range(-0.05, 0.05)); return; }
      this.tower(x, z, w, d, h, h > 60 ? (rng.next() < 0.45 ? 'pre' : 'post') : 'low', k > 0.3 ? rng.pick([0.1, -0.2, 0.35, 0.6]) : 0.1 + rng.range(-0.06, 0.06), rng.next() < 0.5 ? rng.range(0.4, 1) : 0);
    });
    // SoHo, the Village, Chelsea, Midtown: behind us, seen from the roof
    region(-2600, 2600, 400, 7000, 105, MANHATTAN, (x, z, w, d) => {
      if (rng.next() < 0.1) return;
      const k = Math.max(gauss(x, z, C_MID, 1100), gauss(x, z, C_CHELSEA, 500) * 0.35);
      const tall = rng.next() < 0.04;
      const h = tall ? rng.range(70, 140) : 14 + rng.next() ** 1.5 * (28 + 230 * k);
      this.tower(x, z, w, d, h, h > 70 ? (rng.next() < 0.4 ? 'pre' : 'post') : 'low', 0.1, rng.next() < 0.3 ? rng.range(0.3, 0.8) : 0);
    });
    // Brooklyn: low and endless, Downtown Brooklyn's towers
    region(-6500, -500, -5000, 5000, 160, BROOKLYN, (x, z, w, d) => {
      if (rng.next() < 0.2) return;
      const k = gauss(x, z, C_BKLYN, 420);
      const tall = rng.next() < k * 0.6;
      this.tower(x, z, w, d, tall ? rng.range(60, 140) : 9 + rng.next() ** 2 * 26, tall ? 'post' : 'bk', rng.range(-0.5, 0.5), 0);
    });
    // Jersey City and Hoboken across the Hudson: Exchange Place and Newport towers
    region(700, 5000, -4000, 3500, 150, JERSEY, (x, z, w, d) => {
      if (rng.next() < 0.25) return;
      const k = Math.max(gauss(x, z, C_EXCH, 260), gauss(x, z, C_NEWPORT, 320) * 0.8);
      const tall = rng.next() < k * 0.8;
      this.tower(x, z, w, d, tall ? rng.range(70, 165) : 9 + rng.next() ** 2 * 24, tall ? 'post' : 'bk', rng.range(-0.3, 0.3), 0);
    });
    // chimneys that never stop: Con Ed's East River stacks, the Navy Yard incinerator, a hospital boiler house
    this.stacks = [];
    for (const [la, lo, h, n, col, steam] of [[40.7280, -73.9740, 150, 4, 0x6a3a2c, 1], [40.7000, -73.9720, 90, 2, 0x5a5650, 0], [40.7100, -74.0050, 60, 1, 0x5a3a2c, 1]]) {
      const [x, z] = geo(la, lo);
      for (let i = 0; i < n; i++) {
        const sx = x + i * 26, r = h * 0.045;
        this.kit.add(STACK, col, { x: sx, y: G0, z, sx: r, sy: h, sz: r });
        this.kit.add(STACK, 0xc8c4bc, { x: sx, y: G0 + h * 0.86, z, sx: r * 1.02, sy: h * 0.05, sz: r * 1.02 });
        this.stacks.push({ p: new THREE.Vector3(sx, G0 + h, z), r, steam, t: rng.next() * 3 });
      }
      this.kit.add(BOX, col, { x: x + (n - 1) * 13, y: G0 + 14, z: z + 30, sx: n * 26 + 20, sy: 28, sz: 50 });
    }
  }

  // one building: shaft + tiers + roof objects. kind: pre, post, res, low, bk
  tower(x, z, w, d, h, kind, ry = 0, burn = 0, o = {}) {
    const rng = this.rng, kit = this.kit;
    const lit = rng.range(0.6, 1.3);
    const seed = rng.range(0, 100);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const at = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    const add = (lx, lz, bw, bh, bd, y0, style, col, extra = {}) => {
      const [px, pz] = at(lx, lz);
      const b = { x: px, z: pz, y: G0 + y0, w: bw, h: bh, d: bd, ry, seed: seed + y0 * 0.37 + lx, lit, burn, style, col: new THREE.Color(col), ...extra };
      this.boxes.push(b);
      return b;
    };
    let style, col;
    if (kind === 'pre') { const s = rng.next(); style = s < 0.3 ? 0 : 1; col = s < 0.3 ? rng.pick(PAL.brick) : s < 0.55 ? rng.pick(PAL.buff) : rng.pick(PAL.stone); }
    else if (kind === 'post') { const s = rng.next(); style = s < 0.3 ? 2 : s < 0.55 ? 3 : s < 0.75 ? 4 : s < 0.9 ? 5 : 6; col = style === 2 ? rng.pick(PAL.dark) : style === 3 ? rng.pick(PAL.alu) : style === 4 ? rng.pick(PAL.white) : style === 5 ? rng.pick(PAL.black) : rng.pick(PAL.white); }
    else if (kind === 'res') { style = rng.next() < 0.6 ? 0 : 6; col = style === 0 ? rng.pick([...PAL.brick, ...PAL.buff]) : rng.pick(PAL.white); }
    else if (kind === 'bk') { style = rng.next() < 0.75 ? 0 : 6; col = rng.pick([...PAL.brick, ...PAL.brick, ...PAL.buff, ...PAL.stone]); }
    else { const s = rng.next(); style = s < 0.55 ? 0 : s < 0.8 ? 7 : s < 0.9 ? 1 : 6; col = style === 0 ? rng.pick(PAL.brick) : style === 7 ? rng.pick([...PAL.brick, ...PAL.buff]) : style === 1 ? rng.pick(PAL.stone) : rng.pick(PAL.white); }
    col = new THREE.Color(col).multiplyScalar(rng.range(0.85, 1.1)).getHex();
    let top = h, tw = w, td = d;
    if (kind === 'pre' && h > 60) {
      // podium, shaft and tiers stepping back like the 1916 zoning envelope
      const h0 = h * rng.range(0.22, 0.4), h1 = h * rng.range(0.72, 0.84);
      const main = add(0, 0, w, h0, d, 0, style, col);
      this.buildings.push(main);
      add(0, 0, w * 0.74, h1 - h0, d * 0.74, h0, style, col);
      tw = w * 0.5; td = d * 0.5;
      add(0, 0, tw, h - h1, td, h1, style, col);
      if (rng.next() < 0.4) this.tank(...at(w * 0.3, d * 0.3), G0 + h0, ry);
      const cr = o.crown || rng.pick(['pyr', 'pyr', 'spire', 'step', 'lantern', 'flat']);
      const cc = rng.pick(COPPER);
      const [cx, cz] = at(0, 0);
      if (cr === 'pyr') { const ph = Math.min(tw, td) * rng.range(0.7, 1.3); kit.add(PYR, cc, { x: cx, y: G0 + h, z: cz, sx: tw * 0.98, sy: ph, sz: td * 0.98, ry, glow: rng.next() < 0.4 ? 0.12 : 0 }); top = h + ph; }
      else if (cr === 'spire') { const sh = h * rng.range(0.12, 0.22); kit.add(SPIRE, 0x5a5a58, { x: cx, y: G0 + h, z: cz, sx: Math.min(tw, td) * 0.28, sy: sh, sz: Math.min(tw, td) * 0.28 }); top = h + sh; }
      else if (cr === 'step') { add(0, 0, tw * 0.7, 6, td * 0.7, h, style, col); add(0, 0, tw * 0.4, 6, td * 0.4, h + 6, style, col); top = h + 12; }
      else if (cr === 'lantern') { add(0, 0, tw * 0.45, 9, td * 0.45, h, 1, col); kit.add(PYR, cc, { x: cx, y: G0 + h + 9, z: cz, sx: tw * 0.45, sy: 7, sz: td * 0.45, ry, glow: 0.15 }); top = h + 16; }
      else add(0, 0, tw * 0.5, 5, td * 0.5, h, 8, 0x5a5652);
    } else if (kind === 'post') {
      const pod = rng.next() < 0.35 ? rng.range(8, 20) : 0;
      if (pod) add(0, 0, w * 1.25, pod, d * 1.25, 0, rng.next() < 0.5 ? style : 1, rng.pick(PAL.stone));
      const main = add(0, 0, w, h - pod, d, pod, style, col);
      this.buildings.push(main);
      add(0, 0, w * rng.range(0.4, 0.6), rng.range(5, 10), d * rng.range(0.4, 0.6), h, 8, new THREE.Color(col).multiplyScalar(0.8).getHex());
      // roof clutter: cooling towers and fans
      for (let k = 0, n = rng.int(1, 3); k < n; k++) add(rng.range(-0.3, 0.3) * w, rng.range(-0.3, 0.3) * d, rng.range(3, 7), rng.range(2, 4), rng.range(3, 7), h, 8, 0x6a6864);
      if (rng.next() < 0.25 || h > 200) { const [mx, mz] = at(rng.range(-0.15, 0.15) * w, rng.range(-0.15, 0.15) * d); const mh = rng.range(12, 45); kit.add(SPIRE, 0x6a6a6a, { x: mx, y: G0 + h + 6, z: mz, sx: 0.8, sy: mh, sz: 0.8 }); top = h + 6 + mh; }
    } else if (kind === 'res') {
      const main = add(0, 0, w, h, d, 0, style, col);
      this.buildings.push(main);
      const [cx, cz] = at(0, 0);
      if (rng.next() < 0.6) { const ph = rng.range(7, 14); kit.add(HIP, rng.pick(COPPER), { x: cx, y: G0 + h, z: cz, sx: w * 0.95, sy: ph, sz: d * 0.95, ry }); top = h + ph; }
      else add(0, 0, w * 0.5, 6, d * 0.5, h, 8, 0x6a6460);
    } else {
      // low: brick blocks with bulkheads and water tanks
      const main = add(0, 0, w, h, d, 0, style, col);
      this.buildings.push(main);
      add(rng.range(-0.25, 0.25) * w, rng.range(-0.25, 0.25) * d, 3.2, 3.4, 3.6, h, 8, 0x4a4440);
      if (kind !== 'bk' ? rng.next() < 0.55 : rng.next() < 0.12) {
        const [tx, tz] = at(rng.range(-0.3, 0.3) * w, rng.range(-0.3, 0.3) * d);
        this.tank(tx, tz, G0 + h, ry);
        if (rng.next() < 0.2) { const [ux, uz] = at(rng.range(-0.3, 0.3) * w, rng.range(-0.3, 0.3) * d); this.tank(ux, uz, G0 + h, ry); }
      }
    }
    // aviation beacons on anything tall
    if (top > 150 && this.glows) this.glows.add(new THREE.Vector3(x, G0 + top + 1, z), 0xff2a12, 2.2, { blink: rng.range(0.4, 0.7), phase: rng.next(), mode: 1, k: 3 });
  }
  tank(x, z, y, ry) {
    const r = this.rng.range(2.4, 3.6), kit = this.kit;
    const wood = new THREE.Color(0x4a3a2e).multiplyScalar(this.rng.range(0.7, 1.2)).getHex();
    kit.add(TANK_BARREL, wood, { x, y: y + 3, z, sx: r, sy: r * 1.5, sz: r, ry });
    kit.add(TANK_HAT, 0x2e2a28, { x, y: y + 3 + r * 1.5, z, sx: r * 1.1, sy: r * 0.6, sz: r * 1.1, ry });
    kit.add(TANK_LEGS, 0x1e1e20, { x, y, z, sx: r, sy: 3, sz: r, ry });
    this.roofs.push(new THREE.Vector3(x, y, z));
  }

  buildLand() {
    const kit = this.kit;
    const land = (P, top, side, pat, depth = 1.6) => {
      const sh = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, -14.02 - depth, 0);
      kit.add(g, top, { side, pat });
    };
    land(MANHATTAN, 0x4a4742, 0x3a3630, 5);
    land(BROOKLYN, 0x4a4640, 0x3a3630, 5);
    land(GOV, 0x3a4630, 0x3a3630, 4);
    land(JERSEY, 0x4a4742, 0x3a3630, 5);
    // Hudson piers off Tribeca and the Village, the big square Pier 40
    for (const [la, lo, w, l] of [[40.7205, -74.0135, 28, 220], [40.7235, -74.0128, 26, 200], [40.7290, -74.0118, 110, 250], [40.7330, -74.0113, 26, 210], [40.7395, -74.0108, 30, 230]]) {
      const [x, z] = geo(la, lo), ang = Math.atan2(-1, 0.2);
      const dx = Math.cos(ang + 0.6), dz = Math.sin(ang + 0.6);
      kit.add(BOX, 0x56524c, { x: x + dx * l * 0.45, y: -14.6, z: z + dz * l * 0.45, sx: l, sy: 1.2, sz: w, ry: -Math.atan2(dz, dx), side: 0x2e2a26, pat: 2 });
      if (w > 60) kit.add(BOX, 0x6a5a4a, { x: x + dx * l * 0.45, y: -14 + 6, z: z + dz * l * 0.45, sx: l * 0.85, sy: 12, sz: w * 0.9, ry: -Math.atan2(dz, dx) });
    }
    // Governors Island: Fort Jay's mound and brick barracks
    const [gx, gz] = geo(40.6895, -74.0168);
    kit.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x34442c, { x: gx, y: -14, z: gz, sx: 230, sy: 24, sz: 170 });
    for (let i = 0; i < 9; i++) kit.add(BOX, 0x6a3a2a, { x: gx - 150 + (i % 3) * 90 + this.rng.range(-20, 20), y: -14 + 6, z: gz + 120 - Math.floor(i / 3) * 60, sx: 60, sy: 12, sz: 18, ry: 0.4 });
  }
}

const PYR = new THREE.CylinderGeometry(0, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const HIP = new THREE.CylinderGeometry(0.28, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const SPIRE = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
const STACK = new THREE.CylinderGeometry(0.8, 1, 1, 10, 1).translate(0, 0.5, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const TANK_BARREL = new THREE.CylinderGeometry(1, 1.04, 1, 10, 1).translate(0, 0.5, 0);
const TANK_HAT = new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0);
const TANK_LEGS = (() => {
  const k = new Kit();
  for (const [dx, dz] of [[-0.62, -0.62], [0.62, -0.62], [0.62, 0.62], [-0.62, 0.62]]) k.add(BOX, 0, { x: dx, y: 0.5, z: dz, sx: 0.08, sy: 1, sz: 0.08 });
  k.add(BOX, 0, { y: 0.97, sx: 1.7, sy: 0.06, sz: 1.7 });
  const g = k.geometry(); g.deleteAttribute('color'); g.deleteAttribute('aux'); return g;
})();
export const TANK = { barrel: TANK_BARREL, hat: TANK_HAT, legs: TANK_LEGS };
