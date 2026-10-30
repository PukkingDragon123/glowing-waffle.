// Opening cinematic: a quiet night on the sofa → ships crash into the towers → the DTP raid.
// playIntro({ apt, game }) — apt implements the Apartment contract (ARCHITECTURE.md).
import * as THREE from 'three';
import { createCutscene } from '../game/cutscene.js';
import { createFX } from '../gfx/fx.js';
import { makeBeam } from './city.js';
import { SPOTS, ROOM } from './layout.js';

// ------------------------------------------------------------------ shared helpers (finale uses them too)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function screenAnchor(apt, getWorld) {
  return () => { const p = getWorld().clone().project(apt.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; };
}
export function headOf(actor) { const b = actor.c.byName?.Head || actor.c.byName?.head; return b ? b.getWorldPosition(new THREE.Vector3()) : actor.root.position.clone().add(V(0, 1.6, 0)); }
export function handOf(actor, side = 'r') { const b = actor.c.byName?.['hand_' + side]; return b ? b.getWorldPosition(new THREE.Vector3()) : actor.root.position.clone().add(V(0, 1, 0.3)); }

const black = () => new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.5, metalness: 0.4 });
export function makeRifle() {
  const g = new THREE.Group(), m = black(), steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.85, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.34, 4, 8), m); body.rotation.x = Math.PI / 2; g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8), steel); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.33; g.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.2), m); stock.position.set(0, -0.02, -0.27); g.add(stock);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.06), m); mag.position.set(0, -0.08, 0.04); mag.rotation.x = 0.25; g.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.035), m); grip.position.set(0, -0.06, -0.08); grip.rotation.x = -0.3; g.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.09), steel); sight.position.set(0, 0.05, 0.05); g.add(sight);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}
export function makeTorch({ light = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.2, 10), black()); body.rotation.x = Math.PI / 2; g.add(body);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 3.2) })); lens.position.z = 0.101; g.add(lens);
  const beam = makeBeam(0.55, 4.5, 0xfff1d6); beam.rotation.x = -Math.PI / 2; beam.position.z = 0.1; beam.material.uniforms.uOpacity.value = 0.16; g.add(beam);
  if (light) { const sp = new THREE.SpotLight(0xfff0d8, 30, 14, 0.42, 0.5, 1.6); sp.position.z = 0.1; const t = new THREE.Object3D(); t.position.z = 3; g.add(sp, t); sp.target = t; g.userData.spot = sp; }
  return g;
}
export function makeSack() {
  const pts = [[0, 0], [0.16, 0.02], [0.24, 0.12], [0.25, 0.3], [0.2, 0.45], [0.06, 0.55], [0.05, 0.6], [0.09, 0.66], [0, 0.68]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.95 }));
  m.castShadow = true; return m;
}
// Attach a prop to a character's hand by following it every frame (works for any rig orientation).
export function holdProp(cut, actor, prop, { side = 'r', offset = V(0, 0, 0), aim = null, scene }) {
  scene.add(prop);
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  return cut.every(() => {
    if (!actor.root.parent) { prop.visible = false; return; }
    const hp = handOf(actor, side);
    prop.position.copy(hp).add(offset.clone().applyQuaternion(actor.root.quaternion));
    const target = typeof aim === 'function' ? aim() : aim ?? actor.root.position.clone().add(V(0, 1.25, 0)).add(V(0, 0, 4).applyQuaternion(actor.root.quaternion));
    m.lookAt(target, prop.position, V(0, 1, 0)); q.setFromRotationMatrix(m); prop.quaternion.slerp(q, 0.35);
  });
}
// Exterior shots reuse the apartment scene: the city is modelled around room 1407 at the origin.
export function exterior(apt, game, on) {
  const cam = apt.camera;
  if (on) { apt._camSave ??= { near: cam.near, far: cam.far }; cam.near = 0.3; cam.far = 6000; game.gfx.grade.inkFar = 700; }
  else if (apt._camSave) { cam.near = apt._camSave.near; cam.far = Math.max(apt._camSave.far, 3000); game.gfx.grade.inkFar = 40; apt._camSave = null; }
  cam.updateProjectionMatrix();
}
export function ensureFar(apt) { if (apt.camera.far < 3000) { apt.camera.far = 3000; apt.camera.updateProjectionMatrix(); } }

// ------------------------------------------------------------------ the intro
export async function playIntro({ apt, game }) {
  const cut = createCutscene({ scene: apt.scene, camera: apt.camera });
  const city = apt.cityView;
  const fx = createFX(apt.scene, { capacity: 600 });
  cut.every((dt) => fx.update(dt));
  apt.cinematic = true;
  ensureFar(apt);
  const spawned = [];
  const S = (kind, pos, yaw) => { const a = apt.spawnActor(kind, pos, yaw); spawned.push(a); return a; };
  const sunny = apt.sunny;
  const babyName = game.state?.baby?.name || 'Bean';
  try {
    // ---------------- setup: 11:52 p.m., a quiet night
    apt.tidy?.(); apt.setLight?.('night'); apt.tv?.show('off');
    city?.setTimeOfDay(23.85); city?.setDamage(0);
    city?.ships.forEach((s) => { s.group.visible = false; });
    sunny.place([-2.52, 0, 1.68], Math.PI / 2); sunny.anim.setPose('sit', 0);
    const gary = S('gary', [-2.52, 0, 0.78], Math.PI / 2); gary.anim.setPose('sit', 0);
    const tofu = S('tofu', [-1.25, 0, 1.95], Math.PI * 0.85); tofu.anim.setPose('loaf', 0);
    cut.letterbox(true);
    await cut.fade(1, 0);
    cut.music('apartment_night', 3);
    cut.loop('city', { vol: 0.25 });

    // S1 · establishing exterior, push in to the lit window
    exterior(apt, game, true);
    cut.setCam({ pos: [26, 9, -62], look: [-0.3, 1.0, -2.4], fov: 32 });
    await cut.fade(0, 2.5);
    cut.caption('Golden Lotus Mansions · Room 1407', '11:52 p.m. · a Tuesday', 4.2);
    await cut.track([{ pos: [26, 9, -62], look: [-0.3, 1.0, -2.4], fov: 32 }, { pos: [9, 4, -24], look: [-0.3, 1.3, -2.4], fov: 30 }, { pos: [0.6, 1.9, -7.5], look: [-0.5, 1.4, -2.0], fov: 34 }], 7.5, 'inOutSine');
    exterior(apt, game, false);

    // S2 · the sofa
    apt.tv?.show('show');
    cut.setCam({ pos: [-0.75, 1.3, 1.2], look: [-2.6, 0.95, 1.22], fov: 46 });
    cut.loop('static', { vol: 0.04 });
    await cut.wait(0.6);
    await cut.say('TV', '…and tonight\'s sky will be clear, with a seventy percent chance of absolutely nothing.', 'woman');
    sunny.anim.lookAt(gary.root.position.clone().add(V(0, 1.4, 0)), 0.7);
    gary.anim.reach('l', () => sunny.root.position.clone().add(V(0.28, 1.0, -0.05)));
    await cut.wait(0.4);
    sunny.anim.kick?.(); cut.sfx('heartbeat', { vol: 0.3 });
    cut.setCam({ pos: [-1.55, 1.35, 1.25], look: [-2.55, 1.15, 1.2], fov: 38 });
    await cut.say('Gary', 'Sunny. The small one is doing the swimming again.', 'gary', { actor: gary });
    sunny.anim.expression('happy');
    await cut.say('Sunny', 'He takes after you. Restless. Glows a little at night.', 'sunny', { actor: sunny });
    gary.anim.lookAt(headOf(sunny), 0.9); gary.anim.expression('happy');
    cut.setCam({ pos: [-1.9, 1.32, 0.35], look: [-2.55, 1.3, 0.9], fov: 32 });
    await cut.say('Gary', 'You are the apple of my eyes. Both of them. All four.', 'gary', { actor: gary });
    cut.setCam({ pos: [-1.85, 1.25, 2.15], look: [-2.55, 1.1, 1.6], fov: 34 });
    await cut.say('Sunny', 'You have two eyes, Gary.', 'sunny', { actor: sunny });
    await cut.wait(0.5);
    await cut.say('Gary', 'On this planet, yes.', 'gary', { actor: gary });
    gary.anim.reach('l', null);
    cut.setCam({ pos: [-0.9, 0.55, 2.25], look: [-1.3, 0.2, 1.9], fov: 40 });
    cut.sfx('mrrp', { vol: 0.6 }); tofu.anim.lookAt?.(headOf(gary));
    await cut.wait(0.8);
    await cut.say('Gary', 'Mr. Tofu agrees. He told me so. With his face.', 'gary', { actor: gary });

    // S3 · the news breaks
    apt.tv?.show('news'); cut.sfx('sting', { vol: 0.5 }); cut.music('tension', 2);
    cut.setCam({ pos: [-1.45, 0.72, 1.32], look: [-0.82, 0.6, 1.25], fov: 34 });
    await cut.say('TV', 'BREAKING. Unidentified lights over the city centre.', 'woman');
    await cut.say('TV', 'The Department of Terrestrial Purity asks citizens to stay calm and report anyone who glows.', 'woman');
    cut.setCam({ pos: [-1.1, 1.3, 1.25], look: [-2.6, 1.1, 1.2], fov: 44 });
    gary.anim.expression('fear'); sunny.anim.expression('worried');
    await cut.wait(0.8);
    await cut.say('Sunny', '…Gary. Are those your cousins?', 'sunny', { actor: sunny });
    await cut.say('Gary', 'I have told them. Call. First.', 'gary', { actor: gary });

    // S4 · lights in the sky, through the window
    const shipsIn = [[-300, 520, -1500], [-560, 480, -1300], [420, 560, -1400], [200, 700, -1800]];
    const shipsAt = [[-40, 120, -380], [-170, 135, -560], [170, 150, -540], [40, 210, -760]];
    city?.ships.forEach((s, i) => { s.group.visible = true; s.beam.visible = false; s.group.position.set(...shipsIn[i]); });
    const arrive = cut.tween(9, (k) => city?.ships.forEach((s, i) => { s.group.position.lerpVectors(V(...shipsIn[i]), V(...shipsAt[i]), k); s.group.rotation.y += 0.01; }), 'outCubic');
    cut.loop('ship', { vol: 0.0 });
    sunny.anim.setPose('sitExit'); gary.anim.setPose('sitExit');
    cut.setCam({ pos: [-0.35, 1.25, -0.75], look: [-0.5, 2.6, -4.2], fov: 56 });
    await cut.wait(1.6);
    sunny.place([-0.9, 0, -0.9], Math.PI); gary.place([0.25, 0, -1.0], Math.PI);
    sunny.anim.setPose('pregnant', 0); gary.anim.setPose('idle', 0);
    cut.loops.get('ship')?.setVolume(0.25, 3);
    await cut.cam({ pos: [-0.3, 1.45, 0.2], look: [-0.3, 2.3, -4.0], fov: 52 }, 3.5, 'inOutSine');
    await cut.say('Gary', 'Those are not my cousins. My cousins park better.', 'gary', { actor: gary });

    // S5 · the crash, from outside
    exterior(apt, game, true);
    await arrive;
    cut.setCam({ pos: [48, 26, -96], look: [-64, 70, -330], fov: 38 });
    cut.loop('siren', { vol: 0.0 }).setVolume(0.25, 4);
    const crashA = city?.crash(city.ships[0], 0, { duration: 5, onImpact: () => { cut.flash([1, 0.75, 0.45], 0.7); cut.shake(1.1); cut.sfx('explosion', { vol: 1, reverb: 0.5 }); } });
    await cut.track([{ pos: [48, 26, -96], look: [-50, 110, -340], fov: 38 }, { pos: [36, 34, -130], look: [-64, 75, -330], fov: 34 }], 4.6, 'inOutSine');
    cut.slowmo(0.3, 1.6);
    await crashA;
    await cut.wait(0.6);
    cut.setCam({ pos: [-60, 55, -230], look: [-240, 125, -520], fov: 40 });
    const crashB = city?.crash(city.ships[1], 2, { duration: 3.6, onImpact: () => { cut.flash([1, 0.6, 0.4], 0.5); cut.shake(0.8); cut.sfx('explosion', { vol: 0.8, rate: 0.85, reverb: 0.6 }); } });
    await cut.cam({ pos: [-75, 50, -250], look: [-250, 125, -520], fov: 36 }, 3.6, 'linear');
    await crashB;
    await cut.wait(1.4);
    // the cruiser drags its belly over the rooftops
    const cr = city?.ships[3];
    if (cr) { cr.group.position.set(260, 160, -420); cr.group.rotation.set(0.1, -1.2, 0.15); cr.beam.visible = true; }
    cut.setCam({ pos: [6, 6, -16], look: [60, 140, -300], fov: 50 });
    cut.loops.get('ship')?.setVolume(0.7, 2);
    await cut.tween(4.5, (k) => { cr?.group.position.set(260 - 360 * k, 160 - 40 * k, -420 + 120 * k); }, 'inOutSine');
    cut.shake(0.4);
    exterior(apt, game, false);

    // S6 · inside: glass rattles, sirens, boots
    cut.setCam({ pos: [0.8, 1.5, 1.2], look: [-0.4, 1.4, -1.5], fov: 48 });
    apt.setLight?.('raid');
    cut.sfx('rumble', { vol: 0.9 }); cut.sfx('glass', { vol: 0.25, rate: 1.4 }); cut.shake(0.35);
    tofu.anim.setPose('stand', 0.3); tofu.anim.scared?.(1);
    cut.sfx('hiss', { vol: 0.4 });
    sunny.anim.expression('fear');
    await cut.wait(1.2);
    cut.loop('heli', { vol: 0 }).setVolume(0.35, 3);
    await cut.say('Sunny', 'Gary. Get away from the window.', 'sunny', { actor: sunny });
    gary.walkTo([[-0.6, 0.55]]); sunny.walkTo([[-1.25, 0.9]]);
    await cut.wait(1.8);
    gary.face([-1.25, 0.9]); await sunny.face([-0.6, 0.55]);
    // boots in the corridor
    cut.setCam({ pos: [0.9, 1.45, 0.25], look: [3.2, 1.15, 1.3], fov: 44 });
    for (let i = 0; i < 9; i++) { cut.sfx('boot', { vol: 0.25 + i * 0.05, pan: 0.6, delay: i * 0.22, reverb: 0.4 }); }
    await cut.wait(1.2);
    await cut.say('Radio', '"All units. Fourteen-oh-seven. The grey one, and the… vessel."', 'agent');
    cut.setCam({ pos: [-0.1, 1.45, 1.6], look: [-0.9, 1.35, 0.7], fov: 36 });
    gary.anim.lookAt(headOf(sunny), 1); sunny.anim.lookAt(headOf(gary), 1);
    gary.anim.reach('r', () => sunny.root.position.clone().add(V(0.12, 1.02, -0.22)));
    await cut.say('Gary', 'Sunny. Whatever happens, name him something strong. Like… Kevin.', 'gary', { actor: gary });
    await cut.say('Sunny', 'We are not naming him Kevin.', 'sunny', { actor: sunny });
    gary.anim.reach('r', null);

    // S7 · the door
    cut.music('raid', 0.4);
    cut.setCam({ pos: [1.55, 0.42, 2.05], look: [3.15, 1.2, 1.3], fov: 52 });
    cut.sfx('kick', { vol: 0.6 }); cut.shake(0.25);
    await cut.wait(0.9);
    cut.sfx('door_break', { vol: 1 }); cut.flash([1, 0.95, 0.85], 0.3, 0.6); cut.shake(1.2);
    apt.door?.open({ kick: true });
    fx.burst('dust', V(3.0, 0.3, 1.3), { scale: 1.6, count: 18 }); fx.burst('debris', V(3.1, 1.6, 1.0), { scale: 1.2, floor: 0, count: 16 });
    const out = SPOTS.doorOutside.pos;
    const soldiers = [0, 1, 2, 3].map((i) => S('soldier', [out[0] + i * 0.6, 0, out[2] + (i % 2 ? 0.25 : -0.25)], -Math.PI / 2));
    const lead = soldiers[0];
    soldiers.forEach((s, i) => s.anim.setPose(i % 2 ? 'torch' : 'aim', 0));
    soldiers.forEach((s, i) => holdProp(cut, s, i % 2 ? makeTorch({ light: i === 1 }) : makeRifle(), { scene: apt.scene, aim: () => headOf(gary) }));
    const marks = [[1.3, 0.95], [0.75, 0.15], [1.8, 1.85], [2.55, 1.3]];
    soldiers.forEach((s, i) => setTimeout(() => s.walkTo([[2.6, 1.3], marks[i]], { run: true }), i * 300));
    await cut.cam({ pos: [1.1, 1.0, 2.15], look: [2.6, 1.3, 1.1], fov: 44 }, 1.4, 'outCubic');
    await cut.say('Soldier', 'DTP! NOBODY GLOW!', 'soldier', { actor: lead, hold: 0.4 });
    soldiers.forEach((s) => s.face([-0.6, 0.55]));
    cut.setCam({ pos: [-2.0, 1.15, 1.9], look: [0.9, 1.25, 0.6], fov: 42 });
    tofu.anim.setPose('hiss', 0.15); cut.sfx('hiss', { vol: 0.7 });
    await cut.say('Radio', '"Brass here. Bag the grey one. Gently. I want him to fill out forms."', 'general');

    // S8 · they take Gary
    const [s1, s2, s3, s4] = soldiers;
    s1.walkTo([[-0.05, 0.7]], { run: true }); s2.walkTo([[-0.35, 0.05]], { run: true });
    await cut.wait(0.9);
    s1.face([-0.6, 0.55]); s2.face([-0.6, 0.55]);
    cut.setCam({ pos: [0.6, 1.35, 1.5], look: [-0.5, 1.4, 0.55], fov: 40 });
    gary.anim.expression('fear');
    await cut.say('Gary', 'Hello. I come in peace. I also live here.', 'gary', { actor: gary });
    s1.anim.once('punch', 'aim'); await cut.wait(0.35);
    cut.sfx('punch', { vol: 1 }); cut.flash([1, 1, 1], 0.12, 0.5); cut.shake(0.7); fx.burst('impact', headOf(gary), { scale: 0.5 });
    gary.anim.once('hitHead', 'idle'); gary.anim.expression('pain');
    sunny.anim.expression('scream');
    await cut.say('Sunny', 'GARY!', 'sunny', { actor: sunny, hold: 0.2 });
    s3.walkTo([[-0.95, 1.05]], { run: true });
    // the doomed rescue
    sunny.anim.setPose('struggle', 0.2); s3.anim.setPose('push', 0.3);
    cut.setCam({ pos: [-2.1, 1.2, 1.75], look: [-0.7, 1.15, 0.6], fov: 40 });
    const reach = await cut.qte((q) => q.mash({ prompt: 'reach Gary', key: 'SPACE', count: 16, dur: 4.2, anchor: screenAnchor(apt, () => headOf(gary)) }));
    let held = false;
    if (reach.result !== 'miss') {
      sunny.walkTo([[-0.95, 0.75]]); sunny.anim.reach('r', () => handOf(gary, 'l'));
      const grab = await cut.qte((q) => q.timing({ prompt: 'take his hand', key: 'SPACE', anchor: screenAnchor(apt, () => handOf(gary, 'l')) }));
      held = grab.result !== 'miss';
    }
    if (held) {
      gary.anim.reach('l', () => handOf(sunny, 'r'));
      cut.setCam({ pos: [-0.45, 1.05, 1.5], look: [-0.8, 1.0, 0.65], fov: 30 });
      await cut.say('Gary', 'Your hand is warm. I will remember the temperature.', 'gary', { actor: gary });
    } else {
      await cut.say('Gary', 'Sunny, stay down! Protect the small swimmer!', 'gary', { actor: gary });
    }
    s3.anim.once('punch', 'aim'); await cut.wait(0.3);
    cut.sfx('thud', { vol: 0.9 }); cut.shake(0.6);
    sunny.anim.reach('r', null); gary.anim.reach('l', null);
    sunny.anim.once('hit', 'floored'); sunny.anim.expression('pain');
    sunny.walkTo([[-1.5, 1.15]], { speed: 0.6 });
    s2.anim.once('jab', 'aim'); await cut.wait(0.3); cut.sfx('punch', { vol: 0.9, rate: 0.9 }); fx.burst('impact', headOf(gary), { scale: 0.4 });
    gary.anim.setPose('die', 0.15);
    cut.setCam({ pos: [0.55, 0.45, -0.4], look: [-0.6, 0.45, 0.55], fov: 44 });
    await cut.wait(1.4);

    // S9 · Mr. Tofu attacks
    cut.setCam({ pos: [-2.35, 0.55, 2.2], look: [-0.6, 0.6, 0.6], fov: 44 });
    tofu.anim.setPose('hiss', 0.1); cut.sfx('yowl', { vol: 0.9 });
    await cut.wait(0.6);
    const p0 = tofu.root.position.clone(), p1 = s2.root.position.clone().add(V(0.05, 1.2, 0.25));
    tofu.anim.move?.(3, 'gallop'); tofu.face([p1.x, p1.z], 0.1);
    await cut.tween(0.55, (k) => { tofu.root.position.lerpVectors(p0, p1, k); tofu.root.position.y = p0.y + (p1.y - p0.y) * k + Math.sin(k * Math.PI) * 0.6; }, 'linear');
    cut.sfx('hiss', { vol: 0.8 }); cut.shake(0.3);
    s2.anim.once('punch', 'aim');
    await cut.wait(0.25);
    cut.sfx('punch', { vol: 1, rate: 1.2 }); cut.sfx('yowl', { vol: 1, rate: 1.15 }); fx.burst('impact', p1, { scale: 0.6 });
    tofu.anim.move?.(0); tofu.anim.setPose('limp', 0.05);
    const fly0 = tofu.root.position.clone(), fly1 = V(-3.0, 1.15, -0.55);
    cut.setCam({ pos: [-0.9, 1.3, 1.5], look: [-2.6, 1.0, -0.5], fov: 50 });
    cut.slowmo(0.35, 1.0);
    await cut.tween(0.9, (k) => { tofu.root.position.lerpVectors(fly0, fly1, k); tofu.root.position.y += Math.sin(k * Math.PI) * 0.5; tofu.root.rotation.z = k * Math.PI * 3; }, 'linear');
    cut.sfx('thud', { vol: 1 }); cut.sfx('boing', { vol: 0.35 }); cut.shake(0.4); fx.burst('dust', fly1, { scale: 0.6, count: 8 });
    await cut.tween(0.45, (k) => { tofu.root.position.y = 1.15 * (1 - k * k); tofu.root.position.x = -3.0 + 0.25 * k; }, 'inQuad');
    tofu.root.rotation.set(0, 0.6, Math.PI / 2);
    await cut.wait(0.5);
    s4.walkTo([[-2.55, -0.4]], { run: true });
    await cut.say('Soldier', 'The cat too. Brass wants everything that purrs.', 'soldier', { actor: s4 });
    await cut.wait(0.8);
    const sack = makeSack(); sack.position.set(-2.72, 0, -0.5); apt.scene.add(sack); spawned.push({ root: sack, prop: true });
    tofu.visible = false; tofu.root.visible = false; cut.sfx('cloth', { vol: 0.8 }); cut.sfx('meow', { vol: 0.5, rate: 0.8 });
    const wiggle = cut.every((dt, t) => { sack.rotation.z = Math.sin(t * 17) * 0.12; sack.scale.set(1 + Math.sin(t * 11) * 0.06, 1, 1 + Math.cos(t * 13) * 0.06); });
    cut.setCam({ pos: [-1.6, 0.7, 0.6], look: [-2.7, 0.35, -0.5], fov: 40 });
    await cut.wait(1.4);

    // S10 · Gary is dragged out
    cut.sfx('cuff', { vol: 0.9 });
    gary.anim.setPose('handsBehind', 0.6); gary.anim.expression('worried');
    s4.walkTo([[2.6, 1.3], [4.4, 1.3]], { speed: 1.4 });
    const sackFollow = cut.every(() => { sack.position.copy(handOf(s4, 'l')).add(V(0, -0.62, 0)); });
    await cut.wait(0.8);
    s1.walkTo([[2.6, 1.15], [4.4, 1.15]], { speed: 0.9 }); s2.walkTo([[2.6, 1.55], [4.4, 1.55]], { speed: 0.9 });
    gary.walkTo([[0.4, 1.1], [2.35, 1.3]], { speed: 0.85 }); gary.anim.setPose('dragged', 0.4);
    cut.setCam({ pos: [-1.1, 0.5, 1.75], look: [1.5, 1.0, 1.1], fov: 46 });
    await cut.wait(3.0);
    await gary.walkTo([[2.35, 1.3]], { speed: 0.85 });
    gary.anim.setPose('handsBehind', 0.4);
    await gary.face([-1.5, 1.15]);
    gary.anim.lookAt(headOf(sunny), 1);
    cut.setCam({ pos: [1.25, 1.55, 1.35], look: [2.35, 1.75, 1.3], fov: 32 });
    await cut.say('Gary', 'Sunny! There is soup in the—', 'gary', { actor: gary, hold: 0.3 });
    await cut.say('Gary', 'No. There is no soup. I love you. Eat something.', 'gary', { actor: gary });
    s3.walkTo([[2.6, 1.3], [4.4, 1.3]], { speed: 1.2 });
    gary.walkTo([[4.4, 1.3]], { speed: 1.0 });
    await cut.wait(1.6);
    cut.setCam({ pos: [0.4, 0.35, 1.6], look: [3.15, 1.1, 1.3], fov: 46 });
    await cut.wait(0.6);
    apt.door?.close(); cut.sfx('kick', { vol: 0.9 }); cut.sfx('thud', { vol: 0.6 }); cut.shake(0.6);
    sackFollow(); wiggle();
    for (const a of [gary, ...soldiers, tofu]) { apt.removeActor(a); }
    apt.scene.remove(sack);
    await cut.wait(0.6);
    cut.music(null, 3);
    cut.stopLoop('heli', 4); cut.loops.get('siren')?.setVolume(0.08, 5);

    // S11 · alone
    apt.setLight?.('blackout');
    sunny.anim.setPose('crouch', 1.2); sunny.anim.expression('worried');
    sunny.anim.reach('r', () => sunny.root.position.clone().add(V(0, 0.75, 0.32).applyQuaternion(sunny.root.quaternion)));
    cut.setCam({ pos: [-0.3, 2.3, 2.6], look: [-1.5, 0.6, 1.1], fov: 40 });
    const push = cut.cam({ pos: [-0.9, 1.25, 1.95], look: [-1.5, 0.75, 1.1], fov: 34 }, 9, 'inOutSine');
    await cut.wait(2);
    cut.sfx('heartbeat', { vol: 0.5 }); await cut.wait(1.1); cut.sfx('heartbeat', { vol: 0.45 });
    await cut.say('Sunny', '…Okay. Okay. It\'s just us now.', 'sunny', { actor: sunny });
    sunny.anim.kick?.(); cut.sfx('heartbeat', { vol: 0.35, rate: 1.4 });
    await cut.wait(0.6);
    await cut.say('Sunny', 'Don\'t do that. I\'m scared too.', 'sunny', { actor: sunny });
    await push;
    await cut.fade(1, 2.2);
    cut.music('lullaby', 3);
    await cut.caption('CLOSE ENCOUNTERS<br>OF THE THIRD TRIMESTER', 'a domestic horror', 4.6);
    void babyName;
  } finally {
    // final state: the flat is wrecked, Sunny is alone
    for (const a of spawned) { if (a.prop) a.root.removeFromParent(); else if (a.root.parent) apt.removeActor(a); }
    apt.messUp?.(); apt.door?.close?.(); apt.setLight?.('night'); apt.tv?.show('static');
    apt.cityView?.setDamage(2); apt.cityView?.setTimeOfDay(23.9);
    exterior(apt, game, false);
    sunny.anim.reach('r', null); sunny.anim.lookAt(null); sunny.anim.expression('neutral'); sunny.anim.setPose('pregnant', 0.4);
    apt.scene.remove(fx.group);
    cut.letterbox(false);
    await cut.end({ fadeIn: false });
    apt.cinematic = false;
  }
}
