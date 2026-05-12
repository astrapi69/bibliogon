import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {render, screen, act} from "@testing-library/react"
import {
    BulkAiFillJobProvider,
    useBulkAiFillJob,
    BULK_AI_FILL_STORAGE_KEY,
} from "./BulkAiFillJobContext"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 7/10. Pins the
// bulk-fill job context contract:
//
// - start() opens an EventSource against the per-kind URL
// - SSE events update derived state (total, completed,
//   itemsUpdated, totalTokens, totalCostUsd, items)
// - stream_end transitions to completed/failed/cancelled +
//   closes the stream + clears persistence
// - F5 recovery: a persisted entry triggers an EventSource
//   reconnect on mount with the modal minimized

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

// Mock the api client's streamUrl helpers so we can inspect
// the URL the EventSource subscribes to.
vi.mock("../api/client", () => ({
    api: {
        articles: {
            bulkAiFill: {
                streamUrl: (jobId: string) =>
                    `/api/articles/bulk-ai-fill/jobs/${jobId}/stream`,
            },
        },
        books: {
            bulkAiFill: {
                streamUrl: (jobId: string) =>
                    `/api/books/bulk-ai-fill/jobs/${jobId}/stream`,
            },
        },
    },
}))

// EventSource stub: records the URL the SSE listener
// subscribes to and exposes a `fireEvent` helper so each
// test can drive the SSE message loop.
let lastEventSource: FakeEventSource | null = null

class FakeEventSource {
    url: string
    readyState = 0
    onopen: ((e: Event) => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    closed = false

    constructor(url: string) {
        this.url = url
        lastEventSource = this
        // Fire open in a microtask so the listener attaches first.
        queueMicrotask(() => {
            this.readyState = 1
            this.onopen?.(new Event("open"))
        })
    }

    fireEvent(data: object) {
        this.onmessage?.({data: JSON.stringify(data)} as MessageEvent)
    }

    close() {
        this.closed = true
        this.readyState = 2
    }
}

beforeEach(() => {
    lastEventSource = null
    localStorage.removeItem(BULK_AI_FILL_STORAGE_KEY)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).EventSource = FakeEventSource
})

afterEach(() => {
    lastEventSource = null
})

// Test harness: a tiny component that exposes the context.
function Harness({onCtx}: {onCtx: (ctx: ReturnType<typeof useBulkAiFillJob>) => void}) {
    const ctx = useBulkAiFillJob()
    onCtx(ctx)
    return <div data-testid="harness">{ctx.phase}</div>
}

function renderWithProvider() {
    let captured: ReturnType<typeof useBulkAiFillJob> | null = null
    render(
        <BulkAiFillJobProvider>
            <Harness onCtx={(c) => (captured = c)}/>
        </BulkAiFillJobProvider>,
    )
    const get = () => captured!
    return {get}
}

describe("BulkAiFillJobProvider", () => {
    it("starts idle with no active job", () => {
        const {get} = renderWithProvider()
        expect(get().active).toBe(false)
        expect(get().phase).toBe("idle")
        expect(get().total).toBe(0)
    })

    it("start() opens the per-kind SSE URL and persists the job", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("job123", "article")
        })
        expect(get().active).toBe(true)
        expect(get().jobId).toBe("job123")
        expect(get().kind).toBe("article")
        expect(get().modalOpen).toBe(true)
        expect(lastEventSource?.url).toBe(
            "/api/articles/bulk-ai-fill/jobs/job123/stream",
        )
        const persisted = JSON.parse(
            localStorage.getItem(BULK_AI_FILL_STORAGE_KEY) || "{}",
        )
        expect(persisted.jobId).toBe("job123")
        expect(persisted.kind).toBe("article")
    })

    it("book kind routes to the books stream URL", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("job456", "book")
        })
        expect(lastEventSource?.url).toBe(
            "/api/books/bulk-ai-fill/jobs/job456/stream",
        )
    })

    it("start -> item_done -> done updates totals and items", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("j1", "article")
        })

        act(() => {
            lastEventSource?.fireEvent({
                type: "start",
                data: {total: 2, field_classes: ["seo"], rate_limit_seconds: 0},
            })
        })
        expect(get().total).toBe(2)
        expect(get().phase).toBe("running")

        act(() => {
            lastEventSource?.fireEvent({
                type: "item_start",
                data: {id: "a1", index: 0, title: "Alpha"},
            })
        })
        expect(get().currentTitle).toBe("Alpha")
        expect(get().items).toHaveLength(1)
        expect(get().items[0].status).toBe("running")

        act(() => {
            lastEventSource?.fireEvent({
                type: "item_done",
                data: {
                    id: "a1",
                    index: 0,
                    updated_fields: ["seo_title"],
                    skipped_fields: [],
                    tokens: 120,
                    cost_usd: 0.005,
                    field_class_errors: {},
                },
            })
        })
        expect(get().completed).toBe(1)
        expect(get().itemsUpdated).toBe(1)
        expect(get().totalTokens).toBe(120)
        expect(get().totalCostUsd).toBeCloseTo(0.005)
        expect(get().items[0].status).toBe("done")

        act(() => {
            lastEventSource?.fireEvent({
                type: "done",
                data: {
                    total_items: 2,
                    items_updated: 1,
                    total_tokens: 120,
                    total_cost_usd: 0.005,
                },
            })
        })

        act(() => {
            lastEventSource?.fireEvent({
                type: "stream_end",
                data: {status: "completed", error: null},
            })
        })
        expect(get().phase).toBe("completed")
        // Persistence cleared on terminal status.
        expect(localStorage.getItem(BULK_AI_FILL_STORAGE_KEY)).toBeNull()
        // EventSource closed.
        expect(lastEventSource?.closed).toBe(true)
    })

    it("item_skipped + item_error update items without bumping itemsUpdated", () => {
        const {get} = renderWithProvider()
        act(() => get().start("j2", "article"))
        act(() =>
            lastEventSource?.fireEvent({
                type: "start",
                data: {total: 2, field_classes: ["seo"], rate_limit_seconds: 0},
            }),
        )
        act(() =>
            lastEventSource?.fireEvent({
                type: "item_skipped",
                data: {id: "a1", index: 0, reason: "no-content"},
            }),
        )
        act(() =>
            lastEventSource?.fireEvent({
                type: "item_error",
                data: {id: "a2", index: 1, error: "Outage"},
            }),
        )
        expect(get().completed).toBe(2)
        expect(get().itemsUpdated).toBe(0)
        const items = get().items
        expect(items.find((i) => i.id === "a1")?.status).toBe("skipped")
        expect(items.find((i) => i.id === "a2")?.status).toBe("error")
        expect(items.find((i) => i.id === "a2")?.error).toBe("Outage")
    })

    it("stream_end with status=failed sets phase=failed and surfaces error", () => {
        const {get} = renderWithProvider()
        act(() => get().start("j3", "article"))
        act(() =>
            lastEventSource?.fireEvent({
                type: "stream_end",
                data: {status: "failed", error: "Job crashed"},
            }),
        )
        expect(get().phase).toBe("failed")
        expect(get().errorMessage).toBe("Job crashed")
    })

    it("minimize / expand toggle modalOpen", () => {
        const {get} = renderWithProvider()
        act(() => get().start("j4", "article"))
        expect(get().modalOpen).toBe(true)
        act(() => get().minimize())
        expect(get().modalOpen).toBe(false)
        act(() => get().expand())
        expect(get().modalOpen).toBe(true)
    })

    it("clear() closes the stream, clears persistence, resets to idle", () => {
        const {get} = renderWithProvider()
        act(() => get().start("j5", "article"))
        const es = lastEventSource
        act(() => get().clear())
        expect(get().active).toBe(false)
        expect(get().phase).toBe("idle")
        expect(es?.closed).toBe(true)
        expect(localStorage.getItem(BULK_AI_FILL_STORAGE_KEY)).toBeNull()
    })

    it("F5 recovery: persisted job reconnects with modal minimized", () => {
        localStorage.setItem(
            BULK_AI_FILL_STORAGE_KEY,
            JSON.stringify({jobId: "persisted-job", kind: "book"}),
        )
        const {get} = renderWithProvider()
        expect(get().active).toBe(true)
        expect(get().jobId).toBe("persisted-job")
        expect(get().kind).toBe("book")
        expect(get().modalOpen).toBe(false)  // do not pop dialog after F5
        expect(lastEventSource?.url).toBe(
            "/api/books/bulk-ai-fill/jobs/persisted-job/stream",
        )
    })

    it("malformed persisted entry is ignored (no crash, no reconnect)", () => {
        localStorage.setItem(
            BULK_AI_FILL_STORAGE_KEY,
            JSON.stringify({jobId: "x", kind: "podcast"}),  // unknown kind
        )
        const {get} = renderWithProvider()
        expect(get().active).toBe(false)
        expect(lastEventSource).toBeNull()
    })

    it("item_done with null cost_usd does not set totalCostUsd", () => {
        const {get} = renderWithProvider()
        act(() => get().start("j6", "article"))
        act(() =>
            lastEventSource?.fireEvent({
                type: "item_done",
                data: {
                    id: "a1",
                    index: 0,
                    updated_fields: [],
                    skipped_fields: [],
                    tokens: 50,
                    cost_usd: null,
                    field_class_errors: {},
                },
            }),
        )
        expect(get().totalCostUsd).toBeNull()
        expect(get().totalTokens).toBe(50)
    })

    // BULK-AI-FILL-LIVE-COST-01: live cost projection during a
    // running job. The dock + modal consume costPerItemUsd
    // (running average per priced item) and
    // projectedTotalCostUsd (average * total). Both must be
    // null until at least one priced response landed, and the
    // projection must be null outside the running phase.
    describe("live cost projection", () => {
        it("is null before any priced item_done has landed", () => {
            const {get} = renderWithProvider()
            act(() => get().start("j-proj-1", "article"))
            act(() =>
                lastEventSource?.fireEvent({
                    type: "start",
                    data: {total: 10, field_classes: ["seo"], rate_limit_seconds: 0},
                }),
            )
            expect(get().pricedCompletedCount).toBe(0)
            expect(get().costPerItemUsd).toBeNull()
            expect(get().projectedTotalCostUsd).toBeNull()
        })

        it("projects total = (totalCostUsd / pricedCompletedCount) * total during running", () => {
            const {get} = renderWithProvider()
            act(() => get().start("j-proj-2", "article"))
            act(() =>
                lastEventSource?.fireEvent({
                    type: "start",
                    data: {total: 20, field_classes: ["seo"], rate_limit_seconds: 0},
                }),
            )
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a1",
                        index: 0,
                        updated_fields: ["seo_title"],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: 0.004,
                        field_class_errors: {},
                    },
                }),
            )
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a2",
                        index: 1,
                        updated_fields: ["seo_title"],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: 0.006,
                        field_class_errors: {},
                    },
                }),
            )
            // 0.004 + 0.006 = 0.010 ; / 2 priced = 0.005 per item
            expect(get().pricedCompletedCount).toBe(2)
            expect(get().costPerItemUsd).toBeCloseTo(0.005)
            // 0.005 * 20 total = 0.10
            expect(get().projectedTotalCostUsd).toBeCloseTo(0.1)
        })

        it("ignores items with null cost_usd in the priced average", () => {
            const {get} = renderWithProvider()
            act(() => get().start("j-proj-3", "article"))
            act(() =>
                lastEventSource?.fireEvent({
                    type: "start",
                    data: {total: 5, field_classes: ["seo"], rate_limit_seconds: 0},
                }),
            )
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a1",
                        index: 0,
                        updated_fields: [],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: null,
                        field_class_errors: {},
                    },
                }),
            )
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a2",
                        index: 1,
                        updated_fields: [],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: 0.008,
                        field_class_errors: {},
                    },
                }),
            )
            // Only the second item counts toward the priced average.
            expect(get().completed).toBe(2)
            expect(get().pricedCompletedCount).toBe(1)
            expect(get().costPerItemUsd).toBeCloseTo(0.008)
            // 0.008 * 5 = 0.040
            expect(get().projectedTotalCostUsd).toBeCloseTo(0.04)
        })

        it("hides projection when phase transitions to a terminal state", () => {
            const {get} = renderWithProvider()
            act(() => get().start("j-proj-4", "article"))
            act(() =>
                lastEventSource?.fireEvent({
                    type: "start",
                    data: {total: 3, field_classes: ["seo"], rate_limit_seconds: 0},
                }),
            )
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a1",
                        index: 0,
                        updated_fields: ["seo_title"],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: 0.01,
                        field_class_errors: {},
                    },
                }),
            )
            expect(get().projectedTotalCostUsd).toBeCloseTo(0.03)
            act(() =>
                lastEventSource?.fireEvent({
                    type: "stream_end",
                    data: {status: "completed", error: null},
                }),
            )
            // Per-item average stays available for diagnostics, but
            // the projection is hidden because terminal phases
            // surface the authoritative final totalCostUsd.
            expect(get().phase).toBe("completed")
            expect(get().costPerItemUsd).toBeCloseTo(0.01)
            expect(get().projectedTotalCostUsd).toBeNull()
        })

        it("is null when total is zero (no projection possible)", () => {
            const {get} = renderWithProvider()
            act(() => get().start("j-proj-5", "article"))
            // No `start` event, so total stays at 0. An item_done
            // arriving before `start` is degenerate but the
            // projection must not crash or return Infinity.
            act(() =>
                lastEventSource?.fireEvent({
                    type: "item_done",
                    data: {
                        id: "a1",
                        index: 0,
                        updated_fields: [],
                        skipped_fields: [],
                        tokens: 100,
                        cost_usd: 0.005,
                        field_class_errors: {},
                    },
                }),
            )
            expect(get().total).toBe(0)
            expect(get().projectedTotalCostUsd).toBeNull()
        })
    })
})

describe("useBulkAiFillJob outside provider", () => {
    it("throws a helpful error", () => {
        const Bare = () => {
            useBulkAiFillJob()
            return null
        }
        expect(() => render(<Bare/>)).toThrow(/BulkAiFillJobProvider/)
    })
})

describe("Harness sanity", () => {
    it("renders the wrapped phase", () => {
        renderWithProvider()
        expect(screen.getByTestId("harness").textContent).toBe("idle")
    })
})
