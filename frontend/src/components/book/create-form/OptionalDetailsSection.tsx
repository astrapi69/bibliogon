/**
 * Stage-2 collapsible "Weitere Details" section for CreateBookForm:
 * genre, subtitle, description, language and the optional series fields.
 * Extracted from CreateBookForm.tsx (#677); data-testids + inline field
 * behaviour unchanged.
 */

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EnhancedTextarea } from "../../textarea/EnhancedTextarea";
import { ComboboxSelect } from "../../../lib/components/ComboboxSelect";
import { buildBookLanguageOptions } from "../../../lib/bookLanguages";
import styles from "../../CreateBookForm.module.css";

type T = (key: string, fallback: string) => string;

export function OptionalDetailsSection({
  t,
  detailsOpen,
  onDetailsOpenChange,
  genre,
  onGenreChange,
  subtitle,
  onSubtitleChange,
  description,
  onDescriptionChange,
  language,
  customLanguages,
  onLanguageChange,
  onCustomLanguageAdd,
  isSeries,
  onSeriesToggle,
  series,
  onSeriesChange,
  seriesIndex,
  onSeriesIndexChange,
}: {
  t: T;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  genre: string;
  onGenreChange: (value: string) => void;
  subtitle: string;
  onSubtitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  language: string;
  customLanguages: string[];
  onLanguageChange: (value: string) => void;
  onCustomLanguageAdd: (value: string) => void;
  isSeries: boolean;
  onSeriesToggle: (checked: boolean) => void;
  series: string;
  onSeriesChange: (value: string) => void;
  seriesIndex: string;
  onSeriesIndexChange: (value: string) => void;
}) {
  return (
    <Collapsible.Root open={detailsOpen} onOpenChange={onDetailsOpenChange}>
      <Collapsible.Trigger asChild>
        <button
          className={styles.detailsToggle}
          data-testid="create-book-more-details"
        >
          {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {t("ui.create_book.more_details", "Weitere Details")}
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className={styles.detailsSection}>
          <div className="field">
            <label className="label">{t("ui.create_book.genre", "Genre")}</label>
            <input
              className="input"
              list="genre-suggestions"
              value={genre}
              onChange={(e) => onGenreChange(e.target.value)}
              placeholder={t(
                "ui.create_book.genre_placeholder",
                "Genre wählen oder eingeben...",
              )}
            />
            <datalist id="genre-suggestions">
              {[
                t("ui.genres.novel", "Roman"),
                t("ui.genres.non_fiction", "Sachbuch"),
                t("ui.genres.technical", "Fachbuch"),
                t("ui.genres.children", "Kinderbuch"),
                t("ui.genres.biography", "Biografie"),
                t("ui.genres.poetry", "Lyrik"),
                t("ui.genres.short_stories", "Kurzgeschichten"),
                t("ui.genres.academic", "Wissenschaftlich"),
                t("ui.genres.textbook", "Lehrbuch"),
                t("ui.genres.self_help", "Ratgeber"),
                t("ui.genres.fantasy", "Fantasy"),
                t("ui.genres.thriller", "Thriller"),
                t("ui.genres.romance", "Liebesroman"),
                t("ui.genres.cookbook", "Kochbuch"),
                t("ui.genres.travel", "Reisefuehrer"),
              ].map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label className="label">
              {t("ui.create_book.subtitle", "Untertitel")}
            </label>
            <input
              className="input"
              value={subtitle}
              onChange={(e) => onSubtitleChange(e.target.value)}
              placeholder={t("ui.create_book.subtitle_placeholder", "Optional")}
            />
          </div>

          <div className="field">
            <label className="label">
              {t("ui.create_book.description", "Beschreibung")}
            </label>
            <EnhancedTextarea
              value={description}
              onChange={onDescriptionChange}
              placeholder={t(
                "ui.create_book.description_placeholder",
                "Kurze Beschreibung (optional)",
              )}
              rows={3}
              ariaLabel={t("ui.create_book.description", "Beschreibung")}
              testid="create-book-description"
            />
          </div>

          <div className="field">
            <label className="label">
              {t("ui.create_book.language", "Sprache")}
            </label>
            <ComboboxSelect
              options={buildBookLanguageOptions(customLanguages)}
              value={language}
              onChange={onLanguageChange}
              allowCustom
              onCustomAdd={onCustomLanguageAdd}
              testId="create-book-language"
            />
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isSeries}
              onChange={(e) => onSeriesToggle(e.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            {t("ui.create_book.is_series", "Teil einer Serie")}
          </label>

          {isSeries && (
            <div className={styles.row}>
              <div className="field" style={{ flex: 2 }}>
                <label className="label">
                  {t("ui.create_book.series", "Reihe")}
                </label>
                <input
                  className="input"
                  value={series}
                  onChange={(e) => onSeriesChange(e.target.value)}
                  placeholder={t(
                    "ui.create_book.series_placeholder",
                    "z.B. Das unsterbliche Muster",
                  )}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="label">
                  {t("ui.create_book.volume", "Band")}
                </label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={seriesIndex}
                  onChange={(e) => onSeriesIndexChange(e.target.value)}
                  placeholder={t("ui.create_book.volume_placeholder", "Nr.")}
                />
              </div>
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
