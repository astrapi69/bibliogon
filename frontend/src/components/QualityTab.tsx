/**
 * Quality tab for book metadata: per-chapter table with style and
 * readability metrics plus outlier markers.
 *
 * Calls GET /api/ms-tools/metrics/{bookId} on mount and displays
 * a table with one row per chapter. Cells that exceed 2x the book
 * average are highlighted as outliers.
 */

import {useEffect, useState} from "react"
import {api, ChapterMetric, ChapterMetricsResponse} from "../api/client"
import {useI18n} from "../hooks/useI18n"

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
            <td style={cellStyle(ch.word_count, avg.word_count, 3)}>{ch.word_count}</td>
            <td style={styles.td}>{ch.sentence_count}</td>
            <td style={styles.td}>{ch.flesch_reading_ease.toFixed(0)}</td>
            <td style={cellStyle(ch.filler_ratio, avg.filler_ratio)}>{(ch.filler_ratio * 100).toFixed(1)}</td>
            <td style={cellStyle(ch.passive_ratio, avg.passive_ratio)}>{(ch.passive_ratio * 100).toFixed(1)}</td>
            <td style={cellStyle(ch.adverb_ratio, avg.adverb_ratio)}>{(ch.adverb_ratio * 100).toFixed(1)}</td>
            <td style={cellStyle(ch.long_sentence_count, avg.long_sentence_count)}>{ch.long_sentence_count}</td>
        </tr>
    )
}

function cellStyle(value: number, avg: number, factor: number = OUTLIER_FACTOR): React.CSSProperties {
    if (isOutlier(value, avg)) {
        return {...styles.td, background: "rgba(251, 146, 60, 0.15)", color: "var(--text-primary)", fontWeight: 600}
    }
    return styles.td
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
    emptyRow: {
        opacity: 0.5,
    },
}
