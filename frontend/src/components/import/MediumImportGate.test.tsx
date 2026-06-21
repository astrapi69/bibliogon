/**
 * Vitest coverage for MediumImportGate (the floating "run in
 * background" badge for Medium-import).
 *
 * Mocks ``useMediumImportJob`` to drive phase + counters
 * directly. Mocks ``useLocation`` so we can simulate "user is
 * on /articles/import/medium" vs "user is somewhere else".
 */
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"
import {MemoryRouter} from "react-router-dom"

import MediumImportGate from "./MediumImportGate"

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}))

const navigateMock = vi.fn()
const useLocationMock = vi.fn()
vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual<typeof import("react-router-dom")>(
        "react-router-dom",
    )
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useLocation: () => useLocationMock(),
    }
})

let jobState = makeIdleJob()

function makeIdleJob() {
    return {
        active: false,
        jobId: null as string | null,
        phase: "idle" as
            | "idle"
            | "connecting"
            | "running"
            | "completed"
            | "failed"
            | "cancelled",
        total: 0,
        current: 0,
        currentFilename: "",
        events: [],
        importedCount: 0,
        skippedCount: 0,
        erroredCount: 0,
        importedCommentsCount: 0,
        skippedCommentsCount: 0,
        errorMessage: null as string | null,
        result: null,
        start: vi.fn(),
        clear: vi.fn(() => {
            jobState.active = false
            jobState.phase = "idle"
        }),
        cancel: vi.fn(),
    }
}

vi.mock("../../contexts/MediumImportJobContext", () => ({
    useMediumImportJob: () => jobState,
}))

function renderGate() {
    return render(
        <MemoryRouter>
            <MediumImportGate />
        </MemoryRouter>,
    )
}

describe("MediumImportGate", () => {
    beforeEach(() => {
        jobState = makeIdleJob()
        navigateMock.mockReset()
        useLocationMock.mockReset()
        useLocationMock.mockReturnValue({pathname: "/articles"})
    })

    it("renders nothing when no job is active", () => {
        renderGate()
        expect(
            screen.queryByTestId("medium-import-gate-badge"),
        ).not.toBeInTheDocument()
    })

    it("renders nothing when user is already on the Medium-import page", () => {
        jobState.active = true
        jobState.phase = "running"
        jobState.jobId = "j1"
        useLocationMock.mockReturnValue({pathname: "/articles/import/medium"})
        renderGate()
        expect(
            screen.queryByTestId("medium-import-gate-badge"),
        ).not.toBeInTheDocument()
    })

    it("renders running badge with progress counter when active + away from page", () => {
        jobState.active = true
        jobState.phase = "running"
        jobState.jobId = "j1"
        jobState.total = 10
        jobState.current = 3
        useLocationMock.mockReturnValue({pathname: "/articles"})
        renderGate()

        const badge = screen.getByTestId("medium-import-gate-badge")
        expect(badge).toBeInTheDocument()
        const progress = screen.getByTestId("medium-import-gate-progress")
        expect(progress.textContent).toContain("3/10")
        expect(progress.textContent).toContain("30%")
    })

    it("badge click navigates back to the Medium-import page", () => {
        jobState.active = true
        jobState.phase = "running"
        jobState.jobId = "j1"
        useLocationMock.mockReturnValue({pathname: "/articles"})
        renderGate()

        const button = screen.getByTestId("medium-import-gate-badge")
            .firstChild as HTMLButtonElement
        fireEvent.click(button)
        expect(navigateMock).toHaveBeenCalledWith("/articles/import/medium")
    })

    it("completed-phase badge shows success label without progress counter", () => {
        jobState.active = true
        jobState.phase = "completed"
        jobState.jobId = "j1"
        useLocationMock.mockReturnValue({pathname: "/articles"})
        renderGate()

        expect(screen.getByTestId("medium-import-gate-badge")).toBeInTheDocument()
        // Progress counter is suppressed in terminal phases.
        expect(
            screen.queryByTestId("medium-import-gate-progress"),
        ).not.toBeInTheDocument()
    })

    it("failed-phase badge shows failure label and click navigates back", () => {
        jobState.active = true
        jobState.phase = "failed"
        jobState.jobId = "j1"
        useLocationMock.mockReturnValue({pathname: "/articles"})
        renderGate()

        const button = screen.getByTestId("medium-import-gate-badge")
            .firstChild as HTMLButtonElement
        fireEvent.click(button)
        expect(navigateMock).toHaveBeenCalledWith("/articles/import/medium")
    })

    it("badge click does NOT clear the job (result must persist for browser-back navigation)", () => {
        jobState.active = true
        jobState.phase = "completed"
        jobState.jobId = "j1"
        useLocationMock.mockReturnValue({pathname: "/articles"})
        renderGate()

        const button = screen.getByTestId("medium-import-gate-badge")
            .firstChild as HTMLButtonElement
        fireEvent.click(button)
        // Click navigates, but does NOT call job.clear() — the
        // result panel on the destination page reads from job.result
        // and must still have it. This is the 2026-05-19 bug-fix
        // contract: only handleReset (Page's "Import another ZIP"
        // button) calls clear().
        expect(navigateMock).toHaveBeenCalledWith("/articles/import/medium")
        expect(jobState.clear).not.toHaveBeenCalled()
    })
})
