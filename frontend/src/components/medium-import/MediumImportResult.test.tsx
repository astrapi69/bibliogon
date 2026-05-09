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
});
