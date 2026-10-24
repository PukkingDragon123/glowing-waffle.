// Headless screenshot harness.
//   node tools/shot.mjs <out.png> [query] [waitMs] [script.js]
// Serves the repo on a local port, opens index.html?<query>, waits, runs an
// optional script in the page (window.BENGRIM is the debug API) and saves a
// screenshot. Console errors are printed.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const [out = 'shot.png', query = '', waitMs = '4000', scriptPath = ''] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else if (process.env.LOG) console.log('[log]', m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const t0 = Date.now();
await page.goto(`http://localhost:${port}/index.html?${query}`);
await page.waitForTimeout(parseInt(waitMs, 10));
if (scriptPath) {
  const code = fs.readFileSync(scriptPath, 'utf8');
  try {
    const r = await page.evaluate(`(async () => { ${code} })()`);
    if (r !== undefined) console.log('script result:', typeof r === 'string' ? r : JSON.stringify(r, null, 1));
  } catch (e) { errors.push('[script] ' + e.message); }
}
await page.screenshot({ path: out });
console.log(`shot -> ${out} (${Date.now() - t0}ms)`);
if (errors.length) console.log(errors.slice(0, 40).join('\n'));
await browser.close();
server.close();
