// DOM helpers for Doorways 98. Everything lives in a logical 800×600 box that the
// parent may scale with a CSS transform, so pointer maths always goes through here.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const W = 800, H = 600, TASKBAR = 28, DESK_H = H - TASKBAR;

// Client -> logical (800×600) coordinates of the OS root.
export function localPoint(root, e) {
  const r = root.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
// Client -> canvas pixel coordinates (independent of CSS scaling).
export function canvasPoint(cv, e) {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height };
}

export const fmtClock = (min) => {
  const m = Math.floor((((min ?? 0) % 1440) + 1440) % 1440);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
export const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Pointer drag helper with capture. onMove(dx, dy, e) in logical units.
export function dragger(root, target, { onStart, onMove, onEnd, threshold = 0 } = {}) {
  target.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (onStart && onStart(e) === false) return;
    const p0 = localPoint(root, e);
    let moved = threshold === 0;
    target.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const p = localPoint(root, ev);
      const dx = p.x - p0.x, dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) < threshold) return;
      moved = true;
      onMove?.(dx, dy, ev);
    };
    const up = (ev) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      onEnd?.(moved, ev);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  });
}

// Seeded RNG so procedural art is stable.
export function seeded(seed) {
  let a = typeof seed === 'string' ? [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7) : seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, hgt) { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; }
