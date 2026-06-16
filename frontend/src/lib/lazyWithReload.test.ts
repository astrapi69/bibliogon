/**
 * Regression pins for the stale-shell chunk-load recovery (issue #320).
 *
 * The component render path is robust; the real failure is a dynamic
 * `import()` rejecting after the autoUpdate SW swapped the precache. These
 * tests exercise the recovery contract of {@link loadModuleWithReload}:
 * first failure -> one guarded reload; repeat failure -> rethrow (no loop);
 * success -> clear the guard.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadModuleWithReload } from "./lazyWithReload";

const GUARD_KEY = "bibliogon:chunk-reload-attempted";

const dummyModule = { default: () => null };

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
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

    it("reloads once and suspends (never settles) on the first chunk-load failure", async () => {
        const factory = vi
            .fn()
            .mockRejectedValue(new Error("Failed to fetch dynamically imported module"));

        let settled = false;
        const pending = loadModuleWithReload(factory).then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );

        // Let the rejected factory + catch branch run.
        await Promise.resolve();
        await Promise.resolve();

        expect(reloadSpy).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(GUARD_KEY)).toBe("1");

        // The returned promise must NOT settle: the reload swaps the document,
        // so React keeps the Suspense fallback (not the error boundary).
        const race = await Promise.race([
            pending.then(() => "settled"),
            new Promise((resolve) => setTimeout(() => resolve("pending"), 20)),
        ]);
        expect(race).toBe("pending");
        expect(settled).toBe(false);
    });

    it("rethrows (no second reload) when the import still fails after one reload", async () => {
        sessionStorage.setItem(GUARD_KEY, "1"); // already reloaded once
        const error = new Error("Failed to fetch dynamically imported module");
        const factory = vi.fn().mockRejectedValue(error);

        await expect(loadModuleWithReload(factory)).rejects.toBe(error);
        expect(reloadSpy).not.toHaveBeenCalled();
    });
});
