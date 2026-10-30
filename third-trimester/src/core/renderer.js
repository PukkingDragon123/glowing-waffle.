// Renderer + painterly post pipeline:
// scene (HDR, MSAA) -> bloom chain + DOF blur -> composite (ACES, grade) -> generalized Kuwahara
// "oil paint" filter with soft ink edges -> final (canvas grain, vignette, chroma, fades, flash).
import * as THREE from 'three';
import { game } from './game.js';
import { clamp, lerp } from './util.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsMaterial(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

const DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float prefilter;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * texel).rgb; }
void main() {
  // 13-tap downsample (Jimenez 2014)
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (prefilter > 0.5) {
    float br = max(col.r, max(col.g, col.b));
    float soft = clamp(br - threshold + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
    float contrib = max(soft, br - threshold) / max(br, 1e-4);
    col *= contrib;
    col = min(col, vec3(40.0));
  }
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
uniform sampler2D tSrc; uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;
const COMPOSITE = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBlur; uniform sampler2D tDepth;
uniform float bloom; uniform float exposure; uniform float saturation; uniform float contrast;
uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform vec3 tint;
uniform float near; uniform float far; uniform float focus; uniform float focusRange; uniform float dof; uniform float useDepth;
uniform float temperature;
uniform sampler2D tNormal; uniform vec2 texel; uniform float ink; uniform vec3 inkColor; uniform float inkWidth; uniform float inkFar;
varying vec2 vUv;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
float linDepth(float z) { float ndc = z * 2.0 - 1.0; return (2.0 * near * far) / (far + near - ndc * (far - near)); }
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  if (dof > 0.0 && useDepth > 0.5) {
    float d = linDepth(texture2D(tDepth, vUv).r);
    float coc = clamp(abs(d - focus) / max(focusRange, 1e-3) - 0.15, 0.0, 1.0) * dof;
    col = mix(col, texture2D(tBlur, vUv).rgb, coc);
  }
  col += texture2D(tBloom, vUv).rgb * bloom;
  col *= exposure;
  // white balance-ish temperature shift before tonemap
  col *= vec3(1.0 + temperature * 0.10, 1.0, 1.0 - temperature * 0.12);
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  // lift / gamma / gain
  col = gain * (col + lift * (1.0 - col));
  col = pow(max(col, 0.0), 1.0 / gamma);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col *= tint;
  if (ink > 0.0) {
    vec2 o = texel * inkWidth;
    float d0 = linDepth(texture2D(tDepth, vUv).r);
    float dl = linDepth(texture2D(tDepth, vUv - vec2(o.x, 0.0)).r), dr = linDepth(texture2D(tDepth, vUv + vec2(o.x, 0.0)).r);
    float du = linDepth(texture2D(tDepth, vUv + vec2(0.0, o.y)).r), dd = linDepth(texture2D(tDepth, vUv - vec2(0.0, o.y)).r);
    float dmin = min(min(dl, dr), min(du, dd));
    float de = (abs(dl + dr - 2.0 * d0) + abs(du + dd - 2.0 * d0)) / max(min(d0, dmin), 1e-3);
    float depthEdge = smoothstep(0.03, 0.09, de);
    vec4 n0 = texture2D(tNormal, vUv), nl = texture2D(tNormal, vUv - vec2(o.x, 0.0)), nr = texture2D(tNormal, vUv + vec2(o.x, 0.0));
    vec4 nu = texture2D(tNormal, vUv + vec2(0.0, o.y)), nd = texture2D(tNormal, vUv - vec2(0.0, o.y));
    vec3 N0 = n0.xyz * 2.0 - 1.0;
    float ne = max(max(1.0 - dot(N0, nl.xyz * 2.0 - 1.0), 1.0 - dot(N0, nr.xyz * 2.0 - 1.0)), max(1.0 - dot(N0, nu.xyz * 2.0 - 1.0), 1.0 - dot(N0, nd.xyz * 2.0 - 1.0)));
    float normalEdge = smoothstep(0.22, 0.5, ne) * n0.a;
    float sil = abs(n0.a - nl.a) + abs(n0.a - nr.a) + abs(n0.a - nu.a) + abs(n0.a - nd.a);
    float e = max(max(depthEdge, normalEdge), clamp(sil, 0.0, 1.0));
    e *= 1.0 - smoothstep(inkFar * 0.5, inkFar, dmin);
    col = mix(col, inkColor, clamp(e * ink, 0.0, 1.0));
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
// Generalized Kuwahara with polynomial sector weights (Kyprianidis et al.)
const PAINT = /* glsl */`
uniform sampler2D tSrc; uniform vec2 texel; uniform float radius; uniform float strength; uniform float time; uniform sampler2D tCanvas; uniform vec2 canvasScale;
uniform float ink;
varying vec2 vUv;
#define N 8
void main() {
  vec3 base = texture2D(tSrc, vUv).rgb;
  if (strength <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
  vec4 m[8]; vec3 s[8];
  for (int k = 0; k < N; ++k) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  float zeta = 2.0 / radius;
  float zeroCross = 2.4; float sinZ = sin(zeroCross);
  float eta = (zeta + cos(zeroCross)) / (sinZ * sinZ);
  // brush wobble: jitter sampling with canvas grain so strokes are not perfectly isotropic
  vec2 jitter = (texture2D(tCanvas, vUv * canvasScale * 0.37).rg - 0.5) * 0.9;
  const int R = 4;
  for (int y = -R; y <= R; ++y) {
    for (int x = -R; x <= R; ++x) {
      vec2 v = vec2(float(x), float(y)) / float(R);
      if (dot(v, v) > 1.0) continue;
      vec3 c = texture2D(tSrc, vUv + (vec2(float(x), float(y)) * radius / float(R) + jitter) * texel).rgb;
      float w[8]; float z, vxx, vyy, sum = 0.0;
      vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
      vec2 r = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      vxx = zeta - eta * r.x * r.x; vyy = zeta - eta * r.y * r.y;
      z = max(0.0, r.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -r.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -r.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, r.x + vyy); w[7] = z * z; sum += w[7];
      float g = exp(-3.125 * dot(v, v)) / max(sum, 1e-5);
      for (int k = 0; k < N; ++k) { float wk = w[k] * g; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
    }
  }
  vec4 o = vec4(0.0);
  for (int k = 0; k < N; ++k) {
    m[k].rgb /= max(m[k].w, 1e-5);
    s[k] = abs(s[k] / max(m[k].w, 1e-5) - m[k].rgb * m[k].rgb);
    float sigma2 = s[k].r + s[k].g + s[k].b;
    float w = 1.0 / (1.0 + pow(255.0 * sigma2, 0.5 * 8.0));
    o += vec4(m[k].rgb * w, w);
  }
  vec3 painted = o.rgb / max(o.w, 1e-5);
  // soft ink: luminance gradient darkens strong edges a touch, like a drybrush outline
  float lx = dot(texture2D(tSrc, vUv + vec2(texel.x * 1.5, 0.0)).rgb - texture2D(tSrc, vUv - vec2(texel.x * 1.5, 0.0)).rgb, vec3(0.333));
  float ly = dot(texture2D(tSrc, vUv + vec2(0.0, texel.y * 1.5)).rgb - texture2D(tSrc, vUv - vec2(0.0, texel.y * 1.5)).rgb, vec3(0.333));
  float edge = smoothstep(0.08, 0.35, length(vec2(lx, ly)));
  painted *= 1.0 - edge * ink;
  // canvas weave shows through in flat areas
  float weave = texture2D(tCanvas, vUv * canvasScale).b - 0.5;
  painted += weave * 0.035 * strength;
  gl_FragColor = vec4(mix(base, painted, strength), 1.0);
}`;
const FINAL = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tCanvas; uniform vec2 canvasScale; uniform vec2 resolution;
uniform float time; uniform float grain; uniform float vignette; uniform float ca; uniform float fade; uniform vec3 fadeColor;
uniform float flash; uniform vec3 flashColor; uniform float letterbox; uniform float aspect; uniform float scanlines; uniform float warp;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  if (warp > 0.0) { uv += vec2(sin(uv.y * 20.0 + time * 3.0), cos(uv.x * 17.0 + time * 2.3)) * 0.004 * warp; }
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec3 col;
  if (ca > 0.0) {
    vec2 off = cc * r2 * ca * 0.06;
    col = vec3(texture2D(tSrc, uv + off).r, texture2D(tSrc, uv).g, texture2D(tSrc, uv - off).b);
  } else col = texture2D(tSrc, uv).rgb;
  col *= 1.0 - vignette * smoothstep(0.15, 0.75, r2 * 1.6);
  float n = hash(uv * resolution + fract(time * 13.7) * 100.0) - 0.5;
  col += n * grain * (0.6 + 0.4 * (1.0 - dot(col, vec3(0.333))));
  if (scanlines > 0.0) col *= 1.0 - scanlines * (0.5 + 0.5 * sin(uv.y * resolution.y * 1.5));
  col = mix(col, flashColor, clamp(flash, 0.0, 1.0));
  col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
  // cinematic bars (2.39:1 target)
  if (letterbox > 0.0) {
    float target = 1.0 / 2.39 * aspect; float bar = (1.0 - min(1.0, target)) * 0.5 * letterbox;
    if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function makeCanvasTexture() {
  // Procedural primed-canvas texture: r,g = smooth jitter field, b = weave.
  const S = 256, data = new Uint8Array(S * S * 4);
  const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (a, b) => h(((a % 32) + 32) % 32, ((b % 32) + 32) % 32);
    return (w(xi, yi) * (1 - u) + w(xi + 1, yi) * u) * (1 - v) + (w(xi, yi + 1) * (1 - u) + w(xi + 1, yi + 1) * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const weave = 0.5 + 0.25 * Math.sin(x * Math.PI * 0.5) * Math.sin(y * Math.PI * 0.5 + (Math.floor(x / 2) % 2) * Math.PI) + (h(x, y) - 0.5) * 0.35;
    data[i] = vn(x / 8, y / 8) * 255; data[i + 1] = vn(x / 8 + 17, y / 8 + 5) * 255; data[i + 2] = clamp(weave) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export const DEFAULT_GRADE = {
  exposure: 1.0, bloom: 0.55, bloomThreshold: 1.0, bloomRadius: 1.0,
  saturation: 1.0, contrast: 1.04, lift: [0.02, 0.015, 0.03], gamma: [1, 1, 1], gain: [1, 1, 1], tint: [1, 1, 1], temperature: 0,
  vignette: 0.32, grain: 0.025, ca: 0.25, paint: 1.0, ink: 0.18, paintRadius: 4.0, inkLines: 0.85, inkFar: 40,
  dof: 0, focus: 3, focusRange: 2,
  fade: 0, fadeColor: [0, 0, 0], flash: 0, flashColor: [1, 1, 1], letterbox: 0, scanlines: 0, warp: 0,
};

export class Gfx {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') });
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = true;
    this.grade = structuredClone(DEFAULT_GRADE);
    this.shake = 0; this.shakeT = 0;
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
    this.quad.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.canvasTex = makeCanvasTexture();
    this.mDown = fsMaterial(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, prefilter: { value: 0 } });
    this.mUp = fsMaterial(UP, { tSrc: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.mBlur = fsMaterial(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mComp = fsMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tDepth: { value: null },
      bloom: { value: 0.5 }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 },
      lift: { value: new THREE.Vector3() }, gamma: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) }, tint: { value: new THREE.Vector3(1, 1, 1) },
      near: { value: 0.1 }, far: { value: 100 }, focus: { value: 3 }, focusRange: { value: 2 }, dof: { value: 0 }, useDepth: { value: 1 }, temperature: { value: 0 },
      tNormal: { value: null }, texel: { value: new THREE.Vector2() }, ink: { value: 0.85 }, inkColor: { value: new THREE.Color(0.035, 0.028, 0.032) }, inkWidth: { value: 1 }, inkFar: { value: 40 },
    });
    this.normalMat = new THREE.MeshNormalMaterial();
    this.mPaint = fsMaterial(PAINT, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 4 }, strength: { value: 1 }, time: { value: 0 }, tCanvas: { value: this.canvasTex }, canvasScale: { value: new THREE.Vector2(1, 1) }, ink: { value: 0.2 } });
    this.mFinal = fsMaterial(FINAL, {
      tSrc: { value: null }, tCanvas: { value: this.canvasTex }, canvasScale: { value: new THREE.Vector2(1, 1) }, resolution: { value: new THREE.Vector2() },
      time: { value: 0 }, grain: { value: 0.05 }, vignette: { value: 0.4 }, ca: { value: 0.5 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) },
      flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) }, letterbox: { value: 0 }, aspect: { value: 1 }, scanlines: { value: 0 }, warp: { value: 0 },
    });
    this.targets = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    game.events.on('settings', ({ key }) => { if (key === 'quality') this.resize(); });
  }
  get quality() { return game.settings.get('quality'); }
  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    const q = this.quality;
    const pr = q === 'low' ? 0.75 : q === 'medium' ? Math.min(1.25, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.width = Math.floor(w * pr); this.height = Math.floor(h * pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.allocTargets();
    game.events.emit('resize', { w, h });
  }
  allocTargets() {
    if (this.targets) Object.values(this.targets).flat().forEach((t) => t.dispose());
    const W = this.width, H = this.height, q = this.quality;
    const hf = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const depthTexture = new THREE.DepthTexture(W, H); depthTexture.type = THREE.UnsignedIntType;
    const scene = new THREE.WebGLRenderTarget(W, H, { ...hf, depthBuffer: true, samples: q === 'low' ? 0 : 4 });
    const normal = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture });
    const bloom = [];
    let w = W, h = H;
    for (let i = 0; i < 6; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); bloom.push(new THREE.WebGLRenderTarget(w, h, hf)); }
    const bloomUp = bloom.slice(0, 5).map((t) => new THREE.WebGLRenderTarget(t.width, t.height, hf));
    const blurA = new THREE.WebGLRenderTarget(W >> 1, H >> 1, hf), blurB = new THREE.WebGLRenderTarget(W >> 1, H >> 1, hf);
    const ldr = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const comp = new THREE.WebGLRenderTarget(W, H, ldr), paint = new THREE.WebGLRenderTarget(W, H, ldr);
    this.targets = { scene, normal, bloom, bloomUp, blurA, blurB, comp, paint };
    const cs = 1 / 256;
    this.mPaint.uniforms.canvasScale.value.set(W * cs * 0.9, H * cs * 0.9);
    this.mFinal.uniforms.canvasScale.value.set(W * cs, H * cs);
  }
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  addShake(amount) { if (game.settings.get('shake')) this.shake = Math.min(1.5, this.shake + amount); }
  // Render scene through the full pipeline.
  render(scene, camera, dt = 0) {
    const r = this.renderer, T = this.targets, g = this.grade;
    // camera shake (applied temporarily)
    let shook = false;
    if (this.shake > 0.001) {
      this.shakeT += dt * 30; const s = this.shake * 0.02;
      camera.position.x += Math.sin(this.shakeT * 1.3) * s; camera.position.y += Math.cos(this.shakeT * 1.7) * s;
      camera.rotation.z += Math.sin(this.shakeT * 2.1) * s * 0.5; camera.updateMatrixWorld(); shook = true;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    // normal + depth pre-pass (ink lines, DOF). Layer 2 = no outline (hulls, glass, particles, sky).
    camera.layers.disable(2);
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.overrideMaterial = this.normalMat;
    r.getClearColor(this._cc ??= new THREE.Color()); const ca = r.getClearAlpha();
    r.setClearColor(0x8080ff, 0); r.setRenderTarget(T.normal); r.clear(); r.render(scene, camera);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; r.setClearColor(this._cc, ca);
    camera.layers.enable(2);
    r.setRenderTarget(T.scene); r.clear(); r.render(scene, camera);
    if (shook) { camera.rotation.z -= Math.sin(this.shakeT * 2.1) * this.shake * 0.01; }
    // bloom
    let src = T.scene.texture;
    for (let i = 0; i < T.bloom.length; i++) {
      const t = T.bloom[i];
      this.mDown.uniforms.tSrc.value = src; this.mDown.uniforms.texel.value.set(1 / (i === 0 ? this.width : T.bloom[i - 1].width), 1 / (i === 0 ? this.height : T.bloom[i - 1].height));
      this.mDown.uniforms.prefilter.value = i === 0 ? 1 : 0; this.mDown.uniforms.threshold.value = g.bloomThreshold;
      this.pass(this.mDown, t); src = t.texture;
    }
    let prev = T.bloom[T.bloom.length - 1].texture;
    for (let i = T.bloomUp.length - 1; i >= 0; i--) {
      const lower = i === T.bloomUp.length - 1 ? T.bloom[i + 1] : T.bloomUp[i + 1];
      this.mUp.uniforms.tSrc.value = lower.texture; this.mUp.uniforms.tPrev.value = T.bloom[i].texture;
      this.mUp.uniforms.texel.value.set(1 / lower.width, 1 / lower.height); this.mUp.uniforms.radius.value = g.bloomRadius;
      this.pass(this.mUp, T.bloomUp[i]); prev = T.bloomUp[i].texture;
    }
    // DOF blur source (half res)
    const useDof = g.dof > 0.001 && game.settings.get('dof') && this.quality !== 'low';
    if (useDof) {
      this.mBlur.uniforms.tSrc.value = T.bloom[0] ? T.scene.texture : T.scene.texture;
      this.mBlur.uniforms.dir.value.set(2.2 / this.width, 0); this.pass(this.mBlur, T.blurA);
      this.mBlur.uniforms.tSrc.value = T.blurA.texture; this.mBlur.uniforms.dir.value.set(0, 2.2 / this.height); this.pass(this.mBlur, T.blurB);
      this.mBlur.uniforms.tSrc.value = T.blurB.texture; this.mBlur.uniforms.dir.value.set(4.0 / this.width, 0); this.pass(this.mBlur, T.blurA);
      this.mBlur.uniforms.tSrc.value = T.blurA.texture; this.mBlur.uniforms.dir.value.set(0, 4.0 / this.height); this.pass(this.mBlur, T.blurB);
    }
    const cu = this.mComp.uniforms;
    cu.tScene.value = T.scene.texture; cu.tBloom.value = T.bloomUp[0].texture; cu.tBlur.value = T.blurB.texture; cu.tDepth.value = T.normal.depthTexture; cu.tNormal.value = T.normal.texture;
    cu.texel.value.set(1 / this.width, 1 / this.height); cu.ink.value = g.inkLines; cu.inkWidth.value = Math.max(1, this.height / 820); cu.inkFar.value = g.inkFar;
    cu.bloom.value = g.bloom; cu.exposure.value = g.exposure; cu.saturation.value = g.saturation; cu.contrast.value = g.contrast;
    cu.lift.value.fromArray(g.lift); cu.gamma.value.fromArray(g.gamma); cu.gain.value.fromArray(g.gain); cu.tint.value.fromArray(g.tint); cu.temperature.value = g.temperature;
    cu.near.value = camera.near; cu.far.value = camera.far; cu.focus.value = g.focus; cu.focusRange.value = g.focusRange; cu.dof.value = useDof ? g.dof : 0;
    const painterly = game.settings.get('painterly') && g.paint > 0.001 && this.quality !== 'low';
    this.pass(this.mComp, painterly ? T.comp : T.paint);
    if (painterly) {
      const pu = this.mPaint.uniforms;
      pu.tSrc.value = T.comp.texture; pu.texel.value.set(1 / this.width, 1 / this.height);
      pu.radius.value = g.paintRadius * Math.max(0.75, this.pixelRatio * (this.height / 1080) * 1.2 + 0.2);
      pu.strength.value = g.paint; pu.time.value = game.time; pu.ink.value = g.ink;
      this.pass(this.mPaint, T.paint);
    }
    const fu = this.mFinal.uniforms;
    fu.tSrc.value = T.paint.texture; fu.resolution.value.set(this.width, this.height); fu.time.value = game.time;
    fu.grain.value = g.grain; fu.vignette.value = g.vignette; fu.ca.value = g.ca; fu.fade.value = g.fade; fu.fadeColor.value.fromArray(g.fadeColor);
    fu.flash.value = game.settings.get('flashes') ? g.flash : g.flash * 0.3; fu.flashColor.value.fromArray(g.flashColor);
    fu.letterbox.value = g.letterbox; fu.aspect.value = this.width / this.height; fu.scanlines.value = g.scanlines; fu.warp.value = g.warp;
    this.pass(this.mFinal, null);
  }
  // Blend grade towards a preset over time (call each frame with dt), or set instantly.
  setGrade(partial) { Object.assign(this.grade, structuredClone(partial)); }
  lerpGrade(target, k) {
    for (const [key, v] of Object.entries(target)) {
      const cur = this.grade[key];
      if (Array.isArray(v)) for (let i = 0; i < v.length; i++) cur[i] = lerp(cur[i], v[i], k);
      else if (typeof v === 'number') this.grade[key] = lerp(cur, v, k);
    }
  }
  // Tween one numeric grade key, returns a promise.
  tweenGrade(key, to, sec, easeFn = (t) => t) {
    const from = this.grade[key];
    return new Promise((res) => {
      let t = 0;
      const tick = (dt) => { t += dt; const k = clamp(t / sec); this.grade[key] = lerp(from, to, easeFn(k)); if (k >= 1) { this.tickers.delete(tick); res(); } };
      if (sec <= 0) { this.grade[key] = to; res(); return; }
      this.tickers.add(tick);
    });
  }
  tickers = new Set();
  update(dt) { for (const t of [...this.tickers]) t(dt); }
}
