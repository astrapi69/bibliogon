/**
 * Page object for the PageEditor (picture_book books).
 *
 * Picture books route into <PageEditor> via the book_type branch in
 * BookEditor.tsx. Covers the page strip, the layout picker, and the page
 * canvas (text + image). Collage drag geometry stays manual (TC-029 note);
 * these helpers assert the layout picker has a visible render effect.
 */

import {expect, type Locator, type Page} from "@playwright/test";

export class PictureBookEditorPage {
    constructor(private readonly page: Page) {}

    async goto(bookId: string): Promise<void> {
        await this.page.goto(`/book/${bookId}`);
        await expect(this.page.getByTestId("page-editor-root")).toBeVisible({
            timeout: 10_000,
        });
    }

    get root(): Locator {
        return this.page.getByTestId("page-editor-root");
    }

    get canvas(): Locator {
        return this.page.getByTestId("page-editor-canvas");
    }

    get canvasRoot(): Locator {
        return this.page.getByTestId("page-canvas-root");
    }

    get canvasEmpty(): Locator {
        return this.page.getByTestId("page-editor-canvas-empty");
    }

    get layoutPicker(): Locator {
        return this.page.getByTestId("page-editor-layout-picker");
    }

    pageRow(pageId: string): Locator {
        return this.page.getByTestId(`page-editor-page-row-${pageId}`);
    }

    async addPage(): Promise<void> {
        await this.page.getByTestId("page-editor-add-page").click();
    }

    get textInput(): Locator {
        return this.page.getByTestId("page-canvas-text-input");
    }

    get imageArea(): Locator {
        return this.page.getByTestId("page-canvas-image-area");
    }

    get imagePlaceholder(): Locator {
        return this.page.getByTestId("page-canvas-image-placeholder");
    }
}
