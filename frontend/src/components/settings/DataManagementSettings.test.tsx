/**
 * Vitest coverage for the Settings > Daten tab (#338).
 *
 * Pins the data-management hub contract:
 * - storage overview loads + renders the per-category breakdown + usage bar.
 * - "show all data" toggle reveals the raw table list.
 * - full-backup export / authors export call the right helpers.
 * - file-input change drives importFullBackup.
 * - the maintenance wipes call clearEventLog / clearImageCache after confirm.
 * - the Medium-import button navigates to the dedicated page.
 *
 * SelectiveExportSection is stubbed (its own test covers it) so this
 * suite stays focused on the Daten-tab wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DataManagementSettings } from "./DataManagementSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
    useNavigate: () => mockNavigate,
}));

const mockConfirm = vi.fn();
vi.mock("../shared/AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockConfirm(...args),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

const mockNotify = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
}));
vi.mock("../../utils/platform/notify", () => ({ notify: mockNotify }));

const mockAuthorsList = vi.fn().mockResolvedValue([]);
const mockAuthorsCreate = vi.fn().mockResolvedValue({ id: "a1" });
vi.mock("../../storage", () => ({
    getStorage: () => ({
        authors: {
            list: (...args: unknown[]) => mockAuthorsList(...args),
            create: (...args: unknown[]) => mockAuthorsCreate(...args),
        },
    }),
}));

const mockGetStorageStats = vi.fn();
const mockClearEventLog = vi.fn().mockResolvedValue(undefined);
const mockClearImageCache = vi.fn().mockResolvedValue(3);
vi.mock("../../storage/storageStats", () => ({
    getStorageStats: (...args: unknown[]) => mockGetStorageStats(...args),
    clearEventLog: (...args: unknown[]) => mockClearEventLog(...args),
    clearImageCache: (...args: unknown[]) => mockClearImageCache(...args),
    formatBytes: (n: number | null) => (n === null ? "—" : `${n} B`),
}));

const mockExportFullBackup = vi.fn().mockResolvedValue(new Blob(["{}"]));
vi.mock("../../export/backupExport", () => ({
    exportFullBackup: (...args: unknown[]) => mockExportFullBackup(...args),
    backupFilename: () => "bibliogon-backup.json",
}));

const mockExportBgbBackup = vi.fn().mockResolvedValue(new Blob(["PK"]));
vi.mock("../../export/bgbExport", () => ({
    exportBgbBackup: (...args: unknown[]) => mockExportBgbBackup(...args),
    bgbBackupFilename: () => "bibliogon-backup.bgb",
}));

vi.mock("../../export/backupImport", () => ({
    BackupImportError: class BackupImportError extends Error {},
}));

vi.mock("../../import/bgbImport", () => ({
    BgbImportError: class BgbImportError extends Error {},
}));

const mockRestoreBackupFile = vi.fn();
vi.mock("../../export/restoreBackup", () => ({
    restoreBackupFile: (...args: unknown[]) => mockRestoreBackupFile(...args),
}));

const mockDownloadBlob = vi.fn();
const mockDownloadText = vi.fn();
vi.mock("../../export/download", () => ({
    downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
    downloadText: (...args: unknown[]) => mockDownloadText(...args),
}));

vi.mock("./SelectiveExportSection", () => ({
    SelectiveExportSection: () => <div data-testid="stub-selective-export" />,
}));

const STATS = {
    categories: [
        { key: "books", count: 2 },
        { key: "articles", count: 5 },
        { key: "assets", count: 4 },
        { key: "writing_sessions", count: 7 },
        { key: "event_log", count: 12 },
    ],
    tables: [
        { name: "books", count: 2 },
        { name: "assets", count: 4 },
        { name: "eventLog", count: 1 },
    ],
    usageBytes: 1024,
    quotaBytes: 4096,
};

describe("DataManagementSettings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetStorageStats.mockResolvedValue(STATS);
        mockAuthorsList.mockResolvedValue([]);
        mockExportFullBackup.mockResolvedValue(new Blob(["{}"]));
        mockClearImageCache.mockResolvedValue(3);
    });

    it("renders the section + storage overview with category counts", async () => {
        render(<DataManagementSettings />);
        expect(screen.getByTestId("data-management-section")).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId("data-category-list")).toBeTruthy());
        expect(screen.getByTestId("data-category-books")).toBeTruthy();
        expect(screen.getByTestId("data-category-event_log").textContent).toContain("12");
    });

    it("renders the usage bar with the computed percentage", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-usage-bar")).toBeTruthy());
        const fill = screen.getByTestId("data-usage-bar-fill") as HTMLElement;
        // 1024 / 4096 = 25%
        expect(fill.style.width).toBe("25%");
    });

    it("toggles the raw table list", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-show-all-toggle")).toBeTruthy());
        expect(screen.queryByTestId("data-tables-list")).toBeNull();
        fireEvent.click(screen.getByTestId("data-show-all-toggle"));
        await waitFor(() => expect(screen.getByTestId("data-tables-list")).toBeTruthy());
        expect(screen.getByTestId("data-table-row-eventLog")).toBeTruthy();
    });

    it("full export calls exportBgbBackup (.bgb, with images) + downloadBlob", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-export-full")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-export-full"));
        await waitFor(() => expect(mockExportBgbBackup).toHaveBeenCalled());
        await waitFor(() => expect(mockDownloadBlob).toHaveBeenCalled());
    });

    it("legacy JSON export calls exportFullBackup", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-export-json")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-export-json"));
        await waitFor(() => expect(mockExportFullBackup).toHaveBeenCalled());
    });

    it("authors export gathers authors + downloads JSON", async () => {
        mockAuthorsList.mockResolvedValue([{ name: "A", slug: "a", is_profile_author: false }]);
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-export-authors")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-export-authors"));
        await waitFor(() => expect(mockDownloadText).toHaveBeenCalled());
        expect(mockAuthorsList).toHaveBeenCalledWith({ limit: 1000 });
    });

    it("backup import file drives restoreBackupFile + refreshes stats", async () => {
        mockRestoreBackupFile.mockResolvedValue({
            books: 1,
            chapters: 2,
            articles: 0,
            skippedBooks: 0,
        });
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-import-input")).toBeTruthy());
        const input = screen.getByTestId("data-import-input") as HTMLInputElement;
        const file = new File(["{}"], "backup.json", { type: "application/json" });
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(() => expect(mockRestoreBackupFile).toHaveBeenCalledWith(file));
        await waitFor(() => expect(mockNotify.success).toHaveBeenCalled());
        // refreshStats fires once on mount + once after import.
        await waitFor(() =>
            expect(mockGetStorageStats.mock.calls.length).toBeGreaterThanOrEqual(2),
        );
    });

    it("clear-event-log confirm-OK calls clearEventLog", async () => {
        mockConfirm.mockResolvedValue(true);
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-clear-event-log")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-clear-event-log"));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        await waitFor(() => expect(mockClearEventLog).toHaveBeenCalled());
    });

    it("clear-event-log confirm-cancel does nothing", async () => {
        mockConfirm.mockResolvedValue(false);
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-clear-event-log")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-clear-event-log"));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        expect(mockClearEventLog).not.toHaveBeenCalled();
    });

    it("clear-image-cache confirm-OK calls clearImageCache + notifies count", async () => {
        mockConfirm.mockResolvedValue(true);
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-clear-image-cache")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-clear-image-cache"));
        await waitFor(() => expect(mockClearImageCache).toHaveBeenCalled());
        await waitFor(() => expect(mockNotify.success).toHaveBeenCalled());
    });

    it("shows the 'import from online version' hint + link in the import section (#591)", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-import-section")).toBeTruthy());
        expect(screen.getByTestId("data-import-online-hint")).toBeTruthy();
        const link = screen.getByTestId("data-import-online-link") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toBe("https://astrapi69.github.io/bibliogon/");
        expect(link.getAttribute("target")).toBe("_blank");
    });

    it("Medium-import button navigates to the import page", async () => {
        render(<DataManagementSettings />);
        await waitFor(() => expect(screen.getByTestId("data-medium-import-link")).toBeTruthy());
        fireEvent.click(screen.getByTestId("data-medium-import-link"));
        expect(mockNavigate).toHaveBeenCalledWith("/articles/import/medium");
    });
});
