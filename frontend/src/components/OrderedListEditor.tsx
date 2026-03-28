import {useState} from "react";
import {GripVertical, X, Plus, ChevronUp, ChevronDown} from "lucide-react";

interface Props {
    items: string[];
    onChange: (items: string[]) => void;
    label?: string;
    addPlaceholder?: string;
}

export default function OrderedListEditor({items, onChange, label, addPlaceholder}: Props) {
    const [newItem, setNewItem] = useState("");

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
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
                <label style={styles.label}>{label}</label>
            )}
            <div style={styles.list}>
                {items.map((item, i) => (
                    <div key={`${item}-${i}`} style={styles.item}>
                        <GripVertical size={12} style={{color: "var(--text-muted)", flexShrink: 0}}/>
                        <span style={styles.itemText}>{item}</span>
                        <div style={styles.itemActions}>
                            <button
                                style={styles.iconBtn}
                                onClick={() => move(i, -1)}
                                disabled={i === 0}
                                title="Nach oben"
                            >
                                <ChevronUp size={12}/>
                            </button>
                            <button
                                style={styles.iconBtn}
                                onClick={() => move(i, 1)}
                                disabled={i === items.length - 1}
                                title="Nach unten"
                            >
                                <ChevronDown size={12}/>
                            </button>
                            <button
                                style={{...styles.iconBtn, color: "var(--danger)"}}
                                onClick={() => remove(i)}
                                title="Entfernen"
                            >
                                <X size={12}/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div style={styles.addRow}>
                <input
                    style={styles.addInput}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                    placeholder={addPlaceholder || "Neuen Eintrag hinzufuegen..."}
                />
                <button style={styles.addBtn} onClick={add} disabled={!newItem.trim()}>
                    <Plus size={12}/>
                </button>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
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
    itemActions: {display: "flex", gap: 2, flexShrink: 0},
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
