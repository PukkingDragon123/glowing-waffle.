// Win98-style immediate-mode widgets drawn on the 640x480 screen canvas.
import { drawText, textWidth, wrap, LINE_H } from './font.js';

export const C = {
  face: '#c0c0c0', hi: '#ffffff', light: '#dfdfdf', shadow: '#808080', dark: '#000000', desk: '#008080',
  sel: '#000080', selText: '#ffffff', t1: '#000080', t2: '#1084d0', it1: '#808080', it2: '#b5b5b5',
  win: '#ffffff', text: '#000000', gray: '#808080', link: '#0000ff', visited: '#800080', tip: '#ffffe1', disabled: '#808080',
};

export class UI {
  constructor(ctx) {
    this.ctx = ctx;
    this.mx = 0; this.my = 0; this.down = false; this.pressed = false; this.released = false; this.dbl = false; this.rdown = false; this.rpressed = false;
    this.wheel = 0; this.keys = [];
    this.active = null;      // id of widget being pressed
    this.focus = null;       // focused text field id
    this.owner = null; this.hotOwner = null;
    this.cursor = 'arrow';
    this.clips = [];
    this.lastClickT = 0; this.lastClickId = null;
    this.time = 0;
  }
  frame(inp) {
    Object.assign(this, inp);
    this.cursor = 'arrow';
    if (this.released && !this.down) { /* keep active until end of frame */ }
  }
  endFrame() { if (!this.down) this.active = null; this.keys = []; this.wheel = 0; }

  hit(x, y, w, h) { return this.mx >= x && this.my >= y && this.mx < x + w && this.my < y + h && this.owner === this.hotOwner && this.inClip(); }
  inClip() { const c = this.clips[this.clips.length - 1]; return !c || (this.mx >= c[0] && this.my >= c[1] && this.mx < c[0] + c[2] && this.my < c[1] + c[3]); }
  clip(x, y, w, h) { this.ctx.save(); this.ctx.beginPath(); this.ctx.rect(x, y, w, h); this.ctx.clip(); this.clips.push([x, y, w, h]); }
  unclip() { this.ctx.restore(); this.clips.pop(); }

  fill(x, y, w, h, c) { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, w, h); }
  hline(x, y, w, c) { this.fill(x, y, w, 1, c); }
  vline(x, y, h, c) { this.fill(x, y, 1, h, c); }
  // styles: raised (button), pressed, sunken (field), window, thin (status panes), groove
  bevel(x, y, w, h, style = 'raised', fill = C.face) {
    const f = (a, b, c, d) => { this.hline(x, y, w - 1, a); this.vline(x, y, h - 1, a); this.hline(x + 1, y + 1, w - 3, b); this.vline(x + 1, y + 1, h - 3, b); this.hline(x, y + h - 1, w, d); this.vline(x + w - 1, y, h, d); this.hline(x + 1, y + h - 2, w - 2, c); this.vline(x + w - 2, y + 1, h - 2, c); };
    if (fill) this.fill(x, y, w, h, fill);
    if (style === 'raised') f(C.hi, C.light, C.shadow, C.dark);
    else if (style === 'window') f(C.light, C.hi, C.shadow, C.dark);
    else if (style === 'pressed') { this.hline(x, y, w, C.dark); this.vline(x, y, h, C.dark); this.hline(x + 1, y + 1, w - 2, C.shadow); this.vline(x + 1, y + 1, h - 2, C.shadow); this.hline(x, y + h - 1, w, C.hi); this.vline(x + w - 1, y, h, C.hi); }
    else if (style === 'sunken') f(C.shadow, C.dark, C.light, C.hi);
    else if (style === 'thin') { this.hline(x, y, w, C.shadow); this.vline(x, y, h, C.shadow); this.hline(x, y + h - 1, w, C.hi); this.vline(x + w - 1, y, h, C.hi); }
    else if (style === 'thinUp') { this.hline(x, y, w, C.hi); this.vline(x, y, h, C.hi); this.hline(x, y + h - 1, w, C.shadow); this.vline(x + w - 1, y, h, C.shadow); }
    else if (style === 'groove') { this.hline(x, y, w, C.shadow); this.hline(x, y + 1, w, C.hi); }
  }
  text(str, x, y, color = C.text, o = {}) { return drawText(this.ctx, String(str), x, y, color, o); }
  textC(str, x, y, w, color = C.text, o = {}) { const tw = textWidth(String(str), o.bold); return drawText(this.ctx, String(str), x + Math.floor((w - tw) / 2), y, color, o); }
  focusRect(x, y, w, h) { const c = this.ctx; c.fillStyle = '#000'; for (let i = 0; i < w; i += 2) { c.fillRect(x + i, y, 1, 1); c.fillRect(x + i, y + h - 1, 1, 1); } for (let i = 0; i < h; i += 2) { c.fillRect(x, y + i, 1, 1); c.fillRect(x + w - 1, y + i, 1, 1); } }

  // clicks fire on release inside the widget that was pressed
  clickable(id, x, y, w, h) {
    const over = this.hit(x, y, w, h);
    if (over && this.pressed) this.active = id;
    const held = this.active === id && this.down;
    const clicked = this.active === id && this.released && over;
    let dbl = false;
    if (clicked) { if (this.lastClickId === id && this.time - this.lastClickT < 0.45) dbl = true; this.lastClickId = id; this.lastClickT = this.time; }
    return { over, held: held && over, clicked, dbl };
  }

  button(id, x, y, w, h, label, o = {}) {
    const st = this.clickable(id, x, y, w, h);
    const down = (st.held || o.toggled) && !o.disabled;
    if (o.def && !down) { this.fill(x, y, w, h, C.dark); this.bevel(x + 1, y + 1, w - 2, h - 2, 'raised'); }
    else this.bevel(x, y, w, h, down ? 'pressed' : 'raised');
    const off = down ? 1 : 0;
    if (o.icon) { this.ctx.drawImage(o.icon, x + 4 + off, y + Math.floor((h - o.icon.height) / 2) + off); }
    const col = o.disabled ? C.disabled : C.text;
    if (label) {
      if (o.disabled) this.textC(label, x + 1 + (o.icon ? 10 : 0), y + Math.floor((h - LINE_H) / 2) + 2, w, C.hi);
      this.textC(label, x + off + (o.icon ? 10 : 0), y + Math.floor((h - LINE_H) / 2) + 1 + off, w, col, { bold: o.bold });
    }
    if (o.focus) this.focusRect(x + 4, y + 4, w - 8, h - 8);
    return st.clicked && !o.disabled;
  }
  // flat toolbar button: raises on hover, sinks when pressed (IE / Outlook style)
  toolButton(id, x, y, w, h, label, icon, o = {}) {
    const st = this.clickable(id, x, y, w, h);
    if (o.disabled) {
      if (icon) { this.ctx.globalAlpha = 0.35; this.ctx.drawImage(icon, x + Math.floor((w - icon.width) / 2), y + 3); this.ctx.globalAlpha = 1; }
      if (label) this.textC(label, x, y + h - 14, w, C.disabled);
      return false;
    }
    if (st.held) this.bevel(x, y, w, h, 'thin', null); else if (st.over) this.bevel(x, y, w, h, 'thinUp', null);
    const off = st.held ? 1 : 0;
    if (icon) this.ctx.drawImage(icon, x + Math.floor((w - icon.width) / 2) + off, y + 3 + off);
    if (label) this.textC(label, x + off, y + h - 14 + off, w, C.text);
    return st.clicked;
  }
  check(id, x, y, label, value) {
    const st = this.clickable(id, x, y, 14 + textWidth(label) + 6, 14);
    this.bevel(x, y, 13, 13, 'sunken', C.win);
    if (value) { const c = this.ctx; c.fillStyle = '#000'; const pts = [[3, 5], [3, 6], [3, 7], [4, 6], [4, 7], [4, 8], [5, 7], [5, 8], [5, 9], [6, 6], [6, 7], [6, 8], [7, 5], [7, 6], [7, 7], [8, 4], [8, 5], [8, 6], [9, 3], [9, 4], [9, 5]]; for (const [px, py] of pts) c.fillRect(x + px, y + py, 1, 1); }
    this.text(label, x + 18, y);
    return st.clicked ? !value : value;
  }

  // single-line text field. state = {value, caret}
  field(id, x, y, w, h, state, o = {}) {
    const st = this.clickable(id, x, y, w, h);
    if (st.clicked || (this.pressed && st.over)) this.focus = id;
    if (st.over) this.cursor = 'ibeam';
    this.bevel(x, y, w, h, 'sunken', o.disabled ? C.face : C.win);
    let submit = false;
    if (this.focus === id && !o.readOnly) {
      if (state.caret === undefined) state.caret = state.value.length;
      for (const k of this.keys) {
        if (k === '#Backspace') { if (state.caret > 0) { state.value = state.value.slice(0, state.caret - 1) + state.value.slice(state.caret); state.caret--; } }
        else if (k === '#Delete') state.value = state.value.slice(0, state.caret) + state.value.slice(state.caret + 1);
        else if (k === '#ArrowLeft') state.caret = Math.max(0, state.caret - 1);
        else if (k === '#ArrowRight') state.caret = Math.min(state.value.length, state.caret + 1);
        else if (k === '#Home') state.caret = 0;
        else if (k === '#End') state.caret = state.value.length;
        else if (k === '#Enter') submit = true;
        else if (k.length === 1 && state.value.length < (o.max || 120)) { state.value = state.value.slice(0, state.caret) + k + state.value.slice(state.caret); state.caret++; }
        if (k.length === 1 && G_typeSound) G_typeSound();
      }
    }
    this.clip(x + 2, y + 2, w - 4, h - 4);
    const shown = o.password ? '*'.repeat(state.value.length) : state.value;
    let scroll = 0;
    const caretX = textWidth(shown.slice(0, state.caret ?? shown.length));
    if (caretX > w - 10) scroll = caretX - (w - 10);
    this.text(shown, x + 4 - scroll, y + Math.floor((h - LINE_H) / 2) + 1, o.disabled ? C.disabled : C.text);
    if (this.focus === id && Math.floor(this.time * 2) % 2 === 0 && !o.readOnly) this.fill(x + 4 + caretX - scroll, y + 3, 1, h - 6, C.text);
    this.unclip();
    return submit;
  }

  // vertical scrollbar; state = {scroll, max (content height), page (visible)}
  vscroll(id, x, y, h, state) {
    const W = 16;
    this.fill(x, y, W, h, '#e0e0e0');
    // dither pattern track
    const c = this.ctx; c.fillStyle = C.hi;
    for (let yy = y; yy < y + h; yy++) for (let xx = x + ((yy - y) % 2); xx < x + W; xx += 2) c.fillRect(xx, yy, 1, 1);
    const maxScroll = Math.max(0, state.max - state.page);
    const up = this.arrowBtn(id + 'u', x, y, W, W, 'up'), dn = this.arrowBtn(id + 'd', x, y + h - W, W, W, 'down');
    if (up) state.scroll -= 13; if (dn) state.scroll += 13;
    const track = h - W * 2;
    const thumbH = maxScroll > 0 ? Math.max(10, Math.floor(track * state.page / state.max)) : track;
    const ty = y + W + (maxScroll > 0 ? Math.floor((track - thumbH) * (state.scroll / maxScroll)) : 0);
    if (maxScroll > 0) {
      this.bevel(x, ty, W, thumbH, 'raised');
      const st = this.clickable(id + 't', x, ty, W, thumbH);
      if (this.active === id + 't' && this.down) {
        if (state.drag === undefined) state.drag = this.my - ty;
        const ny = this.my - state.drag - (y + W);
        state.scroll = (ny / Math.max(1, track - thumbH)) * maxScroll;
      } else state.drag = undefined;
      const tr = this.clickable(id + 'tr', x, y + W, W, track);
      if (tr.clicked && this.active !== id + 't') state.scroll += this.my < ty ? -state.page : state.page;
    }
    if (this.hit(x - 400, y, 400 + W, h) && this.wheel) state.scroll += this.wheel * 26;
    state.scroll = Math.max(0, Math.min(maxScroll, state.scroll || 0));
  }
  arrowBtn(id, x, y, w, h, dir) {
    const st = this.clickable(id, x, y, w, h);
    this.bevel(x, y, w, h, st.held ? 'pressed' : 'raised');
    const c = this.ctx; c.fillStyle = '#000';
    const cx = x + Math.floor(w / 2) + (st.held ? 1 : 0), cy = y + Math.floor(h / 2) + (st.held ? 1 : 0);
    for (let i = 0; i < 4; i++) {
      if (dir === 'up') c.fillRect(cx - i, cy - 2 + i, i * 2 + 1, 1);
      if (dir === 'down') c.fillRect(cx - (3 - i), cy - 1 + i, (3 - i) * 2 + 1, 1);
      if (dir === 'left') c.fillRect(cx - 2 + i, cy - i, 1, i * 2 + 1);
      if (dir === 'right') c.fillRect(cx + 1 - i, cy - (3 - i), 1, (3 - i) * 2 + 1);
    }
    return st.clicked || (st.held && this.time % 0.15 < 0.017);
  }
  progress(x, y, w, h, v, blocks = true) {
    this.bevel(x, y, w, h, 'thin', C.win);
    const n = Math.floor((w - 4) / 9);
    const fillN = Math.floor(n * Math.max(0, Math.min(1, v)));
    for (let i = 0; i < fillN; i++) this.fill(x + 2 + i * 9, y + 2, 7, h - 4, C.sel);
  }
  tabs(id, x, y, w, labels, state) {
    let cx = x;
    labels.forEach((l, i) => {
      const tw = textWidth(l) + 16;
      const sel = state.tab === i;
      const yy = sel ? y : y + 2;
      this.fill(cx, yy, tw, 20 - (sel ? 0 : 2), C.face);
      this.hline(cx + 2, yy, tw - 4, C.hi); this.vline(cx, yy + 2, 18, C.hi); this.fill(cx + 1, yy + 1, 1, 1, C.hi);
      this.vline(cx + tw - 1, yy + 2, 18 - (sel ? 0 : 2), C.dark); this.vline(cx + tw - 2, yy + 1, 19 - (sel ? 0 : 2), C.shadow);
      this.text(l, cx + 8, yy + 4);
      if (sel) this.focusRect(cx + 4, yy + 3, tw - 8, 14);
      const st = this.clickable(id + i, cx, yy, tw, 20);
      if (st.clicked) state.tab = i;
      cx += tw - 1;
    });
    this.hline(x, y + 20, w, C.hi);
  }
  // list of rows; returns {index, dbl} when a row is clicked
  list(id, x, y, w, h, rows, state, o = {}) {
    this.bevel(x, y, w, h, 'sunken', C.win);
    const rh = o.rowH || 16;
    state.scroll = state.scroll || 0;
    const sb = rows.length * rh > h - 4;
    const iw = w - 4 - (sb ? 16 : 0);
    let res = null;
    this.clip(x + 2, y + 2, iw, h - 4);
    rows.forEach((r, i) => {
      const ry = y + 2 + i * rh - state.scroll;
      if (ry + rh < y || ry > y + h) return;
      const st = this.clickable(id + 'r' + i, x + 2, ry, iw, rh);
      if (st.clicked) { state.sel = i; res = { index: i, dbl: st.dbl }; }
      const sel = state.sel === i;
      if (sel) this.fill(x + 2, ry, iw, rh, o.inactive ? C.face : C.sel);
      if (o.draw) o.draw(r, x + 2, ry, iw, rh, sel, i);
      else this.text(typeof r === 'string' ? r : r.label, x + 6, ry + 2, sel ? C.selText : C.text, { bold: r.bold, maxW: iw - 8 });
    });
    this.unclip();
    if (sb) { const ss = { scroll: state.scroll, max: rows.length * rh, page: h - 4, drag: state.drag }; this.vscroll(id + 's', x + w - 18, y + 2, h - 4, ss); state.scroll = ss.scroll; state.drag = ss.drag; }
    return res;
  }
  // multiline wrapped text in a sunken box with scrollbar; state={scroll}
  textBox(id, x, y, w, h, lines, state, o = {}) {
    this.bevel(x, y, w, h, 'sunken', o.bg || C.win);
    state.scroll = state.scroll || 0;
    const inner = w - 22;
    const out = [];
    for (const l of lines) {
      const col = l.color || C.text;
      const wr = wrap(l.text ?? l, inner - 6, l.bold);
      wr.forEach((t) => out.push({ t, col, bold: l.bold }));
    }
    const total = out.length * LINE_H + 4;
    if (o.stick && state.lastLen !== out.length) { state.scroll = Math.max(0, total - (h - 4)); state.lastLen = out.length; }
    this.clip(x + 2, y + 2, w - 20, h - 4);
    out.forEach((l, i) => { const yy = y + 3 + i * LINE_H - state.scroll; if (yy > y - LINE_H && yy < y + h) this.text(l.t, x + 5, yy, l.col, { bold: l.bold }); });
    this.unclip();
    const ss = { scroll: state.scroll, max: total, page: h - 4, drag: state.drag };
    this.vscroll(id + 's', x + w - 18, y + 2, h - 4, ss);
    state.scroll = ss.scroll; state.drag = ss.drag;
  }
}

// hook for key click sounds (set by the OS)
let G_typeSound = null;
export function setTypeSound(fn) { G_typeSound = fn; }
