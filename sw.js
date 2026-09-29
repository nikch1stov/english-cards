const CACHE = 'english-cards-v20';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'core.js', 'mascot.js', 'cloud.js', 'config.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'words.md'];
// Pages and the word list change without a new URL, so they are fetched fresh; everything else is versioned.
const FRESH = /\/(index\.html|words\.md|manifest\.webmanifest)?$/;
const NETWORK_WAIT = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function store(req, res) {
  if (res.ok) {
    const c = await caches.open(CACHE);
    await c.put(req, res.clone());
  }
  return res;
}

const fallback = req => caches.match(req, { ignoreSearch: true });

// Fresh copy when the network answers quickly; on a slow connection the cached copy is shown instead.
async function networkFirst(req) {
  const network = fetch(req).then(res => store(req, res));
  network.catch(() => {}); // a late failure after the cached copy was shown is fine
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_WAIT));
  try {
    const res = await Promise.race([network, timeout.then(() => fallback(req))]);
    if (res) return res;
    return await network;
  } catch {
    return (await fallback(req)) || Response.error();
  }
}

// Versioned files (?v=N) and the pinned CDN library never change under the same URL.
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    return await store(req, await fetch(req));
  } catch {
    return (await fallback(req)) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const local = url.origin === location.origin;
  // Account, sync and dictionary requests always go straight to the network.
  if (!local && url.hostname !== 'cdn.jsdelivr.net') return;
  e.respondWith(local && (e.request.mode === 'navigate' || FRESH.test(url.pathname)) ? networkFirst(e.request) : cacheFirst(e.request));
});
