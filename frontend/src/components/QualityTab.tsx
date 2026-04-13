/**
 * Quality tab for book metadata: per-chapter table with style and
 * readability metrics plus outlier markers with tooltips.
 *
 * Calls GET /api/ms-tools/metrics/{bookId} on mount and displays
 * a table with one row per chapter. Cells that exceed 2x the book
 * average are highlighted as outliers with explanatory tooltips.
 */

import {useEffect, useState} from "react"
import {api, ChapterMetric, ChapterMetricsResponse} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import Tooltip from "./Tooltip"

interface Props {
    bookId: string
}

const OUTLIER_FACTOR = 2.0

function isOutlier(value: number, avg: number): boolean {
    if (avg <= 0) return false
    return value > avg * OUTLIER_FACTOR
}

export default function QualityTab({bookId}: Props) {
    const {t} = useI18n()
    const [data, setData] = useState<ChapterMetricsResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const loadMetrics = async () => {
        setLoading(true)
        setError("")
        try {
            const result = await api.msTools.chapterMetrics(bookId)
            setData(result)
        } catch {
            setError(t("ui.metadata.quality_error", "Qualitaetsanalyse fehlgeschlagen"))
        }
        setLoading(false)
    }

    useEffect(() => {
        loadMetrics()
    }, [bookId])

    if (loading) {
        return <p style={{color: "var(--text-muted)", padding: 16}}>{t("ui.common.loading", "Laden...")}</p>
    }

    if (error) {
        return <p style={{color: "var(--danger)", padding: 16}}>{error}</p>
    }

    if (!data || data.chapters.length === 0) {
        return <p style={{color: "var(--text-muted)", padding: 16}}>{t("ui.metadata.quality_empty", "Keine Kapitel mit Textinhalt.")}</p>
    }

    const avg = data.averages
    const nonEmpty = data.chapters.filter((ch) => !ch.empty)

    return (
        <div>
            {/* Summary */}
            <div style={styles.summary}>
                <SummaryItem label={t("ui.metadata.quality_chapters", "Kapitel")} value={String(nonEmpty.length)} />
                <SummaryItem label={t("ui.editor.words", "Woerter")} value={String(nonEmpty.reduce((s, c) => s + c.word_count, 0))} />
                <SummaryItem
                    label={t("ui.metadata.quality_avg_readability", "Lesbarkeit (Ø)")}
                    value={avg.flesch_reading_ease ? avg.flesch_reading_ease.toFixed(1) : "-"}
                />
                <SummaryItem
                    label={t("ui.metadata.quality_avg_filler", "Fuellwoerter (Ø)")}
                    value={avg.filler_ratio ? `${(avg.filler_ratio * 100).toFixed(1)}%` : "-"}
                />
            </div>

            {/* Refresh button */}
            <button className="btn btn-ghost btn-sm" onClick={loadMetrics} style={{marginBottom: 12, fontSize: "0.8125rem"}}>
                {t("ui.metadata.quality_refresh", "Aktualisieren")}
            </button>

            {/* Chapter table */}
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>#</th>
                            <th style={{...styles.th, textAlign: "left"}}>{t("ui.metadata.quality_col_chapter", "Kapitel")}</th>
                            <th style={styles.th}>{t("ui.editor.words", "Woerter")}</th>
                            <th style={styles.th}>{t("ui.metadata.quality_col_sentences", "Saetze")}</th>
                            <th style={styles.th}>Flesch</th>
                            <th style={styles.th}>{t("ui.metadata.quality_col_filler", "Fuell %")}</th>
                            <th style={styles.th}>{t("ui.metadata.quality_col_passive", "Passiv %")}</th>
                            <th style={styles.th}>{t("ui.metadata.quality_col_adverb", "Adv %")}</th>
                            <th style={styles.th}>{t("ui.metadata.quality_col_long", "Lange Saetze")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.chapters.map((ch) => (
                            <ChapterRow key={ch.chapter_id} ch={ch} avg={avg} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function SummaryItem({label, value}: {label: string; value: string}) {
    return (
        <div style={styles.summaryItem}>
            <div style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>{label}</div>
            <div style={{fontSize: "1.125rem", fontWeight: 600}}>{value}</div>
        </div>
    )
}

function ChapterRow({ch, avg}: {ch: ChapterMetric; avg: Record<string, number>}) {
    const {t} = useI18n()

    if (ch.empty) {
        return (
            <tr style={styles.emptyRow}>
                <td style={styles.td}>{ch.position + 1}</td>
                <td style={{...styles.td, textAlign: "left", color: "var(--text-muted)"}}>{ch.chapter}</td>
                <td colSpan={7} style={{...styles.td, color: "var(--text-muted)", fontStyle: "italic"}}>-</td>
            </tr>
        )
    }

    return (
        <tr>
            <td style={styles.td}>{ch.position + 1}</td>
            <td style={{...styles.td, textAlign: "left", fontWeight: 500}}>{ch.chapter}</td>
            <MetricCell
                value={ch.word_count}
                display={String(ch.word_count)}
                avg={avg.word_count}
                factor={3}
                tooltip={t("ui.metadata.quality_tip_words", "Deutlich mehr Woerter als der Buchdurchschnitt ({avg}). Kapitel eventuell aufteilen.")
                    .replace("{avg}", Math.round(avg.word_count || 0).toString())}
            />
            <td style={styles.td}>{ch.sentence_count}</td>
            <td style={styles.td}>{ch.flesch_reading_ease.toFixed(0)}</td>
            <MetricCell
                value={ch.filler_ratio}
                display={`${(ch.filler_ratio * 100).toFixed(1)}`}
                avg={avg.filler_ratio}
                tooltip={t("ui.metadata.quality_tip_filler", "Fuellwortanteil ueber dem Buchdurchschnitt ({avg}%). Fuellwoerter reduzieren.")
                    .replace("{avg}", ((avg.filler_ratio || 0) * 100).toFixed(1))}
            />
            <MetricCell
                value={ch.passive_ratio}
                display={`${(ch.passive_ratio * 100).toFixed(1)}`}
                avg={avg.passive_ratio}
                tooltip={t("ui.metadata.quality_tip_passive", "Passivanteil ueber dem Buchdurchschnitt ({avg}%). Aktive Formulierungen bevorzugen.")
                    .replace("{avg}", ((avg.passive_ratio || 0) * 100).toFixed(1))}
            />
            <MetricCell
                value={ch.adverb_ratio}
                display={`${(ch.adverb_ratio * 100).toFixed(1)}`}
                avg={avg.adverb_ratio}
                tooltip={t("ui.metadata.quality_tip_adverb", "Adverbanteil ueber dem Buchdurchschnitt ({avg}%). Staerkere Verben statt Adverb+schwaches Verb.")
                    .replace("{avg}", ((avg.adverb_ratio || 0) * 100).toFixed(1))}
            />
            <MetricCell
                value={ch.long_sentence_count}
                display={String(ch.long_sentence_count)}
                avg={avg.long_sentence_count}
                tooltip={t("ui.metadata.quality_tip_long", "Mehr lange Saetze als der Buchdurchschnitt ({avg}). Saetze kuerzen oder aufteilen.")
                    .replace("{avg}", Math.round(avg.long_sentence_count || 0).toString())}
            />
        </tr>
    )
}

function MetricCell({value, display, avg, tooltip, factor = OUTLIER_FACTOR}: {
    value: number;
    display: string;
    avg: number;
    tooltip: string;
    factor?: number;
}) {
    const flagged = isOutlier(value, avg)

    if (!flagged) {
        return <td style={styles.td}>{display}</td>
    }

    return (
        <td style={styles.tdOutlier}>
            <Tooltip content={tooltip} side="top">
                <span style={styles.outlierValue} tabIndex={0}>{display}</span>
            </Tooltip>
        </td>
    )
}

const styles: Record<string, React.CSSProperties> = {
    summary: {
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
    },
    summaryItem: {
        minWidth: 100,
    },
    tableContainer: {
        overflowX: "auto",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.8125rem",
    },
    th: {
        padding: "8px 10px",
        textAlign: "center",
        fontWeight: 600,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        borderBottom: "2px solid var(--border)",
        whiteSpace: "nowrap",
    },
    td: {
        padding: "6px 10px",
        textAlign: "center",
        borderBottom: "1px solid var(--border)",
    },
    tdOutlier: {
        padding: "6px 10px",
        textAlign: "center",
        borderBottom: "1px solid var(--border)",
        background: "rgba(251, 146, 60, 0.15)",
    },
    outlierValue: {
        fontWeight: 600,
        cursor: "help",
        borderBottom: "1px dashed rgba(251, 146, 60, 0.6)",
        paddingBottom: 1,
    },
    emptyRow: {
        opacity: 0.5,
    },
}
