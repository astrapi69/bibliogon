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

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Save, ArrowLeft, Trash2, Home, AlertCircle, Languages, Download } from "lucide-react";

import { api, ApiError, Article, ArticleStatus } from "../api/client";
import Editor from "../components/Editor";
import ArticleImageUpload from "../components/ArticleImageUpload";
import KeywordInput from "../components/KeywordInput";
import AiGenerateButton from "../components/AiGenerateButton";
import ThemeToggle from "../components/ThemeToggle";
import Tooltip from "../components/Tooltip";
import { PublicationsPanel } from "../components/articles/PublicationsPanel";
import { useDialog } from "../components/AppDialog";
import { useI18n } from "../hooks/useI18n";
import { useAuthorProfile } from "../hooks/useAuthorProfile";
import { useTopics } from "../hooks/useTopics";
import { notify } from "../utils/notify";
import layout from "./ArticleEditor.module.css";

/** Languages Bibliogon UI ships in. Mirrors backend/config/i18n/. */
const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
    { code: "de", label: "Deutsch" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "pt", label: "Português" },
    { code: "el", label: "Ελληνικά" },
    { code: "tr", label: "Türkçe" },
    { code: "ja", label: "日本語" },
];

const AUTOSAVE_DEBOUNCE_MS = 1000;
const STATUSES: ArticleStatus[] = ["draft", "ready", "published", "archived"];

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function ArticleEditor() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { confirm } = useDialog();

    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const authorProfile = useAuthorProfile();
    const topicsFromHook = useTopics();
    // Local mirror of the settings topics list so inline-add via the
    // TopicSelect dropdown can append without waiting on a re-mount of
    // the hook. Synced from useTopics on every change.
    const [topics, setTopics] = useState<string[] | null>(topicsFromHook);
    useEffect(() => {
        setTopics(topicsFromHook);
    }, [topicsFromHook]);

    const handleAddTopic = useCallback(async (name: string): Promise<boolean> => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const current = topics ?? [];
        if (current.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
            // Already exists - just select it without a redundant PATCH.
            return true;
        }
        const next = [...current, trimmed];
        try {
            await api.settings.updateApp({ topics: next });
            setTopics(next);
            return true;
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.topic_add_failed", "Thema konnte nicht angelegt werden."),
                    err,
                );
            }
            return false;
        }
    }, [topics, t]);

    const lastSavedMeta = useRef<string>("");

    // Load article + initial content.
    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        api.articles
            .get(id)
            .then((a) => {
                if (cancelled) return;
                setArticle(a);
                lastSavedMeta.current = JSON.stringify({
                    title: a.title,
                    subtitle: a.subtitle,
                    author: a.author,
                    language: a.language,
                    status: a.status,
                    canonical_url: a.canonical_url,
                    featured_image_url: a.featured_image_url,
                    excerpt: a.excerpt,
                    tags: a.tags,
                    topic: a.topic,
                    seo_title: a.seo_title,
                    seo_description: a.seo_description,
                });
            })
            .catch((err) => {
                if (err instanceof ApiError) {
                    notify.error(
                        t(
                            "ui.articles.load_error",
                            "Konnte Artikel nicht laden.",
                        ),
                        err,
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id, t]);

    // Editor handles content persistence via its onSave callback.
    // ArticleEditor still owns metadata persistence (persistMeta).
    const persistContent = useCallback(
        async (json: string) => {
            if (!id) return;
            setSaveStatus("saving");
            try {
                await api.articles.update(id, { content_json: json });
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus("idle"), 2000);
            } catch (err) {
                if (err instanceof ApiError) {
                    setSaveStatus("error");
                    notify.error(
                        t(
                            "ui.articles.save_failed",
                            "Speichern fehlgeschlagen.",
                        ),
                        err,
                    );
                }
            }
        },
        [id, t],
    );

    const persistMeta = useCallback(
        async (patch: Partial<Article>) => {
            if (!id || !article) return;
            const next = { ...article, ...patch };
            setArticle(next);
            const meta = JSON.stringify({
                title: next.title,
                subtitle: next.subtitle,
                author: next.author,
                language: next.language,
                status: next.status,
                canonical_url: next.canonical_url,
                featured_image_url: next.featured_image_url,
                excerpt: next.excerpt,
                tags: next.tags,
                topic: next.topic,
                seo_title: next.seo_title,
                seo_description: next.seo_description,
            });
            if (meta === lastSavedMeta.current) return;
            try {
                const saved = await api.articles.update(id, {
                    title: patch.title,
                    subtitle: patch.subtitle as string | null | undefined,
                    author: patch.author as string | null | undefined,
                    language: patch.language,
                    status: patch.status as ArticleStatus | undefined,
                    canonical_url: patch.canonical_url as string | null | undefined,
                    featured_image_url: patch.featured_image_url as
                        | string
                        | null
                        | undefined,
                    excerpt: patch.excerpt as string | null | undefined,
                    tags: patch.tags,
                    topic: patch.topic as string | null | undefined,
                    seo_title: patch.seo_title as string | null | undefined,
                    seo_description: patch.seo_description as
                        | string
                        | null
                        | undefined,
                });
                setArticle(saved);
                lastSavedMeta.current = meta;
            } catch (err) {
                if (err instanceof ApiError) {
                    notify.error(
                        t(
                            "ui.articles.save_failed",
                            "Speichern fehlgeschlagen.",
                        ),
                        err,
                    );
                }
            }
        },
        [id, article, t],
    );

    // AR editor-parity Phase 2: translate this article into a new
     // target-language Article. The source stays untouched; the new
     // article opens in draft for review.
    const [translateOpen, setTranslateOpen] = useState(false);
    const [translateLang, setTranslateLang] = useState("en");
    const [translateProvider, setTranslateProvider] = useState<"deepl" | "lmstudio">("deepl");
    const [translating, setTranslating] = useState(false);
    type ProviderInfo = {
        id: string;
        name: string;
        configured: boolean;
        healthy: boolean;
        description: string;
    };
    const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

    // Fetch provider config + live health when the user opens the
    // panel. Combines /providers (config check, fast) with /health
    // (live ping; LMStudio ping has 5s timeout per the client).
    // Filtering by both means the dropdown only lists providers
    // that will actually translate - no 400s, no 120s timeouts.
    useEffect(() => {
        if (!translateOpen || providers !== null) return;
        let cancelled = false;
        Promise.all([
            api.articleTranslation.providers(),
            api.articleTranslation.health(),
        ])
            .then(([list, health]) => {
                if (cancelled) return;
                const enriched: ProviderInfo[] = list.map((p) => ({
                    ...p,
                    healthy: health[p.id]?.status === "ok",
                }));
                setProviders(enriched);
                // Default to the first available (configured AND
                // healthy) provider.
                const firstAvailable = enriched.find((p) => p.configured && p.healthy);
                if (firstAvailable && (firstAvailable.id === "deepl" || firstAvailable.id === "lmstudio")) {
                    setTranslateProvider(firstAvailable.id);
                }
            })
            .catch(() => setProviders([]));
        return () => {
            cancelled = true;
        };
    }, [translateOpen, providers]);

    const currentProvider = providers?.find((p) => p.id === translateProvider);
    const providerAvailable = currentProvider
        ? currentProvider.configured && currentProvider.healthy
        : true;
    const noProvidersAvailable =
        providers !== null && providers.every((p) => !p.configured || !p.healthy);

    const handleTranslate = async () => {
        if (!article || translating) return;
        if (translateLang === article.language) {
            notify.error(
                t(
                    "ui.articles.translate_same_language",
                    "Zielsprache muss von der Quellsprache abweichen.",
                ),
            );
            return;
        }
        setTranslating(true);
        try {
            const result = await api.articleTranslation.translate(
                article.id,
                translateLang,
                {sourceLang: article.language, provider: translateProvider},
            );
            notify.success(
                t("ui.articles.translate_success", "Übersetzung erstellt."),
            );
            setTranslateOpen(false);
            navigate(`/articles/${result.article_id}`);
        } catch (err) {
            if (err instanceof ApiError) {
                // Surface the backend detail (e.g. "No DeepL API key
                // configured...") via notify's ApiError content - the
                // generic title alone wasn't actionable.
                notify.error(
                    t(
                        "ui.articles.translate_failed",
                        "Übersetzung fehlgeschlagen.",
                    ),
                    err,
                );
            }
        } finally {
            setTranslating(false);
        }
    };

    // AR editor-parity Phase 3: export this article. Single-button-
    // per-format row (no modal) - the format set is small (4) and
    // each button kicks off a download immediately.
    type ExportFormat = "markdown" | "html" | "pdf" | "docx";
    const [exporting, setExporting] = useState<ExportFormat | null>(null);

    // AI metadata generation: SEO title / SEO description / tags.
    // ``aiGenerating`` holds the field currently in flight so the
    // matching button shows a spinner; other buttons stay clickable
    // (one-at-a-time semantic mirrors the export buttons above).
    type AiMetaField = "seo_title" | "seo_description" | "tags";
    const [aiGenerating, setAiGenerating] = useState<AiMetaField | null>(null);

    const articleHasContent = ((): boolean => {
        const json = article?.content_json?.trim();
        if (!json) return false;
        try {
            const parsed = JSON.parse(json);
            const stack: unknown[] = [parsed];
            while (stack.length) {
                const node = stack.pop();
                if (node && typeof node === "object") {
                    const text = (node as { text?: unknown }).text;
                    if (typeof text === "string" && text.trim()) return true;
                    const children = (node as { content?: unknown }).content;
                    if (Array.isArray(children)) stack.push(...children);
                }
            }
            return false;
        } catch {
            return Boolean(json);
        }
    })();

    async function handleAiGenerate(field: AiMetaField): Promise<void> {
        if (!article || aiGenerating) return;
        setAiGenerating(field);
        try {
            const result = await api.articles.generateMeta(article.id, field);
            if (field === "tags") {
                const next = result.generated_tags ?? [];
                setArticle({ ...article, tags: next });
                void persistMeta({ tags: next });
                notify.success(
                    t("ui.articles.tags_generated", "{count} Tags generiert.").replace(
                        "{count}",
                        String(next.length),
                    ),
                );
            } else {
                const text = result.generated_text ?? "";
                if (field === "seo_title") {
                    setArticle({ ...article, seo_title: text || null });
                    void persistMeta({ seo_title: text || null });
                    notify.success(
                        t("ui.articles.seo_title_generated", "SEO-Titel generiert."),
                    );
                } else {
                    setArticle({ ...article, seo_description: text || null });
                    void persistMeta({ seo_description: text || null });
                    notify.success(
                        t(
                            "ui.articles.seo_description_generated",
                            "SEO-Beschreibung generiert.",
                        ),
                    );
                }
            }
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.articles.ai_generation_failed",
                        "KI-Generierung fehlgeschlagen.",
                    ),
                    err,
                );
            }
        } finally {
            setAiGenerating(null);
        }
    }

    const handleExport = async (fmt: ExportFormat) => {
        if (!article || exporting) return;
        setExporting(fmt);
        try {
            await api.articleExport.download(article.id, fmt);
            notify.success(
                t("ui.articles.export_success", "Export gestartet."),
            );
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t("ui.articles.export_failed", "Export fehlgeschlagen."),
                    err,
                );
            }
        } finally {
            setExporting(null);
        }
    };

    async function handleDelete(): Promise<void> {
        if (!article) return;
        const ok = await confirm(
            t("ui.articles.delete_title", "Artikel löschen?"),
            t(
                "ui.articles.delete_trash_body",
                "Dieser Artikel wird in den Papierkorb verschoben und kann später wiederhergestellt werden.",
            ),
            "danger",
            { confirmLabel: t("ui.articles.delete_confirm", "Löschen") },
        );
        if (!ok) return;
        try {
            await api.articles.delete(article.id);
            notify.info(
                t("ui.articles.moved_to_trash", "In den Papierkorb verschoben"),
            );
            navigate("/articles");
        } catch (err) {
            if (err instanceof ApiError) {
                notify.error(
                    t(
                        "ui.articles.delete_failed",
                        "Löschen fehlgeschlagen.",
                    ),
                    err,
                );
            }
        }
    }

    if (loading || !article) {
        return (
            <div data-testid="article-editor-loading" className={layout.loading}>
                <Loader2 size={20} className="spin" />
                {t("ui.common.loading", "Laedt...")}
            </div>
        );
    }

    return (
        <div data-testid="article-editor" className={layout.page}>
            <header className={layout.header}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/articles")}
                    data-testid="article-editor-back"
                    title={t("ui.articles.back_to_list_tooltip", "Zur Artikelliste")}
                >
                    <ArrowLeft size={14} />
                    {t("ui.articles.back_to_list", "Zur Liste")}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate("/")}
                    data-testid="article-editor-dashboard"
                    title={t("ui.articles.back_to_dashboard_tooltip", "Zum Dashboard")}
                >
                    <Home size={14} />
                    {t("ui.articles.back_to_dashboard", "Dashboard")}
                </button>
                <input
                    data-testid="article-editor-title"
                    className={layout.titleInput}
                    value={article.title}
                    onChange={(e) =>
                        setArticle({ ...article, title: e.target.value })
                    }
                    onBlur={() => persistMeta({ title: article.title })}
                    placeholder={t(
                        "ui.articles.title_placeholder",
                        "Artikelüberschrift",
                    )}
                />
                <SaveIndicator status={saveStatus} />
                <ThemeToggle />
            </header>

            <main className={layout.body}>
                <aside className={layout.sidebar} data-testid="article-editor-sidebar">
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
                        onChange={(v) =>
                            setArticle({ ...article, subtitle: v || null })
                        }
                        onBlur={() =>
                            persistMeta({ subtitle: article.subtitle })
                        }
                        testId="article-editor-subtitle"
                    />
                    <FieldLabel
                        label={t("ui.articles.author", "Autor")}
                        tooltip={t(
                            "ui.articles.author_tooltip",
                            "Autor des Artikels. Auswahl aus Echtnamen + Pseudonymen aus den Einstellungen.",
                        )}
                    />
                    <AuthorSelect
                        value={article.author ?? ""}
                        profile={authorProfile}
                        onChange={(v) => {
                            setArticle({ ...article, author: v || null });
                            void persistMeta({ author: v || null });
                        }}
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
                    <select
                        data-testid="article-editor-language"
                        value={article.language}
                        onChange={(e) => {
                            const v = e.target.value;
                            setArticle({ ...article, language: v });
                            void persistMeta({ language: v });
                        }}
                        className={layout.fieldInput}
                    >
                        {SUPPORTED_LANGUAGES.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <FieldLabel
                        label={t("ui.articles.status", "Status")}
                        tooltip={t(
                            "ui.articles.status_tooltip",
                            "Lebenszyklus: Entwurf > Bereit > Veröffentlicht > Archiviert.",
                        )}
                    />
                    <select
                        data-testid="article-editor-status"
                        value={article.status}
                        onChange={(e) =>
                            persistMeta({
                                status: e.target.value as ArticleStatus,
                            })
                        }
                        className={layout.fieldInput}
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {t(
                                    `ui.articles.status_${s}`,
                                    s.charAt(0).toUpperCase() + s.slice(1),
                                )}
                            </option>
                        ))}
                    </select>

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
                        onBlur={() =>
                            persistMeta({ seo_title: article.seo_title })
                        }
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
                    <FieldLabel
                        label={t(
                            "ui.articles.featured_image_label",
                            "Beitragsbild",
                        )}
                        tooltip={t(
                            "ui.articles.featured_image_tooltip",
                            "Hero-Bild für Social-Media-Vorschauen (Open Graph / Twitter Card). Ablegen, klicken oder URL einfügen.",
                        )}
                    />
                    <ArticleImageUpload
                        articleId={article.id}
                        value={article.featured_image_url}
                        onChange={(v) => {
                            setArticle({...article, featured_image_url: v});
                            void persistMeta({featured_image_url: v});
                        }}
                    />
                    <Field
                        label={t(
                            "ui.articles.featured_image_url_label",
                            "...oder URL",
                        )}
                        tooltip={t(
                            "ui.articles.featured_image_url_tooltip",
                            "Alternative: Adresse eines bereits gehosteten Bildes einfügen.",
                        )}
                        value={article.featured_image_url ?? ""}
                        onChange={(v) =>
                            setArticle({
                                ...article,
                                featured_image_url: v || null,
                            })
                        }
                        onBlur={() =>
                            persistMeta({
                                featured_image_url: article.featured_image_url,
                            })
                        }
                        testId="article-editor-featured-image"
                        placeholder="https://..."
                    />
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
                    <PublicationsPanel articleId={article.id} />

                    <h4 className={layout.sectionHeading}>
                        {t("ui.articles.export_section", "Exportieren")}
                    </h4>
                    <div
                        data-testid="article-editor-export-panel"
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                    >
                        {(["markdown", "html", "pdf", "docx"] as const).map((fmt) => (
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

                    <h4 className={layout.sectionHeading}>
                        {t("ui.articles.translate_section", "Übersetzen")}
                    </h4>
                    {!translateOpen ? (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setTranslateOpen(true)}
                            data-testid="article-editor-translate-open"
                            style={{
                                alignSelf: "flex-start",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                            }}
                        >
                            <Languages size={12} />
                            {t("ui.articles.translate_open", "Diesen Artikel übersetzen")}
                        </button>
                    ) : (
                        <div
                            data-testid="article-editor-translate-panel"
                            style={{display: "flex", flexDirection: "column", gap: 6}}
                        >
                            <p style={{fontSize: "0.75rem", color: "var(--text-muted)", margin: 0}}>
                                {t(
                                    "ui.articles.translate_hint",
                                    "Erstellt einen neuen Artikel-Entwurf in der Zielsprache. Inline-Formatierung (fett/kursiv) geht beim Übersetzen verloren.",
                                )}
                            </p>
                            <label className={layout.fieldLabel}>
                                {t("ui.articles.translate_provider", "Anbieter")}
                            </label>
                            {(() => {
                                const visibleProviders = (providers ?? []).filter(
                                    (p) => p.configured && p.healthy,
                                );
                                if (providers !== null && visibleProviders.length === 0) {
                                    return (
                                        <p
                                            data-testid="article-editor-translate-no-providers"
                                            style={{
                                                fontSize: "0.75rem",
                                                color: "var(--error, #b91c1c)",
                                                margin: 0,
                                            }}
                                        >
                                            {t(
                                                "ui.articles.translate_no_providers",
                                                "Kein Übersetzungs-Anbieter konfiguriert. Einstellungen > Plugins > Translation öffnen, um DeepL oder LMStudio einzurichten.",
                                            )}
                                        </p>
                                    );
                                }
                                return (
                                    <select
                                        data-testid="article-editor-translate-provider"
                                        value={translateProvider}
                                        onChange={(e) =>
                                            setTranslateProvider(e.target.value as "deepl" | "lmstudio")
                                        }
                                        disabled={translating || providers === null}
                                        className={layout.fieldInput}
                                    >
                                        {visibleProviders.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                );
                            })()}
                            <label className={layout.fieldLabel}>
                                {t("ui.articles.translate_target_lang", "Zielsprache")}
                            </label>
                            <select
                                data-testid="article-editor-translate-lang"
                                value={translateLang}
                                onChange={(e) => setTranslateLang(e.target.value)}
                                disabled={translating}
                                className={layout.fieldInput}
                            >
                                {SUPPORTED_LANGUAGES.filter((l) => l.code !== article.language).map(
                                    (opt) => (
                                        <option key={opt.code} value={opt.code}>
                                            {opt.label}
                                        </option>
                                    ),
                                )}
                            </select>
                            <div style={{display: "flex", gap: 6}}>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => void handleTranslate()}
                                    disabled={
                                        translating ||
                                        !providerAvailable ||
                                        providers === null ||
                                        noProvidersAvailable
                                    }
                                    data-testid="article-editor-translate-submit"
                                >
                                    {translating ? (
                                        <>
                                            <Loader2 size={12} className="spin" />{" "}
                                            {t("ui.articles.translate_running", "Übersetzt…")}
                                        </>
                                    ) : (
                                        t("ui.articles.translate_submit", "Übersetzen")
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setTranslateOpen(false)}
                                    disabled={translating}
                                    data-testid="article-editor-translate-cancel"
                                >
                                    {t("ui.common.cancel", "Abbrechen")}
                                </button>
                            </div>
                        </div>
                    )}

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
                <div className={layout.editorPane}>
                    <Editor
                        contentKind="article"
                        content={article.content_json}
                        onSave={persistContent}
                        chapterId={article.id}
                        chapterTitle={article.title}
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
                        placeholder={t(
                            "ui.articles.editor_placeholder",
                            "Beginne zu schreiben...",
                        )}
                    />
                </div>
            </main>
        </div>
    );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
    const { t } = useI18n();
    // Always render something so the user always knows the save state.
    // Idle baseline = "All changes saved" (gray). Visible at rest, not
    // hidden after fade-out like the BookEditor's transient pill.
    if (status === "saving") {
        return (
            <span
                data-testid="article-editor-save-status"
                data-state="saving"
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8125rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <Loader2 size={12} className="spin" />
                {t("ui.articles.saving", "Speichert…")}
            </span>
        );
    }
    if (status === "error") {
        return (
            <span
                data-testid="article-editor-save-status"
                data-state="error"
                style={{
                    color: "var(--error, #b91c1c)",
                    fontSize: "0.8125rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <AlertCircle size={12} />
                {t("ui.articles.save_error_label", "Fehler")}
            </span>
        );
    }
    // idle + saved both render the same "saved" baseline (idle simply
    // means no edit since last save; the article is on disk either way).
    return (
        <span
            data-testid="article-editor-save-status"
            data-state={status}
            style={{
                color:
                    status === "saved"
                        ? "var(--success, #16a34a)"
                        : "var(--text-muted)",
                fontSize: "0.8125rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
            }}
        >
            <Save size={12} />
            {t("ui.articles.all_saved", "Alle Änderungen gespeichert")}
        </span>
    );
}

/** Settings-managed author select: optgroup with real name + pen
 *  names; "(none)" option when the article has no author or when the
 *  current value is unknown to settings. Mirrors the BookEditor
 *  AuthorPicker's matched-state ProfileSelect, simplified for the
 *  Article editor (Articles allow empty author, no three-mode banner). */
function AuthorSelect({
    value,
    profile,
    onChange,
}: {
    value: string;
    profile: { name: string; pen_names: string[] } | null;
    onChange: (next: string) => void;
}) {
    const { t } = useI18n();
    const choices = profile
        ? [profile.name, ...profile.pen_names].filter(Boolean)
        : [];
    const valueIsKnown = value === "" || choices.includes(value);
    return (
        <select
            data-testid="article-editor-author"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
                padding: "6px 8px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
            }}
        >
            <option value="">
                {t("ui.articles.author_none", "(kein Autor)")}
            </option>
            {profile && profile.name && (
                <optgroup label={profile.name}>
                    <option value={profile.name}>{profile.name}</option>
                    {profile.pen_names.map((pen) => (
                        <option key={pen} value={pen}>
                            {pen}
                        </option>
                    ))}
                </optgroup>
            )}
            {profile && !profile.name && profile.pen_names.length > 0 && (
                <optgroup label={t("ui.articles.author_pen_names", "Pseudonyme")}>
                    {profile.pen_names.map((pen) => (
                        <option key={pen} value={pen}>
                            {pen}
                        </option>
                    ))}
                </optgroup>
            )}
            {!valueIsKnown && (
                // Surface the unknown value so the user sees what is
                // currently set (e.g. legacy article author from a
                // pre-AR-02 migration). They can switch to a known
                // entry; the unknown entry stays selectable.
                <option value={value}>{value}</option>
            )}
        </select>
    );
}

function Field({
    label,
    value,
    onChange,
    onBlur,
    testId,
    placeholder,
    tooltip,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur: () => void;
    testId: string;
    placeholder?: string;
    tooltip?: string;
}) {
    return (
        <>
            <FieldLabel label={label} tooltip={tooltip} />
            <input
                data-testid={testId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                className={layout.fieldInput}
            />
        </>
    );
}

/** Sidebar label with optional Radix tooltip. The label text stays
 *  fully visible; when ``tooltip`` is set, the label becomes the
 *  hover trigger and renders the explanatory string on dwell. */
function FieldLabel({label, tooltip}: {label: string; tooltip?: string}) {
    if (!tooltip) {
        return <label className={layout.fieldLabel}>{label}</label>;
    }
    return (
        <Tooltip content={tooltip}>
            <label
                className={layout.fieldLabel}
                style={{
                    cursor: "help",
                    textDecoration: "underline dotted",
                    textDecorationColor: "var(--text-muted)",
                    textUnderlineOffset: "3px",
                }}
            >
                {label}
            </label>
        </Tooltip>
    );
}

/** Settings-managed topic select. Empty array (settings has no topics
 *  configured yet) renders a hint + disabled select; null (loading)
 *  renders a disabled select without the hint. Unknown current value
 *  is preserved as a one-off option so legacy data survives.
 *
 *  Includes a sentinel "+ Add new topic" option that prompts the user
 *  for a new topic name, persists it via onAddTopic (PATCH settings),
 *  then selects it. Saves a context-switch to the Settings page for
 *  the common "I want this topic right now" case. */
const ADD_TOPIC_SENTINEL = "__add_new_topic__";

function TopicSelect({
    value,
    topics,
    onChange,
    onAddTopic,
}: {
    value: string;
    topics: string[] | null;
    onChange: (next: string) => void;
    onAddTopic: (name: string) => Promise<boolean>;
}) {
    const { t } = useI18n();
    const list = topics ?? [];
    const valueIsKnown = value === "" || list.includes(value);
    const noTopicsConfigured = topics !== null && list.length === 0;

    // Inline-add state. When the user picks the "+ Add new topic"
    // sentinel, we hide the select, show a small input row, and let
    // them type + Enter to save (Escape cancels). Avoids the browser
    // default prompt() which doesn't match app conventions.
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const next = e.target.value;
        if (next === ADD_TOPIC_SENTINEL) {
            // Reset the select to the current value so closing the
            // inline input via Escape leaves the dropdown sane.
            e.target.value = value;
            setDraft("");
            setAdding(true);
            return;
        }
        onChange(next);
    };

    const commitDraft = async () => {
        const name = draft.trim();
        if (!name) {
            setAdding(false);
            return;
        }
        const ok = await onAddTopic(name);
        if (ok) onChange(name);
        setAdding(false);
        setDraft("");
    };

    const cancelDraft = () => {
        setAdding(false);
        setDraft("");
    };

    if (adding) {
        return (
            <div
                data-testid="article-editor-topic-add-row"
                style={{display: "flex", gap: 6, alignItems: "stretch"}}
            >
                <input
                    ref={inputRef}
                    data-testid="article-editor-topic-add-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void commitDraft();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelDraft();
                        }
                    }}
                    placeholder={t(
                        "ui.articles.topic_add_new_placeholder",
                        "Themenname",
                    )}
                    className={layout.fieldInput}
                    style={{flex: 1}}
                />
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void commitDraft()}
                    disabled={!draft.trim()}
                    data-testid="article-editor-topic-add-save"
                >
                    {t("ui.common.save", "Speichern")}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={cancelDraft}
                    data-testid="article-editor-topic-add-cancel"
                >
                    {t("ui.common.cancel", "Abbrechen")}
                </button>
            </div>
        );
    }

    return (
        <>
            <select
                data-testid="article-editor-topic"
                value={value}
                onChange={handleSelectChange}
                className={layout.fieldInput}
                disabled={topics === null}
            >
                <option value="">
                    {t("ui.articles.topic_none", "(kein Thema)")}
                </option>
                {list.map((topic) => (
                    <option key={topic} value={topic}>
                        {topic}
                    </option>
                ))}
                {!valueIsKnown && (
                    <option value={value}>{value}</option>
                )}
                <option value={ADD_TOPIC_SENTINEL} data-testid="article-editor-topic-add-new">
                    {t("ui.articles.topic_add_new", "+ Neues Thema hinzufügen")}
                </option>
            </select>
            {noTopicsConfigured && (
                <p
                    data-testid="article-editor-topic-empty-hint"
                    style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: 4,
                    }}
                >
                    {t(
                        "ui.articles.topic_empty_hint",
                        "Themen in den Einstellungen verwalten.",
                    )}
                </p>
            )}
        </>
    );
}
