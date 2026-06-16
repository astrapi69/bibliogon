import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * sessionStorage key recording that a chunk-load failure already forced a
 * one-time reload. Survives the reload (same tab session) so a genuinely
 * broken chunk cannot trigger an endless reload loop.
 */
const RELOAD_GUARD_KEY = "bibliogon:chunk-reload-attempted";

/**
 * In-place import retries before the last-resort reload. A first cold load
 * (no cache, service worker still installing, slow network) can transiently
 * 404 / reject the route chunk on the very first `import()` even though the
 * asset is healthy. Retrying the import a few times recovers that case
 * without surfacing the route error boundary; only a persistent failure
 * falls through to the guarded one-time reload.
 */
const IMPORT_RETRY_ATTEMPTS = 3;

/** Base backoff between import retries, multiplied by the attempt index. */
const IMPORT_RETRY_BASE_MS = 200;

/** Resolve after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read the per-session reload guard, tolerating an unavailable storage. */
function reloadAlreadyAttempted(): boolean {
    try {
        return sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
    } catch {
        return false;
    }
}

/** Set the per-session reload guard, tolerating an unavailable storage. */
function markReloadAttempted(): void {
    try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
        /* storage unavailable — the worst case is a second reload attempt */
    }
}

/** Clear the per-session reload guard after a successful load. */
function clearReloadGuard(): void {
    try {
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch {
        /* storage unavailable — no-op */
    }
}

/**
 * Run a dynamic-import factory, recovering from a transient first-cold-load
 * chunk failure with bounded in-place retries, and from a stale-shell
 * chunk-load failure with a single full reload.
 *
 * Why this exists: two distinct chunk-load failure modes surface the route's
 * error boundary on the GitHub-Pages PWA, both reported as "/books/new
 * crashes on first load, a manual reload fixes it".
 *
 *   1. **Transient first-cold-load failure.** On a genuinely first visit (no
 *      cache, the service worker still installing, a slow/flaky cold network)
 *      the very first `import()` of a not-yet-loaded route chunk can reject
 *      even though the asset is healthy. A second attempt moments later
 *      succeeds. Retrying the import in place recovers this without a reload
 *      and without the boundary ever showing.
 *   2. **Stale-shell failure.** The PWA worker runs `registerType:
 *      "autoUpdate"` + `skipWaiting: true` + `cleanupOutdatedCaches: true`.
 *      After a deploy the new worker deletes the previous precache out from
 *      under a tab still running the *old* shell, so the requested chunk hash
 *      no longer exists. No number of in-place retries can resurrect a hash
 *      that is gone; only a full reload pulls the fresh shell + current
 *      hashes.
 *
 * This loader handles both, at the actual failure layer rather than masking
 * it behind the boundary:
 *
 *   - The import is retried up to {@link IMPORT_RETRY_ATTEMPTS} times with a
 *     short escalating backoff. A retry that succeeds clears the reload guard
 *     and returns the module - the boundary never shows.
 *   - If every retry fails, it falls back to the stale-shell path: a per-
 *     session guard plus a single `window.location.reload()`, returning a
 *     never-settling promise so React keeps the Suspense fallback (not the
 *     boundary) until the reload swaps the document.
 *   - If the import still fails after that one reload (a genuinely broken
 *     deploy, or the user is offline), the error is rethrown so the boundary
 *     surfaces it instead of looping.
 *   - A successful load clears the guard so a later, unrelated stale-shell
 *     event can recover again.
 *
 * @typeParam T - The lazily-loaded component type.
 * @param factory - The `() => import("./Module")` dynamic-import factory.
 * @returns The resolved module so it can feed `React.lazy`.
 */
export async function loadModuleWithReload<T extends ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>,
): Promise<{ default: T }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < IMPORT_RETRY_ATTEMPTS; attempt++) {
        try {
            const module = await factory();
            clearReloadGuard();
            return module;
        } catch (error) {
            lastError = error;
            if (attempt < IMPORT_RETRY_ATTEMPTS - 1) {
                await delay(IMPORT_RETRY_BASE_MS * (attempt + 1));
            }
        }
    }
    if (reloadAlreadyAttempted()) {
        throw lastError;
    }
    markReloadAttempted();
    window.location.reload();
    // Suspend forever: the reload replaces the document, so this promise
    // never needs to settle. Returning (rather than rethrowing) keeps the
    // Suspense fallback visible instead of the error boundary.
    return new Promise<{ default: T }>(() => {});
}

/**
 * Drop-in replacement for `React.lazy` that recovers from stale-shell
 * chunk-load failures via {@link loadModuleWithReload}. Use it for every
 * code-split route so a post-deploy precache swap auto-recovers instead of
 * crashing the route's error boundary.
 *
 * @typeParam T - The lazily-loaded component type.
 * @param factory - The `() => import("./Page")` dynamic-import factory.
 * @returns A `React.lazy` component backed by the resilient loader.
 */
export function lazyWithReload<T extends ComponentType<unknown>>(
    factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
    return lazy(() => loadModuleWithReload(factory));
}
