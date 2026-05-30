/**
 * StoryBibleSidebar — a per-book Story Bible panel that mounts
 * alongside the ChapterSidebar in BookEditor (STORY-BIBLE-PLUGIN-01
 * Session 2 C4). Gated on plugin-story-bible being active (the
 * parent only mounts this when ``api.storyBible.getInfo()``
 * resolved).
 *
 * Shows the book's entities grouped by entity type (Characters,
 * Settings, Plot Points, Items, Lore), each group collapsible with
 * a count + an "add" affordance. Creating + deleting entities is
 * handled inline here (so the add/delete buttons are never
 * half-wired); clicking an entry expands an inline read preview
 * (C5 upgrades this to a full StoryEntityEditor).
 *
 * Entity-type icons + labels come from the SSoT registry
 * (GET /api/story-bible/entity-types); nothing is hardcoded.
 */

import {useCallback, useEffect, useMemo, useState} from "react";
import {ChevronDown, ChevronRight, Plus, Trash2, X} from "lucide-react";
import {api, ApiError} from "../api/client";
import type {StoryEntityOut, StoryEntityTypeDef} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {useDialog} from "./AppDialog";
import {entityTypeColor, entityTypeIcon} from "./storyBibleIcons";
import styles from "./StoryBibleSidebar.module.css";

interface StoryBibleSidebarProps {
    bookId: string;
    onClose: () => void;
    /** Open an entry's full detail/edit view (C5, rendered in the
     *  BookEditor main content area). */
    onSelectEntity: (entity: StoryEntityOut) => void;
    /** The currently-open entity (highlighted in the list). */
    selectedEntityId?: string | null;
    /** Bumped by the parent after an editor-driven change so the
     *  list refetches (the sidebar's own create/delete refetch
     *  internally). */
    refreshKey?: number;
}

export default function StoryBibleSidebar({
    bookId,
    onClose,
    onSelectEntity,
    selectedEntityId,
    refreshKey = 0,
}: StoryBibleSidebarProps) {
    const {t} = useI18n();
    const {confirm} = useDialog();
    const [types, setTypes] = useState<StoryEntityTypeDef[]>([]);
    const [entities, setEntities] = useState<StoryEntityOut[]>([]);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [addingType, setAddingType] = useState<string | null>(null);
    const [newName, setNewName] = useState("");

    const refreshEntities = useCallback(async () => {
        const rows = await api.storyBible.listEntities(bookId);
        setEntities(rows);
    }, [bookId]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            api.storyBible.listEntityTypes(),
            api.storyBible.listEntities(bookId),
        ])
            .then(([typeMap, rows]) => {
                if (cancelled) return;
                setTypes(Object.values(typeMap));
                setEntities(rows);
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
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId, refreshKey]);

    const byType = useMemo(() => {
        const map = new Map<string, StoryEntityOut[]>();
        for (const e of entities) {
            const list = map.get(e.entity_type) ?? [];
            list.push(e);
            map.set(e.entity_type, list);
        }
        return map;
    }, [entities]);

    const toggleGroup = (typeId: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(typeId)) next.delete(typeId);
            else next.add(typeId);
            return next;
        });
    };

    const handleCreate = async (typeId: string) => {
        const name = newName.trim();
        if (!name) return;
        try {
            await api.storyBible.createEntity(bookId, {
                entity_type: typeId,
                name,
            });
            setNewName("");
            setAddingType(null);
            await refreshEntities();
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.story_bible.create_error", "Anlegen fehlgeschlagen."),
                err,
            );
        }
    };

    const handleDelete = async (entity: StoryEntityOut) => {
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
            await refreshEntities();
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.story_bible.delete_error", "Löschen fehlgeschlagen."),
                err,
            );
        }
    };

    const totalEntities = entities.length;

    return (
        <aside
            className={styles.sidebar}
            data-testid="story-bible-sidebar"
            aria-label={t("ui.story_bible.title", "Story-Bibel")}
        >
            <header className={styles.header}>
                <h2 className={styles.title}>
                    {t("ui.story_bible.title", "Story-Bibel")}
                </h2>
                <button
                    type="button"
                    className="btn-sidebar-icon"
                    onClick={onClose}
                    data-testid="story-bible-close"
                    aria-label={t("ui.story_bible.close", "Story-Bibel schließen")}
                    title={t("ui.story_bible.close", "Story-Bibel schließen")}
                >
                    <X size={16} />
                </button>
            </header>

            {loading ? (
                <p className={styles.empty} data-testid="story-bible-loading">
                    {t("ui.story_bible.loading", "Lädt…")}
                </p>
            ) : totalEntities === 0 && types.length > 0 ? (
                <p className={styles.empty} data-testid="story-bible-empty">
                    {t(
                        "ui.story_bible.empty_all",
                        "Noch keine Einträge. Lege oben in einer Gruppe einen an.",
                    )}
                </p>
            ) : null}

            <div className={styles.groups} data-testid="story-bible-groups">
                {types.map((type) => {
                    const rows = byType.get(type.id) ?? [];
                    const isCollapsed = collapsed.has(type.id);
                    const Icon = entityTypeIcon(type.id, type.icon);
                    return (
                        <section
                            key={type.id}
                            className={styles.group}
                            data-testid={`story-bible-group-${type.id}`}
                        >
                            <div className={styles.groupHeader}>
                                <button
                                    type="button"
                                    className="btn-sidebar-icon"
                                    onClick={() => toggleGroup(type.id)}
                                    aria-expanded={!isCollapsed}
                                    data-testid={`story-bible-group-toggle-${type.id}`}
                                >
                                    {isCollapsed ? (
                                        <ChevronRight size={14} />
                                    ) : (
                                        <ChevronDown size={14} />
                                    )}
                                </button>
                                <Icon
                                    size={14}
                                    className={styles.groupIcon}
                                    style={{color: entityTypeColor(type.id)}}
                                    aria-hidden
                                />
                                <span className={styles.groupLabel}>
                                    {t(type.label_key, type.id)}
                                </span>
                                <span className={styles.groupCount}>
                                    {rows.length}
                                </span>
                                <button
                                    type="button"
                                    className="btn-sidebar-icon"
                                    onClick={() => {
                                        setAddingType(type.id);
                                        setNewName("");
                                    }}
                                    data-testid={`story-bible-add-${type.id}`}
                                    aria-label={t(
                                        "ui.story_bible.add_entry",
                                        "Eintrag hinzufügen",
                                    )}
                                    title={t(
                                        "ui.story_bible.add_entry",
                                        "Eintrag hinzufügen",
                                    )}
                                >
                                    <Plus size={14} />
                                </button>
                            </div>

                            {!isCollapsed && (
                                <div className={styles.groupBody}>
                                    {addingType === type.id && (
                                        <form
                                            className={styles.addForm}
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                void handleCreate(type.id);
                                            }}
                                        >
                                            <input
                                                autoFocus
                                                className={styles.addInput}
                                                value={newName}
                                                onChange={(e) =>
                                                    setNewName(e.target.value)
                                                }
                                                placeholder={t(
                                                    "ui.story_bible.name_placeholder",
                                                    "Name",
                                                )}
                                                data-testid={`story-bible-add-input-${type.id}`}
                                                aria-label={t(
                                                    "ui.story_bible.name",
                                                    "Name",
                                                )}
                                            />
                                            <button
                                                type="submit"
                                                className="btn btn-primary btn-sm"
                                                data-testid={`story-bible-add-save-${type.id}`}
                                            >
                                                {t("ui.story_bible.save", "Speichern")}
                                            </button>
                                        </form>
                                    )}

                                    {rows.length === 0 &&
                                    addingType !== type.id ? (
                                        <p
                                            className={styles.groupEmpty}
                                            data-testid={`story-bible-group-empty-${type.id}`}
                                        >
                                            {t(
                                                "ui.story_bible.empty_group",
                                                "Keine Einträge",
                                            )}
                                        </p>
                                    ) : null}

                                    {rows.map((entity) => (
                                        <div
                                            key={entity.id}
                                            className={`${styles.entry} ${
                                                selectedEntityId === entity.id
                                                    ? styles.entrySelected
                                                    : ""
                                            }`}
                                            data-testid={`story-bible-entry-${entity.id}`}
                                        >
                                            <div className={styles.entryRow}>
                                                <button
                                                    type="button"
                                                    className={styles.entryName}
                                                    onClick={() =>
                                                        onSelectEntity(entity)
                                                    }
                                                    data-testid={`story-bible-entry-name-${entity.id}`}
                                                >
                                                    {entity.name}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`btn-sidebar-icon ${styles.entryDelete}`}
                                                    onClick={() =>
                                                        void handleDelete(entity)
                                                    }
                                                    data-testid={`story-bible-delete-${entity.id}`}
                                                    aria-label={t(
                                                        "ui.story_bible.delete_entry",
                                                        "Eintrag löschen",
                                                    )}
                                                    title={t(
                                                        "ui.story_bible.delete_entry",
                                                        "Eintrag löschen",
                                                    )}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </aside>
    );
}
