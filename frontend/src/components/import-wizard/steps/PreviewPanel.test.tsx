import { describe, it, expect, vi } from "vitest";
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
    it("renders title + author as editable, always included", () => {
        renderPanel(project({title: "A Title", author: "An Author"}));
        expect(screen.getByTestId("preview-field-title")).toHaveValue("A Title");
        expect(screen.getByTestId("preview-field-author")).toHaveValue(
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

describe("PreviewPanel — author datalist", () => {
    it("no datalist and no list attr when settings have no author choices", () => {
        mockAuthorChoices.mockReturnValueOnce([]);
        renderPanel();
        expect(
            screen.queryByTestId("preview-author-datalist"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("preview-field-author")).not.toHaveAttribute(
            "list",
        );
    });

    it("renders datalist with pen names when choices present", () => {
        mockAuthorChoices.mockReturnValueOnce([
            "Real Name",
            "Pen Name One",
            "Pen Name Two",
        ]);
        renderPanel();
        const datalist = screen.getByTestId("preview-author-datalist");
        expect(datalist).toBeInTheDocument();
        expect(screen.getByTestId("preview-field-author")).toHaveAttribute(
            "list",
            "preview-author-options",
        );
        const options = datalist.querySelectorAll("option");
        expect(Array.from(options).map((o) => o.getAttribute("value"))).toEqual(
            ["Real Name", "Pen Name One", "Pen Name Two"],
        );
    });
});
