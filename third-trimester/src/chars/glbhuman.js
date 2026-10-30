// Rigged humans from the Quaternius CC0 "Universal Base Characters" body (processed for the
// เฮียผัด! game: clothing shells + atlas UVs) driven by the Quaternius CC0 "Universal Animation
// Library" clips, retargeted at load. Clothes and faces are painted into a 1024² atlas; the face
// region is overridden by an expression sheet so faces blink, talk and emote. Every character gets
// an inverted-hull ink outline to match the sharp inked art style.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../core/assets.js';
import { clamp, damp, lerp, noise1, rng } from '../core/util.js';

// ---------------------------------------------------------------- atlas layout (from the body UVs)
const ATLAS = 1024, INSET = 5;
const R = {
  torso: { x: 0, y: 0, w: 512, h: 400 }, leg: { x: 512, y: 0, w: 288, h: 512 }, arm: { x: 800, y: 0, w: 224, h: 400 },
  face: { x: 0, y: 400, w: 320, h: 320 }, scalp: { x: 320, y: 400, w: 192, h: 160 }, neck: { x: 320, y: 560, w: 192, h: 64 },
  hand: { x: 320, y: 624, w: 192, h: 96 }, foot: { x: 512, y: 512, w: 192, h: 160 }, hair: { x: 704, y: 400, w: 320, h: 272 },
  skirt: { x: 0, y: 720, w: 400, h: 200 }, collar: { x: 784, y: 672, w: 240, h: 48 }, sole: { x: 784, y: 816, w: 120, h: 64 }, ear: { x: 904, y: 816, w: 120, h: 64 },
};
const TORSO_TOP = 1.5, TORSO_BOT = 0.78, LEG_TOP = 1.0, ARM_D0 = -0.06, ARM_D1 = 0.56;
const torsoT = (y) => (TORSO_TOP - y) / (TORSO_TOP - TORSO_BOT);
const legT = (y) => (LEG_TOP - y) / LEG_TOP;
const armT = (d) => (d - ARM_D0) / (ARM_D1 - ARM_D0);
// region-local rect in canvas px
const rect = (reg, s0, t0, s1, t1) => [reg.x + INSET + s0 * (reg.w - 2 * INSET), reg.y + INSET + t0 * (reg.h - 2 * INSET), (s1 - s0) * (reg.w - 2 * INSET), (t1 - t0) * (reg.h - 2 * INSET)];

// ---------------------------------------------------------------- template
export const HT = { ready: false };

function normGeo(g, remap) {
  const out = new THREE.BufferGeometry(), n = g.attributes.position.count;
  out.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(g.attributes.position.array), 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(g.attributes.normal.array), 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(Float32Array.from(g.attributes.uv.array), 2));
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = remap[si.getComponent(i, k)] ?? 0; const w = sw.getComponent(i, k); SW[i * 4 + k] = w; s += w; }
    if (s > 0) for (let k = 0; k < 4; k++) SW[i * 4 + k] /= s;
  }
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  const fat = g.attributes._fat;
  out.setAttribute('afat', new THREE.Float32BufferAttribute(fat ? Float32Array.from(fat.array) : new Float32Array(n), 1));
  out.setIndex(g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i));
  return out;
}

export async function loadHumanTemplate() {
  if (HT.ready) return HT;
  const loader = new GLTFLoader();
  const [body, anims, info] = await Promise.all([
    loader.loadAsync(assetUrl('models/body_m.glb')), loader.loadAsync(assetUrl('models/anims.glb')),
    fetch(assetUrl('models/body_m.json')).then((r) => r.json()),
  ]);
  let sk = null; const meshes = [];
  body.scene.updateMatrixWorld(true);
  body.scene.traverse((o) => { if (o.isSkinnedMesh) { meshes.push(o); sk ??= o.skeleton; } });
  const names = sk.bones.map((b) => b.name), index = {}; names.forEach((n, i) => (index[n] = i));
  const parent = sk.bones.map((b) => (b.parent?.isBone ? names.indexOf(b.parent.name) : -1));
  const restPos = sk.bones.map((b) => b.position.clone()), restQuat = sk.bones.map((b) => b.quaternion.clone()), restScale = sk.bones.map((b) => b.scale.clone());
  const rootBone = sk.bones[parent.indexOf(-1)], armM = rootBone.parent.matrixWorld.clone();
  { const ri = names.indexOf(rootBone.name); new THREE.Matrix4().compose(restPos[ri], restQuat[ri], restScale[ri]).premultiply(armM).decompose(restPos[ri], restQuat[ri], restScale[ri]); }
  const Gq = [], Gp = [];
  for (let i = 0; i < names.length; i++) {
    const p = parent[i];
    if (p < 0) { Gq[i] = restQuat[i].clone(); Gp[i] = restPos[i].clone(); }
    else { Gq[i] = Gq[p].clone().multiply(restQuat[i]); Gp[i] = restPos[i].clone().multiply(restScale[p]).applyQuaternion(Gq[p]).add(Gp[p]); }
  }
  const boneInverses = names.map((_, i) => new THREE.Matrix4().compose(Gp[i], Gq[i], new THREE.Vector3(1, 1, 1)).invert());
  const geos = {};
  for (const m of meshes) {
    const g = normGeo(m.geometry, m.skeleton.bones.map((b) => index[b.name] ?? 0));
    if (!m.matrixWorld.equals(new THREE.Matrix4())) g.applyMatrix4(m.matrixWorld);
    geos[m.name] = g;
  }
  // retarget clips: q' = (Rt · Rs⁻¹) · q ; pelvis translation scaled to this body
  const srcRest = new Map();
  anims.scene.traverse((o) => srcRest.set(o.name, { q: o.quaternion.clone() }));
  anims.scene.updateMatrixWorld(true);
  const srcPelvisY = anims.scene.getObjectByName('pelvis')?.getWorldPosition(new THREE.Vector3()).y || 1;
  const pelvisRatio = Gp[index.pelvis].y / srcPelvisY;
  const clips = new Map(), tq = new THREE.Quaternion(), vq = new THREE.Quaternion();
  for (const clip of anims.animations) {
    const name = clip.name.replace(/_Armature$/, ''), tracks = [];
    for (const tr of clip.tracks) {
      const [node, prop] = tr.name.split('.');
      if (!(node in index) || /leaf|^root$/.test(node)) continue;
      if (prop === 'quaternion') {
        const src = srcRest.get(node), vals = Float32Array.from(tr.values);
        if (src) { tq.copy(restQuat[index[node]]).multiply(src.q.clone().invert()); for (let k = 0; k < vals.length; k += 4) { vq.fromArray(vals, k).premultiply(tq); vq.toArray(vals, k); } }
        tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, tr.times, vals));
      } else if (prop === 'position' && node === 'pelvis') {
        const vals = Float32Array.from(tr.values); for (let k = 0; k < vals.length; k++) vals[k] *= pelvisRatio;
        tracks.push(new THREE.VectorKeyframeTrack(tr.name, tr.times, vals));
      }
    }
    clips.set(name, new THREE.AnimationClip(name, clip.duration, tracks));
  }
  Object.assign(HT, { ready: true, names, index, parent, restPos, restQuat, restScale, boneInverses, Gq, Gp, geos, clips, info, eyeY: info.eyes[0][1], height: info.height });
  return HT;
}

// ---------------------------------------------------------------- looks
export const LOOKS = {
  sunny: { skin: '#a87452', hair: '#151110', hairStyle: 'short', top: 'shell_top_t', sleeve: 'shell_sleeve_short', bottom: 'shell_bot_shorts', shoes: null,
    shirt: '#5d6268', shirtPrint: 'karaoke', pants: '#3a4660', plaid: '#7b3a33', feet: 'slipper', slipper: '#26335a', fat: 0.55, belly: 1, face: 'sunny', age: 41 },
  soldier: { skin: '#d8b49a', hair: '#2a2018', hairStyle: 'none', top: 'shell_top_l', sleeve: 'shell_sleeve_long', bottom: 'shell_bot_loose', shoes: 'boot',
    shirt: '#24272b', pants: '#202326', boot: '#141414', gloves: '#161616', vest: '#1c1f22', fat: 0.35, face: 'masked', helmet: true },
  general: { skin: '#d49a82', hair: '#a8a49e', hairStyle: 'bald', top: 'shell_top_j', sleeve: 'shell_sleeve_long', bottom: 'shell_bot_loose', shoes: 'boot',
    shirt: '#4b5437', pants: '#424a30', boot: '#1a120c', fat: 1, belly: 0.25, face: 'general', cap: true, medals: true, age: 62 },
  gary: { skin: '#8d88a3', spots: '#6a4d8c', hairStyle: 'none', top: 'shell_top_j', sleeve: 'shell_sleeve_long', bottom: 'shell_bot_loose', shoes: null,
    shirt: '#c4ad82', knit: true, pants: '#503e30', feet: 'slipper', slipper: '#6e2a36', fat: 0, face: 'none', alien: true, scale: 1.13 },
};

// ---------------------------------------------------------------- painters
function noiseFill(g, x, y, w, h, alpha, seed = 1, scale = 1) {
  const r = rng(seed); g.save(); g.globalAlpha = alpha;
  for (let i = 0; i < (w * h) / (14 * scale); i++) { const v = r() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${r() * 0.5})`; g.fillRect(x + r() * w, y + r() * h, 1.5 * scale, 1.5 * scale); }
  g.restore();
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

export function paintAtlas(look, which = 'body') {
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
  const g = cv.getContext('2d');
  g.fillStyle = which === 'top' ? look.shirt : which === 'bottom' ? look.pants : look.skin; g.fillRect(0, 0, ATLAS, ATLAS);
  if (which !== 'body') return paintGarment(g, cv, look, which);
  for (const k of ['torso', 'leg', 'arm', 'neck', 'hand', 'foot', 'scalp', 'ear', 'face']) { const [x, y, w, h] = rect(R[k], 0, 0, 1, 1); noiseFill(g, x, y, w, h, 0.18, k.length * 7); }
  if (look.spots) { const r = rng(7); g.fillStyle = look.spots; for (let i = 0; i < 900; i++) { g.globalAlpha = 0.35 + r() * 0.4; g.beginPath(); g.arc(r() * ATLAS, r() * ATLAS, 1 + r() * 3.5, 0, 7); g.fill(); } g.globalAlpha = 1; }
  // knuckle / toe lines
  { const [x, y, w, h] = rect(R.hand, 0.38, 0.62, 0.62, 0.98); g.strokeStyle = shade(look.skin, 0.62); g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + w * (0.2 + i * 0.3), y); g.lineTo(x + w * (0.2 + i * 0.3), y + h); g.stroke(); } }
  return paintBodyExtras(g, cv, look);
}
function fabricFn(g) {
  return (reg, t0, t1, col, { plaid, knit, ribs } = {}) => {
    const [x, y, w, h] = rect(reg, 0, t0, 1, t1);
    g.fillStyle = col; g.fillRect(x, y, w, h);
    if (plaid) {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.globalAlpha = 0.45; g.fillStyle = plaid; for (let i = -2; i < w / 22 + 2; i++) g.fillRect(x + i * 22, y, 7, h);
      g.globalAlpha = 0.35; for (let j = 0; j < h / 22 + 1; j++) g.fillRect(x, y + j * 22, w, 6);
      g.globalAlpha = 0.25; g.fillStyle = '#d9c9a0'; for (let i = 0; i < w / 22 + 1; i++) g.fillRect(x + i * 22 + 12, y, 1.5, h);
      g.restore();
    }
    if (knit) { g.save(); g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let i = 0; i < w; i += 4) g.fillRect(x + i, y, 1.4, h); g.restore(); }
    if (ribs) { g.save(); g.globalAlpha = 0.25; g.fillStyle = '#000'; for (let j = 0; j < h; j += 5) g.fillRect(x, y + j, w, 1.5); g.restore(); }
    noiseFill(g, x, y, w, h, 0.22, (t0 * 100) | 0, 1.2);
  };
}
function paintGarment(g, cv, look, which) {
  const fabric = fabricFn(g);
  if (which === 'bottom') {
    fabric(R.torso, 0, 1, look.pants, { plaid: look.plaid });
    fabric(R.leg, 0, 1, look.pants, { plaid: look.plaid });
    const [bx, by, bw] = rect(R.torso, 0, torsoT(1.0), 1, 0); g.fillStyle = shade(look.pants, 0.55); g.fillRect(bx, by - 6, bw, 10); // waistband
    if (look.shoes === 'boot') { const [x, y, w, h] = rect(R.foot, 0, 0, 1, 1); g.fillStyle = look.boot; g.fillRect(x, y, w, h); noiseFill(g, x, y, w, h, 0.25, 3); const [lx, ly, lw, lh] = rect(R.leg, 0, legT(0.22), 1, 1); g.fillRect(lx, ly, lw, lh);
      const [sx, sy, sw, sh] = rect(R.sole, 0, 0, 1, 1); g.fillStyle = '#0a0a0a'; g.fillRect(sx, sy, sw, sh); }
    return cv;
  }
  // top: torso + arms fully in the shirt fabric, then details
  fabric(R.torso, 0, 1, look.shirt, { knit: look.knit });
  fabric(R.arm, 0, 1, look.shirt, { knit: look.knit });
  { const [x, y, w] = rect(R.torso, 0, 0.985, 1, 1); g.fillStyle = shade(look.shirt, 0.72); g.fillRect(x, y, w, 6); }
  { const [x, y, w] = rect(R.arm, 0, 0.985, 1, 1); g.fillStyle = shade(look.shirt, 0.72); g.fillRect(x, y, w, 5); }
  { const [x, y, w] = rect(R.torso, 0, 0, 1, 0.02); g.fillStyle = shade(look.shirt, 0.7); g.fillRect(x, y, w, 7); } // collar rib
  return paintTopDetails(g, cv, look);
}
function paintTopDetails(g, cv, look) {
  const hemT = 1;
  // shirt print: Sunny's faded karaoke-bar tee
  if (look.shirtPrint === 'karaoke') {
    const [x, y, w, h] = rect(R.torso, 0.36, torsoT(1.36), 0.64, torsoT(1.16));
    g.save(); g.globalAlpha = 0.7; g.fillStyle = '#c7b98f'; g.font = `bold ${Math.round(h * 0.28)}px Spectral, serif`; g.textAlign = 'center';
    g.fillText('KARAOKE', x + w / 2, y + h * 0.4); g.font = `italic ${Math.round(h * 0.22)}px Spectral, serif`; g.fillText('KING 2019', x + w / 2, y + h * 0.75);
    g.strokeStyle = '#c7b98f'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h * 0.12, h * 0.1, 0, 7); g.stroke(); g.restore();
  }
  if (look.knit) { // cardigan buttons down the front, pocket
    const [x, y, w, h] = rect(R.torso, 0.49, 0.1, 0.51, hemT); g.fillStyle = shade(look.shirt, 0.6); g.fillRect(x - 3, y, 6 + w, h);
    g.fillStyle = '#3a2a1c'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + w / 2, y + 12 + i * (h - 20) / 4, 5, 0, 7); g.fill(); }
  }
  if (look.medals) {
    const [x, y, w, h] = rect(R.torso, 0.56, torsoT(1.38), 0.68, torsoT(1.28));
    const cols = ['#b3261e', '#2257a3', '#e3c04a', '#2f7a3b']; for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r2 + c) % 4]; g.fillRect(x + c * w / 4, y + r2 * h / 3, w / 4 - 2, h / 3 - 2); }
    g.fillStyle = '#d8b04a'; for (let i = 0; i < 4; i++) { const [bx, by] = rect(R.torso, 0.5, torsoT(1.32 - i * 0.1), 0.5, 0); g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
    const [sx, sy, sw] = rect(R.torso, 0.3, torsoT(1.43), 0.7, 0); g.fillStyle = '#d8b04a'; g.fillRect(sx, sy, sw, 5);
  }
  if (look.vest) { // tactical vest: darker block over the chest with pouches
    const [x, y, w, h] = rect(R.torso, 0, torsoT(1.42), 1, torsoT(1.0)); g.fillStyle = look.vest; g.fillRect(x, y, w, h);
    g.fillStyle = shade(look.vest, 1.5); for (let i = 0; i < 4; i++) { const [px, py, pw, ph] = rect(R.torso, 0.36 + i * 0.075, torsoT(1.12), 0.36 + i * 0.075 + 0.06, torsoT(1.0)); g.fillRect(px, py, pw, ph); g.fillStyle = '#000'; g.fillRect(px, py, pw, 3); g.fillStyle = shade(look.vest, 1.5); }
    g.fillStyle = '#b8b8b8'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; { const [px, py, pw] = rect(R.torso, 0.4, torsoT(1.34), 0.6, 0); g.fillText('DTP', px + pw / 2, py); }
    { const [px, py, pw] = rect(R.torso, 0.9, torsoT(1.32), 1, 0); g.fillText('DTP', px + pw / 2, py); }
  }
  return cv;
}
function paintBodyExtras(g, cv, look) {
  // under-garment colouring so the shells' necklines and hems never reveal stray skin
  const fabric = fabricFn(g);
  if (look.bottom) {
    const legEnd = look.bottom === 'shell_bot_shorts' ? legT(0.6) : look.bottom === 'shell_bot_knee' ? legT(0.5) : 1;
    fabric(R.torso, torsoT(1.0), 1, look.pants, { plaid: look.plaid }); fabric(R.leg, 0, legEnd, look.pants, { plaid: look.plaid });
  }
  if (look.top) {
    fabric(R.torso, 0, torsoT(look.top === 'shell_top_j' ? 0.86 : 1.0), look.shirt, { knit: look.knit });
    // crew neck: skin above the collar line at the front only
    const [x, y, w, h] = rect(R.torso, 0.4, 0, 0.6, torsoT(1.46)); g.fillStyle = look.skin; g.beginPath(); g.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI); g.fill();
    g.strokeStyle = shade(look.shirt, 0.65); g.lineWidth = 4; g.beginPath(); g.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI); g.stroke();
    const armEnd = look.sleeve === 'shell_sleeve_long' ? 1 : look.sleeve === 'shell_sleeve_short' ? armT(0.12) : look.sleeve === 'shell_sleeve_rolled' ? armT(0.26) : armT(0.03);
    fabric(R.arm, 0, armEnd, look.shirt, { knit: look.knit });
  }
  // feet / shoes
  if (look.shoes === 'boot') { const [x, y, w, h] = rect(R.foot, 0, 0, 1, 1); g.fillStyle = look.boot; g.fillRect(x, y, w, h); const [lx, ly, lw, lh] = rect(R.leg, 0, legT(0.2), 1, 1); g.fillRect(lx, ly, lw, lh); noiseFill(g, x, y, w, h, 0.2, 3); }
  else if (look.feet === 'slipper') { const [x, y, w, h] = rect(R.foot, 0.3, 0.55, 0.7, 0.8); g.fillStyle = look.slipper; g.fillRect(x, y, w, h); const [sx, sy, sw, sh] = rect(R.sole, 0, 0, 1, 1); g.fillRect(sx, sy, sw, sh); }
  if (look.gloves) { const [x, y, w, h] = rect(R.hand, 0, 0, 1, 1); g.fillStyle = look.gloves; g.fillRect(x, y, w, h); }
  // scalp / hairline
  if (look.hairStyle === 'short') {
    const [x, y, w, h] = rect(R.scalp, 0, 0, 1, 0.82); g.fillStyle = look.hair; g.fillRect(x, y, w, h); noiseFill(g, x, y, w, h, 0.3, 11);
    const [fx, fy, fw] = rect(R.face, 0, 0, 1, 0.12); g.fillRect(fx, fy, fw, (R.face.h - 10) * 0.16);
  } else if (look.hairStyle === 'bald') {
    const [x, y, w, h] = rect(R.scalp, 0, 0.5, 1, 0.85); g.fillStyle = look.hair; g.globalAlpha = 0.8; g.fillRect(x, y, w, h); g.globalAlpha = 1;
  }
  return cv;
}

// Face expression sheet: 4×3 cells of 256px, painted in the eye-aligned face-image frame
// (eyes at (0.36,0.44)/(0.64,0.44), mouth at (0.5,0.73)).
export const FACE_CELLS = ['neutral', 'blink', 'talkA', 'talkB', 'happy', 'fear', 'pain', 'angry', 'shock', 'sleepy', 'smug', 'scream'];
export function paintFaceSheet(look) {
  const C = 256, cv = document.createElement('canvas'); cv.width = C * 4; cv.height = C * 3;
  const g = cv.getContext('2d');
  if (look.face === 'none' || look.face === 'masked') return cv;
  const ink = '#1a1110', skinD = shade(look.skin, 0.72), lip = shade(look.skin, 0.8);
  FACE_CELLS.forEach((name, i) => {
    g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.scale(C / 100, C / 100);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const E = { open: 1, brow: 0, tilt: 0, mouth: 'line', smile: 0 };
    if (name === 'blink') E.open = 0;
    if (name === 'sleepy') { E.open = 0.35; E.brow = -1; }
    if (name === 'happy') { E.open = 0.7; E.smile = 1; E.mouth = 'smile'; E.brow = 1; }
    if (name === 'fear') { E.open = 1.25; E.brow = 3; E.tilt = 3; E.mouth = 'o'; }
    if (name === 'pain') { E.open = 0.15; E.brow = 1; E.tilt = 4; E.mouth = 'teeth'; }
    if (name === 'angry') { E.open = 0.75; E.brow = -2; E.tilt = -4; E.mouth = 'frown'; }
    if (name === 'shock') { E.open = 1.35; E.brow = 5; E.mouth = 'big'; }
    if (name === 'smug') { E.open = 0.55; E.brow = 1; E.tilt = -2; E.mouth = 'smirk'; }
    if (name === 'scream') { E.open = 1.3; E.brow = 4; E.tilt = 3; E.mouth = 'scream'; }
    if (name === 'talkA') E.mouth = 'open'; if (name === 'talkB') E.mouth = 'half';
    // stubble / mustache
    if (look.face === 'sunny') { const r = rng(5); g.fillStyle = 'rgba(30,22,18,0.35)'; for (let k = 0; k < 900; k++) { const a = r() * Math.PI, rr = 22 + r() * 18; const x = 50 + Math.cos(a) * rr * 0.95, y = 66 + Math.sin(a) * rr * 0.95; if (y > 64 && y < 98) g.fillRect(x, y, 0.6, 0.6); } for (let k = 0; k < 160; k++) g.fillRect(41 + r() * 18, 66 + r() * 4, 0.6, 0.6); }
    if (look.face === 'general') { g.fillStyle = '#e6e0d6'; g.beginPath(); g.ellipse(50, 67, 12, 3.6, 0, 0, 7); g.fill(); g.strokeStyle = '#8f8a84'; g.lineWidth = 0.6; for (let k = 0; k < 18; k++) { g.beginPath(); g.moveTo(39 + k * 1.2, 65); g.lineTo(38.5 + k * 1.25, 70); g.stroke(); } }
    // eyes
    for (const s of [-1, 1]) {
      const cx = 50 + s * 14, cy = 44, w = 7.4, h = 3.3 * E.open;
      // under-eye bag + crease
      g.strokeStyle = skinD; g.lineWidth = 0.7; g.beginPath(); g.arc(cx, cy + 2, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      if (look.age > 50) { g.beginPath(); g.moveTo(cx + s * 8, cy - 1); g.lineTo(cx + s * 11, cy - 2); g.moveTo(cx + s * 8, cy + 1); g.lineTo(cx + s * 11, cy + 2); g.stroke(); }
      if (E.open > 0.05) {
        g.fillStyle = '#efe7dc'; g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy - h * 2, cx + w, cy); g.quadraticCurveTo(cx, cy + h * 1.2, cx - w, cy); g.fill();
        g.save(); g.clip();
        g.fillStyle = look.iris || '#3b2414'; g.beginPath(); g.arc(cx + s * 0.4, cy - 0.3, 3.4 * Math.min(1, E.open + 0.2), 0, 7); g.fill();
        g.fillStyle = '#060404'; g.beginPath(); g.arc(cx + s * 0.4, cy - 0.3, E.open > 1.2 ? 1.0 : 1.6, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + s * 0.4 + 1.1, cy - 1.4, 0.8, 0, 7); g.fill();
        g.restore();
        g.strokeStyle = ink; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - w - 0.6, cy + 0.3); g.quadraticCurveTo(cx, cy - h * 2 - 0.4, cx + w + 0.6, cy - 0.2); g.stroke();
        g.lineWidth = 0.6; g.beginPath(); g.moveTo(cx - w + 1, cy + 0.5); g.quadraticCurveTo(cx, cy + h * 1.2 + 0.4, cx + w - 1, cy + 0.4); g.stroke();
        g.strokeStyle = skinD; g.lineWidth = 0.6; g.beginPath(); g.moveTo(cx - w + 1, cy - h * 1.6 - 1.4); g.quadraticCurveTo(cx, cy - h * 2.3 - 2.2, cx + w - 1, cy - h * 1.6 - 1.2); g.stroke();
      } else {
        g.strokeStyle = ink; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy + 2.2, cx + w, cy); g.stroke();
      }
      // brows
      const by = cy - 8.5 - E.brow * 0.9;
      g.strokeStyle = look.face === 'general' ? '#bdb7ae' : '#17110e'; g.lineWidth = look.face === 'general' ? 3.2 : 2.4;
      g.beginPath(); g.moveTo(cx - s * 7.5, by + E.tilt * 0.5 * -1); g.quadraticCurveTo(cx, by - 2.2, cx + s * 7.5, by + 1.2 + E.tilt * 0.2); g.stroke();
    }
    // nose
    g.strokeStyle = skinD; g.lineWidth = 0.9; g.beginPath(); g.moveTo(47.5, 48); g.quadraticCurveTo(46, 57, 44.5, 60.5); g.stroke();
    g.strokeStyle = shade(look.skin, 0.55); g.lineWidth = 1.1; g.beginPath(); g.moveTo(45, 61.5); g.quadraticCurveTo(47, 62.6, 48.5, 61.8); g.moveTo(51.5, 61.8); g.quadraticCurveTo(53, 62.6, 55, 61.5); g.stroke();
    // smile lines
    g.strokeStyle = skinD; g.lineWidth = 0.7; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(50 + s * 9, 60); g.quadraticCurveTo(50 + s * 13.5, 67, 50 + s * 12, 75 + E.smile * 0.5); g.stroke(); }
    // mouth
    const my = 73; g.strokeStyle = ink; g.lineWidth = 1.3; g.fillStyle = '#3a1512';
    const lipFill = () => { g.fillStyle = lip; g.beginPath(); g.ellipse(50, my + 2.6, 7, 1.8, 0, 0, 7); g.fill(); };
    switch (E.mouth) {
      case 'line': lipFill(); g.beginPath(); g.moveTo(42.5, my); g.quadraticCurveTo(50, my + 0.8, 57.5, my); g.stroke(); break;
      case 'smile': g.beginPath(); g.moveTo(41, my - 1.5); g.quadraticCurveTo(50, my + 4, 59, my - 1.5); g.stroke(); break;
      case 'smirk': g.beginPath(); g.moveTo(43, my + 0.5); g.quadraticCurveTo(51, my + 1.2, 58, my - 2.2); g.stroke(); break;
      case 'frown': g.beginPath(); g.moveTo(43, my + 1.5); g.quadraticCurveTo(50, my - 1.5, 57, my + 1.5); g.stroke(); break;
      case 'half': g.beginPath(); g.ellipse(50, my + 0.5, 5.5, 1.6, 0, 0, 7); g.fill(); g.stroke(); break;
      case 'open': g.beginPath(); g.ellipse(50, my + 1, 6, 3.6, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#efe7dc'; g.fillRect(46, my - 2.2, 8, 1.3); break;
      case 'o': g.beginPath(); g.ellipse(50, my + 1, 3.2, 3.6, 0, 0, 7); g.fill(); g.stroke(); break;
      case 'big': g.beginPath(); g.ellipse(50, my + 2, 6.5, 6.5, 0, 0, 7); g.fill(); g.stroke(); break;
      case 'scream': g.beginPath(); g.ellipse(50, my + 3, 8, 8.5, 0, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#c23b3b'; g.beginPath(); g.ellipse(50, my + 7, 4.5, 2.5, 0, 0, 7); g.fill(); break;
      case 'teeth': g.fillStyle = '#efe7dc'; g.beginPath(); g.ellipse(50, my + 0.5, 7, 2.3, 0, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(43, my + 0.5); g.lineTo(57, my + 0.5); g.lineWidth = 0.5; g.stroke(); break;
    }
    if (name === 'fear' || name === 'pain' || name === 'scream') { g.fillStyle = 'rgba(160,210,255,0.8)'; g.beginPath(); g.ellipse(68, 34, 1.6, 2.6, -0.3, 0, 7); g.fill(); } // sweat drop
    g.restore();
  });
  return cv;
}

// ---------------------------------------------------------------- materials
const BELLY_GLSL = /* glsl */`
uniform float uBelly; uniform float uFat; uniform float uOutline;
attribute float afat; attribute float alayer; varying float vLayer;
float smaxf(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return max(a, b) + h * h * k * 0.25; }
vec3 bellyPos(vec3 p);
vec3 bellyDir(vec3 p) { vec3 c = vec3(0.0, 1.03, 0.1); vec3 d = p - c; d.y *= 0.8; return normalize(d + vec3(0.0, 0.0, 1e-4)); }
vec3 bellyPos(vec3 p) {
  if (uBelly <= 0.001) return p;
  vec3 c = vec3(0.0, 1.03, 0.1); vec3 d = p - c; d.y *= 0.8;
  float L = length(d); float Rb = 0.185 * uBelly;
  float nl = smaxf(L, Rb, 0.07);
  vec3 q = c + normalize(d + vec3(0.0, 0.0, 1e-4)) * nl; q.y = c.y + (q.y - c.y) / 0.8;
  float gate = smoothstep(0.75, 0.86, p.y) * (1.0 - smoothstep(1.28, 1.38, p.y));
  float moved = clamp((nl - L) * 30.0, 0.0, 1.0) * gate;
  q += normalize(d + vec3(0.0, 0.0, 1e-4)) * min(alayer, 1.0) * 0.016 * moved;
  return mix(p, q, gate);
}
vec3 bellyN(vec3 n, vec3 p) { vec3 bp = bellyPos(p); float moved = clamp(length(bp - p) * 40.0, 0.0, 1.0); return normalize(mix(n, bellyDir(p), moved * 0.8)); }`;
function injectBody(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + BELLY_GLSL)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      objectNormal = bellyN(objectNormal, position);`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 bp = bellyPos(position); float inBelly = clamp(length(bp - position) * 60.0, 0.0, 1.0) * step(alayer, 0.5);
        transformed = bp + bellyN(normal, position) * (afat * uFat * 0.025 + uOutline * (1.0 - inBelly * 0.9)); }
      vLayer = alayer;`);
}

export function bodyMaterial(atlasTex, topTex, botTex, faceTex, look) {
  const m = new THREE.MeshStandardMaterial({ map: atlasTex, roughness: 0.78, metalness: 0, envMapIntensity: 0.55 });
  m.userData.u = { uTop: { value: topTex }, uBot: { value: botTex }, uBelly: { value: look.belly || 0 }, uFat: { value: look.fat || 0 }, uOutline: { value: 0 }, uFace: { value: faceTex }, uFaceCell: { value: 0 },
    uRimColor: { value: new THREE.Color(0.55, 0.65, 0.95) }, uRim: { value: look.alien ? 0.9 : 0.35 }, uGlow: { value: 0 }, uGlowColor: { value: new THREE.Color(0.5, 1, 0.7) }, uHasFace: { value: faceTex ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.u);
    injectBody(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLayer; uniform sampler2D uTop; uniform sampler2D uBot; uniform sampler2D uFace; uniform float uFaceCell; uniform float uHasFace; uniform vec3 uRimColor; uniform float uRim; uniform float uGlow; uniform vec3 uGlowColor;')
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = vLayer < 0.5 ? texture2D(map, vMapUv) : vLayer < 2.5 ? texture2D(uTop, vMapUv) : texture2D(uBot, vMapUv);
        diffuseColor *= sampledDiffuseColor;
        if (uHasFace > 0.5 && vLayer < 0.5) {
          vec2 fr = (vMapUv * 1024.0 - vec2(5.0, 405.0)) / 310.0;
          if (fr.x >= 0.0 && fr.x <= 1.0 && fr.y >= 0.0 && fr.y <= 1.0) {
            vec2 cell = vec2(mod(uFaceCell, 4.0), floor(uFaceCell / 4.0));
            vec4 f = texture2D(uFace, (cell + clamp(fr, 0.004, 0.996)) / vec2(4.0, 3.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb, f.a);
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += uRimColor * rim * uRim * (0.4 + 0.6 * diffuseColor.rgb) + uGlowColor * uGlow * (0.3 + rim); }`);
  };
  return m;
}
export function outlineMaterial(look, thickness = 0.0055) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0b0809, side: THREE.BackSide });
  m.userData.u = { uBelly: { value: look.belly || 0 }, uFat: { value: look.fat || 0 }, uOutline: { value: thickness } };
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, m.userData.u); injectBody(sh); };
  return m;
}

// ---------------------------------------------------------------- geometry per look
function mergeLook(look) {
  const parts = [['body_hi', 0]];
  if (look.top) parts.push([look.top, 1]);
  if (look.sleeve) parts.push([look.sleeve, 2]);
  if (look.bottom) parts.push([look.bottom, 3]);
  if (look.shoes === 'boot') parts.push(['shell_shoe', 4]);
  const pos = [], nrm = [], uv = [], si = [], sw = [], fat = [], layer = [], idx = [];
  let base = 0;
  for (const [name, lay] of parts) {
    const g = HT.geos[name]; if (!g) continue;
    const n = g.attributes.position.count;
    pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    si.push(...g.attributes.skinIndex.array); sw.push(...g.attributes.skinWeight.array); fat.push(...g.attributes.afat.array);
    for (let i = 0; i < n; i++) layer.push(lay);
    for (const i of g.index.array) idx.push(i + base);
    base += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setAttribute('afat', new THREE.Float32BufferAttribute(fat, 1)); g.setAttribute('alayer', new THREE.Float32BufferAttribute(layer, 1));
  g.setIndex(idx);
  // aliens: tuck the human head inside the neck (the alien skull is a separate mesh)
  if (look.alien) {
    const p = g.attributes.position, hi = HT.index.Head, hp = HT.Gp[hi];
    for (let i = 0; i < p.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (g.attributes.skinIndex.getComponent(i, k) === hi) w += g.attributes.skinWeight.getComponent(i, k);
      if (w > 0.4 && p.getY(i) > hp.y + 0.02) { p.setXYZ(i, hp.x + (p.getX(i) - hp.x) * 0.35, hp.y + 0.02 + (p.getY(i) - hp.y - 0.02) * 0.2, hp.z + (p.getZ(i) - hp.z) * 0.35); }
    }
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.4);
  return g;
}

// short hair cap: head triangles above the hairline, pushed out along their normals
function hairCap(look) {
  const g = HT.geos.body_hi, p = g.attributes.position, n = g.attributes.normal, hi = HT.index.Head, eyeY = HT.eyeY;
  const keep = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (g.attributes.skinIndex.getComponent(i, k) === hi) w += g.attributes.skinWeight.getComponent(i, k);
    const y = p.getY(i), z = p.getZ(i);
    const front = clamp((z - 0.0) / 0.075, 0, 1);
    const line = z < -0.02 ? eyeY - 0.075 : eyeY + 0.062 * front + 0.005 * (1 - front) - Math.abs(p.getX(i)) * 0.05 * front;
    keep[i] = w > 0.5 && y > line ? 1 : 0;
  }
  const idx = [], ia = g.index.array;
  for (let t = 0; t < ia.length; t += 3) if (keep[ia[t]] && keep[ia[t + 1]] && keep[ia[t + 2]]) idx.push(ia[t], ia[t + 1], ia[t + 2]);
  const out = new THREE.BufferGeometry();
  const P = Float32Array.from(p.array);
  for (let i = 0; i < p.count; i++) { const th = 0.006 + 0.004 * Math.max(0, p.getY(i) - eyeY) * 10; P[i * 3] += n.getX(i) * th; P[i * 3 + 1] += n.getY(i) * th; P[i * 3 + 2] += n.getZ(i) * th; }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', g.attributes.normal.clone());
  out.setAttribute('uv', g.attributes.uv.clone()); out.setAttribute('skinIndex', g.attributes.skinIndex.clone()); out.setAttribute('skinWeight', g.attributes.skinWeight.clone());
  out.setAttribute('afat', new THREE.Float32BufferAttribute(new Float32Array(p.count), 1)); out.setAttribute('alayer', new THREE.Float32BufferAttribute(new Float32Array(p.count), 1));
  out.setIndex(idx);
  return out;
}

// ---------------------------------------------------------------- the character
const tmpV = new THREE.Vector3();
export class GlbHuman {
  constructor(kind, lookOverrides = {}) {
    const look = this.look = { ...LOOKS[kind], ...lookOverrides };
    this.kind = kind;
    this.root = new THREE.Group(); this.root.name = kind;
    // bones
    const bones = HT.names.map((n, i) => { const b = new THREE.Bone(); b.name = n; b.position.copy(HT.restPos[i]); b.quaternion.copy(HT.restQuat[i]); b.scale.copy(HT.restScale[i]); return b; });
    HT.parent.forEach((p, i) => { if (p >= 0) bones[p].add(bones[i]); else this.root.add(bones[i]); });
    this.bones = bones; this.byName = Object.fromEntries(bones.map((b) => [b.name, b]));
    this.skeleton = new THREE.Skeleton(bones, HT.boneInverses.map((m) => m.clone()));
    // textures
    const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const atlas = tex(paintAtlas(look, 'body')), top = tex(paintAtlas(look, 'top')), bot = tex(paintAtlas(look, 'bottom'));
    const face = look.face && look.face !== 'none' && look.face !== 'masked' ? new THREE.CanvasTexture(paintFaceSheet(look)) : null;
    if (face) { face.flipY = false; face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = 8; }
    this.material = bodyMaterial(atlas, top, bot, face, look);
    this.outlineMat = outlineMaterial(look);
    const geo = mergeLook(look);
    this.mesh = new THREE.SkinnedMesh(geo, this.material); this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.castShadow = this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.outline = new THREE.SkinnedMesh(geo, this.outlineMat); this.outline.bind(this.skeleton, new THREE.Matrix4()); this.outline.frustumCulled = false;
    this.outline.layers.set(2);
    this.root.add(this.mesh, this.outline);
    if (look.hairStyle === 'short') {
      const hg = hairCap(look);
      const hm = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.65 });
      this.hair = new THREE.SkinnedMesh(hg, hm); this.hair.bind(this.skeleton, new THREE.Matrix4()); this.hair.frustumCulled = false; this.hair.castShadow = true;
      const ho = new THREE.SkinnedMesh(hg, outlineMaterial({ belly: 0, fat: 0 }, 0.004)); ho.bind(this.skeleton, new THREE.Matrix4()); ho.frustumCulled = false; ho.layers.set(2);
      this.root.add(this.hair, ho);
    }
    if (look.scale) this.root.scale.setScalar(look.scale);
    this.extras = {};
    this.root.updateMatrixWorld(true);
    this.anim = new GlbAnimator(this);
  }
  // Attach a rigid mesh authored in the character's rest model space to a bone.
  attach(boneName, obj) {
    const i = HT.index[boneName], b = this.byName[boneName];
    const inv = HT.Gq[i].clone().invert();
    obj.position.sub(HT.Gp[i]).applyQuaternion(inv);
    obj.quaternion.premultiply(inv);
    b.add(obj); return obj;
  }
  bonePos(name, out = new THREE.Vector3()) { return this.byName[name].getWorldPosition(out); }
  headTop(out = new THREE.Vector3()) { return this.bonePos('Head', out).add(new THREE.Vector3(0, 0.25 * (this.look.scale || 1), 0)); }
  set belly(v) { this.material.userData.u.uBelly.value = v; this.outlineMat.userData.u.uBelly.value = v; }
  get belly() { return this.material.userData.u.uBelly.value; }
  set glow(v) { this.material.userData.u.uGlow.value = v; }
  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = v; }
  update(dt) { this.anim.update(dt); }
}

// ---------------------------------------------------------------- animation
// Semantic poses → clips (+ procedural IK recipes layered on top).
const CLIPS = {
  idle: 'Idle_Loop', pregnant: 'Idle_Loop', talk: 'Idle_Talking_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', sitType: 'Sitting_Idle_Loop', sitBack: 'Sitting_Idle_Loop',
  sitEnter: 'Sitting_Enter', sitExit: 'Sitting_Exit', crouch: 'Crouch_Idle_Loop', crouchWalk: 'Crouch_Fwd_Loop', interact: 'Interact', pickup: 'PickUp_Table', kneel: 'Fixing_Kneeling',
  hit: 'Hit_Chest', hitHead: 'Hit_Head', die: 'Death01', floored: 'Death01', punch: 'Punch_Cross', jab: 'Punch_Jab', push: 'Push_Loop', aim: 'Pistol_Aim_Neutral', aimDown: 'Pistol_Aim_Down',
  aimUp: 'Pistol_Aim_Up', pistol: 'Pistol_Idle_Loop', shoot: 'Pistol_Shoot', reload: 'Pistol_Reload', dance: 'Dance_Loop', cheer: 'Dance_Loop', levitate: 'Spell_Simple_Idle_Loop',
  spellIn: 'Spell_Simple_Enter', spell: 'Spell_Simple_Shoot', torch: 'Idle_Torch_Loop', walkFormal: 'Walk_Formal_Loop', roll: 'Roll', jump: 'Jump_Start', drive: 'Driving_Loop',
  holdBaby: 'Idle_Loop', rock: 'Idle_Loop', cower: 'Crouch_Idle_Loop', reach: 'Idle_Loop', struggle: 'Push_Loop', handsBehind: 'Idle_Loop', dragged: 'Crouch_Fwd_Loop', limp: 'Death01',
  phone: 'Sitting_Idle_Loop', point: 'Idle_Loop', armsCrossed: 'Idle_Loop', stir: 'Idle_Loop', eat: 'Sitting_Idle_Loop', lie: 'Death01', tired: 'Idle_Loop', handsUp: 'Idle_Loop', salute: 'Idle_Loop',
};
const ONCE = new Set(['Interact', 'PickUp_Table', 'Hit_Chest', 'Hit_Head', 'Death01', 'Punch_Cross', 'Punch_Jab', 'Pistol_Shoot', 'Pistol_Reload', 'Sitting_Enter', 'Sitting_Exit', 'Spell_Simple_Enter', 'Spell_Simple_Shoot', 'Roll', 'Jump_Start']);
const CLAMP = new Set(['Death01', 'Sitting_Enter', 'Spell_Simple_Enter']);
const EXPR_CELL = { neutral: 0, blink: 1, happy: 4, fear: 5, worried: 5, pain: 6, angry: 7, shock: 8, sleepy: 9, closed: 1, smug: 10, scream: 11 };

export class GlbAnimator {
  constructor(h) {
    this.h = h; this.mixer = new THREE.AnimationMixer(h.root);
    this.actions = new Map(); this.current = null; this.poseName = null;
    this.walkSpeed = 0; this.loco = null; this.locoW = 0;
    this.reaches = { l: { target: null, w: 0, wt: 0, pole: null }, r: { target: null, w: 0, wt: 0, pole: null } };
    this.look = { target: null, w: 0, wt: 0 };
    this.exprName = 'neutral'; this.talkT = 0; this.blinkT = 2; this.blink = 0; this.time = Math.random() * 10;
    this.recipe = null; this.custom = null; this.speedMul = 1;
    this.setPose(h.look.belly > 0.5 ? 'pregnant' : 'idle', 0);
  }
  action(clipName) {
    if (!this.actions.has(clipName)) {
      const clip = HT.clips.get(clipName); if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(clipName)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = CLAMP.has(clipName) || true; }
      this.actions.set(clipName, a);
    }
    return this.actions.get(clipName);
  }
  // Crossfade the base layer to a semantic pose or raw clip name.
  setPose(name, fade = 0.35, { timeScale = 1, restart = false } = {}) {
    if (name === this.poseName && !restart) return;
    const clipName = CLIPS[name] || name;
    const a = this.action(clipName); if (!a) { console.warn('no clip', name); return; }
    this.poseName = name; this.recipe = RECIPES[name] || null;
    if (this.current === a && !restart) return;
    a.reset(); a.enabled = true; a.setEffectiveTimeScale(timeScale); a.setEffectiveWeight(1);
    if (this.current && fade > 0) a.crossFadeFrom(this.current, fade, false); else if (this.current) this.current.stop();
    a.play(); this.current = a;
  }
  // play a one-shot then return to a pose
  async once(name, then = null, fade = 0.2) {
    this.setPose(name, fade, { restart: true });
    const a = this.current; const dur = a.getClip().duration / Math.max(0.01, a.getEffectiveTimeScale());
    await new Promise((r) => setTimeout(r, dur * 1000 / Math.max(0.2, (globalThis.TTRI?.timeScale || 1))));
    if (then) this.setPose(then, 0.3);
  }
  walking(speed) { this.walkSpeed = speed; }
  lookAt(target, w = 1) { this.look.target = target; this.look.wt = target ? w : 0; }
  reach(side, target, { w = 1, pole = null } = {}) { const r = this.reaches[side.toLowerCase()]; r.target = target; r.wt = target ? w : 0; r.pole = pole; }
  expression(name) { this.exprName = name; }
  talk(sec) { this.talkT = Math.max(this.talkT, sec); }
  kick() { this.kickT = 1; }

  update(dt) {
    this.time += dt; const h = this.h;
    // locomotion layer
    const want = this.walkSpeed > 0.05;
    const locoClip = this.walkSpeed > 3 ? 'Sprint_Loop' : this.walkSpeed > 1.7 ? 'Jog_Fwd_Loop' : (h.look.belly > 0.5 || this.poseName === 'walkFormal') ? 'Walk_Formal_Loop' : 'Walk_Loop';
    if (want) {
      const a = this.action(locoClip);
      if (this.loco !== a) { if (this.loco) this.loco.fadeOut(0.25); a.reset().fadeIn(0.25).play(); this.loco = a; }
      const ref = locoClip === 'Sprint_Loop' ? 5 : locoClip === 'Jog_Fwd_Loop' ? 3 : 1.25;
      a.setEffectiveTimeScale(clamp(this.walkSpeed / ref, 0.5, 1.6));
    }
    this.locoW = damp(this.locoW, want ? 1 : 0, 8, dt);
    if (this.loco) { this.loco.setEffectiveWeight(this.locoW); if (!want && this.locoW < 0.01) { this.loco.stop(); this.loco = null; } }
    if (this.current) this.current.setEffectiveWeight(1 - this.locoW * 0.98);
    this.mixer.update(dt * this.speedMul);
    h.root.updateMatrixWorld(true);
    // procedural recipe (IK targets relative to the body)
    const rec = this.recipe;
    if (rec && this.locoW < 0.5) rec(this, h, this.time, 1 - this.locoW);
    if (this.custom) this.custom(this, h, this.time, dt);
    // IK reaches
    for (const side of ['l', 'r']) {
      const r = this.reaches[side]; r.w = damp(r.w, r.wt, 7, dt);
      if (r.w > 0.003) {
        const tg = resolve(r.target, new THREE.Vector3());
        if (tg) {
          const pole = r.pole ? resolve(r.pole, new THREE.Vector3()) : h.bonePos('upperarm_' + side).add(new THREE.Vector3(side === 'l' ? 0.35 : -0.35, -0.45, -0.5).applyQuaternion(h.root.quaternion));
          ik(h, 'upperarm_' + side, 'lowerarm_' + side, 'hand_' + side, tg, pole, r.w);
        }
      }
    }
    // look-at (neck + head, in the character's frame)
    this.look.w = damp(this.look.w, this.look.wt, 5, dt);
    if (this.look.w > 0.003) { const tg = resolve(this.look.target, new THREE.Vector3()); if (tg) lookAt(h, tg, this.look.w); }
    // belly breathing + kicks
    if (h.look.belly > 0.3) { this.kickT = Math.max(0, (this.kickT || 0) - dt * 2); h.belly = (h.look.bellyNow ?? h.look.belly) * (1 + 0.012 * Math.sin(this.time * 1.7) + Math.sin((this.kickT || 0) * Math.PI) * 0.05); }
    // face
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    this.talkT = Math.max(0, this.talkT - dt);
    let cell = EXPR_CELL[this.exprName] ?? 0;
    if (this.talkT > 0) { const n = noise1(this.time * 7, 2); cell = n > 0.25 ? 2 : n > -0.2 ? 3 : cell === 4 ? 4 : 0; }
    if (this.blink > 0 && cell !== 8 && cell !== 11) cell = 1;
    h.material.userData.u.uFaceCell.value = cell;
  }
}
function resolve(t, out) {
  if (!t) return null; if (t.isVector3) return out.copy(t); if (t.isObject3D) return t.getWorldPosition(out);
  if (typeof t === 'function') { const v = t(); return v ? out.copy(v) : null; } return null;
}
// world-space rotate helper
function rotateWorld(bone, q) {
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(q.clone().multiply(wq)));
  bone.updateMatrixWorld(true);
}
export function ik(h, an, bn, cn, target, pole, weight) {
  const A = h.byName[an], B = h.byName[bn], C = h.byName[cn];
  const a = A.getWorldPosition(new THREE.Vector3()), b = B.getWorldPosition(new THREE.Vector3()), c = C.getWorldPosition(new THREE.Vector3());
  const t = c.clone().lerp(target, weight);
  const lab = a.distanceTo(b), lcb = b.distanceTo(c), lat = clamp(a.distanceTo(t), 0.01, lab + lcb - 0.003);
  const ac = c.clone().sub(a).normalize(), ab = b.clone().sub(a).normalize(), ba = a.clone().sub(b).normalize(), bc = c.clone().sub(b).normalize(), at = t.clone().sub(a).normalize();
  const ac_ab_0 = Math.acos(clamp(ac.dot(ab), -1, 1)), ba_bc_0 = Math.acos(clamp(ba.dot(bc), -1, 1));
  const ac_ab_1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
  const ba_bc_1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
  let axis = new THREE.Vector3().crossVectors(ac, ab);
  if (pole) { const pd = pole.clone().sub(a); const pn = pd.clone().sub(ac.clone().multiplyScalar(pd.dot(ac))); if (pn.lengthSq() > 1e-6) axis = new THREE.Vector3().crossVectors(ac, pn.normalize()); }
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0); axis.normalize();
  rotateWorld(A, new THREE.Quaternion().setFromAxisAngle(axis, ac_ab_1 - ac_ab_0));
  rotateWorld(B, new THREE.Quaternion().setFromAxisAngle(axis, ba_bc_1 - ba_bc_0));
  const c2 = C.getWorldPosition(new THREE.Vector3());
  rotateWorld(A, new THREE.Quaternion().setFromUnitVectors(c2.sub(a).normalize(), at));
}
export function lookAt(h, target, w) {
  const head = h.byName.Head, neck = h.byName.neck_01;
  const hp = head.getWorldPosition(new THREE.Vector3());
  const rq = h.root.getWorldQuaternion(new THREE.Quaternion());
  const local = target.clone().sub(hp).applyQuaternion(rq.clone().invert());
  // current facing of the head in root space
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).multiply(HT.Gq[HT.index.Head].clone().invert())).applyQuaternion(rq.clone().invert());
  const yaw = clamp(Math.atan2(local.x, local.z) - Math.atan2(fwd.x, fwd.z), -1.1, 1.1) * w;
  const pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)) + Math.asin(clamp(-fwd.y, -1, 1)) * -1, -0.6, 0.6) * w;
  const applyB = (bone, f) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * f, yaw * f, 0, 'YXZ')); const wq = rq.clone().multiply(q).multiply(rq.clone().invert()); rotateWorld(bone, wq); };
  applyB(neck, 0.4); applyB(head, 0.6);
}
// body-relative point helper (character space → world)
const bodyPt = (h, x, y, z) => h.root.localToWorld(new THREE.Vector3(x, y, z).divideScalar(h.root.scale.x || 1));
// Procedural recipes layered on clips via IK.
const RECIPES = {
  pregnant: (a, h, t, w) => { ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.06, 1.0 + 0.01 * Math.sin(t * 0.8), 0.27 * (h.belly || 1) + 0.02), bodyPt(h, -0.5, 0.9, -0.3), 0.85 * w);
    ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.12, 0.98, -0.16), bodyPt(h, 0.5, 1.0, 0.2), 0.6 * w); },
  holdBaby: (a, h, t, w) => { ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, -0.06, 1.13, 0.3), bodyPt(h, 0.5, 0.9, -0.2), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, 0.1, 1.02, 0.28), bodyPt(h, -0.5, 0.9, -0.2), w); },
  rock: (a, h, t, w) => { const s = Math.sin(t * 2.4) * 0.07; ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, -0.06 + s, 1.13, 0.3), bodyPt(h, 0.5, 0.9, -0.2), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, 0.1 + s, 1.02 + s * 0.3, 0.28), bodyPt(h, -0.5, 0.9, -0.2), w); },
  reach: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.15, 1.42, 0.68), bodyPt(h, -0.6, 1.0, 0), w),
  handsBehind: (a, h, t, w) => { ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.03, 0.98, -0.2), bodyPt(h, 0.4, 1.1, 0.3), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.03, 0.98, -0.2), bodyPt(h, -0.4, 1.1, 0.3), w); },
  cower: (a, h, t, w) => { ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.07, 1.25, 0.28), bodyPt(h, 0.4, 0.6, 0), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.07, 1.22, 0.3), bodyPt(h, -0.4, 0.6, 0), w); },
  handsUp: (a, h, t, w) => { ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.3, 1.95, 0.05), bodyPt(h, 0.8, 1.3, 0), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.3, 1.95, 0.05), bodyPt(h, -0.8, 1.3, 0), w); },
  armsCrossed: (a, h, t, w) => { ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, -0.13, 1.25, 0.2), bodyPt(h, 0.4, 1.0, -0.2), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, 0.13, 1.22, 0.22), bodyPt(h, -0.4, 1.0, -0.2), w); },
  point: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.3, 1.5, 0.6), bodyPt(h, -0.6, 1.0, 0), w),
  salute: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.09, 1.72, 0.12), bodyPt(h, -0.6, 1.5, 0.2), w),
  phone: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.1, 1.16, 0.06), bodyPt(h, -0.4, 0.7, -0.1), w),
  sitType: (a, h, t, w) => { const k = 0.01 * Math.sin(t * 15); ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.12, 0.74 + k, 0.4), bodyPt(h, 0.5, 0.5, -0.3), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.12, 0.74 - k, 0.4), bodyPt(h, -0.5, 0.5, -0.3), w); },
  eat: (a, h, t, w) => { const k = (Math.sin(t * 2) + 1) / 2; ik(h, 'upperarm_l', 'lowerarm_l', 'hand_l', bodyPt(h, 0.04, 0.95, 0.32), bodyPt(h, 0.5, 0.6, -0.2), w); ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.04, 0.98 + k * 0.32, 0.3 - k * 0.1), bodyPt(h, -0.5, 0.6, -0.2), w); },
  stir: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.15 + Math.cos(t * 4) * 0.06, 1.02, 0.42 + Math.sin(t * 4) * 0.06), bodyPt(h, -0.6, 0.8, -0.2), w),
  struggle: (a, h, t, w) => ik(h, 'upperarm_r', 'lowerarm_r', 'hand_r', bodyPt(h, -0.2 + Math.sin(t * 6) * 0.08, 1.4, 0.7), bodyPt(h, -0.6, 1.0, 0), w),
};
