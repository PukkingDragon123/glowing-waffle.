// The CRT on the low cabinet: woodgrain and plastic on rabbit ears, a VCR
// blinking 12:00 underneath. Channel 1997: the morning news on the float, a
// lakorn, and from day 3 the Deputy Minister, who asks you not to panic, and
// keeps asking.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { Button } from './interactables.js';
import { roundedBox, cylGeo } from '../gfx/geo.js';
import { knobGeo } from '../gfx/shapes.js';

const sfx = (n, o) => G.audio && G.audio.play(n, o);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class CrtTV {
  constructor(group) {
    this.g = group;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
    // cabinet: woodgrain shell, plastic front, tapered tube housing behind
    add(roundedBox(0.64, 0.5, 0.46, 0.035), M.woodDark, 0, 0.25, 0);
    add(roundedBox(0.6, 0.46, 0.04, 0.02), M.plasticDark, 0, 0.25, 0.22);
    const back = new THREE.CylinderGeometry(0.16, 0.26, 0.22, 4, 1); back.rotateY(Math.PI / 4); back.rotateX(Math.PI / 2); back.scale(1.2, 0.95, 1);
    add(back, M.plasticDark, 0, 0.26, -0.32);
    // the screen: a bulged plane under a glass face
    const sg = new THREE.PlaneGeometry(0.44, 0.33, 12, 10);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, 0.018 * (1 - (x / 0.22) ** 2) * (1 - (y / 0.165) ** 2)); }
    sg.computeVertexNormals();
    this.cv = document.createElement('canvas'); this.cv.width = 160; this.cv.height = 120;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = THREE.LinearFilter;
    this.screenMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.18, metalness: 0, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0 });
    this.screenMat.userData.keepGloss = true;
    add(sg, this.screenMat, -0.04, 0.27, 0.243);
    // control strip: knobs, a speaker grille, the power button
    for (let i = 0; i < 2; i++) add(knobGeo(0.017), M.plasticDark, 0.245, 0.36 - i * 0.07, 0.242);
    for (let i = 0; i < 6; i++) add(roundedBox(0.06, 0.004, 0.004, 0.001), M.black, 0.245, 0.2 - i * 0.012, 0.243);
    this.led = new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff2010, emissiveIntensity: 0 });
    add(new THREE.SphereGeometry(0.005, 6, 4), this.led, 0.245, 0.08, 0.243);
    const pwr = add(roundedBox(0.03, 0.02, 0.012, 0.004), M.chrome, 0.245, 0.11, 0.245);
    // rabbit ears
    add(roundedBox(0.12, 0.03, 0.08, 0.012), M.plasticDark, 0.02, 0.515, -0.05);
    for (const s of [-1, 1]) { const ant = add(cylGeo(0.0025, 0.5, 4), M.chrome, 0.02 + s * 0.12, 0.74, -0.05); ant.rotation.z = -s * 0.5; }
    // the VCR on the shelf below, blinking 12:00
    add(roundedBox(0.43, 0.085, 0.3, 0.008), M.plasticDark, 0, -0.17, 0.02);
    this.vcrCv = document.createElement('canvas'); this.vcrCv.width = 64; this.vcrCv.height = 16;
    this.vcrTex = new THREE.CanvasTexture(this.vcrCv);
    const vcrd = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.02), new THREE.MeshBasicMaterial({ map: this.vcrTex, toneMapped: false }));
    vcrd.position.set(0.11, -0.16, 0.172); group.add(vcrd);
    add(roundedBox(0.18, 0.012, 0.01, 0.003), M.black, -0.08, -0.15, 0.172);
    this.light = new THREE.PointLight(0x9ab0ff, 0, 4.5, 2); this.light.position.set(0, 0.3, 0.6); group.add(this.light);
    this.on = false; this.t = 0;
    new Button(pwr, { name: 'tv', label: () => (this.on ? 'Turn off TV' : 'Turn on TV'), onUse: () => this.toggle() });
    new Button(group.children[1], { name: 'tv2', label: () => (this.on ? 'Turn off TV' : 'Turn on TV'), onUse: () => this.toggle() });
    G.tv = this;
  }
  toggle() {
    this.on = !this.on;
    sfx(this.on ? 'crtOn' : 'click', { pos: this.g.getWorldPosition(V()), vol: 0.6 });
    if (this.loop) { this.loop.stop(0.2); this.loop = null; }
    if (this.on) {
      const day = G.story.day, p = this.g.getWorldPosition(V());
      this.loop = G.audio && G.audio.loop(day === 2 ? 'tvLakorn' : day >= 3 ? 'static' : 'tvBabble', { pos: p, vol: day >= 3 ? 0.12 : 0.3 });
      if (day >= 3) this.speech(p);
      if (day >= 3 && !this.said) { this.said = true; setTimeout(() => G.hud.inner("He's been on every channel since this morning."), 1500); }
    } else if (this.talk) { clearTimeout(this.talk); this.talk = null; }
    G.world.extraLight = G.world.extraLight || [];
    if (!this.lightHooked) { this.lightHooked = true; G.world.extraLight.push((p) => (this.on ? Math.max(0, 0.45 * (1 - p.distanceTo(this.g.getWorldPosition(V())) / 4)) : 0)); }
  }
  // the Deputy Minister: the same speech, a little worse each day
  speech(p) {
    const day = G.story.day;
    const lines = day >= 6
      ? ['Do not panic.', 'Stay inside. Feed it.', 'The baht is strong. The baht is strong. The baht is strong.', 'Meridian Pacific is your friend.']
      : ['Brothers and sisters, do not panic.', 'The fundamentals of the Thai economy are strong.', 'The government will not let a single depositor lose a single satang.', 'Please stay indoors after dark. The lights over Sukhumvit are lanterns.', 'Vote number nine.'];
    let i = 0;
    const next = () => {
      if (!this.on) return;
      const l = lines[i++ % lines.length];
      const h = G.audio && G.audio.speak(l, { voice: day >= 6 ? 'machine' : 'supervisor', phone: true, pos: p, vol: 0.45, distort: 2 });
      if (G.player && G.player.ctrl.body.position.distanceTo(p) < 4.5) G.hud.say(l, { who: 'รมช. ประสิทธิ์ · TV', cls: day >= 5 ? 'strange' : 'voice', force: true, dur: (h && h.dur ? h.dur : 3) + 0.6 });
      this.talk = setTimeout(next, ((h && h.dur) || 3) * 1000 + 2200);
    };
    this.talk = setTimeout(next, 1200);
  }
  update(dt) {
    this.t += dt;
    const vc = this.vcrCv.getContext('2d');
    vc.fillStyle = '#020403'; vc.fillRect(0, 0, 64, 16);
    if (Math.floor(this.t * 1.6) % 2 === 0) { vc.fillStyle = '#5aff9a'; vc.font = 'bold 13px monospace'; vc.textAlign = 'center'; vc.fillText('12:00', 32, 12); }
    this.vcrTex.needsUpdate = true;
    this.led.emissiveIntensity = this.on ? 0 : 1.5;
    this.screenMat.emissiveIntensity = this.on ? 1.3 : 0;
    this.light.intensity = this.on ? 0.6 + Math.random() * 0.3 : 0;
    if (!this.on || G.frame % 2) return;
    const c = this.ctx, W = 160, H = 120, day = G.story.day;
    const TH = '"Kanit", "Leelawadee UI", Tahoma, sans-serif';
    if (day >= 3) {
      // the Deputy Minister at a podium in front of the flag-blue curtain
      c.fillStyle = '#1a3a8a'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#22489a' : '#16327a'; c.fillRect(i * 20, 0, 20, H); }
      c.fillStyle = '#d8b878'; c.beginPath(); c.arc(80, 46, 17, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a1410'; c.beginPath(); c.arc(80, 38, 17, Math.PI, 0); c.fill();
      // the face: a smile that is too wide, and from day 5 two black lenses
      c.strokeStyle = '#5a1010'; c.lineWidth = 2; c.beginPath(); c.moveTo(70 - day, 53); c.quadraticCurveTo(80, 60 + day, 90 + day, 53); c.stroke();
      if (day >= 5) { c.fillStyle = '#000'; c.fillRect(68, 42, 9, 6); c.fillRect(83, 42, 9, 6); } else { c.fillStyle = '#111'; c.fillRect(72, 44, 3, 3); c.fillRect(85, 44, 3, 3); }
      c.fillStyle = '#3a3a44'; c.fillRect(56, 64, 48, 40); c.fillStyle = '#e8e4d8'; c.fillRect(76, 64, 8, 24); c.fillStyle = '#8a1a1a'; c.fillRect(78, 66, 4, 18);
      c.fillStyle = '#7a5a30'; c.fillRect(50, 86, 60, 34); c.fillStyle = '#d8b040'; c.beginPath(); c.arc(80, 100, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b01818'; c.fillRect(0, 98, W, 22); c.fillStyle = '#fff'; c.font = `600 9px ${TH}`; c.textAlign = 'left';
      const msg = day >= 6 ? '  อย่าตื่นตระหนก · DO NOT PANIC · STAY INSIDE · FEED IT · อย่าตื่นตระหนก  ' : '  รมช.ประสิทธิ์: ไม่ต้องตื่นตระหนก · DEPUTY MINISTER: DO NOT PANIC · ปิดไฟหลังมืด  ';
      const x = W - ((this.t * 30) % (msg.length * 6 + W));
      c.fillText(msg, x, 112);
      c.fillStyle = '#fff'; c.font = '700 8px Arial'; c.fillText('LIVE', 6, 10);
    } else if (day === 2) {
      // a lakorn: a slap, a gasp, a mansion
      c.fillStyle = '#e8c8a0'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#8a5a3a'; c.fillRect(0, 70, W, 50);
      c.fillStyle = '#c84a6a'; c.fillRect(30, 40, 30, 60); c.fillStyle = '#d8a882'; c.beginPath(); c.arc(45, 32, 11, 0, 7); c.fill();
      c.fillStyle = '#2a2a3a'; c.fillRect(96, 38, 32, 62); c.fillStyle = '#c89a72'; c.beginPath(); c.arc(112, 30, 11, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = `600 10px ${TH}`; c.textAlign = 'center'; c.fillText(Math.floor(this.t / 3) % 2 ? 'เธอทำแบบนี้ได้ยังไง!' : 'ฉันไม่เคยรักเธอ!', W / 2, 114);
    } else {
      // the morning news: the anchor, the rate board, the lower third
      c.fillStyle = '#1a2a4a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#0a1a10'; c.fillRect(86, 12, 66, 56);
      c.fillStyle = '#5aff7a'; c.font = 'bold 8px monospace'; c.textAlign = 'left';
      c.fillText('USD/THB', 90, 22);
      const r = G.director ? G.director.fx : 24.5; c.fillStyle = '#ff5a4a'; c.font = 'bold 14px monospace'; c.fillText(r.toFixed(2), 92, 40);
      c.strokeStyle = '#ff5a4a'; c.beginPath(); for (let i = 0; i < 12; i++) { const y = 62 - i * i * 0.18 - Math.sin(i + this.t) * 1.5; i ? c.lineTo(90 + i * 5, y) : c.moveTo(90, y); } c.stroke();
      c.fillStyle = '#c8a07a'; c.beginPath(); c.arc(42, 56, 13, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a1410'; c.beginPath(); c.arc(42, 50, 13, Math.PI, 0); c.fill();
      c.fillStyle = '#2a3a6a'; c.fillRect(24, 70, 36, 50);
      c.fillStyle = '#b01818'; c.fillRect(0, 94, W, 18); c.fillStyle = '#fff'; c.font = `600 9px ${TH}`; c.fillText('ด่วน! ลอยตัวค่าเงินบาท · BAHT FLOATED', 4, 106);
      c.fillStyle = '#ffd040'; c.fillRect(0, 112, W, 8); c.fillStyle = '#111'; c.font = '700 6px Arial'; c.fillText('SET INDEX  ▲  FINANCE STOCKS SUSPENDED  ·  34°C THUNDERSTORMS', 4, 118);
    }
    // the picture is never clean: noise and rolling bars
    const id = c.getImageData(0, 0, W, H), d = id.data;
    const roll = (this.t * 30) % H;
    const amt = day >= 3 ? 34 + day * 4 : 24;
    for (let i = 0; i < d.length; i += 4) {
      const y = (i / 4 / W) | 0;
      const n = (Math.random() - 0.5) * amt * (Math.abs(y - roll) < 6 ? 2 : 1);
      if (amt === 255) { const v = Math.random() * 220; d[i] = v; d[i + 1] = v; d[i + 2] = v; }
      else { d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    }
    c.putImageData(id, 0, 0);
    this.tex.needsUpdate = true;
  }
}
