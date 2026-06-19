/**
 * MENU-SINGLE-LINE fixed-breakpoint regression pin (Book Dashboard).
 *
 * The header is EITHER the full inline bar OR the hamburger, decided by a
 * single fixed CSS breakpoint (Tailwind `menu:` = 1200px), NEVER by content.
 * Switching language or the default book type must not change which state is
 * shown at a given viewport - no toggling, and never a two-line wrap.
 *
 * 1200px is the worst-case full-bar width (widest locale es/pt/el, where
 * "Backup" is an ~18-char phrase, + the longest default-type label + margin).
 * Above it the full bar always fits; below it the hamburger takes over.
 *
 * `Playwright-visible != User-visible`: the height assertions use
 * boundingBox().height (a wrap adds a full control row) rather than just
 * asserting visibility. The hamburger trigger is always in the DOM (CSS-
 * hidden above the breakpoint), so visibility is asserted with
 * toBeVisible()/toBeHidden(), not toHaveCount.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

const ABOVE = 1280; // > 1200 breakpoint -> full bar
const BELOW = 1100; // < 1200 breakpoint -> hamburger
const REFERENCE_WIDTH = 1440; // single-line guaranteed
const WRAP_TOLERANCE = 8; // px control-height jitter before "wrap"

async function ready(page: import("@playwright/test").Page, width: number) {
    await page.setViewportSize({width, height: 800});
    await expect(page.getByTestId("new-book-group")).toBeVisible();
}

async function headerHeight(
    page: import("@playwright/test").Page,
): Promise<number> {
    const box = await page.getByTestId("dashboard-header").boundingBox();
    expect(box).not.toBeNull();
    return box!.height;
}

test.describe("MENU-SINGLE-LINE Book Dashboard", () => {
    // Two tests below persist a UI language (es) + default book type
    // (picture_book) to the SHARED backend dev DB. Without a reset they leak
    // into every later desktop smoke test, which then renders in Spanish (text
    // assertions fail) or sees the wrong default type. Restore the defaults
    // after each test via the API, preserving the rest of ui.defaults (the PATCH
    // shallow-merges app but replaces ui.defaults wholesale).
    test.afterEach(async ({page}) => {
        const cfg = await (await page.request.get(`${API}/settings/app`)).json();
        const uiDefaults =
            (cfg.ui?.defaults as Record<string, unknown> | undefined) ?? {};
        await page.request.patch(`${API}/settings/app`, {
            data: {
                app: {default_language: "de"},
                ui: {defaults: {...uiDefaults, book_type: "prose"}},
            },
        });
    });

    test("full inline bar above the breakpoint, hamburger hidden", async ({
        page,
    }) => {
        await page.goto("/");
        await ready(page, ABOVE);
        await expect(page.getByTestId("backup-export-btn")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeHidden();
    });

    test("hamburger below the breakpoint, inline bar hidden", async ({page}) => {
        await page.goto("/");
        await ready(page, BELOW);
        await expect(page.getByTestId("dashboard-hamburger")).toBeVisible();
        await expect(page.getByTestId("backup-export-btn")).toBeHidden();
        // All actions reachable from the hamburger (incl. the Artikel
        // cross-nav Aster asked for).
        await page.getByTestId("dashboard-hamburger").click();
        await expect(
            page.getByTestId("dashboard-hamburger-articles"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    test("never wraps to two lines at any width", async ({page}) => {
        await page.goto("/");
        await ready(page, REFERENCE_WIDTH);
        const reference = await headerHeight(page);
        for (const width of [1280, 1200, 1199, 1100, 1024, 820, 768]) {
            await ready(page, width);
            const h = await headerHeight(page);
            expect(
                h,
                `header wrapped at ${width}px (got ${h}, ref ${reference})`,
            ).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
        }
    });

    test("no toggle when the language changes (above breakpoint)", async ({
        page,
    }) => {
        await page.goto("/");
        await ready(page, ABOVE);
        const before = await headerHeight(page);

        // Switch to Spanish (the widest-label locale) via Settings.
        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await page.getByTestId("settings-language-trigger").click();
        await page.getByTestId("settings-language-item-es").click();
        // Auto-save (#472): the change arms the debounced PATCH; no Speichern
        // button. Await the write so the new default is persisted before nav.
        await page.waitForResponse(
            (r) =>
                r.url().includes("/settings/app") &&
                r.request().method() === "PATCH" &&
                r.ok(),
            {timeout: 8000},
        );

        await page.goto("/");
        await ready(page, ABOVE);
        // Still the full bar, hamburger still hidden, height unchanged: the
        // layout did not toggle even though the labels got wider.
        await expect(page.getByTestId("backup-export-btn")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeHidden();
        expect(await headerHeight(page)).toBeLessThanOrEqual(
            before + WRAP_TOLERANCE,
        );
    });

    test("no toggle when the default book type changes (above breakpoint)", async ({
        page,
    }) => {
        await page.goto("/");
        await ready(page, ABOVE);
        const before = await headerHeight(page);

        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await page.getByTestId("settings-default-book-type-trigger").click();
        await page
            .getByTestId("settings-default-book-type-item-picture_book")
            .click();
        // Auto-save (#472): the change arms the debounced PATCH; no Speichern
        // button. Await the write so the new default is persisted before nav.
        await page.waitForResponse(
            (r) =>
                r.url().includes("/settings/app") &&
                r.request().method() === "PATCH" &&
                r.ok(),
            {timeout: 8000},
        );

        await page.goto("/");
        await ready(page, ABOVE);
        await expect(page.getByTestId("backup-export-btn")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeHidden();
        expect(await headerHeight(page)).toBeLessThanOrEqual(
            before + WRAP_TOLERANCE,
        );
    });
});
