/**
 * Tests for the SuccessMultiStep wizard terminal.
 *
 * Pin the contract: every imported book id renders one row with the
 * matching title from the original DetectedProject.books summary, the
 * Open button navigates to ``/book/{id}`` after closing the wizard,
 * the Done button closes without navigation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SuccessMultiStep } from "./SuccessMultiStep";
import type { DetectedBookSummary } from "../../../api/import";

vi.mock("../../../hooks/useI18n", () => ({
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

const SUMMARIES: DetectedBookSummary[] = [
    {
        title: "Wizard's Journey",
        author: "A",
        subtitle: null,
        chapter_count: 4,
        has_cover: false,
        source_identifier: "sha256:aaa::book-1",
        duplicate_of: null,
    },
    {
        title: "Second Book",
        author: "B",
        subtitle: null,
        chapter_count: 2,
        has_cover: false,
        source_identifier: "sha256:bbb::book-2",
        duplicate_of: null,
    },
];

function renderStep(
    bookIds: string[],
    onClose = vi.fn(),
    onAnother = vi.fn(),
) {
    render(
        <MemoryRouter>
            <SuccessMultiStep
                bookIds={bookIds}
                books={SUMMARIES}
                onClose={onClose}
                onAnother={onAnother}
            />
        </MemoryRouter>,
    );
    return { onClose, onAnother };
}

describe("SuccessMultiStep", () => {
    beforeEach(() => {
        navigateMock.mockReset();
    });

    it("renders one row per imported book id with the matching title", () => {
        renderStep(["book-1", "book-2"]);
        expect(screen.getByTestId("success-multi-row-book-1").textContent).toContain(
            "Wizard's Journey",
        );
        expect(screen.getByTestId("success-multi-row-book-2").textContent).toContain(
            "Second Book",
        );
    });

    it("falls back to the bare id when no summary matches", () => {
        renderStep(["book-1", "orphan-id"]);
        expect(
            screen.getByTestId("success-multi-row-orphan-id").textContent,
        ).toContain("orphan-id");
    });

    it("Open button closes the wizard then navigates to /book/{id}", () => {
        const { onClose } = renderStep(["book-1", "book-2"]);
        fireEvent.click(screen.getByTestId("success-multi-open-book-2"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(navigateMock).toHaveBeenCalledWith("/book/book-2");
    });

    it("Done button closes without navigation", () => {
        const { onClose } = renderStep(["book-1", "book-2"]);
        fireEvent.click(screen.getByTestId("success-multi-done"));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(navigateMock).not.toHaveBeenCalled();
    });

    it("Import another button calls onAnother (not navigate)", () => {
        const { onAnother } = renderStep(["book-1"]);
        fireEvent.click(screen.getByTestId("success-multi-import-another"));
        expect(onAnother).toHaveBeenCalledTimes(1);
        expect(navigateMock).not.toHaveBeenCalled();
    });
});
