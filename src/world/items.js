// Physical items: physics props you can take into your hands (E), drag (LMB),
// store in the two inventory slots, use (F) and drop/place (G / E on a
// surface). Food definitions drive the hidden hunger system.
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { Interactable } from './interactables.js';
import { L, labelMat } from './labels.js';
import { boxGeo, cylGeo, roundedBox } from '../gfx/geo.js';
import { clamp, rand } from '../core/util.js';
import { centered } from './props.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const say = (t, o) => G.hud && G.hud.inner(t, o);

// ---------------------------------------------------------------- meshes
const matCache = {};
function mc(key, fn) { return matCache[key] || (matCache[key] = fn()); }
const plain = (c, r = 0.7, m = 0) => mc('p' + c + r + m, () => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));

function shadowy(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
function boxItem(w, h, d, front, side = null, top = null, back = null) {
  const s = side || plain(0xcccccc);
  const mats = [s, s, top || s, top || s, front, back || front];
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
}
function canItem(r, h, label, cap = M.steel) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), [label, cap, cap]);
}

const B = {
  mug(state) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.039, 0.095, 16, 1, true), mc('mugmat', () => new THREE.MeshStandardMaterial({ color: 0xeee8da, roughness: 0.25, side: THREE.DoubleSide, envMapIntensity: 1.2 })));
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.039, 16), body.material); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.045;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12, Math.PI * 1.2), body.material);
    handle.position.set(0.045, 0, 0); handle.rotation.z = -Math.PI * 0.6;
    const liquid = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), mc('coffee', () => new THREE.MeshStandardMaterial({ color: 0x2a1408, roughness: 0.1, envMapIntensity: 1.5 })));
    liquid.rotation.x = -Math.PI / 2; liquid.visible = false;
    // free promo mug from a finance company that will not survive the week
    const print = new THREE.Mesh(new THREE.CylinderGeometry(0.0436, 0.0396, 0.056, 16, 1, true, -0.95, 1.9), mc('mugprint', () => { const m = labelMat(L.mug(), { roughness: 0.3 }); m.alphaTest = 0.5; return m; }));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0434, 0.0433, 0.007, 16, 1, true), mc('mugrim', () => new THREE.MeshStandardMaterial({ color: 0x1a2f7a, roughness: 0.3, side: THREE.DoubleSide })));
    rim.position.y = 0.0435;
    g.add(body, bottom, handle, liquid, print, rim);
    g.userData.liquid = liquid;
    return shadowy(g);
  },
  catBox() {
    const g = new THREE.Group();
    const m = boxItem(0.19, 0.25, 0.08, mc('catbox', () => labelMat(L.catBox())), mc('catboxs', () => new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: 0.8 })));
    g.add(m);
    // top flaps (hinged pieces)
    const flapMat = mc('catboxs', () => new THREE.MeshStandardMaterial({ color: 0xf0a020, roughness: 0.8 }));
    const f1 = new THREE.Group(); f1.position.set(0, 0.125, 0.04);
    const f1m = new THREE.Mesh(boxGeo(0.19, 0.004, 0.08), flapMat); f1m.position.z = -0.04; f1.add(f1m);
    g.add(f1);
    g.userData.flap = f1;
    return shadowy(g);
  },
  catPacket() {
    const g = new THREE.Group();
    // foil pouch: printed front and back, bare foil round the seams
    const foil = mc('pktop', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.6, roughness: 0.3 }));
    const face = mc('pk', () => labelMat(L.catPacket(), { metalness: 0.35, roughness: 0.3 }));
    const m = new THREE.Mesh(roundedBox(0.085, 0.13, 0.018, 0.008), [foil, foil, foil, foil, face, face]);
    const top = new THREE.Mesh(boxGeo(0.085, 0.02, 0.006), foil);
    top.position.y = 0.072;
    g.add(m, top);
    g.userData.top = top;
    return shadowy(g);
  },
  eggs() {
    const g = new THREE.Group();
    // grey pulp tray with a paper strip; Thai eggs are brown
    const base = boxItem(0.3, 0.06, 0.11, mc('eggs', () => labelMat(L.eggs(), { roughness: 0.95 })), plain(0xc4baa6, 1), plain(0xb6ac98, 1));
    g.add(base);
    const lid = new THREE.Group(); lid.position.set(0, 0.03, -0.055);
    const lm = new THREE.Mesh(boxGeo(0.3, 0.012, 0.11), plain(0xb6ac98, 1)); lm.position.z = 0.055; lid.add(lm);
    g.add(lid);
    const eggs = [];
    for (let i = 0; i < 6; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), plain(0xd8b088, 0.5));
      e.scale.y = 1.25; e.position.set(-0.11 + (i % 3) * 0.055 + (i > 2 ? 0 : 0), 0.035, i < 3 ? -0.025 : 0.025);
      e.position.x = -0.12 + (i % 6) * 0.048; e.position.z = 0;
      g.add(e); eggs.push(e);
    }
    g.userData.eggs = eggs; g.userData.lid = lid;
    return shadowy(g);
  },
  egg() {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), plain(0xd8b088, 0.5));
    e.scale.y = 1.28;
    return shadowy(e);
  },
  pan() {
    const g = new THREE.Group();
    const steel = mc('pansteel', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.35, metalness: 0.8 }));
    const base = new THREE.Mesh(cylGeo(0.12, 0.008, 20), steel); base.position.y = -0.016;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.035, 20, 1, true), mc('panwall', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide })));
    const handle = new THREE.Mesh(boxGeo(0.2, 0.014, 0.03), plain(0x1a1a1a, 0.8)); handle.position.set(0.22, 0.005, 0);
    g.add(base, wall, handle);
    const eggs = new THREE.Group(); g.add(eggs); g.userData.eggs = eggs;
    return shadowy(g);
  },
  plate() {
    // enamelled tin plate: flowers on top, a blue rolled rim
    const top = mc('plate', () => labelMat(L.plate(), { roughness: 0.2, env: 1.3 }));
    const rim = mc('platerim', () => new THREE.MeshStandardMaterial({ color: 0x1d3c8a, roughness: 0.25, envMapIntensity: 1.3 }));
    const under = mc('plateunder', () => new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.3 }));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.018, 24), [rim, top, under]);
    return shadowy(m);
  },
  milk() {
    const g = new THREE.Group();
    const b = boxItem(0.095, 0.19, 0.095, mc('milk', () => labelMat(L.milk())), mc('milk', () => labelMat(L.milk())));
    b.position.y = -0.02;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.0001, 0.068, 0.05, 4, 1), plain(0xf4f4ee, 0.6));
    roof.rotation.y = Math.PI / 4; roof.position.y = 0.1; roof.scale.set(1, 1, 0.35);
    g.add(b, roof);
    return shadowy(g);
  },
  juice() {
    const g = new THREE.Group();
    const b = boxItem(0.09, 0.2, 0.09, mc('juice', () => labelMat(L.juice())), mc('juice', () => labelMat(L.juice())));
    const cap = new THREE.Mesh(cylGeo(0.014, 0.02, 8), plain(0x3a8a2a, 0.5)); cap.position.set(0, 0.11, 0);
    g.add(b, cap);
    return shadowy(g);
  },
  // a guava (farang): bumpy pale-green skin, a dry crown at the bottom
  apple() {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.038, 16, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const bump = 1 + 0.025 * Math.sin(x * 260 + z * 90) * Math.sin(z * 240 - y * 70);
      const taper = y > 0 ? 1 - 0.14 * (y / 0.038) ** 2 : 1;
      p.setXYZ(i, x * bump * taper, y * 0.96, z * bump * taper);
    }
    geo.computeVertexNormals();
    const a = new THREE.Mesh(geo, mc('apple', () => new THREE.MeshStandardMaterial({ color: 0x9cc65a, roughness: 0.55, envMapIntensity: 1.1 })));
    const stem = new THREE.Mesh(cylGeo(0.0025, 0.012, 5), plain(0x5a4020)); stem.position.y = 0.039;
    const crown = new THREE.Mesh(new THREE.CircleGeometry(0.006, 5), plain(0x3a2a14, 0.9)); crown.rotation.x = Math.PI / 2; crown.position.y = -0.0362;
    g.add(a, stem, crown);
    return shadowy(g);
  },
  // sandwich loaf in its printed bag: long sides, crust on top, a slice at each end
  bread() {
    const side = mc('bread', () => labelMat(L.bread(), { roughness: 0.35, env: 1.2 }));
    const top = mc('breadtop', () => labelMat(L.breadTop(), { roughness: 0.35, env: 1.2 }));
    const end = mc('breadend', () => labelMat(L.breadEnd(), { roughness: 0.35, env: 1.2 }));
    return shadowy(new THREE.Mesh(roundedBox(0.12, 0.11, 0.26, 0.04), [side, side, top, top, end, end]));
  },
  // moo yong (pork floss) in a clear bag with the shop's sticker
  cheese() {
    const floss = mc('cheeseSide', () => labelMat(L.cheese(false), { roughness: 0.3, env: 1.2 }));
    const top = mc('cheese', () => labelMat(L.cheese(), { roughness: 0.3, env: 1.2 }));
    return shadowy(new THREE.Mesh(roundedBox(0.09, 0.045, 0.065, 0.012), [floss, floss, top, floss, floss, floss]));
  },
  // a ten-pack box of 5-baht tom yum noodles
  cereal() {
    return shadowy(boxItem(0.19, 0.27, 0.07, mc('cereal', () => labelMat(L.cereal())), plain(0xf2c418, 0.8)));
  },
  crackers() {
    return shadowy(boxItem(0.12, 0.2, 0.06, mc('crackers', () => labelMat(L.crackers())), plain(0x1f58b0, 0.8)));
  },
  soup() { return shadowy(canItem(0.038, 0.105, mc('soup', () => labelMat(L.soup(), { roughness: 0.4 })))); },
  beans() { return shadowy(canItem(0.038, 0.105, mc('beans', () => labelMat(L.beans(), { roughness: 0.4 })))); },
  cola() { return shadowy(canItem(0.032, 0.12, mc('cola', () => labelMat(L.cola(), { roughness: 0.3, metalness: 0.4 })), M.chrome)); },
  // nam prik pao: dark red chilli paste behind the glass, red tin lid
  pb() {
    const g = new THREE.Group();
    const jar = canItem(0.045, 0.1, mc('pb', () => labelMat(L.pb(), { roughness: 0.35 })), plain(0x5a1a0a, 0.3));
    const lid = new THREE.Mesh(cylGeo(0.047, 0.02, 14), mc('pblid', () => new THREE.MeshStandardMaterial({ color: 0xb5161a, roughness: 0.35, metalness: 0.5 }))); lid.position.y = 0.06;
    g.add(jar, lid);
    return shadowy(g);
  },
  // styrofoam box of khao man gai, shut with two rubber bands
  pizza() {
    const g = new THREE.Group();
    const foam = mc('foam', () => new THREE.MeshStandardMaterial({ color: 0xf2f1ea, roughness: 0.92 }));
    const lidTop = mc('pizza', () => labelMat(L.pizza(), { roughness: 0.9 }));
    const base = new THREE.Mesh(roundedBox(0.33, 0.026, 0.33, 0.01), foam); base.position.y = -0.0095;
    const lid = new THREE.Mesh(roundedBox(0.34, 0.02, 0.34, 0.008), [foam, foam, lidTop, foam, foam, foam]); lid.position.y = 0.0125;
    const b1 = new THREE.Mesh(boxGeo(0.346, 0.0462, 0.006), mc('bandPink', () => new THREE.MeshStandardMaterial({ color: 0xd8406a, roughness: 0.5 }))); b1.position.z = 0.07;
    const b2 = new THREE.Mesh(boxGeo(0.006, 0.0466, 0.346), mc('bandGreen', () => new THREE.MeshStandardMaterial({ color: 0x3a9a4a, roughness: 0.5 }))); b2.position.x = -0.1;
    g.add(base, lid, b1, b2);
    return shadowy(g);
  },
  // kuay tiew to go: soup and noodles in a knotted plastic bag
  takeout() {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.045, 16, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < -0.03) y = -0.03 + (y + 0.03) * 0.35;
      if (y > 0.018) { const t = Math.min(1, (y - 0.018) / 0.027); x *= 1 - 0.8 * t; z *= 1 - 0.8 * t; }
      const k = 1 + 0.04 * Math.sin(i * 2.3);
      p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    const bag = new THREE.Mesh(geo, mc('takeout', () => labelMat(L.takeout(), { transparent: true, roughness: 0.12, env: 1.5 })));
    bag.position.y = -0.01;
    const film = mc('bagfilm', () => new THREE.MeshStandardMaterial({ color: 0xf0f2f0, roughness: 0.15, transparent: true, opacity: 0.5, envMapIntensity: 1.5 }));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.012, 8), film); neck.position.y = 0.038;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0055, 0.0018, 5, 10), mc('bandPink', () => new THREE.MeshStandardMaterial({ color: 0xd8406a, roughness: 0.5 })));
    band.rotation.x = Math.PI / 2; band.position.y = 0.04;
    g.add(bag, neck, band);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), film);
      ear.scale.set(0.5, 1, 0.2); ear.position.set(s * 0.008, 0.049, 0); ear.rotation.z = -s * 0.6;
      g.add(ear);
    }
    return shadowy(g);
  },
  // raw pork belly (moo sam chan) on a foam tray under cling film
  meat() {
    const g = new THREE.Group();
    const foam = mc('meattray', () => new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.9 }));
    const tray = new THREE.Mesh(roundedBox(0.19, 0.012, 0.13, 0.004), foam); tray.position.y = -0.014;
    for (const [w, d, x, z] of [[0.19, 0.008, 0, 0.061], [0.19, 0.008, 0, -0.061], [0.008, 0.13, 0.091, 0], [0.008, 0.13, -0.091, 0]]) {
      const r = new THREE.Mesh(boxGeo(w, 0.016, d), foam); r.position.set(x, -0.006, z); g.add(r);
    }
    const meat = new THREE.Mesh(roundedBox(0.165, 0.02, 0.105, 0.007), mc('meatm', () => new THREE.MeshStandardMaterial({ color: 0xd9928a, roughness: 0.35, envMapIntensity: 1.2 })));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), mc('meattop', () => labelMat(L.meat(), { roughness: 0.3, env: 1.2 })));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.0102;
    const wrap = new THREE.Mesh(boxGeo(0.192, 0.034, 0.132), mc('wrap', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05 })));
    wrap.position.y = -0.003;
    g.add(tray, meat, top, wrap);
    return shadowy(g);
  },
  // chocolate wafer bar: printed on its big faces
  candy() { return shadowy(boxItem(0.12, 0.018, 0.035, plain(0x5a1e88, 0.4), plain(0x5a1e88, 0.4), mc('candy', () => labelMat(L.candy(), { roughness: 0.3 })))); },
  catCan() {
    const lab = mc('catcan', () => labelMat(L.catCan(), { metalness: 0.3, roughness: 0.4 }));
    return shadowy(canItem(0.04, 0.045, lab, M.chrome));
  },
  glass() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 14, 1, true), mc('glassm', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, envMapIntensity: 2 })));
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.029, 0.08, 14), mc('water', () => new THREE.MeshPhysicalMaterial({ color: 0xaaccdd, transparent: true, opacity: 0.35, roughness: 0.02 })));
    water.position.y = -0.012; water.visible = false;
    g.add(m, water);
    g.userData.water = water;
    return g;
  },
  // a tied garbage bag: mostly the usual black "thung dam", now and then a pink one
  trashBag() {
    const g = new THREE.Group();
    const pink = Math.random() < 0.3;
    const mat = mc(pink ? 'bagPink' : 'bag', () => new THREE.MeshStandardMaterial({ color: pink ? 0xc8487a : 0x0c0c0e, roughness: 0.25, envMapIntensity: 1.5 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat);
    m.scale.set(1, 1.15, 0.9);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + Math.sin(i * 1.7) * 0.06 - (y > 0.12 ? (y - 0.12) * 3 : 0); p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k); }
    m.geometry.computeVertexNormals();
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat); knot.position.y = 0.25; knot.scale.set(1, 1.5, 1);
    g.add(m, knot);
    // the two handles knotted into "rabbit ears"
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 10), mat);
      ear.position.set(s * 0.03, 0.29, 0); ear.rotation.z = s * 0.7; ear.scale.set(0.8, 1.2, 1);
      g.add(ear);
    }
    return shadowy(g);
  },
  // cheap red plastic torch with a chrome-plastic head and a yellow slide switch
  flashlight() {
    const g = new THREE.Group();
    const red = plain(0xb81e18, 0.35);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 14), [mc('torch', () => labelMat(L.torch(), { roughness: 0.35 })), red, red]); body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.019, 0.05, 14), mc('torchhead', () => new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.2, metalness: 0.9 }))); head.rotation.x = -Math.PI / 2; head.position.z = -0.1;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.003, 5, 16), red); bezel.position.z = -0.125;
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xfff4d0, emissiveIntensity: 0 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 12), lensMat); lens.position.z = -0.126; lens.rotation.y = Math.PI;
    const btn = new THREE.Mesh(boxGeo(0.012, 0.006, 0.022), plain(0xf0c020, 0.4)); btn.position.set(0, 0.019, 0.02);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.012, 14), red); tail.rotation.x = Math.PI / 2; tail.position.z = 0.08;
    g.add(body, head, bezel, lens, btn, tail);
    g.userData.lens = lensMat;
    return shadowy(g);
  },
  // 90s TV remote: printed key face with Thai captions
  remote() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(roundedBox(0.05, 0.02, 0.17, 0.005), plain(0x26262a, 0.5));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.046, 0.162), mc('remote', () => labelMat(L.remote(), { roughness: 0.55 })));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.0102;
    g.add(b, face);
    return shadowy(g);
  },
  catToy() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), plain(0x8a8a8a, 1)); b.scale.set(1, 0.8, 1.6);
    const tail = new THREE.Mesh(cylGeo(0.002, 0.08, 4), plain(0xd04040)); tail.rotation.x = Math.PI / 2; tail.position.z = 0.07;
    g.add(b, tail);
    return shadowy(g);
  },
  wrapper() {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 0), plain(0xcfcfc8, 0.6, 0.3));
    m.scale.set(1.2, 0.7, 1);
    return shadowy(m);
  },
  // paperback: a 10-baht ghost comic, a dream-number book or a pocket romance
  book() {
    const i = Math.floor(Math.random() * 3);
    const cover = [0x2a0e2a, 0xa8121a, 0xc8785a][i];
    const pages = plain(0xe8e0cc, 0.9), back = plain(cover, 0.7);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 0.03), [pages, back, pages, pages, mc('book' + i, () => labelMat(L.book(i), { roughness: 0.55 })), back]);
    m.userData.kind = ['Ghost comic (kartoon phi)', 'Dream-number book', 'Pocket novel'][i];
    return shadowy(m);
  },
  // flat amber rice-whisky flask, gold cap, excise band on the neck
  whisky() {
    const g = new THREE.Group();
    const glass = mc('whiskyglass', () => new THREE.MeshStandardMaterial({ color: 0x7a3608, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.8 }));
    const body = new THREE.Mesh(roundedBox(0.078, 0.19, 0.044, 0.014), glass); body.position.y = -0.055;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.036, 0.04, 14), glass); shoulder.scale.z = 0.62; shoulder.position.y = 0.06;
    const neck = new THREE.Mesh(cylGeo(0.0135, 0.045, 12), glass); neck.position.y = 0.1025;
    const band = new THREE.Mesh(cylGeo(0.0142, 0.016, 12), plain(0xa81818, 0.5)); band.position.y = 0.097;
    const cap = new THREE.Mesh(cylGeo(0.0145, 0.025, 12), mc('whiskycap', () => new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.3, metalness: 0.8 }))); cap.position.y = 0.1375;
    const label = mc('whisky', () => labelMat(L.whisky(), { roughness: 0.5 }));
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.077), label); front.position.set(0, -0.06, 0.0222);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.077), label); rear.position.set(0, -0.06, -0.0222); rear.rotation.y = Math.PI;
    g.add(body, shoulder, neck, band, cap, front, rear);
    return shadowy(g);
  },
};

// ---------------------------------------------------------------- definitions
const SMALL_HOLD = { pos: [0.17, -0.17, -0.42], rot: [0, 0, 0] };
function foodDef(name, build, shape, o) {
  return { name, build, shape, mass: o.mass ?? 0.3, sound: o.sound ?? 'food', small: o.small ?? true, hold: o.hold || SMALL_HOLD, food: o.food, state: o.state, open: o.open, heldExtra: o.heldExtra };
}

export const ITEMS = {
  mug: {
    name: (it) => (it.state.fill > 0 ? (it.state.hot ? 'Coffee' : 'Mug of water') : 'Mug'),
    build: B.mug, shape: { type: 'cyl', r: 0.043, h: 0.095 }, mass: 0.32, sound: 'ceramic', small: true,
    hold: { pos: [0.16, -0.16, -0.4], rot: [0, -0.9, 0] }, state: { fill: 0, hot: false },
    refresh(it) { const l = it.mesh.userData.liquid; l.visible = it.state.fill > 0.01; l.position.y = -0.045 + 0.085 * it.state.fill; l.material = it.state.hot ? l.material : l.material; },
    held(it, ctx) {
      if (it.state.fill > 0.05) return [{ key: 'F', label: it.state.hot ? 'Drink coffee' : 'Drink' }];
      if (ctx.hover && ctx.hover.isSink && ctx.hover.running) return [{ key: 'F', label: 'Fill with water' }];
      return [];
    },
    use(it, ctx) {
      if (it.state.fill > 0.05) {
        return { anim: 'drink', dur: 2.0, sound: it.state.hot ? 'sip' : 'gulp', at: [[1.3, () => {
          it.state.fill = Math.max(0, it.state.fill - 0.34); it.refresh();
          G.player.hunger.drink(it.state.hot ? 0.06 : 0.05, { coffee: it.state.hot });
          if (it.state.hot) emit('coffee'); if (it.state.fill <= 0.02) { it.state.fill = 0; it.state.hot = false; it.refresh(); }
        }]] };
      }
      if (ctx.hover && ctx.hover.isSink && ctx.hover.running) {
        return { anim: 'fill', dur: 1.8, at: [[1.5, () => { it.state.fill = 1; it.state.hot = false; it.refresh(); }]] };
      }
      return null;
    },
  },
  glass: {
    name: (it) => (it.state.fill > 0 ? 'Glass of water' : 'Glass'), build: B.glass, shape: { type: 'cyl', r: 0.035, h: 0.11 }, mass: 0.2, sound: 'glass', small: true, state: { fill: 0 },
    refresh(it) { const w = it.mesh.userData.water; w.visible = it.state.fill > 0.01; w.scale.y = Math.max(0.01, it.state.fill); w.position.y = -0.052 + 0.04 * it.state.fill; },
    held(it, ctx) { if (it.state.fill > 0.05) return [{ key: 'F', label: 'Drink' }]; if (ctx.hover && ctx.hover.isSink && ctx.hover.running) return [{ key: 'F', label: 'Fill with water' }]; return []; },
    use(it, ctx) {
      if (it.state.fill > 0.05) return { anim: 'drink', dur: 1.8, sound: 'gulp', at: [[1.2, () => { it.state.fill = Math.max(0, it.state.fill - 0.5); it.refresh(); G.player.hunger.drink(0.06); }]] };
      if (ctx.hover && ctx.hover.isSink && ctx.hover.running) return { anim: 'fill', dur: 1.6, at: [[1.4, () => { it.state.fill = 1; it.refresh(); }]] };
      return null;
    },
  },
  catBox: {
    name: (it) => (it.state.packets > 0 ? 'Meow Dee cat food box' : 'Empty Meow Dee box'), build: B.catBox, shape: { type: 'box', size: [0.19, 0.25, 0.08] }, mass: 0.6, sound: 'cardboard', small: true,
    hold: { pos: [0.1, -0.2, -0.42], rot: [0.15, -0.35, 0] }, state: { open: false, packets: 6 },
    refresh(it) { it.mesh.userData.flap.rotation.x = it.state.open ? -2.2 : 0; },
    held(it) { if (!it.state.open) return [{ key: 'F', label: 'Open box' }]; if (it.state.packets > 0) return [{ key: 'F', label: 'Take a packet' }]; return []; },
    use(it) {
      if (!it.state.open) return { anim: 'open', dur: 1.1, sound: 'boxOpen', at: [[0.6, () => { it.state.open = true; it.refresh(); }]] };
      if (it.state.packets > 0) {
        return { anim: 'takeFrom', dur: 1.0, sound: 'packetRustle', at: [[0.6, () => {
          it.state.packets--;
          const pk = new Item('catPacket', new THREE.Vector3(), {});
          G.player.inv.swapInFromHand(it, pk);
        }]] };
      }
      return null;
    },
  },
  catPacket: {
    name: (it) => (it.state.stage === 0 ? 'Cat food pouch (tuna)' : it.state.stage === 1 ? 'Open pouch' : 'Empty pouch'), build: B.catPacket, shape: { type: 'box', size: [0.085, 0.13, 0.02] }, mass: 0.09, sound: 'paper', small: true,
    hold: { pos: [0.14, -0.15, -0.38], rot: [0.1, -0.2, 0] }, state: { stage: 0 },
    refresh(it) { it.mesh.userData.top.visible = it.state.stage === 0; },
    held(it, ctx) {
      if (it.state.stage === 0) return [{ key: 'F', label: 'Rip open' }];
      if (it.state.stage === 1) return ctx.hover && ctx.hover.isBowl ? [{ key: 'F', label: 'Pour into bowl' }] : (G.story.day >= 5 ? [{ key: 'F', label: 'Eat it' }, { key: '', label: 'look at the bowl to pour' }] : [{ key: '', label: 'Look at the cat bowl to pour' }]);
      return [];
    },
    use(it, ctx) {
      if (it.state.stage === 0) return { anim: 'rip', dur: 1.2, sound: 'rip', at: [[0.7, () => { it.state.stage = 1; it.refresh(); G.particles && G.particles.crumbs(it.mesh.getWorldPosition(new THREE.Vector3()), 6, 0x8a5a2a); }]] };
      if (it.state.stage === 1 && ctx.hover && ctx.hover.isBowl) {
        const bowl = ctx.hover;
        return { anim: 'pour', dur: 2.2, sound: 'kibble', target: bowl.pourPoint(), at: [[0.5, () => bowl.startPour()], [1.9, () => { bowl.fill(1); it.state.stage = 2; it.refresh(); emit('catFed'); }]] };
      }
      if (it.state.stage === 1 && G.story.day >= 5) {
        return { anim: 'eat', dur: 2.6, sound: 'chewWet', at: [[1.2, () => { it.state.stage = 2; it.refresh(); G.player.hunger.eat(0.18, { catfood: true }); emit('ateCatFood'); }]] };
      }
      return null;
    },
  },
  eggs: {
    name: (it) => (it.state.n > 0 ? `Eggs (${it.state.n})` : 'Empty egg tray'), build: B.eggs, shape: { type: 'box', size: [0.3, 0.07, 0.11] }, mass: 0.4, sound: 'cardboard', small: true,
    hold: { pos: [0.08, -0.2, -0.42], rot: [0.25, 0, 0] }, state: { n: 6 },
    refresh(it) { const e = it.mesh.userData.eggs; e.forEach((m, i) => (m.visible = i < it.state.n)); it.mesh.userData.lid.rotation.x = -1.9; },
    held(it) { return it.state.n > 0 ? [{ key: 'F', label: 'Take an egg' }] : []; },
    use(it) {
      if (it.state.n <= 0) return null;
      return { anim: 'takeFrom', dur: 0.8, at: [[0.5, () => { it.state.n--; it.refresh(); G.player.inv.swapInFromHand(it, new Item('egg', new THREE.Vector3(), {})); }]] };
    },
  },
  egg: {
    name: 'Egg', build: B.egg, shape: { type: 'sphere', r: 0.025 }, mass: 0.06, sound: 'egg', small: true, hold: { pos: [0.15, -0.14, -0.36], rot: [0, 0, 0] },
    fragile: true,
    held(it, ctx) {
      if (ctx.hover && ctx.hover.isPan) return [{ key: 'F', label: 'Crack egg into pan' }];
      if (G.story.day >= 4) return [{ key: 'F', label: 'Eat it raw' }];
      return [{ key: '', label: 'Crack it into the pan' }];
    },
    use(it, ctx) {
      if (ctx.hover && ctx.hover.isPan) {
        const pan = ctx.hover;
        return { anim: 'crack', dur: 1.3, target: pan.mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)), at: [[0.8, () => { sfx('eggCrack', { pos: pan.mesh.position }); pan.addEgg(); G.player.inv.consumeHand(); }]] };
      }
      if (G.story.day >= 4) return { anim: 'eat', dur: 1.6, sound: 'slurp', at: [[0.9, () => { G.player.hunger.eat(0.08, { raw: true }); G.player.inv.consumeHand(); }]] };
      return null;
    },
    onBreak(it) { G.decals && G.decals.egg(it.mesh.position); sfx('eggCrack', { pos: it.mesh.position }); it.destroy(); },
  },
  pan: {
    name: (it) => (it.eggs > 0 ? (it.cook >= 1 ? 'Fried eggs (khai dao)' : 'Eggs frying') : 'Frying pan'), build: B.pan, shape: { type: 'cyl', r: 0.13, h: 0.04 }, mass: 0.9, sound: 'metal', small: false,
    hold: { pos: [0.12, -0.2, -0.45], rot: [0, -1.3, 0] },
    init(it) { it.isPan = true; it.eggs = 0; it.cook = 0; it.addEgg = () => addPanEgg(it); },
    worldExtra(it) {
      if (it.eggs > 0 && it.cook >= 0.98) return [{ key: 'F', label: 'Eat the eggs' }];
      return [];
    },
    worldUse(it) {
      if (it.eggs > 0 && it.cook >= 0.98) return { anim: 'eatFork', dur: 4.2, sound: 'chewSoft', at: [[1.2, () => {}], [3.4, () => { G.player.hunger.eat(0.16 * it.eggs, { cooked: true, eggs: true }); it.eggs = 0; it.cook = 0; it.mesh.userData.eggs.clear(); emit('ateEggs'); }]] };
      return null;
    },
    held(it) { return []; },
  },
  plate: { name: 'Enamel plate', build: B.plate, shape: { type: 'cyl', r: 0.12, h: 0.02 }, mass: 0.4, sound: 'ceramic', small: false, hold: { pos: [0.1, -0.22, -0.45], rot: [0, 0, 0] } },
  milk: foodDef((it) => (it.state.left > 0 ? 'Milk (nom sot)' : 'Empty milk carton'), B.milk, { type: 'box', size: [0.095, 0.24, 0.095] }, { mass: 0.9, sound: 'cardboard', state: { left: 4 }, hold: { pos: [0.16, -0.16, -0.42], rot: [0, -0.4, 0] }, food: { drink: true, sips: 4, nut: 0.05, spoilDay: 3 } }),
  juice: foodDef((it) => (it.state.left > 0 ? 'Orange juice (som sai nam phueng)' : 'Empty juice carton'), B.juice, { type: 'box', size: [0.09, 0.22, 0.09] }, { mass: 0.8, sound: 'cardboard', state: { left: 4 }, food: { drink: true, sips: 4, nut: 0.05 } }),
  apple: foodDef('Guava (farang)', B.apple, { type: 'sphere', r: 0.038 }, { mass: 0.15, food: { bites: 4, nut: 0.1, crunch: 'crunch' } }),
  bread: foodDef((it) => (it.state.left > 0 ? 'Sandwich bread' : 'Empty bread bag'), B.bread, { type: 'box', size: [0.12, 0.11, 0.26] }, { mass: 0.4, sound: 'paper', state: { left: 6 }, food: { bites: 6, nut: 0.07, crunch: 'soft', per: 'slice' } }),
  cheese: foodDef('Moo yong (pork floss)', B.cheese, { type: 'box', size: [0.09, 0.045, 0.065] }, { mass: 0.2, food: { bites: 3, nut: 0.08, crunch: 'soft' } }),
  cereal: foodDef((it) => (it.state.left > 0 ? 'Papa noodles (tom yum)' : 'Empty noodle box'), B.cereal, { type: 'box', size: [0.19, 0.27, 0.07] }, { mass: 0.4, sound: 'cardboard', state: { left: 8 }, hold: { pos: [0.12, -0.2, -0.45], rot: [0.1, -0.3, 0] }, food: { bites: 8, nut: 0.05, crunch: 'crunch', per: 'handful' } }),
  crackers: foodDef((it) => (it.state.left > 0 ? 'Cream crackers' : 'Empty cracker box'), B.crackers, { type: 'box', size: [0.12, 0.2, 0.06] }, { mass: 0.3, sound: 'cardboard', state: { left: 6 }, food: { bites: 6, nut: 0.04, crunch: 'crunch', per: 'cracker' } }),
  soup: foodDef('Sardines in tomato sauce', B.soup, { type: 'cyl', r: 0.038, h: 0.105 }, { mass: 0.4, sound: 'can', state: { left: 4, open: false }, food: { bites: 4, nut: 0.07, crunch: 'wet', can: true } }),
  beans: foodDef('Pickled mustard greens (can)', B.beans, { type: 'cyl', r: 0.038, h: 0.105 }, { mass: 0.4, sound: 'can', state: { left: 4, open: false }, food: { bites: 4, nut: 0.08, crunch: 'wet', can: true } }),
  cola: foodDef('Red soda (nam daeng)', B.cola, { type: 'cyl', r: 0.032, h: 0.12 }, { mass: 0.35, sound: 'can', state: { left: 3, open: false }, food: { drink: true, sips: 3, nut: 0.04, can: true } }),
  pb: foodDef('Nam prik pao (chilli paste)', B.pb, { type: 'cyl', r: 0.046, h: 0.12 }, { mass: 0.45, sound: 'glass', state: { left: 5 }, food: { bites: 5, nut: 0.07, crunch: 'soft', per: 'spoonful' } }),
  pizza: foodDef((it) => (it.state.left > 0 ? `Khao man gai, leftover (${it.state.left})` : 'Empty foam box'), B.pizza, { type: 'box', size: [0.34, 0.045, 0.34] }, { mass: 0.6, sound: 'cardboard', small: false, state: { left: 3 }, hold: { pos: [0.05, -0.24, -0.48], rot: [0.3, 0, 0] }, food: { bites: 3, nut: 0.12, crunch: 'soft', per: 'portion' } }),
  takeout: foodDef('Noodle soup in a bag (kuay tiew)', B.takeout, { type: 'box', size: [0.1, 0.09, 0.1] }, { mass: 0.3, sound: 'paper', state: { left: 4 }, food: { bites: 4, nut: 0.09, crunch: 'wet' } }),
  meat: foodDef('Raw pork belly (moo sam chan)', B.meat, { type: 'box', size: [0.19, 0.04, 0.13] }, { mass: 0.5, sound: 'meat', state: { left: 4 }, food: { bites: 4, nut: 0.16, crunch: 'wet', raw: true, minDay: 3 } }),
  candy: foodDef('Waffy wafer bar', B.candy, { type: 'box', size: [0.12, 0.018, 0.035] }, { mass: 0.06, sound: 'paper', state: { left: 2 }, food: { bites: 2, nut: 0.07, crunch: 'soft' } }),
  catCan: foodDef('Cat food can (tuna)', B.catCan, { type: 'cyl', r: 0.04, h: 0.045 }, { mass: 0.2, sound: 'can', state: { left: 3, open: false }, food: { bites: 3, nut: 0.1, crunch: 'wet', catfood: true, minDay: 5, can: true } }),
  trashBag: { name: 'Trash bag', build: B.trashBag, shape: { type: 'sphere', r: 0.22 }, mass: 3, sound: 'bag', small: false, twoHands: true, hold: { pos: [0.0, -0.42, -0.42], rot: [0, 0, 0] } },
  flashlight: {
    name: 'Torch (fai chai)', build: B.flashlight, shape: { type: 'cyl', r: 0.025, h: 0.2 }, mass: 0.3, sound: 'plastic', small: true,
    hold: { pos: [0.18, -0.16, -0.36], rot: [0, 0, 0] }, state: { on: false },
    held(it) { return [{ key: 'F', label: it.state.on ? 'Switch off flashlight' : 'Switch on flashlight' }]; },
    use(it) { it.state.on = !it.state.on; sfx('click', { vol: 0.5 }); emit('flashlight', it.state.on); it.refresh(); return { anim: 'none', dur: 0.15 }; },
    refresh(it) { it.mesh.userData.lens.emissiveIntensity = it.state.on ? 3 : 0; },
  },
  remote: {
    name: 'TV remote', build: B.remote, shape: { type: 'box', size: [0.05, 0.02, 0.17] }, mass: 0.12, sound: 'plastic', small: true, hold: { pos: [0.16, -0.15, -0.36], rot: [0.5, 0, 0] },
    held() { return [{ key: 'F', label: 'Press power' }]; },
    use() { G.world.named.tv && G.world.named.tv.toggle(); sfx('click', { vol: 0.4 }); return { anim: 'none', dur: 0.2 }; },
  },
  catToy: { name: 'Toy mouse', build: B.catToy, shape: { type: 'sphere', r: 0.025 }, mass: 0.03, sound: 'soft', small: true, hold: SMALL_HOLD, toy: true },
  wrapper: { name: 'Wrapper', build: B.wrapper, shape: { type: 'sphere', r: 0.022 }, mass: 0.01, sound: 'paper', small: true, hold: SMALL_HOLD },
  book: { name: (it) => it.mesh.userData.kind || 'Book', build: B.book, shape: { type: 'box', size: [0.15, 0.22, 0.03] }, mass: 0.4, sound: 'book', small: true, hold: { pos: [0.14, -0.15, -0.4], rot: [0, -0.3, 0] } },
};

function addPanEgg(pan) {
  const g = pan.mesh.userData.eggs;
  const white = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.3, transparent: true, opacity: 0.55 }));
  white.rotation.x = -Math.PI / 2;
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf0a010, roughness: 0.2 }));
  yolk.scale.y = 0.5;
  const ang = pan.eggs * 2.3;
  white.position.set(Math.cos(ang) * 0.045, -0.009, Math.sin(ang) * 0.045);
  yolk.position.copy(white.position).add(new THREE.Vector3(0.005, 0.004, 0));
  white.scale.set(1 + Math.random() * 0.2, 1, 1);
  g.add(white, yolk);
  pan.eggs++;
  pan.cook = Math.min(pan.cook, 0.2);
  pan.eggMeshes = (pan.eggMeshes || []).concat([white]);
}

// generic food usage (bites / sips / cans)
function foodHeld(it, ctx) {
  const f = it.def.food; if (!f) return [];
  if (it.state.left !== undefined && it.state.left <= 0) return [];
  if (f.can && !it.state.open) return [{ key: 'F', label: f.drink ? 'Open can' : 'Pull the tab' }];
  if (f.minDay && G.story.day < f.minDay) return [{ key: 'F', label: f.catfood ? 'Eat it?' : 'Eat it raw?' }];
  if (f.drink) return [{ key: 'F', label: 'Drink' }];
  return [{ key: 'F', label: f.per ? `Eat a ${f.per}` : 'Eat' }];
}
function foodUse(it, ctx) {
  const f = it.def.food;
  if (it.state.left !== undefined && it.state.left <= 0) return null;
  if (f.can && !it.state.open) return { anim: 'open', dur: 1.0, sound: f.drink ? 'canOpen' : 'canTab', at: [[0.6, () => { it.state.open = true; }]] };
  if (f.minDay && G.story.day < f.minDay) {
    say(f.catfood ? "...What am I doing? That's Khanom's food." : "I can't eat that raw. I'm not that hungry.");
    return { anim: 'inspect', dur: 1.0 };
  }
  const spoiled = f.spoilDay && G.story.day >= f.spoilDay;
  if (f.drink) {
    return { anim: 'drink', dur: 2.0, sound: 'gulp', at: [[1.2, () => {
      it.state.left--;
      if (spoiled) { say('Ugh. Sour already, in this heat... I drank it anyway.'); G.player.hunger.drink(0.03, { spoiled: true }); } else G.player.hunger.drink(f.nut, {});
      if (it.state.left <= 0) emptyFood(it);
    }]] };
  }
  const anim = G.story.day >= 4 ? 'eatFrantic' : 'eat';
  const dur = G.story.day >= 4 ? 1.5 : 2.2;
  return { anim, dur, sound: f.crunch === 'crunch' ? 'chewCrunch' : f.crunch === 'wet' ? 'chewWet' : 'chewSoft', at: [[dur * 0.45, () => {
    const meta = { raw: !!f.raw, catfood: !!f.catfood, kind: it.type };
    G.player.hunger.eat(f.nut, meta);
    if (f.raw) emit('ateRaw', it);
    if (f.catfood) emit('ateCatFood', it);
    if (it.state.left !== undefined) { it.state.left--; if (it.state.left <= 0) emptyFood(it); else it.biteVisual(); }
    else { it.bites = (it.bites ?? f.bites) - 1; if (it.bites <= 0) G.player.inv.consumeHand(true); else it.biteVisual(); }
  }]] };
}
function emptyFood(it) {
  // packaging stays (now empty) for boxes/cartons; small foods vanish
  if (['apple', 'cheese', 'candy', 'meat', 'takeout'].includes(it.type)) G.player.inv.consumeHand(true);
  else { it.empty = true; it.biteVisual(); }
}

// ---------------------------------------------------------------- Item class
export class Item extends Interactable {
  constructor(type, pos, o = {}) {
    const def = ITEMS[type];
    if (!def) throw new Error('unknown item ' + type);
    const mesh = def.build(o.state);
    mesh.position.copy(pos);
    mesh.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    (o.parent || G.world.root).add(mesh);
    super(mesh, { name: type });
    this.type = type; this.def = def; this.mesh = mesh;
    this.state = { ...(def.state || {}), ...(o.state || {}) };
    this.small = def.small;
    this.isItem = true;
    this.body = G.physics.addProp(mesh, def.shape, { mass: def.mass, sound: def.sound, sleeping: o.sleeping ?? true });
    this.prop = G.physics.props[G.physics.props.length - 1];
    this.bites = def.food && def.food.bites && this.state.left === undefined ? def.food.bites : undefined;
    this.baseScale = mesh.scale.clone();
    G.world.items.push(this);
    if (def.init) def.init(this);
    this.refresh();
    if (o.inHand) this.detach();
  }
  refresh() { if (this.def.refresh) this.def.refresh(this); }
  get label() { return typeof this.def.name === 'function' ? this.def.name(this) : this.def.name; }
  actions(ctx) {
    const a = [];
    const extra = this.def.worldExtra ? this.def.worldExtra(this, ctx) : [];
    a.push(...extra);
    a.push({ key: 'E', label: 'Take ' + this.label.toLowerCase() });
    a.push({ key: 'LMB', label: 'Grab' });
    return a;
  }
  heldActions(ctx) {
    let a = this.def.held ? this.def.held(this, ctx) : foodHeld(this, ctx);
    if (!this.def.held && !this.def.food) a = [];
    return a;
  }
  useHeld(ctx) {
    if (this.def.use) return this.def.use(this, ctx);
    if (this.def.food) return foodUse(this, ctx);
    return null;
  }
  useWorld(ctx) { return this.def.worldUse ? this.def.worldUse(this, ctx) : null; }
  biteVisual() {
    const f = this.def.food;
    if (!f) return;
    if (this.state.left !== undefined) { if (this.empty) this.mesh.traverse((c) => { if (c.isMesh && c.material && !Array.isArray(c.material)) c.material = c.material; }); return; }
    const k = clamp((this.bites ?? 1) / f.bites, 0.25, 1);
    this.mesh.scale.copy(this.baseScale).multiplyScalar(0.55 + 0.45 * k);
  }
  detach() {
    if (this.prop.held) return;
    this.prop.held = true;
    G.physics.world.removeBody(this.body);
  }
  attach(pos, quat, vel = null, angVel = null) {
    if (this.mesh.parent !== G.world.root) G.world.root.attach(this.mesh);
    this.mesh.position.copy(pos); this.mesh.quaternion.copy(quat);
    this.body.position.set(pos.x, pos.y, pos.z);
    this.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    this.body.velocity.set(vel ? vel.x : 0, vel ? vel.y : 0, vel ? vel.z : 0);
    this.body.angularVelocity.set(angVel ? angVel.x : 0, angVel ? angVel.y : 0, angVel ? angVel.z : 0);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    if (this.prop.held) { G.physics.world.addBody(this.body); this.prop.held = false; }
    this.body.wakeUp();
  }
  destroy() {
    this.detach();
    G.physics.removeProp(this.body);
    this.mesh.removeFromParent();
    G.world.removeInteractable(this);
    const i = G.world.items.indexOf(this); if (i >= 0) G.world.items.splice(i, 1);
    this.dead = true;
  }
  update(dt) {
    if (this.def.tick) this.def.tick(this, dt);
    // fragile items break on hard impacts (handled via impact event)
  }
}

// break fragile things (eggs) on hard impacts
let hooked = false;
export function hookItemEvents() {
  if (hooked) return; hooked = true;
  import('../core/globals.js').then(({ on }) => {
    on('impact', (e) => {
      const it = G.world.items.find((i) => i.body === e.body);
      if (it && it.def.fragile && e.vol > 0.25 && it.def.onBreak) it.def.onBreak(it);
    });
  });
}

// things from the CC0 model set you can pick up, carry, drop and throw
const MED_HOLD = { pos: [0.12, -0.24, -0.45], rot: [0, 0.4, 0] };
const BIG_HOLD = { pos: [0.0, -0.32, -0.5], rot: [0, 0, 0] };
Object.assign(ITEMS, {
  kettle: { name: 'Kettle', build: () => centered('kettle'), shape: { type: 'cyl', r: 0.12, h: 0.3 }, mass: 1.1, sound: 'metal', small: false, hold: MED_HOLD, state: { heat: 0 } },
  jug: { name: 'Water jug', build: () => centered('jug'), shape: { type: 'cyl', r: 0.08, h: 0.21 }, mass: 0.6, sound: 'ceramic', small: false, hold: MED_HOLD },
  woodBowl: { name: 'Wooden bowl', build: () => centered('bowl'), shape: { type: 'cyl', r: 0.15, h: 0.09 }, mass: 0.3, sound: 'wood', small: false, hold: MED_HOLD },
  pot: { name: 'Pot', build: () => centered('pot'), shape: { type: 'cyl', r: 0.11, h: 0.18 }, mass: 1.0, sound: 'metal', small: false, hold: MED_HOLD },
  wine: { name: 'Rice whisky (Mae Ping)', build: B.whisky, shape: { type: 'cyl', r: 0.04, h: 0.3 }, mass: 0.9, sound: 'glass', small: false, hold: MED_HOLD },
  cleaner: { name: 'Spray cleaner', build: () => centered('cleaner'), shape: { type: 'box', size: [0.16, 0.32, 0.12] }, mass: 0.6, sound: 'plastic', small: false, hold: MED_HOLD },
  bleach: { name: 'Bleach', build: () => centered('bleach'), shape: { type: 'box', size: [0.08, 0.29, 0.06] }, mass: 0.7, sound: 'plastic', small: false, hold: MED_HOLD },
  plantPot: { name: 'Potted plant', build: () => centered('plant', ['potted_plant_04_dirt', 'potted_plant_04_plant', 'potted_plant_04_pot']), shape: { type: 'cyl', r: 0.08, h: 0.27 }, mass: 0.8, sound: 'ceramic', small: false, hold: MED_HOLD },
  photo: { name: 'Photo frame', build: () => centered('photoFrame'), shape: { type: 'box', size: [0.1, 0.25, 0.2] }, mass: 0.3, sound: 'wood', small: true, hold: { pos: [0.14, -0.15, -0.4], rot: [0, -1.2, 0] } },
  cardboard: { name: 'Cardboard box', build: () => centered('box'), shape: { type: 'box', size: [0.38, 0.35, 0.52] }, mass: 1.4, sound: 'cardboard', small: false, twoHands: true, hold: BIG_HOLD },
  basket: { name: 'Rattan basket', build: () => centered('basket'), shape: { type: 'box', size: [0.38, 0.12, 0.3] }, mass: 0.4, sound: 'wood', small: false, hold: MED_HOLD },
  dustpan: { name: 'Dustpan', build: () => centered('dustpan'), shape: { type: 'box', size: [0.34, 0.1, 0.37] }, mass: 0.3, sound: 'plastic', small: false, hold: MED_HOLD },
  twinBell: {
    name: 'Alarm clock', build: () => centered('alarmClock'), shape: { type: 'box', size: [0.14, 0.17, 0.06] }, mass: 0.4, sound: 'metal', small: true, hold: { pos: [0.14, -0.15, -0.38], rot: [0, -0.5, 0] },
  },
});

export function spawn(type, x, y, z, o = {}) { return new Item(type, new THREE.Vector3(x, y, z), o); }
