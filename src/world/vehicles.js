// Late-90s New York vehicles as low-poly geometry: side profiles extruded
// across the width with bevelled edges, glass greenhouses, wheels, bumpers and
// lights. Body panels are painted by instance colour (aux paint = 1); light
// lenses carry a night glow. Length runs along +x (the front), width along z.
import * as THREE from 'three';
import { Kit } from './outdoor.js';

const ext = (k, pts, w, col, opt = {}, bevel = 0.05) => {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -w / 2);
  k.add(g, col, opt);
};
const wheels = (k, xs, W, r, y = r, wide = 0.24) => {
  for (const x of xs) for (const sz of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(r, r, wide, 12), 0x0b0b0c, { x, y, z: sz * (W / 2 - wide / 2), rx: Math.PI / 2 });
    k.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wide + 0.02, 8), 0x5e5e60, { x, y, z: sz * (W / 2 - wide / 2), rx: Math.PI / 2 });
  }
};
const shadow = (k, L, W) => { k.box(0, 0.012, 0, L + 0.5, 0.01, W + 0.4, 0x141414); k.box(0, 0.016, 0, L - 0.3, 0.01, W - 0.1, 0x060606); };
const lights = (k, L, W, yh, yt, wh = 0.62) => {
  for (const sz of [-1, 1]) {
    k.box(L / 2 + 0.01, yh, sz * (W / 2 - 0.3), 0.06, 0.13, 0.34, 0xf0ead0, { glow: 1.2 });
    k.box(-L / 2 - 0.01, yt, sz * (W / 2 - 0.26), 0.06, 0.15, wh * 0.6, 0x9a0c08, { glow: 0.9 });
  }
};

// cars: body profile + greenhouse
const CARS = {
  sedan: { L: 4.9, W: 1.8, body: [[-2.45, 0.24], [-2.45, 0.74], [-2.2, 0.96], [-1.5, 1.0], [1.35, 1.0], [2.32, 0.82], [2.45, 0.6], [2.4, 0.24]], glass: [[-1.5, 0.98], [-0.78, 1.4], [0.42, 1.4], [1.35, 0.98]], wb: 1.4 },
  // the Chevy Caprice: the cab and the cop car
  caprice: { L: 5.45, W: 1.97, body: [[-2.72, 0.3], [-2.74, 0.78], [-2.5, 0.98], [-1.45, 1.04], [1.2, 1.04], [2.55, 0.9], [2.72, 0.7], [2.7, 0.3]], glass: [[-1.45, 1.02], [-0.85, 1.45], [0.5, 1.45], [1.2, 1.02]], wb: 1.6 },
  wagon: { L: 4.8, W: 1.76, body: [[-2.4, 0.26], [-2.4, 1.0], [1.3, 1.0], [2.3, 0.82], [2.4, 0.58], [2.38, 0.26]], glass: [[-2.36, 0.98], [-2.26, 1.43], [0.5, 1.43], [1.3, 0.98]], wb: 1.45 },
  van: { L: 4.85, W: 1.92, body: [[-2.42, 0.3], [-2.42, 1.06], [1.6, 1.06], [2.3, 0.9], [2.42, 0.62], [2.4, 0.3]], glass: [[-2.38, 1.04], [-2.25, 1.7], [0.62, 1.7], [1.6, 1.04]], wb: 1.55 },
  suv: { L: 4.6, W: 1.84, body: [[-2.3, 0.4], [-2.3, 1.12], [1.2, 1.12], [2.25, 1.02], [2.32, 0.46], [2.3, 0.4]], glass: [[-2.26, 1.1], [-2.24, 1.74], [0.5, 1.74], [1.2, 1.1]], wb: 1.4, tall: true },
  // government Suburban: long, black, tinted
  suburban: { L: 5.6, W: 2.0, body: [[-2.8, 0.42], [-2.8, 1.18], [1.5, 1.18], [2.6, 1.06], [2.8, 0.5], [2.78, 0.42]], glass: [[-2.76, 1.16], [-2.72, 1.88], [0.75, 1.88], [1.5, 1.16]], wb: 1.75, tall: true },
};
function car(o, extra) {
  const k = new Kit(), W = o.W, L = o.L;
  ext(k, o.body, W - 0.1, 0xffffff, { paint: 1 });
  ext(k, o.glass, W - 0.22, 0x101214, { pat: 8 });
  const g = o.glass, roofY = g[1][1];
  k.box((g[1][0] + g[2][0]) / 2, roofY - 0.02, 0, g[2][0] - g[1][0] + 0.1, 0.06, W - 0.12, 0xffffff, { paint: 1 });
  k.box((g[1][0] + g[2][0]) / 2 + 0.1, g[0][1], 0, 0.12, roofY - g[0][1], W - 0.18, 0xffffff, { paint: 1 });
  const yb = o.tall ? 0.42 : 0.3;
  k.box(L / 2 - 0.02, yb - 0.08, 0, 0.16, 0.24, W - 0.02, 0x26262a); k.box(-L / 2 + 0.02, yb - 0.08, 0, 0.16, 0.24, W - 0.02, 0x26262a);
  wheels(k, [-o.wb, o.wb], W, o.tall ? 0.38 : 0.32, o.tall ? 0.38 : 0.32, 0.22);
  lights(k, L, W, o.tall ? 0.85 : 0.6, o.tall ? 0.95 : 0.74);
  shadow(k, L, W);
  if (extra) extra(k, o, roofY);
  return k.geometry();
}
// a box-bodied truck: cab + body, used for the box truck, the ambulance, the FDNY engine and the army truck
function truck({ L, W, H, cabL, cabH, body = 0xffffff, cab = 0xffffff, paintCab = 1, paintBody = 1, r = 0.48, extra }) {
  const k = new Kit();
  const xb = -L / 2, xc = L / 2 - cabL;
  k.box(xb + (xc - xb) / 2 - 0.1, 0.55, 0, xc - xb - 0.25, H - 0.55, W, body, { paint: paintBody });
  k.box(xc + cabL * 0.45, 0.55, 0, cabL * 0.9, cabH - 0.55, W - 0.08, cab, { paint: paintCab });
  k.box(xc + cabL * 0.93, 0.55 + (cabH - 0.55) * 0.55, 0, 0.08, (cabH - 0.55) * 0.38, W - 0.3, 0x101214, { pat: 8 });
  for (const sz of [-1, 1]) k.box(xc + cabL * 0.62, 0.55 + (cabH - 0.55) * 0.55, sz * (W / 2 - 0.03), cabL * 0.5, (cabH - 0.55) * 0.36, 0.06, 0x101214, { pat: 8 });
  k.box(xc + cabL * 0.98, 0.3, 0, 0.2, 0.32, W, 0x2a2a2c);
  k.box(0, 0.38, 0, L - 0.4, 0.3, W - 0.3, 0x1a1a1a);
  wheels(k, [xb + 1.2, xc + cabL * 0.5], W, r, r, 0.32);
  lights(k, L, W, 0.85, 0.9);
  shadow(k, L, W);
  if (extra) extra(k);
  return k.geometry();
}

// The catalogue. Each entry: geometry, length, width, and where its flashers sit (for glows)
export function vehicleModels() {
  const M = {};
  M.sedan = { geo: car(CARS.sedan), ...CARS.sedan };
  M.wagon = { geo: car(CARS.wagon), ...CARS.wagon };
  M.van = { geo: car(CARS.van), ...CARS.van };
  M.suv = { geo: car(CARS.suv), ...CARS.suv };
  // a yellow Caprice with its roof light
  M.cab = { geo: car(CARS.caprice, (k, o, ry) => { k.box(-0.15, ry + 0.03, 0, 0.75, 0.26, 0.28, 0xf4e6b0, { glow: 0.7 }); }), ...CARS.caprice };
  // NYPD: light blue Caprice, white stripe, the red light bar
  M.nypd = {
    geo: car(CARS.caprice, (k, o, ry) => {
      for (const sz of [-1, 1]) k.box(0, 0.62, sz * (o.W / 2 - 0.02), o.L - 0.5, 0.12, 0.04, 0xf0f0f0);
      k.box(0.1, ry + 0.03, 0, 0.32, 0.08, 1.5, 0x2a2a2a);
      for (const sz of [-1, 0, 1]) k.box(0.1, ry + 0.1, sz * 0.5, 0.28, 0.14, sz ? 0.42 : 0.3, sz ? 0xe01010 : 0xf0f0f0, { glow: sz ? 0.6 : 0.3 });
    }), ...CARS.caprice, flash: [[0.1, 1.62, -0.5, 0xff1a10], [0.1, 1.62, 0.5, 0xff1a10]],
  };
  // government black Suburban, red and blue in the grille
  M.gov = { geo: car(CARS.suburban, (k, o) => { for (const sz of [-1, 1]) k.box(o.L / 2 + 0.02, 0.9, sz * 0.35, 0.04, 0.08, 0.16, sz < 0 ? 0xe01010 : 0x1030e0, { glow: 0.8 }); }), ...CARS.suburban, flash: [[2.85, 0.9, -0.35, 0xff1a10], [2.85, 0.9, 0.35, 0x2040ff]] };
  // a white box truck, a delivery van's big brother
  M.box = { geo: truck({ L: 7.2, W: 2.4, H: 3.4, cabL: 2.2, cabH: 2.5 }), L: 7.2, W: 2.4 };
  // EMS ambulance: white box, orange stripe, light bar
  M.ems = {
    geo: truck({ L: 6.6, W: 2.3, H: 2.9, cabL: 2.0, cabH: 2.3, extra: (k) => {
      for (const sz of [-1, 1]) k.box(-0.9, 1.5, sz * 1.16, 4.4, 0.18, 0.02, 0xd86a10);
      k.box(1.8, 2.36, 0, 0.3, 0.14, 1.6, 0xe01010, { glow: 0.6 }); k.box(-3.3, 2.92, 0, 0.12, 0.14, 2.0, 0xe01010, { glow: 0.6 });
    } }), L: 6.6, W: 2.3, flash: [[1.8, 2.5, -0.6, 0xff1a10], [1.8, 2.5, 0.6, 0xfff0e0]],
  };
  // FDNY engine: red, white cab roof, hose bed, ladder rack
  M.fdny = {
    geo: truck({ L: 10, W: 2.5, H: 2.9, cabL: 2.6, cabH: 2.9, r: 0.55, extra: (k) => {
      k.box(3.7, 2.9, 0, 2.5, 0.08, 2.46, 0xf0f0f0);
      for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) k.box(-4.0 + i * 1.45, 0.9, sz * 1.255, 1.3, 1.6, 0.02, 0x7a0c0a);
      for (const sz of [-1, 1]) k.box(-1.2, 3.25, sz * 0.7, 8.5, 0.08, 0.08, 0xb8b8b8);
      for (let i = 0; i < 10; i++) k.box(-5.2 + i * 0.85, 3.25, 0, 0.06, 0.06, 1.4, 0xb8b8b8);
      k.box(3.9, 3.02, 0, 0.3, 0.16, 2.0, 0xe01010, { glow: 0.7 });
      k.box(4.95, 1.1, 0, 0.12, 0.7, 1.9, 0xc8c8c8);
    } }), L: 10, W: 2.5, flash: [[3.9, 3.15, -0.8, 0xff1a10], [3.9, 3.15, 0.8, 0xff1a10]],
  };
  // army: an olive M35 deuce-and-a-half with its canvas bed, and a Humvee
  M.army = {
    geo: truck({ L: 7.0, W: 2.45, H: 3.0, cabL: 2.6, cabH: 2.45, body: 0x4a4f36, cab: 0x3e4430, paintCab: 0, paintBody: 0, r: 0.56, extra: (k) => {
      k.add(new THREE.CylinderGeometry(1.22, 1.22, 4.2, 10, 1, false, 0, Math.PI), 0x585c42, { x: -1.4, y: 2.25, z: 0, rz: Math.PI / 2, ry: 0, sx: 1, sy: 1, sz: 1 });
      k.box(2.2, 0.55, 0, 0.6, 1.1, 2.3, 0x2e3324);
    } }), L: 7.0, W: 2.45,
  };
  const hk = new Kit();
  ext(hk, [[-2.3, 0.45], [-2.3, 1.45], [-0.6, 1.5], [0.7, 1.5], [1.25, 1.2], [2.3, 1.1], [2.35, 0.45]], 2.18, 0x52563c, {}, 0.04);
  hk.box(1.0, 1.2, 0, 0.06, 0.32, 1.9, 0x101214, { pat: 8 });
  wheels(hk, [-1.6, 1.6], 2.18, 0.45, 0.45, 0.36);
  lights(hk, 4.7, 2.18, 0.9, 1.0);
  shadow(hk, 4.7, 2.18);
  M.humvee = { geo: hk.geometry(), L: 4.7, W: 2.18 };
  // MTA bus: white with the blue stripe, a band of windows
  M.bus = {
    geo: truck({ L: 12, W: 2.6, H: 3.1, cabL: 0.4, cabH: 3.1, extra: (k) => {
      for (const sz of [-1, 1]) { k.box(0, 1.5, sz * 1.31, 11.2, 1.0, 0.03, 0x101418, { pat: 8, glow: 0.25 }); k.box(0, 1.0, sz * 1.31, 11.6, 0.22, 0.03, 0x1a3a8a); }
      k.box(5.95, 1.0, 0, 0.06, 1.8, 2.2, 0x101418, { pat: 8 });
    } }), L: 12, W: 2.6,
  };
  return M;
}
export const PAINT = [0x1f3d2c, 0x5a1420, 0x1f5a5a, 0x9a9ca0, 0xd0d0cc, 0x101114, 0x1a2340, 0xb4a484, 0x8a1a1a, 0x3a4450, 0x2a4030, 0xa89c84, 0x3a2a48, 0x6a6e72, 0x4a2a1e];
export const LIVERY = { cab: 0xe0aa10, nypd: 0x4aa8de, gov: 0x0c0c0e, box: 0xe8e8e2, ems: 0xeeeeea, fdny: 0x9a0e0c, army: 0xffffff, humvee: 0xffffff, bus: 0xe8e8e4 };
