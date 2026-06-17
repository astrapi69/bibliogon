/**
 * Authors-Database toolbar responsiveness (#authors-db-mobile).
 *
 * Settings → Autoren → Autoren-Datenbank: the action toolbar (search +
 * Hinzufügen + Autoren exportieren + Autoren importieren) used to be a
 * single non-wrapping flex row; on a 375px viewport the last button
 * ("Autoren importieren") overflowed the container and was clipped /
 * unclickable. The toolbar now wraps (flex-wrap), so every button stays
 * inside the viewport.
 *
 * `Playwright-visible != User-visible`: the reachability checks assert
 * `toBeInViewport()` (the button is inside the visible viewport box), not
 * merely present in the DOM.
 */

import {test, expect} from "../fixtures/base";
import type {Page} from "@playwright/test";

const MOBILE = {width: 375, height: 800};
const DESKTOP = {width: 1440, height: 900};

const ACTION_TESTIDS = [
    "authors-database-add-toggle",
    "authors-database-export",
    "authors-database-import",
];

async function openAuthorsTab(page: Page) {
    await page.goto("/settings?tab=autoren");
    await expect(page.getByTestId("authors-database-section")).toBeVisible();
}

test.describe("Authors-Database toolbar (mobile)", () => {
    test("all action buttons are inside the viewport at 375px", async ({page}) => {
        await page.setViewportSize(MOBILE);
        await openAuthorsTab(page);

        for (const testId of ACTION_TESTIDS) {
            const btn = page.getByTestId(testId);
            await expect(btn).toBeVisible();
            await expect(btn, `${testId} should be inside the viewport`).toBeInViewport();
        }
    });

    test("the import button (last) does not overflow the toolbar container", async ({page}) => {
        await page.setViewportSize(MOBILE);
        await openAuthorsTab(page);

        const importBtn = page.getByTestId("authors-database-import");
        const box = await importBtn.boundingBox();
        expect(box).not.toBeNull();
        // The button's right edge stays within the viewport width.
        expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE.width + 1);
    });

    test("action buttons meet the 44px touch-target minimum on mobile", async ({page}) => {
        await page.setViewportSize(MOBILE);
        await openAuthorsTab(page);

        for (const testId of ACTION_TESTIDS) {
            const box = await page.getByTestId(testId).boundingBox();
            expect(box).not.toBeNull();
            expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(44);
        }
    });

    test("desktop keeps the toolbar on a single row", async ({page}) => {
        await page.setViewportSize(DESKTOP);
        await openAuthorsTab(page);

        // On a wide viewport the search input and all three buttons share
        // one row (their vertical centers line up within a small tolerance).
        const boxes = await Promise.all(
            ["authors-database-search", ...ACTION_TESTIDS].map(async (id) => {
                const box = await page.getByTestId(id).boundingBox();
                expect(box).not.toBeNull();
                return box!;
            }),
        );
        const centers = boxes.map((b) => b.y + b.height / 2);
        const min = Math.min(...centers);
        const max = Math.max(...centers);
        expect(max - min).toBeLessThanOrEqual(8);
    });
});
