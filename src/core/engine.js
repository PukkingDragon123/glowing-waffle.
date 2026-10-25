// Renderer + post-processing pipeline.
//  scene (HDR, low-res) -> bloom (1/4 res) -> composite (tonemap, grade, dither,
//  ghosting; low-res LDR) -> final (VHS jitter, chroma bleed, scanlines, grain,
//  vignette, fades; screen res)
import * as THREE from 'three';
import { G } from './globals.js';

const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = /* glsl */`
uniform sampler2D tScene; uniform vec2 texel; uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv + texel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tScene, vUv + texel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - threshold) / max(l, 1e-4), 0.0, 1.0);
  gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
}`;

const BLUR_FS = /* glsl */`
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

const COMPOSITE_FS = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tBloom2; uniform sampler2D tPrev; uniform sampler2D tDepth;
uniform float bloomStrength; uniform float exposure; uniform float saturation; uniform float contrast;
uniform float ghost; uniform float brightness; uniform vec3 tint; uniform vec3 lift; uniform float time;
uniform vec2 res; uniform float dither; uniform float flesh; uniform float ink; uniform float paint; uniform vec2 nearFar;
varying vec2 vUv;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y); }
// inverse linear depth: affine in screen space on any plane, so its second
// difference is zero on flat surfaces and spikes at silhouettes and creases
float invZ(vec2 uv) { float d = texture2D(tDepth, uv).r; return (nearFar.y - d * (nearFar.y - nearFar.x)) / (nearFar.x * nearFar.y); }
// generalised Kuwahara: four overlapping quadrants, each weighted by how flat
// it is, so detail collapses into soft brush patches but edges stay put
vec3 painted(vec2 uv, vec2 px) {
  vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
  vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec3 c = texture2D(tScene, uv + vec2(float(i), float(j)) * px).rgb;
    c = c / (1.0 + c); vec3 cc = c * c;
    if (i <= 0 && j <= 0) { m0 += c; s0 += cc; }
    if (i >= 0 && j <= 0) { m1 += c; s1 += cc; }
    if (i <= 0 && j >= 0) { m2 += c; s2 += cc; }
    if (i >= 0 && j >= 0) { m3 += c; s3 += cc; }
  }
  m0 /= 9.0; m1 /= 9.0; m2 /= 9.0; m3 /= 9.0;
  vec3 v0 = abs(s0 / 9.0 - m0 * m0), v1 = abs(s1 / 9.0 - m1 * m1), v2 = abs(s2 / 9.0 - m2 * m2), v3 = abs(s3 / 9.0 - m3 * m3);
  float w0 = 1.0 / pow(1.0 + 600.0 * (v0.r + v0.g + v0.b), 4.0), w1 = 1.0 / pow(1.0 + 600.0 * (v1.r + v1.g + v1.b), 4.0);
  float w2 = 1.0 / pow(1.0 + 600.0 * (v2.r + v2.g + v2.b), 4.0), w3 = 1.0 / pow(1.0 + 600.0 * (v3.r + v3.g + v3.b), 4.0);
  vec3 r = (m0 * w0 + m1 * w1 + m2 * w2 + m3 * w3) / (w0 + w1 + w2 + w3);
  return r / max(vec3(1e-3), 1.0 - r);
}
float lum(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
// ink: depth creases and silhouettes, plus strong colour edges, with a slight
// hand-drawn wobble and lines that thin out with distance
float inkLine(vec2 uv, vec2 px) {
  // wobble whole pixels only: depth is point-sampled, and off-centre taps
  // would make flat tilted surfaces (ceilings, floors) read as creases
  vec2 wob = (vec2(vnoise(uv * res / 19.0), vnoise(uv * res / 19.0 + 31.0)) - 0.5) * 1.6;
  uv = (floor(uv * res + wob) + 0.5) * px;
  float wc = invZ(uv);
  float wn = max(wc, max(max(invZ(uv + vec2(px.x, 0.0)), invZ(uv - vec2(px.x, 0.0))), max(invZ(uv + vec2(0.0, px.y)), invZ(uv - vec2(0.0, px.y)))));
  float zNear = 1.0 / wn;
  // close things get a two-pixel line
  vec2 o = px * (zNear < 2.2 ? 2.0 : 1.0);
  float wl = invZ(uv - vec2(o.x, 0.0)), wr = invZ(uv + vec2(o.x, 0.0));
  float wd = invZ(uv - vec2(0.0, o.y)), wu = invZ(uv + vec2(0.0, o.y));
  float a1 = invZ(uv + o), a2 = invZ(uv - o), a3 = invZ(uv + vec2(o.x, -o.y)), a4 = invZ(uv + vec2(-o.x, o.y));
  float lap = abs(wl + wr - 2.0 * wc) + abs(wd + wu - 2.0 * wc) + 0.5 * (abs(a1 + a2 - 2.0 * wc) + abs(a3 + a4 - 2.0 * wc));
  float e = smoothstep(0.006, 0.03, lap / wn);
  // colour edges (Sobel on compressed luminance), lighter than the geometry lines
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
  c += (texture2D(tBloom, vUv).rgb * 0.6 + texture2D(tBloom2, vUv).rgb * 0.8) * bloomStrength;
  if (ink > 0.01) c = mix(c, vec3(0.012, 0.01, 0.009), inkLine(vUv, px) * min(1.0, ink * 1.15));
  c *= exposure;
  c = aces(c);
  c = toSRGB(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  c = c * tint + lift + brightness;
  // fleshy red pulse (late days)
  c = mix(c, c * vec3(1.15, 0.75, 0.7), flesh * (0.6 + 0.4 * sin(time * 2.1)));
  vec3 p = texture2D(tPrev, vUv).rgb;
  c = mix(c, max(c, p * 0.97), ghost);
  // break up banding in the dark gradients
  c += (hash(gl_FragCoord.xy + fract(time) * 61.0) - 0.5) * dither / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const FINAL_FS = /* glsl */`
uniform sampler2D tLDR; uniform vec2 lowRes; uniform vec2 outRes; uniform float time;
uniform float vhs; uniform float grain; uniform float chroma; uniform float scan; uniform float vignette;
uniform float wave; uniform float doubleV; uniform float white; uniform float black; uniform float red;
uniform float glitch; uniform float tracking; uniform float curvature; uniform float noiseBurst;
uniform float blur; uniform float tunnel; uniform vec3 whiteColor; uniform float shake;
uniform vec4 faceSpot;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }
vec3 rgb2yiq(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 yiq2rgb(vec3 c) { return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
vec3 samp(vec2 uv) { return texture2D(tLDR, uv).rgb; }
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 + curvature * dot(cc, cc));
  uv += vec2(n1(time * 13.0) - 0.5, n1(time * 11.0 + 7.0) - 0.5) * shake * 0.02;
  uv.x += sin(uv.y * 10.0 + time * 1.7) * wave * 0.007;
  uv.y += sin(uv.x * 7.0 + time * 1.1) * wave * 0.005;
  float line = floor(uv.y * lowRes.y);
  float jit = (n1(line * 0.37 + time * 23.0) - 0.5) * 0.0012 * vhs;
  float bandPos = 1.0 - fract(time * 0.045);
  float band = smoothstep(0.06, 0.0, abs(uv.y - bandPos)) * tracking;
  jit += band * (hash(vec2(line, floor(time * 30.0))) - 0.5) * 0.025;
  float hs = smoothstep(0.03, 0.0, uv.y) * vhs * 0.6;
  jit += hs * (hash(vec2(line, floor(time * 60.0))) - 0.3) * 0.04;
  if (glitch > 0.0) {
    float gl = step(1.0 - glitch * 0.25, hash(vec2(floor(uv.y * 18.0), floor(time * 12.0))));
    jit += gl * (hash(vec2(floor(time * 12.0), floor(uv.y * 18.0))) - 0.5) * 0.15 * glitch;
  }
  uv.x += jit;
  vec2 px = 1.0 / lowRes;
  vec3 col = samp(uv);
  if (blur > 0.0) {
    col = (col * 2.0 + samp(uv + vec2(px.x, 0.0) * blur * 2.0) + samp(uv - vec2(px.x, 0.0) * blur * 2.0) + samp(uv + vec2(0.0, px.y) * blur * 2.0) + samp(uv - vec2(0.0, px.y) * blur * 2.0)) / 6.0;
  }
  // a face you cannot see: the picture smears and wraps around itself there
  if (faceSpot.w > 0.001) {
    float asp = outRes.x / outRes.y;
    vec2 d = (uv - faceSpot.xy) * vec2(asp, 1.0);
    float r = length(d), R = faceSpot.z;
    float edgeN = (hash(vec2(floor(time * 18.0), floor(uv.y * lowRes.y * 0.5))) - 0.5) * R * 0.25;
    float m = smoothstep(R, R * 0.4, r + edgeN) * faceSpot.w;
    if (m > 0.002) {
      float ang = m * 3.2 + sin(time * 2.3) * 0.5 * m;
      float ca = cos(ang), sa = sin(ang);
      vec2 dd = mat2(ca, -sa, sa, ca) * d * (1.0 - 0.35 * m);
      vec2 suv = faceSpot.xy + dd / vec2(asp, 1.0);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 14; i++) {
        float fi = float(i);
        vec2 o = vec2(cos(fi * 2.39996 + time * 0.7), sin(fi * 2.39996 + time * 0.7)) * R * 0.42 * sqrt((fi + 0.5) / 14.0);
        acc += samp(suv + o / vec2(asp, 1.0));
      }
      acc /= 14.0;
      // horizontal tape smear pulled out of the blob
      vec3 sm = (samp(suv + vec2(px.x * 6.0, 0.0)) + samp(suv + vec2(px.x * 12.0, 0.0)) + samp(suv - vec2(px.x * 9.0, 0.0))) / 3.0;
      acc = mix(acc, sm, 0.3);
      float lum = dot(acc, vec3(0.299, 0.587, 0.114));
      acc = mix(acc, vec3(lum) * vec3(0.96, 0.93, 0.9), 0.4);
      vec2 blk = floor(uv * lowRes / 2.0);
      acc += (hash(blk + floor(time * 17.0)) - 0.5) * 0.07 * m;
      col = mix(col, acc, m);
    }
  }
  vec3 yiq = rgb2yiq(col);
  vec2 iq = vec2(0.0);
  for (int i = -2; i <= 2; i++) iq += rgb2yiq(samp(uv + vec2((float(i) * 1.4 - 1.2) * px.x * chroma, 0.0))).yz;
  iq /= 5.0;
  yiq.yz = mix(yiq.yz, iq * 1.08, clamp(chroma, 0.0, 1.0));
  col = yiq2rgb(yiq);
  // slight luma ringing on the right of edges (vhs sharpening)
  float lR = rgb2yiq(samp(uv - vec2(px.x * 1.5, 0.0))).x;
  col += (yiq.x - lR) * 0.12 * vhs;
  if (doubleV > 0.0) {
    vec3 d = samp(uv + vec2(doubleV * 0.025 * sin(time * 0.7), doubleV * 0.008 * cos(time * 0.5)));
    col = mix(col, d, 0.45 * clamp(doubleV, 0.0, 1.0));
  }
  float sl = sin((uv.y * lowRes.y) * 3.14159265 * 2.0) * 0.5 + 0.5;
  col *= 1.0 - scan * 0.16 * (1.0 - sl);
  float g = hash(vUv * outRes + fract(time * 7.13) * 91.7) - 0.5;
  float lum = dot(col, vec3(0.33));
  col += g * grain * (0.10 - lum * 0.05);
  col += (hash(vec2(line, floor(time * 24.0))) - 0.5) * 0.02 * vhs;
  col = mix(col, vec3(hash(floor(uv * lowRes * 0.5) + floor(time * 40.0) * 1.3)), noiseBurst);
  float r = length(cc * vec2(1.0, 0.8));
  float v = smoothstep(0.95, 0.25, r);
  col *= mix(1.0, v, vignette);
  col *= 1.0 - tunnel * smoothstep(0.15, 0.55, r);
  col = mix(col, vec3(0.45, 0.0, 0.0), red * smoothstep(0.2, 0.75, r));
  col = mix(col, whiteColor, white);
  col = mix(col, vec3(0.0), black);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: opts.type ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: opts.filter ?? THREE.LinearFilter,
    magFilter: opts.filter ?? THREE.LinearFilter,
    depthBuffer: opts.depth ?? false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') });
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.info.autoReset = true;
    r.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.03, 900);
    this.camera.layers.enable(0);
    this.camera.layers.enable(1); // first-person only
    this.lowH = 720;
    this.forcedLowH = 0; // e.g. computer focus raises resolution
    this.background = null; // object with render(renderer, camera): the outside

    this.fx = {
      bloom: 0.55, threshold: 0.9, exposure: 1.0, saturation: 0.86, contrast: 1.06,
      brightness: 0.0, tint: new THREE.Vector3(1.0, 0.98, 0.95), lift: new THREE.Vector3(0.012, 0.012, 0.02),
      ghost: 0, flesh: 0, dither: 0.9,
      vhs: 0.7, grain: 0.6, chroma: 0.8, scan: 0.6, vignette: 0.45, wave: 0, doubleV: 0,
      white: 0, black: 0, red: 0, glitch: 0, tracking: 0.25, curvature: 0.015, noiseBurst: 0,
      blur: 0, tunnel: 0, whiteColor: new THREE.Vector3(1, 1, 1), shake: 0, faceSpot: new THREE.Vector4(0, 0, 0, 0),
    };

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT_FS, { tScene: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } });
    this.mBlur = mk(BLUR_FS, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mComp = mk(COMPOSITE_FS, {
      tScene: { value: null }, tBloom: { value: null }, tBloom2: { value: null }, tPrev: { value: null },
      bloomStrength: { value: 1 }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 },
      ghost: { value: 0 }, brightness: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() },
      time: { value: 0 }, res: { value: new THREE.Vector2() }, dither: { value: 1 }, flesh: { value: 0 }, ink: { value: 0.7 }, paint: { value: 0.6 },
      tDepth: { value: null }, nearFar: { value: new THREE.Vector2(0.03, 900) },
    });
    const fu = {
      tLDR: { value: null }, lowRes: { value: new THREE.Vector2() }, outRes: { value: new THREE.Vector2() }, time: { value: 0 },
      whiteColor: { value: new THREE.Vector3(1, 1, 1) }, faceSpot: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    for (const k of ['vhs', 'grain', 'chroma', 'scan', 'vignette', 'wave', 'doubleV', 'white', 'black', 'red', 'glitch', 'tracking', 'curvature', 'noiseBurst', 'blur', 'tunnel', 'shake']) fu[k] = { value: 0 };
    this.mFinal = mk(FINAL_FS, fu);

    this.rtScene = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setLowHeight(h) { this.lowH = h; this.resize(); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(2, Math.floor(window.innerWidth * dpr));
    const H = Math.max(2, Math.floor(window.innerHeight * dpr));
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.outW = W; this.outH = H;
    const aspect = W / H;
    const lh = Math.min(H, this.forcedLowH || this.lowH);
    const lw = Math.max(2, Math.round(lh * aspect));
    if (this.rtScene && this.rtScene.width === lw && this.rtScene.height === lh) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); return; }
    this.lowW = lw; this.lowHc = lh;
    if (this.rtScene && this.rtScene.depthTexture) this.rtScene.depthTexture.dispose();
    for (const rt of [this.rtScene, this.rtB1, this.rtB2, this.rtB3, this.rtB4, this.rtL0, this.rtL1]) rt && rt.dispose();
    this.rtScene = makeRT(lw, lh, { depth: true, filter: THREE.NearestFilter });
    // the ink pass reads scene depth
    this.rtScene.depthTexture = new THREE.DepthTexture(lw, lh, THREE.UnsignedIntType);
    this.rtScene.samples = 0;
    const bw = Math.max(2, lw >> 2), bh = Math.max(2, lh >> 2);
    this.rtB1 = makeRT(bw, bh); this.rtB2 = makeRT(bw, bh);
    this.rtB3 = makeRT(Math.max(2, bw >> 1), Math.max(2, bh >> 1)); this.rtB4 = makeRT(Math.max(2, bw >> 1), Math.max(2, bh >> 1));
    this.rtL0 = makeRT(lw, lh, { type: THREE.UnsignedByteType });
    this.rtL1 = makeRT(lw, lh, { type: THREE.UnsignedByteType });
    this.pp = 0;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    G.uniforms.uSnapRes.value.set(lw * 0.5, lh * 0.5);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene = this.scene, camera = this.camera, time = 0) {
    const r = this.renderer;
    const fx = this.fx;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    if (this.background) { this.background.render(r, camera); r.clearDepth(); }
    r.render(scene, camera);

    // bloom
    this.mBright.uniforms.tScene.value = this.rtScene.texture;
    this.mBright.uniforms.texel.value.set(1 / this.lowW, 1 / this.lowHc);
    this.mBright.uniforms.threshold.value = fx.threshold;
    this.pass(this.mBright, this.rtB1);
    const bu = this.mBlur.uniforms;
    bu.tSrc.value = this.rtB1.texture; bu.dir.value.set(1 / this.rtB1.width, 0); this.pass(this.mBlur, this.rtB2);
    bu.tSrc.value = this.rtB2.texture; bu.dir.value.set(0, 1 / this.rtB1.height); this.pass(this.mBlur, this.rtB1);
    bu.tSrc.value = this.rtB1.texture; bu.dir.value.set(1 / this.rtB3.width, 0); this.pass(this.mBlur, this.rtB3);
    bu.tSrc.value = this.rtB3.texture; bu.dir.value.set(0, 1 / this.rtB3.height); this.pass(this.mBlur, this.rtB4);

    // composite
    const cu = this.mComp.uniforms;
    const out = this.pp ? this.rtL1 : this.rtL0;
    const prev = this.pp ? this.rtL0 : this.rtL1;
    cu.tScene.value = this.rtScene.texture; cu.tBloom.value = this.rtB1.texture; cu.tBloom2.value = this.rtB4.texture; cu.tPrev.value = prev.texture;
    cu.ink.value = fx.ink ?? 0.7; cu.paint.value = fx.paint ?? 0.6;
    cu.tDepth.value = this.rtScene.depthTexture; cu.nearFar.value.set(camera.near, camera.far);
    cu.bloomStrength.value = fx.bloom; cu.exposure.value = fx.exposure; cu.saturation.value = fx.saturation;
    cu.contrast.value = fx.contrast; cu.ghost.value = fx.ghost; cu.brightness.value = fx.brightness;
    cu.tint.value.copy(fx.tint); cu.lift.value.copy(fx.lift); cu.time.value = time; cu.res.value.set(this.lowW, this.lowHc);
    cu.dither.value = fx.dither; cu.flesh.value = fx.flesh;
    this.pass(this.mComp, out);
    this.pp ^= 1;

    // final to screen
    const f = this.mFinal.uniforms;
    f.tLDR.value = out.texture; f.lowRes.value.set(this.lowW, this.lowHc); f.outRes.value.set(this.outW, this.outH); f.time.value = time;
    for (const k of ['vhs', 'grain', 'chroma', 'scan', 'vignette', 'wave', 'doubleV', 'white', 'black', 'red', 'glitch', 'tracking', 'curvature', 'noiseBurst', 'blur', 'tunnel', 'shake']) f[k].value = fx[k];
    f.whiteColor.value.copy(fx.whiteColor);
    f.faceSpot.value.copy(fx.faceSpot);
    this.pass(this.mFinal, null);
  }

  // Render a scene from an arbitrary camera into a texture (used for the
  // creepy "photo" email attachments and the webcam page).
  snapshot(scene, camera, w, h, rt) {
    const target = rt || new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const r = this.renderer;
    const prevTM = r.toneMapping;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.setRenderTarget(target);
    r.clear();
    if (this.background && scene === this.scene) { this.background.render(r, camera); r.clearDepth(); }
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.toneMapping = prevTM;
    return target;
  }
}

// ---------------------------------------------------------------------------
// Material patching: PS1-style vertex snapping + reality warp + breathing walls
// ---------------------------------------------------------------------------
// Chainable shader patches. Each patch has a key (for program caching) and a
// function that edits the shader source before compilation.
export function addPatch(mat, key, fn) {
  const ud = mat.userData;
  if (!ud.patches) {
    ud.patches = [];
    mat.onBeforeCompile = (shader, renderer) => { for (const p of ud.patches) p.fn(shader, renderer); };
    mat.customProgramCacheKey = () => ud.patches.map((p) => p.key).join('|');
  }
  if (ud.patches.some((p) => p.key === key)) return mat;
  ud.patches.push({ key, fn });
  mat.needsUpdate = true;
  return mat;
}

export function patchWorld(mat, { snap = true, warp = true, breath = true } = {}) {
  const isStd = mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial;
  const useBreath = breath && isStd;
  const key = 'world' + (snap ? 's' : '') + (warp ? 'w' : '') + (useBreath ? 'b' : '');
  return addPatch(mat, key, (shader) => {
    shader.uniforms.uTime = G.uniforms.uTime;
    shader.uniforms.uWarp = G.uniforms.uWarp;
    shader.uniforms.uBend = G.uniforms.uBend;
    shader.uniforms.uBreath = G.uniforms.uBreath;
    shader.uniforms.uSnapRes = G.uniforms.uSnapRes;
    shader.uniforms.uSnapOn = G.uniforms.uSnapOn;
    let defs = '';
    if (snap) defs += '#define WORLD_SNAP\n';
    if (warp) defs += '#define WORLD_WARP\n';
    if (useBreath) defs += '#define WORLD_BREATH\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${defs}uniform float uTime; uniform float uWarp; uniform vec4 uBend; uniform float uBreath; uniform vec2 uSnapRes; uniform float uSnapOn;`)
      .replace('#include <project_vertex>', PROJECT_PATCH);
  });
}

const PROJECT_PATCH = /* glsl */`
  vec4 wpos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpos = instanceMatrix * wpos;
  #endif
  #ifdef USE_BATCHING
    wpos = batchingMatrix * wpos;
  #endif
  wpos = modelMatrix * wpos;
  #ifdef WORLD_BREATH
    if (uBreath > 0.001) {
      vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
      float br = sin(uTime * 1.1 + wpos.x * 1.9 + wpos.z * 1.4 + wpos.y * 2.3) * 0.5 + 0.5;
      br += 0.5 * sin(uTime * 2.3 + wpos.y * 4.0 - wpos.x * 3.0);
      wpos.xyz += wn * br * uBreath * 0.045;
    }
  #endif
  #ifdef WORLD_WARP
    if (uWarp > 0.001) {
      vec3 rel = wpos.xyz - cameraPosition;
      float d = length(rel.xz);
      float ang = uWarp * 0.02 * sin(uTime * 0.37 + d * 0.45) * d;
      float ca = cos(ang), sa = sin(ang);
      rel.xz = mat2(ca, -sa, sa, ca) * rel.xz;
      rel.y += uWarp * 0.035 * sin(d * 0.8 - uTime * 0.5) * d;
      rel.xz *= 1.0 + uWarp * 0.04 * sin(uTime * 0.23 + wpos.y);
      wpos.xyz = cameraPosition + rel;
    }
    // liminal bending: space ahead stretches away, the floor curves, the corridor rolls
    if (abs(uBend.x) + abs(uBend.y) + abs(uBend.z) > 0.001) {
      vec3 rel = wpos.xyz - cameraPosition;
      float d = length(rel.xz);
      float k = smoothstep(0.7, 7.0, d);
      rel.xz *= 1.0 + uBend.x * k;
      rel.y += uBend.y * k * d * 0.12;
      vec2 dir = rel.xz / max(d, 1e-3);
      vec2 perp = vec2(-dir.y, dir.x);
      float lat = dot(rel.xz, perp);
      float a = uBend.z * k * d * 0.04;
      float ca = cos(a), sa = sin(a);
      float y2 = rel.y * ca - lat * sa, l2 = rel.y * sa + lat * ca;
      rel.xz += perp * (l2 - lat); rel.y = y2;
      wpos.xyz = cameraPosition + rel;
    }
  #endif
  vec4 mvPosition = viewMatrix * wpos;
  gl_Position = projectionMatrix * mvPosition;
  #ifdef WORLD_SNAP
    if (uSnapOn > 0.5 && gl_Position.w > 0.05) {
      vec2 ndc = gl_Position.xy / gl_Position.w;
      ndc = floor(ndc * uSnapRes + 0.5) / uSnapRes;
      gl_Position.xy = ndc * gl_Position.w;
    }
  #endif
`;
