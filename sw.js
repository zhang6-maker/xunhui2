// 寻慧遥控器 Service Worker —— 仅做轻量缓存，方便“添加到主屏幕”后离线打开外壳
const CACHE = 'xunhui-remote-v1';
const ASSETS = ['/mobile', '/', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // 实时接口（/ip 等）和 WebSocket 不走缓存；其余缓存优先、回源兜底
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname === '/ip') return; // 每次都拿最新令牌
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy).catch(() => {}));
        return resp;
      }).catch(() => cached)
    )
  );
});
