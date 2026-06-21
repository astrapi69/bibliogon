/**
 * Word-wrap toggle for editor surfaces.
 *
 * Industry-standard Alt+Z behavior (VS Code / Sublime / IntelliJ):
 * toggle word-wrap on the visible editable text surface. Bibliogon's
 * editors are TipTap-based (chapter editor, picture-book RichText,
 * comic-book) plus a markdown textarea in Editor.tsx — all share the
 * same toggle via a body-level CSS class.
 *
 * State lives on document.body so a single hook instance at App-level
 * affects every editor mounted under the React tree. The CSS rule in
 * global.css applies ``white-space: pre`` + horizontal scroll to
 * .ProseMirror + the markdown textarea when the class is present.
 *
 * Persistence: localStorage key ``bibliogon-word-wrap-disabled``
 * (matches the existing theme/preference convention). Default is
 * "wrap enabled" — first-run state is wrap-on, matching the prior
 * implicit behavior.
 *
 * Filed by EDITOR-KEYBOARD-SHORTCUT-ALT-Z-01 (2026-05-22).
 */

import {useCallback, useEffect, useState} from "react";

const STORAGE_KEY = "bibliogon-word-wrap-disabled";
const BODY_CLASS = "no-word-wrap";

function readStored(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        // localStorage can throw on quota / privacy-mode browsers.
        // Fall back to default (wrap enabled).
        return false;
    }
}

function writeStored(disabled: boolean): void {
    if (typeof window === "undefined") return;
    try {
        if (disabled) {
            localStorage.setItem(STORAGE_KEY, "1");
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Swallow — preference simply won't survive reload.
    }
}

function applyBodyClass(disabled: boolean): void {
    if (typeof document === "undefined") return;
    if (disabled) {
        document.body.classList.add(BODY_CLASS);
    } else {
        document.body.classList.remove(BODY_CLASS);
    }
}

export interface WordWrapToggle {
    /** True when word-wrap is DISABLED (long lines scroll horizontally). */
    disabled: boolean;
    /** Flip the current state. */
    toggle: () => void;
}

export function useWordWrap(): WordWrapToggle {
    const [disabled, setDisabled] = useState<boolean>(readStored);

    // Sync the body class on every state change AND on first mount.
    // First-mount sync matters because reload-with-localStorage-set
    // needs to apply the class before the user touches anything.
    useEffect(() => {
        applyBodyClass(disabled);
    }, [disabled]);

    const toggle = useCallback(() => {
        setDisabled((prev) => {
            const next = !prev;
            writeStored(next);
            return next;
        });
    }, []);

    return {disabled, toggle};
}
