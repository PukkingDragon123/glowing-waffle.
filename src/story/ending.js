// The end. You wake in a biomechanical chamber on a slab, high over Bangkok. You scream, you fall,
// you die on the floor with your eyes open. Something leaves you and crawls
// away. A voice: SUBJECT STATUS: COMPLETE. Nothing is explained.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { clearSave } from '../core/save.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const O = V(0, 0, 240);   // the lab is far from the apartment; no light reaches between

export class Ending {
  constructor() { G.ending = this; this.built = false; }

  build() {
    if (this.built) return;
    this.built = true;
    const g = this.root = new THREE.Group(); g.position.copy(O); G.scene.add(g);
    const bio = M.biomech, flesh = M.flesh;
    const wet = new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.35, metalness: 0.2 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // floor and a ribbed vault
    add(new THREE.PlaneGeometry(10, 10), wet, 0, 0, 0, -Math.PI / 2);
    for (let i = 0; i < 11; i++) {
      const z = -5 + i;
      const rib = add(new THREE.TorusGeometry(3.6, 0.16 + (i % 2) * 0.06, 8, 28, Math.PI), bio, 0, 0, z);
      rib.scale.set(1.15, 1, 1);
    }
    const shell = add(new THREE.CylinderGeometry(3.7, 3.7, 10.5, 24, 1, true, -Math.PI / 2, Math.PI), bio, 0, 0, 0, Math.PI / 2, 0, 0);
    shell.material = bio.clone(); shell.material.side = THREE.BackSide; shell.scale.set(1.15, 1, 1);
    add(new THREE.PlaneGeometry(8.5, 4.2), bio, 0, 2.0, -5.2);
    const back = add(new THREE.PlaneGeometry(8.5, 4.2), bio, 0, 2.0, 5.2, 0, Math.PI);
    // a door slit at the far end with light behind it
    this.doorLight = add(new THREE.PlaneGeometry(0.35, 2.0), new THREE.MeshBasicMaterial({ color: 0x9fb8a0 }), 0, 1.0, -5.15);
    // the slab with restraints, and tubes running into it from the ceiling
    add(new THREE.BoxGeometry(0.9, 0.12, 2.1), flesh, 0, 0.9, 0);
    add(new THREE.CylinderGeometry(0.18, 0.3, 0.84, 10), bio, 0, 0.42, 0);
    for (const z of [-0.6, 0.1, 0.7]) add(new THREE.BoxGeometry(0.96, 0.03, 0.08), wet, 0, 0.97, z);
    for (let i = 0; i < 5; i++) {
      const pts = [];
      const a = (i / 5) * Math.PI * 2;
      for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(V(Math.cos(a) * (0.9 - t * 0.75) * (1 - t * 0.2), 3.6 - t * 2.55 - Math.sin(t * Math.PI) * 0.3, 0.1 + Math.sin(a) * (0.9 - t * 0.75))); }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035 + (i % 2) * 0.015, 6), bio, 0, 0, 0);
    }
    // pods along the walls with shapes curled in amber fluid
    const podGlass = new THREE.MeshStandardMaterial({ color: 0x80a060, emissive: 0x2a3a10, emissiveIntensity: 1.2, transparent: true, opacity: 0.4, roughness: 0.1 });
    const curled = new THREE.MeshStandardMaterial({ color: 0x302018, roughness: 0.8 });
    for (const [x, z] of [[-2.6, -3], [2.6, -3], [-2.6, -0.6], [2.6, -0.6], [-2.6, 1.8], [2.6, 1.8]]) {
      add(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 14, 1, true), podGlass, x, 1.3, z);
      const s = add(new THREE.SphereGeometry(0.3, 10, 8), curled, x, 1.2 + Math.random() * 0.3, z); s.scale.set(0.8, 1.2, 0.9);
      add(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 14), bio, x, 0.1, z);
    }
    // light: a cold surgical lamp, a sick green from the pods
    const lamp = this.lamp = new THREE.SpotLight(0xeaf4ff, 0, 8, 0.6, 0.6, 1.4);
    lamp.position.set(0, 3.3, 0.1); lamp.target.position.set(0, 0.9, 0.1); lamp.castShadow = true; lamp.shadow.mapSize.set(512, 512);
    g.add(lamp, lamp.target);
    add(new THREE.CylinderGeometry(0.35, 0.5, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e8, emissiveIntensity: 1.1 }), 0, 3.45, 0.1);
    this.green = new THREE.PointLight(0x80ff60, 0, 9, 1.6); this.green.position.set(0, 1.5, -1); g.add(this.green);
    this.floorFill = new THREE.PointLight(0xc8d8e0, 0, 4, 1.5); this.floorFill.position.set(0.5, 0.5, -0.6); g.add(this.floorFill);
    // a wall monitor that reports on you
    this.monCv = document.createElement('canvas'); this.monCv.width = 256; this.monCv.height = 128;
    this.monTex = new THREE.CanvasTexture(this.monCv); this.monTex.colorSpace = THREE.SRGBColorSpace;
    const mon = add(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: this.monTex, toneMapped: false }), -1.6, 2.1, -5.12);
    add(new THREE.BoxGeometry(1.0, 0.55, 0.08), bio, -1.6, 2.1, -5.18);
    this.setMonitor('SUBJECT 1407\nGESTATION 100%');
    // what comes out
    this.thing = makeThing(); this.thing.visible = false; g.add(this.thing);
    this.cord = new THREE.Mesh(new THREE.BufferGeometry(), flesh); g.add(this.cord);
  }

  async start() {
    this.build();
    const c = G.player.ctrl, body = G.body;
    G.state = 'ending';
    G.director.running = false;
    G.alien && G.alien.reset();
    G.engine.background = null;
    G.hud.objective([]); G.hud.crosshair(false);
    G.uniforms.uBend.value.set(0, 0, 0, 0); G.uniforms.uWarp.value = 0; G.uniforms.uBreath.value = 0;
    G.fx.clear('alien'); G.fx.clear('stalker');
    G.fx.setGrade({ saturation: 0.55, contrast: 1.15, tint: new THREE.Vector3(0.95, 1.0, 0.92) });
    this.lamp.intensity = 5.5; this.green.intensity = 1.6; this.floorFill.intensity = 0.9;
    // you, lying on the slab, the belly enormous under the shirt
    c.enabled = false; c.lookEnabled = false;
    c.teleport(O.x, O.y + 1.0, O.z + 0.9, 0, 0);
    body.visible = true; body.mode = 'custom';
    body.setMutation({ belly: 1.25, pale: 0.9, veins: 1, blackVeins: 0.9, glow: 0.45, split: 0, bloodShirt: 0.3 });
    this.phase = 'lie'; this.t = 0;
    const self = this;
    body.customPose = (b) => self.pose(b);
    this.camQ = new THREE.Quaternion();
    this.breath = G.audio && G.audio.loop('breathHeavy', { vol: 0.6 });
    this.drone = G.audio && G.audio.loop('droneLab', { vol: 0.45 });
    G.audio && G.audio.setZone && G.audio.setZone('lab');
    G.fx.whiteTo(0, 0.5);
    G.fx.fadeTo(0, 0.5);
    this.running = true;
  }

  // body placement for each phase
  pose(b) {
    const B = b.byName;
    const rx = (bone, a) => bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a));
    if (this.phase === 'lie' || this.phase === 'sitUp') {
      // on the back along the slab, head toward +z
      const up = this.phase === 'sitUp' ? smoothstep(0, 1, this.t - 3.2) * 0.9 : 0;
      b.root.position.set(O.x, O.y + 0.98, O.z + 0.95);
      b.root.rotation.set(-Math.PI / 2 + up * 0.9, Math.PI, 0);
      rx(B.spine1, up * 0.3); rx(B.neck, -0.3 - up * 0.2);
    } else {
      // on its side on the floor, head by the camera, body stretched toward the door
      const X = V(0, -1, 0), Y = V(0, 0, 1), Z = V(-1, 0, 0);
      b.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
      b.root.position.set(O.x + 0.02, O.y + 0.16, O.z - 0.42);
      rx(B.spine1, 0.25); rx(B.spine2, 0.2);
      for (const S of ['L', 'R']) { rx(B['thigh.' + S], 0.9); rx(B['shin.' + S], -1.2); }
    }
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const t = this.t, cam = G.camera, body = G.body;
    const eye = V(O.x, O.y + 1.08, O.z + 1.6);
    if (this.phase === 'lie') {
      // wake: look up at the lamp; you can look down at what you've become
      const inp = G.input;
      this.lookY = clamp((this.lookY || 0) - inp.mdx * 0.002, -0.8, 0.8);
      this.lookP = clamp((this.lookP || 0) - inp.mdy * 0.002, -0.9, 0.3);
      cam.position.copy(eye);
      cam.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 - 0.2 + this.lookP - (t < 2 ? 0 : 0), this.lookY, 0, 'YXZ'));
      if (t > 1.2 && !this.s1) { this.s1 = true; sfx('heartbeat', { vol: 0.8 }); }
      if (t > 3.2) { this.phase = 'sitUp'; sfx('scream', { vol: 1 }); G.fx.pulse('shake', 1, 2); G.fx.pulse('noiseBurst', 0.8, 1.5); }
    } else if (this.phase === 'sitUp') {
      const k = smoothstep(3.2, 4.2, t);
      cam.position.copy(eye).add(V(0, k * 0.55, -k * 0.5));
      cam.quaternion.setFromEuler(new THREE.Euler(lerp(Math.PI / 2 - 0.2, -0.5, k), Math.sin(t * 9) * 0.05 * k, 0, 'YXZ'));
      if (t > 5.4) { this.phase = 'fall'; sfx('bodyFall', { vol: 1 }); sfx('pain', { vol: 1 }); G.fx.pulse('shake', 1, 1); if (this.breath) this.breath.set({ vol: 0.9, rate: 1.3 }); }
    } else if (this.phase === 'fall') {
      // off the slab, onto the wet floor
      const k = smoothstep(5.4, 6.2, t);
      const floorEye = V(O.x - 0.04, O.y + 0.11, O.z + 1.36);
      cam.position.copy(eye).add(V(0, 0.55, -0.5)).lerp(floorEye, k);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.08, -1.25, 'YXZ'));
      cam.quaternion.slerp(q, k);
      if (t > 6.2) { this.phase = 'dying'; this.dieT = t; }
    } else if (this.phase === 'dying') {
      // breath slows; the heart stops; the camera never moves again
      if (this.breath) this.breath.set({ vol: Math.max(0, 0.9 - (t - this.dieT) * 0.25), rate: Math.max(0.5, 1.3 - (t - this.dieT) * 0.2) });
      if (t - this.dieT > 0.5 && !this.s2) { this.s2 = true; sfx('heartbeat', { vol: 0.7, rate: 0.8 }); }
      if (t - this.dieT > 2.6 && !this.s3) { this.s3 = true; sfx('heartbeat', { vol: 0.4, rate: 0.6 }); }
      if (t - this.dieT > 4.5) {
        this.phase = 'birth'; this.bT = 0;
        if (this.breath) { this.breath.stop(1.5); this.breath = null; }
        G.fx.setGrade({ saturation: 0.3, contrast: 1.2 });
      }
    } else if (this.phase === 'birth') {
      this.bT += dt;
      const bt = this.bT;
      // the belly splits
      body.setMutation({ split: smoothstep(0.4, 3, bt) });
      if (bt > 0.4 && !this.b1) { this.b1 = true; sfx('tear', { vol: 1 }); }
      if (bt > 1.8 && !this.b2) { this.b2 = true; sfx('tear', { vol: 0.9, rate: 0.8 }); sfx('chewWet', { vol: 0.8, rate: 0.6 }); G.decals && G.decals.blood(V(O.x + 0.15, O.y + 0.001, O.z + 0.55), 0.9); }
      const belly = body.byName.spine1.getWorldPosition(V());
      const th = this.thing;
      if (bt > 2.4) {
        th.visible = true;
        // it pulls itself out and crawls toward the light under the door
        const k = smoothstep(2.4, 4.0, bt);
        const start = belly.clone().add(V(0.05, 0, 0)), out = V(O.x + 0.22, O.y + 0.04, O.z + 0.3);
        const crawl = clamp((bt - 4.0) / 9, 0, 1);
        const door = V(O.x, O.y + 0.04, O.z - 5.0);
        const p = crawl > 0 ? out.clone().lerp(door, crawl) : start.clone().lerp(out, k);
        th.position.copy(p).sub(O);
        th.lookAt(crawl > 0 ? door : out);
        th.rotation.x += Math.sin(bt * 14) * 0.08;
        const legs = th.userData.legs;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(bt * 10 + i * 1.7) * 0.7; l.rotation.z = (i % 2 ? 1 : -1) * (0.9 + Math.sin(bt * 10 + i) * 0.3); });
        if (Math.random() < dt * 8) G.decals && G.decals.drop(p);
        // umbilical cord back to you until it snaps
        if (crawl < 0.12) this.updateCord(belly.clone().sub(O), th.position.clone());
        else if (!this.snapped) { this.snapped = true; this.cord.visible = false; sfx('rip', { vol: 0.6 }); }
        if (bt > 4.2 && !this.b3) { this.b3 = true; sfx('hiss', { vol: 0.7, rate: 0.55 }); }
        if (bt > 7.5 && !this.b4) { this.b4 = true; sfx('catGrowl', { vol: 0.5, rate: 0.5 }); }
      }
      if (bt > 13 && !this.voice) {
        this.voice = true;
        const h = G.audio && G.audio.speak('Subject status. Complete.', { voice: 'machine', mech: true, vol: 0.9, reverb: 0.6 });
        this.setMonitor('SUBJECT STATUS:\nCOMPLETE');
      }
      if (bt > 15.5 && !this.lightsOff) {
        this.lightsOff = true;
        sfx('breaker', { vol: 0.8 });
        this.lamp.intensity = 0; this.green.intensity = 0.4; this.doorLight.material.color.setHex(0x203020);
      }
      if (bt > 18 && !this.done) { this.done = true; this.finish(); }
    }
  }
  setMonitor(text) {
    const c = this.monCv.getContext('2d');
    c.fillStyle = '#020402'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#7dff9a'; c.font = '22px "Chakra Petch", "Courier New", monospace'; c.textBaseline = 'top';
    text.split('\n').forEach((l, i) => c.fillText(l, 16, 26 + i * 34));
    for (let y = 0; y < 128; y += 3) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, 256, 1); }
    this.monTex.needsUpdate = true;
  }
  updateCord(a, b) {
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.min(a.y, b.y) - 0.05;
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    this.cord.geometry.dispose();
    this.cord.geometry = new THREE.TubeGeometry(curve, 16, 0.012, 5, false);
    this.cord.visible = true;
  }
  async finish() {
    await G.fx.fadeTo(1, 0.4);
    if (this.drone) { this.drone.stop(2); this.drone = null; }
    this.running = false;
    clearSave();
    // what happened after, in Bangkok and on the 14th floor
    for (const [big, small, dur] of epilogue()) await G.hud.titleCard(big, small, dur);
    await G.hud.titleCard('ต้มยำกุ้ง ๒๕๔๐', 'TOM YUM 2540', 5);
    G.body.mode = 'stand'; G.body.customPose = null;
    G.body.setMutation({ split: 0 });
    this.thing.visible = false;
    location.reload();
  }
}

// Real history first, then what you did. (Facts: the baht was floated on 2
// July 1997 and passed 55 to the dollar in January 1998; the Bank of Thailand
// closed 56 finance companies for good on 8 December 1997; the 1997
// constitution was promulgated on 11 October 1997 and let 50,000 voters
// propose a law; Sathorn Unique still stands unfinished.)
function epilogue() {
  const p = G.story.politics || {};
  const out = [
    ['๒ กรกฎาคม ๒๕๔๐', 'The baht was floated that morning. By January it took 56 baht to buy one dollar.', 6],
    ['๘ ธันวาคม ๒๕๔๐', 'Fifty-six finance companies were closed for good. Siam Prosperity was one of them.', 6],
  ];
  if (p.yaba === 'bought') out.push(['วิน · Win', 'Win from the motosai stand still comes by. He always comes back tomorrow.', 5]);
  else if (p.yaba === 'police') out.push(['ตำรวจ · Police', 'The sergeant at Thong Lor was Win\'s cousin. A fish ball vendor went to prison.', 5]);
  else if (p.yaba === 'refused') out.push(['วิน · Win', 'You said no to Win. He found somebody on the 13th floor who said yes.', 5]);
  if (p.vote === 'kept') out.push(['เบอร์ ๙', 'Number nine won the by-election in a landslide. Five hundred baht of it was yours.', 5]);
  else if (p.vote === 'burned') out.push(['เบอร์ ๙', 'Number nine won anyway. Your five hundred baht went up the kitchen fan.', 5]);
  else if (p.vote) out.push(['เบอร์ ๙', 'Number nine won anyway. Nobody counted your no.', 5]);
  if (p.deed === 'signed') out.push(['ห้อง ๑๔๐๗', 'Room 1407 belongs to Meridian Pacific Capital. The lights there never go off.', 5]);
  else if (p.deed === 'refused') out.push(['ห้อง ๑๔๐๗', 'Room 1407 was never sold. Nobody lives in it. A cat still waits at the door.', 5]);
  out.push(['๑๑ ตุลาคม ๒๕๔๐', p.petition === true ? 'The People\'s Constitution became law. Your name is on page 3,112 of the petition.' : 'The People\'s Constitution became law. Fifty thousand people could now propose a law. You did not sign.', 6]);
  out.push(['ตึกร้าง', 'Sathorn Unique, the real ghost tower, still stands unfinished over Bangkok.', 6]);
  return out;
}
