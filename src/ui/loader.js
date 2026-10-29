// While the world is built: black, a pool of light, Khanom running and
// running and getting nowhere, her face a smear. Three dots underneath.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { CatModel } from '../creatures/catmodel.js';
import { clamp, damp, smoothstep } from '../core/util.js';
import { makeCanvas } from '../gfx/textures.js';

export class Loader {
  constructor() {
    const s = this.scene = new THREE.Scene();
    const cam = this.cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 40);
    cam.position.set(0.15, 0.42, 1.55);
    // one hard light from above, a cold rim from behind, almost no fill
    const key = this.key = new THREE.SpotLight(0xfff4e6, 7, 6, 0.36, 0.7, 1.6);
    key.position.set(0.05, 2.4, 0.15); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
    s.add(key, key.target);
    const rim = new THREE.SpotLight(0xc8d8ff, 5, 5, 0.6, 0.8, 1.5); rim.position.set(-0.8, 0.7, -1.4); rim.target.position.set(0, 0.2, 0); s.add(rim, rim.target);
    s.add(new THREE.HemisphereLight(0x303238, 0x000000, 0.25));
    // wet black floor that falls away into nothing
    const { c, ctx } = makeCanvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#555555'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const fade = new THREE.CanvasTexture(c);
    const boards = makeCanvas(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) { const v = 22 + ((x / 16) | 0) * 3 + Math.random() * 10 + (x % 16 === 0 ? -14 : 0); boards.ctx.fillStyle = `rgb(${v},${v * 0.9},${v * 0.8})`; boards.ctx.fillRect(x, y, 1, 1); }
    this.boardTex = new THREE.CanvasTexture(boards.c); this.boardTex.wrapS = this.boardTex.wrapT = THREE.RepeatWrapping; this.boardTex.repeat.set(3, 6);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: this.boardTex, alphaMap: fade, transparent: true, roughness: 0.62, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.PI / 2; floor.receiveShadow = true;
    s.add(floor);
    // dust in the light, streaming past
    const N = 160, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 3; pos[i * 3 + 1] = Math.random() * 1.6; pos[i * 3 + 2] = (Math.random() - 0.5) * 1.6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xd8d0c0, size: 0.008, transparent: true, opacity: 0.55, depthWrite: false }));
    s.add(this.dust);
    // Khanom
    this.cat = new CatModel();
    s.add(this.cat.root);
    this.cat.root.rotation.y = Math.PI / 2;   // runs toward -x, side-on to us
    this.cat.root.position.set(0, 0, 0);
    this.cat.t = Object.assign(this.cat.defaultPose(), { tailUp: 0.1, earFlat: 0.2 });
    this.speed = 1.9; this.t = 0; this.ready = false; this.stopT = 0;
  }

  async warm() {
    // compile the cat's shaders before the first frame so it never pops in
    try { await G.engine.renderer.compileAsync(this.scene, this.cam); } catch (e) { /* older drivers */ }
  }

  finish() {
    this.ready = true;
    document.getElementById('boot').classList.add('ready');
  }

  frame(dt) {
    this.t += dt;
    const cam = this.cam, cat = this.cat;
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    // once everything is built she slows, stops, sits and looks at you
    if (this.ready) this.stopT += dt;
    const run = this.ready ? Math.max(0, 1.9 - this.stopT * 1.1) : 1.9;
    this.speed = damp(this.speed, run, 3, dt);
    cat.set({ sit: this.ready && this.stopT > 2 ? 1 : 0, headYaw: this.ready ? clamp(this.stopT - 1.2, 0, 1) * 0.9 : 0, headPitch: this.ready ? -0.1 : 0.05, tailUp: this.speed > 1 ? 0.05 : 0.35 });
    cat.update(dt, { speed: this.speed, fast: false });
    // the floor and the dust stream past to sell the run
    const v = this.speed * 0.9 * dt;
    this.boardTex.offset.y += v * 1.0;
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i) + v * (0.6 + (i % 5) * 0.15); if (x > 1.5) x -= 3; p.setX(i, x); p.setY(i, p.getY(i) + Math.sin(this.t + i) * 0.0004); }
    p.needsUpdate = true;
    // a slow handheld drift
    cam.position.set(0.15 + Math.sin(this.t * 0.31) * 0.03, 0.4 + Math.sin(this.t * 0.47) * 0.012, 1.55);
    cam.lookAt(0.06, 0.19, 0);
    cam.updateMatrixWorld();
    // her face won't resolve
    const head = cat.by.head.localToWorld(new THREE.Vector3(0, -0.012, -0.03));
    const ndc = head.clone().project(cam);
    const d = head.distanceTo(cam.position);
    const R = (0.085 / (2 * d * Math.tan((cam.fov * Math.PI) / 360))) * 1.5;
    G.engine.fx.faceSpot.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5, R, 1);
    G.fx.update(dt);
    G.engine.fx.vignette = 1.1;
    G.engine.render(this.scene, cam, G.time);
  }

  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.cat.root.removeFromParent();
    G.engine.fx.faceSpot.w = 0;
  }
}
