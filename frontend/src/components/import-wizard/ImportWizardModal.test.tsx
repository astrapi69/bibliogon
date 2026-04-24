import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ImportWizardModal from "./ImportWizardModal";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

const detectImportMock = vi.fn();
const executeImportMock = vi.fn();
vi.mock("../../api/import", () => ({
    detectImport: (...args: unknown[]) => detectImportMock(...args),
    executeImport: (...args: unknown[]) => executeImportMock(...args),
}));

vi.mock("../../api/client", () => {
    class ApiError extends Error {
        status: number;
        detail: string;
        constructor(status: number, detail: string) {
            super(detail);
            this.status = status;
            this.detail = detail;
        }
    }
    return { ApiError };
});

vi.mock("../AppDialog", () => ({
    useDialog: () => ({
        confirm: vi.fn().mockResolvedValue(true),
        alert: vi.fn().mockResolvedValue(undefined),
    }),
}));

function renderModal(onClose = vi.fn(), onImported = vi.fn()) {
    return render(
        <MemoryRouter>
            <ImportWizardModal open={true} onClose={onClose} onImported={onImported} />
        </MemoryRouter>,
    );
}

function makeFile(name = "book.md", size = 64): File {
    return new File([new Uint8Array(size)], name, { type: "text/markdown" });
}

function dropFile(file: File) {
    // UploadStep's hidden <input data-testid="upload-input"> drives the
    // same onInputSelected callback as drag-drop; using fireEvent.change
    // is more reliable under happy-dom than simulating DragEvents.
    const input = screen.getByTestId("upload-input");
    fireEvent.change(input, { target: { files: [file] } });
}

const SUCCESS_DETECT = {
    detected: {
        format_name: "markdown",
        source_identifier: "signature:abc",
        title: "State Machine Book",
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
        chapters: [
            {
                title: "State Machine Book",
                position: 0,
                word_count: 3,
                content_preview: "Body",
            },
        ],
        assets: [],
        warnings: [],
        plugin_specific_data: {},
    },
    duplicate: { found: false },
    temp_ref: "imp-statemachine",
};

const DUPLICATE_DETECT = {
    ...SUCCESS_DETECT,
    duplicate: {
        found: true,
        existing_book_id: "existing-1",
        existing_book_title: "State Machine Book",
        imported_at: "2026-04-20T00:00:00Z",
    },
    temp_ref: "imp-duplicate",
};

describe("ImportWizardModal scaffold", () => {
    beforeEach(() => {
        detectImportMock.mockReset();
        executeImportMock.mockReset();
    });

    it("is not rendered when open=false", () => {
        render(
            <MemoryRouter>
                <ImportWizardModal open={false} onClose={vi.fn()} />
            </MemoryRouter>,
        );
        expect(screen.queryByTestId("import-wizard-modal")).not.toBeInTheDocument();
    });

    it("renders the step-1 upload content when open=true", () => {
        renderModal();
        expect(screen.getByTestId("import-wizard-modal")).toBeInTheDocument();
        expect(screen.getByTestId("upload-step")).toBeInTheDocument();
        expect(screen.getByTestId("wizard-step-indicator")).toHaveTextContent(
            /Step 1 of 4/,
        );
    });

    it("close button invokes onClose", () => {
        const onClose = vi.fn();
        renderModal(onClose);
        fireEvent.click(screen.getByTestId("wizard-close"));
        expect(onClose).toHaveBeenCalled();
    });
});

describe("ImportWizardModal state machine", () => {
    beforeEach(() => {
        detectImportMock.mockReset();
        executeImportMock.mockReset();
    });

    it("drives upload -> detecting -> summary -> preview -> executing -> success", async () => {
        detectImportMock.mockResolvedValue(SUCCESS_DETECT);
        executeImportMock.mockResolvedValue({
            book_id: "new-book-1",
            status: "created",
        });
        const onImported = vi.fn();
        renderModal(vi.fn(), onImported);

        dropFile(makeFile());

        // Step 2a: detecting spinner.
        await waitFor(() =>
            expect(screen.getByTestId("detecting-step")).toBeInTheDocument(),
        );

        // Step 2b: summary.
        await waitFor(() =>
            expect(screen.getByTestId("summary-step")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("summary-next"));

        // Step 3: preview with detected title.
        await waitFor(() =>
            expect(screen.getByTestId("preview-step")).toBeInTheDocument(),
        );
        expect(screen.getByTestId("wizard-step-indicator")).toHaveTextContent(
            /Step 3 of 4/,
        );

        // Confirm advances to executing (step 4).
        fireEvent.click(screen.getByTestId("preview-confirm"));
        await waitFor(() =>
            expect(screen.getByTestId("executing-step")).toBeInTheDocument(),
        );
        expect(executeImportMock).toHaveBeenCalledWith(
            "imp-statemachine",
            expect.objectContaining({
                title: "State Machine Book",
                author: "Alice",
            }),
            "create",
            null,
        );

        // Step success: bookId surfaced to onImported.
        await waitFor(() =>
            expect(screen.getByTestId("success-step")).toBeInTheDocument(),
        );
        expect(onImported).toHaveBeenCalledWith("new-book-1");
    });

    it("exposes overwrite action when detect reports a duplicate", async () => {
        detectImportMock.mockResolvedValue(DUPLICATE_DETECT);
        executeImportMock.mockResolvedValue({
            book_id: "existing-1",
            status: "overwritten",
        });
        renderModal();

        dropFile(makeFile());

        await waitFor(() =>
            expect(screen.getByTestId("summary-step")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("summary-next"));

        await waitFor(() =>
            expect(screen.getByTestId("preview-step")).toBeInTheDocument(),
        );
        expect(screen.getByTestId("duplicate-banner")).toBeInTheDocument();

        // Toggle to overwrite via the banner action. The confirm()
        // dialog is mocked to resolve truthy, so the action flips on
        // the next microtask; wait for aria-pressed to flip before
        // submitting.
        fireEvent.click(screen.getByTestId("duplicate-overwrite"));
        await waitFor(() =>
            expect(screen.getByTestId("duplicate-overwrite")).toHaveAttribute(
                "aria-pressed",
                "true",
            ),
        );
        fireEvent.click(screen.getByTestId("preview-confirm"));

        await waitFor(() =>
            expect(executeImportMock).toHaveBeenCalledWith(
                "imp-duplicate",
                expect.objectContaining({
                    title: "State Machine Book",
                    author: "Alice",
                }),
                "overwrite",
                "existing-1",
            ),
        );
    });

    it("routes detect failure to error step with retry available", async () => {
        const { ApiError } = await import("../../api/client");
        detectImportMock.mockRejectedValue(
            new ApiError(415, "Unsupported format", "/api/import/detect", "POST"),
        );
        renderModal();

        dropFile(makeFile("book.md"));

        await waitFor(() =>
            expect(screen.getByTestId("error-step")).toBeInTheDocument(),
        );
        expect(screen.getByText(/unsupported/i)).toBeInTheDocument();
    });

    it("execute failure routes to error step", async () => {
        const { ApiError } = await import("../../api/client");
        detectImportMock.mockResolvedValue(SUCCESS_DETECT);
        executeImportMock.mockRejectedValue(
            new ApiError(
                500,
                "Import handler failed: boom",
                "/api/import/execute",
                "POST",
            ),
        );
        renderModal();

        dropFile(makeFile());
        await waitFor(() =>
            expect(screen.getByTestId("summary-step")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("summary-next"));
        await waitFor(() =>
            expect(screen.getByTestId("preview-step")).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("preview-confirm"));

        await waitFor(() =>
            expect(screen.getByTestId("error-step")).toBeInTheDocument(),
        );
        expect(screen.getByText(/boom/i)).toBeInTheDocument();
    });

    it("summary back returns to upload step", async () => {
        detectImportMock.mockResolvedValue(SUCCESS_DETECT);
        renderModal();

        dropFile(makeFile());
        await waitFor(() =>
            expect(screen.getByTestId("summary-step")).toBeInTheDocument(),
        );

        fireEvent.click(screen.getByTestId("summary-back"));
        expect(screen.getByTestId("upload-step")).toBeInTheDocument();
    });
});
