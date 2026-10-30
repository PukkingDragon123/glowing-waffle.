// Headless screenshot helper: node tools/shot.mjs <url-path> <out.png> [waitMs] [w] [h]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [, , path, out, wait = '4000', w = '1280', h = '720'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.stack || e}`); page.evaluate((s) => { window.error = s; }, String(e)).catch(() => {}); });
await page.goto(`http://127.0.0.1:8765/${path}`, { waitUntil: 'load' });
const t0 = Date.now();
try { await page.waitForFunction(() => window.ready || window.error, null, { timeout: 120000 }); } catch (e) { logs.push('wait timeout'); }
await page.waitForTimeout(+wait);
const err = await page.evaluate(() => window.error);
await page.screenshot({ path: out });
console.log(logs.slice(-40).join('\n'));
if (err) console.log('ERROR:', err);
console.log('elapsed', Date.now() - t0);
await browser.close();
