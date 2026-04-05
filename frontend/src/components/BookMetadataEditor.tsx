import {useState, useEffect} from "react";
import {Book} from "../api/client";
import {Save, Copy, ChevronLeft} from "lucide-react";
import {notify} from "../utils/notify";
import {useI18n} from "../hooks/useI18n";
import KeywordInput from "./KeywordInput";
import {EDGE_TTS_VOICES} from "../data/edge-tts-voices";

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
        });
    }, [book]);

    const set = (key: string, value: string) => setForm((prev) => ({...prev, [key]: value}));

    const handleSave = async () => {
        setSaving(true);
        try {
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                if (key === "keywords" && value) {
                    // Keywords are already stored as JSON string from KeywordInput
                    data[key] = value;
                } else {
                    data[key] = value || null;
                }
            }
            await onSave(data);
            notify.success("Metadaten gespeichert");
        } catch {
            notify.error("Fehler beim Speichern");
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
            cover_image: prev.cover_image || "",  // Keep own cover
        }));
        setShowCopyDialog(false);
        notify.success(`Verlag und Autoren-Info von "${sourceBook.title}" übernommen`);
    };

    const otherBooks = (allBooks || []).filter((b) => b.id !== book.id);

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={{display: "flex", alignItems: "center", gap: 8}}>
                    <button className="btn-icon" onClick={onBack} title="Zurück zum Editor">
                        <ChevronLeft size={18}/>
                    </button>
                    <h2 style={styles.title}>Buch-Metadaten</h2>
                </div>
                <div style={{display: "flex", gap: 8}}>
                    {otherBooks.length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCopyDialog(!showCopyDialog)}>
                            <Copy size={14}/> Von Buch übernehmen
                        </button>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                        <Save size={14}/> {saving ? "Speichert..." : "Speichern"}
                    </button>
                </div>
            </div>

            {/* Copy from dialog */}
            {showCopyDialog && (
                <div style={styles.copyDialog}>
                    <p style={{fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: 8}}>
                        Uebernimmt Verlag, Autoren-Bio und CSS von einem anderen Buch:
                    </p>
                    {otherBooks.map((b) => (
                        <button key={b.id} className="btn btn-ghost btn-sm" onClick={() => handleCopyFrom(b)}
                            style={{display: "block", width: "100%", textAlign: "left", marginBottom: 4}}>
                            {b.title} <span style={{color: "var(--text-muted)"}}>- {b.author}</span>
                        </button>
                    ))}
                </div>
            )}

            <div style={styles.grid}>
                {/* Basis */}
                <Section title="Allgemein">
                    <Field label="Untertitel" value={form.subtitle} onChange={(v) => set("subtitle", v)}/>
                    <Field label="Beschreibung" value={form.description} onChange={(v) => set("description", v)} multiline/>
                    <Row>
                        <Field label="Edition" value={form.edition} onChange={(v) => set("edition", v)} placeholder="z.B. Second Edition"/>
                        <Field label="Datum" value={form.publish_date} onChange={(v) => set("publish_date", v)} placeholder="z.B. 2025"/>
                    </Row>
                </Section>

                {/* Verlag */}
                <Section title="Verlag">
                    <Row>
                        <Field label="Verlag" value={form.publisher} onChange={(v) => set("publisher", v)} placeholder="z.B. Conscious Path Publishing"/>
                        <Field label="Stadt" value={form.publisher_city} onChange={(v) => set("publisher_city", v)} placeholder="z.B. Ludwigsburg"/>
                    </Row>
                </Section>

                {/* ISBN / ASIN */}
                <Section title="ISBN und ASIN">
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
                </Section>

                {/* Marketing */}
                <Section title="Marketing und Amazon">
                    <div className="field">
                        <label className="label">Keywords (max. 7)</label>
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
                    <Field label="Buch-Beschreibung (HTML für Amazon)" value={form.html_description}
                        onChange={(v) => set("html_description", v)} multiline/>
                    <Field label="Rückseitenbeschreibung" value={form.backpage_description}
                        onChange={(v) => set("backpage_description", v)} multiline/>
                    <Field label="Autoren-Kurzbiographie (Rückseite)" value={form.backpage_author_bio}
                        onChange={(v) => set("backpage_author_bio", v)} multiline/>
                </Section>

                {/* Design */}
                <Section title="Design">
                    <Field label="Cover-Bild Pfad" value={form.cover_image} onChange={(v) => set("cover_image", v)}
                        placeholder="z.B. assets/covers/cover.jpg"/>
                    <Field label="Custom CSS (EPUB-Styles)" value={form.custom_css} onChange={(v) => set("custom_css", v)}
                        multiline mono/>
                </Section>

                <Section title="Audiobook">
                    <AudiobookBookConfig
                        bookLanguage={book.language}
                        engine={form.tts_engine || ""}
                        voice={form.tts_voice || ""}
                        speed={form.tts_speed || "1.0"}
                        onEngineChange={(v: string) => { set("tts_engine", v); set("tts_voice", ""); }}
                        onVoiceChange={(v: string) => set("tts_voice", v)}
                        onSpeedChange={(v: string) => set("tts_speed", v)}
                    />
                </Section>
            </div>
        </div>
    );
}

// --- Sub-components ---

function Section({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <div style={styles.section}>
            <h3 style={styles.sectionTitle}>{title}</h3>
            {children}
        </div>
    );
}

function Row({children}: {children: React.ReactNode}) {
    return <div style={styles.row}>{children}</div>;
}

function Field({label, value, onChange, placeholder, multiline, mono}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
    mono?: boolean;
}) {
    const inputStyle = mono ? {...styles.input, fontFamily: "var(--font-mono)", fontSize: "0.8125rem"} : styles.input;
    return (
        <div className="field" style={{flex: 1}}>
            <label className="label">{label}</label>
            {multiline ? (
                <textarea
                    className="input"
                    style={{...inputStyle, minHeight: 80, resize: "vertical"}}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            ) : (
                <input
                    className="input"
                    style={inputStyle}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            )}
        </div>
    );
}

function tryParseKeywords(raw: string): string {
    try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.join(", ");
    } catch {/* ignore */}
    return raw;
}

// --- Styles ---

function AudiobookBookConfig({bookLanguage, engine, voice, speed, onEngineChange, onVoiceChange, onSpeedChange}: {
    bookLanguage: string;
    engine: string;
    voice: string;
    speed: string;
    onEngineChange: (v: string) => void;
    onVoiceChange: (v: string) => void;
    onSpeedChange: (v: string) => void;
}) {
    const {t} = useI18n();
    const [voices, setVoices] = useState<{id: string; name: string; gender: string}[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const currentEngine = engine || "edge-tts";

    useEffect(() => {
        setLoadingVoices(true);
        // Try the audiobook voices API; if plugin not active, use empty fallback
        // Try core voices API first (always available), then plugin API, then hardcoded fallback
        fetch(`/api/voices?engine=${currentEngine}&language=${bookLanguage}`)
            .then((r) => {
                if (r.ok) return r.json();
                // Core API failed, try audiobook plugin API
                return fetch(`/api/audiobook/voices?engine=${currentEngine}&language=${bookLanguage}`)
                    .then((r2) => r2.ok ? r2.json() : null);
            })
            .then((data) => {
                if (data && data.length > 0) return data;
                // Both APIs failed, use hardcoded fallback
                const lang = bookLanguage.toLowerCase().split("-")[0];
                return EDGE_TTS_VOICES[lang] || EDGE_TTS_VOICES["en"] || [];
            })
            .then((data) => {
                setVoices(data);
                if (data.length > 0 && !data.some((v: {id: string}) => v.id === voice)) {
                    onVoiceChange(data[0].id);
                }
            })
            .catch(() => setVoices([]))
            .finally(() => setLoadingVoices(false));
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
                    <option value="google-tts">Google TTS</option>
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
                            <option key={v.id} value={v.id}>{v.name || v.id}{v.gender ? ` (${v.gender})` : ""}</option>
                        ))}
                    </select>
                ) : (
                    <div style={{padding: "6px 0", color: "var(--text-muted)", fontSize: "0.8125rem"}}>
                        {t("ui.audiobook.engine_unavailable", "Engine nicht verfuegbar")}
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
        </>
    );
}

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
    grid: {
        maxWidth: 800, display: "flex", flexDirection: "column", gap: 24,
    },
    section: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 20,
    },
    sectionTitle: {
        fontSize: "0.9375rem", fontWeight: 600, marginBottom: 12,
        color: "var(--text-primary)",
    },
    row: {
        display: "flex", gap: 12,
    },
    input: {},
    copyDialog: {
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: 16, marginBottom: 16,
    },
};
