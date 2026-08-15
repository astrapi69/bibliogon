/**
 * iOS standalone "needs full restart" update hint (item 4).
 *
 * On an installed iOS PWA a reload does not activate the new worker, so both
 * update banners swap their post-apply message to a "close and reopen the app"
 * hint instead of a spinner that implies an imminent reload. Isolated alongside
 * needsFullRestart.ts so a later @astrapi69/pwa-update adoption can delete the
 * trio (helper + this spec) together.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

let needsRestart = false;
vi.mock("./needsFullRestart", () => ({
  needsFullRestartToUpdate: () => needsRestart,
}));

let pending: unknown = null;
vi.mock("../../../hooks/ui/useUpdateAutoCheck", () => ({
  useUpdateAutoCheck: () => ({ pending, dismiss: vi.fn() }),
}));

let mode: "api" | "dexie" = "dexie";
vi.mock("../../../storage/useStorageMode", () => ({
  useStorageMode: () => ({ mode }),
}));

const applyUpdate = vi.fn();
vi.mock("../../../shared/utils/swUpdateManager", () => ({
  subscribeToUpdates: (cb: (available: boolean) => void) => {
    cb(true);
    return () => {};
  },
  checkForUpdate: vi.fn(),
  applyUpdate: () => applyUpdate(),
}));

const RESTART_HINT = "Please fully close and reopen the app to finish updating.";

beforeEach(() => {
  needsRestart = false;
  pending = null;
  mode = "dexie";
  applyUpdate.mockReset();
});

function renderSwBanner() {
  return render(
    <MemoryRouter>
      <ReleaseBannerProvider>
        <AppUpdateBanner />
      </ReleaseBannerProvider>
    </MemoryRouter>,
  );
}

describe("iOS needs-full-restart update hint (item 4)", () => {
  it("SW banner: shows the restart hint (and keeps dismiss) after applying on an iOS standalone PWA", () => {
    needsRestart = true;
    renderSwBanner();
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(screen.getByTestId("update-banner").textContent).toContain(RESTART_HINT);
    expect(screen.queryByTestId("update-banner-dismiss")).not.toBeNull();
  });

  it("SW banner: shows the normal updating message (dismiss suppressed) off iOS", () => {
    needsRestart = false;
    renderSwBanner();
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(screen.getByTestId("update-banner").textContent).not.toContain(RESTART_HINT);
    expect(screen.queryByTestId("update-banner-dismiss")).toBeNull();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("release banner (PWA): shows the restart hint after applying on an iOS standalone PWA", () => {
    needsRestart = true;
    pending = { latestVersion: "v0.60.0", releaseUrl: "https://example/release", releaseNotes: "" };
    render(
      <MemoryRouter>
        <ReleaseBannerProvider>
          <AppVersionUpdateBanner />
        </ReleaseBannerProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(screen.getByTestId("update-banner").textContent).toContain(RESTART_HINT);
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });
});
