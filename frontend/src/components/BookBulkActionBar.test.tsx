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
        fireEvent.change(screen.getByTestId("book-bulk-format"), {
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
