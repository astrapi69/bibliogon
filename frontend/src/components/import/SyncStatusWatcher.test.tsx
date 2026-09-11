/**
 * SyncStatusWatcher (mobile-sync Phase 3, C9).
 *
 * Pins the activation wiring: the component is headless (renders null)
 * and subscribes via useStorageMode with an onReconnect handler (which
 * drains the offline queue). Reconnect-sync behaviour itself is covered
 * by the connectivity (C2) + sync-engine (C6/C7) unit tests.
 *
 * The outcome cases pin #769: the reconnect report goes through the
 * ``notify`` seam, not react-toastify directly. A partial-sync failure
 * during a backend outage must downgrade to a console warning rather
 * than stack a red toast next to the persistent banner (#765) — and a
 * reconnect drain is exactly when the backend is likeliest to be flaky.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("../../utils/platform/notify", () => ({
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("../../storage/useStorageMode", () => ({
  useStorageMode: vi.fn(() => ({
    mode: "api",
    online: true,
    offlineEnabled: false,
  })),
}));

const processSyncQueue = vi.fn();
vi.mock("../../storage/sync-engine", () => ({ processSyncQueue }));

import { notify } from "../../utils/platform/notify";
import { useStorageMode } from "../../storage/useStorageMode";
import SyncStatusWatcher from "./SyncStatusWatcher";

/** Render the watcher and return the registered onReconnect handler. */
async function reconnectWith(result: {
  synced: number;
  failed: number;
  conflicts: unknown[];
}) {
  processSyncQueue.mockResolvedValue(result);
  render(<SyncStatusWatcher />);
  const opts = vi.mocked(useStorageMode).mock.calls[0][0];
  await opts!.onReconnect!();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SyncStatusWatcher", () => {
  it("is headless and wires an onReconnect handler", () => {
    const { container } = render(<SyncStatusWatcher />);
    expect(container.firstChild).toBeNull();
    expect(vi.mocked(useStorageMode)).toHaveBeenCalled();
    const opts = vi.mocked(useStorageMode).mock.calls[0][0];
    expect(typeof opts?.onReconnect).toBe("function");
  });

  it("reports synced chapters through the notify seam (#769)", async () => {
    await reconnectWith({ synced: 3, failed: 0, conflicts: [] });
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify.success).mock.calls[0][0]).toContain("3");
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("reports a partial-sync failure through the notify seam (#769)", async () => {
    await reconnectWith({ synced: 0, failed: 2, conflicts: [] });
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("reports conflicts through the notify seam (#769)", async () => {
    await reconnectWith({ synced: 1, failed: 0, conflicts: [{ id: "c1" }] });
    expect(notify.warning).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the queue drained with nothing to report", async () => {
    await reconnectWith({ synced: 0, failed: 0, conflicts: [] });
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.warning).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });
});
