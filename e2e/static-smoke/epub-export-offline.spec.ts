/**
 * EPUB export on the static Dexie build, with no backend (#1070).
 *
 * The client EPUB builder had never been run against a built bundle. In
 * Vitest `ejs` - reached through `epub-gen-memory` - gets Node's real
 * `path`; in a browser build Vite substitutes a stub whose members are
 * `undefined`, and ejs reads `path.extname` on every chapter render. So
 * `toEpubBlob` threw `r.extname is not a function` in the shipped app
 * while the suite stayed green.
 *
 * This is the pin for that: it exports an EPUB from the real bundle and
 * reads the bytes, because a download event alone would be satisfied by
 * an empty Blob with the right name.
 *
 * `static-smoke/bulk-export-offline.spec.ts` covers Markdown and the
 * picture-book / comic specs cover PDF - EPUB is the format that had no
 * browser-level coverage at all, which is how the bug shipped.
 *
 * Driven through `ClientExportMenu`, which is what the export page renders
 * when the client engine is in play; `ExportForm` is the backend path and
 * never appears offline.
 */

import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {unzipSync, strFromU8} from "fflate";

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

test("a book exports as a readable EPUB with no /api call", async ({page}) => {
    test.setTimeout(120_000);
    const apiCalls: string[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.includes("/api/")) apiCalls.push(request.url());
    });
    // The original failure was a caught exception shown in a toast, so the
    // console is where the cause lives when this breaks again.
    const noise: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") noise.push(message.text());
    });
    page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

    await page.goto("/books/new?type=prose");
    await page.getByTestId("create-book-title").fill("Das Dach der Welt");
    const author = page.getByTestId("create-book-author");
    if (await author.isVisible()) await author.fill("Asterios Raptis");
    await page.getByTestId("create-book-submit").click();
    await page
        .getByRole("button", {name: /Das Dach der Welt/})
        .first()
        .click();
    await page.waitForURL(/\/book\/[^/?]+/, {timeout: 20_000});
    const bookId = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByTestId("chapter-add-trigger").click();
    await page.getByRole("menuitem", {name: /Neues Kapitel|New Chapter/}).click();
    await page.locator('[role="dialog"] input').fill("Kapitel 1");
    await page.getByTestId("app-dialog-confirm").click();
    await expect(page.locator('[data-testid^="chapter-item-"]').first()).toBeVisible({
        timeout: 15_000,
    });
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Oben auf dem Dach beginnt die Geschichte.");

    // Offline the export page renders `ClientExportMenu`, not the
    // backend-driven `ExportForm` - the client engine is the whole point
    // of the page here.
    await page.goto(`/books/${bookId}/export`);
    await page.getByTestId("export-page-client-trigger").click();

    const errorToast = page.locator(".Toastify__toast--error");
    const downloaded = page.waitForEvent("download", {timeout: 60_000}).catch(() => null);
    const failed = errorToast
        .first()
        .waitFor({state: "visible", timeout: 60_000})
        .then(() => null)
        .catch(() => null);
    await page.getByTestId("client-export-epub").click();
    const file = await Promise.race([downloaded, failed]);
    if (!file) {
        const reported = (await errorToast.count())
            ? await errorToast.first().innerText()
            : "(no error was reported)";
        throw new Error(
            `the EPUB was never produced.\ntoast said: ${reported}\n` +
                `console: ${noise.join("\n         ") || "(quiet)"}`,
        );
    }
    expect(file.suggestedFilename()).toMatch(/\.epub$/);

    // An EPUB is a ZIP whose first entry is a stored (uncompressed)
    // `mimetype`, so these bytes at a fixed offset are what separates a
    // real one from a renamed empty archive.
    const epubPath = await file.path();
    expect(epubPath, "the download produced no file").toBeTruthy();
    const bytes = new Uint8Array(readFileSync(epubPath!));
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(strFromU8(bytes.subarray(30, 38))).toBe("mimetype");

    const entries = unzipSync(bytes);
    const names = Object.keys(entries);
    expect(names).toContain("mimetype");
    expect(strFromU8(entries["mimetype"])).toBe("application/epub+zip");
    expect(names).toContain("META-INF/container.xml");
    // The chapter XHTML is what ejs renders, and the render is the call
    // that used to throw - so the chapter's own text is the assertion
    // that the template actually ran.
    const chapter = names.find((name) => name.endsWith(".xhtml") && !name.includes("toc"));
    expect(chapter, `no chapter XHTML in the EPUB: ${names.join(", ")}`).toBeTruthy();
    expect(strFromU8(entries[chapter!])).toContain("Oben auf dem Dach");

    expect(apiCalls, `the offline EPUB export hit the backend:\n${apiCalls.join("\n")}`).toEqual(
        [],
    );
});
