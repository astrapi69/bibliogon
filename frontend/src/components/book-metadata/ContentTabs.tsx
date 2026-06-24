import type { BookDetail } from "../../api/client";
import { ComboboxSelect } from "../../lib/components/ComboboxSelect";
import { buildBookLanguageOptions } from "../../lib/bookLanguages";
import TranslationLinks from "../articles/TranslationLinks";
import CoverUpload from "../book/CoverUpload";
import PdfExportControls from "../export/PdfExportControls";
import { Row, Field, AuthorSelectField, RepositoryUrlField } from "./MetadataFields";
import { AuthorAssetsPanel } from "./AuthorAssetsPanel";
import type { BookMetadataState, TFunc } from "./tabTypes";
import styles from "../BookMetadataEditor.module.css";

interface ContentTabsProps {
    activeTab: string;
    book: BookDetail;
    meta: BookMetadataState;
    t: TFunc;
    customLanguages: string[];
    setCustomLanguages: (updater: (prev: string[]) => string[]) => void;
}

/**
 * The "Inhalt" + Design sections of the book metadata editor: the
 * General, Story, and Design tabs. Renders the tab matching ``activeTab``
 * (or ``null`` otherwise).
 *
 * Extracted from BookMetadataEditor.tsx (god-file split, #207) as a pure
 * structural move — same JSX, same testids.
 *
 * @example
 * <ContentTabs activeTab={effectiveTab} book={book} meta={meta} t={t}
 *   customLanguages={customLanguages} setCustomLanguages={setCustomLanguages} />
 */
export default function ContentTabs({
    activeTab,
    book,
    meta,
    t,
    customLanguages,
    setCustomLanguages,
}: ContentTabsProps) {
    const {
        form,
        set,
        authorSuggestions,
        showAddToAuthorsCheckbox,
        addAuthorToDb,
        setAddAuthorToDb,
        gitSyncStatus,
        wordsPerDayHint,
    } = meta;

    if (activeTab === "general") {
        return (
            <div className={styles.tabContent}>
                <TranslationLinks bookId={book.id} />
                <Row>
                    <AuthorSelectField
                        label={t("ui.metadata.author", "Autor")}
                        value={form.author || ""}
                        onChange={(v) => set("author", v)}
                        suggestions={authorSuggestions}
                        showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
                        addToAuthorsDb={addAuthorToDb}
                        onAddToAuthorsDbChange={setAddAuthorToDb}
                    />
                    <div className="field" style={{ flex: 1 }}>
                        <label className="label">{t("ui.metadata.language", "Sprache")}</label>
                        <ComboboxSelect
                            options={buildBookLanguageOptions(customLanguages)}
                            value={form.language || ""}
                            onChange={(v) => set("language", v)}
                            allowCustom
                            onCustomAdd={(v) =>
                                setCustomLanguages((prev) =>
                                    prev.some((c) => c.toLowerCase() === v.toLowerCase())
                                        ? prev
                                        : [...prev, v],
                                )
                            }
                            placeholder="de"
                            testId="book-metadata-language"
                        />
                    </div>
                </Row>
                <Field
                    label={t("ui.metadata.subtitle", "Untertitel")}
                    value={form.subtitle}
                    onChange={(v) => set("subtitle", v)}
                />
                <Field
                    label={t("ui.metadata.description", "Beschreibung")}
                    value={form.description}
                    onChange={(v) => set("description", v)}
                    multiline
                    language="markdown"
                    fullscreen
                />
                <Field
                    label={t("ui.metadata.notes", "Projektnotizen")}
                    value={form.notes}
                    onChange={(v) => set("notes", v)}
                    multiline
                    placeholder={t("ui.metadata.notes_placeholder", "Notizen zum Buchprojekt…")}
                />
                <Row>
                    <Field
                        label={t("ui.metadata.edition", "Edition")}
                        value={form.edition}
                        onChange={(v) => set("edition", v)}
                        placeholder="z.B. Second Edition"
                    />
                    <Field
                        label={t("ui.metadata.publish_date", "Datum")}
                        value={form.publish_date}
                        onChange={(v) => set("publish_date", v)}
                        placeholder="z.B. 2025"
                    />
                </Row>
                {/* BOOK-REPOSITORY-URL-FIELD-01 C3: optional git repo URL.
                 * When plugin-git-sync owns this book (mapping exists), the
                 * field renders read-only with the canonical mapping URL +
                 * "managed by git-sync" hint so the user understands manual
                 * edits would diverge from the round-trip. When no mapping
                 * exists OR the status fetch failed, the field is a normal
                 * free input backed by Book.repository_url. */}
                <RepositoryUrlField
                    bookId={book.id}
                    value={form.repository_url ?? ""}
                    onChange={(v) => set("repository_url", v)}
                    gitSyncStatus={gitSyncStatus}
                    t={t}
                />
            </div>
        );
    }

    {
        /* EXPOSE-BUCHIDEE-METADATA-01 C2: Story tab houses the
         * author-design metadata distinct from the General tab's
         * publication-side bibliographic fields. ``book_idea`` is the
         * short 1-2 sentence premise (no fullscreen — small Field shape).
         * ``expose`` is the long-form Plot+Characters+Setting document
         * (Field multiline + markdown + fullscreen — same shape as
         * description). */
    }
    if (activeTab === "story") {
        return (
            <div className={styles.tabContent} data-testid="metadata-story-content">
                <Field
                    label={t("ui.metadata.book_idea_label", "Buchidee")}
                    value={form.book_idea}
                    onChange={(v) => set("book_idea", v)}
                    placeholder={t(
                        "ui.metadata.book_idea_placeholder",
                        "Kurz: 1-2 Sätze, worum geht es?",
                    )}
                    multiline
                />
                <Field
                    label={t("ui.metadata.expose_label", "Exposé")}
                    value={form.expose}
                    onChange={(v) => set("expose", v)}
                    placeholder={t(
                        "ui.metadata.expose_placeholder",
                        "Plot, Figuren, Schauplatz, Ton — ausführlich.",
                    )}
                    multiline
                    language="markdown"
                    fullscreen
                />
                {/* Writing target (WRITING-GOALS-PROGRESS-TRACKING-01). */}
                <div style={{ marginTop: 8 }}>
                    <label className="label">
                        {t("ui.metadata.word_target_label", "Word target")}
                    </label>
                    <input
                        type="number"
                        min={0}
                        className="input"
                        value={form.word_target ?? ""}
                        onChange={(e) => set("word_target", e.target.value)}
                        placeholder={t("ui.chapter_target.placeholder", "e.g. 80000")}
                        data-testid="metadata-word-target"
                    />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label className="label">
                        {t("ui.metadata.word_target_deadline_label", "Target deadline")}
                    </label>
                    <input
                        type="date"
                        className="input"
                        value={form.word_target_deadline ?? ""}
                        onChange={(e) => set("word_target_deadline", e.target.value)}
                        data-testid="metadata-word-target-deadline"
                    />
                </div>
                {wordsPerDayHint && (
                    <p
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            marginTop: 6,
                        }}
                        data-testid="metadata-words-per-day"
                    >
                        {wordsPerDayHint}
                    </p>
                )}
            </div>
        );
    }

    if (activeTab === "design") {
        return (
            <div className={styles.tabContent}>
                <CoverUpload
                    bookId={book.id}
                    coverImage={form.cover_image ?? null}
                    onChange={(newPath) => set("cover_image", newPath ?? "")}
                />
                {/* PDF-BLEED-MARKS-01 C2: picture-book PDF export controls.
                    Shared component with PageEditor's header (closes the
                    PDF-KDP-FORMATS-01 half-wired surface per the
                    Recurring-Component-Unification Rule's canonical 2-site
                    extract-plus-migrate). Picture-book-only — prose books
                    export via the chapter pipeline + ExportDialog. */}
                {book.book_type === "picture_book" && (
                    <div className={styles.row}>
                        <PdfExportControls
                            bookId={book.id}
                            testidPrefix="metadata"
                            bookType="picture_book"
                            exportButtonClassName="button button-primary"
                            spinnerClassName="bookMetaSpin"
                        />
                        <style>
                            {`@keyframes bookMetaSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .bookMetaSpin { animation: bookMetaSpin 1s linear infinite; }`}
                        </style>
                    </div>
                )}
                <AuthorAssetsPanel bookId={book.id} />
                <Field
                    label={t("ui.metadata.custom_css", "Custom CSS (EPUB-Styles)")}
                    value={form.custom_css}
                    onChange={(v) => set("custom_css", v)}
                    multiline
                    mono
                    fullscreen
                />
            </div>
        );
    }

    return null;
}
