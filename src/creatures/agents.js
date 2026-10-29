// The men in dark windbreakers. Three agents come through 4B's door with
// flashlights and walk a search of the apartment. Two of the lights are real
// (shadowless spots); the third is a beam of dust and nothing else. A beam
// that finds Alex with nothing in between ends it. Sound turns them.
import * as THREE from 'three';
import { G, on } from '../core/globals.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/util.js';
import { GROUP } from '../core/physics.js';
import { Person } from './people.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sfx = (n, o) => G.audio && G.audio.play(n, o);
// voices: two men on the floor, one on the radio
export const VOICE = {
  a: { pitch: 102, formant: 0.96, speed: 1.1, breathy: 0.05 },
  b: { pitch: 118, formant: 1.0, speed: 1.05, breathy: 0.06, jitter: 0.02 },
  c: { pitch: 92, formant: 0.94, speed: 1.0, breathy: 0.08 },
  radio: { pitch: 128, formant: 1.02, speed: 1.15, breathy: 0.03 },
};
const HALF = 0.3, RANGE = 7.5;       // beam half-angle (rad) and reach (m)

// a cone of lit dust, length set each frame to where the beam lands
function beamMesh() {
  const g = new THREE.CylinderGeometry(0.035, 1, 1, 18, 1, true); g.translate(0, -0.5, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { op: { value: 0 }, uTime: G.uniforms.uTime },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vY = -position.y; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float op; uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        float e = pow(abs(dot(vN, vV)), 2.0);
        float dust = 0.75 + 0.25 * sin(vW.x * 9.0 + uTime * 0.7) * sin(vW.y * 7.0 - uTime * 0.5) * sin(vW.z * 8.0);
        float a = op * (0.25 + e) * (1.0 - vY) * (1.0 - vY) * dust * 0.32;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5;
  return mesh;
}
function glareMesh() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.18, 'rgba(255,240,210,0.55)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(0.35); s.renderOrder = 6;
  return s;
}

class Agent {
  constructor(name, look, light) {
    this.name = name;
    this.p = new Person({ seed: name.charCodeAt(0), ...look });
    this.p.visible = false; this.p.torch = 1;
    G.scene.add(this.p.root);
    // the flashlight: a black body in the right hand
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.4, metalness: 0.6 }));
    torch.position.set(0, -0.09, 0.02); this.p.b.handR.add(torch);
    this.lens = new THREE.Object3D(); this.lens.position.set(0, -0.2, 0.02); this.p.b.handR.add(this.lens);
    this.light = light;      // a SpotLight, or null for the one that only looks lit
    this.beam = beamMesh(); this.beam.visible = false; G.scene.add(this.beam);
    this.glare = glareMesh(); this.glare.visible = false; G.scene.add(this.glare);
    this.pos = V(); this.yaw = 0; this.aim = { yaw: 0, pitch: 0.2 }; this.dir = V(0, 0, 1); this.from = V();
    this.route = []; this.ri = 0; this.wait = 0; this.on = false; this.reach = RANGE;
    this.hear = null; this.hearT = 0;
  }
  show(x, z, ry) { this.pos.set(x, 0, z); this.yaw = ry; this.p.root.position.copy(this.pos); this.p.root.rotation.y = ry; this.aim.yaw = ry; this.p.visible = true; this.on = true; }
  hide() { this.on = false; this.p.visible = false; this.beam.visible = false; this.glare.visible = false; if (this.light) this.light.intensity = 0; this.route = []; }
  go(route) { this.route = route; this.ri = 0; this.wait = 0; this.arrived = false; }
  get done() { return this.ri >= this.route.length; }

  update(dt, t) {
    if (!this.on) return;
    const p = this.p;
    // walk the route: each stop is {x, z, look (heading to sweep around), sweep, wait, say, open, fn}
    let speed = 0;
    const st = this.route[this.ri];
    if (st) {
      const dx = st.x - this.pos.x, dz = st.z - this.pos.z, d = Math.hypot(dx, dz);
      if (!this.arrived && d > 0.06) {
        const want = Math.atan2(dx, dz);
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        const sp = Math.min(st.run ? 2.4 : 1.05, d * 2.5 + 0.3) * clamp(1 - Math.abs(wrapAngle(want - this.yaw)) / 1.6, 0.2, 1);
        this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt;
        speed = sp;
        this.aimAt(st.walkLook ?? this.yaw, 0.32 + Math.sin(t * 2.1) * 0.05, dt, 4);
        if (st.open && !st.opened && d < 1.3) { st.opened = true; const door = st.open; if (door.angle < 0.9) { door.target = door.max * 0.92; door.unlatch && door.unlatch(); } }
      } else {
        if (!this.arrived) { this.arrived = true; this.wait = 0; if (st.say) this.say(st.say); if (st.fn) st.fn(this); }
        this.wait += dt;
        const base = st.look ?? this.yaw;
        if (st.face !== false) this.yaw = dampAngle(this.yaw, base, 3, dt);
        const sw = st.sweep ?? 0.6;
        this.aimAt(base + Math.sin(this.wait * (st.rate ?? 0.9) + (st.ph ?? 0)) * sw, st.pitch ?? 0.38, dt, 3);
        if (this.wait >= (st.wait ?? 2)) { this.ri++; this.arrived = false; }
      }
    } else this.aimAt(this.aim.yaw, this.aim.pitch, dt, 2);
    // something heard: the beam swings to it
    if (this.hearT > 0) { this.hearT -= dt; const h = this.hear; this.aimAt(Math.atan2(h.x - this.pos.x, h.z - this.pos.z), clamp(Math.atan2(1.4 - h.y, Math.hypot(h.x - this.pos.x, h.z - this.pos.z)), 0.05, 0.9), dt, 5); }
    p.speed = speed;
    // boots on whatever floor this is
    this.stepAcc = (this.stepAcc || 0) + speed * dt;
    if (this.stepAcc > 0.68) { this.stepAcc = 0; const z = G.world.zoneAt(this.pos.clone().setY(0.1)); sfx('step_' + (z ? z.surface : 'concrete'), { pos: this.pos.clone().setY(0.1), vol: speed > 1.5 ? 0.9 : 0.6, rate: 0.85 + Math.random() * 0.1 }); }
    p.root.position.copy(this.pos);
    p.root.rotation.y = this.yaw;
    p.aimYaw = clamp(wrapAngle(this.aim.yaw - this.yaw), -1.2, 1.2);
    p.aimPitch = this.aim.pitch;
    p.update(dt);
    // the beam: from the lens, along the aim
    p.root.updateMatrixWorld(true);
    this.lens.getWorldPosition(this.from);
    const cp = Math.cos(this.aim.pitch);
    this.dir.set(Math.sin(this.aim.yaw) * cp, -Math.sin(this.aim.pitch), Math.cos(this.aim.yaw) * cp).normalize();
    const far = this.from.clone().addScaledVector(this.dir, RANGE);
    const hit = G.physics.raycast(this.from, far);
    this.reach = hit ? Math.max(0.3, hit.distance) : RANGE;
    const L = Math.min(this.reach + 0.05, RANGE), r = Math.tan(HALF * 0.9) * L;
    this.beam.visible = true;
    this.beam.position.copy(this.from);
    this.beam.quaternion.setFromUnitVectors(V(0, -1, 0), this.dir);
    this.beam.scale.set(r, L, r);
    this.beam.material.uniforms.op.value = 1;
    // a hot spot when the lens points at you
    const cam = G.camera.position, toC = cam.clone().sub(this.from), dc = toC.length();
    const facing = toC.normalize().dot(this.dir);
    this.glare.visible = facing > 0.75 && dc < 12;
    if (this.glare.visible) { this.glare.position.copy(this.from).addScaledVector(this.dir, 0.02); this.glare.material.opacity = clamp((facing - 0.75) * 4, 0, 1) * (G.physics.lineClear(this.from, cam) ? 1 : 0); this.glare.scale.setScalar(0.25 + facing * 0.25); }
    if (this.light) {
      const l = this.light;
      l.position.copy(this.from);
      l.target.position.copy(this.from).addScaledVector(this.dir, 3);
      l.target.updateMatrixWorld();
      l.distance = Math.min(RANGE + 1, this.reach + 1.2);
      l.intensity = 13;
    }
  }
  aimAt(yaw, pitch, dt, rate) { this.aim.yaw = dampAngle(this.aim.yaw, yaw, rate, dt); this.aim.pitch = damp(this.aim.pitch, pitch, rate, dt); }
  say(line) { const h = G.audio && G.audio.speak(line, { voice: VOICE[this.name], pos: this.p.headWorld(), vol: 0.85 }); return h; }
  // can this beam see a point? 0..1
  sees(pt) {
    const v = pt.clone().sub(this.from), d = v.length();
    if (d > RANGE || d < 0.05) return 0;
    const c = v.multiplyScalar(1 / d).dot(this.dir);
    const inCone = c > Math.cos(HALF) || (d < 1.3 && c > 0.35);
    if (!inCone) return 0;
    if (!G.physics.lineClear(this.from, pt, GROUP.STATIC | GROUP.MOVER)) return 0;
    return 1 / (1 + d * 0.22);
  }
}

// ---------------------------------------------------------------------------
export class Raid {
  constructor(lights) {
    const coat = 0x181d2a, slacks = 0x202227;
    this.agents = [
      new Agent('a', { skin: 0xc4977a, jacket: coat, top: coat, under: 0x2a2e38, bottom: slacks, shoes: 0x0e0e10, hair: 0x2a2018, hat: 'cap', zip: 0x3a4050, height: 1.03, collar: coat }, lights[0]),
      new Agent('b', { skin: 0x9a6a4c, jacket: coat, top: coat, under: 0x2a2e38, bottom: slacks, shoes: 0x0e0e10, hair: 0x141010, hairStyle: 'short', zip: 0x3a4050, height: 0.99, collar: coat }, lights[1]),
      new Agent('c', { skin: 0xd4ab8c, jacket: coat, top: coat, under: 0x2a2e38, bottom: slacks, shoes: 0x0e0e10, hair: 0x6a4a2a, hat: 'cap', zip: 0x3a4050, height: 1.0, collar: coat }, null),
    ];
    this.active = false; this.exposure = 0;
    on('noise', (e) => this.noise(e));
  }
  get A() { return this.agents[0]; }
  get B() { return this.agents[1]; }
  get C() { return this.agents[2]; }
  hideAll() { this.active = false; for (const a of this.agents) a.hide(); G.fx.clear('raid'); }
  // footsteps, a cough, a dropped thing: whoever is close enough turns toward it
  noise(e) {
    if (!this.active || !e.pos || e.kind === 'roar') return;
    let best = null, bd = 1e9;
    for (const a of this.agents) { if (!a.on) continue; const d = a.pos.distanceTo(V(e.pos.x, 0, e.pos.z)); if (d < bd) { bd = d; best = a; } }
    if (!best || bd > (e.loud || 0.2) * 24) return;
    best.hear = V(e.pos.x, (e.pos.y || 0) + 0.8, e.pos.z); best.hearT = 2.6;
    if (!this.heardT || G.time - this.heardT > 9) { this.heardT = G.time; best.say(['Hold it.', 'You hear that?', 'Over there.'][Math.floor(Math.random() * 3)]); }
  }
  update(dt) {
    const t = G.time;
    for (const a of this.agents) a.update(dt, t);
    if (!this.active) return 0;
    // what of Alex can they see: the chest, and the head
    const pl = G.player.ctrl, bp = pl.body.position, peace = G.peace;
    let lit = 0, who = null;
    if (!(peace && peace.inTub)) {
      const h = pl.crouched ? 0.72 : 1.25;
      const pts = [V(bp.x, bp.y + h, bp.z), V(bp.x, bp.y + h + (pl.crouched ? 0.25 : 0.38), bp.z)];
      // standing in light (a lamp, the TV, a flashlight of your own) shows you to anyone facing your way
      const hand = G.player.inv.hand;
      const amb = G.world.lightAt(pts[0]) + (hand && hand.type === 'flashlight' && hand.state.on ? 1 : 0);
      for (const a of this.agents) {
        if (!a.on) continue;
        let s = 0; for (const p of pts) s = Math.max(s, a.sees(p));
        if (amb > 0.3 && s === 0) {
          const v = pts[0].clone().sub(a.from), d = v.length();
          if (d < 9 && v.normalize().dot(V(Math.sin(a.yaw), 0, Math.cos(a.yaw))) > 0.1 && G.physics.lineClear(a.from, pts[0])) s = Math.min(1, amb) * 0.5;
        }
        // standing right in front of one: no beam needed
        if (a.pos.distanceTo(V(bp.x, 0, bp.z)) < 0.85) s = 1;
        if (s > lit) { lit = s; who = a; }
      }
    } else {
      // behind the curtain: only someone at the tub itself would see
      for (const a of this.agents) if (a.on && a.pos.x < 0.95 && a.pos.z > 3.6 && a.pos.z < 5.6) { lit = 1; who = a; }
    }
    const moving = pl.speed > 0.3;
    if (lit > 0) this.exposure += dt * lit * 2.6 * (pl.crouched ? 0.7 : 1) * (moving ? 1.5 : 1);
    else this.exposure = Math.max(0, this.exposure - dt * 0.5);
    G.fx.set('raid', { red: this.exposure * 0.3, noiseBurst: this.exposure * 0.35, tunnel: this.exposure * 0.25 });
    if (lit > 0 && !this.hb) { this.hb = true; sfx('heartbeat', { vol: 0.7 }); setTimeout(() => (this.hb = false), 900); }
    this.spotter = who;
    return this.exposure;
  }
}
