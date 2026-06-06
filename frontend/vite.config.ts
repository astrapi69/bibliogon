/// <reference types="vitest" />
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };

// Build provenance baked into the bundle so Settings > About can show
// exactly which build is running. This is the user-facing antidote to the
// stale-service-worker problem: when a live report shows already-fixed
// behavior, the build hash/date tells at a glance whether the browser is
// serving an old precached bundle. CI can override via VITE_BUILD_HASH /
// VITE_BUILD_DATE; otherwise derive from git + the wall clock at build time.
function gitShortHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
const buildHash = process.env.VITE_BUILD_HASH || gitShortHash();
const buildDate = process.env.VITE_BUILD_DATE || new Date().toISOString();

// GitHub-Pages / sub-path support. The deployed base path is injected at
// build time via VITE_BASE_URL (e.g. "/bibliogon/" for GitHub Pages);
// the default "/" keeps the Desktop / LAN / `make dev` builds exactly as
// they are today. Vite exposes the resolved value as
// `import.meta.env.BASE_URL`, which the router reads for its basename and
// vite-plugin-pwa uses for the Service Worker registration scope +
// precache URLs. Vitest never sets the env-var, so component tests always
// run under base "/".
const base = process.env.VITE_BASE_URL || "/";

export default defineConfig({
  base,
  define: {
    // Single source of truth: package.json. Replaced at build
    // time (and during vitest runs) by the literal string.
    // Downstream code reads __APP_VERSION__ instead of
    // re-declaring a hardcoded constant.
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  resolve: {
    // ``@`` -> ``src`` alias for the shadcn/ui convention
    // (``@/components``, ``@/lib/utils``). Vitest shares this
    // config, so the alias resolves in tests too.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Service Worker DISABLED in dev. With it enabled, the dev SW
      // precached the bundle and kept serving a STALE copy across
      // reloads (an active SW is not replaced by a mere hard-reload),
      // so a just-merged fix (e.g. the Blogpost dropdown filter
      // removal) stayed invisible until the SW was manually cleared.
      // Vite HMR is authoritative in dev; the SW only runs in
      // production builds. (Also matches the Phase-3 C8 plan +
      // lessons-learned "disable SW in dev".)
      devOptions: {
        enabled: false,
      },
      includeAssets: [
        "icon-192.png",
        "icon-512.png",
        "icon-192.svg",
        "icon-512.svg",
      ],
      manifest: {
        name: "Bibliogon",
        short_name: "Bibliogon",
        description: "Open-source book authoring platform",
        theme_color: "#b45309",
        background_color: "#faf8f5",
        display: "standalone",
        orientation: "any",
        // start_url / scope / icon srcs follow the deploy base so the
        // installed PWA works under a sub-path (GitHub Pages) as well as
        // at the root (Desktop / LAN). With base "/" these resolve to the
        // exact same values shipped today.
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icon-512.png`, sizes: "512x512", type: "image/png" },
          {
            src: `${base}icon-192.svg`,
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: `${base}icon-512.svg`,
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // Precache static assets, skip API calls
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Offline asset intercept (P3c): a dependency-free fetch listener
        // that serves book images from IndexedDB for the two /assets URL
        // shapes. importScripts injects it at the TOP of the generated SW,
        // so it claims asset requests before Workbox's routing runs; it
        // respondWith()s only those URLs, leaving everything else to Workbox.
        // The relative path resolves under the deploy base (e.g. GH Pages
        // /bibliogon/asset-intercept-sw.js). See public/asset-intercept-sw.js.
        importScripts: ["asset-intercept-sw.js"],
        // SPA navigation fallback lives under the deploy base so deep
        // routes resolve to the right index.html on a sub-path host.
        navigateFallback: `${base}index.html`,
        // Take control + drop the previous precache as soon as a
        // new SW installs, so a new production bundle is served on
        // the next load instead of lingering behind the old SW.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  build: {
    // Vite 8 (Rolldown) accepts only the function form of
    // ``manualChunks``; the legacy object form Vite 7 supported
    // is no longer valid. Match each id against the packages-to-
    // chunk map and return the bucket name so Rolldown emits the
    // same chunk shape Rollup did under Vite 7.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes("node_modules")) return undefined;
          const chunkMap: Record<string, string[]> = {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-tiptap": [
              "@tiptap/react",
              "@tiptap/starter-kit",
              "@tiptap/extension-image",
              "@tiptap/extension-link",
              "@tiptap/extension-table",
              "@tiptap/extension-table-row",
              "@tiptap/extension-table-cell",
              "@tiptap/extension-table-header",
              "@tiptap/extension-task-list",
              "@tiptap/extension-task-item",
              "@tiptap/extension-text-align",
              "@tiptap/extension-text-style",
              "@tiptap/extension-underline",
              "@tiptap/extension-subscript",
              "@tiptap/extension-superscript",
              "@tiptap/extension-highlight",
              "@tiptap/extension-color",
              "@tiptap/extension-typography",
              "@tiptap/extension-character-count",
              "@tiptap/extension-placeholder",
              "@tiptap/extension-code-block-lowlight",
              "@pentestpad/tiptap-extension-figure",
              "@sereneinserenade/tiptap-search-and-replace",
              "tiptap-footnotes",
            ],
            "vendor-ui": [
              "@radix-ui/react-context-menu",
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-select",
              "@radix-ui/react-tabs",
              "@radix-ui/react-toggle",
              "@radix-ui/react-tooltip",
              "@dnd-kit/core",
              "@dnd-kit/sortable",
              "@dnd-kit/utilities",
              "lucide-react",
              "react-toastify",
            ],
          };
          for (const [chunkName, pkgs] of Object.entries(chunkMap)) {
            for (const pkg of pkgs) {
              // Trailing slash prevents react matching react-dom etc.
              if (id.includes(`/node_modules/${pkg}/`)) {
                return chunkName;
              }
            }
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        // Default targets the backend on the host (the
        // `make dev` flow). Inside Docker Compose,
        // ``localhost`` resolves to the frontend container
        // itself, not the backend service - so override
        // via VITE_API_PROXY_TARGET=http://backend:8000 in
        // docker-compose.yml. The env var is read by Node
        // when vite.config.ts is evaluated; no client-side
        // exposure (so the VITE_ prefix is incidental, not
        // required).
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
