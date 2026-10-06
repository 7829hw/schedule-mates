// 앱 파일을 모두 캐시해 인터넷 없이 동작하게 한다.
// 파일을 수정하면 VERSION을 올려야 사용자 기기에 새 버전이 반영된다.
const VERSION = 'v7';
const CACHE = `schedule-mates-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/parser.js',
  './js/store.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './favicon.ico',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 캐시 우선, 없으면 네트워크 (페이지 이동은 index.html로 대체)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // 아이콘·매니페스트는 서비스 워커를 거치지 않는다.
  // iOS가 홈 화면 아이콘을 가져올 때 서비스 워커 응답을 쓰지 못하는 경우가 있다.
  if (/(?:^|\/)(?:icons\/|favicon|apple-touch-icon|manifest\.webmanifest)/.test(url.pathname)) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
