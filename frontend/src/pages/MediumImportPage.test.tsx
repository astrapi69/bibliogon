/**
 * Tests for the MediumImportPage state machine — async dry-run
 * preview workflow (ASYNC-IMPORT-PROGRESS-01).
 *
 * Pins:
 *   - v0.32.0 regression: file is auto-cleared after a successful
 *     import so a second click can't re-trigger. Preserved in the
 *     async path: the file clears when the SSE-driven job lands as
 *     "completed", NOT on preview() success.
 *   - v2 happy path: pick -> Vorschau -> Import -> SSE driven
 *     completion -> result section renders.
 *   - v2 deselect: row-checkbox unchecks reduce the Import button
 *     label count + disable when none remain.
 *   - v2 cancel-preview: clicking Abbrechen during the previewing
 *     phase calls cancelPreview() and returns to idle.
 *   - v2 preview failure: failed preview() returns to idle with
 *     file still selected for retry.
 *   - async failure: failed job -> return to previewing for retry
 *     (preview cache stays intact per backend contract).
 *
 * Strategy: mock both ``api.mediumImport.*`` AND the
 * ``useMediumImportJob`` hook. The hook mock returns a manually-
 * controlled context shape so the test can drive the page's
 * watcher useEffect through the same states the real SSE stream
 * would produce.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const importSelectedAsyncMock = vi.fn();
const cancelPreviewMock = vi.fn();
const getJobResultMock = vi.fn();
const cancelJobMock = vi.fn();

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
                importSelected: vi.fn(),
                importSelectedAsync: (...args: unknown[]) =>
                    importSelectedAsyncMock(...args),
                getJobResult: (...args: unknown[]) => getJobResultMock(...args),
                cancelPreview: (...args: unknown[]) => cancelPreviewMock(...args),
                cancelJob: (...args: unknown[]) => cancelJobMock(...args),
            },
        },
    };
});

// Mutable job-context state the tests drive directly. Each test
// resets to the idle defaults; the test then mutates to simulate
// SSE-driven transitions.
let jobState = makeIdleJob();

function makeIdleJob() {
    return {
        active: false,
        jobId: null as string | null,
        phase: "idle" as
            | "idle"
            | "connecting"
            | "running"
            | "completed"
            | "failed"
            | "cancelled",
        total: 0,
        current: 0,
        currentFilename: "",
        events: [],
        importedCount: 0,
        skippedCount: 0,
        erroredCount: 0,
        importedCommentsCount: 0,
        skippedCommentsCount: 0,
        errorMessage: null as string | null,
        result: null as MediumImportResponse | null,
        start: vi.fn((id: string) => {
            jobState.active = true;
            jobState.jobId = id;
            jobState.phase = "running";
        }),
        clear: vi.fn(() => {
            jobState = { ...makeIdleJob(), start: jobState.start, clear: jobState.clear, cancel: jobState.cancel };
        }),
        cancel: vi.fn(async () => {
            jobState.phase = "cancelled";
        }),
    };
}

vi.mock("../contexts/MediumImportJobContext", () => ({
    useMediumImportJob: () => jobState,
    // Provider not used in tests; the hook mock is the surface.
    MediumImportJobProvider: ({ children }: { children: React.ReactNode }) =>
        children,
}));

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

describe("MediumImportPage async state machine", () => {
    beforeEach(() => {
        jobState = makeIdleJob();
        previewMock.mockReset();
        importSelectedAsyncMock.mockReset();
        cancelPreviewMock.mockReset();
        getJobResultMock.mockReset();
        cancelJobMock.mockReset();
    });

    it("happy path: pick -> Vorschau -> Import (async) -> SSE-driven completion -> result + file cleared", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html", "b.html"]));
        importSelectedAsyncMock.mockResolvedValue({
            job_id: "job-1",
            status: "pending",
        });

        const { container, rerender } = withRouter(<MediumImportPage />);

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

        // The async API call submitted with the selection.
        await waitFor(() =>
            expect(importSelectedAsyncMock).toHaveBeenCalledWith("preview-abc", [
                "a.html",
                "b.html",
            ]),
        );
        // And handed the job_id to the context.
        await waitFor(() => expect(jobState.start).toHaveBeenCalledWith("job-1"));

        // Simulate SSE-driven completion: the context flips to
        // completed + populates result. Re-render so the watcher
        // useEffect picks up the new context value.
        jobState.phase = "completed";
        jobState.result = sampleImportResult;
        rerender(
            <MemoryRouter>
                <MediumImportPage />
            </MemoryRouter>,
        );

        await waitFor(() =>
            expect(screen.getByTestId("medium-import-result")).toBeInTheDocument(),
        );

        // File auto-cleared (v0.32.0 regression pin preserved).
        expect(screen.queryByTestId("medium-import-upload-selected")).toBeNull();
        // Preview section unmounted.
        expect(screen.queryByTestId("medium-import-preview-section")).toBeNull();
        // Context.clear() fired so localStorage and ref are dropped.
        expect(jobState.clear).toHaveBeenCalled();
    });

    it("deselect: Import button label updates, disables at zero", async () => {
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
        fireEvent.click(
            screen.getByTestId("medium-import-preview-row-checkbox-a.html"),
        );
        await waitFor(() => expect(importBtn.textContent).toContain("1"));

        fireEvent.click(
            screen.getByTestId("medium-import-preview-row-checkbox-b.html"),
        );
        await waitFor(() => expect(importBtn.disabled).toBe(true));
    });

    it("cancel-preview: clicking Abbrechen calls cancelPreview() and returns to idle", async () => {
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
        // File preserved so the user can re-preview without re-picking.
        expect(screen.getByTestId("medium-import-upload-selected")).toBeInTheDocument();
    });

    it("preview failure: returns to idle with file preserved for retry", async () => {
        previewMock.mockRejectedValue(new Error("network down"));

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        const startBtn = screen.getByTestId(
            "medium-import-start",
        ) as HTMLButtonElement;
        fireEvent.click(startBtn);

        await waitFor(() => expect(previewMock).toHaveBeenCalled());
        await waitFor(() => expect(startBtn.disabled).toBe(false));
        expect(screen.getByTestId("medium-import-upload-selected")).toBeInTheDocument();
        expect(screen.queryByTestId("medium-import-preview-section")).toBeNull();
    });

    it("async submission failure: returns to previewing for retry without re-uploading", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html"]));
        importSelectedAsyncMock.mockRejectedValue(new Error("submit failed"));

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
        await waitFor(() => expect(importSelectedAsyncMock).toHaveBeenCalled());

        // Preview section still mounted — async submission rolled
        // back to previewing.
        expect(
            screen.getByTestId("medium-import-preview-section"),
        ).toBeInTheDocument();
        await waitFor(() => expect(importBtn.disabled).toBe(false));
    });

    it("async job failure (SSE-driven): rewinds to previewing so user can retry", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html"]));
        importSelectedAsyncMock.mockResolvedValue({
            job_id: "job-fail",
            status: "pending",
        });

        const { container, rerender } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        fireEvent.click(screen.getByTestId("medium-import-start"));
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("medium-import-preview-import-btn"));
        await waitFor(() => expect(jobState.start).toHaveBeenCalled());

        // Simulate SSE failure.
        jobState.phase = "failed";
        jobState.errorMessage = "worker exploded";
        rerender(
            <MemoryRouter>
                <MediumImportPage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(jobState.clear).toHaveBeenCalled());
        // Preview section still mounted; user can retry the same
        // selection (the preview cache stays alive on failure).
        expect(
            screen.getByTestId("medium-import-preview-section"),
        ).toBeInTheDocument();
    });

    it("cancel during import: clicking the button calls job.cancel() not cancelPreview()", async () => {
        previewMock.mockResolvedValue(makePreview(["a.html"]));
        importSelectedAsyncMock.mockResolvedValue({
            job_id: "job-x",
            status: "pending",
        });

        const { container } = withRouter(<MediumImportPage />);
        pickFile(container, makeFile("medium.zip", 1024));
        fireEvent.click(screen.getByTestId("medium-import-start"));
        await waitFor(() =>
            expect(
                screen.getByTestId("medium-import-preview-section"),
            ).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByTestId("medium-import-preview-import-btn"));
        await waitFor(() => expect(importSelectedAsyncMock).toHaveBeenCalled());

        fireEvent.click(screen.getByTestId("medium-import-preview-cancel-btn"));
        await waitFor(() => expect(jobState.cancel).toHaveBeenCalled());
        // Critically NOT calling the preview-cache cancel.
        expect(cancelPreviewMock).not.toHaveBeenCalled();
    });
});
