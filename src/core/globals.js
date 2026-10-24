// Shared game context. Every system registers itself here so modules can talk
// to each other without threading references through every constructor.
import * as THREE from 'three';

export const G = {
  engine: null,
  scene: null,
  camera: null,
  input: null,
  audio: null,
  physics: null,
  world: null,
  player: null,
  body: null,
  interact: null,
  cat: null,
  os: null,
  phone: null,
  director: null,
  settings: null,
  hud: null,
  sky: null,
  alien: null,

  state: 'boot', // boot | menu | play | pause | cutscene | ending
  time: 0,       // seconds since start (real, unpaused)
  dt: 0,
  frame: 0,

  // story state (persisted per day by save.js)
  story: {
    day: 1,
    catTrust: 0.85,
    catFled: false,
    attackedCat: false,
    resistedCat: false,
    deaths: 0,
    callsDone: 0,
    flags: {},
  },

  // shared shader uniforms (patched into most world materials)
  uniforms: {
    uTime: { value: 0 },
    uWarp: { value: 0 },        // reality warp strength 0..1
    uBreath: { value: 0 },      // breathing walls 0..1
    uSnapRes: { value: new THREE.Vector2(320, 180) },
    uSnapOn: { value: 1 },
    uDay: { value: 1 },
    uRot: { value: 0 },         // flesh / rot overlay on world surfaces 0..1
  },

  debug: { enabled: false },
};

// tiny event bus
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, data) {
  const set = listeners.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(data); } catch (e) { console.error('event', evt, e); }
  }
}
