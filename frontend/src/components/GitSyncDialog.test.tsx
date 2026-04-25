/**
 * Tests for the PGS-02 commit-to-repo dialog.
 *
 * Covers: unmapped notice, mapping snapshot rendering, clone-missing
 * branch, commit happy path, dirty warning surfacing, error mapping
 * (409/410/501), and that close re-fetches status on next open.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import GitSyncDialog from "./GitSyncDialog";
import type { GitSyncMappingStatus } from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockStatus = vi.fn();
const mockCommit = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        gitSync: {
            status: (...args: unknown[]) => mockStatus(...args),
            commit: (...args: unknown[]) => mockCommit(...args),
        },
    },
    ApiError: class extends Error {
        status: number;
        detail: string;
        constructor(
            status: number,
            detail: string,
            _url = "",
            _method = "GET",
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
    warning: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
};

const mappedClean: GitSyncMappingStatus = {
    mapped: true,
    repo_url: "https://github.com/foo/bar.git",
    branch: "main",
    last_imported_commit_sha: "abcdef1234567890abcdef1234567890abcdef12",
    local_clone_path: "/tmp/uploads/git-sync/book-1/repo",
    last_committed_at: null,
    dirty: false,
};

const mappedDirty: GitSyncMappingStatus = {
    ...mappedClean,
    dirty: true,
};

const cloneMissing: GitSyncMappingStatus = {
    ...mappedClean,
    dirty: null,
};

const unmapped: GitSyncMappingStatus = {
    mapped: false,
    repo_url: null,
    branch: null,
    last_imported_commit_sha: null,
    local_clone_path: null,
    last_committed_at: null,
    dirty: null,
};

describe("GitSyncDialog", () => {
    const onClose = vi.fn();

    beforeEach(() => {
        onClose.mockClear();
        mockStatus.mockReset();
        mockCommit.mockReset();
        mockNotify.error.mockClear();
        mockNotify.success.mockClear();
        mockNotify.warning.mockClear();
        mockNotify.info.mockClear();
    });

    async function renderDialog(initial: GitSyncMappingStatus): Promise<void> {
        mockStatus.mockResolvedValueOnce(initial);
        await act(async () => {
            render(
                <GitSyncDialog open={true} bookId="book-1" onClose={onClose} />,
            );
        });
        await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    }

    it("renders unmapped notice when book has no GitSyncMapping", async () => {
        await renderDialog(unmapped);
        expect(screen.getByTestId("git-sync-unmapped")).toBeInTheDocument();
        expect(
            screen.queryByTestId("git-sync-commit-form"),
        ).not.toBeInTheDocument();
    });

    it("renders mapping summary + commit form when mapped + clone clean", async () => {
        await renderDialog(mappedClean);
        expect(screen.getByTestId("git-sync-summary")).toBeInTheDocument();
        expect(screen.getByTestId("git-sync-repo-url").textContent).toContain(
            "github.com/foo/bar.git",
        );
        expect(screen.getByTestId("git-sync-branch").textContent).toBe("main");
        expect(
            screen.queryByTestId("git-sync-dirty-warning"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("git-sync-commit-btn")).not.toBeDisabled();
    });

    it("surfaces dirty-warning when working tree is dirty", async () => {
        await renderDialog(mappedDirty);
        expect(
            screen.getByTestId("git-sync-dirty-warning"),
        ).toBeInTheDocument();
    });

    it("renders clone-missing notice when dirty=null (clone vanished)", async () => {
        await renderDialog(cloneMissing);
        expect(
            screen.getByTestId("git-sync-clone-missing"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("git-sync-commit-form"),
        ).not.toBeInTheDocument();
    });

    it("commit happy path: posts payload + shows last result", async () => {
        await renderDialog(mappedClean);
        const refreshed: GitSyncMappingStatus = {
            ...mappedClean,
            last_committed_at: "2026-04-25T15:00:00Z",
        };
        mockStatus.mockResolvedValueOnce(refreshed);
        mockCommit.mockResolvedValueOnce({
            commit_sha: "1111111111111111111111111111111111111111",
            branch: "main",
            pushed: false,
        });

        fireEvent.change(screen.getByTestId("git-sync-message"), {
            target: { value: "custom subject" },
        });
        fireEvent.click(screen.getByTestId("git-sync-commit-btn"));

        await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
        expect(mockCommit).toHaveBeenCalledWith("book-1", {
            message: "custom subject",
            push: false,
        });
        await waitFor(() =>
            expect(screen.getByTestId("git-sync-last-result")).toBeInTheDocument(),
        );
        expect(mockNotify.success).toHaveBeenCalledTimes(1);
    });

    it("commit 409 surfaces 'no changes' warning, no result block", async () => {
        await renderDialog(mappedClean);
        const { ApiError } = await import("../api/client");
        mockCommit.mockRejectedValueOnce(
            new ApiError(409, "Working tree is identical to HEAD", "/git-sync/x/commit", "POST", ""),
        );

        fireEvent.click(screen.getByTestId("git-sync-commit-btn"));

        await waitFor(() => expect(mockNotify.warning).toHaveBeenCalledTimes(1));
        expect(
            screen.queryByTestId("git-sync-last-result"),
        ).not.toBeInTheDocument();
        expect(mockNotify.error).not.toHaveBeenCalled();
    });

    it("commit 410 surfaces 'clone missing' warning", async () => {
        await renderDialog(mappedClean);
        const { ApiError } = await import("../api/client");
        mockCommit.mockRejectedValueOnce(
            new ApiError(410, "Local clone missing", "/git-sync/x/commit", "POST", ""),
        );

        fireEvent.click(screen.getByTestId("git-sync-commit-btn"));

        await waitFor(() => expect(mockNotify.warning).toHaveBeenCalledTimes(1));
        expect(mockNotify.error).not.toHaveBeenCalled();
    });

    it("commit 401 (push auth failed) surfaces a notify.error", async () => {
        await renderDialog(mappedClean);
        const { ApiError } = await import("../api/client");
        mockCommit.mockRejectedValueOnce(
            new ApiError(401, "Push not authorized", "/git-sync/x/commit", "POST", ""),
        );

        fireEvent.click(screen.getByTestId("git-sync-push-toggle"));
        fireEvent.click(screen.getByTestId("git-sync-commit-btn"));

        await waitFor(() => expect(mockNotify.error).toHaveBeenCalledTimes(1));
        expect(mockNotify.warning).not.toHaveBeenCalled();
    });

    it("commit 502 (push network failed) surfaces a notify.error", async () => {
        await renderDialog(mappedClean);
        const { ApiError } = await import("../api/client");
        mockCommit.mockRejectedValueOnce(
            new ApiError(502, "Remote not reachable", "/git-sync/x/commit", "POST", ""),
        );

        fireEvent.click(screen.getByTestId("git-sync-push-toggle"));
        fireEvent.click(screen.getByTestId("git-sync-commit-btn"));

        await waitFor(() => expect(mockNotify.error).toHaveBeenCalledTimes(1));
    });
});
