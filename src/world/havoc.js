// What the week does to West Broadway. From the third morning the police
// close it a block at a time: cruisers parked across the lanes with their
// bars going, sawhorse barricades, then black Suburbans, an ambulance, an FDNY
// engine, olive army trucks and Humvees at a checkpoint. Cars are left where
// they stopped, dusted grey, one burned out. Rubble spills off the far end,
// paper and ash come down between the buildings, dust settles in the canyon,
// and sirens wail somewhere down the street. Everything is placed once and
// shown by day; the flashers also light the street through OUT.oFlash.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { RNG } from '../core/util.js';
import { OUT, OUT_GLSL, Kit, solidMaterial } from './outdoor.js';
import { ST } from './street.js';
import { LIVERY, PAINT } from './vehicles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RD = -13.98, SW = -13.85;
const deg = Math.PI / 180;

// falling paper and ash: instanced quads, animated entirely in the vertex shader
const FALL_VS = /* glsl */`
attribute vec4 iSeed; // x, z, phase, kind (0 paper, 1 ash)
uniform float oTime; uniform float amount;
varying float vKind; varying vec3 vW; varying float vA; varying vec2 vUv; varying float vTurn;
void main(){
  float H = 70.0, sp = mix(1.1, 2.2, iSeed.w);
  float y = 56.0 - mod(oTime * sp + iSeed.z * H, H);
  float t = oTime * (0.7 + iSeed.z) + iSeed.z * 40.0;
  vec3 c = vec3(iSeed.x + sin(t * 0.9) * 2.5 + mod(oTime * 0.6 + iSeed.z * 30.0, 30.0) - 15.0, y, iSeed.y + cos(t * 0.7) * 2.0);
  // the sheet tumbles: turn the quad about its own axes
  float a = t * 2.3, b = t * 1.7;
  vec3 p = vec3(position.x * cos(a), position.y, position.x * sin(a));
  p = vec3(p.x, p.y * cos(b) - p.z * sin(b), p.y * sin(b) + p.z * cos(b));
  vec3 w = c + p * mix(0.32, 0.16, iSeed.w);
  vTurn = abs(cos(a) * cos(b));
  vKind = iSeed.w; vW = w; vUv = position.xy; vA = amount * step(fract(iSeed.z * 7.3), amount) * smoothstep(-14.0, -10.0, y);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FALL_FS = /* glsl */`
${OUT_GLSL}
varying float vKind; varying vec3 vW; varying float vA; varying vec2 vUv; varying float vTurn;
void main(){
  if (vA < 0.01) discard;
  vec3 alb = mix(vec3(0.62, 0.6, 0.55), vec3(0.04, 0.035, 0.03), vKind);
  vec3 c = alb * (oSunCol * (0.3 + 0.7 * vTurn) + oAmbSky + oAmbGnd) + alb * lampPools(vW, vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(outFog(c, vW), 1.0);
}`;

export class Havoc {
  constructor(scene, glows, street) {
    this.scene = scene; this.glows = glows; this.street = street;
    const rng = this.rng = new RNG(66);
    const M = street.models;
    const items = this.items = [];
    const put = (t, x, z, yaw, day, o = {}) => items.push({ t, x, z, yaw, day, ...o });
    const { axis } = ST, I = ST.inters;
    // day 3: cruisers at the first crossing, nosed in across the lanes; barricades two blocks down
    put('nypd', axis + 4.5, I[0] + 7, 160 * deg, 3); put('nypd', axis - 3.5, I[0] + 3, -150 * deg, 3);
    put('nypd', axis + 9, I[2] + 12, 95 * deg, 3);
    // day 4: the street is closed: barricades across, a black Suburban, an ambulance, more cops; cars abandoned in the lanes
    put('gov', axis - 1, I[1] + 13, -80 * deg, 4); put('gov', axis + 8.5, I[1] + 18, 92 * deg, 5);
    put('ems', axis + 2.5, I[2] - 14, 105 * deg, 4); put('nypd', axis - 6, I[3] + 12, -60 * deg, 4);
    // day 5: FDNY, the army arrives with a checkpoint at the third crossing
    put('fdny', axis + 3, I[4] + 15, 98 * deg, 5); put('army', axis - 4.8, I[3] - 14, -88 * deg, 5); put('army', axis + 5, I[3] - 22, 88 * deg, 5);
    put('humvee', axis - 2, I[2] + 9, 30 * deg, 5); put('humvee', axis + 7, I[2] + 7, 160 * deg, 6); put('fdny', axis - 4, I[5] + 10, -95 * deg, 6);
    put('army', axis + 10.5, I[1] - 15, 90 * deg, 6); put('humvee', axis + 2, I[0] - 16, 75 * deg, 6); put('gov', axis - 5, I[0] - 20, -100 * deg, 7);
    // abandoned: doors left, dusted grey; one burned to the frame
    const wrecks = [['sedan', 1.2, -48, 70], ['cab', 9.5, -82, 115], ['van', -0.5, -150, -40], ['wagon', 12, -215, 160], ['suv', 4, -238, 20], ['sedan', 9, -330, -100], ['cab', 2, -410, 80], ['sedan', 11, -500, 130], ['bus', 6.5, -590, 75], ['van', 0.5, -60, -12]];
    wrecks.forEach(([t, x, z, a], i) => put(t, x, z, a * deg, i < 3 ? 4 : i < 7 ? 5 : 6, { wreck: true, burnt: i === 4 || i === 8 }));
    // one InstancedMesh per model, hidden until its day
    const groups = new Map();
    for (const it of items) { if (!groups.has(it.t)) groups.set(it.t, []); groups.get(it.t).push(it); }
    const mat = solidMaterial({ defines: { INST_LIGHT: 1 } });
    this.meshes = [];
    const col = new THREE.Color();
    for (const [t, list] of groups) {
      const geo = M[t].geo.clone();
      geo.setAttribute('iLight', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        it.mesh = mesh; it.i = i;
        col.set(LIVERY[t] ?? rng.pick(PAINT));
        if (it.wreck) col.lerp(new THREE.Color(0x8a8478), 0.55).multiplyScalar(it.burnt ? 0.12 : 0.85);
        mesh.setColorAt(i, col);
        // flashers: two glows a vehicle, out of step
        if (M[t].flash && !it.wreck) it.fl = M[t].flash.map(([x, y, z, c], j) => ({ p: V(x, y, z), gi: glows.add(V(0, -500, 0), c, 1.1, { blink: 1.6, phase: j * 0.5 + rng.next() * 0.2, mode: 1, k: 3.2 }) }));
      });
      mesh.frustumCulled = false; scene.add(mesh); this.meshes.push(mesh);
    }
    this.buildBarricades(rng);
    this.buildRubble(rng);
    this.buildFall(rng);
    this.day = -1;
    this.sirenT = 8;
  }

  buildBarricades(rng) {
    // NYPD sawhorses: blue top rail with a white band, splayed legs
    const k = new Kit();
    k.box(0, 0.95, 0, 0.06, 0.22, 2.4, 0x1a3a8a); k.box(0.031, 1.0, 0, 0.005, 0.07, 2.2, 0xe8e8e8);
    for (const dz of [-1.0, 1.0]) for (const s of [-1, 1]) k.box(s * 0.22, 0, dz, 0.06, 1.0, 0.06, 0x6a5a40, { rz: -s * 0.25 });
    const spots = this.bars = [];
    const { axis } = ST, I = ST.inters;
    const line = (z, x0, x1, day) => { for (let x = x0; x < x1; x += 2.6) spots.push({ x: x + rng.range(-0.2, 0.2), z: z + rng.range(-0.4, 0.4), yaw: Math.PI / 2 + rng.range(-0.15, 0.15), day }); };
    line(I[2] - 6.5, axis + 1.5, ST.roadR, 3); line(I[3] + 7, ST.roadL, axis - 1, 4); line(I[3] + 7, axis + 1, ST.roadR, 4);
    line(I[1] - 7, ST.roadL, ST.roadR, 6); line(I[0] - 8, ST.roadL + 2, axis + 3, 7);
    const mesh = this.barMesh = new THREE.InstancedMesh(k.geometry(), solidMaterial(), spots.length);
    mesh.frustumCulled = false; this.scene.add(mesh);
  }
  buildRubble(rng) {
    // broken masonry and glass spilled into the far blocks, a scatter of paper on the asphalt, by day
    this.rubble = [4, 5, 6].map((day) => {
      const k = new Kit();
      const n = day === 4 ? 20 : day === 5 ? 60 : 140, zmax = day === 4 ? -500 : day === 5 ? -400 : -150;
      for (let i = 0; i < n; i++) {
        const side = rng.next() < 0.5 ? -1 : 1, x = side < 0 ? ST.roadL + rng.range(-5, 6) : ST.roadR + rng.range(-6, 5), z = rng.range(ST.end + 10, zmax);
        const r = rng.range(0.2, 0.9) * (rng.next() < 0.1 ? 2.5 : 1);
        k.add(new THREE.DodecahedronGeometry(r, 0), rng.pick([0x6a5e52, 0x5a4a40, 0x7a7266, 0x3a3632, 0x8a5038]), { x, y: RD + r * 0.4, z, rx: rng.range(0, 3), ry: rng.range(0, 3), sy: rng.range(0.4, 0.9) });
      }
      for (let i = 0; i < n * 2; i++) k.box(ST.roadL + rng.range(-5, 25), RD + 0.01, rng.range(ST.end, zmax + 100), rng.range(0.2, 0.3), 0.004, rng.range(0.25, 0.32), rng.pick([0xd8d4c8, 0xc8c4b4, 0xe8e4d8, 0x8a8478]), { ry: rng.range(0, 3) });
      if (day === 6) for (let i = 0; i < 6; i++) k.box(rng.range(ST.roadL, ST.roadR), RD, rng.range(-640, -560), rng.range(2, 5), rng.range(0.4, 1.4), rng.range(2, 6), 0x5a524a, { ry: rng.range(0, 3), rz: rng.range(-0.2, 0.2) });
      const m = k.mesh(solidMaterial()); m.frustumCulled = false; m.visible = false; this.scene.add(m);
      return { day, m };
    });
  }
  buildFall(rng) {
    const N = 700;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.7, 0, 0.5, -0.7, 0, 0.5, 0.7, 0, -0.5, 0.7, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) a.set([rng.range(ST.faceL, ST.faceR), rng.range(-20, -450), rng.next(), rng.next() < 0.45 ? 1 : 0], i * 4);
    g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = N;
    this.fallU = { amount: { value: 0 } };
    const m = new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, uniforms: { ...OUT, ...this.fallU }, side: THREE.DoubleSide });
    this.fall = new THREE.Mesh(g, m); this.fall.frustumCulled = false; this.scene.add(this.fall);
  }

  setDay(day) {
    if (day === this.day) return;
    this.day = day;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), hide = new THREE.Matrix4().makeTranslation(0, -500, 0);
    const flashers = [];
    for (const it of this.items) {
      const on = day >= it.day;
      q.setFromAxisAngle(up, it.yaw);
      m.compose(V(it.x, RD, it.z), q, V(1, 1, 1));
      it.mesh.setMatrixAt(it.i, on ? m : hide);
      if (it.fl) for (const f of it.fl) { const p = f.p.clone().applyMatrix4(m); this.glows.move(f.gi, p.x, on ? p.y : -500, p.z); if (on) flashers.push([p, f.gi]); }
    }
    for (const mm of this.meshes) mm.instanceMatrix.needsUpdate = true;
    this.bars.forEach((b, i) => { q.setFromAxisAngle(up, b.yaw); m.compose(V(b.x, SW - 0.13, b.z), q, V(1, 1, 1)); this.barMesh.setMatrixAt(i, day >= b.day ? m : hide); });
    this.barMesh.instanceMatrix.needsUpdate = true;
    for (const r of this.rubble) r.m.visible = day >= r.day;
    // the four flashers nearest the window light the street
    flashers.sort((a, b) => b[0].z - a[0].z);
    const F = OUT.oFlash.value;
    for (let i = 0; i < 4; i++) { const f = flashers[i * 2]; if (f) F[i].set(f[0].x, f[0].y + 0.5, f[0].z, i * 0.37); else F[i].set(0, -500, 0, 0); }
    this.flashers = flashers.length;
    this.street.tintTrees(Math.max(0, (day - 2) / 5));
  }

  // calm for the traffic: the street empties as the week goes on
  calm(day) { return [1, 1, 1, 0.8, 0.5, 0.25, 0.1, 0][day] ?? 0; }

  update(dt, t, p, day) {
    this.setDay(day);
    OUT.oFlashK.value = this.flashers ? 0.35 + 0.65 * p.night : 0;
    this.fallU.amount.value = [0, 0, 0, 0, 0.1, 0.35, 0.7, 1][day] ?? 0;
    OUT.oDust.value = ([0, 0, 0, 0, 0.12, 0.35, 0.6, 0.85][day] ?? 0) * (0.7 + 0.3 * p.smoke);
    // sirens somewhere down the street
    if (day >= 3 && G.audio && G.audio.ctx && !this.quiet) {
      this.sirenT -= dt;
      if (this.sirenT <= 0) {
        this.sirenT = this.rng.range(18, 50) / (day - 1);
        G.audio.play('siren', { pos: V(ST.axis + this.rng.range(-20, 20), -12, this.rng.range(-80, -500)), vol: 0.35, ref: 25, rolloff: 0.6 });
      }
    }
  }
}
