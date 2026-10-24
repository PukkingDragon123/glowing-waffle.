// Internet Voyager 5: an IE-style browser with a tiny layout engine, slow
// dial-up loading (interlaced images, throbber, status bar), history,
// favorites and the AltaVisor search engine.
import { G, emit } from '../../core/globals.js';
import { C } from '../ui.js';
import { icon } from '../icons.js';
import { drawText, textWidth, drawTextScaled, LINE_H } from '../font.js';
import { PAGES, HOME, searchPage } from '../content/pages.js';
import { IMAGES } from './images.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

function tokens(str) {
  // [text](url) links and **bold**
  const out = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0, m;
  const pushWords = (s, st) => { for (const w of s.split(/(\s+)/)) if (w) out.push({ w, ...st }); };
  while ((m = re.exec(str))) {
    if (m.index > last) pushWords(str.slice(last, m.index), {});
    if (m[1]) pushWords(m[1], { link: m[2] });
    else pushWords(m[3], { bold: true });
    last = re.lastIndex;
  }
  if (last < str.length) pushWords(str.slice(last), {});
  return out;
}

export class BrowserApp {
  constructor(os) {
    this.os = os; this.needsNet = true;
    this.url = HOME; this.addr = { value: HOME };
    this.hist = []; this.fwd = []; this.visited = new Set();
    this.scroll = { scroll: 0 };
    this.page = null; this.lay = null; this.loadT = 0; this.loadDur = 1; this.loading = false;
    this.searchQ = { value: '' };
    this.marqueeX = 0;
    this.layW = 0;
  }
  title() { return (this.page ? this.page.title : 'Internet Voyager') + ' - Internet Voyager'; }
  menu() {
    return [
      { label: 'File', items: [{ label: 'Close', action: () => this.os.close(this.os.windows.find((w) => w.app === 'browser')) }] },
      { label: 'Edit', items: [{ label: 'Copy', disabled: true }, { label: 'Select All', disabled: true }] },
      { label: 'View', items: [{ label: 'Refresh', action: () => this.go(this.url, true) }] },
      { label: 'Favorites', items: [
        { label: 'Blueberry Pie Online', action: () => this.go(HOME) },
        { label: 'CNM Interactive', action: () => this.go('http://www.cnm.com/') },
        { label: 'AltaVisor Search', action: () => this.go('http://www.altavisor.com/') },
        { label: 'PurrfectPets', action: () => this.go('http://www.purrfectpets.com/behavior.html') },
        ...(G.story.day >= 4 ? [{ label: 'APT 4B (live)', action: () => this.go('http://www.bengrim.cam/') }] : []),
      ] },
      { label: 'Help', items: [{ label: 'About Internet Voyager', action: () => this.os.msg({ title: 'About Internet Voyager', text: 'Internet Voyager 5.0\nCopyright 1995-1999', icon: 'browser', buttons: ['OK'] }) }] },
    ];
  }
  onOpen() { if (!this.page) this.go(HOME); }
  onDisconnect() { this.loading = false; }

  resolve(url) {
    if (!/^[a-z]+:/.test(url)) url = 'http://' + url;
    if (!/^http:\/\/[^/]+\//.test(url) && /^http:\/\/[^/]+$/.test(url)) url += '/';
    return url;
  }
  go(url, refresh = false) {
    if (url === 'mailto:inbox') { this.os.open('mail'); return; }
    url = this.resolve(url);
    if (!refresh && this.url && this.page) { this.hist.push(this.url); this.fwd = []; }
    this.url = url; this.addr.value = url; this.addr.caret = url.length;
    this.loading = true; this.loadT = 0;
    this.scroll.scroll = 0;
    const day = G.story.day;
    let p;
    const m = url.match(/altavisor\.com\/search\?q=(.*)$/);
    if (!this.os.connected) p = this.errorPage(url, true);
    else if (m) p = searchPage(decodeURIComponent(m[1].replace(/\+/g, ' ')), day);
    else if (PAGES[url]) p = PAGES[url](day);
    else p = this.errorPage(url, false);
    this.page = p; this.lay = null;
    const imgs = JSON.stringify(p.body).split('"img"').length - 1;
    this.loadDur = 0.8 + imgs * (0.8 + Math.random() * 0.8);
    this.visited.add(url);
    emit('browse', url);
    if (url.includes('bengrim.cam')) emit('webcamPage');
  }
  errorPage(url, offline) {
    return {
      title: 'The page cannot be displayed', bg: '#ffffff', link: '#0000cc',
      body: [
        { h: 2, t: 'The page cannot be displayed' },
        { p: 'The page you are looking for is currently unavailable. The Web site might be experiencing technical difficulties, or you may need to adjust your browser settings.' },
        { hr: true },
        { p: 'Please try the following:' },
        { list: [offline ? 'Connect to the Internet: open Start > Connect to Internet.' : 'Click the Refresh button, or try again later.', 'If you typed the page address in the Address bar, make sure that it is spelled correctly.', '[Return to the home page](' + HOME + ')'] },
        { p: 'Cannot find server or DNS Error', color: '#808080' },
        { p: 'Internet Voyager', color: '#808080' },
      ],
    };
  }
  back() { if (!this.hist.length) return; this.fwd.push(this.url); const u = this.hist.pop(); this.url = null; this.go(u); this.hist.pop(); }
  forward() { if (!this.fwd.length) return; const u = this.fwd.pop(); this.go(u); }

  update(dt) {
    if (this.loading) { this.loadT += dt; if (this.loadT >= this.loadDur) { this.loading = false; } }
    this.marqueeX += dt * 60;
  }

  // ---------------------------------------------------------- layout
  layout(w) {
    const p = this.page;
    const ops = [];
    const links = [];
    const widgets = [];
    const textCol = p.text || '#000';
    const linkCol = p.link || C.link;
    const flow = (els, x0, y0, W) => {
      let y = y0;
      for (const e of els) {
        if (e.h) {
          if (e.h === 1) { const tw = textWidth(e.t, true) * 2; ops.push({ type: 'textS', t: e.t, x: e.center ? x0 + Math.max(0, (W - tw) / 2) : x0, y, color: e.color || textCol }); y += 30; }
          else { ops.push({ type: 'text', t: e.t, x: e.center ? x0 + (W - textWidth(e.t, true)) / 2 : x0, y: y + 2, color: e.color || textCol, bold: true }); if (e.h === 2) ops.push({ type: 'rect', x: x0, y: y + 15, w: Math.min(W, textWidth(e.t, true) + 20), h: 1, color: e.color || textCol }); y += e.h === 2 ? 22 : 18; }
        } else if (e.p !== undefined || e.list) {
          const items = e.list ? e.list : [e.p];
          for (const it of items) {
            const bullet = !!e.list;
            const ix = x0 + (bullet ? 14 : 0), iw = W - (bullet ? 14 : 0);
            if (bullet) ops.push({ type: 'rect', x: x0 + 4, y: y + 5, w: 4, h: 4, color: textCol });
            const toks = tokens(String(it));
            const lines = [];
            let line = [], lw = 0;
            for (const tk of toks) {
              const ww = textWidth(tk.w, tk.bold) + (/^\s+$/.test(tk.w) ? 0 : 0);
              if (lw + ww > iw && line.length && !/^\s+$/.test(tk.w)) { lines.push(line); line = []; lw = 0; }
              if (!line.length && /^\s+$/.test(tk.w)) continue;
              line.push({ ...tk, x: lw }); lw += ww;
            }
            if (line.length) lines.push(line);
            for (const ln of lines) {
              const lwid = ln.length ? ln[ln.length - 1].x + textWidth(ln[ln.length - 1].w, ln[ln.length - 1].bold) : 0;
              const off = e.center ? Math.max(0, (iw - lwid) / 2) : 0;
              for (const tk of ln) {
                const tx = ix + off + tk.x;
                if (tk.link) {
                  const vis = this.visited.has(this.resolve(tk.link));
                  ops.push({ type: 'text', t: tk.w, x: tx, y, color: vis ? C.visited : linkCol, bold: tk.bold, underline: !/^\s+$/.test(tk.w), link: tk.link });
                  links.push({ x: tx, y, w: textWidth(tk.w, tk.bold) + 3, h: LINE_H, url: tk.link });
                } else ops.push({ type: 'text', t: tk.w, x: tx, y, color: e.color || textCol, bold: tk.bold });
              }
              y += LINE_H + 1;
            }
            y += bullet ? 3 : 7;
          }
        } else if (e.img) {
          const iw = Math.min(e.w, W), ih = Math.round(e.h * (iw / e.w));
          ops.push({ type: 'img', name: e.img, x: e.center ? x0 + (W - iw) / 2 : x0, y, w: iw, h: ih });
          y += ih + 8;
        } else if (e.hr) { ops.push({ type: 'hr', x: x0, y: y + 4, w: W }); y += 12; }
        else if (e.space) y += e.space;
        else if (e.marquee) { ops.push({ type: 'marquee', t: e.marquee, x: x0, y, w: W, color: e.color || textCol }); y += 18; }
        else if (e.counter !== undefined) {
          const s = String(e.counter).padStart(6, '0');
          ops.push({ type: 'counter', t: s, x: x0 + (W - s.length * 12) / 2, y }); y += 26;
        } else if (e.search) {
          const fw = Math.min(260, W - 80);
          const sx = e.center ? x0 + (W - fw - 70) / 2 : x0;
          widgets.push({ type: 'search', x: sx, y, w: fw, value: e.value });
          y += 30;
        } else if (e.cols) {
          let cx = x0, maxY = y;
          e.cols.forEach((col, i) => { const cw = Math.floor(W * e.widths[i]) - 8; const yy = flow(col, cx, y, cw); maxY = Math.max(maxY, yy); cx += cw + 12; });
          y = maxY;
        } else if (e.box) {
          const start = ops.length;
          const yy = flow(e.box, x0 + 6, y + 6, W - 12);
          ops.splice(start, 0, { type: 'box', x: x0, y, w: W, h: yy - y + 4, bg: e.bg || '#eeeeee' });
          y = yy + 10;
        } else if (e.table) {
          const cws = e.widths.map((f) => Math.floor(W * f));
          for (const row of e.table) {
            let rowH = 0;
            const cellOps = [];
            let cx = x0;
            row.forEach((cell, i) => {
              const start = ops.length;
              const yy = flow([{ p: cell }], cx + 4, y + 3, cws[i] - 8);
              rowH = Math.max(rowH, yy - y);
              cellOps.push({ x: cx, w: cws[i] });
              cx += cws[i];
            });
            if (e.border) for (const c of cellOps) ops.push({ type: 'cell', x: c.x, y, w: c.w, h: rowH, color: textCol });
            y += rowH;
          }
          y += 8;
        }
      }
      return y;
    };
    const h = flow(p.body, 10, 10, w - 20);
    return { ops, links, widgets, h: h + 20 };
  }

  // ---------------------------------------------------------- draw
  draw(ui, x, y, w, h) {
    const ctx = ui.ctx;
    ui.fill(x, y, w, h, C.face);
    // toolbar
    const tb = [['Back', 'back', () => this.back(), !this.hist.length], ['Forward', 'forward', () => this.forward(), !this.fwd.length], ['Stop', 'stop', () => { this.loading = false; }, !this.loading], ['Refresh', 'refresh', () => this.go(this.url, true)], ['Home', 'home', () => this.go(HOME)], null, ['Search', 'search', () => this.go('http://www.altavisor.com/')], ['Favorites', 'fav', () => this.go(HOME)], ['History', 'history', () => this.back(), !this.hist.length], null, ['Mail', 'mail', () => this.os.open('mail')]];
    let bx = x + 2;
    for (const b of tb) {
      if (!b) { ui.vline(bx + 2, y + 4, 36, C.shadow); ui.vline(bx + 3, y + 4, 36, C.hi); bx += 7; continue; }
      if (ui.toolButton('br_' + b[0], bx, y + 2, 50, 40, b[0], icon(b[1], 16), { disabled: b[3] })) { b[2](); sfx('click', { vol: 0.2, bus: 'ui' }); }
      bx += 51;
    }
    // throbber
    const thx = x + w - 44;
    ui.bevel(thx, y + 2, 42, 40, 'thin', '#000');
    const spin = this.loading ? ui.time * 4 : 0;
    ctx.save(); ctx.translate(thx + 21, y + 22);
    ctx.drawImage(icon('browser', 32), -16, -16);
    if (this.loading) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 3; i++) { const a = spin + i * 2.1; ctx.fillRect(Math.cos(a) * 14 - 1, Math.sin(a) * 6 - 1, 3, 3); } }
    ctx.restore();
    // address bar
    const ay = y + 46;
    ui.bevel(x, ay - 2, w, 2, 'groove', null);
    ui.text('Address', x + 4, ay + 4, C.text);
    const fw = w - 140;
    if (ui.field('br_addr', x + 50, ay, fw, 21, this.addr)) this.go(this.addr.value);
    ctx.drawImage(icon('browser', 16), x + 53, ay + 3);
    ui.arrowBtn('br_drop', x + 50 + fw - 18, ay + 2, 16, 17, 'down');
    if (ui.button('br_go', x + 54 + fw, ay, 34, 21, 'Go')) this.go(this.addr.value);
    ui.text('Links »', x + w - 46, ay + 4);
    // page
    const py = ay + 26, ph = h - (py - y) - 22;
    ui.bevel(x, py, w, ph, 'sunken', '#fff');
    const pw = w - 4 - 16;
    if (!this.lay || this.layW !== pw) { if (this.page) { this.lay = this.layout(pw); this.layW = pw; } }
    const P = this.page;
    if (P && this.lay) {
      ui.clip(x + 2, py + 2, pw, ph - 4);
      ui.fill(x + 2, py + 2, pw, ph - 4, P.bg || '#fff');
      if (P.tile === 'stars') { const t = IMAGES.stars(); for (let ty = 0; ty < ph; ty += t.height) for (let tx = 0; tx < pw; tx += t.width) ctx.drawImage(t, x + 2 + tx, py + 2 + ty - (this.scroll.scroll % t.height)); }
      const oy = py + 2 - this.scroll.scroll, ox = x + 2;
      const k = this.loading ? this.loadT / this.loadDur : 1;
      const textShown = this.loading ? this.loadT > 0.35 : true;
      let hoverLink = null;
      for (const op of this.lay.ops) {
        const yy = oy + op.y;
        if (yy > py + ph || yy + (op.h || 30) < py) continue;
        if (op.type === 'text' && textShown) drawText(ctx, op.t, ox + op.x, yy, op.color, { bold: op.bold, underline: op.underline });
        else if (op.type === 'textS' && textShown) drawTextScaled(ctx, op.t, ox + op.x, yy, op.color, 2, true);
        else if (op.type === 'rect') { ctx.fillStyle = op.color; ctx.fillRect(ox + op.x, yy, op.w, op.h); }
        else if (op.type === 'hr') { ui.bevel(ox + op.x, yy, op.w, 2, 'groove', null); }
        else if (op.type === 'box') { ctx.fillStyle = op.bg; ctx.fillRect(ox + op.x, yy, op.w, op.h); ctx.fillStyle = '#c0c0c0'; ctx.fillRect(ox + op.x, yy, op.w, 1); ctx.fillRect(ox + op.x, yy + op.h - 1, op.w, 1); ctx.fillRect(ox + op.x, yy, 1, op.h); ctx.fillRect(ox + op.x + op.w - 1, yy, 1, op.h); }
        else if (op.type === 'cell') { ctx.fillStyle = '#808080'; ctx.fillRect(ox + op.x, yy, op.w, 1); ctx.fillRect(ox + op.x, yy + op.h, op.w, 1); ctx.fillRect(ox + op.x, yy, 1, op.h); ctx.fillRect(ox + op.x + op.w, yy, 1, op.h + 1); }
        else if (op.type === 'img') {
          const img = IMAGES[op.name] ? IMAGES[op.name](op.w, op.h) : null;
          // interlaced reveal while loading over the modem
          const rev = this.loading ? Math.max(0, Math.min(1, (this.loadT - 0.4) / Math.max(0.3, this.loadDur - 0.4))) : 1;
          if (img) {
            if (rev >= 1) ctx.drawImage(img, ox + op.x, yy, op.w, op.h);
            else if (rev > 0) {
              const step = rev < 0.4 ? 8 : rev < 0.7 ? 4 : 2;
              for (let ly = 0; ly < op.h * Math.min(1, rev * 1.3); ly += step) ctx.drawImage(img, 0, ly / op.h * img.height, img.width, step / op.h * img.height, ox + op.x, yy + ly, op.w, step);
            } else { ctx.strokeStyle = '#808080'; ctx.strokeRect(ox + op.x + 0.5, yy + 0.5, op.w - 1, op.h - 1); }
          }
        } else if (op.type === 'marquee' && textShown) {
          const tw = textWidth(op.t, true);
          const mx = op.w - ((this.marqueeX) % (op.w + tw));
          ui.clip(ox + op.x, yy, op.w, 16);
          drawText(ctx, op.t, ox + op.x + mx, yy + 2, op.color, { bold: true });
          ui.unclip();
        } else if (op.type === 'counter' && textShown) {
          for (let i = 0; i < op.t.length; i++) { ctx.fillStyle = '#000'; ctx.fillRect(ox + op.x + i * 12, yy, 11, 18); drawText(ctx, op.t[i], ox + op.x + i * 12 + 3, yy + 3, '#00ff00', { bold: true }); }
        }
      }
      // links
      if (textShown) for (const l of this.lay.links) {
        if (ui.hit(ox + l.x, oy + l.y, l.w, l.h)) { hoverLink = l; ui.cursor = 'hand'; }
        const st = ui.clickable('lnk' + l.url + l.x + l.y, ox + l.x, oy + l.y, l.w, l.h);
        if (st.clicked) { this.go(l.url); sfx('click', { vol: 0.15, bus: 'ui' }); }
      }
      // embedded widgets (search box)
      for (const wd of this.lay.widgets) {
        if (wd.type === 'search') {
          if (wd.value !== undefined && this.searchQ.lastV !== wd.value) { this.searchQ.value = wd.value; this.searchQ.lastV = wd.value; }
          const sub = ui.field('br_sq' + wd.y, ox + wd.x, oy + wd.y, wd.w, 21, this.searchQ);
          if (ui.button('br_sb' + wd.y, ox + wd.x + wd.w + 6, oy + wd.y, 64, 21, 'Search') || sub) this.go('http://www.altavisor.com/search?q=' + encodeURIComponent(this.searchQ.value));
        }
      }
      ui.unclip();
      this.hoverLink = hoverLink;
      const ss = { scroll: this.scroll.scroll, max: this.lay.h, page: ph - 4, drag: this.scroll.drag };
      ui.vscroll('br_sc', x + w - 18, py + 2, ph - 4, ss);
      this.scroll.scroll = ss.scroll; this.scroll.drag = ss.drag;
    }
    // status bar
    const sy = y + h - 19;
    ui.bevel(x, sy, w - 150, 18, 'thin');
    const status = this.loading ? 'Opening page ' + this.url + '...' : this.hoverLink ? this.resolve(this.hoverLink.url) : 'Done';
    ui.text(status, x + 4, sy + 3, C.text, { maxW: w - 160 });
    ui.bevel(x + w - 148, sy, 70, 18, 'thin');
    if (this.loading) ui.progress(x + w - 146, sy + 2, 66, 14, this.loadT / this.loadDur);
    ui.bevel(x + w - 76, sy, 76, 18, 'thin');
    ctx.drawImage(icon('browser', 16), x + w - 72, sy + 1);
    ui.text('Internet', x + w - 52, sy + 3);
  }
}
