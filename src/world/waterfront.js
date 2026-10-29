// The Exchange Place waterfront under the window, 1999: our sidewalk, the
// street (kerbs, double yellow, parking lanes, a crosswalk to the PATH), the
// riverside walkway with its cobra-head and acorn lamps, benches, trees and
// iron railing, the bulkhead and its fender piles, a rotten pile field, the
// ferry slip, the PATH entrance, a tenement with fire escapes and the old
// Harborside warehouse to the north, Exchange Place Centre to the south, and
// late-90s traffic with a few yellow cabs. Static parts are one merged draw;
// trees and each car model are instanced.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';
import { OUT, OUT_GLSL, Kit, solidMaterial } from './outdoor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SW = -13.85, RD = -13.98;                 // sidewalk and road surface
const BOX = new THREE.BoxGeometry(1, 1, 1);
const IRON = 0x161616, GRANITE = 0x7c7a74, CONC = 0x8a8680;
// waterfront x extents
const X0 = -46, X1 = 252;

// ------------------------------------------------------------------ cars
// side profiles (length along x, front at +x), extruded across the width
const MODELS = {
  sedan: { L: 4.9, W: 1.8, body: [[-2.45, 0.24], [-2.45, 0.74], [-2.2, 0.96], [-1.5, 1.0], [1.35, 1.0], [2.32, 0.82], [2.45, 0.6], [2.4, 0.24]], glass: [[-1.5, 0.98], [-0.78, 1.4], [0.42, 1.4], [1.35, 0.98]], wb: 1.4 },
  crown: { L: 5.4, W: 1.98, body: [[-2.7, 0.28], [-2.7, 0.8], [-2.45, 0.98], [-1.42, 1.02], [1.25, 1.02], [2.6, 0.9], [2.7, 0.72], [2.7, 0.28]], glass: [[-1.42, 1.0], [-0.86, 1.44], [0.55, 1.44], [1.25, 1.0]], wb: 1.6 },
  wagon: { L: 4.8, W: 1.76, body: [[-2.4, 0.26], [-2.4, 1.0], [1.3, 1.0], [2.3, 0.82], [2.4, 0.58], [2.38, 0.26]], glass: [[-2.36, 0.98], [-2.26, 1.43], [0.5, 1.43], [1.3, 0.98]], wb: 1.45 },
  van: { L: 4.85, W: 1.92, body: [[-2.42, 0.3], [-2.42, 1.06], [1.6, 1.06], [2.3, 0.9], [2.42, 0.62], [2.4, 0.3]], glass: [[-2.38, 1.04], [-2.25, 1.7], [0.62, 1.7], [1.6, 1.04]], wb: 1.55 },
  suv: { L: 4.6, W: 1.84, body: [[-2.3, 0.4], [-2.3, 1.12], [1.2, 1.12], [2.25, 1.02], [2.32, 0.46], [2.3, 0.4]], glass: [[-2.26, 1.1], [-2.24, 1.74], [0.5, 1.74], [1.2, 1.1]], wb: 1.4, tall: true },
};
function carGeo(o, cab) {
  const k = new Kit(), W = o.W;
  const ext = (pts, w, col, opt) => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -w / 2);
    k.add(g, col, opt);
  };
  ext(o.body, W - 0.1, 0xffffff, { paint: 1 });
  ext(o.glass, W - 0.22, 0x101214, { pat: 8 });
  const g = o.glass, roofY = g[1][1];
  k.box((g[1][0] + g[2][0]) / 2, roofY - 0.02, 0, g[2][0] - g[1][0] + 0.1, 0.06, W - 0.12, 0xffffff, { paint: 1 });
  // pillars between the side windows
  k.box((g[1][0] + g[2][0]) / 2 + 0.1, g[0][1], 0, 0.12, roofY - g[0][1], W - 0.18, 0xffffff, { paint: 1 });
  // bumpers, wheels, hubcaps, lights
  const L = o.L, yb = o.tall ? 0.42 : 0.3;
  k.box(L / 2 - 0.02, yb - 0.08, 0, 0.16, 0.24, W - 0.02, 0x26262a); k.box(-L / 2 + 0.02, yb - 0.08, 0, 0.16, 0.24, W - 0.02, 0x26262a);
  const wr = o.tall ? 0.38 : 0.32;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(wr, wr, 0.22, 10), 0x0b0b0c, { x: sx * o.wb, y: wr, z: sz * (W / 2 - 0.13), rx: Math.PI / 2 });
    k.add(new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, 0.24, 8), 0x6e6e70, { x: sx * o.wb, y: wr, z: sz * (W / 2 - 0.13), rx: Math.PI / 2 });
  }
  for (const sz of [-1, 1]) {
    k.box(L / 2 + 0.01, (o.tall ? 0.85 : 0.6), sz * (W / 2 - 0.3), 0.06, 0.13, 0.34, 0xf0ead0, { glow: 1.2 });
    k.box(-L / 2 - 0.01, (o.tall ? 0.95 : 0.74), sz * (W / 2 - 0.26), 0.06, 0.15, 0.36, 0x9a0c08, { glow: 0.9 });
  }
  // contact shadow on the road
  k.box(0, 0.012, 0, L + 0.5, 0.01, W + 0.4, 0x141414); k.box(0, 0.016, 0, L - 0.3, 0.01, W - 0.1, 0x060606);
  // the medallion cab's roof light
  if (cab) k.box((g[1][0] + g[2][0]) / 2, roofY + 0.03, 0, 0.75, 0.24, 0.26, 0xf4e6b0, { glow: 0.7 });
  return k.geometry();
}
const COLOURS = [0x1f3d2c, 0x5a1420, 0x1f5a5a, 0x9a9ca0, 0xd0d0cc, 0x101114, 0x1a2340, 0xb4a484, 0x8a1a1a, 0x3a4450, 0x2a4030, 0xa89c84, 0x3a2a48, 0x6a6e72, 0x4a2a1e];
const CAB = 0xe0aa10;

export class Waterfront {
  constructor(scene, glows) {
    this.scene = scene; this.glows = glows;
    this.rng = new RNG(4);
    this.kit = new Kit();
    this.lamps = [];
    this.ground(); this.lampPosts(); this.furniture(); this.edge(); this.neighbours();
    const mesh = this.static = this.kit.mesh(solidMaterial());
    mesh.frustumCulled = false; scene.add(mesh);
    this.buildRailing();
    this.buildTrees();
    this.buildCars();
    this.buildSigns();
  }

  // ----------------------------------------------------------- ground
  ground() {
    const k = this.kit;
    const W = 1000, cx = 60;
    k.box(cx, -14.4, -1.1, W, 0.55, 8.3, CONC, { pat: 2 });                            // our sidewalk, z +3 .. -5.25
    k.box(cx, -14.4, -5.4, W, 0.55, 0.3, GRANITE);                                    // kerb
    k.box(cx, -14.4, -11.25, W, 0.42, 11.4, 0x2a2a2c, { pat: 1 });                     // the street
    k.box(cx, -14.4, -17.1, W, 0.55, 0.3, GRANITE);                                   // far kerb
    const pw = X1 - X0, pc = (X0 + X1) / 2;
    k.box(pc, -14.4, -18.4, pw, 0.55, 2.3, CONC, { pat: 2 });                          // lamp strip
    k.box(pc, -14.4, -26.8, pw, 0.55, 14.5, 0x56463c, { pat: 3 });                     // brick walkway
    k.box(pc, -15.7, -34.5, pw, 1.9, 1.0, GRANITE, { side: 0x3e3c38 });                // bulkhead cap and face
    // beyond the walkway the street side keeps a plain sidewalk
    for (const [a, b] of [[-470, X0], [X1, 560]]) k.box((a + b) / 2, -14.4, -19.5, b - a, 0.55, 4.5, CONC, { pat: 2 });
    // tree pits along the lamp strip, a few on our side too
    this.treeSpots = [];
    for (let x = X0 + 30; x < X1; x += 32) { k.box(x, SW - 0.04, -18.4, 1.5, 0.06, 1.5, 0x2a2018, { pat: 4 }); this.treeSpots.push([x, SW - 0.02, -18.4]); }
    for (const x of [-46, -30, 34, 50, 66]) { k.box(x, SW - 0.04, -3.9, 1.4, 0.06, 1.4, 0x2a2018, { pat: 4 }); this.treeSpots.push([x, SW - 0.02, -3.9]); }
    for (const x of [-38, 40, 120, 184]) { k.box(x, SW, -24.5, 1.6, 0.55, 1.6, 0x6a665e); k.add(new THREE.IcosahedronGeometry(0.75, 1), 0x34482a, { x, y: SW + 0.85, z: -24.5, sy: 0.6, pat: 6 }); }  // planters with clipped shrubs
  }

  // ----------------------------------------------------------- lamps
  lampPosts() {
    const k = this.kit, g = this.glows;
    // cobra heads on galvanised poles, arms out over the street
    for (let x = -416; x <= 240; x += 32) {
      const z = -18.4;
      k.cyl(x, SW, z, 0.09, 0.14, 8.3, 8, 0x6c6e70);
      k.cyl(x, SW, z, 0.2, 0.22, 0.5, 8, 0x5a5c5e);
      k.box(x, -5.72, z + 1.3, 0.08, 0.08, 2.7, 0x6c6e70, { rx: -0.08 });
      k.box(x, -5.62, -15.85, 0.34, 0.16, 0.82, 0x7a7c7e);
      k.box(x, -5.72, -15.85, 0.26, 0.04, 0.56, 0xffb060, { glow: 1.6 });
      g.add(V(x, -5.82, -15.85), 0xff9a40, 4.2, { k: 1.6 });
      g.add(V(x, -5.82, -15.85), 0xffc080, 1.0, { k: 3 });
      this.lamps.push(V(x, -5.82, -15.85));
    }
    // black acorn lanterns along the walkway
    for (let x = X0 + 6; x < X1; x += 16) {
      const z = -32.4;
      k.cyl(x, SW, z, 0.16, 0.2, 0.9, 10, IRON);
      k.cyl(x, SW + 0.9, z, 0.06, 0.08, 2.75, 8, IRON);
      k.cyl(x, SW + 3.6, z, 0.13, 0.09, 0.14, 8, IRON);
      k.add(new THREE.SphereGeometry(0.24, 10, 8), 0xffe0b0, { x, y: SW + 4.05, z, sy: 1.45, glow: 1.4 });
      k.add(new THREE.ConeGeometry(0.2, 0.3, 8), IRON, { x, y: SW + 4.55, z });
      g.add(V(x, SW + 4.05, z), 0xffc888, 2.6, { k: 1.4 });
      this.lamps.push(V(x, SW + 4.05, z));
    }
    OUT.oLampRow.value[0].set(-15.85, 32, 0, -5.82);
    OUT.oLampRow.value[1].set(-32.4, 16, X0 + 6, SW + 4.05);
  }

  // ----------------------------------------------------------- street furniture
  furniture() {
    const k = this.kit;
    // benches facing the river, a trash can by every other one
    for (let x = X0 + 14; x < X1 - 4; x += 16) {
      const z = -31.3;
      for (const dx of [-0.85, 0.85]) k.box(x + dx, SW, z, 0.07, 0.78, 0.62, IRON);
      for (let i = 0; i < 4; i++) k.box(x, SW + 0.42, z - 0.22 + i * 0.13, 1.9, 0.04, 0.1, 0x4a3020);
      for (let i = 0; i < 3; i++) k.box(x, SW + 0.56 + i * 0.13, z + 0.28, 1.9, 0.09, 0.03, 0x4a3020, { rx: -0.2 });
      if (Math.round((x - X0) / 16) % 2) k.cyl(x + 1.6, SW, z + 0.2, 0.28, 0.25, 0.9, 10, 0x1e2a20);
    }
    // our side: parking meters, a hydrant, the mailbox, a payphone and the paper boxes by the crosswalk
    for (let x = -40; x < 60; x += 6.2) { if (Math.abs(x - 20) < 3 || Math.abs(x - 12) < 2) continue; k.cyl(x, SW, -4.95, 0.035, 0.035, 1.15, 6, 0x5a5c5e); k.box(x, SW + 1.15, -4.95, 0.16, 0.3, 0.12, 0x6a6c6e); }
    k.cyl(12, SW, -4.7, 0.13, 0.15, 0.6, 8, 0xb02818); k.add(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xb02818, { x: 12, y: SW + 0.6, z: -4.7 });
    k.box(16.5, SW, -4.6, 0.55, 1.15, 0.5, 0x22346a); k.box(16.5, SW + 1.15, -4.6, 0.5, 0.14, 0.46, 0x22346a);
    k.box(24.5, SW, -18.0, 0.18, 1.4, 0.18, 0x7a7c7e); k.box(24.5, SW + 1.1, -18.0, 0.62, 0.72, 0.36, 0x8a8c90); k.box(24.5, SW + 1.25, -17.8, 0.4, 0.3, 0.04, 0xd0d8e0, { glow: 0.4 });
    [0x1c3a8a, 0xc8b020, 0xb01818, 0xd8d8d0, 0x2a5a2a].forEach((c, i) => k.box(15.6 + i * 0.62, SW, -18.1, 0.5, 1.05, 0.45, c));
    // a bus stop shelter on the far side
    for (const dx of [-1.75, 1.75]) k.box(-8 + dx, SW, -19.5, 0.06, 2.4, 0.06, 0x3a3c3e);
    k.box(-8, SW + 0.05, -19.55, 3.5, 2.3, 0.03, 0x1a2024, { pat: 8 });
    k.box(-8, SW + 2.4, -18.9, 3.6, 0.08, 1.4, 0x3a3c3e);
    k.box(-8, SW + 0.45, -19.3, 2.4, 0.06, 0.35, 0x5a5c5e);
    // a no-parking sign and a ped-crossing sign
    k.cyl(18, SW, -5.0, 0.03, 0.03, 2.6, 5, 0x6a6c6e); k.box(18, SW + 2.2, -5.0, 0.05, 0.45, 0.45, 0xd8c020, { rx: Math.PI / 4 });
    k.cyl(22, SW, -17.4, 0.03, 0.03, 2.6, 5, 0x6a6c6e); k.box(22, SW + 2.2, -17.4, 0.05, 0.45, 0.45, 0xd8c020, { rx: Math.PI / 4 });
  }

  // ----------------------------------------------------------- bulkhead and water's edge
  edge() {
    const k = this.kit, rng = this.rng;
    // timber fender piles along the bulkhead
    for (let x = X0 + 1; x < X1; x += 3.1) if (x < 55 || x > 63) k.cyl(x, -15.9, -35.2, 0.16, 0.18, 2.0, 6, 0x2e2620, { pat: 7 });
    // the rotten field of an old pier to the north
    for (let i = 0; i < 8; i++) for (let j = 0; j < 9; j++) {
      if (rng.next() < 0.5) continue;
      const x = -42 + j * 3.2 + rng.range(-0.4, 0.4), z = -44 - i * 6.5 + rng.range(-0.4, 0.4);
      const h = rng.range(0.3, 2.6);
      k.cyl(x, -15.9, z, rng.range(0.13, 0.2), 0.2, h + 0.9, 6, 0x2a2420, { pat: 7, rz: rng.range(-0.08, 0.08) });
    }
    // the NY Waterway ferry slip: a steel float, a green shelter, the gangway and dolphins
    k.box(61, -15.7, -47.5, 28, 1.1, 14, 0x34383a, { pat: 7 });
    k.box(61, -14.6, -47.5, 28, 0.05, 14, 0x4a4a48);
    for (const [dx, dz] of [[-10, -3], [10, -3], [-10, 3], [10, 3]]) k.box(61 + dx, -14.6, -47.5 + dz, 0.12, 2.9, 0.12, 0x2a2c2e);
    k.box(61, -11.7, -47.5, 22, 0.25, 7.6, 0x2a4232);
    k.box(61, -14.6, -51.2, 21, 2.4, 0.04, 0x1a2024, { pat: 8 });
    k.box(59, -14.5, -37.6, 2.2, 0.12, 5.6, 0x4a4c4e, { rx: 0.12 });
    for (const dz of [-1.05, 1.05]) k.box(59 + dz, -13.6, -37.6, 0.04, 0.04, 5.6, IRON, { rx: 0.12 });
    for (const [x, z] of [[45, -40], [77, -40], [45, -55], [77, -55]]) for (let i = 0; i < 3; i++) k.cyl(x + Math.cos(i * 2.1) * 0.35, -15.9, z + Math.sin(i * 2.1) * 0.35, 0.18, 0.2, 3.2 - i * 0.2, 6, 0x2e2620, { pat: 7 });
    this.glows.add(V(47, -12.4, -54.5), 0x40ff60, 0.9, { k: 2 });
    this.glows.add(V(75, -12.4, -54.5), 0xff3020, 0.9, { k: 2 });
  }

  // ----------------------------------------------------------- the neighbours
  // pat 10 + facade style: windows come from world position in the shader
  neighbours() {
    const k = this.kit;
    // a six-storey brick tenement on the pier to the north: shop, fire escapes, cornice, tank
    {
      const x0 = -48, x1 = -72, z0 = -40, z1 = -76, h = 21.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      k.box(cx, -14.2, cz, 24, h + 0.2, 36, 0x6a3426, { pat: 10, seed: 3 });
      k.box(cx, -14 + h - 0.9, cz, 24.9, 0.9, 36.9, 0x8a8270);
      k.box(cx, -14 + h - 1.5, cz, 24.4, 0.6, 36.4, 0x3a2a22);
      k.box(cx, -14 + h, cz, 24.3, 1.0, 36.3, 0x5a3022);
      k.box(cx, -14 + 4.4, cz, 24.6, 0.5, 36.6, 0x7a7262);
      // the bodega on the ground floor, its awning and lit window
      k.box(x0 + 0.1, -13.9, -48, 0.2, 3.2, 9, 0x141618, { pat: 8 });
      k.box(x0 + 0.2, -13.4, -48, 0.06, 2.2, 8.4, 0xffd8a0, { glow: 0.5 });
      k.box(x0 + 0.8, -10.6, -48, 1.6, 0.08, 9.4, 0x5a1414, { rz: -0.35 });
      // fire escapes on the river end, two stacks of landings and ladders
      for (const zc of [-56, -68]) for (let f = 1; f <= 5; f++) {
        const y = -14 + 4.4 + (f - 1) * 3.3 + 0.9;
        k.box(x0 + 0.55, y, zc, 1.0, 0.06, 6.4, IRON);
        k.box(x0 + 1.05, y + 0.95, zc, 0.04, 0.04, 6.4, IRON);
        for (let i = 0; i <= 8; i++) k.box(x0 + 1.05, y, zc - 3.2 + i * 0.8, 0.025, 0.95, 0.025, IRON);
        for (const dz of [-3.2, 3.2]) k.box(x0 + 0.55, y + 0.95, zc + dz, 1.0, 0.04, 0.04, IRON);
        if (f < 5) k.box(x0 + 0.62, y + 1.65, zc + (f % 2 ? 1.4 : -1.4), 0.5, 0.05, 3.9, IRON, { rx: (f % 2 ? 1 : -1) * 0.86 });
      }
      for (const zc of [-56, -68]) k.box(x0 + 0.55, -14 + 2.8, zc + 2.6, 0.45, 0.05, 1.6, IRON, { rx: 1.2 });
      this.tank(-64, -14 + h + 1, -68, 2.8);
      k.box(-58, -14 + h + 1, -50, 3.2, 3.2, 3.4, 0x4a3a32);
    }
    // Harborside: the long 1929 terminal warehouse, big loft windows, penthouse and tanks
    {
      const cx = -208, cz = -84, w = 240, d = 66, h = 34;
      k.box(cx, -14.2, cz, w, h + 0.2, d, 0x7a4430, { pat: 17, seed: 9 });
      k.box(cx, -14 + h, cz, w + 0.6, 1.2, d + 0.6, 0x6a5a48);
      k.box(cx + 60, -14 + h + 1.2, cz, 28, 7, 18, 0x5a4232, { pat: 10, seed: 4 });
      this.tank(cx - 70, -14 + h + 1.2, cz + 10, 3.4);
      this.tank(cx + 20, -14 + h + 1.2, cz - 14, 3.0);
      // loading dock canopy along the street end
      k.box(-86 + 0.9, -9.8, cz, 1.8, 0.15, d - 4, 0x2a2c2e);
      this.glows.add(V(cx + 110, -14 + h + 9, cz), 0xff2a12, 1.4, { blink: 0.5, mode: 1, k: 2 });
    }
    // Exchange Place Centre: granite base, green glass shaft, stepped crown
    {
      const cx = 118, cz = -66, w = 40, d = 40;
      k.box(cx, -14.2, cz, w + 6, 16.2, d + 6, 0x8a7268, { pat: 11, seed: 6 });
      k.box(cx, 2, cz, w, 104, d, 0x283432, { pat: 12, seed: 7 });
      k.box(cx, 106, cz, w - 8, 10, d - 8, 0x283432, { pat: 12, seed: 8 });
      k.box(cx, 116, cz, w - 18, 6, d - 18, 0x6a6a66);
      k.box(cx, 2, cz, w + 0.8, 1.1, d + 0.8, 0x7a6a62);
      this.glows.add(V(cx, 123, cz), 0xff2a12, 2.0, { blink: 0.6, mode: 1, k: 2.5 });
    }
    // the PATH entrance: granite plinth, glass box, a thin roof slab
    {
      const cx = 33, cz = -25, w = 14, d = 7.5;
      k.box(cx, SW, cz, w, 0.45, d, GRANITE);
      k.box(cx, SW + 0.45, cz, w - 0.6, 3.4, d - 0.6, 0x1a2224, { pat: 8 });
      for (let i = 0; i <= 7; i++) { k.box(cx - (w - 0.6) / 2 + i * ((w - 0.6) / 7), SW + 0.45, cz + (d - 0.6) / 2, 0.08, 3.4, 0.08, 0x2a3230); k.box(cx - (w - 0.6) / 2 + i * ((w - 0.6) / 7), SW + 0.45, cz - (d - 0.6) / 2, 0.08, 3.4, 0.08, 0x2a3230); }
      for (let i = 0; i <= 4; i++) for (const sx of [-1, 1]) k.box(cx + sx * (w - 0.6) / 2, SW + 0.45, cz - (d - 0.6) / 2 + i * ((d - 0.6) / 4), 0.08, 3.4, 0.08, 0x2a3230);
      k.box(cx, SW + 3.85, cz, w + 1.6, 0.4, d + 1.6, 0x2a3430);
      k.box(cx, SW + 0.5, cz, w - 1.2, 2.6, d - 1.2, 0xe8f0e0, { glow: 0.22 });
      this.signSpots = [[V(cx, SW + 3.5, cz + d / 2 + 0.85), 0], [V(cx - w / 2 - 0.85, SW + 3.5, cz), -Math.PI / 2]];
    }
  }
  tank(x, y, z, r) {
    const k = this.kit;
    k.add(new THREE.CylinderGeometry(r, r * 1.04, r * 1.5, 12), 0x4a3a2e, { x, y: y + 3 + r * 0.75, z, pat: 7 });
    for (let i = 0; i < 4; i++) k.add(new THREE.TorusGeometry(r * 1.045, 0.05, 3, 16), 0x1a1a1a, { x, y: y + 3.2 + i * r * 0.42, z, rx: Math.PI / 2 });
    k.add(new THREE.ConeGeometry(r * 1.1, r * 0.6, 12), 0x2e2a28, { x, y: y + 3 + r * 1.5 + r * 0.3, z });
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.box(x + dx * r * 0.62, y, z + dz * r * 0.62, 0.18, 3, 0.18, 0x1e1e20);
    k.box(x, y + 2.9, z, r * 1.8, 0.12, r * 1.8, 0x2a2a2a);
  }

  // ----------------------------------------------------------- railing
  buildRailing() {
    const k = new Kit(), z = -34.35;
    for (let x = X0; x <= X1; x += 2.4) if (x < 57.5 || x > 60.5) k.box(x, SW + 0.05, z, 0.07, 1.06, 0.07, IRON);
    for (const [a, b] of [[X0, 57.6], [60.4, X1]]) {
      k.box((a + b) / 2, SW + 1.06, z, b - a, 0.07, 0.11, 0x1e1a16);
      k.box((a + b) / 2, SW + 0.98, z, b - a, 0.04, 0.05, IRON);
      k.box((a + b) / 2, SW + 0.14, z, b - a, 0.04, 0.05, IRON);
    }
    const mesh = k.mesh(solidMaterial()); mesh.frustumCulled = false; this.scene.add(mesh);
    // the pickets: one strip, drawn as bars by the shader so they stay clean at range
    const g = new THREE.PlaneGeometry(X1 - X0, 0.84); g.translate((X0 + X1) / 2, SW + 0.56, z);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...OUT }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${OUT_GLSL}
varying vec3 vW;
void main(){
  float u = vW.x / 0.125, fw = max(fwidth(u), 1e-4);
  float cov = clamp((0.1 - abs(fract(u) - 0.5) + 0.0) / fw + 0.5, 0.0, 1.0);
  cov = mix(cov, 0.2, smoothstep(0.4, 1.2, fw));
  if (abs(vW.x - 59.0) < 1.6) cov = 0.0;
  vec3 c = outLight(vec3(0.02), vec3(0.0, 0.3, 1.0)) + 0.02 * lampPools(vW, vec3(0.0, 0.3, 1.0));
  gl_FragColor = vec4(outFog(c, vW), cov);
}`,
    });
    const strip = new THREE.Mesh(g, m); strip.renderOrder = 1; this.scene.add(strip);
  }

  // ----------------------------------------------------------- trees
  buildTrees() {
    const k = new Kit(), rng = this.rng;
    k.cyl(0, 0.05, 0, 1.5, 1.5, 0.01, 12, 0x3a342c);
    k.cyl(0, 0, 0, 0.1, 0.15, 3.2, 6, 0x3a3028);
    k.cyl(0.3, 2.2, 0.1, 0.04, 0.07, 1.6, 5, 0x3a3028, { rz: -0.5 });
    k.cyl(-0.3, 2.4, -0.1, 0.04, 0.06, 1.4, 5, 0x3a3028, { rz: 0.6 });
    // a loose crown of leaf clumps, smooth-shaded and lumpy
    for (const [x, y, z, r] of [[0, 4.6, 0, 1.4], [1.1, 4.0, 0.4, 1.0], [-1.0, 4.2, -0.5, 1.05], [0.3, 5.5, -0.3, 1.0], [-0.4, 3.8, 1.0, 0.9], [0.6, 3.7, -1.0, 0.85], [-0.9, 5.0, 0.6, 0.8], [1.0, 5.1, -0.6, 0.75], [0, 6.2, 0.2, 0.7]]) {
      const g = new THREE.SphereGeometry(r, 8, 6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const s = 1 + Math.sin(p.getX(i) * 6.1 + p.getY(i) * 4.7 + p.getZ(i) * 5.3 + x * 3.0) * 0.16; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s); }
      g.computeVertexNormals();
      k.add(g, 0x3e5a2a, { x, y, z, paint: 1, pat: 6 });
    }
    const geo = k.geometry();
    const spots = this.treeSpots;
    const mesh = new THREE.InstancedMesh(geo, solidMaterial(), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    spots.forEach(([x, y, z], i) => {
      const s = rng.range(0.85, 1.2);
      m.compose(V(x, y, z), q.setFromAxisAngle(V(0, 1, 0), rng.range(0, 6.28)), V(s, s * rng.range(0.9, 1.15), s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHSL(rng.range(0.22, 0.3), rng.range(0.25, 0.45), rng.range(0.42, 0.6)));
    });
    mesh.frustumCulled = false; this.scene.add(mesh); this.trees = mesh;
  }

  // ----------------------------------------------------------- cars
  buildCars() {
    const rng = this.rng;
    const types = ['sedan', 'sedan', 'crown', 'wagon', 'van', 'suv'];
    const list = [];
    // parked along both kerbs, nose with the traffic
    for (const [z, dir] of [[-6.6, 1], [-15.9, -1]]) {
      let x = -150 + rng.range(0, 4);
      while (x < 200) {
        const t = rng.pick(types), L = MODELS[t].L;
        const clear = Math.abs(x - 20) > 5.5 && Math.abs(x - 12) > 3 && !(z < -10 && Math.abs(x + 8) < 4);
        if (clear && rng.next() < 0.72) list.push({ t, cab: false, x: x + L / 2, z, dir, moving: false });
        x += L + rng.range(0.9, 2.6);
      }
    }
    // traffic: right-hand lanes, a few yellow cabs among them
    for (const [z, dir] of [[-9.1, 1], [-13.4, -1]]) for (let i = 0; i < 5; i++) {
      const cab = rng.next() < 0.35;
      list.push({ t: cab ? 'crown' : rng.pick(types), cab, x: -300 + i * 120 + rng.range(-30, 30), z, dir, moving: true, v: rng.range(9, 13), cruise: rng.range(9, 13) });
    }
    // one InstancedMesh per model (cabs are their own model for the roof light)
    const groups = new Map();
    for (const c of list) { const key = c.cab ? 'cab' : c.t; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(c); }
    const mat = solidMaterial({ defines: { INST_LIGHT: 1 } });
    this.cars = list; this.carMeshes = [];
    const col = new THREE.Color();
    for (const [key, cars] of groups) {
      const geo = carGeo(MODELS[key === 'cab' ? 'crown' : key], key === 'cab');
      const light = new THREE.InstancedBufferAttribute(new Float32Array(cars.length), 1);
      geo.setAttribute('iLight', light);
      const mesh = new THREE.InstancedMesh(geo, mat, cars.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cars.forEach((c, i) => {
        c.mesh = mesh; c.i = i;
        mesh.setColorAt(i, col.set(key === 'cab' ? CAB : rng.pick(COLOURS)).multiplyScalar(rng.range(0.85, 1.05)));
        light.setX(i, c.moving ? 1 : 0);
        if (c.moving) {
          const L = MODELS[c.t].L;
          c.head = [this.glows.add(V(), 0xfff0d0, 1.1, { k: 2 }), this.glows.add(V(), 0xfff0d0, 1.1, { k: 2 })];
          c.tail = [this.glows.add(V(), 0xff2010, 0.6, { k: 1.4 }), this.glows.add(V(), 0xff2010, 0.6, { k: 1.4 })];
          c.L = L; c.W = MODELS[c.t].W;
        }
        this.place(c);
      });
      mesh.frustumCulled = false;
      this.scene.add(mesh); this.carMeshes.push(mesh);
    }
  }
  place(c) {
    const m = this.tmpM || (this.tmpM = new THREE.Matrix4()), q = this.tmpQ || (this.tmpQ = new THREE.Quaternion());
    q.setFromAxisAngle(V(0, 1, 0), c.dir > 0 ? 0 : Math.PI);
    m.compose(V(c.x, RD, c.z), q, V(1, 1, 1));
    c.mesh.setMatrixAt(c.i, m);
    if (c.head) {
      const f = c.dir * (c.L / 2 + 0.05), b = -c.dir * (c.L / 2 + 0.05), w = c.W / 2 - 0.3;
      this.glows.move(c.head[0], c.x + f, RD + 0.62, c.z - w); this.glows.move(c.head[1], c.x + f, RD + 0.62, c.z + w);
      this.glows.move(c.tail[0], c.x + b, RD + 0.78, c.z - w); this.glows.move(c.tail[1], c.x + b, RD + 0.78, c.z + w);
    }
  }

  // ----------------------------------------------------------- the PATH sign
  buildSigns() {
    const { c, ctx } = makeCanvas(128, 32);
    ctx.fillStyle = '#14285a'; ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#e8ecf0'; ctx.font = 'bold 20px Arial, Helvetica, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('PATH', 6, 17);
    ctx.font = 'bold 9px Arial, Helvetica, sans-serif'; ctx.fillText('EXCHANGE', 68, 11); ctx.fillText('PLACE', 68, 23);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...OUT, map: { value: tex } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${OUT_GLSL}
uniform sampler2D map; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){ vec3 t = texture2D(map, vUv).rgb; vec3 c = outLight(t, normalize(vN)) + t * oNight * 1.4; gl_FragColor = vec4(outFog(c, vW), 1.0); }`,
    });
    for (const [p, ry] of this.signSpots) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), m);
      s.position.copy(p); s.rotation.y = ry; this.scene.add(s);
    }
  }

  // ----------------------------------------------------------- per frame
  update(dt) {
    const lanes = [[], []];
    for (const c of this.cars) if (c.moving) lanes[c.dir > 0 ? 0 : 1].push(c);
    for (const lane of lanes) {
      lane.sort((a, b) => (a.x - b.x) * a.dir);
      for (let i = 0; i < lane.length; i++) {
        const c = lane[i], ahead = lane[(i + 1) % lane.length];
        // keep a gap to the car ahead (wrapping round the loop)
        let gap = (ahead.x - c.x) * c.dir; if (gap <= 0) gap += 640;
        const target = gap < 14 ? 0 : gap < 30 ? c.cruise * (gap - 14) / 16 : c.cruise;
        c.v += (target - c.v) * Math.min(1, dt * 1.5);
        c.x += c.v * c.dir * dt;
        if (c.x > 320) c.x -= 640; if (c.x < -320) c.x += 640;
        this.place(c);
      }
    }
    for (const m of this.carMeshes) m.instanceMatrix.needsUpdate = true;
  }
}
