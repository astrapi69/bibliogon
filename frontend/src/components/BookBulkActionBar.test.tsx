/**
 * BookBulkActionBar tests pin the threshold UI rules
 * (disabled at 0, warning at >50, error at >200) and the Export
 * button payload shape (single format, no mode argument because
 * books only support ZIP-of-individuals output).
 */

import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import BookBulkActionBar from "./BookBulkActionBar"

const t = (_k: string, fallback?: string) => fallback || _k

describe("BookBulkActionBar", () => {
    it("disables Export at count 0", () => {
        render(
            <BookBulkActionBar
                count={0}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        const btn = screen.getByTestId("book-bulk-export") as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })

    it("shows soft warning when count > 50", () => {
        render(
            <BookBulkActionBar
                count={51}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        expect(screen.getByTestId("book-bulk-warning")).toBeTruthy()
        expect(screen.queryByTestId("book-bulk-error")).toBeNull()
    })

    it("shows hard error and disables Export when count > 200", () => {
        render(
            <BookBulkActionBar
                count={201}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        expect(screen.getByTestId("book-bulk-error")).toBeTruthy()
        const btn = screen.getByTestId("book-bulk-export") as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })

    it("Export button passes selected format (no mode argument)", () => {
        const spy = vi.fn()
        render(
            <BookBulkActionBar
                count={3}
                onExport={spy}
                onClear={() => {}}
                t={t}
            />,
        )
        fireEvent.change(screen.getByTestId("book-bulk-format-trigger"), {
            target: {value: "pdf"},
        })
        fireEvent.click(screen.getByTestId("book-bulk-export"))
        expect(spy).toHaveBeenCalledWith("pdf")
    })

    it("Clear button fires onClear", () => {
        const spy = vi.fn()
        render(
            <BookBulkActionBar
                count={2}
                onExport={() => {}}
                onClear={spy}
                t={t}
            />,
        )
        fireEvent.click(screen.getByTestId("book-bulk-clear"))
        expect(spy).toHaveBeenCalled()
    })
})

// --- UNIVERSAL-AI-TEMPLATE-02 Session 2 commit 6: AI dropdown ---

describe("BookBulkActionBar AI dropdown", () => {
    it("does NOT render the AI dropdown when handlers are absent", () => {
        render(
            <BookBulkActionBar
                count={3}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        expect(screen.queryByTestId("book-bulk-ai-menu")).toBeNull()
    })

    it("renders the AI dropdown when both AI handlers are passed", () => {
        render(
            <BookBulkActionBar
                count={3}
                onExport={() => {}}
                onClear={() => {}}
                onBulkAiTemplateExport={() => {}}
                onBulkAiTemplateImport={() => {}}
                t={t}
            />,
        )
        expect(screen.getByTestId("book-bulk-ai-menu")).toBeTruthy()
    })

    it("disables the AI dropdown over the 50-book cap", () => {
        render(
            <BookBulkActionBar
                count={51}
                onExport={() => {}}
                onClear={() => {}}
                onBulkAiTemplateExport={() => {}}
                onBulkAiTemplateImport={() => {}}
                t={t}
            />,
        )
        const trigger = screen.getByTestId("book-bulk-ai-menu") as HTMLButtonElement
        expect(trigger.disabled).toBe(true)
    })

    it("AI dropdown trigger is enabled within the cap so onSelect handlers can fire", () => {
        // Radix DropdownMenu portals its items behind a pointer-
        // event open gesture that happy-dom + plain fireEvent
        // does not reproduce. The Playwright smoke spec covers
        // the actual menu open + click; here we pin the prop-
        // threading contract.
        const exportSpy = vi.fn()
        const importSpy = vi.fn()
        render(
            <BookBulkActionBar
                count={3}
                onExport={() => {}}
                onClear={() => {}}
                onBulkAiTemplateExport={exportSpy}
                onBulkAiTemplateImport={importSpy}
                t={t}
            />,
        )
        const trigger = screen.getByTestId("book-bulk-ai-menu") as HTMLButtonElement
        expect(trigger.disabled).toBe(false)
        expect(exportSpy).not.toHaveBeenCalled()
        expect(importSpy).not.toHaveBeenCalled()
    })
})
