// My Computer: an explorer window with the Web View side panel, drives,
// folders and files that appear (and change) as the week goes on.
import { G, emit } from '../../core/globals.js';
import { C } from '../ui.js';
import { icon } from '../icons.js';
import { textWidth, wrap, LINE_H } from '../font.js';
import { IMAGES } from './images.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

function tree() {
  const day = G.story.day;
  const docs = [
    { name: 'resume.doc', type: 'doc', size: '24 KB', text: 'ALEX BENGRIM\nJersey City, NJ\n\nEXPERIENCE\nBlueberry Pie Online - Technical Support Agent (1997 - present)\n\nSKILLS\nPatience. Typing (55 wpm). Glass 95/98, dial-up networking, modems.' },
    { name: 'mom_bday.bmp', type: 'image', size: '310 KB', img: 'ufoPhoto', note: 'Mom\'s 60th birthday (photo did not develop)' },
    { name: 'journal.txt', type: 'doc', size: '2 KB', text: journal(day) },
  ];
  if (day >= 3) docs.push({ name: 'DONT_OPEN.TXT', type: 'doc', size: '1 KB', text: 'i told you not to open it\n\nthe window. not this file.' });
  if (day >= 5) docs.push({ name: 'ULTRASOUND.BMP', type: 'image', size: '???', img: 'ultrasound', note: 'scan_0419' });
  if (day >= 6) docs.push({ name: 'BIRTH_CERT.DOC', type: 'doc', size: '0 KB', text: 'NAME: ________\nDATE OF BIRTH: 07/07/1999\nMOTHER/HOST: SUBJECT 0419\nFATHER: N/A' });
  const C_ = { name: '(C:)', type: 'drive', children: [
    { name: 'My Documents', type: 'folder', children: docs },
    { name: 'Program Files', type: 'folder', children: [{ name: 'Blueberry Support', type: 'folder', children: [{ name: 'bpsupport.exe', type: 'program', size: '1.2 MB' }, { name: 'manual.hlp', type: 'doc', size: '340 KB', text: 'Use the Knowledge Base tab inside Blueberry Support.' }] }, { name: 'Internet Voyager', type: 'folder', children: [{ name: 'voyager.exe', type: 'program', size: '2.0 MB' }] }] },
    { name: 'Glass', type: 'folder', children: [{ name: 'System', type: 'folder', children: [] }, { name: 'win.ini', type: 'doc', size: '4 KB', text: '[windows]\nload=\nrun=\nNullPort=None\n\n[Desktop]\nWallpaper=(None)' }] },
    ...(day >= 4 ? [{ name: 'SUBJECT', type: 'folder', children: [{ name: 'vitals.log', type: 'doc', size: '\u221e', text: Array.from({ length: day * 6 }, (_, i) => `07/0${Math.min(day, 7)}/99 0${i % 10}:12  HOST 9${i % 10} BPM  FETAL 1${40 + i} BPM`).join('\n') }] }] : []),
  ] };
  return [
    { name: '3\u00bd Floppy (A:)', type: 'floppy', empty: true },
    C_,
    { name: '(D:)', type: 'cd', empty: true },
    { name: 'Control Panel', type: 'control', locked: true },
    { name: 'Printers', type: 'printer', locked: true },
    { name: 'Dial-Up Networking', type: 'dialup', action: 'dialup' },
    ...(day >= 6 ? [{ name: '(B:) BABY', type: 'drive', children: [{ name: 'it is warm in here', type: 'doc', size: '1 KB', text: 'it is warm in here\nit is warm in here\nit is warm in here' }] }] : []),
  ];
}

function journal(day) {
  const e = ['July 1. Weird dream about the sky on fire. Woke up on the floor. Mochi licked my face.'];
  if (day >= 2) e.push('July 2. Took out the trash. 4A is empty?? I heard their TV last night.');
  if (day >= 3) e.push('July 3. So hungry. Something moved in my stomach. Not gas. MOVED.');
  if (day >= 4) e.push('July 4. Coughed blood into the sink. My reflection was late.');
  if (day >= 5) e.push('July 5. Mochi hisses at me. I don\'t blame her.');
  if (day >= 6) e.push('July 6. I looked at Mochi and I saw meat. I hate myself.');
  if (day >= 7) e.push('July 7. I don\'t remember writing any of this.');
  return e.join('\n\n');
}

export class MyComputerApp {
  constructor(os) { this.os = os; this.path = []; this.sel = -1; }
  title() { return this.path.length ? this.path[this.path.length - 1].name : (G.story.day >= 6 ? 'My Body' : 'My Computer'); }
  menu() { return [{ label: 'File', items: [{ label: 'Close', action: () => this.os.close(this.os.windows.find((w) => w.app === 'computer')) }] }, { label: 'View', items: [{ label: 'Up One Level', action: () => this.up() }] }, { label: 'Help', items: [{ label: 'About', action: () => this.os.msg({ title: 'About Glass', text: 'Glass 98\nPhysical memory: 65,536 KB\n' + (G.story.day >= 5 ? 'Occupants: 2' : 'Registered to: Alex Bengrim'), icon: 'computer', buttons: ['OK'] }) }] }]; }
  items() { let list = tree(); for (const p of this.path) { const f = list.find((x) => x.name === p.name); list = f && f.children ? f.children : []; } return list; }
  up() { this.path.pop(); this.sel = -1; }
  openItem(it) {
    if (it.children) { this.path.push(it); this.sel = -1; sfx('click', { vol: 0.2, bus: 'ui' }); return; }
    if (it.empty) { this.os.msg({ title: it.name, text: `${it.name.includes('A:') ? 'A:\\' : 'D:\\'} is not accessible.\n\nThe device is not ready.`, icon: 'error', buttons: ['Retry', 'Cancel'] }); return; }
    if (it.locked) { this.os.msg({ title: it.name, text: 'You do not have permission to open this item.', icon: 'warn', buttons: ['OK'] }); return; }
    if (it.action === 'dialup') { this.os.openDialup(null); return; }
    if (it.type === 'program') { this.os.msg({ title: it.name, text: 'This program is already running.', icon: 'info', buttons: ['OK'] }); return; }
    if (it.type === 'doc' || it.type === 'image') { this.sel = this.items().indexOf(it); emit('fileOpen', it.name); }
  }
  draw(ui, x, y, w, h) {
    const ctx = ui.ctx;
    ui.fill(x, y, w, h, C.face);
    // toolbar
    if (ui.toolButton('mc_back', x + 2, y + 2, 50, 40, 'Back', icon('back', 16), { disabled: !this.path.length })) this.up();
    if (ui.toolButton('mc_up', x + 54, y + 2, 50, 40, 'Up', icon('folder', 16), { disabled: !this.path.length })) this.up();
    const ay = y + 46;
    ui.bevel(x, ay - 2, w, 2, 'groove', null);
    ui.text('Address', x + 4, ay + 4);
    const addr = this.path.length ? 'C:\\' + this.path.slice(1).map((p) => p.name).join('\\') : (G.story.day >= 6 ? 'My Body' : 'My Computer');
    ui.field('mc_addr', x + 50, ay, w - 54, 21, { value: this.path.length === 1 ? 'C:\\' : addr }, { readOnly: true });
    // web view panel
    const py = ay + 26, ph = h - (py - y) - 20;
    ui.bevel(x, py, w, ph, 'sunken', '#fff');
    const pw = 170;
    const g = ctx.createLinearGradient(x + 2, 0, x + 2 + pw, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8f0ff');
    ctx.fillStyle = g; ctx.fillRect(x + 2, py + 2, pw, ph - 4);
    const cur = this.path.length ? this.path[this.path.length - 1] : { name: G.story.day >= 6 ? 'My Body' : 'My Computer', type: 'computer' };
    ctx.drawImage(icon(cur.type === 'drive' ? 'drive' : cur.type === 'folder' ? 'folder' : 'computer', 32), x + 10, py + 10);
    const tl = wrap(cur.name, pw - 20, true);
    tl.forEach((l, i) => ui.text(l, x + 10, py + 48 + i * 14, '#000', { bold: true }));
    let iy = py + 52 + tl.length * 14;
    ctx.fillStyle = '#4060c0'; ctx.fillRect(x + 10, iy, pw - 20, 2); iy += 10;
    const items = this.items();
    const s = items[this.sel];
    if (s) {
      ui.text(s.name, x + 10, iy, '#000', { bold: true, maxW: pw - 16 }); iy += 14;
      ui.text((s.type === 'doc' ? 'Text Document' : s.type === 'image' ? 'Bitmap Image' : s.type) + (s.size ? '  ' + s.size : ''), x + 10, iy, '#404040'); iy += 18;
      if (s.text) { ui.clip(x + 4, iy, pw - 8, ph - (iy - py) - 6); wrap(s.text, pw - 20).forEach((l, i) => ui.text(l, x + 10, iy + i * LINE_H, s.name.includes('vitals') || s.name.includes('BABY') ? '#800000' : '#000')); ui.unclip(); }
      if (s.img) { const im = IMAGES[s.img](pw - 20, Math.floor((pw - 20) * 0.75)); ctx.drawImage(im, x + 10, iy); iy += im.height + 4; if (s.note) ui.text(s.note, x + 10, iy, '#404040', { maxW: pw - 20 }); if (s.img === 'ultrasound' && !this.sawUS) { this.sawUS = true; emit('sawUltrasound'); } }
    } else {
      const lines = wrap(this.path.length ? 'Select an item to view its description.' : 'Displays the contents of your computer.' + (G.story.day >= 5 ? ' Displays the contents of you.' : ''), pw - 20);
      lines.forEach((l, i) => ui.text(l, x + 10, iy + i * LINE_H, '#000'));
    }
    // icon grid
    const gx = x + pw + 10, gw = w - pw - 16;
    const cols = Math.max(1, Math.floor(gw / 80));
    items.forEach((it, i) => {
      const cx = gx + (i % cols) * 80, cy = py + 8 + Math.floor(i / cols) * 70;
      const st = ui.clickable('mc_it' + i + it.name, cx, cy, 76, 64);
      if (st.clicked) { this.sel = i; if (st.dbl) this.openItem(it); }
      const ic = it.type === 'doc' ? 'doc' : it.type === 'image' ? 'image' : it.type;
      ctx.drawImage(icon(ic, 32), cx + 22, cy + 2);
      const lines = wrap(it.name, 74);
      lines.slice(0, 2).forEach((l, k) => {
        const tw = textWidth(l), lx = cx + 38 - Math.floor(tw / 2);
        if (this.sel === i) ui.fill(lx - 1, cy + 37 + k * 12, tw + 2, 12, C.sel);
        ui.text(l, lx, cy + 37 + k * 12, this.sel === i ? '#fff' : '#000');
      });
    });
    const sy = y + h - 19;
    ui.bevel(x, sy, w, 18, 'thin');
    ui.text(`${items.length} object(s)`, x + 4, sy + 3);
  }
}
