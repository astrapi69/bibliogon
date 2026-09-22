import { useCallback, useEffect, useRef, useState } from "react";

import type { AplusDocumentRecord } from "../../api/platform";
import {
    emptyDocument,
    newModuleId,
    type AplusDocumentDraft,
} from "../../lib/utils/aplus/aplusDocument";
import { getStorage } from "../../storage";

export type AplusSaveState = "idle" | "saving" | "saved" | "error";

interface UseAplusDocumentOptions {
    bookId: string;
    bookTitle: string;
    language: string;
    /** Debounce for typed edits; `replace` always saves at once. */
    delayMs?: number;
    onError: (err: unknown) => void;
}

interface PendingSave {
    bookId: string;
    language: string;
    doc: AplusDocumentDraft;
}

function toDraft(record: AplusDocumentRecord): AplusDocumentDraft {
    return {
        content_name: record.content_name,
        short_description: record.short_description,
        bullets: record.bullets,
        modules: record.modules,
    };
}

/**
 * The author's A+ document for one book and language (#891), read and
 * written through the storage seam so it works online and offline.
 * Typed edits save debounced; a pending edit is saved, never dropped,
 * when the language changes or the component unmounts. Without a stored
 * document it starts from `emptyDocument`, which is saved on the first edit.
 *
 * @example
 * const aplus = useAplusDocument({ bookId, bookTitle, language, onError });
 * aplus.update({ ...aplus.document!, content_name: "Neu" });
 */
export function useAplusDocument({
    bookId,
    bookTitle,
    language,
    delayMs = 800,
    onError,
}: UseAplusDocumentOptions) {
    const [document, setDocument] = useState<AplusDocumentDraft | null>(null);
    const [saveState, setSaveState] = useState<AplusSaveState>("idle");
    const pending = useRef<PendingSave | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onErrorRef = useRef(onError);
    const titleRef = useRef(bookTitle);

    useEffect(() => {
        onErrorRef.current = onError;
        titleRef.current = bookTitle;
    });

    const persist = useCallback(async (save: PendingSave, quiet: boolean) => {
        if (!quiet) setSaveState("saving");
        try {
            await getStorage().aplusDocuments.save(save.bookId, save.language, save.doc);
            if (!quiet) setSaveState("saved");
        } catch (err) {
            if (!quiet) setSaveState("error");
            onErrorRef.current(err);
        }
    }, []);

    const flush = useCallback(
        async (quiet = false) => {
            if (timer.current) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            const save = pending.current;
            pending.current = null;
            if (save) await persist(save, quiet);
        },
        [persist],
    );

    useEffect(() => {
        let cancelled = false;
        setDocument(null);
        getStorage()
            .aplusDocuments.get(bookId, language)
            .then((record) => {
                if (cancelled) return;
                setDocument(record ? toDraft(record) : emptyDocument(titleRef.current, newModuleId));
                setSaveState(record ? "saved" : "idle");
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setDocument(emptyDocument(titleRef.current, newModuleId));
                setSaveState("error");
                onErrorRef.current(err);
            });
        return () => {
            cancelled = true;
            void flush(true);
        };
    }, [bookId, language, flush]);

    const update = useCallback(
        (next: AplusDocumentDraft) => {
            setDocument(next);
            pending.current = { bookId, language, doc: next };
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void flush(), delayMs);
        },
        [bookId, language, delayMs, flush],
    );

    const replace = useCallback(
        async (next: AplusDocumentDraft) => {
            setDocument(next);
            pending.current = { bookId, language, doc: next };
            await flush();
        },
        [bookId, language, flush],
    );

    return { document, saveState, update, replace, flush };
}
