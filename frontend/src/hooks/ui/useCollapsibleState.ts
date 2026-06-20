/**
 * Collapsible-section open-state with localStorage persistence.
 *
 * Used by the PageEditor right-sidebar Tier sections (Tier1Section
 * visual-style + Tier2Section typography) so the user's open/closed
 * choices survive page navigation, editor close-and-reopen, and
 * full-page reload. Same persistence pattern as useWordWrap and
 * useEditorDisplaySettings.
 *
 * The storage key is caller-provided so each collapsible surface
 * has its own slot. Convention: ``bibliogon-collapsible-<scope>-
 * <section>`` where scope identifies the surrounding component
 * family (e.g. ``speech-bubble``, ``comic-bubble``) and section
 * identifies the slot (e.g. ``tier1``, ``tier2``).
 *
 * Returns ``{open, onOpenChange}`` shaped to drop straight into
 * Radix Collapsible.Root props.
 */

import {useCallback, useState} from "react";

function readStored(storageKey: string, fallback: boolean): boolean {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === "1") return true;
        if (raw === "0") return false;
        return fallback;
    } catch {
        return fallback;
    }
}

function writeStored(storageKey: string, open: boolean): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
        // Swallow — preference simply won't survive reload.
    }
}

export interface CollapsibleState {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function useCollapsibleState(
    storageKey: string,
    defaultOpen: boolean = false,
): CollapsibleState {
    const [open, setOpen] = useState<boolean>(() =>
        readStored(storageKey, defaultOpen),
    );

    const onOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next);
            writeStored(storageKey, next);
        },
        [storageKey],
    );

    return {open, onOpenChange};
}
