// Material library. All world materials are MeshStandardMaterial (PBR) with
// pixel textures and the world patch (vertex snapping + reality warp).
import * as THREE from 'three';
import { patchWorld } from '../core/engine.js';
import * as T from './textures.js';

export const M = {};

// Everything in this world is old, dusty and handled: no fresh lacquer, no
// showroom gloss. Pull authored roughness toward matte (mirrors/glass excepted).
const GLOSSY = new Set(['mirror', 'glass', 'glassDirt', 'mirrorBack']);
function matte(name, r, metal) { return GLOSSY.has(name) ? r : r + (1 - r) * (metal > 0.5 ? 0.3 : 0.5); }

// one pass over everything built so far (inline materials included)
export function matteAll(root) {
  const seen = new Set();
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (seen.has(m) || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.userData.matte || m.userData.keepGloss || GLOSSY.has(m.name)) continue;
      seen.add(m); m.userData.matte = true;
      if (!M[m.name] || M[m.name] !== m) m.roughness = matte(m.name, m.roughness, m.metalness);
      m.envMapIntensity *= 0.5;
    }
  });
}

export function std(name, bundle = null, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    name,
    color: o.color ?? 0xffffff,
    roughness: matte(name, o.roughness ?? 0.85, o.metalness ?? 0),
    metalness: o.metalness ?? 0,
    envMapIntensity: o.env ?? 0.6,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    depthWrite: o.depthWrite ?? true,
    alphaTest: o.alphaTest ?? 0,
    flatShading: o.flat ?? false,
  });
  if (bundle) {
    if (bundle.map) m.map = bundle.map;
    if (bundle.normalMap) { m.normalMap = bundle.normalMap; m.normalScale = new THREE.Vector2(o.normal ?? 1, o.normal ?? 1); }
    if (bundle.roughnessMap && o.useRough !== false) m.roughnessMap = bundle.roughnessMap;
    m.userData.ws = bundle.worldSize || 1;
  }
  if (o.ws) m.userData.ws = o.ws;
  if (o.emissiveMap) m.emissiveMap = o.emissiveMap;
  if (o.patch !== false) patchWorld(m, { snap: o.snap ?? true, warp: o.warp ?? true, breath: o.breath ?? true });
  m.userData.matte = true;
  M[name] = m;
  return m;
}

export function basic(name, o = {}) {
  const m = new THREE.MeshBasicMaterial({
    name, color: o.color ?? 0xffffff, map: o.map ?? null, transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true,
    blending: o.blending ?? THREE.NormalBlending, fog: o.fog ?? true, toneMapped: true,
  });
  if (o.patch) patchWorld(m, { snap: true, warp: true, breath: false });
  M[name] = m;
  return m;
}

export function initMaterials() {
  // floors
  std('woodFloor', T.woodFloor({ seed: 3 }), { roughness: 0.6, normal: 1, env: 0.9 });
  std('woodFloorOld', T.woodFloor({ seed: 31, base: [96, 66, 44] }), { roughness: 0.75, normal: 1.2 });
  std('kitchenFloor', T.checker({ seed: 6 }), { roughness: 0.45, env: 1 });
  std('bathTiles', T.tiles({ seed: 5, base: [206, 210, 204], grout: [150, 150, 142], n: 8, worldSize: 0.8 }), { roughness: 0.3, env: 1.2 });
  std('bathFloor', T.tiles({ seed: 51, base: [170, 176, 182], grout: [110, 110, 106], n: 16, worldSize: 1 }), { roughness: 0.35, env: 1 });
  std('hallCarpet', T.carpet({ seed: 7, base: [96, 34, 36] }), { roughness: 1 });
  std('hallFloor', T.woodFloor({ seed: 33, base: [84, 54, 36], worldSize: 2.2 }), { roughness: 0.32, normal: 0.8, env: 1.4 });
  std('concrete', T.concrete({ seed: 15 }), { roughness: 0.95 });
  std('bedroomCarpet', T.carpet({ seed: 71, base: [120, 108, 90], pattern: false }), { roughness: 1 });

  // walls
  std('wallLiving', T.wallpaper({ seed: 1, base: [178, 168, 132], accent: [158, 144, 108] }), { roughness: 0.9 });
  std('wallBedroom', T.wallpaper({ seed: 12, base: [160, 170, 168], accent: [138, 150, 150], stripes: false }), { roughness: 0.9 });
  std('wallPaint', T.plaster({ seed: 2, base: [200, 194, 180] }), { roughness: 0.92 });
  std('wallKitchen', T.plaster({ seed: 21, base: [206, 196, 160], dirt: 0.3 }), { roughness: 0.85 });
  std('wallHall', T.wallpaper({ seed: 4, base: [170, 164, 140], accent: [150, 142, 118] }), { roughness: 0.6, env: 0.8 });
  std('wallEmpty', T.plaster({ seed: 44, base: [176, 170, 150], dirt: 0.55 }), { roughness: 0.95 });
  std('ceiling', T.ceiling({ seed: 4 }), { roughness: 0.95, normal: 0.25 });
  std('ceilingHall', T.ceiling({ seed: 41 }), { roughness: 0.95, normal: 0.25 });
  std('brick', T.brick({ seed: 16 }), { roughness: 0.95 });

  // trims & woods
  std('trim', T.plaster({ seed: 9, base: [214, 208, 192], dirt: 0.08, worldSize: 2 }), { roughness: 0.45, normal: 0.08, env: 0.8 });
  std('trimWood', T.woodDark({ seed: 10, base: [110, 72, 44] }), { roughness: 0.5 });
  std('woodDark', T.woodDark({ seed: 11, base: [80, 50, 32] }), { roughness: 0.55 });
  std('woodLight', T.woodDark({ seed: 12, base: [160, 120, 80] }), { roughness: 0.6 });
  std('woodTable', T.woodDark({ seed: 13, base: [120, 82, 52] }), { roughness: 0.4, env: 0.9 });
  std('counter', T.laminate({ seed: 11, base: [206, 198, 172] }), { roughness: 0.35, env: 1 });
  std('cabinet', T.woodDark({ seed: 14, base: [168, 140, 104] }), { roughness: 0.6 });

  // fabrics
  std('couchFabric', T.fabric({ seed: 8, base: [112, 86, 56], alt: [84, 64, 42] }), { roughness: 1 });
  std('bedsheet', T.fabric({ seed: 81, base: [190, 186, 176], alt: [170, 170, 176], plaid: false }), { roughness: 1 });
  std('quilt', T.patchwork({ seed: 9 }), { roughness: 1 });
  std('curtain', T.fabric({ seed: 82, base: [150, 110, 74], alt: [130, 92, 60], plaid: false, worldSize: 0.6 }), { roughness: 1, side: THREE.DoubleSide });
  std('showerCurtain', T.fabric({ seed: 83, base: [190, 206, 210], alt: [160, 180, 196], plaid: true, worldSize: 0.4 }), { roughness: 0.5, side: THREE.DoubleSide });
  std('towel', T.fabric({ seed: 84, base: [170, 60, 56], alt: [150, 50, 46], plaid: false, worldSize: 0.3 }), { roughness: 1, side: THREE.DoubleSide });
  std('rug', T.carpet({ seed: 72, base: [128, 54, 44], pattern: true }), { roughness: 1 });

  // appliances / hard surfaces
  std('enamel', T.enamel({ seed: 12 }), { roughness: 0.3, env: 1.2 });
  std('enamelYellow', T.enamel({ seed: 13, base: [214, 200, 150] }), { roughness: 0.3, env: 1.2 });
  std('porcelain', T.enamel({ seed: 14, base: [232, 232, 226], dirt: 0.2 }), { roughness: 0.15, env: 1.4 });
  std('beige', T.beigePlastic({ seed: 13 }), { roughness: 0.55 });
  std('plasticDark', T.beigePlastic({ seed: 15, base: [52, 50, 48] }), { roughness: 0.5 });
  std('chrome', T.metal({ seed: 14, base: [200, 200, 205] }), { roughness: 0.18, metalness: 1, env: 1.5 });
  std('steel', T.metal({ seed: 16, base: [160, 160, 162] }), { roughness: 0.35, metalness: 0.9, env: 1.2 });
  std('rustMetal', T.metal({ seed: 17, base: [120, 116, 110], rust: 0.6 }), { roughness: 0.7, metalness: 0.6 });
  std('radiator', T.metal({ seed: 18, base: [210, 204, 190], rust: 0.25 }), { roughness: 0.55, metalness: 0.3 });
  std('black', null, { color: 0x111111, roughness: 0.6 });
  std('blackGloss', null, { color: 0x050505, roughness: 0.15, env: 1.5 });
  std('cardboard', T.cardboard({ seed: 19 }), { roughness: 1 });
  std('flesh', T.fleshTex({ seed: 22 }), { roughness: 0.4, env: 1.2, normal: 1.4 });
  std('biomech', T.biomech({ seed: 23 }), { roughness: 0.35, metalness: 0.4, env: 1.4, normal: 1.6 });
  std('rubber', null, { color: 0x1a1a1a, roughness: 0.9 });
  std('paperWhite', null, { color: 0xe8e4d8, roughness: 0.95 });

  // doors
  std('doorWood', T.doorPanel({ seed: 17, base: [118, 80, 50] }), { roughness: 0.6, ws: 1 });
  std('doorPaint', T.doorPanel({ seed: 171, base: [196, 190, 176], painted: true }), { roughness: 0.45, ws: 1 });
  // plain painted / stained stock for doors whose panels are real geometry
  std('doorPaintFlat', T.enamel({ seed: 173, base: [200, 194, 180], dirt: 0.35 }), { roughness: 0.62, normal: 0.4 });
  std('doorHallFlat', T.enamel({ seed: 174, base: [104, 42, 36], dirt: 0.4 }), { roughness: 0.6, normal: 0.4 });
  std('doorHall', T.doorPanel({ seed: 172, base: [96, 40, 34], painted: true }), { roughness: 0.4, env: 0.8, ws: 1 });

  // glass
  M.glass = new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide });
  M.glassDirt = new THREE.MeshStandardMaterial({ name: 'glassDirt', map: T.glassDirt({ seed: 20 }), transparent: true, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
  M.mirror = std('mirrorBack', null, { color: 0x222222, roughness: 0.1, metalness: 1 });
  return M;
}
