/* 咪了个喵 · 离线缓存
   页面/脚本用「网络优先」：改了文件刷新就是新版，断网时用缓存兜底。
   卡面图片用「缓存优先」：图片基本不变，省流量、开得快。 */
var V = 'mlm-v6';

var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/config.js',
  'js/idioms.js',
  'js/idiom-dict.js',
  'js/engine.js',
  'js/ui.js',
  'icon-192.png',
  'icon-512.png',
  'picture/bg.jpg',
  'picture/nest.png',
  'picture/cards/01.png',
  'picture/cards/02.png',
  'picture/cards/03.png',
  'picture/cards/04.png',
  'picture/cards/05.png',
  'picture/cards/06.png',
  'picture/cards/07.png',
  'picture/cards/08.png',
  'picture/cards/09.png',
  'picture/cards/10.png',
  'picture/cards/11.png',
  'picture/cards/12.png',
  'picture/cards/13.png',
  'picture/cards/14.png',
  'picture/cards/15.png',
  'picture/cards/16.png',
  'picture/cards/17.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(V).then(function (c) {
      // 单张图片缺失也不要让整个安装失败
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === V ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isImage(url) {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;

  // 图片：缓存优先
  if (isImage(url)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(V).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return caches.match('index.html'); });
      })
    );
    return;
  }

  // 页面 / 脚本 / 样式：网络优先，失败再吃缓存
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(V).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
