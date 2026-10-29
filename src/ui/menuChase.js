// The loading screen and the main menu are one scene. While the world is
// built, Mochi runs through the dark in a pool of light and then sits and
// waits for you. Then the dark reaches for her: pale arms out of the black
// from the sides, up through the floor and from behind, fingers spread,
// snatching, closing on nothing and sinking back. She swerves and leaps and
// keeps running. The options sit over it in plain HTML.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { CatModel } from '../creatures/catmodel.js';
import { COARSE } from '../core/settings.js';
import { clamp, damp, lerp, smoothstep, snoise1 } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const RUN = 1.9;           // m/s the floor streams past her
const N = 16;              // pooled arms
const SEGS = 17, BALLS = 17;   // per arm: upper arm, forearm, 15 finger bones; elbow, wrist, 15 finger joints
// cameras: side-on while loading, low and ahead of her for the chase
const LOAD = { p: V(0.15, 0.42, 1.55), l: V(0.06, 0.19, 0), fov: 30 };
const CHASE = { p: V(-1.3, 0.2, 0.42), l: V(0.15, 0.21, -0.04), fov: 40 };
// finger bones (m, before the arm's scale): index, middle, ring, little; then the thumb
const FING = [[0.05, 0.03, 0.024, 0.0095], [0.056, 0.034, 0.026, 0.0098], [0.052, 0.032, 0.024, 0.009], [0.04, 0.025, 0.02, 0.008]];
const THUMB = [0.042, 0.032, 0.026, 0.011];
const SPREAD = [0.26, 0.08, -0.08, -0.26], KNUCK = [0.78, 0.26, -0.26, -0.76], CURL = [1.0, 1.45, 1.1];

const _m = new THREE.Matrix4(), _x = V(), _y = V(), _z = V(), _a = V(), _b = V(), _c = V(), _d = V(), _f = V(), _n = V(), _s = V();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
// a tapered segment from a to b, its x axis rolled toward ref
function seg(a, b, r, ref) {
  _y.subVectors(b, a); const L = _y.length(); if (L < 1e-5) return ZERO;
  _y.divideScalar(L);
  _x.copy(ref).addScaledVector(_y, -ref.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(_y.y, -_y.x, 0); _x.normalize();
  _z.crossVectors(_x, _y);
  return _m.makeBasis(_x.multiplyScalar(r), _y.multiplyScalar(L), _z.multiplyScalar(r)).setPosition(a);
}
const ball = (p, r) => _m.makeScale(r, r, r).setPosition(p);

// a limb bone from y=0 to 1: it swells a little below the joint and narrows toward the far end
function segGeo() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 6); g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = (1 + 0.16 * Math.sin(Math.PI * Math.min(1, y * 1.5))) * (1 - 0.32 * y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
// the palm: narrow at the wrist, broad and flat across the knuckles
function palmGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 1); g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (0.7 + 0.3 * y)); p.setZ(i, p.getZ(i) * (1.15 - 0.4 * y)); }
  return g.toNonIndexed();
}

class Arms {
  constructor(scene) {
    // smooth limbs, a faceted palm and knuckles: low poly, but flesh
    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, emissive: 0x0e0908 });
    const mk = (geo, n) => { const m = new THREE.InstancedMesh(geo, skin, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; for (let i = 0; i < n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, new THREE.Color(1, 1, 1)); } scene.add(m); return m; };
    this.seg = mk(segGeo(), N * SEGS); this.palm = mk(palmGeo(), N); this.ball = mk(new THREE.IcosahedronGeometry(1, 1), N * BALLS);
    this.list = [...Array(N)].map((_, i) => ({ i, on: false, S0: V(), S: V(), P: V(), W: V(), E: V(), out: V(), pole: V() }));
    this.col = new THREE.Color();
  }
  free() { return this.list.find((a) => !a.on); }
  clear() { for (const a of this.list) { a.on = false; this.hide(a); } this.flush(); }
  hide(a) { for (let k = 0; k < SEGS; k++) this.seg.setMatrixAt(a.i * SEGS + k, ZERO); for (let k = 0; k < BALLS; k++) this.ball.setMatrixAt(a.i * BALLS + k, ZERO); this.palm.setMatrixAt(a.i, ZERO); }
  flush() { for (const m of [this.seg, this.palm, this.ball]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
  // dead pale skin, some greyer, some bruised, a few jaundiced
  tint(a) {
    const r = Math.random(), c = this.col;
    if (r < 0.5) c.setRGB(0.6, 0.55, 0.51); else if (r < 0.75) c.setRGB(0.5, 0.5, 0.5); else if (r < 0.9) c.setRGB(0.54, 0.45, 0.47); else c.setRGB(0.58, 0.55, 0.42);
    c.multiplyScalar(0.85 + Math.random() * 0.2);
    for (let k = 0; k < SEGS; k++) this.seg.setColorAt(a.i * SEGS + k, c);
    for (let k = 0; k < BALLS; k++) this.ball.setColorAt(a.i * BALLS + k, c);
    this.palm.setColorAt(a.i, c);
  }
  // one arm's bones from shoulder S to wrist W, a hand along f with its palm toward n, grip g
  draw(a, g, t) {
    const sc = a.sc, L1 = 0.33 * sc, L2 = 0.3 * sc;
    const S = a.S, W = a.W, E = a.E;
    // two-bone IK, the elbow bent toward the pole
    _d.subVectors(W, S); let d = _d.length();
    if (d > (L1 + L2) * 0.995) { _d.multiplyScalar((L1 + L2) * 0.995 / d); W.copy(S).add(_d); d = (L1 + L2) * 0.995; }
    _d.divideScalar(Math.max(d, 1e-4));
    const along = (L1 * L1 + d * d - L2 * L2) / (2 * d), up = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    _b.copy(a.pole).addScaledVector(_d, -a.pole.dot(_d)).normalize();
    E.copy(S).addScaledVector(_d, along).addScaledVector(_b, up);
    let si = a.i * SEGS, bi = a.i * BALLS;
    const S_ = this.seg, B_ = this.ball;
    S_.setMatrixAt(si++, seg(S, E, 0.031 * sc, _b));
    S_.setMatrixAt(si++, seg(E, W, 0.027 * sc, _b));
    B_.setMatrixAt(bi++, ball(E, 0.025 * sc)); B_.setMatrixAt(bi++, ball(W, 0.02 * sc));
    // the hand: fingers along f (the forearm, bent toward the prey), palm facing n
    _f.subVectors(W, E).normalize();
    _a.subVectors(a.P, W); const ap = _a.length();
    if (ap > 0.02) _f.addScaledVector(_a.divideScalar(ap), 0.7).normalize();
    _n.copy(a.target).sub(W); _n.addScaledVector(_f, -_n.dot(_f));
    if (_n.lengthSq() < 1e-5) _n.set(0, -1, 0).addScaledVector(_f, -(-_f.y));
    _n.normalize();
    _s.crossVectors(_f, _n);   // f x n: the palm's width; the thumb is on the hand's own side of it
    const PL = 0.092 * sc, PW = 0.078 * sc, PT = 0.024 * sc;
    this.palm.setMatrixAt(a.i, _m.makeBasis(_x.copy(_s).multiplyScalar(PW), _y.copy(_f).multiplyScalar(PL), _z.copy(_n).multiplyScalar(PT)).setPosition(W));
    const gc = clamp(g, -0.3, 1.1), open = 1 - clamp(g, 0, 1);
    for (let k = 0; k < 4; k++) {
      const F = FING[k];
      // each finger twitches on its own
      const tw = snoise1(t * 7 + k * 3.1, a.seed + k) * 0.35 * a.twitch;
      _a.copy(W).addScaledVector(_f, PL * 0.97).addScaledVector(_s, a.hand * KNUCK[k] * PW * 0.42).addScaledVector(_n, PT * 0.15);
      const sp = a.hand * SPREAD[k] * (0.4 + open * 0.9);
      _c.copy(_f).multiplyScalar(Math.cos(sp)).addScaledVector(_s, Math.sin(sp));
      let th = -0.12 * open;
      for (let j = 0; j < 3; j++) {
        th += gc * CURL[j] + tw * (j + 1) * 0.4;
        _z.copy(_c).multiplyScalar(Math.cos(th)).addScaledVector(_n, Math.sin(th));
        _b.copy(_a).addScaledVector(_z, F[j] * sc * 1.25);
        S_.setMatrixAt(si++, seg(_a, _b, F[3] * sc * (1 - j * 0.12), _n));
        B_.setMatrixAt(bi++, ball(_a, F[3] * sc * 0.95 * (1 - j * 0.12)));
        _a.copy(_b);
      }
    }
    // the thumb comes off the side of the palm and folds across it
    _a.copy(W).addScaledVector(_f, PL * 0.28).addScaledVector(_s, a.hand * PW * 0.5);
    _c.copy(_f).multiplyScalar(0.55).addScaledVector(_s, a.hand * 0.8).addScaledVector(_n, 0.2)
      .lerp(_d.copy(_f).multiplyScalar(0.45).addScaledVector(_s, -a.hand * 0.35).addScaledVector(_n, 0.85), clamp(gc, 0, 1)).normalize();
    for (let j = 0; j < 3; j++) {
      _b.copy(_a).addScaledVector(_c, THUMB[j] * sc * 1.15);
      S_.setMatrixAt(si++, seg(_a, _b, THUMB[3] * sc * (1 - j * 0.15), _n));
      B_.setMatrixAt(bi++, ball(_a, THUMB[3] * sc * (1 - j * 0.15)));
      _a.copy(_b);
      _c.addScaledVector(_n, 0.5 * gc).addScaledVector(_s, -a.hand * 0.25 * gc).normalize();
    }
  }
}

export class Chase {
  constructor() {
    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0x000000, 1.4, 3.8);
    const cam = this.cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 40);
    // one hard light from above, a cold rim from behind, almost no fill
    const key = this.key = new THREE.SpotLight(0xfff4e6, 7, 6, 0.36, 0.7, 1.6);
    key.position.set(0.05, 2.4, 0.15); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.setScalar(COARSE ? 512 : 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
    s.add(key, key.target);
    const rim = this.rim = new THREE.SpotLight(0xc8d8ff, 5, 5, 0.6, 0.8, 1.5); rim.position.set(-0.8, 0.7, -1.4); rim.target.position.set(0, 0.2, 0); s.add(rim, rim.target);
    s.add(new THREE.HemisphereLight(0x303238, 0x000000, 0.25));
    // wet black boards that fall away into nothing
    const { c, ctx } = makeCanvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#555555'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const fade = new THREE.CanvasTexture(c);
    const boards = makeCanvas(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) { const v = 34 + ((x / 16) | 0) * 4 + Math.random() * 14 + (x % 16 === 0 ? -20 : 0); boards.ctx.fillStyle = `rgb(${v},${v * 0.9},${v * 0.8})`; boards.ctx.fillRect(x, y, 1, 1); }
    this.boardTex = new THREE.CanvasTexture(boards.c); this.boardTex.wrapS = this.boardTex.wrapT = THREE.RepeatWrapping; this.boardTex.repeat.set(3, 6);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: this.boardTex, alphaMap: fade, transparent: true, roughness: 0.62, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    // dust in the light, streaming past
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 3; pos[i * 3 + 1] = Math.random() * 1.6; pos[i * 3 + 2] = (Math.random() - 0.5) * 1.6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd8d0c0, size: 0.008, transparent: true, opacity: 0.55, depthWrite: false }));
    s.add(this.dust);
    // Mochi, side-on, running toward -x
    this.cat = new CatModel();
    s.add(this.cat.root);
    this.cat.root.rotation.y = Math.PI / 2;
    this.cat.t = Object.assign(this.cat.defaultPose(), { tailUp: 0.1, earFlat: 0.2 });
    this.arms = new Arms(s);
    this.mode = 'load';      // load | chase | off
    this.speed = 1.9; this.t = 0; this.ready = false; this.stopT = 0;
    this.camK = 0; this.side = 0; this.z = 0; this.vz = 0; this.leap = null; this.events = []; this.spawnT = 1; this.threat = 0;
    this.camPos = LOAD.p.clone(); this.camLook = LOAD.l.clone();
  }

  // the menu begins: hands rise out of the dark around her and she bolts
  start(intro) {
    this.mode = 'chase'; this.t0 = this.t; this.intro = intro;
    this.events.length = 0; this.leap = null; this.arms.clear();
    this.spawnT = intro ? 0.15 : 0.4; this.boltT = intro ? 1.1 : 0;
    if (!intro) { this.camK = 1; this.speed = RUN; this.stopT = 0; }
    // first, slowly, a ring of hands in the dark around where she sits
    if (intro) for (let i = 0; i < 4; i++) this.spawn(i % 2 ? 'lurk' : 'rise', 0.9 + i * 0.25);
  }
  stop() { this.mode = 'off'; this.arms.clear(); this.leap = null; }
  // you chose: every hand in the dark goes for her at once
  burst() { const k = ['side', 'below', 'side', 'behind', 'side', 'below', 'lurk', 'lurk']; k.forEach((kind, i) => this.spawn(kind, 0.42 + i * 0.05)); }

  // ------------------------------------------------------------- arms
  spawn(kind, reach) {
    const a = this.arms.free(); if (!a) return;
    const R = Math.random, z = this.z;
    a.on = true; a.kind = kind; a.t = 0; a.seed = R() * 100; a.sc = 0.95 + R() * 0.3; a.hand = R() < 0.5 ? 1 : -1;
    a.reach = reach || 0.55 + R() * 0.3; a.linger = 0.25 + R() * 0.5; a.twitch = 1; a.planted = false; a.anchored = true; a.lunge = 0.4;
    a.regrasp = R() < 0.35;
    const sd = R() < 0.5 ? 1 : -1;
    // where the shoulder hides, where it lunges, and what the hand goes for
    if (kind === 'side') {
      // a corridor of them: they come in beside the lens and slide back past her as they reach
      const x = -0.95 + R() * 0.7;
      a.S0.set(x, 0.12 + R() * 0.45, sd * (0.85 + R() * 0.25)); a.lunge = 0.45;
      a.P.set(-0.05 + R() * 0.15, 0.2 + R() * 0.06, z + sd * 0.04);
      a.pole.set(0, -0.35, sd).normalize();   // elbow out and down, like something crawling
    } else if (kind === 'below') {
      a.S0.set(-0.95 + R() * 0.3, -0.6, z + (R() - 0.5) * 0.4);
      a.P.set(0.02, 0.24 + R() * 0.08, z);
      a.pole.set(-1, 0, sd).normalize(); a.lunge = 0.3;
    } else if (kind === 'behind') {
      // these ones keep up with her
      a.S0.set(0.95 + R() * 0.3, 0.15 + R() * 0.35, z + (R() - 0.5) * 0.9); a.anchored = false;
      a.P.set(0.2 + R() * 0.12, 0.2 + R() * 0.05, z);
      a.pole.set(0.5, 0.7, 0).normalize();
    } else if (kind === 'rise') {
      // the intro: arms come up slowly around her while she sits
      const ang = R() * Math.PI * 2;
      a.S0.set(Math.cos(ang) * 1.1, -0.5, Math.sin(ang) * 0.9); a.anchored = false;
      a.P.set(Math.cos(ang) * 0.3, 0.3 + R() * 0.2, Math.sin(ang) * 0.25);
      a.pole.set(Math.cos(ang), 0.3, Math.sin(ang)).normalize(); a.reach = reach || 1.6; a.linger = 0.4; a.lunge = 0.45;
    } else {
      // out in the dark, grasping at nothing
      a.S0.set(-1.2 + R() * 2.6, 0.05 + R() * 0.6, sd * (1.4 + R() * 0.6));
      a.P.copy(a.S0).add(V((R() - 0.5) * 0.4, 0.15 + R() * 0.2, -sd * (0.5 + R() * 0.3)));
      a.pole.set(0, -0.2, sd).normalize();
    }
    a.target = V(0, 0.18, z); a.dz = a.P.z - z;
    a.out.subVectors(a.P, a.S0).setY(0).normalize();
    a.S.copy(a.S0); a.W.copy(a.S0);
    this.arms.tint(a);
    // she sees it coming, a beat before the hand closes
    if (kind === 'side' || kind === 'below' || kind === 'behind') this.events.push({ at: this.t + a.reach - 0.2, kind, sd });
  }

  stepArm(a, dt) {
    a.t += dt;
    const flow = RUN * dt * (this.speed / RUN);
    if (a.anchored) { a.S0.x += flow; if (a.planted) a.P.x += flow; }
    a.target.set(0, 0.17 + (this.leapY || 0), this.z);
    const t = a.t, T1 = a.reach, T2 = T1 + 0.15, T3 = T2 + a.linger, T4 = T3 + 0.85;
    let out, g, k;
    if (t < T1) {
      // the snatch accelerates; the hand tracks her until it commits
      k = (t / T1) ** 2.2; out = smoothstep(0, T1 * 0.8, t); g = -0.25 + Math.sin(t * 7 + a.seed) * 0.08;
      if (a.kind !== 'lurk' && a.kind !== 'rise' && t < T1 - 0.25) a.P.z = damp(a.P.z, this.z + a.dz, 6, dt);
    } else if (t < T2) { k = 1; out = 1; g = lerp(-0.25, 1.05, Math.sqrt((t - T1) / 0.15)); a.planted = true; }
    else if (t < T3) { k = 1; out = 1; const q = (t - T2) / a.linger; g = a.regrasp ? 0.55 + 0.5 * Math.abs(Math.cos(q * Math.PI * 1.5)) : 1.05 + Math.sin(t * 40) * 0.04; }
    else if (t < T4) { const q = smoothstep(T3, T4, t); k = 1 - q; out = 1 - q * 1.8; g = lerp(1, 0.4, q); a.twitch = 1 - q; }
    else { a.on = false; this.arms.hide(a); return; }
    a.S.copy(a.S0).addScaledVector(a.out, out * a.lunge);
    if (a.kind === 'below' || a.kind === 'rise') a.S.y += out * 0.25;
    // the wrist starts tucked by the shoulder and goes for the point
    _c.copy(a.S).addScaledVector(_d.subVectors(a.P, a.S).normalize(), 0.12 * a.sc);
    a.W.copy(_c).lerp(a.P, k);
    if (t > T1 && t < T3) a.W.addScaledVector(_d, Math.sin(t * 31 + a.seed) * 0.004);
    this.arms.draw(a, g, this.t);
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    const cat = this.cat, cam = this.cam, chase = this.mode === 'chase';
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    let run, pose;
    if (!chase) {
      // loading: she runs; once everything is built she slows, stops, sits and looks at you
      if (this.ready) this.stopT += dt;
      run = this.ready ? Math.max(0, 1.9 - this.stopT * 1.1) : 1.9;
      pose = { sit: this.ready && this.stopT > 2 ? 1 : 0, headYaw: this.ready ? clamp(this.stopT - 1.2, 0, 1) * 0.9 : 0, headPitch: this.ready ? -0.1 : 0.05, tailUp: this.speed > 1 ? 0.05 : 0.35, earFlat: 0.2, puff: 0, pupil: 0.25 };
    } else {
      const ct = this.t - this.t0;
      const bolted = ct > this.boltT;
      if (!bolted) {
        // she has seen them: ears flat, fur up, a hiss, then she runs
        pose = { sit: 1, headYaw: 0.9 - ct * 0.6, headPitch: -0.1, earFlat: 1, puff: 1, tailUp: 0.2, pupil: 0.9, jaw: ct > 0.5 ? 0.7 : 0, arch: 0.4 };
        if (ct > 0.5 && !this.hissed) { this.hissed = true; sfx('hiss', { vol: 0.6 }); }
        run = 0;
      } else {
        this.hissed = false;
        // her flight: ears back, tail out straight, eyes black
        pose = { sit: 0, headYaw: 0, headPitch: 0.1, earFlat: 0.9, puff: 0.55 + this.threat * 0.4, tailUp: 0.02, tailCurve: 0, tailSway: 0.05, pupil: 0.95, jaw: this.threat > 0.6 ? 0.45 : 0, arch: 0 };
        run = RUN + this.threat * 0.5;
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          const busy = this.events.length > 1, r = Math.random();
          this.spawn(busy ? 'lurk' : r < 0.42 ? 'side' : r < 0.62 ? 'below' : r < 0.77 ? 'behind' : 'lurk');
          this.spawnT = 0.18 + Math.random() * 0.36;
        }
        // dodges: away from a hand at her side, over one from below
        for (let i = this.events.length - 1; i >= 0; i--) {
          const e = this.events[i]; if (this.t < e.at) continue;
          this.events.splice(i, 1);
          this.threat = 1;
          if (e.kind === 'below' || (e.kind === 'behind' && Math.random() < 0.4)) { if (!this.leap) this.leap = { t: 0, dur: 0.46, h: 0.2 + Math.random() * 0.06 }; }
          else this.side = clamp(-e.sd * (0.16 + Math.random() * 0.12), -0.28, 0.28);
          if (Math.random() < 0.25) sfx('whoosh', { vol: 0.12, rate: 0.7 + Math.random() * 0.3 });
        }
        if (Math.random() < dt * 0.6) this.side = (Math.random() - 0.5) * 0.3;
      }
      this.threat = Math.max(0, this.threat - dt * 1.2);
    }
    this.speed = damp(this.speed, run, 3, dt);
    // swerve and leap
    const z0 = this.z;
    this.z = damp(this.z, chase ? this.side : 0, 5, dt);
    this.vz = damp(this.vz, (this.z - z0) / Math.max(dt, 1e-3), 10, dt);
    let ly = 0, lp = 0;
    if (this.leap) {
      const L = this.leap; L.t += dt; const p = clamp(L.t / L.dur);
      ly = Math.sin(Math.PI * p) * L.h; lp = -0.35 * Math.cos(Math.PI * p) * Math.sin(Math.PI * p) * 2;
      if (p >= 1) this.leap = null;
    }
    this.leapY = ly;
    cat.root.position.set(0, ly, this.z);
    cat.root.rotation.y = Math.PI / 2 + clamp(this.vz / Math.max(this.speed, 0.5), -0.6, 0.6) * 0.9;
    cat.set({ ...pose, bodyPitch: lp, stretch: this.leap && this.leap.t < this.leap.dur * 0.55 ? 0.7 : 0, sideBend: clamp(this.vz * 0.8, -0.5, 0.5), roll: clamp(-this.vz * 0.25, -0.2, 0.2) });
    cat.update(dt, { speed: this.leap ? this.speed * 0.6 : this.speed, fast: chase, scared: chase });
    // the floor and the dust stream past to sell the run
    const v = this.speed * 0.9 * dt;
    this.boardTex.offset.y += v;
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i) + v * (0.6 + (i % 5) * 0.15); if (x > 1.5) x -= 3; p.setX(i, x); p.setY(i, p.getY(i) + Math.sin(this.t + i) * 0.0004); }
    p.needsUpdate = true;
    // arms
    if (chase) { for (const a of this.arms.list) if (a.on) this.stepArm(a, dt); this.arms.flush(); }
    // the light drains cold when they come
    this.camK = chase ? Math.min(1, this.camK + dt / 2.6) : 0;
    const ck = smoothstep(0, 1, this.camK);
    this.key.color.setRGB(lerp(1, 0.78, ck), lerp(0.957, 0.85, ck), lerp(0.9, 1, ck));
    this.key.intensity = 7 + ck * 3;
    this.key.position.set(0.05, 2.4, 0.15 + this.z * 0.5); this.key.target.position.set(0, 0, this.z);
    // camera: a slow handheld drift, side-on while loading, low and ahead of her for the chase
    const port = cam.aspect < 1;
    const fov = lerp(LOAD.fov, CHASE.fov, ck) * (port ? 1.15 : 1);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // portrait: stand further back so all of her stays in frame
    const back = port ? lerp(clamp(1.15 / cam.aspect, 1, 2.4), clamp(0.62 / cam.aspect, 1, 1.45), ck) : 1;
    _a.copy(LOAD.p).lerp(CHASE.p, ck); _b.copy(LOAD.l).lerp(CHASE.l, ck);
    _a.sub(_b).multiplyScalar(back).add(_b);
    if (port) _b.y -= 0.12 * ck;
    _a.x += Math.sin(this.t * 0.31) * 0.03; _a.y += Math.sin(this.t * 0.47) * 0.012 + ly * 0.25 * ck; _a.z += this.z * 0.35 * ck;
    _b.z += this.z * 0.6 * ck; _b.y += ly * 0.4 * ck;
    cam.position.copy(_a); cam.lookAt(_b);
    // in landscape she runs on the right third, clear of the options
    const shift = port ? 0 : 0.14 * ck;
    const fo = -shift * 2 * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect * cam.getFilmWidth();
    if (Math.abs(cam.filmOffset - fo) > 1e-3) { cam.filmOffset = fo; cam.updateProjectionMatrix(); }
    this.scene.fog.near = lerp(3, 1.4, ck) * back; this.scene.fog.far = lerp(7, 3.8, ck) * back;
    cam.updateMatrixWorld();
  }
}
