/**
 * Editor display settings smoke (EDITOR-DISPLAY-SETTINGS-01 C6).
 *
 * Exercises the toolbar popover + the CSS-variable cascade that
 * lets the user adjust width / font / size / line-height per-
 * device:
 *
 *   - Open ArticleEditor, click the popover toggle, select a
 *     non-default width, assert document.documentElement carries
 *     the new --editor-content-width CSS var.
 *   - Reload the page, assert the localStorage persistence
 *     survives.
 *   - Click reset, assert the var returns to "none" (full
 *     width / no constraint default).
 *
 * Per LL "Playwright-visible != User-visible": uses
 * page.evaluate to read the computed CSS var off document.documentElement
 * rather than asserting on bounding boxes (the width constraint
 * lives on .ProseMirror, not the editor wrapper).
 */

import {test, expect, createArticle} from "../fixtures/base";

test.describe("Editor display settings smoke", () => {
    test("changing the width preset writes the CSS var + survives reload", async ({
        page,
    }) => {
        const article = await createArticle("EditorDisplay Width Test");
        await page.goto(`/articles/${article.id}`);

        // Open the popover; trigger button lives just below the
        // Toolbar in the Editor.tsx surface.
        const toggle = page.getByTestId("editor-display-settings-toggle");
        await expect(toggle).toBeVisible({timeout: 10000});
        await toggle.click();
        const panel = page.getByTestId("editor-display-settings-panel");
        await expect(panel).toBeVisible();

        // Pick "narrow" (680px). The select fires onChange which
        // writes localStorage + reapplies the CSS var.
        const widthSelect = page.getByTestId(
            "editor-display-settings-width-trigger",
        );
        await widthSelect.click();
        await page.getByTestId("editor-display-settings-width-item-narrow").click();

        // Read the computed CSS var off documentElement. Direct
        // style.getPropertyValue returns the inline value that
        // useEditorDisplaySettings just set.
        const widthAfter = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue(
                "--editor-content-width",
            ).trim(),
        );
        expect(widthAfter).toBe("680px");

        // Reload — the hook reads localStorage on mount and
        // reapplies the var BEFORE any user interaction.
        await page.reload();
        const widthAfterReload = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue(
                "--editor-content-width",
            ).trim(),
        );
        expect(widthAfterReload).toBe("680px");
    });

    test("reset returns all four CSS vars to their defaults", async ({page}) => {
        const article = await createArticle("EditorDisplay Reset Test");
        await page.goto(`/articles/${article.id}`);

        const toggle = page.getByTestId("editor-display-settings-toggle");
        await expect(toggle).toBeVisible({timeout: 10000});
        await toggle.click();

        // Change all four to non-default values.
        await page.getByTestId("editor-display-settings-width-trigger").click();
        await page.getByTestId("editor-display-settings-width-item-medium").click();
        await page.getByTestId("editor-display-settings-font-trigger").click();
        await page.getByTestId("editor-display-settings-font-item-mono").click();
        await page.getByTestId("editor-display-settings-size-trigger").click();
        await page.getByTestId("editor-display-settings-size-item-large").click();
        await page.getByTestId("editor-display-settings-line-trigger").click();
        await page.getByTestId("editor-display-settings-line-item-compact").click();

        // Reset.
        await page.getByTestId("editor-display-settings-reset").click();

        // All four CSS vars return to defaults:
        //   width=none, font=var(--font-display), size=1.125rem,
        //   line-height=1.8
        const vars = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            return {
                width: cs.getPropertyValue("--editor-content-width").trim(),
                font: cs.getPropertyValue("--editor-font-family").trim(),
                size: cs.getPropertyValue("--editor-font-size").trim(),
                line: cs.getPropertyValue("--editor-line-height").trim(),
            };
        });
        expect(vars.width).toBe("none");
        expect(vars.font).toBe("var(--font-display)");
        expect(vars.size).toBe("1.125rem");
        expect(vars.line).toBe("1.8");
    });
});
