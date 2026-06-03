/**
 * ARTICLE-TYPES-SSOT-01 (renamed to ContentType) C9 (2026-05-29).
 *
 * Playwright smoke covering the content-types arc end-to-end in
 * a real browser:
 *
 * 1. The AD split-button's chevron opens a dropdown listing the
 *    non-default article-types (registry-driven; we assert on
 *    the canonical 4 non-default labels). Per the
 *    "Radix DropdownMenu + happy-dom" lessons-learned rule, this
 *    is the right surface for that interaction — happy-dom
 *    portals are too brittle for unit-tests.
 * 2. Clicking a non-default item creates an article with that
 *    content_type (verified via GET /api/articles/{id}).
 * 3. The default primary-click creates a "blogpost" article.
 * 4. The ArticleEditor sidebar's type selector shows the
 *    current type + a description hint + a working onChange that
 *    persists the new content_type via PATCH.
 * 5. Switching to "tutorial" reveals the 3 type-specific
 *    extra_fields inputs; values persist.
 * 6. The AD list renders an article-type badge per row + per
 *    card.
 *
 * Test cleanup: each test soft-deletes its own articles via
 * DELETE /api/articles/{id} so the dashboard stays clean for
 * downstream tests.
 */

import {test, expect} from "../fixtures/base";

const API = "http://localhost:8000/api";

async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json();
}

async function deleteArticle(id: string): Promise<void> {
    await fetch(`${API}/articles/${id}`, {method: "DELETE"});
}

interface ArticleResponse {
    id: string;
    title: string;
    content_type: string;
    article_metadata: Record<string, unknown>;
}

test.describe("ARTICLE-TYPES-SSOT-01 (renamed to ContentType) content-types arc", () => {
    test("primary 'Neuer Artikel' click creates a blogpost", async ({page}) => {
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        await page.getByTestId("article-list-new").click();

        // The redirect lands on /articles/{id}; capture the id from URL.
        await page.waitForURL(/\/articles\/[a-z0-9]+/i);
        const id = page.url().split("/").pop()!;

        const article = await getJson<ArticleResponse>(`/articles/${id}`);
        expect(article.content_type).toBe("blogpost");

        await deleteArticle(id);
    });

    test("chevron dropdown shows non-default article-types", async ({page}) => {
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        await page.getByTestId("new-article-chevron").click();

        // The 4 non-default types (default=blogpost is omitted).
        // testid pattern: new-article-menu-item-{kebab-id}; the
        // short_story id has an underscore so kebab-replaced.
        await expect(
            page.getByTestId("new-article-menu-item-tutorial"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-review"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-essay"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-newsletter"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-interview"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-listicle"),
        ).toBeVisible();
        await expect(
            page.getByTestId("new-article-menu-item-short-story"),
        ).toBeVisible();

        // Close the menu (Escape).
        await page.keyboard.press("Escape");
    });

    test("selecting 'tutorial' creates a tutorial article", async ({page}) => {
        await page.goto("/articles");
        await expect(page.getByTestId("article-list-page")).toBeVisible();

        await page.getByTestId("new-article-chevron").click();
        await page.getByTestId("new-article-menu-item-tutorial").click();

        await page.waitForURL(/\/articles\/[a-z0-9]+/i);
        const id = page.url().split("/").pop()!;

        const article = await getJson<ArticleResponse>(`/articles/${id}`);
        expect(article.content_type).toBe("tutorial");

        await deleteArticle(id);
    });

    test("editor type selector switches type + reveals extra fields", async ({
        page,
    }) => {
        // Seed: create a blogpost via the primary click.
        await page.goto("/articles");
        await page.getByTestId("article-list-new").click();
        await page.waitForURL(/\/articles\/[a-z0-9]+/i);
        const id = page.url().split("/").pop()!;

        // Editor sidebar's type selector is present.
        const typeSelect = page.getByTestId("article-editor-content-type-trigger");
        await expect(typeSelect).toBeVisible();
        await expect(typeSelect).toHaveAttribute("data-value", "blogpost");

        // Description hint surfaces.
        await expect(
            page.getByTestId("article-editor-content-type-description"),
        ).toBeVisible();

        // Switch to tutorial.
        await typeSelect.click();
        await page
            .getByTestId("article-editor-content-type-item-tutorial")
            .click();

        // Wait for persistMeta to flush + re-render with the new
        // extra_fields section.
        await expect(
            page.getByTestId("article-type-fields-section"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-type-field-difficulty_level-trigger"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-type-field-prerequisites"),
        ).toBeVisible();
        await expect(
            page.getByTestId("article-type-field-estimated_duration_minutes"),
        ).toBeVisible();

        // Set the difficulty + persist.
        await page
            .getByTestId("article-type-field-difficulty_level-trigger")
            .click();
        await page
            .getByTestId("article-type-field-difficulty_level-item-advanced")
            .click();

        // Wait for the auto-save.
        await page.waitForTimeout(500);

        const article = await getJson<ArticleResponse>(`/articles/${id}`);
        expect(article.content_type).toBe("tutorial");
        expect(article.article_metadata.difficulty_level).toBe("advanced");

        await deleteArticle(id);
    });

    test("AD list renders article-type badge per row", async ({page}) => {
        // Seed a tutorial article so the badge renders the tutorial
        // label (or fallback id).
        await page.goto("/articles");
        await page.getByTestId("new-article-chevron").click();
        await page.getByTestId("new-article-menu-item-tutorial").click();
        await page.waitForURL(/\/articles\/[a-z0-9]+/i);
        const id = page.url().split("/").pop()!;

        // Back to the list. Wait for the row to render before probing
        // the badge — isVisible() does not auto-wait, so a still-
        // loading list would make both probes false.
        await page.goto("/articles");
        await expect(page.getByTestId(`article-bulk-check-${id}`)).toBeVisible();

        // The badge is present regardless of view-mode (grid:
        // ``article-card-type-{id}``; list: ``article-list-row-type-{id}``).
        const cardBadge = page.getByTestId(`article-card-type-${id}`);
        const rowBadge = page.getByTestId(`article-list-row-type-${id}`);

        const eitherVisible = (await cardBadge.isVisible()) || (await rowBadge.isVisible());
        expect(eitherVisible).toBeTruthy();

        await deleteArticle(id);
    });
});
