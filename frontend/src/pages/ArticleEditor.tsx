/**
 * AR-01 Phase 1 + AR-02 Phase 2 ArticleEditor.
 *
 * Standalone TipTap editor for long-form articles. Differs from the
 * BookEditor:
 * - No chapter sidebar (articles are single documents).
 * - No front-matter tabs.
 * - Simpler header (title + status + save indicator).
 * - Sidebar shows: subtitle, author, language, status, word count,
 *   canonical SEO fields (Phase 2), and the per-platform
 *   PublicationsPanel (Phase 2).
 *
 * Phase 1 explicitly skips: AI review extension wiring (chapter-id
 * coupled; Phase 1.5).
 *
 * Phase 2 explicitly skips: platform API integration, scheduled
 * publishing, analytics, plugin extraction.
 *
 * Auto-save: debounced 1 s on every TipTap update. Same pattern as
 * BookEditor's chapter save but simpler (single document, no
 * optimistic-lock version counter - Phase 1 articles don't need it
 * because the only writer is the local editor).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { setDocumentMeta, resetDocumentMeta } from "../lib/utils/documentMeta";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Loader2, ArrowLeft, Trash2, Home, MessageSquare, MoreVertical } from "lucide-react";

import { ArticleStatus, ContentType, Author } from "../api/client";
import {
    SUPPORTED_LANGUAGES,
    AUTOSAVE_DEBOUNCE_MS,
    STATUSES,
} from "./articleEditorConstants";
import { getStorage } from "../storage";
import { useContentTypes } from "../hooks/useContentTypes";
import { ContentTypeIcon } from "../utils/icons/contentTypeIcon";
import ContentTypeFieldsSection from "../components/articles/ContentTypeFieldsSection";
import {
    Field,
    FieldLabel,
    SaveIndicator,
    TopicSelect,
} from "../components/articles/ArticleEditorFields";
import Editor from "../components/editor/Editor";
import ArticleImageUpload from "../components/articles/ArticleImageUpload";
import KeywordInput from "../components/book/KeywordInput";
import AiGenerateButton from "../components/shared/AiGenerateButton";
import ThemeToggle from "../components/shared/ThemeToggle";
import AuthorSelectInput from "../components/shared/AuthorSelectInput";
import EditableTitle from "../components/shared/EditableTitle";
import { PublicationsPanel } from "../components/articles/PublicationsPanel";
import ArticleCommentsPanel from "../components/articles/ArticleCommentsPanel";
import ArticleTranslatePanel from "../components/articles/ArticleTranslatePanel";
import { useArticlePersistence } from "../hooks/article/useArticlePersistence";
import { useArticleEditorActions } from "../hooks/article/useArticleEditorActions";
import AITemplatePanel from "../components/shared/AITemplatePanel";
import { useDialog } from "../components/shared/AppDialog";
import { useI18n } from "../hooks/useI18n";
import { useSidebarCollapse } from "../hooks/ui/useSidebarCollapse";
import { SidebarToggleButton } from "../components/shared/SidebarToggleButton";
import { SidebarOverlay } from "../lib/components/SidebarOverlay";
import { EditorMenu } from "../lib/components/EditorMenu";
import { buildArticleEditorMenu } from "./buildArticleEditorMenu";
import { RadixSelect } from "../components/shared/RadixSelect";
import { useAuthorProfile, profileDisplayNames } from "../hooks/useAuthorProfile";
import layout from "./ArticleEditor.module.css";


export default function ArticleEditor() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { confirm } = useDialog();
    const articleTypesSnapshot = useContentTypes();
    const {
        open: sidebarOpen,
        toggle: toggleSidebar,
        setOpen: setSidebarOpen,
    } = useSidebarCollapse("bibliogon-article-editor-sidebar");

    const { article, setArticle, loading, saveStatus, persistContent, persistMeta } =
        useArticlePersistence(id, t);
    const authorProfile = useAuthorProfile();

    // SEO (#605): per-article document title + og/twitter meta for shared
    // links. Native DOM (setDocumentMeta), works offline; restored on unmount.
    useEffect(() => {
        if (article) {
            setDocumentMeta({
                title: article.title,
                description: article.seo_description || article.excerpt || undefined,
                type: "article",
            });
        }
        return () => resetDocumentMeta();
    }, [article?.id, article?.title, article?.seo_description, article?.excerpt]);

    // AUTHOR-DATALIST-EXTEND-EDITORS-01: Pattern A author selection
    // for the Article editor — free-text input + autocomplete
    // suggestions union'd from user-profile names + Authors-DB.
    // Mirrors the BookMetadataEditor + CreateBookModal precedents.
    // Article-side does NOT expose the add-to-DB checkbox per the
    // auto-save-on-keystroke rationale (see consumer site below).
    const [globalAuthors, setGlobalAuthors] = useState<Author[]>([]);
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .authors.list({})
            .then((rows) => {
                if (!cancelled) setGlobalAuthors(rows);
            })
            .catch(() => {
                // Non-critical; suggestions degrade to profile names.
            });
        return () => {
            cancelled = true;
        };
    }, []);
    const authorSuggestions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const c of profileDisplayNames(authorProfile)) {
            const trimmed = c.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                out.push(trimmed);
            }
        }
        for (const a of globalAuthors) {
            const trimmed = a.name.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                out.push(trimmed);
            }
        }
        return out;
    }, [authorProfile, globalAuthors]);

    const {
        topics,
        handleAddTopic,
        exporting,
        handleExport,
        aiGenerating,
        articleHasContent,
        handleAiGenerate,
        handleDelete,
        handleReclassifyAsComment,
    } = useArticleEditorActions({ article, setArticle, persistMeta, navigate, confirm, t });

    if (loading || !article) {
        return (
            <div data-testid="article-editor-loading" className={layout.loading}>
                <Loader2 size={20} className="spin" />
                {t("ui.common.loading", "Laedt...")}
            </div>
        );
    }

    // ARTICLE-TYPES-FIELD-VISIBILITY-01: per-type visibility of the
    // optional core sidebar fields, driven by the SSoT
    // content-types.yaml ``core_fields`` list. ``null`` (key omitted)
    // = show all (permissive default); an explicit list = show only
    // those. Identity fields (title/subtitle/author/language/topic/
    // status) are always shown and never gated here.
    const coreFields = articleTypesSnapshot.types[article.content_type]?.core_fields;
    const showCore = (field: string): boolean => coreFields == null || coreFields.includes(field);

    const articleMenu = buildArticleEditorMenu({
        t,
        navigate,
        onExport: (fmt) => void handleExport(fmt),
        onDelete: () => void handleDelete(),
        onAiGenerate: (field) => void handleAiGenerate(field),
    });

    return (
        <div data-testid="article-editor" className={layout.page}>
            <h1 className="sr-only">{article.title || "Bibliogon"}</h1>
            <header className={`${layout.header} flex-wrap`}>
                <SidebarToggleButton
                    open={sidebarOpen}
                    onToggle={toggleSidebar}
                    testId="article-editor-sidebar-toggle"
                />
                <EditorMenu
                    groups={articleMenu.groups}
                    onAction={articleMenu.onAction}
                    disabled={articleMenu.disabled}
                    triggerLabel={t("ui.editor_menu.open", "Menü")}
                    testIdPrefix="article-editor-menu"
                />
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/articles")}
                    data-testid="article-editor-back"
                    title={t("ui.articles.back_to_list_tooltip", "Zur Artikelliste")}
                >
                    <ArrowLeft size={14} />
                    <span className="hidden sm:inline">
                        {t("ui.articles.back_to_list", "Zur Liste")}
                    </span>
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/")}
                    data-testid="article-editor-dashboard"
                    title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                >
                    <Home size={14} />
                    <span className="hidden sm:inline">
                        {t("ui.articles.back_to_dashboard", "Dashboard")}
                    </span>
                </button>
                <EditableTitle
                    value={article.title}
                    onSave={(newTitle) => persistMeta({ title: newTitle })}
                    testIdPrefix="article-editor-title"
                    placeholder={t("ui.articles.title_placeholder", "Artikelüberschrift")}
                    textClassName={layout.titleInput}
                    inputClassName={layout.titleInput}
                    isPublished={article.status === "published" || article.status === "archived"}
                />
                <SaveIndicator status={saveStatus} />
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="btn-icon"
                            data-testid="article-editor-actions-menu"
                            aria-label={t("ui.articles.actions_menu", "Aktionen")}
                            title={t("ui.articles.actions_menu", "Aktionen")}
                        >
                            <MoreVertical size={16} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                        <DropdownMenu.Content
                            className="hamburger-menu-content"
                            align="end"
                            sideOffset={4}
                        >
                            <DropdownMenu.Item
                                className="hamburger-menu-item"
                                data-testid="article-editor-menu-reclassify"
                                onSelect={() => void handleReclassifyAsComment()}
                            >
                                <MessageSquare size={14} />{" "}
                                {t("ui.articles.reclassify_action", "Move to comments")}
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <ThemeToggle />
            </header>

            <main id="main-content" className="flex flex-1 min-h-0">
                <SidebarOverlay
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    testId="article-editor-sidebar-overlay"
                />
                <div
                    data-testid="article-editor-sidebar-wrapper"
                    data-sidebar-open={sidebarOpen}
                    className={[
                        "shrink-0 overflow-hidden transition-[width] duration-200",
                        "fixed inset-y-0 left-0 z-[90] shadow-[var(--shadow-md)]",
                        "menu:static menu:inset-auto menu:z-auto menu:shadow-none",
                        sidebarOpen ? "w-[300px]" : "w-0",
                    ].join(" ")}
                >
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
                </div>
                <div className={`${layout.editorPane} flex-1 min-w-0`}>
                    <Editor
                        contentKind="article"
                        content={article.content_json}
                        onSave={persistContent}
                        chapterId={article.id}
                        chapterTitle={article.title}
                        documentTitle={article.title}
                        documentSubtitle={article.subtitle ?? undefined}
                        bookContext={{
                            title: article.title,
                            author: article.author ?? "",
                            language: article.language,
                            // Topic doubles as a coarse "genre" for the
                            // AI prompt context block. Empty when not set.
                            genre: article.topic ?? "",
                            description: article.excerpt ?? "",
                        }}
                        autosaveDebounceMs={AUTOSAVE_DEBOUNCE_MS}
                        placeholder={t("ui.articles.editor_placeholder", "Beginne zu schreiben...")}
                    />
                </div>
            </main>
        </div>
    );
}
