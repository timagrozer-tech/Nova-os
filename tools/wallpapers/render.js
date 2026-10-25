// Render NOVA wallpapers (original artwork, procedural) with headless Chromium.
// Usage: node render.js <scene.js> <out.png> [width height seed]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const [scene, out, W = '3840', H = '2160', seed = '7'] = process.argv.slice(2);
  const lib = fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8');
  const code = fs.readFileSync(scene, 'utf8');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => { console.error('[page error]', e.message); process.exitCode = 2; });
  const dataUrl = await page.evaluate(async ({ lib, code, W, H, seed }) => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    document.body.appendChild(canvas);
    const env = new Function('canvas', 'W', 'H', 'SEED', lib + '\n' + code + '\n;return typeof draw==="function"?draw():null;');
    await env(canvas, W, H, seed);
    return canvas.toDataURL('image/png');
  }, { lib, code, W: +W, H: +H, seed: +seed });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log('wrote', out);
})();
