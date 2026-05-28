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
 * that calls ``api.pages.create(bookId, {layout: "comic_panel_grid"})``
 * + refreshes the pages list.
 */

import {useCallback, useEffect, useMemo, useState} from "react";
import {FileText, Maximize2, Minimize2} from "lucide-react";

import {
    api,
    ApiError,
    type ComicBubbleOut,
    type ComicPanelOut,
    type ComicsPluginInfo,
    type Page,
} from "../api/client";
import {useFullscreenToggle} from "../hooks/useFullscreenToggle";
import {useI18n} from "../hooks/useI18n";
import {useKeyboardShortcuts} from "../hooks/useKeyboardShortcuts";

import {
    ComicPanelGrid,
    COMIC_GRID_MAX_PANELS,
    DEFAULT_COMIC_GRID_TEMPLATE,
    resolveComicGridTemplate,
    type ComicGridTemplate,
} from "./comics/ComicPanelGrid";
import {ComicGridTemplatePicker} from "./comics/ComicGridTemplatePicker";
import {LayoutConfigComicBubble} from "./comics/LayoutConfigComicBubble";
import {LayoutConfigComicPanel} from "./comics/LayoutConfigComicPanel";
import type {ComicBubbleData} from "./comics/ComicBubble";
import type {ComicPanelData} from "./comics/ComicPanel";
import {useDialog} from "./AppDialog";
import PageThumbnails from "./PageThumbnails";
import PdfExportControls from "./PdfExportControls";

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
}

export default function ComicBookEditor({
    bookId,
    bookTitle,
    onBack,
    onShowMetadata,
}: Props) {
    const {t} = useI18n();
    const dialog = useDialog();
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
    const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(
        null,
    );

    const fullscreen = useFullscreenToggle();
    useKeyboardShortcuts(
        fullscreen.isSupported
            ? [{keys: "ctrl+shift+f", handler: () => void fullscreen.toggle()}]
            : [],
    );

    useEffect(() => {
        let cancelled = false;
        api.comics
            .getInfo()
            .then((info) => {
                if (!cancelled) setPluginInfo(info);
            })
            .catch((err) => {
                if (cancelled) return;
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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
            const rows = await api.pages.list(bookId);
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
        api.pages
            .list(bookId)
            .then((rows) => {
                if (cancelled) return;
                setPages(rows);
                setActivePageId(rows[0]?.id ?? null);
            })
            .catch((err) => {
                if (cancelled) return;
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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
            const newPage = await api.pages.create(bookId, {
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
    // shape — the two surfaces share the same api.pages.reorder
    // contract.
    const handleReorderPages = useCallback(
        async (pageIds: string[]) => {
            try {
                const next = await api.pages.reorder(bookId, pageIds);
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
    // share the same api.pages.delete contract + the same
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
                await api.pages.delete(bookId, pageId);
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

    // Handler for ComicGridTemplatePicker. Writes ``comic_grid_template``
    // into the active page's ``layout_config`` while preserving any
    // sibling keys (future Phase 3 #6 panel-gutter, etc.).
    const handleChangeGridTemplate = useCallback(
        async (template: ComicGridTemplate) => {
            if (!activePageId) return;
            const activePage = pages.find((p) => p.id === activePageId);
            if (!activePage) return;
            const priorConfig =
                (activePage.layout_config as Record<string, unknown> | null) ??
                {};
            try {
                await api.pages.update(bookId, activePageId, {
                    layout_config: {
                        ...priorConfig,
                        comic_grid_template: template,
                    },
                });
                await refreshPages();
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
                setPagesError(detail);
            }
        },
        [activePageId, bookId, pages, refreshPages],
    );

    const refreshPanelsAndBubbles = useCallback(
        async (pageId: string) => {
            try {
                const panelRows = await api.comics.listPanels(bookId, pageId);
                setPanels(panelRows);
                const bubbleMap: Record<string, ComicBubbleOut[]> = {};
                await Promise.all(
                    panelRows.map(async (panel) => {
                        bubbleMap[panel.id] = await api.comics.listBubbles(
                            bookId,
                            panel.id,
                        );
                    }),
                );
                setBubblesByPanel(bubbleMap);
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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

    const refreshAssets = useCallback(async () => {
        try {
            const assets = await api.assets.list(bookId);
            const urlMap: Record<string, string> = {};
            for (const asset of assets) {
                urlMap[asset.id] = `/api/books/${bookId}/assets/file/${asset.filename}`;
            }
            setAssetUrls(urlMap);
        } catch (err) {
            const detail =
                err instanceof ApiError ? err.detail : String(err);
            setPagesError(detail);
        }
    }, [bookId]);

    useEffect(() => {
        void refreshAssets();
    }, [refreshAssets]);

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
            const newPanel = await api.comics.createPanel(bookId, activePageId, {
                bounds: {x_pct: 0, y_pct: 0, width_pct: 100, height_pct: 100},
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
            await api.comics.deletePanel(bookId, selectedPanelId);
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
            const newBubble = await api.comics.createBubble(
                bookId,
                selectedPanelId,
                {
                    bubble_type: "speech",
                    anchor: {x_pct: 25, y_pct: 25},
                },
            );
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
            await api.comics.deleteBubble(bookId, selectedBubbleId);
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
                await api.comics.updateBubble(
                    bookId,
                    selectedBubbleId,
                    partial as Record<string, unknown>,
                );
                await refreshPanelsAndBubbles(activePageId);
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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
                await api.comics.updateBubble(bookId, bubbleId, {
                    anchor: {x_pct, y_pct},
                });
                await refreshPanelsAndBubbles(activePageId);
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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
                await api.comics.updateBubble(bookId, bubbleId, {
                    tail_direction: direction,
                    tail_position_pct: positionPct,
                    tail_length_px: lengthPx,
                });
                await refreshPanelsAndBubbles(activePageId);
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
                setPagesError(detail);
            }
        },
        [activePageId, bookId, refreshPanelsAndBubbles],
    );

    const handleUpdatePanel = useCallback(
        async (partial: Partial<ComicPanelData>) => {
            if (!selectedPanelId || !activePageId) return;
            try {
                await api.comics.updatePanel(
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
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
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
            <header style={{display: "flex", alignItems: "center", gap: 12}}>
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="comic-book-editor-back"
                    onClick={onBack}
                >
                    {t("ui.comic_book_editor.back", "Zurück")}
                </button>
                <h1
                    data-testid="comic-book-editor-title"
                    style={{margin: 0, fontSize: "1.4rem", flex: 1}}
                >
                    {bookTitle}
                </h1>
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
                        title={t(
                            "ui.comic_book_editor.show_metadata",
                            "Buch-Metadaten öffnen",
                        )}
                    >
                        <FileText size={14} />
                        <span style={{marginLeft: 6}}>
                            {t(
                                "ui.comic_book_editor.show_metadata",
                                "Buch-Metadaten öffnen",
                            )}
                        </span>
                    </button>
                )}
                {activePageId && (
                    <ComicGridTemplatePicker
                        value={resolveComicGridTemplate(
                            (pages.find((p) => p.id === activePageId)
                                ?.layout_config as
                                | Record<string, unknown>
                                | null) ?? null,
                        )}
                        onChange={handleChangeGridTemplate}
                    />
                )}
                <PdfExportControls
                    bookId={bookId}
                    testidPrefix="comic-book-editor"
                />
                {fullscreen.isSupported && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        data-testid="comic-book-editor-fullscreen"
                        onClick={() => void fullscreen.toggle()}
                        aria-pressed={fullscreen.isFullscreen ? "true" : "false"}
                        aria-label={
                            fullscreen.isFullscreen
                                ? t(
                                      "ui.editor.exit_fullscreen",
                                      "Vollbild verlassen",
                                  )
                                : t("ui.editor.fullscreen", "Vollbild")
                        }
                        title={
                            fullscreen.isFullscreen
                                ? t(
                                      "ui.editor.exit_fullscreen",
                                      "Vollbild verlassen",
                                  )
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
            </header>

            {pluginInfo && (
                <div
                    data-testid="comic-book-editor-plugin-info"
                    style={{
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {pluginInfo.name} v{pluginInfo.version} (session{" "}
                    {pluginInfo.session})
                </div>
            )}
            {pluginError && (
                <div
                    data-testid="comic-book-editor-plugin-error"
                    role="alert"
                    style={{color: "var(--danger, #c00)"}}
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
                style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr 320px",
                    gap: 16,
                    minHeight: 480,
                }}
            >
                <aside
                    data-testid="comic-book-editor-thumbnails"
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

                <section
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        minWidth: 0,
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
                                        (activePage?.layout_config as
                                            | Record<string, unknown>
                                            | null) ?? null
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
                                    onBubbleTailDragEnd={
                                        handleBubbleTailDragEnd
                                    }
                                />
                            </div>

                            <div
                                data-testid="comic-book-editor-actions"
                                style={{display: "flex", gap: 8, flexWrap: "wrap"}}
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
                                    data-at-capacity={
                                        atPanelCapacity ? "true" : "false"
                                    }
                                >
                                    {t(
                                        "ui.comic_book_editor.add_panel",
                                        "Panel hinzufügen",
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    data-testid="comic-book-editor-delete-panel"
                                    onClick={handleDeletePanel}
                                    disabled={!selectedPanelId}
                                >
                                    {t(
                                        "ui.comic_book_editor.delete_panel",
                                        "Panel löschen",
                                    )}
                                </button>
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

                <aside
                    data-testid="comic-book-editor-side-pane"
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
                            style={{padding: 16}}
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
    );
}
