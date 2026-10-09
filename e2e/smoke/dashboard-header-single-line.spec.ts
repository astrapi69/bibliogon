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
 * warm-literary, where the bar fitted - so no assertion written here
 * could have seen it. The absolute test below therefore sets the palette
 * itself and checks every one, the way the visual suite does.
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
    test(`is one control row tall at the reference width (${palette})`, async ({
        page,
    }) => {
        // #971: the loop below grades every width against REFERENCE_WIDTH, so
        // once 1440 itself wraps the reference IS the wrap and every
        // comparison passes - the one width the file calls "single-line
        // guaranteed" was the only one never checked. This asserts it
        // absolutely: the header is its tallest control plus its own padding,
        // both read from the DOM so a theme or font change does not need a
        // new magic number.
        //
        // Once per palette, because the pre-fix header fitted in
        // warm-literary (this suite's default) and wrapped in four of the
        // other five. A single-palette version of this test is green on the
        // bug it is meant to pin.
        await bootInPalette(page, palette);
        await page.goto("/");
        await ready(page, REFERENCE_WIDTH);
        // The palette picks the font, the font decides the label widths,
        // and the web fonts land asynchronously. Measuring before they do
        // measures fallback metrics - a layout no user ever sees, and the
        // reason an assertion here can be green while the theme baselines
        // show the bar wrapped.
        await page.evaluate(() => document.fonts.ready);
        const measured = await page.evaluate(() => {
            const header = document.querySelector(
                '[data-testid="dashboard-header"]',
            ) as HTMLElement;
            const inner = header.firstElementChild as HTMLElement;
            const padding =
                parseFloat(getComputedStyle(inner).paddingTop) +
                parseFloat(getComputedStyle(inner).paddingBottom);
            const controls = [
                ...header.querySelectorAll("button, a, input, select"),
            ] as HTMLElement[];
            const tallest = Math.max(
                ...controls
                    .filter((el) => el.offsetParent !== null)
                    .map((el) => el.getBoundingClientRect().height),
            );
            return {header: header.getBoundingClientRect().height, tallest, padding};
        });
        expect(
            measured.header,
            `header is ${measured.header}px at ${REFERENCE_WIDTH}px under ` +
                `${palette}; one row of ${measured.tallest}px controls plus ` +
                `${measured.padding}px padding is ` +
                `${measured.tallest + measured.padding}px. A taller header means a ` +
                `control wrapped its label. Fold one into the Import chevron ` +
                `(#971) - the breakpoint cannot help, the container is capped at 1100px.`,
        ).toBeLessThanOrEqual(measured.tallest + measured.padding + WRAP_TOLERANCE);
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
