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
