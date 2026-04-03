/// <reference types="vitest" />
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
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
            },
        },
    },
});
