import { type NavigateFunction } from "react-router-dom";
import {
    BookmarkPlus,
    CircleHelp,
    Download,
    FilePlus2,
    GitBranch,
    Info,
    Keyboard,
    LayoutDashboard,
    Library,
    ListChecks,
    ListTree,
    Plus,
    RefreshCw,
    Share2,
} from "lucide-react";

import { type ChapterType } from "../api/client";
import { type EditorMenuGroup } from "../lib/components/EditorMenu";

type TranslateFn = (key: string, fallback?: string) => string;

/**
 * Everything the structured book-editor menu needs to build its groups and
 * dispatch an action. The book editor owns the underlying state + handlers and
 * passes them in; this keeps the menu definition out of the BookEditor god-file
 * (issue #322 wired it inline; #330 extracts it for the cohesion gate).
 */
export interface BookEditorMenuDeps {
    t: TranslateFn;
    navigate: NavigateFunction;
    bookId: string | undefined;
    /** Offline (desktop-only) gate — disables the git actions with a reason. */
    offlineGate: boolean;
    /** Whether the story-bible plugin is available (adds two Ansicht items). */
    storyBibleAvailable: boolean;
    setSelectedStoryEntityId: (id: string | null) => void;
    closeSidebarOnNarrow: () => void;
    setShowMetadata: (value: boolean) => void;
    setShowStoryboard: (value: boolean) => void;
    setShowOutline: (value: boolean) => void;
    setShowRelationships: (value: boolean) => void;
    openStoryBible: () => void;
    onExport: () => void;
    onValidateToc: () => void | Promise<void>;
    onAddChapter: (chapterType?: ChapterType) => void;
    onAddFromTemplate: () => void;
    onSaveAsTemplate: () => void;
}

/** The built menu, consumed by `<EditorMenu groups disabled onAction />`. */
export interface BookEditorMenu {
    groups: EditorMenuGroup[];
    disabled: Record<string, string>;
    onAction: (actionId: string) => void;
}

/**
 * Build the book editor's structured menu (groups + disabled map + dispatcher).
 *
 * VS Code / Google Docs / Scrivener layout: Datei / Ansicht / Kapitel /
 * Werkzeuge / Hilfe. The story-bible items appear only when the plugin is
 * available; the git actions render disabled offline with the desktop-app
 * reason. The dispatcher composes the view-switch actions through the passed-in
 * setters (clear the selected entity, apply, then collapse the sidebar on
 * narrow viewports — preserving the inline behavior it replaced).
 *
 * A plain builder (not a hook): it holds no state, so it is called in render
 * like the inline code it replaced.
 */
export function buildBookEditorMenu(deps: BookEditorMenuDeps): BookEditorMenu {
    const {
        t,
        navigate,
        bookId,
        offlineGate,
        storyBibleAvailable,
        setSelectedStoryEntityId,
        closeSidebarOnNarrow,
        setShowMetadata,
        setShowStoryboard,
        setShowOutline,
        setShowRelationships,
        openStoryBible,
        onExport,
        onValidateToc,
        onAddChapter,
        onAddFromTemplate,
        onSaveAsTemplate,
    } = deps;

    const openView = (apply: () => void) => {
        setSelectedStoryEntityId(null);
        apply();
        closeSidebarOnNarrow();
    };

    const disabled: Record<string, string> = offlineGate
        ? {
              "git-backup": t(
                  "ui.feature.requires_desktop_app",
                  "Nur in der Desktop-App verfügbar.",
              ),
              "git-sync": t("ui.feature.requires_desktop_app", "Nur in der Desktop-App verfügbar."),
          }
        : {};

    const groups: EditorMenuGroup[] = [
        {
            label: t("ui.editor_menu.file", "Datei"),
            items: [
                {
                    id: "export",
                    label: t("ui.editor_menu.export", "Exportieren"),
                    icon: <Download size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.view", "Ansicht"),
            items: [
                {
                    id: "metadata",
                    label: t("ui.editor_menu.metadata", "Metadaten"),
                    icon: <Info size={16} />,
                },
                {
                    id: "storyboard",
                    label: t("ui.editor_menu.storyboard", "Storyboard"),
                    icon: <LayoutDashboard size={16} />,
                },
                ...(storyBibleAvailable
                    ? [
                          {
                              id: "story-bible",
                              label: t("ui.editor_menu.story_bible", "Story-Bibel"),
                              icon: <Library size={16} />,
                          },
                          {
                              id: "relationships",
                              label: t("ui.editor_menu.relationships", "Beziehungsgraph"),
                              icon: <Share2 size={16} />,
                          },
                      ]
                    : []),
                {
                    id: "outline",
                    label: t("ui.editor_menu.outline", "Gliederung"),
                    icon: <ListTree size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.chapter", "Kapitel"),
            items: [
                {
                    id: "new-chapter",
                    label: t("ui.editor_menu.new_chapter", "Neues Kapitel"),
                    icon: <Plus size={16} />,
                },
                {
                    id: "chapter-from-template",
                    label: t("ui.editor_menu.chapter_from_template", "Kapitel aus Vorlage"),
                    icon: <FilePlus2 size={16} />,
                },
                { separator: true },
                {
                    id: "save-as-template",
                    label: t("ui.editor_menu.save_as_template", "Als Buchvorlage speichern"),
                    icon: <BookmarkPlus size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.tools", "Werkzeuge"),
            items: [
                {
                    id: "validate-toc",
                    label: t("ui.editor_menu.validate_toc", "Inhaltsverzeichnis prüfen"),
                    icon: <ListChecks size={16} />,
                },
                { separator: true },
                {
                    id: "git-backup",
                    label: t("ui.editor_menu.git_backup", "Git-Sicherung"),
                    icon: <GitBranch size={16} />,
                },
                {
                    id: "git-sync",
                    label: t("ui.editor_menu.git_sync", "Git-Synchronisierung"),
                    icon: <RefreshCw size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.help", "Hilfe"),
            items: [
                {
                    id: "shortcuts",
                    label: t("ui.editor_menu.shortcuts", "Tastaturkürzel"),
                    icon: <Keyboard size={16} />,
                    shortcut: "Ctrl+?",
                },
                {
                    id: "help",
                    label: t("ui.editor_menu.help_page", "Hilfe"),
                    icon: <CircleHelp size={16} />,
                },
            ],
        },
    ];

    const onAction = (actionId: string) => {
        switch (actionId) {
            case "export":
                onExport();
                break;
            case "metadata":
                openView(() => setShowMetadata(true));
                break;
            case "storyboard":
                openView(() => {
                    setShowMetadata(false);
                    setShowStoryboard(true);
                });
                break;
            case "story-bible":
                openStoryBible();
                closeSidebarOnNarrow();
                break;
            case "relationships":
                openView(() => setShowRelationships(true));
                break;
            case "outline":
                openView(() => setShowOutline(true));
                break;
            case "new-chapter":
                onAddChapter("chapter");
                break;
            case "chapter-from-template":
                onAddFromTemplate();
                break;
            case "save-as-template":
                onSaveAsTemplate();
                break;
            case "validate-toc":
                void onValidateToc();
                break;
            case "git-backup":
                navigate(`/books/${bookId}/git-backup`);
                break;
            case "git-sync":
                navigate(`/books/${bookId}/git-sync`);
                break;
            case "shortcuts":
                navigate("/help/shortcuts");
                break;
            case "help":
                navigate("/help");
                break;
        }
    };

    return { groups, disabled, onAction };
}
