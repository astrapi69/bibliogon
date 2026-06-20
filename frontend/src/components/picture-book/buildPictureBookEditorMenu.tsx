import { type NavigateFunction } from "react-router-dom";
import { CircleHelp, FileText, Keyboard, LayoutDashboard, Plus, Trash2 } from "lucide-react";

import { type BuiltEditorMenu } from "../../pages/buildArticleEditorMenu";
import { type EditorMenuGroup } from "../../lib/components/EditorMenu";

type TranslateFn = (key: string, fallback?: string) => string;

/**
 * Everything the structured picture-book-editor menu needs. The PageEditor owns
 * the page handlers + active-page flag and passes them in, mirroring
 * `buildBookEditorMenu`. The Ansicht items appear only when the corresponding
 * view callback is provided.
 *
 * Per-page Layout switching is intentionally NOT mirrored here: it lives in the
 * editor's dedicated LayoutPicker (a rich 13-layout, 5-category surface) and a
 * menu duplicate would have to re-derive that catalogue. The Seite group covers
 * page add/delete; layout stays with the picker.
 */
export interface PictureBookEditorMenuDeps {
    t: TranslateFn;
    navigate: NavigateFunction;
    onShowMetadata?: () => void;
    onShowStoryboard?: () => void;
    onAddPage: () => void;
    onDeletePage: () => void;
    /** A page is active (delete-page needs one). */
    hasActivePage: boolean;
}

/**
 * Build the picture-book editor's structured menu (groups + disabled map +
 * dispatcher). Seite (new/delete page) is the type-specific group; Ansicht
 * (Metadaten / Storyboard) and Hilfe are shared. Delete-page degrades to
 * disabled-with-reason when no page is active. The generic `EditorMenu` renders
 * it.
 */
export function buildPictureBookEditorMenu(deps: PictureBookEditorMenuDeps): BuiltEditorMenu {
    const { t, navigate, onShowMetadata, onShowStoryboard, onAddPage, onDeletePage, hasActivePage } =
        deps;

    const disabled: Record<string, string> = {};
    if (!hasActivePage) {
        disabled["delete-page"] = t("ui.editor_menu.disabled_no_page", "Keine Seite vorhanden");
    }

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
