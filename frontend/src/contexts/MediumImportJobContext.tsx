/**
 * Global state for an active Medium-import async job
 * (ASYNC-IMPORT-PROGRESS-01).
 *
 * Mirrors the AudiobookJobContext pattern: the SSE listener lives
 * HERE so progress survives across user navigation, and a tiny
 * localStorage handle lets the import resume after an F5 if the
 * user is still on the page (or comes back to it). Per the
 * lessons-learned "SSE-in-context-not-in-modal" rule.
 *
 * Differences vs AudiobookJobContext:
 *   - No book_id / book_title — medium-import is per-archive,
 *     not per-book; just the job + preview-id pair are persisted.
 *   - No modal/badge split — the import flow is a dedicated page
 *     route (/articles/import/medium); the page IS the surface.
 *     We DO persist a flag indicating whether a tracked job is
 *     in flight so the page can render the progress UI on F5
 *     re-entry.
 *   - Result fetched from GET /api/medium-import/jobs/{id}/result
 *     once stream_end fires (medium-import worker returns a
 *     structured ImportResponse, not a downloadable file artifact;
 *     the generic /api/export/jobs/{id} polling endpoint does NOT
 *     surface it).
 *
 * Only one import job at a time is tracked. ``start`` replaces
 * any previously-tracked job.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type {ReactNode} from "react";

import {api, ApiError, type MediumImportResponse} from "../api/client";

export type MediumImportPhase =
    | "idle"
    | "connecting"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

export type MediumImportEventType =
    | "start"
    | "post_start"
    | "post_done"
    | "post_skipped"
    | "post_errored"
    | "comment_done"
    | "comment_skipped"
    | "done"
    | "stream_end";

export interface MediumImportEvent {
    type: MediumImportEventType | string;
    data: Record<string, unknown>;
}

interface MediumImportJobContextValue {
    /** True when a job is being tracked (any non-idle phase). */
    active: boolean;
    jobId: string | null;
    phase: MediumImportPhase;
    /** Total posts reported by the start event. */
    total: number;
    /** Index of the most recent post that finished/skipped/errored. */
    current: number;
    /** The filename of the post the worker is currently on
     *  (between post_start and the matching outcome event). */
    currentFilename: string;
    /** All SSE events received so far - the progress component
     *  renders the recent ones; the page reads counters via
     *  derived fields. */
    events: MediumImportEvent[];
    /** Live counters folded from per-post outcome events for the
     *  progress UI. */
    importedCount: number;
    skippedCount: number;
    erroredCount: number;
    importedCommentsCount: number;
    skippedCommentsCount: number;
    errorMessage: string | null;
    /** Set when stream_end arrives + the result fetch succeeds.
     *  Drives the page's transition to the MediumImportResult
     *  panel. */
    result: MediumImportResponse | null;
    /** Start tracking ``jobId``. Closes any prior stream, resets
     *  state, persists the handle, opens the new SSE stream. */
    start: (jobId: string) => void;
    /** Stop tracking + close stream + clear localStorage. Called
     *  from the page after the user dismisses the result. */
    clear: () => void;
    /** Cancel the in-flight job (DELETE /api/export/jobs/{id}).
     *  The stream emits ``stream_end`` with status=cancelled and
     *  the phase flips. */
    cancel: () => Promise<void>;
}

const MediumImportJobContext = createContext<MediumImportJobContextValue | null>(null);

const STORAGE_KEY = "bibliogon.medium_import_job";

interface PersistedJob {
    jobId: string;
}

function loadPersisted(): PersistedJob | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PersistedJob;
        if (!parsed.jobId) return null;
        return parsed;
    } catch {
        return null;
    }
}

function savePersisted(job: PersistedJob | null) {
    try {
        if (job === null) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
        }
    } catch {
        // Quota exceeded / privacy mode - in-memory state still works.
    }
}

export function MediumImportJobProvider({children}: {children: ReactNode}) {
    const [jobId, setJobId] = useState<string | null>(null);
    const [phase, setPhase] = useState<MediumImportPhase>("idle");
    const [total, setTotal] = useState<number>(0);
    const [current, setCurrent] = useState<number>(0);
    const [currentFilename, setCurrentFilename] = useState<string>("");
    const [events, setEvents] = useState<MediumImportEvent[]>([]);
    const [importedCount, setImportedCount] = useState<number>(0);
    const [skippedCount, setSkippedCount] = useState<number>(0);
    const [erroredCount, setErroredCount] = useState<number>(0);
    const [importedCommentsCount, setImportedCommentsCount] = useState<number>(0);
    const [skippedCommentsCount, setSkippedCommentsCount] = useState<number>(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [result, setResult] = useState<MediumImportResponse | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    // Snapshot of the active job_id so the async result-fetch in
    // stream_end can check "is this still the job we care about?"
    // (defends against fast-cycling start() calls).
    const activeJobIdRef = useRef<string | null>(null);

    const resetState = useCallback(() => {
        setPhase("idle");
        setTotal(0);
        setCurrent(0);
        setCurrentFilename("");
        setEvents([]);
        setImportedCount(0);
        setSkippedCount(0);
        setErroredCount(0);
        setImportedCommentsCount(0);
        setSkippedCommentsCount(0);
        setErrorMessage(null);
        setResult(null);
    }, []);

    const closeStream = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    }, []);

    const fetchResultFor = useCallback(async (id: string) => {
        try {
            const body = await api.mediumImport.getJobResult(id);
            // Guard against a slow fetch resolving after the user
            // already started a new job.
            if (activeJobIdRef.current !== id) return;
            setResult(body);
        } catch (err) {
            if (activeJobIdRef.current !== id) return;
            const detail =
                err instanceof ApiError ? err.detail : "Result fetch failed";
            setErrorMessage(detail);
        }
    }, []);

    const openStream = useCallback(
        (id: string) => {
            closeStream();
            activeJobIdRef.current = id;
            setPhase("connecting");
            const es = new EventSource(`/api/export/jobs/${id}/stream`);
            eventSourceRef.current = es;

            es.onopen = () => {
                setPhase((p) => (p === "connecting" ? "running" : p));
            };

            es.onmessage = (e) => {
                let ev: MediumImportEvent;
                try {
                    ev = JSON.parse(e.data) as MediumImportEvent;
                } catch {
                    return;
                }
                setEvents((prev) => [...prev, ev]);

                switch (ev.type) {
                    case "start":
                        setTotal(Number(ev.data.total) || 0);
                        setPhase("running");
                        break;
                    case "post_start":
                        if (typeof ev.data.filename === "string") {
                            setCurrentFilename(ev.data.filename);
                        }
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "post_done":
                        setImportedCount((n) => n + 1);
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "post_skipped":
                        setSkippedCount((n) => n + 1);
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "post_errored":
                        setErroredCount((n) => n + 1);
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "comment_done":
                        setImportedCommentsCount((n) => n + 1);
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "comment_skipped":
                        setSkippedCommentsCount((n) => n + 1);
                        if (typeof ev.data.index === "number") {
                            setCurrent(ev.data.index);
                        }
                        break;
                    case "done":
                        // Summary counters arrive here too as a final
                        // authoritative snapshot. We've been folding
                        // them per-event; this also lets us
                        // pre-populate the result fields if the
                        // dedicated /result fetch races slow.
                        break;
                    case "stream_end": {
                        const status = String(ev.data.status || "");
                        const err = ev.data.error;
                        if (status === "failed") {
                            setPhase("failed");
                            if (typeof err === "string") setErrorMessage(err);
                        } else if (status === "cancelled") {
                            setPhase("cancelled");
                        } else {
                            setPhase("completed");
                            // Successful job: fetch the full
                            // ImportResponse so the page can render
                            // the result panel.
                            void fetchResultFor(id);
                        }
                        closeStream();
                        // Job is over - drop the persistence handle
                        // so an F5 doesn't try to reconnect to a
                        // finished job.
                        savePersisted(null);
                        break;
                    }
                }
            };

            es.onerror = () => {
                setPhase((p) => (p === "connecting" ? "failed" : p));
            };
        },
        [closeStream, fetchResultFor],
    );

    const start = useCallback(
        (id: string) => {
            closeStream();
            resetState();
            setJobId(id);
            savePersisted({jobId: id});
            openStream(id);
        },
        [closeStream, openStream, resetState],
    );

    const clear = useCallback(() => {
        closeStream();
        resetState();
        setJobId(null);
        activeJobIdRef.current = null;
        savePersisted(null);
    }, [closeStream, resetState]);

    const cancel = useCallback(async () => {
        const id = jobId;
        if (!id) return;
        try {
            await api.mediumImport.cancelJob(id);
            // The SSE stream will emit stream_end with
            // status=cancelled; the handler above flips the phase.
        } catch (err) {
            // Don't block UI on cancel network failures - the user's
            // intent is "stop"; the page should still let them dismiss.
            const detail =
                err instanceof ApiError ? err.detail : "Cancel failed";
            setErrorMessage(detail);
        }
    }, [jobId]);

    // Reload recovery: on mount, look at localStorage. If a previous
    // session left a job behind, reopen the SSE stream so the page
    // can show the running progress instead of returning the user
    // to the idle dropzone.
    useEffect(() => {
        const persisted = loadPersisted();
        if (persisted && !jobId) {
            setJobId(persisted.jobId);
            openStream(persisted.jobId);
        }
        return () => {
            closeStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = useMemo<MediumImportJobContextValue>(
        () => ({
            active: jobId !== null,
            jobId,
            phase,
            total,
            current,
            currentFilename,
            events,
            importedCount,
            skippedCount,
            erroredCount,
            importedCommentsCount,
            skippedCommentsCount,
            errorMessage,
            result,
            start,
            clear,
            cancel,
        }),
        [
            jobId,
            phase,
            total,
            current,
            currentFilename,
            events,
            importedCount,
            skippedCount,
            erroredCount,
            importedCommentsCount,
            skippedCommentsCount,
            errorMessage,
            result,
            start,
            clear,
            cancel,
        ],
    );

    return (
        <MediumImportJobContext.Provider value={value}>
            {children}
        </MediumImportJobContext.Provider>
    );
}

export function useMediumImportJob(): MediumImportJobContextValue {
    const ctx = useContext(MediumImportJobContext);
    if (!ctx) {
        throw new Error(
            "useMediumImportJob must be used inside MediumImportJobProvider",
        );
    }
    return ctx;
}
