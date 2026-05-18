import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MediumImportResult from "./MediumImportResult";
import type { MediumImportResponse } from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function withRouter(node: React.ReactElement) {
    return render(<MemoryRouter>{node}</MemoryRouter>);
}

const baseResponse: MediumImportResponse = {
    imported_count: 0,
    skipped_count: 0,
    errored_count: 0,
    imported: [],
    skipped: [],
    errored: [],
};

describe("MediumImportResult", () => {
    it("renders the summary header + counts", () => {
        withRouter(
            <MediumImportResult
                result={{ ...baseResponse, imported_count: 5, skipped_count: 1, errored_count: 2 }}
                onReset={vi.fn()}
            />,
        );
        // Components use German fallback strings (project default lang is de).
        expect(screen.getByText(/5 Artikel importiert/)).toBeInTheDocument();
        expect(screen.getByText(/1 übersprungen/)).toBeInTheDocument();
        expect(screen.getByText(/2 Fehler/)).toBeInTheDocument();
    });

    it("links imported rows to /articles/:id", () => {
        withRouter(
            <MediumImportResult
                result={{
                    ...baseResponse,
                    imported_count: 1,
                    imported: [
                        {
                            id: "art-42",
                            title: "First post",
                            canonical_url: "https://medium.com/@x/p1",
                            warnings: [],
                        },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        // Imported section is collapsed by default — expand it first.
        fireEvent.click(screen.getByTestId("medium-import-result-imported-trigger"));
        const link = screen.getByRole("link", { name: "First post" });
        expect(link).toHaveAttribute("href", "/articles/art-42");
    });

    it("renders errored rows when errored_count > 0 (expanded by default)", () => {
        withRouter(
            <MediumImportResult
                result={{
                    ...baseResponse,
                    errored_count: 1,
                    errored: [
                        { filename: "posts/broken.html", error: "ParseError: missing title" },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        // Expanded by default when errored_count > 0; rows are visible.
        expect(screen.getByText("posts/broken.html")).toBeInTheDocument();
        expect(screen.getByText(/ParseError: missing title/)).toBeInTheDocument();
    });

    it("hides the skipped section when skipped_count is 0", () => {
        withRouter(<MediumImportResult result={baseResponse} onReset={vi.fn()} />);
        expect(
            screen.queryByTestId("medium-import-result-skipped-trigger"),
        ).not.toBeInTheDocument();
    });

    it("invokes onReset when the import-another button is clicked", () => {
        const onReset = vi.fn();
        withRouter(<MediumImportResult result={baseResponse} onReset={onReset} />);
        fireEvent.click(screen.getByTestId("medium-import-result-reset"));
        expect(onReset).toHaveBeenCalledTimes(1);
    });

    // MEDIUM-IMPORT-RESPONSE-INTERFACE-SYNC-01: comment-routing
    // surface added so the v0.31.0+ backend response is honestly
    // rendered. The summary counts + collapsible sections only
    // appear when their respective counts are > 0 (no visual
    // noise on plain-article archives).

    it("does NOT render comment counts in the summary when both are 0", () => {
        withRouter(<MediumImportResult result={baseResponse} onReset={vi.fn()} />);
        expect(
            screen.queryByTestId("medium-import-result-imported-comments-count"),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByTestId("medium-import-result-skipped-comments-count"),
        ).not.toBeInTheDocument();
    });

    it("renders the imported-comments count + collapsible section when count > 0", () => {
        withRouter(
            <MediumImportResult
                result={{
                    ...baseResponse,
                    imported_comments_count: 2,
                    imported_comments: [
                        {
                            id: "cmt-1",
                            filename: "posts/reply-1.html",
                            body_preview: "Thanks for pointing that out.",
                            responds_to_article_id: null,
                        },
                        {
                            id: "cmt-2",
                            filename: "posts/reply-2.html",
                            body_preview: "",
                            responds_to_article_id: null,
                        },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        expect(
            screen.getByTestId("medium-import-result-imported-comments-count"),
        ).toBeInTheDocument();
        const trigger = screen.getByTestId(
            "medium-import-result-imported-comments-trigger",
        );
        fireEvent.click(trigger);
        const rows = screen.getAllByTestId("medium-import-result-imported-comment-row");
        expect(rows).toHaveLength(2);
        // Empty body_preview falls back to "—" (the row stays visually present).
        expect(rows[1].textContent).toContain("—");
        expect(rows[0].textContent).toContain("Thanks for pointing that out.");
    });

    it("renders the skipped-comments count + collapsible section + reason per row", () => {
        withRouter(
            <MediumImportResult
                result={{
                    ...baseResponse,
                    skipped_comments_count: 2,
                    skipped_comments: [
                        { filename: "posts/cmt-a.html", reason: "mode_skip" },
                        { filename: "posts/cmt-b.html", reason: "orphan_skip" },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        expect(
            screen.getByTestId("medium-import-result-skipped-comments-count"),
        ).toBeInTheDocument();
        fireEvent.click(
            screen.getByTestId("medium-import-result-skipped-comments-trigger"),
        );
        const rows = screen.getAllByTestId("medium-import-result-skipped-comment-row");
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("mode_skip");
        expect(rows[1].textContent).toContain("orphan_skip");
    });

    it("does NOT render the go-to-comments button when imported_comments_count is 0", () => {
        withRouter(<MediumImportResult result={baseResponse} onReset={vi.fn()} />);
        expect(
            screen.queryByTestId("medium-import-result-go-comments"),
        ).not.toBeInTheDocument();
    });

    it("renders the go-to-comments link when imported_comments_count > 0", () => {
        withRouter(
            <MediumImportResult
                result={{
                    ...baseResponse,
                    imported_comments_count: 3,
                    imported_comments: [
                        {
                            id: "cmt-1",
                            filename: "posts/a.html",
                            body_preview: "x",
                            responds_to_article_id: null,
                        },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        const link = screen.getByTestId("medium-import-result-go-comments");
        expect(link).toBeInTheDocument();
        // Links to the Settings comments-admin tab.
        expect(link).toHaveAttribute("href", "/settings?tab=comments");
    });

    it("renders all three article sections AND both comment sections when all counts > 0", () => {
        withRouter(
            <MediumImportResult
                result={{
                    imported_count: 1,
                    skipped_count: 1,
                    errored_count: 1,
                    imported_comments_count: 1,
                    skipped_comments_count: 1,
                    imported: [
                        {
                            id: "art-1",
                            title: "Article A",
                            canonical_url: "https://x/a",
                            warnings: [],
                        },
                    ],
                    skipped: [
                        {
                            filename: "posts/dup.html",
                            canonical_url: "https://x/dup",
                            existing_article_id: "art-99",
                        },
                    ],
                    errored: [
                        { filename: "posts/broken.html", error: "parse failed" },
                    ],
                    imported_comments: [
                        {
                            id: "cmt-1",
                            filename: "posts/cmt.html",
                            body_preview: "nice",
                            responds_to_article_id: null,
                        },
                    ],
                    skipped_comments: [
                        { filename: "posts/scmt.html", reason: "mode_skip" },
                    ],
                }}
                onReset={vi.fn()}
            />,
        );
        expect(
            screen.getByTestId("medium-import-result-imported-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("medium-import-result-skipped-trigger"),
        ).toBeInTheDocument();
        // Errored section is expanded-by-default so no separate trigger
        // is needed for its rows to be visible.
        expect(
            screen.getByTestId("medium-import-result-errored-row"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("medium-import-result-imported-comments-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("medium-import-result-skipped-comments-trigger"),
        ).toBeInTheDocument();
    });
});
