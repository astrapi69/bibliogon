/**
 * Vitest coverage for the BackupsSettings component
 * (BOOKDASHBOARD-CLEANUP-01 C5).
 *
 * Pins the Settings > Backups tab contract:
 * - Tab heading and section headings render with the new
 *   ui.backups.* / ui.settings.tab_backups keys.
 * - api.backup.history(20) fires on mount (eager fetch, no
 *   toggle gate like the old Dashboard version).
 * - Empty-state branch shows the no_history line.
 * - Populated branch renders one row per history entry.
 * - The Compare-Backups button is wired (testid present +
 *   clickable). The BackupCompareDialog renders through a Radix
 *   Portal which is brittle under happy-dom (per
 *   .claude/rules/lessons-learned.md "Radix DropdownMenu +
 *   happy-dom is brittle for Vitest"); the dialog's open state
 *   is therefore covered by the E2E spec rather than asserted
 *   here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BackupsSettings } from "./BackupsSettings";

vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: "active",
        isActive: true,
        isDisabled: false,
        isHidden: false,
        reason: undefined,
    }),
}));

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockHistory = vi.fn();
const mockDeleteHistoryEntry = vi.fn();
const mockClearHistory = vi.fn();
vi.mock("../../api/client", () => ({
    api: {
        backup: {
            history: (...args: unknown[]) => mockHistory(...args),
            deleteHistoryEntry: (...args: unknown[]) => mockDeleteHistoryEntry(...args),
            clearHistory: (...args: unknown[]) => mockClearHistory(...args),
        },
    },
}));

const mockConfirm = vi.fn();
vi.mock("../AppDialog", () => ({
    useDialog: () => ({
        confirm: (...args: unknown[]) => mockConfirm(...args),
        prompt: vi.fn(),
        alert: vi.fn(),
        choose: vi.fn(),
    }),
}));

const mockNotifyError = vi.fn();
vi.mock("../../utils/platform/notify", () => ({
    notify: {
        error: (...args: unknown[]) => mockNotifyError(...args),
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

// Stub the dialog so we don't pull in its Radix Portal +
// fetch/XHR fixtures (covered by BackupCompareDialog.test.tsx).
vi.mock("../BackupCompareDialog", () => ({
    default: ({ open }: { open: boolean; onClose: () => void }) =>
        open ? <div data-testid="stub-backup-compare-dialog">stub-compare-dialog-open</div> : null,
}));

describe("BackupsSettings", () => {
    beforeEach(() => {
        mockHistory.mockReset();
        mockDeleteHistoryEntry.mockReset();
        mockClearHistory.mockReset();
        mockConfirm.mockReset();
        mockNotifyError.mockReset();
    });

    it("renders the tab heading and both section headings", async () => {
        mockHistory.mockResolvedValue([]);
        render(<BackupsSettings />);
        await waitFor(() => expect(mockHistory).toHaveBeenCalled());
        expect(screen.getByTestId("backups-settings")).toBeTruthy();
        expect(screen.getByText("Backups")).toBeTruthy();
        // Compare-Backups heading + button label both render the
        // same string; getAllByText avoids the multiple-match
        // throw from getByText.
        expect(screen.getAllByText("Backups vergleichen").length).toBeGreaterThan(0);
        expect(screen.getByText("Versionsgeschichte")).toBeTruthy();
    });

    it("calls api.backup.history(20) once on mount", async () => {
        mockHistory.mockResolvedValue([]);
        render(<BackupsSettings />);
        await waitFor(() => expect(mockHistory).toHaveBeenCalled());
        expect(mockHistory).toHaveBeenCalledTimes(1);
        expect(mockHistory).toHaveBeenCalledWith(20);
    });

    it("shows the empty-state message when history is empty", async () => {
        mockHistory.mockResolvedValue([]);
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-empty")).toBeTruthy());
        expect(screen.getByText("Noch keine Backups erstellt.")).toBeTruthy();
    });

    it("renders one row per history entry when populated", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 3,
                filename: "bibliogon-2026-05-18.bgb",
            },
            {
                timestamp: "2026-05-17T10:00:00Z",
                action: "restore",
                book_count: 3,
                filename: "bibliogon-2026-05-17.bgb",
            },
        ]);
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-list")).toBeTruthy());
        expect(screen.getByTestId("backups-history-entry-0")).toBeTruthy();
        expect(screen.getByTestId("backups-history-entry-1")).toBeTruthy();
        expect(screen.queryByTestId("backups-history-empty")).toBeNull();
    });

    it("clicking the Compare-Backups button opens the dialog", async () => {
        mockHistory.mockResolvedValue([]);
        render(<BackupsSettings />);
        await waitFor(() => expect(mockHistory).toHaveBeenCalled());
        const button = screen.getByTestId("backups-compare-btn");
        expect(screen.queryByTestId("stub-backup-compare-dialog")).toBeNull();
        fireEvent.click(button);
        await waitFor(() => expect(screen.getByTestId("stub-backup-compare-dialog")).toBeTruthy());
    });

    it("handles api.backup.history rejection without throwing", async () => {
        mockHistory.mockRejectedValue(new Error("network"));
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-empty")).toBeTruthy());
        // No row, no list - the catch-all silently degrades to empty.
        expect(screen.queryByTestId("backups-history-list")).toBeNull();
    });

    /**
     * Task 3.6: per-entry delete + clear-all controls.
     */
    it("renders a per-entry delete button next to each history entry", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
            {
                timestamp: "2026-05-17T10:00:00Z",
                action: "restore",
                book_count: 1,
                filename: "b.bgb",
            },
        ]);
        render(<BackupsSettings />);
        await waitFor(() =>
            expect(screen.getByTestId("backups-history-entry-0-delete")).toBeTruthy(),
        );
        expect(screen.getByTestId("backups-history-entry-1-delete")).toBeTruthy();
    });

    it("clicking the per-entry delete button calls api.backup.deleteHistoryEntry + removes from list", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
            {
                timestamp: "2026-05-17T10:00:00Z",
                action: "restore",
                book_count: 1,
                filename: "b.bgb",
            },
        ]);
        mockDeleteHistoryEntry.mockResolvedValue({ status: "deleted" });
        render(<BackupsSettings />);
        await waitFor(() =>
            expect(screen.getByTestId("backups-history-entry-0-delete")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("backups-history-entry-0-delete"));
        await waitFor(() =>
            expect(mockDeleteHistoryEntry).toHaveBeenCalledWith("2026-05-18T10:00:00Z"),
        );
        // After optimistic removal, the surviving entry shifts up to index 0
        // and the second testid disappears.
        await waitFor(() => expect(screen.queryByTestId("backups-history-entry-1")).toBeNull());
        expect(screen.getByTestId("backups-history-entry-0")).toBeTruthy();
    });

    it("restores the entry + fires notify.error when delete API fails", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
        ]);
        mockDeleteHistoryEntry.mockRejectedValue(new Error("boom"));
        render(<BackupsSettings />);
        await waitFor(() =>
            expect(screen.getByTestId("backups-history-entry-0-delete")).toBeTruthy(),
        );
        fireEvent.click(screen.getByTestId("backups-history-entry-0-delete"));
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled());
        // Entry restored because the optimistic remove was rolled back.
        expect(screen.getByTestId("backups-history-entry-0")).toBeTruthy();
    });

    it("hides the Clear-all button when history is empty", async () => {
        mockHistory.mockResolvedValue([]);
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-empty")).toBeTruthy());
        expect(screen.queryByTestId("backups-history-clear-all")).toBeNull();
    });

    it("shows the Clear-all button when history has entries", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
        ]);
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-clear-all")).toBeTruthy());
    });

    it("Clear-all confirm-cancel leaves history intact", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
        ]);
        mockConfirm.mockResolvedValue(false);
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-clear-all")).toBeTruthy());
        fireEvent.click(screen.getByTestId("backups-history-clear-all"));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        expect(mockClearHistory).not.toHaveBeenCalled();
        expect(screen.getByTestId("backups-history-entry-0")).toBeTruthy();
    });

    it("Clear-all confirm-OK calls api.backup.clearHistory + empties the list", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
            {
                timestamp: "2026-05-17T10:00:00Z",
                action: "restore",
                book_count: 1,
                filename: "b.bgb",
            },
        ]);
        mockConfirm.mockResolvedValue(true);
        mockClearHistory.mockResolvedValue({ status: "cleared" });
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-clear-all")).toBeTruthy());
        fireEvent.click(screen.getByTestId("backups-history-clear-all"));
        await waitFor(() => expect(mockClearHistory).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByTestId("backups-history-empty")).toBeTruthy());
    });

    it("restores the list + fires notify.error when clearHistory API fails", async () => {
        mockHistory.mockResolvedValue([
            {
                timestamp: "2026-05-18T10:00:00Z",
                action: "backup",
                book_count: 1,
                filename: "a.bgb",
            },
        ]);
        mockConfirm.mockResolvedValue(true);
        mockClearHistory.mockRejectedValue(new Error("boom"));
        render(<BackupsSettings />);
        await waitFor(() => expect(screen.getByTestId("backups-history-clear-all")).toBeTruthy());
        fireEvent.click(screen.getByTestId("backups-history-clear-all"));
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled());
        // Entry restored because the optimistic clear was rolled back.
        expect(screen.getByTestId("backups-history-entry-0")).toBeTruthy();
    });
});
