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
 * (for parent-scoped E2E targeting). State + localStorage +
 * handleExport are all owned here.
 *
 * The format/bleed localStorage keys are book-type-agnostic — a
 * user's last-picked format applies across picture-book + comic-
 * book contexts; intentional cross-surface continuity per the
 * 2-surfaces-share-one-storage convention.
 */

import React, {useCallback, useState} from "react"
import {Download, Loader2} from "lucide-react"
import {api, ApiError} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import {notify} from "../utils/notify"

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
export const PICTURE_BOOK_FORMAT_STORAGE_KEY =
    "bibliogon-picture-book-format"

// PDF-BLEED-MARKS-01: bleed toggle persisted alongside the format
// selection. Q7 namespace decision: matches the format key exactly.
export const PICTURE_BOOK_BLEED_STORAGE_KEY =
    "bibliogon-picture-book-bleed-marks"
const DEFAULT_PICTURE_BOOK_BLEED = false

function readStoredFormat(): PictureBookFormat {
    try {
        const stored = localStorage.getItem(PICTURE_BOOK_FORMAT_STORAGE_KEY)
        if (
            stored !== null &&
            (PICTURE_BOOK_FORMATS as readonly string[]).includes(stored)
        ) {
            return stored as PictureBookFormat
        }
    } catch {
        // Privacy-mode browser or SSR; keep default.
    }
    return DEFAULT_PICTURE_BOOK_FORMAT
}

function readStoredBleed(): boolean {
    try {
        const stored = localStorage.getItem(PICTURE_BOOK_BLEED_STORAGE_KEY)
        if (stored === "true") return true
        if (stored === "false") return false
    } catch {
        // Privacy-mode browser or SSR; keep default.
    }
    return DEFAULT_PICTURE_BOOK_BLEED
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
}

export default function PdfExportControls({
    bookId,
    testidPrefix,
    controlClassName,
    exportButtonClassName,
    spinnerClassName,
}: Props) {
    const {t} = useI18n()
    const [format, setFormat] = useState<PictureBookFormat>(readStoredFormat)
    const [bleed, setBleed] = useState<boolean>(readStoredBleed)
    const [exporting, setExporting] = useState(false)

    const handleFormatChange = useCallback(
        (next: PictureBookFormat) => {
            setFormat(next)
            try {
                localStorage.setItem(PICTURE_BOOK_FORMAT_STORAGE_KEY, next)
            } catch {
                // Privacy-mode browsers reject setItem; React state
                // still applies for the current session.
            }
        },
        [],
    )

    const handleBleedChange = useCallback((next: boolean) => {
        setBleed(next)
        try {
            localStorage.setItem(
                PICTURE_BOOK_BLEED_STORAGE_KEY,
                next ? "true" : "false",
            )
        } catch {
            // Same defensive pattern as format.
        }
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

    return (
        <>
            <select
                value={format}
                onChange={(e) =>
                    handleFormatChange(e.target.value as PictureBookFormat)
                }
                data-testid={`${testidPrefix}-pdf-format-select`}
                className={controlClassName}
                aria-label={t(
                    "ui.page_editor.pdf_format_label",
                    "PDF format",
                )}
                title={t("ui.page_editor.pdf_format_label", "PDF format")}
            >
                {PICTURE_BOOK_FORMATS.map((fmt) => (
                    <option key={fmt} value={fmt}>
                        {t(
                            `ui.page_editor.pdf_format.${fmt.replace(/\./g, "_")}`,
                            fmt,
                        )}
                    </option>
                ))}
            </select>
            <label
                className={controlClassName}
                style={{display: "inline-flex", alignItems: "center", gap: 6}}
                title={t(
                    "ui.page_editor.pdf_bleed_hint",
                    "Adds 3 mm bleed + crop marks for print-shop submission",
                )}
            >
                <input
                    type="checkbox"
                    checked={bleed}
                    onChange={(e) => handleBleedChange(e.target.checked)}
                    data-testid={`${testidPrefix}-pdf-bleed-toggle`}
                    aria-label={t(
                        "ui.page_editor.pdf_bleed_label",
                        "Bleed marks",
                    )}
                />
                <span>
                    {t(
                        "ui.page_editor.pdf_bleed_label",
                        "Bleed marks",
                    )}
                </span>
            </label>
            <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                data-testid={`${testidPrefix}-export-pdf`}
                className={exportButtonClassName ?? controlClassName}
                title={t("ui.page_editor.export_pdf", "Export as PDF")}
                style={{display: "inline-flex", alignItems: "center", gap: 6}}
            >
                {exporting ? (
                    <Loader2 size={14} className={spinnerClassName} />
                ) : (
                    <Download size={14} />
                )}
                <span>
                    {exporting
                        ? t("ui.page_editor.exporting_pdf", "Exporting...")
                        : t("ui.page_editor.export_pdf", "Export as PDF")}
                </span>
            </button>
        </>
    )
}
