// Dev tool: run a script in the page and save every data URL left in window.__views.
//   node tools/views.mjs <repoRoot> <outPrefix> <script.js> [query] [waitMs]
// variant of shot.mjs that saves window.__views data urls
import { createRequire } from 'node:module';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = process.argv[2], outPrefix = process.argv[3], script = fs.readFileSync(process.argv[4], 'utf8'), query = process.argv[5] || '', wait = +(process.argv[6] || 8000);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); else if (process.env.LOG) console.log('[log]', m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/index.html?${query}`);
await page.waitForTimeout(wait);
let r;
try { r = await page.evaluate(`(async () => { ${script} })()`); } catch (e) { errs.push('SCRIPT ' + e.message); }
console.log('result:', typeof r === 'object' ? JSON.stringify(r) : r);
const views = await page.evaluate('window.__views || []');
views.forEach((d, i) => fs.writeFileSync(`${outPrefix}${i}.jpg`, Buffer.from(d.split(',')[1], 'base64')));
console.log('saved', views.length);
if (errs.length) console.log(errs.filter((e) => !e.includes('ERR_FAILED')).slice(0, 30).join('\n'));
await browser.close(); server.close();
