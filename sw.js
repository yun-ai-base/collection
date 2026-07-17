// collection PWA service worker
const CACHE = 'collection-v1';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './data.json',
  './search-index.json',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  // 应用外壳：cache-first，后台更新
  if (url.pathname.endsWith('index.html') || url.pathname.endsWith('app.js') ||
      url.pathname.endsWith('style.css') || url.pathname.endsWith('data.json') ||
      url.pathname.endsWith('search-index.json') || url.pathname.endsWith('manifest.json') ||
      url.pathname.endsWith('icon.svg') || url.pathname === '/' || url.pathname.endsWith('/')) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        var network = fetch(e.request).then(function (resp) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          return resp;
        });
        return cached || network;
      })
    );
    return;
  }

  // 文章正文：network-first，失败回退缓存（离线可读）
  if (url.pathname.indexOf('/articles/') !== -1) {
    e.respondWith(
      fetch(e.request).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return resp;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  // 其余：优先网络，失败回退缓存
  e.respondWith(fetch(e.request).catch(function () { return caches.match(e.request); }));
});
