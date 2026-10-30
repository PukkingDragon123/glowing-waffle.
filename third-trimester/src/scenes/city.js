// The city around Golden Lotus Mansions — ported from bengrim's outdoor scene (src/world/sky.js,
// city.js, ship.js, debris.js; legacy copies in src/legacy/world/). Room 1407 sits at the world
// origin ~44 m up (street level y = -44) on the near bank of a wide river; downtown is across it
// (-z). All towers are fictional. Kept from bengrim: the sky shader (clouds, stars, aurora, burn glow,
// smoke), the instanced facade shader, the river with its shock ring, the landmark facade shader,
// the 520 m carrier that tears into rigid parts, and the big-scale debris/smoke/fire.
//   const city = createCityBackdrop(); scene.add(city.group); city.update(dt, t); city.setTimeOfDay(21.5); city.setDamage(2)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, clamp, smoothstep } from '../legacy/core/util.js';
import { makeCanvas, toTexture, radial } from '../legacy/gfx/textures.js';
import { Landmarks } from '../legacy/world/landmarks.js';
import { Ship } from '../legacy/world/ship.js';
import { Debris } from '../legacy/world/debris.js';
import { cap, sph, ell, rgb, meshSpec, toGeometry } from '../gfx/sdf.js';

export const GROUND = -44;

// ------------------------------------------------------------------ shaders
const FACADE_VERT = /* glsl */`
#ifdef USE_INSTANCING
attribute vec3 iTint; attribute vec2 iInfo;
#endif
uniform vec3 uTint; uniform vec2 uInfo;
varying vec3 vWorld; varying vec3 vN; varying vec3 vTint; varying vec2 vInfo;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix; vTint = iTint; vInfo = iInfo;
#else
  vTint = uTint; vInfo = uInfo;
#endif
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xyz; vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FACADE_FRAG = /* glsl */`
uniform float uNight; uniform float uTime; uniform vec3 uSky; uniform vec3 uHaze; uniform vec3 uSunDir; uniform float uHazeDensity; uniform float uGround;
uniform vec2 uCellOff; uniform vec4 uWin; uniform float uCellW;
uniform vec4 uImpacts[4]; uniform float uImpactCount; uniform float uDark;
varying vec3 vWorld; varying vec3 vN; varying vec3 vTint; varying vec2 vInfo;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  float roof = step(0.6, n.y);
  vec2 f = abs(n.x) > 0.5 ? vec2(vWorld.z * sign(n.x), vWorld.y - uGround) : vec2(-vWorld.x * sign(n.z), vWorld.y - uGround);
  float cw = uCellW > 0.0 ? uCellW : mix(1.8, 3.1, vInfo.y);
  vec2 g = (f + uCellOff) / vec2(cw, 3.3);
  vec2 cell = floor(g), lc = fract(g);
  float win = step(uWin.x, lc.x) * step(lc.x, uWin.y) * step(uWin.z, lc.y) * step(lc.y, uWin.w);
  if (vInfo.y > 0.8) win = step(0.3, lc.y) * step(lc.y, 0.8);                 // ribbon glazing
  float seed = vInfo.x;
  float face = floor(n.x * 3.0 + n.z * 7.0);
  float r = h21(cell + seed * 17.0 + face * 31.0);
  float lit = step(1.0 - mix(0.05, 0.3, uNight) * (1.0 - uDark), r);
  float fl = h21(cell * 1.7 + seed + 3.1);
  vec3 warm = fl > 0.72 ? vec3(0.78, 0.88, 1.0) : vec3(1.0, 0.7, 0.4);
  if (fl > 0.95) warm = vec3(0.45, 0.65, 1.3) * (0.65 + 0.35 * sin(uTime * 9.0 + r * 40.0));   // a TV
  if (fl < 0.03) warm *= step(0.5, fract(uTime * 0.7 + r * 5.0)) * 0.8 + 0.2;                 // a dying tube
  vec3 glass = mix(uSky * 0.5, vec3(0.06, 0.08, 0.1), 0.45 + 0.45 * h21(cell * 1.3 + seed));
  vec3 winCol = lit > 0.5 ? warm * mix(0.4, 1.12, uNight) * (0.75 + 0.25 * h21(cell + 2.0)) : glass * mix(1.0, 0.1, uNight);
  float sun = max(dot(n, uSunDir), 0.0);
  float up = 0.5 + 0.5 * n.y;
  vec3 wall = vTint * (mix(0.06, 0.95, 1.0 - uNight) * (0.5 + 0.5 * sun) + 0.025 * up);
  wall += vTint * vec3(0.10, 0.05, 0.02) * uNight * (1.0 - clamp((vWorld.y - uGround) / 120.0, 0.0, 1.0)); // street glow on walls
  float slab = smoothstep(0.0, 0.06, lc.y) * smoothstep(1.0, 0.94, lc.y);
  wall *= mix(0.72, 1.0, slab);
  wall *= 0.82 + 0.18 * h21(vec2(cell.x, seed));
  wall *= 1.0 - 0.25 * smoothstep(0.0, 1.0, h21(vec2(cell.x * 3.0, floor(cell.y / 4.0))) ) * (1.0 - lc.y);   // rain streaks
  vec3 col = mix(wall, winCol, win * (1.0 - roof));
  if (roof < 0.5 && f.y < 4.2) {     // ground-floor shophouses
    vec3 sc = mix(vec3(1.0, 0.55, 0.25), vec3(0.4, 1.0, 0.75), step(0.7, h21(vec2(cell.x, 9.0) + seed)));
    float fr = step(0.7, f.y) * step(f.y, 3.4) * step(0.08, lc.x) * step(lc.x, 0.92);
    col = mix(col, sc * mix(0.35, 1.3, uNight), fr * 0.9);
  }
  if (roof > 0.5) col = vTint * mix(0.42, 0.1, uNight) * (0.85 + 0.15 * h21(floor(vWorld.xz * 0.5)));
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uImpactCount) break;
    vec4 im = uImpacts[i]; float d = length(vWorld - im.xyz) / im.w;
    if (d < 1.0) {
      col = mix(col, vec3(0.025, 0.02, 0.02), smoothstep(1.0, 0.45, d));
      float fire = (1.0 - d) * (0.55 + 0.45 * sin(uTime * 9.0 + vWorld.y * 0.7 + vWorld.x * 0.3));
      col += vec3(3.2, 0.95, 0.15) * fire * win * step(0.25, h21(cell + 7.0));
    }
  }
  float dist = length(vWorld - cameraPosition);
  float hz = (1.0 - exp(-dist * uHazeDensity)) * mix(1.0, 0.55, clamp((vWorld.y - uGround) / 260.0, 0.0, 1.0));
  col = mix(col, uHaze, clamp(hz, 0.0, 0.96));
  gl_FragColor = vec4(col, 1.0);
}`;

const BEAM_VERT = /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FRAG = /* glsl */`uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() { float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float a = (1.0 - edge) * uOpacity * (0.35 + 0.65 * (1.0 - vUv.y)) * (0.8 + 0.2 * sin(vUv.y * 40.0 - uTime * 8.0));
  gl_FragColor = vec4(uColor * a, a); }`;
const POINT_VERT = /* glsl */`attribute vec4 aData; attribute vec3 aColor; uniform float uTime; uniform float uScale; varying vec3 vColor; varying float vA;
void main() {
  vec3 p = position;
  // aData: x = travel axis (0 none, 1 x, 2 z), y = speed, z = phase, w = blink rate
  if (aData.x > 0.5) { float L = 3000.0; float s = mod(aData.z + uTime * aData.y, L) - L * 0.5; if (aData.x < 1.5) p.x = s; else p.z = s; }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uScale * 2.2 / -mv.z, 1.5, 9.0);
  vA = aData.w > 0.0 ? step(0.55, fract(uTime * aData.w + aData.z)) : 1.0;
  vColor = aColor; gl_Position = projectionMatrix * mv; }`;
const POINT_FRAG = /* glsl */`varying vec3 vColor; varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vColor * a, a); }`;
// ------------------------------------------------------------------ textures
function signTexture(kind) {
  const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const panel = (bg, border) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = border; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14); };
  const txt = (s, x, y, size, col, font = 'Big Shoulders Stencil, Impact, sans-serif', weight = 800, align = 'center') => {
    const maxW = (align === 'center' ? Math.min(x, W - x) * 2 : W - x) - 36;
    do { g.font = `${weight} ${size}px ${font}`; size -= 2; } while (g.measureText(s).width > maxW && size > 8);
    g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, x, y); };
  switch (kind) {
    case 'noodle': panel('#d8261e', '#ffd23a'); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(100, 128, 72, 0, 7); g.fill(); g.strokeStyle = '#d8261e'; g.lineWidth = 6; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(52, 100 + i * 10); g.bezierCurveTo(80, 80 + i * 10, 120, 130 + i * 10, 150, 100 + i * 10); g.stroke(); }
      txt('LUCKY NOODLE', 330, 92, 66, '#fff'); txt('3 MINUTES TO HAPPINESS', 330, 160, 30, '#ffd23a', 'Spectral, serif', 600); break;
    case 'lifeline': panel('#13306b', '#e9eef8'); g.fillStyle = '#e9eef8'; g.font = '120px serif'; txt('☎', 92, 130, 130, '#ffcc33', 'serif', 400); txt('LIFELINE 24', 320, 96, 70, '#ffffff'); txt('WE ANSWER EVERYTHING', 320, 162, 30, '#9fc1ff', 'Spectral, serif', 600); break;
    case 'quikmart': panel('#16843f', '#ffffff'); txt('QuikMart', 256, 96, 92, '#ffffff', 'Spectral, serif', 800); txt('DELIVERY IN 30 MIN OR IT\'S FREE*', 256, 170, 30, '#d5ffd9', 'Big Shoulders Stencil, sans-serif', 600); txt('*it is never free', 256, 214, 18, '#a3e8ad', 'Spectral, serif', 400); break;
    case 'dtp': panel('#121212', '#ff7a1a'); g.fillStyle = '#ff7a1a'; g.fillRect(28, 28, 120, 200); txt('!', 88, 128, 160, '#121212'); txt('REPORT ANYTHING', 330, 82, 52, '#ff7a1a'); txt('THAT GLOWS', 330, 140, 64, '#ffffff'); txt('DEPT. OF TERRESTRIAL PURITY', 330, 204, 22, '#ff7a1a', 'Spectral, serif', 600); break;
    case 'karaoke': panel('#2a0b2f', '#ff4fd8'); txt('SOI 7', 256, 70, 56, '#ffe14f'); txt('KARAOKE', 256, 140, 96, '#ff4fd8'); txt('VIP ROOMS · 24 HRS · NO SINGING TALENT REQUIRED', 256, 214, 18, '#ffd6f7', 'Spectral, serif', 600); break;
    case 'khaoman': panel('#f2c230', '#7a2f12'); txt('KHAO MAN GAI', 256, 90, 78, '#7a2f12'); txt('ข้าวมันไก่ · 24 HRS', 256, 168, 40, '#7a2f12', 'sans-serif', 700); break;
    case 'bank': panel('#0d0d0d', '#d4af37'); txt('FIRST BANK OF EARTH', 256, 110, 54, '#d4af37', 'Spectral, serif', 700); txt('Your money is safe from people.', 256, 172, 26, '#efe3b0', 'Spectral, serif', 400); break;
    case 'massage': panel('#11221d', '#57f2c6'); txt('THAI ✦ FOOT ✦ OIL', 256, 96, 50, '#57f2c6'); txt('MASSAGE', 256, 168, 80, '#ffffff'); break;
    case 'catfood': panel('#1d2a52', '#ff9f3a'); txt('PURRFECT PÂTÉ', 256, 92, 60, '#ff9f3a'); txt('Approved by the Board.', 256, 168, 34, '#ffffff', 'Spectral, serif', 600); break;
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ------------------------------------------------------------------ ships
const shipMats = {};
function mats() {
  if (shipMats.hull) return shipMats;
  shipMats.hull = new THREE.MeshStandardMaterial({ color: 0x8e93a6, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.4 });
  shipMats.dark = new THREE.MeshStandardMaterial({ color: 0x2b2d36, metalness: 0.7, roughness: 0.4 });
  shipMats.glowG = new THREE.MeshStandardMaterial({ color: 0x0a1a10, emissive: 0x5dffb0, emissiveIntensity: 3.0 });
  shipMats.glowP = new THREE.MeshStandardMaterial({ color: 0x150a20, emissive: 0xb36bff, emissiveIntensity: 2.5 });
  shipMats.dome = new THREE.MeshPhysicalMaterial({ color: 0x6a4dbb, emissive: 0x3a1a77, emissiveIntensity: 1.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 });
  return shipMats;
}
export function makeBeam(radius = 12, height = 60, color = 0x8dffcf) {
  const g = new THREE.CylinderGeometry(radius * 0.25, radius, height, 32, 1, true); g.translate(0, -height / 2, 0);
  const m = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(1.6) }, uOpacity: { value: 0.6 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.layers.set(2); mesh.renderOrder = 11; return mesh;
}
export function makeSaucer({ size = 14 } = {}) {
  const M = mats(), grp = new THREE.Group();
  const prof = [[0, -2.6], [4, -2.4], [9, -1.5], [12.8, -0.5], [14, 0], [13.6, 0.5], [10, 1.5], [6, 2.2], [0, 2.4]].map(([x, y]) => new THREE.Vector2(x * size / 14, y * size / 14));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), M.hull); hull.castShadow = true; grp.add(hull);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.985, size * 0.035, 8, 64), M.dark); ring.rotation.x = Math.PI / 2; grp.add(ring);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(size * 0.035, 10, 8), M.glowG, 18);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; lights.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * size * 0.97, size * 0.02, Math.sin(a) * size * 0.97)); }
  grp.add(lights);
  const panels = new THREE.Mesh(new THREE.TorusGeometry(size * 0.55, size * 0.02, 6, 48), M.glowP); panels.rotation.x = Math.PI / 2; panels.position.y = size * 0.13; grp.add(panels);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(size * 0.32, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.dome); dome.position.y = size * 0.16; grp.add(dome);
  const core = new THREE.Mesh(new THREE.CircleGeometry(size * 0.22, 32), M.glowG); core.rotation.x = Math.PI / 2; core.position.y = -size * 0.186; grp.add(core);
  const beam = makeBeam(size * 0.8, size * 5); beam.position.y = -size * 0.18; beam.visible = false; grp.add(beam);
  return { group: grp, beam, lights, kind: 'saucer', size };
}
export function makeCruiser({ length = 90 } = {}) {
  const M = mats(), grp = new THREE.Group(), s = length / 90;
  const prof = [[0, -45], [3.5, -43], [7.5, -33], [9, -18], [9.2, 12], [7.5, 30], [4, 41], [0, 45]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), M.hull); hull.rotation.x = Math.PI / 2; hull.scale.set(1, 1, 0.62); grp.add(hull);
  const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(2.4 * s, 50 * s, 6, 12), M.dark); ridge.rotation.x = Math.PI / 2; ridge.position.set(0, 5.4 * s, -4 * s); grp.add(ridge);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(22 * s, -10 * s); finShape.lineTo(24 * s, -16 * s); finShape.lineTo(4 * s, -14 * s); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 1.2 * s, bevelEnabled: true, bevelSize: 0.4 * s, bevelThickness: 0.4 * s, bevelSegments: 2 });
  for (const sd of [1, -1]) { const fin = new THREE.Mesh(finGeo, M.hull); fin.rotation.set(Math.PI / 2, 0, sd > 0 ? 0 : Math.PI); fin.position.set(sd * 6 * s, 0, -6 * s); fin.scale.y = sd; grp.add(fin); }
  for (const sd of [1, -1]) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.6 * s, 60 * s), M.glowG); strip.position.set(sd * 8.6 * s, 0.8 * s, 0); grp.add(strip); }
  const eng = new THREE.Mesh(new THREE.TorusGeometry(4.2 * s, 1.1 * s, 10, 32), M.glowP); eng.position.z = -44 * s; grp.add(eng);
  const beam = makeBeam(14 * s, 90 * s, 0xb68bff); beam.position.set(0, -5 * s, 6 * s); beam.visible = false; grp.add(beam);
  return { group: grp, beam, kind: 'cruiser', size: length * 0.5 };
}

// DTP helicopter: black with an orange stripe, blinking lights, searchlight cone.
export function makeHeli() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.45 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff6a12, roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, clearcoat: 1, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 3.2, 8, 16), black); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.9); g.add(body);
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(1.27, 1.2, 8, 16), orange); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1, 1, 0.91); stripe.position.z = -0.6; g.add(stripe);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); canopy.rotation.x = Math.PI / 2.4; canopy.position.set(0, 0.25, 2.0); g.add(canopy);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 6, 10), black); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.35, -4.6); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), black); fin.position.set(0, 1.0, -7.4); g.add(fin);
  for (const sd of [1, -1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6), black); sk.rotation.x = Math.PI / 2; sk.position.set(sd * 1.05, -1.45, 0.2); g.add(sk); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 8), black); mast.position.y = 1.5; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 1.85;
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 6.2), black); b.position.z = 3.1; const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI) / 2; arm.add(b); rotor.add(arm); }
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.18), black); tailRotor.position.set(0.25, 1.0, -7.5); g.add(tailRotor);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.1) })); red.position.set(0, -1.15, 0); g.add(red);
  const cone = makeBeam(6, 40, 0xfff4d8); cone.position.set(0, -1.2, 1.6); cone.rotation.x = 0.35; cone.material.uniforms.uOpacity.value = 0.22; g.add(cone);
  return { group: g, rotor, tailRotor, red, cone };
}

// ------------------------------------------------------------------ ported from bengrim's Sky (src/world/sky.js)
const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 groundCol; uniform vec3 sunCol;
uniform float time; uniform float cloudCover; uniform vec3 cloudCol; uniform float stars; uniform float sunVis; uniform float smoke; uniform vec3 smokeCol;
uniform float lights; uniform float burnGlow; uniform float flash; uniform float paw;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, groundCol, smoothstep(0.0, -0.08, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunCol * (pow(s, 900.0) * 40.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.25) * sunVis;
  if (h > 0.005) {
    vec2 p = d.xz / (h + 0.08) * 0.9 + vec2(time * 0.004, time * 0.0015);
    float c = fbm(p * 1.6);
    float cov = smoothstep(1.0 - cloudCover, 1.05 - cloudCover * 0.4, c);
    vec3 cc = cloudCol * (0.75 + 0.35 * fbm(p * 4.0 + 3.0)) + sunCol * pow(s, 8.0) * 0.5 * sunVis;
    // the burning city lights the bellies of the clouds from below, strongest across the river
    float across = smoothstep(0.2, -0.9, d.z);
    cc += vec3(0.9, 0.32, 0.1) * burnGlow * across * (0.35 + 0.65 * (1.0 - fbm(p * 2.2 + 9.0))) * smoothstep(0.6, 0.02, h);
    cc += vec3(0.7, 0.9, 1.0) * flash * smoothstep(0.4, 0.8, fbm(p * 0.9 + 21.0)) * 2.5;
    // the clouds part where the Board's paw comes through
    float hole = smoothstep(0.86, 0.97, dot(d, normalize(vec3(-0.12, 0.62, -0.78)))) * paw;
    cov *= 1.0 - hole;
    col = mix(col, cc, cov * smoothstep(0.0, 0.12, h) * 0.95);
    col += vec3(1.2, 0.95, 0.6) * hole * 0.6;
    col += vec3(0.32, 0.18, 0.09) * burnGlow * across * exp(-h * 9.0) * 0.6;
    if (lights > 0.0) {
      float ax = d.x / (h + 0.25);
      float fold = fbm(vec2(ax * 1.4 + time * 0.03, time * 0.02));
      float curtain = smoothstep(0.55, 0.0, abs(fract(ax * 0.9 + fold * 1.6) - 0.5)) * smoothstep(0.08, 0.3, h) * smoothstep(0.85, 0.4, h);
      float rays = 0.6 + 0.4 * fbm(vec2(ax * 18.0, h * 2.0 - time * 0.2));
      col += vec3(0.15, 0.85, 0.5) * curtain * rays * lights * 0.35 * (1.0 - cov * 0.7);
    }
    float sm = fbm(vec2(d.x * 6.0 + time * 0.01, h * 18.0 - time * 0.02));
    col = mix(col, smokeCol * (0.6 + sm * 0.6), smoke * smoothstep(0.45, 0.0, h) * (0.4 + sm * 0.6));
    vec2 sp = d.xz / (h + 0.3) * 220.0;
    float st = step(0.9975, hash(floor(sp))) * stars * smoothstep(0.05, 0.3, h);
    col += st * (0.6 + 0.4 * sin(time * 3.0 + hash(floor(sp)) * 40.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const BLD_VS = /* glsl */`
attribute vec4 iData; attribute vec3 iSize;
varying vec3 vLocal; varying vec3 vSize; varying vec4 vData; varying vec3 vN; varying vec3 vWorld;
void main(){
  vLocal = position * iSize; vSize = iSize; vData = iData; vN = normal;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BLD_FS = /* glsl */`
uniform float night; uniform float litFrac; uniform float time; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 dayCol; uniform float burnAmt; uniform float blackout;
varying vec3 vLocal; varying vec3 vSize; varying vec4 vData; varying vec3 vN; varying vec3 vWorld;
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN);
  vec2 f = abs(n.x) > 0.5 ? vec2(vLocal.z, vLocal.y) : abs(n.z) > 0.5 ? vec2(vLocal.x, vLocal.y) : vec2(vLocal.x, vLocal.z);
  vec2 cell = vec2(3.2, 3.6) * (0.85 + vData.w * 0.3);
  vec2 g = f / cell;
  vec2 gi = floor(g), gf = fract(g);
  float win = step(0.22, gf.x) * step(gf.x, 0.78) * step(0.25, gf.y) * step(gf.y, 0.8);
  if (abs(n.y) > 0.5) win = 0.0;
  float rnd = hash(vec3(gi, vData.x + n.x * 3.0 + n.z * 7.0));
  float lit = step(rnd, litFrac * vData.y * (1.0 - blackout * step(0.5, fract(vData.x * 7.3))));
  // humid-city palette: sun-bleached concrete, pastel paint, tiled shophouses
  vec3 base = mix(vec3(0.42, 0.40, 0.38), vec3(0.55, 0.5, 0.44), vData.w);
  base = mix(base, vec3(0.42, 0.55, 0.52), step(0.82, fract(vData.x * 3.7)) * 0.7);
  base = mix(base, vec3(0.62, 0.52, 0.42), step(0.9, fract(vData.x * 5.3)) * 0.6);
  float light = clamp(dot(n, normalize(sunDir)) * 0.6 + 0.5, 0.15, 1.0);
  vec3 col = base * dayCol * light;
  vec3 glass = mix(vec3(0.18, 0.22, 0.28), dayCol * 0.8, 0.4 + 0.3 * rnd);
  col = mix(col, glass * light, win * (1.0 - night * 0.6));
  vec3 wcol = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.85, 1.0), step(0.8, rnd)) * (0.8 + 0.4 * rnd);
  if (rnd > 0.97) wcol = vec3(0.4, 0.6, 1.2) * (0.7 + 0.3 * sin(time * 8.0 + rnd * 50.0));   // televisions
  col = mix(col, col * 0.12, night);
  col += win * lit * wcol * night * 1.6;
  // shophouse fronts on the ground floor
  if (abs(n.y) < 0.5 && f.y < 4.0) col += vec3(1.0, 0.55, 0.25) * step(0.6, hash(vec3(gi.x, 3.0, vData.x))) * step(0.6, f.y) * night * 0.9 * (1.0 - blackout * 0.7);
  float burn = vData.z * burnAmt;
  if (burn > 0.0) {
    float fl = 0.6 + 0.4 * sin(time * 9.0 + rnd * 40.0) * sin(time * 5.3 + rnd * 12.0);
    float fireWin = win * step(rnd, 0.55 * burn) * step(f.y, vSize.y * (0.4 + 0.6 * rnd));
    col = mix(col, col * 0.25, burn * 0.8);
    col += fireWin * vec3(1.8, 0.6, 0.12) * fl * 2.0;
  }
  float dist = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-dist * fogDensity);
  col = mix(col, fogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;
const WATER_FS = /* glsl */`
uniform vec3 skyCol; uniform vec3 deep; uniform float time; uniform float night; uniform vec3 fogCol; uniform float fogDensity; uniform vec3 sunDir; uniform vec3 sunCol; uniform float fire; uniform vec4 shock;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 v = normalize(vWorld - cameraPosition);
  float w = noise(vWorld.xz * 0.05 + vec2(time * 0.2, time * 0.05)) * 0.5 + noise(vWorld.xz * 0.2 - time * 0.3) * 0.5;
  float fres = pow(1.0 - max(-v.y, 0.0), 4.0);
  vec3 col = mix(deep, skyCol, 0.25 + fres * 0.6);
  vec3 r = reflect(v, vec3(0.0, 1.0, 0.0));
  float sg = pow(max(dot(r, normalize(sunDir)), 0.0), 200.0) * (0.5 + w);
  col += sunCol * sg * 3.0 * (1.0 - night);
  float streak = step(0.75, noise(vec2(vWorld.x * 0.08, vWorld.z * 0.6 + time))) * night * smoothstep(-200.0, -520.0, vWorld.z);
  col += streak * vec3(1.0, 0.75, 0.4) * 0.35 * (0.5 + w);
  col *= 1.0 - night * 0.45;
  col += fire * vec3(0.9, 0.3, 0.05) * smoothstep(-250.0, -540.0, vWorld.z) * (0.12 + w * 0.25);
  if (shock.w > 0.0) { float sd = abs(length(vWorld.xz - shock.xy) - shock.z); col += vec3(0.9, 0.85, 0.8) * smoothstep(30.0, 0.0, sd) * shock.w * 0.8; }
  float dist = length(vWorld - cameraPosition);
  col = mix(col, fogCol, clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;
function moonTexture() {
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, '#f4f2e8'); g.addColorStop(0.85, '#d8d6cc'); g.addColorStop(1, '#a8a69c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  const r = new RNG(3);
  for (let i = 0; i < 40; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 52, rr = r.range(2, i < 6 ? 16 : 6);
    ctx.fillStyle = `rgba(120,118,110,${r.range(0.2, 0.5)})`; ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
  }
  return toTexture(c, { nearest: false, repeat: false });
}

// River between z = RIVER0 and z = RIVER1; our bank (z > RIVER0) and downtown across it.
const RIVER0 = -60, RIVER1 = -560;
export const CITY_LAYOUT = { GROUND, RIVER0, RIVER1 };

export function createCityBackdrop({ quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'city';
  const rng = new RNG(1999);
  const p = { night: 1, cloud: 0.45, smoke: 0, burn: 0, red: 0, lights: 0, litFrac: 0.5, blackout: 0, sunDir: new THREE.Vector3(0.3, -0.4, -0.8).normalize(), paw: 0 };
  let time = 0, damage = 0;

  // ---- sky dome (follows the camera, drawn at the far plane)
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(0, 0.2, -1) }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, groundCol: { value: new THREE.Color(0x222428) },
      sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, time: { value: 0 }, cloudCover: { value: 0.4 }, cloudCol: { value: new THREE.Color(1, 1, 1) }, stars: { value: 0 }, sunVis: { value: 1 },
      smoke: { value: 0 }, smokeCol: { value: new THREE.Color(0.2, 0.15, 0.12) }, lights: { value: 0 }, burnGlow: { value: 0 }, flash: { value: 0 }, paw: { value: 0 },
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMat);
  dome.frustumCulled = false; dome.layers.set(2); dome.renderOrder = -100;
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  group.add(dome);

  // ---- filler city (instanced, old facade shader)
  const list = [];
  const add = (x, z, w, d, h, o = {}) => list.push({ x, z, w, d, h, seed: rng.range(0, 100), lit: o.lit ?? rng.range(0.6, 1.3), burn: o.burn ?? 0, tint: rng.next(), y: o.y ?? GROUND });
  const roofs = [];
  const lm = new Landmarks(group, GROUND);
  const keep = [[-70, -860, 60], [260, -1060, 40], [-430, -1120, 50], [70, -700, 45], [-180, -760, 35], [150, -820, 30], [-300, -980, 40], [420, -1300, 45], [-980, -1700, 50]];
  const clear = (x, z, w) => keep.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) > r + w * 0.6);
  const tower = (x, z, w, d, h, o = {}) => {
    if (!clear(x, z, Math.max(w, d))) return;
    add(x, z, w, d, h, o);
    if (h > 110 && rng.next() < 0.45) add(x, z, w * 0.7, d * 0.7, h * rng.range(0.15, 0.3), { y: GROUND + h, burn: o.burn });
    if (h > 30 && h < 140 && rng.next() < 0.4) roofs.push(new THREE.Vector3(x + rng.range(-w, w) * 0.3, GROUND + h, z + rng.range(-d, d) * 0.3));
  };
  // downtown across the river, densest around the landmarks
  for (let i = 0; i < 760; i++) {
    const x = rng.range(-1700, 2000), z = rng.range(RIVER1 - 20, -2600);
    const core = Math.exp(-((x + 80) ** 2) / (2 * 520 ** 2)) * Math.exp(-((z + 950) ** 2) / (2 * 420 ** 2));
    const h = 18 + rng.next() ** 2 * 150 * (0.35 + core * 1.6);
    tower(x, z, rng.range(22, 55), rng.range(22, 55), h, { burn: rng.next() < 0.5 ? rng.range(0.4, 1) : 0 });
  }
  // our bank: low/mid-rise around Golden Lotus Mansions, both sides of the street
  for (let i = 0; i < 260; i++) {
    const x = rng.range(-900, 900), z = rng.range(RIVER0 + 25, 520);
    if (Math.abs(x) < 40 && z < 110) continue;
    const h = 8 + rng.next() ** 1.5 * 60;
    add(x, z, rng.range(14, 40), rng.range(14, 40), h, { burn: rng.next() < 0.3 ? rng.range(0.3, 1) : 0 });
  }
  add(-42, 4, 26, 30, 38); add(40, 8, 24, 26, 30); add(-40, 50, 30, 30, 62); add(44, 46, 26, 28, 55);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const bldMat = new THREE.ShaderMaterial({
    vertexShader: BLD_VS, fragmentShader: BLD_FS,
    uniforms: { night: { value: 0 }, litFrac: { value: 0.4 }, time: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3() }, dayCol: { value: new THREE.Color(1, 1, 1) }, burnAmt: { value: 0 }, blackout: { value: 0 } },
  });
  const city = new THREE.InstancedMesh(boxGeo, bldMat, list.length);
  { const data = new Float32Array(list.length * 4), size = new Float32Array(list.length * 3), m = new THREE.Matrix4();
    list.forEach((b, i) => { m.compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d)); city.setMatrixAt(i, m); data.set([b.seed, b.lit, b.burn, b.tint], i * 4); size.set([b.w, b.h, b.d], i * 3); });
    boxGeo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4)); boxGeo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 3)); }
  city.frustumCulled = false; group.add(city);
  // rooftop water tanks: a barrel on stilts with a cone hat
  {
    const parts = [new THREE.CylinderGeometry(3.2, 3.4, 6, 8).translate(0, 7, 0), new THREE.ConeGeometry(3.6, 2.4, 8).translate(0, 11.2, 0)];
    for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) parts.push(new THREE.CylinderGeometry(0.25, 0.25, 4, 3).translate(dx, 2, dz));
    const tg = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x3a3028 }), roofs.length);
    roofs.forEach((q, i) => tm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(q.x, q.y, q.z)));
    group.add(tm);
  }
  // ---- the river, both banks, the promenade below our window
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: WATER_FS,
    uniforms: { skyCol: { value: new THREE.Color() }, deep: { value: new THREE.Color(0x1a2018) }, time: { value: 0 }, night: { value: 0 }, fogCol: { value: new THREE.Color() }, fogDensity: { value: 0.00035 }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, fire: { value: 0 }, shock: { value: new THREE.Vector4(0, 0, 0, 0) } },
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, RIVER0 - RIVER1 + 40), waterMat); water.rotation.x = -Math.PI / 2; water.position.set(0, GROUND - 1, (RIVER0 + RIVER1) / 2); group.add(water);
  const nearGround = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1400), new THREE.MeshBasicMaterial({ color: 0x1d1d1f })); nearGround.rotation.x = -Math.PI / 2; nearGround.position.set(0, GROUND + 0.1, RIVER0 + 700); group.add(nearGround);
  const farGround = new THREE.Mesh(new THREE.PlaneGeometry(6000, 2600), new THREE.MeshBasicMaterial({ color: 0x18181a })); farGround.rotation.x = -Math.PI / 2; farGround.position.set(0, GROUND + 0.1, RIVER1 - 1300); group.add(farGround);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(4000, 1.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x0c0c0d })); edge.position.set(0, GROUND + 0.7, RIVER0 + 2); group.add(edge);
  const lampMat = new THREE.SpriteMaterial({ map: radial({ size: 64, inner: 'rgba(255,210,140,1)', outer: 'rgba(255,170,90,0)' }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (let i = -16; i <= 16; i++) {
    const s = new THREE.Sprite(lampMat); s.position.set(i * 24, GROUND + 8, RIVER0 + 6); s.scale.set(5, 5, 1); s.layers.set(2); group.add(s);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 4), new THREE.MeshBasicMaterial({ color: 0x101012 })); pole.position.set(i * 24, GROUND + 4, RIVER0 + 6); group.add(pole);
  }
  const carMat = new THREE.MeshBasicMaterial({ color: 0x18181c });
  for (let i = 0; i < 18; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.5, 1.9), carMat); c.position.set(-200 + i * 23 + rng.range(-4, 4), GROUND + 0.9, RIVER0 + 14 + (i % 2) * 2); group.add(c); }
  // a cable-stayed bridge upriver, with traffic on it
  {
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x55534f });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 3, RIVER0 - RIVER1 + 120), deckMat); deck.position.set(560, GROUND + 16, (RIVER0 + RIVER1) / 2); group.add(deck);
    const cableMat = new THREE.LineBasicMaterial({ color: 0x8a8a86 });
    for (const zc of [RIVER0 - 130, RIVER1 + 130]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(5, 110, 5), deckMat); pylon.position.set(560, GROUND + 55, zc); group.add(pylon);
      const pts = []; for (let k = 1; k <= 9; k++) for (const s of [-1, 1]) pts.push(560, GROUND + 108, zc, 560 + s * 10, GROUND + 17, zc + s * k * 12, 560, GROUND + 108, zc, 560 - s * 10, GROUND + 17, zc - s * k * 12);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const cl = new THREE.LineSegments(lg, cableMat); cl.layers.set(2); group.add(cl);
    }
  }
  // traffic: head/tail lights along the waterfront roads and the bridge (moving in the vertex shader)
  const pointMat = new THREE.ShaderMaterial({ vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, uniforms: { uTime: { value: 0 }, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
  {
    const pts = [], dat = [], col = [];
    const lane = (axis, fixed, y, n, speed) => { for (let i = 0; i < n; i++) { const dir = rng.next() < 0.5 ? 1 : -1, head = rng.next() < 0.5; if (axis === 1) pts.push(0, y, fixed + dir * 2.5); else pts.push(fixed + dir * 3, y, 0); dat.push(axis, speed * dir * rng.range(0.7, 1.3), rng.range(0, 3000), 0); col.push(...(head ? [2.2, 2.0, 1.6] : [2.4, 0.25, 0.15])); } };
    lane(1, RIVER0 + 30, GROUND + 0.8, 160, 12); lane(1, RIVER1 - 30, GROUND + 0.8, 220, 12); lane(1, -1300, GROUND + 0.8, 160, 12); lane(2, 560, GROUND + 18, 140, 16);
    for (const L of lm.lights) { /* aviation lights are sprites */ }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('aData', new THREE.Float32BufferAttribute(dat, 4)); g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    const traffic = new THREE.Points(g, pointMat); traffic.frustumCulled = false; traffic.layers.set(2); group.add(traffic);
  }
  // ---- moon
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial({ size: 64, inner: 'rgba(220,230,255,0.3)', outer: 'rgba(0,0,0,0)' }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  moon.scale.set(160, 160, 1); halo.scale.set(560, 560, 1); moon.layers.set(2); halo.layers.set(2); moon.renderOrder = -90; halo.renderOrder = -90;
  const moonDir = new THREE.Vector3(-0.35, 0.3, -1).normalize();
  moon.onBeforeRender = (r, s, cam) => { moon.position.copy(cam.position).addScaledVector(moonDir, 3500); halo.position.copy(moon.position); moon.updateMatrixWorld(); halo.updateMatrixWorld(); };
  group.add(halo, moon);

  // ---- fires/smoke over burning buildings, alien motes, sky searchlights (old buildFX)
  const fires = [], smokes = [], motes = [], beams = [];
  {
    const fireMap = radial({ size: 64, inner: 'rgba(255,170,60,1)', outer: 'rgba(255,60,0,0)' });
    const smokeMap = radial({ size: 64, inner: 'rgba(40,34,30,0.9)', outer: 'rgba(40,34,30,0)' });
    const burning = list.filter((b) => b.burn > 0.5 && b.z < RIVER1).slice(0, 60);
    for (const b of burning) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      f.position.set(b.x, b.y + b.h * 0.6, b.z + b.d / 2 + 5); f.scale.set(b.w * 2.2, b.h * 0.9, 1); f.layers.set(2); group.add(f); fires.push({ s: f, b, ph: Math.random() * 10 });
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, depthWrite: false, transparent: true, opacity: 0 }));
        s.position.set(b.x, b.y + b.h + 40 + k * 90, b.z); s.scale.set(140 + k * 60, 140 + k * 60, 1); s.layers.set(2); group.add(s); smokes.push({ s, b, k, ph: Math.random() * 10 });
      }
    }
    const moteMap = radial({ size: 32, inner: 'rgba(190,255,230,1)', outer: 'rgba(80,255,180,0)' });
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moteMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.scale.set(22, 22, 1); s.layers.set(2); group.add(s);
      motes.push({ s, a: Math.random() * 6.28, r: 200 + Math.random() * 1000, y: 220 + Math.random() * 420, sp: 0.02 + Math.random() * 0.05, z: -1000 + (Math.random() - 0.5) * 1100 });
    }
    const beamGeo = new THREE.CylinderGeometry(4, 90, 1, 16, 1, true); beamGeo.translate(0, -0.5, 0);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(0.7, 1, 0.9) }, op: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 col; uniform float op; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(col * op * e * (0.4 + 0.6 * (1.0 + vY)), 1.0); }',
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(beamGeo, beamMat); b.scale.set(1, 700, 1); b.layers.set(2); group.add(b); beams.push({ m: b, ph: i * 1.7, x: -500 + i * 330 }); }
    beams.mat = beamMat;
  }

  // ---- billboards on our bank, facing the window
  const signs = [];
  {
    const KINDS = ['noodle', 'lifeline', 'quikmart', 'dtp', 'karaoke', 'khaoman', 'massage', 'catfood', 'bank'];
    const near = list.filter((b) => b.z > RIVER0 + 20 && b.z < 260 && Math.abs(b.x) > 60 && Math.abs(b.x) < 420 && b.h < 45 && b.y === GROUND).slice(0, 9);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2e });
    near.forEach((b, i) => {
      const sw = 16 + rng.next() * 6, sh = sw / 2;
      const mat = new THREE.MeshBasicMaterial({ map: signTexture(KINDS[i % KINDS.length]) });
      const sg = new THREE.Group(); const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat); sign.position.z = 0.27;
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(sw + 0.8, sh + 0.8, 0.5), frameMat), sign);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.8, 4, 0.4), frameMat); legs.position.y = -sh / 2 - 2; sg.add(legs);
      sg.position.set(b.x, GROUND + b.h + sh / 2 + 4, b.z - b.d * 0.25); sg.lookAt(b.x * 0.2, sg.position.y, -800);
      group.add(sg); signs.push(mat);
    });
    // and a few across the river on downtown rooftops
    const far = list.filter((b) => b.z < RIVER1 - 30 && b.z > RIVER1 - 300 && b.h < 60 && b.y === GROUND).slice(0, 6);
    far.forEach((b, i) => {
      const sw = 30, sh = 15; const mat = new THREE.MeshBasicMaterial({ map: signTexture(KINDS[(i + 3) % KINDS.length]) });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat); sign.position.set(b.x, GROUND + b.h + sh / 2 + 3, b.z + b.d / 2); group.add(sign); signs.push(mat);
    });
  }

  // ---- our own building, Golden Lotus Mansions (hole where room 1407's window is)
  const home = new THREE.Group(); home.name = 'goldenLotus';
  {
    const U = { uNight: { value: 1 }, uTime: { value: 0 }, uSky: { value: new THREE.Color(0.1, 0.1, 0.14) }, uHaze: { value: new THREE.Color(0.08, 0.07, 0.09) }, uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4) }, uHazeDensity: { value: 0.0005 }, uGround: { value: GROUND }, uDark: { value: 0 } };
    const homeMat = new THREE.ShaderMaterial({ vertexShader: FACADE_VERT, fragmentShader: FACADE_FRAG, uniforms: { ...U, uTint: { value: new THREE.Color(0xd8cdb2) }, uInfo: { value: new THREE.Vector2(2.2, 0.4) }, uCellOff: { value: new THREE.Vector2(1.675, 2.2) }, uWin: { value: new THREE.Vector4(0.1, 0.9, 0.257, 0.712) }, uCellW: { value: 2.75 }, uImpacts: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uImpactCount: { value: 0 } } });
    home.userData.u = U;
    const s = new THREE.Shape(); s.moveTo(-10, GROUND); s.lineTo(14, GROUND); s.lineTo(14, 30); s.lineTo(-10, 30); s.closePath();
    const hole = new THREE.Path(); hole.moveTo(-0.8, 0.85); hole.lineTo(-0.8, 2.35); hole.lineTo(1.4, 2.35); hole.lineTo(1.4, 0.85); hole.closePath(); s.holes.push(hole);
    const gb = new THREE.ShapeGeometry(s); gb.rotateY(Math.PI); gb.translate(0, 0, -2.44); home.add(new THREE.Mesh(gb, homeMat));
    const side = (w, x, rotY, z) => { const pg = new THREE.PlaneGeometry(w, 30 - GROUND); pg.rotateY(rotY); pg.translate(x, (30 + GROUND) / 2, z); home.add(new THREE.Mesh(pg, homeMat)); };
    side(18.44, -14, -Math.PI / 2, 6.78); side(18.44, 10, Math.PI / 2, 6.78);
    const front = new THREE.PlaneGeometry(24, 30 - GROUND); front.translate(-2, (30 + GROUND) / 2, 16); home.add(new THREE.Mesh(front, homeMat));
    const roof = new THREE.PlaneGeometry(24, 18.44); roof.rotateX(-Math.PI / 2); roof.translate(-2, 30, 6.78); home.add(new THREE.Mesh(roof, homeMat));
    const ledges = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.12, 0.35), new THREE.MeshLambertMaterial({ color: 0xbfb49b }), 140); let li = 0;
    for (let fy = -13; fy <= 8 && li < 140; fy++) for (let cx = -3; cx <= 4 && li < 140; cx++) ledges.setMatrixAt(li++, new THREE.Matrix4().makeTranslation(-1.675 + cx * 2.75 + 1.375, fy * 3.3 + 0.78, -2.62));
    ledges.count = li; home.add(ledges);
    const acL = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.62, 0.55), new THREE.MeshLambertMaterial({ color: 0xd9d6cf }), 60); let ai = 0; const RR = new RNG(99);
    for (let fy = -13; fy <= 8; fy++) for (let cx = -3; cx <= 4; cx++) { if (fy === 0 && cx === 0) continue; if (RR.next() < 0.35 && ai < 60) acL.setMatrixAt(ai++, new THREE.Matrix4().makeTranslation(-1.675 + cx * 2.75 + 2.3, fy * 3.3 + 0.35, -2.75)); }
    acL.count = ai; home.add(acL);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#5b1212'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#ffcf4a'; g.font = '800 54px Spectral, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GOLDEN LOTUS MANSIONS', 256, 66);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: t })); hs.position.set(-2, 33, -2.6); hs.rotation.y = Math.PI; home.add(hs); signs.push(hs.material);
  }
  group.add(home);
  const homeWindow = new THREE.Vector3(-0.3, 1.6, -2.44);

  // ---- ships: the old carrier (breaks into rigid parts) and three saucers; debris + blasts
  const carrierObj = new Ship(group);
  carrierObj.group.scale.setScalar(0.42); carrierObj.group.visible = false;
  const carrier = { group: carrierObj.group, obj: carrierObj, kind: 'carrier', size: 110, beam: makeBeam(60, 600, 0xb68bff) };
  carrier.beam.visible = false; carrierObj.group.add(carrier.beam); carrier.beam.scale.setScalar(1 / 0.42 * 0.5);
  const saucers = [makeSaucer({ size: 16 }), makeSaucer({ size: 12 }), makeSaucer({ size: 10 })];
  const ships = [carrier, ...saucers];
  const SHIP_HOME = [new THREE.Vector3(-260, 420, -1500), new THREE.Vector3(-60, 220, -760), new THREE.Vector3(200, 250, -980), new THREE.Vector3(-380, 260, -1150)];
  ships.forEach((s, i) => { s.home = SHIP_HOME[i].clone(); s.group.position.copy(s.home); if (s.kind !== 'carrier') { s.group.visible = false; group.add(s.group); } s.phase = i * 1.7; });
  const debris = new Debris(group, { chunks: quality === 'low' ? 300 : 700, puffs: quality === 'low' ? 220 : 420, fires: 90, ground: GROUND });
  const blasts = [];
  { const fireMap = radial({ size: 64, inner: 'rgba(255,220,140,1)', outer: 'rgba(255,80,0,0)' });
    for (let i = 0; i < 24; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false })); s.layers.set(2); group.add(s); blasts.push({ s, t: -1, v: new THREE.Vector3(), life: 1 }); } }
  function blast(pos, n = 8, size = 120, spread = 60) {
    for (let i = 0; i < n; i++) {
      const b = blasts.find((x) => x.t < 0) || blasts[i % blasts.length];
      b.t = 0; b.life = 1.5 + Math.random() * 2.5;
      b.s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      b.v.set((Math.random() - 0.5) * 40, 20 + Math.random() * 40, (Math.random() - 0.5) * 40); b.size = size * (0.6 + Math.random() * 0.8);
    }
  }
  // persistent fires on a tower face (Debris fire sprites with a very long life)
  const wrecks = [];
  function burnTower(i, y, { saucer = null } = {}) {
    const T = lm.towers[i]; lm.setFire(i, 1, y);
    const face = T.pos.clone().add(new THREE.Vector3(0, y, 24));
    for (let k = 0; k < 10; k++) debris.fire(face.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, Math.random() * 6)), 22 + Math.random() * 18, 1e9);
    if (saucer) { saucer.group.visible = true; saucer.embedded = true; saucer.group.position.copy(face).add(new THREE.Vector3(0, -4, saucer.size * 0.3)); saucer.group.rotation.set(-0.55, 0.3, 0.42); saucer.beam.visible = false; }
    wrecks.push({ i, y, face });
  }
  const shockState = { r: 0, x: 0, z: 0, on: false };
  function shock(pos, size = 1) { shockState.on = true; shockState.r = 0; shockState.x = pos.x; shockState.z = pos.z; skyMat.uniforms.flash.value = 1.2 * size; }

  // Crash a ship into a landmark (0 Sky Lotus · 1 Golden Needle · 2 Orchid Spire · 3 Mercury Exchange).
  // The carrier tears into rigid parts (old Ship.breakApart); saucers embed themselves. Resolves at impact.
  function crash(ship, towerIndex = 0, { duration = 5.5, height, onImpact } = {}) {
    const T = lm.towers[towerIndex];
    const y = height ?? T.h * (ship.kind === 'carrier' ? 0.42 : 0.55);
    const p = T.pos.clone().add(new THREE.Vector3(0, y, 26));
    ship.group.visible = true; if (ship.beam) ship.beam.visible = false;
    const start = ship.group.position.clone();
    const ctrl = start.clone().lerp(p, 0.5).add(new THREE.Vector3(0, 80, 60));
    return new Promise((resolve) => {
      ship.crashing = { t: 0, duration, start, ctrl, end: p, done: () => {
        ship.crashing = null;
        blast(p, 14, ship.kind === 'carrier' ? 160 : 90, 70);
        debris.burst(p, ship.kind === 'carrier' ? 120 : 50, ship.kind === 'carrier' ? 60 : 40, ship.kind === 'carrier' ? 4 : 2.5, 0.6);
        for (let k = 0; k < 14; k++) debris.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 30)), new THREE.Vector3((Math.random() - 0.5) * 8, 6, (Math.random() - 0.5) * 8), 40, 30, 14, new THREE.Color(0.12, 0.1, 0.09), 0.75);
        shock(p, 1);
        if (ship.kind === 'carrier') {
          ship.obj.vel = ship.dir.clone().multiplyScalar(60); ship.obj.u.damage.value = 1; ship.obj.u.power.value = 0.25;
          ship.obj.breakApart(35);
          for (const part of ship.obj.parts) debris.fire(part.obj.position.clone(), 50, 25, part.obj);
          burnTower(towerIndex, y);
        } else burnTower(towerIndex, y, { saucer: ship });
        onImpact?.(p); resolve(p);
      } };
    });
  }

  function setDamage(level) {
    damage = level;
    p.smoke = [0, 0.1, 0.5, 0.8][level] ?? 0; p.burn = [0, 0, 0.6, 1][level] ?? 0; p.red = [0, 0.05, 0.3, 0.55][level] ?? 0;
    p.lights = [0, 0.7, 0.8, 1][level] ?? 0; p.litFrac = [0.5, 0.45, 0.3, 0.18][level] ?? 0.4; p.blackout = [0, 0, 0.3, 0.6][level] ?? 0;
    for (const w of wrecks) lm.setFire(w.i, 0, 0);
    wrecks.length = 0; debris.clear(); lm.reset(); carrierObj.reset(); carrierObj.group.visible = false;
    ships.forEach((s, i) => { s.crashing = null; s.embedded = false; s.group.rotation.set(0, 0, 0); s.group.position.copy(s.home); if (i > 0) s.group.visible = level === 1; if (s.beam) s.beam.visible = level === 1 && i === 3; });
    if (level >= 2) { burnTower(0, lm.towers[0].h * 0.42); burnTower(1, lm.towers[1].h * 0.55, { saucer: saucers[0] }); }
    if (level >= 3) { burnTower(2, lm.towers[2].h * 0.55, { saucer: saucers[1] }); saucers[2].group.visible = true; saucers[2].beam.visible = true; }
    helis.forEach((h, i) => (h.group.visible = level >= 2 && i < level));
  }
  let hour = 22;
  function setTimeOfDay(h) {
    hour = h;
    const sunA = ((h - 6) / 14) * Math.PI;
    p.sunDir.set(0.25, Math.sin(sunA) * 0.85, -Math.cos(sunA)).normalize();
    p.night = 1 - clamp(smoothstep(-0.06, 0.18, p.sunDir.y), 0, 1);
  }
  // DTP helicopters circling the burning towers
  const helis = [];
  for (let i = 0; i < 3; i++) { const h = makeHeli(); h.group.scale.setScalar(2.5); h.group.visible = false; h.orbit = { c: new THREE.Vector3(-70 + (i - 1) * 160, 80 + i * 30, -820 - i * 60), r: 90 + i * 30, speed: 0.12 + i * 0.03, phase: i * 2 }; group.add(h.group); helis.push(h); }

  const sh = { fogCol: new THREE.Color(), skyCol: new THREE.Color(), sunDir: new THREE.Vector3(), dayCol: new THREE.Color(), night: 1, litFrac: 0.4, fogDensity: 0.0003, blackout: 0, burn: 0 };
  const tmp = new THREE.Vector3();
  function update(dt, t = time + dt) {
    time = t;
    const night = p.night, red = p.red;
    const dayZen = new THREE.Color(0.22, 0.42, 0.78), dayHor = new THREE.Color(0.68, 0.76, 0.86), sunsetHor = new THREE.Color(0.95, 0.55, 0.3);
    const nightZen = new THREE.Color(0.01, 0.012, 0.025), nightHor = new THREE.Color(0.06, 0.05, 0.08);
    const redZen = new THREE.Color(0.25, 0.06, 0.04), redHor = new THREE.Color(0.7, 0.25, 0.1);
    const lowSun = clamp(1 - Math.abs(p.sunDir.y) * 4, 0, 1) * (1 - night * 0.6);
    const zen = dayZen.clone().lerp(nightZen, night).lerp(redZen.clone().multiplyScalar(1 - night * 0.6), red * 0.7);
    const hor = dayHor.clone().lerp(sunsetHor, lowSun * 0.7).lerp(nightHor, night).lerp(redHor.clone().multiplyScalar(1 - night * 0.5), red * 0.6);
    hor.lerp(new THREE.Color(0.22, 0.12, 0.08), night * 0.35);                                  // humid light-pollution glow
    if (p.burn > 0.3) hor.lerp(new THREE.Color(0.35, 0.12, 0.05), p.burn * night * 0.6);
    const u = skyMat.uniforms;
    u.zenith.value.copy(zen); u.horizon.value.copy(hor); u.sunDir.value.copy(p.sunDir);
    u.sunCol.value.setRGB(1, 0.85 - lowSun * 0.3, 0.65 - lowSun * 0.4);
    u.time.value = t; u.cloudCover.value = p.cloud; u.stars.value = night * (1 - p.smoke * 0.7);
    u.cloudCol.value.copy(hor).lerp(new THREE.Color(1, 1, 1), (1 - night) * 0.6).multiplyScalar(1 - night * 0.7);
    u.sunVis.value = (1 - night) * (1 - p.smoke * 0.5);
    u.smoke.value = p.smoke; u.smokeCol.value.setRGB(0.16 + red * 0.2, 0.12, 0.1).multiplyScalar(1 - night * 0.4);
    u.lights.value = p.lights * night; u.burnGlow.value = Math.max(p.burn, 0.25) * night; u.flash.value = Math.max(0, u.flash.value - dt * 2.5); u.paw.value = p.paw;
    const bu = bldMat.uniforms;
    bu.night.value = night; bu.litFrac.value = p.litFrac; bu.time.value = t; bu.fogCol.value.copy(hor); bu.sunDir.value.copy(p.sunDir);
    bu.dayCol.value.setRGB(1, 0.95, 0.9).lerp(new THREE.Color(1, 0.6, 0.4), red * 0.5); bu.burnAmt.value = p.burn; bu.blackout.value = p.blackout;
    bu.fogDensity.value = 0.00028 + p.smoke * 0.0003;
    const wu = waterMat.uniforms;
    wu.skyCol.value.copy(hor); wu.time.value = t; wu.night.value = night; wu.fogCol.value.copy(hor); wu.sunDir.value.copy(p.sunDir); wu.sunCol.value.copy(u.sunCol.value); wu.fire.value = p.burn * night; wu.fogDensity.value = bu.fogDensity.value;
    if (shockState.on) { shockState.r += dt * 340; const a = Math.max(0, 1 - shockState.r / 1500); wu.shock.value.set(shockState.x, shockState.z, shockState.r, a); if (a <= 0) shockState.on = false; } else wu.shock.value.w = 0;
    sh.night = night; sh.litFrac = p.litFrac; sh.fogCol.copy(hor); sh.fogDensity = bu.fogDensity.value; sh.sunDir.copy(p.sunDir);
    sh.dayCol.copy(bu.dayCol.value); sh.skyCol.copy(zen).lerp(hor, 0.55); sh.blackout = p.blackout; sh.burn = p.burn;
    lm.update(t, sh); carrierObj.update(dt, t, sh); debris.update(dt, sh);
    pointMat.uniforms.uTime.value = t;
    const hu = home.userData.u; hu.uNight.value = night; hu.uTime.value = t; hu.uHaze.value.copy(hor); hu.uSky.value.copy(sh.skyCol); hu.uSunDir.value.copy(p.sunDir);
    moon.material.opacity = clamp(0.25 + night, 0, 1); halo.material.opacity = night;
    for (const f of fires) f.s.material.opacity = p.burn * f.b.burn * (0.6 + 0.4 * Math.sin(t * 7 + f.ph) * Math.sin(t * 3.1 + f.ph)) * (0.4 + night * 0.6);
    for (const s of smokes) {
      s.s.material.opacity = p.smoke * s.b.burn * 0.55;
      s.s.position.y = s.b.y + s.b.h + 40 + s.k * 90 + ((t * 6 + s.ph * 20) % 90);
      s.s.position.x = s.b.x + Math.sin(t * 0.1 + s.ph) * 30 + s.k * 25;
      s.s.material.color.setRGB(0.5 + 0.5 * (1 - night), 0.45 + 0.4 * (1 - night), 0.4 + 0.4 * (1 - night));
    }
    for (const m of motes) { m.a += m.sp * dt; m.s.position.set(Math.cos(m.a) * m.r * 0.6, m.y + Math.sin(t * 0.7 + m.r) * 20, m.z + Math.sin(m.a) * 260); m.s.material.opacity = p.lights * (0.5 + 0.5 * Math.sin(t * 2 + m.r)) * (0.3 + night * 0.7); }
    beams.mat.uniforms.op.value = p.lights * night * 0.12;
    for (const b of beams) { b.m.position.set(b.x + Math.sin(t * 0.13 + b.ph) * 260, 700, -1100 + Math.cos(t * 0.1 + b.ph) * 200); b.m.rotation.set(Math.sin(t * 0.2 + b.ph) * 0.35, 0, Math.cos(t * 0.17 + b.ph) * 0.35); }
    for (const m of signs) m.color.setScalar(0.75 + night * 0.5);
    // ships
    for (const s of ships) {
      if (s.beam) s.beam.material.uniforms.uTime.value = t;
      if (s.crashing) {
        const c = s.crashing; c.t += dt / c.duration; const k = Math.min(1, c.t), e = k * k * (1.6 - 0.6 * k);
        const pos = c.start.clone().multiplyScalar((1 - e) ** 2).add(c.ctrl.clone().multiplyScalar(2 * (1 - e) * e)).add(c.end.clone().multiplyScalar(e * e));
        s.dir = pos.clone().sub(s.group.position).normalize();
        s.group.position.copy(pos);
        if (s.kind === 'carrier') { s.group.lookAt(pos.clone().add(s.dir)); s.group.rotateZ(Math.sin(t * 3) * 0.2 * k); s.obj.u.damage.value = k * 0.6; if (Math.random() < dt * 30) debris.fire(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60)), 40, 2); if (Math.random() < dt * 12) debris.puff(pos, new THREE.Vector3(0, 4, 0), 40, 30, 10, new THREE.Color(0.1, 0.09, 0.08), 0.7); }
        else { s.group.rotation.y += dt * (2 + 6 * k); s.group.rotation.x = -0.4 * k; if (Math.random() < dt * 24) debris.fire(pos.clone(), s.size * 1.4, 1.2); if (Math.random() < dt * 10) debris.puff(pos, new THREE.Vector3(0, 3, 0), s.size * 1.6, s.size * 2, 8, new THREE.Color(0.1, 0.09, 0.08), 0.7); }
        if (k >= 1) c.done();
      } else if (s.kind === 'carrier' && s.obj.broken) {
        s.obj.stepParts(dt, GROUND, (part, v) => { debris.puff(part.obj.position.clone(), new THREE.Vector3(0, 4, 0), 70, 50, 14, new THREE.Color(0.3, 0.28, 0.26), 0.7); blast(part.obj.position.clone(), 3, 80, 40); });
      } else if (s.kind === 'carrier' && s.group.visible) {
        s.group.position.copy(s.home).add(tmp.set(Math.sin(t * 0.05) * 20, Math.sin(t * 0.13) * 8, 0)); s.group.rotation.set(0.06, 1.25 + Math.sin(t * 0.02) * 0.05, 0.04);
      } else if (!s.embedded && s.group.visible) {
        s.group.position.copy(s.home).add(tmp.set(Math.sin(t * 0.3 + s.phase) * 8, Math.sin(t * 0.7 + s.phase) * 3, Math.cos(t * 0.25 + s.phase) * 6));
        s.group.rotation.y += dt * 0.4;
        if (s.beam) s.beam.material.uniforms.uOpacity.value = 0.45 + 0.2 * Math.sin(t * 3 + s.phase);
      } else if (s.embedded) s.lights.visible = Math.sin(t * 13 + s.phase) > -0.2;
    }
    for (const b of blasts) {
      if (b.t < 0) continue;
      b.t += dt; const f = b.t / b.life;
      if (f >= 1) { b.t = -1; b.s.material.opacity = 0; continue; }
      b.s.position.addScaledVector(b.v, dt); b.s.scale.setScalar(b.size * (0.5 + f * 1.6)); b.s.material.opacity = (1 - f) * 0.9; b.s.material.color.setRGB(1, 0.8 - f * 0.5, 0.6 - f * 0.5);
    }
    for (const h of helis) if (h.group.visible && !h.manual) { const o = h.orbit, a = t * o.speed + o.phase; h.group.position.set(o.c.x + Math.cos(a) * o.r, o.c.y + Math.sin(t * 0.5 + o.phase) * 4, o.c.z + Math.sin(a) * o.r); h.group.rotation.set(0.08, -a + Math.PI, 0.12); }
    for (const h of helis) { h.rotor.rotation.y += dt * 30; h.tailRotor.rotation.x += dt * 40; h.red.visible = (t * 1.2 + h.orbit.phase) % 1 < 0.5; }
  }
  setTimeOfDay(22); setDamage(0); update(0, 0);

  return {
    group, update, setTimeOfDay, setDamage, crash, ships, carrier, saucers, landmarks: lm.towers, lm, helis, debris, homeWindow, home, blast, shock, sky: skyMat.uniforms, params: p,
    fx: { burst: (kind, pos, o = {}) => { if (kind === 'explosion') { blast(pos.clone ? pos.clone() : new THREE.Vector3(...pos), 8, 60 * (o.scale ?? 1), 30); debris.burst(pos, 20, 30, 1.5, 0.6); } }, update() {} },
    get damage() { return damage; }, get hour() { return hour; },
    showShips(on = true) { carrierObj.group.visible = on && !carrierObj.broken; saucers.forEach((s, i) => { if (!s.embedded) { s.group.visible = on; s.beam.visible = on && i === 2; } }); },
    setPaw(v) { p.paw = v; },
  };
}
// The Board's paw: a gigantic orange tabby paw (SDF) that comes down through the clouds.
let pawGeo = null;
export async function makePaw() {
  if (!pawGeo) {
    const fur = [0.012, 4];
    const prims = [
      cap([0, 0, 0], [0, 40, -6], 7.5, 9, { mat: 0, noise: fur }),
      ell([0, -1.5, 1.6], [8.6, 5.4, 9], { mat: 0, k: 3, noise: fur }),
      ...[-5.4, -1.8, 1.8, 5.4].map((x, i) => ell([x, -4.8, 7 + (i === 0 || i === 3 ? -1.5 : 0)], [2.6, 2.4, 3], { mat: 1, k: 1.4, noise: [0.006, 6] })),
      ...[-5.4, -1.8, 1.8, 5.4].map((x, i) => ell([x, -6.4, 6.6 + (i === 0 || i === 3 ? -1.5 : 0)], [1.7, 0.9, 1.9], { mat: 2, k: 0.8 })),
      ell([0, -6.6, 1.8], [4.6, 1.4, 3.6], { mat: 2, k: 1.2 }),
    ];
    const spec = { prims, paints: [], mats: [
      { c: rgb(0xd47a26), c2: rgb(0xeaa55a), vn: 0.25, rough: 0.9, stripes: [0.55, 1, 0.75, rgb(0x9a4a14)] },
      { c: rgb(0xf3ece0), c2: rgb(0xe0d4c0), vn: 0.4, rough: 0.9 },
      { c: rgb(0xe48a96), rough: 0.5 },
    ], bounds: { min: [-14, -10, -18], max: [14, 52, 16] }, cell: 0.28, smooth: 1 };
    pawGeo = toGeometry(await meshSpec(spec), { skinned: false });
  }
  const m = new THREE.Mesh(pawGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  m.castShadow = true;
  return m;
}

function mergeGeos(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    const ia = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, i) => i);
    for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + o;
    o += g.attributes.position.count; oi += ia.length;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
