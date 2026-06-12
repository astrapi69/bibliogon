/// <reference types="vite/client" />

// Build-time literal injected by Vite (see frontend/vite.config.ts
// `define`). Single source of truth: frontend/package.json.
declare const __APP_VERSION__: string;

// Build provenance injected by Vite at build time (see
// frontend/vite.config.ts `define`). __BUILD_HASH__ is the short git
// SHA of the built commit (or "unknown"); __BUILD_DATE__ is an ISO
// timestamp of when the bundle was built; __BUILD_BRANCH__ is the branch
// the build came from (VITE_BUILD_BRANCH / GITHUB_REF_NAME / git, or
// "unknown"). Surfaced in Settings > About so a running build is
// identifiable against a stale service worker.
declare const __BUILD_HASH__: string;
declare const __BUILD_DATE__: string;
declare const __BUILD_BRANCH__: string;
