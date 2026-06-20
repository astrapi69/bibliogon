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
import {ArrowLeft, MapPin, Plus, Trash2, Users, X} from "lucide-react";
import {api, ApiError} from "../../api/client";
import {getStorage} from "../../storage";
import type {
    RelationshipType,
    StoryEntityExtraField,
    StoryEntityLinkOut,
    StoryEntityOut,
    StoryEntityRelationship,
    StoryEntityTypeDef,
} from "../../api/client";
import {useI18n} from "../../hooks/useI18n";
import {notify} from "../../utils/platform/notify";
import {useDialog} from "../shared/AppDialog";
import EditableTitle from "../shared/EditableTitle";
import RichTextEditor from "../RichTextEditor";
import {RadixSelect} from "../RadixSelect";
import {RELATIONSHIP_TYPES, relationshipColor} from "../relationshipColors";
import {entityTypeColor, entityTypeIcon} from "../storyBibleIcons";
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
            getStorage().storyBible.getEntity(entityId),
            getStorage().storyBible.listEntityTypes(),
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

    // C7: appearance tracker — the pages/chapters this entity is
    // linked to. Pages resolve to a position label; chapters to a
    // title (both fetched once the entity's book_id is known). The
    // primary create path is the C6 Storyboard drag; here authors see
    // every appearance + remove a wrong link. ``apprRefresh`` re-runs
    // the fetch after a removal.
    const [appearances, setAppearances] = useState<StoryEntityLinkOut[]>([]);
    const [pagePos, setPagePos] = useState<Record<string, number>>({});
    const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
    const [apprRefresh, setApprRefresh] = useState(0);
    // C10: other entities in this book (for the relationship target
    // picker) — excludes self.
    const [bookEntities, setBookEntities] = useState<StoryEntityOut[]>([]);
    const bookId = entity?.book_id;

    useEffect(() => {
        let cancelled = false;
        getStorage().storyBible
            .appearances(entityId)
            .then((rows) => {
                if (!cancelled) setAppearances(rows);
            })
            .catch(() => {});
        if (bookId) {
            getStorage()
                .pages.list(bookId)
                .then((rows) => {
                    if (cancelled) return;
                    setPagePos(
                        Object.fromEntries(rows.map((p) => [p.id, p.position])),
                    );
                })
                .catch(() => {});
            getStorage()
                .books.get(bookId)
                .then((book) => {
                    if (cancelled) return;
                    setChapterTitles(
                        Object.fromEntries(
                            (book.chapters ?? []).map((c) => [c.id, c.title]),
                        ),
                    );
                })
                .catch(() => {});
            getStorage().storyBible
                .listEntities(bookId)
                .then((rows) => {
                    if (cancelled) return;
                    setBookEntities(rows.filter((e) => e.id !== entityId));
                })
                .catch(() => {});
        }
        return () => {
            cancelled = true;
        };
    }, [entityId, bookId, apprRefresh]);

    const handleRemoveAppearance = useCallback(
        async (linkId: string) => {
            try {
                await getStorage().storyBible.deleteLink(linkId);
                setApprRefresh((k) => k + 1);
                onChanged();
            } catch (err) {
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t(
                              "ui.story_bible.appearance_remove_error",
                              "Auftritt konnte nicht entfernt werden.",
                          ),
                    err,
                );
            }
        },
        [onChanged, t],
    );

    const persist = useCallback(
        async (patch: Parameters<typeof api.storyBible.updateEntity>[1]) => {
            try {
                const updated = await getStorage().storyBible.updateEntity(
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

    // C10: relationships are persisted immediately (not debounced) —
    // each add/remove is a discrete user action, not a keystroke
    // stream. ``persist`` replaces local ``entity`` with the response.
    const handleSaveRelationships = useCallback(
        (next: StoryEntityRelationship[]) => {
            void persist({relationships: next});
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
            await getStorage().storyBible.deleteEntity(entity.id);
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
                    <Icon
                        size={14}
                        aria-hidden
                        style={{color: entityTypeColor(entity.entity_type)}}
                    />
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

            <section
                className={styles.section}
                data-testid="story-entity-appearances"
            >
                <h3 className={styles.sectionTitle}>
                    {t("ui.story_bible.appearances", "Auftritte")}
                </h3>
                {appearances.length === 0 ? (
                    <p
                        className={styles.appearanceEmpty}
                        data-testid="story-entity-appearances-empty"
                    >
                        {t(
                            "ui.story_bible.no_appearances",
                            "Noch keine Auftritte. Ziehe diesen Eintrag im Storyboard auf eine Seite.",
                        )}
                    </p>
                ) : (
                    <ul className={styles.appearanceList}>
                        {appearances.map((link) => {
                            const ref = link.page_id
                                ? `${t("ui.story_bible.appearance_page", "Seite")} ${
                                      pagePos[link.page_id] ?? "?"
                                  }`
                                : link.chapter_id
                                  ? (chapterTitles[link.chapter_id] ??
                                    t("ui.story_bible.appearance_chapter", "Kapitel"))
                                  : "";
                            return (
                                <li
                                    key={link.id}
                                    className={styles.appearanceItem}
                                    data-testid={`story-entity-appearance-${link.id}`}
                                >
                                    <MapPin size={13} aria-hidden />
                                    <span className={styles.appearanceRef}>{ref}</span>
                                    {link.role && (
                                        <span className={styles.appearanceRole}>
                                            {link.role}
                                        </span>
                                    )}
                                    {link.notes && (
                                        <span className={styles.appearanceNotes}>
                                            {link.notes}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className={`btn-sidebar-icon ${styles.appearanceRemove}`}
                                        onClick={() =>
                                            void handleRemoveAppearance(link.id)
                                        }
                                        data-testid={`story-entity-appearance-remove-${link.id}`}
                                        aria-label={t(
                                            "ui.story_bible.appearance_remove",
                                            "Auftritt entfernen",
                                        )}
                                        title={t(
                                            "ui.story_bible.appearance_remove",
                                            "Auftritt entfernen",
                                        )}
                                    >
                                        <X size={13} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <StoryEntityRelationships
                relationships={entity.relationships ?? []}
                bookEntities={bookEntities}
                onSave={handleSaveRelationships}
            />
        </div>
    );
}

/** C10 relationship editor. Lists the entity's relationships (target
 *  name + colored type badge + description + remove) and an add row
 *  (target picker + type select + description). Each mutation builds
 *  the full next list and hands it to ``onSave`` (a single PATCH of
 *  the relationships JSON field). */
function StoryEntityRelationships({
    relationships,
    bookEntities,
    onSave,
}: {
    relationships: StoryEntityRelationship[];
    bookEntities: StoryEntityOut[];
    onSave: (next: StoryEntityRelationship[]) => void;
}) {
    const {t} = useI18n();
    const [addTarget, setAddTarget] = useState<string>("");
    const [addType, setAddType] = useState<RelationshipType>("ally");
    const [addDesc, setAddDesc] = useState<string>("");

    const nameById = new Map(bookEntities.map((e) => [e.id, e.name]));

    const handleAdd = () => {
        if (!addTarget) return;
        const next: StoryEntityRelationship[] = [
            ...relationships,
            {
                target_entity_id: addTarget,
                relationship_type: addType,
                description: addDesc.trim() === "" ? null : addDesc.trim(),
            },
        ];
        onSave(next);
        setAddTarget("");
        setAddType("ally");
        setAddDesc("");
    };

    const handleRemove = (index: number) => {
        onSave(relationships.filter((_, i) => i !== index));
    };

    return (
        <section className={styles.section} data-testid="story-entity-relationships">
            <h3 className={styles.sectionTitle}>
                <Users size={14} aria-hidden /> {t("ui.story_bible.relationships", "Beziehungen")}
            </h3>
            {relationships.length === 0 ? (
                <p
                    className={styles.appearanceEmpty}
                    data-testid="story-entity-relationships-empty"
                >
                    {t(
                        "ui.story_bible.no_relationships",
                        "Noch keine Beziehungen.",
                    )}
                </p>
            ) : (
                <ul className={styles.appearanceList}>
                    {relationships.map((rel, index) => (
                        <li
                            key={`${rel.target_entity_id}-${index}`}
                            className={styles.appearanceItem}
                            data-testid={`story-entity-relationship-${rel.target_entity_id}`}
                        >
                            <span className={styles.appearanceRef}>
                                {nameById.get(rel.target_entity_id) ??
                                    t("ui.story_bible.relationship_unknown_target", "(unbekannt)")}
                            </span>
                            <span
                                className={styles.appearanceRole}
                                style={{color: relationshipColor(rel.relationship_type)}}
                                data-testid={`story-entity-relationship-type-${rel.target_entity_id}`}
                            >
                                {t(`ui.story_bible.relationship_type.${rel.relationship_type}`, rel.relationship_type)}
                            </span>
                            {rel.description && (
                                <span className={styles.appearanceNotes}>{rel.description}</span>
                            )}
                            <button
                                type="button"
                                className={`btn-sidebar-icon ${styles.appearanceRemove}`}
                                onClick={() => handleRemove(index)}
                                data-testid={`story-entity-relationship-remove-${rel.target_entity_id}`}
                                aria-label={t("ui.story_bible.relationship_remove", "Beziehung entfernen")}
                                title={t("ui.story_bible.relationship_remove", "Beziehung entfernen")}
                            >
                                <X size={13} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {bookEntities.length > 0 && (
                <div className={styles.relationshipAdd} data-testid="story-entity-relationship-add">
                    <RadixSelect
                        className="is-narrow"
                        value={addTarget}
                        onValueChange={setAddTarget}
                        testId="story-entity-relationship-target"
                        ariaLabel={t("ui.story_bible.relationship_target", "Eintrag")}
                        allOption={{label: t("ui.story_bible.relationship_pick_target", "— Eintrag wählen —")}}
                        options={bookEntities.map((e) => ({value: e.id, label: e.name}))}
                    />
                    <RadixSelect
                        className="is-narrow"
                        value={addType}
                        onValueChange={(v) => setAddType(v as RelationshipType)}
                        testId="story-entity-relationship-typeselect"
                        ariaLabel={t("ui.story_bible.relationship_type_label", "Beziehungstyp")}
                        options={RELATIONSHIP_TYPES.map((rt) => ({
                            value: rt,
                            label: t(`ui.story_bible.relationship_type.${rt}`, rt),
                        }))}
                    />
                    <input
                        type="text"
                        className="form-input"
                        value={addDesc}
                        placeholder={t("ui.story_bible.relationship_desc_placeholder", "Beschreibung (optional)")}
                        onChange={(e) => setAddDesc(e.target.value)}
                        data-testid="story-entity-relationship-desc"
                        aria-label={t("ui.story_bible.relationship_desc_label", "Beschreibung")}
                    />
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleAdd}
                        disabled={!addTarget}
                        data-testid="story-entity-relationship-add-btn"
                    >
                        <Plus size={14} /> {t("ui.story_bible.relationship_add", "Beziehung hinzufügen")}
                    </button>
                </div>
            )}
        </section>
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
