/* オフラインでも開けるように、アプリ本体をスマホに保存する。
   記録そのものは扱わない（記録は localStorage / IndexedDB にあって、ここは通らない） */
const CACHE = 'harahachibu-v1';
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'fonts/zen-maru-gothic.css',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/state.js', 'js/store.js', 'js/calc.js', 'js/foods.js', 'js/add.js', 'js/today.js', 'js/history.js',
  'js/suggest.js', 'js/suggestview.js', 'js/settings.js', 'js/charts.js', 'js/backup.js', 'js/ai.js', 'js/ai-worker.js',
  'data/foods.json', 'data/dishes.js', 'data/recipes.js', 'data/exercises.js', 'data/photo-labels.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('harahachibu-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;     // AIのダウンロードなど外へのアクセスは触らない
  if (url.pathname.endsWith('.wasm')) return;                              // 大きいwasmは写真判定の側で保存する
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && (url.pathname.includes('/fonts/') || url.pathname.includes('/vendor/'))) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  })));
});
