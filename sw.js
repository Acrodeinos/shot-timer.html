/* Shot Timer – mode hors ligne (service worker)
 * À chaque nouvelle version de l'app, augmente VERSION : l'iPhone téléchargera
 * la mise à jour à la prochaine ouverture avec réseau.
 */
var VERSION = 'shot-timer-v1.23'; // même numéro que dans Crédits et versions

// Fichiers de l'app copiés dans l'iPhone dès la première ouverture.
var CORE = [
  './',
  'index.html',
  'shot-timer-en.html',
  'manifest.json',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png'
];
// Polices (Google Fonts) : la feuille de style et les fichiers de police qu'elle cite.
var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap';

function cacheFonts(cache) {
  return fetch(FONT_CSS).then(function (res) {
    if (!res.ok) return;
    return res.clone().text().then(function (css) {
      var urls = (css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g) || [])
        .map(function (u) { return u.slice(4, -1); });
      return Promise.all([cache.put(FONT_CSS, res)].concat(urls.map(function (u) {
        return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () {});
      })));
    });
  }).catch(function () {});
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (cache) {
    // Chaque fichier séparément : un fichier absent ne bloque pas l'installation.
    return Promise.all(CORE.map(function (u) { return cache.add(u).catch(function () {}); }))
      .then(function () { return cacheFonts(cache); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Réseau d'abord (3 s max) pour les pages, afin de recevoir les mises à jour ;
// sinon la copie locale. Le reste (polices, icônes) : copie locale d'abord.
function networkFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 3000); });
    return Promise.race([net.catch(function () {}), timeout]).then(function (res) {
      return res || cache.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || net;
      });
    });
  });
}
function cacheFirst(req) {
  return caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: req.url.indexOf(self.location.origin) === 0 }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return; // ex. lien YouTube : laissé au navigateur
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});
