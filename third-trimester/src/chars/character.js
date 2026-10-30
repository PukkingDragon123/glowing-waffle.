// Turns SDF specs into skinned, rigged characters. Templates (geometry) are built once during
// loading and then instanced cheaply (shared geometry, fresh skeleton per instance).
import * as THREE from 'three';
import { meshSpec, toGeometry } from '../gfx/sdf.js';
import { charMaterial } from '../gfx/materials.js';
import { buildSkeleton, Rig } from './rig.js';

export const templates = {};

// specs: { name: spec }, boneDefs: [{name,parent,pos}]
export async function buildTemplate(key, { specs, boneDefs, extra = {}, material = {} }) {
  const entries = Object.entries(specs);
  const results = await Promise.all(entries.map(([, s]) => meshSpec(s)));
  const geos = {};
  entries.forEach(([n], i) => { geos[n] = toGeometry(results[i]); });
  const t = { key, geos, boneDefs, extra, material, stats: results.map((r) => r.stats) };
  templates[key] = t;
  return t;
}

export class Character {
  constructor(t, { materialOpts = {} } = {}) {
    this.template = t; this.kind = t.key;
    this.root = new THREE.Group(); this.root.name = t.key;
    const { bones, byName, index } = buildSkeleton(t.boneDefs);
    this.bones = bones; this.byName = byName; this.boneIndex = index;
    const rootBones = bones.filter((b) => !b.parent);
    rootBones.forEach((b) => this.root.add(b));
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);
    this.material = charMaterial({ ...t.material, ...materialOpts });
    this.meshes = {};
    for (const [n, g] of Object.entries(t.geos)) {
      const m = new THREE.SkinnedMesh(g, this.material);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.name = t.key + ':' + n;
      this.root.add(m); this.meshes[n] = m;
    }
    this.rig = new Rig(byName, this.root);
    this.extras = {};
    t.extra.build?.(this);
  }
  set visible(v) { this.root.visible = v; }
  get visible() { return this.root.visible; }
  dispose() { this.root.removeFromParent(); this.material.dispose(); }
}

export function instantiate(key, opts) {
  const t = templates[key];
  if (!t) throw new Error('template not built: ' + key);
  return new Character(t, opts);
}
