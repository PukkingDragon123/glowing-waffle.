// The main menu & loading scene: Mr. Tofu sprints through an endless DTP containment facility while
// enormous bureaucratic hands claw after him out of the dark. Side-scrolling, seamless, infinite.
// The world is static; the cat and camera run +X and corridor segments recycle ahead of them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CatAnimator } from '../chars/cat.js';
import { game } from '../core/game.js';
import { assetUrl } from '../core/assets.js';
import { hasSave } from '../core/save.js';
import { clamp, lerp, damp, rng, ease, noise1 } from '../core/util.js';
import { spawn } from '../chars/index.js';
import { buildHandTemplate, GiantHand } from './hands.js';
import { mountMenu } from '../ui/menu.js';

const SEG = 4, NSEG = 9, WALL_Z = -1.55, CEIL = 2.55, FG_Z = 1.15, RUN = 3.3;

// ---------------------------------------------------------------- helpers
function rbox(w, h, d, r = 0.02, seg = 2) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const s = new THREE.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
  s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
  s.lineTo(x + W + r, y + H); s.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
  s.lineTo(x, y + H + r); s.quadraticCurveTo(x - r, y + H + r, x - r, y + H); s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.98, bevelSegments: seg, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)); return g.clone().applyMatrix4(m); };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function speckle(g, w, h, n, a, seed) { const r = rng(seed); for (let i = 0; i < n; i++) { const v = r() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * a})`; const s = 1 + r() * 2.5; g.fillRect(r() * w, r() * h, s, s); } }
function stains(g, w, h, n, seed, color = '40,30,20') {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h * 0.5, len = 40 + r() * h * 0.6, wd = 2 + r() * 10;
    const gr = g.createLinearGradient(x, y, x, y + len); gr.addColorStop(0, `rgba(${color},${0.08 + r() * 0.18})`); gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr; g.fillRect(x, y, wd, len);
  }
}
function hazard(g, x, y, w, h, s = 24) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#e0b21e'; g.fillRect(x, y, w, h);
  g.fillStyle = '#141414'; for (let i = -h; i < w + h; i += s * 2) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + s, y + h); g.lineTo(x + i + s + h, y); g.lineTo(x + i + h, y); g.fill(); }
  g.restore(); speckle(g, w, h, (w * h) / 60, 0.25, 9);
}

// ---------------------------------------------------------------- textures
const tile = (g, img, w, h, tw, th, ox = 0, oy = 0) => { if (!img) return; for (let y = -oy; y < h; y += th) for (let x = -ox; x < w; x += tw) g.drawImage(img, x, y, tw, th); };
function wallTexture(variant, img) {
  return canvasTex(1024, 640, (g, w, h) => {
    const band = h * (1 - 0.9 / 2.55);
    // CC0 Poly Haven "painted concrete" as the base, then the facility's paint job multiplied over it
    g.fillStyle = '#8a8a86'; g.fillRect(0, 0, w, h);
    tile(g, img, w, h, 768, 753, variant * 211, variant * 97);
    g.globalCompositeOperation = 'color'; g.globalAlpha = 0.55;
    g.fillStyle = ['#8d9a92', '#8e9a9b', '#9c9a86'][variant]; g.fillRect(0, 0, w, band);
    g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.5; g.fillStyle = '#4a4a44'; g.fillRect(0, 0, w, band);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 1;
    g.fillStyle = ['#7d978b', '#74898d', '#8f8f74'][variant]; g.fillRect(0, band, w, h - band);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c9a227'; g.fillRect(0, band - 6, w, 6);
    speckle(g, w, h, 9000, 0.12, 3 + variant);
    stains(g, w, h, 26, 11 + variant);
    stains(g, w, h, 8, 21 + variant, '120,50,20');
    g.strokeStyle = 'rgba(10,12,12,0.55)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, h * (1 - 1.85 / 2.55)); g.lineTo(w, h * (1 - 1.85 / 2.55)); g.stroke();
    const gr = g.createLinearGradient(0, h * 0.82, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = gr; g.fillRect(0, h * 0.82, w, h * 0.18);
    // scuffs & scratches (cat claws, of course)
    const r = rng(40 + variant); g.strokeStyle = 'rgba(220,220,210,0.18)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const x = r() * w, y = band + r() * (h - band) * 0.5; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + k * 5, y); g.lineTo(x + k * 6 + 14, y + 40); g.stroke(); } }
  });
}
function floorTexture(img) {
  return canvasTex(1024, 820, (g, w, h) => {
    g.fillStyle = '#3c3e40'; g.fillRect(0, 0, w, h);
    tile(g, img, w, h, 768, 768);                                 // CC0 Poly Haven "concrete floor worn"
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#7d8086'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    speckle(g, w, h, 6000, 0.1, 5);
    const r = rng(77);
    for (let i = 0; i < 10; i++) { const gr = g.createRadialGradient(r() * w, r() * h, 2, r() * w, r() * h, 60 + r() * 140); gr.addColorStop(0, 'rgba(15,15,18,0.25)'); gr.addColorStop(1, 'rgba(15,15,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    hazard(g, 0, h * 0.03, w, h * 0.07, 22);                 // stripe along the wall
    g.fillStyle = '#c9a227'; g.fillRect(0, h * 0.62, w, 9);    // painted guide line
    g.fillStyle = 'rgba(201,162,39,0.85)'; g.font = 'bold 54px "Big Shoulders Stencil", sans-serif'; g.textAlign = 'center';
    g.save(); g.translate(w * 0.5, h * 0.8); g.fillText('KEEP MOVING', 0, 0); g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo((i * w) / 2, 0); g.lineTo((i * w) / 2, h); g.stroke(); }
  });
}
function hazardTexture() { return canvasTex(256, 64, (g, w, h) => hazard(g, 0, 0, w, h, 16), { repeat: [1, 1] }); }
const SIGNS = [
  ['SECTOR 7', 'FELINE CONTAINMENT', '#d8d2c0', '#1d2b28'],
  ['NO PETS', 'BEYOND THIS POINT', '#f1e9d2', '#7a1b14'],
  ['DEPARTMENT OF', 'TERRESTRIAL PURITY', '#e8e2cc', '#18202b'],
  ['WARNING', 'SUBJECT BITES', '#141414', '#e0b21e'],
  ['DAYS WITHOUT', 'AN ESCAPE:  0', '#f1e9d2', '#2d3a2a'],
  ['CAUTION', 'GIANT HANDS AT WORK', '#141414', '#e0b21e'],
  ['ALL CATS', 'MUST BE ACCOUNTED FOR', '#f1e9d2', '#203347'],
  ['AUTHORISED', 'HANDS ONLY', '#f1e9d2', '#5a1a1a'],
  ['DO NOT', 'MAKE EYE CONTACT', '#141414', '#d8d2c0'],
];
function signTexture([a, b, fg, bg]) {
  return canvasTex(512, 220, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = fg; g.textAlign = 'center'; g.font = '800 74px "Big Shoulders Stencil", sans-serif'; g.fillText(a, w / 2, 98);
    g.font = '600 46px "Big Shoulders Stencil", sans-serif'; g.fillText(b, w / 2, 168);
    speckle(g, w, h, 2500, 0.2, a.length); stains(g, w, h, 5, b.length);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#888'; g.beginPath(); g.arc(i % 2 ? w - 26 : 26, i < 2 ? 26 : h - 26, 6, 0, 7); g.fill(); }
  });
}
function stencilTexture(text, sub) {
  return canvasTex(1024, 300, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,226,204,0.82)'; g.textAlign = 'center';
    g.font = '800 190px "Big Shoulders Stencil", sans-serif'; g.fillText(text, w / 2, 190);
    g.font = '600 64px "Big Shoulders Stencil", sans-serif'; g.fillText(sub, w / 2, 270);
    g.globalCompositeOperation = 'destination-out'; speckle(g, w, h, 9000, 0.9, 13); g.globalCompositeOperation = 'source-over';
  });
}

// ---------------------------------------------------------------- volumetric light cone (additive, no ink)
function coneMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOn: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH; void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ float f = pow(abs(dot(vN, vV)), 1.6); float a = f * (0.4 + 0.6 * smoothstep(0.0, 0.85, vH) * (1.0 - smoothstep(0.88, 1.0, vH))) * 0.5 * uOn; a *= 0.85 + 0.15 * sin(uTime * 3.0 + vH * 12.0); gl_FragColor = vec4(uColor * a, a); }`,
  });
}

// ---------------------------------------------------------------- the scene
export class FacilityScene {
  constructor() {
    this.name = 'facility';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.scene.fog = new THREE.Fog(0x05070a, 6, 17);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 60);
    this.progress = 0; this.shownProgress = 0; this.label = 'waking the facility'; this.mode = 'loading';
    this.runX = 0; this.time = 0; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.hands = []; this.handCycle = null; this.dustBursts = [];
    this.leap = 0; this.boost = 0; this.scramble = 0;
    this.menu = null;
    window.addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
  }

  async init(onProgress = () => {}) {
    const S = this.scene;
    const loader = new THREE.TextureLoader();
    const loadT = (path, rep, srgb = false) => { const t = loader.load(assetUrl(path)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const loadImg = (path) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = assetUrl(path); });
    const [wallImg, floorImg] = await Promise.all([loadImg('tex/paintedConcrete_diff.jpg'), loadImg('tex/concrete_diff.jpg'), this.loadModels()]);
    // shared materials (CC0 Poly Haven surfaces)
    const nWall = loadT('tex/paintedConcrete_nor.jpg', [4 / 3, 2.55 / 3]), nFloor = loadT('tex/concrete_nor.jpg', [4 / 3, 3.3 / 3]);
    this.mats = {
      walls: [0, 1, 2].map((v) => new THREE.MeshStandardMaterial({ map: wallTexture(v, wallImg), normalMap: nWall, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, envMapIntensity: 0.2 })),
      floor: new THREE.MeshStandardMaterial({ map: floorTexture(floorImg), normalMap: nFloor, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.42, metalness: 0.05, envMapIntensity: 0.9 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.95 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x5d636b, roughness: 0.4, metalness: 0.75, envMapIntensity: 0.8 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.5, metalness: 0.6 }),
      redPipe: new THREE.MeshStandardMaterial({ color: 0x7c2a22, roughness: 0.5, metalness: 0.3 }),
      greenPipe: new THREE.MeshStandardMaterial({ color: 0x2c4f3c, roughness: 0.55, metalness: 0.3 }),
      concrete: new THREE.MeshStandardMaterial({ map: loadT('tex/concrete_diff.jpg', [0.3, 1], true), normalMap: loadT('tex/concrete_nor.jpg', [0.3, 1]), roughness: 0.9 }),
      hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 }),
      door: new THREE.MeshStandardMaterial({ color: 0x3a4a44, roughness: 0.55, metalness: 0.45 }),
      tube: new THREE.MeshBasicMaterial({ color: new THREE.Color(5.2, 5.6, 4.9) }),
      tubeOff: new THREE.MeshBasicMaterial({ color: 0x30332f }),
      red: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.25) }),
      redGlass: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.12, 0.08) }),
      cable: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.6 }),
    };
    this.signTex = SIGNS.map(signTexture);
    this.stencils = [stencilTexture('F-07', 'FELINE CONTAINMENT'), stencilTexture('B-3', 'NO ESCAPE ROUTE'), stencilTexture('7', 'KEEP DOORS SEALED')];
    // live progress readout shared by every wall monitor
    this.monCanvas = document.createElement('canvas'); this.monCanvas.width = 512; this.monCanvas.height = 300;
    this.monTex = new THREE.CanvasTexture(this.monCanvas); this.monTex.colorSpace = THREE.SRGBColorSpace;
    this.drawMonitor();
    onProgress(0.2);
    // lights
    S.add(new THREE.HemisphereLight(0x33456a, 0x0a0809, 0.26));
    this.fixLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xd9f0d6, 3, 4.6, 2); S.add(l); return l; });
    this.key = new THREE.SpotLight(0xeef6e8, 14, 7, 0.62, 0.75, 2);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03;
    this.key.shadow.camera.near = 0.3; this.key.shadow.camera.far = 9;
    S.add(this.key, this.key.target);
    this.redLight = new THREE.PointLight(0xff2a14, 0, 7, 1.6); S.add(this.redLight);
    this.rimLight = new THREE.DirectionalLight(0x6f86ff, 0.55); this.rimLight.position.set(-3, 2, -4); S.add(this.rimLight, this.rimLight.target);
    // corridor
    this.segments = [];
    for (let i = 0; i < NSEG; i++) { const seg = this.buildSegment(i); seg.x0 = (i - 3) * SEG; seg.group.position.x = seg.x0; this.dress(seg); S.add(seg.group); this.segments.push(seg); }
    onProgress(0.6);
    this.buildDust();
    // the cat
    this.cat = spawn('tofu');
    this.cat.root.rotation.y = Math.PI / 2;
    this.cat.anim.move(RUN, 'gallop'); this.cat.anim.scared(0.7);
    // a sprinting cat streams its tail out behind instead of holding it up
    if (this.cat.anim instanceof CatAnimator) this.cat.anim.custom = (rig, t) => { const k = this.scramble > 0 ? 1.25 : 0.95; rig.add('tail1', k, 0.12 * Math.sin(t * 7), 0); rig.add('tail2', 0.2, 0.1 * Math.sin(t * 7 - 1), 0); rig.add('tail3', -0.05, 0, 0); };
    S.add(this.cat.root);
    // env reflections (CC0 Poly Haven "lab" HDRI), best-effort
    import('../gfx/env.js').then(({ loadEnv }) => loadEnv(game.gfx.renderer, 'lab')).then((env) => { S.environment = env; S.environmentIntensity = 0.35; }).catch(() => {});
    // hands come in the background so the scene can start running immediately
    this.handsReady = buildHandTemplate().then(() => {
      this.hands = [new GiantHand({ scale: 7.2 }), new GiantHand({ scale: 6.4, mirror: true })];
      for (const h of this.hands) { h.root.visible = false; S.add(h.root); }
      this.nextGrab = 1.2;
    }).catch((e) => console.warn('hands failed', e));
    this.updateCamera(1, true);
    onProgress(1);
  }

  async loadModels() {
    this.models = {};
    const L = new GLTFLoader();
    await Promise.all(['fluoro', 'camera', 'fireAlarm', 'trashCan', 'box', 'wallClock'].map(async (n) => {
      try {
        const g = await L.loadAsync(assetUrl(`furniture/${n}.glb`));
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = n !== 'fluoro'; o.receiveShadow = true; } });
        this.models[n] = g.scene;
      } catch (e) { console.warn('facility model failed', n, e); }
    }));
  }
  model(n) { const m = this.models[n]; return m ? m.clone(true) : null; }

  // A 4 m slice of corridor. Static parts are merged per material; variable props are toggled on recycle.
  buildSegment(i) {
    const group = new THREE.Group(), M = this.mats, parts = new Map();
    const push = (mat, g) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(ni(g)); };
    // shell
    const floor = new THREE.PlaneGeometry(SEG, 3.3); floor.rotateX(-Math.PI / 2); floor.translate(SEG / 2, 0, WALL_Z + 1.65); push(M.floor, floor);
    const ceil = new THREE.PlaneGeometry(SEG, 3.3); ceil.rotateX(Math.PI / 2); ceil.translate(SEG / 2, CEIL, WALL_Z + 1.65); push(M.ceiling, ceil);
    const wall = new THREE.PlaneGeometry(SEG, CEIL); wall.translate(SEG / 2, CEIL / 2, WALL_Z);
    push(M.walls[i % 3], wall);
    push(M.hazard, at(rbox(SEG, 0.12, 0.05, 0.015), SEG / 2, 0.06, WALL_Z + 0.025));               // kick plate
    for (const x of [0, SEG]) push(M.darkMetal, at(rbox(0.16, CEIL, 0.1, 0.03), x, CEIL / 2, WALL_Z + 0.05)); // wall ribs
    // pipes with flanges & clamps
    const pipes = [[1.72, 0.07, M.metal], [1.92, 0.05, M.redPipe], [2.08, 0.085, M.greenPipe], [2.3, 0.045, M.metal]];
    for (const [y, r, mat] of pipes) {
      const p = new THREE.CylinderGeometry(r, r, SEG, 16, 1, true); p.rotateZ(Math.PI / 2); p.translate(SEG / 2, y, WALL_Z + 0.2 + r); push(mat, p);
      const f = new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.05, 16); f.rotateZ(Math.PI / 2); push(mat, at(f, 0.02, y, WALL_Z + 0.2 + r));
      for (const cx of [1, 3]) { const c = new THREE.TorusGeometry(r * 1.08, 0.012, 6, 16); c.rotateY(Math.PI / 2); push(M.darkMetal, at(c, cx, y, WALL_Z + 0.2 + r)); }
    }
    for (const cx of [1, 3]) push(M.darkMetal, at(rbox(0.06, 0.75, 0.3, 0.01), cx, 1.98, WALL_Z + 0.15)); // pipe brackets
    // cable tray
    push(M.darkMetal, at(rbox(SEG, 0.03, 0.42, 0.01), SEG / 2, 2.44, WALL_Z + 0.5));
    push(M.darkMetal, at(rbox(SEG, 0.09, 0.02, 0.005), SEG / 2, 2.48, WALL_Z + 0.71));
    for (let k = 0; k < 5; k++) { const c = new THREE.CylinderGeometry(0.018, 0.018, SEG, 6); c.rotateZ(Math.PI / 2); push(M.cable, at(c, SEG / 2, 2.475, WALL_Z + 0.36 + k * 0.05)); }
    // ceiling beams
    for (const bx of [0, SEG / 2]) push(M.darkMetal, at(rbox(0.22, 0.24, 3.3, 0.03), bx, CEIL - 0.12, WALL_Z + 1.65));
    // fluorescent fixture (center of segment, mid-corridor)
    const fz = -0.15;
    if (!this.models.fluoro) push(M.darkMetal, at(rbox(1.4, 0.08, 0.26, 0.025), SEG / 2, 2.0, fz));
    for (const cx of [-0.55, 0.55]) { const ch = new THREE.CylinderGeometry(0.006, 0.006, 0.52, 4); push(M.metal, at(ch, SEG / 2 + cx, 2.28, fz)); }
    const tubeGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.25, 10); tubeGeo.rotateZ(Math.PI / 2);
    // foreground pillar with hazard tape (every other segment)
    let pillar = null;
    if (i % 3 === 0) {
      pillar = new THREE.Group();
      const col = new THREE.Mesh(rbox(0.3, CEIL + 0.2, 0.3, 0.04), M.concrete); col.position.set(0.6, CEIL / 2, FG_Z + 0.3);
      const t1 = new THREE.Mesh(rbox(0.32, 0.18, 0.32, 0.02), M.hazard); t1.position.set(0.6, 0.55, FG_Z + 0.3);
      const t2 = t1.clone(); t2.position.y = 1.4;
      for (const m of [col, t1, t2]) { m.castShadow = true; pillar.add(m); }
      group.add(pillar);
    }
    // merge
    for (const [mat, list] of parts) {
      const g = mergeGeometries(list, false); const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true; m.castShadow = mat !== M.floor && mat !== M.ceiling && !M.walls.includes(mat);
      group.add(m);
    }
    // dynamic props
    const tube = new THREE.Mesh(tubeGeo, M.tube); tube.position.set(SEG / 2, 1.945, fz); tube.layers.set(2); group.add(tube);
    let glass = null;
    if (this.models.fluoro) {
      const f = this.model('fluoro'); f.scale.setScalar(1.45); f.position.set(SEG / 2, 2.04, fz); group.add(f); tube.visible = false;
      f.traverse((o) => { if (o.isMesh && /glass/.test(o.material.name)) { glass ??= o.material.clone(); glass.emissive = new THREE.Color(0xeefbe8); o.material = glass; } });
    }
    // facility dressing: CC0 Poly Haven security camera, fire alarm, wall clock, bins and boxes
    const cam = this.model('camera'); if (cam) { cam.position.set(0.35, 2.12, WALL_Z + 0.31); group.add(cam); }
    const alarm = this.model('fireAlarm'); if (alarm) { alarm.scale.setScalar(1.6); alarm.position.set(3.55, 1.38, WALL_Z + 0.002); group.add(alarm); }
    const clock = this.model('wallClock'); if (clock) { clock.position.set(2.55, 2.02, WALL_Z + 0.002); group.add(clock); }
    const bins = this.model('trashCan'); if (bins) { bins.scale.setScalar(0.85); bins.position.set(0.9, 0, WALL_Z + 0.32); group.add(bins); }
    const boxes = new THREE.Group();
    if (this.models.box) for (const [bx, by, bz, ry] of [[0, 0, 0, 0.1], [0.42, 0, 0.05, -0.2], [0.18, 0.33, 0.02, 0.5]]) { const b = this.model('box'); b.position.set(bx, by, bz); b.rotation.y = ry; boxes.add(b); }
    boxes.position.set(3.1, 0, WALL_Z + 0.32); group.add(boxes);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.55, 1.93, 24, 1, true), coneMaterial(0xdff5dc)); cone.position.set(SEG / 2, 0.965, fz); cone.layers.set(2); group.add(cone);
    const sign = new THREE.Mesh(rbox(0.9, 0.39, 0.03, 0.01), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
    sign.material.map = this.signTex[0]; sign.position.set(1.25, 1.35, WALL_Z + 0.03); sign.castShadow = true; group.add(sign);
    // the UV of an extruded box face is in shape units; remap the front face to 0..1
    remapFrontUV(sign.geometry, 0.9, 0.39);
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.76), new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    stencil.position.set(2.0, 0.5, WALL_Z + 0.006); stencil.layers.set(2); group.add(stencil);
    const monitor = this.buildMonitor(); monitor.position.set(3.0, 1.32, WALL_Z + 0.12); group.add(monitor);
    const door = this.buildDoor(); door.position.set(2.0, 0, WALL_Z + 0.04); group.add(door);
    const beacon = this.buildBeacon(); beacon.position.set(0.55, 2.0, WALL_Z + 0.16); group.add(beacon);
    const vent = this.buildVent(); vent.position.set(3.2, 0.32, WALL_Z + 0.04); group.add(vent);
    const cables = this.buildCables(i); group.add(cables);
    return { group, pillar, tube, glass, cone, sign, stencil, monitor, door, beacon, vent, cables, cam, alarm, clock, bins, boxes, idx: i, on: 1, flick: 0, seed: i * 7.13 };
  }
  buildMonitor() {
    const g = new THREE.Group(), M = this.mats;
    const body = new THREE.Mesh(rbox(0.6, 0.42, 0.3, 0.05), M.darkMetal); body.castShadow = true; g.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ map: this.monTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
    screen.position.z = 0.151; screen.layers.set(2); g.add(screen);
    const arm = new THREE.Mesh(rbox(0.06, 0.06, 0.25, 0.01), M.metal); arm.position.set(0, 0.25, -0.1); g.add(arm);
    return g;
  }
  buildDoor() {
    const g = new THREE.Group(), M = this.mats;
    const frameL = new THREE.Mesh(rbox(0.16, 2.2, 0.14, 0.03), M.hazard); frameL.position.set(-0.68, 1.1, 0.05);
    const frameR = frameL.clone(); frameR.position.x = 0.68;
    const top = new THREE.Mesh(rbox(1.52, 0.18, 0.14, 0.03), M.hazard); top.position.set(0, 2.2, 0.05);
    const slab = new THREE.Mesh(rbox(1.22, 2.04, 0.08, 0.04), M.door); slab.position.set(0, 1.04, 0.02);
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), M.metal); port.position.set(0, 1.5, 0.08);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), M.redGlass); glass.position.set(0, 1.5, 0.075); glass.layers.set(2);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 6, 20), M.metal); wheel.position.set(0, 1.0, 0.1);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshStandardMaterial({ map: canvasTex(256, 80, (c, w, h) => { c.fillStyle = '#e8e2cc'; c.font = '800 54px "Big Shoulders Stencil", sans-serif'; c.textAlign = 'center'; c.fillText('F-07', w / 2, 60); }), transparent: true, roughness: 0.9 }));
    label.position.set(0, 0.55, 0.065); label.layers.set(2);
    for (const m of [frameL, frameR, top, slab, port, wheel]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(frameL, frameR, top, slab, port, glass, wheel, label);
    return g;
  }
  buildBeacon() {
    const g = new THREE.Group(), M = this.mats;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 16), M.darkMetal);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.red); dome.position.y = 0.03; dome.layers.set(2);
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 16, 1, true), coneMaterial(0xff2010)); ray.rotation.z = Math.PI / 2; ray.position.set(1.2, 0.04, 0); ray.layers.set(2);
    const pivot = new THREE.Group(); pivot.add(ray); pivot.position.y = 0.05;
    g.add(base, dome, pivot); g.rotation.x = Math.PI / 2; g.userData.pivot = pivot; g.userData.ray = ray;
    return g;
  }
  buildVent() {
    const g = new THREE.Group(), M = this.mats;
    const frame = new THREE.Mesh(rbox(0.7, 0.45, 0.05, 0.02), M.metal); g.add(frame);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.37), new THREE.MeshBasicMaterial({ color: 0x020203 })); hole.position.z = 0.026; g.add(hole);
    for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(rbox(0.62, 0.035, 0.03, 0.008), M.darkMetal); s.position.set(0, -0.15 + k * 0.06, 0.04); s.rotation.x = -0.6; g.add(s); }
    return g;
  }
  buildCables(i) {
    const r = rng(100 + i), g = new THREE.Group();
    for (let k = 0; k < 2; k++) {
      const x0 = r() * SEG, x1 = x0 + 0.8 + r() * 1.6, z = FG_Z - 0.2 + r() * 0.5, sag = 0.4 + r() * 0.7;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, CEIL, z), new THREE.Vector3((x0 + x1) / 2, CEIL - sag, z), new THREE.Vector3(x1, CEIL, z)]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.014 + r() * 0.01, 5), this.mats.cable); m.castShadow = true; g.add(m);
    }
    return g;
  }
  // Randomise a segment's optional props on (re)placement.
  dress(seg) {
    const r = rng(Math.floor(seg.x0 / SEG) * 9301 + 49297);
    const kind = r();
    seg.door.visible = kind < 0.3;
    seg.stencil.visible = !seg.door.visible && kind < 0.62;
    seg.vent.visible = !seg.door.visible && r() < 0.6;
    seg.beacon.visible = r() < 0.45;
    seg.monitor.visible = r() < 0.7;
    seg.sign.visible = r() < 0.8;
    seg.sign.material.map = this.signTex[Math.floor(r() * this.signTex.length)]; seg.sign.material.needsUpdate = true;
    seg.stencil.material.map = this.stencils[Math.floor(r() * this.stencils.length)]; seg.stencil.material.needsUpdate = true;
    seg.cables.visible = r() < 0.7;
    if (seg.cam) seg.cam.visible = r() < 0.5;
    if (seg.alarm) seg.alarm.visible = !seg.door.visible && r() < 0.5;
    if (seg.clock) seg.clock.visible = !seg.door.visible && !seg.monitor.visible && r() < 0.6;
    if (seg.bins) seg.bins.visible = !seg.door.visible && r() < 0.35;
    seg.boxes.visible = !seg.vent.visible && r() < 0.45;
    seg.lightSeed = r();
  }

  buildDust() {
    const N = 900, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const r = rng(5);
    for (let i = 0; i < N; i++) { pos[i * 3] = r() * 16 - 6; pos[i * 3 + 1] = r() * 2.5; pos[i * 3 + 2] = WALL_Z + 0.2 + r() * 2.7; seed[i] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCamX: { value: 0 }, uSeg: { value: SEG }, uPR: { value: 1 }, uLight: { value: 1 } },
      vertexShader: `attribute float seed; uniform float uTime; uniform float uCamX; uniform float uSeg; uniform float uPR; uniform float uLight; varying float vA;
        void main(){ vec3 p = position;
          p.x = uCamX - 6.0 + mod(p.x - uCamX + 6.0 + uTime * (0.05 + seed * 0.1), 16.0);
          p.y = mod(p.y + uTime * (0.02 + seed * 0.04) * (seed > 0.5 ? 1.0 : -1.0), 2.5);
          p.x += sin(uTime * 0.7 + seed * 40.0) * 0.08; p.z += cos(uTime * 0.5 + seed * 30.0) * 0.08;
          float fx = abs(mod(p.x, uSeg) - uSeg * 0.5); float pool = exp(-fx * fx * 1.4) * smoothstep(2.4, 0.4, p.y) * uLight;
          vA = (0.12 + pool * 1.6) * (0.55 + 0.45 * sin(uTime * 2.0 + seed * 60.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.5 + seed * 5.0) * uPR * (4.0 / -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; float a = vA * smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a, a); }`,
    });
    this.dust = new THREE.Points(g, this.dustMat); this.dust.frustumCulled = false; this.dust.layers.set(2);
    this.scene.add(this.dust);
    // impact puffs
    const PN = 70, pp = new Float32Array(PN * 3);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(PN), 1)); pg.setAttribute('size', new THREE.BufferAttribute(new Float32Array(PN), 1));
    this.puffMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uPR: { value: 1 } },
      vertexShader: `attribute float alpha; attribute float size; uniform float uPR; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPR * (300.0 / -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = vA * smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vec3(0.62, 0.6, 0.56), a * 0.55); }`,
    });
    this.puffs = new THREE.Points(pg, this.puffMat); this.puffs.frustumCulled = false; this.puffs.layers.set(2); this.scene.add(this.puffs);
    this.puffData = Array.from({ length: PN }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, s: 0 }));
  }
  burst(pos, n = 40, power = 1) {
    let k = 0;
    for (const d of this.puffData) {
      if (d.life > 0) continue;
      const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 1.8) * power;
      d.p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.02, (Math.random() - 0.5) * 0.4));
      d.v.set(Math.cos(a) * s, 0.3 + Math.random() * 1.2 * power, Math.sin(a) * s * 0.6);
      d.max = d.life = 0.8 + Math.random() * 0.9; d.s = 0.15 + Math.random() * 0.25;
      if (++k >= n) break;
    }
  }

  drawMonitor() {
    const g = this.monCanvas.getContext('2d'), w = 512, h = 300, p = Math.round(this.shownProgress * 100);
    g.fillStyle = '#04110a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5dff9a'; g.font = '30px VT323, monospace'; g.textAlign = 'left';
    g.fillText('DTP CONTAINMENT // SECTOR 7', 22, 40);
    g.fillText("SUBJECT F-07  \"TOFU\"  (FELINE)", 22, 76);
    g.fillStyle = p >= 100 ? '#ff6a5a' : '#5dff9a';
    g.font = '30px VT323, monospace'; g.fillText('ESCAPE PROBABILITY', 22, 128);
    g.font = '92px VT323, monospace'; g.fillText(`${p}%`, 22, 210);
    g.font = '24px VT323, monospace'; g.fillStyle = '#3fbf74';
    g.fillText(p >= 100 ? 'STATUS: UNACCEPTABLE. DEPLOY HANDS.' : `> ${this.label.toUpperCase()}${Math.floor(this.time * 2) % 2 ? '_' : ''}`, 22, 262);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    this.monTex.needsUpdate = true;
  }
  setProgress(p, label) { this.progress = clamp(Math.max(this.progress, p)); if (label) this.label = label; }

  enter({ mode = 'loading' } = {}) {
    this.mode = mode;
    const gfx = game.gfx;
    gfx.setGrade({ exposure: 1.2, bloom: 0.7, bloomThreshold: 1.0, saturation: 0.92, contrast: 1.12, lift: [0.01, 0.014, 0.03], gamma: [1, 1, 1.02], gain: [1.02, 1, 0.98],
      tint: [0.96, 1, 1.05], temperature: -0.15, vignette: 0.6, grain: 0.035, ca: 0.35, dof: 0, fade: 0, flash: 0, letterbox: 0, warp: 0 });
    if ('inkFar' in gfx.grade) gfx.grade.inkFar = 18;
    const a = game.audio;
    if (a?.ctx) {
      this.loops = [a.loop('hum', { vol: 0.06, bus: 'amb' }), a.loop('alarm', { vol: 0.035, lowpass: 900, bus: 'amb', reverb: 0.5 }), a.loop('wind', { vol: 0.07, bus: 'amb' })];
      if (a.tracks?.has('menu')) a.music('menu', { fade: 3 });
    }
    if (mode === 'menu') this.showMenu();
  }
  exit() {
    for (const l of this.loops || []) l.stop(0.8);
    this.loops = [];
    this.menu?.unmount(); this.menu = null;
  }
  showMenu() {
    if (this.mode === 'menu' && this.menu) return;
    this.mode = 'menu'; this.progress = 1;
    this.menuT = 0;
    this.menu = mountMenu(game, {
      hasSave: hasSave(),
      onNew: () => game.events.emit('menu:new'),
      onContinue: () => game.events.emit('menu:continue'),
    });
  }
  hideMenu() { this.menu?.unmount(); this.menu = null; }

  // NEW GAME flourish: Tofu dives into a vent, a hand slams the grille a beat too late, white-out.
  async playExit() {
    this.hideMenu();
    this.exiting = 0; this.exitDone = false;
    await new Promise((r) => { this._exitResolve = r; });
  }

  updateCamera(dt, snap = false) {
    const cx = this.runX;
    let pos, look;
    const m = this.mode === 'menu' ? ease.inOutCubic(clamp(this.menuT / 2.6)) : 0;
    const lp = new THREE.Vector3(cx + 0.2, 0.92, 3.5), ll = new THREE.Vector3(cx - 0.3, 0.78, 0);
    const mp = new THREE.Vector3(cx - 0.55, 1.12, 4.9), ml = new THREE.Vector3(cx - 1.25, 0.95, -0.2);
    pos = lp.lerp(mp, m); look = ll.lerp(ml, m);
    // handheld drift
    pos.x += noise1(this.time * 0.3, 1) * 0.06; pos.y += noise1(this.time * 0.4, 2) * 0.04;
    if (snap) { this.camPos.copy(pos); this.camLook.copy(look); }
    else { this.camPos.x = pos.x; this.camPos.y = damp(this.camPos.y, pos.y, 3, dt); this.camPos.z = damp(this.camPos.z, pos.z, 3, dt); this.camLook.x = look.x; this.camLook.y = damp(this.camLook.y, look.y, 3, dt); this.camLook.z = damp(this.camLook.z, look.z, 3, dt); }
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
  }

  // ---- the grab cycle: lurk -> reach -> lunge/slam (near miss) -> drum fingers -> retract
  updateHands(dt) {
    if (!this.hands.length) return;
    const cx = this.runX;
    if (!this.handCycle) {
      this.nextGrab -= dt;
      if (this.nextGrab <= 0) {
        const which = Math.random() < 0.7 ? 0 : 1;
        this.handCycle = { h: this.hands[which], t: 0, phase: 'reach', which, slammed: false, from: Math.random() < 0.5 ? 'high' : 'low' };
        this.handCycle.h.root.visible = true;
      }
      for (const h of this.hands) if (!this.handCycle || h !== this.handCycle.h) h.root.visible = false;
    }
    const c = this.handCycle;
    if (!c) return;
    c.t += dt;
    const h = c.h, z = c.which ? -0.25 : 0.1;
    const lurk = new THREE.Vector3(cx - 5.4, c.from === 'high' ? 2.6 : 1.9, z - 0.3);
    const reach = new THREE.Vector3(cx - 3.05, c.from === 'high' ? 1.75 : 1.25, z);
    const slam = new THREE.Vector3(cx - 2.05, 0.52, z + 0.05);
    let p, dir;
    if (c.phase === 'reach') {
      const k = ease.inOutCubic(clamp(c.t / 2.4));
      p = lurk.clone().lerp(reach, k); dir = new THREE.Vector3(1, lerp(-0.25, -0.55, k), 0.05);
      h.setGrip(-0.2 + 0.1 * Math.sin(c.t * 5), 0.3);
      if (c.t > 2.4 + Math.random() * 0.02) { c.phase = 'lunge'; c.t = 0; this.onLunge(); }
    } else if (c.phase === 'lunge') {
      const k = ease.inCubic(clamp(c.t / 0.32));
      p = reach.clone().lerp(slam, k); dir = new THREE.Vector3(1, lerp(-0.55, -0.34, k), 0.05);
      h.setGrip(lerp(-0.25, 1.05, k * k), 0.1);
      if (c.t >= 0.32 && !c.slammed) { c.slammed = true; this.onSlam(h); }
      if (c.t > 0.32) { c.phase = 'hold'; c.t = 0; }
    } else if (c.phase === 'hold') {
      p = slam.clone(); p.y += Math.sin(Math.min(1, c.t * 6) * Math.PI) * 0.04; dir = new THREE.Vector3(1, -0.34, 0.05);
      if (c.t > 0.5 && c.t < 0.6) { h.setGrip(0.35, 0.15); }           // ...empty?
      if (c.t > 0.75 && !c.drummed) { c.drummed = true; h.drum(); }      // drums its fingers, annoyed
      if (c.t > 2.1) { c.phase = 'retract'; c.t = 0; }
    } else {
      const k = ease.inOutCubic(clamp(c.t / 1.5));
      p = slam.clone().lerp(lurk, k); dir = new THREE.Vector3(1, lerp(-0.34, -0.3, k), 0.05);
      h.setGrip(0.5, 0.1);
      if (c.t > 1.5) { h.root.visible = false; this.handCycle = null; this.nextGrab = (this.mode === 'menu' ? 2.5 : 1.0) + Math.random() * 3; }
    }
    if (p) { h.root.position.copy(p); h.orient(dir); }
    h.update(dt);
  }
  onLunge() {
    this.cat.anim.scared(1);
    this.scramble = 0.55; this.leap = 0.001; this.boost = 1;
    game.audio?.sfx('whoosh_low', { vol: 0.7, rate: 0.8 });
    if (Math.random() < 0.6) game.audio?.sfx(Math.random() < 0.5 ? 'yowl' : 'hiss', { vol: 0.45, rate: 1 + Math.random() * 0.2 });
  }
  onSlam(h) {
    const tip = new THREE.Vector3(1.4, -0.1, 0).applyQuaternion(h.root.quaternion).add(h.root.position);
    tip.y = 0.02;
    this.burst(tip, 45, 1.2);
    game.gfx?.addShake(0.75);
    game.audio?.sfx('thud', { vol: 0.95, rate: 0.7 });
    game.audio?.sfx('kick', { vol: 0.5, rate: 0.6, delay: 0.02 });
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.mode === 'menu') this.menuT += dt;
    // progress readout eases towards the real value
    const prev = Math.round(this.shownProgress * 100);
    this.shownProgress = damp(this.shownProgress, this.progress, 3, dt);
    if (Math.round(this.shownProgress * 100) !== prev || Math.floor(this.time * 2) !== this._blink) { this._blink = Math.floor(this.time * 2); this.drawMonitor(); }
    // run
    const exiting = this.exiting != null;
    this.boost = Math.max(0, this.boost - dt * 0.8);
    const speed = RUN * (1 + this.boost * 0.35);
    this.runX += speed * dt;
    const cat = this.cat;
    // cat sits slightly ahead of center; lunges push it forward for a beat
    const catX = this.runX + this.boost * 0.45 + (exiting ? this.exiting * 1.2 : 0);
    cat.root.position.x = catX;
    if (this.leap > 0) { this.leap += dt; const k = this.leap / 0.55; cat.root.position.y = Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * 0.32; if (k >= 1) { this.leap = 0; cat.root.position.y = 0; } }
    this.scramble = Math.max(0, this.scramble - dt);
    cat.anim.move(speed, this.scramble > 0 ? 'scramble' : 'gallop');
    cat.anim.scared(this.scramble > 0 ? 0.6 : 0.4);
    // glance back at the hand now and then
    const glance = this.handCycle && (this.handCycle.phase === 'reach' && this.handCycle.t > 1.2);
    cat.anim.lookAt(glance ? this.handCycle.h.root.position.clone().add(new THREE.Vector3(1.6, -0.3, 0)) : null);
    if (this.mode === 'menu' && !glance && Math.sin(this.time * 0.37) > 0.985) cat.anim.lookAt(this.camera.position.clone());
    cat.update(dt);
    // paw patter
    this._stepT = (this._stepT || 0) - dt;
    if (this._stepT <= 0 && cat.root.position.y < 0.02) { this._stepT = 0.105; game.audio?.sfx('step', { vol: 0.07, rate: 2.6, detune: 0.15, reverb: 0.05 }); }
    // exit cinematic
    if (exiting) this.updateExit(dt);
    // recycle segments
    for (const seg of this.segments) {
      if (seg.x0 + SEG < this.runX - 11) { seg.x0 += NSEG * SEG; seg.group.position.x = seg.x0; this.dress(seg); }
    }
    // lights: fixtures come on ahead as loading progresses; nearest ones drive real lights
    const prog = this.mode === 'menu' ? 1 : this.shownProgress;
    const sorted = [...this.segments].sort((a, b) => Math.abs(a.x0 + SEG / 2 - this.runX) - Math.abs(b.x0 + SEG / 2 - this.runX));
    for (const seg of this.segments) {
      const ahead = seg.x0 + SEG / 2 > this.runX + 2;
      let on = ahead ? (seg.lightSeed < 0.22 + prog * 0.85 ? 1 : 0) : 1;
      // unstable tubes flicker
      if (seg.lightSeed > 0.82 || (ahead && Math.abs(seg.lightSeed - (0.22 + prog * 0.85)) < 0.08)) on *= (noise1(this.time * 9 + seg.seed, 3) > -0.15 ? 1 : 0.05);
      seg.on = damp(seg.on, on, on > seg.on ? 30 : 12, dt);
      seg.tube.material = seg.on > 0.5 ? this.mats.tube : this.mats.tubeOff;
      if (seg.pillar) seg.pillar.visible = this.mode !== 'menu' || this.menuT < 0.8;
      if (seg.glass) seg.glass.emissiveIntensity = 0.15 + 4.5 * seg.on;
      if (seg.cam?.visible) { const cx = this.cat.root.position.x - (seg.x0 + 0.35); seg.cam.rotation.y = clamp(Math.atan2(cx, 1.6), -1.1, 1.1); seg.cam.rotation.x = 0.25; }
      seg.cone.material.uniforms.uOn.value = seg.on; seg.cone.material.uniforms.uTime.value = this.time;
      if (seg.beacon.visible) { seg.beacon.userData.pivot.rotation.y = this.time * 4.5 + seg.seed; }
    }
    sorted.slice(0, 3).forEach((seg, i) => { const l = this.fixLights[i]; l.position.set(seg.x0 + SEG / 2, 1.82, -0.15); l.intensity = 3.2 * seg.on; });
    const keySeg = sorted[0];
    this.key.position.set(keySeg.x0 + SEG / 2, 1.9, -0.05); this.key.target.position.set(this.runX + 0.2, 0, 0.1); this.key.intensity = 12 * keySeg.on + 1.5;
    const bSeg = sorted.find((s) => s.beacon.visible);
    if (bSeg) { this.redLight.position.set(bSeg.x0 + 0.55, 1.9, WALL_Z + 0.5); this.redLight.intensity = 2.6 * (0.55 + 0.45 * Math.sin(this.time * 4.5 * 2)); } else this.redLight.intensity = 0;
    this.rimLight.position.set(this.runX - 3, 2.2, -3.5); this.rimLight.target.position.set(this.runX, 0.4, 0);
    // dust
    this.dustMat.uniforms.uTime.value = this.time; this.dustMat.uniforms.uCamX.value = this.runX; this.dustMat.uniforms.uPR.value = game.gfx?.pixelRatio || 1; this.dustMat.uniforms.uLight.value = 0.3 + 0.7 * prog;
    const pa = this.puffs.geometry.attributes;
    this.puffData.forEach((d, i) => {
      if (d.life > 0) { d.life -= dt; d.v.multiplyScalar(1 - dt * 2.2); d.v.y -= dt * 0.4; d.p.addScaledVector(d.v, dt); }
      pa.position.setXYZ(i, d.p.x, d.p.y, d.p.z); const k = Math.max(0, d.life / d.max); pa.alpha.setX(i, k * k); pa.size.setX(i, d.s * (1.5 - k));
    });
    pa.position.needsUpdate = pa.alpha.needsUpdate = pa.size.needsUpdate = true;
    this.puffMat.uniforms.uPR.value = game.gfx?.pixelRatio || 1;
    this.updateHands(dt);
    this.updateCamera(dt);
  }

  updateExit(dt) {
    this.exiting += dt;
    const t = this.exiting;
    if (!this._exitVent) {
      // place a dark vent duct just ahead of the cat on the floor-level wall
      const seg = this.segments.find((s) => s.x0 > this.runX + 1) || this.segments[0];
      seg.vent.visible = true; seg.door.visible = false; seg.vent.position.x = this.runX + 2.4 - seg.x0;
      this._exitVent = seg.vent; game.audio?.sfx('whoosh', { vol: 0.5 });
      if (this.hands.length) { this.handCycle = { h: this.hands[0], t: 0, phase: 'reach', which: 0, from: 'high' }; this.hands[0].root.visible = true; this.handCycle.t = 1.8; }
    }
    if (t > 0.6 && !this._dove) { this._dove = true; this.leap = 0.001; this.cat.anim.scared(1); game.audio?.sfx('mrrp', { vol: 0.6 }); }
    if (t > 0.95) this.cat.root.visible = false;
    if (t > 1.15 && !this._clang) { this._clang = true; game.gfx?.addShake(1); game.audio?.sfx('door_break', { vol: 0.7 }); this.burst(new THREE.Vector3(this.runX + 2.4, 0.3, WALL_Z + 0.4), 40, 0.8); }
    if (t > 1.3) game.gfx.grade.flash = clamp((t - 1.3) / 0.9);
    if (t > 2.4 && !this.exitDone) { this.exitDone = true; this._exitResolve?.(); }
  }
}

function remapFrontUV(g, w, h) {
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { if (n.getZ(i) > 0.9) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5); }
  uv.needsUpdate = true;
}
