/**
 * Page object for book export (`/books/:bookId/export`).
 *
 * Two engines (Maximal-Offline P2): the online Pandoc backend (ExportForm,
 * no testids — verified via direct API download in TC-030) and the
 * client-side engine (ClientExportMenu, `export-page-client`). When the
 * export-engine preference is `client` (or offline), the page renders the
 * client menu with items `client-export-<format>`.
 */

import {expect, type Locator, type Page} from "@playwright/test";

/** The seven client-engine formats (export/index.ts EXPORT_FORMATS). */
export const CLIENT_FORMATS = [
    "markdown",
    "html",
    "text",
    "pdf",
    "epub",
    "docx",
    "latex",
] as const;
export type ClientFormat = (typeof CLIENT_FORMATS)[number];

export class ExportPage {
    constructor(private readonly page: Page) {}

    async goto(bookId: string): Promise<void> {
        await this.page.goto(`/books/${bookId}/export`);
    }

    /** The client-engine container (rendered when engine=client or offline). */
    get clientContainer(): Locator {
        return this.page.getByTestId("export-page-client");
    }

    get clientTrigger(): Locator {
        return this.page.getByTestId("export-page-client-trigger");
    }

    /** Open the client export menu and download one format. */
    async downloadClient(format: ClientFormat): Promise<import("@playwright/test").Download> {
        await expect(this.clientContainer).toBeVisible({timeout: 10_000});
        await this.clientTrigger.click();
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.page.getByTestId(`client-export-${format}`).click(),
        ]);
        return download;
    }
}
