/**
 * Coordination between AppUpdateBanner (SW waiting worker) and
 * AppVersionUpdateBanner (GitHub release) — issue #696.
 *
 * In the PWA a single deploy fires both signals. Both render an
 * `update-banner` testid, so the regression pin is: with a release pending,
 * exactly ONE `update-banner` is on screen (the SW banner steps aside), and it
 * is the richer release banner (it carries the "What's new?" action).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppUpdateBanner from "../AppUpdateBanner";
import AppVersionUpdateBanner from "../AppVersionUpdateBanner";
import { ReleaseBannerProvider } from "./ReleaseBannerContext";

vi.mock("../../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

let pending: unknown = null;
vi.mock("../../../hooks/ui/useUpdateAutoCheck", () => ({
  useUpdateAutoCheck: () => ({ pending, dismiss: vi.fn() }),
}));

let mode: "api" | "dexie" = "dexie";
vi.mock("../../../storage/useStorageMode", () => ({
  useStorageMode: () => ({ mode }),
}));

vi.mock("../../../shared/utils/swUpdateManager", () => ({
  subscribeToUpdates: (cb: (available: boolean) => void) => {
    cb(true);
    return () => {};
  },
  checkForUpdate: vi.fn(),
  applyUpdate: vi.fn(),
}));

function renderBoth() {
  return render(
    <MemoryRouter>
      <ReleaseBannerProvider>
        <AppUpdateBanner />
        <AppVersionUpdateBanner />
      </ReleaseBannerProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  pending = null;
  mode = "dexie";
});

describe("update banner coordination (#696)", () => {
  it("shows the SW banner when no release is pending", () => {
    pending = null;
    renderBoth();
    expect(screen.getAllByTestId("update-banner")).toHaveLength(1);
    expect(screen.queryByTestId("version-banner-whats-new")).toBeNull();
  });

  it("suppresses the SW banner while a release banner is pending", () => {
    pending = {
      latestVersion: "v0.60.0",
      releaseUrl: "https://example/release",
      releaseNotes: "",
    };
    renderBoth();
    expect(screen.getAllByTestId("update-banner")).toHaveLength(1);
    expect(screen.getByTestId("version-banner-whats-new")).toBeTruthy();
  });
});
