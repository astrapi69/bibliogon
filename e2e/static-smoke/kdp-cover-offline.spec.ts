/**
 * KDP cover validation on the static Dexie build, with no backend (#739).
 *
 * The cover step reads the format from the filename, the dimensions from
 * the rendered image and the byte length from IndexedDB, so it reaches a
 * verdict offline and fires no `/api` request. This walks both verdicts
 * with real PNGs: a 300x480 cover draws the too-small error and blocks
 * the step, a 640x1024 one passes and lets the wizard advance - the path
 * `e2e/smoke/kdp-publishing-wizard.spec.ts` deferred for want of exactly
 * these fixtures.
 */

import {test, expect} from "@playwright/test";
import path from "node:path";

const FIXTURES = path.resolve(__dirname, "../fixtures");
const TOO_SMALL = path.join(FIXTURES, "kdp-cover-too-small.png");
const PASSING = path.join(FIXTURES, "kdp-cover-pass.png");

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

test("the cover step reaches both verdicts offline, without any /api call", async ({page}) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });

    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("Der Kater auf dem Dach");
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page.getByRole("button", {name: /Der Kater auf dem Dach/}).first().click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    const bookPath = new URL(page.url()).pathname;

    // The metadata check gates step 0 on a description, so set one.
    await page.goto(`${bookPath}?view=metadata`);
    const description = page.getByLabel(/Beschreibung|Description/).first();
    await expect(description).toBeVisible({timeout: 15_000});
    await description.fill("Ein Kater beobachtet die Stadt und beschliesst zu bleiben.");
    await saveMetadata(page);

    await uploadCover(page, bookPath, TOO_SMALL);
    await openCoverStep(page);
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-dimensions")).toContainText(
        /300\D+480/,
    );
    await expect(
        page.getByTestId("kdp-publishing-wizard-step-1-error-dimensions_too_small"),
    ).toBeVisible();
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-summary-fail")).toBeVisible();
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-next")).toBeDisabled();
    await page.getByTestId("kdp-publishing-wizard-close").click();

    await uploadCover(page, bookPath, PASSING);
    await openCoverStep(page);
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-dimensions")).toContainText(
        /640\D+1024/,
    );
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-summary-ok")).toBeVisible();
    const next = page.getByTestId("kdp-publishing-wizard-step-1-next");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByTestId("kdp-publishing-wizard-step-dot-2")).toHaveAttribute(
        "aria-current",
        "step",
    );

    expect(apiCalls).toEqual([]);
});

/** Saving is awaited rather than fired: navigating on the bare click
 *  destroys the context mid-write and the row never gets the change. */
async function saveMetadata(page: import("@playwright/test").Page) {
    await page.getByTestId("metadata-save").click();
    await expect(page.getByTestId("metadata-save")).toBeEnabled();
}

async function uploadCover(
    page: import("@playwright/test").Page,
    bookPath: string,
    file: string,
) {
    await page.goto(`${bookPath}?view=metadata`);
    await page.getByTestId("metadata-tab-design").click();
    await page.getByTestId("cover-upload-input").setInputFiles(file);
    const preview = page.getByTestId("cover-preview-img");
    await expect(preview).toBeVisible({timeout: 15_000});
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await saveMetadata(page);
}

async function openCoverStep(page: import("@playwright/test").Page) {
    await page.getByTestId("metadata-open-kdp-wizard").click();
    await expect(page.getByTestId("kdp-publishing-wizard-dialog")).toBeVisible();
    await expect(page.getByTestId("kdp-publishing-wizard-step-0-summary-ok")).toBeVisible({
        timeout: 15_000,
    });
    await page.getByTestId("kdp-publishing-wizard-step-0-next").click();
    await expect(page.getByTestId("kdp-publishing-wizard-step-1-cover")).toBeVisible();
}
