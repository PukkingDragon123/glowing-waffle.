// People at the door. Every 2 July somebody knocks: Win from the motosai
// stand with a bag of ya ba, Pa Jit from the Prosperity Party with an
// envelope, a man from Meridian Pacific with a deed, a student with a
// petition. You open the door or you don't; what you say to them is the one
// thing the loop keeps (G.story.politics), and the ending reads it back.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { ITEMS, spawn } from '../world/items.js';
import { assemble, pm, TH, TH_HAND } from '../world/thai.js';
import { roundedBox, boxGeo, cylGeo } from '../gfx/geo.js';
import { printed } from '../gfx/textures.js';
import { clamp, damp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
const wait = (s) => G.tasks.wait(s);

export function politics() { return G.story.politics || (G.story.politics = { yaba: null, vote: null, deed: null, petition: null }); }

// ---------------------------------------------------------------- people
// chunky cartoon people: capsules, a painted face, the clothes that say who
// they are. The face is a canvas so it can go wrong later.
function faceTex(key, o) {
  return printed('face' + key, 128, 128, (c, w, h) => {
    c.fillStyle = o.skin; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, 90, w, 38);
    // brows, eyes or sunglasses, nose, mouth
    c.strokeStyle = '#2a1a10'; c.lineWidth = 5; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(64 + s * 14, 44); c.lineTo(64 + s * 34, o.angry ? 48 : 40); c.stroke(); }
    if (o.shades) {
      c.fillStyle = '#0a0a0c'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(64 + s * 22, 58, 17, 11, 0, 0, Math.PI * 2); c.fill(); }
      c.fillRect(54, 54, 20, 4);
      c.fillStyle = 'rgba(160,200,255,0.5)'; for (const s of [-1, 1]) c.fillRect(64 + s * 22 - 8, 52, 6, 3);
    } else {
      for (const s of [-1, 1]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(64 + s * 22, 58, 10, 7, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a1008'; c.beginPath(); c.arc(64 + s * 22 + 2, 58, 4.5, 0, Math.PI * 2); c.fill(); }
    }
    c.strokeStyle = 'rgba(80,40,20,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(64, 62); c.lineTo(60, 78); c.lineTo(67, 79); c.stroke();
    c.strokeStyle = '#6a1a18'; c.lineWidth = 4;
    const wide = o.smile ?? 18;
    c.beginPath(); c.moveTo(64 - wide, 90); c.quadraticCurveTo(64, 90 + wide * 0.45, 64 + wide, 90); c.stroke();
    if (o.teeth) { c.fillStyle = '#f4f0e0'; c.beginPath(); c.moveTo(64 - wide + 4, 91); c.quadraticCurveTo(64, 90 + wide * 0.4, 64 + wide - 4, 91); c.closePath(); c.fill(); }
    if (o.moustache) { c.fillStyle = '#1a1008'; c.fillRect(48, 82, 32, 5); }
  });
}
export function makePerson(o) {
  const g = new THREE.Group();
  const skin = pm('skin_' + o.key, o.skinCol ?? 0xc89a72, { r: 0.7 });
  const shirt = pm('shirt_' + o.key, o.shirt, { r: 0.85 });
  const pants = pm('pants_' + o.key, o.pants ?? 0x2a2e3a, { r: 0.85 });
  const hair = pm('hair_' + o.key, o.hair ?? 0x14100c, { r: 0.6 });
  const shoes = pm('shoes_' + o.key, o.shoes ?? 0x1a1a1a, { r: 0.5 });
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push([new THREE.CapsuleGeometry(0.075, 0.68, 4, 10).translate(s * 0.1, 0.46, 0), pants]);
    parts.push([roundedBox(0.11, 0.07, 0.24, 0.03).translate(s * 0.1, 0.035, 0.04), shoes]);
  }
  const torso = new THREE.CapsuleGeometry(0.19, 0.36, 4, 12); torso.scale(1, 1, 0.68); torso.translate(0, 1.13, 0);
  parts.push([torso, shirt]);
  parts.push([new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10).translate(0, 1.45, 0), skin]);
  if (o.vest) { const v = new THREE.CapsuleGeometry(0.2, 0.3, 4, 12); v.scale(1, 1, 0.7); v.translate(0, 1.12, 0); parts.push([v, pm('vest_' + o.key, o.vest, { r: 0.8 })]); }
  if (o.tie) parts.push([boxGeo(0.05, 0.32, 0.02).translate(0, 1.2, 0.135), pm('tie_' + o.key, o.tie, { r: 0.5 })]);
  const body = assemble(parts, g);
  // number on the vest or the party shirt
  if (o.badge) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: printed('badge' + o.key, 64, 64, (c, w, h) => { c.fillStyle = o.badgeBg || '#f0f0f0'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill(); c.fillStyle = o.badgeFg || '#111'; c.font = `800 34px ${TH}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.badge, 32, 34); }), transparent: true, roughness: 0.8 }));
    b.position.set(o.badgeX ?? 0.08, 1.2, 0.145); g.add(b);
  }
  // arms hang from shoulder pivots so they can gesture
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.24, 1.36, 0); g.add(sh);
    assemble([[new THREE.CapsuleGeometry(0.06, 0.28, 4, 8).translate(0, -0.2, 0), o.longSleeve ? shirt : skin], [new THREE.CapsuleGeometry(0.068, 0.12, 4, 8).translate(0, -0.06, 0), shirt], [new THREE.SphereGeometry(0.055, 8, 6).translate(0, -0.42, 0.01), skin]], sh);
    sh.rotation.z = s * 0.08;
    arms.push(sh);
  }
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, map: faceTex(o.key, o), roughness: 0.75 }));
  hm.scale.set(0.95, 1.08, 1); hm.rotation.y = -Math.PI / 2; head.add(hm);
  const hair1 = new THREE.Mesh(new THREE.SphereGeometry(0.132, 16, 10, 0, Math.PI * 2, 0, Math.PI * (o.longHair ? 0.62 : 0.45)), hair); hair1.position.y = 0.02; hair1.rotation.x = -0.25; head.add(hair1);
  if (o.longHair) { const lh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.18, 4, 10), hair); lh.position.set(0, -0.1, -0.06); lh.scale.set(1, 1, 0.6); head.add(lh); }
  if (o.cap) { const cp = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pm('cap_' + o.key, o.cap, { r: 0.7 })); cp.position.y = 0.03; head.add(cp); const bill = new THREE.Mesh(roundedBox(0.2, 0.015, 0.12, 0.006), cp.material); bill.position.set(0, 0.05, 0.15); head.add(bill); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.userData = { head, arms, body, t: Math.random() * 10 };
  return g;
}

// the four of them
const CAST = {
  dealer: { key: 'win', shirt: 0x2a2a2a, vest: 0xe8701a, badge: '๑๔', badgeBg: '#f6f0e0', badgeFg: '#a01818', cap: 0x1a3a8a, pants: 0x3a4a6a, shoes: 0x2a2a2a, smile: 14, teeth: true, voice: 'man', name: 'WIN', item: 'yaba' },
  canvasser: { key: 'jit', shirt: 0x1a5ab0, badge: '๙', badgeBg: '#ffd040', badgeFg: '#1a3a8a', pants: 0x2a2a2a, skinCol: 0xd8a882, hair: 0x2a1a14, longHair: true, smile: 22, voice: 'oldwoman', name: 'PA JIT', item: 'envelope' },
  meridian: { key: 'vance', shirt: 0x6a6e74, longSleeve: true, tie: 0x8a1a1a, pants: 0x5a5e64, shades: true, smile: 34, teeth: true, skinCol: 0xd8b8a0, hair: 0x3a3028, voice: 'supervisor', name: 'MR. VANCE', item: 'deed' },
  student: { key: 'ploy', shirt: 0xf0f0f0, pants: 0x1a1a3a, longHair: true, skinCol: 0xd0a07a, smile: 10, voice: 'teen', name: 'PLOY', item: 'petition' },
};

// ---------------------------------------------------------------- the paper things
const SMALL = { pos: [0.14, -0.15, -0.38], rot: [0.2, -0.3, 0] };
function envelopeMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(boxGeo(0.22, 0.004, 0.11), new THREE.MeshStandardMaterial({ map: printed('envelope', 128, 64, (c, w, h) => {
    c.fillStyle = '#f2ece0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c8c0b0'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w / 2, h / 2); c.lineTo(w, 0); c.stroke();
    c.fillStyle = '#1a5ab0'; c.beginPath(); c.arc(20, 44, 12, 0, 7); c.fill(); c.fillStyle = '#ffd040'; c.font = `800 16px ${TH}`; c.textAlign = 'center'; c.fillText('๙', 20, 50);
    c.fillStyle = '#333'; c.font = `500 10px ${TH_HAND}`; c.fillText('ค่าน้ำมัน 500', 80, 48);
  }), roughness: 0.9 }));
  g.add(m); return g;
}
function yabaMesh() {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(roundedBox(0.06, 0.008, 0.08, 0.003), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.2 }));
  g.add(bag);
  const pill = new THREE.MeshStandardMaterial({ color: 0xf07a3a, roughness: 0.6, emissive: 0x401000, emissiveIntensity: 0.3 });
  for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 10), i % 3 ? pill : new THREE.MeshStandardMaterial({ color: 0x5ab84a, roughness: 0.6 })); p.position.set(-0.018 + (i % 3) * 0.018, 0.004, -0.02 + Math.floor(i / 3) * 0.03); g.add(p); }
  return g;
}
function deedMesh() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(boxGeo(0.21, 0.006, 0.297), new THREE.MeshStandardMaterial({ map: printed('deed', 128, 180, (c, w, h) => {
    c.fillStyle = '#f6f2e8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#202428'; c.fillRect(0, 0, w, 24); c.fillStyle = '#e8c060'; c.font = '900 10px Arial'; c.textAlign = 'center'; c.fillText('MERIDIAN PACIFIC CAPITAL', w / 2, 15);
    c.fillStyle = '#222'; c.font = `600 9px ${TH}`; c.fillText('หนังสือโอนกรรมสิทธิ์ห้องชุด', w / 2, 40);
    c.font = '700 7px Arial'; c.fillText('TRANSFER OF UNIT 1407 - CONSIDERATION: 1 BAHT', w / 2, 54);
    c.fillStyle = '#999'; for (let i = 0; i < 12; i++) c.fillRect(12, 64 + i * 7, w - 24 - (i % 3) * 12, 2);
    c.fillStyle = '#222'; c.fillText('SIGNATURE ____________', w / 2, 168);
  }), roughness: 0.95 }));
  g.add(m); return g;
}
function petitionMesh() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(boxGeo(0.23, 0.01, 0.32), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8 }));
  const paper = new THREE.Mesh(boxGeo(0.21, 0.004, 0.28), new THREE.MeshStandardMaterial({ map: printed('petition', 128, 170, (c, w, h) => {
    c.fillStyle = '#fafaf4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a3a8a'; c.font = `700 11px ${TH}`; c.textAlign = 'center'; c.fillText('รัฐธรรมนูญฉบับประชาชน', w / 2, 16);
    c.font = '700 7px Arial'; c.fillText("PEOPLE'S CONSTITUTION / INSPECT THE TOWER", w / 2, 28);
    c.strokeStyle = '#bbb'; for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(8, 40 + i * 9); c.lineTo(w - 8, 40 + i * 9); c.stroke(); }
    c.fillStyle = '#334'; c.font = `400 8px ${TH_HAND}`; ['สมชาย', 'Lek P.', 'บุญมี', 'ป้าวรรณ', 'Ton'].forEach((n, i) => c.fillText(n, 30 + (i % 2) * 50, 38 + i * 9));
  }), roughness: 0.95 }));
  paper.position.y = 0.007; g.add(board, paper); return g;
}

// keep the political things in the item table; using one asks the question
Object.assign(ITEMS, {
  yaba: {
    name: 'Ya ba (orange, "WY")', build: yabaMesh, shape: { type: 'box', size: [0.06, 0.012, 0.08] }, mass: 0.02, sound: 'paper', small: true, hold: SMALL,
    held() { return [{ key: 'F', label: 'Take one' }]; },
    use(it) {
      return { anim: 'eat', dur: 1.6, sound: 'swallow', at: [[1.0, () => {
        G.player.hunger.eat(0.35); G.story.flags.yabaTaken = (G.story.flags.yabaTaken || 0) + 1;
        G.fx.set('yaba', { wave: 0.35, doubleV: 0.3 }); G.player.ctrl.speedMul = 1.35;
        sfx('heartbeat', { vol: 0.7, rate: 1.6 }); sfx('seedChitter', { vol: 0.6 });
        G.hud.inner(pick2(['My heart is going like a motorbike.', 'I could work all night. I could work for a week.', 'It liked that. The thing in me liked that.']));
        setTimeout(() => { G.fx.clear('yaba'); G.player.ctrl.speedMul = 1; G.hud.inner('Everything is grey and itchy now.'); }, 60000);
      }]] };
    },
  },
  envelope: {
    name: (it) => (it.state.burnt ? 'Ash' : 'Envelope (500 baht, No. 9)'), build: envelopeMesh, shape: { type: 'box', size: [0.22, 0.006, 0.11] }, mass: 0.02, sound: 'paper', small: true, hold: SMALL, state: { burnt: false },
    held(it, ctx) {
      const a = [];
      if (ctx.hover && ctx.hover.name === 'knob') a.push({ key: 'F', label: 'Burn it on the gas' });
      else a.push({ key: 'F', label: 'Count the money' });
      return a;
    },
    use(it, ctx) {
      if (ctx.hover && ctx.hover.name === 'knob') {
        const lit = G.apartment.stove.burners.some((b) => b.on);
        if (!lit) { G.hud.inner('The gas has to be lit.'); return null; }
        return { anim: 'none', dur: 1.2, at: [[0.4, () => { sfx('gasIgnite', { vol: 0.5 }); G.particles && G.particles.steam(G.camera.position.clone().add(new THREE.Vector3(0, -0.2, -0.5))); politics().vote = 'burned'; G.player.inv.consumeHand(true); G.hud.inner('Five hundred baht of number nine, gone up the extractor. Mae would kill me.'); emit('politics', 'vote'); }]] };
      }
      G.hud.inner('Five purple hundred-baht notes. Somebody wrote "9" on every one.');
      return { anim: 'none', dur: 0.4 };
    },
  },
  deed: {
    name: 'Transfer deed (Meridian Pacific)', build: deedMesh, shape: { type: 'box', size: [0.21, 0.008, 0.297] }, mass: 0.05, sound: 'paper', small: true, hold: { pos: [0.1, -0.14, -0.36], rot: [0.9, -0.2, 0] },
    held() { return politics().deed ? [] : [{ key: 'F', label: 'Sign it' }]; },
    use(it) {
      if (politics().deed) return null;
      decide('deed', 'Sign Room 1407 over to Meridian Pacific for one baht?', [['Sign', 'signed'], ['Tear it up', 'refused']]);
      return { anim: 'none', dur: 0.3 };
    },
  },
  petition: {
    name: "Petition (People's Constitution)", build: petitionMesh, shape: { type: 'box', size: [0.23, 0.012, 0.32] }, mass: 0.15, sound: 'book', small: true, hold: { pos: [0.1, -0.14, -0.36], rot: [0.9, -0.2, 0] },
    held() { return politics().petition !== null ? [] : [{ key: 'F', label: 'Sign it' }]; },
    use() {
      if (politics().petition !== null) return null;
      decide('petition', 'Sign the petition?', [['Sign: Nok Saengthong, Room 1407', true], ['Not my business', false]]);
      return { anim: 'none', dur: 0.3 };
    },
  },
});
function pick2(a) { return a[Math.floor(Math.random() * a.length)]; }
async function decide(key, q, opts) {
  G.hud.inner(q);
  const v = await G.hud.choose(opts.map(([label, value]) => ({ label, value })));
  if (v === null || v === undefined) return;
  politics()[key] = v;
  sfx('pageTurn', { vol: 0.5 });
  if (key === 'deed') G.hud.inner(v === 'signed' ? 'My name looks wrong in my own handwriting.' : 'I tore it into sixteen pieces. It still feels signed.');
  if (key === 'petition') G.hud.inner(v ? 'Fifty thousand names, she said. Now forty-nine thousand, nine hundred and ninety-nine to go.' : "Somebody else will sign it. Somebody always does. Don't they?");
  emit('politics', key);
}

// ---------------------------------------------------------------- the visits
const SCRIPTS = {
  dealer: {
    hello: [
      'Sawasdee krap, Khun Nok. Fourteen-oh-seven, right? Win. From the motosai stand at the mouth of the soi.',
      'Hot day, huh? Baht fell in the river this morning. Everybody upset. Everybody needs a little something to keep going.',
      'Ya ma. Sorry, sorry, ya ba now, the police changed the name last year so the kids get scared. Same pill. Two hundred a pill, for you one fifty.',
      'Work all night. Never hungry. Very popular with the night shift at the finance companies.',
    ],
    ask: 'Win holds out a little bag of orange pills stamped WY.',
    opts: [['Buy three (450 baht)', 'bought'], ['No. Go away.', 'refused'], ["I'm calling the police.", 'police']],
    reply: {
      bought: ['Smart. Very smart. The men in the grey suits say hello.'],
      refused: ['Mai pen rai. I come back tomorrow. I always come back tomorrow.'],
      police: ['Police? Go ahead. Call. My cousin is the sergeant at the station. He will pick up.'],
    },
    give: { bought: 'yaba' },
    key: 'yaba',
  },
  canvasser: {
    hello: [
      'Sawasdee kha! Pa Jit, Prosperity Party. Number nine, remember? By-election on Sunday.',
      'Our candidate, Deputy Minister Prasit, he looks after Bangkok people. Even with the baht in the toilet. Especially then.',
      'A little something for your petrol. Five hundred baht. Last November they paid a thousand in Isaan, but this is Bangkok, so.',
      'Number nine, okay, dear? Nobody checks.',
    ],
    ask: 'Pa Jit pushes a white envelope at you. A yellow 9 is printed on the corner.',
    opts: [['Take the envelope', 'kept'], ['Give it back', 'returned'], ["Take it, and vote how I like", 'defied']],
    reply: {
      kept: ['Good child. Vote early. Bring your neighbours.'],
      returned: ['Aiyaa, you young people. Okay. The Board will remember the room number. Fourteen-oh-seven.'],
      defied: ['Ha! Everybody says that. The ballots are counted by our people anyway, dear.'],
    },
    give: { kept: 'envelope', defied: 'envelope' },
    key: 'vote',
  },
  meridian: {
    hello: [
      'Good evening, Khun Nok. Daniel Vance, Meridian Pacific Capital. We are acquiring the distressed units in this building.',
      'Your car loan is in US dollars, isn\'t it? Since this morning it has grown by fifteen percent. By January it will have doubled.',
      'Sign the unit over to us and we make all of that go away. One baht. And you may stay. As long as you like. Forever, in fact.',
    ],
    ask: 'He smiles. He keeps smiling. It is a very wide smile.',
    opts: [['Sign', 'signed'], ['Refuse', 'refused'], ['What is Meridian Pacific, really?', 'ask']],
    again: ['We are investors, Khun Nok. We invest in things that grow.', 'He looks at your stomach for a long time.'],
    reply: {
      signed: ['Wonderful. Welcome to the family. Keep the copy. Keep it close to you.'],
      refused: ['Of course. Take your time. You have all the time in the world. The same day, over and over.'],
    },
    give: { signed: 'deed' },
    key: 'deed',
  },
  student: {
    hello: [
      'Sawasdee kha, sorry to bother you. I am Ploy, from Ramkhamhaeng. We are collecting signatures.',
      'For the new constitution. The people\'s one. If fifty thousand people sign, the people can propose laws themselves.',
      'And a second page, for the tower across the soi. It is cracking on the thirty-first floor and the district office will not inspect it. Somebody got paid.',
    ],
    ask: 'She holds out a clipboard and a pen that is almost out of ink.',
    opts: [['Sign it', true], ['Not my business', false]],
    reply: {
      true: ['Khob khun kha! Fourteen-oh-seven... Thank you. Stay away from the windows tonight, okay? People say there are lights.'],
      false: ['Okay. Mai pen rai kha. I will leave a copy. Just in case.'],
    },
    give: { false: 'petition' },
    key: 'petition',
  },
};

export class Visitors {
  constructor() {
    this.active = null;
    this.models = {};
    G.visitors = this;
  }
  model(kind) {
    if (!this.models[kind]) { const m = makePerson(CAST[kind]); m.visible = false; G.world.root.add(m); this.models[kind] = m; }
    return this.models[kind];
  }
  // knock, wait at the door; talk if it opens, otherwise slide the thing under
  arrive(kind) {
    if (this.active) return;
    const spot = G.building.visitorSpot;
    const m = this.model(kind);
    m.position.set(spot.x, 0, spot.z + 0.15); m.rotation.y = Math.PI; m.visible = true;
    this.active = { kind, m, t: 0, knocks: 0, state: 'waiting' };
    this.knock();
    emit('visitor', kind);
  }
  knock() {
    const a = this.active; if (!a) return;
    a.knocks++; a.nextKnock = 22;
    const p = V(5.68, 1.2, 7.05);
    sfx('knocks', { pos: p, vol: 0.9 });
    if (a.kind !== 'meridian') setTimeout(() => G.audio && G.audio.speak(a.kind === 'canvasser' ? 'sawasdee kha!' : a.kind === 'student' ? 'excuse me kha' : 'khun nok!', { voice: CAST[a.kind].voice, pos: p, vol: 0.5 }), 900);
    if (a.knocks === 1) G.hud.inner(pick2(['Somebody is knocking.', 'Someone at the door.', 'Who knocks at this hour?']));
    G.director && G.director.addTask('door', 'Answer the door');
  }
  leave(slid) {
    const a = this.active; if (!a) return;
    a.state = 'leaving'; a.t = 0;
    G.director && G.director.done('door');
    if (slid) {
      const item = CAST[a.kind].item;
      sfx('pageTurn', { pos: V(5.68, 0.1, 6.9), vol: 0.7 });
      spawn(item, 5.7, 0.03, 6.55, { ry: 0.4 });
      G.hud.inner(a.kind === 'dealer' ? 'Something got pushed under the door.' : 'Something slid under the door.');
    }
  }
  async talk() {
    const a = this.active; const S = SCRIPTS[a.kind], C = CAST[a.kind];
    a.state = 'talking';
    G.director && G.director.done('door');
    const c = G.player.ctrl;
    c.enabled = false;
    const say = async (text) => {
      const h = G.audio && G.audio.speak(text, { voice: C.voice, pos: a.m.position.clone().add(V(0, 1.6, 0)), vol: 0.75 });
      const dur = Math.max(2.2, h && h.dur ? h.dur + 0.4 : text.length * 0.06);
      G.hud.say(text, { who: C.name, cls: 'voice', force: true, dur: dur + 0.6 });
      a.talking = dur;
      await wait(dur);
    };
    for (const l of S.hello) await say(l);
    G.hud.inner(S.ask);
    let v = await G.hud.choose(S.opts.map(([label, value]) => ({ label, value })), { timeout: 30, def: S.opts[1][1] });
    if (v === 'ask' && S.again) {
      await say(S.again[0]); G.hud.inner(S.again[1]); await wait(2);
      v = await G.hud.choose(S.opts.filter((o) => o[1] !== 'ask').map(([label, value]) => ({ label, value })), { timeout: 30, def: 'refused' });
    }
    politics()[S.key] = v;
    emit('politics', S.key);
    for (const l of S.reply[String(v)] || []) await say(l);
    const give = S.give && S.give[String(v)];
    if (give) { const it = spawn(give, a.m.position.x, 1.0, a.m.position.z - 0.4); G.player.inv.forceHand ? G.player.inv.forceHand(it) : null; sfx('grab', { vol: 0.5 }); }
    if (a.kind === 'dealer' && v === 'police') G.director && G.director.policeCall();
    c.enabled = true;
    this.leave(false);
  }
  update(dt) {
    const a = this.active; if (!a) return;
    a.t += dt;
    const m = a.m, ud = m.userData;
    ud.t += dt;
    ud.head.rotation.x = Math.sin(ud.t * 0.8) * 0.04 + (a.talking > 0 ? Math.sin(ud.t * 9) * 0.05 : 0);
    ud.head.rotation.y = Math.sin(ud.t * 0.5) * 0.12;
    ud.arms[1].rotation.x = a.talking > 0 ? -0.4 + Math.sin(ud.t * 3) * 0.3 : damp(ud.arms[1].rotation.x, 0, 3, dt);
    if (a.talking > 0) a.talking -= dt;
    // the Meridian man's head ticks, like a clock
    if (a.kind === 'meridian' && Math.random() < dt * 0.6) ud.head.rotation.z = (Math.random() - 0.5) * 0.5; else ud.head.rotation.z = damp(ud.head.rotation.z, 0, 6, dt);
    if (a.state === 'waiting') {
      const door = G.apartment.doors.front;
      const p = G.player.ctrl.body.position;
      if (door.angle > 0.6 && Math.hypot(p.x - 5.68, p.z - 6.9) < 2.6) { this.talk(); return; }
      a.nextKnock -= dt;
      if (a.nextKnock <= 0) { if (a.knocks >= 3) this.leave(true); else this.knock(); }
    }
    if (a.state === 'leaving') {
      // walk off down the corridor toward the lift and are gone
      m.rotation.y = damp(m.rotation.y, -Math.PI / 2, 4, dt);
      m.position.x -= dt * 0.9;
      m.position.y = Math.abs(Math.sin(a.t * 6)) * 0.02;
      if (a.t > 6) { m.visible = false; this.active = null; }
    }
  }
  reset() { if (this.active) { this.active.m.visible = false; this.active = null; } }
}
