/**
 * Quality tab for book metadata: per-chapter table with style and
 * readability metrics plus outlier markers with tooltips.
 *
 * Navigable metrics (filler, passive, adverb, long sentence) render
 * as buttons that ask the parent to open the chapter at the first
 * matching finding. Aggregate metrics (words, sentences, Flesch)
 * stay plain text - there is no single location to jump to.
 */

import {useEffect, useState, type ReactNode} from "react"
import {FileText, FileDown, Info} from "lucide-react"
import {api, ChapterMetric, ChapterMetricsResponse} from "../api/client"
import {useI18n} from "../hooks/useI18n"
import Tooltip from "./Tooltip"
import {LoadingIndicator} from "./LoadingIndicator"
import {CollapsibleConfigSection} from "./CollapsibleConfigSection"
import {rankSentences, sentenceAnchor} from "../lib/utils/sentenceComplexity"
import MetricsTable, {type MetricColumn} from "../lib/components/MetricsTable"
import FleschScale from "../lib/components/FleschScale"
import {
    FLESCH_THRESHOLD,
    FILLER_PCT_THRESHOLD,
    PASSIVE_PCT_THRESHOLD,
    LONG_SENTENCE_THRESHOLD,
} from "./qualityThresholds"
import {slugify} from "../shared/utils/slugify"
import {downloadBlob} from "../shared/utils/downloadBlob"
import {toPdfBlob} from "../export/formatPdf"
import {
    buildQualityReportMarkdown,
    buildQualityReportDocument,
    type QualityReportLabels,
} from "./qualityReport"
import {notify} from "../utils/notify"
import styles from "./QualityTab.module.css"

export type NavigableFindingType = "filler_word" | "passive_voice" | "adverb" | "long_sentence"

interface Props {
    bookId: string
    bookTitle?: string
    onNavigateToIssue?: (chapterId: string, findingType: NavigableFindingType) => void
}

const OUTLIER_FACTOR = 2.0

/** Honest description of what the word count includes (#286). Matches the
 *  backend extractor: every text node (headings included), formatting marks
 *  excluded. */
const WORD_COUNT_NOTE =
    "Gezählt werden alle Wörter im Fließtext inklusive Überschriften. Textformatierung wird nicht mitgezählt; die Zahl kann leicht von anderen Editoren abweichen."

/** Honest scope statement: the report checks style, not content (#287). */
const DISCLAIMER_NOTE =
    "Dieser Bericht analysiert stilistische Merkmale Ihres Textes. Er ersetzt kein inhaltliches Lektorat. Argumentationsgüte, Faktentreue, Tonkonsistenz und Kapitelstruktur werden nicht geprüft."

function isOutlier(value: number, avg: number): boolean {
    if (avg <= 0) return false
    return value > avg * OUTLIER_FACTOR
}

export default function QualityTab({bookId, bookTitle, onNavigateToIssue}: Props) {
    const {t} = useI18n()
    const [data, setData] = useState<ChapterMetricsResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [exporting, setExporting] = useState(false)

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

    const reportLabels = (): QualityReportLabels => ({
        title: t("ui.metadata.quality_report_title", "Qualitaetsbericht"),
        chapters: t("ui.metadata.quality_chapters", "Kapitel"),
        words: t("ui.editor.words", "Woerter"),
        avgReadability: t("ui.metadata.quality_avg_readability", "Lesbarkeit (Ø)"),
        avgFiller: t("ui.metadata.quality_avg_filler", "Fuellwoerter (Ø)"),
        colChapter: t("ui.metadata.quality_col_chapter", "Kapitel"),
        colSentences: t("ui.metadata.quality_col_sentences", "Saetze"),
        colFiller: t("ui.metadata.quality_col_filler", "Fuell %"),
        colPassive: t("ui.metadata.quality_col_passive", "Passiv %"),
        colAdverb: t("ui.metadata.quality_col_adverb", "Adv %"),
        colLong: t("ui.metadata.quality_col_long", "Lange Saetze"),
        flesch: "Flesch",
        nestedTitle: t("ui.metadata.quality_nested_title", "Schachtelsatz-Kandidaten"),
        nestedWords: t("ui.metadata.quality_nested_words", "{count} Wörter"),
        nestedClauses: t("ui.metadata.quality_nested_clauses", "{count} Nebensätze"),
        wordCountNote: t("ui.metadata.quality_wordcount_info", WORD_COUNT_NOTE),
        disclaimer: t("ui.metadata.quality_disclaimer", DISCLAIMER_NOTE),
    })

    const reportSlug = (): string =>
        `${slugify(bookTitle || data?.book_title || "") || "buch"}-${slugify(
            t("ui.metadata.quality_report_title", "Qualitaetsbericht"),
        ) || "qualitaetsbericht"}`

    const handleDownloadMarkdown = () => {
        if (!data) return
        const markdown = buildQualityReportMarkdown(data, reportLabels())
        downloadBlob(
            new Blob([markdown], {type: "text/markdown;charset=utf-8"}),
            `${reportSlug()}.md`,
        )
    }

    const handleDownloadPdf = async () => {
        if (!data) return
        setExporting(true)
        try {
            const blob = await toPdfBlob(buildQualityReportDocument(data, reportLabels()))
            downloadBlob(blob, `${reportSlug()}.pdf`)
        } catch (err) {
            notify.error(
                t("ui.metadata.quality_pdf_failed", "PDF-Export fehlgeschlagen"),
                err,
            )
        }
        setExporting(false)
    }

    if (loading) {
        return <LoadingIndicator testId="quality-tab-loading" variant="block" label={t("ui.common.loading", "Laden...")} />
    }

    if (error) {
        return <p style={{color: "var(--danger)", padding: 16}}>{error}</p>
    }

    if (!data || data.chapters.length === 0) {
        return <p style={{color: "var(--text-muted)", padding: 16}}>{t("ui.metadata.quality_empty", "Keine Kapitel mit Textinhalt.")}</p>
    }

    const avg = data.averages
    const nonEmpty = data.chapters.filter((ch) => !ch.empty)

    const navLabelTemplate = t(
        "ui.metadata.quality_nav_label",
        "Zu erstem Treffer ({metric}) in {chapter} springen",
    )
    const navLabel = (metric: string, chapter: string) =>
        navLabelTemplate.replace("{metric}", metric).replace("{chapter}", chapter)
    const fillTip = (key: string, fallback: string, ratio: number) =>
        t(key, fallback).replace("{avg}", (ratio * 100).toFixed(1))

    const colChapter = t("ui.metadata.quality_col_chapter", "Kapitel")
    const colWords = t("ui.editor.words", "Woerter")
    const colSentences = t("ui.metadata.quality_col_sentences", "Saetze")
    const colFiller = t("ui.metadata.quality_col_filler", "Fuell %")
    const colPassive = t("ui.metadata.quality_col_passive", "Passiv %")
    const colAdverb = t("ui.metadata.quality_col_adverb", "Adv %")
    const colLong = t("ui.metadata.quality_col_long", "Lange Saetze")

    const chapterColumns: MetricColumn<ChapterMetric>[] = [
        {
            key: "pos",
            label: "#",
            value: (ch) => ch.position + 1,
            format: (ch) => String(ch.position + 1),
        },
        {
            key: "chapter",
            label: colChapter,
            align: "left",
            value: (ch) => ch.chapter,
            format: (ch) => ch.chapter,
        },
        {
            key: "words",
            label: colWords,
            value: (ch) => (ch.empty ? 0 : ch.word_count),
            total: () => String(nonEmpty.reduce((s, c) => s + c.word_count, 0)),
            render: (ch) =>
                aggregateContent(ch, {
                    rawValue: ch.word_count,
                    display: String(ch.word_count),
                    avg: avg.word_count,
                    tooltip: t(
                        "ui.metadata.quality_tip_words",
                        "Deutlich mehr Woerter als der Buchdurchschnitt ({avg}). Kapitel eventuell aufteilen.",
                    ).replace("{avg}", Math.round(avg.word_count || 0).toString()),
                }),
        },
        {
            key: "sentences",
            label: colSentences,
            value: (ch) => (ch.empty ? 0 : ch.sentence_count),
            format: (ch) => (ch.empty ? "-" : String(ch.sentence_count)),
            total: () => String(nonEmpty.reduce((s, c) => s + c.sentence_count, 0)),
        },
        {
            key: "flesch",
            label: "Flesch",
            value: (ch) => (ch.empty ? 0 : ch.flesch_reading_ease),
            format: (ch) => (ch.empty ? "-" : ch.flesch_reading_ease.toFixed(0)),
            threshold: FLESCH_THRESHOLD,
            total: () =>
                avg.flesch_reading_ease ? avg.flesch_reading_ease.toFixed(1) : "-",
        },
        {
            key: "filler",
            label: colFiller,
            value: (ch) => (ch.empty ? 0 : ch.filler_ratio * 100),
            threshold: FILLER_PCT_THRESHOLD,
            total: () =>
                avg.filler_ratio ? (avg.filler_ratio * 100).toFixed(1) : "-",
            render: (ch) =>
                navButtonContent(ch, {
                    rawValue: ch.filler_ratio,
                    display: (ch.filler_ratio * 100).toFixed(1),
                    avg: avg.filler_ratio,
                    tooltip: fillTip(
                        "ui.metadata.quality_tip_filler",
                        "Fuellwortanteil über dem Buchdurchschnitt ({avg}%). Fuellwoerter reduzieren.",
                        avg.filler_ratio || 0,
                    ),
                    ariaLabel: navLabel(colFiller, ch.chapter),
                    onClick: onNavigateToIssue
                        ? () => onNavigateToIssue(ch.chapter_id, "filler_word")
                        : undefined,
                }),
        },
        {
            key: "passive",
            label: colPassive,
            value: (ch) => (ch.empty ? 0 : ch.passive_ratio * 100),
            threshold: PASSIVE_PCT_THRESHOLD,
            total: () =>
                avg.passive_ratio ? (avg.passive_ratio * 100).toFixed(1) : "-",
            render: (ch) =>
                navButtonContent(ch, {
                    rawValue: ch.passive_ratio,
                    display: (ch.passive_ratio * 100).toFixed(1),
                    avg: avg.passive_ratio,
                    tooltip: fillTip(
                        "ui.metadata.quality_tip_passive",
                        "Passivanteil über dem Buchdurchschnitt ({avg}%). Aktive Formulierungen bevorzugen.",
                        avg.passive_ratio || 0,
                    ),
                    ariaLabel: navLabel(colPassive, ch.chapter),
                    onClick: onNavigateToIssue
                        ? () => onNavigateToIssue(ch.chapter_id, "passive_voice")
                        : undefined,
                }),
        },
        {
            key: "adverb",
            label: colAdverb,
            value: (ch) => (ch.empty ? 0 : ch.adverb_ratio * 100),
            total: () =>
                avg.adverb_ratio ? (avg.adverb_ratio * 100).toFixed(1) : "-",
            render: (ch) =>
                navButtonContent(ch, {
                    rawValue: ch.adverb_ratio,
                    display: (ch.adverb_ratio * 100).toFixed(1),
                    avg: avg.adverb_ratio,
                    tooltip: fillTip(
                        "ui.metadata.quality_tip_adverb",
                        "Adverbanteil über dem Buchdurchschnitt ({avg}%). Staerkere Verben statt Adverb+schwaches Verb.",
                        avg.adverb_ratio || 0,
                    ),
                    ariaLabel: navLabel(colAdverb, ch.chapter),
                    onClick: onNavigateToIssue
                        ? () => onNavigateToIssue(ch.chapter_id, "adverb")
                        : undefined,
                }),
        },
        {
            key: "long",
            label: colLong,
            value: (ch) => (ch.empty ? 0 : ch.long_sentence_count),
            threshold: LONG_SENTENCE_THRESHOLD,
            total: () =>
                avg.long_sentence_count
                    ? avg.long_sentence_count.toFixed(1)
                    : "-",
            render: (ch) =>
                navButtonContent(ch, {
                    rawValue: ch.long_sentence_count,
                    display: String(ch.long_sentence_count),
                    avg: avg.long_sentence_count,
                    tooltip: t(
                        "ui.metadata.quality_tip_long",
                        "Mehr lange Saetze als der Buchdurchschnitt ({avg}). Saetze kuerzen oder aufteilen.",
                    ).replace(
                        "{avg}",
                        Math.round(avg.long_sentence_count || 0).toString(),
                    ),
                    ariaLabel: navLabel(colLong, ch.chapter),
                    onClick: onNavigateToIssue
                        ? () => onNavigateToIssue(ch.chapter_id, "long_sentence")
                        : undefined,
                }),
        },
    ]

    return (
        <div>
            {/* Report downloads */}
            <div className="mb-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    onClick={handleDownloadMarkdown}
                    data-testid="quality-download-md"
                >
                    <FileText size={14} />{" "}
                    {t("ui.metadata.quality_download_md", "Bericht (.md)")}
                </button>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm min-h-[44px]"
                    onClick={handleDownloadPdf}
                    disabled={exporting}
                    data-testid="quality-download-pdf"
                >
                    <FileDown size={14} />{" "}
                    {exporting
                        ? t("ui.common.loading", "Laden...")
                        : t("ui.metadata.quality_download_pdf", "Bericht (.pdf)")}
                </button>
            </div>

            {/* Summary */}
            <div className={styles.summary}>
                <SummaryItem label={t("ui.metadata.quality_chapters", "Kapitel")} value={String(nonEmpty.length)} />
                <SummaryItem
                    label={t("ui.editor.words", "Woerter")}
                    value={String(nonEmpty.reduce((s, c) => s + c.word_count, 0))}
                    info={t("ui.metadata.quality_wordcount_info", WORD_COUNT_NOTE)}
                />
                <SummaryItem
                    label={t("ui.metadata.quality_avg_readability", "Lesbarkeit (Ø)")}
                    value={avg.flesch_reading_ease ? avg.flesch_reading_ease.toFixed(1) : "-"}
                />
                <SummaryItem
                    label={t("ui.metadata.quality_avg_filler", "Fuellwoerter (Ø)")}
                    value={avg.filler_ratio ? `${(avg.filler_ratio * 100).toFixed(1)}%` : "-"}
                />
            </div>

            {/* Flesch benchmark scale (#285) */}
            {avg.flesch_reading_ease ? (
                <FleschScale
                    score={avg.flesch_reading_ease}
                    labels={{
                        bands: {
                            easy: t("ui.metadata.quality_flesch_band_easy", "Einfach"),
                            readable: t("ui.metadata.quality_flesch_band_readable", "Verständlich"),
                            demanding: t("ui.metadata.quality_flesch_band_demanding", "Anspruchsvoll"),
                            academic: t("ui.metadata.quality_flesch_band_academic", "Akademisch"),
                        },
                        genres: {
                            fiction: t("ui.metadata.quality_genre_fiction", "Belletristik"),
                            nonfiction: t("ui.metadata.quality_genre_nonfiction", "Sachbuch"),
                            scientific: t("ui.metadata.quality_genre_scientific", "Wissenschaft"),
                            children: t("ui.metadata.quality_genre_children", "Kinderbuch"),
                        },
                        yourBook: t("ui.metadata.quality_flesch_your_book", "Ihr Buch"),
                        comparison: t("ui.metadata.quality_flesch_comparison", "Vergleich"),
                    }}
                />
            ) : null}

            {/* Refresh button */}
            <button className="btn btn-ghost btn-sm" onClick={loadMetrics} style={{marginBottom: 12, fontSize: "0.8125rem"}}>
                {t("ui.metadata.quality_refresh", "Aktualisieren")}
            </button>

            {/* Chapter comparison table: color-coded, sortable, totals (#284) */}
            <MetricsTable
                rows={data.chapters}
                columns={chapterColumns}
                getRowKey={(ch) => ch.chapter_id}
                totalsLabel={t("ui.metadata.quality_total", "Gesamt")}
                colorRow={(ch) => !ch.empty}
                rowClassName={(ch) => (ch.empty ? styles.emptyRow : undefined)}
                testId="quality-table"
            />

            {/* Word-count transparency footnote (#286) */}
            <p
                className="mt-2 text-xs"
                style={{color: "var(--text-muted)"}}
                data-testid="quality-wordcount-note"
            >
                {t("ui.metadata.quality_wordcount_info", WORD_COUNT_NOTE)}
            </p>

            <NestedSentenceCandidates chapters={data.chapters} />

            {/* Analysis-scope disclaimer (#287) */}
            <aside className={styles.disclaimer} data-testid="quality-disclaimer">
                <Info size={14} aria-hidden style={{flexShrink: 0, marginTop: 2}} />
                <span>{t("ui.metadata.quality_disclaimer", DISCLAIMER_NOTE)}</span>
            </aside>
        </div>
    )
}

/** Per-chapter list of the longest / most complex sentences (#283).
 *  Each chapter folds into a collapsible (default collapsed) so the
 *  report stays compact; the entries are ranked client-side by the
 *  shared sentenceComplexity util from the full sentence texts the
 *  backend supplies. */
function NestedSentenceCandidates({chapters}: {chapters: ChapterMetric[]}) {
    const {t} = useI18n()
    const withSentences = chapters.filter(
        (ch) => !ch.empty && (ch.long_sentences?.length ?? 0) > 0,
    )
    if (withSentences.length === 0) return null

    return (
        <section className="mt-6" data-testid="nested-sentence-candidates">
            <h3 className="text-sm font-semibold mb-1">
                {t("ui.metadata.quality_nested_title", "Schachtelsatz-Kandidaten")}
            </h3>
            <p className="text-xs mb-2" style={{color: "var(--text-muted)"}}>
                {t(
                    "ui.metadata.quality_nested_hint",
                    "Diese Sätze könnten von einer Aufteilung profitieren.",
                )}
            </p>
            <div className="flex flex-col gap-1">
                {withSentences.map((ch) => {
                    const ranked = rankSentences(
                        (ch.long_sentences ?? []).map((s) => s.text),
                        10,
                    )
                    return (
                        <CollapsibleConfigSection
                            key={ch.chapter_id}
                            storageKey={`bibliogon-collapsible-quality-nested-${ch.chapter_id}`}
                            heading={`${ch.chapter} (${ranked.length})`}
                            testidPrefix={`nested-${ch.chapter_id}`}
                            defaultOpen={false}
                        >
                            <ol className="m-0 mt-1 mb-2 list-decimal pl-5 flex flex-col gap-1">
                                {ranked.map((s, i) => (
                                    <li key={i} className="text-xs leading-snug">
                                        <span>„{sentenceAnchor(s.text)}"</span>
                                        <span style={{color: "var(--text-muted)"}}>
                                            {" — "}
                                            {t("ui.metadata.quality_nested_words", "{count} Wörter")
                                                .replace("{count}", String(s.wordCount))}
                                            {" · "}
                                            {t("ui.metadata.quality_nested_clauses", "{count} Nebensätze")
                                                .replace("{count}", String(s.clauseCount))}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </CollapsibleConfigSection>
                    )
                })}
            </div>
        </section>
    )
}

function SummaryItem({label, value, info}: {label: string; value: string; info?: string}) {
    return (
        <div className={styles.summaryItem}>
            <div style={{fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4}}>
                {label}
                {info ? (
                    <Tooltip content={info} side="top">
                        <span tabIndex={0} aria-label={info} style={{display: "inline-flex", cursor: "help"}}>
                            <Info size={12} />
                        </span>
                    </Tooltip>
                ) : null}
            </div>
            <div style={{fontSize: "1.125rem", fontWeight: 600}}>{value}</div>
        </div>
    )
}

/** Content for a navigable metric cell: a button that jumps the editor to
 *  the first matching finding. The cell background traffic-light color is
 *  applied by MetricsTable via the column threshold; an above-2x-average
 *  value additionally shows the relative-comparison tooltip and emphasis.
 *  Empty chapters render a dash with no button. */
function navButtonContent(
    ch: ChapterMetric,
    opts: {
        rawValue: number;
        display: string;
        avg: number;
        tooltip: string;
        ariaLabel: string;
        onClick?: () => void;
    },
): ReactNode {
    if (ch.empty) return "-"
    const flagged = isOutlier(opts.rawValue, opts.avg)
    const button = (
        <button
            type="button"
            onClick={opts.onClick}
            disabled={!opts.onClick || opts.rawValue === 0}
            aria-label={opts.ariaLabel}
            className={`${styles.navButton} ${flagged ? styles.navButtonOutlier : ""}`}
        >
            {opts.display}
        </button>
    )
    if (flagged) {
        return (
            <Tooltip content={opts.tooltip} side="top">
                {button}
            </Tooltip>
        )
    }
    return button
}

/** Content for an aggregate (non-navigable) metric cell. Plain text, with a
 *  relative-comparison tooltip when the value is an outlier. Empty chapters
 *  render a dash. */
function aggregateContent(
    ch: ChapterMetric,
    opts: {rawValue: number; display: string; avg: number; tooltip: string},
): ReactNode {
    if (ch.empty) return "-"
    if (!isOutlier(opts.rawValue, opts.avg)) return opts.display
    return (
        <Tooltip content={opts.tooltip} side="top">
            <span className={styles.outlierValue} tabIndex={0}>
                {opts.display}
            </span>
        </Tooltip>
    )
}
