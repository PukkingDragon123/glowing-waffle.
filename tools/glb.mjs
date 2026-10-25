// Pack one glTF into an optimised .glb: dedup, weld, simplify to a triangle
// budget, quantise. Used by tools/assets.py.
//   node tools/glb.mjs in.gltf out.glb [maxTriangles]
// Needs @gltf-transform/{core,extensions,functions} and meshoptimizer
// (set GLTF_DEPS to a node_modules folder if they are not installed here).
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(process.env.GLTF_DEPS ? path.join(process.env.GLTF_DEPS, 'x.js') : import.meta.url);
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, weld, simplify, quantize, getBounds } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');

const [src, dst, maxTris = '20000'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const tris = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
await doc.transform(dedup(), weld());
const before = tris();
if (before > +maxTris) {
  await MeshoptSimplifier.ready;
  // loosen the error bound until the budget is met (or it stops helping)
  for (const error of [0.004, 0.015, 0.04]) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, +maxTris / tris()), error, lockBorder: false }));
    if (tris() <= +maxTris * 1.15) break;
  }
}
// matte everything: the game has no specular, so drop roughness/metal maps
for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(1); }
await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
const b = getBounds(scene);
await io.write(dst, doc);
console.log(path.basename(dst), Math.round(before), '->', Math.round(tris()), 'tris', 'size', b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join('x'));
