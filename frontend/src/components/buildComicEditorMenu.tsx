import { type NavigateFunction } from "react-router-dom";
import {
    CircleHelp,
    FileText,
    Keyboard,
    LayoutDashboard,
    LayoutGrid,
    Plus,
    SquarePlus,
    Trash2,
} from "lucide-react";

import { type BuiltEditorMenu } from "../pages/buildArticleEditorMenu";
import { type EditorMenuGroup } from "../lib/components/EditorMenu";

type TranslateFn = (key: string, fallback?: string) => string;

/**
 * Everything the structured comic-editor menu needs. The ComicBookEditor owns
 * the page/panel handlers + selection flags and passes them in, mirroring
 * `buildBookEditorMenu`. The Ansicht items appear only when the corresponding
 * view callback is provided.
 */
export interface ComicEditorMenuDeps {
    t: TranslateFn;
    navigate: NavigateFunction;
    onShowMetadata?: () => void;
    onShowStoryboard?: () => void;
    onAddPage: () => void;
    onDeletePage: () => void;
    onAddPanel: () => void;
    onDeletePanel: () => void;
    /** A page is active (delete-page / panel actions need one). */
    hasActivePage: boolean;
    /** A page is active and below the panel capacity. */
    canAddPanel: boolean;
    /** A panel is selected (delete-panel needs one). */
    hasSelectedPanel: boolean;
}

/**
 * Build the comic editor's structured menu (groups + disabled map + dispatcher).
 *
 * Comic-specific Panel group (new/delete panel) sits next to the shared Ansicht
 * (Metadaten / Storyboard), Seite (new/delete page) and Hilfe groups. Actions
 * that need a target degrade to disabled-with-reason rather than vanishing, so
 * an editor with no page or no selected panel shows the items greyed out with a
 * tooltip — never a half-wired no-op. The same generic `EditorMenu` renders it.
 */
export function buildComicEditorMenu(deps: ComicEditorMenuDeps): BuiltEditorMenu {
    const {
        t,
        navigate,
        onShowMetadata,
        onShowStoryboard,
        onAddPage,
        onDeletePage,
        onAddPanel,
        onDeletePanel,
        hasActivePage,
        canAddPanel,
        hasSelectedPanel,
    } = deps;

    const noPage = t("ui.editor_menu.disabled_no_page", "Keine Seite vorhanden");
    const noPanel = t("ui.editor_menu.disabled_no_panel", "Kein Panel ausgewählt");
    const panelFull = t("ui.editor_menu.disabled_panel_full", "Panel-Limit erreicht");

    const disabled: Record<string, string> = {};
    if (!hasActivePage) disabled["delete-page"] = noPage;
    if (!canAddPanel) disabled["add-panel"] = hasActivePage ? panelFull : noPage;
    if (!hasSelectedPanel) disabled["delete-panel"] = noPanel;

    const viewItems = [
        ...(onShowMetadata
            ? [
                  {
                      id: "metadata",
                      label: t("ui.editor_menu.metadata", "Metadaten"),
                      icon: <FileText size={16} />,
                  },
              ]
            : []),
        ...(onShowStoryboard
            ? [
                  {
                      id: "storyboard",
                      label: t("ui.editor_menu.storyboard", "Storyboard"),
                      icon: <LayoutDashboard size={16} />,
                  },
              ]
            : []),
    ];

    const groups: EditorMenuGroup[] = [
        ...(viewItems.length > 0
            ? [{ label: t("ui.editor_menu.view", "Ansicht"), items: viewItems }]
            : []),
        {
            label: t("ui.editor_menu.page", "Seite"),
            items: [
                {
                    id: "add-page",
                    label: t("ui.editor_menu.new_page", "Neue Seite"),
                    icon: <Plus size={16} />,
                },
                {
                    id: "delete-page",
                    label: t("ui.editor_menu.delete_page", "Seite löschen"),
                    icon: <Trash2 size={16} />,
                },
            ],
        },
        {
            label: t("ui.editor_menu.panel", "Panel"),
            items: [
                {
                    id: "add-panel",
                    label: t("ui.editor_menu.new_panel", "Neues Panel"),
                    icon: <SquarePlus size={16} />,
                },
                {
                    id: "delete-panel",
                    label: t("ui.editor_menu.delete_panel", "Panel löschen"),
                    icon: <LayoutGrid size={16} />,
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
            case "metadata":
                onShowMetadata?.();
                break;
            case "storyboard":
                onShowStoryboard?.();
                break;
            case "add-page":
                onAddPage();
                break;
            case "delete-page":
                onDeletePage();
                break;
            case "add-panel":
                onAddPanel();
                break;
            case "delete-panel":
                onDeletePanel();
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
