import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewPanel } from "./PreviewPanel";
import type { DetectedProject, Overrides } from "../../../api/import";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockAuthorChoices = vi.fn(() => [] as string[]);
vi.mock("../../../hooks/useAuthorChoices", () => ({
    useAuthorChoices: () => mockAuthorChoices(),
}));

const mockAuthorProfile = vi.fn(
    () =>
        ({ name: "Alice", pen_names: [] }) as {
            name: string;
            pen_names: string[];
        } | null,
);
vi.mock("../../../hooks/useAuthorProfile", () => ({
    useAuthorProfile: () => mockAuthorProfile(),
    profileDisplayNames: (
        p: { name: string; pen_names: string[] } | null,
    ) => {
        if (!p) return [];
        const out: string[] = [];
        if (p.name) out.push(p.name);
        out.push(...p.pen_names);
        return out;
    },
}));

vi.mock("../../../api/client", () => ({
    api: {
        settings: {
            getApp: vi.fn(async () => ({})),
            addPenName: vi.fn(async (name: string) => ({
                name: "Alice",
                pen_names: [name],
            })),
        },
    },
    ApiError: class extends Error {
        detail: string;
        constructor(s: number, d: string) {
            super(d);
            this.detail = d;
        }
    },
}));

const mockAllowDefer = vi.fn(() => false);
vi.mock("../../../hooks/useAllowBooksWithoutAuthor", () => ({
    useAllowBooksWithoutAuthor: () => mockAllowDefer(),
}));

beforeEach(() => {
    mockAllowDefer.mockReset();
    mockAllowDefer.mockReturnValue(false);
});

function project(overrides: Partial<DetectedProject> = {}): DetectedProject {
    return {
        format_name: "wbt-zip",
        source_identifier: "signature:preview-test",
        title: "The Book",
        subtitle: null,
        author: "Alice",
        language: "en",
        series: null,
        series_index: null,
        genre: null,
        description: null,
        edition: null,
        publisher: null,
        publisher_city: null,
        publish_date: null,
        isbn_ebook: null,
        isbn_paperback: null,
        isbn_hardcover: null,
        asin_ebook: null,
        asin_paperback: null,
        asin_hardcover: null,
        keywords: null,
        html_description: null,
        backpage_description: null,
        backpage_author_bio: null,
        cover_image: null,
        custom_css: null,
        chapters: [],
        assets: [],
        warnings: [],
        plugin_specific_data: {},
        ...overrides,
    };
}

function renderPanel(
    detected: DetectedProject = project(),
): { onOverridesChange: ReturnType<typeof vi.fn> } {
    const onOverridesChange = vi.fn();
    render(
        <PreviewPanel
            detected={detected}
            overrides={{} as Overrides}
            onOverridesChange={onOverridesChange}
        />,
    );
    return { onOverridesChange };
}

describe("PreviewPanel — basics section", () => {
    it("renders title input and author picker, always included", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "An Author",
            pen_names: [],
        });
        renderPanel(project({title: "A Title", author: "An Author"}));
        expect(screen.getByTestId("preview-field-title")).toHaveValue("A Title");
        expect(screen.getByTestId("preview-field-author")).toBeInTheDocument();
        // Matched author -> select dropdown, no banner.
        expect(screen.getByTestId("preview-author-select")).toHaveValue(
            "An Author",
        );
    });

    it("flags empty title with aria-invalid + error message", () => {
        renderPanel(project({title: ""}));
        const titleInput = screen.getByTestId("preview-field-title");
        expect(titleInput).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByTestId("preview-title-error")).toBeInTheDocument();
    });

    it("editing title updates overrides payload", () => {
        const { onOverridesChange } = renderPanel();
        fireEvent.change(screen.getByTestId("preview-field-title"), {
            target: { value: "Edited Title" },
        });
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides;
        expect(last.title).toBe("Edited Title");
    });

    it("deselecting language sends null so backend uses default", () => {
        const { onOverridesChange } = renderPanel();
        fireEvent.click(screen.getByTestId("preview-include-language"));
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides;
        expect(last.language).toBeNull();
    });
});

describe("PreviewPanel — per-field sections", () => {
    it("shows populated fields by default", () => {
        renderPanel(
            project({
                subtitle: "A Subtitle",
                publisher: "Test Press",
            }),
        );
        expect(screen.getByTestId("preview-field-subtitle")).toHaveValue(
            "A Subtitle",
        );
        expect(screen.getByTestId("preview-field-publisher")).toHaveValue(
            "Test Press",
        );
    });

    it("deselecting a field marks its override as null", () => {
        const { onOverridesChange } = renderPanel(
            project({publisher: "Test Press"}),
        );
        fireEvent.click(screen.getByTestId("preview-field-publisher-include"));
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides;
        expect(last.publisher).toBeNull();
    });

    it("keywords render in the keywords section as comma-joined", () => {
        renderPanel(project({keywords: ["a", "b", "c"]}));
        expect(screen.getByTestId("preview-field-keywords")).toHaveValue(
            "a, b, c",
        );
    });
});

describe("PreviewPanel — cover + overview", () => {
    it("cover thumbnail shown for image assets in cover purpose", () => {
        renderPanel(
            project({
                assets: [
                    {
                        filename: "cover.png",
                        path: "assets/cover/cover.png",
                        size_bytes: 4096,
                        mime_type: "image/png",
                        purpose: "cover",
                    },
                ],
            }),
        );
        expect(screen.getByTestId("preview-cover-thumbnail")).toHaveTextContent(
            "cover.png",
        );
    });

    it("cover placeholder shown when no cover asset", () => {
        renderPanel();
        expect(
            screen.getByTestId("preview-cover-placeholder"),
        ).toBeInTheDocument();
    });

    it("renders warnings block when detected.warnings non-empty", () => {
        renderPanel(project({warnings: ["No cover image detected."]}));
        expect(screen.getByTestId("preview-warnings")).toBeInTheDocument();
        expect(screen.getByTestId("preview-warning")).toHaveTextContent(
            "No cover image detected.",
        );
    });
});

describe("PreviewPanel — multi-cover selector", () => {
    function cover(filename: string, mime = "image/png") {
        return {
            filename,
            path: `assets/covers/${filename}`,
            size_bytes: 4096,
            mime_type: mime,
            purpose: "cover",
        };
    }

    it("no covers section when only one cover", () => {
        renderPanel(
            project({
                cover_image: "cover.png",
                assets: [cover("cover.png")],
            }),
        );
        expect(
            screen.queryByTestId("preview-section-covers"),
        ).not.toBeInTheDocument();
    });

    it("renders cover grid when >1 cover", () => {
        renderPanel(
            project({
                cover_image: "a.png",
                assets: [cover("a.png"), cover("b.png"), cover("c.png")],
            }),
        );
        expect(
            screen.getByTestId("preview-section-covers"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("preview-cover-grid")).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-cover-option-a.png"),
        ).toHaveAttribute("data-selected", "true");
        expect(
            screen.getByTestId("preview-cover-option-b.png"),
        ).toHaveAttribute("data-selected", "false");
    });

    it("primary_cover sent from initial mount when multiple covers", () => {
        const { onOverridesChange } = renderPanel(
            project({
                cover_image: "b.png",
                assets: [cover("a.png"), cover("b.png")],
            }),
        );
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides & {
            primary_cover?: string;
        };
        expect(last.primary_cover).toBe("b.png");
    });

    it("no primary_cover override when only one cover", () => {
        const { onOverridesChange } = renderPanel(
            project({
                cover_image: "solo.png",
                assets: [cover("solo.png")],
            }),
        );
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides & {
            primary_cover?: string;
        };
        expect(last.primary_cover).toBeUndefined();
    });

    it("clicking another cover swaps selection and updates overrides", () => {
        const { onOverridesChange } = renderPanel(
            project({
                cover_image: "a.png",
                assets: [cover("a.png"), cover("b.png")],
            }),
        );
        fireEvent.click(screen.getByTestId("preview-cover-radio-b.png"));
        expect(
            screen.getByTestId("preview-cover-option-b.png"),
        ).toHaveAttribute("data-selected", "true");
        expect(
            screen.getByTestId("preview-cover-option-a.png"),
        ).toHaveAttribute("data-selected", "false");
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides & {
            primary_cover?: string;
        };
        expect(last.primary_cover).toBe("b.png");
    });

    it("falls back to first cover when cover_image hint not in list", () => {
        const { onOverridesChange } = renderPanel(
            project({
                cover_image: "ghost.png",
                assets: [cover("first.png"), cover("second.png")],
            }),
        );
        expect(
            screen.getByTestId("preview-cover-option-first.png"),
        ).toHaveAttribute("data-selected", "true");
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides & {
            primary_cover?: string;
        };
        expect(last.primary_cover).toBe("first.png");
    });
});

describe("PreviewPanel — author-assets section", () => {
    function authorAsset(filename: string) {
        return {
            filename,
            path: `assets/author/${filename}`,
            size_bytes: 2048,
            mime_type: "image/png",
            purpose: "author-asset",
        };
    }

    it("no section when detected has no author-asset files", () => {
        renderPanel();
        expect(
            screen.queryByTestId("preview-section-author-assets"),
        ).not.toBeInTheDocument();
    });

    it("renders author-assets grid with count when present", () => {
        renderPanel(
            project({
                assets: [
                    authorAsset("portrait.png"),
                    authorAsset("signature.png"),
                ],
            }),
        );
        expect(
            screen.getByTestId("preview-section-author-assets"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-author-assets-count"),
        ).toHaveTextContent("(2)");
        expect(
            screen.getByTestId("preview-author-asset-portrait.png"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-author-asset-signature.png"),
        ).toBeInTheDocument();
    });

    it("author-assets section kept separate from cover grid", () => {
        renderPanel(
            project({
                assets: [
                    {
                        filename: "cover-a.png",
                        path: "assets/covers/cover-a.png",
                        size_bytes: 4096,
                        mime_type: "image/png",
                        purpose: "cover",
                    },
                    {
                        filename: "cover-b.png",
                        path: "assets/covers/cover-b.png",
                        size_bytes: 4096,
                        mime_type: "image/png",
                        purpose: "cover",
                    },
                    authorAsset("portrait.png"),
                ],
            }),
        );
        expect(
            screen.getByTestId("preview-section-covers"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-section-author-assets"),
        ).toBeInTheDocument();
        // Portrait must NOT appear as a selectable cover.
        expect(
            screen.queryByTestId("preview-cover-option-portrait.png"),
        ).not.toBeInTheDocument();
    });
});

describe("PreviewPanel — git adoption", () => {
    function gitRepo(overrides: Record<string, unknown> = {}) {
        return {
            present: true,
            size_bytes: 2_500_000,
            current_branch: "main",
            head_sha: "abcdef1234567890",
            commit_count: 42,
            remote_url: "https://example.com/author/book.git",
            has_lfs: false,
            has_submodules: false,
            is_shallow: false,
            is_corrupted: false,
            security_warnings: [],
            ...overrides,
        };
    }

    function renderWithGit(
        gitProps: {
            gitAdoption?: "start_fresh" | "adopt_with_remote" | "adopt_without_remote";
            onGitAdoptionChange?: ReturnType<typeof vi.fn>;
            repo?: ReturnType<typeof gitRepo> | null;
        } = {},
    ) {
        const onOverridesChange = vi.fn();
        const onGitAdoptionChange = (gitProps.onGitAdoptionChange ??
            vi.fn()) as unknown as (
            choice: "start_fresh" | "adopt_with_remote" | "adopt_without_remote",
        ) => void;
        render(
            <PreviewPanel
                detected={project({
                    git_repo:
                        gitProps.repo === undefined
                            ? gitRepo()
                            : gitProps.repo,
                })}
                overrides={{} as Overrides}
                onOverridesChange={onOverridesChange}
                gitAdoption={gitProps.gitAdoption ?? "start_fresh"}
                onGitAdoptionChange={onGitAdoptionChange}
            />,
        );
        return { onGitAdoptionChange };
    }

    it("no section when detected.git_repo is null", () => {
        renderWithGit({ repo: null });
        expect(
            screen.queryByTestId("preview-section-git-adoption"),
        ).not.toBeInTheDocument();
    });

    it("no section when git_repo.present is false", () => {
        renderWithGit({ repo: gitRepo({ present: false }) });
        expect(
            screen.queryByTestId("preview-section-git-adoption"),
        ).not.toBeInTheDocument();
    });

    it("renders 3 radio options and metadata summary when present", () => {
        renderWithGit();
        expect(
            screen.getByTestId("preview-section-git-adoption"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-git-option-start_fresh"),
        ).toHaveAttribute("data-selected", "true");
        expect(
            screen.getByTestId("preview-git-option-adopt_with_remote"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-git-option-adopt_without_remote"),
        ).toBeInTheDocument();
        expect(screen.getByTestId("preview-git-branch")).toHaveTextContent(
            "main",
        );
        expect(screen.getByTestId("preview-git-commits")).toHaveTextContent(
            "42",
        );
        expect(screen.getByTestId("preview-git-remote")).toHaveTextContent(
            "example.com/author/book.git",
        );
        expect(screen.getByTestId("preview-git-head")).toHaveTextContent(
            "abcdef1234",
        );
    });

    it("adopt_with_remote is disabled when no remote_url", () => {
        renderWithGit({ repo: gitRepo({ remote_url: null }) });
        expect(
            screen.getByTestId("preview-git-radio-adopt_with_remote"),
        ).toBeDisabled();
    });

    it("clicking a radio triggers onGitAdoptionChange", () => {
        const onGitAdoptionChange = vi.fn();
        renderWithGit({ onGitAdoptionChange });
        fireEvent.click(
            screen.getByTestId("preview-git-radio-adopt_with_remote"),
        );
        expect(onGitAdoptionChange).toHaveBeenCalledWith("adopt_with_remote");
    });

    it("renders security warnings when present", () => {
        renderWithGit({
            repo: gitRepo({
                security_warnings: [
                    "Credential helper stripped",
                    "Custom hook will not be adopted: prepare-commit-msg",
                ],
            }),
        });
        expect(
            screen.getByTestId("preview-git-security-warnings"),
        ).toBeInTheDocument();
        const items = screen.getAllByTestId("preview-git-security-warning");
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent("Credential helper stripped");
    });

    it("flags corrupted repo with a visible notice", () => {
        renderWithGit({ repo: gitRepo({ is_corrupted: true }) });
        expect(
            screen.getByTestId("preview-git-corrupted"),
        ).toBeInTheDocument();
    });
});

describe("PreviewPanel — author picker", () => {
    it("matched author renders profile select (no banner)", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: ["Pen One", "Pen Two"],
        });
        renderPanel(project({author: "Real Name"}));
        expect(
            screen.queryByTestId("preview-author-banner"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("preview-author-select")).toHaveValue(
            "Real Name",
        );
    });

    it("matched pen name renders profile select with that pen selected", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: ["Pen One"],
        });
        renderPanel(project({author: "Pen One"}));
        expect(screen.getByTestId("preview-author-select")).toHaveValue(
            "Pen One",
        );
    });

    it("unmatched author surfaces banner with create + existing radios (defer hidden by default)", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: [],
        });
        renderPanel(project({author: "Stranger"}));
        expect(
            screen.getByTestId("preview-author-banner"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-author-mode-create"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-author-mode-existing"),
        ).toBeInTheDocument();
        // Defer hidden when toggle is off (default).
        expect(
            screen.queryByTestId("preview-author-mode-defer"),
        ).not.toBeInTheDocument();
    });

    it("defer radio appears when allow-books-without-author toggle is on", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: [],
        });
        mockAllowDefer.mockReturnValue(true);
        renderPanel(project({author: "Stranger"}));
        expect(
            screen.getByTestId("preview-author-mode-defer"),
        ).toBeInTheDocument();
    });

    it("create radio default-fills the proposed name from detected", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: [],
        });
        renderPanel(project({author: "Imported Stranger"}));
        const input = screen.getByTestId(
            "preview-author-create-input",
        ) as HTMLInputElement;
        expect(input.value).toBe("Imported Stranger");
    });

    it("defer radio (toggle on) sets author value to empty string", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: [],
        });
        mockAllowDefer.mockReturnValue(true);
        const { onOverridesChange } = renderPanel(
            project({author: "Stranger"}),
        );
        fireEvent.click(screen.getByTestId("preview-author-mode-defer-radio"));
        const last = onOverridesChange.mock.calls.at(-1)?.[0] as Overrides;
        expect(last.author).toBe("");
    });

    it("empty source shows banner with no-source wording", () => {
        mockAuthorProfile.mockReturnValueOnce({
            name: "Real Name",
            pen_names: [],
        });
        renderPanel(project({author: ""}));
        expect(
            screen.getByTestId("preview-author-banner"),
        ).toBeInTheDocument();
    });

    it("unmatched without a profile still offers create (defer gated by toggle)", () => {
        mockAuthorProfile.mockReturnValueOnce(null);
        renderPanel(project({author: "Stranger"}));
        expect(
            screen.getByTestId("preview-author-mode-create"),
        ).toBeInTheDocument();
        // No existing-author option when profile is empty.
        expect(
            screen.queryByTestId("preview-author-mode-existing"),
        ).not.toBeInTheDocument();
        // Defer hidden by default toggle off.
        expect(
            screen.queryByTestId("preview-author-mode-defer"),
        ).not.toBeInTheDocument();
    });
});
