// Renderer + post pipeline in the old game's hand-painted cartoon look:
// toon-banded lighting (src/gfx/toon.js) -> scene at ~720p -> 4-quadrant Kuwahara brush patches,
// bloom, depth ink with a hand-drawn wobble + light colour edges -> ACES + grade -> upscale with
// grain, vignette, fades, flashes and letterbox bars.
import * as THREE from 'three';
import '../gfx/toon.js';
import { game } from './game.js';
import { clamp, lerp } from './util.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fsMaterial = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float prefilter;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * texel).rgb; }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2)), d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2)), j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (prefilter > 0.5) { float br = max(col.r, max(col.g, col.b)); float soft = clamp(br - threshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5; col *= max(soft, br - threshold) / max(br, 1e-4); col = min(col, vec3(40.0)); }
  gl_FragColor = vec4(col, 1.0);
}`;
const UP = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 texel; uniform float radius;
varying vec2 vUv;
void main() {
  vec2 o = texel * radius;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(0, o.y)).rgb * 2.0 + texture2D(tSrc, vUv + o).rgb
    + texture2D(tSrc, vUv + vec2(-o.x, 0)).rgb * 2.0 + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(o.x, 0)).rgb * 2.0
    + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + vec2(0, -o.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(c / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;
const BLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += (texture2D(tSrc, vUv + dir * 1.3846153846).rgb + texture2D(tSrc, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSrc, vUv + dir * 3.2307692308).rgb + texture2D(tSrc, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
// The old game's composite: brush patches, bloom, ink, tonemap, grade.
const COMPOSITE = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBlur; uniform sampler2D tDepth;
uniform float bloom; uniform float exposure; uniform float saturation; uniform float contrast; uniform float temperature;
uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform vec3 tint;
uniform vec2 res; uniform vec2 nearFar; uniform float ink; uniform float paint;
uniform float focus; uniform float focusRange; uniform float dof;
varying vec2 vUv;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y); }
float invZ(vec2 uv) { float d = texture2D(tDepth, uv).r; return (nearFar.y - d * (nearFar.y - nearFar.x)) / (nearFar.x * nearFar.y); }
vec3 painted(vec2 uv, vec2 px) {
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0), s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec3 c = texture2D(tScene, uv + vec2(float(i), float(j)) * px).rgb; c = c / (1.0 + c); vec3 cc = c * c;
    if (i <= 0 && j <= 0) { m0 += c; s0 += cc; } if (i >= 0 && j <= 0) { m1 += c; s1 += cc; }
    if (i <= 0 && j >= 0) { m2 += c; s2 += cc; } if (i >= 0 && j >= 0) { m3 += c; s3 += cc; }
  }
  m0 /= 9.0; m1 /= 9.0; m2 /= 9.0; m3 /= 9.0;
  vec3 v0 = abs(s0 / 9.0 - m0 * m0), v1 = abs(s1 / 9.0 - m1 * m1), v2 = abs(s2 / 9.0 - m2 * m2), v3 = abs(s3 / 9.0 - m3 * m3);
  float w0 = 1.0 / pow(1.0 + 600.0 * (v0.r + v0.g + v0.b), 4.0), w1 = 1.0 / pow(1.0 + 600.0 * (v1.r + v1.g + v1.b), 4.0);
  float w2 = 1.0 / pow(1.0 + 600.0 * (v2.r + v2.g + v2.b), 4.0), w3 = 1.0 / pow(1.0 + 600.0 * (v3.r + v3.g + v3.b), 4.0);
  vec3 r = (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / (w0 + w1 + w2 + w3);
  return r / max(vec3(1e-3), 1.0 - r);
}
float lum(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
float inkLine(vec2 uv, vec2 px) {
  vec2 wob = (vec2(vnoise(uv * res / 19.0), vnoise(uv * res / 19.0 + 31.0)) - 0.5) * 1.6;
  uv = (floor(uv * res + wob) + 0.5) * px;
  float wc = invZ(uv);
  float wn = max(wc, max(max(invZ(uv + vec2(px.x, 0.0)), invZ(uv - vec2(px.x, 0.0))), max(invZ(uv + vec2(0.0, px.y)), invZ(uv - vec2(0.0, px.y)))));
  float zNear = 1.0 / wn;
  vec2 o = px * (zNear < 2.2 ? 2.0 : 1.0);
  float wl = invZ(uv - vec2(o.x, 0.0)), wr = invZ(uv + vec2(o.x, 0.0)), wd = invZ(uv - vec2(0.0, o.y)), wu = invZ(uv + vec2(0.0, o.y));
  float a1 = invZ(uv + o), a2 = invZ(uv - o), a3 = invZ(uv + vec2(o.x, -o.y)), a4 = invZ(uv + vec2(-o.x, o.y));
  float lap = abs(wl + wr - 2.0 * wc) + abs(wd + wu - 2.0 * wc) + 0.5 * (abs(a1 + a2 - 2.0 * wc) + abs(a3 + a4 - 2.0 * wc));
  float e = smoothstep(0.006, 0.03, lap / wn);
  float tl = lum(texture2D(tScene, uv + vec2(-o.x, o.y)).rgb), tc = lum(texture2D(tScene, uv + vec2(0.0, o.y)).rgb), tr = lum(texture2D(tScene, uv + o).rgb);
  float ml = lum(texture2D(tScene, uv - vec2(o.x, 0.0)).rgb), mr = lum(texture2D(tScene, uv + vec2(o.x, 0.0)).rgb);
  float bl = lum(texture2D(tScene, uv - o).rgb), bc = lum(texture2D(tScene, uv - vec2(0.0, o.y)).rgb), br = lum(texture2D(tScene, uv + vec2(o.x, -o.y)).rgb);
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  e = max(e, smoothstep(0.5, 0.95, length(vec2(gx, gy))) * 0.35);
  return e * (1.0 - smoothstep(18.0, 140.0, zNear) * 0.65);
}
void main() {
  vec2 px = 1.0 / res;
  vec3 c = texture2D(tScene, vUv).rgb;
  if (paint > 0.01) c = mix(c, painted(vUv, px * (0.8 + paint * 0.5)), min(1.0, paint * 1.4));
  if (dof > 0.0) { float z = 1.0 / invZ(vUv); float coc = clamp(abs(z - focus) / max(focusRange, 1e-3) - 0.15, 0.0, 1.0) * dof; c = mix(c, texture2D(tBlur, vUv).rgb, coc); }
  c += texture2D(tBloom, vUv).rgb * bloom;
  if (ink > 0.01) c = mix(c, vec3(0.012, 0.01, 0.009), inkLine(vUv, px) * min(1.0, ink * 1.15));
  c *= exposure;
  c *= vec3(1.0 + temperature * 0.10, 1.0, 1.0 - temperature * 0.12);
  c = toSRGB(aces(c));
  c = gain * (c + lift * (1.0 - c));
  c = pow(max(c, 0.0), 1.0 / gamma);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  c *= tint;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
const FINAL = /* glsl */`
uniform sampler2D tSrc; uniform vec2 resolution;
uniform float time; uniform float grain; uniform float vignette; uniform float ca; uniform float fade; uniform vec3 fadeColor;
uniform float flash; uniform vec3 flashColor; uniform float letterbox; uniform float aspect; uniform float scanlines; uniform float warp;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  if (warp > 0.0) uv += vec2(sin(uv.y * 20.0 + time * 3.0), cos(uv.x * 17.0 + time * 2.3)) * 0.004 * warp;
  vec2 cc = uv - 0.5; float r2 = dot(cc, cc);
  vec3 col;
  if (ca > 0.0) { vec2 off = cc * r2 * ca * 0.06; col = vec3(texture2D(tSrc, uv + off).r, texture2D(tSrc, uv).g, texture2D(tSrc, uv - off).b); }
  else col = texture2D(tSrc, uv).rgb;
  col *= 1.0 - vignette * smoothstep(0.15, 0.75, r2 * 1.6);
  col += (hash(uv * resolution + fract(time * 13.7) * 100.0) - 0.5) * grain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
  // break up banding in dark gradients
  col += (hash(uv * resolution * 1.7) - 0.5) / 255.0;
  if (scanlines > 0.0) col *= 1.0 - scanlines * (0.5 + 0.5 * sin(uv.y * resolution.y * 1.5));
  col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
  col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
  if (letterbox > 0.0) { float target = 1.0 / 2.39 * aspect; float bar = (1.0 - min(1.0, target)) * 0.5 * letterbox; if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0); }
  gl_FragColor = vec4(col, 1.0);
}`;

export const DEFAULT_GRADE = {
  exposure: 1.0, bloom: 0.5, bloomThreshold: 1.0, bloomRadius: 1.0,
  saturation: 1.05, contrast: 1.04, lift: [0.015, 0.012, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], temperature: 0,
  vignette: 0.35, grain: 0.035, ca: 0.25, paint: 0.6, inkLines: 0.7, inkFar: 40,
  dof: 0, focus: 3, focusRange: 2,
  fade: 0, fadeColor: [0, 0, 0], flash: 0, flashColor: [1, 1, 1], letterbox: 0, scanlines: 0, warp: 0,
};
const RES = { low: 540, medium: 720, high: 900 };

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.grade = structuredClone(DEFAULT_GRADE);
    this.shake = 0; this.shakeT = 0; this.tickers = new Set();
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
    this.quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mDown = fsMaterial(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, prefilter: { value: 0 } });
    this.mUp = fsMaterial(UP, { tSrc: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.mBlur = fsMaterial(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mComp = fsMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tDepth: { value: null },
      bloom: { value: 0.5 }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 }, temperature: { value: 0 },
      lift: { value: new THREE.Vector3() }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) }, tint: { value: new THREE.Vector3(1, 1, 1) },
      res: { value: new THREE.Vector2() }, nearFar: { value: new THREE.Vector2(0.1, 100) }, ink: { value: 0.7 }, paint: { value: 0.6 },
      focus: { value: 3 }, focusRange: { value: 2 }, dof: { value: 0 },
    });
    this.mFinal = fsMaterial(FINAL, {
      tSrc: { value: null }, resolution: { value: new THREE.Vector2() }, time: { value: 0 }, grain: { value: 0.04 }, vignette: { value: 0.35 }, ca: { value: 0.25 },
      fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) },
      letterbox: { value: 0 }, aspect: { value: 1 }, scanlines: { value: 0 }, warp: { value: 0 },
    });
    this.targets = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    game.events.on('settings', ({ key }) => { if (key === 'quality') this.resize(); });
  }
  get quality() { return game.settings.get('quality'); }
  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    // internal render resolution (the old game rendered at ~720p and upscaled)
    const H = Math.min(RES[this.quality] || 720, Math.floor(h * dpr));
    this.height = H; this.width = Math.max(2, Math.round(H * (w / h)));
    this.pixelRatio = H / h;
    this.screenW = Math.floor(w * dpr); this.screenH = Math.floor(h * dpr);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.allocTargets();
    game.events.emit('resize', { w, h });
  }
  allocTargets() {
    if (this.targets) Object.values(this.targets).flat().forEach((t) => t.dispose?.());
    const W = this.width, H = this.height;
    const hf = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const depthTexture = new THREE.DepthTexture(W, H); depthTexture.type = THREE.UnsignedIntType; depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    const scene = new THREE.WebGLRenderTarget(W, H, { ...hf, depthBuffer: true, depthTexture });
    const bloom = []; let w = W, h = H;
    for (let i = 0; i < 6; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); bloom.push(new THREE.WebGLRenderTarget(w, h, hf)); }
    const bloomUp = bloom.slice(0, 5).map((t) => new THREE.WebGLRenderTarget(t.width, t.height, hf));
    const blurA = new THREE.WebGLRenderTarget(W >> 1, H >> 1, hf), blurB = new THREE.WebGLRenderTarget(W >> 1, H >> 1, hf);
    const comp = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.targets = { scene, bloom, bloomUp, blurA, blurB, comp };
  }
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  addShake(amount) { if (game.settings.get('shake')) this.shake = Math.min(1.5, this.shake + amount); }
  render(scene, camera, dt = 0) {
    const r = this.renderer, T = this.targets, g = this.grade;
    let sx = 0, sy = 0, sr = 0;
    if (this.shake > 0.001) {
      this.shakeT += dt * 30; const s = this.shake * 0.02;
      sx = Math.sin(this.shakeT * 1.3) * s; sy = Math.cos(this.shakeT * 1.7) * s; sr = Math.sin(this.shakeT * 2.1) * s * 0.5;
      camera.position.x += sx; camera.position.y += sy; camera.rotation.z += sr; camera.updateMatrixWorld();
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    camera.layers.enable(2);
    r.setRenderTarget(T.scene); r.clear(); r.render(scene, camera);
    if (sx || sy || sr) { camera.position.x -= sx; camera.position.y -= sy; camera.rotation.z -= sr; camera.updateMatrixWorld(); }
    // bloom
    let src = T.scene.texture, sw = this.width, sh = this.height;
    for (let i = 0; i < T.bloom.length; i++) {
      this.mDown.uniforms.tSrc.value = src; this.mDown.uniforms.texel.value.set(1 / sw, 1 / sh);
      this.mDown.uniforms.prefilter.value = i === 0 ? 1 : 0; this.mDown.uniforms.threshold.value = g.bloomThreshold;
      this.pass(this.mDown, T.bloom[i]); src = T.bloom[i].texture; sw = T.bloom[i].width; sh = T.bloom[i].height;
    }
    for (let i = T.bloomUp.length - 1; i >= 0; i--) {
      const lower = i === T.bloomUp.length - 1 ? T.bloom[i + 1] : T.bloomUp[i + 1];
      this.mUp.uniforms.tSrc.value = lower.texture; this.mUp.uniforms.tPrev.value = T.bloom[i].texture;
      this.mUp.uniforms.texel.value.set(1 / lower.width, 1 / lower.height); this.mUp.uniforms.radius.value = g.bloomRadius;
      this.pass(this.mUp, T.bloomUp[i]);
    }
    const useDof = g.dof > 0.001 && game.settings.get('dof') && this.quality !== 'low';
    if (useDof) {
      for (const [s0, d] of [[T.scene, [2.2 / this.width, 0]], [T.blurA, [0, 2.2 / this.height]], [T.blurB, [4 / this.width, 0]], [T.blurA, [0, 4 / this.height]]]) {
        this.mBlur.uniforms.tSrc.value = s0.texture; this.mBlur.uniforms.dir.value.set(...d); this.pass(this.mBlur, s0 === T.blurA ? T.blurB : T.blurA);
      }
    }
    const cu = this.mComp.uniforms;
    cu.tScene.value = T.scene.texture; cu.tBloom.value = T.bloomUp[0].texture; cu.tBlur.value = T.blurB.texture; cu.tDepth.value = T.scene.depthTexture;
    cu.bloom.value = g.bloom; cu.exposure.value = g.exposure; cu.saturation.value = g.saturation; cu.contrast.value = g.contrast; cu.temperature.value = g.temperature;
    cu.lift.value.fromArray(g.lift); cu.gamma.value.fromArray(g.gamma); cu.gain.value.fromArray(g.gain); cu.tint.value.fromArray(g.tint);
    cu.res.value.set(this.width, this.height); cu.nearFar.value.set(camera.near, camera.far);
    cu.ink.value = game.settings.get('outlines') === false ? 0 : g.inkLines;
    cu.paint.value = game.settings.get('painterly') === false || this.quality === 'low' ? 0 : g.paint;
    cu.focus.value = g.focus; cu.focusRange.value = g.focusRange; cu.dof.value = useDof ? g.dof : 0;
    this.pass(this.mComp, T.comp);
    const fu = this.mFinal.uniforms;
    fu.tSrc.value = T.comp.texture; fu.resolution.value.set(this.screenW, this.screenH); fu.time.value = game.time;
    fu.grain.value = g.grain; fu.vignette.value = g.vignette; fu.ca.value = g.ca; fu.fade.value = g.fade; fu.fadeColor.value.fromArray(g.fadeColor);
    fu.flash.value = game.settings.get('flashes') ? g.flash : g.flash * 0.3; fu.flashColor.value.fromArray(g.flashColor);
    fu.letterbox.value = g.letterbox; fu.aspect.value = this.width / this.height; fu.scanlines.value = g.scanlines; fu.warp.value = g.warp;
    this.pass(this.mFinal, null);
  }
  setGrade(partial) { Object.assign(this.grade, structuredClone(partial)); }
  lerpGrade(target, k) {
    for (const [key, v] of Object.entries(target)) {
      const cur = this.grade[key];
      if (Array.isArray(v)) for (let i = 0; i < v.length; i++) cur[i] = lerp(cur[i], v[i], k);
      else if (typeof v === 'number') this.grade[key] = lerp(cur, v, k);
    }
  }
  tweenGrade(key, to, sec, easeFn = (t) => t) {
    const from = this.grade[key];
    return new Promise((res) => {
      if (sec <= 0) { this.grade[key] = to; res(); return; }
      let t = 0;
      const tick = (dt) => { t += dt; const k = clamp(t / sec); this.grade[key] = lerp(from, to, easeFn(k)); if (k >= 1) { this.tickers.delete(tick); res(); } };
      this.tickers.add(tick);
    });
  }
  update(dt) { for (const t of [...this.tickers]) t(dt); }
}
