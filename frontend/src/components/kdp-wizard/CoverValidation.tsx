/**
 * KDP Publishing Wizard — Step 2: Cover Validation.
 *
 * Validates the book's current cover image against KDP's basic
 * requirements:
 *
 *   - cover exists (``book.cover_image`` non-empty)
 *   - dimensions: min 625x1000, max 10000x10000
 *   - aspect ratio: 1.5–1.8 (height / width)
 *   - format: jpg / jpeg / png / tiff (from filename extension)
 *
 * MVP scope: validation runs CLIENT-SIDE from the rendered image's
 * ``naturalWidth`` / ``naturalHeight``. The backend's
 * ``POST /api/kdp/validate-cover`` endpoint also checks DPI + ICC
 * profile + file size, but it requires the file content uploaded
 * fresh; using it here would force a roundtrip. Phase 1 ships the
 * preflight; deep validation is filed as a follow-up if real
 * mismatches surface.
 *
 * Source of truth for the requirements:
 * ``plugins/bibliogon-plugin-kdp/bibliogon_kdp/routes.py``
 * ``KDP_COVER_REQUIREMENTS`` constant (Amazon-dictated; not
 * user-editable on either end).
 */

import {useEffect, useState} from "react"
import {CheckCircle, AlertCircle, ImageOff} from "lucide-react"

import {BookDetail} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"

interface Props {
    book: BookDetail
    onCanAdvanceChange: (canAdvance: boolean) => void
}

// Mirrors backend KDP_COVER_REQUIREMENTS exactly. If KDP changes
// the spec, update both here AND in routes.py.
const KDP_REQ = {
    minWidth: 625,
    minHeight: 1000,
    maxWidth: 10000,
    maxHeight: 10000,
    aspectMin: 1.5,
    aspectMax: 1.8,
    allowedFormats: ["jpg", "jpeg", "png", "tiff"] as const,
}

interface ImageDimensions {
    width: number
    height: number
}

interface ValidationIssue {
    field: string
    severity: "error" | "warning"
    message: string
}

function extOf(filename: string | null): string {
    if (!filename) return ""
    const idx = filename.lastIndexOf(".")
    if (idx < 0) return ""
    return filename.slice(idx + 1).toLowerCase()
}

function buildCoverUrl(book: BookDetail): string | null {
    if (!book.cover_image) return null
    const filename = book.cover_image.split("/").pop()
    if (!filename) return null
    return `/api/books/${book.id}/assets/file/${filename}`
}

function validateDimensions(
    dim: ImageDimensions,
    format: string,
): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!KDP_REQ.allowedFormats.includes(format as typeof KDP_REQ.allowedFormats[number])) {
        issues.push({
            field: "format",
            severity: "error",
            message: `Unsupported format '${format}'. KDP requires JPG, JPEG, PNG, or TIFF.`,
        })
    }

    if (dim.width < KDP_REQ.minWidth || dim.height < KDP_REQ.minHeight) {
        issues.push({
            field: "dimensions",
            severity: "error",
            message: `Image ${dim.width}x${dim.height} is too small. Minimum: ${KDP_REQ.minWidth}x${KDP_REQ.minHeight}.`,
        })
    } else if (dim.width > KDP_REQ.maxWidth || dim.height > KDP_REQ.maxHeight) {
        issues.push({
            field: "dimensions",
            severity: "error",
            message: `Image ${dim.width}x${dim.height} is too large. Maximum: ${KDP_REQ.maxWidth}x${KDP_REQ.maxHeight}.`,
        })
    }

    if (dim.width > 0) {
        const ratio = dim.height / dim.width
        if (ratio < KDP_REQ.aspectMin || ratio > KDP_REQ.aspectMax) {
            issues.push({
                field: "aspect_ratio",
                severity: "warning",
                message: `Aspect ratio ${ratio.toFixed(2)} is outside the recommended range (${KDP_REQ.aspectMin}–${KDP_REQ.aspectMax}).`,
            })
        }
    }

    return issues
}

export default function CoverValidation({book, onCanAdvanceChange}: Props) {
    const {t} = useI18n()
    const [dim, setDim] = useState<ImageDimensions | null>(null)
    const [loadError, setLoadError] = useState(false)

    const coverUrl = buildCoverUrl(book)
    const filename = book.cover_image
        ? book.cover_image.split("/").pop() || ""
        : ""
    const format = extOf(filename)

    // No cover → fail immediately. No image fetch needed.
    useEffect(() => {
        if (!coverUrl) {
            onCanAdvanceChange(false)
        }
        // Reset dim/loadError when book changes mid-session.
        setDim(null)
        setLoadError(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id])

    const issues = dim ? validateDimensions(dim, format) : []
    const errors = issues.filter((i) => i.severity === "error")
    const warnings = issues.filter((i) => i.severity === "warning")
    const passed = !!dim && errors.length === 0 && !loadError

    // Report gate state whenever the validation status changes.
    useEffect(() => {
        if (!coverUrl) return // already reported false above
        if (loadError) {
            onCanAdvanceChange(false)
            return
        }
        if (dim) {
            onCanAdvanceChange(passed)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dim, loadError, passed])

    // No-cover state.
    if (!coverUrl) {
        return (
            <div
                style={styles.stepContent}
                data-testid="kdp-publishing-wizard-step-1-cover"
            >
                <div
                    style={styles.errorBanner}
                    data-testid="kdp-publishing-wizard-step-1-no-cover"
                >
                    <ImageOff size={16} />
                    <span>
                        {t(
                            "ui.kdp_publishing_wizard.cover_missing",
                            "Kein Cover hinterlegt. KDP erfordert ein Coverbild.",
                        )}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div
            style={styles.stepContent}
            data-testid="kdp-publishing-wizard-step-1-cover"
        >
            <p style={styles.hint}>
                {t(
                    "ui.kdp_publishing_wizard.cover_hint",
                    "Cover wird gegen KDP-Mindestanforderungen geprüft (Format, Maße, Seitenverhältnis).",
                )}
            </p>

            <div style={styles.previewRow}>
                <img
                    src={coverUrl}
                    alt={t("ui.kdp_publishing_wizard.cover_preview_alt", "Cover-Vorschau")}
                    style={styles.preview}
                    data-testid="kdp-publishing-wizard-step-1-preview"
                    onLoad={(e) => {
                        const img = e.currentTarget
                        setDim({
                            width: img.naturalWidth,
                            height: img.naturalHeight,
                        })
                    }}
                    onError={() => {
                        setLoadError(true)
                    }}
                />
                <dl
                    style={styles.metaList}
                    data-testid="kdp-publishing-wizard-step-1-meta"
                >
                    <dt style={styles.metaKey}>
                        {t("ui.kdp_publishing_wizard.cover_filename", "Datei")}
                    </dt>
                    <dd style={styles.metaValue}>{filename}</dd>
                    <dt style={styles.metaKey}>
                        {t("ui.kdp_publishing_wizard.cover_format", "Format")}
                    </dt>
                    <dd style={styles.metaValue}>{format || "—"}</dd>
                    {dim && (
                        <>
                            <dt style={styles.metaKey}>
                                {t(
                                    "ui.kdp_publishing_wizard.cover_dimensions",
                                    "Maße",
                                )}
                            </dt>
                            <dd
                                style={styles.metaValue}
                                data-testid="kdp-publishing-wizard-step-1-dimensions"
                            >
                                {dim.width}×{dim.height} px
                            </dd>
                            <dt style={styles.metaKey}>
                                {t(
                                    "ui.kdp_publishing_wizard.cover_aspect",
                                    "Seitenverhältnis",
                                )}
                            </dt>
                            <dd style={styles.metaValue}>
                                {(dim.height / dim.width).toFixed(2)}
                            </dd>
                        </>
                    )}
                </dl>
            </div>

            {loadError && (
                <div
                    style={styles.errorBanner}
                    data-testid="kdp-publishing-wizard-step-1-load-error"
                >
                    <AlertCircle size={16} />
                    <span>
                        {t(
                            "ui.kdp_publishing_wizard.cover_load_failed",
                            "Cover konnte nicht geladen werden.",
                        )}
                    </span>
                </div>
            )}

            {dim && !loadError && (
                <div
                    style={passed ? styles.summaryOk : styles.summaryFail}
                    data-testid={
                        passed
                            ? "kdp-publishing-wizard-step-1-summary-ok"
                            : "kdp-publishing-wizard-step-1-summary-fail"
                    }
                >
                    {passed ? (
                        <>
                            <CheckCircle size={16} />{" "}
                            {t(
                                "ui.kdp_publishing_wizard.cover_summary_ok",
                                "Cover erfüllt die KDP-Anforderungen.",
                            )}
                        </>
                    ) : (
                        <>
                            <AlertCircle size={16} />{" "}
                            {t(
                                "ui.kdp_publishing_wizard.cover_summary_fail",
                                "Cover erfüllt die KDP-Anforderungen nicht.",
                            )}
                        </>
                    )}
                </div>
            )}

            {errors.length > 0 && (
                <ul
                    style={styles.issueList}
                    data-testid="kdp-publishing-wizard-step-1-error-list"
                >
                    {errors.map((issue, i) => (
                        <li
                            key={`err-${issue.field}-${i}`}
                            style={styles.errorRow}
                            data-testid={`kdp-publishing-wizard-step-1-error-${issue.field}`}
                        >
                            <AlertCircle size={14} />
                            <span style={styles.issueMessage}>
                                {issue.message}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {warnings.length > 0 && (
                <ul
                    style={styles.issueList}
                    data-testid="kdp-publishing-wizard-step-1-warning-list"
                >
                    {warnings.map((issue, i) => (
                        <li
                            key={`warn-${issue.field}-${i}`}
                            style={styles.warningRow}
                            data-testid={`kdp-publishing-wizard-step-1-warning-${issue.field}`}
                        >
                            <AlertCircle size={14} />
                            <span style={styles.issueMessage}>
                                {issue.message}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    stepContent: {
        minHeight: 280,
    },
    hint: {
        fontSize: "0.875rem",
        color: "var(--text-muted)",
        marginBottom: 16,
        lineHeight: 1.5,
    },
    previewRow: {
        display: "flex",
        gap: 16,
        marginBottom: 16,
        alignItems: "flex-start",
    },
    preview: {
        width: 120,
        height: "auto",
        maxHeight: 192,
        objectFit: "contain",
        background: "var(--surface-2, var(--bg-secondary))",
        borderRadius: "var(--radius-sm, 4px)",
        border: "1px solid var(--border)",
    },
    metaList: {
        display: "grid",
        gridTemplateColumns: "max-content 1fr",
        gap: "4px 12px",
        margin: 0,
        fontSize: "0.8125rem",
        flex: 1,
    },
    metaKey: {
        color: "var(--text-muted)",
    },
    metaValue: {
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono, monospace)",
        margin: 0,
    },
    errorBanner: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 12,
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius-sm, 4px)",
        marginBottom: 16,
        fontSize: "0.875rem",
    },
    summaryOk: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--success-bg, rgba(34,197,94,0.1))",
        color: "var(--success, #15803d)",
        marginBottom: 12,
        fontSize: "0.875rem",
    },
    summaryFail: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        marginBottom: 12,
        fontSize: "0.875rem",
    },
    issueList: {
        listStyle: "none",
        padding: 0,
        margin: "8px 0 16px",
        display: "grid",
        gap: 4,
    },
    errorRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "var(--danger-bg, rgba(239,68,68,0.06))",
        color: "var(--danger)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    warningRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "var(--warning-bg, rgba(234,179,8,0.06))",
        color: "var(--warning, #b45309)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    issueMessage: {
        color: "var(--text-primary)",
    },
}
