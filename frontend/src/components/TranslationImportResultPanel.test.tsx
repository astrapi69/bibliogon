/**
 * Tests for the PGS-04-FU-01 multi-branch import result panel.
 *
 * Pin the contract:
 * - imported books render with language badge + branch + title +
 *   Open button that navigates to /book/{id}
 * - skipped section appears only when result.skipped is non-empty
 * - skipped rows show the reason label, the raw branch name, and
 *   the diagnostic detail as a verbatim code block
 * - reason slugs map to human labels; unknown slugs fall through
 *   to the raw value
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TranslationImportResultPanel } from "./TranslationImportResultPanel";
import type {
    TranslationImportedBook,
    TranslationSkippedBranch,
} from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
    const actual =
        await vi.importActual<typeof import("react-router-dom")>(
            "react-router-dom",
        );
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

function renderPanel(
    books: TranslationImportedBook[],
    skipped: TranslationSkippedBranch[],
) {
    render(
        <MemoryRouter>
            <TranslationImportResultPanel
                result={{
                    translation_group_id:
                        books.length > 1 ? "group-1" : null,
                    books,
                    skipped,
                }}
            />
        </MemoryRouter>,
    );
}

describe("TranslationImportResultPanel", () => {
    beforeEach(() => {
        navigateMock.mockReset();
    });

    it("renders one row per imported book with language badge + title", () => {
        renderPanel(
            [
                {
                    book_id: "b-1",
                    branch: "main",
                    language: "de",
                    title: "Bridge Book",
                },
                {
                    book_id: "b-2",
                    branch: "main-fr",
                    language: "fr",
                    title: "Pont Livre",
                },
            ],
            [],
        );
        expect(
            screen.getByTestId("translation-import-result-row-main").textContent,
        ).toContain("Bridge Book");
        expect(
            screen.getByTestId("translation-import-result-row-main").textContent,
        ).toContain("DE");
        expect(
            screen.getByTestId("translation-import-result-row-main-fr").textContent,
        ).toContain("Pont Livre");
    });

    it("Open button navigates to /book/{id}", () => {
        renderPanel(
            [{book_id: "b-99", branch: "main", language: "de", title: "X"}],
            [],
        );
        fireEvent.click(screen.getByTestId("translation-import-result-open-main"));
        expect(navigateMock).toHaveBeenCalledWith("/book/b-99");
    });

    it("does not render the skipped section when skipped is empty", () => {
        renderPanel(
            [{book_id: "b-1", branch: "main", language: "de", title: "X"}],
            [],
        );
        expect(
            screen.queryByTestId("translation-import-result-skipped"),
        ).toBeNull();
    });

    it("renders skipped rows with reason label + verbatim detail", () => {
        renderPanel(
            [{book_id: "b-1", branch: "main", language: "de", title: "X"}],
            [
                {
                    branch: "main-xx",
                    reason: "no_wbt_layout",
                    detail: "branch 'main-xx': missing config/metadata.yaml",
                },
                {
                    branch: "main-fr",
                    reason: "import_failed",
                    detail: "RuntimeError: incompatible chapter structure",
                },
            ],
        );
        expect(
            screen.getByTestId("translation-import-result-skipped"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("translation-import-result-skipped-reason-main-xx")
                .textContent,
        ).toContain("Kein Buch-Layout");
        expect(
            screen.getByTestId("translation-import-result-skipped-detail-main-xx")
                .textContent,
        ).toContain("missing config/metadata.yaml");
        expect(
            screen.getByTestId("translation-import-result-skipped-reason-main-fr")
                .textContent,
        ).toContain("Import fehlgeschlagen");
        expect(
            screen.getByTestId("translation-import-result-skipped-detail-main-fr")
                .textContent,
        ).toContain("RuntimeError");
    });

    it("unknown reason slug falls through to the raw value", () => {
        renderPanel(
            [],
            [
                {
                    branch: "main-zz",
                    reason: "future_reason",
                    detail: "x",
                },
            ],
        );
        expect(
            screen.getByTestId("translation-import-result-skipped-reason-main-zz")
                .textContent,
        ).toContain("future_reason");
    });

    it("renders empty notice when no books imported (still useful when only skipped)", () => {
        renderPanel(
            [],
            [{branch: "main-xx", reason: "no_wbt_layout", detail: "x"}],
        );
        expect(
            screen.getByTestId("translation-import-result-empty"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("translation-import-result-skipped"),
        ).toBeInTheDocument();
    });
});
