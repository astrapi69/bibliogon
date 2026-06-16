import React, { useState } from "react";
import { Chapter, ChapterType } from "../api/client";
import { groupChapters } from "../lib/utils/chapterGroups";
import { SortableGroup } from "./chapter-sidebar/ChapterSortable";
import ChapterAddMenu from "./chapter-sidebar/ChapterAddMenu";
import SidebarToolsGroup from "./chapter-sidebar/SidebarToolsGroup";
import { useI18n } from "../hooks/useI18n";
import { chapterTypeLabels } from "../lib/chapterTypeLabels";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  PanelLeftClose,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import Tooltip from "./Tooltip";
import EditableTitle from "./EditableTitle";
import styles from "./ChapterSidebar.module.css";

interface Props {
  bookTitle: string;
  /** Optional structured editor menu (issue #322), rendered in the header's
   *  right-aligned control cluster (left of the theme toggle). The book editor
   *  passes an `<EditorMenu>` here so all book-level actions are reachable from
   *  one grouped hamburger; omitted, the slot simply renders nothing. */
  headerMenu?: React.ReactNode;
  chapters: Chapter[];
  activeChapterId: string | null;
  onSelect: (id: string) => void;
  onAdd: (chapterType?: ChapterType) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onBack: () => void;
  /** Collapse the sidebar (hide it, freeing the editor width).
   *  Omitted when the surrounding layout has no collapse affordance. */
  onCollapse?: () => void;
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

// FRONT_MATTER_TYPES / BACK_MATTER_TYPES / STRUCTURE_TYPES + the grouping
// splitter live in lib/utils/chapterGroups (Batch 4 god-file split).

// TYPE_LABELS are now loaded from i18n inside the component via useI18n

// --- Main Sidebar ---

export default function ChapterSidebar({
  bookTitle,
  headerMenu,
  chapters,
  activeChapterId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
  onBack,
  onCollapse,
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
  const { frontMatter, mainChapters, backMatter } = groupChapters(chapters);

  const { t } = useI18n();
  const TYPE_LABELS = chapterTypeLabels(t);

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
            aria-label={t("ui.sidebar.back_to_dashboard", "Zurück zum Dashboard")}
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
        <div style={{ marginLeft: "auto" }} className="flex items-center gap-1">
          {headerMenu}
          <ThemeToggle variant="dark" />
          {onCollapse && (
            <Tooltip
              content={t("ui.sidebar.collapse_sidebar", "Seitenleiste einklappen")}
            >
              <button
                type="button"
                className="btn-sidebar-icon"
                onClick={onCollapse}
                aria-expanded={true}
                aria-label={t(
                  "ui.sidebar.collapse_sidebar",
                  "Seitenleiste einklappen",
                )}
                data-testid="chapter-sidebar-collapse"
              >
                <PanelLeftClose size={18} />
              </button>
            </Tooltip>
          )}
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
          <ChapterAddMenu
            onAdd={onAdd}
            onAddFromTemplate={onAddFromTemplate}
            typeLabels={TYPE_LABELS}
            t={t}
          />
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
        <SidebarToolsGroup
          chapters={chapters}
          onShowStoryboard={onShowStoryboard}
          storyboardActive={storyboardActive}
          onShowOutline={onShowOutline}
          outlineActive={outlineActive}
          onStoryBible={onStoryBible}
          storyBibleActive={storyBibleActive}
          onShowRelationships={onShowRelationships}
          relationshipsActive={relationshipsActive}
          offlineSlot={offlineSlot}
          onGitBackup={onGitBackup}
          gitSyncState={gitSyncState}
          onGitSync={onGitSync}
          gitSyncMapped={gitSyncMapped}
          hasToc={hasToc}
          onValidateToc={onValidateToc}
          onSaveAsTemplate={onSaveAsTemplate}
          t={t}
        />
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
