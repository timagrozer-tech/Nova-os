/* Генерация sw.js со списком всех файлов игры: node tools/gen-sw.js */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = {}; new Function('window', fs.readFileSync(path.join(root, 'js/manifest.js'), 'utf8'))(ctx);
const ver = /SN\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(root, 'js/core/util.js'), 'utf8'))[1];
const files = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'assets/scene.webp', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png', 'js/manifest.js'].concat(ctx.SN_FILES);
let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']+';/, `const CACHE = 's-nulya-${ver}';`).replace(/const ASSETS = \[[\s\S]*?\];/, 'const ASSETS = [\n  ' + files.map(f => `'${f}'`).join(',\n  ') + '\n];');
fs.writeFileSync(path.join(root, 'sw.js'), sw);
console.log('sw.js:', files.length, 'файлов, кэш s-nulya-' + ver);
