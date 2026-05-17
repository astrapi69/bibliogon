/**
 * Tests for the MediumImportPage state machine (v2 dry-run preview
 * workflow, MEDIUM-IMPORT-V2-01).
 *
 * Pins:
 *   - Phase 1 (v0.32.0 regression): the file is auto-cleared after a
 *     successful import so a second click can't re-trigger. The v2
 *     flow preserves this contract: file is cleared on
 *     importSelected() success, NOT on preview() success.
 *   - Phase 2 (v0.32.0 regression): the file STAYS selected on
 *     import failure so the user can retry without re-uploading.
 *   - v2 happy path: pick file -> Vorschau -> preview-section renders
 *     -> click Import N -> result section renders.
 *   - v2 deselect: row-checkbox unchecks reduce the Import button label
 *     count + disable when none remain.
 *   - v2 cancel: clicking Abbrechen calls cancelPreview() and returns
 *     to idle (preview section unmounts).
 *   - v2 preview failure: failed preview() returns to idle with file
 *     still selected for retry.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import MediumImportPage from "./MediumImportPage";
import type {
    MediumImportPreviewResponse,
    MediumImportResponse,
} from "../api/client";

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

vi.mock("../utils/notify", () => ({
    notify: {
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("../components/medium-import/MediumImportSettings", () => ({
    default: () => <div data-testid="medium-import-settings-stub" />,
}));

const previewMock = vi.fn();
const importSelectedMock = vi.fn();
const cancelPreviewMock = vi.fn();

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    );
    return {
        ...actual,
        api: {
            ...actual.api,
            mediumImport: {
                importZip: vi.fn(),
                preview: (...args: unknown[]) => previewMock(...args),
                importSelected: (...args: unknown[]) => importSelectedMock(...args),
                cancelPreview: (...args: unknown[]) => cancelPreviewMock(...args),
            },
        },
    };
});

function makeFile(name: string, sizeBytes: number): File {
    const file = new File([new Uint8Array(0)], name, { type: "application/zip" });
    Object.defineProperty(file, "size", { value: sizeBytes });
    return file;
}

function pickFile(container: HTMLElement, file: File) {
    const input = container.querySelector(
        '[data-testid="medium-import-upload-input"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
}

function withRouter(node: React.ReactElement) {
    return render(<MemoryRouter>{node}</MemoryRouter>);
}

function makePreview(filenames: string[]): MediumImportPreviewResponse {
    return {
        preview_id: "preview-abc",
        total_posts: filenames.length,
        items: filenames.map((fn, idx) => ({
            filename: fn,
            title: `Title ${idx + 1}`,
            subtitle: "",
            author: "Asterios",
            published_at: "2024-02-04T12:00:00.000Z",
            canonical_url: `https://medium.com/p/${fn}`,
            detected_language: "en",
            classification: "article",
            existing_article_id: null,
            body_preview: "",
            warnings: [],
        })),
        errored: [],
        expires_at: Date.now() / 1000 + 1800,
    };
}

const sampleImportResult: MediumImportResponse = {
    imported_count: 1,
    skipped_count: 0,
    errored_count: 0,
    imported: [],
    skipped: [],
    errored: [],
};

describe("MediumImportPage v2 state machine", () => {
    it("happy path: pick file -> Vorschau -> Import N -> result shown, file cleared", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html", "b.html"]));
        importSelectedMock.mockResolvedValue(sampleImportResult);

        const { container } = withRouter(<MediumImportPage />);

        pickFile(container, makeFile("medium.zip", 1024));
        const startBtn = screen.getByTestId(
            "medium-import-start",
        ) as HTMLButtonElement;
        await waitFor(() => expect(startBtn.disabled).toBe(false));

        fireEvent.click(startBtn);
        // Preview section appears with both rows.
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );
        expect(screen.getByTestId("medium-import-preview-row-a.html")).toBeInTheDocument();
        expect(screen.getByTestId("medium-import-preview-row-b.html")).toBeInTheDocument();

        // Import button label reflects full selection by default.
        const importBtn = screen.getByTestId(
            "medium-import-preview-import-btn",
        ) as HTMLButtonElement;
        expect(importBtn.textContent).toContain("2");

        fireEvent.click(importBtn);
        await waitFor(() =>
            expect(screen.getByTestId("medium-import-result")).toBeInTheDocument(),
        );

        // Preview section gone, file cleared (v0.32.0 regression pin).
        expect(screen.queryByTestId("medium-import-preview-section")).toBeNull();
        expect(screen.queryByTestId("medium-import-upload-selected")).toBeNull();
        expect(importSelectedMock).toHaveBeenCalledWith("preview-abc", [
            "a.html",
            "b.html",
        ]);
    });

    it("deselect row: Import button label updates, disables at zero", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html", "b.html"]));

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        fireEvent.click(screen.getByTestId("medium-import-start"));
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );

        const importBtn = screen.getByTestId(
            "medium-import-preview-import-btn",
        ) as HTMLButtonElement;
        // Uncheck row a.
        fireEvent.click(
            screen.getByTestId("medium-import-preview-row-checkbox-a.html"),
        );
        await waitFor(() => expect(importBtn.textContent).toContain("1"));

        // Uncheck row b -> button disabled at zero selection.
        fireEvent.click(
            screen.getByTestId("medium-import-preview-row-checkbox-b.html"),
        );
        await waitFor(() => expect(importBtn.disabled).toBe(true));
    });

    it("cancel: clicking Abbrechen calls cancelPreview() and returns to idle", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html"]));
        cancelPreviewMock.mockResolvedValue({ deleted: true });

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        fireEvent.click(screen.getByTestId("medium-import-start"));
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByTestId("medium-import-preview-cancel-btn"));
        await waitFor(() =>
            expect(screen.queryByTestId("medium-import-preview-section")).toBeNull(),
        );
        expect(cancelPreviewMock).toHaveBeenCalledWith("preview-abc");

        // File still selected so the user can re-preview without re-picking.
        expect(screen.getByTestId("medium-import-upload-selected")).toBeInTheDocument();
    });

    it("preview failure: returns to idle with file still selected for retry", async () => {
        previewMock.mockRejectedValue(new Error("network down"));

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        const startBtn = screen.getByTestId(
            "medium-import-start",
        ) as HTMLButtonElement;
        fireEvent.click(startBtn);

        await waitFor(() => expect(previewMock).toHaveBeenCalled());
        await waitFor(() => expect(startBtn.disabled).toBe(false));
        // File preserved so a second click can retry.
        expect(screen.getByTestId("medium-import-upload-selected")).toBeInTheDocument();
        // No preview section appeared.
        expect(screen.queryByTestId("medium-import-preview-section")).toBeNull();
    });

    it("import failure: stays in previewing phase so user can retry without re-uploading", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html"]));
        importSelectedMock.mockRejectedValue(new Error("import broke"));

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        fireEvent.click(screen.getByTestId("medium-import-start"));
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );

        const importBtn = screen.getByTestId(
            "medium-import-preview-import-btn",
        ) as HTMLButtonElement;
        fireEvent.click(importBtn);
        await waitFor(() => expect(importSelectedMock).toHaveBeenCalled());

        // Preview section still mounted (user can retry the import).
        expect(screen.getByTestId("medium-import-preview-section")).toBeInTheDocument();
        // Import button re-enabled.
        await waitFor(() => expect(importBtn.disabled).toBe(false));
    });
});
