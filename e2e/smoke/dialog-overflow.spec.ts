/**
 * Issue #131 regression pin: dialogs must wrap long unbroken strings
 * (SHA hashes, URLs, file names) instead of overflowing their edge.
 *
 * The fix is a single base-layer rule in ``frontend/src/styles/tailwind.css``
 * setting ``overflow-wrap: anywhere`` on ``[role="dialog"]`` /
 * ``[role="alertdialog"]``. ``overflow-wrap`` is inherited and Radix sets
 * ``role="dialog"`` at runtime, so the rule covers EVERY dialog (the shared
 * ``DialogContent`` base AND every raw-Radix dialog) without per-component
 * edits.
 *
 * jsdom/happy-dom cannot compute the cascade, so this pin lives in E2E. It
 * opens the Import wizard - a raw-Radix ``Dialog.Content`` (so it doubly
 * proves the rule reaches the raw dialogs, not just the shared base) - and
 * asserts the computed ``overflow-wrap`` on the dialog node. Removing the
 * tailwind.css rule turns the computed value back to ``normal`` and fails
 * this test.
 */

import {test, expect} from "../fixtures/base";

test.describe("Issue #131: dialog overflow-wrap guard", () => {
    test("a dialog inherits overflow-wrap: anywhere", async ({page}) => {
        await page.goto("/");
        await page.getByTestId("import-wizard-btn").click();

        const modal = page.getByTestId("import-wizard-modal");
        await expect(modal).toBeVisible();

        // The Content node carries role="dialog" at runtime, so the
        // base-layer rule applies to it directly.
        await expect(modal).toHaveAttribute("role", "dialog");
        const overflowWrap = await modal.evaluate(
            (el) => getComputedStyle(el).overflowWrap,
        );
        expect(overflowWrap).toBe("anywhere");
    });
});
