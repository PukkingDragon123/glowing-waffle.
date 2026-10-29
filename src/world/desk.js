// The work desk: beige CRT monitor showing the Glass 98 canvas through a CRT
// shader, tower, keyboard, mouse, external modem with LEDs, and the phone
// with a coiled cord. Sitting at the desk hands the mouse/keyboard to the OS.
import * as THREE from 'three';
import { G, emit, on } from '../core/globals.js';
import { M } from '../gfx/materials.js';
import { Button } from './interactables.js';
import { boxGeo, roundedBox, cylGeo } from '../gfx/geo.js';
import { clamp, damp, lerp, pick } from '../core/util.js';
import { OS, W as SW, H as SH } from '../computer/os.js';
import { SupportApp } from '../computer/apps/support.js';
import { BrowserApp } from '../computer/apps/browser.js';
import { MailApp } from '../computer/apps/mail.js';
import { MyComputerApp } from '../computer/apps/mycomputer.js';
import { PHONE_CALLS } from '../computer/content/calls.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);

const CRT_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const CRT_FS = /* glsl */`
uniform sampler2D map; uniform float on; uniform float time; uniform float noise; uniform float warp; uniform float bright;
varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.17) * 43758.5); }
vec2 curve(vec2 uv){ uv = uv * 2.0 - 1.0; vec2 off = abs(uv.yx) / vec2(5.5, 4.5); uv += uv * off * off; return uv * 0.5 + 0.5; }
void main(){
  vec2 uv = curve(vUv);
  vec3 c = vec3(0.0);
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    float line = floor(uv.y * 480.0);
    uv.x += (h(line + floor(time * 30.0)) - 0.5) * 0.006 * noise + sin(uv.y * 40.0 + time * 3.0) * 0.002 * warp;
    vec3 a = texture2D(map, uv).rgb;
    vec3 b = texture2D(map, uv + vec2(0.0012, 0.0)).rgb;
    vec3 d = texture2D(map, uv - vec2(0.0012, 0.0)).rgb;
    c = vec3(d.r, a.g, b.b) * 0.8 + (a + b + d) * 0.0667;
    c *= 0.78 + 0.22 * sin(uv.y * 480.0 * 3.14159);
    float m = mod(gl_FragCoord.x, 3.0);
    c *= vec3(m < 1.0 ? 1.08 : 0.94, m >= 1.0 && m < 2.0 ? 1.08 : 0.94, m >= 2.0 ? 1.08 : 0.94);
    vec2 cc = vUv - 0.5; c *= 1.0 - dot(cc, cc) * 1.3;
    c += (h(uv.y * 999.0 + time) - 0.5) * 0.04 * noise;
    c *= 0.97 + 0.03 * sin(time * 120.0);
    // power-on line / collapse to a dot
    float open = clamp(on * 1.4, 0.0, 1.0);
    float band = smoothstep(0.5 * open + 0.002, 0.5 * open - 0.002, abs(vUv.y - 0.5));
    c = mix(vec3(1.0) * step(abs(vUv.y - 0.5), 0.004) * step(0.001, on) * (1.0 - open), c, band * open);
    c *= step(0.001, on);
  }
  // glass: faint reflection tint
  c += vec3(0.012, 0.014, 0.016);
  gl_FragColor = vec4(c * bright, 1.0);
}`;

export class Desk {
  constructor(apt) {
    this.apt = apt;
    const root = this.root = new THREE.Group();
    G.world.root.add(root);
    const os = this.os = G.os = new OS();
    os.register('support', { title: 'SPF Hotline', icon: 'support', w: 600, h: 440, max: true, create: (o) => new SupportApp(o) });
    os.register('browser', { title: 'Internet Voyager', icon: 'browser', w: 600, h: 440, max: true, create: (o) => new BrowserApp(o) });
    os.register('mail', { title: 'Inbox', icon: 'inbox', w: 560, h: 400, max: false, create: (o) => new MailApp(o) });
    os.register('computer', { title: 'My Computer', icon: 'computer', w: 520, h: 360, max: false, create: (o) => new MyComputerApp(o) });
    this.tex = new THREE.CanvasTexture(os.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.u = { map: { value: this.tex }, on: { value: 0 }, time: G.uniforms.uTime, noise: { value: 0.15 }, warp: { value: 0 }, bright: { value: 2.2 } };
    this.monitorOn = true; this.onK = 0;
    this.seated = false;
    this.build();
    this.phone = G.phone = new Phone(this);
    G.desk = this;
    // the monitor is a light source the thing outside can see
    G.world.extraLight = G.world.extraLight || [];
    G.world.extraLight.push((p) => { if (!this.screenLit) return 0; const d = p.distanceTo(this.screenPos); return d > 4 ? 0 : 0.55 * (1 - d / 4) ** 2; });
    this.webcamCv = document.createElement('canvas'); this.webcamCv.width = 160; this.webcamCv.height = 120;
    this.webcamT = 0;
  }

  build() {
    const r = this.root;
    const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; r.add(m); return m; };
    const top = 0.74;
    // monitor: faces +x
    const mx = 3.79, mz = 5.62;
    const mon = this.monitor = new THREE.Group(); mon.position.set(mx, top, mz); mon.rotation.y = Math.PI / 2; r.add(mon);
    const madd = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; mon.add(m); return m; };
    madd(roundedBox(0.4, 0.04, 0.3, 0.01), M.beige, 0, 0.02, -0.02);
    madd(cylGeo(0.06, 0.04, 10), M.beige, 0, 0.06, -0.05);
    madd(roundedBox(0.42, 0.37, 0.12, 0.02), M.beige, 0, 0.27, 0.07);           // front bezel
    madd(roundedBox(0.36, 0.32, 0.26, 0.04), M.beige, 0, 0.27, -0.12);          // tube housing
    madd(roundedBox(0.24, 0.22, 0.12, 0.04), M.beige, 0, 0.27, -0.3);
    const sg = new THREE.PlaneGeometry(0.3, 0.225, 12, 10);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, 0.012 * (1 - (x / 0.15) ** 2) * (1 - (y / 0.112) ** 2)); }
    sg.computeVertexNormals();
    this.screen = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: CRT_VS, fragmentShader: CRT_FS }));
    this.screen.position.set(0, 0.285, 0.131);
    mon.add(this.screen);
    const led = this.monLed = new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x30ff40, emissiveIntensity: 0 });
    madd(boxGeo(0.008, 0.008, 0.004), led, 0.17, 0.11, 0.132);
    const btn = madd(boxGeo(0.02, 0.012, 0.01), M.plasticDark, 0.14, 0.11, 0.132);
    this.screenPos = mon.localToWorld(V(0, 0.285, 0.14));
    this.monBtn = new Button(btn, { name: 'monitor', label: () => (this.monitorOn ? 'Turn off monitor' : 'Turn on monitor'), onUse: () => this.setMonitor(!this.monitorOn) });
    // screen glow light
    this.glow = new THREE.PointLight(0x9ab8ff, 0, 3.2, 2);
    this.glow.position.copy(mon.localToWorld(V(0, 0.3, 0.75)));
    r.add(this.glow);
    // use computer: clicking the screen
    this.useBtn = new Button(this.screen, { name: 'computer', reach: 1.6, label: () => (this.seated ? null : 'Use computer'), onUse: () => this.sit() });
    // tower on the floor under the desk
    const tower = add(roundedBox(0.2, 0.42, 0.44, 0.01), M.beige, 3.72, 0.21, 6.08, Math.PI / 2);
    this.towerPos = V(3.72, 0.3, 6.08);
    const tledM = this.towerLed = new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x30ff40, emissiveIntensity: 0 });
    const hddM = this.hddLed = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffa020, emissiveIntensity: 0 });
    add(boxGeo(0.006, 0.006, 0.004), tledM, 3.84, 0.36, 6.0);
    add(boxGeo(0.006, 0.006, 0.004), hddM, 3.84, 0.34, 6.0);
    add(boxGeo(0.004, 0.06, 0.16), M.plasticDark, 3.825, 0.33, 6.08);
    const pbtn = add(cylGeo(0.012, 0.01, 10), M.plasticDark, 3.825, 0.27, 6.08);
    pbtn.rotation.z = Math.PI / 2;
    this.pcBtn = new Button(pbtn, { name: 'pc', label: () => (this.os.on && this.os.state !== 'safeOff' ? 'Hold to switch off computer' : 'Power on computer'), onUse: () => { if (this.os.state === 'off' || this.os.state === 'safeOff') { this.os.state = 'off'; this.os.powerOn(); } else this.os.powerOff(); sfx('click', { pos: this.towerPos }); } });
    G.physics.addStaticBox(3.72, 0.21, 6.08, 0.22, 0.21, 0.1);
    // keyboard
    const kb = new THREE.Group(); kb.position.set(4.03, top + 0.012, mz); kb.rotation.y = Math.PI / 2; r.add(kb);
    const kbm = new THREE.Mesh(roundedBox(0.44, 0.025, 0.16, 0.008), M.beige); kbm.castShadow = true; kb.add(kbm);
    const keyMat = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.6 });
    const kg = new THREE.InstancedMesh(boxGeo(0.016, 0.01, 0.016), keyMat, 80);
    let k = 0;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 16 && k < 80; col++) { const m4 = new THREE.Matrix4().makeTranslation(-0.19 + col * 0.0235 + (row % 2) * 0.006, 0.017, -0.055 + row * 0.024); kg.setMatrixAt(k++, m4); }
    kb.add(kg);
    this.kbPos = kb.position.clone();
    // mouse + pad
    add(boxGeo(0.2, 0.004, 0.17), M.rubber, 4.03, top + 0.002, 5.26);
    this.mouse = add(roundedBox(0.06, 0.035, 0.1, 0.015), M.beige, 4.03, top + 0.02, 5.26, Math.PI / 2);
    this.mouseBase = this.mouse.position.clone();
    // modem with LEDs
    const modem = new THREE.Group(); modem.position.set(3.66, top, 5.2); modem.rotation.y = Math.PI / 2; r.add(modem);
    const mm = new THREE.Mesh(roundedBox(0.16, 0.035, 0.22, 0.008), M.plasticDark); mm.position.y = 0.018; mm.castShadow = true; modem.add(mm);
    this.modemLeds = [];
    const labels = ['HS', 'AA', 'CD', 'OH', 'RD', 'SD', 'TR', 'MR'];
    labels.forEach((l, i) => { const m = new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xff2010, emissiveIntensity: 0 }); const b = new THREE.Mesh(boxGeo(0.006, 0.004, 0.004), m); b.position.set(-0.06 + i * 0.017, 0.03, 0.111); modem.add(b); this.modemLeds.push(m); });
    this.modemPos = modem.position.clone().add(V(0, 0.05, 0));
    this.speakerPos = mon.localToWorld(V(0.18, 0.1, 0.1));
    // colliders
    G.physics.addStaticBox(mx - 0.06, top + 0.2, mz, 0.21, 0.2, 0.21);
    G.physics.addStaticBox(4.03, top + 0.015, mz, 0.08, 0.015, 0.22);
    this.seatPos = V(4.42, 1.14, mz);
    this.seatLook = this.screenPos.clone();
  }

  setMonitor(on) {
    this.monitorOn = on;
    sfx(on ? 'crtOn' : 'click', { pos: this.screenPos, vol: 0.7 });
    if (on && this.os.on) { this.whine = G.audio && G.audio.loop('crtWhine', { pos: this.screenPos, vol: 0.25 }); }
    if (!on && this.whine) { this.whine.stop(0.2); this.whine = null; }
    emit('monitor', on);
  }

  // ---------------------------------------------------------- sitting
  sit() {
    if (this.seated) return;
    const pl = G.player;
    if (pl.inv.hand && !pl.inv.hand.small) { G.hud.inner('I should put this down first.'); return; }
    if (pl.inv.hand) pl.inv.store();
    this.seated = true;
    if (!this.os.on && this.os.state !== 'safeOff') this.os.powerOn();
    if (this.os.state === 'safeOff') { this.os.state = 'off'; this.os.powerOn(); }
    if (!this.monitorOn) this.setMonitor(true);
    pl.ctrl.enabled = false; pl.ctrl.lookEnabled = false;
    pl.ctrl.teleport(4.55, 0.05, 5.65, Math.PI / 2, -0.25);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.seatPos, this.seatLook, V(0, 1, 0)));
    pl.ctrl.override = { pos: this.seatPos.clone(), quat: q, speed: 5 };
    pl.ctrl.zoom = G.settings.v.fov - 36;
    G.body.mode = 'sit';
    G.engine.forcedLowH = Math.max(G.engine.lowH, Math.min(900, window.innerHeight * (window.devicePixelRatio || 1)));
    G.engine.resize();
    G.input.captureText = true;
    this.os.focused = true;
    G.hud.crosshair(false);
    emit('seated', true);
  }
  stand() {
    if (!this.seated) return;
    const pl = G.player;
    this.seated = false;
    pl.ctrl.enabled = true; pl.ctrl.lookEnabled = true;
    pl.ctrl.override = null; pl.ctrl.zoom = 0;
    pl.ctrl.yaw = Math.PI / 2; pl.ctrl.pitch = -0.2;
    G.body.mode = 'stand';
    G.body.override.L = G.body.override.R = null;
    G.engine.forcedLowH = 0; G.engine.resize();
    G.input.captureText = false;
    this.os.focused = false;
    G.hud.crosshair(true);
    emit('seated', false);
  }

  // ---------------------------------------------------------- per frame
  update(dt) {
    const os = this.os, inp = G.input;
    let oi = null;
    if (this.seated) {
      const lookAround = inp.mouseDown(2);
      const sens = 0.5 + G.settings.v.sensitivity * 0.1;
      if (lookAround) {
        const c = G.player.ctrl;
        const o = c.override;
        this.lookYaw = clamp((this.lookYaw || 0) - inp.mdx * 0.003, -1.2, 1.2);
        this.lookPitch = clamp((this.lookPitch || 0) - inp.mdy * 0.003, -0.6, 0.5);
      } else { this.lookYaw = damp(this.lookYaw || 0, 0, 3, dt); this.lookPitch = damp(this.lookPitch || 0, 0, 3, dt); }
      const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(this.seatPos, this.seatLook, V(0, 1, 0)));
      const extra = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, this.lookYaw, 0, 'YXZ'));
      G.player.ctrl.override.quat.copy(base.multiply(extra));
      G.player.ctrl.zoom = (G.settings.v.fov - 36) * (1 - Math.min(1, Math.abs(this.lookYaw) * 1.5));
      oi = { dx: lookAround ? 0 : inp.mdx * sens, dy: lookAround ? 0 : inp.mdy * sens, down: inp.mouseDown(0), pressed: inp.mousePressed(0), released: inp.mouseReleased(0), keys: inp.consumeText().filter((k) => k !== '#Escape'), wheel: inp.wheel };
      if (inp.pressed('Escape')) this.stand();
      // hands: right on the mouse, left on the keyboard
      const mp = this.mouseBase.clone().add(V(-(os.my / SH - 0.5) * 0.06, 0, (0.5 - os.mx / SW) * 0.08 + 0.0));
      this.mouse.position.lerp(mp, 0.5);
      const typing = oi.keys.length > 0;
      if (typing) this.typeT = 0.25;
      this.typeT = Math.max(0, (this.typeT || 0) - dt);
      const bq = G.body.root.quaternion;
      G.body.override.R = { p: this.mouse.position.clone().add(V(0.06, 0.035, 0.0)), F: V(-1, -0.2, 0).normalize(), N: V(0, -1, 0), pose: 'mouse', w: 1 };
      const kx = this.kbPos.clone().add(V(-0.02, 0.05 + (this.typeT > 0 ? Math.abs(Math.sin(G.time * 30)) * 0.012 : 0), 0.14));
      G.body.override.L = { p: kx, F: V(-1, -0.3, -0.1).normalize(), N: V(0, -1, 0), pose: 'type', w: 1 };
    }
    os.update(dt, oi);
    this.tex.needsUpdate = os.on || this.onK > 0;
    // power / glow
    const lit = os.on && this.monitorOn && G.world.power;
    this.onK = damp(this.onK, lit ? 1 : 0, lit ? 2.5 : 9, dt);
    this.u.on.value = this.onK;
    this.screenLit = this.onK > 0.3;
    this.glow.intensity = this.onK * 0.3;
    this.monLed.emissiveIntensity = this.monitorOn ? (os.on ? 2 : 0.6) : 0;
    this.towerLed.emissiveIntensity = os.on ? 2 : 0;
    this.hddLed.emissiveIntensity = os.on && (os.state !== 'desktop' || Math.random() < 0.08) ? 2 : 0;
    const day = G.story.day;
    this.u.noise.value = 0.12 + (day >= 4 ? 0.3 : 0) + (day >= 6 ? 0.5 : 0) + (G.alien && G.alien.near ? 1.5 : 0);
    this.u.warp.value = day >= 5 ? 0.6 : 0;
    // modem LEDs
    const d = os.dial, con = os.connected;
    this.modemLeds.forEach((m, i) => {
      let v = 0;
      if (i === 0) v = os.on ? 1 : 0;
      if (i === 6) v = os.on ? 1 : 0;
      if (i === 1) v = 1;
      if (i === 2 || i === 3) v = con || (d && d.stage === 'dialing' && d.t > 6) ? 1 : 0;
      if (i === 4 || i === 5) v = (con || (d && d.stage === 'dialing')) && Math.random() < 0.35 ? 1 : 0;
      if (i === 7) v = con ? 1 : 0;
      m.emissiveIntensity = v * 2;
    });
    this.phone.update(dt);
    // webcam frames (rendered from the corner) when someone is watching
    this.webcamT -= dt;
  }

  webcamFrame() {
    if (this.webcamT > 0) return this.webcamCv;
    this.webcamT = 1.0;
    const cam = this.webcamCam || (this.webcamCam = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 50));
    cam.position.set(9.9, 2.45, 7.35); cam.lookAt(4.2, 1.0, 5.6);
    this.snapshotTo(this.webcamCv, cam);
    return this.webcamCv;
  }
  // render the main scene from a camera into a 2D canvas (with the head visible)
  snapshotTo(canvas, cam) {
    const w = canvas.width, h = canvas.height;
    const rt = this.snapRT && this.snapRT.width === w ? this.snapRT : (this.snapRT = new THREE.WebGLRenderTarget(w, h));
    const hide = G.body.u.uHideHead.value;
    G.body.u.uHideHead.value = 0;
    const wasVis = G.player.viewSocket.visible;
    G.engine.snapshot(G.scene, cam, w, h, rt);
    G.body.u.uHideHead.value = hide;
    const px = new Uint8Array(w * h * 4);
    G.engine.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4, di = (y * w + x) * 4;
      const g = (px[si] * 0.3 + px[si + 1] * 0.59 + px[si + 2] * 0.11);
      img.data[di] = g * 0.9 + px[si] * 0.1; img.data[di + 1] = g; img.data[di + 2] = g * 0.95; img.data[di + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

// --------------------------------------------------------------------------
// The phone: rings, handset to the ear, coiled cord, and voices that keep
// talking out of a hung-up handset.
class Phone {
  constructor(desk) {
    this.desk = desk;
    const r = desk.root;
    const base = this.base = new THREE.Group(); base.position.set(3.8, 0.74, 6.1); base.rotation.y = Math.PI / 2 + 0.3; r.add(base);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.45 });
    const b = new THREE.Mesh(roundedBox(0.18, 0.06, 0.2, 0.02), mat); b.position.y = 0.03; b.castShadow = true; base.add(b);
    for (let i = 0; i < 12; i++) { const k = new THREE.Mesh(boxGeo(0.018, 0.006, 0.014), M.plasticDark); k.position.set(-0.025 + (i % 3) * 0.025, 0.063, 0.02 + Math.floor(i / 3) * 0.02); base.add(k); }
    const hs = this.handset = new THREE.Group();
    const hm = new THREE.Mesh(roundedBox(0.05, 0.035, 0.21, 0.015), mat); hm.castShadow = true; hs.add(hm);
    for (const s of [-1, 1]) { const cup = new THREE.Mesh(roundedBox(0.055, 0.04, 0.05, 0.015), mat); cup.position.set(0, -0.012, s * 0.085); hs.add(cup); }
    r.add(hs);
    this.cradle = () => base.localToWorld(V(-0.03, 0.09, 0.0));
    this.cradleQuat = () => base.getWorldQuaternion(new THREE.Quaternion());
    // coiled cord
    this.cordMat = new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.5 });
    this.cord = new THREE.Mesh(new THREE.BufferGeometry(), this.cordMat);
    r.add(this.cord);
    this.state = 'idle'; // idle | ringing | offhook
    this.ringT = 0; this.callInfo = null; this.lift = 0;
    this.btn = new Button(hs, { name: 'phone', label: () => (this.state === 'ringing' ? 'Answer the phone' : this.state === 'offhook' ? 'Hang up' : null), onUse: () => this.use() });
    this.lastCordT = 0;
    this.updateCord(true);
  }
  get busy() { return this.state !== 'idle'; }
  earPos() { return this.handset.getWorldPosition(V()); }
  ring(info) {
    if (this.state !== 'idle') return;
    this.state = 'ringing'; this.ringT = 0; this.callInfo = info; this.nextBell = 0;
    emit('phoneRing', info);
  }
  stopRing() { if (this.state === 'ringing') this.state = 'idle'; }
  use() {
    if (this.state === 'ringing') {
      const info = this.callInfo;
      if (info && info.work) {
        if (!this.desk.seated) this.desk.sit();
        info.onAnswer && info.onAnswer();
      } else this.answerPersonal(info);
    } else if (this.state === 'offhook') {
      if (this.personal) this.endPersonal(); else G.os.apps.support && G.os.apps.support.hangup();
    }
  }
  pickUp() { this.state = 'offhook'; sfx('offhook', { pos: this.earPos(), vol: 0.6 }); this.static = G.audio && G.audio.loop('lineStatic', { pos: this.earPos(), vol: 0.12, follow: this.handset }); }
  hangUp(after) {
    this.state = 'idle';
    sfx('hangup', { pos: this.cradle(), vol: 0.7 });
    if (this.static) { this.static.stop(0.1); this.static = null; }
    // the voice continues from the handset on the desk
    if (after && after.length) {
      let t = 1.2;
      for (const line of after) {
        setTimeout(() => {
          if (this.state !== 'idle') return;
          const h = G.audio && G.audio.speak(line, { voice: 'wrong', phone: true, vol: 0.5, pos: this.cradle(), rate: 0.9 });
          G.hud.say(line, { who: 'the handset', cls: 'strange', dur: 3 });
          emit('voiceAfterHangup');
        }, t * 1000);
        t += 2.8;
      }
    }
  }
  answerPersonal(info) {
    this.personal = info; this.pickUp();
    let t = 0.6;
    for (const l of info.lines) {
      setTimeout(() => {
        if (this.personal !== info) return;
        const h = G.audio && G.audio.speak(l, { voice: info.voice, phone: true, pos: this.earPos() });
        G.hud.say(l, { who: info.name, cls: info.voice === 'whisper' ? 'strange' : 'voice', dur: h ? h.dur + 0.8 : 4 });
      }, t * 1000);
      t += Math.max(2.5, l.length * 0.075);
    }
    this.personalEnd = setTimeout(() => this.endPersonal(), (t + 1) * 1000);
    emit('personalCall', info);
  }
  endPersonal() { clearTimeout(this.personalEnd); this.personal = null; this.hangUp(); }
  // personal calls are scheduled by the director
  checkPersonal(day, hour) {
    const pc = PHONE_CALLS[day];
    if (!pc || this.donePersonal === day || this.state !== 'idle' || hour < pc.at) return;
    this.donePersonal = day;
    this.ring({ work: false, ...pc });
  }
  update(dt) {
    if (this.state === 'ringing') {
      this.ringT += dt;
      this.nextBell -= dt;
      if (this.nextBell <= 0) { sfx('thaiPhoneRing', { pos: this.cradle(), vol: 0.9, ref: 1.2, occlude: true }); emit('noise', { pos: this.cradle(), loud: 0.6, kind: 'phone' }); this.nextBell = 5; }
      if (!this.callInfo.work && this.ringT > 24) this.state = 'idle';
    }
    // handset pose: cradle, jiggle while ringing, at the ear when off-hook
    const atEar = this.state === 'offhook';
    this.lift = damp(this.lift, atEar ? 1 : 0, 8, dt);
    const cp = this.cradle(), cq = this.cradleQuat().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    let pos = cp, quat = cq;
    if (this.lift > 0.01) {
      const cam = G.camera;
      const ear = V(-0.09, -0.04, -0.02).applyMatrix4(cam.matrixWorld);
      const eq = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 1.2)));
      pos = cp.clone().lerp(ear, this.lift); quat = cq.clone().slerp(eq, this.lift);
      G.body.override.L = this.lift > 0.5 && !this.desk.seated ? null : G.body.override.L;
      if (atEar && !this.desk.seated) G.body.override.L = { p: ear.clone().add(V(0, -0.06, 0)), F: V(0, 1, 0), N: V(0, 0, 1).applyQuaternion(G.camera.quaternion), pose: 'grip', w: 1 };
    } else if (!this.desk.seated && G.body.override.L && G.body.override.L.pose === 'grip' && this.state === 'idle') G.body.override.L = null;
    if (this.state === 'ringing') pos = pos.clone().add(V(0, Math.abs(Math.sin(G.time * 63)) * 0.004 * (Math.floor(G.time / 2) % 2 ? 0 : 1), 0));
    this.handset.position.copy(pos); this.handset.quaternion.copy(quat);
    this.lastCordT -= dt;
    if (this.lastCordT <= 0 || this.lift > 0.01 && this.lift < 0.99) { this.updateCord(); this.lastCordT = this.lift > 0.5 ? 0.05 : 1; }
  }
  updateCord() {
    const a = this.base.localToWorld(V(-0.08, 0.03, 0.0));
    const b = this.handset.localToWorld(V(0, -0.02, 0.1));
    const pts = [];
    const n = 120, coils = 26;
    const dir = b.clone().sub(a);
    const sag = Math.max(0.05, 0.35 - dir.length() * 0.3);
    const side = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      const ang = t * coils * Math.PI * 2;
      p.addScaledVector(side, Math.cos(ang) * 0.007).addScaledVector(up, Math.sin(ang) * 0.007);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    this.cord.geometry.dispose();
    this.cord.geometry = new THREE.TubeGeometry(curve, 240, 0.0025, 4, false);
  }
}
