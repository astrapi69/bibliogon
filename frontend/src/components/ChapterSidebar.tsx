import {useState, useRef, useEffect} from "react";
import {Chapter, ChapterType} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    Download,
    FileText,
    ListChecks,
    Pencil,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
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
    onRename: (id: string, newTitle: string) => void;
    onBack: () => void;
    onExport: () => void;
    onReorder: (chapterIds: string[]) => void;
    onMetadata: () => void;
    onValidateToc?: () => void;
    showMetadata: boolean;
    hasToc: boolean;
}

const FRONT_MATTER_TYPES: ChapterType[] = [
    "toc", "dedication", "epigraph", "preface", "foreword", "prologue", "introduction",
];
const BACK_MATTER_TYPES: ChapterType[] = [
    "epilogue", "afterword", "final_thoughts", "about_author", "acknowledgments",
    "appendix", "bibliography", "endnotes", "glossary", "index", "imprint",
    "also_by_author", "next_in_series", "excerpt", "call_to_action",
];
const STRUCTURE_TYPES: ChapterType[] = ["part", "part_intro", "interlude"];

// TYPE_LABELS are now loaded from i18n inside the component via useI18n

// --- Sortable Chapter Item ---

function SortableChapterItem({chapter, isActive, onSelect, onDelete, onRename, typeLabels, deleteLabel, renameLabel}: {
    chapter: Chapter;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, newTitle: string) => void;
    typeLabels: Record<ChapterType, string>;
    deleteLabel: string;
    renameLabel: string;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(chapter.title);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const commitRename = () => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== chapter.title) {
            onRename(chapter.id, trimmed);
        }
        setEditing(false);
    };

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

    const itemContent = (
        <div ref={setNodeRef} style={style} onClick={() => !editing && onSelect(chapter.id)}>
            <span {...attributes} {...listeners} style={{display: "flex", cursor: "grab"}}>
                <GripVertical size={14} style={{flexShrink: 0, opacity: 0.3}}/>
            </span>
            {editing ? (
                <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") {
                            setEditValue(chapter.title);
                            setEditing(false);
                        }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={styles.renameInput}
                />
            ) : (
                <span style={styles.itemTitle} onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditValue(chapter.title);
                    setEditing(true);
                }}>
                    {chapter.chapter_type !== "chapter" && (
                        <span style={styles.typeTag}>{typeLabels[chapter.chapter_type]}</span>
                    )}
                    {chapter.title}
                </span>
            )}
            {!editing && (
                <Tooltip content={deleteLabel} side="right">
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
            )}
        </div>
    );

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
                {itemContent}
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
                <ContextMenu.Content className="chapter-dropdown-content">
                    <ContextMenu.Item className="chapter-dropdown-item" onSelect={() => {
                        setEditValue(chapter.title);
                        setEditing(true);
                    }}>
                        <Pencil size={12} style={{marginRight: 6}}/> {renameLabel}
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="chapter-dropdown-separator"/>
                    <ContextMenu.Item className="chapter-dropdown-item chapter-dropdown-item-danger" onSelect={() => onDelete(chapter.id)}>
                        <Trash2 size={12} style={{marginRight: 6}}/> {deleteLabel}
                    </ContextMenu.Item>
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
}

// --- Sortable Group ---

function SortableGroup({chapters, allChapters, activeChapterId, onSelect, onDelete, onRename, onReorder, typeLabels, deleteLabel, renameLabel}: {
    chapters: Chapter[];
    allChapters: Chapter[];
    activeChapterId: string | null;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, newTitle: string) => void;
    onReorder: (chapterIds: string[]) => void;
    typeLabels: Record<ChapterType, string>;
    deleteLabel: string;
    renameLabel: string;
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
                        onRename={onRename}
                        typeLabels={typeLabels}
                        deleteLabel={deleteLabel}
                        renameLabel={renameLabel}
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
                                           onRename,
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

    const {t} = useI18n();
    const TYPE_LABELS: Record<ChapterType, string> = {
        chapter: t("ui.chapter_types.chapter", "Kapitel"),
        preface: t("ui.chapter_types.preface", "Vorwort"),
        foreword: t("ui.chapter_types.foreword", "Geleitwort"),
        acknowledgments: t("ui.chapter_types.acknowledgments", "Danksagung"),
        about_author: t("ui.chapter_types.about_author", "Über den Autor"),
        appendix: t("ui.chapter_types.appendix", "Anhang"),
        bibliography: t("ui.chapter_types.bibliography", "Literatur"),
        glossary: t("ui.chapter_types.glossary", "Glossar"),
        epilogue: t("ui.chapter_types.epilogue", "Epilog"),
        imprint: t("ui.chapter_types.imprint", "Impressum"),
        next_in_series: t("ui.chapter_types.next_in_series", "Nächster Band"),
        part: t("ui.chapter_types.part", "Teil"),
        part_intro: t("ui.chapter_types.part_intro", "Teil-Einleitung"),
        dedication: t("ui.chapter_types.dedication", "Widmung"),
        prologue: t("ui.chapter_types.prologue", "Prolog"),
        introduction: t("ui.chapter_types.introduction", "Einleitung"),
        afterword: t("ui.chapter_types.afterword", "Nachwort"),
        final_thoughts: t("ui.chapter_types.final_thoughts", "Schlussgedanken"),
        index: t("ui.chapter_types.index", "Stichwortverzeichnis"),
        epigraph: t("ui.chapter_types.epigraph", "Motto"),
        endnotes: t("ui.chapter_types.endnotes", "Endnoten"),
        interlude: t("ui.chapter_types.interlude", "Interludium"),
        toc: t("ui.chapter_types.toc", "Inhaltsverzeichnis"),
        also_by_author: t("ui.chapter_types.also_by_author", "Weitere Bücher"),
        excerpt: t("ui.chapter_types.excerpt", "Leseprobe"),
        call_to_action: t("ui.chapter_types.call_to_action", "Aufruf zur Aktion"),
    };

    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    const toggleSection = (key: string) => {
        setCollapsedSections((prev) => ({...prev, [key]: !prev[key]}));
    };

    return (
        <aside style={styles.sidebar} data-testid="chapter-sidebar">
            {/* Header */}
            <div style={styles.header} data-testid="chapter-sidebar-header">
                <Tooltip content={t("ui.sidebar.back_to_dashboard", "Zurück zum Dashboard")}>
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
                <span style={styles.manuscriptTitle}>{t("ui.sidebar.manuscript", "Manuskript")}</span>
            </div>

            <div style={styles.list} data-testid="chapter-sidebar-list">
                {/* Add button with dropdown */}
                <div style={{...styles.sectionHeader, justifyContent: "space-between"}}>
                    <span style={styles.listLabel}>{t("ui.sidebar.content", "Inhalt")}</span>
                    <DropdownMenu.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
                        <Tooltip content={t("ui.sidebar.add_chapter", "Kapitel hinzufügen")}>
                            <DropdownMenu.Trigger asChild>
                                <button style={styles.addBtn} data-testid="chapter-add-trigger">
                                    <Plus size={14}/>
                                </button>
                            </DropdownMenu.Trigger>
                        </Tooltip>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                className="chapter-dropdown-content"
                                align="end"
                                sideOffset={4}
                                collisionPadding={16}
                                data-testid="chapter-add-dropdown"
                            >
                                <DropdownMenu.Label className="chapter-dropdown-label">{t("ui.sidebar.front_matter", "Front Matter")}</DropdownMenu.Label>
                                {FRONT_MATTER_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" data-testid="chapter-dropdown-item" onSelect={() => onAdd(t)}>
                                        {TYPE_LABELS[t]}
                                    </DropdownMenu.Item>
                                ))}
                                <DropdownMenu.Separator className="chapter-dropdown-separator"/>
                                <DropdownMenu.Label className="chapter-dropdown-label">{t("ui.sidebar.chapters", "Kapitel")}</DropdownMenu.Label>
                                <DropdownMenu.Item
                                    className="chapter-dropdown-item"
                                    data-testid="chapter-dropdown-item"
                                    onSelect={() => onAdd("chapter")}
                                >
                                    {t("ui.editor.new_chapter", "Neues Kapitel")}
                                </DropdownMenu.Item>
                                {STRUCTURE_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" data-testid="chapter-dropdown-item" onSelect={() => onAdd(t)}>
                                        {TYPE_LABELS[t]}
                                    </DropdownMenu.Item>
                                ))}
                                <DropdownMenu.Separator className="chapter-dropdown-separator"/>
                                <DropdownMenu.Label className="chapter-dropdown-label">{t("ui.sidebar.back_matter", "Back Matter")}</DropdownMenu.Label>
                                {BACK_MATTER_TYPES.map((t) => (
                                    <DropdownMenu.Item key={t} className="chapter-dropdown-item" data-testid="chapter-dropdown-item" onSelect={() => onAdd(t)}>
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
                            <button style={styles.collapseBtn} onClick={() => toggleSection("front")}>
                                {collapsedSections.front ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
                            </button>
                            <span style={styles.listLabel}>{t("ui.sidebar.front_matter", "Front Matter")}</span>
                            <span style={styles.sectionCount}>{frontMatter.length}</span>
                        </div>
                        {!collapsedSections.front && (
                            <SortableGroup
                                chapters={frontMatter}
                                allChapters={chapters}
                                activeChapterId={activeChapterId}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                onRename={onRename}
                                onReorder={onReorder}
                                typeLabels={TYPE_LABELS}
                                deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
                                renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
                            />
                        )}
                    </>
                )}

                {/* Main Chapters */}
                <div style={styles.sectionHeader}>
                    <button style={styles.collapseBtn} onClick={() => toggleSection("chapters")}>
                        {collapsedSections.chapters ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
                    </button>
                    <span style={styles.listLabel}>{t("ui.sidebar.chapters", "Kapitel")}</span>
                    <span style={styles.sectionCount}>{mainChapters.length}</span>
                </div>
                {!collapsedSections.chapters && (
                    <>
                        {mainChapters.length === 0 && (
                            <p style={styles.empty}>{t("ui.sidebar.no_chapters", "Noch keine Kapitel")}</p>
                        )}
                        <SortableGroup
                            chapters={mainChapters}
                            allChapters={chapters}
                            activeChapterId={activeChapterId}
                            onSelect={onSelect}
                            onDelete={onDelete}
                            onRename={onRename}
                            onReorder={onReorder}
                            typeLabels={TYPE_LABELS}
                            deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
                            renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
                        />
                    </>
                )}

                {/* Back Matter */}
                {backMatter.length > 0 && (
                    <>
                        <div style={styles.sectionHeader}>
                            <button style={styles.collapseBtn} onClick={() => toggleSection("back")}>
                                {collapsedSections.back ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
                            </button>
                            <span style={styles.listLabel}>{t("ui.sidebar.back_matter", "Back Matter")}</span>
                            <span style={styles.sectionCount}>{backMatter.length}</span>
                        </div>
                        {!collapsedSections.back && (
                            <SortableGroup
                                chapters={backMatter}
                                allChapters={chapters}
                                activeChapterId={activeChapterId}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                onRename={onRename}
                                onReorder={onReorder}
                                typeLabels={TYPE_LABELS}
                                deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
                                renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
                            />
                        )}
                    </>
                )}
            </div>

            {/* Actions */}
            <div style={styles.exportSection} data-testid="chapter-sidebar-footer">
                <button
                    style={{...styles.exportBtn, ...(showMetadata ? styles.exportBtnActive : {}), marginBottom: 6}}
                    onClick={onMetadata}
                >
                    <FileText size={14}/> {t("ui.sidebar.metadata", "Metadaten")}
                </button>
                {hasToc && onValidateToc && (
                    <button
                        style={{...styles.exportBtn, marginBottom: 6}}
                        onClick={onValidateToc}
                    >
                        <ListChecks size={14}/> {t("ui.sidebar.toc_validate", "TOC prüfen")}
                    </button>
                )}
                <Tooltip content={chapters.length === 0 ? t("ui.sidebar.export_disabled", "Erstelle zuerst ein Kapitel") : t("ui.sidebar.export_book", "Buch exportieren")}>
                    <button
                        style={{...styles.exportBtn, ...(chapters.length === 0 ? styles.btnDisabled : {})}}
                        onClick={onExport}
                        disabled={chapters.length === 0}
                    >
                        <Download size={14}/> {t("ui.sidebar.export", "Exportieren...")}
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
        flexShrink: 0,
    },
    manuscriptTitle: {
        fontFamily: "var(--font-display)", fontSize: "0.8125rem", fontWeight: 600,
        color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em",
    },
    header: {
        padding: "16px 12px 12px", display: "flex", alignItems: "center", gap: 6,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
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
        padding: "16px 16px 8px", display: "flex", alignItems: "center", gap: 4,
    },
    collapseBtn: {
        background: "none", border: "none", color: "rgba(255,255,255,0.35)",
        cursor: "pointer", padding: 2, borderRadius: 3, display: "flex", alignItems: "center",
        flexShrink: 0,
    },
    sectionCount: {
        fontSize: "0.625rem", color: "rgba(255,255,255,0.25)",
        marginLeft: "auto",
    },
    listLabel: {
        fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase" as const,
        letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)",
    },
    addBtn: {
        background: "rgba(255,255,255,0.08)", border: "none", color: "var(--text-sidebar)",
        cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
    },
    // minHeight: 0 is mandatory for flexbox scrolling. Without it, the
    // flex child defaults to min-height: auto and expands to its
    // intrinsic content height, silently defeating overflow-y: auto.
    list: { flex: 1, minHeight: 0, overflowY: "auto" as const, padding: "0 8px" },
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
    renameInput: {
        flex: 1, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
        color: "#faf8f5", fontSize: "0.875rem", padding: "2px 6px", borderRadius: 4,
        outline: "none", fontFamily: "var(--font-body)",
    },
    exportSection: {
        padding: "12px 16px 16px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
    },
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
