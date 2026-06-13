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
 * jsdom/happy-dom cannot compute ``overflow-wrap`` cascade + inheritance,
 * so this pin lives in E2E. It opens a real AppDialog confirm (the
 * app-wide ``useDialog().confirm`` surface, rendered via the shared base)
 * and asserts the computed value on the dialog node. A removal of the
 * tailwind.css rule turns the computed value back to ``normal`` and fails
 * this test.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

test.describe("Issue #131: dialog overflow-wrap guard", () => {
    test("AppDialog confirm inherits overflow-wrap: anywhere", async ({page}) => {
        const res = await fetch(`${API}/books`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({title: "Overflow guard target", author: "Asterios"}),
        });
        expect(res.ok).toBeTruthy();
        const book = (await res.json()) as {id: string};

        await page.goto("/");
        const kebab = page.getByTestId(`book-card-menu-${book.id}`);
        await expect(kebab).toBeVisible({timeout: 5000});
        await kebab.click();

        await page.getByTestId(`book-card-menu-delete-${book.id}`).click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();

        const overflowWrap = await dialog.evaluate(
            (el) => getComputedStyle(el).overflowWrap,
        );
        expect(overflowWrap).toBe("anywhere");
    });
});
