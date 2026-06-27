/**
 * State, data-loading, and handler cluster for ComicBookEditor.
 *
 * Extracted from ComicBookEditor.tsx to keep the component file under
 * the cohesion threshold. The hook owns the pages/panels/bubbles
 * data lifecycle, asset-URL resolution (api + dexie), the page-level
 * handlers, and the derived selection state; the panel/bubble/grid CRUD
 * cluster lives in comic-editor/useComicCrud (#207 god-file split). The
 * component consumes the returned bag and renders the header + 3-column
 * body. Logic is byte-identical to the pre-extraction inline version.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type ComicBubbleOut,
  type ComicPanelOut,
  type ComicsPluginInfo,
  type Page,
} from "../../api/client";
import { getStorage } from "../../storage";
import { bookAssetFileUrl } from "../../storage/asset-url";
import { useFullscreenToggle } from "../../hooks/ui/useFullscreenToggle";
import { useI18n } from "../../hooks/useI18n";
import { useKeyboardShortcuts } from "../../hooks/ui/useKeyboardShortcuts";

import {
  COMIC_GRID_MAX_PANELS,
  DEFAULT_COMIC_GRID_TEMPLATE,
  resolveComicGridTemplate,
} from "./ComicPanelGrid";
import type { ComicBubbleData } from "./ComicBubble";
import type { ComicPanelData } from "./ComicPanel";
import { useDialog } from "../shared/AppDialog";
import { useDualSidebarCollapse } from "../../hooks/ui/useDualSidebarCollapse";
import { useComicPanelCrud } from "./comic-editor/useComicPanelCrud";
import { useComicBubbleCrud } from "./comic-editor/useComicBubbleCrud";

export function useComicBookEditor(bookId: string) {
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
  // True until the mount-time pages.list resolves. Gates the add-page
  // button so a click during the load window cannot fire handleAddPage
  // before the list lands (the late resolve would otherwise clobber the
  // optimistically-created page). Mirrors PageEditor.tsx.
  const [pagesLoading, setPagesLoading] = useState(true);
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
      })
      .finally(() => {
        if (!cancelled) setPagesLoading(false);
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

  // Panel/grid + bubble CRUD handlers (#207 god-file split): the
  // grid-template overflow flow, panel + bubble CRUD, drag handlers,
  // panel reorder, and cross-page move. Each sub-hook receives the
  // shared state + refreshers so behaviour is byte-identical to the
  // inline version.
  const panelCrud = useComicPanelCrud({
    bookId,
    activePageId,
    pages,
    panels,
    selectedPanelId,
    setPanels,
    setSelectedPanelId,
    setSelectedBubbleId,
    setPagesError,
    refreshPages,
    refreshPanelsAndBubbles,
    refreshAssets,
  });
  const bubbleCrud = useComicBubbleCrud({
    bookId,
    activePageId,
    selectedPanelId,
    selectedBubbleId,
    setSelectedBubbleId,
    setPagesError,
    refreshPanelsAndBubbles,
  });

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

  return {
    t,
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
    ...panelCrud,
    ...bubbleCrud,
    assetUrls,
    selectedBubble,
    activePage,
    maxPanels,
    atPanelCapacity,
    panelData,
    selectedPanel,
    panelBubblesMap,
  };
}
