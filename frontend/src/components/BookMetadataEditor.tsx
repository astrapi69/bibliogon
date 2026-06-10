import {useState, useEffect, useCallback, useMemo} from "react";
import {useNavigate} from "react-router-dom";
import DOMPurify from "dompurify";
import {api, ApiError, Author, AudiobookChapterFile, AudiobookVoice, Book, BookAudiobook, BookDetail, BookType, Chapter, formatVoiceLabel, type GitSyncMappingStatus} from "../api/client";
import { getStorage } from "../storage";
import { useAssetUrl } from "../hooks/useAssetUrl";
import { useOfflineFeatureGate } from "../storage/useOfflineFeatureGate";
import { aiChat, getAiConfig, isAiConfigured } from "../ai/llmClient";
import { buildMarketingMessages } from "../ai/marketingPrompts";
import {Save, Copy, ChevronLeft, Download, Trash2, Package, Sparkles, CheckCircle, Clock, AlertCircle, Play, Pause, Loader2, Rocket} from "lucide-react";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import {RadixSelect} from "./RadixSelect";
import {useBookTypes} from "../hooks/useBookTypes";
import {useAuthorProfile, profileDisplayNames} from "../hooks/useAuthorProfile";
import AuthorSelectInput from "./AuthorSelectInput";
import {EnhancedTextarea} from "./textarea/EnhancedTextarea";
import {LoadingIndicator} from "./LoadingIndicator";
import {useWebSocket} from "../hooks/useWebSocket";
import {useDialog} from "./AppDialog";
import {useEditorPluginStatus, isPluginAvailable} from "../hooks/useEditorPluginStatus";
import KeywordInput from "./KeywordInput";
import PdfExportControls from "./PdfExportControls";
import CategoryInput from "./CategoryInput";
import BisacCodeInput from "./BisacCodeInput";
import CoverUpload from "./CoverUpload";
import AudiobookPlayer, {PlayerChapter} from "./AudiobookPlayer";
import * as Tabs from "@radix-ui/react-tabs";
import QualityTab, {NavigableFindingType} from "./QualityTab";
import TranslationLinks from "./TranslationLinks";
import AITemplatePanel from "./AITemplatePanel";
import KdpPublishingWizard from "./kdp-wizard/KdpPublishingWizard";
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

export default function BookMetadataEditor({book, onSave, onBack, allBooks, onNavigateToIssue, onRefresh}: Props) {
    const {t} = useI18n();
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
        bookTypesSnapshot.types[book.book_type]?.content_model ===
            "chapters" ||
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
    const {status: pluginStatus} = useEditorPluginStatus();
    const {offline} = useOfflineFeatureGate();
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
        // KDP category catalog is a backend-only convenience; offline the field
        // stays free-text. Skip the fetch so dexie mode fires no /api call.
        if (offline) return;
        let cancelled = false;
        api.kdp.listCategories()
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
    }, [offline]);

    // BOOK-REPOSITORY-URL-FIELD-01 C3: fetch the GitSyncMapping
    // status for this book on mount + on book.id change. When
    // ``mapped=true``, the Repository-URL field renders read-only
    // and shows the mapping's canonical URL (the round-trip uses
    // it; manual edits would diverge from the on-disk clone).
    // Silent failure: gitSyncStatus stays null, the field falls
    // back to free-input editing Book.repository_url.
    useEffect(() => {
        // Git-sync is a backend-only (category-3) feature; offline the
        // Repository-URL field stays free-input. Skip the status probe so dexie
        // mode fires no /api call.
        if (offline) return;
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
    }, [book.id, offline]);

    // AUTHOR-DATALIST-EXTEND-EDITORS-01: Pattern A (Datalist) author
    // selection. The dropdown lists ONLY the user's profile authors
    // (real name + pen names); the Authors-Database is loaded purely to
    // gate the "Add to database" checkbox, never to feed suggestions —
    // a book's author is the user's identity, not a catalog entry.
    const [globalAuthors, setGlobalAuthors] = useState<Author[]>([]);
    const [addAuthorToDb, setAddAuthorToDb] = useState(true);
    useEffect(() => {
        let cancelled = false;
        getStorage().authors
            .list({})
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
        return !globalAuthors.some(
            (a) => a.name.trim().toLowerCase() === trimmed,
        );
    }, [form.author, globalAuthors]);

    const set = (key: string, value: string) => setForm((prev) => ({...prev, [key]: value}));

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
        return t("ui.metadata.words_per_day", "{days} days left, ~{n} words/day for the full target")
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
                    const created = await getStorage().authors.create({name: typedAuthor});
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

    const aiAvailable = offline
        ? offlineAiReady
        : isPluginAvailable(pluginStatus, "ai");

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
                existing_text: field === "keywords" ? "" : (form[field] || ""),
                book_id: book.id,
            };
            // Offline: build the same prompts and call the provider directly
            // from the browser; online: the backend AI route.
            const content = offline
                ? (
                      await aiChat(
                          await getAiConfig(),
                          buildMarketingMessages(req),
                          {maxTokens: 1024},
                      )
                  ).content
                : (await api.ai.generateMarketing(req)).content;
            if (field === "keywords") {
                try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) {
                        setKeywords(parsed.map(String).filter(Boolean));
                        notify.success(t("ui.metadata.ai_keywords_generated", "Keywords generiert"));
                    } else {
                        notify.error(t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"));
                    }
                } catch {
                    notify.error(t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"));
                }
            } else {
                set(field, content || "");
                notify.success(t("ui.metadata.ai_text_generated", "Text generiert"));
            }
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : null;
            notify.error(detail || t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"), err);
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
                        <ChevronLeft size={18}/>
                    </button>
                    <h2 className={styles.title}>{t("ui.sidebar.metadata", "Buch-Metadaten")}</h2>
                </div>
                <div style={{display: "flex", gap: 8}}>
                    {otherBooks.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCopyDialog(!showCopyDialog)}>
                            <Copy size={14}/> {t("ui.metadata.copy_from", "Von Buch übernehmen")}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowKdpWizard(true)}
                        data-testid="metadata-open-kdp-wizard"
                        title={t("ui.kdp_publishing_wizard.open_tooltip", "KDP-Veröffentlichungs-Assistenten öffnen")}
                    >
                        <Rocket size={14}/> {t("ui.kdp_publishing_wizard.open_button", "Für KDP veröffentlichen")}
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSave}
                        disabled={saving}
                        data-testid="metadata-save"
                    >
                        <Save size={14}/> {saving ? t("ui.editor.saving", "Speichert...") : t("ui.common.save", "Speichern")}
                    </button>
                </div>
            </div>

            {showCopyDialog && (
                <div className={styles.copyDialog}>
                    <p style={{fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8}}>
                        {t("ui.metadata.copy_hint", "Übernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:")}
                    </p>
                    {otherBooks.map((b) => (
                        <button key={b.id} className="btn btn-ghost btn-sm" onClick={() => handleCopyFrom(b)}
                            style={{display: "block", width: "100%", textAlign: "left", marginBottom: 4}}>
                            {b.title} <span className="muted">- {b.author}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <Tabs.Root defaultValue="general" style={{maxWidth: 800}}>
                <Tabs.List className="radix-tabs-list" style={{marginBottom: 16}}>
                    <Tabs.Trigger value="general" className="radix-tab-trigger" data-testid="metadata-tab-general">{t("ui.metadata.tab_general", "Allgemein")}</Tabs.Trigger>
                    <Tabs.Trigger value="story" className="radix-tab-trigger" data-testid="metadata-tab-story">{t("ui.metadata.tab_story", "Story")}</Tabs.Trigger>
                    <Tabs.Trigger value="publisher" className="radix-tab-trigger" data-testid="metadata-tab-publisher">{t("ui.metadata.tab_publisher", "Verlag")}</Tabs.Trigger>
                    <Tabs.Trigger value="isbn" className="radix-tab-trigger" data-testid="metadata-tab-isbn">{t("ui.metadata.tab_isbn", "ISBN")}</Tabs.Trigger>
                    <Tabs.Trigger value="marketing" className="radix-tab-trigger" data-testid="metadata-tab-marketing">{t("ui.metadata.tab_marketing", "Marketing")}</Tabs.Trigger>
                    <Tabs.Trigger value="design" className="radix-tab-trigger" data-testid="metadata-tab-design">{t("ui.metadata.tab_design", "Design")}</Tabs.Trigger>
                    {isChapterBased && (
                        <>
                            <Tabs.Trigger value="audiobook" className="radix-tab-trigger" data-testid="metadata-tab-audiobook">{t("ui.metadata.tab_audiobook", "Audiobook")}</Tabs.Trigger>
                            <Tabs.Trigger value="quality" className="radix-tab-trigger" data-testid="metadata-tab-quality">{t("ui.metadata.tab_quality", "Qualitaet")}</Tabs.Trigger>
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
                        <Field label={t("ui.metadata.subtitle", "Untertitel")} value={form.subtitle} onChange={(v) => set("subtitle", v)}/>
                        <Field label={t("ui.metadata.description", "Beschreibung")} value={form.description} onChange={(v) => set("description", v)} multiline language="markdown" fullscreen/>
                        <Row>
                            <Field label={t("ui.metadata.edition", "Edition")} value={form.edition} onChange={(v) => set("edition", v)} placeholder="z.B. Second Edition"/>
                            <Field label={t("ui.metadata.publish_date", "Datum")} value={form.publish_date} onChange={(v) => set("publish_date", v)} placeholder="z.B. 2025"/>
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
                        <div style={{marginTop: 8}}>
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
                        <div style={{marginTop: 8}}>
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
                                style={{color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: 6}}
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
                            <Field label={t("ui.metadata.publisher", "Verlag")} value={form.publisher} onChange={(v) => set("publisher", v)} placeholder="z.B. Conscious Path Publishing"/>
                            <Field label={t("ui.metadata.publisher_city", "Stadt")} value={form.publisher_city} onChange={(v) => set("publisher_city", v)} placeholder="z.B. Ludwigsburg"/>
                        </Row>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="isbn">
                    <div className={styles.tabContent}>
                        <Row>
                            <Field label="ISBN E-Book" value={form.isbn_ebook} onChange={(v) => set("isbn_ebook", v)} placeholder="z.B. 9798253911952"/>
                            <Field label="ISBN Taschenbuch" value={form.isbn_paperback} onChange={(v) => set("isbn_paperback", v)}/>
                        </Row>
                        <Row>
                            <Field label="ISBN Hardcover" value={form.isbn_hardcover} onChange={(v) => set("isbn_hardcover", v)}/>
                            <Field label="ASIN E-Book" value={form.asin_ebook} onChange={(v) => set("asin_ebook", v)} placeholder="z.B. B0GV3XBGVB"/>
                        </Row>
                        <Row>
                            <Field label="ASIN Taschenbuch" value={form.asin_paperback} onChange={(v) => set("asin_paperback", v)}/>
                            <Field label="ASIN Hardcover" value={form.asin_hardcover} onChange={(v) => set("asin_hardcover", v)}/>
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
                            <div style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 12px", marginBottom: 12,
                                background: "var(--surface-2)", borderRadius: "var(--radius-sm)",
                                fontSize: "0.75rem", color: "var(--text-muted)",
                            }}>
                                <Sparkles size={14}/>
                                <span>
                                    {t("ui.metadata.ai_usage", "AI-Nutzung")}: {book.ai_tokens_used.toLocaleString()} Tokens
                                    {" "}
                                    <span title={t("ui.metadata.ai_cost_hint", "Geschaetzte Kosten basierend auf typischen Anbieterpreisen")}>
                                        (~${(book.ai_tokens_used * 0.000003).toFixed(4)}{" - "}${(book.ai_tokens_used * 0.000015).toFixed(4)})
                                    </span>
                                </span>
                            </div>
                        )}
                        <div className="field">
                            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4}}>
                                <label className="label" style={{marginBottom: 0}}>{t("ui.metadata.keywords", "Schlüsselwoerter")}</label>
                                {aiAvailable && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={aiGenerating === "keywords"}
                                        onClick={() => handleAiGenerate("keywords")}
                                        title={t("ui.metadata.ai_generate_keywords", "Keywords mit AI generieren")}
                                        style={{fontSize: "0.75rem", padding: "2px 8px", display: "flex", alignItems: "center", gap: 4}}
                                    >
                                        <Sparkles size={12}/>
                                        {aiGenerating === "keywords" ? t("ui.common.loading", "Laden...") : t("ui.metadata.ai_generate", "AI")}
                                    </button>
                                )}
                            </div>
                            <KeywordInput keywords={keywords} onChange={setKeywords}/>
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
                            <small style={{
                                display: "block",
                                color: "var(--text-muted, #6b7280)",
                                marginBottom: 4,
                                fontSize: "0.75rem",
                            }}>
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
                            <small style={{
                                display: "block",
                                color: "var(--text-muted, #6b7280)",
                                marginBottom: 4,
                                fontSize: "0.75rem",
                            }}>
                                {t(
                                    "ui.metadata.bisac_hint",
                                    "Branchen-Standard-Subject-Codes (KDP empfiehlt ≤ 3 Codes).",
                                )}
                            </small>
                            <BisacCodeInput
                                codes={bisacCodes}
                                onChange={setBisacCodes}
                            />
                        </div>
                        <HtmlFieldWithPreview
                            label={t("ui.metadata.html_description", "Buch-Beschreibung (HTML für Amazon)")}
                            value={form.html_description}
                            onChange={(v) => set("html_description", v)}
                            maxChars={4000}
                            aiButton={aiAvailable ? {
                                loading: aiGenerating === "html_description",
                                onClick: () => handleAiGenerate("html_description"),
                                label: aiGenerating === "html_description" ? t("ui.common.loading", "Laden...") : t("ui.metadata.ai_generate", "AI"),
                            } : undefined}
                        />
                        <HtmlFieldWithPreview
                            label={t("ui.metadata.backpage_description", "Rückseitenbeschreibung")}
                            value={form.backpage_description}
                            onChange={(v) => set("backpage_description", v)}
                            maxChars={600}
                            rows={4}
                            aiButton={aiAvailable ? {
                                loading: aiGenerating === "backpage_description",
                                onClick: () => handleAiGenerate("backpage_description"),
                                label: aiGenerating === "backpage_description" ? t("ui.common.loading", "Laden...") : t("ui.metadata.ai_generate", "AI"),
                            } : undefined}
                        />
                        <HtmlFieldWithPreview
                            label={t("ui.metadata.author_bio", "Autoren-Kurzbiographie (Rückseite)")}
                            value={form.backpage_author_bio}
                            onChange={(v) => set("backpage_author_bio", v)}
                            maxChars={2000}
                            aiButton={aiAvailable ? {
                                loading: aiGenerating === "backpage_author_bio",
                                onClick: () => handleAiGenerate("backpage_author_bio"),
                                label: aiGenerating === "backpage_author_bio" ? t("ui.common.loading", "Laden...") : t("ui.metadata.ai_generate", "AI"),
                            } : undefined}
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
                        <AuthorAssetsPanel bookId={book.id}/>
                        <Field label={t("ui.metadata.custom_css", "Custom CSS (EPUB-Styles)")} value={form.custom_css} onChange={(v) => set("custom_css", v)}
                            multiline mono fullscreen/>
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
                                    onEngineChange={(v: string) => { set("tts_engine", v); set("tts_voice", ""); }}
                                    onVoiceChange={(v: string) => set("tts_voice", v)}
                                    onSpeedChange={(v: string) => set("tts_speed", v)}
                                    onMergeChange={(v: string) => set("audiobook_merge", v)}
                                    onCustomFilenameChange={(v: string) => set("audiobook_filename", v)}
                                    onOverwriteExistingChange={setAudiobookOverwrite}
                                    onSkipChapterTypesChange={setAudiobookSkipTypes}
                                />
                                <AudiobookDownloads bookId={book.id} bookChapters={book.chapters || []}/>
                            </div>
                        </Tabs.Content>

                        <Tabs.Content value="quality">
                            <div className={styles.tabContent}>
                                <QualityTab bookId={book.id} onNavigateToIssue={onNavigateToIssue} />
                            </div>
                        </Tabs.Content>
                    </>
                )}
                <Tabs.Content value="ai_template">
                    <div className={styles.tabContent}>
                        <AITemplatePanel
                            kind="book"
                            id={book.id}
                            onApplied={onRefresh}
                        />
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

// --- Sub-components ---

function Row({children}: {children: React.ReactNode}) {
    return <div className={styles.row}>{children}</div>;
}

/**
 * Repository-URL field with git-sync read-precedence.
 *
 * BOOK-REPOSITORY-URL-FIELD-01 C3. Two render shapes:
 *
 * - When ``gitSyncStatus.mapped === true``: the field is read-only
 *   and surfaces ``gitSyncStatus.repo_url``. A small hint below the
 *   input tells the user the URL is owned by plugin-git-sync
 *   (manual edits would diverge from the round-trip). The
 *   ``Book.repository_url`` column is ignored in this case to
 *   avoid two competing sources of truth.
 * - When ``mapped === false`` OR ``gitSyncStatus === null`` (fetch
 *   failed / plugin disabled): the field is a normal free input
 *   editing ``Book.repository_url`` via the form's
 *   ``onChange`` → ``set("repository_url", v)`` chain.
 */
function RepositoryUrlField({
    value,
    onChange,
    gitSyncStatus,
    t,
}: {
    value: string;
    onChange: (v: string) => void;
    gitSyncStatus: GitSyncMappingStatus | null;
    t: (key: string, fallback: string) => string;
}) {
    const managedByGitSync = gitSyncStatus?.mapped === true;
    const label = t("ui.metadata.repository_url", "Git-Repository (URL)");
    if (managedByGitSync) {
        return (
            <div className="field" style={{flex: 1}} data-testid="metadata-repository-url-managed">
                <label className="label">{label}</label>
                <input
                    className="input"
                    type="url"
                    value={gitSyncStatus?.repo_url ?? ""}
                    readOnly
                    aria-readonly="true"
                    data-testid="metadata-repository-url-input"
                    style={{background: "var(--surface-2)", cursor: "default"}}
                />
                <small
                    style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                    }}
                    data-testid="metadata-repository-url-managed-hint"
                >
                    {t(
                        "ui.metadata.repository_url_managed_hint",
                        "Wird von plugin-git-sync verwaltet — manuelle Änderungen würden vom Round-Trip abweichen.",
                    )}
                </small>
            </div>
        );
    }
    return (
        <div className="field" style={{flex: 1}} data-testid="metadata-repository-url-manual">
            <label className="label">{label}</label>
            <input
                className="input"
                type="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t(
                    "ui.metadata.repository_url_placeholder",
                    "https://github.com/...",
                )}
                data-testid="metadata-repository-url-input"
            />
            <small
                style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.metadata.repository_url_hint",
                    "Optional. Externer Git-Repo-Link für Bücher, die nicht über plugin-git-sync importiert wurden.",
                )}
            </small>
        </div>
    );
}

/**
 * Author field as a free-text input with Authors-DB autocomplete.
 *
 * Pattern A (free-text input + datalist via AuthorSelectInput) was
 * chosen over a closed-list <select> so names not yet in the
 * user-profile or Authors-DB (e.g. ghostwritten works, collaborators,
 * historical imports with unfamiliar names) don't force the user to
 * detour into Settings.
 *
 * Book-specific wrapping (field div + label + manage-link to
 * Settings) stays here so the user can still curate the Authors-DB
 * proactively when desired.
 */
function AuthorSelectField({
    label,
    value,
    onChange,
    suggestions,
    showAddToAuthorsCheckbox,
    addToAuthorsDb,
    onAddToAuthorsDbChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    suggestions: string[];
    showAddToAuthorsCheckbox: boolean;
    addToAuthorsDb: boolean;
    onAddToAuthorsDbChange: (next: boolean) => void;
}) {
    const {t} = useI18n();
    const navigate = useNavigate();

    return (
        <div className="field" style={{flex: 1}}>
            <label className="label" htmlFor="metadata-author">
                {label}
            </label>
            <AuthorSelectInput
                value={value}
                onChange={onChange}
                suggestions={suggestions}
                showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
                addToAuthorsDb={addToAuthorsDb}
                onAddToAuthorsDbChange={onAddToAuthorsDbChange}
                testidPrefix="metadata"
                placeholder={t(
                    "ui.metadata.author_placeholder",
                    "Autorenname oder Pen Name",
                )}
                addToAuthorsLabel={t(
                    "ui.metadata.add_to_authors_db",
                    "„{name}\" zur Autoren-Datenbank hinzufügen",
                )}
            />
            <a
                href="/settings?tab=author"
                data-testid="metadata-author-manage-link"
                style={{
                    display: "inline-block",
                    marginTop: 4,
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    textDecoration: "underline",
                }}
                onClick={(e) => {
                    e.preventDefault();
                    navigate("/settings?tab=author");
                }}
            >
                {t(
                    "ui.metadata.author_manage_link",
                    "Autoren in Einstellungen verwalten",
                )}
            </a>
        </div>
    );
}

function Field({label, value, onChange, placeholder, multiline, mono, maxChars, datalist, datalistId, language, fullscreen}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
    mono?: boolean;
    /** Soft limit for the character counter. No hard input cap - the
     *  counter just turns red when exceeded so the user is warned but
     *  can still over-type if a platform allows more. */
    maxChars?: number;
    /** Free-text input with dropdown suggestions. When non-empty, the
     *  input gets a ``list=`` attribute pointing at a generated
     *  ``<datalist>``. Ignored when ``multiline`` is true. */
    datalist?: string[];
    datalistId?: string;
    /** Override the language tag on the EnhancedTextarea. Default
     * is ``css`` when ``mono`` is true, ``plain`` otherwise. Pass
     * ``markdown`` to enable a preview toggle on description-style
     * fields. */
    language?: "plain" | "markdown" | "html" | "css";
    /** Show a fullscreen toggle (long-form Markdown / CSS). */
    fullscreen?: boolean;
}) {
    const {t} = useI18n();
    // styles.input was an empty literal in the prior styles object;
    // dropped during the CSS-Module migration. mono path keeps the
    // monospace overrides as a small inline literal.
    const inputStyle: React.CSSProperties | undefined = mono
        ? {fontFamily: "var(--font-mono)", fontSize: "0.8125rem"}
        : undefined;
    const text = value || "";
    const listId =
        !multiline && datalist && datalist.length > 0 ? datalistId : undefined;
    return (
        <div className="field" style={{flex: 1}}>
            <label className="label">{label}</label>
            {multiline ? (
                <EnhancedTextarea
                    value={text}
                    onChange={onChange}
                    placeholder={placeholder}
                    language={language ?? (mono ? "css" : "plain")}
                    mono={mono}
                    maxChars={maxChars}
                    fullscreen={fullscreen}
                    rows={8}
                    ariaLabel={label}
                />
            ) : (
                <>
                    <input className="input" style={inputStyle}
                        value={text} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                        list={listId}/>
                    {listId && (
                        <datalist id={listId}>
                            {(datalist ?? []).map((name) => (
                                <option key={name} value={name}/>
                            ))}
                        </datalist>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Author-assets panel: read-only thumbnail grid for files imported
 * under ``assets/author/``, ``assets/authors/``, or
 * ``assets/about-author/`` (purpose="author-asset" at detect time,
 * asset_type="author-asset" at execute time).
 *
 * Rendered in the Design tab so portraits, signatures, and bio images
 * are discoverable in the metadata editor. Delete per file; upload
 * support lives behind a separate backend validator bump and is not
 * wired here.
 */
/** A single author-asset thumbnail. Resolves the image src across storage
 *  modes (served URL online, IndexedDB blob URL offline). */
function AuthorAssetImage({bookId, filename}: {bookId: string; filename: string}) {
    const src = useAssetUrl(bookId, filename);
    return (
        <img
            src={src ?? undefined}
            alt={filename}
            style={{
                width: "100%",
                aspectRatio: "3/4",
                objectFit: "cover",
                borderRadius: 4,
                background: "var(--bg-hover)",
            }}
        />
    );
}

export function AuthorAssetsPanel({bookId}: {bookId: string}) {
    const {t} = useI18n();
    const [assets, setAssets] = useState<{id: string; filename: string; asset_type: string; path: string}[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getStorage()
            .assets.list(bookId)
            .then((rows) => {
                if (cancelled) return;
                setAssets(rows.filter((a) => a.asset_type === "author-asset"));
            })
            .catch(() => {
                if (!cancelled) setAssets([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [bookId]);

    const handleDelete = async (assetId: string) => {
        try {
            await getStorage().assets.delete(bookId, assetId);
            setAssets((prev) => prev.filter((a) => a.id !== assetId));
            notify.success(t("ui.metadata.author_asset_deleted", "Autor-Asset gelöscht"));
        } catch (err) {
            notify.error(t("ui.metadata.author_asset_delete_failed", "Löschen fehlgeschlagen"), err);
        }
    };

    if (loading || assets.length === 0) {
        return null;
    }

    return (
        <div
            className="field"
            data-testid="author-assets-panel"
            style={{flex: 1, marginTop: 16}}
        >
            <label className="label">
                {t("ui.metadata.author_assets", "Autoren-Bilder")}{" "}
                <span style={{color: "var(--text-muted)", fontWeight: 400}}>
                    ({assets.length})
                </span>
            </label>
            <p style={{margin: "4px 0 8px 0", fontSize: "0.75rem", color: "var(--text-muted)"}}>
                {t(
                    "ui.metadata.author_assets_hint",
                    "Portrait-, Signatur- oder Bio-Bilder aus dem Import (assets/author/).",
                )}
            </p>
            <div
                data-testid="author-assets-grid"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: 10,
                }}
            >
                {assets.map((asset) => (
                    <div
                        key={asset.id}
                        data-testid={`author-asset-${asset.filename}`}
                        style={{
                            position: "relative",
                            padding: 6,
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--bg-primary)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        <AuthorAssetImage
                            bookId={bookId}
                            filename={asset.filename}
                        />
                        <span
                            style={{
                                fontSize: "0.6875rem",
                                color: "var(--text-secondary)",
                                textAlign: "center",
                                wordBreak: "break-all",
                                maxWidth: "100%",
                            }}
                            title={asset.path}
                        >
                            {asset.filename}
                        </span>
                        <button
                            type="button"
                            data-testid={`author-asset-delete-${asset.filename}`}
                            onClick={() => handleDelete(asset.id)}
                            aria-label={t("ui.metadata.author_asset_delete", "Löschen")}
                            style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                padding: "2px 6px",
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                background: "var(--bg-card)",
                                color: "var(--danger)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                            }}
                        >
                            <Trash2 size={12}/>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CharCounter({count, max, label}: {count: number; max: number; label: string}) {
    const over = count > max;
    return (
        <small
            style={{
                display: "block",
                marginTop: 4,
                fontSize: "0.75rem",
                color: over ? "var(--danger)" : "var(--text-muted)",
                fontWeight: over ? 600 : 400,
                textAlign: "right",
            }}
        >
            {count} / {max} {label}
        </small>
    );
}

/** Amazon KDP allows only a limited subset of HTML tags. */
const AMAZON_ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "h4", "h5", "h6", "p", "br"];

/** Sanitize HTML to only Amazon-compatible tags. */
export function sanitizeAmazonHtml(html: string): string {
    return DOMPurify.sanitize(html, {ALLOWED_TAGS: AMAZON_ALLOWED_TAGS, ALLOWED_ATTR: []});
}

/** Integrated HTML field: toggle between editable textarea and sanitized preview. */
export function HtmlFieldWithPreview({label, value, onChange, maxChars, rows = 8, aiButton}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    maxChars?: number;
    rows?: number;
    aiButton?: {loading: boolean; onClick: () => void; label: string};
}) {
    const {t} = useI18n();
    const [showPreview, setShowPreview] = useState(false);
    const text = value || "";

    return (
        <div className="field" style={{flex: 1}}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4}}>
                <label className="label" style={{marginBottom: 0}}>{label}</label>
                <div style={{display: "flex", gap: 4}}>
                    {aiButton && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={aiButton.loading}
                            onClick={aiButton.onClick}
                            style={{fontSize: "0.75rem", padding: "2px 8px", display: "flex", alignItems: "center", gap: 4}}
                        >
                            <Sparkles size={12}/>
                            {aiButton.label}
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowPreview((s) => !s)}
                        data-testid="html-preview-toggle"
                        style={{fontSize: "0.75rem", padding: "2px 8px"}}
                    >
                        {showPreview
                            ? t("ui.metadata.html_field_show_source", "HTML anzeigen")
                            : t("ui.metadata.html_field_show_preview", "Vorschau anzeigen")}
                    </button>
                </div>
            </div>
            {showPreview ? (
                <div
                    className={`input ${styles.multilineInput}`}
                    style={{
                        minHeight: rows * 24,
                        padding: "12px 16px",
                        fontSize: "0.875rem",
                        lineHeight: 1.6,
                        overflow: "auto",
                    }}
                    dangerouslySetInnerHTML={{__html: sanitizeAmazonHtml(text)}}
                />
            ) : (
                <textarea
                    className={`input ${styles.multilineInput}`}
                    style={{maxWidth: "100%"}}
                    rows={rows}
                    value={text}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
            {maxChars !== undefined && !showPreview && (
                <CharCounter
                    count={text.length}
                    max={maxChars}
                    label={t("ui.metadata.characters", "Zeichen")}
                />
            )}
        </div>
    );
}

function slugifyForFilename(text: string): string {
    // Mirrors backend scaffolder._slugify so the displayed default
    // matches what the export pipeline would actually produce.
    let s = text.toLowerCase().trim();
    s = s.replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/[ß]/g, "ss");
    s = s.replace(/[^\w\s-]/g, "");
    s = s.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
    return s.replace(/^-+|-+$/g, "");
}

function AudiobookBookConfig({
    bookLanguage, bookTitle, bookChapters, engine, voice, speed, merge, customFilename,
    overwriteExisting, skipChapterTypes,
    onEngineChange, onVoiceChange, onSpeedChange, onMergeChange, onCustomFilenameChange,
    onOverwriteExistingChange, onSkipChapterTypesChange,
}: {
    bookLanguage: string; bookTitle: string;
    bookChapters: {chapter_type: string}[];
    engine: string; voice: string;
    speed: string; merge: string; customFilename: string; overwriteExisting: boolean;
    skipChapterTypes: string[];
    onEngineChange: (v: string) => void; onVoiceChange: (v: string) => void;
    onSpeedChange: (v: string) => void; onMergeChange: (v: string) => void;
    onCustomFilenameChange: (v: string) => void;
    onOverwriteExistingChange: (v: boolean) => void;
    onSkipChapterTypesChange: (v: string[]) => void;
}) {
    const {t} = useI18n();
    const [voices, setVoices] = useState<AudiobookVoice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [highQualityOnly, setHighQualityOnly] = useState(true);
    const currentEngine = engine || "edge-tts";
    const hasQualityTiers = currentEngine === "google-cloud-tts";
    const HIGH_QUALITY_TIERS = new Set(["neural2", "journey", "studio"]);
    const filteredVoices = hasQualityTiers && highQualityOnly
        ? voices.filter((v) => HIGH_QUALITY_TIERS.has(v.quality || ""))
        : voices;

    useEffect(() => {
        let cancelled = false;
        setLoadingVoices(true);
        api.audiobook
            .listVoices(currentEngine, bookLanguage)
            .then((data) => {
                if (cancelled) return;
                setVoices(data);
                if (data.length > 0 && !data.some((v) => v.id === voice)) {
                    onVoiceChange(data[0].id);
                }
            })
            .catch(() => {
                if (!cancelled) setVoices([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingVoices(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentEngine, bookLanguage]);

    return (
        <>
            <div className="field">
                <label className="label">{t("ui.audiobook.language", "Sprache")}</label>
                <input className="input" value={bookLanguage.toUpperCase()} disabled style={{opacity: 0.6}}/>
                <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                    {t("ui.audiobook.language_from_book", "Wird aus den Buch-Einstellungen übernommen.")}
                </small>
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.engine", "Engine")}</label>
                <RadixSelect
                    testId="audiobook-engine"
                    className="is-block"
                    value={currentEngine}
                    onValueChange={onEngineChange}
                    ariaLabel={t("ui.audiobook.engine", "Engine")}
                    options={[
                        {value: "edge-tts", label: "Microsoft Edge TTS"},
                        {value: "google-tts", label: "Google TTS (gTTS)"},
                        {value: "google-cloud-tts", label: "Google Cloud TTS"},
                        {value: "pyttsx3", label: "pyttsx3 (Offline)"},
                        {value: "elevenlabs", label: "ElevenLabs"},
                    ]}
                />
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.voice", "Stimme")}</label>
                {hasQualityTiers && (
                    <label style={{display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4, cursor: "pointer"}}>
                        <input type="checkbox" checked={highQualityOnly} onChange={(e) => setHighQualityOnly(e.target.checked)}/>
                        {t("ui.audiobook.high_quality_only", "Nur hochwertige Stimmen (Neural2, Journey, Studio)")}
                    </label>
                )}
                {loadingVoices ? (
                    <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                        {t("ui.audiobook.voices_loading", "Stimmen werden geladen...")}
                    </div>
                ) : filteredVoices.length > 0 ? (
                    <RadixSelect
                        testId="audiobook-voice"
                        className="is-block"
                        value={voice}
                        onValueChange={onVoiceChange}
                        ariaLabel={t("ui.audiobook.voice", "Stimme")}
                        options={filteredVoices.map((v) => ({
                            value: v.id,
                            label: formatVoiceLabel(v),
                        }))}
                    />
                ) : (
                    <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                        {t("ui.audiobook.no_voices_for_combo", "Keine Stimmen für {engine} in {language} verfügbar")
                            .replace("{engine}", currentEngine)
                            .replace("{language}", bookLanguage.toUpperCase())}
                    </div>
                )}
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.speed", "Geschwindigkeit")}</label>
                <RadixSelect
                    testId="audiobook-speed"
                    className="is-block"
                    value={speed}
                    onValueChange={onSpeedChange}
                    ariaLabel={t("ui.audiobook.speed", "Geschwindigkeit")}
                    options={[
                        {value: "0.5", label: "0.5x"},
                        {value: "0.75", label: "0.75x"},
                        {value: "1.0", label: "1.0x (Normal)"},
                        {value: "1.25", label: "1.25x"},
                        {value: "1.5", label: "1.5x"},
                    ]}
                />
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfügen")}</label>
                <RadixSelect
                    testId="audiobook-merge"
                    className="is-block"
                    value={merge}
                    onValueChange={onMergeChange}
                    ariaLabel={t("ui.audiobook.merge", "Kapitel zusammenfügen")}
                    options={[
                        {value: "separate", label: t("ui.audiobook.merge_separate", "Alle Kapitel einzeln")},
                        {value: "merged", label: t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfügen")},
                        {value: "both", label: t("ui.audiobook.merge_both", "Beides")},
                    ]}
                />
            </div>
            <CustomFilenameField
                bookTitle={bookTitle}
                value={customFilename}
                onChange={onCustomFilenameChange}
            />
            <div className="field">
                <label className="label icon-row">
                    <input
                        type="checkbox"
                        checked={overwriteExisting}
                        onChange={(e) => onOverwriteExistingChange(e.target.checked)}
                    />
                    {t("ui.audiobook.overwrite_label", "Bestehende Dateien überschreiben")}
                </label>
                <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginTop: 4}}>
                    {t("ui.audiobook.overwrite_description", "Wenn aktiviert, werden bei einem erneuten Export alle bereits generierten MP3-Dateien dieses Buchs überschrieben. Wenn deaktiviert, werden nur fehlende oder geänderte Kapitel neu generiert (Standard).")}
                </small>
            </div>
            <AudiobookSkipChapterTypes
                bookChapters={bookChapters}
                value={skipChapterTypes}
                onChange={onSkipChapterTypesChange}
            />
        </>
    );
}


// Sorted by typical book layout (front matter -> body -> back matter).
// The order also drives the visual order in the skip-list checkboxes.
const AUDIOBOOK_CHAPTER_TYPES: readonly string[] = [
    "toc", "dedication", "epigraph", "preface", "foreword",
    "prologue", "introduction",
    "part", "part_intro", "chapter", "interlude",
    "epilogue", "afterword", "final_thoughts",
    "acknowledgments", "about_author",
    "appendix", "bibliography", "endnotes", "glossary", "index",
    "imprint", "also_by_author", "next_in_series", "excerpt", "call_to_action",
];


function AudiobookSkipChapterTypes({bookChapters, value, onChange}: {
    bookChapters: {chapter_type: string}[];
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const {t} = useI18n();
    const presentTypes = new Set(
        (bookChapters || []).map((c) => (c.chapter_type || "").toLowerCase()).filter(Boolean),
    );
    const present = AUDIOBOOK_CHAPTER_TYPES.filter((k) => presentTypes.has(k));
    const other = AUDIOBOOK_CHAPTER_TYPES.filter((k) => !presentTypes.has(k));

    function toggle(key: string, checked: boolean) {
        if (checked) {
            if (value.includes(key)) return;
            onChange([...value, key]);
        } else {
            onChange(value.filter((k) => k !== key));
        }
    }

    const renderCheckbox = (key: string, muted: boolean) => {
        const label = t(`ui.chapter_types.${key}`, key);
        const checked = value.includes(key);
        return (
            <label
                key={key}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                    fontSize: "0.875rem",
                    color: muted ? "var(--text-muted)" : undefined,
                }}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(key, e.target.checked)}
                />
                <span style={{fontWeight: muted ? 400 : 500}}>{label}</span>
                <span style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>({key})</span>
            </label>
        );
    };

    return (
        <div className="field" style={{marginTop: 16}}>
            <label className="label">{t("ui.audiobook.skip_title", "Kapiteltypen überspringen")}</label>
            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginBottom: 8}}>
                {t("ui.audiobook.skip_description", "Folgende Kapiteltypen werden NICHT vertont")}
            </small>

            {present.length > 0 && (
                <>
                    <div style={{fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 4, marginBottom: 4}}>
                        {t("ui.audiobook.skip_in_book", "Im Buch vorhanden")}
                    </div>
                    <div style={{display: "flex", flexDirection: "column", marginBottom: 8}}>
                        {present.map((k) => renderCheckbox(k, false))}
                    </div>
                </>
            )}

            <div style={{fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 4, marginBottom: 4}}>
                {t("ui.audiobook.skip_other", "Weitere Typen")}
            </div>
            <div style={{display: "flex", flexDirection: "column"}}>
                {other.map((k) => renderCheckbox(k, true))}
            </div>

            <small style={{color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginTop: 8}}>
                {t("ui.audiobook.skip_hint", "Aktivierte Typen werden beim Audiobook-Export übersprungen und nicht vertont.")}
            </small>
        </div>
    );
}

function CustomFilenameField({bookTitle, value, onChange}: {
    bookTitle: string;
    value: string;
    onChange: (v: string) => void;
}) {
    const {t} = useI18n();
    const defaultName = `${slugifyForFilename(bookTitle) || "audiobook"}-ebook`;
    const enabled = value.length > 0;

    const toggle = (checked: boolean) => {
        // Pre-populate with the default when enabling so the user has
        // something concrete to edit. Clear back to "" when disabling so
        // the backend stores null and falls back to its own default.
        onChange(checked ? defaultName : "");
    };

    return (
        <div className="field">
            <label className="label icon-row">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggle(e.target.checked)}
                />
                {t("ui.audiobook.custom_filename", "Eigener Dateiname")}
            </label>
            <input
                className="input"
                value={enabled ? value : defaultName}
                disabled={!enabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder={defaultName}
                style={enabled ? undefined : {opacity: 0.6}}
            />
            <small style={{color: "var(--text-muted)", fontSize: "0.75rem"}}>
                {t(
                    "ui.audiobook.custom_filename_hint",
                    "Ohne Dateiendung. Leer lassen, um den Standardnamen zu verwenden.",
                )}
            </small>
        </div>
    );
}

function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function AudiobookDownloads({bookId, bookChapters}: {bookId: string; bookChapters: Chapter[]}) {
    const {t} = useI18n();
    const dialog = useDialog();
    const [data, setData] = useState<BookAudiobook | null>(null);
    const [previews, setPreviews] = useState<{filename: string; size_bytes: number; url: string}[]>([]);
    const [busy, setBusy] = useState(false);
    const [subTab, setSubTab] = useState<"downloads" | "previews">("downloads");
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const result = await api.bookAudiobook.get(bookId);
            setData(result);
        } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 404) {
                console.error("Failed to load audiobook metadata:", err);
            }
            setData({exists: false, book_id: bookId});
        }
        try {
            const p = await api.bookAudiobook.listPreviews(bookId);
            setPreviews(p);
        } catch {
            setPreviews([]);
        }
    }, [bookId]);

    useEffect(() => {
        load();
    }, [load]);

    // Live-update the audiobook metadata view as chapters are generated.
    // The backend broadcasts events to audiobook:{bookId} via WebSocket
    // after each flush_chapter, finalize, and mark_failed call.
    useWebSocket<{event: string}>(
        `audiobook:${bookId}`,
        useCallback(() => { load(); }, [load]),
    );

    const handleDelete = async () => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete", "Audiobook löschen"),
            t("ui.audiobook.delete_confirm", "Audiobook wirklich löschen? Die Dateien sind danach weg."),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.delete(bookId);
            notify.success(t("ui.audiobook.deleted", "Audiobook gelöscht"));
            await load();
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeleteChapter = async (filename: string) => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_file", "Datei löschen"),
            t("ui.audiobook.delete_file_confirm", "Diese Datei wirklich löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deleteChapter(bookId, filename);
            await load();
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeletePreview = async (filename: string) => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_file", "Datei löschen"),
            t("ui.audiobook.delete_file_confirm", "Diese Datei wirklich löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deletePreview(bookId, filename);
            setPreviews((prev) => prev.filter((p) => p.filename !== filename));
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeleteAllPreviews = async () => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_previews", "Alle Previews löschen"),
            t("ui.audiobook.delete_previews_confirm", "Alle Vorhoer-Dateien löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deleteAllPreviews(bookId);
            setPreviews([]);
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const hasDownloads = data?.exists;
    const hasPreviews = previews.length > 0;

    if (!data) {
        return (
            <div className={styles.audiobookSection}>
                <LoadingIndicator
                    testId="audiobook-loading"
                    label={t("ui.common.loading", "Laden...")}
                />
            </div>
        );
    }

    return (
        <div className={styles.audiobookSection}>
            {/* Sub-tab selector */}
            <div style={{display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid var(--border)"}}>
                <button
                    onClick={() => setSubTab("downloads")}
                    style={{
                        padding: "6px 14px", border: "none", cursor: "pointer",
                        background: "none", fontSize: "0.8125rem", fontWeight: 500,
                        color: subTab === "downloads" ? "var(--accent)" : "var(--text-muted)",
                        borderBottom: subTab === "downloads" ? "2px solid var(--accent)" : "2px solid transparent",
                        fontFamily: "var(--font-body)",
                    }}
                >
                    {t("ui.audiobook.downloads_title", "Verfügbare Downloads")}
                    {hasDownloads && data.chapters && ` (${data.chapters.length})`}
                </button>
                <button
                    onClick={() => setSubTab("previews")}
                    style={{
                        padding: "6px 14px", border: "none", cursor: "pointer",
                        background: "none", fontSize: "0.8125rem", fontWeight: 500,
                        color: subTab === "previews" ? "var(--accent)" : "var(--text-muted)",
                        borderBottom: subTab === "previews" ? "2px solid var(--accent)" : "2px solid transparent",
                        fontFamily: "var(--font-body)",
                    }}
                >
                    Previews{hasPreviews && ` (${previews.length})`}
                </button>
            </div>

            {/* Downloads sub-tab */}
            {subTab === "downloads" && (
                <>
                    {(() => {
                        // Build a lookup from book-chapter title to generated audio file
                        const audioByTitle = new Map<string, AudiobookChapterFile>();
                        for (const ch of data.chapters || []) {
                            if (ch.title) audioByTitle.set(ch.title, ch);
                        }
                        const isPartial = data.status === "in_progress";
                        const sortedChapters = [...bookChapters].sort((a, b) => a.position - b.position);

                        return <>
                            {/* Engine / voice / speed summary line */}
                            {hasDownloads && (
                                <>
                                    <div className={styles.audiobookMetaLine}>
                                        {data.created_at && <span>{t("ui.audiobook.created_at", "Erstellt am")}: {new Date(data.created_at).toLocaleString()}</span>}
                                        {data.engine && <span style={{marginLeft: 12}}>Engine: {data.engine}</span>}
                                        {data.voice && <span style={{marginLeft: 12}}>{t("ui.audiobook.voice", "Stimme")}: {data.voice}</span>}
                                        {data.speed && <span style={{marginLeft: 12}}>{data.speed}x</span>}
                                    </div>
                                    {isPartial && (
                                        <div style={{marginTop: 8, fontSize: "0.75rem", color: "var(--warning, #e67e22)", display: "flex", alignItems: "center", gap: 6}}>
                                            <AlertCircle size={14}/>
                                            {t("ui.audiobook.status_partial", "Export unvollständig. Einige Kapitel wurden noch nicht generiert.")}
                                        </div>
                                    )}
                                    <div style={{display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap"}}>
                                        {data.merged && (
                                            <a className="btn btn-primary btn-sm" href={api.bookAudiobook.mergedUrl(bookId)} download>
                                                <Download size={12}/> {t("ui.audiobook.download_merged", "Gemergtes Audiobook")}
                                                {data.merged.duration_seconds ? ` (${formatDuration(data.merged.duration_seconds)})` : ` (${formatBytes(data.merged.size_bytes)})`}
                                            </a>
                                        )}
                                        {data.chapters && data.chapters.length > 0 && (
                                            <a className="btn btn-secondary btn-sm" href={api.bookAudiobook.zipUrl(bookId)} download>
                                                <Package size={12}/> {t("ui.audiobook.download_zip", "ZIP")}
                                            </a>
                                        )}
                                        <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={busy} style={{color: "var(--danger, #c0392b)"}}>
                                            <Trash2 size={12}/> {t("ui.audiobook.delete", "Audiobook löschen")}
                                        </button>
                                    </div>
                                </>
                            )}
                            {!hasDownloads && sortedChapters.length === 0 && (
                                <div className={styles.audiobookMuted}>
                                    {t("ui.audiobook.downloads_empty", "Noch kein Audiobook generiert. Nutze den Export-Dialog um eines zu erstellen.")}
                                </div>
                            )}

                            {/* Per-chapter audio status list */}
                            {(() => {
                                // Build the player chapter list: only chapters with audio, in order
                                const playerChapters: PlayerChapter[] = [];
                                const chapterToPlayerIndex = new Map<string, number>();
                                for (const bookCh of sortedChapters) {
                                    const audio = audioByTitle.get(bookCh.title);
                                    if (audio) {
                                        chapterToPlayerIndex.set(bookCh.id, playerChapters.length);
                                        playerChapters.push({title: bookCh.title, url: audio.url, position: bookCh.position});
                                    }
                                }
                                return sortedChapters.length > 0 && (
                                    <>
                                        <ul className={styles.audiobookChapterList} style={{marginTop: 16}}>
                                            {sortedChapters.map((bookCh) => {
                                                const audio = audioByTitle.get(bookCh.title);
                                                const dur = audio ? formatDuration(audio.duration_seconds) : "";
                                                const playerIdx = chapterToPlayerIndex.get(bookCh.id);
                                                const isPlaying = playingIndex !== null && playerIdx === playingIndex;
                                                return (
                                                    <li key={bookCh.id} className={styles.audiobookChapterItem} style={{
                                                        flexDirection: "column", alignItems: "stretch", gap: 4,
                                                        ...(isPlaying ? {borderLeft: "3px solid var(--accent)", paddingLeft: 5} : {}),
                                                    }}>
                                                        <div className="icon-row">
                                                            {audio ? (
                                                                <button
                                                                    className="btn-icon"
                                                                    onClick={() => setPlayingIndex(playerIdx ?? null)}
                                                                    style={{flexShrink: 0, color: isPlaying ? "var(--accent)" : "var(--success, #16a34a)"}}
                                                                    title={isPlaying ? t("ui.audiobook.player.pause", "Pause") : t("ui.audiobook.player.play", "Abspielen")}
                                                                >
                                                                    {isPlaying ? <Pause size={14}/> : <Play size={14}/>}
                                                                </button>
                                                            ) : (
                                                                <Clock size={14} style={{color: "var(--text-muted)", flexShrink: 0}}/>
                                                            )}
                                                            <span style={{flex: 1, fontSize: "0.8125rem", fontWeight: isPlaying ? 600 : 500, color: isPlaying ? "var(--accent)" : undefined}}>
                                                                {bookCh.title}
                                                            </span>
                                                            {audio ? (
                                                                <>
                                                                    {dur && <span className={styles.audiobookMuted} style={{whiteSpace: "nowrap"}}>{dur}</span>}
                                                                    <span className={styles.audiobookMuted}>{formatBytes(audio.size_bytes)}</span>
                                                                    <a href={audio.url} download className="btn-icon" title="Download"><Download size={12}/></a>
                                                                    <button className="btn-icon" onClick={() => handleDeleteChapter(audio.filename)} disabled={busy} title={t("ui.common.delete", "Löschen")} style={{color: "var(--danger, #c0392b)"}}>
                                                                        <Trash2 size={12}/>
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span style={{fontSize: "0.6875rem", color: "var(--text-muted)"}}>
                                                                    {t("ui.audiobook.chapter_not_generated", "Nicht generiert")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        {playingIndex !== null && playerChapters.length > 0 && (
                                            <AudiobookPlayer
                                                chapters={playerChapters}
                                                currentIndex={playingIndex}
                                                bookTitle={data.engine ? `${data.engine} / ${data.voice || ""}` : ""}
                                                onChapterChange={setPlayingIndex}
                                                onClose={() => setPlayingIndex(null)}
                                            />
                                        )}
                                    </>
                                );
                            })()}
                        </>;
                    })()}
                </>
            )}

            {/* Previews sub-tab */}
            {subTab === "previews" && (
                <>
                    {!hasPreviews ? (
                        <div className={styles.audiobookMuted}>
                            {t("ui.audiobook.previews_empty", "Keine Previews vorhanden. Nutze den Vorhören-Button im Editor um eine Vorschau zu erstellen.")}
                        </div>
                    ) : (
                        <>
                            <div style={{display: "flex", justifyContent: "flex-end", marginBottom: 8}}>
                                <button className="btn btn-ghost btn-sm" onClick={handleDeleteAllPreviews} disabled={busy} style={{color: "var(--danger, #c0392b)", fontSize: "0.75rem"}}>
                                    <Trash2 size={10}/> {t("ui.audiobook.delete_all_previews", "Alle löschen")}
                                </button>
                            </div>
                            <ul className={styles.audiobookChapterList}>
                                {previews.map((p) => (
                                    <li key={p.filename} className={styles.audiobookChapterItem} style={{flexDirection: "column", alignItems: "stretch", gap: 4}}>
                                        <div className="icon-row">
                                            <span style={{flex: 1, fontSize: "0.75rem", wordBreak: "break-all"}}>{p.filename}</span>
                                            <span className={styles.audiobookMuted}>{formatBytes(p.size_bytes)}</span>
                                            <a href={p.url} download className="btn-icon" title="Download"><Download size={12}/></a>
                                            <button className="btn-icon" onClick={() => handleDeletePreview(p.filename)} disabled={busy} title={t("ui.common.delete", "Löschen")} style={{color: "var(--danger, #c0392b)"}}>
                                                <Trash2 size={12}/>
                                            </button>
                                        </div>
                                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                        <audio controls src={p.url} style={{width: "100%", height: 28}} preload="none"/>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
