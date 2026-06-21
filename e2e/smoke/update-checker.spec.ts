/**
 * Update-Checker Phase 2 E2E (#477 / #480).
 *
 * Drives the background GitHub-Releases auto-check + version banner with a
 * mocked GitHub API, against the standard backend harness (API mode — the
 * desktop/GH-API path). Covers the acceptance criteria from #480:
 *
 * - new release detected -> non-blocking banner appears
 * - "Spaeter" dismisses + the version stays dismissed across a reload
 * - auto-check OFF -> no banner (interval/config respected)
 * - interval not yet due -> no check, no banner
 * - up to date -> no banner
 *
 * The PWA Service-Worker redeploy path is covered by the existing
 * swUpdateManager unit tests + AppUpdateBanner; this spec pins the
 * GitHub-API version banner that is the only update signal on desktop.
 *
 * jsdom cannot exercise the App-root mount + real fetch timing, so this
 * lives in Playwright. Aster runs it.
 */

import { test, expect } from "../fixtures/base";

const API = "http://localhost:8000/api";
const GH_LATEST = "https://api.github.com/repos/astrapi69/bibliogon/releases/latest";

async function setUpdatesSettings(updates: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API}/settings/app`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    throw new Error(`PATCH settings: ${res.status} ${await res.text()}`);
  }
}

function mockRelease(tag: string) {
  return {
    tag_name: tag,
    html_url: `https://github.com/astrapi69/bibliogon/releases/tag/${tag}`,
    body: "## Highlights\n- Mocked release note",
    published_at: "2026-06-21T00:00:00Z",
  };
}

test.describe("Update-Checker Phase 2 (#477)", () => {
  test("new release -> banner appears; 'Spaeter' dismisses + stays dismissed on reload", async ({
    page,
  }) => {
    await setUpdatesSettings({
      auto_check: true,
      check_interval: "daily",
      last_check_at: null,
      dismissed_version: null,
    });
    await page.route(GH_LATEST, (route) =>
      route.fulfill({ json: mockRelease("v99.0.0") }),
    );

    await page.goto("/");
    const banner = page.getByTestId("update-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("v99.0.0");

    // "Spaeter" hides the banner.
    await page.getByTestId("version-banner-later").click();
    await expect(banner).toBeHidden();

    // Reload: the dismissed version stays hidden.
    await page.reload();
    await expect(page.getByTestId("update-banner")).toBeHidden();
  });

  test("'What's new?' opens the release-notes modal", async ({ page }) => {
    await setUpdatesSettings({
      auto_check: true,
      check_interval: "daily",
      last_check_at: null,
      dismissed_version: null,
    });
    await page.route(GH_LATEST, (route) =>
      route.fulfill({ json: mockRelease("v99.1.0") }),
    );

    await page.goto("/");
    await expect(page.getByTestId("update-banner")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("version-banner-whats-new").click();
    const modal = page.getByTestId("version-banner-notes-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Highlights");
    await page.getByTestId("version-banner-notes-close").click();
    await expect(modal).toBeHidden();
  });

  test("auto-check OFF -> no banner even when a newer release is published", async ({
    page,
  }) => {
    await setUpdatesSettings({
      auto_check: false,
      check_interval: "daily",
      last_check_at: null,
      dismissed_version: null,
    });
    let ghCalled = false;
    await page.route(GH_LATEST, (route) => {
      ghCalled = true;
      return route.fulfill({ json: mockRelease("v99.0.0") });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("update-banner")).toBeHidden();
    expect(ghCalled).toBe(false);
  });

  test("interval not due -> no check, no banner", async ({ page }) => {
    await setUpdatesSettings({
      auto_check: true,
      check_interval: "daily",
      last_check_at: new Date().toISOString(),
      dismissed_version: null,
    });
    let ghCalled = false;
    await page.route(GH_LATEST, (route) => {
      ghCalled = true;
      return route.fulfill({ json: mockRelease("v99.0.0") });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("update-banner")).toBeHidden();
    expect(ghCalled).toBe(false);
  });

  test("up to date -> no banner", async ({ page }) => {
    await setUpdatesSettings({
      auto_check: true,
      check_interval: "daily",
      last_check_at: null,
      dismissed_version: null,
    });
    await page.route(GH_LATEST, (route) =>
      // A very low tag is never newer than the running build.
      route.fulfill({ json: mockRelease("v0.0.1") }),
    );

    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("update-banner")).toBeHidden();
  });
});
