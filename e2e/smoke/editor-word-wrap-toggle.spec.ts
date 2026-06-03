/**
 * Smoke test for Alt+Z word-wrap toggle
 * (EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 C2).
 *
 * Pins:
 * - Initial state: body has NO `no-word-wrap` class; .ProseMirror's
 *   computed white-space is `pre-wrap` (TipTap default).
 * - Alt+Z keypress: body gains the class; .ProseMirror's computed
 *   white-space becomes `pre`.
 * - Alt+Z again: body loses the class; white-space reverts.
 *
 * Per the "Playwright-visible ≠ User-visible: assert bounding-box
 * dimensions for CSS-collapse class bugs" lessons-learned rule, the
 * test asserts the COMPUTED CSS, not just the DOM class — the class
 * could be present while the rule is overridden somewhere, and the
 * class could be absent while the rule still applies via a stale
 * cache. The computed style is the only honest signal.
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";

test.describe("Alt+Z word-wrap toggle", () => {
    test("toggles white-space between pre-wrap and pre in TipTap editor", async ({page}) => {
        const book = await createBook("Alt+Z Smoke Test");
        await createChapter(book.id, "Chapter 1", "<p>Body content for wrap toggle</p>");

        await page.goto(`/book/${book.id}`);
        const proseMirror = page.locator(".ProseMirror").first();
        await expect(proseMirror).toBeVisible({timeout: 5000});

        // Initial state — wrap enabled. The exact computed value is a
        // wrapping value (pre-wrap / break-spaces depending on the
        // ProseMirror build); the contract is "not 'pre'" (wrap on).
        // Capture it to assert the round-trip restores it.
        const initialWhiteSpace = await proseMirror.evaluate((el) => {
            return window.getComputedStyle(el).whiteSpace;
        });
        expect(initialWhiteSpace).not.toBe("pre");
        expect(
            await page.evaluate(() => document.body.classList.contains("no-word-wrap")),
        ).toBe(false);

        // Press Alt+Z — wrap disabled, white-space switches to `pre`.
        await page.keyboard.press("Alt+z");
        await expect
            .poll(async () =>
                page.evaluate(() => document.body.classList.contains("no-word-wrap")),
            )
            .toBe(true);
        const wrappedOffWhiteSpace = await proseMirror.evaluate((el) => {
            return window.getComputedStyle(el).whiteSpace;
        });
        expect(wrappedOffWhiteSpace).toBe("pre");

        // Press Alt+Z again — wrap re-enabled, class removed.
        await page.keyboard.press("Alt+z");
        await expect
            .poll(async () =>
                page.evaluate(() => document.body.classList.contains("no-word-wrap")),
            )
            .toBe(false);
        const restoredWhiteSpace = await proseMirror.evaluate((el) => {
            return window.getComputedStyle(el).whiteSpace;
        });
        expect(restoredWhiteSpace).toBe(initialWhiteSpace);
    });

    test("preference persists across reload via localStorage", async ({page}) => {
        const book = await createBook("Alt+Z Persistence Test");
        await createChapter(book.id, "Chapter 1", "<p>Body</p>");

        await page.goto(`/book/${book.id}`);
        await expect(page.locator(".ProseMirror").first()).toBeVisible({timeout: 5000});

        // Toggle off — wrap disabled.
        await page.keyboard.press("Alt+z");
        await expect
            .poll(async () =>
                page.evaluate(() => document.body.classList.contains("no-word-wrap")),
            )
            .toBe(true);

        // Reload — state must restore from localStorage.
        await page.reload();
        await expect(page.locator(".ProseMirror").first()).toBeVisible({timeout: 5000});
        await expect
            .poll(async () =>
                page.evaluate(() => document.body.classList.contains("no-word-wrap")),
            )
            .toBe(true);

        // Toggle back on for cleanup (localStorage is shared across smoke tests).
        await page.keyboard.press("Alt+z");
        await expect
            .poll(async () =>
                page.evaluate(() => document.body.classList.contains("no-word-wrap")),
            )
            .toBe(false);
    });
});
