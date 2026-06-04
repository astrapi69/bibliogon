/**
 * OfflineToggleButton (mobile-sync Phase 3, C3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../storage/connectivity", () => ({ isOfflineEnabled: () => false }));

const downloadBookOffline = vi.fn().mockResolvedValue(undefined);
const removeBookOffline = vi.fn().mockResolvedValue(undefined);
const isBookOffline = vi.fn().mockResolvedValue(false);
vi.mock("../storage/offline-download", () => ({
  downloadBookOffline,
  removeBookOffline,
  isBookOffline,
}));

import { toast } from "react-toastify";
import { OfflineToggleButton } from "./OfflineToggleButton";

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(toast.success).toHaveBeenCalled();
  });
});
