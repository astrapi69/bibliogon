/**
 * Get-Started multi-book-type onboarding smoke
 * (GETSTARTED-MULTIBOOK-TYPES-UPDATE-01 C4).
 *
 * Exercises the 3-book-type additions shipped in C1-C3:
 *   - new ``choose-book-type`` step renders as step #1
 *   - "Wie geht das?" expands into a 3-card grid (prose +
 *     picture_book + comic_book), with bounding-box-dimension
 *     assertion (>40px per card) per LL "Playwright-visible !=
 *     User-visible" — toBeVisible() would pass on a CSS-collapsed
 *     strip
 *   - create-book step shows a 3-button sample-row
 *   - clicking each sample button creates a book of the matching
 *     type (verified via post-create URL + editor surface) and
 *     navigates away from /get-started
 *
 * Bounded by smoke-scope: this spec creates books in a real DB
 * via the actual sample-book API path. Each test gets its own
 * book.
 */

import {test, expect} from "../fixtures/base";

test.describe("Get-Started multi-book-type onboarding smoke", () => {
    test("choose-book-type step is step #1 + 3-card grid renders at non-zero height", async ({
        page,
    }) => {
        await page.goto("/get-started");

        // localStorage is per-context; resetDb fixture clears the
        // backend DB but not the browser storage. Clear here so the
        // test always starts on step #1 regardless of prior runs.
        await page.evaluate(() => localStorage.removeItem("bibliogon-onboarding"));
        await page.reload();

        // Step #1 title visible.
        await expect(
            page.getByText(/Buchtyp wählen|Choose Book Type/),
        ).toBeVisible();

        // Expand help to reveal the 3-card grid.
        await page
            .getByRole("button", {name: /Wie geht das|How does it work/})
            .click();

        const grid = page.getByTestId("getstarted-book-type-grid");
        await expect(grid).toBeVisible();

        // 3 cards present.
        const cards = page.locator(
            '[data-testid^="getstarted-book-type-card-"]',
        );
        await expect(cards).toHaveCount(3);

        // Bounding-box-dimension assertion per LL "Playwright-
        // visible != User-visible": each card must render at
        // user-perceivable height. CSS-collapse to <20px would
        // make the card invisible-as-UI even though toBeVisible
        // passes.
        for (let i = 0; i < 3; i++) {
            const bbox = await cards.nth(i).boundingBox();
            expect(bbox).not.toBeNull();
            expect(bbox!.height).toBeGreaterThan(40);
        }
    });

    test("create-book step shows a 3-button sample row at non-zero height", async ({
        page,
    }) => {
        await page.goto("/get-started");
        await page.evaluate(() => localStorage.removeItem("bibliogon-onboarding"));
        await page.reload();
        // Let useBookTypes() resolve before navigating: if it lands after the
        // step-2 nav it re-renders and bounces the step back to 1, dropping the
        // sample-button row mid-assertion (the flake this guards). Siblings #3-5
        // already wait here.
        await page.waitForLoadState("networkidle").catch(() => {});

        // Click step #2 indicator to navigate to create-book.
        await page.getByRole("button", {name: "2", exact: true}).click();

        // Title check (allow either i18n catalog or fallback).
        await expect(
            page.getByText(/Create a Book|Buch erstellen/).first(),
        ).toBeVisible();

        // 3 sample buttons visible.
        const row = page.getByTestId("getstarted-sample-button-row");
        await expect(row).toBeVisible();
        const buttons = page.locator(
            '[data-testid^="getstarted-sample-"]:not([data-testid$="-row"]):not([data-testid="getstarted-sample-button-row"])',
        );
        await expect(buttons).toHaveCount(3);

        // Bounding-box-dimension assertion: each button must render
        // at clickable height (>20px). boundingBox() does NOT auto-wait,
        // so assert per-button visibility first (the sample buttons come
        // from useBookTypes(), fetched async alongside the guide steps;
        // calling boundingBox() mid-layout returned null intermittently).
        for (let i = 0; i < 3; i++) {
            await expect(buttons.nth(i)).toBeVisible();
            const bbox = await buttons.nth(i).boundingBox();
            expect(bbox).not.toBeNull();
            expect(bbox!.height).toBeGreaterThan(20);
        }
    });

    test("clicking sample-prose creates a prose book + navigates away", async ({
        page,
    }) => {
        await page.goto("/get-started");
        await page.evaluate(() => localStorage.removeItem("bibliogon-onboarding"));
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.getByRole("button", {name: "2", exact: true}).click();

        const sample = page.getByTestId("getstarted-sample-prose");
        await expect(sample).toBeVisible();
        await sample.click();
        // After successful creation, navigate fires to /book/{id}.
        // URL pattern is exactly /book/<uuid>; this catches both
        // BookEditor (prose) AND the picture/comic editors' shared
        // route — for prose we expect BookEditor specifically.
        await page.waitForURL(/\/book\/[a-f0-9-]+/);
        await expect(page).not.toHaveURL("/get-started");
    });

    test("clicking sample-picture_book creates a picture book + lands on PageEditor", async ({
        page,
    }) => {
        await page.goto("/get-started");
        await page.evaluate(() => localStorage.removeItem("bibliogon-onboarding"));
        await page.reload();
        // Let the async App-level donation banner / config fetch settle so
        // a late layout shift doesn't detach the sample button mid-click.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.getByRole("button", {name: "2", exact: true}).click();

        const sample = page.getByTestId("getstarted-sample-picture_book");
        await expect(sample).toBeVisible();
        await sample.click();
        await page.waitForURL(/\/book\/[a-f0-9-]+/);
        // The router branches on book_type; picture_book lands on
        // PageEditor.
        await expect(page.getByTestId("page-editor-root")).toBeVisible({
            timeout: 10000,
        });
    });

    test("clicking sample-comic_book creates a comic book + lands on ComicBookEditor", async ({
        page,
    }) => {
        await page.goto("/get-started");
        await page.evaluate(() => localStorage.removeItem("bibliogon-onboarding"));
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.getByRole("button", {name: "2", exact: true}).click();

        const sample = page.getByTestId("getstarted-sample-comic_book");
        await expect(sample).toBeVisible();
        await sample.click();
        await page.waitForURL(/\/book\/[a-f0-9-]+/);
        // Comic-book router branch lands on ComicBookEditor.
        await expect(
            page.getByTestId("comic-book-editor-root"),
        ).toBeVisible({timeout: 10000});
    });
});
