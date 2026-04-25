/**
 * Tests for the PGS-03 conflict resolution dialog.
 *
 * Covers:
 * - empty diff renders the "nothing to resolve" notice
 * - actionable rows render with default actions (remote_changed
 *   defaults to take_remote; conflict defaults to keep_local)
 * - clicking Bibliogon / Repo flips the row's chosen action
 * - apply: posts only resolvable rows; surfaces success
 * - apply: ApiError surfaces as notify.error and onClose is NOT
 *   called (the user keeps the dialog open to retry)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import GitSyncDiffDialog from "./GitSyncDiffDialog";
import type {
    GitSyncDiffEntry,
    GitSyncDiffResponse,
} from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockDiff = vi.fn();
const mockResolve = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        gitSync: {
            diff: (...args: unknown[]) => mockDiff(...args),
            resolve: (...args: unknown[]) => mockResolve(...args),
        },
    },
    ApiError: class extends Error {
        status: number;
        detail: string;
        constructor(
            status: number,
            detail: string,
            _url = "",
            _method = "POST",
            _stack = "",
        ) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    },
}));

vi.mock("../utils/notify", () => ({
    notify: {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

import { notify as mockedNotify } from "../utils/notify";
const mockNotify = mockedNotify as unknown as {
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
};

function makeEntry(
    overrides: Partial<GitSyncDiffEntry> = {},
): GitSyncDiffEntry {
    return {
        section: "chapters",
        slug: "ch",
        title: "Chapter",
        classification: "remote_changed",
        base_md: "base",
        local_md: "base",
        remote_md: "remote",
        db_chapter_id: "db-1",
        ...overrides,
    };
}

function makeDiffResponse(entries: GitSyncDiffEntry[]): GitSyncDiffResponse {
    const counts: GitSyncDiffResponse["counts"] = {
        unchanged: 0,
        remote_changed: 0,
        local_changed: 0,
        both_changed: 0,
        remote_added: 0,
        local_added: 0,
        remote_removed: 0,
        local_removed: 0,
    };
    for (const e of entries) counts[e.classification] += 1;
    return {
        book_id: "book-1",
        last_imported_commit_sha: "0".repeat(40),
        branch: "main",
        chapters: entries,
        counts,
    };
}

describe("GitSyncDiffDialog", () => {
    const onClose = vi.fn();
    const onResolved = vi.fn();

    beforeEach(() => {
        onClose.mockClear();
        onResolved.mockClear();
        mockDiff.mockReset();
        mockResolve.mockReset();
        mockNotify.error.mockClear();
        mockNotify.success.mockClear();
    });

    async function renderDialog(
        response: GitSyncDiffResponse,
    ): Promise<void> {
        mockDiff.mockResolvedValueOnce(response);
        await act(async () => {
            render(
                <GitSyncDiffDialog
                    open={true}
                    bookId="book-1"
                    onClose={onClose}
                    onResolved={onResolved}
                />,
            );
        });
        await waitFor(() => expect(mockDiff).toHaveBeenCalledTimes(1));
    }

    it("renders the 'nothing to resolve' notice when the diff is empty", async () => {
        await renderDialog(makeDiffResponse([]));
        expect(screen.getByTestId("git-sync-diff-empty")).toBeInTheDocument();
        expect(
            screen.queryByTestId("git-sync-diff-list"),
        ).not.toBeInTheDocument();
    });

    it("hides 'unchanged' rows from the actionable list", async () => {
        await renderDialog(
            makeDiffResponse([
                makeEntry({ slug: "ch1", classification: "unchanged" }),
                makeEntry({ slug: "ch2", classification: "remote_changed" }),
            ]),
        );
        // Only ch2 (actionable) renders a row.
        expect(
            screen.getByTestId("git-sync-diff-row-chapters-ch2"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("git-sync-diff-row-chapters-ch1"),
        ).not.toBeInTheDocument();
    });

    it("defaults remote_changed rows to take_remote and conflict rows to keep_local", async () => {
        await renderDialog(
            makeDiffResponse([
                makeEntry({ slug: "rc", classification: "remote_changed" }),
                makeEntry({ slug: "bc", classification: "both_changed" }),
            ]),
        );
        const rcRow = screen.getByTestId("git-sync-diff-row-chapters-rc");
        const bcRow = screen.getByTestId("git-sync-diff-row-chapters-bc");
        // The "active" button is the one with btn-primary class.
        expect(rcRow.querySelector('[data-testid="git-sync-diff-take-rc"]')?.className).toContain(
            "btn-primary",
        );
        expect(bcRow.querySelector('[data-testid="git-sync-diff-keep-bc"]')?.className).toContain(
            "btn-primary",
        );
    });

    it("clicking Bibliogon flips the row to keep_local", async () => {
        await renderDialog(
            makeDiffResponse([
                makeEntry({ slug: "rc", classification: "remote_changed" }),
            ]),
        );
        // Default: take_remote primary.
        const keepBtn = screen.getByTestId("git-sync-diff-keep-rc");
        fireEvent.click(keepBtn);
        expect(keepBtn.className).toContain("btn-primary");
        expect(screen.getByTestId("git-sync-diff-take-rc").className).toContain(
            "btn-secondary",
        );
    });

    it("apply posts only actionable rows and fires onClose + onResolved on success", async () => {
        await renderDialog(
            makeDiffResponse([
                makeEntry({ slug: "u", classification: "unchanged" }),
                makeEntry({ slug: "r", classification: "remote_changed" }),
                makeEntry({ slug: "c", classification: "both_changed" }),
            ]),
        );
        mockResolve.mockResolvedValueOnce({
            counts: { updated: 1, created: 0, deleted: 0, skipped: 1 },
        });
        fireEvent.click(screen.getByTestId("git-sync-diff-apply"));

        await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1));
        const [bookId, resolutions] = mockResolve.mock.calls[0];
        expect(bookId).toBe("book-1");
        // 'unchanged' row was excluded from the payload.
        expect(resolutions).toEqual([
            { section: "chapters", slug: "r", action: "take_remote" },
            { section: "chapters", slug: "c", action: "keep_local" },
        ]);
        expect(mockNotify.success).toHaveBeenCalledTimes(1);
        expect(onResolved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("apply error keeps the dialog open and surfaces notify.error", async () => {
        await renderDialog(
            makeDiffResponse([
                makeEntry({ slug: "r", classification: "remote_changed" }),
            ]),
        );
        const { ApiError } = await import("../api/client");
        mockResolve.mockRejectedValueOnce(
            new ApiError(500, "boom", "/git-sync/x/resolve", "POST", ""),
        );
        fireEvent.click(screen.getByTestId("git-sync-diff-apply"));

        await waitFor(() => expect(mockNotify.error).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        expect(onResolved).not.toHaveBeenCalled();
    });
});
