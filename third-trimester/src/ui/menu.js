// Main menu overlay (title + NEW GAME / CONTINUE / SETTINGS / CREDITS), the settings panel
// (also reused by the pause menu) and the scrolling credits.
import { DEFAULTS } from '../core/settings.js';
import { assetUrl } from '../core/assets.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent?.appendChild(e); return e; };

const SETTINGS_SPEC = [
  { group: 'Sound' },
  { key: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sfx', label: 'Sound effects', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'voice', label: 'Voices', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'tts', label: 'Callers use the system voice', type: 'toggle', hint: 'Instead of the babble voices' },
  { group: 'Picture' },
  { key: 'quality', label: 'Quality', type: 'choice', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'outlines', label: 'Ink outlines', type: 'toggle' },
  { key: 'painterly', label: 'Oil-paint filter', type: 'toggle', hint: 'Heavy. Off is the intended look.' },
  { key: 'dof', label: 'Depth of field', type: 'toggle' },
  { key: 'fullscreen', label: 'Fullscreen', type: 'toggle' },
  { group: 'Comfort' },
  { key: 'shake', label: 'Camera shake', type: 'toggle' },
  { key: 'flashes', label: 'Bright flashes', type: 'toggle', hint: 'Off softens flashes and strobes' },
  { key: 'subtitles', label: 'Subtitle size', type: 'choice', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
  { key: 'textSpeed', label: 'Text speed', type: 'range', min: 0.5, max: 2, step: 0.1 },
  { key: 'qte', label: 'Quick-time events', type: 'choice', options: [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['hard', 'Hard']] },
];

export function mountSettingsPanel(container, game) {
  game ??= window.TTRI;
  const root = el('div', 'set-panel', container);
  const hover = () => game.audio?.ui('menu.hover', { vol: 0.18 });
  for (const s of SETTINGS_SPEC) {
    if (s.group) { el('div', 'set-group', root, s.group); continue; }
    const row = el('label', 'set-row', root);
    el('span', 'set-label', row, s.label + (s.hint ? `<small>${s.hint}</small>` : ''));
    const v = game.settings.get(s.key) ?? DEFAULTS[s.key];
    if (s.type === 'range') {
      const wrap = el('span', 'set-range', row);
      const input = el('input', '', wrap); input.type = 'range'; input.min = s.min; input.max = s.max; input.step = s.step; input.value = v;
      const out = el('span', 'set-val', wrap, fmt(s, v));
      input.addEventListener('input', () => { const n = parseFloat(input.value); out.textContent = fmt(s, n); game.settings.set(s.key, n); });
      input.addEventListener('change', () => game.audio?.ui('menu.select', { vol: 0.3 }));
    } else if (s.type === 'toggle') {
      const b = el('button', 'set-toggle' + (v ? ' on' : ''), row, `<i></i><span>${v ? 'On' : 'Off'}</span>`); b.type = 'button';
      b.addEventListener('mouseenter', hover);
      b.addEventListener('click', (e) => {
        e.preventDefault(); const nv = !game.settings.get(s.key); game.settings.set(s.key, nv);
        b.classList.toggle('on', nv); b.querySelector('span').textContent = nv ? 'On' : 'Off'; game.audio?.ui(nv ? 'menu.select' : 'menu.back', { vol: 0.35 });
        if (s.key === 'fullscreen') { try { nv ? document.documentElement.requestFullscreen?.() : document.fullscreenElement && document.exitFullscreen?.(); } catch { /* not allowed */ } }
      });
    } else if (s.type === 'choice') {
      const seg = el('span', 'set-choice', row);
      for (const [val, name] of s.options) {
        const b = el('button', 'opt' + (v === val ? ' on' : ''), seg, name); b.type = 'button';
        b.addEventListener('mouseenter', hover);
        b.addEventListener('click', (e) => { e.preventDefault(); game.settings.set(s.key, val); seg.querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o === b)); game.audio?.ui('menu.select', { vol: 0.35 }); });
      }
    }
  }
  return root;
}
const fmt = (s, v) => (s.max === 1 ? Math.round(v * 100) + '%' : v.toFixed(1) + '×');

const CREDITS = `
<div class="cr-title">Close Encounters<br><em>of the</em><br>Third Trimester</div>
<div class="cr-sec">A game by</div><div class="cr-name">you &amp; Claude</div>
<div class="cr-sec">Starring</div>
<div class="cr-row"><span>Sunny</span><span>a pregnant man</span></div>
<div class="cr-row"><span>Gary</span><span>his husband, from the Seventh Drift</span></div>
<div class="cr-row"><span>Bean</span><span>their son</span></div>
<div class="cr-row"><span>Mr. Tofu</span><span>a cat (allegedly)</span></div>
<div class="cr-small">Tofu is played by “Mochi”, the fur-shelled cat from your earlier game <em>bengrim</em></div>
<div class="cr-row"><span>General Harlan Brass</span><span>Department of Terrestrial Purity</span></div>
<div class="cr-row"><span>The Hands</span><span>themselves</span></div>
<div class="cr-sec">Built with</div>
<div class="cr-row"><span>three.js r178</span><span>MIT licence</span></div>
<div class="cr-row"><span>cannon-es</span><span>MIT licence</span></div>
<div class="cr-sec">Characters</div>
<div class="cr-row"><span>“Universal Base Characters”</span><span>Quaternius — CC0</span></div>
<div class="cr-row"><span>“Universal Animation Library”</span><span>Quaternius — CC0</span></div>
<div class="cr-small">bodies processed through the เฮียผัด! (Hia Phat!) character pipeline</div>
<div class="cr-small">baby, aliens, the giant hands and accessories sculpted procedurally (signed distance fields)</div>
<div class="cr-sec">Images &amp; textures</div>
<div class="cr-row"><span>HDRI environments &amp; normal maps</span><span>Poly Haven — CC0</span></div>
<div class="cr-small">via the @pmndrs/assets package</div>
<div class="cr-ph"><div class="cr-small">Poly Haven models &amp; surfaces (CC0) — loading list…</div></div>
<div class="cr-small">every other texture, poster, sign and face is painted procedurally at load</div>
<div class="cr-sec">Sound</div>
<div class="cr-row"><span>Interface sounds</span><span>uisfx — CC0 audio</span></div>
<div class="cr-small">music, voices and all other sound effects are synthesized live with Web Audio</div>
<div class="cr-sec">Fonts</div>
<div class="cr-row"><span>Big Shoulders Stencil · Spectral · Caveat</span><span>SIL Open Font Licence</span></div>
<div class="cr-row"><span>VT323 · Pixelify Sans · Special Elite</span><span>SIL Open Font Licence</span></div>
<div class="cr-sec">Special thanks</div>
<div class="cr-small">every cat who ever knocked something off a table on purpose</div>
<div class="cr-end">No cats were contained in the making of this game.<br><em>They let us think so.</em></div>`;

export function mountMenu(game, { onNew, onContinue, hasSave = false } = {}) {
  const host = document.getElementById('ui') || document.body;
  const root = el('div', 'menu', host);
  root.innerHTML = `
    <div class="menu-title">
      <div class="t1">CLOSE ENCOUNTERS</div>
      <div class="t2">of the</div>
      <div class="t3">THIRD TRIMESTER</div>
      <div class="tag">a surreal horror-comedy about expecting the unexpected</div>
    </div>
    <nav class="menu-items"></nav>
    <div class="menu-foot"><span>↑ ↓ choose · enter select · esc back</span></div>
    <div class="menu-panel" data-panel="settings"><div class="panel-head"><span>Settings</span><button class="panel-x" type="button">back</button></div><div class="panel-body"></div></div>
    <div class="menu-panel" data-panel="credits"><div class="panel-head"><span>Credits</span><button class="panel-x" type="button">back</button></div><div class="credits-roll"><div class="credits-inner">${CREDITS}</div></div></div>
    <div class="menu-confirm"><div class="mc-box"><div class="mc-q">Start over?</div><div class="mc-s">Your saved family will be forgotten. Mr. Tofu will remember.</div><div class="mc-b"><button type="button" data-v="yes">Start over</button><button type="button" data-v="no">Keep my save</button></div></div></div>`;
  const nav = root.querySelector('.menu-items');
  const items = [
    { id: 'new', label: 'New Game' },
    { id: 'continue', label: 'Continue', disabled: !hasSave },
    { id: 'settings', label: 'Settings' },
    { id: 'credits', label: 'Credits' },
  ];
  let idx = hasSave ? 1 : 0, panel = null, confirming = false, gone = false;
  const buttons = items.map((it, i) => {
    const b = el('button', 'mi' + (it.disabled ? ' disabled' : ''), nav, `<span class="mi-k">${String(i + 1).padStart(2, '0')}</span><span class="mi-l">${it.label}</span>`);
    b.type = 'button'; b.style.setProperty('--d', `${0.6 + i * 0.12}s`);
    b.addEventListener('mouseenter', () => { if (!it.disabled) { idx = i; focus(); game.audio?.ui('menu.hover', { vol: 0.3 }); } });
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!it.disabled) activate(i); });
    return b;
  });
  const focus = () => buttons.forEach((b, i) => b.classList.toggle('focus', i === idx));
  focus();
  mountSettingsPanel(root.querySelector('[data-panel=settings] .panel-body'), game);
  // Poly Haven CC0 models & textures, credited by title and author straight from the asset manifest
  fetch(assetUrl('furniture/manifest.json')).then((r) => r.json()).then((m) => {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const rows = (obj) => Object.values(obj || {}).map((e) => `<div class="cr-row"><span>${esc(e.title)}</span><span>${esc((e.authors || []).join(', '))}</span></div>`).join('');
    const box = root.querySelector('.cr-ph');
    if (box) box.innerHTML = `<div class="cr-sec">Models</div><div class="cr-small">Poly Haven (polyhaven.com) — CC0</div>${rows(m.models)}<div class="cr-sec">Surfaces</div><div class="cr-small">Poly Haven (polyhaven.com) — CC0</div>${rows(m.textures)}`;
  }).catch(() => { const box = root.querySelector('.cr-ph'); if (box) box.innerHTML = '<div class="cr-small">Models and surface textures: Poly Haven (polyhaven.com), CC0</div>'; });
  const openPanel = (name) => {
    panel = name; root.classList.add('panel-open');
    root.querySelectorAll('.menu-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === name));
    game.audio?.ui('menu.open', { vol: 0.5 });
    if (name === 'credits') { const r = root.querySelector('.credits-inner'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = ''; }
  };
  const closePanel = () => { if (!panel) return; panel = null; root.classList.remove('panel-open'); root.querySelectorAll('.menu-panel').forEach((p) => p.classList.remove('on')); game.audio?.ui('menu.close', { vol: 0.45 }); };
  root.querySelectorAll('.panel-x').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); }));
  const confirmEl = root.querySelector('.menu-confirm');
  const confirm = () => new Promise((res) => {
    confirming = true; confirmEl.classList.add('on'); game.audio?.ui('menu.warning', { vol: 0.5 });
    const done = (v) => { confirming = false; confirmEl.classList.remove('on'); res(v); };
    confirmEl.querySelectorAll('button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); game.audio?.ui(b.dataset.v === 'yes' ? 'menu.select' : 'menu.back', { vol: 0.5 }); done(b.dataset.v === 'yes'); }; });
    confirmEl._done = done;
  });
  const leave = (fn) => { gone = true; root.classList.add('leaving'); game.audio?.ui('menu.start', { vol: 0.7 }); setTimeout(() => fn?.(), 450); };
  async function activate(i) {
    const it = items[i]; if (!it || it.disabled || gone) return;
    game.audio?.ui('menu.select', { vol: 0.55 });
    if (it.id === 'new') { if (hasSave && !(await confirm())) return; leave(onNew); }
    else if (it.id === 'continue') leave(onContinue);
    else openPanel(it.id);
  }
  const onKey = (e) => {
    if (gone) return;
    if (confirming) { if (e.code === 'Escape') confirmEl._done?.(false); return; }
    if (panel) { if (e.code === 'Escape' || e.code === 'Backspace') closePanel(); return; }
    const step = (d) => { let n = idx; do { n = (n + d + items.length) % items.length; } while (items[n].disabled); idx = n; focus(); game.audio?.ui('menu.hover', { vol: 0.3 }); };
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); step(1); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); step(-1); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); activate(idx); }
  };
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => root.classList.add('on'));
  return {
    root,
    unmount() { window.removeEventListener('keydown', onKey); root.classList.remove('on'); root.classList.add('leaving'); setTimeout(() => root.remove(), 700); },
    hide() { root.classList.remove('on'); }, show() { root.classList.add('on'); },
  };
}
