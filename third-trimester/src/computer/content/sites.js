// The fake World Wide Web of 1998-ish, as seen from room 1407.
import { h, money, fmtClock } from '../dom.js';
import { ITEMS, SHOP_ORDER } from '../../game/items.js';
import { spend, addMoney, useItem } from '../../game/state.js';
import { KB } from './kb.js';

const L = (href, text, extra = {}) => h('a', { 'data-href': href, ...extra }, text);
const put = (el, ...kids) => el.append(...kids.flat().filter((k) => k != null && k !== false));
const day = (g) => g.state?.day ?? 1;
const babyName = (g) => g.state?.baby?.name || 'Bean';

// ---------------- search index ----------------
const INDEX = [
  { url: 'quikmart.shop', title: 'QuikMart Delivery — noodles in 30 minutes', kw: 'noodles food shop buy delivery groceries formula diapers eggs ice pickles chocolate chalk battery sell crystal', snip: 'Order Lucky Noodle, GLOW formula and more to your door. Now buying "unusual crystals".' },
  { url: 'firstbankofearth.com', title: 'First Bank of Earth — Online Banking', kw: 'bank money balance account transactions pay', snip: 'Check your balance. We\'re just a bank.' },
  { url: 'dailypulse.news', title: 'Daily Pulse — news that beats', kw: 'news ships crash towers dtp government cats stocks moon tanks', snip: 'Ships fall on the city. The DTP says everything is fine. Cats and the stock market.' },
  { url: 'dailypulse.news/archive', title: 'Daily Pulse Archive & Obituaries (1950–today)', kw: 'obituary obituaries death archive died marrow edith 1987 lantern street', snip: 'Search sixty years of Daily Pulse, including every obituary we ever printed.' },
  { url: 'alienspousesupport.net', title: 'AlienSpouseSupport.net — you are not alone', kw: 'alien spouse husband wife married support forum baby pregnant expecting', snip: '412 humans married to things from elsewhere, helping each other.' },
  { url: 'lifeline24.com', title: 'LIFELINE 24 — We Answer Everything', kw: 'lifeline hotline job work help kb knowledge base support', snip: 'Customer care for literally everything. Agent Knowledge Base mirror.' },
  { url: 'lifeline24.com/kb', title: 'LIFELINE 24 Knowledge Base (public mirror)', kw: 'knowledge base toaster router fridge tv paranormal policy protocol trace registry breadzapper', snip: 'Every article from the Agent Console, on the web.' },
  { url: 'morsecode.wiki', title: 'MorseCode.wiki — chart & translator', kw: 'morse code beeps dots dashes translate decode chart', snip: 'International Morse chart plus a free dot-dash translator.' },
  { url: 'pizzapronto.com', title: 'Pizza Pronto — 30 minutes or philosophy', kw: 'pizza food pineapple garlic knots kevin', snip: 'Pizzas, knots, two-litres. Partnered with LIFELINE 24.' },
  { url: 'dtp.gov', title: 'Department of Terrestrial Purity (official)', kw: 'dtp government brass general report alien wanted military', snip: 'Keeping Earth earthly since 1951. Report an alien today.' },
  { url: 'whoisawake.net', title: 'who is awake', kw: 'awake night sunny 1407 baby watching cool site', snip: 'who is awake right now?' },
  { url: 'theboard.cat', title: 'theboard.cat', kw: 'board cat cats tofu chairman meeting tuna', snip: 'There is no board.' },
];

function frame(title, bg, ...kids) { return h('div', { style: { minHeight: '100%', background: bg || '#fff', padding: '10px 14px' } }, ...kids); }
function banner(text, sub, bg, fg = '#fff', font = 'Arial Black, Arial, sans-serif') {
  return h('div', { style: { background: bg, color: fg, padding: '10px 14px', margin: '-10px -14px 10px', fontFamily: font } },
    h('div', { style: { fontSize: '24px', fontWeight: 900, letterSpacing: '1px' } }, text), sub ? h('div', { style: { fontSize: '11px', opacity: 0.85 } }, sub) : null);
}
const marquee = (text, bg = '#000', fg = '#ff0') => h('div', { style: { overflow: 'hidden', whiteSpace: 'nowrap', background: bg, color: fg, fontFamily: 'Courier New, monospace', fontSize: '12px', padding: '2px 0', margin: '6px 0' } },
  h('div', { style: { display: 'inline-block', paddingLeft: '100%', animation: 'd98marq 18s linear infinite' } }, text));

// ---------------- sites ----------------
export const SITES = {
  'voyager.home': (c) => {
    const g = c.game;
    const q = h('input', { type: 'text', style: { width: '260px' } });
    const go = () => c.nav('askew.search/?q=' + encodeURIComponent(q.value));
    q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    const heads = HEADLINES.filter((x) => x.day <= day(g)).slice(-4).reverse();
    return { title: 'Voyager Start Page', el: frame('', '#f4f0e6',
      h('div', { style: { textAlign: 'center' } },
        h('div', { style: { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#1a3a8a' } }, '⛵ Voyager'),
        h('div', { style: { fontSize: '11px', color: '#666', marginBottom: '8px' } }, 'Your gateway to the Information Superhighway'),
        h('div', {}, q, ' ', h('button', { onclick: go }, 'Askew it!'))),
      marquee(`★ WEATHER: humid, 31°C, scattered ships ★ Day ${day(g)} ★ Remember: ESC stands you up from the computer ★ Noodles taste better in a bowl ★`),
      h('table', { width: '100%', cellpadding: 6 }, h('tr', {},
        h('td', { valign: 'top', width: '55%' }, h('b', {}, 'Today\'s headlines'), h('ul', {}, ...heads.map((x) => h('li', {}, L('dailypulse.news/' + x.id, x.title))))),
        h('td', { valign: 'top', style: { background: '#fffbe0', border: '1px solid #cc9' } }, h('b', {}, 'Cool Site of the Day'), h('p', {}, L('whoisawake.net', 'who is awake?')), h('p', { style: { fontSize: '11px' } }, '"I visited and it knew my name!!" — anonymous'),
          h('b', {}, 'Links'), h('ul', {}, h('li', {}, L('quikmart.shop', 'QuikMart Delivery')), h('li', {}, L('firstbankofearth.com', 'First Bank of Earth')), h('li', {}, L('alienspousesupport.net', 'AlienSpouseSupport.net')), h('li', {}, L('morsecode.wiki', 'MorseCode.wiki')))))),
      h('p', { style: { fontSize: '11px', color: '#777', textAlign: 'center' } }, 'Real web pages work too — type any address, e.g. ', L('https://www.openstreetmap.org/export/embed.html?bbox=100.49,13.72,100.56,13.77&layer=mapnik', 'a real map'), '.')) };
  },

  'askew.search': (c) => {
    const q = (c.query.q || '').trim();
    const inp = h('input', { type: 'text', value: q, style: { width: '300px' } });
    const go = () => c.nav('askew.search/?q=' + encodeURIComponent(inp.value));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const results = words.length ? INDEX.map((r) => ({ r, s: words.reduce((s, w) => s + ((r.kw + ' ' + r.title).toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.r) : [];
    const real = q ? [
      { url: 'https://en.m.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(q), title: `"${q}" on Wikipedia (the real one)` },
      { url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), title: `Search the real web for "${q}"` },
    ] : [];
    return { title: q ? `Askew: ${q}` : 'Askew', el: frame('', '#fff',
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
        h('span', { style: { fontFamily: 'Georgia, serif', fontSize: '26px', color: '#b8231e', fontStyle: 'italic', transform: 'rotate(-4deg)', display: 'inline-block' } }, 'Askew'),
        inp, h('button', { onclick: go }, 'Search')),
      !q ? h('p', {}, 'Ask Askew anything. We\'ll tilt our head and think about it.') : null,
      q ? h('p', { style: { fontSize: '12px', color: '#555' } }, `Results 1–${results.length + real.length} for `, h('b', {}, q)) : null,
      ...results.map((r) => h('div', { style: { margin: '0 0 10px' } }, L(r.url, r.title, { style: { fontSize: '15px' } }), h('div', { style: { fontSize: '12px' } }, r.snip), h('div', { style: { fontSize: '11px', color: '#080' } }, 'http://' + r.url))),
      q && !results.length ? h('p', {}, 'Askew found nothing on the local web. It tilted its head the other way. Still nothing.') : null,
      ...real.map((r) => h('div', { style: { margin: '0 0 10px' } }, L(r.url, r.title, { style: { fontSize: '15px' } }), h('div', { style: { fontSize: '11px', color: '#080' } }, r.url.slice(0, 60) + '…')))) };
  },

  'quikmart.shop': (c) => shopPage(c),
  'firstbankofearth.com': (c) => bankPage(c),
  'dailypulse.news': (c) => newsPage(c),
  'alienspousesupport.net': (c) => forumPage(c),
  'lifeline24.com': (c) => lifelinePage(c),
  'morsecode.wiki': (c) => morsePage(c),
  'pizzapronto.com': () => ({ title: 'Pizza Pronto!', el: frame('', '#fff3d6', banner('🍕 PIZZA PRONTO', '30 minutes or it\'s philosophically free', '#c0261a'),
    h('table', { border: 1, cellpadding: 5, style: { background: '#fff' } }, ...[['Large Pepperoni', '$11.99'], ['All-Pineapple (the "Kevin")', '$12.49'], ['Garlic Knots ×8', '$4.99'], ['Two-litre (orange)', '$2.49'], ['Pizza With A Note On The Box', '+$0.50']].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))),
    h('p', {}, 'Phone orders only. If you reach LIFELINE 24 by mistake, ask them to transfer you. They\'re nice.')) }),
  'dtp.gov': (c) => dtpPage(c),
  'whoisawake.net': (c) => awakePage(c),
  'theboard.cat': (c) => ({ title: 'theboard.cat', el: h('div', { style: { minHeight: '100%', background: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'Georgia, serif', color: '#ccc', fontSize: '10px' } },
    h('div', { style: { textAlign: 'center' } }, day(c.game) >= 5 ? h('div', { style: { color: '#000', fontSize: '14px' } }, 'The meeting has begun.') : 'There is no board.', h('br'), h('span', { style: { fontSize: '8px' } }, c.game.state?.flags?.morse ? 'Agenda item 1: tuna.' : ''))) }),
};

// ---------------- QuikMart ----------------
function shopPage(c) {
  const g = c.game, comp = c.comp;
  const cart = c.mem.cart ||= {};
  const tab = c.path.startsWith('/sell') ? 'sell' : 'shop';
  const wrap = frame('', '#fff');
  wrap.appendChild(banner('QuikMart', 'Delivery to Golden Lotus Mansions in ~30 minutes — "Quick, Mart!"', 'linear-gradient(90deg,#0a7a3a,#1aa85a)'));
  wrap.appendChild(h('div', { style: { marginBottom: '8px' } }, L('quikmart.shop', 'Shop'), ' | ', L('quikmart.shop/sell', 'Sell to QuikMart'), ' | ', h('span', {}, 'Balance: ', h('b', {}, money(g.state?.money ?? 0)))));
  if (tab === 'sell') {
    const have = g.state?.pantry?.crystal || 0;
    const price = ITEMS.crystal.sell;
    put(wrap, h('h3', {}, 'We buy unusual crystals!'), h('p', {}, `Glowing? Humming? Found somewhere you'd rather not discuss? QuikMart pays `, h('b', {}, money(price)), ' per crystal. No questions. One question: does it bite?'),
      h('p', {}, `Crystals in your home: `, h('b', {}, String(have))));
    const sellBtn = h('button', { disabled: !have, onclick: () => {
      if (!useItem('crystal', have)) return;
      addMoney(price * have, `QuikMart: sold ${have} crystal(s)`);
      g.events.emit('sell', { id: 'crystal', qty: have });
      comp.audio('os.complete', 0.6);
      comp.os.dialog({ title: 'QuikMart', icon: 'info', text: `Sold ${have} crystal(s) for ${money(price * have)}. A courier will collect them from your door. Wear gloves.` });
      c.reload();
    } }, have ? `Sell all (${have}) for ${money(price * have)}` : 'Nothing to sell');
    wrap.appendChild(sellBtn);
    return { title: 'QuikMart — Sell', el: wrap };
  }
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' } });
  for (const id of SHOP_ORDER) {
    const it = ITEMS[id];
    const col = '#' + it.color.toString(16).padStart(6, '0');
    const n = h('input', { type: 'number', min: 1, max: 9, value: 1, style: { width: '38px' } });
    n.addEventListener('keydown', (e) => e.stopPropagation());
    const pantry = g.state?.pantry?.[id] || 0;
    grid.appendChild(h('div', { style: { border: '1px solid #9c9', padding: '5px', display: 'flex', gap: '6px', background: '#f6fff6' } },
      h('div', { style: { width: '34px', height: '40px', background: col, border: '1px solid #000', flex: 'none', boxShadow: 'inset -4px -4px 0 rgba(0,0,0,.2)' } }),
      h('div', { style: { flex: 1, fontSize: '12px' } }, h('b', {}, it.name), h('div', { style: { color: '#555' } }, it.desc), h('div', {}, h('b', { style: { color: '#b00' } }, money(it.price)), pantry ? h('span', { style: { color: '#777' } }, `  (at home: ${pantry})`) : null),
        h('div', {}, n, ' ', h('button', { onclick: () => { cart[id] = Math.min(20, (cart[id] || 0) + (+n.value || 1)); comp.audio('os.press', 0.4); c.reload(); } }, 'Add to cart')))));
  }
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty }));
  const total = Math.round(lines.reduce((s, l) => s + ITEMS[l.id].price * l.qty, 0) * 100) / 100;
  const cartBox = h('div', { style: { border: '2px solid #0a7a3a', padding: '6px', marginBottom: '8px', background: '#fffde8' } },
    h('b', {}, '🛒 Your cart'),
    lines.length ? h('table', { width: '100%', style: { fontSize: '12px' } }, ...lines.map((l) => h('tr', {}, h('td', {}, `${l.qty} × ${ITEMS[l.id].name}`), h('td', { align: 'right' }, money(ITEMS[l.id].price * l.qty)), h('td', {}, h('button', { onclick: () => { delete cart[l.id]; c.reload(); } }, '✕'))))) : h('div', { style: { fontSize: '12px', color: '#777' } }, 'Empty. Like a fridge you don\'t own.'),
    lines.length ? h('div', { style: { marginTop: '4px' } }, h('b', {}, `Total: ${money(total)}  `), h('button', { onclick: () => checkout(c, lines, total) }, 'Checkout')) : null);
  const recent = (comp.orders || []).slice(-3).reverse();
  put(wrap, cartBox, recent.length ? h('div', { style: { fontSize: '11px', color: '#555', marginBottom: '6px' } }, 'Recent orders: ', recent.map((o) => `Day ${o.day} ${fmtClock(o.clock)} (${money(o.total)})`).join(' · ')) : null, grid);
  return { title: 'QuikMart Delivery', el: wrap };
}
function checkout(c, lines, total) {
  const g = c.game, comp = c.comp;
  if (!spend(total, 'QuikMart order')) {
    comp.os.dialog({ title: 'QuikMart', icon: 'error', text: `<b>Card declined.</b><br><br>Your balance is ${money(g.state?.money ?? 0)}. The order is ${money(total)}.<br><br>Have you considered taking more calls?` });
    return;
  }
  for (const l of lines) g.events.emit('purchase', { id: l.id, qty: l.qty });
  const st = g.state;
  comp.orders.push({ day: st?.day ?? 1, clock: st?.clock ?? 0, total, lines });
  comp.mail.receipt(lines, total);
  for (const k of Object.keys(c.mem.cart)) delete c.mem.cart[k];
  comp.audio('os.complete', 0.6);
  comp.os.dialog({ title: 'QuikMart', icon: 'info', text: `<b>Order confirmed!</b><br><br>${money(total)} charged to First Bank of Earth.<br>Your delivery will arrive at your door at about <b>${fmtClock((st?.clock ?? 0) + 30)}</b>. We knock twice.` });
  c.reload();
}

// ---------------- Bank ----------------
function bankPage(c) {
  const g = c.game, comp = c.comp;
  const wrap = frame('', '#eef2f8');
  wrap.appendChild(banner('🏛 First Bank of Earth', 'We\'re Just A Bank™', '#123a6a'));
  if (!c.mem.bankIn) {
    const pw = h('input', { type: 'password', value: 'tofu1407', style: { width: '140px' } });
    pw.addEventListener('keydown', (e) => e.stopPropagation());
    wrap.appendChild(h('div', { style: { background: '#fff', border: '1px solid #99a', padding: '12px', width: '280px' } },
      h('b', {}, 'Online Banking Login'), h('p', {}, 'Customer ID: ', h('input', { type: 'text', value: 'SUNNY1407', style: { width: '140px' }, readonly: true })), h('p', {}, 'Password: ', pw),
      h('button', { onclick: () => { c.mem.bankIn = true; comp.audio('os.complete', 0.4); c.reload(); } }, 'Log in'),
      h('p', { style: { fontSize: '10px', color: '#777' } }, 'Never share your password. Your password is "tofu1407". Never share it.')));
    return { title: 'First Bank of Earth — Login', el: wrap };
  }
  const bal = g.state?.money ?? 0;
  const rows = [...comp.bank].reverse().slice(0, 40);
  put(wrap, 
    h('div', { style: { display: 'flex', gap: '20px', alignItems: 'baseline' } }, h('h3', {}, 'Checking ****1407'), h('div', { style: { fontSize: '22px', fontFamily: 'Georgia, serif', color: bal < 5 ? '#b00' : '#063' } }, money(bal))),
    h('table', { border: 1, cellpadding: 3, width: '100%', style: { background: '#fff', fontSize: '12px' } },
      h('tr', { style: { background: '#123a6a', color: '#fff' } }, h('th', {}, 'Date'), h('th', {}, 'Description'), h('th', {}, 'Amount'), h('th', {}, 'Balance')),
      ...rows.map((r) => h('tr', {}, h('td', {}, `Day ${r.day} ${fmtClock(r.clock)}`), h('td', {}, r.reason || '—'), h('td', { align: 'right', style: { color: r.amount < 0 ? '#b00' : '#063' } }, money(r.amount)), h('td', { align: 'right' }, money(r.balance)))),
      rows.length ? null : h('tr', {}, h('td', { colspan: 4 }, 'No transactions this week. Opening balance carried forward.'))),
    h('p', {}, h('button', { onclick: () => comp.os.dialog({ title: 'First Bank of Earth', icon: 'warn', text: 'Transfers are temporarily unavailable.<br><br><b>Reason:</b> ACCOUNT UNDER REVIEW (DTP case #1407-G).<br><br>Deposits from "THE BOARD" are, however, very welcome.' }) }, 'Transfer funds'), ' ', h('button', { onclick: () => { c.mem.bankIn = false; c.reload(); } }, 'Log out')));
  return { title: 'First Bank of Earth — Accounts', el: wrap };
}

// ---------------- Daily Pulse ----------------
const HEADLINES = [
  { id: 'ships', day: 1, title: 'SHIPS FALL ON CITY; TWO TOWERS HIT', body: 'Witnesses describe "a sky full of saucers, then a sky full of noise" as at least four vessels of unknown origin struck the Sky Lotus and Meridian towers on Tuesday night. No deaths were reported. One vessel remains lodged in the 61st floor of the Meridian, where it is "humming politely". The Department of Terrestrial Purity has sealed the area and asked residents to "stop filming, and also stop humming back."' },
  { id: 'dtp', day: 1, title: 'DTP: "Everything Is Under Control, Please Stop Asking"', body: 'At a press conference held in a car park, General Harlan Brass assured the public that "the situation is contained", that "the contained situation is also contained", and that a series of overnight raids were "routine house calls". Asked why one raid required forty soldiers and a cat-sized bag, the General ended the conference.' },
  { id: 'cats', day: 2, title: 'Cats Behind 98% of Stock Market Moves, Economist Claims, Then Resigns', body: 'In a paper withdrawn within the hour, Dr. Priya Varma of the Metro School of Economics found that 98% of major market movements since 1971 were preceded by "unusual feline activity near trading floors". Dr. Varma resigned shortly after publication, citing "a meeting I was invited to". She has since been seen boarding a yacht. The yacht had a cat flap.' },
  { id: 'births', day: 2, title: 'Unusual Births "Not Unusual", Says Ministry', body: 'The Ministry of Health has confirmed that reports of glowing newborns, levitating cots and infants "speaking in their grandmother\'s voice" are "within normal parameters for this week".' },
  { id: 'drones', day: 3, title: 'Drones Deployed To "Help" Residents', body: 'Hundreds of DTP surveillance drones now patrol residential towers. A DTP spokesperson said the drones "are just here to help" and "will absolutely not be peeking into anyone\'s noodles". Several drones were later seen peeking into noodles.' },
  { id: 'moon', day: 4, title: 'Moon "Slightly Closer", Say Experts, Then Retract', body: 'Astronomers briefly agreed that the moon appeared "one thumb and a bit" larger than usual, before issuing a joint statement that the moon "is exactly where it should be, please stop measuring it with your thumb."' },
  { id: 'tanks', day: 5, title: 'Tanks Gather Near Golden Lotus Mansions', body: 'Residents of Golden Lotus Mansions woke to find six armoured vehicles and a mobile command post in the car park. "They asked which floor the noodle guy lives on," said one neighbour. "I said, that\'s all of us."' },
];
const OBITS = [
  { name: 'Edith Marrow', year: 1987, text: 'MARROW, Edith Rose (b. 1921). Died 14 March 1987 at home on Lantern Street during the great storm, having gone out to bring in the washing. Telephonist for 31 years. Kept the porch light on for anyone who needed it. Survived by three cats and a very loyal rotary telephone.', learn: 'edith_dead' },
  { name: 'Harold Holloway', year: 1996, text: 'HOLLOWAY, Harold (b. 1919). Loving husband of Agnes for 51 years. Said "what" with great feeling. Always did the clock.' },
  { name: 'Reginald "Reg" Purr', year: 1971, text: 'PURR, Reginald. Stockbroker. Reportedly "really liked cats". Left his entire estate to an organisation listed only as "the Board".' },
  { name: 'Mildred Okonkwo', year: 1964, text: 'OKONKWO, Mildred. Inventor of the folding chair that folds back. Nobody could stop it.' },
  { name: 'Lars Ek', year: 2002, text: 'EK, Lars. Wrote 14 operating system manuals. Never once opened a door he couldn\'t close.' },
];
function newsPage(c) {
  const g = c.game, comp = c.comp;
  const wrap = frame('', '#fffef8');
  wrap.appendChild(h('div', { style: { textAlign: 'center', borderBottom: '3px double #000', marginBottom: '8px' } },
    h('div', { style: { fontFamily: 'Georgia, serif', fontSize: '30px', fontWeight: 700 } }, 'The Daily Pulse'),
    h('div', { style: { fontSize: '11px' } }, `Day ${day(g)} edition · "News That Beats" · `, L('dailypulse.news/archive', 'Archive & Obituaries'))));
  const id = c.path.replace(/^\//, '');
  if (id.startsWith('archive')) {
    const q = (c.query.q || '').trim();
    const inp = h('input', { type: 'text', value: q, placeholder: 'surname, year...', style: { width: '180px' } });
    const go = () => c.nav('dailypulse.news/archive?q=' + encodeURIComponent(inp.value));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    const res = q ? OBITS.filter((o) => (o.name + ' ' + o.year + ' ' + o.text).toLowerCase().includes(q.toLowerCase())) : [];
    for (const r of res) if (r.learn) comp.learn(r.learn);
    put(wrap, h('h3', {}, 'Archive & Obituaries (1950–today)'), h('p', {}, 'Search: ', inp, ' ', h('button', { onclick: go }, 'Find')),
      ...res.map((r) => h('div', { style: { border: '1px solid #ccc', padding: '6px', margin: '6px 0', fontFamily: 'Georgia, serif' } }, h('b', {}, `${r.name} — ${r.year}`), h('p', {}, r.text))),
      q && !res.length ? h('p', {}, 'No records found. Try a surname.') : null,
      !q ? h('p', { style: { color: '#666' } }, 'Tip: search by surname, e.g. "Holloway".') : null);
    return { title: 'Daily Pulse — Archive', el: wrap };
  }
  const art = HEADLINES.find((x) => x.id === id && x.day <= day(g));
  if (art) { put(wrap, h('h2', { style: { fontFamily: 'Georgia, serif' } }, art.title), h('p', { style: { fontFamily: 'Georgia, serif', lineHeight: 1.5 } }, art.body), L('dailypulse.news', '← Front page')); return { title: 'Daily Pulse — ' + art.title, el: wrap }; }
  const list = HEADLINES.filter((x) => x.day <= day(g)).reverse();
  put(wrap, ...list.map((x, i) => h('div', { style: { margin: '0 0 10px', paddingBottom: '6px', borderBottom: '1px solid #ddd' } },
    L('dailypulse.news/' + x.id, x.title, { style: { fontFamily: 'Georgia, serif', fontSize: i === 0 ? '20px' : '15px', fontWeight: 700, color: '#000', textDecoration: 'none' } }),
    h('div', { style: { fontSize: '12px', color: '#444' } }, x.body.slice(0, 140) + '…'))));
  return { title: 'The Daily Pulse', el: wrap };
}

// ---------------- Forum ----------------
const THREADS = [
  { id: 'expecting', title: 'Anyone else expecting? (human dad here)', posts: (g) => [
    ['sunny1407', 3, 'Hi. Human guy, alien husband. I\'m pregnant. I know. Is anyone else? Is it normal that my belly hums at night?'],
    ...(day(g) >= 1 ? [['glenda_fogwife', 0, 'Humming is normal!! Mine whistled. Hang in there. Eat iron. Eat whatever you crave, honestly.']] : []),
    ...(g.state?.baby?.born ? [['moonmum88', 0, 'Saw your update — CONGRATS on the hatching! Formula: warm, not hot. If he floats, that means he\'s happy. If he phases through the crib, that means he\'s bored.']] : []),
    ...(day(g) >= 3 ? [['quiet_tom', 0, 'The DTP took my husband too. 2019. He came back. They always come back. Something brings them back. Hang on.']] : []),
    ...(day(g) >= 5 ? [['[moderator]', 0, 'Thread locked by request of "the Board". (We don\'t know who that is either.)']] : []),
  ] },
  { id: 'molting', title: 'My wife\'s antennae are molting. Normal??', posts: () => [['antennae_anxiety', 5, 'Bits everywhere. The vacuum is scared.'], ['glenda_fogwife', 5, 'Totally normal in spring. Save them, they make great chopsticks.']] },
  { id: 'casserole', title: 'PSA: the DTP took my in-laws\' ship AND the casserole dish', posts: () => [['pyrex_vengeance', 4, 'I want the dish back. They can keep the ship.'], ['quiet_tom', 4, 'They took my fridge. Just the fridge.'], ['sunny1407', 0, 'Same. Fridge. Why the fridge?']] },
  { id: 'cats', title: 'Does anyone else\'s cat seem... informed?', posts: () => [['nervous_neil', 2, 'My cat watches the stock ticker. When it purrs, the market goes up.'], ['glenda_fogwife', 2, 'Don\'t ask the cat questions. Cats hate questions. Cats love answers.']] },
];
function forumPage(c) {
  const g = c.game;
  const wrap = frame('', '#e8e4f4');
  wrap.appendChild(banner('🛸 AlienSpouseSupport.net', '412 members · you are not alone', 'linear-gradient(90deg,#3a1a7a,#7a4ab8)'));
  const id = c.path.replace(/^\/t\//, '');
  const th = THREADS.find((t) => '/t/' + t.id === c.path);
  if (th) {
    const posts = th.posts(g).concat(c.mem['posts_' + th.id] || []);
    put(wrap, L('alienspousesupport.net', '← All threads'), h('h3', {}, th.title),
      ...posts.map(([who, dAgo, text]) => h('div', { style: { background: '#fff', border: '1px solid #b8a8e0', margin: '6px 0', padding: '6px' } }, h('div', { style: { fontSize: '11px', color: '#6a4ab8' } }, `${who} · ${dAgo ? dAgo + ' days ago' : 'today'}`), h('div', {}, text))));
    if (day(g) < 5 || th.id !== 'expecting') {
      const opts = ['Thank you. Really.', 'He glows when he\'s happy. He\'s glowing right now.', 'Does anyone know where the DTP takes them?'];
      wrap.appendChild(h('div', {}, 'Reply: ', ...opts.map((o) => h('button', { style: { margin: '2px' }, onclick: () => { (c.mem['posts_' + th.id] ||= []).push(['sunny1407', 0, o]); c.comp.audio('os.send', 0.4); c.reload(); } }, o))));
    }
    void id;
    return { title: th.title, el: wrap };
  }
  wrap.appendChild(h('table', { width: '100%', cellpadding: 4, style: { background: '#fff' } }, h('tr', { style: { background: '#d8d0f0' } }, h('th', { align: 'left' }, 'Thread'), h('th', {}, 'Replies')),
    ...THREADS.map((t) => h('tr', {}, h('td', {}, L('alienspousesupport.net/t/' + t.id, t.title)), h('td', { align: 'center' }, String(t.posts(g).length - 1))))));
  return { title: 'AlienSpouseSupport.net', el: wrap };
}

// ---------------- LIFELINE ----------------
function lifelinePage(c) {
  const wrap = frame('', '#fff');
  wrap.appendChild(banner('LIFELINE 24', '"We Answer Everything." — since 1979', '#8a1a1a'));
  if (c.path.startsWith('/kb')) {
    const id = c.query.a;
    const art = KB.find((a) => a.id === id);
    if (art) { if (art.learn) c.comp.learn(art.learn); put(wrap, L('lifeline24.com/kb', '← Knowledge Base'), h('div', { html: art.html })); return { title: 'KB: ' + art.title, el: wrap }; }
    put(wrap, h('h3', {}, 'Knowledge Base (public mirror)'), h('ul', {}, ...KB.map((a) => h('li', {}, L('lifeline24.com/kb?a=' + a.id, a.title)))));
    return { title: 'LIFELINE 24 Knowledge Base', el: wrap };
  }
  put(wrap, h('p', {}, 'TV won\'t turn on? Fridge won\'t let you in? House won\'t stop rearranging itself? Call LIFELINE 24. A real human answers. Usually.'),
    h('p', {}, h('b', {}, 'Agents: '), L('lifeline24.com/kb', 'Knowledge Base mirror')),
    h('p', { style: { fontSize: '11px', color: '#777' } }, 'LIFELINE 24 does not cooperate with line traces without a warrant, a subpoena, or a very nice fruit basket.'));
  return { title: 'LIFELINE 24', el: wrap };
}

// ---------------- Morse ----------------
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
function morsePage(c) {
  const wrap = frame('', '#f8f8f0');
  wrap.appendChild(banner('MorseCode.wiki', 'dots, dashes and the people who love them', '#333'));
  const inp = h('textarea', { rows: 3, style: { width: '100%', fontFamily: 'Courier New, monospace' }, placeholder: 'Paste dots and dashes: · – or . -   (letters separated by spaces, words by /)' });
  const out = h('div', { style: { fontFamily: 'Courier New, monospace', fontSize: '18px', background: '#fff', border: '1px solid #999', padding: '6px', minHeight: '30px' } });
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  inp.addEventListener('input', () => {
    const s = inp.value.replace(/[·•]/g, '.').replace(/[–—−_]/g, '-');
    out.textContent = s.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.trim().split(/\s+/).map((code) => REV[code] || (code ? '?' : '')).join('')).join(' ');
  });
  const rows = Object.entries(MORSE);
  put(wrap, h('h3', {}, 'Translator'), inp, out, h('h3', {}, 'Chart'),
    h('table', { border: 1, cellpadding: 2, style: { fontFamily: 'Courier New, monospace', background: '#fff' } },
      ...Array.from({ length: 12 }, (_, r) => h('tr', {}, ...[0, 12, 24].map((o) => rows[r + o] ? [h('td', {}, h('b', {}, rows[r + o][0])), h('td', {}, rows[r + o][1].replace(/\./g, '·').replace(/-/g, '–'))] : [h('td'), h('td')]).flat()))));
  return { title: 'MorseCode.wiki', el: wrap };
}

// ---------------- DTP ----------------
function dtpPage(c) {
  const comp = c.comp;
  const wrap = frame('', '#f0f0e8');
  wrap.appendChild(banner('DEPARTMENT OF TERRESTRIAL PURITY', 'Keeping Earth Earthly Since 1951', '#3a4a2a', '#ffd040', 'Georgia, serif'));
  const sel = h('select', {}, ...['grey (classic)', 'tentacled', 'gaseous', 'my neighbour (just a feeling)', 'a cat (seems too clever)'].map((o) => h('option', {}, o)));
  put(wrap, 
    h('h3', {}, 'MOST WANTED'),
    h('table', { border: 1, cellpadding: 4, style: { background: '#fff', fontSize: '12px' } },
      h('tr', {}, h('td', {}, h('b', {}, '"GARY"')), h('td', {}, 'Non-terrestrial. 2.1 m. Cardigan.'), h('td', { style: { color: '#060' } }, 'IN CUSTODY')),
      h('tr', {}, h('td', {}, h('b', {}, 'MR. TOFU')), h('td', {}, 'Cat. Orange. Escaped Facility 9 (twice).'), h('td', { style: { color: '#b00' } }, 'DO NOT APPROACH. DO NOT MAKE EYE CONTACT.')),
      h('tr', {}, h('td', {}, h('b', {}, 'THE BOARD')), h('td', {}, 'Unknown.'), h('td', {}, '[REDACTED]'))),
    h('h3', {}, 'Report an alien'), h('p', {}, 'Type: ', sel, ' ', h('button', { onclick: () => comp.os.dialog({ title: 'DTP', icon: 'warn', text: `Thank you for your report (${sel.value}).<br><br>Your IP address has been noted. So has your floor.` }) }, 'Submit report')),
    h('p', { style: { fontSize: '10px', color: '#777' } }, 'This website is for your safety. So is the drone.'));
  return { title: 'DTP — Official Site', el: wrap };
}

// ---------------- whoisawake ----------------
function awakePage(c) {
  const g = c.game, d = day(g), born = !!g.state?.baby?.born;
  const lines = [
    'hello, Sunny.',
    `it is ${fmtClock(g.state?.clock ?? 0)}. you are on the fourteenth floor.`,
    born ? `${babyName(g)} is awake.` : 'something in you is awake.',
    d >= 3 ? 'the man in the wall is awake. he says hi.' : 'the cat is not here. the cat is busy.',
    d >= 4 ? 'someone is listening to your phone. they have a pen.' : 'the noodles are on the high shelf.',
    d >= 5 ? 'they are on the stairs.' : 'go to sleep soon.',
  ];
  const el = h('div', { style: { minHeight: '100%', background: '#000', color: '#ddd', fontFamily: 'Courier New, monospace', padding: '30px', fontSize: '15px', lineHeight: 2 } },
    ...lines.map((l, i) => h('div', { style: { opacity: 0, animation: `d98fadein 1s ${i * 1.2}s forwards` } }, l)));
  return { title: 'who is awake', el };
}

export function isFake(host) { return !!SITES[host]; }
export { HEADLINES };
