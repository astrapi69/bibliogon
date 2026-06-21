/**
 * Storage-quota guard tests (P3c C6).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { isStorageNearlyFull, warnIfOfflineStorageNearlyFull } from "./storageQuota";

const getStorageMock = vi.fn();
vi.mock("../../storage", () => ({ getStorage: () => getStorageMock() }));
const notifyWarning = vi.fn();
vi.mock("./notify", () => ({ notify: { warning: (m: string) => notifyWarning(m) } }));

const setEstimate = (estimate: (() => Promise<StorageEstimate>) | undefined) => {
  Object.defineProperty(globalThis.navigator, "storage", {
    configurable: true,
    value: estimate ? { estimate } : undefined,
  });
};

beforeEach(() => {
  getStorageMock.mockReset();
  notifyWarning.mockReset();
});
afterEach(() => {
  setEstimate(undefined);
});

describe("isStorageNearlyFull", () => {
  it("true when usage/quota >= threshold", async () => {
    setEstimate(async () => ({ usage: 85, quota: 100 }));
    expect(await isStorageNearlyFull()).toBe(true);
  });

  it("false when usage/quota below threshold", async () => {
    setEstimate(async () => ({ usage: 10, quota: 100 }));
    expect(await isStorageNearlyFull()).toBe(false);
  });

  it("false when the StorageManager API is absent", async () => {
    setEstimate(undefined);
    expect(await isStorageNearlyFull()).toBe(false);
  });

  it("false when estimate returns no figures", async () => {
    setEstimate(async () => ({}) as StorageEstimate);
    expect(await isStorageNearlyFull()).toBe(false);
  });
});

describe("warnIfOfflineStorageNearlyFull", () => {
  it("warns offline (dexie) when nearly full", async () => {
    getStorageMock.mockReturnValue({ mode: "dexie" });
    setEstimate(async () => ({ usage: 95, quota: 100 }));
    await warnIfOfflineStorageNearlyFull("full!");
    expect(notifyWarning).toHaveBeenCalledWith("full!");
  });

  it("never warns online (api mode)", async () => {
    getStorageMock.mockReturnValue({ mode: "api" });
    setEstimate(async () => ({ usage: 99, quota: 100 }));
    await warnIfOfflineStorageNearlyFull("full!");
    expect(notifyWarning).not.toHaveBeenCalled();
  });
});
