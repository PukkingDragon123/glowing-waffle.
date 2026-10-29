// Player settings, persisted per browser. Storage may be unavailable (private
// windows, sandboxed previews) so every access is guarded.
const KEY = 'bengrim_settings_v3';

export const DEFAULTS = {
  sensitivity: 5,      // 1..10
  invertY: false,
  fov: 72,             // 60..90
  volume: 8,           // 0..10
  resolution: 900,     // internal render height: 480 | 720 | 900 | 1080
  vhs: 2,              // 0..10
  grain: 2,            // 0..10
  ink: 7,              // 0..10 black outline strength
  paint: 4,            // 0..10 painterly brush filter
  wobble: false,       // ps1 vertex snapping
  brightness: 5,       // 0..10
  headBob: true,
  subtitles: true,
};

export const OPTIONS = {
  resolution: [480, 720, 900, 1080],
};

export class Settings {
  constructor() {
    this.v = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.v, JSON.parse(raw));
    } catch (e) { /* storage blocked */ }
    this.listeners = [];
  }
  get(k) { return this.v[k]; }
  set(k, val) {
    this.v[k] = val;
    this.save();
    for (const fn of this.listeners) fn(k, val);
  }
  onChange(fn) { this.listeners.push(fn); }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) { /* ignore */ }
  }
}
