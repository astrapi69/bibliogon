/**
 * Article-topics auto-save smoke (#57, #37 bug class).
 *
 * Replicates the user flow that loses data without the fix: add a topic,
 * navigate away without clicking Speichern, navigate back — the topic
 * must still be there (it auto-saved on add). Then remove it and confirm
 * the removal also survives a navigation round-trip.
 *
 * The add/remove handlers fire the persistence PATCH but do not await it;
 * in the real app navigation is client-side (react-router) so the request
 * always completes. This spec uses a full page.goto to re-read state from
 * the backend, so it waits for the settings PATCH to land before
 * navigating — otherwise the full-reload navigation would cancel the
 * in-flight request (a test artifact, not a product bug).
 */

import {test, expect} from "../fixtures/base";

const TOPIC = "E2E-Autosave-Thema";

function savePatch(page: import("@playwright/test").Page) {
    return page.waitForResponse(
        (res) =>
            res.url().includes("/api/settings/app") &&
            res.request().method() === "PATCH" &&
            res.ok(),
    );
}

test.describe("Settings > Themen auto-save (#57)", () => {
    test("added topic survives navigating away without Speichern", async ({page}) => {
        await page.goto("/settings?tab=topics");
        await expect(page.getByTestId("topics-settings")).toBeVisible();

        await page.getByTestId("topic-add-input").fill(TOPIC);
        await Promise.all([savePatch(page), page.getByTestId("topic-add-btn").click()]);
        await expect(page.getByText(TOPIC, {exact: true})).toBeVisible();

        // Navigate away WITHOUT clicking Speichern, then come back.
        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await page.goto("/settings?tab=topics");
        await expect(page.getByText(TOPIC, {exact: true})).toBeVisible();

        // Removal must also persist across a navigation round-trip.
        const row = page.locator('[data-testid^="topic-row-"]').filter({hasText: TOPIC});
        await Promise.all([savePatch(page), row.locator('[data-testid^="topic-remove-"]').click()]);
        await expect(page.getByText(TOPIC, {exact: true})).toHaveCount(0);

        await page.goto("/");
        await page.waitForLoadState("networkidle");
        await page.goto("/settings?tab=topics");
        await expect(page.getByText(TOPIC, {exact: true})).toHaveCount(0);
    });
});
