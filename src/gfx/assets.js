// CC0 models and painted surface textures from assets/ (built by
// tools/assets.py). Loading is best-effort: if the folder is missing (a
// file:// open, a stripped build) the world falls back to its procedural
// furniture and textures.
import * as THREE from 'three';
import { downsample } from './textures.js';
import { G } from '../core/globals.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { patchWorld } from '../core/engine.js';
import { M } from './materials.js';

export const ASSETS = { ok: false, manifest: null, models: {}, tex: {} };
const base = () => (typeof window !== 'undefined' && window.BENGRIM_ASSETS) || 'assets/';

const pixelTex = () => !G.settings || G.settings.v.pixelTex !== false;

function prepModel(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.roughness = 1; m.metalness = 0; m.envMapIntensity = 0;
      if (m.map) m.map.anisotropy = 4;
      if (m.normalMap) m.normalScale.multiplyScalar(0.7);
      // pixel-art texels on the props too
      if (pixelTex()) { if (m.map) m.map = downsample(m.map, 256); if (m.normalMap) m.normalMap = downsample(m.normalMap, 256); }
      m.userData.matte = true;
      // bend and breathe with the rest of the apartment
      patchWorld(m, { snap: true, warp: true, breath: false });
    }
  });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  scene.userData.box = box;
  return scene;
}

export async function loadAssets(onProgress = () => {}) {
  try {
    const res = await fetch(base() + 'manifest.json');
    if (!res.ok) throw new Error('manifest ' + res.status);
    const man = await res.json();
    ASSETS.manifest = man;
    const gl = new GLTFLoader();
    const tl = new THREE.TextureLoader();
    const jobs = [];
    // progress by bytes: models know their size, textures count as an average jpeg
    const TEX = 60000, got = {};
    const total = Object.values(man.models).reduce((a, m) => a + (m.bytes || 200000), 0) + Object.keys(man.textures).length * 2 * TEX;
    const mb = (b) => (b / 1048576).toFixed(1);
    const report = (k, b) => { got[k] = b; let sum = 0; for (const v of Object.values(got)) sum += v; onProgress(Math.min(1, sum / total), `${mb(sum)} / ${mb(total)} MB`); };
    const tick = (k, b = TEX) => report(k, b);
    for (const [name, m] of Object.entries(man.models)) {
      const size = m.bytes || 200000;
      jobs.push(gl.loadAsync(base() + m.file, (e) => report(name, Math.min(size, e.loaded || 0) * 0.9)).then((g) => { ASSETS.models[name] = prepModel(g.scene); tick(name, size); }).catch((e) => console.warn('model', name, e)));
    }
    for (const [name, t] of Object.entries(man.textures)) {
      const entry = { size: t.size || [2, 2] };
      ASSETS.tex[name] = entry;
      for (const k of ['diff', 'nor']) {
        if (!t[k]) { tick(name + k); continue; }
        jobs.push(tl.loadAsync(base() + t[k]).then((tx) => {
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = k === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          tx.anisotropy = 8;
          entry[k] = tx; tick(name + k);
        }).catch((e) => console.warn('tex', name, e)));
      }
    }
    await Promise.all(jobs);
    ASSETS.ok = Object.keys(ASSETS.models).length > 0;
  } catch (e) {
    console.warn('assets unavailable, using procedural furniture', e.message || e);
  }
  return ASSETS.ok;
}

// world materials -> painted surface textures: [texture, tint, normal strength, tile size scale]
const SURFACES = {
  woodFloor: ['woodFloor', 0xffffff, 0.8, 1],
  woodFloorOld: ['woodFloor', 0xa89a8a, 0.9, 1],
  hallFloor: ['woodFloor', 0x9a8070, 0.8, 1],
  kitchenFloor: ['linoleum', 0xffffff, 0.6, 0.7],
  bathTiles: ['subway', 0xffffff, 0.8, 0.7],
  bathFloor: ['mosaic', 0xffffff, 0.8, 0.5],
  concrete: ['concrete', 0xffffff, 0.8, 1],
  wallLiving: ['plasterBeige', 0xfff0d8, 0.15, 1],
  wallBedroom: ['plaster', 0xc0d0d8, 0.15, 1],
  wallPaint: ['plaster', 0xeee6d8, 0.15, 1],
  wallKitchen: ['plasterBeige', 0xfff4d8, 0.15, 1],
  wallHall: ['wallpaper', 0xd8d0b0, 0.2, 1],
  wallEmpty: ['plasterPeel', 0xffffff, 0.4, 1],
  ceiling: ['plaster', 0xfffaf0, 0.0, 1.5],
  ceilingHall: ['plasterWorn', 0xe8e0d0, 0.1, 1.5],
  brick: ['brick', 0xffffff, 0.8, 1],
  cabinet: ['cabinetWood', 0xe8d0b0, 0.6, 0.6],
  curtain: ['linen', 0xe2b680, 0.6, 0.5],
};

// swap the procedural maps for painted ones; must run before anything is built,
// since walls and floors bake their UV scale from userData.ws
export function applySurfaces() {
  if (!ASSETS.ok) return;
  for (const [mat, [tex, tint, ns, scale]] of Object.entries(SURFACES)) {
    const m = M[mat], t = ASSETS.tex[tex];
    if (!m || !t || !t.diff) continue;
    // ~128 texels a metre, shown nearest: crisp pixel-art texture over realistic light
    const px = Math.min(512, Math.max(128, 2 ** Math.round(Math.log2(t.size[0] * scale * 128))));
    m.map = pixelTex() ? downsample(t.diff, px) : t.diff;
    m.color.set(tint);
    if (t.nor && ns > 0) { m.normalMap = pixelTex() ? downsample(t.nor, px) : t.nor; m.normalScale = new THREE.Vector2(ns, ns); } else m.normalMap = null;
    m.roughnessMap = null; m.roughness = 1; m.metalness = 0;
    m.userData.ws = t.size[0] * scale;
    m.needsUpdate = true;
  }
}
