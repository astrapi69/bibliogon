import {useEffect, useRef, useState} from "react";
import {Plus, X, Database} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import {getStorage} from "../../storage";
import {notify} from "../../utils/platform/notify";
import styles from "../../pages/Settings.module.css";
import {SectionHeader} from "./SectionHeader";

export function AuthorSettings({config, onSave, saving}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const author = (config.author || {}) as Record<string, unknown>;
    const [name, setName] = useState((author.name as string) || "");
    const [penNames, setPenNames] = useState<string[]>(
        Array.isArray(author.pen_names) ? (author.pen_names as string[]) : []
    );
    const [newPenName, setNewPenName] = useState("");
    const [syncing, setSyncing] = useState(false);
    const initialized = useRef(false);

    useEffect(() => {
        // Seed the editable state from the persisted profile ONCE, when
        // settings first load. Re-syncing on every `config` change would
        // clobber in-flight local edits: the parent replaces `config` after
        // each save, and a pen name added right after a real-name blur-save
        // can be reset to [] when the slower name-save's reload lands last
        // (the #103 / flaky author-pen-names regression). A reload remounts
        // this component and re-reads from storage, so persistence still holds.
        if (initialized.current) return;
        setName((author.name as string) || "");
        setPenNames(Array.isArray(author.pen_names) ? (author.pen_names as string[]) : []);
        initialized.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const addPenName = () => {
        const trimmed = newPenName.trim();
        if (!trimmed || penNames.includes(trimmed)) return;
        const next = [...penNames, trimmed];
        setPenNames(next);
        setNewPenName("");
        onSave({author: {name, pen_names: next}});
    };

    const removePenName = (index: number) => {
        const next = penNames.filter((_, i) => i !== index);
        setPenNames(next);
        onSave({author: {name, pen_names: next}});
    };

    const saveNameIfChanged = () => {
        const savedName = ((author.name as string) || "").trim();
        if (name.trim() !== savedName) {
            onSave({author: {name, pen_names: penNames}});
        }
    };

    const profileNames = [name, ...penNames]
        .map((entry) => entry.trim())
        .filter(Boolean);
    const uniqueProfileNames = [...new Set(profileNames)];

    /**
     * Mirror the profile authors (real name + pen names) into the
     * Authors-Database as ``is_profile_author`` rows. Opt-in and
     * one-directional: an existing entry matched by name (trim +
     * case-insensitive) is promoted via PATCH instead of duplicated;
     * a missing one is created. Never writes Authors-DB back into the
     * profile.
     */
    const handleSyncToDatabase = async () => {
        setSyncing(true);
        try {
            const existing = await getStorage().authors.list({});
            for (const profileName of uniqueProfileNames) {
                const match = existing.find(
                    (entry) =>
                        entry.name.trim().toLowerCase() ===
                        profileName.toLowerCase(),
                );
                if (match) {
                    if (!match.is_profile_author) {
                        await getStorage().authors.update(match.id, {
                            is_profile_author: true,
                        });
                    }
                } else {
                    await getStorage().authors.create({
                        name: profileName,
                        is_profile_author: true,
                    });
                }
            }
            notify.success(
                t(
                    "ui.settings.author_sync_to_db_done",
                    "Profil-Autoren in die Datenbank übernommen",
                ),
            );
        } catch (err) {
            notify.error(
                t(
                    "ui.settings.author_sync_to_db_error",
                    "Übernehmen in die Datenbank fehlgeschlagen",
                ),
                err,
            );
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className={styles.section} data-testid="author-settings">
            <SectionHeader
                title={t("ui.settings.author_profile", "Autorenprofil")}
                description={t("ui.settings.author_profile_description", "Dein Autorenname und Pseudonyme für neue Bücher und Artikel.")}
            />
            <div className={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.real_name", "Echter Name")}</label>
                    <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={saveNameIfChanged}
                        placeholder={t("ui.settings.real_name_placeholder", "Dein vollstaendiger Name")}
                        data-testid="author-real-name"
                    />
                </div>

                <div className="field" style={{marginTop: 16}}>
                    <label className="label">{t("ui.settings.pen_names", "Pseudonyme (Pen Names)")}</label>
                    <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8}}>
                        {t("ui.settings.pen_names_hint", "Beim Erstellen eines neuen Buches kannst du zwischen deinem echten Namen und Pseudonymen wählen.")}
                    </p>
                    {penNames.length === 0 && (
                        <p
                            className="text-muted-foreground text-sm py-2"
                            data-testid="author-pen-name-empty"
                        >
                            {t("ui.settings.pen_names_empty", "Noch keine Pseudonyme angelegt.")}
                        </p>
                    )}
                    {penNames.length > 0 && (
                        <div
                            style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 8}}
                            data-testid="author-pen-name-list"
                        >
                            {penNames.map((pn, i) => (
                                <div
                                    key={i}
                                    data-testid={`author-pen-name-${i}`}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "6px 10px", background: "var(--bg-secondary)",
                                        borderRadius: "var(--radius-sm)",
                                    }}
                                >
                                    <span style={{flex: 1, fontSize: "0.875rem"}}>{pn}</span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => removePenName(i)}
                                        style={{padding: "2px 6px", color: "var(--danger)"}}
                                        data-testid={`author-pen-name-remove-${i}`}
                                        aria-label={t("ui.settings.remove_pen_name", "Pseudonym entfernen")}
                                    >
                                        <X size={12}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div style={{display: "flex", gap: 8}}>
                        <input
                            className="input"
                            value={newPenName}
                            onChange={(e) => setNewPenName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addPenName()}
                            placeholder={t("ui.settings.add_pen_name_placeholder", "Neues Pseudonym hinzufügen")}
                            style={{flex: 1}}
                            data-testid="author-pen-name-input"
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={addPenName}
                            disabled={!newPenName.trim()}
                            data-testid="author-pen-name-add"
                        >
                            <Plus size={14}/> {t("ui.settings.add_pen_name", "Hinzufügen")}
                        </button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        className="btn btn-secondary"
                        disabled={saving || syncing || uniqueProfileNames.length === 0}
                        onClick={handleSyncToDatabase}
                        data-testid="author-sync-to-db"
                    >
                        <Database size={14}/>{" "}
                        {t("ui.settings.author_sync_to_db", "In Datenbank übernehmen")}
                    </button>
                </div>
            </div>
        </div>
    );
}
