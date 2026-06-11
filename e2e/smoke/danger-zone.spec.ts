/**
 * Danger Zone full-system reset smoke
 * (DANGER-ZONE-RESET-EVERYTHING-01 C7).
 *
 * Exercises the user-visible reset flow:
 *   1. Navigate to Settings > Danger Zone
 *   2. Click "Alles zurücksetzen" / "Reset Everything"
 *   3. Dialog opens with warning + backup link + RESET input
 *   4. Final-delete button stays disabled with wrong input
 *      ("reset" lowercase) and enables only on exact "RESET"
 *   5. Click final-delete → backend wipe + frontend cleanup +
 *      redirect to Dashboard root
 *   6. The seeded book is gone (the reset actually fired)
 *
 * Per the testid-namespace-pinning lessons-learned rule, every
 * interactive surface in the Danger-Zone dialog is identified by
 * a ``danger-zone-*`` testid; this spec positively asserts each
 * of them at least once.
 *
 * Note: the auto ``resetDatabase`` fixture in
 * ``e2e/fixtures/base.ts`` runs before each test via the
 * debug-only ``/api/test/reset`` endpoint, which is a different
 * surface from the user-facing ``/api/system/reset`` exercised
 * here. Both coexist - see ``backend/app/main.py:948`` and
 * ``backend/app/routers/system.py`` for the two contracts.
 */

import {test, expect, createBook} from "../fixtures/base";

test.describe("Settings - Danger Zone", () => {
    test("reset button + dialog + RESET-gate + execute → dashboard", async ({page}) => {
        // Seed a book so we can assert the reset actually fired.
        const book = await createBook("danger-zone-target");

        await page.goto("/settings?tab=danger_zone");

        // Section root + reset button visible.
        await expect(page.getByTestId("danger-zone-section")).toBeVisible();
        const resetBtn = page.getByTestId("danger-zone-reset-button");
        await expect(resetBtn).toBeVisible();

        // Open the dialog.
        await resetBtn.click();
        await expect(page.getByTestId("danger-zone-dialog")).toBeVisible();
        // Intermediate "backup first?" dialog → continue without backup.
        await expect(page.getByTestId("danger-zone-precheck")).toBeVisible();
        await expect(page.getByTestId("danger-zone-create-backup")).toBeVisible();
        await page.getByTestId("danger-zone-continue-without-backup").click();
        await expect(page.getByTestId("danger-zone-warning")).toBeVisible();
        const input = page.getByTestId("danger-zone-reset-input");
        await expect(input).toBeVisible();
        const finalBtn = page.getByTestId("danger-zone-final-delete-button");
        await expect(finalBtn).toBeVisible();
        await expect(finalBtn).toBeDisabled();

        // Wrong-input stays disabled.
        await input.fill("reset");
        await expect(finalBtn).toBeDisabled();

        // Exact "RESET" enables. The button also waits for the
        // background prepare-call to land (token !== null); we
        // poll with toBeEnabled rather than a snapshot check so
        // the test does not race the API call.
        await input.fill("RESET");
        await expect(finalBtn).toBeEnabled({timeout: 5000});

        // Execute the reset. After the redirect to "/" the
        // Dashboard root renders fresh.
        await finalBtn.click();
        await page.waitForURL("**/", {timeout: 10000});

        // The seeded book is gone - reset wiped the whole DB.
        const apiRes = await page.request.get(`http://localhost:8000/api/books/${book.id}`);
        expect(apiRes.status()).toBe(404);
    });

    test("cancel button closes the dialog without resetting", async ({page}) => {
        const book = await createBook("danger-zone-cancel-target");

        await page.goto("/settings?tab=danger_zone");
        await page.getByTestId("danger-zone-reset-button").click();
        await expect(page.getByTestId("danger-zone-precheck")).toBeVisible();

        await page.getByTestId("danger-zone-precheck-cancel").click();
        await expect(page.getByTestId("danger-zone-dialog")).not.toBeVisible();

        // The book still exists - cancel did not fire the reset.
        const apiRes = await page.request.get(`http://localhost:8000/api/books/${book.id}`);
        expect(apiRes.status()).toBe(200);
    });
});
