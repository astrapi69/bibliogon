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
import {EnhancedTextarea} from "./textarea/EnhancedTextarea";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Select from "@radix-ui/react-select";
import {ChevronDown, ChevronRight} from "lucide-react";
import styles from "./SaveAsTemplateModal.module.css";

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

                    <div className={styles.body}>
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
                                <div className={styles.errorText} data-testid="save-template-name-error">{nameError}</div>
                            )}
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_template.description", "Beschreibung")} *</label>
                            <EnhancedTextarea
                                value={description}
                                onChange={setDescription}
                                placeholder={t("ui.save_template.description_placeholder", "Wofür ist diese Vorlage?")}
                                testid="save-template-description"
                                rows={2}
                                maxChars={500}
                                ariaLabel={t("ui.save_template.description", "Beschreibung")}
                            />
                        </div>

                        <div className={styles.row}>
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
                            <label className={styles.radioRow}>
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
                                    <div className={styles.hint}>{t("ui.save_template.content_empty_hint", "Empfohlen für wiederverwendbare Vorlagen")}</div>
                                </div>
                            </label>
                            <label className={styles.radioRow}>
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
                                    <div>{t("ui.save_template.content_preserve", "Inhalt übernehmen")}</div>
                                    <div className={styles.hint}>{t("ui.save_template.content_preserve_hint", "Kopiert den Kapiteltext in die Vorlage")}</div>
                                </div>
                            </label>
                        </div>

                        <Collapsible.Root open={previewOpen} onOpenChange={setPreviewOpen}>
                            <Collapsible.Trigger asChild>
                                <button className={styles.detailsToggle} data-testid="save-template-preview-toggle">
                                    {previewOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                    {t("ui.save_template.preview", "Kapitelvorschau")} ({chapterCount})
                                </button>
                            </Collapsible.Trigger>
                            <Collapsible.Content>
                                <div className={styles.previewList} data-testid="save-template-preview-list">
                                    {book.chapters
                                        .slice()
                                        .sort((a, b) => a.position - b.position)
                                        .map((c) => (
                                            <div key={c.id} className={styles.previewRow}>
                                                <span className={styles.previewPos}>{c.position + 1}.</span>
                                                <span className={styles.previewTitle}>{c.title}</span>
                                                <span className={styles.previewType}>{c.chapter_type}</span>
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

