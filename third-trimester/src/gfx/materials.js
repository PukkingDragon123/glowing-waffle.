// Shared materials. Character meshes carry per-vertex colour + 'surf' (roughness, metalness, sss)
// from the SDF sculptor; the material reads those and adds wrap-lit subsurface + a soft rim light.
import * as THREE from 'three';

export const sharedUniforms = {
  uRimColor: { value: new THREE.Color(0.55, 0.65, 0.9) },
  uRim: { value: 0.35 },
  uTime: { value: 0 },
};

export function charMaterial({ sssColor = 0xd8584a, rim = 1, envIntensity = 0.6, emissive = 0x000000, transparent = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: envIntensity, emissive, transparent });
  m.userData.sss = new THREE.Color(sssColor);
  m.userData.rimScale = rim;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = sharedUniforms.uRimColor; sh.uniforms.uRim = sharedUniforms.uRim;
    sh.uniforms.uSSS = { value: m.userData.sss }; sh.uniforms.uRimScale = { value: rim };
    sh.uniforms.uGlow = m.userData.glow ??= { value: 0 };
    sh.uniforms.uGlowColor = m.userData.glowColor ??= { value: new THREE.Color(0.4, 1, 0.6) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;\nuniform vec3 uRimColor; uniform float uRim; uniform vec3 uSSS; uniform float uRimScale; uniform float uGlow; uniform vec3 uGlowColor;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize(vViewPosition);
          float ndv = saturate(dot(normal, vdir));
          float rim = pow(1.0 - ndv, 3.0);
          totalEmissiveRadiance += uRimColor * rim * uRim * uRimScale * (0.4 + 0.6 * diffuseColor.rgb);
          // cheap subsurface: warm the terminator and thin edges
          totalEmissiveRadiance += uSSS * diffuseColor.rgb * vSurf.z * (0.05 + 0.18 * rim);
          totalEmissiveRadiance += uGlowColor * uGlow * (0.3 + rim);
        }`);
  };
  return m;
}

// Plain painted material for props / environment (no special attributes).
export function paintMat(color, { rough = 0.75, metal = 0, map = null, normalMap = null, normalScale = 0.6, env = 0.5, emissive = 0x000000, emissiveIntensity = 1, side = THREE.FrontSide, transparent = false, opacity = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map, normalMap, envMapIntensity: env, emissive, emissiveIntensity, side, transparent, opacity });
  if (normalMap) m.normalScale = new THREE.Vector2(normalScale, normalScale);
  return m;
}
