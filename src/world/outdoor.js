// Shared pieces for everything in the outside (background) scene: one set of
// lighting/fog uniforms written once per frame by the Sky, the GLSL that
// shades with them (sun + sky/ground ambient, low smog with sun glare, sodium
// lamp pools, window grids), a merged-geometry kit with vertex colours, the
// one material all the small stuff uses, and instanced light glows.
// Colours are linear; the engine tonemaps (ACES) after the pass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const C = (r = 0, g = 0, b = 0) => new THREE.Color(r, g, b);
// shared uniform objects: materials reference these, so one write updates all
export const OUT = {
  oSun: { value: new THREE.Vector3(0, 1, 0) }, oSunCol: { value: C(1, 1, 1) }, oAmbSky: { value: C(0.2, 0.25, 0.3) }, oAmbGnd: { value: C(0.1, 0.09, 0.08) },
  oFogCol: { value: C(0.3, 0.4, 0.5) }, oFogDen: { value: 0.0002 }, oGlare: { value: C() }, oZen: { value: C() }, oHor: { value: C() },
  oNight: { value: 0 }, oTime: { value: 0 }, oLit: { value: 0.5 }, oBlackout: { value: 0 }, oBurn: { value: 0 }, oLamp: { value: 0 }, oPx: { value: 0.002 },
  // street lamp rows: (fixed x or z, spacing (> 0 runs along z, < 0 along x), first lamp, lamp height y)
  oLampRow: { value: [new THREE.Vector4(-1.2, 30, -25, -5.8), new THREE.Vector4(14.2, 30, -40, -5.8), new THREE.Vector4(-12.6, -34, -30, -5.8)] },
  // emergency flashers washing the street red and blue: (x, y, z, phase); oFlashK their strength
  oFlash: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, oFlashK: { value: 0 },
  // helicopter searchlights: source (xyz, on) and target (xyz, pool radius)
  oSpotP: { value: [new THREE.Vector4(), new THREE.Vector4()] }, oSpotT: { value: [new THREE.Vector4(0, -14, 0, 8), new THREE.Vector4(0, -14, 0, 8)] },
  // dust and smoke settled in the streets, and the blast's shock ring (x, z, radius, strength)
  oDust: { value: 0 }, oDustCol: { value: C(0.3, 0.27, 0.23) }, oShock: { value: new THREE.Vector4() },
};

export const OUT_GLSL = /* glsl */`
uniform vec3 oSun; uniform vec3 oSunCol; uniform vec3 oAmbSky; uniform vec3 oAmbGnd; uniform vec3 oFogCol; uniform float oFogDen; uniform vec3 oGlare;
uniform vec3 oZen; uniform vec3 oHor; uniform float oNight; uniform float oTime; uniform float oLit; uniform float oBlackout; uniform float oBurn; uniform float oLamp;
uniform vec4 oLampRow[3]; uniform vec4 oFlash[4]; uniform float oFlashK; uniform vec4 oSpotP[2]; uniform vec4 oSpotT[2]; uniform float oDust; uniform vec3 oDustCol; uniform vec4 oShock;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
// Lambert with a hint of wrap so the terminator isn't razor sharp at range
float band(float x){ return clamp((x + 0.06) / 1.06, 0.0, 1.0); }
vec3 outLight(vec3 alb, vec3 n){ return alb * (oSunCol * band(dot(n, oSun)) + mix(oAmbGnd, oAmbSky, n.y * 0.5 + 0.5)); }
// glass and wet things pick up the sky they face
vec3 skyRefl(vec3 r){ return mix(oHor, oZen, smoothstep(-0.05, 0.6, r.y)) + oGlare * pow(max(dot(r, oSun), 0.0), 24.0) * 2.0; }
// haze: thicker low down, thinner up high, bright toward the sun; dust settles in the streets
vec3 outFog(vec3 c, vec3 wp){
  vec3 d = wp - cameraPosition; float dist = length(d);
  float hk = mix(1.0, 0.45, smoothstep(0.0, 450.0, wp.y + 14.0));
  float f = 1.0 - exp(-dist * oFogDen * hk);
  float s = max(dot(d / dist, oSun), 0.0);
  c = mix(c, oFogCol + oGlare * (pow(s, 6.0) * 0.5 + pow(s, 40.0) * 0.9), f);
  if (oDust > 0.0) c = mix(c, oDustCol, (1.0 - exp(-dist * oDust * 0.006 * exp(-max(wp.y + 12.0, 0.0) / 26.0))) * 0.92);
  if (oShock.w > 0.0) { float sd = abs(length(wp.xz - oShock.xy) - oShock.z); c = mix(c, oDustCol * 1.6 + 0.04, smoothstep(45.0, 0.0, sd) * oShock.w * smoothstep(160.0, 0.0, wp.y + 14.0) * 0.85); }
  return c;
}
// the street's own light: sodium pools under the cobra-heads, emergency flashers, helicopter searchlights
vec3 lampPools(vec3 p, vec3 n){
  vec3 acc = vec3(0.0);
  if (p.z > -640.0 && p.z < 60.0 && p.x > -90.0 && p.x < 100.0) {
    if (oLamp > 0.01) for (int i = 0; i < 3; i++){
      vec4 r = oLampRow[i];
      bool alongZ = r.y > 0.0; float sp = abs(r.y);
      float u = alongZ ? p.z : p.x;
      float du = mod(u - r.z + sp * 0.5, sp) - sp * 0.5;
      vec3 L = alongZ ? vec3(r.x - p.x, r.w - p.y, -du) : vec3(-du, r.w - p.y, r.x - p.z);
      float d2 = dot(L, L);
      // pools with real gaps between them: inverse square, cut off before the next lamp
      float cut = max(1.0 - d2 / 520.0, 0.0);
      // the cobra-head throws its light down and out, not up the walls
      acc += vec3(1.0, 0.5, 0.16) * max(dot(n, L) * inversesqrt(d2), 0.0) * 140.0 * cut * cut / (d2 + 3.0) * oLamp * smoothstep(0.05, 0.6, L.y * inversesqrt(d2));
    }
    if (oFlashK > 0.0) for (int i = 0; i < 4; i++){
      vec4 fl = oFlash[i];
      vec3 L = fl.xyz - p; float d2 = dot(L, L);
      float ph = fract(oTime * 1.6 + fl.w);
      vec3 fc = ph < 0.5 ? vec3(1.0, 0.08, 0.04) : vec3(0.1, 0.2, 1.0);
      acc += fc * step(0.1, fract(ph * 2.0)) * max(dot(n, L) * inversesqrt(d2), 0.0) * 40.0 / (d2 + 4.0) * oFlashK;
    }
  }
  for (int i = 0; i < 2; i++){
    vec4 sp = oSpotP[i], st = oSpotT[i];
    if (sp.w < 0.01) continue;
    float r = length(p.xz - st.xz);
    vec3 L = sp.xyz - p;
    acc += vec3(0.9, 0.95, 1.0) * sp.w * smoothstep(st.w, st.w * 0.55, r) * max(dot(n, normalize(L)), 0.0) * 3.5;
  }
  return acc;
}
`;

// window grids shared by the skyline and the street facades.
// style: 0 brick, 1 limestone, 2 glass curtain, 3 aluminium grid, 4 ribbon, 5 black glass, 6 white brick, 7 loft (big panes)
export const FACADE_GLSL = /* glsl */`
void facadeStyle(float s, out vec2 cell, out vec2 win, out float glassy, out float office){
  if (s < 0.5) { cell = vec2(2.5, 3.3); win = vec2(0.42, 0.52); glassy = 0.15; office = 0.0; }
  else if (s < 1.5) { cell = vec2(2.3, 3.6); win = vec2(0.4, 0.5); glassy = 0.2; office = 0.6; }
  else if (s < 2.5) { cell = vec2(1.5, 3.9); win = vec2(0.86, 0.68); glassy = 1.0; office = 1.0; }
  else if (s < 3.5) { cell = vec2(1.55, 3.7); win = vec2(0.62, 0.62); glassy = 0.8; office = 1.0; }
  else if (s < 4.5) { cell = vec2(1.2, 3.6); win = vec2(0.98, 0.42); glassy = 0.6; office = 1.0; }
  else if (s < 5.5) { cell = vec2(1.5, 3.9); win = vec2(0.9, 0.84); glassy = 1.0; office = 1.0; }
  else if (s < 6.5) { cell = vec2(2.1, 2.9); win = vec2(0.46, 0.5); glassy = 0.25; office = 0.0; }
  else { cell = vec2(3.4, 4.2); win = vec2(0.7, 0.6); glassy = 0.3; office = 0.5; }
}
// returns the colour of a facade texel; f = (across, up) metres, wall = lit wall colour
vec3 facade(vec2 f, float style, float seed, float litMod, vec3 wall, vec3 n, vec3 wp, vec3 interior, out float winMask){
  vec2 cell, win; float glassy, office;
  facadeStyle(style, cell, win, glassy, office);
  vec2 g = f / cell;
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 m2 = clamp((win * 0.5 - abs(gf)) / fw + 0.5, 0.0, 1.0);
  float m = m2.x * m2.y;
  // too small to resolve: the average coverage
  float farK = smoothstep(0.35, 0.9, max(fw.x, fw.y));
  m = mix(m, win.x * win.y, farK);
  winMask = m;
  // glass: dark interior + the sky it faces
  vec3 v = normalize(wp - cameraPosition);
  vec3 r = reflect(v, n);
  float fres = 0.12 + 0.88 * pow(1.0 - abs(dot(v, n)), 4.0);
  float rnd = h31(vec3(gi, seed));
  vec3 glass = interior * (0.6 + 0.6 * rnd) + skyRefl(r) * mix(0.14, 0.6, glassy) * (0.5 + fres) * (0.85 + 0.3 * rnd);
  vec3 c = mix(wall, glass, m * (1.0 - oNight * 0.5));
  // sills and lintels catch a line of light on masonry
  if (glassy < 0.5) c *= 1.0 + 0.18 * (1.0 - farK) * smoothstep(0.06, 0.0, abs(gf.y + win.y * 0.5 + 0.06)) * step(abs(gf.x), win.x * 0.6);
  // night: floors of offices left on, homes in warm clusters, the odd TV
  float fl = h21(vec2(gi.y, seed));
  float room = h31(vec3(floor(gi.x / mix(3.0, 6.0, office)), gi.y, seed + 3.0));
  float p = oLit * litMod * mix(0.2 + 1.1 * fl, step(0.62, fl) * 1.7 + 0.08, office);
  float lit = step(room, p) * step(0.18, rnd);
  // incandescent homes, greenish office fluorescents, the odd blue TV
  vec3 wc = mix(vec3(1.0, 0.64, 0.3), vec3(0.72, 0.86, 0.7), office * step(0.25, h21(gi + seed)));
  wc = mix(wc, vec3(0.4, 0.55, 1.0), step(0.93, rnd) * (1.0 - office));
  // blinds half down on some
  float blind = mix(1.0, smoothstep(-0.05, 0.1, -gf.y + (h21(gi * 1.7 + seed) - 0.5) * 0.6), step(0.6, h21(gi + 7.0)));
  float bright = (0.55 + 0.9 * rnd) * mix(blind, 0.75, farK);
  // unresolved distance: blend the sparkle toward its expected value
  float litAvg = clamp(p, 0.0, 1.0) * 0.82;
  lit = mix(lit, mix(lit, litAvg, 0.6), farK);
  c += wc * m * lit * bright * oNight * 1.05;
  return c;
}
`;

// ---------------------------------------------------------------- the kit
// Collects geometry with per-vertex colour and an aux vec4
//   aux = (night glow, paint by instance colour, surface pattern, seed)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export class Kit {
  constructor() { this.parts = []; }
  // side: a second colour (and no surface pattern) for faces that aren't facing up
  add(geo, col, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, glow = 0, paint = 0, pat = 0, seed = 0, matrix, side } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    else { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m); }
    const n = g.attributes.position.count, c = new THREE.Color(col), c2 = side !== undefined ? new THREE.Color(side) : c, nm = g.attributes.normal;
    const ca = new Float32Array(n * 3), aa = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const up = side === undefined || nm.getY(i) > 0.5, cc = up ? c : c2;
      ca[i * 3] = cc.r; ca[i * 3 + 1] = cc.g; ca[i * 3 + 2] = cc.b; aa[i * 4] = glow; aa[i * 4 + 1] = paint; aa[i * 4 + 2] = up ? pat : 0; aa[i * 4 + 3] = seed;
    }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setAttribute('aux', new THREE.BufferAttribute(aa, 4));
    this.parts.push(g);
    return this;
  }
  // box standing on y (its bottom), centred on x/z
  box(x, y, z, w, h, d, col, o = {}) { return this.add(BOX, col, { ...o, x, y: y + h / 2, z, sx: w, sy: h, sz: d }); }
  cyl(x, y, z, rt, rb, h, seg, col, o = {}) { return this.add(cylGeo(rt, rb, seg), col, { ...o, x, y: y + h / 2, z, sy: h }); }
  geometry() { const g = mergeGeometries(this.parts, false); this.parts = []; return g; }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat); }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cyls = new Map();
function cylGeo(rt, rb, seg) { const k = `${rt}|${rb}|${seg}`; if (!cyls.has(k)) cyls.set(k, new THREE.CylinderGeometry(rt, rb, 1, seg, 1)); return cyls.get(k); }

// the one material for kit meshes (static, instanced, or both)
const SOLID_VS = /* glsl */`
attribute vec4 aux;
#ifdef INST_LIGHT
attribute float iLight;
#endif
varying vec3 vCol; varying vec4 vAux; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 col = color;
  vec4 w = vec4(position, 1.0);
  vec3 nn = normal;
  #ifdef USE_INSTANCING
    w = instanceMatrix * w; nn = mat3(instanceMatrix) * nn;
  #endif
  #ifdef USE_INSTANCING_COLOR
    col = mix(col, col * instanceColor, aux.y);
  #endif
  w = modelMatrix * w;
  vCol = col; vAux = aux; vN = normalize(mat3(modelMatrix) * nn); vW = w.xyz;
  #ifdef INST_LIGHT
    vAux.x *= iLight;
  #endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SOLID_FS = /* glsl */`
${OUT_GLSL}
${FACADE_GLSL}
varying vec3 vCol; varying vec4 vAux; varying vec3 vN; varying vec3 vW;
// ground surfaces drawn from world position
vec3 surface(float pat, float road, vec3 c, vec3 p, out float wet){
  wet = 0.0;
  // crisp texels (16 per metre) up close, like the rest of the world's textures
  if (max(fwidth(p.x), fwidth(p.z)) * 16.0 < 0.8) p.xz = (floor(p.xz * 16.0) + 0.5) / 16.0;
  if (pat < 1.5) {
    // asphalt: patches, tar seams, oil down the lanes, worn paint. road: 1 our cross street,
    // 2 West Broadway (runs along z), 3 the cross streets down it (centred on the nearest one)
    float n = vn2(p.xz * 0.35) * 0.6 + vn2(p.xz * 2.3) * 0.4;
    c *= 0.8 + 0.4 * n;
    c *= 1.0 - 0.35 * smoothstep(0.02, 0.0, abs(vn2(p.xz * vec2(0.9, 0.08)) - 0.5));
    bool wb = road > 1.5 && road < 2.5;
    float zc = floor((p.z + 104.0) / 88.0 + 0.5) * 88.0 - 104.0;
    float along = wb ? p.z : p.x, v = wb ? p.x - 6.5 : p.z - (road < 1.5 ? -10.0 : zc);
    float inter = wb ? max(step(abs(p.z - zc), 6.0) * step(p.z, -60.0), step(-16.0, p.z)) : 0.0;
    float worn = 0.55 + 0.45 * vn2(p.xz * 1.7);
    float yl = 0.0, wl = 0.0, cw = 0.0;
    if (wb) {
      yl = smoothstep(0.08, 0.05, abs(abs(v) - 0.13)) * (1.0 - inter);
      wl = smoothstep(0.07, 0.04, abs(abs(v) - 3.8)) * step(0.5, fract(along / 6.0)) * (1.0 - inter);
      float dz = abs(p.z - zc);
      cw = step(6.5, dz) * step(dz, 9.5) * step(p.z, -60.0) + step(-19.5, p.z) * step(p.z, -16.5);
      cw *= step(0.5, fract(v / 1.2)) * step(abs(v), 9.8);
      cw = max(cw, smoothstep(0.24, 0.18, abs(dz - 10.0)) * step(p.z, -60.0) * step(abs(v), 9.8));
    } else {
      wl = smoothstep(0.07, 0.04, abs(v)) * step(0.5, fract(along / 6.0));
      float dx = min(abs(p.x + 6.5), abs(p.x - 19.5));
      cw = step(dx, 1.6) * step(0.5, fract(v / 1.2)) * step(abs(v), 5.2);
    }
    c = mix(c, vec3(0.62, 0.42, 0.06), yl * worn);
    c = mix(c, vec3(0.6, 0.6, 0.56), max(wl, cw) * worn);
    float oil = smoothstep(0.55, 0.8, vn2(vec2(v * 1.5, along * 0.4))) * step(abs(abs(v) - 1.9), 1.0);
    c *= 1.0 - oil * 0.35;
    // manholes and steam vents down the lanes
    vec2 mh = vec2(mod(along + 9.0, 41.0) - 20.5, abs(v) - 1.9);
    c *= 1.0 - 0.3 * smoothstep(0.42, 0.36, abs(length(mh) - 0.38));
    wet = 0.25;
  } else if (pat < 2.5) {
    // concrete slabs with joints and gum spots
    vec2 q = p.xz / vec2(1.5, 1.5);
    vec2 j = abs(fract(q) - 0.5);
    float joint = smoothstep(0.47, 0.5, max(j.x, j.y));
    c *= 0.9 + 0.2 * h21(floor(q)) - joint * 0.3;
    c *= 1.0 - 0.25 * step(0.985, h21(floor(p.xz * 3.0)));
  } else if (pat < 3.5) {
    // brick pavers in herringbone-ish courses with a granite band every 8 m
    vec2 q = p.xz * vec2(4.6, 2.3);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 j = abs(fract(q) - 0.5);
    float joint = smoothstep(0.42, 0.5, max(j.x * 0.95, j.y));
    c *= (0.82 + 0.3 * h21(floor(q))) * (1.0 - joint * 0.35);
    float bandG = step(abs(mod(p.x + 4.0, 16.0) - 8.0), 0.35);
    c = mix(c, vec3(0.3, 0.29, 0.27), bandG);
  } else if (pat < 4.5) {
    // grass and soil
    float n = vn2(p.xz * 0.8) * 0.6 + vn2(p.xz * 5.0) * 0.4;
    c *= 0.7 + 0.6 * n;
  } else if (pat < 5.5) {
    // the far shore's ground: streets, plazas, a few dusty parks
    c *= 0.65 + 0.6 * vn2(p.xz * 0.015) * vn2(p.xz * 0.07 + 3.0);
  } else if (pat < 6.5) {
    // foliage: clumped leaves, darker inside the crown
    float n = vn2(p.xz * 2.7 + p.y * 1.9) * 0.55 + vn2(p.xy * 6.1 + p.z * 3.0) * 0.45;
    c *= 0.45 + 0.9 * n;
  } else if (pat < 7.5) {
    // weathered timber and rust streaks (piles, fenders, barges)
    c *= 0.7 + 0.5 * vn2(vec2(p.x * 3.0 + p.z * 3.0, p.y * 0.6));
    c *= 1.0 - 0.4 * smoothstep(-14.6, -15.2, p.y);
  }
  return c;
}
// at night the far streets glow sodium orange between the buildings
float streetGrid(vec3 p){
  vec2 q = p.xz / vec2(78.0, 240.0) + vec2(0.0, vn2(p.xz * 0.004) * 0.6);
  vec2 g = abs(fract(q) - 0.5);
  return max(smoothstep(0.43, 0.5, g.x), smoothstep(0.47, 0.5, g.y)) * (0.6 + 0.4 * vn2(p.xz * 0.05));
}
void main(){
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = vCol;
  float pat = vAux.z, wet = 0.0;
  if (pat > 0.5 && pat < 9.5) alb = surface(pat, vAux.w, alb, vW, wet);
  vec3 c = outLight(alb, n);
  if (pat > 7.5 && pat < 8.5) {
    // glass (cars, shelters): a dark interior and the sky
    vec3 v = normalize(vW - cameraPosition);
    c = c * 0.35 + skyRefl(reflect(v, n)) * (0.1 + 0.6 * pow(1.0 - abs(dot(v, n)), 4.0));
  }
  if (pat > 9.5) {
    // facades on the near buildings: world-aligned window grids from the street
    vec2 f = vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y + 14.0);
    float wm;
    if (abs(n.y) < 0.5) c = facade(f - vec2(0.0, 1.2), pat - 10.0, vAux.w, 1.0, c, n, vW, vec3(0.012, 0.011, 0.01), wm);
  }
  // wet-ish asphalt picks up a little sky at grazing angles
  if (wet > 0.0) { vec3 v = normalize(vW - cameraPosition); c += skyRefl(reflect(v, n)) * wet * pow(1.0 - abs(v.y), 6.0) * 0.5; }
  c += alb * lampPools(vW, n) * (pat > 5.5 && pat < 6.5 ? 0.35 : 1.0);
  // leaves glow when the sun is behind them
  if (pat > 5.5 && pat < 6.5) c += alb * oSunCol * pow(max(dot(normalize(vW - cameraPosition), oSun), 0.0), 3.0) * 0.5;
  c += vCol * vAux.x * oNight * 2.2;
  if (pat > 4.5 && pat < 5.5) c += vec3(1.0, 0.5, 0.16) * streetGrid(vW) * oNight * 0.7 * (1.0 - oBlackout * 0.6);
  gl_FragColor = vec4(outFog(c, vW), 1.0);
}`;

export function solidMaterial(extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: SOLID_VS, fragmentShader: SOLID_FS, uniforms: { ...OUT }, vertexColors: true, ...extra });
}

// ---------------------------------------------------------------- glows
// Instanced camera-facing light glows (lamps, aviation beacons, boat running
// lights, headlights). One draw call. mode: 0 night only, 1 always (blinking
// beacons), 2 scripted (intensity set from code)
const GLOW_VS = /* glsl */`
attribute vec3 iPos; attribute vec3 iCol; attribute vec4 iPar; // size, blink rate, phase, mode
uniform float oNight; uniform float oTime; uniform float oPx; uniform float oBlackout;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  vUv = position.xy;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float dist = -mv.z;
  float sz = max(iPar.x, dist * oPx * 5.0);
  mv.xy += position.xy * sz;
  float on = iPar.w < 0.5 ? smoothstep(0.25, 0.75, oNight) : iPar.w < 1.5 ? 0.35 + 0.65 * oNight : 1.0;
  if (iPar.y > 0.0) on *= step(0.25, fract(oTime * iPar.y + iPar.z)) * 0.95 + 0.05;
  // far lights stay small and bright: energy rather than size
  vA = on * clamp(iPar.x / sz, 0.2, 1.0) * (iPar.w > 1.5 ? 1.0 : 1.0 - oBlackout * 0.5 * step(iPar.w, 0.5));
  vCol = iCol;
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = /* glsl */`
uniform vec3 oFogCol; uniform float oFogDen;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main(){
  float r = length(vUv) * 2.0;
  float a = exp(-r * r * 5.0) * 0.8 + exp(-r * r * 60.0) * 1.6;
  if (a * vA < 0.003) discard;
  gl_FragColor = vec4(vCol * a * vA, 1.0);
}`;
export class Glows {
  constructor(scene, max = 512) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.col.setUsage(THREE.DynamicDrawUsage);
    this.par = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    g.setAttribute('iPos', this.pos); g.setAttribute('iCol', this.col); g.setAttribute('iPar', this.par);
    g.instanceCount = 0;
    this.geo = g; this.n = 0; this.max = max;
    const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: { ...OUT }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  add(p, col, size, { blink = 0, phase = 0, mode = 0, k = 1 } = {}) {
    const i = this.n++;
    if (i >= this.max) { this.n--; return -1; }
    const c = new THREE.Color(col).multiplyScalar(k);
    this.pos.setXYZ(i, p.x, p.y, p.z); this.col.setXYZ(i, c.r, c.g, c.b); this.par.setXYZW(i, size, blink, phase, mode);
    this.geo.instanceCount = this.n;
    this.pos.needsUpdate = this.col.needsUpdate = this.par.needsUpdate = true;
    return i;
  }
  move(i, x, y, z) { this.pos.setXYZ(i, x, y, z); this.pos.needsUpdate = true; }
  tint(i, r, g, b) { this.col.setXYZ(i, r, g, b); this.col.needsUpdate = true; }
}
