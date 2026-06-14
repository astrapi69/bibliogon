import { useNavigate } from "react-router-dom";
import { type GitSyncMappingStatus } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import AuthorSelectInput from "../AuthorSelectInput";
import { EnhancedTextarea } from "../textarea/EnhancedTextarea";
import styles from "../BookMetadataEditor.module.css";

export function Row({ children }: { children: React.ReactNode }) {
    return <div className={styles.row}>{children}</div>;
}

/**
 * Repository-URL field with git-sync read-precedence.
 *
 * BOOK-REPOSITORY-URL-FIELD-01 C3. Two render shapes:
 *
 * - When ``gitSyncStatus.mapped === true``: the field is read-only
 *   and surfaces ``gitSyncStatus.repo_url``. A small hint below the
 *   input tells the user the URL is owned by plugin-git-sync
 *   (manual edits would diverge from the round-trip). The
 *   ``Book.repository_url`` column is ignored in this case to
 *   avoid two competing sources of truth.
 * - When ``mapped === false`` OR ``gitSyncStatus === null`` (fetch
 *   failed / plugin disabled): the field is a normal free input
 *   editing ``Book.repository_url`` via the form's
 *   ``onChange`` → ``set("repository_url", v)`` chain.
 */
export function RepositoryUrlField({
    value,
    onChange,
    gitSyncStatus,
    t,
}: {
    value: string;
    onChange: (v: string) => void;
    gitSyncStatus: GitSyncMappingStatus | null;
    t: (key: string, fallback: string) => string;
}) {
    const managedByGitSync = gitSyncStatus?.mapped === true;
    const label = t("ui.metadata.repository_url", "Git-Repository (URL)");
    if (managedByGitSync) {
        return (
            <div
                className="field"
                style={{ flex: 1 }}
                data-testid="metadata-repository-url-managed"
            >
                <label className="label">{label}</label>
                <input
                    className="input"
                    type="url"
                    value={gitSyncStatus?.repo_url ?? ""}
                    readOnly
                    aria-readonly="true"
                    data-testid="metadata-repository-url-input"
                    style={{ background: "var(--surface-2)", cursor: "default" }}
                />
                <small
                    style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                    }}
                    data-testid="metadata-repository-url-managed-hint"
                >
                    {t(
                        "ui.metadata.repository_url_managed_hint",
                        "Wird von plugin-git-sync verwaltet — manuelle Änderungen würden vom Round-Trip abweichen.",
                    )}
                </small>
            </div>
        );
    }
    return (
        <div className="field" style={{ flex: 1 }} data-testid="metadata-repository-url-manual">
            <label className="label">{label}</label>
            <input
                className="input"
                type="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t("ui.metadata.repository_url_placeholder", "https://github.com/...")}
                data-testid="metadata-repository-url-input"
            />
            <small
                style={{
                    display: "block",
                    marginTop: 4,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                }}
            >
                {t(
                    "ui.metadata.repository_url_hint",
                    "Optional. Externer Git-Repo-Link für Bücher, die nicht über plugin-git-sync importiert wurden.",
                )}
            </small>
        </div>
    );
}

/**
 * Author field as a free-text input with Authors-DB autocomplete.
 *
 * Pattern A (free-text input + datalist via AuthorSelectInput) was
 * chosen over a closed-list <select> so names not yet in the
 * user-profile or Authors-DB (e.g. ghostwritten works, collaborators,
 * historical imports with unfamiliar names) don't force the user to
 * detour into Settings.
 *
 * Book-specific wrapping (field div + label + manage-link to
 * Settings) stays here so the user can still curate the Authors-DB
 * proactively when desired.
 */
export function AuthorSelectField({
    label,
    value,
    onChange,
    suggestions,
    showAddToAuthorsCheckbox,
    addToAuthorsDb,
    onAddToAuthorsDbChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    suggestions: string[];
    showAddToAuthorsCheckbox: boolean;
    addToAuthorsDb: boolean;
    onAddToAuthorsDbChange: (next: boolean) => void;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();

    return (
        <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="metadata-author">
                {label}
            </label>
            <AuthorSelectInput
                value={value}
                onChange={onChange}
                suggestions={suggestions}
                profileChoices={suggestions}
                customOptionLabel={t(
                    "ui.author_select.custom_option",
                    "Anderer Name …",
                )}
                showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
                addToAuthorsDb={addToAuthorsDb}
                onAddToAuthorsDbChange={onAddToAuthorsDbChange}
                testidPrefix="metadata"
                placeholder={t("ui.metadata.author_placeholder", "Autorenname oder Pen Name")}
                addToAuthorsLabel={t(
                    "ui.metadata.add_to_authors_db",
                    '„{name}" zur Autoren-Datenbank hinzufügen',
                )}
            />
            <a
                href="/settings?tab=author"
                data-testid="metadata-author-manage-link"
                style={{
                    display: "inline-block",
                    marginTop: 4,
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    textDecoration: "underline",
                }}
                onClick={(e) => {
                    e.preventDefault();
                    navigate("/settings?tab=author");
                }}
            >
                {t("ui.metadata.author_manage_link", "Autoren in Einstellungen verwalten")}
            </a>
        </div>
    );
}

export function Field({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    mono,
    maxChars,
    datalist,
    datalistId,
    language,
    fullscreen,
}: {
    label: string;
    value: string | null | undefined;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
    mono?: boolean;
    /** Soft limit for the character counter. No hard input cap - the
     *  counter just turns red when exceeded so the user is warned but
     *  can still over-type if a platform allows more. */
    maxChars?: number;
    /** Free-text input with dropdown suggestions. When non-empty, the
     *  input gets a ``list=`` attribute pointing at a generated
     *  ``<datalist>``. Ignored when ``multiline`` is true. */
    datalist?: string[];
    datalistId?: string;
    /** Override the language tag on the EnhancedTextarea. Default
     * is ``css`` when ``mono`` is true, ``plain`` otherwise. Pass
     * ``markdown`` to enable a preview toggle on description-style
     * fields. */
    language?: "plain" | "markdown" | "html" | "css";
    /** Show a fullscreen toggle (long-form Markdown / CSS). */
    fullscreen?: boolean;
}) {
    // styles.input was an empty literal in the prior styles object;
    // dropped during the CSS-Module migration. mono path keeps the
    // monospace overrides as a small inline literal.
    const inputStyle: React.CSSProperties | undefined = mono
        ? { fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }
        : undefined;
    const text = value || "";
    const listId = !multiline && datalist && datalist.length > 0 ? datalistId : undefined;
    return (
        <div className="field" style={{ flex: 1 }}>
            <label className="label">{label}</label>
            {multiline ? (
                <EnhancedTextarea
                    value={text}
                    onChange={onChange}
                    placeholder={placeholder}
                    language={language ?? (mono ? "css" : "plain")}
                    mono={mono}
                    maxChars={maxChars}
                    fullscreen={fullscreen}
                    rows={8}
                    ariaLabel={label}
                />
            ) : (
                <>
                    <input
                        className="input"
                        style={inputStyle}
                        value={text}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        list={listId}
                    />
                    {listId && (
                        <datalist id={listId}>
                            {(datalist ?? []).map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    )}
                </>
            )}
        </div>
    );
}
