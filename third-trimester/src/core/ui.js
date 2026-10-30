// DOM overlay layer: subtitles, choices, fades, letterbox bars, title cards, toasts,
// Sunny's thought bubble, the sticky note of day tasks and the hover label.
// Deliberately sparse: the game has almost no HUD.
import { game } from './game.js';
import { sleepReal } from './util.js';

const SPEAKERS = {
  Sunny: '#f0c27a', Gary: '#b9a8ff', Bean: '#8dffb4', 'Mr. Tofu': '#ff9b4a', Tofu: '#ff9b4a', General: '#ff6b5a', 'General Brass': '#ff6b5a',
  Soldier: '#c9c9c9', Agent: '#9fb6c9', Radio: '#d9d0a0', TV: '#d9d0a0', Doreen: '#f59fb8', '???': '#9a8fb0',
};

function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent?.appendChild(e); return e; }

export class UI {
  constructor(root) {
    this.root = root;
    this.bars = el('div', 'lb', root); el('div', 'lb-top', this.bars); el('div', 'lb-bot', this.bars);
    this.fadeEl = el('div', 'fade', root);
    this.card = el('div', 'titlecard', root);
    this.subs = el('div', 'subs', root);
    this.choices = el('div', 'choices', root);
    this.toasts = el('div', 'toasts', root);
    this.bubble = el('div', 'thought', root);
    this.noteEl = el('div', 'sticky', root);
    this.hintEl = el('div', 'hint', root);
    this.labelEl = el('div', 'hoverlabel', root);
    this.skipEl = el('div', 'skiphint', root, '<span class="ring"></span>hold <b>space</b> to skip');
    this.backEl = el('button', 'backbtn', root, '<span>&#8592;</span> back');
    this.backEl.addEventListener('click', () => { game.audio?.ui('menu.back', { vol: 0.4 }); game.events.emit('ui:back'); });
    this.advance = null;
    const adv = (e) => { if (this.advance && !e.target.closest?.('.choices,.d98,.menu,.panel')) this.advance(); };
    window.addEventListener('pointerdown', adv);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') adv(e); });
    this.applySettings();
    game.events.on('settings', () => this.applySettings());
  }
  applySettings() { this.root.dataset.subs = game.settings.get('subtitles'); }

  // Subtitle line with typewriter reveal and babble voice. Resolves when finished (+hold).
  async say(speaker, text, { voice = null, hold = 1.1, wait = true, italic = false } = {}) {
    const spd = game.settings.get('textSpeed') || 1;
    const line = el('div', 'line' + (italic ? ' italic' : ''), null);
    if (speaker) { const n = el('span', 'who', line, speaker); n.style.color = SPEAKERS[speaker] || '#e8dcc0'; }
    const body = el('span', 'txt', line);
    this.subs.innerHTML = ''; this.subs.appendChild(line);
    requestAnimationFrame(() => line.classList.add('on'));
    const v = voice ? game.audio?.babble(text, voice) : null;
    let skipped = false;
    this.advance = () => { skipped = true; };
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      if (skipped) { body.textContent = text; break; }
      body.textContent += chars[i];
      const c = chars[i];
      await sleepReal(((/[.!?…]/.test(c) ? 160 : /[,;:]/.test(c) ? 70 : 24) / spd) / Math.max(0.2, Math.min(game.timeScale, 8)));
    }
    if (!wait) { this.advance = null; return; }
    if (v && !skipped) await Promise.race([v.done, new Promise((r) => (this.advance = () => { r(); }))]);
    skipped = false;
    const holdMs = (hold + text.length * 0.018) * 1000 / spd / Math.max(0.2, game.timeScale);
    await Promise.race([sleepReal(holdMs), new Promise((r) => (this.advance = () => r()))]);
    this.advance = null;
    v?.stop?.();
    line.classList.remove('on');
    setTimeout(() => line.remove(), 400);
  }
  clearSubs() { this.subs.innerHTML = ''; this.advance = null; }

  choose(options, { prompt = '' } = {}) {
    return new Promise((resolve) => {
      this.choices.innerHTML = '';
      if (prompt) el('div', 'prompt', this.choices, prompt);
      const keyH = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= options.length) pick(options[n - 1]); };
      const pick = (o) => {
        window.removeEventListener('keydown', keyH);
        game.audio?.ui('menu.select', { vol: 0.5 });
        this.choices.classList.remove('on');
        setTimeout(() => { this.choices.innerHTML = ''; }, 300);
        resolve(o.value ?? o.text);
      };
      options.forEach((o, i) => {
        const b = el('button', 'choice', this.choices, `<span class="n">${i + 1}</span>${o.text}`);
        b.addEventListener('mouseenter', () => game.audio?.ui('menu.hover', { vol: 0.25 }));
        b.addEventListener('click', (e) => { e.stopPropagation(); pick(o); });
      });
      window.addEventListener('keydown', keyH);
      requestAnimationFrame(() => this.choices.classList.add('on'));
    });
  }

  fade(opacity, sec = 1, color = '#000') {
    this.fadeEl.style.background = color;
    this.fadeEl.style.transition = `opacity ${sec}s ease`;
    // force style flush so the transition always runs
    void this.fadeEl.offsetWidth;
    this.fadeEl.style.opacity = opacity;
    return sleepReal(sec * 1000);
  }
  letterbox(on) { this.bars.classList.toggle('on', !!on); }
  async titleCard(big, small = '', sec = 3.2) {
    this.card.innerHTML = `<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}`;
    this.card.classList.add('on');
    game.audio?.ui('menu.checkpoint', { vol: 0.5 });
    await sleepReal(sec * 1000);
    this.card.classList.remove('on');
    await sleepReal(900);
  }
  toast(text, { kind = '' } = {}) {
    const t = el('div', 'toast ' + kind, this.toasts, text);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 600); }, 3600);
  }
  thought(html, sec = 0) {
    clearTimeout(this._thoughtT);
    if (!html) { this.bubble.classList.remove('on'); return; }
    this.bubble.innerHTML = html; this.bubble.classList.add('on');
    if (sec) this._thoughtT = setTimeout(() => this.bubble.classList.remove('on'), sec * 1000);
  }
  // Sticky note of day tasks: [{text, done}]
  note(title, items, show = true) {
    this.noteEl.innerHTML = `<div class="t">${title}</div>` + items.map((i) => `<div class="i ${i.done ? 'done' : ''}">${i.done ? '&#10003;' : '&#9675;'} ${i.text}</div>`).join('');
    if (show) this.peekNote();
  }
  peekNote(sec = 4.5) { this.noteEl.classList.add('on'); clearTimeout(this._noteT); this._noteT = setTimeout(() => this.noteEl.classList.remove('on'), sec * 1000); }
  toggleNote() { this.noteEl.classList.toggle('on'); clearTimeout(this._noteT); }
  hint(text) { this.hintEl.innerHTML = text || ''; this.hintEl.classList.toggle('on', !!text); }
  label(text, x, y) {
    if (!text) { this.labelEl.classList.remove('on'); return; }
    if (this.labelEl.textContent !== text) this.labelEl.textContent = text;
    this.labelEl.style.transform = `translate(${x + 16}px, ${y + 14}px)`;
    this.labelEl.classList.add('on');
  }
  skipHint(on, progress = 0) { this.skipEl.classList.toggle('on', !!on); this.skipEl.style.setProperty('--p', progress); }
  back(on) { this.backEl.classList.toggle('on', !!on); }
}
