/**
 * Page object for the prose BookEditor (chapter-based books).
 *
 * Wraps navigation, the chapter sidebar (add / select / delete) and the
 * TipTap editing surface. Page-based books (picture / comic) route into
 * their own editors — see picture-book-editor.page.ts / comic-editor.page.ts.
 */

import {expect, type Locator, type Page} from "@playwright/test";
import {focusEditor, typeAndWaitForSave, waitForEditor} from "../helpers/editor.helper";

export class EditorPage {
    constructor(private readonly page: Page) {}

    async goto(bookId: string): Promise<void> {
        await this.page.goto(`/book/${bookId}`);
        await expect(this.page.getByTestId("chapter-sidebar")).toBeVisible({
            timeout: 10_000,
        });
    }

    chapterItem(chapterId: string): Locator {
        return this.page.getByTestId(`chapter-item-${chapterId}`);
    }

    /** Open a chapter by id and wait for the TipTap surface. */
    async openChapter(chapterId: string): Promise<void> {
        await this.chapterItem(chapterId).click();
        await waitForEditor(this.page);
    }

    /** Add a generic chapter via the sidebar dropdown (first item). */
    async addChapter(): Promise<void> {
        await this.page.getByTestId("chapter-add-trigger").click();
        await expect(this.page.getByTestId("chapter-add-dropdown")).toBeVisible();
        await this.page.getByTestId("chapter-dropdown-item").first().click();
    }

    /** Delete a chapter via its inline delete control. */
    async deleteChapter(chapterId: string): Promise<void> {
        await this.page.getByTestId(`chapter-delete-${chapterId}`).click();
    }

    /** Type text into the focused editor and wait for autosave. */
    async writeText(text: string): Promise<void> {
        await focusEditor(this.page);
        await typeAndWaitForSave(this.page, text);
    }

    /** The active chapter id reflected in the URL (`?chapter=`). */
    activeChapterParam(): string | null {
        return new URL(this.page.url()).searchParams.get("chapter");
    }
}
