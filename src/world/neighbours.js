// The tower across Leonard Street, level with our window: a wall of lit rooms,
// and in three of them the same people. Each day they stand a little closer to
// the glass, staring at us. Faces are the photos in assets/neighbours/.
import * as THREE from 'three';
import { G } from '../core/globals.js';

const X0 = 9.5, X1 = 40, ZF = -12, D = 24, Y0 = -14, Y1 = 230, EYE = 120;  // sky-scene metres; our eye sits ~EYE up
const COL = 2.6, ROW = 3.3;

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
    const shell = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, Y1 - Y0, D), new THREE.MeshLambertMaterial({ color: 0x3d3a37 }));
    shell.position.set((X0 + X1) / 2, (Y0 + Y1) / 2, ZF - D / 2); g.add(shell);
    // window grid on the facade facing us
    const cols = Math.floor((X1 - X0) / COL), rows = Math.floor((Y1 - Y0 - 6) / ROW);
    const win = this.win = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 2.0), new THREE.MeshBasicMaterial({ toneMapped: false }), cols * rows);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    this.lit = [];
    let k = 0, s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
      m.makeTranslation(X0 + COL * (i + 0.5), Y0 + 6 + ROW * j, ZF + 0.02); win.setMatrixAt(k, m);
      const r = rnd(), on = r < 0.42;
      this.lit.push(on);
      c.setHex(on ? (r < 0.12 ? 0xbfd8ff : r < 0.3 ? 0xffcf8a : 0xe8c07a) : 0x0e1014).multiplyScalar(on ? 0.6 + rnd() * 0.5 : 1);
      win.setColorAt(k, c);
    }
    g.add(win);
    // three rooms at our height, each with someone in it
    this.people = [];
    const row = Math.round((EYE - Y0 - 6) / ROW), base = this.base = new THREE.Vector3();
    [0, 1, 3].forEach((i, n) => {
      const x = X0 + COL * (i + 0.5), y = Y0 + 6 + ROW * row;
      const room = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.0), new THREE.MeshBasicMaterial({ color: [0xe0b676, 0xbcd2f0, 0xd8a868][n], toneMapped: false }));
      room.position.set(x, y, ZF - 2.4); g.add(room);
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
    this.win.material.color.setScalar(0.35 + night * 0.65);
    for (const p of this.people) {
      // a step closer to the glass every day; on the last days, right against it
      const z = ZF - 2 + Math.min(1.9, (day - 1) * 0.32);
      p.fig.position.z += (z - p.fig.position.z) * Math.min(1, dt * 0.5);
      p.mat.color.setScalar(0.55 + night * 0.4);
    }
  }
}
