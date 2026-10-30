// localStorage save slot. One slot; CONTINUE resumes it.
const KEY = 'ttri.save.v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function loadSave() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() })); return true; } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
