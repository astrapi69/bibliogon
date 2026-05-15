/**
 * Author-settings tab smoke (PLUGIN-SETTINGS-TESTID-COVERAGE-01).
 *
 * Pins the user-visible behaviour of the AuthorSettings component
 * that was extracted from the monolithic Settings.tsx:
 *   1. real-name input round-trips through GET /api/settings/app +
 *      PATCH /api/settings/app
 *   2. pen-name add via Add button persists to the same endpoint
 *   3. pen-name removal persists
 *
 * Each test cleans up its own author data via the API to keep the
 * suite re-runnable.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function patchAuthor(payload: {name?: string; pen_names?: string[]}): Promise<void> {
    const res = await fetch(`${API}/settings/app`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({author: payload}),
    });
    if (!res.ok) throw new Error(`PATCH author: ${res.status} ${await res.text()}`);
}

async function getAuthor(): Promise<{name?: string; pen_names?: string[]}> {
    const res = await fetch(`${API}/settings/app`);
    if (!res.ok) throw new Error(`GET app: ${res.status}`);
    const body = await res.json();
    return body.author || {};
}

test.describe("Settings - author tab", () => {
    test.beforeEach(async () => {
        await patchAuthor({name: "", pen_names: []});
    });

    test.afterEach(async () => {
        await patchAuthor({name: "", pen_names: []});
    });

    test("real-name persists after Save", async ({page}) => {
        await page.goto("/settings?tab=author");

        const root = page.getByTestId("author-settings");
        await expect(root).toBeVisible();

        await page.getByTestId("author-real-name").fill("E2E Author");
        await page.getByTestId("author-save").click();

        // Backend sees the new name. Use a poll because the save is
        // async; success toast fires after a roundtrip.
        await expect.poll(async () => (await getAuthor()).name).toBe("E2E Author");

        // Reloading the page re-hydrates from the API.
        await page.reload();
        await expect(page.getByTestId("author-real-name")).toHaveValue("E2E Author");
    });

    test("pen-name add via Add button persists", async ({page}) => {
        await page.goto("/settings?tab=author");

        await page.getByTestId("author-pen-name-input").fill("E2E Pseudonym");
        await page.getByTestId("author-pen-name-add").click();

        // The new pen-name appears in the list immediately.
        await expect(page.getByTestId("author-pen-name-0")).toContainText("E2E Pseudonym");

        // Save commits to the backend.
        await page.getByTestId("author-save").click();
        await expect
            .poll(async () => (await getAuthor()).pen_names || [])
            .toContain("E2E Pseudonym");
    });

    test("pen-name remove drops the entry on save", async ({page}) => {
        await patchAuthor({pen_names: ["Keep", "Drop"]});
        await page.goto("/settings?tab=author");

        // Both seeded entries are present.
        await expect(page.getByTestId("author-pen-name-0")).toContainText("Keep");
        await expect(page.getByTestId("author-pen-name-1")).toContainText("Drop");

        // Remove "Drop" (index 1).
        await page.getByTestId("author-pen-name-remove-1").click();
        await expect(page.getByTestId("author-pen-name-1")).toHaveCount(0);

        // Save persists the deletion.
        await page.getByTestId("author-save").click();
        await expect
            .poll(async () => (await getAuthor()).pen_names || [])
            .toEqual(["Keep"]);
    });
});
