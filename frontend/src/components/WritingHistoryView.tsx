/**
 * Writing-History view body (WRITING-HISTORY-STATS-01), extracted from
 * the former WritingHistoryModal in the Dialog->Pages migration (C5).
 *
 * Global (not per-book) writing history: summary stats, a per-day bar
 * chart (recharts), a per-book breakdown that drills into per-chapter
 * totals, and a CSV export. Data from /api/writing-stats/* . Chrome-free:
 * the page (WritingHistoryPage) supplies the PageLayout shell + title +
 * Back; this component owns the window/stats state and self-fetches on
 * mount.
 */
import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Download, ChevronRight, ChevronDown } from "lucide-react";
import {
  api,
  type WritingStatsSummary,
  type WritingBookStats,
  type WritingChapterStats,
} from "../api/client";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./WritingHistoryView.module.css";

const WINDOWS = [30, 90, 365] as const;

export default function WritingHistoryView() {
  const { t } = useI18n();
  const [days, setDays] = useState<number>(90);
  const [summary, setSummary] = useState<WritingStatsSummary | null>(null);
  const [books, setBooks] = useState<WritingBookStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedBook, setExpandedBook] = useState<string | null>(null);
  const [chapters, setChapters] = useState<WritingChapterStats[] | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setExpandedBook(null);
    setChapters(null);
    try {
      const [summaryData, bookData] = await Promise.all([
        api.writingStats.summary(days),
        api.writingStats.byBook(days),
      ]);
      setSummary(summaryData);
      setBooks(bookData);
    } catch {
      notify.error(
        t(
          "ui.writing_stats.load_failed",
          "Schreibverlauf konnte nicht geladen werden.",
        ),
      );
    } finally {
      setLoading(false);
    }
    // ``t`` excluded deliberately: it is only read in the failure toast
    // and the i18n provider is not memoised under test, which would
    // refire this effect endlessly (see ChapterVersionsModal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleBook = async (bookId: string) => {
    if (expandedBook === bookId) {
      setExpandedBook(null);
      setChapters(null);
      return;
    }
    setExpandedBook(bookId);
    setChapters(null);
    try {
      setChapters(await api.writingStats.byChapter(bookId, days));
    } catch {
      notify.error(
        t(
          "ui.writing_stats.chapters_failed",
          "Kapitel-Aufschlüsselung fehlgeschlagen.",
        ),
      );
    }
  };

  const maxBookWords =
    books?.reduce((m, b) => Math.max(m, b.total_words), 0) || 1;

  return (
    <div data-testid="writing-history-view">
      <div className={styles.controls}>
        <div className={styles.windowButtons} role="group">
          {WINDOWS.map((w) => (
            <button
              key={w}
              className={`btn btn-sm ${days === w ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setDays(w)}
              data-testid={`writing-history-window-${w}`}
            >
              {t("ui.writing_stats.last_n_days", "Last {n} days").replace(
                "{n}",
                String(w),
              )}
            </button>
          ))}
        </div>
        <a
          className="btn btn-secondary btn-sm"
          href={api.writingStats.exportCsvUrl(days)}
          data-testid="writing-history-export-csv"
        >
          <Download size={14} aria-hidden />
          {t("ui.writing_stats.export_csv", "CSV exportieren")}
        </a>
      </div>

      {loading ? (
        <LoadingIndicator
          testId="writing-history-loading"
          variant="block"
          label={t("ui.common.loading", "Laden...")}
        />
      ) : summary ? (
        <>
          <div
            className={styles.summaryCards}
            data-testid="writing-history-summary"
          >
            <SummaryCard
              label={t("ui.writing_stats.total_words", "Wörter gesamt")}
              value={summary.total_words}
            />
            <SummaryCard
              label={t("ui.writing_stats.days_active", "Aktive Tage")}
              value={summary.days_active}
            />
            <SummaryCard
              label={t("ui.writing_stats.avg_per_day", "Ø pro aktivem Tag")}
              value={summary.avg_per_active_day}
            />
            <SummaryCard
              label={t("ui.writing_stats.current_streak", "Aktuelle Serie")}
              value={summary.current_streak}
            />
            <SummaryCard
              label={t("ui.writing_stats.longest_streak", "Längste Serie")}
              value={summary.longest_streak}
            />
          </div>

          {summary.daily.length > 0 ? (
            <div className={styles.chart} data-testid="writing-history-chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.daily}>
                  <XAxis dataKey="day" hide />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="words_written" fill="var(--accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p
              className={styles.emptyState}
              data-testid="writing-history-empty"
            >
              {t(
                "ui.writing_stats.empty",
                "Noch kein Schreibverlauf in diesem Zeitraum.",
              )}
            </p>
          )}

          {books && books.length > 0 ? (
            <div className={styles.byBook} data-testid="writing-history-by-book">
              <h3 className={styles.sectionTitle}>
                {t("ui.writing_stats.by_book", "Nach Buch")}
              </h3>
              <ul className={styles.bookList}>
                {books.map((book) => (
                  <li key={book.book_id} className={styles.bookItem}>
                    <button
                      className={styles.bookRow}
                      onClick={() => void toggleBook(book.book_id)}
                      data-testid={`writing-history-book-${book.book_id}`}
                    >
                      {expandedBook === book.book_id ? (
                        <ChevronDown size={14} aria-hidden />
                      ) : (
                        <ChevronRight size={14} aria-hidden />
                      )}
                      <span className={styles.bookTitle}>{book.book_title}</span>
                      <span
                        className={styles.bookBar}
                        style={{
                          width: `${(book.total_words / maxBookWords) * 100}%`,
                        }}
                        aria-hidden
                      />
                      <span className={styles.bookWords}>{book.total_words}</span>
                    </button>
                    {expandedBook === book.book_id && chapters ? (
                      <ul
                        className={styles.chapterList}
                        data-testid={`writing-history-chapters-${book.book_id}`}
                      >
                        {chapters.map((ch, i) => (
                          <li
                            key={ch.chapter_id ?? `deleted-${i}`}
                            className={styles.chapterRow}
                          >
                            <span className={styles.chapterTitle}>
                              {ch.chapter_title ||
                                t(
                                  "ui.writing_stats.deleted_chapters",
                                  "Gelöschte Kapitel",
                                )}
                            </span>
                            <span className={styles.chapterWords}>
                              {ch.total_words}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        // summary === null while not loading means the fetch failed (or
        // returned nothing). Never leave the body blank.
        <p className={styles.emptyState} data-testid="writing-history-empty">
          {t("ui.writing_stats.empty", "No writing history in this period yet.")}
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={`card ${styles.summaryCard}`}>
      <span className={styles.summaryValue}>{value.toLocaleString()}</span>
      <span className={styles.summaryLabel}>{label}</span>
    </div>
  );
}
