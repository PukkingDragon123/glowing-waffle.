// Grid A* over the apartment floor, with furniture footprints blocked and string-pulled paths.
import { ROOM, FURNITURE as F } from '../scenes/layout.js';

const CELL = 0.1, RAD = 0.22;
export class NavGrid {
  constructor(apt) {
    this.nx = Math.ceil((ROOM.x1 - ROOM.x0) / CELL); this.nz = Math.ceil((ROOM.z1 - ROOM.z0) / CELL);
    this.block = new Uint8Array(this.nx * this.nz);
    const skip = new Set(['rug', 'fridgeGhost', 'chair', 'crib']);
    for (const [k, f] of Object.entries(F)) if (!skip.has(k)) this.blockRect(f.x, f.z, f.w, f.d, RAD);
    // walls
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const [x, z] = this.center(i, j);
      if (x < ROOM.x0 + RAD || x > ROOM.x1 - RAD || z < ROOM.z0 + RAD || z > ROOM.z1 - 0.15) this.block[i + j * this.nx] = 1;
    }
    this.dyn = new Uint8Array(this.nx * this.nz);
  }
  blockRect(cx, cz, w, d, pad = 0, arr = this.block, v = 1) {
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const [x, z] = this.center(i, j);
      if (Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad) arr[i + j * this.nx] = v;
    }
  }
  setCrib(on) { this.dyn.fill(0); if (on) this.blockRect(F.crib.x, F.crib.z, F.crib.w, F.crib.d, RAD, this.dyn); }
  center(i, j) { return [ROOM.x0 + (i + 0.5) * CELL, ROOM.z0 + (j + 0.5) * CELL]; }
  cell(x, z) { return [Math.max(0, Math.min(this.nx - 1, Math.floor((x - ROOM.x0) / CELL))), Math.max(0, Math.min(this.nz - 1, Math.floor((z - ROOM.z0) / CELL)))]; }
  free(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[i + j * this.nx] && !this.dyn[i + j * this.nx]; }
  nearestFree(i, j) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 30; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && this.free(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }
  los(a, b) {
    const [ax, az] = a, [bx, bz] = b, n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let k = 0; k <= n; k++) { const t = k / Math.max(1, n); const [i, j] = this.cell(ax + (bx - ax) * t, az + (bz - az) * t); if (!this.free(i, j)) return false; }
    return true;
  }
  // Returns waypoints [[x,z],...] ending exactly at `to` when reachable (else nearest free point).
  path(from, to) {
    const s = this.nearestFree(...this.cell(from[0], from[1])), g = this.nearestFree(...this.cell(to[0], to[1]));
    const N = this.nx * this.nz, id = (i, j) => i + j * this.nx;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, id(...s)]]; gs[id(...s)] = 0;
    const H = (i, j) => Math.hypot(i - g[0], j - g[1]);
    let found = false;
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (closed[cur]) continue; closed[cur] = 1;
      const ci = cur % this.nx, cj = (cur / this.nx) | 0;
      if (ci === g[0] && cj === g[1]) { found = true; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
        const nid = id(ni, nj), ng = gs[cur] + (di && dj ? 1.414 : 1);
        if (ng < gs[nid]) { gs[nid] = ng; came[nid] = cur; open.push([ng + H(ni, nj), nid]); }
      }
    }
    if (!found) return [to];
    const cells = []; let c = id(...g); while (c !== -1) { cells.push(this.center(c % this.nx, (c / this.nx) | 0)); c = came[c]; }
    cells.reverse();
    const goalFree = this.free(...this.cell(to[0], to[1]));
    if (goalFree) cells.push(to);
    // string pulling
    const out = []; let anchor = from;
    for (let k = 0; k < cells.length; k++) {
      const next = cells[k + 1];
      if (!next || !this.los(anchor, next)) { out.push(cells[k]); anchor = cells[k]; }
    }
    return out.length ? out : [to];
  }
}
