/**
 * useStorageMode hook (mobile-sync Phase 3, C2).
 *
 * Pins the desktop-safety contract: with offline capability OFF the
 * monitor is never started and the mode stays "api"; with it ON the
 * monitor starts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { renderHook } from "@testing-library/react";

import { connectivity, setOfflineEnabled } from "./connectivity";
import { ensureDexieStorageLoaded } from "./index";
import { useStorageMode } from "./useStorageMode";

beforeEach(() => {
  localStorage.clear();
  connectivity.__resetForTests(true);
});

afterEach(async () => {
  // Enabling offline can kick off the lazy DexieStorage import (seed JSON);
  // await it so the dynamic import settles inside the test env rather than
  // after teardown, which would surface as an unhandled EnvironmentTeardown
  // rejection (same class as the index.test settle fix, a9fab5c1).
  await ensureDexieStorageLoaded().catch(() => {});
  connectivity.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useStorageMode", () => {
  it("stays 'api' and never starts the monitor when offline is disabled", () => {
    const start = vi.spyOn(connectivity, "start");
    const { result } = renderHook(() => useStorageMode());
    expect(result.current.offlineEnabled).toBe(false);
    expect(result.current.online).toBe(true);
    expect(result.current.mode).toBe("api");
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the monitor when offline capability is enabled", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    setOfflineEnabled(true);
    const start = vi.spyOn(connectivity, "start");
    const { result } = renderHook(() => useStorageMode());
    expect(result.current.offlineEnabled).toBe(true);
    expect(start).toHaveBeenCalled();
    // Online (default) + offline-enabled still resolves to api.
    expect(result.current.mode).toBe("api");
  });
});
