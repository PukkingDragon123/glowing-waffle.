// Pixel-art icons for the desktop, explorer, toolbars and dialogs.
// Painted in a 32-unit space and rasterised at 32 or 16 pixels.
const cache = new Map();

function painter(size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const s = size / 32;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; const x0 = Math.round(x * s), y0 = Math.round(y * s); ctx.fillRect(x0, y0, Math.max(1, Math.round((x + w) * s) - x0), Math.max(1, Math.round((y + h) * s) - y0)); };
  const O = (x, y, w, h, c, fill) => { if (fill) R(x, y, w, h, fill); R(x, y, w, 1, c); R(x, y + h - 1, w, 1, c); R(x, y, 1, h, c); R(x + w - 1, y, 1, h, c); };
  const D = (x, y, r, c) => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) R(x + xx, y + yy, 1, 1, c); };
  return { cv, ctx, R, O, D, s };
}

const DRAW = {
  computer(p) {
    const { R, O } = p;
    O(4, 3, 22, 18, '#000', '#c8c0a8'); R(5, 4, 20, 1, '#fff'); R(5, 4, 1, 16, '#fff');
    O(7, 6, 16, 11, '#404040', '#000080'); R(8, 7, 14, 9, '#0088cc'); R(9, 8, 6, 2, '#bfe8ff');
    R(12, 21, 6, 2, '#808080'); O(7, 23, 16, 3, '#000', '#c8c0a8');
    O(2, 27, 26, 4, '#000', '#d8d0b8'); for (let i = 0; i < 6; i++) R(4 + i * 4, 28, 3, 1, '#808080');
    R(24, 15, 2, 1, '#00c000');
  },
  support(p) {
    const { R, O, D } = p;
    // blueberry pie with a headset
    D(16, 20, 11, '#6a3a12'); D(16, 19, 10, '#c89050'); D(16, 18, 9, '#d8a868');
    for (const [x, y] of [[11, 15], [15, 13], [20, 15], [13, 19], [18, 19], [22, 20], [10, 21], [16, 23]]) { D(x, y, 2, '#2a2a7a'); R(x - 1, y - 1, 1, 1, '#7a7ad8'); }
    R(5, 6, 22, 2, '#202020'); R(4, 7, 2, 9, '#202020'); R(26, 7, 2, 9, '#202020');
    O(2, 12, 5, 7, '#000', '#505050'); O(25, 12, 5, 7, '#000', '#505050');
    R(27, 19, 1, 6, '#202020'); R(22, 25, 6, 1, '#202020'); D(21, 25, 2, '#000');
  },
  browser(p) {
    const { R, D } = p;
    D(16, 16, 12, '#1a50b8'); D(16, 16, 11, '#3a7ae8');
    for (const [x, y, r] of [[12, 11, 4], [19, 13, 3], [11, 19, 3], [20, 21, 4], [15, 16, 2]]) D(x, y, r, '#2a9a3a');
    D(11, 9, 2, '#a8d8ff');
    // orbit ring
    for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2; const x = 16 + Math.cos(t) * 15, y = 16 + Math.sin(t) * 5 - Math.cos(t) * 3; R(Math.round(x), Math.round(y), 1, 1, a > 20 && a < 44 ? '#e8c020' : '#ffe060'); }
  },
  inbox(p) {
    const { R, O } = p;
    O(3, 14, 26, 14, '#000', '#e8c878'); R(4, 15, 24, 2, '#f8e8a8');
    O(6, 5, 20, 13, '#404040', '#ffffff');
    for (let i = 0; i < 9; i++) { R(6 + i, 5 + Math.floor(i * 0.75), 1, 1, '#808080'); R(25 - i, 5 + Math.floor(i * 0.75), 1, 1, '#808080'); }
    R(8, 12, 16, 1, '#c0c0c0'); R(8, 14, 12, 1, '#c0c0c0');
    R(3, 21, 26, 1, '#a08040'); R(12, 21, 8, 3, '#a08040');
  },
  folder(p) {
    const { R, O } = p;
    O(2, 7, 12, 4, '#806000', '#f8d860'); O(2, 9, 28, 19, '#806000', '#f8d860'); R(3, 10, 26, 2, '#fff8b0'); R(3, 26, 26, 1, '#c09820');
  },
  drive(p) {
    const { R, O } = p;
    O(2, 12, 28, 12, '#000', '#c0c0c0'); R(3, 13, 26, 1, '#fff'); R(3, 22, 26, 1, '#808080'); R(5, 17, 12, 2, '#404040'); R(24, 17, 3, 2, '#00e000');
  },
  floppy(p) {
    const { R, O } = p;
    O(5, 4, 22, 24, '#000', '#303030'); O(9, 4, 14, 9, '#000', '#c0c0c0'); R(18, 5, 3, 6, '#404040'); O(8, 17, 16, 10, '#000', '#e8e8e8'); R(10, 19, 12, 1, '#a0a0ff');
  },
  cd(p) {
    const { D, R } = p;
    D(16, 16, 12, '#808080'); D(16, 16, 11, '#e0e0e8'); D(16, 16, 7, '#c8d8f0'); D(16, 16, 3, '#808080'); D(16, 16, 2, '#ffffff');
    R(9, 8, 4, 2, '#ffd0ff'); R(20, 22, 4, 2, '#d0ffd0');
  },
  doc(p) {
    const { R, O } = p;
    O(6, 2, 18, 27, '#000', '#ffffff'); R(18, 2, 6, 6, '#c0c0c0'); R(18, 2, 1, 6, '#000'); R(18, 7, 6, 1, '#000');
    for (let i = 0; i < 7; i++) R(9, 10 + i * 2.6, 12 - (i % 3) * 2, 1, '#000080');
  },
  image(p) {
    const { R, O, D } = p;
    O(3, 5, 26, 22, '#000', '#ffffff'); R(5, 7, 22, 18, '#80c0ff'); R(5, 18, 22, 7, '#40a040'); D(22, 11, 3, '#ffff40'); R(8, 14, 6, 4, '#a06040');
  },
  program(p) { const { R, O } = p; O(3, 6, 26, 20, '#000', '#c0c0c0'); R(4, 7, 24, 4, '#000080'); R(24, 8, 3, 2, '#c0c0c0'); R(6, 14, 20, 9, '#ffffff'); },
  control(p) { const { R, O, D } = p; DRAW.folder(p); D(12, 20, 4, '#c00000'); R(18, 15, 8, 8, '#0000c0'); R(20, 17, 4, 4, '#ffff00'); },
  printer(p) { const { R, O } = p; O(8, 3, 16, 10, '#000', '#ffffff'); O(3, 12, 26, 12, '#000', '#c0c0c0'); R(5, 14, 4, 2, '#00c000'); O(7, 20, 18, 9, '#000', '#ffffff'); },
  dialup(p) {
    const { R, O } = p;
    O(2, 6, 12, 10, '#000', '#c0c0c0'); R(4, 8, 8, 6, '#000080'); R(6, 16, 4, 3, '#808080');
    O(18, 13, 12, 10, '#000', '#c0c0c0'); R(20, 15, 8, 6, '#000080'); R(22, 23, 4, 3, '#808080');
    for (let i = 0; i < 6; i++) R(13 + i, 18 - i, 1, 1, '#ffff00');
  },
  warn(p) { const { R } = p; for (let y = 0; y < 26; y++) { const w = Math.floor(y * 1.1) + 1; R(16 - w / 2, 3 + y, w, 1, '#000'); if (y > 1) R(16 - w / 2 + 1, 3 + y, Math.max(0, w - 2), 1, '#ffff00'); } R(15, 11, 2, 10, '#000'); R(15, 23, 2, 2, '#000'); },
  error(p) { const { D, R } = p; D(16, 16, 13, '#800000'); D(16, 16, 12, '#ff0000'); for (let i = -5; i <= 5; i++) { R(16 + i, 16 + i, 2, 2, '#fff'); R(16 + i, 16 - i, 2, 2, '#fff'); } },
  info(p) { const { D, R } = p; D(16, 16, 13, '#000080'); D(16, 16, 12, '#ffffff'); R(15, 8, 3, 3, '#0000c0'); R(14, 13, 4, 11, '#0000c0'); R(13, 23, 6, 2, '#0000c0'); },
  question(p) { const { D, R } = p; D(16, 16, 13, '#000080'); D(16, 16, 12, '#ffffff'); R(12, 8, 8, 2, '#0000c0'); R(19, 9, 2, 6, '#0000c0'); R(15, 15, 4, 2, '#0000c0'); R(15, 17, 2, 3, '#0000c0'); R(15, 22, 2, 2, '#0000c0'); },
  eye(p) { const { D, R } = p; D(16, 16, 13, '#600000'); D(16, 16, 11, '#e8e0d0'); D(16, 16, 6, '#802020'); D(16, 16, 3, '#000'); R(13, 12, 2, 2, '#fff'); },
  logo(p) {
    const { R } = p; // generic four-pane window logo for the Start button
    const c = ['#e83020', '#20a020', '#2050e0', '#f0c000'];
    R(4, 5, 11, 10, c[0]); R(17, 4, 11, 10, c[1]); R(4, 17, 11, 10, c[2]); R(17, 16, 11, 10, c[3]);
  },
  speaker(p) { const { R } = p; R(6, 12, 6, 8, '#000'); for (let i = 0; i < 8; i++) R(12 + i, 12 - i, 1, 8 + i * 2, '#000'); R(24, 10, 2, 12, '#808080'); },
  back(p) { const { R } = p; for (let i = 0; i < 10; i++) R(6 + i, 16 - i, 1, i * 2 + 1, '#20a020'); R(16, 12, 12, 9, '#20a020'); R(16, 12, 12, 1, '#80ff80'); },
  forward(p) { const { R } = p; for (let i = 0; i < 10; i++) R(26 - i, 16 - i, 1, i * 2 + 1, '#20a020'); R(4, 12, 12, 9, '#20a020'); R(4, 12, 12, 1, '#80ff80'); },
  stop(p) { const { D, R } = p; D(16, 16, 12, '#800000'); D(16, 16, 11, '#e82020'); for (let i = -4; i <= 4; i++) { R(16 + i, 16 + i, 2, 2, '#fff'); R(16 + i, 16 - i, 2, 2, '#fff'); } },
  refresh(p) { const { R } = p; for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 1.7 + 0.6; R(16 + Math.cos(t) * 10, 16 + Math.sin(t) * 10, 3, 3, '#20a020'); } R(22, 4, 6, 6, '#20a020'); },
  home(p) { const { R } = p; for (let i = 0; i < 12; i++) R(16 - i, 4 + i, i * 2 + 1, 1, '#c02020'); R(7, 16, 18, 13, '#f0e0a0'); R(13, 20, 6, 9, '#804020'); R(8, 17, 4, 4, '#80c0ff'); },
  search(p) { const { D, R } = p; D(13, 13, 9, '#404040'); D(13, 13, 7, '#c0e0ff'); for (let i = 0; i < 9; i++) R(19 + i, 19 + i, 3, 3, '#804020'); },
  fav(p) { const { R } = p; const pts = [[16, 3], [20, 12], [29, 12], [22, 18], [25, 28], [16, 22], [7, 28], [10, 18], [3, 12], [12, 12]]; for (let y = 3; y < 29; y++) for (let x = 3; x < 30; x++) { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } if (ins) R(x, y, 1, 1, '#f0c000'); } },
  history(p) { const { D, R } = p; D(16, 16, 12, '#404040'); D(16, 16, 11, '#ffffff'); R(15, 7, 2, 10, '#000'); R(15, 15, 8, 2, '#000'); },
  mail(p) { DRAW.inbox(p); },
  print(p) { DRAW.printer(p); },
  newmail(p) { const { R, O } = p; O(3, 8, 26, 17, '#000', '#ffffff'); for (let i = 0; i < 13; i++) { R(3 + i, 8 + i * 0.7, 1, 1, '#000'); R(28 - i, 8 + i * 0.7, 1, 1, '#000'); } R(20, 2, 2, 10, '#c00000'); R(16, 6, 10, 2, '#c00000'); },
  reply(p) { const { R } = p; DRAW.newmail(p); for (let i = 0; i < 6; i++) R(2 + i, 26 - i, 1, i * 2 + 1, '#2050e0'); },
  del(p) { const { R } = p; for (let i = -7; i <= 7; i++) { R(16 + i, 16 + i, 3, 3, '#000'); R(16 + i, 16 - i, 3, 3, '#000'); } },
  sendrecv(p) { const { R, O } = p; O(3, 10, 26, 16, '#000', '#ffffff'); R(10, 4, 3, 10, '#20a020'); R(19, 18, 3, 10, '#c02020'); },
  answer(p) { const { R, O } = p; O(5, 10, 22, 8, '#000', '#20a020'); R(3, 12, 6, 10, '#20a020'); R(23, 12, 6, 10, '#20a020'); R(9, 20, 14, 8, '#202020'); },
  hangup(p) { const { R, O } = p; O(5, 14, 22, 8, '#000', '#c02020'); R(3, 18, 6, 8, '#c02020'); R(23, 18, 6, 8, '#c02020'); },
  hold(p) { const { R } = p; R(9, 7, 5, 18, '#2050e0'); R(18, 7, 5, 18, '#2050e0'); },
  book(p) { const { R, O } = p; O(4, 4, 24, 24, '#000', '#2050a0'); R(7, 4, 2, 24, '#102850'); R(12, 9, 13, 2, '#ffffff'); R(12, 13, 10, 1, '#c0c0ff'); },
  tool(p) { const { R } = p; for (let i = 0; i < 16; i++) R(6 + i, 22 - i, 3, 3, '#606060'); R(20, 4, 8, 8, '#909090'); R(23, 4, 3, 4, '#c0c0c0'); },
  user(p) { const { D, R } = p; D(16, 11, 6, '#e0b090'); R(7, 19, 18, 10, '#2050a0'); D(16, 19, 4, '#2050a0'); },
};

export function icon(name, size = 32) {
  const key = name + size;
  if (cache.has(key)) return cache.get(key);
  const p = painter(size);
  (DRAW[name] || DRAW.program)(p);
  cache.set(key, p.cv);
  return p.cv;
}

// mouse cursors as small canvases with hotspots
const CURSORS = {
  arrow: [0, 0, [
    'X...........', 'XX..........', 'XWX.........', 'XWWX........', 'XWWWX.......', 'XWWWWX......', 'XWWWWWX.....', 'XWWWWWWX....', 'XWWWWWWWX...', 'XWWWWWWWWX..',
    'XWWWWWXXXXX.', 'XWWXWWX.....', 'XWX.XWWX....', 'XX..XWWX....', 'X....XWWX...', '.....XWWX...', '......XWWX..', '......XWWX..', '.......XX...']],
  hand: [5, 0, [
    '.....XX.........', '....XWWX........', '....XWWX........', '....XWWX........', '....XWWXXX......', '....XWWXWWXXX...', '....XWWXWWXWWXX.', 'XXX.XWWXWWXWWXWX', 'XWWXXWWWWWWWWXWX', 'XWWWXWWWWWWWWWWX',
    '.XWWWWWWWWWWWWWX', '..XWWWWWWWWWWWWX', '..XWWWWWWWWWWWX.', '...XWWWWWWWWWWX.', '...XWWWWWWWWWX..', '....XWWWWWWWWX..', '....XWWWWWWWWX..', '....XXXXXXXXXX..']],
  ibeam: [4, 8, ['XXX.XXX', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', '...X...', 'XXX.XXX']],
  wait: [7, 9, [
    'XXXXXXXXXXXXXXX', 'XWWWWWWWWWWWWWX', '.XWWWWWWWWWWWX.', '.XWXWXWXWXWXWX.', '.XWWXWXWXWXWWX.', '..XWWXWXWXWWX..', '...XWWXWXWWX...', '....XWWXWWX....', '.....XWWWX.....', '.....XWXWX.....', '....XWWWWWX....', '...XWWWXWWWX...', '..XWWWWWWWWWX..', '.XWWWWXWXWWWWX.', '.XWWWXWXWXWWWX.', '.XWWXWXWXWXWWX.', 'XWWWWWWWWWWWWWX', 'XXXXXXXXXXXXXXX']],
  appwait: [0, 0, [
    'X...........', 'XX..........', 'XWX.........', 'XWWX........', 'XWWWX.......', 'XWWWWX......', 'XWWWWWX.....', 'XWWWWWWX.XXXX', 'XWWWWWWWXWWWWX', 'XWWWWWXXXXWWX.',
    'XWWXWWX..XWX..', 'XWX.XWWX.XWX..', 'XX..XWWXXWWWX.', 'X....XWWXWWWWX', '.....XWWXXXXXX', '......XWWX....', '......XWWX....', '.......XX.....']],
};
export function cursorImage(name) {
  const key = 'cur' + name;
  if (cache.has(key)) return cache.get(key);
  const [hx, hy, rows] = CURSORS[name] || CURSORS.arrow;
  const cv = document.createElement('canvas'); cv.width = Math.max(...rows.map((r) => r.length)); cv.height = rows.length;
  const ctx = cv.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { if (r[x] === 'X') { ctx.fillStyle = '#000'; ctx.fillRect(x, y, 1, 1); } else if (r[x] === 'W') { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1, 1); } } });
  const out = { cv, hx, hy };
  cache.set(key, out);
  return out;
}
