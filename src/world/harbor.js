// Life on the Hudson: NY Waterway ferries shuttling between the Exchange
// Place slip and the Battery Park City terminal, another running downriver,
// a tug pushing a gravel barge, a sightseeing boat and a sailboat. Each boat
// is one merged mesh with running lights; their headings and speeds feed the
// water shader's wakes.
import * as THREE from 'three';
import { Kit, solidMaterial } from './outdoor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WL = -15;                    // waterline
export const MAX_WAKES = 6;

// a hull from a top-view outline (square stern, raked bow) extruded upward
function hullGeo(L, W, H, bow = 0.3) {
  const s = new THREE.Shape();
  const b = L * bow;
  s.moveTo(-L / 2, -W / 2); s.lineTo(L / 2 - b, -W / 2); s.quadraticCurveTo(L / 2 - b * 0.25, -W * 0.42, L / 2, 0); s.quadraticCurveTo(L / 2 - b * 0.25, W * 0.42, L / 2 - b, W / 2); s.lineTo(-L / 2, W / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);         // outline in x/z, height along +y
  return g;
}
function ferry() {
  const k = new Kit(), L = 34, W = 9.6;
  k.add(hullGeo(L, W, 2.2, 0.28), 0xd8d8d2, { y: WL - 0.9, side: 0xd8d8d2 });
  k.add(hullGeo(L + 0.2, W + 0.2, 0.35, 0.28), 0x1a2a5a, { y: WL + 0.95 });
  k.box(-1.5, WL + 1.3, 0, 23, 2.9, 8.8, 0xe4e4de);
  k.box(-1.5, WL + 2.05, 0, 23.2, 1.3, 9.0, 0x14181c, { pat: 8, glow: 0.35 });
  k.box(-3, WL + 4.2, 0, 13, 2.3, 7.2, 0xe4e4de);
  k.box(-3, WL + 4.75, 0, 13.2, 1.1, 7.4, 0x14181c, { pat: 8, glow: 0.3 });
  k.box(5.2, WL + 4.2, 0, 3.6, 2.5, 5.0, 0xe4e4de);
  k.box(6.4, WL + 5.0, 0, 1.4, 1.0, 5.1, 0x101418, { pat: 8 });
  k.box(-3, WL + 6.5, 0, 13.4, 0.12, 7.6, 0xb8b8b2);
  k.cyl(5.2, WL + 6.7, 0, 0.07, 0.09, 4.0, 6, 0xc8c8c8);
  k.box(-L / 2 + 1.5, WL + 1.3, 0, 2.4, 1.0, W - 1, 0x2a2c2e);
  return { geo: k.geometry(), L, W, lights: [[5.2, WL + 10.6, 0, 0xfff4e0], [1, WL + 4.6, -4.4, 0xff2010], [1, WL + 4.6, 4.4, 0x20ff50], [-L / 2, WL + 3, 0, 0xfff4e0]] };
}
function tugAndBarge() {
  const k = new Kit(), BL = 64, BW = 16;
  // the barge ahead, riding low with a heap of gravel
  k.box(0, WL - 1.0, 0, BL, 2.2, BW, 0x4a3022, { pat: 7, side: 0x3a2a20 });
  k.box(0, WL + 1.2, 0, BL - 1, 0.25, BW - 1, 0x2a2420);
  k.add(new THREE.CylinderGeometry(0.4, 1, 1, 4, 1).rotateY(Math.PI / 4), 0x5a5650, { x: 2, y: WL + 1.2 + 2.2, z: 0, sx: BL * 0.7, sy: 4.4, sz: BW * 0.75 });
  // the tug pushing from astern: black hull, white house, tall wheelhouse, banded stack
  const tx = -BL / 2 - 13;
  k.add(hullGeo(26, 9, 3.2, 0.2), 0x121214, { x: tx, y: WL - 1.4, side: 0x121214 });
  k.box(tx + 11.5, WL - 0.6, 0, 2.6, 2.4, 7.4, 0x1a1a1a);
  k.box(tx - 1, WL + 1.8, 0, 12, 2.6, 6.6, 0xd8d4c8);
  k.box(tx + 1.5, WL + 4.4, 0, 6, 2.4, 5.6, 0xd8d4c8);
  k.box(tx + 2.2, WL + 6.8, 0, 4.2, 2.4, 5.0, 0xd8d4c8);
  k.box(tx + 3.2, WL + 7.6, 0, 2.2, 1.0, 5.1, 0x101418, { pat: 8, glow: 0.3 });
  k.box(tx - 3.5, WL + 4.4, 0, 1.8, 4.6, 2.2, 0x121212);
  k.box(tx - 3.5, WL + 7.4, 0, 1.85, 0.8, 2.25, 0xd8d4c8);
  k.box(tx - 3.5, WL + 7.9, 0, 1.85, 0.6, 2.25, 0x8a1a12);
  k.cyl(tx + 2.2, WL + 9.2, 0, 0.06, 0.08, 4.0, 5, 0xc8c8c8);
  // old tyres hung along the sides as fenders
  for (let i = 0; i < 5; i++) for (const sz of [-1, 1]) k.add(new THREE.TorusGeometry(0.4, 0.16, 4, 8), 0x0a0a0a, { x: tx - 9 + i * 4, y: WL + 0.9, z: sz * 4.6 });
  return { geo: k.geometry(), L: BL + 26, W: BW, off: tx / 2, lights: [[tx + 2.2, WL + 13.2, 0, 0xfff4e0], [tx + 2.2, WL + 12.0, 0, 0xfff4e0], [BL / 2, WL + 1.6, 0, 0xffd040], [tx + 3, WL + 7, -2.6, 0xff2010], [tx + 3, WL + 7, 2.6, 0x20ff50]] };
}
function sightseer() {
  const k = new Kit(), L = 50, W = 9.4;
  k.add(hullGeo(L, W, 2.4, 0.3), 0x1a2448, { y: WL - 1.0, side: 0x1a2448 });
  k.box(-2, WL + 1.4, 0, 36, 2.8, 8.6, 0xe8e8e2);
  k.box(-2, WL + 2.1, 0, 36.2, 1.4, 8.8, 0x12161a, { pat: 8, glow: 0.4 });
  k.box(-2, WL + 4.2, 0, 36, 0.1, 8.6, 0xb0b0aa);
  for (let i = 0; i < 19; i++) for (const sz of [-4.2, 4.2]) k.box(-19.5 + i * 2, WL + 4.3, sz, 0.05, 1.0, 0.05, 0xd0d0d0);
  for (const sz of [-4.2, 4.2]) k.box(-2, WL + 5.3, sz, 36, 0.05, 0.05, 0xd0d0d0);
  k.box(12, WL + 4.3, 0, 5, 2.4, 5.2, 0xe8e8e2);
  k.box(13.8, WL + 5.1, 0, 1.4, 1.1, 5.3, 0x101418, { pat: 8 });
  k.cyl(-8, WL + 4.3, 0, 0.9, 1.0, 3.2, 10, 0xb02a1a);
  return { geo: k.geometry(), L, W, lights: [[12, WL + 9, 0, 0xfff4e0], [8, WL + 4.8, -4.6, 0xff2010], [8, WL + 4.8, 4.6, 0x20ff50], [-L / 2, WL + 3, 0, 0xfff4e0]] };
}
function sailboat() {
  const k = new Kit(), L = 9;
  k.add(hullGeo(L, 2.8, 1.3, 0.4), 0xe8e8e2, { y: WL - 0.5, side: 0xe8e8e2 });
  k.box(-0.8, WL + 0.8, 0, 3.2, 0.6, 1.9, 0xe8e8e2);
  k.cyl(0.6, WL + 0.8, 0, 0.05, 0.07, 12, 5, 0xb0b0b0);
  const sail = (pts) => { const g = new THREE.BufferGeometry(); const a = pts.flat(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...[pts[0], pts[2], pts[1]].flat()], 3)); g.computeVertexNormals(); return g; };
  k.add(sail([[0.65, WL + 1.6, 0], [0.65, WL + 12.5, 0], [-3.4, WL + 1.6, 0.2]]), 0xe4e2d8);
  k.add(sail([[0.75, WL + 11, 0], [4.2, WL + 1.3, 0], [0.75, WL + 1.6, -0.1]]), 0xe4e2d8);
  return { geo: k.geometry(), L, W: 2.8, lights: [[0.6, WL + 13, 0, 0xfff4e0]] };
}

export class Harbor {
  constructor(scene, glows) {
    this.glows = glows;
    const mat = solidMaterial();
    const mk = (spec, route) => {
      const m = new THREE.Mesh(spec.geo, mat); m.frustumCulled = false; scene.add(m);
      const lights = spec.lights.map(([x, y, z, c]) => ({ p: V(x, y, z), i: glows.add(V(), c, 1.2, { k: 2.4 }) }));
      return { m, spec, route, lights, pos: new THREE.Vector2(), dir: new THREE.Vector2(1, 0), v: 0 };
    };
    // routes give position and heading for a time; the ferries dwell at their slips
    const shuttle = (a, b, ca, cb, travel, dwell, t0) => (t) => {
      const T = 2 * (travel + dwell), u = ((t + t0) % T + T) % T;
      let k, back = false;
      if (u < dwell) k = 0; else if (u < dwell + travel) k = (u - dwell) / travel; else if (u < 2 * dwell + travel) { k = 1; back = true; } else { k = 1 - (u - 2 * dwell - travel) / travel; back = true; }
      const e = k * k * (3 - 2 * k);
      const p = bez(a, ca, cb, b, e), q = bez(a, ca, cb, b, Math.min(1, e + 0.01)), q0 = bez(a, ca, cb, b, Math.max(0, e - 0.01));
      const d = q.clone().sub(q0); if (back) d.negate();
      const moving = (u > dwell && u < dwell + travel) || u > 2 * dwell + travel;
      return { p, d: d.lengthSq() > 1e-6 ? d.normalize() : null, v: moving ? 12 * Math.sin(Math.PI * e) + 1 : 0 };
    };
    const lane = (z, x0, x1, speed, t0, wob = 0) => (t) => {
      const span = x1 - x0, u = (((t * speed + t0) % span) + span) % span;
      const x = speed > 0 ? x0 + u : x1 - u;
      return { p: new THREE.Vector2(x, z + Math.sin(x * 0.004) * wob), d: new THREE.Vector2(Math.sign(speed), Math.cos(x * 0.004) * wob * 0.004 * Math.sign(speed)).normalize(), v: Math.abs(speed) };
    };
    const P = (x, z) => new THREE.Vector2(x, z);
    this.boats = [
      mk(ferry(), shuttle(P(61, -62), P(70, -1085), P(40, -380), P(120, -800), 95, 30, 0)),
      mk(ferry(), shuttle(P(-2600, -420), P(1500, -1020), P(-900, -560), P(600, -760), 300, 40, 170)),
      mk(tugAndBarge(), lane(-640, -3200, 3000, -2.6, 1900, 30)),
      mk(sightseer(), lane(-860, -3600, 2800, 5.5, 800, 40)),
      mk(sailboat(), lane(-420, -1400, 900, 2.2, 600, 60)),
    ];
    this.wakeA = Array.from({ length: MAX_WAKES }, () => new THREE.Vector4());
    this.wakeB = Array.from({ length: MAX_WAKES }, () => new THREE.Vector4());
  }
  update(dt, t) {
    const lp = V();
    this.boats.forEach((b, i) => {
      const s = b.route(t);
      if (s.d) b.dir.lerp(s.d, Math.min(1, dt * 1.5)).normalize();
      b.v += (s.v - b.v) * Math.min(1, dt * 0.8);
      b.pos.copy(s.p);
      const yaw = Math.atan2(-b.dir.y, b.dir.x);
      // a gentle pitch and roll on the chop
      b.m.position.set(b.pos.x, Math.sin(t * 0.9 + i) * 0.08, b.pos.y);
      b.m.rotation.set(Math.sin(t * 0.7 + i * 2) * 0.012, yaw, Math.sin(t * 0.55 + i) * 0.01, 'YXZ');
      b.m.updateMatrixWorld();
      for (const l of b.lights) { lp.copy(l.p).applyMatrix4(b.m.matrixWorld); this.glows.move(l.i, lp.x, lp.y, lp.z); }
      this.wakeA[i].set(b.pos.x + b.dir.x * (b.spec.off || 0), b.pos.y + b.dir.y * (b.spec.off || 0), b.dir.x, b.dir.y);
      this.wakeB[i].set(b.v, b.spec.L, b.spec.W, 0);
    });
  }
}
function bez(a, b, c, d, t) {
  const u = 1 - t;
  return new THREE.Vector2(u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y);
}
