import {useState, useEffect, useCallback} from "react";
import {useNavigate} from "react-router-dom";
import DOMPurify from "dompurify";
import {api, ApiError, AudiobookChapterFile, AudiobookVoice, Book, BookAudiobook, BookDetail, Chapter, formatVoiceLabel} from "../api/client";
import {Save, Copy, ChevronLeft, Download, Trash2, Package, Sparkles, CheckCircle, Clock, AlertCircle, Play, Pause} from "lucide-react";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import {useAuthorProfile, profileDisplayNames, type AuthorProfile} from "../hooks/useAuthorProfile";
import {useAllowBooksWithoutAuthor} from "../hooks/useAllowBooksWithoutAuthor";
import {EnhancedTextarea} from "./textarea/EnhancedTextarea";
import {useWebSocket} from "../hooks/useWebSocket";
import {useDialog} from "./AppDialog";
import {useEditorPluginStatus, isPluginAvailable} from "../hooks/useEditorPluginStatus";
import KeywordInput from "./KeywordInput";
import CoverUpload from "./CoverUpload";
import AudiobookPlayer, {PlayerChapter} from "./AudiobookPlayer";
import * as Tabs from "@radix-ui/react-tabs";
import QualityTab, {NavigableFindingType} from "./QualityTab";
import TranslationLinks from "./TranslationLinks";

interface Props {
    book: BookDetail;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onBack: () => void;
    allBooks?: Book[];
    onNavigateToIssue?: (chapterId: string, findingType: NavigableFindingType) => void;
}

export default function BookMetadataEditor({book, onSave, onBack, allBooks, onNavigateToIssue}: Props) {
    const {t} = useI18n();
    const [form, setForm] = useState<Record<string, string | null>>({});
    const [keywords, setKeywords] = useState<string[]>([]);
    const [audiobookOverwrite, setAudiobookOverwrite] = useState<boolean>(false);
    const [audiobookSkipTypes, setAudiobookSkipTypes] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [aiGenerating, setAiGenerating] = useState<string | null>(null);
    const {status: pluginStatus} = useEditorPluginStatus();
    const authorProfile = useAuthorProfile();
    const allowDeferAuthor = useAllowBooksWithoutAuthor();

    useEffect(() => {
        setForm({
            author: book.author || "",
            language: book.language || "de",
            subtitle: book.subtitle || "",
            description: book.description || "",
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
        });
        setKeywords(Array.isArray(book.keywords) ? book.keywords : []);
        setAudiobookOverwrite(Boolean(book.audiobook_overwrite_existing));
        setAudiobookSkipTypes(
            Array.isArray(book.audiobook_skip_chapter_types)
                ? book.audiobook_skip_chapter_types
                : [],
        );
    }, [book]);

    const set = (key: string, value: string) => setForm((prev) => ({...prev, [key]: value}));

    const handleSave = async () => {
        setSaving(true);
        try {
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                data[key] = value || null;
            }
            data.keywords = keywords;
            data.audiobook_overwrite_existing = audiobookOverwrite;
            data.audiobook_skip_chapter_types = audiobookSkipTypes;
            await onSave(data);
            notify.success(t("ui.common.save", "Metadaten gespeichert"));
        } catch (err) {
            notify.error(t("ui.common.error", "Fehler beim Speichern"), err);
        }
        setSaving(false);
    };

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

    const aiAvailable = isPluginAvailable(pluginStatus, "ai");

    const handleAiGenerate = async (field: string) => {
        setAiGenerating(field);
        try {
            const res = await fetch("/api/ai/generate-marketing", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    field,
                    book_title: book.title,
                    author: book.author,
                    genre: book.genre || "",
                    language: book.language || "de",
                    description: book.description || "",
                    chapter_titles: book.chapters.map((ch) => ch.title),
                    existing_text: field === "keywords" ? "" : (form[field] || ""),
                    book_id: book.id,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({detail: "AI generation failed"}));
                notify.error(err.detail || t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"));
            } else {
                const data = await res.json();
                if (field === "keywords") {
                    try {
                        const parsed = JSON.parse(data.content);
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
                    set(field, data.content || "");
                    notify.success(t("ui.metadata.ai_text_generated", "Text generiert"));
                }
            }
        } catch {
            notify.error(t("ui.metadata.ai_generate_error", "AI-Generierung fehlgeschlagen"));
        }
        setAiGenerating(null);
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div className="icon-row">
                    <button className="btn-icon" onClick={onBack} title={t("ui.sidebar.back_to_dashboard", "Zurück")}>
                        <ChevronLeft size={18}/>
                    </button>
                    <h2 style={styles.title}>{t("ui.sidebar.metadata", "Buch-Metadaten")}</h2>
                </div>
                <div style={{display: "flex", gap: 8}}>
                    {otherBooks.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCopyDialog(!showCopyDialog)}>
                            <Copy size={14}/> {t("ui.metadata.copy_from", "Von Buch übernehmen")}
                        </button>
                    )}
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
                <div style={styles.copyDialog}>
                    <p style={{fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8}}>
                        {t("ui.metadata.copy_hint", "Übernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:")}
                    </p>
                    {otherBooks.map((b) => (
                        <button key={b.id} className="btn btn-ghost btn-sm" onClick={() => handleCopyFrom(b)}
                            style={{display: "block", width: "100%", textAlign: "left", marginBottom: 4}}>
                            {b.title} <span style={{color: "var(--text-muted)"}}>- {b.author}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <Tabs.Root defaultValue="general" style={{maxWidth: 800}}>
                <Tabs.List className="radix-tabs-list" style={{marginBottom: 16}}>
                    <Tabs.Trigger value="general" className="radix-tab-trigger">{t("ui.metadata.tab_general", "Allgemein")}</Tabs.Trigger>
                    <Tabs.Trigger value="publisher" className="radix-tab-trigger">{t("ui.metadata.tab_publisher", "Verlag")}</Tabs.Trigger>
                    <Tabs.Trigger value="isbn" className="radix-tab-trigger">{t("ui.metadata.tab_isbn", "ISBN")}</Tabs.Trigger>
                    <Tabs.Trigger value="marketing" className="radix-tab-trigger" data-testid="metadata-tab-marketing">{t("ui.metadata.tab_marketing", "Marketing")}</Tabs.Trigger>
                    <Tabs.Trigger value="design" className="radix-tab-trigger">{t("ui.metadata.tab_design", "Design")}</Tabs.Trigger>
                    <Tabs.Trigger value="audiobook" className="radix-tab-trigger">{t("ui.metadata.tab_audiobook", "Audiobook")}</Tabs.Trigger>
                    <Tabs.Trigger value="quality" className="radix-tab-trigger">{t("ui.metadata.tab_quality", "Qualitaet")}</Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="general">
                    <div style={styles.tabContent}>
                        <TranslationLinks bookId={book.id} />
                        <Row>
                            <AuthorSelectField
                                label={t("ui.metadata.author", "Autor")}
                                value={form.author || ""}
                                profile={authorProfile}
                                allowEmpty={allowDeferAuthor}
                                onChange={(v) => set("author", v)}
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
                    </div>
                </Tabs.Content>

                <Tabs.Content value="publisher">
                    <div style={styles.tabContent}>
                        <Row>
                            <Field label={t("ui.metadata.publisher", "Verlag")} value={form.publisher} onChange={(v) => set("publisher", v)} placeholder="z.B. Conscious Path Publishing"/>
                            <Field label={t("ui.metadata.publisher_city", "Stadt")} value={form.publisher_city} onChange={(v) => set("publisher_city", v)} placeholder="z.B. Ludwigsburg"/>
                        </Row>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="isbn">
                    <div style={styles.tabContent}>
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

                <Tabs.Content value="marketing">
                    <div style={styles.tabContent}>
                        {book.ai_tokens_used > 0 && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: 8,
                                padding: "8px 12px", marginBottom: 12,
                                background: "var(--bg-surface, var(--bg-card))", borderRadius: "var(--radius-sm)",
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
                    <div style={styles.tabContent}>
                        <CoverUpload
                            bookId={book.id}
                            coverImage={form.cover_image ?? null}
                            onChange={(newPath) => set("cover_image", newPath ?? "")}
                        />
                        <AuthorAssetsPanel bookId={book.id}/>
                        <Field label={t("ui.metadata.custom_css", "Custom CSS (EPUB-Styles)")} value={form.custom_css} onChange={(v) => set("custom_css", v)}
                            multiline mono fullscreen/>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="audiobook">
                    <div style={styles.tabContent}>
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
                    <div style={styles.tabContent}>
                        <QualityTab bookId={book.id} onNavigateToIssue={onNavigateToIssue} />
                    </div>
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}

// --- Sub-components ---

function Row({children}: {children: React.ReactNode}) {
    return <div style={styles.row}>{children}</div>;
}

/**
 * Author field as a selection-only dropdown.
 *
 * Author management lives ONLY in Settings; this field never lets
 * the user create or rename. Options come from the single author
 * profile (real name + pen names). The current value, if it does
 * not match any known option, surfaces as a disabled fallback so
 * stale references stay visible until the user picks a real one.
 *
 * Pseudonyms render in an optgroup labeled with the parent real
 * name; if the user only has pen_names configured (no real name
 * set), pen_names appear ungrouped under a single placeholder.
 */
function AuthorSelectField({
    label,
    value,
    profile,
    onChange,
    allowEmpty,
}: {
    label: string;
    value: string;
    profile: AuthorProfile | null;
    onChange: (v: string) => void;
    /** When true, an empty selection is a valid "no author" state
     * (the Settings toggle ``app.allow_books_without_author`` is on).
     * Adds an explicit "(no author)" option so the user can clear
     * the field; the placeholder is no longer disabled. */
    allowEmpty: boolean;
}) {
    const {t} = useI18n();
    const navigate = useNavigate();
    const knownNames = profileDisplayNames(profile);
    const valueIsKnown = value !== "" && knownNames.includes(value);
    const valueIsUnknown = value !== "" && !valueIsKnown;

    return (
        <div className="field" style={{flex: 1}}>
            <label className="label">{label}</label>
            <select
                className="input"
                style={styles.input}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid="metadata-author-select"
            >
                {allowEmpty && (
                    <option value="">
                        {t("ui.metadata.author_no_author", "(no author)")}
                    </option>
                )}
                {!allowEmpty && value === "" && (
                    <option value="" disabled>
                        {t("ui.metadata.author_placeholder", "Autor auswählen...")}
                    </option>
                )}
                {valueIsUnknown && (
                    <option value={value} disabled>
                        {t("ui.metadata.author_unknown_prefix", "[unbekannt:")} {value}]
                    </option>
                )}
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
                    <optgroup label={t("ui.metadata.author_pen_names_label", "Pen Names")}>
                        {profile.pen_names.map((pen) => (
                            <option key={pen} value={pen}>
                                {pen}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
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
    const inputStyle = mono ? {...styles.input, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"} : styles.input;
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
export function AuthorAssetsPanel({bookId}: {bookId: string}) {
    const {t} = useI18n();
    const [assets, setAssets] = useState<{id: string; filename: string; asset_type: string; path: string}[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        api.assets
            .list(bookId)
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
            await api.assets.delete(bookId, assetId);
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
                        <img
                            src={`/api/books/${bookId}/assets/file/${asset.filename}`}
                            alt={asset.filename}
                            style={{
                                width: "100%",
                                aspectRatio: "3/4",
                                objectFit: "cover",
                                borderRadius: 4,
                                background: "var(--bg-hover)",
                            }}
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
                    className="input"
                    style={{
                        ...styles.multilineInput,
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
                    className="input"
                    style={{...styles.multilineInput, maxWidth: "100%"}}
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
                <select className="input" value={currentEngine} onChange={(e) => onEngineChange(e.target.value)}>
                    <option value="edge-tts">Microsoft Edge TTS</option>
                    <option value="google-tts">Google TTS (gTTS)</option>
                    <option value="google-cloud-tts">Google Cloud TTS</option>
                    <option value="pyttsx3">pyttsx3 (Offline)</option>
                    <option value="elevenlabs">ElevenLabs</option>
                </select>
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
                    <select className="input" value={voice} onChange={(e) => onVoiceChange(e.target.value)}>
                        {filteredVoices.map((v) => (
                            <option key={v.id} value={v.id}>{formatVoiceLabel(v)}</option>
                        ))}
                    </select>
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
                <select className="input" value={speed} onChange={(e) => onSpeedChange(e.target.value)}>
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1.0">1.0x (Normal)</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                </select>
            </div>
            <div className="field">
                <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfügen")}</label>
                <select className="input" value={merge} onChange={(e) => onMergeChange(e.target.value)}>
                    <option value="separate">{t("ui.audiobook.merge_separate", "Alle Kapitel einzeln")}</option>
                    <option value="merged">{t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfügen")}</option>
                    <option value="both">{t("ui.audiobook.merge_both", "Beides")}</option>
                </select>
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
            <div style={audiobookStyles.section}>
                <div style={audiobookStyles.muted}>{t("ui.common.loading", "Laden...")}</div>
            </div>
        );
    }

    return (
        <div style={audiobookStyles.section}>
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
                                    <div style={audiobookStyles.metaLine}>
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
                                <div style={audiobookStyles.muted}>
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
                                        <ul style={{...audiobookStyles.chapterList, marginTop: 16}}>
                                            {sortedChapters.map((bookCh) => {
                                                const audio = audioByTitle.get(bookCh.title);
                                                const dur = audio ? formatDuration(audio.duration_seconds) : "";
                                                const playerIdx = chapterToPlayerIndex.get(bookCh.id);
                                                const isPlaying = playingIndex !== null && playerIdx === playingIndex;
                                                return (
                                                    <li key={bookCh.id} style={{
                                                        ...audiobookStyles.chapterItem,
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
                                                                    {dur && <span style={{...audiobookStyles.muted, whiteSpace: "nowrap"}}>{dur}</span>}
                                                                    <span style={audiobookStyles.muted}>{formatBytes(audio.size_bytes)}</span>
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
                        <div style={audiobookStyles.muted}>
                            {t("ui.audiobook.previews_empty", "Keine Previews vorhanden. Nutze den Vorhören-Button im Editor um eine Vorschau zu erstellen.")}
                        </div>
                    ) : (
                        <>
                            <div style={{display: "flex", justifyContent: "flex-end", marginBottom: 8}}>
                                <button className="btn btn-ghost btn-sm" onClick={handleDeleteAllPreviews} disabled={busy} style={{color: "var(--danger, #c0392b)", fontSize: "0.75rem"}}>
                                    <Trash2 size={10}/> {t("ui.audiobook.delete_all_previews", "Alle löschen")}
                                </button>
                            </div>
                            <ul style={audiobookStyles.chapterList}>
                                {previews.map((p) => (
                                    <li key={p.filename} style={{...audiobookStyles.chapterItem, flexDirection: "column", alignItems: "stretch", gap: 4}}>
                                        <div className="icon-row">
                                            <span style={{flex: 1, fontSize: "0.75rem", wordBreak: "break-all"}}>{p.filename}</span>
                                            <span style={audiobookStyles.muted}>{formatBytes(p.size_bytes)}</span>
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

const audiobookStyles: Record<string, React.CSSProperties> = {
    section: {
        marginTop: 24, paddingTop: 16,
        borderTop: "1px solid var(--border)",
    },
    header: {
        fontSize: "0.8125rem", fontWeight: 600,
        color: "var(--text-muted)", marginBottom: 8,
    },
    subHeader: {
        fontSize: "0.75rem", fontWeight: 600,
        color: "var(--text-muted)", marginBottom: 6,
    },
    metaLine: {
        fontSize: "0.75rem", color: "var(--text-secondary)",
    },
    muted: {
        fontSize: "0.75rem", color: "var(--text-muted)",
    },
    chapterList: {
        listStyle: "none", padding: 0, margin: 0,
        display: "flex", flexDirection: "column", gap: 4,
    },
    chapterItem: {
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 8px",
        background: "var(--bg-primary)",
        borderRadius: "var(--radius-sm)",
        fontSize: "0.8125rem",
    },
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        flex: 1, overflow: "auto", padding: "24px 32px",
        background: "var(--bg-primary)",
    },
    header: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 24,
    },
    title: {
        fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600,
    },
    tabContent: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
        display: "flex", flexDirection: "column", gap: 12,
        // Locks the tab area to a uniform height so switching between
        // tabs with very different content (general vs marketing) does
        // not make the page jump.
        minHeight: "var(--metadata-tab-min-height, 600px)",
    },
    row: {
        display: "flex", gap: 12,
    },
    input: {},
    multilineInput: {
        // Bigger writing area for descriptions; the user can drag the
        // resize handle vertically to grow it further.
        minHeight: 200,
        maxWidth: "100%",
        resize: "vertical",
        padding: 12,
        lineHeight: 1.5,
        fontFamily: "var(--font-body)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
    },
    copyDialog: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16,
    },
};
