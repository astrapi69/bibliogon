import React, { useState, useRef, useEffect } from "react";
import { Chapter, ChapterType } from "../api/client";
import { useI18n } from "../hooks/useI18n";
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
  BookmarkPlus,
  History,
  GitBranch,
  BookOpen,
  LayoutGrid,
  Table,
  Network,
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
import { CSS } from "@dnd-kit/utilities";
import EditableTitle from "./EditableTitle";
import styles from "./ChapterSidebar.module.css";

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
  /** Opens the Story Bible side panel (plugin-story-bible). When
   *  provided (plugin active), the Actions footer shows a
   *  "Story-Bibel" button alongside Metadaten — replacing the old
   *  free-floating right-edge tab. Undef -> button hidden. */
  onStoryBible?: () => void;
  /** True while the Story Bible panel is open (active styling). */
  storyBibleActive?: boolean;
  /** Opens the prose Storyboard (chapter-card grid). Shown for all
   *  chapter-based books (STORY-BIBLE-STORYBOARD-INTEGRATION-01 C3). */
  onShowStoryboard?: () => void;
  /** True while the prose Storyboard is open (active styling). */
  storyboardActive?: boolean;
  /** Opens the Outliner (spreadsheet) view (CHAPTER-OUTLINER-VIEW-01). */
  onShowOutline?: () => void;
  /** True while the Outliner is open (active styling). */
  outlineActive?: boolean;
  /** Opens the Story Bible relationship graph
   *  (STORY-BIBLE-RELATIONSHIP-GRAPH-01). Only set when the Story
   *  Bible plugin is available. */
  onShowRelationships?: () => void;
  /** True while the relationship graph is open (active styling). */
  relationshipsActive?: boolean;
  onValidateToc?: () => void;
  onSaveAsTemplate?: () => void;
  onAddFromTemplate?: () => void;
  onSaveAsChapterTemplate?: (chapterId: string) => void;
  onShowVersions?: (chapterId: string) => void;
  onGitBackup?: () => void;
  /** Optional action rendered in the sidebar's button column (the
   *  "Take offline" toggle, mobile-sync P3-C3). Generic slot so the
   *  sidebar stays decoupled from the offline storage layer. */
  offlineSlot?: React.ReactNode;
  gitSyncState?: string | null;
  onGitSync?: () => void;
  /** When True, the book has a plugin-git-sync mapping; the
   *  sidebar shows the "Sync zum Repo" button. False/undef -> hide. */
  gitSyncMapped?: boolean;
  showMetadata: boolean;
  hasToc: boolean;
  /** ARTICLE-TITLE-INLINE-EDIT-01 C1: persist a new book title from
   *  the sidebar header (prose flow). When provided, the book-title
   *  h2 becomes an EditableTitle (pencil-toggle); the parent
   *  (BookEditor) runs api.books.update. Optional so ChapterSidebar
   *  unit-tests standalone (falls back to a static h2). */
  onTitleSave?: (newTitle: string) => void | Promise<void>;
  /** C2: when true (book status published/archived), the sidebar
   *  title edit shows a published-work warning before editing. */
  titlePublished?: boolean;
}

const FRONT_MATTER_TYPES: ChapterType[] = [
  "toc",
  "dedication",
  "epigraph",
  "preface",
  "foreword",
  "prologue",
  "introduction",
];
const BACK_MATTER_TYPES: ChapterType[] = [
  "epilogue",
  "afterword",
  "final_thoughts",
  "about_author",
  "acknowledgments",
  "appendix",
  "bibliography",
  "endnotes",
  "glossary",
  "index",
  "imprint",
  "also_by_author",
  "next_in_series",
  "excerpt",
  "call_to_action",
];
const STRUCTURE_TYPES: ChapterType[] = ["part", "part_intro", "interlude"];

// TYPE_LABELS are now loaded from i18n inside the component via useI18n

// --- Sortable Chapter Item ---

const SortableChapterItem = React.memo(function SortableChapterItem({
  chapter,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onSaveAsChapterTemplate,
  onShowVersions,
  typeLabels,
  deleteLabel,
  renameLabel,
  saveTemplateLabel,
  historyLabel,
}: {
  chapter: Chapter;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onSaveAsChapterTemplate?: (id: string) => void;
  onShowVersions?: (id: string) => void;
  typeLabels: Record<ChapterType, string>;
  deleteLabel: string;
  renameLabel: string;
  saveTemplateLabel: string;
  historyLabel: string;
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
  } = useSortable({ id: chapter.id });

  const className = [
    styles.item,
    isActive ? styles.itemActive : "",
    isDragging ? styles.itemDragging : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const itemContent = (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      data-testid={`chapter-item-${chapter.id}`}
      role="button"
      tabIndex={0}
      onClick={() => !editing && onSelect(chapter.id)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !editing) {
          e.preventDefault();
          onSelect(chapter.id);
        }
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ display: "flex", cursor: "grab" }}
        data-testid={`drag-handle-${chapter.id}`}
      >
        <GripVertical size={14} style={{ flexShrink: 0, opacity: 0.3 }} />
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
          className={styles.renameInput}
        />
      ) : (
        <span
          className={styles.itemTitle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditValue(chapter.title);
            setEditing(true);
          }}
        >
          {chapter.chapter_type !== "chapter" && (
            <span className={styles.typeTag}>
              {typeLabels[chapter.chapter_type]}
            </span>
          )}
          {chapter.title}
        </span>
      )}
      {!editing && (
        <Tooltip content={deleteLabel} side="right">
          <button
            className={`btn-sidebar-icon ${styles.deleteReveal}`}
            data-testid={`chapter-delete-${chapter.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(chapter.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{itemContent}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="chapter-dropdown-content">
          <ContextMenu.Item
            className="chapter-dropdown-item"
            onSelect={() => {
              setEditValue(chapter.title);
              setEditing(true);
            }}
          >
            <Pencil size={12} style={{ marginRight: 6 }} /> {renameLabel}
          </ContextMenu.Item>
          {onSaveAsChapterTemplate && (
            <ContextMenu.Item
              className="chapter-dropdown-item"
              data-testid={`chapter-context-save-template-${chapter.id}`}
              onSelect={() => onSaveAsChapterTemplate(chapter.id)}
            >
              <BookmarkPlus size={12} style={{ marginRight: 6 }} />{" "}
              {saveTemplateLabel}
            </ContextMenu.Item>
          )}
          {onShowVersions && (
            <ContextMenu.Item
              className="chapter-dropdown-item"
              data-testid={`chapter-context-history-${chapter.id}`}
              onSelect={() => onShowVersions(chapter.id)}
            >
              <History size={12} style={{ marginRight: 6 }} /> {historyLabel}
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="chapter-dropdown-separator" />
          <ContextMenu.Item
            className="chapter-dropdown-item chapter-dropdown-item-danger"
            onSelect={() => onDelete(chapter.id)}
          >
            <Trash2 size={12} style={{ marginRight: 6 }} /> {deleteLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

// --- Sortable Group ---

function SortableGroup({
  chapters,
  allChapters,
  activeChapterId,
  onSelect,
  onDelete,
  onRename,
  onSaveAsChapterTemplate,
  onShowVersions,
  onReorder,
  typeLabels,
  deleteLabel,
  renameLabel,
  saveTemplateLabel,
  historyLabel,
}: {
  chapters: Chapter[];
  allChapters: Chapter[];
  activeChapterId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onSaveAsChapterTemplate?: (id: string) => void;
  onShowVersions?: (id: string) => void;
  onReorder: (chapterIds: string[]) => void;
  typeLabels: Record<ChapterType, string>;
  deleteLabel: string;
  renameLabel: string;
  saveTemplateLabel: string;
  historyLabel: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const groupIds = chapters.map((ch) => ch.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
        {chapters.map((ch) => (
          <SortableChapterItem
            key={ch.id}
            chapter={ch}
            isActive={ch.id === activeChapterId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
            onSaveAsChapterTemplate={onSaveAsChapterTemplate}
            onShowVersions={onShowVersions}
            typeLabels={typeLabels}
            deleteLabel={deleteLabel}
            renameLabel={renameLabel}
            saveTemplateLabel={saveTemplateLabel}
            historyLabel={historyLabel}
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
  onStoryBible,
  storyBibleActive,
  onShowStoryboard,
  storyboardActive,
  onShowOutline,
  outlineActive,
  onShowRelationships,
  relationshipsActive,
  onValidateToc,
  onSaveAsTemplate,
  onAddFromTemplate,
  onSaveAsChapterTemplate,
  onShowVersions,
  onGitBackup,
  offlineSlot,
  gitSyncState,
  onGitSync,
  gitSyncMapped,
  showMetadata,
  hasToc,
  onTitleSave,
  titlePublished,
}: Props) {
  const frontMatter = chapters.filter((ch) =>
    FRONT_MATTER_TYPES.includes(ch.chapter_type),
  );
  const mainChapters = chapters.filter(
    (ch) =>
      ch.chapter_type === "chapter" ||
      STRUCTURE_TYPES.includes(ch.chapter_type),
  );
  const backMatter = chapters.filter((ch) =>
    BACK_MATTER_TYPES.includes(ch.chapter_type),
  );

  const { t } = useI18n();
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
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside className={styles.sidebar} data-testid="chapter-sidebar">
      {/* Header */}
      <div className={styles.header} data-testid="chapter-sidebar-header">
        <Tooltip
          content={t("ui.sidebar.back_to_dashboard", "Zurück zum Dashboard")}
        >
          <button
            className="btn-sidebar-icon"
            onClick={onBack}
            data-testid="chapter-sidebar-back"
          >
            <ChevronLeft size={18} />
          </button>
        </Tooltip>
        {onTitleSave ? (
          <EditableTitle
            value={bookTitle}
            onSave={onTitleSave}
            testIdPrefix="book-editor-title"
            textClassName={styles.bookTitle}
            isPublished={titlePublished}
          />
        ) : (
          <h2 className={styles.bookTitle} title={bookTitle}>
            {bookTitle}
          </h2>
        )}
        <div style={{ marginLeft: "auto" }}>
          <ThemeToggle variant="dark" />
        </div>
      </div>

      <div className={styles.manuscriptHeader}>
        <span className={styles.manuscriptTitle}>
          {t("ui.sidebar.manuscript", "Manuskript")}
        </span>
      </div>

      <div className={styles.list} data-testid="chapter-sidebar-list">
        {/* Add button with dropdown */}
        <div
          className={styles.sectionHeader}
          style={{ justifyContent: "space-between" }}
        >
          <span className={styles.listLabel}>
            {t("ui.sidebar.content", "Inhalt")}
          </span>
          <DropdownMenu.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
            <Tooltip
              content={t("ui.sidebar.add_chapter", "Kapitel hinzufügen")}
            >
              <DropdownMenu.Trigger asChild>
                <button
                  className="btn-sidebar-icon"
                  data-testid="chapter-add-trigger"
                >
                  <Plus size={14} />
                </button>
              </DropdownMenu.Trigger>
            </Tooltip>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="chapter-dropdown-content"
                align="end"
                sideOffset={4}
                collisionPadding={{ top: 16, bottom: 280, left: 16, right: 16 }}
                data-testid="chapter-add-dropdown"
              >
                <DropdownMenu.Label className="chapter-dropdown-label">
                  {t("ui.sidebar.front_matter", "Front Matter")}
                </DropdownMenu.Label>
                {FRONT_MATTER_TYPES.map((t) => (
                  <DropdownMenu.Item
                    key={t}
                    className="chapter-dropdown-item"
                    data-testid="chapter-dropdown-item"
                    onSelect={() => onAdd(t)}
                  >
                    {TYPE_LABELS[t]}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="chapter-dropdown-separator" />
                <DropdownMenu.Label className="chapter-dropdown-label">
                  {t("ui.sidebar.chapters", "Kapitel")}
                </DropdownMenu.Label>
                <DropdownMenu.Item
                  className="chapter-dropdown-item"
                  data-testid="chapter-dropdown-item"
                  onSelect={() => onAdd("chapter")}
                >
                  {t("ui.editor.new_chapter", "Neues Kapitel")}
                </DropdownMenu.Item>
                {onAddFromTemplate && (
                  <DropdownMenu.Item
                    className="chapter-dropdown-item"
                    data-testid="chapter-dropdown-from-template"
                    onSelect={onAddFromTemplate}
                  >
                    {t("ui.editor.new_chapter_from_template", "Aus Vorlage...")}
                  </DropdownMenu.Item>
                )}
                {STRUCTURE_TYPES.map((t) => (
                  <DropdownMenu.Item
                    key={t}
                    className="chapter-dropdown-item"
                    data-testid="chapter-dropdown-item"
                    onSelect={() => onAdd(t)}
                  >
                    {TYPE_LABELS[t]}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="chapter-dropdown-separator" />
                <DropdownMenu.Label className="chapter-dropdown-label">
                  {t("ui.sidebar.back_matter", "Back Matter")}
                </DropdownMenu.Label>
                {BACK_MATTER_TYPES.map((t) => (
                  <DropdownMenu.Item
                    key={t}
                    className="chapter-dropdown-item"
                    data-testid="chapter-dropdown-item"
                    onSelect={() => onAdd(t)}
                  >
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
            <div className={styles.sectionHeader}>
              <button
                className="btn-sidebar-icon"
                onClick={() => toggleSection("front")}
              >
                {collapsedSections.front ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
              <span className={styles.listLabel}>
                {t("ui.sidebar.front_matter", "Front Matter")}
              </span>
              <span className={styles.sectionCount}>{frontMatter.length}</span>
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
                onSaveAsChapterTemplate={onSaveAsChapterTemplate}
                onShowVersions={onShowVersions}
                typeLabels={TYPE_LABELS}
                deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
                renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
                saveTemplateLabel={t(
                  "ui.sidebar.chapter_save_as_template",
                  "Als Vorlage speichern",
                )}
                historyLabel={t("ui.versions.menu_item", "Versionsverlauf")}
              />
            )}
          </>
        )}

        {/* Main Chapters */}
        <div className={styles.sectionHeader}>
          <button
            className="btn-sidebar-icon"
            onClick={() => toggleSection("chapters")}
          >
            {collapsedSections.chapters ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
          <span className={styles.listLabel}>
            {t("ui.sidebar.chapters", "Kapitel")}
          </span>
          <span className={styles.sectionCount}>{mainChapters.length}</span>
        </div>
        {!collapsedSections.chapters && (
          <>
            {mainChapters.length === 0 && (
              <p className={styles.empty}>
                {t("ui.sidebar.no_chapters", "Noch keine Kapitel")}
              </p>
            )}
            <SortableGroup
              chapters={mainChapters}
              allChapters={chapters}
              activeChapterId={activeChapterId}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onReorder={onReorder}
              onSaveAsChapterTemplate={onSaveAsChapterTemplate}
              onShowVersions={onShowVersions}
              typeLabels={TYPE_LABELS}
              deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
              renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
              saveTemplateLabel={t(
                "ui.sidebar.chapter_save_as_template",
                "Als Vorlage speichern",
              )}
              historyLabel={t("ui.versions.menu_item", "Versionsverlauf")}
            />
          </>
        )}

        {/* Back Matter */}
        {backMatter.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <button
                className="btn-sidebar-icon"
                onClick={() => toggleSection("back")}
              >
                {collapsedSections.back ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
              </button>
              <span className={styles.listLabel}>
                {t("ui.sidebar.back_matter", "Back Matter")}
              </span>
              <span className={styles.sectionCount}>{backMatter.length}</span>
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
                onSaveAsChapterTemplate={onSaveAsChapterTemplate}
                onShowVersions={onShowVersions}
                typeLabels={TYPE_LABELS}
                deleteLabel={t("ui.sidebar.delete_chapter", "Kapitel löschen")}
                renameLabel={t("ui.sidebar.rename_chapter", "Umbenennen")}
                saveTemplateLabel={t(
                  "ui.sidebar.chapter_save_as_template",
                  "Als Vorlage speichern",
                )}
                historyLabel={t("ui.versions.menu_item", "Versionsverlauf")}
              />
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div
        className={styles.exportSection}
        data-testid="chapter-sidebar-footer"
      >
        <button
          className={`btn-sidebar-block ${showMetadata ? "is-active" : ""}`}
          style={{ marginBottom: 6 }}
          onClick={onMetadata}
        >
          <FileText size={14} /> {t("ui.sidebar.metadata", "Metadaten")}
        </button>
        {onShowStoryboard && (
          <button
            className={`btn-sidebar-block ${storyboardActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowStoryboard}
            data-testid="chapter-sidebar-storyboard"
            title={t("ui.storyboard.open", "Storyboard öffnen")}
          >
            <LayoutGrid size={14} /> {t("ui.storyboard.title", "Storyboard")}
          </button>
        )}
        {onShowOutline && (
          <button
            className={`btn-sidebar-block ${outlineActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowOutline}
            data-testid="chapter-sidebar-outline"
            title={t("ui.outliner.open", "Outliner öffnen")}
          >
            <Table size={14} /> {t("ui.outliner.title", "Outliner")}
          </button>
        )}
        {onStoryBible && (
          <button
            className={`btn-sidebar-block ${storyBibleActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onStoryBible}
            data-testid="story-bible-toggle"
            title={t("ui.story_bible.open", "Story-Bibel öffnen")}
          >
            <BookOpen size={14} />{" "}
            {t("ui.story_bible.sidebar_button", "Story-Bibel")}
          </button>
        )}
        {onShowRelationships && (
          <button
            className={`btn-sidebar-block ${relationshipsActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowRelationships}
            data-testid="chapter-sidebar-relationships"
            title={t("ui.relationship_graph.open", "Beziehungsgraph öffnen")}
          >
            <Network size={14} />{" "}
            {t("ui.relationship_graph.title", "Beziehungsgraph")}
          </button>
        )}
        {offlineSlot}
        {onGitBackup && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6, position: "relative" }}
            onClick={onGitBackup}
            data-testid="sidebar-git-backup"
            data-git-sync-state={gitSyncState ?? ""}
            title={gitSyncStateLabel(gitSyncState, t)}
          >
            <GitBranch size={14} />{" "}
            {t("ui.sidebar.git_backup", "Git-Sicherung")}
            {gitSyncState &&
              ["remote_ahead", "diverged"].includes(gitSyncState) && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent)",
                  }}
                  data-testid="sidebar-git-sync-dot"
                />
              )}
          </button>
        )}
        {gitSyncMapped && onGitSync && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6 }}
            onClick={onGitSync}
            data-testid="sidebar-git-sync"
            title={t(
              "ui.git_sync.sidebar_tooltip",
              "Buchstand in das verbundene Git-Repository commiten",
            )}
          >
            <GitBranch size={14} /> {t("ui.sidebar.git_sync", "Sync zum Repo")}
          </button>
        )}
        {hasToc && onValidateToc && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6 }}
            onClick={onValidateToc}
          >
            <ListChecks size={14} />{" "}
            {t("ui.sidebar.toc_validate", "TOC prüfen")}
          </button>
        )}
        {onSaveAsTemplate && (
          <Tooltip
            content={
              chapters.length === 0
                ? t(
                    "ui.sidebar.save_template_disabled",
                    "Erstelle zuerst ein Kapitel",
                  )
                : t(
                    "ui.sidebar.save_template_tooltip",
                    "Buchstruktur als wiederverwendbare Vorlage speichern",
                  )
            }
          >
            <button
              className="btn-sidebar-block"
              style={{ marginBottom: 6 }}
              onClick={onSaveAsTemplate}
              disabled={chapters.length === 0}
              data-testid="sidebar-save-as-template"
            >
              <BookmarkPlus size={14} />{" "}
              {t("ui.sidebar.save_as_template", "Als Vorlage speichern")}
            </button>
          </Tooltip>
        )}
        <Tooltip
          content={
            chapters.length === 0
              ? t("ui.sidebar.export_disabled", "Erstelle zuerst ein Kapitel")
              : t("ui.sidebar.export_book", "Buch exportieren")
          }
        >
          <button
            className="btn-sidebar-block"
            onClick={onExport}
            disabled={chapters.length === 0}
          >
            <Download size={14} /> {t("ui.sidebar.export", "Exportieren...")}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

function gitSyncStateLabel(
  state: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  switch (state) {
    case "in_sync":
      return t("ui.git.in_sync", "synchron");
    case "local_ahead":
      return t("ui.git.local_ahead", "lokal vorne");
    case "remote_ahead":
      return t("ui.git.remote_ahead", "Remote hat Änderungen");
    case "diverged":
      return t("ui.git.diverged_short", "divergiert");
    case "never_synced":
      return t("ui.git.never_synced", "noch nicht synchronisiert");
    default:
      return t("ui.sidebar.git_backup", "Git-Sicherung");
  }
}
