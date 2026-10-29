// Load dist/tomyum2540.html headless (CDN routed to vendor/), start, report state + errors.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/build\/three\.module\.min\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.module.min.js')) }));
await page.route(/cdn\.jsdelivr\.net\/npm\/cannon-es@0\.20\.0\/dist\/cannon-es\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/cannon-es.js')) }));
await page.goto('file://' + path.join(root, 'dist/tomyum2540.html'));
await page.waitForFunction(() => window.BENGRIM && window.BENGRIM.G.state !== 'loading' || document.querySelector('#boot.ready'), null, { timeout: 180000, polling: 500 }).catch((e) => errs.push('load ' + e.message.slice(0, 80)));
await page.waitForTimeout(1500);
// the loader waits for any key or click once it's ready
await page.keyboard.press('Enter').catch((e) => errs.push('key ' + e.message));
await page.waitForFunction(() => window.BENGRIM && !['loading', 'boot'].includes(window.BENGRIM.G.state), null, { timeout: 150000, polling: 500 }).catch((e) => errs.push('start ' + e.message.slice(0, 80)));
await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({ state: window.BENGRIM && window.BENGRIM.G.state, boot: document.getElementById('boot').hidden }));
await page.screenshot({ path: process.argv[2] || '/tmp/dist.png', timeout: 120000 }).catch((e) => errs.push('shot ' + e.message.slice(0, 60)));
console.log(JSON.stringify(st), '\n' + errs.filter((e) => !/ERR_FAILED|fonts/.test(e)).slice(0, 10).join('\n'));
await browser.close();
