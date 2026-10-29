// West Broadway, 1999, from the fourth floor of a Tribeca walk-up on Leonard
// Street, looking south down the street canyon at the Twin Towers. Our cross
// street below the window, the T where West Broadway begins, seven blocks of
// brick walk-ups, cast-iron lofts and a brick apartment tower with cornices,
// fire escapes, window units, water tanks, awnings and shop signs; sidewalks
// with street trees, cobra-head lamps, mast-arm signals, hydrants, payphones
// and paper boxes; parked cars, and traffic (cabs, the odd NYPD Caprice, a
// box truck, a bus) that turns in and out of the T and stops at the lights.
// Static parts are merged; buildings, fire escapes, trees and each vehicle
// model are instanced.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';
import { OUT, OUT_GLSL, Kit, solidMaterial } from './outdoor.js';
import { boxMesh, PAL, TANK } from './skyline.js';
import { vehicleModels, PAINT, LIVERY } from './vehicles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const G0 = -14, SW = -13.85, RD = -13.98;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const IRON = 0x161616, GRANITE = 0x7c7a74, CONC = 0x8a8680, POLE = 0x3a3e3a;
// the layout: West Broadway's centre line, roadway and building lines, our cross street's kerbs, the cross streets down the canyon
export const ST = { axis: 6.5, roadL: -3.5, roadR: 16.5, faceL: -9.5, faceR: 22.5, crossN: -4.6, crossS: -15.4, inters: [-104, -192, -280, -368, -456, -544], end: -612, width: [-58, 72] };
// facade window grids per style (must match FACADE_GLSL): cell, window size
const GRID = { 0: [2.5, 3.3, 0.42, 0.52], 1: [2.3, 3.6, 0.4, 0.5], 6: [2.1, 2.9, 0.46, 0.5], 7: [3.4, 4.2, 0.7, 0.6] };
const SIGNS = ['DELI GROCERY', 'LIQUORS', 'BAR', 'CLEANERS', 'PIZZA', 'HARDWARE', 'LAUNDROMAT', 'RESTAURANT', 'CHECKS CASHED', 'LOCKSMITH', 'COFFEE SHOP', 'VIDEO'];
const AWNING = [0x1e3a26, 0x5a1414, 0x14223e, 0x141414, 0x6a1a10, 0x2a3a3a, 0x4a3018];

export class Street {
  constructor(scene, glows) {
    this.scene = scene; this.glows = glows;
    this.rng = new RNG(1031);
    this.kit = new Kit();
    this.boxes = []; this.escapes = []; this.acs = []; this.signs = []; this.treeSpots = []; this.lamps = [];
    this.buildings = [];
    this.ground();
    this.blocks();
    this.lampPosts();
    this.signals();
    this.furniture();
    this.mesh = boxMesh(scene, this.boxes);
    const s = this.static = this.kit.mesh(solidMaterial());
    s.frustumCulled = false; scene.add(s);
    this.buildEscapes();
    this.buildSigns();
    this.buildTrees();
    this.models = vehicleModels();
    this.buildTraffic();
  }

  // ----------------------------------------------------------- the ground
  ground() {
    const k = this.kit, { roadL, roadR, faceL, faceR, crossN, crossS, inters, end } = ST;
    const slab = (x0, x1, z0, z1, top, col, o = {}) => k.box((x0 + x1) / 2, top - 0.6, (z0 + z1) / 2, Math.abs(x1 - x0), 0.6, Math.abs(z1 - z0), col, o);
    // our cross street: sidewalk under us, the kerb, the roadway; the far corners
    slab(-270, 270, 3, crossN + 0.15, SW, CONC, { pat: 2 });
    slab(-270, 270, crossN + 0.15, crossN - 0.15, SW, GRANITE);
    slab(-270, 270, crossN - 0.15, crossS + 0.15, RD, 0x2a2a2c, { pat: 1, seed: 1 });
    for (const [a, b] of [[-270, roadL - 0.3], [roadR + 0.3, 270]]) { slab(a, b, crossS + 0.15, crossS - 0.15, SW, GRANITE); slab(a, b, crossS - 0.15, -20, SW, CONC, { pat: 2 }); }
    // West Broadway, block by block, with the cross streets between
    const zs = [crossS + 0.15, ...inters.flatMap((z) => [z + 5.5, z - 5.5]), end];
    for (let i = 0; i < zs.length; i += 2) {
      const za = zs[i], zb = zs[i + 1];
      slab(roadL, roadR, za, zb, RD, 0x2a2a2c, { pat: 1, seed: 2 });
      const sa = i === 0 ? -20 : za - 3.5, sb = zb + 3.5;
      for (const [a, b, ka, kb] of [[faceL, roadL - 0.3, roadL - 0.3, roadL], [roadR + 0.3, faceR, roadR, roadR + 0.3]]) { slab(a, b, sa, sb, SW, CONC, { pat: 2 }); slab(ka, kb, sa, sb, SW, GRANITE); }
      if (i === 0) for (const [a, b] of [[roadL - 0.3, roadL], [roadR, roadR + 0.3]]) slab(a, b, crossS + 0.15, -20, SW, GRANITE);
    }
    for (const z of [...inters, end - 5.5]) {
      slab(ST.width[0], ST.width[1], z + 5.5, z - 5.5, RD - 0.004, 0x2a2a2c, { pat: 1, seed: 3 });
      for (const sgn of [1, -1]) { slab(ST.width[0], roadL - 0.3, z + sgn * 5.5, z + sgn * 9, SW, CONC, { pat: 2 }); slab(roadR + 0.3, ST.width[1], z + sgn * 5.5, z + sgn * 9, SW, CONC, { pat: 2 }); }
    }
    // the plaza beyond Barclay Street
    slab(ST.width[0], ST.width[1], end - 11, end - 16, SW, CONC, { pat: 2 });
  }

  // ----------------------------------------------------------- the buildings
  blocks() {
    const rng = this.rng, { faceL, faceR, crossS, inters, end } = ST;
    const tops = [crossS - 4.6, ...inters.map((z) => z - 9)], bots = [...inters.map((z) => z + 9), end];
    for (let b = 0; b < tops.length; b++) for (const side of [-1, 1]) {
      let z = tops[b];
      const zEnd = bots[b];
      while (z > zEnd + 4) {
        let f = rng.range(7, 22);
        if (zEnd - (z - f) > -9) f = z - zEnd;
        const za = z, zb = z - f;
        z = zb;
        // the brick apartment tower halfway down on the right, as in every photo of this street
        if (side > 0 && b === 2 && za === tops[2]) { z = za - 34; this.lot(side, za, z, 34, 72, 0, 0x6e4632, { setback: 4, tall: true }); continue; }
        const r = rng.next();
        // the near blocks stay low, as in the photographs; the odd taller loft further down
        const kind = r < 0.45 ? 'walkup' : r < 0.8 ? 'loft' : r < 0.92 ? (b < 3 ? 'loft' : 'tall') : 'low';
        const floors = kind === 'walkup' ? rng.int(4, 6) : kind === 'loft' ? rng.int(6, 8) : kind === 'tall' ? rng.int(10, 14) : rng.int(2, 3);
        const style = kind === 'walkup' ? (rng.next() < 0.85 ? 0 : 6) : kind === 'loft' ? (rng.next() < 0.55 ? 7 : 1) : kind === 'tall' ? rng.pick([0, 1, 6]) : 0;
        const fh = GRID[style][1];
        const h = 1.3 + floors * fh;
        const col = style === 0 ? rng.pick([...PAL.brick, 0x4a2a20, 0x3e2a22]) : style === 7 ? rng.pick([...PAL.buff, ...PAL.stone, 0x8a8a84, 0xb8b0a0]) : style === 1 ? rng.pick(PAL.stone) : rng.pick(PAL.white);
        this.lot(side, za, zb, b === 0 ? 34 : rng.range(18, 34), h, style, col, { burn: b >= 4 ? (rng.next() < 0.5 ? rng.range(0.4, 1) : 0) : (rng.next() < 0.15 ? rng.range(0.3, 0.8) : 0), corner: za === tops[0] });
      }
    }
    // the corners across the street from us, and the cross-street frontage beyond them
    for (const side of [-1, 1]) {
      const x0 = (side < 0 ? ST.faceL : ST.faceR) + side * 34, x1 = side < 0 ? ST.width[0] : ST.width[1];
      this.corner(side, x0, x1, crossS - 4.6, inters[0] + 9);
    }
  }
  // a building on West Broadway: side -1 west face of the left row, +1 the right row
  lot(side, za, zb, depth, h, style, col, o = {}) {
    const rng = this.rng, k = this.kit;
    const face = side < 0 ? ST.faceL : ST.faceR, out = -side;           // out: +x for the left row
    const f = za - zb, zc = (za + zb) / 2, xc = face + side * depth / 2;
    const seed = rng.range(0, 100);
    const b = { x: xc, y: G0, z: zc, w: depth, h, d: f, ry: 0, seed, lit: rng.range(0.7, 1.3), burn: o.burn || 0, style, col: new THREE.Color(col) };
    this.boxes.push(b); this.buildings.push(b);
    const dark = new THREE.Color(col).multiplyScalar(0.55).getHex();
    // cornice, frieze and a parapet cap on the street face
    if (style !== 6 || rng.next() < 0.5) {
      const cc = style === 7 ? rng.pick([0x6a6a64, 0x8a8478, 0x4a4a46, 0xb8b0a0]) : rng.pick([0x5a4a40, 0x7a7266, dark, 0x3a3632]);
      k.box(face + out * 0.4, G0 + h - 1.0, zc, 0.8, 0.9, f + 0.1, cc);
      k.box(face + out * 0.2, G0 + h - 1.45, zc, 0.4, 0.4, f, cc);
      k.box(face + out * 0.15, G0 + h - 0.1, zc, 0.3, 0.25, f, dark);
      if (h > 12) k.box(face + out * 0.12, G0 + 4.3, zc, 0.24, 0.4, f, cc);
    }
    if (o.corner) { k.box(xc, G0 + h - 1.0, za + 0.4, depth + 0.1, 0.9, 0.8, 0x5a4a40); k.box(xc, G0 + h - 1.45, za + 0.2, depth, 0.4, 0.4, 0x5a4a40); }
    if (o.setback || rng.next() < 0.18) {
      const sb = o.setback || 3;
      this.boxes.push({ x: xc + side * sb / 2, y: G0 + h, z: zc, w: depth - sb, h: o.tall ? 3.6 : 3.4, d: f - 1.5, ry: 0, seed: seed + 9, lit: 1, burn: 0, style: o.tall ? 8 : style, col: new THREE.Color(col).multiplyScalar(0.85) });
    }
    // roof: a bulkhead, often a wooden water tank on steel legs
    k.box(xc + side * rng.range(-0.2, 0.25) * depth, G0 + h, zc + rng.range(-0.25, 0.25) * f, 3.2, 3.2, 3.6, 0x4a4440);
    if (h > 13 && rng.next() < 0.65) this.tank(xc + side * depth * rng.range(0.05, 0.3), G0 + h, zc + rng.range(-0.3, 0.3) * f);
    // the shop at street level: awning, sign
    if (rng.next() < 0.75) {
      const aw = Math.min(f - 1.2, rng.range(4, 9)), az = zc + rng.range(-0.5, 0.5) * (f - aw - 1.2);
      if (rng.next() < 0.65) {
        const c = rng.pick(AWNING);
        k.box(face + out * 0.75, SW + 3.0, az, 1.5, 0.05, aw, c, { rz: side < 0 ? -0.32 : 0.32 });
        k.box(face + out * 1.45, SW + 2.62, az, 0.04, 0.32, aw, c);
      }
      this.signs.push({ x: face + out * 0.1, y: SW + 3.75, z: az, w: Math.min(aw, 4.2), out, i: rng.int(0, SIGNS.length - 1) });
    }
    // the upper floors: fire escapes on walk-ups and some lofts, window air conditioners
    const g = GRID[style];
    if (!g || h < 12 || o.tall) return;
    const nb = Math.floor(f / g[0]);
    const z0 = zc - f / 2;
    let fe = -1;
    if ((style === 0 || (style === 7 && rng.next() < 0.4)) && nb >= 3) {
      fe = Math.floor(nb / 2) - 1;
      const ez = z0 + (fe + 1) * g[0];
      for (let j = 1; (j + 0.5) * g[1] + 1.2 < h; j++) this.escapes.push({ x: face, y: G0 + (j + 0.5) * g[1] - g[1] * g[3] * 0.5 - 0.05, z: ez, out, w: g[0] * 2 + 0.2, bottom: j === 1 });
    }
    for (let i = 0; i < nb; i++) for (let j = 1; (j + 0.5) * g[1] + 1 < h; j++) {
      if (i === fe || i === fe + 1 || rng.next() > 0.14) continue;
      this.acs.push({ x: face + out * 0.22, y: G0 + (j + 0.5) * g[1] - g[1] * g[3] * 0.5 + 0.22, z: z0 + (i + 0.5) * g[0] });
    }
  }
  // the corner buildings across from our windows: long frontage on the cross street
  corner(side, x0, x1, za, zb) {
    const rng = this.rng;
    let x = x0;
    while (Math.abs(x - x1) > 6) {
      const wdt = Math.min(Math.abs(x1 - x), rng.range(10, 20)), xa = x, xb = x + side * wdt;
      const style = rng.next() < 0.6 ? 0 : 7, floors = rng.int(5, 7), h = 1.3 + floors * GRID[style][1];
      const depth = Math.abs(za - zb) - 2;
      const col = style === 0 ? rng.pick(PAL.brick) : rng.pick([...PAL.buff, ...PAL.stone]);
      const b = { x: (xa + xb) / 2, y: G0, z: za - depth / 2, w: wdt, h, d: depth, ry: 0, seed: rng.range(0, 100), lit: 1, burn: 0, style, col: new THREE.Color(col) };
      this.boxes.push(b); this.buildings.push(b);
      // its cornice faces us, across the street
      this.kit.box((xa + xb) / 2, G0 + h - 1.0, za + 0.4, wdt + 0.1, 0.9, 0.8, 0x5a4a40);
      this.kit.box((xa + xb) / 2, G0 + h - 1.45, za + 0.2, wdt, 0.4, 0.4, 0x5a4a40);
      if (rng.next() < 0.6) this.tank((xa + xb) / 2 + rng.range(-3, 3), G0 + h, za - depth * 0.5);
      if (rng.next() < 0.7) { const c = rng.pick(AWNING), aw = Math.min(wdt - 1.5, 7); this.kit.box((xa + xb) / 2, SW + 3.0, za + 0.75, aw, 0.05, 1.5, c, { rx: 0.32 }); this.signs.push({ x: (xa + xb) / 2, y: SW + 3.75, z: za + 0.1, w: Math.min(aw, 4.2), out: 0, i: rng.int(0, SIGNS.length - 1) }); }
      const g = GRID[style], nb = Math.floor(wdt / g[0]);
      if (style === 0 && nb >= 3) {
        const ex = Math.min(xa, xb) + (Math.floor(nb / 2)) * g[0];
        for (let j = 1; (j + 0.5) * g[1] + 1.2 < h; j++) this.escapes.push({ x: ex, y: G0 + (j + 0.5) * g[1] - g[1] * g[3] * 0.5 - 0.05, z: za, out: 2, w: g[0] * 2 + 0.2, bottom: j === 1 });
      }
      x = xb;
    }
  }
  tank(x, y, z) {
    const r = this.rng.range(2.2, 3.2), k = this.kit;
    const wood = new THREE.Color(0x4a3a2e).multiplyScalar(this.rng.range(0.7, 1.2)).getHex();
    k.add(TANK.barrel, wood, { x, y: y + 3, z, sx: r, sy: r * 1.5, sz: r, pat: 7 });
    for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(r * 1.045, 0.05, 3, 14), 0x1a1a1a, { x, y: y + 3.3 + i * r * 0.5, z, rx: Math.PI / 2 });
    k.add(TANK.hat, 0x2e2a28, { x, y: y + 3 + r * 1.5, z, sx: r * 1.1, sy: r * 0.6, sz: r * 1.1 });
    k.add(TANK.legs, 0x1e1e20, { x, y, z, sx: r, sy: 3, sz: r });
  }

  // ----------------------------------------------------------- lamps and signals
  lampPosts() {
    const k = this.kit, g = this.glows;
    const cobra = (x, z, dx, dz) => {
      k.cyl(x, SW, z, 0.09, 0.14, 8.3, 8, 0x5c605e);
      k.cyl(x, SW, z, 0.2, 0.22, 0.5, 8, 0x4a4e4c);
      const hx = x + dx * 2.0, hz = z + dz * 2.0;
      k.box((x + hx) / 2, -5.78, (z + hz) / 2, Math.abs(dx) * 2.1 + 0.08, 0.08, Math.abs(dz) * 2.1 + 0.08, 0x5c605e);
      k.box(hx, -5.68, hz, dz ? 0.34 : 0.8, 0.16, dz ? 0.8 : 0.34, 0x6a6e6c);
      k.box(hx, -5.78, hz, dz ? 0.26 : 0.56, 0.04, dz ? 0.56 : 0.26, 0xffb060, { glow: 1.6 });
      g.add(V(hx, -5.88, hz), 0xff9a40, 4.2, { k: 1.6 }); g.add(V(hx, -5.88, hz), 0xffc080, 1.0, { k: 3 });
      this.lamps.push(V(hx, -5.88, hz));
    };
    // a third of a block apart, opposite each other, never in a crossing
    const sp = 88 / 3, z0 = ST.inters[0] + sp / 2;
    for (let z = z0 + sp * 2; z > ST.end; z -= sp) if (z < -20) { cobra(ST.roadL - 0.5, z, 1, 0); cobra(ST.roadR + 0.5, z, -1, 0); }
    for (const x of [-74, -40, -6, 28, 62]) cobra(x, ST.crossS - 0.8, 0, 1);
    OUT.oLampRow.value[0].set(ST.roadL + 1.5, sp, z0, -5.88);
    OUT.oLampRow.value[1].set(ST.roadR - 1.5, sp, z0, -5.88);
    OUT.oLampRow.value[2].set(ST.crossS + 1.2, -34, -6, -5.88);
  }
  signals() {
    const k = this.kit, g = this.glows;
    this.heads = [];
    for (const [i, zc] of ST.inters.entries()) {
      // the mast arm on the near right corner holds the heads the southbound traffic (and we) see
      const px = ST.roadR + 0.7, pz = zc + 8.8;
      k.cyl(px, SW, pz, 0.13, 0.17, 6.6, 8, POLE);
      k.box(px - 4.6, G0 + 6.3, pz, 9.2, 0.14, 0.14, POLE);
      k.box(px - 1.0, G0 + 6.0, pz, 2.0, 0.08, 0.08, POLE, { rz: -0.35 });
      k.box(px, G0 + 3.0, pz + 0.3, 0.05, 0.2, 0.9, 0x1e5a2e);
      for (const hx of [ST.axis + 5.6, ST.axis + 1.8]) {
        k.box(hx, G0 + 5.1, pz, 0.38, 1.1, 0.32, 0xb89a18);
        k.box(hx, G0 + 5.05, pz - 0.01, 0.6, 1.3, 0.04, 0x141414);
        const lamps = [0xff2010, 0xffa010, 0x20ff70].map((c, j) => ({ c: new THREE.Color(c).multiplyScalar(2.2), gi: g.add(V(hx, G0 + 5.48 - j * 0.36, pz + 0.18), c, 0.55, { mode: 2, k: 0 }) }));
        this.heads.push({ i, lamps });
      }
      // the far left corner's arm faces the northbound traffic: we only see its back
      const qx = ST.roadL - 0.7, qz = zc - 8.8;
      k.cyl(qx, SW, qz, 0.13, 0.17, 6.6, 8, POLE);
      k.box(qx + 4.6, G0 + 6.3, qz, 9.2, 0.14, 0.14, POLE);
      for (const hx of [ST.axis - 5.6, ST.axis - 1.8]) k.box(hx, G0 + 5.1, qz, 0.38, 1.1, 0.32, 0xb89a18);
      // walk / don't walk boxes on both poles
      for (const [x, z] of [[px, pz - 0.3], [qx, qz + 0.3]]) k.box(x, G0 + 3.0, z, 0.3, 0.32, 0.3, 0x2a2a2a);
    }
    this.phase = 0;
  }
  // West Broadway's lights: one green wave, 45 s round
  light(i, t) { const u = ((t + i * 2.5) % 45 + 45) % 45; return u < 22 ? 2 : u < 25 ? 1 : 0; }

  // ----------------------------------------------------------- street furniture
  furniture() {
    const k = this.kit, rng = this.rng;
    const hydrant = (x, z) => { k.cyl(x, SW, z, 0.13, 0.15, 0.62, 8, 0xb89a18); k.add(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xb89a18, { x, y: SW + 0.62, z }); k.box(x, SW + 0.42, z, 0.36, 0.08, 0.08, 0xb89a18); };
    const meter = (x, z) => { k.cyl(x, SW, z, 0.035, 0.035, 1.15, 6, 0x5a5c5e); k.box(x, SW + 1.15, z, 0.14, 0.3, 0.16, 0x6a6c6e); };
    const basket = (x, z) => k.cyl(x, SW, z, 0.3, 0.26, 0.85, 10, 0x2a3a2a);
    const mailbox = (x, z) => { k.box(x, SW, z, 0.5, 1.1, 0.5, 0x22346a); k.box(x, SW + 1.1, z, 0.46, 0.14, 0.46, 0x22346a); };
    const payphone = (x, z, out) => { k.box(x, SW, z, 0.18, 1.5, 0.18, 0x7a7c7e); k.box(x + out * 0.1, SW + 1.15, z, 0.36, 0.75, 0.62, 0x8a8c90); k.box(x + out * 0.29, SW + 1.3, z, 0.02, 0.32, 0.42, 0xd0d8e0, { glow: 0.4 }); };
    const papers = (x, z) => [0x1c3a8a, 0xc8b020, 0xb01818, 0xd8d8d0, 0x2a5a2a].slice(0, rng.int(2, 5)).forEach((c, i) => k.box(x, SW, z + i * 0.6, 0.45, 1.05, 0.5, c));
    for (const [side, kx] of [[-1, ST.roadL - 0.6], [1, ST.roadR + 0.6]]) {
      for (let z = -24; z > ST.end; z -= 6.4) {
        if (ST.inters.some((c) => Math.abs(z - c) < 11)) continue;
        const r = rng.next();
        if (r < 0.55) meter(kx, z);
        else if (r < 0.6) hydrant(kx, z);
        else if (r < 0.66) basket(kx, z);
      }
      for (const zc of ST.inters) {
        const z = zc + 11 + rng.range(0, 3);
        mailbox(kx - side * 0.4, z); papers(kx - side * 1.2, z + 1.2);
        if (rng.next() < 0.6) payphone(kx - side * 0.2, zc - 12, -side);
      }
    }
    // a bus stop sign, a "no standing" sign, a green sidewalk shed over a building in scaffolding
    k.cyl(ST.roadL - 0.6, SW, -64, 0.04, 0.04, 2.8, 6, 0x6a6c6e); k.box(ST.roadL - 0.6, SW + 2.3, -64, 0.05, 0.6, 0.5, 0x1a3a8a);
    k.cyl(ST.roadR + 0.6, SW, -150, 0.04, 0.04, 2.6, 6, 0x6a6c6e); k.box(ST.roadR + 0.6, SW + 2.2, -150, 0.05, 0.45, 0.35, 0xd8d8d0);
    for (let z = -118; z > -150; z -= 2.4) for (const x of [ST.faceL - 0.05, ST.roadL - 1.0]) k.box(x, SW, z, 0.12, 3.1, 0.12, 0x2a4a2e);
    k.box((ST.faceL + ST.roadL - 1.0) / 2, SW + 3.1, -134, ST.roadL - 1.0 - ST.faceL + 0.3, 0.3, 33, 0x2a4a2e);
    k.box(ST.roadL - 1.0, SW + 2.1, -134, 0.08, 1.0, 33, 0x2e5a34);
    // trees: dense on the right sidewalk, sparser on the left
    for (let z = -24; z > ST.end; z -= rng.range(8, 11)) if (ST.inters.every((c) => Math.abs(z - c) > 12)) this.treeSpots.push([ST.roadR + 1.6, SW - 0.02, z]);
    for (let z = -30; z > ST.end; z -= rng.range(11, 17)) if (rng.next() < 0.6 && ST.inters.every((c) => Math.abs(z - c) > 12)) this.treeSpots.push([ST.roadL - 1.6, SW - 0.02, z]);
    for (const [x, , z] of this.treeSpots) k.box(x, SW - 0.04, z, 1.4, 0.06, 1.4, 0x2a2018, { pat: 4 });
  }

  // ----------------------------------------------------------- instanced details
  buildEscapes() {
    // one landing: platform, rail, pickets and the stair down to the next one
    const k = new Kit();
    k.box(0.55, 0, 0, 1.1, 0.06, 5.2, IRON);
    k.box(1.08, 0.95, 0, 0.04, 0.05, 5.2, IRON); k.box(1.08, 0.5, 0, 0.03, 0.03, 5.2, IRON);
    for (let i = 0; i <= 12; i++) k.box(1.08, 0.02, -2.6 + i * (5.2 / 12), 0.025, 0.95, 0.025, IRON);
    for (const dz of [-2.6, 2.6]) { k.box(0.55, 0.95, dz, 1.1, 0.05, 0.04, IRON); k.box(0.55, 0.5, dz, 1.1, 0.03, 0.03, IRON); }
    k.box(0.62, -1.62, 1.2, 0.5, 0.05, 3.9, IRON, { rx: 0.86 });
    for (const dx of [0.38, 0.86]) k.box(dx, -1.62, 1.2, 0.03, 0.05, 3.95, IRON, { rx: 0.86 });
    k.box(0.55, -0.05, -2.62, 1.1, 0.12, 0.08, IRON);
    const geo = k.geometry();
    const mesh = new THREE.InstancedMesh(geo, solidMaterial(), this.escapes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0);
    this.escapes.forEach((e, i) => {
      const ry = e.out === 2 ? -Math.PI / 2 : e.out > 0 ? 0 : Math.PI;
      m.compose(V(e.x, e.y, e.z), q.setFromAxisAngle(up, ry), V(1, 1, e.w / 5.2));
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false; this.scene.add(mesh);
    // window air conditioners
    const ak = new Kit();
    ak.box(0, -0.2, 0, 0.5, 0.42, 0.62, 0xb8b6ae); ak.box(0.26, -0.15, 0, 0.02, 0.3, 0.5, 0x5a5a56);
    const am = new THREE.InstancedMesh(ak.geometry(), solidMaterial(), this.acs.length);
    this.acs.forEach((a, i) => { m.makeTranslation(a.x, a.y, a.z); am.setMatrixAt(i, m); });
    am.frustumCulled = false; this.scene.add(am);
  }
  buildSigns() {
    // painted shop signs: a small atlas of names, crisp texels, lit at night
    const W = 256, H = 16 * SIGNS.length;
    const { c, ctx } = makeCanvas(W, H);
    const bg = ['#1a2a1e', '#5a1414', '#14223e', '#e8e0c8', '#b01818', '#2a2a2a', '#1a3a6a', '#3a2010', '#e8d020', '#141414', '#4a2a10', '#8a1a5a'];
    SIGNS.forEach((s, i) => {
      ctx.fillStyle = bg[i % bg.length]; ctx.fillRect(0, i * 16, W, 16);
      ctx.fillStyle = ['#e8e0c8', '#f0e0a0', '#ffffff', '#1a1a1a', '#ffffff', '#f0c020', '#ffffff', '#f0e0c0', '#1a1a1a', '#e8e8e8', '#f0d8a0', '#ffffff'][i % 12];
      ctx.font = 'bold 12px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, W / 2, i * 16 + 8.5);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const pos = [], nor = [], uv = [], idx = [];
    for (const s of this.signs) {
      const n = s.out ? V(s.out, 0, 0) : V(0, 0, 1), t = s.out ? V(0, 0, -s.out) : V(1, 0, 0), h = 0.62;
      const v0 = 1 - (s.i + 1) / SIGNS.length, v1 = 1 - s.i / SIGNS.length, base = pos.length / 3;
      for (const [a, b, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) {
        pos.push(s.x + t.x * a * s.w / 2 + n.x * 0.06, s.y + b * h / 2, s.z + t.z * a * s.w / 2 + n.z * 0.06); nor.push(n.x, n.y, n.z); uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...OUT, map: { value: tex } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vN = normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${OUT_GLSL}
uniform sampler2D map; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main(){ vec3 t = texture2D(map, vUv).rgb; vec3 n = normalize(vN); vec3 c = outLight(t, n) + t * lampPools(vW, n) + t * oNight * 0.5 * (1.0 - oBlackout); gl_FragColor = vec4(outFog(c, vW), 1.0); }`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; this.scene.add(mesh);
  }
  buildTrees() {
    const k = new Kit(), rng = this.rng;
    k.cyl(0, 0.05, 0, 1.4, 1.4, 0.01, 12, 0x3a342c);
    k.cyl(0, 0, 0, 0.1, 0.15, 3.4, 6, 0x3a3028);
    k.cyl(0.3, 2.3, 0.1, 0.04, 0.07, 1.6, 5, 0x3a3028, { rz: -0.5 });
    k.cyl(-0.3, 2.5, -0.1, 0.04, 0.06, 1.4, 5, 0x3a3028, { rz: 0.6 });
    for (const [x, y, z, r] of [[0, 4.8, 0, 1.4], [1.1, 4.2, 0.4, 1.0], [-1.0, 4.4, -0.5, 1.05], [0.3, 5.8, -0.3, 1.0], [-0.4, 4.0, 1.0, 0.9], [0.6, 3.9, -1.0, 0.85], [-0.9, 5.3, 0.6, 0.8], [1.0, 5.4, -0.6, 0.75], [0, 6.5, 0.2, 0.7]]) {
      const g = new THREE.SphereGeometry(r, 8, 6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const s = 1 + Math.sin(p.getX(i) * 6.1 + p.getY(i) * 4.7 + p.getZ(i) * 5.3 + x * 3.0) * 0.16; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s); }
      g.computeVertexNormals();
      k.add(g, 0xffffff, { x, y, z, paint: 1, pat: 6 });
    }
    const mesh = this.trees = new THREE.InstancedMesh(k.geometry(), solidMaterial(), this.treeSpots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    this.treeHue = this.treeSpots.map(() => rng.next());
    this.treeSpots.forEach(([x, y, z], i) => {
      const s = rng.range(0.85, 1.2);
      m.compose(V(x, y, z), q.setFromAxisAngle(V(0, 1, 0), rng.range(0, 6.28)), V(s, s * rng.range(0.9, 1.15), s));
      mesh.setMatrixAt(i, m);
    });
    this.tintTrees(0);
    mesh.frustumCulled = false; this.scene.add(mesh);
  }
  // July green, sickening as the week goes on: yellow, then brown and bare-looking
  tintTrees(wither) {
    const c = new THREE.Color();
    this.treeHue.forEach((r, i) => {
      const w = Math.min(1, Math.max(0, wither * 1.3 - r * 0.4));
      c.setHSL(0.27 - w * 0.17 + r * 0.03, 0.42 - w * 0.12, 0.3 + r * 0.08 - w * 0.08, THREE.SRGBColorSpace);
      this.trees.setColorAt(i, c);
    });
    this.trees.instanceColor.needsUpdate = true;
  }

  // ----------------------------------------------------------- traffic
  buildTraffic() {
    const rng = this.rng, M = this.models;
    const list = this.cars = [];
    // parked along both kerbs, nose with the traffic
    const types = ['sedan', 'sedan', 'sedan', 'wagon', 'van', 'suv', 'cab'];
    for (const [x, dir] of [[ST.roadL + 1.25, 1], [ST.roadR - 1.25, -1]]) {
      let z = -22;
      while (z > ST.end + 6) {
        const t = rng.pick(types), L = M[t].L;
        const ok = ST.inters.every((c) => Math.abs(z - L / 2 - c) > 12) && !(dir > 0 && Math.abs(z + 64) < 8);
        if (ok && rng.next() < 0.8) list.push({ t, x, z: z - L / 2, dir: dir > 0 ? -Math.PI / 2 : Math.PI / 2, moving: false });
        z -= L + rng.range(0.8, 2.6);
      }
    }
    // the two flows: down West Broadway from our cross street, and up it turning into our street
    const R = 4.5;
    this.routes = [
      pathOf([[270, ST.crossS + 2.9], [ST.roadR - 3.9 + R, ST.crossS + 2.9], 'arcR', [ST.roadR - 3.9, ST.crossS + 2.9 - R], [ST.roadR - 3.9, ST.end - 30]], R),
      pathOf([[ST.roadL + 4.3, ST.end - 30], [ST.roadL + 4.3, ST.crossN - 2.9 - R], 'arcR', [ST.roadL + 4.3 - R, ST.crossN - 2.9], [-270, ST.crossN - 2.9]], R),
    ];
    const mix = ['cab', 'cab', 'sedan', 'cab', 'suv', 'nypd', 'box', 'sedan', 'van', 'cab', 'bus', 'wagon'];
    for (const [ri, r] of this.routes.entries()) for (let i = 0; i < 8; i++) {
      const t = mix[(i * 5 + ri * 3) % mix.length];
      list.push({ t, route: ri, rank: ((i * 3) % 8) / 8, s: (i / 8) * r.len + rng.range(-10, 10), v: 0, cruise: t === 'bus' || t === 'box' ? 9 : rng.range(10, 13.5), moving: true });
    }
    // one InstancedMesh per model
    const groups = new Map();
    for (const c of list) { if (!groups.has(c.t)) groups.set(c.t, []); groups.get(c.t).push(c); }
    const mat = solidMaterial({ defines: { INST_LIGHT: 1 } });
    this.carMeshes = [];
    const col = new THREE.Color();
    for (const [t, cars] of groups) {
      const geo = M[t].geo.clone();
      const light = new THREE.InstancedBufferAttribute(new Float32Array(cars.length), 1);
      geo.setAttribute('iLight', light);
      const mesh = new THREE.InstancedMesh(geo, mat, cars.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cars.forEach((c, i) => {
        c.mesh = mesh; c.i = i; c.L = M[t].L; c.W = M[t].W;
        mesh.setColorAt(i, col.set(LIVERY[t] ?? rng.pick(PAINT)).multiplyScalar(rng.range(0.85, 1.05)));
        light.setX(i, c.moving ? 1 : 0);
        if (c.moving) {
          c.head = [this.glows.add(V(), 0xfff0d0, 1.1, { k: 2 }), this.glows.add(V(), 0xfff0d0, 1.1, { k: 2 })];
          c.tail = [this.glows.add(V(), 0xff2010, 0.6, { k: 1.4 }), this.glows.add(V(), 0xff2010, 0.6, { k: 1.4 })];
        }
        this.place(c);
      });
      mesh.frustumCulled = false;
      this.scene.add(mesh); this.carMeshes.push(mesh);
    }
  }
  place(c) {
    const m = this.tmpM || (this.tmpM = new THREE.Matrix4()), q = this.tmpQ || (this.tmpQ = new THREE.Quaternion());
    let x = c.x, z = c.z, yaw = c.dir;
    if (c.moving) { const p = this.routes[c.route].at(c.s); x = p.x; z = p.z; yaw = p.yaw; }
    q.setFromAxisAngle(V(0, 1, 0), yaw);
    m.compose(V(x, c.hidden ? -500 : RD, z), q, V(1, 1, 1));
    c.mesh.setMatrixAt(c.i, m);
    if (c.head) {
      const fx = Math.cos(yaw), fz = -Math.sin(yaw), sx = -fz, sz = fx, f = c.L / 2 + 0.05, w = c.W / 2 - 0.3, y = c.hidden ? -500 : RD;
      this.glows.move(c.head[0], x + fx * f + sx * w, y + 0.62, z + fz * f + sz * w); this.glows.move(c.head[1], x + fx * f - sx * w, y + 0.62, z + fz * f - sz * w);
      this.glows.move(c.tail[0], x - fx * f + sx * w, y + 0.8, z - fz * f + sz * w); this.glows.move(c.tail[1], x - fx * f - sx * w, y + 0.8, z - fz * f - sz * w);
    }
  }

  // ----------------------------------------------------------- per frame
  // calm: 1 normal traffic .. 0 the streets emptied
  update(dt, t, calm = 1) {
    // the lights
    for (const h of this.heads) {
      const st = this.light(h.i, t);
      h.lamps.forEach((l, j) => { const on = (j === 0 && st === 0) || (j === 1 && st === 1) || (j === 2 && st === 2); this.glows.tint(l.gi, on ? l.c.r : 0, on ? l.c.g : 0, on ? l.c.b : 0); });
    }
    for (const [ri, r] of this.routes.entries()) {
      for (const c of this.cars) if (c.moving && c.route === ri) { c.hidden = c.rank >= calm; if (c.hidden) this.place(c); }
      const cars = this.cars.filter((c) => c.moving && c.route === ri && !c.hidden).sort((a, b) => a.s - b.s);
      cars.forEach((c, i) => {
        const ahead = cars[(i + 1) % cars.length];
        let gap = ahead.s - c.s; if (gap <= 0) gap += r.len;
        let target = gap < 9 + c.L ? 0 : gap < 24 + c.L ? c.cruise * (gap - 9 - c.L) / 15 : c.cruise;
        // stop at West Broadway's lights
        const z = r.at(c.s).z;
        for (const [k, zc] of ST.inters.entries()) {
          const stop = ri === 0 ? zc + 10.5 : zc - 10.5, d = ri === 0 ? z - stop : stop - z;
          if (d > 0.5 && d < 30 && this.light(k, t) < 2 && r.onWB(c.s)) target = Math.min(target, Math.max(0, (d - 2) * 0.5));
        }
        c.v += (target - c.v) * Math.min(1, dt * 1.6);
        c.s = (c.s + c.v * dt) % r.len;
        this.place(c);
      });
    }
    for (const m of this.carMeshes) m.instanceMatrix.needsUpdate = true;
  }
}

// a route of straight runs joined by quarter turns of radius R; at(s) gives position and heading
function pathOf(pts, R) {
  const segs = [];
  let p = null;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i] === 'arcR') { segs.push({ arc: true, a: p, b: pts[i + 1] }); p = pts[i + 1]; i++; continue; }
    if (p) segs.push({ a: p, b: pts[i] });
    p = pts[i];
  }
  let len = 0;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    s.len = s.arc ? Math.PI * R / 2 : Math.hypot(dx, dz);
    s.s0 = len; len += s.len;
    if (s.arc) {
      // the turn's centre: the corner of the box spanned by its ends, on the inside of the turn
      const prev = segs[segs.indexOf(s) - 1];
      const hx = Math.sign(s.a[0] - prev.a[0]), hz = Math.sign(s.a[1] - prev.a[1]);
      s.c = hx ? [s.a[0], s.b[1]] : [s.b[0], s.a[1]];
      s.h0 = Math.atan2(-hz, hx);
    }
  }
  const onWB = (s) => { const q = segs.find((g) => s >= g.s0 && s < g.s0 + g.len) || segs[0]; return !q.arc && q.a[0] === q.b[0]; };
  return {
    len, onWB,
    at(s) {
      s = ((s % len) + len) % len;
      const g = segs.find((q) => s >= q.s0 && s < q.s0 + q.len) || segs[segs.length - 1];
      const u = (s - g.s0) / g.len;
      if (!g.arc) { const x = g.a[0] + (g.b[0] - g.a[0]) * u, z = g.a[1] + (g.b[1] - g.a[1]) * u; return { x, z, yaw: Math.atan2(-(g.b[1] - g.a[1]), g.b[0] - g.a[0]) }; }
      // right-hand quarter turn: heading swings by -90 degrees
      const a0 = Math.atan2(g.a[1] - g.c[1], g.a[0] - g.c[0]), a1 = Math.atan2(g.b[1] - g.c[1], g.b[0] - g.c[0]);
      let da = a1 - a0; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const a = a0 + da * u;
      return { x: g.c[0] + Math.cos(a) * R, z: g.c[1] + Math.sin(a) * R, yaw: g.h0 - (Math.PI / 2) * u };
    },
  };
}
