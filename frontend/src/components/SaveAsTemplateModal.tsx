import {useState, useMemo} from "react";
import {
    api,
    ApiError,
    BookDetail,
    BookTemplate,
    BookTemplateChapter,
} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Select from "@radix-ui/react-select";
import {ChevronDown, ChevronRight} from "lucide-react";

type ContentMode = "empty" | "preserve";

const TEMPLATE_GENRES = ["children", "scifi", "nonfiction", "philosophy", "memoir"];
const LANGUAGES = ["de", "en", "es", "fr", "el"];

interface Props {
    open: boolean;
    book: BookDetail;
    onClose: () => void;
    onSaved?: (template: BookTemplate) => void;
}

export default function SaveAsTemplateModal({open, book, onClose, onSaved}: Props) {
    const {t} = useI18n();

    const defaultGenre = useMemo(
        () => (book.genre && TEMPLATE_GENRES.includes(book.genre) ? book.genre : "nonfiction"),
        [book.genre],
    );
    const defaultLanguage = useMemo(
        () => (LANGUAGES.includes(book.language) ? book.language : "en"),
        [book.language],
    );

    const [name, setName] = useState("");
    const [description, setDescription] = useState(book.description || "");
    const [genre, setGenre] = useState(defaultGenre);
    const [language, setLanguage] = useState(defaultLanguage);
    const [contentMode, setContentMode] = useState<ContentMode>("empty");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);

    const chapterCount = book.chapters.length;

    const resetForm = () => {
        setName("");
        setDescription(book.description || "");
        setGenre(defaultGenre);
        setLanguage(defaultLanguage);
        setContentMode("empty");
        setPreviewOpen(false);
        setNameError(null);
    };

    const handleClose = () => {
        if (saving) return;
        resetForm();
        onClose();
    };

    const buildChapters = async (): Promise<BookTemplateChapter[]> => {
        if (contentMode === "empty") {
            return book.chapters.map((c) => ({
                position: c.position,
                title: c.title,
                chapter_type: c.chapter_type,
                content: null,
            }));
        }
        // Preserve content: fetch the book again with content so we get the
        // full chapter bodies (BookEditor loads without content for speed).
        const full = await api.books.get(book.id, true);
        return full.chapters.map((c) => ({
            position: c.position,
            title: c.title,
            chapter_type: c.chapter_type,
            content: c.content,
        }));
    };

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        if (!trimmedName) {
            setNameError(t("ui.save_template.name_required", "Name ist erforderlich"));
            return;
        }
        if (!trimmedDescription) {
            notify.error(t("ui.save_template.description_required", "Beschreibung ist erforderlich"));
            return;
        }
        if (chapterCount === 0) {
            notify.error(t("ui.save_template.no_chapters", "Buch hat keine Kapitel"));
            return;
        }

        setSaving(true);
        setNameError(null);
        try {
            const chapters = await buildChapters();
            const created = await api.templates.create({
                name: trimmedName,
                description: trimmedDescription,
                genre,
                language,
                chapters,
            });
            notify.success(t("ui.save_template.saved", "Vorlage gespeichert"));
            onSaved?.(created);
            resetForm();
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setNameError(t("ui.save_template.name_taken", "Eine Vorlage mit diesem Namen existiert bereits"));
            } else {
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t("ui.save_template.save_failed", "Speichern fehlgeschlagen"),
                );
            }
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = !!name.trim() && !!description.trim() && chapterCount > 0 && !saving;

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide" data-testid="save-template-modal">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {t("ui.save_template.title", "Als Vorlage speichern")}: {book.title}
                        </Dialog.Title>
                    </div>

                    <div style={styles.body}>
                        <div className="field">
                            <label className="label">{t("ui.save_template.name", "Name")} *</label>
                            <input
                                className="input"
                                value={name}
                                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                                placeholder={t("ui.save_template.name_placeholder", "z.B. Mein Memoir-Muster")}
                                data-testid="save-template-name"
                                autoFocus
                                maxLength={100}
                            />
                            {nameError && (
                                <div style={styles.errorText} data-testid="save-template-name-error">{nameError}</div>
                            )}
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_template.description", "Beschreibung")} *</label>
                            <textarea
                                className="input"
                                rows={2}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={t("ui.save_template.description_placeholder", "Wofuer ist diese Vorlage?")}
                                data-testid="save-template-description"
                                maxLength={500}
                            />
                        </div>

                        <div style={styles.row}>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">{t("ui.save_template.genre", "Genre")}</label>
                                <Select.Root value={genre} onValueChange={setGenre}>
                                    <Select.Trigger className="radix-select-trigger" data-testid="save-template-genre">
                                        <Select.Value/>
                                        <Select.Icon><ChevronDown size={14}/></Select.Icon>
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                                            <Select.Viewport>
                                                {TEMPLATE_GENRES.map((g) => (
                                                    <Select.Item key={g} value={g} className="radix-select-item">
                                                        <Select.ItemText>{t(`ui.template_genres.${g}`, g)}</Select.ItemText>
                                                    </Select.Item>
                                                ))}
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            </div>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">{t("ui.save_template.language", "Sprache")}</label>
                                <Select.Root value={language} onValueChange={setLanguage}>
                                    <Select.Trigger className="radix-select-trigger" data-testid="save-template-language">
                                        <Select.Value/>
                                        <Select.Icon><ChevronDown size={14}/></Select.Icon>
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                                            <Select.Viewport>
                                                {LANGUAGES.map((l) => (
                                                    <Select.Item key={l} value={l} className="radix-select-item">
                                                        <Select.ItemText>{t(`ui.languages.${l}`, l)}</Select.ItemText>
                                                    </Select.Item>
                                                ))}
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            </div>
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_template.content_mode", "Kapitelinhalt")}</label>
                            <label style={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="content-mode"
                                    value="empty"
                                    checked={contentMode === "empty"}
                                    onChange={() => setContentMode("empty")}
                                    data-testid="save-template-content-empty"
                                    style={{accentColor: "var(--accent)"}}
                                />
                                <div>
                                    <div>{t("ui.save_template.content_empty", "Leere Platzhalter")}</div>
                                    <div style={styles.hint}>{t("ui.save_template.content_empty_hint", "Empfohlen fuer wiederverwendbare Vorlagen")}</div>
                                </div>
                            </label>
                            <label style={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="content-mode"
                                    value="preserve"
                                    checked={contentMode === "preserve"}
                                    onChange={() => setContentMode("preserve")}
                                    data-testid="save-template-content-preserve"
                                    style={{accentColor: "var(--accent)"}}
                                />
                                <div>
                                    <div>{t("ui.save_template.content_preserve", "Inhalt uebernehmen")}</div>
                                    <div style={styles.hint}>{t("ui.save_template.content_preserve_hint", "Kopiert den Kapiteltext in die Vorlage")}</div>
                                </div>
                            </label>
                        </div>

                        <Collapsible.Root open={previewOpen} onOpenChange={setPreviewOpen}>
                            <Collapsible.Trigger asChild>
                                <button style={styles.detailsToggle} data-testid="save-template-preview-toggle">
                                    {previewOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                    {t("ui.save_template.preview", "Kapitelvorschau")} ({chapterCount})
                                </button>
                            </Collapsible.Trigger>
                            <Collapsible.Content>
                                <div style={styles.previewList} data-testid="save-template-preview-list">
                                    {book.chapters
                                        .slice()
                                        .sort((a, b) => a.position - b.position)
                                        .map((c) => (
                                            <div key={c.id} style={styles.previewRow}>
                                                <span style={styles.previewPos}>{c.position + 1}.</span>
                                                <span style={styles.previewTitle}>{c.title}</span>
                                                <span style={styles.previewType}>{c.chapter_type}</span>
                                            </div>
                                        ))}
                                </div>
                            </Collapsible.Content>
                        </Collapsible.Root>
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={handleClose} disabled={saving}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            data-testid="save-template-submit"
                        >
                            {saving
                                ? t("ui.save_template.saving", "Speichert...")
                                : t("ui.save_template.save", "Speichern")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

const styles: Record<string, React.CSSProperties> = {
    body: {
        padding: "8px 0 16px",
    },
    row: {
        display: "flex",
        gap: 12,
    },
    radioRow: {
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "6px 0",
        cursor: "pointer",
        fontSize: "0.875rem",
    },
    hint: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        marginTop: 2,
    },
    detailsToggle: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        fontSize: "0.8125rem",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        padding: "8px 0 4px",
    },
    previewList: {
        maxHeight: 180,
        overflowY: "auto",
        paddingTop: 6,
        display: "flex",
        flexDirection: "column",
        gap: 4,
    },
    previewRow: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        fontSize: "0.8125rem",
    },
    previewPos: {
        minWidth: 24,
        color: "var(--text-muted)",
    },
    previewTitle: {
        flex: 1,
    },
    previewType: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        padding: "1px 6px",
        borderRadius: 4,
        background: "var(--bg-subtle, var(--bg-surface))",
    },
    errorText: {
        color: "var(--danger, #c43)",
        fontSize: "0.8125rem",
        marginTop: 4,
    },
};
