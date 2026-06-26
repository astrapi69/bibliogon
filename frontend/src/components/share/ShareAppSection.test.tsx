/**
 * Vitest coverage for the "Die App teilen" section (#643).
 *
 * Covers section visibility, client-side QR rendering (SVG present), the
 * production + preview URL targets, the open-link + copy-link actions, and
 * the preview non-stable warning. clipboard + notify are mocked at the
 * boundary; i18n returns the fallback verbatim.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareAppSection, SHARE_URLS } from "./ShareAppSection";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({ t: (_k: string, f: string) => f, lang: "de", setLang: vi.fn() }),
}));

const clipboardMock = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));
vi.mock("../../utils/platform/clipboard", () => ({
  copyToClipboard: clipboardMock.copyToClipboard,
}));

const notifyMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock("../../utils/platform/notify", () => ({ notify: notifyMock }));

const t = (_key: string, fallback: string) => fallback;

describe("ShareAppSection", () => {
  beforeEach(() => {
    clipboardMock.copyToClipboard.mockReset();
    notifyMock.success.mockReset();
    notifyMock.warning.mockReset();
  });

  it("renders the section with both share targets", () => {
    render(<ShareAppSection t={t} />);
    expect(screen.getByTestId("about-share-section")).toBeTruthy();
    expect(screen.getByTestId("share-production-block")).toBeTruthy();
    expect(screen.getByTestId("share-preview-block")).toBeTruthy();
  });

  it("renders the production + preview URLs", () => {
    render(<ShareAppSection t={t} />);
    expect(screen.getByTestId("share-production-url").textContent).toBe(
      SHARE_URLS.production,
    );
    expect(screen.getByTestId("share-preview-url").textContent).toBe(
      SHARE_URLS.preview,
    );
  });

  it("renders a QR SVG only after the QR toggle is clicked (production)", () => {
    render(<ShareAppSection t={t} />);
    // Collapsed by default.
    expect(screen.queryByTestId("share-production-qr")).toBeNull();
    fireEvent.click(screen.getByTestId("share-production-qr-toggle"));
    const qr = screen.getByTestId("share-production-qr");
    expect(qr.querySelector("svg")).toBeTruthy();
  });

  it("renders a QR SVG for the preview target", () => {
    render(<ShareAppSection t={t} />);
    fireEvent.click(screen.getByTestId("share-preview-qr-toggle"));
    const qr = screen.getByTestId("share-preview-qr");
    expect(qr.querySelector("svg")).toBeTruthy();
  });

  it("opens the production URL in a new tab on 'Link öffnen'", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ShareAppSection t={t} />);
    fireEvent.click(screen.getByTestId("share-production-open"));
    expect(openSpy).toHaveBeenCalledWith(
      SHARE_URLS.production,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("copies the URL to the clipboard and toasts on success", async () => {
    clipboardMock.copyToClipboard.mockResolvedValue(true);
    render(<ShareAppSection t={t} />);
    fireEvent.click(screen.getByTestId("share-preview-copy"));
    await waitFor(() =>
      expect(clipboardMock.copyToClipboard).toHaveBeenCalledWith(SHARE_URLS.preview),
    );
    await waitFor(() => expect(notifyMock.success).toHaveBeenCalled());
  });

  it("shows the preview non-stable warning", () => {
    render(<ShareAppSection t={t} />);
    const warning = screen.getByTestId("share-preview-warning");
    expect(warning.textContent).toContain("nicht stabil");
  });
});
