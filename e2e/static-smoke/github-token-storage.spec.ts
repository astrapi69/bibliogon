/**
 * GitHub token storage gate (#880), on the static Dexie build in a real
 * browser. A token that an earlier version left in localStorage must be
 * shown in the GitHub import tab, moved into the `bibliogon-credentials`
 * IndexedDB database, removed from localStorage, survive a reload, and be
 * gone from both places after "Delete token".
 *
 * The legacy key is seeded exactly once per test (a sessionStorage flag),
 * otherwise the init script would put it back on every reload and hide a
 * broken migration. GitHub itself is never contacted: the spec only opens
 * the token section.
 */

import {test, expect, type Page} from "@playwright/test";

const LEGACY_KEY = "bibliogon.github_token";
const TOKEN = "github_pat_e2e_legacy";

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.route(/api\.github\.com|raw\.githubusercontent\.com/, (route) => route.abort());
    await context.addInitScript(
        ([legacyKey, token]) => {
            try {
                localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
                localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
                localStorage.setItem("bibliogon-migration-offered", "true");
                if (!sessionStorage.getItem("e2e-legacy-token-seeded")) {
                    localStorage.setItem(legacyKey, token);
                    sessionStorage.setItem("e2e-legacy-token-seeded", "1");
                }
            } catch {
                /* storage unavailable: the assertions below report it */
            }
        },
        [LEGACY_KEY, TOKEN],
    );
});

async function openTokenField(page: Page) {
    await expect(page.getByTestId("new-book-group")).toBeVisible({timeout: 20_000});
    await page.getByTestId("import-wizard-btn").click();
    await page.getByTestId("offline-import-tab-github").click();
    await page.getByTestId("github-import-token-section-toggle").click();
    return page.getByTestId("github-import-token");
}

function readStoredToken(page: Page): Promise<string | null> {
    return page.evaluate(
        () =>
            new Promise<string | null>((resolve, reject) => {
                const request = indexedDB.open("bibliogon-credentials");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains("secrets")) {
                        db.close();
                        resolve(null);
                        return;
                    }
                    const get = db.transaction("secrets").objectStore("secrets").get("github_token");
                    get.onsuccess = () => {
                        db.close();
                        resolve(get.result ? (get.result as {value: string}).value : null);
                    };
                    get.onerror = () => reject(get.error);
                };
            }),
    );
}

test("a legacy localStorage token moves to IndexedDB, survives a reload and can be deleted", async ({page}) => {
    await page.goto("/");
    const field = await openTokenField(page);
    await expect(field).toHaveValue(TOKEN);
    expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBeNull();
    expect(await readStoredToken(page)).toBe(TOKEN);

    await page.reload();
    const fieldAfterReload = await openTokenField(page);
    await expect(fieldAfterReload).toHaveValue(TOKEN);
    expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBeNull();

    await expect(page.getByTestId("github-import-token-risk")).toContainText("Contents: Read-only");
    await page.getByTestId("github-import-token-clear").click();
    await expect(fieldAfterReload).toHaveValue("");
    await expect.poll(() => readStoredToken(page)).toBeNull();
});
