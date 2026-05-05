/**
 * Cross-check the build-time __APP_VERSION__ against the backend
 * /api/health response at app start.
 *
 * Frontend version is a Vite build-time literal from package.json;
 * backend __version__ is derived from backend/pyproject.toml. In dev
 * with hot-reload of one half but not the other, the two can diverge
 * silently. A console.warn at startup surfaces the mismatch without
 * blocking render or breaking the app.
 *
 * Fails open on any fetch / parse / network error. Offline boot or a
 * backend that hasn't finished starting is not a divergence signal.
 */
export async function verifyBackendVersion(): Promise<void> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const body = (await res.json()) as { version?: unknown };
    const backendVersion =
      typeof body.version === "string" ? body.version : null;
    if (!backendVersion) return;
    if (backendVersion !== __APP_VERSION__) {
      console.warn(
        `[bibliogon] frontend/backend version mismatch: frontend=${__APP_VERSION__} backend=${backendVersion}. ` +
          "Rebuild whichever half is stale (frontend: npm run build; backend: restart uvicorn).",
      );
    }
  } catch {
    /* fail open: offline boot, backend not ready, parse error */
  }
}
