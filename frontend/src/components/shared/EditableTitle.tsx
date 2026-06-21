import {useEffect, useRef, useState} from "react";
import type {CSSProperties} from "react";
import {Pencil} from "lucide-react";
import {useI18n} from "../../hooks/useI18n";
import styles from "../EditableTitle.module.css";

/**
 * EditableTitle - shared pencil-toggle inline title editor.
 *
 * Display mode shows the title as text plus a pencil button; clicking
 * the pencil switches to an input. Enter or blur commits, Escape
 * reverts. An empty or unchanged title is rejected (reverts silently).
 *
 * Wired into all four editor surfaces (ArticleEditor, prose BookEditor
 * via ChapterSidebar, PageEditor, ComicBookEditor) in the same commit
 * per the Articles-vs-Books parallel-surface parity rule - no
 * half-migration.
 *
 * Testid namespace (pinned): each surface passes a distinct
 * ``testIdPrefix``; the component emits three ids under it:
 *   - ``{testIdPrefix}-text``  display-mode title text
 *   - ``{testIdPrefix}-edit``  pencil button
 *   - ``{testIdPrefix}-input`` edit-mode input
 * Surface prefixes in use: ``article-editor-title``,
 * ``book-editor-title``, ``page-editor-title``,
 * ``comic-book-editor-title``.
 *
 * The published-work warning gate (status published/archived) is added
 * in C2; C1 ships the plain editable behaviour. The
 * ``ui.editor.edit_title_tooltip`` i18n key lands in C3; until then the
 * inline German fallback carries it.
 */
interface EditableTitleProps {
    value: string;
    onSave: (newTitle: string) => void | Promise<void>;
    testIdPrefix: string;
    placeholder?: string;
    /** Applied to the display-mode text span (lets each surface keep
     *  its own font sizing / weight). */
    textClassName?: string;
    /** Applied to the edit-mode input (so the input matches the
     *  surface's title typography). */
    inputClassName?: string;
    /** C2: when true (book/article status is published or archived),
     *  the pencil opens a warning banner + acknowledgment gate before
     *  edit mode, instead of editing directly. Detection is
     *  status-based on both surfaces (``status === "published" ||
     *  "archived"``) for parallel-surface symmetry. */
    isPublished?: boolean;
    /** Inline style on the persistent wrapper. ComicBookEditor styles
     *  its title inline (no CSS module), so it passes font sizing here;
     *  the text + input inherit the font from the wrapper. */
    style?: CSSProperties;
    /** When set, the display-mode title text renders as an
     *  ``<h{level}>`` heading instead of a ``<span>``, so the editor
     *  surface exposes a single page-level heading for a11y. Default
     *  (unset) keeps the inline span — unchanged for the surfaces that
     *  carry their own heading elsewhere. */
    headingLevel?: 1 | 2 | 3;
}

export default function EditableTitle({
    value,
    onSave,
    testIdPrefix,
    placeholder,
    textClassName,
    inputClassName,
    isPublished = false,
    style,
    headingLevel,
}: EditableTitleProps) {
    const TextTag = (
        headingLevel ? `h${headingLevel}` : "span"
    ) as keyof React.JSX.IntrinsicElements;
    const {t} = useI18n();
    const [editing, setEditing] = useState(false);
    const [warning, setWarning] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keep the draft in sync when the title changes externally while
    // not editing (e.g. a metadata-tab save or a fresh load).
    useEffect(() => {
        if (!editing) setDraft(value);
    }, [value, editing]);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const startEdit = () => {
        // Published works gate edit behind an acknowledgment banner so
        // the author knows a title change must be carried over to the
        // publishing platform (KDP etc.) manually.
        if (isPublished) {
            setWarning(true);
            return;
        }
        setDraft(value);
        setEditing(true);
    };

    const acknowledgeWarning = () => {
        setWarning(false);
        setDraft(value);
        setEditing(true);
    };

    const cancel = () => {
        setDraft(value);
        setEditing(false);
    };

    const commit = () => {
        const trimmed = draft.trim();
        // Reject empty or unchanged titles: revert without a save.
        if (!trimmed || trimmed === value) {
            cancel();
            return;
        }
        void onSave(trimmed);
        setEditing(false);
    };

    const editLabel = t("ui.editor.edit_title_tooltip", "Titel bearbeiten");

    return (
        <span className={styles.wrapper} style={style}>
            {editing ? (
                <input
                    ref={inputRef}
                    data-testid={`${testIdPrefix}-input`}
                    className={inputClassName ?? styles.input}
                    value={draft}
                    placeholder={placeholder}
                    aria-label={editLabel}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancel();
                        }
                    }}
                />
            ) : (
                <>
                    <TextTag
                        data-testid={`${testIdPrefix}-text`}
                        className={textClassName ?? styles.text}
                    >
                        {value || placeholder}
                    </TextTag>
                    <button
                        type="button"
                        data-testid={`${testIdPrefix}-edit`}
                        className={styles.pencil}
                        onClick={startEdit}
                        aria-label={editLabel}
                        title={editLabel}
                    >
                        <Pencil size={14} />
                    </button>
                </>
            )}
            {warning && (
                <span
                    className={styles.warning}
                    role="alert"
                    data-testid={`${testIdPrefix}-warning`}
                >
                    <span
                        className={styles.warningText}
                        data-testid={`${testIdPrefix}-warning-text`}
                    >
                        {t(
                            "ui.editor.published_warning_body",
                            "Achtung: Dieses Werk wurde bereits veröffentlicht. Eine Titeländerung muss manuell auf der Veröffentlichungsplattform (z.B. KDP) nachgezogen werden.",
                        )}
                    </span>
                    <span className={styles.warningActions}>
                        <button
                            type="button"
                            className={styles.warningAck}
                            data-testid={`${testIdPrefix}-warning-ack`}
                            onClick={acknowledgeWarning}
                        >
                            {t(
                                "ui.editor.acknowledge_warning_button",
                                "Verstanden, Titel ändern",
                            )}
                        </button>
                        <button
                            type="button"
                            className={styles.warningCancel}
                            data-testid={`${testIdPrefix}-warning-cancel`}
                            onClick={() => setWarning(false)}
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                    </span>
                </span>
            )}
        </span>
    );
}
