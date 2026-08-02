// the service worker that lets the tablet open the app with no internet.
//
// it caches nothing up front - it keeps a copy of whatever the app already
// fetched successfully. so the rule for the truck is: open the app once on
// wifi after every deploy, and it will open anywhere after that.
//
// bump VERSION when you change this file or want to drop every old copy.
const VERSION = "v2";
const CACHE = `seven-degree-${VERSION}`;

// pages worth keeping a copy of. the rest of the app needs the server anyway.
//
// /login is here for the shift: with no internet it is the screen that says
// whose tablet this is and opens it again. the copy is taken on the way in -
// a signed out tablet asking for /login on wifi is exactly the trip that
// fills it, and while somebody is signed in that url only ever answers with a
// redirect, which is never kept.
const CACHED_PAGES = ["/pos", "/kds", "/login"];

// an answer for a page we have never seen, so the tablet says something
// instead of showing the browser's dinosaur.
const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>offline</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f5f5f4;color:#1c1917;
    display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
  div{max-width:24rem;text-align:center}
  a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:12px;
    background:#292524;color:#fafaf9;text-decoration:none}
</style></head>
<body><div>
  <h1>no internet</h1>
  <p>this screen was never opened on this tablet, so there is no copy of it.
     open the cashier screen instead.</p>
  <a href="/pos">go to the cashier screen</a>
</div></body></html>`;

self.addEventListener("install", () => {
  // a new worker should not sit behind the old one on a till
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter((name) => name.startsWith("seven-degree-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  // hashed build output and the icons. the name changes when the file does,
  // so an old entry can never be served as the current one.
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.ico"
  );
}

function isCacheablePage(url) {
  return CACHED_PAGES.includes(url.pathname);
}

// already there? serve it and do not touch the network.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);

  if (hit) {
    return hit;
  }

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

// the live page wins, the copy is only the safety net
async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    // never keep a redirect: signed out, /pos answers with the login page,
    // and that copy would then be served to a cashier who is signed in.
    if (response.ok && !response.redirected && isCacheablePage(url)) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const hit = await cache.match(request);

    if (hit) {
      return hit;
    }

    if (request.mode === "navigate") {
      return new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // writes go to the server or nowhere. a cached checkout would be a lie.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // supabase and anything else off this origin is left alone
  if (url.origin !== self.location.origin) {
    return;
  }

  // react server component payloads for client side navigation. they carry a
  // build id, so a stale one is worse than a failed one - next falls back to
  // a full page load, which we can answer from the cache.
  if (url.searchParams.has("_rsc")) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" || isCacheablePage(url)) {
    event.respondWith(networkFirst(request, url));
  }
});
