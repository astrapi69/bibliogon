/**
 * CategoryInput — chip-style multi-value input for Book.categories.
 *
 * Bug 9 (Books-only subject categorisation). Free-text entry with
 * an optional suggestion list pulled from the KDP plugin's
 * ``config/kdp.yaml`` catalogue (25 canonical names). Any string
 * is valid; the column accepts arbitrary user text because
 * retailers beyond KDP (Apple Books, Kobo, Ingram) have their own
 * taxonomies.
 *
 * Shape: simpler sibling of ``KeywordInput`` — no drag-reorder
 * (categories have no semantically-meaningful order), no validation
 * beyond non-empty + trim + dedup. Sister component
 * ``BisacCodeInput`` adds format-validation for the parallel
 * ``Book.bisac_codes`` field.
 *
 * Testid namespace: ``category-*`` (chips, add input, suggestion
 * datalist) per the testid-discipline rule.
 */

import {useState, KeyboardEvent} from "react";
import {Plus, X} from "lucide-react";
import {useI18n} from "../hooks/useI18n";

interface Props {
    categories: string[];
    onChange: (next: string[]) => void;
    /** Optional suggestion pool surfaced via ``<datalist>``. KDP
     *  plugin's ``config/kdp.yaml`` ships 25 canonical entries;
     *  callers fetch them via ``api.kdp.listCategories()`` and
     *  pass them here. Empty list = no datalist rendered. */
    suggestions?: string[];
}

export default function CategoryInput({categories, onChange, suggestions = []}: Props) {
    const {t} = useI18n();
    const [draft, setDraft] = useState("");

    const addCategory = () => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        // Case-insensitive dedup, first-seen casing wins (matches
        // the server-side ``_coerce_categories_in`` Pydantic
        // validator).
        const lower = trimmed.toLowerCase();
        if (categories.some((c) => c.toLowerCase() === lower)) {
            setDraft("");
            return;
        }
        onChange([...categories, trimmed]);
        setDraft("");
    };

    const removeAt = (index: number) => {
        onChange(categories.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addCategory();
        }
    };

    const datalistId = "category-input-suggestions";

    return (
        <div data-testid="category-input">
            {categories.length > 0 && (
                <div
                    data-testid="category-input-chip-list"
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 8,
                    }}
                >
                    {categories.map((cat, i) => (
                        <span
                            key={`${cat}-${i}`}
                            data-testid={`category-chip-${i}`}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 8px",
                                background: "var(--bg-secondary, #f3f4f6)",
                                borderRadius: "var(--radius-sm, 4px)",
                                fontSize: "0.875rem",
                            }}
                        >
                            <span>{cat}</span>
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                data-testid={`category-chip-${i}-delete`}
                                aria-label={t(
                                    "ui.metadata.category_remove",
                                    "Kategorie entfernen",
                                )}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: "var(--text-muted, #6b7280)",
                                    display: "inline-flex",
                                }}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div style={{display: "flex", gap: 6}}>
                <input
                    className="input"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    list={suggestions.length > 0 ? datalistId : undefined}
                    placeholder={t(
                        "ui.metadata.category_placeholder",
                        "Kategorie hinzufügen…",
                    )}
                    data-testid="category-input-add"
                    style={{flex: 1}}
                />
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addCategory}
                    disabled={!draft.trim()}
                    data-testid="category-input-add-button"
                    style={{display: "flex", alignItems: "center", gap: 4}}
                >
                    <Plus size={14} />{" "}
                    {t("ui.common.add", "Hinzufügen")}
                </button>
            </div>
            {suggestions.length > 0 && (
                <datalist id={datalistId} data-testid="category-input-datalist">
                    {suggestions.map((s) => (
                        <option key={s} value={s} />
                    ))}
                </datalist>
            )}
        </div>
    );
}
