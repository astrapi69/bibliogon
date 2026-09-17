import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_k: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

vi.mock("../../utils/platform/notify", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const loadGitHubToken = vi.fn(async () => "");
const saveGitHubToken = vi.fn(async (_token: string) => {});
vi.mock("../../import/githubToken", () => ({
    loadGitHubToken: () => loadGitHubToken(),
    saveGitHubToken: (token: string) => saveGitHubToken(token),
}));

const useFeatureMock = vi.fn();
vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => useFeatureMock(),
}));

const listGitHubContents = vi.fn();
const runGitHubImport = vi.fn();
const parseGitHubUrl = vi.fn();
vi.mock("../../import/githubImport", () => ({
    listGitHubContents: (...a: unknown[]) => listGitHubContents(...a),
    runGitHubImport: (...a: unknown[]) => runGitHubImport(...a),
    parseGitHubUrl: (...a: unknown[]) => parseGitHubUrl(...a),
    GitHubNotFoundError: class extends Error {},
    GitHubRateLimitError: class extends Error {},
}));

import GitHubImportTab from "./GitHubImportTab";

afterEach(() => vi.clearAllMocks());

describe("GitHubImportTab", () => {
    it("shows the network notice when the feature is offline-disabled", () => {
        useFeatureMock.mockReturnValue({ isActive: false, reason: "ui.feature.requires_network" });
        render(<GitHubImportTab onClose={() => {}} />);
        expect(screen.getByTestId("github-import-offline")).toBeTruthy();
    });

    it("loads a repo, selects a file and imports it", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        parseGitHubUrl.mockReturnValue({ owner: "o", repo: "r", path: "" });
        listGitHubContents.mockResolvedValue([
            {
                name: "intro.md",
                path: "intro.md",
                type: "file",
                size: 1,
                download_url: "u",
                sha: "s",
            },
        ]);
        runGitHubImport.mockResolvedValue({
            items: [{ path: "intro.md", name: "intro.md", status: "imported" }],
            importedCount: 1,
            skippedCount: 0,
            errorCount: 0,
            createdBookId: "book-1",
        });
        const onImported = vi.fn();
        render(<GitHubImportTab onClose={() => {}} onImported={onImported} />);

        fireEvent.change(screen.getByTestId("github-import-url"), {
            target: { value: "https://github.com/o/r" },
        });
        fireEvent.click(screen.getByTestId("github-import-load"));

        const checkbox = await screen.findByTestId("github-import-file-intro.md");
        fireEvent.click(checkbox);
        fireEvent.click(screen.getByTestId("github-import-confirm"));

        await waitFor(() => expect(runGitHubImport).toHaveBeenCalledOnce());
        expect(onImported).toHaveBeenCalled();
        expect(await screen.findByTestId("github-import-summary")).toBeTruthy();
    });

    it("shows an error for an invalid repo URL", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        parseGitHubUrl.mockReturnValue(null);
        render(<GitHubImportTab onClose={() => {}} />);

        fireEvent.change(screen.getByTestId("github-import-url"), {
            target: { value: "nonsense" },
        });
        fireEvent.click(screen.getByTestId("github-import-load"));

        expect(await screen.findByTestId("github-import-error")).toBeTruthy();
        expect(listGitHubContents).not.toHaveBeenCalled();
    });
});

describe("GitHubImportTab edge cases", () => {
    it("disables import until a file is selected", () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        render(<GitHubImportTab onClose={() => {}} />);
        const confirm = screen.getByTestId("github-import-confirm") as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
    });

    it("shows an empty folder with select-all disabled and no file rows", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        parseGitHubUrl.mockReturnValue({ owner: "o", repo: "r", path: "" });
        listGitHubContents.mockResolvedValue([]);
        render(<GitHubImportTab onClose={() => {}} />);

        fireEvent.change(screen.getByTestId("github-import-url"), { target: { value: "o/r" } });
        fireEvent.click(screen.getByTestId("github-import-load"));

        await screen.findByTestId("github-import-list");
        expect(screen.queryByTestId(/github-import-file-/)).toBeNull();
        expect((screen.getByTestId("github-import-select-all") as HTMLButtonElement).disabled).toBe(
            true,
        );
    });
});

describe("GitHubImportTab token handling (#880)", () => {
    it("fills the token field from the stored token once it has loaded", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        loadGitHubToken.mockResolvedValueOnce("github_pat_stored");
        render(<GitHubImportTab onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("github-import-token-section-toggle"));
        await waitFor(() =>
            expect((screen.getByTestId("github-import-token") as HTMLInputElement).value).toBe(
                "github_pat_stored",
            ),
        );
    });

    it("does not overwrite a token the user typed before the stored one arrived", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        let resolveStored: (value: string) => void = () => {};
        loadGitHubToken.mockReturnValueOnce(
            new Promise<string>((resolve) => {
                resolveStored = resolve;
            }),
        );
        render(<GitHubImportTab onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("github-import-token-section-toggle"));
        fireEvent.change(screen.getByTestId("github-import-token"), {
            target: { value: "github_pat_typed" },
        });
        resolveStored("github_pat_stored");
        await waitFor(() => expect(loadGitHubToken).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect((screen.getByTestId("github-import-token") as HTMLInputElement).value).toBe(
            "github_pat_typed",
        );
    });

    it("shows the risk and minimal-scope notice with the fine-grained token link", () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        render(<GitHubImportTab onClose={() => {}} />);
        expect(screen.queryByTestId("github-import-token-risk")).toBeNull();
        fireEvent.click(screen.getByTestId("github-import-token-section-toggle"));
        const notice = screen.getByTestId("github-import-token-risk");
        expect(notice.textContent).toContain("Contents: Read-only");
        const link = screen.getByTestId("github-import-token-create-link");
        expect(link.getAttribute("href")).toBe(
            "https://github.com/settings/personal-access-tokens/new",
        );
        expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("saves the typed token when a repository is loaded", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        parseGitHubUrl.mockReturnValue({ owner: "o", repo: "r", path: "" });
        listGitHubContents.mockResolvedValue([]);
        render(<GitHubImportTab onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("github-import-token-section-toggle"));
        fireEvent.change(screen.getByTestId("github-import-token"), {
            target: { value: "github_pat_typed" },
        });
        fireEvent.change(screen.getByTestId("github-import-url"), {
            target: { value: "https://github.com/o/r" },
        });
        fireEvent.click(screen.getByTestId("github-import-load"));
        await waitFor(() => expect(saveGitHubToken).toHaveBeenCalledWith("github_pat_typed"));
    });

    it("deletes the stored token and empties the field", async () => {
        useFeatureMock.mockReturnValue({ isActive: true });
        loadGitHubToken.mockResolvedValueOnce("github_pat_stored");
        render(<GitHubImportTab onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("github-import-token-section-toggle"));
        await waitFor(() =>
            expect((screen.getByTestId("github-import-token") as HTMLInputElement).value).toBe(
                "github_pat_stored",
            ),
        );
        fireEvent.click(screen.getByTestId("github-import-token-clear"));
        await waitFor(() => expect(saveGitHubToken).toHaveBeenCalledWith(""));
        expect((screen.getByTestId("github-import-token") as HTMLInputElement).value).toBe("");
    });
});
