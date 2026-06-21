/**
 * Tests for PdfExportControls.
 *
 * Workspace defaults for format + bleed live in app.yaml (per the
 * Settings-Completeness audit close, 2026-05-27). Inline picks
 * within the export controls are session-only — the global default
 * changes via Settings > Editor only. Legacy localStorage keys
 * (``bibliogon-picture-book-format`` +
 * ``bibliogon-picture-book-bleed-marks``) are read once on first
 * mount for migration, then cleared.
 *
 * Pinned behaviour:
 * - 5 format options rendered (parity with PICTURE_BOOK_FORMATS)
 * - Mount fetches workspace defaults via ``api.settings.getApp``
 * - Legacy localStorage values fill the gap on first mount after
 *   upgrade AND are pushed to app.yaml then cleared
 * - Inline changes do NOT write to localStorage or app.yaml
 * - Query-param emission per (format × bleed) state matrix
 * - Disabled-while-exporting + finally-reenables contract
 * - ApiError + non-ApiError surfacing via notify.error
 */

import React from "react"
import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import PdfExportControls from "./PdfExportControls"
import {ApiError} from "../../api/client"
import {FeatureTestProvider} from "../../features/FeatureTestProvider"

/**
 * Render the controls inside the real feature registry. Defaults to
 * `api` mode where pandoc-export is active (the existing tests assume a
 * working Export-PDF button); `dexie` mode exercises the desktop-only
 * gate (picture-book/comic PDF is backend-rendered, so it disables
 * offline instead of firing `/api`).
 */
function renderControls(
    ui: React.ReactElement,
    mode: "api" | "dexie" = "api",
) {
    return render(<FeatureTestProvider mode={mode}>{ui}</FeatureTestProvider>)
}

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const mockDocumentExportDownload = vi.fn()
const mockGetApp = vi.fn()
const mockUpdateApp = vi.fn()

vi.mock("../../api/client", async () => {
    const actual = await vi.importActual<typeof import("../../api/client")>(
        "../../api/client",
    )
    return {
        ...actual,
        api: {
            documentExport: {
                download: (...args: unknown[]) =>
                    mockDocumentExportDownload(...args),
            },
            settings: {
                getApp: (...args: unknown[]) => mockGetApp(...args),
                updateApp: (...args: unknown[]) => mockUpdateApp(...args),
            },
        },
    }
})

const mockNotifyError = vi.fn()
vi.mock("../../utils/platform/notify", () => ({
    notify: {error: (...args: unknown[]) => mockNotifyError(...args)},
}))

// #497: the offline picture-book client path is dynamically imported.
const mockDownloadPicturebookPdf = vi.fn()
vi.mock("../../export/picturebook/gatherPicturebookPdf", () => ({
    downloadPicturebookPdf: (...args: unknown[]) =>
        mockDownloadPicturebookPdf(...args),
}))

beforeEach(() => {
    mockDownloadPicturebookPdf.mockReset()
    mockDownloadPicturebookPdf.mockResolvedValue(undefined)
    mockDocumentExportDownload.mockReset()
    mockDocumentExportDownload.mockResolvedValue(undefined)
    mockGetApp.mockReset()
    mockGetApp.mockResolvedValue({ui: {}})
    mockUpdateApp.mockReset()
    mockUpdateApp.mockResolvedValue({})
    mockNotifyError.mockReset()
    localStorage.clear()
})

afterEach(() => {
    localStorage.clear()
})

describe("PdfExportControls - render", () => {
    it("renders the 5 KDP picture-book formats in the dropdown", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        const values = Array.from(select.options).map((o) => o.value)
        expect(values).toEqual([
            "8.5x8.5",
            "8x10",
            "8.5x11",
            "11x8.5",
            "10x8",
        ])
    })

    it("renders the bleed-marks checkbox + Export PDF button", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        expect(await screen.findByTestId("pe-pdf-bleed-toggle")).toBeTruthy()
        expect(screen.getByTestId("pe-export-pdf")).toBeTruthy()
    })

    it("testidPrefix scopes all 3 testids to the parent surface", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="metadata" />)
        expect(
            await screen.findByTestId("metadata-pdf-format-trigger"),
        ).toBeTruthy()
        expect(screen.getByTestId("metadata-pdf-bleed-toggle")).toBeTruthy()
        expect(screen.getByTestId("metadata-export-pdf")).toBeTruthy()
    })
})

describe("PdfExportControls - workspace-default initialisation", () => {
    it("defaults to 8.5x8.5 + bleed=false when app.yaml has no picture_book", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        const toggle = screen.getByTestId(
            "pe-pdf-bleed-toggle",
        ) as HTMLInputElement
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled())
        expect(select.value).toBe("8.5x8.5")
        expect(toggle.checked).toBe(false)
    })

    it("seeds format + bleed from app.yaml when set", async () => {
        mockGetApp.mockResolvedValue({
            ui: {
                picture_book: {
                    pdf_default_format: "11x8.5",
                    pdf_default_bleed_marks: true,
                },
            },
        })
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        const toggle = screen.getByTestId(
            "pe-pdf-bleed-toggle",
        ) as HTMLInputElement
        await waitFor(() => expect(select.value).toBe("11x8.5"))
        await waitFor(() => expect(toggle.checked).toBe(true))
    })

    it("falls back to legacy localStorage format on first mount after upgrade", async () => {
        localStorage.setItem("bibliogon-picture-book-format", "8x10")
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        await waitFor(() => expect(select.value).toBe("8x10"))
    })

    it("falls back to legacy localStorage bleed on first mount after upgrade", async () => {
        localStorage.setItem(
            "bibliogon-picture-book-bleed-marks",
            "true",
        )
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const toggle = (await screen.findByTestId(
            "pe-pdf-bleed-toggle",
        )) as HTMLInputElement
        await waitFor(() => expect(toggle.checked).toBe(true))
    })

    it("unknown legacy localStorage format falls back to default", async () => {
        localStorage.setItem("bibliogon-picture-book-format", "garbage")
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled())
        expect(select.value).toBe("8.5x8.5")
    })
})

describe("PdfExportControls - one-time legacy migration", () => {
    it("pushes legacy localStorage value to app.yaml when app.yaml is empty", async () => {
        localStorage.setItem("bibliogon-picture-book-format", "8.5x11")
        localStorage.setItem("bibliogon-picture-book-bleed-marks", "true")
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        await waitFor(() => expect(mockUpdateApp).toHaveBeenCalledTimes(1))
        expect(mockUpdateApp).toHaveBeenCalledWith(
            expect.objectContaining({
                ui: expect.objectContaining({
                    picture_book: {
                        pdf_default_format: "8.5x11",
                        pdf_default_bleed_marks: true,
                    },
                }),
            }),
        )
        // Migration also clears the legacy keys.
        await waitFor(() =>
            expect(
                localStorage.getItem("bibliogon-picture-book-format"),
            ).toBeNull(),
        )
        expect(
            localStorage.getItem("bibliogon-picture-book-bleed-marks"),
        ).toBeNull()
    })

    it("does NOT push to app.yaml when app.yaml already has a value", async () => {
        mockGetApp.mockResolvedValue({
            ui: {
                picture_book: {
                    pdf_default_format: "8.5x11",
                    pdf_default_bleed_marks: false,
                },
            },
        })
        localStorage.setItem("bibliogon-picture-book-format", "8x10")
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        await waitFor(() => expect(mockGetApp).toHaveBeenCalled())
        // Give the effect a chance to NOT call updateApp.
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(mockUpdateApp).not.toHaveBeenCalled()
        // But the legacy keys still get swept since app.yaml is
        // authoritative now.
        expect(
            localStorage.getItem("bibliogon-picture-book-format"),
        ).toBeNull()
    })

    it("inline format change does NOT write to localStorage or app.yaml", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = (await screen.findByTestId(
            "pe-pdf-format-trigger",
        )) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "8x10"}})
        expect(
            localStorage.getItem("bibliogon-picture-book-format"),
        ).toBeNull()
        // updateApp should only be called by the migration path, not
        // by inline picks. The default app.yaml has no picture_book
        // AND localStorage is empty, so no migration fires either.
        expect(mockUpdateApp).not.toHaveBeenCalled()
    })

    it("inline bleed toggle does NOT write to localStorage", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const toggle = await screen.findByTestId("pe-pdf-bleed-toggle")
        fireEvent.click(toggle)
        expect(
            localStorage.getItem("bibliogon-picture-book-bleed-marks"),
        ).toBeNull()
    })
})

describe("PdfExportControls - export query-param emission", () => {
    it("default state (8.5x8.5 + bleed=false) sends empty params", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        await screen.findByTestId("pe-export-pdf")
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [bookId, fmt, params] = mockDocumentExportDownload.mock.calls[0]
        expect(bookId).toBe("b1")
        expect(fmt).toBe("pdf")
        expect(params).toBeInstanceOf(URLSearchParams)
        expect(params.toString()).toBe("")
    })

    it("non-default format alone passes picture_book_format only", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = await screen.findByTestId("pe-pdf-format-trigger")
        fireEvent.change(select, {target: {value: "8.5x11"}})
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_format")).toBe("8.5x11")
        expect(params.get("picture_book_bleed_marks")).toBeNull()
    })

    it("bleed=true alone passes picture_book_bleed_marks=true only", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const toggle = await screen.findByTestId("pe-pdf-bleed-toggle")
        fireEvent.click(toggle)
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_bleed_marks")).toBe("true")
        expect(params.get("picture_book_format")).toBeNull()
    })

    it("format + bleed both non-default pass both query params", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const select = await screen.findByTestId("pe-pdf-format-trigger")
        fireEvent.change(select, {target: {value: "11x8.5"}})
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_format")).toBe("11x8.5")
        expect(params.get("picture_book_bleed_marks")).toBe("true")
    })
})

describe("PdfExportControls - exporting state + error handling", () => {
    it("button disables while in-flight + re-enables on success", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        mockDocumentExportDownload.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        fireEvent.click(btn)
        await waitFor(() => expect(btn.disabled).toBe(true))
        resolveDownload?.(undefined)
        await waitFor(() => expect(btn.disabled).toBe(false))
    })

    it("re-click while exporting is a no-op", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        mockDocumentExportDownload.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = await screen.findByTestId("pe-export-pdf")
        fireEvent.click(btn)
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        fireEvent.click(btn)
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1)
        resolveDownload?.(undefined)
    })

    it("ApiError surfaces as notify.error with the server's detail", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new ApiError(
                500,
                "Picture-book export failed: WeasyPrint crashed",
                "/books/b1/export/pdf",
                "GET",
            ),
        )
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = await screen.findByTestId("pe-export-pdf")
        fireEvent.click(btn)
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        expect(mockNotifyError.mock.calls[0][0]).toContain(
            "Picture-book export failed",
        )
    })

    it("non-ApiError rejection still surfaces a fallback error toast", async () => {
        mockDocumentExportDownload.mockRejectedValue(new Error("Network"))
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = await screen.findByTestId("pe-export-pdf")
        fireEvent.click(btn)
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        expect(mockNotifyError.mock.calls[0][0]).toBe(
            "PDF-Export fehlgeschlagen",
        )
    })

    it("button re-enables after an error so the user can retry", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new ApiError(500, "Boom", "/books/b1/export/pdf", "GET"),
        )
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        fireEvent.click(btn)
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled())
        await waitFor(() => expect(btn.disabled).toBe(false))
    })
})

describe("PdfExportControls - compact (comic header variant)", () => {
    it("renders an icon-only Export button with aria-label + title, no visible text", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="cb" compact />)
        const btn = (await screen.findByTestId(
            "cb-export-pdf",
        )) as HTMLButtonElement
        // Icon-only utility button (matches the Fullscreen header
        // convention); the action name lives in aria-label + title.
        expect(btn.textContent ?? "").not.toContain("Export as PDF")
        expect(btn.getAttribute("aria-label")).toBe("Export as PDF")
        expect(btn.getAttribute("title")).toBe("Export as PDF")
        // Matches the other header utility buttons (global btn system).
        expect(btn.className).toContain("btn")
    })

    it("gives the format dropdown a VISIBLE label (mirrors the Layout picker)", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="cb" compact />)
        await screen.findByTestId("cb-pdf-format-trigger")
        expect(screen.getByText("PDF format")).toBeTruthy()
    })

    it("renders the bleed control via the shared Toggle, testid preserved", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="cb" compact />)
        const toggle = (await screen.findByTestId(
            "cb-pdf-bleed-toggle",
        )) as HTMLInputElement
        // Shared Toggle renders a sized, accent-themed checkbox
        // (the bare non-compact checkbox carries no width style).
        expect(toggle.getAttribute("type")).toBe("checkbox")
        expect(toggle.style.width).toBe("16px")
    })

    it("non-compact (default) still shows the visible Export button text", async () => {
        renderControls(<PdfExportControls bookId="b1" testidPrefix="pe" />)
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        expect(btn.textContent ?? "").toContain("Export as PDF")
        expect(btn.getAttribute("aria-label")).toBeNull()
    })
})

describe("PdfExportControls - offline (pandoc-export desktop-only)", () => {
    it("disables the Export-PDF button with the desktop-app reason offline", async () => {
        renderControls(
            <PdfExportControls bookId="b1" testidPrefix="pe" />,
            "dexie",
        )
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        expect(btn.getAttribute("title")).toBe(
            "This feature requires the Bibliogon desktop app",
        )
    })

    it("never fires the export /api call offline", async () => {
        renderControls(
            <PdfExportControls bookId="b1" testidPrefix="pe" />,
            "dexie",
        )
        const btn = await screen.findByTestId("pe-export-pdf")
        fireEvent.click(btn)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(mockDocumentExportDownload).not.toHaveBeenCalled()
    })
})

describe("PdfExportControls - offline picture-book client PDF (#497)", () => {
    it("ENABLES the Export-PDF button offline for a picture book", async () => {
        renderControls(
            <PdfExportControls
                bookId="b1"
                testidPrefix="pe"
                bookType="picture_book"
            />,
            "dexie",
        )
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        await waitFor(() => expect(btn.disabled).toBe(false))
        expect(btn.getAttribute("title")).toBe("Export as PDF")
    })

    it("routes a picture-book offline export through the client pdfmake path, not /api", async () => {
        renderControls(
            <PdfExportControls
                bookId="b1"
                testidPrefix="pe"
                bookType="picture_book"
            />,
            "dexie",
        )
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        await waitFor(() => expect(btn.disabled).toBe(false))
        fireEvent.click(btn)
        await waitFor(() =>
            expect(mockDownloadPicturebookPdf).toHaveBeenCalledWith(
                "b1",
                "b1",
                "8.5x8.5",
            ),
        )
        expect(mockDocumentExportDownload).not.toHaveBeenCalled()
    })

    it("keeps a non-picture-book (comic) backend-gated offline", async () => {
        renderControls(
            <PdfExportControls
                bookId="b1"
                testidPrefix="pe"
                bookType="comic_book"
            />,
            "dexie",
        )
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(mockDownloadPicturebookPdf).not.toHaveBeenCalled()
        expect(mockDocumentExportDownload).not.toHaveBeenCalled()
    })

    it("uses the BACKEND path on a backend deployment even for a picture book (regression)", async () => {
        renderControls(
            <PdfExportControls
                bookId="b1"
                testidPrefix="pe"
                bookType="picture_book"
            />,
            "api",
        )
        const btn = (await screen.findByTestId(
            "pe-export-pdf",
        )) as HTMLButtonElement
        await waitFor(() => expect(btn.disabled).toBe(false))
        fireEvent.click(btn)
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalled(),
        )
        expect(mockDownloadPicturebookPdf).not.toHaveBeenCalled()
    })
})
