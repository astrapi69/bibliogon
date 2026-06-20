/**
 * Editor display preferences (EDITOR-DISPLAY-SETTINGS-01 C1).
 *
 * Per-device localStorage preferences for the writing experience.
 * Mirrors useWordWrap's shape: localStorage-backed, applies CSS
 * via document-root mutation, default returns the no-preference
 * shape.
 *
 * Four preferences:
 *
 *   - ``width``: text content width inside the editor
 *     (narrow / medium / wide / full).
 *   - ``fontFamily``: editor font (serif / sans / mono).
 *   - ``fontSize``: editor font size (small / medium / large).
 *   - ``lineHeight``: editor line spacing (compact / normal / relaxed).
 *
 * These are DISPLAY preferences for the editing experience, NOT
 * export settings. They control how the author sees text while
 * writing; the export pipeline (manuscripta, WeasyPrint, etc.)
 * uses its own fonts + layouts independent of these values.
 *
 * Persistence: per-device via localStorage. Different monitors /
 * laptops have different optimal widths; per-account YAML
 * persistence would force the same width on every device, which
 * is the wrong shape for this preference class. Matches
 * useWordWrap conceptually (Alt+Z toggle is also per-device);
 * users will group these controls together mentally.
 *
 * Applied as CSS custom properties on document.documentElement
 * so they cascade into ``.tiptap-editor`` via var() references
 * in global.css. A single hook mount at the app root applies the
 * values to every editor surface (chapter editor, picture-book
 * RichText editor, comic-book editor, article editor).
 */

import {useCallback, useEffect, useState} from "react";

const STORAGE_KEY = "bibliogon-editor-display-settings";

export type EditorWidth = "narrow" | "medium" | "wide" | "full";
export type EditorFontFamily = "serif" | "sans" | "mono";
export type EditorFontSize = "small" | "medium" | "large";
export type EditorLineHeight = "compact" | "normal" | "relaxed";

export interface EditorDisplaySettings {
    width: EditorWidth;
    fontFamily: EditorFontFamily;
    fontSize: EditorFontSize;
    lineHeight: EditorLineHeight;
}

// Defaults match the pre-feature implicit styling so opt-out
// users see no change. Width "full" preserves the current
// no-constraint behaviour; the other three picked to match
// .tiptap-editor's existing CSS (var(--font-display), 1.125rem,
// line-height 1.8 ≈ relaxed).
export const DEFAULT_EDITOR_DISPLAY_SETTINGS: EditorDisplaySettings = {
    width: "full",
    fontFamily: "serif",
    fontSize: "medium",
    lineHeight: "relaxed",
};

// CSS-variable values picked per preset. The pixel widths match
// common reading-research recommendations (45-75 chars per line
// at 16-18px font), translated to fixed pixel widths for
// reliability:
//   - narrow:  680px  ≈  45-55 chars at 16-18px serif
//   - medium:  780px  ≈  55-65 chars at 16-18px serif
//   - wide:    900px  ≈  65-75 chars at 16-18px serif
//   - full:    none   (no constraint; matches pre-feature default)
const WIDTH_VALUE: Record<EditorWidth, string> = {
    narrow: "680px",
    medium: "780px",
    wide: "900px",
    full: "none",
};

// Font families resolve to existing app CSS variables when
// possible (--font-display is the editor default). "sans" picks
// the app's UI font; "mono" picks the code-font variable.
const FONT_VALUE: Record<EditorFontFamily, string> = {
    serif: "var(--font-display)",
    sans: "var(--font-body)",
    mono: "var(--font-mono)",
};

const FONT_SIZE_VALUE: Record<EditorFontSize, string> = {
    small: "1rem",
    medium: "1.125rem", // matches .tiptap-editor's existing value
    large: "1.25rem",
};

const LINE_HEIGHT_VALUE: Record<EditorLineHeight, string> = {
    compact: "1.4",
    normal: "1.6",
    relaxed: "1.8", // matches .tiptap-editor's existing value
};

function isEditorWidth(v: unknown): v is EditorWidth {
    return v === "narrow" || v === "medium" || v === "wide" || v === "full";
}
function isEditorFontFamily(v: unknown): v is EditorFontFamily {
    return v === "serif" || v === "sans" || v === "mono";
}
function isEditorFontSize(v: unknown): v is EditorFontSize {
    return v === "small" || v === "medium" || v === "large";
}
function isEditorLineHeight(v: unknown): v is EditorLineHeight {
    return v === "compact" || v === "normal" || v === "relaxed";
}

function readStored(): EditorDisplaySettings {
    if (typeof window === "undefined") return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_EDITOR_DISPLAY_SETTINGS;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
            return DEFAULT_EDITOR_DISPLAY_SETTINGS;
        }
        return {
            width: isEditorWidth(parsed.width)
                ? parsed.width
                : DEFAULT_EDITOR_DISPLAY_SETTINGS.width,
            fontFamily: isEditorFontFamily(parsed.fontFamily)
                ? parsed.fontFamily
                : DEFAULT_EDITOR_DISPLAY_SETTINGS.fontFamily,
            fontSize: isEditorFontSize(parsed.fontSize)
                ? parsed.fontSize
                : DEFAULT_EDITOR_DISPLAY_SETTINGS.fontSize,
            lineHeight: isEditorLineHeight(parsed.lineHeight)
                ? parsed.lineHeight
                : DEFAULT_EDITOR_DISPLAY_SETTINGS.lineHeight,
        };
    } catch {
        // localStorage throws on quota / privacy-mode; bad-JSON
        // also lands here. Fall back to defaults — a corrupted
        // entry shouldn't break the editor.
        return DEFAULT_EDITOR_DISPLAY_SETTINGS;
    }
}

function writeStored(settings: EditorDisplaySettings): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Swallow — preference won't survive reload but the
        // in-session state is honoured.
    }
}

/** Apply the four CSS custom properties to document.documentElement
 *  so they cascade into the editor surface via var() references. */
function applyCssVars(settings: EditorDisplaySettings): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--editor-content-width", WIDTH_VALUE[settings.width]);
    root.style.setProperty("--editor-font-family", FONT_VALUE[settings.fontFamily]);
    root.style.setProperty("--editor-font-size", FONT_SIZE_VALUE[settings.fontSize]);
    root.style.setProperty(
        "--editor-line-height",
        LINE_HEIGHT_VALUE[settings.lineHeight],
    );
}

export interface UseEditorDisplaySettingsResult {
    settings: EditorDisplaySettings;
    setWidth: (width: EditorWidth) => void;
    setFontFamily: (font: EditorFontFamily) => void;
    setFontSize: (size: EditorFontSize) => void;
    setLineHeight: (lh: EditorLineHeight) => void;
    /** Reset all four to the default values. */
    reset: () => void;
}

export function useEditorDisplaySettings(): UseEditorDisplaySettingsResult {
    const [settings, setSettings] = useState<EditorDisplaySettings>(readStored);

    useEffect(() => {
        applyCssVars(settings);
    }, [settings]);

    const updateAndPersist = useCallback(
        (patch: Partial<EditorDisplaySettings>) => {
            setSettings((prev) => {
                const next = {...prev, ...patch};
                writeStored(next);
                return next;
            });
        },
        [],
    );

    const setWidth = useCallback(
        (width: EditorWidth) => updateAndPersist({width}),
        [updateAndPersist],
    );
    const setFontFamily = useCallback(
        (fontFamily: EditorFontFamily) => updateAndPersist({fontFamily}),
        [updateAndPersist],
    );
    const setFontSize = useCallback(
        (fontSize: EditorFontSize) => updateAndPersist({fontSize}),
        [updateAndPersist],
    );
    const setLineHeight = useCallback(
        (lineHeight: EditorLineHeight) => updateAndPersist({lineHeight}),
        [updateAndPersist],
    );

    const reset = useCallback(() => {
        setSettings(DEFAULT_EDITOR_DISPLAY_SETTINGS);
        writeStored(DEFAULT_EDITOR_DISPLAY_SETTINGS);
    }, []);

    return {settings, setWidth, setFontFamily, setFontSize, setLineHeight, reset};
}
