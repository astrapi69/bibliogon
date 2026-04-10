import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";

/**
 * Global state for the active audiobook export.
 *
 * The SSE listener lives HERE, not in the dialog component, so the
 * progress survives even when the user minimizes the dialog and
 * keeps navigating around the app. The dialog and the badge are both
 * pure consumers of this state.
 *
 * Persistence: jobId + bookId are mirrored to localStorage. After a
 * full page reload (F5) the context picks the job up again, re-opens
 * the SSE stream, and the badge re-appears in the App shell as if
 * nothing happened.
 *
 * Only one audiobook job at a time is supported - that mirrors how
 * the backend job_store would happily run more but the UI would get
 * confusing. ``start`` replaces any previously-tracked job.
 */

export type AudiobookEventType =
    | "start"
    | "chapter_start"
    | "chapter_done"
    | "chapter_reused"
    | "chapter_skipped"
    | "chapter_error"
    | "merge_start"
    | "merge_done"
    | "merge_error"
    | "ready"
    | "done"
    | "stream_end";

export interface AudiobookEvent {
    type: AudiobookEventType;
    data: Record<string, unknown>;
}

export type AudiobookPhase = "idle" | "connecting" | "running" | "completed" | "failed" | "cancelled";

export interface AudiobookChapterFile {
    filename: string;
    url: string;
}

interface AudiobookJobContextValue {
    /** True when a job is being tracked (regardless of dialog visibility). */
    active: boolean;
    jobId: string | null;
    bookId: string | null;
    bookTitle: string;
    phase: AudiobookPhase;
    /** Total chapters reported by the start event. */
    total: number;
    /** Index of the most recent chapter the generator finished/skipped/errored on. */
    current: number;
    currentTitle: string;
    /** All SSE events received so far - the dialog renders the recent ones. */
    events: AudiobookEvent[];
    errorMessage: string | null;
    downloadUrl: string | null;
    downloadFilename: string | null;
    chapterFiles: AudiobookChapterFile[];
    /** True when the user has the modal open; false when it is minimized to a badge. */
    modalOpen: boolean;
    start: (jobId: string, bookId: string, bookTitle: string) => void;
    clear: () => void;
    minimize: () => void;
    expand: () => void;
}

const AudiobookJobContext = createContext<AudiobookJobContextValue | null>(null);

const STORAGE_KEY = "bibliogon.audiobook_job";

interface PersistedJob {
    jobId: string;
    bookId: string;
    bookTitle: string;
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
        // Quota exceeded etc - the in-memory state still works.
    }
}

export function AudiobookJobProvider({children}: {children: ReactNode}) {
    const [jobId, setJobId] = useState<string | null>(null);
    const [bookId, setBookId] = useState<string | null>(null);
    const [bookTitle, setBookTitle] = useState<string>("");
    const [modalOpen, setModalOpen] = useState<boolean>(false);

    const [phase, setPhase] = useState<AudiobookPhase>("idle");
    const [total, setTotal] = useState<number>(0);
    const [current, setCurrent] = useState<number>(0);
    const [currentTitle, setCurrentTitle] = useState<string>("");
    const [events, setEvents] = useState<AudiobookEvent[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
    const [chapterFiles, setChapterFiles] = useState<AudiobookChapterFile[]>([]);

    const eventSourceRef = useRef<EventSource | null>(null);

    // --- Internal helpers ---

    const resetState = useCallback(() => {
        setPhase("idle");
        setTotal(0);
        setCurrent(0);
        setCurrentTitle("");
        setEvents([]);
        setErrorMessage(null);
        setDownloadUrl(null);
        setDownloadFilename(null);
        setChapterFiles([]);
    }, []);

    const closeStream = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    }, []);

    /** Open the SSE stream for a given job. Pure DOM side effect. */
    const openStream = useCallback((id: string) => {
        closeStream();
        setPhase("connecting");
        const es = new EventSource(`/api/export/jobs/${id}/stream`);
        eventSourceRef.current = es;

        es.onopen = () => {
            setPhase((p) => (p === "connecting" ? "running" : p));
        };

        es.onmessage = (e) => {
            let ev: AudiobookEvent;
            try {
                ev = JSON.parse(e.data) as AudiobookEvent;
            } catch {
                return;
            }
            setEvents((prev) => [...prev, ev]);

            switch (ev.type) {
                case "start":
                    setTotal(Number(ev.data.total) || 0);
                    setPhase("running");
                    break;
                case "chapter_start":
                    if (typeof ev.data.title === "string") setCurrentTitle(ev.data.title);
                    if (typeof ev.data.index === "number") setCurrent(ev.data.index);
                    break;
                case "chapter_done":
                case "chapter_reused":
                case "chapter_skipped":
                case "chapter_error":
                    if (typeof ev.data.index === "number") setCurrent(ev.data.index);
                    break;
                case "ready": {
                    setDownloadUrl(`/api/export/jobs/${id}/download`);
                    setDownloadFilename(String(ev.data.filename || ""));
                    const files = Array.isArray(ev.data.chapter_files)
                        ? (ev.data.chapter_files as string[])
                        : [];
                    setChapterFiles(files.map((fn) => ({
                        filename: fn,
                        url: `/api/export/jobs/${id}/files/${encodeURIComponent(fn)}`,
                    })));
                    break;
                }
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
                    }
                    closeStream();
                    // Job is over - the persisted handle has done its job
                    // and would otherwise come back to life on F5.
                    savePersisted(null);
                    break;
                }
            }
        };

        es.onerror = () => {
            setPhase((p) => (p === "connecting" ? "failed" : p));
        };
    }, [closeStream]);

    // --- Public actions ---

    const start = useCallback((id: string, bId: string, title: string) => {
        closeStream();
        resetState();
        setJobId(id);
        setBookId(bId);
        setBookTitle(title);
        setModalOpen(true);
        savePersisted({jobId: id, bookId: bId, bookTitle: title});
        openStream(id);
    }, [closeStream, openStream, resetState]);

    const clear = useCallback(() => {
        closeStream();
        resetState();
        setJobId(null);
        setBookId(null);
        setBookTitle("");
        setModalOpen(false);
        savePersisted(null);
    }, [closeStream, resetState]);

    const minimize = useCallback(() => setModalOpen(false), []);
    const expand = useCallback(() => setModalOpen(true), []);

    // --- Reload recovery ---
    //
    // On mount, look at localStorage. If a previous session left a job
    // behind, hand it back to the badge (modal stays minimized so we
    // do not pop a dialog in the user's face after they refreshed).
    useEffect(() => {
        const persisted = loadPersisted();
        if (persisted && !jobId) {
            setJobId(persisted.jobId);
            setBookId(persisted.bookId);
            setBookTitle(persisted.bookTitle);
            setModalOpen(false);
            openStream(persisted.jobId);
        }
        return () => {
            closeStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = useMemo<AudiobookJobContextValue>(
        () => ({
            active: jobId !== null,
            jobId, bookId, bookTitle,
            phase, total, current, currentTitle,
            events, errorMessage,
            downloadUrl, downloadFilename, chapterFiles,
            modalOpen, start, clear, minimize, expand,
        }),
        [
            jobId, bookId, bookTitle, phase, total, current, currentTitle,
            events, errorMessage, downloadUrl, downloadFilename, chapterFiles,
            modalOpen, start, clear, minimize, expand,
        ],
    );

    return (
        <AudiobookJobContext.Provider value={value}>
            {children}
        </AudiobookJobContext.Provider>
    );
}

export function useAudiobookJob(): AudiobookJobContextValue {
    const ctx = useContext(AudiobookJobContext);
    if (!ctx) {
        throw new Error("useAudiobookJob must be used inside AudiobookJobProvider");
    }
    return ctx;
}

/** Format a chapter index as the human-readable progress prefix.
 *
 *  Two-digit by default ("01 | Vorwort"), three-digit when the book
 *  has 100+ chapters ("003 | Vorwort"). The number is purely a display
 *  concern - the TTS engine never sees it.
 */
export function formatChapterPrefix(index: number, total: number): string {
    const width = total >= 100 ? 3 : 2;
    return String(index).padStart(width, "0");
}
