import {useState, useRef} from "react";
import {Chapter, ChapterType} from "../api/client";
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronLeft,
    Download,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

interface Props {
    bookTitle: string;
    chapters: Chapter[];
    activeChapterId: string | null;
    onSelect: (id: string) => void;
    onAdd: (chapterType?: ChapterType) => void;
    onDelete: (id: string) => void;
    onBack: () => void;
    onExport: () => void;
    onReorder: (chapterIds: string[]) => void;
}

const FRONT_MATTER_TYPES: ChapterType[] = ["preface", "foreword", "acknowledgments"];
const BACK_MATTER_TYPES: ChapterType[] = ["about_author", "appendix", "bibliography", "glossary"];

const TYPE_LABELS: Record<ChapterType, string> = {
    chapter: "Kapitel",
    preface: "Vorwort",
    foreword: "Geleitwort",
    acknowledgments: "Danksagung",
    about_author: "Ueber den Autor",
    appendix: "Anhang",
    bibliography: "Literatur",
    glossary: "Glossar",
};

export default function ChapterSidebar({
                                           bookTitle,
                                           chapters,
                                           activeChapterId,
                                           onSelect,
                                           onAdd,
                                           onDelete,
                                           onBack,
                                           onExport,
                                           onReorder,
                                       }: Props) {
    const frontMatter = chapters.filter((ch) => FRONT_MATTER_TYPES.includes(ch.chapter_type));
    const mainChapters = chapters.filter((ch) => ch.chapter_type === "chapter");
    const backMatter = chapters.filter((ch) => BACK_MATTER_TYPES.includes(ch.chapter_type));

    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const dragCounter = useRef(0);

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDragEnter = (id: string) => {
        dragCounter.current++;
        setDragOverId(id);
    };

    const handleDragLeave = () => {
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setDragOverId(null);
        }
    };

    const handleDrop = (e: React.DragEvent, targetId: string, group: Chapter[]) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragOverId(null);
        setDragId(null);

        if (!dragId || dragId === targetId) return;

        // Only reorder within the same group
        const groupIds = group.map((ch) => ch.id);
        if (!groupIds.includes(dragId) || !groupIds.includes(targetId)) return;

        const newOrder = [...groupIds];
        const fromIdx = newOrder.indexOf(dragId);
        const toIdx = newOrder.indexOf(targetId);
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, dragId);

        // Build full chapter ID list preserving non-group ordering
        const allIds = chapters.map((ch) => ch.id);
        const otherIds = allIds.filter((id) => !groupIds.includes(id));

        // Rebuild: front-matter, then reordered group, then back-matter
        // Actually just replace the group portion in the full list
        const result: string[] = [];
        let groupInserted = false;
        for (const id of allIds) {
            if (groupIds.includes(id)) {
                if (!groupInserted) {
                    result.push(...newOrder);
                    groupInserted = true;
                }
            } else {
                result.push(id);
            }
        }

        onReorder(result);
    };

    const handleDragEnd = () => {
        setDragId(null);
        setDragOverId(null);
        dragCounter.current = 0;
    };

    const renderChapterItem = (ch: Chapter, group: Chapter[]) => (
        <div
            key={ch.id}
            draggable
            onDragStart={(e) => handleDragStart(e, ch.id)}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(ch.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, ch.id, group)}
            onDragEnd={handleDragEnd}
            style={{
                ...styles.item,
                ...(ch.id === activeChapterId ? styles.itemActive : {}),
                ...(ch.id === dragOverId ? styles.itemDragOver : {}),
                ...(ch.id === dragId ? styles.itemDragging : {}),
            }}
            onClick={() => onSelect(ch.id)}
        >
            <GripVertical size={14} style={{flexShrink: 0, opacity: 0.3, cursor: "grab"}}/>
            <span style={styles.itemTitle}>
                {ch.chapter_type !== "chapter" && (
                    <span style={styles.typeTag}>{TYPE_LABELS[ch.chapter_type]}</span>
                )}
                {ch.title}
            </span>
            <button
                style={styles.deleteBtn}
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ch.id);
                }}
                title="Kapitel loeschen"
            >
                <Trash2 size={12}/>
            </button>
        </div>
    );

    return (
        <aside style={styles.sidebar}>
            {/* Header */}
            <div style={styles.header}>
                <button style={styles.backBtn} onClick={onBack} title="Zurueck">
                    <ChevronLeft size={18}/>
                </button>
                <h2 style={styles.bookTitle} title={bookTitle}>
                    {bookTitle}
                </h2>
                <div style={{marginLeft: "auto"}}>
                    <ThemeToggle variant="dark"/>
                </div>
            </div>

            <div style={styles.list}>
                {/* Front Matter */}
                {frontMatter.length > 0 && (
                    <>
                        <div style={styles.sectionHeader}>
                            <span style={styles.listLabel}>Front Matter</span>
                        </div>
                        {frontMatter.map((ch) => renderChapterItem(ch, frontMatter))}
                    </>
                )}

                {/* Main Chapters */}
                <div style={styles.sectionHeader}>
                    <span style={styles.listLabel}>Kapitel</span>
                    <button style={styles.addBtn} onClick={() => onAdd("chapter")} title="Kapitel hinzufuegen">
                        <Plus size={14}/>
                    </button>
                </div>
                {mainChapters.length === 0 && (
                    <p style={styles.empty}>Noch keine Kapitel</p>
                )}
                {mainChapters.map((ch) => renderChapterItem(ch, mainChapters))}

                {/* Back Matter */}
                {backMatter.length > 0 && (
                    <>
                        <div style={styles.sectionHeader}>
                            <span style={styles.listLabel}>Back Matter</span>
                        </div>
                        {backMatter.map((ch) => renderChapterItem(ch, backMatter))}
                    </>
                )}
            </div>

            {/* Export */}
            <div style={styles.exportSection}>
                <button style={styles.exportBtn} onClick={onExport}>
                    <Download size={14}/> Exportieren...
                </button>
            </div>
        </aside>
    );
}

const styles: Record<string, React.CSSProperties> = {
    sidebar: {
        width: 260, minWidth: 260, height: "100vh",
        background: "var(--bg-sidebar)", color: "var(--text-sidebar)",
        display: "flex", flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.06)",
    },
    header: {
        padding: "16px 12px 12px", display: "flex", alignItems: "center", gap: 6,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    backBtn: {
        background: "none", border: "none", color: "var(--text-sidebar)",
        cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
    },
    bookTitle: {
        fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600,
        color: "#faf8f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    },
    sectionHeader: {
        padding: "16px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    listLabel: {
        fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase" as const,
        letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)",
    },
    addBtn: {
        background: "rgba(255,255,255,0.08)", border: "none", color: "var(--text-sidebar)",
        cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
    },
    list: { flex: 1, overflowY: "auto" as const, padding: "0 8px" },
    empty: {
        padding: "12px 8px", fontSize: "0.8125rem", color: "rgba(255,255,255,0.25)", fontStyle: "italic",
    },
    item: {
        display: "flex", alignItems: "center", gap: 6, padding: "8px 8px",
        borderRadius: 6, cursor: "pointer", fontSize: "0.875rem",
        transition: "background 150ms, border-color 150ms", marginBottom: 2,
        borderTop: "2px solid transparent",
    },
    itemActive: { background: "rgba(255,255,255,0.1)", color: "#faf8f5" },
    itemDragOver: { borderTop: "2px solid var(--accent, #7c6f5b)" },
    itemDragging: { opacity: 0.4 },
    itemTitle: {
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
        display: "flex", alignItems: "center", gap: 4,
    },
    typeTag: {
        fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase" as const,
        background: "rgba(255,255,255,0.08)", padding: "1px 4px", borderRadius: 3,
        color: "rgba(255,255,255,0.4)", flexShrink: 0,
    },
    deleteBtn: {
        background: "none", border: "none", color: "rgba(255,255,255,0.2)",
        cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
        opacity: 0, transition: "opacity 150ms",
    },
    exportSection: { padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" },
    exportBtn: {
        width: "100%",
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "8px 0", background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-sidebar)",
        borderRadius: 6, cursor: "pointer", fontSize: "0.8125rem",
        fontFamily: "var(--font-body)", fontWeight: 500, transition: "background 150ms",
    },
};
