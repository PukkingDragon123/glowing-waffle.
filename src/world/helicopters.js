// Government helicopters over Lower Manhattan: dark olive and black
// Black Hawks and Hueys circling the towers, hovering over West Broadway,
// sweeping the canyon with searchlights at night, and every so often one
// coming straight up the street and over the roof, low enough to rattle the
// glass. Low poly but properly shaped (cockpit, cabin, engine humps, tail boom,
// fin, stabilator, gear or skids), rotors that turn with a motion-blur disc,
// blinking nav lights, fake searchlight cones that light the street through
// OUT.oSpot, and one positional rotor sound for the nearest machine.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { RNG, clamp, smoothstep } from '../core/util.js';
import { OUT, Kit, solidMaterial } from './outdoor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const G0 = -14;

function prof(k, pts, w, col, o = {}, bevel = 0.08) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -w / 2);
  k.add(g, col, o);
}
// UH-60 Black Hawk: long flat cabin, the twin engine humps, a canted tail rotor on the right, wheels
function blackHawk() {
  const k = new Kit(), P = { paint: 1 };
  prof(k, [[-2.8, 0.45], [4.8, 0.45], [6.3, 0.75], [7.1, 1.3], [6.7, 1.9], [5.2, 2.35], [-1.2, 2.45], [-2.9, 2.1], [-3.2, 1.2]], 2.2, 0xffffff, P, 0.14);
  k.add(new THREE.CylinderGeometry(0.62, 0.26, 7.8, 8), 0xffffff, { x: -6.6, y: 1.9, z: 0, rz: Math.PI / 2, ...P });
  prof(k, [[-10.6, 1.6], [-9.4, 1.8], [-9.8, 4.0], [-10.6, 4.2]], 0.24, 0xffffff, P, 0.04);
  k.box(-10.2, 1.85, 0, 0.9, 0.08, 4.4, 0xffffff, P);
  for (const z of [-0.62, 0.62]) k.add(new THREE.CylinderGeometry(0.42, 0.48, 3.4, 8), 0xffffff, { x: 0.6, y: 2.75, z, rz: Math.PI / 2, ...P });
  k.box(-0.2, 2.45, 0, 3.2, 0.5, 1.6, 0xffffff, P);
  k.cyl(0.5, 2.9, 0, 0.22, 0.28, 0.9, 8, 0x1a1a1a);
  // the glasshouse: windshield and chin windows, cabin door windows
  prof(k, [[5.2, 1.25], [6.75, 1.35], [6.55, 1.88], [5.15, 2.3]], 2.0, 0x101418, { pat: 8 }, 0.02);
  for (const z of [-1.16, 1.16]) { k.box(2.6, 1.35, z, 1.2, 0.75, 0.04, 0x101418, { pat: 8 }); k.box(0.6, 1.35, z, 1.0, 0.7, 0.04, 0x101418, { pat: 8 }); }
  // gear and the stores pylons
  for (const z of [-1.35, 1.35]) { k.box(4.3, 0.1, z, 0.12, 0.6, 0.12, 0x1a1a1a); k.add(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), 0x0e0e0e, { x: 4.3, y: 0.3, z, rx: Math.PI / 2 }); }
  k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8), 0x0e0e0e, { x: -9.4, y: 1.2, z: 0, rx: Math.PI / 2 }); k.box(-9.4, 1.25, 0, 0.08, 0.6, 0.08, 0x1a1a1a);
  for (const z of [-1, 1]) k.box(1.0, 1.9, z * 1.7, 0.4, 0.08, 1.2, 0xffffff, P);
  return { geo: k.geometry(), hub: V(0.5, 3.75, 0), R: 8.2, blades: 4, tail: V(-10.25, 3.3, 0.32), tr: 1.7, len: 19.8 };
}
// UH-1 Huey: round nose, slim boom, skids, two blades
function huey() {
  const k = new Kit(), P = { paint: 1 };
  prof(k, [[-2.6, 0.7], [3.6, 0.7], [4.6, 1.15], [4.95, 1.8], [4.3, 2.55], [1.2, 2.75], [-2.2, 2.65], [-2.7, 1.6]], 2.3, 0xffffff, P, 0.2);
  k.add(new THREE.CylinderGeometry(0.5, 0.2, 6.8, 8), 0xffffff, { x: -5.9, y: 2.0, z: 0, rz: Math.PI / 2, ...P });
  prof(k, [[-9.5, 1.8], [-8.6, 2.0], [-9.1, 3.6], [-9.7, 3.6]], 0.2, 0xffffff, P, 0.03);
  k.box(-7.4, 1.95, 0, 0.6, 0.06, 2.6, 0xffffff, P);
  k.box(-0.6, 2.7, 0, 3.0, 0.55, 1.3, 0xffffff, P);
  k.cyl(0.0, 3.2, 0, 0.18, 0.24, 0.6, 8, 0x1a1a1a);
  prof(k, [[3.6, 1.3], [4.75, 1.4], [4.6, 2.2], [3.4, 2.55]], 2.1, 0x101418, { pat: 8 }, 0.02);
  for (const z of [-1.2, 1.2]) k.box(2.0, 1.5, z, 1.0, 0.8, 0.04, 0x101418, { pat: 8 });
  // skids and cross tubes
  for (const z of [-1.25, 1.25]) { k.add(new THREE.CylinderGeometry(0.06, 0.06, 4.8, 6), 0x1a1a1a, { x: 0.8, y: 0.08, z, rz: Math.PI / 2 }); k.box(3.3, 0.08, z, 0.5, 0.06, 0.08, 0x1a1a1a, { rz: 0.5 }); }
  for (const x of [2.0, -0.6]) k.box(x, 0.1, 0, 0.08, 0.62, 2.5, 0x1a1a1a);
  return { geo: k.geometry(), hub: V(0, 3.85, 0), R: 7.3, blades: 2, tail: V(-9.4, 3.0, -0.3), tr: 1.3, len: 17.4 };
}
function bladeGeo(n, R, chord) {
  const k = new Kit();
  for (let i = 0; i < n; i++) k.box(R / 2, -0.03, 0, R, 0.05, chord, 0x161616, { ry: (i / n) * Math.PI * 2 });
  k.cyl(0, -0.1, 0, 0.35, 0.35, 0.25, 8, 0x1a1a1a);
  return k.geometry();
}
// a soft disc for the spinning rotor
const DISC_FS = /* glsl */`
uniform float op; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.9, r) * smoothstep(0.08, 0.2, r) * (0.55 + 0.45 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 6.0)) * op; gl_FragColor = vec4(vec3(0.02, 0.02, 0.02), a); }`;
const CONE_FS = /* glsl */`
uniform float op; varying float vY; varying vec3 vN; varying vec3 vV;
void main(){ float e = pow(abs(dot(vN, vV)), 1.4); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * op * e * (0.25 + 0.75 * vY), 1.0); }`;

export class Helicopters {
  constructor(scene, glows) {
    this.scene = scene; this.glows = glows;
    const rng = this.rng = new RNG(4242);
    const models = [blackHawk(), huey()];
    const bodyMat = solidMaterial(), bladeMat = solidMaterial();
    const discMat = (op) => new THREE.ShaderMaterial({ uniforms: { op: { value: op } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: DISC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const towers = V(-15, 0, -841);
    // patrols: [model, colour, kind, params, first day]
    const plan = [
      [0, 0x2e3324, 'orbit', { c: towers, r: 430, y: 330, w: 0.045 }, 1],
      [0, 0x121314, 'flyby', {}, 2],
      [1, 0x343a28, 'hover', { p: V(14, 110, -300), look: V(6, -14, -200), spot: 0 }, 3],
      [0, 0x121314, 'sweep', { x: 8, y: 80, z0: -580, z1: -90, v: 9 }, 3],
      [1, 0x2e3324, 'orbit', { c: V(-560, 0, -1200), r: 320, y: 240, w: -0.06 }, 4],
      [0, 0x2e3324, 'hover', { p: V(130, 300, -640), look: towers.clone().setY(250), spot: -1 }, 5],
      [1, 0x121314, 'orbit', { c: V(6, 0, -420), r: 260, y: 150, w: 0.08 }, 6],
    ];
    this.helis = plan.map(([mi, col, kind, o, day], i) => {
      const md = models[mi];
      const g = new THREE.Group();
      const body = new THREE.InstancedMesh(md.geo, bodyMat, 1);
      body.setMatrixAt(0, new THREE.Matrix4()); body.setColorAt(0, new THREE.Color(col));
      const rotor = new THREE.Mesh(bladeGeo(md.blades, md.R, md.blades === 2 ? 0.55 : 0.53), bladeMat);
      rotor.position.copy(md.hub);
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(md.R * 2, md.R * 2), discMat(0.32)); disc.rotation.x = -Math.PI / 2; disc.position.copy(md.hub).add(V(0, -0.05, 0));
      const tail = new THREE.Mesh(bladeGeo(4, md.tr, 0.22), bladeMat); tail.position.copy(md.tail); tail.rotation.x = Math.PI / 2;
      const tdisc = new THREE.Mesh(new THREE.PlaneGeometry(md.tr * 2, md.tr * 2), discMat(0.25)); tdisc.position.copy(md.tail);
      g.add(body, rotor, disc, tail, tdisc);
      for (const o3 of [body, rotor, disc, tail, tdisc]) o3.frustumCulled = false;
      scene.add(g);
      // nav lights: red port, green starboard, white tail, red anti-collision strobes top and bottom
      const lights = [[V(1.0, 1.9, -1.9), 0xff2010, 0], [V(1.0, 1.9, 1.9), 0x20ff40, 0], [V(-md.len * 0.52, 2.2, 0), 0xfff4e0, 0], [V(-1.0, 2.75, 0), 0xff2010, 1.1], [V(1.5, 0.4, 0), 0xff2010, 1.1]]
        .map(([p, c, blink], j) => ({ p, gi: glows.add(V(0, -500, 0), c, blink ? 1.6 : 0.9, { blink, phase: rng.next() + j * 0.3, mode: 1, k: blink ? 4 : 2.4 }) }));
      return { g, md, rotor, disc, tail, tdisc, kind, o, day, lights, ph: rng.range(0, 6.28), pos: V(), prev: V(), vel: V(), yaw: 0, roll: 0, spin: rng.range(0, 6), on: false, id: i };
    });
    // the searchlights: fake additive cones; the pools come from OUT.oSpot
    const coneGeo = new THREE.CylinderGeometry(0.4, 1, 1, 18, 1, true); coneGeo.translate(0, -0.5, 0);
    const coneMat = new THREE.ShaderMaterial({
      uniforms: { op: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = 1.0 + position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: CONE_FS,
    });
    this.cones = [0, 1].map(() => { const m = new THREE.Mesh(coneGeo, coneMat.clone()); m.frustumCulled = false; m.visible = false; scene.add(m); return m; });
    this.flybyT = 40;
    this.snd = null;
  }

  // a machine's pose at time t for its patrol
  patrol(h, t, dt) {
    const o = h.o, p = h.pos;
    if (h.kind === 'orbit') {
      const a = h.ph + t * o.w;
      p.set(o.c.x + Math.cos(a) * o.r, G0 + o.y + Math.sin(t * 0.21 + h.ph) * 12, o.c.z + Math.sin(a) * o.r);
    } else if (h.kind === 'hover') {
      p.copy(o.p).add(V(Math.sin(t * 0.13 + h.ph) * 14, Math.sin(t * 0.31 + h.ph) * 4, Math.cos(t * 0.11 + h.ph) * 10));
    } else if (h.kind === 'sweep') {
      const span = o.z1 - o.z0, u = ((t * o.v + h.ph * 40) % (2 * span) + 2 * span) % (2 * span), k = u < span ? u / span : 2 - u / span;
      p.set(o.x + Math.sin(t * 0.17) * 6, G0 + o.y + Math.sin(t * 0.23) * 6, o.z0 + span * (k * k * (3 - 2 * k)));
    } else {
      // the flyby: up West Broadway, low over the T and the roof, gone north; parked far away otherwise
      const T = 26, u = h.fly ?? -1;
      if (u < 0) p.set(-600, 200, -2600);
      else {
        const k = u / T;
        p.set(6 + Math.sin(k * 3) * 4, G0 + 70 - 44 * Math.sin(Math.min(1, k * 1.35) * Math.PI * 0.5) + Math.max(0, k - 0.8) * 120, -720 + k * 1200);
        h.fly = u + dt; if (h.fly > T) h.fly = -1;
      }
    }
  }

  update(dt, t, p, day, cam, debris) {
    const nightK = smoothstep(0.35, 0.8, p.night);
    // one comes up the street every couple of minutes from the second day
    const fb = this.helis.find((h) => h.kind === 'flyby');
    if (fb && day >= fb.day && (fb.fly ?? -1) < 0) { this.flybyT -= dt; if (this.flybyT <= 0) { this.flybyT = this.rng.range(90, 160); fb.fly = 0; fb.rattled = false; } }
    let near = null, nd = 1e9, spots = 0;
    const camPos = cam.position;
    for (const h of this.helis) {
      const on = day >= h.day;
      h.g.visible = on;
      for (const l of h.lights) if (!on) this.glows.move(l.gi, 0, -500, 0);
      if (!on) continue;
      h.prev.copy(h.pos);
      this.patrol(h, t, dt);
      h.vel.copy(h.pos).sub(h.prev).divideScalar(Math.max(dt, 1e-3));
      // face the way it flies (or its target while hovering), bank into turns, nose down with speed
      const sp = Math.hypot(h.vel.x, h.vel.z);
      let want = h.yaw;
      if (sp > 2) want = Math.atan2(-h.vel.z, h.vel.x);
      else if (h.o.look) want = Math.atan2(-(h.o.look.z - h.pos.z), h.o.look.x - h.pos.x);
      let dy = want - h.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      h.yaw += dy * Math.min(1, dt * 0.8);
      h.roll += (clamp(-dy * 2.5, -0.4, 0.4) - h.roll) * Math.min(1, dt * 1.5);
      h.g.position.copy(h.pos);
      h.g.rotation.set(h.roll, h.yaw, -clamp(sp / 60, 0, 0.22), 'YXZ');
      h.spin += dt * (h.md.blades === 2 ? 11 : 9);
      h.rotor.rotation.y = h.spin; h.tail.rotation.y = h.spin * 4.3;
      h.g.updateMatrixWorld();
      const lp = V();
      for (const l of h.lights) { lp.copy(l.p).applyMatrix4(h.g.matrixWorld); this.glows.move(l.gi, lp.x, lp.y, lp.z); }
      const d = h.pos.distanceTo(camPos);
      if (d < nd) { nd = d; near = h; }
      // searchlights at night: the sweeper, the street hover, and whoever comes up the street
      const wantsSpot = (h.kind === 'sweep' || (h.kind === 'hover' && h.o.spot === 0) || (h.kind === 'flyby' && (h.fly ?? -1) >= 0)) && nightK > 0.01 && spots < 2;
      if (wantsSpot) {
        const i = spots++, cone = this.cones[i];
        const src = V(4, 0.5, 0).applyMatrix4(h.g.matrixWorld);
        const tgt = h.kind === 'hover' ? V(h.o.look.x + Math.sin(t * 0.4) * 12, G0, h.o.look.z + Math.sin(t * 0.27) * 60) : V(h.pos.x + Math.sin(t * 0.7 + h.id) * 6, G0, h.pos.z - 30 + Math.sin(t * 0.5) * 20);
        const len = src.distanceTo(tgt), r = len * 0.07;
        cone.visible = true; cone.position.copy(src); cone.scale.set(r, len, r);
        cone.quaternion.setFromUnitVectors(V(0, -1, 0), tgt.clone().sub(src).normalize());
        cone.material.uniforms.op.value = 0.07 * nightK;
        OUT.oSpotP.value[i].set(src.x, src.y, src.z, nightK);
        OUT.oSpotT.value[i].set(tgt.x, tgt.y, tgt.z, r * 1.05);
      }
      // rotor wash from the one that comes over the roof: curtains, dust off the street, the glass
      if (h.kind === 'flyby' && (h.fly ?? -1) >= 0) {
        const k = clamp(1 - d / 90, 0, 1);
        if (k > 0) {
          G.windGust = Math.max(G.windGust || 0, k * 0.6);
          if (G.fx && k > 0.55 && Math.random() < dt * 4) G.fx.pulse('shake', k * 0.25, 0.4);
          if (!h.rattled && k > 0.7 && G.audio) { h.rattled = true; G.audio.play('windowThud', { vol: 0.35 }); }
        }
        if (debris && h.pos.y < G0 + 60 && Math.random() < dt * 6) debris.puff(V(h.pos.x + (Math.random() - 0.5) * 16, G0 + 1, h.pos.z + (Math.random() - 0.5) * 16), V((Math.random() - 0.5) * 12, 2, (Math.random() - 0.5) * 12), 6, 8, 5, new THREE.Color(0.45, 0.42, 0.38), 0.4);
      }
    }
    for (let i = spots; i < 2; i++) { this.cones[i].visible = false; OUT.oSpotP.value[i].w = 0; }
    // one rotor sound, positioned at the nearest machine
    if (G.audio && G.audio.ctx) {
      if (!this.snd) this.snd = G.audio.loop('rotor', { pos: camPos.clone(), vol: 0, ref: 30, rolloff: 0.5 });
      const vol = near && !this.quiet ? clamp(110 / Math.max(nd, 30), 0, 1) * 0.9 * (nd < 1500 ? 1 : 0) : 0;
      if (near) this.snd.set({ pos: near.pos, vol });
    }
  }
  stopSound() { if (this.snd) { this.snd.stop(0.5); this.snd = null; } }
}
