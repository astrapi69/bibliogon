import { ArticleStatus, ContentType, Article } from "../../api/client";
import { SUPPORTED_LANGUAGES, STATUSES } from "../../pages/articleEditorConstants";
import { getStorage } from "../../storage";
import { Trash2 } from "lucide-react";
import { ContentTypeIcon } from "../../utils/icons/contentTypeIcon";
import ContentTypeFieldsSection from "./ContentTypeFieldsSection";
import { Field, FieldLabel, TopicSelect } from "./ArticleEditorFields";
import ArticleImageUpload from "./ArticleImageUpload";
import KeywordInput from "../book/KeywordInput";
import AiGenerateButton from "../shared/AiGenerateButton";
import AuthorSelectInput from "../shared/AuthorSelectInput";
import { PublicationsPanel } from "./PublicationsPanel";
import ArticleCommentsPanel from "./ArticleCommentsPanel";
import ArticleTranslatePanel from "./ArticleTranslatePanel";
import AITemplatePanel from "../shared/AITemplatePanel";
import { RadixSelect } from "../shared/RadixSelect";
import { profileDisplayNames } from "../../hooks/useAuthorProfile";
import type { useContentTypes } from "../../hooks/useContentTypes";
import type {
    ArticleExportFormat,
    ArticleAiMetaField,
} from "../../hooks/article/useArticleEditorActions";
import layout from "../../pages/ArticleEditor.module.css";

type Translate = (key: string, fallback: string) => string;

/**
 * Presentational metadata sidebar for the ArticleEditor (split out of the
 * 789-line page under #207). Renders the full `<aside>` - identity fields,
 * per-type content-type fields, the SSoT-gated optional core fields (SEO /
 * canonical / featured-image / excerpt / tags), publications, AI-template,
 * comments, export and translate panels. Pure presentation: every mutation
 * goes back through the `setArticle` / `persistMeta` / handler props owned by
 * the page + useArticleEditorActions. All `data-testid`s are unchanged.
 */
export interface ArticleEditorSidebarProps {
    article: Article;
    setArticle: (next: Article) => void;
    persistMeta: (patch: Partial<Article>) => Promise<void>;
    t: Translate;
    articleTypesSnapshot: ReturnType<typeof useContentTypes>;
    authorSuggestions: string[];
    authorProfile: Parameters<typeof profileDisplayNames>[0];
    topics: string[] | null;
    handleAddTopic: (name: string) => Promise<boolean>;
    exporting: ArticleExportFormat | null;
    handleExport: (fmt: ArticleExportFormat) => void;
    aiGenerating: ArticleAiMetaField | null;
    articleHasContent: boolean;
    handleAiGenerate: (field: ArticleAiMetaField) => void;
    handleDelete: () => void;
    showCore: (field: string) => boolean;
}

export default function ArticleEditorSidebar({
    article,
    setArticle,
    persistMeta,
    t,
    articleTypesSnapshot,
    authorSuggestions,
    authorProfile,
    topics,
    handleAddTopic,
    exporting,
    handleExport,
    aiGenerating,
    articleHasContent,
    handleAiGenerate,
    handleDelete,
    showCore,
}: ArticleEditorSidebarProps) {
    return (
                    <aside
                        className={`${layout.sidebar} w-[300px] h-full`}
                        data-testid="article-editor-sidebar"
                    >
                        <h3 className={layout.sidebarHeading}>
                            {t("ui.articles.metadata_heading", "Metadaten")}
                        </h3>
                        <Field
                            label={t("ui.articles.subtitle", "Untertitel")}
                            tooltip={t(
                                "ui.articles.subtitle_tooltip",
                                "Optionaler Untertitel. Manche Plattformen rendern ihn unter dem Titel.",
                            )}
                            value={article.subtitle ?? ""}
                            onChange={(v) => setArticle({ ...article, subtitle: v || null })}
                            onBlur={() => persistMeta({ subtitle: article.subtitle })}
                            testId="article-editor-subtitle"
                        />
                        <FieldLabel
                            label={t("ui.articles.author", "Autor")}
                            tooltip={t(
                                "ui.articles.author_tooltip",
                                "Autor des Artikels. Auswahl aus Echtnamen + Pseudonymen aus den Einstellungen.",
                            )}
                        />
                        {/* The "Add to Authors-DB" checkbox is
                        deliberately suppressed here because
                        ArticleEditor auto-saves on every keystroke —
                        an auto-DB-create at that rate would create
                        partial-name rows. Users curate via Settings >
                        Author tab. */}
                        <AuthorSelectInput
                            value={article.author ?? ""}
                            onChange={(v) => {
                                const next = v || null;
                                setArticle({ ...article, author: next });
                                void persistMeta({ author: next });
                            }}
                            suggestions={authorSuggestions}
                            profileChoices={profileDisplayNames(authorProfile)}
                            customOptionLabel={t(
                                "ui.author_select.custom_option",
                                "Anderer Name …",
                            )}
                            showAddToAuthorsCheckbox={false}
                            addToAuthorsDb={false}
                            onAddToAuthorsDbChange={() => {}}
                            testidPrefix="article-editor"
                            inputTestId="article-editor-author"
                            placeholder={t(
                                "ui.articles.author_placeholder",
                                "Autorenname oder Pen Name",
                            )}
                            addToAuthorsLabel=""
                        />
                        <FieldLabel
                            label={t("ui.articles.topic", "Thema")}
                            tooltip={t(
                                "ui.articles.topic_tooltip",
                                "Primaere Kategorie des Artikels. Verwaltet unter Einstellungen > Themen.",
                            )}
                        />
                        <TopicSelect
                            value={article.topic ?? ""}
                            topics={topics}
                            onChange={(v) => {
                                setArticle({ ...article, topic: v || null });
                                void persistMeta({ topic: v || null });
                            }}
                            onAddTopic={handleAddTopic}
                        />
                        <FieldLabel
                            label={t("ui.articles.language", "Sprache")}
                            tooltip={t(
                                "ui.articles.language_tooltip",
                                "Sprache des Artikelinhalts.",
                            )}
                        />
                        <RadixSelect
                            testId="article-editor-language"
                            ariaLabel={t("ui.articles.language", "Sprache")}
                            value={article.language}
                            onValueChange={(v) => {
                                setArticle({ ...article, language: v });
                                void persistMeta({ language: v });
                            }}
                            className="is-block"
                            options={SUPPORTED_LANGUAGES.map((opt) => ({
                                value: opt.code,
                                label: opt.label,
                            }))}
                        />
                        <FieldLabel
                            label={t("ui.articles.status", "Status")}
                            tooltip={t(
                                "ui.articles.status_tooltip",
                                "Lebenszyklus: Entwurf > Bereit > Veröffentlicht > Archiviert.",
                            )}
                        />
                        <RadixSelect
                            testId="article-editor-status"
                            ariaLabel={t("ui.articles.status", "Status")}
                            value={article.status}
                            onValueChange={(v) => persistMeta({ status: v as ArticleStatus })}
                            className="is-block"
                            options={STATUSES.map((s) => ({
                                value: s,
                                label: t(
                                    `ui.articles.status_${s}`,
                                    s.charAt(0).toUpperCase() + s.slice(1),
                                ),
                            }))}
                        />

                        {/* ARTICLE-TYPES-SSOT-01 C6 (2026-05-29):
                         *  Article-type selector + type-specific fields.
                         *  Type is mutable post-create (unlike Book.book_type
                         *  which is immutable_after_create); changing it
                         *  reveals a different per-type extra_fields set.
                         *  Blogpost + essay have no extra fields, so the
                         *  ContentTypeFieldsSection renders null for them.
                         */}
                        <FieldLabel
                            label={t("ui.articles.content_type", "Textart")}
                            tooltip={t(
                                "ui.articles.content_type_tooltip",
                                "Textart: Blogpost / Tutorial / Rezension / Essay / Newsletter.",
                            )}
                        />
                        <RadixSelect
                            testId="article-editor-content-type"
                            ariaLabel={t("ui.articles.content_type", "Textart")}
                            value={article.content_type}
                            onValueChange={(v) => {
                                const next = v as ContentType;
                                // Auto-reset article_metadata when type
                                // changes; the new type's extra_fields are
                                // likely a different shape from the old.
                                // Per-field carry-over (when keys overlap)
                                // can be added later if user-requested; for
                                // v1 a clean reset is least-surprising.
                                void persistMeta({
                                    content_type: next,
                                    article_metadata: {},
                                });
                            }}
                            className="is-block"
                            options={articleTypesSnapshot.ordered.map((at) => ({
                                value: at.id,
                                label: t(at.label_key, at.id),
                            }))}
                        />
                        {articleTypesSnapshot.types[article.content_type] ? (
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 12,
                                    marginTop: 4,
                                    color: "var(--text-muted)",
                                }}
                                data-testid="article-editor-content-type-description"
                            >
                                <ContentTypeIcon
                                    iconName={articleTypesSnapshot.types[article.content_type].icon}
                                    size={14}
                                />
                                <span>
                                    {t(
                                        articleTypesSnapshot.types[article.content_type]
                                            .description_key,
                                        article.content_type,
                                    )}
                                </span>
                            </div>
                        ) : null}
                        <ContentTypeFieldsSection
                            contentType={article.content_type}
                            metadata={article.article_metadata ?? {}}
                            onChange={(nextType, nextMetadata) => {
                                void persistMeta({
                                    content_type: nextType,
                                    article_metadata: nextMetadata,
                                });
                            }}
                        />

                        {showCore("seo") && (
                            <>
                                <h4 className={layout.sectionHeading}>
                                    {t("ui.articles.seo_section", "SEO")}
                                </h4>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <FieldLabel
                                        label={t("ui.articles.seo_title", "SEO-Titel")}
                                        tooltip={t(
                                            "ui.articles.seo_title_tooltip",
                                            "Suchmaschinen-optimierter Titel. Faellt leer auf den Artikeltitel zurück.",
                                        )}
                                    />
                                    <AiGenerateButton
                                        onClick={() => void handleAiGenerate("seo_title")}
                                        generating={aiGenerating === "seo_title"}
                                        disabled={!articleHasContent}
                                        tooltip={t(
                                            "ui.articles.seo_title_generate_tooltip",
                                            "SEO-Titel aus Artikelinhalt generieren (nutzt KI).",
                                        )}
                                        disabledReason={t(
                                            "ui.articles.ai_generate_needs_content",
                                            "Artikel braucht Inhalt, bevor KI generieren kann.",
                                        )}
                                        data-testid="article-editor-ai-seo-title"
                                    />
                                </div>
                                <input
                                    type="text"
                                    data-testid="article-editor-seo-title"
                                    value={article.seo_title ?? ""}
                                    maxLength={60}
                                    onChange={(e) =>
                                        setArticle({
                                            ...article,
                                            seo_title: e.target.value || null,
                                        })
                                    }
                                    onBlur={() => persistMeta({ seo_title: article.seo_title })}
                                    placeholder={t(
                                        "ui.articles.seo_title_placeholder",
                                        "Faellt leer auf Titel zurück",
                                    )}
                                    className={layout.fieldInput}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <FieldLabel
                                        label={t("ui.articles.seo_description", "SEO-Beschreibung")}
                                        tooltip={t(
                                            "ui.articles.seo_description_tooltip",
                                            "Suchmaschinen-Beschreibung. Faellt leer auf den Excerpt zurück.",
                                        )}
                                    />
                                    <AiGenerateButton
                                        onClick={() => void handleAiGenerate("seo_description")}
                                        generating={aiGenerating === "seo_description"}
                                        disabled={!articleHasContent}
                                        tooltip={t(
                                            "ui.articles.seo_description_generate_tooltip",
                                            "SEO-Beschreibung aus Artikelinhalt generieren (nutzt KI).",
                                        )}
                                        disabledReason={t(
                                            "ui.articles.ai_generate_needs_content",
                                            "Artikel braucht Inhalt, bevor KI generieren kann.",
                                        )}
                                        data-testid="article-editor-ai-seo-description"
                                    />
                                </div>
                                <textarea
                                    data-testid="article-editor-seo-description"
                                    value={article.seo_description ?? ""}
                                    onChange={(e) =>
                                        setArticle({
                                            ...article,
                                            seo_description: e.target.value || null,
                                        })
                                    }
                                    onBlur={() =>
                                        persistMeta({
                                            seo_description: article.seo_description,
                                        })
                                    }
                                    rows={3}
                                    placeholder={t(
                                        "ui.articles.seo_description_placeholder",
                                        "Faellt leer auf Excerpt zurück",
                                    )}
                                    className={layout.fieldInput}
                                    style={{
                                        resize: "vertical",
                                        fontFamily: "inherit",
                                        minHeight: "5em",
                                        lineHeight: 1.4,
                                    }}
                                />
                            </>
                        )}
                        {showCore("canonical_url") && (
                            <Field
                                label={t("ui.articles.canonical_url", "Canonical URL")}
                                tooltip={t(
                                    "ui.articles.canonical_url_tooltip",
                                    "Wenn der Artikel anderswo zuerst veröffentlicht wurde, hier dessen URL eintragen. Verhindert Duplicate-Content-Probleme bei SEO.",
                                )}
                                value={article.canonical_url ?? ""}
                                onChange={(v) =>
                                    setArticle({
                                        ...article,
                                        canonical_url: v || null,
                                    })
                                }
                                onBlur={() =>
                                    persistMeta({
                                        canonical_url: article.canonical_url,
                                    })
                                }
                                testId="article-editor-canonical-url"
                            />
                        )}
                        {showCore("featured_image") && (
                            <>
                                <FieldLabel
                                    label={t("ui.articles.featured_image_label", "Beitragsbild")}
                                    tooltip={t(
                                        "ui.articles.featured_image_tooltip",
                                        "Hero-Bild für Social-Media-Vorschauen (Open Graph / Twitter Card). Ablegen, klicken oder URL einfügen.",
                                    )}
                                />
                                <ArticleImageUpload
                                    articleId={article.id}
                                    value={article.featured_image_url}
                                    assetId={article.featured_image_asset_id}
                                    onChange={(url, assetId) => {
                                        setArticle({
                                            ...article,
                                            featured_image_url: url,
                                            featured_image_asset_id: assetId,
                                        });
                                        void persistMeta({
                                            featured_image_url: url,
                                            featured_image_asset_id: assetId,
                                        });
                                    }}
                                />
                                <Field
                                    label={t("ui.articles.featured_image_url_label", "...oder URL")}
                                    tooltip={t(
                                        "ui.articles.featured_image_url_tooltip",
                                        "Alternative: Adresse eines bereits gehosteten Bildes einfügen.",
                                    )}
                                    value={article.featured_image_url ?? ""}
                                    onChange={(v) =>
                                        // Typing a URL replaces any cached Dexie asset:
                                        // the resolver prefers the asset id, so clear it.
                                        setArticle({
                                            ...article,
                                            featured_image_url: v || null,
                                            featured_image_asset_id: null,
                                        })
                                    }
                                    onBlur={() =>
                                        persistMeta({
                                            featured_image_url: article.featured_image_url,
                                            featured_image_asset_id:
                                                article.featured_image_asset_id,
                                        })
                                    }
                                    testId="article-editor-featured-image"
                                    placeholder="https://..."
                                />
                            </>
                        )}
                        {showCore("excerpt") && (
                            <>
                                <FieldLabel
                                    label={t("ui.articles.excerpt", "Excerpt")}
                                    tooltip={t(
                                        "ui.articles.excerpt_tooltip",
                                        "Kurze Zusammenfassung. Wird für Newsletter-Vorschauen und SEO-Beschreibungen als Fallback verwendet.",
                                    )}
                                />
                                <textarea
                                    data-testid="article-editor-excerpt"
                                    value={article.excerpt ?? ""}
                                    onChange={(e) =>
                                        setArticle({
                                            ...article,
                                            excerpt: e.target.value || null,
                                        })
                                    }
                                    onBlur={() => persistMeta({ excerpt: article.excerpt })}
                                    rows={3}
                                    placeholder={t(
                                        "ui.articles.excerpt_placeholder",
                                        "Kurze Zusammenfassung für Newsletter und SEO-Snippets.",
                                    )}
                                    className={layout.fieldInput}
                                    style={{
                                        resize: "vertical",
                                        fontFamily: "inherit",
                                        minHeight: "5em",
                                        lineHeight: 1.4,
                                    }}
                                />
                            </>
                        )}
                        {showCore("tags") && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <FieldLabel
                                        label={t("ui.articles.tags_label", "Tags")}
                                        tooltip={t(
                                            "ui.articles.tags_tooltip",
                                            "Stichwoerter zur Kategorisierung und Suche. Mehrere Eintraege möglich (Enter zum Hinzufügen).",
                                        )}
                                    />
                                    <AiGenerateButton
                                        onClick={() => void handleAiGenerate("tags")}
                                        generating={aiGenerating === "tags"}
                                        disabled={!articleHasContent}
                                        tooltip={t(
                                            "ui.articles.tags_generate_tooltip",
                                            "Tags aus Artikelinhalt generieren (nutzt KI). Ersetzt aktuelle Tags.",
                                        )}
                                        disabledReason={t(
                                            "ui.articles.ai_generate_needs_content",
                                            "Artikel braucht Inhalt, bevor KI generieren kann.",
                                        )}
                                        data-testid="article-editor-ai-tags"
                                    />
                                </div>
                                <KeywordInput
                                    keywords={article.tags ?? []}
                                    onChange={(next) => {
                                        setArticle({ ...article, tags: next });
                                        void persistMeta({ tags: next });
                                    }}
                                />
                            </>
                        )}
                        <PublicationsPanel articleId={article.id} />

                        <h4 className={layout.sectionHeading}>
                            {t("ui.ai_template.editor_section", "KI-Vorlage")}
                        </h4>
                        <AITemplatePanel
                            kind="article"
                            id={article.id}
                            onApplied={() => {
                                // Re-fetch so updated metadata + tokens used
                                // appear in the sidebar immediately.
                                void getStorage()
                                    .articles.get(article.id)
                                    .then((fresh) => setArticle(fresh))
                                    .catch(() => {});
                            }}
                        />

                        <ArticleCommentsPanel articleId={article.id} />

                        <h4 className={layout.sectionHeading}>
                            {t("ui.articles.export_section", "Exportieren")}
                        </h4>
                        <div
                            data-testid="article-editor-export-panel"
                            style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                        >
                            {(["markdown", "html", "pdf", "docx", "latex"] as const).map((fmt) => (
                                <button
                                    key={fmt}
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={exporting !== null}
                                    onClick={() => void handleExport(fmt)}
                                    data-testid={`article-editor-export-${fmt}`}
                                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                    {exporting === fmt
                                        ? t("ui.articles.export_running", "Exportiere…")
                                        : t(`ui.articles.export_${fmt}`, fmt.toUpperCase())}
                                </button>
                            ))}
                        </div>

                        <ArticleTranslatePanel article={article} />

                        <button
                            type="button"
                            className={`btn btn-secondary btn-sm ${layout.deleteBtn}`}
                            onClick={() => void handleDelete()}
                            data-testid="article-editor-delete"
                        >
                            <Trash2 size={12} />
                            {t("ui.articles.delete", "Löschen")}
                        </button>
                    </aside>
    );
}
