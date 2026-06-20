import { useEffect, useMemo, useState } from "react";
import { Book, BookDetail } from "../../api/client";
import { getStorage } from "../../storage";
import { useStorageMode } from "../../storage/useStorageMode";
import { ComboboxSelect } from "../../lib/components/ComboboxSelect";
import { buildBookLanguageOptions } from "../../lib/bookLanguages";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { Save, Copy, ChevronLeft, Sparkles, Rocket } from "lucide-react";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../../hooks/useI18n";
import { useBookTypes } from "../../hooks/book/useBookTypes";
import { useEditorPluginStatus } from "../../hooks/editor/useEditorPluginStatus";
import { useBookMetadata } from "../../hooks/book/useBookMetadata";
import { useBookMetadataAi } from "../../hooks/book/useBookMetadataAi";
import KeywordInput from "./KeywordInput";
import PdfExportControls from "../export/PdfExportControls";
import CategoryInput from "./CategoryInput";
import BisacCodeInput from "./BisacCodeInput";
import CoverUpload from "./CoverUpload";
import {
    NavigationSidebar,
    type NavigationSidebarGroup,
} from "../../lib/components/NavigationSidebar";
import QualityTab, { NavigableFindingType } from "../quality/QualityTab";
import TranslationLinks from "../articles/TranslationLinks";
import AITemplatePanel from "../shared/AITemplatePanel";
import KdpPublishingWizard from "../kdp-wizard/KdpPublishingWizard";
import { Row, Field, AuthorSelectField, RepositoryUrlField } from "../book-metadata/MetadataFields";
import { HtmlFieldWithPreview } from "../book-metadata/HtmlField";
import { AuthorAssetsPanel } from "../book-metadata/AuthorAssetsPanel";
import AudiobookBookConfig from "../book-metadata/AudiobookConfig";
import AudiobookDownloads from "../book-metadata/AudiobookDownloads";
import styles from "../BookMetadataEditor.module.css";

interface Props {
    book: BookDetail;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onBack: () => void;
    allBooks?: Book[];
    onNavigateToIssue?: (chapterId: string, findingType: NavigableFindingType) => void;
    /** Optional refresh callback. Invoked by the AI-template panel
     *  after a successful Fill or Import so the parent can re-fetch
     *  the book and re-pass it via the ``book`` prop. The form's
     *  ``useEffect`` on ``book`` resets state when a fresh book
     *  lands. */
    onRefresh?: () => void;
}

export default function BookMetadataEditor({
    book,
    onSave,
    onBack,
    allBooks,
    onNavigateToIssue,
    onRefresh,
}: Props) {
    const { t } = useI18n();
    // BOOK-TYPES-SSOT-YAML-01 C7: chapter-based vs page-based gate
    // now driven by the registry's ``content_model`` field. The
    // Audiobook + Quality tabs read from ``book.chapters``
    // (AudiobookBookConfig + AudiobookDownloads pass it through;
    // QualityTab runs grammar/style on chapter text). Page-based
    // book types carry no chapters by design, so exposing those
    // tabs ships a write-surface without a consumer (the
    // half-wired-feature-lifecycle anti-pattern). Both tabs hide
    // for content_model="pages". Unknown book_type (e.g. loading
    // state) defaults to chapter-based — same fallback as the
    // pre-migration helper.
    const bookTypesSnapshot = useBookTypes();
    const isChapterBased =
        book.book_type === undefined ||
        bookTypesSnapshot.types[book.book_type]?.content_model === "chapters" ||
        // Fallback: if the registry hasn't loaded yet, assume
        // chapter-based (matches the legacy helper's
        // ``undefined → true`` branch).
        bookTypesSnapshot.types[book.book_type] === undefined;
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [showKdpWizard, setShowKdpWizard] = useState(false);
    // Section navigation: replaces the Radix Tabs bar with the
    // responsive sidebar+hamburger pattern (NavigationSidebar). Plain
    // local state — the editor's chapter view already uses ?view=, so a
    // second ?tab= param is deliberately avoided.
    const [activeTab, setActiveTab] = useState("general");
    // Guard: if a now-hidden conditional section (audiobook/quality for
    // page-based books) is somehow active, fall back to "general". The
    // nav can't surface a hidden item, but the deps could flip after a
    // book_type/registry update.
    const effectiveTab =
        !isChapterBased && (activeTab === "audiobook" || activeTab === "quality")
            ? "general"
            : activeTab;
    // User-defined book languages from ui.custom_languages, merged with
    // the 8 fixed defaults for the language combobox. Silent fallback to
    // [] when the config has no custom languages.
    const [customLanguages, setCustomLanguages] = useState<string[]>([]);
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .settings.getApp()
            .then((config) => {
                if (cancelled) return;
                const uiConfig = (config.ui || {}) as Record<string, unknown>;
                const custom = Array.isArray(uiConfig.custom_languages)
                    ? (uiConfig.custom_languages as string[]).filter(Boolean)
                    : [];
                setCustomLanguages(custom);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);
    const { status: pluginStatus } = useEditorPluginStatus();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    // Backend-only convenience probes resolve through the central feature
    // registry instead of a raw mode check. Both are DESKTOP_ONLY, so
    // isActive is false exactly when offline — behaviour-equivalent to the
    // former mode==="dexie" guard, without the architecture violation.
    const gitSyncActive = useFeature(FEATURES.GIT_SYNC).isActive;
    const kdpCatalogActive = useFeature(FEATURES.KDP_CATEGORY_CATALOG).isActive;

    const {
        form,
        setForm,
        set,
        keywords,
        setKeywords,
        categories,
        setCategories,
        bisacCodes,
        setBisacCodes,
        kdpCategoriesCatalog,
        gitSyncStatus,
        audiobookOverwrite,
        setAudiobookOverwrite,
        audiobookSkipTypes,
        setAudiobookSkipTypes,
        saving,
        addAuthorToDb,
        setAddAuthorToDb,
        authorSuggestions,
        showAddToAuthorsCheckbox,
        wordsPerDayHint,
        handleSave,
    } = useBookMetadata({ book, onSave, kdpCatalogActive, gitSyncActive });

    const { aiGenerating, aiAvailable, handleAiGenerate } = useBookMetadataAi({
        book,
        form,
        offline,
        pluginStatus,
        set,
        setKeywords,
    });

    // PDF-BLEED-MARKS-01 C2: the Design-tab Export-PDF button +
    // its state were the half-wired surface that PDF-KDP-FORMATS-01
    // silently left behind (the button ignored the format dropdown
    // selection because the dropdown only lived in PageEditor).
    // Replaced with PdfExportControls (mounted in the
    // Design tab JSX below); state ownership + handler + format +
    // bleed all live in the shared component now.

    const handleCopyFrom = (sourceBook: Book) => {
        setForm((prev) => ({
            ...prev,
            publisher: sourceBook.publisher || prev.publisher || "",
            publisher_city: sourceBook.publisher_city || prev.publisher_city || "",
            backpage_author_bio: sourceBook.backpage_author_bio || prev.backpage_author_bio || "",
            custom_css: sourceBook.custom_css || prev.custom_css || "",
        }));
        setShowCopyDialog(false);
        notify.success(t("ui.metadata.copy_success", "Verlag und Autoren-Info übernommen"));
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    // Section nav groups. Reuses the existing per-tab i18n labels +
    // ``metadata-tab-*`` testids verbatim so current tests + E2E
    // selectors still resolve. Audiobook + Quality are present only for
    // chapter-based books (the conditional-presence pattern).
    const navGroups: NavigationSidebarGroup[] = useMemo(
        () => [
            {
                label: t("ui.metadata.group_content", "Inhalt"),
                items: [
                    {
                        id: "general",
                        label: t("ui.metadata.tab_general", "Allgemein"),
                        testId: "metadata-tab-general",
                    },
                    {
                        id: "story",
                        label: t("ui.metadata.tab_story", "Story"),
                        testId: "metadata-tab-story",
                    },
                    {
                        id: "design",
                        label: t("ui.metadata.tab_design", "Design"),
                        testId: "metadata-tab-design",
                    },
                ],
            },
            {
                label: t("ui.metadata.group_publishing", "Veröffentlichung"),
                items: [
                    {
                        id: "publisher",
                        label: t("ui.metadata.tab_publisher", "Verlag"),
                        testId: "metadata-tab-publisher",
                    },
                    {
                        id: "isbn",
                        label: t("ui.metadata.tab_isbn", "ISBN"),
                        testId: "metadata-tab-isbn",
                    },
                    {
                        id: "marketing",
                        label: t("ui.metadata.tab_marketing", "Marketing"),
                        testId: "metadata-tab-marketing",
                    },
                ],
            },
            {
                label: t("ui.metadata.group_production", "Produktion"),
                items: isChapterBased
                    ? [
                          {
                              id: "audiobook",
                              label: t("ui.metadata.tab_audiobook", "Audiobook"),
                              testId: "metadata-tab-audiobook",
                          },
                          {
                              id: "quality",
                              label: t("ui.metadata.tab_quality", "Qualitaet"),
                              testId: "metadata-tab-quality",
                          },
                      ]
                    : [],
            },
            {
                label: t("ui.metadata.group_advanced", "Erweitert"),
                items: [
                    {
                        id: "ai_template",
                        label: t("ui.metadata.tab_ai_template", "KI-Vorlage"),
                        testId: "metadata-tab-ai-template",
                    },
                ],
            },
        ],
        [t, isChapterBased],
    );

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={`${styles.header} flex-wrap gap-2`}>
                <div className="icon-row">
                    <button
                        className="btn-icon"
                        onClick={onBack}
                        data-testid="metadata-back"
                        title={t("ui.sidebar.back_to_dashboard", "Zurück")}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <h2 className={styles.title}>{t("ui.sidebar.metadata", "Buch-Metadaten")}</h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    {otherBooks.length > 0 && (
                        <button
                            className="btn btn-secondary btn-sm min-h-[44px]"
                            onClick={() => setShowCopyDialog(!showCopyDialog)}
                        >
                            <Copy size={14} /> {t("ui.metadata.copy_from", "Von Buch übernehmen")}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm min-h-[44px]"
                        onClick={() => setShowKdpWizard(true)}
                        data-testid="metadata-open-kdp-wizard"
                        title={t(
                            "ui.kdp_publishing_wizard.open_tooltip",
                            "KDP-Veröffentlichungs-Assistenten öffnen",
                        )}
                    >
                        <Rocket size={14} />{" "}
                        {t("ui.kdp_publishing_wizard.open_button", "Für KDP veröffentlichen")}
                    </button>
                    <button
                        className="btn btn-primary btn-sm min-h-[44px]"
                        onClick={handleSave}
                        disabled={saving}
                        data-testid="metadata-save"
                    >
                        <Save size={14} />{" "}
                        {saving
                            ? t("ui.editor.saving", "Speichert...")
                            : t("ui.common.save", "Speichern")}
                    </button>
                </div>
            </div>

            {showCopyDialog && (
                <div className={styles.copyDialog}>
                    <p
                        style={{
                            fontSize: "0.875rem",
                            color: "var(--text-secondary)",
                            marginBottom: 8,
                        }}
                    >
                        {t(
                            "ui.metadata.copy_hint",
                            "Übernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:",
                        )}
                    </p>
                    {otherBooks.map((b) => (
                        <button
                            key={b.id}
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleCopyFrom(b)}
                            style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                marginBottom: 4,
                            }}
                        >
                            {b.title} <span className="muted">- {b.author}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Section navigation (responsive sidebar + hamburger) */}
            <div className={styles.layout}>
                <div className={styles.sidebarColumn}>
                    <NavigationSidebar
                        groups={navGroups}
                        activeId={effectiveTab}
                        onSelect={setActiveTab}
                        ariaLabel={t(
                            "ui.sidebar.metadata",
                            "Buch-Metadaten",
                        )}
                    />
                </div>

                <div className={styles.contentColumn}>
                    {effectiveTab === "general" && (
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
                                <label className="label">
                                    {t("ui.metadata.language", "Sprache")}
                                </label>
                                <ComboboxSelect
                                    options={buildBookLanguageOptions(customLanguages)}
                                    value={form.language || ""}
                                    onChange={(v) => set("language", v)}
                                    allowCustom
                                    onCustomAdd={(v) =>
                                        setCustomLanguages((prev) =>
                                            prev.some(
                                                (c) =>
                                                    c.toLowerCase() ===
                                                    v.toLowerCase(),
                                            )
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
                        {/* BOOK-REPOSITORY-URL-FIELD-01 C3: optional
                         * git repo URL. When plugin-git-sync owns
                         * this book (mapping exists), the field
                         * renders read-only with the canonical
                         * mapping URL + "managed by git-sync" hint
                         * so the user understands manual edits
                         * would diverge from the round-trip. When
                         * no mapping exists OR the status fetch
                         * failed, the field is a normal free input
                         * backed by Book.repository_url. */}
                        <RepositoryUrlField
                            bookId={book.id}
                            value={form.repository_url ?? ""}
                            onChange={(v) => set("repository_url", v)}
                            gitSyncStatus={gitSyncStatus}
                            t={t}
                        />
                    </div>
                    )}

                    {/* EXPOSE-BUCHIDEE-METADATA-01 C2: Story tab houses
                     * the author-design metadata distinct from the
                     * General tab's publication-side bibliographic
                     * fields. ``book_idea`` is the short 1-2 sentence
                     * premise (no fullscreen — small Field shape).
                     * ``expose`` is the long-form Plot+Characters+
                     * Setting document (Field multiline + markdown +
                     * fullscreen — same shape as description). */}
                    {effectiveTab === "story" && (
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
                    )}

                    {effectiveTab === "publisher" && (
                    <div className={styles.tabContent}>
                        <Row>
                            <Field
                                label={t("ui.metadata.publisher", "Verlag")}
                                value={form.publisher}
                                onChange={(v) => set("publisher", v)}
                                placeholder="z.B. Conscious Path Publishing"
                            />
                            <Field
                                label={t("ui.metadata.publisher_city", "Stadt")}
                                value={form.publisher_city}
                                onChange={(v) => set("publisher_city", v)}
                                placeholder="z.B. Ludwigsburg"
                            />
                        </Row>
                    </div>
                    )}

                    {effectiveTab === "isbn" && (
                    <div className={styles.tabContent}>
                        <Row>
                            <Field
                                label="ISBN E-Book"
                                value={form.isbn_ebook}
                                onChange={(v) => set("isbn_ebook", v)}
                                placeholder="z.B. 9798253911952"
                            />
                            <Field
                                label="ISBN Taschenbuch"
                                value={form.isbn_paperback}
                                onChange={(v) => set("isbn_paperback", v)}
                            />
                        </Row>
                        <Row>
                            <Field
                                label="ISBN Hardcover"
                                value={form.isbn_hardcover}
                                onChange={(v) => set("isbn_hardcover", v)}
                            />
                            <Field
                                label="ASIN E-Book"
                                value={form.asin_ebook}
                                onChange={(v) => set("asin_ebook", v)}
                                placeholder="z.B. B0GV3XBGVB"
                            />
                        </Row>
                        <Row>
                            <Field
                                label="ASIN Taschenbuch"
                                value={form.asin_paperback}
                                onChange={(v) => set("asin_paperback", v)}
                            />
                            <Field
                                label="ASIN Hardcover"
                                value={form.asin_hardcover}
                                onChange={(v) => set("asin_hardcover", v)}
                            />
                        </Row>
                    </div>
                    )}

                    {/* Categories + BISAC (Bug 9) live in this Marketing
                        section. With the NavigationSidebar refactor only
                        the active section is rendered (conditional mount),
                        so their testids are queryable only after the
                        Marketing item is selected. */}
                    {effectiveTab === "marketing" && (
                    <div className={styles.tabContent}>
                        {book.ai_tokens_used > 0 && (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 12px",
                                    marginBottom: 12,
                                    background: "var(--surface-2)",
                                    borderRadius: "var(--radius-sm)",
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                }}
                            >
                                <Sparkles size={14} />
                                <span>
                                    {t("ui.metadata.ai_usage", "AI-Nutzung")}:{" "}
                                    {book.ai_tokens_used.toLocaleString()} Tokens{" "}
                                    <span
                                        title={t(
                                            "ui.metadata.ai_cost_hint",
                                            "Geschaetzte Kosten basierend auf typischen Anbieterpreisen",
                                        )}
                                    >
                                        (~${(book.ai_tokens_used * 0.000003).toFixed(4)}
                                        {" - "}${(book.ai_tokens_used * 0.000015).toFixed(4)})
                                    </span>
                                </span>
                            </div>
                        )}
                        <div className="field">
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: 4,
                                }}
                            >
                                <label className="label" style={{ marginBottom: 0 }}>
                                    {t("ui.metadata.keywords", "Schlüsselwoerter")}
                                </label>
                                {aiAvailable && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={aiGenerating === "keywords"}
                                        onClick={() => handleAiGenerate("keywords")}
                                        title={t(
                                            "ui.metadata.ai_generate_keywords",
                                            "Keywords mit AI generieren",
                                        )}
                                        style={{
                                            fontSize: "0.75rem",
                                            padding: "2px 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 4,
                                        }}
                                    >
                                        <Sparkles size={12} />
                                        {aiGenerating === "keywords"
                                            ? t("ui.common.loading", "Laden...")
                                            : t("ui.metadata.ai_generate", "AI")}
                                    </button>
                                )}
                            </div>
                            <KeywordInput keywords={keywords} onChange={setKeywords} />
                        </div>
                        {/* Bug 9: Books-only subject categorisation. Free-
                            text categories + format-validated BISAC codes.
                            Articles deliberately do NOT get these fields —
                            see lessons-learned "Intentional asymmetry"
                            entry for the design rationale. */}
                        <div className="field" data-testid="metadata-categories-field">
                            <label className="label">
                                {t("ui.metadata.categories", "Kategorien")}
                            </label>
                            <small
                                style={{
                                    display: "block",
                                    color: "var(--text-muted, #6b7280)",
                                    marginBottom: 4,
                                    fontSize: "0.75rem",
                                }}
                            >
                                {t(
                                    "ui.metadata.categories_hint",
                                    "KDP-Stil-Kategorienamen. Frei wählbar; jede Plattform hat ihre eigene Taxonomie.",
                                )}
                            </small>
                            <CategoryInput
                                categories={categories}
                                onChange={setCategories}
                                suggestions={kdpCategoriesCatalog}
                            />
                        </div>
                        <div className="field" data-testid="metadata-bisac-field">
                            <label className="label">
                                {t("ui.metadata.bisac_codes", "BISAC-Codes")}
                            </label>
                            <small
                                style={{
                                    display: "block",
                                    color: "var(--text-muted, #6b7280)",
                                    marginBottom: 4,
                                    fontSize: "0.75rem",
                                }}
                            >
                                {t(
                                    "ui.metadata.bisac_hint",
                                    "Branchen-Standard-Subject-Codes (KDP empfiehlt ≤ 3 Codes).",
                                )}
                            </small>
                            <BisacCodeInput codes={bisacCodes} onChange={setBisacCodes} />
                        </div>
                        <HtmlFieldWithPreview
                            label={t(
                                "ui.metadata.html_description",
                                "Buch-Beschreibung (HTML für Amazon)",
                            )}
                            value={form.html_description}
                            onChange={(v) => set("html_description", v)}
                            maxChars={4000}
                            aiButton={
                                aiAvailable
                                    ? {
                                          loading: aiGenerating === "html_description",
                                          onClick: () => handleAiGenerate("html_description"),
                                          label:
                                              aiGenerating === "html_description"
                                                  ? t("ui.common.loading", "Laden...")
                                                  : t("ui.metadata.ai_generate", "AI"),
                                      }
                                    : undefined
                            }
                        />
                        <HtmlFieldWithPreview
                            label={t("ui.metadata.backpage_description", "Rückseitenbeschreibung")}
                            value={form.backpage_description}
                            onChange={(v) => set("backpage_description", v)}
                            maxChars={600}
                            rows={4}
                            aiButton={
                                aiAvailable
                                    ? {
                                          loading: aiGenerating === "backpage_description",
                                          onClick: () => handleAiGenerate("backpage_description"),
                                          label:
                                              aiGenerating === "backpage_description"
                                                  ? t("ui.common.loading", "Laden...")
                                                  : t("ui.metadata.ai_generate", "AI"),
                                      }
                                    : undefined
                            }
                        />
                        <HtmlFieldWithPreview
                            label={t(
                                "ui.metadata.author_bio",
                                "Autoren-Kurzbiographie (Rückseite)",
                            )}
                            value={form.backpage_author_bio}
                            onChange={(v) => set("backpage_author_bio", v)}
                            maxChars={2000}
                            aiButton={
                                aiAvailable
                                    ? {
                                          loading: aiGenerating === "backpage_author_bio",
                                          onClick: () => handleAiGenerate("backpage_author_bio"),
                                          label:
                                              aiGenerating === "backpage_author_bio"
                                                  ? t("ui.common.loading", "Laden...")
                                                  : t("ui.metadata.ai_generate", "AI"),
                                      }
                                    : undefined
                            }
                        />
                    </div>
                    )}

                    {effectiveTab === "design" && (
                    <div className={styles.tabContent}>
                        <CoverUpload
                            bookId={book.id}
                            coverImage={form.cover_image ?? null}
                            onChange={(newPath) => set("cover_image", newPath ?? "")}
                        />
                        {/* PDF-BLEED-MARKS-01 C2: picture-book PDF
                            export controls. Shared component with
                            PageEditor's header (closes the
                            PDF-KDP-FORMATS-01 half-wired surface
                            per the Recurring-Component-Unification
                            Rule's canonical 2-site extract-plus-
                            migrate). Picture-book-only — prose
                            books export via the chapter pipeline +
                            ExportDialog. */}
                        {book.book_type === "picture_book" && (
                            <div className={styles.row}>
                                <PdfExportControls
                                    bookId={book.id}
                                    testidPrefix="metadata"
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
                    )}

                    {isChapterBased && (
                        <>
                            {effectiveTab === "audiobook" && (
                            <div className={styles.tabContent}>
                                <AudiobookBookConfig
                                    bookLanguage={book.language}
                                    bookTitle={book.title}
                                    bookChapters={book.chapters || []}
                                    engine={form.tts_engine || ""}
                                    voice={form.tts_voice || ""}
                                    speed={form.tts_speed || "1.0"}
                                    merge={form.audiobook_merge || "merged"}
                                    customFilename={form.audiobook_filename || ""}
                                    overwriteExisting={audiobookOverwrite}
                                    skipChapterTypes={audiobookSkipTypes}
                                    onEngineChange={(v: string) => {
                                        set("tts_engine", v);
                                        set("tts_voice", "");
                                    }}
                                    onVoiceChange={(v: string) => set("tts_voice", v)}
                                    onSpeedChange={(v: string) => set("tts_speed", v)}
                                    onMergeChange={(v: string) => set("audiobook_merge", v)}
                                    onCustomFilenameChange={(v: string) =>
                                        set("audiobook_filename", v)
                                    }
                                    onOverwriteExistingChange={setAudiobookOverwrite}
                                    onSkipChapterTypesChange={setAudiobookSkipTypes}
                                />
                                <AudiobookDownloads
                                    bookId={book.id}
                                    bookTitle={book.title}
                                    bookChapters={book.chapters || []}
                                />
                            </div>
                            )}

                            {effectiveTab === "quality" && (
                            <div className={styles.tabContent}>
                                <QualityTab
                                    bookId={book.id}
                                    bookTitle={book.title}
                                    onNavigateToIssue={onNavigateToIssue}
                                />
                            </div>
                            )}
                        </>
                    )}

                    {effectiveTab === "ai_template" && (
                    <div className={styles.tabContent}>
                        <AITemplatePanel kind="book" id={book.id} onApplied={onRefresh} />
                    </div>
                    )}
                </div>
            </div>

            <KdpPublishingWizard
                open={showKdpWizard}
                book={book}
                onClose={() => setShowKdpWizard(false)}
            />
        </div>
    );
}

// Re-exported for back-compat with existing import sites (tests import
// these named exports from "./BookMetadataEditor"). The implementations
// live in the co-located ./book-metadata/* modules.
export { sanitizeAmazonHtml } from "../book-metadata/HtmlField";
export { HtmlFieldWithPreview };
export { AuthorAssetsPanel };
