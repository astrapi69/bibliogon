/**
 * Page object for the ComicBookEditor (comic_book books).
 *
 * Comic books route into <ComicBookEditor> via the book_type branch in
 * BookEditor.tsx. Covers the page strip, panel grid, panel CRUD, and the
 * bubble add control. Pixel-exact bubble drag geometry stays manual
 * (TC-028 note); these helpers assert structure + non-collapsed panels.
 */

import {expect, type Locator, type Page} from "@playwright/test";

export class ComicEditorPage {
    constructor(private readonly page: Page) {}

    async goto(bookId: string): Promise<void> {
        await this.page.goto(`/book/${bookId}`);
        await expect(this.page.getByTestId("comic-book-editor-root")).toBeVisible({
            timeout: 10_000,
        });
    }

    get root(): Locator {
        return this.page.getByTestId("comic-book-editor-root");
    }

    get grid(): Locator {
        return this.page.getByTestId("comic-page-grid");
    }

    pageRow(pageId: string): Locator {
        return this.page.getByTestId(`comic-book-editor-page-row-${pageId}`);
    }

    async addPage(): Promise<void> {
        await this.page.getByTestId("comic-book-editor-add-page").click();
    }

    async addPanel(): Promise<void> {
        await this.page.getByTestId("comic-book-editor-add-panel").click();
    }

    async addBubble(): Promise<void> {
        await this.page.getByTestId("comic-book-editor-add-bubble").click();
    }

    async pickGridTemplate(template: string): Promise<void> {
        await this.page.getByTestId("comic-grid-template-picker-trigger").click();
        await this.page.getByTestId(`comic-grid-template-picker-item-${template}`).click();
    }

    /**
     * Panel cells inside the page grid. Excludes the nested bubble / image /
     * upload / side-pane controls that share the `comic-panel-` prefix (per
     * LL "Prefix testid selectors match every nested testid").
     */
    panels(): Locator {
        return this.page.locator(
            '[data-testid="comic-page-grid"] [data-testid^="comic-panel-"]' +
                ':not([data-testid*="-bubble-"]):not([data-testid*="-image-"])' +
                ':not([data-testid*="-upload"])',
        );
    }
}
