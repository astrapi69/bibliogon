/**
 * ComicBookEditor — full editor for ``book_type === "comic_book"``
 * books.
 *
 * Comics-Session-2 C6. Replaces the Session-1 placeholder with a
 * working multi-panel + multi-bubble editor that mounts the C5
 * shared comic components (ComicPanelGrid, LayoutConfigComicBubble)
 * + the renamed PdfExportControls in the header.
 *
 * Editing surface:
 * - Header: back button, book title, PdfExportControls, fullscreen
 * - Body: ComicPanelGrid for the active page (selected via the
 *   page-switcher chips below the grid) + panel + bubble action
 *   buttons (Add Panel, Add Bubble, Delete) keyed to the active
 *   selection
 * - Side pane: LayoutConfigComicBubble when a bubble is selected;
 *   instructions otherwise
 *
 * Backend page-CRUD for comic_book is enabled as of PLUGIN-COMICS-
 * SESSION-3-PAGES-CRUD-01 (the pages router relocated from
 * plugin-kinderbuch to backend core and now accepts both
 * picture_book + comic_book). When the book has no pages yet, the
 * empty state surfaces a "Create first comic page" action button
 * that calls ``getStorage().pages.create(bookId, {layout: "comic_panel_grid"})``
 * + refreshes the pages list.
 *
 * The pages/panels/bubbles data lifecycle + all CRUD/drag/move
 * handlers live in ``comics/useComicBookEditor``; this file renders
 * the header + 3-column body from the returned bag.
 */

import { FileText, LayoutGrid, Maximize2, Minimize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../../hooks/useI18n";
import { EditorMenu } from "../../lib/components/EditorMenu";
import { buildComicEditorMenu } from "./buildComicEditorMenu";

import {
  ComicPanelGrid,
  resolveComicGridTemplate,
} from "./ComicPanelGrid";
import { ComicGridTemplatePicker } from "./ComicGridTemplatePicker";
import { LayoutConfigComicBubble } from "./LayoutConfigComicBubble";
import { LayoutConfigComicPanel } from "./LayoutConfigComicPanel";
import { MovePanelToPageMenu } from "./MovePanelToPageMenu";
import { useComicBookEditor } from "./useComicBookEditor";
import PageThumbnails from "../picture-book/PageThumbnails";
import { SidebarToggleButton } from "../SidebarToggleButton";
import { SidebarOverlay } from "../../lib/components/SidebarOverlay";
import PdfExportControls from "../export/PdfExportControls";
import EditableTitle from "../shared/EditableTitle";
import ThemeToggle from "../ThemeToggle";

interface Props {
  bookId: string;
  bookTitle: string;
  onBack: () => void;
  /** COMIC-BOOK-EDITOR-METADATA-BUTTON-01: entry-point into
   *  BookMetadataEditor. Mirrors PageEditor's onShowMetadata prop
   *  (PB-PHASE4 Session 5 Commit 2). When provided, the header
   *  shows a "Metadata" button that calls this callback; the
   *  parent (BookEditor) flips its showMetadata state and
   *  re-renders BookMetadataEditor in place of ComicBookEditor —
   *  same URL-routed pattern as prose + picture-book flows.
   *  Optional so ComicBookEditor stays unit-testable standalone
   *  without a parent that wires it. */
  onShowMetadata?: () => void;
  /** STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1: entry-point
   *  into the Storyboard grid view. Mirrors PageEditor's
   *  onShowStoryboard prop — when provided (book_type in the
   *  storyboard allow-list), the header shows a Storyboard button
   *  that flips ?view=storyboard. Optional so ComicBookEditor stays
   *  unit-testable standalone. */
  onShowStoryboard?: () => void;
  /** ARTICLE-TITLE-INLINE-EDIT-01 C1: persist a new book title. When
   *  provided, the header title becomes an EditableTitle
   *  (pencil-toggle); the parent (BookEditor) runs api.books.update.
   *  Optional so ComicBookEditor unit-tests standalone (falls back to
   *  a static <h1>). */
  onTitleSave?: (title: string) => void | Promise<void>;
  /** C2: gate title edit behind a published-work warning when the
   *  book's status is published or archived. */
  isPublished?: boolean;
}

export default function ComicBookEditor({
  bookId,
  bookTitle,
  onBack,
  onShowMetadata,
  onShowStoryboard,
  onTitleSave,
  isPublished,
}: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    sidebars,
    pluginInfo,
    pluginError,
    pages,
    pagesError,
    pagesLoading,
    activePageId,
    setActivePageId,
    selectedPanelId,
    setSelectedPanelId,
    selectedBubbleId,
    setSelectedBubbleId,
    fullscreen,
    handleAddPage,
    handleReorderPages,
    handleDeletePage,
    handleChangeGridTemplate,
    handleAddPanel,
    handleDeletePanel,
    handleAddBubble,
    handleDeleteBubble,
    handleUpdateBubble,
    handleBubbleDragEnd,
    handleBubbleTailDragEnd,
    handleUpdatePanel,
    handleUploadPanelImage,
    handlePanelReorder,
    loadMoveEntries,
    handleMovePanel,
    assetUrls,
    selectedBubble,
    activePage,
    maxPanels,
    atPanelCapacity,
    panelData,
    selectedPanel,
    panelBubblesMap,
  } = useComicBookEditor(bookId);

  const comicMenu = buildComicEditorMenu({
    t,
    navigate,
    onShowMetadata,
    onShowStoryboard,
    onAddPage: handleAddPage,
    onDeletePage: () => {
      if (activePageId != null) void handleDeletePage(activePageId);
    },
    onAddPanel: handleAddPanel,
    onDeletePanel: handleDeletePanel,
    hasActivePage: activePageId != null,
    canAddPanel: activePageId != null && !atPanelCapacity,
    hasSelectedPanel: selectedPanelId != null,
  });

  return (
    <div
      data-testid="comic-book-editor-root"
      data-book-id={bookId}
      style={{
        margin: "0 auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 1400,
      }}
    >
      <header className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-secondary btn-sm"
          data-testid="comic-book-editor-back"
          onClick={onBack}
        >
          {t("ui.comic_book_editor.back", "Zurück")}
        </button>
        <EditorMenu
          groups={comicMenu.groups}
          onAction={comicMenu.onAction}
          disabled={comicMenu.disabled}
          triggerLabel={t("ui.editor_menu.open", "Menü")}
          testIdPrefix="comic-book-editor-menu"
        />
        {onTitleSave ? (
          <EditableTitle
            value={bookTitle}
            onSave={onTitleSave}
            testIdPrefix="comic-book-editor-title"
            style={{ margin: 0, fontSize: "1.4rem", flex: 1 }}
            isPublished={isPublished}
            headingLevel={1}
          />
        ) : (
          <h1
            data-testid="comic-book-editor-title"
            style={{ margin: 0, fontSize: "1.4rem", flex: 1 }}
          >
            {bookTitle}
          </h1>
        )}
        {/* COMIC-BOOK-EDITOR-METADATA-BUTTON-01 C1: header
         * metadata button. Inline mirror of PageEditor's
         * pattern (RCU 2-site adoption deferred per Q2
         * adjudication; METADATA-BUTTON-COMPONENT-EXTRACT-01
         * P5 pre-registered for 3rd surface). Closes the
         * Half-Wired-Visible-in-Production gap surfaced by
         * EXPOSE-BUCHIDEE-METADATA-01 Track 5. */}
        {onShowMetadata && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="comic-book-editor-show-metadata"
            onClick={onShowMetadata}
            aria-label={t(
              "ui.comic_book_editor.show_metadata",
              "Buch-Metadaten öffnen",
            )}
            title={t(
              "ui.comic_book_editor.show_metadata",
              "Buch-Metadaten öffnen",
            )}
          >
            <FileText size={14} />
          </button>
        )}
        {/* STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1: Storyboard
         * entry-point. Mirrors PageEditor's button + reuses the same
         * i18n key (identical "Storyboard" label). */}
        {onShowStoryboard && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="comic-book-editor-show-storyboard"
            onClick={onShowStoryboard}
            aria-label={t("ui.page_editor.show_storyboard", "Storyboard")}
            title={t("ui.page_editor.show_storyboard", "Storyboard")}
          >
            <LayoutGrid size={14} />
          </button>
        )}
        {activePageId && (
          <ComicGridTemplatePicker
            value={resolveComicGridTemplate(
              (pages.find((p) => p.id === activePageId)
                ?.layout_config as Record<string, unknown> | null) ?? null,
            )}
            onChange={handleChangeGridTemplate}
          />
        )}
        <PdfExportControls bookId={bookId} testidPrefix="comic-book-editor" compact />
        {fullscreen.isSupported && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="comic-book-editor-fullscreen"
            onClick={() => void fullscreen.toggle()}
            aria-pressed={fullscreen.isFullscreen ? "true" : "false"}
            aria-keyshortcuts="F11 Control+Shift+F"
            aria-label={
              fullscreen.isFullscreen
                ? t("ui.editor.exit_fullscreen", "Vollbild verlassen")
                : t("ui.editor.fullscreen", "Vollbild")
            }
            title={
              fullscreen.isFullscreen
                ? t("ui.editor.exit_fullscreen", "Vollbild verlassen")
                : t("ui.editor.fullscreen", "Vollbild")
            }
          >
            {fullscreen.isFullscreen ? (
              <Minimize2 size={14} />
            ) : (
              <Maximize2 size={14} />
            )}
          </button>
        )}
        {/* Cross-editor convention: ThemeToggle is the LAST
         * header item. Matches Dashboard, ArticleEditor,
         * BookEditor (via ChapterSidebar), and PageEditor's
         * post-this-fix ordering. Closes the
         * Parallel-Surface-Asymmetry gap where
         * ComicBookEditor was the only editor without a
         * theme toggle in its header. */}
        <ThemeToggle variant="dark" />
      </header>

      {pluginInfo && (
        <div
          data-testid="comic-book-editor-plugin-info"
          style={{
            fontSize: "0.8rem",
            color: "var(--text-muted)",
          }}
        >
          {pluginInfo.name} v{pluginInfo.version} (session {pluginInfo.session})
        </div>
      )}
      {pluginError && (
        <div
          data-testid="comic-book-editor-plugin-error"
          role="alert"
          style={{ color: "var(--danger, #c00)" }}
        >
          {t(
            "ui.comic_book_editor.plugin_unreachable",
            "Comic-Plugin nicht erreichbar:",
          )}{" "}
          {pluginError}
        </div>
      )}

      {/* PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C1: 3-column
       * layout mirroring PageEditor's thumbnails | canvas |
       * properties shape. PageThumbnails handles both the
       * empty-state ("No pages yet. Click + to add the first
       * page.") AND the populated list via a single unified
       * surface — the prior split empty-state section + chip-
       * nav is replaced. Closes the Half-Wired-Lifecycle-Cascade
       * surfaced by PAGES-CRUD-01 (Add-Page-After-First was
       * never wired). RCU 2-site adoption of PageThumbnails;
       * testidNamespace="comic-book-editor" templates its
       * testids for E2E namespace correctness. */}
      <div
        data-testid="comic-book-editor-body"
        style={{
          position: "relative",
          display: "flex",
          gap: 16,
          minHeight: 480,
        }}
      >
        {/* #109: anchored ABSOLUTE inside the relative editor body
          * (below the header), not fixed to the viewport - the fixed
          * variant sat ON the header and overlapped the back button
          * (left) / ThemeToggle (right). */}
        {!sidebars.left.open && (
          <SidebarToggleButton
            open={false}
            onToggle={sidebars.left.toggle}
            testId="comic-book-editor-thumbnails-toggle"
            className="absolute left-2 top-2 z-[100] bg-card shadow-[var(--shadow-md)]"
          />
        )}
        {!sidebars.right.open && (
          <SidebarToggleButton
            open={false}
            onToggle={sidebars.right.toggle}
            testId="comic-book-editor-side-pane-toggle"
            className="absolute right-2 top-2 z-[100] bg-card shadow-[var(--shadow-md)]"
          />
        )}
        <SidebarOverlay
          open={sidebars.left.open || sidebars.right.open}
          onClose={() => {
            sidebars.left.setOpen(false);
            sidebars.right.setOpen(false);
          }}
          testId="comic-book-editor-sidebar-overlay"
        />
        <div
          data-testid="comic-book-editor-thumbnails-wrapper"
          data-sidebar-open={sidebars.left.open}
          className={[
            "shrink-0 overflow-hidden transition-[width] duration-200",
            "fixed inset-y-0 left-0 z-[90] bg-card shadow-[var(--shadow-md)]",
            "menu:static menu:inset-auto menu:z-auto menu:bg-transparent menu:shadow-none",
            sidebars.left.open ? "w-[220px]" : "w-0",
          ].join(" ")}
        >
          <div className="flex h-full w-[220px] flex-col">
            <div className="flex justify-end p-1">
              <SidebarToggleButton
                open
                onToggle={sidebars.left.toggle}
                testId="comic-book-editor-thumbnails-collapse"
              />
            </div>
            <aside
              data-testid="comic-book-editor-thumbnails"
              className="flex-1"
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                background: "var(--surface-2, #fafafa)",
                minHeight: 400,
                overflow: "auto",
              }}
            >
          <PageThumbnails
            pages={pages}
            activePageId={activePageId}
            onSelect={(pageId) => {
              setActivePageId(pageId);
              setSelectedPanelId(null);
              setSelectedBubbleId(null);
            }}
            onAddPage={handleAddPage}
            addDisabled={pagesLoading}
            onReorder={handleReorderPages}
            onDelete={handleDeletePage}
            testidNamespace="comic-book-editor"
          />
            </aside>
          </div>
        </div>

        <section
          className={[
            !sidebars.left.open ? "pl-14" : "",
            !sidebars.right.open ? "pr-14" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
            flex: 1,
          }}
        >
          {pagesError && (
            <p
              data-testid="comic-book-editor-pages-error"
              role="alert"
              style={{
                color: "var(--danger, #c00)",
                margin: 0,
              }}
            >
              {pagesError}
            </p>
          )}
          {activePageId ? (
            <>
              <div
                data-testid="comic-book-editor-grid-wrapper"
                style={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  border: "1px solid var(--border, #ddd)",
                }}
              >
                <ComicPanelGrid
                  layoutConfig={
                    (activePage?.layout_config as Record<
                      string,
                      unknown
                    > | null) ?? null
                  }
                  panels={panelData}
                  panelBubblesMap={panelBubblesMap}
                  assetUrls={assetUrls}
                  selectedPanelId={selectedPanelId}
                  selectedBubbleId={selectedBubbleId}
                  onPanelClick={(panelId) => {
                    setSelectedPanelId(panelId);
                    setSelectedBubbleId(null);
                  }}
                  onBubbleClick={(bubbleId) => {
                    setSelectedBubbleId(bubbleId);
                  }}
                  onBubbleDragEnd={handleBubbleDragEnd}
                  onBubbleTailDragEnd={handleBubbleTailDragEnd}
                  onPanelReorder={handlePanelReorder}
                  onPanelUploadImage={handleUploadPanelImage}
                />
              </div>

              <div
                data-testid="comic-book-editor-actions"
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="comic-book-editor-add-panel"
                  onClick={handleAddPanel}
                  disabled={!activePageId || atPanelCapacity}
                  title={
                    atPanelCapacity
                      ? `${t(
                          "ui.comic_book_editor.add_panel_at_capacity",
                          "Maximale Panelanzahl für dieses Layout erreicht",
                        )} (${maxPanels})`
                      : undefined
                  }
                  data-at-capacity={atPanelCapacity ? "true" : "false"}
                >
                  {t("ui.comic_book_editor.add_panel", "Panel hinzufügen")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="comic-book-editor-delete-panel"
                  onClick={handleDeletePanel}
                  disabled={!selectedPanelId}
                >
                  {t("ui.comic_book_editor.delete_panel", "Panel löschen")}
                </button>
                <MovePanelToPageMenu
                  disabled={!selectedPanelId}
                  loadEntries={loadMoveEntries}
                  onMove={handleMovePanel}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="comic-book-editor-add-bubble"
                  onClick={handleAddBubble}
                  disabled={!selectedPanelId}
                >
                  {t(
                    "ui.comic_book_editor.add_bubble",
                    "Sprechblase hinzufügen",
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="comic-book-editor-delete-bubble"
                  onClick={handleDeleteBubble}
                  disabled={!selectedBubbleId}
                >
                  {t(
                    "ui.comic_book_editor.delete_bubble",
                    "Sprechblase löschen",
                  )}
                </button>
              </div>
            </>
          ) : (
            <div
              data-testid="comic-book-editor-canvas-empty"
              style={{
                padding: 48,
                textAlign: "center",
                color: "var(--text-muted, #666)",
              }}
            >
              {t(
                "ui.comic_book_editor.canvas_empty",
                "Add a page from the sidebar to start authoring.",
              )}
            </div>
          )}
        </section>

        <div
          data-testid="comic-book-editor-side-pane-wrapper"
          data-sidebar-open={sidebars.right.open}
          className={[
            "shrink-0 overflow-hidden transition-[width] duration-200",
            "fixed inset-y-0 right-0 z-[90] bg-card shadow-[var(--shadow-md)]",
            "menu:static menu:inset-auto menu:z-auto menu:bg-transparent menu:shadow-none",
            sidebars.right.open ? "w-[320px]" : "w-0",
          ].join(" ")}
        >
          <div className="flex h-full w-[320px] flex-col">
            <div className="flex justify-start p-1">
              <SidebarToggleButton
                open
                onToggle={sidebars.right.toggle}
                testId="comic-book-editor-side-pane-collapse"
              />
            </div>
            <aside
              data-testid="comic-book-editor-side-pane"
              className="flex-1"
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                background: "var(--surface-2, #fafafa)",
                minHeight: 400,
                overflow: "auto",
              }}
            >
          {selectedBubble ? (
            <LayoutConfigComicBubble
              bubble={selectedBubble}
              onChange={handleUpdateBubble}
            />
          ) : selectedPanel ? (
            <LayoutConfigComicPanel
              panel={selectedPanel}
              bookId={bookId}
              onChange={handleUpdatePanel}
            />
          ) : (
            <div
              data-testid="comic-book-editor-side-pane-empty"
              style={{ padding: 16 }}
            >
              {t(
                "ui.comic_book_editor.side_pane_default",
                "Klicke ein Panel oder eine Sprechblase, um sie zu bearbeiten.",
              )}
            </div>
          )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
