/**
 * OfflineToggleButton (mobile-sync Phase 3, C3).
 *
 * The failure-path cases pin #769: the button must report through the
 * ``notify`` seam, not react-toastify directly, so a failure during a
 * backend outage is downgraded to a console warning instead of stacking
 * a red toast next to the persistent banner (#765).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("../../utils/platform/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));
// The component short-circuits to "not offline" unless offline capability
// is enabled, so the removal case has to turn it on.
const isOfflineEnabled = vi.fn(() => false);
vi.mock("../../storage/connectivity", () => ({
  isOfflineEnabled: () => isOfflineEnabled(),
}));

const downloadBookOffline = vi.fn().mockResolvedValue(undefined);
const removeBookOffline = vi.fn().mockResolvedValue(undefined);
const isBookOffline = vi.fn().mockResolvedValue(false);
vi.mock("../../storage/offline-download", () => ({
  downloadBookOffline,
  removeBookOffline,
  isBookOffline,
}));

import { notify } from "../../utils/platform/notify";
import { OfflineToggleButton } from "./OfflineToggleButton";

beforeEach(() => {
  vi.clearAllMocks();
  isOfflineEnabled.mockReturnValue(false);
  isBookOffline.mockResolvedValue(false);
  downloadBookOffline.mockResolvedValue(undefined);
  removeBookOffline.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("OfflineToggleButton", () => {
  it("shows 'take offline' then downloads + toasts on click", async () => {
    render(<OfflineToggleButton bookId="b1" />);

    const btn = await screen.findByTestId("offline-toggle");
    expect(btn.getAttribute("data-offline")).toBe("false");

    fireEvent.click(btn);

    await waitFor(() => expect(downloadBookOffline).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(
        screen.getByTestId("offline-toggle").getAttribute("data-offline"),
      ).toBe("true"),
    );
    expect(notify.success).toHaveBeenCalled();
  });

  it("reports a failed download through the notify seam (#769)", async () => {
    const boom = new Error("disk full");
    downloadBookOffline.mockRejectedValueOnce(boom);

    render(<OfflineToggleButton bookId="b1" />);
    fireEvent.click(await screen.findByTestId("offline-toggle"));

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(notify.success).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("offline-toggle").getAttribute("data-offline"),
    ).toBe("false");
  });

  it("passes the caught error to notify.error so it can be reported (#769)", async () => {
    const boom = new Error("disk full");
    downloadBookOffline.mockRejectedValueOnce(boom);

    render(<OfflineToggleButton bookId="b1" />);
    fireEvent.click(await screen.findByTestId("offline-toggle"));

    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(vi.mocked(notify.error).mock.calls[0][1]).toBe(boom);
  });

  it("reports a failed removal through the notify seam (#769)", async () => {
    isOfflineEnabled.mockReturnValue(true);
    isBookOffline.mockResolvedValue(true);
    removeBookOffline.mockRejectedValueOnce(new Error("locked"));

    render(<OfflineToggleButton bookId="b1" />);
    await waitFor(() =>
      expect(
        screen.getByTestId("offline-toggle").getAttribute("data-offline"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByTestId("offline-toggle"));

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1));
    expect(
      screen.getByTestId("offline-toggle").getAttribute("data-offline"),
    ).toBe("true");
  });

  it("re-enables the button after a failure so the user can retry", async () => {
    downloadBookOffline.mockRejectedValueOnce(new Error("transient"));

    render(<OfflineToggleButton bookId="b1" />);
    fireEvent.click(await screen.findByTestId("offline-toggle"));

    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (screen.getByTestId("offline-toggle") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
});
