// The bathroom mirror: a real planar reflection (oblique-clipped virtual
// camera into a small HDR target). From day 4 it starts to disagree with you:
// it lags, it keeps looking when you look away, it shows what you are becoming.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { clamp } from '../core/util.js';

const W = 240, H = 136, RING = 18;

export class Mirror {
  constructor(spot) {
    this.spot = spot;
    this.ring = [];
    for (let i = 0; i < RING; i++) this.ring.push(new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    this.head = 0; this.shown = 0; this.frozen = false; this.seen = 0;
    this.u = { tMap: { value: this.ring[0].texture }, texMat: { value: new THREE.Matrix4() }, uTime: G.uniforms.uTime, uWarp: { value: 0 }, uDirt: { value: 0.25 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `uniform mat4 texMat; varying vec4 vP; varying vec2 vUv; void main(){ vUv = uv; vP = texMat * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tMap; uniform float uTime; uniform float uWarp; uniform float uDirt; varying vec4 vP; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vP.xy / vP.w;
          uv.x += sin(uv.y * 30.0 + uTime * 1.7) * 0.004 * uWarp;
          uv.y += sin(uv.x * 22.0 - uTime * 1.3) * 0.003 * uWarp;
          vec3 c = texture2D(tMap, uv).rgb * vec3(0.9, 0.95, 0.92);
          // silvering worn at the edges, water spots, grime
          vec2 e = abs(vUv - 0.5) * 2.0;
          float edge = smoothstep(0.82, 1.0, max(e.x, e.y));
          float spots = smoothstep(0.985, 1.0, h(floor(vUv * vec2(90.0, 110.0))));
          c = mix(c, vec3(0.06, 0.055, 0.05), edge * 0.7 + spots * 0.5);
          c *= 1.0 - uDirt * 0.3 * h(floor(vUv * 18.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), mat);
    m.position.copy(spot.pos); m.position.z += 0.009;
    m.rotation.y = spot.ry || 0;
    G.world.root.add(m);
    m.updateMatrixWorld(true);
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = true;
    G.mirror = this;
  }

  update(dt) {
    const cam = G.camera, m = this.mesh;
    const p = cam.position;
    const toM = m.position.clone().sub(p);
    const dist = toM.length();
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
    const lookDot = toM.clone().normalize().dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    const z = G.world.zoneAt(G.player.ctrl.body.position);
    const inBath = z && z.name === 'bath';
    if (!inBath || dist > 4.5 || toM.dot(n) > 0) { this.seen = Math.max(0, this.seen - dt); return; }
    if (lookDot > 0.8 && dist < 1.8) this.seen += dt; else this.seen = Math.max(0, this.seen - dt * 0.3);
    const day = G.story.day;
    this.u.uWarp.value = day >= 5 ? 1 + (day - 5) * 0.8 : 0;
    // day 5+: when you look away, it keeps the last look
    this.frozen = day >= 5 && lookDot < 0.55;
    if (this.frozen) return;
    this.render(cam, n);
    const lag = day >= 4 ? Math.min(RING - 1, 8 + (day - 4) * 4) : 0;
    this.shown = (this.head - lag + RING * 4) % RING;
    this.u.tMap.value = this.ring[this.shown].texture;
  }

  render(camera, normal) {
    const m = this.mesh, v = this.cam;
    const mp = m.getWorldPosition(new THREE.Vector3());
    const cp = camera.position.clone();
    const rot = new THREE.Matrix4().extractRotation(m.matrixWorld);
    const view = mp.clone().sub(cp);
    view.reflect(normal).negate().add(mp);
    rot.extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    const target = mp.clone().sub(look).reflect(normal).negate().add(mp);
    v.position.copy(view);
    v.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    v.lookAt(target);
    v.near = camera.near; v.far = camera.far;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(camera.projectionMatrix);
    // texture matrix for projective lookup
    const tm = this.u.texMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse).multiply(m.matrixWorld);
    // oblique near plane = the mirror plane
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mp);
    plane.applyMatrix4(v.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = v.projectionMatrix, e = pm.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    // what the mirror shows of you: the head (hidden in first person) and, later, worse
    const bu = G.body.u, day = G.story.day;
    const saved = { hide: bu.uHideHead.value, split: bu.uSplit.value, bv: bu.uBlackVeins.value, glow: bu.uGlow.value, belly: bu.uBelly.value };
    bu.uHideHead.value = 0;
    if (day >= 6) { bu.uSplit.value = 0.45; bu.uBlackVeins.value = 1; bu.uGlow.value = 0.6; bu.uBelly.value = Math.min(1.4, saved.belly + 0.35); }
    m.visible = false;
    this.head = (this.head + 1) % RING;
    const r = G.engine.renderer;
    const prev = r.getRenderTarget();
    const sAuto = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.ring[this.head]);
    r.clear();
    r.render(G.scene, v);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = sAuto;
    m.visible = true;
    bu.uHideHead.value = saved.hide; bu.uSplit.value = saved.split; bu.uBlackVeins.value = saved.bv; bu.uGlow.value = saved.glow; bu.uBelly.value = saved.belly;
  }
}
