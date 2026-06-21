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

// SETT-AUTHORS-TAB-CONSOLIDATION-01: the "author" + "authors_database"
// tabs merged into a single "autoren" tab. Internal testids
// (``author-settings`` / ``author-real-name`` /
// ``author-pen-name-*``) are preserved verbatim because the
// AuthorSettings component still mounts unchanged inside the
// AutorenSettings wrapper. Only the deep-link query param changes.
test.describe("Settings - autoren tab (author profile)", () => {
    test.beforeEach(async () => {
        await patchAuthor({name: "", pen_names: []});
    });

    test.afterEach(async () => {
        await patchAuthor({name: "", pen_names: []});
    });

    test("real-name persists after Save", async ({page}) => {
        await page.goto("/settings?tab=autoren");

        const root = page.getByTestId("author-settings");
        await expect(root).toBeVisible();
        // Let the autoren tab settle (the AuthorsDatabase section
        // fetches /api/authors) before filling, so a late re-render
        // can't detach the just-filled input.
        await page.waitForLoadState("networkidle");

        // Fill + verify the value stuck before saving. Under full-suite
        // load a late StrictMode remount / config-prop re-init can
        // detach the freshly-filled input and re-mount it empty, so the
        // save would persist "". Retry until the value is stable.
        const realName = page.getByTestId("author-real-name");
        await expect(async () => {
            await realName.fill("E2E Author");
            await expect(realName).toHaveValue("E2E Author");
        }).toPass({timeout: 10_000});
        // Auto-save (#472): the real name persists on blur; no Speichern button.
        await realName.blur();

        // Backend sees the new name. Use a poll because the save is
        // async; success toast fires after a roundtrip.
        await expect.poll(async () => (await getAuthor()).name).toBe("E2E Author");

        // Reloading the page re-hydrates from the API.
        await page.reload();
        await expect(page.getByTestId("author-real-name")).toHaveValue("E2E Author");
    });

    test("pen-name add persists immediately (auto-save, no Speichern click)", async ({page}) => {
        await page.goto("/settings?tab=autoren");
        await page.waitForLoadState("networkidle");

        // Add + verify it stuck (a late re-init can reset the pen-name list
        // under full-suite load); retry until stable.
        await expect(async () => {
            await page.getByTestId("author-pen-name-input").fill("E2E Pseudonym");
            await page.getByTestId("author-pen-name-add").click();
            await expect(page.getByTestId("author-pen-name-0")).toContainText(
                "E2E Pseudonym",
            );
        }).toPass({timeout: 10_000});

        // Auto-save: the add persists WITHOUT a Speichern click.
        await expect
            .poll(async () => (await getAuthor()).pen_names || [])
            .toContain("E2E Pseudonym");
    });

    test("pen-name remove persists immediately (auto-save)", async ({page}) => {
        await patchAuthor({pen_names: ["Keep", "Drop"]});
        await page.goto("/settings?tab=autoren");
        await page.waitForLoadState("networkidle");

        await expect(page.getByTestId("author-pen-name-0")).toContainText("Keep");
        await expect(page.getByTestId("author-pen-name-1")).toContainText("Drop");

        // Remove "Drop" (index 1) - persists on its own, no Speichern click.
        await page.getByTestId("author-pen-name-remove-1").click();
        await expect(page.getByTestId("author-pen-name-1")).toHaveCount(0);
        await expect
            .poll(async () => (await getAuthor()).pen_names || [])
            .toEqual(["Keep"]);
    });

    test("a saved pen name is an option in the create-book author dropdown", async ({page}) => {
        await patchAuthor({name: "Real Author", pen_names: ["Draven Quantum"]});
        await page.goto("/books/new");

        // With a pen name configured the author field is a real <select> of
        // profile identities (a native <datalist> filtered its options by the
        // pre-filled real name, hiding pen names - #103). Every profile name
        // must be a selectable option.
        const select = page.getByTestId("create-book-author-select");
        await expect(select).toBeVisible();
        await expect
            .poll(async () =>
                select.evaluate((el) =>
                    Array.from(el.querySelectorAll("option")).map(
                        (o) => (o as HTMLOptionElement).value,
                    ),
                ),
            )
            .toEqual(expect.arrayContaining(["Real Author", "Draven Quantum"]));
    });
});
