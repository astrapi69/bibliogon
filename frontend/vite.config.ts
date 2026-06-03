/// <reference types="vitest" />
import {fileURLToPath, URL} from "node:url";
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {VitePWA} from "vite-plugin-pwa";

import pkg from "./package.json" with {type: "json"};

export default defineConfig({
    define: {
        // Single source of truth: package.json. Replaced at build
        // time (and during vitest runs) by the literal string.
        // Downstream code reads __APP_VERSION__ instead of
        // re-declaring a hardcoded constant.
        __APP_VERSION__: JSON.stringify(pkg.version),
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
            devOptions: {
                enabled: true,
            },
            includeAssets: ["icon-192.png", "icon-512.png", "icon-192.svg", "icon-512.svg"],
            manifest: {
                name: "Bibliogon",
                short_name: "Bibliogon",
                description: "Open-source book authoring platform",
                theme_color: "#b45309",
                background_color: "#faf8f5",
                display: "standalone",
                orientation: "any",
                start_url: "/",
                scope: "/",
                icons: [
                    {src: "/icon-192.png", sizes: "192x192", type: "image/png"},
                    {src: "/icon-512.png", sizes: "512x512", type: "image/png"},
                    {src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any"},
                    {src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any"},
                ],
            },
            workbox: {
                // Precache static assets, skip API calls
                globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
                navigateFallback: "/index.html",
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
                    if (!id.includes('node_modules')) return undefined;
                    const chunkMap: Record<string, string[]> = {
                        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                        'vendor-tiptap': [
                            '@tiptap/react',
                            '@tiptap/starter-kit',
                            '@tiptap/extension-image',
                            '@tiptap/extension-link',
                            '@tiptap/extension-table',
                            '@tiptap/extension-table-row',
                            '@tiptap/extension-table-cell',
                            '@tiptap/extension-table-header',
                            '@tiptap/extension-task-list',
                            '@tiptap/extension-task-item',
                            '@tiptap/extension-text-align',
                            '@tiptap/extension-text-style',
                            '@tiptap/extension-underline',
                            '@tiptap/extension-subscript',
                            '@tiptap/extension-superscript',
                            '@tiptap/extension-highlight',
                            '@tiptap/extension-color',
                            '@tiptap/extension-typography',
                            '@tiptap/extension-character-count',
                            '@tiptap/extension-placeholder',
                            '@tiptap/extension-code-block-lowlight',
                            '@pentestpad/tiptap-extension-figure',
                            '@sereneinserenade/tiptap-search-and-replace',
                            'tiptap-footnotes',
                        ],
                        'vendor-ui': [
                            '@radix-ui/react-context-menu',
                            '@radix-ui/react-dialog',
                            '@radix-ui/react-dropdown-menu',
                            '@radix-ui/react-select',
                            '@radix-ui/react-tabs',
                            '@radix-ui/react-toggle',
                            '@radix-ui/react-tooltip',
                            '@dnd-kit/core',
                            '@dnd-kit/sortable',
                            '@dnd-kit/utilities',
                            'lucide-react',
                            'react-toastify',
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
