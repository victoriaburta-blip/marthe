// Service Worker: macht die App offline nutzbar.
// Nach Änderungen an App-Dateien die Versionsnummer erhöhen, damit alte Caches gelöscht werden.
var CACHE = 'marthe-v17';

var KATEX_FONTS = [
  'AMS-Regular', 'Caligraphic-Bold', 'Caligraphic-Regular', 'Fraktur-Bold', 'Fraktur-Regular',
  'Main-Bold', 'Main-BoldItalic', 'Main-Italic', 'Main-Regular', 'Math-BoldItalic', 'Math-Italic',
  'SansSerif-Bold', 'SansSerif-Italic', 'SansSerif-Regular', 'Script-Regular',
  'Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Typewriter-Regular'
].map(function (f) { return 'vendor/katex/fonts/KaTeX_' + f + '.woff2'; });

var PRECACHE = [
  './',
  'index.html',
  'impressum.html',
  'datenschutz.html',
  'cards/analysis.json',
  'cards/geometrie.json',
  'manifest.json',
  'css/style.css',
  'js/storage.js',
  'js/app.js',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'img/spat.svg',
  'img/pyramide.svg',
  'img/abstand-punkt-gerade.svg',
  'img/abstand-parallele-geraden.svg',
  'img/abstand-windschief.svg',
  'img/gerade-ebene-parallel.svg',
  'img/gerade-ebene-orthogonal.svg',
  'img/ebenen-parallel.svg',
  'img/ebenen-orthogonal.svg',
  'img/abstand-gerade-ebene.svg',
  'img/abstand-ebenen.svg',
  'img/spiegelung-punkt-ebene.svg',
  'fonts/poppins-400.woff2',
  'fonts/poppins-600.woff2',
  'fonts/poppins-700.woff2',
  'fonts/poppins-800.woff2'
].concat(KATEX_FONTS);

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Stale-while-revalidate: sofort aus dem Cache antworten, im Hintergrund aktualisieren.
// So kommen neue Karten in cards/*.json beim nächsten Öffnen automatisch an.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req)
          .then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(function () {
            return cached || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
          });
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return network;
      });
    })
  );
});
