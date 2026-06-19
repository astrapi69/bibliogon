/**
 * MENU-SINGLE-LINE fixed-breakpoint regression pin (Article Dashboard).
 *
 * History: AD-HEADER-SINGLE-LINE-01 (2026-05-30) and ARTICLE-HEADER-900PX-
 * WRAP-01 tracked the header wrapping to two lines. Resolved 2026-06-05 by a
 * single fixed CSS breakpoint (Tailwind `menu:` = 1200px): the header is
 * EITHER the full inline bar (>=1200px) OR the hamburger (<1200px), decided
 * by viewport width only. Language and default-content-type changes can never
 * toggle the layout or cause a two-line wrap, because the breakpoint already
 * accounts for the worst-case (widest-locale) bar width.
 *
 * `Playwright-visible != User-visible`: a wrap is detected via
 * boundingBox().height (a wrapped row adds ~36px+), not via visibility. The
 * hamburger trigger is always in the DOM (CSS-hidden above the breakpoint),
 * so its state is asserted with toBeVisible()/toBeHidden().
 */

import {test, expect} from "../fixtures/base";

const ABOVE = 1280; // > 1200 breakpoint -> full bar
const BELOW = 1100; // < 1200 breakpoint -> hamburger
const REFERENCE_WIDTH = 1440; // single-line guaranteed
const WRAP_TOLERANCE = 8; // px control-height jitter before "wrap"
const API = "http://localhost:8000/api";

async function ready(page: import("@playwright/test").Page, width: number) {
    await page.setViewportSize({width, height: 800});
    await expect(page.getByTestId("article-list-page")).toBeVisible();
}

async function headerHeight(
    page: import("@playwright/test").Page,
): Promise<number> {
    const box = await page.getByTestId("article-list-header").boundingBox();
    expect(box).not.toBeNull();
    return box!.height;
}

test.describe("MENU-SINGLE-LINE Article Dashboard", () => {
    // The "default content type changes" test sets ui.defaults.content_type to
    // tutorial against the SHARED backend dev DB. Without a reset it leaks into
    // every later smoke test (workers:1, serial): content-types.spec then sees
    // the wrong default ("tutorial" instead of "blogpost") AND it persists to
    // the E2E data-dir settings file across runs (/api/test/reset wipes the DB,
    // not the settings). Restore the default after each test via the API,
    // preserving the rest of ui.defaults (the PATCH replaces ui.defaults
    // wholesale). Mirrors dashboard-header-single-line.spec.ts's afterEach.
    test.afterEach(async ({page}) => {
        const cfg = await (await page.request.get(`${API}/settings/app`)).json();
        const uiDefaults =
            (cfg.ui?.defaults as Record<string, unknown> | undefined) ?? {};
        await page.request.patch(`${API}/settings/app`, {
            data: {
                ui: {defaults: {...uiDefaults, content_type: "blogpost"}},
            },
        });
    });

    test("full inline bar above the breakpoint, hamburger hidden", async ({
        page,
    }) => {
        await page.goto("/articles");
        await ready(page, ABOVE);
        await expect(page.getByTestId("books-nav-btn")).toBeVisible();
        await expect(page.getByTestId("article-list-mobile-menu")).toBeHidden();
    });

    test("hamburger below the breakpoint, inline bar hidden", async ({page}) => {
        await page.goto("/articles");
        await ready(page, BELOW);
        await expect(page.getByTestId("article-list-mobile-menu")).toBeVisible();
        await expect(page.getByTestId("books-nav-btn")).toBeHidden();
        await page.getByTestId("article-list-mobile-menu").click();
        await expect(
            page.getByTestId("article-list-mobile-menu-books"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    test("never wraps to two lines at any width", async ({page}) => {
        await page.goto("/articles");
        await ready(page, REFERENCE_WIDTH);
        const reference = await headerHeight(page);
        for (const width of [1280, 1200, 1199, 1100, 1024, 900, 768]) {
            await ready(page, width);
            const h = await headerHeight(page);
            expect(
                h,
                `header wrapped at ${width}px (got ${h}, ref ${reference})`,
            ).toBeLessThanOrEqual(reference + WRAP_TOLERANCE);
        }
    });

    test("no toggle when the default content type changes (above breakpoint)", async ({
        page,
    }) => {
        await page.goto("/articles");
        await ready(page, ABOVE);
        const before = await headerHeight(page);

        await page.goto("/settings?tab=verhalten");
        await expect(page.getByTestId("verhalten-settings")).toBeVisible();
        await page.getByTestId("settings-default-content-type-trigger").click();
        await page
            .getByTestId("settings-default-content-type-item-tutorial")
            .click();
        await page.getByTestId("verhalten-settings-save").click();

        await page.goto("/articles");
        await ready(page, ABOVE);
        await expect(page.getByTestId("books-nav-btn")).toBeVisible();
        await expect(page.getByTestId("article-list-mobile-menu")).toBeHidden();
        expect(await headerHeight(page)).toBeLessThanOrEqual(
            before + WRAP_TOLERANCE,
        );
    });

    test("Backup lives in the Import chevron dropdown, not a standalone button", async ({
        page,
    }) => {
        await page.goto("/articles");
        await ready(page, ABOVE); // full bar -> the Import chevron is inline
        await page.getByTestId("article-import-chevron").click();
        await expect(
            page.getByTestId("article-medium-import-btn"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-backup-export-btn"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });
});
