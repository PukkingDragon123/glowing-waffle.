import { G, emit } from './globals.js';

const BLOCK = new Set(['Space', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'F1', 'F3']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mx = window.innerWidth / 2; this.my = window.innerHeight / 2; // absolute
    this.buttons = [false, false, false];
    this.bPressed = [false, false, false];
    this.bReleased = [false, false, false];
    this.wheel = 0;
    this.locked = false;
    this.wantLock = false;
    this.text = [];          // typed characters / special keys for the computer
    this.captureText = false;
    this.lastLockExit = 0;

    window.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code) || (this.captureText && e.key.length === 1)) e.preventDefault();
      if (this.captureText) {
        if (e.key.length === 1) this.text.push(e.key);
        else if (['Backspace', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Home', 'End', 'Tab', 'Escape'].includes(e.key)) this.text.push('#' + e.key);
      }
      if (!e.repeat) { this.pressedSet.add(e.code); }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.buttons = [false, false, false];
    });
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button < 3) { this.buttons[e.button] = true; this.bPressed[e.button] = true; }
      emit('mousedown', e);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) { this.buttons[e.button] = false; this.bReleased[e.button] = true; }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        // ignore absurd spikes some browsers send right after locking
        if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
          this.mdx += e.movementX; this.mdy += e.movementY;
        }
      } else {
        this.mdx += e.movementX || 0; this.mdy += e.movementY || 0;
      }
      this.mx = e.clientX; this.my = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.lastLockExit = performance.now(); emit('unlock'); }
      if (this.locked) emit('lock');
    });
  }
  lock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock(); q && q.catch && q.catch(() => {}); } catch (e) {} });
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) {}
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  isDown(code) { return this.down.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  anyPressed(...codes) { return codes.some((c) => this.pressedSet.has(c)); }
  mouseDown(b = 0) { return this.buttons[b]; }
  mousePressed(b = 0) { return this.bPressed[b]; }
  mouseReleased(b = 0) { return this.bReleased[b]; }
  consumeText() { const t = this.text; this.text = []; return t; }
  // call at end of frame
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.bPressed = [false, false, false];
    this.bReleased = [false, false, false];
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
  }
}
