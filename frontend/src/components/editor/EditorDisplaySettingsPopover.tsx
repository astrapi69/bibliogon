/**
 * Editor display settings popover (EDITOR-DISPLAY-SETTINGS-01 C2).
 *
 * Toolbar button + click-toggleable settings panel. Four controls
 * (width / font / size / line-height) bound to useEditorDisplaySettings.
 *
 * Built on a plain controlled-visibility + click-outside pattern
 * rather than @radix-ui/react-popover (which is not in package.json)
 * or DropdownMenu (which has happy-dom Vitest flake per the existing
 * "Radix DropdownMenu + happy-dom is brittle for Vitest" rule). The
 * panel is just a positioned div the consumer toggles via the
 * trigger button.
 *
 * Mount this in the editor toolbar — the parent useEditorDisplaySettings
 * hook lives at the app root so all editor surfaces inherit the
 * applied CSS variables.
 */

import {useCallback, useEffect, useRef, useState} from "react";
import {Settings2} from "lucide-react";
import {
    type EditorDisplaySettings,
    type EditorFontFamily,
    type EditorFontSize,
    type EditorLineHeight,
    type EditorWidth,
} from "../../hooks/editor/useEditorDisplaySettings";
import {useI18n} from "../../hooks/useI18n";
import {RadixSelect} from "../RadixSelect";

interface Props {
    settings: EditorDisplaySettings;
    onWidthChange: (w: EditorWidth) => void;
    onFontFamilyChange: (f: EditorFontFamily) => void;
    onFontSizeChange: (s: EditorFontSize) => void;
    onLineHeightChange: (lh: EditorLineHeight) => void;
    onReset: () => void;
    /** Optional override; default ``editor-display-settings``. */
    "data-testid"?: string;
}

const WIDTH_OPTIONS: ReadonlyArray<{value: EditorWidth; labelKey: string; labelFallback: string}> = [
    {value: "narrow", labelKey: "ui.editor_display.width_narrow", labelFallback: "Schmal (680px)"},
    {value: "medium", labelKey: "ui.editor_display.width_medium", labelFallback: "Mittel (780px)"},
    {value: "wide", labelKey: "ui.editor_display.width_wide", labelFallback: "Breit (900px)"},
    {value: "full", labelKey: "ui.editor_display.width_full", labelFallback: "Voll (keine Begrenzung)"},
];

const FONT_OPTIONS: ReadonlyArray<{value: EditorFontFamily; labelKey: string; labelFallback: string}> = [
    {value: "serif", labelKey: "ui.editor_display.font_serif", labelFallback: "Serif"},
    {value: "sans", labelKey: "ui.editor_display.font_sans", labelFallback: "Sans-Serif"},
    {value: "mono", labelKey: "ui.editor_display.font_mono", labelFallback: "Monospace"},
];

const SIZE_OPTIONS: ReadonlyArray<{value: EditorFontSize; labelKey: string; labelFallback: string}> = [
    {value: "small", labelKey: "ui.editor_display.size_small", labelFallback: "Klein"},
    {value: "medium", labelKey: "ui.editor_display.size_medium", labelFallback: "Mittel"},
    {value: "large", labelKey: "ui.editor_display.size_large", labelFallback: "Groß"},
];

const LINE_HEIGHT_OPTIONS: ReadonlyArray<{value: EditorLineHeight; labelKey: string; labelFallback: string}> = [
    {value: "compact", labelKey: "ui.editor_display.line_compact", labelFallback: "Kompakt"},
    {value: "normal", labelKey: "ui.editor_display.line_normal", labelFallback: "Normal"},
    {value: "relaxed", labelKey: "ui.editor_display.line_relaxed", labelFallback: "Entspannt"},
];

export default function EditorDisplaySettingsPopover({
    settings,
    onWidthChange,
    onFontFamilyChange,
    onFontSizeChange,
    onLineHeightChange,
    onReset,
    "data-testid": testId,
}: Props) {
    const {t} = useI18n();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const baseTestId = testId ?? "editor-display-settings";

    // Click-outside closes the panel. Bound via a single document-
    // level listener so we don't intercept clicks inside the panel
    // itself. Mouse-down (not click) so the close happens before
    // any in-panel click handler fires — matches the
    // DismissableLayer pattern Radix uses.
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!wrapperRef.current) return;
            // RadixSelect renders its dropdown in a portal on
            // document.body, i.e. OUTSIDE wrapperRef. A click on a
            // select option must NOT close the popover — otherwise
            // picking a width/font value closes the whole panel before
            // the change applies (the option never takes effect).
            const target = e.target as HTMLElement | null;
            if (target?.closest(".radix-select-content")) return;
            if (!wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Escape closes the panel for keyboard a11y.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open]);

    const toggle = useCallback(() => setOpen((v) => !v), []);

    return (
        <div
            ref={wrapperRef}
            style={{position: "relative", display: "inline-block"}}
            data-testid={baseTestId}
        >
            <button
                type="button"
                className="btn btn-icon"
                onClick={toggle}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={t(
                    "ui.editor_display.toggle_label",
                    "Editor-Anzeige-Einstellungen",
                )}
                title={t(
                    "ui.editor_display.toggle_label",
                    "Editor-Anzeige-Einstellungen",
                )}
                data-testid={`${baseTestId}-toggle`}
            >
                <Settings2 size={16} />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-label={t(
                        "ui.editor_display.panel_label",
                        "Editor-Anzeige",
                    )}
                    data-testid={`${baseTestId}-panel`}
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        zIndex: 100,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))",
                        padding: 12,
                        minWidth: 260,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <PopoverSelect
                        label={t("ui.editor_display.width_label", "Breite")}
                        value={settings.width}
                        options={WIDTH_OPTIONS}
                        onChange={onWidthChange}
                        testId={`${baseTestId}-width`}
                        t={t}
                    />
                    <PopoverSelect
                        label={t("ui.editor_display.font_label", "Schriftart")}
                        value={settings.fontFamily}
                        options={FONT_OPTIONS}
                        onChange={onFontFamilyChange}
                        testId={`${baseTestId}-font`}
                        t={t}
                    />
                    <PopoverSelect
                        label={t("ui.editor_display.size_label", "Schriftgröße")}
                        value={settings.fontSize}
                        options={SIZE_OPTIONS}
                        onChange={onFontSizeChange}
                        testId={`${baseTestId}-size`}
                        t={t}
                    />
                    <PopoverSelect
                        label={t("ui.editor_display.line_label", "Zeilenhöhe")}
                        value={settings.lineHeight}
                        options={LINE_HEIGHT_OPTIONS}
                        onChange={onLineHeightChange}
                        testId={`${baseTestId}-line`}
                        t={t}
                    />
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onReset}
                        data-testid={`${baseTestId}-reset`}
                        style={{marginTop: 4}}
                    >
                        {t("ui.editor_display.reset", "Standard wiederherstellen")}
                    </button>
                </div>
            )}
        </div>
    );
}

interface SelectProps<T extends string> {
    label: string;
    value: T;
    options: ReadonlyArray<{value: T; labelKey: string; labelFallback: string}>;
    onChange: (v: T) => void;
    testId: string;
    t: (key: string, fallback: string) => string;
}

function PopoverSelect<T extends string>({
    label,
    value,
    options,
    onChange,
    testId,
    t,
}: SelectProps<T>) {
    return (
        <label
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.875rem",
            }}
            data-testid={testId}
        >
            <span style={{color: "var(--text-muted)"}}>{label}</span>
            <RadixSelect
                value={value}
                onValueChange={(next) => onChange(next as T)}
                testId={testId}
                ariaLabel={label}
                className="is-narrow"
                options={options.map((opt) => ({
                    value: opt.value,
                    label: t(opt.labelKey, opt.labelFallback),
                }))}
            />
        </label>
    );
}
