/**
 * Tests for AppVersionUpdateBanner (#477 Phase 2).
 *
 * Mocks useUpdateAutoCheck so the pending-update + dismiss are controllable;
 * asserts the banner render, the "Later" dismiss, the "What's new?" modal,
 * and the mode-dependent update action (PWA applyUpdate vs desktop open).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import AppVersionUpdateBanner from "./AppVersionUpdateBanner";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

const mockDismiss = vi.fn();
let pending: unknown = null;
vi.mock("../../hooks/ui/useUpdateAutoCheck", () => ({
  useUpdateAutoCheck: () => ({ pending, dismiss: mockDismiss }),
}));

let mode: "api" | "dexie" = "dexie";
vi.mock("../../storage/useStorageMode", () => ({
  useStorageMode: () => ({ mode }),
}));

const mockApplyUpdate = vi.fn();
vi.mock("../../shared/utils/swUpdateManager", () => ({
  applyUpdate: () => mockApplyUpdate(),
}));

beforeEach(() => {
  mockDismiss.mockReset();
  mockApplyUpdate.mockReset();
  pending = null;
  mode = "dexie";
});

const PENDING = {
  latestVersion: "v0.57.0",
  releaseUrl: "https://example/release",
  releaseNotes: "## Highlights\n- A\n- B",
};

describe("AppVersionUpdateBanner", () => {
  it("renders nothing when no update is pending", () => {
    pending = null;
    const { container } = render(<AppVersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the version banner with the version in the message", () => {
    pending = PENDING;
    render(<AppVersionUpdateBanner />);
    expect(screen.getByTestId("update-banner")).toBeTruthy();
    expect(screen.getByTestId("update-banner").textContent).toContain("v0.57.0");
    expect(screen.getByTestId("version-banner-whats-new")).toBeTruthy();
    expect(screen.getByTestId("version-banner-later")).toBeTruthy();
  });

  it("'Later' dismisses (records dismissed_version via the hook)", () => {
    pending = PENDING;
    render(<AppVersionUpdateBanner />);
    fireEvent.click(screen.getByTestId("version-banner-later"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("the X dismiss also calls dismiss", () => {
    pending = PENDING;
    render(<AppVersionUpdateBanner />);
    fireEvent.click(screen.getByTestId("update-banner-dismiss"));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("'What's new?' opens a notes modal with the release notes", () => {
    pending = PENDING;
    render(<AppVersionUpdateBanner />);
    expect(screen.queryByTestId("version-banner-notes-modal")).toBeNull();
    fireEvent.click(screen.getByTestId("version-banner-whats-new"));
    const modal = screen.getByTestId("version-banner-notes-modal");
    expect(modal).toBeTruthy();
    expect(screen.getByTestId("version-banner-notes-body").textContent).toContain(
      "Highlights",
    );
    // Close.
    fireEvent.click(screen.getByTestId("version-banner-notes-close"));
    expect(screen.queryByTestId("version-banner-notes-modal")).toBeNull();
  });

  it("PWA (dexie): 'Update' applies the SW update", () => {
    pending = PENDING;
    mode = "dexie";
    render(<AppVersionUpdateBanner />);
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(mockApplyUpdate).toHaveBeenCalledTimes(1);
  });

  it("desktop (api): 'Update' opens the release page, not the SW update", () => {
    pending = PENDING;
    mode = "api";
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<AppVersionUpdateBanner />);
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://example/release",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mockApplyUpdate).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
