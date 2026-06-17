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

vi.mock("../../utils/notify", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

vi.mock("../../import/githubToken", () => ({
    getGitHubToken: () => "",
    setGitHubToken: vi.fn(),
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
