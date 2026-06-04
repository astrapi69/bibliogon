/**
 * Storage factory + ApiStorage seam (mobile-sync Phase 2, P2-C1).
 *
 * Pins: mode resolution (default + persisted), the factory caches one
 * instance, ApiStorage delegates to the real `api` client (identity),
 * and a 'dexie' preference falls back to ApiStorage with a warning
 * until DexieStorage lands.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "../api/client";
import { apiStorage } from "./api-storage";
import {
  getStorage,
  resolveStorageMode,
  readPersistedStorageMode,
  setPersistedStorageMode,
  __resetStorageForTests,
} from "./index";

beforeEach(() => {
  localStorage.clear();
  __resetStorageForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("storage mode resolution", () => {
  it("defaults to 'api' with nothing persisted", () => {
    expect(readPersistedStorageMode()).toBeNull();
    expect(resolveStorageMode()).toBe("api");
  });

  it("round-trips a persisted mode preference", () => {
    setPersistedStorageMode("dexie");
    expect(readPersistedStorageMode()).toBe("dexie");
    expect(resolveStorageMode()).toBe("dexie");
    setPersistedStorageMode("api");
    expect(resolveStorageMode()).toBe("api");
  });

  it("ignores a garbage persisted value", () => {
    localStorage.setItem("bibliogon.storage_mode", "bogus");
    expect(readPersistedStorageMode()).toBeNull();
    expect(resolveStorageMode()).toBe("api");
  });
});

describe("getStorage factory", () => {
  it("returns ApiStorage and caches the same instance", () => {
    const a = getStorage();
    expect(a).toBe(apiStorage);
    expect(a.mode).toBe("api");
    expect(getStorage()).toBe(a);
  });

  it("falls back to ApiStorage (with a warning) when 'dexie' is requested", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setPersistedStorageMode("dexie");
    const svc = getStorage();
    expect(svc).toBe(apiStorage);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("ApiStorage delegates to the api client", () => {
  it("mirrors the core CRUD of books, chapters and articles by reference", () => {
    // Identity == zero-indirection delegation: a call through the
    // storage seam hits exactly the same client method.
    expect(apiStorage.books.list).toBe(api.books.list);
    expect(apiStorage.books.update).toBe(api.books.update);
    expect(apiStorage.books.delete).toBe(api.books.delete);
    expect(apiStorage.chapters.create).toBe(api.chapters.create);
    expect(apiStorage.chapters.reorder).toBe(api.chapters.reorder);
    expect(apiStorage.articles.get).toBe(api.articles.get);
    expect(apiStorage.articles.update).toBe(api.articles.update);
  });
});
