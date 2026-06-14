import { useState, useEffect, useMemo } from "react";
import {
    api,
    ApiError,
    Author,
    Book,
    BookDetail,
    type GitSyncMappingStatus,
} from "../api/client";
import { getStorage } from "../storage";
import { useStorageMode } from "../storage/useStorageMode";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../features/featureConfig";
import { aiChat, getAiConfig, isAiConfigured } from "../ai/llmClient";
import { buildMarketingMessages } from "../ai/marketingPrompts";
import { Save, Copy, ChevronLeft, Sparkles, Rocket } from "lucide-react";
import { notify } from "../utils/notify";
import { useI18n } from "../hooks/useI18n";
import { useBookTypes } from "../hooks/useBookTypes";
import { useAuthorProfile, profileDisplayNames } from "../hooks/useAuthorProfile";
import { useEditorPluginStatus, isPluginAvailable } from "../hooks/useEditorPluginStatus";
import KeywordInput from "./KeywordInput";
import PdfExportControls from "./PdfExportControls";
import CategoryInput from "./CategoryInput";
import BisacCodeInput from "./BisacCodeInput";
import CoverUpload from "./CoverUpload";
import * as Tabs from "@radix-ui/react-tabs";
import QualityTab, { NavigableFindingType } from "./QualityTab";
import TranslationLinks from "./TranslationLinks";
import AITemplatePanel from "./AITemplatePanel";
import KdpPublishingWizard from "./kdp-wizard/KdpPublishingWizard";
import { Row, Field, AuthorSelectField, RepositoryUrlField } from "./book-metadata/MetadataFields";
import { HtmlFieldWithPreview } from "./book-metadata/HtmlField";
import { AuthorAssetsPanel } from "./book-metadata/AuthorAssetsPanel";
import AudiobookBookConfig from "./book-metadata/AudiobookConfig";
import AudiobookDownloads from "./book-metadata/AudiobookDownloads";
import styles from "./BookMetadataEditor.module.css";

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
    const [form, setForm] = useState<Record<string, string | null>>({});
    const [keywords, setKeywords] = useState<string[]>([]);
    // Bug 9: Books-only subject categorisation. Pair of free-text +
    // format-validated chip lists in the Marketing tab.
    const [categories, setCategories] = useState<string[]>([]);
    const [bisacCodes, setBisacCodes] = useState<string[]>([]);
    // KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01: bundled KDP category
    // catalog (26 Amazon-canonical names), fetched once per
    // BookMetadataEditor mount and fed to CategoryInput's
    // `suggestions` prop. Empty until the fetch resolves; on
    // failure stays empty (CategoryInput is free-text-capable, so
    // a missing catalog degrades gracefully to plain typing).
    const [kdpCategoriesCatalog, setKdpCategoriesCatalog] = useState<string[]>([]);
    // BOOK-REPOSITORY-URL-FIELD-01 C3: snapshot of the
    // plugin-git-sync mapping for this book. When ``mapped=true``,
    // the General-tab Repository-URL field switches to read-only
    // and surfaces ``status.repo_url`` (the canonical URL the
    // round-trip uses). When ``mapped=false`` OR the call fails,
    // the field falls back to free input editing ``Book.repository_url``.
    const [gitSyncStatus, setGitSyncStatus] = useState<GitSyncMappingStatus | null>(null);
    const [audiobookOverwrite, setAudiobookOverwrite] = useState<boolean>(false);
    const [audiobookSkipTypes, setAudiobookSkipTypes] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [showKdpWizard, setShowKdpWizard] = useState(false);
    const [aiGenerating, setAiGenerating] = useState<string | null>(null);
    const { status: pluginStatus } = useEditorPluginStatus();
    const { mode } = useStorageMode();
    const offline = mode === "dexie";
    // Backend-only convenience probes resolve through the central feature
    // registry instead of a raw mode check. Both are DESKTOP_ONLY, so
    // isActive is false exactly when offline — behaviour-equivalent to the
    // former mode==="dexie" guard, without the architecture violation.
    const gitSyncActive = useFeature(FEATURES.GIT_SYNC).isActive;
    const kdpCatalogActive = useFeature(FEATURES.KDP_CATEGORY_CATALOG).isActive;
    // Offline the AI plugin probe is empty (backend-only); the marketing
    // generate instead runs browser-direct, so availability follows whether
    // the user configured an AI key in Settings.
    const [offlineAiReady, setOfflineAiReady] = useState(false);
    useEffect(() => {
        if (!offline) return;
        let cancelled = false;
        void getAiConfig().then((cfg) => {
            if (!cancelled) setOfflineAiReady(isAiConfigured(cfg));
        });
        return () => {
            cancelled = true;
        };
    }, [offline]);
    const authorProfile = useAuthorProfile();

    useEffect(() => {
        setForm({
            author: book.author || "",
            language: book.language || "de",
            subtitle: book.subtitle || "",
            description: book.description || "",
            book_idea: book.book_idea || "",
            expose: book.expose || "",
            // Writing goals (WRITING-GOALS-PROGRESS-TRACKING-01).
            word_target: book.word_target != null ? String(book.word_target) : "",
            word_target_deadline: book.word_target_deadline || "",
            edition: book.edition || "",
            publisher: book.publisher || "",
            publisher_city: book.publisher_city || "",
            publish_date: book.publish_date || "",
            isbn_ebook: book.isbn_ebook || "",
            isbn_paperback: book.isbn_paperback || "",
            isbn_hardcover: book.isbn_hardcover || "",
            asin_ebook: book.asin_ebook || "",
            asin_paperback: book.asin_paperback || "",
            asin_hardcover: book.asin_hardcover || "",
            html_description: book.html_description || "",
            backpage_description: book.backpage_description || "",
            backpage_author_bio: book.backpage_author_bio || "",
            cover_image: book.cover_image || "",
            custom_css: book.custom_css || "",
            tts_engine: book.tts_engine || "",
            tts_voice: book.tts_voice || "",
            tts_speed: book.tts_speed || "1.0",
            audiobook_merge: book.audiobook_merge || "merged",
            audiobook_filename: book.audiobook_filename || "",
            repository_url: book.repository_url || "",
        });
        setKeywords(Array.isArray(book.keywords) ? book.keywords : []);
        setCategories(Array.isArray(book.categories) ? book.categories : []);
        setBisacCodes(Array.isArray(book.bisac_codes) ? book.bisac_codes : []);
        setAudiobookOverwrite(Boolean(book.audiobook_overwrite_existing));
        setAudiobookSkipTypes(
            Array.isArray(book.audiobook_skip_chapter_types)
                ? book.audiobook_skip_chapter_types
                : [],
        );
    }, [book]);

    // KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01: one-shot fetch of the
    // KDP-category catalog on mount. Cached for the editor's
    // lifetime — Amazon-side catalog is stable across the surface,
    // no need to re-fetch on every book change. Failure stays at
    // empty list; CategoryInput remains free-text-capable.
    useEffect(() => {
        // KDP category catalog is a backend-only convenience; when the
        // feature is inactive (dexie) the field stays free-text. Skip the
        // fetch so dexie mode fires no /api call.
        if (!kdpCatalogActive) return;
        let cancelled = false;
        api.kdp
            .listCategories()
            .then((catalog) => {
                if (!cancelled) setKdpCategoriesCatalog(catalog);
            })
            .catch(() => {
                // Silent degrade — autocomplete is a convenience, not
                // a correctness requirement. The Categories field
                // still accepts free-text input via CategoryInput.
            });
        return () => {
            cancelled = true;
        };
    }, [kdpCatalogActive]);

    // BOOK-REPOSITORY-URL-FIELD-01 C3: fetch the GitSyncMapping
    // status for this book on mount + on book.id change. When
    // ``mapped=true``, the Repository-URL field renders read-only
    // and shows the mapping's canonical URL (the round-trip uses
    // it; manual edits would diverge from the on-disk clone).
    // Silent failure: gitSyncStatus stays null, the field falls
    // back to free-input editing Book.repository_url.
    useEffect(() => {
        // Git-sync is a backend-only feature; when inactive (dexie) the
        // Repository-URL field stays free-input. Skip the status probe so
        // dexie mode fires no /api call.
        if (!gitSyncActive) return;
        let cancelled = false;
        api.gitSync
            .status(book.id)
            .then((status) => {
                if (!cancelled) setGitSyncStatus(status);
            })
            .catch(() => {
                // Silent degrade — the field still works as a
                // free input. Most-likely cause: the git-sync
                // router is not registered (plugin disabled).
            });
        return () => {
            cancelled = true;
        };
    }, [book.id, gitSyncActive]);

    // AUTHOR-DATALIST-EXTEND-EDITORS-01: Pattern A (Datalist) author
    // selection. The dropdown lists ONLY the user's profile authors
    // (real name + pen names); the Authors-Database is loaded purely to
    // gate the "Add to database" checkbox, never to feed suggestions —
    // a book's author is the user's identity, not a catalog entry.
    const [globalAuthors, setGlobalAuthors] = useState<Author[]>([]);
    const [addAuthorToDb, setAddAuthorToDb] = useState(true);
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .authors.list({})
            .then((rows) => {
                if (!cancelled) setGlobalAuthors(rows);
            })
            .catch(() => {
                // Non-critical; the datalist degrades to user-profile
                // suggestions only.
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
        return out;
    }, [authorProfile]);
    const showAddToAuthorsCheckbox = useMemo(() => {
        const trimmed = (form.author ?? "").trim().toLowerCase();
        if (!trimmed) return false;
        return !globalAuthors.some((a) => a.name.trim().toLowerCase() === trimmed);
    }, [form.author, globalAuthors]);

    const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

    // Writing-target deadline hint (WRITING-GOALS-PROGRESS-TRACKING-01):
    // "N days left, ~X words/day for the full target". Derived from the
    // target ÷ days remaining (an at-a-glance pace, not subtracting
    // already-written words — the metadata editor doesn't hold the live
    // total).
    const wordsPerDayHint = useMemo(() => {
        const target = parseInt(form.word_target ?? "", 10);
        const deadline = form.word_target_deadline;
        if (!Number.isFinite(target) || target <= 0 || !deadline) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dl = new Date(deadline + "T00:00:00");
        const days = Math.ceil((dl.getTime() - today.getTime()) / 86_400_000);
        if (days <= 0) return t("ui.metadata.deadline_passed", "Deadline has passed");
        const perDay = Math.ceil(target / days);
        return t(
            "ui.metadata.words_per_day",
            "{days} days left, ~{n} words/day for the full target",
        )
            .replace("{days}", String(days))
            .replace("{n}", String(perDay));
    }, [form.word_target, form.word_target_deadline, t]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // AUTHOR-DATALIST-EXTEND-EDITORS-01: create the typed
            // author in the global Authors-DB BEFORE the book PATCH
            // when the user opted in. Mirrors CreateBookModal's
            // pattern. Non-blocking — a failed author POST surfaces
            // an error toast but the book save still proceeds with
            // the free-text author value.
            const typedAuthor = (form.author ?? "").trim();
            if (showAddToAuthorsCheckbox && addAuthorToDb && typedAuthor) {
                try {
                    const created = await getStorage().authors.create({ name: typedAuthor });
                    setGlobalAuthors((prev) => [...prev, created]);
                } catch (err) {
                    notify.error(
                        t(
                            "ui.metadata.author_add_failed",
                            "Autor konnte nicht zur Datenbank hinzugefügt werden",
                        ),
                        err,
                    );
                }
            }

            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                data[key] = value || null;
            }
            data.keywords = keywords;
            data.categories = categories;
            data.bisac_codes = bisacCodes;
            data.audiobook_overwrite_existing = audiobookOverwrite;
            data.audiobook_skip_chapter_types = audiobookSkipTypes;
            await onSave(data);
            notify.success(t("ui.common.save", "Metadaten gespeichert"));
        } catch (err) {
            notify.error(t("ui.common.error", "Fehler beim Speichern"), err);
        }
        setSaving(false);
    };

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

    const aiAvailable = offline ? offlineAiReady : isPluginAvailable(pluginStatus, "ai");

    const handleAiGenerate = async (field: string) => {
        setAiGenerating(field);
        try {
            const req = {
                field,
                book_title: book.title,
                author: book.author,
                genre: book.genre || "",
                language: book.language || "de",
                description: book.description || "",
                chapter_titles: book.chapters.map((ch) => ch.title),
                existing_text: field === "keywords" ? "" : form[field] || "",
                book_id: book.id,
            };
            // Offline: build the same prompts and call the provider directly
            // from the browser; online: the backend AI route.
            const content = offline
                ? (
                      await aiChat(await getAiConfig(), buildMarketingMessages(req), {
                          maxTokens: 1024,
                      })
                  ).content
                : (await api.ai.generateMarketing(req)).content;
            if (field === "keywords") {
                try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        setKeywords(parsed.map(String).filter(Boolean));
                        notify.success(
                            t("ui.metadata.ai_keywords_generated", "Keywords generiert"),
                        );
                    } else {
                        notify.error(
                            t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                        );
                    }
                } catch {
                    notify.error(
                        t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                    );
                }
            } else {
                set(field, content || "");
                notify.success(t("ui.metadata.ai_text_generated", "Text generiert"));
            }
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(
                detail || t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"),
                err,
            );
        }
        setAiGenerating(null);
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
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
                <div style={{ display: "flex", gap: 8 }}>
                    {otherBooks.length > 0 && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowCopyDialog(!showCopyDialog)}
                        >
                            <Copy size={14} /> {t("ui.metadata.copy_from", "Von Buch übernehmen")}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm"
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
                        className="btn btn-primary btn-sm"
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

            {/* Tabs */}
            <Tabs.Root defaultValue="general" style={{ maxWidth: 800 }}>
                <Tabs.List className="radix-tabs-list" style={{ marginBottom: 16 }}>
                    <Tabs.Trigger
                        value="general"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-general"
                    >
                        {t("ui.metadata.tab_general", "Allgemein")}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="story"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-story"
                    >
                        {t("ui.metadata.tab_story", "Story")}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="publisher"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-publisher"
                    >
                        {t("ui.metadata.tab_publisher", "Verlag")}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="isbn"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-isbn"
                    >
                        {t("ui.metadata.tab_isbn", "ISBN")}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="marketing"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-marketing"
                    >
                        {t("ui.metadata.tab_marketing", "Marketing")}
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="design"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-design"
                    >
                        {t("ui.metadata.tab_design", "Design")}
                    </Tabs.Trigger>
                    {isChapterBased && (
                        <>
                            <Tabs.Trigger
                                value="audiobook"
                                className="radix-tab-trigger"
                                data-testid="metadata-tab-audiobook"
                            >
                                {t("ui.metadata.tab_audiobook", "Audiobook")}
                            </Tabs.Trigger>
                            <Tabs.Trigger
                                value="quality"
                                className="radix-tab-trigger"
                                data-testid="metadata-tab-quality"
                            >
                                {t("ui.metadata.tab_quality", "Qualitaet")}
                            </Tabs.Trigger>
                        </>
                    )}
                    <Tabs.Trigger
                        value="ai_template"
                        className="radix-tab-trigger"
                        data-testid="metadata-tab-ai-template"
                    >
                        {t("ui.metadata.tab_ai_template", "KI-Vorlage")}
                    </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="general">
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
                            <Field
                                label={t("ui.metadata.language", "Sprache")}
                                value={form.language}
                                onChange={(v) => set("language", v)}
                                placeholder="de"
                            />
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
                            value={form.repository_url ?? ""}
                            onChange={(v) => set("repository_url", v)}
                            gitSyncStatus={gitSyncStatus}
                            t={t}
                        />
                    </div>
                </Tabs.Content>

                {/* EXPOSE-BUCHIDEE-METADATA-01 C2: Story tab houses
                 * the author-design metadata distinct from the
                 * General tab's publication-side bibliographic
                 * fields. ``book_idea`` is the short 1-2 sentence
                 * premise (no fullscreen — small Field shape).
                 * ``expose`` is the long-form Plot+Characters+
                 * Setting document (Field multiline + markdown +
                 * fullscreen — same shape as description). */}
                <Tabs.Content value="story">
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
                </Tabs.Content>

                <Tabs.Content value="publisher">
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
                </Tabs.Content>

                <Tabs.Content value="isbn">
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
                </Tabs.Content>

                {/* HOTFIX (Categories+BISAC tab-leak bug): the previous
                    ``forceMount`` was added in Bug 9 so happy-dom-based
                    Vitests could query the Marketing-tab Categories +
                    BISAC chip inputs without first clicking the tab.
                    The comment claimed Radix still hides the content
                    via the ``hidden`` attribute — wrong. Radix's
                    Tabs.Content explicitly sets ``hidden: !present``,
                    and with forceMount, ``present`` stays true ALWAYS
                    (see node_modules/@radix-ui/react-tabs source).
                    Result: Marketing content was visible on every tab.
                    Vitests have been updated to click the Marketing
                    tab BEFORE querying its content. */}
                <Tabs.Content value="marketing">
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
                </Tabs.Content>

                <Tabs.Content value="design">
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
                </Tabs.Content>

                {isChapterBased && (
                    <>
                        <Tabs.Content value="audiobook">
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
                                    bookChapters={book.chapters || []}
                                />
                            </div>
                        </Tabs.Content>

                        <Tabs.Content value="quality">
                            <div className={styles.tabContent}>
                                <QualityTab
                                    bookId={book.id}
                                    onNavigateToIssue={onNavigateToIssue}
                                />
                            </div>
                        </Tabs.Content>
                    </>
                )}
                <Tabs.Content value="ai_template">
                    <div className={styles.tabContent}>
                        <AITemplatePanel kind="book" id={book.id} onApplied={onRefresh} />
                    </div>
                </Tabs.Content>
            </Tabs.Root>

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
export { sanitizeAmazonHtml } from "./book-metadata/HtmlField";
export { HtmlFieldWithPreview };
export { AuthorAssetsPanel };
