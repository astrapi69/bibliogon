import {Chapter} from "../api/client";
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronLeft,
    Download,
    FileText,
} from "lucide-react";

interface Props {
    bookTitle: string;
    chapters: Chapter[];
    activeChapterId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onDelete: (id: string) => void;
    onBack: () => void;
    onExport: (fmt: "epub" | "pdf") => void;
}

export default function ChapterSidebar({
                                           bookTitle,
                                           chapters,
                                           activeChapterId,
                                           onSelect,
                                           onAdd,
                                           onDelete,
                                           onBack,
                                           onExport,
                                       }: Props) {
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
            </div>

            {/* Chapter list */}
            <div style={styles.listHeader}>
                <span style={styles.listLabel}>Kapitel</span>
                <button style={styles.addBtn} onClick={onAdd} title="Kapitel hinzufuegen">
                    <Plus size={14}/>
                </button>
            </div>

            <div style={styles.list}>
                {chapters.length === 0 && (
                    <p style={styles.empty}>Noch keine Kapitel</p>
                )}
                {chapters.map((ch) => (
                    <div
                        key={ch.id}
                        style={{
                            ...styles.item,
                            ...(ch.id === activeChapterId ? styles.itemActive : {}),
                        }}
                        onClick={() => onSelect(ch.id)}
                    >
                        <GripVertical
                            size={14}
                            style={{flexShrink: 0, opacity: 0.3}}
                        />
                        <span style={styles.itemTitle}>{ch.title}</span>
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
                ))}
            </div>

            {/* Export */}
            <div style={styles.exportSection}>
                <span style={styles.listLabel}>Export</span>
                <div style={styles.exportBtns}>
                    <button
                        style={styles.exportBtn}
                        onClick={() => onExport("epub")}
                    >
                        <Download size={14}/>
                        EPUB
                    </button>
                    <button
                        style={styles.exportBtn}
                        onClick={() => onExport("pdf")}
                    >
                        <FileText size={14}/>
                        PDF
                    </button>
                </div>
            </div>
        </aside>
    );
}

const styles: Record<string, React.CSSProperties> = {
    sidebar: {
        width: 260,
        minWidth: 260,
        height: "100vh",
        background: "var(--bg-sidebar)",
        color: "var(--text-sidebar)",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.06)",
    },
    header: {
        padding: "16px 12px 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    backBtn: {
        background: "none",
        border: "none",
        color: "var(--text-sidebar)",
        cursor: "pointer",
        padding: 4,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
    },
    bookTitle: {
        fontFamily: "var(--font-display)",
        fontSize: "1rem",
        fontWeight: 600,
        color: "#faf8f5",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    listHeader: {
        padding: "16px 16px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    listLabel: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color: "rgba(255,255,255,0.35)",
    },
    addBtn: {
        background: "rgba(255,255,255,0.08)",
        border: "none",
        color: "var(--text-sidebar)",
        cursor: "pointer",
        padding: 4,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
    },
    list: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "0 8px",
    },
    empty: {
        padding: "12px 8px",
        fontSize: "0.8125rem",
        color: "rgba(255,255,255,0.25)",
        fontStyle: "italic",
    },
    item: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 8px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: "0.875rem",
        transition: "background 150ms",
        marginBottom: 2,
    },
    itemActive: {
        background: "rgba(255,255,255,0.1)",
        color: "#faf8f5",
    },
    itemTitle: {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
    },
    deleteBtn: {
        background: "none",
        border: "none",
        color: "rgba(255,255,255,0.2)",
        cursor: "pointer",
        padding: 4,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        opacity: 0,
        transition: "opacity 150ms",
    },
    exportSection: {
        padding: "12px 16px 16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
    },
    exportBtns: {
        display: "flex",
        gap: 8,
        marginTop: 8,
    },
    exportBtn: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 0",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text-sidebar)",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: "0.8125rem",
        fontFamily: "var(--font-body)",
        fontWeight: 500,
        transition: "background 150ms",
    },
};
