/**
 * StoryEntityEditor — full detail / edit view for one Story Bible
 * entity (STORY-BIBLE-PLUGIN-01 Session 2 C5). Mounts in the
 * BookEditor main content area (replacing the chapter editor) when
 * an entry is clicked in the StoryBibleSidebar, so only one TipTap
 * instance is ever mounted at a time (no conflict with the chapter
 * editor's instance).
 *
 * Shows: an editable name (EditableTitle), a read-only entity-type
 * badge (icon + label from the SSoT), a TipTap rich-text
 * description (reuses the shared RichTextEditor), and the per-type
 * metadata fields (text / number / enum) declared in
 * story-bible-entities.yaml. All edits auto-save (debounced)
 * through PATCH /api/story-bible/entities/{id}.
 */

import {useCallback, useEffect, useRef, useState} from "react";
import type {JSONContent} from "@tiptap/react";
import {ArrowLeft, Trash2} from "lucide-react";
import {api, ApiError} from "../api/client";
import type {
    StoryEntityExtraField,
    StoryEntityOut,
    StoryEntityTypeDef,
} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {useDialog} from "./AppDialog";
import EditableTitle from "./EditableTitle";
import RichTextEditor from "./RichTextEditor";
import {entityTypeIcon} from "./storyBibleIcons";
import styles from "./StoryEntityEditor.module.css";

interface StoryEntityEditorProps {
    entityId: string;
    onBack: () => void;
    /** Fired after any persisted change so the sidebar can refetch. */
    onChanged: () => void;
    /** Fired after the entity is deleted (parent clears selection). */
    onDeleted: () => void;
}

function parseDescription(value: string | null | undefined): JSONContent | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") return parsed as JSONContent;
    } catch {
        // Legacy / plain-text description: wrap as a single paragraph.
        return {
            type: "doc",
            content: [
                {type: "paragraph", content: [{type: "text", text: value}]},
            ],
        };
    }
    return null;
}

export default function StoryEntityEditor({
    entityId,
    onBack,
    onChanged,
    onDeleted,
}: StoryEntityEditorProps) {
    const {t} = useI18n();
    const {confirm} = useDialog();
    const [entity, setEntity] = useState<StoryEntityOut | null>(null);
    const [typeDef, setTypeDef] = useState<StoryEntityTypeDef | null>(null);
    const [metadata, setMetadata] = useState<Record<string, unknown>>({});
    const [loading, setLoading] = useState(true);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            api.storyBible.getEntity(entityId),
            api.storyBible.listEntityTypes(),
        ])
            .then(([row, typeMap]) => {
                if (cancelled) return;
                setEntity(row);
                setMetadata(row.entity_metadata ?? {});
                setTypeDef(typeMap[row.entity_type] ?? null);
            })
            .catch((err) => {
                if (cancelled) return;
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t(
                              "ui.story_bible.load_error",
                              "Story-Bibel konnte nicht geladen werden.",
                          ),
                    err,
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityId]);

    const persist = useCallback(
        async (patch: Parameters<typeof api.storyBible.updateEntity>[1]) => {
            try {
                const updated = await api.storyBible.updateEntity(
                    entityId,
                    patch,
                );
                setEntity(updated);
                onChanged();
            } catch (err) {
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t(
                              "ui.story_bible.save_error",
                              "Speichern fehlgeschlagen.",
                          ),
                    err,
                );
            }
        },
        [entityId, onChanged, t],
    );

    const debouncedPersist = useCallback(
        (patch: Parameters<typeof api.storyBible.updateEntity>[1]) => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => void persist(patch), 700);
        },
        [persist],
    );

    const handleNameSave = (name: string) => {
        void persist({name});
    };

    const handleDescriptionChange = (json: JSONContent) => {
        debouncedPersist({description: JSON.stringify(json)});
    };

    const handleMetaChange = (key: string, value: unknown) => {
        const next = {...metadata};
        if (value === null || value === "") delete next[key];
        else next[key] = value;
        setMetadata(next);
        debouncedPersist({entity_metadata: next});
    };

    const handleDelete = async () => {
        if (!entity) return;
        const ok = await confirm(
            t("ui.story_bible.delete_title", "Eintrag löschen?"),
            t(
                "ui.story_bible.delete_confirm",
                "Diesen Eintrag dauerhaft löschen?",
            ) + ` "${entity.name}"`,
            "danger",
            {
                confirmLabel: t("ui.story_bible.delete", "Löschen"),
                cancelLabel: t("ui.story_bible.cancel", "Abbrechen"),
            },
        );
        if (!ok) return;
        try {
            await api.storyBible.deleteEntity(entity.id);
            onDeleted();
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.story_bible.delete_error", "Löschen fehlgeschlagen."),
                err,
            );
        }
    };

    if (loading || !entity) {
        return (
            <div className={styles.editor} data-testid="story-entity-editor">
                <p className={styles.loading} data-testid="story-entity-loading">
                    {t("ui.story_bible.loading", "Lädt…")}
                </p>
            </div>
        );
    }

    const Icon = entityTypeIcon(entity.entity_type, typeDef?.icon);
    const fields: StoryEntityExtraField[] = typeDef?.extra_fields ?? [];

    return (
        <div className={styles.editor} data-testid="story-entity-editor">
            <header className={styles.header}>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onBack}
                    data-testid="story-entity-back"
                >
                    <ArrowLeft size={14} />
                    <span>{t("ui.story_bible.back_to_list", "Zurück")}</span>
                </button>
                <span className={styles.typeBadge} data-testid="story-entity-type">
                    <Icon size={14} aria-hidden />
                    {t(
                        typeDef?.label_key ?? entity.entity_type,
                        entity.entity_type,
                    )}
                </span>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleDelete()}
                    data-testid="story-entity-delete"
                >
                    <Trash2 size={14} />
                    <span>{t("ui.story_bible.delete", "Löschen")}</span>
                </button>
            </header>

            <EditableTitle
                value={entity.name}
                onSave={handleNameSave}
                testIdPrefix="story-entity-name"
            />

            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                    {t("ui.story_bible.description", "Beschreibung")}
                </h3>
                <RichTextEditor
                    content={parseDescription(entity.description)}
                    onChange={handleDescriptionChange}
                    testidNamespace="story-entity-description"
                />
            </section>

            {fields.length > 0 && (
                <section
                    className={styles.section}
                    data-testid="story-entity-fields"
                >
                    <h3 className={styles.sectionTitle}>
                        {t("ui.story_bible.details", "Details")}
                    </h3>
                    {fields.map((field) => (
                        <StoryEntityField
                            key={field.name}
                            field={field}
                            value={metadata[field.name]}
                            onChange={(v) => handleMetaChange(field.name, v)}
                        />
                    ))}
                </section>
            )}
        </div>
    );
}

function StoryEntityField({
    field,
    value,
    onChange,
}: {
    field: StoryEntityExtraField;
    value: unknown;
    onChange: (next: unknown) => void;
}) {
    const {t} = useI18n();
    const id = `story-entity-field-${field.name}`;
    const label = t(field.label_key, field.name);
    return (
        <div className={styles.field}>
            <label htmlFor={id} className={styles.fieldLabel}>
                {label}
            </label>
            {field.type === "enum" ? (
                <select
                    id={id}
                    className="form-input"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value || null)}
                    data-testid={id}
                >
                    <option value="">—</option>
                    {(field.values ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                            {t(`ui.story_bible.value_${opt}`, opt)}
                        </option>
                    ))}
                </select>
            ) : field.type === "number" ? (
                <input
                    id={id}
                    type="number"
                    className="form-input"
                    value={
                        typeof value === "number"
                            ? String(value)
                            : typeof value === "string"
                              ? value
                              : ""
                    }
                    onChange={(e) =>
                        onChange(
                            e.target.value === ""
                                ? null
                                : Number(e.target.value),
                        )
                    }
                    data-testid={id}
                />
            ) : (
                <input
                    id={id}
                    type="text"
                    className="form-input"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value || null)}
                    data-testid={id}
                />
            )}
        </div>
    );
}
