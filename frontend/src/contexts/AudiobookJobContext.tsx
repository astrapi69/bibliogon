import {createContext, useCallback, useContext, useMemo, useState} from "react";
import type {ReactNode} from "react";

/**
 * Global state for the active audiobook export.
 *
 * Started by ExportDialog when the user kicks off an audiobook export,
 * consumed by AudioExportProgressGate (mounted at the App root) which
 * either renders the full progress modal or a small minimized badge in
 * the corner so the user can keep working without losing the job.
 *
 * Only one audiobook job at a time is supported - that mirrors how the
 * backend job_store would happily run more but the UI would get
 * confusing. The "start" call replaces any previously-tracked job.
 */
interface AudiobookJobContextValue {
    jobId: string | null;
    bookTitle: string;
    /** True when the user has the modal open; false when it's minimized to a badge. */
    modalOpen: boolean;
    start: (jobId: string, bookTitle: string) => void;
    clear: () => void;
    minimize: () => void;
    expand: () => void;
}

const AudiobookJobContext = createContext<AudiobookJobContextValue | null>(null);

export function AudiobookJobProvider({children}: {children: ReactNode}) {
    const [jobId, setJobId] = useState<string | null>(null);
    const [bookTitle, setBookTitle] = useState<string>("");
    const [modalOpen, setModalOpen] = useState<boolean>(false);

    const start = useCallback((id: string, title: string) => {
        setJobId(id);
        setBookTitle(title);
        setModalOpen(true);
    }, []);

    const clear = useCallback(() => {
        setJobId(null);
        setBookTitle("");
        setModalOpen(false);
    }, []);

    const minimize = useCallback(() => setModalOpen(false), []);
    const expand = useCallback(() => setModalOpen(true), []);

    const value = useMemo(
        () => ({jobId, bookTitle, modalOpen, start, clear, minimize, expand}),
        [jobId, bookTitle, modalOpen, start, clear, minimize, expand],
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
