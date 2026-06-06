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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, LayoutGrid, Maximize2, Minimize2 } from "lucide-react";

import {
  ApiError,
  type ComicBubbleOut,
  type ComicPanelOut,
  type ComicsPluginInfo,
  type Page,
} from "../api/client";
import {getStorage} from "../storage";
import {bookAssetFileUrl} from "../storage/asset-url";
import { useFullscreenToggle } from "../hooks/useFullscreenToggle";
import { useI18n } from "../hooks/useI18n";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { notify } from "../utils/notify";

import {
  ComicPanelGrid,
  COMIC_GRID_MAX_PANELS,
  DEFAULT_COMIC_GRID_TEMPLATE,
  resolveComicGridTemplate,
  type ComicGridTemplate,
} from "./comics/ComicPanelGrid";
import { ComicGridTemplatePicker } from "./comics/ComicGridTemplatePicker";
import { LayoutConfigComicBubble } from "./comics/LayoutConfigComicBubble";
import { LayoutConfigComicPanel } from "./comics/LayoutConfigComicPanel";
import {
  MovePanelToPageMenu,
  type MovePageEntry,
} from "./comics/MovePanelToPageMenu";
import type { ComicBubbleData } from "./comics/ComicBubble";
import type { ComicPanelData } from "./comics/ComicPanel";
import { useDialog } from "./AppDialog";
import PageThumbnails from "./PageThumbnails";
import { SidebarToggleButton } from "./SidebarToggleButton";
import { useDualSidebarCollapse } from "../hooks/useDualSidebarCollapse";
import PdfExportControls from "./PdfExportControls";
import EditableTitle from "./EditableTitle";
import ThemeToggle from "./ThemeToggle";

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
  const dialog = useDialog();
  const sidebars = useDualSidebarCollapse(
    "bibliogon-comic-editor-thumbnails",
    "bibliogon-comic-editor-properties",
  );
  const [pluginInfo, setPluginInfo] = useState<ComicsPluginInfo | null>(null);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [panels, setPanels] = useState<ComicPanelOut[]>([]);
  const [bubblesByPanel, setBubblesByPanel] = useState<
    Record<string, ComicBubbleOut[]>
  >({});
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);

  const fullscreen = useFullscreenToggle();
  useKeyboardShortcuts(
    fullscreen.isSupported
      ? [{ keys: "ctrl+shift+f", handler: () => void fullscreen.toggle() }]
      : [],
  );

  useEffect(() => {
    let cancelled = false;
    getStorage().comics
      .getInfo()
      .then((info) => {
        if (!cancelled) setPluginInfo(info);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPluginError(detail);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load pages from the core /pages endpoint (relaxed in
  // PLUGIN-COMICS-SESSION-3-PAGES-CRUD-01 to accept comic_book).
  // Empty list is the normal first-time-author state; the empty-
  // state action button creates the first page on click.
  const refreshPages = useCallback(async () => {
    try {
      const rows = await getStorage().pages.list(bookId);
      setPages(rows);
      return rows;
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
      return [] as Page[];
    }
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;
    getStorage().pages
      .list(bookId)
      .then((rows) => {
        if (cancelled) return;
        setPages(rows);
        setActivePageId(rows[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C1: unified Add-Page
  // handler. Used for both first-page-creation AND adding pages
  // after the first. Replaces the prior split handleCreateFirstPage
  // (separate "Create first comic page" button in the empty state)
  // — PageThumbnails' "+" button now handles both via the same
  // onAddPage callback, closing the Half-Wired gap surfaced by
  // 2026-05-23 user-real-test.
  const handleAddPage = useCallback(async () => {
    setPagesError(null);
    try {
      // Phase 1: set explicit default template at create-time
      // so the page doesn't rely on the γ-shim fallback. The
      // ComicGridTemplatePicker in the header lets the user
      // change it afterwards.
      const newPage = await getStorage().pages.create(bookId, {
        layout: "comic_panel_grid",
        layout_config: {
          comic_grid_template: DEFAULT_COMIC_GRID_TEMPLATE,
        },
      });
      const rows = await refreshPages();
      // Auto-select the newly-created page so the user gets
      // visible feedback that the click worked (sidebar row
      // highlights + canvas switches to the new page). Mirrors
      // the Add-Panel perception-lag-fix pattern from 2026-05-20.
      setActivePageId(newPage.id ?? rows[0]?.id ?? null);
      setSelectedPanelId(null);
      setSelectedBubbleId(null);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [bookId, refreshPages]);

  // PLUGIN-COMICS-MULTI-PAGE-NAVIGATION-01 C1: drag-reorder pages
  // via PageThumbnails. Mirrors PageEditor.tsx's handleReorder
  // shape — the two surfaces share the same getStorage().pages.reorder
  // contract.
  const handleReorderPages = useCallback(
    async (pageIds: string[]) => {
      try {
        const next = await getStorage().pages.reorder(bookId, pageIds);
        setPages(next);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [bookId],
  );

  // PAGES-DELETE-EDITOR-UI-01 C2: page-delete handler. Mirrors
  // PageEditor.tsx's handleDeletePage shape — the two surfaces
  // share the same getStorage().pages.delete contract + the same
  // PageThumbnails onDelete prop. Confirm dialog + state
  // reconciliation per "Destructive row-actions must reconcile
  // collection state" LL: filter from local pages, clear
  // activePageId if it was the deleted page, also clear panel +
  // bubble selection (those rows are scoped to the deleted page
  // and become invalid once it's gone).
  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const confirmed = await dialog.confirm(
        t("ui.page_editor.delete_page_title", "Delete page?"),
        t(
          "ui.page_editor.delete_page_confirm",
          "Are you sure you want to delete this page? This cannot be undone.",
        ),
        "danger",
      );
      if (!confirmed) return;
      try {
        await getStorage().pages.delete(bookId, pageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
        return;
      }
      setPages((prev) => {
        const remaining = prev.filter((p) => p.id !== pageId);
        if (activePageId === pageId) {
          setActivePageId(remaining[0]?.id ?? null);
          setSelectedPanelId(null);
          setSelectedBubbleId(null);
        }
        return remaining;
      });
    },
    [bookId, dialog, t, activePageId],
  );

  const refreshPanelsAndBubbles = useCallback(
    async (pageId: string) => {
      try {
        const panelRows = await getStorage().comics.listPanels(bookId, pageId);
        setPanels(panelRows);
        const bubbleMap: Record<string, ComicBubbleOut[]> = {};
        await Promise.all(
          panelRows.map(async (panel) => {
            bubbleMap[panel.id] = await getStorage().comics.listBubbles(
              bookId,
              panel.id,
            );
          }),
        );
        setBubblesByPanel(bubbleMap);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [bookId],
  );

  // Handler for ComicGridTemplatePicker. Writes ``comic_grid_template``
  // into the active page's ``layout_config`` while preserving any
  // sibling keys (future Phase 3 #6 panel-gutter, etc.).
  //
  // COMIC-PANEL-OVERFLOW-HANDLER-01 (2026-05-28): when the target
  // template's panel cap is BELOW the current panel count, the
  // user is asked to choose between (A) "Move excess panels to
  // new automatically-created pages" (each new page inherits the
  // target template; panel content — bubbles, images — follows
  // via the PATCH-page_id path), (B) "Delete excess panels
  // permanently" (destructive, confirmed), or (C) cancel the
  // layout switch entirely. No silent hiding — data ghosts are
  // forbidden per the user-stated discipline.
  const handleChangeGridTemplate = useCallback(
    async (template: ComicGridTemplate) => {
      if (!activePageId) return;
      const activePage = pages.find((p) => p.id === activePageId);
      if (!activePage) return;
      const priorConfig =
        (activePage.layout_config as Record<string, unknown> | null) ?? {};

      // Count current panels on the active page; compare
      // against the target template's max.
      const currentPanelCount = panels.length;
      const targetMax = COMIC_GRID_MAX_PANELS[template];
      const excess = Math.max(0, currentPanelCount - targetMax);

      // Persists the new template (and optionally refreshes
      // panels) without re-checking overflow. Used after the
      // overflow has been resolved (or there was no overflow).
      const persistTemplateChange = async () => {
        await getStorage().pages.update(bookId, activePageId, {
          layout_config: {
            ...priorConfig,
            comic_grid_template: template,
          },
        });
        await refreshPages();
        if (activePageId) {
          await refreshPanelsAndBubbles(activePageId);
        }
      };

      try {
        if (excess === 0) {
          await persistTemplateChange();
          return;
        }

        // Build the confirmation choice. dialog.choose
        // returns the chosen value's string, or null on
        // cancel.
        const message = t(
          "ui.comic_book_editor.overflow_message",
          `Die ausgewählte Vorlage erlaubt nur ${targetMax} Panel(s), aber die Seite hat ${currentPanelCount}. ${excess} überzählige Panel(s) müssen verschoben oder gelöscht werden.`,
        )
          .replace("{target}", String(targetMax))
          .replace("{current}", String(currentPanelCount))
          .replace("{excess}", String(excess));

        const choice = await dialog.choose(
          t(
            "ui.comic_book_editor.overflow_title",
            "Zu viele Panels für diese Vorlage",
          ),
          message,
          [
            {
              value: "move",
              label: t(
                "ui.comic_book_editor.overflow_move",
                "Auf neue Seiten verschieben",
              ),
            },
            {
              value: "delete",
              label: t("ui.comic_book_editor.overflow_delete", "Löschen"),
              variant: "danger",
            },
          ],
          t("ui.common.cancel", "Abbrechen"),
        );

        if (choice === null) {
          // Cancel: layout switch not performed.
          return;
        }

        // Sort panels by position so "excess" picks the
        // LAST N panels — most recently added — and keeps
        // the earliest panels in their place.
        const sortedPanels = [...panels].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );
        const excessPanels = sortedPanels.slice(targetMax);

        if (choice === "delete") {
          // Explicit destructive confirmation per the
          // spec — second prompt with explicit warning
          // about bubbles + images being permanently
          // lost.
          const reallyDelete = await dialog.confirm(
            t(
              "ui.comic_book_editor.overflow_delete_confirm_title",
              "Wirklich endgültig löschen?",
            ),
            t(
              "ui.comic_book_editor.overflow_delete_confirm_message",
              `${excess} Panels mit allen Inhalten (Sprechblasen, Bilder) werden endgültig gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.`,
            ).replace("{excess}", String(excess)),
            "danger",
          );
          if (!reallyDelete) return;
          // Sequential delete preserves error visibility
          // per panel; parallel would mask which panel
          // failed.
          for (const p of excessPanels) {
            await getStorage().comics.deletePanel(bookId, p.id);
          }
          notify.success(
            t(
              "ui.comic_book_editor.overflow_delete_toast",
              `${excess} Panels gelöscht.`,
            ).replace("{excess}", String(excess)),
          );
        } else {
          // Move path: distribute excess across new
          // pages, each with target template, filling
          // targetMax per page.
          const newPagesCount = Math.ceil(excess / targetMax);
          const newPageIds: string[] = [];
          for (let i = 0; i < newPagesCount; i++) {
            const newPage = await getStorage().pages.create(bookId, {
              layout: "comic_panel_grid",
              layout_config: {
                comic_grid_template: template,
              },
            });
            newPageIds.push(newPage.id);
          }
          // For each excess panel, PATCH page_id +
          // position to its slot on the new page.
          for (let i = 0; i < excessPanels.length; i++) {
            const targetPageIndex = Math.floor(i / targetMax);
            const positionInTargetPage = i % targetMax;
            await getStorage().comics.updatePanel(bookId, excessPanels[i].id, {
              page_id: newPageIds[targetPageIndex],
              position: positionInTargetPage,
            });
          }
          notify.success(
            t(
              "ui.comic_book_editor.overflow_move_toast",
              `${excess} Panels auf ${newPagesCount} neue Seite(n) verschoben.`,
            )
              .replace("{excess}", String(excess))
              .replace("{pages}", String(newPagesCount)),
          );
        }

        // Either path: now persist the layout switch on
        // the active page + refresh.
        await persistTemplateChange();
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      pages,
      panels,
      refreshPages,
      refreshPanelsAndBubbles,
      dialog,
      t,
    ],
  );

  // PHASE-2-PANEL-CONFIG-01 C4: close the Half-Wired gap on
  // assetUrls. ComicPanelGrid consumes ``assetUrls: Record<assetId,
  // url>`` to render panel images; without it, an
  // ``image_asset_id``-set panel renders blank. Built from
  // ``api.assets.list(bookId)`` mapping ``asset.id ->
  // /api/books/{bookId}/assets/file/{filename}``. Refreshed on
  // bookId change AND after panel updates that touch
  // ``image_asset_id`` (uploads change the asset set; see
  // handleUpdatePanel).
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  // Blob URLs minted in dexie mode, tracked so they are revoked on refresh /
  // unmount (no leak). Empty in api mode (server URLs need no revocation).
  const blobUrlsRef = useRef<string[]>([]);
  const revokeBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];
  }, []);

  const refreshAssets = useCallback(async () => {
    // Maps image_asset_id -> a displayable URL. Online: the served file URL.
    // Offline (Dexie): a blob URL read from IndexedDB, so panel images show
    // without the service worker and without firing /api.
    const storage = getStorage();
    try {
      const assets = await storage.assets.list(bookId);
      const urlMap: Record<string, string> = {};
      if (storage.mode === "dexie") {
        const created: string[] = [];
        for (const asset of assets) {
          const blob = await storage.assets.getBlob(bookId, asset.filename);
          if (blob) {
            const url = URL.createObjectURL(blob);
            created.push(url);
            urlMap[asset.id] = url;
          }
        }
        revokeBlobUrls();
        blobUrlsRef.current = created;
      } else {
        for (const asset of assets) {
          urlMap[asset.id] = bookAssetFileUrl(bookId, asset.filename);
        }
      }
      setAssetUrls(urlMap);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [bookId, revokeBlobUrls]);

  useEffect(() => {
    void refreshAssets();
    return () => revokeBlobUrls();
  }, [refreshAssets, revokeBlobUrls]);

  useEffect(() => {
    if (!activePageId) {
      setPanels([]);
      setBubblesByPanel({});
      return;
    }
    void refreshPanelsAndBubbles(activePageId);
  }, [activePageId, refreshPanelsAndBubbles]);

  const handleAddPanel = useCallback(async () => {
    if (!activePageId) return;
    // Defense-in-depth against keyboard shortcuts or DOM-
    // manipulation that bypass the button's disabled attr: the
    // capacity check is also enforced here.
    const activePageRow = pages.find((p) => p.id === activePageId);
    const template = resolveComicGridTemplate(
      (activePageRow?.layout_config ?? null) as Record<string, unknown> | null,
    );
    if (panels.length >= COMIC_GRID_MAX_PANELS[template]) return;
    try {
      const newPanel = await getStorage().comics.createPanel(bookId, activePageId, {
        bounds: { x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100 },
      });
      await refreshPanelsAndBubbles(activePageId);
      // Auto-select the new panel so (a) the user gets visible
      // feedback that the click worked (outline highlight on
      // the new panel) and (b) Add-Bubble immediately enables
      // without a separate panel-click. Mirrors the design-tool
      // "draw-shape-then-it's-selected" pattern.
      setSelectedPanelId(newPanel.id);
      setSelectedBubbleId(null);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [activePageId, bookId, pages, panels.length, refreshPanelsAndBubbles]);

  const handleDeletePanel = useCallback(async () => {
    if (!selectedPanelId || !activePageId) return;
    try {
      await getStorage().comics.deletePanel(bookId, selectedPanelId);
      setSelectedPanelId(null);
      setSelectedBubbleId(null);
      await refreshPanelsAndBubbles(activePageId);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [activePageId, bookId, refreshPanelsAndBubbles, selectedPanelId]);

  const handleAddBubble = useCallback(async () => {
    if (!selectedPanelId || !activePageId) return;
    try {
      const newBubble = await getStorage().comics.createBubble(bookId, selectedPanelId, {
        bubble_type: "speech",
        anchor: { x_pct: 25, y_pct: 25 },
      });
      await refreshPanelsAndBubbles(activePageId);
      // Auto-select the new bubble — same rationale as
      // handleAddPanel above: visible feedback + the side-pane
      // LayoutConfigComicBubble immediately becomes available
      // for editing.
      setSelectedBubbleId(newBubble.id);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [activePageId, bookId, refreshPanelsAndBubbles, selectedPanelId]);

  const handleDeleteBubble = useCallback(async () => {
    if (!selectedBubbleId || !activePageId) return;
    try {
      await getStorage().comics.deleteBubble(bookId, selectedBubbleId);
      setSelectedBubbleId(null);
      await refreshPanelsAndBubbles(activePageId);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : String(err);
      setPagesError(detail);
    }
  }, [activePageId, bookId, refreshPanelsAndBubbles, selectedBubbleId]);

  const handleUpdateBubble = useCallback(
    async (partial: Partial<ComicBubbleData>) => {
      if (!selectedBubbleId || !activePageId) return;
      try {
        await getStorage().comics.updateBubble(
          bookId,
          selectedBubbleId,
          partial as Record<string, unknown>,
        );
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [activePageId, bookId, refreshPanelsAndBubbles, selectedBubbleId],
  );

  /** Bubble drag-end handler: persists the new anchor and selects
   *  the dragged bubble (so the side-pane's anchor sliders update
   *  to match the dragged position via the controlled-input
   *  binding). Drag-end fires once per drag, AFTER the 5px
   *  threshold has been crossed. */
  const handleBubbleDragEnd = useCallback(
    async (bubbleId: string, x_pct: number, y_pct: number) => {
      if (!activePageId) return;
      setSelectedBubbleId(bubbleId);
      try {
        await getStorage().comics.updateBubble(bookId, bubbleId, {
          anchor: { x_pct, y_pct },
        });
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [activePageId, bookId, refreshPanelsAndBubbles],
  );

  /** Tail-handle drag-end handler: persists the derived
   *  (tail_direction, tail_position_pct, tail_length_px) triple
   *  for the dragged bubble. Same select-then-persist shape as
   *  handleBubbleDragEnd so the side-pane tail sliders reflect
   *  the new values via controlled-input binding. */
  const handleBubbleTailDragEnd = useCallback(
    async (
      bubbleId: string,
      direction: string,
      positionPct: number,
      lengthPx: number,
    ) => {
      if (!activePageId) return;
      setSelectedBubbleId(bubbleId);
      try {
        await getStorage().comics.updateBubble(bookId, bubbleId, {
          tail_direction: direction,
          tail_position_pct: positionPct,
          tail_length_px: lengthPx,
        });
        await refreshPanelsAndBubbles(activePageId);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [activePageId, bookId, refreshPanelsAndBubbles],
  );

  const handleUpdatePanel = useCallback(
    async (partial: Partial<ComicPanelData>) => {
      if (!selectedPanelId || !activePageId) return;
      try {
        await getStorage().comics.updatePanel(
          bookId,
          selectedPanelId,
          partial as Record<string, unknown>,
        );
        await refreshPanelsAndBubbles(activePageId);
        // Image upload + clear paths change the asset set:
        // refresh the URL map so the new image surfaces in
        // the editor body (ComicPanelGrid) and the cleared
        // image vanishes.
        if ("image_asset_id" in partial) {
          await refreshAssets();
        }
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
      }
    },
    [
      activePageId,
      bookId,
      refreshAssets,
      refreshPanelsAndBubbles,
      selectedPanelId,
    ],
  );

  // COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 1: same-page panel
  // reorder. ``panelIds`` is the full ordered id-list emitted by
  // ComicPanelGrid's dnd-kit SortableContext on drop. Optimistically
  // re-index positions so the grid (which sorts by position)
  // reflects the new order immediately, then reconcile with the
  // server's two-phase reorder response. On failure, re-fetch.
  const handlePanelReorder = useCallback(
    async (panelIds: string[]) => {
      if (!activePageId) return;
      setPanels((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        return panelIds
          .map((id, idx) => {
            const panel = byId.get(id);
            return panel ? { ...panel, position: idx + 1 } : undefined;
          })
          .filter((p): p is ComicPanelOut => Boolean(p));
      });
      try {
        const reordered = await getStorage().comics.reorderPanels(
          bookId,
          activePageId,
          panelIds,
        );
        setPanels(reordered);
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
        await refreshPanelsAndBubbles(activePageId);
      }
    },
    [activePageId, bookId, refreshPanelsAndBubbles],
  );

  // COMIC-PANEL-CROSS-PAGE-MOVE-01 Phase 2: cross-page move via the
  // "Move to page" action menu (user-adjudicated alternative to
  // drag-to-thumbnail; avoids a shared-DndContext refactor of the
  // PageThumbnails the picture-book editor also uses). Capacity per
  // OTHER page is fetched lazily on menu-open so a stale count can't
  // gate the move.
  const loadMoveEntries = useCallback(async (): Promise<MovePageEntry[]> => {
    const otherPages = pages.filter((p) => p.id !== activePageId);
    const entries = await Promise.all(
      otherPages.map(async (p) => {
        const targetPanels = await getStorage().comics.listPanels(bookId, p.id);
        const template = resolveComicGridTemplate(
          (p.layout_config as Record<string, unknown> | null) ?? null,
        );
        return {
          pageId: p.id,
          position: p.position,
          count: targetPanels.length,
          max: COMIC_GRID_MAX_PANELS[template],
        };
      }),
    );
    return entries.sort((a, b) => a.position - b.position);
  }, [pages, activePageId, bookId]);

  // Move the selected panel to another page: PATCH page_id + append
  // position (existing ComicPanelUpdate path), then re-normalise the
  // source page's positions to 1..N via the C1 reorder endpoint so
  // no gap survives the move. Refresh + toast on success.
  const handleMovePanel = useCallback(
    async (targetPageId: string) => {
      if (!selectedPanelId || !activePageId) return;
      const sourcePageId = activePageId;
      const movedPanelId = selectedPanelId;
      try {
        const targetPanels = await getStorage().comics.listPanels(bookId, targetPageId);
        await getStorage().comics.updatePanel(bookId, movedPanelId, {
          page_id: targetPageId,
          position: targetPanels.length + 1,
        });
        const remaining = panels
          .filter((p) => p.id !== movedPanelId)
          .sort((a, b) => a.position - b.position)
          .map((p) => p.id);
        if (remaining.length > 0) {
          await getStorage().comics.reorderPanels(bookId, sourcePageId, remaining);
        }
        setSelectedPanelId(null);
        setSelectedBubbleId(null);
        await refreshPanelsAndBubbles(sourcePageId);
        const targetPosition =
          pages.find((p) => p.id === targetPageId)?.position ?? "?";
        notify.success(
          t(
            "ui.comic_book_editor.move_panel_success",
            "Panel auf Seite {n} verschoben",
          ).replace("{n}", String(targetPosition)),
        );
      } catch (err) {
        const detail = err instanceof ApiError ? err.detail : String(err);
        setPagesError(detail);
        await refreshPanelsAndBubbles(sourcePageId);
      }
    },
    [
      selectedPanelId,
      activePageId,
      bookId,
      panels,
      pages,
      refreshPanelsAndBubbles,
      t,
    ],
  );

  const selectedBubble = useMemo<ComicBubbleData | null>(() => {
    if (!selectedBubbleId) return null;
    for (const panelBubbles of Object.values(bubblesByPanel)) {
      const found = panelBubbles.find((b) => b.id === selectedBubbleId);
      if (found) return found as unknown as ComicBubbleData;
    }
    return null;
  }, [bubblesByPanel, selectedBubbleId]);

  const activePage = pages.find((p) => p.id === activePageId) ?? null;
  // Panel-capacity gate: each grid template has a fixed cell count
  // (single_panel = 1, grid_1x2 / grid_2x1 = 2, grid_2x2 = 4,
  // grid_2x3 / grid_3x2 = 6, grid_3x3 = 9). The Add-Panel button
  // disables once the page already has that many panels so the
  // user can't append beyond the layout's capacity.
  const activeGridTemplate = resolveComicGridTemplate(
    (activePage?.layout_config ?? null) as Record<string, unknown> | null,
  );
  const maxPanels = COMIC_GRID_MAX_PANELS[activeGridTemplate];
  const atPanelCapacity = panels.length >= maxPanels;
  const panelData = panels as unknown as ComicPanelData[];
  const selectedPanel = useMemo<ComicPanelData | null>(() => {
    if (!selectedPanelId) return null;
    return panelData.find((p) => p.id === selectedPanelId) ?? null;
  }, [panelData, selectedPanelId]);
  const panelBubblesMap: Record<string, ComicBubbleData[]> = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(bubblesByPanel).map(([k, v]) => [
          k,
          v as unknown as ComicBubbleData[],
        ]),
      ),
    [bubblesByPanel],
  );

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
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn btn-secondary btn-sm"
          data-testid="comic-book-editor-back"
          onClick={onBack}
        >
          {t("ui.comic_book_editor.back", "Zurück")}
        </button>
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
        {!sidebars.left.open && (
          <SidebarToggleButton
            open={false}
            onToggle={sidebars.left.toggle}
            testId="comic-book-editor-thumbnails-toggle"
            className="fixed left-2 top-2 z-[100] bg-card shadow-[var(--shadow-md)]"
          />
        )}
        {!sidebars.right.open && (
          <SidebarToggleButton
            open={false}
            onToggle={sidebars.right.toggle}
            testId="comic-book-editor-side-pane-toggle"
            className="fixed right-2 top-2 z-[100] bg-card shadow-[var(--shadow-md)]"
          />
        )}
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
            onReorder={handleReorderPages}
            onDelete={handleDeletePage}
            testidNamespace="comic-book-editor"
          />
            </aside>
          </div>
        </div>

        <section
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
