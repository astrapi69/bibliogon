import {type ChangeEvent, useEffect, useRef, useState} from "react";
import {Plus, Edit2, Trash2, Save, X, Search, Download, Upload} from "lucide-react";
import {type Author} from "../../api/client";
import {getStorage} from "../../storage";
import {useI18n} from "../../hooks/useI18n";
import {useDialog} from "../AppDialog";
import {notify} from "../../utils/notify";
import {downloadText} from "../../export/download";
import styles from "../../pages/Settings.module.css";
import SearchClearButton from "../SearchClearButton";
import {SectionHeader} from "./SectionHeader";
import {
    AuthorsImportError,
    authorsExportFilename,
    buildAuthorsExport,
    parseAuthorsImport,
    planAuthorsImport,
} from "./authorsImportExport";

/** Authors-Database tab (Bug 8 Phase 1, Commit 5).
 *
 *  Sister to the existing personal-identity "Author" tab
 *  (``AuthorSettings.tsx``) per Finding 1. This component manages
 *  the global Authors-Database that the Wizard's author-dropdown
 *  (Phase 2) will pull suggestions from.
 *
 *  No FK relationship to Book / Article / ArticleComment per D5 —
 *  removing an entry here never breaks an existing book whose
 *  ``author`` column carried the name as free text.
 *
 *  Testid namespace ``authors-database-*`` per the
 *  testid-discipline lessons-learned rule.
 */
export function AuthorsDatabase() {
    const {t} = useI18n();
    const dialog = useDialog();
    const [authors, setAuthors] = useState<Author[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState("");
    const [newBio, setNewBio] = useState("");
    const [creating, setCreating] = useState(false);
    // Inline edit state. ``editingId`` is the row currently in edit
    // mode (null = none). Two siblings hold the staged values so
    // Cancel cleanly reverts without a refetch round-trip.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editBio, setEditBio] = useState("");
    const [savingId, setSavingId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const loadAuthors = async (searchTerm?: string) => {
        try {
            const rows = await getStorage().authors.list(
                searchTerm ? {search: searchTerm} : {}
            );
            setAuthors(rows);
        } catch (err) {
            notify.error(
                t("ui.authors_database.load_error", "Konnte Autoren nicht laden"),
                err,
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAuthors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced search. Skip the first render (already covered by
    // the initial loadAuthors call above) by gating on a non-default
    // ``search`` value OR an explicit clear after a non-empty term.
    const [searchInitialized, setSearchInitialized] = useState(false);
    useEffect(() => {
        if (!searchInitialized) {
            setSearchInitialized(true);
            return;
        }
        const handle = setTimeout(() => {
            loadAuthors(search.trim() || undefined);
        }, 250);
        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setCreating(true);
        try {
            await getStorage().authors.create({
                name: trimmed,
                bio: newBio.trim() || null,
            });
            setNewName("");
            setNewBio("");
            setShowAddForm(false);
            notify.success(
                t("ui.authors_database.created", "Autor angelegt"),
            );
            await loadAuthors(search.trim() || undefined);
        } catch (err) {
            notify.error(
                t("ui.authors_database.create_error", "Anlegen fehlgeschlagen"),
                err,
            );
        } finally {
            setCreating(false);
        }
    };

    const startEdit = (author: Author) => {
        setEditingId(author.id);
        setEditName(author.name);
        setEditBio(author.bio ?? "");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName("");
        setEditBio("");
    };

    const handleSaveEdit = async (id: string) => {
        const trimmed = editName.trim();
        if (!trimmed) return;
        setSavingId(id);
        try {
            const updated = await getStorage().authors.update(id, {
                name: trimmed,
                bio: editBio.trim() || null,
            });
            setAuthors((prev) => prev.map((a) => (a.id === id ? updated : a)));
            cancelEdit();
            notify.success(
                t("ui.authors_database.updated", "Autor aktualisiert"),
            );
        } catch (err) {
            notify.error(
                t("ui.authors_database.update_error", "Aktualisieren fehlgeschlagen"),
                err,
            );
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (author: Author) => {
        const ok = await dialog.confirm(
            t("ui.authors_database.delete_title", "Autor löschen?"),
            t(
                "ui.authors_database.delete_message",
                "Möchtest du \"{name}\" wirklich aus der Datenbank entfernen? Bestehende Bücher und Artikel bleiben unverändert.",
            ).replace("{name}", author.name),
            "danger",
        );
        if (!ok) return;
        try {
            await getStorage().authors.delete(author.id);
            // Optimistic local removal so the row vanishes immediately;
            // the next list refresh re-syncs in the background.
            setAuthors((prev) => prev.filter((a) => a.id !== author.id));
            notify.success(
                t("ui.authors_database.deleted", "Autor gelöscht"),
            );
        } catch (err) {
            notify.error(
                t("ui.authors_database.delete_error", "Löschen fehlgeschlagen"),
                err,
            );
        }
    };

    /** Export the whole authors DB as a downloaded JSON file. Works
     *  through the storage seam, so it is identical online and offline. */
    const handleExport = async () => {
        setBusy(true);
        try {
            const rows = await getStorage().authors.list({limit: 1000});
            const envelope = buildAuthorsExport(rows, new Date().toISOString());
            downloadText(
                JSON.stringify(envelope, null, 2),
                authorsExportFilename(envelope.exported_at),
                "application/json",
            );
        } catch (err) {
            notify.error(
                t("ui.authors_database.export_error", "Export fehlgeschlagen"),
                err,
            );
        } finally {
            setBusy(false);
        }
    };

    /** Read a selected JSON file, skip duplicates (by name or slug), and
     *  create the new authors. Profile authors land in the DB as normal
     *  rows; the ``is_profile_author`` flag is never honoured on import. */
    const handleImportFile = async (file: File) => {
        setBusy(true);
        try {
            const envelope = parseAuthorsImport(await file.text());
            const existing = await getStorage().authors.list({limit: 1000});
            const plan = planAuthorsImport(envelope.authors, existing);
            let imported = 0;
            let skipped = plan.skipped;
            for (const name of plan.toCreate) {
                try {
                    await getStorage().authors.create({name});
                    imported++;
                } catch {
                    skipped++;
                }
            }
            notify.success(
                t(
                    "ui.authors_database.import_result",
                    "{imported} Autoren importiert, {skipped} übersprungen",
                )
                    .replace("{imported}", String(imported))
                    .replace("{skipped}", String(skipped)),
            );
            await loadAuthors(search.trim() || undefined);
        } catch (err) {
            if (err instanceof AuthorsImportError) {
                notify.error(
                    t("ui.authors_database.invalid_file", "Ungültiges Dateiformat"),
                );
            } else {
                notify.error(
                    t("ui.authors_database.import_error", "Import fehlgeschlagen"),
                    err,
                );
            }
        } finally {
            setBusy(false);
        }
    };

    /** File-input change handler. Resets the input value afterwards so the
     *  same file can be re-selected to trigger a second import. */
    const handleImportInputChange = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) await handleImportFile(file);
    };

    return (
        <div className={styles.section} data-testid="authors-database-section">
            <SectionHeader
                title={t("ui.authors_database.title", "Autoren-Datenbank")}
                description={t("ui.authors_database.description", "Zentrale Sammlung bekannter Autoren für den Buch-Wizard.")}
            />
            <p style={{fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: 16}}>
                {t(
                    "ui.authors_database.hint",
                    "Sammlung bekannter Autoren für den Buch-Wizard. Bestehende Bücher und Artikel sind unabhängig — Änderungen hier wirken sich nur auf neue Vorschläge aus.",
                )}
            </p>

            <div className={styles.card}>
                {/* Top bar: search + add toggle */}
                <div style={{display: "flex", gap: 8, marginBottom: 16}}>
                    <div style={{flex: 1, position: "relative"}}>
                        <Search
                            size={14}
                            style={{
                                position: "absolute",
                                left: 10,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "var(--text-muted)",
                                pointerEvents: "none",
                            }}
                        />
                        <input
                            className="input"
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t(
                                "ui.authors_database.search_placeholder",
                                "Nach Name suchen…",
                            )}
                            style={{paddingLeft: 32, paddingRight: 32}}
                            data-testid="authors-database-search"
                        />
                        <div
                            style={{
                                position: "absolute",
                                right: 4,
                                top: "50%",
                                transform: "translateY(-50%)",
                            }}
                        >
                            <SearchClearButton
                                value={search}
                                onClear={() => setSearch("")}
                                data-testid="authors-database-search-clear"
                            />
                        </div>
                    </div>
                    {!showAddForm && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => setShowAddForm(true)}
                            data-testid="authors-database-add-toggle"
                        >
                            <Plus size={14}/> {t("ui.authors_database.add", "Hinzufügen")}
                        </button>
                    )}
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleExport}
                        disabled={busy}
                        data-testid="authors-database-export"
                    >
                        <Download size={14}/> {t("ui.authors_database.export", "Autoren exportieren")}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                        data-testid="authors-database-import"
                    >
                        <Upload size={14}/> {t("ui.authors_database.import", "Autoren importieren")}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleImportInputChange}
                        data-testid="authors-database-import-input"
                    />
                </div>

                {/* Add form */}
                {showAddForm && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            padding: 12,
                            marginBottom: 16,
                            background: "var(--bg-secondary)",
                            borderRadius: "var(--radius-sm)",
                        }}
                        data-testid="authors-database-add-form"
                    >
                        <input
                            className="input"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder={t(
                                "ui.authors_database.name_placeholder",
                                "Voller Name",
                            )}
                            autoFocus
                            data-testid="authors-database-add-name"
                        />
                        <textarea
                            className="input"
                            value={newBio}
                            onChange={(e) => setNewBio(e.target.value)}
                            placeholder={t(
                                "ui.authors_database.bio_placeholder",
                                "Kurzbiografie (optional)",
                            )}
                            rows={3}
                            data-testid="authors-database-add-bio"
                        />
                        <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewName("");
                                    setNewBio("");
                                }}
                                data-testid="authors-database-add-cancel"
                            >
                                {t("ui.common.cancel", "Abbrechen")}
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleCreate}
                                disabled={!newName.trim() || creating}
                                data-testid="authors-database-add-save"
                            >
                                <Save size={14}/> {t("ui.common.save", "Speichern")}
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                {loading ? (
                    <div
                        style={{color: "var(--text-muted)", padding: 12}}
                        data-testid="authors-database-loading"
                    >
                        {t("ui.common.loading", "Lädt…")}
                    </div>
                ) : authors.length === 0 ? (
                    <div
                        style={{color: "var(--text-muted)", padding: 12, textAlign: "center"}}
                        data-testid="authors-database-empty"
                    >
                        {search.trim()
                            ? t(
                                "ui.authors_database.empty_search",
                                "Keine Autoren passen zur Suche.",
                            )
                            : t(
                                "ui.authors_database.empty",
                                "Noch keine Autoren angelegt.",
                            )}
                    </div>
                ) : (
                    <div
                        style={{display: "flex", flexDirection: "column", gap: 8}}
                        data-testid="authors-database-list"
                    >
                        {authors.map((author) => (
                            <div
                                key={author.id}
                                data-testid={`authors-database-row-${author.id}`}
                                style={{
                                    padding: "10px 12px",
                                    background: "var(--bg-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                }}
                            >
                                {editingId === author.id ? (
                                    <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                                        <input
                                            className="input"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            data-testid={`authors-database-row-name-${author.id}`}
                                        />
                                        <textarea
                                            className="input"
                                            value={editBio}
                                            onChange={(e) => setEditBio(e.target.value)}
                                            rows={2}
                                            data-testid={`authors-database-row-bio-${author.id}`}
                                        />
                                        <div style={{display: "flex", gap: 8, justifyContent: "flex-end"}}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={cancelEdit}
                                                data-testid={`authors-database-row-cancel-${author.id}`}
                                            >
                                                {t("ui.common.cancel", "Abbrechen")}
                                            </button>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleSaveEdit(author.id)}
                                                disabled={
                                                    !editName.trim() || savingId === author.id
                                                }
                                                data-testid={`authors-database-row-save-${author.id}`}
                                            >
                                                <Save size={14}/>{" "}
                                                {t("ui.common.save", "Speichern")}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{display: "flex", alignItems: "flex-start", gap: 8}}>
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <div className="flex items-center gap-2">
                                                <span style={{fontWeight: 500}}>{author.name}</span>
                                                {author.is_profile_author && (
                                                    <span
                                                        className="inline-flex items-center rounded-[var(--radius-sm)] bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                                                        data-testid={`authors-database-profile-badge-${author.id}`}
                                                    >
                                                        {t("ui.authors_database.profile_badge", "Profil")}
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--text-muted)",
                                                    fontFamily: "monospace",
                                                }}
                                            >
                                                {author.slug}
                                            </div>
                                            {author.bio && (
                                                <div
                                                    style={{
                                                        fontSize: "0.875rem",
                                                        color: "var(--text-secondary)",
                                                        marginTop: 4,
                                                        whiteSpace: "pre-wrap",
                                                    }}
                                                >
                                                    {author.bio}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => startEdit(author)}
                                            aria-label={t("ui.common.edit", "Bearbeiten")}
                                            data-testid={`authors-database-row-edit-${author.id}`}
                                        >
                                            <Edit2 size={14}/>
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleDelete(author)}
                                            style={{color: "var(--danger)"}}
                                            aria-label={t("ui.common.delete", "Löschen")}
                                            data-testid={`authors-database-row-delete-${author.id}`}
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
