import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewMultiBookStep } from "./PreviewMultiBookStep";
import type { DetectedProject } from "../../../api/import";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function detected(): DetectedProject {
    return {
        format_name: "bgb",
        source_identifier: "sha256:multi::a",
        title: "First",
        author: "A",
        is_multi_book: true,
        books: [
            {
                title: "Book A",
                author: "Alice",
                subtitle: null,
                chapter_count: 5,
                has_cover: true,
                source_identifier: "sha256:multi::a",
                duplicate_of: null,
            },
            {
                title: "Book B",
                author: "Bob",
                subtitle: "Subtitle",
                chapter_count: 12,
                has_cover: false,
                source_identifier: "sha256:multi::b",
                duplicate_of: "existing-1",
            },
        ],
    } as unknown as DetectedProject;
}

function defaultSelection(): {
    selectedSourceIds: string[];
    perBookDuplicateAction: Record<string, "skip" | "overwrite" | "create_new">;
} {
    return {
        selectedSourceIds: ["sha256:multi::a", "sha256:multi::b"],
        perBookDuplicateAction: {},
    };
}

describe("PreviewMultiBookStep", () => {
    function renderStep(
        selection = defaultSelection(),
        overrides: Partial<{
            onToggle: ReturnType<typeof vi.fn>;
            onSelectAll: ReturnType<typeof vi.fn>;
            onDeselectAll: ReturnType<typeof vi.fn>;
            onSetDuplicateAction: ReturnType<typeof vi.fn>;
            onConfirm: ReturnType<typeof vi.fn>;
            onBack: ReturnType<typeof vi.fn>;
        }> = {},
    ) {
        // vi.fn() typings vs callback shape diverge in vitest 4;
        // cast to the precise callback signature for the JSX prop.
        const onToggle = (overrides.onToggle ?? vi.fn()) as unknown as (
            sourceId: string,
        ) => void;
        const onSelectAll = (overrides.onSelectAll ?? vi.fn()) as unknown as () => void;
        const onDeselectAll = (overrides.onDeselectAll ?? vi.fn()) as unknown as () => void;
        const onSetDuplicateAction = (overrides.onSetDuplicateAction ??
            vi.fn()) as unknown as (
            sourceId: string,
            action: "skip" | "overwrite" | "create_new",
        ) => void;
        const onConfirm = (overrides.onConfirm ?? vi.fn()) as unknown as () => void;
        const onBack = (overrides.onBack ?? vi.fn()) as unknown as () => void;
        render(
            <PreviewMultiBookStep
                detected={detected()}
                selection={selection}
                onToggle={onToggle}
                onSelectAll={onSelectAll}
                onDeselectAll={onDeselectAll}
                onSetDuplicateAction={onSetDuplicateAction}
                onConfirm={onConfirm}
                onBack={onBack}
            />,
        );
        return {
            onToggle,
            onSelectAll,
            onDeselectAll,
            onSetDuplicateAction,
            onConfirm,
            onBack,
        };
    }

    it("renders the count + bulk controls + list", () => {
        renderStep();
        expect(screen.getByTestId("multi-book-list")).toBeInTheDocument();
        expect(
            screen.getByTestId("multi-book-row-sha256:multi::a"),
        ).toHaveAttribute("data-selected", "true");
        expect(
            screen.getByTestId("multi-book-row-sha256:multi::b"),
        ).toHaveAttribute("data-selected", "true");
        expect(
            screen.getByTestId("multi-book-selected-count").textContent,
        ).toContain("2 of 2");
    });

    it("checkbox click triggers onToggle with the source id", () => {
        const { onToggle } = renderStep();
        fireEvent.click(screen.getByTestId("multi-book-checkbox-sha256:multi::a"));
        expect(onToggle).toHaveBeenCalledWith("sha256:multi::a");
    });

    it("Select all + Deselect all dispatch", () => {
        const { onSelectAll, onDeselectAll } = renderStep();
        fireEvent.click(screen.getByTestId("multi-book-select-all"));
        fireEvent.click(screen.getByTestId("multi-book-deselect-all"));
        expect(onSelectAll).toHaveBeenCalled();
        expect(onDeselectAll).toHaveBeenCalled();
    });

    it("Import button disabled when no rows selected", () => {
        renderStep({
            selectedSourceIds: [],
            perBookDuplicateAction: {},
        });
        const btn = screen.getByTestId("multi-book-confirm");
        expect(btn).toBeDisabled();
    });

    it("Import button enabled with at least one selection", () => {
        renderStep();
        const btn = screen.getByTestId("multi-book-confirm");
        expect(btn).not.toBeDisabled();
    });

    it("duplicate row exposes per-book action dropdown; click dispatches", () => {
        const { onSetDuplicateAction } = renderStep();
        const dup = screen.getByTestId("multi-book-duplicate-sha256:multi::b");
        expect(dup).toBeInTheDocument();
        const select = screen.getByTestId(
            "multi-book-dup-action-sha256:multi::b",
        ) as HTMLSelectElement;
        fireEvent.change(select, { target: { value: "overwrite" } });
        expect(onSetDuplicateAction).toHaveBeenCalledWith(
            "sha256:multi::b",
            "overwrite",
        );
    });

    it("non-duplicate row does not render the dropdown", () => {
        renderStep();
        expect(
            screen.queryByTestId("multi-book-duplicate-sha256:multi::a"),
        ).not.toBeInTheDocument();
    });

    it("chapters + cover badges shown per row", () => {
        renderStep();
        expect(
            screen.getByTestId("multi-book-chapters-sha256:multi::a"),
        ).toHaveTextContent("5");
        expect(
            screen.getByTestId("multi-book-chapters-sha256:multi::b"),
        ).toHaveTextContent("12");
    });

    it("Back button dispatches onBack", () => {
        const { onBack } = renderStep();
        fireEvent.click(screen.getByTestId("multi-book-back"));
        expect(onBack).toHaveBeenCalled();
    });

    it("Confirm dispatches onConfirm", () => {
        const { onConfirm } = renderStep();
        fireEvent.click(screen.getByTestId("multi-book-confirm"));
        expect(onConfirm).toHaveBeenCalled();
    });

    it("footer is sticky-positioned so action buttons survive long lists", () => {
        renderStep();
        const footer = screen.getByTestId("preview-multi-book-step-footer");
        // Inline style preserves position:sticky so the buttons stay in
        // view regardless of how long the book list grows.
        expect(footer.style.position).toBe("sticky");
        expect(footer.style.bottom).toBe("0px");
    });
});
