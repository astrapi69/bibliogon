/**
 * Tests for PageEditor (PB-PHASE4 Session 3 Commit 2).
 *
 * Covers the scaffold: three-pane layout shell, back button,
 * book-title + data-book-id attribute, testid namespace.
 * Later commits add functional tests as children mount.
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import PageEditor from "./PageEditor"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

describe("PageEditor scaffold", () => {
    const onBack = vi.fn()

    it("renders the root and exposes data-book-id", () => {
        render(
            <PageEditor bookId="b1" bookTitle="My Picture Book" onBack={onBack} />,
        )
        const root = screen.getByTestId("page-editor-root")
        expect(root).toBeTruthy()
        expect(root.getAttribute("data-book-id")).toBe("b1")
    })

    it("renders the book title in the header", () => {
        render(
            <PageEditor bookId="b1" bookTitle="My Picture Book" onBack={onBack} />,
        )
        expect(screen.getByText("My Picture Book")).toBeTruthy()
    })

    it("renders all three panes (thumbnails / canvas / properties)", () => {
        render(
            <PageEditor bookId="b1" bookTitle="My Picture Book" onBack={onBack} />,
        )
        expect(screen.getByTestId("page-editor-thumbnails")).toBeTruthy()
        expect(screen.getByTestId("page-editor-canvas")).toBeTruthy()
        expect(screen.getByTestId("page-editor-properties")).toBeTruthy()
    })

    it("invokes onBack when the back button is clicked", () => {
        const onBackLocal = vi.fn()
        render(
            <PageEditor
                bookId="b1"
                bookTitle="My Picture Book"
                onBack={onBackLocal}
            />,
        )
        fireEvent.click(screen.getByTestId("page-editor-back"))
        expect(onBackLocal).toHaveBeenCalledTimes(1)
    })
})
