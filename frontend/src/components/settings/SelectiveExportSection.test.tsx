/**
 * Vitest coverage for SelectiveExportSection (#247).
 *
 * Pins the selective-export contract: the checkbox grid renders, the
 * chapters-auto hint is gated on the books checkbox, select-all toggles
 * every section, the export button is gated on a non-empty selection, and
 * a click hands the chosen selection to ``exportSelectiveBackup`` and the
 * resulting blob to ``downloadBlob``.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SelectiveExportSection } from "./SelectiveExportSection";

vi.mock("@astrapi69/feature-strategy-react", () => ({
    useFeature: () => ({
        state: "active",
        isActive: true,
        isDisabled: false,
        isHidden: false,
        reason: undefined,
    }),
}));

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const mockExport = vi.fn();
vi.mock("../../export/selectiveExport", async () => {
    const actual = await vi.importActual<typeof import("../../export/selectiveExport")>(
        "../../export/selectiveExport",
    );
    return {
        ...actual,
        exportSelectiveBackup: (...args: unknown[]) => mockExport(...args),
    };
});

const mockDownload = vi.fn();
vi.mock("../../export/download", () => ({
    downloadBlob: (...args: unknown[]) => mockDownload(...args),
}));

const mockNotifySuccess = vi.fn();
const mockNotifyError = vi.fn();
vi.mock("../../utils/notify", () => ({
    notify: {
        success: (...args: unknown[]) => mockNotifySuccess(...args),
        error: (...args: unknown[]) => mockNotifyError(...args),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

describe("SelectiveExportSection", () => {
    beforeEach(() => {
        mockExport.mockReset();
        mockDownload.mockReset();
        mockNotifySuccess.mockReset();
        mockNotifyError.mockReset();
    });

    it("renders the section with all group checkboxes", () => {
        render(<SelectiveExportSection />);
        expect(screen.getByTestId("selective-export-section")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-books")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-articles")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-authors")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-chapterLabels")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-storyBible")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-writingSessions")).toBeTruthy();
        expect(screen.getByTestId("selective-export-item-settings")).toBeTruthy();
    });

    it("shows the chapters-auto hint only while books is checked", () => {
        render(<SelectiveExportSection />);
        // Books default-checked → hint present.
        expect(screen.getByTestId("selective-export-item-chapters")).toBeTruthy();
        fireEvent.click(screen.getByTestId("selective-export-item-books"));
        expect(screen.queryByTestId("selective-export-item-chapters")).toBeNull();
    });

    it("select-all toggles every section on then off", () => {
        render(<SelectiveExportSection />);
        const selectAll = screen.getByTestId("selective-export-select-all") as HTMLInputElement;
        // Default selection is partial, so the first click selects all.
        fireEvent.click(selectAll);
        expect(
            (screen.getByTestId("selective-export-item-settings") as HTMLInputElement).checked,
        ).toBe(true);
        expect(
            (screen.getByTestId("selective-export-item-storyBible") as HTMLInputElement).checked,
        ).toBe(true);
        // Now everything is selected → next click clears all.
        fireEvent.click(selectAll);
        expect(
            (screen.getByTestId("selective-export-item-books") as HTMLInputElement).checked,
        ).toBe(false);
        expect(screen.getByTestId("selective-export-empty-hint")).toBeTruthy();
    });

    it("disables the export button when nothing is selected", () => {
        render(<SelectiveExportSection />);
        const selectAll = screen.getByTestId("selective-export-select-all");
        fireEvent.click(selectAll); // all on
        fireEvent.click(selectAll); // all off
        expect((screen.getByTestId("selective-export-button") as HTMLButtonElement).disabled).toBe(
            true,
        );
    });

    it("exports the chosen selection and downloads the blob", async () => {
        const fakeBlob = new Blob(["{}"], { type: "application/json" });
        mockExport.mockResolvedValue(fakeBlob);
        render(<SelectiveExportSection />);
        fireEvent.click(screen.getByTestId("selective-export-button"));
        await waitFor(() => expect(mockExport).toHaveBeenCalled());
        const passedSelection = mockExport.mock.calls[0][0];
        expect(passedSelection.books).toBe(true);
        expect(passedSelection.articles).toBe(true);
        expect(passedSelection.settings).toBe(false);
        await waitFor(() => expect(mockDownload).toHaveBeenCalled());
        expect(mockDownload.mock.calls[0][1]).toMatch(/^bibliogon-export-\d{4}-\d{2}-\d{2}\.json$/);
        expect(mockNotifySuccess).toHaveBeenCalled();
    });

    it("fires notify.error when the export fails", async () => {
        mockExport.mockRejectedValue(new Error("boom"));
        render(<SelectiveExportSection />);
        fireEvent.click(screen.getByTestId("selective-export-button"));
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled());
        expect(mockDownload).not.toHaveBeenCalled();
    });
});
