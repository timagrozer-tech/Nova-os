/* Сборка однофайловой версии dist/s-nulya-offline.html — открывается прямо из файла на Android (без сервера).
   Запуск: node tools/build.js */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const img = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'assets/scene.webp')).toString('base64');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/icons/icon-192.png')).toString('base64');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<link rel="(icon|apple-touch-icon)" href="[^"]*">/g, `<link rel="$1" href="${icon}">`)
  .replace('<link rel="stylesheet" href="css/style.css">', () => '<style>\n' + css + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  let js = fs.readFileSync(path.join(root, src), 'utf8').replace(/assets\/scene\.webp/g, img);
  return '<script>/* ' + src + ' */\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/s-nulya-offline.html'), html);
console.log('dist/s-nulya-offline.html', (html.length / 1024).toFixed(0) + ' КБ');
