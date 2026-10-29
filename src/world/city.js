// Lower Manhattan landmarks at true scale, as seen across the Hudson from
// Exchange Place: the Twin Towers (column facade, mechanical-floor bands, the
// North Tower's antenna), WTC 7 and the Verizon Building north of them, the
// Marriott, the World Financial Center with the Winter Garden, One Liberty,
// the Millenium Hilton, Chase Manhattan Plaza, the Woolworth Building, 40
// Wall Street, 70 Pine, the windowless AT&T Long Lines, and uptown the Empire
// State and the Chrysler.
// Frame: -z is the view across the river (roughly east-south-east), +x is to
// the right (south), -x is north. Ground is y = -14.
import * as THREE from 'three';
import { radial } from '../gfx/textures.js';
import { OUT, OUT_GLSL } from './outdoor.js';

const GROUND = -14;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const LM_VS = /* glsl */`
attribute vec3 aBox;
varying vec3 vObj; varying vec3 vNo; varying vec3 vN; varying vec3 vWorld; varying vec3 vBox;
void main(){ vObj = position; vNo = normal; vBox = aBox; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// facades. Columns are anti-aliased with fwidth so the tight 1 m WTC pitch
// averages to brushed aluminium at range. style: 0 WTC, 1 punched/grid, 2 windowless
const LM_FS = /* glsl */`
${OUT_GLSL}
uniform vec3 base; uniform vec3 glassCol; uniform float pitch; uniform float floorH; uniform float winW; uniform float height; uniform float style; uniform float seed; uniform float litMod;
uniform float cut; uniform float burn; uniform float fireY; uniform float sheen;
varying vec3 vObj; varying vec3 vNo; varying vec3 vN; varying vec3 vWorld; varying vec3 vBox;
void main(){
  float y = vObj.y, yg = vWorld.y + 14.0;
  // collapse: everything above the cut is gone, with a ragged, glowing edge
  float rag = (vn2(vec2(vObj.x + vObj.z, y) * 0.15) - 0.5) * 14.0;
  if (y > cut + rag) discard;
  vec3 no = normalize(vNo), n = normalize(vN);
  bool roof = no.y > 0.5, side = abs(no.x) > 0.5;
  float u = side ? vObj.z : vObj.x;
  float fw0 = side ? vBox.z : vBox.x;
  // columns
  float cx = (u + fw0 * 0.5) / pitch;
  float fw = max(fwidth(cx), 1e-4);
  float col = clamp((abs(fract(cx) - 0.5) - winW * 0.5) / fw + 0.5, 0.0, 1.0);
  col = mix(col, 1.0 - winW, smoothstep(0.35, 1.0, fw));
  // spandrels between floors
  float fl = yg / floorH, fi = floor(fl), ff = fract(fl);
  float fwf = max(fwidth(fl), 1e-4);
  float spand = clamp((abs(ff - 0.5) - 0.36) / fwf + 0.5, 0.0, 1.0);
  spand = mix(spand, 0.28, smoothstep(0.35, 1.0, fwf));
  float metal = max(col, spand), mech = 0.0;
  if (style < 0.5) {
    // WTC: louvred mechanical floors and the lobby arches read as solid bands
    mech = step(150.0, yg) * step(yg, 157.0) + step(275.0, yg) * step(yg, 282.0) + step(395.0, yg) * step(yg, 407.0);
    if (yg < 24.0) metal = max(metal, 0.65);
    metal = max(metal, mech * 0.9);
  } else if (style > 1.5) {
    // windowless: granite with louvred vent hoods every ten floors or so
    metal = 1.0;
    mech = step(0.82, fract(yg / 38.0)) * step(10.0, yg);
  }
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 r = reflect(v, n);
  float fres = pow(1.0 - abs(dot(v, n)), 4.0);
  vec3 sky = skyRefl(r);
  // stone and anodised aluminium both pick up the sky; glass is dark with a sheen
  float grime = 0.86 + 0.14 * vn2(vec2(u * 0.08 + seed, yg * 0.012)) - 0.08 * smoothstep(0.5, 1.0, vn2(vec2(u * 0.6 + seed, yg * 0.02)));
  vec3 metalC = outLight(base * grime, n) + sky * (sheen + fres * sheen * 2.0);
  vec3 glassC = outLight(glassCol, n) * 0.5 + sky * (0.14 + fres * 0.6);
  vec3 c = mix(glassC, metalC, metal);
  if (mech > 0.0) c *= 0.68;
  if (roof) c = outLight(base * 0.42, n);
  if (style < 0.5 && !roof) c *= 0.93 + 0.07 * vn2(vec2(u * 0.3, 2.0) + seed);
  // night: offices lit in long bands of fluorescent white, whole floors dark
  float bay = floor(cx / 3.0);
  float rr = h31(vec3(fi, bay, seed + (side ? 1.0 : 2.0)));
  float flo = h21(vec2(fi, seed));
  float p = oLit * litMod * (step(0.62, flo) * 1.3 + 0.06) * (1.0 - oBlackout * step(0.5, h31(vec3(fi, 7.0, seed))));
  float lit = step(rr, p) * (1.0 - metal) * (1.0 - mech) * step(24.0, yg) * (roof ? 0.0 : 1.0);
  vec3 office = mix(vec3(0.74, 0.88, 0.72), vec3(1.0, 0.78, 0.48), step(0.72, h31(vec3(fi, bay, seed + 9.0))));
  c += lit * office * oNight * (0.6 + 0.5 * rr);
  // the street glow washes the lowest floors at night
  c += base * vec3(1.0, 0.55, 0.22) * 0.05 * oNight * exp(-yg / 30.0);
  // fire through the impact floors, soot above it
  if (burn > 0.0) {
    float d = y - fireY;
    float band = smoothstep(26.0, 0.0, abs(d)) * burn;
    float fl2 = 0.55 + 0.45 * sin(oTime * 8.0 + u * 0.7) * sin(oTime * 5.1 + y * 0.3);
    c = mix(c, c * 0.15, smoothstep(0.0, 60.0, d) * burn * 0.8);
    c += band * vec3(2.2, 0.75, 0.18) * fl2 * (1.0 - metal * 0.5);
  }
  // hot ragged edge where it's breaking
  c += vec3(1.6, 0.5, 0.1) * smoothstep(10.0, 0.0, cut + rag - y) * step(cut, height - 1.0);
  gl_FragColor = vec4(outFog(c, vWorld), 1.0);
}`;

// plain fogged solid for crowns, spires, roofs and glass vaults
const SOLID_FS = /* glsl */`
${OUT_GLSL}
uniform vec3 col; uniform vec3 emi; uniform float cut; uniform float gloss;
varying vec3 vObj; varying vec3 vNo; varying vec3 vN; varying vec3 vWorld; varying vec3 vBox;
void main(){
  if (vWorld.y > cut) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(vWorld - cameraPosition);
  float fres = pow(1.0 - abs(dot(v, n)), 4.0);
  vec3 c = outLight(col, n) + skyRefl(reflect(v, n)) * gloss * (0.4 + fres);
  c += emi * oNight;
  gl_FragColor = vec4(outFog(c, vWorld), 1.0);
}`;

// geometry helpers: every piece carries its box size for the facade maths
function boxGeo(w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return tagBox(g, w, h, d); }
function tagBox(g, w, h, d) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([w, h, d], i * 3); g.setAttribute('aBox', new THREE.BufferAttribute(a, 3)); return g; }

export class Landmarks {
  constructor(scene) {
    this.scene = scene;
    this.mats = []; this.solids = [];
    this.towers = [];
    this.lights = [];
    this.keep = [];          // [x, z, r] the filler skyline stays clear of
    const W = (x, z) => V(x, GROUND, z);
    // --- the Twin Towers: 63.4 m square, 417 m (North, with antenna) and 415 m (South).
    //     From Jersey City the North Tower and its mast stand on the left.
    const north = this.wtcTower(W(42, -1380), 417, 0, true);
    const south = this.wtcTower(W(140, -1402), 415, 1, false);
    this.towers.push(north, south);
    this.keep.push([42, -1380, 50], [140, -1402, 50]);
    // --- around the plaza
    this.slab(W(-126, -1440), 64, 186, 92, 0x6e3a30, 3.0, 3.7, 7, { ry: 0.08, sheen: 0.05 });   // 7 WTC, red granite
    this.verizon(W(-92, -1345));                                                                  // Barclay-Vesey, buff brick setbacks
    this.slab(W(150, -1326), 40, 82, 24, 0x9a9690, 2.8, 3.4, 8);                                  // Marriott (3 WTC)
    this.slab(W(92, -1500), 90, 36, 50, 0x6c6a66, 3.0, 3.6, 9);                                   // 4/5 WTC
    this.slab(W(196, -1575), 40, 170, 26, 0x141418, 2.2, 3.3, 10, { sheen: 0.12 });              // Millenium Hilton, black
    this.slab(W(300, -1590), 84, 226, 50, 0x1c1c20, 3.0, 3.8, 11, { sheen: 0.1 });               // One Liberty Plaza
    this.keep.push([-126, -1440, 60], [-92, -1345, 50], [150, -1326, 30], [92, -1500, 55], [196, -1575, 30], [300, -1590, 55]);
    // --- World Financial Center: granite and glass with copper tops; the Winter Garden between 2 and 3
    const wfc = [[210, -1215, 176, 'trunc'], [132, -1190, 197, 'dome'], [40, -1192, 225, 'pyramid'], [-42, -1222, 150, 'step']];
    wfc.forEach(([x, z, h, top], i) => { this.wfcTower(W(x, z), h, top, 30 + i); this.keep.push([x, z, 40]); });
    this.winterGarden(W(86, -1150));
    this.keep.push([86, -1150, 40]);
    // --- the old downtown
    this.woolworth(W(-62, -1815));
    this.slab(W(470, -1725), 88, 248, 38, 0x8c9196, 1.6, 3.7, 14, { winW: 0.55, sheen: 0.14 });   // Chase Manhattan Plaza, aluminium
    this.slab(W(560, -1785), 42, 236, 42, 0x9a8f80, 2.4, 3.6, 12);                                // 40 Wall Street
    this.pyramid(W(560, -1785), 40, 32, 222, 0x2e5e4c, 0.0);
    this.spire(W(560, -1785), 254, 30, 0x2a3a34);
    this.pine(W(655, -1890));                                                                     // 70 Pine
    this.slab(W(-380, -1960), 58, 167, 58, 0x8a6e66, 3, 3.6, 15, { style: 2, ry: 0.26 });        // AT&T Long Lines, windowless
    this.keep.push([-62, -1815, 50], [470, -1725, 60], [560, -1785, 35], [655, -1890, 35], [-380, -1960, 50]);
    // --- uptown: Empire State and Chrysler, small, hazy, lit
    this.esb(W(-3800, -2950));
    this.chrysler(W(-4650, -3500));
    this.keep.push([-3800, -2950, 90], [-4650, -3500, 50]);
    this.buildLights();
  }

  material(o) {
    const m = new THREE.ShaderMaterial({
      vertexShader: LM_VS, fragmentShader: LM_FS,
      uniforms: {
        ...OUT,
        base: { value: new THREE.Color(o.base) }, glassCol: { value: new THREE.Color(o.glass ?? 0x1a2028) }, pitch: { value: o.pitch }, floorH: { value: o.floorH }, winW: { value: o.winW ?? 0.45 },
        height: { value: o.h }, style: { value: o.style ?? 1 }, seed: { value: o.seed ?? 1 }, litMod: { value: o.lit ?? 1 }, sheen: { value: o.sheen ?? 0.04 },
        cut: { value: 1e5 }, burn: { value: 0 }, fireY: { value: 0 },
      },
    });
    this.mats.push(m);
    return m;
  }
  solid(color, emi = 0x000000, gloss = 0.05) {
    const m = new THREE.ShaderMaterial({ vertexShader: LM_VS, fragmentShader: SOLID_FS, uniforms: { ...OUT, col: { value: new THREE.Color(color) }, emi: { value: new THREE.Color(emi) }, cut: { value: 1e5 }, gloss: { value: gloss } } });
    this.solids.push(m);
    return m;
  }
  add(g, mat, pos, dy = 0) { if (!g.attributes.aBox) tagBox(g, 1, 1, 1); const m = new THREE.Mesh(g, mat); m.position.copy(pos); m.position.y += dy; this.scene.add(m); return m; }
  box(w, h, d, mat, pos, dy = 0) { return this.add(boxGeo(w, h, d), mat, pos, dy); }

  wtcTower(pos, h, i, antenna) {
    const mat = this.material({ base: 0xa9abb0, glass: 0x10141a, pitch: 1.02, floorH: 3.66, winW: 0.46, h, style: 0, seed: 100 + i, sheen: 0.15 });
    // chamfered square plan
    const s = 31.7, c = 2.2;
    const sh = new THREE.Shape();
    sh.moveTo(-s + c, -s); sh.lineTo(s - c, -s); sh.lineTo(s, -s + c); sh.lineTo(s, s - c); sh.lineTo(s - c, s); sh.lineTo(-s + c, s); sh.lineTo(-s, s - c); sh.lineTo(-s, -s + c); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, steps: 1 });
    g.rotateX(-Math.PI / 2);
    tagBox(g, 63.4, h, 63.4);
    const m = this.add(g, mat, pos);
    const t = { mesh: m, mat, pos: pos.clone(), h, extras: [] };
    // roof: hat truss rim + mechanical clutter
    const roofM = this.solid(0x55575b);
    t.extras.push(this.box(64, 2.5, 64, roofM, pos, h));
    t.extras.push(this.box(22, 5, 30, roofM, pos.clone().add(V(-10, 0, 8)), h + 2.5));
    if (antenna) {
      // a broad base, then a tapering mast with its red beacons
      const am = this.solid(0x8a8a8e, 0, 0.12);
      const b0 = this.box(12, 9, 12, am, pos, h + 2);
      const mast = this.add(new THREE.CylinderGeometry(0.9, 2.6, 106, 8), am, pos, h + 11 + 53);
      t.extras.push(b0, mast);
      for (const [y, r] of [[30, 3.6], [60, 2.8], [88, 2.0]]) t.extras.push(this.add(new THREE.CylinderGeometry(r, r, 2, 8), am, pos, h + 11 + y));
      this.lights.push({ pos: pos.clone().add(V(0, h + 117, 0)), col: 0xff2a10, size: 9, blink: 1.2, tower: t }, { pos: pos.clone().add(V(0, h + 60, 0)), col: 0xff2a10, size: 6, blink: 1.2, ph: 0.6, tower: t });
    } else {
      // the observation deck: a low parapet and the rooftop walkway
      t.extras.push(this.box(40, 4, 40, roofM, pos, h + 2.5));
    }
    for (const [dx, dz] of [[-28, -28], [28, -28], [28, 28], [-28, 28]]) this.lights.push({ pos: pos.clone().add(V(dx, h + 4, dz)), col: 0xff3a20, size: 4, blink: 1.6, ph: i * 0.3, tower: t });
    return t;
  }

  slab(pos, w, h, d, color, pitch, floorH, seed, o = {}) {
    const mat = this.material({ base: color, glass: o.glass ?? 0x12161c, pitch, floorH, winW: o.winW ?? 0.55, h, style: o.style ?? 1, seed, sheen: o.sheen ?? 0.04 });
    const m = this.box(w, h, d, mat, pos);
    if (o.ry) m.rotation.y = o.ry;
    // a mechanical penthouse
    const pm = this.solid(new THREE.Color(color).multiplyScalar(0.7).getHex());
    const p = this.box(w * 0.5, Math.min(10, h * 0.05), d * 0.5, pm, pos, h); if (o.ry) p.rotation.y = o.ry;
    if (h > 150) this.lights.push({ pos: pos.clone().add(V(0, h + 10, 0)), col: 0xff3020, size: 4, blink: 1.0, ph: seed * 0.37 });
    return m;
  }

  verizon(pos) {
    // 1927 Barclay-Vesey: a broad brick base stepping back in tiers to a 152 m tower
    const mat = this.material({ base: 0x8a6a50, glass: 0x15171a, pitch: 2.1, floorH: 3.7, winW: 0.42, h: 152, style: 1, seed: 21, lit: 0.8 });
    const tiers = [[70, 60, 60], [58, 44, 50], [46, 26, 40], [34, 22, 30]];
    let y = 0;
    for (const [w, hh, d] of tiers) { this.box(w, hh, d, mat, pos, y); y += hh; }
    this.box(22, 6, 18, this.solid(0x6a5040), pos, y);
  }

  wfcTower(pos, h, top, seed) {
    const w = 46;
    const mat = this.material({ base: 0x9c8e78, glass: 0x1a242c, pitch: 2.4, floorH: 3.8, winW: 0.5, h, style: 1, seed, sheen: 0.06 });
    // setbacks near the top, as on the real towers
    this.box(w, h * 0.82, w, mat, pos);
    this.box(w * 0.86, h * 0.1, w * 0.86, mat, pos, h * 0.82);
    this.box(w * 0.72, h * 0.08, w * 0.72, mat, pos, h * 0.92);
    const copper = this.solid(0x4f7262, 0x1a2620, 0.1);
    const tw = w * 0.72;
    if (top === 'pyramid') this.pyramid(pos, tw, 30, h, 0x4f7262, 0.03);
    else if (top === 'trunc') { const g = new THREE.CylinderGeometry(tw * 0.25, tw * 0.7, 18, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 9, 0); this.add(g, copper, pos, h); }
    else if (top === 'dome') this.add(new THREE.SphereGeometry(tw * 0.48, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper, pos, h);
    else for (let k = 0; k < 4; k++) this.box(tw * (1 - k * 0.22), 6, tw * (1 - k * 0.22), copper, pos, h + k * 6);
    this.lights.push({ pos: pos.clone().add(V(0, h + 30, 0)), col: 0xff3020, size: 3.5, blink: 0.9, ph: seed * 0.21 });
  }
  winterGarden(pos) {
    // the glass vault facing the river, warm inside at night
    const g = new THREE.CylinderGeometry(30, 30, 44, 18, 1, true, -Math.PI / 2, Math.PI);
    g.rotateX(-Math.PI / 2);
    this.add(g, this.solid(0x1d2a33, 0x6a4a26, 0.5), pos, 0);
    this.box(64, 4, 46, this.solid(0x6a6458), pos, 0);
  }
  pyramid(pos, w, hh, y, color, emi) {
    const g = new THREE.CylinderGeometry(0.01, w * 0.7071, hh, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, hh / 2, 0);
    return this.add(g, this.solid(color, new THREE.Color(color).multiplyScalar(emi * 10).getHex(), 0.08), pos, y);
  }
  spire(pos, y, hh, color) {
    this.add(new THREE.ConeGeometry(2.2, hh, 6), this.solid(color), pos, y + hh / 2);
    this.lights.push({ pos: pos.clone().add(V(0, y + hh, 0)), col: 0xff3020, size: 4, blink: 2.0 });
  }
  woolworth(pos) {
    const mat = this.material({ base: 0xd2c8b0, glass: 0x1a1e24, pitch: 1.6, floorH: 3.6, winW: 0.4, h: 241, style: 1, seed: 40, sheen: 0.05 });
    this.box(60, 108, 46, mat, pos);
    this.box(26, 70, 26, mat, pos, 108);
    this.box(20, 30, 20, mat, pos, 178);
    const tc = this.solid(0xd2c8b0);
    for (const [dx, dz] of [[-9, -9], [9, -9], [9, 9], [-9, 9]]) this.add(new THREE.ConeGeometry(1.6, 14, 4), tc, pos.clone().add(V(dx, 0, dz)), 215);
    for (const [dx, dz] of [[-12, -12], [12, -12], [12, 12], [-12, 12]]) this.add(new THREE.ConeGeometry(1.2, 10, 4), tc, pos.clone().add(V(dx, 0, dz)), 183);
    this.pyramid(pos, 18, 26, 208, 0x3e6e5a, 0.05);
    this.spire(pos, 234, 9, 0x3e6e5a);
  }
  pine(pos) {
    // 70 Pine: limestone setbacks to a slim lantern and spire
    const mat = this.material({ base: 0xa0978a, glass: 0x15181c, pitch: 2.2, floorH: 3.6, winW: 0.42, h: 262, style: 1, seed: 13 });
    this.box(44, 150, 40, mat, pos);
    this.box(34, 50, 30, mat, pos, 150);
    this.box(24, 36, 22, mat, pos, 200);
    this.box(14, 20, 14, mat, pos, 236);
    this.spire(pos, 256, 34, 0x6a6660);
  }
  esb(pos) {
    const mat = this.material({ base: 0xc0b8a6, glass: 0x1a1e24, pitch: 1.8, floorH: 3.8, winW: 0.42, h: 381, style: 1, seed: 50 });
    this.box(130, 25, 60, mat, pos);
    this.box(90, 60, 50, mat, pos, 25);
    this.box(60, 230, 44, mat, pos, 85);
    this.box(40, 40, 32, mat, pos, 315);
    this.box(24, 26, 24, mat, pos, 355);
    // the tower lights: red, white and blue for the Fourth of July week
    this.add(new THREE.CylinderGeometry(9, 11, 12, 8), this.solid(0xc8bcb0, 0xa01810), pos, 381 + 6);
    this.add(new THREE.CylinderGeometry(7, 9, 12, 8), this.solid(0xd8d0c0, 0xc8c0b0), pos, 393 + 6);
    this.add(new THREE.CylinderGeometry(4, 7, 16, 8), this.solid(0xc8c4c8, 0x2030a0), pos, 405 + 8);
    this.add(new THREE.CylinderGeometry(0.8, 2, 62, 6), this.solid(0x404040), pos, 452);
    this.lights.push({ pos: pos.clone().add(V(0, 483, 0)), col: 0xff3020, size: 10, blink: 1.5 }, { pos: pos.clone().add(V(0, 400, 0)), col: 0xffe8d0, size: 34, blink: 0 });
  }
  chrysler(pos) {
    const mat = this.material({ base: 0xb4b0a8, glass: 0x1a1e24, pitch: 1.6, floorH: 3.6, winW: 0.4, h: 260, style: 1, seed: 60 });
    this.box(60, 70, 60, mat, pos);
    this.box(40, 190, 40, mat, pos, 70);
    // the terraced steel crown, lit in arcs
    for (let k = 0; k < 6; k++) { const r = 20 - k * 3; this.add(new THREE.CylinderGeometry(r * 0.75, r, 9, 8), this.solid(0xc8c8c8, 0xc8c4b0, 0.3), pos, 264 + k * 8 + 4.5); }
    this.add(new THREE.ConeGeometry(1.8, 38, 6), this.solid(0xc8c8c8, 0, 0.3), pos, 331);
    this.lights.push({ pos: pos.clone().add(V(0, 290, 0)), col: 0xfff0d8, size: 30, blink: 0 });
  }

  buildLights() {
    const map = radial({ size: 32, inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)' });
    for (const l of this.lights) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: l.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.position.copy(l.pos); s.scale.setScalar(l.size);
      this.scene.add(s); l.s = s;
    }
  }

  // per frame, from the sky's shared state (lighting itself comes through OUT)
  update(t, sh) {
    for (const l of this.lights) {
      const on = l.blink ? (Math.sin((t + (l.ph || 0)) * Math.PI * l.blink) > 0.2 ? 1 : 0.05) : 1;
      const cutAway = l.tower && l.pos.y > l.tower.pos.y + l.tower.mat.uniforms.cut.value;
      const o = cutAway ? 0 : on * (0.25 + sh.night * 0.75) * (l.blink ? 1 : sh.night);
      l.s.material.opacity = o; l.s.visible = o > 0.004;
    }
  }
  // collapse helpers: cut height above ground for tower i (or full)
  setCut(i, cut) {
    const t = this.towers[i];
    t.mat.uniforms.cut.value = cut;
    const top = t.pos.y + cut;
    for (const e of t.extras) e.visible = e.position.y < top;
  }
  setFire(i, burn, y) { const u = this.towers[i].mat.uniforms; u.burn.value = burn; u.fireY.value = y; }
  reset() { for (let i = 0; i < this.towers.length; i++) { this.setCut(i, 1e5); this.setFire(i, 0, 0); } }
}
