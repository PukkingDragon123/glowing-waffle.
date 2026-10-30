// Calculator (standard).
import { h } from '../dom.js';

export function registerCalc(os, comp) {
  os.register('calc', { title: 'Calculator', icon: 'calc', w: 250, h: 270, resizable: false, create: (win) => new Calc(win, comp) });
}

class Calc {
  constructor(win, comp) {
    this.comp = comp; this.cur = '0'; this.acc = null; this.op = null; this.fresh = true; this.mem = 0;
    this.disp = h('div', { class: 'd98-field calc-disp' }, '0');
    const keys = [['MC', 'fn'], ['7'], ['8'], ['9'], ['/', 'op'], ['MR', 'fn'], ['4'], ['5'], ['6'], ['*', 'op'], ['MS', 'fn'], ['1'], ['2'], ['3'], ['-', 'op'], ['M+', 'fn'], ['0'], ['+/-'], ['.'], ['+', 'op'], ['C', 'op'], ['CE', 'op'], ['√', 'fn'], ['%', 'fn'], ['=', 'op']];
    const grid = h('div', { class: 'calc-keys' }, ...keys.map(([k, cls]) => h('button', { class: 'd98-btn ' + (cls || ''), onclick: () => this.press(k) }, k)));
    win.body.appendChild(h('div', { class: 'calc' }, this.disp, grid));
  }
  show() { let s = this.cur; if (s.length > 14) s = (+s).toPrecision(10); this.disp.textContent = s === 'NaN' || s === 'Infinity' ? 'Cannot divide by zero' : s; }
  calc() {
    const a = this.acc, b = parseFloat(this.cur);
    if (this.op == null || a == null) return b;
    return this.op === '+' ? a + b : this.op === '-' ? a - b : this.op === '*' ? a * b : a / b;
  }
  press(k) {
    this.comp.audio('os.press', 0.2);
    if (/^[0-9]$/.test(k)) { this.cur = this.fresh || this.cur === '0' ? k : this.cur + k; this.fresh = false; }
    else if (k === '.') { if (this.fresh) { this.cur = '0.'; this.fresh = false; } else if (!this.cur.includes('.')) this.cur += '.'; }
    else if (k === '+/-') this.cur = String(-parseFloat(this.cur));
    else if ('+-*/'.includes(k)) { this.acc = this.fresh && this.op ? this.acc : this.calc(); this.op = k; this.cur = String(this.acc); this.fresh = true; }
    else if (k === '=') { const r = this.calc(); this.cur = String(Math.round(r * 1e10) / 1e10); this.acc = null; this.op = null; this.fresh = true; if (this.cur === '1407') this.comp.os.notify('Calculator', 'That\'s your room number. The calculator knows.'); }
    else if (k === 'C') { this.cur = '0'; this.acc = null; this.op = null; this.fresh = true; }
    else if (k === 'CE') { this.cur = '0'; this.fresh = true; }
    else if (k === '√') { this.cur = String(Math.sqrt(parseFloat(this.cur))); this.fresh = true; }
    else if (k === '%') { this.cur = String((this.acc || 0) * parseFloat(this.cur) / 100); this.fresh = true; }
    else if (k === 'MC') this.mem = 0; else if (k === 'MR') { this.cur = String(this.mem); this.fresh = true; } else if (k === 'MS') this.mem = parseFloat(this.cur); else if (k === 'M+') this.mem += parseFloat(this.cur);
    this.show();
  }
  onKey(e, down) {
    if (!down) return false;
    const map = { Enter: '=', Backspace: 'CE', Escape: null, Delete: 'C' };
    const k = e.key in map ? map[e.key] : e.key;
    if (k && (/^[0-9.+\-*/=]$/.test(k) || k === 'CE' || k === 'C')) { this.press(k); return true; }
    return false;
  }
}
