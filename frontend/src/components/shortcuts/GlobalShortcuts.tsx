/**
 * App-global keyboard shortcuts + the shortcuts overview dialog (#662).
 *
 * Mounted inside the provider tree (it needs i18n + the router) so the
 * `Ctrl+S` reminder toast can be localized and the route can be inspected
 * for editor-scope. Registers the global combos and owns the dialog's open
 * state.
 *
 * Combos:
 *   - Ctrl+/ or ?  -> toggle the shortcuts overview dialog
 *   - Ctrl+S       -> suppress the browser save dialog + remind that
 *                     auto-save is active (the app saves continuously)
 *   - Alt+Z        -> toggle word wrap (handled by useWordWrap)
 */
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "../../hooks/useI18n";
import { useWordWrap } from "../../hooks/editor/useWordWrap";
import {
    useKeyboardShortcuts,
    type Shortcut,
} from "../../hooks/ui/useKeyboardShortcuts";
import { notify } from "../../utils/platform/notify";
import ShortcutsDialog from "./ShortcutsDialog";

/** Editor routes carry the document-editing surface (prose / picture-book /
 *  comic via /book/:id, and the article editor via /articles/:id). The
 *  /articles list, create, and import routes are NOT editor scope. */
function isEditorRoute(pathname: string): boolean {
    if (pathname.startsWith("/book/")) return true;
    if (/^\/articles\/[^/]+/.test(pathname)) {
        return (
            !pathname.startsWith("/articles/new") &&
            !pathname.startsWith("/articles/import")
        );
    }
    return false;
}

export default function GlobalShortcuts() {
    const { t } = useI18n();
    const location = useLocation();
    const { toggle: toggleWordWrap } = useWordWrap();
    const [open, setOpen] = useState(false);

    const editorScope = isEditorRoute(location.pathname);

    const shortcuts = useMemo<Shortcut[]>(
        () => [
            {
                keys: "ctrl+/",
                handler: () => setOpen((v) => !v),
                label: "Show shortcuts",
            },
            {
                keys: "?",
                handler: () => setOpen((v) => !v),
                label: "Show shortcuts",
            },
            {
                keys: "ctrl+s",
                handler: () =>
                    notify.info(
                        t("ui.shortcuts.save_note", "Auto-Speichern ist aktiv"),
                    ),
                label: "Save (auto-save active)",
            },
            { keys: "alt+z", handler: toggleWordWrap, label: "Toggle word wrap" },
        ],
        [toggleWordWrap, t],
    );
    useKeyboardShortcuts(shortcuts);

    return (
        <ShortcutsDialog
            open={open}
            onOpenChange={setOpen}
            editorScope={editorScope}
        />
    );
}
