// Voyager web browser: fake local web (content/sites.js) + real sites in a sandboxed iframe.
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { SITES } from '../content/sites.js';

const HOME = 'voyager.home';
const BOOKMARKS = [
  ['Askew Search', 'askew.search'], ['QuikMart', 'quikmart.shop'], ['First Bank of Earth', 'firstbankofearth.com'],
  ['Daily Pulse', 'dailypulse.news'], ['AlienSpouseSupport', 'alienspousesupport.net'], ['LIFELINE 24 KB', 'lifeline24.com/kb'],
  ['MorseCode.wiki', 'morsecode.wiki'], ['DTP (official)', 'dtp.gov'],
  ['Real: OpenStreetMap', 'https://www.openstreetmap.org/export/embed.html?bbox=100.49,13.72,100.56,13.77&layer=mapnik'],
  ['Real: Wikipedia — Instant noodle', 'https://en.m.wikipedia.org/wiki/Instant_noodle'],
];

export function registerBrowser(os, comp) {
  os.register('browser', { title: 'Voyager', icon: 'browser', w: 640, h: 470, minW: 420, minH: 300, create: (win, args) => new Browser(win, comp, args.url) });
}

function parse(raw) {
  let s = String(raw || '').trim();
  if (!s) return { fake: true, host: HOME, path: '', query: {}, url: HOME };
  const m = s.match(/^(https?):\/\/(.*)$/i);
  let rest = m ? m[2] : s;
  rest = rest.replace(/^www\./i, '');
  const host = rest.split(/[/?#]/)[0].toLowerCase();
  if (SITES[host]) {
    const after = rest.slice(host.length);
    const [p, q = ''] = after.split('?');
    const query = Object.fromEntries(new URLSearchParams(q));
    return { fake: true, host, path: p || '', query, url: host + (p || '') + (q ? '?' + q : '') };
  }
  if (!/\./.test(host)) return { fake: true, host: 'askew.search', path: '/', query: { q: s }, url: 'askew.search/?q=' + encodeURIComponent(s) };
  return { fake: false, url: m ? s : 'https://' + s };
}

class Browser {
  constructor(win, comp, url) {
    this.win = win; this.comp = comp; this.back = []; this.fwd = []; this.cur = null; this.mem = comp.browserMem ||= {}; this.visited = comp.visited ||= new Set();
    win.setMenus([
      { label: 'File', items: [{ label: 'Open Location...', action: () => { this.addr.focus(); this.addr.select(); } }, { sep: true }, { label: 'Close', action: () => win.close() }] },
      { label: 'Go', items: () => [{ label: 'Back', action: () => this.goBack(), disabled: !this.back.length }, { label: 'Forward', action: () => this.goFwd(), disabled: !this.fwd.length }, { label: 'Home', action: () => this.nav(HOME) },
        { sep: true }, ...(this.history || []).slice(-8).reverse().map((u) => ({ label: u.length > 40 ? u.slice(0, 40) + '…' : u, action: () => this.nav(u) }))] },
      { label: 'Bookmarks', items: () => BOOKMARKS.map(([t, u]) => ({ label: t, action: () => this.nav(u) })) },
      { label: 'Help', items: [{ label: 'About Voyager', action: () => comp.os.dialog({ title: 'About Voyager', icon: 'browser', text: '<b>Voyager 4.0</b> for Doorways 98<br>"Set sail on the Information Superhighway."<br><br>Some real websites refuse to appear inside other programs. That is their right. Voyager respects their boundaries and offers to open them in a separate window.' }) }] },
    ]);
    const tb = (label, fn, ico) => h('button', { class: 'd98-tool', onclick: fn, style: { flexDirection: 'column', height: '36px', minWidth: '44px', gap: '0' } }, ico ? h('span', { style: { fontSize: '15px', lineHeight: '16px' } }, ico) : null, h('span', { style: { fontSize: '10px' } }, label));
    this.btnBack = tb('Back', () => this.goBack(), '◀'); this.btnFwd = tb('Forward', () => this.goFwd(), '▶');
    this.throb = h('div', { class: 'd98-throbber' }, h('img', { src: icon('browser', 16) }));
    const tools = h('div', { class: 'd98-toolbar' }, this.btnBack, this.btnFwd, tb('Stop', () => this.stop(), '✕'), tb('Refresh', () => this.reload(), '↻'), tb('Home', () => this.nav(HOME), '⌂'), tb('Search', () => this.nav('askew.search'), '🔍'), h('div', { style: { flex: 1 } }), this.throb);
    this.addr = h('input', { class: 'd98-input', spellcheck: 'false' });
    this.addr.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.nav(this.addr.value); });
    const addrRow = h('div', { class: 'd98-addr' }, 'Address', this.addr, h('button', { class: 'd98-btn', style: { minWidth: '40px' }, onclick: () => this.nav(this.addr.value) }, 'Go'));
    const links = h('div', { class: 'd98-toolbar', style: { fontSize: '11px', overflow: 'hidden', whiteSpace: 'nowrap' } }, h('b', { style: { padding: '0 4px' } }, 'Links'),
      ...[['Askew', 'askew.search'], ['QuikMart', 'quikmart.shop'], ['Bank', 'firstbankofearth.com'], ['News', 'dailypulse.news'], ['Forum', 'alienspousesupport.net'], ['KB', 'lifeline24.com/kb']].map(([t, u]) => h('button', { class: 'd98-tool', onclick: () => this.nav(u) }, h('img', { src: icon('browser', 16) }), t)));
    this.view = h('div', { class: 'd98-browser-view' });
    this.statusL = h('div', {}, 'Done'); this.prog = h('div', { class: 'd98-progress', style: { display: 'none' } }, h('i', { style: { width: '0%' } }));
    win.body.append(tools, addrRow, links, this.view, h('div', { class: 'd98-status' }, this.statusL, h('div', { style: { flex: 'none', width: '110px', padding: '2px' } }, this.prog), h('div', { style: { flex: 'none', width: '90px' } }, '🌐 Internet')));
    this.view.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-href]'); if (!a) return;
      e.preventDefault(); a.classList.add('v'); this.nav(a.dataset.href);
    });
    this.view.addEventListener('mouseover', (e) => { const a = e.target.closest('a[data-href]'); this.statusL.textContent = a ? a.dataset.href : this.loading ? 'Opening page…' : 'Done'; });
    this.history = comp.browserHistory ||= [];
    this.nav(url || HOME, false);
  }
  onArgs(args) { if (args.url) this.nav(args.url); }
  onClose() { clearTimeout(this.t1); clearTimeout(this.t2); clearInterval(this.pt); }
  goBack() { if (!this.back.length) return; this.fwd.push(this.cur); this.nav(this.back.pop(), false, true); }
  goFwd() { if (!this.fwd.length) return; this.back.push(this.cur); this.nav(this.fwd.pop(), false, true); }
  stop() { clearTimeout(this.t1); clearInterval(this.pt); this.setLoading(false); this.statusL.textContent = 'Stopped'; }
  reload() { if (this.cur) this.nav(this.cur, false, true); }
  setLoading(on) {
    this.loading = on; this.throb.classList.toggle('busy', on);
    this.prog.style.display = on ? '' : 'none';
    this.btnBack.disabled = !this.back.length; this.btnFwd.disabled = !this.fwd.length;
  }
  nav(raw, push = true, fromHistory = false) {
    const u = parse(raw);
    if (push && this.cur && !fromHistory) { this.back.push(this.cur); this.fwd = []; }
    this.cur = u.url; this.addr.value = u.fake ? 'http://' + u.url : u.url;
    this.history.push(u.url); if (this.history.length > 50) this.history.shift();
    clearTimeout(this.t1); clearTimeout(this.t2); clearInterval(this.pt);
    this.setLoading(true); this.statusL.textContent = `Connecting to ${u.fake ? u.host : new URL(u.url).host}…`;
    let p = 0; const bar = this.prog.firstChild; bar.style.width = '0%';
    this.pt = setInterval(() => { p = Math.min(95, p + 7 + Math.random() * 18); bar.style.width = p + '%'; }, 90);
    this.comp.audio('os.press', 0.2);
    if (u.fake) {
      this.t1 = setTimeout(() => {
        clearInterval(this.pt);
        this.view.innerHTML = '';
        const ctx = { path: u.path, query: u.query, game: this.comp.game, comp: this.comp, mem: this.mem, nav: (x) => this.nav(x), reload: () => this.render(u) };
        this.lastCtx = ctx;
        this.render(u);
        this.setLoading(false); this.statusL.textContent = 'Done';
      }, 220 + Math.random() * 380);
    } else this.loadExternal(u.url);
  }
  render(u) {
    const page = h('div', { class: 'd98-page' });
    let out;
    try { out = SITES[u.host](this.lastCtx); } catch (e) { console.error(e); out = { title: 'Error', el: h('div', { style: { padding: '20px' } }, 'The page could not be rendered.') }; }
    page.appendChild(out.el);
    const keep = this.view.querySelector('.d98-page')?.scrollTop || 0;
    this.view.innerHTML = ''; this.view.appendChild(page);
    if (this._sameUrl === u.url) page.scrollTop = keep; this._sameUrl = u.url;
    this.win.setTitle(`${out.title} - Voyager`);
  }
  loadExternal(url) {
    this.view.innerHTML = '';
    const ifr = h('iframe', { class: 'd98-frame', src: url, sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups', referrerpolicy: 'no-referrer' });
    const note = h('div', { class: 'd98-frame-note' }, h('img', { src: icon('info', 16), style: { width: '16px', height: '16px' } }),
      h('span', {}, 'Showing a page from the real Internet. Some sites refuse to be shown inside other programs — if this stays blank, '),
      h('a', { onclick: () => window.open(url, '_blank', 'noopener') }, 'open it in a new window'), h('a', { onclick: () => note.remove() }, '✕'));
    let loaded = false;
    ifr.addEventListener('load', () => { loaded = true; clearInterval(this.pt); this.setLoading(false); this.statusL.textContent = 'Done (external page)'; });
    this.view.append(ifr, note);
    this.win.setTitle(`${new URL(url).host} - Voyager`);
    this.t2 = setTimeout(() => {
      if (loaded) return;
      clearInterval(this.pt); this.setLoading(false);
      this.statusL.textContent = 'Page could not be displayed';
      this.view.innerHTML = '';
      this.view.appendChild(h('div', { class: 'd98-page' }, h('div', { style: { padding: '24px', fontFamily: 'Arial, sans-serif', fontSize: '13px' } },
        h('h2', { style: { fontFamily: 'Arial, sans-serif' } }, 'This page cannot be displayed in Voyager'),
        h('p', {}, `The site at ${new URL(url).host} did not respond, or does not allow itself to be shown inside another program.`),
        h('ul', {}, h('li', {}, 'Check the address for typing errors.'), h('li', {}, 'Click the Refresh button, or try again later.'), h('li', {}, h('a', { onclick: () => window.open(url, '_blank', 'noopener') }, 'Open the page in a separate window')), h('li', {}, 'If you are in the middle of an alien invasion, the Internet may be busy.')),
        h('p', { style: { color: '#777', fontSize: '11px' } }, 'Voyager error code: CROSS_ORIGIN_SHY'))));
    }, 12000);
  }
}
