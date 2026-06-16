import { describe, it, expect, vi, beforeEach } from "vitest";

import { restoreBackupFile } from "./restoreBackup";

const importBgbFile = vi.fn();
const importFullBackup = vi.fn();

vi.mock("../import/bgbImport", () => ({ importBgbFile: (f: File) => importBgbFile(f) }));
vi.mock("./backupImport", () => ({ importFullBackup: (f: File) => importFullBackup(f) }));

/** A File whose first two bytes are the ZIP "PK" magic. */
function zipFile(): File {
    return new File([new Uint8Array([0x50, 0x4b, 3, 4, 7, 7])], "backup.bgb");
}

beforeEach(() => {
    importBgbFile.mockReset();
    importFullBackup.mockReset();
});

describe("restoreBackupFile", () => {
    it("routes a ZIP (PK magic) to the bgb importer and normalises the counts", async () => {
        importBgbFile.mockResolvedValue({
            imported: { books: 2, chapters: 5, articles: 1 },
            skipped: { books: 1 },
        });
        const counts = await restoreBackupFile(zipFile());
        expect(importBgbFile).toHaveBeenCalled();
        expect(importFullBackup).not.toHaveBeenCalled();
        expect(counts).toEqual({ books: 2, chapters: 5, articles: 1, skippedBooks: 1 });
    });

    it("routes non-ZIP content to the JSON importer", async () => {
        importFullBackup.mockResolvedValue({
            imported: { books: 1, chapters: 3, articles: 0 },
            skipped: { books: 0 },
        });
        const counts = await restoreBackupFile(
            new File(['{"version":1,"data":{}}'], "backup.json", { type: "application/json" }),
        );
        expect(importFullBackup).toHaveBeenCalled();
        expect(importBgbFile).not.toHaveBeenCalled();
        expect(counts).toEqual({ books: 1, chapters: 3, articles: 0, skippedBooks: 0 });
    });
});
