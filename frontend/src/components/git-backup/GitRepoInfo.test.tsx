/**
 * Vitest coverage for GitRepoInfo (#358 / #359).
 *
 * Pins the shared Git-repository info card contract:
 * - The repository URL renders as an external link in both modes
 *   (policy #78: the URL display stays active even in Dexie mode).
 * - Desktop/API mode with a local clone shows the branch + sync status.
 * - No local clone (Dexie or pre-clone) + GitHub URL shows the remote
 *   default branch (#363); non-GitHub → "nur GitHub unterstützt".
 * - The Pull button (showPull) fires api.git.pull + a success toast in
 *   API mode, and is disabled with the desktop-app reason in Dexie mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { GitRepoInfo } from "./GitRepoInfo";
import { ApiError } from "../../api/client";

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

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

let gitStatus = {
    branch: "main" as string | null,
    ahead: 0 as number | null,
    behind: 0 as number | null,
    syncState: "in_sync" as string | null,
    initialized: true,
    available: true,
    loading: false,
    refresh: vi.fn(async () => {}),
};
vi.mock("../../hooks/useGitStatus", () => ({
    useGitStatus: () => gitStatus,
}));

let remoteBranch: { status: string; branch?: string } = { status: "idle" };
vi.mock("../../hooks/useRemoteDefaultBranch", () => ({
    useRemoteDefaultBranch: () => remoteBranch,
}));

const mockPull = vi.fn();
vi.mock("../../api/client", () => ({
    api: { git: { pull: (...args: unknown[]) => mockPull(...args) } },
    ApiError: class ApiError extends Error {
        detailBody?: Record<string, unknown>;
        constructor(
            _status?: number,
            detail?: string,
            _endpoint?: string,
            _method?: string,
            _stacktrace?: string,
            detailBody?: Record<string, unknown>,
        ) {
            super(detail);
            this.name = "ApiError";
            this.detailBody = detailBody;
        }
    },
}));

const mockSuccess = vi.fn();
const mockWarning = vi.fn();
const mockError = vi.fn();
vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => mockSuccess(...args),
        error: (...args: unknown[]) => mockError(...args),
        warning: (...args: unknown[]) => mockWarning(...args),
        info: vi.fn(),
    },
}));

const URL = "https://github.com/me/book.git";

describe("GitRepoInfo", () => {
    beforeEach(() => {
        featureActive = true;
        gitStatus = {
            branch: "main",
            ahead: 0,
            behind: 0,
            syncState: "in_sync",
            initialized: true,
            available: true,
            loading: false,
            refresh: vi.fn(async () => {}),
        };
        remoteBranch = { status: "idle" };
        mockPull.mockReset();
        mockSuccess.mockReset();
        mockWarning.mockReset();
        mockError.mockReset();
    });

    it("renders nothing when no URL is set", () => {
        const { container } = render(<GitRepoInfo bookId="b1" url={null} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders the URL as an external link", () => {
        render(<GitRepoInfo bookId="b1" url={URL} />);
        const link = screen.getByTestId("git-repo-info-url");
        expect(link).toHaveAttribute("href", URL);
        expect(link).toHaveAttribute("target", "_blank");
    });

    it("shows branch + status in API mode", () => {
        render(<GitRepoInfo bookId="b1" url={URL} />);
        const branch = screen.getByTestId("git-repo-info-branch");
        expect(branch.textContent).toContain("main");
        expect(branch.textContent).toContain("Aktuell");
    });

    it("no local clone + GitHub URL → shows remote branch, NOT 'kein lokaler Klon' (regression #363)", () => {
        gitStatus.initialized = false;
        gitStatus.branch = null;
        remoteBranch = { status: "ok", branch: "main" };
        render(<GitRepoInfo bookId="b1" url={URL} />);
        const branch = screen.getByTestId("git-repo-info-branch").textContent ?? "";
        expect(branch).toContain("main");
        expect(branch).toContain("Remote");
        expect(branch).not.toContain("kein lokaler Klon");
    });

    it("Dexie mode + GitHub URL → shows the remote default branch", () => {
        featureActive = false;
        gitStatus.available = false;
        gitStatus.initialized = false;
        remoteBranch = { status: "ok", branch: "develop" };
        render(<GitRepoInfo bookId="b1" url={URL} />);
        expect(screen.getByTestId("git-repo-info-branch").textContent).toContain("develop");
    });

    it("non-GitHub URL → shows the GitHub-only hint", () => {
        gitStatus.initialized = false;
        remoteBranch = { status: "unsupported" };
        render(<GitRepoInfo bookId="b1" url="https://gitlab.com/me/book.git" />);
        expect(screen.getByTestId("git-repo-info-branch").textContent).toContain(
            "nur GitHub unterstützt",
        );
    });

    it("remote lookup error → shows the unavailable fallback", () => {
        gitStatus.initialized = false;
        remoteBranch = { status: "error" };
        render(<GitRepoInfo bookId="b1" url={URL} />);
        const branch = screen.getByTestId("git-repo-info-branch").textContent ?? "";
        expect(branch).toContain("nicht verfügbar");
        expect(branch).not.toContain("nur GitHub");
    });

    it("fires api.git.pull + success toast on Pull in API mode", async () => {
        mockPull.mockResolvedValue({ updated: true });
        render(<GitRepoInfo bookId="b1" url={URL} showPull />);
        const pull = screen.getByTestId("git-repo-info-pull");
        expect(pull).not.toBeDisabled();
        fireEvent.click(pull);
        await waitFor(() => expect(mockPull).toHaveBeenCalledWith("b1"));
        await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
    });

    it("disables the Pull button in Dexie mode with the desktop reason", () => {
        featureActive = false;
        gitStatus.available = false;
        render(<GitRepoInfo bookId="b1" url={URL} showPull />);
        const pull = screen.getByTestId("git-repo-info-pull");
        expect(pull).toBeDisabled();
        expect(pull).toHaveAttribute("title", "Benötigt Desktop-App");
        expect(mockPull).not.toHaveBeenCalled();
    });

    it("disables Pull when the repo URL is set but no local clone exists (regression #375)", () => {
        // API mode (gitOps available) but the repo was never cloned
        // locally — Pull would 409 `repo_not_initialized`, so the button
        // must be disabled with the actionable "not cloned" hint.
        gitStatus.initialized = false;
        gitStatus.branch = null;
        remoteBranch = { status: "ok", branch: "main" };
        render(<GitRepoInfo bookId="b1" url={URL} showPull />);
        const pull = screen.getByTestId("git-repo-info-pull");
        expect(pull).toBeDisabled();
        expect(pull.getAttribute("title")).toContain("lokal noch nicht eingerichtet");
        fireEvent.click(pull);
        expect(mockPull).not.toHaveBeenCalled();
    });

    it("maps a repo_not_initialized 409 to a warning, not a raw error toast (#375)", async () => {
        // Defensive: even if status was stale and the click slipped
        // through, the backend's `repo_not_initialized` code must yield
        // the actionable warning, never the raw error message.
        const err = new ApiError(
            409,
            "Book b1 has no git repo. Initialize first.",
            "/api/books/b1/git/pull",
            "POST",
            "",
            { code: "repo_not_initialized" },
        );
        mockPull.mockRejectedValue(err);
        render(<GitRepoInfo bookId="b1" url={URL} showPull />);
        fireEvent.click(screen.getByTestId("git-repo-info-pull"));
        await waitFor(() => expect(mockWarning).toHaveBeenCalled());
        expect(mockWarning.mock.calls[0][0]).toContain("lokal noch nicht eingerichtet");
        expect(mockError).not.toHaveBeenCalled();
    });
});
