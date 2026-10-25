// Painted lighting for every MeshStandard/Physical material in one place:
// light falls off in a few soft bands, and nothing is shiny. No specular
// highlights, no reflections, and metal reads as its painted colour.
import * as THREE from 'three';

const BAND = /* glsl */`
float toonBand( float x ) {
	// wrapped so the terminator is soft, then three painted steps
	float w = clamp( x * 0.75 + 0.25, 0.0, 1.0 );
	return 0.2 * smoothstep( 0.0, 0.16, w ) + 0.42 * smoothstep( 0.28, 0.46, w ) + 0.38 * smoothstep( 0.62, 0.8, w );
}
`;
const NO_SPEC = /* glsl */`
void RE_IndirectSpecular_None( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {}
`;

function swap(chunk, from, to) {
  const s = THREE.ShaderChunk[chunk];
  if (!s.includes(from)) { console.warn('toon: chunk changed', chunk, from.slice(0, 40)); return; }
  THREE.ShaderChunk[chunk] = s.replace(from, to);
}

let installed = false;
export function installToon() {
  if (installed) return;
  installed = true;
  swap('lights_physical_pars_fragment', 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float dotNL = toonBand( dot( geometryNormal, directLight.direction ) );');
  swap('lights_physical_pars_fragment', 'reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );', '');
  swap('lights_physical_pars_fragment', '#define RE_IndirectSpecular\t\tRE_IndirectSpecular_Physical', '#define RE_IndirectSpecular\t\tRE_IndirectSpecular_None');
  THREE.ShaderChunk.lights_physical_pars_fragment = BAND + THREE.ShaderChunk.lights_physical_pars_fragment + NO_SPEC;
  swap('lights_physical_fragment', 'material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );', 'material.diffuseColor = diffuseColor.rgb;');
  // band the light on (mostly) the smooth surface normal: normal-map bumps at
  // grazing angles would otherwise flip between bands and draw hard islands
  swap('lights_fragment_begin', 'vec3 geometryNormal = normal;', 'vec3 geometryNormal = normalize( mix( nonPerturbedNormal, normal, 0.2 ) );');
}
installToon();
