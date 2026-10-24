// World container: interactables, light fixtures, raycast targets, named
// zones (rooms) with footstep surfaces, and power state.
import * as THREE from 'three';
import { G } from '../core/globals.js';

export class World {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'world';
    G.scene.add(this.root);
    this.interactables = [];
    this.fixtures = [];
    this.rayTargets = [];   // meshes the interaction ray can hit (incl. occluders)
    this.zones = [];        // {name, x0,z0,x1,z1,y0,y1, surface, reverb}
    this.power = true;
    this.updaters = [];     // extra per-frame callbacks
    this.items = [];        // physical items (props)
    this.named = {};        // quick access to important objects
    this.snapPoints = [];   // placement targets (coffee machine, stove burner, bowl...)
  }
  addInteractable(i) { this.interactables.push(i); i.root.traverse((o) => { if (o.isMesh) this.rayTargets.push(o); }); }
  removeInteractable(i) {
    const k = this.interactables.indexOf(i); if (k >= 0) this.interactables.splice(k, 1);
    i.root.traverse((o) => { const j = this.rayTargets.indexOf(o); if (j >= 0) this.rayTargets.splice(j, 1); });
  }
  addOccluders(meshes) { for (const m of meshes) this.rayTargets.push(m); }
  removeRayTarget(o) { const j = this.rayTargets.indexOf(o); if (j >= 0) this.rayTargets.splice(j, 1); }
  addZone(z) { this.zones.push({ y0: -1, y1: 3.2, surface: 'wood', reverb: 'room', ...z }); }
  zoneAt(p) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 && p.y <= z.y1) return z;
    }
    return null;
  }
  // total artificial light at a point (for the alien / cat)
  lightAt(p) {
    let s = 0;
    for (const f of this.fixtures) s += f.contrib(p);
    for (const fn of this.extraLight || []) s += fn(p);
    return s;
  }
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  offUpdate(fn) { const i = this.updaters.indexOf(fn); if (i >= 0) this.updaters.splice(i, 1); }
  update(dt) {
    for (const i of this.interactables) if (i.enabled !== false) i.update(dt);
    for (const f of this.fixtures) f.update(dt);
    for (const fn of this.updaters) fn(dt);
  }
}
