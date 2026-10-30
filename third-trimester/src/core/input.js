// Pointer + keyboard state. Scenes read game.input each frame; DOM overlays (computer, menus)
// stop propagation themselves so world input pauses while they are focused.
import * as THREE from 'three';
import { game } from './game.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.ndc = new THREE.Vector2(); this.px = new THREE.Vector2(); this.prevPx = new THREE.Vector2();
    this.vel = new THREE.Vector2();       // px/s, smoothed
    this.down = false; this.rightDown = false;
    this.pressed = false; this.released = false; this.rightPressed = false; this.clicked = false;
    this.wheel = 0;
    this.keys = new Set(); this.keysPressed = new Set();
    this.downAt = new THREE.Vector2(); this.downTime = 0; this.dragDist = 0;
    this.enabled = true;
    this.overUI = false;
    const onMove = (e) => {
      this.px.set(e.clientX, e.clientY);
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (this.down) this.dragDist = Math.max(this.dragDist, this.px.distanceTo(this.downAt));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerdown', (e) => {
      onMove(e);
      if (e.button === 2) { this.rightDown = true; this.rightPressed = true; return; }
      this.down = true; this.pressed = true; this.downAt.copy(this.px); this.downTime = performance.now(); this.dragDist = 0;
      canvas.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) { this.rightDown = false; return; }
      if (!this.down) return;
      this.down = false; this.released = true;
      if (this.dragDist < 6 && performance.now() - this.downTime < 450) this.clicked = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' && e.target === document.body) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.down = false; });
  }
  key(code) { return this.keys.has(code); }
  keyPressed(code) { return this.keysPressed.has(code); }
  anyPressed(...codes) { return codes.some((c) => this.keysPressed.has(c)); }
  // Called at the end of each frame.
  endFrame(dt) {
    const v = this.px.clone().sub(this.prevPx).divideScalar(Math.max(dt, 1e-3));
    this.vel.lerp(v, 0.35); this.prevPx.copy(this.px);
    this.pressed = this.released = this.clicked = this.rightPressed = false;
    this.wheel = 0; this.keysPressed.clear();
  }
  setCursor(c) { if (this.canvas.style.cursor !== c) this.canvas.style.cursor = c; }
}

export function attachInput(canvas) { game.input = new Input(canvas); return game.input; }
