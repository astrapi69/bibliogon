/**
 * Page object for the Books Dashboard (BD) and Articles Dashboard (AD).
 *
 * Both dashboards share the view-switcher, filter bar, bulk-action bar and
 * trash surfaces, so one object covers both with a `kind` discriminator.
 * data-testid selectors only (i18n-stable); view-agnostic `[data-book-id]`
 * / `[data-article-id]` wrappers per VIEW-MODE-TESTID-PARITY-01.
 */

import {expect, type Locator, type Page} from "@playwright/test";

export type DashboardKind = "books" | "articles";

export class DashboardPage {
    constructor(
        private readonly page: Page,
        private readonly kind: DashboardKind = "books",
    ) {}

    private get route(): string {
        return this.kind === "books" ? "/" : "/articles";
    }

    /** view-agnostic per-entity wrapper attribute. */
    private get idAttr(): string {
        return this.kind === "books" ? "data-book-id" : "data-article-id";
    }

    async goto(): Promise<void> {
        await this.page.goto(this.route);
        await this.waitForLoaded();
    }

    /** Either the filter bar (books) or the article-list root has mounted. */
    async waitForLoaded(): Promise<void> {
        const probe =
            this.kind === "books"
                ? this.page.getByTestId("filter-bar")
                : this.page.getByTestId("article-list");
        await expect(probe).toBeVisible({timeout: 10_000});
    }

    /** The view-agnostic wrapper for one entity (resolves in grid AND list). */
    entity(id: string): Locator {
        return this.page.locator(`[${this.idAttr}="${id}"]`);
    }

    /** Switch the dashboard view mode. */
    async switchView(mode: "grid" | "list"): Promise<void> {
        await this.page.getByTestId(`view-toggle-${mode}`).click();
    }

    // --- TC-015 thumbnail -------------------------------------------------

    /** The grid-card cover placeholder for an entity (rendered when no
     *  cover image resolves). */
    placeholder(id: string): Locator {
        return this.page.getByTestId(`${this.kind === "books" ? "book" : "article"}-card-placeholder-${id}`);
    }

    /** The grid-card `<img>` cover (rendered when a cover image resolves). */
    coverImage(id: string): Locator {
        return this.entity(id).locator("img");
    }

    // --- TC-016 comment badge (AD only) ----------------------------------

    commentBadgeGrid(id: string): Locator {
        return this.page.getByTestId(`article-card-comments-count-${id}`);
    }

    commentBadgeList(id: string): Locator {
        return this.page.getByTestId(`article-list-row-comments-count-${id}`);
    }

    // --- search / filter (TC-006/007) ------------------------------------

    async search(term: string): Promise<void> {
        const input =
            this.kind === "books"
                ? this.page.getByTestId("filter-search-input")
                : this.page.getByTestId("article-list-search");
        await input.fill(term);
        // The search is debounced (~200ms) before the list re-renders.
        await this.page.waitForTimeout(300);
    }
}
