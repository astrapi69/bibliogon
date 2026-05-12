import {describe, it, expect, vi, beforeEach, afterAll} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"
import NewFromTemplateButton from "./NewFromTemplateButton"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 4/10. Pins the
// "New from template" workflow: language picker drives the
// empty-template download, drop zone accepts the filled YAML,
// submit calls fromAiTemplate and the parent's onCreated fires
// with the resulting record.

vi.mock("../hooks/useI18n", () => ({
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
            articles: {
                aiTemplate: {empty: make()},
                fromAiTemplate: make(),
            },
            books: {
                aiTemplate: {empty: make()},
                fromAiTemplate: make(),
            },
        },
    }
})

vi.mock("../utils/notify", () => ({notify: notifyMock}))

vi.mock("../api/client", () => ({
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

const originalCreateObjectURL = globalThis.URL.createObjectURL
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL

beforeEach(() => {
    notifyMock.success.mockReset()
    notifyMock.error.mockReset()
    notifyMock.info.mockReset()
    notifyMock.warning.mockReset()
    apiMock.articles.aiTemplate.empty.mockReset()
    apiMock.articles.fromAiTemplate.mockReset()
    apiMock.books.aiTemplate.empty.mockReset()
    apiMock.books.fromAiTemplate.mockReset()
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake")
    globalThis.URL.revokeObjectURL = vi.fn()
})

afterAll(() => {
    if (originalCreateObjectURL)
        globalThis.URL.createObjectURL = originalCreateObjectURL
    if (originalRevokeObjectURL)
        globalThis.URL.revokeObjectURL = originalRevokeObjectURL
})

describe("NewFromTemplateButton", () => {
    it("renders the trigger button with custom testId + classname", () => {
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton
                kind="article"
                onCreated={onCreated}
                triggerTestId="my-trigger"
                triggerClassName="btn btn-foo"
            />,
        )
        const trigger = screen.getByTestId("my-trigger")
        expect(trigger).toBeTruthy()
        expect(trigger.className).toContain("btn-foo")
    })

    it("clicking the trigger opens the dialog", () => {
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton kind="article" onCreated={onCreated}/>,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        expect(screen.getByTestId("new-from-template-dialog")).toBeTruthy()
        expect(screen.getByTestId("template-import-dropzone")).toBeTruthy()
    })

    it("download button calls aiTemplate.empty with the selected language", async () => {
        const blob = new Blob(["type: article\nlanguage: de\n"], {type: "text/yaml"})
        apiMock.articles.aiTemplate.empty.mockResolvedValue({
            blob,
            filename: "new-article-de.biblio.yaml",
        })
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton
                kind="article"
                onCreated={onCreated}
                defaultLanguage="de"
            />,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        fireEvent.click(screen.getByTestId("new-from-template-download"))
        await waitFor(() => {
            expect(apiMock.articles.aiTemplate.empty).toHaveBeenCalledWith("de")
            expect(notifyMock.success).toHaveBeenCalled()
        })
    })

    it("language selector changes the language passed to the download", async () => {
        const blob = new Blob(["x"], {type: "text/yaml"})
        apiMock.articles.aiTemplate.empty.mockResolvedValue({
            blob,
            filename: "x.biblio.yaml",
        })
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton
                kind="article"
                onCreated={onCreated}
                defaultLanguage="en"
            />,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        const select = screen.getByTestId(
            "new-from-template-language",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "fr"}})
        fireEvent.click(screen.getByTestId("new-from-template-download"))
        await waitFor(() =>
            expect(apiMock.articles.aiTemplate.empty).toHaveBeenCalledWith("fr"),
        )
    })

    it("submit is disabled until a file is picked", () => {
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton kind="article" onCreated={onCreated}/>,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        const submit = screen.getByTestId(
            "new-from-template-submit",
        ) as HTMLButtonElement
        expect(submit.disabled).toBe(true)
    })

    it("submit reads the file as text and calls fromAiTemplate", async () => {
        apiMock.articles.fromAiTemplate.mockResolvedValue({
            id: "new1",
            title: "AI-Generated",
            language: "en",
        })
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton kind="article" onCreated={onCreated}/>,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        const dropzone = screen.getByTestId("template-import-dropzone")
        const file = new File(
            ["type: article\nschema_version: 1\n"],
            "filled.biblio.yaml",
        )
        fireEvent.drop(dropzone, {dataTransfer: {files: [file]}})
        await waitFor(() =>
            expect(screen.getByTestId("template-import-file-preview")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("new-from-template-submit"))
        await waitFor(() => {
            expect(apiMock.articles.fromAiTemplate).toHaveBeenCalledWith(
                "type: article\nschema_version: 1\n",
            )
            expect(onCreated).toHaveBeenCalledWith({
                id: "new1",
                title: "AI-Generated",
                language: "en",
            })
            expect(notifyMock.success).toHaveBeenCalled()
        })
    })

    it("submit failure surfaces ApiError detail and keeps the dialog open", async () => {
        const {ApiError} = await import("../api/client")
        apiMock.articles.fromAiTemplate.mockRejectedValue(
            new ApiError(
                400,
                "Article template's title field has no current_value",
                "/api/x",
                "POST",
            ),
        )
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton kind="article" onCreated={onCreated}/>,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        const file = new File(["x"], "filled.biblio.yaml")
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [file]},
        })
        fireEvent.click(screen.getByTestId("new-from-template-submit"))
        await waitFor(() =>
            expect(notifyMock.error).toHaveBeenCalledWith(
                "Article template's title field has no current_value",
                expect.any(Object),
            ),
        )
        // Dialog still open.
        expect(screen.getByTestId("new-from-template-dialog")).toBeTruthy()
        expect(onCreated).not.toHaveBeenCalled()
    })

    it("book kind routes through api.books namespace", async () => {
        apiMock.books.aiTemplate.empty.mockResolvedValue({
            blob: new Blob(["type: book\n"]),
            filename: "new-book-en.biblio.yaml",
        })
        apiMock.books.fromAiTemplate.mockResolvedValue({
            id: "b1",
            title: "Book",
            language: "en",
        })
        const onCreated = vi.fn() as (created: unknown) => void
        render(<NewFromTemplateButton kind="book" onCreated={onCreated}/>)
        fireEvent.click(screen.getByTestId("new-from-template-book"))
        fireEvent.click(screen.getByTestId("new-from-template-download"))
        await waitFor(() =>
            expect(apiMock.books.aiTemplate.empty).toHaveBeenCalled(),
        )

        const file = new File(["type: book\n"], "filled.biblio.yaml")
        fireEvent.drop(screen.getByTestId("template-import-dropzone"), {
            dataTransfer: {files: [file]},
        })
        fireEvent.click(screen.getByTestId("new-from-template-submit"))
        await waitFor(() =>
            expect(apiMock.books.fromAiTemplate).toHaveBeenCalled(),
        )
        // Article namespace was untouched.
        expect(apiMock.articles.fromAiTemplate).not.toHaveBeenCalled()
    })

    it("cancel closes the dialog without calling onCreated", () => {
        const onCreated = vi.fn() as (created: unknown) => void
        render(
            <NewFromTemplateButton kind="article" onCreated={onCreated}/>,
        )
        fireEvent.click(screen.getByTestId("new-from-template-article"))
        fireEvent.click(screen.getByTestId("new-from-template-cancel"))
        expect(screen.queryByTestId("new-from-template-dialog")).toBeNull()
        expect(onCreated).not.toHaveBeenCalled()
    })
})
