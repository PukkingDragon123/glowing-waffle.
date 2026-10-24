// Save slot: written every morning (start of day) so LOAD GAME resumes the loop
// at the last dawn. Storage can be blocked, so all calls are guarded.
const KEY = 'bengrim_save_v1';

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now(), v: 1 }));
    return true;
  } catch (e) { return false; }
}
export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.day !== 'number') return null;
    return d;
  } catch (e) { return null; }
}
export function hasSave() { return !!readSave(); }
export function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
