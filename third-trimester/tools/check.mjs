// Syntax/import check: bundles src/ entry points with esbuild without writing output.
import { createRequire } from 'module';
const esbuild = createRequire(import.meta.url)('esbuild');
const entries = process.argv.slice(2);
const r = await esbuild.build({ entryPoints: entries, bundle: true, write: false, format: 'esm', logLevel: 'silent', outdir: 'out',
  external: [], alias: { three: './vendor/three.module.min.js', 'cannon-es': './vendor/cannon-es.js' },
  plugins: [{ name: 'addons', setup(b) { b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: new URL('../vendor/addons/' + a.path.slice(13), import.meta.url).pathname })); } }],
}).catch((e) => e);
for (const m of [...(r.errors || []), ...(r.warnings || [])]) console.log(`${m.location?.file}:${m.location?.line}: ${m.text}`);
console.log((r.errors || []).length ? 'FAIL' : 'OK');
