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
import {Maximize2, Minimize2} from "lucide-react";

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
    DEFAULT_COMIC_GRID_TEMPLATE,
    resolveComicGridTemplate,
    type ComicGridTemplate,
} from "./comics/ComicPanelGrid";
import {ComicGridTemplatePicker} from "./comics/ComicGridTemplatePicker";
import {LayoutConfigComicBubble} from "./comics/LayoutConfigComicBubble";
import {LayoutConfigComicPanel} from "./comics/LayoutConfigComicPanel";
import type {ComicBubbleData} from "./comics/ComicBubble";
import type {ComicPanelData} from "./comics/ComicPanel";
import PdfExportControls from "./PdfExportControls";

interface Props {
    bookId: string;
    bookTitle: string;
    onBack: () => void;
}

export default function ComicBookEditor({bookId, bookTitle, onBack}: Props) {
    const {t} = useI18n();
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

    const handleCreateFirstPage = useCallback(async () => {
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
            setActivePageId(newPage.id ?? rows[0]?.id ?? null);
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : String(err);
            setPagesError(detail);
        }
    }, [bookId, refreshPages]);

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
    }, [activePageId, bookId, refreshPanelsAndBubbles]);

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
            } catch (err) {
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
                setPagesError(detail);
            }
        },
        [activePageId, bookId, refreshPanelsAndBubbles, selectedPanelId],
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
                maxWidth: 1200,
                margin: "0 auto",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
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
                    style={{fontSize: "0.8rem", opacity: 0.7}}
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

            {pages.length === 0 ? (
                <section
                    data-testid="comic-book-editor-no-pages"
                    style={{
                        padding: 20,
                        border: "1px dashed var(--border, #ddd)",
                        borderRadius: 8,
                        background: "var(--surface-2, #fafafa)",
                    }}
                >
                    <h2 style={{marginTop: 0}}>
                        {t(
                            "ui.comic_book_editor.no_pages_title",
                            "Noch keine Comic-Seiten",
                        )}
                    </h2>
                    <p>
                        {t(
                            "ui.comic_book_editor.no_pages_message",
                            "Erstelle deine erste Comic-Seite, um Panels und Sprechblasen zu platzieren.",
                        )}
                    </p>
                    <button
                        type="button"
                        className="btn btn-primary"
                        data-testid="comic-book-editor-create-first-page"
                        onClick={handleCreateFirstPage}
                    >
                        {t(
                            "ui.comic_book_editor.create_first_page",
                            "Erste Comic-Seite erstellen",
                        )}
                    </button>
                    {pagesError && (
                        <p
                            data-testid="comic-book-editor-pages-error"
                            role="alert"
                            style={{
                                color: "var(--danger, #c00)",
                                marginTop: 16,
                            }}
                        >
                            {pagesError}
                        </p>
                    )}
                </section>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 320px",
                        gap: 16,
                    }}
                >
                    <section
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <nav
                            data-testid="comic-book-editor-page-nav"
                            style={{display: "flex", flexWrap: "wrap", gap: 6}}
                        >
                            {pages.map((page, idx) => (
                                <button
                                    key={page.id}
                                    type="button"
                                    onClick={() => {
                                        setActivePageId(page.id);
                                        setSelectedPanelId(null);
                                        setSelectedBubbleId(null);
                                    }}
                                    data-testid={`comic-book-editor-page-${page.id}`}
                                    aria-pressed={
                                        activePageId === page.id
                                            ? "true"
                                            : "false"
                                    }
                                    className="btn btn-secondary btn-sm"
                                    style={{
                                        fontWeight:
                                            activePageId === page.id ? 700 : 400,
                                    }}
                                >
                                    {t(
                                        "ui.comic_book_editor.page_chip",
                                        "Seite",
                                    )}{" "}
                                    {idx + 1}
                                </button>
                            ))}
                        </nav>

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
                                selectedPanelId={selectedPanelId}
                                selectedBubbleId={selectedBubbleId}
                                onPanelClick={(panelId) => {
                                    setSelectedPanelId(panelId);
                                    setSelectedBubbleId(null);
                                }}
                                onBubbleClick={(bubbleId) => {
                                    setSelectedBubbleId(bubbleId);
                                }}
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
                                disabled={!activePageId}
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
            )}
        </div>
    );
}
