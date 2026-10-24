// Inbox: an Outlook Express-style mail client. Messages arrive with the days.
import { G, emit } from '../../core/globals.js';
import { C } from '../ui.js';
import { icon } from '../icons.js';
import { drawText, textWidth, wrap, LINE_H } from '../font.js';
import { MAIL, mailFor } from '../content/mail.js';
import { IMAGES } from './images.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);

export class MailApp {
  constructor(os) {
    this.os = os; this.needsNet = false;
    this.msgs = []; this.sel = { sel: 0 }; this.read = new Set();
    this.folder = { sel: 0 };
    this.prev = { scroll: 0 };
    this.day = 0;
    this.lastCheck = -1;
  }
  title() { const n = this.msgs.filter((m) => !this.read.has(m)).length; return 'Inbox' + (n ? ` (${n})` : '') + ' - Mail'; }
  menu() { return [{ label: 'File', items: [{ label: 'Close', action: () => this.os.close(this.os.windows.find((w) => w.app === 'mail')) }] }, { label: 'Edit', items: [{ label: 'Mark All as Read', action: () => this.msgs.forEach((m) => this.read.add(m)) }] }, { label: 'Tools', items: [{ label: 'Send and Receive', action: () => this.sendRecv() }] }, { label: 'Help', items: [{ label: 'About', action: () => this.os.msg({ title: 'About Mail', text: 'Mail 5.0', icon: 'inbox', buttons: ['OK'] }) }] }]; }
  onOpen() { this.sendRecv(true); }
  sendRecv(quiet) {
    const day = G.story.day;
    if (!this.os.connected) { if (!quiet) this.os.msg({ title: 'Mail', text: 'Unable to connect to the server. Your computer is not connected to the Internet.', icon: 'error', buttons: ['OK'] }); return; }
    let got = 0;
    if (this.mailDay !== day) { this.mailDay = day; this.today = mailFor(day); }
    for (const m of this.today) if (!this.msgs.includes(m)) { this.msgs.unshift(m); got++; }
    if (day >= 7 && got) for (let i = 0; i < 30; i++) this.msgs.unshift(MAIL[7][0]);
    if (got) { sfx('notify', { vol: 0.5, bus: 'ui', pos: G.desk && G.desk.speakerPos }); emit('mailReceived', got); }
  }
  update() {
    // a new morning: the inbox is as it was the first time
    if (this.day !== G.story.day) { this.day = G.story.day; this.msgs = []; this.read = new Set(); this.sel.sel = 0; this.lastCheck = -1; }
    if (this.os.connected && this.lastCheck !== G.story.day) { this.lastCheck = G.story.day; this.sendRecv(true); }
  }
  draw(ui, x, y, w, h) {
    const ctx = ui.ctx;
    ui.fill(x, y, w, h, C.face);
    const tb = [['New Mail', 'newmail'], ['Reply', 'reply'], ['Forward', 'reply'], null, ['Delete', 'del'], ['Send/Recv', 'sendrecv'], null, ['Addresses', 'user']];
    let bx = x + 2;
    for (const b of tb) {
      if (!b) { ui.vline(bx + 2, y + 4, 36, C.shadow); ui.vline(bx + 3, y + 4, 36, C.hi); bx += 7; continue; }
      if (ui.toolButton('ml_' + b[0], bx, y + 2, 58, 40, b[0], icon(b[1], 16))) {
        if (b[0] === 'Send/Recv') this.sendRecv();
        else if (b[0] === 'Delete') { const m = this.msgs[this.sel.sel]; if (m) { this.msgs.splice(this.sel.sel, 1); this.sel.sel = Math.max(0, this.sel.sel - 1); sfx('click', { vol: 0.2, bus: 'ui' }); } }
        else this.os.msg({ title: 'Mail', text: G.story.day >= 4 ? 'Nobody can hear you.' : 'Your outgoing mail server is busy. Please try again later.', icon: 'warn', buttons: ['OK'] });
      }
      bx += 59;
    }
    const top = y + 46;
    ui.bevel(x, top - 2, w, 2, 'groove', null);
    // folders
    const fw = 130;
    ui.bevel(x, top, fw, h - (top - y) - 20, 'sunken', '#fff');
    const folders = ['Inbox', 'Outbox', 'Sent Items', 'Deleted Items', 'Drafts'];
    folders.forEach((f, i) => {
      const fy = top + 6 + i * 18;
      const st = ui.clickable('mf' + i, x + 4, fy, fw - 8, 16);
      if (st.clicked) this.folder.sel = i;
      ctx.drawImage(icon(i === 0 ? 'inbox' : 'folder', 16), x + 8, fy);
      const lbl = f + (i === 0 && this.msgs.some((m) => !this.read.has(m)) ? ` (${this.msgs.filter((m) => !this.read.has(m)).length})` : '');
      if (this.folder.sel === i) ui.fill(x + 26, fy, textWidth(lbl, i === 0) + 4, 15, C.sel);
      ui.text(lbl, x + 28, fy + 2, this.folder.sel === i ? '#fff' : '#000', { bold: i === 0 && this.msgs.some((m) => !this.read.has(m)) });
    });
    // message list
    const lx = x + fw + 4, lw = w - fw - 4, lh = 120;
    ui.bevel(lx, top, lw, 18, 'raised');
    ui.text('From', lx + 24, top + 3, '#000'); ui.text('Subject', lx + 170, top + 3, '#000'); ui.text('Received', lx + lw - 80, top + 3, '#000');
    const list = this.folder.sel === 0 ? this.msgs : [];
    const res = ui.list('ml_list', lx, top + 18, lw, lh, list, this.sel, {
      draw: (m, rx, ry, rw, rh, sel) => {
        const unread = !this.read.has(m);
        const col = sel ? '#fff' : '#000';
        ctx.drawImage(icon(unread ? 'newmail' : 'inbox', 16), rx + 2, ry);
        if (m.attach) ui.text('@', rx + 18, ry + 2, col);
        ui.text(m.from, rx + 22, ry + 2, col, { bold: unread, maxW: 140 });
        ui.text(m.subject, rx + 168, ry + 2, col, { bold: unread, maxW: rw - 260 });
        ui.text(m.time, rx + rw - 78, ry + 2, col, { bold: unread });
      },
    });
    if (res) { sfx('click', { vol: 0.15, bus: 'ui' }); this.prev.scroll = 0; }
    // preview pane
    const py = top + 18 + lh + 4, ph = h - (py - y) - 20;
    const m = list[this.sel.sel];
    ui.bevel(lx, py, lw, ph, 'sunken', '#fff');
    if (m) {
      if (!this.read.has(m)) { this.read.add(m); emit('mailRead', m); }
      ui.fill(lx + 2, py + 2, lw - 4, 38, '#e8e8e8');
      ui.text('From: ', lx + 8, py + 6, '#606060'); ui.text(m.from, lx + 44, py + 6, '#000', { bold: true });
      ui.text('Subject: ', lx + 8, py + 22, '#606060'); ui.text(m.subject, lx + 60, py + 22, '#000');
      ui.clip(lx + 2, py + 42, lw - 20, ph - 44);
      const lines = wrap(m.body, lw - 40);
      let yy = py + 48 - this.prev.scroll;
      for (const l of lines) { ui.text(l, lx + 10, yy, m.from === 'FACILITY' ? '#800000' : '#000'); yy += LINE_H; }
      if (m.attach) {
        yy += 6;
        const img = IMAGES[m.attach](200, 150);
        ui.text('Attachment: ' + (m.attach === 'photoBed' ? 'IMG_0004.JPG' : 'SCAN_0419.BMP'), lx + 10, yy, '#000080'); yy += 16;
        ctx.drawImage(img, lx + 10, yy, 200, 150); yy += 156;
        if (m.attach === 'photoBed' && !this.sawPhoto) { this.sawPhoto = true; emit('sawPhoto'); }
      }
      ui.unclip();
      const ss = { scroll: this.prev.scroll, max: yy + this.prev.scroll - py, page: ph - 44, drag: this.prev.drag };
      ui.vscroll('ml_ps', lx + lw - 18, py + 42, ph - 44, ss);
      this.prev.scroll = ss.scroll; this.prev.drag = ss.drag;
    } else ui.text(this.os.connected || this.msgs.length ? 'There are no messages in this folder.' : 'Connect to the Internet to receive mail.', lx + 10, py + 10, '#808080');
    const sy = y + h - 19;
    ui.bevel(x, sy, w, 18, 'thin');
    ui.text(`${list.length} message(s), ${list.filter((q) => !this.read.has(q)).length} unread`, x + 4, sy + 3);
    ui.text(this.os.connected ? 'Working Online' : 'Working Offline', x + w - 110, sy + 3);
  }
}
