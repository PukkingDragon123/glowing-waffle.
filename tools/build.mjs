// Bundle the game into one HTML file.
//   node tools/build.mjs            -> dist/bengrim.html (standalone) + dist/bengrim.artifact.html
// three.js and cannon-es load from jsDelivr (pinned); everything else is inlined.
// Needs esbuild:  npm i --no-save esbuild   (or set ESBUILD=/path/to/node_modules/esbuild)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let esbuild;
for (const p of [process.env.ESBUILD, 'esbuild'].filter(Boolean)) { try { esbuild = require(p); break; } catch (e) { /* next */ } }
if (!esbuild) { console.error('esbuild not found: npm i --no-save esbuild'); process.exit(1); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
const CANNON_URL = 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

const res = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2020', legalComments: 'none',
  plugins: [{
    name: 'cdn',
    setup(b) {
      b.onResolve({ filter: /^three$/ }, () => ({ path: THREE_URL, external: true }));
      b.onResolve({ filter: /^cannon-es$/ }, () => ({ path: CANNON_URL, external: true }));
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(root, 'vendor/addons', a.path.slice('three/addons/'.length)) }));
    },
  }],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&family=Noto+Sans:wght@700;900&display=swap">';
const inner = `<title>bengrim</title>
${fonts}
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/bengrim.artifact.html'), inner);
fs.writeFileSync(path.join(root, 'dist/bengrim.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${inner.replace('</style>', '</style>\n</head>\n<body>')}</body>\n</html>\n`);
console.log('dist/bengrim.html', (fs.statSync(path.join(root, 'dist/bengrim.html')).size / 1024).toFixed(0) + ' KB');
