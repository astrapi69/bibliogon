/**
 * Vitest coverage for the MEDIUM-IMPORT-V2-01 preview table.
 *
 * Asserts the controlled-component contract: parent owns the
 * ``selected`` set, the table fires ``onToggleRow`` /
 * ``onToggleAll`` for state changes, the master checkbox is
 * indeterminate iff partial-selection.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import MediumImportPreviewTable from "./MediumImportPreviewTable";
import type {
    MediumImportPreviewErroredItem,
    MediumImportPreviewItem,
} from "../../api/client";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

function makeItem(filename: string, overrides: Partial<MediumImportPreviewItem> = {}): MediumImportPreviewItem {
    return {
        filename,
        title: `Title ${filename}`,
        subtitle: "",
        author: "Asterios",
        published_at: "2024-02-04T12:00:00.000Z",
        canonical_url: `https://medium.com/p/${filename}`,
        detected_language: "en",
        classification: "article",
        existing_article_id: null,
        body_preview: "",
        warnings: [],
        ...overrides,
    };
}

describe("MediumImportPreviewTable", () => {
    it("renders one row per item with the documented columns", () => {
        const items = [
            makeItem("a.html"),
            makeItem("b.html", { classification: "comment", body_preview: "yes!" }),
            makeItem("c.html", { existing_article_id: "art-99" }),
            makeItem("d.html", { warnings: ["broken-image"] }),
        ];
        render(
            <MediumImportPreviewTable
                items={items}
                errored={[]}
                selected={new Set(items.map((i) => i.filename))}
                onToggleAll={vi.fn()}
                onToggleRow={vi.fn()}
            />,
        );
        expect(screen.getByTestId("medium-import-preview-row-a.html")).toBeInTheDocument();
        expect(screen.getByTestId("medium-import-preview-row-b.html")).toBeInTheDocument();
        // Comment badge visible on the comment row.
        const commentRow = screen.getByTestId("medium-import-preview-row-b.html");
        expect(commentRow.textContent).toContain("Kommentar");
        // Dedup badge visible only on the row with an existing_article_id.
        expect(
            screen.getByTestId("medium-import-preview-dedup-badge-c.html"),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("medium-import-preview-dedup-badge-a.html"),
        ).toBeNull();
        // Warnings badge visible only on the row with warnings.
        expect(
            screen.getByTestId("medium-import-preview-warnings-badge-d.html"),
        ).toBeInTheDocument();
    });

    it("counter shows {selected} of {total}", () => {
        const items = [makeItem("a.html"), makeItem("b.html"), makeItem("c.html")];
        render(
            <MediumImportPreviewTable
                items={items}
                errored={[]}
                selected={new Set(["a.html", "c.html"])}
                onToggleAll={vi.fn()}
                onToggleRow={vi.fn()}
            />,
        );
        expect(screen.getByTestId("medium-import-preview-count").textContent).toContain(
            "2",
        );
        expect(screen.getByTestId("medium-import-preview-count").textContent).toContain(
            "3",
        );
    });

    it("row checkbox fires onToggleRow with the filename", () => {
        const onToggleRow = vi.fn();
        render(
            <MediumImportPreviewTable
                items={[makeItem("a.html"), makeItem("b.html")]}
                errored={[]}
                selected={new Set(["a.html", "b.html"])}
                onToggleAll={vi.fn()}
                onToggleRow={onToggleRow}
            />,
        );
        fireEvent.click(
            screen.getByTestId("medium-import-preview-row-checkbox-b.html"),
        );
        expect(onToggleRow).toHaveBeenCalledWith("b.html");
    });

    it("master checkbox fires onToggleAll with checked=false when all selected", () => {
        const onToggleAll = vi.fn();
        render(
            <MediumImportPreviewTable
                items={[makeItem("a.html"), makeItem("b.html")]}
                errored={[]}
                selected={new Set(["a.html", "b.html"])}
                onToggleAll={onToggleAll}
                onToggleRow={vi.fn()}
            />,
        );
        const master = screen.getByTestId(
            "medium-import-preview-select-all",
        ) as HTMLInputElement;
        expect(master.checked).toBe(true);
        fireEvent.click(master);
        expect(onToggleAll).toHaveBeenCalledWith(false);
    });

    it("master checkbox is indeterminate on partial selection", () => {
        render(
            <MediumImportPreviewTable
                items={[makeItem("a.html"), makeItem("b.html"), makeItem("c.html")]}
                errored={[]}
                selected={new Set(["a.html"])}
                onToggleAll={vi.fn()}
                onToggleRow={vi.fn()}
            />,
        );
        const master = screen.getByTestId(
            "medium-import-preview-select-all",
        ) as HTMLInputElement;
        expect(master.indeterminate).toBe(true);
        expect(master.checked).toBe(false);
    });

    it("renders errored panel when walker failures are present", () => {
        const errored: MediumImportPreviewErroredItem[] = [
            { filename: "broken.html", error: "encoding broken" },
        ];
        render(
            <MediumImportPreviewTable
                items={[makeItem("a.html")]}
                errored={errored}
                selected={new Set(["a.html"])}
                onToggleAll={vi.fn()}
                onToggleRow={vi.fn()}
            />,
        );
        expect(
            screen.getByTestId("medium-import-preview-errored-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("medium-import-preview-errored-row"),
        ).toBeInTheDocument();
    });

    it("disabled prop prevents interaction", () => {
        const onToggleRow = vi.fn();
        const onToggleAll = vi.fn();
        render(
            <MediumImportPreviewTable
                items={[makeItem("a.html")]}
                errored={[]}
                selected={new Set(["a.html"])}
                onToggleAll={onToggleAll}
                onToggleRow={onToggleRow}
                disabled
            />,
        );
        const master = screen.getByTestId(
            "medium-import-preview-select-all",
        ) as HTMLInputElement;
        const rowCheckbox = screen.getByTestId(
            "medium-import-preview-row-checkbox-a.html",
        ) as HTMLInputElement;
        expect(master.disabled).toBe(true);
        expect(rowCheckbox.disabled).toBe(true);
    });

    it("renders empty-state when items list is empty (no errored either)", () => {
        render(
            <MediumImportPreviewTable
                items={[]}
                errored={[]}
                selected={new Set()}
                onToggleAll={vi.fn()}
                onToggleRow={vi.fn()}
            />,
        );
        expect(screen.getByTestId("medium-import-preview-empty")).toBeInTheDocument();
    });
});
