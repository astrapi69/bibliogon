import {useState} from "react";
import {Chapter, ChapterType} from "../api/client";
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronLeft,
    Download,
    FileText,
    ListChecks,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Tooltip from "./Tooltip";
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
    bookTitle: string;
    chapters: Chapter[];
    activeChapterId: string | null;
    onSelect: (id: string) => void;
    onAdd: (chapterType?: ChapterType) => void;
    onDelete: (id: string) => void;
    onBack: () => void;
    onExport: () => void;
    onReorder: (chapterIds: string[]) => void;
    onMetadata: () => void;
    onValidateToc?: () => void;
    showMetadata: boolean;
    hasToc: boolean;
}

const FRONT_MATTER_TYPES: ChapterType[] = ["toc", "preface", "foreword", "acknowledgments"];
const BACK_MATTER_TYPES: ChapterType[] = [
    "epilogue", "about_author", "appendix", "bibliography",
    "glossary", "imprint", "next_in_series",
];
const STRUCTURE_TYPES: ChapterType[] = ["part_intro", "interlude"];

const TYPE_LABELS: Record<ChapterType, string> = {
    chapter: "Kapitel",
    preface: "Vorwort",
    foreword: "Geleitwort",
    acknowledgments: "Danksagung",
    about_author: "Über den Autor",
    appendix: "Anhang",
    bibliography: "Literatur",
    glossary: "Glossar",
    epilogue: "Epilog",
    imprint: "Impressum",
    next_in_series: "Nächster Band",
    part_intro: "Teil-Einleitung",
    interlude: "Interludium",
    toc: "Inhaltsverzeichnis",
};

// --- Sortable Chapter Item ---

function SortableChapterItem({chapter, isActive, onSelect, onDelete}: {
    chapter: Chapter;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id: chapter.id});

    const style: React.CSSProperties = {
        ...styles.item,
        ...(isActive ? styles.itemActive : {}),
        ...(isDragging ? styles.itemDragging : {}),
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} onClick={() => onSelect(chapter.id)}>
            <span {...attributes} {...listeners} style={{display: "flex", cursor: "grab"}}>
                <GripVertical size={14} style={{flexShrink: 0, opacity: 0.3}}/>
            </span>
            <span style={styles.itemTitle}>
                {chapter.chapter_type !== "chapter" && (
                    <span style={styles.typeTag}>{TYPE_LABELS[chapter.chapter_type]}</span>
                )}
                {chapter.title}
            </span>
            <Tooltip content="Kapitel löschen" side="right">
                <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(chapter.id);
                    }}
                >
                    <Trash2 size={12}/>
                </button>
            </Tooltip>
        </div>
    );
}

// --- Sortable Group ---

function SortableGroup({chapters, allChapters, activeChapterId, onSelect, onDelete, onReorder}: {
    chapters: Chapter[];
    allChapters: Chapter[];
    activeChapterId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onReorder: (chapterIds: string[]) => void;
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    const groupIds = chapters.map((ch) => ch.id);

    const handleDragEnd = (event: DragEndEvent) => {
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const oldIndex = groupIds.indexOf(active.id as string);
        const newIndex = groupIds.indexOf(over.id as string);
        const newGroupOrder = arrayMove(groupIds, oldIndex, newIndex);

        // Rebuild full chapter order preserving non-group chapters
        const allIds = allChapters.map((ch) => ch.id);
        const result: string[] = [];
        let groupInserted = false;
        for (const id of allIds) {
            if (groupIds.includes(id)) {
                if (!groupInserted) {
                    result.push(...newGroupOrder);
                    groupInserted = true;
                }
            } else {
                result.push(id);
            }
        }
        onReorder(result);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                {chapters.map((ch) => (
                    <SortableChapterItem
                        key={ch.id}
                        chapter={ch}
                        isActive={ch.id === activeChapterId}
                        onSelect={onSelect}
                        onDelete={onDelete}
                    />
                ))}
            </SortableContext>
        </DndContext>
    );
}

// --- Main Sidebar ---

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
                                           onMetadata,
                                           onValidateToc,
                                           showMetadata,
                                           hasToc,
                                       }: Props) {
    const frontMatter = chapters.filter((ch) => FRONT_MATTER_TYPES.includes(ch.chapter_type));
    const mainChapters = chapters.filter((ch) =>
        ch.chapter_type === "chapter" || STRUCTURE_TYPES.includes(ch.chapter_type)
    );
    const backMatter = chapters.filter((ch) => BACK_MATTER_TYPES.includes(ch.chapter_type));

    const [addMenuOpen, setAddMenuOpen] = useState(false);

    return (
        <aside style={styles.sidebar}>
            {/* Header */}
            <div style={styles.header}>
                <Tooltip content="Zurück zum Dashboard">
                    <button style={styles.backBtn} onClick={onBack}>
                        <ChevronLeft size={18}/>
                    </button>
                </Tooltip>
                <h2 style={styles.bookTitle} title={bookTitle}>
                    {bookTitle}
                </h2>
                <div style={{marginLeft: "auto"}}>
                    <ThemeToggle variant="dark"/>
                </div>
            </div>

            <div style={styles.manuscriptHeader}>
                <span style={styles.manuscriptTitle}>Manuskript</span>
            </div>

            <div style={styles.list}>
                {/* Add button with dropdown */}
                <div style={styles.sectionHeader}>
                    <span style={styles.listLabel}>Inhalt</span>
                    <DropdownMenu.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
                        <Tooltip content="Kapitel hinzufügen">
                            <DropdownMenu.Trigger asChild>
                                <button style={styles.addBtn}>
                                    <Plus size={14}/>
                                </button>
                            </DropdownMenu.Trigger>
                        </Tooltip>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content className="chapter-dropdown-content" align="end" sideOffset={4}>
                                <DropdownMenu.Label className="chapter-dropdown-label">Front Matter</DropdownMenu.Label>
                                {FRONT_MATTER_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" onSelect={() => onAdd(t)}>
                                        {TYPE_LABELS[t]}
                                    </DropdownMenu.Item>
                                ))}
                                <DropdownMenu.Separator className="chapter-dropdown-separator"/>
                                <DropdownMenu.Label className="chapter-dropdown-label">Kapitel</DropdownMenu.Label>
                                <DropdownMenu.Item className="chapter-dropdown-item" onSelect={() => onAdd("chapter")}>
                                    Neues Kapitel
                                </DropdownMenu.Item>
                                {STRUCTURE_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" onSelect={() => onAdd(t)}>
                                        {TYPE_LABELS[t]}
                                    </DropdownMenu.Item>
                                ))}
                                <DropdownMenu.Separator className="chapter-dropdown-separator"/>
                                <DropdownMenu.Label className="chapter-dropdown-label">Back Matter</DropdownMenu.Label>
                                {BACK_MATTER_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" onSelect={() => onAdd(t)}>
                                        {TYPE_LABELS[t]}
                                    </DropdownMenu.Item>
                                ))}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>

                {/* Front Matter */}
                {frontMatter.length > 0 && (
                    <>
                        <div style={styles.sectionHeader}>
                            <span style={styles.listLabel}>Front Matter</span>
                        </div>
                        <SortableGroup
                            chapters={frontMatter}
                            allChapters={chapters}
                            activeChapterId={activeChapterId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onReorder={onReorder}
                        />
                    </>
                )}

                {/* Main Chapters */}
                <div style={styles.sectionHeader}>
                    <span style={styles.listLabel}>Kapitel</span>
                </div>
                {mainChapters.length === 0 && (
                    <p style={styles.empty}>Noch keine Kapitel</p>
                )}
                <SortableGroup
                    chapters={mainChapters}
                    allChapters={chapters}
                    activeChapterId={activeChapterId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onReorder={onReorder}
                />

                {/* Back Matter */}
                {backMatter.length > 0 && (
                    <>
                        <div style={styles.sectionHeader}>
                            <span style={styles.listLabel}>Back Matter</span>
                        </div>
                        <SortableGroup
                            chapters={backMatter}
                            allChapters={chapters}
                            activeChapterId={activeChapterId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onReorder={onReorder}
                        />
                    </>
                )}
            </div>

            {/* Actions */}
            <div style={styles.exportSection}>
                <button
                    style={{...styles.exportBtn, ...(showMetadata ? styles.exportBtnActive : {}), marginBottom: 6}}
                    onClick={onMetadata}
                >
                    <FileText size={14}/> Metadaten
                </button>
                {hasToc && onValidateToc && (
                    <button
                        style={{...styles.exportBtn, marginBottom: 6}}
                        onClick={onValidateToc}
                    >
                        <ListChecks size={14}/> TOC prüfen
                    </button>
                )}
                <Tooltip content={chapters.length === 0 ? "Erstelle zuerst ein Kapitel" : "Buch exportieren"}>
                    <button
                        style={{...styles.exportBtn, ...(chapters.length === 0 ? styles.btnDisabled : {})}}
                        onClick={onExport}
                        disabled={chapters.length === 0}
                    >
                        <Download size={14}/> Exportieren...
                    </button>
                </Tooltip>
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
    manuscriptHeader: {
        padding: "12px 16px 0",
    },
    manuscriptTitle: {
        fontFamily: "var(--font-display)", fontSize: "0.8125rem", fontWeight: 600,
        color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em",
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
        transition: "background 150ms", marginBottom: 2,
        background: "transparent",
    },
    itemActive: { background: "rgba(255,255,255,0.1)", color: "#faf8f5" },
    itemDragging: { opacity: 0.5, background: "rgba(255,255,255,0.05)" },
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
    exportBtnActive: {
        background: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.15)",
    },
    btnDisabled: {
        opacity: 0.3, cursor: "not-allowed",
    },
};
