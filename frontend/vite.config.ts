/// <reference types="vitest" />
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {VitePWA} from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icon-192.svg", "icon-512.svg"],
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
                    {src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml"},
                    {src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml"},
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
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
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
                },
            },
        },
    },
    server: {
        port: 5173,
        open: true,
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
                // Suppress noisy ECONNREFUSED errors during startup.
                // Vite starts faster than uvicorn; the first few proxy
                // attempts fail until the backend is ready. Without
                // this handler every failed attempt prints a full
                // stack trace to the terminal.
                configure: (proxy) => {
                    proxy.on("error", (err, _req, res) => {
                        if ("code" in err && err.code === "ECONNREFUSED") {
                            // Backend not ready yet — send a 503 so the
                            // browser retries silently instead of showing
                            // a network error.
                            if (res && "writeHead" in res && !res.headersSent) {
                                (res as import("http").ServerResponse).writeHead(503, {"Content-Type": "application/json"});
                                (res as import("http").ServerResponse).end(JSON.stringify({detail: "Backend starting up..."}));
                            }
                            return;
                        }
                        // Log non-ECONNREFUSED errors normally
                        console.error("[vite proxy]", err.message);
                    });
                },
            },
        },
    },
});
