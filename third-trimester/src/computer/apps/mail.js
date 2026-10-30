// Mailbox: store (survives window close) + the mail client window.
import { h, fmtClock, money } from '../dom.js';
import { icon } from '../icons.js';
import { MAILS } from '../content/mail.js';
import { ITEMS } from '../../game/items.js';

export class MailStore {
  constructor(comp) { this.comp = comp; this.items = []; this.delivered = new Set(); this.seq = 0; this.listeners = new Set(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(); }
  stamp() { const s = this.comp.game.state; return { day: s?.day ?? 1, clock: s?.clock ?? 480 }; }
  deliver(notify) {
    const g = this.comp.game, day = g.state?.day ?? 1, clock = g.state?.clock ?? 480;
    const fresh = [];
    for (const m of MAILS) {
      if (this.delivered.has(m.id) || m.day > day) continue;
      if (m.day === day && m.at && clock < m.at) continue;
      if (m.cond && !m.cond(g)) continue;
      this.delivered.add(m.id);
      const it = { id: m.id, from: m.from, addr: m.addr, subject: m.subject, body: m.body, replies: m.replies, read: false, folder: 'inbox', day: m.day, clock: m.day < day ? (m.at || 420) : Math.max(m.at || 0, clock) };
      this.items.push(it); fresh.push(it);
    }
    if (fresh.length) {
      this.changed();
      if (this.comp.isOpen) {
        this.comp.audio('os.receive', 0.5);
        if (notify || fresh.length) this.comp.os.notify('You have new mail', fresh.length === 1 ? `${fresh[0].from}: ${fresh[0].subject}` : `${fresh.length} new messages.`, () => this.comp.launch('mail'));
      }
    }
  }
  add(m) {
    const it = { id: 'g' + ++this.seq + '_' + Date.now(), read: false, folder: 'inbox', ...this.stamp(), ...m };
    this.items.push(it); this.changed();
    if (this.comp.isOpen) this.comp.audio('os.receive', 0.5);
    return it;
  }
  receipt(lines, total) {
    const st = this.stamp();
    this.add({ from: 'QuikMart Delivery', addr: 'orders@quikmart.shop', subject: `Order confirmed — arriving ~${fmtClock(st.clock + 30)}`, body:
`Thanks for your order!

${lines.map((l) => `  ${String(l.qty).padStart(2)} × ${ITEMS[l.id].name.padEnd(34)} ${money(ITEMS[l.id].price * l.qty)}`).join('\n')}
  ------------------------------------------------------
  TOTAL                                               ${money(total)}

Estimated arrival: about 30 minutes. We'll knock twice.
Room 1407 has been flagged as "a lot of noodles". This is not a judgement.

QuikMart — "Quick, Mart!"` });
  }
  unread() { return this.items.filter((m) => m.folder === 'inbox' && !m.read).length; }
  serialize() { return { items: this.items, delivered: [...this.delivered], seq: this.seq }; }
  deserialize(o) {
    if (!o) return;
    this.delivered = new Set(o.delivered || []); this.seq = o.seq || 0;
    // re-attach replies from content for static mail
    this.items = (o.items || []).map((m) => ({ ...m, replies: MAILS.find((x) => x.id === m.id)?.replies }));
    this.changed();
  }
}

export function registerMail(os, comp) {
  os.register('mail', { title: 'Mailbox', icon: 'mail', w: 600, h: 430, minW: 480, minH: 320, create: (win) => new MailView(win, comp) });
}

class MailView {
  constructor(win, comp) {
    this.win = win; this.comp = comp; this.store = comp.mail; this.folder = 'inbox'; this.sel = null;
    win.setMenus([
      { label: 'File', items: [{ label: 'Check for new mail', action: () => { this.store.deliver(true); this.render(); } }, { sep: true }, { label: 'Close', action: () => win.close() }] },
      { label: 'Message', items: () => [
        { label: 'Reply', action: () => this.reply(), disabled: !this.cur },
        { label: 'Delete', action: () => this.del(), disabled: !this.cur },
        { label: 'Mark as unread', action: () => { if (this.cur) { this.cur.read = false; this.render(); } }, disabled: !this.cur },
      ] },
    ]);
    this.tool = h('div', { class: 'd98-toolbar' },
      h('button', { class: 'd98-tool', onclick: () => { this.store.deliver(true); this.render(); } }, h('img', { src: icon('mail', 16) }), 'Get Mail'),
      h('button', { class: 'd98-tool', onclick: () => this.reply() }, '↩ Reply'),
      h('button', { class: 'd98-tool', onclick: () => this.del() }, '✕ Delete'));
    this.folders = h('div', { class: 'd98-list d98-mail-folders' });
    this.list = h('div', { class: 'd98-list d98-mail-list' });
    this.view = h('div', { class: 'd98-list d98-mail-view' });
    win.body.append(this.tool, h('div', { class: 'd98-mail' }, this.folders, this.list, this.view));
    this.off = this.store.on(() => this.render());
    this.render();
  }
  get cur() { return this.store.items.find((m) => m.id === this.sel); }
  onClose() { this.off?.(); }
  render() {
    const counts = { inbox: 0, sent: 0, trash: 0 };
    for (const m of this.store.items) if (m.folder === 'inbox' && !m.read) counts.inbox++;
    this.folders.innerHTML = '';
    for (const [id, label] of [['inbox', 'Inbox'], ['sent', 'Sent Items'], ['trash', 'Deleted Items']]) {
      this.folders.appendChild(h('div', { class: 'd98-li' + (this.folder === id ? ' sel' : ''), onclick: () => { this.folder = id; this.sel = null; this.render(); } },
        h('img', { src: icon(id === 'trash' ? 'bin_empty' : 'folder', 16) }), h('span', { style: { fontWeight: id === 'inbox' && counts.inbox ? 700 : 400 } }, label + (id === 'inbox' && counts.inbox ? ` (${counts.inbox})` : ''))));
    }
    const items = this.store.items.filter((m) => m.folder === this.folder).sort((a, b) => (b.day - a.day) || (b.clock - a.clock));
    this.list.innerHTML = '';
    this.list.appendChild(h('div', { class: 'd98-li', style: { background: '#c0c0c0', fontWeight: 700, position: 'sticky', top: 0 } }, h('span', {}, ''), h('span', {}, 'From'), h('span', {}, 'Subject'), h('span', {}, 'Received')));
    for (const m of items) {
      this.list.appendChild(h('div', { class: 'd98-li' + (m.read ? '' : ' unread') + (m.id === this.sel ? ' sel' : ''), onclick: () => { this.sel = m.id; if (!m.read) { m.read = true; } this.render(); } },
        h('span', { style: { color: m.read ? '#888' : '#0a246a' } }, m.read ? '✉' : '●'), h('span', {}, m.from), h('span', {}, m.subject), h('span', {}, `D${m.day} ${fmtClock(m.clock)}`)));
    }
    if (!items.length) this.list.appendChild(h('div', { class: 'd98-li', style: { color: '#777' } }, h('span'), h('span', {}, 'No messages.')));
    this.view.innerHTML = '';
    const m = this.cur;
    if (m) {
      this.view.append(
        h('div', { class: 'd98-mail-head' }, h('div', {}, h('b', {}, 'From: '), `${m.from} <${m.addr}>`), h('div', {}, h('b', {}, 'Subject: '), m.subject), h('div', {}, h('b', {}, 'Received: '), `Day ${m.day}, ${fmtClock(m.clock)}`)),
        h('div', { class: 'd98-mail-body' }, m.body));
    } else this.view.appendChild(h('div', { style: { padding: '20px', color: '#777', textAlign: 'center' } }, 'Select a message to read it.'));
  }
  async reply() {
    const m = this.cur; if (!m || m.folder === 'sent') return;
    const opts = [...(m.replies || []), 'Thanks!', 'Please remove me from this list.'].slice(0, 4);
    const r = await this.comp.os.dialog({ title: `Re: ${m.subject}`, icon: 'mail', text: `<b>Reply to ${m.from}:</b><br><br>Choose a reply:`, buttons: [...opts, 'Cancel'], width: 520 });
    if (!r || r === 'Cancel') return;
    this.store.add({ from: `To: ${m.from}`, addr: m.addr, subject: 'Re: ' + m.subject, body: `${r}\n\n— Sunny\n\n> ${m.body.split('\n').slice(0, 6).join('\n> ')}`, folder: 'sent', read: true });
    this.comp.audio('os.send', 0.5);
    if (/dtp|neptune/i.test(m.addr)) setTimeout(() => this.store.add({ from: 'Mail Delivery Subsystem', addr: 'mailer-daemon@doorways', subject: 'Undeliverable: Re: ' + m.subject, body: `Your message could not be delivered.\n\nReason: ${/dtp/.test(m.addr) ? 'Recipient is "not monitored" (they read it, though).' : 'Recipient is at the library.'}` }), 4000);
  }
  del() {
    const m = this.cur; if (!m) return;
    if (m.folder === 'trash') this.store.items = this.store.items.filter((x) => x !== m);
    else m.folder = 'trash';
    this.sel = null; this.comp.audio('os.close', 0.3); this.render();
  }
}
