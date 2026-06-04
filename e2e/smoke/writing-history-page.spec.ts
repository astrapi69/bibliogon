/**
 * Smoke test for the WritingHistoryPage route (Dialog->Pages migration C5).
 *
 * WritingHistoryModal became a deep-linkable full page at the top-level
 * `/writing-history` (the view is global across all books, not per-book).
 *   - deep-link: the URL renders the history view directly
 *   - the Dashboard Writing-Goal widget routes here
 *   - back button returns to the dashboard
 *   - mobile viewport renders without overflow
 *
 * data-testid selectors only. The view shows either the summary or the
 * empty state depending on whether the test DB has writing sessions; both
 * satisfy "the view rendered".
 */

import {test, expect} from "../fixtures/base";

test("deep-link to /writing-history renders the history view", async ({page}) => {
    await page.goto("/writing-history");
    await expect(page.getByTestId("writing-history-page")).toBeVisible();
    await expect(page.getByTestId("writing-history-view")).toBeVisible();
    // Window controls are always present regardless of data.
    await expect(page.getByTestId("writing-history-window-90")).toBeVisible();
});

test("back button returns to the dashboard", async ({page}) => {
    await page.goto("/");
    // The Writing-Goal widget mounts on the dashboard; its Verlauf button
    // routes to the history page.
    const open = page.getByTestId("writing-goal-history-open");
    await open.waitFor({state: "visible"});
    await open.click();
    await expect(page).toHaveURL(/\/writing-history/);
    await page.getByTestId("writing-history-page-back").click();
    await expect(page).not.toHaveURL(/\/writing-history/);
    await expect(page.getByTestId("writing-goal-history-open")).toBeVisible();
});

test("renders on a mobile viewport without overflow", async ({page}) => {
    await page.setViewportSize({width: 375, height: 800});
    await page.goto("/writing-history");
    const controls = page.getByTestId("writing-history-window-90");
    await expect(controls).toBeVisible();
    const box = await controls.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
