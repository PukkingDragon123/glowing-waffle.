// The game singleton. Modules import { game } and read the pieces they need;
// main.js fills in renderer, audio, ui, etc. during boot.
import { Emitter } from './util.js';
import { Settings } from './settings.js';

const events = new Emitter();

export const game = {
  events,
  settings: new Settings(events),
  state: null,      // set by src/game/state.js newState()/load
  audio: null,      // src/core/audio.js
  ui: null,         // src/core/ui.js
  input: null,      // src/core/input.js
  gfx: null,        // src/core/renderer.js
  computer: null,   // src/computer/index.js instance
  scene: null,      // current scene object { name, update(dt), ... }
  time: 0,          // real seconds since boot
  dt: 0,
  timeScale: 1,     // cutscene fast-forward / slow motion
  paused: false,
  debug: new URLSearchParams(location.search).has('debug'),
};
if (typeof window !== 'undefined') window.TTRI = game;
