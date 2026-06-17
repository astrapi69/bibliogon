/**
 * Mobile header polish regression pins (#392 + #393).
 *
 * #392: the "Bibliogon" wordmark in the app header is `hidden sm:inline`,
 * so below the Tailwind `sm` breakpoint (640px) only the BookOpen icon
 * shows. Desktop/tablet keep icon + text.
 *
 * #393: the "Zuletzt bearbeitet" (Recent Documents) chip strip uses
 * `flex-wrap` instead of `overflow-x-auto`, so it never forces a
 * horizontal scrollbar - not even with a single item.
 *
 * `Playwright-visible != User-visible`: the brand assertions use
 * toBeVisible()/toBeHidden() (the element is always in the DOM, CSS
 * `display` toggles it); the recent-docs assertion compares scrollWidth
 * vs clientWidth to detect a real horizontal overflow rather than just
 * checking the element exists.
 */

import {test, expect, createBook} from "../fixtures/base";
import type {Page} from "@playwright/test";

const MOBILE = 375; // iPhone SE - below the sm (640px) breakpoint
const TABLET = 768; // above sm
const DESKTOP = 1440;

const PALETTES = [
    "warm-literary",
    "cool-modern",
    "nord",
    "classic",
    "studio",
    "notebook",
] as const;

async function seedPalette(page: Page, palette: string) {
    await page.addInitScript((value) => {
        window.localStorage.setItem("bibliogon-app-theme", value);
    }, palette);
}

function brand(page: Page) {
    return page.getByTestId("dashboard-header").getByText("Bibliogon");
}

test.describe("#392 - brand text hidden on mobile, visible on tablet/desktop", () => {
    test("desktop shows icon + Bibliogon text", async ({page}) => {
        await page.setViewportSize({width: DESKTOP, height: 900});
        await page.goto("/");
        await expect(page.getByTestId("dashboard-header")).toBeVisible();
        await expect(brand(page)).toBeVisible();
    });

    test("mobile (375px) shows only the icon, no text", async ({page}) => {
        await page.setViewportSize({width: MOBILE, height: 800});
        await page.goto("/");
        await expect(page.getByTestId("dashboard-header")).toBeVisible();
        await expect(brand(page)).toBeHidden();
    });

    test("tablet (768px) shows icon + text (above the sm breakpoint)", async ({page}) => {
        await page.setViewportSize({width: TABLET, height: 900});
        await page.goto("/");
        await expect(page.getByTestId("dashboard-header")).toBeVisible();
        await expect(brand(page)).toBeVisible();
    });

    test("brand visibility is viewport-driven across all 6 palettes", async ({page}) => {
        for (const palette of PALETTES) {
            await seedPalette(page, palette);

            await page.setViewportSize({width: MOBILE, height: 800});
            await page.goto("/");
            await expect(
                brand(page),
                `brand should be hidden at ${MOBILE}px in palette ${palette}`,
            ).toBeHidden();

            await page.setViewportSize({width: DESKTOP, height: 900});
            await expect(
                brand(page),
                `brand should be visible at ${DESKTOP}px in palette ${palette}`,
            ).toBeVisible();
        }
    });
});

test.describe("#393 - Recent Documents never forces a horizontal scrollbar", () => {
    test("a single recent item does not overflow horizontally on mobile", async ({page}) => {
        // Guarantee at least one recent document so the strip renders.
        await createBook("Recent Docs Probe");

        await page.setViewportSize({width: MOBILE, height: 800});
        await page.goto("/");

        const strip = page.getByTestId("recent-documents");
        await expect(strip).toBeVisible();

        const overflow = await strip.evaluate((el) => {
            const inner = el.querySelector("div");
            if (!inner) return {scroll: 0, client: 0};
            return {scroll: inner.scrollWidth, client: inner.clientWidth};
        });
        // No horizontal overflow -> no scrollbar.
        expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    });

    test("the chip strip wraps (flex-wrap), it is not an x-scroll container", async ({page}) => {
        await createBook("Recent Docs Wrap Probe");

        await page.setViewportSize({width: MOBILE, height: 800});
        await page.goto("/");

        const strip = page.getByTestId("recent-documents");
        await expect(strip).toBeVisible();

        const styles = await strip.evaluate((el) => {
            const inner = el.querySelector("div") as HTMLElement | null;
            if (!inner) return {flexWrap: "", overflowX: ""};
            const cs = getComputedStyle(inner);
            return {flexWrap: cs.flexWrap, overflowX: cs.overflowX};
        });
        expect(styles.flexWrap).toBe("wrap");
        expect(styles.overflowX).not.toBe("auto");
        expect(styles.overflowX).not.toBe("scroll");
    });
});
