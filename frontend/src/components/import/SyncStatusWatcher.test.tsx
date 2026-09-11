/**
 * SyncStatusWatcher — reconnect-sync outcome toasts (P3-C9), and the #769
 * regression pin.
 *
 * The component is headless, so the test drives it through the captured
 * `onReconnect` callback that `useStorageMode` receives. As in
 * OfflineToggleButton.test.tsx the real `notify` module runs and only
 * react-toastify underneath it is mocked: the bug was that this watcher
 * called `toast.error` / `toast.warning` directly, which bypassed the
 * backend-unreachable suppression. Mocking `notify` would hide that.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

let capturedOnReconnect: (() => Promise<void>) | null = null;
vi.mock("../../storage/useStorageMode", () => ({
  useStorageMode: ({ onReconnect }: { onReconnect: () => Promise<void> }) => {
    capturedOnReconnect = onReconnect;
    return { mode: "api" };
  },
}));

const processSyncQueue = vi.fn();
vi.mock("../../storage/sync-engine", () => ({ processSyncQueue }));

import { toast } from "react-toastify";
import { backendReachability } from "../../api/backendReachability";
import SyncStatusWatcher from "./SyncStatusWatcher";

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnReconnect = null;
  backendReachability.resetForTests();
});
afterEach(() => {
  backendReachability.resetForTests();
  vi.restoreAllMocks();
});

describe("SyncStatusWatcher", () => {
  it("is headless and wires an onReconnect handler", () => {
    const { container } = render(<SyncStatusWatcher />);
    expect(container.firstChild).toBeNull();
    expect(typeof capturedOnReconnect).toBe("function");
  });

  it("reports a successful drain", async () => {
    processSyncQueue.mockResolvedValue({ synced: 3, failed: 0, conflicts: [] });
    render(<SyncStatusWatcher />);

    await capturedOnReconnect!();

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports conflicts and failures while the backend is reachable", async () => {
    processSyncQueue.mockResolvedValue({
      synced: 0,
      failed: 2,
      conflicts: [{ chapterId: "c1" }],
    });
    render(<SyncStatusWatcher />);

    await capturedOnReconnect!();

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("stays silent during a backend outage (#769)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    processSyncQueue.mockResolvedValue({ synced: 0, failed: 2, conflicts: [] });
    backendReachability.reportNetworkFailure();
    render(<SyncStatusWatcher />);

    await capturedOnReconnect!();

    expect(toast.error).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
