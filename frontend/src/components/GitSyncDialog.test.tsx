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

const mockUnifiedCommit = vi.fn();
const mockGetCredentialStatus = vi.fn();
const mockPutCredential = vi.fn();
const mockDeleteCredential = vi.fn();

vi.mock("../api/client", () => ({
    api: {
        gitSync: {
            status: (...args: unknown[]) => mockStatus(...args),
            commit: (...args: unknown[]) => mockCommit(...args),
            unifiedCommit: (...args: unknown[]) => mockUnifiedCommit(...args),
            diff: vi.fn(),
            resolve: vi.fn(),
            getCredentialStatus: (...args: unknown[]) =>
                mockGetCredentialStatus(...args),
            putCredential: (...args: unknown[]) => mockPutCredential(...args),
            deleteCredential: (...args: unknown[]) =>
                mockDeleteCredential(...args),
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
    core_git_initialized: false,
    has_credential: false,
};

const mappedCleanWithCoreGit: GitSyncMappingStatus = {
    ...mappedClean,
    core_git_initialized: true,
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
    core_git_initialized: false,
    has_credential: false,
};

describe("GitSyncDialog", () => {
    const onClose = vi.fn();

    beforeEach(() => {
        onClose.mockClear();
        mockStatus.mockReset();
        mockCommit.mockReset();
        mockUnifiedCommit.mockReset();
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

    // --- PGS-05 unified commit ---

    it("hides the unified-commit button when core git is not initialized", async () => {
        await renderDialog(mappedClean);
        expect(
            screen.queryByTestId("git-sync-unified-commit-btn"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("git-sync-unified-banner"),
        ).not.toBeInTheDocument();
    });

    it("shows the unified-commit button + banner when core git is initialized", async () => {
        await renderDialog(mappedCleanWithCoreGit);
        expect(screen.getByTestId("git-sync-unified-banner")).toBeInTheDocument();
        expect(
            screen.getByTestId("git-sync-unified-commit-btn"),
        ).toBeInTheDocument();
        // Single-subsystem button is still present (user can still pick).
        expect(screen.getByTestId("git-sync-commit-btn")).toBeInTheDocument();
    });

    it("unified commit posts the payload + renders per-subsystem result rows", async () => {
        await renderDialog(mappedCleanWithCoreGit);
        mockStatus.mockResolvedValueOnce(mappedCleanWithCoreGit);
        mockUnifiedCommit.mockResolvedValueOnce({
            core_git: {
                status: "ok",
                detail: null,
                commit_sha: "1".repeat(40),
                pushed: false,
            },
            plugin_git_sync: {
                status: "ok",
                detail: null,
                commit_sha: "2".repeat(40),
                pushed: false,
            },
        });
        fireEvent.change(screen.getByTestId("git-sync-message"), {
            target: { value: "merged subject" },
        });
        fireEvent.click(screen.getByTestId("git-sync-unified-commit-btn"));

        await waitFor(() =>
            expect(mockUnifiedCommit).toHaveBeenCalledTimes(1),
        );
        const [bookId, payload] = mockUnifiedCommit.mock.calls[0];
        expect(bookId).toBe("book-1");
        expect(payload).toEqual({
            message: "merged subject",
            push_plugin: false,
        });

        await waitFor(() =>
            expect(
                screen.getByTestId("git-sync-unified-result"),
            ).toBeInTheDocument(),
        );
        const coreRow = screen.getByTestId("git-sync-unified-row-core");
        const pluginRow = screen.getByTestId("git-sync-unified-row-plugin");
        expect(coreRow.getAttribute("data-status")).toBe("ok");
        expect(pluginRow.getAttribute("data-status")).toBe("ok");
        expect(mockNotify.success).toHaveBeenCalledTimes(1);
    });

    it("unified commit with one subsystem failed surfaces a notify.warning", async () => {
        await renderDialog(mappedCleanWithCoreGit);
        mockStatus.mockResolvedValueOnce(mappedCleanWithCoreGit);
        mockUnifiedCommit.mockResolvedValueOnce({
            core_git: { status: "ok", detail: null, commit_sha: "x", pushed: false },
            plugin_git_sync: {
                status: "failed",
                detail: "auth",
                commit_sha: null,
                pushed: false,
            },
        });
        fireEvent.click(screen.getByTestId("git-sync-unified-commit-btn"));

        await waitFor(() =>
            expect(mockUnifiedCommit).toHaveBeenCalledTimes(1),
        );
        await waitFor(() =>
            expect(mockNotify.warning).toHaveBeenCalledTimes(1),
        );
        expect(mockNotify.success).not.toHaveBeenCalled();
    });

    it("unified commit 503 (lock busy) surfaces notify.warning", async () => {
        await renderDialog(mappedCleanWithCoreGit);
        const { ApiError } = await import("../api/client");
        mockUnifiedCommit.mockRejectedValueOnce(
            new ApiError(
                503,
                "lock busy",
                "/git-sync/x/unified-commit",
                "POST",
                "",
            ),
        );
        fireEvent.click(screen.getByTestId("git-sync-unified-commit-btn"));

        await waitFor(() =>
            expect(mockNotify.warning).toHaveBeenCalledTimes(1),
        );
        expect(mockNotify.error).not.toHaveBeenCalled();
    });

    // --- PGS-02-FU-01: per-book PAT credentials section ---

    it("renders 'not set' when has_credential is false", async () => {
        mockStatus.mockResolvedValue(mappedClean);
        await act(async () => {
            render(<GitSyncDialog open bookId="book-1" onClose={vi.fn()} />);
        });
        await waitFor(() =>
            expect(screen.getByTestId("git-sync-credentials")).toBeTruthy(),
        );
        expect(
            screen.getByTestId("git-sync-credential-status").textContent,
        ).toContain("nicht gesetzt");
    });

    it("renders 'configured' + Remove button when has_credential is true", async () => {
        mockStatus.mockResolvedValue({ ...mappedClean, has_credential: true });
        await act(async () => {
            render(<GitSyncDialog open bookId="book-1" onClose={vi.fn()} />);
        });
        await waitFor(() =>
            expect(screen.getByTestId("git-sync-credentials")).toBeTruthy(),
        );
        expect(
            screen.getByTestId("git-sync-credential-status").textContent,
        ).toContain("konfiguriert");
        expect(screen.getByTestId("git-sync-credential-remove")).toBeTruthy();
    });

    it("PUTs the PAT and refreshes status on save", async () => {
        mockStatus
            .mockResolvedValueOnce(mappedClean)
            .mockResolvedValueOnce({ ...mappedClean, has_credential: true });
        mockPutCredential.mockResolvedValue({ has_credential: true });

        await act(async () => {
            render(<GitSyncDialog open bookId="book-1" onClose={vi.fn()} />);
        });
        await waitFor(() =>
            expect(screen.getByTestId("git-sync-credentials")).toBeTruthy(),
        );

        fireEvent.click(screen.getByTestId("git-sync-credential-toggle"));
        const input = screen.getByTestId(
            "git-sync-credential-input",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "ghp_top_secret" } });
        fireEvent.click(screen.getByTestId("git-sync-credential-save"));

        await waitFor(() =>
            expect(mockPutCredential).toHaveBeenCalledWith(
                "book-1",
                "ghp_top_secret",
            ),
        );
        await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
    });

    it("DELETEs the credential and refreshes on Remove", async () => {
        mockStatus
            .mockResolvedValueOnce({ ...mappedClean, has_credential: true })
            .mockResolvedValueOnce(mappedClean);
        mockDeleteCredential.mockResolvedValue(undefined);

        await act(async () => {
            render(<GitSyncDialog open bookId="book-1" onClose={vi.fn()} />);
        });
        await waitFor(() =>
            expect(screen.getByTestId("git-sync-credential-remove")).toBeTruthy(),
        );

        fireEvent.click(screen.getByTestId("git-sync-credential-remove"));

        await waitFor(() =>
            expect(mockDeleteCredential).toHaveBeenCalledWith("book-1"),
        );
        await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
    });
});
