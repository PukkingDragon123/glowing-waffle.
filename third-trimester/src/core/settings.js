// Persisted player settings. Read with game.settings.get(key).
const KEY = 'ttri.settings.v1';

export const DEFAULTS = {
  master: 0.9,
  music: 0.7,
  sfx: 0.9,
  voice: 0.8,
  quality: 'high',        // low | medium | high
  painterly: false,       // optional oil-paint (Kuwahara) filter
  outlines: true,         // ink outlines
  dof: true,
  shake: true,            // camera shake
  flashes: true,          // bright flashes (off = reduced)
  subtitles: 'medium',    // small | medium | large
  textSpeed: 1,           // 0.5 .. 2
  qte: 'normal',          // relaxed | normal | hard
  tts: false,             // use the system speech voice for callers instead of babble
  fullscreen: false,
};

export class Settings {
  constructor(events) {
    this.events = events;
    this.values = { ...DEFAULTS };
    try { Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ }
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    this.values[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    this.events?.emit('settings', { key: k, value: v });
  }
}
