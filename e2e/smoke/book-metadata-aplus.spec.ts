/**
 * A+ Content section in the book metadata (#887).
 *
 * The A+ plugin (#825) shipped backend-only: visible in the plugin list,
 * reachable from nowhere in the UI. This smoke pins the integration:
 *   - the "A+ Content" item sits in the Veröffentlichung group of the
 *     metadata nav and opens a section of real, user-visible height
 *   - Generate posts to the plugin and renders the package with its
 *     validator findings; a second click regenerates with force=true
 *   - a missing-fields answer lists the field and jumps to the section
 *     that holds it
 *
 * The AI and the A+ endpoints are route-mocked (no LLM call). The plugin
 * status mock lights up AI the same way ai-review.spec.ts does.
 */

import {test, expect, createBook} from "../fixtures/base";
import type {Page, Route} from "@playwright/test";

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
            aspect_ratio: "97:30",
            size: "970x300",
            style_flags: [],
            rendered: "a small boat on a stormy sea, 970x300, 97:30",
        },
        alt_text: "Ein kleines Boot auf stürmischer See",
    },
    module_three_images: [],
    validation: [{field: "short_description", severity: "warning", message: "Kürzer wäre besser"}],
    meta: {
        book_id: "x",
        language: "de",
        model: "claude-sonnet-4-6",
        ruleset_version: "1",
        generated_at: "2026-09-22T08:00:00Z",
    },
};

async function enableAi(page: Page) {
    await page.route("**/api/editor/plugin-status", (route: Route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ai: {available: true, reason: null, message: ""}}),
        }),
    );
}

/** Route-mock the A+ plugin; returns the list of generate URLs it saw. */
async function mockAplus(page: Page, generateBody: unknown): Promise<string[]> {
    const generateCalls: string[] = [];
    await page.route("**/api/aplus/**", (route: Route) => {
        const url = route.request().url();
        if (route.request().method() === "POST" && url.includes("/generate")) {
            generateCalls.push(url);
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(generateBody),
            });
        }
        return route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({detail: "No A+ Content generated yet"}),
        });
    });
    return generateCalls;
}

test.describe("Book-metadata A+ Content (#887)", () => {
    test("A+ section opens from the nav, generates and regenerates", async ({page}) => {
        await enableAi(page);
        const generateCalls = await mockAplus(page, PACKAGE);
        const book = await createBook("A+ Smoke Buch", "E2E Autor");
        await page.goto(`/book/${book.id}?view=metadata`);

        const navItem = page.getByTestId("metadata-tab-aplus");
        await expect(navItem).toBeVisible({timeout: 10000});
        await navItem.click();

        const section = page.getByTestId("aplus-section");
        await expect(section).toBeVisible();
        await expect(page.getByTestId("aplus-empty")).toBeVisible();

        const generate = page.getByTestId("aplus-generate");
        await expect(generate).toBeEnabled();
        await generate.click();

        await expect(page.getByTestId("aplus-package")).toBeVisible();
        await expect(section).toContainText("Ein Roman über Mut, Freundschaft und das Meer.");
        await expect(page.getByTestId("aplus-findings")).toContainText("Kürzer wäre besser");
        await expect(page.getByTestId("aplus-copy-header-prompt")).toBeVisible();
        expect(generateCalls[0]).not.toContain("force=true");

        const bbox = await section.boundingBox();
        expect(bbox).not.toBeNull();
        expect(bbox!.height).toBeGreaterThan(200);

        await generate.click();
        await expect.poll(() => generateCalls.length).toBe(2);
        expect(generateCalls[1]).toContain("force=true");
    });

    test("missing fields are listed and link to the section holding them", async ({page}) => {
        await enableAi(page);
        await mockAplus(page, {
            book_id: "x",
            missing_fields: [
                {field: "description", reason: "At least one description field is required."},
            ],
        });
        const book = await createBook("A+ Missing Buch", "E2E Autor");
        await page.goto(`/book/${book.id}?view=metadata`);

        await page.getByTestId("metadata-tab-aplus").click();
        await page.getByTestId("aplus-generate").click();

        await expect(page.getByTestId("aplus-missing")).toBeVisible();
        await page.getByTestId("aplus-missing-goto-description").click();
        await expect(page.getByTestId("metadata-tab-general")).toHaveAttribute("aria-current", "page");
    });
});
