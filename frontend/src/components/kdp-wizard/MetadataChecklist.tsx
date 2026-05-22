/**
 * KDP Publishing Wizard — Step 1: Metadata Checklist.
 *
 * Reads ``book`` and posts to ``/api/kdp/check-metadata``. Renders
 * the issue list as a pass/fail checklist; calls back with whether
 * the metadata passes ("no errors") so the wizard can gate Next.
 *
 * Book-type variation (per KDP Pre-Inspection Track 4): the backend
 * checker reports "Book has no chapters" as an error, which is
 * correct for prose books but inapplicable to picture_book and
 * comic_book (those use the pages table). The component filters
 * the chapters check client-side when ``book.book_type !== "prose"``
 * — keeps the backend untouched per the existing convention of
 * book-type branching at component-render level (mirrors
 * ``BookMetadataEditor.isChapterBasedBookType``).
 *
 * Loading + error states match the existing AiSetupWizard pattern
 * (inline messages, no toasts inside the dialog).
 */

import {useEffect, useState} from "react"
import {CheckCircle, AlertCircle, AlertTriangle, Loader2} from "lucide-react"

import {
    BookDetail,
    KdpMetadataCheckResult,
    KdpMetadataIssue,
    api,
} from "../../api/client"
import {useI18n} from "../../hooks/useI18n"
import {useBookTypes} from "../../hooks/useBookTypes"

interface Props {
    book: BookDetail
    /** Called with ``true`` when the (filtered) issue list has no
     *  error-severity entries, ``false`` otherwise. The wizard
     *  uses this to gate the Next button. */
    onCanAdvanceChange: (canAdvance: boolean) => void
    /** C2 machine-wiring callback. Fires on successful API
     *  completion with the raw result + the book-type-filtered
     *  issue list. Optional so per-step tests that don't drive
     *  the machine still pass. */
    onLoaded?: (
        result: KdpMetadataCheckResult,
        issuesFiltered: KdpMetadataIssue[],
    ) => void
    /** C2 machine-wiring callback for failure. Optional. */
    onFailed?: (error: {
        message: string
        context: "metadata"
        retryable: boolean
    }) => void
}

/** Build the check-metadata request payload from a BookDetail. */
function buildCheckPayload(book: BookDetail) {
    return {
        title: book.title || "",
        subtitle: book.subtitle,
        author: book.author || "",
        description: book.description,
        html_description: book.html_description,
        language: book.language || "",
        keywords: Array.isArray(book.keywords) ? book.keywords : [],
        cover_image: book.cover_image,
        isbn_ebook: book.isbn_ebook,
        isbn_paperback: book.isbn_paperback,
        publisher: book.publisher,
        backpage_description: book.backpage_description,
        chapters: (book.chapters || []).map((c) => ({
            id: c.id,
            title: c.title,
        })),
        categories: Array.isArray(book.categories) ? book.categories : [],
        bisac_codes: Array.isArray(book.bisac_codes) ? book.bisac_codes : [],
    }
}

/** Drop book-type-inapplicable issues.
 *
 *  BOOK-TYPES-SSOT-YAML-01 C7: the gate is now driven by
 *  ``content_model``. Page-based books (content_model="pages")
 *  carry no chapters by design — the backend's "Book has no
 *  chapters" check is always-error for those, so we drop it
 *  client-side. Chapter-based books (content_model="chapters")
 *  pass every issue through unmodified.
 *
 *  ``contentModel === undefined`` (e.g. registry still loading,
 *  or an unknown future book_type) falls through to the chapter-
 *  based path — matches the pre-migration default. */
function filterIssuesForBookType(
    issues: KdpMetadataIssue[],
    contentModel: string | undefined,
): KdpMetadataIssue[] {
    if (contentModel !== "pages") return issues
    return issues.filter((i) => i.field !== "chapters")
}

function isComplete(issues: KdpMetadataIssue[]): boolean {
    return !issues.some((i) => i.severity === "error")
}

export default function MetadataChecklist({
    book,
    onCanAdvanceChange,
    onLoaded,
    onFailed,
}: Props) {
    const {t} = useI18n()
    const bookTypesSnapshot = useBookTypes()
    const contentModel = bookTypesSnapshot.types[book.book_type]?.content_model
    const [result, setResult] = useState<KdpMetadataCheckResult | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        api.kdp
            .checkMetadata(buildCheckPayload(book))
            .then((r) => {
                if (cancelled) return
                setResult(r)
                const filtered = filterIssuesForBookType(r.issues, contentModel)
                onCanAdvanceChange(isComplete(filtered))
                onLoaded?.(r, filtered)
            })
            .catch((e: Error) => {
                if (cancelled) return
                setError(e.message)
                onCanAdvanceChange(false)
                onFailed?.({
                    message: e.message,
                    context: "metadata",
                    retryable: true,
                })
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // book.id triggers a refetch when the user switches books
        // mid-session; book reference identity may change across
        // BookMetadataEditor reads, but the underlying id is what
        // determines which book's metadata we're checking.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book.id])

    if (loading) {
        return (
            <div
                style={styles.stepContent}
                data-testid="kdp-publishing-wizard-step-0-metadata"
            >
                <div style={styles.loadingRow}>
                    <Loader2
                        size={16}
                        style={{animation: "spin 1s linear infinite"}}
                    />
                    <span>
                        {t(
                            "ui.kdp_publishing_wizard.metadata_loading",
                            "Metadaten werden geprüft…",
                        )}
                    </span>
                </div>
            </div>
        )
    }

    if (error || !result) {
        return (
            <div
                style={styles.stepContent}
                data-testid="kdp-publishing-wizard-step-0-metadata"
            >
                <div
                    style={styles.errorBanner}
                    data-testid="kdp-publishing-wizard-step-0-error"
                >
                    {t(
                        "ui.kdp_publishing_wizard.metadata_check_failed",
                        "Metadaten-Prüfung fehlgeschlagen.",
                    )}{" "}
                    {error}
                </div>
            </div>
        )
    }

    const filtered = filterIssuesForBookType(result.issues, contentModel)
    const errors = filtered.filter((i) => i.severity === "error")
    const warnings = filtered.filter((i) => i.severity === "warning")
    const passed = isComplete(filtered)

    return (
        <div
            style={styles.stepContent}
            data-testid="kdp-publishing-wizard-step-0-metadata"
        >
            <p style={styles.hint}>
                {t(
                    "ui.kdp_publishing_wizard.metadata_hint",
                    "Pflichtfelder müssen ausgefüllt sein, bevor das Buch zu KDP hochgeladen werden kann. Warnungen sind Empfehlungen.",
                )}
            </p>

            <div
                style={passed ? styles.summaryOk : styles.summaryFail}
                data-testid={
                    passed
                        ? "kdp-publishing-wizard-step-0-summary-ok"
                        : "kdp-publishing-wizard-step-0-summary-fail"
                }
            >
                {passed ? (
                    <>
                        <CheckCircle size={16} />{" "}
                        {t(
                            "ui.kdp_publishing_wizard.metadata_summary_ok",
                            "Alle Pflichtfelder ausgefüllt.",
                        )}
                    </>
                ) : (
                    <>
                        <AlertCircle size={16} />{" "}
                        {t(
                            "ui.kdp_publishing_wizard.metadata_summary_fail",
                            "Es fehlen Pflichtfelder.",
                        )}
                    </>
                )}
                {warnings.length > 0 && (
                    <span
                        style={styles.summaryBadge}
                        data-testid="kdp-publishing-wizard-step-0-warning-count"
                    >
                        {warnings.length}{" "}
                        {t(
                            "ui.kdp_publishing_wizard.warning_label",
                            "Warnungen",
                        )}
                    </span>
                )}
            </div>

            {errors.length > 0 && (
                <ul
                    style={styles.issueList}
                    data-testid="kdp-publishing-wizard-step-0-error-list"
                >
                    {errors.map((issue, i) => (
                        <li
                            key={`err-${issue.field}-${i}`}
                            style={styles.errorRow}
                            data-testid={`kdp-publishing-wizard-step-0-error-${issue.field}`}
                        >
                            <AlertCircle size={14} />
                            <span style={styles.issueField}>{issue.field}</span>
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
                    data-testid="kdp-publishing-wizard-step-0-warning-list"
                >
                    {warnings.map((issue, i) => (
                        <li
                            key={`warn-${issue.field}-${i}`}
                            style={styles.warningRow}
                            data-testid={`kdp-publishing-wizard-step-0-warning-${issue.field}`}
                        >
                            <AlertTriangle size={14} />
                            <span style={styles.issueField}>{issue.field}</span>
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
    loadingRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--text-muted)",
        padding: "16px 0",
    },
    errorBanner: {
        background: "var(--danger-bg, rgba(239,68,68,0.1))",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
        padding: 12,
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
    summaryBadge: {
        marginLeft: "auto",
        padding: "2px 8px",
        borderRadius: "var(--radius-sm, 4px)",
        background: "var(--surface-2, var(--bg-secondary))",
        color: "var(--text-primary)",
        fontSize: "0.75rem",
    },
    issueList: {
        listStyle: "none",
        padding: 0,
        margin: "8px 0 16px",
        display: "grid",
        gap: 4,
    },
    errorRow: {
        display: "grid",
        gridTemplateColumns: "16px max-content 1fr",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "var(--danger-bg, rgba(239,68,68,0.06))",
        color: "var(--danger)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    warningRow: {
        display: "grid",
        gridTemplateColumns: "16px max-content 1fr",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "var(--warning-bg, rgba(234,179,8,0.06))",
        color: "var(--warning, #b45309)",
        borderRadius: "var(--radius-sm, 4px)",
        fontSize: "0.8125rem",
    },
    issueField: {
        fontWeight: 600,
        fontFamily: "var(--font-mono, monospace)",
    },
    issueMessage: {
        color: "var(--text-primary)",
    },
}
