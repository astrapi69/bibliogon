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

// SPA deep-link restore for GitHub Pages. public/404.html bounces an
// unknown deep link to `${BASE_URL}?redirect=<route>`; rewrite the URL
// back to the intended route BEFORE the router mounts so React Router
// boots straight onto it (no extra render / flash). No-op when there is
// no ?redirect= param (the Desktop / LAN deploy never sets one).
(() => {
  const params = new URLSearchParams(window.location.search);
  const redirectTo = params.get("redirect");
  if (!redirectTo || !redirectTo.startsWith("/")) return;
  const prefix = routerBasename === "/" ? "" : routerBasename;
  window.history.replaceState(null, "", prefix + redirectTo);
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

void verifyBackendVersion();
