// Shim: the old game's shared context (G) mapped onto the new engine, so legacy modules
// (the old cat, city, ships, debris) run unchanged.
import * as THREE from 'three';
import { game } from '../../core/game.js';

export const G = {
  scene: new THREE.Group(),           // legacy constructors add themselves here; callers re-parent
  uniforms: { uTime: { value: 0 } },
  get time() { return game.time; },
  get dt() { return game.dt; },
  get camera() { return game.scene?.camera; },
  get settings() { return game.settings?.values; },
  frame: 0,
};
export function on(evt, fn) { return game.events.on(evt, fn); }
export function emit(evt, data) { game.events.emit(evt, data); }
