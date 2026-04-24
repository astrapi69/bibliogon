import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewPanel } from "./PreviewPanel";
import type { DetectedProject } from "../../../api/import";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function project(overrides: Partial<DetectedProject> = {}): DetectedProject {
    return {
        format_name: "bgb",
        source_identifier: "sha256:abc",
        title: "The Book",
        subtitle: null,
        author: "Alice",
        language: "en",
        chapters: [],
        assets: [],
        warnings: [],
        has_html_description: false,
        has_backpage_description: false,
        has_backpage_author_bio: false,
        has_custom_css: false,
        plugin_specific_data: {},
        ...overrides,
    };
}

describe("PreviewPanel", () => {
    it("renders title, author, language, source identifier", () => {
        render(<PreviewPanel detected={project()} />);
        expect(screen.getByTestId("preview-title")).toHaveTextContent("The Book");
        expect(screen.getByTestId("preview-author")).toHaveTextContent("Alice");
        expect(screen.getByTestId("preview-language")).toHaveTextContent("en");
        expect(screen.getByTestId("preview-source-identifier")).toHaveTextContent(
            "sha256:abc",
        );
    });

    it("shows no-chapters placeholder when chapters is empty", () => {
        render(<PreviewPanel detected={project()} />);
        expect(screen.getByTestId("preview-no-chapters")).toBeInTheDocument();
    });

    it("renders chapter rows with position + word count", () => {
        render(
            <PreviewPanel
                detected={project({
                    chapters: [
                        {
                            title: "Chapter 1",
                            position: 0,
                            word_count: 1200,
                            content_preview: "Hello.",
                        },
                        {
                            title: "Chapter 2",
                            position: 1,
                            word_count: 800,
                            content_preview: "",
                        },
                    ],
                })}
            />,
        );
        const rows = screen.getAllByTestId("preview-chapter-row");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("1. Chapter 1");
        expect(rows[0]).toHaveTextContent("1200w");
    });

    it("expands a chapter row on click and shows the preview body", () => {
        render(
            <PreviewPanel
                detected={project({
                    chapters: [
                        {
                            title: "Chapter 1",
                            position: 0,
                            word_count: 100,
                            content_preview: "Hello preview body.",
                        },
                    ],
                })}
            />,
        );
        const row = screen.getByTestId("preview-chapter-row");
        fireEvent.click(row.querySelector("button")!);
        expect(screen.getByTestId("preview-chapter-expanded")).toHaveTextContent(
            "Hello preview body.",
        );
    });

    it("groups assets by purpose", () => {
        render(
            <PreviewPanel
                detected={project({
                    assets: [
                        {
                            filename: "cover.png",
                            path: "assets/cover/cover.png",
                            size_bytes: 4096,
                            mime_type: "image/png",
                            purpose: "cover",
                        },
                        {
                            filename: "fig1.png",
                            path: "assets/fig1.png",
                            size_bytes: 1024,
                            mime_type: "image/png",
                            purpose: "figure",
                        },
                        {
                            filename: "fig2.png",
                            path: "assets/fig2.png",
                            size_bytes: 2048,
                            mime_type: "image/png",
                            purpose: "figure",
                        },
                    ],
                })}
            />,
        );
        const rows = screen.getAllByTestId("preview-asset-row");
        expect(rows).toHaveLength(3);
    });

    it("renders warnings banner when warnings are present", () => {
        render(
            <PreviewPanel
                detected={project({
                    warnings: ["No cover detected", "Chapter 3 has no title"],
                })}
            />,
        );
        const warnings = screen.getAllByTestId("preview-warning");
        expect(warnings).toHaveLength(2);
    });

    it("does not render warnings banner when warnings is empty", () => {
        render(<PreviewPanel detected={project()} />);
        expect(screen.queryByTestId("preview-warnings")).not.toBeInTheDocument();
    });

    it("cover thumbnail shows cover filename when asset_type=cover", () => {
        render(
            <PreviewPanel
                detected={project({
                    assets: [
                        {
                            filename: "cover.png",
                            path: "assets/cover/cover.png",
                            size_bytes: 4096,
                            mime_type: "image/png",
                            purpose: "cover",
                        },
                    ],
                })}
            />,
        );
        expect(screen.getByTestId("preview-cover-thumbnail")).toHaveTextContent(
            "cover.png",
        );
    });

    it("cover placeholder shown when no cover asset", () => {
        render(<PreviewPanel detected={project()} />);
        expect(screen.getByTestId("preview-cover-placeholder")).toBeInTheDocument();
    });

    // --- subtitle + long-form metadata badges (Bugs 2 + 3) ---

    it("renders subtitle inline under the title when present", () => {
        render(
            <PreviewPanel
                detected={project({subtitle: "An Actual Subtitle"})}
            />,
        );
        expect(screen.getByTestId("preview-subtitle")).toHaveTextContent(
            "An Actual Subtitle",
        );
    });

    it("omits subtitle row when subtitle is null", () => {
        render(<PreviewPanel detected={project()} />);
        expect(screen.queryByTestId("preview-subtitle")).not.toBeInTheDocument();
    });

    it("renders a metadata badge per True has_* flag", () => {
        render(
            <PreviewPanel
                detected={project({
                    has_html_description: true,
                    has_backpage_description: true,
                    has_backpage_author_bio: true,
                    has_custom_css: true,
                })}
            />,
        );
        expect(
            screen.getByTestId("preview-metadata-badges"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-badge-html-description"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-badge-backpage-description"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-badge-backpage-author-bio"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("preview-badge-custom-css"),
        ).toBeInTheDocument();
    });

    it("renders no badge block when all has_* flags are False", () => {
        render(<PreviewPanel detected={project()} />);
        expect(
            screen.queryByTestId("preview-metadata-badges"),
        ).not.toBeInTheDocument();
    });

    it("renders only the True flags as badges", () => {
        render(
            <PreviewPanel
                detected={project({has_custom_css: true})}
            />,
        );
        expect(
            screen.getByTestId("preview-badge-custom-css"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("preview-badge-html-description"),
        ).not.toBeInTheDocument();
    });
});
