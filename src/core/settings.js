// Player settings, persisted per browser. Storage may be unavailable (private
// windows, sandboxed previews) so every access is guarded.
const KEY = 'bengrim_settings_v4';

export const DEFAULTS = {
  sensitivity: 5,      // 1..10
  invertY: false,
  fov: 72,             // 60..90
  volume: 8,           // 0..10
  resolution: 900,     // internal render height: 480 | 720 | 900 | 1080
  vhs: 2,              // 0..10
  grain: 3,            // 0..10
  ink: 2,              // 0..10 black outline strength
  paint: 0,            // 0..10 painterly brush filter
  pixelTex: true,      // crisp pixel-art texels on every surface (applies on reload)
  ao: 7,               // 0..10 ambient occlusion in creases and corners
  wobble: false,       // ps1 vertex snapping
  brightness: 5,       // 0..10
  headBob: true,
  subtitles: true,
};

export const OPTIONS = {
  resolution: [480, 540, 720, 900, 1080],
};

// phones and tablets: a coarse pointer. They start lighter: a lower internal
// resolution (lower still on a phone) and softer, cheaper ambient occlusion.
const mq = (q) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
export const COARSE = mq('(pointer: coarse)');
const PHONE = COARSE && Math.min(screen.width, screen.height) < 600;
if (COARSE) Object.assign(DEFAULTS, { resolution: PHONE ? 540 : 720, ao: 4 });

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
