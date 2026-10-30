// Mr. Tofu is the old game's cat (Mochi's fur-shell SDF model, src/legacy/creatures/catmodel.js),
// wrapped in the same interface as every other character: c.root faces +Z, c.anim.*, c.update(dt).
import * as THREE from 'three';
import { game } from '../core/game.js';
import { CatModel } from '../legacy/creatures/catmodel.js';
import { G } from '../legacy/core/globals.js';
import { clamp, damp } from '../core/util.js';

const POSES = {
  stand: { sit: 0, loaf: 0, crouch: 0, lie: 0, earFlat: 0, puff: 0, tailUp: 0.25, arch: 0, jaw: 0, stretch: 0 },
  sit: { sit: 1, loaf: 0, crouch: 0, lie: 0, tailUp: 0.1, earFlat: 0, puff: 0, arch: 0, jaw: 0 },
  loaf: { loaf: 1, sit: 0, crouch: 0, lie: 0, tailUp: 0.0, earFlat: 0, puff: 0, lid: 0.45, jaw: 0 },
  lie: { lie: 1, sit: 0, loaf: 0, crouch: 0, lid: 0.15 },
  crouch: { crouch: 1, sit: 0, loaf: 0, lie: 0, earFlat: 0.6, tailUp: -0.2 },
  hiss: { crouch: 0.4, arch: 1, puff: 1, earFlat: 1, jaw: 0.9, tailUp: 0.9, sit: 0, loaf: 0, lie: 0 },
  limp: { lie: 1, sit: 0, loaf: 0, crouch: 0, lid: 0.3, earFlat: 0.5, tailUp: -0.4 },
  held: { held: 1, sit: 0, loaf: 0, lie: 0 },
  // standing on hind legs (the suit) is layered on top of 'sit' by a skeleton override
  biped: { sit: 1, loaf: 0, crouch: 0, lie: 0, tailUp: 0.3, earFlat: 0, puff: 0, lid: 0.7 },
  bipedPoint: { sit: 1, lid: 0.7 }, bipedSnap: { sit: 1, lid: 0.6 }, bipedTie: { sit: 1, lid: 0.8 },
};

class OldCatAnimator {
  constructor(c) {
    this.c = c; this.m = c.model; this.speed = 0; this.mode = 'walk'; this.fear = 0; this.fearT = 0;
    this.look = null; this.pose = 'stand'; this.speedMul = 1; this.custom = null;
  }
  setPose(name) { this.pose = name; this.m.set({ ...POSES.stand, ...(POSES[name] || {}) }); }
  move(speed, mode = 'walk') { this.speed = speed; this.mode = mode; }
  scared(v) { this.fearT = v; }
  lookAt(t) { this.look = t; this.m.lookTarget = t ? (t.isVector3 ? t : t.getWorldPosition?.(new THREE.Vector3())) : null; }
  walking(s) { this.move(s); }
  talk() { this.m.set({ jaw: 0.5 }); setTimeout(() => this.m.set({ jaw: 0 }), 300); }
  expression() {}
  reach() {}
  update(dt) {
    this.fear = damp(this.fear, this.fearT, 4, dt);
    if (this.fear > 0.05) this.m.set({ earFlat: this.fear, puff: this.fear, pupil: 0.25 + this.fear * 0.7 });
    let speed = this.speed;
    if (this.mode === 'gallop') speed = Math.max(speed, 2.2);
    if (this.mode === 'scramble') speed = 3.5;
    this.m.update(dt * this.speedMul * (this.mode === 'scramble' ? 2.2 : 1), { speed, scared: this.fear > 0.3, fast: this.mode !== 'walk' });
    if (this.pose.startsWith('biped')) bipedOverride(this.m, this.pose, game.time);
    this.custom?.(this, dt);
  }
}

// Stand him up: pitch the body upright around the hips and re-aim the legs.
function bipedOverride(m, pose, t) {
  const B = m.by, q = (b, x, y = 0, z = 0) => b && b.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  q(B.hips, 1.25); B.hips.position.y += 0.07;
  q(B.neck, -0.9); q(B.head, -0.25, 0.05 * Math.sin(t * 0.4));
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? -1 : 1;
    q(B['hhip.' + S], -1.1, 0, s * 0.06); q(B['hkn.' + S], -0.4); q(B['hhock.' + S], 0.3);
    if (pose === 'bipedPoint' && S === 'R') { q(B['fsh.' + S], -1.6, 0, s * 0.4); q(B['felb.' + S], 0.1); }
    else if (pose === 'bipedSnap' && S === 'R') { q(B['fsh.' + S], -0.8, 0, s * 0.6); q(B['felb.' + S], 1.4); }
    else if (pose === 'bipedTie') { q(B['fsh.' + S], -1.0, 0, -s * 0.5); q(B['felb.' + S], 1.5); }
    else { q(B['fsh.' + S], -1.1, 0, s * 0.2); q(B['felb.' + S], 0.5); }
  }
  m.root.updateMatrixWorld(true);
}

export class OldCat {
  constructor(kind = 'tofu') {
    this.kind = kind;
    this.model = new CatModel();
    this.model.root.removeFromParent();
    this.root = new THREE.Group(); this.root.name = kind;
    this.model.root.rotation.y = Math.PI;          // the old cat faces -Z
    this.root.add(this.model.root);
    this.byName = this.model.by;
    this.extras = {};
    this.anim = new OldCatAnimator(this);
    this.anim.setPose('stand');
    if (kind === 'tofusuit') this.dressUp();
  }
  bonePos(name, out = new THREE.Vector3()) { return (this.model.by[name] || this.model.root).getWorldPosition(out); }
  attach(boneName, obj) { (this.model.by[boneName] || this.model.root).add(obj); return obj; }
  set glow(v) {}
  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; }
  // navy suit jacket, white shirt front, red tie, tiny sunglasses, briefcase
  dressUp() {
    const B = this.model.by;
    const navy = new THREE.MeshStandardMaterial({ color: 0x1c2740, roughness: 0.7 }), shirt = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb3161c, roughness: 0.45 }), black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.08, metalness: 0.4 });
    const at = (bone, mesh, p) => { const b = B[bone]; const w = this.model.rest[bone]; mesh.position.set(p[0] - w.x, p[1] - w.y, p[2] - w.z); b.add(mesh); mesh.castShadow = true; return mesh; };
    at('spine1', new THREE.Mesh(new THREE.CapsuleGeometry(0.083, 0.1, 6, 16).rotateX(Math.PI / 2), navy), [0, 0.215, 0.04]);
    at('chest', new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.06, 6, 16).rotateX(Math.PI / 2), navy), [0, 0.218, -0.09]);
    at('chest', new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.1), shirt), [0, 0.138, -0.1]);
    const tie = at('chest', new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.1, 4).rotateX(Math.PI / 2), red), [0, 0.13, -0.1]); tie.rotation.z = Math.PI / 4;
    const glasses = new THREE.Group();
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.004, 20).rotateX(Math.PI / 2), black); l.position.x = s * 0.027; glasses.add(l); }
    glasses.add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.003, 0.003), black));
    at('head', glasses, [0, 0.305, -0.255]);
    const bc = new THREE.Group(); const leather = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.45 });
    bc.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.085, 0.03), leather)); const h = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16, Math.PI), leather); h.position.y = 0.043; bc.add(h);
    bc.visible = false; at('fpaw.R', bc, [0.05, -0.03, -0.12]);
    this.extras.briefcase = bc; this.extras.shades = glasses;
  }
  update(dt) { G.uniforms.uTime.value = game.time; this.anim.update(dt); }
}
