/**
 * The `.biblio.yaml` round-trip on the static Dexie build (#745).
 *
 * The third of the format's three workflows is a user pasting the file
 * into an assistant that has never heard of Bibliogon, so the file has
 * to be produced and read by whatever the user is running - including
 * the backendless web app, where this was DESKTOP_ONLY until now.
 *
 * Drives the real buttons in the article editor's sidebar: export,
 * read the bytes, edit a `current_value` the way an assistant would,
 * import it back, and check the editor shows the new value. The YAML
 * bytes are read rather than trusted, because a download event alone
 * would be satisfied by an empty Blob with the right name.
 */

import {test, expect} from "@playwright/test";
import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

test.beforeEach(async ({context}) => {
    await context.route(/\/(registerSW\.js|sw\.js)(\?|$)/, (route) => route.abort());
    await context.addInitScript(() => {
        try {
            localStorage.setItem("bibliogon-donation-onboarding-seen", "true");
            localStorage.setItem("bibliogon-ai-setup-dismissed", "true");
            localStorage.setItem("bibliogon-migration-offered", "true");
        } catch {
            /* storage unavailable: the assertions below report it */
        }
    });
});

test("an article template exports, is edited, and imports back offline", async ({page}) => {
    test.setTimeout(120_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });
    const noise: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") noise.push(message.text());
    });
    page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

    await page.goto("/articles/new");
    await page.getByTestId("create-article-title").fill("Warum Katzen klettern");
    await page.getByTestId("create-article-submit").click();
    await page.waitForURL(
        (url) => /\/articles\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
        {timeout: 20_000},
    );

    // --- Export ---
    const panel = page.getByTestId("ai-template-panel");
    await panel.scrollIntoViewIfNeeded();
    const exportButton = page.getByTestId("ai-template-export");
    await expect(exportButton).toBeEnabled({timeout: 15_000});

    const errorToast = page.locator(".Toastify__toast--error");
    const downloaded = page.waitForEvent("download", {timeout: 60_000}).catch(() => null);
    const failed = errorToast
        .first()
        .waitFor({state: "visible", timeout: 60_000})
        .then(() => null)
        .catch(() => null);
    await exportButton.click();
    const file = await Promise.race([downloaded, failed]);
    if (!file) {
        const reported = (await errorToast.count())
            ? await errorToast.first().innerText()
            : "(no error was reported)";
        throw new Error(
            `the template was never produced.\ntoast said: ${reported}\n` +
                `console: ${noise.join("\n         ") || "(quiet)"}`,
        );
    }
    expect(file.suggestedFilename()).toBe("warum-katzen-klettern.biblio.yaml");

    const downloadPath = await file.path();
    expect(downloadPath, "the download produced no file").toBeTruthy();
    const yamlText = readFileSync(downloadPath!, "utf-8");
    // The rules-for-AI header is the whole instruction in the external
    // workflow, so its absence is a broken file even when the data is
    // right.
    expect(yamlText).toContain("RULES FOR AI ASSISTANTS");
    expect(yamlText).toContain("type: article");
    expect(yamlText).toContain("current_value: Warum Katzen klettern");
    // The reference block is what gives the assistant its context.
    expect(yamlText).toMatch(/reference:\n\s+id: /);

    // --- Fill it the way an assistant would ---
    const filled = yamlText.replace(
        /(seo_title:(?:.|\n)*?)current_value: null/,
        "$1current_value: Warum Katzen klettern - eine Uebersicht",
    );
    expect(filled, "the seo_title field was not found to fill").not.toBe(yamlText);
    const dir = mkdtempSync(join(tmpdir(), "biblio-template-"));
    const filledPath = join(dir, "filled.biblio.yaml");
    writeFileSync(filledPath, filled, "utf-8");

    // --- Import ---
    await page.getByTestId("ai-template-import").click();
    await expect(page.getByTestId("ai-template-import-dialog")).toBeVisible();
    await page.getByTestId("template-import-dropzone-input").setInputFiles(filledPath);
    await expect(page.getByTestId("template-import-file-preview")).toBeVisible();
    await page.getByTestId("ai-template-import-submit").click();

    // The panel re-reads the record after a successful import, so the
    // sidebar field is the end-to-end evidence: parsed, applied, written
    // through the seam, and read back.
    await expect(page.getByTestId("article-editor-seo-title")).toHaveValue(
        "Warum Katzen klettern - eine Uebersicht",
        {timeout: 20_000},
    );

    expect(apiCalls, `offline build fired /api: ${apiCalls.join(", ")}`).toEqual([]);
});
