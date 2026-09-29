/**
 * Storage routing (mobile-sync Phase 3, C4).
 *
 * Pins that getStorage() routes reads to DexieStorage when offline +
 * offline-enabled (so migrated call-sites read from IndexedDB), and to
 * ApiStorage when online.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";

import { connectivity, setOfflineEnabled } from "./connectivity";
import {
  getStorage,
  resolveStorageMode,
  ensureDexieStorageLoaded,
  __resetStorageForTests,
} from "./index";
import { offlineDb, dexieStorage } from "./dexie-storage";

beforeEach(async () => {
  localStorage.clear();
  __resetStorageForTests();
  connectivity.__resetForTests(true);
  await Promise.all(offlineDb.tables.map((t) => t.clear()));
});

afterEach(() => {
  connectivity.stop();
  vi.restoreAllMocks();
});

describe("getStorage routing", () => {
  it("routes to ApiStorage when online", () => {
    expect(resolveStorageMode()).toBe("api");
    expect(getStorage().mode).toBe("api");
  });

  it("routes reads to DexieStorage when offline + offline-enabled", async () => {
    setOfflineEnabled(true);
    connectivity.__resetForTests(false); // force offline
    expect(resolveStorageMode()).toBe("dexie");

    await ensureDexieStorageLoaded();
    // Offline backend is the DexieStorage wrapped in the queueing layer
    // (C5), so it is mode "dexie" but not the raw dexieStorage identity.
    const svc = getStorage();
    expect(svc.mode).toBe("dexie");
    expect(svc).not.toBe(dexieStorage);

    await dexieStorage.books.create({ title: "Nur offline" });
    const list = await svc.books.list();
    expect(list.map((b) => b.title)).toContain("Nur offline");
  });

  it("keeps Story-Bible text analysis on the backend when online", async () => {
    // The offline port (#732) computes proposals + warnings client-side.
    // Online the desktop path must still ask the plugin, which knows the
    // whole book and stays the reference implementation.
    const { api } = await import("../api/client");
    const autoDetect = vi
      .spyOn(api.storyBible, "autoDetect")
      .mockResolvedValue([]);
    const continuityCheck = vi
      .spyOn(api.storyBible, "continuityCheck")
      .mockResolvedValue([]);

    const svc = getStorage();
    expect(svc.mode).toBe("api");
    await svc.storyBible.autoDetect("b1");
    await svc.storyBible.continuityCheck("b1");

    expect(autoDetect).toHaveBeenCalledWith("b1");
    expect(continuityCheck).toHaveBeenCalledWith("b1");
  });
});
