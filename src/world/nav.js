// 2D navigation grid for the cat (and anything small): baked from static box
// colliders, with dynamic door blocking, A* pathfinding and path smoothing.
import * as THREE from 'three';
import { G } from '../core/globals.js';

export class NavGrid {
  constructor(x0, z0, x1, z1, cell = 0.1) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.w = Math.ceil((x1 - x0) / cell); this.h = Math.ceil((z1 - z0) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.doors = [];
    this.extra = new Uint8Array(this.w * this.h); // dynamic blocks (rebuilt per query)
  }
  ix(x) { return Math.floor((x - this.x0) / this.cell); }
  iz(z) { return Math.floor((z - this.z0) / this.cell); }
  cx(i) { return this.x0 + (i + 0.5) * this.cell; }
  cz(j) { return this.z0 + (j + 0.5) * this.cell; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  bake(bodies, y0 = 0.03, y1 = 0.3, pad = 0.09) {
    for (const b of bodies) {
      for (let s = 0; s < b.shapes.length; s++) {
        const sh = b.shapes[s];
        if (!sh.halfExtents) {
          if (sh.radiusTop !== undefined) { // cylinder
            const r = sh.radiusTop + pad, p = b.position;
            if (p.y + sh.height / 2 < y0 || p.y - sh.height / 2 > y1) continue;
            this.markRect(p.x - r, p.z - r, p.x + r, p.z + r);
          }
          continue;
        }
        const he = sh.halfExtents;
        const p = b.position;
        if (p.y + he.y < y0 || p.y - he.y > y1) continue;
        const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const v = new THREE.Vector3(sx * he.x, 0, sz * he.z).applyQuaternion(q);
          mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mnz = Math.min(mnz, v.z); mxz = Math.max(mxz, v.z);
        }
        this.markRect(p.x + mnx - pad, p.z + mnz - pad, p.x + mxx + pad, p.z + mxz + pad);
      }
    }
  }
  markRect(ax, az, bx, bz, v = 1, arr = this.blocked) {
    const i0 = Math.max(0, this.ix(ax)), i1 = Math.min(this.w - 1, this.ix(bx));
    const j0 = Math.max(0, this.iz(az)), j1 = Math.min(this.h - 1, this.iz(bz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) arr[j * this.w + i] = v;
  }
  clearRect(ax, az, bx, bz) { this.markRect(ax, az, bx, bz, 0); }
  // doorway segment: blocked unless the door is open enough
  addDoor(door, a, b) { this.doors.push({ door, a, b }); }
  refreshDynamic() {
    this.extra.fill(0);
    for (const d of this.doors) {
      if (d.door.angle > 0.55 && !d.door.locked) continue;
      const n = Math.ceil(d.a.distanceTo(d.b) / (this.cell * 0.5));
      for (let k = 0; k <= n; k++) {
        const p = d.a.clone().lerp(d.b, k / n);
        const i = this.ix(p.x), j = this.iz(p.z);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.inside(i + di, j + dj)) this.extra[(j + dj) * this.w + i + di] = 1;
      }
    }
  }
  free(i, j) { return this.inside(i, j) && !this.blocked[j * this.w + i] && !this.extra[j * this.w + i]; }
  freeAt(x, z) { return this.free(this.ix(x), this.iz(z)); }
  nearestFree(x, z, maxR = 8) {
    const i0 = this.ix(x), j0 = this.iz(z);
    if (this.free(i0, j0)) return [i0, j0];
    for (let r = 1; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      if (this.free(i0 + di, j0 + dj)) return [i0 + di, j0 + dj];
    }
    return null;
  }
  // A* returning world points (y=0)
  path(from, to, { avoid = null, avoidR = 0, allowBlockedGoal = false } = {}) {
    this.refreshDynamic();
    const s = this.nearestFree(from.x, from.z), g = allowBlockedGoal ? [this.ix(to.x), this.iz(to.z)] : this.nearestFree(to.x, to.z);
    if (!s || !g) return null;
    const W = this.w, N = W * this.h;
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = []; // simple binary heap
    const push = (id, f) => { open.push([f, id]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0]; const last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
    const sid = s[1] * W + s[0], gid = g[1] * W + g[0];
    const hfn = (i, j) => Math.hypot(i - g[0], j - g[1]);
    gScore[sid] = 0; push(sid, hfn(s[0], s[1]));
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iter = 0;
    while (open.length && iter++ < 40000) {
      const [, id] = pop();
      if (id === gid) break;
      if (closed[id]) continue; closed[id] = 1;
      const i = id % W, j = (id / W) | 0;
      for (const [di, dj, c] of nb) {
        const ni = i + di, nj = j + dj;
        const nid = nj * W + ni;
        if (!(this.free(ni, nj) || (allowBlockedGoal && nid === gid))) continue;
        if (di && dj && (!this.free(i + di, j) || !this.free(i, j + dj))) continue;
        let cost = c;
        if (avoid) { const d = Math.hypot(this.cx(ni) - avoid.x, this.cz(nj) - avoid.z); if (d < avoidR) cost += (avoidR - d) * 12; }
        const ng = gScore[id] + cost;
        if (ng < gScore[nid]) { gScore[nid] = ng; came[nid] = id; push(nid, ng + hfn(ni, nj)); }
      }
    }
    if (came[gid] < 0 && gid !== sid) return null;
    const cells = [];
    for (let c = gid; c >= 0; c = came[c]) { cells.push(c); if (c === sid) break; }
    cells.reverse();
    const pts = cells.map((c) => new THREE.Vector3(this.cx(c % W), 0, this.cz((c / W) | 0)));
    return this.smooth(pts);
  }
  lineFree(a, b) {
    const n = Math.ceil(a.distanceTo(b) / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n); if (!this.freeAt(p.x, p.z)) return false; }
    return true;
  }
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.lineFree(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  randomFreeNear(p, r, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (this.freeAt(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
}
