/**
 * Settings > About > "Die App teilen" smoke (#643).
 *
 * Pins the live-stack behaviour of the share-app section: the two share
 * targets render, the QR codes generate client-side (SVG) on demand, and
 * the preview target carries the non-stable warning. Client-side QR
 * generation (qrcode.react) means this works without a backend QR endpoint
 * — unlike LAN mode's /api/lan-auth/qr.svg.
 *
 * Coverage:
 * 1. The share section + both target blocks are visible.
 * 2. The production + preview URLs are shown.
 * 3. Toggling a QR renders an inline SVG (collapsed by default).
 * 4. The preview block carries the "nicht stabil" warning.
 */

import {test, expect} from "../fixtures/base";

test.describe("Settings > About > Die App teilen (#643)", () => {
    test("renders both share targets with on-demand client-side QR", async ({page}) => {
        await page.goto("/settings?tab=about");

        const section = page.getByTestId("about-share-section");
        await expect(section).toBeVisible({timeout: 5000});
        await expect(page.getByTestId("share-production-block")).toBeVisible();
        await expect(page.getByTestId("share-preview-block")).toBeVisible();

        // URLs shown for both targets.
        await expect(page.getByTestId("share-production-url")).toContainText(
            "astrapi69.github.io/bibliogon/",
        );
        await expect(page.getByTestId("share-preview-url")).toContainText(
            "astrapi69.github.io/bibliogon-preview/",
        );

        // QR collapsed by default; toggle reveals an inline SVG.
        await expect(page.getByTestId("share-production-qr")).toHaveCount(0);
        await page.getByTestId("share-production-qr-toggle").click();
        const qr = page.getByTestId("share-production-qr");
        await expect(qr).toBeVisible();
        await expect(qr.locator("svg")).toBeVisible();

        // Preview target carries the non-stable warning.
        await expect(page.getByTestId("share-preview-warning")).toContainText(
            "nicht stabil",
        );
    });
});
