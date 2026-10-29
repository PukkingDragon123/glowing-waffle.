// The tower across Leonard Street, level with our window: a wall of lit rooms,
// and in three of them the same people. Each day they stand a little closer to
// the glass, staring at us. Faces are the photos in assets/neighbours/.
import * as THREE from 'three';
import { G } from '../core/globals.js';

const X0 = 9.5, X1 = 40, ZF = -12, D = 24, Y0 = -14, Y1 = 230, EYE = 120;  // sky-scene metres; our eye sits ~EYE up
const COL = 2.6, ROW = 3.3;

function paint(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; }
// a dark frame and a centre mullion over every view
const frame = (x, w, h) => { x.fillStyle = '#121212'; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 8, w, 8); x.fillRect(0, 0, 6, h); x.fillRect(w - 6, 0, 6, h); x.fillRect(w / 2 - 2, 0, 4, h); x.fillStyle = 'rgba(255,255,255,0.07)'; x.beginPath(); x.moveTo(10, h); x.lineTo(w * 0.5, 8); x.lineTo(w * 0.62, 8); x.lineTo(30, h); x.fill(); };
const office = () => paint(96, 120, (x, w, h) => {
  x.fillStyle = '#9fb3b8'; x.fillRect(0, 0, w, h); x.fillStyle = '#c7d4d2'; x.fillRect(0, 0, w, 26);
  x.fillStyle = '#f4fbff'; for (const px of [12, 50]) x.fillRect(px, 10, 28, 6);          // fluorescent panels
  x.fillStyle = '#5c6a6c'; x.fillRect(0, 74, w, h - 74);                                   // cubicle partitions
  x.fillStyle = '#3b4546'; x.fillRect(20, 62, 18, 14); x.fillRect(58, 64, 16, 12);           // monitors
  x.fillStyle = '#bfe0ff'; x.fillRect(22, 64, 14, 9); x.fillRect(60, 66, 12, 8);
  x.fillStyle = '#2a3132'; x.fillRect(40, 70, 8, 30); frame(x, w, h);
});
const home = () => paint(96, 120, (x, w, h) => {
  const gr = x.createRadialGradient(60, 50, 4, 60, 50, 70); gr.addColorStop(0, '#ffe3a8'); gr.addColorStop(1, '#8a5a30'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
  x.fillStyle = '#6b2f24'; x.fillRect(6, 6, 16, h - 12); x.fillRect(w - 22, 6, 16, h - 12);  // curtains
  x.fillStyle = '#3a2418'; x.fillRect(24, 82, 48, 20); x.fillRect(24, 74, 10, 10);         // a sofa
  x.fillStyle = '#9fc8ff'; x.fillRect(70, 70, 12, 10); frame(x, w, h);                      // TV glow
});
const blinds = () => paint(96, 120, (x, w, h) => { x.fillStyle = '#e6c58a'; x.fillRect(0, 0, w, h); x.fillStyle = '#b89a66'; for (let y = 8; y < h; y += 7) x.fillRect(0, y, w, 4); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 60, w, h - 60); frame(x, w, h); });
const dark = () => paint(96, 120, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a3440'); gr.addColorStop(1, '#0b0e12'); x.fillStyle = gr; x.fillRect(0, 0, w, h); frame(x, w, h); });

function faceTex(img) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  // shoulders and neck in shadow, the face an oval cut from the photo
  x.fillStyle = '#0d0c0b'; x.beginPath(); x.ellipse(128, 300, 120, 110, 0, 0, Math.PI * 2); x.fill(); x.fillRect(104, 150, 48, 60);
  x.save(); x.beginPath(); x.ellipse(128, 104, 62, 80, 0, 0, Math.PI * 2); x.clip();
  if (img) x.drawImage(img, 128 - 80, 104 - 96, 160, 192); else { x.fillStyle = '#1a1816'; x.fillRect(0, 0, 256, 256); }
  x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Neighbours {
  constructor(scene) {
    const g = this.g = new THREE.Group(); scene.add(g);
    const cols = Math.floor((X1 - X0) / COL), rows = Math.floor((Y1 - Y0 - 6) / ROW);
    // precast concrete: piers and spandrels in the gaps between windows
    const fc = paint(64, 80, (x, w, h) => { x.fillStyle = '#4a4642'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a3734'; x.fillRect(0, h - 10, w, 10); x.fillRect(w - 6, 0, 6, h); x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 40; i++) x.fillRect((i * 37) % w, (i * 53) % h, 2, 6); });
    fc.wrapS = fc.wrapT = THREE.RepeatWrapping; fc.repeat.set(cols, rows);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, Y1 - Y0, D), new THREE.MeshLambertMaterial({ map: fc }));
    shell.position.set((X0 + X1) / 2, (Y0 + Y1) / 2, ZF - D / 2); g.add(shell);
    // what you see through each window: offices, homes, blinds, or dark glass
    const kinds = [office(), home(), blinds(), dark()];
    this.mats = kinds.map((t, i) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: i === 3 ? 0xffffff : 0xffffff }));
    const lists = [[], [], [], []];
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const prow = Math.round((EYE - Y0 - 6) / ROW), pcols = [0, 1, 3];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (j === prow && pcols.includes(i)) continue;     // those rooms have people in them
      const r = rnd(), kind = r < 0.22 ? 0 : r < 0.34 ? 1 : r < 0.44 ? 2 : 3;
      lists[kind].push([X0 + COL * (i + 0.5), Y0 + 6 + ROW * j, rnd()]);
    }
    const m = new THREE.Matrix4(), c = new THREE.Color(), geo = new THREE.PlaneGeometry(1.8, 2.2);
    this.wins = lists.map((L, kind) => {
      const im = new THREE.InstancedMesh(geo, this.mats[kind], L.length);
      L.forEach(([x, y, v], k) => { m.makeTranslation(x, y, ZF + 0.02); im.setMatrixAt(k, m); im.setColorAt(k, c.setScalar(kind === 3 ? 0.7 + v * 0.3 : 0.6 + v * 0.5)); });
      g.add(im); return im;
    });
    // three rooms at our height, each with someone in it
    this.people = [];
    const row = prow;
    [0, 1, 3].forEach((i, n) => {
      const x = X0 + COL * (i + 0.5), y = Y0 + 6 + ROW * row;
      const room = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.0), new THREE.MeshBasicMaterial({ color: [0xe0b676, 0xbcd2f0, 0xd8a868][n], toneMapped: false }));
      room.position.set(x, y, ZF - 2.4); g.add(room);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.2), new THREE.MeshBasicMaterial({ map: this.glassTex || (this.glassTex = paint(96, 120, frame)), transparent: true, toneMapped: false }));
      glass.position.set(x, y, ZF + 0.02); g.add(glass);
      const mat = new THREE.MeshBasicMaterial({ map: faceTex(null), transparent: true, toneMapped: false });
      const fig = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
      fig.position.set(x, y - 0.25, ZF - 2); g.add(fig);
      this.people.push({ fig, mat, room, x, y });
    });
    this.load();
  }
  load() {
    const base = (typeof window !== 'undefined' && window.BENGRIM_ASSETS) || 'assets/';
    this.people.forEach((p, i) => {
      const img = new Image();
      img.onload = () => { p.mat.map.dispose(); p.mat.map = faceTex(img); p.mat.needsUpdate = true; };
      img.src = base + 'neighbours/face' + (i + 1) + '.jpg';
    });
  }
  update(dt, night) {
    const day = (G.story && G.story.day) || 1;
    for (let i = 0; i < 3; i++) this.mats[i].color.setScalar(0.3 + night * 0.7);
    for (const p of this.people) {
      // a step closer to the glass every day; on the last days, right against it
      const z = ZF - 2 + Math.min(1.9, (day - 1) * 0.32);
      p.fig.position.z += (z - p.fig.position.z) * Math.min(1, dt * 0.5);
      p.mat.color.setScalar(0.55 + night * 0.4);
    }
  }
}
