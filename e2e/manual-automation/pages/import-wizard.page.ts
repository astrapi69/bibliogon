/**
 * Page object for the core ImportWizardModal (CIO-01..05).
 *
 * Opened from the dashboard (`import-wizard-btn`). The wizard is a state
 * machine: select source -> detect -> preview -> execute. These helpers
 * cover the file-upload entry (Markdown/Text/HTML/.bgb) and the Git-URL
 * entry. data-testid selectors only.
 */

import {expect, type Locator, type Page} from "@playwright/test";

export class ImportWizardPage {
    constructor(private readonly page: Page) {}

    /** Open the wizard from the books dashboard. */
    async open(): Promise<void> {
        await this.page.goto("/");
        await this.page.getByTestId("import-wizard-btn").click();
        await expect(this.page.getByTestId("import-wizard-modal")).toBeVisible();
    }

    get modal(): Locator {
        return this.page.getByTestId("import-wizard-modal");
    }

    /** Upload a single file (path or in-memory buffer) into the wizard. */
    async uploadFile(file: string | {name: string; mimeType: string; buffer: Buffer}): Promise<void> {
        await this.page.getByTestId("upload-input").setInputFiles(file);
    }

    /**
     * Drive the full single-file import flow: upload -> summary -> preview ->
     * success. The wizard is a state machine (CIO-01..06): a "Detection
     * complete" summary step sits between upload and preview. Returns the
     * detected title shown on the preview step.
     */
    async runFileImport(file: {name: string; mimeType: string; buffer: Buffer}): Promise<string> {
        await expect(this.page.getByTestId("upload-step")).toBeVisible();
        await this.uploadFile(file);
        await expect(this.page.getByTestId("summary-step")).toBeVisible({timeout: 10_000});
        await this.page.getByTestId("summary-next").click();
        await expect(this.page.getByTestId("preview-step")).toBeVisible({timeout: 10_000});
        const title = await this.page.getByTestId("preview-field-title").inputValue();
        await this.page.getByTestId("preview-confirm").click();
        await expect(this.page.getByTestId("success-step")).toBeVisible({timeout: 10_000});
        return title;
    }

    get gitUrlInput(): Locator {
        return this.page.getByTestId("git-url-input");
    }

    async submitGitUrl(url: string): Promise<void> {
        await this.gitUrlInput.fill(url);
        await this.page.getByTestId("git-url-submit").click();
    }

    async close(): Promise<void> {
        await this.page.getByTestId("wizard-close").click();
    }
}
