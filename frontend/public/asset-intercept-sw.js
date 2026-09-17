/*
 * Offline asset intercept (P3c) — imported into the generated Workbox SW via
 * `workbox.importScripts`. Serves book image assets from IndexedDB so the
 * backendless build shows images the app embedded as `/api/...` URLs (chapter
 * figures inside TipTap bodies, picture-book / collage / comic-panel images),
 * which the React `useAssetUrl` resolver cannot reach because it does not own
 * those `<img>` elements.
 *
 * Three URL shapes are served (mirroring the backend asset routers):
 *   - /api/books/{bookId}/assets/file/{filename}      (covers + editor figures)
 *   - /api/books/{bookId}/assets/{assetId}/file       (picture-book / collage)
 *   - /api/articles/{articleId}/assets/file/{filename} (article images, #882:
 *     the Medium import stores every image locally under this URL)
 *
 * Book files come from the Dexie `bibliogon-offline` DB's `assets` table,
 * article files from its `articleAssets` table; rows hold the bytes as a raw
 * `data` ArrayBuffer + a `mimeType`. On a miss the request
 * falls through to the network (so api mode / online is unaffected — the
 * store is empty there and the server serves the file).
 *
 * Dependency-free + registered as a plain `fetch` listener: it only calls
 * `event.respondWith` for the two asset shapes, leaving every other request
 * (including Workbox's own precache / navigation handling) untouched. Pure JS,
 * no Workbox imports, so it composes with the generated SW without a race.
 */

/*
 * Controlled update support: the app uses `registerType: "prompt"`, so a new
 * worker installs and WAITS. When the user clicks "update now", the page posts
 * `{type:"SKIP_WAITING"}`; this listener calls `self.skipWaiting()` so the new
 * worker activates, fires `controllerchange`, and the app reloads onto the new
 * bundle. See src/shared/utils/swUpdateManager.ts.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const DB_NAME = "bibliogon-offline";
const STORE = "assets";
const ARTICLE_STORE = "articleAssets";
const FILE_BY_NAME = /\/api\/books\/([^/]+)\/assets\/file\/([^?#]+)/;
const FILE_BY_ID = /\/api\/books\/([^/]+)\/assets\/([^/]+)\/file(?:[?#]|$)/;
const ARTICLE_FILE_BY_NAME = /\/api\/articles\/([^/]+)\/assets\/file\/([^?#]+)/;

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  const byName = url.pathname.match(FILE_BY_NAME);
  if (byName) {
    const bookId = decodeURIComponent(byName[1]);
    const filename = decodeURIComponent(byName[2]);
    event.respondWith(serve(readByFilename(bookId, filename), event.request));
    return;
  }

  const byArticle = url.pathname.match(ARTICLE_FILE_BY_NAME);
  if (byArticle) {
    const articleId = decodeURIComponent(byArticle[1]);
    const filename = decodeURIComponent(byArticle[2]);
    event.respondWith(serve(readArticleAsset(articleId, filename), event.request));
    return;
  }

  const byId = url.pathname.match(FILE_BY_ID);
  if (byId) {
    const assetId = decodeURIComponent(byId[2]);
    event.respondWith(serve(readById(assetId), event.request));
    return;
  }
});

/** Resolve a stored row to a Response, falling back to the network on a miss
 *  or any IndexedDB error (so online / api mode is never broken). */
async function serve(rowPromise, request) {
  try {
    const row = await rowPromise;
    if (row && row.data) {
      return new Response(row.data, {
        headers: {
          "Content-Type": row.mimeType || "application/octet-stream",
          "Cache-Control": "no-store",
        },
      });
    }
  } catch (err) {
    /* fall through to the network */
  }
  return fetch(request).catch(
    () => new Response("", { status: 404, statusText: "Not Found" }),
  );
}

function readByFilename(bookId, filename) {
  return withStore((store) => {
    if (!store.indexNames.contains("[bookId+filename]")) return Promise.resolve(null);
    return reqToPromise(store.index("[bookId+filename]").get([bookId, filename]));
  });
}

function readById(assetId) {
  return withStore((store) => reqToPromise(store.get(assetId)));
}

/** Article images are indexed by articleId only; the filename is matched
 *  among that article's rows (a handful per article). */
function readArticleAsset(articleId, filename) {
  return withStore((store) => {
    if (!store.indexNames.contains("articleId")) return Promise.resolve(null);
    return reqToPromise(store.index("articleId").getAll(articleId)).then(
      (rows) => (rows || []).find((row) => row.filename === filename) || null,
    );
  }, ARTICLE_STORE);
}

/** Open the DB read-only, run `fn(store)`, and close. Resolves null when the
 *  DB / store does not exist yet (fresh client, nothing taken offline). */
function withStore(fn, storeName = STORE) {
  return new Promise((resolve, reject) => {
    let open;
    try {
      open = indexedDB.open(DB_NAME);
    } catch (err) {
      resolve(null);
      return;
    }
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(null);
        return;
      }
      let result;
      try {
        const tx = db.transaction(storeName, "readonly");
        result = fn(tx.objectStore(storeName));
      } catch (err) {
        db.close();
        reject(err);
        return;
      }
      Promise.resolve(result)
        .then((value) => {
          db.close();
          resolve(value);
        })
        .catch((err) => {
          db.close();
          reject(err);
        });
    };
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
