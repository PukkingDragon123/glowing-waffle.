// Verlet cloth: curtains and the shower curtain. Pinned along a rod, pushed
// by the player and the cat, stirred by wind through an open window.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Cloth {
  // a: rod start, b: rod end (world), drop: hanging length
  constructor({ a, b, drop, mat, nx = 14, ny = 16, gather = 0.82, window = null, rings = true, pleat = 0.02 }) {
    this.nx = nx; this.ny = ny; this.window = window;
    const w = a.distanceTo(b);
    const n = new THREE.Vector3().subVectors(b, a).cross(V(0, 1, 0)).normalize();
    // pinch pleats along the heading, opening out a little toward the hem
    const fold = (i, j) => (i % 2 ? -1 : 1) * pleat * (1 + 0.5 * j / (ny - 1)) * (i === 0 || i === nx - 1 ? 0.5 : 1);
    const step = (w * gather) / (nx - 1);
    this.rest = { x: Math.hypot(step, pleat * 2), y: drop / (ny - 1) };
    this.p = []; this.o = []; this.pin = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const t = i / (nx - 1);
      const top = a.clone().lerp(b, t * gather).addScaledVector(n, fold(i, 0));
      const q = a.clone().lerp(b, t * gather).addScaledVector(n, fold(i, j)); q.y -= j * this.rest.y;
      this.p.push(q.clone()); this.o.push(q.clone());
      this.pin.push(j === 0 ? top : null);
    }
    const geo = this.geo = new THREE.PlaneGeometry(1, 1, nx - 1, ny - 1);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w * 1.5, uv.getY(k) * drop * 1.5);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    G.world.root.add(this.mesh);
    this.sync();
    if (rings) {
      const rm = M_ring();
      for (let i = 0; i < nx; i += 2) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 4, 8), rm); r.position.copy(this.pin[i]).add(V(0, 0.01, 0)); r.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); G.world.root.add(r); }
    }
    this.t = Math.random() * 10;
  }
  idx(i, j) { return j * this.nx + i; }
  step(dt) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const g = -9.8 * dt * dt;
    // wind: through an open window, gusting; a faint draft otherwise
    let wind = 0.002;
    if (this.window && this.window.open) wind = 0.012 + Math.max(0, Math.sin(this.t * 0.9) * Math.sin(this.t * 2.3)) * 0.03;
    if (G.story.day >= 7) wind += 0.01;
    // a blast wave pushes everything into the room
    if (G.windGust) { wind += G.windGust * (0.6 + 0.4 * Math.sin(this.t * 9)); }
    const pl = G.player && G.player.ctrl.body.position;
    const cat = G.cat && G.cat.present ? G.cat.pos : null;
    for (let k = 0; k < this.p.length; k++) {
      if (this.pin[k]) { this.p[k].copy(this.pin[k]); this.o[k].copy(this.pin[k]); continue; }
      const p = this.p[k], o = this.o[k];
      const vx = (p.x - o.x) * 0.985, vy = (p.y - o.y) * 0.985, vz = (p.z - o.z) * 0.985;
      o.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
      // wind pushes into the room (+z) with a flutter
      p.z += wind * dt * (0.6 + Math.sin(this.t * 5 + k * 0.7) * 0.4);
      // bodies push the cloth aside
      if (pl) pushOut(p, pl.x, pl.z, 0.32, 0.0, 1.85);
      if (cat) pushOut(p, cat.x, cat.z, 0.16, 0.0, 0.35);
    }
    const rx = this.rest.x, ry = this.rest.y;
    for (let it = 0; it < 4; it++) {
      for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
        if (i < this.nx - 1) relax(this.p[this.idx(i, j)], this.p[this.idx(i + 1, j)], rx, this.pin[this.idx(i, j)], this.pin[this.idx(i + 1, j)]);
        if (j < this.ny - 1) relax(this.p[this.idx(i, j)], this.p[this.idx(i, j + 1)], ry, this.pin[this.idx(i, j)], this.pin[this.idx(i, j + 1)]);
      }
      // keep above the floor
      for (const p of this.p) if (p.y < 0.01) p.y = 0.01;
    }
    // daylight shows through the window curtains
    if (this.window && G.sky && G.sky.p) this.mesh.material.emissiveIntensity = (1 - G.sky.p.night) * 0.6;
    this.sync();
  }
  sync() {
    const pos = this.geo.attributes.position;
    // PlaneGeometry rows run top (j=0) to bottom
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) { const p = this.p[this.idx(i, j)]; pos.setXYZ(j * this.nx + i, p.x, p.y, p.z); }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
function relax(a, b, rest, pa, pb) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const diff = (d - rest) / d;
  if (pa && pb) return;
  const ka = pa ? 0 : pb ? 1 : 0.5, kb = pb ? 0 : pa ? 1 : 0.5;
  a.x += dx * diff * ka; a.y += dy * diff * ka; a.z += dz * diff * ka;
  b.x -= dx * diff * kb; b.y -= dy * diff * kb; b.z -= dz * diff * kb;
}
function pushOut(p, cx, cz, r, y0, y1) {
  if (p.y < y0 || p.y > y1) return;
  const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
  if (d < r && d > 1e-4) { const k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
}
let _ring;
function M_ring() { return _ring || (_ring = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.5, metalness: 0.6 })); }

// all the cloth in 4B
export function hangCloth() {
  const ap = G.apartment, list = [];
  const cur = M.curtainCloth || (M.curtainCloth = M.curtain.clone()); cur.side = THREE.DoubleSide;
  cur.emissive.set(0x6a4a2a); cur.emissiveMap = cur.map; cur.emissiveIntensity = 0;
  const sh = M.showerCloth || (M.showerCloth = M.showerCurtain.clone()); sh.side = THREE.DoubleSide;
  const rodM = M.chrome;
  const curtain = (key, x0, x1, z) => {
    const w = ap.windows[key];
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, x1 - x0 + 1.0, 8), rodM);
    rod.rotation.z = Math.PI / 2; rod.position.set((x0 + x1) / 2, 2.345, z); G.world.root.add(rod);
    for (const ex of [x0 - 0.5, x1 + 0.5]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), rodM); f.position.set(ex, 2.345, z); G.world.root.add(f); }
    // two panels per window, drawn back to the sides of the frame
    list.push(new Cloth({ a: V(x0 - 0.42, 2.32, z), b: V(x0 + 0.1, 2.32, z), drop: 1.62, mat: cur, window: w, nx: 13, ny: 16, gather: 1, pleat: 0.03 }));
    list.push(new Cloth({ a: V(x1 + 0.42, 2.32, z), b: V(x1 - 0.1, 2.32, z), drop: 1.62, mat: cur, window: w, nx: 13, ny: 16, gather: 1, pleat: 0.03 }));
  };
  curtain('living1', 4.7, 5.9, 0.1);
  curtain('menu', 7.1, 8.3, 0.1);
  curtain('bedroom', 1.1, 2.3, 0.1);
  // shower curtain on its rod over the tub
  list.push(new Cloth({ a: V(0.78, 1.98, 3.85), b: V(0.78, 1.98, 5.3), drop: 1.5, mat: sh, nx: 14, ny: 14, gather: 0.9 }));
  return list;
}
