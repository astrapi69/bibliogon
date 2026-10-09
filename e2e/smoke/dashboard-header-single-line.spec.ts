/**
 * MENU-SINGLE-LINE fixed-breakpoint regression pin (Book Dashboard).
 *
 * The header is EITHER the full inline bar OR the hamburger, decided by a
 * single fixed CSS breakpoint (Tailwind `menu:` = 1200px), NEVER by content.
 * Switching language or the default book type must not change which state is
 * shown at a given viewport - no toggling, and never a two-line wrap.
 *
 * 1200px is the breakpoint between the two states. It measures the VIEWPORT,
 * which is not what constrains the bar: `.headerInner` is capped at
 * max-width 1100px (shared with `.main`, so the header aligns with the cards
 * below), so above 1100 the bar has ~1052px no matter how wide the window
 * gets. Raising the breakpoint therefore cannot buy the bar a single pixel -
 * #971 found it wrapping at 1440 while this spec was green. When the bar
 * outgrows that container the answer is to fold a control into the Import
 * chevron, the way #398 did on the Article Dashboard, not to move the
 * breakpoint.
 *
 * `Playwright-visible != User-visible`: the height assertions use
 * boundingBox().height (a wrap adds a full control row) rather than just
 * asserting visibility. The hamburger trigger is always in the DOM (CSS-
 * hidden above the breakpoint), so visibility is asserted with
 * toBeVisible()/toBeHidden(), not toHaveCount.
 *
 * The wrap is PALETTE-dependent, which is the second reason #971 escaped.
 * Label widths follow the palette's font, and the committed theme
 * baselines show the pre-fix header one control row tall under
 * warm-literary and classic and two rows tall under cool-modern, nord,
 * studio and notebook. The rest of this suite runs in the default theme,
 * warm-literary, where the bar fitted - so the tests below set the
 * palette themselves and check every one, the way the visual suite does.
 *
 * What the wrap test must NOT do is grade the header against something
 * inside the header (#995). A first attempt compared the header's height
 * against its tallest visible control plus the header's padding; when a
 * control wraps its label it becomes two lines tall, so the bound grew by
 * exactly what it was supposed to catch and the assertion was green on
 * the bug in all six palettes. That is the same fault as the original
 * sweep, one level down. The bound used now comes only from each
 * control's own computed line-height, padding and border - nothing on
 * the right-hand side can move when a label wraps.
 */

import {test, expect} from "../fixtures/base";

/**
 * Every palette, because the bar's width depends on the font the palette
 * picks. Same ids and same localStorage keys `useTheme` reads as the
 * visual suite's `applyTheme`, set through addInitScript so the app boots
 * in the target palette with no repaint from the default.
 */
const PALETTES = [
    "warm-literary",
    "cool-modern",
    "nord",
    "classic",
    "studio",
    "notebook",
] as const;

async function bootInPalette(
    page: import("@playwright/test").Page,
    palette: string,
): Promise<void> {
    await page.addInitScript((id) => {
        try {
            localStorage.setItem("bibliogon-app-theme", id);
        } catch {
            // localStorage unavailable (privacy mode); the default palette
            // is still a valid case to measure.
        }
    }, palette);
}

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
        await expect(page.getByTestId("import-group")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeHidden();
    });

    test("hamburger below the breakpoint, inline bar hidden", async ({page}) => {
        await page.goto("/");
        await ready(page, BELOW);
        await expect(page.getByTestId("dashboard-hamburger")).toBeVisible();
        await expect(page.getByTestId("import-group")).toBeHidden();
        // All actions reachable from the hamburger (incl. the Artikel
        // cross-nav Aster asked for).
        await page.getByTestId("dashboard-hamburger").click();
        await expect(
            page.getByTestId("dashboard-hamburger-articles"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
    });

    for (const palette of PALETTES) {
    test(`no header control wraps its label at the reference width (${palette})`, async ({
        page,
    }) => {
        // #971 found the header two rows tall at 1440px, the one width
        // this file calls "single-line guaranteed" and the only one the
        // sweep below never checked - it grades every other width against
        // 1440, so once 1440 wraps the reference IS the wrap.
        //
        // #995: the bound must not come from inside the header. A control
        // that wraps its label becomes two lines tall, so the first attempt
        // here - "header <= tallest visible control + the header's padding"
        // - grew by exactly what it was meant to catch and was green on the
        // bug in all six palettes. Each control is measured against its OWN
        // line-height instead: a content box over ~1.6 lines means the text
        // broke across lines. One line with an icon sits at 1.0-1.3 lines,
        // two lines at 2.0, so the threshold separates them without a magic
        // pixel count, and nothing on the right-hand side can move when the
        // bug appears.
        //
        // Once per palette, because the palette picks the font and the font
        // decides the label widths: the pre-fix bar fitted under
        // warm-literary and classic and wrapped under the other four.
        await bootInPalette(page, palette);
        await page.goto("/");
        await ready(page, REFERENCE_WIDTH);
        // Web fonts land asynchronously; measuring before they do measures
        // fallback metrics, a layout no user ever sees.
        await page.evaluate(() => document.fonts.ready);
        const wrapped = await page.evaluate(() => {
            const header = document.querySelector(
                '[data-testid="dashboard-header"]',
            ) as HTMLElement;
            const controls = [
                ...header.querySelectorAll("button, a"),
            ] as HTMLElement[];
            return controls
                .filter((el) => el.offsetParent !== null)
                .map((el) => {
                    const cs = getComputedStyle(el);
                    const lineHeight =
                        parseFloat(cs.lineHeight) ||
                        parseFloat(cs.fontSize) * 1.5;
                    const frame =
                        parseFloat(cs.paddingTop) +
                        parseFloat(cs.paddingBottom) +
                        parseFloat(cs.borderTopWidth) +
                        parseFloat(cs.borderBottomWidth);
                    const content = el.getBoundingClientRect().height - frame;
                    return {
                        label:
                            (
                                el.textContent ||
                                el.getAttribute("aria-label") ||
                                el.getAttribute("data-testid") ||
                                "?"
                            )
                                .trim()
                                .slice(0, 40) || "?",
                        lines: Math.round((content / lineHeight) * 100) / 100,
                    };
                })
                .filter((c) => c.lines > 1.6);
        });
        expect(
            wrapped,
            `under ${palette} at ${REFERENCE_WIDTH}px these header controls ` +
                `broke their label across lines: ${JSON.stringify(wrapped)}. ` +
                `The bar has outgrown its container - fold a control into the ` +
                `Import chevron the way #398 did, do not move the breakpoint: ` +
                `it measures the viewport, while .headerInner is capped at ` +
                `1100px.`,
        ).toEqual([]);
    });
    }

    test("never wraps to two lines at any narrower width", async ({page}) => {
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
        await expect(page.getByTestId("import-group")).toBeVisible();
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
        await expect(page.getByTestId("import-group")).toBeVisible();
        await expect(page.getByTestId("dashboard-hamburger")).toBeHidden();
        expect(await headerHeight(page)).toBeLessThanOrEqual(
            before + WRAP_TOLERANCE,
        );
    });
});
