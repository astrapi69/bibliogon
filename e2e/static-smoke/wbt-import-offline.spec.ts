/**
 * A write-book-template project imports on the static Dexie build (#736).
 *
 * The whole point of porting the importer is that the backendless web app
 * can take a book project, so the gate is the user's own path: build a real
 * archive, drop it in the import dialog, and read the book back out of
 * IndexedDB through the editor.
 *
 * What the assertions are for, beyond "a book appeared":
 *
 *  - The chapter ORDER and TITLES come from the ported planners. A title
 *    taken from the first `# ` line rather than the filename, and
 *    front-matter before the chapters, is what tells us the plan ran and not
 *    some simpler fallback.
 *  - The chapter BODY is read back as prose. The content is stored as a
 *    TipTap document, so visible paragraph text means the Markdown was
 *    converted and not stored raw - the #787 failure mode.
 *  - Not one `/api` request. The archive used to be desktop-only; an import
 *    that quietly reached a backend would pass every other assertion here
 *    and fail on GitHub Pages.
 */

import {test, expect} from "@playwright/test";
import {zipSync, strToU8} from "fflate";

const METADATA = `title: Der lange Weg
subtitle: Ein Bericht
author: Asterios Raptis
language: de
publisher: Selbstverlag
isbn_ebook: "978-3-16-148410-0"
keywords:
  - Reise
  - Bericht
cover_image: cover.png
`;

/** A 1x1 PNG, so the cover is a real image rather than a named empty file. */
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
);

function projectArchive(): Buffer {
    return Buffer.from(
        zipSync({
            "config/metadata.yaml": strToU8(METADATA),
            "manuscript/front-matter/dedication.md": strToU8(
                "# Fuer Niemand\n\nUnd doch fuer alle.\n",
            ),
            "manuscript/chapters/01-der-aufbruch.md": strToU8(
                "# Der Aufbruch\n\nAm Morgen war der Hof noch leer.\n",
            ),
            "manuscript/chapters/02-die-rueckkehr.md": strToU8(
                "Kein Titel in dieser Datei.\n",
            ),
            "assets/covers/cover.png": new Uint8Array(PNG),
        }),
    );
}

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

test("a write-book-template archive imports into Dexie with no backend", async ({page}) => {
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

    await page.goto("/");
    await page.getByTestId("import-wizard-btn").click();
    await expect(page.getByTestId("offline-import-dialog")).toBeVisible();

    await page.getByTestId("offline-import-input").setInputFiles({
        name: "der-lange-weg.bgp",
        mimeType: "application/zip",
        buffer: projectArchive(),
    });

    // Detection is the first thing that can go wrong, and the one whose
    // failure the later assertions would not explain.
    await expect(page.getByTestId("offline-import-format-wbt-zip")).toBeVisible({
        timeout: 20_000,
    });

    const errorToast = page.locator(".Toastify__toast--error");
    await page.getByTestId("offline-import-confirm").click();

    const closed = page
        .getByTestId("offline-import-dialog")
        .waitFor({state: "detached", timeout: 60_000})
        .then(() => true)
        .catch(() => false);
    const failed = errorToast
        .first()
        .waitFor({state: "visible", timeout: 60_000})
        .then(() => false)
        .catch(() => false);
    if (!(await Promise.race([closed, failed]))) {
        const reported = (await errorToast.count())
            ? await errorToast.first().innerText()
            : "(no error was reported)";
        throw new Error(
            `the project was never imported.\ntoast said: ${reported}\n` +
                `console: ${noise.join("\n         ") || "(quiet)"}`,
        );
    }

    // The book is read back out of IndexedDB by the dashboard.
    await expect(page.getByText("Der lange Weg").first()).toBeVisible({timeout: 20_000});
    await page.getByText("Der lange Weg").first().click();
    await page.waitForURL(/\/book\/[^/]+/, {timeout: 20_000});

    const sidebar = page.getByTestId("chapter-sidebar");
    await expect(sidebar).toBeVisible({timeout: 20_000});

    // Titles: the first `# ` line wins, and a file without one falls back to
    // its title-cased filename stem - both the planner's rules.
    await expect(sidebar.getByText("Der Aufbruch", {exact: false})).toBeVisible();
    await expect(sidebar.getByText("Die Rueckkehr", {exact: false})).toBeVisible();
    // Front matter sits before the chapters (position base 0 against 100).
    const titles = await sidebar.locator("[data-testid^='chapter-item-']").allInnerTexts();
    const dedication = titles.findIndex((text) => text.includes("Fuer Niemand"));
    const first = titles.findIndex((text) => text.includes("Der Aufbruch"));
    expect(dedication, `no dedication among ${JSON.stringify(titles)}`).toBeGreaterThanOrEqual(0);
    expect(dedication).toBeLessThan(first);

    // The body is prose in the editor, which it can only be if the Markdown
    // became a TipTap document on the way in.
    await sidebar.getByText("Der Aufbruch", {exact: false}).first().click();
    await expect(page.getByText("Am Morgen war der Hof noch leer.")).toBeVisible({
        timeout: 20_000,
    });

    expect(apiCalls, `offline build fired /api: ${apiCalls.join(", ")}`).toEqual([]);
});
