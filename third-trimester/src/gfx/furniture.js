// The old game's furniture: 42 CC0 Poly Haven models (quantised .glb with painted textures) and 16
// painted surface textures (assets/furniture/manifest.json, assets/tex/). Matte, painted, no shine.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../core/assets.js';

export const FURN = { ok: false, manifest: null, models: {}, tex: {} };

function prepModel(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue; seen.add(m);
      m.roughness = 1; m.metalness = 0; m.envMapIntensity = 0;
      if (m.map) m.map.anisotropy = 4;
      if (m.normalMap) m.normalScale.multiplyScalar(0.7);
    }
  });
  scene.updateMatrixWorld(true);
  scene.userData.box = new THREE.Box3().setFromObject(scene);
  return scene;
}

export async function loadFurniture(onProgress = () => {}) {
  if (FURN.ok) return true;
  try {
    const man = FURN.manifest = await (await fetch(assetUrl('furniture/manifest.json'))).json();
    const gl = new GLTFLoader(), tl = new THREE.TextureLoader();
    const jobs = []; let done = 0;
    const total = Object.keys(man.models).length + Object.keys(man.textures).length * 2;
    const tick = () => onProgress(++done / total);
    for (const [name, m] of Object.entries(man.models)) {
      jobs.push(gl.loadAsync(assetUrl('furniture/' + m.file.replace(/^models\//, ''))).then((g) => { FURN.models[name] = prepModel(g.scene); tick(); }).catch((e) => { console.warn('model', name, e); tick(); }));
    }
    for (const [name, t] of Object.entries(man.textures)) {
      const entry = FURN.tex[name] = { size: t.size || [2, 2] };
      for (const k of ['diff', 'nor']) {
        if (!t[k]) { tick(); continue; }
        jobs.push(tl.loadAsync(assetUrl(t[k])).then((tx) => {
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = k === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.anisotropy = 8;
          entry[k] = tx; tick();
        }).catch((e) => { console.warn('tex', name, e); tick(); }));
      }
    }
    await Promise.all(jobs);
    FURN.ok = Object.keys(FURN.models).length > 0;
  } catch (e) { console.warn('old furniture unavailable, procedural fallback', e); }
  return FURN.ok;
}

// A placed copy of a model. Options: target size (fit the longest side to `fit` metres, or the height
// to `height`), yaw, and position of the bottom-centre.
export function furniture(name, { pos = [0, 0, 0], yaw = 0, fit, height, scale } = {}) {
  const src = FURN.models[name]; if (!src) return null;
  const inner = src.clone(true);
  const box = src.userData.box, size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let s = new THREE.Vector3(1, 1, 1);
  if (Array.isArray(scale)) s.set(...scale); else if (scale) s.setScalar(scale);
  if (fit) s.setScalar(fit / Math.max(size.x, size.z)); if (height) s.setScalar(height / size.y);
  inner.scale.copy(s);
  inner.position.set(-c.x * s.x, -box.min.y * s.y, -c.z * s.z);
  const g = new THREE.Group(); g.add(inner); g.position.set(...pos); g.rotation.y = yaw; g.name = name;
  g.userData.size = size.clone().multiply(s);
  return g;
}

// Painted surface material from the old game's textures: repeat = metres per tile.
export function surface(name, { tint = 0xffffff, normal = 0.6, tile = null, w = 1, h = 1 } = {}) {
  const t = FURN.tex[name]; if (!t?.diff) return null;
  const tileSize = tile ?? t.size[0];
  const map = t.diff.clone(); map.repeat.set(w / tileSize, h / tileSize); map.needsUpdate = true;
  const nm = t.nor && normal > 0 ? t.nor.clone() : null; if (nm) { nm.repeat.copy(map.repeat); nm.needsUpdate = true; }
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: 1, metalness: 0, envMapIntensity: 0, normalMap: nm });
  if (nm) m.normalScale = new THREE.Vector2(normal, normal);
  return m;
}
