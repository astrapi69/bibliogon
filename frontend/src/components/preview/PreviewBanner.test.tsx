/**
 * Vitest coverage for the preview/test-version banner (#642).
 *
 * The banner's visibility is driven by getBuildInfo().isPreview, a build-time
 * literal that cannot be flipped per-test — so buildInfo is mocked to drive
 * both states (the production-build literal would otherwise pin only the
 * hidden path). i18n is mocked to return the fallback verbatim.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PreviewBanner from "./PreviewBanner";

vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_key: string, fallback: string) => fallback,
    lang: "de",
    setLang: vi.fn(),
  }),
}));

const buildMock = vi.hoisted(() => ({ isPreview: false }));

vi.mock("../../lib/buildInfo", () => ({
  getBuildInfo: () => ({
    branch: "develop",
    commit: "abcdef1234567890",
    commitShort: "abcdef12",
    commitUrl: "https://github.com/astrapi69/bibliogon/commit/abcdef1234567890",
    date: "2026-06-26T19:03:03Z",
    isPreview: buildMock.isPreview,
    version: "0.58.0",
  }),
}));

describe("PreviewBanner", () => {
  beforeEach(() => {
    buildMock.isPreview = false;
  });

  it("renders the warning banner when isPreview=true", () => {
    buildMock.isPreview = true;
    render(<PreviewBanner />);
    const banner = screen.getByTestId("preview-banner");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("Vorschau-/Testversion");
    expect(banner.textContent).toContain("nicht stabil");
  });

  it("renders nothing when isPreview=false (production/local build)", () => {
    buildMock.isPreview = false;
    render(<PreviewBanner />);
    expect(screen.queryByTestId("preview-banner")).toBeNull();
  });
});
