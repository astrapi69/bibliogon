import type { Editor as TiptapEditor } from "@tiptap/react";
import styles from "../Editor.module.css";

type Translator = (key: string, fallback: string) => string;

export interface SpellcheckMatch {
    message: string;
    short_message: string;
    offset: number;
    length: number;
    replacements: string[];
    rule_id: string;
}

interface EditorSearchBarProps {
    t: Translator;
    editor: TiptapEditor;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    replaceTerm: string;
    setReplaceTerm: (value: string) => void;
    onClose: () => void;
}

/**
 * Search-and-replace bar bound to the prosemirror-search adapter
 * commands on the active TipTap editor. Presentational: the open/close
 * flag and the term state live in the parent Editor.
 */
export function EditorSearchBar({
    t,
    editor,
    searchTerm,
    setSearchTerm,
    replaceTerm,
    setReplaceTerm,
    onClose,
}: EditorSearchBarProps) {
    return (
        <div className={`${styles.searchBar} flex-wrap`}>
            <input
                className={`input ${styles.searchInput}`}
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    editor.commands.setSearchTerm(e.target.value);
                }}
                placeholder={t("ui.editor.search", "Suchen...")}
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === "Enter") editor.commands.nextSearchResult();
                    if (e.key === "Escape") onClose();
                }}
            />
            <input
                className={`input ${styles.searchInput}`}
                value={replaceTerm}
                onChange={(e) => {
                    setReplaceTerm(e.target.value);
                    editor.commands.setReplaceTerm(e.target.value);
                }}
                placeholder={t("ui.editor.replace", "Ersetzen...")}
                onKeyDown={(e) => {
                    if (e.key === "Escape") onClose();
                }}
            />
            <button
                className="btn btn-ghost btn-sm"
                onClick={() => editor.commands.previousSearchResult()}
            >
                &lt;
            </button>
            <button
                className="btn btn-ghost btn-sm"
                onClick={() => editor.commands.nextSearchResult()}
            >
                &gt;
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.replace()}>
                {t("ui.editor.replace_one", "Ersetzen")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => editor.commands.replaceAll()}>
                {t("ui.editor.replace_all", "Alle")}
            </button>
            <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                    onClose();
                    setSearchTerm("");
                    setReplaceTerm("");
                    editor.commands.setSearchTerm("");
                }}
            >
                &times;
            </button>
        </div>
    );
}

interface EditorRecoveryBannerProps {
    t: Translator;
    savedAt: number;
    onRestore: () => void;
    onDiscard: () => void;
}

/**
 * Draft-recovery banner shown when a newer IndexedDB draft exists for
 * the current chapter. The recovery decision (restore / discard) lives
 * in the parent Editor; this component renders the prompt + actions.
 */
export function EditorRecoveryBanner({
    t,
    savedAt,
    onRestore,
    onDiscard,
}: EditorRecoveryBannerProps) {
    return (
        <div className={styles.recoveryBanner} data-testid="recovery-banner">
            <div style={{ flex: 1 }}>
                <strong>{t("ui.editor.recovery_title", "Ungespeicherte Änderungen gefunden")}</strong>
                <p
                    style={{
                        margin: "4px 0 0",
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                    }}
                >
                    {t(
                        "ui.editor.recovery_desc",
                        "Änderungen vom {timestamp} gefunden, die nicht gespeichert wurden.",
                    ).replace("{timestamp}", new Date(savedAt).toLocaleString())}
                </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={onRestore}>
                    {t("ui.editor.recovery_restore", "Wiederherstellen")}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={onDiscard}>
                    {t("ui.editor.recovery_discard", "Verwerfen")}
                </button>
            </div>
        </div>
    );
}

interface EditorAudioPreviewProps {
    t: Translator;
    src: string;
    onClose: () => void;
}

/**
 * Inline TTS audio-preview player. The blob URL + its lifecycle live in
 * the parent Editor (via useEditorTools); this component renders the
 * <audio> element and a close button, both revoking the URL on dismiss.
 */
export function EditorAudioPreview({ t, src, onClose }: EditorAudioPreviewProps) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--bg-secondary)",
                borderBottom: "1px solid var(--border)",
            }}
        >
            <audio
                controls
                autoPlay
                src={src}
                onEnded={onClose}
                style={{ height: 32, flex: 1, maxWidth: 400 }}
            />
            <button
                className="btn-icon"
                onClick={onClose}
                title={t("ui.common.close", "Schließen")}
                style={{ padding: 4, fontSize: "1rem", lineHeight: 1 }}
            >
                &#x2715;
            </button>
        </div>
    );
}

interface EditorSpellcheckPanelProps {
    t: Translator;
    loading: boolean;
    results: SpellcheckMatch[];
    onClose: () => void;
}

/**
 * Grammar/spellcheck results panel (LanguageTool matches). The fetch +
 * toggle live in the parent Editor; this component renders the result
 * list and the close action.
 */
export function EditorSpellcheckPanel({ t, loading, results, onClose }: EditorSpellcheckPanelProps) {
    return (
        <div className={styles.spellcheckPanel}>
            <div className={styles.spellcheckHeader}>
                <strong>{t("ui.editor.spellcheck", "Rechtschreibprüfung")}</strong>
                {loading && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                        {t("ui.editor.checking", "Prüfe...")}
                    </span>
                )}
                {!loading && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                        {results.length} {t("ui.editor.issues", "Probleme")}
                    </span>
                )}
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: "auto" }}
                    onClick={onClose}
                >
                    &times;
                </button>
            </div>
            {results.length > 0 && (
                <div className={styles.spellcheckList}>
                    {results.map((issue, i) => (
                        <div key={i} className={styles.spellcheckItem}>
                            <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                                {issue.message}
                            </div>
                            {issue.replacements.length > 0 && (
                                <div
                                    style={{
                                        fontSize: "0.75rem",
                                        color: "var(--accent)",
                                        marginTop: 2,
                                    }}
                                >
                                    {t("ui.editor.suggestions", "Vorschläge")}:{" "}
                                    {issue.replacements.join(", ")}
                                </div>
                            )}
                            <div
                                style={{
                                    fontSize: "0.6875rem",
                                    color: "var(--text-muted)",
                                    marginTop: 2,
                                }}
                            >
                                {issue.rule_id}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
