import {useState, useEffect} from "react";
import {api, ApiError, AudiobookVoice, Book, BookAudiobook, formatVoiceLabel} from "../api/client";
import {Save, Copy, ChevronLeft, Download, Trash2, Package} from "lucide-react";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import KeywordInput from "./KeywordInput";
import CoverUpload from "./CoverUpload";
import * as Tabs from "@radix-ui/react-tabs";

interface Props {
    book: Book;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onBack: () => void;
    allBooks?: Book[];
}

export default function BookMetadataEditor({book, onSave, onBack, allBooks}: Props) {
    const {t} = useI18n();
    const [form, setForm] = useState<Record<string, string | null>>({});
    const [saving, setSaving] = useState(false);
    const [showCopyDialog, setShowCopyDialog] = useState(false);

    useEffect(() => {
        setForm({
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
            keywords: book.keywords ? tryParseKeywords(book.keywords) : "[]",
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
    }, [book]);

    const set = (key: string, value: string) => setForm((prev) => ({...prev, [key]: value}));

    const handleSave = async () => {
        setSaving(true);
        try {
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                data[key] = key === "keywords" && value ? value : (value || null);
            }
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
        notify.success(`Verlag und Autoren-Info von "${sourceBook.title}" uebernommen`);
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <button className="btn-icon" onClick={onBack} title={t("ui.sidebar.back_to_dashboard", "Zurueck")}>
                        <ChevronLeft size={18}/>
                    </button>
                    <h2 style={styles.title}>{t("ui.sidebar.metadata", "Buch-Metadaten")}</h2>
                </div>
                <div style={{display: "flex", gap: 8}}>
                    {otherBooks.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCopyDialog(!showCopyDialog)}>
                            <Copy size={14}/> {t("ui.metadata.copy_from", "Von Buch uebernehmen")}
                        </button>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                        <Save size={14}/> {saving ? t("ui.editor.saving", "Speichert...") : t("ui.common.save", "Speichern")}
                    </button>
                </div>
            </div>

            {showCopyDialog && (
                <div style={styles.copyDialog}>
                    <p style={{fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8}}>
                        {t("ui.metadata.copy_hint", "Uebernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:")}
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
                <Tabs.List className="radix-tab-list" style={{marginBottom: 16, overflowX: "auto", whiteSpace: "nowrap"}}>
                    <Tabs.Trigger value="general" className="radix-tab-trigger">{t("ui.metadata.tab_general", "Allgemein")}</Tabs.Trigger>
                    <Tabs.Trigger value="publisher" className="radix-tab-trigger">{t("ui.metadata.tab_publisher", "Verlag")}</Tabs.Trigger>
                    <Tabs.Trigger value="isbn" className="radix-tab-trigger">{t("ui.metadata.tab_isbn", "ISBN")}</Tabs.Trigger>
                    <Tabs.Trigger value="marketing" className="radix-tab-trigger">{t("ui.metadata.tab_marketing", "Marketing")}</Tabs.Trigger>
                    <Tabs.Trigger value="design" className="radix-tab-trigger">{t("ui.metadata.tab_design", "Design")}</Tabs.Trigger>
                    <Tabs.Trigger value="audiobook" className="radix-tab-trigger">{t("ui.metadata.tab_audiobook", "Audiobook")}</Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="general">
                    <div style={styles.tabContent}>
                        <Field label={t("ui.metadata.subtitle", "Untertitel")} value={form.subtitle} onChange={(v) => set("subtitle", v)}/>
                        <Field label={t("ui.metadata.description", "Beschreibung")} value={form.description} onChange={(v) => set("description", v)} multiline/>
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
                        <div className="field">
                            <label className="label">{t("ui.metadata.keywords", "Keywords (max. 7)")}</label>
                            <KeywordInput
                                keywords={(() => {
                                    try {
                                        const parsed = JSON.parse(form.keywords || "[]");
                                        return Array.isArray(parsed) ? parsed : [];
                                    } catch {
                                        return form.keywords ? String(form.keywords).split(",").map((s) => s.trim()).filter(Boolean) : [];
                                    }
                                })()}
                                onChange={(kws) => set("keywords", JSON.stringify(kws))}
                            />
                        </div>
                        <Field label={t("ui.metadata.html_description", "Buch-Beschreibung (HTML fuer Amazon)")} value={form.html_description}
                            onChange={(v) => set("html_description", v)} multiline maxChars={4000}/>
                        <Field label={t("ui.metadata.backpage_description", "Rueckseitenbeschreibung")} value={form.backpage_description}
                            onChange={(v) => set("backpage_description", v)} multiline maxChars={600}/>
                        <Field label={t("ui.metadata.author_bio", "Autoren-Kurzbiographie (Rueckseite)")} value={form.backpage_author_bio}
                            onChange={(v) => set("backpage_author_bio", v)} multiline maxChars={2000}/>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="design">
                    <div style={styles.tabContent}>
                        <CoverUpload
                            bookId={book.id}
                            coverImage={form.cover_image ?? null}
                            onChange={(newPath) => set("cover_image", newPath ?? "")}
                        />
                        <Field label={t("ui.metadata.custom_css", "Custom CSS (EPUB-Styles)")} value={form.custom_css} onChange={(v) => set("custom_css", v)}
                            multiline mono/>
                    </div>
                </Tabs.Content>

                <Tabs.Content value="audiobook">
                    <div style={styles.tabContent}>
                        <AudiobookBookConfig
                            bookLanguage={book.language}
                            bookTitle={book.title}
                            engine={form.tts_engine || ""}
                            voice={form.tts_voice || ""}
                            speed={form.tts_speed || "1.0"}
                            merge={form.audiobook_merge || "merged"}
                            customFilename={form.audiobook_filename || ""}
                            onEngineChange={(v: string) => { set("tts_engine", v); set("tts_voice", ""); }}
                            onVoiceChange={(v: string) => set("tts_voice", v)}
                            onSpeedChange={(v: string) => set("tts_speed", v)}
                            onMergeChange={(v: string) => set("audiobook_merge", v)}
                            onCustomFilenameChange={(v: string) => set("audiobook_filename", v)}
                        />
                        <AudiobookDownloads bookId={book.id}/>
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

function Field({label, value, onChange, placeholder, multiline, mono, maxChars}: {
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
}) {
    const {t} = useI18n();
    const inputStyle = mono ? {...styles.input, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"} : styles.input;
    const text = value || "";
    return (
        <div className="field" style={{flex: 1}}>
            <label className="label">{label}</label>
            {multiline ? (
                <textarea
                    className="input"
                    style={{...inputStyle, ...styles.multilineInput, ...(mono ? {fontFamily: "var(--font-mono)"} : {})}}
                    rows={8}
                    value={text}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            ) : (
                <input className="input" style={inputStyle}
                    value={text} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/>
            )}
            {maxChars !== undefined && multiline && (
                <CharCounter
                    count={text.length}
                    max={maxChars}
                    label={t("ui.metadata.characters", "Zeichen")}
                />
            )}
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

function tryParseKeywords(raw: string): string {
    try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.join(", ");
    } catch {/* ignore */}
    return raw;
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
    bookLanguage, bookTitle, engine, voice, speed, merge, customFilename,
    onEngineChange, onVoiceChange, onSpeedChange, onMergeChange, onCustomFilenameChange,
}: {
    bookLanguage: string; bookTitle: string; engine: string; voice: string;
    speed: string; merge: string; customFilename: string;
    onEngineChange: (v: string) => void; onVoiceChange: (v: string) => void;
    onSpeedChange: (v: string) => void; onMergeChange: (v: string) => void;
    onCustomFilenameChange: (v: string) => void;
}) {
    const {t} = useI18n();
    const [voices, setVoices] = useState<AudiobookVoice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const currentEngine = engine || "edge-tts";

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
                    {t("ui.audiobook.language_from_book", "Wird aus den Buch-Einstellungen uebernommen.")}
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
                {loadingVoices ? (
                    <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                        {t("ui.audiobook.voices_loading", "Stimmen werden geladen...")}
                    </div>
                ) : voices.length > 0 ? (
                    <select className="input" value={voice} onChange={(e) => onVoiceChange(e.target.value)}>
                        {voices.map((v) => (
                            <option key={v.id} value={v.id}>{formatVoiceLabel(v)}</option>
                        ))}
                    </select>
                ) : (
                    <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                        {t("ui.audiobook.no_voices_for_combo", "Keine Stimmen fuer {engine} in {language} verfuegbar")
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
                <label className="label">{t("ui.audiobook.merge", "Kapitel zusammenfuegen")}</label>
                <select className="input" value={merge} onChange={(e) => onMergeChange(e.target.value)}>
                    <option value="separate">{t("ui.audiobook.merge_separate", "Alle Kapitel einzeln")}</option>
                    <option value="merged">{t("ui.audiobook.merge_merged", "Alle Kapitel zusammenfuegen")}</option>
                    <option value="both">{t("ui.audiobook.merge_both", "Beides")}</option>
                </select>
            </div>
            <CustomFilenameField
                bookTitle={bookTitle}
                value={customFilename}
                onChange={onCustomFilenameChange}
            />
        </>
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
            <label className="label" style={{display: "flex", alignItems: "center", gap: 8}}>
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

function AudiobookDownloads({bookId}: {bookId: string}) {
    const {t} = useI18n();
    const [data, setData] = useState<BookAudiobook | null>(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            const result = await api.bookAudiobook.get(bookId);
            setData(result);
        } catch (err) {
            // 404 etc -> render empty state instead of crashing
            if (!(err instanceof ApiError) || err.status !== 404) {
                console.error("Failed to load audiobook metadata:", err);
            }
            setData({exists: false, book_id: bookId});
        }
    };

    useEffect(() => {
        load();
    }, [bookId]);

    const handleDelete = async () => {
        if (!confirm(t("ui.audiobook.delete_confirm", "Audiobook wirklich loeschen? Die Dateien sind danach weg."))) {
            return;
        }
        setBusy(true);
        try {
            await api.bookAudiobook.delete(bookId);
            notify.success(t("ui.audiobook.deleted", "Audiobook geloescht"));
            await load();
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Loeschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    if (!data) {
        return (
            <div style={audiobookStyles.section}>
                <h4 style={audiobookStyles.header}>
                    {t("ui.audiobook.downloads_title", "Verfuegbare Downloads")}
                </h4>
                <div style={audiobookStyles.muted}>
                    {t("ui.common.loading", "Laden...")}
                </div>
            </div>
        );
    }

    if (!data.exists) {
        return (
            <div style={audiobookStyles.section}>
                <h4 style={audiobookStyles.header}>
                    {t("ui.audiobook.downloads_title", "Verfuegbare Downloads")}
                </h4>
                <div style={audiobookStyles.muted}>
                    {t(
                        "ui.audiobook.downloads_empty",
                        "Noch kein Audiobook generiert. Nutze den Export-Dialog um eines zu erstellen.",
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={audiobookStyles.section}>
            <h4 style={audiobookStyles.header}>
                {t("ui.audiobook.downloads_title", "Verfuegbare Downloads")}
            </h4>
            <div style={audiobookStyles.metaLine}>
                {data.created_at && (
                    <span>
                        {t("ui.audiobook.created_at", "Erstellt am")}:{" "}
                        {new Date(data.created_at).toLocaleString()}
                    </span>
                )}
                {data.engine && (
                    <span style={{marginLeft: 12}}>
                        {t("ui.audiobook.engine", "Engine")}: {data.engine}
                    </span>
                )}
                {data.voice && (
                    <span style={{marginLeft: 12}}>
                        {t("ui.audiobook.voice", "Stimme")}: {data.voice}
                    </span>
                )}
                {data.speed && (
                    <span style={{marginLeft: 12}}>{data.speed}x</span>
                )}
            </div>

            <div style={{display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap"}}>
                {data.merged && (
                    <a
                        className="btn btn-primary btn-sm"
                        href={api.bookAudiobook.mergedUrl(bookId)}
                        download
                    >
                        <Download size={12}/>{" "}
                        {t("ui.audiobook.download_merged", "Gemergtes Audiobook")}{" "}
                        ({formatBytes(data.merged.size_bytes)})
                    </a>
                )}
                {data.chapters && data.chapters.length > 0 && (
                    <a
                        className="btn btn-secondary btn-sm"
                        href={api.bookAudiobook.zipUrl(bookId)}
                        download
                    >
                        <Package size={12}/>{" "}
                        {t("ui.audiobook.download_zip", "ZIP mit einzelnen Kapiteln")}
                    </a>
                )}
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleDelete}
                    disabled={busy}
                    style={{color: "var(--danger, #c0392b)"}}
                >
                    <Trash2 size={12}/>{" "}
                    {t("ui.audiobook.delete", "Audiobook loeschen")}
                </button>
            </div>

            {data.chapters && data.chapters.length > 0 && (
                <div style={{marginTop: 16}}>
                    <h5 style={audiobookStyles.subHeader}>
                        {t("ui.audiobook.individual_chapters", "Einzelne Kapitel")}
                    </h5>
                    <ul style={audiobookStyles.chapterList}>
                        {data.chapters.map((ch) => (
                            <li key={ch.filename} style={audiobookStyles.chapterItem}>
                                <span style={{flex: 1}}>{ch.filename}</span>
                                <span style={audiobookStyles.muted}>
                                    {formatBytes(ch.size_bytes)}
                                </span>
                                <a
                                    href={ch.url}
                                    download
                                    className="btn-icon"
                                    title={t("ui.audiobook.download", "Download")}
                                >
                                    <Download size={12}/>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
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
