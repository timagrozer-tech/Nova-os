/* Service Worker: офлайн-кэш всех ресурсов игры. Работает только по HTTPS или на localhost.
   При обновлении игры поменяйте CACHE — старый кэш удалится автоматически. */
'use strict';
const CACHE = 's-nulya-0.2.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'assets/scene.webp',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'js/core/clock.js',
  'js/core/save.js',
  'js/core/state.js',
  'js/core/util.js',
  'js/data/business.js',
  'js/data/education.js',
  'js/data/events.js',
  'js/data/jobs.js',
  'js/data/npcs.js',
  'js/data/property.js',
  'js/data/quests.js',
  'js/data/services.js',
  'js/data/world.js',
  'js/main.js',
  'js/systems/business.js',
  'js/systems/economy.js',
  'js/systems/events.js',
  'js/systems/finance.js',
  'js/systems/property.js',
  'js/systems/quests.js',
  'js/systems/social.js',
  'js/systems/stats.js',
  'js/systems/work.js',
  'js/ui/components.js',
  'js/ui/scene.js',
  'js/ui/screens.js',
  'js/ui/sheets.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Cache-first: игра полностью офлайн; сеть используется только для того, чего нет в кэше */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
