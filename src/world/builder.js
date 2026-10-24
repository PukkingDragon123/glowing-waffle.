// Level construction helpers. Rooms are built as inward-facing shells (each
// room paints its own side of a wall) plus separate thick colliders.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { Batcher, boxGeo } from '../gfx/geo.js';

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

function quadGeo(cx, cy, cz, ux, uy, uz, vx, vy, vz, nx, ny, nz, w, h, ts, uoff = 0, voff = 0) {
  // centered quad spanning u (width) and v (height) unit axes
  const hw = w / 2, hh = h / 2;
  const p = [], n = [], uv = [];
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of pts) {
    p.push(cx + ux * a * hw + vx * b * hh, cy + uy * a * hw + vy * b * hh, cz + uz * a * hw + vz * b * hh);
    n.push(nx, ny, nz);
    uv.push((uoff + (a + 1) / 2 * w) / ts, (voff + (b + 1) / 2 * h) / ts);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export class Builder {
  constructor(parent) {
    this.parent = parent;
    this.batch = new Batcher();
    this.colliders = [];
    this.frame = null; // {x,y,z,ry} local frame for furniture
  }

  ts(mat) { return mat.userData.ws || 1; }

  // set a local transform frame (for furniture), call endFrame() after
  beginFrame(x, y, z, ry = 0) { this.frame = { x, y, z, ry, c: Math.cos(ry), s: Math.sin(ry) }; }
  endFrame() { this.frame = null; }
  toWorld(lx, ly, lz) {
    const f = this.frame;
    if (!f) return [lx, ly, lz];
    // rotate around Y by ry
    return [f.x + lx * f.c + lz * f.s, f.y + ly, f.z - lx * f.s + lz * f.c];
  }

  // Axis-aligned (in local frame) textured box. Position is the box center.
  box(cx, cy, cz, w, h, d, mat, { collide = true, cast = true, receive = true, ry = 0, faces = null, uvOff } = {}) {
    const g = boxGeo(w, h, d, this.ts(mat), faces, uvOff);
    const [x, y, z] = this.toWorld(cx, cy, cz);
    const rot = (this.frame ? this.frame.ry : 0) + ry;
    _m.makeRotationFromEuler(_e.set(0, rot, 0));
    _m.setPosition(x, y, z);
    g.applyMatrix4(_m);
    this.batch.add(g, mat, { cast, receive });
    if (collide) G.physics.addStaticBox(x, y, z, w / 2, h / 2, d / 2, rot, typeof collide === 'string' ? collide : 'world');
    return g;
  }

  // custom geometry already in local coordinates
  geo(g, mat, { cast = true, receive = true, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 } = {}) {
    const [wx, wy, wz] = this.toWorld(x, y, z);
    const rot = (this.frame ? this.frame.ry : 0) + ry;
    _m.makeRotationFromEuler(_e.set(rx, rot, rz, 'YXZ'));
    _m.setPosition(wx, wy, wz);
    g.applyMatrix4(_m);
    this.batch.add(g, mat, { cast, receive });
    return g;
  }

  collider(cx, cy, cz, w, h, d, ry = 0) {
    const [x, y, z] = this.toWorld(cx, cy, cz);
    const rot = (this.frame ? this.frame.ry : 0) + ry;
    return G.physics.addStaticBox(x, y, z, w / 2, h / 2, d / 2, rot);
  }

  // One wall side of a room (inward facing), with rectangular openings.
  // side: 'n' (z=z0, faces +z), 's' (z=z1, faces -z), 'w' (x=x0, faces +x), 'e' (x=x1, faces -x)
  wallSide(r, side, mat, openings = [], { thick = 0.12, collide = true, baseMat = null, crownMat = null } = {}) {
    const { x0, z0, x1, z1 } = r;
    const y0 = r.y0 ?? 0, H = r.h ?? 2.7;
    const ts = this.ts(mat);
    let a0, a1, fixed, axis, nx = 0, nz = 0, dirU;
    if (side === 'n') { a0 = x0; a1 = x1; fixed = z0; axis = 'x'; nz = 1; dirU = 1; }
    if (side === 's') { a0 = x0; a1 = x1; fixed = z1; axis = 'x'; nz = -1; dirU = -1; }
    if (side === 'w') { a0 = z0; a1 = z1; fixed = x0; axis = 'z'; nx = 1; dirU = -1; }
    if (side === 'e') { a0 = z0; a1 = z1; fixed = x1; axis = 'z'; nx = -1; dirU = 1; }
    const ops = openings.map((o) => ({ a: Math.max(a0, o.a), b: Math.min(a1, o.b), y0: o.y0 ?? 0, y1: o.y1 ?? 2.1, kind: o.kind || 'door' })).sort((p, q) => p.a - q.a);
    const rects = [];
    let cur = a0;
    for (const o of ops) {
      if (o.a > cur) rects.push([cur, o.a, 0, H]);
      if (o.y0 > 0) rects.push([o.a, o.b, 0, o.y0]);
      if (o.y1 < H) rects.push([o.a, o.b, o.y1, H]);
      cur = Math.max(cur, o.b);
    }
    if (cur < a1) rects.push([cur, a1, 0, H]);
    for (const [ra, rb, ry0, ry1] of rects) {
      const w = rb - ra, h = ry1 - ry0;
      if (w < 1e-3 || h < 1e-3) continue;
      const am = (ra + rb) / 2, ym = y0 + (ry0 + ry1) / 2;
      let g;
      // keep texture continuous along the wall: uoff from wall start
      const uoff = (dirU > 0 ? ra - a0 : a1 - rb);
      if (axis === 'x') g = quadGeo(am, ym, fixed, nz, 0, 0, 0, 1, 0, 0, 0, nz, w, h, ts, uoff, ry0);
      else g = quadGeo(fixed, ym, am, 0, 0, -nx, 0, 1, 0, nx, 0, 0, w, h, ts, uoff, ry0);
      this.batch.add(g, mat, { cast: false, receive: true });
      if (collide) {
        if (axis === 'x') G.physics.addStaticBox(am, ym, fixed - nz * thick / 2, w / 2 + 0.01, h / 2, thick / 2);
        else G.physics.addStaticBox(fixed - nx * thick / 2, ym, am, thick / 2, h / 2, w / 2 + 0.01);
      }
    }
    // reveals for plain openings (archways / windows without frames)
    for (const o of ops) {
      if (o.kind !== 'open') continue;
      const w = o.b - o.a;
      const depth = thick;
      if (axis === 'x') {
        const zc = fixed - nz * depth / 2;
        this.batch.add(quadGeo((o.a + o.b) / 2, y0 + o.y1, zc, 1, 0, 0, 0, 0, 1, 0, -1, 0, w, depth, ts), mat, { cast: false });
        this.batch.add(quadGeo(o.a, y0 + (o.y0 + o.y1) / 2, zc, 0, 0, -1, 0, 1, 0, 1, 0, 0, depth, o.y1 - o.y0, ts), mat, { cast: false });
        this.batch.add(quadGeo(o.b, y0 + (o.y0 + o.y1) / 2, zc, 0, 0, 1, 0, 1, 0, -1, 0, 0, depth, o.y1 - o.y0, ts), mat, { cast: false });
      } else {
        const xc = fixed - nx * depth / 2;
        this.batch.add(quadGeo(xc, y0 + o.y1, (o.a + o.b) / 2, 1, 0, 0, 0, 0, 1, 0, -1, 0, depth, w, ts), mat, { cast: false });
        this.batch.add(quadGeo(xc, y0 + (o.y0 + o.y1) / 2, o.a, 1, 0, 0, 0, 1, 0, 0, 0, 1, depth, o.y1 - o.y0, ts), mat, { cast: false });
        this.batch.add(quadGeo(xc, y0 + (o.y0 + o.y1) / 2, o.b, -1, 0, 0, 0, 1, 0, 0, 0, -1, depth, o.y1 - o.y0, ts), mat, { cast: false });
      }
    }
    // baseboard + crown molding
    if (baseMat) {
      let c2 = a0;
      const segs = [];
      for (const o of ops) { if (o.y0 <= 0.01) { if (o.a > c2) segs.push([c2, o.a]); c2 = o.b; } }
      if (c2 < a1) segs.push([c2, a1]);
      for (const [sa, sb] of segs) {
        const w = sb - sa; if (w < 0.02) continue;
        const am = (sa + sb) / 2;
        if (axis === 'x') this.batch.add(boxAt(am, y0 + 0.055, fixed + nz * 0.008, w, 0.11, 0.016, baseMat), baseMat, { cast: false });
        else this.batch.add(boxAt(fixed + nx * 0.008, y0 + 0.055, am, 0.016, 0.11, w, baseMat), baseMat, { cast: false });
      }
    }
    if (crownMat) {
      const w = a1 - a0, am = (a0 + a1) / 2;
      if (axis === 'x') this.batch.add(boxAt(am, y0 + H - 0.04, fixed + nz * 0.02, w, 0.08, 0.04, crownMat), crownMat, { cast: false });
      else this.batch.add(boxAt(fixed + nx * 0.02, y0 + H - 0.04, am, 0.04, 0.08, w, crownMat), crownMat, { cast: false });
    }
  }

  floor(r, mat, { collide = true, y = null, thick = 0.2 } = {}) {
    const { x0, z0, x1, z1 } = r;
    const yy = y ?? (r.y0 ?? 0);
    const w = x1 - x0, d = z1 - z0;
    const g = quadGeo((x0 + x1) / 2, yy, (z0 + z1) / 2, 1, 0, 0, 0, 0, -1, 0, 1, 0, w, d, this.ts(mat), x0, -z1);
    this.batch.add(g, mat, { cast: false, receive: true });
    if (collide) G.physics.addStaticBox((x0 + x1) / 2, yy - thick / 2, (z0 + z1) / 2, w / 2 + 0.15, thick / 2, d / 2 + 0.15);
  }

  ceiling(r, mat, { collide = true } = {}) {
    const { x0, z0, x1, z1 } = r;
    const yy = (r.y0 ?? 0) + (r.h ?? 2.7);
    const w = x1 - x0, d = z1 - z0;
    const g = quadGeo((x0 + x1) / 2, yy, (z0 + z1) / 2, 1, 0, 0, 0, 0, 1, 0, -1, 0, w, d, this.ts(mat), x0, z0);
    this.batch.add(g, mat, { cast: false, receive: true });
    if (collide) G.physics.addStaticBox((x0 + x1) / 2, yy + 0.1, (z0 + z1) / 2, w / 2, 0.1, d / 2);
  }

  // whole room shell. open: {n:[...], s:[...], e:[...], w:[...]} openings
  room(r, { wall, floor, ceil, open = {}, base = null, crown = null, collide = true, thick = 0.12, walls = 'nsew' }) {
    if (floor) this.floor(r, floor, { collide });
    if (ceil) this.ceiling(r, ceil, { collide });
    for (const s of walls) this.wallSide(r, s, (r.wallMats && r.wallMats[s]) || wall, open[s] || [], { thick, collide, baseMat: base, crownMat: crown });
  }

  build(name) { return this.batch.build(this.parent, name); }
}

export function boxAt(cx, cy, cz, w, h, d, mat) {
  const g = boxGeo(w, h, d, mat.userData.ws || 1);
  g.translate(cx, cy, cz);
  return g;
}
