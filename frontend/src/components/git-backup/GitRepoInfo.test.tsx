/**
 * Vitest coverage for GitRepoInfo (#358 / #359).
 *
 * Pins the shared Git-repository info card contract:
 * - The repository URL renders as an external link in both modes
 *   (policy #78: the URL display stays active even in Dexie mode).
 * - Desktop/API mode shows the branch + sync status from useGitStatus.
 * - Dexie mode (git ops unavailable) shows the "nicht verfügbar
 *   (Desktop-App benötigt)" branch line and disables the Pull button.
 * - The Pull button (showPull) fires api.git.pull + a success toast in
 *   API mode, and is disabled with the desktop-app reason in Dexie mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { GitRepoInfo } from "./GitRepoInfo";

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

const mockPull = vi.fn();
vi.mock("../../api/client", () => ({
    api: { git: { pull: (...args: unknown[]) => mockPull(...args) } },
    ApiError: class ApiError extends Error {},
}));

const mockSuccess = vi.fn();
vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => mockSuccess(...args),
        error: vi.fn(),
        warning: vi.fn(),
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
        mockPull.mockReset();
        mockSuccess.mockReset();
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

    it("shows the desktop-app branch hint in Dexie mode", () => {
        featureActive = false;
        gitStatus.available = false;
        render(<GitRepoInfo bookId="b1" url={URL} />);
        expect(screen.getByTestId("git-repo-info-branch").textContent).toContain(
            "Desktop-App benötigt",
        );
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
});
