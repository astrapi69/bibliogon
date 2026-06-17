/**
 * Backup-flow helpers for the manual-automation suite (Section 4 / TC-040).
 *
 * Wraps the three UI flows the BACKUP-AKZEPTANZTEST drives through the
 * storage seam: full export (download the `.bgb`/JSON bundle), Danger-Zone
 * reset (wipe), and full import. The acceptance discipline forbids loosening
 * assertions — these helpers only move the UI; the spec does the verifying.
 *
 * Selectors are data-testid only (i18n-stable across the 8 catalogs):
 *   - Backups tab:    backups-export-full, backups-import-input
 *   - Danger Zone:    danger-zone-reset-button, danger-zone-reset-input,
 *                     danger-zone-final-delete-button
 */

import {expect, type Page} from "@playwright/test";
import {readFileSync} from "node:fs";

export class BackupHelper {
    constructor(private readonly page: Page) {}

    /**
     * Export the full backup from Settings > Backups and return the parsed
     * JSON bundle plus the on-disk path (for re-import).
     */
    async exportFull(): Promise<{path: string; bundle: BackupBundle}> {
        await this.page.goto("/settings?tab=backups");
        await expect(this.page.getByTestId("backups-export-full")).toBeVisible();
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.page.getByTestId("backups-export-full").click(),
        ]);
        const path = await download.path();
        const bundle = JSON.parse(readFileSync(path, "utf-8")) as BackupBundle;
        return {path, bundle};
    }

    /**
     * Danger-Zone reset: type RESET, confirm, wait for the redirect home.
     * The reset button opens the RESET-confirmation dialog directly.
     */
    async resetApp(): Promise<void> {
        await this.page.goto("/settings?tab=danger_zone");
        await this.page.getByTestId("danger-zone-reset-button").click();
        await expect(this.page.getByTestId("danger-zone-dialog")).toBeVisible();
        await this.page.getByTestId("danger-zone-reset-input").fill("RESET");
        const finalBtn = this.page.getByTestId("danger-zone-final-delete-button");
        await expect(finalBtn).toBeEnabled({timeout: 5000});
        await finalBtn.click();
        await this.page.waitForURL("**/", {timeout: 10_000});
    }

    /** Import a previously-exported full backup bundle by file path. */
    async importFull(path: string): Promise<void> {
        await this.page.goto("/settings?tab=backups");
        await this.page.getByTestId("backups-import-input").setInputFiles(path);
    }

    /**
     * Open the Danger-Zone reset dialog WITHOUT confirming, so a spec can
     * assert the pre-reset backup affordance (TC-041) is offered.
     */
    async openResetDialog(): Promise<void> {
        await this.page.goto("/settings?tab=danger_zone");
        await this.page.getByTestId("danger-zone-reset-button").click();
        await expect(this.page.getByTestId("danger-zone-dialog")).toBeVisible();
    }
}

export interface BackupBundle {
    version: number;
    data: {
        books: {id: string; title: string; chapters: unknown[]}[];
        articles: {id: string; title: string}[];
        authors: {id: string; name: string}[];
        story_bible: {entities: {id: string; name: string}[]};
        [key: string]: unknown;
    };
}
