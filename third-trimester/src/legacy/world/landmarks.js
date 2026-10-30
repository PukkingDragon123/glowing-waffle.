// Ported from bengrim (src/world/city.js) and re-themed: the old true-scale Manhattan landmarks are
// gone — every tower here is fictional, built for the unnamed megacity across the river from
// Golden Lotus Mansions. The facade shader (fwidth-antialiased columns, spandrels, louvred mechanical
// bands, lit office floors, fire bands) and the builder helpers are the old ones.
// +x is along the river, -z is across it (downtown). Ground is the GROUND passed in (street level).
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { radial } from '../gfx/textures.js';

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
  float rag = (n2(vec2(vObj.x + vObj.z, y) * 0.15) - 0.5) * 14.0;
  if (y > cut + rag) discard;
  vec3 n = normalize(vN);
  bool roof = abs(n.y) > 0.5;
  float u = abs(n.x) > 0.5 ? vObj.z : vObj.x;
  if (style > 1.5) u = atan(vObj.x, vObj.z) * 30.0;            // round towers wrap around
  float fl = y / floorH;
  float fi = floor(fl), ff = fract(fl);
  float cx = u / pitch;
  float fw = max(fwidth(cx), 1e-4);
  float col = clamp((abs(fract(cx) - 0.5) - winW * 0.5) / fw + 0.5, 0.0, 1.0);
  col = mix(col, 1.0 - winW, smoothstep(0.35, 1.0, fw));
  float fwf = max(fwidth(fl), 1e-4);
  float spand = clamp((abs(ff - 0.5) - 0.36) / fwf + 0.5, 0.0, 1.0);
  spand = mix(spand, 0.28, smoothstep(0.35, 1.0, fwf));
  float metal = max(col, spand);
  // tall towers: louvred mechanical floors at fixed fractions of the height, a solid lobby podium
  float mech = 0.0;
  if (style < 0.5) {
    float hy = y / height;
    mech = step(0.36, hy) * step(hy, 0.38) + step(0.66, hy) * step(hy, 0.68) + step(0.95, hy) * step(hy, 0.975);
    if (y < 24.0) metal = max(metal, 0.65);
    metal = max(metal, mech * 0.9);
  }
  if (roof) metal = 1.0;
  float ndl = dot(n, normalize(sunDir));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(v, n)), 3.0);
  vec3 refl = skyCol * (1.0 - night * 0.8);
  vec3 metalC = base * dayCol * (0.55 + 0.45 * clamp(ndl, 0.0, 1.0)) + refl * (0.2 + fres * 0.5);
  vec3 glassC = glassCol * (0.4 + fres) + refl * 0.12;
  vec3 c = mix(glassC, metalC, metal);
  if (mech > 0.0) c *= 0.7;
  float bay = floor(cx / 3.0);
  float r = hash(vec3(fi, bay, seed + (abs(n.x) > 0.5 ? 1.0 : 2.0)));
  float lit = step(r, litFrac * (1.0 - blackout * step(0.5, hash(vec3(fi, 7.0, seed))))) * (1.0 - metal) * (1.0 - mech) * step(24.0, y);
  vec3 office = mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.85, 0.6), step(0.7, hash(vec3(fi, bay, seed + 9.0))));
  c = mix(c, c * 0.1 + vec3(0.012, 0.014, 0.02), night);
  c += lit * office * night * 1.7;
  if (burn > 0.0) {
    float d = y - fireY;
    float band = smoothstep(26.0, 0.0, abs(d)) * burn;
    float fl2 = 0.55 + 0.45 * sin(time * 8.0 + u * 0.7) * sin(time * 5.1 + y * 0.3);
    c = mix(c, c * 0.15, smoothstep(0.0, 60.0, d) * burn * 0.8);
    c += band * vec3(2.2, 0.75, 0.18) * fl2 * (1.0 - metal * 0.5);
  }
  c += vec3(1.6, 0.5, 0.1) * smoothstep(10.0, 0.0, cut + rag - y) * step(cut, height - 1.0);
  float dist = length(vWorld - cameraPosition);
  c = mix(c, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;
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

// Fictional skyline. `towers` are the crash targets (index order is the public API):
//   0 Sky Lotus Tower · 1 Golden Needle · 2 Orchid Spire · 3 Mercury Exchange
export class Landmarks {
  constructor(scene, ground = -14) {
    this.scene = scene; this.ground = ground;
    this.mats = []; this.solids = []; this.towers = []; this.lights = [];
    const W = (x, z) => new THREE.Vector3(x, ground, z);
    this.towers.push(this.lotusTower(W(-70, -860), 360, 0));
    this.towers.push(this.needle(W(260, -1060), 300, 1));
    this.towers.push(this.orchid(W(-430, -1120), 262, 2));
    this.towers.push(this.exchange(W(70, -700), 196, 3));
    // supporting cast
    this.slab(W(-180, -760), 44, 150, 36, 0x6c6a66, 3.0, 3.6, 7);
    this.slab(W(150, -820), 40, 132, 30, 0x7a4a40, 3.0, 3.7, 8);
    this.slab(W(-300, -980), 46, 210, 44, 0x1c1c20, 3.0, 3.8, 11);        // Bank of Earth, black glass
    this.slab(W(420, -1300), 50, 230, 46, 0x8a8278, 2.6, 3.6, 12);
    this.pyramid(W(420, -1300), 50, 26, 230, 0x3a6a56, 0.02);
    this.boardTower(W(-980, -1700), 340);                                  // the one with ears
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
  tower(mesh, mat, pos, h, extras = []) { return { mesh, mat, pos: pos.clone(), h, extras }; }

  // Sky Lotus: a chamfered square shaft (the old extruded plan), louvred bands, a crown of lotus petals and a mast.
  lotusTower(pos, h, i) {
    const mat = this.material({ base: 0xb8b2a6, glass: 0x10141a, pitch: 1.4, floorH: 3.66, winW: 0.46, h, style: 0, seed: 100 + i });
    const s = 30, c = 7;
    const sh = new THREE.Shape();
    sh.moveTo(-s + c, -s); sh.lineTo(s - c, -s); sh.lineTo(s, -s + c); sh.lineTo(s, s - c); sh.lineTo(s - c, s); sh.lineTo(-s + c, s); sh.lineTo(-s, s - c); sh.lineTo(-s, -s + c); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, steps: 1 }); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.copy(pos); this.scene.add(m);
    const t = this.tower(m, mat, pos, h);
    const petal = this.solid(0xd8c8a8, 0x6a4a28);
    for (let k = 0; k < 8; k++) {
      const pg = new THREE.ConeGeometry(9, 46, 4, 1); pg.translate(0, 23, 0); pg.rotateZ(-0.35); pg.translate(14, 0, 0); pg.rotateY((k / 8) * Math.PI * 2);
      const pm = new THREE.Mesh(pg, petal); pm.position.copy(pos).add(new THREE.Vector3(0, h, 0)); this.scene.add(pm); t.extras.push(pm);
    }
    const am = this.solid(0x3a3a3e);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, 90, 8), am); mast.position.copy(pos).add(new THREE.Vector3(0, h + 45, 0)); this.scene.add(mast); t.extras.push(mast);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, h + 92, 0)), col: 0xff2a10, size: 9, blink: 1.2, tower: t }, { pos: pos.clone().add(new THREE.Vector3(0, h + 50, 0)), col: 0xff2a10, size: 6, blink: 1.2, ph: 0.6, tower: t });
    for (const [dx, dz] of [[-26, -26], [26, -26], [26, 26], [-26, 26]]) this.lights.push({ pos: pos.clone().add(new THREE.Vector3(dx, h + 4, dz)), col: 0xff3a20, size: 4, blink: 1.6, ph: i * 0.3, tower: t });
    return t;
  }
  // Golden Needle: a round shaft with a gilded ring crown and a spire.
  needle(pos, h, i) {
    const mat = this.material({ base: 0xd0bc90, glass: 0x12161c, pitch: 1.6, floorH: 3.6, winW: 0.42, h, style: 2, seed: 200 + i });
    const g = new THREE.CylinderGeometry(19, 23, h, 24, 1); g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, mat); m.position.copy(pos); this.scene.add(m);
    const t = this.tower(m, mat, pos, h);
    const gold = this.solid(0xd8b04a, 0xf0c060);
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(24 - k * 5, 1.6, 6, 32), gold); r.rotation.x = Math.PI / 2; r.position.copy(pos).add(new THREE.Vector3(0, h + 4 + k * 9, 0)); this.scene.add(r); t.extras.push(r); }
    const sp = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 8), gold); sp.position.copy(pos).add(new THREE.Vector3(0, h + 30, 0)); this.scene.add(sp); t.extras.push(sp);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, h + 61, 0)), col: 0xff3020, size: 8, blink: 1.4, tower: t }, { pos: pos.clone().add(new THREE.Vector3(0, h + 14, 0)), col: 0xffe0a0, size: 30, blink: 0, tower: t });
    return t;
  }
  // Orchid Spire: gothic setbacks with a green pyramid and pinnacles (the old Woolworth massing, renamed).
  orchid(pos, h, i) {
    const mat = this.material({ base: 0xd8d0bc, glass: 0x1a1e24, pitch: 1.6, floorH: 3.6, winW: 0.4, h, style: 1, seed: 300 + i });
    const m = this.box(56, h * 0.45, 44, mat, pos);
    const t = this.tower(m, mat, pos, h);
    t.extras.push(this.box(30, h * 0.3, 30, mat, pos.clone().add(new THREE.Vector3(0, h * 0.45, 0))));
    t.extras.push(this.box(22, h * 0.12, 22, mat, pos.clone().add(new THREE.Vector3(0, h * 0.75, 0))));
    for (const [dx, dz] of [[-10, -10], [10, -10], [10, 10], [-10, 10]]) { const p = new THREE.Mesh(new THREE.ConeGeometry(1.8, 16, 4), this.solid(0xd8d0bc)); p.position.copy(pos).add(new THREE.Vector3(dx, h * 0.87 + 8, dz)); this.scene.add(p); t.extras.push(p); }
    t.extras.push(this.pyramid(pos, 20, 30, h * 0.87, 0x4a7a66, 0.05));
    this.spire(pos, h * 0.87 + 30, 10, 0x4a7a66);
    return t;
  }
  // Mercury Exchange: granite and glass with setbacks and a copper dome (the old WFC massing).
  exchange(pos, h, i) {
    const w = 46;
    const mat = this.material({ base: 0x9a8e7c, glass: 0x1a242c, pitch: 2.4, floorH: 3.8, winW: 0.5, h, style: 1, seed: 400 + i });
    const m = this.box(w, h * 0.82, w, mat, pos);
    const t = this.tower(m, mat, pos, h);
    t.extras.push(this.box(w * 0.86, h * 0.1, w * 0.86, mat, pos.clone().add(new THREE.Vector3(0, h * 0.82, 0))));
    t.extras.push(this.box(w * 0.72, h * 0.08, w * 0.72, mat, pos.clone().add(new THREE.Vector3(0, h * 0.92, 0))));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.72 * 0.48, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.solid(0x5a7a6a, 0x223028));
    dome.position.copy(pos).add(new THREE.Vector3(0, h, 0)); this.scene.add(dome); t.extras.push(dome);
    return t;
  }
  // The Board's tower, far upriver: a black slab whose crown is two triangular "ears".
  boardTower(pos, h) {
    const mat = this.material({ base: 0x2a2a30, glass: 0x0c0e12, pitch: 2.2, floorH: 3.8, winW: 0.5, h, style: 1, seed: 777 });
    this.box(60, h, 40, mat, pos);
    const ear = this.solid(0x1c1c22, 0xff8a2a);
    for (const s of [-1, 1]) { const g = new THREE.ConeGeometry(14, 40, 3); g.translate(0, 20, 0); const e = new THREE.Mesh(g, ear); e.position.copy(pos).add(new THREE.Vector3(s * 18, h, 0)); this.scene.add(e); }
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(-18, h + 38, 0)), col: 0xff8a2a, size: 10, blink: 0.5 }, { pos: pos.clone().add(new THREE.Vector3(18, h + 38, 0)), col: 0xff8a2a, size: 10, blink: 0.5, ph: 1 });
  }
  slab(pos, w, h, d, color, pitch, floorH, seed) {
    const mat = this.material({ base: color, glass: 0x12161c, pitch, floorH, winW: 0.55, h, style: 1, seed });
    return this.box(w, h, d, mat, pos);
  }
  pyramid(pos, w, hh, y, color, emi) {
    const g = new THREE.CylinderGeometry(0.01, w * 0.7071, hh, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, hh / 2, 0);
    const m = new THREE.Mesh(g, this.solid(color, new THREE.Color(color).multiplyScalar(emi * 10).getHex())); m.position.copy(pos).add(new THREE.Vector3(0, y, 0)); this.scene.add(m); return m;
  }
  spire(pos, y, hh, color) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(2.2, hh, 6), this.solid(color)); m.position.copy(pos).add(new THREE.Vector3(0, y + hh / 2, 0)); this.scene.add(m);
    this.lights.push({ pos: pos.clone().add(new THREE.Vector3(0, y + hh, 0)), col: 0xff3020, size: 4, blink: 2.0 });
  }
  buildLights() {
    const map = radial({ size: 32, inner: 'rgba(255,255,255,1)', outer: 'rgba(255,255,255,0)' });
    for (const l of this.lights) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: l.col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.position.copy(l.pos); s.scale.setScalar(l.size); s.layers.set(2);
      this.scene.add(s); l.s = s;
    }
  }
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
      l.s.material.opacity = on * (0.25 + sh.night * 0.75) * (l.blink ? 1 : sh.night);
    }
  }
  // fire band through the impact floors (towers stay standing in this game)
  setFire(i, burn, y) { const u = this.towers[i].mat.uniforms; u.burn.value = burn; u.fireY.value = y; }
  reset() { for (let i = 0; i < this.towers.length; i++) this.setFire(i, 0, 0); }
}
