// Environment maps from the CC0 Poly Haven HDRIs (via @pmndrs/assets), prefiltered with PMREM.
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { assetUrl } from '../core/assets.js';

const cache = {};
export async function loadEnv(renderer, name) {
  if (cache[name]) return cache[name];
  const tex = await new EXRLoader().loadAsync(assetUrl(`hdri/${name}.exr`));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  tex.dispose(); pm.dispose();
  cache[name] = env;
  return env;
}
