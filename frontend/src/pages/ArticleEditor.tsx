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
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Loader2, Save, ArrowLeft, Trash2, Home, AlertCircle } from "lucide-react";

import { api, ApiError, Article, ArticleStatus } from "../api/client";
import { PublicationsPanel } from "../components/articles/PublicationsPanel";
import { useDialog } from "../components/AppDialog";
import { useI18n } from "../hooks/useI18n";
import { useAuthorProfile } from "../hooks/useAuthorProfile";
import { notify } from "../utils/notify";

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
const STATUSES: ArticleStatus[] = ["draft", "published", "archived"];

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

    const lastSavedJson = useRef<string>("");
    const lastSavedMeta = useRef<string>("");
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                lastSavedJson.current = a.content_json;
                lastSavedMeta.current = JSON.stringify({
                    title: a.title,
                    subtitle: a.subtitle,
                    author: a.author,
                    language: a.language,
                    status: a.status,
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

    const persistContent = useCallback(
        async (json: string) => {
            if (!id || json === lastSavedJson.current) return;
            setSaveStatus("saving");
            try {
                await api.articles.update(id, { content_json: json });
                lastSavedJson.current = json;
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

    const debouncedSave = useCallback(
        (json: string) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            setSaveStatus("saving");
            saveTimer.current = setTimeout(
                () => void persistContent(json),
                AUTOSAVE_DEBOUNCE_MS,
            );
        },
        [persistContent],
    );

    const editor = useEditor({
        extensions: [StarterKit, Link.configure({ openOnClick: false })],
        // Explicit editable=true. Default is true but stating it
        // protects against future TipTap default flips and makes the
        // contract obvious to readers wondering "why is the editor
        // read-only" (the smoke-test bug we just fixed).
        editable: true,
        // Initial content; subsequent article loads / id swaps go
        // through editor.commands.setContent in the effect below so
        // we don't blow away the editor instance + selection state on
        // every async load.
        content: "",
        onUpdate: ({ editor }) => {
            if (!article) return;
            debouncedSave(JSON.stringify(editor.getJSON()));
        },
    });

    // Push article content into the editor whenever the article id
    // changes (load, switch from another article, hard reload). Using
    // setContent keeps the editor instance stable + does not fire
    // onUpdate (so we don't echo a save back to the server on load).
    useEffect(() => {
        if (!editor || !article) return;
        const parsed = safeParse(article.content_json);
        // emitUpdate=false avoids round-tripping the load back into a
        // PATCH save (the second positional arg in TipTap v2's
        // setContent API).
        editor.commands.setContent(parsed, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, article?.id]);

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

    async function handleDelete(): Promise<void> {
        if (!article) return;
        const ok = await confirm(
            t("ui.articles.delete_title", "Artikel löschen?"),
            t(
                "ui.articles.delete_body",
                "Dieser Artikel wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
            ),
            "danger",
            { confirmLabel: t("ui.articles.delete_confirm", "Löschen") },
        );
        if (!ok) return;
        try {
            await api.articles.delete(article.id);
            notify.success(
                t("ui.articles.deleted", "Artikel gelöscht."),
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

    if (loading || !article || !editor) {
        return (
            <div data-testid="article-editor-loading" style={layout.loading}>
                <Loader2 size={20} className="spin" />
                {t("ui.common.loading", "Laedt...")}
            </div>
        );
    }

    const wordCount = editor.getText().trim().split(/\s+/).filter(Boolean).length;

    return (
        <div data-testid="article-editor" style={layout.page}>
            <header style={layout.header}>
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
                    style={layout.titleInput}
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
            </header>

            <main style={layout.body}>
                <div style={layout.editorPane}>
                    <EditorContent editor={editor} />
                    <p
                        data-testid="article-editor-word-count"
                        style={layout.wordCount}
                    >
                        {t("ui.articles.word_count", "{count} Wörter").replace(
                            "{count}",
                            String(wordCount),
                        )}
                    </p>
                </div>
                <aside style={layout.sidebar}>
                    <h3 style={layout.sidebarHeading}>
                        {t("ui.articles.metadata_heading", "Metadaten")}
                    </h3>
                    <Field
                        label={t("ui.articles.subtitle", "Untertitel")}
                        value={article.subtitle ?? ""}
                        onChange={(v) =>
                            setArticle({ ...article, subtitle: v || null })
                        }
                        onBlur={() =>
                            persistMeta({ subtitle: article.subtitle })
                        }
                        testId="article-editor-subtitle"
                    />
                    <label style={layout.fieldLabel}>
                        {t("ui.articles.author", "Autor")}
                    </label>
                    <AuthorSelect
                        value={article.author ?? ""}
                        profile={authorProfile}
                        onChange={(v) => {
                            setArticle({ ...article, author: v || null });
                            void persistMeta({ author: v || null });
                        }}
                    />
                    <label style={layout.fieldLabel}>
                        {t("ui.articles.language", "Sprache")}
                    </label>
                    <select
                        data-testid="article-editor-language"
                        value={article.language}
                        onChange={(e) => {
                            const v = e.target.value;
                            setArticle({ ...article, language: v });
                            void persistMeta({ language: v });
                        }}
                        style={layout.fieldInput}
                    >
                        {SUPPORTED_LANGUAGES.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <label style={layout.fieldLabel}>
                        {t("ui.articles.status", "Status")}
                    </label>
                    <select
                        data-testid="article-editor-status"
                        value={article.status}
                        onChange={(e) =>
                            persistMeta({
                                status: e.target.value as ArticleStatus,
                            })
                        }
                        style={layout.fieldInput}
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
                    <Field
                        label={t("ui.articles.canonical_url", "Canonical URL")}
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
                    <Field
                        label={t(
                            "ui.articles.featured_image_url",
                            "Featured Image URL",
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
                    />
                    <Field
                        label={t("ui.articles.excerpt", "Excerpt")}
                        value={article.excerpt ?? ""}
                        onChange={(v) =>
                            setArticle({
                                ...article,
                                excerpt: v || null,
                            })
                        }
                        onBlur={() => persistMeta({ excerpt: article.excerpt })}
                        testId="article-editor-excerpt"
                    />
                    <Field
                        label={t("ui.articles.tags_label", "Tags (comma-separated)")}
                        value={(article.tags ?? []).join(", ")}
                        onChange={(v) =>
                            setArticle({
                                ...article,
                                tags: v
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                            })
                        }
                        onBlur={() => persistMeta({ tags: article.tags })}
                        testId="article-editor-tags"
                    />
                    <PublicationsPanel articleId={article.id} />
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleDelete()}
                        data-testid="article-editor-delete"
                        style={layout.deleteBtn}
                    >
                        <Trash2 size={12} />
                        {t("ui.articles.delete", "Löschen")}
                    </button>
                </aside>
            </main>
        </div>
    );
}

// TipTap Content can be a JSON object or string; both are accepted by
// the editor. Returning a parsed JSON object preserves doc structure;
// falling back to an empty string lets the editor start with a blank
// doc when content_json is empty or malformed.
function safeParse(raw: string): object | string {
    try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : "";
    } catch {
        return "";
    }
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
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur: () => void;
    testId: string;
}) {
    return (
        <>
            <label style={layout.fieldLabel}>{label}</label>
            <input
                data-testid={testId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                style={layout.fieldInput}
            />
        </>
    );
}

const layout: Record<string, React.CSSProperties> = {
    page: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-primary)",
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
    },
    titleInput: {
        flex: 1,
        fontSize: "1.25rem",
        fontWeight: 600,
        border: "none",
        background: "transparent",
        outline: "none",
        color: "var(--text-primary)",
    },
    body: {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        minHeight: 0,
    },
    editorPane: {
        overflowY: "auto",
        padding: "24px 32px",
    },
    wordCount: {
        marginTop: 16,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
    sidebar: {
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-card)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
    },
    sidebarHeading: {
        margin: 0,
        marginBottom: 8,
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--text-secondary)",
    },
    fieldLabel: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        marginTop: 8,
    },
    fieldInput: {
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontSize: "0.875rem",
    },
    deleteBtn: {
        marginTop: 16,
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: "var(--error, #b91c1c)",
    },
    loading: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 32,
        color: "var(--text-muted)",
    },
};
