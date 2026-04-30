import {useState, useRef, useEffect} from "react";
import {X, GripVertical} from "lucide-react";
import {toast} from "react-toastify";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import styles from "./KeywordInput.module.css";

export const RECOMMENDED_MAX = 7;
export const MAX_LENGTH = 50;
// Sanity upper bound. 50 keywords is already far beyond any
// marketplace recommendation; the cap only exists to block runaway
// input (bulk paste, automated misuse) and keep the DB column to
// a reasonable size.
export const HARD_LIMIT = 50;

export type KeywordValidationError = "empty" | "too_long" | "no_comma" | "duplicate";

export interface KeywordValidationResult {
    ok: boolean;
    cleaned?: string;
    error?: KeywordValidationError;
}

/**
 * Pure validator for add and inline-edit. Accepts a raw input plus the
 * current keyword list; ``ignoreIndex`` lets edit-in-place skip the slot
 * being edited so a no-op edit is not flagged as a duplicate.
 */
export function validateKeyword(
    raw: string,
    existing: string[],
    ignoreIndex: number | null = null,
): KeywordValidationResult {
    const keyword = raw.trim();
    if (!keyword) return {ok: false, error: "empty"};
    if (keyword.length > MAX_LENGTH) return {ok: false, error: "too_long"};
    if (keyword.includes(",")) return {ok: false, error: "no_comma"};
    const lower = keyword.toLowerCase();
    const duplicate = existing.some((k, i) => i !== ignoreIndex && k.toLowerCase() === lower);
    if (duplicate) return {ok: false, error: "duplicate"};
    return {ok: true, cleaned: keyword};
}

interface Props {
    keywords: string[];
    onChange: (keywords: string[]) => void;
}

interface SortableChipProps {
    id: string;
    keyword: string;
    index: number;
    editing: boolean;
    allKeywords: string[];
    onStartEdit: () => void;
    onCommitEdit: (newValue: string) => boolean;
    onCancelEdit: () => void;
    onRemove: () => void;
}

function SortableChip({
    id, keyword, index, editing, allKeywords,
    onStartEdit, onCommitEdit, onCancelEdit, onRemove,
}: SortableChipProps) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});
    const [draft, setDraft] = useState(keyword);
    const [error, setError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            setDraft(keyword);
            setError(false);
            // Defer focus so the input is mounted
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [editing, keyword]);

    const tryCommit = () => {
        const ok = onCommitEdit(draft);
        if (!ok) setError(true);
    };

    if (editing) {
        return (
            <span
                ref={setNodeRef}
                data-testid={`keyword-chip-${index}-editing`}
                className={styles.chip}
                style={{
                    transform: CSS.Transform.toString(transform),
                    transition,
                    padding: "2px 4px",
                    border: error ? "1px solid var(--danger, #d33)" : "1px solid var(--accent)",
                }}
            >
                <input
                    ref={inputRef}
                    data-testid={`keyword-chip-${index}-edit-input`}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); setError(false); }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); tryCommit(); }
                        if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
                    }}
                    onBlur={tryCommit}
                    maxLength={MAX_LENGTH + 10}
                    className={styles.editInput}
                />
            </span>
        );
    }

    const overLimit = allKeywords.length > RECOMMENDED_MAX && index >= RECOMMENDED_MAX;

    return (
        <span
            ref={setNodeRef}
            data-testid={`keyword-chip-${index}`}
            className={styles.chip}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
                background: overLimit ? "var(--warning-light, #fef3c7)" : "var(--accent-light)",
                color: overLimit ? "var(--warning-dark, #92400e)" : "var(--accent)",
            }}
            onDoubleClick={onStartEdit}
            title={keyword}
        >
            <span {...attributes} {...listeners} style={{cursor: "grab", display: "flex"}}>
                <GripVertical size={12} style={{opacity: 0.4}}/>
            </span>
            <span className={styles.chipText}>{keyword}</span>
            <button
                data-testid={`keyword-chip-${index}-delete`}
                aria-label={`Delete ${keyword}`}
                className={styles.chipRemove}
                onClick={onRemove}
                type="button"
            >
                <X size={12}/>
            </button>
        </span>
    );
}

export default function KeywordInput({keywords, onChange}: Props) {
    const {t} = useI18n();
    const [input, setInput] = useState("");
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    // Reports validation failures to the user via the notify facade.
    // Empty inputs are silently ignored (Enter on empty field is a no-op).
    const reportError = (error: KeywordValidationError) => {
        if (error === "empty") return;
        if (error === "too_long") {
            notify.warning(
                t("ui.keywords.too_long", `Schlüsselwort darf maximal ${MAX_LENGTH} Zeichen lang sein`)
                    .replace("{max}", String(MAX_LENGTH)),
            );
        } else if (error === "no_comma") {
            notify.warning(t("ui.keywords.no_comma", "Schlüsselwort darf kein Komma enthalten"));
        } else if (error === "duplicate") {
            notify.info(t("ui.keywords.duplicate", "Schlüsselwort existiert bereits"));
        }
    };

    const addKeyword = (raw: string) => {
        // Hard limit blocks silently - the input is already disabled
        // visually at this point, this is belt-and-braces for the
        // onBlur path which fires even when the input is disabled
        // via React-internal state transitions.
        if (keywords.length >= HARD_LIMIT) return;
        const result = validateKeyword(raw, keywords);
        if (!result.ok) {
            if (result.error) reportError(result.error);
            return;
        }
        onChange([...keywords, result.cleaned!]);
        setInput("");
    };

    const removeKeyword = (index: number) => {
        const removed = keywords[index];
        const next = keywords.filter((_, i) => i !== index);
        onChange(next);
        // Undo toast: react-toastify custom content with an inline action.
        // The restore operates on ``next`` (the post-delete list), NOT on
        // the closed-over ``keywords`` which is the pre-delete snapshot.
        // Splicing into the pre-delete list would duplicate the removed
        // entry instead of restoring it.
        const toastId = toast.info(
            <div className="icon-row">
                <span>{t("ui.keywords.removed", "Schlüsselwort entfernt")}: {removed}</span>
                <button
                    type="button"
                    data-testid="keyword-undo-button"
                    onClick={() => {
                        const restored = [...next];
                        restored.splice(index, 0, removed);
                        onChange(restored);
                        toast.dismiss(toastId);
                    }}
                    className={styles.undoButton}
                >
                    {t("ui.keywords.undo", "Rückgaengig")}
                </button>
            </div>,
            {autoClose: 5000},
        );
    };

    const commitEdit = (index: number, newValue: string): boolean => {
        const result = validateKeyword(newValue, keywords, index);
        if (!result.ok) {
            if (result.error) reportError(result.error);
            return false;
        }
        if (result.cleaned === keywords[index]) {
            setEditingIndex(null);
            return true;
        }
        const next = [...keywords];
        next[index] = result.cleaned!;
        onChange(next);
        setEditingIndex(null);
        return true;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addKeyword(input);
        }
        if (e.key === "Backspace" && !input && keywords.length > 0 && editingIndex === null) {
            removeKeyword(keywords.length - 1);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;
        const ids = keywords.map((_, i) => `kw-${i}`);
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        onChange(arrayMove(keywords, oldIndex, newIndex));
    };

    const ids = keywords.map((_, i) => `kw-${i}`);
    const overRecommended = keywords.length > RECOMMENDED_MAX;
    const atHardLimit = keywords.length >= HARD_LIMIT;
    const counterColor = atHardLimit
        ? "var(--danger, #b91c1c)"
        : overRecommended
            ? "var(--warning-dark, #b45309)"
            : "var(--text-muted)";

    return (
        <div>
            <div className={styles.container}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                        {keywords.map((kw, i) => (
                            <SortableChip
                                key={ids[i]}
                                id={ids[i]}
                                keyword={kw}
                                index={i}
                                editing={editingIndex === i}
                                allKeywords={keywords}
                                onStartEdit={() => setEditingIndex(i)}
                                onCommitEdit={(val) => commitEdit(i, val)}
                                onCancelEdit={() => setEditingIndex(null)}
                                onRemove={() => removeKeyword(i)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
                <input
                    data-testid="keyword-add-input"
                    className={styles.input}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => { if (input.trim()) addKeyword(input); }}
                    placeholder={keywords.length === 0
                        ? t("ui.keywords.placeholder", "Schlüsselwort eingeben...")
                        : ""
                    }
                    disabled={atHardLimit}
                />
            </div>
            <span
                data-testid="keyword-counter"
                data-over-recommended={overRecommended ? "true" : "false"}
                data-at-hard-limit={atHardLimit ? "true" : "false"}
                className={styles.counter}
                style={{color: counterColor}}
            >
                {keywords.length} / {RECOMMENDED_MAX} {t("ui.keywords.counter", "Schlüsselwoerter")}
                {atHardLimit ? (
                    <>
                        {" - "}
                        {t(
                            "ui.keywords.hard_limit",
                            `Maximum von ${HARD_LIMIT} Schlüsselwoertern erreicht. Lösche einen Eintrag um weitere hinzuzufügen.`,
                        ).replace("{max}", String(HARD_LIMIT))}
                    </>
                ) : overRecommended ? (
                    <>
                        {" - "}
                        {t(
                            "ui.keywords.over_limit",
                            "Amazon KDP empfiehlt maximal 7 Schlüsselwoerter. Andere Plattformen erlauben mehr.",
                        )}
                    </>
                ) : null}
            </span>
            <div className={styles.hint}>
                {t("ui.keywords.hint", "Doppelklick zum Bearbeiten, Drag-and-Drop zum Sortieren")}
            </div>
        </div>
    );
}

