/**
 * Tests for useUpdateAutoCheck (#477 Phase 2).
 *
 * Mocks the storage seam (settings.getApp/updateApp) + the GitHub
 * checkForUpdate; keeps the pure isCheckDue/shouldShowBanner real so the
 * interval + dismiss logic is exercised end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useUpdateAutoCheck } from "./useUpdateAutoCheck";

const mockGetApp = vi.fn();
const mockUpdateApp = vi.fn();
vi.mock("../../storage", () => ({
  getStorage: () => ({
    settings: {
      getApp: (...a: unknown[]) => mockGetApp(...a),
      updateApp: (...a: unknown[]) => mockUpdateApp(...a),
    },
  }),
}));

const mockCheckForUpdate = vi.fn();
vi.mock("../../lib/utils/updateChecker", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/utils/updateChecker")
  >("../../lib/utils/updateChecker");
  return { ...actual, checkForUpdate: (...a: unknown[]) => mockCheckForUpdate(...a) };
});

function appConfig(updates: Record<string, unknown>) {
  return { updates };
}

const UPDATE_RESULT = {
  status: "update-available" as const,
  currentVersion: "0.56.0",
  latestVersion: "v9.9.9",
  releaseUrl: "https://example/r",
  releaseNotes: "Notes",
};

beforeEach(() => {
  mockGetApp.mockReset();
  mockUpdateApp.mockReset().mockResolvedValue({});
  mockCheckForUpdate.mockReset().mockResolvedValue(UPDATE_RESULT);
});

describe("useUpdateAutoCheck", () => {
  it("runs a check when auto-check is on and the interval has elapsed", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({ auto_check: true, check_interval: "daily", last_check_at: null }),
    );
    const { result } = renderHook(() => useUpdateAutoCheck());
    await waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pending?.latestVersion).toBe("v9.9.9"));
    // last_check_at persisted.
    await waitFor(() => expect(mockUpdateApp).toHaveBeenCalled());
    const saved = mockUpdateApp.mock.calls[0][0].updates;
    expect(typeof saved.last_check_at).toBe("string");
  });

  it("does NOT check when the interval has not elapsed", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({
        auto_check: true,
        check_interval: "daily",
        last_check_at: new Date().toISOString(),
      }),
    );
    renderHook(() => useUpdateAutoCheck());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });

  it("does NOT check when auto-check is off", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({ auto_check: false, check_interval: "daily", last_check_at: null }),
    );
    renderHook(() => useUpdateAutoCheck());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });

  it("does NOT check when the interval is 'never'", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({ auto_check: true, check_interval: "never", last_check_at: null }),
    );
    renderHook(() => useUpdateAutoCheck());
    await new Promise((r) => setTimeout(r, 20));
    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });

  it("shows no banner when the latest version was already dismissed", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({
        auto_check: true,
        check_interval: "daily",
        last_check_at: null,
        dismissed_version: "v9.9.9",
      }),
    );
    const { result } = renderHook(() => useUpdateAutoCheck());
    await waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.pending).toBeNull();
  });

  it("shows the banner again once a strictly newer version ships after a dismiss", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({
        auto_check: true,
        check_interval: "daily",
        last_check_at: null,
        dismissed_version: "v0.56.0",
      }),
    );
    const { result } = renderHook(() => useUpdateAutoCheck());
    await waitFor(() => expect(result.current.pending?.latestVersion).toBe("v9.9.9"));
  });

  it("shows no banner when up to date", async () => {
    mockCheckForUpdate.mockResolvedValue({
      status: "up-to-date",
      currentVersion: "9.9.9",
    });
    mockGetApp.mockResolvedValue(
      appConfig({ auto_check: true, check_interval: "daily", last_check_at: null }),
    );
    const { result } = renderHook(() => useUpdateAutoCheck());
    await waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.pending).toBeNull();
  });

  it("dismiss() persists the dismissed version and clears the banner", async () => {
    mockGetApp.mockResolvedValue(
      appConfig({ auto_check: true, check_interval: "daily", last_check_at: null }),
    );
    const { result } = renderHook(() => useUpdateAutoCheck());
    await waitFor(() => expect(result.current.pending?.latestVersion).toBe("v9.9.9"));
    mockUpdateApp.mockClear();
    result.current.dismiss();
    await waitFor(() => expect(result.current.pending).toBeNull());
    await waitFor(() =>
      expect(
        mockUpdateApp.mock.calls.some(
          (c) => c[0]?.updates?.dismissed_version === "v9.9.9",
        ),
      ).toBe(true),
    );
  });
});
