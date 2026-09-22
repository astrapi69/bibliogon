/**
 * A+ Content in the book metadata (#887, #891), against the real backend.
 *
 * The author fills the A+ document by hand: typed fields are saved through
 * the storage seam into `aplus_documents` and survive a reload, modules are
 * added from templates. "Fill with AI" is optional; its AI call and the
 * plugin status are route-mocked (no LLM), the save of the filled document
 * is real. The layout must fit a phone-width viewport.
 */

import {test, expect, createBook} from "../fixtures/base";
import type {Page, Route} from "@playwright/test";

const API = "http://localhost:8000/api";

const PACKAGE = {
    short_description: "Ein Roman über Mut, Freundschaft und das Meer.",
    bullets: [
        {heading: "Spannend", body: "Ein Sturm, der alles verändert."},
        {heading: "Berührend", body: "Zwei Freunde, ein Versprechen."},
        {heading: "Atmosphärisch", body: "Salzluft auf jeder Seite."},
    ],
    module_header: {
        title: "Das Meer ruft",
        text: "Eine Geschichte über den Mut, loszulassen.",
        image: {
            prompt: "a small boat on a stormy sea",
            aspect_ratio: "97:60",
            size: "970x600",
            style_flags: [],
            rendered: "a small boat on a stormy sea --ar 97:60",
        },
        alt_text: "Ein kleines Boot auf stürmischer See",
    },
    module_three_images: [],
    validation: [{field: "short_description", severity: "warning", message: "Kürzer wäre besser"}],
    meta: {book_id: "x", language: "de", model: "m", ruleset_version: "3", generated_at: "2026-09-22T08:00:00Z"},
};

type StoredDocument = {language: string; short_description: string; modules: {template: string; slots: {image_prompt: string}[]}[]};

async function storedDocuments(bookId: string): Promise<StoredDocument[]> {
    const res = await fetch(`${API}/aplus/${bookId}/documents`);
    return res.ok ? res.json() : [];
}

async function enableAi(page: Page) {
    await page.route("**/api/editor/plugin-status", (route: Route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ai: {available: true, reason: null, message: ""}}),
        }),
    );
}

async function mockGenerate(page: Page, body: unknown) {
    await page.route("**/api/aplus/*/generate**", (route: Route) =>
        route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)}),
    );
}

async function openAplus(page: Page, bookId: string) {
    await page.goto(`/book/${bookId}?view=metadata`);
    const navItem = page.getByTestId("metadata-tab-aplus");
    await expect(navItem).toBeVisible({timeout: 10000});
    await navItem.click();
    await expect(page.getByTestId("aplus-content-name")).toBeVisible();
}

test.describe("Book-metadata A+ Content (#891)", () => {
    test("typed fields and an added module are saved and survive a reload", async ({page}) => {
        const book = await createBook("A+ Handarbeit", "E2E Autor");
        await openAplus(page, book.id);

        await expect(page.getByTestId("aplus-content-name")).toHaveValue("A+ Handarbeit - A+Content");
        await page.getByTestId("aplus-short-description").fill("Filimón ist ein Pferd, das lachen kann.");
        await expect(page.getByTestId("aplus-short-description-char-count")).toContainText("/ 300");
        await page.getByTestId("aplus-add-three_images_text").click();
        await page.getByTestId("aplus-module-2-slot-1-prompt").fill("flooded bathroom, laughing horse --ar 1:1");

        await expect
            .poll(async () => (await storedDocuments(book.id))[0]?.modules?.[2]?.slots?.[1]?.image_prompt, {
                timeout: 15000,
            })
            .toBe("flooded bathroom, laughing horse --ar 1:1");

        await page.reload();
        await page.getByTestId("metadata-tab-aplus").click();
        await expect(page.getByTestId("aplus-short-description")).toHaveValue(
            "Filimón ist ein Pferd, das lachen kann.",
        );
        await expect(page.getByTestId("aplus-module-2")).toContainText("300x300");
        await expect(page.getByTestId("aplus-module-2-slot-1-prompt")).toHaveValue(
            "flooded bathroom, laughing horse --ar 1:1",
        );
    });

    test("fill with AI fills the fields, shows the findings and saves", async ({page}) => {
        await enableAi(page);
        await mockGenerate(page, PACKAGE);
        const book = await createBook("A+ KI Buch", "E2E Autor");
        await openAplus(page, book.id);

        const fill = page.getByTestId("aplus-ai-fill");
        await expect(fill).toBeEnabled();
        await fill.click();

        await expect(page.getByTestId("aplus-short-description")).toHaveValue(PACKAGE.short_description);
        await expect(page.getByTestId("aplus-bullet-2-heading")).toHaveValue("Atmosphärisch");
        await expect(page.getByTestId("aplus-module-0-slot-0-prompt")).toHaveValue(
            "a small boat on a stormy sea --ar 97:60",
        );
        await expect(page.getByTestId("aplus-findings")).toContainText("Kürzer wäre besser");
        await expect
            .poll(async () => (await storedDocuments(book.id))[0]?.short_description, {timeout: 15000})
            .toBe(PACKAGE.short_description);
    });

    test("missing fields are listed and link to the section holding them", async ({page}) => {
        await enableAi(page);
        await mockGenerate(page, {
            book_id: "x",
            missing_fields: [{field: "description", reason: "At least one description field is required."}],
        });
        const book = await createBook("A+ Missing Buch", "E2E Autor");
        await openAplus(page, book.id);

        await page.getByTestId("aplus-ai-fill").click();
        await expect(page.getByTestId("aplus-missing")).toBeVisible();
        await page.getByTestId("aplus-missing-goto-description").click();
        await expect(page.getByTestId("metadata-tab-general")).toHaveAttribute("aria-current", "page");
    });

    test("the editor fits a phone-width viewport", async ({page}) => {
        await page.setViewportSize({width: 400, height: 860});
        const book = await createBook("A+ Mobil", "E2E Autor");
        await page.goto(`/book/${book.id}?view=metadata`);
        await page.getByTestId("navigation-sidebar-mobile-trigger").click();
        await page.getByTestId("metadata-tab-aplus-mobile").click();
        const prompt = page.getByTestId("aplus-module-1-slot-2-prompt");
        await prompt.scrollIntoViewIfNeeded();
        await expect(prompt).toBeVisible();
        const box = await prompt.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(400);
        const addButton = await page.getByTestId("aplus-add-image_header_text").boundingBox();
        expect(addButton!.height).toBeGreaterThanOrEqual(44);
    });
});
