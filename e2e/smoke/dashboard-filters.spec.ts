/**
 * Smoke tests for the dashboard search, filter and sort feature.
 *
 * Seeds 4 books with distinct genres and languages via the API,
 * then exercises the filter bar: text search, genre dropdown,
 * language dropdown, sort direction toggle, reset, empty state
 * and URL param persistence.
 *
 * The createBook helper needs genre + language parameters. The
 * books API accepts these fields on POST, so we PATCH them in
 * after creation since the helper signature is minimal.
 */

import {test, expect, createBook} from "../fixtures/base";
import type {Page} from "@playwright/test";

const API = "http://localhost:8000/api";

async function patchBook(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`${API}/books/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`PATCH book: ${res.status}`);
}

interface SeedResult {
    krimiDe: {id: string};
    krimiEn: {id: string};
    sciFiDe: {id: string};
    romanFr: {id: string};
}

async function seedFourBooks(): Promise<SeedResult> {
    const krimiDe = await createBook("Der Mörder war der Gärtner", "Müller");
    await patchBook(krimiDe.id, {genre: "Krimi", language: "de"});

    const krimiEn = await createBook("The Butler Did It", "Smith");
    await patchBook(krimiEn.id, {genre: "Krimi", language: "en"});

    const sciFiDe = await createBook("Sternenstaub", "Raptis");
    await patchBook(sciFiDe.id, {genre: "Science Fiction", language: "de"});

    const romanFr = await createBook("Le Petit Prince", "Saint-Exupéry");
    await patchBook(romanFr.id, {genre: "Roman", language: "fr"});

    return {krimiDe, krimiEn, sciFiDe, romanFr};
}

async function openDashboard(page: Page) {
    await page.goto("/");
    await expect(page.getByTestId("filter-bar")).toBeVisible();
}

function visibleBookCards(page: Page) {
    // `book-card-{id}` matches both the card root AND the menu trigger
    // button nested inside (`book-card-menu-{id}`). Exclude the menu
    // variants so the locator returns one element per visible card.
    return page.locator("[data-testid^='book-card-']:not([data-testid*='-menu-'])");
}

test.describe("Dashboard filters - text search", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("typing in the search input narrows the book list", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("Mörder");
        // Wait for debounce (200ms)
        await page.waitForTimeout(300);
        const cards = visibleBookCards(page);
        await expect(cards).toHaveCount(1);
    });

    test("search matches on author name", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("Raptis");
        await page.waitForTimeout(300);
        await expect(visibleBookCards(page)).toHaveCount(1);
    });

    test("search matches on genre", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("Krimi");
        await page.waitForTimeout(300);
        await expect(visibleBookCards(page)).toHaveCount(2);
    });
});

test.describe("Dashboard filters - genre dropdown", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("selecting a genre filters to matching books only", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-Krimi").click();
        await expect(visibleBookCards(page)).toHaveCount(2);
    });

    test("selecting 'All genres' shows all books again", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-Krimi").click();
        await expect(visibleBookCards(page)).toHaveCount(2);

        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-all").click();
        await expect(visibleBookCards(page)).toHaveCount(4);
    });
});

test.describe("Dashboard filters - language dropdown", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("selecting a language filters to matching books", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-language-trigger").click();
        await page.getByTestId("filter-language-item-de").click();
        await expect(visibleBookCards(page)).toHaveCount(2);
    });
});

test.describe("Dashboard filters - sort direction", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("clicking sort-title switches to alphabetical, toggle flips direction", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-sort-title").click();
        // First card should be alphabetically first
        const firstCard = visibleBookCards(page).first();
        await expect(firstCard).toContainText("Der Mörder");

        // Toggle to desc: alphabetical reverse of the four seeded titles
        // ["Der Mörder...", "Le Petit Prince", "Sternenstaub", "The
        // Butler Did It"] puts "The Butler Did It" first.
        await page.getByTestId("filter-sort-direction").click();
        const firstAfterFlip = visibleBookCards(page).first();
        await expect(firstAfterFlip).toContainText("The Butler Did It");
    });
});

test.describe("Dashboard filters - reset and empty state", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("reset clears search and genre filter", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("nonexistent");
        await page.waitForTimeout(300);
        await expect(page.getByTestId("filter-empty-state")).toBeVisible();

        await page.getByTestId("filter-reset-empty").click();
        await expect(visibleBookCards(page)).toHaveCount(4);
        await expect(page.getByTestId("filter-empty-state")).not.toBeVisible();
    });

    test("empty state renders when filters match zero books", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("zzz_no_match");
        await page.waitForTimeout(300);
        await expect(page.getByTestId("filter-empty-state")).toBeVisible();
    });

    test("filter-bar reset button clears active filters", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-Krimi").click();
        await expect(visibleBookCards(page)).toHaveCount(2);

        await page.getByTestId("filter-reset").click();
        await expect(visibleBookCards(page)).toHaveCount(4);
    });
});

test.describe("Dashboard filters - URL param persistence", () => {
    test.beforeEach(async () => { await seedFourBooks(); });

    test("genre filter is reflected in the URL", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-Krimi").click();
        // Wait for the debounced URL sync
        await page.waitForTimeout(300);
        expect(page.url()).toContain("genre=Krimi");
    });

    test("navigating to a URL with genre param pre-selects the filter", async ({page}) => {
        await page.goto("/?genre=Krimi");
        await expect(page.getByTestId("filter-bar")).toBeVisible();
        await expect(visibleBookCards(page)).toHaveCount(2);
    });

    test("search query is preserved in URL after debounce", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-search-input").fill("Raptis");
        await page.waitForTimeout(300);
        expect(page.url()).toContain("q=Raptis");
    });

    test("reloading the page restores filters from URL params", async ({page}) => {
        await openDashboard(page);
        await page.getByTestId("filter-genre-trigger").click();
        await page.getByTestId("filter-genre-item-Krimi").click();
        await page.waitForTimeout(300);

        await page.reload();
        await expect(page.getByTestId("filter-bar")).toBeVisible();
        await expect(visibleBookCards(page)).toHaveCount(2);
    });
});
