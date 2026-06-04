/**
 * Connectivity monitor (mobile-sync Phase 3, C2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  connectivity,
  isOfflineEnabled,
  setOfflineEnabled,
} from "./connectivity";

beforeEach(() => {
  localStorage.clear();
  connectivity.__resetForTests(true);
});

afterEach(() => {
  connectivity.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("offline-enabled gate", () => {
  it("round-trips the persisted flag, default false", () => {
    expect(isOfflineEnabled()).toBe(false);
    setOfflineEnabled(true);
    expect(isOfflineEnabled()).toBe(true);
    setOfflineEnabled(false);
    expect(isOfflineEnabled()).toBe(false);
  });
});

describe("connectivity probe", () => {
  it("goes online on a 2xx and offline on a fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await connectivity.probe()).toBe(true);
    expect(connectivity.isOnline()).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend down")),
    );
    expect(await connectivity.probe()).toBe(false);
    expect(connectivity.isOnline()).toBe(false);
  });
});

describe("connectivity subscribers", () => {
  it("notifies on the window offline event", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const seen: boolean[] = [];
    connectivity.subscribe((online) => seen.push(online));
    connectivity.start();

    window.dispatchEvent(new Event("offline"));

    expect(connectivity.isOnline()).toBe(false);
    expect(seen).toContain(false);
  });
});
