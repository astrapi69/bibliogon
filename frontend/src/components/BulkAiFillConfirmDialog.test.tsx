import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react"
import BulkAiFillConfirmDialog, {
    INLINE_BREAKDOWN_THRESHOLD,
} from "./BulkAiFillConfirmDialog"
import {BulkAiFillJobProvider} from "../contexts/BulkAiFillJobContext"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 8/10. Pins the
// confirm-dialog contract:
//
//   - On open, fetches /estimate
//   - Totals strip shows items / calls / tokens / cost / model
//   - <10 items inline table; >=10 collapsed disclosure
//   - Cost-unknown disclaimer when totals.estimated_cost_usd
//     is null
//   - Confirm -> /start -> context.start(jobId, kind) +
//     onClose
//   - Estimate / start failures surface notify.error and
//     keep the dialog open

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
                bulkAiFill: {
                    estimate: make(),
                    start: make(),
                    streamUrl: (j: string) =>
                        `/api/articles/bulk-ai-fill/jobs/${j}/stream`,
                },
            },
            books: {
                bulkAiFill: {
                    estimate: make(),
                    start: make(),
                    streamUrl: (j: string) =>
                        `/api/books/bulk-ai-fill/jobs/${j}/stream`,
                },
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

// EventSource stub for the BulkAiFillJobProvider (start ->
// context.start opens one).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = class FakeES {
    onopen: ((e: Event) => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    constructor(public url: string) {}
    close() {}
}

beforeEach(() => {
    notifyMock.success.mockReset()
    notifyMock.error.mockReset()
    notifyMock.info.mockReset()
    notifyMock.warning.mockReset()
    apiMock.articles.bulkAiFill.estimate.mockReset()
    apiMock.articles.bulkAiFill.start.mockReset()
    apiMock.books.bulkAiFill.estimate.mockReset()
    apiMock.books.bulkAiFill.start.mockReset()
})

function renderDialog(propsOverride?: {
    kind?: "article" | "book"
    ids?: string[]
    fieldClasses?: string[]
}) {
    const onClose = vi.fn() as () => void
    const props = {
        open: true,
        onClose,
        kind: (propsOverride?.kind ?? "article") as "article" | "book",
        ids: propsOverride?.ids ?? ["a1", "a2"],
        fieldClasses: propsOverride?.fieldClasses ?? ["seo"],
        force: false,
        inlineImageCount: null,
    }
    render(
        <BulkAiFillJobProvider>
            <BulkAiFillConfirmDialog {...props}/>
        </BulkAiFillJobProvider>,
    )
    return {onClose, props}
}

function makeEstimate(itemCount: number, opts?: {costUsd?: number | null}) {
    const items = Array.from({length: itemCount}).map((_, i) => ({
        id: `a${i + 1}`,
        title: `Article ${i + 1}`,
        language: "en",
        field_class_calls: 1,
        per_class: {seo: {input_tokens: 800, output_tokens: 200, cost_usd: 0.005}},
        estimated_input_tokens: 800,
        estimated_output_tokens: 200,
        estimated_cost_usd: 0.005,
    }))
    return {
        model: "gpt-4o",
        field_classes: ["seo"],
        items,
        totals: {
            total_items: itemCount,
            total_field_class_calls: itemCount,
            estimated_input_tokens: itemCount * 800,
            estimated_output_tokens: itemCount * 200,
            estimated_cost_usd:
                opts?.costUsd === undefined ? itemCount * 0.005 : opts.costUsd,
        },
    }
}

describe("BulkAiFillConfirmDialog", () => {
    it("constants — INLINE_BREAKDOWN_THRESHOLD = 10 per F4", () => {
        expect(INLINE_BREAKDOWN_THRESHOLD).toBe(10)
    })

    it("fetches estimate on open and renders the totals strip", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(2))
        renderDialog()
        await waitFor(() => {
            expect(screen.getByTestId("bulk-fill-estimate-totals")).toBeTruthy()
        })
        expect(apiMock.articles.bulkAiFill.estimate).toHaveBeenCalledWith({
            ids: ["a1", "a2"],
            field_classes: ["seo"],
            inline_image_count: null,
        })
        expect(screen.getByTestId("bulk-fill-estimate-cost").textContent).toMatch(
            /0\.01/,
        )
    })

    it("renders per-item table inline when items count < threshold", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(3))
        renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-per-item")).toBeTruthy(),
        )
        expect(screen.getByTestId("bulk-fill-estimate-item-a1")).toBeTruthy()
        expect(screen.getByTestId("bulk-fill-estimate-item-a3")).toBeTruthy()
        // No disclosure toggle at this size.
        expect(
            screen.queryByTestId("bulk-fill-estimate-breakdown-toggle"),
        ).toBeNull()
    })

    it("shows a disclosure toggle when items count >= threshold", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(15))
        renderDialog({
            ids: Array.from({length: 15}).map((_, i) => `a${i + 1}`),
        })
        await waitFor(() =>
            expect(
                screen.getByTestId("bulk-fill-estimate-breakdown-toggle"),
            ).toBeTruthy(),
        )
        // Per-item table hidden initially.
        expect(screen.queryByTestId("bulk-fill-estimate-per-item")).toBeNull()
        // Toggle expands it.
        fireEvent.click(
            screen.getByTestId("bulk-fill-estimate-breakdown-toggle"),
        )
        expect(screen.getByTestId("bulk-fill-estimate-per-item")).toBeTruthy()
    })

    it("shows the cost-unknown disclaimer when totals cost is null", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(
            makeEstimate(2, {costUsd: null}),
        )
        renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-totals")).toBeTruthy(),
        )
        expect(
            screen.getByText(/pricing table/i),
        ).toBeTruthy()
    })

    it("estimate error surfaces inline and keeps Start disabled", async () => {
        const {ApiError} = await import("../api/client")
        apiMock.articles.bulkAiFill.estimate.mockRejectedValue(
            new ApiError(404, "Articles not found: a1", "/api/x", "POST"),
        )
        renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-error")).toBeTruthy(),
        )
        expect(screen.getByText(/Articles not found/i)).toBeTruthy()
        const start = screen.getByTestId(
            "bulk-fill-confirm-start",
        ) as HTMLButtonElement
        expect(start.disabled).toBe(true)
    })

    it("Confirm calls /start and closes the dialog on success", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(2))
        apiMock.articles.bulkAiFill.start.mockResolvedValue({job_id: "job123"})
        const {onClose} = renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-totals")).toBeTruthy(),
        )
        act(() => {
            fireEvent.click(screen.getByTestId("bulk-fill-confirm-start"))
        })
        await waitFor(() => {
            expect(apiMock.articles.bulkAiFill.start).toHaveBeenCalledWith({
                ids: ["a1", "a2"],
                field_classes: ["seo"],
                force: false,
                inline_image_count: null,
            })
            expect(onClose).toHaveBeenCalledTimes(1)
        })
    })

    it("Confirm /start error surfaces via notify.error and dialog stays open", async () => {
        const {ApiError} = await import("../api/client")
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(2))
        apiMock.articles.bulkAiFill.start.mockRejectedValue(
            new ApiError(403, "AI features are disabled", "/api/x", "POST"),
        )
        const {onClose} = renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-totals")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("bulk-fill-confirm-start"))
        await waitFor(() => {
            expect(notifyMock.error).toHaveBeenCalledWith(
                "AI features are disabled",
                expect.any(Object),
            )
        })
        expect(onClose).not.toHaveBeenCalled()
    })

    it("Cancel button calls onClose without calling /start", async () => {
        apiMock.articles.bulkAiFill.estimate.mockResolvedValue(makeEstimate(2))
        const {onClose} = renderDialog()
        await waitFor(() =>
            expect(screen.getByTestId("bulk-fill-estimate-totals")).toBeTruthy(),
        )
        fireEvent.click(screen.getByTestId("bulk-fill-confirm-cancel"))
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(apiMock.articles.bulkAiFill.start).not.toHaveBeenCalled()
    })

    it("book kind routes through api.books.bulkAiFill namespace", async () => {
        apiMock.books.bulkAiFill.estimate.mockResolvedValue(makeEstimate(1))
        renderDialog({kind: "book", ids: ["b1"], fieldClasses: ["cover_prompt"]})
        await waitFor(() => {
            expect(apiMock.books.bulkAiFill.estimate).toHaveBeenCalled()
            expect(apiMock.articles.bulkAiFill.estimate).not.toHaveBeenCalled()
        })
    })
})
