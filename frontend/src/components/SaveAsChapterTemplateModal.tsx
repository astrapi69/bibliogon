import {useEffect, useState} from "react";
import {api, ApiError, Chapter, ChapterTemplate} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import {EnhancedTextarea} from "./textarea/EnhancedTextarea";
import styles from "./SaveAsChapterTemplateModal.module.css";

type ContentMode = "empty" | "preserve";

interface Props {
    open: boolean;
    /** Source chapter for create mode. Required unless ``existingTemplate``
     *  is set (in which case the modal edits an existing user template). */
    chapter?: Chapter;
    bookId?: string;
    /** When set, modal switches into edit mode: pre-fills name +
     *  description from the template, hides the contentMode toggle, and
     *  calls ``api.chapterTemplates.update`` on save. TM-04b sub-item:
     *  surface the existing PUT endpoint in the UI. */
    existingTemplate?: ChapterTemplate;
    onClose: () => void;
}

export default function SaveAsChapterTemplateModal({open, chapter, bookId, existingTemplate, onClose}: Props) {
    const {t} = useI18n();

    const isEdit = !!existingTemplate;

    const [name, setName] = useState(existingTemplate?.name ?? chapter?.title ?? "");
    const [description, setDescription] = useState(existingTemplate?.description ?? "");
    const [contentMode, setContentMode] = useState<ContentMode>("empty");
    const [saving, setSaving] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);

    // Re-seed when the modal opens or the target template / chapter changes.
    useEffect(() => {
        if (!open) return;
        setName(existingTemplate?.name ?? chapter?.title ?? "");
        setDescription(existingTemplate?.description ?? "");
        setContentMode("empty");
        setNameError(null);
    }, [open, existingTemplate, chapter]);

    const resetForm = () => {
        setName(existingTemplate?.name ?? chapter?.title ?? "");
        setDescription(existingTemplate?.description ?? "");
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
            if (isEdit && existingTemplate) {
                await api.chapterTemplates.update(existingTemplate.id, {
                    name: trimmedName,
                    description: trimmedDescription,
                });
                notify.success(t("ui.save_chapter_template.saved_edit", "Vorlage aktualisiert"));
            } else {
                if (!chapter || !bookId) {
                    throw new Error("Create mode requires chapter + bookId");
                }
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
            }
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
                <Dialog.Content className="dialog-content dialog-content-wide" data-testid="save-chapter-template-modal">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {isEdit
                                ? t("ui.save_chapter_template.title_edit", "Kapitelvorlage bearbeiten")
                                : t("ui.save_chapter_template.title", "Kapitel als Vorlage speichern")}
                        </Dialog.Title>
                    </div>

                    <div className={styles.body}>
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
                                <div className={styles.errorText} data-testid="save-chapter-template-name-error">{nameError}</div>
                            )}
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.save_chapter_template.description", "Beschreibung")} *</label>
                            <EnhancedTextarea
                                value={description}
                                onChange={setDescription}
                                placeholder={t("ui.save_chapter_template.description_placeholder", "Wofür ist diese Vorlage?")}
                                testid="save-chapter-template-description"
                                rows={2}
                                maxChars={500}
                                ariaLabel={t("ui.save_chapter_template.description", "Beschreibung")}
                            />
                        </div>

                        {!isEdit && (
                        <div className="field">
                            <label className="label">{t("ui.save_chapter_template.content_mode", "Kapitelinhalt")}</label>
                            <label className={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="chapter-template-content-mode"
                                    value="empty"
                                    checked={contentMode === "empty"}
                                    onChange={() => setContentMode("empty")}
                                    data-testid="save-chapter-template-content-empty"
                                    className={styles.radioInput}
                                />
                                <div>
                                    <div>{t("ui.save_chapter_template.content_empty", "Leerer Platzhalter")}</div>
                                    <div className={styles.hint}>{t("ui.save_chapter_template.content_empty_hint", "Empfohlen für wiederverwendbare Vorlagen")}</div>
                                </div>
                            </label>
                            <label className={styles.radioRow}>
                                <input
                                    type="radio"
                                    name="chapter-template-content-mode"
                                    value="preserve"
                                    checked={contentMode === "preserve"}
                                    onChange={() => setContentMode("preserve")}
                                    data-testid="save-chapter-template-content-preserve"
                                    className={styles.radioInput}
                                />
                                <div>
                                    <div>{t("ui.save_chapter_template.content_preserve", "Inhalt übernehmen")}</div>
                                    <div className={styles.hint}>{t("ui.save_chapter_template.content_preserve_hint", "Kopiert den aktuellen Kapitelinhalt in die Vorlage")}</div>
                                </div>
                            </label>
                        </div>
                        )}
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
