/**
 * Tests for the MediumImportJobContext provider
 * (ASYNC-IMPORT-PROGRESS-01 Phase 2).
 *
 * Mirrors BulkAiFillJobContext.test.tsx: stubs the global
 * EventSource with a controllable Fake, drives the SSE event loop
 * via fireEvent(), asserts the context's state folding +
 * persistence + result-fetch behavior.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {act, render, screen, waitFor} from "@testing-library/react"

import {
    MediumImportJobProvider,
    useMediumImportJob,
} from "./MediumImportJobContext"
import type {MediumImportResponse} from "../api/client"

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

const getJobResultMock = vi.fn()
const cancelJobMock = vi.fn()

vi.mock("../api/client", async () => {
    const actual = await vi.importActual<typeof import("../api/client")>(
        "../api/client",
    )
    return {
        ...actual,
        api: {
            ...actual.api,
            mediumImport: {
                ...actual.api.mediumImport,
                getJobResult: (...args: unknown[]) => getJobResultMock(...args),
                cancelJob: (...args: unknown[]) => cancelJobMock(...args),
            },
        },
    }
})

const STORAGE_KEY = "bibliogon.medium_import_job"

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
    localStorage.removeItem(STORAGE_KEY)
    getJobResultMock.mockReset()
    cancelJobMock.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).EventSource = FakeEventSource
})

afterEach(() => {
    lastEventSource = null
    localStorage.removeItem(STORAGE_KEY)
})

function Harness({onCtx}: {onCtx: (ctx: ReturnType<typeof useMediumImportJob>) => void}) {
    const ctx = useMediumImportJob()
    onCtx(ctx)
    return <div data-testid="harness">{ctx.phase}</div>
}

function renderWithProvider() {
    let captured: ReturnType<typeof useMediumImportJob> | null = null
    render(
        <MediumImportJobProvider>
            <Harness onCtx={(c) => (captured = c)}/>
        </MediumImportJobProvider>,
    )
    return {get: () => captured!}
}

const sampleResult: MediumImportResponse = {
    imported_count: 2,
    skipped_count: 0,
    errored_count: 0,
    imported: [
        {id: "art-1", title: "Hello", canonical_url: "https://x", warnings: []},
        {id: "art-2", title: "World", canonical_url: "https://y", warnings: []},
    ],
    skipped: [],
    errored: [],
}

describe("MediumImportJobProvider", () => {
    it("starts idle with no active job", () => {
        const {get} = renderWithProvider()
        expect(get().active).toBe(false)
        expect(get().phase).toBe("idle")
        expect(get().jobId).toBeNull()
    })

    it("start() opens the generic /api/export/jobs/{id}/stream URL and persists the job_id", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("job-abc")
        })
        expect(get().active).toBe(true)
        expect(get().jobId).toBe("job-abc")
        expect(lastEventSource?.url).toBe("/api/export/jobs/job-abc/stream")
        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
        expect(persisted.jobId).toBe("job-abc")
    })

    it("folds start + post_done + post_skipped + post_errored into live counters", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("j1")
        })

        act(() => {
            lastEventSource?.fireEvent({type: "start", data: {total: 4}})
        })
        expect(get().total).toBe(4)
        expect(get().phase).toBe("running")

        act(() => {
            lastEventSource?.fireEvent({
                type: "post_start",
                data: {index: 1, total: 4, filename: "a.html"},
            })
        })
        expect(get().current).toBe(1)
        expect(get().currentFilename).toBe("a.html")

        act(() => {
            lastEventSource?.fireEvent({
                type: "post_done",
                data: {index: 1, filename: "a.html", article_id: "art-a", title: "A"},
            })
        })
        expect(get().importedCount).toBe(1)

        act(() => {
            lastEventSource?.fireEvent({
                type: "post_skipped",
                data: {index: 2, filename: "b.html", reason: "dedup"},
            })
        })
        expect(get().skippedCount).toBe(1)

        act(() => {
            lastEventSource?.fireEvent({
                type: "post_errored",
                data: {index: 3, filename: "c.html", error: "boom"},
            })
        })
        expect(get().erroredCount).toBe(1)

        act(() => {
            lastEventSource?.fireEvent({
                type: "comment_done",
                data: {index: 4, filename: "d.html", comment_id: "cmt-1"},
            })
        })
        expect(get().importedCommentsCount).toBe(1)
    })

    it("stream_end status=completed fetches result and clears persistence", async () => {
        getJobResultMock.mockResolvedValue(sampleResult)
        const {get} = renderWithProvider()
        act(() => {
            get().start("j-done")
        })

        act(() => {
            lastEventSource?.fireEvent({
                type: "stream_end",
                data: {status: "completed", error: null},
            })
        })

        await waitFor(() => expect(get().phase).toBe("completed"))
        await waitFor(() => expect(getJobResultMock).toHaveBeenCalledWith("j-done"))
        await waitFor(() => expect(get().result).toEqual(sampleResult))
        // Stream closed.
        expect(lastEventSource?.closed).toBe(true)
        // Persistence cleared so an F5 doesn't reconnect to a finished job.
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it("stream_end status=failed surfaces error message", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("j-fail")
        })
        act(() => {
            lastEventSource?.fireEvent({
                type: "stream_end",
                data: {status: "failed", error: "worker died"},
            })
        })
        expect(get().phase).toBe("failed")
        expect(get().errorMessage).toBe("worker died")
        expect(get().result).toBeNull()
    })

    it("stream_end status=cancelled transitions phase without an error message", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("j-cancel")
        })
        act(() => {
            lastEventSource?.fireEvent({
                type: "stream_end",
                data: {status: "cancelled", error: null},
            })
        })
        expect(get().phase).toBe("cancelled")
        expect(get().errorMessage).toBeNull()
    })

    it("cancel() calls cancelJob and the SSE stream's subsequent stream_end flips the phase", async () => {
        cancelJobMock.mockResolvedValue(undefined)
        const {get} = renderWithProvider()
        act(() => {
            get().start("j-cx")
        })
        await act(async () => {
            await get().cancel()
        })
        expect(cancelJobMock).toHaveBeenCalledWith("j-cx")
    })

    it("clear() closes the stream, resets state, removes persistence", () => {
        const {get} = renderWithProvider()
        act(() => {
            get().start("j-clear")
        })
        expect(lastEventSource).not.toBeNull()
        const es = lastEventSource

        act(() => {
            get().clear()
        })
        expect(get().active).toBe(false)
        expect(get().jobId).toBeNull()
        expect(get().phase).toBe("idle")
        expect(es?.closed).toBe(true)
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it("F5 recovery: a persisted job triggers a reconnect on mount", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({jobId: "persisted-77"}))
        const {get} = renderWithProvider()
        // The mount-effect fires the EventSource constructor synchronously.
        expect(lastEventSource?.url).toBe("/api/export/jobs/persisted-77/stream")
        expect(get().jobId).toBe("persisted-77")
    })

    it("Provider renders its children", () => {
        renderWithProvider()
        expect(screen.getByTestId("harness")).toBeInTheDocument()
    })
})
