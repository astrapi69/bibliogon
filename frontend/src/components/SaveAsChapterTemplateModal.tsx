import {useState} from "react";
import {api, ApiError, Chapter} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import {EnhancedTextarea} from "./textarea/EnhancedTextarea";

type ContentMode = "empty" | "preserve";

interface Props {
    open: boolean;
    chapter: Chapter;
    bookId: string;
    onClose: () => void;
}

export default function SaveAsChapterTemplateModal({open, chapter, bookId, onClose}: Props) {
    const {t} = useI18n();

    const [name, setName] = useState(chapter.title);
    const [description, setDescription] = useState("");
    const [contentMode, setContentMode] = useState<ContentMode>("empty");
    const [saving, setSaving] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);

    const resetForm = () => {
        setName(chapter.title);
        setDescription("");
        setContentMode("empty");
        setNameError(null);
    };

    const handleClose = () => {
        if (saving) return;
        resetForm();
        onClose();
    };

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        const trimmedDescription = description.trim();
        if (!trimmedName) {
            setNameError(t("ui.save_chapter_template.name_required", "Name ist erforderlich"));
            return;
        }
        if (!trimmedDescription) {
            notify.error(t("ui.save_chapter_template.description_required", "Beschreibung ist erforderlich"));
            return;
        }

        setSaving(true);
        setNameError(null);
        try {
            let content: string | null = null;
            if (contentMode === "preserve") {
                // BookEditor's `book` holds chapters without content; fetch the
                // current chapter fresh so we save the actual body.
                const full = await api.chapters.get(bookId, chapter.id);
                content = full.content;
            }
            await api.chapterTemplates.create({
                name: trimmedName,
                description: trimmedDescription,
                chapter_type: chapter.chapter_type,
                content,
                language: "en",
            });
            notify.success(t("ui.save_chapter_template.saved", "Vorlage gespeichert"));
            resetForm();
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setNameError(t("ui.save_chapter_template.name_taken", "Eine Vorlage mit diesem Namen existiert bereits"));
            } else {
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t("ui.save_chapter_template.save_failed", "Speichern fehlgeschlagen"),
                );
            }
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = !!name.trim() && !!description.trim() && !saving;

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content" data-testid="save-chapter-template-modal">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {t("ui.save_chapter_template.title", "Kapitel als Vorlage speichern")}
                        </Dialog.Title>
                    </div>

                    <div style={styles.body}>
                        <div className="field">
                            <label className="label">{t("ui.save_chapter_template.name", "Name")} *</label>
                            <input
                                className="input"
                                value={name}
                                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                                placeholder={t("ui.save_chapter_template.name_placeholder", "z.B. Interview-Vorlage")}
                                data-testid="save-chapter-template-name"
                                autoFocus
                                maxLength={100}
                            />
                            {nameError && (
                                <div style={styles.errorText} data-testid="save-chapter-template-name-error">{nameError}</div>
                            )}
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_chapter_template.description", "Beschreibung")} *</label>
                            <EnhancedTextarea
                                value={description}
                                onChange={setDescription}
                                placeholder={t("ui.save_chapter_template.description_placeholder", "Wofuer ist diese Vorlage?")}
                                testid="save-chapter-template-description"
                                rows={2}
                                maxChars={500}
                                ariaLabel={t("ui.save_chapter_template.description", "Beschreibung")}
                            />
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_chapter_template.content_mode", "Kapitelinhalt")}</label>
                            <label style={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="chapter-template-content-mode"
                                    value="empty"
                                    checked={contentMode === "empty"}
                                    onChange={() => setContentMode("empty")}
                                    data-testid="save-chapter-template-content-empty"
                                    style={{accentColor: "var(--accent)"}}
                                />
                                <div>
                                    <div>{t("ui.save_chapter_template.content_empty", "Leerer Platzhalter")}</div>
                                    <div style={styles.hint}>{t("ui.save_chapter_template.content_empty_hint", "Empfohlen fuer wiederverwendbare Vorlagen")}</div>
                                </div>
                            </label>
                            <label style={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="chapter-template-content-mode"
                                    value="preserve"
                                    checked={contentMode === "preserve"}
                                    onChange={() => setContentMode("preserve")}
                                    data-testid="save-chapter-template-content-preserve"
                                    style={{accentColor: "var(--accent)"}}
                                />
                                <div>
                                    <div>{t("ui.save_chapter_template.content_preserve", "Inhalt uebernehmen")}</div>
                                    <div style={styles.hint}>{t("ui.save_chapter_template.content_preserve_hint", "Kopiert den aktuellen Kapitelinhalt in die Vorlage")}</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={handleClose} disabled={saving}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            data-testid="save-chapter-template-submit"
                        >
                            {saving
                                ? t("ui.save_chapter_template.saving", "Speichert...")
                                : t("ui.save_chapter_template.save", "Speichern")}
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
    errorText: {
        color: "var(--danger, #c43)",
        fontSize: "0.8125rem",
        marginTop: 4,
    },
};
