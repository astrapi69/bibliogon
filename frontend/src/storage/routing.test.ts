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
    const svc = getStorage();
    expect(svc).toBe(dexieStorage);
    expect(svc.mode).toBe("dexie");

    await dexieStorage.books.create({ title: "Nur offline" });
    const list = await svc.books.list();
    expect(list.map((b) => b.title)).toContain("Nur offline");
  });
});
