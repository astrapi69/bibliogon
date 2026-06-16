/**
 * Regression pins for the route chunk-load recovery (issues #320 + #325,
 * the first-cold-load `/books/new` crash).
 *
 * The component render path is robust (a cold-start render test with an
 * empty registry + rejecting storage renders cleanly); the real failure is
 * a dynamic `import()` rejecting. Two modes:
 *   1. transient first-cold-load failure -> bounded in-place retries recover
 *      WITHOUT a reload and without the boundary;
 *   2. persistent stale-shell failure -> one guarded reload; a repeat
 *      failure after that reload rethrows (no loop); success clears the guard.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadModuleWithReload } from "./lazyWithReload";

const GUARD_KEY = "bibliogon:chunk-reload-attempted";

const dummyModule = { default: () => null };

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    reloadSpy = vi.fn();
    // window.location.reload is non-configurable in some runtimes; replace the
    // whole location with a minimal stub carrying our spy.
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, reload: reloadSpy },
    });
});

afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe("loadModuleWithReload", () => {
    it("returns the module and clears the guard on success", async () => {
        sessionStorage.setItem(GUARD_KEY, "1"); // a prior recovery
        const factory = vi.fn().mockResolvedValue(dummyModule);

        const result = await loadModuleWithReload(factory);

        expect(result).toBe(dummyModule);
        expect(reloadSpy).not.toHaveBeenCalled();
        // Guard cleared so a later, unrelated stale-shell event can recover.
        expect(sessionStorage.getItem(GUARD_KEY)).toBeNull();
    });

    it("recovers a transient single import failure via retry, with NO reload", async () => {
        // First cold load: the chunk 404s once (SW still installing), then the
        // retry succeeds. The boundary must never show and the page must not
        // reload.
        const factory = vi
            .fn()
            .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
            .mockResolvedValue(dummyModule);

        const pending = loadModuleWithReload(factory);
        // Drive the retry backoff timer.
        await vi.runAllTimersAsync();
        const result = await pending;

        expect(result).toBe(dummyModule);
        expect(factory).toHaveBeenCalledTimes(2);
        expect(reloadSpy).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(GUARD_KEY)).toBeNull();
    });

    it("reloads once and suspends (never settles) when every retry fails", async () => {
        const factory = vi
            .fn()
            .mockRejectedValue(new Error("Failed to fetch dynamically imported module"));

        let settled = false;
        void loadModuleWithReload(factory).then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );

        // Exhaust the retry backoffs, then let the catch/reload branch run.
        await vi.runAllTimersAsync();

        expect(factory).toHaveBeenCalledTimes(3);
        expect(reloadSpy).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(GUARD_KEY)).toBe("1");

        // The returned promise must NOT settle: the reload swaps the document,
        // so React keeps the Suspense fallback (not the error boundary).
        await vi.advanceTimersByTimeAsync(50);
        expect(settled).toBe(false);
    });

    it("rethrows (no second reload) when the import still fails after one reload", async () => {
        sessionStorage.setItem(GUARD_KEY, "1"); // already reloaded once
        const error = new Error("Failed to fetch dynamically imported module");
        const factory = vi.fn().mockRejectedValue(error);

        const pending = loadModuleWithReload(factory);
        const assertion = expect(pending).rejects.toBe(error);
        await vi.runAllTimersAsync();
        await assertion;

        expect(factory).toHaveBeenCalledTimes(3);
        expect(reloadSpy).not.toHaveBeenCalled();
    });
});
