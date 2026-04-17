import {useEffect, useState} from "react";
import {api, ApiError, ChapterTemplate} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {useDialog} from "./AppDialog";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import {Lock, Trash2} from "lucide-react";

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

    useEffect(() => {
        if (!open) return;
        // Always refetch on open so recent saves/deletes surface
        api.chapterTemplates.list()
            .then((list) => { setTemplates(list); setTemplatesError(null); })
            .catch((err) => { setTemplates([]); setTemplatesError(String(err?.message || err)); });
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
            t("ui.chapter_template_picker.delete_title", "Kapitelvorlage loeschen"),
            t("ui.chapter_template_picker.delete_confirm", "Vorlage '{name}' wirklich loeschen? Dies kann nicht rueckgaengig gemacht werden.")
                .replace("{name}", tpl.name),
            "danger",
        );
        if (!ok) return;
        try {
            await api.chapterTemplates.delete(tpl.id);
            setTemplates((prev) => (prev ? prev.filter((t) => t.id !== tpl.id) : prev));
            if (selectedId === tpl.id) setSelectedId(null);
            notify.success(t("ui.chapter_template_picker.deleted", "Vorlage geloescht"));
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.chapter_template_picker.delete_failed", "Loeschen fehlgeschlagen"),
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
                            {t("ui.chapter_template_picker.title", "Waehle eine Kapitelvorlage")}
                        </Dialog.Title>
                    </div>

                    <div style={styles.body}>
                        {templates === null && (
                            <div style={styles.emptyState}>
                                {t("ui.chapter_template_picker.loading", "Lade Vorlagen...")}
                            </div>
                        )}
                        {templates !== null && templates.length === 0 && (
                            <div style={styles.emptyState}>
                                {templatesError
                                    ? t("ui.chapter_template_picker.load_error", "Vorlagen konnten nicht geladen werden")
                                    : t("ui.chapter_template_picker.empty", "Keine Kapitelvorlagen verfuegbar")}
                            </div>
                        )}
                        {templates !== null && templates.length > 0 && (
                            <div style={styles.list} role="radiogroup">
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
                                            style={{
                                                ...styles.card,
                                                ...(selected ? styles.cardSelected : {}),
                                            }}
                                        >
                                            <div style={styles.cardHeader}>
                                                <span style={styles.name}>{tpl.name}</span>
                                                <div style={styles.badges}>
                                                    <span style={styles.typeBadge}>{tpl.chapter_type}</span>
                                                    {tpl.is_builtin ? (
                                                        <span
                                                            style={styles.builtinBadge}
                                                            title={t("ui.chapter_template_picker.builtin_hint", "Mitgelieferte Vorlage")}
                                                            data-testid={`chapter-template-builtin-badge-${tpl.id}`}
                                                        >
                                                            <Lock size={10}/>
                                                            {t("ui.chapter_template_picker.builtin", "Mitgeliefert")}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="btn-icon"
                                                            style={styles.deleteBtn}
                                                            aria-label={t("ui.chapter_template_picker.delete", "Loeschen")}
                                                            data-testid={`chapter-template-delete-${tpl.id}`}
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(tpl); }}
                                                        >
                                                            <Trash2 size={14}/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={styles.description}>{tpl.description}</div>
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
                            {t("ui.chapter_template_picker.insert", "Einfuegen")}
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
    emptyState: {
        padding: "16px 0",
        color: "var(--text-muted)",
        fontSize: "0.875rem",
    },
    list: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 8,
    },
    card: {
        textAlign: "left",
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "var(--font-body)",
        color: "var(--text)",
    },
    cardSelected: {
        borderColor: "var(--accent)",
        outline: "2px solid var(--accent)",
        outlineOffset: -1,
    },
    cardHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
    },
    name: {
        fontWeight: 600,
        fontSize: "0.9375rem",
    },
    badges: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    typeBadge: {
        fontSize: "0.75rem",
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--accent-muted, var(--bg-subtle))",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
    },
    builtinBadge: {
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "0.6875rem",
        padding: "1px 6px",
        borderRadius: 4,
        background: "var(--bg-subtle, var(--bg-surface))",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
    },
    deleteBtn: {
        padding: 4,
        background: "none",
        border: "none",
        borderRadius: 4,
        color: "var(--text-muted)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
    description: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
        lineHeight: 1.4,
    },
};
