/**
 * OfflineToggleButton (mobile-sync Phase 3, C3).
 *
 * The failure-path case is the #769 regression pin: this component used to
 * call react-toastify's `toast.error` directly, so during a backend outage
 * it raised a red toast right next to the persistent "Backend nicht
 * erreichbar" banner. Routing through `notify` picks up the outage
 * suppression, so the real `notify` module is deliberately NOT mocked here
 * — only react-toastify underneath it is. A test that mocked `notify`
 * would pass either way and prove nothing.
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
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("../../storage/connectivity", () => ({ isOfflineEnabled: () => false }));

const downloadBookOffline = vi.fn().mockResolvedValue(undefined);
const removeBookOffline = vi.fn().mockResolvedValue(undefined);
const isBookOffline = vi.fn().mockResolvedValue(false);
vi.mock("../../storage/offline-download", () => ({
  downloadBookOffline,
  removeBookOffline,
  isBookOffline,
}));

import { toast } from "react-toastify";
import { backendReachability } from "../../api/backendReachability";
import { OfflineToggleButton } from "./OfflineToggleButton";

beforeEach(() => {
  vi.clearAllMocks();
  downloadBookOffline.mockResolvedValue(undefined);
  backendReachability.resetForTests();
});
afterEach(() => {
  backendReachability.resetForTests();
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
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts the failure while the backend is reachable", async () => {
    downloadBookOffline.mockRejectedValue(new Error("disk full"));
    render(<OfflineToggleButton bookId="b1" />);

    fireEvent.click(await screen.findByTestId("offline-toggle"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  });

  it("stays silent during a backend outage (#769)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    downloadBookOffline.mockRejectedValue(new Error("Failed to fetch"));
    backendReachability.reportNetworkFailure();

    render(<OfflineToggleButton bookId="b1" />);
    fireEvent.click(await screen.findByTestId("offline-toggle"));

    await waitFor(() => expect(downloadBookOffline).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
