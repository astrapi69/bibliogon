import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * sessionStorage key recording that a chunk-load failure already forced a
 * one-time reload. Survives the reload (same tab session) so a genuinely
 * broken chunk cannot trigger an endless reload loop.
 */
const RELOAD_GUARD_KEY = "bibliogon:chunk-reload-attempted";

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
 * Run a dynamic-import factory, recovering from a stale-shell chunk-load
 * failure with a single full reload.
 *
 * Why this exists: the GitHub-Pages PWA service worker is configured
 * `registerType: "autoUpdate"` + `skipWaiting: true` +
 * `cleanupOutdatedCaches: true`. After a deploy the new worker activates
 * immediately and deletes the previous precache out from under any tab still
 * running the *old* shell. The first navigation to a not-yet-loaded
 * code-split route (e.g. `/books/new`) then requests a chunk hash that no
 * longer exists -> the dynamic `import()` rejects -> React surfaces it to the
 * route's error boundary. A full reload pulls the fresh shell + current chunk
 * hashes, after which the route loads normally.
 *
 * This loader turns that manual "crash -> click Reload -> works" loop into a
 * seamless automatic recovery, at the actual failure layer (the chunk load)
 * rather than masking it behind the boundary:
 *
 *   - On the first import failure it records a per-session guard and triggers
 *     `window.location.reload()`, returning a never-settling promise so React
 *     keeps showing the Suspense fallback (not the boundary) until the reload
 *     swaps the document.
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
    try {
        const module = await factory();
        clearReloadGuard();
        return module;
    } catch (error) {
        if (reloadAlreadyAttempted()) {
            throw error;
        }
        markReloadAttempted();
        window.location.reload();
        // Suspend forever: the reload replaces the document, so this promise
        // never needs to settle. Returning (rather than rethrowing) keeps the
        // Suspense fallback visible instead of the error boundary.
        return new Promise<{ default: T }>(() => {});
    }
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
