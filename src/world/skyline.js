// The filler city around the landmarks: the Financial District, Battery Park
// City, Tribeca and the Village, Midtown, and Brooklyn low across the East
// River, plus the land they stand on. Pre-war towers step back to copper
// pyramids, spires and lanterns; post-war slabs carry penthouses, masts and
// beacons; low brick blocks get bulkheads and wooden water tanks. One
// instanced draw for every box, one merged draw for every roof object.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { OUT, OUT_GLSL, FACADE_GLSL, Kit, solidMaterial } from './outdoor.js';

const G0 = -14;
// shorelines in (x, z): -z across the river, +x south
export const MANHATTAN = [[-7400, -3050], [-5000, -2330], [-3500, -1930], [-2500, -1620], [-1600, -1390], [-900, -1250], [-420, -1150], [-60, -1120], [60, -1120], [60, -1162], [112, -1162], [112, -1120],
  [300, -1112], [700, -1128], [1000, -1175], [1210, -1240], [1330, -1340], [1390, -1470], [1370, -1600], [1300, -1700], [1150, -1950], [900, -2250], [600, -2560], [250, -2810], [-200, -3060],
  [-700, -3310], [-1200, -3620], [-1500, -3960], [-2200, -4120], [-3200, -4330], [-4500, -4720], [-6000, -5230], [-7400, -5600]];
const BROOKLYN = [[6000, -1500], [3600, -1900], [2700, -2300], [2150, -2650], [1600, -2950], [900, -3380], [200, -3760], [-700, -4180], [-1600, -4560], [-3000, -4980], [-5000, -5650], [-7400, -6300], [-7400, -9500], [6000, -9500]];
const JERSEY = [[-6000, -230], [-2500, -160], [-1200, -110], [-470, -70], [-440, -122], [-50, -122], [-46, -35], [252, -35], [256, -128], [520, -132], [548, 110], [900, 260], [1800, 600], [6000, 700], [6000, 6000], [-6000, 6000]];
const GOV = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return [2520 + Math.cos(a) * 470 - Math.sin(a) * 90, -1880 + Math.sin(a) * 330]; });

export function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

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
void main(){
  vec3 no = vNo, n = normalize(vN);
  float seed = vA.x, style = vA.w;
  vec3 base = vB, c;
  float yg = vW.y + 14.0;
  float across = 0.0;
  if (no.y > 0.5) {
    // roof: tar and gravel inside a parapet rim
    vec2 e = vS.xz * 0.5 - abs(vL.xz);
    float rim = 1.0 - smoothstep(0.35, 0.8, min(e.x, e.y));
    vec3 alb = mix(vec3(0.055, 0.052, 0.05) * (0.7 + 0.6 * vn2(vL.xz * 0.25 + seed)), base * 0.75, rim);
    c = outLight(alb, n);
  } else {
    bool sx = abs(no.x) > 0.5;
    across = (sx ? vL.z : vL.x) + (sx ? vS.z : vS.x) * 0.5;
    // soot runs down from sills and the roofline; pollution darkens the lower floors
    float streak = vn2(vec2(across * 1.1 + seed * 7.0, yg * 0.018));
    float grime = (0.8 + 0.28 * vn2(vec2(across * 0.12, yg * 0.04) + seed)) * (1.0 - 0.2 * smoothstep(0.55, 0.9, streak)) * mix(0.82, 1.0, smoothstep(0.0, 40.0, yg));
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
  }
  // burning: charred, with windows glowing and flickering
  float burn = vA.z * oBurn;
  if (burn > 0.0 && no.y < 0.5) {
    vec2 g = vec2(across, yg) / vec2(3.0, 3.6);
    vec2 gi = floor(g), gf = abs(fract(g) - 0.5);
    float rnd = h31(vec3(gi, seed));
    float win = step(gf.x, 0.3) * step(gf.y, 0.28);
    float fl = 0.6 + 0.4 * sin(oTime * 9.0 + rnd * 40.0) * sin(oTime * 5.3 + rnd * 12.0);
    float fireWin = win * step(rnd, 0.55 * burn) * step(vL.y, vS.y * (0.35 + 0.65 * h21(vec2(seed, 1.0))));
    c = mix(c, c * 0.22, burn * 0.8);
    c += fireWin * vec3(1.8, 0.6, 0.12) * fl * 2.0;
  }
  gl_FragColor = vec4(outFog(c, vW), 1.0);
}`;

// palettes (sRGB hex, converted to linear by THREE.Color)
const PAL = {
  brick: [0x7a3a2a, 0x6a3426, 0x84452e, 0x5a3024, 0x8a5038, 0x6e4632],
  buff: [0xa88a68, 0x9c8264, 0xb09a78, 0x8e7a62],
  stone: [0xb0a490, 0xa49c8c, 0xbcb09a, 0x9a948a, 0x8c8a86],
  white: [0xb8b4aa, 0xc4c0b4, 0xa8a69e],
  alu: [0x9a9ea4, 0x8a9096, 0xa4a8ac],
  dark: [0x262a2e, 0x1c2024, 0x2c2a26, 0x1e2a28, 0x22262e],
  black: [0x141416, 0x18181c],
};
const COPPER = [0x3e6e5a, 0x4a7a64, 0x2e3a36, 0x6a5a48, 0x3a3e42];

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
    this.clear = (x, z, r) => keep.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr + r);
    this.districts();
    this.buildBoxes();
    this.buildLand();
    const roofMesh = this.kit.mesh(solidMaterial());
    roofMesh.frustumCulled = false;
    scene.add(roofMesh); this.roofMesh = roofMesh;
  }

  // ------------------------------------------------------------ placement
  districts() {
    const rng = this.rng;
    const gauss = (x, z, cx, cz, sx, sz) => Math.exp(-((x - cx) ** 2) / (2 * sx * sx) - ((z - cz) ** 2) / (2 * sz * sz));
    const fits = (poly, x, z, r) => inside(poly, x - r, z - r) && inside(poly, x + r, z + r) && inside(poly, x - r, z + r) && inside(poly, x + r, z - r);
    // Lower Manhattan: the Financial District peaks around Wall Street, Battery Park City along the river
    for (let gx = -340; gx < 1400; gx += 50) for (let gz = -1120; gz > -2900; gz -= 50) {
      const x = gx + rng.range(-10, 10), z = gz + rng.range(-10, 10);
      const w = rng.range(24, 42), d = rng.range(24, 42), r = Math.max(w, d) * 0.6;
      if (!fits(MANHATTAN, x, z, r) || !this.clear(x, z, r) || rng.next() < 0.14) continue;
      if (x > 1150 && z > -1600) continue;                       // the Battery is a park
      if (Math.abs(x - 20) < 110 && z > -1300 && z < -1220) continue;  // West Street
      const bpc = z > -1330 && x > 230 && x < 1150;
      if (bpc) { if (rng.next() < 0.45) this.tower(x, z, w, d, 55 + rng.next() * 85, 'res', 0.05); continue; }
      const k = Math.max(gauss(x, z, 520, -1780, 380, 340), gauss(x, z, 200, -1560, 240, 220) * 0.7, gauss(x, z, 900, -1750, 260, 260) * 0.6);
      const h = 16 + rng.next() ** 1.6 * (30 + 230 * k);
      const ry = rng.pick([0, -0.26, 0.22, 0.48, -0.1]);
      this.tower(x, z, w, d, h, h > 60 ? (rng.next() < 0.45 ? 'pre' : 'post') : 'low', ry, rng.next() < 0.5 ? rng.range(0.4, 1) : 0);
    }
    // Tribeca, SoHo, the Village, Chelsea: brick lofts and walk-ups, a few towers
    for (let gx = -380; gx > -2900; gx -= 70) for (let gz = -1150; gz > -4400; gz -= 70) {
      const x = gx + rng.range(-14, 14), z = gz + rng.range(-14, 14);
      const w = rng.range(26, 50), d = rng.range(26, 50), r = Math.max(w, d) * 0.6;
      if (!fits(MANHATTAN, x, z, r) || !this.clear(x, z, r) || rng.next() < 0.12) continue;
      const tall = rng.next() < 0.06;
      const h = tall ? rng.range(70, 140) : 12 + rng.next() ** 2 * 48;
      this.tower(x, z, w, d, h, tall ? rng.pick(['pre', 'post', 'res']) : 'low', -0.26 + rng.range(-0.04, 0.04), rng.next() < 0.3 ? rng.range(0.3, 0.9) : 0);
    }
    // Midtown, far off to the north-east, on the grid
    for (let gx = -2900; gx > -7000; gx -= 80) for (let gz = -1900; gz > -5200; gz -= 80) {
      const x = gx + rng.range(-12, 12), z = gz + rng.range(-12, 12);
      const w = rng.range(30, 56), d = rng.range(30, 56), r = Math.max(w, d) * 0.6;
      if (!fits(MANHATTAN, x, z, r) || !this.clear(x, z, r) || rng.next() < 0.1) continue;
      const k = gauss(x, z, -4400, -3300, 1100, 650);
      const h = 18 + rng.next() ** 1.4 * (40 + 230 * k);
      this.tower(x, z, w, d, h, h > 70 ? (rng.next() < 0.4 ? 'pre' : 'post') : 'low', -0.26, rng.next() < 0.3 ? rng.range(0.3, 0.8) : 0);
    }
    // Brooklyn: low and endless, Downtown Brooklyn's towers and the bank clock tower
    for (let gx = 3800; gx > -3000; gx -= 115) for (let gz = -2300; gz > -6500; gz -= 115) {
      const x = gx + rng.range(-20, 20), z = gz + rng.range(-20, 20);
      const w = rng.range(30, 70), d = rng.range(30, 70), r = Math.max(w, d) * 0.6;
      if (!fits(BROOKLYN, x, z, r) || rng.next() < 0.2) continue;
      const k = gauss(x, z, 1500, -3650, 380, 380);
      const tall = rng.next() < k * 0.6;
      const h = tall ? rng.range(60, 130) : 9 + rng.next() ** 2 * 26;
      this.tower(x, z, w, d, h, tall ? 'post' : 'bk', rng.range(-0.5, 0.5), 0);
    }
    this.tower(1820, -3900, 34, 34, 156, 'pre', 0.3, 0, { crown: 'dome' });
    // chimneys that never stop: Con Ed's East River stacks, the Navy Yard incinerator, a Tribeca boiler house
    this.stacks = [];
    for (const [x, z, h, n, col, steam] of [[-2650, -4120, 150, 4, 0x6a3a2c, 1], [-380, -4380, 90, 2, 0x5a5650, 0], [-820, -1720, 64, 1, 0x5a3a2c, 0]]) {
      for (let i = 0; i < n; i++) {
        const sx = x + i * 26, r = h * 0.045;
        this.kit.add(STACK, col, { x: sx, y: G0, z, sx: r, sy: h, sz: r });
        this.kit.add(STACK, 0xc8c4bc, { x: sx, y: G0 + h * 0.86, z, sx: r * 1.02, sy: h * 0.05, sz: r * 1.02 });
        this.stacks.push({ p: new THREE.Vector3(sx, G0 + h, z), r, steam, t: rng.next() * 3 });
      }
      this.kit.add(BOX, col, { x: x + (n - 1) * 13, y: G0 + 14, z: z + 30, sx: n * 26 + 20, sy: 28, sz: 50 });
    }
    // the Jersey side south of us: Paulus Hook's old warehouses and walk-ups
    for (let i = 0; i < 26; i++) {
      const x = rng.range(280, 520), z = rng.range(-115, -40);
      this.tower(x, z, rng.range(16, 30), rng.range(16, 30), 8 + rng.next() ** 2 * 26, 'low', rng.range(-0.05, 0.05), 0);
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
      else if (cr === 'dome') { kit.add(DOME, 0x5a6a5c, { x: cx, y: G0 + h, z: cz, sx: tw * 0.5, sy: tw * 0.5, sz: td * 0.5, glow: 0.1 }); top = h + tw * 0.5; }
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

  // ------------------------------------------------------------ meshes
  buildBoxes() {
    const list = this.boxes, n = list.length;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = this.mat = new THREE.ShaderMaterial({ vertexShader: BLD_VS, fragmentShader: BLD_FS, uniforms: { ...OUT } });
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, n);
    const A = new Float32Array(n * 4), B = new Float32Array(n * 3), S = new Float32Array(n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.ry), new THREE.Vector3(b.w, b.h, b.d));
      mesh.setMatrixAt(i, m);
      A.set([b.seed, b.lit, b.burn, b.style], i * 4); B.set([b.col.r, b.col.g, b.col.b], i * 3); S.set([b.w, b.h, b.d], i * 3);
      b.index = i;
    });
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(S, 3));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildLand() {
    const kit = this.kit;
    const land = (poly, top, side, pat, depth = 1.6) => {
      const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, -14.02 - depth, 0);
      kit.add(g, top, { side, pat });
    };
    land(MANHATTAN, 0x4a4742, 0x3a3630, 5);
    land(BROOKLYN, 0x4a4640, 0x3a3630, 5);
    land(GOV, 0x3a4630, 0x3a3630, 4);
    land(JERSEY, 0x5a5650, 0x48443e, 2, 1.4);
    // Manhattan's Hudson piers: Tribeca's and the big square Pier 40
    for (const [x, w, l] of [[-520, 26, 170], [-700, 30, 210], [-1180, 24, 180], [-1520, 110, 240], [-1900, 28, 200]]) {
      const zs = this.shoreZ(x);
      kit.add(BOX, 0x56524c, { x, y: -14.6, z: zs + l / 2 - 5, sx: w, sy: 1.2, sz: l, side: 0x2e2a26, pat: 2 });
      if (w > 60) kit.add(BOX, 0x6a5a4a, { x, y: -14 + 6, z: zs + l / 2 - 5, sx: w * 0.9, sy: 12, sz: l * 0.85 });
    }
    // Governors Island: Fort Jay's mound, brick barracks, trees
    kit.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x34442c, { x: 2420, y: -14, z: -1900, sx: 230, sy: 24, sz: 170 });
    for (let i = 0; i < 9; i++) kit.add(BOX, 0x6a3a2a, { x: 2250 + (i % 3) * 90 + this.rng.range(-20, 20), y: -14 + 6, z: -1700 - Math.floor(i / 3) * 60, sx: 60, sy: 12, sz: 18, ry: 0.4 });
  }
  // the Manhattan bulkhead's z at a given x (west shore, north of the Battery)
  shoreZ(x) {
    const P = MANHATTAN;
    for (let i = 0; i < 7; i++) { const [x0, z0] = P[i], [x1, z1] = P[i + 1]; if (x >= x0 && x <= x1) return z0 + ((x - x0) / (x1 - x0)) * (z1 - z0); }
    return -1150;
  }
}

const PYR = new THREE.CylinderGeometry(0, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const HIP = new THREE.CylinderGeometry(0.28, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const SPIRE = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
const DOME = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
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
