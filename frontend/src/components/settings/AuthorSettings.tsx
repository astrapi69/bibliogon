import {useEffect, useState} from "react";
import {Save, Plus, X} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";

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

    useEffect(() => {
        setName((author.name as string) || "");
        setPenNames(Array.isArray(author.pen_names) ? (author.pen_names as string[]) : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    const addPenName = () => {
        const trimmed = newPenName.trim();
        if (!trimmed || penNames.includes(trimmed)) return;
        setPenNames([...penNames, trimmed]);
        setNewPenName("");
    };

    const removePenName = (index: number) => {
        setPenNames(penNames.filter((_, i) => i !== index));
    };

    return (
        <div className={styles.section} data-testid="author-settings">
            <h2 className={styles.sectionTitle}>{t("ui.settings.author_profile", "Autorenprofil")}</h2>
            <div className={styles.card}>
                <div className="field">
                    <label className="label">{t("ui.settings.real_name", "Echter Name")}</label>
                    <input
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("ui.settings.real_name_placeholder", "Dein vollstaendiger Name")}
                        data-testid="author-real-name"
                    />
                </div>

                <div className="field" style={{marginTop: 16}}>
                    <label className="label">{t("ui.settings.pen_names", "Pseudonyme (Pen Names)")}</label>
                    <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8}}>
                        {t("ui.settings.pen_names_hint", "Beim Erstellen eines neuen Buches kannst du zwischen deinem echten Namen und Pseudonymen wählen.")}
                    </p>
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

                <button
                    className="btn btn-primary"
                    style={{marginTop: 16}}
                    disabled={saving}
                    onClick={() => onSave({author: {name, pen_names: penNames}})}
                    data-testid="author-save"
                >
                    <Save size={14}/> {t("ui.common.save", "Speichern")}
                </button>
            </div>
        </div>
    );
}
