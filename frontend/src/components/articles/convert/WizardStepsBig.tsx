/**
 * The two large form steps of the Article-to-Book wizard (#207 god-file
 * split): Step 0 (article selection + drag-reorder + tag helpers) and
 * Step 1 (book metadata). Split out of WizardSteps.tsx to keep every step
 * file under 500 lines. Each component is driven by the
 * `useConvertToBookWizard` return; data-testids are unchanged.
 */

import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { BookFromArticlesSortStrategy } from "../../../api/client";
import { RadixSelect } from "../../shared/RadixSelect";
import AuthorSelectInput from "../../shared/AuthorSelectInput";
import { profileDisplayNames } from "../../../hooks/useAuthorProfile";
import { SortableArticleRow } from "./SortableArticleRow";
import { styles } from "./styles";
import { useConvertToBookWizard } from "./useConvertToBookWizard";

type Wizard = ReturnType<typeof useConvertToBookWizard>;

export function StepSelection({ wizard }: { wizard: Wizard }) {
    const {
        t,
        articles,
        selectedIds,
        sortStrategy,
        tagSummary,
        orderedArticles,
        sensors,
        handleSortChange,
        handleDragEnd,
        handleSelectByTag,
        handleResetSelection,
        handleRemoveOne,
    } = wizard;
    return (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.selection_hint",
                    "Reihenfolge und Auswahl prüfen. Sortierung oder Drag-and-Drop ändern die Reihenfolge.",
                )}
            </p>
            <div style={styles.row}>
                <label style={styles.label}>
                    {t("ui.convert_to_book.sort_label", "Sortierung")}
                </label>
                <RadixSelect
                    className="is-block"
                    value={sortStrategy}
                    onValueChange={(next) =>
                        handleSortChange(next as BookFromArticlesSortStrategy)
                    }
                    testId="convert-to-book-wizard-selection-sort-strategy"
                    ariaLabel={t("ui.convert_to_book.sort_label", "Sortierung")}
                    options={[
                        {value: "date_asc", label: t("ui.convert_to_book.sort_date_asc", "Datum (alt → neu)")},
                        {value: "date_desc", label: t("ui.convert_to_book.sort_date_desc", "Datum (neu → alt)")},
                        {value: "title_asc", label: t("ui.convert_to_book.sort_title_asc", "Titel A → Z")},
                        {value: "title_desc", label: t("ui.convert_to_book.sort_title_desc", "Titel Z → A")},
                        {value: "manual", label: t("ui.convert_to_book.sort_manual", "Manuell (per Drag)")},
                    ]}
                />
                <span style={styles.countBadge}>
                    {t("ui.convert_to_book.count", "{count} ausgewählt").replace(
                        "{count}",
                        String(selectedIds.size),
                    )}
                </span>
            </div>

            {tagSummary.length > 0 && (
                <div style={styles.tagBar} data-testid="convert-to-book-wizard-selection-tag-bar">
                    <span style={styles.label}>
                        {t("ui.convert_to_book.tag_helper", "Nur Tag:")}
                    </span>
                    {tagSummary.map(({tag, count}) => (
                        <button
                            key={tag}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleSelectByTag(tag)}
                            data-testid={`convert-to-book-wizard-selection-tag-${tag}`}
                        >
                            {tag} ({count})
                        </button>
                    ))}
                    {selectedIds.size < articles.length && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleResetSelection}
                            data-testid="convert-to-book-wizard-selection-reset"
                        >
                            {t("ui.convert_to_book.reset_selection", "Zurücksetzen")}
                        </button>
                    )}
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={orderedArticles.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div
                        style={styles.list}
                        data-testid="convert-to-book-wizard-selection-list"
                    >
                        {orderedArticles.map((article) => (
                            <SortableArticleRow
                                key={article.id}
                                article={article}
                                onRemove={() => handleRemoveOne(article.id)}
                                t={t}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}

export function StepMetadata({ wizard }: { wizard: Wizard }) {
    const {
        t,
        title,
        setTitle,
        subtitle,
        setSubtitle,
        author,
        setAuthor,
        language,
        setLanguage,
        series,
        setSeries,
        seriesIndex,
        setSeriesIndex,
        coverImage,
        setCoverImage,
        authorProfile,
        authorSuggestions,
        addToAuthorsDb,
        setAddToAuthorsDb,
        showAddToAuthorsCheckbox,
        isSingleArticle,
        subtitleDefault,
        coverImageDefault,
        seriesDefault,
    } = wizard;
    return (
        <div style={styles.stepContent}>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_title", "Buchtitel")} *
                </label>
                <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-title"
                />
                {title.trim() === "" && (
                    <small style={styles.fieldError}>
                        {t(
                            "ui.convert_to_book.metadata_title_required",
                            "Titel ist erforderlich",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_subtitle", "Untertitel")}
                </label>
                <input
                    className="input"
                    value={subtitle}
                    placeholder={subtitleDefault}
                    onChange={(e) => setSubtitle(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-subtitle"
                />
                {isSingleArticle && subtitleDefault && (
                    <small style={styles.fieldHint}>
                        {t(
                            "ui.convert_to_book.metadata_subtitle_prefill",
                            "Wird aus Artikel-Untertitel übernommen, wenn leer.",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label
                    className="label"
                    htmlFor="convert-to-book-wizard-metadata-author"
                >
                    {t("ui.convert_to_book.metadata_author", "Autor")} *
                </label>
                {/* RECURRING-COMPONENT-AUDIT-01 #4 extraction:
                    input + datalist + Add-to-Authors-DB checkbox
                    live in AuthorSelectInput. The inputTestId
                    override preserves the non-standard
                    "convert-to-book-wizard-metadata-author" testid
                    that 12+ E2E + Vitest references already pin. */}
                <AuthorSelectInput
                    value={author}
                    onChange={setAuthor}
                    suggestions={authorSuggestions}
                    profileChoices={profileDisplayNames(authorProfile)}
                    customOptionLabel={t(
                        "ui.author_select.custom_option",
                        "Anderer Name …",
                    )}
                    showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
                    addToAuthorsDb={addToAuthorsDb}
                    onAddToAuthorsDbChange={setAddToAuthorsDb}
                    testidPrefix="convert-to-book-wizard"
                    inputTestId="convert-to-book-wizard-metadata-author"
                    inputId="convert-to-book-wizard-metadata-author"
                    datalistId="convert-to-book-wizard-author-suggestions"
                    addToAuthorsLabel={t(
                        "ui.convert_to_book.metadata_add_to_authors_db",
                        "„{name}\" zur Autoren-Datenbank hinzufügen",
                    )}
                />
                {author.trim() === "" && (
                    <small style={styles.fieldError}>
                        {t(
                            "ui.convert_to_book.metadata_author_required",
                            "Autor ist erforderlich",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_language", "Sprache")}
                </label>
                <input
                    className="input"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="en"
                    data-testid="convert-to-book-wizard-metadata-language"
                />
            </div>
            <div className="field">
                <label className="label">
                    {t("ui.convert_to_book.metadata_series", "Serie")}
                </label>
                <input
                    className="input"
                    value={series}
                    placeholder={seriesDefault}
                    onChange={(e) => setSeries(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-series"
                />
                {seriesDefault && (
                    <small style={styles.fieldHint}>
                        {t(
                            "ui.convert_to_book.metadata_series_prefill",
                            "Alle ausgewählten Artikel teilen diese Serie.",
                        )}
                    </small>
                )}
            </div>
            <div className="field">
                <label className="label">
                    {t(
                        "ui.convert_to_book.metadata_series_index",
                        "Serien-Index",
                    )}
                </label>
                <input
                    className="input"
                    type="number"
                    value={seriesIndex}
                    onChange={(e) => setSeriesIndex(e.target.value)}
                    data-testid="convert-to-book-wizard-metadata-series-index"
                />
            </div>
            {isSingleArticle && coverImageDefault && (
                <div
                    style={styles.infoBox}
                    data-testid="convert-to-book-wizard-metadata-cover-info"
                >
                    {t(
                        "ui.convert_to_book.cover_inherit_note",
                        "Cover wird aus dem Artikel übernommen. Im Buch-Editor nach der Konvertierung anpassbar.",
                    )}
                    <input
                        className="input"
                        value={coverImage}
                        placeholder={coverImageDefault}
                        onChange={(e) => setCoverImage(e.target.value)}
                        data-testid="convert-to-book-wizard-metadata-cover-image"
                        style={{marginTop: 4}}
                    />
                </div>
            )}
        </div>
    );
}
