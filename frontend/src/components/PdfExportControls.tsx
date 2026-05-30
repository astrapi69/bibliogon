/**
 * PDF export controls for picture-book + comic-book PDFs.
 *
 * Originally PictureBookPdfExportControls (PDF-BLEED-MARKS-01 C2
 * shared component); renamed in plugin-comics Session 2 C6 when
 * the component picked up its third caller. The format dropdown
 * (5 KDP picture-book trim sizes) + bleed-marks checkbox + the
 * Export-PDF button mount the same way across all three surfaces;
 * comic-book PDFs reuse the same trim catalogue per Q4 a.
 *
 * Mounts at three surfaces:
 *
 * - ``PageEditor`` header (picture-book per-page surface; was
 *   PDF-KDP-FORMATS-01's home before the PDF-BLEED-MARKS-01 extract)
 * - ``BookMetadataEditor`` Design tab (picture-book book-level
 *   surface; closes the PDF-KDP-FORMATS-01 half-wired gap)
 * - ``ComicBookEditor`` header (comic-book book-level surface;
 *   added in C6)
 *
 * Both controls + the export-button live INSIDE this component so
 * the parent only needs to pass ``bookId`` + a ``testidPrefix``
 * (for parent-scoped E2E targeting). State + handleExport are
 * owned here.
 *
 * Workspace defaults for format + bleed live in app.yaml under
 * ``ui.picture_book.pdf_default_format`` /
 * ``ui.picture_book.pdf_default_bleed_marks`` (per the
 * Settings-Completeness audit close, 2026-05-27). Per-export
 * inline picks stay in local React state — they apply to the
 * current export only; the global default changes via Settings >
 * Editor only. Legacy ``bibliogon-picture-book-format`` +
 * ``bibliogon-picture-book-bleed-marks`` localStorage keys are
 * no longer read or written; a one-time migration in the
 * ``useEffect`` below pushes any stale localStorage value to
 * the workspace settings if app.yaml has not been customised yet.
 */

import React, {useCallback, useEffect, useRef, useState} from "react"
import {Download, Loader2} from "lucide-react"
import {api, ApiError} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"
import {Toggle} from "./settings/Toggle"
import {RadixSelect} from "./RadixSelect"

// PDF-KDP-FORMATS-01: 5 KDP picture-book trim sizes. Kept in sync
// with the Python PICTURE_BOOK_FORMATS constant in
// ``plugins/bibliogon-plugin-export/bibliogon_export/picture_book_pdf.py``.
export const PICTURE_BOOK_FORMATS = [
    "8.5x8.5",
    "8x10",
    "8.5x11",
    "11x8.5",
    "10x8",
] as const
export type PictureBookFormat = (typeof PICTURE_BOOK_FORMATS)[number]
export const DEFAULT_PICTURE_BOOK_FORMAT: PictureBookFormat = "8.5x8.5"

// Legacy localStorage keys — read once for migration, then no
// longer touched. The values now live in app.yaml under
// ``ui.picture_book.pdf_default_*``.
const LEGACY_FORMAT_STORAGE_KEY = "bibliogon-picture-book-format"
const LEGACY_BLEED_STORAGE_KEY = "bibliogon-picture-book-bleed-marks"

function isPictureBookFormat(value: unknown): value is PictureBookFormat {
    return (
        typeof value === "string" &&
        (PICTURE_BOOK_FORMATS as readonly string[]).includes(value)
    )
}

function readLegacyFormat(): PictureBookFormat | null {
    try {
        const stored = localStorage.getItem(LEGACY_FORMAT_STORAGE_KEY)
        if (isPictureBookFormat(stored)) return stored
    } catch {
        // Privacy-mode browser; ignore.
    }
    return null
}

function readLegacyBleed(): boolean | null {
    try {
        const stored = localStorage.getItem(LEGACY_BLEED_STORAGE_KEY)
        if (stored === "true") return true
        if (stored === "false") return false
    } catch {
        // Same defensive pattern as format.
    }
    return null
}

function clearLegacyKeys(): void {
    try {
        localStorage.removeItem(LEGACY_FORMAT_STORAGE_KEY)
        localStorage.removeItem(LEGACY_BLEED_STORAGE_KEY)
    } catch {
        // Best-effort cleanup; not load-bearing if it fails.
    }
}

interface Props {
    /** Book ID for the export API call. */
    bookId: string
    /** Parent-surface test-id prefix. PageEditor passes
     *  ``"page-editor"`` (so the testids stay
     *  ``page-editor-export-pdf`` etc., preserving the
     *  PDF-KDP-FORMATS-01 testid surface); BookMetadataEditor
     *  passes ``"metadata"``. */
    testidPrefix: string
    /** Optional className override for the rendered controls.
     *  PageEditor reuses ``metadataBtn`` to fit the header style;
     *  BookMetadataEditor uses its tab-section button style. */
    controlClassName?: string
    /** Optional className for the Export PDF button specifically.
     *  Used by BookMetadataEditor which has a button-primary style
     *  for its Design-tab action. */
    exportButtonClassName?: string
    /** Optional spinner CSS class for the loader animation. The
     *  two parent surfaces define their own keyframes; the
     *  component just routes the class. */
    spinnerClassName?: string
    /** Comic-editor header variant (plugin-comics, adjudicated
     *  2026-05-30): icon-only Export-PDF button (matches the
     *  Fullscreen icon-button + tooltip header convention), a
     *  VISIBLE label on the format dropdown (mirrors the Layout
     *  picker), and the bleed control rendered via the shared
     *  ``Toggle`` (accent-themed) instead of a bare checkbox.
     *  Scoped to the comic editor only so PageEditor +
     *  BookMetadataEditor keep their current labeled-button style
     *  (no parallel-surface regression). */
    compact?: boolean
}

export default function PdfExportControls({
    bookId,
    testidPrefix,
    controlClassName,
    exportButtonClassName,
    spinnerClassName,
    compact = false,
}: Props) {
    const {t} = useI18n()
    const [format, setFormat] = useState<PictureBookFormat>(
        DEFAULT_PICTURE_BOOK_FORMAT,
    )
    const [bleed, setBleed] = useState<boolean>(false)
    const [exporting, setExporting] = useState(false)
    const migratedRef = useRef(false)

    // Fetch workspace defaults on mount; fall back to legacy
    // localStorage values for the one-time migration.
    useEffect(() => {
        let cancelled = false
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return
                const ui =
                    (config.ui as Record<string, unknown> | undefined) ?? {}
                const pictureBook =
                    (ui.picture_book as Record<string, unknown> | undefined) ??
                    {}
                const cfgFormat = pictureBook.pdf_default_format
                const cfgBleed = pictureBook.pdf_default_bleed_marks

                const hasCfgFormat = isPictureBookFormat(cfgFormat)
                const hasCfgBleed = typeof cfgBleed === "boolean"
                const legacyFormat = readLegacyFormat()
                const legacyBleed = readLegacyBleed()

                // Initial state: app.yaml wins; legacy localStorage
                // fills the gap for first-mount-after-upgrade.
                const initialFormat = hasCfgFormat
                    ? (cfgFormat as PictureBookFormat)
                    : (legacyFormat ?? DEFAULT_PICTURE_BOOK_FORMAT)
                const initialBleed = hasCfgBleed
                    ? (cfgBleed as boolean)
                    : (legacyBleed ?? false)

                setFormat(initialFormat)
                setBleed(initialBleed)

                // One-time migration: if app.yaml has no value yet
                // AND localStorage carries a stale pick, push the
                // legacy value to app.yaml and clear the keys.
                const needsMigration =
                    (!hasCfgFormat && legacyFormat !== null) ||
                    (!hasCfgBleed && legacyBleed !== null)
                if (needsMigration && !migratedRef.current) {
                    migratedRef.current = true
                    api.settings
                        .updateApp({
                            ui: {
                                ...ui,
                                picture_book: {
                                    ...pictureBook,
                                    pdf_default_format: initialFormat,
                                    pdf_default_bleed_marks: initialBleed,
                                },
                            },
                        })
                        .then(() => clearLegacyKeys())
                        .catch(() => {
                            // Migration is best-effort. Local state
                            // already reflects the right value; the
                            // next change via Settings UI will land
                            // app.yaml properly.
                        })
                } else if (
                    (hasCfgFormat && legacyFormat !== null) ||
                    (hasCfgBleed && legacyBleed !== null)
                ) {
                    // app.yaml is authoritative now; sweep the
                    // legacy keys regardless.
                    clearLegacyKeys()
                }
            })
            .catch(() => {
                // Settings unreachable on this mount; keep defaults.
            })
        return () => {
            cancelled = true
        }
    }, [])

    const handleFormatChange = useCallback((next: PictureBookFormat) => {
        setFormat(next)
    }, [])

    const handleBleedChange = useCallback((next: boolean) => {
        setBleed(next)
    }, [])

    const handleExport = useCallback(async () => {
        if (exporting) return
        setExporting(true)
        try {
            // PDF-KDP-FORMATS-01 + PDF-BLEED-MARKS-01: thread non-
            // default selections as query params. Defaults emit
            // empty params + back-compat filename (<slug>.pdf).
            const params = new URLSearchParams()
            if (format !== DEFAULT_PICTURE_BOOK_FORMAT) {
                params.set("picture_book_format", format)
            }
            if (bleed) {
                params.set("picture_book_bleed_marks", "true")
            }
            await api.documentExport.download(bookId, "pdf", params)
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.page_editor.export_pdf_error",
                          "PDF-Export fehlgeschlagen",
                      )
            notify.error(detail, err)
        } finally {
            setExporting(false)
        }
    }, [bookId, exporting, format, bleed, t])

    const formatLabel = t("ui.page_editor.pdf_format_label", "PDF format")
    const formatSelect = (
        // Comic header (compact): is-narrow trigger so it matches the
        // Layout picker's dropdown look (both header dropdowns are
        // RadixSelect + is-narrow). Other surfaces keep their
        // controlClassName-driven width.
        <RadixSelect
            value={format}
            onValueChange={(next) =>
                handleFormatChange(next as PictureBookFormat)
            }
            testId={`${testidPrefix}-pdf-format`}
            className={compact ? "is-narrow" : controlClassName}
            ariaLabel={formatLabel}
            options={PICTURE_BOOK_FORMATS.map((fmt) => ({
                value: fmt,
                label: t(
                    `ui.page_editor.pdf_format.${fmt.replace(/\./g, "_")}`,
                    fmt,
                ),
            }))}
        />
    )

    return (
        <>
            {compact ? (
                // Comic header: the dropdown carries a VISIBLE label
                // (mirrors the Layout picker) instead of relying only
                // on aria-label/title.
                <label
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "0.85rem",
                    }}
                >
                    <span>{formatLabel}</span>
                    {formatSelect}
                </label>
            ) : (
                formatSelect
            )}
            {compact ? (
                // Comic header: accent-themed shared Toggle instead of
                // a bare checkbox (consistent on/off styling).
                <Toggle
                    label={t("ui.page_editor.pdf_bleed_label", "Bleed marks")}
                    checked={bleed}
                    onChange={handleBleedChange}
                    testId={`${testidPrefix}-pdf-bleed-toggle`}
                />
            ) : (
                <Toggle
                    label={t("ui.page_editor.pdf_bleed_label", "Bleed marks")}
                    checked={bleed}
                    onChange={handleBleedChange}
                    testId={`${testidPrefix}-pdf-bleed-toggle`}
                    description={t(
                        "ui.page_editor.pdf_bleed_hint",
                        "Adds 3 mm bleed + crop marks for print-shop submission",
                    )}
                />
            )}
            <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                data-testid={`${testidPrefix}-export-pdf`}
                // Comic header: match the other utility header buttons
                // (Back/Metadata/Fullscreen) which all use the global
                // ``btn btn-secondary btn-sm`` system, so hover/focus/
                // active states + sizing are identical. Other surfaces
                // keep their parent-provided button class.
                className={
                    compact
                        ? "btn btn-secondary btn-sm"
                        : (exportButtonClassName ?? controlClassName)
                }
                title={t("ui.page_editor.export_pdf", "Export as PDF")}
                // Comic header: icon-only utility button (matches the
                // Fullscreen icon-button + tooltip convention); the
                // tooltip + aria-label carry the action name.
                aria-label={
                    compact
                        ? t("ui.page_editor.export_pdf", "Export as PDF")
                        : undefined
                }
                style={{display: "inline-flex", alignItems: "center", gap: 6}}
            >
                {exporting ? (
                    <Loader2 size={14} className={spinnerClassName} />
                ) : (
                    <Download size={14} />
                )}
                {!compact && (
                    <span>
                        {exporting
                            ? t("ui.page_editor.exporting_pdf", "Exporting...")
                            : t("ui.page_editor.export_pdf", "Export as PDF")}
                    </span>
                )}
            </button>
        </>
    )
}
