/**
 * Tests for PictureBookPdfExportControls (PDF-BLEED-MARKS-01 C2
 * shared component).
 *
 * The component is the canonical extraction site per the
 * Recurring-Component-Unification Rule: mounted in PageEditor's
 * header AND BookMetadataEditor's Design tab, closing the
 * PDF-KDP-FORMATS-01 half-wired surface as a side-effect. The
 * existing PageEditor.test.tsx + BookMetadataEditor.test.tsx
 * already integration-test the mount-and-export-button-fires
 * contract at each parent surface. This file unit-tests the
 * component's behavior in isolation:
 *
 * - 5 format options rendered (parity with PICTURE_BOOK_FORMATS)
 * - localStorage initialization + persistence for both format +
 *   bleed
 * - Defensive fallback on missing / unknown / privacy-mode reads
 * - Query-param emission per (format × bleed) state matrix
 * - Disabled-while-exporting + finally-reenables contract
 * - ApiError + non-ApiError surfacing via notify.error
 */

import React from "react"
import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, fireEvent, waitFor} from "@testing-library/react"

import PictureBookPdfExportControls from "./PictureBookPdfExportControls"
import {ApiError} from "./../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const mockDocumentExportDownload = vi.fn()
vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    )
    return {
        ...actual,
        api: {
            documentExport: {
                download: (...args: unknown[]) =>
                    mockDocumentExportDownload(...args),
            },
        },
    }
})

const mockNotifyError = vi.fn()
vi.mock("../utils/notify", () => ({
    notify: {error: (...args: unknown[]) => mockNotifyError(...args)},
}))

beforeEach(() => {
    mockDocumentExportDownload.mockReset()
    mockDocumentExportDownload.mockResolvedValue(undefined)
    mockNotifyError.mockReset()
    localStorage.clear()
})

afterEach(() => {
    localStorage.clear()
})

describe("PictureBookPdfExportControls - render", () => {
    it("renders the 5 KDP picture-book formats in the dropdown", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId(
            "pe-pdf-format-select",
        ) as HTMLSelectElement
        const values = Array.from(select.options).map((o) => o.value)
        expect(values).toEqual([
            "8.5x8.5",
            "8x10",
            "8.5x11",
            "11x8.5",
            "10x8",
        ])
    })

    it("renders the bleed-marks checkbox + Export PDF button", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        expect(screen.getByTestId("pe-pdf-bleed-toggle")).toBeTruthy()
        expect(screen.getByTestId("pe-export-pdf")).toBeTruthy()
    })

    it("testidPrefix scopes all 3 testids to the parent surface", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="metadata" />,
        )
        expect(screen.getByTestId("metadata-pdf-format-select")).toBeTruthy()
        expect(screen.getByTestId("metadata-pdf-bleed-toggle")).toBeTruthy()
        expect(screen.getByTestId("metadata-export-pdf")).toBeTruthy()
    })
})

describe("PictureBookPdfExportControls - localStorage initialisation", () => {
    it("defaults to 8.5x8.5 + bleed=false when localStorage is empty", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId(
            "pe-pdf-format-select",
        ) as HTMLSelectElement
        const toggle = screen.getByTestId(
            "pe-pdf-bleed-toggle",
        ) as HTMLInputElement
        expect(select.value).toBe("8.5x8.5")
        expect(toggle.checked).toBe(false)
    })

    it("reads persisted bibliogon-picture-book-format on mount", () => {
        localStorage.setItem("bibliogon-picture-book-format", "11x8.5")
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId(
            "pe-pdf-format-select",
        ) as HTMLSelectElement
        expect(select.value).toBe("11x8.5")
    })

    it("reads persisted bibliogon-picture-book-bleed-marks=true on mount", () => {
        localStorage.setItem(
            "bibliogon-picture-book-bleed-marks",
            "true",
        )
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const toggle = screen.getByTestId(
            "pe-pdf-bleed-toggle",
        ) as HTMLInputElement
        expect(toggle.checked).toBe(true)
    })

    it("unknown localStorage values fall back to defaults", () => {
        localStorage.setItem("bibliogon-picture-book-format", "garbage")
        localStorage.setItem(
            "bibliogon-picture-book-bleed-marks",
            "garbage",
        )
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId(
            "pe-pdf-format-select",
        ) as HTMLSelectElement
        const toggle = screen.getByTestId(
            "pe-pdf-bleed-toggle",
        ) as HTMLInputElement
        expect(select.value).toBe("8.5x8.5")
        expect(toggle.checked).toBe(false)
    })
})

describe("PictureBookPdfExportControls - localStorage persistence", () => {
    it("format change writes to localStorage", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId(
            "pe-pdf-format-select",
        ) as HTMLSelectElement
        fireEvent.change(select, {target: {value: "8x10"}})
        expect(localStorage.getItem("bibliogon-picture-book-format")).toBe(
            "8x10",
        )
    })

    it("bleed toggle writes to localStorage", () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        expect(
            localStorage.getItem("bibliogon-picture-book-bleed-marks"),
        ).toBe("true")
    })

    it("bleed toggle off writes 'false' (not removed)", () => {
        localStorage.setItem(
            "bibliogon-picture-book-bleed-marks",
            "true",
        )
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        expect(
            localStorage.getItem("bibliogon-picture-book-bleed-marks"),
        ).toBe("false")
    })
})

describe("PictureBookPdfExportControls - export query-param emission", () => {
    it("default state (8.5x8.5 + bleed=false) sends empty params", async () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
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
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.change(screen.getByTestId("pe-pdf-format-select"), {
            target: {value: "8.5x11"},
        })
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_format")).toBe("8.5x11")
        expect(params.get("picture_book_bleed_marks")).toBeNull()
    })

    it("bleed=true alone passes picture_book_bleed_marks=true only", async () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_bleed_marks")).toBe("true")
        expect(params.get("picture_book_format")).toBeNull()
    })

    it("format + bleed both non-default pass both query params", async () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.change(screen.getByTestId("pe-pdf-format-select"), {
            target: {value: "11x8.5"},
        })
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.get("picture_book_format")).toBe("11x8.5")
        expect(params.get("picture_book_bleed_marks")).toBe("true")
    })

    it("switching back to default 8.5x8.5 + bleed=false returns to empty params", async () => {
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const select = screen.getByTestId("pe-pdf-format-select")
        fireEvent.change(select, {target: {value: "8x10"}})
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        // Flip both back to defaults.
        fireEvent.change(select, {target: {value: "8.5x8.5"}})
        fireEvent.click(screen.getByTestId("pe-pdf-bleed-toggle"))
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() =>
            expect(mockDocumentExportDownload).toHaveBeenCalledTimes(1),
        )
        const [, , params] = mockDocumentExportDownload.mock.calls[0]
        expect(params.toString()).toBe("")
    })
})

describe("PictureBookPdfExportControls - exporting state + error handling", () => {
    it("button disables while in-flight + re-enables on success", async () => {
        let resolveDownload: ((value: undefined) => void) | undefined
        mockDocumentExportDownload.mockReturnValue(
            new Promise<undefined>((resolve) => {
                resolveDownload = resolve
            }),
        )
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const btn = screen.getByTestId("pe-export-pdf") as HTMLButtonElement
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
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const btn = screen.getByTestId("pe-export-pdf")
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
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        expect(mockNotifyError.mock.calls[0][0]).toContain(
            "Picture-book export failed",
        )
    })

    it("non-ApiError rejection still surfaces a fallback error toast", async () => {
        mockDocumentExportDownload.mockRejectedValue(new Error("Network"))
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        fireEvent.click(screen.getByTestId("pe-export-pdf"))
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalledTimes(1))
        expect(mockNotifyError.mock.calls[0][0]).toBe(
            "PDF-Export fehlgeschlagen",
        )
    })

    it("button re-enables after an error so the user can retry", async () => {
        mockDocumentExportDownload.mockRejectedValue(
            new ApiError(500, "Boom", "/books/b1/export/pdf", "GET"),
        )
        render(
            <PictureBookPdfExportControls bookId="b1" testidPrefix="pe" />,
        )
        const btn = screen.getByTestId("pe-export-pdf") as HTMLButtonElement
        fireEvent.click(btn)
        await waitFor(() => expect(mockNotifyError).toHaveBeenCalled())
        await waitFor(() => expect(btn.disabled).toBe(false))
    })
})
