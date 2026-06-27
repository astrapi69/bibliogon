/**
 * Smoke test for the Statistics dashboard route
 * (WRITING-STATS-DASHBOARD-01).
 *
 *   - deep-link: /statistics renders the dashboard page shell
 *   - the page shows either the populated dashboard or the empty state,
 *     depending on whether the test DB has writing sessions (both satisfy
 *     "the page rendered")
 *   - back button returns to the dashboard
 *   - mobile viewport renders without horizontal overflow
 *
 * data-testid selectors only. Writing sessions are not seedable via the
 * API, so a fresh test DB hits the empty state; that is the expected path
 * here.
 */

import {test, expect} from "../fixtures/base";

test("deep-link to /statistics renders the dashboard page", async ({page}) => {
    await page.goto("/statistics");
    await expect(page.getByTestId("statistics-dashboard-page")).toBeVisible();
    const populated = page.getByTestId("statistics-dashboard");
    const empty = page.getByTestId("stats-empty");
    await expect(populated.or(empty)).toBeVisible();
});

test("back button returns to the dashboard", async ({page}) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard-header")).toBeVisible();
    await page.goto("/statistics");
    await expect(page).toHaveURL(/\/statistics/);
    await page.getByTestId("statistics-dashboard-page-back").click();
    await expect(page).not.toHaveURL(/\/statistics/);
    await expect(page.getByTestId("dashboard-header")).toBeVisible();
});

test("renders on a mobile viewport without overflow", async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto("/statistics");
    const shell = page.getByTestId("statistics-dashboard-page");
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
