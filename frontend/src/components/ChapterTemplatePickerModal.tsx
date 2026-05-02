import {useEffect, useRef, useState} from "react";
import {api, ApiError, ChapterTemplate} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {useDialog} from "./AppDialog";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import {Download, Lock, Pencil, Trash2, Upload} from "lucide-react";
import styles from "./ChapterTemplatePickerModal.module.css";
import SaveAsChapterTemplateModal from "./SaveAsChapterTemplateModal";

interface Props {
    open: boolean;
    onClose: () => void;
    onInsert: (template: ChapterTemplate) => void;
}

export default function ChapterTemplatePickerModal({open, onClose, onInsert}: Props) {
    const {t} = useI18n();
    const dialog = useDialog();

    const [templates, setTemplates] = useState<ChapterTemplate[] | null>(null);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<ChapterTemplate | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);

    const refreshList = () => {
        api.chapterTemplates.list()
            .then((list) => { setTemplates(list); setTemplatesError(null); })
            .catch((err) => { setTemplates([]); setTemplatesError(String(err?.message || err)); });
    };

    const handleExport = async (tpl: ChapterTemplate) => {
        try {
            await api.chapterTemplates.exportJson(tpl.id);
            notify.success(t("ui.chapter_template_picker.exported", "Vorlage exportiert"));
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.chapter_template_picker.export_failed", "Export fehlgeschlagen"),
            );
        }
    };

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const created = await api.chapterTemplates.importJson(file);
                notify.success(t("ui.chapter_template_picker.imported", "Vorlage importiert"));
                refreshList();
                setSelectedId(created.id);
            } catch (err) {
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t("ui.chapter_template_picker.import_failed", "Import fehlgeschlagen"),
                );
            }
        }
        // Reset input so picking the same file twice still triggers onChange.
        if (importInputRef.current) importInputRef.current.value = "";
    };

    useEffect(() => {
        if (!open) return;
        // Always refetch on open so recent saves/deletes surface
        refreshList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleClose = () => {
        setSelectedId(null);
        setTemplates(null);
        onClose();
    };

    const handleInsert = () => {
        if (!templates || !selectedId) return;
        const tpl = templates.find((t) => t.id === selectedId);
        if (!tpl) return;
        onInsert(tpl);
        handleClose();
    };

    const handleDelete = async (tpl: ChapterTemplate) => {
        if (tpl.is_builtin) return;
        const ok = await dialog.confirm(
            t("ui.chapter_template_picker.delete_title", "Kapitelvorlage löschen"),
            t("ui.chapter_template_picker.delete_confirm", "Vorlage '{name}' wirklich löschen? Dies kann nicht rückgaengig gemacht werden.")
                .replace("{name}", tpl.name),
            "danger",
        );
        if (!ok) return;
        try {
            await api.chapterTemplates.delete(tpl.id);
            setTemplates((prev) => (prev ? prev.filter((t) => t.id !== tpl.id) : prev));
            if (selectedId === tpl.id) setSelectedId(null);
            notify.success(t("ui.chapter_template_picker.deleted", "Vorlage gelöscht"));
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.chapter_template_picker.delete_failed", "Löschen fehlgeschlagen"),
            );
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide" data-testid="chapter-template-picker">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {t("ui.chapter_template_picker.title", "Wähle eine Kapitelvorlage")}
                        </Dialog.Title>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleImportClick}
                            data-testid="chapter-template-import"
                            aria-label={t("ui.chapter_template_picker.import", "JSON importieren")}
                            title={t("ui.chapter_template_picker.import", "JSON importieren")}
                        >
                            <Upload size={14}/>
                            {t("ui.chapter_template_picker.import", "JSON importieren")}
                        </button>
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".json,application/json"
                            style={{display: "none"}}
                            onChange={handleImportFile}
                            data-testid="chapter-template-import-input"
                        />
                    </div>

                    <div className={styles.body}>
                        {templates === null && (
                            <div className={styles.emptyState}>
                                {t("ui.chapter_template_picker.loading", "Lade Vorlagen...")}
                            </div>
                        )}
                        {templates !== null && templates.length === 0 && (
                            <div className={styles.emptyState}>
                                {templatesError
                                    ? t("ui.chapter_template_picker.load_error", "Vorlagen konnten nicht geladen werden")
                                    : t("ui.chapter_template_picker.empty", "Keine Kapitelvorlagen verfügbar")}
                            </div>
                        )}
                        {templates !== null && templates.length > 0 && (
                            <div className={styles.list} role="radiogroup">
                                {templates.map((tpl) => {
                                    const selected = tpl.id === selectedId;
                                    const select = () => setSelectedId(tpl.id);
                                    return (
                                        <div
                                            key={tpl.id}
                                            role="radio"
                                            aria-checked={selected}
                                            tabIndex={0}
                                            data-testid={`chapter-template-card-${tpl.id}`}
                                            onClick={select}
                                            onKeyDown={(e) => {
                                                if (e.key === " " || e.key === "Enter") {
                                                    e.preventDefault();
                                                    select();
                                                }
                                            }}
                                            className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
                                        >
                                            <div className={styles.cardHeader}>
                                                <span className={styles.name}>{tpl.name}</span>
                                                <div className={styles.badges}>
                                                    {(tpl.child_template_ids?.length ?? 0) > 0 ? (
                                                        <span
                                                            className={styles.typeBadge}
                                                            data-testid={`chapter-template-group-badge-${tpl.id}`}
                                                            title={t(
                                                                "ui.chapter_template_picker.group_hint",
                                                                "Gruppe: fügt mehrere Kapitel auf einmal ein",
                                                            )}
                                                        >
                                                            {t("ui.chapter_template_picker.group_count", "{count} Kapitel")
                                                                .replace("{count}", String(tpl.child_template_ids?.length ?? 0))}
                                                        </span>
                                                    ) : (
                                                        <span className={styles.typeBadge}>{tpl.chapter_type}</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className={`btn-icon ${styles.deleteBtn}`}
                                                        aria-label={t("ui.chapter_template_picker.export", "Als JSON exportieren")}
                                                        title={t("ui.chapter_template_picker.export", "Als JSON exportieren")}
                                                        data-testid={`chapter-template-export-${tpl.id}`}
                                                        onClick={(e) => { e.stopPropagation(); void handleExport(tpl); }}
                                                    >
                                                        <Download size={14}/>
                                                    </button>
                                                    {tpl.is_builtin ? (
                                                        <span
                                                            className={styles.builtinBadge}
                                                            title={t("ui.chapter_template_picker.builtin_hint", "Mitgelieferte Vorlage")}
                                                            data-testid={`chapter-template-builtin-badge-${tpl.id}`}
                                                        >
                                                            <Lock size={10}/>
                                                            {t("ui.chapter_template_picker.builtin", "Mitgeliefert")}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className={`btn-icon ${styles.deleteBtn}`}
                                                                aria-label={t("ui.chapter_template_picker.edit", "Bearbeiten")}
                                                                data-testid={`chapter-template-edit-${tpl.id}`}
                                                                onClick={(e) => { e.stopPropagation(); setEditingTemplate(tpl); }}
                                                            >
                                                                <Pencil size={14}/>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`btn-icon ${styles.deleteBtn}`}
                                                                aria-label={t("ui.chapter_template_picker.delete", "Löschen")}
                                                                data-testid={`chapter-template-delete-${tpl.id}`}
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(tpl); }}
                                                            >
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={styles.description}>{tpl.description}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={handleClose}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleInsert}
                            disabled={!selectedId}
                            data-testid="chapter-template-insert"
                        >
                            {t("ui.chapter_template_picker.insert", "Einfügen")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
            {editingTemplate && (
                <SaveAsChapterTemplateModal
                    open={!!editingTemplate}
                    existingTemplate={editingTemplate}
                    onClose={() => {
                        setEditingTemplate(null);
                        // Refresh so the renamed template surfaces in the list.
                        refreshList();
                    }}
                />
            )}
        </Dialog.Root>
    );
}
