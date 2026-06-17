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
import {strFromU8, unzipSync} from "fflate";

export class BackupHelper {
    constructor(private readonly page: Page) {}

    /**
     * Export the full backup from Settings > Backups and return a parsed
     * view of the `.bgb` archive plus the on-disk path (for re-import).
     *
     * The full export is a `.bgb` ZIP (a plain ZIP with the JSON entity
     * graph + embedded image bytes — see `frontend/src/export/bgbExport.ts`),
     * NOT the legacy imageless JSON bundle. We unzip it node-side and
     * reconstruct the bundle shape the spec sanity-checks (manifest +
     * books-with-chapters + articles + authors + story-bible entities).
     */
    async exportFull(): Promise<{path: string; bundle: BackupBundle}> {
        await this.page.goto("/settings?tab=backups");
        await expect(this.page.getByTestId("backups-export-full")).toBeVisible();
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.page.getByTestId("backups-export-full").click(),
        ]);
        const path = await download.path();
        const bundle = parseBgbArchive(readFileSync(path));
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

export interface BgbManifest {
    format: string;
    version: string;
    book_count?: number;
    article_count?: number;
    asset_count?: number;
    [key: string]: unknown;
}

export interface BackupBundle {
    /** The archive's `manifest.json` (`format`, `version` "3.0", counts). */
    manifest: BgbManifest;
    data: {
        books: {id: string; title: string; chapters: unknown[]}[];
        articles: {id: string; title: string}[];
        authors: {id: string; name: string}[];
        story_bible: {entities: {id: string; name: string}[]};
        [key: string]: unknown;
    };
}

/**
 * Unzip a `.bgb` archive and reconstruct the {@link BackupBundle} view the
 * Section-4 sanity-check asserts on. Reads `manifest.json`, every
 * `books/<id>/book.json` (+ its `chapters/*.json` and `story_entities.json`),
 * every `articles/<id>/article.json`, and `globals/authors.json`.
 */
export function parseBgbArchive(bytes: Buffer): BackupBundle {
    const files = unzipSync(new Uint8Array(bytes));
    const read = (name: string): unknown =>
        files[name] ? JSON.parse(strFromU8(files[name])) : undefined;

    const manifest = (read("manifest.json") ?? {format: "", version: ""}) as BgbManifest;

    const books: {id: string; title: string; chapters: unknown[]}[] = [];
    const entities: {id: string; name: string}[] = [];
    const bookIds = new Set<string>();
    for (const name of Object.keys(files)) {
        const match = name.match(/^books\/([^/]+)\/book\.json$/);
        if (match) bookIds.add(match[1]);
    }
    for (const id of bookIds) {
        const book = read(`books/${id}/book.json`) as {id: string; title: string};
        const chapters = Object.keys(files)
            .filter((n) => n.startsWith(`books/${id}/chapters/`) && n.endsWith(".json"))
            .map((n) => read(n));
        books.push({id: book.id, title: book.title, chapters});
        const bookEntities = read(`books/${id}/story_entities.json`);
        if (Array.isArray(bookEntities)) {
            entities.push(...(bookEntities as {id: string; name: string}[]));
        }
    }

    const articles: {id: string; title: string}[] = [];
    for (const name of Object.keys(files)) {
        if (/^articles\/[^/]+\/article\.json$/.test(name)) {
            articles.push(read(name) as {id: string; title: string});
        }
    }

    const authors = (read("globals/authors.json") ?? []) as {id: string; name: string}[];

    return {manifest, data: {books, articles, authors, story_bible: {entities}}};
}
