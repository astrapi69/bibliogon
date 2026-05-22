/**
 * Tests for PageThumbnails (PB-PHASE4 Session 3 Commit 3).
 *
 * Structural-only coverage per the "Radix DropdownMenu + happy-dom
 * is brittle for Vitest" lessons-learned rule (the same brittleness
 * applies to @dnd-kit drag simulation). Actual drag-reorder is
 * exercised in the Commit 8 Playwright E2E spec; here we pin the
 * presence + namespace of the testids the spec drives.
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"

import PageThumbnails from "./PageThumbnails"
import type {Page} from "../api/client"

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as unknown as {ResizeObserver: typeof ResizeObserverStub}).ResizeObserver =
    ResizeObserverStub

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

function makePage(overrides: Partial<Page> = {}): Page {
    return {
        id: "p1",
        book_id: "b1",
        position: 1,
        layout: "image_top_text_bottom",
        text_content: null,
        image_asset_id: null,
        layout_config: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    }
}

describe("PageThumbnails", () => {
    it("renders the empty-state when there are no pages", () => {
        render(
            <PageThumbnails
                pages={[]}
                activePageId={null}
                onSelect={vi.fn()}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-editor-thumbnails-empty")).toBeTruthy()
        expect(screen.queryByTestId("page-editor-page-list")).toBeNull()
    })

    it("renders one row per page with the namespaced testid", () => {
        const pages = [
            makePage({id: "p1", position: 1}),
            makePage({id: "p2", position: 2, layout: "speech_bubble"}),
            makePage({id: "p3", position: 3, layout: "text_only"}),
        ]
        render(
            <PageThumbnails
                pages={pages}
                activePageId={null}
                onSelect={vi.fn()}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-editor-page-list")).toBeTruthy()
        expect(screen.getByTestId("page-editor-page-row-p1")).toBeTruthy()
        expect(screen.getByTestId("page-editor-page-row-p2")).toBeTruthy()
        expect(screen.getByTestId("page-editor-page-row-p3")).toBeTruthy()
    })

    it("marks the active page row with data-active='true' and inactive with 'false'", () => {
        const pages = [makePage({id: "p1"}), makePage({id: "p2"})]
        render(
            <PageThumbnails
                pages={pages}
                activePageId="p2"
                onSelect={vi.fn()}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId("page-editor-page-row-p2").getAttribute("data-active"),
        ).toBe("true")
        expect(
            screen.getByTestId("page-editor-page-row-p1").getAttribute("data-active"),
        ).toBe("false")
    })

    it("exposes position + layout as data-attributes for E2E targeting", () => {
        const pages = [makePage({id: "p1", position: 1, layout: "speech_bubble"})]
        render(
            <PageThumbnails
                pages={pages}
                activePageId={null}
                onSelect={vi.fn()}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        const row = screen.getByTestId("page-editor-page-row-p1")
        expect(row.getAttribute("data-position")).toBe("1")
        expect(row.getAttribute("data-layout")).toBe("speech_bubble")
    })

    it("renders a drag handle with the namespaced testid for each page", () => {
        const pages = [makePage({id: "p1"}), makePage({id: "p2"})]
        render(
            <PageThumbnails
                pages={pages}
                activePageId={null}
                onSelect={vi.fn()}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        expect(screen.getByTestId("page-editor-drag-handle-p1")).toBeTruthy()
        expect(screen.getByTestId("page-editor-drag-handle-p2")).toBeTruthy()
    })

    it("invokes onSelect with the page id when a row is clicked", () => {
        const onSelect = vi.fn()
        const pages = [makePage({id: "p1"}), makePage({id: "p2"})]
        render(
            <PageThumbnails
                pages={pages}
                activePageId={null}
                onSelect={onSelect}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("page-editor-page-row-p2"))
        expect(onSelect).toHaveBeenCalledWith("p2")
    })

    it("invokes onSelect when Enter is pressed on a focused row (keyboard-accessible)", () => {
        const onSelect = vi.fn()
        const pages = [makePage({id: "p1"})]
        render(
            <PageThumbnails
                pages={pages}
                activePageId={null}
                onSelect={onSelect}
                onAddPage={vi.fn()}
                onReorder={vi.fn()}
            />,
        )
        const row = screen.getByTestId("page-editor-page-row-p1")
        fireEvent.keyDown(row, {key: "Enter"})
        expect(onSelect).toHaveBeenCalledWith("p1")
    })

    it("invokes onAddPage when the + button is clicked", () => {
        const onAddPage = vi.fn()
        render(
            <PageThumbnails
                pages={[]}
                activePageId={null}
                onSelect={vi.fn()}
                onAddPage={onAddPage}
                onReorder={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId("page-editor-add-page"))
        expect(onAddPage).toHaveBeenCalledTimes(1)
    })

    describe("delete affordance (PAGES-DELETE-EDITOR-UI-01)", () => {
        it("omits the delete button when onDelete is undefined", () => {
            const pages = [makePage({id: "p1"})]
            render(
                <PageThumbnails
                    pages={pages}
                    activePageId={null}
                    onSelect={vi.fn()}
                    onAddPage={vi.fn()}
                    onReorder={vi.fn()}
                />,
            )
            expect(
                screen.queryByTestId("page-editor-delete-page-p1"),
            ).toBeNull()
        })

        it("renders a delete button per row when onDelete is provided", () => {
            const pages = [
                makePage({id: "p1"}),
                makePage({id: "p2"}),
                makePage({id: "p3"}),
            ]
            render(
                <PageThumbnails
                    pages={pages}
                    activePageId={null}
                    onSelect={vi.fn()}
                    onAddPage={vi.fn()}
                    onReorder={vi.fn()}
                    onDelete={vi.fn()}
                />,
            )
            expect(screen.getByTestId("page-editor-delete-page-p1")).toBeTruthy()
            expect(screen.getByTestId("page-editor-delete-page-p2")).toBeTruthy()
            expect(screen.getByTestId("page-editor-delete-page-p3")).toBeTruthy()
        })

        it("invokes onDelete with the page id when the delete button is clicked", () => {
            const onDelete = vi.fn()
            const pages = [makePage({id: "p1"}), makePage({id: "p2"})]
            render(
                <PageThumbnails
                    pages={pages}
                    activePageId={null}
                    onSelect={vi.fn()}
                    onAddPage={vi.fn()}
                    onReorder={vi.fn()}
                    onDelete={onDelete}
                />,
            )
            fireEvent.click(screen.getByTestId("page-editor-delete-page-p2"))
            expect(onDelete).toHaveBeenCalledWith("p2")
            expect(onDelete).toHaveBeenCalledTimes(1)
        })

        it("delete button click does not trigger onSelect (stopPropagation)", () => {
            const onSelect = vi.fn()
            const onDelete = vi.fn()
            const pages = [makePage({id: "p1"})]
            render(
                <PageThumbnails
                    pages={pages}
                    activePageId={null}
                    onSelect={onSelect}
                    onAddPage={vi.fn()}
                    onReorder={vi.fn()}
                    onDelete={onDelete}
                />,
            )
            fireEvent.click(screen.getByTestId("page-editor-delete-page-p1"))
            expect(onDelete).toHaveBeenCalledTimes(1)
            expect(onSelect).not.toHaveBeenCalled()
        })

        it("uses the testidNamespace prefix for delete-button testids", () => {
            const pages = [makePage({id: "p1"})]
            render(
                <PageThumbnails
                    pages={pages}
                    activePageId={null}
                    onSelect={vi.fn()}
                    onAddPage={vi.fn()}
                    onReorder={vi.fn()}
                    onDelete={vi.fn()}
                    testidNamespace="comic-book-editor"
                />,
            )
            expect(
                screen.getByTestId("comic-book-editor-delete-page-p1"),
            ).toBeTruthy()
            expect(
                screen.queryByTestId("page-editor-delete-page-p1"),
            ).toBeNull()
        })
    })
})
