// Turned, beveled and raised-panel geometry for furniture and doors, so
// nothing in the apartment is just a box.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { roundedBox } from './geo.js';

const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  // world-scaled UVs so wood grain/paint texture keeps its density
  const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i) + z, p.getY(i) + y);
    else if (ay > 0.5) uv.setXY(i, p.getX(i) + x, p.getZ(i) + z);
    else uv.setXY(i, p.getX(i) + x, p.getY(i) + y);
  }
  g.translate(x, y, z);
  return nonIdx(g);
}
export const merge = (list) => { const m = mergeGeometries(list.map(nonIdx), false); m.computeBoundingSphere(); return m; };

// a lathe-turned leg: foot pad, taper, a pair of beads, a collar under the top
export function turnedLeg(h, r = 0.02, o = {}) {
  const pts = [];
  const P = (y, rr) => pts.push(new THREE.Vector2(rr, y * h));
  P(0, 0.001); P(0, r * 0.75); P(0.02, r * 0.8); P(0.05, r * 0.72);
  P(0.4, r * 0.85); P(0.47, r * 1.05); P(0.5, r * 0.8); P(0.53, r * 1.05); P(0.6, r * 0.9);
  P(0.86, r * 1.0); P(0.9, r * 1.2); P(0.94, r * 1.0); P(1, r * 1.05); P(1, 0.001);
  const g = new THREE.LatheGeometry(pts, o.seg ?? 10);
  return nonIdx(g);
}

// a raised-panel door, hinge edge at x=0, bottom at y=0, centred in z
export function panelDoorGeo(w, h, t, style = 'six') {
  const parts = [];
  const st = 0.115, top = 0.115, bot = 0.24, mul = 0.1;
  const openings = [];
  if (style === 'six') {
    const cols = [[st, w / 2 - mul / 2], [w / 2 + mul / 2, w - st]];
    const rows = [[bot, 0.88], [1.06, 1.52], [1.62, h - top]];
    for (const [x0, x1] of cols) for (const [y0, y1] of rows) openings.push([x0, y0, x1, y1]);
    parts.push(boxAt(mul, h - top - bot, t, w / 2, bot + (h - top - bot) / 2, 0));        // mullion
    parts.push(boxAt(w - 2 * st, 0.18, t, w / 2, 0.97, 0));                                // lock rail
    parts.push(boxAt(w - 2 * st, 0.1, t, w / 2, 1.57, 0));                                 // frieze rail
  } else if (style === 'two') {
    openings.push([st, bot, w - st, 0.95], [st, 1.13, w - st, h - 0.13]);
    parts.push(boxAt(w - 2 * st, 0.18, t, w / 2, 1.04, 0));
  } else {
    parts.push(nonIdx(roundedBox(w, h, t, 0.006).translate(w / 2, h / 2, 0)));
    return merge(parts);
  }
  parts.push(boxAt(st, h, t, st / 2, h / 2, 0), boxAt(st, h, t, w - st / 2, h / 2, 0));       // stiles
  const tt = style === 'two' ? 0.13 : top;
  parts.push(boxAt(w - 2 * st, tt, t, w / 2, h - tt / 2, 0), boxAt(w - 2 * st, bot, t, w / 2, bot / 2, 0)); // rails
  // raised fields with wide bevels, recessed into the frame on both faces
  for (const [x0, y0, x1, y1] of openings) {
    const bs = Math.min(0.03, (x1 - x0) * 0.12), bt = t * 0.16;
    const pw = x1 - x0 - 2 * bs - 0.006, ph = y1 - y0 - 2 * bs - 0.006;
    const sh = new THREE.Shape();
    sh.moveTo(-pw / 2, -ph / 2); sh.lineTo(pw / 2, -ph / 2); sh.lineTo(pw / 2, ph / 2); sh.lineTo(-pw / 2, ph / 2); sh.lineTo(-pw / 2, -ph / 2);
    const depth = t * 0.4;
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: 1 });
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, -depth / 2);
    parts.push(nonIdx(g));
    // the thin recessed back of each opening (seen through the bevel gap)
    parts.push(boxAt(x1 - x0, y1 - y0, t * 0.36, (x0 + x1) / 2, (y0 + y1) / 2, 0));
    // sticking: small moldings around each opening on both faces
    for (const s of [-1, 1]) {
      const z = s * (t / 2 - 0.004);
      parts.push(boxAt(x1 - x0, 0.008, 0.008, (x0 + x1) / 2, y0 + 0.004, z), boxAt(x1 - x0, 0.008, 0.008, (x0 + x1) / 2, y1 - 0.004, z));
      parts.push(boxAt(0.008, y1 - y0, 0.008, x0 + 0.004, (y0 + y1) / 2, z), boxAt(0.008, y1 - y0, 0.008, x1 - 0.004, (y0 + y1) / 2, z));
    }
  }
  return merge(parts);
}

// a bent top rail for a chair back
export function bentRail(w, depth, rise, thick, hgt) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10 - 0.5; pts.push(new THREE.Vector3(u * w, rise * (1 - (2 * u) ** 2) * 0.3, depth * (2 * u) ** 2)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 16, thick, 6, false);
  g.scale(1, hgt / thick, 1);
  return nonIdx(g);
}

// Shaker door / drawer front: a softened frame around a recessed flat panel.
// Origin at the centre; front face at +z.
export function shakerGeo(w, h, t, rail = 0.06) {
  const parts = [];
  const r = Math.min(rail, w * 0.2, h * 0.2);
  const rb = (bw, bh, bd, x, y, z, rad = 0.004) => nonIdx(roundedBox(bw, bh, bd, rad).translate(x, y, z));
  parts.push(rb(r, h, t, -w / 2 + r / 2, 0, 0), rb(r, h, t, w / 2 - r / 2, 0, 0));          // stiles
  parts.push(rb(w - 2 * r, r, t, 0, h / 2 - r / 2, 0), rb(w - 2 * r, r, t, 0, -h / 2 + r / 2, 0)); // rails
  parts.push(boxAt(w - 2 * r + 0.004, h - 2 * r + 0.004, t * 0.45, 0, 0, -t * 0.18));      // recessed panel
  // a small cove inside the frame
  const cv = t * 0.25;
  parts.push(boxAt(w - 2 * r, 0.006, cv, 0, h / 2 - r - 0.003, t * 0.12), boxAt(w - 2 * r, 0.006, cv, 0, -h / 2 + r + 0.003, t * 0.12));
  parts.push(boxAt(0.006, h - 2 * r, cv, -w / 2 + r + 0.003, 0, t * 0.12), boxAt(0.006, h - 2 * r, cv, w / 2 - r - 0.003, 0, t * 0.12));
  return merge(parts);
}

// a bar pull with two standoffs, horizontal along x, sticking out along +z
export function barPull(len = 0.12, r = 0.006) {
  const parts = [];
  const bar = new THREE.CylinderGeometry(r, r, len, 8); bar.rotateZ(Math.PI / 2); bar.translate(0, 0, 0.028); parts.push(nonIdx(bar));
  for (const s of [-1, 1]) { const st = new THREE.CylinderGeometry(r * 0.8, r * 0.9, 0.028, 6); st.rotateX(Math.PI / 2); st.translate(s * (len / 2 - 0.012), 0, 0.014); parts.push(nonIdx(st)); }
  for (const s of [-1, 1]) { const cap = new THREE.SphereGeometry(r, 6, 4); cap.translate(s * len / 2, 0, 0.028); parts.push(nonIdx(cap)); }
  return merge(parts);
}

// a turned mushroom knob pointing along +z
export function knobGeo(r = 0.016) {
  const pts = [[0.001, 0], [r * 0.45, 0], [r * 0.4, r * 0.6], [r * 0.55, r * 0.9], [r, r * 1.3], [r * 0.95, r * 1.6], [r * 0.6, r * 1.85], [0.001, r * 1.9]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 10); g.rotateX(Math.PI / 2);
  return nonIdx(g);
}

// a castor: twin wheels on a fork
export function castorGeo() {
  const parts = [];
  for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.024, 0.024, 0.012, 10); w.rotateZ(Math.PI / 2); w.translate(s * 0.009, 0.024, 0); parts.push(nonIdx(w)); }
  const f = new THREE.CylinderGeometry(0.008, 0.01, 0.03, 6); f.translate(0, 0.055, 0); parts.push(nonIdx(f));
  return merge(parts);
}

// a quilt draped over a box (w x L, top at y=0): flat on top, hanging down the
// sides and foot by `drop`, with soft folds
export function drapeGeo(w, L, drop, { thick = 0.03, folds = 7, seed = 3 } = {}) {
  const nu = 28, nv = 36;
  const span = w + 2 * drop, lenSpan = L + drop;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * span - span / 2, v = (j / nv) * lenSpan - L / 2;
    let x = u, y = 0, z = Math.min(v, L / 2);
    // fold over the sides
    if (Math.abs(u) > w / 2) { const k = Math.abs(u) - w / 2; x = Math.sign(u) * (w / 2 + 0.01 + k * 0.08); y = -k; }
    // fold over the foot
    if (v > L / 2) { const k = v - L / 2; z = L / 2 + 0.01 + k * 0.08; y = Math.min(y, -k); }
    // folds: soft ripples, stronger where the cloth hangs
    const hang = Math.min(1, -y / drop + 0.15);
    const rip = Math.sin(v * folds * 1.3 + seed) * 0.012 + Math.sin(u * folds * 0.9 + v * 3 + seed * 2) * 0.008;
    y += rip * (0.3 + hang);
    if (Math.abs(u) > w / 2) x += Math.sign(u) * Math.sin(v * folds * 2 + seed) * 0.015 * hang;
    pos.push(x, y + thick, z);
    uv.push(u * 1.2, v * 1.2);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b2 = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b2, b2, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return nonIdx(g);
}

// lathe helper from [radius, y] pairs
export function lathe(pairs, seg = 16) { return nonIdx(new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg)); }

// A picture-frame moulding swept around a w x h sight opening, mitred at the
// corners. prof: [[out, z, shade], ...] from the sight edge outward (repeat a
// point for a hard edge); shade goes into vertex colour for dirt in the coves.
// Back of the frame at z=0, front toward +z.
export function mouldingFrame(w, h, prof) {
  const pos = [], uv = [], col = [], idx = [];
  const vs = [0];
  for (let i = 1; i < prof.length; i++) vs.push(vs[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  // corners counter-clockwise seen from the front, so every strip faces out
  const sides = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]];
  sides.forEach(([ax, ay, bx, by], s) => {
    const base = pos.length / 3;
    for (let i = 0; i < prof.length; i++) {
      const [o, z, sh = 1] = prof[i];
      const hw = w / 2 + o, hh = h / 2 + o;
      const pa = [ax * hw, ay * hh], pb = [bx * hw, by * hh];
      pos.push(pa[0], pa[1], z, pb[0], pb[1], z);
      // u runs along the side so wood grain follows the moulding
      const ua = s % 2 ? pa[1] : pa[0], ub = s % 2 ? pb[1] : pb[0];
      uv.push(ua, vs[i], ub, vs[i]);
      col.push(sh, sh, sh, sh, sh, sh);
    }
    for (let i = 0; i < prof.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// a box with eased edges and world-scaled UVs (grain keeps its density)
export function softBox(w, h, d, r = 0.004, ts = 1) {
  const g = roundedBox(w, h, d, Math.min(r, w / 2.2, h / 2.2, d / 2.2), 1);
  const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) / ts, p.getY(i) / ts);
    else if (ay >= az) uv.setXY(i, p.getX(i) / ts, p.getZ(i) / ts);
    else uv.setXY(i, p.getX(i) / ts, p.getY(i) / ts);
  }
  return g;
}
