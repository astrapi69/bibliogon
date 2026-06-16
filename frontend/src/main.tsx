import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// Tailwind utilities (token-mapped, Preflight-omitted) load first so
// global.css -- which is unlayered and therefore outranks Tailwind's
// layered utilities -- keeps final say over any existing surface.
import "./styles/tailwind.css";
import "./styles/global.css";
import { verifyBackendVersion } from "./utils/versionCheck";
import { restoreSpaRedirect } from "./utils/spaRedirect";
import { explicitStorageMode, ensureDexieStorageLoaded } from "./storage";
import { initSwUpdateManager } from "./shared/utils/swUpdateManager";

// a11y: @axe-core/react logs WCAG / Section 508 violations to
// the browser DevTools console after every render in dev mode.
// devDependency-only — never shipped to production bundle. The
// 1000ms debounce keeps it responsive without thrashing the
// console during rapid re-renders. WCAG 2.1 SC 4.1.1 / 4.1.2.
if (import.meta.env.DEV) {
  void import("@axe-core/react").then(({ default: axe }) => {
    void axe(React, ReactDOM, 1000);
  });

  // The dev Service Worker is disabled (vite.config devOptions.enabled:
  // false). A SW registered by an EARLIER session persists in the browser
  // and would keep serving its stale precached bundle across reloads --
  // the recurring "fix merged but the old UI is still shown" symptom.
  // Proactively unregister any leftover SW + drop its caches so a single
  // reload picks up the live dev modules.
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
  }
}

// Router basename follows the Vite deploy base so deep-linkable routes
// work under a sub-path host (GitHub Pages, "/bibliogon/") as well as at
// the root (Desktop / LAN, "/"). Vite injects `import.meta.env.BASE_URL`
// at build time; strip the trailing slash because React Router expects a
// basename without one (root collapses back to "/").
const routerBasename = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

// SPA deep-link restore for GitHub Pages. Rewrites a ?redirect= bounce
// (set by public/404.html) back to the intended route BEFORE the router
// mounts. No-op on the Desktop / LAN deploy (no ?redirect= there).
restoreSpaRedirect(routerBasename);

/**
 * Mount the app. On a forced-offline build (`VITE_STORAGE_MODE=dexie`, the
 * GitHub-Pages PWA) or a persisted dexie override, DexieStorage is loaded
 * BEFORE the first render so the one-shot data providers (book/content types,
 * i18n, settings) read from IndexedDB on mount. Without this, those providers
 * race the lazy DexieStorage import, fall back to a doomed ApiStorage call on
 * the backendless host, and never retry - leaving registries (e.g. the
 * Settings default-type dropdowns) permanently empty. In api mode this is a
 * no-op and Dexie is never imported.
 *
 * The forced-offline build has no backend, so the startup backend-version
 * cross-check (a raw `/api/health` fetch) is skipped - it would otherwise fire
 * a doomed `/api` request on the GitHub-Pages host.
 */
async function boot(): Promise<void> {
  const forcedOffline = explicitStorageMode() === "dexie";
  if (forcedOffline) {
    // Retry the lazy DexieStorage import: on the GitHub-Pages PWA the chunk is
    // fetched over the network, and during a service-worker update (or before
    // CDN propagation) that fetch can transiently fail. Rendering without
    // Dexie would fall every getStorage() call back to the offline-rejected
    // API client, so retry a few times before giving up.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await ensureDexieStorageLoaded();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter basename={routerBasename}>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
  if (!forcedOffline) void verifyBackendVersion();
  if (!import.meta.env.DEV) initSwUpdateManager();
}

void boot();
