/**
 * View-switcher right-alignment smoke (VIEW-SWITCHER-RIGHT-01, #261).
 *
 * Regression-pin for the audit finding that the Kacheln/Liste
 * view-switcher (`view-toggle`) sat immediately after the count on
 * the LEFT of the main header in the Article-Dashboard
 * (`ArticleList.tsx`) and Book-Dashboard (`Dashboard.tsx`), while
 * the Papierkorb header already right-aligned it via a `flex: 1`
 * spacer. The fix adds the same spacer so all three surfaces match
 * the UK/industry standard (GitHub, Notion, Drive, Figma): view
 * controls live on the RIGHT.
 *
 * This is a CSS-positioning contract that Vitest/jsdom cannot see
 * (no layout engine), so it must ship as a Playwright spec
 * (Playwright-visible != user-visible -> assert bounding-box
 * geometry, not just visibility). If a future refactor drops the
 * spacer, the toggle slides left and these assertions fail.
 */

import { test, expect, createBook, createArticle } from "../fixtures/base";
import type { Page, Locator } from "@playwright/test";

async function assertRightAligned(
  header: Locator,
  toggle: Locator,
): Promise<void> {
  await expect(toggle).toBeVisible();
  const headerBox = await header.boundingBox();
  const toggleBox = await toggle.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  const toggleCenter = toggleBox!.x + toggleBox!.width / 2;
  // The toggle's center must fall in the right 40% of the header
  // row. Pre-fix it sat just after the count, well left of this.
  expect(toggleCenter).toBeGreaterThan(headerBox!.x + headerBox!.width * 0.6);
  // And its right edge hugs the header's right edge (within 24px).
  const headerRight = headerBox!.x + headerBox!.width;
  const toggleRight = toggleBox!.x + toggleBox!.width;
  expect(headerRight - toggleRight).toBeLessThan(24);
}

test.describe("View-switcher right-alignment", () => {
  test("Book-Dashboard view-toggle is right-aligned in the main header", async ({
    page,
  }: {
    page: Page;
  }) => {
    await createBook("View Switcher BD Smoke");
    await page.goto("/");

    const header = page.getByTestId("dashboard-main-header");
    await expect(header).toBeVisible();
    await assertRightAligned(header, header.getByTestId("view-toggle"));
  });

  test("Article-Dashboard view-toggle is right-aligned in the main header", async ({
    page,
  }: {
    page: Page;
  }) => {
    await createArticle("View Switcher AD Smoke");
    await page.goto("/articles");

    const header = page.getByTestId("article-list-main-header");
    await expect(header).toBeVisible();
    await assertRightAligned(header, header.getByTestId("view-toggle"));
  });
});
