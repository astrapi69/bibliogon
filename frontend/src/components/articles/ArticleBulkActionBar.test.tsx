/**
 * ArticleBulkActionBar tests pin the threshold UI rules
 * (disabled at 0, warning at >50, error at >200) and the
 * Export button payload (current format + mode).
 */

import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import ArticleBulkActionBar from "./ArticleBulkActionBar"

const t = (_k: string, fallback?: string) => fallback || _k

describe("ArticleBulkActionBar", () => {
    it("disables Export at count 0", () => {
        render(
            <ArticleBulkActionBar
                count={0}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        const btn = screen.getByTestId("article-bulk-export") as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })

    it("shows soft warning when count > 50", () => {
        render(
            <ArticleBulkActionBar
                count={51}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        expect(screen.getByTestId("article-bulk-warning")).toBeTruthy()
        expect(screen.queryByTestId("article-bulk-error")).toBeNull()
    })

    it("shows hard error and disables Export when count > 200", () => {
        render(
            <ArticleBulkActionBar
                count={201}
                onExport={() => {}}
                onClear={() => {}}
                t={t}
            />,
        )
        expect(screen.getByTestId("article-bulk-error")).toBeTruthy()
        const btn = screen.getByTestId("article-bulk-export") as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })

    it("Export button passes selected format and mode", () => {
        const spy = vi.fn()
        render(
            <ArticleBulkActionBar
                count={3}
                onExport={spy}
                onClear={() => {}}
                t={t}
            />,
        )
        // Switch to combined + pdf, then click Export.
        fireEvent.click(screen.getByTestId("article-bulk-mode-combined"))
        fireEvent.change(screen.getByTestId("article-bulk-format"), {
            target: {value: "pdf"},
        })
        fireEvent.click(screen.getByTestId("article-bulk-export"))
        expect(spy).toHaveBeenCalledWith("pdf", "combined")
    })

    it("Clear button fires onClear", () => {
        const spy = vi.fn()
        render(
            <ArticleBulkActionBar
                count={2}
                onExport={() => {}}
                onClear={spy}
                t={t}
            />,
        )
        fireEvent.click(screen.getByTestId("article-bulk-clear"))
        expect(spy).toHaveBeenCalled()
    })
})
