import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";

import { useI18n } from "../../hooks/useI18n";
import { RadixSelect } from "../RadixSelect";
import Tooltip from "../Tooltip";
import layout from "../../pages/ArticleEditor.module.css";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ status }: { status: SaveStatus }) {
    const { t } = useI18n();
    // Always render something so the user always knows the save state.
    // Idle baseline = "All changes saved" (gray). Visible at rest, not
    // hidden after fade-out like the BookEditor's transient pill.
    if (status === "saving") {
        return (
            <span
                data-testid="article-editor-save-status"
                data-state="saving"
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8125rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <Loader2 size={12} className="spin" />
                {t("ui.articles.saving", "Speichert…")}
            </span>
        );
    }
    if (status === "error") {
        return (
            <span
                data-testid="article-editor-save-status"
                data-state="error"
                style={{
                    color: "var(--danger)",
                    fontSize: "0.8125rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <AlertCircle size={12} />
                {t("ui.articles.save_error_label", "Fehler")}
            </span>
        );
    }
    // idle + saved both render the same "saved" baseline (idle simply
    // means no edit since last save; the article is on disk either way).
    return (
        <span
            data-testid="article-editor-save-status"
            data-state={status}
            style={{
                color: status === "saved" ? "var(--success, #16a34a)" : "var(--text-muted)",
                fontSize: "0.8125rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
            }}
        >
            <Save size={12} />
            {t("ui.articles.all_saved", "Alle Änderungen gespeichert")}
        </span>
    );
}

export function Field({
    label,
    value,
    onChange,
    onBlur,
    testId,
    placeholder,
    tooltip,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur: () => void;
    testId: string;
    placeholder?: string;
    tooltip?: string;
}) {
    return (
        <>
            <FieldLabel label={label} tooltip={tooltip} />
            <input
                data-testid={testId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                className={layout.fieldInput}
                aria-label={label}
            />
        </>
    );
}

/** Sidebar label with optional Radix tooltip. The label text stays
 *  fully visible; when ``tooltip`` is set, the label becomes the
 *  hover trigger and renders the explanatory string on dwell. */
export function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
    if (!tooltip) {
        return <label className={layout.fieldLabel}>{label}</label>;
    }
    return (
        <Tooltip content={tooltip}>
            <label
                className={layout.fieldLabel}
                style={{
                    cursor: "help",
                    textDecoration: "underline dotted",
                    textDecorationColor: "var(--text-muted)",
                    textUnderlineOffset: "3px",
                }}
            >
                {label}
            </label>
        </Tooltip>
    );
}

/** Settings-managed topic select. Empty array (settings has no topics
 *  configured yet) renders a hint + disabled select; null (loading)
 *  renders a disabled select without the hint. Unknown current value
 *  is preserved as a one-off option so legacy data survives.
 *
 *  Includes a sentinel "+ Add new topic" option that prompts the user
 *  for a new topic name, persists it via onAddTopic (PATCH settings),
 *  then selects it. Saves a context-switch to the Settings page for
 *  the common "I want this topic right now" case. */
const ADD_TOPIC_SENTINEL = "__add_new_topic__";

export function TopicSelect({
    value,
    topics,
    onChange,
    onAddTopic,
}: {
    value: string;
    topics: string[] | null;
    onChange: (next: string) => void;
    onAddTopic: (name: string) => Promise<boolean>;
}) {
    const { t } = useI18n();
    const list = topics ?? [];
    const valueIsKnown = value === "" || list.includes(value);
    const noTopicsConfigured = topics !== null && list.length === 0;

    // Inline-add state. When the user picks the "+ Add new topic"
    // sentinel, we hide the select, show a small input row, and let
    // them type + Enter to save (Escape cancels). Avoids the browser
    // default prompt() which doesn't match app conventions.
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    const handleSelectChange = (next: string) => {
        if (next === ADD_TOPIC_SENTINEL) {
            // Controlled RadixSelect: we simply don't propagate the
            // sentinel as a value, so the trigger keeps showing the
            // current topic while the inline add-input opens.
            setDraft("");
            setAdding(true);
            return;
        }
        onChange(next);
    };

    const commitDraft = async () => {
        const name = draft.trim();
        if (!name) {
            setAdding(false);
            return;
        }
        const ok = await onAddTopic(name);
        if (ok) onChange(name);
        setAdding(false);
        setDraft("");
    };

    const cancelDraft = () => {
        setAdding(false);
        setDraft("");
    };

    if (adding) {
        return (
            <div
                data-testid="article-editor-topic-add-row"
                style={{ display: "flex", gap: 6, alignItems: "stretch" }}
            >
                <input
                    ref={inputRef}
                    data-testid="article-editor-topic-add-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void commitDraft();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelDraft();
                        }
                    }}
                    placeholder={t("ui.articles.topic_add_new_placeholder", "Themenname")}
                    className={layout.fieldInput}
                    style={{ flex: 1 }}
                />
                <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void commitDraft()}
                    disabled={!draft.trim()}
                    data-testid="article-editor-topic-add-save"
                >
                    {t("ui.common.save", "Speichern")}
                </button>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={cancelDraft}
                    data-testid="article-editor-topic-add-cancel"
                >
                    {t("ui.common.cancel", "Abbrechen")}
                </button>
            </div>
        );
    }

    return (
        <>
            <RadixSelect
                testId="article-editor-topic"
                ariaLabel={t("ui.articles.topic", "Thema")}
                value={value}
                onValueChange={handleSelectChange}
                className="is-block"
                disabled={topics === null}
                allOption={{
                    label: t("ui.articles.topic_none", "(kein Thema)"),
                }}
                options={[
                    ...list.map((topic) => ({ value: topic, label: topic })),
                    ...(!valueIsKnown && value !== "" ? [{ value, label: value }] : []),
                    {
                        value: ADD_TOPIC_SENTINEL,
                        label: t("ui.articles.topic_add_new", "+ Neues Thema hinzufügen"),
                    },
                ]}
            />
            {noTopicsConfigured && (
                <p
                    data-testid="article-editor-topic-empty-hint"
                    style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: 4,
                    }}
                >
                    {t("ui.articles.topic_empty_hint", "Themen in den Einstellungen verwalten.")}
                </p>
            )}
        </>
    );
}
