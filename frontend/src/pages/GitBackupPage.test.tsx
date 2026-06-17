/**
 * Vitest coverage for GitBackupPage three-state handling (#358).
 *
 * Regression pin: a book with a repository_url must NOT show the
 * "no repository exists" message.
 * - Dexie mode (git ops disabled) + URL set → the repo URL card is
 *   shown (policy #78) alongside the feature notice, not just the
 *   bare "requires desktop app" notice.
 * - API mode + not-initialized + URL set → the "not cloned" message +
 *   "Initialize local clone" label, NOT the "no repository" message.
 * - API mode + not-initialized + NO URL → the original "no repository"
 *   message + "Initialize repository" label.
 * - API mode + initialized + URL set → the normal commit workflow, not
 *   the init button (#380, completing the four-state matrix; the
 *   clickable external-tab URL link itself is pinned in
 *   GitRepoInfo.test.tsx).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import GitBackupPage from "./GitBackupPage";

let featureActive = true;
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: featureActive ? "active" : "disabled",
        isActive: featureActive,
        isDisabled: !featureActive,
        isHidden: false,
        reason: featureActive ? undefined : "ui.feature.requires_desktop_app",
    }),
}));

vi.mock("react-router-dom", () => ({
    useParams: () => ({ bookId: "b1" }),
    useNavigate: () => vi.fn(),
}));

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../hooks/useGoBack", () => ({ useGoBack: () => vi.fn() }));

let repoUrl: string | null = null;
vi.mock("../storage", () => ({
    getStorage: () => ({
        books: { get: vi.fn(async () => ({ repository_url: repoUrl })) },
    }),
}));

let gitBackupState: { status: { initialized: boolean } | null } = { status: null };
vi.mock("../hooks/useGitBackup", () => ({
    useGitBackup: () => ({
        status: gitBackupState.status,
        commits: [],
        remote: null,
        sync: null,
        message: "",
        setMessage: vi.fn(),
        remoteUrlDraft: "",
        setRemoteUrlDraft: vi.fn(),
        remotePatDraft: "",
        setRemotePatDraft: vi.fn(),
        editingRemote: false,
        setEditingRemote: vi.fn(),
        busy: false,
        conflictKind: null,
        setConflictKind: vi.fn(),
        conflictFiles: [],
        setConflictFiles: vi.fn(),
        resolutions: {},
        setResolutions: vi.fn(),
        refresh: vi.fn(),
        handleInit: vi.fn(),
        handleCommit: vi.fn(),
        handleSaveRemote: vi.fn(),
        handleDeleteRemote: vi.fn(),
        handlePush: vi.fn(),
        handleMergeRemote: vi.fn(),
        handleResolveMerge: vi.fn(),
        handleAbortMerge: vi.fn(),
        handlePull: vi.fn(),
    }),
}));

vi.mock("../components/PageLayout", () => ({
    PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../features/FeatureNotice", () => ({
    FeatureNotice: ({ testId }: { testId?: string }) => (
        <div data-testid={testId ?? "feature-notice"}>notice</div>
    ),
}));
vi.mock("../components/git-backup/GitRepoInfo", () => ({
    GitRepoInfo: ({ url }: { url: string }) => <div data-testid="git-repo-info">{url}</div>,
}));
vi.mock("../components/git-backup/SyncBadge", () => ({ SyncBadge: () => null }));
vi.mock("../components/git-backup/GitRemoteConfig", () => ({ GitRemoteConfig: () => null }));
vi.mock("../components/git-backup/ConflictResolution", () => ({ ConflictResolution: () => null }));

describe("GitBackupPage", () => {
    beforeEach(() => {
        featureActive = true;
        repoUrl = null;
        gitBackupState = { status: null };
    });

    it("offline + URL set → shows the repo URL card and the feature notice", async () => {
        featureActive = false;
        repoUrl = "https://github.com/me/book.git";
        render(<GitBackupPage />);
        await waitFor(() =>
            expect(screen.getByTestId("git-repo-info")).toHaveTextContent(
                "https://github.com/me/book.git",
            ),
        );
        expect(screen.getByTestId("git-backup-disabled")).toBeInTheDocument();
    });

    it("API mode + not initialized + URL set → not-cloned message, not 'no repository'", async () => {
        repoUrl = "https://github.com/me/book.git";
        gitBackupState = { status: { initialized: false } };
        render(<GitBackupPage />);
        await waitFor(() => expect(screen.getByTestId("git-repo-info")).toBeInTheDocument());
        expect(screen.getByText(/lokal noch nicht eingerichtet/i)).toBeInTheDocument();
        expect(screen.getByText(/Lokalen Klon initialisieren/i)).toBeInTheDocument();
        expect(screen.queryByText(/noch kein Repository vorhanden/i)).not.toBeInTheDocument();
    });

    it("API mode + not initialized + NO URL → original 'no repository' message", async () => {
        repoUrl = null;
        gitBackupState = { status: { initialized: false } };
        render(<GitBackupPage />);
        await waitFor(() =>
            expect(screen.getByText(/noch kein Repository vorhanden/i)).toBeInTheDocument(),
        );
        expect(screen.queryByTestId("git-repo-info")).not.toBeInTheDocument();
    });

    it("API mode + initialized + URL set → normal commit workflow, not the init button", async () => {
        repoUrl = "https://github.com/me/book.git";
        gitBackupState = { status: { initialized: true } };
        render(<GitBackupPage />);
        await waitFor(() => expect(screen.getByTestId("git-commit-message")).toBeInTheDocument());
        expect(screen.getByTestId("git-commit-btn")).toBeInTheDocument();
        expect(screen.getByTestId("git-repo-info")).toBeInTheDocument();
        expect(screen.queryByTestId("git-init-btn")).not.toBeInTheDocument();
        expect(screen.queryByText(/noch kein Repository vorhanden/i)).not.toBeInTheDocument();
    });
});
