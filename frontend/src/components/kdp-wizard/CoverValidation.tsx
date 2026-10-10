/**
 * KDP Publishing Wizard - Step 2: Cover Validation.
 *
 * Validates the book's current cover against the KDP requirements that
 * are readable in the browser, using the shared `lib/kdp` mirror of
 * `bibliogon_kdp.cover_validator`:
 *
 *   - cover exists (``book.cover_image`` non-empty)
 *   - format from the filename extension
 *   - dimensions from the rendered image's ``naturalWidth`` /
 *     ``naturalHeight``
 *   - aspect ratio between them
 *   - byte length, offline only, where the asset's bytes are in
 *     IndexedDB (online the step abstains; see `useCoverByteSize`)
 *
 * This runs with zero ``/api`` calls in either mode - the preview itself
 * resolves through the storage seam. DPI, the PIL colour mode and the
 * embedded ICC profile are not readable from an ``<img>``, so they stay
 * on the desktop, where ``package.py`` validates the staged cover before
 * building the KDP package.
 *
 * The rules and their thresholds live in
 * ``frontend/src/lib/kdp/coverRequirements.ts``, pinned against verdicts
 * recorded from the Python validator (#739). Only the wording of a
 * finding is this component's business.
 */

import {useEffect, useState} from "react"
import {CheckCircle, AlertCircle, ImageOff} from "lucide-react"

import {BookDetail} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {useCoverByteSize, useCoverUrl} from "../../hooks/useAssetUrl"
import {
    type CoverFinding,
    KDP_COVER_REQUIREMENTS,
    coverFormatFromFilename,
    coverPasses,
    validateCoverProbe,
} from "../../lib/kdp/coverRequirements"
import type {ImageDimensions} from "./machines/types"

interface Props {
    book: BookDetail
    onCanAdvanceChange: (canAdvance: boolean) => void
    /** C2 machine-wiring callback. Fires whenever client-side
     *  validation produces real dim + issues. Skipped on no-cover
     *  and load-error paths (the machine's guard sees a null
     *  ``coverDimensions`` and correctly blocks ADVANCE). Optional
     *  so per-step tests pass without driving the machine. */
    onValidated?: (dim: ImageDimensions, issues: CoverFinding[]) => void
}

/** English template per code, used when a catalog has no entry yet. */
const FINDING_FALLBACKS: Record<CoverFinding["code"], string> = {
    format_unsupported: "Unsupported format '{format}'. KDP requires {allowed}.",
    file_size_exceeded: "File size {size} MB exceeds the maximum {max} MB.",
    dimensions_too_small:
        "Image {width}x{height} is too small. Minimum: {min_width}x{min_height}.",
    dimensions_too_large:
        "Image {width}x{height} is too large. Maximum: {max_width}x{max_height}.",
    aspect_ratio_outside_range:
        "Aspect ratio {ratio} is outside the recommended range ({min}-{max}).",
}

/** What the sentence's placeholders stand for.
 *
 *  The finding carries only what was measured; the thresholds it is
 *  measured against come from the requirements, so a changed threshold
 *  changes the message without anyone editing eight catalogs. */
function placeholdersFor(finding: CoverFinding): Record<string, string | number> {
    const req = KDP_COVER_REQUIREMENTS
    switch (finding.code) {
        case "format_unsupported":
            return {
                format: finding.params.format,
                allowed: req.allowedFormats.join(", ").toUpperCase(),
            }
        case "file_size_exceeded":
            return {size: finding.params.fileSizeMb, max: req.maxFileSizeMb}
        case "dimensions_too_small":
            return {
                width: finding.params.width,
                height: finding.params.height,
                min_width: req.minWidth,
                min_height: req.minHeight,
            }
        case "dimensions_too_large":
            return {
                width: finding.params.width,
                height: finding.params.height,
                max_width: req.maxWidth,
                max_height: req.maxHeight,
            }
        case "aspect_ratio_outside_range":
            return {
                ratio: finding.params.ratio,
                min: req.aspectRatioMin,
                max: req.aspectRatioMax,
            }
    }
}

/** The finding's sentence in the UI language, with its numbers filled in.
 *
 *  Interpolation happens here rather than in `t`, which takes only a key
 *  and a fallback - the same split `AplusFindings` uses (#889). */
function messageFor(
    finding: CoverFinding,
    t: (key: string, fallback?: string) => string,
): string {
    const template = t(
        `ui.kdp_publishing_wizard.cover_finding.${finding.code}`,
        FINDING_FALLBACKS[finding.code],
    )
    return Object.entries(placeholdersFor(finding)).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
    )
}

export default function CoverValidation({
    book,
    onCanAdvanceChange,
    onValidated,
}: Props) {
    const {t} = useI18n()
    const [dim, setDim] = useState<ImageDimensions | null>(null)
    const [loadError, setLoadError] = useState(false)

    // Resolve through the storage seam: api mode yields the canonical
    // `/api/.../assets/file/...` URL; dexie/offline mode yields a `blob:`
    // URL from IndexedDB so the preview does not 404 against an absent
    // backend (the same resolver the dashboard cover sites use).
    const coverUrl = useCoverUrl(book.id, book.cover_image)
    const fileSizeBytes = useCoverByteSize(book.id, book.cover_image)
    const filename = book.cover_image
        ? book.cover_image.split("/").pop() || ""
        : ""
    const format = coverFormatFromFilename(filename)

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

    const issues = dim
        ? validateCoverProbe({
              width: dim.width,
              height: dim.height,
              format,
              ...(fileSizeBytes === null ? {} : {fileSizeBytes}),
          })
        : []
    const errors = issues.filter((i) => i.severity === "error")
    const warnings = issues.filter((i) => i.severity === "warning")
    const passed = !!dim && coverPasses(issues) && !loadError

    // Report gate state whenever the validation status changes.
    useEffect(() => {
        if (!coverUrl) return // already reported false above
        if (loadError) {
            onCanAdvanceChange(false)
            return
        }
        if (dim) {
            onCanAdvanceChange(passed)
            // C2 machine-wire: report real dim + computed issues
            // so the wizard's machine sees ``coverDimensions`` and
            // ``coverIssues`` populated.
            onValidated?.(dim, issues)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dim, loadError, passed, fileSizeBytes])

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
                    {errors.map((issue) => (
                        <li
                            key={`err-${issue.code}`}
                            style={styles.errorRow}
                            data-field={issue.field}
                            data-testid={`kdp-publishing-wizard-step-1-error-${issue.code}`}
                        >
                            <AlertCircle size={14} />
                            <span style={styles.issueMessage}>
                                {messageFor(issue, t)}
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
                    {warnings.map((issue) => (
                        <li
                            key={`warn-${issue.code}`}
                            style={styles.warningRow}
                            data-field={issue.field}
                            data-testid={`kdp-publishing-wizard-step-1-warning-${issue.code}`}
                        >
                            <AlertCircle size={14} />
                            <span style={styles.issueMessage}>
                                {messageFor(issue, t)}
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
        background: "var(--success-light)",
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
