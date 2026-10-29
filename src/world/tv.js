// The living-room CRT: a wood-grain-and-plastic set on rabbit ears with a VCR
// blinking 12:00 underneath. On: static, the morning news, and from day 3 the
// Emergency Alert System that never stops.
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
      const day = G.story.day;
      this.loop = G.audio && G.audio.loop(day >= 3 ? 'eas' : day === 1 ? 'tvBabble' : 'static', { pos: this.g.getWorldPosition(V()), vol: day >= 3 ? 0.35 : 0.3 });
      if (day >= 3 && !this.said) { this.said = true; setTimeout(() => G.hud.inner('It\'s been on every channel since this morning.'), 1500); }
    }
    G.world.extraLight = G.world.extraLight || [];
    if (!this.lightHooked) { this.lightHooked = true; G.world.extraLight.push((p) => (this.on ? Math.max(0, 0.45 * (1 - p.distanceTo(this.g.getWorldPosition(V())) / 4)) : 0)); }
  }
  update(dt) {
    this.t += dt;
    // VCR clock, always 12:00
    const vc = this.vcrCv.getContext('2d');
    vc.fillStyle = '#020403'; vc.fillRect(0, 0, 64, 16);
    if (Math.floor(this.t * 1.6) % 2 === 0) { vc.fillStyle = '#5aff9a'; vc.font = 'bold 13px monospace'; vc.textAlign = 'center'; vc.fillText('12:00', 32, 12); }
    this.vcrTex.needsUpdate = true;
    this.led.emissiveIntensity = this.on ? 0 : 1.5;
    this.screenMat.emissiveIntensity = this.on ? 1.3 : 0;
    this.light.intensity = this.on ? 0.6 + Math.random() * 0.3 : 0;
    if (!this.on || G.frame % 2) return;
    const c = this.ctx, W = 160, H = 120, day = G.story.day;
    if (day >= 3) {
      // Emergency Alert System: bars, then the crawl
      const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
      bars.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * W / 7, 0, W / 7 + 1, H * 0.62); });
      c.fillStyle = '#000'; c.fillRect(0, H * 0.62, W, H * 0.38);
      c.fillStyle = '#fff'; c.font = 'bold 11px monospace'; c.textAlign = 'left';
      const msg = day >= 6 ? '  STAY INSIDE. FEED IT. STAY INSIDE. FEED IT.  ' : '  EMERGENCY ALERT SYSTEM: CIVIL DANGER WARNING FOR HUDSON COUNTY. REMAIN INDOORS. EXTINGUISH ALL LIGHTS AFTER DARK.  ';
      const x = W - ((this.t * 40) % (msg.length * 7 + W));
      c.fillText(msg, x, H * 0.85);
    } else if (day === 1) {
      // the morning news: a desk, a skyline still, a lower third
      c.fillStyle = '#20304a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#3a4a64'; for (let i = 0; i < 12; i++) c.fillRect(10 + i * 12, 60 - (i * 37 % 30), 9, 40);
      c.fillStyle = '#c8c8c8'; c.fillRect(66, 26, 10, 64); c.fillRect(80, 30, 10, 60);
      c.fillStyle = '#101010'; c.beginPath(); c.arc(40, 70, 14, 0, Math.PI * 2); c.fill(); c.fillRect(22, 82, 36, 40);
      c.fillStyle = '#b01818'; c.fillRect(0, 96, W, 16); c.fillStyle = '#fff'; c.font = 'bold 9px sans-serif'; c.fillText('LIVE  HARBOR LIGHTS: WEATHER BALLOONS', 4, 107);
    }
    // the picture is never clean: noise and rolling bars
    const id = c.getImageData(0, 0, W, H), d = id.data;
    const roll = (this.t * 30) % H;
    const amt = day >= 3 ? 40 : day === 1 ? 26 : 255;
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
