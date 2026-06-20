import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"
import BulkTemplateImportDialog from "./BulkTemplateImportDialog"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 6/10. Pins the
// reusable bulk-import dialog: ZIP-only drop zone, force
// toggle, three response shapes (all-failed / partial /
// success) each emit the right toast, ApiError surfaces via
// notify.error, kind-aware routing to api.{articles,books}.

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

const {notifyMock, apiMock} = vi.hoisted(() => {
    const make = () => vi.fn()
    return {
        notifyMock: {
            success: make(),
            error: make(),
            info: make(),
            warning: make(),
            saveError: make(),
            bulkAction: make(),
        },
        apiMock: {
            articles: {bulkAiTemplate: {import: make()}},
            books: {bulkAiTemplate: {import: make()}},
        },
    }
})

vi.mock("../../utils/platform/notify", () => ({notify: notifyMock}))

vi.mock("../../api/client", () => ({
    api: apiMock,
    ApiError: class ApiError extends Error {
        constructor(
            public status: number,
            public detail: string,
            public endpoint?: string,
            public method?: string,
        ) {
            super(detail)
            this.name = "ApiError"
        }
    },
}))

beforeEach(() => {
    notifyMock.success.mockReset()
    notifyMock.error.mockReset()
    notifyMock.info.mockReset()
    notifyMock.warning.mockReset()
    apiMock.articles.bulkAiTemplate.import.mockReset()
    apiMock.books.bulkAiTemplate.import.mockReset()
})

describe("BulkTemplateImportDialog", () => {
    it("renders the bulk drop zone (mode=bulk)", () => {
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="article"
            />,
        )
        const zone = screen.getByTestId("template-import-dropzone")
        expect(zone.getAttribute("data-mode")).toBe("bulk")
    })

    it("submit is disabled until a ZIP is picked", () => {
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="article"
            />,
        )
        const submit = screen.getByTestId(
            "bulk-template-import-submit",
        ) as HTMLButtonElement
        expect(submit.disabled).toBe(true)
    })

    it("submit calls api.articles.bulkAiTemplate.import with file + force", async () => {
        apiMock.articles.bulkAiTemplate.import.mockResolvedValue({
            imported: [
                {filename: "a.biblio.yaml", article_id: "a1", updated_fields: [], skipped_fields: [], skip_reasons: {}},
            ],
            failed: [],
            force: false,
        })
        const onApplied = vi.fn() as (result: unknown) => void
        const onClose = vi.fn() as () => void
        render(
            <BulkTemplateImportDialog
                open
                onClose={onClose}
                kind="article"
                onApplied={onApplied}
            />,
        )
        const file = new File([new Uint8Array([0x50, 0x4b])], "templates.zip", {
            type: "application/zip",
        })
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [file]},
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))

        await waitFor(() => {
            expect(apiMock.articles.bulkAiTemplate.import).toHaveBeenCalledWith(
                file,
                false,
            )
            expect(notifyMock.success).toHaveBeenCalled()
            expect(onApplied).toHaveBeenCalledTimes(1)
            expect(onClose).toHaveBeenCalled()
        })
    })

    it("force=true propagates to the import call", async () => {
        apiMock.articles.bulkAiTemplate.import.mockResolvedValue({
            imported: [],
            failed: [],
            force: true,
        })
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("bulk-template-import-force"))
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {
                files: [new File(["x"], "x.zip", {type: "application/zip"})],
            },
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))
        await waitFor(() =>
            expect(apiMock.articles.bulkAiTemplate.import).toHaveBeenCalledWith(
                expect.any(File),
                true,
            ),
        )
    })

    it("all-failed response emits an error toast (not success)", async () => {
        apiMock.articles.bulkAiTemplate.import.mockResolvedValue({
            imported: [],
            failed: [
                {filename: "a.biblio.yaml", error: "Article not found"},
                {filename: "b.biblio.yaml", error: "schema_version mismatch"},
            ],
            force: false,
        })
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="article"
            />,
        )
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [new File(["x"], "x.zip")]},
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))
        await waitFor(() => {
            expect(notifyMock.error).toHaveBeenCalled()
            expect(notifyMock.success).not.toHaveBeenCalled()
            expect(notifyMock.warning).not.toHaveBeenCalled()
        })
    })

    it("partial response emits a warning toast", async () => {
        apiMock.articles.bulkAiTemplate.import.mockResolvedValue({
            imported: [
                {filename: "a.biblio.yaml", article_id: "a1", updated_fields: ["seo_title"], skipped_fields: [], skip_reasons: {}},
            ],
            failed: [
                {filename: "b.biblio.yaml", error: "Article not found"},
            ],
            force: false,
        })
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="article"
            />,
        )
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [new File(["x"], "x.zip")]},
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))
        await waitFor(() => {
            expect(notifyMock.warning).toHaveBeenCalled()
            expect(notifyMock.success).not.toHaveBeenCalled()
        })
    })

    it("ApiError surfaces via notify.error and dialog stays open", async () => {
        const {ApiError} = await import("../../api/client")
        apiMock.articles.bulkAiTemplate.import.mockRejectedValue(
            new ApiError(422, "ZIP contains 60 templates; cap is 50", "/api/x", "POST"),
        )
        const onApplied = vi.fn() as (result: unknown) => void
        const onClose = vi.fn() as () => void
        render(
            <BulkTemplateImportDialog
                open
                onClose={onClose}
                kind="article"
                onApplied={onApplied}
            />,
        )
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [new File(["x"], "x.zip")]},
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))
        await waitFor(() =>
            expect(notifyMock.error).toHaveBeenCalledWith(
                expect.stringContaining("cap is 50"),
                expect.any(Object),
            ),
        )
        expect(onApplied).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("kind=book routes through api.books namespace", async () => {
        apiMock.books.bulkAiTemplate.import.mockResolvedValue({
            imported: [
                {filename: "b.biblio.yaml", book_id: "b1", updated_fields: [], skipped_fields: [], skip_reasons: {}, dropped_chapter_summaries: []},
            ],
            failed: [],
            force: false,
        })
        render(
            <BulkTemplateImportDialog
                open
                onClose={() => {}}
                kind="book"
            />,
        )
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [new File(["x"], "x.zip")]},
        })
        fireEvent.click(screen.getByTestId("bulk-template-import-submit"))
        await waitFor(() => {
            expect(apiMock.books.bulkAiTemplate.import).toHaveBeenCalled()
            expect(apiMock.articles.bulkAiTemplate.import).not.toHaveBeenCalled()
        })
    })

    it("cancel button closes the dialog without calling the API", () => {
        const onClose = vi.fn() as () => void
        render(
            <BulkTemplateImportDialog
                open
                onClose={onClose}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("bulk-template-import-cancel"))
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(apiMock.articles.bulkAiTemplate.import).not.toHaveBeenCalled()
    })
})
