import {useState} from "react";
import {GripVertical, X, Plus} from "lucide-react";
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
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";

interface Props {
    items: string[];
    onChange: (items: string[]) => void;
    label?: string;
    addPlaceholder?: string;
}

function SortableItem({id, item, index, onRemove}: {
    id: string;
    item: string;
    index: number;
    onRemove: (index: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id});

    const style: React.CSSProperties = {
        ...itemStyles.item,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <span {...attributes} {...listeners} style={{display: "flex", cursor: "grab"}}>
                <GripVertical size={12} style={{color: "var(--text-muted)", flexShrink: 0}}/>
            </span>
            <span style={itemStyles.itemText}>{item}</span>
            <button
                style={{...itemStyles.iconBtn, color: "var(--danger)"}}
                onClick={() => onRemove(index)}
                title="Entfernen"
            >
                <X size={12}/>
            </button>
        </div>
    );
}

export default function OrderedListEditor({items, onChange, label, addPlaceholder}: Props) {
    const [newItem, setNewItem] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    // Generate stable IDs for sortable context
    const itemIds = items.map((item, i) => `${item}-${i}`);

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const oldIndex = itemIds.indexOf(active.id as string);
        const newIndex = itemIds.indexOf(over.id as string);
        onChange(arrayMove(items, oldIndex, newIndex));
    };

    const remove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    const add = () => {
        if (!newItem.trim()) return;
        onChange([...items, newItem.trim()]);
        setNewItem("");
    };

    return (
        <div>
            {label && (
                <label style={itemStyles.label}>{label}</label>
            )}
            <div style={itemStyles.list}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                        {items.map((item, i) => (
                            <SortableItem
                                key={itemIds[i]}
                                id={itemIds[i]}
                                item={item}
                                index={i}
                                onRemove={remove}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
            <div style={itemStyles.addRow}>
                <input
                    style={itemStyles.addInput}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                    placeholder={addPlaceholder || "Neuen Eintrag hinzufügen..."}
                />
                <button style={itemStyles.addBtn} onClick={add} disabled={!newItem.trim()}>
                    <Plus size={12}/>
                </button>
            </div>
        </div>
    );
}

const itemStyles: Record<string, React.CSSProperties> = {
    label: {
        display: "block", fontSize: "0.8125rem", fontWeight: 500,
        color: "var(--text-secondary)", marginBottom: 6,
    },
    list: {
        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
        overflow: "hidden",
    },
    item: {
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 8px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-primary)", fontSize: "0.8125rem",
    },
    itemText: {
        flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.75rem",
        color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    iconBtn: {
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 20, height: 20, border: "none", background: "transparent",
        cursor: "pointer", color: "var(--text-muted)", borderRadius: 3,
        padding: 0,
    },
    addRow: {
        display: "flex", gap: 4, marginTop: 6,
    },
    addInput: {
        flex: 1, padding: "4px 8px", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", fontSize: "0.75rem",
        fontFamily: "var(--font-mono)", background: "var(--bg-card)",
        color: "var(--text-primary)", outline: "none",
    },
    addBtn: {
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", background: "var(--bg-card)",
        cursor: "pointer", color: "var(--text-secondary)",
    },
};
