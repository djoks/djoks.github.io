/*
 * Media cache. Keeps the site's photos, posters, clips and brand files after their first load, so
 * repeat visits read them from the device instead of the network. It handles only same-origin GET
 * requests under /media/ and /brand/; pages, code and styles always go to the network.
 *
 * Clips are cached whole, then every range request is answered from the cached copy with a 206,
 * which Safari requires. A cached file is revalidated in the background with a conditional
 * request (at most once every few minutes), so a replaced file reaches the next visit.
 * Registered by src/lib/media-cache.ts.
 */
const CACHE = "gb-media-v1";
const REVALIDATE_MS = 5 * 60 * 1000;
const checked = new Map();
const inflight = new Map();

/** Whether a path is one this worker serves: anything under /media/ or /brand/. */
function isMediaPath(pathname) {
  return /\/(media|brand)\//.test(pathname);
}

/** A Range header's byte span within a file of `size` bytes, or null when it cannot be served. */
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("gb-media-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isMediaPath(url.pathname)) return;
  event.respondWith(serve(request, url.origin + url.pathname + url.search, event));
});

async function serve(request, key, event) {
  const cache = await caches.open(CACHE);
  let response = await cache.match(key);
  if (response) event.waitUntil(revalidate(cache, key, response));
  else {
    try {
      response = await fetchWhole(cache, key);
    } catch {
      return fetch(request);
    }
    if (!response) return fetch(request);
  }
  const range = request.headers.get("range");
  return range ? partial(response, range) : response;
}

/** Downloads a file once, however many requests ask for it meanwhile, and caches a 200. */
function fetchWhole(cache, key) {
  if (!inflight.has(key)) {
    const pending = (async () => {
      const response = await fetch(key, { credentials: "same-origin" });
      if (response.status !== 200) return null;
      await cache.put(key, response.clone());
      checked.set(key, Date.now());
      return response;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return inflight.get(key).then((response) => response && response.clone());
}

async function partial(response, header) {
  const blob = await response.blob();
  const span = byteRange(header, blob.size);
  if (!span)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${blob.size}` },
    });
  return new Response(blob.slice(span.start, span.end + 1), {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${span.start}-${span.end}/${blob.size}`,
      "Content-Length": String(span.end - span.start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

/** Asks the server whether the cached copy is still current, and replaces it if not. */
async function revalidate(cache, key, cached) {
  const last = checked.get(key) || 0;
  if (Date.now() - last < REVALIDATE_MS) return;
  checked.set(key, Date.now());
  const etag = cached.headers.get("ETag");
  const modified = cached.headers.get("Last-Modified");
  if (!etag && !modified) return;
  try {
    const fresh = await fetch(key, {
      cache: "no-store",
      headers: etag ? { "If-None-Match": etag } : { "If-Modified-Since": modified },
    });
    if (fresh.status === 200) await cache.put(key, fresh);
  } catch {
    // Offline or unreachable: keep serving the cached copy.
  }
}
