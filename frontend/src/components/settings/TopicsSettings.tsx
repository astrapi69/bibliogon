import {useEffect, useRef, useState} from "react";
import {Plus, X} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../../pages/Settings.module.css";
import {SectionHeader} from "./SectionHeader";

/**
 * Article-topics list (Settings > Themen).
 *
 * Add and remove persist immediately through ``onSave`` (auto-save, #472)
 * so an item is never lost by navigating away — there is no manual Save
 * button. Online (API) and offline (Dexie) share the ``onSave`` ->
 * ``settings.updateApp`` persistence path.
 */
export function TopicsSettings({config, onSave}: {
    config: Record<string, unknown>;
    onSave: (data: Record<string, unknown>) => void;
    saving: boolean;
}) {
    const {t} = useI18n();
    const initialTopics = Array.isArray(config.topics)
        ? (config.topics as unknown[]).filter((v): v is string => typeof v === "string")
        : [];
    const [topics, setTopics] = useState<string[]>(initialTopics);
    const [newTopic, setNewTopic] = useState("");

    // The parent loads `config` asynchronously (getApp); this effect
    // re-hydrates the topics once it arrives. A late arrival must not
    // CLOBBER topics the user just added/removed (that would save the
    // stale list, e.g. []), so ``userEdited`` gates the re-hydrate.
    const userEdited = useRef(false);

    useEffect(() => {
        if (userEdited.current) return; // never clobber an in-progress edit
        setTopics(
            Array.isArray(config.topics)
                ? (config.topics as unknown[]).filter((v): v is string => typeof v === "string")
                : [],
        );
    }, [config]);

    const addTopic = () => {
        const trimmed = newTopic.trim();
        if (!trimmed || topics.includes(trimmed)) return;
        userEdited.current = true;
        const next = [...topics, trimmed];
        setTopics(next);
        setNewTopic("");
        onSave({topics: next});
    };

    const removeTopic = (index: number) => {
        userEdited.current = true;
        const next = topics.filter((_, i) => i !== index);
        setTopics(next);
        onSave({topics: next});
    };

    return (
        <div className={styles.section} data-testid="topics-settings">
            <SectionHeader
                title={t("ui.settings.topics_title", "Artikel-Themen")}
                description={t("ui.settings.topics_description", "Themen, die im Artikel-Editor zur Auswahl stehen.")}
            />
            <div className={styles.card}>
                <div className="field">
                    <p style={{fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 8}}>
                        {t("ui.settings.topics_hint", "Themen erscheinen als Auswahl im Artikel-Editor. Ein Thema ist die primaere Kategorie eines Artikels.")}
                    </p>
                    {topics.length === 0 && (
                        <p
                            className="text-muted-foreground text-sm py-2"
                            data-testid="topics-empty"
                        >
                            {t("ui.settings.topics_empty", "Noch keine Themen angelegt.")}
                        </p>
                    )}
                    {topics.length > 0 && (
                        <div style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 8}}>
                            {topics.map((topic, i) => (
                                <div
                                    key={i}
                                    data-testid={`topic-row-${i}`}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "6px 10px", background: "var(--bg-secondary)",
                                        borderRadius: "var(--radius-sm)",
                                    }}
                                >
                                    <span style={{flex: 1, fontSize: "0.875rem"}}>{topic}</span>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => removeTopic(i)}
                                        style={{padding: "2px 6px", color: "var(--danger)"}}
                                        data-testid={`topic-remove-${i}`}
                                        aria-label={t("ui.settings.topics_remove", "Thema entfernen")}
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
                            value={newTopic}
                            onChange={(e) => setNewTopic(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addTopic()}
                            placeholder={t("ui.settings.topics_add_placeholder", "Neues Thema hinzufügen")}
                            data-testid="topic-add-input"
                            style={{flex: 1}}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={addTopic}
                            disabled={!newTopic.trim()}
                            data-testid="topic-add-btn"
                        >
                            <Plus size={14}/> {t("ui.settings.topics_add", "Hinzufügen")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
