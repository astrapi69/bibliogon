/**
 * The KDP package built in the browser, with no backend (#741).
 *
 * The wizard's last step called `POST /api/kdp/package/{id}`, which
 * assembles the ZIP with Pandoc and WeasyPrint server-side, so offline it
 * failed. It now composes the same archive from the client export engine:
 * the EPUB from `formatEpub`, the print interior from pdfmake at the
 * chosen KDP trim and margin, `metadata.json` + the cover report +
 * `README.txt` from the seam.
 *
 * Asserted here rather than in Vitest for two things only the real bundle
 * can show: that the ZIP the browser hands over actually contains the
 * manuscripts (a Blob that unzips is not the same as a Blob that
 * resolves), and that the whole step fires zero `/api`.
 *
 * The setup is the long half - the wizard gates on complete metadata and
 * a passing cover, which is `kdp-cover-offline.spec.ts`'s whole subject.
 * Shared with it by shape rather than by import, because a helper file
 * that both specs depend on makes a failure in one read as a failure in
 * the other.
 */

import {test, expect, type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import path from "node:path";
import {unzipSync, strFromU8} from "fflate";

const PASSING_COVER = path.resolve(__dirname, "../fixtures/kdp-cover-pass.png");
const DESCRIPTION =
    "Ein Kater beobachtet die Stadt und beschliesst zu bleiben, was ihn teuer zu stehen kommt.";

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

/** Clicks save and waits for the write to finish. Same reasoning as the
 *  cover spec's: the button is already enabled, so waiting on it returns
 *  at once and the next navigation kills the write mid-flight. */
async function saveMetadata(page: Page): Promise<void> {
    await expect(page.locator(".Toastify__toast")).toHaveCount(0, {timeout: 15_000});
    await page.getByTestId("metadata-save").click();
    await expect(page.locator(".Toastify__toast--success").first()).toBeVisible({
        timeout: 15_000,
    });
    await expect(page.locator(".Toastify__toast--error")).toHaveCount(0);
}

/** A prose book that passes step 0: title, author, description, a
 *  chapter, and a cover the KDP check accepts. */
async function completeBook(page: Page, title: string): Promise<string> {
    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill(title);
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page
        .getByRole("button", {name: new RegExp(title)})
        .first()
        .click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    const bookPath = new URL(page.url()).pathname;

    await page.getByTestId("chapter-add-trigger").click();
    await page.getByRole("menuitem", {name: /Neues Kapitel|New Chapter/}).click();
    await page.locator('[role="dialog"] input').fill("Kapitel 1");
    await page.getByTestId("app-dialog-confirm").click();
    await expect(page.locator('[data-testid^="chapter-item-"]').first()).toBeVisible({
        timeout: 15_000,
    });
    // A chapter with no content exports as an empty EPUB section, which
    // still packages - but the point here is a manuscript with bytes in
    // it, so give it a sentence.
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Der Kater sass auf dem Dach und wartete.");

    await page.goto(`${bookPath}?view=metadata`);
    const description = page.getByLabel(/Beschreibung|Description/).first();
    await expect(description).toBeVisible({timeout: 15_000});
    await description.fill(DESCRIPTION);
    await saveMetadata(page);

    await page.goto(`${bookPath}?view=metadata`);
    await page.getByTestId("metadata-tab-design").click();
    await page.getByTestId("cover-upload-input").setInputFiles(PASSING_COVER);
    await expect(page.getByTestId("cover-preview-img")).toHaveAttribute("src", /^blob:/, {
        timeout: 15_000,
    });
    await saveMetadata(page);
    return bookPath;
}

/**
 * Walk the wizard from the metadata step to the export step.
 *
 * Seven steps since Phase 2 - metadata, cover, format, pricing, ARC,
 * export, guide - and the nav's Next carries the CURRENT index
 * (`step-{n}-next`), so reaching the export step means clicking five of
 * them. Walked rather than deep-linked because the format the export
 * step packages with comes from the machine this walk populates.
 *
 * ExportPackage's own testids still read `step-2-*` from when it was the
 * third step. Left alone here: renaming them is a change to the
 * component's contract with its Vitest suite, not to this spec.
 */
async function openExportStep(page: Page): Promise<void> {
    await page.getByTestId("metadata-open-kdp-wizard").click();
    await expect(page.getByTestId("kdp-publishing-wizard-dialog")).toBeVisible();

    await expect(
        page.getByTestId("kdp-publishing-wizard-step-0-summary-ok"),
    ).toBeVisible({timeout: 15_000});
    const errorList = page.getByTestId("kdp-publishing-wizard-step-0-error-list");
    if (await errorList.count()) {
        throw new Error(`step 0 is still blocked by: ${await errorList.innerText()}`);
    }
    await page.getByTestId("kdp-publishing-wizard-step-0-next").click();

    await expect(
        page.getByTestId("kdp-publishing-wizard-step-1-summary-ok"),
    ).toBeVisible({timeout: 15_000});

    // Cover -> format -> pricing -> ARC -> export. Each Next is asserted
    // enabled first: a step that gates on something unmet leaves it
    // disabled, and a bare click would time out without saying which step
    // refused.
    for (const step of [1, 2, 3, 4]) {
        if (step === 3) {
            // The pricing step's ADVANCE guard is `royalty_plan !== null`
            // and nothing preselects one, so the walk has to make the
            // choice a user would. Which plan is picked never reaches the
            // package - it only unlocks the step.
            await page
                .getByTestId("kdp-publishing-wizard-step-2-royalty-70")
                .check();
        }
        const next = page.getByTestId(`kdp-publishing-wizard-step-${step}-next`);
        await expect(next, `step ${step} would not let the wizard advance`).toBeEnabled({
            timeout: 15_000,
        });
        await next.click();
    }

    await expect(page.getByTestId("kdp-publishing-wizard-step-2-export")).toBeVisible({
        timeout: 15_000,
    });
}

test("the package is assembled in the browser, with no /api call", async ({page}) => {
    test.setTimeout(180_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });
    // Collected so a build that fails inside the browser says why. The step
    // reports a caught failure in its own banner, but an uncaught one only
    // exists here.
    const noise: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") noise.push(message.text());
    });
    page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

    await completeBook(page, "Der Kater auf dem Dach");
    await openExportStep(page);

    // The note is the user-facing half of the port: the interior comes out
    // of pdfmake rather than WeasyPrint, and the step says so BEFORE the
    // click rather than shipping a proof PDF as press-ready.
    await expect(
        page.getByTestId("kdp-publishing-wizard-step-2-client-note"),
    ).toBeVisible();

    // Raced against the step's own error banner rather than waited for
    // alone: a bare download wait reports nothing but "no download in two
    // minutes", which is true of every way this can break.
    const errorBanner = page.getByTestId("kdp-publishing-wizard-step-2-error");
    const downloaded = page
        .waitForEvent("download", {timeout: 120_000})
        .catch(() => null);
    const failed = errorBanner
        .waitFor({state: "visible", timeout: 120_000})
        .then(() => null)
        .catch(() => null);
    await page.getByTestId("kdp-publishing-wizard-step-2-generate").click();
    const file = await Promise.race([downloaded, failed]);
    if (!file) {
        const reported = (await errorBanner.count())
            ? await errorBanner.innerText()
            : "(the step reported nothing)";
        throw new Error(
            `the package was never produced.\nstep said: ${reported}\n` +
                `console: ${noise.join("\n          ") || "(quiet)"}`,
        );
    }
    expect(file.suggestedFilename()).toBe("der-kater-auf-dem-dach-kdp-package.zip");

    // The archive, not just the download event: a zero-byte Blob would
    // satisfy the event, and a ZIP that opens but carries no manuscript
    // is the failure this port can produce quietly.
    const zipPath = await file.path();
    expect(zipPath, "the download produced no file").toBeTruthy();
    const entries = unzipSync(new Uint8Array(readFileSync(zipPath!)));
    const names = Object.keys(entries).sort();
    expect(names).toContain("metadata.json");
    expect(names).toContain("cover-validation-report.json");
    expect(names).toContain("publishing-state-snapshot.json");
    expect(names).toContain("README.txt");
    expect(names).toContain("manuscript-ebook.epub");
    expect(names.some((name) => name.startsWith("cover."))).toBe(true);

    // An EPUB is a ZIP whose first entry is an uncompressed `mimetype`,
    // so these four bytes are what distinguishes a real one from an empty
    // placeholder with the right name.
    const epub = entries["manuscript-ebook.epub"];
    expect(epub.byteLength).toBeGreaterThan(500);
    expect(strFromU8(epub.subarray(30, 38))).toBe("mimetype");

    const metadata = JSON.parse(strFromU8(entries["metadata.json"]));
    expect(metadata.title).toBe("Der Kater auf dem Dach");
    expect(metadata.language).toBe("German");
    expect(metadata.generated_by).toMatch(/^Bibliogon v/);

    // Stated in the package, because the ZIP outlives the step.
    expect(strFromU8(entries["README.txt"])).toContain("rendered in your browser");

    expect(apiCalls, `the offline package build hit the backend:\n${apiCalls.join("\n")}`).toEqual(
        [],
    );
});
