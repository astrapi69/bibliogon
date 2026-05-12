import {describe, it, expect, vi} from "vitest"
import {render, screen, act} from "@testing-library/react"
import BulkAiFillDock from "./BulkAiFillDock"
import {
    BulkAiFillJobProvider,
    useBulkAiFillJob,
} from "../contexts/BulkAiFillJobContext"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 7/10. Smoke
// tests for the dock + expanded-modal consumer. Heavy
// state-transition coverage lives in the context test;
// here we pin the surface contracts: hidden when no job,
// dock badge visible when minimized, modal visible when
// expanded, percent + item rows render from context state.

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

vi.mock("../api/client", () => ({
    api: {
        articles: {bulkAiFill: {streamUrl: (j: string) => `/a/${j}`}},
        books: {bulkAiFill: {streamUrl: (j: string) => `/b/${j}`}},
    },
}))

class FakeEventSource {
    url: string
    onmessage: ((e: MessageEvent) => void) | null = null
    onopen: ((e: Event) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    closed = false
    constructor(url: string) {
        this.url = url
        ;(globalThis as unknown as {__lastES: FakeEventSource}).__lastES = this
        queueMicrotask(() => this.onopen?.(new Event("open")))
    }
    fire(data: object) {
        this.onmessage?.({data: JSON.stringify(data)} as MessageEvent)
    }
    close() {
        this.closed = true
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = FakeEventSource

function lastES(): FakeEventSource {
    return (globalThis as unknown as {__lastES: FakeEventSource}).__lastES
}

function Starter({onStart}: {onStart?: (s: ReturnType<typeof useBulkAiFillJob>["start"]) => void}) {
    const ctx = useBulkAiFillJob()
    if (onStart) onStart(ctx.start)
    return null
}

function renderDock() {
    let startFn:
        | ReturnType<typeof useBulkAiFillJob>["start"]
        | null = null
    const tree = render(
        <BulkAiFillJobProvider>
            <Starter onStart={(s) => (startFn = s)}/>
            <BulkAiFillDock/>
        </BulkAiFillJobProvider>,
    )
    return {tree, start: () => startFn!}
}

describe("BulkAiFillDock", () => {
    it("renders nothing when no job is active", () => {
        renderDock()
        expect(screen.queryByTestId("bulk-ai-fill-dock")).toBeNull()
        expect(screen.queryByTestId("bulk-ai-fill-modal")).toBeNull()
    })

    it("renders the expanded modal when start() opens it", () => {
        const {start} = renderDock()
        act(() => start()("j1", "article"))
        expect(screen.getByTestId("bulk-ai-fill-modal")).toBeTruthy()
        // Dock badge is hidden while modal is open.
        expect(screen.queryByTestId("bulk-ai-fill-dock")).toBeNull()
    })

    it("modal shows totals and item rows as events arrive", () => {
        const {start} = renderDock()
        act(() => start()("j1", "article"))
        act(() =>
            lastES().fire({
                type: "start",
                data: {total: 2, field_classes: ["seo"], rate_limit_seconds: 0},
            }),
        )
        act(() =>
            lastES().fire({
                type: "item_start",
                data: {id: "a1", index: 0, title: "Alpha"},
            }),
        )
        act(() =>
            lastES().fire({
                type: "item_done",
                data: {
                    id: "a1",
                    index: 0,
                    updated_fields: ["seo_title"],
                    skipped_fields: [],
                    tokens: 100,
                    cost_usd: 0.005,
                    field_class_errors: {},
                },
            }),
        )
        expect(screen.getByTestId("bulk-ai-fill-modal-totals")).toBeTruthy()
        const itemRow = screen.getByTestId("bulk-ai-fill-item-a1")
        expect(itemRow.getAttribute("data-status")).toBe("done")
    })

    it("dismiss button (terminal phase) clears the job", () => {
        const {start} = renderDock()
        act(() => start()("j1", "article"))
        act(() =>
            lastES().fire({
                type: "stream_end",
                data: {status: "completed", error: null},
            }),
        )
        const dismiss = screen.getByTestId(
            "bulk-ai-fill-modal-dismiss",
        ) as HTMLButtonElement
        act(() => dismiss.click())
        expect(screen.queryByTestId("bulk-ai-fill-modal")).toBeNull()
        expect(screen.queryByTestId("bulk-ai-fill-dock")).toBeNull()
    })

    it("minimize swaps to the dock badge", () => {
        const {start} = renderDock()
        act(() => start()("j1", "article"))
        const minimize = screen.getByTestId(
            "bulk-ai-fill-modal-minimize",
        ) as HTMLButtonElement
        act(() => minimize.click())
        expect(screen.queryByTestId("bulk-ai-fill-modal")).toBeNull()
        expect(screen.getByTestId("bulk-ai-fill-dock")).toBeTruthy()
    })

    it("modal renders error banner on failed phase", () => {
        const {start} = renderDock()
        act(() => start()("j1", "article"))
        act(() =>
            lastES().fire({
                type: "stream_end",
                data: {status: "failed", error: "Worker crashed"},
            }),
        )
        const banner = screen.getByTestId("bulk-ai-fill-modal-error")
        expect(banner.textContent).toContain("Worker crashed")
    })
})
