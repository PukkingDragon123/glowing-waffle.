// Lower Manhattan landmarks at true scale, as seen across the Hudson from
// Exchange Place: the Twin Towers (column facade, mechanical-floor bands,
// the North Tower's antenna), WTC 7, the World Financial Center tops, the
// Woolworth Building, 40 Wall Street, and uptown the Empire State and the
// Chrysler. +x is north, -z is east (toward Manhattan). Ground is y = -14.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { radial } from '../gfx/textures.js';

export const GROUND = -14;

// one facade shader for the landmark towers. Columns are anti-aliased with
// fwidth so the tight 1 m WTC pitch averages to brushed aluminium at range.
const LM_VS = /* glsl */`
varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
void main(){ vObj = position; vN = normal; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LM_FS = /* glsl */`
uniform float night; uniform float litFrac; uniform float time; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 dayCol; uniform vec3 skyCol;
uniform vec3 base; uniform vec3 glassCol; uniform float pitch; uniform float floorH; uniform float winW; uniform float height; uniform float style; uniform float seed;
uniform float cut; uniform float burn; uniform float fireY; uniform float blackout;
varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); float a = hash(vec3(i, 0.0)), b = hash(vec3(i + vec2(1,0), 0.0)), c = hash(vec3(i + vec2(0,1), 0.0)), d = hash(vec3(i + vec2(1,1), 0.0)); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
void main(){
  float y = vObj.y;   // metres above ground
  // collapse: everything above the cut is gone, with a ragged, glowing edge
  float rag = (n2(vec2(vObj.x + vObj.z, y) * 0.15) - 0.5) * 14.0;
  if (y > cut + rag) discard;
  vec3 n = normalize(vN);
  bool roof = abs(n.y) > 0.5;
  float u = abs(n.x) > 0.5 ? vObj.z : vObj.x;
  float fl = y / floorH;
  float fi = floor(fl), ff = fract(fl);
  // columns
  float cx = u / pitch;
  float fw = max(fwidth(cx), 1e-4);
  float col = clamp((abs(fract(cx) - 0.5) - winW * 0.5) / fw + 0.5, 0.0, 1.0);
  col = mix(col, 1.0 - winW, smoothstep(0.35, 1.0, fw));
  // spandrels between floors
  float fwf = max(fwidth(fl), 1e-4);
  float spand = clamp((abs(ff - 0.5) - 0.36) / fwf + 0.5, 0.0, 1.0);
  spand = mix(spand, 0.28, smoothstep(0.35, 1.0, fwf));
  float metal = max(col, spand);
  // WTC: louvred mechanical floors and the lobby arches read as solid bands
  float mech = 0.0;
  if (style < 0.5) {
    mech = step(150.0, y) * step(y, 157.0) + step(275.0, y) * step(y, 282.0) + step(395.0, y) * step(y, 407.0);
    if (y < 24.0) metal = max(metal, 0.65);
    metal = max(metal, mech * 0.9);
  }
  if (roof) metal = 1.0;
  float ndl = dot(n, normalize(sunDir));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(v, n)), 3.0);
  // aluminium picks up the sky; glass is dark with a sheen
  vec3 refl = skyCol * (1.0 - night * 0.8);
  vec3 metalC = base * dayCol * (0.55 + 0.45 * clamp(ndl, 0.0, 1.0)) + refl * (0.2 + fres * 0.5);
  vec3 glassC = glassCol * (0.4 + fres) + refl * 0.12;
  vec3 c = mix(glassC, metalC, metal);
  if (mech > 0.0) c *= 0.7;
  // night: dark mass; office floors lit in long bands of fluorescent white
  float bay = floor(cx / 3.0);
  float r = hash(vec3(fi, bay, seed + (abs(n.x) > 0.5 ? 1.0 : 2.0)));
  float lit = step(r, litFrac * (1.0 - blackout * step(0.5, hash(vec3(fi, 7.0, seed))))) * (1.0 - metal) * (1.0 - mech) * step(24.0, y);
  vec3 office = mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.85, 0.6), step(0.7, hash(vec3(fi, bay, seed + 9.0))));
  c = mix(c, c * 0.1 + vec3(0.012, 0.014, 0.02), night);
  c += lit * office * night * 1.7;
  // fire through the impact floors, soot above it
  if (burn > 0.0) {
    float d = y - fireY;
    float band = smoothstep(26.0, 0.0, abs(d)) * burn;
    float fl2 = 0.55 + 0.45 * sin(time * 8.0 + u * 0.7) * sin(time * 5.1 + y * 0.3);
    c = mix(c, c * 0.15, smoothstep(0.0, 60.0, d) * burn * 0.8);
    c += band * vec3(2.2, 0.75, 0.18) * fl2 * (1.0 - metal * 0.5);
  }
  // hot ragged edge where it's breaking
  c += vec3(1.6, 0.5, 0.1) * smoothstep(10.0, 0.0, cut + rag - y) * step(cut, height - 1.0);
  float dist = length(vWorld - cameraPosition);
  c = mix(c, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

// simple fogged solid for crowns, spires and roofs
const SOLID_FS = /* glsl */`
uniform vec3 col; uniform vec3 emi; uniform float night; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 dayCol; uniform float cut;
varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
void main(){
  if (vWorld.y > cut) discard;
  vec3 n = normalize(vN);
  vec3 c = col * dayCol * (0.5 + 0.5 * clamp(dot(n, normalize(sunDir)), 0.0, 1.0));
  c = mix(c, c * 0.12, night) + emi * night;
  float dist = length(vWorld - cameraPosition);
  c = mix(c, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Landmarks {
  constructor(scene) {
    this.scene = scene;
    this.mats = []; this.solids = [];
    this.towers = [];
    this.lights = [];
    const W = (x, z) => new THREE.Vector3(x, GROUND, z);
    // --- the Twin Towers: 63.4 m square, 417 m (North, with antenna) and 415 m (South)
    const north = this.wtcTower(W(-42, -1380), 417, 0, true);
    const south = this.wtcTower(W(-118, -1450), 415, 1, false);
    this.towers.push(north, south);
    // --- the plaza and neighbours
    this.slab(W(-24, -1312), 50, 186, 40, 0x7a4a40, 3.0, 3.7, 7);   // 7 WTC, red granite
    this.slab(W(-95, -1395), 40, 82, 26, 0x9a9690, 2.8, 3.4, 8);    // Marriott (3 WTC)
    this.slab(W(-60, -1490), 90, 36, 50, 0x6c6a66, 3.0, 3.6, 9);    // 4/5 WTC
    this.slab(W(-175, -1500), 40, 170, 25, 0x141418, 2.2, 3.3, 10); // Millenium Hilton, black
    this.slab(W(-190, -1560), 60, 226, 52, 0x1c1c20, 3.0, 3.8, 11); // One Liberty Plaza
    // --- World Financial Center: granite and glass with copper tops
    const wfc = [[-210, -1210, 176, 'trunc'], [-130, -1180, 197, 'dome'], [-40, -1185, 225, 'pyramid'], [40, -1215, 150, 'step']];
    wfc.forEach(([x, z, h, top], i) => this.wfcTower(W(x, z), h, top, 30 + i));
    // --- the Woolworth Building: gothic shaft, green pyramid, pinnacle
    this.woolworth(W(420, -1820));
    // --- 40 Wall Street (green pyramid, spire) and 70 Pine (spire)
    this.slab(W(-520, -1980), 40, 240, 40, 0x8a8278, 2.6, 3.6, 12);
    this.pyramid(W(-520, -1980), 40, 30, 226, 0x3a6a56, 0.0);
    this.spire(W(-520, -1980), 270, 12, 0x2a3a34);
    this.slab(W(-610, -2050), 34, 262, 34, 0x8a8076, 2.6, 3.6, 13);
    this.spire(W(-610, -2050), 262, 26, 0x6a6660);
    // --- uptown: Empire State and Chrysler, small and lit
    this.esb(W(3800, -2950));
    this.chrysler(W(4650, -3500));
    this.buildLights();
  }

  material(o) {
    const m = new THREE.ShaderMaterial({
      vertexShader: LM_VS, fragmentShader: LM_FS,
      uniforms: {
        night: { value: 0 }, litFrac: { value: 0.4 }, time: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        dayCol: { value: new THREE.Color(1, 1, 1) }, skyCol: { value: new THREE.Color(0.5, 0.6, 0.7) }, blackout: { value: 0 },
        base: { value: new THREE.Color(o.base) }, glassCol: { value: new THREE.Color(o.glass ?? 0x1a2028) }, pitch: { value: o.pitch }, floorH: { value: o.floorH }, winW: { value: o.winW ?? 0.45 },
        height: { value: o.h }, style: { value: o.style ?? 1 }, seed: { value: o.seed ?? 1 }, cut: { value: 1e5 }, burn: { value: 0 }, fireY: { value: 0 },
      },
    });
    this.mats.push(m);
    return m;
  }
  solid(color, emi = 0x000000) {
    const m = new THREE.ShaderMaterial({ vertexShader: LM_VS, fragmentShader: SOLID_FS, uniforms: { col: { value: new THREE.Color(color) }, emi: { value: new THREE.Color(emi) }, night: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, dayCol: { value: new THREE.Color(1, 1, 1) }, cut: { value: 1e5 } } });
    this.solids.push(m);
    return m;
  }
  box(w, h, d, mat, pos) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, mat); m.position.copy(pos); this.scene.add(m); return m;
  }

  wtcTower(pos, h, i, antenna) {
    const mat = this.material({ base: 0xa8aab0, glass: 0x10141a, pitch: 1.02, floorH: 3.66, winW: 0.46, h, style: 0, seed: 100 + i });
    // chamfered square plan
    const s = 31.7, c = 2.2;
    const sh = new THREE.Shape();
    sh.moveTo(-s + c, -s); sh.lineTo(s - c, -s); sh.lineTo(s, -s + c); sh.lineTo(s, s - c); sh.lineTo(s - c, s); sh.lineTo(-s + c, s); sh.lineTo(-s, s - c); sh.lineTo(-s, -s + c); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, steps: 1 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.copy(pos); this.scene.add(m);
    const t = { mesh: m, mat, pos: pos.clone(), h, extras: [] };
    // roof: hat truss rim + mechanical clutter
    const roofM = this.solid(0x5a5c60);
    const rim = this.box(64, 2.5, 64, roofM, pos.clone().add(new THREE.Vector3(0, h, 0)));
    t.extras.push(rim);
    if (antenna) {
      // a broad base, then a tapering mast with its red beacons
      const am = this.solid(0x3a3a3e);
      const b0 = this.box(10, 8, 10, am, pos.clone().add(new THREE.Vector3(0, h + 2, 0)));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, 106, 8), am); mast.position.copy(pos).add(new THREE.Vector3(0, h + 10 + 53, 0)); this.scene.add(mast);
      for (const [y, r] of [[30, 3.6], [60, 2.8], [88, 2.0]]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2, 8), am); ring.position.copy(pos).add(new THREE.Vector3(0, h + 10 + y, 0)); this.scene.add(ring); t.extras.push(ring); }
      t.extras.push(b0, mast);
      this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, h + 117, 0)), col: 0xff2a10, size: 9, blink: 1.2, tower: t }, { pos: pos.clone().add(new THREE.Vector3(0, h + 60, 0)), col: 0xff2a10, size: 6, blink: 1.2, ph: 0.6, tower: t });
    } else {
      // observation deck: low parapet and equipment
      t.extras.push(this.box(40, 4, 40, roofM, pos.clone().add(new THREE.Vector3(0, h + 2.5, 0))));
    }
    for (const [dx, dz] of [[-28, -28], [28, -28], [28, 28], [-28, 28]]) this.lights.push({ pos: pos.clone().add(new THREE.Vector3(dx, h + 4, dz)), col: 0xff3a20, size: 4, blink: 1.6, ph: i * 0.3, tower: t });
    return t;
  }

  slab(pos, w, h, d, color, pitch, floorH, seed) {
    const mat = this.material({ base: color, glass: 0x12161c, pitch, floorH, winW: 0.55, h, style: 1, seed });
    const m = this.box(w, h, d, mat, pos);
    return m;
  }

  wfcTower(pos, h, top, seed) {
    const w = 46;
    const mat = this.material({ base: 0x9a8e7c, glass: 0x1a242c, pitch: 2.4, floorH: 3.8, winW: 0.5, h, style: 1, seed });
    // setbacks near the top, as on the real towers
    this.box(w, h * 0.82, w, mat, pos);
    this.box(w * 0.86, h * 0.1, w * 0.86, mat, pos.clone().add(new THREE.Vector3(0, h * 0.82, 0)));
    this.box(w * 0.72, h * 0.08, w * 0.72, mat, pos.clone().add(new THREE.Vector3(0, h * 0.92, 0)));
    const copper = this.solid(0x5a7a6a, 0x223028);
    const ty = h, tw = w * 0.72;
    if (top === 'pyramid') this.pyramid(pos, tw, 30, ty, 0x5a7a6a, 0.03);
    else if (top === 'trunc') { const g = new THREE.CylinderGeometry(tw * 0.25, tw * 0.7, 18, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 9, 0); const m = new THREE.Mesh(g, copper); m.position.copy(pos).add(new THREE.Vector3(0, ty, 0)); this.scene.add(m); }
    else if (top === 'dome') { const g = new THREE.SphereGeometry(tw * 0.48, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); const m = new THREE.Mesh(g, copper); m.position.copy(pos).add(new THREE.Vector3(0, ty, 0)); this.scene.add(m); }
    else for (let k = 0; k < 4; k++) this.box(tw * (1 - k * 0.22), 6, tw * (1 - k * 0.22), copper, pos.clone().add(new THREE.Vector3(0, ty + k * 6, 0)));
  }
  pyramid(pos, w, hh, y, color, emi) {
    const g = new THREE.CylinderGeometry(0.01, w * 0.7071, hh, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, hh / 2, 0);
    const m = new THREE.Mesh(g, this.solid(color, new THREE.Color(color).multiplyScalar(emi * 10).getHex())); m.position.copy(pos).add(new THREE.Vector3(0, y, 0)); this.scene.add(m); return m;
  }
  spire(pos, y, hh, color) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(2.2, hh, 6), this.solid(color)); m.position.copy(pos).add(new THREE.Vector3(0, y + hh / 2, 0)); this.scene.add(m);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, y + hh, 0)), col: 0xff3020, size: 4, blink: 2.0 });
  }
  woolworth(pos) {
    const mat = this.material({ base: 0xd8d0bc, glass: 0x1a1e24, pitch: 1.6, floorH: 3.6, winW: 0.4, h: 241, style: 1, seed: 40 });
    this.box(60, 108, 46, mat, pos);
    this.box(26, 70, 26, mat, pos.clone().add(new THREE.Vector3(0, 108, 0)));
    this.box(20, 30, 20, mat, pos.clone().add(new THREE.Vector3(0, 178, 0)));
    for (const [dx, dz] of [[-9, -9], [9, -9], [9, 9], [-9, 9]]) { const p = new THREE.Mesh(new THREE.ConeGeometry(1.6, 14, 4), this.solid(0xd8d0bc)); p.position.copy(pos).add(new THREE.Vector3(dx, 215, dz)); this.scene.add(p); }
    this.pyramid(pos, 18, 26, 208, 0x4a7a66, 0.05);
    this.spire(pos, 234, 9, 0x4a7a66);
  }
  esb(pos) {
    const mat = this.material({ base: 0xc8c0b0, glass: 0x1a1e24, pitch: 1.8, floorH: 3.8, winW: 0.42, h: 381, style: 1, seed: 50 });
    this.box(130, 25, 60, mat, pos);
    this.box(90, 60, 50, mat, pos.clone().add(new THREE.Vector3(0, 25, 0)));
    this.box(60, 230, 44, mat, pos.clone().add(new THREE.Vector3(0, 85, 0)));
    this.box(40, 40, 32, mat, pos.clone().add(new THREE.Vector3(0, 315, 0)));
    this.box(24, 26, 24, mat, pos.clone().add(new THREE.Vector3(0, 355, 0)));
    // the lit crown and mast
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(4, 10, 40, 8), this.solid(0xd8d0c0, 0xf0e8d0)); crown.position.copy(pos).add(new THREE.Vector3(0, 401, 0)); this.scene.add(crown);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2, 62, 6), this.solid(0x404040)); mast.position.copy(pos).add(new THREE.Vector3(0, 452, 0)); this.scene.add(mast);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, 483, 0)), col: 0xff3020, size: 10, blink: 1.5 }, { pos: pos.clone().add(new THREE.Vector3(0, 395, 0)), col: 0xffe8c0, size: 40, blink: 0 });
  }
  chrysler(pos) {
    const mat = this.material({ base: 0xb8b4ac, glass: 0x1a1e24, pitch: 1.6, floorH: 3.6, winW: 0.4, h: 260, style: 1, seed: 60 });
    this.box(60, 70, 60, mat, pos);
    this.box(40, 190, 40, mat, pos.clone().add(new THREE.Vector3(0, 70, 0)));
    // the terraced steel crown, lit in arcs
    for (let k = 0; k < 6; k++) { const r = 20 - k * 3; const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, 9, 8), this.solid(0xc8c8c8, 0xd0d0c0)); m.position.copy(pos).add(new THREE.Vector3(0, 264 + k * 8, 0)); this.scene.add(m); }
    const sp = new THREE.Mesh(new THREE.ConeGeometry(1.8, 38, 6), this.solid(0xc8c8c8)); sp.position.copy(pos).add(new THREE.Vector3(0, 331, 0)); this.scene.add(sp);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, 290, 0)), col: 0xfff0d8, size: 34, blink: 0 });
  }

  buildLights() {
    const map = radial({ size: 32, inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)' });
    for (const l of this.lights) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: l.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.position.copy(l.pos); s.scale.setScalar(l.size);
      this.scene.add(s); l.s = s;
    }
  }

  // per frame, from the sky's shared state
  update(t, sh) {
    for (const m of this.mats) {
      const u = m.uniforms;
      u.night.value = sh.night; u.litFrac.value = sh.litFrac; u.time.value = t; u.fogCol.value.copy(sh.fogCol); u.fogDensity.value = sh.fogDensity;
      u.sunDir.value.copy(sh.sunDir); u.dayCol.value.copy(sh.dayCol); u.skyCol.value.copy(sh.skyCol); u.blackout.value = sh.blackout;
    }
    for (const m of this.solids) {
      const u = m.uniforms;
      u.night.value = sh.night; u.fogCol.value.copy(sh.fogCol); u.fogDensity.value = sh.fogDensity; u.sunDir.value.copy(sh.sunDir); u.dayCol.value.copy(sh.dayCol);
    }
    for (const l of this.lights) {
      const on = l.blink ? (Math.sin((t + (l.ph || 0)) * Math.PI * l.blink) > 0.2 ? 1 : 0.05) : 1;
      const cutAway = l.tower && l.pos.y > l.tower.pos.y + l.tower.mat.uniforms.cut.value;
      l.s.material.opacity = cutAway ? 0 : on * (0.25 + sh.night * 0.75) * (l.blink ? 1 : sh.night);
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
