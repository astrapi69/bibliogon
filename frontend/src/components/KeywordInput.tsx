import {useState} from "react";
import {X, GripVertical} from "lucide-react";
import {useI18n} from "../hooks/useI18n";
import {toast} from "react-toastify";
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

const MAX_KEYWORDS = 7;

interface Props {
    keywords: string[];
    onChange: (keywords: string[]) => void;
}

function SortableChip({id, keyword, onRemove}: {id: string; keyword: string; onRemove: () => void}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});

    return (
        <span
            ref={setNodeRef}
            style={{
                ...styles.chip,
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? 0.5 : 1,
            }}
        >
            <span {...attributes} {...listeners} style={{cursor: "grab", display: "flex"}}>
                <GripVertical size={12} style={{opacity: 0.4}}/>
            </span>
            <span style={styles.chipText}>{keyword}</span>
            <button style={styles.chipRemove} onClick={onRemove}>
                <X size={12}/>
            </button>
        </span>
    );
}

export default function KeywordInput({keywords, onChange}: Props) {
    const {t} = useI18n();
    const [input, setInput] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    const addKeyword = (raw: string) => {
        const keyword = raw.trim();
        if (!keyword) return;
        if (keywords.length >= MAX_KEYWORDS) return;
        if (keywords.some((k) => k.toLowerCase() === keyword.toLowerCase())) {
            toast.info(t("ui.keywords.duplicate", "Keyword bereits vorhanden"));
            return;
        }
        onChange([...keywords, keyword]);
        setInput("");
    };

    const removeKeyword = (index: number) => {
        onChange(keywords.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addKeyword(input);
        }
        if (e.key === "Backspace" && !input && keywords.length > 0) {
            removeKeyword(keywords.length - 1);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;
        const ids = keywords.map((k, i) => `kw-${i}`);
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        onChange(arrayMove(keywords, oldIndex, newIndex));
    };

    const ids = keywords.map((_, i) => `kw-${i}`);
    const atLimit = keywords.length >= MAX_KEYWORDS;

    return (
        <div>
            <div style={styles.container}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                        {keywords.map((kw, i) => (
                            <SortableChip
                                key={ids[i]}
                                id={ids[i]}
                                keyword={kw}
                                onRemove={() => removeKeyword(i)}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
                {!atLimit && (
                    <input
                        style={styles.input}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => { if (input.trim()) addKeyword(input); }}
                        placeholder={keywords.length === 0
                            ? t("ui.keywords.placeholder", "Keyword eingeben...")
                            : ""
                        }
                    />
                )}
            </div>
            <span style={styles.counter}>
                {keywords.length}/{MAX_KEYWORDS} {t("ui.keywords.counter", "Keywords")}
            </span>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-card)",
        minHeight: 38,
        alignItems: "center",
    },
    chip: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 6px 3px 4px",
        background: "var(--accent-light)",
        color: "var(--accent)",
        borderRadius: 4,
        fontSize: "0.8125rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
    },
    chipText: {
        maxWidth: 180,
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    chipRemove: {
        display: "flex",
        alignItems: "center",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--accent)",
        padding: 0,
        opacity: 0.6,
    },
    input: {
        flex: 1,
        minWidth: 120,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: "0.8125rem",
        color: "var(--text-primary)",
        padding: "2px 0",
    },
    counter: {
        display: "block",
        fontSize: "0.6875rem",
        color: "var(--text-muted)",
        marginTop: 4,
    },
};
