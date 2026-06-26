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
import { Loader2, ArrowLeft, Home, MessageSquare, MoreVertical } from "lucide-react";

import { Author } from "../api/client";
import { AUTOSAVE_DEBOUNCE_MS } from "./articleEditorConstants";
import { getStorage } from "../storage";
import { useContentTypes } from "../hooks/useContentTypes";
import { SaveIndicator } from "../components/articles/ArticleEditorFields";
import Editor from "../components/editor/Editor";
import ThemeToggle from "../components/shared/ThemeToggle";
import EditableTitle from "../components/shared/EditableTitle";
import { useArticlePersistence } from "../hooks/article/useArticlePersistence";
import { useArticleEditorActions } from "../hooks/article/useArticleEditorActions";
import ArticleEditorSidebar from "../components/articles/ArticleEditorSidebar";
import { useDialog } from "../components/shared/AppDialog";
import { useI18n } from "../hooks/useI18n";
import { useSidebarCollapse } from "../hooks/ui/useSidebarCollapse";
import { SidebarToggleButton } from "../components/shared/SidebarToggleButton";
import { SidebarOverlay } from "../lib/components/SidebarOverlay";
import { EditorMenu } from "../lib/components/EditorMenu";
import { buildArticleEditorMenu } from "./buildArticleEditorMenu";
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
                    <ArticleEditorSidebar
                        article={article}
                        setArticle={setArticle}
                        persistMeta={persistMeta}
                        t={t}
                        articleTypesSnapshot={articleTypesSnapshot}
                        authorSuggestions={authorSuggestions}
                        authorProfile={authorProfile}
                        topics={topics}
                        handleAddTopic={handleAddTopic}
                        exporting={exporting}
                        handleExport={handleExport}
                        aiGenerating={aiGenerating}
                        articleHasContent={articleHasContent}
                        handleAiGenerate={handleAiGenerate}
                        handleDelete={handleDelete}
                        showCore={showCore}
                    />
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
