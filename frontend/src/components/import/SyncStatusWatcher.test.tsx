/**
 * SyncStatusWatcher (mobile-sync Phase 3, C9).
 *
 * Pins the activation wiring: the component is headless (renders null)
 * and subscribes via useStorageMode with an onReconnect handler (which
 * drains the offline queue). Reconnect-sync behaviour itself is covered
 * by the connectivity (C2) + sync-engine (C6/C7) unit tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("../../storage/useStorageMode", () => ({
  useStorageMode: vi.fn(() => ({
    mode: "api",
    online: true,
    offlineEnabled: false,
  })),
}));

import { useStorageMode } from "../../storage/useStorageMode";
import SyncStatusWatcher from "./SyncStatusWatcher";

describe("SyncStatusWatcher", () => {
  it("is headless and wires an onReconnect handler", () => {
    const { container } = render(<SyncStatusWatcher />);
    expect(container.firstChild).toBeNull();
    expect(vi.mocked(useStorageMode)).toHaveBeenCalled();
    const opts = vi.mocked(useStorageMode).mock.calls[0][0];
    expect(typeof opts?.onReconnect).toBe("function");
  });
});
