/**
 * #472 Settings auto-save smoke.
 *
 * Pins the auto-save contract: a change in a Settings panel persists
 * automatically (debounced) with a short "Gespeichert" toast and no
 * manual Speichern button, and survives a reload.
 *
 * Covered here (the browser-only half a Vitest cannot prove):
 *   - no Speichern button renders in the Editor panel,
 *   - editing a field shows the saved toast,
 *   - the change round-trips a PATCH and survives a full reload.
 */

import {test, expect} from "../fixtures/base";

test.describe("#472 Settings auto-save", () => {
    test("editing a setting auto-saves (toast + reload persistence, no save button)", async ({
        page,
    }) => {
        await page.goto("/settings?tab=editor");
        await expect(page.getByTestId("editor-settings")).toBeVisible();

        // No manual Speichern button on the panel.
        await expect(page.getByTestId("editor-settings-save")).toHaveCount(0);

        const autosave = page.getByTestId("editor-autosave");

        // Arm the PATCH wait BEFORE the edit (arm-before-act): the debounced
        // auto-save (#472, 500ms) can land before a listener registered after
        // the fill, which intermittently times the wait out under CI load.
        const patchLanded = page.waitForResponse(
            (r) =>
                r.url().includes("/settings/app") &&
                r.request().method() === "PATCH" &&
                r.ok(),
            {timeout: 10000},
        );
        await autosave.fill("1500");
        await patchLanded;
        await expect(page.getByText(/Gespeichert|Saved/).first()).toBeVisible({
            timeout: 8000,
        });

        // Reload: the change persisted (read back from the stored config).
        await page.reload();
        await expect(page.getByTestId("editor-settings")).toBeVisible();
        await expect(page.getByTestId("editor-autosave")).toHaveValue("1500");
    });
});
